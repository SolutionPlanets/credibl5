
# **Reply Pulse \- Tech Stack & Services**

**Frontend:**  React, Tailwind   
**Backend:** FastAPI (Python)  
**Database:** Supabase PostgreSQL  
**Authentication:** Supabase Auth  
**AI Service:** Google Gemini 1.5 Flash  
**Payments:** —-----------  
**Scheduled Tasks:** cron-job.org  
**Hosting :** )\\Vercel (UI) & Render/Railway (API)

**Detailed Breakdown:**

| Choice | Details |
| :---- | :---- |
| **Framework** | **Next.js 16** (App Router) |
| **Language** | TypeScript |
| **UI Library** | React 19 |
| **Styling** | Tailwind CSS 4 |
| **Components** | Radix UI (headless, accessible) |
| **State Management** | TanStack React Query v5 |
| **Charts** | Recharts (adding) |
| **Hosting** | **Vercel** (free tier) |

###   **Database**

| Choice | Details |
| :---- | :---- |
| **Database** | **Supabase PostgreSQL** (free tier) |
| **Free Limits** | 500MB storage, 2 projects, unlimited API requests |
| **Capacity** | Handles \~2,500 users / \~200k reviews before hitting 500MB |

## **Architecture Diagram**

User Browser  
    │  
    ▼  
Vercel (Next.js 16\)  
├── SSR Pages (React 19 \+ Tailwind 4\)  
└── Client API Calls (TanStack Query)  
    │  
    ▼  
Render / Railway (FastAPI Python Backend)  
├── Auth ──► Supabase Auth (Google OAuth \+ PKCE)  
├── DB ────► Supabase PostgreSQL (RLS)  
├── AI ────► Google Gemini 1.5 Flash  
└── Pay ───► Razorpay

cron-job.org ──► /api/cron/sync (daily review sync)  
               ► /api/cron/ping (keep DB alive)

## **Key Decisions Summary**

1. **Supabase** (Auth + DB + Storage) — already integrated across 30+ files, free tier covers our scale.
2. **FastAPI (Python) Backend** — handles AI prompt building, GMB sync, and payment verification.
3. **Gemini Flash** — free tier gives 1,500 req/day, enough for 500 users.
4. **cron-job.org** — free cron to prevent DB pause and schedule syncs.
5. **Split Hosting** — Vercel for frontend, Render/Railway for Python backend.

# **Project Timeline**  **Current Status Overview**

| Epic | Status | Remaining Work |
| :---- | :---- | :---- |
| 1\. Project Foundation | \~70% done | Error monitoring, domain routing, and logging |
| 2\. Authentication | **100% done** |  Auth by Google |
| 3\. Onboarding | **Redesign again** | UI redesign (3-step white theme) |
| 4\. Landing Page | **Redesign again** | Minor polish |
| 5\. Subscription & Billing | **Redesign again US-based** | \- |
| 6\. Google Business Profile | **100% done** | \- |
| 7\. Reviews UI | **100% done** | \- |
| 8\. Brand Setup & Templates | **100% done** | \- |
| 9\. AI Reply Generation | **100% done** | \- |
| 10\. Publish to Google | **100% done** | \- |
| 11\. Reports | **Not started** | Full build |
| 12\. Auto Reply | \~80% done | Cron deployment \+ email flow |
| 13\. Admin & Observability | **Not started** | Full build |
| **UI Redesign** (new) | **Not started** | Full redesign (Reviewflowz style) |

#    **Timeline**

#### **Epic 1: Project Foundation (remaining work)**

| \# | Task | Est | Status |
| :---- | :---- | :---- | :---- |
| 1.1 | Set up frontend and backend repositories or monorepo | \- | DONE |
| 1.2 | Configure environments for local, staging, production | \- | DONE |
| 1.3 | Set up domain/subdomain routing (www vs app) | 4  hrs | TODO |
| 1.4 | Set up base database migrations | \- | DONE |
| 1.5 | Add logging and error monitoring (Sentry) | 5 hrs | TODO |

**Subtotal: 9 hrs (\~1 to 1.5 days)**

#### **UI Redesign Phase 1: Design System + Navigation**

| \# | Task | Est | Status |
| :---- | :---- | :---- | :---- |
| R.1 | Add Reviewflowz colour tokens to globals.css | 1 hr | TODO |
| R.2 | Install the recharts dependency | 0.5 hr | TODO |
| R.3 | Restructure sidebar navigation (grouped sections, badges) | 4 hrs | TODO |
| R.4 | Restyle navigation CSS (orange/red active states, dividers) | 3 hrs | TODO |
| R.5 | Create the Supabase user\_onboarding table migration | 1 hr | TODO |

**Subtotal: 9.5 hrs (\~1.5 \- 2  days)**

#### **Onboarding Rewrite**

| \# | Task | Est | Status |
| :---- | :---- | :---- | :---- |
| R.6 | Rewrite onboarding wizard (7-step → 3-step, white theme) | 6 hrs | TODO |
| R.7 | Restyle onboarding CSS (dark → white) | 3 hrs | TODO |
| R.8 | Create onboarding API route (/api/onboarding/save) | 2 hrs | TODO |
| R.9 | Add useOnboardingStatus hook | 1 hr | TODO |

**Subtotal: 12 hrs (\~2 days)**

**Week 1 Total: \~30.5 hrs (9 + 9.5 + 12) (5 days)**

### **Dashboard Redesign \+ New Components** **UI Redesign Phase 2: Dashboard**

| \# | Task | Est | Status |
| :---- | :---- | :---- | :---- |
| R.10 | Build DashboardHeader component | 2 hrs | TODO |
| R.11 | Build DashboardStatsGrid component (4 stat cards) | 3 hrs | TODO |
| R.12 | Build RatingSimulator component (3 interactive sliders) | 6 hrs | TODO |
| R.13 | Build ReviewVelocityChart component (recharts) | 5 hrs | TODO |
| R.14 | Rewrite dashboard page layout (integrate new components) | 5 hrs | TODO |
| R.15 | Restyle existing dashboard sections (white theme) | 3 hrs | TODO |
| R.16 | Mobile responsive testing \+ fixes for dashboard | 3 hrs | TODO |

**Subtotal: 27 hrs (\~4.5 days)**

| \# | Task | Est | Status |
| :---- | :---- | :---- | :---- |
| R.17 | Polish onboarding ↔ dashboard redirect flow | 2 hrs | TODO |

**Subtotal: 2 hrs**

**Week 2 Total: \~29 hrs (27 + 2) (5 days)**

### **New Pages \+ Reports**  **Epic 11: Reports (new build)**

| \# | Task | Est | Status |
| :---- | :---- | :---- | :---- |
| 11.1 | Build Reports page with full width ReviewVelocityChart | 4 hrs | TODO |
| 11.2 | Add full-width RatingSimulator to Reports | 2 hrs | TODO |
| 11.3 | Aggregate monthly review counts | 2 hrs | TODO |
| 11.4 | Aggregate average rating trends | 2 hrs | TODO |
| 11.5 | Aggregate sentiment distribution | 2 hrs | TODO |
| 11.6 | Count AI-generated responses | 1 hr | TODO |
| 11.7 | Time period selector (7d, 30d, 90d, all) | 2 hrs | TODO |

**Subtotal: 15 hrs (\~2.5 days)**

#### **New Pages (from UI redesign)**

| \# | Task | Est | Status |
| :---- | :---- | :---- | :---- |
| R.18 | Build Review Profiles page (filter, sort, profile cards) | 5 hrs | TODO |
| R.19 | Build Integrations page (Radix Tabs, connected accounts) | 5 hrs | TODO |
| R.20 | Cross-page testing \+ navigation verification | 3 hrs | TODO |

**Subtotal: 13 hrs (\~2 days)**

**Week 3 Total: \~28 hrs (15 + 13) (5 days)**

### **Auto Reply Completion \+ Admin** **Epic 12: Auto Reply (remaining work)**

| \# | Task | Est | Status |
| :---- | :---- | :---- | :---- |
| 12.1 | Auto reply toggle per location | \- | DONE |
| 12.2 | Scheduled polling for new reviews (cron endpoint) | \- | DONE (logic exists) |
| 12.3 | Create event records for new reviews | 2 hrs | TODO |
| 12.4 | Generate AI draft automatically | \- | DONE |
| 12.5 | Send approval email with secure action link | 6 hrs | TODO |
| 12.6 | Handle approve/skip actions via email links | 4 hrs | TODO |
| 12.7 | Publish approved response automatically | 2 hrs | TODO |
| 12.8 | Set up cron-job.org scheduler (ping \+ review sync \+ auto-reply) | 2 hrs | TODO |
| 12.9 | Failure logging and retry on auto-reply errors | 3 hrs | TODO |

**Subtotal: 19 hrs (\~3 days)**

#### **Epic 13: Admin & Observability (new build)**

| \# | Task | Est | Status |
| :---- | :---- | :---- | :---- |
| 13.1 | Build sync/audit status view (admin page or endpoint) | 4 hrs | TODO |
| 13.2 | Log external API failures (GMB, Gemini, Razorpay) | 3 hrs | TODO |
| 13.3 | Log webhook failures | 2 hrs | TODO |
| 13.4 | Add retry support for failed sync jobs | 3 hrs | TODO |

**Subtotal: 12 hrs (\~2 days)**

**Week 4 Total: \~31 hrs (19 + 12) (5 days)**

### **Week 5 — Polish, Testing & Deployment (Days 21-25)**

| \# | Task | Est | Status |
| :---- | :---- | :---- | :---- |
| P.1 | Full mobile responsive audit (all pages) | 4 hrs | TODO |
| P.2 | Cross-browser testing (Chrome, Safari, Firefox, Edge) | 3 hrs | TODO |
| P.3 | Fix all TypeScript / build errors (npm run build) | 3 hrs | TODO |
| P.4 | Run and fix existing tests (npm test) | 2 hrs | TODO |
| P.5 | End-to-end testing: signup → onboarding → connect Google → reviews → reply → publish | 4 hrs | TODO |
| P.6 | Test subscription flow: trial → upgrade → credits | 2 hrs | TODO |
| P.7 | Test auto-reply flow: new review → email → approve → publish | 3 hrs | TODO |
| P.8 | Performance audit (Lighthouse, bundle size) | 2 hrs | TODO |
| P.9 | Security audit (env vars, RLS policies, API auth) | 3 hrs | TODO |
| P.10 | Production deployment to Vercel | 2 hrs | TODO |
| P.11 | Set up cron-job.org in production | 1 hr | TODO |
| P.12 | DNS \+ domain configuration (www \+ app) | 2 hrs | TODO |
| P.13 | Final smoke test on production | 2 hrs | TODO |

**Week 5 Total: \~33 hrs (5 days)**

## **Summary Calendar**

| Week | Focus | Hours |
| :---- | :---- | :---- |
| Week 1 (Days 1-5) | Foundation gaps + Design system + Nav + Onboarding redesign | 30.5 hrs |
| Week 2 (Days 6-10) | Dashboard redesign (all new components + layout) | 29 hrs |
| Week 3 (Days 11-15) | Reports page + Review Profiles + Integrations page | 28 hrs |
| Week 4 (Days 16-20) | Auto Reply email flow + Admin/Observability | 31 hrs |
| Week 5 (Days 21-25) | Polish, testing, deployment | 33 hrs |
| **Total** | | **151.5 hrs** |

**Total estimated: \~25 working days (5 weeks)**

## **Epic-by-Epic Summary**

| Epic | Total Est | Already Done | Remaining |
| :---- | :---- | :---- | :---- |
| 1\. Project Foundation | 17 hrs | 8 hrs | **9 hrs** |
| 2\. Authentication | 16 hrs | 16 hrs | **0 hrs** |
| 3\. Onboarding & Account Setup | 18 hrs | 6 hrs | **12 hrs** (redesign) |
| 4\. Landing Page | 12 hrs | 12 hrs | **0 hrs** |
| 5\. Subscription & Billing | 16 hrs | 16 hrs | **0 hrs** |
| 6\. Google Business Profile | 20 hrs | 20 hrs | **0 hrs** |
| 7\. Reviews UI & Management | 20 hrs | 20 hrs | **0 hrs** |
| 8\. Brand Setup & Templates | 14 hrs | 14 hrs | **0 hrs** |
| 9\. AI Reply Generation | 16 hrs | 16 hrs | **0 hrs** |
| 10\. Publish to Google | 8 hrs | 8 hrs | **0 hrs** |
| 11\. Reports | 15 hrs | 0 hrs | **15 hrs** |
| 12\. Auto Reply | 25 hrs | 6 hrs | **19 hrs** |
| 13\. Admin & Observability | 12 hrs | 0 hrs | **12 hrs** |
| UI Redesign (nav, dashboard, pages) | 51.5 hrs | 0 hrs | **51.5 hrs** |
| Polish & Deployment | 33 hrs | 0 hrs | **33 hrs** |
| **TOTAL** | **293.5 hrs** | **142 hrs** | **~151.5 hrs** |

## **What's Already Complete (No Work Needed)**

No development time needed for these:

* **Epic 2: Authentication** — Google OAuth, session handling, protected routes
* **Epic 4: Landing Page** — Hero, features, pricing, CTAs
* **Epic 5: Subscription & Billing** — Razorpay checkout, plan gating, credits
* **Epic 6: Google Business Profile** — OAuth, token storage, location sync
* **Epic 7: Reviews UI** — Filters, pagination, reply status, bulk reply
* **Epic 8: Brand Setup & Templates** — CRUD for both, category selection
* **Epic 9: AI Reply Generation** — Gemini integration, drafts, credit tracking
* **Epic 10: Publish to Google** — Reply endpoint, status updates

## **CSV Task Adjustments**

| CSV Says | Actual For This Project |
| :---- | :---- |
| "Implement email/password auth" | Skipped — Google OAuth only |
| "Password reset flow" | Skipped — no passwords (Google OAuth) |
| "Create Stripe products/prices" | Changed to Razorpay, already done |
| "Handle webhooks" (Stripe) | Changed to Razorpay verify, already done |
| "Build onboarding UI" | Redesign — simplifying from 7-step to 3-step |
| "Reports tab" | New build needed |
| "Send approval email" (Auto Reply) | Backend logic exists, email flow missing |
| "Admin and observability" | New build needed |

## **Risk Factors**

| Risk | Impact | Mitigation |
| :---- | :---- | :---- |
| Recharts learning curve | +1-2 days on chart work | Stick to basic BarChart/LineChart |
| Auto-reply email delivery | +1-2 days if email setup needed | Use Resend free tier |
| Google API rate limits | Can block sync testing | Use cached test data |
| RLS policy issues on new tables | +0.5 day debugging | Test policies right after migration |
| Mobile responsive edge cases | +1-2 days | Desktop first, fix mobile in Week 5 |

## **MVP Build Order (from CSV, validated)**

Build order:

1. \~\~Auth\~\~ ✅ Done  
2. \~\~Onboarding\~\~ ✅ Done (redesign in Week 1\)  
3. \~\~Razorpay trial/basic/pro setup\~\~ ✅ Done  
4. \~\~Google connection and location sync\~\~ ✅ Done  
5. \~\~Review listing\~\~ ✅ Done  
6. \~\~Brand settings \+ templates\~\~ ✅ Done  
7. \~\~AI generate reply\~\~ ✅ Done  
8. \~\~Manual publish\~\~ ✅ Done  
9. **Reports** → Week 3  
10. **Auto Reply approval workflow** → Week 4

Items 1-8 done. Reports and Auto Reply email flow are the remaining MVP items.

UI redesign, new pages, and admin/observability run alongside during Weeks 1-5.



