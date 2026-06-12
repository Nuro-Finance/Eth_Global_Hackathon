"use client";

import { useCallback, useEffect, useState } from "react";
import {
  NURO_DEV_PREVIEW_CHANGED_EVENT,
  isDevPreviewAvailable,
  shouldUseDevPopulatedData,
} from "@/lib/devPreviewMode";

export const MY_CARD_FIRST_TIME_SAMPLE_STORAGE_KEY =
  "nuro_my_card_first_time_sample";
export const MY_CARD_FIRST_TIME_CLEARED_EVENT = "nuro-my-card-first-time-cleared";
export const MY_CARD_FIRST_TIME_RESTORED_EVENT =
  "nuro-my-card-first-time-restored";
export const MY_CARD_FIRST_TIME_ACTIVATED_STORAGE_KEY =
  "nuro_my_card_first_time_activated";
export const MY_CARD_FIRST_TIME_ACTIVATED_EVENT =
  "nuro-my-card-first-time-activated";

export type MyCardDataMode = "existing" | "first-time-user";

export function readMyCardFirstTimeSampleEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.localStorage.getItem(MY_CARD_FIRST_TIME_SAMPLE_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

/** First-time user page: empty by default ($0 balance, no transactions). */
export function shouldUseMyCardFirstTimeSampleData(): boolean {
  if (!isDevPreviewAvailable()) return false;
  return readMyCardFirstTimeSampleEnabled();
}

/** Existing page (dev populated ON): full mock card + transactions. */
export function shouldUseMyCardExistingSampleData(): boolean {
  return shouldUseDevPopulatedData();
}

export function resolveMyCardDesignSampleUsage(
  mode: MyCardDataMode | null,
): boolean | null {
  if (!isDevPreviewAvailable()) return null;
  if (mode === "existing") return shouldUseMyCardExistingSampleData();
  if (mode === "first-time-user") return shouldUseMyCardFirstTimeSampleData();
  return null;
}

export function clearMyCardFirstTimeSampleData() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(MY_CARD_FIRST_TIME_SAMPLE_STORAGE_KEY);
    window.localStorage.removeItem(MY_CARD_FIRST_TIME_ACTIVATED_STORAGE_KEY);
  } catch {
 /* ignore */
  }
  window.dispatchEvent(new Event(MY_CARD_FIRST_TIME_CLEARED_EVENT));
}

export function restoreMyCardFirstTimeSampleData() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MY_CARD_FIRST_TIME_SAMPLE_STORAGE_KEY, "1");
  } catch {
 /* ignore */
  }
  window.dispatchEvent(new Event(MY_CARD_FIRST_TIME_RESTORED_EVENT));
}

export function readMyCardFirstTimeCardActivated(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.localStorage.getItem(MY_CARD_FIRST_TIME_ACTIVATED_STORAGE_KEY) ===
      "1"
    );
  } catch {
    return false;
  }
}

export function markMyCardFirstTimeCardActivated() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MY_CARD_FIRST_TIME_ACTIVATED_STORAGE_KEY, "1");
  } catch {
 /* ignore */
  }
  window.dispatchEvent(new Event(MY_CARD_FIRST_TIME_ACTIVATED_EVENT));
}

export function useMyCardFirstTimeCardActivated() {
  const [activated, setActivated] = useState(() =>
    readMyCardFirstTimeCardActivated(),
  );

  const sync = useCallback(() => {
    setActivated(readMyCardFirstTimeCardActivated());
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener(MY_CARD_FIRST_TIME_ACTIVATED_EVENT, sync);
    window.addEventListener(MY_CARD_FIRST_TIME_CLEARED_EVENT, sync);
    return () => {
      window.removeEventListener(MY_CARD_FIRST_TIME_ACTIVATED_EVENT, sync);
      window.removeEventListener(MY_CARD_FIRST_TIME_CLEARED_EVENT, sync);
    };
  }, [sync]);

  return {
    cardActivated: activated,
    activateCard: markMyCardFirstTimeCardActivated,
  };
}

export function useMyCardFirstTimeSampleActive(): boolean {
  const [active, setActive] = useState(() => shouldUseMyCardFirstTimeSampleData());

  const sync = useCallback(() => {
    setActive(shouldUseMyCardFirstTimeSampleData());
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener(MY_CARD_FIRST_TIME_CLEARED_EVENT, sync);
    window.addEventListener(MY_CARD_FIRST_TIME_RESTORED_EVENT, sync);
    window.addEventListener(NURO_DEV_PREVIEW_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener(MY_CARD_FIRST_TIME_CLEARED_EVENT, sync);
      window.removeEventListener(MY_CARD_FIRST_TIME_RESTORED_EVENT, sync);
      window.removeEventListener(NURO_DEV_PREVIEW_CHANGED_EVENT, sync);
    };
  }, [sync]);

  return active;
}
