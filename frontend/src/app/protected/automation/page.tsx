"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/shared/utils";
import { getPlanDefinition } from "@/lib/shared/plan-config";
import { useCurrency } from "@/lib/shared/currency-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Clock3,
  FileText,
  Gauge,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react";

import type { AutoReplyRule, AutomationStats, AutoReplyLog } from "@/lib/automation/types";
import {
  fetchRules,
  toggleRule as apiToggleRule,
  deleteRule as apiDeleteRule,
  fetchAutomationStats,
  fetchAutomationLogs,
} from "@/lib/automation/api";

import { AutomationRuleDialog } from "@/components/protected/automation-rule-dialog";
import { showInsufficientCredits } from "@/lib/credit-alerts";
import { useCredits } from "@/lib/credits-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LocationRow {
  id: string;
  location_name: string;
  is_active: boolean | null;
}

interface CreditInfo {
  total_ai_credits: number;
  ai_credits_used: number;
  remaining_ai_credits: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function triggerSummary(rule: AutoReplyRule): string {
  const t = rule.trigger_conditions;
  const parts: string[] = [];

  if (t.min_rating === t.max_rating) {
    parts.push(`${t.min_rating} star${t.min_rating !== 1 ? "s" : ""}`);
  } else {
    parts.push(`${t.min_rating}-${t.max_rating} stars`);
  }

  if (t.content_type === "with_text") parts.push("with text");
  if (t.content_type === "without_text") parts.push("without text");

  if (t.keywords_include.length > 0)
    parts.push(`including: ${t.keywords_include.slice(0, 3).join(", ")}${t.keywords_include.length > 3 ? "..." : ""}`);
  if (t.keywords_exclude.length > 0)
    parts.push(`excluding: ${t.keywords_exclude.slice(0, 3).join(", ")}${t.keywords_exclude.length > 3 ? "..." : ""}`);

  return parts.join(" | ");
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Upgrade Prompt (for plans that don't support auto-reply)
// ---------------------------------------------------------------------------

function AutomationUpgradePrompt() {
  const router = useRouter();
  const { planDefinitions } = useCurrency();
  const proPlan = getPlanDefinition("growth", planDefinitions);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 flex size-20 items-center justify-center rounded-3xl border border-reply-purple/20 bg-reply-purple/10">
        <Zap className="h-10 w-10 text-reply-purple" />
      </div>
      <h2 className="mb-2 text-2xl font-bold text-slate-900">Upgrade to {proPlan.name}</h2>
      <p className="mb-6 max-w-md text-sm text-slate-500">
        Auto-reply rules automatically respond to your Google reviews 24/7 using AI or saved templates.
        Upgrade to unlock this powerful feature.
      </p>
      <div className="mb-8 grid max-w-sm gap-2 text-left text-sm text-slate-600">
        {[
          "Auto-reply to reviews around the clock",
          "AI-powered replies with your brand voice",
          "Template-based rules (no credit cost)",
          "Credit usage tracking & controls",
          "Up to 5 active locations",
        ].map((f) => (
          <div key={f} className="flex items-center gap-2">
            <div className="size-1.5 rounded-full bg-reply-purple" />
            {f}
          </div>
        ))}
      </div>
      <Button
        onClick={() => router.push("/protected/settings")}
        className="gap-2 bg-reply-purple hover:bg-reply-purple/90"
      >
        Upgrade Plan <ArrowUpRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AutomationPage() {
  const router = useRouter();
  const { planDefinitions } = useCurrency();

  // Core state
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [stats, setStats] = useState<AutomationStats | null>(null);
  const { credits: sharedCredits, setCredits: setSharedCredits } = useCredits();
  const credits: CreditInfo | null = sharedCredits.total > 0 || sharedCredits.used > 0
    ? { total_ai_credits: sharedCredits.total, ai_credits_used: sharedCredits.used, remaining_ai_credits: sharedCredits.remaining }
    : null;
  const [planType, setPlanType] = useState<string>("free");
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);

  // UI state
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string>("all");
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoReplyRule | null>(null);

  // Activity logs
  const [logs, setLogs] = useState<AutoReplyLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  // Dismiss messages
  useEffect(() => {
    if (errorMessage) {
      const t = setTimeout(() => setErrorMessage(null), 6000);
      return () => clearTimeout(t);
    }
  }, [errorMessage]);
  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------

  const initialize = useCallback(async () => {
    setIsBootstrapping(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) { router.push("/auth/login"); return; }

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? null;
      setAccessToken(token);

      // Fetch plan info
      const { data: planData } = await supabase
        .from("subscription_plans")
        .select("plan_type,total_ai_credits,ai_credits_used,remaining_ai_credits")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      const currentPlanType = planData?.plan_type ?? "free";
      setPlanType(currentPlanType);
      const plan = getPlanDefinition(currentPlanType, planDefinitions);
      setAutoReplyEnabled(plan.autoReplyEnabled);

      if (planData) {
        setSharedCredits({
          total: planData.total_ai_credits ?? 0,
          used: planData.ai_credits_used ?? 0,
          remaining: planData.remaining_ai_credits ?? 0,
        });
      }

      if (!plan.autoReplyEnabled) {
        setIsBootstrapping(false);
        return;
      }

      // Fetch locations
      const { data: locationData } = await supabase
        .from("locations")
        .select("id,location_name,is_active")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setLocations((locationData ?? []) as LocationRow[]);

      // Fetch rules & stats from backend
      if (token) {
        const [rulesData, statsData] = await Promise.all([
          fetchRules(token).catch(() => []),
          fetchAutomationStats(token).catch(() => null),
        ]);
        setRules(rulesData);
        setStats(statsData);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load automation page.");
    } finally {
      setIsBootstrapping(false);
    }
  }, [router]);

  useEffect(() => { void initialize(); }, [initialize]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleToggleRule = useCallback(async (ruleId: string, newState: boolean) => {
    if (!accessToken) return;
    setTogglingRuleId(ruleId);
    try {
      const updated = await apiToggleRule(accessToken, ruleId, newState);
      setRules((prev) => prev.map((r) => (r.id === ruleId ? updated : r)));
      setSuccessMessage(`Rule ${newState ? "activated" : "paused"}.`);
    } catch (error: any) {
      const msg = error?.message || "Failed to toggle rule.";
      if (msg.includes("INSUFFICIENT_CREDITS") || msg.includes("402")) {
        showInsufficientCredits();
      }
      setErrorMessage(msg);
    } finally {
      setTogglingRuleId(null);
    }
  }, [accessToken]);

  const handleDeleteRule = useCallback(async (ruleId: string) => {
    if (!accessToken) return;
    setDeletingRuleId(ruleId);
    try {
      await apiDeleteRule(accessToken, ruleId);
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      setSuccessMessage("Rule deleted.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete rule.");
    } finally {
      setDeletingRuleId(null);
    }
  }, [accessToken]);

  const handleRuleSaved = useCallback((rule: AutoReplyRule) => {
    setRules((prev) => {
      const idx = prev.findIndex((r) => r.id === rule.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = rule;
        return next;
      }
      return [rule, ...prev];
    });
    setIsDialogOpen(false);
    setEditingRule(null);
    setSuccessMessage(editingRule ? "Rule updated." : "Rule created.");
  }, [editingRule]);

  const handleLoadLogs = useCallback(async () => {
    if (!accessToken) return;
    setShowLogs(true);
    try {
      const data = await fetchAutomationLogs(accessToken, 1, 30);
      setLogs(data.logs);
    } catch {
      setLogs([]);
    }
  }, [accessToken]);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const locationNameById = useMemo(
    () => new Map(locations.map((l) => [l.id, l.location_name])),
    [locations]
  );

  const filteredRules = useMemo(() => {
    if (selectedLocationFilter === "all") return rules;
    return rules.filter((r) => r.location_id === selectedLocationFilter);
  }, [rules, selectedLocationFilter]);

  const creditPercent = credits
    ? credits.total_ai_credits > 0
      ? Math.round((credits.remaining_ai_credits / credits.total_ai_credits) * 100)
      : 0
    : null;
  const activeRulesCount = useMemo(() => rules.filter((r) => r.is_active).length, [rules]);
  const aiRulesCount = useMemo(() => rules.filter((r) => r.response_settings.type === "ai").length, [rules]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isBootstrapping) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-reply-purple" />
      </div>
    );
  }

  if (!autoReplyEnabled) {
    return <AutomationUpgradePrompt />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-sky-50 via-white to-indigo-50 p-6 shadow-sm">
        <div className="absolute -right-16 -top-20 size-56 rounded-full bg-reply-purple/10 blur-3xl" />
        <div className="absolute -bottom-20 left-1/3 size-52 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="gap-1 border-reply-purple/20 bg-reply-purple/10 text-reply-purple">
                <Sparkles className="h-3 w-3" /> Automation Studio
              </Badge>
              <Badge variant="outline" className="border-slate-300 bg-white/80 text-slate-600">
                {planType.toUpperCase()} plan
              </Badge>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Auto-Reply Rules</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Build smart rules that reply automatically to Google reviews using AI or templates.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                {stats?.active_rules ?? activeRulesCount} active rules
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                {aiRulesCount} AI-powered rules
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                {locations.length} location{locations.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={showLogs ? () => setShowLogs(false) : handleLoadLogs}
              className="gap-2 border-slate-300 bg-white/80 text-slate-700 hover:bg-white"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              {showLogs ? "Hide Activity" : "View Activity"}
            </Button>
            <Button
              onClick={() => {
                if (credits && credits.remaining_ai_credits <= 0) {
                  showInsufficientCredits();
                  return;
                }
                setEditingRule(null);
                setIsDialogOpen(true);
              }}
              className={cn(
                "gap-2",
                credits && credits.remaining_ai_credits <= 0
                  ? "bg-slate-400 cursor-not-allowed hover:bg-slate-400"
                  : "bg-reply-purple hover:bg-reply-purple/90"
              )}
              title={credits && credits.remaining_ai_credits <= 0 ? "No AI credits remaining" : undefined}
            >
              <Plus className="h-4 w-4" /> New Rule
            </Button>
          </div>
        </div>
      </section>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        {credits && (
          <Card className="overflow-hidden border-slate-200/80 shadow-sm lg:col-span-7">
            <CardHeader className="border-b border-slate-100 bg-slate-50/80 pb-3">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "flex size-9 items-center justify-center rounded-lg border",
                  creditPercent !== null && creditPercent <= 20
                    ? "border-amber-200 bg-amber-50"
                    : "border-reply-purple/20 bg-reply-purple/10"
                )}>
                  <Gauge className={cn(
                    "h-4 w-4",
                    creditPercent !== null && creditPercent <= 20 ? "text-amber-600" : "text-reply-purple"
                  )} />
                </div>
                <div>
                  <CardTitle className="text-base text-slate-900">Credit Health</CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Monitor usage and avoid reply interruptions
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-slate-900">
                    {credits.remaining_ai_credits} / {credits.total_ai_credits}
                  </p>
                  <p className="text-xs text-slate-500">AI credits remaining</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-800">{creditPercent ?? 0}% left</p>
                  <p className="text-xs text-slate-500">{stats?.automation_credits_used ?? 0} used this period</p>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    creditPercent !== null && creditPercent <= 20
                      ? creditPercent === 0 ? "bg-red-500" : "bg-amber-500"
                      : "bg-reply-purple"
                  )}
                  style={{ width: `${creditPercent ?? 0}%` }}
                />
              </div>
              {creditPercent !== null && creditPercent === 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  AI credits exhausted. Template-based rules still run.
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto h-7 border-red-200 text-xs text-red-700 hover:bg-red-100"
                    onClick={() => router.push("/protected/settings")}
                  >
                    Buy Credits
                  </Button>
                </div>
              )}
              {creditPercent !== null && creditPercent > 0 && creditPercent <= 20 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Running low on AI credits. Top up to keep automation uninterrupted.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {stats && (
          <div className={cn("grid grid-cols-2 gap-3", credits ? "lg:col-span-5" : "sm:grid-cols-4 lg:col-span-12")}>
            {[
              { label: "Active Rules", value: stats.active_rules, icon: Zap },
              { label: "Replies Today", value: stats.replies_today, icon: Bot },
              { label: "Replies This Week", value: stats.replies_this_week, icon: TrendingUp },
              { label: "Credits Used", value: stats.automation_credits_used, icon: Star },
            ].map((s) => (
              <Card key={s.label} className="border-slate-200/80 shadow-sm">
                <CardContent className="flex items-center gap-3 p-3.5">
                  <div className="flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                    <s.icon className="h-4 w-4 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-900">{s.value}</p>
                    <p className="text-[11px] text-slate-500">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card className="overflow-hidden border-slate-200/80 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/80 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base text-slate-900">Rules Workspace</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                {filteredRules.length} rule{filteredRules.length === 1 ? "" : "s"} in view
              </CardDescription>
            </div>
            {locations.length > 1 && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-600">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                <select
                  value={selectedLocationFilter}
                  onChange={(e) => setSelectedLocationFilter(e.target.value)}
                  className="bg-transparent pr-6 text-sm outline-none"
                >
                  <option value="all">All Locations</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.location_name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          {filteredRules.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-14 text-center">
              <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-slate-200 bg-white">
                <Zap className="h-7 w-7 text-slate-400" />
              </div>
              <h3 className="mb-1 text-lg font-semibold text-slate-900">
                {rules.length === 0 ? "Create your first automation rule" : "No rules match this filter"}
              </h3>
              <p className="mb-5 max-w-sm text-sm text-slate-500">
                {rules.length === 0
                  ? "Set up rules to automatically reply with AI or templates."
                  : "Try selecting another location to view more rules."}
              </p>
              {rules.length === 0 ? (
                <Button
                  onClick={() => {
                    if (credits && credits.remaining_ai_credits <= 0) {
                      showInsufficientCredits();
                      return;
                    }
                    setEditingRule(null);
                    setIsDialogOpen(true);
                  }}
                  className={cn(
                    "gap-2",
                    credits && credits.remaining_ai_credits <= 0
                      ? "bg-slate-400 cursor-not-allowed hover:bg-slate-400"
                      : "bg-reply-purple hover:bg-reply-purple/90"
                  )}
                  title={credits && credits.remaining_ai_credits <= 0 ? "No AI credits remaining" : undefined}
                >
                  <Plus className="h-4 w-4" /> Create Rule
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setSelectedLocationFilter("all")}
                  className="gap-2"
                >
                  <MapPin className="h-4 w-4" /> Show All Locations
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRules.map((rule) => (
                <div
                  key={rule.id}
                  className={cn(
                    "rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300",
                    !rule.is_active && "bg-slate-50/80 opacity-70"
                  )}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">{rule.name}</h3>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            rule.is_active
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-slate-100 text-slate-500"
                          )}
                        >
                          {rule.is_active ? "Active" : "Paused"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            rule.response_settings.type === "ai"
                              ? "border-reply-purple/30 bg-reply-purple/10 text-reply-purple"
                              : "border-reply-blue/30 bg-reply-blue/10 text-reply-blue"
                          )}
                        >
                          {rule.response_settings.type === "ai" ? (
                            <><Bot className="mr-1 h-3 w-3" /> AI</>
                          ) : (
                            <><FileText className="mr-1 h-3 w-3" /> Template</>
                          )}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <Badge variant="outline" className="gap-1 border-slate-200 text-slate-500">
                          <MapPin className="h-3 w-3" />
                          {locationNameById.get(rule.location_id) ?? "Unknown"}
                        </Badge>
                        <Badge variant="outline" className="gap-1 border-slate-200 text-slate-500">
                          <Star className="h-3 w-3 text-amber-400" />
                          {rule.trigger_conditions.min_rating}-{rule.trigger_conditions.max_rating} stars
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">{triggerSummary(rule)}</p>
                      {rule.updated_at && (
                        <p className="flex items-center gap-1 text-[10px] text-slate-400">
                          <Clock3 className="h-3 w-3" /> Updated {formatDate(rule.updated_at)}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-end lg:self-start">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(checked) => handleToggleRule(rule.id, !!checked)}
                        disabled={togglingRuleId === rule.id}
                        size="sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => { setEditingRule(rule); setIsDialogOpen(true); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-500 hover:bg-red-50 hover:text-red-700"
                        onClick={() => handleDeleteRule(rule.id)}
                        disabled={deletingRuleId === rule.id}
                      >
                        {deletingRuleId === rule.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showLogs && (
        <Card className="overflow-hidden border-slate-200/80 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/80 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base text-slate-900">Recent Activity</CardTitle>
                <CardDescription className="text-xs">Last 30 automation attempts and outcomes</CardDescription>
              </div>
              <Badge variant="outline" className="border-slate-300 bg-white text-slate-600">
                {logs.length} entries
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {logs.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No automation activity yet.</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className={cn(
                      "mt-0.5 flex size-8 items-center justify-center rounded-lg",
                      log.action === "replied" ? "bg-emerald-100" : "bg-red-100"
                    )}>
                      {log.action === "replied" ? (
                        <Bot className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="font-medium text-slate-800">
                        {log.action === "replied" ? "Auto-replied" : log.action === "skipped_no_credits" ? "Skipped (no credits)" : "Skipped (error)"}
                        {log.rule_name && <span className="text-slate-500"> via {log.rule_name}</span>}
                      </p>
                      {log.reply_text && (
                        <p className="mt-1 line-clamp-2 text-slate-500">{log.reply_text}</p>
                      )}
                      {log.error_message && (
                        <p className="mt-1 text-red-500">{log.error_message}</p>
                      )}
                      <p className="mt-1 text-slate-400">{formatDate(log.created_at)}</p>
                    </div>
                    {log.credits_consumed > 0 && (
                      <Badge variant="outline" className="border-slate-200 text-[10px]">
                        -{log.credits_consumed} credit
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Rule Create/Edit Dialog */}
      <AutomationRuleDialog
        open={isDialogOpen}
        onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingRule(null); }}
        rule={editingRule}
        locations={locations}
        accessToken={accessToken}
        onSaved={handleRuleSaved}
      />
    </div>
  );
}
