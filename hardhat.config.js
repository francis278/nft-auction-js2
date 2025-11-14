require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    // 本地网络 - 不需要私钥
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337
    },
    // 注释掉或修复 Sepolia 配置
    /*
    sepolia: {
      url: "https://sepolia.infura.io/v3/YOUR_INFURA_KEY",
      accounts: ["YOUR_ACTUAL_PRIVATE_KEY_HERE"], // 需要真实的64字符私钥
      chainId: 11155111
    }
    */
  }
};