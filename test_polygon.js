const { ethers } = require("ethers")

const OFT_ABI = [
    "function owner() external view returns (address)",
]

const POLYGON_RPCS = [
    "https://polygon.llamarpc.com",
    "https://rpc.ankr.com/polygon",
    "https://polygon.drpc.org",
]

async function main() {
    for (const rpc of POLYGON_RPCS) {
        try {
            const provider = new ethers.providers.JsonRpcProvider(rpc)
            const code = await provider.getCode("0xA150EC8B718C22E12036f916d90FF72af14B3E96")
            if (code === "0x") {
                console.log(`${rpc}: FAIL — no contract`)
                continue
            }
            const contract = new ethers.Contract("0xA150EC8B718C22E12036f916d90FF72af14B3E96", OFT_ABI, provider)
            const owner = await contract.owner()
            console.log(`${rpc}: OK — owner: ${owner}`)
            break
        } catch (e) {
            console.log(`${rpc}: ERROR — ${e.message}`)
        }
    }
}

main()
