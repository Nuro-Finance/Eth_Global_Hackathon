// Type shim for x402's subpath modules (`x402/types`, `x402/verify`).
// Same reasoning as x402-fetch.d.ts: backend tsconfig has
// `moduleResolution: 'node'` which doesn't traverse `exports` maps. At
// runtime Node's resolver DOES handle exports — so the imports work; we
// just need TS to know the surface we use.
//
// IMPORTANT: `useFacilitator` is exported from `x402/verify` at runtime,
// NOT from `x402/facilitator`. The package's .d.ts on `x402/facilitator`
// claims it does, but the runtime CommonJS only exports {settle, verify}.
// Confirmed via Object.keys(require('x402/verify')) on the deployed
// runtime: ['list', 'settle', 'supported', 'useFacilitator', 'verify'].
//
// Full upstream types live at:
//   node_modules/x402/dist/cjs/types/index.d.ts
//   node_modules/x402/dist/cjs/verify/index.d.ts
// They're reachable when moduleResolution is upgraded to node16+.

declare module 'x402/types' {
  export interface PaymentRequirements {
    scheme: 'exact'
    network: string
    maxAmountRequired: string
    resource: string
    description: string
    mimeType: string
    outputSchema?: Record<string, unknown>
    payTo: string
    maxTimeoutSeconds: number
    asset: string
    extra?: Record<string, unknown>
  }

  export interface ExactEvmPayloadAuthorization {
    from: `0x${string}`
    to: `0x${string}`
    value: string
    validAfter: string
    validBefore: string
    nonce: `0x${string}`
  }

  export interface ExactEvmPayload {
    signature: `0x${string}`
    authorization: ExactEvmPayloadAuthorization
  }

  export interface PaymentPayload {
    x402Version: number
    scheme: string
    network: string
    payload: ExactEvmPayload
  }

  export interface VerifyResponse {
    isValid: boolean
    invalidReason?: string
    payer?: string
  }

  export interface SettleResponse {
    success: boolean
    errorReason?: string
    /** Some facilitator implementations return `txHash`; others `transaction`.
     *  Both surfaces appear in the wild — we read whichever is set. */
    txHash?: string
    transaction?: string
    network?: string
    payer?: string
  }
}

declare module '@coinbase/x402' {
  /** Pre-built FacilitatorConfig shape for Coinbase's mainnet-capable
   *  facilitator. Reads CDP_API_KEY_ID + CDP_API_KEY_SECRET from
   *  process.env on each call to construct a JWT bearer header. Also
   *  exposed for explicit-creds construction via createFacilitatorConfig. */
  export const facilitator: {
    url: string
    createAuthHeaders: () => Promise<{
      verify: Record<string, string>
      settle: Record<string, string>
      supported: Record<string, string>
      list?: Record<string, string>
    }>
  }
  export function createFacilitatorConfig(
    apiKeyId: string,
    apiKeySecret: string,
  ): typeof facilitator
}

declare module 'x402/verify' {
  import type {
    PaymentPayload,
    PaymentRequirements,
    VerifyResponse,
    SettleResponse,
  } from 'x402/types'

  export interface FacilitatorConfig {
    url: string
    createAuthHeaders?: () => Promise<{
      verify: Record<string, string>
      settle: Record<string, string>
      supported: Record<string, string>
      list?: Record<string, string>
    }>
  }

  export function useFacilitator(config?: FacilitatorConfig): {
    verify: (
      payload: PaymentPayload,
      requirements: PaymentRequirements,
    ) => Promise<VerifyResponse>
    settle: (
      payload: PaymentPayload,
      requirements: PaymentRequirements,
    ) => Promise<SettleResponse>
  }
}
