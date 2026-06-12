"use client";

import { ErrorFallbackModal, PREVIEW_ERROR_MESSAGE } from "@/components/ErrorBoundary";

const SCROLL_SAMPLE_LINES = Array.from(
  { length: 48 },
  (_, i) =>
    `at PreviewComponent${i}(webpack-internal:///./src/example.tsx:${120 + i}:${8 + (i % 12)})`,
);

const PREVIEW_ERROR_INFO = [
  "Dev design preview — no backend.",
  "",
  "Component stack:",
  ...SCROLL_SAMPLE_LINES,
].join("\n");

export default function DesignPreviewErrorBoundaryPage() {
  return (
    <ErrorFallbackModal
      error={new Error(PREVIEW_ERROR_MESSAGE)}
      errorInfo={PREVIEW_ERROR_INFO}
      onReload={() => window.location.reload()}
    />
  );
}
