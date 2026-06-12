"use client";
import { ProgressProvider } from "@bprogress/next/app";
import { useEffect } from "react";
import { usePathname } from "next/navigation"; // Use Next.js native hook instead of next-intl
import { useProgress } from "@bprogress/next";

/**
 * Progress bar provider wrapper that works with next-intl navigation
 * Automatically triggers progress completion on route changes
 */
const ProgressProviderWrapper = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <ProgressProvider
      height="2px"
      color="var(--color-primary)"
      options={{ showSpinner: false }}
      shallowRouting
    >
      <ProgressHandler>{children}</ProgressHandler>
    </ProgressProvider>
  );
};

/**
 * Internal component to handle progress updates with native Next.js router
 * Stops progress bar when pathname changes (indicating navigation completion)
 */
function ProgressHandler({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); // Use native Next.js hook
  const { stop } = useProgress();

  useEffect(() => {
    // Stop progress when pathname changes (route navigation completed)
    stop();
  }, [pathname, stop]);

  return <>{children}</>;
}

export default ProgressProviderWrapper;
