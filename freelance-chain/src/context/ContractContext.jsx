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

      // The response is already the data array
      setContracts(response || []);
      return response;
    } catch (error) {
      console.error('Failed to fetch contracts:', error);
      setError(error.message);
      if (error.response?.status === 401) {
        console.log('Unauthorized, redirecting to login');
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        navigate('/signin');
      }
      if (showToast) {
        toast.error('Failed to fetch contracts: ' + error.message);
      }
      return [];
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const getContract = useCallback(async (contractId) => {
    try {
      // First check if we already have the contract in state
      const existingContract = contracts.find(c => c._id === contractId);
      if (existingContract && existingContract.blockchainState) {
        console.log('Contract found in state with blockchain state, skipping fetch');
        return existingContract;
      }

      console.log('Fetching contract:', contractId);
      const response = await contractService.getContract(contractId);
      console.log('Contract response:', response);

      if (!response) {
        console.warn('No response from getContract for ID:', contractId);
        return existingContract || null;
      }

      // If we got a response but no blockchain state, and we have an existing contract
      if (!response.blockchainState && existingContract) {
        console.log('Merging existing contract with new response');
        response.blockchainState = existingContract.blockchainState;
      }

      // Update the contract in the local state
      setContracts(prevContracts => {
        const updatedContracts = prevContracts.map(c => 
          c._id === contractId ? response : c
        );
        if (!prevContracts.find(c => c._id === contractId)) {
          updatedContracts.push(response);
        }
        console.log('Updated contracts state:', updatedContracts);
        return updatedContracts;
      });
      
      return response;
    } catch (error) {
      console.error('Failed to fetch contract:', error);
      // If we have an existing contract, return it even if blockchain state fetch failed
      const existingContract = contracts.find(c => c._id === contractId);
      if (existingContract) {
        console.log('Returning existing contract after error:', existingContract);
        return existingContract;
      }
      toast.error('Failed to fetch contract details: ' + error.message);
      throw error;
    }
  }, [contracts]);

  const signContract = async (contractId, signerAddress) => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Signing contract:', contractId, 'with address:', signerAddress);
      const result = await contractService.signContract(contractId, signerAddress);
      console.log('Sign contract response:', result);

      // Update the contract in the list with new state
      setContracts(prevContracts => {
        const newContracts = prevContracts.map(c => 
          c._id === contractId ? result : c
        );
        console.log('Updated contracts after signing:', newContracts);
        return newContracts;
      });
      
      toast.success('Contract signed successfully');
      return result;
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

export const useContracts = () => useContext(ContractContext);