"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Mail, AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AuthPageShell } from "@/components/marketing/auth-page-shell";

export default function CreatePasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(searchParams.get("notice") || null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const supabase = createClient();

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/verify-otp`,
      });

      if (resetError) throw resetError;

      router.push(`/auth/verify-otp?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthPageShell
      title="Create Password"
      subtitle="Verify your identity with an OTP sent to your email to set up a password."
      benefits={[
        "Secure identity verification via OTP",
        "Enable email/password login anytime",
        "Unified access to your account",
      ]}
    >
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-3xl shadow-xl p-8 md:p-10">
        <div className="mb-6">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 text-sm font-semibold text-reply-muted hover:text-reply-navy transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>
        </div>

        <form onSubmit={handleRequestOTP} className="space-y-6">
          <p className="text-sm text-reply-muted">
            Enter your email address and we&apos;ll send you an OTP (One-Time Password) to verify your account and create a new password.
          </p>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-700">
              {notice}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-reply-navy">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-reply-muted" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full h-11 pl-10 pr-3 rounded-xl border border-gray-200 focus:border-reply-purple focus:outline-none"
                placeholder="you@company.com"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 bg-reply-navy text-white hover:bg-reply-navy/90 font-semibold"
          >
            {isLoading ? "Sending OTP..." : "Send Verification OTP"}
          </Button>
        </form>
      </div>
    </AuthPageShell>
  );
}
