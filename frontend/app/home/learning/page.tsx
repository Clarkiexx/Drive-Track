"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import AppBar from "@/components/common/AppBar";
import BottomNav from "@/components/common/BottomNav";
import ChipRow, { type ChipOption } from "@/components/common/ChipRow";
import FilterBar from "@/components/common/FilterBar";
import PageBody from "@/components/common/PageBody";
import SignShape from "@/components/common/SignShape";
import { SIGN_CATEGORIES, trafficSigns, type SignCategory } from "@/data/trafficSigns";

/** The "no filter" chip, plus one per category actually present in the data. */
const CATEGORY_OPTIONS: ChipOption[] = [
  { value: "All", label: "All" },
  ...SIGN_CATEGORIES.map((category) => ({ value: category, label: category })),
];

type CategoryFilter = "All" | SignCategory;

/**
 * Learning Center — driver-app/src/screens/LearningCenterScreen.js.
 *
 * A pushed screen inside the driver shell: AppBar with a back arrow, a chip
 * strip that filters the catalogue, and a card per sign.
 */
export default function LearningCenterPage() {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("All");

  const filteredSigns = useMemo(
    () =>
      activeCategory === "All"
        ? trafficSigns
        : trafficSigns.filter((sign) => sign.category === activeCategory),
    [activeCategory]
  );

  return (
    <>
      <AppBar title="Learning Center" backHref="/home" />

      <FilterBar>
        <ChipRow
          label="Filter signs by category"
          options={CATEGORY_OPTIONS}
          value={activeCategory}
          onChange={(value) => setActiveCategory(value as CategoryFilter)}
        />
      </FilterBar>

      {/* withNav={false}: the sticky quiz bar below already reserves the tab-bar
          height via pb-nav-safe, so the default pb-nav would double the gap. */}
      <PageBody withNav={false} className="pt-4">
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

        {/* Sticky rather than absolutely positioned: the RN screen pinned the
            button to the viewport bottom (bottom: 20) with 100px of scroll
            padding behind it. Same relationship, but it keeps working when the
            keyboard is up. Shaped like WizardFooter's bar — full-bleed, with the
            padding on an inner row so the hairline runs edge to edge. */}
        <div className="sticky bottom-0 z-30 -mx-5 mt-4 border-t border-hairline bg-canvas/92 backdrop-blur-md">
          <div className="px-5 pt-3 pb-nav-safe">
            <Link
              href="/home/learning/quiz"
              className="block rounded-[12px] bg-brand-500 py-[15px] text-center text-[15px] font-bold text-white shadow-float transition-colors duration-150 hover:bg-brand-600 active:bg-brand-700"
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