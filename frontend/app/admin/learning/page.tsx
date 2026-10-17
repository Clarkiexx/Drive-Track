"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpenText, GraduationCap, Plus, RotateCw } from "lucide-react";

import EmptyState from "@/components/common/EmptyState";
import FormField from "@/components/common/FormField";
import NoticeBox from "@/components/common/NoticeBox";
import SignShape from "@/components/common/SignShape";
import { getApiErrorMessage } from "@/lib/axios";
import {
  SIGN_CATEGORIES,
  SIGN_GLYPHS,
  SIGN_SHAPES,
  type SignCategory,
  type SignGlyph,
  type SignShape as SignShapeName,
} from "@/data/trafficSigns";
import {
  learningService,
  type LearningQuizRecord,
  type LearningSignCreateInput,
  type LearningSignRecord,
} from "@/services/learning.service";

type Tab = "signs" | "quiz";

/** "inverted-triangle" → "Inverted triangle" — technical tokens, prettified. */
function prettyToken(value: string): string {
  const spaced = value.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export default function AdminLearningPage() {
  const [tab, setTab] = useState<Tab>("signs");
  const [signs, setSigns] = useState<LearningSignRecord[]>([]);
  const [quiz, setQuiz] = useState<LearningQuizRecord[]>([]);
  const [showArchived, setShowArchived] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [showCreateSign, setShowCreateSign] = useState(false);
  const [editingSign, setEditingSign] = useState<LearningSignRecord | null>(null);
  const [showCreateQuiz, setShowCreateQuiz] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<LearningQuizRecord | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const [signRows, quizRows] = await Promise.all([
        learningService.listSigns(),
        learningService.listQuiz(),
      ]);
      setSigns(signRows);
      setQuiz(quizRows);
    } catch (err) {
      setSigns([]);
      setQuiz([]);
      setLoadError(getApiErrorMessage(err, "Unable to load the Learning Center content."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function handleToggleSignStatus(row: LearningSignRecord) {
    if (actingId !== null) return;
    setActingId(row.id);
    setActionError("");
    setActionNotice("");
    try {
      // Archiving hides the sign from GET /learning/signs?active=true, which
      // the driver Learning Center reads. Quiz questions keep their reference
      // and are hidden along with their sign by GET /learning/quiz?active=true.
      await learningService.updateSignStatus(row.id, !row.isActive);
      setActionNotice(`“${row.name}” is now ${row.isActive ? "archived" : "active"}.`);
      await load();
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Unable to update sign status."));
    } finally {
      setActingId(null);
    }
  }

  async function handleToggleQuizStatus(row: LearningQuizRecord) {
    if (actingId !== null) return;
    setActingId(row.id);
    setActionError("");
    setActionNotice("");
    try {
      await learningService.updateQuizQuestionStatus(row.id, !row.isActive);
      const snippet = `${row.question.slice(0, 48)}${row.question.length > 48 ? "…" : ""}`;
      setActionNotice(`Question “${snippet}” is now ${row.isActive ? "archived" : "active"}.`);
      await load();
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Unable to update question status."));
    } finally {
      setActingId(null);
    }
  }

  const visibleSigns = showArchived ? signs : signs.filter((row) => row.isActive);
  const visibleQuiz = showArchived ? quiz : quiz.filter((row) => row.isActive);
  const activeSignCount = signs.filter((row) => row.isActive).length;
  const activeQuizCount = quiz.filter((row) => row.isActive).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold tracking-[0.18em] text-brand-600 uppercase">
            Learning Center
          </p>
          <h2 className="font-display mt-1.5 text-[22px] leading-tight font-semibold tracking-tight text-ink">
            Sign catalogue & quiz
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-console-muted">
            Maintain the road signs and quiz questions drivers study in the app.
            Archived entries disappear from the driver Learning Center and Quiz —
            nothing is ever deleted.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => (tab === "signs" ? setShowCreateSign(true) : setShowCreateQuiz(true))}
            className="inline-flex items-center gap-2 rounded-xl bg-console-rail px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-console-rail-deep"
          >
            <Plus size={14} strokeWidth={2.3} aria-hidden />
            {tab === "signs" ? "Add Sign" : "Add Question"}
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

      <div
        role="tablist"
        aria-label="Learning Center content"
        className="mb-5 inline-flex items-center gap-1 rounded-xl border border-console-line bg-surface p-1 shadow-console"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "signs"}
          onClick={() => setTab("signs")}
          className={`rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
            tab === "signs"
              ? "bg-console-rail text-white"
              : "text-console-muted hover:bg-brand-soft hover:text-ink"
          }`}
        >
          Signs
          <span
            className={`tabular-nums ml-1.5 text-[11px] ${
              tab === "signs" ? "text-white/70" : "text-console-muted"
            }`}
          >
            {signs.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "quiz"}
          onClick={() => setTab("quiz")}
          className={`rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
            tab === "quiz"
              ? "bg-console-rail text-white"
              : "text-console-muted hover:bg-brand-soft hover:text-ink"
          }`}
        >
          Quiz Questions
          <span
            className={`tabular-nums ml-1.5 text-[11px] ${
              tab === "quiz" ? "text-white/70" : "text-console-muted"
            }`}
          >
            {quiz.length}
          </span>
        </button>
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

      {tab === "signs" ? (
        <section
          className="rise overflow-hidden rounded-2xl border border-console-line bg-surface shadow-console"
          aria-live="polite"
        >
          <header className="flex flex-wrap items-center gap-2.5 border-b border-console-line px-5 py-3.5">
            <GraduationCap size={16} strokeWidth={2.1} className="shrink-0 text-brand-600" aria-hidden />
            <h3 className="font-display text-[15px] leading-none font-semibold tracking-tight text-ink">
              Sign catalogue
            </h3>
            <p className="ml-auto shrink-0 text-[11.5px] leading-none text-console-muted">
              {activeSignCount} active of {signs.length}
            </p>
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] font-semibold text-console-muted">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
                className="size-3.5 accent-brand-600"
              />
              Show archived
            </label>
          </header>

          {isLoading ? (
            <ul aria-hidden className="divide-y divide-console-line/70">
              {[0, 1, 2, 3].map((index) => (
                <li key={index} className="flex items-center gap-3 px-5 py-4">
                  <div className="breathe size-10 shrink-0 rounded-lg bg-console-canvas" />
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
          ) : visibleSigns.length === 0 ? (
            <EmptyState title="No learning signs found">
              {showArchived
                ? "The catalogue is empty — add the first sign to get started."
                : "No active signs. Toggle “Show archived” to review retired entries."}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] border-collapse text-left">
                <caption className="sr-only">Road signs in the Learning Center catalogue</caption>
                <thead>
                  <tr className="border-b border-console-line bg-console-canvas/70 text-[10.5px] tracking-[0.14em] text-console-muted uppercase">
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Sign
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Category
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-right font-bold">
                      Order
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
                  {visibleSigns.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-console-line/70 transition-colors last:border-0 hover:bg-brand-50/70"
                    >
                      <td className="px-5 py-3.5 align-top">
                        <div className="flex items-center gap-3">
                          {/* Same plate the driver app draws — 36px in the table. */}
                          <span className="grid size-10 shrink-0 place-items-center">
                            <SignShape
                              shape={row.shape}
                              color={row.color}
                              size={36}
                              glyph={row.glyph}
                              prohibited={row.prohibited}
                              solid={row.solid}
                            />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-ink">{row.name}</p>
                            <p
                              className="mt-0.5 max-w-[24rem] truncate text-[12px] text-console-muted"
                              title={row.meaning}
                            >
                              {row.meaning}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 align-top text-[13px] text-ink/80">
                        {row.category}
                      </td>
                      <td className="tabular-nums px-5 py-3.5 text-right align-top text-[13px] text-ink/80">
                        {row.sortOrder}
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <button
                          type="button"
                          onClick={() => void handleToggleSignStatus(row)}
                          disabled={actingId !== null}
                          title={
                            row.isActive
                              ? "Archive — hides from the driver Learning Center"
                              : "Restore — shows in the driver Learning Center"
                          }
                          aria-pressed={row.isActive}
                          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-[3px] text-[11px] leading-tight font-bold transition-opacity disabled:opacity-60 ${
                            row.isActive ? "bg-go-soft text-go-ink" : "bg-chip-neutral text-muted"
                          }`}
                        >
                          {row.isActive ? "Active" : "Archived"}
                        </button>
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <button
                          type="button"
                          onClick={() => setEditingSign(row)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-console-line bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section
          className="rise overflow-hidden rounded-2xl border border-console-line bg-surface shadow-console"
          aria-live="polite"
        >
          <header className="flex flex-wrap items-center gap-2.5 border-b border-console-line px-5 py-3.5">
            <BookOpenText size={16} strokeWidth={2.1} className="shrink-0 text-brand-600" aria-hidden />
            <h3 className="font-display text-[15px] leading-none font-semibold tracking-tight text-ink">
              Quiz questions
            </h3>
            <p className="ml-auto shrink-0 text-[11.5px] leading-none text-console-muted">
              {activeQuizCount} active of {quiz.length}
            </p>
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] font-semibold text-console-muted">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
                className="size-3.5 accent-brand-600"
              />
              Show archived
            </label>
          </header>

          {isLoading ? (
            <ul aria-hidden className="divide-y divide-console-line/70">
              {[0, 1, 2, 3].map((index) => (
                <li key={index} className="flex items-center gap-3 px-5 py-4">
                  <div className="breathe h-3 w-56 rounded-full bg-console-canvas" />
                  <div className="breathe h-3 w-32 rounded-full bg-console-canvas [animation-delay:120ms]" />
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
          ) : visibleQuiz.length === 0 ? (
            <EmptyState title="No quiz questions yet">
              {showArchived
                ? "Add the first question — each one shows a sign and four answers."
                : "No active questions. Toggle “Show archived” to review retired entries."}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] border-collapse text-left">
                <caption className="sr-only">Quiz questions in the Learning Center</caption>
                <thead>
                  <tr className="border-b border-console-line bg-console-canvas/70 text-[10.5px] tracking-[0.14em] text-console-muted uppercase">
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Question
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Correct answer
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
                  {visibleQuiz.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-console-line/70 transition-colors last:border-0 hover:bg-brand-50/70"
                    >
                      <td className="px-5 py-3.5 align-top">
                        <p
                          className="max-w-[30rem] truncate text-[13px] font-bold text-ink"
                          title={row.question}
                        >
                          {row.question}
                        </p>
                        <p className="mt-0.5 text-[12px] text-console-muted">
                          {row.sign ? row.sign.name : row.signId}
                          {row.sign && !row.sign.isActive ? " — sign archived" : ""}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 align-top text-[13px] text-ink/80">
                        {(row.options[row.correctIndex] ?? "—") as string}
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <button
                          type="button"
                          onClick={() => void handleToggleQuizStatus(row)}
                          disabled={actingId !== null}
                          title={
                            row.isActive
                              ? "Archive — hides from the driver Quiz"
                              : "Restore — shows in the driver Quiz"
                          }
                          aria-pressed={row.isActive}
                          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-[3px] text-[11px] leading-tight font-bold transition-opacity disabled:opacity-60 ${
                            row.isActive ? "bg-go-soft text-go-ink" : "bg-chip-neutral text-muted"
                          }`}
                        >
                          {row.isActive ? "Active" : "Archived"}
                        </button>
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <button
                          type="button"
                          onClick={() => setEditingQuiz(row)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-console-line bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {showCreateSign ? (
        <SignFormDialog
          title="Add learning sign"
          submitLabel="Create Sign"
          onClose={() => setShowCreateSign(false)}
          onSubmit={async (input) => {
            await learningService.createSign(input);
            setShowCreateSign(false);
            setActionNotice(`“${input.name}” added — live in the driver Learning Center.`);
            setActionError("");
            await load();
          }}
        />
      ) : null}

      {editingSign ? (
        <SignFormDialog
          title={`Edit — ${editingSign.name}`}
          submitLabel="Save Changes"
          initial={editingSign}
          onClose={() => setEditingSign(null)}
          onSubmit={async (input) => {
            await learningService.updateSign(editingSign.id, input);
            setEditingSign(null);
            setActionNotice("Learning sign updated — drivers see it on their next load.");
            setActionError("");
            await load();
          }}
        />
      ) : null}

      {showCreateQuiz ? (
        <QuizFormDialog
          title="Add quiz question"
          submitLabel="Create Question"
          signOptions={signs}
          onClose={() => setShowCreateQuiz(false)}
          onSubmit={async (input) => {
            await learningService.createQuizQuestion(input);
            setShowCreateQuiz(false);
            setActionNotice("Quiz question added — live in the driver Quiz.");
            setActionError("");
            await load();
          }}
        />
      ) : null}

      {editingQuiz ? (
        <QuizFormDialog
          title="Edit quiz question"
          submitLabel="Save Changes"
          initial={editingQuiz}
          signOptions={signs}
          onClose={() => setEditingQuiz(null)}
          onSubmit={async (input) => {
            await learningService.updateQuizQuestion(editingQuiz.id, input);
            setEditingQuiz(null);
            setActionNotice("Quiz question updated.");
            setActionError("");
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function SignFormDialog({
  title,
  submitLabel,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initial?: LearningSignRecord | null;
  onClose: () => void;
  onSubmit: (input: LearningSignCreateInput) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<SignCategory>(initial?.category ?? "Regulatory");
  const [shape, setShape] = useState<SignShapeName>(initial?.shape ?? "circle");
  const [glyph, setGlyph] = useState<SignGlyph>(initial?.glyph ?? "bar");
  const [color, setColor] = useState(initial?.color ?? "#DC2626");
  const [meaning, setMeaning] = useState(initial?.meaning ?? "");
  const [prohibited, setProhibited] = useState(initial?.prohibited ?? false);
  const [solid, setSolid] = useState(initial?.solid ?? false);
  const [sortOrder, setSortOrder] = useState(initial ? String(initial.sortOrder) : "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // The native color picker only accepts a full lowercase hex; the text field
  // is free-form so admins can paste a colour from the sign chart.
  const previewColor = HEX_COLOR.test(color) ? color : "#94A3B8";
  const pickerColor = HEX_COLOR.test(color) ? color.toLowerCase() : "#000000";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!name.trim() || !meaning.trim()) {
      setError("Name and meaning are required.");
      return;
    }
    if (!HEX_COLOR.test(color.trim())) {
      setError("Color must be a 6-digit hex value like #DC2626.");
      return;
    }
    setIsSubmitting(true);
    try {
      // The service re-validates with zod (mirrors the backend
      // express-validator rules) before sending.
      await onSubmit({
        name: name.trim(),
        category,
        shape,
        glyph,
        color: color.trim(),
        meaning: meaning.trim(),
        prohibited,
        solid,
        ...(sortOrder.trim() ? { sortOrder: Number(sortOrder) } : {}),
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "Unable to save learning sign."));
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
        className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-console-line bg-surface p-5 shadow-float"
        onClick={(event) => event.stopPropagation()}
      >
        <h4 className="font-display text-[15px] font-semibold tracking-tight text-ink">{title}</h4>
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          {/* Live preview — exactly the plate + copy a driver card shows. */}
          <div className="flex items-center gap-4 rounded-xl border border-console-line bg-console-canvas/60 p-4">
            <span className="grid size-20 shrink-0 place-items-center">
              <SignShape
                shape={shape}
                color={previewColor}
                size={64}
                glyph={glyph}
                prohibited={prohibited}
                solid={solid}
              />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-ink">{name.trim() || "Sign name"}</p>
              <p className="mt-0.5 text-[11px] text-console-muted">{category}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-console-muted">
                {meaning.trim() || "The meaning shown under the sign in the driver app."}
              </p>
            </div>
          </div>

          {initial ? (
            <FormField
              label="Sign ID"
              value={initial.id}
              readOnly
              disabled
              hint="Stable id quiz questions reference — it cannot change."
            />
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label="Name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. No Left Turn"
            />
            <div>
              <label
                htmlFor="ls-category"
                className="mb-1.5 block text-[13px] font-semibold text-ink"
              >
                Category
              </label>
              <select
                id="ls-category"
                value={category}
                onChange={(event) => setCategory(event.target.value as SignCategory)}
                className="dt-input"
              >
                {SIGN_CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ls-shape" className="mb-1.5 block text-[13px] font-semibold text-ink">
                Shape
              </label>
              <select
                id="ls-shape"
                value={shape}
                onChange={(event) => setShape(event.target.value as SignShapeName)}
                className="dt-input"
              >
                {SIGN_SHAPES.map((option) => (
                  <option key={option} value={option}>
                    {prettyToken(option)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ls-glyph" className="mb-1.5 block text-[13px] font-semibold text-ink">
                Symbol
              </label>
              <select
                id="ls-glyph"
                value={glyph}
                onChange={(event) => setGlyph(event.target.value as SignGlyph)}
                className="dt-input"
              >
                {SIGN_GLYPHS.map((option) => (
                  <option key={option} value={option}>
                    {prettyToken(option)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="ls-color" className="mb-1.5 block text-[13px] font-semibold text-ink">
              Color
            </label>
            <div className="flex items-center gap-2">
              <input
                id="ls-color"
                type="color"
                value={pickerColor}
                onChange={(event) => setColor(event.target.value)}
                aria-label="Pick sign color"
                className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-console-line bg-surface p-1"
              />
              <input
                type="text"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                aria-label="Color hex value"
                spellCheck={false}
                placeholder="#DC2626"
                className="dt-input"
              />
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted">
              6-digit hex — keep the official sign colour.
            </p>
          </div>

          <FormField
            label="Meaning"
            required
            as="textarea"
            value={meaning}
            onChange={(event) => setMeaning(event.target.value)}
            placeholder="e.g. Turning left is not allowed at this junction."
          />

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <label className="flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-ink">
              <input
                type="checkbox"
                checked={prohibited}
                onChange={(event) => setProhibited(event.target.checked)}
                className="size-3.5 accent-brand-600"
              />
              Red slash (prohibition)
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-ink">
              <input
                type="checkbox"
                checked={solid}
                onChange={(event) => setSolid(event.target.checked)}
                className="size-3.5 accent-brand-600"
              />
              Solid disc (mandatory)
            </label>
            <div className="ml-auto w-28">
              <FormField
                label="Order"
                type="number"
                min="0"
                max="9999"
                step="1"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
                placeholder="0"
              />
            </div>
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

function QuizFormDialog({
  title,
  submitLabel,
  initial,
  signOptions,
  onClose,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initial?: LearningQuizRecord | null;
  signOptions: LearningSignRecord[];
  onClose: () => void;
  onSubmit: (input: { signId: string; question: string; options: string[]; correctIndex: number }) => Promise<void>;
}) {
  const [signId, setSignId] = useState(initial?.signId ?? signOptions[0]?.id ?? "");
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [options, setOptions] = useState<string[]>(
    initial ? [...initial.options] : ["", "", "", ""]
  );
  const [correctIndex, setCorrectIndex] = useState(initial?.correctIndex ?? 0);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedSign = signOptions.find((sign) => sign.id === signId) ?? null;

  function setOption(index: number, value: string) {
    setOptions((current) => current.map((option, i) => (i === index ? value : option)));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!signId) {
      setError("Pick the sign this question shows — add a sign first if the catalogue is empty.");
      return;
    }
    if (!question.trim()) {
      setError("Question is required.");
      return;
    }
    if (options.some((option) => !option.trim())) {
      setError("All 4 answer options are required.");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({
        signId,
        question: question.trim(),
        options: options.map((option) => option.trim()),
        correctIndex,
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "Unable to save quiz question."));
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
        className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-console-line bg-surface p-5 shadow-float"
        onClick={(event) => event.stopPropagation()}
      >
        <h4 className="font-display text-[15px] font-semibold tracking-tight text-ink">{title}</h4>
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <div>
            <label htmlFor="lq-sign" className="mb-1.5 block text-[13px] font-semibold text-ink">
              Shown sign
            </label>
            <select
              id="lq-sign"
              value={signId}
              onChange={(event) => setSignId(event.target.value)}
              className="dt-input"
            >
              {signOptions.length === 0 ? <option value="">No signs available</option> : null}
              {signOptions.map((sign) => (
                <option key={sign.id} value={sign.id}>
                  {sign.name}
                  {sign.isActive ? "" : " (archived)"}
                </option>
              ))}
            </select>
          </div>

          {selectedSign ? (
            <div className="flex items-center gap-3 rounded-xl border border-console-line bg-console-canvas/60 px-3.5 py-3">
              <span className="grid size-12 shrink-0 place-items-center">
                <SignShape
                  shape={selectedSign.shape}
                  color={selectedSign.color}
                  glyph={selectedSign.glyph}
                  prohibited={selectedSign.prohibited}
                  solid={selectedSign.solid}
                />
              </span>
              <p className="min-w-0 flex-1 text-[12px] leading-snug text-console-muted">
                {selectedSign.name} — {selectedSign.meaning}
              </p>
            </div>
          ) : null}

          <FormField
            label="Question"
            required
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="e.g. What should you do when you see this sign?"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            {options.map((option, index) => (
              <FormField
                key={index}
                label={`Option ${index + 1}`}
                required
                value={option}
                onChange={(event) => setOption(index, event.target.value)}
                placeholder={index === 0 ? "e.g. Come to a complete stop" : ""}
              />
            ))}
          </div>

          <div>
            <label htmlFor="lq-correct" className="mb-1.5 block text-[13px] font-semibold text-ink">
              Correct answer
            </label>
            <select
              id="lq-correct"
              value={String(correctIndex)}
              onChange={(event) => setCorrectIndex(Number(event.target.value))}
              className="dt-input"
            >
              {options.map((option, index) => (
                <option key={index} value={index}>
                  Option {index + 1}
                  {option.trim() ? ` — ${option.trim()}` : ""}
                </option>
              ))}
            </select>
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
