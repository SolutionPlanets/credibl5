import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewUserOnboarding } from "@/components/onboarding/new-user-onboarding";

type OnboardingPageProps = {
  searchParams?:
    | {
        google?: string | string[];
      }
    | Promise<{
    google?: string | string[];
      }>;
};

function getSingleQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

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

  if ((onboardingCompleted || isGoogleConnected) && googleState !== "connected") {
    redirect("/protected");
  }

  return (
    <NewUserOnboarding
      initialEmail={user.email ?? null}
      initialGoogleConnected={isGoogleConnected}
      googleState={googleState}
    />
  );
}
