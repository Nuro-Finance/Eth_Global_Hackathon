"use client";

import React, { Component, ErrorInfo, useCallback, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { FORM_MODAL_SUBMIT_BUTTON_CLASS } from "@/components/ui/modalPresets";
import { cn } from "@/lib/utils";

const GLASS_SHELL_OUTER_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.02)",
  borderColor: "rgba(255, 255, 255, 0.03)",
  borderWidth: "1px",
  borderStyle: "solid",
} as const;

const GLASS_SHELL_INNER_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.04)",
  borderColor: "rgba(255, 255, 255, 0.03)",
  borderWidth: "1px",
  borderStyle: "solid",
} as const;

/**
 * Global Error Boundary — catches React render crashes and reports to backend.
 * All errors → POST /api/client-error → backend execution_log → ops tools
 */

export const PREVIEW_ERROR_MESSAGE =
  "Preview: deliberate error to show the crash modal.";

function buildErrorReport(error: Error | null, errorInfo: string): string {
  const parts = [
    error?.message ?? "Unknown error",
    error?.stack ?? "",
    errorInfo ? `\nComponent stack:${errorInfo}` : "",
  ];
  return parts.filter(Boolean).join("\n");
}

function reportClientError(error: {
  message: string;
  stack?: string;
  component?: string;
  url?: string;
}) {
  if (error.message.includes(PREVIEW_ERROR_MESSAGE)) return;

  try {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack || "",
        component: error.component || "unknown",
        url: error.url || (typeof window !== "undefined" ? window.location.href : ""),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  } catch {
 /* silent */
  }
}

export function reloadFromErrorBoundary() {
  if (typeof window === "undefined") return;

  const parts = window.location.pathname.split("/").filter(Boolean);
  const locale = parts[0] ?? "en";

  if (window.location.pathname.includes("preview-error-boundary")) {
    window.location.replace(`/${locale}/login`);
    return;
  }

  window.location.replace(`/${locale}/login`);
}

/** Centered glass crash modal — used by ErrorBoundary and dev preview route. */
export function ErrorFallbackModal({
  error,
  errorInfo,
  onReload = reloadFromErrorBoundary,
}: {
  error: Error | null;
  errorInfo: string;
  onReload?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const reportText = useMemo(() => buildErrorReport(error, errorInfo), [error, errorInfo]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
 /* clipboard blocked */
    }
  }, [reportText]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[#171717]/90 p-4 sm:p-8"
      role="alertdialog"
      aria-labelledby="error-boundary-title"
      aria-describedby="error-boundary-desc"
    >
      <div
        className={cn(
          "flex w-full max-w-3xl flex-col gap-0 overflow-hidden p-2.5 sm:p-3",
          "!rounded-[56px] backdrop-blur-md shadow-xl",
        )}
        style={GLASS_SHELL_OUTER_STYLE}
      >
        <div
          className="relative flex min-h-0 w-full flex-col overflow-hidden rounded-[44px] border !backdrop-blur-none"
          style={GLASS_SHELL_INNER_STYLE}
        >
          <div className="flex min-h-0 flex-col px-5 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
            <h2
              id="error-boundary-title"
              className="text-2xl font-semibold leading-none tracking-tight text-[var(--color-text-primary)]"
            >
              Something went wrong
            </h2>
            <p
              id="error-boundary-desc"
              className="mt-2 text-[13px] leading-snug text-[var(--color-text-muted)]"
            >
              This error has been automatically reported to the admin console.
            </p>

            <div className="mt-5 min-h-[200px] max-h-[min(52vh,400px)] overflow-y-auto overscroll-contain rounded-[var(--radius-md)] border border-white/[0.06] bg-[var(--color-bg-input)] p-4 sm:min-h-[240px]">
              <p className="font-mono text-sm font-medium text-[var(--color-error)] break-words">
                {error?.message ?? "Unknown error"}
              </p>
              {errorInfo.trim() ? (
                <pre className="mt-3 font-mono text-[11px] leading-relaxed text-[var(--color-text-muted)] whitespace-pre-wrap break-words">
                  {errorInfo.trim()}
                </pre>
              ) : null}
            </div>

            <footer className="mt-6 flex shrink-0 flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 shrink-0 items-center justify-center rounded-[10px] border border-white/10 px-4 text-xs font-medium text-white/80 transition-colors",
                  "hover:bg-white/10 hover:text-white",
                )}
                onClick={onReload}
              >
                Reload page
              </button>
              <button
                type="button"
                className={cn(FORM_MODAL_SUBMIT_BUTTON_CLASS, "inline-flex gap-2")}
                onClick={() => void handleCopy()}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" aria-hidden />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" aria-hidden />
                    Copy error
                  </>
                )}
              </button>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: "" };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const componentStack = errorInfo.componentStack || "";
    const componentMatch = componentStack.match(/at (\w+)/);
    const componentName = componentMatch ? componentMatch[1] : "unknown";

    reportClientError({
      message: error.message,
      stack: `${error.stack}\n\nComponent Stack:${componentStack}`,
      component: componentName,
    });

    this.setState({ errorInfo: componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallbackModal
          error={this.state.error}
          errorInfo={this.state.errorInfo}
        />
      );
    }

    return this.props.children;
  }
}

function isBenignWalletConnectError(reason: unknown): boolean {
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : String(reason ?? "");
  return (
    message.includes("Proposal expired") ||
    message.includes("Connection request reset") ||
    message.includes("No matching key") ||
    message.includes("User rejected") ||
    message.includes("User closed modal")
  );
}

/** Window-level handlers only — do not hook console.error (floods API in dev). */
export function installGlobalErrorHandlers() {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    if (isBenignWalletConnectError(event.message)) {
      event.preventDefault();
      return;
    }

    reportClientError({
      message: event.message || "Unhandled error",
      stack: event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`,
      component: "window.onerror",
      url: window.location.href,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isBenignWalletConnectError(event.reason)) {
      event.preventDefault();
      return;
    }

    const reason = event.reason;
    reportClientError({
      message: reason?.message || String(reason) || "Unhandled promise rejection",
      stack: reason?.stack || "",
      component: "unhandledrejection",
      url: window.location.href,
    });
  });
}

