import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthCookieDomain } from "@/lib/auth/auth-cookie-domain";

// Cache onboarding status per user to avoid DB queries on every request
const onboardingCache = new Map<string, { completed: boolean; timestamp: number }>();
const ONBOARDING_CACHE_TTL = 30_000; // 30 seconds

function getCachedOnboardingStatus(userId: string): boolean | null {
  const entry = onboardingCache.get(userId);
  if (!entry || Date.now() - entry.timestamp > ONBOARDING_CACHE_TTL) {
    return null;
  }
  return entry.completed;
}

function setCachedOnboardingStatus(userId: string, completed: boolean) {
  onboardingCache.set(userId, { completed, timestamp: Date.now() });
  // Prune old entries periodically
  if (onboardingCache.size > 1000) {
    const now = Date.now();
    for (const [key, val] of onboardingCache) {
      if (now - val.timestamp > ONBOARDING_CACHE_TTL) onboardingCache.delete(key);
    }
  }
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase environment variables in Middleware");
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );

        supabaseResponse = NextResponse.next({ request });

        const host = request.headers.get("host") || "";
        const cookieDomain = getAuthCookieDomain(host);

        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, {
            ...options,
            domain: cookieDomain || options.domain,
          })
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtectedPath = request.nextUrl.pathname.startsWith("/protected");
  const isOnboardingPath = request.nextUrl.pathname.startsWith("/onboarding");
  const isAuthPath =
    request.nextUrl.pathname === "/auth/login" ||
    request.nextUrl.pathname === "/auth/signup";

  if (!user && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  if (!user && isOnboardingPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Check onboarding status for authenticated users on protected or onboarding pages
  if (user && (isProtectedPath || isOnboardingPath)) {
    const googleParam = request.nextUrl.searchParams.get("google");
    // Bypass cache when returning from onboarding completion (?google=connected)
    // to avoid stale cached status redirecting back to /onboarding
    const bypassCache = googleParam === "connected";
    let onboardingCompleted = bypassCache ? null : getCachedOnboardingStatus(user.id);

    if (onboardingCompleted === null) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      onboardingCompleted = Boolean(profile?.onboarding_completed);
      setCachedOnboardingStatus(user.id, onboardingCompleted);
    }

    // Not onboarded → redirect to /onboarding
    if (isProtectedPath && !onboardingCompleted) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    // Already onboarded → redirect away from /onboarding
    // (unless returning from Google connect flow with ?google=connected)
    if (isOnboardingPath && onboardingCompleted) {
      if (googleParam !== "connected") {
        const url = request.nextUrl.clone();
        url.pathname = "/protected";
        return NextResponse.redirect(url);
      }
    }
  }

  if (user && isAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/protected";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
