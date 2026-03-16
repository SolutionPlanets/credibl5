import { SignupForm } from "@/components/auth/signup-form";
import { AuthPageShell } from "@/components/marketing/auth-page-shell";
import { Suspense } from "react";

export default function Page() {
  return (
    <AuthPageShell
      title="Create your account"
      subtitle="Set up your workspace in minutes with a guided onboarding flow and finish with Google Business connection."
      benefits={[
        "Email/password sign-up with secure session",
        "Guided onboarding pages for company setup",
        "Final Connect With step for Google Business",
      ]}
    >
      <div className="w-full max-w-md">
        <Suspense fallback={<div className="text-center text-reply-navy">Loading...</div>}>
          <SignupForm />
        </Suspense>
      </div>
    </AuthPageShell>
  );
}
