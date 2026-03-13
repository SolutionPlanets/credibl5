import { SignupForm } from "@/components/signup-form";
import { AuthPageShell } from "@/components/marketing/auth-page-shell";
import { Suspense } from "react";

export default function Page() {
  return (
    <AuthPageShell
      title="Create your account"
      subtitle="Set up your workspace in minutes and finish with a one-time Google Business connection."
      benefits={[
        "Email/password sign-up with secure session",
        "One-time Google Business permission flow",
        "No repeated reconnect prompts for normal sign-ins",
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
