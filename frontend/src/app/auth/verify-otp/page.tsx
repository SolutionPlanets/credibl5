"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Lock, AlertCircle, ArrowLeft, KeyRound } from "lucide-react";
import Link from "next/link";
import { AuthPageShell } from "@/components/marketing/auth-page-shell";

export default function VerifyOtpPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialEmail = searchParams.get("email") || "";

  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!initialEmail) {
      router.push("/auth/create-password");
    }
  }, [initialEmail, router]);

  const handleVerifyOTPAndSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      // 1. Verify OTP (type 'recovery' matches resetPasswordForEmail)
      const { error: otpError } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "recovery",
      });

      if (otpError) throw otpError;

      // 2. Set new password for the current session (verifyOtp logs user in)
      const { data: { user }, error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) throw updateError;
      if (!user) throw new Error("User session not found after verification");

      // 3. Update has_password flag and password in user_profiles
      const { error: profileError } = await supabase
        .from("user_profiles")
        .update({ 
          has_password: true,
          password: password // Saved for check purpose as requested
        })
        .eq("id", user.id); // Use ID instead of email for better RLS compatibility

      if (profileError) {
        console.error("Failed to update profile info:", {
          message: profileError.message,
          details: profileError.details,
          hint: profileError.hint,
          code: profileError.code
        });
        // We still consider it a success if password was set in Auth, just log the error.
      }

      router.push("/protected?password_created=true");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify OTP or set password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthPageShell
      title="Verify Identity"
      subtitle="Enter the OTP from your email and set your new account password."
      benefits={[
        "Instant account access after verification",
        "Encrypted password storage via Supabase",
        "Enable multi-method login for your account",
      ]}
    >
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-3xl shadow-xl p-8 md:p-10">
        <div className="mb-6">
          <Link
            href="/auth/create-password"
            className="inline-flex items-center gap-2 text-sm font-semibold text-reply-muted hover:text-reply-navy transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </div>

        <form onSubmit={handleVerifyOTPAndSetPassword} className="space-y-4">
          {/* Hidden email field to help browser password managers identify the correct username */}
          <input 
            type="email" 
            name="email" 
            value={email} 
            readOnly 
            autoComplete="email" 
            className="hidden" 
          />
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="otp" className="text-sm font-medium text-reply-navy">
              OTP Code (check your email)
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-reply-muted" />
              <input
                id="otp"
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
                className="w-full h-11 pl-10 pr-3 rounded-xl border border-gray-200 focus:border-reply-purple focus:outline-none"
                placeholder="6-digit code"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-reply-navy">
              New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-reply-muted" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full h-11 pl-10 pr-3 rounded-xl border border-gray-200 focus:border-reply-purple focus:outline-none"
                placeholder="At least 8 characters"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-reply-navy">
              Confirm New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-reply-muted" />
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full h-11 pl-10 pr-3 rounded-xl border border-gray-200 focus:border-reply-purple focus:outline-none"
                placeholder="Re-enter password"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 bg-reply-navy text-white hover:bg-reply-navy/90 font-semibold"
          >
            {isLoading ? "Verifying..." : "Verify and Set Password"}
          </Button>
        </form>
      </div>
    </AuthPageShell>
  );
}
