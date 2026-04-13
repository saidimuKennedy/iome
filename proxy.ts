// proxy.ts — Next.js 16 renamed middleware to proxy.
// Protects /eoc/* routes: requires authenticated session with role admin or eoc_operator.
// Public routes (/, /dashboard, /login, /api/ussd, /api/sms/*) pass through freely.

import { auth } from "@/auth";
import { NextResponse } from "next/server";

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;

  // EOC dashboard requires authentication
  if (pathname.startsWith("/eoc")) {
    if (!req.auth) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/eoc/:path*"],
};
