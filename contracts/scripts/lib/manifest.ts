import fs from "node:fs";

export const TESTNET_CHAIN_ID = 11155111;
export const TESTNET_NETWORK = "testnet";
export const MANIFEST_SCHEMA_VERSION = 2;

export type ManifestTransaction = {
  step: string;
  hash: string;
  nonce: number;
  to: string | null;
  gasLimit: string;
  gasUsed: string;
  effectiveGasPrice: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  blockNumber: number;
};

export type ManifestGas = {
  maxBaseFeeWei: string;
  maxFeeWei: string;
  maxPriorityFeeWei: string;
  worstCaseWei: string;
  actualCostWei: string;
};

export type DeploymentManifest = {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  network: typeof TESTNET_NETWORK;
  chainId: typeof TESTNET_CHAIN_ID;
  deployedAt: string;
  deploymentBlock: number;
  completedBlock: number;
  deployer: string;
  feeReceiver: string;
  explorerBaseUrl: string | null;
  contracts: {
    MockUSDC: string;
    VaultManager: string;
    SavingCore: string;
  };
  transactions: ManifestTransaction[];
  gas: ManifestGas;
  personalVariant: {
    studentId: string;
    gracePeriodSeconds: string;
    defaultAprBps: number;
    defaultPenaltyBps: number;
    defaultTenorDays: number;
  };
  plans: Array<{
    planId: number;
    tenorDays: number;
    aprBps: number;
    minDeposit: string;
    maxDeposit: string;
    penaltyBps: number;
  }>;
};

export const EXPECTED_TRANSACTION_COUNT = 12;

export function readManifest(filePath: string): DeploymentManifest {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing deployment manifest: ${filePath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<DeploymentManifest>;
  if (parsed.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `Manifest schema ${String(parsed.schemaVersion)} is not supported; redeploy with schema ${MANIFEST_SCHEMA_VERSION}.`,
    );
  }
  return parsed as DeploymentManifest;
}
