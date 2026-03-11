import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

export async function createClient() {
    const cookieStore = await cookies();
    const headerList = await headers();
    const host = headerList.get("host") || "";

    // Manages cross-subdomain cookies for production, falls back to localhost rules
    const isProductionDomain = host.includes("cradible5.com");
    const cookieDomain = isProductionDomain ? ".cradible5.com" : undefined;

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            // ==========================================
            // [FUTURE FEATURE]: Custom Database Schema
            // Uncomment if you move data out of the default 'public' schema
            // ==========================================
            // db: {
            //   schema: "my_custom_schema",
            // },

            // ==========================================
            // [FUTURE FEATURE]: Next.js Caching Control
            // Uncomment to prevent Next.js from aggressively caching database responses
            // ==========================================
            // global: {
            //   fetch: (url, options) => {
            //     return fetch(url, { ...options, cache: 'no-store' });
            //   },
            // },

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
                    } catch (error) {
                        // ==========================================
                        // [FUTURE FEATURE]: Developer Logging
                        // Uncomment to log exactly when Next.js blocks a cookie update
                        // ==========================================
                        // if (process.env.NODE_ENV !== "production") {
                        //   console.warn("Supabase cookie update skipped in Server Component.");
                        // }
                    }
                },
            },
        }
    );
}

// ==========================================
// [FUTURE FEATURE]: Admin Client (Bypasses RLS Security)
// Uncomment if your server needs to do admin tasks (e.g., Stripe webhooks).
// Requires adding SUPABASE_SERVICE_ROLE_KEY to your .env file.
// ==========================================
/*
export async function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        // Admin clients usually don't need to read/write user cookies
        getAll() { return []; },
        setAll() {},
      },
    }
  );
}
*/