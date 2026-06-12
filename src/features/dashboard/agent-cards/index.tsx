"use client";

import AgentCardsExistingPage from "./AgentCardsExistingPage";
import AgentCardsFirstTimeUserPage from "./AgentCardsFirstTimeUserPage";
import { AgentCardsDataModeProvider } from "./AgentCardsDataModeContext";
import { useDevPreviewMode } from "@/providers/DevPreviewModeProvider";

export default function AgentCardsFeature() {
  const { newUserEmpty } = useDevPreviewMode();

  return (
    <AgentCardsDataModeProvider
      mode={newUserEmpty ? "first-time-user" : "existing"}
    >
      {newUserEmpty ? (
        <AgentCardsFirstTimeUserPage />
      ) : (
        <AgentCardsExistingPage />
      )}
    </AgentCardsDataModeProvider>
  );
}
