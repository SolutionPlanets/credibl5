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

# ---------------------------------------------------------------------------
# Pricing (USD – amounts in cents for Razorpay)
# ---------------------------------------------------------------------------

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

CURRENCY = "USD"
VALID_BILLING_CYCLES = {"monthly", "yearly"}


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class CreateOrderRequest(BaseModel):
    plan_type: Optional[str] = None
    addon_credits: Optional[int] = None
    billing_cycle: str = "monthly"


class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str
    plan_type: Optional[str] = None
    addon_credits: Optional[int] = None
    billing_cycle: str = "monthly"


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
        if body.plan_type not in PLAN_PRICING_CENTS:
            raise HTTPException(status_code=400, detail="Invalid plan type")
        if body.billing_cycle not in VALID_BILLING_CYCLES:
            raise HTTPException(status_code=400, detail="Invalid billing cycle")
        amount = PLAN_PRICING_CENTS[body.plan_type][body.billing_cycle]
        receipt = f"plan_{body.plan_type}_{body.billing_cycle}_{user.id[:8]}"
    elif body.addon_credits:
        if body.addon_credits not in ADDON_PRICING_CENTS:
            raise HTTPException(status_code=400, detail="Invalid addon credits amount")
        amount = ADDON_PRICING_CENTS[body.addon_credits]
        receipt = f"addon_{body.addon_credits}_{user.id[:8]}"
    else:
        raise HTTPException(status_code=400, detail="plan_type or addon_credits is required")

    rzp = _get_razorpay(settings)
    try:
        order = rzp.create_order(amount, CURRENCY, receipt)
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
        amount_paid_cents = PLAN_PRICING_CENTS[body.plan_type][body.billing_cycle]

        plan_data = {
            "plan_type": body.plan_type,
            "max_locations": PLAN_LIMITS[body.plan_type],
            "billing_cycle": body.billing_cycle,
            "status": "active",
            "current_period_start": now.isoformat(),
            "current_period_end": period_end.isoformat(),
            "amount_paid_cents": amount_paid_cents,
            "payment_currency": CURRENCY,
            "updated_at": now.isoformat(),
        }

        await gateway.upsert_subscription(user.id, plan_data)

        return {
            "success": True,
            "plan_type": body.plan_type,
            "max_locations": PLAN_LIMITS[body.plan_type],
            "current_period_end": period_end.isoformat(),
            "amount_paid_cents": amount_paid_cents,
            "payment_currency": CURRENCY,
            "message": f"Successfully upgraded to {body.plan_type} plan.",
        }

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
