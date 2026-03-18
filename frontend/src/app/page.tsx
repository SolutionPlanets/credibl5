"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  MapPin,
  MessageSquareQuote,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Zap,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

// ==========================================
// 1. Types & Static Data Extracted Outside Component
// ==========================================
type BillingCycle = "monthly" | "yearly";

type PricingPlan = {
  name: string;
  buttonText: string;
  popular?: boolean;
  customPricing?: boolean;
  monthlyPrice?: number;
  yearlyPrice?: number;
  description: string;
  features: string[];
};

type AddOn = {
  credits: number;
  price: number;
};

// Extracted formatting logic so it doesn't recreate on every render
const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const FEATURE_CARDS = [
  {
    icon: Bot,
    title: "Reply with brand-safe AI",
    description:
      "Generate polished, human-sounding replies that match your tone across every Google Business Profile location.",
  },
  {
    icon: Clock3,
    title: "Handle reviews in minutes",
    description:
      "Cut manual review work from hours to minutes with queue-based triage, saved responses, and one-click sending.",
  },
  {
    icon: TrendingUp,
    title: "Protect your reputation",
    description:
      "Stay consistent on positive, neutral, and negative feedback with smarter defaults and clear response workflows.",
  },
  {
    icon: Building2,
    title: "Scale across locations",
    description:
      "Support single-location businesses, growing operators, and agencies from one clean workspace.",
  },
];

const SHOWCASE_STATS = [
  { label: "Average response time", value: "< 5 min" },
  { label: "Locations managed", value: "Multi-site" },
  { label: "Reply consistency", value: "On-brand" },
  { label: "Review coverage", value: "Always on" },
];

const PRICING_PLANS: PricingPlan[] = [
  {
    name: "Trial",
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: "A quick way to test workflows before committing.",
    features: [
      "15-day free trial",
      "1 location max",
      "Manual AI replies allowed",
      "Auto Reply disabled",
      "50 AI credits included",
      "Standard email support",
    ],
    buttonText: "Start free",
  },
  {
    name: "Basic",
    monthlyPrice: 20,
    yearlyPrice: 200,
    description: "Best for small businesses building a steady reply habit.",
    features: [
      "2 active locations",
      "100 AI credits/month",
      "Auto Reply disabled",
      "Brand voice setup",
      "Saved response templates",
      "Standard support",
    ],
    buttonText: "Choose Basic",
  },
  {
    name: "Pro",
    monthlyPrice: 50,
    yearlyPrice: 500,
    description: "For teams that need speed, oversight, and more coverage.",
    features: [
      "Up to 5 active locations",
      "500 AI credits/month",
      "Auto Reply enabled",
      "Advanced brand voice training",
      "Template builder",
      "Priority support",
      "Performance insights",
    ],
    popular: true,
    buttonText: "Choose Pro",
  },
  {
    name: "Custom",
    customPricing: true,
    description: "Flexible plans for multi-brand and multi-user teams.",
    features: [
      "Contact sales",
      "Custom location count & credits",
      "Auto Reply enabled",
      "Team access and controls",
      "Optional agency controls",
      "White-label options",
      "Dedicated onboarding",
    ],
    buttonText: "Talk to sales",
  },
];

const ADD_ONS: AddOn[] = [
  { credits: 50, price: 15 },
  { credits: 150, price: 39 },
  { credits: 400, price: 89 },
];

const BILLING_CYCLES = [
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Annual" },
] as const;

// ==========================================
// 2. Main Page Component
// ==========================================
export default function Home() {
  const router = useRouter();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");

  useEffect(() => {
    const supabase = createClient();
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (code) {
      router.push(`/auth/callback?code=${code}`);
      return;
    }

    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) router.push("/protected");
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        router.push("/protected");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    // Replaced #f5f7fb with bg-slate-50 to perfectly match the Auth/Marketing shells
    <div className="relative min-h-svh overflow-hidden bg-slate-50 text-reply-navy">

      {/* Background gradients */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(circle_at_top,_rgba(88,125,254,0.18),_transparent_58%)]" />
        <div className="absolute -left-40 top-24 h-80 w-80 rounded-full bg-reply-purple/10 blur-[100px]" />
        <div className="absolute -right-32 top-52 h-96 w-96 rounded-full bg-sky-300/20 blur-[100px]" />
      </div>

      <SiteHeader />

      <main className="relative z-10">

        {/* ──────────── HERO SECTION ──────────── */}
        <section className="px-4 pb-16 pt-10 md:px-6 md:pb-24 md:pt-14">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">

            <header className="max-w-2xl">
              <Badge className="rounded-full border border-white/70 bg-white/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-reply-purple shadow-sm backdrop-blur">
                Built for U.S. service businesses
              </Badge>

              <h1 className="mt-6 text-balance text-5xl font-extrabold tracking-tight text-slate-900 md:text-7xl">
                Reply to every Google review with speed and polish.
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600 md:text-xl">
                Credibl5 helps teams write faster, more consistent customer
                responses so your brand sounds sharp in every market.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  className="h-12 rounded-full bg-slate-950 px-7 text-white shadow-lg shadow-slate-900/15 transition-transform hover:-translate-y-0.5 hover:bg-slate-800"
                  onClick={() => router.push("/auth/signup")}
                >
                  Start free trial
                  <ArrowRight className="ml-2 size-4" />
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-slate-300 bg-white px-7 text-slate-900 hover:bg-slate-50"
                >
                  <a href="#pricing">See pricing</a>
                </Button>
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-slate-600">
                {[
                  "No credit card required",
                  "Set up in minutes",
                  "Works for single and multi-location teams",
                ].map((item) => (
                  <span key={item} className="inline-flex items-center gap-2">
                    <Check className="size-4 text-emerald-500" />
                    {item}
                  </span>
                ))}
              </div>

              <div className="mt-10 grid max-w-xl grid-cols-2 gap-4 sm:grid-cols-4">
                {SHOWCASE_STATS.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-3xl border border-white/70 bg-white/80 px-4 py-5 shadow-sm backdrop-blur"
                  >
                    <div className="text-lg font-bold text-slate-950">
                      {stat.value}
                    </div>
                    <div className="mt-1 text-sm leading-5 text-slate-500">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </header>

            {/* ── Hero mockup / product preview ── */}
            <div className="relative">
              <div className="absolute -left-6 top-10 hidden rounded-3xl border border-white/70 bg-white/85 p-4 shadow-lg backdrop-blur md:block z-20">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <BadgeCheck className="size-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-950">
                      Review handled
                    </div>
                    <div className="text-sm text-slate-500">
                      Draft approved in 18 seconds
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative z-10 rounded-[2rem] border border-white/70 bg-slate-950 p-3 shadow-[0_40px_100px_-40px_rgba(15,23,42,0.55)]">
                <div className="overflow-hidden rounded-[1.4rem] bg-[#eef3ff]">
                  {/* Mockup Top Bar */}
                  <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-5 py-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                        Reputation Command Center
                      </div>
                      <div className="mt-1 text-lg font-bold text-slate-950">
                        Downtown Dental Group
                      </div>
                    </div>
                    <Badge className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 hover:bg-emerald-50 border-none">
                      Live queue
                    </Badge>
                  </div>

                  {/* Mockup Content Grid */}
                  <div className="grid gap-4 p-5 lg:grid-cols-[0.78fr_1.22fr]">
                    <div className="space-y-4">
                      {/* Metric Card */}
                      <div className="rounded-3xl bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-slate-500">
                              Reviews awaiting reply
                            </div>
                            <div className="mt-2 text-4xl font-bold text-slate-950">
                              12
                            </div>
                          </div>
                          <div className="flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                            <MessageSquareQuote className="size-5" />
                          </div>
                        </div>
                        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          <TrendingUp className="size-3.5" />
                          32% faster than last week
                        </div>
                      </div>

                      {/* Brand Voice Card */}
                      <div className="rounded-3xl bg-white p-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                            <Sparkles className="size-4" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-950">
                              Brand voice active
                            </div>
                            <div className="text-xs text-slate-500 truncate max-w-[150px]">
                              Professional, friendly...
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Progress Card */}
                      <div className="rounded-3xl bg-white p-4 shadow-sm">
                        <div className="text-sm font-bold text-slate-950">
                          Response coverage
                        </div>
                        <div className="mt-4 h-3 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full w-[84%] rounded-full bg-slate-950" />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs font-medium text-slate-500">
                          <span>84% replied</span>
                          <span>Target: 90%</span>
                        </div>
                      </div>
                    </div>

                    {/* Main Action Area */}
                    <div className="rounded-[1.75rem] bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                            <MapPin className="size-4" />
                            Boston, MA
                          </div>
                          <div className="mt-2 text-xl font-bold text-slate-950">
                            New 5-star review ready
                          </div>
                        </div>
                        <div className="flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-700">
                          <Star className="size-4 fill-current" />
                          5.0
                        </div>
                      </div>

                      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm leading-relaxed text-slate-700">
                          &ldquo;The front desk was welcoming, the dentist
                          explained everything clearly, and the office followed
                          up right away. Best dental experience I&apos;ve had in
                          years.&rdquo;
                        </p>
                      </div>

                      <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/80 p-4">
                        <div className="flex items-center gap-2 text-sm font-bold text-blue-800">
                          <Bot className="size-4" />
                          Suggested reply
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-slate-700">
                          Thank you for the thoughtful review. We&apos;re glad
                          our team made your visit feel clear, comfortable, and
                          well-supported. We appreciate your trust and look
                          forward to seeing you again.
                        </p>
                      </div>

                      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                        <Button className="h-11 rounded-full bg-slate-950 px-6 text-white hover:bg-slate-800">
                          Send reply
                        </Button>
                        <Button
                          variant="outline"
                          className="h-11 rounded-full border-slate-300 bg-white px-6 text-slate-900 hover:bg-slate-50"
                        >
                          Regenerate
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ──────────── FEATURES SECTION ──────────── */}
        <section id="features" className="scroll-mt-24 px-4 py-24 md:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <Badge className="rounded-full bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600 shadow-sm border border-slate-200/60">
                Why teams switch
              </Badge>
              <h2 className="mt-5 text-balance text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
                A cleaner workflow for customer-facing teams
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-slate-600">
                Credibl5 streamlines your review response process with
                AI-powered drafts, brand voice consistency, and multi-location
                management in one clean interface.
              </p>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {FEATURE_CARDS.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="rounded-[2rem] border border-slate-200/60 bg-white p-7 shadow-sm ring-1 ring-slate-900/5 transition-transform duration-200 hover:-translate-y-1"
                  >
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-md">
                      <Icon className="size-6" />
                    </div>
                    <h3 className="mt-6 text-xl font-bold text-slate-900">
                      {feature.title}
                    </h3>
                    <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ──────────── TRUST / WORKFLOW SECTION ──────────── */}
        <section className="px-4 pb-24 md:px-6">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.88fr_1.12fr]">
            <div className="rounded-[2rem] border border-slate-200/60 bg-white p-8 shadow-sm ring-1 ring-slate-900/5 md:p-10">
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-slate-700">
                <ShieldCheck className="size-4" />
                Built for trust
              </div>
              <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
                Give operators confidence before they click send.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-slate-600">
                Every reply is reviewed before publishing. Your team stays in
                control while AI handles the heavy lifting of drafting
                consistent, on-brand responses.
              </p>
              <div className="mt-8 space-y-4">
                {[
                  "Simple monthly and annual pricing with no hidden fees",
                  "Direct, clear copy that speaks to American business owners",
                  "Clean, responsive design for desktop and mobile",
                ].map((item) => (
                  <div key={item} className="flex gap-3">
                    <ChevronRight className="mt-1 size-4 flex-shrink-0 text-reply-purple" />
                    <p className="text-[15px] font-medium leading-relaxed text-slate-700">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-900 bg-slate-950 p-8 text-white shadow-2xl shadow-slate-900/15 md:p-10 relative overflow-hidden">
              {/* Subtle background glow for the dark card */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-reply-purple/20 blur-[80px] rounded-full pointer-events-none" />

              <div className="relative z-10 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-bold uppercase tracking-[0.22em] text-slate-400">
                    Sample workflow
                  </div>
                  <h3 className="mt-3 text-3xl font-extrabold tracking-tight text-white">
                    Review triage without the clutter
                  </h3>
                </div>
                <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
                  <Zap className="size-5 text-cyan-300" />
                </div>
              </div>

              <div className="relative z-10 mt-8 space-y-4">
                {[
                  "1. New review enters the queue with star rating and location context.",
                  "2. AI drafts a reply using your saved voice and response style.",
                  "3. Your team approves, edits, or regenerates before publishing.",
                ].map((step) => (
                  <div
                    key={step}
                    className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-[15px] leading-relaxed text-slate-200 backdrop-blur-sm"
                  >
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ──────────── PRICING SECTION ──────────── */}
        <section
          id="pricing"
          className="scroll-mt-24 border-y border-slate-200/80 bg-white px-4 py-24 md:px-6"
        >
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <Badge className="rounded-full border border-slate-200/60 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-700 shadow-sm">
                Pricing
              </Badge>
              <h2 className="mt-5 text-balance text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
                Straightforward plans for growing teams
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-slate-600">
                Start free, upgrade when you need more locations or more AI
                response volume.
              </p>

              {/* Refactored mapped billing cycle buttons */}
              <div className="mt-10 inline-flex rounded-full border border-slate-200 bg-slate-50 p-1.5 shadow-sm">
                {BILLING_CYCLES.map((cycle) => (
                  <Button
                    key={cycle.id}
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={
                      billingCycle === cycle.id
                        ? "rounded-full bg-slate-950 px-5 text-white shadow-sm hover:bg-slate-800"
                        : "rounded-full px-5 font-medium text-slate-600 hover:text-slate-950"
                    }
                    onClick={() => setBillingCycle(cycle.id as BillingCycle)}
                  >
                    {cycle.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-14 grid gap-6 lg:grid-cols-4">
              {PRICING_PLANS.map((plan) => {
                const isPopular = Boolean(plan.popular);
                const price = billingCycle === "monthly" ? plan.monthlyPrice ?? 0 : plan.yearlyPrice ?? 0;
                const period = billingCycle === "monthly" ? "/month" : "/year";

                return (
                  <div
                    key={plan.name}
                    className={
                      isPopular
                        ? "relative rounded-[2rem] border border-slate-950 bg-slate-950 p-8 text-white shadow-2xl shadow-slate-900/15"
                        : "relative rounded-[2rem] border border-slate-200/80 bg-slate-50 p-8 ring-1 ring-slate-900/5"
                    }
                  >
                    {isPopular && (
                      <span className="absolute -top-3 left-6 rounded-full bg-cyan-300 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-950 shadow-sm">
                        Most popular
                      </span>
                    )}

                    <div className={isPopular ? "text-slate-300 font-semibold" : "text-slate-500 font-semibold"}>
                      {plan.name}
                    </div>

                    <div className="mt-3 text-4xl font-extrabold tracking-tight">
                      {plan.customPricing ? "Custom" : formatCurrency(price)}
                      {!plan.customPricing && (
                        <span className={`ml-1 text-base font-medium ${isPopular ? "text-slate-400" : "text-slate-500"}`}>
                          {period}
                        </span>
                      )}
                    </div>

                    <p className={`mt-4 text-[15px] leading-relaxed ${isPopular ? "text-slate-300" : "text-slate-600"}`}>
                      {plan.description}
                    </p>

                    <ul className="mt-8 space-y-4">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex gap-3 text-[14px] font-medium leading-relaxed">
                          <Check
                            className={`mt-0.5 size-4 flex-shrink-0 ${isPopular ? "text-cyan-300" : "text-emerald-600"}`}
                          />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      className={
                        isPopular
                          ? "mt-8 h-12 w-full rounded-full bg-white font-bold text-slate-950 shadow-sm hover:bg-slate-100"
                          : "mt-8 h-12 w-full rounded-full bg-slate-950 font-bold text-white shadow-sm hover:bg-slate-800"
                      }
                      onClick={() => {
                        if (plan.customPricing) {
                          router.push("/contact");
                          return;
                        }
                        const planIdMap: Record<string, string> = { Trial: "free", Basic: "starter", Pro: "growth" };
                        const planId = planIdMap[plan.name] || "free";
                        const params = new URLSearchParams();
                        if (planId !== "free") {
                          params.set("plan", planId);
                          params.set("billing", billingCycle);
                        }
                        router.push(`/auth/signup${params.toString() ? `?${params}` : ""}`);
                      }}
                    >
                      {plan.buttonText}
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Add-ons */}
            <div className="mt-12 rounded-[2rem] border border-slate-200/80 bg-slate-50 p-8 shadow-sm ring-1 ring-slate-900/5 md:p-10">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <h3 className="text-2xl font-bold tracking-tight text-slate-900">
                    Need extra reply volume?
                  </h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
                    Add reply credits whenever your volume spikes. One-time
                    purchases, no subscription changes needed.
                  </p>
                </div>
                <Link
                  href="/contact"
                  className="inline-flex items-center text-[15px] font-bold text-slate-900 transition-colors hover:text-reply-purple"
                >
                  Contact sales
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {ADD_ONS.map((addon) => (
                  <div
                    key={addon.credits}
                    className="rounded-2xl border border-slate-200/60 bg-white px-6 py-5 shadow-sm"
                  >
                    <div className="text-3xl font-extrabold tracking-tight text-slate-900">
                      {addon.credits}
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-500">
                      extra replies
                    </div>
                    <div className="mt-4 text-lg font-bold text-reply-purple">
                      {formatCurrency(addon.price)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ──────────── BOTTOM CTA SECTION ──────────── */}
        <section className="px-4 py-24 md:px-6">
          <div className="mx-auto max-w-6xl rounded-[2.5rem] border border-slate-200/60 bg-white px-8 py-14 text-center shadow-2xl shadow-slate-200/40 ring-1 ring-slate-900/5 md:px-16 md:py-20 relative overflow-hidden">
            {/* Subtle inner glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-reply-purple/5 blur-[100px] rounded-full pointer-events-none" />

            <div className="relative z-10">
              <Badge className="rounded-full border border-slate-200/60 bg-slate-50 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-700 shadow-sm">
                Ready to launch
              </Badge>
              <h2 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-extrabold tracking-tight text-slate-900 md:text-6xl">
                Start managing reviews smarter today
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
                Credibl5 keeps your brand consistent, your team fast, and your
                customers heard. No credit card required to start.
              </p>
              <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
                <Button
                  size="lg"
                  className="h-14 rounded-full bg-slate-950 px-8 text-base font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5 hover:bg-slate-800"
                  onClick={() => router.push("/auth/signup")}
                >
                  Start free trial
                  <ArrowRight className="ml-2 size-5" />
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-14 rounded-full border-slate-300 bg-white px-8 text-base font-bold text-slate-900 hover:bg-slate-50"
                >
                  <Link href="/contact">Talk to sales</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}