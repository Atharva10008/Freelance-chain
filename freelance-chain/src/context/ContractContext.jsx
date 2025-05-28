import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { contractService } from '../services/ContractService';
import { toast } from 'sonner';

const ContractContext = createContext();

export const ContractProvider = ({ children }) => {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleAuthError = useCallback(() => {
    console.log('Unauthorized, redirecting to login');
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    if (navigate) {
      navigate('/signin');
    }
  }, [navigate]);

  // Helper function to merge blockchain state with contract data
  const mergeBlockchainState = useCallback((contract) => {
    if (!contract) return null;
    
    // If we have blockchain data, merge it with the main contract
    if (contract.blockchainState) {
      // Create a new object with the merged state
      const mergedContract = {
        ...contract,
        // Use blockchain state as source of truth for approval flags
        clientApproved: Boolean(contract.blockchainState.clientApproved),
        freelancerApproved: Boolean(contract.blockchainState.freelancerApproved),
        // Use blockchain status if available, otherwise fall back to contract status
        status: contract.blockchainState.status || contract.status,
        // Preserve the original blockchain state
        blockchainState: {
          ...contract.blockchainState,
          // Ensure boolean values for approval flags
          clientApproved: Boolean(contract.blockchainState.clientApproved),
          freelancerApproved: Boolean(contract.blockchainState.freelancerApproved)
        }
      };

      console.log('Merging contract state:', {
        original: {
          clientApproved: contract.clientApproved,
          freelancerApproved: contract.freelancerApproved,
          status: contract.status
        },
        blockchain: {
          clientApproved: contract.blockchainState.clientApproved,
          freelancerApproved: contract.blockchainState.freelancerApproved,
          status: contract.blockchainState.status
        },
        merged: {
          clientApproved: mergedContract.clientApproved,
          freelancerApproved: mergedContract.freelancerApproved,
          status: mergedContract.status
        }
      });

      return mergedContract;
    }
    return contract;
  }, []);

  const fetchContracts = useCallback(async (showToast = true) => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.error('No auth token found');
        throw new Error('Authentication required');
      }

      console.log('Fetching contracts...');
      const response = await contractService.getUserContracts();
      console.log('Contracts response:', response);

      // Merge blockchain state with each contract
      const mergedContracts = (response || []).map(mergeBlockchainState);
      console.log('Merged contracts with blockchain state:', mergedContracts);

      setContracts(mergedContracts);
      return mergedContracts;
    } catch (error) {
      console.error('Failed to fetch contracts:', error);
      setError(error.message);
      if (error.response?.status === 401) {
        handleAuthError();
      }
      if (showToast) {
        toast.error('Failed to fetch contracts: ' + error.message);
      }
      return [];
    } finally {
      setLoading(false);
    }
  }, [handleAuthError, mergeBlockchainState]);

  const getContract = useCallback(async (contractId) => {
    try {
      console.log('Fetching contract:', contractId);
      const response = await contractService.getContract(contractId);
      console.log('Contract response from backend:', response);
      console.log('Data received by ContractContext.getContract (deep log):', JSON.stringify(response, null, 2));

      if (!response) {
        console.warn('No response from getContract for ID:', contractId);
        return null;
      }

      // Merge blockchain state with the contract
      const mergedContract = mergeBlockchainState(response);
      console.log('Merged contract with blockchain state:', mergedContract);

      // Update the contract in the local state
      setContracts(prevContracts => {
        const updatedContracts = prevContracts.map(c => 
          c._id === contractId ? mergedContract : c
        );
        if (!prevContracts.find(c => c._id === contractId)) {
          updatedContracts.push(mergedContract);
        }
        console.log('Updated contracts state:', updatedContracts);
        return updatedContracts;
      });
      
      return mergedContract;
    } catch (error) {
      console.error('Failed to fetch contract:', error);
      toast.error('Failed to fetch contract details: ' + error.message);
      throw error;
    }
  }, [mergeBlockchainState]);

  const signContract = async (contractId, signerAddress) => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Signing contract:', contractId, 'with address:', signerAddress);
      const result = await contractService.signContract(contractId, signerAddress);
      console.log('Sign contract response (from backend):', result);

      // Merge blockchain state with the signed contract
      const mergedContract = mergeBlockchainState(result);
      console.log('Merged contract after signing:', mergedContract);

      // Update the contract in the list with the merged data
      setContracts(prevContracts => {
        const newContracts = prevContracts.map(c =>
          c._id === contractId ? mergedContract : c
        );
        // If the contract wasn't in the list initially, add it
        if (!newContracts.find(c => c._id === contractId)) {
          newContracts.push(mergedContract);
        }
        console.log('Updated contracts after signing:', newContracts);
        // Log the specific contract object after updating the context state
        const updatedContractInContext = newContracts.find(c => c._id === contractId);
        console.log('Specific contract object in context after setContracts:', updatedContractInContext);
        return newContracts;
      });

      toast.success('Contract signed successfully');
      return mergedContract;
    } catch (err) {
      console.error('Sign contract error:', err);
      if (err.response?.status === 401) {
        console.log('Unauthorized, redirecting to login');
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        navigate('/signin');
      }
      setError(err.message);
      toast.error('Failed to sign contract: ' + err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const depositFunds = useCallback(async (contractId, amount) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await contractService.depositFunds(contractId, amount);
      
      // Merge blockchain state with the updated contract
      const mergedContract = mergeBlockchainState(response);
      
      // Update the contract in the list with new state
      setContracts(prevContracts => {
        return prevContracts.map(c => 
          c._id === contractId ? mergedContract : c
        );
      });
      
      toast.success('Funds deposited successfully');
      return mergedContract;
    } catch (err) {
      console.error('Deposit funds error:', err);
      setError(err.message);
      toast.error('Failed to deposit funds: ' + err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [mergeBlockchainState]);

  // Initial fetch of contracts
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    console.log('Initial contract fetch - token exists:', !!token);
    if (token) {
      fetchContracts(false).catch(console.error);
    } else {
      setLoading(false);
    }
  }, [fetchContracts]);

  const contextValue = {
    contracts,
    loading,
    error,
    signContract,
    depositFunds,
    fetchContracts,
    getContract
  };

  console.log('Contract context state:', contextValue);

  return (
    <ContractContext.Provider value={contextValue}>
      {children}
    </ContractContext.Provider>
  );
};

export const useContracts = () => {
  const context = useContext(ContractContext);
  if (!context) {
    throw new Error('useContracts must be used within a ContractProvider');
  }
  return context;
};