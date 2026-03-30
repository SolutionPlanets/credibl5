import { NextResponse } from "next/server";
import { rateLimit, getIP } from "@/lib/rate-limit";

const limiter = rateLimit({ interval: 15 * 60_000, limit: 5 });

export async function POST(request: Request) {
  const { success } = limiter.check(getIP(request));
  if (!success) {
    return NextResponse.json(
      { error: "Too many login attempts. Please wait 15 minutes before trying again." },
      { status: 429 }
    );
  }
  return NextResponse.json({ ok: true });
}
