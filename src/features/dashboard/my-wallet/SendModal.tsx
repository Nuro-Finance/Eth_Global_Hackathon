"use client";

/**
 * SendModal — Session 25 Phase 3.5
 *
 * Multi-token, multi-chain send driven by the real portfolio data.
 *
 * Behaviour:
 *   - Token picker dropdown lists every non-scam token from the portfolio
 *     (native + ERC-20), grouped visually by chain, with balance + USD
 *   - Default selection = highest-USD-value token the user holds
 *   - If the picked token lives on a different chain than the wallet is
 *     currently connected to, we transparently `switchChain` before signing
 *   - Native send: wagmi useSendTransaction (unchanged from Phase 2)
 *   - ERC-20 send: wagmi useWriteContract calling ERC20.transfer(to, amount)
 *   - State machine: idle → switching chain → signing → confirming → confirmed
 *   - Explorer link on success; inline red banner on errors; modal stays
 *     open so user can retry
 */

import { useState, useMemo, useEffect } from "react";
import { parseEther, parseUnits, isAddress, erc20Abi } from "viem";
import {
  useAccount,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { ArrowUpRight, ChevronDown, ExternalLink, Loader2, Check, Star, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  COMPACT_GLASS_SHELL_INNER_STYLE,
  COMPACT_GLASS_SHELL_OUTER_STYLE,
  FORM_MODAL_SHELL_CLASS,
  FULL_MODAL_OVERLAY_CLASS,
  WALLET_TRANSFER_MODAL_INNER_CLASS,
} from "@/components/ui/modalPresets";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WalletToken } from "./useWalletPortfolio";

const EXPLORER_BY_CHAIN: Record<number, { name: string; txUrl: (hash: string) => string }> = {
  1: { name: "Etherscan", txUrl: (h) => `https://etherscan.io/tx/${h}` },
  8453: { name: "Basescan", txUrl: (h) => `https://basescan.org/tx/${h}` },
  137: { name: "Polygonscan", txUrl: (h) => `https://polygonscan.com/tx/${h}` },
  42161: { name: "Arbiscan", txUrl: (h) => `https://arbiscan.io/tx/${h}` },
};

const CHAIN_LABEL: Record<number, string> = {
  1: "Ethereum",
  8453: "Base",
  137: "Polygon",
  42161: "Arbitrum",
};

function tokenKey(t: WalletToken): string {
  return `${t.chainId}-${t.contract ?? "native"}`;
}

function shortAddr(a: string) {
  if (!a) return "";
  return a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

const DEMO_PREVIEW_TX_HASH =
  "0x000000000000000000000000000000000000000000000000000000000000d3mo" as const;

export function SendModal({
  open,
  onOpenChange,
  tokens,
  previewMode = false,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  tokens?: WalletToken[];
  /** Dev populated preview — UI + demo send without wagmi connect. */
  previewMode?: boolean;
}) {
  const { chain, isConnected } = useAccount();
  const effectivelyConnected = isConnected || previewMode;
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();

  // Pool of sendable tokens — non-scam, non-zero balance. Sorted USD desc.
  const sendable = useMemo<WalletToken[]>(() => {
    if (!tokens || tokens.length === 0) return [];
    return tokens
      .filter((t) => {
        if (!t.isNative && t.usdPrice === 0) return false; // hide airdrop dust
        if (Number(t.balance) <= 0) return false;
        return true;
      })
      .sort((a, b) => b.usdValue - a.usdValue);
  }, [tokens]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewTxHash, setPreviewTxHash] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setPreviewTxHash(null);
  }, [open]);

  // Session 30 — Chris's Send destination picker, now wired to real data.
  // S30 batch: Last Used tab pulls from GET /api/address-book/recent which
  // aggregates distinct destination_address from the withdrawals table for
  // the current user. Address Book (saved favorites) still needs a CRUD
  // backend + migration — deferred to Session 31.
  type AddressSource = "lastUsed" | "addressBook";
  type DestinationRow = {
    label: string;
    address: string;
    usedCount?: number;
    // Optional fields populated only for savedContact rows; let the row
    // renderer surface inline delete + favorite-toggle actions.
    contactId?: string;
    favorite?: boolean;
  };
  const [addressSource, setAddressSource] = useState<AddressSource>("lastUsed");
  const [selectedRecentKey, setSelectedRecentKey] = useState<string | null>(null);
  const [recentDestinations, setRecentDestinations] = useState<DestinationRow[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  // Fetch real "last used" destinations when modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRecentLoading(true);
    (async () => {
      try {
        const tokenRes = await fetch("/api/auth/session");
        const session = await tokenRes.json().catch(() => null);
        const accessToken = session?.accessToken;
        const headers: Record<string, string> = {};
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const r = await fetch("/api/address-book/recent?limit=10", { headers });
        const data = await r.json().catch(() => ({ destinations: [] }));
        if (cancelled) return;
        const rows: DestinationRow[] = (data.destinations || []).map((d: any) => ({
          label: shortAddr(d.address),
          address: d.address,
          usedCount: d.count,
        }));
        setRecentDestinations(rows);
      } catch (err) {
        console.warn("[SendModal] address-book/recent fetch failed:", err);
        if (!cancelled) setRecentDestinations([]);
      } finally {
        if (!cancelled) setRecentLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Saved Address Book — DB-backed via migration 031. CRUD on the
  // backend at /address-book. Fetched when modal opens + refreshed
  // after any add/delete for snappy UX.
  type SavedContact = { id: string; address: string; label: string; chain?: string; favorite?: boolean };
  const [savedContacts, setSavedContacts] = useState<SavedContact[]>([]);
  const [savedContactsLoading, setSavedContactsLoading] = useState(false);
  const loadSavedContacts = async () => {
    setSavedContactsLoading(true);
    try {
      const tokenRes = await fetch("/api/auth/session");
      const session = await tokenRes.json().catch(() => null);
      const accessToken = session?.accessToken;
      const headers: Record<string, string> = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const r = await fetch("/api/address-book", { headers });
      const data = await r.json().catch(() => ({ contacts: [] }));
      setSavedContacts(data.contacts || []);
    } catch (err) {
      console.warn("[SendModal] address-book fetch failed:", err);
      setSavedContacts([]);
    } finally {
      setSavedContactsLoading(false);
    }
  };
  useEffect(() => {
    if (!open) return;
    void loadSavedContacts();
  }, [open]);

  // S31 H2 — toggle favorite on a saved contact. Optimistically updates
  // local state, then PATCHes /api/address-book/:id; reverts on error.
  const toggleFavorite = async (contactId: string, currentFav: boolean) => {
    // Optimistic update
    setSavedContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, favorite: !currentFav } : c)),
    );
    try {
      const tokenRes = await fetch("/api/auth/session");
      const session = await tokenRes.json().catch(() => null);
      const accessToken = session?.accessToken;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const r = await fetch(`/api/address-book/${encodeURIComponent(contactId)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ favorite: !currentFav }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // Authoritative refresh in case ordering shifted (favorites-first).
      await loadSavedContacts();
    } catch (err) {
      console.warn("[SendModal] toggle favorite failed:", err);
      // Revert optimistic update
      setSavedContacts((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, favorite: currentFav } : c)),
      );
    }
  };

  const savedAsRows: DestinationRow[] = savedContacts.map((c) => ({
    label: c.label,
    address: c.address,
    contactId: c.id,
    favorite: !!c.favorite,
  }));
  const addressRows = addressSource === "addressBook" ? savedAsRows : recentDestinations;

  // Save current recipient to address book. Prompts for a label; uses
  // a defaulted "New contact <short>" for quick-saves.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const canSaveCurrent =
    recipient.trim() && isAddress(recipient.trim()) &&
    !savedContacts.some((c) => c.address.toLowerCase() === recipient.trim().toLowerCase());
  const saveCurrentToAddressBook = async () => {
    setSaveError(null);
    const addr = recipient.trim();
    if (!addr) return;
    const short = addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
    const label = (typeof window !== "undefined" && window.prompt
      ? window.prompt("Save this contact as:", short)
      : short) || short;
    if (!label.trim()) return;
    setSaving(true);
    try {
      const tokenRes = await fetch("/api/auth/session");
      const session = await tokenRes.json().catch(() => null);
      const accessToken = session?.accessToken;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const r = await fetch("/api/address-book", {
        method: "POST",
        headers,
        body: JSON.stringify({ address: addr, label }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      await loadSavedContacts();
    } catch (err: any) {
      setSaveError(err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteSavedContact = async (id: string) => {
    try {
      const tokenRes = await fetch("/api/auth/session");
      const session = await tokenRes.json().catch(() => null);
      const accessToken = session?.accessToken;
      const headers: Record<string, string> = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      await fetch(`/api/address-book/${encodeURIComponent(id)}`, { method: "DELETE", headers });
      await loadSavedContacts();
    } catch (err) {
      console.warn("[SendModal] delete contact failed:", err);
    }
  };

  // ENS resolution for the "Use" button. When the user types foo.eth we
  // hit /api/ens/resolve (mainnet) and substitute the returned 0x address.
  const [ensResolving, setEnsResolving] = useState(false);
  const [ensError, setEnsError] = useState<string | null>(null);
  const resolveEns = async (name: string): Promise<string | null> => {
    setEnsError(null);
    const trimmed = name.trim().toLowerCase();
    if (!trimmed.endsWith(".eth")) return null;
    setEnsResolving(true);
    try {
      const tokenRes = await fetch("/api/auth/session");
      const session = await tokenRes.json().catch(() => null);
      const accessToken = session?.accessToken;
      const headers: Record<string, string> = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const r = await fetch(`/api/ens/resolve?name=${encodeURIComponent(trimmed)}`, { headers });
      if (!r.ok) {
        setEnsError(r.status === 404 ? "ENS name does not resolve" : "ENS lookup failed");
        return null;
      }
      const data = await r.json().catch(() => null);
      return data?.address || null;
    } catch (err) {
      console.warn("[SendModal] ENS resolve failed:", err);
      setEnsError("ENS lookup failed");
      return null;
    } finally {
      setEnsResolving(false);
    }
  };

  // Default selection when modal opens: first sendable token, else null.
  useEffect(() => {
    if (open && !selectedKey && sendable.length > 0) {
      setSelectedKey(tokenKey(sendable[0]));
    }
  }, [open, selectedKey, sendable]);

  const selectedToken = useMemo<WalletToken | null>(() => {
    if (!selectedKey) return null;
    return sendable.find((t) => tokenKey(t) === selectedKey) ?? null;
  }, [selectedKey, sendable]);

  // Wagmi tx hooks — we run both and read the active one based on path.
  const {
    sendTransaction,
    data: nativeHash,
    isPending: isNativeSigning,
    reset: resetNative,
  } = useSendTransaction({
    mutation: { onError: (err) => setErrorMsg(err.message.split("\n")[0].slice(0, 220)) },
  });
  const {
    writeContract,
    data: erc20Hash,
    isPending: isErc20Signing,
    reset: resetErc20,
  } = useWriteContract({
    mutation: { onError: (err) => setErrorMsg(err.message.split("\n")[0].slice(0, 220)) },
  });
  const txHash = nativeHash ?? erc20Hash;
  const isSigning = isNativeSigning || isErc20Signing;
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: selectedToken?.chainId,
  });

  // Reset form on close
  useEffect(() => {
    if (!open) {
      setRecipient("");
      setAmount("");
      setErrorMsg(null);
      setPickerOpen(false);
      setSelectedKey(null);
      resetNative();
      resetErc20();
    }
  }, [open, resetNative, resetErc20]);

  // Phase 5 polish — tell the dashboard to refresh portfolio + activity
  // a few seconds after confirmation so the send shows up without waiting
  // for the 60s poll cycle.
  useEffect(() => {
    if (isConfirmed) {
      window.dispatchEvent(new CustomEvent("wallet-activity-bump"));
    }
  }, [isConfirmed]);

  const validationError = useMemo<string | null>(() => {
    if (!selectedToken) return null;
    if (recipient && !isAddress(recipient)) return "Invalid recipient address";
    if (amount) {
      const amountNum = Number(amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) return "Amount must be greater than 0";
      if (amountNum > Number(selectedToken.balance)) {
        return `Insufficient balance (${Number(selectedToken.balance).toFixed(6)} ${selectedToken.symbol})`;
      }
    }
    return null;
  }, [recipient, amount, selectedToken]);

  const needsChainSwitch = selectedToken != null && chain != null && chain.id !== selectedToken.chainId;

  const canSubmit = Boolean(
    effectivelyConnected &&
      selectedToken &&
      recipient &&
      amount &&
      !validationError &&
      isAddress(recipient) &&
      !isSigning &&
      !isConfirming &&
      !isSwitching
  );

  const handleSend = async () => {
    if (!canSubmit || !selectedToken || !isAddress(recipient)) return;
    setErrorMsg(null);

    if (previewMode && !isConnected) {
      setPreviewTxHash(DEMO_PREVIEW_TX_HASH);
      window.dispatchEvent(new CustomEvent("wallet-activity-bump"));
      return;
    }

    try {
      if (needsChainSwitch) {
        await switchChainAsync({ chainId: selectedToken.chainId });
      }

      if (selectedToken.isNative) {
        sendTransaction({
          to: recipient,
          value: parseEther(amount),
          chainId: selectedToken.chainId,
        });
      } else if (selectedToken.contract) {
        const rawAmount = parseUnits(amount, selectedToken.decimals);
        writeContract({
          abi: erc20Abi,
          address: selectedToken.contract as `0x${string}`,
          functionName: "transfer",
          args: [recipient, rawAmount],
          chainId: selectedToken.chainId,
        });
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message.split("\n")[0].slice(0, 220) : "Unable to send");
    }
  };

  const explorer = selectedToken ? EXPLORER_BY_CHAIN[selectedToken.chainId] : null;
  const resolvedTxHash = txHash ?? previewTxHash;
  const previewConfirmed = Boolean(previewTxHash);

  const status = isConfirmed || previewConfirmed
    ? "confirmed"
    : isConfirming
      ? "confirming"
      : isSigning
        ? "signing"
        : isSwitching
          ? "switching"
          : "idle";

  const ctaLabel = (() => {
    if (!selectedToken) return previewMode ? "Select token" : "Connect wallet";
    if (status === "switching") return `Switching to ${CHAIN_LABEL[selectedToken.chainId]}…`;
    if (status === "signing") return "Confirm in wallet";
    if (status === "confirming") return "Waiting for confirmation";
    if (needsChainSwitch) return `Switch to ${CHAIN_LABEL[selectedToken.chainId]} + Send`;
    return `Send ${selectedToken.symbol}`;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        overlayClassName={FULL_MODAL_OVERLAY_CLASS}
        className={cn(FORM_MODAL_SHELL_CLASS, "!max-w-md")}
        style={COMPACT_GLASS_SHELL_OUTER_STYLE}
      >
        <div className={WALLET_TRANSFER_MODAL_INNER_CLASS} style={COMPACT_GLASS_SHELL_INNER_STYLE}>
          <DialogClose asChild>
            <button
              type="button"
              className={cn(
                "absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-[10px] p-1.5 text-[var(--color-text-muted)] outline-none transition-all",
                "hover:bg-white/5 hover:text-[var(--color-text-primary)]",
                "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
              )}
              aria-label="Close"
            >
              <X className="h-full w-full" strokeWidth={2} />
            </button>
          </DialogClose>

          <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-6 sm:px-8 sm:pb-6 sm:pt-7">
            <div className="flex shrink-0 items-center gap-3 pr-8">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-[var(--color-bg-input)]">
                <ArrowUpRight
                  className="h-[18px] w-[18px] text-[var(--color-primary)]"
                  strokeWidth={2}
                  aria-hidden
                />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle asChild>
                  <h1 className="text-[16px] font-medium leading-none text-[var(--color-text-primary)]">
                    Send
                  </h1>
                </DialogTitle>
                <DialogDescription asChild>
                  <p className="mt-1.5 text-[13px] leading-snug text-[var(--color-text-muted)]">
                    Send crypto to a wallet address on the same chain.
                  </p>
                </DialogDescription>
              </div>
            </div>

            <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
          {status === "confirmed" && resolvedTxHash ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                <Check className="h-7 w-7" strokeWidth={2.5} />
              </div>
              <h3 className="mb-2 text-lg font-semibold">Transaction confirmed</h3>
              <p className="mb-4 text-sm text-[var(--color-text-muted)]">
                Sent {amount} {selectedToken?.symbol ?? ""} to {shortAddr(recipient)} on{" "}
                {CHAIN_LABEL[selectedToken?.chainId ?? 0] ?? "chain"}
              </p>
              {explorer && !previewConfirmed && (
                <a
                  href={explorer.txUrl(resolvedTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-[10px] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-white/[0.1]"
                >
                  View on {explorer.name}
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
                </a>
              )}
            </div>
          ) : sendable.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">
                No sendable balances detected. Receive some tokens first, then come back.
              </p>
            </div>
          ) : (
            <>
              {/* Token picker */}
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Token
              </label>
              <div className="relative mb-4">
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  disabled={isSigning || isConfirming || isSwitching}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-[10px] border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition-colors hover:border-white/20",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40 disabled:opacity-50"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                      {selectedToken?.symbol ?? "Select token"}
                      {selectedToken && (
                        <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                          {CHAIN_LABEL[selectedToken.chainId] ?? `chain ${selectedToken.chainId}`}
                        </span>
                      )}
                    </div>
                    {selectedToken && (
                      <div className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
                        Balance: {Number(selectedToken.balance).toFixed(selectedToken.balance && Number(selectedToken.balance) < 1 ? 6 : 4)} {selectedToken.symbol}
                        {selectedToken.usdValue > 0 && ` · $${selectedToken.usdValue.toFixed(2)}`}
                      </div>
                    )}
                  </div>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-white/45 transition-transform", pickerOpen && "rotate-180")} strokeWidth={2} />
                </button>

                {pickerOpen && (
                  <div className="absolute left-0 right-0 top-full z-[40] mt-1 max-h-[280px] overflow-y-auto rounded-[10px] border border-white/10 bg-[#0a0a14] shadow-[0_24px_48px_rgba(0,0,0,0.55)]">
                    {sendable.map((t) => {
                      const key = tokenKey(t);
                      const isSelected = key === selectedKey;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setSelectedKey(key);
                            setPickerOpen(false);
                            setAmount("");
                          }}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors",
                            "hover:bg-white/[0.04]",
                            isSelected && "bg-[var(--color-primary)]/10"
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                              {t.symbol}
                              <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                                {CHAIN_LABEL[t.chainId] ?? `chain ${t.chainId}`}
                              </span>
                            </div>
                            <div className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
                              {Number(t.balance).toFixed(Number(t.balance) < 1 ? 6 : 4)} {t.symbol}
                              {t.usdValue > 0 && ` · $${t.usdValue.toFixed(2)}`}
                            </div>
                          </div>
                          {isSelected && <Check className="h-4 w-4 shrink-0 text-[var(--color-primary)]" strokeWidth={2.5} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recipient — Session 30 cosmetic port of Chris's Send destination picker */}
              <div className="mb-4 rounded-[12px] border border-white/10 bg-white/[0.02] p-3">
                <p className="mb-2 px-1 text-sm font-semibold text-[var(--color-text-primary)]">Send to</p>

                {/* 2-tab segmented control: Last Used / Address Book */}
                <div className="mb-3 grid grid-cols-2 gap-2 rounded-[14px] bg-white/[0.04] p-1">
                  {([["lastUsed", "Last Used"], ["addressBook", "Address Book"]] as const).map(([key, label]) => {
                    const active = addressSource === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setAddressSource(key)}
                        disabled={isSigning || isConfirming || isSwitching}
                        className={cn(
                          "h-9 rounded-[12px] text-[12px] font-semibold transition-colors disabled:opacity-50",
                          active
                            ? "bg-white/[0.08] text-white"
                            : "bg-transparent text-white/55 hover:text-white"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Address / ENS input with Paste/Use button */}
                <div className="mb-3 flex h-11 items-center gap-2 rounded-[14px] bg-white/[0.04] px-3">
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value.trim())}
                    placeholder="Address or ENS"
                    disabled={isSigning || isConfirming || isSwitching}
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] font-medium text-[var(--color-text-primary)] outline-none placeholder:text-white/30 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const value = recipient.trim();
                      if (value) {
                        // "Use" path — if ENS name, resolve to 0x. Otherwise
                        // the address is already committed via onChange.
                        if (value.toLowerCase().endsWith(".eth")) {
                          const resolved = await resolveEns(value);
                          if (resolved) setRecipient(resolved);
                        }
                        return;
                      }
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text) setRecipient(text.trim());
                      } catch {
                        // clipboard denied — ignore
                      }
                    }}
                    disabled={isSigning || isConfirming || isSwitching || ensResolving}
                    className={cn(
                      "inline-flex h-7 shrink-0 items-center justify-center rounded-full px-2.5 text-[11px] font-semibold transition-colors disabled:opacity-50",
                      recipient.trim()
                        ? "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90"
                        : "bg-white/[0.05] text-white/80 hover:bg-white/[0.07] hover:text-white"
                    )}
                    aria-label={recipient.trim() ? "Use address" : "Paste"}
                  >
                    {ensResolving ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : recipient.trim() ? (
                      "Use"
                    ) : (
                      "Paste"
                    )}
                  </button>
                  {canSaveCurrent && (
                    <button
                      type="button"
                      onClick={() => void saveCurrentToAddressBook()}
                      disabled={saving}
                      title="Save to address book"
                      className="inline-flex h-7 shrink-0 items-center justify-center rounded-full bg-white/[0.04] px-2.5 text-[11px] font-semibold text-white/80 hover:bg-white/[0.1] hover:text-white transition-colors disabled:opacity-50"
                      aria-label="Save to address book"
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "＋ Save"}
                    </button>
                  )}
                </div>
                {ensError && (
                  <p className="-mt-2 mb-2 px-1 text-[11px] text-red-400">{ensError}</p>
                )}
                {saveError && (
                  <p className="-mt-2 mb-2 px-1 text-[11px] text-red-400">{saveError}</p>
                )}

                {/* Destination rows */}
                <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pt-1">
                  {addressRows.length === 0 && addressSource === "lastUsed" && !recentLoading && (
                    <div className="rounded-[14px] bg-white/[0.04] px-3 py-4 text-center text-[12px] text-white/50">
                      No recent destinations yet.
                      <br />
                      Addresses you send to will appear here.
                    </div>
                  )}
                  {addressRows.length === 0 && addressSource === "lastUsed" && recentLoading && (
                    <div className="flex items-center justify-center gap-2 rounded-[14px] px-3 py-4 text-[12px] text-white/50">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading…
                    </div>
                  )}
                  {addressRows.length === 0 && addressSource === "addressBook" && !savedContactsLoading && (
                    <div className="rounded-[14px] bg-white/[0.04] px-3 py-4 text-center text-[12px] text-white/50">
                      Address book is empty.
                      <br />
                      Paste an address above and click <span className="text-white/80 font-semibold">+ Save</span> to add your first contact.
                    </div>
                  )}
                  {addressRows.length === 0 && addressSource === "addressBook" && savedContactsLoading && (
                    <div className="flex items-center justify-center gap-2 rounded-[14px] px-3 py-4 text-[12px] text-white/50">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading contacts…
                    </div>
                  )}
                  {addressRows.map((row) => {
                    const active = selectedRecentKey === row.label;
                    const isSavedContact = !!row.contactId;
                    const disabled = isSigning || isConfirming || isSwitching;
                    const selectRow = () => {
                      if (disabled) return;
                      setSelectedRecentKey(row.label);
                      setRecipient(row.address);
                    };
                    return (
                      <div
                        key={row.label}
                        role="button"
                        tabIndex={disabled ? -1 : 0}
                        aria-pressed={active}
                        aria-disabled={disabled}
                        onClick={selectRow}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            selectRow();
                          }
                        }}
                        className={cn(
                          "flex w-full cursor-pointer items-center justify-between gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors",
                          active ? "bg-white/[0.04]" : "hover:bg-white/[0.04]",
                          disabled && "cursor-not-allowed opacity-50"
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          {/* Simple deterministic colored avatar (stand-in for DemoDestinationAvatar) */}
                          <span
                            className="h-9 w-9 shrink-0 rounded-full"
                            aria-hidden
                            style={{
                              background: `linear-gradient(135deg, hsl(${(row.label.charCodeAt(0) * 37) % 360}, 60%, 45%), hsl(${(row.label.charCodeAt(row.label.length - 1) * 59) % 360}, 60%, 55%))`,
                            }}
                          />
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-semibold text-[var(--color-text-primary)]">
                              {row.label}
                            </p>
                            <p className="mt-0.5 truncate font-mono text-[13px] font-semibold text-white/70">
                              {row.address}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {typeof row.usedCount === "number" ? (
                            <span className="text-[11px] font-semibold text-white/40">
                              Used {row.usedCount} {row.usedCount === 1 ? "time" : "times"}
                            </span>
                          ) : null}
                          {active ? <Check className="h-4 w-4 text-white/80" strokeWidth={2.25} /> : null}

                          {/* Saved-contact actions: favorite toggle + delete.
                              Both stop event propagation so they don't also
                              trigger the row's select-this behavior. */}
                          {isSavedContact && row.contactId && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void toggleFavorite(row.contactId!, !!row.favorite);
                                }}
                                disabled={disabled}
                                aria-label={row.favorite ? "Unfavorite contact" : "Favorite contact"}
                                title={row.favorite ? "Remove from favorites" : "Mark as favorite"}
                                className={cn(
                                  "rounded-full p-1.5 transition-colors hover:bg-white/[0.08] disabled:opacity-50",
                                  row.favorite ? "text-amber-400" : "text-white/40 hover:text-white/70"
                                )}
                              >
                                <Star
                                  className="h-3.5 w-3.5"
                                  strokeWidth={2}
                                  fill={row.favorite ? "currentColor" : "none"}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Delete saved contact "${row.label}"?`)) {
                                    void deleteSavedContact(row.contactId!);
                                  }
                                }}
                                disabled={disabled}
                                aria-label="Delete saved contact"
                                title="Delete saved contact"
                                className="rounded-full p-1.5 text-white/40 transition-colors hover:bg-red-500/15 hover:text-red-400 disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Amount */}
              <label className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Amount
                {selectedToken && (
                  <button
                    type="button"
                    onClick={() => setAmount(selectedToken.balance)}
                    disabled={isSigning || isConfirming || isSwitching}
                    className="text-[var(--color-primary)] hover:underline disabled:opacity-50"
                  >
                    Max: {Number(selectedToken.balance).toFixed(Number(selectedToken.balance) < 1 ? 6 : 4)} {selectedToken.symbol}
                  </button>
                )}
              </label>
              <div className="relative mb-4">
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    const v = e.target.value.replace(",", ".");
                    if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) setAmount(v);
                  }}
                  placeholder="0.0"
                  disabled={isSigning || isConfirming || isSwitching}
                  className="w-full rounded-[10px] border border-white/10 bg-white/[0.04] px-4 py-3 pr-16 font-mono text-sm text-[var(--color-text-primary)] placeholder:text-white/25 focus:border-[var(--color-primary)]/40 focus:outline-none disabled:opacity-50"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--color-text-muted)]">
                  {selectedToken?.symbol ?? "—"}
                </span>
              </div>

              {needsChainSwitch && !errorMsg && !validationError && (
                <div className="mb-4 rounded-[10px] border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/[0.05] px-3 py-2 text-[11px] text-[var(--color-text-muted)]">
                  <span className="font-semibold text-[var(--color-primary)]">Chain switch required.</span> Your wallet is on {chain?.name ?? "a different chain"}; we'll switch to {CHAIN_LABEL[selectedToken!.chainId]} when you hit send.
                </div>
              )}

              {(validationError || errorMsg) && (
                <div className="mb-4 rounded-[10px] border border-red-500/30 bg-red-500/[0.05] px-4 py-3 text-xs text-red-400">
                  {errorMsg ?? validationError}
                </div>
              )}

              <Button
                type="button"
                onClick={handleSend}
                disabled={!canSubmit}
                className={cn(
                  "w-full h-11 rounded-[10px] text-sm font-semibold transition-all",
                  canSubmit
                    ? "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90"
                    : "bg-white/[0.04] text-white/40"
                )}
              >
                {status === "signing" || status === "confirming" || status === "switching" ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> {ctaLabel}
                  </span>
                ) : (
                  ctaLabel
                )}
              </Button>
            </>
          )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
