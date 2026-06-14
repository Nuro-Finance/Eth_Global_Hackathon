"use client";

interface PageTitleProps {
 /** Main title text */
  title: string;
 /** Subtitle/description text */
  subtitle?: string;
}

/**
 * PageTitle - same typography + stack rhythm as overview `Greeting`
 * (h2 + muted line, gap-1, leading-tight) so every dashboard page aligns to one header spec.
 */
export function PageTitle({ title, subtitle }: PageTitleProps) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-[var(--color-text-primary)] text-[18px] sm:text-[20px] md:text-[24px] font-normal leading-tight">
        {title}
      </h2>
      {subtitle ? (
        <p className="text-[var(--color-text-muted)] text-[11px] sm:text-[12px] md:text-[14px] leading-tight mt-0.5">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export default PageTitle;
