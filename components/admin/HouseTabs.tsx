"use client";

import { useEffect, useState } from "react";

/**
 * One house, five tabs.
 *
 * This page had grown to fourteen panels stacked in a single column — correct,
 * complete, and on a phone about eight screens of scrolling to reach the
 * defects list. He opens it standing in a driveway to do one thing.
 *
 * Every panel is rendered on the server as before and simply hidden, rather
 * than fetched per tab: switching is instant with no network at all, which is
 * the entire point on a site with one bar of signal. It costs nothing extra —
 * the whole page was already being sent.
 *
 * Hidden with `hidden` rather than unmounted, so a half-typed note in one tab
 * survives a look at another.
 */

const REMEMBER = "sd_house_tab";

export type TabSpec = {
  id: string;
  label: string;
  /** A count worth seeing before he taps: open defects, unanswered questions. */
  badge?: number;
};

export default function HouseTabs({
  tabs,
  children,
}: {
  tabs: TabSpec[];
  children: React.ReactNode[];
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  // Restored after mount rather than during render: the server has no idea
  // which tab he was on, and guessing would swap the content under him.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER);
      if (saved && tabs.some((t) => t.id === saved)) setActive(saved);
    } catch {
      // Private windows and blocked site data. The first tab is a fine default.
    }
  }, [tabs]);

  function choose(id: string) {
    setActive(id);
    try {
      localStorage.setItem(REMEMBER, id);
    } catch {
      // Nothing to do — it just opens on the first tab next time.
    }
  }

  return (
    <>
      {/* Sticky, because the tabs are the navigation for this screen and
          scrolling back up to change them is the thing they replaced. */}
      <div className="sticky top-0 z-20 -mx-4 mb-2 bg-dark/95 px-4 pb-1 pt-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div
          role="tablist"
          aria-label="This house"
          className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1"
        >
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={on}
                aria-controls={`panel-${t.id}`}
                onClick={() => choose(t.id)}
                className={
                  "flex min-h-[44px] flex-none items-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm transition-colors " +
                  (on
                    ? "bg-gold/15 font-medium text-gold"
                    : "text-white/50 hover:bg-white/[0.04] hover:text-white/80")
                }
              >
                {t.label}
                {t.badge !== undefined && t.badge > 0 && (
                  <span
                    className={
                      "rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums " +
                      (on ? "bg-gold/20 text-gold" : "bg-white/[0.08] text-white/45")
                    }
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {tabs.map((t, i) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={t.id !== active}
          // Every panel brings its own top margin, sized for a page that used
          // to stack all fourteen. At the top of a tab that is a hole.
          className="[&>section:first-child]:mt-4 [&>div:first-child>section]:mt-4"
        >
          {children[i]}
        </div>
      ))}
    </>
  );
}
