from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional, Set

import httpx
from fastapi import HTTPException

_ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"
_LOCATIONS_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"
_REVIEWS_BASE = "https://mybusiness.googleapis.com/v4"

_STAR_MAP = {
    "ONE": 1,
    "TWO": 2,
    "THREE": 3,
    "FOUR": 4,
    "FIVE": 5,
}


def convert_star_rating(rating_str: Optional[str]) -> int:
    if not rating_str:
        return 0
    return _STAR_MAP.get(str(rating_str).upper(), 0)


_NEGATIVE_KEYWORDS = frozenset({
    "worst", "terrible", "horrible", "awful", "disgusting", "unacceptable",
    "rude", "scam", "fraud", "never again", "waste", "disappoint", "disappoint",
    "poor", "bad", "hate", "useless", "broken", "wrong", "upset", "angry",
    "incompetent", "unprofessional", "lied", "liar", "cheated", "cheat",
    "mislead", "misleading", "refused", "ignored", "overcharge", "overpriced",
    "nightmare", "disaster",
})

_POSITIVE_KEYWORDS = frozenset({
    "excellent", "amazing", "outstanding", "fantastic", "wonderful", "perfect",
    "great", "awesome", "love", "loved", "best", "highly recommend", "recommend",
    "superb", "exceptional", "impressed", "impressed", "brilliant", "top notch",
    "fabulous", "delightful", "stellar", "five star", "5 star", "A+",
    "friendly", "helpful", "professional", "efficient", "quick", "fast",
    "clean", "fresh", "quality", "value", "worth", "satisfied", "happy",
    "pleased", "glad", "thankful", "grateful",
})


def get_sentiment(star_rating: int, review_text: str = "") -> str:
    """
    Determine sentiment using a two-pass approach:
    1. Star rating gives the base signal (most reliable for GMB).
    2. Review text keyword analysis can upgrade/downgrade borderline cases.
    """
    text = review_text.lower() if review_text else ""

    # Count keyword signals in the review text
    negative_hits = sum(1 for kw in _NEGATIVE_KEYWORDS if kw in text)
    positive_hits = sum(1 for kw in _POSITIVE_KEYWORDS if kw in text)
    text_lean = positive_hits - negative_hits  # positive = lean positive, negative = lean negative

    # Definitive cases from star rating alone
    if star_rating == 5:
        # Only override to neutral if strong negative language is present (e.g. "loved everything except...")
        if negative_hits >= 3 and positive_hits == 0:
            return "neutral"
        return "positive"

    if star_rating == 4:
        # Strong negative text on a 4-star review → neutral
        if text_lean <= -2:
            return "neutral"
        return "positive"

    if star_rating == 3:
        # Keyword tiebreaker for 3-star reviews
        if text_lean >= 2:
            return "positive"
        if text_lean <= -2:
            return "negative"
        return "neutral"

    if star_rating == 2:
        # Strong positive text on a 2-star review → neutral
        if text_lean >= 2:
            return "neutral"
        return "negative"

    if star_rating == 1:
        # Only override to neutral if review is overwhelmingly positive text (rare edge case)
        if positive_hits >= 3 and negative_hits == 0:
            return "neutral"
        return "negative"

    # Fallback when star_rating is 0 / unknown
    if text_lean > 0:
        return "positive"
    if text_lean < 0:
        return "negative"
    return "neutral"


def format_address(address_obj: Optional[Dict[str, Any]]) -> str:
    if not address_obj:
        return ""
    parts: List[str] = []
    lines = address_obj.get("addressLines") or []
    if isinstance(lines, list):
        parts.extend(str(line) for line in lines if line)
    for key in ("locality", "administrativeArea", "postalCode", "regionCode"):
        value = address_obj.get(key)
        if value:
            parts.append(str(value))
    return ", ".join(parts)


def is_auth_error(error: Exception) -> bool:
    msg = str(error).lower()
    return "401" in msg or "403" in msg or "unauthorized" in msg or "forbidden" in msg


def get_error_message(error: Exception) -> str:
    if hasattr(error, "detail"):
        return str(error.detail)
    return str(error)


def _auth_headers(access_token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def _parse_retry_after(value: Optional[str]) -> Optional[float]:
    if not value:
        return None
    try:
        seconds = float(value)
    except ValueError:
        return None
    return max(0.0, seconds)


async def _get_with_rate_limit_retry(
    client: httpx.AsyncClient,
    url: str,
    headers: Dict[str, str],
    params: Optional[Dict[str, Any]] = None,
    retries: int = 2,
) -> httpx.Response:
    response: Optional[httpx.Response] = None
    for attempt in range(retries + 1):
        response = await client.get(url, headers=headers, params=params)
        if response.status_code != 429:
            return response

        if attempt == retries:
            return response

        retry_after = _parse_retry_after(response.headers.get("Retry-After"))
        delay_seconds = retry_after if retry_after is not None else min(1.5 * (2 ** attempt), 6.0)
        await asyncio.sleep(delay_seconds)

    assert response is not None
    return response


async def fetch_gmb_accounts(access_token: str) -> List[Dict[str, Any]]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await _get_with_rate_limit_retry(
            client=client,
            url=_ACCOUNTS_URL,
            headers=_auth_headers(access_token),
        )

    if response.status_code == 401 or response.status_code == 403:
        raise HTTPException(status_code=401, detail="Google token expired or insufficient permissions.")
    if response.status_code >= 400:
        _raise_google_error(response)

    data = response.json()
    return data.get("accounts", [])


async def fetch_gmb_locations(access_token: str, account_name: str) -> List[Dict[str, Any]]:
    url = f"{_LOCATIONS_BASE}/{account_name}/locations"
    params = {
        "readMask": "name,title,storefrontAddress,phoneNumbers,websiteUri,categories,profile",
        "pageSize": 100,
    }
    locations: List[Dict[str, Any]] = []

    async with httpx.AsyncClient(timeout=20.0) as client:
        while True:
            response = await _get_with_rate_limit_retry(
                client=client,
                url=url,
                headers=_auth_headers(access_token),
                params=params,
            )
            if response.status_code == 401 or response.status_code == 403:
                raise HTTPException(status_code=401, detail="Google token expired or insufficient permissions.")
            if response.status_code >= 400:
                _raise_google_error(response)

            data = response.json()
            locations.extend(data.get("locations", []))
            next_page_token = data.get("nextPageToken")
            if not next_page_token:
                break
            params = {**params, "pageToken": next_page_token}

    return locations


async def fetch_gmb_reviews(
    access_token: str,
    gmb_path: str,
    known_review_ids: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    url = f"{_REVIEWS_BASE}/{gmb_path}/reviews"
    params: Dict[str, Any] = {"pageSize": 200}
    all_reviews: List[Dict[str, Any]] = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            response = await _get_with_rate_limit_retry(
                client=client,
                url=url,
                headers=_auth_headers(access_token),
                params=params,
            )
            if response.status_code == 401 or response.status_code == 403:
                raise HTTPException(status_code=401, detail="Google token expired or insufficient permissions.")
            if response.status_code >= 400:
                _raise_google_error(response)

            data = response.json()
            batch = data.get("reviews", [])

            if known_review_ids is not None:
                new_reviews = [
                    r for r in batch
                    if (r.get("reviewId") or r.get("name")) not in known_review_ids
                ]
                all_reviews.extend(new_reviews)
                # If all reviews in this page are known, stop paginating
                if len(new_reviews) < len(batch):
                    break
            else:
                all_reviews.extend(batch)

            next_page_token = data.get("nextPageToken")
            if not next_page_token:
                break
            params = {**params, "pageToken": next_page_token}

    return all_reviews


def _raise_google_error(response: httpx.Response) -> None:
    if response.status_code == 429:
        raise HTTPException(
            status_code=429,
            detail="Google Business API rate limit reached. Please wait about 1 minute and try again.",
        )

    try:
        payload = response.json()
        if isinstance(payload, dict):
            error = payload.get("error", {})
            if isinstance(error, dict):
                message = error.get("message") or error.get("status") or "Google API error"
                raise HTTPException(status_code=response.status_code, detail=message)
    except (ValueError, KeyError):
        pass
    raise HTTPException(status_code=response.status_code, detail=f"Google API error: {response.status_code}")
