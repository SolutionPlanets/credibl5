import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit({ interval: 60_000, limit: 30 });

/**
 * Generic AI credit deduction route.
 * Any AI-labeled feature calls this to atomically deduct credits and log usage.
 *
 * Body: { action_type: string, credits?: number }
 * Returns: { ok, remaining_ai_credits, total_ai_credits, ai_credits_used }
 */
export async function POST(request: Request) {
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
      { error: "Too many requests. Please wait." },
      { status: 429 }
    );
  }

  // Parse body
  const body = await request.json().catch(() => ({}));
  const actionType: string = body.action_type || "ai_action";
  const locationId: string | null = body.location_id || null;
  const creditsToDeduct: number = typeof body.credits === "number" && body.credits > 0 ? body.credits : 1;

  const adminClient = await createAdminClient();

  // Atomically deduct credits via RPC
  const { data: deductResult, error: deductError } = await adminClient.rpc(
    "deduct_ai_credits",
    { p_user_id: user.id, p_credits: creditsToDeduct }
  );

  if (deductError) {
    console.error("deduct_ai_credits RPC error:", deductError);
    return NextResponse.json(
      { error: "Failed to process AI credits.", code: "CREDIT_ERROR" },
      { status: 500 }
    );
  }

  if (!deductResult?.success) {
    return NextResponse.json(
      {
        error: "Insufficient AI credits. Purchase more credits or upgrade your plan.",
        code: "INSUFFICIENT_CREDITS",
        remaining_ai_credits: deductResult?.remaining_ai_credits ?? 0,
        total_ai_credits: deductResult?.total_ai_credits ?? 0,
      },
      { status: 402 }
    );
  }

  // Log to ai_usage_logs (non-blocking — don't fail the request if logging fails)
  adminClient.from("ai_usage_logs").insert({
    organization_id: user.id,
    location_id: locationId,
    model_name: "ai-assist",
    action_type: actionType,
    credits_used: creditsToDeduct,
    request_meta_json: { source: actionType },
  }).then(({ error }) => {
    if (error) console.error("ai_usage_logs insert error:", error.message);
  });

  return NextResponse.json({
    ok: true,
    remaining_ai_credits: deductResult.remaining_ai_credits,
    total_ai_credits: deductResult.total_ai_credits,
    ai_credits_used: deductResult.ai_credits_used,
  });
}
