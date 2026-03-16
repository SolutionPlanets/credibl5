from __future__ import annotations

import time
from typing import Annotated
from urllib.parse import urlencode, urlsplit, urlunsplit, parse_qsl

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from .core.deps import get_app_settings, get_bearer_token, get_google_oauth, get_supabase_gateway
from .gmb.oauth import GoogleOAuthService
from .gmb.router import router as gmb_router
from .auth_signup.router import router as auth_signup_router
from .core.settings import Settings, get_settings
from .core.state_token import StateTokenError, sign_state, verify_state
from .core.supabase_gateway import SupabaseGateway


settings_for_cors = get_settings()
app = FastAPI(title="Cradible5 GMB OAuth Backend", version="1.0.0")

# Register routers
app.include_router(gmb_router, prefix="/gmb", tags=["gmb"])
app.include_router(auth_signup_router, prefix="/auth", tags=["auth"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings_for_cors.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    print("[*] Health check hit")
    return {"status": "ok"}
