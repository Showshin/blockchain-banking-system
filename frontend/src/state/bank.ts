import { createContext, useContext } from 'react'
import type { BankState, Deposit } from '../types'

export interface WithdrawReceipt {
  kind: 'early' | 'partial' | 'mature'
  interest: number
  penalty: number
  payout: number
  remainingPrincipal: number
  pendingInterest: number
}

export interface ClaimReceipt {
  interest: number
}

export interface TopUpReceipt {
  amount: number
  newPrincipal: number
  interestAdded: number
}

export interface WalletIdentity {
  name: string
  icon: string
  rdns: string
}

export interface BankContextValue {
  state: BankState
  isChainMode: boolean
  chainLoading: boolean
  /** True once a snapshot has loaded for the connected wallet. */
  chainLoaded: boolean
  chainError: string | null
  networkMismatch: boolean
  openDeposit: (planId: string, amount: number) => Promise<Deposit>
  withdrawDeposit: (depositId: string) => Promise<WithdrawReceipt>
  withdrawDepositPartial: (depositId: string, amount: number) => Promise<WithdrawReceipt>
  renewDeposit: (depositId: string, newPlanId: string) => Promise<Deposit>
  topUpDeposit: (depositId: string, amount: number) => Promise<TopUpReceipt>
  claimInterest: (depositId: string) => Promise<ClaimReceipt>
  /** Mints MockUSDC to the connected wallet so a visitor can try the flows. */
  requestTestFunds: (amount: number) => Promise<string>
  connectWallet: (address: string, identity?: WalletIdentity) => void
  disconnectWallet: () => void
  refreshChain: () => Promise<void>
  /** Refreshes now and again after the next block, for post-transaction reads. */
  refreshAfterTx: () => Promise<void>
}

export const BankContext = createContext<BankContextValue | null>(null)

export function useBank(): BankContextValue {
  const context = useContext(BankContext)
  if (!context) throw new Error('useBank must be used inside BankProvider')
  return context
}
