require('dotenv').config({path:'/home/nuro/Nuro-Finance/.env'});
const { ethers } = require('ethers');
async function main() {
  const data = await fetch('https://iris-api.circle.com/v2/messages/0?transactionHash=0xd3b5da08692eff08050b97f1a962c9a70d63ed41b7e8aa6b28f47575721d4b18').then(r => r.json());
  const msg = data.messages?.[0];
  console.log('status:', msg?.status);
  console.log('finalityThresholdExecuted:', msg?.decodedMessage?.finalityThresholdExecuted);
  console.log('mintRecipient:', msg?.decodedMessage?.decodedMessageBody?.mintRecipient);
  console.log('amount:', msg?.decodedMessage?.decodedMessageBody?.amount);

  if (!msg?.message || !msg?.attestation || msg.attestation === 'PENDING') {
    console.log('Not ready yet'); return;
  }

  const transmitter = new ethers.Contract(
    '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
    ['function receiveMessage(bytes calldata message, bytes calldata attestation) returns (bool success)'],
    new ethers.providers.JsonRpcProvider('https://mainnet.base.org')
  );
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, new ethers.providers.JsonRpcProvider('https://mainnet.base.org'));
  try {
    await transmitter.connect(wallet).callStatic.receiveMessage(msg.message, msg.attestation, {gasLimit: 400000});
    console.log('callStatic: SUCCESS — not yet relayed, sending tx...');
    const tx = await transmitter.connect(wallet).receiveMessage(msg.message, msg.attestation, {gasLimit: 400000});
    const rec = await tx.wait();
    console.log('Mint tx:', tx.hash, '| status:', rec.status === 1 ? '✅' : '❌');
  } catch(e) {
    if (e.reason === 'Nonce already used') {
      console.log('✅ Already relayed by Circle — USDC at Owen');
    } else {
      console.log('Other error:', e.reason || e.message?.slice(0,150));
    }
  }
}
main().catch(console.error);
