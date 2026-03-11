"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { CheckCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  BillingCycle,
  PLAN_DEFINITIONS,
  getPlanPrice,
} from "@/lib/plan-config";

interface PlanOption {
  id: string;
  name: string;
  price: number | null;
  period: string;
  features: string[];
  popular: boolean;
  maxLocations: number;
  buttonText: string;
  trialInfo?: string;
}

export function SignupForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const searchParams = useSearchParams();
  const isUnregistered = searchParams.get("unregistered") === "true";
  const [error, setError] = useState<string | null>(
    isUnregistered
      ? "It looks like you haven't selected a plan yet. Please pick one below to finish setting up your account."
      : null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");

  const plans: PlanOption[] = [
    {
      id: PLAN_DEFINITIONS.free.id,
      name: PLAN_DEFINITIONS.free.shortName,
      price: 0,
      period: "",
      trialInfo: PLAN_DEFINITIONS.free.trialInfo,
      features: PLAN_DEFINITIONS.free.signupFeatures,
      popular: false,
      maxLocations: PLAN_DEFINITIONS.free.maxLocations,
      buttonText: "Start Free",
    },
    {
      id: PLAN_DEFINITIONS.starter.id,
      name: PLAN_DEFINITIONS.starter.name,
      price: getPlanPrice("starter", billingCycle),
      period: billingCycle === "monthly" ? "/mo" : "/yr",
      features: PLAN_DEFINITIONS.starter.signupFeatures,
      popular: PLAN_DEFINITIONS.starter.popular ?? false,
      maxLocations: PLAN_DEFINITIONS.starter.maxLocations,
      buttonText: "Select Basic",
    },
    {
      id: PLAN_DEFINITIONS.growth.id,
      name: PLAN_DEFINITIONS.growth.name,
      price: getPlanPrice("growth", billingCycle),
      period: billingCycle === "monthly" ? "/mo" : "/yr",
      features: PLAN_DEFINITIONS.growth.signupFeatures,
      popular: PLAN_DEFINITIONS.growth.popular ?? false,
      maxLocations: PLAN_DEFINITIONS.growth.maxLocations,
      buttonText: "Select Pro",
    },
    {
      id: PLAN_DEFINITIONS.agency.id,
      name: PLAN_DEFINITIONS.agency.name,
      price: null,
      period: "",
      features: PLAN_DEFINITIONS.agency.signupFeatures,
      popular: false,
      maxLocations: PLAN_DEFINITIONS.agency.maxLocations,
      buttonText: "Contact Sales",
    },
  ];

  const handleGoogleSignup = async () => {
    if (!selectedPlan) {
      setError("Please select a plan to continue");
      return;
    }

    if (selectedPlan === "agency") {
      window.location.href =
        "mailto:sales@replypulse.com?subject=Custom%20Plan%20Inquiry";
      return;
    }

    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    const selectedPlanData = plans.find((p) => p.id === selectedPlan);

    try {
      // Step 1: Store plan selection in httpOnly cookie
      const cookieResponse = await fetch("/api/auth/set-signup-cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selectedPlan,
          billing: billingCycle,
          maxLocations: selectedPlanData?.maxLocations || 1,
        }),
      });

      if (!cookieResponse.ok) {
        throw new Error("Failed to store signup data");
      }

      // Step 2: Start OAuth with FORCED consent (guarantees refresh_token)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes:
            "https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent", // FORCES consent screen — guarantees refresh_token
          },
        },
      });

      if (error) throw error;
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
      setIsLoading(false);
    }
  };

  return (
    <div
      className={cn("flex flex-col items-center gap-8", className)}
      {...props}
    >
      {/* Billing Toggle */}
      <div className="inline-flex items-center p-1.5 bg-gray-50 rounded-2xl border border-gray-200 shadow-sm">
        <button
          onClick={() => setBillingCycle("monthly")}
          className={cn(
            "px-5 py-2 rounded-xl text-sm font-medium transition-all",
            billingCycle === "monthly"
              ? "bg-reply-navy text-white shadow-sm"
              : "text-reply-navy/60 hover:text-reply-navy"
          )}
        >
          Monthly
        </button>
        <button
          onClick={() => setBillingCycle("yearly")}
          className={cn(
            "px-5 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2",
            billingCycle === "yearly"
              ? "bg-reply-navy text-white shadow-sm"
              : "text-reply-navy/60 hover:text-reply-navy"
          )}
        >
          Yearly
          <span className="text-xs bg-reply-green text-white px-2 py-0.5 rounded-full font-bold">
            -17%
          </span>
        </button>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 w-full">
        {plans.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          return (
            <div
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              className={cn(
                "relative flex flex-col rounded-[2rem] p-6 cursor-pointer transition-all duration-200 border-2",
                isSelected
                  ? "border-reply-purple bg-reply-purple/5 scale-[1.02] shadow-lg shadow-reply-purple/10"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md",
                plan.popular && !isSelected && "border-reply-purple/40"
              )}
            >
              {(plan.popular || plan.trialInfo) && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span
                    className={cn(
                      "px-3 py-1 text-xs font-bold rounded-full whitespace-nowrap shadow-sm",
                      plan.popular
                        ? "bg-reply-purple text-white"
                        : "bg-reply-green text-white"
                    )}
                  >
                    {plan.popular ? "Most Popular" : plan.trialInfo}
                  </span>
                </div>
              )}

              {isSelected && (
                <div className="absolute top-4 right-4">
                  <div className="w-5 h-5 bg-reply-purple rounded-full flex items-center justify-center">
                    <CheckCircle className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
              )}

              <div className="text-center pt-2 mb-4">
                <h3 className="text-base font-bold text-reply-navy mb-2">
                  {plan.name}
                </h3>
                <div className="flex items-baseline justify-center gap-1">
                  {plan.price !== null ? (
                    <>
                      <span className="text-3xl font-bold text-reply-navy">
                        {plan.price === 0
                          ? "$0"
                          : `$${plan.price.toLocaleString("en-US")}`}
                      </span>
                      {plan.period && (
                        <span className="text-sm text-reply-muted">
                          {plan.period}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-3xl font-bold text-reply-navy">
                      Custom
                    </span>
                  )}
                </div>
              </div>

              <div className="h-px bg-gray-100 mb-4" />

              <ul className="flex-1 space-y-3 mb-5">
                {plan.features.map((feature, j) => (
                  <li
                    key={j}
                    className="flex items-start gap-2 text-sm text-reply-navy/75"
                  >
                    <CheckCircle className="w-4 h-4 text-reply-green shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                className={cn(
                  "w-full py-2.5 rounded-xl text-sm font-semibold transition-all",
                  isSelected
                    ? "bg-reply-purple text-white"
                    : "bg-gray-50 text-reply-navy/80 hover:bg-gray-100 border border-gray-200"
                )}
              >
                {isSelected ? "Selected" : plan.buttonText}
              </button>
            </div>
          );
        })}
      </div>

      {/* Error Message */}
      {error && (
        <div className="w-full max-w-md p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm text-center">
          {error}
        </div>
      )}

      {/* Sign Up CTA */}
      <div className="w-full max-w-md mx-auto flex flex-col items-center gap-4">
        <Button
          onClick={handleGoogleSignup}
          disabled={isLoading || !selectedPlan}
          className={cn(
            "w-full h-12 font-semibold flex items-center justify-center gap-3 rounded-xl transition-all",
            selectedPlan
              ? "bg-reply-navy text-white hover:bg-reply-navy/90 hover:scale-[1.01] active:scale-[0.99]"
              : "bg-gray-100 text-reply-muted cursor-not-allowed"
          )}
        >
          {!isLoading && selectedPlan && (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          )}
          {isLoading
            ? "Connecting to Google..."
            : selectedPlan
              ? "Continue with Google"
              : "Select a plan to continue"}
        </Button>

        <div className="flex items-center gap-2 text-xs text-reply-muted">
          <Sparkles className="w-3 h-3 text-reply-purple" />
          <span>Connects securely to your Google Business Profile</span>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center space-y-2 pt-2">
        <p className="text-sm text-reply-muted">
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="text-reply-purple hover:text-reply-purple/80 font-semibold transition-colors"
          >
            Sign In
          </Link>
        </p>
        <p className="text-xs text-reply-muted/60">
          By signing up, you agree to Reply Pulse&apos;s{" "}
          <Link
            href="/terms"
            className="underline hover:text-reply-navy transition-colors"
          >
            Terms
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="underline hover:text-reply-navy transition-colors"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
