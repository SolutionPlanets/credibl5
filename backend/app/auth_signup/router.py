from __future__ import annotations

import time
from typing import Annotated
from urllib.parse import urlencode, urlsplit, urlunsplit, parse_qsl

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

from ..core.deps import get_app_settings, get_bearer_token, get_google_oauth, get_supabase_gateway
from ..gmb.oauth import GoogleOAuthService
from ..core.settings import Settings
from ..core.supabase_gateway import SupabaseGateway
from ..core.state_token import StateTokenError, sign_state, verify_state

router = APIRouter()

def add_query_param(url: str, key: str, value: str) -> str:
    split_url = urlsplit(url)
    query_items = parse_qsl(split_url.query, keep_blank_values=True)
    query_items.append((key, value))
    return urlunsplit(
        (split_url.scheme, split_url.netloc, split_url.path, urlencode(query_items), split_url.fragment)
    )

@router.get("/google/url")
async def create_google_oauth_url(
    settings: Annotated[Settings, Depends(get_app_settings)],
    supabase: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
    google_oauth: Annotated[GoogleOAuthService, Depends(get_google_oauth)],
    access_token: Annotated[str, Depends(get_bearer_token)],
    next_path: Annotated[str | None, Query(alias="next")] = None,
) -> dict[str, str]:
    print(f"[*] Create Google OAuth URL hit for next_path: {next_path}")
    user = await supabase.get_user_from_access_token(access_token)
    safe_next_path = settings.normalize_next_path(next_path)

    payload = {
        "sub": user.id,
        "email": user.email,
        "next": safe_next_path,
        "exp": int(time.time()) + settings.oauth_state_ttl_seconds,
    }
    state = sign_state(payload, settings.oauth_state_secret)

    return {"authorization_url": google_oauth.build_authorization_url(state)}

@router.get("/google/callback")
async def google_callback(
    settings: Annotated[Settings, Depends(get_app_settings)],
    supabase: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
    google_oauth: Annotated[GoogleOAuthService, Depends(get_google_oauth)],
    code: Annotated[str | None, Query()] = None,
    state: Annotated[str | None, Query()] = None,
    error: Annotated[str | None, Query()] = None,
    error_description: Annotated[str | None, Query()] = None,
) -> RedirectResponse:
    protected_url = f"{settings.normalized_frontend_url}/protected"
    if error:
        error_message = error_description or error
        return RedirectResponse(add_query_param(protected_url, "google", f"oauth_error:{error_message}"))

    if not code or not state:
        return RedirectResponse(add_query_param(protected_url, "google", "missing_code"))

    try:
        state_payload = verify_state(state, settings.oauth_state_secret)
    except StateTokenError:
        return RedirectResponse(add_query_param(protected_url, "google", "invalid_state"))

    user_id = str(state_payload.get("sub", ""))
    if not user_id:
        return RedirectResponse(add_query_param(protected_url, "google", "invalid_state"))

    safe_next_path = settings.normalize_next_path(state_payload.get("next"))
    redirect_target = f"{settings.normalized_frontend_url}{safe_next_path}"

    try:
        token_data = await google_oauth.exchange_code(code)
    except HTTPException:
        return RedirectResponse(add_query_param(redirect_target, "google", "token_exchange_failed"))

    provider_refresh_token = token_data.get("refresh_token")
    existing_connection = await supabase.get_google_connection(user_id)

    if not provider_refresh_token and not existing_connection:
        return RedirectResponse(add_query_param(redirect_target, "google", "missing_refresh_token"))

    try:
        if provider_refresh_token:
            await supabase.upsert_google_refresh_token(user_id, provider_refresh_token)
        await supabase.mark_google_connected(user_id, state_payload.get("email"))
    except HTTPException:
        return RedirectResponse(add_query_param(redirect_target, "google", "save_failed"))

    return RedirectResponse(add_query_param(redirect_target, "google", "connected"))

@router.post("/google/refresh")
async def refresh_google_access_token(
    supabase: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
    google_oauth: Annotated[GoogleOAuthService, Depends(get_google_oauth)],
    access_token: Annotated[str, Depends(get_bearer_token)],
) -> dict[str, str | int]:
    user = await supabase.get_user_from_access_token(access_token)
    existing_connection = await supabase.get_google_connection(user.id)

    if not existing_connection or not existing_connection.get("refresh_token"):
        raise HTTPException(status_code=404, detail="No stored Google refresh token for this user.")

    refreshed = await google_oauth.refresh_access_token(existing_connection["refresh_token"])

    return {
        "access_token": refreshed.get("access_token", ""),
        "token_type": refreshed.get("token_type", "Bearer"),
        "expires_in": int(refreshed.get("expires_in", 0)),
        "scope": refreshed.get("scope", ""),
    }

@router.get("/google/status")
async def get_google_auth_status(
    supabase: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
    access_token: Annotated[str, Depends(get_bearer_token)],
) -> dict[str, bool]:
    user = await supabase.get_user_from_access_token(access_token)
    connection = await supabase.get_google_connection(user.id)

    has_refresh_token = False
    if connection and connection.get("refresh_token"):
        has_refresh_token = True

    return {"has_refresh_token": has_refresh_token}
