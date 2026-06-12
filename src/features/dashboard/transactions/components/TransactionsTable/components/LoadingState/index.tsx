/**
 * LoadingState - Skeleton loading state for the transactions table
 */
import { SkeletonBlock } from "@/components";

export function LoadingState() {
  return (
    <div className="w-full rounded-lg border-none bg-[var(--color-bg-card)] p-8 dark:bg-[var(--color-bg-secondary)]">
      <div className="space-y-4">
        <SkeletonBlock className="h-4 w-1/4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <SkeletonBlock key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default LoadingState;
