from fastapi import APIRouter, Depends
from app.core.settings import Settings, get_settings
from app.services.pricing_service import PricingService

router = APIRouter()

@router.get("/")
async def get_pricing(settings: Settings = Depends(get_settings)):
    service = PricingService(settings)
    return await service.get_formatted_pricing()
