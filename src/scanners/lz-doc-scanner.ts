// ─────────────────────────────────────────────────────────────────────────────
// LZ-DOC-SCANNER — daily LayerZero docs drift monitor
//
// S31 H2. Watches a curated set of LayerZero documentation URLs that, if
// changed silently, would meaningfully affect our bridge security posture
// or operational requirements. Fires Telegram alerts on breaking changes.
//
// Targets (all in the LayerZero docs subdomain — must be on egress allowlist):
//   - integration-checklist  : the official "before-mainnet" hardening checklist
//   - dvn-overview           : DVN concepts + selection guidance
//   - security-stack         : security-stack reference (DVN config, threshold)
//   - oapp-overview          : OApp/OFT v2 concepts (we use OFTAdapter)
//   - mainnet-addresses      : canonical Endpoint + DVN contract addresses
//
// Classification heuristics:
//   - 'breaking' on:
//       • word-list mentions of "breaking", "deprecated", "must update",
//         "vulnerability", "security advisory", "post-mortem"
//       • DVN-list shrinkage by >2 entries (indicates operator dropouts)
//       • addresses-page changes (rare — endpoints are immutable in practice;
//         a change here is either a new chain we should add, or a protocol
//         migration we MUST react to)
//   - 'notable' on:
//       • word-list mentions of "recommended", "new feature", "added support"
//       • net byte change > 5% relative to previous snapshot
//   - 'cosmetic' otherwise

import type { DocSource, DocFetchTarget, DocSeverity } from './external-doc-monitor'

// Stable per-target keys. Don't rename without a migration touching the
// snapshot-filename convention. URLs verified against
// https://docs.layerzero.network/llms.txt on 2026-04-25.
const TARGETS: DocFetchTarget[] = [
  {
    key: 'security-stack-dvns',
    label: 'LZ Security Stack — DVN configuration',
    url: 'https://docs.layerzero.network/v2/concepts/modular-security/security-stack-dvns',
  },
  {
    key: 'dvn-addresses',
    label: 'LZ DVN Addresses (mainnet roster)',
    url: 'https://docs.layerzero.network/v2/deployments/dvn-addresses',
  },
  {
    key: 'oapp-standard',
    label: 'LZ OApp Standard',
    url: 'https://docs.layerzero.network/v2/concepts/applications/oapp-standard',
  },
  {
    key: 'oft-standard',
    label: 'LZ OFT Standard',
    url: 'https://docs.layerzero.network/v2/concepts/applications/oft-standard',
  },
  {
    key: 'mainnet-addresses',
    label: 'LZ Deployed Contracts (Endpoint addresses)',
    url: 'https://docs.layerzero.network/v2/deployments/deployed-contracts',
  },
]

const BREAKING_KEYWORDS = [
  'breaking change',
  'breaking changes',
  'must update',
  'must upgrade',
  'deprecated',
  'security advisory',
  'security update',
  'vulnerability',
  'post-mortem',
  'postmortem',
  'critical fix',
  'urgent',
  'sunset',
  'discontinue',
]

const NOTABLE_KEYWORDS = [
  'recommended',
  'new feature',
  'now supports',
  'added support',
  'we recommend',
  'best practice',
  'new chain',
]

/** LZ docs are React/Docusaurus — script tags + nav chrome dwarf the actual
 *  content. Strip everything that isn't human-readable text in <main> or
 *  <article>. Cheap regex pass; we don't ship a real HTML parser dependency
 *  for one scanner.
 *
 *  Also strips:
 *    - script + style + svg blocks (huge, volatile, no signal)
 *    - data-* / aria-* attributes (build-output churn)
 *    - "Last updated" timestamp lines (always rendered, always stale)
 *    - Docusaurus build-id query strings (?docusaurus-version=…)
 */
function normalize(rawHtml: string): string {
  let s = rawHtml
  // Remove script + style + svg blocks
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
  // Try to extract <main> or <article> — falls through to the full body if neither matches
  const main = s.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)
  const article = s.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)
  if (main) s = main[1]
  else if (article) s = article[1]
  // Strip all HTML tags
  s = s.replace(/<[^>]+>/g, ' ')
  // Decode the most common entities
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  // Strip "Last updated …" boilerplate (Docusaurus prints it on every page)
  s = s.replace(/Last updated[^.\n]*/gi, '')
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

function classify(prev: string, next: string, target: DocFetchTarget): {
  severity: DocSeverity
  notes?: string
} {
  const lowerNext = next.toLowerCase()
  const lowerPrev = prev.toLowerCase()

  // Hit any breaking keyword that wasn't there last time → breaking.
  const newBreakingWords: string[] = []
  for (const kw of BREAKING_KEYWORDS) {
    if (lowerNext.includes(kw) && !lowerPrev.includes(kw)) {
      newBreakingWords.push(kw)
    }
  }
  if (newBreakingWords.length > 0) {
    return {
      severity: 'breaking',
      notes: `New breaking-keyword(s): ${newBreakingWords.slice(0, 3).join(', ')}`,
    }
  }

  // Mainnet-addresses changes are always at-least notable. Endpoint
  // addresses are essentially immutable in normal LZ operation; any change
  // here means either (a) a new chain we should evaluate, or (b) a
  // migration we MUST react to.
  if (target.key === 'mainnet-addresses') {
    return { severity: 'breaking', notes: 'Mainnet addresses page mutated — always investigate' }
  }

  // Heuristic for DVN list shrinkage: count "0x"-prefixed addresses in each
  // (DVN contracts are addresses; if the list shortens, operators are
  // exiting). Threshold: 3+ fewer addresses → breaking.
  if (target.key === 'dvn-addresses' || target.key === 'security-stack-dvns') {
    const prevAddrs = (prev.match(/0x[a-fA-F0-9]{40}/g) || []).length
    const nextAddrs = (next.match(/0x[a-fA-F0-9]{40}/g) || []).length
    if (prevAddrs - nextAddrs >= 3) {
      return {
        severity: 'breaking',
        notes: `DVN address list shrunk: ${prevAddrs} → ${nextAddrs}`,
      }
    }
    if (Math.abs(prevAddrs - nextAddrs) >= 1) {
      return {
        severity: 'notable',
        notes: `DVN address list changed: ${prevAddrs} → ${nextAddrs}`,
      }
    }
  }

  // Notable keywords (less urgent — daily-digest tier)
  for (const kw of NOTABLE_KEYWORDS) {
    if (lowerNext.includes(kw) && !lowerPrev.includes(kw)) {
      return { severity: 'notable', notes: `New keyword: "${kw}"` }
    }
  }

  // Big size change → notable even without keyword hits
  const prevLen = prev.length || 1
  const delta = Math.abs(next.length - prevLen) / prevLen
  if (delta > 0.05) {
    return {
      severity: 'notable',
      notes: `${(delta * 100).toFixed(1)}% byte-size change (${prevLen} → ${next.length})`,
    }
  }

  // Anything else — record but stay quiet.
  return { severity: 'cosmetic' }
}

export const lzDocSource: DocSource = {
  id: 'layerzero',
  name: 'LayerZero',
  targets: () => TARGETS,
  normalize: (rawHtml /* , target */) => normalize(rawHtml),
  classify,
}
