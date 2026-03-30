"use client";

import { cn } from "@/lib/shared/utils";
import { createClient } from "@/lib/supabase/client";
import { getFriendlyAuthErrorMessage } from "@/lib/auth/auth-error-message";
import { Button } from "@/components/ui/button";
import { AlertCircle, Mail, Lock } from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isResendLoading, setIsResendLoading] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (!errorParam) return;

    const decodedError = decodeURIComponent(errorParam.replace(/\+/g, " "));

    const errorMessages: Record<string, string> = {
      session_failed: "Authentication session failed. Please try signing in again.",
      authentication_failed: "Authentication failed. Please try again.",
      oauth_callback_failed: "Google sign-in failed. Please try again.",
      access_denied: "Access was denied. Please try again.",
      invalid_request: "Invalid authentication request. Please try again.",
    };

    setError(errorMessages[errorParam] || decodedError);
    setNotice(null);
  }, [searchParams]);

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    const supabase = createClient();
    setIsPasswordLoading(true);
    setError(null);
    setNotice(null);

    try {
      const gateRes = await fetch("/routes/login_routes", { method: "POST" });
      if (!gateRes.ok) {
        const body = await gateRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Too many login attempts. Please wait before trying again.");
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;

      // Ensure they have a subscription row
      await fetch("/routes/ensure_subscription_routes", {
        method: "POST",
      });

      // Check if user needs onboarding
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("onboarding_completed")
        .eq("id", (await supabase.auth.getUser()).data.user?.id)
        .maybeSingle();

      if (profile?.onboarding_completed) {
        router.push("/protected");
      } else {
        router.push("/onboarding");
      }
      router.refresh();
    } catch (unknownError: any) {
      const errorMessage = unknownError instanceof Error ? unknownError.message : "Unable to sign in";

      // Special handling for "Invalid login credentials" - check if they signed up with Google
      if (errorMessage.toLowerCase().includes("invalid login credentials")) {
        try {
          const res = await fetch("/routes/check_provider_routes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });

          if (res.ok) {
            const { isGoogleUser } = await res.json();
            if (isGoogleUser) {
              setError("This email is registered with Google. Please use 'Continue with Google' to sign in or Create Password.");
              return;
            }
          }
        } catch (checkError) {
          console.error("Error checking user profile:", checkError);
        }
      }

      setError(errorMessage);
    } finally {
      setIsPasswordLoading(false);
    }
  };

  const handleGoogleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    const supabase = createClient();
    setIsGoogleLoading(true);
    setError(null);
    setNotice(null);

    try {
      const callbackUrl = new URL("/routes/callback_routes", window.location.origin);
      callbackUrl.searchParams.set("next", "/protected");

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes:
            "https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
          redirectTo: callbackUrl.toString(),
          queryParams: {
            access_type: "offline",
            prompt: "select_account",
          },
        },
      });

      if (oauthError) throw oauthError;
    } catch (unknownError) {
      setError(getFriendlyAuthErrorMessage(unknownError, "Unable to sign in with Google"));
      setIsGoogleLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      setError("Enter your email first, then resend verification.");
      return;
    }

    const supabase = createClient();
    setIsResendLoading(true);
    setError(null);
    setNotice(null);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/login`,
        },
      });

      if (resendError) throw resendError;

      setNotice("Verification email sent. Please check inbox/spam, then sign in.");
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Unable to resend verification email"
      );
    } finally {
      setIsResendLoading(false);
    }
  };

  const isEmailNotConfirmed = Boolean(
    error && error.toLowerCase().includes("email not confirmed")
  );

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <div className="relative w-full max-w-md bg-white border border-gray-200 rounded-3xl shadow-xl p-8 md:p-10 animate-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center mb-8">
          <h2 className="text-3xl font-bold text-reply-navy mb-2 text-center">
            Welcome Back
          </h2>
          <p className="text-reply-muted text-center">
            Sign in with email/password or continue with Google.
          </p>
        </div>

        <div className="space-y-6">
          <form onSubmit={handlePasswordSignIn} className="space-y-4">
            {error && (
              <div className="space-y-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
                {isEmailNotConfirmed && (
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={isResendLoading}
                    className="text-left text-xs font-semibold underline underline-offset-2 hover:text-red-700 disabled:opacity-60"
                  >
                    {isResendLoading
                      ? "Sending verification email..."
                      : "Resend verification email"}
                  </button>
                )}
              </div>
            )}

            {notice && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">
                {notice}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-reply-navy">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-reply-muted" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="w-full h-11 pl-10 pr-3 rounded-xl border border-gray-200 focus:border-reply-purple focus:outline-none"
                  placeholder="you@company.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-reply-navy">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-reply-muted" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="w-full h-11 pl-10 pr-3 rounded-xl border border-gray-200 focus:border-reply-purple focus:outline-none"
                  placeholder="Enter your password"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isPasswordLoading}
              className="w-full h-12 bg-reply-navy text-white hover:bg-reply-navy/90 font-semibold"
            >
              {isPasswordLoading ? "Signing in..." : "Sign in"}
            </Button>

            <div className="text-right">
              <Link
                href={`/auth/create-password?email=${encodeURIComponent(email)}`}
                className="text-xs font-semibold text-reply-purple hover:underline"
              >
                Forgot or need to create a password?
              </Link>
            </div>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-reply-muted">Or</span>
            </div>
          </div>

          <form onSubmit={handleGoogleSignIn} className="space-y-4">
            <Button
              type="submit"
              disabled={isGoogleLoading}
              className="w-full h-12 bg-white text-reply-navy border border-gray-200 hover:bg-gray-50 font-semibold flex items-center justify-center gap-3"
            >
              {!isGoogleLoading && (
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
              {isGoogleLoading ? "Redirecting..." : "Continue with Google"}
            </Button>
          </form>

          <div className="pt-4 border-t border-gray-100">
            <p className="text-center text-sm text-reply-muted mb-3">
              Don&apos;t have an account?{" "}
              <Link
                href="/auth/signup"
                className="text-reply-purple hover:text-reply-purple/80 font-semibold transition-colors"
              >
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
