const handleSign = async () => {
    try {
        setIsSigning(true);
        setError('');
        
        // Sign contract with wallet address
        await onSign(contract._id);
    } catch (err) {
        console.error('Sign contract error:', err);
        let errorMessage = err.message;
        
        // Handle specific blockchain errors
        if (err.message.includes('out-of-bounds access')) {
            errorMessage = 'Invalid contract reference. Please refresh and try again.';
        } else if (err.message.includes('UNPREDICTABLE_GAS_LIMIT')) {
            if (err.message.includes('Client must deposit funds first')) {
                errorMessage = 'Please deposit funds before signing the contract';
            } else {
                errorMessage = 'Transaction failed. Please check your wallet and try again.';
            }
        }
        
        setError(errorMessage || 'Failed to sign contract');
    } finally {
        setIsSigning(false);
    }
}; 