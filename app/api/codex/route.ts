import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_MESSAGES = 60;
const MAX_MESSAGE_LENGTH = 20_000;
const MAX_TOTAL_LENGTH = 60_000;
const REQUEST_TIMEOUT_MS = 180_000;
const DEFAULT_E2B_MCP_URL = "https://e2b-mcp-server-rb14.onrender.com/mcp";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 8;
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

type ChatMessage = { role: "user" | "assistant"; content: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidMessages(value: unknown): value is ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) return false;
  let totalLength = 0;
  for (const message of value) {
    if (
      !isRecord(message) ||
      Object.keys(message).some((key) => key !== "role" && key !== "content") ||
      (message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string" ||
      message.content.trim().length === 0 ||
      message.content.length > MAX_MESSAGE_LENGTH
    ) return false;
    totalLength += message.content.length;
    if (totalLength > MAX_TOTAL_LENGTH) return false;
  }
  return true;
}

async function readLimitedBody(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > 256 * 1024) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function checkRateLimit(request: Request): boolean {
  const now = Date.now();
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const clientKey = forwardedFor || request.headers.get("x-real-ip") || "unknown";
  for (const [key, bucket] of requestBuckets) {
    if (bucket.resetAt <= now) requestBuckets.delete(key);
  }
  const bucket = requestBuckets.get(clientKey);
  if (bucket && bucket.resetAt > now && bucket.count >= RATE_LIMIT_REQUESTS) return false;
  if (bucket && bucket.resetAt > now) bucket.count += 1;
  else requestBuckets.set(clientKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  if (requestBuckets.size > 10_000) requestBuckets.clear();
  return true;
}

function getMcpUrl(): string | null {
  try {
    const configured = process.env.E2B_MCP_URL || DEFAULT_E2B_MCP_URL;
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (!url.pathname.endsWith("/mcp")) url.pathname = `${url.pathname.replace(/\/$/, "")}/mcp`;
    return url.toString();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!checkRateLimit(request)) {
    return NextResponse.json({ error: "Too many Codex requests. Please wait a minute and retry." }, { status: 429 });
  }
  if ((request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  let body: unknown;
  try {
    const text = await readLimitedBody(request);
    if (text === null) {
      return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Unable to read a valid JSON request body" }, { status: 400 });
  }

  if (!isRecord(body) || Object.keys(body).some((key) => key !== "messages") || !isValidMessages(body.messages)) {
    return NextResponse.json({ error: "Body must contain 1-60 supported user/assistant text messages" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Codex is not configured on the server" }, { status: 503 });

  const mcpUrl = getMcpUrl();
  if (!mcpUrl) return NextResponse.json({ error: "E2B MCP URL must be a valid HTTPS URL" }, { status: 503 });

  const conversation = body.messages
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n\n");
  const client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });

  try {
    const events = await client.beta.agents.sessions.create({
      environment: { type: "none" },
      agent: {
        model: process.env.CODEX_MODEL || "gpt-6-astra",
        instructions:
          "You are Codex, a coding and technical assistant. Answer in the user's language. Use the connected E2B MCP tools when code execution or sandbox tools are useful. The E2B tools may use isolated, short-lived sandboxes, so do not claim files persist between separate tool calls. Do not claim to have changed the user's application files; you only have the tools exposed by E2B MCP.",
        tools: [{
          type: "mcp",
          server_label: "e2b",
          transport: { type: "http", server_url: mcpUrl },
          connection_origin: "service",
          required: true,
        }],
      },
      input: `Continue this chat and answer the latest user message.\n\n${conversation}`,
      stream: true,
    });
    const result = await events.finalResult();
    const content = result.output_text.trim();
    if (!content) return NextResponse.json({ error: "Codex returned no text" }, { status: 502 });
    return NextResponse.json({ content });
  } catch (error) {
    if (
      error instanceof OpenAI.APIConnectionTimeoutError ||
      (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
    ) {
      return NextResponse.json({ error: "Codex request timed out. Please retry." }, { status: 504 });
    }
    const status = error instanceof OpenAI.APIError ? error.status : undefined;
    console.error("Codex request failed", status ? { status } : undefined);
    return NextResponse.json(
      { error: status === 401 || status === 403 ? "Codex API authentication or access failed" : "Unable to complete the Codex request" },
      { status: status === 429 ? 429 : 502 }
    );
  }
}
