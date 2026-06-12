"use client";

import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { useRouter } from "@/i18n/navigation";
import { logoutUser } from "@/store/slices/authSlice";
import type { AppDispatch } from "@/store/store";
import { usePrivyRuntime } from "@/providers/PrivyRuntimeContext";

export function useAppLogout() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const { logoutPrivy } = usePrivyRuntime();

  return useCallback(async () => {
    if (logoutPrivy) {
      await logoutPrivy();
    }
    await dispatch(logoutUser());
    router.push("/login");
  }, [dispatch, router, logoutPrivy]);
}
