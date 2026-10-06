import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");
  const configuredOrigins = process.env.MCP_CORS_ORIGINS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedOrigins = new Set([
    "https://chatgpt.com",
    "https://chat.openai.com",
    ...(configuredOrigins || []),
  ]);
  const allowedOrigin = origin && (origin === request.nextUrl.origin || allowedOrigins.has(origin));
  const allowedHeaders = [
    "Content-Type",
    "Authorization",
    "MCP-Protocol-Version",
    "MCP-Session-Id",
    "Last-Event-Id",
    "Next-Action",
    "Next-Router-Prefetch",
    "Next-Router-Segment-Prefetch",
    "Next-Router-State-Tree",
    "Next-Url",
    "RSC",
  ].join(", ");

  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: allowedOrigin ? 204 : 403 });
    if (!allowedOrigin) return response;
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
    response.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", allowedHeaders);
    response.headers.set("Access-Control-Expose-Headers", "MCP-Session-Id, MCP-Protocol-Version");
    return response;
  }

  const response = NextResponse.next();
  if (allowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
    response.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", allowedHeaders);
    response.headers.set("Access-Control-Expose-Headers", "MCP-Session-Id, MCP-Protocol-Version");
  }
  return response;
}

export const config = {
  matcher: "/:path*",
};
