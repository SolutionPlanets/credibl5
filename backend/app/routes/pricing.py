from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.deps import get_supabase_gateway
from app.core.settings import Settings, get_settings
from app.core.supabase_gateway import SupabaseGateway
from app.services.plan_service import PlanService

router = APIRouter()


@router.get("/")
async def get_pricing(
    gateway: Annotated[SupabaseGateway, Depends(get_supabase_gateway)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    service = PlanService(gateway, settings=settings)
    return await service.get_full_response()
