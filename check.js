require('dotenv').config();
const { ethers } = require('ethers');
const p = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_ARBITRUM);

p.getTransaction('0x9885530a5a2c9f5668600e724aa0b404375364d2438fb8964c5bbbce7ad12390')
    .then(tx => {
        if (tx === null) {
            console.log('Transaction NOT FOUND - dropped from mempool');
        } else {
            console.log('Tx found, blockNumber:', tx.blockNumber, 'nonce:', tx.nonce);
        }
    });

p.getTransactionCount('0x75Aa3B70Cb3885c860246C8d5c5103368a9c45fC')
    .then(n => console.log('Nonce confirmed:', n));

p.getTransactionCount('0x75Aa3B70Cb3885c860246C8d5c5103368a9c45fC', 'pending')
    .then(n => console.log('Nonce pending:', n));

const usdc = new ethers.Contract('0xaf88d065e77c8cC2239327C5EDb3A432268e5831', ['function balanceOf(address) view returns (uint256)'], p);
usdc.balanceOf('0x75Aa3B70Cb3885c860246C8d5c5103368a9c45fC')
    .then(b => console.log('Deposit USDC remaining:', ethers.utils.formatUnits(b, 6)));
