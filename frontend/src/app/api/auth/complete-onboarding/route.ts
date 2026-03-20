import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { rateLimit, getIP } from "@/lib/rate-limit";

const limiter = rateLimit({ interval: 60_000, limit: 10 });

export async function POST(request: Request) {
  const { success } = limiter.check(getIP(request));
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = await createAdminClient();

    const { error: updateError } = await adminClient
      .from("user_profiles")
      .update({ onboarding_completed: true })
      .eq("id", user.id);

    if (updateError) {
      console.error("Failed to mark onboarding completed:", updateError);
      return NextResponse.json(
        { error: "Failed to update onboarding status" },
        { status: 500 }
      );
    }

    return NextResponse.json({ completed: true });
  } catch (error) {
    console.error("complete-onboarding failed:", error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
