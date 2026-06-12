"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSolanaAddress } from "./useSolanaAddress";

/**
 * useSolanaWalletPortfolio — fetch Solana portfolio for a base58 address.
 *
 * Session 27 — now wired to Privy Solana via `useSolanaAddress()`. Pass
 * an explicit `address` to override (useful for admin views or inspecting
 * external addresses); otherwise the hook auto-resolves the connected
 * user's embedded Solana wallet.
 *
 * Defensive: if Privy isn't configured, or the Solana wallet hasn't been
 * created yet, the hook returns `portfolio: null` + `isLoading: false`.
 * Consumers should render an empty-state rather than crash.
 */

export interface SolanaToken {
  mint: string
  symbol: string | null
  balance: number
  decimals: number
  usdPrice: number
  usdValue: number
}

export interface SolanaPortfolio {
  address: string
  totalUsd: number
  nativeBalance: number        // SOL
  nativeUsdValue: number
  tokens: SolanaToken[]
  fetchedAt: string
}

export interface UseSolanaWalletPortfolioResult {
  portfolio: SolanaPortfolio | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useSolanaWalletPortfolio(explicitAddress?: string | null): UseSolanaWalletPortfolioResult {
  const { address: privyAddress } = useSolanaAddress()
 // Explicit override wins; otherwise auto-resolve from Privy
  const address = explicitAddress !== undefined ? explicitAddress : privyAddress

  const [portfolio, setPortfolio] = useState<SolanaPortfolio | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPortfolio = useCallback(async () => {
    if (!address) {
      setPortfolio(null)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/wallet-portfolio-solana?address=${encodeURIComponent(address)}`)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Request failed (${res.status})`)
      }
      const data: SolanaPortfolio = await res.json()
      setPortfolio(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
      setPortfolio(null)
    } finally {
      setIsLoading(false)
    }
  }, [address])

  useEffect(() => {
    fetchPortfolio()
  }, [fetchPortfolio])

  return useMemo(
    () => ({ portfolio, isLoading, error, refresh: fetchPortfolio }),
    [portfolio, isLoading, error, fetchPortfolio]
  )
}
