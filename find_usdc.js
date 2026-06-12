const {ethers} = require('ethers')
const p = new ethers.providers.JsonRpcProvider('https://rpc.hyperliquid.xyz/evm')

const ERC20_ABI = ['function symbol() view returns (string)', 'function decimals() view returns (uint8)']

// Known HyperEVM token candidates for USDC
const candidates = [
  '0x2Ee8670d2B936985D5fb1EE968810c155D3bB9A2', // USDC bridged
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // mainnet USDC (wrong chain)
  '0x9d8e1e49bbf27b861c5f9f32c97e498d0e20e6d5',
  '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT arb
  '0x0d1e753a25ebda689453309112904807625befbe', // purported HyperEVM USDC
]

;(async () => {
  for (const addr of candidates) {
    try {
      const c = new ethers.Contract(addr, ERC20_ABI, p)
      const sym = await c.symbol()
      const dec = await c.decimals()
      console.log(addr, sym, dec)
    } catch(e) {
      console.log(addr, 'NOT ERC20 or no code')
    }
  }
})()
