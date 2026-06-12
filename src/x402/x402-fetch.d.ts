// Type shim for x402-fetch — package.json's top-level `types` field points
// to a non-existent path (./dist/index.d.ts); the real types live at
// ./dist/cjs/index.d.ts and ./dist/esm/index.d.mts under an `exports` map
// that backend tsconfig's moduleResolution=node can't traverse. This shim
// declares the surface we actually use; full upstream types are
// reachable when the package's manifest is fixed.

declare module 'x402-fetch' {
  type SignerLike = unknown
  type X402Network = string
  type Hex = `0x${string}`

  /** Returns Promise<Signer> — the EVM path resolves synchronously internally
   *  but is wrapped in Promise.resolve so SVM (Solana) can be async. Callers
   *  MUST await before passing to wrapFetchWithPayment, otherwise the duck-type
   *  check inside x402-fetch fails and throws "Invalid evm wallet client
   *  provided" the moment a real 402 challenge arrives. */
  export function createSigner(network: string, privateKey: Hex): Promise<SignerLike>
  export function decodeXPaymentResponse(header: string): {
    success: boolean
    transaction: Hex
    network: X402Network
    payer: Hex
  }
  export function wrapFetchWithPayment(
    fetch: typeof globalThis.fetch,
    walletClient: SignerLike,
    maxValue?: bigint,
  ): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}
