import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(scriptDir, "..");
const frontendContractsDir = path.join(rootDir, "..", "frontend", "src", "contracts");

const artifacts = [
  ["MockUSDC", "contracts/MockUSDC.sol/MockUSDC.json"],
  ["VaultManager", "contracts/VaultManager.sol/VaultManager.json"],
  ["SavingCore", "contracts/SavingCore.sol/SavingCore.json"],
] as const;

const exports = artifacts.map(([name, artifactPath]) => {
  const artifactFile = path.join(rootDir, "artifacts", artifactPath);
  if (!fs.existsSync(artifactFile)) {
    throw new Error(`Missing ${artifactFile}. Run \`npm run compile\` first.`);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactFile, "utf8")) as { abi: unknown[] };
  return `export const ${name}Abi = ${JSON.stringify(artifact.abi, null, 2)} as const;`;
});

fs.mkdirSync(frontendContractsDir, { recursive: true });
fs.writeFileSync(
  path.join(frontendContractsDir, "abis.ts"),
  `// Generated from the compiled Hardhat artifacts. Do not edit by hand.\n${exports.join("\n\n")}\n`,
);
console.log(`ABIs written to ${path.join(frontendContractsDir, "abis.ts")}`);
