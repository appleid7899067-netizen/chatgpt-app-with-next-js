"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "สวัสดีครับ 👋 ผมพร้อมทำงานแล้ว มีอะไรให้ช่วยวันนี้?" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState<"checking" | "online" | "offline">("checking");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/backend")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(() => setBackend("online"))
      .catch(() => setBackend("offline"));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessages((m) => [...m, { role: "assistant", content: data.content }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            err instanceof Error
              ? `เชื่อมต่อโมเดลไม่ได้: ${err.message}`
              : "เชื่อมต่อโมเดลไม่ได้",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="chat-shell">
      <aside className="sidebar">
        <button className="new-chat" onClick={() => setMessages([{ role: "assistant", content: "เริ่มแชตใหม่ได้เลยครับ ✨" }])}>
          <span>＋</span> New chat
        </button>
        <div className="sidebar-label">Your AI</div>
        <div className="model-card">
          <div className="model-icon">✦</div>
          <div><strong>My AI</strong><small>Custom model</small></div>
          <span className="dot" />
        </div>
        <div className="sidebar-bottom">
          <div className="status-row"><span className={`status-dot ${backend}`} /> Backend {backend === "online" ? "online" : backend === "offline" ? "offline" : "checking"}</div>
          <div className="muted">E2B tools ready</div>
        </div>
      </aside>

      <section className="chat">
        <header className="topbar">
          <div className="brand"><div className="brand-mark">✦</div><span>My GPT</span></div>
          <button className="icon-button" aria-label="More options">•••</button>
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
            <button type="button" className="attach" aria-label="Attach">＋</button>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message My GPT..." disabled={busy} />
            <button type="submit" className="send" disabled={!input.trim() || busy} aria-label="Send">↑</button>
          </form>
          <p className="disclaimer">My GPT can make mistakes. Check important information.</p>
        </div>
      </section>
    </main>
  );
}
