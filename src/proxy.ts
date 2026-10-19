import { NextRequest, NextResponse } from "next/server";
import { demoAuth, hasDemoSession } from "@/lib/demo-auth-server";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/")) {
    if (path === "/api/auth/login" || path === "/api/auth/csrf") {
      const response = NextResponse.next();
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    // Covers generated HEAD/OPTIONS and unsupported methods too.
    // Data handlers independently repeat the guard.
    return demoAuth.withSession(request, () => NextResponse.next());
  }
  if (!hasDemoSession(request)) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = { matcher: ["/", "/lines/:path*", "/api/:path*"] };
