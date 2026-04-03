import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit, getIP } from "@/lib/rate-limit";

const limiter = rateLimit({ interval: 60_000, limit: 10 });

export async function POST(request: NextRequest) {
  const { success } = limiter.check(getIP(request));
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const supabase = await createClient();
  await supabase.auth.signOut();

  const protocol = request.headers.get("x-forwarded-proto") || "http";
  const host = request.headers.get("host") || "localhost:3000";
  const origin = `${protocol}://${host}`;

  return NextResponse.redirect(`${origin}/auth/login`, { status: 302 });
}
