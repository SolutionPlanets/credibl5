"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getReviewsByLocations, storeReviews, replaceReviewsForLocation, updateReviewReply, updateReviewRepliesBatch } from "@/lib/review-store";
import type { StoredReview } from "@/lib/review-store";
import { cn } from "@/lib/shared/utils";
import { useCredits } from "@/lib/credits-context";
import { showInsufficientCredits, showCreditDeducted } from "@/lib/credit-alerts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronDown,
  FileText,
  Loader2,
  MapPin,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Star,
} from "lucide-react";

type ReviewStatusFilter = "all" | "pending" | "replied";
type KpiPageFilter = "all" | "priority" | "positive" | "neutral" | "negative" | "unanswered";

interface LocationRow {
  id: string;
  location_name: string;
  is_active: boolean | null;
  is_verified?: boolean;
}

type ReviewRow = StoredReview;

interface SavedTemplateRow {
  id: string;
  title: string;
  content: string;
  review_type: string;
  location_id: string;
}

const statusFilterOptions: Array<{ value: ReviewStatusFilter; label: string }> = [
  { value: "all", label: "All Reviews" },
  { value: "pending", label: "Pending Reply" },
  { value: "replied", label: "Replied" },
];

const kpiPageFilterOptions: Array<{ value: KpiPageFilter; label: string }> = [
  { value: "all", label: "All KPI Pages" },
  { value: "priority", label: "Priority (Low Rating)" },
  { value: "negative", label: "Negative Alerts" },
  { value: "neutral", label: "Neutral Watchlist" },
  { value: "positive", label: "Positive Momentum" },
  { value: "unanswered", label: "Unanswered Reviews" },
];

function formatReviewDate(value: string | null): string {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getBackendBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_GMB_BACKEND_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : "";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Something went wrong. Please try again.";
}

export default function InboxPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<ReviewStatusFilter>("all");
  const [kpiPageFilter, setKpiPageFilter] = useState<KpiPageFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplateRow[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);

  // Bulk reply state
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [bulkOperation, setBulkOperation] = useState<"idle" | "generating" | "publishing">("idle");
  const [bulkAIDrafts, setBulkAIDrafts] = useState<Map<string, string>>(new Map());
  const [showNoTemplateAlert, setShowNoTemplateAlert] = useState(false);
  const [isGeneratingAIReply, setIsGeneratingAIReply] = useState(false);
  const [showNoBrandVoiceAlert, setShowNoBrandVoiceAlert] = useState(false);
  const { credits, refreshCredits } = useCredits();

  const fetchReviewsForLocations = useCallback(
    async (locationIds: string[]): Promise<ReviewRow[]> => {
      if (!userId || locationIds.length === 0) return [];
      return getReviewsByLocations(userId, locationIds);
    },
    [userId]
  );

  const refreshReviews = useCallback(async () => {
    if (!userId) return;

    const locationIds = locations.map((loc) => loc.id);
    setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const freshReviews = await fetchReviewsForLocations(locationIds);
      setReviews(freshReviews);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchReviewsForLocations, locations, userId]);

  const initializeInbox = useCallback(async () => {
    setIsBootstrapping(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/auth/login");
        return;
      }

      setUserId(user.id);

      const { data: locationData, error: locationError } = await supabase
        .from("locations")
        .select("id,location_name,is_active")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (locationError) {
        throw new Error(locationError.message || "Failed to fetch locations.");
      }

      const nextLocations = (locationData ?? []) as LocationRow[];
      setLocations(nextLocations);

      const freshReviews = await fetchReviewsForLocations(nextLocations.map((loc) => loc.id));
      setReviews(freshReviews);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsBootstrapping(false);
    }
  }, [fetchReviewsForLocations, router]);

  useEffect(() => {
    void initializeInbox();
  }, [initializeInbox]);

  const locationNameById = useMemo(() => {
    return new Map(locations.map((loc) => [loc.id, loc.location_name]));
  }, [locations]);

  const filteredReviews = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();

    return reviews.filter((review) => {
      if (selectedLocationId !== "all" && review.location_id !== selectedLocationId) {
        return false;
      }

      const hasReply = Boolean(review.review_reply?.trim());
      if (statusFilter === "pending" && hasReply) return false;
      if (statusFilter === "replied" && !hasReply) return false;

      const normalizedSentiment = (review.sentiment ?? "").toLowerCase();
      const hasLowRating = typeof review.star_rating === "number" && review.star_rating <= 3;
      const isPriority = !hasReply && (normalizedSentiment === "negative" || hasLowRating);

      if (kpiPageFilter === "priority" && !isPriority) return false;
      if (kpiPageFilter === "negative" && normalizedSentiment !== "negative") return false;
      if (kpiPageFilter === "neutral" && normalizedSentiment !== "neutral") return false;
      if (kpiPageFilter === "positive" && normalizedSentiment !== "positive") return false;
      if (kpiPageFilter === "unanswered" && hasReply) return false;

      if (search) {
        const haystack = [
          review.reviewer_name ?? "",
          review.review_text ?? "",
          locationNameById.get(review.location_id) ?? "",
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(search)) return false;
      }

      return true;
    });
  }, [kpiPageFilter, locationNameById, reviews, searchQuery, selectedLocationId, statusFilter]);

  useEffect(() => {
    if (filteredReviews.length === 0) {
      setSelectedReviewId(null);
      return;
    }

    if (!selectedReviewId || !filteredReviews.some((review) => review.gmb_review_id === selectedReviewId)) {
      setSelectedReviewId(filteredReviews[0].gmb_review_id);
    }
  }, [filteredReviews, selectedReviewId]);

  const selectedReview = useMemo(() => {
    if (!selectedReviewId) return null;
    return filteredReviews.find((review) => review.gmb_review_id === selectedReviewId) ?? null;
  }, [filteredReviews, selectedReviewId]);

  useEffect(() => {
    setReplyDraft(selectedReview?.review_reply ?? "");
    setShowTemplateDropdown(false);
  }, [selectedReview?.gmb_review_id, selectedReview?.review_reply]);

  useEffect(() => {
    if (!showTemplateDropdown) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-template-dropdown]")) {
        setShowTemplateDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTemplateDropdown]);

  const pendingCount = useMemo(() => {
    return reviews.filter((review) => !review.review_reply?.trim()).length;
  }, [reviews]);

  // Pending reviews scoped to the current location filter
  const pendingReviewsInView = useMemo(
    () => filteredReviews.filter((r) => !r.review_reply?.trim()),
    [filteredReviews]
  );

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
      const selectedLocations =
        selectedLocationId === "all"
          ? locations.filter((location) => location.is_active === true)
          : locations.filter((location) => location.id === selectedLocationId);

      const targetLocations =
        selectedLocationId === "all" && selectedLocations.length === 0 ? locations : selectedLocations;

      if (targetLocations.length === 0) {
        throw new Error("No location is selected for sync.");
      }

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
          if (typeof detail === "string") {
            throw new Error(detail);
          }
          if (typeof detail === "object" && detail !== null && "message" in detail) {
            const message = (detail as { message?: unknown }).message;
            if (typeof message === "string") throw new Error(message);
          }
          throw new Error("Failed to sync reviews.");
        }

        const payload = (await response.json()) as { reviews?: unknown[]; count?: number; message?: string };
        const incoming = (payload.reviews ?? []) as Parameters<typeof storeReviews>[1];
        if (userId) {
          // Replace all reviews for this location — removes deleted reviews from Google
          await replaceReviewsForLocation(userId, location.id, incoming);
        }

        const count = Number(payload.count ?? 0);
        totalSyncedCount += count;

        // If this specific location had 0 reviews and returned a specific message, surface it
        if (count === 0 && payload.message && targetLocations.length === 1) {
          setErrorMessage(payload.message);
        }
      }

      await refreshReviews();
      if (!errorMessage) {
        setSuccessMessage(
          `Sync complete for ${targetLocations.length} location(s). ${totalSyncedCount} new review(s) imported.`
        );
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSyncing(false);
    }
  }, [getAccessToken, locations, refreshReviews, selectedLocationId]);

  const handleReplySubmit = useCallback(async () => {
    if (!selectedReview) {
      setErrorMessage("Select a review first.");
      return;
    }

    const reply = replyDraft.trim();
    if (!reply) {
      setErrorMessage("Reply cannot be empty.");
      return;
    }

    const backendBaseUrl = getBackendBaseUrl();
    if (!backendBaseUrl) {
      setErrorMessage("GMB backend URL is not configured.");
      return;
    }

    setIsReplying(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(`${backendBaseUrl}/gmb/reviews/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          locationId: selectedReview.location_id,
          gmbReviewId: selectedReview.gmb_review_id,
          reply,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const detail = payload?.detail;
        if (typeof detail === "string") {
          throw new Error(detail);
        }
        if (typeof detail === "object" && detail !== null && "message" in detail) {
          const message = (detail as { message?: unknown }).message;
          if (typeof message === "string") throw new Error(message);
        }
        throw new Error("Failed to publish review reply.");
      }

      // Update the reply locally in IndexedDB — no server round-trip needed
      if (userId) {
        await updateReviewReply(userId, selectedReview.gmb_review_id, reply);
      }
      await refreshReviews();
      setSuccessMessage("Reply posted successfully.");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsReplying(false);
    }
  }, [getAccessToken, refreshReviews, replyDraft, selectedReview, userId]);

  const handleOpenTemplates = useCallback(async () => {
    if (!selectedReview || !userId) return;
    setShowTemplateDropdown((prev) => !prev);
    if (showTemplateDropdown) return;
    setIsLoadingTemplates(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("saved_templates")
        .select("id,title,content,review_type,location_id")
        .eq("user_id", userId)
        .eq("location_id", selectedReview.location_id)
        .order("created_at", { ascending: false });
      setSavedTemplates((data ?? []) as SavedTemplateRow[]);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [selectedReview, showTemplateDropdown, userId]);

  const handleSelectTemplate = useCallback((template: SavedTemplateRow) => {
    setReplyDraft(template.content);
    setShowTemplateDropdown(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Bulk reply handlers
  // ---------------------------------------------------------------------------

  const handleBulkReplyClick = useCallback(() => {
    if (pendingReviewsInView.length === 0) {
      setErrorMessage("No pending reviews to reply to.");
      return;
    }
    if (selectedLocationId === "all") {
      setErrorMessage("Please select a specific location before using Bulk Reply.");
      return;
    }
    setShowBulkDialog(true);
  }, [pendingReviewsInView.length, selectedLocationId]);

  const handleBulkTemplateReply = useCallback(async () => {
    if (!userId) return;
    setShowBulkDialog(false);
    setBulkOperation("publishing");
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // Fetch templates for the selected location
      const supabase = createClient();
      const { data: templateData } = await supabase
        .from("saved_templates")
        .select("id,title,content,review_type,location_id")
        .eq("user_id", userId)
        .eq("location_id", selectedLocationId)
        .order("created_at", { ascending: false });

      const templates = (templateData ?? []) as SavedTemplateRow[];

      if (templates.length === 0) {
        setBulkOperation("idle");
        setShowNoTemplateAlert(true);
        return;
      }

      // Group templates by sentiment type
      const templateByType: Record<string, SavedTemplateRow> = {};
      for (const t of templates) {
        const type = (t.review_type ?? "").toLowerCase();
        if (!templateByType[type]) {
          templateByType[type] = t;
        }
      }

      const businessName = locationNameById.get(selectedLocationId) ?? "Our Business";
      const accessToken = await getAccessToken();
      const backendBaseUrl = getBackendBaseUrl();

      // Match each pending review to a template by sentiment
      const items: Array<{ gmbReviewId: string; locationId: string; reply: string }> = [];
      const skipped: string[] = [];

      for (const review of pendingReviewsInView) {
        const sentiment = (review.sentiment ?? "neutral").toLowerCase();
        const template = templateByType[sentiment] ?? templateByType["neutral"] ?? templates[0];

        if (!template) {
          skipped.push(review.reviewer_name || "Anonymous");
          continue;
        }

        let reply = template.content;
        reply = reply.replace(/\{\{reviewer_name\}\}/g, review.reviewer_name?.split(" ")[0] || "Customer");
        reply = reply.replace(/\{\{business_name\}\}/g, businessName);

        items.push({
          gmbReviewId: review.gmb_review_id,
          locationId: review.location_id,
          reply,
        });
      }

      if (items.length === 0) {
        setErrorMessage("No reviews could be matched to templates.");
        return;
      }

      const response = await fetch(`${backendBaseUrl}/gmb/reviews/bulk-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ items, source: "bulk_template_reply" }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload?.detail === "string" ? payload.detail : "Bulk reply failed.");
      }

      const result = await response.json();

      const successItems = (result.results as Array<{ gmbReviewId: string; success: boolean; reply?: string }>)
        .filter((r) => r.success && r.reply)
        .map((r) => ({ gmbReviewId: r.gmbReviewId, reply: r.reply! }));

      if (successItems.length > 0) {
        await updateReviewRepliesBatch(userId, successItems);
      }

      await refreshReviews();
      let msg = `Bulk template reply complete: ${result.succeeded} sent, ${result.failed} failed.`;
      if (skipped.length > 0) {
        msg += ` ${skipped.length} skipped (no matching template).`;
      }
      setSuccessMessage(msg);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBulkOperation("idle");
    }
  }, [getAccessToken, locationNameById, pendingReviewsInView, refreshReviews, selectedLocationId, userId]);

  const handleBulkAIReply = useCallback(async () => {
    if (!userId) return;
    setShowBulkDialog(false);
    setBulkOperation("generating");
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const accessToken = await getAccessToken();
      const backendBaseUrl = getBackendBaseUrl();

      const items = pendingReviewsInView.map((review) => ({
        gmbReviewId: review.gmb_review_id,
        locationId: review.location_id,
        reviewerName: review.reviewer_name || "Customer",
        starRating: review.star_rating ?? 0,
        reviewText: review.review_text || "",
      }));

      const response = await fetch(`${backendBaseUrl}/gmb/reviews/bulk-ai-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ items }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const detail = payload?.detail;
        if (typeof detail === "object" && detail?.code === "INSUFFICIENT_CREDITS") {
          showInsufficientCredits();
          throw new Error(detail.message);
        }
        throw new Error(typeof detail === "string" ? detail : detail?.message || "AI generation failed.");
      }

      const result = await response.json();
      const drafts = new Map<string, string>();
      let escalatedCount = 0;
      for (const item of result.results as Array<{ gmbReviewId: string; success: boolean; escalated?: boolean; generatedReply?: string }>) {
        if (item.success && item.generatedReply) {
          drafts.set(item.gmbReviewId, item.generatedReply);
        }
        if (item.escalated) {
          escalatedCount++;
        }
      }
      setBulkAIDrafts(drafts);
      await refreshCredits();

      const messages: string[] = [];
      if (result.failed > 0) {
        messages.push(`${result.failed} of ${result.total} AI generations failed.`);
      }
      if (escalatedCount > 0) {
        messages.push(`${escalatedCount} review(s) flagged for human review due to sensitive content.`);
      }
      if (messages.length > 0) {
        setErrorMessage(messages.join(" "));
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBulkOperation("idle");
    }
  }, [getAccessToken, pendingReviewsInView, refreshCredits, userId]);

  const handleSingleAIReply = useCallback(async () => {
    if (!selectedReview || !userId) return;

    if (credits && credits.remaining < 1) {
      showInsufficientCredits();
      return;
    }

    setIsGeneratingAIReply(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const accessToken = await getAccessToken();
      const backendBaseUrl = getBackendBaseUrl();

      const response = await fetch(`${backendBaseUrl}/gmb/reviews/generate-reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          gmbReviewId: selectedReview.gmb_review_id,
          locationId: selectedReview.location_id,
          reviewerName: selectedReview.reviewer_name || "Customer",
          starRating: selectedReview.star_rating ?? 0,
          reviewText: selectedReview.review_text || "",
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const detail = payload?.detail;

        if (typeof detail === "object" && detail?.code === "INSUFFICIENT_CREDITS") {
          showInsufficientCredits();
          throw new Error(detail.message);
        }
        if (typeof detail === "object" && detail?.code === "NO_BRAND_VOICE") {
          setShowNoBrandVoiceAlert(true);
          return;
        }

        throw new Error(
          typeof detail === "string" ? detail : detail?.message || "AI reply generation failed."
        );
      }

      const result = await response.json();

      // Handle escalation — review flagged for human attention
      if (result.escalated) {
        setErrorMessage(
          "This review has been flagged for human review due to sensitive content. " +
          "Please write a manual reply. Reason: " + (result.reason || "High-risk content detected.")
        );
        return;
      }

      if (result.success && result.generatedReply) {
        setReplyDraft(result.generatedReply);
      }
      await refreshCredits();
      if (result.creditsUsed) {
        showCreditDeducted(credits.remaining - result.creditsUsed);
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsGeneratingAIReply(false);
    }
  }, [credits, getAccessToken, refreshCredits, selectedReview, userId]);

  const handleBulkAIPublish = useCallback(async () => {
    if (!userId || bulkAIDrafts.size === 0) return;

    setBulkOperation("publishing");
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const accessToken = await getAccessToken();
      const backendBaseUrl = getBackendBaseUrl();

      const items = [...bulkAIDrafts.entries()].map(([gmbReviewId, reply]) => {
        const review = filteredReviews.find((r) => r.gmb_review_id === gmbReviewId);
        return {
          gmbReviewId,
          locationId: review?.location_id ?? "",
          reply,
        };
      });

      const response = await fetch(`${backendBaseUrl}/gmb/reviews/bulk-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ items, source: "bulk_ai_reply" }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload?.detail === "string" ? payload.detail : "Bulk publish failed.");
      }

      const result = await response.json();

      const successItems = (result.results as Array<{ gmbReviewId: string; success: boolean; reply?: string }>)
        .filter((r) => r.success && r.reply)
        .map((r) => ({ gmbReviewId: r.gmbReviewId, reply: r.reply! }));

      if (successItems.length > 0) {
        await updateReviewRepliesBatch(userId, successItems);
      }

      await refreshReviews();
      setSuccessMessage(`Published ${result.succeeded} AI replies. ${result.failed} failed.`);
      setBulkAIDrafts(new Map());
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBulkOperation("idle");
    }
  }, [bulkAIDrafts, filteredReviews, getAccessToken, refreshReviews, userId]);

  const updateAIDraft = useCallback((reviewId: string, text: string) => {
    setBulkAIDrafts((prev) => {
      const next = new Map(prev);
      next.set(reviewId, text);
      return next;
    });
  }, []);

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

  const sentimentClassName = (sentiment: string | null) => {
    if (!sentiment) return "bg-slate-100 text-slate-700";
    const normalized = sentiment.toLowerCase();
    if (normalized === "positive") return "bg-emerald-100 text-emerald-700";
    if (normalized === "negative") return "bg-rose-100 text-rose-700";
    return "bg-amber-100 text-amber-700";
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Badge className="border-none bg-sky-100 text-sky-700 hover:bg-sky-100">Review Inbox</Badge>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Customer Review Queue</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
              Fetch, review, and publish replies from one workspace.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Pending</p>
              <p className="text-xl font-bold text-amber-900">{pendingCount}</p>
            </div>
            <Button
              onClick={() => void handleSyncReviews()}
              disabled={isSyncing || isBootstrapping}
              className="h-11 rounded-xl bg-slate-900 px-5 font-semibold text-white hover:bg-slate-800"
            >
              {isSyncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync Reviews
            </Button>
          </div>
        </div>
      </section>

      <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
          <div className="relative lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search reviewer, location, text..."
              className="h-11 rounded-xl border-slate-200 pl-10"
            />
          </div>

          <select
            value={selectedLocationId}
            onChange={(event) => setSelectedLocationId(event.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-slate-400"
          >
            <option value="all">All Locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.location_name}
              </option>
            ))}
          </select>

          <select
            value={kpiPageFilter}
            onChange={(event) => setKpiPageFilter(event.target.value as KpiPageFilter)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-slate-400"
          >
            {kpiPageFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ReviewStatusFilter)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-slate-400"
          >
            {statusFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {selectedLocationId !== "all" && locations.find(l => l.id === selectedLocationId)?.is_verified === false && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          <span>
            <strong>Location Not Verified:</strong> Google only allows fetching reviews via API for verified locations.
            Please ensure this business is verified in your Google Business Profile dashboard.
          </span>
        </div>
      )}

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

      {/* Bulk operation progress banner */}
      {bulkOperation !== "idle" && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            {bulkOperation === "generating"
              ? "Generating AI replies for pending reviews... This may take a moment."
              : "Publishing bulk replies to Google... Please wait."}
          </span>
        </div>
      )}

      {isBootstrapping ? (
        <div className="flex h-48 items-center justify-center rounded-3xl border border-slate-200 bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : locations.length === 0 ? (
        <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <CardContent className="p-10 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <MapPin className="h-6 w-6" />
            </div>
            <p className="mt-4 text-lg font-semibold text-slate-900">No locations connected yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              Add your first location from the dashboard, then return here to sync and reply to reviews.
            </p>
            <Button
              onClick={() => router.push("/protected")}
              className="mt-6 rounded-xl bg-slate-900 px-5 font-semibold text-white hover:bg-slate-800"
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.3fr]">
          <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-100 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold text-slate-900">Reviews</CardTitle>
                  <CardDescription>{filteredReviews.length} item(s) in view</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {isRefreshing && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
                  <Button
                    type="button"
                    onClick={handleBulkReplyClick}
                    disabled={isBootstrapping || bulkOperation !== "idle"}
                    size="sm"
                    className="h-8 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-700"
                  >
                    {bulkOperation !== "idle" ? (
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 h-3 w-3" />
                    )}
                    Bulk Reply
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="max-h-[70vh] space-y-2 overflow-y-auto p-3">
              {filteredReviews.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                  <MessageSquareText className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">No reviews found</p>
                  <p className="mt-1 text-xs text-slate-500">Try changing filters or run sync again.</p>
                </div>
              ) : (
                filteredReviews.map((review) => {
                  const isSelected = selectedReviewId === review.gmb_review_id;
                  const reviewerName = review.reviewer_name?.trim() || "Anonymous";
                  const hasReply = Boolean(review.review_reply?.trim());

                  return (
                    <button
                      key={review.gmb_review_id}
                      type="button"
                      onClick={() => setSelectedReviewId(review.gmb_review_id)}
                      className={cn(
                        "w-full rounded-2xl border p-3 text-left transition-all",
                        isSelected
                          ? "border-sky-300 bg-sky-50 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
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
                              {review.sentiment ?? "unknown"}
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

                      <p className="mt-3 max-h-10 overflow-hidden text-xs text-slate-600">
                        {review.review_text?.trim() || "No review text provided."}
                      </p>

                      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                        <span className="truncate">{locationNameById.get(review.location_id) ?? "Unknown location"}</span>
                        <span>{formatReviewDate(review.review_date)}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            {bulkAIDrafts.size > 0 ? (
              <>
                {/* Bulk AI Preview Panel */}
                <CardHeader className="border-b border-slate-100 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-bold text-slate-900">AI Reply Preview</CardTitle>
                      <CardDescription>
                        Review and edit {bulkAIDrafts.size} generated replies before publishing.
                      </CardDescription>
                    </div>
                    <Badge className="border-none bg-sky-100 text-sky-700">
                      {bulkAIDrafts.size} drafts
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="max-h-[60vh] space-y-4 overflow-y-auto p-5">
                  {[...bulkAIDrafts.entries()].map(([reviewId, draft]) => {
                    const review = filteredReviews.find((r) => r.gmb_review_id === reviewId);
                    if (!review) return null;
                    return (
                      <div key={reviewId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">
                              {review.reviewer_name?.trim() || "Anonymous"}
                            </p>
                            {renderStars(review.star_rating)}
                          </div>
                          <Badge className={cn("border-none px-2 py-0.5 text-[10px] font-semibold uppercase", sentimentClassName(review.sentiment))}>
                            {review.sentiment ?? "unknown"}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-2">
                          {review.review_text?.trim() || "No review text."}
                        </p>
                        <textarea
                          value={draft}
                          onChange={(e) => updateAIDraft(reviewId, e.target.value)}
                          rows={4}
                          maxLength={4096}
                          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-400"
                        />
                        <div className="text-right text-[11px] text-slate-400">
                          {draft.length}/4096
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
                <div className="border-t border-slate-200 bg-slate-50 p-4 flex items-center justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setBulkAIDrafts(new Map())}
                    className="h-9 rounded-xl border-slate-200 px-4 text-sm font-medium"
                  >
                    Discard
                  </Button>
                  <Button
                    onClick={() => void handleBulkAIPublish()}
                    disabled={bulkOperation === "publishing"}
                    className="h-9 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    {bulkOperation === "publishing" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Publish All Replies
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* Normal Review Detail Panel */}
                <CardHeader className="border-b border-slate-100 p-5">
                  <CardTitle className="text-lg font-bold text-slate-900">Review Details</CardTitle>
                  <CardDescription>Read context and publish your response from here.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 p-5">
                  {!selectedReview ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                      <MessageSquareText className="mx-auto h-6 w-6 text-slate-400" />
                      <p className="mt-3 text-sm font-semibold text-slate-700">Select a review to view details</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-bold text-slate-900">
                            {selectedReview.reviewer_name?.trim() || "Anonymous"}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            {renderStars(selectedReview.star_rating)}
                            <span className="text-xs text-slate-500">{formatReviewDate(selectedReview.review_date)}</span>
                          </div>
                        </div>
                        <Badge className="border-none bg-slate-100 text-slate-700 hover:bg-slate-100">
                          {locationNameById.get(selectedReview.location_id) ?? "Unknown location"}
                        </Badge>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Customer review</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {selectedReview.review_text?.trim() || "No review text provided."}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor="reply-text" className="text-sm font-semibold text-slate-800">
                            Your reply
                          </label>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void handleSingleAIReply()}
                              disabled={isGeneratingAIReply}
                              className="h-8 rounded-lg border-slate-200 px-3 text-xs font-medium text-slate-700 hover:border-sky-300 hover:bg-sky-50"
                            >
                              {isGeneratingAIReply ? (
                                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                              ) : (
                                <Sparkles className="mr-1.5 h-3 w-3" />
                              )}
                              Reply with AI
                            </Button>
                          <div className="relative" data-template-dropdown>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void handleOpenTemplates()}
                              className="h-8 rounded-lg border-slate-200 px-3 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                            >
                              {isLoadingTemplates ? (
                                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                              ) : (
                                <FileText className="mr-1.5 h-3 w-3" />
                              )}
                              Use Template
                              <ChevronDown className="ml-1 h-3 w-3" />
                            </Button>
                            {showTemplateDropdown && (
                              <div className="absolute right-0 top-9 z-50 w-72 rounded-2xl border border-slate-200 bg-white shadow-lg">
                                <div className="border-b border-slate-100 px-3 py-2">
                                  <p className="text-xs font-semibold text-slate-500">Templates for this location</p>
                                </div>
                                <div className="max-h-60 overflow-y-auto p-1.5">
                                  {savedTemplates.length === 0 ? (
                                    <p className="px-3 py-4 text-center text-xs text-slate-500">
                                      No saved templates for this location.
                                    </p>
                                  ) : (
                                    (() => {
                                      const sentiment = (selectedReview?.sentiment ?? "").toLowerCase() as "positive" | "negative" | "neutral" | "";
                                      const matched = savedTemplates.filter((t) => t.review_type === sentiment);
                                      const others = savedTemplates.filter((t) => t.review_type !== sentiment);
                                      const ordered = [...matched, ...others];
                                      return ordered.map((template) => {
                                        const typeColor =
                                          template.review_type === "positive"
                                            ? "bg-emerald-100 text-emerald-700"
                                            : template.review_type === "negative"
                                            ? "bg-rose-100 text-rose-700"
                                            : "bg-amber-100 text-amber-700";
                                        return (
                                          <button
                                            key={template.id}
                                            type="button"
                                            onClick={() => handleSelectTemplate(template)}
                                            className="w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="truncate text-xs font-semibold text-slate-800">
                                                {template.title}
                                              </span>
                                              <span
                                                className={cn(
                                                  "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold capitalize",
                                                  typeColor
                                                )}
                                              >
                                                {template.review_type}
                                              </span>
                                            </div>
                                            <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-500">
                                              {template.content}
                                            </p>
                                          </button>
                                        );
                                      });
                                    })()
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                          </div>
                        </div>
                        <textarea
                          id="reply-text"
                          value={replyDraft}
                          onChange={(event) => setReplyDraft(event.target.value)}
                          rows={6}
                          maxLength={4096}
                          placeholder="Write your public reply..."
                          className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-slate-400"
                        />
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Replies are published publicly on your Google Business Profile.</span>
                          <span>{replyDraft.length}/4096</span>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          onClick={() => void handleReplySubmit()}
                          disabled={isReplying || replyDraft.trim().length === 0}
                          className="h-11 rounded-xl bg-emerald-600 px-5 font-semibold text-white hover:bg-emerald-700"
                        >
                          {isReplying ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="mr-2 h-4 w-4" />
                          )}
                          {selectedReview.review_reply?.trim() ? "Update Reply" : "Send Reply"}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </>
            )}
          </Card>
        </div>
      )}

      {/* Bulk Reply Method Dialog */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Reply</DialogTitle>
            <DialogDescription>
              Reply to <strong>{pendingReviewsInView.length}</strong> pending review(s) for{" "}
              <strong>{locationNameById.get(selectedLocationId) ?? "this location"}</strong>
              {kpiPageFilter !== "all" && (
                <> filtered by <strong>{kpiPageFilterOptions.find((o) => o.value === kpiPageFilter)?.label}</strong></>
              )}
              {searchQuery.trim() && (
                <> matching &quot;<strong>{searchQuery.trim()}</strong>&quot;</>
              )}
              . Choose how you want to generate replies.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <button
              type="button"
              onClick={() => void handleBulkAIReply()}
              className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-sky-300 hover:bg-sky-50"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Reply with AI</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Generate personalized replies using your brand voice.
                  Uses <strong>{pendingReviewsInView.length}</strong> AI credit{pendingReviewsInView.length !== 1 ? "s" : ""}.
                  You have <strong>{credits.remaining}</strong> remaining.
                </p>
                {credits.remaining < pendingReviewsInView.length && (
                  <p className="mt-1 text-xs font-medium text-rose-600">
                    Insufficient credits. You need {pendingReviewsInView.length - credits.remaining} more.
                  </p>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => void handleBulkTemplateReply()}
              className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-emerald-300 hover:bg-emerald-50"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Reply with Template</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Automatically match saved templates by sentiment (positive, negative, neutral) and reply to each review.
                </p>
              </div>
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDialog(false)} className="rounded-xl">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* No Template Alert Dialog */}
      <Dialog open={showNoTemplateAlert} onOpenChange={setShowNoTemplateAlert}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>No Templates Found</DialogTitle>
            <DialogDescription>
              The selected location <strong>{locationNameById.get(selectedLocationId) ?? ""}</strong> does
              not have any saved templates. Please create templates for this location first, then try bulk reply again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoTemplateAlert(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              onClick={() => router.push("/protected/templates")}
              className="rounded-xl bg-sky-600 text-white hover:bg-sky-700"
            >
              <FileText className="mr-2 h-4 w-4" />
              Go to Templates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* No Brand Voice Alert Dialog */}
      <Dialog open={showNoBrandVoiceAlert} onOpenChange={setShowNoBrandVoiceAlert}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>No Brand Voice Found</DialogTitle>
            <DialogDescription>
              The location{" "}
              <strong>
                {locationNameById.get(selectedReview?.location_id ?? "") ?? "this location"}
              </strong>{" "}
              does not have a brand voice configured. Please create a brand voice for this
              location first, then try again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNoBrandVoiceAlert(false)}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={() => router.push("/protected/templates")}
              className="rounded-xl bg-sky-600 text-white hover:bg-sky-700"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Create Brand Voice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
