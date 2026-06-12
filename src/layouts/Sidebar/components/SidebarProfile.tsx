"use client";

import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { QrCode } from "lucide-react";
import { RootState } from "@/store/store";
import { Avatar } from "@/components/ui";
import Dropdown from "@/components/dropdown";
import Tooltip from "@/components/tooltip-bridge";
import { WalletQRModal } from "@/components/WalletQRModal";
import { useUserMenuItems } from "@/layouts/Header/components/UserDropdown/useUserMenuItems";
import { usePrivyWalletAddress } from "@/hooks/usePrivyWalletAddress";
import { getBlockExplorerAddressUrl } from "@/lib/blockExplorer";
import { demoUserInitials } from "@/config/demo-user";

const SETTINGS_PATH = "/dashboard/settings";

interface SidebarProfileProps {
  collapsed?: boolean;
  pathname?: string;
  tooltipPosition?: "left" | "right";
}

/**
 * Sidebar profile block: avatar + user name. Opens same menu as header profile (settings, logout).
 */
export default function SidebarProfile({
  collapsed = false,
  pathname = "",
  tooltipPosition = "right",
}: SidebarProfileProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { user } = useSelector((state: RootState) => state.auth);
  const { userMenuItems } = useUserMenuItems();
  const { address, hasWallet, walletType, chainId } = usePrivyWalletAddress();
  const [isQrOpen, setIsQrOpen] = useState(false);

  const planLabel = "Free account";

  const segments = pathname.split("/").filter(Boolean);
  const cleanPath = segments.length > 1 ? `/${segments.slice(1).join("/")}` : "/dashboard";
  const isSettingsActive = cleanPath === SETTINGS_PATH;


  const trigger = (
    <div
      role="button"
      className={`
        relative flex flex-row items-center gap-3
        rounded-[var(--radius-md)] w-[216px]
        border border-transparent group py-3
        transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25
        cursor-pointer bg-transparent
        ${!collapsed ? "hover:bg-[var(--color-sidebar-item-hover-subtle)]" : ""}
        ${collapsed ? "pl-1" : "pl-3 pr-12"}
      `}
      aria-label="Profile and settings"
      aria-current={isSettingsActive ? "page" : undefined}
    >
      <Avatar
        alt={user?.name || "User"}
        size="sm"
        variant="rounded"
        className="shrink-0 transition-[opacity,max-width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        fallback={
          <div className={`flex h-full w-full items-center justify-center bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs font-semibold uppercase transition-colors duration-300 ${collapsed ? "group-hover:bg-[var(--color-primary)]/30" : ""}`}>
            {user?.name ? demoUserInitials(user.name) : "CB"}
          </div>
        }
      />
      {/* Name and labels - Unified DOM with Whitelist Transition for Speed */}
      <div className={`
        flex-1 min-w-0 flex flex-col pt-0.5 overflow-hidden text-ellipsis
        transition-[opacity,max-width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
        ${collapsed ? "opacity-0 max-w-0 pointer-events-none" : "opacity-100 max-w-[112px]"}
      `}>
        <span className="text-[13px] font-medium truncate text-[var(--color-text-muted)] whitespace-nowrap">
          {user?.name || "Guest Account"}
        </span>
        <span className="text-[11px] font-medium text-[var(--color-text-muted)]/70 whitespace-nowrap">
          {planLabel}
        </span>
      </div>

    </div>
  );

  const content = (
    <div className="w-full flex flex-col pt-4 overflow-hidden">
      <div className="pointer-events-auto relative">
        <Dropdown
          variant="userNav"
          userNavPanelWidth={collapsed ? "content" : "trigger"}
          modal={false}
          trigger={trigger}
          items={userMenuItems}
          placement="top-left"
          showArrow={true}
          sideOffset={2}
        />

        {!collapsed && hasWallet && address ? (
          <button
            type="button"
            aria-label="Show wallet QR code"
            className={`
              absolute right-3 top-1/2 -translate-y-1/2
              z-10 grid h-7 w-7 place-items-center
              rounded-[8px]
              text-[var(--color-text-muted)]/70
              hover:bg-[var(--color-sidebar-item-hover)] hover:text-[var(--color-text-muted)]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25
            `}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              setIsQrOpen(true);
            }}
          >
            <QrCode className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {hasWallet && address ? (
        <WalletQRModal
          open={isQrOpen}
          onOpenChange={setIsQrOpen}
          address={address}
          symbol={walletType === "solana" ? "SOL" : "ETH"}
          networkName={walletType === "solana" ? "Solana" : "Ethereum"}
          userName={user?.name || "User Profile"}
          contentContext="sidebar"
          explorerUrl={
            walletType === "solana"
              ? getBlockExplorerAddressUrl("solana", undefined, address) || undefined
              : getBlockExplorerAddressUrl("ethereum", typeof chainId === "number" ? String(chainId) : undefined, address) || undefined
          }
        />
      ) : null}
    </div>
  );

  if (!mounted) return null;

  return (
    <Tooltip 
      content={collapsed ? (user?.name || "User Profile") : ""} 
      position={tooltipPosition}
      disabled={!collapsed}
    >
      {content}
    </Tooltip>
  );
}
