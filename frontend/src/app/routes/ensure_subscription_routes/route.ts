import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { createPlanDates, getStoredBillingCycle, FREE_PLAN_DEFAULTS } from "@/lib/shared/plan-config";
import { rateLimit, getIP } from "@/lib/rate-limit";

const limiter = rateLimit({ interval: 60_000, limit: 5 });

export async function POST(request: Request) {
  const { success } = limiter.check(getIP(request));
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  try {
    const supabase = await createClient();
    const adminClient = await createAdminClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await adminClient.from("user_profiles").upsert(
      {
        id: user.id,
        email: user.email ?? null,
      },
      { onConflict: "id" }
    );

    const { data: existingSubscription, error: lookupError } = await adminClient
      .from("subscription_plans")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json(
        { error: "Failed to check existing subscription" },
        { status: 500 }
      );
    }

    if (existingSubscription) {
      return NextResponse.json({ created: false });
    }

    const { startDate, endDate } = createPlanDates("free", "monthly");

    const { error: insertError } = await adminClient.from("subscription_plans").insert({
      user_id: user.id,
      email: user.email ?? null,
      plan_type: "free",
      max_locations: FREE_PLAN_DEFAULTS.maxLocations,
      billing_cycle: getStoredBillingCycle("free", "monthly"),
      status: "trial",
      amount_paid_cents: 0,
      payment_currency: "USD",
      current_period_start: startDate.toISOString(),
      current_period_end: endDate.toISOString(),
      total_ai_credits: FREE_PLAN_DEFAULTS.AiCredits,
      ai_credits_used: 0,
      ai_credits_refreshed_at: new Date().toISOString(),
    });

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to create default subscription" },
        { status: 500 }
      );
    }

    return NextResponse.json({ created: true });
  } catch (error) {
    console.error("ensure-subscription failed:", error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
