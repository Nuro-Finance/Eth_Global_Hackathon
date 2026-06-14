"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, CheckCheck, Loader2 } from "lucide-react";

async function getToken(): Promise<string | null> {
  try {
    const s = await fetch("/api/auth/session").then(r => r.json());
    return s?.accessToken ?? null;
  } catch { return null; }
}

interface DepositAddresses {
  evm: string;
  base: string;
  solana: string | null;
}

const CHAINS = [
  { key: "base",   label: "Base",           sub: "Direct - USDC lands on card instantly",     addrKey: "base"   },
  { key: "evm",    label: "Any EVM Chain",  sub: "ETH · ARB · OP · MATIC · AVAX + 15 more",  addrKey: "evm"    },
  { key: "solana", label: "Solana",         sub: "USDC via Circle CCTP",                       addrKey: "solana" },
] as const;

interface Props { open: boolean; onClose: () => void; }

export default function DepositModal({ open, onClose }: Props) {
  const [addresses, setAddresses] = useState<DepositAddresses | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [tab, setTab]             = useState<"base" | "evm" | "solana">("base");
  const [copied, setCopied]       = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true); setError(null);
    getToken().then(token => {
      if (!token) { setError("Not signed in"); setLoading(false); return; }
      fetch(`/api/deposit-addresses`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(data => {
          if (data.error) setError(data.error);
          else setAddresses(data);
        })
        .catch(() => setError("Failed to load deposit addresses"))
        .finally(() => setLoading(false));
    });
  }, [open]);

  const currentAddress = addresses?.[CHAINS.find(c => c.key === tab)!.addrKey] ?? null;

  const handleCopy = () => {
    if (!currentAddress) return;
    navigator.clipboard.writeText(currentAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
            className="fixed z-50 inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center p-0 sm:p-4"
          >
            <div className="w-full sm:max-w-md rounded-t-[24px] sm:rounded-[20px] bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] p-6 shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-[15px] font-semibold text-[var(--color-text-primary)]">Deposit USDC</p>
                  <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">Send to your address - funds load to card automatically</p>
                </div>
                <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-[var(--color-bg-glass-strong)] transition-colors">
                  <X className="h-4 w-4 text-[var(--color-text-muted)]" />
                </button>
              </div>

              {/* Chain tabs */}
              <div className="flex gap-1 p-1 rounded-[12px] bg-[var(--color-bg-glass-strong)] mb-5">
                {CHAINS.map(c => (
                  <button
                    key={c.key}
                    onClick={() => { setTab(c.key); setCopied(false); }}
                    className={`flex-1 py-1.5 rounded-[10px] text-[12px] font-medium transition-all ${
                      tab === c.key
                        ? "bg-[var(--color-primary)] text-white shadow"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
                </div>
              )}

              {error && (
                <p className="text-[13px] text-red-400 text-center py-6">{error}</p>
              )}

              {!loading && !error && addresses && (
                <>
                  <p className="text-[11px] text-[var(--color-text-muted)] mb-2">
                    {CHAINS.find(c => c.key === tab)!.sub}
                  </p>

                  {tab === "solana" && !addresses.solana ? (
                    <p className="text-[13px] text-[var(--color-text-muted)] py-4 text-center">Solana address unavailable</p>
                  ) : (
                    <div className="rounded-[14px] border border-[var(--color-border-primary)] bg-[var(--color-bg-glass-strong)] p-4">
                      <p className="text-[12px] font-mono text-[var(--color-text-primary)] break-all leading-relaxed">
                        {currentAddress}
                      </p>
                      <button
                        onClick={handleCopy}
                        className="mt-3 w-full flex items-center justify-center gap-2 rounded-[10px] bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 transition-colors py-2 text-[13px] font-semibold text-white"
                      >
                        {copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? "Copied!" : "Copy Address"}
                      </button>
                    </div>
                  )}

                  {tab === "evm" && (
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-3 text-center">
                      Funds are automatically bridged to Base and loaded to your card within ~2 min
                    </p>
                  )}
                  {tab === "base" && (
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-3 text-center">
                      Send USDC on Base network only - minimum $1
                    </p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
