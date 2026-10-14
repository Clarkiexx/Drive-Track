"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCw, Tags } from "lucide-react";

import EmptyState from "@/components/common/EmptyState";
import FormField from "@/components/common/FormField";
import NoticeBox from "@/components/common/NoticeBox";
import { getApiErrorMessage } from "@/lib/axios";
import {
  formatPenaltyRange,
  violationTypeService,
  type ViolationCategory,
  type ViolationTypeRecord,
} from "@/services/violation-type.service";

const CATEGORY_LABELS: Record<ViolationCategory, string> = {
  moving: "Moving",
  non_moving: "Non-moving",
};

function toNumber(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function AdminViolationTypesPage() {
  const [types, setTypes] = useState<ViolationTypeRecord[]>([]);
  const [showInactive, setShowInactive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [actingId, setActingId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ViolationTypeRecord | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const rows = await violationTypeService.list();
      setTypes(rows);
    } catch (err) {
      setTypes([]);
      setLoadError(getApiErrorMessage(err, "Unable to load violation types."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function handleToggleStatus(row: ViolationTypeRecord) {
    if (actingId !== null) return;
    setActingId(row.violationTypeId);
    setActionError("");
    setActionNotice("");
    try {
      // Deactivating hides the type from the enforcer issuance form
      // (GET /violation-types?active=true); history keeps its snapshot via
      // penaltyAtIssuance on citation_violations, so past fines are unaffected.
      await violationTypeService.updateStatus(row.violationTypeId, !(row.isActive ?? true));
      setActionNotice(
        `“${row.description}” is now ${(row.isActive ?? true) ? "inactive" : "active"}.`
      );
      await load();
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Unable to update status."));
    } finally {
      setActingId(null);
    }
  }

  const visible = showInactive ? types : types.filter((t) => t.isActive ?? true);
  const activeCount = types.filter((t) => t.isActive ?? true).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold tracking-[0.18em] text-brand-600 uppercase">
            Violation Types
          </p>
          <h2 className="font-display mt-1.5 text-[22px] leading-tight font-semibold tracking-tight text-ink">
            Offence catalogue
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-console-muted">
            Maintain the offences enforcers can cite and the fine attached to each.
            Only active types appear in the issuance form; changing a penalty
            affects new citations only.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-console-rail px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-console-rail-deep"
          >
            <Tags size={14} strokeWidth={2.3} aria-hidden />
            Add Violation Type
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink shadow-console transition-colors hover:border-brand-300 hover:bg-brand-soft disabled:opacity-60"
          >
            <RotateCw
              size={14}
              strokeWidth={2.3}
              className={isLoading ? "animate-spin" : undefined}
              aria-hidden
            />
            {isLoading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      {actionError ? (
        <NoticeBox tone="danger" className="mb-4 text-[13px]">
          {actionError}
        </NoticeBox>
      ) : null}
      {actionNotice ? (
        <NoticeBox tone="success" className="mb-4 text-[13px]">
          {actionNotice}
        </NoticeBox>
      ) : null}

      <section
        className="rise overflow-hidden rounded-2xl border border-console-line bg-surface shadow-console"
        aria-live="polite"
      >
        <header className="flex flex-wrap items-center gap-2.5 border-b border-console-line px-5 py-3.5">
          <Tags size={16} strokeWidth={2.1} className="shrink-0 text-brand-600" aria-hidden />
          <h3 className="font-display text-[15px] leading-none font-semibold tracking-tight text-ink">
            Violation types
          </h3>
          <p className="ml-auto shrink-0 text-[11.5px] leading-none text-console-muted">
            {activeCount} active of {types.length}
          </p>
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] font-semibold text-console-muted">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
              className="size-3.5 accent-brand-600"
            />
            Show inactive
          </label>
        </header>

        {isLoading ? (
          <ul aria-hidden className="divide-y divide-console-line/70">
            {[0, 1, 2, 3].map((index) => (
              <li key={index} className="flex items-center gap-3 px-5 py-4">
                <div className="breathe h-3 w-28 rounded-full bg-console-canvas" />
                <div className="breathe h-3 w-40 rounded-full bg-console-canvas [animation-delay:120ms]" />
                <div className="breathe ml-auto h-5 w-20 rounded-full bg-console-canvas [animation-delay:200ms]" />
              </li>
            ))}
          </ul>
        ) : loadError ? (
          <div className="p-5">
            <NoticeBox tone="danger" className="text-[13px]">
              {loadError}
            </NoticeBox>
          </div>
        ) : visible.length === 0 ? (
          <EmptyState title="No violation types found">
            {showInactive
              ? "The catalogue is empty — add the first offence to get started."
              : "No active violation types. Toggle “Show inactive” to review retired entries."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left">
              <caption className="sr-only">Violation types in the catalogue</caption>
              <thead>
                <tr className="border-b border-console-line bg-console-canvas/70 text-[10.5px] tracking-[0.14em] text-console-muted uppercase">
                  <th scope="col" className="px-5 py-2.5 font-bold">
                    Article / Section
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-bold">
                    Description
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-bold">
                    Category
                  </th>
                  <th scope="col" className="px-5 py-2.5 text-right font-bold">
                    Penalty
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-bold">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-bold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const isActive = row.isActive ?? true;
                  return (
                    <tr
                      key={row.violationTypeId}
                      className="border-b border-console-line/70 transition-colors last:border-0 hover:bg-brand-50/70"
                    >
                      <td className="tabular-nums px-5 py-3.5 align-top text-[13px] font-bold text-ink">
                        {row.articleSection}
                      </td>
                      <td className="px-5 py-3.5 align-top text-[13px] text-ink/80">
                        {row.description}
                      </td>
                      <td className="px-5 py-3.5 align-top text-[13px] text-ink/80">
                        {CATEGORY_LABELS[row.category]}
                      </td>
                      <td className="tabular-nums px-5 py-3.5 text-right align-top text-[13px] font-bold text-ink">
                        {formatPenaltyRange(row)}
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <button
                          type="button"
                          onClick={() => void handleToggleStatus(row)}
                          disabled={actingId !== null}
                          title={isActive ? "Deactivate — hides from issuance form" : "Activate — shows in issuance form"}
                          aria-pressed={isActive}
                          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-[3px] text-[11px] leading-tight font-bold transition-opacity disabled:opacity-60 ${
                            isActive ? "bg-go-soft text-go-ink" : "bg-chip-neutral text-muted"
                          }`}
                        >
                          {isActive ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <button
                          type="button"
                          onClick={() => setEditing(row)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-console-line bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showCreate ? (
        <ViolationTypeFormDialog
          title="Add violation type"
          submitLabel="Create"
          onClose={() => setShowCreate(false)}
          onSubmit={async (input) => {
            await violationTypeService.create(input);
            setShowCreate(false);
            setActionNotice("Violation type created — active in the issuance form.");
            setActionError("");
            await load();
          }}
        />
      ) : null}

      {editing ? (
        <ViolationTypeFormDialog
          title={`Edit — ${editing.articleSection}`}
          submitLabel="Save Changes"
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (input) => {
            await violationTypeService.update(editing.violationTypeId, input);
            setEditing(null);
            setActionNotice("Violation type updated. New citations use the new values.");
            setActionError("");
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function ViolationTypeFormDialog({
  title,
  submitLabel,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initial?: ViolationTypeRecord | null;
  onClose: () => void;
  onSubmit: (input: {
    articleSection: string;
    description: string;
    category: ViolationCategory;
    defaultPenalty: number;
    minPenalty?: number;
    maxPenalty?: number;
  }) => Promise<void>;
}) {
  const [articleSection, setArticleSection] = useState(initial?.articleSection ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState<ViolationCategory>(initial?.category ?? "moving");
  const [defaultPenalty, setDefaultPenalty] = useState(
    initial ? String(toNumber(initial.defaultPenalty)) : ""
  );
  const [minPenalty, setMinPenalty] = useState(
    initial?.minPenalty === null || initial?.minPenalty === undefined || initial?.minPenalty === ""
      ? ""
      : String(toNumber(initial.minPenalty))
  );
  const [maxPenalty, setMaxPenalty] = useState(
    initial?.maxPenalty === null || initial?.maxPenalty === undefined || initial?.maxPenalty === ""
      ? ""
      : String(toNumber(initial.maxPenalty))
  );
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!articleSection.trim() || !description.trim()) {
      setError("Article/Section and description are required.");
      return;
    }
    const penalty = Number(defaultPenalty);
    if (!Number.isFinite(penalty) || penalty < 0) {
      setError("Default penalty must be a positive number.");
      return;
    }
    // Optional legal band: blank means no range. When present, the minimum
    // cannot exceed the maximum and the charged default must sit inside.
    const min = minPenalty.trim() ? Number(minPenalty) : null;
    const max = maxPenalty.trim() ? Number(maxPenalty) : null;
    if ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0))) {
      setError("Minimum and maximum penalties must be positive numbers.");
      return;
    }
    if (min !== null && max !== null && min > max) {
      setError("Minimum penalty cannot exceed maximum penalty.");
      return;
    }
    if ((min !== null && penalty < min) || (max !== null && penalty > max)) {
      setError("Default penalty must sit inside the minimum–maximum range.");
      return;
    }
    setIsSubmitting(true);
    try {
      // The service re-validates with zod (mirrors the backend
      // express-validator rules) before sending.
      await onSubmit({
        articleSection: articleSection.trim(),
        description: description.trim(),
        category,
        defaultPenalty: penalty,
        ...(min !== null ? { minPenalty: min } : {}),
        ...(max !== null ? { maxPenalty: max } : {}),
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "Unable to save violation type."));
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-console-line bg-surface p-5 shadow-float"
        onClick={(event) => event.stopPropagation()}
      >
        <h4 className="font-display text-[15px] font-semibold tracking-tight text-ink">{title}</h4>
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label="Article / Section"
              required
              value={articleSection}
              onChange={(e) => setArticleSection(e.target.value)}
              placeholder="e.g. Art III, Sec 11-17"
            />
            <div>
              <label
                htmlFor="vt-category"
                className="mb-1.5 block text-[13px] font-semibold text-ink"
              >
                Category
              </label>
              <select
                id="vt-category"
                value={category}
                onChange={(event) => setCategory(event.target.value as ViolationCategory)}
                className="dt-input"
              >
                <option value="moving">Moving</option>
                <option value="non_moving">Non-moving</option>
              </select>
            </div>
          </div>
          <FormField
            label="Description"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Disobedience of Traffic Control Signs/Signals"
          />
          <FormField
            label="Default penalty (₱)"
            required
            type="number"
            min="0"
            step="10"
            value={defaultPenalty}
            onChange={(e) => setDefaultPenalty(e.target.value)}
            placeholder="e.g. 1000"
            hint="New citations total this amount; past citations keep their snapshot."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label="Minimum penalty (₱)"
              type="number"
              min="0"
              step="10"
              value={minPenalty}
              onChange={(e) => setMinPenalty(e.target.value)}
              placeholder="e.g. 1000"
              hint="Optional legal band shown as ₱min – ₱max."
            />
            <FormField
              label="Maximum penalty (₱)"
              type="number"
              min="0"
              step="10"
              value={maxPenalty}
              onChange={(e) => setMaxPenalty(e.target.value)}
              placeholder="e.g. 2000"
            />
          </div>
          {error ? (
            <NoticeBox tone="danger" className="text-[13px]">
              {error}
            </NoticeBox>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-brand-soft"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-console-rail px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-console-rail-deep disabled:opacity-60"
            >
              {isSubmitting ? "Saving…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
