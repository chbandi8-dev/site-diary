"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Dark or light, for his eyes rather than for taste.
 *
 * The staff side was built dark because it is mostly used at the end of a day.
 * Read on a phone in direct Sydney sun it is close to unreadable, and that is
 * exactly when he is standing on a slab trying to check something.
 *
 * The flip costs one attribute on <html>: every colour in here is written
 * against five CSS variables, so `.admin-shell` redefines them and the whole
 * app follows — hovers, hairlines and all. The marketing site sits outside
 * that scope and does not move.
 *
 * The choice is applied by an inline script in the root layout before the page
 * paints, so a man who has chosen light never gets a black flash first.
 */

const KEY = "sd_admin_theme";

export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.dataset.adminTheme === "light");
  }, []);

  function flip() {
    const next = !light;
    setLight(next);
    document.documentElement.dataset.adminTheme = next ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next ? "light" : "dark");
    } catch {
      // Private windows. It simply opens dark again next time.
    }
  }

  return (
    <button
      type="button"
      onClick={flip}
      aria-pressed={light}
      aria-label={light ? "Switch to the dark background" : "Switch to the light background"}
      title={light ? "Dark background" : "Light background"}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-gold"
    >
      {light ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
    </button>
  );
}
