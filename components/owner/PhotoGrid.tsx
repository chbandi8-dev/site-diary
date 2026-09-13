"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";

type Photo = { id: string; key: string; caption: string | null; url: string };

/**
 * Site photos, and a full-screen view of them.
 *
 * These are the part of the page people actually come back for, and the part
 * they screenshot and send to their family — so they get a proper viewer rather
 * than a link that opens a raw file. Keyboard and swipe both work; the overlay
 * traps escape and restores scroll on close.
 */
export default function PhotoGrid({ photos, label }: { photos: Photo[]; label: string }) {
  const reduced = useReducedMotion();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const close = useCallback(() => setOpenIndex(null), []);
  const step = useCallback(
    (by: number) =>
      setOpenIndex((i) => (i === null ? null : (i + by + photos.length) % photos.length)),
    [photos.length]
  );

  useEffect(() => {
    if (openIndex === null) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [openIndex, close, step]);

  if (photos.length === 0) return null;

  const open = openIndex === null ? null : photos[openIndex];

  return (
    <>
      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photos.map((photo, i) => (
          <li key={photo.id}>
            <motion.button
              type="button"
              onClick={() => setOpenIndex(i)}
              whileHover={reduced ? undefined : { scale: 1.015 }}
              whileTap={reduced ? undefined : { scale: 0.985 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="group block w-full overflow-hidden bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
              aria-label={photo.caption ?? `Open photo ${i + 1} of ${photos.length}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.caption ?? `${label} — photo ${i + 1}`}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover transition-[filter] duration-300 group-hover:brightness-[1.04]"
              />
            </motion.button>
            {photo.caption && (
              <span className="mt-1.5 block text-xs leading-snug text-text/55">{photo.caption}</span>
            )}
          </li>
        ))}
      </ul>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Site photo"
            className="fixed inset-0 z-50 flex flex-col bg-[#14120F]/96 backdrop-blur-sm"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={close}
          >
            <div className="flex items-center justify-between px-5 py-4 text-white/70">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em]">
                {(openIndex ?? 0) + 1} / {photos.length}
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-full p-2 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={22} />
              </button>
            </div>

            <div
              className="flex flex-1 items-center justify-center px-4 pb-6"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.figure
                key={open.id}
                className="flex max-h-full flex-col items-center gap-4"
                initial={reduced ? false : { opacity: 0, scale: 0.985 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
                drag={reduced ? false : "x"}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.18}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -80) step(1);
                  if (info.offset.x > 80) step(-1);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={open.url}
                  alt={open.caption ?? label}
                  className="max-h-[75vh] w-auto max-w-full object-contain"
                />
                {open.caption && (
                  <figcaption className="max-w-prose text-center text-sm leading-relaxed text-white/70">
                    {open.caption}
                  </figcaption>
                )}
              </motion.figure>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
