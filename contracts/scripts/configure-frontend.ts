import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Deployment = {
  chainId: number;
  deploymentBlock?: number;
  contracts: {
    MockUSDC: string;
    VaultManager: string;
    SavingCore: string;
  };
};

const networkName = process.argv[2] ?? "localhost";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(scriptDir, "..");
const deploymentPath = path.join(rootDir, "deployments", `${networkName}.json`);

if (!fs.existsSync(deploymentPath)) {
  throw new Error(`Missing ${deploymentPath}. Deploy to ${networkName} first.`);
}

const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8")) as Deployment;
const env = [
  `VITE_CHAIN_ID=${deployment.chainId}`,
  `VITE_DEPLOY_BLOCK=${deployment.deploymentBlock ?? 0}`,
  `VITE_CORE_ADDRESS=${deployment.contracts.SavingCore}`,
  `VITE_VAULT_ADDRESS=${deployment.contracts.VaultManager}`,
  `VITE_USDC_ADDRESS=${deployment.contracts.MockUSDC}`,
  "",
].join("\n");

const outputPath = path.join(rootDir, "..", "frontend", ".env.local");
fs.writeFileSync(outputPath, env);
console.log(`Frontend contract configuration written to ${outputPath}`);
