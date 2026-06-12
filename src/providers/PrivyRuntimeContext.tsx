"use client";

import { createContext, useContext, type ReactNode } from "react";

export type PrivyRuntimeValue = {
  privyEnabled: boolean;
  ready: boolean;
  logoutPrivy?: () => Promise<void>;
};

const PrivyRuntimeContext = createContext<PrivyRuntimeValue>({
  privyEnabled: false,
  ready: true,
});

export function PrivyRuntimeProvider({
  value,
  children,
}: {
  value: PrivyRuntimeValue;
  children: ReactNode;
}) {
  return (
    <PrivyRuntimeContext.Provider value={value}>
      {children}
    </PrivyRuntimeContext.Provider>
  );
}

export function usePrivyRuntime() {
  return useContext(PrivyRuntimeContext);
}
