from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

import httpx
from fastapi import HTTPException

from .settings import Settings


@dataclass
class SupabaseUser:
    id: str
    email: str | None


class SupabaseGateway:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def get_user_from_access_token(self, access_token: str) -> SupabaseUser:
        url = f"{self.settings.supabase_url}/auth/v1/user"
        headers = {
            "apikey": self.settings.supabase_anon_key,
            "Authorization": f"Bearer {access_token}",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers)

        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Supabase access token.")

        payload = response.json()
        return SupabaseUser(id=payload["id"], email=payload.get("email"))

    async def get_google_connection(self, user_id: str) -> Optional[Dict[str, Any]]:
        url = f"{self.settings.supabase_url}/rest/v1/google_business_connections"
        headers = self._service_headers()
        params = {
            "select": "user_id,refresh_token",
            "user_id": f"eq.{user_id}",
            "limit": "1",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers, params=params)

        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))

        data = response.json()
        return data[0] if data else None

    async def upsert_google_refresh_token(self, user_id: str, refresh_token: str) -> None:
        url = f"{self.settings.supabase_url}/rest/v1/google_business_connections"
        headers = self._service_headers(
            {
                "Prefer": "resolution=merge-duplicates,return=minimal",
                "Content-Type": "application/json",
            }
        )
        params = {"on_conflict": "user_id"}
        now_iso = datetime.now(timezone.utc).isoformat()
        payload = [
            {
                "user_id": user_id,
                "provider": "google",
                "refresh_token": refresh_token,
                "updated_at": now_iso,
            }
        ]

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, headers=headers, params=params, json=payload)

        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))

    async def mark_google_connected(self, user_id: str, email: str | None) -> None:
        profile_url = f"{self.settings.supabase_url}/rest/v1/user_profiles"

        existing_google_connected_at = await self._get_profile_google_connected_at(user_id)

        headers = self._service_headers(
            {
                "Prefer": "resolution=merge-duplicates,return=minimal",
                "Content-Type": "application/json",
            }
        )
        params = {"on_conflict": "id"}
        now_iso = datetime.now(timezone.utc).isoformat()
        payload = [
            {
                "id": user_id,
                "email": email,
                "google_connected_at": existing_google_connected_at or now_iso,
                "google_last_oauth_at": now_iso,
                "onboarding_completed": True,
            }
        ]

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(profile_url, headers=headers, params=params, json=payload)

        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))

    async def get_location_by_gmb_location_id(
        self, user_id: str, gmb_location_id: str
    ) -> Optional[Dict[str, Any]]:
        url = f"{self.settings.supabase_url}/rest/v1/locations"
        headers = self._service_headers()
        params = {
            "select": "id,gmb_account_id,location_id,location_name,address",
            "user_id": f"eq.{user_id}",
            "location_id": f"eq.{gmb_location_id}",
            "limit": "1",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers, params=params)
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))
        data = response.json()
        return data[0] if data else None

    async def upsert_location(self, location_data: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.settings.supabase_url}/rest/v1/locations"
        headers = self._service_headers(
            {
                "Prefer": "resolution=merge-duplicates,return=representation",
                "Content-Type": "application/json",
            }
        )
        params = {"on_conflict": "user_id,location_id"}
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, headers=headers, params=params, json=[location_data])
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))
        data = response.json()
        return data[0] if data else location_data

    async def get_location_by_id(self, location_id: str) -> Optional[Dict[str, Any]]:
        url = f"{self.settings.supabase_url}/rest/v1/locations"
        headers = self._service_headers()
        params = {
            "select": "id,gmb_account_id,location_id,location_name",
            "id": f"eq.{location_id}",
            "limit": "1",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers, params=params)
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))
        data = response.json()
        return data[0] if data else None

    async def get_review_gmb_ids(self, location_id: str) -> Set[str]:
        url = f"{self.settings.supabase_url}/rest/v1/reviews"
        headers = self._service_headers()
        params = {
            "select": "gmb_review_id",
            "location_id": f"eq.{location_id}",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers, params=params)
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))
        data = response.json()
        return {row["gmb_review_id"] for row in data if row.get("gmb_review_id")}

    async def batch_upsert_reviews(self, reviews: List[Dict[str, Any]]) -> int:
        if not reviews:
            return 0
        url = f"{self.settings.supabase_url}/rest/v1/reviews"
        headers = self._service_headers(
            {
                "Prefer": "resolution=merge-duplicates,return=minimal",
                "Content-Type": "application/json",
            }
        )
        params = {"on_conflict": "gmb_review_id"}
        CHUNK = 400
        synced = 0
        async with httpx.AsyncClient(timeout=30.0) as client:
            for i in range(0, len(reviews), CHUNK):
                chunk = reviews[i : i + CHUNK]
                response = await client.post(url, headers=headers, params=params, json=chunk)
                if response.status_code >= 400:
                    raise HTTPException(status_code=500, detail=self._postgrest_error(response))
                synced += len(chunk)
        return synced

    async def _get_profile_google_connected_at(self, user_id: str) -> Optional[str]:
        profile_url = f"{self.settings.supabase_url}/rest/v1/user_profiles"
        headers = self._service_headers()
        params = {
            "select": "google_connected_at",
            "id": f"eq.{user_id}",
            "limit": "1",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(profile_url, headers=headers, params=params)

        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))

        data = response.json()
        if not data:
            return None

        return data[0].get("google_connected_at")

    def _service_headers(self, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        headers = {
            "apikey": self.settings.service_role_key,
            "Authorization": f"Bearer {self.settings.service_role_key}",
        }
        if extra:
            headers.update(extra)
        return headers

    @staticmethod
    def _postgrest_error(response: httpx.Response) -> str:
        try:
            payload = response.json()
            message = payload.get("message") or payload.get("hint") or payload.get("details")
            if message:
                return str(message)
        except ValueError:
            pass
        return "Supabase request failed."
