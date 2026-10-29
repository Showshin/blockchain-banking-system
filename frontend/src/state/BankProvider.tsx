import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { hasContractConfig } from '../contracts/config'
import { useI18n } from '../i18n/lang'
import type { Messages } from '../i18n/messages'
import { isMatured } from '../lib/bank'
import type { BankState, Deposit } from '../types'
import {
  BankContext,
  type BankContextValue,
  type ClaimReceipt,
  type TopUpReceipt,
  type WalletIdentity,
  type WithdrawReceipt,
} from './bank'
import {
  clearWallet,
  getActiveWallet,
  restoreInjectedWallet,
  subscribeWalletEvents,
  targetChainId,
} from '../contracts/wallet'


function emptyBankState(): BankState {
  return {
    plans: [],
    deposits: [],
    wallet: { connected: false, mode: null, address: null, balance: 0, name: null, icon: null },
    vault: { balance: 0 },
  }
}

function causeMessage(cause: unknown): string {
  if (!cause || typeof cause !== 'object') return ''
  const record = cause as { shortMessage?: unknown; reason?: unknown; message?: unknown }
  for (const value of [record.shortMessage, record.reason, record.message]) {
    if (typeof value === 'string') return value
  }
  return ''
}

function chainIdFromHex(value: string | null): number | null {
  if (!value) return null
  const parsed = value.startsWith('0x') ? Number.parseInt(value, 16) : Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function translateChainError(cause: unknown, t: Messages): Error {
  const message = causeMessage(cause)
  const mapping: Array<[string, string]> = [
    ['ACTION_REJECTED', t.errors.walletRejected],
    ['user rejected', t.errors.walletRejected],
    ['Core: below minimum', t.errors.minimumRevert],
    ['Core: above maximum', t.errors.maximumRevert],
    ['Core: invalid partial amount', t.errors.invalidPartialAmount],
    ['Core: remaining below minimum', t.errors.remainingBelowMinimum],
    ['Core: insufficient balance', t.errors.insufficientBalance],
    ['ERC20InsufficientBalance', t.errors.insufficientBalance],
    ['Vault: insufficient interest', t.errors.vaultShortfall],
    ['Core: not matured', t.errors.notMatured],
    ['Core: already matured', t.errors.alreadyMatured],
    ['Core: deposit inactive', t.errors.depositInactive],
    ['Core: not certificate owner', t.errors.notCertificateOwner],
    ['Core: plan unavailable', t.errors.planUnavailable],
    ['Core: system paused', t.errors.systemPaused],
    ['Core: no pending interest', t.errors.noPendingInterest],
    ['Core: invalid amount', t.errors.invalidAmount],
    ['Vault: interest not reserved', t.errors.interestNotReserved],
    ['Vault: reserve exceeds balance', t.errors.vaultReserveExceedsBalance],
    ['Vault: reserved interest', t.errors.vaultProtected],
    ['Vault: undercollateralized', t.errors.vaultProtected],
    ['Vault: release exceeds reserved', t.errors.vaultProtected],
  ]
  const match = mapping.find(([fragment]) => message.includes(fragment))
  if (match) return new Error(match[1])
  if (message.startsWith('WRONG_NETWORK:')) {
    return new Error(t.errors.wrongNetwork(message.slice('WRONG_NETWORK:'.length)))
  }
  return new Error(t.errors.chainGeneric)
}

export function BankProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [state, setState] = useState<BankState>(emptyBankState)
  const [chainLoading, setChainLoading] = useState(false)
  const [chainError, setChainError] = useState<string | null>(null)
  const [networkMismatch, setNetworkMismatch] = useState(false)
  const address = state.wallet.address
  const isChainMode = hasContractConfig && state.wallet.connected

  const refreshChain = useCallback(async () => {
    if (!isChainMode || !address) {
      setChainError(null)
      setNetworkMismatch(false)
      return
    }
    setChainLoading(true)
    try {
      const { assertConfiguredNetwork, loadChainSnapshot } = await import('../contracts/adapter')
      await assertConfiguredNetwork()
      setNetworkMismatch(false)
      const snapshot = await loadChainSnapshot(address)
      setState((current) => {
        if (current.wallet.address?.toLowerCase() !== address.toLowerCase()) return current
        return {
          ...current,
          plans: snapshot.plans,
          deposits: snapshot.deposits,
          wallet: { ...current.wallet, balance: snapshot.walletBalance },
          vault: { balance: snapshot.vaultBalance },
        }
      })
      setChainError(null)
    } catch (cause) {
      console.error('Chain refresh failed', cause)
      if (causeMessage(cause).startsWith('WRONG_NETWORK:')) {
        setNetworkMismatch(true)
        setState((current) => {
          if (current.wallet.address?.toLowerCase() !== address.toLowerCase()) return current
          return {
            ...current,
            plans: [],
            deposits: [],
            wallet: { ...current.wallet, balance: 0 },
            vault: { balance: 0 },
          }
        })
      }
      setChainError(translateChainError(cause, t).message)
    } finally {
      setChainLoading(false)
    }
  }, [address, isChainMode, t])

  useEffect(() => {
    const task = window.setTimeout(() => void refreshChain(), 0)
    return () => window.clearTimeout(task)
  }, [refreshChain])

  const openDeposit = useCallback(
    async (planId: string, amount: number): Promise<Deposit> => {
      if (!state.wallet.connected) throw new Error(t.errors.walletRequired)
      const plan = state.plans.find((candidate) => candidate.id === planId)
      if (!plan || !plan.enabled) throw new Error(t.errors.planUnavailable)
      if (!Number.isFinite(amount) || amount <= 0) throw new Error(t.errors.invalidAmount)
      if (amount < plan.minDeposit) {
        throw new Error(t.errors.minAmount(plan.minDeposit.toLocaleString('en-US')))
      }
      if (amount > plan.maxDeposit) {
        throw new Error(t.errors.maxAmount(plan.maxDeposit.toLocaleString('en-US')))
      }
      if (amount > state.wallet.balance) throw new Error(t.errors.insufficientBalance)

      if (address) {
        try {
          const { openChainDeposit } = await import('../contracts/adapter')
          const deposit = await openChainDeposit(address, plan.id, amount)
          await refreshChain()
          return deposit
        } catch (cause) {
          throw translateChainError(cause, t)
        }
      }
      throw new Error(t.errors.walletRequired)
    },
    [address, refreshChain, state.plans, state.wallet.balance, state.wallet.connected, t],
  )

  const withdrawDeposit = useCallback(
    async (depositId: string): Promise<WithdrawReceipt> => {
      if (!state.wallet.connected) throw new Error(t.errors.walletRequired)
      const deposit = state.deposits.find((candidate) => candidate.id === depositId)
      if (!deposit || deposit.status !== 'active') throw new Error(t.errors.depositInactive)

      if (address) {
        try {
          const { withdrawChainDeposit } = await import('../contracts/adapter')
          const result = await withdrawChainDeposit(address, deposit.id)
          await refreshChain()
          return result.receipt
        } catch (cause) {
          throw translateChainError(cause, t)
        }
      }
      throw new Error(t.errors.walletRequired)
    },
    [address, refreshChain, state.deposits, state.wallet.connected, t],
  )

  const withdrawDepositPartial = useCallback(
    async (depositId: string, amount: number): Promise<WithdrawReceipt> => {
      if (!state.wallet.connected) throw new Error(t.errors.walletRequired)
      const deposit = state.deposits.find((candidate) => candidate.id === depositId)
      if (!deposit || deposit.status !== 'active') throw new Error(t.errors.depositInactive)
      if (!Number.isFinite(amount) || amount <= 0 || amount >= deposit.principal) {
        throw new Error(t.errors.invalidPartialAmount)
      }

      if (address) {
        try {
          const { withdrawChainDepositPartial } = await import('../contracts/adapter')
          const result = await withdrawChainDepositPartial(address, deposit.id, amount)
          await refreshChain()
          return result.receipt
        } catch (cause) {
          throw translateChainError(cause, t)
        }
      }
      throw new Error(t.errors.walletRequired)
    },
    [address, refreshChain, state.deposits, state.wallet.connected, t],
  )

  const renewDeposit = useCallback(
    async (depositId: string, newPlanId: string): Promise<Deposit> => {
      if (!state.wallet.connected) throw new Error(t.errors.walletRequired)
      const oldDeposit = state.deposits.find((candidate) => candidate.id === depositId)
      if (!oldDeposit || oldDeposit.status !== 'active') throw new Error(t.errors.depositInactive)
      if (!isMatured(oldDeposit)) throw new Error(t.errors.notMatured)
      const plan = state.plans.find((candidate) => candidate.id === newPlanId)
      if (!plan || !plan.enabled) throw new Error(t.errors.renewPlanUnavailable)

      if (address) {
        try {
          const { renewChainDeposit } = await import('../contracts/adapter')
          const newDeposit = await renewChainDeposit(address, oldDeposit.id, plan.id)
          await refreshChain()
          return newDeposit
        } catch (cause) {
          throw translateChainError(cause, t)
        }
      }
      throw new Error(t.errors.walletRequired)
    },
    [address, refreshChain, state.deposits, state.plans, state.wallet.connected, t],
  )

  const topUpDeposit = useCallback(
    async (depositId: string, amount: number): Promise<TopUpReceipt> => {
      if (!state.wallet.connected) throw new Error(t.errors.walletRequired)
      const deposit = state.deposits.find((candidate) => candidate.id === depositId)
      if (!deposit || deposit.status !== 'active') throw new Error(t.errors.depositInactive)
      if (isMatured(deposit)) throw new Error(t.errors.topUpMatured)
      const plan = state.plans.find((candidate) => candidate.id === deposit.planId)
      if (!plan) throw new Error(t.errors.planUnavailable)
      if (!Number.isFinite(amount) || amount <= 0) throw new Error(t.errors.invalidAmount)
      if (deposit.principal + amount > plan.maxDeposit) {
        throw new Error(t.errors.maxAmount(plan.maxDeposit.toLocaleString('en-US')))
      }
      if (amount > state.wallet.balance) throw new Error(t.errors.insufficientBalance)

      if (address) {
        try {
          const { topUpChainDeposit } = await import('../contracts/adapter')
          const result = await topUpChainDeposit(address, deposit.id, amount)
          await refreshChain()
          return result.receipt
        } catch (cause) {
          throw translateChainError(cause, t)
        }
      }
      throw new Error(t.errors.walletRequired)
    },
    [address, refreshChain, state.deposits, state.plans, state.wallet.balance, state.wallet.connected, t],
  )

  const claimInterest = useCallback(
    async (depositId: string): Promise<ClaimReceipt> => {
      if (!state.wallet.connected) throw new Error(t.errors.walletRequired)
      const deposit = state.deposits.find((candidate) => candidate.id === depositId)
      if (
        !deposit ||
        deposit.status !== 'principal-withdrawn' ||
        deposit.pendingInterest <= 0
      ) {
        throw new Error(t.errors.noPendingInterest)
      }

      if (address) {
        try {
          const { claimChainInterest } = await import('../contracts/adapter')
          const result = await claimChainInterest(address, deposit.id)
          await refreshChain()
          return result
        } catch (cause) {
          throw translateChainError(cause, t)
        }
      }
      throw new Error(t.errors.walletRequired)
    },
    [address, refreshChain, state.deposits, state.wallet.connected, t],
  )

  const connectWallet = useCallback((nextAddress: string, identity?: WalletIdentity) => {
    setChainError(null)
    setNetworkMismatch(false)
    setState({
      ...emptyBankState(),
      wallet: {
        connected: true,
        mode: 'injected',
        address: nextAddress,
        balance: 0,
        name: identity?.name ?? null,
        icon: identity?.icon ?? null,
      },
    })
  }, [])

  const disconnectWallet = useCallback(() => {
    clearWallet()
    setChainError(null)
    setNetworkMismatch(false)
    setState(emptyBankState())
  }, [])

  useEffect(() => {
    if (!hasContractConfig || state.wallet.connected) return
    let cancelled = false
    void (async () => {
      const restored = await restoreInjectedWallet()
      if (!restored || cancelled) return
      connectWallet(restored.address, {
        name: restored.wallet.name,
        icon: restored.wallet.icon,
        rdns: restored.wallet.rdns,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [connectWallet, state.wallet.connected])

  useEffect(() => {
    if (state.wallet.mode !== 'injected') return
    return subscribeWalletEvents({
      onAccountsChanged: (nextAddress) => {
        if (!nextAddress) {
          disconnectWallet()
          return
        }
        const wallet = getActiveWallet()
        connectWallet(nextAddress, {
          name: wallet?.name ?? state.wallet.name ?? '',
          icon: wallet?.icon ?? state.wallet.icon ?? '',
          rdns: wallet?.rdns ?? '',
        })
      },
      onChainChanged: (chainId) => {
        const actual = chainIdFromHex(chainId)
        if (actual !== null) {
          if (actual !== targetChainId()) {
            setNetworkMismatch(true)
            setState((current) => ({
              ...current,
              plans: [],
              deposits: [],
              wallet: { ...current.wallet, balance: 0 },
              vault: { balance: 0 },
            }))
          } else {
            setNetworkMismatch(false)
          }
        }
        void refreshChain()
      },
    })
  }, [connectWallet, disconnectWallet, refreshChain, state.wallet.icon, state.wallet.mode, state.wallet.name])

  const value = useMemo<BankContextValue>(
    () => ({
      state,
      isChainMode,
      chainLoading,
      chainError,
      networkMismatch,
      openDeposit,
      withdrawDeposit,
      withdrawDepositPartial,
      renewDeposit,
      topUpDeposit,
      claimInterest,
      connectWallet,
      disconnectWallet,
      refreshChain,
    }),
    [
      state,
      isChainMode,
      chainLoading,
      chainError,
      networkMismatch,
      openDeposit,
      withdrawDeposit,
      withdrawDepositPartial,
      renewDeposit,
      topUpDeposit,
      claimInterest,
      connectWallet,
      disconnectWallet,
      refreshChain,
    ],
  )

  return <BankContext.Provider value={value}>{children}</BankContext.Provider>
}
