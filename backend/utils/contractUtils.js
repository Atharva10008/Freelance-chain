const { ethers } = require('ethers');
require('dotenv').config();
const { CONTRACT_ABI } = require('../config/contractABI');
const JobContractAddress = process.env.CONTRACT_ADDRESS || '0x960Ea62774d166FF796415451ca4410a3A8693eb';

// Network configuration for Vanguard
const vanguardNetwork = {
    name: 'Vanguard',
    chainId: 78600,
    ensAddress: null
};

let provider;
let contract;

// Helper function to validate addresses
const validateAddress = (address) => {
    if (!ethers.utils.isAddress(address)) {
        throw new Error(`Invalid address: ${address}`);
    }
    return ethers.utils.getAddress(address); // Normalize to checksum address
};

const initialize = async () => {
    try {
        // Initialize provider with explicit network configuration
        provider = new ethers.providers.JsonRpcProvider({
            url: process.env.PROVIDER_URL || 'https://rpc-vanguard.vanarchain.com',
            ...vanguardNetwork
        });
        
        await provider.ready;
        console.log('Provider initialized with network:', await provider.getNetwork());
        
        contract = new ethers.Contract(JobContractAddress, CONTRACT_ABI, provider);
        console.log('Contract initialized at address:', JobContractAddress);
        
        return true;
    } catch (error) {
        console.error('Failed to initialize contract utilities:', error);
        throw error;
    }
};

const createContract = async (contractData, signer) => {
    try {
        if (!contract) throw new Error('Contract not initialized');
        if (!signer) throw new Error('Signer required');

        // Validate and normalize addresses
        const freelancerAddress = validateAddress(contractData.freelancerAddress);
        const signerAddress = validateAddress(await signer.getAddress());

        const tx = await contract.connect(signer).createContract(
            freelancerAddress,
            ethers.utils.parseEther(contractData.bidAmount.toString()),
            Math.floor(new Date(contractData.deadline).getTime() / 1000),
            contractData.jobTitle,
            contractData.jobDescription
        );

        const receipt = await tx.wait();
        const event = receipt.events?.find(e => e.event === 'ContractCreated');

        if (!event) throw new Error('ContractCreated event missing');

        return {
            address: JobContractAddress,
            contractId: event.args.contractId.toString(),
            transactionHash: tx.hash
        };
    } catch (error) {
        console.error('Create contract error:', error);
        throw error;
    }
};

const clientSignAndDeposit = async (contractId, signer) => {
    try {
        if (!contract) throw new Error('Contract not initialized');
        if (!signer) throw new Error('Signer required');

        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        if (isNaN(id)) throw new Error('Invalid contractId');

        console.log('Client signing and depositing funds for contract ID:', id);

        const tx = await contract.connect(signer).clientSignAndDeposit(id, {
            value: ethers.utils.parseEther(contractData.bidAmount.toString())
        });
        const receipt = await tx.wait();
        console.log('Client signed and deposited funds successfully:', receipt.transactionHash);
        return true;
    } catch (error) {
        console.error('Error in client sign and deposit:', error);
        throw error;
    }
};

const freelancerSign = async (contractId, signer) => {
    try {
        if (!contract) throw new Error('Contract not initialized');
        if (!signer) throw new Error('Signer required');

        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        if (isNaN(id)) throw new Error('Invalid contractId');

        console.log('Freelancer signing contract ID:', id);

        const tx = await contract.connect(signer).freelancerSign(id);
        const receipt = await tx.wait();
        console.log('Freelancer signed successfully:', receipt.transactionHash);
        return true;
    } catch (error) {
        console.error('Error in freelancer sign:', error);
        throw error;
    }
};

const submitWork = async (contractId, workHash, signer) => {
    try {
        if (!contract) throw new Error('Contract not initialized');
        if (!signer) throw new Error('Signer required');

        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        if (isNaN(id)) throw new Error('Invalid contractId');

        console.log('Submitting work for contract ID:', id);
        const tx = await contract.connect(signer).submitWork(id, workHash);
        
        console.log('Waiting for transaction confirmation...');
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            console.log('Work submitted successfully:', receipt.transactionHash);
            return true;
        } else {
            throw new Error('Transaction failed');
        }
    } catch (error) {
        console.error('Error submitting work:', error);
        throw error;
    }
};

const approveWork = async (contractId, signer) => {
    try {
        if (!contract) throw new Error('Contract not initialized');
        if (!signer) throw new Error('Signer required');

        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        if (isNaN(id)) throw new Error('Invalid contractId');

        console.log('Approving work for contract ID:', id);
        const tx = await contract.connect(signer).approveWork(id);
        
        console.log('Waiting for transaction confirmation...');
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            console.log('Work approved successfully:', receipt.transactionHash);
            return true;
        } else {
            throw new Error('Transaction failed');
        }
    } catch (error) {
        console.error('Error approving work:', error);
        throw error;
    }
};

const rejectWork = async (contractId, reason, signer) => {
    try {
        if (!contract) throw new Error('Contract not initialized');
        if (!signer) throw new Error('Signer required');

        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        if (isNaN(id)) throw new Error('Invalid contractId');

        console.log('Rejecting work for contract ID:', id);
        const tx = await contract.connect(signer).rejectWork(id, reason);
        
        console.log('Waiting for transaction confirmation...');
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            console.log('Work rejected successfully:', receipt.transactionHash);
            return true;
        } else {
            throw new Error('Transaction failed');
        }
    } catch (error) {
        console.error('Error rejecting work:', error);
        throw error;
    }
};

const raiseDispute = async (contractId, signer) => {
    try {
        if (!contract) throw new Error('Contract not initialized');
        if (!signer) throw new Error('Signer required');

        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        if (isNaN(id)) throw new Error('Invalid contractId');

        // Get dispute fee
        const disputeFee = await contract.disputeFee();
        console.log('Dispute fee:', ethers.utils.formatEther(disputeFee), 'ETH');

        const tx = await contract.connect(signer).raiseDispute(id, {
            value: disputeFee
        });
        await tx.wait();
        return true;
    } catch (error) {
        console.error('Error raising dispute:', error);
        throw error;
    }
};

const resolveDispute = async (contractId, clientShare, freelancerShare, signer) => {
    try {
        if (!contract) throw new Error('Contract not initialized');
        if (!signer) throw new Error('Signer required');

        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        if (isNaN(id)) throw new Error('Invalid contractId');

        const tx = await contract.connect(signer).resolveDispute(id, clientShare, freelancerShare);
        await tx.wait();
        return true;
    } catch (error) {
        console.error('Error resolving dispute:', error);
        throw error;
    }
};

const requestRefund = async (contractId, signer) => {
    try {
        if (!contract) throw new Error('Contract not initialized');
        if (!signer) throw new Error('Signer required');

        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        if (isNaN(id)) throw new Error('Invalid contractId');

        const tx = await contract.connect(signer).requestRefund(id);
        await tx.wait();
        return true;
    } catch (error) {
        console.error('Error requesting refund:', error);
        throw error;
    }
};

const getContractState = async (contractId, signer = null) => {
    try {
        if (!contract) throw new Error('Contract not initialized');

        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        if (isNaN(id)) throw new Error('Invalid contractId');

        const state = await contract.getContract(id);
        
        const statusMap = ['Created', 'ClientSigned', 'BothSigned', 'WorkSubmitted', 'Completed', 'Disputed', 'Refunded'];
        const readableStatus = statusMap[state.status] || 'Unknown';
        
        return {
            client: state.client,
            freelancer: state.freelancer,
            bidAmount: ethers.utils.formatEther(state.bidAmount),
            deadline: new Date(state.deadline.toNumber() * 1000),
            jobTitle: state.jobTitle,
            jobDescription: state.jobDescription,
            status: readableStatus,
            workSubmissionHash: state.workSubmissionHash,
            fundsDeposited: state.fundsDeposited,
            clientSigned: state.clientSigned,
            freelancerSigned: state.freelancerSigned,
            createdAt: new Date(state.createdAt.toNumber() * 1000)
        };
    } catch (error) {
        console.error('Error getting contract state:', error);
        throw error;
    }
};

module.exports = {
    initialize,
    createContract,
    clientSignAndDeposit,
    freelancerSign,
    submitWork,
    approveWork,
    rejectWork,
    raiseDispute,
    resolveDispute,
    requestRefund,
    getContractState
};