import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useContract } from '../context/ContractContext';
import { useAuth } from '../context/AuthContext';
import { Box, Alert, AlertIcon, Spinner, Heading, Text, VStack, HStack } from '@chakra-ui/react';
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
            <VStack spacing={4} align="stretch">
                <Heading size="lg">Contract Details</Heading>
                
                <Box p={4} borderWidth={1} borderRadius="md">
                    <VStack align="stretch" spacing={3}>
                        <HStack justify="space-between">
                            <Text fontWeight="bold">Job Title:</Text>
                            <Text>{contract.job?.title}</Text>
                        </HStack>
                        
                        <HStack justify="space-between">
                            <Text fontWeight="bold">Amount:</Text>
                            <Text>{contract.bid?.amount} ETH</Text>
                        </HStack>
                        
                        <HStack justify="space-between">
                            <Text fontWeight="bold">Client:</Text>
                            <Text>{contract.client?.name || contract.client}</Text>
                        </HStack>
                        
                        <HStack justify="space-between">
                            <Text fontWeight="bold">Freelancer:</Text>
                            <Text>{contract.freelancer?.name || contract.freelancer}</Text>
                        </HStack>
                        
                        <HStack justify="space-between">
                            <Text fontWeight="bold">Status:</Text>
                            <Text>{contract.status}</Text>
                        </HStack>
                    </VStack>
                </Box>

                {canSign && (
                    <Box mt={4}>
                        <SignContractButton 
                            contractId={contract._id}
                            onSignSuccess={() => {
                                getContract(id).then(setContract);
                            }}
                        />
                    </Box>
                )}

                {contract?.clientSigned && contract?.freelancerSigned && (
                    <Alert status="success" mt={4}>
                        <AlertIcon />
                        Contract has been signed by both parties
                    </Alert>
                )}
            </VStack>
        </Box>
    );
};

export default ContractView; 