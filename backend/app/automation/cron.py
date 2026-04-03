"""
Cron Router
Endpoint for triggering the auto-reply job from an external scheduler.
Secured by CRON_SECRET header verification.
"""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException

from app.core.deps import get_app_settings
from app.core.settings import Settings
from app.automation.service import process_auto_replies_job

logger = logging.getLogger(__name__)
router = APIRouter()


def _verify_cron_secret(
    settings: Settings,
    authorization: str | None = Header(None),
) -> None:
    """Verify the request comes from a trusted cron source."""
    expected = settings.cron_secret
    if not expected or expected == "dev-only-change-this-secret":
        logger.warning("[Cron] CRON_SECRET not configured — allowing request in dev mode.")
        return

    token = ""
    if authorization:
        token = authorization.removeprefix("Bearer ").strip()

    if token != expected:
        raise HTTPException(status_code=401, detail="Unauthorized cron request.")


@router.get("/process-rules")
async def trigger_auto_replies(
    settings: Annotated[Settings, Depends(get_app_settings)],
    authorization: str | None = Header(None),
):
    """
    Trigger the auto-reply rules engine.
    Should be called by an external scheduler (Vercel Cron, Railway Cron, etc.).
    Recommended interval: every 15 minutes.
    """
    _verify_cron_secret(settings, authorization)

    try:
        result = await process_auto_replies_job(settings)
        return {"success": True, "result": result}
    except Exception as e:
        logger.error("[Cron] Auto-reply job failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
