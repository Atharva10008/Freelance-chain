const { ethers } = require('ethers');
require('dotenv').config();
const { CONTRACT_ABI } = require('../config/contractABI');
const JobContractAddress = process.env.CONTRACT_ADDRESS || '0x28dc611822c09167900a77f133D6C6a0615652d6';

let provider;
let signer;
let contract;

const initialize = async () => {
    try {
        // Initialize provider with explicit network configuration
        provider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_URL || 'https://rpc-vanguard.vanarchain.com');
        
        // Wait for network to be ready
        await provider.ready;
        console.log('Provider initialized with network:', await provider.getNetwork());
        
        // Initialize signer with private key
        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey) {
            throw new Error('Private key not found in environment variables');
        }
        signer = new ethers.Wallet(privateKey, provider);
        console.log('Signer initialized with address:', signer.address);
        
        // Initialize contract
        contract = new ethers.Contract(JobContractAddress, CONTRACT_ABI, signer);
        console.log('Contract initialized at address:', JobContractAddress);
        
        return true;
    } catch (error) {
        console.error('Failed to initialize contract utilities:', error);
        throw error;
    }
};

const createContract = async (contractData) => {
    try {
        if (!contract) {
            throw new Error('Contract not initialized. Call initialize() first.');
        }

        const { freelancerAddress, bidAmount, deadline, jobTitle, jobDescription } = contractData;
        
        console.log('--- Creating contract on blockchain ---');
        console.log('freelancerAddress:', freelancerAddress);
        console.log('bidAmount:', bidAmount);
        console.log('deadline:', deadline);
        console.log('jobTitle:', jobTitle);
        console.log('jobDescription:', jobDescription);
        if (signer && signer.address) {
            console.log('sender (signer.address):', signer.address);
        } else if (signer) {
            try {
                const address = await signer.getAddress();
                console.log('sender (signer.getAddress()):', address);
            } catch (e) {
                console.log('Could not get signer address:', e);
            }
        } else {
            console.log('No signer provided');
        }

        try {
            // Convert bidAmount to wei
            const bidAmountWei = ethers.utils.parseEther(bidAmount.toString());
            console.log('bidAmountWei:', bidAmountWei.toString());

            // Convert deadline to Unix timestamp (seconds) and ensure it's at least 24 hours in the future
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const minDeadline = currentTimestamp + (24 * 60 * 60); // 24 hours from now
            const deadlineTimestamp = Math.max(minDeadline, Math.floor(new Date(deadline).getTime() / 1000));
            console.log('currentTimestamp:', currentTimestamp);
            console.log('minDeadline:', minDeadline);
            console.log('deadlineTimestamp:', deadlineTimestamp);

            const tx = await contract.createContract(
                freelancerAddress,
                bidAmountWei,
                deadlineTimestamp,
                jobTitle,
                jobDescription
            );
            console.log('Transaction sent:', tx.hash);
            const receipt = await tx.wait();
            console.log('Transaction confirmed:', receipt);
            
            // Get contract ID from event
            const event = receipt.events.find(e => e.event === 'ContractCreated');
            if (!event) {
                throw new Error('ContractCreated event not found in transaction receipt');
            }
            
            const contractId = event.args.contractId;
            console.log('Contract created with ID:', contractId);
            
            return {
                address: JobContractAddress,
                contractId,
                transactionHash: tx.hash
            };
        } catch (error) {
            console.error('Error creating contract:', error);
            throw error;
        }
    } catch (error) {
        console.error('Error creating contract:', error);
        throw error;
    }
};

const getContractState = async (contractAddress, contractId) => {
    try {
        if (!contract) {
            throw new Error('Contract not initialized. Call initialize() first.');
        }

        // If contractAddress is provided, verify it matches our contract
        if (contractAddress && contractAddress.toLowerCase() !== JobContractAddress.toLowerCase()) {
            console.warn('[getContractState] Contract address mismatch:', contractAddress, 'expected:', JobContractAddress);
            return null;
        }

        let id;
        // Handle MongoDB ObjectId
        if (typeof contractId === 'string' && contractId.length === 24) {
            console.log('[getContractState] Converting MongoDB ObjectId to contract ID:', contractId);
            const Contract = require('../models/Contract');
            const contractDoc = await Contract.findById(contractId);
            if (!contractDoc) {
                console.warn('[getContractState] Contract not found in database:', contractId);
                return null;
            }
            if (!contractDoc.contractId) {
                console.warn('[getContractState] Contract document has no contractId field:', contractDoc);
                return null;
            }
            id = contractDoc.contractId;
            console.log('[getContractState] Converted to contract ID:', id);
        } else {
            // Try to parse as a number
            try {
                id = parseInt(contractId, 10);
                if (isNaN(id)) {
                    console.warn('[getContractState] Invalid contract ID format:', contractId);
                    return null;
                }
            } catch (e) {
                console.warn('[getContractState] Error parsing contract ID:', e);
                return null;
            }
        }

        // Validate id is a non-negative integer
        if (!Number.isInteger(id) || id < 0) {
            console.warn('[getContractState] Invalid contract ID value:', id);
            return null;
        }

        console.log('[getContractState] Fetching contract with ID:', id);
        try {
            const state = await contract.getContract(id);
            if (!state) {
                console.warn('[getContractState] No state returned for contract ID:', id);
                return null;
            }

            // Validate the returned state
            if (!state.client || !state.freelancer) {
                console.warn('[getContractState] Invalid state returned for contract ID:', id);
                return null;
            }

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
            console.error('[getContractState] Error fetching from blockchain for id', id, err);
            // If the error is a panic code 50 (array index out of bounds), return null
            if (err.message && err.message.includes('panic code 50')) {
                console.warn('[getContractState] Contract not found on blockchain (panic code 50)');
                return null;
            }
            throw err;
        }
    } catch (error) {
        console.error('[getContractState] Error:', error);
        return null;
    }
};

const getContractIdFromMongoId = async (mongoId) => {
    if (typeof mongoId === 'string' && mongoId.length === 24) {
        const Contract = require('../models/Contract');
        const contractDoc = await Contract.findById(mongoId);
        if (!contractDoc) {
            throw new Error('Contract not found in database');
        }
        return contractDoc.contractId;
    }
    return mongoId;
};

const signContract = async (contractAddress, contractId) => {
    try {
        if (!contract) {
            throw new Error('Contract not initialized. Call initialize() first.');
        }
        // contractId should be a number
        const id = typeof contractId === 'string' ? parseInt(contractId) : contractId;
        if (isNaN(id)) {
            throw new Error('Invalid contractId for signContract');
        }
        // Call the signContract function on the contract
        const tx = await contract.signContract(id);
        await tx.wait();
        return true;
    } catch (error) {
        console.error('Error signing contract:', error);
        throw error;
    }
};

const depositFunds = async (contractId, amount) => {
    try {
        if (!contract) {
            throw new Error('Contract not initialized. Call initialize() first.');
        }

        const id = await getContractIdFromMongoId(contractId);
        const amountWei = ethers.utils.parseEther(amount.toString());
        const tx = await contract.depositFunds(id, { value: amountWei });
        await tx.wait();
        return true;
    } catch (error) {
        console.error('Error depositing funds:', error);
        throw error;
    }
};

const submitWork = async (contractId, workHash) => {
    try {
        if (!contract) {
            throw new Error('Contract not initialized. Call initialize() first.');
        }

        const id = await getContractIdFromMongoId(contractId);
        const tx = await contract.submitWork(id, workHash);
        await tx.wait();
        return true;
    } catch (error) {
        console.error('Error submitting work:', error);
        throw error;
    }
};

const approveWork = async (contractId) => {
    try {
        if (!contract) {
            throw new Error('Contract not initialized. Call initialize() first.');
        }

        const id = await getContractIdFromMongoId(contractId);
        const tx = await contract.approveWork(id);
        await tx.wait();
        return true;
    } catch (error) {
        console.error('Error approving work:', error);
        throw error;
    }
};

const raiseDispute = async (contractId) => {
    try {
        if (!contract) {
            throw new Error('Contract not initialized. Call initialize() first.');
        }

        const id = await getContractIdFromMongoId(contractId);
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
    createContract,
    getContractState,
    signContract,
    depositFunds,
    submitWork,
    approveWork,
    raiseDispute
};