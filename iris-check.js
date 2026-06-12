require('dotenv').config({path:'/home/nuro/Nuro-Finance/.env'});
async function main() {
  const url = 'https://iris-api.circle.com/v2/messages/3?transactionHash=0x1e7f901f3ebd3855852f14296a20e3f96a1ec97c847e4113688312e91d5eddf6';
  const d = await fetch(url).then(r => r.json());
  const msg = d.messages?.[0];
  console.log('status:', msg?.status);
  console.log('has attestation:', !!msg?.attestation);
  console.log('has message field:', !!msg?.message);
  console.log('message field length:', msg?.message?.length);
  if (msg?.message) console.log('message prefix:', msg.message.slice(0, 80));
  console.log('full keys:', Object.keys(msg || {}));
}
main().catch(console.error);
