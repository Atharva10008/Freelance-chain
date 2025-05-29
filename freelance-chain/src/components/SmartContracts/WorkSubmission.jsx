import React, { useState } from 'react';
import { useWeb3 } from '../../context/Web3Context';
import { useContracts } from '../../context/ContractContext';
import { uploadToIPFS } from '../../services/ipfsService';
import { toast } from 'sonner';

const WorkSubmission = ({ contract }) => {
    const { account } = useWeb3();
    const { fetchContracts } = useContracts();
    const [description, setDescription] = useState('');
    const [file, setFile] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!file) {
            setError('Please upload your work file');
            return;
        }

        try {
            setIsSubmitting(true);
            setError('');
            setSuccess(false);
            
            // 1. Upload file to IPFS
            toast.info('Uploading file to IPFS...');
            const fileHash = await uploadToIPFS(file);
            
            // 2. Submit work to backend
            toast.info('Submitting work...');
            const response = await fetch('/api/work', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({
                    contractId: contract._id,
                    workDescription: description,
                    fileHash
                })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to submit work');
            }

            // 3. Refresh contract data
            await fetchContracts();
            
            setSuccess(true);
            toast.success('Work submitted successfully!');
        } catch (err) {
            console.error('Work submission error:', err);
            setError(err.message);
            toast.error(`Failed to submit work: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (account?.toLowerCase() !== contract.freelancer?.walletAddress?.toLowerCase()) {
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

    if (contract.status !== 'both_signed') {
        return (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-yellow-700">
                    {contract.status === 'created' ? 'Contract needs to be signed by both parties' : 
                     contract.status === 'client_signed' ? 'Waiting for freelancer to sign' : 
                     'Contract not in correct state for work submission'}
                </p>
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
                        required
                    />
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Upload Work Files (Max 50MB)
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
                        required
                    />
                </div>

                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-primary text-white rounded-md hover:bg-opacity-90 disabled:opacity-70"
                >
                    {isSubmitting ? 'Submitting...' : 'Submit Work'}
                </button>
            </form>
        </div>
    );
};

export default WorkSubmission;