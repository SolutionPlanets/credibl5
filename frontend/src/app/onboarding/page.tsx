import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewUserOnboarding } from "@/components/onboarding/new-user-onboarding";
import type { BillingCycle, PlanId } from "@/lib/shared/plan-config";

type OnboardingPageProps = {
  searchParams?:
    | {
        google?: string | string[];
        plan?: string | string[];
        billing?: string | string[];
      }
    | Promise<{
        google?: string | string[];
        plan?: string | string[];
        billing?: string | string[];
      }>;
};

function getSingleQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const VALID_PLANS = new Set<string>(["free", "starter", "growth", "agency"]);
const VALID_BILLING = new Set<string>(["monthly", "yearly"]);

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/auth/login");
  }

  const { data: profileData } = await supabase
    .from("user_profiles")
    .select("google_connected_at, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  const resolvedSearchParams = (await searchParams) ?? {};
  const googleState = getSingleQueryValue(resolvedSearchParams.google);
  const isGoogleConnected = Boolean(profileData?.google_connected_at);
  const onboardingCompleted = Boolean(profileData?.onboarding_completed);

  if (onboardingCompleted && googleState !== "connected") {
    redirect("/protected");
  }

  const rawPlan = getSingleQueryValue(resolvedSearchParams.plan);
  const rawBilling = getSingleQueryValue(resolvedSearchParams.billing);
  const preselectedPlan = rawPlan && VALID_PLANS.has(rawPlan) ? (rawPlan as PlanId) : undefined;
  const preselectedBilling = rawBilling && VALID_BILLING.has(rawBilling) ? (rawBilling as BillingCycle) : undefined;

  return (
    <NewUserOnboarding
      initialEmail={user.email ?? null}
      initialGoogleConnected={isGoogleConnected}
      googleState={googleState}
      preselectedPlan={preselectedPlan}
      preselectedBilling={preselectedBilling}
    />
  );
}
