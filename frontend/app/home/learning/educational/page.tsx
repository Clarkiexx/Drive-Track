"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ChevronLeft, X } from "lucide-react";

import AppBar from "@/components/common/AppBar";
import BottomNav from "@/components/common/BottomNav";
import EmptyState from "@/components/common/EmptyState";
import PageBody from "@/components/common/PageBody";
import { educationalQuestions } from "@/data/trafficSigns";
import { learningService } from "@/services/learning.service";

/** One answerable question, text-only — there is no sign plate above it. */
type StudyItem = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
};

/**
 * Fisher–Yates — same rationale as the sign quiz: a fresh question order per
 * attempt so a driver who memorised the sequence can't coast through a retake.
 * Only ever runs in the browser: the list arrives through a useEffect fetch,
 * so the server and the first client render both show the loading state and
 * never disagree on an order.
 */
function shuffledItems(source: StudyItem[]): StudyItem[] {
  const copy = [...source];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Bundled rows — the copy that runs when the API cannot be reached. */
function bundledStudyItems(): StudyItem[] {
  return educationalQuestions.map((entry) => ({
    id: entry.id,
    question: entry.question,
    options: entry.options,
    correctIndex: entry.correctIndex,
  }));
}

/** Tiered result copy, adapted from the sign quiz for the text-only set. */
function resultFor(pct: number): { emoji: string; message: string } {
  if (pct >= 80) {
    return {
      emoji: "🏆",
      message: "Excellent! You know your traffic rules well.",
    };
  }
  if (pct >= 50) {
    return {
      emoji: "👍",
      message: "Good effort — review the Educational questions in the Learning Center.",
    };
  }
  return {
    emoji: "📚",
    message: "Keep practicing! Review the Educational questions and try again.",
  };
}

/**
 * Educational Quiz — the text-only practice set, answered like the sign quiz:
 * one question at a time, tap to answer, immediate right/wrong feedback, a
 * final score and a retake. The answers-visible study view lives in the
 * Learning Center's "Educational" filter chip.
 *
 * Content is the admin-managed practice set
 * (GET /learning/educational?active=true); the bundled copy answers whenever
 * the API cannot be reached.
 */
export default function EducationalQuizPage() {
  // null while the live set loads; the bundled copy takes over on failure,
  // and an empty live set (all archived) stays empty on purpose.
  const [questions, setQuestions] = useState<StudyItem[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    learningService
      .listActiveEducational()
      .then((rows) => {
        if (cancelled) return;
        setQuestions(
          shuffledItems(
            rows.map((row) => ({
              id: row.id,
              question: row.question,
              options: row.options,
              correctIndex: row.correctIndex,
            }))
          )
        );
      })
      .catch(() => {
        // Offline or API down: answer the bundled set instead.
        if (!cancelled) setQuestions(shuffledItems(bundledStudyItems()));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentQuestion =
    questions && currentIndex < questions.length ? questions[currentIndex] : null;
  const total = questions?.length ?? 0;
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  function handleSelectOption(index: number) {
    if (!currentQuestion || hasAnswered) return;
    setSelectedOption(index);
    setHasAnswered(true);
    if (index === currentQuestion.correctIndex) {
      setScore((current) => current + 1);
    }
  }

  function handleNext() {
    if (!questions) return;
    if (currentIndex + 1 >= questions.length) {
      setIsFinished(true);
      return;
    }
    setCurrentIndex((index) => index + 1);
    setSelectedOption(null);
    setHasAnswered(false);
  }

  // Retake draws a new order as well as resetting the run. Same set — the
  // questions were already loaded (live or bundled).
  function handleRestart() {
    if (!questions) return;
    setQuestions(shuffledItems(questions));
    setCurrentIndex(0);
    setSelectedOption(null);
    setHasAnswered(false);
    setScore(0);
    setIsFinished(false);
  }

  return (
    <>
      <AppBar title={isFinished ? "Quiz Results" : "Educational Quiz"} backHref="/home/learning" />

      {!questions ? (
        /* Live fetch in flight — breathe blocks keep the layout calm. */
        <PageBody className="pt-5">
          <div aria-hidden className="flex flex-col gap-3">
            <div className="breathe mx-auto h-4 w-3/4 rounded-full bg-surface-sunken" />
            <div className="breathe h-12 rounded-[10px] bg-surface-sunken [animation-delay:120ms]" />
            <div className="breathe h-12 rounded-[10px] bg-surface-sunken [animation-delay:200ms]" />
            <div className="breathe h-12 rounded-[10px] bg-surface-sunken [animation-delay:280ms]" />
            <div className="breathe h-12 rounded-[10px] bg-surface-sunken [animation-delay:360ms]" />
          </div>
        </PageBody>
      ) : total === 0 ? (
        <PageBody className="pt-5">
          <EmptyState
            title="No practice questions right now"
            action={{ label: "Back to Learning Center", href: "/home/learning" }}
          >
            The Educational questions are being updated — review the road signs while you wait.
          </EmptyState>
        </PageBody>
      ) : isFinished ? (
        <QuizResults score={score} total={total} pct={pct} onRetake={handleRestart} />
      ) : currentQuestion ? (
        <>
          {/* Same progress band as the sign quiz. */}
          <div className="border-b border-hairline bg-surface px-5 pb-3">
            <div className="flex items-baseline justify-between pt-3">
              <p className="text-[12px] text-muted">
                Question {currentIndex + 1} of {total}
              </p>
              <p className="tabular text-[12px] font-bold text-brand-500">Score: {score}</p>
            </div>

            <div
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={total}
              aria-valuenow={currentIndex + 1}
              aria-label={`Question ${currentIndex + 1} of ${total}`}
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hairline"
            >
              <div
                className="h-full rounded-full bg-brand-500 transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
              />
            </div>
          </div>

          <PageBody className="pt-5">
            {/* No sign plate — the question itself is the whole prompt. Keyed
                on the question so the entrance re-runs between questions. */}
            <div key={currentQuestion.id} className="rise mb-4">
              <p className="text-center text-[16px] font-bold text-ink">
                {currentQuestion.question}
              </p>
            </div>

            <ul className="flex flex-col gap-2.5">
              {currentQuestion.options.map((option, index) => {
                const isCorrect = index === currentQuestion.correctIndex;
                const isPickedWrong = hasAnswered && index === selectedOption && !isCorrect;

                const tone = !hasAnswered
                  ? "border-hairline bg-surface"
                  : isCorrect
                    ? "border-go-ink bg-go-soft"
                    : isPickedWrong
                      ? "border-signal-stop bg-danger-soft"
                      : "border-hairline bg-surface";

                return (
                  <li key={`${currentQuestion.id}-${index}`}>
                    <button
                      type="button"
                      disabled={hasAnswered}
                      onClick={() => handleSelectOption(index)}
                      className={`flex w-full items-center gap-2 rounded-[10px] border p-3.5 text-left text-[14px] text-ink transition-colors duration-150 ${tone} ${
                        hasAnswered ? "cursor-default" : "hover:border-brand-300"
                      }`}
                    >
                      <span className="min-w-0 flex-1">{option}</span>
                      {/* Verdict carried by the ring + icon + label, never by
                          colour alone. */}
                      {hasAnswered && isCorrect ? (
                        <>
                          <Check
                            size={16}
                            strokeWidth={3}
                            className="shrink-0 text-go-ink"
                            aria-hidden
                          />
                          <span className="sr-only">Correct answer</span>
                        </>
                      ) : null}
                      {isPickedWrong ? (
                        <>
                          <X
                            size={16}
                            strokeWidth={3}
                            className="shrink-0 text-signal-stop"
                            aria-hidden
                          />
                          <span className="sr-only">Your answer — incorrect</span>
                        </>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>

            {hasAnswered ? (
              <button
                type="button"
                onClick={handleNext}
                className="mt-2.5 w-full rounded-[10px] bg-brand-500 py-3.5 text-center text-[14px] font-bold text-white transition-colors duration-150 hover:bg-brand-600 active:bg-brand-700"
              >
                {currentIndex + 1 >= total ? "See Results →" : "Next Question →"}
              </button>
            ) : null}
          </PageBody>
        </>
      ) : null}

      <BottomNav />
    </>
  );
}

type QuizResultsProps = {
  score: number;
  total: number;
  pct: number;
  onRetake: () => void;
};

/** The result card from the sign quiz, split out for readability. */
function QuizResults({ score, total, pct, onRetake }: QuizResultsProps) {
  const { emoji, message } = resultFor(pct);

  return (
    <PageBody className="pt-5">
      <div className="rise rounded-2xl bg-surface p-[30px] text-center">
        <p className="mb-2.5 text-[40px] leading-none" aria-hidden>
          {emoji}
        </p>

        <p className="tabular font-display text-[28px] font-bold text-ink">
          {score} / {total}
        </p>
        <p className="tabular mt-1 mb-4 text-[14px] text-muted">{pct}% Correct</p>

        <p className="mb-5 text-[13px] leading-[19px] text-muted">{message}</p>

        <button
          type="button"
          onClick={onRetake}
          className="rounded-[10px] bg-brand-500 px-[30px] py-[13px] text-[14px] font-bold text-white transition-colors duration-150 hover:bg-brand-600 active:bg-brand-700"
        >
          Retake Quiz
        </button>
      </div>

      <Link
        href="/home/learning"
        className="mx-auto mt-4 flex items-center justify-center gap-1 text-[13px] font-semibold text-brand-500 underline-offset-2 hover:underline"
      >
        <ChevronLeft size={15} strokeWidth={2.4} aria-hidden />
        Back to Learning Center
      </Link>
    </PageBody>
  );
}
