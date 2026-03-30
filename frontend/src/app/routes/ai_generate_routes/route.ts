import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit({ interval: 60_000, limit: 10 });

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { success } = limiter.check(user.id);
  if (!success) {
    return NextResponse.json(
      { error: "Too many AI generation requests. Please wait before generating again." },
      { status: 429 }
    );
  }

  return NextResponse.json({ ok: true });
}
