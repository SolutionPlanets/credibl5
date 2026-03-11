import { LoginForm } from "@/components/login-form";
import { AuthPageShell } from "@/components/marketing/auth-page-shell";
import { Suspense } from "react";

export default function Page() {
  return (
    <AuthPageShell
      title="Welcome back"
      subtitle="Sign in to your account to continue."
      benefits={[
        "No credit card required to start",
        "Connect Google Business Profile securely",
        "Generate on-brand replies in seconds",
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
