import { ethers } from "ethers";
const CHAINS = [
  { chainId: 42161, eid: 30110, name: "Arbitrum",  adapter: "0xd58C1412e50fF00212770B170D86e2387D2d2b18", rpc: "https://arb1.arbitrum.io/rpc" },
  { chainId: 324,   eid: 30165, name: "zkSync Era", adapter: "0xA150EC8B718C22E12036f916d90FF72af14B3E96", rpc: "https://mainnet.era.zksync.io" },
  { chainId: 534352,eid: 30214, name: "Scroll",     adapter: "0xA150EC8B718C22E12036f916d90FF72af14B3E96", rpc: "https://rpc.scroll.io" },
  { chainId: 42220, eid: 30125, name: "Celo",       adapter: "0xA150EC8B718C22E12036f916d90FF72af14B3E96", rpc: "https://forno.celo.org" },
  { chainId: 100,   eid: 30145, name: "Gnosis",     adapter: "0xA150EC8B718C22E12036f916d90FF72af14B3E96", rpc: "https://rpc.gnosischain.com" },
  { chainId: 56,    eid: 30102, name: "BSC",        adapter: "0xce4c2270890267aC860fdc72b6946359d0898675", rpc: "https://bsc-dataseed.binance.org" },
] as const;
const REQUIRED: [number,number][] = [
  [324,42161],[534352,42161],[42220,42161],[100,42161],[56,42161],
  [42161,324],[42161,534352],[42161,42220],[42161,100],[42161,56],
];
const ABI = [
  "function peers(uint32 eid) view returns (bytes32)",
  "function setPeer(uint32 eid, bytes32 peer) external",
  "function owner() view returns (address)",
];
const ZERO = "0x" + "0".repeat(64);
function byId(id: number) {
  const c = (CHAINS as any[]).find((c: any) => c.chainId === id);
  if (!c) throw new Error("Unknown chain " + id);
  return c;
}
function toB32(addr: string) { return "0x" + "0".repeat(24) + addr.slice(2).toLowerCase(); }

async function audit() {
  console.log("\n== PEER AUDIT ==\n");
  const results: any[] = [];
  for (const [fId, tId] of REQUIRED) {
    const f = byId(fId), t = byId(tId);
    const provider = new ethers.providers.JsonRpcProvider(f.rpc);
    const a = new ethers.Contract(f.adapter, ABI, provider);
    let cur = ZERO;
    try { cur = await a.peers(t.eid); } catch (e: any) { console.error("  RPC error " + f.name + ": " + e.message); }
    const exp = toB32(t.adapter);
    const ok = cur.toLowerCase() === exp.toLowerCase();
    const icon = ok ? "OK" : cur !== ZERO ? "WRONG" : "MISSING";
    console.log("  [" + icon + "]  " + f.name + " -> peers(" + t.eid + " " + t.name + ")");
    if (!ok && cur !== ZERO) { console.log("       got:  " + cur); console.log("       want: " + exp); }
    results.push({ f, t, cur, ok });
  }
  const bad = results.filter(r => !r.ok);
  console.log("\n  " + (results.length - bad.length) + "/" + results.length + " peers set correctly");
  if (bad.length === 0) console.log("  ALL PEERS WIRED - nothing to deploy\n");
  else console.log("  " + bad.length + " setPeer() call(s) needed\n");
  return results;
}

async function deployPeers(auditResults: any[], pk: string) {
  console.log("\n== DEPLOY MISSING PEERS ==\n");
  const missing = auditResults.filter(r => !r.ok);
  if (!missing.length) { console.log("  Nothing to do.\n"); return; }
  const byChain = new Map<number, any[]>();
  for (const r of missing) { const a = byChain.get(r.f.chainId) ?? []; a.push(r); byChain.set(r.f.chainId, a); }
  for (const [cId, peers] of byChain) {
    const chain = byId(cId);
    console.log("\n  -- " + chain.name + " (" + peers.length + " call(s)) --");
    const provider = new ethers.providers.JsonRpcProvider(chain.rpc);
    const wallet = new ethers.Wallet(pk, provider);
    const adapter = new ethers.Contract(chain.adapter, ABI, wallet);
    let owner: string;
    try { owner = await adapter.owner(); } catch (e: any) { console.error("  owner() failed: " + e.message); continue; }
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      console.error("  SKIP - wallet " + wallet.address + " is NOT owner (owner=" + owner + ")"); continue;
    }
    for (const r of peers) {
      const b32 = toB32(r.t.adapter);
      console.log("  -> setPeer(" + r.t.eid + ", " + b32 + ")  [-> " + r.t.name + "]");
      try {
        let gasLimit = ethers.BigNumber.from(200000);
        try { const est = await adapter.estimateGas.setPeer(r.t.eid, b32); gasLimit = est.mul(120).div(100); } catch {}
        const feeData = await provider.getFeeData();
        const overrides: any = { gasLimit };
        if (feeData.maxFeePerGas) { overrides.maxFeePerGas = feeData.maxFeePerGas; overrides.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas; }
        else if (feeData.gasPrice) overrides.gasPrice = feeData.gasPrice;
        const tx = await adapter.setPeer(r.t.eid, b32, overrides);
        console.log("     tx: " + tx.hash + " - waiting...");
        const rc = await tx.wait(1);
        console.log("     " + (rc.status === 1 ? "CONFIRMED" : "FAILED") + "  block " + rc.blockNumber + "  gas " + rc.gasUsed.toString());
      } catch (e: any) { console.error("  FAILED: " + e.message); }
    }
  }
}

async function main() {
  const deployMode = process.argv.includes("--deploy");
  console.log("\n  LZ Peer Wiring | mode: " + (deployMode ? "AUDIT+DEPLOY" : "AUDIT ONLY"));
  const results = await audit();
  if (!deployMode) { console.log("  Re-run with --deploy and PRIVATE_KEY=0x... to send txs\n"); return; }
  let pk = process.env.PRIVATE_KEY;
  if (!pk) {
    try { const fs = require("fs"); const env = fs.readFileSync(".env", "utf8"); const m = env.match(/PRIVATE_KEY\s*=\s*["'']?(\S+?)["'']?\s*$/m); if (m) pk = m[1]; } catch {}
  }
  if (!pk) { console.error("\n  ERROR: PRIVATE_KEY not set.\n  Usage: PRIVATE_KEY=0x... npx ts-node lz-set-peers.ts --deploy\n"); process.exit(1); }
  const w = new ethers.Wallet(pk);
  console.log("  Deployer: " + w.address);
  await deployPeers(results, pk);
  console.log("\n== RE-AUDIT ==");
  const final = await audit();
  if (final.filter(r => !r.ok).length > 0) { console.error("  STILL MISSING peers"); process.exit(1); }
  else console.log("  ALL 10 BIDIRECTIONAL PEERS CONFIRMED LIVE\n");
}
main().catch(e => { console.error("Fatal:", e); process.exit(1); });
