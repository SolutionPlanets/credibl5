This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Supabase setup for Google Business OAuth

Run this SQL migration in Supabase SQL editor before using Google connect:

`supabase/migrations/20260312_google_business_connections.sql`

Required environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, required for secure refresh-token storage)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXT_PUBLIC_GMB_BACKEND_URL` (optional, e.g. `http://localhost:8000`, preferred if Supabase Google provider is disabled)

## Auth Architecture Flow

### 1) Account Creation (email + password)

1. User submits email and password on `/auth/signup`.
2. Supabase Auth creates `auth.users` row.
3. DB trigger `on_auth_user_created` auto-creates `public.user_profiles` row.
4. App calls `/api/auth/ensure-subscription` to create a default `subscription_plans` row (`free` trial) if missing.
5. App immediately starts Google OAuth with `flow=connect-google`, `access_type=offline`, `prompt=consent`.

### 2) One-time Google Connection

1. Google redirects to `/auth/callback?flow=connect-google`.
2. Callback exchanges code for session.
3. Server reads `provider_refresh_token`.
4. Server stores refresh token in `public.google_business_connections` using `SUPABASE_SERVICE_ROLE_KEY` (server-only client).
5. Server updates `public.user_profiles.google_connected_at` and `google_last_oauth_at`.
6. User is redirected to `/protected?google=connected`.

### 3) Day-to-day Login

1. User signs in with email/password on `/auth/login`.
2. Supabase SSR session cookies keep them logged in (7-day cookie maxAge).
3. Dashboard checks `user_profiles.google_connected_at`:
   - set: dashboard loads as connected.
   - missing: shows "Connect Google Business" empty state.

### 4) Background Sync Readiness

1. Backend worker/cron uses service-role client.
2. Worker reads refresh tokens from `public.google_business_connections`.
3. Worker fetches latest Google Business reviews and writes app data to Supabase tables.
4. User does not need to reconnect unless Google revokes token/access.

### 5) Security Model

- Browser never reads refresh tokens.
- Refresh tokens are stored only in `public.google_business_connections`.
- `anon` and `authenticated` are revoked from that table.
- Only `service_role` can read/write refresh tokens.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
