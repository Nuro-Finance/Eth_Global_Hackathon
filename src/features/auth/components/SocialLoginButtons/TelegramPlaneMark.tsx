"use client";

import { useId } from "react";

/**
 * Telegram paper-plane mark (no circle), geometry from SuperTinyIcons telegram.svg
 * (MIT), with official-style gradient. Circle path omitted.
 */
export default function TelegramPlaneMark({ className }: { className?: string }) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradId = `tg-plane-grad-${rawId}`;

 /* Tight viewBox: plane sat in a corner of the 512² artboard, so it read smaller than Google G. */
  return (
    <svg
      className={className}
      viewBox="78 186 258 168"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={gradId} x2="0" y2="1">
          <stop offset="0" stopColor="#2AABEE" />
          <stop offset="1" stopColor="#229ED9" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradId})`}
        d="M291 220q6-4 8-1t-3 8c-31 32-54 50-67 65q-9 10 5 20l62 42c25 17 33 3 36-14q17-91 24-151c2-15-3-23-22-17q-27 8-194 81c-21 8-17 17-5 21s21 7 33 10 20 4 34-5"
      />
    </svg>
  );
}
