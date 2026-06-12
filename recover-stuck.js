const { ethers } = require('ethers')
require('dotenv').config({path: '/home/nuro/Nuro-Finance/.env'})

const BASE_PROVIDER  = new ethers.providers.JsonRpcProvider('https://mainnet.base.org')
const ARB_PROVIDER   = new ethers.providers.JsonRpcProvider('https://arb1.arbitrum.io/rpc')
const ETH_PROVIDER   = new ethers.providers.JsonRpcProvider('https://eth.llamarpc.com')
const BASE_MSG_TRANSMITTER = '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64'
const PRIVATE_KEY = process.env.PRIVATE_KEY

async function recoverBurn(txHash, sourceDomain, label) {
  console.log(`\n=== Recovering ${label} ===`)

  const irisUrl = `https://iris-api.circle.com/v2/messages/${sourceDomain}?transactionHash=${txHash}`
  console.log('Fetching from Iris...')
  const data = await fetch(irisUrl).then(r => r.json())
  const msg = data.messages?.[0]
  if (!msg) { console.log('No message found:', JSON.stringify(data)); return }
  if (!msg.attestation || msg.attestation === 'PENDING') {
    console.log('Attestation PENDING, status:', msg.status); return
  }
  console.log('Status:', msg.status, '| cctpVersion:', msg.cctpVersion)
  console.log('Message from Iris length:', msg.message?.length)
  console.log('Attestation obtained ✓')

  const wallet = new ethers.Wallet(PRIVATE_KEY, BASE_PROVIDER)
  const bal = await BASE_PROVIDER.getBalance(wallet.address)
  console.log('Relay wallet:', wallet.address, '| ETH on Base:', ethers.utils.formatEther(bal))

  const transmitter = new ethers.Contract(
    BASE_MSG_TRANSMITTER,
    ['function receiveMessage(bytes calldata message, bytes calldata attestation) returns (bool success)'],
    wallet
  )

  // Use msg.message from Iris (has correct finalityThresholdExecuted)
  console.log('Calling receiveMessage on Base...')
  const tx = await transmitter.receiveMessage(msg.message, msg.attestation, { gasLimit: 400000 })
  console.log('Mint tx:', tx.hash)
  const rec = await tx.wait()
  console.log('Result:', rec.status === 1 ? '✅ SUCCESS' : '❌ FAILED')
  return tx.hash
}

async function main() {
  if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY not set')

  await recoverBurn(
    '0x1e7f901f3ebd3855852f14296a20e3f96a1ec97c847e4113688312e91d5eddf6',
    3, 'Arbitrum 0.39 USDC → Base'
  )
  await recoverBurn(
    '0xd3b5da08692eff08050b97f1a962c9a70d63ed41b7e8aa6b28f47575721d4b18',
    0, 'Ethereum 3.78 USDC → Base'
  )
}
main().catch(console.error)
