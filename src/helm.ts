// Public-release no-op stubs - internal Helm security plane removed from OSS tree.

import type { AxiosInstance } from 'axios'
import type { Pool } from 'pg'

export interface TxCapInput {
  source: string
  txKind: 'swap' | 'bridge' | 'transfer' | 'approve' | 'gas-topup' | 'fee' | 'other'
  valueUsd: number
  chainId: number
  fromAddress?: string
  toAddress?: string
  agentId?: string | null
}

export function initHelm(): void {
 /* no-op */
}

export function addEgressAllowlist(_hosts: string[]): void {
 /* no-op */
}

export function instrumentAxios(_instance: AxiosInstance, _label: string): void {
 /* no-op */
}

export async function enforceTxCap(_input: TxCapInput): Promise<void> {
 /* no-op */
}

export async function logHelmEvent(_input: unknown): Promise<void> {
 /* no-op */
}

export async function scanAndEmit(_input: {
  text: string
  source: string
  agentId?: string | null
}): Promise<void> {
 /* no-op */
}

export async function runHelmSelfTest(_db: Pool): Promise<{
  generatedAt: string
  rules: Array<{
    id: string
    category: string
    severity: string
    action: string
    count24h: number
    lastFired: string | null
  }>
}> {
  return { generatedAt: new Date().toISOString(), rules: [] }
}
