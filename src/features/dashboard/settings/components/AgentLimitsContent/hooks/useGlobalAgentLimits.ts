"use client";

import { useCallback, useEffect, useState } from "react";

export interface GlobalAgentLimits {
  daily_limit: number;
  monthly_limit: number;
  per_tx_limit: number;
  velocity_per_hr: number;
}

const STORAGE_KEY = "nuro:global-agent-limits";

export const GLOBAL_AGENT_LIMIT_DEFAULTS: GlobalAgentLimits = {
  daily_limit: 5000,
  monthly_limit: 50000,
  per_tx_limit: 10000,
  velocity_per_hr: 10,
};

export function useGlobalAgentLimits() {
  const [limits, setLimits] = useState<GlobalAgentLimits>(GLOBAL_AGENT_LIMIT_DEFAULTS);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setLimits({ ...GLOBAL_AGENT_LIMIT_DEFAULTS, ...JSON.parse(raw) });
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const saveLimit = useCallback(
    async (key: keyof GlobalAgentLimits, value: number) => {
      setIsSaving(true);
      const next = { ...limits, [key]: value };
      setLimits(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      } finally {
        setIsSaving(false);
      }
    },
    [limits]
  );

  return { limits, isSaving, saveLimit };
}
