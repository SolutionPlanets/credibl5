import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit({ interval: 60_000, limit: 10 });

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const locationId: string | null = body.location_id || null;

  const { success } = limiter.check(user.id);
  if (!success) {
    return NextResponse.json(
      { error: "Too many AI generation requests. Please wait before generating again." },
      { status: 429 }
    );
  }

  const adminClient = await createAdminClient();

  // Atomically deduct 1 AI credit via RPC (checks + deducts in one call)
  const { data: deductResult, error: deductError } = await adminClient.rpc(
    "deduct_ai_credits",
    { p_user_id: user.id, p_credits: 1 }
  );

  if (deductError) {
    console.error("deduct_ai_credits RPC error:", deductError);
    return NextResponse.json(
      { error: "Failed to process AI credits.", code: "CREDIT_ERROR" },
      { status: 500 }
    );
  }

  // RPC returns {success, total_ai_credits, ai_credits_used, remaining_ai_credits}
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

  // Log to ai_usage_logs (non-blocking)
  adminClient.from("ai_usage_logs").insert({
    organization_id: user.id,
    location_id: locationId,
    model_name: "template-generator",
    action_type: "template_generation",
    credits_used: 1,
    request_meta_json: { source: "template_generate" },
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
