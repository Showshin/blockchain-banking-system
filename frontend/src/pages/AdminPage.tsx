import {
  ArrowDown,
  ArrowUp,
  Coins,
  Info,
  Lock,
  LockOpen,
  ShieldCheck,
  Wallet,
  WarningCircle,
} from '@phosphor-icons/react'
import { useState, type ReactNode } from 'react'
import { PageHeader } from '../components/PageHeader'
import { SummaryCard } from '../components/SummaryCard'
import { useToast } from '../state/toast'
import { useI18n } from '../i18n/lang'
import { formatAddress, formatUsdc, parseAmount } from '../lib/format'
import { useBank } from '../state/bank'
import { useUi } from '../state/ui'

type ActionId = 'pause' | 'fund' | 'withdraw' | `plan-${string}`

export function AdminPage() {
  const { state, chainLoading, refreshChain } = useBank()
  const { openWallet } = useUi()
  const { toast } = useToast()
  const { t, lang } = useI18n()
  const [busy, setBusy] = useState<ActionId | null>(null)
  const [fundAmount, setFundAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')

  const { roles, vault, wallet } = state
  const available = Math.max(0, vault.balance - vault.reserved)
  const canPause = roles.admin || roles.pauser
  const anyRole = roles.admin || roles.pauser || roles.planManager

  async function run(id: ActionId, action: () => Promise<unknown>) {
    if (!wallet.address) return
    setBusy(id)
    try {
      await action()
      await refreshChain()
      toast({ title: t.admin.toast.done, tone: 'success' })
    } catch (cause) {
      const message =
        (cause as { shortMessage?: string; message?: string }).shortMessage ??
        (cause as Error).message ??
        t.admin.toast.failed
      toast({ title: t.admin.toast.failed, message, tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={t.admin.eyebrow}
        title={t.admin.title}
        description={t.admin.description}
      />

      {!wallet.connected ? (
        <div className="mb-5 flex flex-col gap-3 rounded-[16px] border border-line bg-surface px-4 py-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>{t.admin.connectNotice}</span>
          <button type="button" className="btn btn-small btn-secondary" onClick={openWallet}>
            {t.common.connectWallet}
          </button>
        </div>
      ) : null}

      {wallet.connected && !anyRole ? (
        <div className="panel mb-6 flex items-start gap-3 px-5 py-4">
          <WarningCircle size={18} weight="light" className="mt-0.5 shrink-0 text-negative" />
          <div>
            <p className="text-sm font-medium">{t.admin.noRole.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {t.admin.noRole.body(formatAddress(wallet.address))}
            </p>
          </div>
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<Wallet size={18} weight="light" />}
          label={t.admin.stats.vault}
          value={formatUsdc(vault.balance) + ' USDC'}
        />
        <SummaryCard
          icon={<Lock size={18} weight="light" />}
          label={t.admin.stats.reserved}
          value={formatUsdc(vault.reserved) + ' USDC'}
        />
        <SummaryCard
          icon={<LockOpen size={18} weight="light" />}
          label={t.admin.stats.available}
          value={formatUsdc(available) + ' USDC'}
        />
        <SummaryCard
          icon={<Coins size={18} weight="light" />}
          label={t.admin.stats.core}
          value={formatUsdc(state.coreBalance) + ' USDC'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t.admin.status.title}>
          <Row label={t.admin.status.paused}>
            <span
              className={
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] ' +
                (vault.paused ? 'border-negative/40 text-negative' : 'border-line text-muted')
              }
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
              {vault.paused ? t.admin.status.pausedOn : t.admin.status.pausedOff}
            </span>
          </Row>
          <Row label={t.admin.status.core}>
            <span className="mono text-[11px]">{formatAddress(vault.core)}</span>
          </Row>
          <Row label={t.admin.status.feeReceiver}>
            <span className="mono text-[11px]">{formatAddress(vault.feeReceiver)}</span>
          </Row>
          <Row label={t.admin.status.roles}>
            <span className="flex flex-wrap gap-1.5">
              {roles.admin ? <Badge>{t.admin.roles.admin}</Badge> : null}
              {roles.pauser ? <Badge>{t.admin.roles.pauser}</Badge> : null}
              {roles.planManager ? <Badge>{t.admin.roles.planManager}</Badge> : null}
              {!anyRole ? <span className="text-[11px] text-muted">—</span> : null}
            </span>
          </Row>

          <button
            type="button"
            className="btn btn-secondary mt-4 w-full"
            disabled={!canPause || busy !== null || chainLoading}
            onClick={() =>
              void run('pause', async () => {
                const { setVaultPaused } = await import('../contracts/adapter')
                await setVaultPaused(wallet.address as string, !vault.paused)
              })
            }
          >
            {vault.paused ? (
              <LockOpen size={15} weight="light" />
            ) : (
              <Lock size={15} weight="light" />
            )}
            {vault.paused ? t.admin.actions.unpause : t.admin.actions.pause}
          </button>
          {!canPause ? <p className="mt-2 text-[10px] text-muted">{t.admin.needRole.pauser}</p> : null}
        </Panel>

        <Panel title={t.admin.funds.title}>
          <p className="mb-3 text-[11px] leading-relaxed text-muted">{t.admin.funds.note}</p>

          <AmountRow
            label={t.admin.funds.fundLabel}
            value={fundAmount}
            onChange={setFundAmount}
            hint={t.admin.funds.walletHint(formatUsdc(wallet.balance))}
          />
          <button
            type="button"
            className="btn btn-primary mt-2 w-full"
            disabled={
              !roles.admin || busy !== null || chainLoading || parseAmount(fundAmount) <= 0
            }
            onClick={() =>
              void run('fund', async () => {
                const { fundChainVault } = await import('../contracts/adapter')
                await fundChainVault(wallet.address as string, parseAmount(fundAmount))
                setFundAmount('')
              })
            }
          >
            <ArrowDown size={15} weight="light" />
            {t.admin.actions.fund}
          </button>

          <div className="my-4 border-t border-line/80" />

          <AmountRow
            label={t.admin.funds.withdrawLabel}
            value={withdrawAmount}
            onChange={setWithdrawAmount}
            hint={t.admin.funds.maxHint(formatUsdc(available))}
          />
          <button
            type="button"
            className="btn btn-secondary mt-2 w-full"
            disabled={
              !roles.admin || busy !== null || chainLoading || parseAmount(withdrawAmount) <= 0
            }
            onClick={() =>
              void run('withdraw', async () => {
                const { withdrawChainVault } = await import('../contracts/adapter')
                await withdrawChainVault(wallet.address as string, parseAmount(withdrawAmount))
                setWithdrawAmount('')
              })
            }
          >
            <ArrowUp size={15} weight="light" />
            {t.admin.actions.withdraw}
          </button>
          {!roles.admin ? <p className="mt-2 text-[10px] text-muted">{t.admin.needRole.admin}</p> : null}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title={t.admin.plans.title}>
          <div className="divide-y divide-line/70">
            {state.plans.map((plan) => (
              <div key={plan.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium">{plan.name[lang]}</p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {t.common.days(plan.tenorDays)} · {formatUsdc(plan.minDeposit)}–{formatUsdc(plan.maxDeposit)} USDC
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={
                      'text-[9px] uppercase tracking-[0.1em] ' +
                      (plan.enabled ? 'text-positive' : 'text-muted')
                    }
                  >
                    {plan.enabled ? t.admin.plans.on : t.admin.plans.off}
                  </span>
                  <button
                    type="button"
                    className="btn btn-small btn-secondary"
                    disabled={!roles.planManager || busy !== null || chainLoading}
                    onClick={() =>
                      void run(`plan-${plan.id}`, async () => {
                        const { setChainPlanEnabled } = await import('../contracts/adapter')
                        await setChainPlanEnabled(
                          wallet.address as string,
                          plan.id,
                          !plan.enabled,
                        )
                      })
                    }
                  >
                    {plan.enabled ? t.admin.plans.disable : t.admin.plans.enable}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!roles.planManager ? (
            <p className="mt-3 text-[10px] text-muted">{t.admin.needRole.planManager}</p>
          ) : null}
        </Panel>
      </div>

      <p className="mt-5 flex max-w-3xl items-start gap-2 text-[11px] leading-relaxed text-muted">
        <Info size={14} weight="light" className="mt-0.5 shrink-0" />
        <span>{t.admin.note}</span>
      </p>
    </>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel px-5 py-5">
      <h2 className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted">
        <ShieldCheck size={14} weight="light" className="text-accent" />
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/60 py-2.5 last:border-b-0">
      <span className="text-[11px] text-muted">{label}</span>
      {children}
    </div>
  )
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-line px-2 py-0.5 text-[9px] uppercase tracking-[0.1em] text-muted">
      {children}
    </span>
  )
}

function AmountRow({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  hint: string
}) {
  return (
    <div>
      <label className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-muted">
        {label}
        <span className="normal-case tracking-normal">{hint}</span>
      </label>
      <input
        className="input mt-1.5 w-full"
        inputMode="decimal"
        value={value}
        placeholder="0.00"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
