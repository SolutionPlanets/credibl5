from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import HTTPException

from app.core.settings import Settings


@dataclass
class SupabaseUser:
    id: str
    email: str | None


class SupabaseGateway:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def get_user_from_access_token(self, access_token: str) -> SupabaseUser:
        url = f"{self.settings.supabase_url}/auth/v1/user"
        headers = {
            "apikey": self.settings.supabase_anon_key,
            "Authorization": f"Bearer {access_token}",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers)

        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Supabase access token.")

        payload = response.json()
        return SupabaseUser(id=payload["id"], email=payload.get("email"))

    async def get_google_connection(self, user_id: str) -> Optional[Dict[str, Any]]:
        url = f"{self.settings.supabase_url}/rest/v1/google_business_connections"
        headers = self._service_headers()
        params = {
            "select": "user_id,refresh_token",
            "user_id": f"eq.{user_id}",
            "limit": "1",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers, params=params)

        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))

        data = response.json()
        return data[0] if data else None

    async def upsert_google_refresh_token(self, user_id: str, refresh_token: str) -> None:
        url = f"{self.settings.supabase_url}/rest/v1/google_business_connections"
        headers = self._service_headers(
            {
                "Prefer": "resolution=merge-duplicates,return=minimal",
                "Content-Type": "application/json",
            }
        )
        params = {"on_conflict": "user_id"}
        now_iso = datetime.now(timezone.utc).isoformat()
        payload = [
            {
                "user_id": user_id,
                "provider": "google",
                "refresh_token": refresh_token,
                "updated_at": now_iso,
            }
        ]

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, headers=headers, params=params, json=payload)

        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))

    async def mark_google_connected(self, user_id: str, email: str | None) -> None:
        profile_url = f"{self.settings.supabase_url}/rest/v1/user_profiles"

        existing_google_connected_at = await self._get_profile_google_connected_at(user_id)

        headers = self._service_headers(
            {
                "Prefer": "resolution=merge-duplicates,return=minimal",
                "Content-Type": "application/json",
            }
        )
        params = {"on_conflict": "id"}
        now_iso = datetime.now(timezone.utc).isoformat()
        payload = [
            {
                "id": user_id,
                "email": email,
                "google_connected_at": existing_google_connected_at or now_iso,
                "google_last_oauth_at": now_iso,
                "onboarding_completed": True,
            }
        ]

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(profile_url, headers=headers, params=params, json=payload)

        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))

    async def get_all_plans(self) -> List[Dict[str, Any]]:
        """Fetch all rows from the plans table (subscriptions + addons)."""
        url = f"{self.settings.supabase_url}/rest/v1/plans"
        headers = self._service_headers()
        params = {
            "select": "id,plan_type,name,usd_monthly,usd_yearly,usd_unit_price,inr_monthly,inr_yearly,inr_unit_price,credits,max_locations,is_addon,is_popular,features,limits_config",
            "order": "created_at.asc",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers, params=params)
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))
        return response.json()

    async def get_user_subscription(self, user_id: str) -> Optional[Dict[str, Any]]:
        url = f"{self.settings.supabase_url}/rest/v1/subscription_plans"
        headers = self._service_headers()
        params = {
            "select": "id,plan_type,max_locations,status,billing_cycle,current_period_start,current_period_end,amount_paid_cents,payment_currency",
            "user_id": f"eq.{user_id}",
            "limit": "1",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers, params=params)
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))
        data = response.json()
        return data[0] if data else None

    async def upsert_subscription(self, user_id: str, plan_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create or update the user's subscription plan."""
        url = f"{self.settings.supabase_url}/rest/v1/subscription_plans"
        headers = self._service_headers(
            {
                "Prefer": "resolution=merge-duplicates,return=representation",
                "Content-Type": "application/json",
            }
        )
        params = {"on_conflict": "user_id"}
        payload = [{"user_id": user_id, **plan_data}]

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, headers=headers, params=params, json=payload)
            if response.status_code < 400:
                data = response.json()
                return data[0] if data else payload[0]

            # Backward compatibility fallback: older databases may be missing
            # a unique constraint/index on user_id, which breaks ON CONFLICT.
            if not self._is_on_conflict_constraint_error(response):
                raise HTTPException(status_code=500, detail=self._postgrest_error(response))

            patch_headers = self._service_headers(
                {
                    "Prefer": "return=representation",
                    "Content-Type": "application/json",
                }
            )
            patch_params = {"user_id": f"eq.{user_id}"}
            patch_response = await client.patch(
                url,
                headers=patch_headers,
                params=patch_params,
                json=plan_data,
            )
            if patch_response.status_code >= 400:
                raise HTTPException(status_code=500, detail=self._postgrest_error(patch_response))

            patched_rows = patch_response.json()
            if patched_rows:
                return patched_rows[0]

            insert_payload = [{"user_id": user_id, **plan_data}]
            insert_response = await client.post(url, headers=patch_headers, json=insert_payload)
            if insert_response.status_code >= 400:
                raise HTTPException(status_code=500, detail=self._postgrest_error(insert_response))

            inserted_rows = insert_response.json()
            return inserted_rows[0] if inserted_rows else insert_payload[0]

    async def count_user_locations(self, user_id: str) -> int:
        url = f"{self.settings.supabase_url}/rest/v1/locations"
        headers = self._service_headers()
        params = {
            "select": "id",
            "user_id": f"eq.{user_id}",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers, params=params)
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))
        data = response.json()
        return len(data)

    async def get_location_by_gmb_location_id(
        self, user_id: str, gmb_location_id: str
    ) -> Optional[Dict[str, Any]]:
        url = f"{self.settings.supabase_url}/rest/v1/locations"
        headers = self._service_headers()
        params = {
            "select": "id,gmb_account_id,location_id,location_name,address,is_active,activation_locked_until,activated_plan_type,activated_billing_cycle",
            "user_id": f"eq.{user_id}",
            "location_id": f"eq.{gmb_location_id}",
            "limit": "1",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers, params=params)
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))
        data = response.json()
        return data[0] if data else None

    async def upsert_location(self, location_data: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.settings.supabase_url}/rest/v1/locations"
        headers = self._service_headers(
            {
                "Prefer": "resolution=merge-duplicates,return=representation",
                "Content-Type": "application/json",
            }
        )
        params = {"on_conflict": "user_id,location_id"}
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, headers=headers, params=params, json=[location_data])
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))
        data = response.json()
        return data[0] if data else location_data

    async def count_user_active_locations(self, user_id: str) -> int:
        url = f"{self.settings.supabase_url}/rest/v1/locations"
        headers = self._service_headers()
        params = {
            "select": "id",
            "user_id": f"eq.{user_id}",
            "is_active": "eq.true",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers, params=params)
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))
        data = response.json()
        return len(data)

    async def get_user_active_locations(self, user_id: str) -> List[Dict[str, Any]]:
        url = f"{self.settings.supabase_url}/rest/v1/locations"
        headers = self._service_headers()
        params = {
            "select": "id,location_id,is_active,activation_locked_until,activated_plan_type,activated_billing_cycle",
            "user_id": f"eq.{user_id}",
            "is_active": "eq.true",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers, params=params)
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))
        data = response.json()
        return data if isinstance(data, list) else []

    async def deactivate_locations(self, location_ids: List[str]) -> int:
        if not location_ids:
            return 0

        url = f"{self.settings.supabase_url}/rest/v1/locations"
        headers = self._service_headers(
            {
                "Prefer": "return=representation",
                "Content-Type": "application/json",
            }
        )
        now_iso = datetime.now(timezone.utc).isoformat()
        ids_csv = ",".join(location_ids)
        params = {"id": f"in.({ids_csv})"}
        payload = {
            "is_active": False,
            "activation_locked_until": None,
            "activated_plan_type": None,
            "activated_billing_cycle": None,
            "activated_at": None,
            "updated_at": now_iso,
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.patch(url, headers=headers, params=params, json=payload)
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))
        data = response.json()
        return len(data) if isinstance(data, list) else 0

    async def get_location_by_id(self, location_id: str) -> Optional[Dict[str, Any]]:
        url = f"{self.settings.supabase_url}/rest/v1/locations"
        headers = self._service_headers()
        params = {
            "select": "id,gmb_account_id,location_id,location_name",
            "id": f"eq.{location_id}",
            "limit": "1",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers, params=params)
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))
        data = response.json()
        return data[0] if data else None

    async def get_location_for_user_by_id(self, user_id: str, location_id: str) -> Optional[Dict[str, Any]]:
        url = f"{self.settings.supabase_url}/rest/v1/locations"
        headers = self._service_headers()
        params = {
            "select": "id,user_id,gmb_account_id,location_id,location_name",
            "id": f"eq.{location_id}",
            "user_id": f"eq.{user_id}",
            "limit": "1",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers, params=params)
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))
        data = response.json()
        return data[0] if data else None


    async def get_ai_credits(self, user_id: str) -> dict:
        """Return AI credit info from subscription_plans (single source of truth)."""
        headers = self._service_headers()
        async with httpx.AsyncClient(timeout=15.0) as client:
            plan_resp = await client.get(
                f"{self.settings.supabase_url}/rest/v1/subscription_plans",
                headers=headers,
                params={
                    "select": "total_ai_credits,ai_credits_used,remaining_ai_credits",
                    "user_id": f"eq.{user_id}",
                    "limit": "1",
                },
            )

        if plan_resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(plan_resp))

        plan_data = plan_resp.json()
        if not plan_data:
            return {"total_ai_credits": 0, "ai_credits_used": 0, "remaining_ai_credits": 0}

        row = plan_data[0]
        return {
            "total_ai_credits": row.get("total_ai_credits") or 0,
            "ai_credits_used": row.get("ai_credits_used") or 0,
            "remaining_ai_credits": row.get("remaining_ai_credits") or 0,
        }

    async def deduct_ai_credits(self, user_id: str, credits: int = 1) -> dict:
        """Atomically deduct AI credits via RPC. Returns {success, total, used, remaining}."""
        url = f"{self.settings.supabase_url}/rest/v1/rpc/deduct_ai_credits"
        headers = self._service_headers({"Content-Type": "application/json"})

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                url,
                headers=headers,
                json={"p_user_id": user_id, "p_credits": credits},
            )

        if resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(resp))

        return resp.json()

    async def log_ai_usage(
        self,
        user_id: str,
        action_type: str,
        credits_used: int = 1,
        location_id: Optional[str] = None,
        review_id: Optional[str] = None,
        review_response_id: Optional[str] = None,
        reviewer_name: Optional[str] = None,
        model_name: Optional[str] = None,
        request_meta: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Insert a row into ai_usage_logs to track credit consumption.

        review_id accepts the gmb_review_id string (text column).
        """
        url = f"{self.settings.supabase_url}/rest/v1/ai_usage_logs"
        headers = self._service_headers({"Content-Type": "application/json"})

        payload = {
            "organization_id": user_id,
            "location_id": location_id,
            "review_id": review_id,
            "review_response_id": review_response_id,
            "reviewer_name": reviewer_name,
            "model_name": model_name or self.settings.gemini_model_name,
            "action_type": action_type,
            "credits_used": credits_used,
            "request_meta_json": request_meta,
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=[payload])

        if resp.status_code >= 400:
            import logging
            logging.getLogger(__name__).error(
                "Failed to log AI usage for user %s: %s", user_id[:8], resp.text[:200]
            )

    async def add_addon_ai_credits(self, user_id: str, credits: int) -> dict:
        """Atomically add purchased addon credits via RPC."""
        url = f"{self.settings.supabase_url}/rest/v1/rpc/add_addon_credits"
        headers = self._service_headers({"Content-Type": "application/json"})

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                url,
                headers=headers,
                json={"p_user_id": user_id, "p_credits": credits},
            )

        if resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(resp))

        result = resp.json()
        if not result.get("success"):
            raise HTTPException(status_code=404, detail="No subscription found for user.")
        return result

    async def log_bulk_reply(
        self,
        user_id: str,
        location_id: Optional[str],
        review_id: Optional[str],
        action: str,
        rule_name: str,
        reply_text: Optional[str] = None,
        credits_consumed: int = 0,
        error_message: Optional[str] = None,
    ) -> None:
        """Insert a row into auto_reply_logs for bulk reply operations."""
        url = f"{self.settings.supabase_url}/rest/v1/auto_reply_logs"
        headers = self._service_headers({"Content-Type": "application/json"})

        payload = {
            "user_id": user_id,
            "rule_id": None,
            "location_id": location_id,
            "review_id": review_id,
            "rule_name": rule_name,
            "action": action,
            "reply_text": reply_text,
            "credits_consumed": credits_consumed,
            "error_message": error_message,
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                await client.post(url, headers=headers, json=[payload])
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error(
                "Failed to insert bulk reply log for user %s: %s", user_id[:8], exc
            )

    # -----------------------------------------------------------------------
    # Auto-Reply Rules
    # -----------------------------------------------------------------------

    async def get_user_location_by_id(
        self, user_id: str, location_id: str
    ) -> Optional[Dict[str, Any]]:
        """Alias for location ownership check used by automation."""
        return await self.get_location_for_user_by_id(user_id, location_id)

    async def list_auto_reply_rules(
        self, user_id: str, location_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        url = f"{self.settings.supabase_url}/rest/v1/auto_reply_rules"
        headers = self._service_headers()
        params: Dict[str, str] = {
            "select": "*",
            "user_id": f"eq.{user_id}",
            "order": "created_at.desc",
        }
        if location_id:
            params["location_id"] = f"eq.{location_id}"

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers, params=params)
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))
        data = response.json()
        return data if isinstance(data, list) else []

    async def create_auto_reply_rule(self, rule_data: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.settings.supabase_url}/rest/v1/auto_reply_rules"
        headers = self._service_headers(
            {"Prefer": "return=representation", "Content-Type": "application/json"}
        )

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, headers=headers, json=[rule_data])
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))
        data = response.json()
        if not data:
            raise HTTPException(status_code=500, detail="Failed to create rule.")
        return data[0]

    async def update_auto_reply_rule(
        self, rule_id: str, user_id: str, update_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        url = f"{self.settings.supabase_url}/rest/v1/auto_reply_rules"
        headers = self._service_headers(
            {"Prefer": "return=representation", "Content-Type": "application/json"}
        )
        params = {"id": f"eq.{rule_id}", "user_id": f"eq.{user_id}"}

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.patch(url, headers=headers, params=params, json=update_data)
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))
        data = response.json()
        return data[0] if data else None

    async def delete_auto_reply_rule(
        self, rule_id: str, user_id: str
    ) -> Optional[Dict[str, Any]]:
        url = f"{self.settings.supabase_url}/rest/v1/auto_reply_rules"
        headers = self._service_headers({"Prefer": "return=representation"})
        params = {"id": f"eq.{rule_id}", "user_id": f"eq.{user_id}"}

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.delete(url, headers=headers, params=params)
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))
        data = response.json()
        return data[0] if data else None

    async def get_automation_stats(self, user_id: str) -> Dict[str, Any]:
        """Get automation summary: active rules, replies sent, credits consumed."""
        headers = self._service_headers()
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        week_start = (now - __import__("datetime").timedelta(days=7)).isoformat()

        async with httpx.AsyncClient(timeout=15.0) as client:
            # Active rules count
            rules_resp = await client.get(
                f"{self.settings.supabase_url}/rest/v1/auto_reply_rules",
                headers=headers,
                params={
                    "select": "id",
                    "user_id": f"eq.{user_id}",
                    "is_active": "eq.true",
                },
            )
            # Replies today
            today_resp = await client.get(
                f"{self.settings.supabase_url}/rest/v1/auto_reply_logs",
                headers=headers,
                params={
                    "select": "id",
                    "user_id": f"eq.{user_id}",
                    "action": "eq.replied",
                    "created_at": f"gte.{today_start}",
                },
            )
            # Replies this week
            week_resp = await client.get(
                f"{self.settings.supabase_url}/rest/v1/auto_reply_logs",
                headers=headers,
                params={
                    "select": "id",
                    "user_id": f"eq.{user_id}",
                    "action": "eq.replied",
                    "created_at": f"gte.{week_start}",
                },
            )
            # Automation credits used this period
            credits_resp = await client.get(
                f"{self.settings.supabase_url}/rest/v1/ai_usage_logs",
                headers=headers,
                params={
                    "select": "credits_used",
                    "organization_id": f"eq.{user_id}",
                    "action_type": "eq.auto_reply_draft",
                },
            )

        active_rules = len(rules_resp.json()) if rules_resp.status_code < 400 else 0
        replies_today = len(today_resp.json()) if today_resp.status_code < 400 else 0
        replies_this_week = len(week_resp.json()) if week_resp.status_code < 400 else 0

        credits_data = credits_resp.json() if credits_resp.status_code < 400 else []
        automation_credits_used = sum(
            row.get("credits_used", 0) for row in credits_data
        ) if isinstance(credits_data, list) else 0

        return {
            "active_rules": active_rules,
            "replies_today": replies_today,
            "replies_this_week": replies_this_week,
            "automation_credits_used": automation_credits_used,
        }

    async def get_automation_logs(
        self, user_id: str, page: int = 1, limit: int = 20
    ) -> Dict[str, Any]:
        """Get paginated automation activity logs."""
        url = f"{self.settings.supabase_url}/rest/v1/auto_reply_logs"
        headers = self._service_headers({"Prefer": "count=exact"})
        offset = (page - 1) * limit
        params: Dict[str, str] = {
            "select": "*",
            "user_id": f"eq.{user_id}",
            "order": "created_at.desc",
            "offset": str(offset),
            "limit": str(limit),
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers, params=params)
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))

        data = response.json()
        # Extract total count from Content-Range header
        content_range = response.headers.get("content-range", "")
        total = 0
        if "/" in content_range:
            try:
                total = int(content_range.split("/")[-1])
            except ValueError:
                total = len(data) if isinstance(data, list) else 0

        return {
            "logs": data if isinstance(data, list) else [],
            "page": page,
            "limit": limit,
            "total": total,
        }

    async def _get_profile_google_connected_at(self, user_id: str) -> Optional[str]:
        profile_url = f"{self.settings.supabase_url}/rest/v1/user_profiles"
        headers = self._service_headers()
        params = {
            "select": "google_connected_at",
            "id": f"eq.{user_id}",
            "limit": "1",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(profile_url, headers=headers, params=params)

        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=self._postgrest_error(response))

        data = response.json()
        if not data:
            return None

        return data[0].get("google_connected_at")

    def _service_headers(self, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        headers = {
            "apikey": self.settings.service_role_key,
            "Authorization": f"Bearer {self.settings.service_role_key}",
        }
        if extra:
            headers.update(extra)
        return headers

    @staticmethod
    def _is_on_conflict_constraint_error(response: httpx.Response) -> bool:
        try:
            payload = response.json()
        except ValueError:
            payload = {}

        code = str(payload.get("code", "")).upper()
        message = " ".join(
            str(payload.get(key, "")) for key in ("message", "details", "hint")
        ).lower()
        response_text = response.text.lower()

        return (
            code == "42P10"
            or "no unique or exclusion constraint matching the on conflict specification"
            in message
            or "no unique or exclusion constraint matching the on conflict specification"
            in response_text
        )

    @staticmethod
    def _postgrest_error(response: httpx.Response) -> str:
        try:
            payload = response.json()
            message = payload.get("message") or payload.get("hint") or payload.get("details")
            if message:
                return str(message)
        except ValueError:
            pass
        return "Supabase request failed."
