import { createClient } from "@/lib/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  BillingCycle,
  createPlanDates,
  getPlanLocationLimit,
  getStoredBillingCycle,
} from "@/lib/plan-config";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const error_description = searchParams.get("error_description");
  const next = searchParams.get("next") ?? "/protected";

  // Get proper origin from headers
  const protocol = request.headers.get("x-forwarded-proto") || "http";
  const host = request.headers.get("host") || "localhost:3000";
  const origin = `${protocol}://${host}`;

  // Handle OAuth errors from provider
  if (error) {
    console.error("OAuth Provider Error:", error, error_description);
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(error_description || error)}`
    );
  }

  if (code) {
    const supabase = await createClient();

    // Exchange the code for a session
    const { data, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError || !data.session) {
      console.error("Code exchange error:", exchangeError);
      const errorMsg = exchangeError?.message || "authentication_failed";
      return NextResponse.redirect(
        `${origin}/auth/login?error=${encodeURIComponent(errorMsg)}`
      );
    }

    const user = data.session.user;

    try {
      // Check if user has a subscription
      const { data: subscriptionData, error: subError } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("user_id", user.id)
        .single();

      const isRegisteredUser = !!subscriptionData && !subError;

      // Check for pending signup data in cookies
      const pendingSignup = request.cookies.get("pending_signup")?.value;
      let isSignup = false;
      let signupData: {
        plan?: string;
        billing?: string;
        maxLocations?: number;
      } = {};

      if (pendingSignup) {
        try {
          const parsed = JSON.parse(pendingSignup);
          // Check if signup data is recent (within 10 minutes)
          if (
            parsed.timestamp &&
            Date.now() - parsed.timestamp < 10 * 60 * 1000
          ) {
            isSignup = parsed.isSignup === true;
            signupData = {
              plan: parsed.plan || "free",
              billing: parsed.billing || "monthly",
              maxLocations: parsed.maxLocations || 1,
            };
          }
        } catch (e) {
          console.error("Error parsing signup data:", e);
        }
      }

      if (isSignup) {
        // === SIGNUP FLOW ===
        if (isRegisteredUser) {
          // Already has account, go to dashboard
          const response = NextResponse.redirect(`${origin}/protected`);
          response.cookies.delete("pending_signup");
          return response;
        }

        // New user — create subscription
        const planType = signupData.plan || "free";
        const billingCycle = signupData.billing || "monthly";
        const maxLocations =
          signupData.maxLocations || getPlanLocationLimit(planType);
        const planStatus = planType === "free" ? "trial" : "active";

        const { startDate, endDate } = createPlanDates(
          planType,
          billingCycle as BillingCycle
        );

        const { error: insertError } = await supabase
          .from("subscription_plans")
          .insert({
            user_id: user.id,
            email: user.email,
            plan_type: planType,
            max_locations: maxLocations,
            billing_cycle: getStoredBillingCycle(
              planType,
              billingCycle as BillingCycle
            ),
            status: planStatus,
            current_period_start: startDate.toISOString(),
            current_period_end: endDate.toISOString(),
          });

        if (insertError) {
          console.error("Error creating subscription:", insertError);
          return NextResponse.redirect(
            `${origin}/auth/signup?error=create_failed`
          );
        }

        console.log(
          `Created subscription for ${user.email}: ${planType} (${billingCycle})`
        );
        const response = NextResponse.redirect(
          `${origin}/protected?welcome=true&plan=${planType}`
        );
        response.cookies.delete("pending_signup");
        return response;
      } else {
        // === LOGIN FLOW ===
        if (!isRegisteredUser) {
          // Unregistered user trying to login — redirect to signup
          // This forces consent screen to capture refresh_token
          const response = NextResponse.redirect(
            `${origin}/auth/signup?unregistered=true&email=${encodeURIComponent(user.email || "")}`
          );
          response.cookies.delete("pending_signup");
          return response;
        }

        // Existing user — go to dashboard
        const response = NextResponse.redirect(`${origin}${next}`);
        response.cookies.delete("pending_signup");
        return response;
      }
    } catch (error) {
      console.error("Callback error:", error);
      return NextResponse.redirect(
        `${origin}/auth/login?error=server_error`
      );
    }
  }

  // No code parameter
  return NextResponse.redirect(`${origin}/auth/login?error=no_code`);
}
