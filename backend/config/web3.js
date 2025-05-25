// config/web3.js
const Web3 = require('web3');
const { CONTRACT_ABI } = require('./contractABI');

// Initialize Web3 with the provider URL
const web3 = new Web3(process.env.PROVIDER_URL || 'https://rpc-vanguard.vanarchain.com');

// Contract address - use environment variable or default to our deployed address
const contractAddress = process.env.CONTRACT_ADDRESS || '0x03162D7C415dF0D30f546550Aa81f567a65a19A0';

// Create contract instance
const contract = new web3.eth.Contract(CONTRACT_ABI, contractAddress);

module.exports = {
    web3,
    contract
};