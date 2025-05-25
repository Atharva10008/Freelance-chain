import { ethers } from 'ethers';
import { CONTRACT_ABI } from '../../utils/contract';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

/**
 * Creates a contract on-chain using MetaMask and returns contractId and txHash.
 * @param {Object} params
 * @param {string} params.freelancerAddress
 * @param {string|number} params.bidAmount (in ETH)
 * @param {string|Date} params.deadline (date string or Date object)
 * @param {string} params.jobTitle
 * @param {string} params.jobDescription
 * @param {string} params.clientSigner - Address that can sign for client
 * @param {string} params.freelancerSigner - Address that can sign for freelancer
 * @param {Object} params.provider - Web3 provider instance
 * @param {Object} params.signer - Web3 signer instance
 * @returns {Promise<{contractId: string, txHash: string}>}
 */
export async function createContractOnChain({ 
  freelancerAddress, 
  bidAmount, 
  deadline, 
  jobTitle, 
  jobDescription,
  clientSigner,
  freelancerSigner,
  provider,
  signer
}) {
  try {
    if (!window.ethereum) {
      throw new Error('MetaMask not detected. Please install MetaMask to continue.');
    }

    if (!provider || !signer) {
      throw new Error('Web3 provider not initialized. Please connect your wallet first.');
    }

    // Validate required parameters
    if (!freelancerAddress) {
      throw new Error('Freelancer address is required');
    }
    if (!bidAmount) {
      throw new Error('Bid amount is required');
    }
    if (!deadline) {
      throw new Error('Deadline is required');
    }
    if (!jobTitle) {
      throw new Error('Job title is required');
    }
    if (!jobDescription) {
      throw new Error('Job description is required');
    }
    if (!clientSigner) {
      throw new Error('Client signer address is required');
    }
    if (!freelancerSigner) {
      throw new Error('Freelancer signer address is required');
    }

    // Initialize contract
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    // Prepare deadline as unix timestamp
    const deadlineTimestamp = Math.floor(new Date(deadline).getTime() / 1000);

    console.log('Creating contract with params:', {
      freelancerAddress,
      bidAmount,
      deadlineTimestamp,
      jobTitle,
      jobDescription,
      clientSigner,
      freelancerSigner
    });

    // Get the client address (current signer)
    const clientAddress = await signer.getAddress();

    // Call the contract creation function with all required parameters
    const tx = await contract.createContract(
      clientAddress,           // _client
      freelancerAddress,       // _freelancer
      ethers.utils.parseEther(bidAmount.toString()), // _bidAmount
      deadlineTimestamp,       // _deadline
      jobTitle,                // _jobTitle
      jobDescription,          // _jobDescription
      clientSigner,            // _clientSigner
      freelancerSigner         // _freelancerSigner
    );

    console.log('Transaction sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('Transaction confirmed:', receipt);

    // Parse the ContractCreated event to get contractId
    const event = receipt.logs
      .map(log => {
        try {
          return contract.interface.parseLog(log);
        } catch (e) {
          console.warn('Failed to parse log:', e);
          return null;
        }
      })
      .find(e => e && e.name === 'ContractCreated');

    if (!event) {
      throw new Error('ContractCreated event not found in transaction receipt');
    }

    const contractId = event.args[0].toString();
    console.log('Contract created with ID:', contractId);

    return { contractId, txHash: tx.hash };
  } catch (error) {
    console.error('Error creating contract on chain:', error);
    if (error.code === 'INSUFFICIENT_FUNDS') {
      throw new Error('Insufficient funds to create contract. Please ensure you have enough ETH for gas fees.');
    } else if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
      throw new Error('Transaction failed. Please check your wallet and try again.');
    } else if (error.message.includes('user rejected')) {
      throw new Error('Transaction was rejected by user.');
    }
    throw error;
  }
}

/**
 * Authorizes a new signer for the contract
 * @param {string} signerAddress - Address to authorize
 * @param {Object} provider - Web3 provider instance
 * @param {Object} signer - Web3 signer instance
 * @returns {Promise<boolean>}
 */
export async function authorizeSigner(signerAddress, provider, signer) {
  try {
    if (!provider || !signer) {
      throw new Error('Web3 provider not initialized');
    }

    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    const tx = await contract.authorizeSigner(signerAddress);
    await tx.wait();
    return true;
  } catch (error) {
    console.error('Error authorizing signer:', error);
    throw error;
  }
}

/**
 * Revokes a signer's authorization
 * @param {string} signerAddress - Address to revoke
 * @param {Object} provider - Web3 provider instance
 * @param {Object} signer - Web3 signer instance
 * @returns {Promise<boolean>}
 */
export async function revokeSigner(signerAddress, provider, signer) {
  try {
    if (!provider || !signer) {
      throw new Error('Web3 provider not initialized');
    }

    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    const tx = await contract.revokeSigner(signerAddress);
    await tx.wait();
    return true;
  } catch (error) {
    console.error('Error revoking signer:', error);
    throw error;
  }
} 