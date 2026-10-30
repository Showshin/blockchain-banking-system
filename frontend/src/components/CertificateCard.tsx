import { ArrowClockwise, ArrowRight, ArrowSquareOut, Plus, SealCheck } from '@phosphor-icons/react'
import { contractConfig } from '../contracts/config'
import { useI18n } from '../i18n/lang'
import { depositProgress, interestEarned, isClaimable, isMatured } from '../lib/bank'
import { remainingLabel, remainingTime } from '../lib/countdown'
import { formatBps, formatDate, formatDateTime, formatUsdc } from '../lib/format'
import { sealTierFor, type SealTier } from '../lib/seal'
import type { Deposit, SavingPlan } from '../types'
import { StatusBadge } from './StatusBadge'

export function CertificateCard({
  deposit,
  plan,
  now,
  onWithdraw,
  onRenew,
  onTopUp,
  onClaim,
}: {
  deposit: Deposit
  plan?: SavingPlan
  now: number
  onWithdraw: (deposit: Deposit) => void
  onRenew: (deposit: Deposit) => void
  onTopUp: (deposit: Deposit) => void
  onClaim: (deposit: Deposit) => void
}) {
  const { t, lang } = useI18n()
  const copy = t.deposits.certificate
  const claimable = isClaimable(deposit)
  const matured = isMatured(deposit, now)
  const progress = claimable ? 1 : depositProgress(deposit, now)
  const interest = claimable ? deposit.pendingInterest : interestEarned(deposit)
  const remaining = remainingTime(now, deposit.maturityAt)
  const tier = sealTierFor(deposit.tenorDays)
  const status = claimable ? 'pending' : matured ? 'matured' : 'active'
  const explorerHref =
    contractConfig?.chainId === 11155111
      ? 'https://sepolia.etherscan.io/nft/' +
        contractConfig.coreAddress +
        '/' +
        deposit.certificateNo
      : null

  const progressLabel = claimable
    ? copy.principalReturned
    : matured
      ? copy.matured
      : copy.progress + ' · ' + remainingLabel(remaining, t)

  return (
    <article className="certificate">
      <div className="certificate-lines pointer-events-none absolute inset-0 opacity-[0.55]" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] text-muted">{copy.termCertificate}</p>
            <p className="mono mt-1.5 text-[11px] text-ink">
              {copy.no} {String(deposit.certificateNo).padStart(4, '0')}
            </p>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="mt-8 flex items-start justify-between gap-4 max-[359px]:gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted">
              {claimable ? copy.principalReturned : copy.principal}
            </p>
            <p className="mt-2 text-[clamp(1.7rem,4vw,2.3rem)] font-medium leading-none tracking-[-0.06em] tabular-nums">
              {formatUsdc(deposit.principal, false, true)}
              <span className="ml-2 text-[11px] font-normal tracking-normal text-muted">USDC</span>
            </p>
            <p className="certificate-interest mt-2 text-xs text-muted">
              {claimable ? copy.pendingInterest : copy.expectedInterest}{' '}
              <span className="font-medium text-accent">+{formatUsdc(interest, false, true)} USDC</span>
            </p>
          </div>
          <CertificateSeal tier={tier} />
        </div>

        <div className="mt-7 grid grid-cols-3 gap-3 border-t border-line/80 pt-4">
          <Meta label={copy.plan} value={plan ? plan.name[lang] : t.common.noPlan} />
          <Meta label={copy.lockedApr} value={formatBps(deposit.aprBpsAtOpen)} />
          <Meta
            label={copy.maturity}
            value={
              deposit.tenorDays < 2
                ? formatDateTime(deposit.maturityAt, lang)
                : formatDate(deposit.maturityAt, lang)
            }
          />
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.1em] text-muted">
            <span className="min-w-0 truncate">{progressLabel}</span>
            <span className="mono">{Math.round(progress * 100)}%</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-paper-deep">
            <span
              className={
                'block h-full rounded-full ' +
                (matured || claimable
                  ? 'certificate-progress-matured'
                  : 'certificate-progress-active')
              }
              style={{ width: Math.max(3, progress * 100) + '%' }}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {claimable ? (
            <button
              type="button"
              className="certificate-claim btn btn-small btn-primary"
              onClick={() => onClaim(deposit)}
            >
              {copy.claim}
              <span className="btn-icon">
                <ArrowRight size={13} weight="light" />
              </span>
            </button>
          ) : matured ? (
            <>
              <button
                type="button"
                className="certificate-withdraw btn btn-small btn-primary"
                onClick={() => onWithdraw(deposit)}
              >
                {copy.settle}
                <span className="btn-icon">
                  <ArrowRight size={13} weight="light" />
                </span>
              </button>
              <button
                type="button"
                className="certificate-renew btn btn-small btn-secondary"
                onClick={() => onRenew(deposit)}
              >
                <ArrowClockwise size={14} weight="light" />
                {copy.renew}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="certificate-early btn btn-small btn-secondary"
                onClick={() => onWithdraw(deposit)}
              >
                {copy.earlyWithdraw}
                <span className="text-[10px] text-muted">
                  {copy.penalty} {formatBps(deposit.penaltyBpsAtOpen)}
                </span>
              </button>
              <button
                type="button"
                className="certificate-topup btn btn-small btn-secondary"
                onClick={() => onTopUp(deposit)}
              >
                <Plus size={14} weight="light" />
                {copy.topUp}
              </button>
            </>
          )}
          {explorerHref ? (
            <a
              href={explorerHref}
              target="_blank"
              rel="noreferrer"
              className="ml-auto flex items-center gap-1.5 text-[10px] text-muted hover:text-ink transition group cursor-pointer"
              title={copy.etherscanTitle}
            >
              <SealCheck size={14} weight="light" />
              NFT #{String(deposit.certificateNo).padStart(4, '0')}
              <ArrowSquareOut size={12} weight="light" className="opacity-0 group-hover:opacity-100 transition" />
            </a>
          ) : (
            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted">
              <SealCheck size={14} weight="light" />
              NFT #{String(deposit.certificateNo).padStart(4, '0')}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[8px] uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-1 truncate text-[11px] font-medium text-ink">{value}</p>
    </div>
  )
}

function CertificateSeal({ tier }: { tier: SealTier }) {
  return (
    <span className={`certificate-seal certificate-seal-${tier}`} aria-hidden="true">
      <span className="certificate-seal-ring" />
      <span className="certificate-seal-core">
        <span>TÍCH</span>
        <small>ON-CHAIN</small>
      </span>
    </span>
  )
}
