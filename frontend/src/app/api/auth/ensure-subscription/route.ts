import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPlanDates, getStoredBillingCycle } from "@/lib/shared/plan-config";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await supabase.from("user_profiles").upsert(
      {
        id: user.id,
        email: user.email ?? null,
      },
      { onConflict: "id" }
    );

    const { data: existingSubscription, error: lookupError } = await supabase
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

    const { error: insertError } = await supabase.from("subscription_plans").insert({
      user_id: user.id,
      email: user.email,
      plan_type: "free",
      max_locations: 1,
      billing_cycle: getStoredBillingCycle("free", "monthly"),
      status: "trial",
      current_period_start: startDate.toISOString(),
      current_period_end: endDate.toISOString(),
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
