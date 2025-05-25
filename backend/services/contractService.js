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
    const contractData = await contract.methods.contracts(contractId).call();
    
    return {
      client: contractData.client,
      freelancer: contractData.freelancer,
      bidAmount: web3.utils.fromWei(contractData.amount, 'ether'),
      deadline: new Date(contractData.deadline * 1000),
      jobTitle: contractData.jobTitle,
      jobDescription: contractData.jobDescription,
      status: contractData.status,
      clientSigned: contractData.clientSigned,
      freelancerSigned: contractData.freelancerSigned,
      workSubmitted: contractData.workSubmitted,
      clientApproved: contractData.clientApproved,
      deliverables: contractData.deliverables
    };
  } catch (error) {
    console.error('Error getting contract state:', error);
    throw error;
  }
};

exports.clientSignContract = async (contractId, amount, fromAddress) => {
  try {
    const amountWei = web3.utils.toWei(amount.toString(), 'ether');
    const tx = await contract.methods.clientSignContract(contractId)
      .send({ from: fromAddress, value: amountWei });
    return tx.transactionHash;
  } catch (error) {
    console.error('Error signing contract as client:', error);
    throw error;
  }
};

exports.freelancerSignContract = async (contractId, fromAddress) => {
  try {
    const tx = await contract.methods.freelancerSignContract(contractId)
      .send({ from: fromAddress });
    return tx.transactionHash;
  } catch (error) {
    console.error('Error signing contract as freelancer:', error);
    throw error;
  }
};

exports.submitWork = async (contractId, deliverables, fromAddress) => {
  try {
    const tx = await contract.methods.submitWork(contractId, deliverables)
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

exports.rejectWork = async (contractId, fromAddress) => {
  try {
    const tx = await contract.methods.rejectWork(contractId)
      .send({ from: fromAddress });
    return tx.transactionHash;
  } catch (error) {
    console.error('Error rejecting work:', error);
    throw error;
  }
};