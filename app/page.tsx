"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useWidgetProps } from "./hooks/use-widget-props";

type Message = { role: "user" | "assistant"; content: string };
type BackendStatus = "checking" | "online" | "offline";

declare global {
  interface Window {
    puter?: {
      ai: {
        chat: (
          messages: Message[],
          testMode?: boolean,
          options?: { normalize?: boolean }
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
  const [retryMessages, setRetryMessages] = useState<Message[] | null>(null);
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

  async function requestReply(conversation: Message[]) {
    setBusy(true);
    setChatError(null);

    try {
      if (!window.puter) {
        throw new Error("Puter.js ยังโหลดไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง");
      }
      const result = await window.puter.ai.chat(conversation, false, { normalize: true });
      const content = getPuterReply(result);
      if (!content) throw new Error("โมเดลไม่ส่งข้อความตอบกลับ");
      setMessages([...conversation, { role: "assistant", content }]);
      setRetryMessages(null);
    } catch (err) {
      setRetryMessages(conversation);
      setChatError(
        err instanceof Error
          ? err.message
          : "Puter ทำงานไม่สำเร็จ กรุณาล็อกอินหรืออนุญาตการใช้งาน แล้วลองอีกครั้ง"
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
    await requestReply(next);
  }

  return (
    <main className="chat-shell">
      <Script src="https://js.puter.com/v2/" strategy="afterInteractive" />
      <aside className="sidebar">
        <button className="new-chat" disabled={busy} onClick={() => { setMessages([{ role: "assistant", content: "เริ่มแชตใหม่ได้เลยครับ ✨" }]); setChatError(null); setRetryMessages(null); }}>
          <span>＋</span> New chat
        </button>
        <div className="sidebar-label">Your AI</div>
        <div className="model-card">
          <div className="model-icon">✦</div>
          <div><strong>My AI</strong><small>Puter AI</small></div>
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
          <button className="icon-button" aria-label="More options unavailable" title="More options are not available yet" disabled>•••</button>
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
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message My GPT..." maxLength={20_000} disabled={busy} />
            <button type="submit" className="send" disabled={!input.trim() || busy} aria-label="Send">↑</button>
          </form>
          {chatError && <div className="chat-error" role="alert">
            <span>เชื่อมต่อโมเดลไม่ได้: {chatError}</span>
            {retryMessages && <button type="button" onClick={() => void requestReply(retryMessages)} disabled={busy}>ลองอีกครั้ง</button>}
          </div>}
          <p className="disclaimer">My GPT can make mistakes. Check important information.</p>
        </div>
      </section>
    </main>
  );
}
