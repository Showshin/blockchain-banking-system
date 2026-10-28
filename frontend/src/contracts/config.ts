export interface ContractConfig {
  chainId: number
  deploymentBlock: number
  coreAddress: string
  vaultAddress: string
  usdcAddress: string
}

const read = (value: string | undefined): string => value?.trim() ?? ''

const chainId = Number(read(import.meta.env.VITE_CHAIN_ID))
const deploymentBlock = Number(read(import.meta.env.VITE_DEPLOY_BLOCK))
const coreAddress = read(import.meta.env.VITE_CORE_ADDRESS)
const vaultAddress = read(import.meta.env.VITE_VAULT_ADDRESS)
const usdcAddress = read(import.meta.env.VITE_USDC_ADDRESS)

const values = [coreAddress, vaultAddress, usdcAddress]
export const contractConfigError =
  values.some(Boolean) && values.some((value) => !value)
    ? 'Contract mode needs all three contract addresses.'
    : values.some(Boolean) && (!Number.isSafeInteger(chainId) || chainId <= 0)
      ? 'Contract mode needs a positive chain ID.'
      : null

export const contractConfig: ContractConfig | null =
  values.every(Boolean) && Number.isSafeInteger(chainId) && chainId > 0 && !contractConfigError
    ? {
        chainId,
        deploymentBlock: Number.isSafeInteger(deploymentBlock) && deploymentBlock >= 0 ? deploymentBlock : 0,
        coreAddress,
        vaultAddress,
        usdcAddress,
      }
    : null

export const hasContractConfig = contractConfig !== null
