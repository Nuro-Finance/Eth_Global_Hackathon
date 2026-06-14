/**
 * Centralized chain-icon rendering (Session 23 Thread B).
 *
 * Previously we hand-wrote 23 SVGs into public/assets/images/chains/, and one
 * of them (Arbitrum) was visibly wrong - brand inaccuracy. Rather than keep
 * hand-writing compact-but-fragile SVGs, we use @web3icons/react, which
 * covers all 23 of our supported chains with real brand-kit SVGs.
 *
 * Usage:
 * <ChainIcon name="Arbitrum" size={40} /> // by display name
 * <ChainIcon chainId={42161} size={40} /> // by EVM chain id
 *
 * Internally this maps our display names / chain ids to the @web3icons
 * `id` field (the package's canonical slug). If a name is missing from the
 * map we fall back to a colored letter circle (same degrade path the
 * original component had).
 *
 * The component is a CLIENT-side render (@web3icons/react uses dynamic
 * import). Every file that imports this must already be a client component
 * or import ChainIcon from within one.
 */
"use client";

import React from "react";
import { NetworkIcon } from "@web3icons/react/dynamic";
import { cn } from "@/lib/utils";

/**
 * Display-name → web3icons canonical id. Covers every chain in our
 * supported-networks list. If you add a chain, add it here too.
 */
export const CHAIN_NAME_TO_WEB3ICONS_ID: Record<string, string> = {
    "Base": "base",
    "BASE": "base",
    "Ethereum": "ethereum",
    "Arbitrum": "arbitrum-one",
    "Optimism": "optimism",
    "Polygon": "polygon",
    "Avalanche": "avalanche",
    "BSC": "binance-smart-chain",
    "zkSync": "zksync",
    "zkSync Era": "zksync",
    "Scroll": "scroll",
    "Linea": "linea",
    "Celo": "celo",
    "Gnosis": "gnosis",
    "Unichain": "unichain",
    "Sonic": "sonic",
    "World Chain": "world",
    "Ink": "ink",
    "HyperEVM": "hyper-evm",
    "Sei": "sei-network",
    "Plume": "plume",
    "Monad": "monad",
    "XDC": "xdc",
    "Codex": "codex",
    "Solana": "solana",
};

/**
 * EVM chain id → display name (for when we only have the numeric id
 * handy, like in the transactions table). Keep in sync with backend
 * CHAINS config.
 */
export const CHAIN_ID_TO_NAME: Record<number, string> = {
    0: "Solana",
    1: "Ethereum",
    10: "Optimism",
    50: "XDC",
    56: "BSC",
    100: "Gnosis",
    130: "Unichain",
    137: "Polygon",
    143: "Monad",
    146: "Sonic",
    324: "zkSync",
    480: "World Chain",
    534352: "Scroll",
    59144: "Linea",
    8453: "Base",
    42161: "Arbitrum",
    42220: "Celo",
    43114: "Avalanche",
    57073: "Ink",
    81224: "Codex",
    98866: "Plume",
    1329: "Sei",
    999: "HyperEVM",
};

export interface ChainIconProps {
 /** Display name (e.g. "Arbitrum") - preferred. */
    name?: string;
 /** EVM chain id (e.g. 42161). Used if `name` omitted. */
    chainId?: number;
 /** Rendered size in px. Default 40. */
    size?: number;
 /** Optional wrapper classes (for rounded bg, ring, etc). */
    className?: string;
 /** Variant - "branded" (color), "mono" (single-color), or "background" */
    variant?: "branded" | "mono" | "background";
}

/**
 * Renders the official brand icon for a chain. Falls back to a colored
 * letter-on-circle if the name/chainId isn't in the map.
 */
export function ChainIcon({ name, chainId, size = 40, className, variant = "branded" }: ChainIconProps) {
    const resolvedName = name ?? (chainId != null ? CHAIN_ID_TO_NAME[chainId] : undefined);
    const iconId = resolvedName ? CHAIN_NAME_TO_WEB3ICONS_ID[resolvedName] : undefined;

    if (!iconId) {
 // Fallback - colored circle with first letter
        const letter = (resolvedName || "?").charAt(0).toUpperCase();
        return (
            <div
                className={cn(
                    "flex items-center justify-center rounded-full bg-[var(--color-bg-glass)] text-[var(--color-text-primary)] font-bold",
                    className
                )}
                style={{ width: size, height: size, fontSize: size * 0.4 }}
                aria-label={resolvedName || "Unknown chain"}
            >
                {letter}
            </div>
        );
    }

 // NetworkIcon renders an SVG. Wrap in a rounded container so it looks
 // consistent with the circular chain tiles across the app.
    return (
        <NetworkIcon
            id={iconId}
            size={size}
            variant={variant}
            className={className}
        />
    );
}
