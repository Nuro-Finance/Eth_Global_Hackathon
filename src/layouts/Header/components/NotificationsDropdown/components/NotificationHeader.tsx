"use client";

interface NotificationHeaderProps {
  title: string;
  seeAllLabel: string;
  onSeeAll: () => void;
  showSeeAll: boolean;
}

/**
 * Header section of the notifications dropdown (aligned with language menu row density)
 */
export function NotificationHeader({
  title,
  seeAllLabel,
  onSeeAll,
  showSeeAll,
}: NotificationHeaderProps) {
  return (
    <div className="shrink-0 px-4 pt-4 pb-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-[var(--color-text-primary)] text-sm sm:text-base leading-tight">
          {title}
        </h3>
        {showSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-xs sm:text-sm font-medium shrink-0 text-[var(--color-primary-light)] hover:underline underline-offset-2 transition-colors"
          >
            {seeAllLabel}
          </button>
        )}
      </div>
    </div>
  );
}
