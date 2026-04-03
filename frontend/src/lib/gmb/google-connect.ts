import type { SupabaseClient } from "@supabase/supabase-js";

const GOOGLE_SCOPES =
  "https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";

function getGoogleBackendBaseUrl() {
  const value = process.env.NEXT_PUBLIC_GMB_BACKEND_URL?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

async function startBackendGoogleConnect(
  supabase: SupabaseClient,
  nextPath: string
) {
  const backendUrl = getGoogleBackendBaseUrl();
  if (!backendUrl) return false;

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("Session expired. Please sign in again.");
  }

  const response = await fetch(
    `${backendUrl}/auth/google/url?next=${encodeURIComponent(nextPath)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );

  if (!response.ok) {
    const fallbackMessage = "Unable to start Google connection.";
    try {
      const payload = (await response.json()) as { detail?: string };
      throw new Error(payload.detail || fallbackMessage);
    } catch {
      throw new Error(fallbackMessage);
    }
  }

  const payload = (await response.json()) as { authorization_url?: string };
  if (!payload.authorization_url) {
    throw new Error("Google authorization URL was not returned.");
  }

  window.location.assign(payload.authorization_url);
  return true;
}

export async function startGoogleConnectFlow({
  supabase,
  nextPath,
  flow = "connect-google",
}: {
  supabase: SupabaseClient;
  nextPath: string;
  flow?: "login" | "connect-google";
}) {
  const startedWithBackend = await startBackendGoogleConnect(supabase, nextPath);
  if (startedWithBackend) return;

  const callbackUrl = new URL("/routes/callback_routes", window.location.origin);
  callbackUrl.searchParams.set("flow", flow);
  callbackUrl.searchParams.set("next", nextPath);

  const { error: oauthError } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: GOOGLE_SCOPES,
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
}

