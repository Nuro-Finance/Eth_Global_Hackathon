"use client";

import { useState, useCallback, type ReactNode } from "react";
import { useDispatch } from "react-redux";
import { LogOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { completeAppLogout } from "@/lib/completeAppLogout";
import type { AppDispatch } from "@/store/store";
import { usePrivyRuntime } from "@/providers/PrivyRuntimeContext";

/**
 * Shared logout-with-confirmation primitive [NUR-23].
 *
 * Usage in any component:
 * const { requestLogout, dialog } = useLogoutWithConfirm();
 * return (
 * <>
 * <button onClick={requestLogout}>Sign out</button>
 * {dialog}
 * </>
 * );
 *
 * The hook owns the open/close state + the actual logout pipeline (Privy +
 * Redux + router push). Consumers just trigger `requestLogout()` and drop
 * the `dialog` element somewhere in their tree -- typically next to the
 * trigger button so it portals out of any sidebar / dropdown chrome.
 */
export function useLogoutWithConfirm(): {
  requestLogout: () => void;
  dialog: ReactNode;
} {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const { logoutPrivy } = usePrivyRuntime();

  const handleConfirm = useCallback(async () => {
    setPending(true);
    try {
      await completeAppLogout(dispatch, { logoutPrivy: logoutPrivy ?? undefined });
      router.push("/login");
    } finally {
 // Don't reset `pending` -- by the time we get here the route is
 // changing, and toggling state on an unmounting component yields
 // the React warning. The dialog will unmount with the page.
      setOpen(false);
    }
  }, [dispatch, router, logoutPrivy]);

  const requestLogout = useCallback(() => setOpen(true), []);

  const dialog = (
    <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Sign out?</DialogTitle>
          <DialogDescription>
            You&apos;ll need to sign in again to access your dashboard.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={handleConfirm}
            disabled={pending}
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            {pending ? "Signing out..." : "Sign out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { requestLogout, dialog };
}
