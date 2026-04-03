from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

import logging
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_bearer_token, get_supabase_gateway
from app.core.settings import Settings, get_settings
from app.core.supabase_gateway import SupabaseGateway
from app.payments.razorpay_service import RazorpayService
from app.core.rate_limit import create_rate_limit
from app.services.plan_service import PlanService, FREE_PLAN_DEFAULTS, ADDON_CREDITS_TO_PLAN_TYPE

logger = logging.getLogger(__name__)

router = APIRouter()

_create_order_limit = create_rate_limit(max_requests=5, window_seconds=60)
_verify_payment_limit = create_rate_limit(max_requests=10, window_seconds=60)
_get_plan_limit = create_rate_limit(max_requests=30, window_seconds=60)

DEFAULT_CURRENCY = "USD"
VALID_BILLING_CYCLES = {"monthly", "yearly"}


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class CreateOrderRequest(BaseModel):
    plan_type: Optional[str] = None
    addon_credits: Optional[int] = None
    addon_plan_type: Optional[str] = None
    billing_cycle: str = "monthly"
    currency: str = "USD"


class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str
    plan_type: Optional[str] = None
    addon_credits: Optional[int] = None
    addon_plan_type: Optional[str] = None
    billing_cycle: str = "monthly"
    currency: str = "USD"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_razorpay(settings: Settings) -> RazorpayService:
    return RazorpayService(settings)


def _get_plan_price(plan: dict, currency: str, billing_cycle: str) -> int:
    """Extract price in cents/paise from a plan dict for the given currency and cycle."""
    cur = currency.upper()
    if cur == "INR":
        raw = plan.get("inr_yearly") if billing_cycle == "yearly" else plan.get("inr_monthly")
    else:
        raw = plan.get("usd_yearly") if billing_cycle == "yearly" else plan.get("usd_monthly")

    if raw is None:
        return 0
    return int(float(raw) * 100)


def _get_addon_price(addon: dict, currency: str) -> int:
    """Extract addon unit price in cents/paise."""
    cur = currency.upper()
    if cur == "INR":
        raw = addon.get("inr_unit_price")
    else:
        raw = addon.get("usd_unit_price")

    if raw is None:
        return 0
    return int(float(raw) * 100)


async def _resolve_addon(plan_service: PlanService, body) -> Optional[dict]:
    """Resolve addon from either addon_plan_type or addon_credits (backward compat)."""
    if body.addon_plan_type:
        return await plan_service.get_plan_by_type(body.addon_plan_type)
    if body.addon_credits:
        return await plan_service.get_addon_by_credits(body.addon_credits)
    return None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/create-order")
async def create_order(
    body: CreateOrderRequest,
    token: Annotated[str, Depends(get_bearer_token)],
    gateway: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
    settings: Annotated[Settings, Depends(get_settings)],
    _rate_limit: Annotated[None, Depends(_create_order_limit)],
):
    user = await gateway.get_user_from_access_token(token)
    plan_service = PlanService(gateway, settings=settings)

    amount = 0
    receipt = ""
    currency = body.currency.upper()

    if body.plan_type:
        plan = await plan_service.get_plan_by_type(body.plan_type)
        if not plan:
            raise HTTPException(status_code=400, detail="Invalid plan type")

        amount = _get_plan_price(plan, currency, body.billing_cycle)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Plan is not payable or currency not supported")

        receipt = f"plan_{body.plan_type}_{body.billing_cycle}_{user.id[:8]}"

    else:
        addon = await _resolve_addon(plan_service, body)
        if not addon:
            raise HTTPException(status_code=400, detail="plan_type or addon_credits/addon_plan_type is required")

        amount = _get_addon_price(addon, currency)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Invalid addon or currency not supported")

        receipt = f"addon_{addon.get('credits', 0)}_{user.id[:8]}"

    rzp = _get_razorpay(settings)
    try:
        order = rzp.create_order(amount, currency, receipt, user_id=user.id, email=user.email)
        return order
    except ValueError as exc:
        logger.error(f"Validation error in create_order: {exc}")
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Unexpected error in create_order for user {user.id}: {exc}")
        raise HTTPException(status_code=500, detail="Razorpay order creation failed. Please try again later.")


@router.post("/verify-payment")
async def verify_payment(
    body: VerifyPaymentRequest,
    token: Annotated[str, Depends(get_bearer_token)],
    gateway: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
    settings: Annotated[Settings, Depends(get_settings)],
    _rate_limit: Annotated[None, Depends(_verify_payment_limit)],
):
    user = await gateway.get_user_from_access_token(token)

    rzp = _get_razorpay(settings)
    if not rzp.verify_payment(body.razorpay_payment_id, body.razorpay_order_id, body.razorpay_signature):
        logger.warning(f"Payment verification failed for user {user.id}, order {body.razorpay_order_id}")
        raise HTTPException(status_code=400, detail="Invalid payment signature. Verification failed.")

    plan_service = PlanService(gateway, settings=settings)

    # Update subscription on successful plan payment
    if body.plan_type:
        plan = await plan_service.get_plan_by_type(body.plan_type)
        if not plan:
            raise HTTPException(status_code=400, detail="Invalid plan type")
        if plan.get("usd_monthly") is None and plan.get("inr_monthly") is None:
            raise HTTPException(status_code=400, detail="Plan is not payable")
        if body.billing_cycle not in VALID_BILLING_CYCLES:
            raise HTTPException(status_code=400, detail="Invalid billing cycle")

        now = datetime.now(timezone.utc)
        if body.billing_cycle == "yearly":
            period_end = now + timedelta(days=365)
        else:
            period_end = now + timedelta(days=30)

        currency = body.currency.upper()
        amount_paid_cents = _get_plan_price(plan, currency, body.billing_cycle)

        plan_data = {
            "plan_type": body.plan_type,
            "max_locations": plan["max_locations"],
            "billing_cycle": body.billing_cycle,
            "status": "active",
            "current_period_start": now.isoformat(),
            "current_period_end": period_end.isoformat(),
            "amount_paid_cents": amount_paid_cents,
            "payment_currency": currency,
            "total_ai_credits": plan["credits"],
            "ai_credits_used": 0,
            "ai_credits_refreshed_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "email": user.email,
        }

        await gateway.upsert_subscription(user.id, plan_data)

        return {
            "success": True,
            "plan_type": body.plan_type,
            "max_locations": plan["max_locations"],
            "current_period_end": period_end.isoformat(),
            "amount_paid_cents": amount_paid_cents,
            "payment_currency": currency,
            "total_ai_credits": plan["credits"],
            "message": f"Successfully upgraded to {body.plan_type} plan.",
        }

    # Addon purchase
    addon = await _resolve_addon(plan_service, body)
    if addon:
        addon_credits = addon.get("credits", 0)
        await gateway.add_addon_ai_credits(user.id, addon_credits)
        return {"success": True, "message": f"{addon_credits} addon credits added.", "addon_credits_added": addon_credits}

    return {"success": True, "message": "Payment verified."}


@router.get("/plan")
async def get_plan(
    token: Annotated[str, Depends(get_bearer_token)],
    gateway: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
    _rate_limit: Annotated[None, Depends(_get_plan_limit)],
):
    user = await gateway.get_user_from_access_token(token)
    subscription = await gateway.get_user_subscription(user.id)

    if not subscription:
        return {
            "plan_type": "free",
            "max_locations": FREE_PLAN_DEFAULTS["max_locations"],
            "status": "trial",
            "billing_cycle": "trial",
            "current_period_start": None,
            "current_period_end": None,
        }

    return subscription


_get_credits_limit = create_rate_limit(max_requests=60, window_seconds=60)


@router.get("/credits")
async def get_credits(
    token: Annotated[str, Depends(get_bearer_token)],
    gateway: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
    _rate_limit: Annotated[None, Depends(_get_credits_limit)],
):
    """Return total and remaining AI credits for the authenticated user."""
    user = await gateway.get_user_from_access_token(token)
    return await gateway.get_ai_credits(user.id)
