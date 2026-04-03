import asyncio
from app.core.settings import get_settings

settings = get_settings()
print(f"URL: {settings.supabase_url}")
print(f"Anon Key Check: {settings.supabase_anon_key[:15]}...")
