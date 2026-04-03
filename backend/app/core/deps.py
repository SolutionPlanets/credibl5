from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException

from app.gmb.oauth import GoogleOAuthService
from app.core.settings import Settings, get_settings
from app.core.supabase_gateway import SupabaseGateway


# ---------------------------------------------------------------------------
# AI credit cost per action type (1 credit = 1 unit of AI usage)
# ---------------------------------------------------------------------------
AI_CREDIT_COSTS: dict[str, int] = {
    "auto_reply_draft": 1,
    "generate_reply": 1,
    "template_generation": 1,
    "bulk_ai_generate": 1,
}


def get_app_settings() -> Settings:
    return get_settings()


def get_supabase_gateway(settings: Annotated[Settings, Depends(get_app_settings)]) -> SupabaseGateway:
    return SupabaseGateway(settings)


def get_google_oauth(settings: Annotated[Settings, Depends(get_app_settings)]) -> GoogleOAuthService:
    return GoogleOAuthService(settings)


def get_bearer_token(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization bearer token is required.")
    return authorization.removeprefix("Bearer ").strip()


def require_ai_credits(credits_needed: int = 1):
    """
    FastAPI dependency that checks the user has enough AI credits.
    Returns {"user": SupabaseUser, "credits": {...}} on success.
    Raises 402 with INSUFFICIENT_CREDITS code when credits are exhausted.
    """
    async def _check(
        token: Annotated[str, Depends(get_bearer_token)],
        gateway: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
    ) -> dict:
        user = await gateway.get_user_from_access_token(token)
        credit_info = await gateway.get_ai_credits(user.id)

        if credit_info["remaining_ai_credits"] < credits_needed:
            raise HTTPException(
                status_code=402,
                detail={
                    "code": "INSUFFICIENT_CREDITS",
                    "message": (
                        f"You need {credits_needed} AI credit(s) but have "
                        f"{credit_info['remaining_ai_credits']} remaining. "
                        "Purchase more credits or upgrade your plan."
                    ),
                    "remaining_ai_credits": credit_info["remaining_ai_credits"],
                    "total_ai_credits": credit_info["total_ai_credits"],
                },
            )

        return {"user": user, "credits": credit_info}

    return _check
