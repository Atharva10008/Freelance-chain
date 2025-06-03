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

const getContractState = async (contractAddress, contractId, signer, txHash = null) => {
    try {
        if (!contract) {
            throw new Error('Contract not initialized. Call initialize() first.');
        }

        let contractInstance;
        if (contractAddress) {
            contractInstance = new ethers.Contract(contractAddress, CONTRACT_ABI, signer || provider);
        } else {
            contractInstance = contract;
        }

        // Convert contractId if needed
        let id;
        if (typeof contractId === 'string' && contractId.length === 24) {
            const Contract = require('../models/Contract');
            const contractDoc = await Contract.findById(contractId);
            if (!contractDoc) throw new Error('Contract not found in database');
            id = contractDoc.contractId;
        } else {
            try {
                id = parseInt(contractId, 10);
                if (isNaN(id) || id < 0) { throw new Error('Invalid contract ID format or value'); }
            } catch(e) { throw new Error('Invalid contract ID provided'); }
        }

        console.log('[getContractState] Fetching contract with blockchain ID:', id);

        // If we have a transaction hash, wait for it to be mined and get the block number
        let minBlockNumber = 0;
        if (txHash) {
            console.log('[getContractState] Waiting for transaction to be fully confirmed:', txHash);
            try {
                const receipt = await provider.waitForTransaction(txHash, 2);
                minBlockNumber = receipt.blockNumber;
                console.log('[getContractState] Transaction confirmed at block:', minBlockNumber);
            } catch (waitError) {
                console.warn(`[getContractState] Error waiting for transaction confirmations for ${txHash}:`, waitError.message);
            }
        }

        const MAX_RETRIES = 8;
        const BASE_DELAY_MS = 2000;
        let state = null;
        let lastError = null;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const currentBlock = await provider.getBlockNumber();
                console.log(`[getContractState] Attempt ${attempt + 1}: Current block: ${currentBlock}, Min block: ${minBlockNumber}`);

                if (txHash && minBlockNumber > 0 && currentBlock < minBlockNumber) {
                    console.log('[getContractState] Current block is behind transaction block, waiting...');
                    await new Promise(resolve => setTimeout(resolve, BASE_DELAY_MS));
                    continue;
                }

                state = await contractInstance.getContract(id, { blockTag: 'latest' });
                
                console.log('[getContractState] Raw state from blockchain for ID', id, ':', {
                    status: state.status.toString(), // Log as string to see the raw value
                    clientSigned: state.clientSigned,
                    freelancerSigned: state.bothSigned,
                    fundsDeposited: state.fundsDeposited
                });

                console.log(`[getContractState] Successfully fetched state on attempt ${attempt + 1}`);
                break;

            } catch (err) {
                lastError = err;
                console.error(`[getContractState] Error on attempt ${attempt + 1} for id ${id}:`, err.message);

                if (attempt < MAX_RETRIES - 1) {
                    const delay = BASE_DELAY_MS * Math.pow(1.5, attempt);
                    console.log(`[getContractState] Waiting for ${delay}ms before next retry.`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw new Error(`Failed to fetch contract state after ${MAX_RETRIES} attempts: ${lastError?.message}`);
                }
            }
        }

        if (!state) {
            console.error('[getContractState] Failed to fetch state after all retries completed without breaking.');
            throw new Error(`Failed to fetch contract state for ID ${id} after multiple retries.`);
        }

        // Ensure statusMap includes all possible statuses from the smart contract enum
        // enum Status { Created, ClientSigned, FreelancerSigned, BothSigned, WorkSubmitted, Completed, Disputed, Funded }
        const statusMap = ['Created', 'ClientSigned', 'BothSigned', 'WorkSubmitted', 'Completed', 'Disputed', 'Funded'];
        const readableStatus = statusMap[state.status] || 'Unknown';
        const bidAmountEth = ethers.utils.formatEther(state.bidAmount);
        const deadlineDate = new Date(state.deadline.toNumber() * 1000);

        console.log('[getContractState] Raw chain values before override:', {
            rawClientApproved: state.clientApproved,
            rawFreelancerApproved: state.freelancerApproved,
            status: state.status
        });

        // Determine approval states based on contract status value
        // A party is 'approved' (signed) if the status is at or past their signing step.
        const isClientApproved = state.status >= 1; // Created (0), ClientSigned (1), BothSigned (2), etc.
        const isFreelancerApproved = state.status >= 2; // Created (0), ClientSigned (1), FreelancerSigned (2), etc.

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
            clientApproved: isClientApproved, // Use derived boolean based on status
            freelancerApproved: isFreelancerApproved, // Use derived boolean based on status
        };

        console.log('[getContractState] Processed blockchain state:', {
            contractId: id,
            clientApproved: blockchainState.clientApproved,
            status: blockchainState.status,
            fundsDeposited: blockchainState.fundsDeposited
        });
        
        return blockchainState;

    } catch (error) {
        console.error('[getContractState] Fatal error:', error);
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

        console.log('[clientSignContract] Starting signing process for contract:', id);

        // Send the transaction
        const tx = await contractWithSigner.clientSignContract(id);
        console.log('[clientSignContract] Transaction sent:', tx.hash);

        // Wait for transaction confirmation (this happens before fetching state)
        const receipt = await tx.wait();
        console.log('[clientSignContract] Transaction confirmed in block:', receipt.blockNumber);

        // Fetch the updated state using the robust function and passing the transaction hash
        const updatedState = await getContractState(null, id, signer, tx.hash); // Pass tx.hash here

        // You can add a final check here based on updatedState if needed
        if (!updatedState.clientApproved) {
             console.warn('[clientSignContract] Final state check after getContractStateRobust - clientApproved is still false.');
             // Depending on desired strictness, you could throw here or handle client-side
        } else {
             console.log('[clientSignContract] Final state check successful - clientApproved is true.');
        }


        return {
            success: true,
            transactionHash: tx.hash,
            blockNumber: receipt.blockNumber,
            blockchainState: updatedState // Optionally return the fetched state
        };

    } catch (error) {
        console.error('[clientSignContract] Error:', error);
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
        
        console.log('[freelancerSignContract] Starting signing process for contract:', id);

        // Send the transaction
        const tx = await contractWithSigner.freelancerSign(id);
        console.log('[freelancerSignContract] Transaction sent:', tx.hash);

        // Wait for transaction confirmation
        const receipt = await tx.wait();
        console.log('[freelancerSignContract] Transaction confirmed in block:', receipt.blockNumber);

        // Fetch the updated state using the robust function and passing the transaction hash
        const updatedState = await getContractState(null, id, signer, tx.hash);

        // Verify the state update
        if (!updatedState.freelancerApproved) {
            console.warn('[freelancerSignContract] Final state check after getContractState - freelancerApproved is still false.');
        } else {
            console.log('[freelancerSignContract] Final state check successful - freelancerApproved is true.');
        }

        return {
            success: true,
            transactionHash: tx.hash,
            blockNumber: receipt.blockNumber,
            blockchainState: updatedState
        };
    } catch (error) {
        console.error('[freelancerSignContract] Error:', error);
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