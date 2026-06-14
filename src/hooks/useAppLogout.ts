"use client";

import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { useRouter } from "@/i18n/navigation";
import type { AppDispatch } from "@/store/store";
import { usePrivyRuntime } from "@/providers/PrivyRuntimeContext";
import { completeAppLogout } from "@/lib/completeAppLogout";

export function useAppLogout() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const { logoutPrivy } = usePrivyRuntime();

  return useCallback(async () => {
    await completeAppLogout(dispatch, { logoutPrivy: logoutPrivy ?? undefined });
    router.replace("/login");
  }, [dispatch, router, logoutPrivy]);
}
