from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..core.deps import get_bearer_token, get_google_oauth, get_supabase_gateway
from .oauth import GoogleOAuthService
from .helper import (
    convert_star_rating,
    fetch_gmb_accounts,
    fetch_gmb_locations,
    fetch_gmb_reviews,
    format_address,
    get_error_message,
    get_sentiment,
    is_auth_error,
)
from ..core.supabase_gateway import SupabaseGateway

router = APIRouter()


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
    google_token = await _get_access_token(user.id, supabase, google_oauth)

    try:
        accounts = await fetch_gmb_accounts(google_token)
        return {"accounts": accounts}
    except HTTPException:
        raise
    except Exception as exc:
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
    google_token = await _get_access_token(user.id, supabase, google_oauth)

    try:
        raw_locations = await fetch_gmb_locations(google_token, account_name)
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
        return {"locations": formatted}
    except HTTPException:
        raise
    except Exception as exc:
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
