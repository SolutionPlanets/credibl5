/**
 * Simple in-memory sliding-window rate limiter for Next.js API routes.
 *
 * Usage:
 *   const limiter = rateLimit({ interval: 60_000, limit: 10 });
 *   // inside route handler:
 *   const ip = getIP(request);
 *   const { success } = limiter.check(ip);
 *   if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 */

type Entry = { count: number; timestamp: number };

export function rateLimit({ interval, limit }: { interval: number; limit: number }) {
  const store = new Map<string, Entry>();

  // Prune expired entries every 60 seconds to prevent memory leaks
  const PRUNE_INTERVAL = 60_000;
  let lastPrune = Date.now();

  function prune(now: number) {
    if (now - lastPrune < PRUNE_INTERVAL) return;
    lastPrune = now;
    for (const [key, entry] of store) {
      if (now - entry.timestamp > interval) {
        store.delete(key);
      }
    }
  }

  function check(key: string): { success: boolean; remaining: number } {
    const now = Date.now();
    prune(now);

    const entry = store.get(key);

    if (!entry || now - entry.timestamp > interval) {
      store.set(key, { count: 1, timestamp: now });
      return { success: true, remaining: limit - 1 };
    }

    if (entry.count >= limit) {
      return { success: false, remaining: 0 };
    }

    entry.count += 1;
    return { success: true, remaining: limit - entry.count };
  }

  return { check };
}

/**
 * Extract client IP from request headers.
 * Falls back to "unknown" if no header is found.
 */
export function getIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}
