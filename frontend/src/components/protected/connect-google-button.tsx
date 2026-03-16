"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getFriendlyAuthErrorMessage } from "@/lib/auth/auth-error-message";
import { Button } from "@/components/ui/button";
import { startGoogleConnectFlow } from "@/lib/gmb/google-connect";

export function ConnectGoogleButton() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleConnect = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      await startGoogleConnectFlow({
        supabase,
        nextPath: "/protected",
        flow: "connect-google",
      });
    } catch (unknownError) {
      setError(getFriendlyAuthErrorMessage(unknownError, "Unable to start Google connection flow"));
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        onClick={handleConnect}
        disabled={isLoading}
        className="h-11 bg-reply-navy text-white hover:bg-reply-navy/90"
      >
        {isLoading ? "Redirecting..." : "Connect Google Business"}
      </Button>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
