import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_COMMAND_LENGTH = 2_000;
const MCP_TIMEOUT_MS = 60_000;
const DEFAULT_TERMUX_MCP_URL = "http://127.0.0.1:8081/mcp";
const WINDOW_MS = 60_000;
const REQUEST_LIMIT = 10;
const buckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(request: Request): boolean {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  const key = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  const current = buckets.get(key);
  if (current && current.count >= REQUEST_LIMIT) return true;
  if (current) current.count += 1;
  else buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
  return false;
}

async function readBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8_192) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function getTermuxMcpUrl(): URL | null {
  try {
    const url = new URL(process.env.TERMUX_MCP_URL || DEFAULT_TERMUX_MCP_URL);
    const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
    if (url.protocol !== "http:" || !isLoopback || url.username || url.password) return null;
    if (!url.pathname.endsWith("/mcp")) url.pathname = `${url.pathname.replace(/\/$/, "")}/mcp`;
    return url;
  } catch {
    return null;
  }
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin terminal requests are not allowed" }, { status: 403 });
  }
  if (isRateLimited(request)) {
    return NextResponse.json({ error: "Too many terminal requests. Wait a minute and try again." }, { status: 429 });
  }
  if ((request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  let body: unknown;
  try {
    const text = await readBody(request);
    if (text === null) return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (
    typeof body !== "object" || body === null || Array.isArray(body) ||
    Object.keys(body).some((key) => key !== "command") ||
    typeof (body as { command?: unknown }).command !== "string" ||
    !(body as { command: string }).command.trim() ||
    (body as { command: string }).command.length > MAX_COMMAND_LENGTH
  ) {
    return NextResponse.json({ error: `Body must contain one command up to ${MAX_COMMAND_LENGTH} characters` }, { status: 400 });
  }

  if (process.env.TERMUX_MCP_ENABLED !== "true") {
    return NextResponse.json({ error: "Termux MCP is disabled for this app server" }, { status: 503 });
  }
  const url = getTermuxMcpUrl();
  if (!url) {
    return NextResponse.json({ error: "TERMUX_MCP_URL must point to a loopback Streamable HTTP MCP endpoint" }, { status: 503 });
  }

  const client = new Client({ name: "chat-app-termux-terminal", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(url);
  try {
    await client.connect(transport);
    const result = await client.callTool(
      { name: "run", arguments: { cmd: (body as { command: string }).command } },
      undefined,
      { timeout: MCP_TIMEOUT_MS, maxTotalTimeout: MCP_TIMEOUT_MS },
    );
    const contentItems: unknown[] = Array.isArray(result.content) ? result.content : [];
    const output = contentItems
      .flatMap((item) =>
        typeof item === "object" && item !== null && "type" in item && item.type === "text" && "text" in item && typeof item.text === "string"
          ? [item.text]
          : []
      )
      .join("\n")
      .slice(0, 20_000);
    if (result.isError) return NextResponse.json({ error: output || "Termux command failed" }, { status: 502 });
    return NextResponse.json({ output });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json(
      { error: timedOut ? "Termux command timed out" : "Unable to reach the local Termux MCP server" },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    await client.close().catch(() => undefined);
  }
}
