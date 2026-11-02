import {
  ArrowDown,
  ArrowUp,
  Coins,
  Info,
  Lock,
  LockOpen,
  Plus,
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
import { parsePlanDraft } from '../lib/planDraft'
import { useBank } from '../state/bank'
import { useUi } from '../state/ui'

type ActionId = 'pause' | 'fund' | 'withdraw' | 'fee' | `plan-${string}`

const EMPTY_DRAFT = { tenor: '', apr: '', penalty: '', min: '', max: '' }

export function AdminPage() {
  const { state, chainLoading, refreshAfterTx } = useBank()
  const { openWallet } = useUi()
  const { toast } = useToast()
  const { t, lang } = useI18n()
  const [busy, setBusy] = useState<ActionId | null>(null)
  const [fundAmount, setFundAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [feeReceiver, setFeeReceiver] = useState('')
  const [editingPlan, setEditingPlan] = useState<string | null>(null)
  const [editApr, setEditApr] = useState('')

  const { roles, vault, wallet } = state
  const available = Math.max(0, vault.balance - vault.reserved)
  const solvent = vault.balance >= vault.reserved
  const feeValid = /^0x[0-9a-fA-F]{40}$/.test(feeReceiver.trim()) && !/^0x0{40}$/i.test(feeReceiver.trim())
  const canPause = roles.admin || roles.pauser

  // How much principal each plan is currently holding, for the plan list.
  const planStats = new Map<string, { count: number; principal: number }>()
  for (const deposit of state.deposits) {
    if (deposit.status !== 'active') continue
    const entry = planStats.get(deposit.planId) ?? { count: 0, principal: 0 }
    entry.count += 1
    entry.principal += deposit.principal
    planStats.set(deposit.planId, entry)
  }
  const totalPlanPrincipal = [...planStats.values()].reduce((total, entry) => total + entry.principal, 0)
  const shares = state.plans
    .map((plan) => ({ plan, ...(planStats.get(plan.id) ?? { count: 0, principal: 0 }) }))
    .filter((entry) => entry.principal > 0)
    .sort((left, right) => right.principal - left.principal)
  const shareColour = (index: number) => 'var(--share-' + ((index % 6) + 1) + ')'
  const sharePercent = (value: number) =>
    ((value / totalPlanPrincipal) * 100).toFixed(1).replace('.', lang === 'vi' ? ',' : '.')

  const anyRole = roles.admin || roles.pauser || roles.planManager

  const plan = parsePlanDraft(draft)
  const editAprValue = Number(editApr)
  const editValid =
    Number.isFinite(editAprValue) && editAprValue > 0 && editAprValue <= 100
  const draftTouched = Object.values(draft).some((value) => value.trim() !== '')

  async function run(id: ActionId, action: () => Promise<unknown>) {
    if (!wallet.address) return
    setBusy(id)
    try {
      await action()
      await refreshAfterTx()
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
                (vault.paused ? 'border-negative/40 text-negative' : 'border-positive/40 text-positive')
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
          <Row label={t.admin.status.solvency}>
            <span
              className={
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] ' +
                (solvent ? 'border-positive/40 text-positive' : 'border-negative/40 text-negative')
              }
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
              {solvent ? t.admin.status.solventOk : t.admin.status.solventShort}
            </span>
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
            <ButtonIcon busy={busy === 'pause'}>
              {vault.paused ? (
                <LockOpen size={13} weight="bold" />
              ) : (
                <Lock size={13} weight="bold" />
              )}
            </ButtonIcon>
            {vault.paused ? t.admin.actions.unpause : t.admin.actions.pause}
          </button>
          {!canPause ? <p className="mt-2 text-[10px] text-muted">{t.admin.needRole.pauser}</p> : null}

          {vault.balance > 0 ? (
            <div className="mt-4 border-t border-line/70 pt-4">
              <p className="mb-2 text-[10px] uppercase tracking-[0.12em] text-muted">
                {t.admin.status.vaultSplit}
              </p>
              <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-paper-deep">
                <span
                  className="h-full rounded-[2px]"
                  style={{
                    flexGrow: Math.max(vault.reserved, 0.0001),
                    flexBasis: 0,
                    background: 'var(--split-locked)',
                  }}
                />
                <span
                  className="h-full rounded-[2px]"
                  style={{
                    flexGrow: Math.max(available, 0.0001),
                    flexBasis: 0,
                    background: 'var(--split-free)',
                  }}
                />
              </div>
              <ul className="mt-2.5 space-y-1 text-[10px] text-muted">
                <li className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: 'var(--split-locked)' }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{t.admin.status.promised}</span>
                  <span className="mono shrink-0">
                    {((vault.reserved / vault.balance) * 100).toFixed(1).replace('.', lang === 'vi' ? ',' : '.')}%
                  </span>
                  <span className="mono w-24 shrink-0 text-right">
                    {formatUsdc(vault.reserved)} USDC
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: 'var(--split-free)' }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{t.admin.status.withdrawable}</span>
                  <span className="mono shrink-0">
                    {((available / vault.balance) * 100).toFixed(1).replace('.', lang === 'vi' ? ',' : '.')}%
                  </span>
                  <span className="mono w-24 shrink-0 text-right">
                    {formatUsdc(available)} USDC
                  </span>
                </li>
              </ul>
            </div>
          ) : null}
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
            <ButtonIcon busy={busy === 'fund'}>
              <ArrowDown size={13} weight="bold" />
            </ButtonIcon>
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
            <ButtonIcon busy={busy === 'withdraw'}>
              <ArrowUp size={13} weight="bold" />
            </ButtonIcon>
            {t.admin.actions.withdraw}
          </button>
          <div className="my-4 border-t border-line/80" />

          <div>
            <label className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.12em] text-muted">
              {t.admin.funds.feeLabel}
              <span className="mono whitespace-nowrap normal-case tracking-normal">
                {formatAddress(vault.feeReceiver)}
              </span>
            </label>
            <input
              className="input mono mt-1.5 w-full"
              value={feeReceiver}
              placeholder="0x…"
              spellCheck={false}
              onChange={(event) => setFeeReceiver(event.target.value)}
            />
            <p className="mt-1 text-[10px] leading-relaxed text-muted">{t.admin.funds.feeHint}</p>
            {feeReceiver.trim() !== '' && !feeValid ? (
              <p className="mt-1 text-[10px] text-negative">{t.admin.funds.feeInvalid}</p>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary mt-2 w-full"
              disabled={!roles.admin || !feeValid || busy !== null || chainLoading}
              onClick={() =>
                void run('fee', async () => {
                  const { setChainFeeReceiver } = await import('../contracts/adapter')
                  await setChainFeeReceiver(wallet.address as string, feeReceiver.trim())
                  setFeeReceiver('')
                })
              }
            >
              {busy === 'fee' ? <span className="btn-spinner animate-spin" aria-hidden="true" /> : null}
              {t.admin.plans.save}
            </button>
          </div>
          {!roles.admin ? <p className="mt-2 text-[10px] text-muted">{t.admin.needRole.admin}</p> : null}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title={t.admin.plans.title}>
          {shares.length > 0 ? (
            <div className="mb-4">
              <p className="mb-2 text-[10px] uppercase tracking-[0.12em] text-muted">
                {t.admin.plans.shareTitle}
              </p>
              <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-paper-deep">
                {shares.map((entry, index) => (
                  <span
                    key={entry.plan.id}
                    className="h-full rounded-[2px] bg-ink"
                    style={{
                      flexGrow: entry.principal,
                      flexBasis: 0,
                      background: shareColour(index),
                    }}
                    title={entry.plan.name[lang] + ' · ' + formatUsdc(entry.principal) + ' USDC'}
                  />
                ))}
              </div>
              <ul className="mt-2.5 space-y-1">
                {shares.map((entry, index) => (
                  <li key={entry.plan.id} className="flex items-center gap-2 text-[10px] text-muted">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: shareColour(index) }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{entry.plan.name[lang]}</span>
                    <span className="w-16 shrink-0 text-right tabular-nums">
                      {t.admin.plans.depositCount(entry.count)}
                    </span>
                    <span className="mono w-12 shrink-0 text-right">
                      {sharePercent(entry.principal)}%
                    </span>
                    <span className="mono w-24 shrink-0 text-right">
                      {formatUsdc(entry.principal)} USDC
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {shares.length > 0 ? <div className="mb-3 border-t border-line/70" /> : null}

          <div className="divide-y divide-line/70">
            {state.plans.map((plan) => (
              <div key={plan.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium">{plan.name[lang]}</p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {t.common.days(plan.tenorDays)} · {formatUsdc(plan.minDeposit)}
                    {plan.uncapped ? ' · ' + t.plans.unlimited : '–' + formatUsdc(plan.maxDeposit)} USDC
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
                    onClick={() => {
                      setEditingPlan(editingPlan === plan.id ? null : plan.id)
                      setEditApr((plan.aprBps / 100).toString())
                    }}
                  >
                    {editingPlan === plan.id ? t.admin.plans.cancel : t.admin.plans.edit}
                  </button>
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

                {editingPlan === plan.id ? (
                  <form
                    className="mt-3 grid gap-2.5 rounded-[12px] border border-line/80 px-3 py-3"
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (!editValid || !wallet.address) return
                      void run(`plan-edit-${plan.id}`, async () => {
                        const { updateChainPlan } = await import('../contracts/adapter')
                        await updateChainPlan(
                          wallet.address as string,
                          plan.id,
                          Math.round(editAprValue * 100),
                        )
                        setEditingPlan(null)
                      })
                    }}
                  >
                    <Field label={t.admin.plans.apr} value={editApr} onChange={setEditApr} />
                    <p className="text-[10px] leading-relaxed text-muted">
                      {t.admin.plans.editNote}
                    </p>
                    <button
                      type="submit"
                      className="btn btn-small btn-primary w-full"
                      disabled={!editValid || busy !== null || chainLoading}
                    >
                      {busy === `plan-edit-${plan.id}` ? (
                        <span className="btn-spinner animate-spin" aria-hidden="true" />
                      ) : null}
                      {t.admin.plans.save}
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
          {!roles.planManager ? (
            <p className="mt-3 text-[10px] text-muted">{t.admin.needRole.planManager}</p>
          ) : null}

          <div className="mt-4 border-t border-line/80 pt-4">
            {!creating ? (
              <button
                type="button"
                className="btn btn-small btn-secondary w-full"
                disabled={!roles.planManager || busy !== null || chainLoading}
                onClick={() => setCreating(true)}
              >
                <ButtonIcon busy={false}>
                  <Plus size={12} weight="bold" />
                </ButtonIcon>
                {t.admin.plans.create}
              </button>
            ) : (
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!plan.valid || !wallet.address) return
                  void run('plan-new', async () => {
                    const { createChainPlan } = await import('../contracts/adapter')
                    await createChainPlan(wallet.address as string, {
                      tenorDays: plan.tenorDays,
                      aprBps: plan.aprBps,
                      minDeposit: plan.minDeposit,
                      maxDeposit: plan.maxDeposit,
                      penaltyBps: plan.penaltyBps,
                    })
                    setDraft(EMPTY_DRAFT)
                    setCreating(false)
                  })
                }}
              >
                <p className="text-[11px] leading-relaxed text-muted">{t.admin.plans.createHint}</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label={t.admin.plans.tenor}
                    value={draft.tenor}
                    onChange={(next) => setDraft({ ...draft, tenor: next })}
                    inputMode="numeric"
                  />
                  <Field
                    label={t.admin.plans.apr}
                    value={draft.apr}
                    onChange={(next) => setDraft({ ...draft, apr: next })}
                  />
                  <Field
                    label={t.admin.plans.penalty}
                    value={draft.penalty}
                    onChange={(next) => setDraft({ ...draft, penalty: next })}
                  />
                  <Field
                    label={t.admin.plans.min}
                    hint={t.admin.plans.minHint}
                    value={draft.min}
                    onChange={(next) => setDraft({ ...draft, min: next })}
                  />
                  <Field
                    label={t.admin.plans.max}
                    hint={t.admin.plans.maxHint}
                    value={draft.max}
                    onChange={(next) => setDraft({ ...draft, max: next })}
                  />
                </div>

                {draftTouched && !plan.valid ? (
                  <p className="text-[10px] leading-relaxed text-negative">{t.admin.plans.invalid}</p>
                ) : null}

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="btn btn-primary flex-1"
                    disabled={!roles.planManager || !plan.valid || busy !== null || chainLoading}
                  >
                    <ButtonIcon busy={busy === 'plan-new'}>
                      <Plus size={12} weight="bold" />
                    </ButtonIcon>
                    {t.admin.plans.submit}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setDraft(EMPTY_DRAFT)
                      setCreating(false)
                    }}
                  >
                    {t.admin.plans.cancel}
                  </button>
                </div>
              </form>
            )}
          </div>
        </Panel>
      </div>

      <p className="mt-5 flex max-w-3xl items-start gap-2 text-[11px] leading-relaxed text-muted">
        <Info size={14} weight="light" className="mt-0.5 shrink-0" />
        <span>{t.admin.note}</span>
      </p>
    </>
  )
}

function ButtonIcon({ busy, children }: { busy: boolean; children: ReactNode }) {
  if (busy) return <span className="btn-spinner animate-spin" aria-hidden="true" />
  return (
    <span className="btn-icon btn-icon-plain" aria-hidden="true">
      {children}
    </span>
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

function Field({
  label,
  value,
  onChange,
  hint,
  inputMode = 'decimal',
}: {
  label: string
  value: string
  onChange: (next: string) => void
  hint?: string
  inputMode?: 'decimal' | 'numeric'
}) {
  return (
    <div>
      <label className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.12em] text-muted">
        {label}
        {hint ? <span className="whitespace-nowrap normal-case tracking-normal">{hint}</span> : null}
      </label>
      <input
        className="input mt-1.5 w-full"
        inputMode={inputMode}
        value={value}
        placeholder="0"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
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
