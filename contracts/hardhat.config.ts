import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configVariable, defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatEthersChaiMatchers from "@nomicfoundation/hardhat-ethers-chai-matchers";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import hardhatNetworkHelpers from "@nomicfoundation/hardhat-network-helpers";

function resolveSepoliaForkBlock(): number | undefined {
  const override = process.env.TESTNET_FORK_BLOCK?.trim();
  if (override) {
    const block = Number(override);
    if (!Number.isSafeInteger(block) || block <= 0) {
      throw new Error("TESTNET_FORK_BLOCK must be a positive integer.");
    }
    return block;
  }

  const configDir = path.dirname(fileURLToPath(import.meta.url));
  const manifestPath = path.join(configDir, "deployments", "testnet.json");
  if (!fs.existsSync(manifestPath)) return undefined;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    deploymentBlock?: number;
    completedBlock?: number;
  };
  if (Number.isSafeInteger(manifest.completedBlock) && Number(manifest.completedBlock) > 0) {
    return manifest.completedBlock;
  }
  if (Number.isSafeInteger(manifest.deploymentBlock) && Number(manifest.deploymentBlock) > 0) {
    return Number(manifest.deploymentBlock) + 20;
  }
  return undefined;
}

const sepoliaForkBlock = resolveSepoliaForkBlock();

export default defineConfig({
  plugins: [
    hardhatEthers,
    hardhatMocha,
    hardhatEthersChaiMatchers,
    hardhatNetworkHelpers,
  ],
  solidity: {
    version: "0.8.38",
    settings: {
      evmVersion: "osaka",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 31337,
    },
    localhost: {
      type: "http",
      chainType: "l1",
      chainId: 31337,
      url: "http://127.0.0.1:8545",
    },
    testnet: {
      type: "http",
      chainType: "l1",
      chainId: 11155111,
      url: configVariable("TESTNET_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    sepoliaFork: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 11155111,
      forking: {
        url: configVariable("TESTNET_RPC_URL"),
        blockNumber: sepoliaForkBlock,
      },
    },
  },
});
