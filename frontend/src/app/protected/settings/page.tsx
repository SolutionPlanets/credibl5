"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Globe,
  Loader2,
  Lock,
  Mail,
  Shield,
  Sparkles,
  UserCircle2,
  Zap,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useCurrency } from "@/lib/shared/currency-context";
import { getPlanPrice, getPlanDefinition, PLAN_ORDER, PLAN_RANK, isPlanId } from "@/lib/shared/plan-config";
import { getFriendlyAuthErrorMessage } from "@/lib/auth/auth-error-message";
import { startGoogleConnectFlow } from "@/lib/gmb/google-connect";
import { cn } from "@/lib/shared/utils";
import {
  type BillingCycle,
  type PlanId,
} from "@/lib/shared/plan-config";
import {
  createOrder,
  loadRazorpayScript,
  verifyPayment,
  type RazorpayOptions,
  type RazorpayResponse,
} from "@/lib/payments/razorpay";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProfileRow = {
  full_name: string | null;
  email: string | null;
  google_connected_at: string | null;
  has_password: boolean | null;
};

type SubscriptionRow = {
  plan_type: string | null;
  max_locations: number | null;
  billing_cycle: string | null;
  status: string | null;
  amount_paid_cents: number | null;
  payment_currency: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
};

type SettingsPreferences = {
  timezone: string;
  language: string;
  reviewAlerts: boolean;
  weeklyDigest: boolean;
  billingAlerts: boolean;
  productUpdates: boolean;
};

type AlertState = {
  type: "success" | "error";
  message: string;
} | null;

const SETTINGS_PREFERENCES_KEY = "credibl5-settings-preferences-v1";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "es", label: "Spanish" },
] as const;

const TIMEZONE_OPTIONS = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Kolkata",
  "Asia/Dubai",
] as const;

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getDefaultPreferences(): SettingsPreferences {
  const detectedTimezone =
    typeof window !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      : "UTC";
  const timezone = TIMEZONE_OPTIONS.includes(detectedTimezone as (typeof TIMEZONE_OPTIONS)[number])
    ? detectedTimezone
    : "UTC";

  return {
    timezone,
    language: "en",
    reviewAlerts: true,
    weeklyDigest: true,
    billingAlerts: true,
    productUpdates: false,
  };
}

function readStoredPreferences(): SettingsPreferences {
  const defaults = getDefaultPreferences();
  if (typeof window === "undefined") return defaults;

  try {
    const rawValue = window.localStorage.getItem(SETTINGS_PREFERENCES_KEY);
    if (!rawValue) return defaults;

    const parsed = JSON.parse(rawValue) as Partial<SettingsPreferences>;
    return {
      ...defaults,
      ...parsed,
    };
  } catch {
    return defaults;
  }
}

export default function SettingsPage() {
  const router = useRouter();
  const { formatCurrency, dynamicPricing, currency, planDefinitions } = useCurrency();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [fullName, setFullName] = useState("");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [preferences, setPreferences] = useState<SettingsPreferences>(getDefaultPreferences);
  const [loading, setLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [processingPlanId, setProcessingPlanId] = useState<PlanId | null>(null);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [profileAlert, setProfileAlert] = useState<AlertState>(null);
  const [planAlert, setPlanAlert] = useState<AlertState>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const currentPlanId = useMemo<PlanId>(() => {
    const planType = subscription?.plan_type;
    return isPlanId(planType) ? planType : "free";
  }, [subscription?.plan_type]);

  const isGoogleConnected = Boolean(profile?.google_connected_at);
  const hasPassword = Boolean(profile?.has_password);
  const currentPlan = getPlanDefinition(currentPlanId, planDefinitions);

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient();

      await fetch("/routes/ensure_subscription_routes", { method: "POST" }).catch(() => null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth/login");
        return;
      }

      setUser(user);

      const [{ data: profileData }, { data: subscriptionData }] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("full_name, email, google_connected_at, has_password")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("subscription_plans")
          .select(
            "plan_type, max_locations, billing_cycle, status, amount_paid_cents, payment_currency, current_period_start, current_period_end"
          )
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      const normalizedName =
        profileData?.full_name || user.user_metadata?.full_name || user.email || "";

      setProfile(profileData ?? null);
      setSubscription(subscriptionData ?? null);
      setFullName(normalizedName);
      setBillingCycle(subscriptionData?.billing_cycle === "yearly" ? "yearly" : "monthly");
      setPreferences(readStoredPreferences());
      setLoading(false);
    };

    loadData();
  }, [router]);

  const refreshSubscription = async (userId: string) => {
    const supabase = createClient();
    const { data: subscriptionData } = await supabase
      .from("subscription_plans")
      .select(
        "plan_type, max_locations, billing_cycle, status, amount_paid_cents, payment_currency, current_period_start, current_period_end"
      )
      .eq("user_id", userId)
      .maybeSingle();

    setSubscription(subscriptionData ?? null);
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    setIsSavingProfile(true);
    setProfileAlert(null);

    try {
      const supabase = createClient();
      const normalizedName = fullName.trim() || null;

      const { error: profileError } = await supabase
        .from("user_profiles")
        .update({
          full_name: normalizedName,
          email: user.email ?? null,
        })
        .eq("id", user.id);

      if (profileError) {
        throw profileError;
      }

      const { error: updateUserError } = await supabase.auth.updateUser({
        data: { full_name: normalizedName ?? undefined },
      });

      if (updateUserError) {
        throw updateUserError;
      }

      setProfile((prev) =>
        prev
          ? {
            ...prev,
            full_name: normalizedName,
          }
          : prev
      );
      setProfileAlert({
        type: "success",
        message: "Profile details updated.",
      });
    } catch (error) {
      setProfileAlert({
        type: "error",
        message: getFriendlyAuthErrorMessage(error, "Unable to save profile settings."),
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSavePreferences = () => {
    setIsSavingPreferences(true);
    setProfileAlert(null);

    try {
      window.localStorage.setItem(
        SETTINGS_PREFERENCES_KEY,
        JSON.stringify(preferences)
      );
      setProfileAlert({
        type: "success",
        message: "Workspace preferences saved.",
      });
    } catch {
      setProfileAlert({
        type: "error",
        message: "Failed to save preferences in browser storage.",
      });
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const handleConnectGoogle = async () => {
    setGoogleError(null);
    setIsConnectingGoogle(true);

    try {
      const supabase = createClient();
      await startGoogleConnectFlow({
        supabase,
        nextPath: "/protected/settings",
        flow: "connect-google",
      });
    } catch (error) {
      setGoogleError(
        getFriendlyAuthErrorMessage(
          error,
          "Unable to start Google connection flow."
        )
      );
      setIsConnectingGoogle(false);
    }
  };

  const handleDowngradePlan = async (planId: PlanId) => {
    if (!user) return;

    const shouldContinue = window.confirm(
      `Change plan to ${getPlanDefinition(planId, planDefinitions).name}?`
    );

    if (!shouldContinue) {
      return;
    }

    setProcessingPlanId(planId);
    setPlanAlert(null);

    try {
      const response = await fetch("/routes/change_plan_routes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planType: planId,
          billingCycle,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to update plan.");
      }

      await refreshSubscription(user.id);
      setPlanAlert({
        type: "success",
        message: payload.message || "Plan updated successfully.",
      });
    } catch (error) {
      setPlanAlert({
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to update plan.",
      });
    } finally {
      setProcessingPlanId(null);
    }
  };

  const handleUpgradePlan = async (planId: PlanId) => {
    if (!user) return;

    setProcessingPlanId(planId);
    setPlanAlert(null);

    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        console.error("Razorpay script failed to load on settings page.");
        throw new Error("Could not connect to Razorpay. Check your internet connection or disable ad-blockers.");
      }

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Session expired. Please sign in again.");
      }

      const order = await createOrder(session.access_token, planId, billingCycle, currency);

      const options: RazorpayOptions = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
        amount: order.amount,
        currency: order.currency,
        order_id: order.id,
        name: "Credibl5",
        description: `${getPlanDefinition(planId, planDefinitions).name} Plan - ${billingCycle}`,
        prefill: {
          name: fullName || undefined,
          email: session.user.email ?? undefined,
        },
        theme: { color: "#0f172a" },
        handler: async (payment: RazorpayResponse) => {
          console.log("Razorpay payment modal success callback triggered on settings page.");
          try {
            const {
              data: { session: refreshedSession },
            } = await supabase.auth.getSession();

            const accessToken = refreshedSession?.access_token ?? session.access_token;

            console.log("Invoking backend verification from settings page...");
            const verification = await verifyPayment(accessToken, {
              razorpay_payment_id: payment.razorpay_payment_id,
              razorpay_order_id: payment.razorpay_order_id,
              razorpay_signature: payment.razorpay_signature,
              plan_type: planId,
              billing_cycle: billingCycle,
              currency: currency,
            });

            console.log("Payment verification successful.");
            await refreshSubscription(user.id);
            setPlanAlert({
              type: "success",
              message:
                verification.message ||
                `Successfully upgraded to ${getPlanDefinition(planId, planDefinitions).name}.`,
            });
          } catch (error) {
            console.error("Verification callback failed on settings page:", error);
            setPlanAlert({
              type: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Payment verification failed. If your money was deducted, please contact support with order ID: " + order.id,
            });
          } finally {
            setProcessingPlanId(null);
          }
        },
        modal: {
          ondismiss: () => setProcessingPlanId(null),
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      setPlanAlert({
        type: "error",
        message:
          error instanceof Error ? error.message : "Unable to start checkout.",
      });
      setProcessingPlanId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-600 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
          Loading settings...
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-6 lg:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <section className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-900 text-white shadow-[0_20px_60px_-30px_rgba(2,132,199,0.75)]">
        <div className="pointer-events-none absolute -left-20 top-0 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-0 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative z-10 grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr] lg:p-10">
          <div>
            <Badge className="border-none bg-white/15 text-white hover:bg-white/15">
              Settings Center
            </Badge>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Account & Workspace Settings
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/85 sm:text-base">
              Manage your account details, notifications, integrations, and subscription
              plan from one place.
            </p>
          </div>
          <div className="rounded-3xl border border-white/20 bg-white/10 p-5 backdrop-blur-md sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/75">
              Current Plan
            </p>
            <p className="mt-2 text-2xl font-semibold">{currentPlan.name}</p>
            <p className="mt-2 text-sm text-white/75">
              Status: {(subscription?.status || "trial").toUpperCase()}
            </p>
            <p className="mt-1 text-sm text-white/75">
              Renews/ends: {formatDate(subscription?.current_period_end)}
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" />
              Up to{" "}
              {currentPlan.maxLocations < 0
                ? "unlimited"
                : `${currentPlan.maxLocations}`}{" "}
              locations
            </div>
          </div>
        </div>
      </section>

      {profileAlert && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm",
            profileAlert.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          )}
        >
          {profileAlert.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          ) : (
            <Shield className="mt-0.5 h-4 w-4 flex-shrink-0" />
          )}
          {profileAlert.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="rounded-4xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <UserCircle2 className="h-5 w-5 text-sky-600" />
              Profile
            </CardTitle>
            <CardDescription>
              Update your account details used across workspace pages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Full Name
              </p>
              <Input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your name"
                className="h-10 rounded-xl"
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Email
              </p>
              <Input
                value={user.email ?? ""}
                disabled
                className="h-10 rounded-xl bg-slate-100"
              />
            </div>

            <Button
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
              className="h-10 rounded-xl bg-slate-900 px-4 text-white hover:bg-slate-800"
            >
              {isSavingProfile ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Save Profile
                </>
              )}
            </Button>
          </CardContent>
        </Card>
        <Card className="rounded-4xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Globe className="h-5 w-5 text-cyan-600" />
              Workspace Preferences
            </CardTitle>
            <CardDescription>
              Language and timezone preferences for your dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Language
              </p>
              <Select
                value={preferences.language}
                onValueChange={(value) =>
                  setPreferences((prev) => ({ ...prev, language: value }))
                }
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Timezone
              </p>
              <Select
                value={preferences.timezone}
                onValueChange={(value) =>
                  setPreferences((prev) => ({ ...prev, timezone: value }))
                }
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleSavePreferences}
              disabled={isSavingPreferences}
              className="h-10 rounded-xl bg-slate-900 px-4 text-white hover:bg-slate-800"
            >
              {isSavingPreferences ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Preferences"
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-4xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Bell className="h-5 w-5 text-amber-600" />
              Notifications
            </CardTitle>
            <CardDescription>
              Choose which alerts you want delivered to your inbox.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            {[
              {
                key: "reviewAlerts",
                label: "New review alerts",
                description: "Email when new reviews arrive.",
              },
              {
                key: "weeklyDigest",
                label: "Weekly performance digest",
                description: "Summary every week.",
              },
              {
                key: "billingAlerts",
                label: "Billing reminders",
                description: "Renewals and payment confirmations.",
              },
              {
                key: "productUpdates",
                label: "Product updates",
                description: "Feature launches and release notes.",
              },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                  <p className="text-xs text-slate-500">{item.description}</p>
                </div>
                <Switch
                  checked={
                    preferences[item.key as keyof SettingsPreferences] as boolean
                  }
                  onCheckedChange={(checked) =>
                    setPreferences((prev) => ({
                      ...prev,
                      [item.key]: checked,
                    }))
                  }
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-4xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Lock className="h-5 w-5 text-emerald-600" />
              Security & Integrations
            </CardTitle>
            <CardDescription>
              Protect your account and keep Google Business connected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Password Login</p>
                  <p className="text-xs text-slate-500">
                    {hasPassword ? "Password is set for your account." : "No password configured yet."}
                  </p>
                </div>
                {hasPassword ? (
                  <Badge className="border-none bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                    Active
                  </Badge>
                ) : (
                  <Button
                    asChild
                    size="sm"
                    className="rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                  >
                    <a href="/auth/create-password">
                      Set Password
                      <ChevronRight className="ml-1 h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Google Business</p>
                  <p className="text-xs text-slate-500">
                    {isGoogleConnected
                      ? `Connected on ${formatDate(profile?.google_connected_at)}`
                      : "Connect to sync locations and reviews."}
                  </p>
                </div>
                {isGoogleConnected ? (
                  <Badge className="border-none bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                    Connected
                  </Badge>
                ) : (
                  <Button
                    onClick={handleConnectGoogle}
                    disabled={isConnectingGoogle}
                    size="sm"
                    className="rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                  >
                    {isConnectingGoogle ? "Redirecting..." : "Connect"}
                  </Button>
                )}
              </div>
            </div>

            {isGoogleConnected && (
              <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                If your review count seems low, use{" "}
                <strong className="font-semibold text-slate-700">Full Re-sync</strong> on the{" "}
                <a href="/protected" className="text-indigo-600 underline hover:text-indigo-800">
                  Dashboard
                </a>
                . No reconnection needed.
              </p>
            )}

            {googleError && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {googleError}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-4xl border-slate-200 bg-white shadow-sm">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <CreditCard className="h-5 w-5 text-indigo-600" />
            Billing & Plan Management
          </CardTitle>
          <CardDescription>
            Upgrade with checkout or downgrade instantly to a lower plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Active Plan
              </p>
              <p className="text-base font-bold text-slate-900">{currentPlan.name}</p>
              <p className="text-xs text-slate-500">
                Billing cycle: {(subscription?.billing_cycle || "trial").toUpperCase()} | Next end:{" "}
                {formatDate(subscription?.current_period_end)}
              </p>
            </div>
            <div className="inline-flex rounded-full border border-slate-200 bg-white p-1">
              {(["monthly", "yearly"] as const).map((cycle) => (
                <button
                  key={cycle}
                  type="button"
                  className={cn(
                    "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
                    billingCycle === cycle
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                  onClick={() => setBillingCycle(cycle)}
                >
                  {cycle === "monthly" ? "Monthly" : "Yearly"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {PLAN_ORDER.map((planId: PlanId) => {
              const plan = getPlanDefinition(planId, planDefinitions);
              const isCurrent = currentPlanId === planId;
              const currentRank = PLAN_RANK[currentPlanId];
              const targetRank = PLAN_RANK[planId];
              const isUpgrade = targetRank > currentRank;
              const isDowngrade = targetRank < currentRank;
              const isCycleSwitch =
                isCurrent &&
                planId !== "free" &&
                subscription?.billing_cycle !== billingCycle;
              const isCustom = Boolean(plan.isCustom);
              const isPaid = planId !== "free" && !isCustom;
              const price = getPlanPrice(planId, billingCycle, dynamicPricing, currency) ?? 0;

              return (
                <div
                  key={planId}
                  className={cn(
                    "relative flex flex-col rounded-3xl border p-4 shadow-sm transition-all",
                    isCurrent
                      ? "border-cyan-300 bg-cyan-50/40"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  )}
                >
                  {plan.popular && (
                    <span className="absolute -top-2 right-4 rounded-full bg-cyan-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-800">
                      Popular
                    </span>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">{plan.name}</p>
                    {isCurrent && (
                      <Badge className="border-none bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                        Current
                      </Badge>
                    )}
                  </div>

                  <div className="mt-2">
                    {isCustom ? (
                      <p className="text-2xl font-extrabold text-slate-900">Custom</p>
                    ) : (
                      <p className="text-2xl font-extrabold text-slate-900">
                        {formatCurrency(price ?? 0)}
                        <span className="ml-1 text-xs font-medium text-slate-500">
                          /{billingCycle === "monthly" ? "mo" : "yr"}
                        </span>
                      </p>
                    )}
                  </div>

                  <ul className="mt-3 space-y-1.5">
                    {plan.signupFeatures.slice(0, 4).map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-xs text-slate-600">
                        <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-4">
                    {isCurrent && !isCycleSwitch ? (
                      <div className="rounded-xl bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-600">
                        Current Plan
                      </div>
                    ) : isCustom ? (
                      <Button
                        asChild
                        variant="outline"
                        className="h-9 w-full rounded-xl border-slate-200"
                      >
                        <a href="/contact">Contact sales</a>
                      </Button>
                    ) : isUpgrade || isCycleSwitch ? (
                      <Button
                        onClick={() => handleUpgradePlan(planId)}
                        disabled={processingPlanId !== null || !isPaid}
                        className="h-9 w-full rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                      >
                        {processingPlanId === planId ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Zap className="mr-2 h-4 w-4" />
                            {isCycleSwitch ? "Switch Billing" : "Upgrade"}
                          </>
                        )}
                      </Button>
                    ) : isDowngrade ? (
                      <Button
                        onClick={() => handleDowngradePlan(planId)}
                        disabled={processingPlanId !== null}
                        variant="outline"
                        className="h-9 w-full rounded-xl border-slate-300 bg-white hover:bg-slate-50"
                      >
                        {processingPlanId === planId ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Updating...
                          </>
                        ) : (
                          "Downgrade"
                        )}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {planAlert && (
            <div
              className={cn(
                "rounded-2xl border px-4 py-3 text-sm",
                planAlert.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-700"
              )}
            >
              {planAlert.message}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <div className="flex items-start gap-2">
              <Mail className="mt-0.5 h-4 w-4 text-slate-500" />
              Upgrades are applied after successful checkout. Downgrades are applied
              immediately to the selected lower tier.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
