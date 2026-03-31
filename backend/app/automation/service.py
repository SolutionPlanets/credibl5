"""
Auto-Reply Service
Core logic for matching reviews to rules and generating/posting replies.
Called by the cron endpoint to process automation rules.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from app.core.settings import Settings
from app.core.supabase_gateway import SupabaseGateway
from app.gmb.oauth import GoogleOAuthService
from app.gmb.helper import upsert_gmb_review_reply

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Main job entry point
# ---------------------------------------------------------------------------

async def process_auto_replies_job(settings: Settings) -> Dict[str, Any]:
    """
    Process all active auto-reply rules.
    Called by the cron endpoint using service_role key.
    """
    logger.info("[AutoReply] Starting auto-reply job...")
    gateway = SupabaseGateway(settings)
    oauth = GoogleOAuthService(settings)

    # Fetch all active rules using service_role (bypasses RLS)
    url = f"{settings.supabase_url}/rest/v1/auto_reply_rules"
    headers = {
        "apikey": settings.service_role_key,
        "Authorization": f"Bearer {settings.service_role_key}",
    }
    params = {"select": "*", "is_active": "eq.true"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers, params=params)

    if resp.status_code >= 400:
        logger.error("[AutoReply] Failed to fetch active rules: %s", resp.text[:300])
        return {"error": "Failed to fetch rules"}

    active_rules = resp.json()
    if not active_rules:
        logger.info("[AutoReply] No active rules found.")
        return {"processed": 0, "rules_active": 0}

    logger.info("[AutoReply] Found %d active rules.", len(active_rules))

    processed = 0
    for rule in active_rules:
        try:
            count = await _process_rule(settings, gateway, oauth, rule)
            processed += count
        except Exception as e:
            logger.error("[AutoReply] Error processing rule %s: %s", rule.get("id", "?"), e)
            await _log_auto_reply(
                settings,
                user_id=rule["user_id"],
                rule_id=rule["id"],
                location_id=rule.get("location_id"),
                rule_name=rule.get("name"),
                action="skipped_error",
                error_message=str(e),
            )

    return {"processed": processed, "rules_active": len(active_rules)}


# ---------------------------------------------------------------------------
# Rule processing
# ---------------------------------------------------------------------------

async def _process_rule(
    settings: Settings,
    gateway: SupabaseGateway,
    oauth: GoogleOAuthService,
    rule: Dict[str, Any],
) -> int:
    """Process a single rule: find matching reviews, generate and post replies. Returns count of replies sent."""
    user_id = rule["user_id"]
    location_id = rule["location_id"]
    response_settings = rule.get("response_settings", {})
    rule_type = response_settings.get("type", "ai")

    # Check credit status for AI rules
    if rule_type == "ai":
        credits = await gateway.get_ai_credits(user_id)
        if credits.get("remaining_ai_credits", 0) <= 0:
            logger.info("[AutoReply] Rule '%s' skipped — no AI credits remaining.", rule.get("name"))
            await _log_auto_reply(
                settings,
                user_id=user_id,
                rule_id=rule["id"],
                location_id=location_id,
                rule_name=rule.get("name"),
                action="skipped_no_credits",
                error_message="AI credits exhausted.",
            )
            return 0

    # Fetch unreplied reviews for this location
    headers = {
        "apikey": settings.service_role_key,
        "Authorization": f"Bearer {settings.service_role_key}",
    }
    reviews_url = f"{settings.supabase_url}/rest/v1/reviews"
    reviews_params = {
        "select": "*",
        "location_id": f"eq.{location_id}",
        "or": "(review_reply.is.null,review_reply.eq.)",
        "order": "review_date.desc",
        "limit": "50",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        reviews_resp = await client.get(reviews_url, headers=headers, params=reviews_params)

    if reviews_resp.status_code >= 400:
        logger.error("[AutoReply] Failed to fetch reviews for location %s: %s", location_id, reviews_resp.text[:200])
        return 0

    reviews = reviews_resp.json()
    if not reviews:
        return 0

    conditions = rule.get("trigger_conditions", {})
    reply_count = 0

    for review in reviews:
        if not _matches_condition(review, conditions):
            continue

        # Re-check credits for AI rules before each reply
        if rule_type == "ai":
            credits = await gateway.get_ai_credits(user_id)
            if credits.get("remaining_ai_credits", 0) <= 0:
                logger.info("[AutoReply] Credits exhausted mid-job for user %s", user_id[:8])
                break

        try:
            success = await _execute_reply(settings, gateway, oauth, rule, review)
            if success:
                reply_count += 1
        except Exception as e:
            logger.error("[AutoReply] Failed to reply to review %s: %s", review.get("id", "?"), e)
            await _log_auto_reply(
                settings,
                user_id=user_id,
                rule_id=rule["id"],
                location_id=location_id,
                review_id=review.get("id"),
                rule_name=rule.get("name"),
                action="skipped_error",
                error_message=str(e),
            )

    return reply_count


# ---------------------------------------------------------------------------
# Condition matching (pure function)
# ---------------------------------------------------------------------------

def _matches_condition(review: Dict[str, Any], conditions: Dict[str, Any]) -> bool:
    """Check if a review matches the rule's trigger conditions."""
    # Rating check
    rating = review.get("star_rating")
    if rating is not None:
        if rating < conditions.get("min_rating", 1):
            return False
        if rating > conditions.get("max_rating", 5):
            return False

    # Content type check
    text = (review.get("review_text") or "").strip()
    has_text = bool(text)
    content_type = conditions.get("content_type", "any")

    if content_type == "with_text" and not has_text:
        return False
    if content_type == "without_text" and has_text:
        return False

    # Keyword checks
    if text:
        text_lower = text.lower()
        include_list = conditions.get("keywords_include", [])
        exclude_list = conditions.get("keywords_exclude", [])

        if include_list and not any(k.lower() in text_lower for k in include_list):
            return False
        if exclude_list and any(k.lower() in text_lower for k in exclude_list):
            return False

    return True


# ---------------------------------------------------------------------------
# Reply execution
# ---------------------------------------------------------------------------

async def _execute_reply(
    settings: Settings,
    gateway: SupabaseGateway,
    oauth: GoogleOAuthService,
    rule: Dict[str, Any],
    review: Dict[str, Any],
) -> bool:
    """Generate and post a reply. Returns True on success."""
    user_id = rule["user_id"]
    location_id = rule["location_id"]
    response_settings = rule.get("response_settings", {})

    # Get location details
    location = await gateway.get_location_by_id(location_id)
    if not location:
        logger.error("[AutoReply] Location %s not found.", location_id)
        return False

    business_name = location.get("location_name", "our business")

    # Generate reply text
    reply_text = ""
    if response_settings.get("type") == "template" and response_settings.get("template_id"):
        reply_text = await _get_template_reply(settings, response_settings["template_id"], review, business_name)
    else:
        reply_text = await _generate_ai_reply(settings, gateway, rule, review, business_name)

    if not reply_text:
        logger.warning("[AutoReply] Empty reply generated for review %s", review.get("id", "?"))
        return False

    # Get Google access token
    connection = await gateway.get_google_connection(user_id)
    if not connection or not connection.get("refresh_token"):
        logger.error("[AutoReply] No Google connection for user %s", user_id[:8])
        return False

    token_data = await oauth.refresh_access_token(connection["refresh_token"])
    access_token = token_data.get("access_token")
    if not access_token:
        logger.error("[AutoReply] Failed to get Google access token for user %s", user_id[:8])
        return False

    # Build the review path for Google API
    gmb_account_id = location.get("gmb_account_id")
    gmb_location_id = location.get("location_id")
    gmb_review_id = review.get("gmb_review_id", "")
    review_path = gmb_review_id
    if not review_path.startswith("accounts/"):
        review_path = f"accounts/{gmb_account_id}/locations/{gmb_location_id}/reviews/{gmb_review_id}"

    # Post the reply to Google
    refresh_token = connection["refresh_token"]

    async def _refresh_cb() -> str:
        refreshed = await oauth.refresh_access_token(refresh_token)
        return refreshed.get("access_token", "")

    try:
        await upsert_gmb_review_reply(
            access_token=access_token,
            review_path=review_path,
            reply_comment=reply_text,
            refresh_callback=_refresh_cb,
        )
    except Exception as e:
        logger.error("[AutoReply] Google API error for review %s: %s", review.get("id", "?"), e)
        await _log_auto_reply(
            settings,
            user_id=user_id,
            rule_id=rule["id"],
            location_id=location_id,
            review_id=review.get("id"),
            rule_name=rule.get("name"),
            action="skipped_error",
            reply_text=reply_text,
            error_message=str(e),
        )
        return False

    # Update review record
    headers = {
        "apikey": settings.service_role_key,
        "Authorization": f"Bearer {settings.service_role_key}",
        "Content-Type": "application/json",
    }
    review_update_url = f"{settings.supabase_url}/rest/v1/reviews"
    async with httpx.AsyncClient(timeout=15.0) as client:
        await client.patch(
            review_update_url,
            headers=headers,
            params={"id": f"eq.{review['id']}"},
            json={
                "review_reply": reply_text,
                "reply_source": "auto_rule",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        )

    # Track AI credit usage (only for AI-generated replies)
    if response_settings.get("type", "ai") == "ai":
        await _track_credit_usage(settings, user_id, location_id, review.get("id"))

    # Log success
    await _log_auto_reply(
        settings,
        user_id=user_id,
        rule_id=rule["id"],
        location_id=location_id,
        review_id=review.get("id"),
        rule_name=rule.get("name"),
        action="replied",
        reply_text=reply_text,
        credits_consumed=1 if response_settings.get("type", "ai") == "ai" else 0,
    )

    logger.info("[AutoReply] Successfully replied to review %s via rule '%s'", review.get("id", "?"), rule.get("name"))
    return True


# ---------------------------------------------------------------------------
# Reply generation helpers
# ---------------------------------------------------------------------------

async def _get_template_reply(
    settings: Settings,
    template_id: str,
    review: Dict[str, Any],
    business_name: str,
) -> str:
    """Fetch template content and substitute placeholders."""
    headers = {
        "apikey": settings.service_role_key,
        "Authorization": f"Bearer {settings.service_role_key}",
    }
    url = f"{settings.supabase_url}/rest/v1/saved_templates"
    params = {"select": "content", "id": f"eq.{template_id}", "limit": "1"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers, params=params)

    if resp.status_code >= 400 or not resp.json():
        return ""

    content = resp.json()[0].get("content", "")
    reviewer_name = review.get("reviewer_name", "Valued Customer")
    content = content.replace("{{reviewer_name}}", reviewer_name)
    content = content.replace("{{business_name}}", business_name)
    return content


async def _generate_ai_reply(
    settings: Settings,
    gateway: SupabaseGateway,
    rule: Dict[str, Any],
    review: Dict[str, Any],
    business_name: str,
) -> str:
    """Generate a review reply using Google Gemini with brand voice context."""
    api_key = settings.google_gemini_api_key
    if not api_key:
        logger.error("[AutoReply] No Gemini API key configured.")
        return ""

    # Lazy import to avoid startup cost
    import google.generativeai as genai

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.0-flash")

    # Fetch brand voice for this location
    location_id = rule["location_id"]
    user_id = rule["user_id"]
    bv = await _fetch_brand_voice(settings, user_id, location_id)

    response_settings = rule.get("response_settings", {})
    tone = response_settings.get("tone", bv.get("tone", "professional"))
    custom_instructions = response_settings.get("custom_instructions", "")
    reply_length = bv.get("preferred_response_length", "medium")

    prompt = f"""Write a reply to this customer review for {business_name}.

Reviewer: {review.get("reviewer_name", "Customer")}
Rating: {review.get("star_rating", "N/A")} stars
Review: "{review.get("review_text", "")}"

Brand Voice Guidelines:
- Business Type: {bv.get("industry", "Local Business")}
- Tone: {tone}
- Length: {reply_length}
- Key Phrases to use: {", ".join(bv.get("key_phrases", [])) or "N/A"}
- Phrases to avoid: {", ".join(bv.get("phrases_to_avoid", [])) or "N/A"}
- Sign-off: {bv.get("signature_signoff", "")}

{f"Additional instructions: {custom_instructions}" if custom_instructions else ""}

Rules:
- Address the reviewer by their first name.
- Be genuine and specific to their review.
- Keep the response concise and {reply_length}.
- No placeholder text in the final response.
- Do not use markdown formatting.
"""

    try:
        result = model.generate_content(prompt)
        reply = result.text.strip()

        # Ensure sign-off is included
        sign_off = bv.get("signature_signoff", "").strip()
        if sign_off and sign_off.lower() not in reply.lower():
            reply = f"{reply}\n\n{sign_off}"

        return reply
    except Exception as e:
        logger.error("[AutoReply] Gemini generation failed: %s", e)
        return ""


async def _fetch_brand_voice(
    settings: Settings, user_id: str, location_id: str
) -> Dict[str, Any]:
    """Fetch brand voice settings for a location."""
    headers = {
        "apikey": settings.service_role_key,
        "Authorization": f"Bearer {settings.service_role_key}",
    }
    url = f"{settings.supabase_url}/rest/v1/brand_voices"
    params = {
        "select": "*",
        "user_id": f"eq.{user_id}",
        "location_id": f"eq.{location_id}",
        "limit": "1",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers, params=params)

    if resp.status_code < 400 and resp.json():
        return resp.json()[0]
    return {}


# ---------------------------------------------------------------------------
# Credit tracking
# ---------------------------------------------------------------------------

async def _track_credit_usage(
    settings: Settings,
    user_id: str,
    location_id: str,
    review_id: Optional[str],
) -> None:
    """Insert AI usage log and increment credits_used on subscription_plans."""
    headers = {
        "apikey": settings.service_role_key,
        "Authorization": f"Bearer {settings.service_role_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        # Insert usage log
        await client.post(
            f"{settings.supabase_url}/rest/v1/ai_usage_logs",
            headers=headers,
            json=[{
                "organization_id": user_id,
                "location_id": location_id,
                "review_id": review_id,
                "model_name": "gemini-2.0-flash",
                "action_type": "auto_reply_draft",
                "credits_used": 1,
                "request_meta_json": {"source": "auto_reply_job"},
            }],
        )

        # Increment ai_credits_used on subscription_plans
        # First fetch current value
        plan_resp = await client.get(
            f"{settings.supabase_url}/rest/v1/subscription_plans",
            headers={
                "apikey": settings.service_role_key,
                "Authorization": f"Bearer {settings.service_role_key}",
            },
            params={
                "select": "ai_credits_used",
                "user_id": f"eq.{user_id}",
                "limit": "1",
            },
        )
        if plan_resp.status_code < 400 and plan_resp.json():
            current_used = plan_resp.json()[0].get("ai_credits_used", 0)
            await client.patch(
                f"{settings.supabase_url}/rest/v1/subscription_plans",
                headers=headers,
                params={"user_id": f"eq.{user_id}"},
                json={"ai_credits_used": current_used + 1},
            )


# ---------------------------------------------------------------------------
# Activity logging
# ---------------------------------------------------------------------------

async def _log_auto_reply(
    settings: Settings,
    user_id: str,
    rule_id: str,
    location_id: Optional[str],
    rule_name: Optional[str] = None,
    review_id: Optional[str] = None,
    action: str = "replied",
    reply_text: Optional[str] = None,
    credits_consumed: int = 0,
    error_message: Optional[str] = None,
) -> None:
    """Insert a row into auto_reply_logs."""
    headers = {
        "apikey": settings.service_role_key,
        "Authorization": f"Bearer {settings.service_role_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "user_id": user_id,
        "rule_id": rule_id,
        "location_id": location_id,
        "review_id": review_id,
        "rule_name": rule_name,
        "action": action,
        "reply_text": reply_text,
        "credits_consumed": credits_consumed,
        "error_message": error_message,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            await client.post(
                f"{settings.supabase_url}/rest/v1/auto_reply_logs",
                headers=headers,
                json=[payload],
            )
    except Exception as e:
        logger.error("[AutoReply] Failed to insert log: %s", e)
