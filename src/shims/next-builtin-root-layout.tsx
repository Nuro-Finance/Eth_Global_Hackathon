import type { ReactNode } from "react";

/**
 * Replaces Next.js internal `DefaultLayout` (404 / access-fallback shell).
 * That built-in `<body>` had no `suppressHydrationWarning`, so extensions
 * (e.g. Grammarly) injecting attributes still tripped React 19 hydration in dev.
 */
export default function DefaultLayout({ children }: { children: ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
