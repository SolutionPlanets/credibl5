import httpx
import asyncio
import json
import sys

# Constants
ACCOUNTS_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1"
LOCATIONS_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"
REVIEWS_BASE_V4 = "https://mybusiness.googleapis.com/v4"

# OAuth Credentials from .env
import os
CLIENT_ID = os.getenv("GMB_CLIENT_ID", "your-client-id-here")
CLIENT_SECRET = os.getenv("GMB_CLIENT_SECRET", "your-client-secret-here")

# Use these IDs as they are confirmed to be the correct GMB ones from your logs
DEFAULT_ACCOUNT_ID = "104690922755529726751"
DEFAULT_LOCATION_ID = "2859400714063434514"

# Read refresh token from environment only (no hardcoded secret fallback)
refresh_token = os.getenv("GMB_REFRESH_TOKEN", "")

async def get_fresh_access_token(rt):
    print(f"--- Exchanging Refresh Token for Access Token ---")
    url = "https://oauth2.googleapis.com/token"
    data = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": rt,
        "grant_type": "refresh_token",
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, data=data)
        if response.status_code == 200:
            token_data = response.json()
            new_at = token_data.get("access_token")
            print(f"SUCCESS: Obtained fresh access token: {new_at[:10]}...")
            return new_at
        else:
            print(f"FAILED to refresh token: {response.status_code}")
            print(response.text)
            return None

async def test_gmb_reviews(at, account_id, location_id):
    headers = {"Authorization": f"Bearer {at}"}
    
    # Confirmed CID from V1 metadata
    cid = "10833074258084154499"

    # Try all reasonable variations of the endpoint
    endpoints = [
        {
            "name": "Standard V4 Review Fetch (Location ID)",
            "url": f"{REVIEWS_BASE_V4}/accounts/{account_id}/locations/{location_id}/reviews",
            "params": {"pageSize": 10}
        },
        {
            "name": "CID-based Review Fetch (Alternative)",
            "url": f"{REVIEWS_BASE_V4}/accounts/{account_id}/locations/{cid}/reviews",
            "params": {"pageSize": 10}
        },
        {
            "name": "V1 Managed Accounts List",
            "url": f"{ACCOUNTS_BASE}/accounts",
            "params": {}
        },
        {
            "name": "Legacy V4 Accounts List",
            "url": f"{REVIEWS_BASE_V4}/accounts",
            "params": {}
        },
        {
            "name": "V1 Location Details",
            "url": f"{LOCATIONS_BASE}/locations/{location_id}",
            "params": {"readMask": "name,title,metadata,labels"}
        }
    ]

    async with httpx.AsyncClient(timeout=30.0) as client:
        for ep in endpoints:
            print(f"\n--- Testing Endpoint: {ep['name']} ---")
            print(f"URL: {ep['url']}")
            try:
                response = await client.get(ep["url"], headers=headers, params=ep.get("params"))
                print(f"Status Code: {response.status_code}")
                try:
                    data = response.json()
                    # Clean up data for display
                    if "reviews" in data:
                        print(f"SUCCESS: Found {len(data['reviews'])} review(s)!")
                        # Print first review text for confirmation
                        if data["reviews"]:
                            print(f"First Review Preview: {data['reviews'][0].get('comment', 'No comment text')}")
                    elif not data and response.status_code == 200:
                        print("WARNING: Empty 200 OK response. This location might be unverified or have no API-visible reviews.")
                    else:
                        print(f"Response Body: {json.dumps(data, indent=2)}")
                except Exception as e:
                    print(f"Could not parse JSON: {e}")
                    print(f"Raw Body: {response.text[:500]}")
            except Exception as e:
                print(f"Request Failed: {e}")

if __name__ == "__main__":
    # 1. Step: Get the best token possible
    at = None
    if refresh_token and refresh_token.startswith("1//"):
        at = asyncio.run(get_fresh_access_token(refresh_token))
    
    if not at:
        print("CRITICAL: No valid access token. Script cannot continue.")
        sys.exit(1)

    # 2. Step: Run the tests with the best IDs
    asyncio.run(test_gmb_reviews(at, DEFAULT_ACCOUNT_ID, DEFAULT_LOCATION_ID))
