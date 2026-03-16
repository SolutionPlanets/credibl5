"use client";

import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { startGoogleConnectFlow } from "@/lib/gmb/google-connect";
import { getFriendlyAuthErrorMessage } from "@/lib/auth/auth-error-message";

export function GMBStatusAlert() {
  const [hasRefreshToken, setHasRefreshToken] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

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
        // We don't show a hard error here to avoid blocking the UI
      } finally {
        setLoading(false);
      }
    }

    checkStatus();
  }, []);

  const handleReconnect = async () => {
    setError(null);
    setIsConnecting(true);
    try {
      const supabase = createClient();
      await startGoogleConnectFlow({ supabase, nextPath: "/protected" });
    } catch (err) {
      setError(getFriendlyAuthErrorMessage(err, "Unable to start Google connection flow."));
      setIsConnecting(false);
    }
  };

  if (loading || hasRefreshToken !== false) {
    return null;
  }

  return (
    <div className="space-y-4">
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
      {error && (
        <p className="px-2 text-xs text-red-600 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}
