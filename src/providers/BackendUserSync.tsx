"use client";

/**
 * BackendUserSync — reconciles Redux auth.user with the backend's
 * authoritative users.name / users.email / users.first_name /
 * users.last_name fields.
 *
 * Why this exists:
 * PrivyAuthSync populates Redux from the Privy user object, which for
 * Google-OAuth flows often has no resolvable email/name (we only get
 * a Privy session + an anonymous wallet). mapPrivyUser's fallback is
 * "Nuro User <digits>" which then shows in the sidebar even though
 * Settings > Profile saved the real name to our database.
 *
 * This component runs after PrivyAuthSync, fetches /api/users/me
 * using the NextAuth session's accessToken, and dispatches
 * updateUser() to patch the authoritative values over the Privy
 * fallback.
 *
 * Re-runs whenever the access token changes (fresh login, token
 * refresh). Does NOT overwrite Redux if the backend name is empty.
 */

import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { useSession } from "next-auth/react";
import { updateUser } from "@/store/slices/authSlice";
import type { AppDispatch } from "@/store/store";

export default function BackendUserSync() {
  const dispatch = useDispatch<AppDispatch>();
  const { data: session, status } = useSession();
  const accessToken = (session as any)?.accessToken as string | undefined;

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!accessToken) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return;
        const u = await res.json();
        if (cancelled) return;

 // Prefer explicit first/last (migration 028), fall back to full name.
        const first = typeof u.firstName === "string" ? u.firstName.trim() : "";
        const last = typeof u.lastName === "string" ? u.lastName.trim() : "";
        const full =
          (first && last ? `${first} ${last}` : first || last) ||
          (typeof u.name === "string" ? u.name.trim() : "");

 // Skip if backend name looks like our own Privy fallback or is blank.
        if (!full || full.startsWith("Nuro User")) return;

        const patch: Record<string, string> = { name: full };
        if (typeof u.email === "string" && u.email) patch.email = u.email;
        if (typeof u.id === "string" && u.id) patch.id = u.id;
        dispatch(updateUser(patch));

 // Day-5 fix: persist the corrected user back to localStorage so
 // subsequent checkAuthStatus dispatches (AuthInitializer, route
 // changes, focus events) read the right name. PrivyAuthSync writes
 // the Privy fallback "Nuro User <digits>" to that same key on
 // every fresh sync; without this write, the name flickers back to
 // "Nuro User" within a second of every focus/refresh.
        try {
          const cached = window.localStorage.getItem("user");
          const merged = { ...(cached ? JSON.parse(cached) : {}), ...patch };
          window.localStorage.setItem("user", JSON.stringify(merged));
        } catch {
 /* private mode / quota — silent */
        }
      } catch {
 /* fail silent — sidebar will keep whatever Redux has */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, status, dispatch]);

  return null;
}
