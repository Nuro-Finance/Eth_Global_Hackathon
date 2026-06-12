"use client";

import { usePrivy } from "@privy-io/react-auth";
import { PrivyRuntimeProvider } from "./PrivyRuntimeContext";

export default function PrivyInnerProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const { ready, logout } = usePrivy();

  return (
    <PrivyRuntimeProvider
      value={{ privyEnabled: true, ready, logoutPrivy: logout }}
    >
      {children}
    </PrivyRuntimeProvider>
  );
}
