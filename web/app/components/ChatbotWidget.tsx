"use client";

import { useEffect, useRef, useState } from "react";

import { useLanguage } from "../lib/i18n";

type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  content: string;
  time: string;
};

type ChatError = {
  message: string;
  retryable: boolean;
  requestId: string | null;
  lastMessage: string;
};

type ChatSuccess = {
  reply: string;
  requestId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSuccess(value: unknown): ChatSuccess | null {
  if (
    !isRecord(value) ||
    typeof value.reply !== "string" ||
    value.reply.trim().length < 1 ||
    value.reply.length > 20_000 ||
    typeof value.requestId !== "string" ||
    value.requestId.length < 1 ||
    value.requestId.length > 128
  ) {
    return null;
  }
  return { reply: value.reply.trim(), requestId: value.requestId };
}

function errorCode(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.error)) return null;
  return typeof value.error.code === "string" ? value.error.code : null;
}

function nowTime(language: "en" | "my") {
  return new Intl.DateTimeFormat(language === "my" ? "my-MM" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());
}

function uid() {
  return crypto.randomUUID();
}

function BotAvatar({ size = 40 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/design/chatbot-mascot.png"
      alt="GeoAI Assistant"
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

function FabBotIcon() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/design/chatbot-mascot.png"
      alt="GeoAI Assistant"
      width={80}
      height={80}
      style={{ width: 80, height: 80, objectFit: "contain", display: "block" }}
    />
  );
}

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

export function ChatbotWidget() {
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isNew, setIsNew] = useState(true);
  const [chatError, setChatError] = useState<ChatError | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const activeRequest = useRef<AbortController | null>(null);

  const copy = lang === "my"
    ? {
        title: "GeoAI အကူအညီ",
        subtitle: "Backend နှင့်ချိတ်ဆက်ထားသော စိုက်ပျိုးရေးအကူအညီ",
        close: "Chat ပိတ်ရန်",
        newChat: "Chat အသစ်",
        hello: "မင်္ဂလာပါ!",
        welcome: "ယနေ့ ဘာကိုကူညီပေးရမလဲ?",
        start: "မေးခွန်းမေးရန်…",
        placeholder: "မေးလိုသောစာ ရိုက်ပါ…",
        input: "Chat မေးခွန်း",
        send: "မေးခွန်းပို့ရန်",
        retry: "ပြန်စမ်းမည်",
        retryable: "ဝန်ဆောင်မှုကို ယာယီမခေါ်နိုင်ပါ။ ပြန်စမ်းနိုင်သည်။",
        unavailable: "GeoAI အကူအညီကို ယခုအသုံးမပြုနိုင်ပါ။",
        rateLimited: "မေးခွန်းများလွန်းနေသည်။ ခဏစောင့်ပြီး ပြန်စမ်းပါ။",
        timeout: "GeoAI အကူအညီသည် သတ်မှတ်ချိန်အတွင်း မတုံ့ပြန်ပါ။",
        disclaimer: "GeoAI ဖြေကြားချက်များကို အရေးကြီးဆုံးဖြတ်ချက်မချမီ အတည်ပြုစစ်ဆေးပါ။",
        suggestions: [
          "ဒီ dataset အကြောင်း ရှင်းပြပါ",
          "ဒေတာရင်းမြစ်တွေက ဘာတွေလဲ?",
          "QA ရလဒ်က ဘာကိုဆိုလိုသလဲ?",
          "သီးနှံခန့်မှန်းချက်ရဲ့ ကန့်သတ်ချက်က ဘာလဲ?",
        ],
      }
    : {
        title: "GeoAI Assistant",
        subtitle: "Backend-connected help for agricultural data",
        close: "Close chat",
        newChat: "New chat",
        hello: "Hello!",
        welcome: "How can I help you today?",
        start: "Ask a question…",
        placeholder: "Type your message…",
        input: "Chat message input",
        send: "Send message",
        retry: "Try again",
        retryable: "The service could not respond. You can try again.",
        unavailable: "The GeoAI assistant is currently unavailable.",
        rateLimited: "The assistant is busy. Wait briefly and try again.",
        timeout: "The GeoAI assistant did not respond in time.",
        disclaimer: "Verify GeoAI responses before making important decisions.",
        suggestions: [
          "What is this dataset about?",
          "Explain the data sources",
          "What do the QA results mean?",
          "What are the limits of crop predictions?",
        ],
      };

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatError, messages, open]);

  useEffect(() => {
    if (!open || isNew) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 100);
    return () => window.clearTimeout(focusTimer);
  }, [open, isNew]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      fabRef.current?.focus();
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  function startChat(prompt?: string) {
    setIsNew(false);
    if (prompt) void sendMessage(prompt);
  }

  function newChat() {
    activeRequest.current?.abort();
    setMessages([]);
    setIsNew(true);
    setInput("");
    setChatError(null);
    setLoading(false);
  }

  function mappedErrorMessage(code: string | null) {
    if (code === "CHATBOT_RATE_LIMITED") return copy.rateLimited;
    if (code === "CHATBOT_TIMEOUT") return copy.timeout;
    return copy.unavailable;
  }

  async function sendMessage(text?: string, retrying = false) {
    const content = (text ?? input).trim();
    if (!content || loading || content.length > 4_000) return;
    setInput("");
    setChatError(null);

    const history = retrying && messages.at(-1)?.role === "user"
      ? messages.slice(0, -1)
      : messages;
    if (!retrying) {
      const userMessage: Message = {
        id: uid(),
        role: "user",
        content,
        time: nowTime(lang),
      };
      setMessages((current) => [...current, userMessage]);
    }
    setLoading(true);
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;

    try {
      const response = await fetch("/api/v1/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          language: lang,
          history: history.slice(-30).map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
        cache: "no-store",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(40_000),
        ]),
      });
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        const code = errorCode(payload);
        setChatError({
          message: mappedErrorMessage(code),
          retryable: response.status === 429 || response.status >= 500,
          requestId: response.headers.get("x-request-id"),
          lastMessage: content,
        });
        return;
      }
      const success = parseSuccess(payload);
      if (!success || success.requestId !== response.headers.get("x-request-id")) {
        setChatError({
          message: copy.unavailable,
          retryable: true,
          requestId: response.headers.get("x-request-id"),
          lastMessage: content,
        });
        return;
      }
      const botMessage: Message = {
        id: uid(),
        role: "assistant",
        content: success.reply,
        time: nowTime(lang),
      };
      setMessages((current) => [...current, botMessage]);
    } catch (error) {
      if (controller.signal.aborted) return;
      const timedOut = error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError");
      setChatError({
        message: timedOut ? copy.timeout : copy.retryable,
        retryable: true,
        requestId: null,
        lastMessage: content,
      });
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function handleKey(event: React.KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <>
      {open && (
        <div className="chatbot-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />
      )}

      <div
        className={`chatbot-panel ${open ? "chatbot-panel--open" : ""}`}
        role="dialog"
        aria-label={copy.title}
        aria-modal="true"
      >
        <header className="chatbot-header">
          <button className="chatbot-header-back" onClick={() => setOpen(false)} aria-label={copy.close}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <div className="chatbot-header-info">
            <span className="chatbot-header-title">{copy.title}</span>
            <span className="chatbot-header-sub">{copy.subtitle}</span>
          </div>
          <div className="chatbot-header-actions">
            <button className="chatbot-new-chat-btn" onClick={newChat}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {copy.newChat}
            </button>
          </div>
        </header>

        <div className="chatbot-body">
          {isNew ? (
            <div className="chatbot-welcome">
              <div className="chatbot-welcome-avatar"><BotAvatar size={96} /></div>
              <h2 className="chatbot-welcome-title">{copy.hello}</h2>
              <p className="chatbot-welcome-sub">{copy.welcome}</p>
              <div className="chatbot-suggestions">
                {copy.suggestions.map((suggestion) => (
                  <button key={suggestion} className="chatbot-suggestion-chip" onClick={() => startChat(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="chatbot-messages" aria-live="polite">
              {messages.map((message) => (
                <div key={message.id} className={`chatbot-msg-row chatbot-msg-row--${message.role}`}>
                  {message.role === "assistant" && <div className="chatbot-msg-avatar"><BotAvatar size={36} /></div>}
                  <div className="chatbot-msg-col">
                    {message.role === "assistant" && <span className="chatbot-msg-sender">{copy.title}</span>}
                    <div className={`chatbot-bubble chatbot-bubble--${message.role}`}>
                      {message.content.split("\n").map((line, index) => (
                        <p key={`${message.id}-${index}`} className="chatbot-bubble-line">{line}</p>
                      ))}
                    </div>
                    <span className="chatbot-msg-time">{message.time}</span>
                  </div>
                  {message.role === "user" && <UserAvatar />}
                </div>
              ))}

              {loading && (
                <div className="chatbot-msg-row chatbot-msg-row--assistant" role="status">
                  <div className="chatbot-msg-avatar"><BotAvatar size={36} /></div>
                  <div className="chatbot-msg-col">
                    <span className="chatbot-msg-sender">{copy.title}</span>
                    <div className="chatbot-bubble chatbot-bubble--assistant chatbot-typing"><span /><span /><span /></div>
                  </div>
                </div>
              )}

              {chatError && (
                <div className="chatbot-error" role="alert">
                  <strong>{chatError.message}</strong>
                  {chatError.requestId && <small>Request ID: {chatError.requestId}</small>}
                  {chatError.retryable && (
                    <button type="button" onClick={() => void sendMessage(chatError.lastMessage, true)} disabled={loading}>
                      {copy.retry}
                    </button>
                  )}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="chatbot-input-area">
          {isNew ? (
            <button className="chatbot-start-btn" onClick={() => startChat()}>{copy.start}</button>
          ) : (
            <div className="chatbot-input-row">
              <textarea
                ref={inputRef}
                className="chatbot-input"
                placeholder={copy.placeholder}
                value={input}
                maxLength={4_000}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKey}
                rows={1}
                aria-label={copy.input}
              />
              <button
                className="chatbot-send-btn"
                onClick={() => void sendMessage()}
                disabled={!input.trim() || loading}
                aria-label={copy.send}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z" />
                </svg>
              </button>
            </div>
          )}
          <p className="chatbot-disclaimer">{copy.disclaimer}</p>
        </div>
      </div>

      <button
        ref={fabRef}
        className={`chatbot-fab ${open ? "chatbot-fab--active" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? copy.close : copy.title}
        aria-expanded={open}
      >
        <FabBotIcon />
        {!open && <span className="chatbot-fab-ring" aria-hidden="true" />}
      </button>
    </>
  );
}
