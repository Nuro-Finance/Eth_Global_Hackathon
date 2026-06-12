"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, type Hash } from "viem";
import { base } from "viem/chains";

export const BASE_CHAIN_ID = base.id;
const BASE_CHAIN_HEX = `0x${BASE_CHAIN_ID.toString(16)}`;

export type BaseSwapExecStatus =
  | "idle"
  | "fetching-quote"
  | "switching-chain"
  | "awaiting-signature"
  | "confirming"
  | "confirmed"
  | "error";

export interface BaseSwapExecState {
  status: BaseSwapExecStatus;
  txHash: Hash | null;
  error: string | null;
  routeSource: string | null;
}

const INITIAL: BaseSwapExecState = {
  status: "idle",
  txHash: null,
  error: null,
  routeSource: null,
};

type FirmQuote = {
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
  gas?: string;
  source?: string;
};

async function fetchFirmQuote(
  amount: string,
  taker: `0x${string}`,
): Promise<FirmQuote> {
  const params = new URLSearchParams({
    chainId: String(BASE_CHAIN_ID),
    sellToken: "native",
    amount,
    taker,
  });
  const res = await fetch(`/api/quote/swap-firm?${params.toString()}`, { cache: "no-store" });
  const firm = await res.json().catch(() => ({}));
  if (!res.ok || !firm.to || !firm.data) {
    throw new Error(firm.error ?? "Firm quote unavailable");
  }
  return firm as FirmQuote;
}

function pickEthereumWallet(wallets: ReturnType<typeof useWallets>["wallets"]) {
  return (
    wallets.find((w) => String(w.chainId || "").includes("eip155") && w.address?.startsWith("0x")) ??
    wallets.find((w) => w.address?.startsWith("0x")) ??
    null
  );
}

export function useBaseSwapExecutor() {
  const { wallets } = useWallets();
  const ethWallet = useMemo(() => pickEthereumWallet(wallets), [wallets]);
  const address = (ethWallet?.address as `0x${string}` | undefined) ?? undefined;

  const [state, setState] = useState<BaseSwapExecState>(INITIAL);
  const inflightRef = useRef(false);

  const reset = useCallback(() => {
    inflightRef.current = false;
    setState(INITIAL);
  }, []);

  const execute = useCallback(
    async (amount: string) => {
      if (inflightRef.current) return null;
      if (!ethWallet || !address) {
        setState({ ...INITIAL, status: "error", error: "Connect wallet first" });
        return null;
      }

      inflightRef.current = true;
      setState({ ...INITIAL, status: "fetching-quote" });

      try {
        const firm = await fetchFirmQuote(amount, address);

        setState((s) => ({
          ...s,
          status: "switching-chain",
          routeSource: firm.source ?? null,
        }));

        const provider = await ethWallet.getEthereumProvider();

        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: BASE_CHAIN_HEX }],
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Chain switch failed";
          throw new Error(/reject|denied|cancel/i.test(msg) ? "Chain switch canceled" : msg);
        }

        setState((s) => ({ ...s, status: "awaiting-signature" }));

        const client = createWalletClient({
          account: address,
          chain: base,
          transport: custom(provider),
        });

        const hash = await client.sendTransaction({
          to: firm.to,
          data: firm.data,
          value: firm.value ? BigInt(firm.value) : BigInt(0),
          gas: firm.gas ? BigInt(firm.gas) : undefined,
        });

        setState({
          status: "confirmed",
          txHash: hash,
          error: null,
          routeSource: firm.source ?? null,
        });
        inflightRef.current = false;
        return hash;
      } catch (err) {
        inflightRef.current = false;
        const msg = err instanceof Error ? err.message : "Swap failed";
        const rejected = /reject|denied|cancel/i.test(msg);
        setState({
          ...INITIAL,
          status: "error",
          error: rejected ? "Signature canceled" : msg.split("\n")[0].slice(0, 220),
        });
        return null;
      }
    },
    [address, ethWallet],
  );

  return {
    status: state.status,
    txHash: state.txHash,
    error: state.error,
    routeSource: state.routeSource,
    execute,
    reset,
    canExecute: !!ethWallet && !!address,
    address,
    isConnected: !!address,
  };
}
