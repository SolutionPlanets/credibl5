from __future__ import annotations

from typing import Any, Dict
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException

from ..core.settings import Settings


class GoogleOAuthService:
    AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
    TOKEN_URL = "https://oauth2.googleapis.com/token"

    def __init__(self, settings: Settings):
        self.settings = settings

    def build_authorization_url(self, state: str) -> str:
        params = {
            "client_id": self.settings.google_client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": self.settings.google_scopes,
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": state,
        }
        return f"{self.AUTH_URL}?{urlencode(params)}"

    async def exchange_code(self, code: str) -> Dict[str, Any]:
        payload = {
            "client_id": self.settings.google_client_id,
            "client_secret": self.settings.google_client_secret,
            "code": code,
            "redirect_uri": self.redirect_uri,
            "grant_type": "authorization_code",
        }

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(self.TOKEN_URL, data=payload)

        if response.status_code >= 400:
            raise HTTPException(status_code=400, detail=self._google_error(response))

        return response.json()

    async def refresh_access_token(self, refresh_token: str) -> Dict[str, Any]:
        payload = {
            "client_id": self.settings.google_client_id,
            "client_secret": self.settings.google_client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(self.TOKEN_URL, data=payload)

        if response.status_code >= 400:
            raise HTTPException(status_code=400, detail=self._google_error(response))

        return response.json()

    @property
    def redirect_uri(self) -> str:
        return f"{self.settings.normalized_backend_url}/auth/google/callback"

    @staticmethod
    def _google_error(response: httpx.Response) -> str:
        try:
            payload = response.json()
            if isinstance(payload, dict):
                if "error_description" in payload:
                    return str(payload["error_description"])
                if "error" in payload:
                    return str(payload["error"])
        except ValueError:
            pass
        return "Google OAuth request failed."

