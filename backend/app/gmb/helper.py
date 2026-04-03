from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable, Dict, List, Optional, Set, Tuple

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# Type alias for the token-refresh callback passed from the router.
# Called with no args, returns a fresh access token string.
RefreshCallback = Callable[[], Awaitable[str]]

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
    if isinstance(error, HTTPException):
        if isinstance(error.detail, dict):
            return error.detail.get("message") or str(error.detail)
        return str(error.detail)
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

        logger.warning(
            "Google API 429 (attempt %d/%d): url=%s retry_after=%s body=%s",
            attempt + 1, retries + 1, url,
            response.headers.get("Retry-After"), response.text[:300],
        )

        if attempt == retries:
            return response

        retry_after = _parse_retry_after(response.headers.get("Retry-After"))
        delay_seconds = retry_after if retry_after is not None else min(1.5 * (2 ** attempt), 6.0)
        await asyncio.sleep(delay_seconds)

    assert response is not None
    return response


async def _put_with_rate_limit_retry(
    client: httpx.AsyncClient,
    url: str,
    headers: Dict[str, str],
    json: Optional[Dict[str, Any]] = None,
    retries: int = 2,
) -> httpx.Response:
    response: Optional[httpx.Response] = None
    for attempt in range(retries + 1):
        response = await client.put(url, headers=headers, json=json)
        if response.status_code != 429:
            return response

        logger.warning(
            "Google API 429 (attempt %d/%d): url=%s retry_after=%s body=%s",
            attempt + 1,
            retries + 1,
            url,
            response.headers.get("Retry-After"),
            response.text[:300],
        )

        if attempt == retries:
            return response

        retry_after = _parse_retry_after(response.headers.get("Retry-After"))
        delay_seconds = retry_after if retry_after is not None else min(1.5 * (2 ** attempt), 6.0)
        await asyncio.sleep(delay_seconds)

    assert response is not None
    return response


async def fetch_gmb_accounts(
    access_token: str,
    refresh_callback: Optional[RefreshCallback] = None,
) -> List[Dict[str, Any]]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await _get_with_rate_limit_retry(
            client=client,
            url=_ACCOUNTS_URL,
            headers=_auth_headers(access_token),
        )

        # 401 interceptor: refresh token and retry once
        if response.status_code in (401, 403) and refresh_callback:
            logger.info("Google API 401/403 on accounts — attempting token refresh and retry")
            new_token = await refresh_callback()
            response = await _get_with_rate_limit_retry(
                client=client,
                url=_ACCOUNTS_URL,
                headers=_auth_headers(new_token),
            )

        if response.status_code in (401, 403):
            _raise_google_error(response)
        if response.status_code >= 400:
            _raise_google_error(response)

        data = response.json()
        accounts = data.get("accounts", [])
        logger.info("fetch_gmb_accounts: found %d accounts", len(accounts))
        return accounts


async def fetch_gmb_locations(
    access_token: str,
    account_name: str,
    refresh_callback: Optional[RefreshCallback] = None,
) -> List[Dict[str, Any]]:
    url = f"{_LOCATIONS_BASE}/{account_name}/locations"
    params = {
        "readMask": "name,title,storefrontAddress,phoneNumbers,websiteUri,categories,profile,metadata",
        "pageSize": 100,
    }
    locations: List[Dict[str, Any]] = []
    current_token = access_token
    retried_auth = False

    async with httpx.AsyncClient(timeout=20.0) as client:
        while True:
            response = await _get_with_rate_limit_retry(
                client=client,
                url=url,
                headers=_auth_headers(current_token),
                params=params,
            )

            # 401 interceptor: refresh token and retry once
            if response.status_code in (401, 403) and refresh_callback and not retried_auth:
                logger.info("Google API 401/403 on locations — attempting token refresh and retry")
                current_token = await refresh_callback()
                retried_auth = True
                response = await _get_with_rate_limit_retry(
                    client=client,
                    url=url,
                    headers=_auth_headers(current_token),
                    params=params,
                )

            if response.status_code in (401, 403):
                _raise_google_error(response)
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
    refresh_callback: Optional[RefreshCallback] = None,
) -> Tuple[List[Dict[str, Any]], int]:
    url = f"{_REVIEWS_BASE}/{gmb_path}/reviews"
    params: Dict[str, Any] = {"pageSize": 50}
    all_reviews: List[Dict[str, Any]] = []
    current_token = access_token
    retried_auth = False
    pages_fetched = 0

    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            response = await _get_with_rate_limit_retry(
                client=client,
                url=url,
                headers=_auth_headers(current_token),
                params=params,
            )

            # 401 interceptor: refresh token and retry once
            if response.status_code in (401, 403) and refresh_callback and not retried_auth:
                logger.info("Google API 401/403 on reviews — attempting token refresh and retry")
                current_token = await refresh_callback()
                retried_auth = True
                response = await _get_with_rate_limit_retry(
                    client=client,
                    url=url,
                    headers=_auth_headers(current_token),
                    params=params,
                )

            if response.status_code in (401, 403):
                _raise_google_error(response)
            if response.status_code >= 400:
                _raise_google_error(response)

            data = response.json()

            # Detect embedded errors that Google returns inside a 200 response
            if isinstance(data, dict) and "error" in data:
                error_info = data["error"]
                error_code = error_info.get("code") if isinstance(error_info, dict) else None
                error_msg = error_info.get("message", str(error_info)) if isinstance(error_info, dict) else str(error_info)
                logger.warning(
                    "fetch_gmb_reviews: embedded error in 200 response: code=%s msg=%s url=%s",
                    error_code, error_msg, url,
                )
                http_code = int(error_code) if error_code and str(error_code).isdigit() else 400
                raise HTTPException(status_code=http_code, detail={
                    "code": "GOOGLE_API_ERROR",
                    "message": f"Google API error: {error_msg}",
                })

            batch = data.get("reviews", [])
            pages_fetched += 1
            logger.debug(
                "fetch_gmb_reviews: page %d — got %d reviews (raw keys: %s)",
                pages_fetched, len(batch), list(data.keys()),
            )

            # Log full raw body when first page is empty (key diagnostic signal)
            if pages_fetched == 1 and len(batch) == 0:
                logger.warning(
                    "fetch_gmb_reviews: EMPTY first page — status=%d url=%s raw_body=%s",
                    response.status_code, url, str(data)[:500],
                )

            if known_review_ids is not None:
                new_reviews = [
                    r for r in batch
                    if (r.get("reviewId") or r.get("name")) not in known_review_ids
                ]
                all_reviews.extend(new_reviews)
                if len(new_reviews) == 0:
                    # Entire page is already known — stop early
                    logger.debug(
                        "fetch_gmb_reviews: full page known, stopping at page %d", pages_fetched
                    )
                    break
                if len(new_reviews) < len(batch):
                    # Boundary page: some new, some old. Google returns newest-first so nothing
                    # newer exists on subsequent pages. Add new ones and stop.
                    logger.debug(
                        "fetch_gmb_reviews: boundary page at %d — %d new of %d, stopping",
                        pages_fetched, len(new_reviews), len(batch),
                    )
                    break
            else:
                all_reviews.extend(batch)

            next_page_token = data.get("nextPageToken")
            if not next_page_token:
                logger.debug(
                    "fetch_gmb_reviews: no nextPageToken after page %d — done", pages_fetched
                )
                break
            params = {**params, "pageToken": next_page_token}

    logger.info(
        "fetch_gmb_reviews: finished — pages=%d total_reviews=%d", pages_fetched, len(all_reviews)
    )
    return all_reviews, pages_fetched


async def upsert_gmb_review_reply(
    access_token: str,
    review_path: str,
    reply_comment: str,
    refresh_callback: Optional[RefreshCallback] = None,
) -> Dict[str, Any]:
    normalized_path = review_path.strip("/")
    url = f"{_REVIEWS_BASE}/{normalized_path}/reply"
    payload = {"comment": reply_comment}
    current_token = access_token
    retried_auth = False

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await _put_with_rate_limit_retry(
            client=client,
            url=url,
            headers=_auth_headers(current_token),
            json=payload,
        )

        if response.status_code in (401, 403) and refresh_callback and not retried_auth:
            logger.info("Google API 401/403 on review reply - attempting token refresh and retry")
            current_token = await refresh_callback()
            retried_auth = True
            response = await _put_with_rate_limit_retry(
                client=client,
                url=url,
                headers=_auth_headers(current_token),
                json=payload,
            )

    if response.status_code in (401, 403):
        _raise_google_error(response)
    if response.status_code >= 400:
        _raise_google_error(response)

    data = response.json()
    return data if isinstance(data, dict) else {}


def _raise_google_error(response: httpx.Response) -> None:
    logger.warning(
        "Google API error: status=%s url=%s body=%s",
        response.status_code, str(response.url), response.text[:500],
    )
    if response.status_code == 429:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "GOOGLE_RATE_LIMIT",
                "message": "Google Business API rate limit reached. Please wait about 1 minute and try again."
            },
        )

    try:
        payload = response.json()
        if isinstance(payload, dict):
            error = payload.get("error", {})
            if isinstance(error, dict):
                message = error.get("message") or error.get("status") or "Google API error"
                # Check for specific GMB auth errors
                if response.status_code in (401, 403):
                    raise HTTPException(
                        status_code=401,
                        detail={
                            "code": "GOOGLE_AUTH_ERROR",
                            "message": f"Google connection error: {message}. You may need to reconnect your Google account.",
                            "original_error": message
                        }
                    )
                raise HTTPException(status_code=response.status_code, detail=message)
    except HTTPException:
        raise
    except (ValueError, KeyError):
        pass
    
    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=401,
            detail={
                "code": "GOOGLE_AUTH_ERROR",
                "message": "Google session expired or insufficient permissions. Please reconnect your account."
            }
        )
    raise HTTPException(status_code=response.status_code, detail=f"Google API error: {response.status_code}")
