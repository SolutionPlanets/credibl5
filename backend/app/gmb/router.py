from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from typing import Annotated, Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.deps import get_bearer_token, get_google_oauth, get_supabase_gateway
from app.gmb.oauth import GoogleOAuthService
from app.gmb.helper import (
    convert_star_rating,
    fetch_gmb_accounts,
    fetch_gmb_locations,
    fetch_gmb_reviews,
    format_address,
    get_error_message,
    get_sentiment,
    is_auth_error,
)
from app.core.supabase_gateway import SupabaseGateway

router = APIRouter()

# Simple in-memory cache
# ACCOUNTS_CACHE format: {user_id: {"timestamp": float, "data": Any}}
# LOCATIONS_CACHE format: {(user_id, account_name): {"timestamp": float, "data": Any}}
ACCOUNTS_CACHE: Dict[str, Dict[str, Any]] = {}
LOCATIONS_CACHE: Dict[Tuple[str, str], Dict[str, Any]] = {}
ACCOUNT_LOCKS: Dict[str, asyncio.Lock] = {}
LOCATION_LOCKS: Dict[Tuple[str, str], asyncio.Lock] = {}
ACCOUNT_RATE_LIMIT_UNTIL: Dict[str, float] = {}
LOCATION_RATE_LIMIT_UNTIL: Dict[Tuple[str, str], float] = {}
ACCOUNTS_CACHE_TTL = 900  # 15 minutes
LOCATIONS_CACHE_TTL = 300  # 5 minutes
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


async def _get_access_token(
    user_id: str,
    supabase: SupabaseGateway,
    google_oauth: GoogleOAuthService,
) -> str:
    connection = await supabase.get_google_connection(user_id)
    if not connection or not connection.get("refresh_token"):
        raise HTTPException(
            status_code=401,
            detail="Google account not connected. Please connect your Google account first.",
        )
    token_data = await google_oauth.refresh_access_token(connection["refresh_token"])
    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=401, detail="Failed to obtain Google access token.")
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

        try:
            accounts = await fetch_gmb_accounts(google_token)
            ACCOUNT_RATE_LIMIT_UNTIL.pop(user.id, None)
            ACCOUNTS_CACHE[user.id] = {"timestamp": time.time(), "data": accounts}
            return {"accounts": accounts}
        except HTTPException as exc:
            # If rate-limited but we have any cached data, serve it (even if stale).
            if exc.status_code == 429 and user.id in ACCOUNTS_CACHE:
                return {"accounts": ACCOUNTS_CACHE[user.id]["data"], "cached": True}
            if exc.status_code == 429:
                ACCOUNT_RATE_LIMIT_UNTIL[user.id] = time.time() + GOOGLE_RATE_LIMIT_COOLDOWN_SECONDS
                raise HTTPException(
                    status_code=429,
                    detail="Google rate limit reached while fetching accounts. Please retry in about 1 minute.",
                )
            raise
        except Exception as exc:
            if user.id in ACCOUNTS_CACHE:
                return {"accounts": ACCOUNTS_CACHE[user.id]["data"], "cached": True}
            status_code = 401 if is_auth_error(exc) else 500
            raise HTTPException(status_code=status_code, detail=get_error_message(exc))


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

        try:
            raw_locations = await fetch_gmb_locations(google_token, account_name)
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
            if exc.status_code == 429 and cache_key in LOCATIONS_CACHE:
                return {"locations": LOCATIONS_CACHE[cache_key]["data"], "cached": True}
            if exc.status_code == 429:
                LOCATION_RATE_LIMIT_UNTIL[cache_key] = time.time() + GOOGLE_RATE_LIMIT_COOLDOWN_SECONDS
            raise
        except Exception as exc:
            if cache_key in LOCATIONS_CACHE:
                return {"locations": LOCATIONS_CACHE[cache_key]["data"], "cached": True}
            status_code = 401 if is_auth_error(exc) else 500
            raise HTTPException(status_code=status_code, detail=get_error_message(exc))


@router.post("/locations/save")
async def save_location(
    body: SaveLocationRequest,
    supabase: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
    access_token: Annotated[str, Depends(get_bearer_token)],
) -> Dict[str, Any]:
    user = await supabase.get_user_from_access_token(access_token)

    try:
        existing = await supabase.get_location_by_gmb_location_id(user.id, body.locationId)
        
        # Check plan limits for new locations
        if not existing:
            sub = await supabase.get_user_subscription(user.id)
            if sub:
                max_locs = sub.get("max_locations", 1)
                current_count = await supabase.count_user_locations(user.id)
                if current_count >= max_locs:
                    raise HTTPException(
                        status_code=403,
                        detail={
                            "code": "PLAN_LIMIT_REACHED",
                            "message": f"You have reached your limit of {max_locs} location(s). Please upgrade your plan to add more.",
                            "limit": max_locs,
                            "current": current_count
                        }
                    )

        location_data: Dict[str, Any] = {
            "user_id": user.id,
            "gmb_account_id": body.gmbAccountId,
            "location_id": body.locationId,
            "location_name": body.locationName,
            "address": body.address,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if existing:
            location_data["id"] = existing["id"]

        result = await supabase.upsert_location(location_data)
        return {"success": True, "location": result, "message": "Location saved successfully."}
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
) -> Dict[str, Any]:
    user = await supabase.get_user_from_access_token(access_token)
    google_token = await _get_access_token(user.id, supabase, google_oauth)

    location = await supabase.get_location_by_id(body.locationId)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found.")

    gmb_path = f"accounts/{location['gmb_account_id']}/locations/{location['location_id']}"

    try:
        known_ids = await supabase.get_review_gmb_ids(body.locationId)
        gmb_reviews = await fetch_gmb_reviews(google_token, gmb_path, known_review_ids=known_ids if known_ids else None)

        if not gmb_reviews:
            return {
                "success": True,
                "syncedCount": 0,
                "totalReviews": len(known_ids),
                "message": "All reviews are up to date." if known_ids else "No reviews found.",
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
                "review_reply": reply_obj.get("comment", "") if reply_obj else None,
                "synced_at": now_iso,
            })

        synced_count = await supabase.batch_upsert_reviews(batch)
        total = len(known_ids) + synced_count

        return {
            "success": True,
            "syncedCount": synced_count,
            "totalReviews": total,
            "message": f"Synced {synced_count} new reviews. Total: {total}",
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=get_error_message(exc))
