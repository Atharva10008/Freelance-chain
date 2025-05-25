import { ethers } from 'ethers';
import { CONTRACT_ABI } from '../../utils/contract'; // Adjust path if needed

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

/**
 * Creates a contract on-chain using MetaMask and returns contractId and txHash.
 * @param {Object} params
 * @param {string} params.freelancerAddress
 * @param {string|number} params.bidAmount (in ETH)
 * @param {string|Date} params.deadline (date string or Date object)
 * @param {string} params.jobTitle
 * @param {string} params.jobDescription
 * @returns {Promise<{contractId: string, txHash: string}>}
 */
export async function createContractOnChain({ freelancerAddress, bidAmount, deadline, jobTitle, jobDescription }) {
  if (!window.ethereum) throw new Error('MetaMask not detected');
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

  // Prepare deadline as unix timestamp
  const deadlineTimestamp = Math.floor(new Date(deadline).getTime() / 1000);

  // Call the contract creation function
  const tx = await contract.createContract(
    freelancerAddress,
    ethers.utils.parseEther(bidAmount.toString()),
    deadlineTimestamp,
    jobTitle,
    jobDescription
  );
  const receipt = await tx.wait();

  // Parse the ContractCreated event to get contractId
  const event = receipt.logs
    .map(log => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find(e => e && e.name === 'ContractCreated');

  if (!event) throw new Error('ContractCreated event not found');
  const contractId = event.args[0].toString();

  return { contractId, txHash: tx.hash };
} 