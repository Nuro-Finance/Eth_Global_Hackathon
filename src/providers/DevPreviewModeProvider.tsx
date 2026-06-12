"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  isDevPreviewAvailable,
  NURO_DEV_PREVIEW_CHANGED_EVENT,
  readDevPopulatedPreview,
  writeDevPopulatedPreview,
} from "@/lib/devPreviewMode";
import { restoreDemoSampleForSwitchOff } from "@/features/dashboard/overview/hooks/designSampleData";
import { clearMyCardFirstTimeSampleData } from "@/features/dashboard/my-card-1/hooks/myCardDesignSampleData";

type DevPreviewModeContextValue = {
  isDevAvailable: boolean;
  populated: boolean;
  newUserEmpty: boolean;
  setPopulated: (next: boolean) => void;
  togglePopulated: () => void;
};

const DevPreviewModeContext = createContext<DevPreviewModeContextValue>({
  isDevAvailable: false,
  populated: false,
  newUserEmpty: false,
  setPopulated: () => {},
  togglePopulated: () => {},
});

export function DevPreviewModeProvider({ children }: { children: ReactNode }) {
  const isDevAvailable = isDevPreviewAvailable();
  const [populated, setPopulatedState] = useState(false);

  const syncFromStorage = useCallback(() => {
    setPopulatedState(readDevPopulatedPreview());
  }, []);

  useEffect(() => {
    if (!isDevAvailable) return;
    syncFromStorage();
    window.addEventListener(NURO_DEV_PREVIEW_CHANGED_EVENT, syncFromStorage);
    return () =>
      window.removeEventListener(NURO_DEV_PREVIEW_CHANGED_EVENT, syncFromStorage);
  }, [isDevAvailable, syncFromStorage]);

  const setPopulated = useCallback(
    (next: boolean) => {
      if (!isDevAvailable) return;
      writeDevPopulatedPreview(next);
      setPopulatedState(next);
      if (!next) clearMyCardFirstTimeSampleData();
      restoreDemoSampleForSwitchOff();
    },
    [isDevAvailable],
  );

  const togglePopulated = useCallback(() => {
    setPopulated(!populated);
  }, [populated, setPopulated]);

  const value = useMemo(
    () => ({
      isDevAvailable,
      populated: isDevAvailable && populated,
      newUserEmpty: isDevAvailable && !populated,
      setPopulated,
      togglePopulated,
    }),
    [isDevAvailable, populated, setPopulated, togglePopulated],
  );

  return (
    <DevPreviewModeContext.Provider value={value}>
      {children}
    </DevPreviewModeContext.Provider>
  );
}

export function useDevPreviewMode() {
  return useContext(DevPreviewModeContext);
}
