const { ethers } = require('ethers');
require('dotenv').config();
const { CONTRACT_ABI } = require('../config/contractABI');

let provider;
let signer;

const initialize = async () => {
    try {
        provider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_URL || 'https://rpc-vanguard.vanarchain.com');
        await provider.ready;
        console.log('Provider initialized with network:', await provider.getNetwork());
        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey) {
            throw new Error('Private key not found in environment variables');
        }
        signer = new ethers.Wallet(privateKey, provider);
        console.log('Signer initialized with address:', signer.address);
        return true;
    } catch (error) {
        console.error('Failed to initialize contract utilities:', error);
        throw error;
    }
};

// Helper to get a contract instance at a specific address
const getContractInstance = (address) => {
    if (!signer) throw new Error('Signer not initialized');
    return new ethers.Contract(address, CONTRACT_ABI, signer);
};

const getContractState = async (contractAddress, contractId) => {
    try {
        if (!signer) {
            throw new Error('Signer not initialized. Call initialize() first.');
        }
        if (!contractAddress) {
            throw new Error('No contract address provided');
        }
        const contract = getContractInstance(contractAddress);
        let id;
        if (typeof contractId === 'string' && contractId.length === 24) {
            const Contract = require('../models/Contract');
            const contractDoc = await Contract.findById(contractId);
            if (!contractDoc) return null;
            if (!contractDoc.contractId) return null;
            id = contractDoc.contractId;
        } else {
            try {
                id = parseInt(contractId, 10);
                if (isNaN(id)) return null;
            } catch (e) {
                return null;
            }
        }
        if (!Number.isInteger(id) || id < 0) return null;
        try {
            const state = await contract.getContract(id);
            if (!state || !state.client || !state.freelancer) return null;
            return {
                client: state.client,
                freelancer: state.freelancer,
                bidAmount: ethers.utils.formatEther(state.bidAmount),
                deadline: new Date(state.deadline.toNumber() * 1000),
                jobTitle: state.jobTitle,
                jobDescription: state.jobDescription,
                status: ['Created', 'ClientSigned', 'FreelancerSigned', 'WorkSubmitted', 'Completed', 'Disputed'][state.status],
                workSubmissionHash: state.workSubmissionHash,
                fundsDeposited: ethers.utils.formatEther(state.fundsDeposited)
            };
        } catch (err) {
            if (err.message && err.message.includes('panic code 50')) return null;
            throw err;
        }
    } catch (error) {
        console.error('[getContractState] Error:', error);
        return null;
    }
};

const signContract = async (contractAddress, contractId) => {
    try {
        if (!signer) throw new Error('Signer not initialized. Call initialize() first.');
        if (!contractAddress) throw new Error('No contract address provided');
        const contract = getContractInstance(contractAddress);
        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        if (isNaN(id)) throw new Error('Invalid contractId for signContract');
        const tx = await contract.signContract(id);
        await tx.wait();
        return true;
    } catch (error) {
        console.error('Error signing contract:', error);
        throw error;
    }
};

const depositFunds = async (contractAddress, contractId, amount) => {
    try {
        if (!signer) throw new Error('Signer not initialized. Call initialize() first.');
        if (!contractAddress) throw new Error('No contract address provided');
        const contract = getContractInstance(contractAddress);
        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        const amountWei = ethers.utils.parseEther(amount.toString());
        const tx = await contract.depositFunds(id, { value: amountWei });
        await tx.wait();
        return true;
    } catch (error) {
        console.error('Error depositing funds:', error);
        throw error;
    }
};

const submitWork = async (contractAddress, contractId, workHash) => {
    try {
        if (!signer) throw new Error('Signer not initialized. Call initialize() first.');
        if (!contractAddress) throw new Error('No contract address provided');
        const contract = getContractInstance(contractAddress);
        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        const tx = await contract.submitWork(id, workHash);
        await tx.wait();
        return true;
    } catch (error) {
        console.error('Error submitting work:', error);
        throw error;
    }
};

const approveWork = async (contractAddress, contractId) => {
    try {
        if (!signer) throw new Error('Signer not initialized. Call initialize() first.');
        if (!contractAddress) throw new Error('No contract address provided');
        const contract = getContractInstance(contractAddress);
        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        const tx = await contract.approveWork(id);
        await tx.wait();
        return true;
    } catch (error) {
        console.error('Error approving work:', error);
        throw error;
    }
};

const raiseDispute = async (contractAddress, contractId) => {
    try {
        if (!signer) throw new Error('Signer not initialized. Call initialize() first.');
        if (!contractAddress) throw new Error('No contract address provided');
        const contract = getContractInstance(contractAddress);
        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        const disputeFee = await contract.disputeFee();
        const tx = await contract.raiseDispute(id, { value: disputeFee });
        await tx.wait();
        return true;
    } catch (error) {
        console.error('Error raising dispute:', error);
        throw error;
    }
};

module.exports = {
    initialize,
    getContractState,
    signContract,
    depositFunds,
    submitWork,
    approveWork,
    raiseDispute
};