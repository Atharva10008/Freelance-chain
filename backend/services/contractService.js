// services/contractService.js
const Contract = require('../models/Contract');
const Job = require('../models/Job');
const Bid = require('../models/Bid');
const { web3, contract } = require('../config/web3');

exports.createContract = async (freelancerAddress, bidAmount, deadline, jobTitle, jobDescription, clientAddress) => {
  try {
    // Convert deadline to Unix timestamp
    const deadlineTimestamp = Math.floor(new Date(deadline).getTime() / 1000);
    const bidAmountWei = web3.utils.toWei(bidAmount.toString(), 'ether');

    // Create contract
    const tx = await contract.methods.createContract(
      freelancerAddress,
      bidAmountWei,
      deadlineTimestamp,
      jobTitle,
      jobDescription
    ).send({ from: clientAddress });

    // Get the contract ID from the event logs
    const event = tx.events.ContractCreated;
    const contractId = event.returnValues.contractId;

    return {
      contractId,
      txHash: tx.transactionHash
    };
  } catch (error) {
    console.error('Error creating contract:', error);
    throw error;
  }
};

exports.getContractState = async (contractId) => {
  try {
    const contractData = await contract.methods.getContract(contractId).call();
    
    return {
      client: contractData.client,
      freelancer: contractData.freelancer,
      bidAmount: web3.utils.fromWei(contractData.bidAmount, 'ether'),
      deadline: new Date(contractData.deadline * 1000),
      jobTitle: contractData.jobTitle,
      jobDescription: contractData.jobDescription,
      status: ['Created', 'Funded', 'InProgress', 'Completed', 'Disputed'][contractData.status],
      workSubmissionHash: contractData.workSubmissionHash,
      fundsDeposited: web3.utils.fromWei(contractData.fundsDeposited, 'ether')
    };
  } catch (error) {
    console.error('Error getting contract state:', error);
    throw error;
  }
};

exports.depositFunds = async (contractId, amount, fromAddress) => {
  try {
    const amountWei = web3.utils.toWei(amount.toString(), 'ether');
    const tx = await contract.methods.depositFunds(contractId)
      .send({ from: fromAddress, value: amountWei });
    return tx.transactionHash;
  } catch (error) {
    console.error('Error depositing funds:', error);
    throw error;
  }
};

exports.submitWork = async (contractId, workHash, fromAddress) => {
  try {
    const tx = await contract.methods.submitWork(contractId, workHash)
      .send({ from: fromAddress });
    return tx.transactionHash;
  } catch (error) {
    console.error('Error submitting work:', error);
    throw error;
  }
};

exports.approveWork = async (contractId, fromAddress) => {
  try {
    const tx = await contract.methods.approveWork(contractId)
      .send({ from: fromAddress });
    return tx.transactionHash;
  } catch (error) {
    console.error('Error approving work:', error);
    throw error;
  }
};

exports.raiseDispute = async (contractId, fromAddress) => {
  try {
    const disputeFee = await contract.methods.disputeFee().call();
    const tx = await contract.methods.raiseDispute(contractId)
      .send({ from: fromAddress, value: disputeFee });
    return tx.transactionHash;
  } catch (error) {
    console.error('Error raising dispute:', error);
    throw error;
  }
};