import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { getAuthCookieDomain } from "@/lib/auth-cookie-domain";

export async function createClient() {
    const cookieStore = await cookies();
    const headerList = await headers();
    const host = headerList.get("host") || "";

    const cookieDomain = getAuthCookieDomain(host);

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

export async function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing admin Supabase env variables. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createSupabaseClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          "x-application-name": "Cradible5-admin",
        },
      },
    },
  );
}
