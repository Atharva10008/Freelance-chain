import React, { createContext, useContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ABI } from '../../utils/contract';

// Create context
const Web3Context = createContext();

// Provider component
export const Web3Provider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isAuthorizedSigner, setIsAuthorizedSigner] = useState(false);

  // Define both hex and numeric versions
  const VANGUARD_CHAIN_ID = '0x13314'; // Hex string for MetaMask
  const VANGUARD_CHAIN_ID_NUM = 78600; // Numeric for comparisons
  
  const VANGUARD_NETWORK = {
    chainId: VANGUARD_CHAIN_ID,
    chainName: 'Vanguard',
    nativeCurrency: {
      name: 'VG',
      symbol: 'VG',
      decimals: 18
    },
    rpcUrls: ['https://rpc-vanguard.vanarchain.com'],
    blockExplorerUrls: ['https://explorer.vanarchain.com']
  };

  const checkSignerAuthorization = async (address) => {
    if (!provider || !address) return false;
    try {
      const contract = new ethers.Contract(
        import.meta.env.VITE_CONTRACT_ADDRESS,
        CONTRACT_ABI,
        provider
      );
      const isAuthorized = await contract.authorizedSigners(address);
      setIsAuthorizedSigner(isAuthorized);
      return isAuthorized;
    } catch (error) {
      console.error('Error checking signer authorization:', error);
      return false;
    }
  };

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        throw new Error('Please install MetaMask');
      }

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      
      // Get current chain ID as number
      const network = await provider.getNetwork();
      const currentChainId = network.chainId;

      // Compare numbers
      if (currentChainId !== VANGUARD_CHAIN_ID_NUM) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: VANGUARD_CHAIN_ID }], // Use hex string here
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            try {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [VANGUARD_NETWORK],
              });
            } catch (addError) {
              throw new Error('Failed to add Vanguard network to MetaMask');
            }
          } else {
            throw switchError;
          }
        }
      }

      const signer = provider.getSigner();
      const address = await signer.getAddress();

      setProvider(provider);
      setSigner(signer);
      setAccount(address);
      setIsConnected(true);
      setChainId(VANGUARD_CHAIN_ID_NUM); // Store numeric version

      await checkSignerAuthorization(address);

    } catch (error) {
      console.error('Error connecting wallet:', error);
      throw error;
    }
  };

  const disconnectWallet = () => {
    setIsConnected(false);
    setAccount(null);
    setProvider(null);
    setSigner(null);
    setChainId(null);
    setIsAuthorizedSigner(false);
  };

  useEffect(() => {
    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else {
        setAccount(accounts[0]);
        checkSignerAuthorization(accounts[0]);
      }
    };

    const handleChainChanged = (hexChainId) => {
      // Convert hex to number for comparison
      const chainIdNum = parseInt(hexChainId, 16);
      if (chainIdNum !== VANGUARD_CHAIN_ID_NUM) {
        disconnectWallet();
      }
      window.location.reload();
    };

    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      window.ethereum.request({ method: 'eth_accounts' })
        .then(accounts => {
          if (accounts.length > 0) {
            connectWallet();
          }
        })
        .catch(console.error);
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, []);

  return (
    <Web3Context.Provider
      value={{
        isConnected,
        account,
        provider,
        signer,
        chainId,
        isAuthorizedSigner,
        connectWallet,
        disconnectWallet,
        checkSignerAuthorization
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};

// Custom hook for easy access
export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('useWeb3 must be used within a Web3Provider');
  }
  return context;
};
