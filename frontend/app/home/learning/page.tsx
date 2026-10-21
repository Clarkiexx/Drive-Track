"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";

import AppBar from "@/components/common/AppBar";
import BottomNav from "@/components/common/BottomNav";
import ChipRow, { type ChipOption } from "@/components/common/ChipRow";
import EmptyState from "@/components/common/EmptyState";
import FilterBar from "@/components/common/FilterBar";
import PageBody from "@/components/common/PageBody";
import SignShape from "@/components/common/SignShape";
import {
  SIGN_CATEGORIES,
  educationalQuestions,
  trafficSigns,
  type EducationalQuestion,
  type SignCategory,
  type TrafficSign,
} from "@/data/trafficSigns";
import { learningService } from "@/services/learning.service";

/**
 * One chip per sign category, plus the Educational section — a chip that
 * swaps the list from signs to the practice questions (answers shown), so
 * everything a driver studies lives under one filter row.
 *
 * No "All" chip: every sign belongs to a category, and the four remaining
 * chips then fit the phone width on one line.
 */
const CATEGORY_OPTIONS: ChipOption[] = [
  ...SIGN_CATEGORIES.map((category) => ({ value: category, label: category })),
  { value: "Educational", label: "Educational" },
];

type CategoryFilter = SignCategory | "Educational";

/**
 * Learning Center — driver-app/src/screens/LearningCenterScreen.js.
 *
 * A pushed screen inside the driver shell: AppBar with a back arrow, a chip
 * strip that filters the catalogue, and a card per sign.
 *
 * Content is the admin-managed catalogue (GET /learning/signs?active=true).
 * The bundled copy renders immediately and stays whenever the API cannot be
 * reached, so the screen never waits on the network to show something; a
 * successful fetch makes the live rows the only source of truth (an empty
 * live catalogue really means "nothing published", not "offline").
 */
export default function LearningCenterPage() {
  // No "All" chip — the row opens on the first category instead.
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>(SIGN_CATEGORIES[0]);
  const [signs, setSigns] = useState<TrafficSign[]>(trafficSigns);
  const [educational, setEducational] = useState<EducationalQuestion[]>(educationalQuestions);

  useEffect(() => {
    let cancelled = false;
    learningService
      .listActiveSigns()
      .then((rows) => {
        // LearningSignRecord is a superset of TrafficSign — the live
        // catalogue replaces the bundled one wholesale.
        if (!cancelled) setSigns(rows);
      })
      .catch(() => {
        // Offline or API down: keep the bundled (seed) catalogue.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    learningService
      .listActiveEducational()
      .then((rows) => {
        // Same contract as the signs list: a successful fetch makes the live
        // (admin-managed) set the only source of truth.
        if (!cancelled) {
          setEducational(
            rows.map((row) => ({
              id: row.id,
              question: row.question,
              options: row.options,
              correctIndex: row.correctIndex,
            }))
          );
        }
      })
      .catch(() => {
        // Offline or API down: keep the bundled (seed) questions.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // "Educational" never matches a category, so this stays empty while the
  // practice questions branch renders instead.
  const filteredSigns = useMemo(
    () => signs.filter((sign) => sign.category === activeCategory),
    [activeCategory, signs]
  );

  return (
    <>
      <AppBar title="Learning Center" backHref="/home" />

      <FilterBar>
        {/* scrollable: a safety net — the four chips fit on one line at phone
            width; this keeps them from ever wrapping to a second row. */}
        <ChipRow
          label="Filter by category or section"
          options={CATEGORY_OPTIONS}
          value={activeCategory}
          onChange={(value) => setActiveCategory(value as CategoryFilter)}
          scrollable
          className="-mx-4 px-4"
        />
      </FilterBar>

      {/* withNav={false}: the sticky quiz bar below already reserves the tab-bar
          height via pb-nav-safe, so the default pb-nav would double the gap. */}
      <PageBody withNav={false} className="pt-4">
        {activeCategory === "Educational" ? (
          educational.length === 0 ? (
            <EmptyState title="No practice questions right now">
              The Educational section is being updated — check back soon.
            </EmptyState>
          ) : (
            <ol className="flex flex-col gap-3">
              {educational.map((item, index) => (
                <li
                  key={item.id}
                  className="rise-sm rounded-xl border border-hairline bg-surface p-4"
                  style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
                >
                  <p className="text-[15px] leading-[21px] font-bold text-ink">
                    <span className="tabular mr-1.5 text-brand-500">{index + 1}.</span>
                    {item.question}
                  </p>

                  {/* Answer only — the distractors belong to the quiz, not
                      the study view. The check marks it visually; colour is
                      never the only cue (the sr-only label covers readers). */}
                  <div className="mt-3 flex items-start gap-2.5 rounded-[10px] border border-go-ink bg-go-soft p-2.5 text-[13.5px] leading-[19px] text-ink">
                    <span className="min-w-0 flex-1">{item.options[item.correctIndex]}</span>
                    <Check
                      size={16}
                      strokeWidth={3}
                      className="shrink-0 text-go-ink"
                      aria-hidden
                    />
                    <span className="sr-only">Correct answer</span>
                  </div>
                </li>
              ))}
            </ol>
          )
        ) : filteredSigns.length === 0 ? (
          <EmptyState title="No signs to study yet">
            The catalogue is being updated — check back soon.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {filteredSigns.map((sign, index) => (
              <li
                key={sign.id}
                className="rise-sm flex items-center gap-3.5 rounded-xl border border-hairline bg-surface p-4"
                style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
              >
                {/* 48px plate, same as the RN signShapeWrap. */}
                <span className="grid size-12 shrink-0 place-items-center">
                  <SignShape
                    shape={sign.shape}
                    color={sign.color}
                    glyph={sign.glyph}
                    prohibited={sign.prohibited}
                    solid={sign.solid}
                  />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-tight font-bold text-ink">{sign.name}</p>
                  <p className="mt-px mb-1 text-[11px] text-muted">{sign.category}</p>
                  <p className="text-[12px] leading-[17px] text-muted">{sign.meaning}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Sticky rather than absolutely positioned: the RN screen pinned the
            button to the viewport bottom (bottom: 20) with 100px of scroll
            padding behind it. Same relationship, but it keeps working when the
            keyboard is up. Shaped like WizardFooter's bar — full-bleed, with the
            padding on an inner row so the hairline runs edge to edge. */}
        <div className="sticky bottom-0 z-30 -mx-5 mt-4 border-t border-hairline bg-canvas/92 backdrop-blur-md">
          <div className="flex flex-col gap-1.5 px-5 pt-3 pb-nav-safe">
            <Link
              href="/home/learning/educational"
              className="block rounded-[12px] border border-brand-400 bg-surface py-3 text-center text-[13.5px] font-bold text-brand-600 transition-colors duration-150 hover:bg-brand-soft active:border-brand-400 active:bg-brand-soft"
            >
              📖 Educational Quiz
            </Link>
            <Link
              href="/home/learning/quiz"
              className="block rounded-[12px] bg-brand-500 py-[14px] text-center text-[15px] font-bold text-white shadow-float transition-colors duration-150 hover:bg-brand-600 active:bg-brand-700"
            >
              📝 Take Quiz
            </Link>
          </div>
        </div>
      </PageBody>

      <BottomNav />
    </>
  );
}
