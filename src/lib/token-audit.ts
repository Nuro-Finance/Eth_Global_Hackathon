/**
 * ─── TOKEN AUDIT HELPERS — GoPlus + TokenSniffer ────────────────────────────
 *
 * Session 26 — pair with the erc20_allowlist admin UI so that before
 * flips a memecoin to enabled=true, he sees a one-shot security
 * summary: honeypot detection, buy/sell tax, proxy status, trading
 * cooldown, holder concentration.
 *
 * GoPlus Token Security API (free, no key required):
 * https://api.gopluslabs.io/api/v1/token_security/{chainId}?contract_addresses={addr}
 *
 * TokenSniffer (free tier, 10 req/min without key):
 * https://tokensniffer.com/api/v2/tokens/{chainId}/{address}?apikey=...
 * We skip TokenSniffer for now — requires account signup. GoPlus alone
 * covers the honeypot+tax+proxy risk signals we care about.
 *
 * Output schema is flattened to just the fields admin actually reads —
 * raw GoPlus response has 40+ fields, we surface ~12 that actually flag
 * risk. Raw JSON still passed through for deep-dive.
 */

import axios from 'axios'

export interface TokenAuditResult {
  chain_id: number
  address: string
  fetched_at: string
  source: 'goplus'
 // ─── Risk signals (true = bad) ────────────────────────────
  is_honeypot: boolean | null
  is_proxy: boolean | null
  is_mintable: boolean | null
  can_take_back_ownership: boolean | null
  hidden_owner: boolean | null
  transfer_pausable: boolean | null
  trading_cooldown: boolean | null
  external_call: boolean | null
 // ─── Fee signals (string "0.01" style — GoPlus quirk) ────
  buy_tax: string | null
  sell_tax: string | null
 // ─── Informational ───────────────────────────────────────
  is_open_source: boolean | null
  is_in_dex: boolean | null
  holder_count: number | null
  total_supply: string | null
  token_symbol: string | null
  token_name: string | null
 // ─── Overall verdict (our synthesis) ─────────────────────
  verdict: 'safe' | 'caution' | 'high_risk' | 'unknown'
  verdict_reasons: string[]
 // Raw GoPlus response for deep-dive
  raw: any
}

/**
 * Fetch GoPlus Token Security data for a given chain + address. Returns
 * null on fetch failure (network, 404, malformed response). Never throws.
 */
export async function fetchTokenAudit(
  chainId: number,
  address: string
): Promise<TokenAuditResult | null> {
 // GoPlus uses a specific chain_id set. Most EVM chains covered.
  const supportedChains = [1, 10, 25, 56, 100, 137, 250, 25, 128, 199, 321, 324, 534352, 42161, 43114, 59144, 8453, 11155111]
  if (!supportedChains.includes(chainId)) {
    return {
      chain_id: chainId,
      address,
      fetched_at: new Date().toISOString(),
      source: 'goplus',
      is_honeypot: null,
      is_proxy: null,
      is_mintable: null,
      can_take_back_ownership: null,
      hidden_owner: null,
      transfer_pausable: null,
      trading_cooldown: null,
      external_call: null,
      buy_tax: null,
      sell_tax: null,
      is_open_source: null,
      is_in_dex: null,
      holder_count: null,
      total_supply: null,
      token_symbol: null,
      token_name: null,
      verdict: 'unknown',
      verdict_reasons: [`GoPlus does not support chain ${chainId}`],
      raw: null,
    }
  }

  try {
    const url = `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${address.toLowerCase()}`
    const res = await axios.get(url, { timeout: 10000 })
    const data = res.data?.result?.[address.toLowerCase()]

    if (!data) {
      return {
        chain_id: chainId,
        address,
        fetched_at: new Date().toISOString(),
        source: 'goplus',
        is_honeypot: null,
        is_proxy: null,
        is_mintable: null,
        can_take_back_ownership: null,
        hidden_owner: null,
        transfer_pausable: null,
        trading_cooldown: null,
        external_call: null,
        buy_tax: null,
        sell_tax: null,
        is_open_source: null,
        is_in_dex: null,
        holder_count: null,
        total_supply: null,
        token_symbol: null,
        token_name: null,
        verdict: 'unknown',
        verdict_reasons: ['GoPlus returned no data for this token — may be unknown to their scanner'],
        raw: res.data,
      }
    }

 // GoPlus returns flags as "0"/"1" strings. Coerce to booleans.
    const flag = (v: any): boolean | null => {
      if (v === '1' || v === 1 || v === true) return true
      if (v === '0' || v === 0 || v === false) return false
      return null
    }
    const num = (v: any): number | null => {
      const n = parseFloat(String(v))
      return Number.isFinite(n) ? n : null
    }

    const is_honeypot = flag(data.is_honeypot)
    const is_proxy = flag(data.is_proxy)
    const is_mintable = flag(data.is_mintable)
    const can_take_back_ownership = flag(data.can_take_back_ownership)
    const hidden_owner = flag(data.hidden_owner)
    const transfer_pausable = flag(data.transfer_pausable)
    const trading_cooldown = flag(data.trading_cooldown)
    const external_call = flag(data.external_call)
    const is_open_source = flag(data.is_open_source)
    const is_in_dex = flag(data.is_in_dex)
    const buyTaxNum = num(data.buy_tax)
    const sellTaxNum = num(data.sell_tax)

    const reasons: string[] = []
    if (is_honeypot) reasons.push('HONEYPOT detected — cannot sell')
    if (hidden_owner) reasons.push('Hidden owner — hard-coded admin wallet')
    if (can_take_back_ownership) reasons.push('Ownership revocable — rug vector')
    if (is_mintable) reasons.push('Mintable — unlimited supply inflation risk')
    if (transfer_pausable) reasons.push('Transfers pausable — can freeze trading')
    if (trading_cooldown) reasons.push('Trading cooldown — anti-bot may delay sells')
    if (external_call) reasons.push('External calls — dependency risk')
    if (buyTaxNum != null && buyTaxNum > 0.05) reasons.push(`Buy tax ${(buyTaxNum * 100).toFixed(1)}% (>5%)`)
    if (sellTaxNum != null && sellTaxNum > 0.05) reasons.push(`Sell tax ${(sellTaxNum * 100).toFixed(1)}% (>5%)`)
    if (is_open_source === false) reasons.push('Not open source — code unverifiable')
    if (is_in_dex === false) reasons.push('Not in any DEX — zero liquidity signal')

    let verdict: TokenAuditResult['verdict']
    if (is_honeypot || can_take_back_ownership || hidden_owner) verdict = 'high_risk'
    else if (reasons.length >= 3) verdict = 'high_risk'
    else if (reasons.length >= 1) verdict = 'caution'
    else verdict = 'safe'

    return {
      chain_id: chainId,
      address,
      fetched_at: new Date().toISOString(),
      source: 'goplus',
      is_honeypot,
      is_proxy,
      is_mintable,
      can_take_back_ownership,
      hidden_owner,
      transfer_pausable,
      trading_cooldown,
      external_call,
      buy_tax: data.buy_tax ?? null,
      sell_tax: data.sell_tax ?? null,
      is_open_source,
      is_in_dex,
      holder_count: num(data.holder_count),
      total_supply: data.total_supply ?? null,
      token_symbol: data.token_symbol ?? null,
      token_name: data.token_name ?? null,
      verdict,
      verdict_reasons: reasons,
      raw: data,
    }
  } catch (err: any) {
    console.error('[token-audit] GoPlus fetch failed:', err.message?.slice(0, 100))
    return null
  }
}
