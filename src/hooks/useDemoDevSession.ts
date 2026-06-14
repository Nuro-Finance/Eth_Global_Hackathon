"use client";

import { useSelector } from "react-redux";
import { DESIGN_MODE } from "@/config/design-mode";
import { isDemoDevSession } from "@/config/demo-user";
import { useAppSession } from "@/hooks/useAppSession";
import { isDevPreviewAvailable } from "@/lib/devPreviewMode";
import { RootState } from "@/store/store";

/** Local dev: demo account, design-mode guest, or explicit demo@nuro.finance session. */
export function useDemoDevSession(): boolean {
  const { data: session, status } = useAppSession();
  const { user } = useSelector((state: RootState) => state.auth);

  if (!isDevPreviewAvailable()) return false;

  if (status === "loading") return false;

  if (DESIGN_MODE && status === "unauthenticated") return true;

  const sessionUser = session?.user as { email?: string; id?: string } | undefined;

  return isDemoDevSession(sessionUser) || isDemoDevSession(user);
}
