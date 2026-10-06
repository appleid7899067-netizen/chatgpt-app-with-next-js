import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const apiUrl = process.env.MODEL_API_URL;
    if (!apiUrl) return NextResponse.json({ error: "MODEL_API_URL is not configured" }, { status: 503 });

    const headers: Record<string,string> = { "Content-Type":"application/json" };
    if (process.env.MODEL_API_KEY) headers.Authorization = `Bearer ${process.env.MODEL_API_KEY}`;

    const upstream = await fetch(apiUrl, {
      method:"POST",
      headers,
      body: JSON.stringify({
        model: process.env.MODEL_NAME || "custom-model",
        messages: body.messages,
        stream: false,
      }),
      cache:"no-store",
    });
    const data = await upstream.json();
    if (!upstream.ok) return NextResponse.json({ error: data?.error?.message || data?.error || "Model request failed" }, { status: upstream.status });
    const content = data?.choices?.[0]?.message?.content ?? data?.output?.[0]?.content?.[0]?.text ?? data?.content;
    if (!content) return NextResponse.json({ error:"Model returned no text" }, { status:502 });
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ error:"Unable to reach model service" }, { status:502 });
  }
}
