import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config({ path: "../.env.local" });

const PRIVATE_KEY         = process.env.DEPLOYER_PRIVATE_KEY ?? "";
const MANTLESCAN_API_KEY  = process.env.MANTLESCAN_API_KEY   ?? "placeholder";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    mantleTestnet: {
      url: process.env.MANTLE_TESTNET_RPC ?? "https://rpc.sepolia.mantle.xyz",
      chainId: 5003,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    mantleMainnet: {
      url: process.env.MANTLE_MAINNET_RPC ?? "https://rpc.mantle.xyz",
      chainId: 5000,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      mantleTestnet: MANTLESCAN_API_KEY,
      mantleMainnet: MANTLESCAN_API_KEY,
    },
    customChains: [
      {
        network: "mantleTestnet",
        chainId: 5003,
        urls: {
          apiURL:     "https://explorer.sepolia.mantle.xyz/api",
          browserURL: "https://explorer.sepolia.mantle.xyz",
        },
      },
      {
        network: "mantleMainnet",
        chainId: 5000,
        urls: {
          apiURL:     "https://api.mantlescan.xyz/api",
          browserURL: "https://mantlescan.xyz",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    artifacts: "../src/contracts/artifacts",
  },
};

export default config;
