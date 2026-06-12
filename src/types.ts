export interface IssuerContract {
    id: string
    chainId: number
    controllerAddress: string
    proxyAddress: string
    depositAddress: string
    tokens: IssuerToken[]
    contractVersion: number
}
export interface IssuerToken {
    address: string
    balance: string
    exchangeRate: number
    advanceRate: number
}
export interface WebhookPayload {
    userId: string
    amount: string
    chainId: number
    currency: string
    txHash?: string
}
export interface DepositRecord {
    userId: string
    depositAddress: string
    createdAt: number
}
export interface TransactionRecord {
    id: string
    userId: string
    userWallet: string
    baseDepositAddress: string
    sourceChain: number
    destChain: number
    token: string
    amount: number
    fee: number
    forwarded: number
    route: 'layerzero' | 'across' | 'circle-cctp'
    txHash: string
    status: 'confirmed' | 'failed'
    timestamp: number
}
