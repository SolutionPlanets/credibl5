import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { rateLimit, getIP } from "@/lib/rate-limit";

const limiter = rateLimit({ interval: 60_000, limit: 10 });

export async function POST(request: Request) {
  const { success } = limiter.check(getIP(request));
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const adminClient = await createAdminClient();

    const { data: profile } = await adminClient
      .from("user_profiles")
      .select("has_password, google_connected_at")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    const isGoogleUser = Boolean(
      profile && (profile.google_connected_at || profile.has_password === false)
    );

    return NextResponse.json({ isGoogleUser });
  } catch (error) {
    console.error("check-provider failed:", error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
