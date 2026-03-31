import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { rateLimit, getIP } from "@/lib/rate-limit";
import { createPlanDates, getStoredBillingCycle, getPlanCreditLimit, getPlanLocationLimit, isPlanId } from "@/lib/shared/plan-config";
import type { BillingCycle } from "@/lib/shared/plan-config";

const limiter = rateLimit({ interval: 60_000, limit: 10 });

type OnboardingBody = {
  companyName?: string;
  websiteUrl?: string;
  useCase?: string;
  goals?: string[];
  source?: string;
  sourceOtherText?: string;
  selectedPlan?: string;
  billingCycle?: string;
  paymentCompleted?: boolean;
  paidAmountCents?: number | null;
};

const VALID_USE_CASES = new Set(["own_business", "single_client", "multiple_clients"]);
const VALID_SOURCES = new Set(["google-search", "youtube", "ai-assistant", "word-of-mouth", "marketplace", "other"]);
const VALID_PLANS = new Set(["free", "starter", "growth", "agency"]);
const VALID_BILLING_CYCLES = new Set(["monthly", "yearly"]);

function sanitizeOnboardingBody(raw: OnboardingBody) {
  const str = (v: unknown, maxLen = 500): string | null => {
    if (typeof v !== "string") return null;
    const trimmed = v.trim().slice(0, maxLen);
    return trimmed || null;
  };

  return {
    company_name: str(raw.companyName, 200),
    website_url: str(raw.websiteUrl, 500),
    use_case: VALID_USE_CASES.has(raw.useCase ?? "") ? raw.useCase! : null,
    goals: Array.isArray(raw.goals)
      ? raw.goals.filter((g): g is string => typeof g === "string" && g.trim().length > 0).slice(0, 20)
      : [],
    source: VALID_SOURCES.has(raw.source ?? "") ? raw.source! : null,
    source_other_text: raw.source === "other" ? str(raw.sourceOtherText, 500) : null,
    selected_plan: VALID_PLANS.has(raw.selectedPlan ?? "") ? raw.selectedPlan! : null,
    billing_cycle: VALID_BILLING_CYCLES.has(raw.billingCycle ?? "") ? raw.billingCycle! : null,
    payment_completed: typeof raw.paymentCompleted === "boolean" ? raw.paymentCompleted : false,
    paid_amount_cents:
      typeof raw.paidAmountCents === "number" && raw.paidAmountCents >= 0
        ? Math.floor(raw.paidAmountCents)
        : null,
  };
}

export async function POST(request: Request) {
  const { success } = limiter.check(getIP(request));
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as OnboardingBody;
    const dbRow = sanitizeOnboardingBody(body);

    const adminClient = await createAdminClient();

    // Upsert onboarding responses (non-blocking — log errors but don't fail the request)
    const { error: upsertError } = await adminClient
      .from("onboarding_responses")
      .upsert(
        {
          user_id: user.id,
          email: user.email ?? null,
          ...dbRow,
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("Failed to upsert onboarding_responses:", upsertError);
    }

    // Upsert subscription_plans with AI credits for the selected plan
    const planId = dbRow.selected_plan;
    if (planId && isPlanId(planId)) {
      const cycle = (dbRow.billing_cycle as BillingCycle) || "monthly";
      const { startDate, endDate } = createPlanDates(planId, cycle);

      const subscriptionRow: Record<string, unknown> = {
        user_id: user.id,
        email: user.email ?? null,
        plan_type: planId,
        max_locations: getPlanLocationLimit(planId),
        billing_cycle: getStoredBillingCycle(planId, cycle),
        status: planId === "free" ? "trial" : "active",
        current_period_start: startDate.toISOString(),
        current_period_end: endDate.toISOString(),
        total_ai_credits: getPlanCreditLimit(planId),
        ai_credits_used: 0,
        ai_credits_refreshed_at: new Date().toISOString(),
      };

      if (dbRow.payment_completed && dbRow.paid_amount_cents) {
        subscriptionRow.amount_paid_cents = dbRow.paid_amount_cents;
      } else {
        subscriptionRow.amount_paid_cents = 0;
        subscriptionRow.payment_currency = "USD";
      }

      const { error: subError } = await adminClient
        .from("subscription_plans")
        .upsert(subscriptionRow, { onConflict: "user_id" });

      if (subError) {
        console.error("Failed to upsert subscription_plans:", subError);
      }
    }

    // Mark onboarding completed in user_profiles (critical path)
    const { error: updateError } = await adminClient
      .from("user_profiles")
      .update({ onboarding_completed: true })
      .eq("id", user.id);

    if (updateError) {
      console.error("Failed to mark onboarding completed:", updateError);
      return NextResponse.json(
        { error: "Failed to update onboarding status" },
        { status: 500 }
      );
    }

    return NextResponse.json({ completed: true });
  } catch (error) {
    console.error("complete-onboarding failed:", error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
