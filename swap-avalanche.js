require('dotenv').config({path: '/home/nuro/Nuro-Finance/.env'})
const { ethers } = require('ethers')

const RPC     = process.env.RPC_URL_AVALANCHE
const KEY     = process.env.PRIVATE_KEY
const DEPOSIT = '0x75Aa3B70Cb3885c860246C8d5c5103368a9c45fC'
const ROUTER  = '0xbb00FF08d01D300023C629444BaF1067a88fe0d0' // Uniswap V3 on Avalanche
const WAVAX   = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7'
const USDC    = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E'
const USDC_ABI = ['function balanceOf(address) view returns (uint256)', 'function transfer(address,uint256) returns (bool)']

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(RPC)
  const wallet   = new ethers.Wallet(KEY, provider)
  const bal      = await provider.getBalance(wallet.address)
  console.log('AVAX balance:', ethers.utils.formatEther(bal))

  const swapAmount = ethers.utils.parseEther('0.1') // swap 0.1 AVAX (~$3.50)
  const router = new ethers.Contract(ROUTER, [
    'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256)'
  ], wallet)

  console.log('Swapping 0.1 AVAX → USDC...')
  const tx = await router.exactInputSingle({
    tokenIn: WAVAX, tokenOut: USDC, fee: 500,
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
  console.log('✅ Avalanche test funded')
}
main().catch(console.error)
