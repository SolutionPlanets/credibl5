import { createAdminClient, createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createPlanDates, getStoredBillingCycle } from "@/lib/shared/plan-config";

type CallbackFlow = "login" | "connect-google";

const PROFILES_TABLE = "user_profiles";
const GOOGLE_CONNECTIONS_TABLE = "google_business_connections";

function normalizeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/")) {
    return "/protected";
  }
  return next;
}

async function ensureUserProfileRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  email: string | null
) {
  await supabase.from(PROFILES_TABLE).upsert(
    {
      id: userId,
      email,
    },
    { onConflict: "id" }
  );
}

async function ensureSubscriptionRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  email: string | null
) {
  const { data: existingSubscription, error: lookupError } = await supabase
    .from("subscription_plans")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (lookupError || existingSubscription) return;

  const { startDate, endDate } = createPlanDates("free", "monthly");

  await supabase.from("subscription_plans").insert({
    user_id: userId,
    email,
    plan_type: "free",
    max_locations: 1,
    billing_cycle: getStoredBillingCycle("free", "monthly"),
    status: "trial",
    current_period_start: startDate.toISOString(),
    current_period_end: endDate.toISOString(),
  });
}

async function hasStoredGoogleConnection(
  adminClient: Awaited<ReturnType<typeof createAdminClient>>,
  userId: string
) {
  const { data, error } = await adminClient
    .from(GOOGLE_CONNECTIONS_TABLE)
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

async function upsertGoogleRefreshToken(
  adminClient: Awaited<ReturnType<typeof createAdminClient>>,
  userId: string,
  refreshToken: string
) {
  const { error } = await adminClient.from(GOOGLE_CONNECTIONS_TABLE).upsert(
    {
      user_id: userId,
      provider: "google",
      refresh_token: refreshToken,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw error;
  }
}

async function markGoogleConnected(
  adminClient: Awaited<ReturnType<typeof createAdminClient>>,
  userId: string,
  email: string | null
) {
  const nowIso = new Date().toISOString();

  const { data: profileData, error: profileLookupError } = await adminClient
    .from(PROFILES_TABLE)
    .select("google_connected_at")
    .eq("id", userId)
    .maybeSingle();

  if (profileLookupError) {
    throw profileLookupError;
  }

  const { error: upsertError } = await adminClient.from(PROFILES_TABLE).upsert(
    {
      id: userId,
      email,
      google_connected_at: profileData?.google_connected_at || nowIso,
      google_last_oauth_at: nowIso,
      onboarding_completed: true,
    },
    { onConflict: "id" }
  );

  if (upsertError) {
    throw upsertError;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const flow = (searchParams.get("flow") as CallbackFlow | null) || "login";
  const next = normalizeNextPath(searchParams.get("next"));

  const protocol = request.headers.get("x-forwarded-proto") || "http";
  const host = request.headers.get("host") || "localhost:3000";
  const origin = `${protocol}://${host}`;

  if (error) {
    console.error("OAuth provider error:", error, errorDescription);
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(errorDescription || error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=no_code`);
  }

  const supabase = await createClient();
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError || !data.session) {
    console.error("Code exchange error:", exchangeError);
    const errorMsg = exchangeError?.message || "oauth_callback_failed";
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(errorMsg)}`
    );
  }

  const userId = data.session.user.id;
  const userEmail = data.session.user.email ?? null;

  await ensureUserProfileRow(supabase, userId, userEmail);
  await ensureSubscriptionRow(supabase, userId, userEmail);

  const providerRefreshToken = data.session.provider_refresh_token;

  if (flow === "connect-google") {
    try {
      const adminClient = await createAdminClient();
      const hasExistingConnection = await hasStoredGoogleConnection(adminClient, userId);

      if (!providerRefreshToken && !hasExistingConnection) {
        return NextResponse.redirect(`${origin}${next}?google=missing_refresh_token`);
      }

      if (providerRefreshToken) {
        await upsertGoogleRefreshToken(adminClient, userId, providerRefreshToken);
      }

      await markGoogleConnected(adminClient, userId, userEmail);
      return NextResponse.redirect(`${origin}${next}?google=connected`);
    } catch (saveError) {
      console.error("Failed to store Google connection:", saveError);
      return NextResponse.redirect(`${origin}${next}?google=save_failed`);
    }
  }

  if (providerRefreshToken) {
    try {
      const adminClient = await createAdminClient();
      await upsertGoogleRefreshToken(adminClient, userId, providerRefreshToken);
      await markGoogleConnected(adminClient, userId, userEmail);
    } catch (saveError) {
      // Login should still succeed even if token persistence fails.
      console.error("Unable to persist Google refresh token on login:", saveError);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
