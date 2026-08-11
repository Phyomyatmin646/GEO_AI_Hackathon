"use client";

import { useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────
type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  content: string;
  time: string;
};

// ── Helpers ───────────────────────────────────────────────
function nowTime() {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ── Bot Avatar (actual chatbot mascot PNG) ───────────────
function BotAvatar({ size = 40 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/design/chatbot-mascot.png"
      alt="AI Assistant"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        objectPosition: "center 15%",
        display: "block",
      }}
    />
  );
}

// ── FAB Icon ──────────────────────────────────────────────
function FabBotIcon() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/design/chatbot-mascot.png"
      alt="AI Assistant"
      width={80}
      height={80}
      style={{
        width: 80,
        height: 80,
        objectFit: "contain",
        display: "block",
      }}
    />
  );
}

// ── User Avatar ───────────────────────────────────────────
function UserAvatar() {
  return (
    <div className="chatbot-msg-avatar chatbot-msg-avatar--user">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </svg>
    </div>
  );
}

// ── Suggested prompts ─────────────────────────────────────
const SUGGESTED = [
  "What is this dataset about?",
  "Explain the data sources",
  "What do the QA results mean?",
  "How was the QA score calculated?",
];

// ── Rule-based responses ──────────────────────────────────
function localReply(text: string): string {
  const q = text.toLowerCase();
  if (q.includes("dataset") || q.includes("data"))
    return "This dataset contains agricultural market and environmental data. It includes information about crops, market prices, soil conditions, weather, and more to support better farming decisions.";
  if (q.includes("source"))
    return "The data comes from multiple trusted sources, including:\n• Government agricultural reports\n• Market data from local and regional sources\n• Weather and climate data from meteorological services\n• Satellite and remote sensing data\n• Field survey and ground measurements";
  if (q.includes("qa") && q.includes("mean"))
    return "QA (Quality Assurance) results show how reliable and complete the data is. It includes checks like:\n• Row count validation – Ensures all records are in place\n• Column completeness – Checks if all fields have data\n• Data type validation – Confirms data follows the correct format\n• Value range validation – Makes sure values are within expected limits";
  if (q.includes("score") || q.includes("calculat"))
    return "The QA score is calculated based on all QA checks. Each check is scored, and the overall score reflects the data quality. A higher score means better data quality.";
  if (q.includes("crop") || q.includes("rice"))
    return "Our dataset covers major Myanmar crops including monsoon rice, dry-season rice, black gram, green gram, maize, groundnut, chili, sesame, sugarcane, and more. Each crop has market price data and growing condition assessments.";
  if (q.includes("market") || q.includes("price"))
    return "Market prices are sourced from Wisarra and updated regularly. You can view the latest prices on the Agricultural Market Prices page. Prices include min/max ranges per commodity for different regions and marketplaces.";
  if (q.includes("climate") || q.includes("weather"))
    return "Climate data includes monthly rainfall, mean temperature, solar radiation, and soil moisture. These factors are used by our AI model to assess crop suitability for each geographic cell.";
  if (q.includes("hello") || q.includes("hi") || q.includes("help"))
    return "Hello! I'm the Myanmar Agriculture Intelligence assistant. I can help you understand the dataset, data sources, QA reports, market prices, crop recommendations, and climate data. What would you like to know?";
  return "I can help you with questions about this agricultural dataset — crop recommendations, market prices, QA reports, climate data, and data sources. Could you please be more specific about what you'd like to know?";
}

// ── Main Component ────────────────────────────────────────
export function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isNew, setIsNew] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (open && !isNew) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, isNew]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  function startChat(prompt?: string) {
    setIsNew(false);
    if (prompt) sendMessage(prompt);
    else setTimeout(() => inputRef.current?.focus(), 120);
  }

  function newChat() {
    setMessages([]);
    setIsNew(true);
    setInput("");
  }

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");

    const userMsg: Message = { id: uid(), role: "user", content, time: nowTime() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    setTimeout(() => {
      const reply = localReply(content);
      const botMsg: Message = { id: uid(), role: "assistant", content: reply, time: nowTime() };
      setMessages((prev) => [...prev, botMsg]);
      setLoading(false);
    }, 750);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      {/* Backdrop — mobile */}
      {open && (
        <div
          className="chatbot-backdrop"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Chat Panel ─────────────────────────────────── */}
      <div
        className={`chatbot-panel ${open ? "chatbot-panel--open" : ""}`}
        role="dialog"
        aria-label="AI Assistant chat"
        aria-modal="true"
      >
        {/* Header */}
        <header className="chatbot-header">
          <button
            className="chatbot-header-back"
            onClick={() => setOpen(false)}
            aria-label="Close chat"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <div className="chatbot-header-info">
            <span className="chatbot-header-title">AI Assistant</span>
            <span className="chatbot-header-sub">Here to help with your agricultural data</span>
          </div>
          <div className="chatbot-header-actions">
            <button className="chatbot-header-icon-btn" aria-label="Information">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" />
              </svg>
            </button>
            <button className="chatbot-new-chat-btn" onClick={newChat}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Chat
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="chatbot-body">
          {isNew ? (
            <div className="chatbot-welcome">
              <div className="chatbot-welcome-avatar">
                <BotAvatar size={96} />
              </div>
              <h2 className="chatbot-welcome-title">Hello!</h2>
              <p className="chatbot-welcome-sub">How can I help you today?</p>
              <div className="chatbot-suggestions">
                {SUGGESTED.map((s) => (
                  <button key={s} className="chatbot-suggestion-chip" onClick={() => startChat(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="chatbot-messages">
              {messages.map((msg) => (
                <div key={msg.id} className={`chatbot-msg-row chatbot-msg-row--${msg.role}`}>
                  {msg.role === "assistant" && (
                    <div className="chatbot-msg-avatar">
                      <BotAvatar size={36} />
                    </div>
                  )}
                  <div className="chatbot-msg-col">
                    {msg.role === "assistant" && (
                      <span className="chatbot-msg-sender">AI Assistant</span>
                    )}
                    <div className={`chatbot-bubble chatbot-bubble--${msg.role}`}>
                      {msg.content.split("\n").map((line, i) => (
                        <p key={i} className="chatbot-bubble-line">{line}</p>
                      ))}
                    </div>
                    <span className="chatbot-msg-time">{msg.time}</span>
                  </div>
                  {msg.role === "user" && <UserAvatar />}
                </div>
              ))}

              {loading && (
                <div className="chatbot-msg-row chatbot-msg-row--assistant">
                  <div className="chatbot-msg-avatar"><BotAvatar size={36} /></div>
                  <div className="chatbot-msg-col">
                    <span className="chatbot-msg-sender">AI Assistant</span>
                    <div className="chatbot-bubble chatbot-bubble--assistant chatbot-typing">
                      <span /><span /><span />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="chatbot-input-area">
          {isNew ? (
            <button className="chatbot-start-btn" onClick={() => startChat()}>
              Ask a question…
            </button>
          ) : (
            <div className="chatbot-input-row">
              <textarea
                ref={inputRef}
                className="chatbot-input"
                placeholder="Type your message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                rows={1}
                aria-label="Chat message input"
              />
              <button
                className="chatbot-send-btn"
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                aria-label="Send message"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z" />
                </svg>
              </button>
            </div>
          )}
          <p className="chatbot-disclaimer">
            AI responses may not always be accurate. Please verify important information.
          </p>
        </div>
      </div>

      {/* ── FAB Trigger ────────────────────────────────── */}
      <button
        className={`chatbot-fab ${open ? "chatbot-fab--active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close AI Assistant" : "Open AI Assistant"}
        aria-expanded={open}
      >
        <FabBotIcon />
        {!open && <span className="chatbot-fab-ring" aria-hidden="true" />}
      </button>
    </>
  );
}
