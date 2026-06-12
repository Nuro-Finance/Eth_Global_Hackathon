"use client";

import { useCallback, useEffect, useState } from "react";
import { DESIGN_MODE } from "@/config/design-mode";

async function getToken(): Promise<string | null> {
  if (DESIGN_MODE) return "mock-design-mode-token";
  try {
    const r = await fetch("/api/auth/session");
    const s = await r.json();
    return s?.accessToken ?? null;
  } catch {
    return null;
  }
}

type KycStatus = "not_started" | "pending" | "approved" | "active" | "rejected" | "hidden" | null;

export function useKycStartFlow() {
  const [kycUrl, setKycUrl] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<KycStatus>(DESIGN_MODE ? "not_started" : null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (DESIGN_MODE) return;
    getToken().then((token) => {
      if (!token) return;
      fetch("/api/kyc/status", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          setKycUrl(data.kycUrl ?? null);
          setKycStatus(data.status ?? "not_started");
        })
        .catch(() => undefined);
    });
  }, []);

  const startKyc = useCallback(async () => {
    if (kycUrl) {
      window.open(kycUrl, "_blank");
      return;
    }
    setStarting(true);
    try {
      const token = await getToken();
      if (!token) return;
      const r = await fetch("/api/kyc/start", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await r.json();
      if (data.kycUrl) {
        setKycUrl(data.kycUrl);
        setKycStatus(data.status ?? "pending");
        window.open(data.kycUrl, "_blank");
      }
    } catch {
 // silent — dashboard stays usable
    } finally {
      setStarting(false);
    }
  }, [kycUrl]);

  const cardActivated = kycStatus === "approved" || kycStatus === "active";

  return { startKyc, starting, kycUrl, kycStatus, cardActivated };
}
