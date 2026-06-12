"use client";

import { Wallet, CreditCard, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 3-way destination toggle for P2P transfers. Matches backend enum in
 * POST /transfers: 'wallet' | 'card' | 'agent'.
 *
 * wallet: sender vault → recipient vault on Base (instant, no fee)
 * card: sender vault → recipient's Issuer Base deposit → Visa card credited
 * agent: sender vault → recipient's agent wallet (fund their bot)
 *
 * `canSendToCard=false` disables the Card option (grey + tooltip) when the
 * recipient hasn't completed KYC. Without KYC, Issuer has no deposit address
 * to credit — backend returns 400, so we pre-empt in the UI.
 */

export type TransferDestination = "wallet" | "card" | "agent";

interface DestinationToggleProps {
    value: TransferDestination;
    onChange: (v: TransferDestination) => void;
    canSendToCard: boolean;
}

const OPTIONS: Array<{
    key: TransferDestination;
    label: string;
    desc: string;
    Icon: typeof Wallet;
}> = [
    {
        key: "wallet",
        label: "Wallet",
        desc: "Vault → vault (instant)",
        Icon: Wallet,
    },
    {
        key: "card",
        label: "Card",
        desc: "Top up their Visa",
        Icon: CreditCard,
    },
    {
        key: "agent",
        label: "Agent",
        desc: "Fund their trading bot",
        Icon: Bot,
    },
];

export function DestinationToggle({
    value,
    onChange,
    canSendToCard,
}: DestinationToggleProps) {
    return (
        <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-[var(--color-text-primary)]">
                Send to
            </label>
            <div
                className="grid grid-cols-3 gap-2"
                role="radiogroup"
                aria-label="Transfer destination"
            >
                {OPTIONS.map(({ key, label, desc, Icon }) => {
                    const disabled = key === "card" && !canSendToCard;
                    const selected = value === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={disabled}
                            onClick={() => !disabled && onChange(key)}
                            title={
                                disabled
                                    ? "Recipient has not completed KYC yet"
                                    : desc
                            }
                            className={cn(
                                "flex flex-col items-center gap-1 rounded-[10px] border px-3 py-2.5 text-center transition-all",
                                selected
                                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                                    : "border-[var(--color-border-input)] bg-[var(--color-bg-input)] text-[var(--color-text-primary)] hover:border-[var(--color-border-input-hover)]",
                                disabled && "opacity-40 cursor-not-allowed"
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            <span className="text-[11px] font-semibold uppercase tracking-wider">
                                {label}
                            </span>
                            <span className="text-[9px] font-normal text-[var(--color-text-muted)] leading-tight">
                                {desc}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
