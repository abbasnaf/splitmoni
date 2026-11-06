import { NextResponse, type NextRequest } from "next/server";

/*
 * Request proxy for the API:
 *  - CSRF/origin protection: cookie-authenticated mutations (POST/PUT/PATCH/
 *    DELETE) must be same-site. Browsers always send Origin (and usually
 *    Referer) on fetch/WebSocket mutations; a present header whose host
 *    differs from the request Host is rejected. Header-less requests (non-
 *    browser clients such as scripted tests) carry no ambient cookie
 *    authority and are allowed through to route-level auth checks.
 *  - Rate limits (in-memory, single-instance MVP): sign-in/sign-up,
 *    password-reset/email-confirm, and invitation-creation endpoints are
 *    bucketed per client IP with fixed windows. Limits reset on restart;
 *    move to a shared store before running multiple instances.
 */

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

function checkRateLimit(request: NextRequest, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return NextResponse.json(
      { error: "Too many requests. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((bucket.resetAt - now) / 1000)) } },
    );
  }
  return null;
}

function rateLimitFor(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  const ip = clientIp(request);
  if (pathname === "/api/auth" && request.method === "POST") {
    return checkRateLimit(request, `auth:${ip}`, 30, 10 * 60 * 1000);
  }
  if (pathname.startsWith("/api/auth/password-reset") || pathname.startsWith("/api/auth/email/confirm")) {
    return checkRateLimit(request, `reset:${ip}`, 20, 60 * 60 * 1000);
  }
  if (/^\/api\/groups\/[^/]+\/invites(\/.*)?$/.test(pathname) && request.method === "POST") {
    return checkRateLimit(request, `invites:${ip}`, 30, 60 * 60 * 1000);
  }
  return null;
}

function sameSiteCheck(request: NextRequest): NextResponse | null {
  if (!MUTATION_METHODS.has(request.method)) return null;
  const host = request.headers.get("host");
  if (!host) return null;
  const candidate = request.headers.get("origin") ?? request.headers.get("referer");
  if (!candidate) return null;
  let candidateHost: string;
  try {
    candidateHost = new URL(candidate).host;
  } catch {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  if (candidateHost.toLowerCase() !== host.toLowerCase()) {
    return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  }
  return null;
}

export function proxy(request: NextRequest) {
  return sameSiteCheck(request) ?? rateLimitFor(request) ?? NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
