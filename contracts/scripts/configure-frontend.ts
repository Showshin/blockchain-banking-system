import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZeroAddress, getAddress } from "ethers";
import { TESTNET_CHAIN_ID, TESTNET_NETWORK, readManifest } from "./lib/manifest";

const networkName = process.argv[2] ?? TESTNET_NETWORK;
if (networkName !== TESTNET_NETWORK) {
  throw new Error(`Frontend configuration is locked to ${TESTNET_NETWORK}; received ${networkName}.`);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const deploymentPath = path.join(scriptDir, "..", "deployments", `${TESTNET_NETWORK}.json`);
const deployment = readManifest(deploymentPath);

if (deployment.network !== TESTNET_NETWORK || deployment.chainId !== TESTNET_CHAIN_ID) {
  throw new Error(`Manifest is not a ${TESTNET_NETWORK} (${TESTNET_CHAIN_ID}) deployment.`);
}
if (!Number.isInteger(deployment.deploymentBlock) || deployment.deploymentBlock <= 0) {
  throw new Error("Manifest deploymentBlock must be a positive block number.");
}

const addresses = Object.entries(deployment.contracts).map(([name, address]) => {
  const checksummed = getAddress(address);
  if (checksummed === ZeroAddress) throw new Error(`${name} is the zero address.`);
  return [name, checksummed] as const;
});
if (addresses.length !== 3) {
  throw new Error("Manifest must contain MockUSDC, VaultManager and SavingCore.");
}

const contracts = Object.fromEntries(addresses) as Record<string, string>;
const env = [
  `VITE_CHAIN_ID=${deployment.chainId}`,
  `VITE_DEPLOY_BLOCK=${deployment.deploymentBlock}`,
  `VITE_CORE_ADDRESS=${contracts.SavingCore}`,
  `VITE_VAULT_ADDRESS=${contracts.VaultManager}`,
  `VITE_USDC_ADDRESS=${contracts.MockUSDC}`,
  "",
].join("\n");

const outputPath = path.join(scriptDir, "..", "..", "frontend", ".env.local");
fs.writeFileSync(outputPath, env);
console.log(`Frontend contract configuration written to ${outputPath}`);
