import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.E2B_MCP_URL || "https://e2b-mcp-server-rb14.onrender.com";
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/health`, { cache:"no-store" });
    const data = await res.json();
    return NextResponse.json({ ok:res.ok, ...data }, { status:res.ok ? 200 : 502 });
  } catch {
    return NextResponse.json({ ok:false }, { status:502 });
  }
}
