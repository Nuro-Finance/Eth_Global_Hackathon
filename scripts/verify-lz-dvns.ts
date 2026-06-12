#!/usr/bin/env tsx
/**
 * ─── PRE-WIRE DVN VERIFICATION ────────────────────────────────────────────
 *
 * Read-only on-chain sanity check before flipping the LZ_BRIDGE_ENABLED
 * kill-switch. For every DVN address in layerzero.config.hardened.ts:
 *
 *   1. eth_getCode — confirms there's actual contract bytecode (not EOA,
 *      not zero address). Adversary cannot poison docs but cannot deploy
 *      bytecode to a chosen address without owning the corresponding
 *      private key.
 *
 *   2. Bytecode size sanity check — LZ DVN template is ~35,948 bytes on
 *      EVM, ~122,562 bytes on zkSync (different VM). Allow ±2KB
 *      tolerance for compiler/library variance.
 *
 *   3. getFee() call — verifies the contract actually implements the DVN
 *      interface. A random contract at the same address would either
 *      revert or return garbage; a real DVN returns a non-zero fee for a
 *      standard quote request.
 *
 * Output: green/yellow/red status per (chain, role, address) tuple.
 *
 *   PASS  — all 3 checks succeed, safe to wire
 *   WARN  — bytecode size differs from expected by more than 2KB but the
 *           contract still responds to getFee. Operator review required.
 *   FAIL  — no code at address, or getFee revert. DO NOT WIRE.
 *
 * Run locally:
 *   tsx scripts/verify-lz-dvns.ts
 *
 * Run on VPS (preferred — env has all RPCs):
 *   ssh nuro@74.50.109.203 "cd ~/Nuro-Finance && tsx scripts/verify-lz-dvns.ts"
 *
 * Exits 0 on all-pass, 1 on any FAIL. WARN does not block exit.
 */

import { ethers } from 'ethers'

// ─── DVN ADDRESSES (mirror of layerzero.config.hardened.ts DVN_PROPOSED) ──

interface DvnSet {
    lzLabs: string
    nethermind?: string
    googleCloud?: string
    polyhedra?: string
}

// Per-chain DVN sets — ONLY the addresses that the actual wire config in
// layerzero.config.hardened.ts will use. Polyhedra candidates that appear
// in DVN_PROPOSED but are NOT wired (arbitrum, celo, gnosis, bsc) are
// excluded here so we don't waste a verification slot on addresses that
// won't go on-chain.
//
// Cross-reference: each pathway's dvnConfig() call in the hardened config
// determines what addresses end up in the actual ulnConfig.requiredDVNs +
// optionalDVNs.
const DVN_PROPOSED: Record<string, DvnSet> = {
    arbitrum: {
        // arbDvnSet: required [lzLabs], optional [nethermind, googleCloud], threshold 1
        lzLabs:      '0x2f55c492897526677c5b68fb199ea31e2c126416',
        nethermind:  '0x14e570a1684c7ca883b35e1b25d2f7cec98a16cd',
        googleCloud: '0xd56e4eab23cb81f43168f9f45211eb027b9ac7cc',
    },
    zksync: {
        // zksyncDvnSet: required [lzLabs, nethermind], optional [], threshold 0
        // 2-of-2 strict (only 2 DVNs deployed on zkSync)
        lzLabs:      '0x620a9df73d2f1015ea75aea1067227f9013f5c51',
        nethermind:  '0xb183c2b91cf76cad13602b32ada2fd273f19009c',
    },
    scroll: {
        // scrollDvnSet: required [lzLabs], optional [nethermind, polyhedra], threshold 1
        lzLabs:      '0xbe0d08a85eebfcc6eda0a843521f7cbb1180d2e2',
        nethermind:  '0xb212750bc22d26499dabf3ffe2ba1931dc3af3e1',
        polyhedra:   '0x8ddf05f9a5c488b4973897e278b58895bf87cb24',
    },
    celo: {
        // celoDvnSet: required [lzLabs], optional [nethermind, googleCloud], threshold 1
        lzLabs:      '0x75b073994560a5c03cd970414d9170be0c6e5c36',
        nethermind:  '0x6cde6b51d91e9d81b639abb6552e5b1b04d98a0b',
        googleCloud: '0xd56e4eab23cb81f43168f9f45211eb027b9ac7cc',
    },
    gnosis: {
        // gnosisDvnSet: required [lzLabs], optional [nethermind, googleCloud], threshold 1
        lzLabs:      '0x11bb2991882a86dc3e38858d922559a385d506ba',
        nethermind:  '0x7fe673201724925b5c477d4e1a4bd3e954688cf5',
        googleCloud: '0xd56e4eab23cb81f43168f9f45211eb027b9ac7cc',
    },
    bsc: {
        // bscDvnSet: required [lzLabs], optional [nethermind, googleCloud], threshold 1
        lzLabs:      '0xfd6865c841c2d64565562fcc7e05e619a30615f0',
        nethermind:  '0x31f748a368a893bdb5abb67ec95f232507601a73',
        googleCloud: '0xd56e4eab23cb81f43168f9f45211eb027b9ac7cc',
    },
}

// ─── CHAIN METADATA ───────────────────────────────────────────────────────

interface ChainMeta {
    chainId: number
    rpcUrlEnv: string
    rpcUrlFallback: string
    /** Expected DVN bytecode size in bytes (±2KB tolerance) */
    expectedBytecodeSize: number
    /** Destination EID to use in the getFee quote — any valid LZ EID works */
    sampleDstEid: number
}

// Expected DVN bytecode sizes — empirically measured 2026-05-10 from
// the actually-deployed LZ V2 DVN contracts. The 35,948B / 122,562B
// figures from the hardened config header were stale (older template).
// Current EVM DVN bytecode is ~17-20KB; zkSync DVN ~61KB. Tolerance
// widened to ±5KB to accommodate template version variance.
const CHAINS: Record<string, ChainMeta> = {
    arbitrum: {
        chainId: 42161,
        rpcUrlEnv: 'RPC_URL_ARBITRUM',
        rpcUrlFallback: 'https://arb1.arbitrum.io/rpc',
        expectedBytecodeSize: 18000,
        sampleDstEid: 30165, // zkSync — paired with Arbitrum
    },
    zksync: {
        chainId: 324,
        rpcUrlEnv: 'RPC_URL_ZKSYNC',
        rpcUrlFallback: 'https://mainnet.era.zksync.io',
        expectedBytecodeSize: 61280, // zkSync VM is different
        sampleDstEid: 30110, // Arbitrum
    },
    scroll: {
        chainId: 534352,
        rpcUrlEnv: 'RPC_URL_SCROLL',
        rpcUrlFallback: 'https://rpc.scroll.io',
        expectedBytecodeSize: 18000,
        sampleDstEid: 30110,
    },
    celo: {
        chainId: 42220,
        rpcUrlEnv: 'RPC_URL_CELO',
        rpcUrlFallback: 'https://forno.celo.org',
        expectedBytecodeSize: 18000,
        sampleDstEid: 30110,
    },
    gnosis: {
        chainId: 100,
        rpcUrlEnv: 'RPC_URL_GNOSIS',
        rpcUrlFallback: 'https://rpc.gnosischain.com',
        expectedBytecodeSize: 18000,
        sampleDstEid: 30110,
    },
    bsc: {
        chainId: 56,
        rpcUrlEnv: 'RPC_URL_BSC',
        rpcUrlFallback: 'https://bsc-dataseed.binance.org',
        expectedBytecodeSize: 18000,
        sampleDstEid: 30110,
    },
}

// ─── DVN ABI (subset for verification) ────────────────────────────────────

const DVN_ABI = [
    // LZ V2 DVN interface — getFee returns the wei cost to attest
    // a message with the given confirmations to the destination chain.
    'function getFee(uint32 _dstEid, uint64 _confirmations, address _sender, bytes _options) view returns (uint256)',
]

const SAMPLE_CONFIRMATIONS = 15n
const SAMPLE_SENDER = '0x0000000000000000000000000000000000000001' // any address; some DVNs require non-zero
const SAMPLE_OPTIONS = '0x'

// ─── RESULT TYPES ─────────────────────────────────────────────────────────

interface VerificationResult {
    chain: string
    role: string
    address: string
    hasCode: boolean
    codeSizeBytes: number
    expectedSizeBytes: number
    sizeDeltaBytes: number
    feeQuoteWei: string | null
    feeError: string | null
    status: 'PASS' | 'WARN' | 'FAIL'
    notes: string[]
}

// ─── VERIFIER ─────────────────────────────────────────────────────────────

async function verifyDvn(
    provider: ethers.providers.JsonRpcProvider,
    chainName: string,
    role: string,
    address: string,
    meta: ChainMeta,
): Promise<VerificationResult> {
    const notes: string[] = []
    let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS'

    let hasCode = false
    let codeSizeBytes = 0
    let feeQuoteWei: string | null = null
    let feeError: string | null = null

    // Step 1: eth_getCode
    try {
        const code = await provider.getCode(address)
        codeSizeBytes = code === '0x' ? 0 : (code.length - 2) / 2
        hasCode = codeSizeBytes > 0
    } catch (err: any) {
        notes.push(`eth_getCode failed: ${String(err.message).slice(0, 100)}`)
        return {
            chain: chainName, role, address,
            hasCode: false, codeSizeBytes: 0,
            expectedSizeBytes: meta.expectedBytecodeSize,
            sizeDeltaBytes: 0,
            feeQuoteWei: null, feeError: null,
            status: 'FAIL', notes,
        }
    }

    const sizeDelta = codeSizeBytes - meta.expectedBytecodeSize

    if (!hasCode) {
        status = 'FAIL'
        notes.push('NO CONTRACT AT ADDRESS — eth_getCode returned 0x')
    } else if (Math.abs(sizeDelta) > 5120) {
        // >5KB delta from expected is unusual — operator review
        status = 'WARN'
        notes.push(`Bytecode size ${codeSizeBytes}B differs from expected ${meta.expectedBytecodeSize}B by ${sizeDelta > 0 ? '+' : ''}${sizeDelta}B`)
    }

    // Step 2: getFee call — only if contract exists
    if (hasCode) {
        try {
            const dvn = new ethers.Contract(address, DVN_ABI, provider)
            const fee = await dvn.getFee(
                meta.sampleDstEid,
                SAMPLE_CONFIRMATIONS,
                SAMPLE_SENDER,
                SAMPLE_OPTIONS,
            )
            feeQuoteWei = fee.toString()
            if (feeQuoteWei === '0') {
                // A 0 fee is suspicious — most DVNs charge something. Not
                // necessarily a fail, but operator should review.
                notes.push('getFee returned 0 — unusual; operator review recommended')
                if (status === 'PASS') status = 'WARN'
            }
        } catch (err: any) {
            feeError = String(err.message).slice(0, 200)
            // A getFee revert means the contract doesn't implement the
            // DVN interface (or implements an incompatible version).
            // This is a hard fail — DON'T wire a non-DVN contract as
            // a DVN.
            status = 'FAIL'
            notes.push(`getFee() reverted — contract does not implement DVN interface`)
        }
    }

    return {
        chain: chainName, role, address,
        hasCode, codeSizeBytes,
        expectedSizeBytes: meta.expectedBytecodeSize,
        sizeDeltaBytes: sizeDelta,
        feeQuoteWei, feeError,
        status, notes,
    }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────

async function main() {
    const results: VerificationResult[] = []
    const totalDvns = Object.values(DVN_PROPOSED).reduce(
        (sum, set) => sum + Object.keys(set).length,
        0,
    )
    console.log(`\n▸ Verifying ${totalDvns} DVN addresses across ${Object.keys(DVN_PROPOSED).length} chains\n`)

    for (const [chainName, dvnSet] of Object.entries(DVN_PROPOSED)) {
        const meta = CHAINS[chainName]
        if (!meta) {
            console.warn(`⚠ No CHAIN metadata for ${chainName}, skipping`)
            continue
        }
        const rpcUrl = process.env[meta.rpcUrlEnv] || meta.rpcUrlFallback
        console.log(`── ${chainName.toUpperCase()} (chainId=${meta.chainId})`)
        console.log(`   RPC: ${rpcUrl}${process.env[meta.rpcUrlEnv] ? '' : ' (fallback)'}`)

        const provider = new ethers.providers.JsonRpcProvider(rpcUrl)

        for (const [role, address] of Object.entries(dvnSet)) {
            if (!address) continue
            process.stdout.write(`   ${role.padEnd(12)} ${address}  `)
            const result = await verifyDvn(provider, chainName, role, address, meta)
            results.push(result)
            const badge =
                result.status === 'PASS' ? '✅ PASS' :
                result.status === 'WARN' ? '🟡 WARN' :
                '❌ FAIL'
            console.log(`${badge}`)
            if (result.notes.length > 0) {
                for (const note of result.notes) console.log(`     ${note}`)
            }
            if (result.feeQuoteWei !== null) {
                const eth = ethers.utils.formatEther(result.feeQuoteWei)
                console.log(`     getFee(): ${result.feeQuoteWei} wei (${eth} ETH)`)
            }
        }
        console.log()
    }

    // ─── SUMMARY ──────────────────────────────────────────────────────────
    const passed = results.filter(r => r.status === 'PASS').length
    const warned = results.filter(r => r.status === 'WARN').length
    const failed = results.filter(r => r.status === 'FAIL').length

    console.log('═'.repeat(60))
    console.log(`SUMMARY: ${passed} PASS, ${warned} WARN, ${failed} FAIL (${results.length} total)\n`)

    if (failed > 0) {
        console.log('❌ One or more DVN addresses failed verification.')
        console.log('   DO NOT WIRE until all FAILs are resolved.')
        console.log('   Each FAIL means either (a) no contract at the address,')
        console.log('   or (b) contract does not implement DVN interface.\n')
        console.log('   Failing entries:')
        for (const r of results.filter(r => r.status === 'FAIL')) {
            console.log(`     ${r.chain}.${r.role}: ${r.address}`)
            for (const note of r.notes) console.log(`       ↳ ${note}`)
        }
        process.exit(1)
    } else if (warned > 0) {
        console.log('🟡 All addresses have code + implement the DVN interface, but some')
        console.log('   bytecode sizes differ from expected. Operator should review the')
        console.log('   WARN entries (likely a different DVN template/version, not')
        console.log('   necessarily wrong — but worth a second look).\n')
        process.exit(0)
    } else {
        console.log('✅ All DVN addresses verified — safe to proceed with dry-run wire.')
        console.log('\n   Next step:')
        console.log('     pnpm hardhat lz:oapp:wire --oapp-config layerzero.config.hardened.ts --dry-run')
        console.log('   Eyeball the diff, then drop --dry-run to wire for real.\n')
        process.exit(0)
    }
}

main().catch((err) => {
    console.error('\n❌ Verification script crashed:', err)
    process.exit(2)
})
