"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { LoaderCircle } from "lucide-react";

import AppBar from "@/components/common/AppBar";
import BottomNav from "@/components/common/BottomNav";
import { chatbotService } from "@/services/chatbot.service";
import type { ApiEnvelope } from "@/lib/axios";
import { useAuth } from "@/context/AuthContext";

/**
 * The chips the Expo screen seeded the transcript with
 * (driver-app/src/screens/ChatbotScreen.js). The backend returns the same four
 * in chatbotController.js QUICK_QUESTIONS, so seeding them keeps the screen
 * useful before the first round trip and avoids an empty state.
 */
const INITIAL_QUICK_QUESTIONS = [
  "How to settle violations?",
  "Where is CTMO office?",
  "What are the penalties?",
  "How to appeal?",
];

type Message = {
  id: number;
  from: "bot" | "user";
  text: string;
};

/**
 * Error text from ChatbotScreen's catch block.
 *
 * The distinction is deliberate and worth keeping: a message from the server
 * ("A message is required") tells the driver what to change, while a silent
 * network failure tells them the backend address is wrong — two different
 * problems, two different fixes. The parenthetical names NEXT_PUBLIC_API_URL
 * here instead of the Expo app's EXPO_PUBLIC_API_URL, which does not exist in
 * this build.
 */
function errorDetail(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const envelope = error.response?.data as ApiEnvelope<unknown> | undefined;
    if (envelope?.message) return ` (${envelope.message})`;
    if (error.request && !error.response) {
      return " (cannot reach server — check your connection / NEXT_PUBLIC_API_URL)";
    }
  }
  return "";
}

/**
 * Chatbot tab — driver-app/src/screens/ChatbotScreen.js.
 *
 * Answers come from POST /chatbot/ask, which is a keyword-matched FAQ table on
 * the backend (backend/src/controllers/chatbotController.js:3-6) — not a model.
 * Nothing here claims otherwise.
 */
export default function ChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      from: "bot",
      text: "Hello! I'm DriveTrack Assistant. How can I help you today?",
    },
  ]);
  const [quickQuestions, setQuickQuestions] = useState(INITIAL_QUICK_QUESTIONS);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Monotonic ids for the transcript keys. A ref rather than a module-level
  // counter: the RN screen kept one at module scope, which leaks state across
  // remounts and is meaningless in a per-user client app.
  const nextMessageId = useRef(1);
  const transcriptRef = useRef<HTMLDivElement>(null);

  function pushMessage(from: Message["from"], text: string) {
    nextMessageId.current += 1;
    const id = nextMessageId.current;
    setMessages((previous) => [...previous, { id, from, text }]);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    pushMessage("user", trimmed);
    setInputText("");
    setIsSending(true);

    try {
      const response = await chatbotService.ask(trimmed, user?.role ?? "driver");
      pushMessage("bot", response.answer);
      if (response.quickQuestions) {
        setQuickQuestions(response.quickQuestions);
      }
    } catch (error) {
      pushMessage("bot", `Sorry, I ran into a connection issue${errorDetail(error)}. Please try again.`);
    } finally {
      setIsSending(false);
    }
  }

  // Keep the newest line in view, the way the RN screen's
  // `listRef.current?.scrollToEnd()` did after every exchange.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const node = transcriptRef.current;
      if (node) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    }, 100);

    return () => window.clearTimeout(timer);
  }, [messages, isSending]);

  return (
    <>
      <AppBar
        title="AI Chatbot"
        backHref="/home"
        actions={
          <span className="grid size-9 place-items-center rounded-full bg-white/15 text-[16px] ring-1 ring-white/25 ring-inset">
            <span aria-hidden>🤖</span>
          </span>
        }
      />

      {/* RN put the assistant's name and tagline beside its icon in the header.
          AppBar carries the title only, so the identity moves to a strip under
          the band rather than being dropped. */}
      <div className="shrink-0 border-b border-hairline bg-surface px-4 py-2.5">
        <p className="text-[14px] font-bold text-ink">DriveTrack Assistant</p>
        <p className="mt-0.5 text-[11.5px] text-muted">Always here to help</p>
      </div>

      <div className="shrink-0 border-b border-hairline bg-surface px-4 py-3">
        <p className="mb-2 text-[12px] text-muted">Quick Questions</p>
        <ul className="flex flex-wrap gap-2">
          {quickQuestions.map((question) => (
            <li key={question}>
              <button
                type="button"
                disabled={isSending}
                onClick={() => sendMessage(question)}
                className="rounded-2xl bg-brand-soft px-3.5 py-2 text-[12px] font-semibold text-brand-700 transition-colors duration-150 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {question}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* The RN screen put the transcript in a FlatList that scrolled on its
          own while the header and composer stayed put. AppShell is min-h-dvh,
          not h-dvh, so the page itself can grow past one screen — meaning the
          transcript may be taller than its box. min-h-0 lets it shrink to the
          space left over so overflow-y-auto actually engages and the
          scrollToEnd effect below has something to scroll. */}
      {/* aria-relevant="additions" so only the new bubble is announced —
          re-reading the whole transcript on every message makes the screen
          reader unusable once the chat has any length. */}
      <div
        ref={transcriptRef}
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation"
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        <ul className="flex flex-col gap-3.5">
          {messages.map((message) =>
            message.from === "bot" ? (
              <li key={message.id} className="flex items-end gap-2">
                <span
                  aria-hidden
                  className="grid size-[26px] shrink-0 place-items-center rounded-full bg-brand-soft text-[12px]"
                >
                  🤖
                </span>
                <p className="max-w-[78%] rounded-[14px] rounded-bl-[4px] bg-surface p-3 text-[13px] leading-[18px] text-ink">
                  {message.text}
                </p>
              </li>
            ) : (
              <li key={message.id} className="flex justify-end">
                <p className="max-w-[78%] rounded-[14px] rounded-br-[4px] bg-brand-500 p-3 text-[13px] leading-[18px] text-white">
                  {message.text}
                </p>
              </li>
            )
          )}
        </ul>

        {isSending ? (
          <div className="mt-3.5 flex justify-center" role="status" aria-label="Sending">
            <LoaderCircle size={18} strokeWidth={2.4} className="animate-spin text-brand-500" aria-hidden />
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage(inputText);
        }}
        className="flex shrink-0 items-center gap-2.5 border-t border-hairline bg-surface px-4 py-3 pb-nav"
      >
        <label htmlFor="chat-message" className="sr-only">
          Type your message
        </label>
        <input
          id="chat-message"
          name="message"
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          placeholder="Type your message..."
          autoComplete="off"
          disabled={isSending}
          className="dt-input flex-1 rounded-full py-2.5 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={isSending}
          aria-label="Send message"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition-colors duration-150 hover:bg-brand-600 active:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-55"
        >
          <span aria-hidden>➤</span>
        </button>
      </form>

      <BottomNav />
    </>
  );
}