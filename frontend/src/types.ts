export type DepositStatus =
  | 'active'
  | 'withdrawn'
  | 'manual-renewed'
  | 'auto-renewed'
  | 'principal-withdrawn'

export type WalletMode = 'metamask'

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
  parentId?: string
}

export interface WalletState {
  connected: boolean
  mode: WalletMode | null
  address: string | null
  balance: number
}

export interface VaultState {
  balance: number
}

export interface BankState {
  plans: SavingPlan[]
  deposits: Deposit[]
  wallet: WalletState
  vault: VaultState
  nextCertificateNo: number
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
