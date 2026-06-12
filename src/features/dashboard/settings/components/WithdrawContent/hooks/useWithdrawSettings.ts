"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivyWalletAddress } from "@/hooks/usePrivyWalletAddress";

export type WithdrawProtocol = "base" | "ethereum" | "solana";

export type Withdraw2FAMethod = "hardware" | "authenticator" | "sms";

export interface WithdrawSettings {
  address: string;
  protocol: WithdrawProtocol;
  require2FA: boolean;
  primary2FAMethod: Withdraw2FAMethod | null;
  configured2FA: Record<Withdraw2FAMethod, boolean>;
}

const STORAGE_KEY = "nuro:withdraw-settings";

export const DEFAULT_WITHDRAW_ADDRESS =
  "0x742d35cc6634c0532925a3b844bc454e4438f44e";

export const WITHDRAW_PROTOCOL_OPTIONS: {
  value: WithdrawProtocol;
  label: string;
}[] = [
  { value: "base", label: "Base" },
  { value: "ethereum", label: "Eth" },
  { value: "solana", label: "Solana" },
];

const LEGACY_PROTOCOL_MAP: Record<string, WithdrawProtocol> = {
  base: "base",
  ethereum: "ethereum",
  eth: "ethereum",
  solana: "solana",
  arbitrum: "base",
  optimism: "base",
  polygon: "base",
};

function parseEvmChainId(chainId: string | number | undefined): number | null {
  if (chainId == null) return null;
  if (typeof chainId === "number" && Number.isFinite(chainId)) return chainId;
  const raw = String(chainId);
  if (raw.startsWith("eip155:")) {
    const n = parseInt(raw.split(":")[1] ?? "", 10);
    return Number.isFinite(n) ? n : null;
  }
  if (/^0x[0-9a-fA-F]+$/.test(raw)) return parseInt(raw, 16);
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  return null;
}

/** Signup / linked-wallet default: Solana → Solana; EVM → Base or Eth from linked chain. */
export function resolveSignupWithdrawProtocol(
  walletType: "ethereum" | "solana",
  chainId?: string | number,
): WithdrawProtocol {
  if (walletType === "solana") return "solana";
  const id = parseEvmChainId(chainId);
  if (id === 8453) return "base";
  if (id === 1 || id === 11155111) return "ethereum";
  return "base";
}

function normalizeStoredProtocol(raw: unknown): WithdrawProtocol | null {
  if (typeof raw !== "string") return null;
  return LEGACY_PROTOCOL_MAP[raw.toLowerCase()] ?? null;
}

export const WITHDRAW_SETTINGS_DEFAULTS: WithdrawSettings = {
  address: DEFAULT_WITHDRAW_ADDRESS,
  protocol: "base",
  require2FA: true,
  primary2FAMethod: null,
  configured2FA: {
    hardware: false,
    authenticator: false,
    sms: false,
  },
};

export function useWithdrawSettings() {
  const { walletType, chainId } = usePrivyWalletAddress();
  const signupDefaultProtocol = useMemo(
    () => resolveSignupWithdrawProtocol(walletType, chainId),
    [walletType, chainId],
  );

  const [settings, setSettings] = useState<WithdrawSettings>(() => ({
    ...WITHDRAW_SETTINGS_DEFAULTS,
    protocol: signupDefaultProtocol,
  }));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setSettings((prev) =>
          prev.protocol === signupDefaultProtocol
            ? prev
            : { ...prev, protocol: signupDefaultProtocol },
        );
        return;
      }
      const parsed = JSON.parse(raw) as Partial<WithdrawSettings>;
      const protocol =
        normalizeStoredProtocol(parsed.protocol) ?? signupDefaultProtocol;
      setSettings({
        ...WITHDRAW_SETTINGS_DEFAULTS,
        ...parsed,
        protocol,
      });
    } catch {
 // ignore storage errors
    }
  }, [signupDefaultProtocol]);

  const persist = useCallback(async (next: WithdrawSettings) => {
    setSettings(next);
    setIsSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
 // ignore storage errors
    } finally {
      setIsSaving(false);
    }
  }, []);

  const saveAddress = useCallback(
    (address: string) => persist({ ...settings, address }),
    [persist, settings]
  );

  const saveProtocol = useCallback(
    (protocol: WithdrawProtocol) => persist({ ...settings, protocol }),
    [persist, settings]
  );

  const setRequire2FA = useCallback(
    (require2FA: boolean) => persist({ ...settings, require2FA }),
    [persist, settings]
  );

  const configure2FAMethod = useCallback(
    (method: Withdraw2FAMethod) => {
      persist({
        ...settings,
        configured2FA: {
          hardware: method === "hardware",
          authenticator: method === "authenticator",
          sms: method === "sms",
        },
        primary2FAMethod: method,
      });
    },
    [persist, settings]
  );

  const remove2FAMethod = useCallback(
    (method: Withdraw2FAMethod) => {
      if (!settings.configured2FA[method]) return;
      persist({
        ...settings,
        configured2FA: {
          hardware: false,
          authenticator: false,
          sms: false,
        },
        primary2FAMethod: null,
      });
    },
    [persist, settings]
  );

  const setPrimary2FAMethod = useCallback(
    (method: Withdraw2FAMethod) => {
      if (!settings.configured2FA[method]) return;
      persist({ ...settings, primary2FAMethod: method });
    },
    [persist, settings]
  );

  const hasActive2FA = Object.values(settings.configured2FA).some(Boolean);

  const active2FAMethod =
    (Object.entries(settings.configured2FA).find(([, active]) => active)?.[0] as
      | Withdraw2FAMethod
      | undefined) ?? null;

  return {
    settings,
    isSaving,
    hasActive2FA,
    saveAddress,
    saveProtocol,
    setRequire2FA,
    configure2FAMethod,
    remove2FAMethod,
    setPrimary2FAMethod,
    active2FAMethod,
  };
}
