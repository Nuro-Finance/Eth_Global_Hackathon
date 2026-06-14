"use client";

import { useSelector } from "react-redux";
import { DEMO_USER_EMAIL, DEMO_USER_FULL_NAME, isDemoDevSession } from "@/config/demo-user";
import { useAppSession } from "@/hooks/useAppSession";
import { useDemoDevSession } from "@/hooks/useDemoDevSession";
import { RootState } from "@/store/store";

/** Single identity source for greeting / header copy. */
export function useSessionDisplayIdentity() {
  const { user, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const { data: session, status } = useAppSession();
  const isDemoDev = useDemoDevSession();
  const sessionUser = session?.user as
    | { name?: string; email?: string | null; id?: string }
    | undefined;

  if (
    status === "authenticated" &&
    sessionUser?.email &&
    !isDemoDevSession(sessionUser)
  ) {
    const email = sessionUser.email;
    const name =
      sessionUser.name?.trim() || email.split("@")[0] || "User";
    return { name, email };
  }

  if (isDemoDev) {
    return {
      name: DEMO_USER_FULL_NAME,
      email: DEMO_USER_EMAIL,
    };
  }

  if (isAuthenticated && user?.name?.trim() && user?.email) {
    return { name: user.name, email: user.email };
  }

  return { name: undefined, email: undefined };
}
