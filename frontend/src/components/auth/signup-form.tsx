"use client";

import { cn } from "@/lib/shared/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Lock, Mail } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getFriendlyAuthErrorMessage } from "@/lib/auth/auth-error-message";

export function SignupForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan");
  const billingParam = searchParams.get("billing");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const supabase = createClient();
    setIsLoading(true);
    setError(null);
    setInfo(null);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) throw signUpError;

      // Seed free subscription row for new password-based accounts.
      let session = data.session;
      if (!session) {
        // If there's no session, it means Supabase requires email confirmation.
        setInfo("Account created! Please check your email to confirm your account.");
        return;
      }

      // Seed free subscription row for new password-based accounts.
      const bootstrapResponse = await fetch("/routes/ensure_subscription_routes", {
        method: "POST",
      });

      if (!bootstrapResponse.ok) {
        throw new Error("Failed to initialize account subscription.");
      }

      const onboardingUrl = new URL("/onboarding", window.location.origin);
      if (planParam) onboardingUrl.searchParams.set("plan", planParam);
      if (billingParam) onboardingUrl.searchParams.set("billing", billingParam);
      router.push(onboardingUrl.pathname + onboardingUrl.search);
      router.refresh();
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Unable to create your account"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    const supabase = createClient();
    setIsGoogleLoading(true);
    setError(null);
    setInfo(null);

    try {
      const onboardingPath = new URL("/onboarding", window.location.origin);
      if (planParam) onboardingPath.searchParams.set("plan", planParam);
      if (billingParam) onboardingPath.searchParams.set("billing", billingParam);

      const callbackUrl = new URL("/routes/callback_routes", window.location.origin);
      callbackUrl.searchParams.set("next", onboardingPath.pathname + onboardingPath.search);

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes:
            "https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
          redirectTo: callbackUrl.toString(),
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (oauthError) throw oauthError;
    } catch (unknownError) {
      setError(getFriendlyAuthErrorMessage(unknownError, "Unable to sign in with Google"));
      setIsGoogleLoading(false);
    }
  };

  return (
    <div
      className={cn("flex flex-col items-center gap-8 w-full max-w-md mx-auto", className)}
      {...props}
    >
      <div className="w-full rounded-3xl border border-gray-200 bg-white p-8 shadow-xl">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-reply-navy">Create your account</h2>
          <p className="mt-2 text-reply-muted">
            Start with email and password, then connect Google once to finish setup.
          </p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {info && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{info}</span>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="signup-email" className="text-sm font-medium text-reply-navy">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-reply-muted" />
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="h-11 w-full rounded-xl border border-gray-200 pl-10 pr-3 focus:border-reply-purple focus:outline-none"
                placeholder="you@company.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="signup-password" className="text-sm font-medium text-reply-navy">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-reply-muted" />
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                className="h-11 w-full rounded-xl border border-gray-200 pl-10 pr-3 focus:border-reply-purple focus:outline-none"
                placeholder="At least 8 characters"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="signup-confirm-password"
              className="text-sm font-medium text-reply-navy"
            >
              Confirm password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-reply-muted" />
              <input
                id="signup-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
                className="h-11 w-full rounded-xl border border-gray-200 pl-10 pr-3 focus:border-reply-purple focus:outline-none"
                placeholder="Re-enter your password"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="h-12 w-full bg-reply-navy text-white font-semibold hover:bg-reply-navy/90"
          >
            {isLoading ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-100" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-reply-muted">Or</span>
          </div>
        </div>

        <form onSubmit={handleGoogleSignIn} className="space-y-4">
          <Button
            type="submit"
            disabled={isGoogleLoading}
            className="flex h-12 w-full items-center justify-center gap-3 border border-gray-200 bg-white font-semibold text-reply-navy hover:bg-gray-50"
          >
            {!isGoogleLoading && (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
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
            {isGoogleLoading ? "Redirecting..." : "Continue with Google"}
          </Button>
        </form>

        <div className="mt-6 border-t border-gray-100 pt-4 text-center text-sm text-reply-muted">
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="font-semibold text-reply-purple transition-colors hover:text-reply-purple/80"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
