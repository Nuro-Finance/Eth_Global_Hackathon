/** Optional runtime dep — dynamic import fails gracefully when not installed. */
declare module '@polymarket/clob-client' {
  export class ClobClient {
    constructor(...args: unknown[])
    createOrder(...args: unknown[]): Promise<unknown>
    postOrder(...args: unknown[]): Promise<unknown>
  }
  export enum Side {
    BUY = 'BUY',
    SELL = 'SELL',
  }
  export enum OrderType {
    GTC = 'GTC',
  }
}
