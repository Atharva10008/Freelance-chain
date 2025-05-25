import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useContracts } from '../../context/ContractContext';
import { useWeb3 } from '../../context/Web3Context';
import ContractSign from './ContractSign';
import WorkSubmission from './WorkSubmission';
import { toast } from 'sonner';
import { ethers } from 'ethers';
import { CONTRACT_ABI } from '../../../utils/contract'; // Adjust path if needed

const ContractView = () => {
  const { contractId } = useParams();
  const navigate = useNavigate();
  const { contracts, loading, error, signContract, getContract } = useContracts();
  const { account } = useWeb3();
  const [activeTab, setActiveTab] = useState('details');
  const [contract, setContract] = useState(null);
  const [localLoading, setLocalLoading] = useState(true);

  useEffect(() => {
    const loadContract = async () => {
      try {
        setLocalLoading(true);
        
        // First try to get from context
        const contextContract = contracts.find(c => c._id === contractId);
        if (contextContract) {
          setContract(contextContract);
        }

        // Always fetch fresh data
        const freshContract = await getContract(contractId);
        setContract(freshContract);
      } catch (err) {
        console.error('Error loading contract:', err);
        toast.error('Failed to load contract: ' + err.message);
      } finally {
        setLocalLoading(false);
      }
    };

    if (contractId) {
      loadContract();
    }
  }, [contractId, getContract, contracts]);

  const handleSign = async (contractId, signerAddress) => {
    try {
      const updatedContract = await signContract(contractId, signerAddress);
      setContract(updatedContract);
      toast.success('Contract signed successfully');
    } catch (err) {
      console.error('Error signing contract:', err);
      toast.error('Failed to sign contract: ' + err.message);
    }
  };

  // Add signing logic
  const handleClientSign = async () => {
    try {
      if (!contract) return;
      if (!contract.contractAddress || contract.contractId === undefined) {
        toast.error('Contract address or ID missing');
        return;
      }
      if (!window.ethereum) {
        toast.error('MetaMask not detected');
        return;
      }

      // Connect to MetaMask
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const contractInstance = new ethers.Contract(
        contract.contractAddress,
        CONTRACT_ABI,
        signer
      );

      // First check contract state
      const contractData = await contractInstance.contracts(contract.contractId);
      console.log('Current contract state:', contractData);

      // Get and log addresses for debugging
      const clientAddress = await signer.getAddress();
      const contractClientAddress = contractData.client;
      
      console.log('Debug addresses:', {
        currentWallet: clientAddress,
        contractClient: contractClientAddress,
        contractClientLower: contractClientAddress.toLowerCase(),
        currentWalletLower: clientAddress.toLowerCase(),
        areEqual: clientAddress.toLowerCase() === contractClientAddress.toLowerCase()
      });

      // Verify client is the correct signer
      if (clientAddress.toLowerCase() !== contractClientAddress.toLowerCase()) {
        toast.error(`Address mismatch. Expected: ${contractClientAddress}, Got: ${clientAddress}`);
        return;
      }

      // Check if funds are already deposited
      if (contractData.fundsDeposited.gt(0)) {
        toast.error('Funds already deposited for this contract');
        return;
      }

      // Get VG token contract
      const vgTokenAddress = await contractInstance.vgToken();
      console.log('VG Token Address:', vgTokenAddress);
      
      const vgTokenABI = [
        "function approve(address spender, uint256 amount) public returns (bool)",
        "function allowance(address owner, address spender) public view returns (uint256)",
        "function balanceOf(address account) public view returns (uint256)"
      ];
      const vgTokenContract = new ethers.Contract(vgTokenAddress, vgTokenABI, signer);

      // Calculate deposit amount
      const depositAmount = contractData.bidAmount;
      console.log('Deposit amount:', ethers.utils.formatUnits(depositAmount, 18), 'VG');

      // Check VG token balance
      const balance = await vgTokenContract.balanceOf(clientAddress);
      console.log('VG Token Balance:', ethers.utils.formatUnits(balance, 18), 'VG');
      
      if (balance.lt(depositAmount)) {
        toast.error(`Insufficient VG tokens. Required: ${ethers.utils.formatUnits(depositAmount, 18)} VG`);
        return;
      }

      // Check and set allowance if needed
      const allowance = await vgTokenContract.allowance(clientAddress, contract.contractAddress);
      console.log('Current Allowance:', ethers.utils.formatUnits(allowance, 18), 'VG');
      
      if (allowance.lt(depositAmount)) {
        console.log('Setting VG token allowance...');
        const approveTx = await vgTokenContract.approve(contract.contractAddress, depositAmount);
        await approveTx.wait();
        console.log('VG token allowance set');
      }

      // Get current gas price and add 20% buffer
      const gasPrice = await provider.getGasPrice();
      const bufferedGasPrice = gasPrice.mul(120).div(100); // Add 20% buffer
      console.log('Gas price with buffer:', ethers.utils.formatUnits(bufferedGasPrice, 'gwei'), 'gwei');

      // Use a fixed gas limit for deposit
      const depositGasLimit = 300000; // This should be enough for a deposit transaction

      // Deposit funds
      console.log('Attempting to deposit funds...');
      const depositTx = await contractInstance.depositFunds(
        contract.contractId,
        { 
          gasPrice: bufferedGasPrice,
          gasLimit: depositGasLimit
        }
      );
      console.log('Deposit transaction sent:', depositTx.hash);
      
      // Wait for deposit confirmation
      const depositReceipt = await depositTx.wait();
      console.log('Deposit confirmed:', depositReceipt);

      // Verify deposit was successful
      const updatedContractData = await contractInstance.contracts(contract.contractId);
      if (updatedContractData.fundsDeposited.eq(0)) {
        throw new Error('Deposit verification failed');
      }

      // Use a fixed gas limit for signing
      const signGasLimit = 200000; // This should be enough for a sign transaction

      // Then sign the contract
      console.log('Attempting to sign contract...');
      const signTx = await contractInstance.signContract(
        contract.contractId,
        { 
          gasPrice: bufferedGasPrice,
          gasLimit: signGasLimit
        }
      );
      console.log('Sign transaction sent:', signTx.hash);
      
      // Wait for sign confirmation
      const signReceipt = await signTx.wait();
      console.log('Sign confirmed:', signReceipt);

      // Verify signing was successful
      const finalContractData = await contractInstance.contracts(contract.contractId);
      if (!finalContractData.clientApproved) {
        throw new Error('Signing verification failed');
      }

      toast.success('Contract signed and funds deposited successfully!');
      
      // Refresh contract state
      const freshContract = await getContract(contract._id);
      setContract(freshContract);
    } catch (err) {
      console.error('Signing failed:', err);
      
      // Handle specific error cases
      if (err.code === 'UNPREDICTABLE_GAS_LIMIT') {
        toast.error('Failed to estimate gas. Please try again or contact support.');
      } else if (err.code === 'INSUFFICIENT_FUNDS') {
        toast.error('Insufficient VG tokens to complete the transaction.');
      } else if (err.code === 'NONCE_EXPIRED') {
        toast.error('Transaction expired. Please try again.');
      } else if (err.code === 'CALL_EXCEPTION') {
        toast.error('Transaction failed. Please check contract requirements.');
      } else {
        toast.error('Signing failed: ' + (err?.message || 'Unknown error'));
      }
    }
  };

  const handleFreelancerSign = async () => {
    try {
      if (!contract) return;
      if (!contract.contractAddress || contract.contractId === undefined) {
        toast.error('Contract address or ID missing');
        return;
      }
      if (!window.ethereum) {
        toast.error('MetaMask not detected');
        return;
      }

      // Connect to MetaMask
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const contractInstance = new ethers.Contract(
        contract.contractAddress,
        CONTRACT_ABI,
        signer
      );

      // First check contract state
      const contractData = await contractInstance.contracts(contract.contractId);
      console.log('Current contract state:', contractData);

      // Verify freelancer is the correct signer
      const freelancerAddress = await signer.getAddress();
      if (freelancerAddress.toLowerCase() !== contractData.freelancer.toLowerCase()) {
        toast.error('Only the contract freelancer can sign');
        return;
      }

      // Check if client has already signed and deposited funds
      if (!contractData.clientApproved || contractData.fundsDeposited.eq(0)) {
        toast.error('Client must sign and deposit funds first');
        return;
      }

      // Check if freelancer has already signed
      if (contractData.freelancerApproved) {
        toast.error('Contract already signed by freelancer');
        return;
      }

      // Get current gas price and add 20% buffer
      const gasPrice = await provider.getGasPrice();
      const bufferedGasPrice = gasPrice.mul(120).div(100); // Add 20% buffer
      console.log('Gas price with buffer:', ethers.utils.formatUnits(bufferedGasPrice, 'gwei'), 'gwei');

      // Use a fixed gas limit for signing
      const signGasLimit = 200000; // This should be enough for a sign transaction

      // Sign contract
      const tx = await contractInstance.signContract(
        contract.contractId,
        { 
          gasPrice: bufferedGasPrice,
          gasLimit: signGasLimit
        }
      );
      console.log('Transaction sent:', tx.hash);
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt);

      // Verify signing was successful
      const updatedContractData = await contractInstance.contracts(contract.contractId);
      if (!updatedContractData.freelancerApproved) {
        throw new Error('Signing verification failed');
      }

      toast.success('Contract signed successfully!');
      
      // Refresh contract state
      const freshContract = await getContract(contract._id);
      setContract(freshContract);
    } catch (err) {
      console.error('Signing failed:', err);
      
      // Handle specific error cases
      if (err.code === 'UNPREDICTABLE_GAS_LIMIT') {
        toast.error('Failed to estimate gas. Please try again or contact support.');
      } else if (err.code === 'NONCE_EXPIRED') {
        toast.error('Transaction expired. Please try again.');
      } else if (err.code === 'CALL_EXCEPTION') {
        toast.error('Transaction failed. Please check contract requirements.');
      } else {
        toast.error('Signing failed: ' + (err?.message || 'Unknown error'));
      }
    }
  };

  // Helper for safe checksummed address
  const getChecksum = (addr) => {
    try {
      return addr ? ethers.utils.getAddress(addr) : '';
    } catch {
      return addr || '';
    }
  };

  if (loading || localLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded my-4">
        <h3 className="font-bold">Error Loading Contract</h3>
        <p>{error}</p>
        <button 
          onClick={() => getContract(contractId)} 
          className="mt-2 px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="p-4 bg-yellow-50 border-l-4 border-yellow-500 text-yellow-700 rounded my-4">
        <h3 className="font-bold">Contract Not Found</h3>
        <p>Could not find contract with ID: {contractId}</p>
        <button 
          onClick={() => navigate('/contracts')} 
          className="mt-2 px-4 py-2 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
        >
          Back to Contracts
        </button>
      </div>
    );
  }

  // Use checksummed addresses for comparison
  const isClient = getChecksum(account) === getChecksum(contract.client?.walletAddress);
  const isFreelancer = getChecksum(account) === getChecksum(contract.freelancer?.walletAddress);
  const canSign = (isClient && !contract.clientSigned) || (isFreelancer && !contract.freelancerSigned);

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-secondary">{contract.jobTitle}</h1>
          <p className="text-gray-600 mt-2">{contract.jobDescription}</p>
        </div>

        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('details')}
              className={`px-4 py-3 font-medium text-sm ${activeTab === 'details' ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Contract Details
            </button>
            <button
              onClick={() => setActiveTab('work')}
              className={`px-4 py-3 font-medium text-sm ${activeTab === 'work' ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Work Submission
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'details' ? (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="font-medium text-gray-500">Client</h3>
                  <p className="mt-1">{contract.client?.name || 'N/A'}</p>
                  <p className="text-sm text-gray-500">{contract.client?.walletAddress || 'N/A'}</p>
                  <p className="text-xs text-blue-700">MetaMask account: {getChecksum(account)}</p>
                  <p className="text-xs text-blue-700">Contract client: {getChecksum(contract.client?.walletAddress)}</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-500">Freelancer</h3>
                  <p className="mt-1">{contract.freelancer?.name || 'N/A'}</p>
                  <p className="text-sm text-gray-500">{contract.freelancer?.walletAddress || 'N/A'}</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-500">Bid Amount</h3>
                  <p className="mt-1">{contract.bidAmount} ETH</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-500">Deadline</h3>
                  <p className="mt-1">{new Date(contract.deadline).toLocaleDateString()}</p>
                </div>
                {contract.contractAddress && (
                  <>
                    <div>
                      <h3 className="font-medium text-gray-500">Smart Contract Address</h3>
                      <p className="mt-1 text-sm break-all">{contract.contractAddress}</p>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-500">Transaction Hash</h3>
                      <p className="mt-1 text-sm break-all">{contract.transactionHash}</p>
                    </div>
                  </>
                )}
              </div>

              {contract.blockchainState && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium text-gray-700 mb-2">Blockchain State</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Status</p>
                      <p className="font-medium capitalize">{contract.blockchainState.status}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Client Approved</p>
                      <p className="font-medium">{contract.blockchainState.clientApproved ? 'Yes' : 'No'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Freelancer Approved</p>
                      <p className="font-medium">{contract.blockchainState.freelancerApproved ? 'Yes' : 'No'}</p>
                    </div>
                    {contract.blockchainState.workSubmissionHash && (
                      <div>
                        <p className="text-sm text-gray-500">Work Submission Hash</p>
                        <p className="font-medium break-all">{contract.blockchainState.workSubmissionHash}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Signing buttons */}
              {isClient && !contract.clientSigned && (
                <button
                  onClick={handleClientSign}
                  className="bg-primary text-white px-4 py-2 rounded hover:bg-opacity-90 mt-4"
                  disabled={localLoading}
                >
                  Sign Contract & Deposit Funds
                </button>
              )}

              {isFreelancer && contract.clientSigned && !contract.freelancerSigned && (
                <button
                  onClick={handleFreelancerSign}
                  className="bg-primary text-white px-4 py-2 rounded hover:bg-opacity-90 mt-4"
                  disabled={localLoading}
                >
                  Sign Contract
                </button>
              )}

              {/* Work submission and approval buttons */}
              {contract.status === 'Active' && isFreelancer && (
                <WorkSubmission contract={contract} />
              )}

              {contract.status === 'InProgress' && isClient && (
                <div className="mt-4 space-x-4">
                  <button
                    onClick={handleApproveWork}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                  >
                    Approve Work
                  </button>
                  <button
                    onClick={handleRejectWork}
                    className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                  >
                    Reject Work
                  </button>
                </div>
              )}
            </div>
          ) : (
            <WorkSubmission contract={contract} />
          )}
        </div>
      </div>
    </div>
  );
};

export default ContractView;