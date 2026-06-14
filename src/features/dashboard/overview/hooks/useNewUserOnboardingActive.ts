"use client";

import { useCallback, useEffect } from "react";
import { subscribeFirstDepositSuccess } from "@/lib/dashboardInFlightOperation";
import { persistDesignSampleCleared } from "./designSampleData";

/**
 * While dev new-user switch is ON, listen for first deposit to clear sample data flags.
 * Layout page selection is controlled only by the dev switch - not deposit state.
 */
export function useNewUserOnboardingActive(newUserPreviewEnabled: boolean) {
  const markDepositComplete = useCallback(() => {
    persistDesignSampleCleared();
  }, []);

  useEffect(() => {
    if (!newUserPreviewEnabled) return;
    return subscribeFirstDepositSuccess(markDepositComplete);
  }, [newUserPreviewEnabled, markDepositComplete]);
}
