import React, { useState } from 'react';
import { useContract } from '../context/ContractContext';
import { useAuth } from '../context/AuthContext';
import { Button, Spinner, useToast } from '@chakra-ui/react';

const SignContractButton = ({ contractId, onSignSuccess }) => {
    const [isLoading, setIsLoading] = useState(false);
    const { signContract } = useContract();
    const { user } = useAuth();
    const toast = useToast();

    const handleSign = async () => {
        try {
            setIsLoading(true);
            const result = await signContract(contractId);
            
            toast({
                title: 'Contract Signed',
                description: 'Your signature has been recorded on the blockchain.',
                status: 'success',
                duration: 5000,
                isClosable: true,
            });

            if (onSignSuccess) {
                onSignSuccess(result);
            }
        } catch (error) {
            console.error('Error signing contract:', error);
            toast({
                title: 'Error Signing Contract',
                description: error.message || 'Failed to sign contract. Please try again.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button
            colorScheme="blue"
            onClick={handleSign}
            isLoading={isLoading}
            loadingText="Signing..."
            disabled={isLoading || !user}
            leftIcon={isLoading ? <Spinner size="sm" /> : null}
        >
            {isLoading ? 'Signing...' : 'Sign Contract'}
        </Button>
    );
};

export default SignContractButton; 