"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IDKitRequestWidget,
  orbLegacy,
  type IDKitResult,
  type RpContext,
} from "@worldcoin/idkit";
import { WORLD_APP_ID, WORLD_RELOAD_ACTION } from "@/lib/world-id";

type RpSignatureResponse = {
  rp_id: string;
  sig: string;
  nonce: string;
  created_at: number;
  expires_at: number;
};

interface WorldIdReloadGateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signal: string;
  onVerified: () => void;
}

export function WorldIdReloadGate({
  open,
  onOpenChange,
  signal,
  onVerified,
}: WorldIdReloadGateProps) {
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [rpId, setRpId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setRpContext(null);
      setRpId(null);
      setLoadError(null);
      return;
    }

    if (!WORLD_APP_ID) {
      setLoadError("NEXT_PUBLIC_APP_ID is not set");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/world/rp-signature", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: WORLD_RELOAD_ACTION }),
        });
        if (!res.ok) {
          throw new Error("Failed to initialize World ID");
        }
        const data = (await res.json()) as RpSignatureResponse;
        if (cancelled) return;
        setRpId(data.rp_id);
        setRpContext({
          rp_id: data.rp_id,
          nonce: data.nonce,
          created_at: data.created_at,
          expires_at: data.expires_at,
          signature: data.sig,
        });
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "World ID unavailable");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleVerify = useCallback(
    async (result: IDKitResult) => {
      if (!rpId) {
        throw new Error("World ID not ready");
      }

      const response = await fetch("/api/world/verify-proof", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rp_id: rpId,
          idkitResponse: result,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          typeof err?.error === "string" ? err.error : "Backend verification failed",
        );
      }
    },
    [rpId],
  );

  useEffect(() => {
    if (loadError && open) {
      console.error("[WorldIdReloadGate]", loadError);
      onOpenChange(false);
    }
  }, [loadError, open, onOpenChange]);

  if (!WORLD_APP_ID || !rpContext) {
    return null;
  }

  return (
    <IDKitRequestWidget
      open={open}
      onOpenChange={onOpenChange}
      app_id={WORLD_APP_ID}
      action={WORLD_RELOAD_ACTION}
      rp_context={rpContext}
      allow_legacy_proofs
      preset={orbLegacy({ signal })}
      handleVerify={handleVerify}
      onSuccess={() => {
        onVerified();
        onOpenChange(false);
      }}
    />
  );
}
