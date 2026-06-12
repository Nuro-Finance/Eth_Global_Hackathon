"use client";

/**
 * useJupiterSwapExecutor — S30 Phase 3b
 *
 * Drives the user-signs-once Solana swap flow end-to-end:
 *
 *   idle → fetching-quote → awaiting-signature → broadcasting → confirming → confirmed
 *                                                                             └→ error (terminal)
 *
 * Each call to execute() runs the pipeline:
 *   1. POST /api/quote/swap-solana/firm with the user's pubkey + the
 *      destination ATA. Returns a base64 versioned Solana tx.
 *   2. Deserialize via VersionedTransaction.deserialize().
 *   3. Hand to Privy's useSolanaWallets() signTransaction() for the
 *      embedded-wallet signature.
 *   4. Broadcast via @solana/web3.js Connection.sendRawTransaction().
 *   5. Poll confirmTransaction until 'confirmed' (or fail past
 *      lastValidBlockHeight).
 *
 * Why a hook (not just a service): we need React state for the progress
 * UX pill, plus retries that re-fetch a fresh firm quote — we can't
 * cache an expired blockhash and try again.
 *
 * Why Privy's signTransaction (not signAndSendTransaction): some Privy
 * v3 builds return the signed tx for us to broadcast separately. By
 * separating sign + send, we control the RPC the broadcast uses, log
 * each step distinctly, and can swap RPCs without changing the signer.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { useSolanaAddress } from "./useSolanaAddress";

export type SwapExecStatus =
  | "idle"
  | "fetching-quote"
  | "awaiting-signature"
  | "broadcasting"
  | "confirming"
  | "confirmed"
  | "error";

export interface SwapExecState {
  status: SwapExecStatus;
  txHash: string | null;
  /** Best-effort human-readable error reason for the UI. */
  error: string | null;
  /** Mirror of the firm-quote response so the UI can show route info. */
  routeLabels: string[] | null;
  inAmountRaw: string | null;
  outAmountRaw: string | null;
  /** When true, the swap output was routed to the user's Nuro Solana
   *  deposit USDC ATA → CCTP monitor will bridge + credit card. When
   *  false, output lands in the user's own ATA (no auto-reload). Drives
   *  the "Sign & swap → card credit" vs "Sign & swap → wallet" copy. */
  depositRoutingActive: boolean;
}

const INITIAL_STATE: SwapExecState = {
  status: "idle",
  txHash: null,
  error: null,
  routeLabels: null,
  inAmountRaw: null,
  outAmountRaw: null,
  depositRoutingActive: false,
};

export interface ExecuteArgs {
  /** Symbol from the Solana allowlist (e.g. 'PENGU') OR raw mint base58. */
  sellToken: string;
  /** Human-readable input amount (e.g. '1.5'). */
  amount: string;
  /** Optional buy mint or symbol; backend defaults to USDC on Solana. */
  buyToken?: string;
  /**
   * Optional destination ATA to receive the swap output. When set, the
   * single user signature swaps + deposits in one tx. Phase 3c will pass
   * the user's Nuro Solana deposit USDC ATA here so output flows directly
   * into the CCTP-monitored reserve account.
   */
  destinationTokenAccount?: string;
}

// Public Solana mainnet RPC. Heavy rate limits — for Phase 3b smoke tests
// only. NEXT_PUBLIC_SOLANA_RPC_URL takes precedence so a paid RPC
// (Helius / Quicknode) can be configured without code changes.
const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// Privy v3 Solana wallets expose signTransaction via dynamic-required
// submodule. Same defensive pattern as useSolanaAddress.
function useSolanaSigner(): {
  ready: boolean;
  signer: ((tx: VersionedTransaction) => Promise<VersionedTransaction>) | null;
  pubkey: string | null;
} {
  const { address: pubkey, ready } = useSolanaAddress();
  let signer: ((tx: VersionedTransaction) => Promise<VersionedTransaction>) | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const solanaModule = require("@privy-io/react-auth/solana");
    const { useSolanaWallets } = solanaModule;
    if (typeof useSolanaWallets === "function") {
      const result = useSolanaWallets();
      const wallets: any[] = result?.wallets || [];
      const embedded = wallets.find((w: any) => w?.walletClientType === "privy");
      const picked = embedded || wallets[0];
      // Privy v3 Solana wallet exposes `signTransaction(tx) → signedTx`.
      // Some builds also expose signAndSendTransaction; we don't use that
      // path so we control the broadcast RPC explicitly.
      if (picked && typeof picked.signTransaction === "function") {
        signer = (tx: VersionedTransaction) => picked.signTransaction(tx);
      }
    }
  } catch {
    signer = null;
  }
  return { ready, signer, pubkey };
}

export function useJupiterSwapExecutor() {
  const { data: session } = useSession();
  const accessToken = (session as any)?.accessToken as string | undefined;
  const { ready, signer, pubkey } = useSolanaSigner();

  const [state, setState] = useState<SwapExecState>(INITIAL_STATE);
  const inflightRef = useRef(false);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    inflightRef.current = false;
  }, []);

  const connection = useMemo(
    () => new Connection(SOLANA_RPC_URL, "confirmed"),
    [],
  );

  const execute = useCallback(
    async (args: ExecuteArgs) => {
      if (inflightRef.current) {
        // Refuse double-fire — protects against double-tap on the CTA
        // before status has progressed past 'awaiting-signature'.
        return;
      }
      if (!accessToken) {
        setState({ ...INITIAL_STATE, status: "error", error: "Not signed in" });
        return;
      }
      if (!pubkey) {
        setState({
          ...INITIAL_STATE,
          status: "error",
          error: "Solana wallet not connected — refresh and re-sign in",
        });
        return;
      }
      if (!signer) {
        setState({
          ...INITIAL_STATE,
          status: "error",
          error: "Solana signer unavailable — Privy may be loading",
        });
        return;
      }

      inflightRef.current = true;

      // ─── STEP 1: fetch firm quote + tx ─────────────────────────────────
      setState({ ...INITIAL_STATE, status: "fetching-quote" });
      const params = new URLSearchParams({
        sellToken: args.sellToken,
        amount: args.amount,
        userPublicKey: pubkey,
      });
      if (args.buyToken) params.set("buyToken", args.buyToken);
      if (args.destinationTokenAccount) {
        params.set("destinationTokenAccount", args.destinationTokenAccount);
      }
      let firm: any;
      try {
        const res = await fetch(`/api/quote/swap-solana/firm?${params.toString()}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        firm = await res.json().catch(() => ({}));
        if (!res.ok || firm?.error || firm?.degraded) {
          throw new Error(firm?.error || `Firm quote failed (HTTP ${res.status})`);
        }
        if (!firm.swapTransaction) {
          throw new Error("No swap transaction returned");
        }
      } catch (err: any) {
        inflightRef.current = false;
        setState({
          ...INITIAL_STATE,
          status: "error",
          error: err?.message || "Could not fetch firm quote",
        });
        return;
      }

      // ─── STEP 2: deserialize ───────────────────────────────────────────
      let tx: VersionedTransaction;
      try {
        const buf = Buffer.from(firm.swapTransaction, "base64");
        tx = VersionedTransaction.deserialize(buf);
      } catch (err: any) {
        inflightRef.current = false;
        setState({
          ...INITIAL_STATE,
          status: "error",
          error: "Could not decode swap transaction",
        });
        return;
      }

      // ─── STEP 3: user signs via Privy ──────────────────────────────────
      setState({
        ...INITIAL_STATE,
        status: "awaiting-signature",
        routeLabels: firm.routeLabels || null,
        inAmountRaw: firm.inAmount || null,
        outAmountRaw: firm.outAmount || null,
        depositRoutingActive: Boolean(firm.depositRoutingActive),
      });
      let signed: VersionedTransaction;
      try {
        signed = await signer(tx);
      } catch (err: any) {
        // Most-common: user rejected the prompt
        const rejected = /reject|denied|cancel/i.test(err?.message || "");
        inflightRef.current = false;
        setState({
          ...INITIAL_STATE,
          status: "error",
          error: rejected ? "Signature canceled" : err?.message || "Signature failed",
        });
        return;
      }

      // ─── STEP 4: broadcast ─────────────────────────────────────────────
      setState((s) => ({ ...s, status: "broadcasting" }));
      let txHash: string;
      try {
        txHash = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
      } catch (err: any) {
        inflightRef.current = false;
        // Common: BlockhashNotFound (>60s elapsed since quote), insufficient
        // SOL for fee, or RPC unreachable. Surface a retry-able error.
        const msg = err?.message || "Broadcast failed";
        const stale = /blockhash|expired|not found/i.test(msg);
        setState({
          ...INITIAL_STATE,
          status: "error",
          error: stale ? "Quote expired — refresh and try again" : msg,
        });
        return;
      }

      // ─── STEP 5: poll confirmation ─────────────────────────────────────
      setState((s) => ({ ...s, status: "confirming", txHash }));
      try {
        const conf = await connection.confirmTransaction(
          {
            signature: txHash,
            blockhash: tx.message.recentBlockhash,
            // Jupiter response includes lastValidBlockHeight; if missing
            // (older response), fall back to the polling default.
            lastValidBlockHeight: firm.lastValidBlockHeight || (await connection.getBlockHeight()) + 150,
          },
          "confirmed",
        );
        if (conf.value.err) {
          inflightRef.current = false;
          setState((s) => ({
            ...s,
            status: "error",
            error: `Tx reverted on-chain: ${JSON.stringify(conf.value.err).slice(0, 100)}`,
          }));
          return;
        }
      } catch (err: any) {
        inflightRef.current = false;
        setState((s) => ({
          ...s,
          status: "error",
          error: err?.message || "Confirmation timed out — check tx on Solscan",
        }));
        return;
      }

      // ─── DONE ──────────────────────────────────────────────────────────
      inflightRef.current = false;
      setState((s) => ({ ...s, status: "confirmed" }));
    },
    [accessToken, pubkey, signer, connection],
  );

  return {
    ...state,
    execute,
    reset,
    /** True when the hook is ready to accept an execute() call. */
    canExecute: ready && !!signer && !!accessToken && !!pubkey,
    /** Public for UI display. */
    pubkey,
  };
}
