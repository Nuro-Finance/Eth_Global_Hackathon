"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";
import { WORLD_APP_ID, WORLD_RELOAD_ACTION } from "@/lib/world-id";

type IDKitResult = import("@worldcoin/idkit").IDKitResult;
type RpContext = import("@worldcoin/idkit").RpContext;

type RpSignatureResponse = {
  rp_id: string;
  sig: string;
  nonce: string;
  created_at: number;
  expires_at: number;
};

type IdKitWidgetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  app_id: string;
  action: string;
  rp_context: RpContext;
  allow_legacy_proofs: boolean;
  preset: unknown;
  handleVerify: (result: IDKitResult) => Promise<void>;
  onSuccess: () => void;
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
  const [idKit, setIdKit] = useState<{
    IDKitRequestWidget: ComponentType<IdKitWidgetProps>;
    orbLegacy: (opts: { signal: string }) => unknown;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void import("@worldcoin/idkit").then((mod) => {
      if (cancelled) return;
      setIdKit({
        IDKitRequestWidget: mod.IDKitRequestWidget as ComponentType<IdKitWidgetProps>,
        orbLegacy: mod.orbLegacy,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

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

  if (!WORLD_APP_ID || !rpContext || !idKit) {
    return null;
  }

  const { IDKitRequestWidget, orbLegacy } = idKit;

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
