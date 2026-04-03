from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.core.supabase_gateway import SupabaseGateway

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Static defaults for plans NOT stored in the database
# ---------------------------------------------------------------------------

FREE_PLAN_DEFAULTS: Dict[str, Any] = {
    "plan_type": "free",
    "name": "30-Day Free Trial",
    "usd_monthly": 0,
    "usd_yearly": 0,
    "inr_monthly": 0,
    "inr_yearly": 0,
    "credits": 50,
    "max_locations": 1,
    "is_addon": False,
    "is_popular": False,
    "features": [
        "1 Google My Business location",
        "50 AI review replies",
        "Manual AI replies allowed",
        "Auto Reply disabled",
        "Plan expires after 30 days",
        "Email support",
    ],
    "limits_config": {"maxLocations": 1, "AiCredits": 50, "autoReplyEnabled": False},
}

AGENCY_PLAN_DEFAULTS: Dict[str, Any] = {
    "plan_type": "agency",
    "name": "Custom",
    "usd_monthly": None,
    "usd_yearly": None,
    "inr_monthly": None,
    "inr_yearly": None,
    "credits": 2000,
    "max_locations": -1,
    "is_addon": False,
    "is_popular": False,
    "is_custom": True,
    "features": [
        "Contact sales",
        "Custom location count & credits",
        "Auto Reply enabled",
        "Multi-user team access",
        "Optional agency controls",
        "White-label option",
        "Dedicated account manager",
    ],
    "limits_config": {"maxLocations": -1, "AiCredits": 2000, "autoReplyEnabled": True},
}

# Backward-compat mapping: credit count → addon plan_type
ADDON_CREDITS_TO_PLAN_TYPE: Dict[int, str] = {
    20: "ai_credits_20",
    50: "ai_credits_50",
    100: "ai_credits_100",
}


class PlanService:
    """Fetches plan data from Supabase (primary) with Google Sheets fallback."""

    def __init__(self, gateway: SupabaseGateway, settings=None):
        self.gateway = gateway
        self._settings = settings

    async def _get_plans(self) -> List[Dict[str, Any]]:
        """Fetch plans from Supabase on every call (no cache)."""
        try:
            plans = await self.gateway.get_all_plans()
            if plans:
                return plans
        except Exception as e:
            logger.warning(f"Supabase plans query failed, trying fallback: {e}")

        # Fallback to Google Sheets / hardcoded via PricingService
        return await self._fallback_plans()

    async def _fallback_plans(self) -> List[Dict[str, Any]]:
        """Build plan-like dicts from the existing PricingService (Google Sheets + hardcoded)."""
        try:
            from app.services.pricing_service import PricingService
            if self._settings:
                pricing_svc = PricingService(self._settings)
                pricing = await pricing_svc.get_formatted_pricing()
            else:
                pricing = {}
        except Exception as e:
            logger.error(f"PricingService fallback also failed: {e}")
            pricing = {}

        # Construct minimal plan rows from the pricing dict
        fallback_plans: List[Dict[str, Any]] = []
        plan_meta = {
            "starter": {"name": "Starter", "credits": 200, "max_locations": 2, "is_popular": False},
            "growth": {"name": "Growth", "credits": 500, "max_locations": 5, "is_popular": True},
        }
        for plan_type, meta in plan_meta.items():
            prices = pricing.get(plan_type, {})
            usd = prices.get("USD", {})
            inr = prices.get("INR", {})
            fallback_plans.append({
                "plan_type": plan_type,
                "name": meta["name"],
                "usd_monthly": usd.get("monthly"),
                "usd_yearly": usd.get("yearly"),
                "inr_monthly": inr.get("monthly"),
                "inr_yearly": inr.get("yearly"),
                "usd_unit_price": None,
                "inr_unit_price": None,
                "credits": meta["credits"],
                "max_locations": meta["max_locations"],
                "is_addon": False,
                "is_popular": meta["is_popular"],
                "features": None,
                "limits_config": None,
            })

        # Fallback addon packs
        for credits, plan_type in ADDON_CREDITS_TO_PLAN_TYPE.items():
            usd_prices = {20: 3.99, 50: 6.49, 100: 11.99}
            inr_prices = {20: 299, 50: 499, 100: 899}
            fallback_plans.append({
                "plan_type": plan_type,
                "name": f"{credits} AI Credits Pack",
                "usd_unit_price": usd_prices.get(credits),
                "inr_unit_price": inr_prices.get(credits),
                "credits": credits,
                "is_addon": True,
                "is_popular": False,
            })

        return fallback_plans

    # -------------------------------------------------------------------
    # Public query helpers
    # -------------------------------------------------------------------

    async def get_subscription_plans(self) -> List[Dict[str, Any]]:
        """Return only subscription plans (not addons), excluding free/agency."""
        plans = await self._get_plans()
        return [p for p in plans if not p.get("is_addon")]

    async def get_addon_packs(self) -> List[Dict[str, Any]]:
        """Return only addon credit packs."""
        plans = await self._get_plans()
        return [p for p in plans if p.get("is_addon")]

    async def get_plan_by_type(self, plan_type: str) -> Optional[Dict[str, Any]]:
        """Look up a single plan by plan_type. Includes free/agency defaults."""
        if plan_type == "free":
            return FREE_PLAN_DEFAULTS
        if plan_type == "agency":
            return AGENCY_PLAN_DEFAULTS

        plans = await self._get_plans()
        for p in plans:
            if p.get("plan_type") == plan_type:
                return p
        return None

    async def get_addon_by_credits(self, credits: int) -> Optional[Dict[str, Any]]:
        """Look up an addon pack by credit count (backward compat)."""
        addon_type = ADDON_CREDITS_TO_PLAN_TYPE.get(credits)
        if not addon_type:
            return None
        return await self.get_plan_by_type(addon_type)

    # -------------------------------------------------------------------
    # Response builders
    # -------------------------------------------------------------------

    async def get_formatted_pricing(self) -> Dict[str, Any]:
        """Backward-compatible format: { plan_id: { currency: { monthly, yearly } } }."""
        sub_plans = await self.get_subscription_plans()
        result: Dict[str, Any] = {}
        for p in sub_plans:
            pt = p["plan_type"]
            result[pt] = {}
            if p.get("usd_monthly") is not None:
                result[pt]["USD"] = {
                    "monthly": float(p["usd_monthly"]),
                    "yearly": float(p.get("usd_yearly") or 0),
                }
            if p.get("inr_monthly") is not None:
                result[pt]["INR"] = {
                    "monthly": float(p["inr_monthly"]),
                    "yearly": float(p.get("inr_yearly") or 0),
                }
        return result

    async def get_full_response(self) -> Dict[str, Any]:
        """Enriched response for the /pricing endpoint."""
        all_plans = await self._get_plans()
        sub_plans = [p for p in all_plans if not p.get("is_addon")]
        addon_packs = [p for p in all_plans if p.get("is_addon")]

        # Build plans dict including free & agency
        plans_dict: Dict[str, Any] = {}

        # Free plan
        plans_dict["free"] = {
            **FREE_PLAN_DEFAULTS,
            "pricing": {"USD": {"monthly": 0, "yearly": 0}, "INR": {"monthly": 0, "yearly": 0}},
        }

        # DB-driven subscription plans
        for p in sub_plans:
            pt = p["plan_type"]
            pricing = {}
            if p.get("usd_monthly") is not None:
                pricing["USD"] = {"monthly": float(p["usd_monthly"]), "yearly": float(p.get("usd_yearly") or 0)}
            if p.get("inr_monthly") is not None:
                pricing["INR"] = {"monthly": float(p["inr_monthly"]), "yearly": float(p.get("inr_yearly") or 0)}

            plans_dict[pt] = {
                "plan_type": pt,
                "name": p.get("name"),
                "credits": p.get("credits"),
                "max_locations": p.get("max_locations"),
                "is_popular": p.get("is_popular", False),
                "is_custom": False,
                "features": p.get("features") or [],
                "limits_config": p.get("limits_config") or {},
                "pricing": pricing,
            }

        # Agency plan
        plans_dict["agency"] = {
            **AGENCY_PLAN_DEFAULTS,
            "pricing": {"USD": {"monthly": None, "yearly": None}, "INR": {"monthly": None, "yearly": None}},
        }

        # Addons
        addons_list = []
        for a in addon_packs:
            addon_pricing = {}
            if a.get("usd_unit_price") is not None:
                addon_pricing["USD"] = float(a["usd_unit_price"])
            if a.get("inr_unit_price") is not None:
                addon_pricing["INR"] = float(a["inr_unit_price"])
            addons_list.append({
                "plan_type": a["plan_type"],
                "name": a.get("name"),
                "credits": a.get("credits"),
                "pricing": addon_pricing,
            })

        # Backward-compatible pricing key
        pricing_compat = await self.get_formatted_pricing()

        return {
            "plans": plans_dict,
            "addons": addons_list,
            "pricing": pricing_compat,
        }
