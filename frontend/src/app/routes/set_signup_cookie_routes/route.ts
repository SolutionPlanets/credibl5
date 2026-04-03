import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Deprecated endpoint. Use /routes/ensure_subscription_routes instead." },
    { status: 410 }
  );
}
