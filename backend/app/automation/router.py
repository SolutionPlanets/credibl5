"""
Auto-Reply Automation Router
Handles CRUD operations for auto-reply rules and automation stats/logs.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.deps import get_bearer_token, get_supabase_gateway
from app.core.supabase_gateway import SupabaseGateway
from app.core.rate_limit import create_rate_limit

router = APIRouter()

_rules_read_limit = create_rate_limit(max_requests=30, window_seconds=60)
_rules_write_limit = create_rate_limit(max_requests=10, window_seconds=60)

# Plans that support auto-reply automation
AUTO_REPLY_PLANS = {"growth", "agency", "custom"}


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class RuleTriggerConditions(BaseModel):
    min_rating: int = 1
    max_rating: int = 5
    content_type: str = "any"  # any, with_text, without_text
    keywords_include: List[str] = []
    keywords_exclude: List[str] = []


class RuleResponseSettings(BaseModel):
    type: str = "ai"  # 'ai' or 'template'
    tone: Optional[str] = "professional"
    template_id: Optional[str] = None
    custom_instructions: Optional[str] = None


class CreateRuleRequest(BaseModel):
    location_id: str
    name: str
    is_active: bool = True
    trigger_conditions: RuleTriggerConditions
    response_settings: RuleResponseSettings


class UpdateRuleRequest(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    trigger_conditions: Optional[RuleTriggerConditions] = None
    response_settings: Optional[RuleResponseSettings] = None


class ToggleRuleRequest(BaseModel):
    is_active: bool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _authenticate(
    token: str,
    gateway: SupabaseGateway,
) -> str:
    """Authenticate and return the user ID."""
    user = await gateway.get_user_from_access_token(token)
    return user.id


async def _verify_auto_reply_plan(
    user_id: str,
    gateway: SupabaseGateway,
) -> Dict[str, Any]:
    """Verify that the user is on a plan that supports auto-reply rules."""
    subscription = await gateway.get_user_subscription(user_id)
    if not subscription or subscription.get("plan_type") not in AUTO_REPLY_PLANS:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "PLAN_UPGRADE_REQUIRED",
                "message": "Auto-reply rules are only available on Pro and Custom plans. Please upgrade to access this feature.",
            },
        )
    return subscription


async def _verify_location_ownership(
    user_id: str,
    location_id: str,
    gateway: SupabaseGateway,
) -> None:
    """Verify the location belongs to the user."""
    location = await gateway.get_user_location_by_id(user_id, location_id)
    if not location:
        raise HTTPException(status_code=403, detail="Location not found or access denied.")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/rules")
async def list_rules(
    _rate_limit: Annotated[None, Depends(_rules_read_limit)],
    token: Annotated[str, Depends(get_bearer_token)],
    gateway: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
    location_id: Optional[str] = Query(None, description="Filter by location ID"),
):
    """List all auto-reply rules for the authenticated user."""
    user_id = await _authenticate(token, gateway)
    rules = await gateway.list_auto_reply_rules(user_id, location_id)
    return rules


@router.post("/rules")
async def create_rule(
    body: CreateRuleRequest,
    _rate_limit: Annotated[None, Depends(_rules_write_limit)],
    token: Annotated[str, Depends(get_bearer_token)],
    gateway: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
):
    """Create a new auto-reply rule. Requires Pro or Custom plan."""
    user_id = await _authenticate(token, gateway)
    await _verify_auto_reply_plan(user_id, gateway)
    await _verify_location_ownership(user_id, body.location_id, gateway)

    rule_data = {
        "user_id": user_id,
        "location_id": body.location_id,
        "name": body.name,
        "is_active": body.is_active,
        "trigger_conditions": body.trigger_conditions.model_dump(),
        "response_settings": body.response_settings.model_dump(),
    }

    result = await gateway.create_auto_reply_rule(rule_data)
    return result


@router.put("/rules/{rule_id}")
async def update_rule(
    rule_id: str,
    body: UpdateRuleRequest,
    _rate_limit: Annotated[None, Depends(_rules_write_limit)],
    token: Annotated[str, Depends(get_bearer_token)],
    gateway: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
):
    """Update an existing auto-reply rule."""
    user_id = await _authenticate(token, gateway)
    await _verify_auto_reply_plan(user_id, gateway)

    update_data: Dict[str, Any] = {}
    if body.name is not None:
        update_data["name"] = body.name
    if body.is_active is not None:
        update_data["is_active"] = body.is_active
    if body.trigger_conditions is not None:
        update_data["trigger_conditions"] = body.trigger_conditions.model_dump()
    if body.response_settings is not None:
        update_data["response_settings"] = body.response_settings.model_dump()

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update.")

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = await gateway.update_auto_reply_rule(rule_id, user_id, update_data)
    if not result:
        raise HTTPException(status_code=404, detail="Rule not found.")
    return result


@router.patch("/rules/{rule_id}/toggle")
async def toggle_rule(
    rule_id: str,
    body: ToggleRuleRequest,
    _rate_limit: Annotated[None, Depends(_rules_write_limit)],
    token: Annotated[str, Depends(get_bearer_token)],
    gateway: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
):
    """Quick toggle a rule's active state."""
    user_id = await _authenticate(token, gateway)
    await _verify_auto_reply_plan(user_id, gateway)

    update_data = {
        "is_active": body.is_active,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    result = await gateway.update_auto_reply_rule(rule_id, user_id, update_data)
    if not result:
        raise HTTPException(status_code=404, detail="Rule not found.")
    return result


@router.delete("/rules/{rule_id}")
async def delete_rule(
    rule_id: str,
    _rate_limit: Annotated[None, Depends(_rules_write_limit)],
    token: Annotated[str, Depends(get_bearer_token)],
    gateway: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
):
    """Delete an auto-reply rule."""
    user_id = await _authenticate(token, gateway)
    result = await gateway.delete_auto_reply_rule(rule_id, user_id)
    if not result:
        raise HTTPException(status_code=404, detail="Rule not found.")
    return {"success": True, "message": "Rule deleted."}


@router.get("/stats")
async def get_automation_stats(
    _rate_limit: Annotated[None, Depends(_rules_read_limit)],
    token: Annotated[str, Depends(get_bearer_token)],
    gateway: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
):
    """Get automation summary stats for the authenticated user."""
    user_id = await _authenticate(token, gateway)
    stats = await gateway.get_automation_stats(user_id)
    return stats


@router.get("/logs")
async def get_automation_logs(
    _rate_limit: Annotated[None, Depends(_rules_read_limit)],
    token: Annotated[str, Depends(get_bearer_token)],
    gateway: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
):
    """Get paginated automation activity logs."""
    user_id = await _authenticate(token, gateway)
    logs = await gateway.get_automation_logs(user_id, page, limit)
    return logs
