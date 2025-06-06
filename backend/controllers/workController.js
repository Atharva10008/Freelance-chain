const WorkSubmission = require('../models/WorkSubmission');
const Contract = require('../models/Contract');
const contractUtils = require('../utils/contractUtils');

exports.submitWork = async (req, res) => {
    try {
        // The frontend passes the MongoDB _id as 'contractId'
        const { contractId: mongoDbId, workHash } = req.body;
        console.log('[submitWork] Starting work submission (backend update):', { mongoDbId, workHash, userId: req.user._id });

        // Find contract in database by its MongoDB _id
        const contract = await Contract.findById(mongoDbId)
            .populate('freelancer', 'walletAddress'); // Populate freelancer to verify user ID

        if (!contract) {
            console.error('[submitWork] Contract not found in database:', mongoDbId);
            return res.status(404).json({ success: false, error: 'Contract not found' });
        }

        console.log('[submitWork] Found contract in database:', {
            contractId: contract.contractId,
            status: contract.status,
            freelancerUserId: contract.freelancer._id,
            requestingUserId: req.user._id
        });

        // Verify authenticated user is the contract's freelancer (using backend user ID)
        if (req.user._id.toString() !== contract.freelancer._id.toString()) {
            console.error('[submitWork] User mismatch:', {
                requestingUserId: req.user._id,
                contractFreelancerId: contract.freelancer._id
            });
            return res.status(403).json({ 
                success: false, 
                error: 'Only the contract freelancer can submit work' 
            });
        }

        // Validate contract status (optional, frontend should handle, but good backend check)
        if (contract.status !== 'both_signed') {
             console.warn('[submitWork] Unexpected contract status for backend update:', {currentStatus: contract.status});
             // Decide how strictly to enforce this on the backend after frontend handles on-chain
             // For now, allow update but log a warning
        }

        // Removed on-chain interaction and signer verification
        // await contractUtils.submitWork(contract.contractAddress, contract.contractId, workHash, signer);

        // Update database
        contract.status = 'work_submitted';
        contract.workHash = workHash;

        // Log contractId and its type before saving
        console.log('[submitWork] Before save: contractId =', contract.contractId, ', type =', typeof contract.contractId);

        await contract.save();
        console.log('[submitWork] Database updated successfully');

        res.json({ success: true, contract });
    } catch (error) {
        console.error('[submitWork] Error submitting work (backend update):', error);

        // Enhanced error response
        let errorMessage = 'Failed to update work submission in database';
        if (error.message) { // Catch any general errors during DB update
            errorMessage = error.message;
        }

        res.status(500).json({ success: false, error: errorMessage });
    }
};

exports.approveWork = async (req, res) => {
    try {
        const { submissionId } = req.body;
        
        const submission = await WorkSubmission.findById(submissionId)
            .populate('contract');
            
        if (!submission) {
            return res.status(404).json({
                success: false,
                error: 'Work submission not found'
            });
        }

        // Verify user is the client
        if (req.user.id !== submission.contract.client.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Only the client can approve work'
            });
        }

        // Update submission
        submission.status = 'approved';
        submission.approvedAt = new Date();
        await submission.save();

        // Update contract
        const contract = submission.contract;
        contract.status = 'completed';
        await contract.save();

        // Call blockchain to approve work
        await approveWorkOnContract(contract.contractAddress);

        res.status(200).json({
            success: true,
            data: submission
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
};