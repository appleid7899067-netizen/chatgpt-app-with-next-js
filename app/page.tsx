"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useWidgetProps } from "./hooks/use-widget-props";

type Message = { role: "user" | "assistant"; content: string };
type ModelMode = "puter" | "puter-codex" | "puter-luna" | "codex";
type RetryRequest = { messages: Message[]; mode: ModelMode };
type BackendStatus = "checking" | "online" | "offline";
type TerminalEntry = { command: string; output: string };

declare global {
  interface Window {
    puter?: {
      ai: {
        chat: (
          messages: Message[],
          testMode?: boolean,
          options?: { normalize?: boolean; model?: string; tools?: unknown[] }
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

type PuterToolCall = { id: string; name: string; arguments: string };

function getPuterToolCalls(result: unknown): PuterToolCall[] {
  if (typeof result !== "object" || result === null || !("message" in result)) return [];
  const message = result.message;
  if (typeof message !== "object" || message === null || !("tool_calls" in message) || !Array.isArray(message.tool_calls)) return [];
  return message.tool_calls.flatMap((call) => {
    if (typeof call !== "object" || call === null || !("id" in call) || typeof call.id !== "string" || !("function" in call)) return [];
    const fn = call.function;
    if (typeof fn !== "object" || fn === null || !("name" in fn) || typeof fn.name !== "string" || !("arguments" in fn) || typeof fn.arguments !== "string") return [];
    return [{ id: call.id, name: fn.name, arguments: fn.arguments }];
  });
}

const e2bTools = [{
  type: "function",
  function: {
    name: "run_e2b_terminal",
    description: "Run one shell command in an isolated E2B terminal when code execution or command-line inspection is useful. Each call starts a fresh sandbox, so files and shell state do not persist between calls.",
    parameters: {
      type: "object",
      properties: { command: { type: "string", description: "A shell command up to 2000 characters" } },
      required: ["command"],
      additionalProperties: false,
    },
    strict: true,
  },
}];

async function getPuterReplyWithTools(conversation: Message[], model: string) {
  if (!window.puter) throw new Error("Puter.js ยังโหลดไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง");
  const history: unknown[] = conversation.map(({ role, content }) => ({ role, content }));

  for (let round = 0; round < 3; round += 1) {
    const result = await window.puter.ai.chat(history as Message[], false, {
      normalize: true,
      model,
      tools: e2bTools,
    });
    const toolCalls = getPuterToolCalls(result);
    if (toolCalls.length === 0) {
      const content = getPuterReply(result);
      if (!content) throw new Error("โมเดลไม่ส่งข้อความตอบกลับ");
      return content;
    }
    if (toolCalls.length > 2) throw new Error("Codex ขอเรียก terminal มากเกินไปในหนึ่งรอบ");
    if (typeof result !== "object" || result === null || !("message" in result)) {
      throw new Error("Puter ส่งผลลัพธ์ tool call ที่ไม่ถูกต้อง");
    }
    history.push(result.message);

    for (const call of toolCalls) {
      if (call.name !== "run_e2b_terminal") throw new Error("โมเดลขอเรียก tool ที่ไม่รองรับ");
      let args: unknown;
      try { args = JSON.parse(call.arguments); } catch { throw new Error("โมเดลส่งคำสั่ง terminal ที่ไม่ถูกต้อง"); }
      if (typeof args !== "object" || args === null || !("command" in args) || typeof args.command !== "string") {
        throw new Error("โมเดลส่งคำสั่ง terminal ที่ไม่ถูกต้อง");
      }
      const response = await fetch("/api/e2b", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: args.command }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
          ? data.error
          : "E2B terminal command failed";
        throw new Error(error);
      }
      const output = typeof data === "object" && data !== null && "output" in data && typeof data.output === "string"
        ? data.output
        : "E2B returned no terminal output";
      history.push({ role: "tool", tool_call_id: call.id, content: output });
    }
  }
  throw new Error("ถึงขีดจำกัดการเรียก E2B terminal ต่อหนึ่งคำถามแล้ว");
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
  const [mode, setMode] = useState<ModelMode>("puter-luna");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalCommand, setTerminalCommand] = useState("");
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([]);
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
        if (selectedMode === "puter") {
          content = getPuterReply(await window.puter.ai.chat(conversation, false, { normalize: true }));
        } else {
          const model = selectedMode === "puter-codex" ? "openai/gpt-5.3-codex" : "openai/gpt-5.6-luna";
          content = await getPuterReplyWithTools(conversation, model);
        }
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

  async function runTerminal(e: FormEvent) {
    e.preventDefault();
    const command = terminalCommand.trim();
    if (!command || terminalBusy) return;
    setTerminalBusy(true);
    setTerminalCommand("");
    try {
      const response = await fetch("/api/e2b", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
          ? data.error
          : "E2B terminal command failed";
        throw new Error(error);
      }
      const output = typeof data === "object" && data !== null && "output" in data && typeof data.output === "string"
        ? data.output
        : "No output";
      setTerminalEntries((entries) => [...entries, { command, output }].slice(-20));
    } catch (error) {
      setTerminalEntries((entries) => [...entries, {
        command,
        output: error instanceof Error ? `Error: ${error.message}` : "Error: command failed",
      }].slice(-20));
    } finally {
      setTerminalBusy(false);
    }
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
          <div><strong>My AI</strong><small>{mode === "puter" ? "Puter AI" : mode === "puter-codex" ? "Puter Codex" : mode === "puter-luna" ? "Puter Luna" : "Codex · E2B tools"}</small></div>
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
              <option value="puter-luna">Puter Luna</option>
              <option value="codex">Codex · E2B</option>
            </select>
            <button type="button" className="terminal-toggle" onClick={() => setTerminalOpen((open) => !open)} aria-expanded={terminalOpen}>
              {terminalOpen ? "Hide terminal" : "Terminal"}
            </button>
            <button className="icon-button" aria-label="More options unavailable" title="More options are not available yet" disabled>•••</button>
          </div>
        </header>

        {terminalOpen && <aside className="terminal-panel" aria-label="E2B terminal">
          <div className="terminal-heading">
            <strong>E2B terminal</strong>
            <button type="button" className="terminal-close" onClick={() => setTerminalOpen(false)} aria-label="Close terminal">×</button>
          </div>
          <p className="terminal-note">แต่ละคำสั่งทำงานใน sandbox ใหม่ ไฟล์และสถานะ shell จะไม่ต่อเนื่องข้ามคำสั่ง</p>
          <div className="terminal-output" aria-live="polite">
            {terminalEntries.length === 0 && <span className="terminal-placeholder">พร้อมรับคำสั่ง · E2B MCP {backend === "online" ? "online" : backend}</span>}
            {terminalEntries.map((entry, index) => <div className="terminal-entry" key={`${index}-${entry.command}`}>
              <code className="terminal-command">$ {entry.command}</code>
              <pre>{entry.output || "(no output)"}</pre>
            </div>)}
            {terminalBusy && <div className="terminal-running">กำลังรันคำสั่ง…</div>}
          </div>
          <form className="terminal-form" onSubmit={runTerminal}>
            <span aria-hidden="true">$</span>
            <input value={terminalCommand} onChange={(event) => setTerminalCommand(event.target.value)} maxLength={2_000} placeholder="พิมพ์คำสั่ง shell" disabled={terminalBusy} />
            <button type="submit" disabled={!terminalCommand.trim() || terminalBusy}>{terminalBusy ? "…" : "Run"}</button>
          </form>
        </aside>}

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
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={mode === "puter-codex" ? "Message Codex..." : mode === "puter-luna" ? "Message Luna..." : "Message My GPT..."} maxLength={20_000} disabled={busy} />
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
