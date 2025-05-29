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
      if (!contract) return;
      if (!contract.contractAddress) {
        toast.error('Contract address is missing');
        return;
      }
      if (!window.ethereum) {
        toast.error('MetaMask not detected');
        return;
      }

      setLocalLoading(true);

      // Connect to MetaMask with explicit network configuration
      const provider = new ethers.providers.Web3Provider(window.ethereum, {
        name: 'Vanguard',
        chainId: 78600,
        ensAddress: null
      });
      const signer = provider.getSigner();

      // Validate contract address
      const contractAddress = validateAddress(contract.contractAddress);
      if (!contractAddress) {
        toast.error('Invalid contract address');
        setLocalLoading(false);
        return;
      }

      console.log('Contract State:', {
        contractAddress,
        contractId: contract.contractId,
        provider: provider,
        signer: signer
      });

      // Initialize contract with signer
      let contractInstance;
      try {
        contractInstance = new ethers.Contract(
          contractAddress,
          CONTRACT_ABI,
          signer
        );
        console.log('Contract instance created successfully');

        // First check current contract state from the blockchain
        let currentContractState = await contractInstance.getContract(contract.contractId);
        console.log('Current blockchain contract state:', currentContractState);

        // Verify client is the correct signer
        const clientAddress = validateAddress(await signer.getAddress());
        const contractClientAddress = validateAddress(currentContractState.client);

        if (!clientAddress || !contractClientAddress) {
          toast.error('Invalid address detected');
          setLocalLoading(false);
          return;
        }
      
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

        if (!currentContractState.fundsDeposited) {
          console.log('Funds not deposited, proceeding with deposit...');

          // Calculate deposit amount
          const depositAmount = currentContractState.bidAmount;
          console.log('Deposit amount:', ethers.utils.formatEther(depositAmount), 'VG');

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

          const depositGasLimit = 300000;

          console.log('Attempting to deposit funds...');
          const depositTx = await contractInstance.depositFunds(
            contract.contractId,
            { 
              value: depositAmount,
              gasPrice: bufferedGasPrice,
              gasLimit: depositGasLimit
            }
          );
          console.log('Deposit transaction sent:', depositTx.hash);
          
          console.log('Waiting for deposit confirmation...');
          const depositReceipt = await depositTx.wait();
          console.log('Deposit confirmed:', depositReceipt);

          if (depositReceipt.status === 1) {
            console.log('Deposit transaction was successful on chain.');
          } else {
            console.error('Deposit transaction failed on chain.', depositReceipt);
            throw new Error('Deposit transaction failed.');
          }

          console.log('Re-fetching contract state after deposit...');
          currentContractState = await contractInstance.getContract(contract.contractId);
          console.log('Updated contract state after deposit:', currentContractState);

          if (!currentContractState.fundsDeposited) {
            throw new Error('Deposit verification failed: Funds not marked as deposited on chain after transaction.');
          }
          toast.success('Funds deposited successfully!');

          console.log('Waiting for blockchain state to update...');
          await new Promise(resolve => setTimeout(resolve, 5000));

          console.log('Final contract state check before signing...');
          currentContractState = await contractInstance.getContract(contract.contractId);
          console.log('Final contract state before signing:', currentContractState);

          if (!currentContractState.fundsDeposited) {
            throw new Error('Funds not properly deposited. Please try again.');
          }
        } else {
          console.log('Funds already deposited, skipping deposit step.');
          console.log('Fetching latest contract state as funds are already deposited...');
          currentContractState = await contractInstance.getContract(contract.contractId);
          console.log('Latest contract state:', currentContractState);
        }

        console.log('Checking clientApproved state:', currentContractState.clientApproved);
        if (currentContractState.clientApproved) {
          toast.info('Contract already signed by client');
          setLocalLoading(false);
          return;
        }

        const signGasLimit = 200000;

        console.log('Attempting to send clientSignContract transaction...');
        const signTx = await contractInstance.clientSignContract(
          contract.contractId,
          { 
            gasLimit: signGasLimit
          }
        );
        console.log('Sign transaction sent:', signTx.hash);
        
        console.log('Waiting for clientSignContract confirmation...');
        const signReceipt = await signTx.wait();
        console.log('ClientSignContract confirmed:', signReceipt);

        if (signReceipt.status === 1) {
          console.log('ClientSignContract transaction was successful on chain.');

          fetchContracts(); // Refresh the contract list to get the updated state

          await new Promise(resolve => setTimeout(resolve, 2000)); // Add a 2-second delay

          toast.success('Contract signed by client successfully!');

        } else {
          console.error('ClientSignContract transaction failed on chain.', signReceipt);
          throw new Error('ClientSignContract transaction failed.');
        }

        const finalContractData = await contractInstance.getContract(contract.contractId);
        console.log('Final contract state after signing:', finalContractData);

        if (!finalContractData.clientApproved) {
          throw new Error('Signing verification failed: Client not marked as approved on chain after transaction.');
        }

        // After successful signing, force a refresh of the contract data
        const updatedContract = await getContract(contractId);
        
        // Force a refetch of all contracts to ensure UI is updated
        await fetchContracts(false);

      } catch (err) {
        console.error('Signing failed:', err);
        
        let errorMessage = 'Operation failed';
        if (err.code === 'UNSUPPORTED_OPERATION') {
          errorMessage = 'Network operation not supported.';
        } else if (err.code === 'INVALID_ARGUMENT') {
          errorMessage = 'Invalid address provided.';
        } else if (err.code === 'INSUFFICIENT_FUNDS') {
          errorMessage = 'Insufficient native funds for transaction.';
        } else if (err.code === 'UNPREDICTABLE_GAS_LIMIT') {
          errorMessage = `Failed to estimate gas. Error: ${err.message}`;
        } else if (err.code === 'NONCE_EXPIRED') {
          errorMessage = 'Transaction expired. Please try again.';
        } else if (err.code === 'CALL_EXCEPTION') {
          if (err.error && err.error.message) {
            errorMessage = `Transaction failed: ${err.error.message}`;
          } else if (err.message && err.message.includes('execution reverted')) {
            const revertReason = err.message.split('execution reverted:')[1];
            errorMessage = revertReason ? `Transaction failed: ${revertReason.trim()}` : 'Transaction failed: Contract execution reverted.';
          } else {
            errorMessage = 'Transaction failed: Call exception.';
          }
        } else if (err.reason) {
          errorMessage = `Transaction failed: ${err.reason}`;
        } else if (err.message) {
          errorMessage = err.message;
        }
        toast.error(`${errorMessage}`);
      } finally {
        setLocalLoading(false);
      }
    } catch (err) {
      console.error('Signing failed:', err);
      
      let errorMessage = 'Signing failed';
      if (err.code === 'UNSUPPORTED_OPERATION') {
        errorMessage = 'Network operation not supported';
      } else if (err.code === 'INVALID_ARGUMENT') {
        errorMessage = 'Invalid address provided';
      } else if (err.code === 'INSUFFICIENT_FUNDS') {
        errorMessage = 'Insufficient native funds for transaction.';
      } else if (err.code === 'UNPREDICTABLE_GAS_LIMIT') {
        errorMessage = 'Failed to estimate gas. Please try again or contact support.';
      } else if (err.code === 'NONCE_EXPIRED') {
        errorMessage = 'Transaction expired. Please try again.';
      } else if (err.code === 'CALL_EXCEPTION') {
        errorMessage = 'Transaction failed. Please check contract requirements.';
      } else if (err.message && err.message.includes('execution reverted')) {
        errorMessage = `Transaction failed: ${err.message.split('execution reverted:')[1] || err.message}`;
      }
      toast.error(`${errorMessage}: ${err.message || 'Unknown error'}`);
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
      console.log('Current contract state:', contractData);

      // Verify freelancer is the correct signer
      const freelancerAddress = await signer.getAddress();
      if (freelancerAddress.toLowerCase() !== contractData.freelancer.toLowerCase()) {
        toast.error('Only the contract freelancer can sign');
        return;
      }

      // Check if client has already signed and deposited funds
      if (!contractData.clientApproved || !contractData.fundsDeposited) {
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
      const tx = await contractInstance.freelancerSignContract(
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
      const updatedContractData = await contractInstance.getContract(contract.contractId);
      if (!updatedContractData.freelancerApproved) {
        throw new Error('Signing verification failed');
      }

      toast.success('Contract signed successfully!');
      
      // Refetch all contracts to ensure UI is updated with the latest state
      // The context will handle updating the contracts array
      await fetchContracts(false); // Fetch silently without toast
    } catch (err) {
      console.error('Signing failed:', err);
      
      // Handle specific error cases
      if (err.code === 'UNPREDICTABLE_GAS_LIMIT') {
        toast.error('Failed to estimate gas. Please try again or contact support.');
      } else if (err.code === 'NONCE_EXPIRED') {
        toast.error('Transaction expired. Please try again.');
      } else if (err.code === 'CALL_EXCEPTION') {
        toast.error('Transaction failed. Please check contract requirements.');
      } else if (err.message && err.message.includes('execution reverted')) {
         errorMessage = `Transaction failed: ${err.message.split('execution reverted:')[1] || err.message}`;
      }
      
      // If a more specific error message wasn't set, use a generic one
      if (!errorMessage) {
        errorMessage = 'Signing failed: Unknown error';
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
              {contract.blockchainState?.status === 'FreelancerSigned' && isFreelancer && (
                <WorkSubmission contract={contract} />
              )}

              {contract.blockchainState?.status === 'WorkSubmitted' && isClient && (
                <div className="mt-4 space-x-4">
                  <button
                    onClick={handleApproveWork}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                  >
                    Approve Work
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