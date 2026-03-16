from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    supabase_url: str = Field(alias="NEXT_PUBLIC_SUPABASE_URL")
    supabase_anon_key: str = Field(alias="NEXT_PUBLIC_SUPABASE_ANON_KEY")
    supabase_service_role_key: str | None = Field(default=None, alias="SUPABASE_SERVICE_ROLE_KEY")
    next_public_supabase_service_key: str | None = Field(
        default=None, alias="NEXT_PUBLIC_SUPABASE_SERVICE_KEY"
    )

    google_client_id: str = Field(alias="GOOGLE_CLIENT_ID")
    google_client_secret: str = Field(alias="GOOGLE_CLIENT_SECRET")
    google_scopes: str = (
        "https://www.googleapis.com/auth/business.manage openid email profile"
    )

    frontend_url: str = Field(default="http://localhost:3000", alias="FRONTEND_URL")
    backend_url: str = Field(default="http://localhost:8000", alias="BACKEND_URL")
    oauth_state_secret: str = Field(
        default="dev-only-change-this-secret",
        alias="OAUTH_STATE_SECRET",
    )
    oauth_state_ttl_seconds: int = Field(default=600, alias="OAUTH_STATE_TTL_SECONDS")
    cors_origins: str = Field(default="http://localhost:3000", alias="CORS_ORIGINS")

    @property
    def service_role_key(self) -> str:
        service_key = self.supabase_service_role_key or self.next_public_supabase_service_key
        if not service_key:
            raise ValueError(
                "Missing Supabase service role key. "
                "Set SUPABASE_SERVICE_ROLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_SERVICE_KEY."
            )
        return service_key

    @property
    def allowed_origins(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def normalized_frontend_url(self) -> str:
        return self.frontend_url.rstrip("/")

    @property
    def normalized_backend_url(self) -> str:
        return self.backend_url.rstrip("/")

    def normalize_next_path(self, next_path: str | None) -> str:
        if not next_path or not next_path.startswith("/"):
            return "/protected"
        return next_path


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
