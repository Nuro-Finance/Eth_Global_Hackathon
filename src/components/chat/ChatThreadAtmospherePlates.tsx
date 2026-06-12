"use client";

import { cn } from "@/lib/utils";

/** Thread edge occlusion: secondary background faded by CSS mask only (scroller stays unmasked). */
export function ChatThreadAtmospherePlates() {
  return (
    <>
      <div
        className={cn(
          "pointer-events-none absolute left-0 right-0 top-0 z-[10] h-20 overflow-hidden"
        )}
        aria-hidden
      >
        <div
          className="absolute inset-0 bg-[var(--color-bg-chat-thread-plate,var(--color-bg-secondary))]"
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, #000 0%, #000 14%, rgba(0,0,0,0.9) 28%, rgba(0,0,0,0.55) 48%, rgba(0,0,0,0.22) 72%, rgba(0,0,0,0.05) 90%, transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, #000 0%, #000 14%, rgba(0,0,0,0.9) 28%, rgba(0,0,0,0.55) 48%, rgba(0,0,0,0.22) 72%, rgba(0,0,0,0.05) 90%, transparent 100%)",
          }}
        />
      </div>
      <div
        className={cn(
          "pointer-events-none absolute bottom-0 left-0 right-0 z-[10] h-10 overflow-hidden rounded-b-[24px]"
        )}
        aria-hidden
      >
        <div
          className="absolute inset-0 bg-[var(--color-bg-chat-thread-plate-bottom,var(--color-bg-secondary))]"
          style={{
            WebkitMaskImage:
              "linear-gradient(to top, black 0%, black 48%, transparent 100%)",
            maskImage:
              "linear-gradient(to top, black 0%, black 48%, transparent 100%)",
          }}
        />
      </div>
    </>
  );
}
