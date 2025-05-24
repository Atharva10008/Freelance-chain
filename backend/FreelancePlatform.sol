// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract FreelancePlatform {
    // Structs
    struct Proposal {
        uint256 id;
        address freelancer;
        address client;
        string description;
        uint256 bidAmount;
        uint256 duration; // in days
        ProposalStatus status;
    }

    struct Contract {
        uint256 id;
        uint256 proposalId;
        address freelancer;
        address client;
        uint256 amount;
        uint256 deadline;
        ContractStatus status;
        string deliverables;
        bool workSubmitted;
        bool clientApproved;
        bool clientSigned;
        bool freelancerSigned;
    }

    struct Review {
        address reviewer;
        address reviewee;
        uint256 rating;
        string comment;
        uint256 timestamp;
    }

    // Enums
    enum ProposalStatus { Pending, Accepted, Rejected, Negotiating }
    enum ContractStatus { Created, Funded, InProgress, Completed, Disputed }

    // State Variables
    uint256 public nextProposalId = 1;
    uint256 public nextContractId = 1;
    
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => Contract) public contracts;
    mapping(address => uint256[]) public clientProposals;
    mapping(address => uint256[]) public freelancerProposals;
    mapping(address => uint256[]) public clientContracts;
    mapping(address => uint256[]) public freelancerContracts;
    mapping(address => Review[]) public reviews;
    mapping(address => uint256) public reputation; // Simple reputation score

    // Events
    event ProposalSubmitted(uint256 indexed proposalId, address indexed freelancer, address indexed client);
    event ProposalStatusChanged(uint256 indexed proposalId, ProposalStatus status);
    event ContractCreated(uint256 indexed contractId, uint256 indexed proposalId);
    event EscrowFunded(uint256 indexed contractId, uint256 amount);
    event WorkSubmitted(uint256 indexed contractId, string deliverables);
    event WorkApproved(uint256 indexed contractId);
    event RevisionRequested(uint256 indexed contractId);
    event PaymentReleased(uint256 indexed contractId, uint256 amount);
    event ReviewAdded(address indexed reviewee, address indexed reviewer, uint256 rating);
    event Signed(uint256 indexed contractId, address indexed signer);

    // Modifiers
    modifier onlyClient(uint256 proposalId) {
        require(msg.sender == proposals[proposalId].client, "Only client can perform this action");
        _;
    }

    modifier onlyFreelancer(uint256 proposalId) {
        require(msg.sender == proposals[proposalId].freelancer, "Only freelancer can perform this action");
        _;
    }

    modifier onlyContractClient(uint256 contractId) {
        require(msg.sender == contracts[contractId].client, "Only contract client can perform this action");
        _;
    }

    modifier onlyContractFreelancer(uint256 contractId) {
        require(msg.sender == contracts[contractId].freelancer, "Only contract freelancer can perform this action");
        _;
    }

    modifier proposalExists(uint256 proposalId) {
        require(proposalId > 0 && proposalId < nextProposalId, "Proposal does not exist");
        _;
    }

    modifier contractExists(uint256 contractId) {
        require(contractId > 0 && contractId < nextContractId, "Contract does not exist");
        _;
    }

    // Functions
    function submitProposal(
        address client,
        string memory description,
        uint256 bidAmount,
        uint256 duration
    ) external {
        require(client != address(0), "Invalid client address");
        require(client != msg.sender, "Cannot submit proposal to yourself");
        require(bidAmount > 0, "Bid amount must be greater than 0");
        require(duration > 0, "Duration must be greater than 0");

        uint256 proposalId = nextProposalId++;
        proposals[proposalId] = Proposal({
            id: proposalId,
            freelancer: msg.sender,
            client: client,
            description: description,
            bidAmount: bidAmount,
            duration: duration,
            status: ProposalStatus.Pending
        });

        clientProposals[client].push(proposalId);
        freelancerProposals[msg.sender].push(proposalId);

        emit ProposalSubmitted(proposalId, msg.sender, client);
    }

    function respondToProposal(
        uint256 proposalId,
        ProposalStatus status
    ) external onlyClient(proposalId) proposalExists(proposalId) {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Pending, "Proposal already responded to");

        proposal.status = status;

        if (status == ProposalStatus.Accepted) {
            createContract(proposalId);
        }

        emit ProposalStatusChanged(proposalId, status);
    }

    function createContract(uint256 proposalId) internal {
        Proposal memory proposal = proposals[proposalId];
        
        uint256 contractId = nextContractId++;
        contracts[contractId] = Contract({
            id: contractId,
            proposalId: proposalId,
            freelancer: proposal.freelancer,
            client: proposal.client,
            amount: proposal.bidAmount,
            deadline: block.timestamp + (proposal.duration * 1 days),
            status: ContractStatus.Created,
            deliverables: "",
            workSubmitted: false,
            clientApproved: false,
            clientSigned: false,
            freelancerSigned: false
        });

        clientContracts[proposal.client].push(contractId);
        freelancerContracts[proposal.freelancer].push(contractId);

        emit ContractCreated(contractId, proposalId);
    }

    function fundEscrow(uint256 contractId) external payable contractExists(contractId) onlyContractClient(contractId) {
        Contract storage contractData = contracts[contractId];
        require(contractData.status == ContractStatus.Created, "Contract must be in Created state");
        require(msg.value == contractData.amount, "Amount must match contract value");

        contractData.status = ContractStatus.Funded;

        emit EscrowFunded(contractId, msg.value);
    }

    function submitWork(uint256 contractId, string memory deliverables) 
        external 
        contractExists(contractId) 
        onlyContractFreelancer(contractId) 
    {
        Contract storage contractData = contracts[contractId];
        require(contractData.status == ContractStatus.Funded, "Contract must be funded first");
        require(bytes(deliverables).length > 0, "Deliverables cannot be empty");
        require(block.timestamp <= contractData.deadline, "Contract deadline has passed");

        contractData.deliverables = deliverables;
        contractData.workSubmitted = true;
        contractData.status = ContractStatus.InProgress;

        emit WorkSubmitted(contractId, deliverables);
    }

    function approveWork(uint256 contractId) 
        external 
        contractExists(contractId) 
        onlyContractClient(contractId) 
    {
        Contract storage contractData = contracts[contractId];
        require(contractData.workSubmitted, "Work must be submitted first");
        require(!contractData.clientApproved, "Work already approved");

        contractData.clientApproved = true;
        contractData.status = ContractStatus.Completed;

        releasePayment(contractId);

        emit WorkApproved(contractId);
    }

    function requestRevision(uint256 contractId) 
        external 
        contractExists(contractId) 
        onlyContractClient(contractId) 
    {
        Contract storage contractData = contracts[contractId];
        require(contractData.workSubmitted, "Work must be submitted first");
        require(!contractData.clientApproved, "Work already approved");

        contractData.workSubmitted = false;

        emit RevisionRequested(contractId);
    }

    function releasePayment(uint256 contractId) internal {
        Contract storage contractData = contracts[contractId];
        require(contractData.clientApproved, "Work must be approved first");
        require(address(this).balance >= contractData.amount, "Insufficient contract balance");

        (bool success, ) = payable(contractData.freelancer).call{value: contractData.amount}("");
        require(success, "Payment transfer failed");

        emit PaymentReleased(contractId, contractData.amount);
    }

    function leaveReview(
        address reviewee,
        uint256 rating,
        string memory comment
    ) external {
        require(reviewee != address(0), "Invalid reviewee address");
        require(reviewee != msg.sender, "Cannot review yourself");
        require(rating >= 1 && rating <= 5, "Rating must be between 1 and 5");

        reviews[reviewee].push(Review({
            reviewer: msg.sender,
            reviewee: reviewee,
            rating: rating,
            comment: comment,
            timestamp: block.timestamp
        }));

        // Update reputation score
        reputation[reviewee] += rating;

        emit ReviewAdded(reviewee, msg.sender, rating);
    }

    function signContract(uint256 contractId) external contractExists(contractId) {
        Contract storage c = contracts[contractId];
        require(msg.sender == c.client || msg.sender == c.freelancer, "Not a party");
        if (msg.sender == c.client) {
            require(!c.clientSigned, "Client already signed");
            c.clientSigned = true;
        } else {
            require(!c.freelancerSigned, "Freelancer already signed");
            c.freelancerSigned = true;
        }
        emit Signed(contractId, msg.sender);
    }

    // View functions
    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        require(proposalId > 0 && proposalId < nextProposalId, "Proposal does not exist");
        return proposals[proposalId];
    }

    function getContract(uint256 contractId) external view returns (Contract memory) {
        require(contractId > 0 && contractId < nextContractId, "Contract does not exist");
        return contracts[contractId];
    }

    function getClientProposals(address client) external view returns (uint256[] memory) {
        return clientProposals[client];
    }

    function getFreelancerProposals(address freelancer) external view returns (uint256[] memory) {
        return freelancerProposals[freelancer];
    }

    function getClientContracts(address client) external view returns (uint256[] memory) {
        return clientContracts[client];
    }

    function getFreelancerContracts(address freelancer) external view returns (uint256[] memory) {
        return freelancerContracts[freelancer];
    }

    function getReviews(address user) external view returns (Review[] memory) {
        return reviews[user];
    }

    function getReputation(address user) external view returns (uint256) {
        return reputation[user];
    }
}