"use client";
import { useState, useEffect, useCallback } from "react";
import { useJupiterSwapExecutor } from "@/features/dashboard/my-wallet/useJupiterSwapExecutor";
import { usePrivy, useConnectWallet, useCreateWallet } from "@privy-io/react-auth";
import { createPortal } from "react-dom";
import { copyToClipboard } from "@/lib/clipboard";
import { formatUSD } from "@/lib/format";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowLeft, Copy, CheckCheck, ChevronDown } from "lucide-react";
import { KycReloadHint } from "@/features/dashboard/my-card-1/components/KycReloadHint";


async function getToken(): Promise<string | null> {
  try {
    const s = await fetch("/api/auth/session").then(r => r.json());
    return s?.accessToken ?? null;
  } catch { return null; }
}

interface DepositAddresses { evm: string; base: string; solana: string | null; }
type Step = "form" | "chains" | "qr" | "processing" | "success";
type DepositKey = "base" | "evm" | "solana";

interface Chain {
  id: number;
  name: string;
  symbol: string;
  icon: string;
  depositKey: DepositKey;
}

const CHAINS: Chain[] = [
  { id: 8453,   name: "Base",        symbol: "BASE",  icon: "base",       depositKey: "base"   },
  { id: 1,      name: "Ethereum",    symbol: "ETH",   icon: "ethereum",   depositKey: "evm"    },
  { id: 42161,  name: "Arbitrum",    symbol: "ARB",   icon: "arbitrum",   depositKey: "evm"    },
  { id: 10,     name: "Optimism",    symbol: "OP",    icon: "optimism",   depositKey: "evm"    },
  { id: 137,    name: "Polygon",     symbol: "MATIC", icon: "polygon",    depositKey: "evm"    },
  { id: 43114,  name: "Avalanche",   symbol: "AVAX",  icon: "avalanche",  depositKey: "evm"    },
  { id: 56,     name: "BSC",         symbol: "BNB",   icon: "binance",    depositKey: "evm"    },
  { id: 324,    name: "zkSync Era",  symbol: "ZK",    icon: "zksync era", depositKey: "evm"    },
  { id: 534352, name: "Scroll",      symbol: "SCR",   icon: "scroll",     depositKey: "evm"    },
  { id: 59144,  name: "Linea",       symbol: "ETH",   icon: "linea",      depositKey: "evm"    },
  { id: 42220,  name: "Celo",        symbol: "CELO",  icon: "celo",       depositKey: "evm"    },
  { id: 100,    name: "Gnosis",      symbol: "GNO",   icon: "gnosis",     depositKey: "evm"    },
  { id: 130,    name: "Unichain",    symbol: "UNI",   icon: "unichain",   depositKey: "evm"    },
  { id: 146,    name: "Sonic",       symbol: "S",     icon: "sonic",      depositKey: "evm"    },
  { id: 480,    name: "World Chain", symbol: "WLD",   icon: "worldcoin",  depositKey: "evm"    },
  { id: 57073,  name: "Ink",         symbol: "INK",   icon: "ink",        depositKey: "evm"    },
  { id: 999,    name: "HyperEVM",    symbol: "HYPE",  icon: "hyperliquid",depositKey: "evm"    },
  { id: 1329,   name: "Sei",         symbol: "SEI",   icon: "sei",        depositKey: "evm"    },
  { id: 98866,  name: "Plume",       symbol: "PLUME", icon: "plume",      depositKey: "evm"    },
  { id: 143,    name: "Monad",       symbol: "MON",   icon: "monad",      depositKey: "evm"    },
  { id: 50,     name: "XDC",         symbol: "XDC",   icon: "xdc",        depositKey: "evm"    },
  { id: 81224,  name: "Codex",       symbol: "CDX",   icon: "codex",      depositKey: "evm"    },
  { id: -1,     name: "Solana",      symbol: "SOL",   icon: "solana",     depositKey: "solana" },
];

function chainIconUrl(icon: string) {
  return `https://icons.llamao.fi/icons/chains/rsz_${icon}.jpg`;
}

function ChainIcon({ chain, size = "h-5 w-5" }: { chain: Chain; size?: string }) {
  const [err, setErr] = useState(false);
  if (err) {
    return (
      <div className={`${size} rounded-full bg-[var(--color-bg-glass-strong)] flex items-center justify-center text-[9px] font-bold text-[var(--color-text-muted)]`}>
        {chain.symbol.slice(0, 3)}
      </div>
    );
  }
  return (
    <img
      src={chainIconUrl(chain.icon)}
      className={`${size} rounded-full object-cover`}
      alt={chain.name}
      onError={() => setErr(true)}
    />
  );
}

// Session 23 Thread D — token catalog now has 3 categories (stables,
// natives, memecoins). Stables are direct deposits (no swap). Natives +
// memecoins auto-swap to USDC via 0x. Memecoin list comes from the live
// /api/supported-tokens feed (driven by the DB-backed erc20_allowlist
// table), so admin toggles show up without a redeploy.
type TokenCategory = "stables" | "natives" | "memecoins";
interface TokenOption {
  symbol: string;
  name: string;
  icon: string;              // CoinGecko small image URL (fallback-tolerant)
  category: TokenCategory;
  autoChainName?: string;    // When set, picking this token auto-selects this chain
}

const STABLE_TOKENS: TokenOption[] = [
  { symbol: "USDC",   name: "USDC",   icon: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",     category: "stables" },
  { symbol: "USDT",   name: "Tether", icon: "https://assets.coingecko.com/coins/images/325/small/Tether.png",    category: "stables" },
  { symbol: "DAI",    name: "DAI",    icon: "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png", category: "stables" },
];

// Native tokens — ETH spans 8 chains (user re-picks chain separately).
// Others auto-set their home chain on selection.
const NATIVE_TOKENS_CATALOG: TokenOption[] = [
  { symbol: "ETH",   name: "Ethereum", icon: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",              category: "natives" },
  { symbol: "MATIC", name: "Polygon",  icon: "https://assets.coingecko.com/coins/images/4713/small/polygon.png",              category: "natives", autoChainName: "Polygon" },
  { symbol: "BNB",   name: "BNB",      icon: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",          category: "natives", autoChainName: "BSC" },
  { symbol: "AVAX",  name: "Avalanche",icon: "https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png", category: "natives", autoChainName: "Avalanche" },
  { symbol: "S",     name: "Sonic",    icon: "https://assets.coingecko.com/coins/images/52964/small/sonic.png",               category: "natives", autoChainName: "Sonic" },
  { symbol: "HYPE",  name: "HyperEVM", icon: "https://assets.coingecko.com/coins/images/50882/small/hyperliquid.jpg",         category: "natives", autoChainName: "HyperEVM" },
];

// Back-compat alias — some older code expects the USDC/USDT/DAI shape
const TOKENS = STABLE_TOKENS;
const STABLE_SYMBOLS = new Set(["USDC", "USDT", "DAI"]);

// Live-quote preview. S30 Phase 2: consolidated to /api/quote/best — a
// provider-agnostic aggregator endpoint that fans out to 0x (EVM) +
// Jupiter (Solana) in parallel and returns the winner plus alternatives.
// FE no longer needs to route-select per chain. Debounced, returns null
// for stables (they direct-deposit, no swap quote).
interface LiveQuote {
  buyAmountUsd: number;
  minBuyAmountUsd: number;
  meetsThreshold: boolean;
  slippageBps: number;
  minSwapUsd: number;
  chainName: string;
  source?: 'jupiter' | 'zerox' | 'uniswap' | '1inch';
  routeLabels?: string[];
  priceImpactBps?: number;
  alternatives?: Array<{ source: string; buyAmountUsd: number }>;
}
function useLiveSwapQuote(symbol: string, amount: string, chainName: string, chainId: number) {
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (STABLE_SYMBOLS.has(symbol)) { setQuote(null); setLoading(false); return; }
    const n = parseFloat(amount);
    if (!n || n <= 0 || !isFinite(n) || !chainId) { setQuote(null); setLoading(false); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const h = setTimeout(() => {
      // The aggregator accepts 'native' as the EVM-native sentinel (ETH/
      // MATIC/BNB/AVAX/S/HYPE) and treats catalog symbols (SOL/PENGU/BONK
      // /WIF/POPCAT/MOODENG/JUP) as Solana SPL when chainId === -1.
      const isEvmNative = ["ETH", "MATIC", "BNB", "AVAX", "S", "HYPE"].includes(symbol) && chainId !== -1;
      const sellTokenParam = isEvmNative ? "native" : symbol;
      const url = `/api/quote/best?chainId=${chainId}&sellToken=${encodeURIComponent(sellTokenParam)}&amount=${encodeURIComponent(amount)}`;
      fetch(url, { signal: ctrl.signal })
        .then(r => r.json())
        .then(data => { if (!ctrl.signal.aborted) { setQuote(data.error || data.degraded ? null : data as LiveQuote); } })
        .catch(() => {})
        .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    }, 400);
    return () => { clearTimeout(h); ctrl.abort(); };
  }, [symbol, amount, chainName, chainId]);
  return { quote, loading };
}
interface Props { open: boolean; onClose: () => void; }

export default function ReloadModal({ open, onClose }: Props) {
  const [step, setStep]               = useState<Step>("form");
  const [addresses, setAddresses]     = useState<DepositAddresses | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [selectedChain, setSelectedChain] = useState<Chain>(CHAINS[0]);
  const [selectedToken, setSelectedToken] = useState<string>("USDC");
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [pickerCategory, setPickerCategory]   = useState<TokenCategory>("stables");
  const [amount, setAmount]           = useState("");
  const [copied, setCopied]           = useState(false);
  const [search, setSearch]           = useState("");

  // Session 23 Thread D — fetch live allowlist from backend. Drives the
  // memecoin tab in the token picker + lets us know whether memecoinEnabled.
  const [supportedTokens, setSupportedTokens] = useState<{
    memecoins: Array<{ symbol: string; name: string; chainName: string; chainId: number; comingSoon?: boolean }>;
    bluechips: Array<{ symbol: string; name: string; chainName: string; chainId: number }>;
    meta?: { memecoinEnabled?: boolean };
  } | null>(null);
  useEffect(() => {
    if (!open) return;
    fetch("/api/supported-tokens")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSupportedTokens(data); })
      .catch(() => {});
  }, [open]);

  const isStable = STABLE_SYMBOLS.has(selectedToken);
  const { quote: liveQuote, loading: quoteLoading } = useLiveSwapQuote(selectedToken, amount, selectedChain.name, selectedChain.id > 0 ? selectedChain.id : 0);

  const FEE_PCT    = 0.05;
  const amountNum  = parseFloat(amount) || 0;
  const fee        = isStable ? amountNum * FEE_PCT : 0;
  // Stables: classic fee math. Swaps: live quote USDC output. 0x quote already
  // factors spread + slippage — no additional Nuro fee on top.
  const youReceive = isStable ? (amountNum - fee) : (liveQuote?.buyAmountUsd ?? 0);

  // Token catalog pulled together for the category picker dropdown
  const memecoinEnabled = supportedTokens?.meta?.memecoinEnabled ?? false;
  const liveMemes: TokenOption[] = (supportedTokens?.memecoins ?? []).map(m => ({
    symbol: m.symbol,
    name: m.name,
    icon: `https://assets.coingecko.com/coins/images/${m.symbol.toLowerCase()}/small/placeholder.png`,
    category: "memecoins" as const,
    autoChainName: m.chainName,
  }));
  const allTokensByCategory: Record<TokenCategory, TokenOption[]> = {
    stables:   STABLE_TOKENS,
    natives:   NATIVE_TOKENS_CATALOG,
    memecoins: liveMemes,
  };
  const currentCategoryTokens = allTokensByCategory[pickerCategory] || [];
  const selectedTokenMeta =
    STABLE_TOKENS.find(t => t.symbol === selectedToken)
    || NATIVE_TOKENS_CATALOG.find(t => t.symbol === selectedToken)
    || liveMemes.find(t => t.symbol === selectedToken)
    || STABLE_TOKENS[0];

  const currentAddress = addresses?.[selectedChain.depositKey] ?? null;

  // Phase 3b — Solana sign-and-swap executor. Active when chain=Solana
  // AND the user picked a non-stable token. Stables on Solana still use
  // the QR/CCTP direct-deposit path (no swap needed).
  const isSolanaSwap = selectedChain.depositKey === "solana" && !isStable;
  const swapExec = useJupiterSwapExecutor();

  // Privy-driven wallet connect. When the user lacks a Solana wallet (no
  // signer, no pubkey), clicking the CTA needs to trigger Privy's connect
  // flow — embedded-wallet create for users-without-wallets, external
  // wallet link (Phantom etc.) for users-with-wallets. Pattern mirrors
  // features/dashboard/wallet-1/index.tsx handleConnectWallet.
  const privy = usePrivy();
  const { connectWallet } = useConnectWallet();
  const { createWallet } = useCreateWallet();
  const handleConnectSolana = useCallback(async () => {
    try {
      if (!privy.ready) return;
      if (!privy.authenticated) {
        privy.login({ loginMethods: ["wallet"] } as any);
        return;
      }
      // Try to create an embedded Solana wallet first (covers users who
      // signed in with Google before our embeddedWallets.solana.
      // createOnLogin config landed). If that throws (already has one),
      // fall back to the linkWallet flow.
      try {
        // @ts-expect-error — createWallet Solana variant is available in
        // Privy v3 Solana-extras but the shared type def sometimes lags.
        await createWallet({ chainType: "solana" });
      } catch {
        connectWallet({ description: "Connect a Solana wallet for the swap" });
      }
    } catch (e) {
      console.warn("[ReloadModal] connect Solana wallet failed:", e);
    }
  }, [privy, connectWallet, createWallet]);
  // Pass our Solana deposit address as the destinationTokenAccount so the
  // swap output (USDC) lands in the CCTP-monitored reserve in the same
  // signature. NOTE: `currentAddress` for solana is the OWNER pubkey of
  // the deposit account, not the USDC ATA. Phase 3c will derive the ATA
  // server-side and surface it; for Phase 3b we leave it undefined so
  // the swap output stays in the user's own ATA (still spendable; just
  // not auto-bridged yet).
  const onSolanaSignAndSwap = async () => {
    await swapExec.execute({
      sellToken: selectedToken,
      amount,
      // destinationTokenAccount: <Phase 3c — Nuro deposit USDC ATA>
    });
  };
  // Reset executor state whenever the modal opens or the user changes
  // token/amount/chain — stale "confirmed" pills shouldn't follow the
  // user across separate swap attempts.
  useEffect(() => {
    swapExec.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedToken, selectedChain.id, amount]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("form");
        setAmount("");
        setSearch("");
        setError(null);
      }, 300);
      return;
    }
    // Fetch addresses on open
    setLoading(true);
    setError(null);
    getToken().then(token => {
      if (!token) { setError("Not signed in"); setLoading(false); return; }
      fetch(`/api/deposit-addresses`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(data => { if (data.error) setError(data.error); else setAddresses(data); })
        .catch(() => setError("Failed to load deposit addresses"))
        .finally(() => setLoading(false));
    });
  }, [open]);

  const handleCopy = () => {
    if (!currentAddress) return;
    copyToClipboard(currentAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Session 23 — dynamic chain filter based on selected token. Stables
  // work on every chain (bridge path), but natives/bluechips/memecoins
  // only work where we have an allowlist entry. Without this filter, a
  // user could pick PEPE + Avalanche and get a silent "Quote unavailable".
  const allowedChainsForToken: Set<string> | null = (() => {
    if (STABLE_SYMBOLS.has(selectedToken)) return null; // null = all chains OK
    const allowed = new Set<string>();
    const cgMap: Record<string, string> = {
      // chain-name mismatch bridge (backend uses "WorldChain" in NATIVE_TOKENS,
      // but our local CHAINS uses "World Chain"). Map backend → local.
      "World Chain": "World Chain",
      "WorldChain": "World Chain",
    };
    const normalize = (n: string) => cgMap[n] || n;
    (supportedTokens?.natives ?? []).forEach(t => { if (t.symbol === selectedToken) allowed.add(normalize(t.chainName)); });
    (supportedTokens?.bluechips ?? []).forEach(t => { if (t.symbol === selectedToken) allowed.add(normalize(t.chainName)); });
    (supportedTokens?.memecoins ?? []).forEach(t => { if (t.symbol === selectedToken) allowed.add(normalize(t.chainName)); });
    return allowed;
  })();

  const filteredChains = CHAINS.filter(c => {
    // Search filter
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.symbol.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    // Token-compatibility filter — stables accept any chain, otherwise
    // restrict to the set derived from /supported-tokens
    if (allowedChainsForToken === null) return true;
    return allowedChainsForToken.has(c.name);
  });

  // Keep selected chain valid: if user switches to a token that doesn't
  // support the current chain, auto-switch to the first allowed one.
  useEffect(() => {
    if (allowedChainsForToken === null) return; // stables — any chain is fine
    if (allowedChainsForToken.has(selectedChain.name)) return; // current is OK
    const firstAllowed = CHAINS.find(c => allowedChainsForToken.has(c.name));
    if (firstAllowed) setSelectedChain(firstAllowed);
  }, [selectedToken, supportedTokens]); // eslint-disable-line react-hooks/exhaustive-deps

  const canReload = amountNum > 0 && currentAddress && !loading;

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={step === "form" ? onClose : undefined}
          />

          {/* Sheet */}
          <motion.div
            initial={{ opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 48 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="fixed z-50 inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center p-0 sm:p-4"
          >
            <div className="w-full sm:max-w-[400px] rounded-t-[28px] sm:rounded-[24px] bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] shadow-2xl overflow-hidden">

              {/* ─── FORM STEP ─────────────────────────────────────── */}
              {step === "form" && (
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-1">
                    <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-[var(--color-bg-glass-strong)] transition-colors">
                      <ArrowLeft className="h-4 w-4 text-[var(--color-text-muted)]" />
                    </button>
                    <p className="text-[16px] font-semibold text-[var(--color-text-primary)]">Reload Your Card</p>
                    <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-[var(--color-bg-glass-strong)] transition-colors">
                      <X className="h-4 w-4 text-[var(--color-text-muted)]" />
                    </button>
                  </div>

                  {/* Trust badge */}
                  <p className="text-center text-[11px] text-[var(--color-text-muted)] mb-5">
                    Smart Contract:{" "}
                    <span className="font-bold tracking-widest text-white text-[10px]">VERIFIED</span>{" "}
                    <span className="text-[10px] text-[var(--color-text-muted)]">by</span>{" "}
                    <span className="font-black text-[#1A1F71] bg-white px-1.5 py-0.5 rounded text-[9px] tracking-wider ml-0.5">VISA</span>
                  </p>

                  {loading && (
                    <div className="flex items-center justify-center py-10">
                      <div className="h-6 w-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {error && <p className="text-[13px] text-red-400 text-center py-6">{error}</p>}

                  {!loading && !error && (
                    <>
                      {/* KYC hint — surfaces when depositRoutingActive=false
                          (user has no KYC). Renders nothing when KYC is
                          approved/active so happy-path users aren't nagged. */}
                      <div className="mb-4">
                        <KycReloadHint />
                      </div>

                      {/* Pay With — 3-category token picker */}
                      <p className="text-[12px] text-[var(--color-text-muted)] mb-2 font-medium">Pay With</p>
                      <div className="flex gap-2 mb-4">
                        {/* Token picker pill — opens category dropdown */}
                        <div className="relative">
                          <button
                            onClick={() => setShowTokenPicker(p => !p)}
                            className="flex items-center gap-2 bg-[var(--color-bg-glass-strong)] border border-[var(--color-border-primary)] rounded-[12px] px-3 py-2.5 hover:border-[var(--color-primary)]/60 transition-colors"
                          >
                            <img
                              src={selectedTokenMeta.icon}
                              className="h-5 w-5 rounded-full"
                              alt={selectedToken}
                              onError={e => (e.currentTarget.style.display = "none")}
                            />
                            <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">{selectedToken}</span>
                            <ChevronDown className="h-3 w-3 text-[var(--color-text-muted)]" />
                          </button>
                          {showTokenPicker && (
                            <div className="absolute top-full left-0 mt-1 z-20 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-[14px] overflow-hidden shadow-xl min-w-[260px]">
                              {/* Category tabs */}
                              <div className="flex border-b border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]/50">
                                {(["stables", "natives", "memecoins"] as TokenCategory[]).map(cat => (
                                  <button
                                    key={cat}
                                    onClick={() => setPickerCategory(cat)}
                                    className={`flex-1 px-2 py-2 text-[11px] font-semibold transition-colors capitalize ${pickerCategory === cat ? "text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
                                  >
                                    {cat}
                                  </button>
                                ))}
                              </div>
                              {/* Token list for current category */}
                              <div className="max-h-[240px] overflow-y-auto">
                                {pickerCategory === "memecoins" && !memecoinEnabled ? (
                                  <p className="text-[11px] text-[var(--color-text-muted)] p-3 text-center leading-relaxed">
                                    Coming soon — curated allowlist. SHIB / PEPE / PENGU / ANDY under audit.
                                  </p>
                                ) : currentCategoryTokens.length === 0 ? (
                                  <p className="text-[11px] text-[var(--color-text-muted)] p-3 text-center">
                                    No tokens in this category yet.
                                  </p>
                                ) : (
                                  currentCategoryTokens.map(token => (
                                    <button
                                      key={`${token.category}-${token.symbol}`}
                                      onClick={() => {
                                        setSelectedToken(token.symbol);
                                        // Auto-switch chain for tokens locked to one chain
                                        if (token.autoChainName) {
                                          const next = CHAINS.find(c => c.name === token.autoChainName);
                                          if (next) setSelectedChain(next);
                                        }
                                        setShowTokenPicker(false);
                                      }}
                                      className={`flex items-center gap-3 w-full px-3 py-2.5 hover:bg-[var(--color-bg-glass)] transition-colors ${selectedToken === token.symbol ? "text-[var(--color-primary)]" : "text-[var(--color-text-primary)]"}`}
                                    >
                                      <img src={token.icon} className="h-5 w-5 rounded-full shrink-0" alt={token.symbol} onError={e => (e.currentTarget.style.display = "none")} />
                                      <div className="flex-1 text-left">
                                        <div className="text-[13px] font-semibold">{token.symbol}</div>
                                        <div className="text-[10px] text-[var(--color-text-muted)]">{token.name}{token.autoChainName ? ` · ${token.autoChainName}` : ""}</div>
                                      </div>
                                      {!STABLE_SYMBOLS.has(token.symbol) && (
                                        <span className="text-[9px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">swap</span>
                                      )}
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Chain picker pill */}
                        <button
                          onClick={() => setStep("chains")}
                          className="flex-1 flex items-center justify-between gap-2 bg-[var(--color-bg-glass-strong)] border border-[var(--color-border-primary)] rounded-[12px] px-3 py-2.5 hover:border-[var(--color-primary)]/60 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <ChainIcon chain={selectedChain} size="h-5 w-5" />
                            <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">{selectedChain.name}</span>
                          </div>
                          <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                        </button>
                      </div>

                      {/* Amount input */}
                      <div className="rounded-[14px] border border-[var(--color-border-primary)] bg-[var(--color-bg-glass-strong)] px-4 py-3 mb-4 focus-within:border-[var(--color-primary)]/60 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] text-[var(--color-text-muted)] shrink-0">Amount:</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            placeholder="0"
                            className="flex-1 bg-transparent text-right text-[20px] font-bold text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]/40"
                          />
                          <span className="text-[14px] font-semibold text-[var(--color-text-muted)] shrink-0">{selectedToken}</span>
                        </div>
                      </div>

                      {/* Fee / Receive — stables show Nuro fee; swaps show live 0x quote */}
                      <div className="flex items-start justify-between mb-6 px-0.5">
                        <div className="flex-1">
                          <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">You'll Receive:</p>
                          {isStable ? (
                            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Fee: {formatUSD(fee)}</p>
                          ) : quoteLoading ? (
                            <p className="text-[11px] text-[var(--color-text-muted)]/70 mt-0.5">Fetching quote…</p>
                          ) : liveQuote ? (
                            <>
                              <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                                Slippage worst-case: {formatUSD(liveQuote.minBuyAmountUsd)} ({(liveQuote.slippageBps / 100).toFixed(1)}%)
                              </p>
                              {liveQuote.source && (
                                <p className="text-[10px] text-[var(--color-text-muted)]/70 mt-0.5 flex items-center gap-1">
                                  <span>
                                    Routed via{" "}
                                    <span className="font-semibold text-[var(--color-text-muted)]">
                                      {liveQuote.source === "jupiter"
                                        ? "Jupiter"
                                        : liveQuote.source === "zerox"
                                        ? "0x"
                                        : liveQuote.source}
                                    </span>
                                    {liveQuote.routeLabels && liveQuote.routeLabels.length > 0 && (
                                      <span className="text-[var(--color-text-muted)]/60">
                                        {" "}·{" "}{liveQuote.routeLabels.slice(0, 3).join(" · ")}
                                      </span>
                                    )}
                                  </span>
                                </p>
                              )}
                              {!liveQuote.meetsThreshold && (
                                <p className="text-[10px] text-[#f5a623] font-semibold mt-0.5">
                                  ⚠ Below ${liveQuote.minSwapUsd} min — add more {selectedToken}
                                </p>
                              )}
                            </>
                          ) : amountNum > 0 ? (
                            <p className="text-[10px] text-[var(--color-text-muted)]/70 mt-0.5">
                              {selectedChain.depositKey === "solana"
                                ? "No Jupiter route — try a smaller amount or different token"
                                : "Quote unavailable — try a different chain"}
                            </p>
                          ) : null}
                        </div>
                        <p className="text-[17px] font-bold text-[var(--color-text-primary)] whitespace-nowrap ml-3">
                          {isStable ? formatUSD(youReceive) : (liveQuote ? `≈ ${formatUSD(youReceive)}` : formatUSD(0))} <span className="text-[12px] text-[var(--color-text-muted)]">USD</span>
                        </p>
                      </div>

                      {/* Phase 3b — Solana inline progress pill. Surfaces
                          executor state without swapping screens; gives
                          users a tight feedback loop on a flow that has
                          5 sub-steps. */}
                      {isSolanaSwap && swapExec.status !== "idle" && (
                        <div className={`mb-3 rounded-[10px] px-3 py-2 text-[11.5px] flex items-center gap-2 ${
                          swapExec.status === "error"
                            ? "border border-red-500/30 bg-red-500/[0.05] text-red-400"
                            : swapExec.status === "confirmed"
                            ? "border border-emerald-500/30 bg-emerald-500/[0.05] text-emerald-400"
                            : "border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/[0.05] text-[var(--color-text-primary)]"
                        }`}>
                          {swapExec.status === "fetching-quote" && "Fetching firm Jupiter quote…"}
                          {swapExec.status === "awaiting-signature" && "Approve the swap in your wallet…"}
                          {swapExec.status === "broadcasting" && "Broadcasting swap to Solana…"}
                          {swapExec.status === "confirming" && (
                            <>
                              Confirming on-chain…
                              {swapExec.txHash && (
                                <a
                                  href={`https://solscan.io/tx/${swapExec.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline ml-auto opacity-70 hover:opacity-100"
                                >
                                  View tx
                                </a>
                              )}
                            </>
                          )}
                          {swapExec.status === "confirmed" && (
                            <>
                              ✓ Swap confirmed —
                              {swapExec.depositRoutingActive
                                ? " USDC routed to card, bridging now"
                                : " USDC in your Solana wallet"}
                              {swapExec.txHash && (
                                <a
                                  href={`https://solscan.io/tx/${swapExec.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline ml-auto"
                                >
                                  Solscan
                                </a>
                              )}
                            </>
                          )}
                          {swapExec.status === "error" && (
                            <>
                              {swapExec.error || "Swap failed"}
                              <button
                                type="button"
                                onClick={() => swapExec.reset()}
                                className="ml-auto opacity-80 hover:opacity-100 underline"
                              >
                                Retry
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {/* CTA — 3-way branch: Solana swap → executor;
                          Solana without wallet → connect-wallet flow;
                          everything else → existing QR/deposit flow. */}
                      <button
                        onClick={() => {
                          if (isSolanaSwap) {
                            if (!swapExec.canExecute) {
                              // User lacks a connected Solana wallet — open
                              // Privy connect/create flow instead of being
                              // a dead button (S30 UX bug Richard flagged).
                              void handleConnectSolana();
                              return;
                            }
                            if (amountNum > 0) void onSolanaSignAndSwap();
                          } else if (canReload) {
                            setStep("qr");
                          }
                        }}
                        disabled={
                          isSolanaSwap
                            ? // In the Solana branch: disable only during
                              // an in-flight swap. "No wallet" + "no amount"
                              // states are now clickable-but-guided.
                              ["fetching-quote", "awaiting-signature", "broadcasting", "confirming"].includes(swapExec.status) ||
                              (swapExec.canExecute && amountNum <= 0)
                            : !canReload
                        }
                        className="w-full py-3.5 rounded-[14px] bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-[15px] font-semibold text-white shadow-lg"
                      >
                        {isSolanaSwap
                          ? swapExec.status === "confirmed"
                            ? "Reload Another"
                            : ["fetching-quote", "awaiting-signature", "broadcasting", "confirming"].includes(swapExec.status)
                            ? "Working…"
                            : !swapExec.canExecute
                            ? "Connect Solana wallet"
                            : amountNum <= 0
                            ? "Enter amount"
                            : `Sign & swap ${selectedToken}`
                          : "Reload Card"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* ─── CHAIN PICKER ──────────────────────────────────── */}
              {step === "chains" && (
                <div className="flex flex-col" style={{ maxHeight: "75vh" }}>
                  <div className="p-6 pb-3">
                    <div className="flex items-center gap-3 mb-4">
                      <button onClick={() => { setStep("form"); setSearch(""); }} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-[var(--color-bg-glass-strong)] transition-colors">
                        <ArrowLeft className="h-4 w-4 text-[var(--color-text-muted)]" />
                      </button>
                      <p className="text-[15px] font-semibold text-[var(--color-text-primary)]">Select Network</p>
                    </div>
                    <input
                      type="text"
                      placeholder={allowedChainsForToken === null
                        ? "Search 23 chains…"
                        : `${allowedChainsForToken.size} chain${allowedChainsForToken.size === 1 ? '' : 's'} support ${selectedToken} — search…`}
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-[10px] bg-[var(--color-bg-glass-strong)] border border-[var(--color-border-primary)] text-[13px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)]/60 transition-colors"
                    />
                    {allowedChainsForToken !== null && allowedChainsForToken.size < CHAINS.length && (
                      <p className="text-[10.5px] text-[var(--color-text-muted)] mt-2 leading-relaxed">
                        Showing only chains where <strong className="text-[var(--color-text-primary)]">{selectedToken}</strong> is available on our allowlist.
                      </p>
                    )}
                  </div>
                  <div className="overflow-y-auto px-6 pb-6 grid grid-cols-3 gap-2">
                    {filteredChains.map(chain => {
                      const isSelected = selectedChain.id === chain.id;
                      const unavailable = chain.depositKey === "solana" && !addresses?.solana;
                      return (
                        <button
                          key={chain.id}
                          onClick={() => {
                            if (!unavailable) {
                              setSelectedChain(chain);
                              setStep("form");
                              setSearch("");
                            }
                          }}
                          disabled={unavailable}
                          className={`flex flex-col items-center gap-2 p-3 rounded-[14px] border transition-all ${
                            isSelected
                              ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 shadow-sm"
                              : unavailable
                              ? "border-[var(--color-border-primary)] opacity-35 cursor-not-allowed"
                              : "border-[var(--color-border-primary)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-bg-glass-strong)]"
                          }`}
                        >
                          <ChainIcon chain={chain} size="h-9 w-9" />
                          <span className="text-[10px] text-[var(--color-text-primary)] text-center leading-tight font-medium">{chain.name}</span>
                        </button>
                      );
                    })}
                    {filteredChains.length === 0 && (
                      <p className="col-span-3 text-center text-[13px] text-[var(--color-text-muted)] py-6">No chains found</p>
                    )}
                  </div>
                </div>
              )}

              {/* ─── QR / SEND FUNDS ───────────────────────────────── */}
              {step === "qr" && (
                <div className="p-6">
                  <div className="flex items-center justify-between mb-5">
                    <button onClick={() => setStep("form")} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-[var(--color-bg-glass-strong)] transition-colors">
                      <ArrowLeft className="h-4 w-4 text-[var(--color-text-muted)]" />
                    </button>
                    <p className="text-[16px] font-semibold text-[var(--color-text-primary)]">Send Funds</p>
                    <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-[var(--color-bg-glass-strong)] transition-colors">
                      <X className="h-4 w-4 text-[var(--color-text-muted)]" />
                    </button>
                  </div>

                  {/* QR Code */}
                  <div className="flex justify-center mb-4">
                    <div className="bg-white p-3 rounded-[20px] shadow-xl">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(currentAddress ?? "")}&bgcolor=ffffff&color=000000&margin=2`}
                        alt="Deposit address QR"
                        className="h-48 w-48 rounded-[4px]"
                      />
                    </div>
                  </div>

                  {/* Send details */}
                  <div className="text-center mb-4">
                    <p className="text-[13px] text-[var(--color-text-muted)]">Send:</p>
                    <p className="text-[20px] font-bold text-[#00C896]">{amount} {selectedToken}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                      Send funds on the <span className="text-[var(--color-text-primary)] font-medium">{selectedChain.name}</span> Network Only
                    </p>
                  </div>

                  {/* Address */}
                  <div className="rounded-[14px] border border-[var(--color-border-primary)] bg-[var(--color-bg-glass-strong)] p-3 mb-5">
                    <p className="text-[11px] text-[var(--color-text-muted)] mb-1.5">Your Deposit Address</p>
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-[11px] font-mono text-[var(--color-text-primary)] break-all leading-relaxed">
                        {currentAddress}
                      </p>
                      <button
                        onClick={handleCopy}
                        className="flex-shrink-0 p-1.5 rounded-[8px] hover:bg-[var(--color-bg-glass)] transition-colors"
                      >
                        {copied
                          ? <span className="flex items-center gap-1 text-[#00C896] text-[11px] font-semibold"><CheckCheck className="h-3.5 w-3.5" />Copied!</span>
                          : <Copy className="h-4 w-4 text-[var(--color-text-muted)]" />
                        }
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => setStep("processing")}
                    className="w-full py-3.5 rounded-[14px] bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 transition-all text-[15px] font-semibold text-white shadow-lg"
                  >
                    I've Sent The Funds
                  </button>
                </div>
              )}

              {/* ─── PROCESSING ────────────────────────────────────── */}
              {step === "processing" && (
                <div className="p-8 pt-10 pb-10 flex flex-col items-center text-center">
                  <div className="relative mb-7">
                    <div className="h-24 w-24 rounded-full border-4 border-[var(--color-primary)]/20 border-t-[var(--color-primary)] animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <img
                        src={TOKENS.find(t => t.id === selectedToken)?.icon}
                        className="h-11 w-11 rounded-full"
                        alt={selectedToken}
                        onError={e => (e.currentTarget.style.display = "none")}
                      />
                    </div>
                  </div>
                  <p className="text-[19px] font-bold text-[var(--color-text-primary)] mb-2">Reload In Progress</p>
                  <p className="text-[13px] text-[var(--color-text-muted)] max-w-[260px] leading-relaxed mb-8">
                    You can close this window. We're verifying your funds. This usually takes under a minute.
                  </p>
                  <button
                    onClick={onClose}
                    className="w-full py-3.5 rounded-[14px] bg-[var(--color-bg-glass-strong)] hover:bg-[var(--color-bg-glass)] transition-all text-[15px] font-semibold text-[var(--color-text-primary)]"
                  >
                    Close
                  </button>
                </div>
              )}

              {/* ─── SUCCESS ───────────────────────────────────────── */}
              {step === "success" && (
                <div className="p-8 pt-10 pb-10 flex flex-col items-center text-center">
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="mb-7 h-24 w-24 rounded-full bg-[#00C896]/15 flex items-center justify-center"
                  >
                    <svg viewBox="0 0 24 24" className="h-12 w-12 text-[#00C896]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </motion.div>
                  <p className="text-[19px] font-bold text-[var(--color-text-primary)] mb-2">Reload Successful</p>
                  <p className="text-[13px] text-[var(--color-text-muted)] max-w-[260px] leading-relaxed mb-8">
                    Great Job! Your card is topped up and you can spend your funds immediately.
                  </p>
                  <button
                    onClick={onClose}
                    className="w-full py-3.5 rounded-[14px] bg-[#00C896] hover:bg-[#00b386] transition-all text-[15px] font-semibold text-white shadow-lg"
                  >
                    Close
                  </button>
                </div>
              )}

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  , document.body);
}