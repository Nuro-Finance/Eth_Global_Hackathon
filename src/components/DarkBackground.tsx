"use client";

/**
 * DarkBackground — solid foundation for dark-theme surfaces (login, marketing parity).
 * Uses --color-bg-primary from theme.dark.css.
 */
export function DarkBackground({
  className = "",
  zIndex = "-z-50",
}: {
  className?: string;
  zIndex?: string;
}) {
  return (
    <div
      className={`fixed inset-0 pointer-events-none ${zIndex} ${className} bg-[var(--color-bg-primary)]`}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.018) 1px, transparent 1px)
          `,
          backgroundSize: "32px 32px",
        }}
      />

      <div
        className="absolute inset-0 pointer-events-none opacity-[0.06]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.55' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundSize: "200px 200px",
        }}
      />
    </div>
  );
}
