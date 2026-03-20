"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Loader2,
  MapPin,
  MessageSquare,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { getPlanDefinition } from "@/lib/shared/plan-config";
import { ConnectGoogleButton } from "@/components/protected/connect-google-button";
import { GMBStatusAlert } from "@/components/protected/gmb-status-alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddLocationDialog } from "@/components/protected/add-location-dialog";
import { usePendingReviews } from "@/lib/pending-reviews-context";

type TimeRange = "7d" | "30d" | "all";

type ProfileRow = {
  google_connected_at: string | null;
  onboarding_completed: boolean | null;
};

type SubscriptionRow = {
  plan_type: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
};

type LocationRow = {
  id: string;
  location_name: string;
  is_active: boolean | null;
};

type ReviewRow = {
  id: string;
  location_id: string;
  reviewer_name: string | null;
  star_rating: number | null;
  review_text: string | null;
  review_date: string | null;
  sentiment: string | null;
  review_reply: string | null;
  synced_at: string | null;
};

type DashboardStat = {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  iconClassName: string;
  panelClassName: string;
};

type ActionItem = {
  title: string;
  description: string;
  icon: React.ElementType;
  colorClassName: string;
  onClick: () => void;
};

const REVIEW_SELECT_COLUMNS =
  "id,location_id,reviewer_name,star_rating,review_text,review_date,sentiment,review_reply,synced_at";

const timeRangeOptions: Array<{ value: TimeRange; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Something went wrong. Please try again.";
}

function getBackendBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_GMB_BACKEND_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : "";
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string | null): string {
  const date = parseDate(value);
  if (!date) return "No date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatSentiment(value: string | null): string {
  const normalized = (value ?? "unknown").toLowerCase();
  if (normalized === "positive") return "Positive";
  if (normalized === "negative") return "Negative";
  if (normalized === "neutral") return "Neutral";
  return "Unknown";
}

function sentimentClassName(value: string | null): string {
  const normalized = (value ?? "").toLowerCase();
  if (normalized === "positive") return "bg-emerald-100 text-emerald-700";
  if (normalized === "negative") return "bg-rose-100 text-rose-700";
  if (normalized === "neutral") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

export default function ProtectedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setPendingCount } = usePendingReviews();
  const [user, setUser] = useState<User | null>(null);
  const [profileData, setProfileData] = useState<ProfileRow | null>(null);
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionRow | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchReviewsForLocations = useCallback(async (locationIds: string[]): Promise<ReviewRow[]> => {
    if (locationIds.length === 0) return [];

    const supabase = createClient();
    const { data, error } = await supabase
      .from("reviews")
      .select(REVIEW_SELECT_COLUMNS)
      .in("location_id", locationIds)
      .order("review_date", { ascending: false });

    if (error) throw new Error(error.message || "Failed to fetch reviews.");
    return (data ?? []) as ReviewRow[];
  }, []);

  const loadDashboard = useCallback(
    async (silent = false) => {
      if (silent) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorMessage(null);

      try {
        const supabase = createClient();
        const {
          data: { user: nextUser },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !nextUser) {
          router.push("/auth/login");
          return;
        }
        setUser(nextUser);

        const [profileResponse, locationResponse, subscriptionResponse] = await Promise.all([
          supabase
            .from("user_profiles")
            .select("google_connected_at, onboarding_completed")
            .eq("id", nextUser.id)
            .maybeSingle(),
          supabase
            .from("locations")
            .select("id,location_name,is_active")
            .eq("user_id", nextUser.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("subscription_plans")
            .select("plan_type,current_period_start,current_period_end")
            .eq("user_id", nextUser.id)
            .maybeSingle(),
        ]);

        if (profileResponse.error) {
          throw new Error(profileResponse.error.message || "Failed to fetch profile.");
        }
        if (locationResponse.error) {
          throw new Error(locationResponse.error.message || "Failed to fetch locations.");
        }

        const nextLocations = (locationResponse.data ?? []) as LocationRow[];
        const nextReviews = await fetchReviewsForLocations(nextLocations.map((location) => location.id));

        setProfileData((profileResponse.data ?? null) as ProfileRow | null);
        setSubscriptionData((subscriptionResponse.data ?? null) as SubscriptionRow | null);
        setLocations(nextLocations);
        setReviews(nextReviews);
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
      } finally {
        setIsRefreshing(false);
        setLoading(false);
      }
    },
    [fetchReviewsForLocations, router]
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const isGoogleConnected =
    Boolean(profileData?.google_connected_at) ||
    user?.user_metadata?.google_connected === true;

  const getAccessToken = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      throw new Error("Session expired. Please sign in again.");
    }
    return session.access_token;
  }, []);

  const handleSyncReviews = useCallback(async () => {
    if (locations.length === 0) {
      setErrorMessage("Add at least one location before syncing reviews.");
      return;
    }

    if (!isGoogleConnected) {
      setErrorMessage("Connect your Google Business Profile before syncing reviews.");
      return;
    }

    const backendBaseUrl = getBackendBaseUrl();
    if (!backendBaseUrl) {
      setErrorMessage("GMB backend URL is not configured.");
      return;
    }

    setIsSyncing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const accessToken = await getAccessToken();
      const activeLocations = locations.filter((location) => location.is_active === true);
      const targetLocations = activeLocations.length > 0 ? activeLocations : locations;

      let totalSyncedCount = 0;
      for (const location of targetLocations) {
        const response = await fetch(`${backendBaseUrl}/gmb/reviews/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ locationId: location.id }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const detail = payload?.detail;
          if (typeof detail === "string") throw new Error(detail);
          if (typeof detail === "object" && detail !== null && "message" in detail) {
            const message = (detail as { message?: unknown }).message;
            if (typeof message === "string") throw new Error(message);
          }
          throw new Error("Failed to sync reviews.");
        }

        const payload = (await response.json()) as { syncedCount?: number };
        totalSyncedCount += Number(payload.syncedCount ?? 0);
      }

      await loadDashboard(true);
      setSuccessMessage(
        `Sync complete for ${targetLocations.length} location(s). ${totalSyncedCount} new review(s) imported.`
      );
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSyncing(false);
    }
  }, [getAccessToken, isGoogleConnected, loadDashboard, locations]);

  const handleLocationAdded = useCallback(() => {
    setSuccessMessage("Location added successfully.");
    void loadDashboard(true);
  }, [loadDashboard]);

  const locationsCount = locations.length;
  const activeLocationsCount = locations.filter((location) => location.is_active === true).length;
  const activeLocations = useMemo(
    () => locations.filter((location) => location.is_active === true),
    [locations]
  );

  const locationNameById = useMemo(() => {
    return new Map(locations.map((location) => [location.id, location.location_name]));
  }, [locations]);

  const reviewsInRange = useMemo(() => {
    if (timeRange === "all") return reviews;

    const days = timeRange === "7d" ? 7 : 30;
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (days - 1));

    return reviews.filter((review) => {
      const date = parseDate(review.review_date);
      return Boolean(date && date >= cutoff);
    });
  }, [reviews, timeRange]);

  const orderedReviews = useMemo(() => {
    return [...reviewsInRange].sort((a, b) => {
      const left = parseDate(a.review_date)?.getTime() ?? parseDate(a.synced_at)?.getTime() ?? 0;
      const right = parseDate(b.review_date)?.getTime() ?? parseDate(b.synced_at)?.getTime() ?? 0;
      return right - left;
    });
  }, [reviewsInRange]);

  const recentReviews = useMemo(() => orderedReviews.slice(0, 8), [orderedReviews]);

  const totalReviews = reviewsInRange.length;
  const pendingRepliesCount = useMemo(
    () => reviewsInRange.filter((review) => !review.review_reply?.trim()).length,
    [reviewsInRange]
  );
  const repliedCount = totalReviews - pendingRepliesCount;

  const allTimePendingCount = useMemo(
    () => reviews.filter((review) => !review.review_reply?.trim()).length,
    [reviews]
  );

  useEffect(() => {
    setPendingCount(allTimePendingCount);
  }, [allTimePendingCount, setPendingCount]);

  const averageRating = useMemo(() => {
    const ratings = reviewsInRange
      .map((review) => review.star_rating)
      .filter((rating): rating is number => typeof rating === "number" && rating > 0);

    if (ratings.length === 0) return "0.0";
    const total = ratings.reduce((sum, rating) => sum + rating, 0);
    return (total / ratings.length).toFixed(1);
  }, [reviewsInRange]);

  const positiveSentimentShare = useMemo(() => {
    const sentimentScoped = reviewsInRange.filter((review) => review.sentiment);
    if (sentimentScoped.length === 0) return 0;
    const positiveCount = sentimentScoped.filter(
      (review) => review.sentiment?.toLowerCase() === "positive"
    ).length;
    return Math.round((positiveCount / sentimentScoped.length) * 100);
  }, [reviewsInRange]);

  const replyRate = totalReviews === 0 ? 0 : Math.round((repliedCount / totalReviews) * 100);

  const currentPlan = getPlanDefinition(subscriptionData?.plan_type);
  const creditLimit = Math.max(currentPlan.AiCredits, 0);
  const periodStart = parseDate(subscriptionData?.current_period_start);
  const periodRepliesUsed = useMemo(() => {
    return reviews.filter((review) => {
      if (!review.review_reply?.trim()) return false;
      if (!periodStart) return true;
      const compareDate = parseDate(review.synced_at) ?? parseDate(review.review_date);
      return Boolean(compareDate && compareDate >= periodStart);
    }).length;
  }, [periodStart, reviews]);
  const creditsUsed = periodRepliesUsed;
  const creditsRemaining = Math.max(creditLimit - creditsUsed, 0);
  const creditUsagePercent = creditLimit > 0 ? Math.min(100, Math.round((creditsUsed / creditLimit) * 100)) : 0;
  const periodEndLabel = formatDate(subscriptionData?.current_period_end ?? null);

  const stats: DashboardStat[] = useMemo(
    () => [
      {
        title: "Reviews Collected",
        value: String(totalReviews),
        subtitle: timeRange === "all" ? "Across all time" : `Within ${timeRange === "7d" ? "7" : "30"} days`,
        icon: MessageSquare,
        iconClassName: "bg-sky-100 text-sky-700",
        panelClassName: "from-sky-50 via-white to-sky-100/70",
      },
      {
        title: "Average Rating",
        value: averageRating,
        subtitle: totalReviews > 0 ? "Based on visible reviews" : "Not enough data yet",
        icon: Star,
        iconClassName: "bg-amber-100 text-amber-700",
        panelClassName: "from-amber-50 via-white to-orange-100/60",
      },
      {
        title: "Reply Coverage",
        value: `${replyRate}%`,
        subtitle: `${repliedCount}/${totalReviews} replied`,
        icon: Zap,
        iconClassName: "bg-emerald-100 text-emerald-700",
        panelClassName: "from-emerald-50 via-white to-teal-100/60",
      },
      {
        title: "Pending Replies",
        value: String(pendingRepliesCount),
        subtitle: pendingRepliesCount > 0 ? "Needs attention" : "Queue is clear",
        icon: ArrowUpRight,
        iconClassName: "bg-rose-100 text-rose-700",
        panelClassName: "from-rose-50 via-white to-orange-100/60",
      },
    ],
    [averageRating, pendingRepliesCount, repliedCount, replyRate, timeRange, totalReviews]
  );

  const actionItems: ActionItem[] = useMemo(() => {
    const items: ActionItem[] = [];

    if (!isGoogleConnected) {
      items.push({
        title: "Connect Google profile",
        description: "Enable review sync and reply publishing",
        icon: Sparkles,
        colorClassName: "text-indigo-700 bg-indigo-100",
        onClick: () => router.push("/protected/settings"),
      });
    }

    if (locationsCount === 0) {
      items.push({
        title: "Add your first location",
        description: "Link a location to start collecting reviews",
        icon: MapPin,
        colorClassName: "text-sky-700 bg-sky-100",
        onClick: () => setIsAddLocationOpen(true),
      });
    }

    if (pendingRepliesCount > 0) {
      items.push({
        title: "Clear pending queue",
        description: `${pendingRepliesCount} review(s) waiting for response`,
        icon: MessageSquare,
        colorClassName: "text-amber-700 bg-amber-100",
        onClick: () => router.push("/protected/inbox"),
      });
    }

    items.push({
      title: "Manage plan and billing",
      description: "Review credits, limits, and subscription cycle",
      icon: CheckCircle2,
      colorClassName: "text-emerald-700 bg-emerald-100",
      onClick: () => router.push("/protected/settings"),
    });

    if (reviews.length === 0 && locationsCount > 0) {
      items.push({
        title: "Run first sync",
        description: "Pull your latest Google reviews into the inbox",
        icon: RefreshCw,
        colorClassName: "text-slate-700 bg-slate-100",
        onClick: () => {
          void handleSyncReviews();
        },
      });
    }

    return items.slice(0, 4);
  }, [handleSyncReviews, isGoogleConnected, locationsCount, pendingRepliesCount, reviews.length, router]);

  const renderStars = (ratingValue: number | null) => {
    const rating = Math.max(0, Math.min(5, Number(ratingValue ?? 0)));
    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }, (_, index) => (
          <Star
            key={index}
            className={cn(
              "h-3.5 w-3.5",
              index < rating ? "fill-amber-400 text-amber-400" : "text-slate-300"
            )}
          />
        ))}
      </div>
    );
  };

  const googleState = searchParams.get("google") ?? undefined;
  const passwordCreated = searchParams.get("password_created") === "true";

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!user) return null;

  const displayName = user?.user_metadata?.full_name || user?.email || "User";
  const firstName = displayName.split(" ")[0];

  return (
    <div className="space-y-6 lg:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {passwordCreated && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-900 shadow-sm">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold">Password created successfully.</p>
            <p className="mt-0.5 text-xs text-emerald-700">You can now sign in with your email and password.</p>
          </div>
        </div>
      )}

      <section className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-sky-600 via-cyan-600 to-emerald-600 text-white shadow-[0_18px_65px_-30px_rgba(8,145,178,0.95)]">
        <div className="pointer-events-none absolute -left-20 top-0 h-52 w-52 rounded-full bg-white/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-60 w-60 rounded-full bg-emerald-300/30 blur-3xl" />
        <div className="relative z-10 grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.3fr_1fr] lg:p-10">
          <div>
            <Badge className="border-none bg-white/20 text-white hover:bg-white/20">
              Operations Hub
            </Badge>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Good to see you, {firstName}
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/90 sm:text-base">
              Stay on top of reviews, response speed, and account health from one workspace.
              Connect a location and we will start auto-syncing your latest Google activity.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button
                onClick={() => setIsAddLocationOpen(true)}
                className="h-11 rounded-xl bg-white px-5 font-semibold text-slate-900 hover:bg-slate-100"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Location
              </Button>
              <Button
                onClick={() => void handleSyncReviews()}
                variant="outline"
                disabled={isSyncing || isRefreshing || locationsCount === 0 || !isGoogleConnected}
                className="h-11 rounded-xl border-white/40 bg-white/10 px-5 font-semibold text-white hover:bg-white/20"
              >
                {isSyncing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Quick Sync
              </Button>
            </div>
            <div className="mt-4 rounded-2xl border border-white/20 bg-white/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/75">
                Activated locations
              </p>
              {activeLocations.length === 0 ? (
                <p className="mt-2 text-sm text-white/85">No activated location yet.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeLocations.map((location) => (
                    <span
                      key={location.id}
                      className="rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-medium text-white"
                    >
                      {location.location_name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-white/25 bg-white/10 p-5 backdrop-blur-md sm:p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white/90">Today at a glance</p>
              <Sparkles className="h-4 w-4 text-white/80" />
            </div>
            <div className="mt-4">
              <select
                value={timeRange}
                onChange={(event) => setTimeRange(event.target.value as TimeRange)}
                className="h-9 w-full rounded-xl border border-white/35 bg-white/15 px-3 text-xs font-semibold text-white outline-none focus:border-white/60"
              >
                {timeRangeOptions.map((option) => (
                  <option key={option.value} value={option.value} className="text-slate-900">
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl bg-white/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-white/70">Outstanding replies</p>
                <p className="mt-1 text-2xl font-semibold">{pendingRepliesCount}</p>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-white/70">Locations connected</p>
                <p className="mt-1 text-2xl font-semibold">{locationsCount}</p>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-white/70">Positive sentiment</p>
                <p className="mt-1 text-2xl font-semibold">{positiveSentimentShare}%</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <GMBStatusAlert googleState={googleState} />
      {errorMessage && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      )}

      {!isGoogleConnected ? (
        <Card className="overflow-hidden rounded-4xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="p-6 sm:p-8 lg:p-10">
              <Badge className="border-none bg-sky-100 text-sky-700 hover:bg-sky-100">Action Needed</Badge>
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Connect your Google Business Profile
              </h2>
              <p className="mt-3 max-w-xl text-sm text-slate-600 sm:text-base">
                Once connected, Credibl5 can pull in your latest customer feedback and help your team
                respond quickly with AI-powered drafts.
              </p>
              <div className="mt-7">
                <ConnectGoogleButton />
              </div>
            </div>
            <div className="border-t border-slate-200 bg-gradient-to-b from-slate-50 to-white p-6 sm:p-8 lg:border-l lg:border-t-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">What you unlock</p>
              <div className="mt-5 space-y-4">
                {[
                  "Automatic review sync every day",
                  "Reply suggestions with your brand tone",
                  "One dashboard for all locations",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    <p className="text-sm text-slate-700">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <Card
                key={stat.title}
                className={cn(
                  "rounded-3xl border-slate-200 bg-gradient-to-br shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg",
                  stat.panelClassName
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {stat.title}
                    </CardTitle>
                    <div className={cn("rounded-xl p-2", stat.iconClassName)}>
                      <stat.icon className="h-4 w-4" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                  <p className="mt-2 flex items-center text-xs text-slate-500">
                    <ArrowUpRight className="mr-1 h-3 w-3 text-emerald-600" />
                    {stat.subtitle}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.55fr_1fr]">
            <Card className="overflow-hidden rounded-4xl border-slate-200 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-100 p-6 sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold text-slate-900">Recent Reviews</CardTitle>
                    <CardDescription className="mt-1">
                      Latest reviews in the selected time range.
                    </CardDescription>
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    className="rounded-xl border-slate-200 bg-white font-semibold"
                  >
                    <Link href="/protected/inbox">Open Inbox</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="max-h-[520px] overflow-y-auto p-6 sm:p-8">
                {recentReviews.length === 0 ? (
                  <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center sm:p-12">
                    <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
                      <MessageSquare className="h-7 w-7" />
                    </div>
                    <p className="mt-4 text-base font-semibold text-slate-900">No synced reviews yet</p>
                    <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
                      Connect at least one location and run your first sync to populate this feed.
                    </p>
                    <div className="mt-6 flex justify-center">
                      <Button
                        onClick={() => void handleSyncReviews()}
                        disabled={isSyncing || locationsCount === 0}
                        className="rounded-xl bg-slate-900 px-5 font-semibold text-white hover:bg-slate-800"
                      >
                        {isSyncing ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Sync Now
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentReviews.map((review) => {
                      const hasReply = Boolean(review.review_reply?.trim());
                      const reviewerName = review.reviewer_name?.trim() || "Anonymous";

                      return (
                        <button
                          key={review.id}
                          type="button"
                          onClick={() => router.push("/protected/inbox")}
                          className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{reviewerName}</p>
                              <div className="mt-1 flex items-center gap-2">
                                {renderStars(review.star_rating)}
                                <Badge
                                  className={cn(
                                    "border-none px-2 py-0.5 text-[10px] font-semibold uppercase",
                                    sentimentClassName(review.sentiment)
                                  )}
                                >
                                  {formatSentiment(review.sentiment)}
                                </Badge>
                              </div>
                            </div>
                            <Badge
                              className={cn(
                                "border-none px-2 py-0.5 text-[10px] font-semibold",
                                hasReply ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                              )}
                            >
                              {hasReply ? "Replied" : "Pending"}
                            </Badge>
                          </div>

                          <p className="mt-3 line-clamp-2 text-xs text-slate-600">
                            {review.review_text?.trim() || "No review text provided."}
                          </p>

                          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                            <span className="truncate">
                              {locationNameById.get(review.location_id) ?? "Unknown location"}
                            </span>
                            <span>{formatDate(review.review_date)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="overflow-hidden rounded-4xl border-none bg-slate-900 text-white shadow-xl">
                <div className="bg-gradient-to-br from-sky-500/20 to-emerald-400/10 p-6 sm:p-7">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Capacity</p>
                  <p className="mt-2 text-xl font-semibold">{currentPlan.name} Plan</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {creditsUsed} / {creditLimit} credits used
                  </p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-300 to-emerald-300 transition-all"
                      style={{ width: `${creditUsagePercent}%` }}
                    />
                  </div>
                  <p className="mt-3 text-xs text-white/70">
                    {creditsRemaining} credits remaining - Reset on {periodEndLabel}
                  </p>
                </div>
                <div className="space-y-3 p-6 sm:p-7">
                  {[
                    { title: "Pending replies", value: String(pendingRepliesCount), icon: MessageSquare },
                    { title: "Connected locations", value: locationsCount.toString(), icon: MapPin },
                    { title: "Active locations", value: activeLocationsCount.toString(), icon: MapPin },
                    { title: "Auto-reply enabled", value: currentPlan.autoReplyEnabled ? "Yes" : "No", icon: Zap },
                  ].map((item) => (
                    <div key={item.title} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <item.icon className="h-4 w-4 text-sky-300" />
                        <span className="text-sm text-white/85">{item.title}</span>
                      </div>
                      <span className="text-sm font-semibold text-white">{item.value}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="rounded-4xl border-slate-200 bg-white p-6 shadow-sm sm:p-7">
                <h3 className="text-lg font-bold text-slate-900">Action Items</h3>
                {actionItems.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    You are all set. Keep an eye on the inbox for new reviews.
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {actionItems.map((item) => (
                      <button
                        key={item.title}
                        type="button"
                        onClick={item.onClick}
                        className="group flex w-full items-center justify-between rounded-2xl border border-slate-200 p-4 text-left transition-colors hover:border-slate-300"
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn("flex size-10 items-center justify-center rounded-xl", item.colorClassName)}>
                            <item.icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                            <p className="text-xs text-slate-500">{item.description}</p>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-600" />
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </>
      )}

      <AddLocationDialog 
        isOpen={isAddLocationOpen} 
        onClose={() => setIsAddLocationOpen(false)}
        onSuccess={handleLocationAdded}
      />
    </div>
  );
}
