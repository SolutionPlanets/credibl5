from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.deps import get_bearer_token, get_google_oauth, get_supabase_gateway
from app.gmb.oauth import GoogleOAuthService, GoogleReconnectRequired
from app.gmb.helper import (
    convert_star_rating,
    fetch_gmb_accounts,
    fetch_gmb_locations,
    fetch_gmb_reviews,
    format_address,
    get_error_message,
    get_sentiment,
    is_auth_error,
    upsert_gmb_review_reply,
)
from app.core.supabase_gateway import SupabaseGateway
from app.core.rate_limit import create_rate_limit

router = APIRouter()

_save_location_limit = create_rate_limit(max_requests=20, window_seconds=60)
_sync_reviews_limit = create_rate_limit(max_requests=10, window_seconds=60)

# Simple in-memory cache
# ACCOUNTS_CACHE format: {user_id: {"timestamp": float, "data": Any}}
# LOCATIONS_CACHE format: {(user_id, account_name): {"timestamp": float, "data": Any}}
ACCOUNTS_CACHE: Dict[str, Dict[str, Any]] = {}
LOCATIONS_CACHE: Dict[Tuple[str, str], Dict[str, Any]] = {}
ACCOUNT_LOCKS: Dict[str, asyncio.Lock] = {}
LOCATION_LOCKS: Dict[Tuple[str, str], asyncio.Lock] = {}
ACCOUNT_RATE_LIMIT_UNTIL: Dict[str, float] = {}
LOCATION_RATE_LIMIT_UNTIL: Dict[Tuple[str, str], float] = {}
ACCESS_TOKEN_CACHE: Dict[str, Dict[str, Any]] = {}  # {user_id: {"token": str, "expires_at": float}}
ACCOUNTS_CACHE_TTL = 900  # 15 minutes
LOCATIONS_CACHE_TTL = 300  # 5 minutes
ACCESS_TOKEN_REFRESH_BUFFER = 300  # Refresh 5 minutes before expiry
GOOGLE_RATE_LIMIT_COOLDOWN_SECONDS = 65


def _get_account_lock(user_id: str) -> asyncio.Lock:
    lock = ACCOUNT_LOCKS.get(user_id)
    if lock is None:
        lock = asyncio.Lock()
        ACCOUNT_LOCKS[user_id] = lock
    return lock


def _get_location_lock(cache_key: Tuple[str, str]) -> asyncio.Lock:
    lock = LOCATION_LOCKS.get(cache_key)
    if lock is None:
        lock = asyncio.Lock()
        LOCATION_LOCKS[cache_key] = lock
    return lock


def _invalidate_access_token_cache(user_id: str) -> None:
    ACCESS_TOKEN_CACHE.pop(user_id, None)


async def _force_refresh_access_token(
    user_id: str,
    supabase: SupabaseGateway,
    google_oauth: GoogleOAuthService,
) -> str:
    """Invalidate cache and fetch a brand-new access token."""
    _invalidate_access_token_cache(user_id)
    return await _get_access_token(user_id, supabase, google_oauth)


async def _get_access_token(
    user_id: str,
    supabase: SupabaseGateway,
    google_oauth: GoogleOAuthService,
) -> str:
    cached = ACCESS_TOKEN_CACHE.get(user_id)
    if cached and time.time() < cached["expires_at"] - ACCESS_TOKEN_REFRESH_BUFFER:
        logger.debug("Access token cache hit for user %s", user_id)
        return cached["token"]

    logger.info("Refreshing access token for user %s", user_id)
    connection = await supabase.get_google_connection(user_id)
    if not connection or not connection.get("refresh_token"):
        raise HTTPException(
            status_code=401,
            detail="Google account not connected. Please connect your Google account first.",
        )

    try:
        token_data = await google_oauth.refresh_access_token(connection["refresh_token"])
    except GoogleReconnectRequired:
        _invalidate_access_token_cache(user_id)
        raise

    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=401, detail="Failed to obtain Google access token.")

    expires_in = int(token_data.get("expires_in", 3600))
    ACCESS_TOKEN_CACHE[user_id] = {
        "token": access_token,
        "expires_at": time.time() + expires_in,
    }
    return access_token


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class SaveLocationRequest(BaseModel):
    gmbAccountId: str
    locationId: str
    locationName: str
    address: Optional[Any] = None


class SyncReviewsRequest(BaseModel):
    locationId: str


class ReplyReviewRequest(BaseModel):
    locationId: str   # Supabase location UUID
    gmbReviewId: str  # Google review identifier (full path or short ID)
    reply: str


def _parse_iso_datetime(value: Any) -> Optional[datetime]:
    if not value or not isinstance(value, str):
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/accounts")
async def get_accounts(
    supabase: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
    google_oauth: Annotated[GoogleOAuthService, Depends(get_google_oauth)],
    access_token: Annotated[str, Depends(get_bearer_token)],
) -> Dict[str, Any]:
    user = await supabase.get_user_from_access_token(access_token)
    now = time.time()

    # Fast-path cache check before lock.
    if user.id in ACCOUNTS_CACHE:
        cached = ACCOUNTS_CACHE[user.id]
        if time.time() - cached["timestamp"] < ACCOUNTS_CACHE_TTL:
            return {"accounts": cached["data"], "cached": True}

    rate_limit_until = ACCOUNT_RATE_LIMIT_UNTIL.get(user.id, 0.0)
    if now < rate_limit_until:
        retry_in = max(1, int(rate_limit_until - now))
        if user.id in ACCOUNTS_CACHE:
            return {"accounts": ACCOUNTS_CACHE[user.id]["data"], "cached": True}
        raise HTTPException(
            status_code=429,
            detail=f"Google rate limit is active. Please retry in about {retry_in} seconds.",
        )

    lock = _get_account_lock(user.id)
    async with lock:
        now = time.time()

        # Re-check inside the lock to dedupe concurrent requests.
        if user.id in ACCOUNTS_CACHE:
            cached = ACCOUNTS_CACHE[user.id]
            if time.time() - cached["timestamp"] < ACCOUNTS_CACHE_TTL:
                return {"accounts": cached["data"], "cached": True}

        rate_limit_until = ACCOUNT_RATE_LIMIT_UNTIL.get(user.id, 0.0)
        if now < rate_limit_until:
            retry_in = max(1, int(rate_limit_until - now))
            if user.id in ACCOUNTS_CACHE:
                return {"accounts": ACCOUNTS_CACHE[user.id]["data"], "cached": True}
            raise HTTPException(
                status_code=429,
                detail=f"Google rate limit is active. Please retry in about {retry_in} seconds.",
            )

        google_token = await _get_access_token(user.id, supabase, google_oauth)

        async def _refresh_cb() -> str:
            return await _force_refresh_access_token(user.id, supabase, google_oauth)

        try:
            accounts = await fetch_gmb_accounts(google_token, refresh_callback=_refresh_cb)
            ACCOUNT_RATE_LIMIT_UNTIL.pop(user.id, None)
            ACCOUNTS_CACHE[user.id] = {"timestamp": time.time(), "data": accounts}
            return {"accounts": accounts}
        except HTTPException as exc:
            if exc.status_code in (401, 403):
                _invalidate_access_token_cache(user.id)
            # If rate-limited but we have any cached data, serve it (even if stale).
            if exc.status_code == 429 and user.id in ACCOUNTS_CACHE:
                return {
                    "accounts": ACCOUNTS_CACHE[user.id]["data"],
                    "cached": True,
                    "stale": True,
                    "rate_limited": True,
                    "message": "Google rate limit reached. Showing your cached accounts. Please retry in about 1 minute."
                }
            if exc.status_code == 429:
                ACCOUNT_RATE_LIMIT_UNTIL[user.id] = time.time() + GOOGLE_RATE_LIMIT_COOLDOWN_SECONDS
                raise
            raise
        except Exception as exc:
            if is_auth_error(exc):
                _invalidate_access_token_cache(user.id)
            if user.id in ACCOUNTS_CACHE:
                return {"accounts": ACCOUNTS_CACHE[user.id]["data"], "cached": True, "stale": True}

            # Re-raise with descriptive error message if it's already an HTTPException
            if isinstance(exc, HTTPException):
                raise

            status_code = 401 if is_auth_error(exc) else 500
            detail = get_error_message(exc)

            # Specifically handle GMB auth errors
            if "google" in detail.lower() or "token" in detail.lower():
                detail = {
                    "code": "GOOGLE_AUTH_ERROR",
                    "message": f"Google connection error: {detail}. Please reconnect your account.",
                    "original_error": detail
                }

            raise HTTPException(status_code=status_code, detail=detail)


@router.get("/locations")
async def get_locations(
    account_name: Annotated[str, Query(alias="accountName")],
    supabase: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
    google_oauth: Annotated[GoogleOAuthService, Depends(get_google_oauth)],
    access_token: Annotated[str, Depends(get_bearer_token)],
) -> Dict[str, Any]:
    if not account_name:
        raise HTTPException(status_code=400, detail="accountName query parameter is required.")

    user = await supabase.get_user_from_access_token(access_token)
    now = time.time()
    
    cache_key = (user.id, account_name)
    # Fast-path cache check before lock.
    if cache_key in LOCATIONS_CACHE:
        cached = LOCATIONS_CACHE[cache_key]
        if time.time() - cached["timestamp"] < LOCATIONS_CACHE_TTL:
            return {"locations": cached["data"], "cached": True}

    rate_limit_until = LOCATION_RATE_LIMIT_UNTIL.get(cache_key, 0.0)
    if now < rate_limit_until:
        retry_in = max(1, int(rate_limit_until - now))
        if cache_key in LOCATIONS_CACHE:
            return {"locations": LOCATIONS_CACHE[cache_key]["data"], "cached": True}
        raise HTTPException(
            status_code=429,
            detail=f"Google rate limit is active. Please retry in about {retry_in} seconds.",
        )

    lock = _get_location_lock(cache_key)
    async with lock:
        now = time.time()

        if cache_key in LOCATIONS_CACHE:
            cached = LOCATIONS_CACHE[cache_key]
            if time.time() - cached["timestamp"] < LOCATIONS_CACHE_TTL:
                return {"locations": cached["data"], "cached": True}

        rate_limit_until = LOCATION_RATE_LIMIT_UNTIL.get(cache_key, 0.0)
        if now < rate_limit_until:
            retry_in = max(1, int(rate_limit_until - now))
            if cache_key in LOCATIONS_CACHE:
                return {"locations": LOCATIONS_CACHE[cache_key]["data"], "cached": True}
            raise HTTPException(
                status_code=429,
                detail=f"Google rate limit is active. Please retry in about {retry_in} seconds.",
            )

        google_token = await _get_access_token(user.id, supabase, google_oauth)

        async def _refresh_cb() -> str:
            return await _force_refresh_access_token(user.id, supabase, google_oauth)

        try:
            raw_locations = await fetch_gmb_locations(google_token, account_name, refresh_callback=_refresh_cb)
            LOCATION_RATE_LIMIT_UNTIL.pop(cache_key, None)
            formatted = [
                {
                    "name": loc.get("name"),
                    "title": loc.get("title"),
                    "address": format_address(loc.get("storefrontAddress")),
                    "phone": loc.get("phoneNumbers", {}).get("primaryPhone", ""),
                    "website": loc.get("websiteUri", ""),
                    "category": loc.get("categories", {}).get("primaryCategory", {}).get("displayName", ""),
                }
                for loc in raw_locations
            ]
            LOCATIONS_CACHE[cache_key] = {"timestamp": time.time(), "data": formatted}
            return {"locations": formatted}
        except HTTPException as exc:
            if exc.status_code in (401, 403):
                _invalidate_access_token_cache(user.id)
            if exc.status_code == 429 and cache_key in LOCATIONS_CACHE:
                return {
                    "locations": LOCATIONS_CACHE[cache_key]["data"],
                    "cached": True,
                    "stale": True,
                    "rate_limited": True,
                    "message": "Google rate limit reached. Showing your cached locations. Please retry in about 1 minute."
                }
            if exc.status_code == 429:
                LOCATION_RATE_LIMIT_UNTIL[cache_key] = time.time() + GOOGLE_RATE_LIMIT_COOLDOWN_SECONDS
                raise
            raise
        except Exception as exc:
            if is_auth_error(exc):
                _invalidate_access_token_cache(user.id)
            if cache_key in LOCATIONS_CACHE:
                return {"locations": LOCATIONS_CACHE[cache_key]["data"], "cached": True, "stale": True}

            if isinstance(exc, HTTPException):
                raise

            status_code = 401 if is_auth_error(exc) else 500
            detail = get_error_message(exc)

            if "google" in detail.lower() or "token" in detail.lower():
                detail = {
                    "code": "GOOGLE_AUTH_ERROR",
                    "message": f"Google connection error: {detail}. Please reconnect your account.",
                    "original_error": detail
                }

            raise HTTPException(status_code=status_code, detail=detail)


@router.post("/locations/save")
async def save_location(
    body: SaveLocationRequest,
    supabase: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
    access_token: Annotated[str, Depends(get_bearer_token)],
    _rate_limit: Annotated[None, Depends(_save_location_limit)] = None,
) -> Dict[str, Any]:
    if not body.gmbAccountId:
        raise HTTPException(status_code=400, detail="Google Account ID is missing. Please select an account.")

    user = await supabase.get_user_from_access_token(access_token)

    try:
        now_utc = datetime.now(timezone.utc)
        existing = await supabase.get_location_by_gmb_location_id(user.id, body.locationId)
        sub = await supabase.get_user_subscription(user.id)

        plan_type = str((sub or {}).get("plan_type") or "free")
        billing_cycle = str((sub or {}).get("billing_cycle") or "trial")
        max_locs = int((sub or {}).get("max_locations") or 1)
        cycle_end_raw = (sub or {}).get("current_period_end")
        cycle_end_dt = _parse_iso_datetime(cycle_end_raw)
        if cycle_end_dt is None:
            cycle_end_dt = now_utc + timedelta(days=30)
        cycle_end_iso = cycle_end_dt.isoformat()

        # Backend-triggered lifecycle:
        # deactivate stale active selections when cycle ended or plan changed.
        active_locations = await supabase.get_user_active_locations(user.id)
        deactivate_ids: List[str] = []
        for row in active_locations:
            locked_until = _parse_iso_datetime(row.get("activation_locked_until"))
            activated_plan_type = row.get("activated_plan_type")
            activated_billing_cycle = row.get("activated_billing_cycle")

            plan_changed = (
                activated_plan_type is not None
                and activated_plan_type != plan_type
            ) or (
                activated_billing_cycle is not None
                and activated_billing_cycle != billing_cycle
            )
            cycle_expired = locked_until is not None and now_utc >= locked_until
            legacy_unlocked = locked_until is None

            if plan_changed or cycle_expired or legacy_unlocked:
                if row.get("id"):
                    deactivate_ids.append(str(row["id"]))

        if deactivate_ids:
            await supabase.deactivate_locations(deactivate_ids)

        existing_is_active = bool(existing and existing.get("is_active"))
        if existing and existing.get("id") and str(existing["id"]) in deactivate_ids:
            existing_is_active = False

        limit_reached = False
        # Enforce plan limit only on new activation.
        if not existing_is_active:
            current_active_count = await supabase.count_user_active_locations(user.id)
            if max_locs != -1 and current_active_count >= max_locs:
                limit_reached = True

        location_data: Dict[str, Any] = {
            "user_id": user.id,
            "email": user.email,
            "gmb_account_id": body.gmbAccountId,
            "location_id": body.locationId,
            "location_name": body.locationName,
            "address": body.address,
            "updated_at": now_utc.isoformat(),
        }

        # Activate and lock this location for the current plan cycle.
        if not existing_is_active:
            if limit_reached:
                location_data.update({"is_active": False})
            else:
                location_data.update(
                    {
                        "is_active": True,
                        "activated_at": now_utc.isoformat(),
                        "activation_locked_until": cycle_end_iso,
                        "activated_plan_type": plan_type,
                        "activated_billing_cycle": billing_cycle,
                    }
                )

        if existing:
            location_data["id"] = existing["id"]

        result = await supabase.upsert_location(location_data)
        
        if limit_reached:
            return {
                "success": True,
                "location": result,
                "message": f"Location saved, but not activated because you have reached your plan limit of {max_locs} active locations.",
                "limit_reached": True,
            }

        return {
            "success": True,
            "location": result,
            "message": "Location activated successfully for your current plan cycle.",
            "limit_reached": False,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/reviews/sync")
async def sync_reviews(
    body: SyncReviewsRequest,
    supabase: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
    google_oauth: Annotated[GoogleOAuthService, Depends(get_google_oauth)],
    access_token: Annotated[str, Depends(get_bearer_token)],
    _rate_limit: Annotated[None, Depends(_sync_reviews_limit)] = None,
) -> Dict[str, Any]:
    user = await supabase.get_user_from_access_token(access_token)
    google_token = await _get_access_token(user.id, supabase, google_oauth)

    async def _refresh_cb() -> str:
        return await _force_refresh_access_token(user.id, supabase, google_oauth)

    location = await supabase.get_location_for_user_by_id(user.id, body.locationId)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found.")

    acc_id = location.get('gmb_account_id', '').split('/')[-1]
    loc_id = location.get('location_id', '').split('/')[-1]

    if not acc_id:
        # Self-healing: Find account ID automatically
        accounts = await fetch_gmb_accounts(google_token, refresh_callback=_refresh_cb)
        for acc in accounts:
            acc_name = acc.get('name')
            if not acc_name:
                continue
            locs = await fetch_gmb_locations(google_token, acc_name, refresh_callback=_refresh_cb)
            if any(l.get('name', '').split('/')[-1] == loc_id for l in locs):
                acc_id = acc_name.split('/')[-1]
                break

        if not acc_id:
            logger.error("Could not auto-discover gmb_account_id for location %s", loc_id)
            raise HTTPException(
                status_code=400,
                detail="This location is missing its Google Account ID and we could not auto-recover it. Please re-add this location from the dashboard."
            )

        logger.info("Auto-recovered gmb_account_id %s for location %s", acc_id, loc_id)
        try:
            update_data = {
                "id": location["id"],
                "gmb_account_id": acc_id,
                "user_id": user.id,
                "location_id": location.get("location_id"),
                "location_name": location.get("location_name")
            }
            await supabase.upsert_location(update_data)
        except Exception as e:
            logger.warning("Failed to save recovered gmb_account_id: %s", e)

    gmb_path = f"accounts/{acc_id}/locations/{loc_id}"

    try:
        # Always fetch all reviews — client handles deduplication in IndexedDB
        gmb_reviews, pages_fetched = await fetch_gmb_reviews(
            google_token, gmb_path,
            known_review_ids=None,
            refresh_callback=_refresh_cb,
        )
        logger.info(
            "sync_reviews: location=%s pages=%d fetched=%d",
            body.locationId, pages_fetched, len(gmb_reviews),
        )

        if not gmb_reviews:
            logger.warning(
                "sync_reviews: 0 reviews — locationId=%s gmb_path=%s pages=%d",
                body.locationId, gmb_path, pages_fetched,
            )
            return {
                "success": True,
                "reviews": [],
                "count": 0,
                "pagesFetched": pages_fetched,
                "gmb_path": gmb_path,
                "message": "No reviews found for this location.",
            }

        now_iso = datetime.now(timezone.utc).isoformat()
        batch: List[Dict[str, Any]] = []
        for review in gmb_reviews:
            star_rating = convert_star_rating(review.get("starRating"))
            reply_obj = review.get("reviewReply")
            reviewer = review.get("reviewer", {})
            batch.append({
                "location_id": body.locationId,
                "gmb_review_id": review.get("reviewId") or review.get("name"),
                "reviewer_name": reviewer.get("displayName", "Anonymous"),
                "reviewer_profile_photo_url": reviewer.get("profilePhotoUrl"),
                "star_rating": star_rating,
                "review_text": review.get("comment", ""),
                "review_date": review.get("createTime"),
                "sentiment": get_sentiment(star_rating, review.get("comment", "")),
                "is_read": False,
                "review_reply": reply_obj.get("comment") if reply_obj else None,
                "synced_at": now_iso,
            })

        # Reviews are returned to the client for browser storage — not persisted to Supabase
        return {
            "success": True,
            "reviews": batch,
            "count": len(batch),
            "pagesFetched": pages_fetched,
            "message": f"Fetched {len(batch)} reviews from Google.",
        }
    except HTTPException as exc:
        if exc.status_code in (401, 403):
            _invalidate_access_token_cache(user.id)
        raise
    except Exception as exc:
        if is_auth_error(exc):
            _invalidate_access_token_cache(user.id)
        raise HTTPException(status_code=500, detail=get_error_message(exc))


@router.post("/reviews/reply")
async def reply_review(
    body: ReplyReviewRequest,
    supabase: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
    google_oauth: Annotated[GoogleOAuthService, Depends(get_google_oauth)],
    access_token: Annotated[str, Depends(get_bearer_token)],
) -> Dict[str, Any]:
    user = await supabase.get_user_from_access_token(access_token)

    reply_text = body.reply.strip()
    if not reply_text:
        raise HTTPException(status_code=400, detail="Reply cannot be empty.")
    if len(reply_text) > 4096:
        raise HTTPException(status_code=400, detail="Reply exceeds 4096 characters.")

    gmb_review_id = body.gmbReviewId.strip()
    if not gmb_review_id:
        raise HTTPException(status_code=400, detail="gmbReviewId is required.")

    location_id = body.locationId.strip()
    if not location_id:
        raise HTTPException(status_code=400, detail="locationId is required.")

    location = await supabase.get_location_for_user_by_id(user.id, location_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found.")

    if (
        gmb_review_id.startswith("accounts/")
        and "/locations/" in gmb_review_id
        and "/reviews/" in gmb_review_id
    ):
        review_path = gmb_review_id
    else:
        acc_id = location['gmb_account_id'].split('/')[-1]
        loc_id = location['location_id'].split('/')[-1]
        review_id = gmb_review_id.split('/')[-1]
        review_path = f"accounts/{acc_id}/locations/{loc_id}/reviews/{review_id}"

    google_token = await _get_access_token(user.id, supabase, google_oauth)

    async def _refresh_cb() -> str:
        return await _force_refresh_access_token(user.id, supabase, google_oauth)

    try:
        google_reply = await upsert_gmb_review_reply(
            access_token=google_token,
            review_path=review_path,
            reply_comment=reply_text,
            refresh_callback=_refresh_cb,
        )

        return {
            "success": True,
            "gmbReviewId": gmb_review_id,
            "reply": google_reply.get("comment", reply_text),
            "message": "Reply posted successfully.",
        }
    except HTTPException as exc:
        if exc.status_code in (401, 403):
            _invalidate_access_token_cache(user.id)
        raise
    except Exception as exc:
        if is_auth_error(exc):
            _invalidate_access_token_cache(user.id)
        raise HTTPException(status_code=500, detail=get_error_message(exc))
