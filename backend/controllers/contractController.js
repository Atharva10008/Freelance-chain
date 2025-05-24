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
        const requiredFields = [
            'jobId', 'bidId', 'freelancerId', 'freelancerAddress', 'bidAmount', 'jobTitle', 'jobDescription', 'deadline', 'contractId', 'contractAddress', 'transactionHash'
        ];
        for (const field of requiredFields) {
            if (!req.body[field]) {
                return res.status(400).json({
                    success: false,
                    error: `Missing required field: ${field}`
                });
            }
        }
        // Save contract in database
        const contract = new Contract({
            job: req.body.jobId,
            bid: req.body.bidId,
            client: req.user._id,
            freelancer: req.body.freelancerId,
            contractAddress: req.body.contractAddress,
            contractId: Number(req.body.contractId),
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
            data: { ...contract.toObject(), contractId: Number(contract.contractId) }
        });
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
                    return {
                        ...contract,
                        blockchainState
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
            // Get the blockchain state of the contract
            const blockchainState = await contractUtils.getContractState(
                contract.contractAddress,
                contract.contractId
            );
            if (!blockchainState) {
                // Return database data if blockchain fetch fails or contract does not exist on-chain
                return res.status(200).json({
                    success: true,
                    data: {
                        ...contract.toObject(),
                        contractId: Number(contract.contractId),
                        blockchainState: null
                    },
                    warning: 'Blockchain state not available or contract does not exist on-chain'
                });
            }
            // Map blockchain status to DB status
            const dbStatus = blockchainToDbStatus[blockchainState.status];
            if (dbStatus && dbStatus !== contract.status) {
                contract.status = dbStatus;
                await contract.save();
            }
            // Combine database and blockchain data
            const contractData = {
                ...contract.toObject(),
                contractId: Number(contract.contractId),
                blockchainState
            };

            res.status(200).json({
                success: true,
                data: contractData
            });
        } catch (err) {
            console.error('Error fetching blockchain state:', err);
            // Return database data if blockchain fetch fails
            res.status(200).json({
                success: true,
                data: {
                    ...contract.toObject(),
                    contractId: Number(contract.contractId),
                    blockchainState: null
                },
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
        await contractUtils.signContract(contract.contractAddress, contractId);

        // ... rest of the function remains the same ...
    } catch (err) {
        console.error('Error signing contract:', err);
        res.status(500).json({
            success: false,
            error: err.message
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

        await contractUtils.depositFunds(contract.contractAddress, contract.contractId, amount);
        
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

        await contractUtils.submitWork(contract.contractAddress, contract.contractId, workHash);
        
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

        await contractUtils.approveWork(contract.contractAddress, contract.contractId);
        
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

        await contractUtils.releasePayment(contract.contractAddress, contract.contractId);
        
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