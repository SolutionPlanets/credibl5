from __future__ import annotations

import logging
from typing import Any, Dict
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException

from app.core.settings import Settings

logger = logging.getLogger(__name__)

# Errors from Google that indicate the refresh token is permanently invalid
# and the user must re-authenticate.
_REVOKED_TOKEN_ERRORS = frozenset({
    "unauthorized_client",
    "invalid_grant",
    "invalid_client",
})


class GoogleReconnectRequired(HTTPException):
    """Raised when the stored refresh token is permanently invalid."""

    def __init__(self, reason: str = ""):
        detail = {
            "code": "GOOGLE_RECONNECT_REQUIRED",
            "message": (
                "Your Google connection has expired or been revoked. "
                "Please reconnect your Google account."
            ),
        }
        if reason:
            detail["reason"] = reason
        super().__init__(status_code=401, detail=detail)


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
            error_code = self._extract_error_code(response)
            logger.warning(
                "Google token refresh failed: status=%s error=%s body=%s",
                response.status_code, error_code, response.text[:500],
            )

            if error_code in _REVOKED_TOKEN_ERRORS:
                logger.error(
                    "Refresh token is permanently invalid (error=%s). "
                    "User must re-authenticate. If your Google Cloud project "
                    "is in 'Testing' mode, refresh tokens expire after 7 days. "
                    "Switch to 'Production' mode for permanent tokens.",
                    error_code,
                )
                raise GoogleReconnectRequired(reason=error_code)

            raise HTTPException(status_code=400, detail=self._google_error(response))

        token_data = response.json()
        expires_in = token_data.get("expires_in", 3600)
        if isinstance(expires_in, (int, float)) and expires_in < 3600:
            logger.warning(
                "Google access token has short expiry (%ss). "
                "This may indicate the Cloud project is in Testing mode.",
                expires_in,
            )
        return token_data

    async def revoke_token(self, token: str) -> bool:
        """Revoke a refresh/access token so Google forgets the authorization.

        Returns True if revoked successfully, False on any error (best-effort).
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.post(
                    "https://oauth2.googleapis.com/revoke",
                    params={"token": token},
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                if response.status_code == 200:
                    logger.info("Successfully revoked Google token")
                    return True
                logger.warning(
                    "Google token revocation returned status=%s body=%s",
                    response.status_code, response.text[:300],
                )
                return False
            except Exception as exc:
                logger.warning("Google token revocation failed: %s", exc)
                return False

    @property
    def redirect_uri(self) -> str:
        return f"{self.settings.normalized_backend_url}/auth/google/callback"

    @staticmethod
    def _extract_error_code(response: httpx.Response) -> str:
        try:
            payload = response.json()
            if isinstance(payload, dict):
                return str(payload.get("error", ""))
        except ValueError:
            pass
        return ""

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

