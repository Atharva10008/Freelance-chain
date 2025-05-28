// backend/controllers/contractController.js
const Contract = require('../models/Contract');
const contractUtils = require('../utils/contractUtils');

// Initialize contract utils when the application starts
(async () => {
    try {
        await contractUtils.initialize();
        console.log('Contract utilities initialized successfully');
    } catch (err) {
        console.error('Failed to initialize contract utilities:', err);
    }
})();

// Add this mapping at the top of the file
const blockchainToDbStatus = {
    Created: 'created',
    ClientSigned: 'client_signed',
    FreelancerSigned: 'freelancer_signed',
    WorkSubmitted: 'work_submitted',
    Completed: 'completed',
    Disputed: 'disputed'
};

exports.createContract = async (req, res) => {
    try {
        console.log('Received contract creation request:', req.body);
        
        // Validate required fields
        const requiredFields = ['jobId', 'bidId', 'freelancerId', 'freelancerAddress', 'bidAmount', 'jobTitle', 'jobDescription', 'deadline'];
        for (const field of requiredFields) {
            if (!req.body[field]) {
                return res.status(400).json({
                    success: false,
                    error: `Missing required field: ${field}`
                });
            }
        }

        // Create contract in database first
        try {
            console.log('Preparing contract data for database save:', {
                job: req.body.jobId,
                bid: req.body.bidId,
                client: req.user._id,
                freelancer: req.body.freelancerId,
                contractAddress: req.body.contractAddress,
                contractId: req.body.contractId,
                bidAmount: req.body.bidAmount,
                jobTitle: req.body.jobTitle,
                jobDescription: req.body.jobDescription,
                deadline: req.body.deadline,
                transactionHash: req.body.transactionHash
            });

            const contract = new Contract({
                job: req.body.jobId,
                bid: req.body.bidId,
                client: req.user._id,
                freelancer: req.body.freelancerId,
                contractAddress: req.body.contractAddress,
                contractId: req.body.contractId,
                bidAmount: req.body.bidAmount,
                jobTitle: req.body.jobTitle,
                jobDescription: req.body.jobDescription,
                deadline: req.body.deadline,
                transactionHash: req.body.transactionHash,
                status: 'created'
            });

            await contract.save();
            console.log('Contract successfully saved to database with ID:', contract._id);

            res.status(201).json({
                success: true,
                data: contract
            });
        } catch (dbError) {
            console.error('Error saving contract to database:', dbError);
            throw dbError;
        }
    } catch (err) {
        console.error('Error in createContract function:', err);
        res.status(500).json({
            success: false,
            error: err.message || 'Failed to create contract'
        });
    }
};

exports.getUserContracts = async (req, res) => {
    try {
        const userId = req.user._id;
        console.log('Fetching contracts for user:', userId);
        
        const contracts = await Contract.find({
            $or: [
                { client: userId },
                { freelancer: userId }
            ]
        })
        .populate('client', 'name walletAddress')
        .populate('freelancer', 'name walletAddress')
        .populate('job', 'title description')
        .lean();

        console.log('Found contracts:', contracts.length);

        const contractsWithState = await Promise.all(
            contracts.map(async (contract) => {
                try {
                    if (!contract.contractAddress || !contract.contractId) {
                        console.log('No contract address or ID for contract:', contract._id);
                        return null;
                    }

                    console.log('Fetching blockchain state for contract:', contract._id, 'contractId:', contract.contractId);
                    const blockchainState = await contractUtils.getContractState(
                        contract.contractAddress,
                        contract.contractId
                    );
                    console.log('Blockchain state fetched:', contract._id, 'blockchainState:', blockchainState);
                    if (!blockchainState) {
                        console.warn('Skipping contract with null blockchain state:', contract._id);
                        return null;
                    }

                    // Map blockchain status to DB status
                    const dbStatus = blockchainToDbStatus[blockchainState.status];
                    if (dbStatus && dbStatus !== contract.status) {
                        // Update status in DB (need to use findByIdAndUpdate since contract is lean)
                        await Contract.findByIdAndUpdate(contract._id, { status: dbStatus });
                        contract.status = dbStatus;
                    }

                    // Update both signed flags and approved flags
                    if (contract.clientSigned !== blockchainState.clientApproved || contract.freelancerSigned !== blockchainState.freelancerApproved) {
                        await Contract.findByIdAndUpdate(contract._id, {
                            clientSigned: blockchainState.clientApproved,
                            freelancerSigned: blockchainState.freelancerApproved,
                            updatedAt: new Date()
                        });
                        contract.clientSigned = blockchainState.clientApproved;
                        contract.freelancerSigned = blockchainState.freelancerApproved;
                    }

                    return {
                        ...contract,
                        blockchainState: blockchainState,
                        clientApproved: blockchainState.clientApproved,
                        freelancerApproved: blockchainState.freelancerApproved,
                        clientSigned: blockchainState.clientApproved, // Ensure these are in sync
                        freelancerSigned: blockchainState.freelancerApproved // Ensure these are in sync
                    };
                } catch (err) {
                    console.error(`Error fetching blockchain state for contract ${contract._id}:`, err.message);
                    return null;
                }
            })
        );

        // Filter out nulls
        const filteredContracts = contractsWithState.filter(Boolean);

        console.log('Sending response with contracts:', filteredContracts.length);
        res.status(200).json({
            success: true,
            data: filteredContracts
        });
    } catch (err) {
        console.error('Error getting user contracts:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch contracts'
        });
    }
};

exports.getContract = async (req, res) => {
    try {
        const { id } = req.params;
        
        // First try to find the contract in the database
        const contract = await Contract.findById(id)
            .populate('client freelancer job bid');
        
        if (!contract) {
            return res.status(404).json({
                success: false,
                error: 'Contract not found'
            });
        }

        try {
            // Add a small delay before fetching blockchain state
            await new Promise(resolve => setTimeout(resolve, 3000)); // Add a 3-second delay

            // Get the blockchain state of the contract
            const blockchainState = await contractUtils.getContractState(
                contract.contractAddress,
                contract.contractId
            );

            // Map blockchain status to DB status
            const dbStatus = blockchainToDbStatus[blockchainState.status];
            if (dbStatus && dbStatus !== contract.status) {
                contract.status = dbStatus;
            }

            // Update both signed flags and approved flags
            contract.clientSigned = blockchainState.clientApproved;
            contract.freelancerSigned = blockchainState.freelancerApproved;
            contract.updatedAt = new Date();
            await contract.save();

            // Combine database and blockchain data
            const contractData = {
                ...contract.toObject(),
                blockchainState: blockchainState,
                clientApproved: blockchainState.clientApproved,
                freelancerApproved: blockchainState.freelancerApproved,
                clientSigned: blockchainState.clientApproved, // Ensure these are in sync
                freelancerSigned: blockchainState.freelancerApproved // Ensure these are in sync
            };

            console.log('Data being sent from backend /contracts/:id (deep log):', JSON.stringify(contractData, null, 2));

            res.status(200).json({
                success: true,
                data: contractData
            });
        } catch (err) {
            console.error('Error fetching blockchain state:', err);
            // Return database data if blockchain fetch fails
            res.status(200).json({
                success: true,
                data: contract,
                warning: 'Blockchain state not available'
            });
        }
    } catch (err) {
        console.error('Error getting contract:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
};

exports.signContract = async (req, res) => {
    try {
        const { id } = req.params;

        // Find the contract
        const contract = await Contract.findById(id);
        if (!contract) {
            return res.status(404).json({
                success: false,
                error: 'Contract not found'
            });
        }

        // Convert contract ID to number for blockchain
        const contractId = parseInt(contract.contractId);
        if (isNaN(contractId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid contract ID format'
            });
        }

        // Sign the contract on the blockchain
        await contractUtils.clientSignContract(contractId, req.signer);
        console.log('Contract signed on blockchain as client for ID:', contractId);

        // After successful on-chain signing, refetch the latest state from the blockchain
        const blockchainState = await contractUtils.getContractState(
            contract.contractAddress,
            contractId
        );
        console.log('Blockchain state fetched in backend after client sign:', JSON.stringify(blockchainState, null, 2));

        if (!blockchainState) {
            console.warn('Blockchain state is null after signing.');
            return res.status(200).json({
                success: true,
                data: contract.toObject(),
                warning: 'Blockchain state could not be refetched after signing.'
            });
        }

        // Update database flags based on the latest blockchain state
        const dbStatus = blockchainToDbStatus[blockchainState.status];
        if (dbStatus && dbStatus !== contract.status) {
            contract.status = dbStatus;
        }

        // Update both signed flags and approved flags
        contract.clientSigned = blockchainState.clientApproved;
        contract.freelancerSigned = blockchainState.freelancerApproved;
        contract.updatedAt = new Date();
        await contract.save();
        console.log('Database contract updated after signing.');

        // Combine database and refetched blockchain data
        const updatedContractData = {
            ...contract.toObject(),
            blockchainState: blockchainState,
            clientApproved: blockchainState.clientApproved,
            freelancerApproved: blockchainState.freelancerApproved,
            clientSigned: blockchainState.clientApproved, // Ensure these are in sync
            freelancerSigned: blockchainState.freelancerApproved // Ensure these are in sync
        };

        console.log('Updated contract data prepared by backend after client sign:', JSON.stringify(updatedContractData, null, 2));

        res.status(200).json({
            success: true,
            data: updatedContractData
        });
    } catch (err) {
        console.error('Error in signContract endpoint:', err);
        let errorMessage = 'Failed to sign contract';
        if (err.message) {
            errorMessage += `: ${err.message}`;
        } else if (err.reason) {
            errorMessage += `: ${err.reason}`;
        }
        res.status(500).json({
            success: false,
            error: errorMessage
        });
    }
};

exports.depositFunds = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount } = req.body;

        const contract = await Contract.findById(id);
        if (!contract) {
            return res.status(404).json({
                success: false,
                error: 'Contract not found'
            });
        }

        await contractUtils.depositFunds(contract.contractId, amount);
        
        contract.status = 'funded';
        await contract.save();

        res.status(200).json({
            success: true,
            message: 'Funds deposited successfully',
            data: contract
        });
    } catch (err) {
        console.error('Error depositing funds:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
};

exports.submitWork = async (req, res) => {
    try {
        const { id } = req.params;
        const { workHash } = req.body;

        const contract = await Contract.findById(id);
        if (!contract) {
            return res.status(404).json({
                success: false,
                error: 'Contract not found'
            });
        }

        await contractUtils.submitWork(contract.contractId, workHash);
        
        contract.status = 'work_submitted';
        await contract.save();

        res.status(200).json({
            success: true,
            message: 'Work submitted successfully',
            data: contract
        });
    } catch (err) {
        console.error('Error submitting work:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
};

exports.approveWork = async (req, res) => {
    try {
        const { id } = req.params;

        const contract = await Contract.findById(id);
        if (!contract) {
            return res.status(404).json({
                success: false,
                error: 'Contract not found'
            });
        }

        await contractUtils.approveWork(contract.contractId);
        
        contract.status = 'work_approved';
        await contract.save();

        res.status(200).json({
            success: true,
            message: 'Work approved successfully',
            data: contract
        });
    } catch (err) {
        console.error('Error approving work:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
};

exports.releasePayment = async (req, res) => {
    try {
        const { id } = req.params;

        const contract = await Contract.findById(id);
        if (!contract) {
            return res.status(404).json({
                success: false,
                error: 'Contract not found'
            });
        }

        await contractUtils.releasePayment(contract.contractId);
        
        contract.status = 'completed';
        await contract.save();

        res.status(200).json({
            success: true,
            message: 'Payment released successfully',
            data: contract
        });
    } catch (err) {
        console.error('Error releasing payment:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
};

exports.deleteContract = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Find the contract
        const contract = await Contract.findById(id);
        if (!contract) {
            return res.status(404).json({
                success: false,
                error: 'Contract not found'
            });
        }

        // Only allow deletion if contract is in 'created' state
        if (contract.status !== 'created') {
            return res.status(400).json({
                success: false,
                error: 'Can only delete contracts in created state'
            });
        }

        // Delete the contract
        await Contract.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Contract deleted successfully'
        });
    } catch (err) {
        console.error('Error deleting contract:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
};