import { api } from './api';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../utils/contract';

// Remove old ABI and address
// const JobContractABI = [ ... ];
// const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

const getAuthConfig = () => {
  const token = localStorage.getItem('authToken');
  if (!token) {
    throw new Error('Authentication token not found');
  }
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
};

// Helper function to get the contract instance
const getContract = async () => {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed');
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
};

// Helper to ensure contractId is a number
const toContractIdNum = (contractId) => {
  const n = typeof contractId === 'string' ? Number(contractId) : contractId;
  if (isNaN(n)) throw new Error('Invalid contractId for blockchain call');
  return n;
};

export const contractService = {
  // API-based functions
  getUserContracts: async () => {
    try {
      const response = await api.get('/contracts/user', getAuthConfig());
      return response.data.data;
    } catch (error) {
      console.error('Get user contracts error:', error);
      if (error.response) {
        console.error('Error response:', error.response.data);
        throw new Error(error.response.data.error || 'Failed to fetch contracts');
      }
      throw error;
    }
  },

  createContract: async (jobId, bidId, freelancerId, freelancerAddress, bidAmount, jobTitle, jobDescription, deadline, contractId, contractAddress, transactionHash) => {
    try {
      console.log('Creating contract with data:', {
        jobId,
        bidId,
        freelancerId,
        freelancerAddress,
        bidAmount,
        jobTitle,
        jobDescription,
        deadline,
        contractId,
        contractAddress,
        transactionHash
      });

      const response = await api.post('/contracts', {
        jobId, 
        bidId, 
        freelancerId,
        freelancerAddress,
        bidAmount, 
        jobTitle, 
        jobDescription, 
        deadline,
        contractId,
        contractAddress,
        transactionHash
      }, getAuthConfig());

      console.log('Contract creation response:', response.data);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to create contract');
      }

      return response.data.data;
    } catch (error) {
      console.error('Create contract error:', error);
      if (error.response) {
        console.error('Error response:', error.response.data);
        throw new Error(error.response.data.error || 'Failed to create contract');
      }
      throw error;
    }
  },

  signContract: async (contractId) => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      // Call the smart contract's signContract function
      const tx = await contract.signContract(contractId);
      await tx.wait(); // Wait for transaction confirmation
      
      // Return the transaction hash for reference
      return {
        success: true,
        txHash: tx.hash
      };
    } catch (error) {
      console.error('Error signing contract:', error);
      throw error;
    }
  },

  // Blockchain-based functions
  submitProposal: async (clientAddress, description, bidAmount, duration) => {
    try {
      const contract = await getContract();
      const tx = await contract.submitProposal(
        clientAddress,
        description,
        ethers.parseEther(bidAmount.toString()),
        duration
      );
      const receipt = await tx.wait();
      
      // Get the proposal ID from the event
      const event = receipt.logs.find(log => {
        try {
          return contract.interface.parseLog(log).name === 'ProposalSubmitted';
        } catch {
          return false;
        }
      });
      
      const proposalId = event ? contract.interface.parseLog(event).args[0] : null;
      
      return {
        success: true,
        proposalId: proposalId.toString(),
        transactionHash: receipt.hash
      };
    } catch (error) {
      console.error('Submit proposal error:', error);
      throw new Error(error.message || 'Failed to submit proposal');
    }
  },

  respondToProposal: async (proposalId, status) => {
    try {
      const contract = await getContract();
      const tx = await contract.respondToProposal(proposalId, status);
      const receipt = await tx.wait();
      
      return {
        success: true,
        transactionHash: receipt.hash
      };
    } catch (error) {
      console.error('Respond to proposal error:', error);
      throw new Error(error.message || 'Failed to respond to proposal');
    }
  },

  fundEscrow: async (contractId, amount) => {
    try {
      const contract = await getContract();
      const contractIdNum = toContractIdNum(contractId);
      const tx = await contract.fundEscrow(contractIdNum, {
        value: ethers.parseEther(amount.toString())
      });
      const receipt = await tx.wait();
      
      return {
        success: true,
        transactionHash: receipt.hash
      };
    } catch (error) {
      console.error('Fund escrow error:', error);
      throw new Error(error.message || 'Failed to fund escrow');
    }
  },

  submitWork: async (contractId, deliverables) => {
    try {
      const contract = await getContract();
      const contractIdNum = toContractIdNum(contractId);
      const tx = await contract.submitWork(contractIdNum, deliverables);
      const receipt = await tx.wait();
      
      return {
        success: true,
        transactionHash: receipt.hash
      };
    } catch (error) {
      console.error('Submit work error:', error);
      throw new Error(error.message || 'Failed to submit work');
    }
  },

  approveWork: async (contractId) => {
    try {
      const contract = await getContract();
      const contractIdNum = toContractIdNum(contractId);
      const tx = await contract.approveWork(contractIdNum);
      const receipt = await tx.wait();
      
      return {
        success: true,
        transactionHash: receipt.hash
      };
    } catch (error) {
      console.error('Approve work error:', error);
      throw new Error(error.message || 'Failed to approve work');
    }
  },

  requestRevision: async (contractId) => {
    try {
      const contract = await getContract();
      const contractIdNum = toContractIdNum(contractId);
      const tx = await contract.requestRevision(contractIdNum);
      const receipt = await tx.wait();
      
      return {
        success: true,
        transactionHash: receipt.hash
      };
    } catch (error) {
      console.error('Request revision error:', error);
      throw new Error(error.message || 'Failed to request revision');
    }
  },

  leaveReview: async (revieweeAddress, rating, comment) => {
    try {
      const contract = await getContract();
      const tx = await contract.leaveReview(revieweeAddress, rating, comment);
      const receipt = await tx.wait();
      
      return {
        success: true,
        transactionHash: receipt.hash
      };
    } catch (error) {
      console.error('Leave review error:', error);
      throw new Error(error.message || 'Failed to leave review');
    }
  },

  // View functions
  getProposal: async (proposalId) => {
    try {
      const contract = await getContract();
      const proposal = await contract.getProposal(proposalId);
      
      return {
        id: proposal.id.toString(),
        freelancer: proposal.freelancer,
        client: proposal.client,
        description: proposal.description,
        bidAmount: ethers.formatEther(proposal.bidAmount),
        duration: proposal.duration.toString(),
        status: proposal.status
      };
    } catch (error) {
      console.error('Get proposal error:', error);
      throw new Error(error.message || 'Failed to get proposal');
    }
  },

  getContract: async (id) => {
    // If id is a 24-char hex string, treat as MongoDB _id and call backend
    if (typeof id === 'string' && id.length === 24 && /^[a-fA-F0-9]+$/.test(id)) {
      try {
        const response = await api.get(`/contracts/${id}`, getAuthConfig());
        // If blockchainState is null, do not try to fetch from blockchain
        if (response.data.data && response.data.data.blockchainState === null) {
          return response.data.data;
        }
        return response.data.data;
      } catch (error) {
        console.error('Get contract (backend) error:', error);
        throw new Error(error.message || 'Failed to get contract from backend');
      }
    }
    // Otherwise, treat as Solidity contractId and call blockchain
    try {
      const contract = await getContract();
      const contractIdNum = toContractIdNum(id);
      const contractData = await contract.getContract(contractIdNum);
      return {
        id: contractData.id?.toString?.() ?? id?.toString?.(),
        proposalId: contractData.proposalId?.toString?.(),
        freelancer: contractData.freelancer,
        client: contractData.client,
        amount: ethers.formatEther(contractData.amount),
        deadline: new Date(Number(contractData.deadline) * 1000),
        status: contractData.status,
        deliverables: contractData.deliverables,
        workSubmitted: contractData.workSubmitted,
        clientApproved: contractData.clientApproved
      };
    } catch (error) {
      console.error('Get contract (blockchain) error:', error);
      throw new Error(error.message || 'Failed to get contract from blockchain');
    }
  },

  getClientProposals: async (clientAddress) => {
    try {
      const contract = await getContract();
      const proposalIds = await contract.getClientProposals(clientAddress);
      
      return proposalIds.map(id => id.toString());
    } catch (error) {
      console.error('Get client proposals error:', error);
      throw new Error(error.message || 'Failed to get client proposals');
    }
  },

  getFreelancerProposals: async (freelancerAddress) => {
    try {
      const contract = await getContract();
      const proposalIds = await contract.getFreelancerProposals(freelancerAddress);
      
      return proposalIds.map(id => id.toString());
    } catch (error) {
      console.error('Get freelancer proposals error:', error);
      throw new Error(error.message || 'Failed to get freelancer proposals');
    }
  },

  getClientContracts: async (clientAddress) => {
    try {
      const contract = await getContract();
      const contractIds = await contract.getClientContracts(clientAddress);
      
      return contractIds.map(id => id.toString());
    } catch (error) {
      console.error('Get client contracts error:', error);
      throw new Error(error.message || 'Failed to get client contracts');
    }
  },

  getFreelancerContracts: async (freelancerAddress) => {
    try {
      const contract = await getContract();
      const contractIds = await contract.getFreelancerContracts(freelancerAddress);
      
      return contractIds.map(id => id.toString());
    } catch (error) {
      console.error('Get freelancer contracts error:', error);
      throw new Error(error.message || 'Failed to get freelancer contracts');
    }
  },

  getReviews: async (userAddress) => {
    try {
      const contract = await getContract();
      const reviews = await contract.getReviews(userAddress);
      
      return reviews.map(review => ({
        reviewer: review.reviewer,
        reviewee: review.reviewee,
        rating: review.rating.toString(),
        comment: review.comment,
        timestamp: new Date(Number(review.timestamp) * 1000)
      }));
    } catch (error) {
      console.error('Get reviews error:', error);
      throw new Error(error.message || 'Failed to get reviews');
    }
  },

  getReputation: async (userAddress) => {
    try {
      const contract = await getContract();
      const reputation = await contract.getReputation(userAddress);
      
      return reputation.toString();
    } catch (error) {
      console.error('Get reputation error:', error);
      throw new Error(error.message || 'Failed to get reputation');
    }
  }
};