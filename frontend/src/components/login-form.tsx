"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { AlertCircle, X } from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

interface UserNotFoundPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSignUp: () => void;
}

function UserNotFoundPopup({
  isOpen,
  onClose,
  onSignUp,
}: UserNotFoundPopupProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm mx-4 bg-white border border-gray-200 rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-reply-muted hover:text-reply-navy transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-orange-50 border border-orange-100 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-7 h-7 text-orange-500" />
          </div>

          <h3 className="text-xl font-bold text-reply-navy mb-2">
            Account Not Found
          </h3>
          <p className="text-reply-muted text-sm mb-2">
            It looks like you don&apos;t have an account yet.
          </p>
          <p className="text-reply-navy/80 text-xs mb-6 bg-reply-purple/5 p-3 rounded-xl border border-reply-purple/10">
            You need to sign up and choose a plan to get started with Reply
            Pulse.
          </p>

          <div className="flex flex-col gap-3 w-full">
            <Button
              onClick={onSignUp}
              className="w-full h-11 bg-reply-navy text-white font-semibold hover:bg-reply-navy/90 transition-all"
            >
              Create Account
            </Button>
            <button
              onClick={onClose}
              className="text-sm text-reply-muted hover:text-reply-navy transition-colors"
            >
              Try a different account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showNotFoundPopup, setShowNotFoundPopup] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "user_not_found") {
      setShowNotFoundPopup(true);
    } else if (errorParam) {
      const decodedError = decodeURIComponent(errorParam.replace(/\+/g, " "));

      const errorMessages: Record<string, string> = {
        session_failed:
          "Authentication session failed. Please try signing in again.",
        authentication_failed: "Authentication failed. Please try again.",
        access_denied: "Access was denied. Please try again.",
        invalid_request: "Invalid authentication request. Please try again.",
      };

      setError(errorMessages[errorParam] || decodedError);
    }
  }, [searchParams]);

  const handleGoogleSignInClick = async (e: React.FormEvent) => {
    e.preventDefault();

    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes:
            "https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            // NO prompt: "consent" — returning users just pick their account
          },
        },
      });

      if (error) throw error;
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
      setIsLoading(false);
    }
  };

  const handleSignUpRedirect = () => {
    setShowNotFoundPopup(false);
    router.push("/auth/signup");
  };

  return (
    <>
      <UserNotFoundPopup
        isOpen={showNotFoundPopup}
        onClose={() => setShowNotFoundPopup(false)}
        onSignUp={handleSignUpRedirect}
      />

      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <div className="relative w-full max-w-md bg-white border border-gray-200 rounded-3xl shadow-xl p-8 md:p-10 animate-in zoom-in-95 duration-200">
          <div className="flex flex-col items-center mb-8">
            <h2 className="text-3xl font-bold text-reply-navy mb-2 text-center">
              Welcome Back
            </h2>
            <p className="text-reply-muted text-center">
              Sign in to your account to continue
            </p>
          </div>

          <div className="space-y-6">
            <form onSubmit={handleGoogleSignInClick} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm text-center">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-reply-navy text-white hover:bg-reply-navy/90 font-semibold flex items-center justify-center gap-3 border-none transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {!isLoading && (
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
                {isLoading ? "Redirecting..." : "Continue with Google"}
              </Button>
            </form>

            <div className="pt-4 border-t border-gray-100">
              <p className="text-center text-sm text-reply-muted mb-3">
                Don&apos;t have an account?{" "}
                <Link
                  href="/auth/signup"
                  className="text-reply-purple hover:text-reply-purple/80 font-semibold transition-colors"
                >
                  Sign Up
                </Link>
              </p>
              <p className="text-center text-xs text-reply-muted/60">
                By continuing, you agree to Reply Pulse&apos;s{" "}
                <Link
                  href="/terms"
                  className="underline hover:text-reply-navy transition-colors"
                >
                  Terms of Service
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
        </div>
      </div>
    </>
  );
}
