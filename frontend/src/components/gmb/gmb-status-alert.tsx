"use client";

import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw, CheckCircle2, ChevronDown, ChevronUp, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { startGoogleConnectFlow } from "@/lib/gmb/google-connect";
import { getFriendlyAuthErrorMessage } from "@/lib/auth/auth-error-message";

interface GMBStatusAlertProps {
  googleState?: string;
}

export function GMBStatusAlert({ googleState }: GMBStatusAlertProps) {
  const [hasRefreshToken, setHasRefreshToken] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showSuccess, setShowSuccess] = useState(googleState === "connected");

  useEffect(() => {
    async function checkStatus() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          setLoading(false);
          return;
        }

        const response = await fetch(`${process.env.NEXT_PUBLIC_GMB_BACKEND_URL}/auth/google/status`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch GMB status");
        }

        const data = await response.json();
        setHasRefreshToken(data.has_refresh_token);
      } catch (err) {
        console.error("GMB status check error:", err);
      } finally {
        setLoading(false);
      }
    }

    checkStatus();
  }, []);

  // Handle errors from URL state
  useEffect(() => {
    if (googleState === "missing_refresh_token") {
      setError("Google did not return an offline refresh token.");
      setErrorDetails("This usually happens if you didn't grant all permissions or if the account was already connected but didn't provide a new refresh token. Please try connecting again and ensure you check all checkboxes.");
    } else if (googleState === "save_failed") {
      setError("Could not save your Google connection.");
      setErrorDetails("There was an error on our servers while trying to save your credentials. Please try again in a few minutes.");
    }
  }, [googleState]);

  const handleReconnect = async () => {
    setError(null);
    setErrorDetails(null);
    setIsConnecting(true);
    setShowSuccess(false);
    try {
      const supabase = createClient();
      await startGoogleConnectFlow({ supabase, nextPath: "/protected" });
    } catch (err: any) {
      setError(getFriendlyAuthErrorMessage(err, "Unable to start Google connection flow."));
      setErrorDetails(err?.message || String(err));
      setIsConnecting(false);
    }
  };

  if (loading) return null;

  // Show "Connected" alert if explicitly requested and we have token
  if (showSuccess && hasRefreshToken !== false) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        <span>Google Business account connected successfully.</span>
        <button 
          onClick={() => setShowSuccess(false)}
          className="ml-auto text-emerald-600 hover:text-emerald-800"
        >
          <AlertCircle className="h-4 w-4 rotate-45" /> {/* Close icon substitute or use Lucide X */}
        </button>
      </div>
    );
  }

  // Show "Requires Action" alert if no refresh token
  if (hasRefreshToken === false && !error) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-amber-100 p-2 text-amber-600">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-amber-900 text-base">GMB Connection Requires Action</h3>
            <p className="mt-1 text-sm text-amber-800 leading-relaxed">
              Your Google Business Profile connection is incomplete. We need an offline refresh token 
              to automatically sync your data. Please reconnect to restore full functionality.
            </p>
          </div>
        </div>
        <Button
          onClick={handleReconnect}
          disabled={isConnecting}
          className="h-10 shrink-0 rounded-xl bg-amber-600 font-medium text-white hover:bg-amber-700 shadow-sm transition-all"
        >
          {isConnecting ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Reconnect Now
        </Button>
      </div>
    );
  }

  // Show Error alert with Log option
  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-4 rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <div className="flex items-start justify-between sm:items-center">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-red-100 p-2 text-red-600">
                <XCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-red-900 text-base">Connection Failed</h3>
                <p className="mt-1 text-sm text-red-800 leading-relaxed">
                  {error}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLog(!showLog)}
                className="h-9 rounded-lg border-red-200 bg-white text-red-700 hover:bg-red-50"
              >
                {showLog ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                {showLog ? "Hide Log" : "Show Log"}
              </Button>
              <Button
                onClick={handleReconnect}
                disabled={isConnecting}
                size="sm"
                className="h-9 rounded-lg bg-red-600 font-medium text-white hover:bg-red-700 shadow-sm"
              >
                {isConnecting ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Try Again
              </Button>
            </div>
          </div>
          
          {showLog && (
            <div className="mt-2 rounded-lg bg-slate-900 p-4 font-mono text-xs text-slate-300 overflow-auto max-h-40">
              <p className="font-bold text-red-400 mb-2">Error Detail Log:</p>
              <pre className="whitespace-pre-wrap">{errorDetails || "No additional details available."}</pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
