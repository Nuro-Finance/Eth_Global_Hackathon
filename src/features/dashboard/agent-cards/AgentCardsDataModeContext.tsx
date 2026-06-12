"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AgentCardsDataMode } from "./hooks/agentCardsDesignSampleData";

const AgentCardsDataModeContext = createContext<AgentCardsDataMode | null>(null);

export function AgentCardsDataModeProvider({
  mode,
  children,
}: {
  mode: AgentCardsDataMode;
  children: ReactNode;
}) {
  return (
    <AgentCardsDataModeContext.Provider value={mode}>
      {children}
    </AgentCardsDataModeContext.Provider>
  );
}

export function useAgentCardsDataMode(): AgentCardsDataMode | null {
  return useContext(AgentCardsDataModeContext);
}
