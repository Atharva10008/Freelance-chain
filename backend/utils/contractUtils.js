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
        console.error('Create contract error:', {
            error,
            message: error.message,
            data: error.data,
            code: error.code,
            stack: error.stack
        });
        
        // Enhanced error handling
        let errorMessage = 'Contract creation failed';
        if (error.code === 'UNSUPPORTED_OPERATION') {
            errorMessage = 'Network operation not supported';
        } else if (error.code === 'INVALID_ARGUMENT') {
            errorMessage = 'Invalid address provided';
        } else if (error.code === 'INSUFFICIENT_FUNDS') {
            errorMessage = 'Insufficient funds for transaction';
        }
        throw new Error(`${errorMessage}: ${error.message}`);
    }
};

const getContractState = async (contractAddress, contractId, signer) => {
    try {
        if (!contract) {
            throw new Error('Contract not initialized. Call initialize() first.');
        }

        // If contractAddress is provided, use that address instead of the default one
        let contractInstance;
        if (contractAddress) {
            console.log('[getContractState] Using provided contract address:', contractAddress);
            contractInstance = new ethers.Contract(contractAddress, CONTRACT_ABI, signer || provider);
        } else {
            contractInstance = contract;
        }

        let id;
        if (typeof contractId === 'string' && contractId.length === 24) {
            console.log('[getContractState] Converting MongoDB ObjectId to contract ID:', contractId);
            const Contract = require('../models/Contract');
            const contractDoc = await Contract.findById(contractId);
            if (!contractDoc) { throw new Error('Contract not found in database'); }
            if (contractDoc.contractId === undefined || contractDoc.contractId === null) { throw new Error('Contract has no blockchain contract ID'); }
            id = contractDoc.contractId;
            console.log('[getContractState] Converted to contract ID:', id);
        } else {
            try {
                id = parseInt(contractId, 10);
                if (isNaN(id) || id < 0) { throw new Error('Invalid contract ID format or value'); }
            } catch(e) { throw new Error('Invalid contract ID provided'); }
        }

        console.log('[getContractState] Fetching contract with blockchain ID:', id);

        try {
            const state = await contractInstance.getContract(id);

            if (!state) { throw new Error('No state returned for contract ID'); }
            if (!state.client || !state.freelancer) { throw new Error('Invalid state structure returned'); }

            const statusMap = ['Created', 'ClientSigned', 'FreelancerSigned', 'BothSigned', 'WorkSubmitted', 'Completed', 'Disputed'];
            const readableStatus = statusMap[state.status] || 'Unknown';

            const bidAmountEth = ethers.utils.formatEther(state.bidAmount);
            const deadlineDate = new Date(state.deadline.toNumber() * 1000);

            const blockchainState = {
                client: state.client,
                freelancer: state.freelancer,
                bidAmount: bidAmountEth,
                deadline: deadlineDate,
                jobTitle: state.jobTitle,
                jobDescription: state.jobDescription,
                status: readableStatus,
                workSubmissionHash: state.workSubmissionHash,
                fundsDeposited: Boolean(state.fundsDeposited),
                clientApproved: Boolean(state.clientApproved),
                freelancerApproved: Boolean(state.freelancerApproved),
            };

            console.log('Blockchain state object returned by contractUtils.getContractState (deep log):', JSON.stringify(blockchainState, null, 2));

            return blockchainState;

        } catch (err) {
            console.error('[getContractState] Error fetching from blockchain for id', id, {
                error: err,
                message: err.message,
                data: err.data,
                code: err.code,
                stack: err.stack
            });
            if (err.message && err.message.includes('panic code 50')) {
                console.warn('[getContractState] Contract not found on blockchain (panic code 50)');
                return null;
            }
            throw err;
        }
    } catch (error) {
        console.error('[getContractState] Error:', {
            error,
            message: error.message,
            data: error.data,
            code: error.code,
            stack: error.stack
        });
        throw error;
    }
};

const clientSignContract = async (contractId, signer) => {
    try {
        if (!contract) throw new Error('Contract not initialized');
        if (!signer) throw new Error('Signer is required');
        
        const contractWithSigner = contract.connect(signer);
        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        if (isNaN(id)) throw new Error('Invalid contractId');
        
        const tx = await contractWithSigner.clientSignContract(id);
        await tx.wait();
        return true;
    } catch (error) {
        console.error('Error signing contract as client:', {
            error,
            message: error.message,
            data: error.data,
            code: error.code,
            stack: error.stack
        });
        throw error;
    }
};

const freelancerSignContract = async (contractId, signer) => {
    try {
        if (!contract) throw new Error('Contract not initialized');
        if (!signer) throw new Error('Signer is required');
        
        const contractWithSigner = contract.connect(signer);
        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        if (isNaN(id)) throw new Error('Invalid contractId');
        
        const tx = await contractWithSigner.freelancerSignContract(id);
        await tx.wait();
        return true;
    } catch (error) {
        console.error('Error signing contract as freelancer:', {
            error,
            message: error.message,
            data: error.data,
            code: error.code,
            stack: error.stack
        });
        throw error;
    }
};

const depositFunds = async (contractId, signer) => {
    try {
        if (!contract) throw new Error('Contract not initialized');
        if (!signer) throw new Error('Signer required');

        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        if (isNaN(id)) throw new Error('Invalid contractId');

        console.log('Depositing funds for contract ID:', id);

        const tx = await contract.connect(signer).depositFunds(id);
        const receipt = await tx.wait();
        console.log('Funds deposited successfully:', receipt.transactionHash);
        return true;
    } catch (error) {
        console.error('Error depositing funds:', {
            error,
            message: error.message,
            data: error.data,
            code: error.code,
            stack: error.stack
        });
        throw error;
    }
};

const submitWork = async (contractId, workHash, signer) => {
    try {
        if (!contract) throw new Error('Contract not initialized');
        if (!signer) throw new Error('Signer required');

        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        if (isNaN(id)) throw new Error('Invalid contractId');

        const tx = await contract.connect(signer).submitWork(id, workHash);
        await tx.wait();
        return true;
    } catch (error) {
        console.error('Error submitting work:', {
            error,
            message: error.message,
            data: error.data,
            code: error.code,
            stack: error.stack
        });
        throw error;
    }
};

const approveWork = async (contractId, signer) => {
    try {
        if (!contract) throw new Error('Contract not initialized');
        if (!signer) throw new Error('Signer required');

        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        if (isNaN(id)) throw new Error('Invalid contractId');

        const tx = await contract.connect(signer).approveWork(id);
        await tx.wait();
        return true;
    } catch (error) {
        console.error('Error approving work:', {
            error,
            message: error.message,
            data: error.data,
            code: error.code,
            stack: error.stack
        });
        throw error;
    }
};

const raiseDispute = async (contractId, signer) => {
    try {
        if (!contract) throw new Error('Contract not initialized');
        if (!signer) throw new Error('Signer required');

        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        if (isNaN(id)) throw new Error('Invalid contractId');

        const tx = await contract.connect(signer).raiseDispute(id);
        await tx.wait();
        return true;
    } catch (error) {
        console.error('Error raising dispute:', {
            error,
            message: error.message,
            data: error.data,
            code: error.code,
            stack: error.stack
        });
        throw error;
    }
};

module.exports = {
    initialize,
    createContract,
    getContractState,
    clientSignContract,
    freelancerSignContract,
    depositFunds,
    submitWork,
    approveWork,
    raiseDispute
};