"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MyCardDataMode } from "./hooks/myCardDesignSampleData";

const MyCardDataModeContext = createContext<MyCardDataMode | null>(null);

export function MyCardDataModeProvider({
  mode,
  children,
}: {
  mode: MyCardDataMode;
  children: ReactNode;
}) {
  return (
    <MyCardDataModeContext.Provider value={mode}>
      {children}
    </MyCardDataModeContext.Provider>
  );
}

export function useMyCardDataMode(): MyCardDataMode | null {
  return useContext(MyCardDataModeContext);
}
