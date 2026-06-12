"use client";

import { useSession as useNextAuthSession } from "next-auth/react";
import { DESIGN_MODE } from "@/config/design-mode";
import {
  DEMO_USER_EMAIL,
  DEMO_USER_FULL_NAME,
  DEMO_USER_ID,
} from "@/config/demo-user";

/** Stable identity required: hooks like `useAccountBalance` depend on `[session]` — a fresh object each render re-triggers effects infinitely. */
const MOCK_DESIGN_SESSION = {
  data: {
    user: {
      id: DEMO_USER_ID,
      name: DEMO_USER_FULL_NAME,
      email: DEMO_USER_EMAIL,
      image: "",
    },
    expires: "9999-12-31T23:59:59.999Z",
  },
  status: "authenticated" as const,
  update: async () => null,
} as const;

/**
 * useAppSession - The Absolute Kernel 28 Bypass Hook
 * If DESIGN_MODE is true, it returns a mock session instantly with ZERO network overhead.
 * If DESIGN_MODE is false, it falls back to the real NextAuth session.
 */
export function useAppSession() {
  const nextAuthSession = useNextAuthSession();
  return DESIGN_MODE ? (MOCK_DESIGN_SESSION as any) : nextAuthSession;
}
