from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException

from ..gmb.oauth import GoogleOAuthService
from .settings import Settings, get_settings
from .supabase_gateway import SupabaseGateway


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
