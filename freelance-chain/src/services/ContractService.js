import { api } from './api';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../utils/contract';

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

export const contractService = {
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

      // Create contract in backend
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

  getContract: async (contractId) => {
    try {
      const response = await api.get(`/contracts/${contractId}`, getAuthConfig());
      return response.data.data;
    } catch (error) {
      console.error('Get contract error:', error);
      if (error.response) {
        console.error('Error response:', error.response.data);
        throw new Error(error.response.data.error || 'Failed to fetch contract');
      }
      throw error;
    }
  },
  
  signContract: async (contractId) => {
    try {
      const response = await api.post(
        `/contracts/${contractId}/sign`,
        {},
        getAuthConfig()
      );
      return response.data.data;
    } catch (error) {
      console.error('Sign contract error:', error);
      if (error.response) {
        console.error('Error response:', error.response.data);
        throw new Error(error.response.data.error || 'Failed to sign contract');
      }
      throw error;
    }
  },

  depositFunds: async (contractId, amount) => {
    try {
      const response = await api.post(
        `/contracts/${contractId}/deposit`,
        { amount },
        getAuthConfig()
      );
      return response.data.data;
    } catch (error) {
      console.error('Deposit funds error:', error);
      if (error.response) {
        console.error('Error response:', error.response.data);
        throw new Error(error.response.data.error || 'Failed to deposit funds');
      }
      throw error;
    }
  },

  submitWork: async (contractId, workHash) => {
    try {
      const response = await api.post(
        `/contracts/${contractId}/submit-work`,
        { workHash },
        getAuthConfig()
      );
      return response.data.data;
    } catch (error) {
      console.error('Submit work error:', error);
      if (error.response) {
        console.error('Error response:', error.response.data);
        throw new Error(error.response.data.error || 'Failed to submit work');
      }
      throw error;
    }
  },

  approveWork: async (contractId) => {
    try {
      const response = await api.post(
        `/contracts/${contractId}/approve-work`,
        {},
        getAuthConfig()
      );
      return response.data.data;
    } catch (error) {
      console.error('Approve work error:', error);
      if (error.response) {
        console.error('Error response:', error.response.data);
        throw new Error(error.response.data.error || 'Failed to approve work');
      }
      throw error;
    }
  },

  releasePayment: async (contractId) => {
    try {
      const response = await api.post(
        `/contracts/${contractId}/release-payment`,
        {},
        getAuthConfig()
      );
      return response.data.data;
    } catch (error) {
      console.error('Release payment error:', error);
      if (error.response) {
        console.error('Error response:', error.response.data);
        throw new Error(error.response.data.error || 'Failed to release payment');
      }
      throw error;
    }
  }
};