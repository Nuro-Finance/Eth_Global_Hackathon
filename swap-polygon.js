require('dotenv').config({path: '/home/nuro/Nuro-Finance/.env'})
const { ethers } = require('ethers')

const RPC      = process.env.RPC_URL_POLYGON
const KEY      = process.env.PRIVATE_KEY
const DEPOSIT  = '0x75Aa3B70Cb3885c860246C8d5c5103368a9c45fC'
const ROUTER   = '0xE592427A0AEce92De3Edee1F18E0157C05861564' // Uniswap V3 SwapRouter
const WMATIC   = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'
const USDC     = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
const USDC_ABI = ['function balanceOf(address) view returns (uint256)', 'function transfer(address,uint256) returns (bool)']

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(RPC)
  const wallet   = new ethers.Wallet(KEY, provider)
  const bal      = await provider.getBalance(wallet.address)
  console.log('MATIC balance:', ethers.utils.formatEther(bal))

  const swapAmount = ethers.utils.parseEther('3') // swap 3 MATIC
  const router = new ethers.Contract(ROUTER, [
    'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256)'
  ], wallet)

  console.log('Swapping 3 MATIC → USDC...')
  const tx = await router.exactInputSingle({
    tokenIn: WMATIC, tokenOut: USDC, fee: 500,
    recipient: wallet.address,
    deadline: Math.floor(Date.now()/1000) + 300,
    amountIn: swapAmount, amountOutMinimum: 0, sqrtPriceLimitX96: 0
  }, { value: swapAmount, gasLimit: 300000 })
  await tx.wait()
  console.log('Swap tx:', tx.hash)

  const usdc = new ethers.Contract(USDC, USDC_ABI, wallet)
  const usdcBal = await usdc.balanceOf(wallet.address)
  console.log('USDC received:', ethers.utils.formatUnits(usdcBal, 6))

  console.log('Sending all USDC to deposit address...')
  const sendTx = await usdc.transfer(DEPOSIT, usdcBal, { gasLimit: 100000 })
  await sendTx.wait()
  console.log('Send tx:', sendTx.hash)
  console.log('✅ Polygon test funded')
}
main().catch(console.error)
