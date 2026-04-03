import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  createPlanDates,
  getStoredBillingCycle,
  isPlanId,
  PLAN_RANK,
  type BillingCycle,
  type PlanId,
} from "@/lib/shared/plan-config";
import { getServerPlanDefinition } from "@/lib/shared/plan-server";
import { rateLimit, getIP } from "@/lib/rate-limit";

const limiter = rateLimit({ interval: 60_000, limit: 5 });

type ChangePlanBody = {
  planType?: PlanId;
  billingCycle?: BillingCycle;
};

function isBillingCycle(value: string | undefined): value is BillingCycle {
  return value === "monthly" || value === "yearly";
}

export async function POST(request: Request) {
  const { success } = limiter.check(getIP(request));
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as ChangePlanBody;
    const requestedPlan = body.planType;
    const requestedCycle = body.billingCycle ?? "monthly";

    if (!isPlanId(requestedPlan)) {
      return NextResponse.json({ error: "Invalid plan type." }, { status: 400 });
    }

    if (!isBillingCycle(requestedCycle)) {
      return NextResponse.json({ error: "Invalid billing cycle." }, { status: 400 });
    }

    const supabase = await createClient();
    const adminClient = await createAdminClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: currentSubscription, error: lookupError } = await adminClient
      .from("subscription_plans")
      .select("plan_type, amount_paid_cents")
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json(
        { error: "Failed to load current subscription." },
        { status: 500 }
      );
    }

    const currentPlan = isPlanId(currentSubscription?.plan_type)
      ? currentSubscription.plan_type
      : "free";

    if (PLAN_RANK[requestedPlan] > PLAN_RANK[currentPlan]) {
      return NextResponse.json(
        { error: "Upgrades require payment checkout." },
        { status: 400 }
      );
    }

    const planDef = await getServerPlanDefinition(requestedPlan);
    const normalizedCycle = requestedPlan === "free" ? "monthly" : requestedCycle;
    const { startDate, endDate } = createPlanDates(requestedPlan, normalizedCycle);
    const isTrialPlan = requestedPlan === "free";

    const { error: upsertError } = await adminClient.from("subscription_plans").upsert(
      {
        user_id: user.id,
        email: user.email ?? null,
        plan_type: requestedPlan,
        max_locations: planDef.maxLocations,
        billing_cycle: getStoredBillingCycle(requestedPlan, normalizedCycle),
        status: isTrialPlan ? "trial" : "active",
        amount_paid_cents: isTrialPlan
          ? 0
          : (currentSubscription?.amount_paid_cents ?? 0),
        payment_currency: "USD",
        current_period_start: startDate.toISOString(),
        current_period_end: endDate.toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (upsertError) {
      return NextResponse.json(
        { error: "Failed to update plan." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      planType: requestedPlan,
      billingCycle: getStoredBillingCycle(requestedPlan, normalizedCycle),
      currentPeriodEnd: endDate.toISOString(),
      message: `Plan updated to ${planDef.name}.`,
    });
  } catch (error) {
    console.error("change-plan failed:", error);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
