"use client";

import React from "react";
import {
  Wallet,
  Copy,
  QrCode,
  ExternalLink,
  Check,
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  X,
} from "lucide-react";
import { SettingsSection } from "@/components/settings-section";
import { motion, AnimatePresence } from "framer-motion";
import { useSelector } from "react-redux";
import { RootState } from "@/store/store";
import { WalletQRModal } from "@/components/WalletQRModal";
import { getBlockExplorerAddressUrl } from "@/lib/blockExplorer";
import { useAppSession } from "@/hooks/useAppSession";
import { usePrivyWalletAddress } from "@/hooks/usePrivyWalletAddress";
import { useConnectWallet, usePrivy } from "@privy-io/react-auth";
import { usePrivyRuntime } from "@/providers/PrivyRuntimeContext";
import {
  Dialog as AppDialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FORM_MODAL_INNER_CLASS,
  FORM_MODAL_SHELL_CLASS,
  FORM_MODAL_SUBMIT_BUTTON_CLASS,
  FULL_MODAL_OVERLAY_CLASS,
} from "@/components/ui/modalPresets";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  WALLET_GLASS_MENU_CONTENT,
  WALLET_GLASS_MENU_ITEM_ROW_BASE,
  WALLET_GLASS_MENU_ITEM_ROW_DANGER,
  WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL,
  walletGlassMenuItemRowSpacing,
} from "@/lib/walletGlassMenu";
import {
  SETTINGS_INPUT_CLASS,
  SETTINGS_LABEL_CLASS,
  SETTINGS_ROW_STACK_CLASS,
  SETTINGS_SECTION_ICON_CLASS,
} from "@/features/dashboard/settings/settingsStyles";
import { useDevPreviewMode } from "@/providers/DevPreviewModeProvider";

const WALLET_ACTION_BUTTON_CLASS =
  "flex items-center justify-center w-9 h-9 rounded-[var(--radius-sm)] border-0 bg-white/5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/10 transition-all";

/** Square 1×1 hit target for success/check controls (matches Cards rename save). */
const WALLET_CHECK_HIT_CLASS =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-success)] transition-colors hover:bg-white/[0.04]";

const WALLET_LIST_ICON_CLASS =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-white/[0.04] text-white [&_svg]:h-5 [&_svg]:w-5";

const WALLET_DASHED_CTA_CLASS =
  "flex w-full items-center justify-center gap-2 rounded-[20px] border border-dashed border-white/10 p-4 text-[var(--color-text-muted)] transition-[color,background-color,border-color] duration-300 hover:border-[var(--color-primary)]/50 hover:bg-white/5 hover:text-[var(--color-text-primary)]";

function WalletDashedCtaButton({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button type="button" onClick={onClick} className={cn(WALLET_DASHED_CTA_CLASS, className)}>
      <Plus className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
      <span className="text-[small] font-medium tracking-tight">{label}</span>
    </button>
  );
}

/** Created at account setup — not removable from settings. */
const ACCOUNT_RELOAD_ADDRESS = "0x71C7656EC7ab88b098defB751B7401B5f6d8976F";
const ACCOUNT_WITHDRAW_ADDRESS = "0x742d35cc6634c0532925a3b844bc454e4438f44e";

const ACCOUNT_ADDRESSES = [
  { id: "reload", label: "Reload address", address: ACCOUNT_RELOAD_ADDRESS },
  { id: "withdraw", label: "Withdraw address", address: ACCOUNT_WITHDRAW_ADDRESS },
] as const;

interface WalletData {
  id: string;
  name: string;
  address: string;
  network: string;
  symbol: string;
  type: "ethereum" | "solana" | "bitcoin";
}

/** Dev preview ON — matches Nuro Front End 5.4.26 header / Privy design mock. */
const PREVIEW_CONNECTED_ADDRESS = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";

/** Dev preview ON — matches 5.4.26 My Wallet address book demo rows. */
const PREVIEW_ADDRESS_BOOK_WALLETS: WalletData[] = [
  {
    id: "preview-chris-brignola",
    name: "Chris Brignola",
    address: "0x749edf7a8b9c0d1e2f3a4b5c6d7e8f90454b56",
    network: "Ethereum",
    symbol: "ETH",
    type: "ethereum",
  },
  {
    id: "preview-treasury",
    name: "Treasury",
    address: "0x91a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5",
    network: "Ethereum",
    symbol: "ETH",
    type: "ethereum",
  },
  {
    id: "preview-ops",
    name: "Ops",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    network: "Ethereum",
    symbol: "ETH",
    type: "ethereum",
  },
];

const AddWalletModal = ({
  open,
  onOpenChange,
  onAdd
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (data: { name: string; address: string }) => void;
}) => {
  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setName("");
      setAddress("");
    }
  }, [open]);

  const handleClose = () => onOpenChange(false);
  const canSubmit = Boolean(name.trim() && address.trim());

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent
        hideClose
        hideOverlay
        className={FORM_MODAL_SHELL_CLASS}
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.02)",
          borderColor: "rgba(255, 255, 255, 0.03)",
          borderWidth: "1px",
          borderStyle: "solid",
        }}
      >
        <div
          className={FORM_MODAL_INNER_CLASS}
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            borderColor: "rgba(255, 255, 255, 0.03)",
            borderWidth: "1px",
            borderStyle: "solid",
          }}
        >
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

          <div className="flex h-full min-h-0 flex-col px-6 pb-6 pt-6 sm:px-8 sm:pb-6 sm:pt-7">
            <div className="flex shrink-0 items-center gap-3 pr-8">
              <div className={SETTINGS_SECTION_ICON_CLASS}>
                <Wallet />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle asChild>
                  <h1 className="text-[16px] font-medium leading-none text-[var(--color-text-primary)]">
                    Add New Address
                  </h1>
                </DialogTitle>
                <DialogDescription asChild>
                  <p className="mt-1.5 text-[13px] leading-snug text-[var(--color-text-muted)]">
                    Save a wallet address to your address book.
                  </p>
                </DialogDescription>
              </div>
            </div>

            <form
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
                if (!canSubmit) return;
                onAdd({ name: name.trim(), address: address.trim() });
                handleClose();
              }}
              className="mt-5 flex min-h-0 flex-1 flex-col"
            >
              <div className="flex flex-col gap-4">
                <p className="hidden">
                  <input type="text" name="prevent_autofill" tabIndex={-1} autoComplete="off" />
                </p>
                <div>
                  <label
                    htmlFor="add-wallet-name"
                    className={cn(SETTINGS_LABEL_CLASS, "text-[var(--color-text-primary)]")}
                  >
                    Wallet Name
                  </label>
                  <input
                    id="add-wallet-name"
                    name="wallet-display-label"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. My Ledger"
                    className={SETTINGS_INPUT_CLASS}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-1p-ignore
                    data-lpignore="true"
                    readOnly
                    onFocus={(e) => e.currentTarget.removeAttribute("readOnly")}
                  />
                </div>
                <div>
                  <label
                    htmlFor="add-wallet-address"
                    className={cn(SETTINGS_LABEL_CLASS, "text-[var(--color-text-primary)]")}
                  >
                    Wallet Address
                  </label>
                  <input
                    id="add-wallet-address"
                    name="wallet-chain-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="0x... or Solana address"
                    className={cn(SETTINGS_INPUT_CLASS, "font-mono")}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-1p-ignore
                    data-lpignore="true"
                    readOnly
                    onFocus={(e) => e.currentTarget.removeAttribute("readOnly")}
                  />
                </div>
              </div>

              <footer className="mt-auto flex shrink-0 items-center justify-end pt-5">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={FORM_MODAL_SUBMIT_BUTTON_CLASS}
                >
                  Add Wallet
                </button>
              </footer>
            </form>
          </div>
        </div>
      </DialogContent>
    </AppDialog>
  );
};

const DELETE_ADDRESS_MODAL_SHELL_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.02)",
  borderColor: "rgba(255, 255, 255, 0.03)",
  borderWidth: "1px",
  borderStyle: "solid",
} as const;

const DELETE_ADDRESS_MODAL_INNER_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.04)",
  borderColor: "rgba(255, 255, 255, 0.03)",
  borderWidth: "1px",
  borderStyle: "solid",
} as const;

const ConfirmDeleteModal = ({
  open,
  onOpenChange,
  onConfirm,
  walletName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  walletName: string;
}) => (
  <AppDialog
    open={open}
    onOpenChange={(next) => {
      if (!next) onOpenChange(false);
    }}
  >
    <DialogContent
      hideClose
      overlayClassName={FULL_MODAL_OVERLAY_CLASS}
      className={cn(FORM_MODAL_SHELL_CLASS, "!z-[120]", "!max-w-[368px]")}
      style={DELETE_ADDRESS_MODAL_SHELL_STYLE}
    >
      <div
        className={cn(FORM_MODAL_INNER_CLASS, "!h-auto !min-h-0 !max-h-none")}
        style={DELETE_ADDRESS_MODAL_INNER_STYLE}
      >
        <div className="flex flex-col items-center p-8 text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--color-error)]/15 bg-[var(--color-error)]/10 text-[var(--color-error)]">
            <Trash2 className="h-7 w-7" strokeWidth={1.5} />
          </div>
          <DialogTitle className="mb-2 text-[20px] font-semibold tracking-tight text-[var(--color-text-primary)]">
            Delete Address?
          </DialogTitle>
          <DialogDescription className="mb-8 px-2 text-[14px] leading-relaxed text-[var(--color-text-muted)]">
            Are you sure you want to remove{" "}
            <span className="font-medium text-[var(--color-text-primary)]">{walletName}</span> from your
            address book?
          </DialogDescription>
          <div className="flex w-full items-center gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-[12px] border border-white/10 bg-white/5 px-4 py-2.5 text-[14px] font-medium text-[var(--color-text-muted)] transition-all hover:bg-white/10 hover:text-[var(--color-text-primary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex-1 rounded-[12px] border border-[var(--color-error)]/20 bg-[var(--color-error)]/10 px-4 py-2.5 text-[14px] font-semibold text-[var(--color-error)] transition-all hover:bg-[var(--color-error)]/20"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </DialogContent>
  </AppDialog>
);

const AccountAddressRow = ({
  label,
  address,
  onShowQR,
}: {
  label: string;
  address: string;
  onShowQR: () => void;
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const explorerUrl = getBlockExplorerAddressUrl("ethereum", undefined, address);

  return (
    <div className="group relative flex items-center justify-between rounded-[20px] bg-white/[0.04] p-4 transition-all duration-300 hover:bg-white/5">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className={WALLET_LIST_ICON_CLASS}>
          <Wallet />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-[14px] font-medium text-[var(--color-text-primary)]">
            {label}
          </h4>
          <p className="mt-0.5 truncate whitespace-nowrap font-mono text-[12px] uppercase text-[var(--color-text-muted)]">
            <span className="mr-1 font-bold text-[var(--color-text-primary)]">ETH:</span>
            {address}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 opacity-0 transition-all duration-200 group-hover:opacity-100">
        <button
          type="button"
          onClick={handleCopy}
          className={WALLET_ACTION_BUTTON_CLASS}
          title="Copy Address"
        >
          <AnimatePresence mode="wait">
            {copied ? (
              <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                <Check className="h-4 w-4 text-[var(--color-success)]" strokeWidth={2.5} />
              </motion.div>
            ) : (
              <motion.div key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                <Copy className="w-4 h-4" />
              </motion.div>
            )}
          </AnimatePresence>
        </button>
        <button type="button" onClick={onShowQR} className={WALLET_ACTION_BUTTON_CLASS} title="Show QR Code">
          <QrCode className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (explorerUrl) window.open(explorerUrl, "_blank");
          }}
          className={WALLET_ACTION_BUTTON_CLASS}
          title="View on Explorer"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const WalletItem = ({
  wallet,
  onShowQR,
  onDelete,
  onRename,
  isConnected = false,
}: {
  wallet: WalletData;
  onShowQR: (wallet: WalletData) => void;
  onDelete: (wallet: WalletData) => void;
  onRename: (wallet: WalletData, newName: string) => void;
  isConnected?: boolean;
}) => {
  const [copied, setCopied] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [name, setName] = React.useState(wallet.name);

  const handleCopy = () => {
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRename = (e: React.FormEvent) => {
    e.preventDefault();
    onRename(wallet, name);
    setIsEditing(false);
  };

  const overflowMenuItems = React.useMemo(() => {
    const items: {
      id: string;
      label: string;
      Icon: typeof Pencil;
      variant: "neutral" | "danger";
      action: () => void;
    }[] = [
      {
        id: "rename",
        label: "Rename",
        Icon: Pencil,
        variant: "neutral",
        action: () => setIsEditing(true),
      },
    ];
    if (!isConnected) {
      items.push({
        id: "delete",
        label: "Delete",
        Icon: Trash2,
        variant: "danger",
        action: () => onDelete(wallet),
      });
    }
    return items;
  }, [isConnected, onDelete, wallet]);

  return (
    <div className="group relative flex items-center justify-between p-4 rounded-[20px] bg-white/[0.04] transition-all duration-300 hover:bg-white/5">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className={WALLET_LIST_ICON_CLASS}>
          <Wallet />
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-6 flex items-center">
            {isEditing ? (
              <form onSubmit={handleRename} className="flex items-center gap-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => {
                    onRename(wallet, name);
                    setIsEditing(false);
                  }}
                  className="h-8 w-full max-w-[200px] rounded-[10px] border border-transparent bg-white/[0.04] px-2 text-[14px] font-medium leading-none text-[var(--color-text-primary)] outline-none transition-colors focus:border-white/30 focus:bg-white/[0.08]"
                />
                <button type="submit" className={WALLET_CHECK_HIT_CLASS} aria-label="Save wallet name">
                  <Check className="h-4 w-4" strokeWidth={2} />
                </button>
              </form>
            ) : (
              <h4 className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">
                {name}
              </h4>
            )}
          </div>
          <p className="text-[12px] text-[var(--color-text-muted)] font-mono mt-0.5 whitespace-nowrap uppercase truncate">
            <span className="font-bold text-[var(--color-text-primary)] mr-1">{wallet.symbol}:</span>
            {wallet.address}
          </p>
        </div>
      </div>

      <div
        className={`flex items-center gap-2 transition-all duration-200 ${isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
      >
        <button
          onClick={handleCopy}
          className={WALLET_ACTION_BUTTON_CLASS}
          title="Copy Address"
        >
          <AnimatePresence mode="wait">
            {copied ? (
              <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                <Check className="w-4 h-4 text-[var(--color-success)]" strokeWidth={2.5} />
              </motion.div>
            ) : (
              <motion.div key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                <Copy className="w-4 h-4" />
              </motion.div>
            )}
          </AnimatePresence>
        </button>
        <button
          onClick={() => onShowQR(wallet)}
          className={WALLET_ACTION_BUTTON_CLASS}
          title="Show QR Code"
        >
          <QrCode className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            if (wallet.type === "bitcoin") return;
            const url = getBlockExplorerAddressUrl(wallet.type, undefined, wallet.address);
            if (url) window.open(url, "_blank");
          }}
          className={WALLET_ACTION_BUTTON_CLASS}
          title="View on Explorer"
        >
          <ExternalLink className="w-4 h-4" />
        </button>

        <DropdownMenu onOpenChange={setIsMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className={`${WALLET_ACTION_BUTTON_CLASS} outline-none`}
              title="More Actions"
            >
              <MoreHorizontal className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className={WALLET_GLASS_MENU_CONTENT}>
            {overflowMenuItems.map(({ id, label, Icon, variant, action }, index) => (
              <DropdownMenuItem
                key={id}
                textValue={label}
                className={cn(
                  WALLET_GLASS_MENU_ITEM_ROW_BASE,
                  "!flex min-w-0 items-center gap-2",
                  walletGlassMenuItemRowSpacing(index, overflowMenuItems.length),
                  variant === "danger"
                    ? WALLET_GLASS_MENU_ITEM_ROW_DANGER
                    : WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL
                )}
                onSelect={action}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
                <span className="min-w-0 flex-1 text-left">{label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

const PRIVY_CONNECT_WALLET_LIST = [
  "detected_ethereum_wallets",
  "metamask",
  "coinbase_wallet",
  "wallet_connect",
] as const;

export default function WalletsContent() {
  const { newUserEmpty } = useDevPreviewMode();
  const { privyEnabled } = usePrivyRuntime();
  const { ready, authenticated, login } = usePrivy();
  const { connectWallet } = useConnectWallet();
  const { user } = useSelector((state: RootState) => state.auth);
  const { data: session } = useAppSession();
  const { address, hasWallet, walletType } = usePrivyWalletAddress();
  const [wallets, setWallets] = React.useState<WalletData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [connectedWalletName, setConnectedWalletName] = React.useState("My Wallet");
  const [selectedWallet, setSelectedWallet] = React.useState<WalletData | null>(null);
  const [deletingWallet, setDeletingWallet] = React.useState<WalletData | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);

  const token = (session as any)?.accessToken;

  const connectedWallet = React.useMemo((): WalletData | null => {
    if (newUserEmpty) return null;
    const trimmed = address.trim();
    if (!hasWallet || !trimmed) {
      return {
        id: `connected-${PREVIEW_CONNECTED_ADDRESS.toLowerCase()}`,
        name: connectedWalletName,
        address: PREVIEW_CONNECTED_ADDRESS,
        network: "Ethereum",
        symbol: "ETH",
        type: "ethereum",
      };
    }
    const type: WalletData["type"] = walletType === "solana" ? "solana" : "ethereum";
    return {
      id: `connected-${trimmed.toLowerCase()}`,
      name: connectedWalletName,
      address: trimmed,
      network: type === "solana" ? "Solana" : "Ethereum",
      symbol: type === "solana" ? "SOL" : "ETH",
      type,
    };
  }, [address, connectedWalletName, hasWallet, newUserEmpty, walletType]);

  React.useEffect(() => {
    const trimmed = address.trim();
    if (!trimmed) return;
    try {
      const stored = localStorage
        .getItem(`nuro:wallet-label:${trimmed.toLowerCase()}`)
        ?.trim();
      if (stored) setConnectedWalletName(stored);
    } catch {
 // ignore storage errors
    }
  }, [address]);

  const fetchWallets = React.useCallback(async () => {
    if (newUserEmpty) {
      setWallets([]);
      setLoading(false);
      return;
    }
    if (!token) {
      setWallets(PREVIEW_ADDRESS_BOOK_WALLETS);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/wallets", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setWallets(list.length > 0 ? list : PREVIEW_ADDRESS_BOOK_WALLETS);
      } else {
        setWallets(PREVIEW_ADDRESS_BOOK_WALLETS);
      }
    } catch (err) {
      console.error("Failed to fetch wallets:", err);
      setWallets(PREVIEW_ADDRESS_BOOK_WALLETS);
    } finally {
      setLoading(false);
    }
  }, [newUserEmpty, token]);

  React.useEffect(() => {
    setWallets(newUserEmpty ? [] : PREVIEW_ADDRESS_BOOK_WALLETS);
  }, [newUserEmpty]);

  React.useEffect(() => { fetchWallets(); }, [fetchWallets]);

  const handleAdd = async (data: { name: string; address: string }) => {
    if (!token) return;
    try {
      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const wallet = await res.json();
        setWallets((prev) => [wallet, ...prev]);
      }
    } catch (err) {
      console.error("Failed to add wallet:", err);
    }
  };

  const handleDelete = async () => {
    if (!token || !deletingWallet) return;
    try {
      const res = await fetch(`/api/wallets/${deletingWallet.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setWallets((prev) => prev.filter((w) => w.id !== deletingWallet.id));
      }
    } catch (err) {
      console.error("Failed to delete wallet:", err);
    }
    setDeletingWallet(null);
  };

  const handleRename = async (wallet: WalletData, newName: string) => {
    if (wallet.id.startsWith("connected-")) {
      if (newName === wallet.name) return;
      setConnectedWalletName(newName);
      try {
        localStorage.setItem(
          `nuro:wallet-label:${wallet.address.toLowerCase()}`,
          newName
        );
      } catch {
 // ignore storage errors
      }
      return;
    }
    if (!token || newName === wallet.name) return;
    try {
      const res = await fetch(`/api/wallets/${wallet.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) {
        setWallets((prev) => prev.map((w) => w.id === wallet.id ? { ...w, name: newName } : w));
      }
    } catch (err) {
      console.error("Failed to rename wallet:", err);
    }
  };

  const addressBookWallets = React.useMemo(
    () =>
      wallets.filter(
        (w) =>
          !connectedWallet ||
          w.address.toLowerCase() !== connectedWallet.address.toLowerCase()
      ),
    [connectedWallet, wallets]
  );

  const handleConnectWallet = () => {
    if (!privyEnabled || !ready) return;
    if (!authenticated) {
      void login({
        loginMethods: ["wallet"],
        walletList: [...PRIVY_CONNECT_WALLET_LIST],
      } as Parameters<typeof login>[0] & { walletList?: readonly string[] });
      return;
    }
    connectWallet({
      description: "Connect a wallet to use with your Nuro account.",
      walletList: [...PRIVY_CONNECT_WALLET_LIST],
    });
  };

  const plusButton = (
    <button
      onClick={() => setIsAddModalOpen(true)}
      className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-sm)] border-0 bg-white/5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-all group"
    >
      <Plus className="w-4 h-4" strokeWidth={1.5} />
    </button>
  );

  return (
    <SettingsSection
      title="Wallets"
      description="Connected wallets and address book"
      icon={<Wallet className="h-5 w-5" />}
      actions={plusButton}
    >
      <div className="space-y-8">
        {!newUserEmpty && (
          <div className={SETTINGS_ROW_STACK_CLASS}>
            {ACCOUNT_ADDRESSES.map((entry) => (
              <AccountAddressRow
                key={entry.id}
                label={entry.label}
                address={entry.address}
                onShowQR={() =>
                  setSelectedWallet({
                    id: `account-${entry.id}`,
                    name: entry.label,
                    address: entry.address,
                    network: "Ethereum",
                    symbol: "ETH",
                    type: "ethereum",
                  })
                }
              />
            ))}
          </div>
        )}

        <SettingsSection title="Connected Wallets">
        <div className={SETTINGS_ROW_STACK_CLASS}>
          {connectedWallet ? (
            <WalletItem
              key={connectedWallet.id}
              wallet={connectedWallet}
              isConnected
              onShowQR={setSelectedWallet}
              onDelete={setDeletingWallet}
              onRename={handleRename}
            />
          ) : (
            <WalletDashedCtaButton label="Connect A Wallet" onClick={handleConnectWallet} />
          )}
        </div>
        </SettingsSection>

        <SettingsSection title="Address Book">
        <div className={SETTINGS_ROW_STACK_CLASS}>
          {loading && addressBookWallets.length === 0 ? (
            <div className="py-6 text-center text-sm text-[var(--color-text-muted)]">
              Loading wallets...
            </div>
          ) : addressBookWallets.length === 0 ? (
            <WalletDashedCtaButton
              label="Add New Address"
              onClick={() => setIsAddModalOpen(true)}
            />
          ) : (
            addressBookWallets.map((wallet) => (
              <WalletItem
                key={wallet.id}
                wallet={wallet}
                onShowQR={setSelectedWallet}
                onDelete={setDeletingWallet}
                onRename={handleRename}
              />
            ))
          )}

          {addressBookWallets.length > 0 && (
            <WalletDashedCtaButton
              className="mt-2"
              label="Add New Address"
              onClick={() => setIsAddModalOpen(true)}
            />
          )}
        </div>
        </SettingsSection>
      </div>

      {selectedWallet && (
        <WalletQRModal
          open={!!selectedWallet}
          onOpenChange={(open: boolean) => !open && setSelectedWallet(null)}
          address={selectedWallet.address}
          symbol={selectedWallet.symbol}
          networkName={selectedWallet.network}
          userName={user?.name || "User Profile"}
          explorerUrl={selectedWallet.type !== "bitcoin" ? (getBlockExplorerAddressUrl(selectedWallet.type, undefined, selectedWallet.address) || undefined) : undefined}
        />
      )}

      <ConfirmDeleteModal
        open={!!deletingWallet}
        onOpenChange={(open) => !open && setDeletingWallet(null)}
        onConfirm={handleDelete}
        walletName={deletingWallet?.name || ""}
      />

      <AddWalletModal
        open={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        onAdd={handleAdd}
      />
    </SettingsSection>
  );
}
