const { ethers } = require("ethers")

const OFT_ABI = ["function peers(uint32 eid) external view returns (bytes32)"]

const CHAINS = [
    { name: "Base",      rpc: "https://mainnet.base.org",              address: "0xA150EC8B718C22E12036f916d90FF72af14B3E96", eid: 30184 },
    { name: "Arbitrum",  rpc: "https://arb1.arbitrum.io/rpc",          address: "0xCf06b8A18b49c6b26b11426F8Cd9d697ba714134", eid: 30110 },
    { name: "Optimism",  rpc: "https://mainnet.optimism.io",           address: "0xA150EC8B718C22E12036f916d90FF72af14B3E96", eid: 30111 },
    { name: "Ethereum",  rpc: "https://eth.llamarpc.com",              address: "0x5e82D7AbC315717957FDdBC679fb80abdC325645", eid: 30101 },
    { name: "Polygon",   rpc: "https://polygon.drpc.org",              address: "0xA150EC8B718C22E12036f916d90FF72af14B3E96", eid: 30109 },
    { name: "Avalanche", rpc: "https://api.avax.network/ext/bc/C/rpc", address: "0xA150EC8B718C22E12036f916d90FF72af14B3E96", eid: 30106 },
    { name: "BSC",       rpc: "https://bsc-dataseed.binance.org",      address: "0xa150ec8b718c22e12036f916d90ff72af14b3e96", eid: 30102 },
]

async function main() {
    for (const chain of CHAINS) {
        const provider = new ethers.providers.JsonRpcProvider(chain.rpc)
        const contract = new ethers.Contract(chain.address, OFT_ABI, provider)
        console.log(`\n${chain.name} peers:`)
        for (const peer of CHAINS) {
            if (peer.eid === chain.eid) continue
            try {
                const result = await contract.peers(peer.eid)
                const isSet = result !== ethers.constants.HashZero
                const peerAddr = "0x" + result.slice(26)
                console.log(`  -> ${peer.name} (${peer.eid}): ${isSet ? "SET " + peerAddr : "NOT SET ❌"}`)
            } catch (e) {
                console.log(`  -> ${peer.name}: ERROR — ${e.message}`)
            }
        }
    }
}

main()
