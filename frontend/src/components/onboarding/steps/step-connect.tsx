import { ArrowRight, CheckCircle2, Link2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type StepConnectProps = {
  email: string | null;
  isGoogleConnected: boolean;
  isGoogleLoading: boolean;
  googleError: string | null;
  onConnectGoogle: () => Promise<void>;
  onGoToDashboard: () => void;
};

export function StepConnect({
  email,
  isGoogleConnected,
  isGoogleLoading,
  googleError,
  onConnectGoogle,
  onGoToDashboard,
}: StepConnectProps) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-reply-purple">Final Step</p>
        <h1 className="mt-2 text-3xl font-bold text-reply-navy">Connect With</h1>
        <p className="mt-3 text-base text-reply-muted">
          Connect your Google account to sync your Google Business Profile and reviews.
        </p>
      </div>

      <div className="mx-auto mt-8 w-full max-w-[48rem] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-reply-muted">
              Connect Option
            </p>
            <h2 className="flex items-center gap-2 text-xl font-bold text-reply-navy">
              <GoogleMark />
              Google Business Profile
            </h2>
            <p className="max-w-lg text-sm leading-6 text-reply-muted">
              Grant one-time access so Cradible5 can sync locations, reviews, and future updates.
            </p>
            {email && (
              <p className="inline-flex items-center gap-1 text-xs text-reply-muted">
                <Link2 className="h-3.5 w-3.5" />
                Signing in as {email}
              </p>
            )}
          </div>

          <div className="w-full sm:w-auto">
            {isGoogleConnected ? (
              <Button
                type="button"
                onClick={onGoToDashboard}
                className="h-11 w-full rounded-xl bg-reply-green px-5 text-white hover:bg-reply-green/90"
              >
                <CheckCircle2 className="h-4 w-4" />
                Connected - Go to Dashboard
              </Button>
            ) : (
              <Button
                type="button"
                disabled={isGoogleLoading}
                onClick={onConnectGoogle}
                className="h-11 w-full rounded-xl bg-reply-navy px-5 text-white hover:bg-reply-navy/90"
              >
                {isGoogleLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  <>
                    Connect Google
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {googleError && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {googleError}
        </p>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a6 6 0 0 1-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09a6.9 6.9 0 0 1 0-4.18V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
