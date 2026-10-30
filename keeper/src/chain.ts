import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { ERC20_ABI, SAVING_CORE_ABI, VAULT_MANAGER_ABI } from "./abis.ts";
import type { KeeperConfig } from "./config.ts";

export type KeeperContext = {
  provider: JsonRpcProvider;
  wallet: Wallet;
  address: string;
  core: Contract;
  vault: Contract;
  token: Contract;
  config: KeeperConfig;
};

export async function createContext(config: KeeperConfig): Promise<KeeperContext> {
  const provider = new JsonRpcProvider(config.rpcUrl, config.chainId, { staticNetwork: true });

  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(config.chainId)) {
    throw new Error(`RPC_URL serves chain ${network.chainId}, expected ${config.chainId}.`);
  }

  let wallet: Wallet;
  try {
    wallet = new Wallet(config.privateKey, provider);
  } catch {
    throw new Error("KEEPER_PRIVATE_KEY is not a valid private key.");
  }
  const address = await wallet.getAddress();

  return {
    provider,
    wallet,
    address,
    core: new Contract(config.addresses.core, SAVING_CORE_ABI, wallet),
    vault: new Contract(config.addresses.vault, VAULT_MANAGER_ABI, wallet),
    token: new Contract(config.addresses.usdc, ERC20_ABI, wallet),
    config,
  };
}
