import { ArrowClockwise, BookOpen, CaretUp, Check, GearSix, Stack, Wallet, WarningCircle } from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ensureTargetNetwork, targetChainId } from '../contracts/wallet'
import { useI18n } from '../i18n/lang'
import { formatAddress } from '../lib/format'
import { useBank } from '../state/bank'
import { useTheme, type Theme } from '../state/theme'
import { UiProvider } from '../state/UiProvider'
import { BrandMark } from './BrandMark'
import { DepositDialog } from './DepositDialog'
import { WalletDialog } from './WalletDialog'

const navItems = [
  { to: '/so-tiet-kiem', icon: BookOpen, label: 'deposits' as const },
  { to: '/', icon: Stack, end: true, label: 'plans' as const },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { state } = useBank()
  const { t, lang } = useI18n()
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  const pageRef = useRef<HTMLDivElement>(null)
  const [walletOpen, setWalletOpen] = useState(false)
  const [depositPlanId, setDepositPlanId] = useState<string | null>(null)
  const defaultPlanId = useMemo(
    () => (state.plans.find((plan) => plan.popular) ?? state.plans.find((plan) => plan.enabled))?.id ?? null,
    [state.plans],
  )

  const closeWallet = useCallback(() => setWalletOpen(false), [])
  const closeDeposit = useCallback(() => setDepositPlanId(null), [])
  const openWallet = useCallback(() => setWalletOpen(true), [])
  const openDeposit = useCallback(
    (planId?: string) => {
      if (planId) setDepositPlanId(planId)
      else if (defaultPlanId) setDepositPlanId(defaultPlanId)
      else if (!state.wallet.connected) openWallet()
    },
    [defaultPlanId, openWallet, state.wallet.connected],
  )
  const uiValue = useMemo(() => ({ openWallet, openDeposit }), [openWallet, openDeposit])

  useLayoutEffect(() => {
    const page = pageRef.current
    if (!page || reduceMotion) return
    const animation = page.animate(
      [
        { opacity: 0.55, transform: 'translateY(5px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
    return () => animation.cancel()
  }, [lang, location.pathname, reduceMotion])

  return (
    <UiProvider value={uiValue}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
        <aside className="app-sidebar relative hidden overflow-hidden border-r border-line/80 bg-surface/55 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:self-start lg:flex-col lg:px-5 lg:py-6">
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full border border-accent/[0.08]" aria-hidden="true">
            <span className="absolute inset-6 rounded-full border border-dashed border-accent/[0.1]" />
          </div>

          <div className="relative flex h-full flex-col">
            <Link to="/" className="shrink-0 pb-5 border-b border-line/80" aria-label="TÍCH">
              <BrandMark onLight />
            </Link>

            <div className="mt-5">
              <nav className="flex flex-col gap-1.5" aria-label={t.nav.label}>
                {navItems.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} className={sidebarNavClass}>
                    {({ isActive }) => (
                      <>
                        {isActive ? (
                          <motion.span
                            layoutId="sidebar-nav-pill"
                            className="pointer-events-none absolute inset-0 rounded-[10px] bg-inverse"
                            transition={
                              reduceMotion
                                ? { duration: 0 }
                                : { type: 'spring', stiffness: 520, damping: 38 }
                            }
                            aria-hidden="true"
                          />
                        ) : null}
                        <span className="relative z-10 flex w-full items-center gap-2.5 px-3">
                          <item.icon size={18} weight="light" className="shrink-0" />
                          <span className="truncate">{t.nav[item.label]}</span>
                        </span>
                      </>
                    )}
                  </NavLink>
                ))}
              </nav>
            </div>

            <div className="relative mt-auto border-t border-line/80 pt-5">
              <SettingsMenu placement="top" />
              <WalletButton
                connected={state.wallet.connected}
                address={state.wallet.address}
                onOpen={openWallet}
                fullWidth
              />
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-line/80 bg-paper/90 backdrop-blur-xl lg:hidden">
          <div className="mx-auto flex min-h-16 w-full max-w-[1180px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-6">
              <Link to="/" className="shrink-0" aria-label="TÍCH">
                <BrandMark onLight />
              </Link>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <SettingsMenu placement="bottom" compact />
              <WalletButton
                connected={state.wallet.connected}
                address={state.wallet.address}
                onOpen={openWallet}
              />
            </div>
          </div>

          <nav className="mx-auto flex w-full max-w-[1180px] gap-1 px-4 pb-3" aria-label={t.nav.label}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  'relative flex flex-1 items-center justify-center rounded-full px-3 py-2 text-[11px] font-medium transition ' +
                  (isActive ? 'text-on-inverse' : 'text-muted hover:bg-paper-deep/60 hover:text-ink')
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <motion.span
                        layoutId="mobile-nav-pill"
                        className="pointer-events-none absolute inset-0 rounded-full bg-inverse"
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : { type: 'spring', stiffness: 520, damping: 38 }
                        }
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className="relative z-10 inline-flex items-center gap-1.5">
                      <item.icon size={14} weight="light" />
                      {t.nav[item.label]}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          </header>

          <main className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-7 sm:px-6 lg:px-10 lg:pb-20 lg:pt-12">
            <NetworkBanner />
            <div ref={pageRef}>{children}</div>
          </main>
        </div>
      </div>

      <WalletDialog open={walletOpen} onClose={closeWallet} />
      <DepositDialog key={depositPlanId ?? 'closed'} planId={depositPlanId} onClose={closeDeposit} />
    </UiProvider>
  )
}

function sidebarNavClass({ isActive }: { isActive: boolean }) {
  return (
    'sidebar-nav-link relative flex h-11 items-center rounded-[10px] text-sm font-medium whitespace-nowrap transition ' +
    (isActive ? 'text-on-inverse' : 'text-muted hover:bg-paper-deep/60 hover:text-ink')
  )
}

function WalletButton({
  connected,
  address,
  onOpen,
  fullWidth = false,
}: {
  connected: boolean
  address: string | null
  onOpen: () => void
  fullWidth?: boolean
}) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      className={'btn btn-wallet ' + (fullWidth ? 'mt-4 w-full justify-start' : '')}
      onClick={onOpen}
      aria-label={connected && address ? formatAddress(address) : t.common.connectWallet}
    >
      <Wallet size={16} weight="light" />
      <span className={fullWidth ? 'inline' : 'hidden sm:inline'}>
        {connected && address ? formatAddress(address) : t.common.connectWallet}
      </span>
      {connected ? (
        <span
          className={'connected-dot h-1.5 w-1.5 rounded-full ' + (fullWidth ? 'ml-auto' : '')}
          aria-hidden="true"
        />
      ) : null}
    </button>
  )
}

function NetworkBanner() {
  const { networkMismatch, chainLoading, refreshChain } = useBank()
  const { t } = useI18n()
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)

  if (!networkMismatch) return null

  const handleSwitch = async () => {
    setSwitching(true)
    setSwitchError(null)
    try {
      await ensureTargetNetwork()
      await refreshChain()
    } catch {
      setSwitchError(t.network.switchFailed)
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div role="alert" className="alert-warning mb-5 rounded-[16px] border px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          {chainLoading ? (
            <span
              className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border border-current border-t-transparent"
              aria-hidden="true"
            />
          ) : (
            <WarningCircle size={18} weight="light" className="mt-0.5 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium">{t.network.title}</p>
            <p className="mt-1 text-[11px] leading-relaxed opacity-85">
              {t.network.description(String(targetChainId()))}
            </p>
            {switchError ? <p className="mt-1 text-[11px] font-medium">{switchError}</p> : null}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-small btn-secondary self-start sm:shrink-0 sm:self-auto"
          onClick={() => void handleSwitch()}
          disabled={switching || chainLoading}
        >
          {switching ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
              {t.network.switching}
            </>
          ) : (
            <>
              <ArrowClockwise size={14} weight="light" />
              {t.walletDialog.switchNetwork}
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function SettingsMenu({
  placement,
  compact = false,
}: {
  placement: 'top' | 'bottom'
  compact?: boolean
}) {
  const { t, lang, setLang } = useI18n()
  const { theme, setTheme } = useTheme()
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = `settings-menu-${placement}-${compact ? 'compact' : 'wide'}`

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus({ preventScroll: true })
    }
    const focusFrame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    })
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const themeOptions: { value: Theme; label: string }[] = [
    { value: 'light', label: t.settings.themes.light },
    { value: 'dark', label: t.settings.themes.dark },
  ]

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={
          'settings-trigger ' +
          (compact ? 'settings-trigger-compact' : 'settings-trigger-wide') +
          (open ? ' border-ink bg-paper-deep/70' : '')
        }
        onClick={() => setOpen((current) => !current)}
        aria-label={t.settings.open}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="dialog"
      >
        <GearSix size={16} weight="light" />
        {!compact ? (
          <>
            <span className="flex-1 text-left">{t.settings.label}</span>
            <span className="mono rounded-full border border-line px-1.5 py-0.5 text-[8px] uppercase tracking-[0.1em] text-muted">
              {lang}
            </span>
            <CaretUp
              size={12}
              weight="light"
              className={'transition-transform duration-200 ' + (open ? 'rotate-180' : '')}
            />
          </>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={menuId}
            ref={menuRef}
            role="dialog"
            aria-label={t.settings.label}
            initial={reduceMotion ? false : { opacity: 0, y: placement === 'top' ? 6 : -6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: placement === 'top' ? 4 : -4, scale: 0.985 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            className={
              'settings-popover z-[70] rounded-[20px] border border-line bg-surface p-4 shadow-[0_24px_70px_-34px_rgba(8,20,16,0.42)] ' +
              (placement === 'top'
                ? 'absolute bottom-full left-0 mb-2 w-full'
                : 'settings-popover-mobile right-4 mt-2 max-w-[calc(100vw-32px)]')
            }
          >
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">{t.settings.language}</p>
              <span className="mono text-[9px] uppercase tracking-[0.1em] text-muted">{lang}</span>
            </div>
            <div
              className="mt-2 grid grid-cols-2 gap-1 rounded-[10px] border border-line bg-paper/70 p-1"
              role="group"
              aria-label={t.settings.language}
            >
              {(['vi', 'en'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  aria-pressed={lang === code}
                  className={
                    'rounded-[7px] px-2 py-1.5 text-[10px] font-medium transition ' +
                    (lang === code
                      ? 'bg-inverse text-on-inverse'
                      : 'text-muted hover:bg-surface hover:text-ink')
                  }
                >
                  {code === 'vi' ? t.settings.vietnamese : t.settings.english}
                </button>
              ))}
            </div>

            <div className="mt-4 border-t border-line/80 pt-4">
              <p className="eyebrow">{t.settings.theme}</p>
              <div className="mt-2 space-y-1.5" role="group" aria-label={t.settings.theme}>
                {themeOptions.map((option) => {
                  const active = theme === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTheme(option.value)}
                      aria-pressed={active}
                      className={
                        'settings-theme-option flex w-full items-center gap-2.5 rounded-[10px] border px-2.5 py-2 text-left transition ' +
                        (active
                          ? 'border-ink bg-paper/70 text-ink'
                          : 'border-line bg-surface text-muted hover:border-ink/30 hover:text-ink')
                      }
                    >
                      <span
                        className={`settings-swatch settings-swatch-${option.value}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 text-[11px] font-medium">{option.label}</span>
                      {active ? <Check size={13} weight="bold" /> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
