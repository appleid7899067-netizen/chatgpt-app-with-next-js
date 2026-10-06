import { NextResponse } from "next/server";

const MAX_MESSAGES = 100;
const MAX_MESSAGE_LENGTH = 20_000;
const MAX_TOTAL_MESSAGE_LENGTH = 100_000;
const MAX_REQUEST_BYTES = 256 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;

type ChatMessage = { role: "user" | "assistant"; content: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidMessages(value: unknown): value is ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    return false;
  }

  let totalLength = 0;
  for (const message of value) {
    if (
      !isRecord(message) ||
      Object.keys(message).some((key) => key !== "role" && key !== "content") ||
      (message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string" ||
      message.content.trim().length === 0 ||
      message.content.length > MAX_MESSAGE_LENGTH
    ) {
      return false;
    }
    totalLength += message.content.length;
    if (totalLength > MAX_TOTAL_MESSAGE_LENGTH) return false;
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
      if (totalBytes > MAX_REQUEST_BYTES) {
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

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  }

  let rawBody: string;
  try {
    const bodyText = await readLimitedBody(request);
    if (bodyText === null) {
      return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
    }
    rawBody = bodyText;
  } catch {
    return NextResponse.json({ error: "Unable to read request body" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => key !== "messages") ||
    !isValidMessages(body.messages)
  ) {
    return NextResponse.json(
      {
        error: `Body must contain only messages: 1-${MAX_MESSAGES} user/assistant text messages, each up to ${MAX_MESSAGE_LENGTH} characters and ${MAX_TOTAL_MESSAGE_LENGTH} characters total`,
      },
      { status: 400 }
    );
  }

  const apiUrl = process.env.MODEL_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "MODEL_API_URL is not configured" }, { status: 503 });
  }

  let parsedApiUrl: URL;
  try {
    parsedApiUrl = new URL(apiUrl);
    if (
      !["https:", ...(process.env.NODE_ENV === "development" ? ["http:"] : [])].includes(parsedApiUrl.protocol) ||
      parsedApiUrl.username ||
      parsedApiUrl.password
    ) {
      throw new Error("Unsupported URL");
    }
  } catch {
    return NextResponse.json({ error: "MODEL_API_URL must be a valid HTTPS URL" }, { status: 503 });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.MODEL_API_KEY) headers.Authorization = `Bearer ${process.env.MODEL_API_KEY}`;

  try {
    const upstream = await fetch(parsedApiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: process.env.MODEL_NAME || "custom-model",
        messages: body.messages,
        stream: false,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const responseText = await upstream.text();
    let data: unknown;
    try {
      data = JSON.parse(responseText);
    } catch {
      return NextResponse.json(
        { error: upstream.ok ? "Model service returned an invalid response" : "Model request failed" },
        { status: 502 }
      );
    }

    if (!upstream.ok) {
      return NextResponse.json({ error: "Model request failed" }, { status: upstream.status });
    }

    const record = isRecord(data) ? data : {};
    const choices = Array.isArray(record.choices) ? record.choices : [];
    const firstChoice = isRecord(choices[0]) ? choices[0] : {};
    const message = isRecord(firstChoice.message) ? firstChoice.message : {};
    const output = Array.isArray(record.output) ? record.output : [];
    const outputItem = isRecord(output[0]) ? output[0] : {};
    const outputContent = Array.isArray(outputItem.content) ? outputItem.content : [];
    const outputText = isRecord(outputContent[0]) ? outputContent[0].text : undefined;
    const content = message.content ?? outputText ?? record.content;

    if (typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "Model returned no text" }, { status: 502 });
    }
    return NextResponse.json({ content });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Model service timed out" }, { status: 504 });
    }
    return NextResponse.json({ error: "Unable to reach model service" }, { status: 502 });
  }
}
