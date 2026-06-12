"use client";

import { useCallback, useEffect, useState } from "react";
import {
  isDevPreviewAvailable,
  NURO_DEV_PREVIEW_CHANGED_EVENT,
  readDevNewUserEmpty,
  readDevPopulatedPreview,
} from "@/lib/devPreviewMode";
import { FIRST_DEPOSIT_SUCCESS_EVENT } from "@/lib/dashboardInFlightOperation";

export const DEPOSIT_COMPLETE_STORAGE_KEY = "nuro_onboarding_deposit_complete";
export const DEMO_SAMPLE_CLEARED_STORAGE_KEY = "nuro_demo_sample_cleared";
export const DEMO_EXPLORING_STORAGE_KEY = "nuro_demo_exploring";
/** @deprecated Use NURO_DEV_PREVIEW_POPULATED_KEY — kept for imports during migration */
export const DEV_NEW_USER_PREVIEW_STORAGE_KEY = "dev_preview_new_user";
export const DEV_NEW_USER_PREVIEW_EVENT = "nuro-dev-preview-changed";
export const ONBOARDING_DEPOSIT_COMPLETE_EVENT = "nuro-onboarding-deposit-complete";
export const DEMO_SAMPLE_CLEARED_EVENT = "nuro-demo-sample-cleared";
export const DEMO_SAMPLE_RESTORED_EVENT = "nuro-demo-sample-restored";
export const DEMO_EXPLORING_CHANGED_EVENT = "nuro-demo-exploring-changed";

/** Dev: new-user empty mode (populated toggle OFF). */
export function readDevNewUserPreviewEnabled(): boolean {
  return readDevNewUserEmpty();
}

export function readDesignSampleCleared(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DEMO_SAMPLE_CLEARED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Populated ON → restore overview demo sample flags. */
export function restoreDemoSampleForSwitchOff() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DEMO_SAMPLE_CLEARED_STORAGE_KEY);
    window.localStorage.removeItem(DEMO_EXPLORING_STORAGE_KEY);
  } catch {
 /* ignore */
  }
  window.dispatchEvent(new Event(DEMO_SAMPLE_RESTORED_EVENT));
  window.dispatchEvent(new Event(DEMO_EXPLORING_CHANGED_EVENT));
}

export function readDemoExploring(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DEMO_EXPLORING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Overview/widgets sample data (matches Nuro Front End 5.4.26).
 * Populated preview: always on. New-user empty preview: on unless cleared via demo overlay.
 */
export function shouldUseDesignSampleData(): boolean {
  if (!isDevPreviewAvailable()) return false;
  if (readDevPopulatedPreview()) return true;
  if (readDevNewUserEmpty()) return !readDesignSampleCleared();
  return false;
}

/** Header “Sample data” tag — new-user preview only, not populated / real-user dev mode. */
export function shouldShowSampleDataLabel(): boolean {
  if (!isDevPreviewAvailable()) return false;
  if (readDevPopulatedPreview()) return false;
  if (!readDevNewUserEmpty()) return false;
  return !readDesignSampleCleared();
}

function persistDemoSampleClearedOnly() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEMO_SAMPLE_CLEARED_STORAGE_KEY, "1");
    window.localStorage.removeItem(DEMO_EXPLORING_STORAGE_KEY);
  } catch {
 /* ignore */
  }
  window.dispatchEvent(new Event(DEMO_SAMPLE_CLEARED_EVENT));
  window.dispatchEvent(new Event(DEMO_EXPLORING_CHANGED_EVENT));
}

/** First deposit while on step flow: clear sample data (does not change dev switch page). */
export function persistDesignSampleCleared() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEPOSIT_COMPLETE_STORAGE_KEY, "1");
  } catch {
 /* ignore */
  }
  persistDemoSampleClearedOnly();
  window.dispatchEvent(new Event(ONBOARDING_DEPOSIT_COMPLETE_EVENT));
}

/** Clear demo on new-user preview only. */
export function clearDesignSampleData() {
  persistDemoSampleClearedOnly();
}

export function markDemoExploring() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEMO_EXPLORING_STORAGE_KEY, "1");
  } catch {
 /* ignore */
  }
  window.dispatchEvent(new Event(DEMO_EXPLORING_CHANGED_EVENT));
}

function useDesignSampleSync(
  read: () => boolean,
  deps: readonly string[] = []
): boolean {
  const [active, setActive] = useState(() => read());

  const sync = useCallback(() => {
    setActive(read());
  }, [read, ...deps]);

  useEffect(() => {
    sync();
    window.addEventListener(DEMO_SAMPLE_CLEARED_EVENT, sync);
    window.addEventListener(DEMO_SAMPLE_RESTORED_EVENT, sync);
    window.addEventListener(ONBOARDING_DEPOSIT_COMPLETE_EVENT, sync);
    window.addEventListener(FIRST_DEPOSIT_SUCCESS_EVENT, sync);
    window.addEventListener(NURO_DEV_PREVIEW_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener(DEMO_SAMPLE_CLEARED_EVENT, sync);
      window.removeEventListener(DEMO_SAMPLE_RESTORED_EVENT, sync);
      window.removeEventListener(ONBOARDING_DEPOSIT_COMPLETE_EVENT, sync);
      window.removeEventListener(FIRST_DEPOSIT_SUCCESS_EVENT, sync);
      window.removeEventListener(NURO_DEV_PREVIEW_CHANGED_EVENT, sync);
    };
  }, [sync]);

  return active;
}

export function useDesignSampleDataActive(): boolean {
  return useDesignSampleSync(shouldUseDesignSampleData);
}

export function useSampleDataLabelVisible(): boolean {
  return useDesignSampleSync(shouldShowSampleDataLabel);
}

export function useDemoSurfaceState() {
  const demoActive = useDesignSampleDataActive();
  const [exploring, setExploring] = useState(() => readDemoExploring());

  const syncExploring = useCallback(() => {
    setExploring(readDemoExploring());
  }, []);

  useEffect(() => {
    syncExploring();
    window.addEventListener(DEMO_EXPLORING_CHANGED_EVENT, syncExploring);
    window.addEventListener(DEMO_SAMPLE_CLEARED_EVENT, syncExploring);
    window.addEventListener(DEMO_SAMPLE_RESTORED_EVENT, syncExploring);
    window.addEventListener(NURO_DEV_PREVIEW_CHANGED_EVENT, syncExploring);
    return () => {
      window.removeEventListener(DEMO_EXPLORING_CHANGED_EVENT, syncExploring);
      window.removeEventListener(DEMO_SAMPLE_CLEARED_EVENT, syncExploring);
      window.removeEventListener(DEMO_SAMPLE_RESTORED_EVENT, syncExploring);
      window.removeEventListener(NURO_DEV_PREVIEW_CHANGED_EVENT, syncExploring);
    };
  }, [syncExploring]);

  const exploreDemo = useCallback(() => {
    markDemoExploring();
    setExploring(true);
  }, []);

  const clearDemoData = useCallback(() => {
    clearDesignSampleData();
    setExploring(false);
  }, []);

  return {
    demoActive,
    exploring,
    exploreDemo,
    clearDemoData,
  };
}
