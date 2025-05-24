import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../utils/contract';

class ContractOnChainService {
    constructor() {
        this.provider = null;
        this.contract = null;
    }

    async init() {
        if (!window.ethereum) {
            throw new Error('MetaMask is not installed');
        }

        this.provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await this.provider.getSigner();
        this.contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    }

    async signContract(contractId) {
        if (!this.contract) {
            await this.init();
        }

        try {
            const tx = await this.contract.signContract(contractId);
            const receipt = await tx.wait();
            
            return {
                success: true,
                txHash: receipt.hash
            };
        } catch (error) {
            console.error('Error signing contract:', error);
            throw error;
        }
    }

    async getContract(contractId) {
        if (!this.contract) {
            await this.init();
        }

        try {
            const contractData = await this.contract.getContract(contractId);
            return {
                id: contractData.id.toString(),
                proposalId: contractData.proposalId.toString(),
                freelancer: contractData.freelancer,
                client: contractData.client,
                amount: ethers.formatEther(contractData.amount),
                deadline: new Date(Number(contractData.deadline) * 1000),
                status: contractData.status,
                deliverables: contractData.deliverables,
                workSubmitted: contractData.workSubmitted,
                clientApproved: contractData.clientApproved,
                clientSigned: contractData.clientSigned,
                freelancerSigned: contractData.freelancerSigned
            };
        } catch (error) {
            console.error('Error getting contract:', error);
            throw error;
        }
    }
}

export const contractOnChainService = new ContractOnChainService(); 