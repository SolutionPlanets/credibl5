"use client";

import React, { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MapPin,
  MessageSquare,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { ConnectGoogleButton } from "@/components/protected/connect-google-button";
import { GMBStatusAlert } from "@/components/protected/gmb-status-alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type DashboardStat = {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  iconClassName: string;
  panelClassName: string;
};

const stats: DashboardStat[] = [
  {
    title: "Reviews Collected",
    value: "0",
    subtitle: "Awaiting first sync",
    icon: MessageSquare,
    iconClassName: "bg-sky-100 text-sky-700",
    panelClassName: "from-sky-50 via-white to-sky-100/70",
  },
  {
    title: "Average Rating",
    value: "0.0",
    subtitle: "Not enough data yet",
    icon: Star,
    iconClassName: "bg-amber-100 text-amber-700",
    panelClassName: "from-amber-50 via-white to-orange-100/60",
  },
  {
    title: "AI Replies Sent",
    value: "0",
    subtitle: "No responses this month",
    icon: Zap,
    iconClassName: "bg-emerald-100 text-emerald-700",
    panelClassName: "from-emerald-50 via-white to-teal-100/60",
  },
  {
    title: "Median Response Time",
    value: "0h",
    subtitle: "Set after first reply",
    icon: Clock3,
    iconClassName: "bg-rose-100 text-rose-700",
    panelClassName: "from-rose-50 via-white to-orange-100/60",
  },
];

export default function ProtectedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [profileData, setProfileData] = useState<{
    google_connected_at?: string | null;
    onboarding_completed?: boolean | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setUser(user);

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("google_connected_at, onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      setProfileData(profile);
      setLoading(false);
    };

    fetchData();
  }, [router]);

  const isGoogleConnected =
    Boolean(profileData?.google_connected_at) ||
    user?.user_metadata?.google_connected === true;
  const onboardingCompleted = Boolean(profileData?.onboarding_completed);
  const googleState = searchParams.get("google") ?? undefined;
  const passwordCreated = searchParams.get("password_created") === "true";

  useEffect(() => {
    if (!loading && !onboardingCompleted && !isGoogleConnected) {
      router.push("/onboarding");
    }
  }, [isGoogleConnected, loading, onboardingCompleted, router]);

  if (loading) return null;

  if (!user) return null;

  if (!onboardingCompleted && !isGoogleConnected) {
    return null;
  }

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
              <Button className="h-11 rounded-xl bg-white px-5 font-semibold text-slate-900 hover:bg-slate-100">
                <Plus className="mr-2 h-4 w-4" />
                Add Location
              </Button>
              <Button
                variant="outline"
                className="h-11 rounded-xl border-white/40 bg-white/10 px-5 font-semibold text-white hover:bg-white/20"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Quick Sync
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/25 bg-white/10 p-5 backdrop-blur-md sm:p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white/90">Today at a glance</p>
              <Sparkles className="h-4 w-4 text-white/80" />
            </div>
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl bg-white/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-white/70">Outstanding replies</p>
                <p className="mt-1 text-2xl font-semibold">0</p>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-white/70">Locations connected</p>
                <p className="mt-1 text-2xl font-semibold">0</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <GMBStatusAlert googleState={googleState} />

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
                      As new reviews arrive, they appear here for quick triage.
                    </CardDescription>
                  </div>
                  <Button variant="outline" className="rounded-xl border-slate-200 bg-white font-semibold">
                    Open Inbox
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6 sm:p-8">
                <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center sm:p-12">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
                    <MessageSquare className="h-7 w-7" />
                  </div>
                  <p className="mt-4 text-base font-semibold text-slate-900">No synced reviews yet</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
                    Connect at least one location and run your first sync to populate this feed.
                  </p>
                  <div className="mt-6 flex justify-center">
                    <Button className="rounded-xl bg-slate-900 px-5 font-semibold text-white hover:bg-slate-800">
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync Now
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="overflow-hidden rounded-4xl border-none bg-slate-900 text-white shadow-xl">
                <div className="bg-gradient-to-br from-sky-500/20 to-emerald-400/10 p-6 sm:p-7">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Capacity</p>
                  <p className="mt-2 text-2xl font-semibold">142 / 500 credits</p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-[28%] rounded-full bg-gradient-to-r from-sky-300 to-emerald-300" />
                  </div>
                  <p className="mt-3 text-xs text-white/70">Credits reset on April 1, 2026.</p>
                </div>
                <div className="space-y-3 p-6 sm:p-7">
                  {[
                    { title: "Pending replies", value: "0", icon: MessageSquare },
                    { title: "Connected locations", value: "0", icon: MapPin },
                    { title: "Automation active", value: "No", icon: Zap },
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
                <div className="mt-5 space-y-3">
                  {[
                    {
                      title: "Set up brand profile",
                      description: "Add logo, colors, and preferred tone",
                      icon: CheckCircle2,
                      colorClassName: "text-emerald-700 bg-emerald-100",
                    },
                    {
                      title: "Review inbox rules",
                      description: "Define what needs manual approval",
                      icon: MessageSquare,
                      colorClassName: "text-sky-700 bg-sky-100",
                    },
                  ].map((item) => (
                    <button
                      key={item.title}
                      type="button"
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
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

