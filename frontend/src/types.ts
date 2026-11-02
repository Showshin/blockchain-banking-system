export type DepositStatus =
  | 'active'
  | 'withdrawn'
  | 'manual-renewed'
  | 'auto-renewed'
  | 'principal-withdrawn'

export type WalletMode = 'injected'

export interface LocalizedText {
  vi: string
  en: string
}

export interface SavingPlan {
  id: string
  name: LocalizedText
  tenorDays: number
  aprBps: number
  minDeposit: number
  maxDeposit: number
  /** True when the plan has no cap on chain (`maxDeposit == 0`). */
  uncapped?: boolean
  penaltyBps: number
  enabled: boolean
  popular?: boolean
  description: LocalizedText
}

export interface Deposit {
  id: string
  certificateNo: number
  planId: string
  principal: number
  aprBpsAtOpen: number
  penaltyBpsAtOpen: number
  tenorDays: number
  openedAt: string
  maturityAt: string
  status: DepositStatus
  owner: string
  interestAtMaturity: number
  pendingInterest: number
  /** Interest actually paid by the Withdrawn event, when the deposit was settled. */
  realizedInterest?: number
  /** True when the Withdrawn event reports an early withdrawal. */
  withdrawnEarly?: boolean
  parentId?: string
}

export interface WalletState {
  connected: boolean
  mode: WalletMode | null
  address: string | null
  balance: number
  name: string | null
  icon: string | null
}

export interface VaultState {
  balance: number
  /** Interest promised to open deposits; the admin cannot withdraw this. */
  reserved: number
  paused: boolean
  core: string | null
  feeReceiver: string | null
}

/** Roles held by the connected wallet, read from both contracts. */
export interface RoleState {
  admin: boolean
  pauser: boolean
  planManager: boolean
}

export interface BankState {
  plans: SavingPlan[]
  deposits: Deposit[]
  wallet: WalletState
  vault: VaultState
  /** USDC held by SavingCore, i.e. the principal of open deposits. */
  coreBalance: number
  roles: RoleState
}

export interface EthereumProvider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>
  on?(event: string, handler: (...args: unknown[]) => void): void
  removeListener?(event: string, handler: (...args: unknown[]) => void): void
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}
