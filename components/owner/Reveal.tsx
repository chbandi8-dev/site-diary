"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Scroll reveal for the owner timeline.
 *
 * Restrained on purpose. This page is read by someone anxious about the biggest
 * purchase of their life, often on a phone, often quickly — motion here is for
 * pacing the read, not for showing off. Entries rise a few pixels and settle;
 * nothing bounces, nothing scales, nothing waits on a long delay before the
 * text is legible.
 *
 * The resting state is visible. Nothing is parked at opacity 0 hoping an
 * observer fires — a page that arrives blank because a scroll handler didn't
 * run is a broken page, not a subtle one.
 */
export default function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
