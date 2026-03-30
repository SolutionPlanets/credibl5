"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getReviewsByLocations } from "@/lib/review-store";
import type { StoredReview } from "@/lib/review-store";
import { cn } from "@/lib/shared/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BarChart3, MessageSquareText, Star, ThumbsUp, TrendingUp } from "lucide-react";

import { ReviewsOverTimeChart } from "./reviews-over-time-chart";
import { RatingDistributionChart } from "./rating-distribution-chart";
import { SentimentBreakdownChart } from "./sentiment-breakdown-chart";
import { ResponseRateChart } from "./response-rate-chart";
import { CumulativeGrowthChart } from "./cumulative-growth-chart";

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeRange = "7d" | "30d" | "90d" | "all";

interface LocationRow {
  id: string;
  location_name: string;
  is_active: boolean | null;
}

const TIME_RANGE_OPTIONS: Array<{ value: TimeRange; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#16a34a",
  neutral: "#f59e0b",
  negative: "#ef4444",
};

const RATING_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e"];

const LOCATION_COLORS = [
  "#587DFE", "#9747FF", "#22c55e", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#14b8a6",
];

// ─── Data helpers ─────────────────────────────────────────────────────────────

function filterByTimeRange(reviews: StoredReview[], range: TimeRange): StoredReview[] {
  if (range === "all") return reviews;
  const now = Date.now();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return reviews.filter((r) => {
    if (!r.review_date) return false;
    return new Date(r.review_date).getTime() >= cutoff;
  });
}

function groupByPeriod(
  reviews: StoredReview[],
  range: TimeRange
): Array<{ period: string; count: number; avgRating: number; repliedCount: number }> {
  if (reviews.length === 0) return [];
  const useDaily = range === "7d" || range === "30d";
  const buckets = new Map<
    string,
    { count: number; ratingSum: number; repliedCount: number; ts: number }
  >();

  for (const r of reviews) {
    if (!r.review_date) continue;
    const date = new Date(r.review_date);
    const key = useDaily
      ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    const existing = buckets.get(key) ?? {
      count: 0,
      ratingSum: 0,
      repliedCount: 0,
      ts: date.getTime(),
    };
    existing.count += 1;
    existing.ratingSum += r.star_rating ?? 0;
    existing.repliedCount += r.review_reply ? 1 : 0;
    existing.ts = Math.min(existing.ts, date.getTime());
    buckets.set(key, existing);
  }

  return Array.from(buckets.entries())
    .map(([period, { count, ratingSum, repliedCount, ts }]) => ({
      period,
      count,
      avgRating: count > 0 ? Math.round((ratingSum / count) * 10) / 10 : 0,
      repliedCount,
      ts,
    }))
    .sort((a, b) => a.ts - b.ts)
    .map(({ period, count, avgRating, repliedCount }) => ({
      period,
      count,
      avgRating,
      repliedCount,
    }));
}

function buildRatingDistribution(reviews: StoredReview[]) {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) {
    const rating = r.star_rating;
    if (rating && rating >= 1 && rating <= 5) counts[rating] += 1;
  }
  return [1, 2, 3, 4, 5].map((star) => ({
    star: `${star} star`,
    count: counts[star],
    fill: RATING_COLORS[star - 1],
  }));
}

function buildSentimentData(reviews: StoredReview[]) {
  const counts: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
  for (const r of reviews) {
    const s = r.sentiment?.toLowerCase() ?? "neutral";
    if (s in counts) counts[s] += 1;
    else counts.neutral += 1;
  }
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value, fill: SENTIMENT_COLORS[name] ?? "#94a3b8" }));
}

function buildResponseRateTrend(reviews: StoredReview[], range: TimeRange) {
  return groupByPeriod(reviews, range).map(({ period, count, repliedCount }) => ({
    period,
    responseRate: count > 0 ? Math.round((repliedCount / count) * 100) : 0,
  }));
}

function buildCumulativeGrowth(reviews: StoredReview[], range: TimeRange) {
  const grouped = groupByPeriod(reviews, range);
  let cumulative = 0;
  return grouped.map(({ period, count }) => {
    cumulative += count;
    return { period, cumulative };
  });
}

interface LineConfig { key: string; name: string; color: string }

/** Group reviews by period, with one count key per location (for multi-line charts). */
function groupByPeriodPerLocation(
  reviews: StoredReview[],
  range: TimeRange,
  locs: LocationRow[]
): { data: Array<Record<string, number | string>>; lines: LineConfig[] } {
  if (reviews.length === 0 || locs.length === 0) return { data: [], lines: [] };
  const useDaily = range === "7d" || range === "30d";
  const periodMeta = new Map<string, { ts: number }>();
  const buckets = new Map<string, Map<string, number>>();

  for (const r of reviews) {
    if (!r.review_date) continue;
    const date = new Date(r.review_date);
    const key = useDaily
      ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    const meta = periodMeta.get(key);
    if (!meta) periodMeta.set(key, { ts: date.getTime() });
    else meta.ts = Math.min(meta.ts, date.getTime());
    if (!buckets.has(key)) buckets.set(key, new Map());
    const lb = buckets.get(key)!;
    lb.set(r.location_id, (lb.get(r.location_id) ?? 0) + 1);
  }

  const data = Array.from(periodMeta.entries())
    .sort((a, b) => a[1].ts - b[1].ts)
    .map(([period]) => {
      const point: Record<string, number | string> = { period };
      const lb = buckets.get(period);
      for (const loc of locs) point[loc.id] = lb?.get(loc.id) ?? 0;
      return point;
    });

  const lines: LineConfig[] = locs.map((loc, i) => ({
    key: loc.id,
    name: loc.location_name,
    color: LOCATION_COLORS[i % LOCATION_COLORS.length],
  }));
  return { data, lines };
}

/** Build cumulative sums per location (for multi-line cumulative chart). */
function buildCumulativePerLocation(
  reviews: StoredReview[],
  range: TimeRange,
  locs: LocationRow[]
): { data: Array<Record<string, number | string>>; lines: LineConfig[] } {
  const { data, lines } = groupByPeriodPerLocation(reviews, range, locs);
  const running = new Map<string, number>(locs.map((l) => [l.id, 0]));
  const cumulativeData = data.map((point) => {
    const newPoint: Record<string, number | string> = { period: point.period };
    for (const loc of locs) {
      const prev = running.get(loc.id) ?? 0;
      const add = (point[loc.id] as number) ?? 0;
      running.set(loc.id, prev + add);
      newPoint[loc.id] = prev + add;
    }
    return newPoint;
  });
  return { data: cumulativeData, lines };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [allReviews, setAllReviews] = useState<StoredReview[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data: locationData } = await supabase
        .from("locations")
        .select("id,location_name,is_active")
        .eq("user_id", user.id)
        .eq("is_active", true);

      const locs: LocationRow[] = locationData ?? [];
      setLocations(locs);

      if (locs.length === 0) {
        setAllReviews([]);
        return;
      }

      const reviews = await getReviewsByLocations(
        user.id,
        locs.map((l) => l.id)
      );
      setAllReviews(reviews);
    } catch {
      // Silent fallback; UI handles empty state
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredByLocation = useMemo(() => {
    if (selectedLocationId === "all") return allReviews;
    return allReviews.filter((r) => r.location_id === selectedLocationId);
  }, [allReviews, selectedLocationId]);

  const filteredReviews = useMemo(
    () => filterByTimeRange(filteredByLocation, timeRange),
    [filteredByLocation, timeRange]
  );

  const kpis = useMemo(() => {
    const total = filteredReviews.length;
    const ratingSum = filteredReviews.reduce((s, r) => s + (r.star_rating ?? 0), 0);
    const avgRating = total > 0 ? ratingSum / total : 0;
    const replied = filteredReviews.filter((r) => r.review_reply).length;
    const responseRate = total > 0 ? (replied / total) * 100 : 0;
    const positiveCount = filteredReviews.filter(
      (r) => (r.sentiment?.toLowerCase() ?? "") === "positive"
    ).length;
    const positivePct = total > 0 ? (positiveCount / total) * 100 : 0;
    return { total, avgRating, responseRate, positivePct };
  }, [filteredReviews]);

  const isAllLocations = selectedLocationId === "all" && locations.length > 1;

  const { reviewsOverTimeData, reviewsOverTimeLines } = useMemo(() => {
    if (isAllLocations) {
      const { data, lines } = groupByPeriodPerLocation(filteredReviews, timeRange, locations);
      return { reviewsOverTimeData: data, reviewsOverTimeLines: lines };
    }
    const data = groupByPeriod(filteredReviews, timeRange).map((d) => ({
      period: d.period,
      count: d.count,
    }));
    return { reviewsOverTimeData: data, reviewsOverTimeLines: undefined };
  }, [isAllLocations, filteredReviews, timeRange, locations]);

  const ratingDist = useMemo(() => buildRatingDistribution(filteredReviews), [filteredReviews]);
  const sentimentData = useMemo(() => buildSentimentData(filteredReviews), [filteredReviews]);
  const responseRateTrend = useMemo(
    () => buildResponseRateTrend(filteredReviews, timeRange),
    [filteredReviews, timeRange]
  );

  const { cumulativeData, cumulativeLines } = useMemo(() => {
    if (isAllLocations) {
      const { data, lines } = buildCumulativePerLocation(filteredReviews, timeRange, locations);
      return { cumulativeData: data, cumulativeLines: lines };
    }
    const data = buildCumulativeGrowth(filteredReviews, timeRange).map((d) => ({
      period: d.period,
      cumulative: d.cumulative,
    }));
    return { cumulativeData: data, cumulativeLines: undefined };
  }, [isAllLocations, filteredReviews, timeRange, locations]);

  const selectedLocationName =
    selectedLocationId === "all"
      ? "All Locations"
      : (locations.find((l) => l.id === selectedLocationId)?.location_name ?? "Unknown");

  const selectedTimeLabel =
    TIME_RANGE_OPTIONS.find((o) => o.value === timeRange)?.label ?? "";

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="relative min-h-screen bg-slate-50 p-4 lg:p-8">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-32 -top-24 h-72 w-72 rounded-full bg-reply-blue/10 blur-[90px]" />
          <div className="absolute -right-32 bottom-10 h-80 w-80 rounded-full bg-reply-purple/10 blur-[100px]" />
        </div>
        <div className="relative mx-auto max-w-7xl space-y-6">
          <div className="rounded-[2rem] border border-slate-200/80 bg-white/85 p-6 shadow-sm ring-1 ring-slate-900/5 backdrop-blur">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-3 w-44" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-36 rounded-[1.5rem]" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-80 rounded-[1.75rem]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen bg-slate-50 p-4 lg:p-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_top,rgba(88,125,254,0.14),transparent_60%)]" />
        <div className="absolute -left-32 -top-24 h-72 w-72 rounded-full bg-reply-blue/10 blur-[90px]" />
        <div className="absolute right-[-8rem] top-1/3 h-80 w-80 rounded-full bg-reply-purple/10 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-7xl space-y-6">
        {/* ── Header card ───────────────────────────────────────────────────── */}
        <section className="rounded-[2rem] border border-slate-200/80 bg-white/90 p-5 shadow-sm ring-1 ring-slate-900/5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-reply-blue to-reply-purple shadow-[0_16px_24px_-18px_rgba(88,125,254,0.9)]">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reports</h1>
                <p className="text-sm text-slate-500">Review analytics and performance trends</p>
              </div>
            </div>

            {/* Filters — use shadcn Select (portal-based, no overflow issues) */}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                <SelectTrigger className="h-9 min-w-[160px] rounded-xl border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm">
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.location_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
                <SelectTrigger className="h-9 min-w-[130px] rounded-xl border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-slate-600 hover:bg-slate-100">
              {filteredReviews.length} reviews in scope
            </Badge>
            <span>Location: {selectedLocationName}</span>
            <span>Time: {selectedTimeLabel}</span>
          </div>
        </section>

        {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-[1.5rem] border-slate-200/80 bg-white/90 shadow-sm ring-1 ring-slate-900/5">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Total Reviews
                  </p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">{kpis.total}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <MessageSquareText className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.5rem] border-slate-200/80 bg-white/90 shadow-sm ring-1 ring-slate-900/5">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Avg Rating
                  </p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">
                    {kpis.avgRating > 0 ? kpis.avgRating.toFixed(1) : "-"}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <Star className="h-5 w-5" />
                </div>
              </div>
              {kpis.avgRating > 0 && (
                <div className="mt-2 flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={cn(
                        "h-3.5 w-3.5",
                        s <= Math.round(kpis.avgRating)
                          ? "fill-amber-400 text-amber-400"
                          : "text-slate-300"
                      )}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[1.5rem] border-slate-200/80 bg-white/90 shadow-sm ring-1 ring-slate-900/5">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Response Rate
                  </p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">
                    {kpis.responseRate > 0 ? `${Math.round(kpis.responseRate)}%` : "-"}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>
              {kpis.responseRate > 0 && (
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-reply-blue to-reply-purple"
                    style={{ width: `${Math.min(kpis.responseRate, 100)}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[1.5rem] border-slate-200/80 bg-white/90 shadow-sm ring-1 ring-slate-900/5">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Positive Sentiment
                  </p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">
                    {kpis.positivePct > 0 ? `${Math.round(kpis.positivePct)}%` : "-"}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <ThumbsUp className="h-5 w-5" />
                </div>
              </div>
              {kpis.positivePct > 0 && (
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-green-400"
                    style={{ width: `${Math.min(kpis.positivePct, 100)}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ── Empty state ───────────────────────────────────────────────────── */}
        {filteredReviews.length === 0 && (
          <Card className="rounded-[1.75rem] border-slate-200/80 bg-white/90 shadow-sm ring-1 ring-slate-900/5">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <BarChart3 className="h-7 w-7" />
              </div>
              <p className="font-semibold text-slate-900">No report data for this selection</p>
              <p className="mt-1 text-sm text-slate-500">
                Change filters or{" "}
                <Link
                  href="/protected/inbox"
                  className="font-medium text-indigo-600 hover:underline"
                >
                  sync reviews
                </Link>{" "}
                first.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Charts grid ───────────────────────────────────────────────────── */}
        {filteredReviews.length > 0 && (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ReviewsOverTimeChart data={reviewsOverTimeData} lines={reviewsOverTimeLines} />
            <RatingDistributionChart data={ratingDist} />
            <SentimentBreakdownChart data={sentimentData} total={filteredReviews.length} />
            <ResponseRateChart data={responseRateTrend} />
            <CumulativeGrowthChart data={cumulativeData} lines={cumulativeLines} />
          </section>
        )}
      </div>
    </div>
  );
}
