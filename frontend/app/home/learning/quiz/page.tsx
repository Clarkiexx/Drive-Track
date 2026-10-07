"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronLeft, X } from "lucide-react";

import AppBar from "@/components/common/AppBar";
import BottomNav from "@/components/common/BottomNav";
import PageBody from "@/components/common/PageBody";
import SignShape from "@/components/common/SignShape";
import { findSignById, quizQuestions, type QuizQuestion } from "@/data/trafficSigns";

/**
 * Fisher–Yates. The RN screen used `sort(() => Math.random() - 0.5)`, which is
 * not a valid shuffle — the comparator is inconsistent, so the result is
 * biased and some orders are unreachable. Same intent (a fresh order per
 * attempt), done properly.
 *
 * Skipped during SSR so the server and the first client render agree on the
 * question order. The route is only ever mounted in the browser (RoleGate
 * renders null on the server), but the guard makes that a local decision
 * rather than a hidden dependency on the parent.
 */
function shuffledQuestions(): QuizQuestion[] {
  if (typeof window === "undefined") return quizQuestions;

  const copy = [...quizQuestions];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Tiered result copy from QuizScreen — the emoji and wording are the source's. */
function resultFor(pct: number): { emoji: string; message: string } {
  if (pct >= 80) {
    return {
      emoji: "🏆",
      message: "Excellent! You know your road signs well.",
    };
  }
  if (pct >= 50) {
    return {
      emoji: "👍",
      message: "Good effort — review the signs you missed in the Learning Center.",
    };
  }
  return {
    emoji: "📚",
    message: "Keep practicing! Review the Learning Center and try again.",
  };
}

export default function QuizPage() {
  const [questions, setQuestions] = useState<QuizQuestion[]>(shuffledQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const currentQuestion = questions[currentIndex];
  const sign = findSignById(currentQuestion.signId);

  function handleSelectOption(index: number) {
    if (hasAnswered) return;
    setSelectedOption(index);
    setHasAnswered(true);
    if (index === currentQuestion.correctIndex) {
      setScore((current) => current + 1);
    }
  }

  function handleNext() {
    if (currentIndex + 1 >= questions.length) {
      setIsFinished(true);
      return;
    }
    setCurrentIndex((index) => index + 1);
    setSelectedOption(null);
    setHasAnswered(false);
  }

  // Retake draws a new order as well as resetting the run, so a driver who
  // memorised the sequence can't coast through a second attempt.
  function handleRestart() {
    setQuestions(shuffledQuestions());
    setCurrentIndex(0);
    setSelectedOption(null);
    setHasAnswered(false);
    setScore(0);
    setIsFinished(false);
  }

  const total = questions.length;
  const pct = Math.round((score / total) * 100);

  return (
    <>
      <AppBar title={isFinished ? "Quiz Results" : "Sign Quiz"} backHref="/home/learning" />

      {isFinished ? (
        <QuizResults
          score={score}
          total={total}
          pct={pct}
          onRetake={handleRestart}
        />
      ) : (
        <>
          {/* RN's progressRow + progressTrack, collapsed into one band. */}
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
            {/* Keyed on the question so switching questions re-runs the entrance
                and the sign does not appear to morph between shapes. */}
            <div
              key={currentQuestion.id}
              className="rise mb-4 grid h-[90px] place-items-center"
            >
              {sign ? (
                <SignShape shape={sign.shape} color={sign.color} size={64} />
              ) : null}
            </div>

            <p className="mb-4 text-center text-[16px] font-bold text-ink">
              {currentQuestion.question}
            </p>

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
                  <li key={option}>
                    <button
                      type="button"
                      disabled={hasAnswered}
                      onClick={() => handleSelectOption(index)}
                      className={`flex w-full items-center gap-2 rounded-[10px] border p-3.5 text-left text-[14px] text-ink transition-colors duration-150 ${tone} ${
                        hasAnswered ? "cursor-default" : "hover:border-brand-300"
                      }`}
                    >
                      <span className="min-w-0 flex-1">{option}</span>
                      {/* RN signalled the outcome with background colour alone.
                          The ring below carries the same verdict without relying
                          on it, and the label keeps it available to a screen
                          reader — colour is never the only cue. */}
                      {hasAnswered && isCorrect ? (
                        <>
                          <Check size={16} strokeWidth={3} className="shrink-0 text-go-ink" aria-hidden />
                          <span className="sr-only">Correct answer</span>
                        </>
                      ) : null}
                      {isPickedWrong ? (
                        <>
                          <X size={16} strokeWidth={3} className="shrink-0 text-signal-stop" aria-hidden />
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
      )}

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

/** The result card from QuizScreen's `isFinished` branch, split out for readability. */
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