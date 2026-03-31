import type {
  AutoReplyRule,
  AutomationStats,
  AutomationLogsResponse,
  CreateRulePayload,
  UpdateRulePayload,
} from "./types";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_GMB_BACKEND_URL ?? "http://localhost:8000";

function headers(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export async function fetchRules(
  accessToken: string,
  locationId?: string
): Promise<AutoReplyRule[]> {
  const params = locationId ? `?location_id=${locationId}` : "";
  const res = await fetch(`${BACKEND_URL}/automation/rules${params}`, {
    headers: headers(accessToken),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail?.message || err.detail || "Failed to fetch rules");
  }
  return res.json();
}

export async function createRule(
  accessToken: string,
  data: CreateRulePayload
): Promise<AutoReplyRule> {
  const res = await fetch(`${BACKEND_URL}/automation/rules`, {
    method: "POST",
    headers: headers(accessToken),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail?.message || err.detail || "Failed to create rule");
  }
  return res.json();
}

export async function updateRule(
  accessToken: string,
  ruleId: string,
  data: UpdateRulePayload
): Promise<AutoReplyRule> {
  const res = await fetch(`${BACKEND_URL}/automation/rules/${ruleId}`, {
    method: "PUT",
    headers: headers(accessToken),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail?.message || err.detail || "Failed to update rule");
  }
  return res.json();
}

export async function toggleRule(
  accessToken: string,
  ruleId: string,
  isActive: boolean
): Promise<AutoReplyRule> {
  const res = await fetch(`${BACKEND_URL}/automation/rules/${ruleId}/toggle`, {
    method: "PATCH",
    headers: headers(accessToken),
    body: JSON.stringify({ is_active: isActive }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail?.message || err.detail || "Failed to toggle rule");
  }
  return res.json();
}

export async function deleteRule(
  accessToken: string,
  ruleId: string
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/automation/rules/${ruleId}`, {
    method: "DELETE",
    headers: headers(accessToken),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail?.message || err.detail || "Failed to delete rule");
  }
}

export async function fetchAutomationStats(
  accessToken: string
): Promise<AutomationStats> {
  const res = await fetch(`${BACKEND_URL}/automation/stats`, {
    headers: headers(accessToken),
  });
  if (!res.ok) return { active_rules: 0, replies_today: 0, replies_this_week: 0, automation_credits_used: 0 };
  return res.json();
}

export async function fetchAutomationLogs(
  accessToken: string,
  page: number = 1,
  limit: number = 20
): Promise<AutomationLogsResponse> {
  const res = await fetch(
    `${BACKEND_URL}/automation/logs?page=${page}&limit=${limit}`,
    { headers: headers(accessToken) }
  );
  if (!res.ok) return { logs: [], page, limit, total: 0 };
  return res.json();
}
