import { LoginForm } from "@/components/login-form";
import { AuthPageShell } from "@/components/marketing/auth-page-shell";
import { Suspense } from "react";

export default function Page() {
  return (
    <AuthPageShell
      title="Welcome back"
      subtitle="Sign in to continue managing reviews, locations, and AI reply workflows."
      benefits={[
        "Sign in with email/password or Google",
        "Google Business connection stays linked",
        "Secure session with seamless dashboard access",
      ]}
    >
      <div className="w-full max-w-md">
        <Suspense
          fallback={
            <div className="text-center text-reply-navy">Loading...</div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </AuthPageShell>
  );
}
