# Reply Pulse - Frontend Landing Page & Auth Implementation Guide

## Overview

This guide walks you through creating:
1. Brand color system (globals.css)
2. Root layout with metadata
3. Supabase client helpers
4. Plan configuration
5. Marketing shell components (Header, Footer, Shells)
6. Landing page with Hero, Features, Pricing, CTA sections
7. Auth pages (Login, Signup, OAuth Callback)
8. Auth form components (LoginForm, SignupForm)
9. Signup cookie API route

---

## File Creation Order

| # | File | Type |
|---|------|------|
| 1 | `src/app/globals.css` | Edit existing |
| 2 | `src/app/layout.tsx` | Edit existing |
| 3 | `src/lib/client.ts` | New file |
| 4 | `src/lib/server.ts` | New file |
| 5 | `src/lib/plan-config.ts` | New file |
| 6 | `src/components/marketing/site-header.tsx` | New file |
| 7 | `src/components/marketing/site-footer.tsx` | New file |
| 8 | `src/components/marketing/marketing-page-shell.tsx` | New file |
| 9 | `src/components/marketing/auth-page-shell.tsx` | New file |
| 10 | `src/app/page.tsx` | Replace existing |
| 11 | `src/components/login-form.tsx` | New file |
| 12 | `src/components/signup-form.tsx` | New file |
| 13 | `src/app/auth/login/page.tsx` | New file |
| 14 | `src/app/auth/signup/page.tsx` | New file |
| 15 | `src/app/auth/callback/route.ts` | New file |
| 16 | `src/app/api/auth/set-signup-cookie/route.ts` | New file |

---

## Step 1: Add Brand Colors to `src/app/globals.css`

**Action:** Add the Reply Pulse color tokens inside the `@theme inline { }` block, right after the `--font-mono` line.

**Add these lines after `--font-mono: var(--font-geist-mono);`:**

```css
  --color-reply-navy: #0C043F;
  --color-reply-purple: #9747FF;
  --color-reply-blue: #587DFE;
  --color-reply-pink: #FF5FA2;
  --color-reply-green: #1BC13F;
  --color-reply-muted: #8682A0;
```

This enables Tailwind classes like `text-reply-navy`, `bg-reply-purple`, `border-reply-green`, etc.

---

## Step 2: Update Root Layout `src/app/layout.tsx`

**Action:** Replace the entire file with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Reply Pulse - AI Review Management",
  description:
    "AI-powered review management for modern businesses. Reply faster, stay on brand, and keep customer communication consistent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
```

---

## Step 3: Create Supabase Browser Client `src/lib/client.ts`

**Action:** Create new file `src/lib/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  const host = typeof window !== "undefined" ? window.location.host : "";
  const isProductionDomain = host.includes("replypulse.com");
  const cookieDomain = isProductionDomain ? ".replypulse.com" : undefined;

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      domain: cookieDomain,
      sameSite: "lax",
      secure:
        typeof window !== "undefined" &&
        window.location.protocol === "https:",
      path: "/",
      // NEW: Keeps the user logged in for exactly 7 days
      maxAge: 60 * 60 * 24 * 7, 
    },
    auth: {
      flowType: "pkce",
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      // NEW: Prints helpful authentication logs to your browser console, 
      // but only when you are running locally (not in production).
      debug: process.env.NODE_ENV !== "production", 
    },
    // NEW: Appends a custom header to every request sent to Supabase.
    // This is great for tracking or identifying your app in Supabase logs.
    global: {
      headers: {
        'x-application-name': 'ReplyPulse'
      }
    }
  });
}
```

---

## Step 4: Create Supabase Server Client `src/lib/server.ts`

**Action:** Create new file `src/lib/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  const headerList = await headers();
  const host = headerList.get("host") || "";

  const isProductionDomain = host.includes("replypulse.com");
  const cookieDomain = isProductionDomain ? ".replypulse.com" : undefined;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                domain: cookieDomain || options.domain,
              })
            );
          } catch {
            // Ignored when called from Server Component
          }
        },
      },
    }
  );
}
```

---

## Step 5: Create Plan Config `src/lib/plan-config.ts`

**Action:** Create new file `src/lib/plan-config.ts`:

```ts
export type PlanId = "free" | "starter" | "growth" | "agency";
export type BillingCycle = "monthly" | "yearly";

export const FREE_TRIAL_DAYS = 15;

export type PlanDefinition = {
  id: PlanId;
  name: string;
  shortName: string;
  maxLocations: number;
  includedCredits: number;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  isCustom?: boolean;
  popular?: boolean;
  trialInfo?: string;
  pricingFeatures: string[];
  signupFeatures: string[];
  autoReplyEnabled: boolean;
};

export const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: `${FREE_TRIAL_DAYS}-Day Free Trial`,
    shortName: "Trial",
    maxLocations: 1,
    includedCredits: 50,
    monthlyPrice: 0,
    yearlyPrice: 0,
    trialInfo: `${FREE_TRIAL_DAYS} days free`,
    autoReplyEnabled: false,
    pricingFeatures: [
      "1 Google My Business location",
      "50 AI review replies",
      "Manual AI replies allowed",
      "Auto Reply disabled",
      `Plan expires after ${FREE_TRIAL_DAYS} days`,
      "Email support",
    ],
    signupFeatures: [
      "1 GMB location",
      "50 AI reviews total",
      "Manual AI replies allowed",
      "Auto Reply disabled",
      "Email support",
    ],
  },
  starter: {
    id: "starter",
    name: "Basic",
    shortName: "Basic",
    maxLocations: 2,
    includedCredits: 100,
    monthlyPrice: 20,
    yearlyPrice: 200,
    autoReplyEnabled: false,
    pricingFeatures: [
      "2 active locations",
      "100 AI credits/month",
      "Auto Reply disabled",
      "Brand voice training",
      "Response templates",
      "Email support",
    ],
    signupFeatures: [
      "2 active locations",
      "100 AI credits/month",
      "Auto Reply disabled",
      "Brand voice training",
      "Email support",
    ],
  },
  growth: {
    id: "growth",
    name: "Pro",
    shortName: "Pro",
    maxLocations: 5,
    includedCredits: 500,
    monthlyPrice: 50,
    yearlyPrice: 500,
    popular: true,
    autoReplyEnabled: true,
    pricingFeatures: [
      "Up to 5 active locations",
      "500 AI credits/month",
      "Auto Reply enabled",
      "Custom brand voice training",
      "Advanced templates builder",
      "Priority support",
      "Analytics dashboard",
    ],
    signupFeatures: [
      "5 active locations",
      "500 AI responses/month",
      "Auto Reply enabled",
      "Custom brand voice",
      "Priority support",
    ],
  },
  agency: {
    id: "agency",
    name: "Custom",
    shortName: "Custom",
    maxLocations: -1,
    includedCredits: 2000,
    monthlyPrice: null,
    yearlyPrice: null,
    isCustom: true,
    autoReplyEnabled: true,
    pricingFeatures: [
      "Contact sales",
      "Custom location count & credits",
      "Auto Reply enabled",
      "Multi-user team access",
      "Optional agency controls",
      "White-label option",
      "Dedicated account manager",
    ],
    signupFeatures: [
      "Custom locations & credits",
      "Auto Reply enabled",
      "Multi-user access",
      "White-label option",
      "Dedicated manager",
    ],
  },
};

export const AI_ADDON_PRICING = [
  { credits: 20, price: 299 },
  { credits: 50, price: 499 },
  { credits: 100, price: 899 },
] as const;

export function getPlanDefinition(
  planId: string | null | undefined
): PlanDefinition {
  return (
    PLAN_DEFINITIONS[(planId as PlanId) || "free"] ?? PLAN_DEFINITIONS.free
  );
}

export function getPlanCreditLimit(
  planId: string | null | undefined
): number {
  return getPlanDefinition(planId).includedCredits;
}

export function getPlanLocationLimit(
  planId: string | null | undefined
): number {
  return getPlanDefinition(planId).maxLocations;
}

export function getPlanPrice(
  planId: string | null | undefined,
  billingCycle: BillingCycle
): number | null {
  const plan = getPlanDefinition(planId);
  return billingCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
}

export function createPlanDates(
  planId: string | null | undefined,
  billingCycle: BillingCycle = "monthly",
  from = new Date()
) {
  const startDate = new Date(from);
  const endDate = new Date(startDate);

  if (planId === "free") {
    endDate.setDate(endDate.getDate() + FREE_TRIAL_DAYS);
  } else if (billingCycle === "yearly") {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
  }

  return { startDate, endDate };
}

export function getStoredBillingCycle(
  planId: string | null | undefined,
  billingCycle: BillingCycle = "monthly"
) {
  return planId === "free" ? "trial" : billingCycle;
}
```

---

## Step 6: Create Site Header `src/components/marketing/site-header.tsx`

**Action:** Create directory `src/components/marketing/` and file `site-header.tsx`:

```bash
mkdir -p src/components/marketing
```

```tsx
"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type SiteHeaderProps = {
  rightCtas?: boolean;
  showBackToHome?: boolean;
};

export function SiteHeader({
  rightCtas = true,
  showBackToHome,
}: SiteHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-200",
        isScrolled
          ? "bg-slate-50/90 shadow-sm backdrop-blur-md border-b border-slate-200/50"
          : "bg-transparent border-b border-transparent"
      )}
    >
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-4 md:px-8">
        {/* Logo - replace with your own logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold text-reply-navy">
            Reply Pulse
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav
          aria-label="Header"
          className="hidden items-center gap-8 text-[15px] font-medium text-slate-700 md:flex"
        >
          <Link
            href="/#features"
            className="transition-colors hover:text-reply-purple"
          >
            Features
          </Link>
          <Link
            href="/#pricing"
            className="transition-colors hover:text-reply-purple"
          >
            Pricing
          </Link>
          <Link
            href="/contact"
            className="transition-colors hover:text-reply-purple"
          >
            Contact
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          {showBackToHome ? (
            <Button
              asChild
              variant="ghost"
              className="hidden rounded-full font-medium text-slate-700 hover:bg-slate-200 hover:text-reply-purple md:inline-flex"
            >
              <Link href="/">Back to home</Link>
            </Button>
          ) : null}

          {rightCtas ? (
            <div className="hidden items-center gap-3 md:flex">
              <Button
                asChild
                variant="ghost"
                className="rounded-full font-medium text-slate-700 hover:bg-slate-200 hover:text-reply-purple"
              >
                <Link href="/auth/login">Login</Link>
              </Button>
              <Button
                asChild
                className="rounded-full bg-reply-purple text-slate-50 shadow-md shadow-reply-purple/20 transition-all hover:bg-reply-purple/90 hover:shadow-lg hover:shadow-reply-purple/30 px-6 font-semibold"
              >
                <Link href="/auth/signup">Start Your Free Trial</Link>
              </Button>
            </div>
          ) : null}

          {/* Mobile Menu Toggle */}
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-700 hover:bg-slate-200 md:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-6" />
              </Button>
            </DialogTrigger>

            <DialogContent className="left-auto right-0 top-0 h-svh w-[85vw] max-w-[400px] translate-x-0 translate-y-0 rounded-none border-l border-slate-200 bg-slate-50 p-6 shadow-2xl sm:max-w-[400px]">
              <DialogTitle className="sr-only">Menu</DialogTitle>
              <div className="flex flex-col h-full">
                <div className="mb-8">
                  <span className="text-xl font-bold text-reply-navy">
                    Reply Pulse
                  </span>
                </div>

                <nav className="flex flex-col gap-6 text-lg font-semibold text-slate-800">
                  <Link
                    href="/#features"
                    className="transition-colors hover:text-reply-purple"
                    onClick={() => setIsOpen(false)}
                  >
                    Features
                  </Link>
                  <Link
                    href="/#pricing"
                    className="transition-colors hover:text-reply-purple"
                    onClick={() => setIsOpen(false)}
                  >
                    Pricing
                  </Link>
                  <Link
                    href="/contact"
                    className="transition-colors hover:text-reply-purple"
                    onClick={() => setIsOpen(false)}
                  >
                    Contact
                  </Link>
                </nav>

                <div className="mt-auto flex flex-col gap-4 pt-8">
                  {rightCtas ? (
                    <>
                      <Button
                        asChild
                        variant="outline"
                        className="w-full rounded-full border-slate-300 bg-slate-50 py-6 text-base font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Link
                          href="/auth/login"
                          onClick={() => setIsOpen(false)}
                        >
                          Login
                        </Link>
                      </Button>
                      <Button
                        asChild
                        className="w-full rounded-full bg-reply-purple py-6 text-base font-bold text-slate-50 shadow-md shadow-reply-purple/20"
                      >
                        <Link
                          href="/auth/signup"
                          onClick={() => setIsOpen(false)}
                        >
                          Start Your Free Trial
                        </Link>
                      </Button>
                    </>
                  ) : (
                    <Button
                      asChild
                      variant="outline"
                      className="w-full rounded-full border-slate-300 bg-slate-50 py-6 text-base font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Link href="/" onClick={() => setIsOpen(false)}>
                        Back to home
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}
```

---

## Step 7: Create Site Footer `src/components/marketing/site-footer.tsx`

```tsx
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="relative border-t border-slate-200 bg-slate-50 pt-20 pb-10">
      <div className="mx-auto max-w-[1280px] px-6 md:px-8">
        <div className="grid gap-12 lg:grid-cols-5 lg:gap-8">
          <div className="lg:col-span-2">
            <Link href="/" className="inline-block">
              <span className="text-xl font-bold text-reply-navy">
                Reply Pulse
              </span>
            </Link>
            <p className="mt-6 max-w-sm text-base leading-relaxed text-slate-600">
              AI-powered review management for modern businesses. Reply faster,
              stay on brand, and keep customer communication consistent across
              every location.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900">
                Product
              </h3>
              <ul className="mt-6 space-y-4">
                <li>
                  <Link
                    href="/#features"
                    className="text-base font-medium text-slate-600 transition-colors hover:text-reply-purple"
                  >
                    Features
                  </Link>
                </li>
                <li>
                  <Link
                    href="/#pricing"
                    className="text-base font-medium text-slate-600 transition-colors hover:text-reply-purple"
                  >
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link
                    href="/auth/signup"
                    className="text-base font-medium text-slate-600 transition-colors hover:text-reply-purple"
                  >
                    Start Free Trial
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900">
                Company
              </h3>
              <ul className="mt-6 space-y-4">
                <li>
                  <Link
                    href="/about"
                    className="text-base font-medium text-slate-600 transition-colors hover:text-reply-purple"
                  >
                    About Us
                  </Link>
                </li>
                <li>
                  <Link
                    href="/contact"
                    className="text-base font-medium text-slate-600 transition-colors hover:text-reply-purple"
                  >
                    Contact Sales
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900">
                Legal
              </h3>
              <ul className="mt-6 space-y-4">
                <li>
                  <Link
                    href="/privacy"
                    className="text-base font-medium text-slate-600 transition-colors hover:text-reply-purple"
                  >
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="text-base font-medium text-slate-600 transition-colors hover:text-reply-purple"
                  >
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between border-t border-slate-200 pt-8 sm:flex-row">
          <p className="text-sm text-slate-500">
            &copy; {new Date().getFullYear()} Reply Pulse. All rights reserved.
          </p>
          <div className="mt-4 text-sm text-slate-500 sm:mt-0">
            Built for modern customer experience teams
          </div>
        </div>
      </div>
    </footer>
  );
}
```

---

## Step 8: Create Marketing Page Shell `src/components/marketing/marketing-page-shell.tsx`

```tsx
import React from "react";

import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { cn } from "@/lib/utils";

type MarketingPageShellProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  containerClassName?: string;
  showBackToHome?: boolean;
};

export function MarketingPageShell({
  title,
  description,
  children,
  containerClassName,
  showBackToHome = false,
}: MarketingPageShellProps) {
  return (
    <div className="relative min-h-svh overflow-hidden bg-white text-reply-navy">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-48 h-120 w-120 rounded-full bg-reply-purple/5 blur-3xl" />
        <div className="absolute -bottom-48 -right-40 h-128 w-lg rounded-full bg-reply-blue/5 blur-3xl" />
      </div>

      <SiteHeader showBackToHome={showBackToHome} />

      <main className="relative px-4 pb-16 pt-12 md:px-6">
        <div
          className={cn("mx-auto w-full", containerClassName ?? "max-w-3xl")}
        >
          <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm md:p-12">
            <div className="mb-10">
              <h1 className="text-balance text-3xl font-bold tracking-tight text-reply-navy md:text-5xl">
                {title}
              </h1>
              {description ? (
                <p className="mt-4 text-pretty text-lg text-reply-muted">
                  {description}
                </p>
              ) : null}
            </div>

            <div className="text-reply-navy/75">{children}</div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
```

---

## Step 9: Create Auth Page Shell `src/components/marketing/auth-page-shell.tsx`

```tsx
import React from "react";
import { Check, Sparkles } from "lucide-react";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { cn } from "@/lib/utils";

type AuthPageShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  benefits?: string[];
  className?: string;
};

export function AuthPageShell({
  title,
  subtitle,
  children,
  benefits,
  className,
}: AuthPageShellProps) {
  return (
    <div className="relative min-h-svh bg-white text-reply-navy">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10rem] top-[-12rem] h-[30rem] w-[30rem] rounded-full bg-reply-purple/5 blur-3xl" />
        <div className="absolute bottom-[-12rem] right-[-10rem] h-[32rem] w-[32rem] rounded-full bg-reply-blue/5 blur-3xl" />
      </div>

      <SiteHeader rightCtas={false} />

      <main className={cn("relative px-4 py-12 md:px-6", className)}>
        <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
          {/* Left side - Benefits (desktop only) */}
          <div className="hidden lg:block">
            <div className="rounded-3xl border border-gray-100 bg-white p-10 shadow-sm">
              <div className="inline-flex items-center gap-2 rounded-full border border-reply-purple/20 bg-reply-purple/5 px-3 py-1.5 text-xs font-medium text-reply-purple">
                <Sparkles className="size-3.5" />
                AI-powered review management
              </div>

              <h1 className="mt-6 text-balance text-4xl font-bold tracking-tight text-reply-navy">
                {title}
              </h1>
              <p className="mt-3 text-lg text-reply-muted">{subtitle}</p>

              {benefits?.length ? (
                <ul className="mt-8 space-y-4 text-sm font-medium text-reply-navy/80">
                  {benefits.map((b) => (
                    <li key={b} className="flex items-start gap-3">
                      <Check className="mt-0.5 size-4 flex-shrink-0 text-reply-green" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          {/* Right side - Form */}
          <div className="flex w-full justify-center lg:justify-end">
            {children}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
```

---

## Step 10: Create Landing Page `src/app/page.tsx`

**Action:** Replace the entire contents of the existing `src/app/page.tsx`:

```tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
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

import { createClient } from "@/lib/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

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

const featureCards = [
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

const showcaseStats = [
  { label: "Average response time", value: "< 5 min" },
  { label: "Locations managed", value: "Multi-site" },
  { label: "Reply consistency", value: "On-brand" },
  { label: "Review coverage", value: "Always on" },
];

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
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        router.push("/protected");
      }
    };

    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        router.push("/protected");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const currency = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }),
    []
  );

  const pricingPlans: PricingPlan[] = [
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

  const addOns: AddOn[] = [
    { credits: 50, price: 15 },
    { credits: 150, price: 39 },
    { credits: 400, price: 89 },
  ];

  return (
    <div className="relative min-h-svh overflow-hidden bg-[#f5f7fb] text-reply-navy">
      {/* Background gradients */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(circle_at_top,_rgba(88,125,254,0.18),_transparent_58%)]" />
        <div className="absolute left-[-10rem] top-24 h-80 w-80 rounded-full bg-reply-purple/10 blur-3xl" />
        <div className="absolute right-[-8rem] top-52 h-96 w-96 rounded-full bg-sky-300/20 blur-3xl" />
      </div>

      <SiteHeader />

      <main className="relative">
        {/* ──────────── HERO SECTION ──────────── */}
        <section className="px-4 pb-16 pt-10 md:px-6 md:pb-24 md:pt-14">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="max-w-2xl">
              <Badge className="rounded-full border border-white/70 bg-white/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-reply-purple shadow-sm backdrop-blur">
                Built for U.S. service businesses
              </Badge>

              <h1 className="mt-6 text-balance text-5xl font-semibold tracking-[-0.05em] text-slate-950 md:text-7xl">
                Reply to every Google review with speed and polish.
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 md:text-xl">
                Reply Pulse helps teams write faster, more consistent customer
                responses so your brand sounds sharp in every market.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  className="h-12 rounded-full bg-slate-950 px-7 text-white shadow-lg shadow-slate-900/15 hover:bg-slate-800"
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
                {showcaseStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-3xl border border-white/70 bg-white/80 px-4 py-5 shadow-sm backdrop-blur"
                  >
                    <div className="text-lg font-semibold text-slate-950">
                      {stat.value}
                    </div>
                    <div className="mt-1 text-sm leading-5 text-slate-500">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Hero mockup / product preview ── */}
            <div className="relative">
              <div className="absolute -left-6 top-10 hidden rounded-3xl border border-white/70 bg-white/85 p-4 shadow-lg backdrop-blur md:block">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <BadgeCheck className="size-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-950">
                      Review handled
                    </div>
                    <div className="text-sm text-slate-500">
                      Draft approved in 18 seconds
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/70 bg-slate-950 p-3 shadow-[0_40px_100px_-40px_rgba(15,23,42,0.55)]">
                <div className="overflow-hidden rounded-[1.4rem] bg-[#eef3ff]">
                  <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-5 py-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                        Reputation Command Center
                      </div>
                      <div className="mt-1 text-lg font-semibold text-slate-950">
                        Downtown Dental Group
                      </div>
                    </div>
                    <Badge className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 hover:bg-emerald-50">
                      Live queue
                    </Badge>
                  </div>

                  <div className="grid gap-4 p-5 lg:grid-cols-[0.78fr_1.22fr]">
                    <div className="space-y-4">
                      <div className="rounded-3xl bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-slate-500">
                              Reviews awaiting reply
                            </div>
                            <div className="mt-2 text-4xl font-semibold text-slate-950">
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

                      <div className="rounded-3xl bg-white p-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                            <Sparkles className="size-4" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-950">
                              Brand voice active
                            </div>
                            <div className="text-sm text-slate-500">
                              Professional, friendly, neighborhood-focused
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-3xl bg-white p-4 shadow-sm">
                        <div className="text-sm font-semibold text-slate-950">
                          Response coverage
                        </div>
                        <div className="mt-4 h-3 rounded-full bg-slate-100">
                          <div className="h-3 w-[84%] rounded-full bg-slate-950" />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                          <span>84% replied this month</span>
                          <span>Target: 90%</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[1.75rem] bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <MapPin className="size-4" />
                            Boston, MA
                          </div>
                          <div className="mt-2 text-xl font-semibold text-slate-950">
                            New 5-star review ready to send
                          </div>
                        </div>
                        <div className="flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
                          <Star className="size-4 fill-current" />
                          5.0
                        </div>
                      </div>

                      <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm leading-7 text-slate-700">
                          &ldquo;The front desk was welcoming, the dentist
                          explained everything clearly, and the office followed
                          up right away. Best dental experience I&apos;ve had in
                          years.&rdquo;
                        </p>
                      </div>

                      <div className="mt-5 rounded-3xl border border-blue-100 bg-blue-50/80 p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
                          <Bot className="size-4" />
                          Suggested reply
                        </div>
                        <p className="mt-3 text-sm leading-7 text-slate-700">
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
              <Badge className="rounded-full bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600 shadow-sm hover:bg-white">
                Why teams switch
              </Badge>
              <h2 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] text-slate-950 md:text-5xl">
                A cleaner workflow for customer-facing teams
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">
                Reply Pulse streamlines your review response process with
                AI-powered drafts, brand voice consistency, and multi-location
                management in one clean interface.
              </p>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {featureCards.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="rounded-[2rem] border border-white/70 bg-white p-7 shadow-sm shadow-slate-200/70 transition-transform duration-200 hover:-translate-y-1"
                  >
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
                      <Icon className="size-6" />
                    </div>
                    <h3 className="mt-6 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                      {feature.title}
                    </h3>
                    <p className="mt-3 text-base leading-7 text-slate-600">
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
            <div className="rounded-[2rem] border border-white/70 bg-white p-8 shadow-sm md:p-10">
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-700">
                <ShieldCheck className="size-4" />
                Built for trust
              </div>
              <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">
                Give operators confidence before they click send.
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">
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
                    <p className="text-base leading-7 text-slate-700">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-900 bg-slate-950 p-8 text-white shadow-2xl shadow-slate-900/15 md:p-10">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Sample workflow
                  </div>
                  <h3 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
                    Review triage without the clutter
                  </h3>
                </div>
                <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10">
                  <Zap className="size-5 text-cyan-300" />
                </div>
              </div>

              <div className="mt-8 space-y-4">
                {[
                  "1. New review enters the queue with star rating and location context.",
                  "2. AI drafts a reply using your saved voice and response style.",
                  "3. Your team approves, edits, or regenerates before publishing.",
                ].map((step) => (
                  <div
                    key={step}
                    className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-base leading-7 text-slate-200"
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
              <Badge className="rounded-full bg-slate-100 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-700 hover:bg-slate-100">
                Pricing
              </Badge>
              <h2 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] text-slate-950 md:text-5xl">
                Straightforward plans for growing teams
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">
                Start free, upgrade when you need more locations or more AI
                response volume.
              </p>

              <div className="mt-10 inline-flex rounded-full border border-slate-200 bg-slate-50 p-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={
                    billingCycle === "monthly"
                      ? "rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800"
                      : "rounded-full px-5 text-slate-600 hover:text-slate-950"
                  }
                  onClick={() => setBillingCycle("monthly")}
                >
                  Monthly
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={
                    billingCycle === "yearly"
                      ? "rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800"
                      : "rounded-full px-5 text-slate-600 hover:text-slate-950"
                  }
                  onClick={() => setBillingCycle("yearly")}
                >
                  Annual
                </Button>
              </div>
            </div>

            <div className="mt-14 grid gap-6 lg:grid-cols-4">
              {pricingPlans.map((plan) => {
                const isPopular = Boolean(plan.popular);
                const price =
                  billingCycle === "monthly"
                    ? plan.monthlyPrice ?? 0
                    : plan.yearlyPrice ?? 0;
                const period =
                  billingCycle === "monthly" ? "/month" : "/year";

                return (
                  <div
                    key={plan.name}
                    className={
                      isPopular
                        ? "relative rounded-[2rem] border border-slate-950 bg-slate-950 p-8 text-white shadow-2xl shadow-slate-900/15"
                        : "relative rounded-[2rem] border border-slate-200 bg-slate-50 p-8"
                    }
                  >
                    {isPopular ? (
                      <span className="absolute -top-3 left-6 rounded-full bg-cyan-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950">
                        Most popular
                      </span>
                    ) : null}

                    <div
                      className={
                        isPopular ? "text-slate-300" : "text-slate-500"
                      }
                    >
                      {plan.name}
                    </div>
                    <div className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
                      {plan.customPricing
                        ? "Custom"
                        : currency.format(price)}
                      {!plan.customPricing ? (
                        <span
                          className={
                            isPopular
                              ? "ml-2 text-base font-medium text-slate-400"
                              : "ml-2 text-base font-medium text-slate-500"
                          }
                        >
                          {period}
                        </span>
                      ) : null}
                    </div>
                    <p
                      className={
                        isPopular
                          ? "mt-4 text-sm leading-6 text-slate-300"
                          : "mt-4 text-sm leading-6 text-slate-600"
                      }
                    >
                      {plan.description}
                    </p>

                    <ul className="mt-8 space-y-4">
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex gap-3 text-sm leading-6"
                        >
                          <Check
                            className={
                              isPopular
                                ? "mt-1 size-4 flex-shrink-0 text-cyan-300"
                                : "mt-1 size-4 flex-shrink-0 text-emerald-600"
                            }
                          />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      className={
                        isPopular
                          ? "mt-8 h-11 w-full rounded-full bg-white text-slate-950 hover:bg-slate-100"
                          : "mt-8 h-11 w-full rounded-full bg-slate-950 text-white hover:bg-slate-800"
                      }
                      onClick={() =>
                        plan.customPricing
                          ? router.push("/contact")
                          : router.push("/auth/signup")
                      }
                    >
                      {plan.buttonText}
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Add-ons */}
            <div className="mt-12 rounded-[2rem] border border-slate-200 bg-slate-50 p-8 md:p-10">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <h3 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                    Need extra reply volume?
                  </h3>
                  <p className="mt-3 text-base leading-7 text-slate-600">
                    Add reply credits whenever your volume spikes. One-time
                    purchases, no subscription changes needed.
                  </p>
                </div>
                <Link
                  href="/contact"
                  className="inline-flex items-center text-sm font-semibold text-slate-950"
                >
                  Contact sales
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {addOns.map((addon) => (
                  <div
                    key={addon.credits}
                    className="rounded-3xl border border-white bg-white px-6 py-5 shadow-sm"
                  >
                    <div className="text-3xl font-semibold tracking-[-0.03em] text-slate-950">
                      {addon.credits}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      extra replies
                    </div>
                    <div className="mt-4 text-lg font-semibold text-reply-purple">
                      {currency.format(addon.price)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ──────────── BOTTOM CTA SECTION ──────────── */}
        <section className="px-4 py-24 md:px-6">
          <div className="mx-auto max-w-6xl rounded-[2.5rem] border border-white/70 bg-white px-8 py-14 text-center shadow-xl shadow-slate-200/60 md:px-16 md:py-20">
            <Badge className="rounded-full bg-slate-100 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-700 hover:bg-slate-100">
              Ready to launch
            </Badge>
            <h2 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-semibold tracking-[-0.04em] text-slate-950 md:text-6xl">
              Start managing reviews smarter today
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Reply Pulse keeps your brand consistent, your team fast, and your
              customers heard. No credit card required to start.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                size="lg"
                className="h-12 rounded-full bg-slate-950 px-7 text-white hover:bg-slate-800"
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
                <Link href="/contact">Talk to sales</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
```

---

## Step 11: Create Login Form `src/components/login-form.tsx`

```tsx
"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { AlertCircle, X } from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

interface UserNotFoundPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSignUp: () => void;
}

function UserNotFoundPopup({
  isOpen,
  onClose,
  onSignUp,
}: UserNotFoundPopupProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm mx-4 bg-white border border-gray-200 rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-reply-muted hover:text-reply-navy transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-orange-50 border border-orange-100 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-7 h-7 text-orange-500" />
          </div>

          <h3 className="text-xl font-bold text-reply-navy mb-2">
            Account Not Found
          </h3>
          <p className="text-reply-muted text-sm mb-2">
            It looks like you don&apos;t have an account yet.
          </p>
          <p className="text-reply-navy/80 text-xs mb-6 bg-reply-purple/5 p-3 rounded-xl border border-reply-purple/10">
            You need to sign up and choose a plan to get started with Reply
            Pulse.
          </p>

          <div className="flex flex-col gap-3 w-full">
            <Button
              onClick={onSignUp}
              className="w-full h-11 bg-reply-navy text-white font-semibold hover:bg-reply-navy/90 transition-all"
            >
              Create Account
            </Button>
            <button
              onClick={onClose}
              className="text-sm text-reply-muted hover:text-reply-navy transition-colors"
            >
              Try a different account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showNotFoundPopup, setShowNotFoundPopup] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "user_not_found") {
      setShowNotFoundPopup(true);
    } else if (errorParam) {
      const decodedError = decodeURIComponent(errorParam.replace(/\+/g, " "));

      const errorMessages: Record<string, string> = {
        session_failed:
          "Authentication session failed. Please try signing in again.",
        authentication_failed: "Authentication failed. Please try again.",
        access_denied: "Access was denied. Please try again.",
        invalid_request: "Invalid authentication request. Please try again.",
      };

      setError(errorMessages[errorParam] || decodedError);
    }
  }, [searchParams]);

  const handleGoogleSignInClick = async (e: React.FormEvent) => {
    e.preventDefault();

    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes:
            "https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) throw error;
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
      setIsLoading(false);
    }
  };

  const handleSignUpRedirect = () => {
    setShowNotFoundPopup(false);
    router.push("/auth/signup");
  };

  return (
    <>
      <UserNotFoundPopup
        isOpen={showNotFoundPopup}
        onClose={() => setShowNotFoundPopup(false)}
        onSignUp={handleSignUpRedirect}
      />

      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <div className="relative w-full max-w-md bg-white border border-gray-200 rounded-3xl shadow-xl p-8 md:p-10 animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex flex-col items-center mb-8">
            <h2 className="text-3xl font-bold text-reply-navy mb-2 text-center">
              Welcome Back
            </h2>
            <p className="text-reply-muted text-center">
              Sign in to your account to continue
            </p>
          </div>

          {/* Content */}
          <div className="space-y-6">
            <form onSubmit={handleGoogleSignInClick} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm text-center">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-reply-navy text-white hover:bg-reply-navy/90 font-semibold flex items-center justify-center gap-3 border-none transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {!isLoading && (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                )}
                {isLoading ? "Redirecting..." : "Continue with Google"}
              </Button>
            </form>

            <div className="pt-4 border-t border-gray-100">
              <p className="text-center text-sm text-reply-muted mb-3">
                Don&apos;t have an account?{" "}
                <Link
                  href="/auth/signup"
                  className="text-reply-purple hover:text-reply-purple/80 font-semibold transition-colors"
                >
                  Sign Up
                </Link>
              </p>
              <p className="text-center text-xs text-reply-muted/60">
                By continuing, you agree to Reply Pulse&apos;s{" "}
                <Link
                  href="/terms"
                  className="underline hover:text-reply-navy transition-colors"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  className="underline hover:text-reply-navy transition-colors"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
```

---

## Step 12: Create Signup Form `src/components/signup-form.tsx`

```tsx
"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { CheckCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  BillingCycle,
  PLAN_DEFINITIONS,
  getPlanPrice,
} from "@/lib/plan-config";

interface PlanOption {
  id: string;
  name: string;
  price: number | null;
  period: string;
  features: string[];
  popular: boolean;
  maxLocations: number;
  buttonText: string;
  trialInfo?: string;
}

export function SignupForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const searchParams = useSearchParams();
  const isUnregistered = searchParams.get("unregistered") === "true";
  const [error, setError] = useState<string | null>(
    isUnregistered
      ? "It looks like you haven't selected a plan yet. Please pick one below to finish setting up your account."
      : null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");

  const plans: PlanOption[] = [
    {
      id: PLAN_DEFINITIONS.free.id,
      name: PLAN_DEFINITIONS.free.shortName,
      price: 0,
      period: "",
      trialInfo: PLAN_DEFINITIONS.free.trialInfo,
      features: PLAN_DEFINITIONS.free.signupFeatures,
      popular: false,
      maxLocations: PLAN_DEFINITIONS.free.maxLocations,
      buttonText: "Start Free",
    },
    {
      id: PLAN_DEFINITIONS.starter.id,
      name: PLAN_DEFINITIONS.starter.name,
      price: getPlanPrice("starter", billingCycle),
      period: billingCycle === "monthly" ? "/mo" : "/yr",
      features: PLAN_DEFINITIONS.starter.signupFeatures,
      popular: PLAN_DEFINITIONS.starter.popular ?? false,
      maxLocations: PLAN_DEFINITIONS.starter.maxLocations,
      buttonText: "Select Basic",
    },
    {
      id: PLAN_DEFINITIONS.growth.id,
      name: PLAN_DEFINITIONS.growth.name,
      price: getPlanPrice("growth", billingCycle),
      period: billingCycle === "monthly" ? "/mo" : "/yr",
      features: PLAN_DEFINITIONS.growth.signupFeatures,
      popular: PLAN_DEFINITIONS.growth.popular ?? false,
      maxLocations: PLAN_DEFINITIONS.growth.maxLocations,
      buttonText: "Select Pro",
    },
    {
      id: PLAN_DEFINITIONS.agency.id,
      name: PLAN_DEFINITIONS.agency.name,
      price: null,
      period: "",
      features: PLAN_DEFINITIONS.agency.signupFeatures,
      popular: false,
      maxLocations: PLAN_DEFINITIONS.agency.maxLocations,
      buttonText: "Contact Sales",
    },
  ];

  const handleGoogleSignup = async () => {
    if (!selectedPlan) {
      setError("Please select a plan to continue");
      return;
    }

    if (selectedPlan === "agency") {
      window.location.href =
        "mailto:sales@replypulse.com?subject=Agency%20Plan%20Inquiry";
      return;
    }

    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    const selectedPlanData = plans.find((p) => p.id === selectedPlan);

    try {
      const cookieResponse = await fetch("/api/auth/set-signup-cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selectedPlan,
          billing: billingCycle,
          maxLocations: selectedPlanData?.maxLocations || 1,
        }),
      });

      if (!cookieResponse.ok) {
        throw new Error("Failed to store signup data");
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes:
            "https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) throw error;
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
      setIsLoading(false);
    }
  };

  return (
    <div
      className={cn("flex flex-col items-center gap-8", className)}
      {...props}
    >
      {/* Billing Toggle */}
      <div className="inline-flex items-center p-1.5 bg-gray-50 rounded-2xl border border-gray-200 shadow-sm">
        <button
          onClick={() => setBillingCycle("monthly")}
          className={cn(
            "px-5 py-2 rounded-xl text-sm font-medium transition-all",
            billingCycle === "monthly"
              ? "bg-reply-navy text-white shadow-sm"
              : "text-reply-navy/60 hover:text-reply-navy"
          )}
        >
          Monthly
        </button>
        <button
          onClick={() => setBillingCycle("yearly")}
          className={cn(
            "px-5 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2",
            billingCycle === "yearly"
              ? "bg-reply-navy text-white shadow-sm"
              : "text-reply-navy/60 hover:text-reply-navy"
          )}
        >
          Yearly
          <span className="text-xs bg-reply-green text-white px-2 py-0.5 rounded-full font-bold">
            -17%
          </span>
        </button>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 w-full">
        {plans.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          return (
            <div
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              className={cn(
                "relative flex flex-col rounded-[2rem] p-6 cursor-pointer transition-all duration-200 border-2",
                isSelected
                  ? "border-reply-purple bg-reply-purple/5 scale-[1.02] shadow-lg shadow-reply-purple/10"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md",
                plan.popular && !isSelected && "border-reply-purple/40"
              )}
            >
              {/* Badge */}
              {(plan.popular || plan.trialInfo) && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span
                    className={cn(
                      "px-3 py-1 text-xs font-bold rounded-full whitespace-nowrap shadow-sm",
                      plan.popular
                        ? "bg-reply-purple text-white"
                        : "bg-reply-green text-white"
                    )}
                  >
                    {plan.popular ? "Most Popular" : plan.trialInfo}
                  </span>
                </div>
              )}

              {/* Selection indicator */}
              {isSelected && (
                <div className="absolute top-4 right-4">
                  <div className="w-5 h-5 bg-reply-purple rounded-full flex items-center justify-center">
                    <CheckCircle className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
              )}

              {/* Plan name & price */}
              <div className="text-center pt-2 mb-4">
                <h3 className="text-base font-bold text-reply-navy mb-2">
                  {plan.name}
                </h3>
                <div className="flex items-baseline justify-center gap-1">
                  {plan.price !== null ? (
                    <>
                      <span className="text-3xl font-bold text-reply-navy">
                        {plan.price === 0
                          ? "$0"
                          : `$${plan.price.toLocaleString("en-US")}`}
                      </span>
                      {plan.period && (
                        <span className="text-sm text-reply-muted">
                          {plan.period}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-3xl font-bold text-reply-navy">
                      Custom
                    </span>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-gray-100 mb-4" />

              {/* Features */}
              <ul className="flex-1 space-y-3 mb-5">
                {plan.features.map((feature, j) => (
                  <li
                    key={j}
                    className="flex items-start gap-2 text-sm text-reply-navy/75"
                  >
                    <CheckCircle className="w-4 h-4 text-reply-green shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {/* Select button */}
              <button
                className={cn(
                  "w-full py-2.5 rounded-xl text-sm font-semibold transition-all",
                  isSelected
                    ? "bg-reply-purple text-white"
                    : "bg-gray-50 text-reply-navy/80 hover:bg-gray-100 border border-gray-200"
                )}
              >
                {isSelected ? "Selected" : plan.buttonText}
              </button>
            </div>
          );
        })}
      </div>

      {/* Error Message */}
      {error && (
        <div className="w-full max-w-md p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm text-center">
          {error}
        </div>
      )}

      {/* Sign Up CTA */}
      <div className="w-full max-w-md mx-auto flex flex-col items-center gap-4">
        <Button
          onClick={handleGoogleSignup}
          disabled={isLoading || !selectedPlan}
          className={cn(
            "w-full h-12 font-semibold flex items-center justify-center gap-3 rounded-xl transition-all",
            selectedPlan
              ? "bg-reply-navy text-white hover:bg-reply-navy/90 hover:scale-[1.01] active:scale-[0.99]"
              : "bg-gray-100 text-reply-muted cursor-not-allowed"
          )}
        >
          {!isLoading && selectedPlan && (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          )}
          {isLoading
            ? "Connecting to Google..."
            : selectedPlan
              ? "Continue with Google"
              : "Select a plan to continue"}
        </Button>

        <div className="flex items-center gap-2 text-xs text-reply-muted">
          <Sparkles className="w-3 h-3 text-reply-purple" />
          <span>Connects securely to your Google Business Profile</span>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center space-y-2 pt-2">
        <p className="text-sm text-reply-muted">
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="text-reply-purple hover:text-reply-purple/80 font-semibold transition-colors"
          >
            Sign In
          </Link>
        </p>
        <p className="text-xs text-reply-muted/60">
          By signing up, you agree to Reply Pulse&apos;s{" "}
          <Link
            href="/terms"
            className="underline hover:text-reply-navy transition-colors"
          >
            Terms
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="underline hover:text-reply-navy transition-colors"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
```

---

## Step 13: Create Login Page `src/app/auth/login/page.tsx`

**Action:** Create directories and file:

```bash
mkdir -p src/app/auth/login
```

```tsx
import { LoginForm } from "@/components/login-form";
import { AuthPageShell } from "@/components/marketing/auth-page-shell";
import { Suspense } from "react";

export default function Page() {
  return (
    <AuthPageShell
      title="Welcome back"
      subtitle="Sign in to your account to continue."
      benefits={[
        "No credit card required to start",
        "Connect Google Business Profile securely",
        "Generate on-brand replies in seconds",
      ]}
    >
      <div className="w-full max-w-md">
        <Suspense
          fallback={
            <div className="text-center text-reply-navy">Loading...</div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </AuthPageShell>
  );
}
```

---

## Step 14: Create Signup Page `src/app/auth/signup/page.tsx`

```bash
mkdir -p src/app/auth/signup
```

```tsx
import { SignupForm } from "@/components/signup-form";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Sparkles, Check } from "lucide-react";
import { Suspense } from "react";
import { FREE_TRIAL_DAYS } from "@/lib/plan-config";

export default function Page() {
  return (
    <div className="relative min-h-svh overflow-hidden bg-white text-reply-navy">
      {/* Background blurs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10rem] top-[-12rem] h-[30rem] w-[30rem] rounded-full bg-reply-purple/5 blur-3xl" />
        <div className="absolute bottom-[-12rem] right-[-10rem] h-[32rem] w-[32rem] rounded-full bg-reply-blue/5 blur-3xl" />
      </div>

      <SiteHeader rightCtas={false} />

      <main className="relative px-4 py-10 md:px-6 md:py-14">
        <div className="mx-auto max-w-5xl">
          {/* Hero Section */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-reply-purple/20 bg-reply-purple/5 px-4 py-1.5 text-xs font-medium text-reply-purple mb-5">
              <Sparkles className="size-3.5" />
              AI-powered review management
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-reply-navy mb-3">
              Get started
            </h1>
            <p className="text-lg text-reply-muted max-w-xl mx-auto">
              Choose a plan and start replying to reviews with confidence.
            </p>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mt-6 text-sm text-reply-muted">
              {[
                `Start free with a ${FREE_TRIAL_DAYS}-day trial`,
                "Cancel anytime, no long-term contracts",
                "Built for multi-location teams",
              ].map((b) => (
                <span key={b} className="flex items-center gap-1.5">
                  <Check className="size-4 text-reply-green shrink-0" />
                  {b}
                </span>
              ))}
            </div>
          </div>

          {/* Signup Form */}
          <Suspense
            fallback={
              <div className="text-center text-reply-navy">Loading...</div>
            }
          >
            <SignupForm />
          </Suspense>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
```

---

## Step 15: Create Auth Callback `src/app/auth/callback/route.ts`

```bash
mkdir -p src/app/auth/callback
```

```ts
import { createClient } from "@/lib/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  BillingCycle,
  createPlanDates,
  getPlanLocationLimit,
  getStoredBillingCycle,
} from "@/lib/plan-config";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const error_description = searchParams.get("error_description");
  const next = searchParams.get("next") ?? "/protected";

  // Get proper origin from headers
  const protocol = request.headers.get("x-forwarded-proto") || "http";
  const host = request.headers.get("host") || "localhost:3000";
  const origin = `${protocol}://${host}`;

  // Handle OAuth errors from provider
  if (error) {
    console.error("OAuth Provider Error:", error, error_description);
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(error_description || error)}`
    );
  }

  if (code) {
    const supabase = await createClient();

    // Exchange the code for a session
    const { data, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError || !data.session) {
      console.error("Code exchange error:", exchangeError);
      const errorMsg = exchangeError?.message || "authentication_failed";
      return NextResponse.redirect(
        `${origin}/auth/login?error=${encodeURIComponent(errorMsg)}`
      );
    }

    const user = data.session.user;

    try {
      // Check if user has a subscription
      const { data: subscriptionData, error: subError } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("user_id", user.id)
        .single();

      const isRegisteredUser = !!subscriptionData && !subError;

      // Check for pending signup data in cookies
      const pendingSignup = request.cookies.get("pending_signup")?.value;
      let isSignup = false;
      let signupData: {
        plan?: string;
        billing?: string;
        maxLocations?: number;
      } = {};

      if (pendingSignup) {
        try {
          const parsed = JSON.parse(pendingSignup);
          if (
            parsed.timestamp &&
            Date.now() - parsed.timestamp < 10 * 60 * 1000
          ) {
            isSignup = parsed.isSignup === true;
            signupData = {
              plan: parsed.plan || "free",
              billing: parsed.billing || "monthly",
              maxLocations: parsed.maxLocations || 1,
            };
          }
        } catch (e) {
          console.error("Error parsing signup data:", e);
        }
      }

      if (isSignup) {
        if (isRegisteredUser) {
          const response = NextResponse.redirect(`${origin}/protected`);
          response.cookies.delete("pending_signup");
          return response;
        } else {
          // New user - create subscription
          const planType = signupData.plan || "free";
          const billingCycle = signupData.billing || "monthly";
          const maxLocations =
            signupData.maxLocations || getPlanLocationLimit(planType);
          const planStatus = planType === "free" ? "trial" : "active";

          const { startDate, endDate } = createPlanDates(
            planType,
            billingCycle as BillingCycle
          );

          const { error: insertError } = await supabase
            .from("subscription_plans")
            .insert({
              user_id: user.id,
              email: user.email,
              plan_type: planType,
              max_locations: maxLocations,
              billing_cycle: getStoredBillingCycle(
                planType,
                billingCycle as BillingCycle
              ),
              status: planStatus,
              current_period_start: startDate.toISOString(),
              current_period_end: endDate.toISOString(),
            });

          if (insertError) {
            console.error("Error creating subscription:", insertError);
            return NextResponse.redirect(
              `${origin}/auth/signup?error=create_failed`
            );
          }

          const response = NextResponse.redirect(
            `${origin}/protected?welcome=true&plan=${planType}`
          );
          response.cookies.delete("pending_signup");
          return response;
        }
      } else {
        // User came from login
        if (!isRegisteredUser) {
          // Auto-create free trial
          const { startDate, endDate } = createPlanDates("free");

          const { error: insertError } = await supabase
            .from("subscription_plans")
            .insert({
              user_id: user.id,
              email: user.email,
              plan_type: "free",
              max_locations: getPlanLocationLimit("free"),
              billing_cycle: getStoredBillingCycle("free"),
              status: "trial",
              current_period_start: startDate.toISOString(),
              current_period_end: endDate.toISOString(),
            });

          if (insertError) {
            console.error("Error creating trial subscription:", insertError);
            const response = NextResponse.redirect(
              `${origin}/auth/signup?unregistered=true&email=${encodeURIComponent(user.email || "")}`
            );
            response.cookies.delete("pending_signup");
            return response;
          }

          const response = NextResponse.redirect(
            `${origin}/protected?welcome=true&plan=free`
          );
          response.cookies.delete("pending_signup");
          return response;
        } else {
          const response = NextResponse.redirect(`${origin}${next}`);
          response.cookies.delete("pending_signup");
          return response;
        }
      }
    } catch (error) {
      console.error("API error:", error);
      return NextResponse.redirect(
        `${origin}/auth/login?error=server_error`
      );
    }
  }

  // No code parameter found
  return NextResponse.redirect(`${origin}/auth/login?error=no_code`);
}
```

---

## Step 16: Create Signup Cookie API Route `src/app/api/auth/set-signup-cookie/route.ts`

```bash
mkdir -p src/app/api/auth/set-signup-cookie
```

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { plan, billing, maxLocations } = body;

    const signupData = JSON.stringify({
      isSignup: true,
      plan: plan || "free",
      billing: billing || "monthly",
      maxLocations: maxLocations || 1,
      timestamp: Date.now(),
    });

    const response = NextResponse.json({ success: true });

    response.cookies.set("pending_signup", signupData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Failed to set signup cookie" },
      { status: 500 }
    );
  }
}
```

---

## Directory Structure After Implementation

```
src/
├── app/
│   ├── api/
│   │   └── auth/
│   │       └── set-signup-cookie/
│   │           └── route.ts          ← Step 16
│   ├── auth/
│   │   ├── callback/
│   │   │   └── route.ts             ← Step 15
│   │   ├── login/
│   │   │   └── page.tsx             ← Step 13
│   │   └── signup/
│   │       └── page.tsx             ← Step 14
│   ├── globals.css                  ← Step 1 (edit)
│   ├── layout.tsx                   ← Step 2 (edit)
│   ├── page.tsx                     ← Step 10 (replace)
│   └── favicon.ico
├── components/
│   ├── marketing/
│   │   ├── site-header.tsx          ← Step 6
│   │   ├── site-footer.tsx          ← Step 7
│   │   ├── marketing-page-shell.tsx ← Step 8
│   │   └── auth-page-shell.tsx      ← Step 9
│   ├── ui/                          ← Already exists (shadcn)
│   ├── login-form.tsx               ← Step 11
│   └── signup-form.tsx              ← Step 12
└── lib/
    ├── client.ts                    ← Step 3
    ├── server.ts                    ← Step 4
    ├── plan-config.ts               ← Step 5
    └── utils.ts                     ← Already exists (shadcn)
```

---

## Environment Variables Required

Create/update `.env.local` in the `frontend/` root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Backend API
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000

# Google OAuth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Verify Build

After creating all files, run:

```bash
cd frontend
npm run build
```

Fix any TypeScript errors that appear. Common issues:
- Missing `@supabase/ssr` import → already installed
- Missing `lucide-react` icons → already installed
- Missing directories → create with `mkdir -p`

---

## Pages Summary

| URL | Page | Description |
|-----|------|-------------|
| `/` | Landing Page | Hero + Features + Pricing + CTA |
| `/auth/login` | Login | Google OAuth sign-in |
| `/auth/signup` | Signup | Plan selection + Google OAuth |
| `/auth/callback` | Callback | OAuth code exchange (server route) |
| `/about` | About | Future - use MarketingPageShell |
| `/contact` | Contact | Future - use MarketingPageShell |
| `/privacy` | Privacy | Future - use MarketingPageShell |
| `/terms` | Terms | Future - use MarketingPageShell |
