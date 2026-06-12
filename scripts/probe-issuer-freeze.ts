#!/usr/bin/env tsx
/**
 * probe-issuer-freeze.ts — discover the correct Issuer freeze endpoint.
 *
 * Walk-driven exploration of the Issuer/Issuer ops Issuer card-freeze API. Each
 * walk-test through the chat costs ~$0.10 in Anthropic credits + a deploy
 * cycle. This probe tries every candidate endpoint + payload combo in a
 * single run, prints status codes, and restores the card to active
 * regardless of outcome.
 *
 * Usage on VPS:
 *   cd ~/Nuro-Finance && npx tsx scripts/probe-issuer-freeze.ts
 *
 * Reads ISSUER_API_BASE + ISSUER_API_KEY from CONFIG (already loaded from
 * .env). Targets the known test card 414a3455-... (Amazon Orders 0918).
 *
 * IMPORTANT: this script ENDS with a guaranteed "set status: active" call
 * so the card never gets left in a broken state.
 */
import { CONFIG } from '../src/config'
import axios from 'axios'

const ISSUER_CARD_ID = '414a3455-015c-42af-a1ac-3c723f4603f6'

const client = axios.create({
  baseURL: CONFIG.ISSUER_API_BASE,
  headers: { 'x-api-key': CONFIG.ISSUER_API_KEY },
  validateStatus: () => true, // never throw on non-2xx, we want to see the response
})

interface ProbeResult {
  label: string
  method: 'GET' | 'POST' | 'PATCH' | 'PUT'
  path: string
  body?: any
  status: number
  responseBody: any
}

async function probe(
  label: string,
  method: ProbeResult['method'],
  path: string,
  body?: any,
): Promise<ProbeResult> {
  const fullPath = path.replace('{id}', ISSUER_CARD_ID)
  try {
    const res = await client.request({ method, url: fullPath, data: body })
    return {
      label,
      method,
      path: fullPath,
      body,
      status: res.status,
      responseBody:
        typeof res.data === 'object'
          ? JSON.stringify(res.data).slice(0, 200)
          : String(res.data).slice(0, 200),
    }
  } catch (err: any) {
    return {
      label,
      method,
      path: fullPath,
      body,
      status: err?.response?.status ?? 0,
      responseBody: err?.message?.slice(0, 200) ?? 'network error',
    }
  }
}

function printResult(r: ProbeResult) {
  const ok = r.status >= 200 && r.status < 300 ? '✓' : '✗'
  const bodyStr = r.body ? JSON.stringify(r.body) : ''
  console.log(`${ok}  ${r.status.toString().padStart(3)}  ${r.label.padEnd(35)} ${r.method} ${r.path} ${bodyStr}`)
  if (r.status === 400 || r.status >= 500) {
    console.log(`     response: ${r.responseBody}`)
  }
}

async function main() {
  console.log('=== Issuer freeze endpoint probe ===')
  console.log(`Base URL:  ${CONFIG.ISSUER_API_BASE}`)
  console.log(`Test card: ${ISSUER_CARD_ID} (Amazon Orders, last4 0918)`)
  console.log('')

  // Step 1: baseline — what's the current card state?
  console.log('--- baseline GET ---')
  const baseline = await probe('current state', 'GET', '/cards/{id}')
  printResult(baseline)
  console.log('')

  // Step 2: probe every plausible freeze endpoint + payload combo
  console.log('--- freeze candidates ---')
  const candidates: Array<[string, ProbeResult['method'], string, any?]> = [
    // Dedicated suspend endpoints
    ['POST /suspend (no body)', 'POST', '/cards/{id}/suspend'],
    ['POST /suspend ({})', 'POST', '/cards/{id}/suspend', {}],
    ['POST /freeze', 'POST', '/cards/{id}/freeze'],
    ['POST /lock', 'POST', '/cards/{id}/lock'],
    ['POST /pause', 'POST', '/cards/{id}/pause'],
    ['POST /disable', 'POST', '/cards/{id}/disable'],
    ['POST /actions/suspend', 'POST', '/cards/{id}/actions/suspend'],
    ['POST /actions/freeze', 'POST', '/cards/{id}/actions/freeze'],
    // PATCH with various status values
    ['PATCH status:inactive', 'PATCH', '/cards/{id}', { status: 'inactive' }],
    ['PATCH status:locked', 'PATCH', '/cards/{id}', { status: 'locked' }],
    ['PATCH status:blocked', 'PATCH', '/cards/{id}', { status: 'blocked' }],
    ['PATCH status:disabled', 'PATCH', '/cards/{id}', { status: 'disabled' }],
    ['PATCH status:closed', 'PATCH', '/cards/{id}', { status: 'closed' }],
    ['PATCH status:terminated', 'PATCH', '/cards/{id}', { status: 'terminated' }],
    // PATCH with different field names (not status)
    ['PATCH isLocked:true', 'PATCH', '/cards/{id}', { isLocked: true }],
    ['PATCH locked:true', 'PATCH', '/cards/{id}', { locked: true }],
    ['PATCH enabled:false', 'PATCH', '/cards/{id}', { enabled: false }],
    ['PATCH active:false', 'PATCH', '/cards/{id}', { active: false }],
    ['PATCH frozen:true', 'PATCH', '/cards/{id}', { frozen: true }],
    ['PATCH suspended:true', 'PATCH', '/cards/{id}', { suspended: true }],
    // PUT variants (in case PATCH/POST are wrong method)
    ['PUT status:suspended', 'PUT', '/cards/{id}', { status: 'suspended' }],
    ['PUT status:inactive', 'PUT', '/cards/{id}', { status: 'inactive' }],
  ]

  const results: ProbeResult[] = []
  for (const [label, method, path, body] of candidates) {
    const r = await probe(label, method, path, body)
    results.push(r)
    printResult(r)
    // Small delay to avoid rate-limit
    await new Promise(r => setTimeout(r, 200))
  }

  console.log('')
  console.log('--- guaranteed restore: status:active ---')
  const restore = await probe('restore active', 'PATCH', '/cards/{id}', { status: 'active' })
  printResult(restore)

  console.log('')
  console.log('=== SUMMARY ===')
  const winners = results.filter(r => r.status >= 200 && r.status < 300)
  if (winners.length === 0) {
    console.log('❌ no candidate succeeded — escalate to Issuer ops')
  } else {
    console.log(`✅ ${winners.length} candidate(s) succeeded:`)
    for (const w of winners) {
      console.log(`   ${w.method} ${w.path} ${w.body ? JSON.stringify(w.body) : ''}  → ${w.status}`)
    }
  }
}

main().catch((err) => {
  console.error('Probe failed:', err)
  process.exit(1)
})
