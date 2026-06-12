"use client";

import { IconSearch, IconPlus } from "@tabler/icons-react";
import { IconButton } from "@/components/ui";
import { cn } from "@/lib/utils";

interface WalletData {
  id: string;
  name: string;
  address: string;
  network: string;
  symbol: string;
  type: string;
}

interface AvatarRowProps {
  wallets: WalletData[];
  selectedWallet: WalletData | null;
  onSelect: (wallet: WalletData) => void;
}

const COLORS = ["#846FFF", "#3B82F6", "#16e0a9", "#f59e0b", "#ec4899", "#06B6D4", "#8B5CF6", "#10B981"];

export function AvatarRow({ wallets, selectedWallet, onSelect }: AvatarRowProps) {
  if (wallets.length === 0) {
    return (
      <div className="flex gap-2 sm:gap-3 mb-4 sm:mb-6 flex-row items-center">
        <button
          onClick={() => window.location.href = "/dashboard/settings"}
          className={cn(
            "w-[40px] h-[40px] sm:w-[48px] sm:h-[48px] rounded-full",
            "flex items-center justify-center shrink-0",
            "border-2 border-dashed border-white/20 text-[var(--color-text-muted)]",
            "hover:border-[var(--color-primary)]/50 hover:text-[var(--color-primary)] transition-all"
          )}
          title="Add a wallet in Settings"
        >
          <IconPlus size={18} stroke={1.5} />
        </button>
        <span className="text-[var(--color-text-muted)] text-xs">Add a wallet to send transfers</span>
      </div>
    );
  }

  return (
    <div className="flex gap-2 sm:gap-3 mb-4 sm:mb-6 flex-row items-center">
      {wallets.slice(0, 5).map((wallet, index) => {
        const color = COLORS[index % COLORS.length];
        const isSelected = selectedWallet?.id === wallet.id;
        return (
          <button
            key={wallet.id}
            onClick={() => onSelect(wallet)}
            className={cn(
              "w-[40px] h-[40px] sm:w-[48px] sm:h-[48px] rounded-full",
              "flex items-center justify-center font-semibold uppercase",
              "text-sm sm:text-base shrink-0 transition-all duration-200",
              isSelected && "ring-2 ring-[var(--color-primary)] ring-offset-2 ring-offset-[var(--color-bg-card)] scale-110"
            )}
            style={{
              backgroundColor: `${color}33`,
              color: color,
            }}
            title={`${wallet.name} (${wallet.symbol})`}
          >
            {wallet.name.charAt(0)}
          </button>
        );
      })}
    </div>
  );
}
