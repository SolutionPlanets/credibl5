from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import get_bearer_token, get_supabase_gateway
from app.core.settings import Settings, get_settings
from app.core.supabase_gateway import SupabaseGateway
from app.payments.razorpay_service import RazorpayService
from app.core.rate_limit import create_rate_limit

router = APIRouter()

_create_order_limit = create_rate_limit(max_requests=5, window_seconds=60)
_verify_payment_limit = create_rate_limit(max_requests=10, window_seconds=60)
_get_plan_limit = create_rate_limit(max_requests=30, window_seconds=60)

# Default Pricing (fallback if Sheet fetch fails)
PLAN_PRICING_CENTS: dict[str, dict[str, int]] = {
    "starter": {"monthly": 2000, "yearly": 20000},
    "growth": {"monthly": 5000, "yearly": 50000},
}

ADDON_PRICING_CENTS: dict[int, int] = {
    50: 1500,
    150: 3900,
    400: 8900,
}

PLAN_LIMITS: dict[str, int] = {
    "free": 1,
    "starter": 2,
    "growth": 5,
    "agency": -1,
}

PLAN_AI_CREDITS: dict[str, int] = {
    "free": 50,
    "starter": 200,
    "growth": 500,
    "agency": 2000,
}

from app.services.pricing_service import PricingService

DEFAULT_CURRENCY = "USD"
VALID_BILLING_CYCLES = {"monthly", "yearly"}


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class CreateOrderRequest(BaseModel):
    plan_type: Optional[str] = None
    addon_credits: Optional[int] = None
    billing_cycle: str = "monthly"
    currency: str = "USD"


class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str
    plan_type: Optional[str] = None
    addon_credits: Optional[int] = None
    billing_cycle: str = "monthly"
    currency: str = "USD"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_razorpay(settings: Settings) -> RazorpayService:
    return RazorpayService(settings)


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

    amount = 0
    receipt = ""

    if body.plan_type:
        pricing_service = PricingService(settings)
        dynamic_pricing = await pricing_service.get_formatted_pricing()
        
        currency = body.currency.upper()
        plan_id = body.plan_type
        
        # Try to get price from dynamic pricing, fallback to hardcoded
        if plan_id in dynamic_pricing and currency in dynamic_pricing[plan_id]:
            prices = dynamic_pricing[plan_id][currency]
            raw_amount = prices["yearly"] if body.billing_cycle == "yearly" else prices["monthly"]
            amount = int(raw_amount * 100) # Convert to cents/paise
        else:
            if plan_id not in PLAN_PRICING_CENTS:
                raise HTTPException(status_code=400, detail="Invalid plan type")
            amount = PLAN_PRICING_CENTS[plan_id][body.billing_cycle]
            currency = "USD" # Fallback to USD for hardcoded
            
        receipt = f"plan_{plan_id}_{body.billing_cycle}_{user.id[:8]}"
    elif body.addon_credits:
        if body.addon_credits not in ADDON_PRICING_CENTS:
            raise HTTPException(status_code=400, detail="Invalid addon credits amount")
        amount = ADDON_PRICING_CENTS[body.addon_credits]
        currency = "USD"
        receipt = f"addon_{body.addon_credits}_{user.id[:8]}"
    else:
        raise HTTPException(status_code=400, detail="plan_type or addon_credits is required")

    rzp = _get_razorpay(settings)
    try:
        order = rzp.create_order(amount, currency, receipt, user_id=user.id, email=user.email)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Razorpay error: {exc}")

    return order


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
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    # Update subscription on successful plan payment
    if body.plan_type:
        if body.plan_type not in PLAN_LIMITS:
            raise HTTPException(status_code=400, detail="Invalid plan type")
        if body.plan_type not in PLAN_PRICING_CENTS:
            raise HTTPException(status_code=400, detail="Plan is not payable")
        if body.billing_cycle not in VALID_BILLING_CYCLES:
            raise HTTPException(status_code=400, detail="Invalid billing cycle")

        now = datetime.now(timezone.utc)
        if body.billing_cycle == "yearly":
            period_end = now + timedelta(days=365)
        else:
            period_end = now + timedelta(days=30)
            
        currency = body.currency.upper()
        pricing_service = PricingService(settings)
        dynamic_pricing = await pricing_service.get_formatted_pricing()
        
        if body.plan_type in dynamic_pricing and currency in dynamic_pricing[body.plan_type]:
            prices = dynamic_pricing[body.plan_type][currency]
            raw_amount = prices["yearly"] if body.billing_cycle == "yearly" else prices["monthly"]
            amount_paid_cents = int(raw_amount * 100)
        else:
            amount_paid_cents = PLAN_PRICING_CENTS[body.plan_type][body.billing_cycle]
            currency = "USD"

        plan_data = {
            "plan_type": body.plan_type,
            "max_locations": PLAN_LIMITS[body.plan_type],
            "billing_cycle": body.billing_cycle,
            "status": "active",
            "current_period_start": now.isoformat(),
            "current_period_end": period_end.isoformat(),
            "amount_paid_cents": amount_paid_cents,
            "payment_currency": currency,
            "total_ai_credits": PLAN_AI_CREDITS[body.plan_type],
            "ai_credits_used": 0,
            "ai_credits_refreshed_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "email": user.email,
        }

        await gateway.upsert_subscription(user.id, plan_data)

        return {
            "success": True,
            "plan_type": body.plan_type,
            "max_locations": PLAN_LIMITS[body.plan_type],
            "current_period_end": period_end.isoformat(),
            "amount_paid_cents": amount_paid_cents,
            "payment_currency": currency,
            "total_ai_credits": PLAN_AI_CREDITS[body.plan_type],
            "message": f"Successfully upgraded to {body.plan_type} plan.",
        }

    if body.addon_credits:
        if body.addon_credits not in ADDON_PRICING_CENTS:
            raise HTTPException(status_code=400, detail="Invalid addon credits amount")
        await gateway.add_addon_ai_credits(user.id, body.addon_credits)
        return {"success": True, "message": f"{body.addon_credits} addon credits added.", "addon_credits_added": body.addon_credits}

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
            "max_locations": 1,
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
