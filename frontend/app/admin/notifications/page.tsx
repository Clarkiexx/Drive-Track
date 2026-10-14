"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, RotateCw, Send } from "lucide-react";

import EmptyState from "@/components/common/EmptyState";
import FormField from "@/components/common/FormField";
import NoticeBox from "@/components/common/NoticeBox";
import { formatShortDateManila, formatTimeManila } from "@/components/common/dates";
import { getApiErrorMessage } from "@/lib/axios";
import {
  notificationService,
  type BroadcastPayload,
  type BroadcastRecord,
} from "@/services/notification.service";

type RecipientType = BroadcastPayload["recipientType"];

const RECIPIENT_OPTIONS: ReadonlyArray<{
  key: RecipientType;
  label: string;
  description: string;
}> = [
  { key: "unsettled_drivers", label: "Unsettled Drivers", description: "Reminders for pending settlements" },
  { key: "all_drivers", label: "All Drivers", description: "Announcements to all drivers" },
  { key: "all_enforcers", label: "All Enforcers", description: "Memos to all active officers" },
  { key: "everyone", label: "Everyone", description: "Drivers + enforcers" },
  { key: "single_driver", label: "Specific Driver", description: "By license number" },
  { key: "single_enforcer", label: "Specific Enforcer", description: "By employee ID / badge" },
];

const RECIPIENT_LABELS: Record<RecipientType, string> = {
  unsettled_drivers: "Unsettled Drivers",
  all_drivers: "All Drivers",
  all_enforcers: "All Enforcers",
  everyone: "Everyone",
  single_driver: "Specific Driver",
  single_enforcer: "Specific Enforcer",
};

const MAX_MESSAGE = 500;

export default function AdminNotificationsPage() {
  const [recipientType, setRecipientType] = useState<RecipientType>("unsettled_drivers");
  const [message, setMessage] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendNotice, setSendNotice] = useState("");
  const [broadcasts, setBroadcasts] = useState<BroadcastRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const loadBroadcasts = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const rows = await notificationService.listBroadcasts();
      setBroadcasts(rows);
    } catch {
      setBroadcasts([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadBroadcasts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadBroadcasts]);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    setSendError("");
    setSendNotice("");

    if (!message.trim()) {
      setSendError("Message cannot be empty.");
      return;
    }
    if (message.trim().length > MAX_MESSAGE) {
      setSendError(`Message must be ${MAX_MESSAGE} characters or fewer.`);
      return;
    }

    // Mirrors admin-dashboard NotificationsAdmin: single_driver resolves by
    // license number; single_enforcer tries employee ID, then badge number
    // (the backend checks employeeId first, then badgeNumber).
    const payload: BroadcastPayload = { recipientType, message: message.trim() };
    if (recipientType === "single_driver") {
      if (!identifier.trim()) {
        setSendError("Enter the driver's license number.");
        return;
      }
      payload.licenseNumber = identifier.trim();
    }
    if (recipientType === "single_enforcer") {
      if (!identifier.trim()) {
        setSendError("Enter the enforcer's employee ID or badge number.");
        return;
      }
      payload.employeeId = identifier.trim();
      payload.badgeNumber = identifier.trim();
    }

    setIsSending(true);
    try {
      const result = await notificationService.sendBroadcast(payload);
      const count = result[0]?.recipientCount ?? 0;
      if (count === 0) {
        setSendError("No matching recipients — nothing was sent.");
      } else {
        setSendNotice(
          `Broadcast sent to ${count} recipient${count === 1 ? "" : "s"}. It appears in their inbox immediately.`
        );
      }
      setMessage("");
      setIdentifier("");
      await loadBroadcasts();
    } catch (err) {
      setSendError(getApiErrorMessage(err, "Unable to send notification."));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold tracking-[0.18em] text-brand-600 uppercase">
            Notifications
          </p>
          <h2 className="font-display mt-1.5 text-[22px] leading-tight font-semibold tracking-tight text-ink">
            Broadcasts
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-console-muted">
            Send advisories to drivers and enforcers. Each broadcast fans out to
            per-user inbox notifications on the backend.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadBroadcasts()}
          disabled={isLoadingHistory}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink shadow-console transition-colors hover:border-brand-300 hover:bg-brand-soft disabled:opacity-60"
        >
          <RotateCw
            size={14}
            strokeWidth={2.3}
            className={isLoadingHistory ? "animate-spin" : undefined}
            aria-hidden
          />
          {isLoadingHistory ? "Refreshing" : "Refresh"}
        </button>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-5">
        <section
          className="rise overflow-hidden rounded-2xl border border-console-line bg-surface shadow-console xl:col-span-3"
          aria-label="Compose broadcast"
        >
          <header className="flex items-center gap-2.5 border-b border-console-line px-5 py-3.5">
            <Send size={16} strokeWidth={2.1} className="shrink-0 text-brand-600" aria-hidden />
            <h3 className="font-display text-[15px] leading-none font-semibold tracking-tight text-ink">
              Compose message
            </h3>
          </header>

          <form onSubmit={handleSend} className="px-5 py-4">
            <p className="text-[13px] font-semibold text-ink">Recipients</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Recipients">
              {RECIPIENT_OPTIONS.map((option) => {
                const selected = recipientType === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setRecipientType(option.key)}
                    className={`rounded-[10px] border p-3 text-left transition-colors ${
                      selected
                        ? "border-brand-500 bg-brand-soft"
                        : "border-console-line bg-surface hover:border-brand-300"
                    }`}
                  >
                    <span className="block text-[13px] font-bold text-ink">{option.label}</span>
                    <span className="mt-0.5 block text-[11.5px] text-console-muted">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>

            {recipientType === "single_driver" ? (
              <FormField
                label="Driver license number"
                required
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="e.g. G-75-45-571924"
                className="mt-3"
              />
            ) : null}
            {recipientType === "single_enforcer" ? (
              <FormField
                label="Employee ID or badge number"
                required
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="e.g. ENF-2024-001 or B-4592"
                className="mt-3"
              />
            ) : null}

            <div className="mt-3">
              <label
                htmlFor="broadcast-message"
                className="mb-1.5 block text-[13px] font-semibold text-ink"
              >
                Message
              </label>
              <textarea
                id="broadcast-message"
                value={message}
                onChange={(event) => setMessage(event.target.value.slice(0, MAX_MESSAGE))}
                rows={5}
                maxLength={MAX_MESSAGE}
                placeholder="Type your message here…"
                className="dt-input resize-y"
              />
              <p className="mt-1 text-right text-[11.5px] text-console-muted">
                {message.length} / {MAX_MESSAGE} characters
              </p>
            </div>

            {sendError ? (
              <NoticeBox tone="danger" className="mt-3 text-[13px]">
                {sendError}
              </NoticeBox>
            ) : null}
            {sendNotice ? (
              <NoticeBox tone="success" className="mt-3 text-[13px]">
                {sendNotice}
              </NoticeBox>
            ) : null}

            <button
              type="submit"
              disabled={isSending}
              className="mt-3 inline-flex items-center gap-2 rounded-[10px] bg-console-rail px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-console-rail-deep disabled:opacity-60"
            >
              <Send size={14} strokeWidth={2.3} aria-hidden />
              {isSending ? "Sending…" : "Send Notification"}
            </button>
          </form>
        </section>

        <section
          className="rise overflow-hidden rounded-2xl border border-console-line bg-surface shadow-console xl:col-span-2"
          style={{ animationDelay: "80ms" }}
          aria-label="Recent broadcasts"
          aria-live="polite"
        >
          <header className="flex items-center gap-2.5 border-b border-console-line px-5 py-3.5">
            <Bell size={16} strokeWidth={2.1} className="shrink-0 text-brand-600" aria-hidden />
            <h3 className="font-display text-[15px] leading-none font-semibold tracking-tight text-ink">
              Recent broadcasts
            </h3>
            <p className="ml-auto shrink-0 text-[11.5px] leading-none text-console-muted">
              Latest 20
            </p>
          </header>

          {isLoadingHistory ? (
            <div className="space-y-2 px-5 py-4" aria-hidden>
              {[0, 1, 2].map((index) => (
                <div key={index} className="space-y-2">
                  <div className="breathe h-5 w-28 rounded-full bg-console-canvas" />
                  <div className="breathe h-3 w-full rounded-full bg-console-canvas [animation-delay:120ms]" />
                </div>
              ))}
            </div>
          ) : broadcasts.length === 0 ? (
            <EmptyState title="No broadcasts sent yet">
              Compose your first advisory — it lands in the right inboxes
              immediately.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-console-line/70">
              {broadcasts.map((broadcast) => (
                <li key={broadcast.broadcastId} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex shrink-0 items-center rounded-full bg-brand-soft px-2.5 py-[3px] text-[11px] leading-tight font-bold text-brand-700">
                      {RECIPIENT_LABELS[broadcast.recipientType] ?? broadcast.recipientType}
                    </span>
                    <span className="ml-auto text-[11px] text-console-muted">
                      {formatShortDateManila(broadcast.createdAt)} • {formatTimeManila(broadcast.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] font-semibold text-ink">
                    To: {RECIPIENT_LABELS[broadcast.recipientType] ?? broadcast.recipientType} (
                    {broadcast.recipientCount})
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed break-words whitespace-pre-wrap text-ink/80">
                    {broadcast.message}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
