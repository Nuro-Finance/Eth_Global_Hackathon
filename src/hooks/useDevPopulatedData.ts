"use client";

import { useDemoDevSession } from "@/hooks/useDemoDevSession";
import { shouldUseDevPopulatedData } from "@/lib/devPreviewMode";

/** Dev populated mock data - active only for the demo dev account. */
export function useDevPopulatedData(): boolean {
  const isDemoDev = useDemoDevSession();
  return shouldUseDevPopulatedData(isDemoDev);
}
