import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Supabase sends people to its Site URL when our callback isn't on its redirect list; finish the sign-in anyway.
  const code = request.nextUrl.searchParams.get("code");
  if (code && !request.nextUrl.pathname.startsWith("/auth/")) {
    const to = request.nextUrl.clone();
    to.pathname = "/auth/callback";
    to.search = `?code=${encodeURIComponent(code)}&next=/settings`;
    return NextResponse.redirect(to);
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets, images, the MCP/cron endpoints and the PostHog proxy.
    "/((?!_next/static|_next/image|favicon.ico|api/mcp|api/cron|ingest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};
