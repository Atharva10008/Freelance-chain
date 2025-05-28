require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    // Removing the default local network if it exists
    // ... existing code ...
    // Adding Vanguard testnet
    Vanguard: {
      url: "https://rpc-vanguard.vanarchain.com",
      chainId: 78600,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
  },
  // Optionally, set vanguard as the default network
  defaultNetwork: "vanguard"
}; 