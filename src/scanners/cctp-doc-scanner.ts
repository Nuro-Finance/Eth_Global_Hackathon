// ─────────────────────────────────────────────────────────────────────────────
// CCTP-DOC-SCANNER — daily Circle CCTP docs drift monitor
//
// S31 H2. Watches Circle's Cross-Chain Transfer Protocol docs since CCTP
// is the bulk of our cross-chain volume (USDC bridge between EVM chains
// and EVM↔Solana). Doc drift here = silent breakage waiting:
//   - if Circle deprecates an endpoint and we don't notice, attestations
//     fail and bridges stall mid-flight
//   - if Circle adds a new chain we want to support, we want to know on
//     day one
//   - if iris-api.circle.com URL changes (never has, but if it did) our
//     attestation poll loop breaks
//
// Targets:
//   - cctp-overview        : top-level concepts page
//   - supported-chains     : the canonical "what chains does CCTP support"
//   - attestation-api      : the API spec we hammer every cross-chain transfer
//   - cctp-v2              : v2 docs page (we run v1; v2 launch = potential
//                            migration window)
//   - sandbox-vs-mainnet   : env-config doc (we want to catch endpoint URL
//                            changes between envs)

import type { DocSource, DocFetchTarget, DocSeverity } from './external-doc-monitor'

// URLs verified against https://developers.circle.com/llms.txt on 2026-04-25.
// Circle restructured the docs site away from /stablecoins/* to /cctp/*.
const TARGETS: DocFetchTarget[] = [
  {
    key: 'cctp-overview',
    label: 'Circle CCTP Overview',
    url: 'https://developers.circle.com/cctp',
  },
  {
    key: 'supported-chains',
    label: 'Circle CCTP Supported Chains and Domains',
    url: 'https://developers.circle.com/cctp/concepts/supported-chains-and-domains',
  },
  {
    key: 'cctp-v1-to-v2-migration',
    label: 'Circle CCTP v1→v2 Migration Guide',
    url: 'https://developers.circle.com/cctp/migration-from-v1-to-v2',
  },
  {
    key: 'cctp-technical-guide',
    label: 'Circle CCTP Technical Guide',
    url: 'https://developers.circle.com/cctp/references/technical-guide',
  },
  {
    key: 'cctp-openapi-spec',
    label: 'Circle CCTP OpenAPI Spec (attestation API)',
    url: 'https://developers.circle.com/openapi/cctp.yaml',
  },
]

const BREAKING_KEYWORDS = [
  'deprecated',
  'deprecation',
  'breaking change',
  'breaking changes',
  'sunset',
  'will be removed',
  'no longer supported',
  'security advisory',
  'vulnerability',
  'migration required',
  'must migrate',
  'mandatory upgrade',
  'discontinued',
]

const NOTABLE_KEYWORDS = [
  'new chain',
  'now supports',
  'added support',
  'beta',
  'general availability',
  'recommended',
  'best practice',
  'rate limit',
]

/** Circle docs are ReadMe.io-rendered. Strip nav chrome, version selector,
 *  pagination footers. Same idea as LZ normalize but with ReadMe-specific
 *  selectors. Falls back to "all body text" if the selectors don't match
 *  (defensive against site rewrites). */
function normalize(rawHtml: string): string {
  let s = rawHtml
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')

  // ReadMe wraps page content in <article class="rm-Article" …>; fall back
  // to <main> then full doc.
  const article = s.match(/<article\b[^>]*class=["'][^"']*rm-Article[^"']*["'][\s\S]*?<\/article>/i)
  const main = !article ? s.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) : null
  if (article) s = article[0]
  else if (main) s = main[1]

  s = s.replace(/<[^>]+>/g, ' ')
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  // Strip "Updated <date>" boilerplate (ReadMe shows this at the top of
  // every page; varies per render).
  s = s.replace(/Updated\s+\d+\s+(days?|weeks?|months?|years?)\s+ago/gi, '')
  s = s.replace(/Updated[^.\n]{0,40}/gi, '')

  s = s.replace(/\s+/g, ' ').trim()
  return s
}

function classify(prev: string, next: string, target: DocFetchTarget): {
  severity: DocSeverity
  notes?: string
} {
  const lowerNext = next.toLowerCase()
  const lowerPrev = prev.toLowerCase()

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

  // Domain-id list changes (the supported-chains page lists them like
  // "Ethereum: 0", "Avalanche: 1", "Optimism: 2", …). Count integer-domain
  // mentions in the dom-id colon-prefix pattern. We've seen 12+ stable
  // for months; any decrease is a CCTP-side de-listing, increase is a
  // new chain.
  if (target.key === 'supported-chains') {
    const prevCount = (prev.match(/\bDomain\s*[:#]?\s*\d+/gi) || []).length
    const nextCount = (next.match(/\bDomain\s*[:#]?\s*\d+/gi) || []).length
    if (prevCount > 0 && nextCount > 0) {
      if (prevCount - nextCount >= 1) {
        return {
          severity: 'breaking',
          notes: `Supported-chains domain count shrunk: ${prevCount} → ${nextCount}`,
        }
      }
      if (nextCount - prevCount >= 1) {
        return {
          severity: 'notable',
          notes: `Supported-chains domain count grew: ${prevCount} → ${nextCount} (new chain available)`,
        }
      }
    }
  }

  // Attestation-API base URL changes are a hard breaker for our
  // bridge.ts loop (we hammer iris-api.circle.com). The OpenAPI spec is
  // the most authoritative place to detect this — it lists the literal
  // server URL in the `servers:` block.
  if (target.key === 'cctp-openapi-spec' || target.key === 'cctp-technical-guide') {
    const prevHasIris = /iris-api\.circle\.com/.test(prev)
    const nextHasIris = /iris-api\.circle\.com/.test(next)
    if (prevHasIris && !nextHasIris) {
      return {
        severity: 'breaking',
        notes: 'iris-api.circle.com no longer mentioned — attestation host may have moved',
      }
    }
  }

  // v1→v2 migration page mentioning sunset/deprecation timeline → breaking
  // (we still run v1 contracts; if Circle sets a v1 sunset date we MUST
  // plan a migration).
  if (target.key === 'cctp-v1-to-v2-migration') {
    const sunsetPatterns = ['v1 will be discontinued', 'v1 sunset', 'v1 deprecation']
    for (const p of sunsetPatterns) {
      if (lowerNext.includes(p) && !lowerPrev.includes(p)) {
        return {
          severity: 'breaking',
          notes: `Migration page now flags v1 sunset: "${p}"`,
        }
      }
    }
    // GA promotion (notable, not breaking — v1 still works)
    if (
      lowerNext.includes('general availability') &&
      !lowerPrev.includes('general availability')
    ) {
      return {
        severity: 'notable',
        notes: 'CCTP v2 reached general availability — plan migration',
      }
    }
  }

  // Notable keywords
  for (const kw of NOTABLE_KEYWORDS) {
    if (lowerNext.includes(kw) && !lowerPrev.includes(kw)) {
      return { severity: 'notable', notes: `New keyword: "${kw}"` }
    }
  }

  // Big size change → notable
  const prevLen = prev.length || 1
  const delta = Math.abs(next.length - prevLen) / prevLen
  if (delta > 0.05) {
    return {
      severity: 'notable',
      notes: `${(delta * 100).toFixed(1)}% byte-size change (${prevLen} → ${next.length})`,
    }
  }

  return { severity: 'cosmetic' }
}

export const cctpDocSource: DocSource = {
  id: 'circle-cctp',
  name: 'Circle CCTP',
  targets: () => TARGETS,
  normalize: (rawHtml /* , target */) => normalize(rawHtml),
  classify,
}
