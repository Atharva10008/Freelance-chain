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
        throw new Error('Authentication required');
      }

      const response = await contractService.getUserContracts();
      setContracts(response || []);
      return response;
    } catch (error) {
      console.error('Failed to fetch contracts:', error);
      setError(error.message);
      if (error.response?.status === 401) {
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

  const getContract = useCallback(async (contractIdOrMongoId) => {
    try {
      // Try to find the contract in state first
      const existingContract = contracts.find(c => 
        c._id === contractIdOrMongoId || c.contractId?.toString() === contractIdOrMongoId
      );

      // If we have a complete contract in state, return it
      if (existingContract && existingContract.blockchainState) {
        return existingContract;
      }

      // Fetch from backend
      const response = await contractService.getContract(contractIdOrMongoId);

      // Only try to fetch blockchain state if we have a valid contractId
      if (
        response &&
        response.contractId &&
        !isNaN(Number(response.contractId)) &&
        response.blockchainState === undefined
      ) {
        try {
          const blockchainState = await contractService.getContract(response.contractId);
          response.blockchainState = blockchainState;
        } catch (err) {
          console.warn('Failed to fetch blockchain state:', err);
        }
      }

      // Update state only if the contract is not already in state or needs updating
      setContracts(prevContracts => {
        const contractExists = prevContracts.some(c => 
          c._id === response._id || c.contractId?.toString() === response.contractId?.toString()
        );
        
        if (!contractExists) {
          return [...prevContracts, response];
        }
        
        return prevContracts.map(c => 
          c._id === response._id || c.contractId?.toString() === response.contractId?.toString()
            ? response
            : c
        );
      });

      return response;
    } catch (error) {
      console.error('Failed to fetch contract:', error);
      throw error;
    }
  }, [contracts]);

  const signContract = useCallback(async (contractId) => {
    try {
      setLoading(true);
      const result = await contractService.signContract(contractId);
      
      // Refresh the contract data after signing
      await getContract(contractId);
      
      return result;
    } catch (error) {
      console.error('Error in ContractContext signContract:', error);
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [getContract]);

  // Initial fetch of contracts
  useEffect(() => {
    const token = localStorage.getItem('authToken');
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

  return (
    <ContractContext.Provider value={contextValue}>
      {children}
    </ContractContext.Provider>
  );
};

export const useContract = () => useContext(ContractContext);