"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Wallet, Copy, RefreshCw, LogOut } from "lucide-react";
import Dropdown from "@/components/dropdown";
import { useHeaderMenu } from "@/layouts/Header/HeaderMenuContext";
import { usePrivyRuntime } from "@/providers/PrivyRuntimeContext";
import { DESIGN_MODE } from "@/config/design-mode";

/** Must match `appearance.walletList` in Providers.tsx */
const EXTERNAL_WALLET_LIST = [
  "detected_ethereum_wallets",
  "metamask",
  "coinbase_wallet",
  "wallet_connect",
] as const;

/**
 * Header wallet control: opens Privy connect modal, then shows truncated address + menu.
 * ABSOLUTE SPEED: Bypasses hooks in DESIGN_MODE to prevent 30s hangs.
 */
function ConnectWalletUnconfigured() {
  return (
    <button
      type="button"
      title="Wallet connection unavailable — set NEXT_PUBLIC_PRIVY_APP_ID"
      onClick={() => {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[ConnectWallet] Privy is not configured. Add NEXT_PUBLIC_PRIVY_APP_ID to .env.local and restart the dev server.",
          );
        }
      }}
      className="relative flex h-8 min-w-[9.5rem] cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-primary)] bg-[var(--color-primary)] px-3 focus:outline-none"
    >
      <Wallet className="h-4 w-4 shrink-0 text-[var(--color-text-on-primary)]" />
      <span className="text-sm font-semibold text-[var(--color-text-on-primary)]">Connect Wallet</span>
    </button>
  );
}

export function ConnectWallet() {
  const { privyEnabled } = usePrivyRuntime();

  const [isHovered, setIsHovered] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const showGlow = isHovered || isOpen;

 // ===== DESIGN MODE BYPASS: mock only when Privy is not mounted =====
  if (DESIGN_MODE && !privyEnabled) {
    const mockMenuItems = [
      { id: "copy", label: "Copy address", icon: <Copy className="h-4 w-4" />, onClick: () => {} },
      { id: "switch", label: "Switch wallet", icon: <RefreshCw className="h-4 w-4" />, onClick: () => {} },
      { id: "disconnect", label: "Disconnect wallet", icon: <LogOut className="h-4 w-4" />, onClick: () => {}, variant: "danger" as const },
    ];

    return (
      <Dropdown
        modal={false}
        placement="bottom-right"
        open={isOpen}
        onOpenChange={setIsOpen}
        trigger={
          <button
            type="button"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="relative flex h-8 min-w-[9.5rem] max-[480px]:min-w-[7.25rem] cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-primary)] bg-transparent px-3 text-[var(--color-text-primary)] transition-all duration-300 dark:backdrop-blur-[var(--glass-blur)] focus:outline-none focus-visible:ring-0"
            style={{
              boxShadow: 'inset 0 0 10px 1px rgba(13, 144, 255, 0.7)',
              backgroundColor: showGlow ? 'rgba(13, 144, 255, 0.15)' : 'rgba(13, 144, 255, 0.05)'
            }}
            aria-label="Wallet connected (Mock)"
          >
            <Wallet className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
            <span className="text-sm font-medium">0x742d...f44e</span>
          </button>
        }
        items={mockMenuItems}
        className="w-auto"
      />
    );
  }

  if (!privyEnabled) {
    return <ConnectWalletUnconfigured />;
  }

  return (
    <ConnectWalletPrivy
      isHovered={isHovered}
      isOpen={isOpen}
      showGlow={showGlow}
      onHoverChange={setIsHovered}
      onOpenChange={setIsOpen}
    />
  );
}

function ConnectWalletPrivy({
  isHovered,
  isOpen,
  showGlow,
  onHoverChange,
  onOpenChange,
}: {
  isHovered: boolean;
  isOpen: boolean;
  showGlow: boolean;
  onHoverChange: (hovered: boolean) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const headerMenu = useHeaderMenu();
  const { ready, authenticated, login, logout, user, linkWallet } = usePrivy();
  const { wallets } = useWallets();
  const pendingConnectRef = useRef(false);

 // Day-6: prefer external wallets (MetaMask/Rabby/Coinbase/etc.) over
 // the Privy-auto-created embedded wallet.
 //
 // Day-7 fix: previously, when there was NO external wallet, the
 // fallback `wallets[0]` would grab the embedded wallet anyway, so a
 // brand-new email-only signup saw a phantom 0xe798... address in the
 // header even though they never connected a wallet. Now we filter
 // out embedded from BOTH the wallets[] array and the linkedAccounts
 // fallback. If nothing external is connected, address stays empty
 // and the pill renders "Connect Wallet" CTA.
  const externalWallet = wallets.find(
    (w) => String((w as { connectorType?: string }).connectorType || "") !== "embedded",
  );
  const externalLinkedWalletAddress = (user?.linkedAccounts?.find(
    (a) =>
      (a.type === "wallet" || a.type === "smart_wallet") &&
      "address" in a &&
      "walletClientType" in a &&
      a.walletClientType !== "privy"
  )?.address as string | undefined) || "";

  const resolvedAddress = externalWallet?.address ?? externalLinkedWalletAddress ?? "";

  const address = authenticated ? (resolvedAddress || "") : "";

  const runConnect = useCallback(() => {
    if (!ready) {
      pendingConnectRef.current = true;
      return;
    }
    pendingConnectRef.current = false;

    const walletList = [...EXTERNAL_WALLET_LIST];

    if (!authenticated) {
      void login({
        loginMethods: ["wallet"],
        walletList,
      } as Parameters<typeof login>[0]);
      return;
    }

 // Email/Google users are already authenticated — linkWallet opens the modal.
    linkWallet({
      description: "Connect a wallet to use with your Nuro account.",
      walletList,
    });
  }, [authenticated, linkWallet, login, ready]);

  useEffect(() => {
    if (!ready || !pendingConnectRef.current) return;
    pendingConnectRef.current = false;
    runConnect();
  }, [ready, runConnect]);

  const handleConnect = () => {
    runConnect();
  };

  const menuItems: Array<{
    id: string;
    label: string;
    icon: ReactNode;
    onClick: () => void;
    variant?: "default" | "danger";
    disabled?: boolean;
  }> = [
    {
      id: "copy",
      label: "Copy address",
      icon: <Copy className="h-4 w-4" />,
      onClick: () => { if (address) void navigator.clipboard.writeText(address); },
      variant: "default",
    },
    {
      id: "switch",
      label: "Switch wallet",
      icon: <RefreshCw className="h-4 w-4" />,
      onClick: () =>
        linkWallet({
          description: "Connect a different wallet to your Nuro account.",
          walletList: [...EXTERNAL_WALLET_LIST],
        }),
      variant: "default",
    },
    {
      id: "disconnect",
      label: "Disconnect wallet",
      icon: <LogOut className="h-4 w-4" />,
      onClick: () => { void logout().catch(() => {}); },
      variant: "danger",
    },
  ];

 // 2026-05-25 fix: previously there was a silent-disabled button here that
 // swallowed clicks while Privy was still hydrating. That ate 
 // clicks for two days. The Reload modal flow worked because it rendered
 // deeper in the tree, after Privy had hydrated. Now: the live button at
 // the bottom of this component always renders, and the `if (!ready) return`
 // guard inside handleConnect short-circuits cleanly without a different
 // disabled DOM element absorbing the click. Hydration is fast enough that
 // users effectively never click during the window anyway.


  if (address) {
    return (
      <Dropdown
        modal={false}
        placement="bottom-right"
        open={isOpen}
        onOpenChange={(open) => {
          onOpenChange(open);
          if (headerMenu) {
            open ? headerMenu.openMenu("wallet") : headerMenu.closeMenu();
          }
        }}
        trigger={
          <button 
            type="button" 
            onMouseEnter={() => onHoverChange(true)}
            onMouseLeave={() => onHoverChange(false)}
            className="relative flex h-8 min-w-[9.5rem] cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-primary)] bg-transparent px-3 text-[var(--color-text-primary)] transition-all duration-300 focus:outline-none"
            style={{
              boxShadow: 'inset 0 0 10px 1px rgba(13, 144, 255, 0.7)',
              backgroundColor: showGlow ? 'rgba(13, 144, 255, 0.15)' : 'rgba(13, 144, 255, 0.05)'
            }}
          >
            <Wallet className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
            <span className="text-sm font-medium">{address.slice(0, 6)}...{address.slice(-4)}</span>
          </button>
        }
        items={menuItems}
        className="w-auto"
      />
    );
  }

  return (
    <button type="button" onClick={handleConnect} className="relative flex h-8 min-w-[9.5rem] cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-primary)] bg-[var(--color-primary)] px-3 transition-all duration-300 hover:opacity-90 focus:outline-none">
      <Wallet className="h-4 w-4 shrink-0 text-[var(--color-text-on-primary)]" />
      <span className="text-sm font-bold text-[var(--color-text-on-primary)]">Connect Wallet</span>
    </button>
  );
}

export default ConnectWallet;

