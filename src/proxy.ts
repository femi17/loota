import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimitByIp } from "@/lib/rate-limit";

// Routes that require an authenticated user (redirect to login if not signed in)
const PROTECTED_ROUTES = ["/hunts", "/lobby", "/inventory", "/admin", "/profile", "/hunt"];

// Security headers applied to all responses
const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
  "X-DNS-Prefetch-Control": "on",
  // CSP: allow self, Mapbox, Supabase, Paystack (script + checkout iframe + button CSS), fonts; restrict framing
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.paystack.co",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://paystack.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://events.mapbox.com https://api.paystack.com",
    "frame-src https://checkout.paystack.com",
    "frame-ancestors 'none'",
  ].join("; "),
};

function applySecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

export async function proxy(request: NextRequest) {
  // 1) Rate limit at edge (distributed when Upstash Redis is configured)
  const rateLimitRes = await checkRateLimitByIp(request, {
    prefix: "middleware:global",
    maxRequests: 120,
    windowMs: 60_000,
  });
  if (rateLimitRes) return applySecurityHeaders(rateLimitRes);

  let response = NextResponse.next({
    request: { headers: request.headers },
  });
  response = applySecurityHeaders(response);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        response = applySecurityHeaders(response);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  /** TV-style map: only users with an `admin_profiles` row (same rule as /admin tools). */
  if (pathname.startsWith("/broadcast")) {
    if (!user) {
      const redirectUrl = new URL("/auth/login", request.url);
      redirectUrl.searchParams.set("redirect", pathname + (request.nextUrl.search ?? ""));
      const redirect = NextResponse.redirect(redirectUrl);
      applySecurityHeaders(redirect);
      return redirect;
    }
    const { data: adminProfile } = await supabase
      .from("admin_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!adminProfile) {
      const redirect = NextResponse.redirect(new URL("/", request.url));
      applySecurityHeaders(redirect);
      return redirect;
    }
    return response;
  }

  const isProtectedRoute = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));

  if (isProtectedRoute && !user) {
    const redirectUrl = new URL("/auth/login", request.url);
    redirectUrl.searchParams.set("redirect", pathname);
    const redirect = NextResponse.redirect(redirectUrl);
    applySecurityHeaders(redirect);
    return redirect;
  }

  if ((pathname.startsWith("/auth/login") || pathname.startsWith("/auth/signup")) && user) {
    const redirectParam = request.nextUrl.searchParams.get("redirect");
    // Only allow same-origin paths (prevent open-redirect)
    const safePath =
      redirectParam?.startsWith("/") && !redirectParam.startsWith("//") && !redirectParam.includes("\\")
        ? redirectParam
        : "/lobby";
    const redirect = NextResponse.redirect(new URL(safePath, request.url));
    applySecurityHeaders(redirect);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

