"use client";

import {
  NURO_DEV_PREVIEW_CHANGED_EVENT,
  isDevPreviewAvailable,
  shouldUseDevPopulatedData,
} from "@/lib/devPreviewMode";

export const AGENT_CARDS_FIRST_TIME_SAMPLE_STORAGE_KEY =
  "nuro_agent_cards_first_time_sample";
export const AGENT_CARDS_FIRST_TIME_CLEARED_EVENT =
  "nuro-agent-cards-first-time-cleared";
export const AGENT_CARDS_FIRST_TIME_RESTORED_EVENT =
  "nuro-agent-cards-first-time-restored";

export type AgentCardsDataMode = "existing" | "first-time-user";

export function readAgentCardsFirstTimeSampleEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.localStorage.getItem(AGENT_CARDS_FIRST_TIME_SAMPLE_STORAGE_KEY) ===
      "1"
    );
  } catch {
    return false;
  }
}

/** First-time user page: empty by default (no agent cards). */
export function shouldUseAgentCardsFirstTimeSampleData(): boolean {
  if (!isDevPreviewAvailable()) return false;
  return readAgentCardsFirstTimeSampleEnabled();
}

/** Existing page (dev populated ON): full mock cards. */
export function shouldUseAgentCardsExistingSampleData(): boolean {
  return shouldUseDevPopulatedData();
}

export function resolveAgentCardsDesignSampleUsage(
  mode: AgentCardsDataMode | null,
): boolean | null {
  if (!isDevPreviewAvailable()) return null;
  if (mode === "existing") return shouldUseAgentCardsExistingSampleData();
  if (mode === "first-time-user") return shouldUseAgentCardsFirstTimeSampleData();
  return null;
}

export function clearAgentCardsFirstTimeSampleData() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AGENT_CARDS_FIRST_TIME_SAMPLE_STORAGE_KEY);
  } catch {
 /* ignore */
  }
  window.dispatchEvent(new Event(AGENT_CARDS_FIRST_TIME_CLEARED_EVENT));
}

export function restoreAgentCardsFirstTimeSampleData() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AGENT_CARDS_FIRST_TIME_SAMPLE_STORAGE_KEY, "1");
  } catch {
 /* ignore */
  }
  window.dispatchEvent(new Event(AGENT_CARDS_FIRST_TIME_RESTORED_EVENT));
}
