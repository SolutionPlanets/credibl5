from __future__ import annotations

import time
from typing import Annotated
from urllib.parse import urlencode, urlsplit, urlunsplit, parse_qsl

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.core.deps import get_app_settings, get_bearer_token, get_google_oauth, get_supabase_gateway
from app.gmb.oauth import GoogleOAuthService
from app.gmb.router import router as gmb_router
from app.auth_signup.router import router as auth_signup_router
from app.payments.router import router as payments_router
from app.templates.prompt import router as templates_router
from app.routes.pricing import router as pricing_router
from app.automation.router import router as automation_router
from app.automation.cron import router as automation_cron_router
from app.core.settings import Settings, get_settings
from app.core.state_token import StateTokenError, sign_state, verify_state
from app.core.supabase_gateway import SupabaseGateway
from app.core.rate_limit import create_global_rate_limit


settings_for_cors = get_settings()
_global_limiter = create_global_rate_limit(max_requests=60, window_seconds=60)
app = FastAPI(
    title="Cradible5 GMB OAuth Backend",
    version="1.0.0",
    dependencies=[Depends(_global_limiter)],
)

# Register routers
app.include_router(gmb_router, prefix="/gmb", tags=["gmb"])
app.include_router(auth_signup_router, prefix="/auth", tags=["auth"])
app.include_router(payments_router, prefix="/payments", tags=["payments"])
app.include_router(templates_router, prefix="/templates", tags=["templates"])
app.include_router(pricing_router, prefix="/pricing", tags=["pricing"])
app.include_router(automation_router, prefix="/automation", tags=["automation"])
app.include_router(automation_cron_router, prefix="/cron", tags=["cron"])

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
