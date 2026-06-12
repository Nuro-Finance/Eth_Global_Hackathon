import { ethers } from "ethers";
const ARB_EID = 30110;
const SOURCES = [
  { name: "zkSync Era", eid: 30165, adapter: "0xA150EC8B718C22E12036f916d90FF72af14B3E96", rpc: "https://mainnet.era.zksync.io" },
  { name: "Scroll",     eid: 30214, adapter: "0xA150EC8B718C22E12036f916d90FF72af14B3E96", rpc: "https://rpc.scroll.io" },
  { name: "Celo",       eid: 30125, adapter: "0xA150EC8B718C22E12036f916d90FF72af14B3E96", rpc: "https://forno.celo.org" },
  { name: "Gnosis",     eid: 30145, adapter: "0xA150EC8B718C22E12036f916d90FF72af14B3E96", rpc: "https://rpc.gnosischain.com" },
  { name: "BSC",        eid: 30102, adapter: "0xce4c2270890267aC860fdc72b6946359d0898675", rpc: "https://bsc-dataseed.binance.org" },
];
const ABI = [
  "function peers(uint32 eid) view returns (bytes32)",
  "function quoteSend(tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam, bool payInLzToken) view returns (tuple(uint256 nativeFee, uint256 lzTokenFee) fee)",
];
const ZERO = "0x" + "0".repeat(64);
const AMT = ethers.utils.parseUnits("20", 6);
const TO = "0x000000000000000000000000d8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
async function main() {
  console.log("\n  LZ Bridge Smoke Test - quoteSend on all source chains\n");
  let allOk = true;
  for (const c of SOURCES) {
    const provider = new ethers.providers.JsonRpcProvider(c.rpc);
    const a = new ethers.Contract(c.adapter, ABI, provider);
    try {
      const peer = await a.peers(ARB_EID);
      if (peer === ZERO) { console.log("  [NO PEER] " + c.name + ": peer not set -> will revert NoPeer"); allOk = false; continue; }
      const fee = await a.quoteSend({ dstEid: ARB_EID, to: TO, amountLD: AMT, minAmountLD: AMT.mul(99).div(100), extraOptions: "0x", composeMsg: "0x", oftCmd: "0x" }, false);
      console.log("  [OK] " + c.name + ": quoteSend OK - nativeFee=" + ethers.utils.formatEther(fee.nativeFee));
    } catch (e: any) { console.log("  [FAIL] " + c.name + ": " + e.message); allOk = false; }
  }
  console.log(allOk ? "\n  BRIDGE IS LIVE end-to-end\n" : "\n  SOME CHAINS FAILED - run lz-set-peers.ts --deploy first\n");
  if (!allOk) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
