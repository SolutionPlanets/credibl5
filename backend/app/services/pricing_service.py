import json
import logging
from typing import Dict, List, Optional
from google.oauth2 import service_account
from googleapiclient.discovery import build
from app.core.settings import Settings

logger = logging.getLogger(__name__)

class PricingService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.creds = None
        self.sheet_id = settings.pricing_sheet_id
        
        if settings.google_service_account_file:
            try:
                self.creds = service_account.Credentials.from_service_account_file(
                    settings.google_service_account_file,
                    scopes=['https://www.googleapis.com/auth/spreadsheets.readonly']
                )
            except Exception as e:
                logger.error(f"Failed to load Google service account: {e}")

    async def fetch_pricing_from_sheet(self) -> Optional[List[Dict]]:
        if not self.creds or not self.sheet_id:
            logger.warning("Google Sheets credentials or Sheet ID missing. Using fallbacks.")
            return None

        try:
            service = build('sheets', 'v4', credentials=self.creds)
            sheet = service.spreadsheets()
            result = sheet.values().get(
                spreadsheetId=self.sheet_id,
                range='A1:Z100'  # Adjust range as needed
            ).execute()
            
            values = result.get('values', [])
            if not values:
                return None

            header = [h.lower().replace(" ", "_") for h in values[0]]
            rows = []
            for row_data in values[1:]:
                # Pad row if some cells are empty at the end
                padded_row = row_data + [""] * (len(header) - len(row_data))
                rows.append(dict(zip(header, padded_row)))
            
            return rows
        except Exception as e:
            logger.error(f"Error fetching from Google Sheets: {e}")
            return None

    async def get_formatted_pricing(self):
        rows = await self.fetch_pricing_from_sheet()
        
        # Default fallback data if sheet fetch fails
        default_pricing = {
            "starter": {
                "USD": {"monthly": 20, "yearly": 200},
                "INR": {"monthly": 1500, "yearly": 15000}
            },
            "growth": {
                "USD": {"monthly": 50, "yearly": 500},
                "INR": {"monthly": 4000, "yearly": 40000}
            }
        }

        if not rows:
            return default_pricing

        # Transform rows into a nested dict: { plan_id: { currency: { monthly, yearly } } }
        # Expected columns: plan_id, currency, monthly_price, yearly_price
        dynamic_pricing = {}
        for row in rows:
            plan_id = (row.get("plan_id") or row.get("plain_type") or "").strip().lower()
            currency = (row.get("currency") or "").strip().upper()
            
            if not plan_id or not currency:
                continue

            if plan_id not in dynamic_pricing:
                dynamic_pricing[plan_id] = {}
            
            try:
                dynamic_pricing[plan_id][currency] = {
                    "monthly": float(row.get("monthly_price", 0) or 0),
                    "yearly": float(row.get("yearly_price", 0) or 0)
                }
            except (ValueError, TypeError):
                logger.error(f"Invalid price value in sheet for {plan_id} {currency}")
        
        return dynamic_pricing if dynamic_pricing else default_pricing
