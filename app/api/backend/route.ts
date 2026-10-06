import { NextResponse } from "next/server";

const HEALTH_TIMEOUT_MS = 8_000;

export async function GET() {
  const url = process.env.E2B_MCP_URL || "https://e2b-mcp-server-rb14.onrender.com";
  try {
    const healthUrl = new URL(`${url.replace(/\/$/, "")}/health`);
    if (
      (healthUrl.protocol !== "https:" && !(process.env.NODE_ENV === "development" && healthUrl.protocol === "http:")) ||
      healthUrl.username ||
      healthUrl.password
    ) {
      return NextResponse.json({ ok: false, error: "E2B_MCP_URL must use HTTPS" }, { status: 503 });
    }

    const res = await fetch(healthUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const responseText = await res.text();
    let data: unknown = {};
    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        return NextResponse.json({ ok: false, error: "E2B health endpoint returned invalid JSON" }, { status: 502 });
      }
    }

    const payload = typeof data === "object" && data !== null && !Array.isArray(data) ? data : {};
    const reportedOk = (payload as { ok?: unknown }).ok === true;
    const ok = res.ok && reportedOk;
    return NextResponse.json({ ok }, { status: ok ? 200 : 502 });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json(
      { ok: false, error: timedOut ? "E2B health check timed out" : "Unable to reach E2B health endpoint" },
      { status: timedOut ? 504 : 502 }
    );
  }
}
