"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "./ThemeContext";
import ReduxProvider from "./ReduxProvider";
import ProgressProviderWrapper from "./progressBarProvider";
import { QueryClient } from "@tanstack/react-query";
import { ErrorBoundary, installGlobalErrorHandlers } from "@/components/ErrorBoundary";
import { DESIGN_MODE_PRIVY_WALLET } from "@/config/design-mode";

const WalletProviders = dynamic(
  () => import("./WalletProviders").then((m) => m.WalletProviders),
  { ssr: false },
);

function GlobalErrorInstaller({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);
  return <>{children}</>;
}

/** Dev preview — also honors ?previewErrorBoundary=1 on routes that keep the query string (e.g. /en/login). */
function ErrorBoundaryPreviewTrigger() {
  if (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("previewErrorBoundary") === "1"
  ) {
    throw new Error(
      "Preview: deliberate error to show the crash modal. Use /design/preview-error-boundary or remove the query param and reload."
    );
  }
  return null;
}

export function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const walletTree = (
    <WalletProviders queryClient={queryClient} designModePrivyOnly={DESIGN_MODE_PRIVY_WALLET}>
      {children}
    </WalletProviders>
  );

  return (
    <ThemeProvider>
    <ErrorBoundary>
    <ErrorBoundaryPreviewTrigger />
    <GlobalErrorInstaller>
      <ProgressProviderWrapper>
        <SessionProvider>
          <ReduxProvider>
            {walletTree}
          </ReduxProvider>
        </SessionProvider>
      </ProgressProviderWrapper>
    </GlobalErrorInstaller>
    </ErrorBoundary>
    </ThemeProvider>
  );
}

export default Providers;
