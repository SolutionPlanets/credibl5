"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { startGoogleConnectFlow } from "@/lib/gmb/google-connect";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Menu, Search, Bell, HelpCircle, MapPin, CheckCircle2,
  Sparkles, Star, Settings, LogOut, ChevronDown, X,
  MessageSquare, Zap, TrendingUp, BookOpen, AlertTriangle,
} from "lucide-react";
import { DashboardSidebar } from "@/components/protected/dashboard-sidebar";
import { PendingReviewsProvider } from "@/lib/pending-reviews-context";
import { CreditProvider } from "@/lib/credits-context";
import { checkAndAlertCredits } from "@/lib/credit-alerts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LocationItem {
  id: string;
  location_name: string;
  is_active: boolean;
}

interface ReviewNotification {
  id: string;
  reviewer_name: string;
  review_text: string;
  star_rating: number;
  review_date: string;
  is_read: boolean;
  location_id: string;
}

interface SearchResult {
  type: "review" | "location";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  rating?: number;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Core state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // AI Credits (real-time via Supabase realtime)
  const [totalCredits, setTotalCredits] = useState<number | null>(null);
  const [remainingCredits, setRemainingCredits] = useState<number | null>(null);
  const [creditBannerDismissed, setCreditBannerDismissed] = useState(false);

  // Location picker
  const [isLocationsOpen, setIsLocationsOpen] = useState(false);
  const locationsRef = useRef<HTMLDivElement>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Notifications
  const [notifications, setNotifications] = useState<ReviewNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Help
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);

  // Profile dropdown
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Close all dropdowns on outside click
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (locationsRef.current && !locationsRef.current.contains(e.target as Node))
        setIsLocationsOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setIsSearchOpen(false);
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node))
        setIsNotificationsOpen(false);
      if (helpRef.current && !helpRef.current.contains(e.target as Node))
        setIsHelpOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setIsProfileOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ---------------------------------------------------------------------------
  // Initial data + realtime subscription
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const supabase = createClient();
    let creditsChannel: ReturnType<typeof supabase.channel> | null = null;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setUser(user);

      const [profileRes, locationsRes, subscriptionRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("google_connected_at")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("locations")
          .select("id,location_name,is_active")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("subscription_plans")
          .select("total_ai_credits,ai_credits_used,remaining_ai_credits")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      // Primary checks: DB field + user metadata + URL param after OAuth redirect
      let googleConnected =
        Boolean(profileRes.data?.google_connected_at) ||
        user.user_metadata?.google_connected === true ||
        searchParams.get("google") === "connected";

      // Fallback: check the backend /auth/google/status (source of truth for refresh token)
      if (!googleConnected) {
        try {
          const backendUrl = process.env.NEXT_PUBLIC_GMB_BACKEND_URL?.trim()?.replace(/\/+$/, "");
          if (backendUrl) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
              const statusRes = await fetch(`${backendUrl}/auth/google/status`, {
                headers: { Authorization: `Bearer ${session.access_token}` },
              });
              if (statusRes.ok) {
                const statusData = await statusRes.json();
                if (statusData.has_refresh_token) {
                  googleConnected = true;
                }
              }
            }
          }
        } catch (e) {
          console.warn("Could not verify Google status from backend:", e);
        }
      }

      setIsGoogleConnected(googleConnected);
      setLocations(locationsRes.data || []);
      const total = subscriptionRes.data?.total_ai_credits ?? 0;
      const used = subscriptionRes.data?.ai_credits_used ?? 0;
      const remaining = subscriptionRes.data?.remaining_ai_credits;
      setTotalCredits(total);
      const resolvedRemaining =
        typeof remaining === "number" ? Math.max(remaining, 0) : Math.max(total - used, 0);
      setRemainingCredits(resolvedRemaining);
      setLoading(false);

      // Show one-time credit alert if low or exhausted
      checkAndAlertCredits(resolvedRemaining, total);

      // Fetch unread review notifications
      fetchNotifications(supabase);

      // Realtime: watch credit changes from subscription_plans
      creditsChannel = supabase
        .channel("user_credits_" + user.id)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "subscription_plans",
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            const nextTotal = payload.new?.total_ai_credits;
            const nextRemaining = payload.new?.remaining_ai_credits;
            const nextUsed = payload.new?.ai_credits_used;

            if (typeof nextTotal === "number") {
              setTotalCredits(nextTotal);
            }
            if (typeof nextRemaining === "number") {
              setRemainingCredits(Math.max(nextRemaining, 0));
            } else if (typeof nextTotal === "number" && typeof nextUsed === "number") {
              setRemainingCredits(Math.max(nextTotal - nextUsed, 0));
            }
          }
        )
        .subscribe();
    };

    init();

    return () => {
      if (creditsChannel) {
        const supabase = createClient();
        supabase.removeChannel(creditsChannel);
      }
    };
  }, [router, searchParams]);

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------
  const fetchNotifications = async (supabase: any) => {
    const { data } = await supabase
      .from("reviews")
      .select("id, reviewer_name, star_rating, review_text, review_date, is_read, location_id")
      .eq("is_read", false)
      .order("review_date", { ascending: false })
      .limit(10);

    if (data) {
      setNotifications(data);
      setUnreadCount(data.length);
    }
  };

  const handleMarkAllRead = () => {
    // Optimistic clear - backend write requires service_role; navigate to inbox to action
    setUnreadCount(0);
    setNotifications([]);
  };

  // ---------------------------------------------------------------------------
  // Search (debounced, 300 ms)
  // ---------------------------------------------------------------------------
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);

      if (!query.trim()) {
        setSearchResults([]);
        setIsSearchOpen(false);
        return;
      }

      setIsSearchOpen(true);
      setIsSearching(true);

      searchTimeout.current = setTimeout(async () => {
        const supabase = createClient();
        const results: SearchResult[] = [];

        // Location matches (client-side, already loaded)
        locations
          .filter((loc) =>
            loc.location_name.toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, 3)
          .forEach((loc) =>
            results.push({
              type: "location",
              id: loc.id,
              title: loc.location_name,
              subtitle: loc.is_active ? "Active location" : "Inactive",
              href: `/protected?locationId=${loc.id}`,
            })
          );

        // Review matches
        const { data: reviewData } = await supabase
          .from("reviews")
          .select("id, reviewer_name, review_text, star_rating, location_id")
          .or(
            `reviewer_name.ilike.%${query}%,review_text.ilike.%${query}%`
          )
          .limit(5);

        reviewData?.forEach((r: any) => {
          results.push({
            type: "review",
            id: r.id,
            title: r.reviewer_name || "Anonymous",
            subtitle:
              r.review_text?.length > 60
                ? r.review_text.substring(0, 60) + "..."
                : r.review_text || "",
            href: `/protected/inbox?locationId=${r.location_id}`,
            rating: r.star_rating,
          });
        });

        setSearchResults(results);
        setIsSearching(false);
      }, 300);
    },
    [locations]
  );

  // ---------------------------------------------------------------------------
  // Sign out
  // ---------------------------------------------------------------------------
  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  const handleReconnectGoogle = useCallback(async () => {
    setIsReconnecting(true);
    try {
      const supabase = createClient();

      // First, re-check backend status - maybe already connected but stale UI
      const backendUrl = process.env.NEXT_PUBLIC_GMB_BACKEND_URL?.trim()?.replace(/\/+$/, "");
      if (backendUrl) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const statusRes = await fetch(`${backendUrl}/auth/google/status`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.has_refresh_token) {
              setIsGoogleConnected(true);
              setIsReconnecting(false);
              return; // Already connected, just update UI
            }
          }
        }
      }

      // Not connected - trigger OAuth flow
      await startGoogleConnectFlow({
        supabase,
        nextPath: "/protected",
        flow: "connect-google",
      });
    } catch (err) {
      console.error("Reconnect Google failed:", err);
      setIsReconnecting(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Derived display values - must be before any early return (Rules of Hooks)
  // ---------------------------------------------------------------------------
  const selectedLocationId = searchParams.get("locationId");
  const selectedLocationName = React.useMemo(() => {
    if (!selectedLocationId) return "All Locations";
    const loc = locations.find((l) => l.id === selectedLocationId);
    return loc ? loc.location_name : "All Locations";
  }, [selectedLocationId, locations]);

  const displayName = user?.user_metadata?.full_name || user?.email || "User";
  const displayInitial = displayName.charAt(0).toUpperCase();
  const userEmail = user?.email || "";

  // ---------------------------------------------------------------------------
  // Loading screen
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex h-svh w-full items-center justify-center bg-slate-50">
        <div className="size-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  const creditsLoading = remainingCredits === null || totalCredits === null;
  const creditsPct = !creditsLoading && totalCredits! > 0
    ? Math.round((remainingCredits! / totalCredits!) * 100)
    : 0;
  const creditsLabel = creditsLoading ? "..." : remainingCredits!.toLocaleString();
  const totalCreditsLabel = creditsLoading ? "..." : totalCredits!.toLocaleString();
  const creditsTone =
    creditsLoading
      ? "border-slate-200 bg-slate-50 text-slate-600"
      : creditsPct <= 20
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : creditsPct <= 50
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-indigo-200 bg-indigo-50 text-indigo-700";
  const creditsBarTone =
    creditsLoading
      ? "bg-slate-400"
      : creditsPct <= 20
        ? "bg-rose-500"
        : creditsPct <= 50
          ? "bg-amber-500"
          : "bg-indigo-500";

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------
  return (
    <PendingReviewsProvider>
    <CreditProvider
      userId={user?.id ?? null}
      initialCredits={{
        total: totalCredits ?? 0,
        used: (totalCredits ?? 0) - (remainingCredits ?? 0),
        remaining: remainingCredits ?? 0,
      }}
    >
      <div className="flex h-svh overflow-hidden bg-slate-50 text-reply-navy">
        <DashboardSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          displayName={displayName}
          isGoogleConnected={isGoogleConnected}
          onReconnectGoogle={handleReconnectGoogle}
          isReconnecting={isReconnecting}
        />

        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          {/* ================================================================
              TOP HEADER
          ================================================================ */}
          <header className="z-30 flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/95 px-3 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-xl sm:px-5 lg:px-6">

            {/* ---- LEFT: hamburger + search + location picker ---- */}
            <div className="flex h-full min-w-0 flex-1 items-center gap-2.5">
              {/* Mobile sidebar toggle */}
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden -ml-0.5 rounded-xl border border-slate-200 p-2 text-slate-500 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
              >
                <Menu className="h-5 w-5" />
              </button>

              {/* Search bar */}
              <div ref={searchRef} className="relative hidden max-w-[520px] flex-1 sm:block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  onFocus={() => searchQuery && setIsSearchOpen(true)}
                  placeholder="Search reviews, locations..."
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50/80 pl-11 pr-9 text-sm text-slate-700 transition-all placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSearchResults([]);
                      setIsSearchOpen(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Search results dropdown */}
                {isSearchOpen && (
                  <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                    {isSearching ? (
                      <div className="p-4 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                        Searching...
                      </div>
                    ) : searchResults.length === 0 ? (
                      <p className="p-4 text-center text-sm text-slate-500">
                        No results for &ldquo;{searchQuery}&rdquo;
                      </p>
                    ) : (
                      <div className="py-1.5">
                        {/* Location results */}
                        {searchResults.some((r) => r.type === "location") && (
                          <>
                            <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              Locations
                            </p>
                            {searchResults
                              .filter((r) => r.type === "location")
                              .map((result) => (
                                <button
                                  key={result.id}
                                  onClick={() => {
                                    router.push(result.href);
                                    setIsSearchOpen(false);
                                    setSearchQuery("");
                                  }}
                                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 transition-colors"
                                >
                                  <div className="shrink-0 h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                                    <MapPin className="h-4 w-4 text-indigo-600" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 truncate">{result.title}</p>
                                    <p className="text-xs text-slate-500">{result.subtitle}</p>
                                  </div>
                                </button>
                              ))}
                          </>
                        )}

                        {/* Review results */}
                        {searchResults.some((r) => r.type === "review") && (
                          <>
                            <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 border-t border-slate-100 mt-1">
                              Reviews
                            </p>
                            {searchResults
                              .filter((r) => r.type === "review")
                              .map((result) => (
                                <button
                                  key={result.id}
                                  onClick={() => {
                                    router.push(result.href);
                                    setIsSearchOpen(false);
                                    setSearchQuery("");
                                  }}
                                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-amber-50 transition-colors"
                                >
                                  <div className="shrink-0 h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
                                    <Star className="h-4 w-4 text-amber-500" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-semibold text-slate-800 truncate">{result.title}</p>
                                      {result.rating !== undefined && (
                                        <span className="text-xs text-amber-500 shrink-0">
                                          {result.rating}/5
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-500 truncate">{result.subtitle}</p>
                                  </div>
                                </button>
                              ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Location picker - commented out for now
              <div ref={locationsRef} className="relative hidden sm:block">
                <button
                  onClick={() => setIsLocationsOpen(!isLocationsOpen)}
                  className="flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 transition-all hover:border-indigo-300 hover:bg-indigo-50/30"
                >
                  <MapPin className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  <span className="max-w-[150px] truncate">{selectedLocationName}</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${isLocationsOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isLocationsOpen && (
                  <div className="absolute left-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                    <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Your Locations
                      </p>
                    </div>
                    <div className="max-h-72 overflow-y-auto py-1">
                      {locations.length === 0 ? (
                        <p className="p-4 text-sm text-slate-500 text-center">No locations connected</p>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setIsLocationsOpen(false);
                              router.push("/protected");
                            }}
                            className="w-full text-left flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                          >
                            <span className="text-sm font-semibold text-slate-700">All Locations</span>
                            {!selectedLocationId && (
                              <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                            )}
                          </button>
                          {locations.map((loc) => (
                            <button
                              key={loc.id}
                              onClick={() => {
                                setIsLocationsOpen(false);
                                router.push(`/protected?locationId=${loc.id}`);
                              }}
                              className="w-full text-left flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors border-t border-slate-50"
                            >
                              <div className="min-w-0 mr-2">
                                <p
                                  className={`text-sm font-semibold truncate ${
                                    selectedLocationId === loc.id
                                      ? "text-indigo-700"
                                      : "text-slate-700"
                                  }`}
                                >
                                  {loc.location_name}
                                </p>
                                {loc.is_active && (
                                  <span className="text-[10px] text-emerald-600 font-medium">
                                    Active
                                  </span>
                                )}
                              </div>
                              {selectedLocationId === loc.id && (
                                <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />
                              )}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              */}
            </div>

            {/* ---- RIGHT: credits + notifications + help + profile ---- */}
            <div className="flex items-center gap-1.5 pl-2 sm:gap-2">

              {/* AI Credits navbar badge - commented out, kept in profile dropdown
              <button
                onClick={() => router.push("/protected/settings")}
                title={`${creditsLabel} of ${totalCreditsLabel} credits remaining`}
                className={`hidden min-w-[170px] rounded-2xl border px-3 py-2 transition-all hover:shadow-sm md:flex ${creditsTone}`}
              >
                <div className="flex w-full items-center gap-2">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-white/80">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">AI Credits</p>
                    <p className="truncate text-xs font-semibold">
                      {creditsLabel} <span className="font-normal opacity-70">/ {totalCreditsLabel}</span>
                    </p>
                  </div>
                  <span className="text-[11px] font-bold">{creditsPct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
                  <div
                    className={`h-full rounded-full transition-all ${creditsBarTone}`}
                    style={{ width: `${creditsPct}%` }}
                  />
                </div>
              </button>
              */}
              {/* Notifications */}
              <div ref={notificationsRef} className="relative">
                <button
                  onClick={() => {
                    setIsNotificationsOpen(!isNotificationsOpen);
                    setIsHelpOpen(false);
                    setIsProfileOpen(false);
                  }}
                  className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center border-2 border-white leading-none">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>

                {isNotificationsOpen && (
                  <div className="absolute top-12 right-0 w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-800">Notifications</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {unreadCount > 0
                            ? `${unreadCount} unread review${unreadCount !== 1 ? "s" : ""}`
                            : "No new notifications"}
                        </p>
                      </div>
                      {unreadCount > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          className="text-xs text-indigo-600 font-semibold hover:text-indigo-700"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center">
                          <Bell className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                          <p className="text-sm font-semibold text-slate-500">All caught up!</p>
                          <p className="text-xs text-slate-400 mt-1">No unread reviews</p>
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <button
                            key={notif.id}
                            onClick={() => {
                              router.push(`/protected/inbox?locationId=${notif.location_id}`);
                              setIsNotificationsOpen(false);
                            }}
                            className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-slate-50 border-b border-slate-50 transition-colors last:border-b-0"
                          >
                            <div className="shrink-0 h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center mt-0.5">
                              <Star className="h-4 w-4 text-amber-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">
                                {notif.reviewer_name || "Anonymous"}
                              </p>
                              <div className="flex items-center gap-0.5 my-0.5">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <Star
                                    key={i}
                                    className={`h-2.5 w-2.5 ${
                                      i < notif.star_rating
                                        ? "text-amber-400 fill-amber-400"
                                        : "text-slate-200 fill-slate-200"
                                    }`}
                                  />
                                ))}
                              </div>
                              <p className="text-xs text-slate-500 line-clamp-2">{notif.review_text}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>

                    <div className="p-3 border-t border-slate-100">
                      <button
                        onClick={() => {
                          router.push("/protected/inbox");
                          setIsNotificationsOpen(false);
                        }}
                        className="w-full text-center text-xs font-semibold text-indigo-600 hover:text-indigo-700 py-1 transition-colors"
                      >
                        View all in Inbox
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Help */}
              <div ref={helpRef} className="relative">
                <button
                  onClick={() => {
                    setIsHelpOpen(!isHelpOpen);
                    setIsNotificationsOpen(false);
                    setIsProfileOpen(false);
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                >
                  <HelpCircle className="h-5 w-5" />
                </button>

                {isHelpOpen && (
                  <div className="absolute top-12 right-0 w-72 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50">
                      <p className="text-sm font-bold text-slate-800">Help & Resources</p>
                      <p className="text-xs text-slate-500 mt-0.5">Guides, tips, and support</p>
                    </div>
                    <div className="p-2">
                      {[
                        {
                          icon: BookOpen,
                          label: "Getting Started",
                          desc: "Set up your first location",
                          href: "/protected",
                        },
                        {
                          icon: MessageSquare,
                          label: "Review Response Tips",
                          desc: "Best practices for replies",
                          href: "/protected/inbox",
                        },
                        {
                          icon: Zap,
                          label: "AI Credits Guide",
                          desc: "How AI credits work",
                          href: "/protected/settings",
                        },
                        {
                          icon: TrendingUp,
                          label: "Analytics Overview",
                          desc: "Understand your metrics",
                          href: "/protected",
                        },
                      ].map(({ icon: Icon, label, desc, href }) => (
                        <button
                          key={label}
                          onClick={() => {
                            router.push(href);
                            setIsHelpOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-indigo-50 transition-colors text-left"
                        >
                          <div className="shrink-0 h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                            <Icon className="h-4 w-4 text-indigo-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-700">{label}</p>
                            <p className="text-xs text-slate-500">{desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/60">
                      <p className="text-xs text-slate-500">
                        Need help?{" "}
                        <a
                          href="mailto:support@credibl5.com"
                          className="text-indigo-600 font-semibold hover:underline"
                        >
                          Contact support
                        </a>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mx-0.5 hidden h-8 w-px bg-slate-200 sm:block" />

              {/* User profile dropdown */}
              <div ref={profileRef} className="relative">
                <button
                  onClick={() => {
                    setIsProfileOpen(!isProfileOpen);
                    setIsNotificationsOpen(false);
                    setIsHelpOpen(false);
                  }}
                  className="flex items-center gap-2 rounded-2xl border border-transparent py-1 pl-1 pr-2 transition-colors hover:border-slate-200 hover:bg-slate-100"
                >
                  <div className="hidden sm:block text-right">
                    <p className="text-sm font-bold text-slate-900 leading-none">
                      {displayName.split(" ")[0]}
                    </p>
                    <p className="text-[10px] font-medium text-slate-400 mt-0.5 uppercase tracking-wider">
                      Administrator
                    </p>
                  </div>
                  <div className="size-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-indigo-600/20 ring-2 ring-white">
                    {displayInitial}
                  </div>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-slate-400 hidden sm:block transition-transform ${
                      isProfileOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isProfileOpen && (
                  <div className="absolute top-12 right-0 w-64 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden z-50">
                    {/* Profile header */}
                    <div className="px-4 py-4 bg-gradient-to-br from-indigo-50 to-violet-50 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold shadow-md shrink-0">
                          {displayInitial}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{displayName}</p>
                          <p className="text-xs text-slate-500 truncate">{userEmail}</p>
                          <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                            Administrator
                          </span>
                        </div>
                      </div>
                      {/* Compact credits chip inside profile */}
                      <div className="mt-3 px-2.5 py-2 bg-white/70 rounded-lg border border-indigo-100 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="h-3 w-3 text-violet-500" />
                            <span className="text-[11px] text-indigo-500 font-medium">AI Credits</span>
                          </div>
                          <span className="text-xs font-bold text-indigo-700">
                            {creditsLabel}
                            <span className="font-normal text-indigo-400">
                              /{totalCreditsLabel}
                            </span>
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              creditsPct > 50
                                ? "bg-indigo-500"
                                : creditsPct > 20
                                ? "bg-amber-400"
                                : "bg-red-400"
                            }`}
                            style={{ width: `${creditsPct}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Menu items */}
                    <div className="p-2">
                      <button
                        onClick={() => {
                          router.push("/protected/settings");
                          setIsProfileOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left"
                      >
                        <Settings className="h-4 w-4 text-slate-500" />
                        <span className="text-sm font-medium text-slate-700">Settings</span>
                      </button>
                    </div>

                    <div className="p-2 border-t border-slate-100">
                      <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-50 transition-colors text-left"
                      >
                        <LogOut className="h-4 w-4 text-red-500" />
                        <span className="text-sm font-medium text-red-600">Sign out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* ==============================================================
              SCROLLABLE MAIN CONTENT
          ============================================================== */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden relative bg-slate-50/50 pb-12">
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-100/30 blur-[120px] rounded-full" />
              <div className="absolute bottom-[10%] right-[5%] w-[30%] h-[30%] bg-sky-100/20 blur-[100px] rounded-full" />
            </div>
            <div className="relative z-10 mx-auto max-w-7xl p-4 sm:p-6 lg:p-10">
              {/* Zero-credit persistent banner */}
              {remainingCredits === 0 && totalCredits !== null && totalCredits > 0 && !creditBannerDismissed && (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                  <span className="font-medium">Your AI credits are exhausted.</span>
                  <span className="text-red-600">AI-powered features are paused until you top up.</span>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => router.push("/protected/settings")}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
                    >
                      Buy Credits
                    </button>
                    <button
                      onClick={() => setCreditBannerDismissed(true)}
                      className="rounded-lg border border-red-200 px-2 py-1.5 text-xs text-red-600 hover:bg-red-100 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
              {children}
            </div>
          </main>
        </div>
      </div>
    </CreditProvider>
    </PendingReviewsProvider>
  );
}
