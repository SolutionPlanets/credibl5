"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Lock, Mail } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function SignupForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

      // Some Supabase projects require email verification before first session.
      if (!data.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          setInfo(
            "Account created. Please verify your email, then sign in to continue."
          );
          return;
        }
      }

      // Seed free subscription row for new password-based accounts.
      const bootstrapResponse = await fetch("/api/auth/ensure-subscription", {
        method: "POST",
      });

      if (!bootstrapResponse.ok) {
        throw new Error("Failed to initialize account subscription.");
      }

      // One-time Google Business connection during onboarding.
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("flow", "connect-google");
      callbackUrl.searchParams.set("next", "/protected");

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

      if (oauthError) {
        throw oauthError;
      }
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
