import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import axios from 'axios';
import {
    Box,
    Button,
    Card,
    CardContent,
    Typography,
    TextField,
    CircularProgress,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Grid,
    Divider
} from '@mui/material';
import { useWeb3React } from '@web3-react/core';
import { useContract } from '../hooks/useContract';
import { CONTRACT_ADDRESS } from '../config/contract';
import { formatEther } from 'ethers/lib/utils';

const ContractSign = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { account, library } = useWeb3React();
    const { contract, loading: contractLoading } = useContract(CONTRACT_ADDRESS);
    const [contractData, setContractData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
    const [clientShare, setClientShare] = useState('');
    const [freelancerShare, setFreelancerShare] = useState('');
    const [workHash, setWorkHash] = useState('');

    useEffect(() => {
        fetchContractData();
    }, [id]);

    const fetchContractData = async () => {
        try {
            const response = await axios.get(`/api/contracts/${id}/state`);
            setContractData(response.data);
            setLoading(false);
        } catch (error) {
            setError('Failed to fetch contract data');
            setLoading(false);
        }
    };

    const handleClientSignAndDeposit = async () => {
        try {
            setLoading(true);
            setError(null);
            
            const signer = library.getSigner();
            const tx = await contract.connect(signer).clientSignAndDeposit(id, {
                value: ethers.utils.parseEther(contractData.bidAmount.toString())
            });
            
            await tx.wait();
            
            const response = await axios.post(`/api/contracts/${id}/client-sign`);
            setContractData(response.data);
            setSuccess('Contract signed and funds deposited successfully');
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleFreelancerSign = async () => {
        try {
            setLoading(true);
            setError(null);
            
            const signer = library.getSigner();
            const tx = await contract.connect(signer).freelancerSign(id);
            await tx.wait();
            
            const response = await axios.post(`/api/contracts/${id}/freelancer-sign`);
            setContractData(response.data);
            setSuccess('Contract signed successfully');
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitWork = async () => {
        try {
            setLoading(true);
            setError(null);
            
            if (!workHash) {
                throw new Error('Work hash is required');
            }
            
            const signer = library.getSigner();
            const tx = await contract.connect(signer).submitWork(id, workHash);
            await tx.wait();
            
            const response = await axios.post(`/api/contracts/${id}/submit-work`, { workHash });
            setContractData(response.data);
            setSuccess('Work submitted successfully');
            setWorkHash('');
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleApproveWork = async () => {
        try {
            setLoading(true);
            setError(null);
            
            const signer = library.getSigner();
            const tx = await contract.connect(signer).approveWork(id);
            await tx.wait();
            
            const response = await axios.post(`/api/contracts/${id}/approve-work`);
            setContractData(response.data);
            setSuccess('Work approved successfully');
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRejectWork = async () => {
        try {
            setLoading(true);
            setError(null);
            
            if (!rejectReason) {
                throw new Error('Rejection reason is required');
            }
            
            const signer = library.getSigner();
            const tx = await contract.connect(signer).rejectWork(id, rejectReason);
            await tx.wait();
            
            const response = await axios.post(`/api/contracts/${id}/reject-work`, { reason: rejectReason });
            setContractData(response.data);
            setSuccess('Work rejected successfully');
            setRejectDialogOpen(false);
            setRejectReason('');
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRaiseDispute = async () => {
        try {
            setLoading(true);
            setError(null);
            
            const signer = library.getSigner();
            const disputeFee = await contract.disputeFee();
            
            const tx = await contract.connect(signer).raiseDispute(id, {
                value: disputeFee
            });
            await tx.wait();
            
            const response = await axios.post(`/api/contracts/${id}/raise-dispute`);
            setContractData(response.data);
            setSuccess('Dispute raised successfully');
            setDisputeDialogOpen(false);
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleResolveDispute = async () => {
        try {
            setLoading(true);
            setError(null);
            
            if (!clientShare || !freelancerShare) {
                throw new Error('Both shares are required');
            }
            
            const signer = library.getSigner();
            const tx = await contract.connect(signer).resolveDispute(
                id,
                ethers.utils.parseEther(clientShare),
                ethers.utils.parseEther(freelancerShare)
            );
            await tx.wait();
            
            const response = await axios.post(`/api/contracts/${id}/resolve-dispute`, {
                clientShare,
                freelancerShare
            });
            setContractData(response.data);
            setSuccess('Dispute resolved successfully');
            setDisputeDialogOpen(false);
            setClientShare('');
            setFreelancerShare('');
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRequestRefund = async () => {
        try {
            setLoading(true);
            setError(null);
            
            const signer = library.getSigner();
            const tx = await contract.connect(signer).requestRefund(id);
            await tx.wait();
            
            const response = await axios.post(`/api/contracts/${id}/request-refund`);
            setContractData(response.data);
            setSuccess('Refund requested successfully');
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading || contractLoading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
                <CircularProgress />
            </Box>
        );
    }

    if (!contractData) {
        return (
            <Box p={3}>
                <Alert severity="error">Contract not found</Alert>
            </Box>
        );
    }

    const isClient = account?.toLowerCase() === contractData.client.toLowerCase();
    const isFreelancer = account?.toLowerCase() === contractData.freelancer.toLowerCase();
    const canClientSign = isClient && contractData.status === 'Created';
    const canFreelancerSign = isFreelancer && contractData.status === 'ClientSigned';
    const canSubmitWork = isFreelancer && contractData.status === 'BothSigned';
    const canApproveWork = isClient && contractData.status === 'WorkSubmitted';
    const canRejectWork = isClient && contractData.status === 'WorkSubmitted';
    const canRaiseDispute = (isClient || isFreelancer) && 
        ['BothSigned', 'WorkSubmitted'].includes(contractData.status);
    const canResolveDispute = isClient && contractData.status === 'Disputed';
    const canRequestRefund = isClient && contractData.status === 'Disputed';

    return (
        <Box p={3}>
            <Card>
                <CardContent>
                    <Typography variant="h5" gutterBottom>
                        Contract Details
                    </Typography>
                    
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}
                    
                    {success && (
                        <Alert severity="success" sx={{ mb: 2 }}>
                            {success}
                        </Alert>
                    )}

                    <Grid container spacing={2}>
                        <Grid item xs={12}>
                            <Typography variant="subtitle1">
                                Status: {contractData.status}
                            </Typography>
                        </Grid>
                        
                        <Grid item xs={12}>
                            <Typography variant="subtitle1">
                                Job Title: {contractData.jobTitle}
                            </Typography>
                        </Grid>
                        
                        <Grid item xs={12}>
                            <Typography variant="subtitle1">
                                Description: {contractData.jobDescription}
                            </Typography>
                        </Grid>
                        
                        <Grid item xs={12} sm={6}>
                            <Typography variant="subtitle1">
                                Client: {contractData.client}
                            </Typography>
                        </Grid>
                        
                        <Grid item xs={12} sm={6}>
                            <Typography variant="subtitle1">
                                Freelancer: {contractData.freelancer}
                            </Typography>
                        </Grid>
                        
                        <Grid item xs={12} sm={6}>
                            <Typography variant="subtitle1">
                                Bid Amount: {formatEther(contractData.bidAmount)} ETH
                            </Typography>
                        </Grid>
                        
                        <Grid item xs={12} sm={6}>
                            <Typography variant="subtitle1">
                                Deadline: {new Date(contractData.deadline).toLocaleDateString()}
                            </Typography>
                        </Grid>

                        {contractData.workSubmissionHash && (
                            <Grid item xs={12}>
                                <Typography variant="subtitle1">
                                    Work Hash: {contractData.workSubmissionHash}
                                </Typography>
                            </Grid>
                        )}

                        {contractData.rejectionReason && (
                            <Grid item xs={12}>
                                <Typography variant="subtitle1" color="error">
                                    Rejection Reason: {contractData.rejectionReason}
                                </Typography>
                            </Grid>
                        )}

                        {contractData.disputeResolution && (
                            <Grid item xs={12}>
                                <Typography variant="subtitle1">
                                    Dispute Resolution:
                                    <br />
                                    Client Share: {formatEther(contractData.disputeResolution.clientShare)} ETH
                                    <br />
                                    Freelancer Share: {formatEther(contractData.disputeResolution.freelancerShare)} ETH
                                    <br />
                                    Resolved At: {new Date(contractData.disputeResolution.resolvedAt).toLocaleString()}
                                </Typography>
                            </Grid>
                        )}
                    </Grid>

                    <Divider sx={{ my: 2 }} />

                    <Box display="flex" flexDirection="column" gap={2}>
                        {canClientSign && (
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={handleClientSignAndDeposit}
                                disabled={loading}
                            >
                                Sign and Deposit Funds
                            </Button>
                        )}

                        {canFreelancerSign && (
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={handleFreelancerSign}
                                disabled={loading}
                            >
                                Sign Contract
                            </Button>
                        )}

                        {canSubmitWork && (
                            <Box>
                                <TextField
                                    fullWidth
                                    label="Work Hash"
                                    value={workHash}
                                    onChange={(e) => setWorkHash(e.target.value)}
                                    sx={{ mb: 2 }}
                                />
                                <Button
                                    variant="contained"
                                    color="primary"
                                    onClick={handleSubmitWork}
                                    disabled={loading || !workHash}
                                >
                                    Submit Work
                                </Button>
                            </Box>
                        )}

                        {canApproveWork && (
                            <Button
                                variant="contained"
                                color="success"
                                onClick={handleApproveWork}
                                disabled={loading}
                            >
                                Approve Work
                            </Button>
                        )}

                        {canRejectWork && (
                            <Button
                                variant="contained"
                                color="error"
                                onClick={() => setRejectDialogOpen(true)}
                                disabled={loading}
                            >
                                Reject Work
                            </Button>
                        )}

                        {canRaiseDispute && (
                            <Button
                                variant="contained"
                                color="warning"
                                onClick={() => setDisputeDialogOpen(true)}
                                disabled={loading}
                            >
                                Raise Dispute
                            </Button>
                        )}

                        {canResolveDispute && (
                            <Button
                                variant="contained"
                                color="info"
                                onClick={() => setDisputeDialogOpen(true)}
                                disabled={loading}
                            >
                                Resolve Dispute
                            </Button>
                        )}

                        {canRequestRefund && (
                            <Button
                                variant="contained"
                                color="error"
                                onClick={handleRequestRefund}
                                disabled={loading}
                            >
                                Request Refund
                            </Button>
                        )}
                    </Box>
                </CardContent>
            </Card>

            {/* Reject Work Dialog */}
            <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)}>
                <DialogTitle>Reject Work</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        label="Rejection Reason"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        sx={{ mt: 2 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleRejectWork}
                        color="error"
                        disabled={loading || !rejectReason}
                    >
                        Reject
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dispute Dialog */}
            <Dialog open={disputeDialogOpen} onClose={() => setDisputeDialogOpen(false)}>
                <DialogTitle>
                    {contractData.status === 'Disputed' ? 'Resolve Dispute' : 'Raise Dispute'}
                </DialogTitle>
                <DialogContent>
                    {contractData.status === 'Disputed' ? (
                        <Box sx={{ mt: 2 }}>
                            <TextField
                                fullWidth
                                label="Client Share (ETH)"
                                type="number"
                                value={clientShare}
                                onChange={(e) => setClientShare(e.target.value)}
                                sx={{ mb: 2 }}
                            />
                            <TextField
                                fullWidth
                                label="Freelancer Share (ETH)"
                                type="number"
                                value={freelancerShare}
                                onChange={(e) => setFreelancerShare(e.target.value)}
                            />
                        </Box>
                    ) : (
                        <Typography>
                            Are you sure you want to raise a dispute? This will require a dispute fee.
                        </Typography>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDisputeDialogOpen(false)}>Cancel</Button>
                    {contractData.status === 'Disputed' ? (
                        <Button
                            onClick={handleResolveDispute}
                            color="primary"
                            disabled={loading || !clientShare || !freelancerShare}
                        >
                            Resolve
                        </Button>
                    ) : (
                        <Button
                            onClick={handleRaiseDispute}
                            color="warning"
                            disabled={loading}
                        >
                            Raise Dispute
                        </Button>
                    )}
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ContractSign; 