import { createBrowserClient } from "@supabase/ssr";
import { getAuthCookieDomain } from "@/lib/auth-cookie-domain";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing supabase env variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
  }

  const host = typeof window !== "undefined" ? window.location.host : "";
  const cookieDomain = getAuthCookieDomain(host);

  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookieOptions: {
        domain: cookieDomain,
        sameSite: "lax",
        secure: typeof window !== "undefined" && window.location.protocol === "https:",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      },
      auth: {
        flowType: "pkce",
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        debug: process.env.NODE_ENV !== "production",
      },
      global: {
        headers: {
          "x-application-name": "Cradible5",
        },
      },
    }
  )



}
