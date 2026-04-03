# Sync Reviews - Technical Documentation

## Overview

The **Sync Reviews** feature allows users to fetch all customer reviews from their Google Business Profile into the Credible5 app. Reviews are fetched via the Google My Business API (v4) and stored locally in the browser's IndexedDB.

---

## Architecture Flow

```
[Sync Button] --> [Frontend Handler] --> [POST /gmb/reviews/sync] --> [Google Business API v4] --> [IndexedDB]
```

### 1. Frontend - Sync Button

**File:** `frontend/src/app/protected/inbox/page.tsx`

- **Button location:** Customer Review Queue page (Review Inbox)
- **Handler:** `handleSyncReviews()`
- **Behavior:**
  - If **"All Locations"** is selected and all are inactive, syncs **all** locations
  - If **"All Locations"** is selected and at least one is active, syncs only **active** locations
  - If a **specific location** is selected, syncs only that location
- **Rate limit:** Max 2 sync requests per location per 60 seconds (client-side)
- **Storage:** Reviews are saved to **IndexedDB** via `replaceReviewsForLocation()` (client-side only, not persisted to backend database)

### 2. API Endpoint

**Route:** `POST /gmb/reviews/sync`  
**File:** `backend/app/gmb/router.py`

**Request:**
```json
{
  "locationId": "<supabase-location-uuid>"
}
```

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <supabase-jwt>
```

**Response (Success):**
```json
{
  "success": true,
  "reviews": [ ... ],
  "count": 3,
  "pagesFetched": 1,
  "message": "Fetched 3 reviews from Google."
}
```

**Response (No Reviews):**
```json
{
  "success": true,
  "reviews": [],
  "count": 0,
  "pagesFetched": 1,
  "message": "No reviews found for this location."
}
```

### 3. Backend Processing

**File:** `backend/app/gmb/router.py` (sync_reviews endpoint)

1. **Authenticate** user via Supabase JWT
2. **Rate limit** check (2 requests per location per 60 seconds)
3. **Retrieve** Google OAuth token (from cache or refresh)
4. **Lookup** location details from Supabase (account ID, location ID)
5. **Auto-discover** missing GMB account ID if not stored
6. **Fetch** all reviews from Google API via `fetch_gmb_reviews()`
7. **Transform** each review into a standardized object
8. **Return** reviews to frontend (no backend persistence)

**Review Object Structure:**
```json
{
  "location_id": "<supabase-uuid>",
  "gmb_review_id": "<google-review-id>",
  "reviewer_name": "John Doe",
  "reviewer_profile_photo_url": "https://...",
  "star_rating": 5,
  "review_text": "Great service!",
  "review_date": "2026-04-01T10:00:00Z",
  "sentiment": "POSITIVE",
  "is_read": false,
  "review_reply": "Thank you for your review!",
  "synced_at": "2026-04-02T12:00:00Z"
}
```

### 4. Google Business API Call

**File:** `backend/app/gmb/helper.py` - `fetch_gmb_reviews()`

**Google API Endpoint:**
```
GET https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/reviews
```

**Pagination:**
- **Page size:** 50 reviews per request
- **Strategy:** Fetches **all pages** by following `nextPageToken` until exhausted
- **No date filter** or review count limit applied
- **`known_review_ids`** parameter exists for smart early-stopping but is currently passed as `None` (always fetches everything)

**Error Handling:**
- **401/403:** Token refresh attempted once, then re-raises
- **429 (Rate Limit):** Retries up to 2 times with exponential backoff, respects `Retry-After` header
- **Embedded errors in 200:** Detected and raised as proper HTTP exceptions

---

## Rate Limiting

| Layer | Limit | Scope |
|-------|-------|-------|
| Frontend (client-side) | 2 requests / 60s | Per location |
| Backend (server-side) | 2 requests / 60s | Per location |
| Google API (429 retry) | Up to 2 retries | Per request, with exponential backoff |

---

## Verification Checks

When **0 reviews** are returned, the backend performs additional checks:

1. **Account verification:** Checks if the GMB account `verificationState` is `VERIFIED`
2. **Location verification:** Checks if the location's `metadata.isVerified` is `true`

Provides user-friendly error messages if verification is incomplete, since Google restricts API access for unverified accounts/locations.

---

## Known Limitations

### Owner Self-Reviews Are Not Returned

The Google Business Profile API **does not return reviews left by the business owner** on their own listing. Even though these reviews appear in the Google Maps UI:

- They are **not counted** in the review total or average rating by Google
- The **API excludes them** from the response
- Only genuine **customer reviews** are returned

**Example:**  
If Google Maps shows 4 reviews but reports "3 Google reviews" with a 3.3 average, the 4th review is likely the owner's self-review. The math confirms: only 3 reviews contribute to the average.

**Why it can't be fetched via API:**
- Google's API deliberately excludes the owner's self-review — there is no parameter, filter, or workaround to include it
- Google itself doesn't count it toward the review total or average rating
- It violates [Google's review policies](https://support.google.com/business/answer/2622994) — owners are not supposed to review their own business, and Google may remove it over time

#### Solutions

**Solution 1: Remove the self-review (recommended)**  
Since Google doesn't count the owner's self-review and may eventually flag or remove it, the cleanest approach is to delete it directly from Google Maps. It provides no SEO or reputation value.

**Solution 2: Add Manual Review Entry**  
Implement an "Add Manual Review" feature in the Review Inbox that allows users to manually log reviews not fetched by the API. This covers edge cases like:
- Owner self-reviews that the API excludes
- Reviews from other platforms (Yelp, Facebook, etc.)
- Direct customer feedback received outside of Google

This would involve:
1. A form in the frontend to input reviewer name, star rating, review text, and date
2. Storing the manual review in IndexedDB alongside synced reviews
3. Tagging manual reviews with a `source: "manual"` flag to distinguish them from Google-synced reviews

### API Version

The current implementation uses the **deprecated** Google My Business API v4 (`mybusiness.googleapis.com/v4`). Google has transitioned to the newer **Google Business Profile APIs**:

- Reviews: `mybusinessreviews` API
- Locations: `mybusinessbusinessinformation` API

Consider migrating to the newer APIs for long-term support.

### No Backend Persistence

Reviews are **not stored in Supabase**. They exist only in the browser's IndexedDB. This means:

- Reviews are lost if IndexedDB is cleared
- Every sync re-downloads the entire review history
- No cross-device sync of review data

---

## Sentiment Classification

Reviews are automatically classified based on star rating and review text:

| Stars | Sentiment |
|-------|-----------|
| 4-5 | POSITIVE |
| 3 | NEUTRAL |
| 1-2 | NEGATIVE |

Handled by `get_sentiment()` in the backend.

---

## File References

| Component | File |
|-----------|------|
| Sync Button UI & Handler | `frontend/src/app/protected/inbox/page.tsx` |
| API Route (sync endpoint) | `backend/app/gmb/router.py` |
| Google API Helper | `backend/app/gmb/helper.py` |
| Review Store (IndexedDB) | `frontend/src/lib/review-store.ts` |
