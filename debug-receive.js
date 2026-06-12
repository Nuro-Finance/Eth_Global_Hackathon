require('dotenv').config({path:'/home/nuro/Nuro-Finance/.env'});
const { ethers } = require('ethers');
const BASE_PROVIDER = new ethers.providers.JsonRpcProvider('https://mainnet.base.org');
const PRIVATE_KEY = process.env.PRIVATE_KEY;

async function main() {
  const data = await fetch('https://iris-api.circle.com/v2/messages/3?transactionHash=0x1e7f901f3ebd3855852f14296a20e3f96a1ec97c847e4113688312e91d5eddf6').then(r => r.json());
  const msg = data.messages?.[0];
  console.log('decodedMessage:', JSON.stringify(msg?.decodedMessage, null, 2));

  const transmitter = new ethers.Contract(
    '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
    [
      'function receiveMessage(bytes calldata message, bytes calldata attestation) returns (bool success)',
      'function version() view returns (uint32)',
      'function localDomain() view returns (uint32)',
    ],
    new ethers.providers.JsonRpcProvider('https://mainnet.base.org')
  );

  try { console.log('version:', (await transmitter.version()).toString()) } catch(e) { console.log('version() err:', e.message?.slice(0,80)) }
  try { console.log('localDomain:', (await transmitter.localDomain()).toString()) } catch(e) { console.log('localDomain() err:', e.message?.slice(0,80)) }

  const wallet = new ethers.Wallet(PRIVATE_KEY, BASE_PROVIDER);
  const transmitterW = transmitter.connect(wallet);
  console.log('\ncallStatic.receiveMessage...');
  try {
    const r = await transmitterW.callStatic.receiveMessage(msg.message, msg.attestation, {gasLimit: 400000});
    console.log('Static call SUCCESS:', r);
  } catch(e) {
    console.log('Revert reason:', e.reason);
    console.log('Error data:', e.data);
    console.log('Snippet:', e.message?.slice(0,300));
  }
}
main().catch(console.error);
