import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useContract } from '../context/ContractContext';
import { useAuth } from '../context/AuthContext';
import { Box, Alert, AlertIcon, Spinner } from '@chakra-ui/react';
import SignContractButton from '../components/SignContractButton';

const ContractView = () => {
    const { id } = useParams();
    const { getContract } = useContract();
    const { user } = useAuth();
    const [contract, setContract] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchContractData = async () => {
            try {
                setLoading(true);
                const data = await getContract(id);
                setContract(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            fetchContractData();
        }
    }, [id, getContract]);

    if (loading) {
        return (
            <Box p={4} display="flex" justifyContent="center">
                <Spinner size="xl" />
            </Box>
        );
    }

    if (error) {
        return (
            <Alert status="error" mt={4}>
                <AlertIcon />
                {error}
            </Alert>
        );
    }

    if (!contract) {
        return (
            <Alert status="warning" mt={4}>
                <AlertIcon />
                Contract not found
            </Alert>
        );
    }

    const canSign = (
        (user?.role === 'client' && contract.client === user.address && !contract.clientSigned) ||
        (user?.role === 'freelancer' && contract.freelancer === user.address && !contract.freelancerSigned)
    );

    return (
        <Box p={4}>
            {/* Contract details */}
            <Box mb={4}>
                <h1>Contract Details</h1>
                {/* Add your contract details here */}
            </Box>

            {/* Signing section */}
            {canSign && (
                <Box mt={4}>
                    <SignContractButton 
                        contractId={contract._id}
                        onSignSuccess={() => {
                            // Refresh contract data
                            getContract(id).then(setContract);
                        }}
                    />
                </Box>
            )}

            {/* Signing status */}
            {contract?.clientSigned && contract?.freelancerSigned && (
                <Alert status="success" mt={4}>
                    <AlertIcon />
                    Contract has been signed by both parties
                </Alert>
            )}
        </Box>
    );
};

export default ContractView; 