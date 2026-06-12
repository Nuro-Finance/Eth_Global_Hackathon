"use client";

import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { usePrivy } from "@privy-io/react-auth";
import { mapPrivyUserToAppUser } from "@/lib/mapPrivyUser";
import {
  hydrateFromPrivyUser,
  logoutUser,
} from "@/store/slices/authSlice";
import type { AppDispatch } from "@/store/store";

/**
 * Keeps Redux + localStorage in sync when the user signs in with Privy,
 * and clears a Privy-backed session when Privy logs out.
 */
export default function PrivyAuthSync() {
  const dispatch = useDispatch<AppDispatch>();
  const { ready, authenticated, user } = usePrivy();
  const lastSyncedPrivyId = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;

    if (!authenticated) {
      lastSyncedPrivyId.current = null;
      if (
        typeof window !== "undefined" &&
        localStorage.getItem("auth_token") === "privy"
      ) {
        void dispatch(logoutUser());
      }
      return;
    }

    if (!user) return;
    if (lastSyncedPrivyId.current === user.id) {
 // Day-5 fix: previously re-fired hydrateFromPrivyUser on every Privy
 // re-render, which fully REPLACED the Redux user — clobbering the
 // backend overrides written by BackendUserSync (firstName/lastName/
 // name from /api/users/me). That race meant the sidebar would flicker
 // back to "Nuro User <digits>" any time Privy re-emitted. The Privy
 // user object can't actually mutate while id is stable, so re-syncing
 // adds nothing and corrupts the canonical state. Skip.
      return;
    }
    lastSyncedPrivyId.current = user.id;

    const appUser = mapPrivyUserToAppUser(user);
    dispatch(hydrateFromPrivyUser(appUser));
    localStorage.setItem("auth_token", "privy");
    localStorage.setItem("user", JSON.stringify(appUser));
  }, [ready, authenticated, user, dispatch]);

  return null;
}
