import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useContracts } from '../../context/ContractContext';
import { useWeb3 } from '../../context/Web3Context';
import ContractSign from './ContractSign';
import WorkSubmission from './WorkSubmission';
import { toast } from 'sonner';
import { ethers } from 'ethers';
import { CONTRACT_ABI } from '../../../utils/contract'; // Adjust path if needed

// Helper function to validate addresses
const validateAddress = (address) => {
  try {
    return address ? ethers.utils.getAddress(address) : null;
  } catch {
    return null;
  }
};

const ContractView = () => {
  const { contractId } = useParams();
  const navigate = useNavigate();
  const { contracts, loading, error, signContract, getContract, fetchContracts } = useContracts();
  const { account } = useWeb3();
  const [activeTab, setActiveTab] = useState('details');
  const [localLoading, setLocalLoading] = useState(true);

  // Find the specific contract being viewed from the context
  const contract = useMemo(() => {
    const foundContract = contracts.find(c => c._id === contractId);
    console.log('ContractView useMemo recalculating. Found contract:', foundContract);
    console.log('ContractView useMemo - clientApproved status:', foundContract?.clientApproved);
    return foundContract;
  }, [contractId, contracts]);

  // Add debug logging for contract state updates
  useEffect(() => {
    if (contract) {
      console.log('Contract state update detected:', {
        id: contract._id,
        clientApproved: contract.clientApproved,
        blockchainApproved: contract.blockchainState?.clientApproved,
        status: contract.status,
        blockchainStatus: contract.blockchainState?.status,
        fullContract: contract
      });
    }
  }, [contract]);

  useEffect(() => {
    if (!contract && !loading && !error) {
      console.log('Contract not found in context, attempting to fetch.');
      fetchContracts(false);
    } else if (contract) {
      setLocalLoading(false);
      if (contract.blockchainState) {
        console.log('Contract blockchain state available in useEffect:', {
          clientApproved: contract.blockchainState.clientApproved,
          freelancerApproved: contract.blockchainState.freelancerApproved,
          fundsDeposited: contract.blockchainState.fundsDeposited,
          status: contract.blockchainState.status,
          fullBlockchainState: contract.blockchainState
        });
      }
    } else if (error) {
      setLocalLoading(false);
    }
  }, [contractId, contracts, loading, error, fetchContracts, contract]);

  const handleSign = async (contractId, signerAddress) => {
    try {
      // The signContract function in context already handles blockchain interaction
      // It also updates the contracts array in the context upon success
      await signContract(contractId, signerAddress);
      toast.success('Contract signed successfully');
    } catch (err) {
      console.error('Error signing contract:', err);
      toast.error('Failed to sign contract: ' + err.message);
    }
  };

  const handleClientSign = async () => {
    try {
      setLocalLoading(true);
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
      const provider = new ethers.providers.Web3Provider(window.ethereum, {
        name: 'Vanguard',
        chainId: 78600,
        ensAddress: null
      });
      const signer = provider.getSigner();
      const contractInstance = new ethers.Contract(
        contract.contractAddress,
        CONTRACT_ABI,
        signer
      );

      // First check contract state
      let currentContractState = await contractInstance.getContract(contract.contractId);
      console.log('Current contract state:', currentContractState);

      // Verify client is the correct signer
      const clientAddress = await signer.getAddress();
      const contractClientAddress = currentContractState.client;
      console.log('Debug addresses:', {
        currentWallet: clientAddress,
        contractClient: contractClientAddress,
        areEqual: clientAddress.toLowerCase() === contractClientAddress.toLowerCase()
      });

      if (clientAddress.toLowerCase() !== contractClientAddress.toLowerCase()) {
        toast.error(`Address mismatch. Expected: ${contractClientAddress}, Got: ${clientAddress}`);
        setLocalLoading(false);
        return;
      }

      // Calculate deposit amount
      const depositAmount = currentContractState.bidAmount;
      console.log('Deposit amount:', ethers.utils.formatEther(depositAmount), 'VG');
      console.log('Raw deposit amount:', depositAmount.toString());

      // Check native coin balance
      let balance;
      try {
        balance = await signer.getBalance();
        console.log('Native Balance:', ethers.utils.formatEther(balance), 'VG');
      } catch (err) {
        console.error('Error checking native balance:', err);
        toast.error('Failed to check native balance. Please try again.');
        setLocalLoading(false);
        return;
      }

      const gasBuffer = ethers.utils.parseEther('0.01');
      const totalRequired = depositAmount.add(gasBuffer);

      if (balance.lt(totalRequired)) {
        toast.error(`Insufficient native funds. Required: ${ethers.utils.formatEther(totalRequired)} VG (Bid + gas), Available: ${ethers.utils.formatEther(balance)} VG`);
        setLocalLoading(false);
        return;
      }

      // Get current gas price and add 20% buffer
      const gasPrice = await provider.getGasPrice();
      const bufferedGasPrice = gasPrice.mul(120).div(100);
      console.log('Gas price with buffer:', ethers.utils.formatUnits(bufferedGasPrice, 'gwei'), 'gwei');

      // Use clientSignAndDeposit to handle both signing and depositing in one transaction
      if (!currentContractState.clientApproved || !currentContractState.fundsDeposited) {
        console.log('Signing contract and depositing funds...');
        const signAndDepositTx = await contractInstance.clientSignAndDeposit(
          contract.contractId,
          {
            value: depositAmount,
            gasPrice: bufferedGasPrice,
            gasLimit: 500000 // Increased gas limit for combined operation
          }
        );
        console.log('Sign and deposit transaction sent:', signAndDepositTx.hash);
        toast.info('Transaction sent! Waiting for confirmation...');
        
        const receipt = await signAndDepositTx.wait();
        console.log('Transaction confirmed:', receipt);

        // Implement retry logic for state verification
        console.log('Transaction confirmed. Verifying blockchain state with retries...');
        const MAX_VERIFY_RETRIES = 10; // Maximum number of retry attempts
        const RETRY_DELAY_MS = 2000; // Delay between retries in milliseconds
        let verificationSuccess = false;

        for (let i = 0; i < MAX_VERIFY_RETRIES; i++) {
            try {
                currentContractState = await contractInstance.getContract(contract.contractId);
                console.log(`Attempt ${i + 1}: Fetched state - Client Approved: ${currentContractState.clientApproved}, Funds Deposited: ${currentContractState.fundsDeposited}`);
                
                if (currentContractState.clientApproved && currentContractState.fundsDeposited) {
                    verificationSuccess = true;
                    console.log('State verification successful.');
                    break; // Exit loop if verification passes
                }
            } catch (verifyError) {
                console.warn(`Attempt ${i + 1}: Error fetching state - ${verifyError.message}`);
                // Continue retrying on fetch errors
            }

            if (i < MAX_VERIFY_RETRIES - 1) {
                console.log(`Retrying state verification in ${RETRY_DELAY_MS}ms...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            }
        }

        if (!verificationSuccess) {
            console.error('State verification failed after multiple retries.');
            throw new Error('Verification failed: Contract not properly signed or funds not deposited after multiple attempts.');
        }

        toast.success('Contract signed and funds deposited successfully!');
      } else {
        toast.info('Contract already signed and funds deposited');
      }

      // Update local state
      await fetchContracts(false);

    } catch (err) {
      console.error('Error in contract interaction:', err);
      let errorMessage = 'Transaction failed';
      
      if (err.code === 'CALL_EXCEPTION') {
        if (err.error && err.error.message) {
          errorMessage = `Contract execution failed: ${err.error.message}`;
        } else if (err.message && err.message.includes('execution reverted')) {
          const revertReason = err.message.split('execution reverted:')[1];
          errorMessage = revertReason ? `Contract execution failed: ${revertReason.trim()}` : 'Contract execution failed. A contract requirement was not met.';
        }
      } else if (err.code === 'INSUFFICIENT_FUNDS') {
        errorMessage = 'Insufficient funds for transaction. Please ensure you have enough VG for the deposit and gas fees.';
      } else if (err.code === 'UNPREDICTABLE_GAS_LIMIT') {
        errorMessage = 'Failed to estimate gas. Please try again or contact support.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      toast.error(errorMessage);
      throw err;
    } finally {
      setLocalLoading(false);
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
      const provider = new ethers.providers.Web3Provider(window.ethereum, {
        name: 'Vanguard',
        chainId: 78600,
        ensAddress: null
      });
      const signer = provider.getSigner();
      const contractInstance = new ethers.Contract(
        contract.contractAddress,
        CONTRACT_ABI,
        signer
      );

      // First check contract state
      const contractData = await contractInstance.getContract(contract.contractId);
      console.log('Current contract state before signing:', {
        status: contractData.status,
        clientSigned: contractData.clientSigned,
        freelancerSigned: contractData.freelancerSigned,
        fundsDeposited: contractData.fundsDeposited,
        client: contractData.client,
        freelancer: contractData.freelancer
      });

      // Verify freelancer is the correct signer
      const freelancerAddress = await signer.getAddress();
      console.log('Freelancer address check:', {
        signerAddress: freelancerAddress,
        contractFreelancer: contractData.freelancer,
        isMatch: freelancerAddress.toLowerCase() === contractData.freelancer.toLowerCase()
      });

      if (freelancerAddress.toLowerCase() !== contractData.freelancer.toLowerCase()) {
        toast.error('Only the contract freelancer can sign');
        return;
      }

      // Check if client has already signed and deposited funds
      if (contractData.status !== 1) {
        console.error('Contract status check failed:', {
          currentStatus: contractData.status,
          expectedStatus: 1,
          clientSigned: contractData.clientSigned,
          fundsDeposited: contractData.fundsDeposited
        });
        toast.error('Client must sign and deposit funds first');
        return;
      }

      // Get current gas price and add 20% buffer
      const gasPrice = await provider.getGasPrice();
      const bufferedGasPrice = gasPrice.mul(120).div(100);
      console.log('Gas price with buffer:', ethers.utils.formatUnits(bufferedGasPrice, 'gwei'), 'gwei');

      // Use a fixed gas limit for signing
      const signGasLimit = 200000;

      console.log('Attempting to sign contract with parameters:', {
        contractId: contract.contractId,
        gasPrice: ethers.utils.formatUnits(bufferedGasPrice, 'gwei'),
        gasLimit: signGasLimit
      });

      // Sign contract using freelancerSign function
      const tx = await contractInstance.freelancerSign(
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

      if (receipt.status === 0) {
        throw new Error('Transaction failed - contract requirements not met');
      }

      // Verify signing was successful
      const updatedContractData = await contractInstance.getContract(contract.contractId);
      console.log('Contract state after signing:', {
        status: updatedContractData.status,
        clientSigned: updatedContractData.clientSigned,
        freelancerSigned: updatedContractData.freelancerSigned,
        fundsDeposited: updatedContractData.fundsDeposited
      });

      if (!updatedContractData.freelancerSigned) {
        throw new Error('Signing verification failed');
      }

      toast.success('Contract signed successfully!');
      
      // Refetch all contracts to ensure UI is updated with the latest state
      await fetchContracts(false); // Fetch silently without toast
    } catch (err) {
      console.error('Signing failed:', err);
      let errorMessage = 'Failed to sign contract';
      
      // Handle specific error cases
      if (err.code === 'UNPREDICTABLE_GAS_LIMIT') {
        errorMessage = 'Failed to estimate gas. Please try again or contact support.';
      } else if (err.code === 'NONCE_EXPIRED') {
        errorMessage = 'Transaction expired. Please try again.';
      } else if (err.code === 'CALL_EXCEPTION') {
        errorMessage = 'Transaction failed. Please check contract requirements.';
      } else if (err.message && err.message.includes('execution reverted')) {
        errorMessage = `Transaction failed: ${err.message.split('execution reverted:')[1] || err.message}`;
      }
      
      toast.error(errorMessage);
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

  // Use checksummed addresses for comparison
  const isClient = getChecksum(account) === getChecksum(contract?.client?.walletAddress);
  const isFreelancer = getChecksum(account) === getChecksum(contract?.freelancer?.walletAddress);
  
  // Update the canSign logic to check both contract and blockchain state
  const isClientApproved = Boolean(contract?.clientApproved || contract?.blockchainState?.clientApproved);
  const isFreelancerApproved = Boolean(contract?.freelancerApproved || contract?.blockchainState?.freelancerApproved);
  const canClientSign = isClient && !isClientApproved;
  const canFreelancerSign = isFreelancer && !isFreelancerApproved;

  // Add log to check the value used for rendering the client sign button
  console.log('Rendering client sign button:', { 
    isClient, 
    clientApproved: isClientApproved, 
    canRender: canClientSign,
    blockchainState: contract?.blockchainState,
    contractState: {
      clientApproved: contract?.clientApproved,
      freelancerApproved: contract?.freelancerApproved,
      status: contract?.status
    }
  });

  // Add a log to check the clientApproved status at the start of render
  console.log('ContractView rendering - clientApproved status:', isClientApproved);

  // Add debug log for the condition
  if (contract && contract.blockchainState) {
    console.log('Work Submission Tab Condition Check:', {
      blockchainStatus: contract.blockchainState.status,
      isFreelancer: isFreelancer,
      contractStatus: contract.status, // Also log backend status for comparison
      account: account,
      freelancerWalletAddress: contract.freelancer?.walletAddress,
      checksumAccount: getChecksum(account),
      checksumFreelancer: getChecksum(contract.freelancer?.walletAddress)
    });
  } else if (contract) {
     console.log('Work Submission Tab Condition Check: blockchainState is undefined', { contractStatus: contract.status, account: account, freelancerWalletAddress: contract.freelancer?.walletAddress });
  }

  // Handle Work Approval by Client
  const handleApproveWork = async () => {
    try {
      setLocalLoading(true);
      if (!contract) return;
      if (!contract.contractAddress || contract.contractId === undefined) {
        toast.error('Contract address or ID missing');
        return;
      }
      if (!window.ethereum) {
        toast.error('MetaMask not detected');
        return;
      }

      console.log('Attempting to approve work for contract ID:', contract.contractId);

      // Connect to MetaMask and get signer
      const provider = new ethers.providers.Web3Provider(window.ethereum, {
        name: 'Vanguard',
        chainId: 78600, // Make sure this matches your network config
        ensAddress: null
      });
      const signer = provider.getSigner();
      const contractInstance = new ethers.Contract(
        contract.contractAddress,
        CONTRACT_ABI,
        signer
      );

      // Verify client is the correct signer
      const clientAddress = await signer.getAddress();
      const contractClientAddress = contract.blockchainState?.client; // Use blockchain client address
      
      console.log('Debug addresses (Approve Work):', {
          currentWallet: clientAddress,
          contractClient: contractClientAddress,
          areEqual: clientAddress.toLowerCase() === contractClientAddress?.toLowerCase()
      });
      
      if (clientAddress.toLowerCase() !== contractClientAddress?.toLowerCase()) {
          toast.error('Only the contract client can approve work');
          setLocalLoading(false);
          return;
      }

      // Check contract status on chain - Should be WorkSubmitted
      const currentContractState = await contractInstance.getContract(contract.contractId);
       if (currentContractState.status.toString() !== '3') { // 3 is WorkSubmitted
           toast.error(`Work is not in the submitted state. Current status: ${currentContractState.status}`);
           setLocalLoading(false);
           return;
       }

      console.log('Sending approveWork transaction...');
      const tx = await contractInstance.approveWork(contract.contractId);
      console.log('ApproveWork transaction sent, hash:', tx.hash);

      toast.info('Approve Work transaction sent! Waiting for confirmation...');
      const receipt = await tx.wait();
      console.log('ApproveWork transaction confirmed:', receipt);

      if (receipt.status === 1) {
        toast.success('Work approved successfully!');
        // Refetch contract to update UI
        fetchContracts(false); // Fetch silently
      } else {
        throw new Error('Approve work transaction failed on chain.');
      }

    } catch (err) {
      console.error('Error approving work:', err);
      let errorMessage = 'Failed to approve work.';

      if (err.code === 'UNPREDICTABLE_GAS_LIMIT') {
         errorMessage = 'Failed to estimate gas. Please try again or contact support.';
      } else if (err.code === 'CALL_EXCEPTION') {
         errorMessage = 'Transaction failed on chain. Check contract state and requirements.';
         if (err.error && err.error.message) { errorMessage += ` Error: ${err.error.message}`; }
         else if (err.message && err.message.includes('execution reverted')) { 
             const revertReason = err.message.split('execution reverted:')[1];
             errorMessage += revertReason ? ` Revert Reason: ${revertReason.trim()}` : ' No specific revert reason.';
         }
      } else if (err.message) {
        errorMessage = err.message;
      }

      toast.error(errorMessage);
    } finally {
      setLocalLoading(false);
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
                  <p className="mt-1">{contract.bidAmount} VG</p>
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
                      <p className="font-medium">{isClientApproved ? 'Yes' : 'No'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Freelancer Approved</p>
                      <p className="font-medium">{isFreelancerApproved ? 'Yes' : 'No'}</p>
                    </div>
                    {contract.blockchainState.workSubmissionHash && (
                      <div>
                        <p className="text-sm text-gray-500">Work Submission Hash</p>
                        <p className="font-medium break-all">{contract.blockchainState.workSubmissionHash}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-gray-500">Funds Deposited</p>
                      <p className="font-medium">{contract.blockchainState.fundsDeposited ? 'Yes' : 'No'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Signing buttons */}
              {canClientSign && (
                <button
                  onClick={handleClientSign}
                  className="bg-primary text-white px-4 py-2 rounded hover:bg-opacity-90 mt-4"
                  disabled={localLoading}
                >
                  Sign Contract & Deposit Funds
                </button>
              )}

              {canFreelancerSign && isClientApproved && (
                <button
                  onClick={handleFreelancerSign}
                  className="bg-primary text-white px-4 py-2 rounded hover:bg-opacity-90 mt-4"
                  disabled={localLoading}
                >
                  Sign Contract
                </button>
              )}

              {/* Work submission and approval buttons */}
              {contract.blockchainState?.status === 'BothSigned' && isFreelancer && (
                <WorkSubmission contract={contract} />
              )}

              {contract.blockchainState?.status === 'WorkSubmitted' && isClient && (
                <div className="mt-4 space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">Work Submitted for Review</h3>
                  {contract.blockchainState?.workSubmissionHash && (
                      <div className="p-4 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-700 mb-2">Submitted Work Hash:</p>
                          {/* Construct IPFS gateway URL using the work hash */}
                          {/* REPLACE YOUR_IPFS_GATEWAY_URL with your actual gateway */}
                          <a 
                              href={`https://ipfs.io/ipfs/${contract.blockchainState.workSubmissionHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline break-all text-sm"
                          >
                              {contract.blockchainState.workSubmissionHash}
                          </a>
                           <p className="text-xs text-gray-500 mt-1">Click the hash above to view the submitted work.</p>
                      </div>
                  )}
                  
                  {/* Approval button */}
                  <button
                    onClick={handleApproveWork}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                    disabled={localLoading}
                  >
                    Approve Work
                  </button>
                   {/* Add Reject Work button if needed */}
                </div>
              )}
            </div>
          ) : (
            /* Decide what to show in the Work Submission tab based on status and role */
            /* If work is submitted and client is viewing, show the submitted work details */
            contract.blockchainState?.status === 'WorkSubmitted' && isClient ? (
                <div className="mt-4 space-y-4">
                    <h3 className="text-lg font-medium text-gray-900">Submitted Work</h3>
                    {contract.blockchainState?.workSubmissionHash && (
                        <div className="p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-700 mb-2">Submitted Work Hash:</p>
                             {/* Construct IPFS gateway URL using the work hash */}
                             {/* REPLACE YOUR_IPFS_GATEWAY_URL with your actual gateway */}
                            <a 
                                href={`https://ipfs.io/ipfs/${contract.blockchainState.workSubmissionHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline break-all text-sm"
                            >
                                {contract.blockchainState.workSubmissionHash}
                            </a>
                             <p className="text-xs text-gray-500 mt-1">Click the hash above to view the submitted work.</p>
                        </div>
                    )}
                     {/* Client actions (Approve/Reject) could also go here */}
                     {/* Moved approval button here as well when client is viewing the work tab */}
                      {contract.blockchainState?.status === 'WorkSubmitted' && isClient && (
                         <button
                           onClick={handleApproveWork}
                           className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                           disabled={localLoading}
                         >
                           Approve Work
                         </button>
                      )}
                </div>
            ) : ( /* Otherwise, show the Work Submission form (for freelancer or if not submitted) */
                 <WorkSubmission contract={contract} />
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default ContractView;