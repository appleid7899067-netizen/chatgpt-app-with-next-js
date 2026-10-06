"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useWidgetProps } from "./hooks/use-widget-props";

type Message = { role: "user" | "assistant"; content: string };
type ModelMode = "puter" | "puter-codex" | "codex";
type RetryRequest = { messages: Message[]; mode: ModelMode };
type BackendStatus = "checking" | "online" | "offline";

declare global {
  interface Window {
    puter?: {
      ai: {
        chat: (
          messages: Message[],
          testMode?: boolean,
          options?: { normalize?: boolean; model?: string }
        ) => Promise<unknown>;
      };
    };
  }
}

function getPuterReply(result: unknown): string | null {
  if (typeof result !== "object" || result === null || !("message" in result)) return null;
  const message = result.message;
  if (typeof message !== "object" || message === null || !("content" in message)) return null;

  const content = message.content;
  if (typeof content === "string") return content.trim() ? content : null;
  if (Array.isArray(content)) {
    const text = content
      .filter((part): part is { type: string; text: string } =>
        typeof part === "object" && part !== null && "text" in part && typeof part.text === "string"
      )
      .map((part) => part.text)
      .join("");
    return text.trim() ? text : null;
  }
  return null;
}

export default function Home() {
  const widgetProps = useWidgetProps<{ name?: string }>({});
  const widgetName = typeof widgetProps.name === "string" ? widgetProps.name : "";
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "สวัสดีครับ 👋 ผมพร้อมทำงานแล้ว มีอะไรให้ช่วยวันนี้?" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState<BackendStatus>("checking");
  const [chatError, setChatError] = useState<string | null>(null);
  const [retryRequest, setRetryRequest] = useState<RetryRequest | null>(null);
  const [mode, setMode] = useState<ModelMode>("puter");
  const endRef = useRef<HTMLDivElement>(null);

  const checkBackend = useCallback(async () => {
    setBackend("checking");
    try {
      const response = await fetch("/api/backend");
      const data = await response.json();
      setBackend(response.ok && data.ok === true ? "online" : "offline");
    } catch {
      setBackend("offline");
    }
  }, []);

  useEffect(() => {
    void checkBackend();
  }, [checkBackend]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function requestReply(conversation: Message[], selectedMode: ModelMode = mode) {
    setBusy(true);
    setChatError(null);

    try {
      let content: string | null = null;
      if (selectedMode === "codex") {
        const response = await fetch("/api/codex", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: conversation }),
        });
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const error = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
            ? data.error
            : "Codex request failed";
          throw new Error(error);
        }
        content = typeof data === "object" && data !== null && "content" in data && typeof data.content === "string"
          ? data.content.trim()
          : null;
      } else {
        if (!window.puter) {
          throw new Error("Puter.js ยังโหลดไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง");
        }
        const result = await window.puter.ai.chat(conversation, false, {
          normalize: true,
          ...(selectedMode === "puter-codex" ? { model: "openai/gpt-5.3-codex" } : {}),
        });
        content = getPuterReply(result);
      }
      if (!content) throw new Error("โมเดลไม่ส่งข้อความตอบกลับ");
      setMessages([...conversation, { role: "assistant", content }]);
      setRetryRequest(null);
    } catch (err) {
      setRetryRequest({ messages: conversation, mode: selectedMode });
      setChatError(
        err instanceof Error
          ? err.message
          : selectedMode !== "codex"
            ? "Puter ทำงานไม่สำเร็จ กรุณาล็อกอินหรืออนุญาตการใช้งาน แล้วลองอีกครั้ง"
            : "Codex ทำงานไม่สำเร็จ กรุณาลองอีกครั้ง"
      );
    } finally {
      setBusy(false);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    await requestReply(next, mode);
  }

  return (
    <main className="chat-shell">
      <Script src="https://js.puter.com/v2/" strategy="afterInteractive" />
      <aside className="sidebar">
        <button className="new-chat" disabled={busy} onClick={() => { setMessages([{ role: "assistant", content: "เริ่มแชตใหม่ได้เลยครับ ✨" }]); setChatError(null); setRetryRequest(null); }}>
          <span>＋</span> New chat
        </button>
        <div className="sidebar-label">Your AI</div>
        <div className="model-card">
          <div className="model-icon">✦</div>
          <div><strong>My AI</strong><small>{mode === "puter" ? "Puter AI" : mode === "puter-codex" ? "Puter Codex" : "Codex · E2B tools"}</small></div>
          <span className="dot" />
        </div>
        <div className="sidebar-bottom">
          <div className="status-row"><span className={`status-dot ${backend}`} /> E2B MCP {backend === "online" ? "online" : backend === "offline" ? "offline" : "checking"}</div>
          <button className="status-action" onClick={() => void checkBackend()} disabled={backend === "checking"}>
            {backend === "offline" ? "Retry health check" : "Check status"}
          </button>
          <div className="muted">Tools: not checked</div>
        </div>
      </aside>

      <section className="chat">
        <header className="topbar">
          <div className="brand"><div className="brand-mark">✦</div><span>My GPT</span>{widgetName && <small className="widget-context">For {widgetName}</small>}</div>
          <div className="topbar-actions">
            <label className="mode-label" htmlFor="model-mode">Model</label>
            <select id="model-mode" className="model-select" value={mode} onChange={(event) => setMode(event.target.value as ModelMode)} disabled={busy}>
              <option value="puter">Puter AI</option>
              <option value="puter-codex">Puter Codex</option>
              <option value="codex">Codex · E2B</option>
            </select>
            <button className="icon-button" aria-label="More options unavailable" title="More options are not available yet" disabled>•••</button>
          </div>
        </header>

        <div className="messages">
          {messages.map((m, i) => (
            <div key={i} className={`message-row ${m.role}`}>
              {m.role === "assistant" && <div className="avatar">✦</div>}
              <div className={`bubble ${m.role}`}>{m.content}</div>
            </div>
          ))}
          {busy && <div className="message-row assistant"><div className="avatar">✦</div><div className="bubble assistant typing"><i/><i/><i/></div></div>}
          <div ref={endRef} />
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={send}>
            <button type="button" className="attach" aria-label="Attachments unavailable" title="Attachments are not available yet" disabled>＋</button>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={mode === "puter" ? "Message My GPT..." : "Message Codex..."} maxLength={20_000} disabled={busy} />
            <button type="submit" className="send" disabled={!input.trim() || busy} aria-label="Send">↑</button>
          </form>
          {chatError && <div className="chat-error" role="alert">
            <span>เชื่อมต่อโมเดลไม่ได้: {chatError}</span>
            {retryRequest && <button type="button" onClick={() => void requestReply(retryRequest.messages, retryRequest.mode)} disabled={busy}>ลองอีกครั้ง</button>}
          </div>}
          <p className="disclaimer">My GPT can make mistakes. Check important information.</p>
        </div>
      </section>
    </main>
  );
}
