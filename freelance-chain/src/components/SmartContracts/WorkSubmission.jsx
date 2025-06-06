import React, { useState } from 'react';
import { useWeb3 } from '../../context/Web3Context';
import { workService  } from '../../services/workService';
import { uploadToIPFS } from '../../services/ipfsService';
import { toast } from 'react-hot-toast';
import { submitWorkOnChain } from '../../services/ContractOnChainService';

const WorkSubmission = ({ contract }) => {
    const { account, signer, provider } = useWeb3();
    const [description, setDescription] = useState('');
    const [file, setFile] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!file) {
            toast.error('Please select a file to submit.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // 1. Upload the work file to IPFS
            console.log('Uploading file to IPFS...');
            const workHash = await uploadToIPFS(file);
            console.log('File uploaded to IPFS, received hash:', workHash);

            if (!workHash) {
                throw new Error('IPFS upload failed: No hash received.');
            }

            console.log('Attempting to submit work:', { contractId: contract.contractId, workHash });

            // 1. Submit work on chain using the frontend signer
            console.log('Submitting work on chain...');
            const onChainResult = await submitWorkOnChain(contract.contractId, workHash, signer, provider);
            console.log('On-chain submission result:', onChainResult);

            if (!onChainResult.success) {
                throw new Error(onChainResult.error || 'On-chain work submission failed.');
            }

            // 2. If on-chain submission is successful, update the backend database
            console.log('On-chain submission successful. Updating backend database...');
            // Use the backend service to update the database record, using the MongoDB _id
            const response = await workService.submitWork({
                contractId: contract._id, // Use the MongoDB _id for the backend call
                workHash: workHash
            });

            console.log('Backend update response:', response);

            if (response.success) {
                toast.success('Work submitted successfully!');
                // Optionally update contract state locally or refetch
                // Assuming the backend response includes the updated contract
                if (response.contract) {
                    console.log('Backend update success, response includes contract:', response.contract);
                    // You might want to trigger a refetch of the contract in ContractView
                }
            } else {
                 // This case might happen if on-chain succeeded but backend failed to save
                 // Handle this carefully, maybe log a warning or retry backend update
                console.error('Backend update failed after successful on-chain submission:', response.error);
                toast.error('Work submitted on chain, but failed to update database: ' + (response.error || 'Unknown error'));
                setError('Work submitted on chain, but failed to update database: ' + (response.error || 'Unknown error'));
            }

        } catch (err) {
            console.error('Error submitting work:', err);
            let errorMessage = 'An unexpected error occurred.';
            
            // Check if the error is from the on-chain service
            if (err.message && err.message.includes('on chain')) {
                 errorMessage = err.message;
             } else if (err.response && err.response.data && err.response.data.error) {
                errorMessage = err.response.data.error;
            } else if (err.message) {
                errorMessage = err.message;
            }
            
            toast.error('Error submitting work: ' + errorMessage);
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    if (account !== contract.freelancer.walletAddress) {
        return (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-700">Only the freelancer can submit work for this contract</p>
            </div>
        );
    }

    if (contract.status === 'completed') {
        return (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-700">This contract has been completed</p>
            </div>
        );
    }

    if (success) {
        return (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-700">Work submitted successfully!</p>
            </div>
        );
    }

    return (
        <div className="mt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Submit Your Work</h3>
            
            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit}>
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Work Description
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md"
                        rows={4}
                    />
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Upload Work Files
                    </label>
                    <input
                        type="file"
                        onChange={(e) => setFile(e.target.files[0])}
                        className="block w-full text-sm text-gray-500
                            file:mr-4 file:py-2 file:px-4
                            file:rounded-md file:border-0
                            file:text-sm file:font-semibold
                            file:bg-primary file:text-white
                            hover:file:bg-opacity-90"
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-primary text-white rounded-md hover:bg-opacity-90 disabled:opacity-70"
                >
                    {loading ? 'Submitting...' : 'Submit Work'}
                </button>
            </form>
        </div>
    );
};

export default WorkSubmission;