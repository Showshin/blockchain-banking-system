import { CheckCircle, Info, WarningCircle, X } from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ToastContext, type ToastInput, type ToastItem } from '../state/toast'
import { useI18n } from '../i18n/lang'

const toneIcons = {
  success: CheckCircle,
  error: WarningCircle,
  info: Info,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const reduceMotion = useReducedMotion()
  const { t } = useI18n()

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (input: ToastInput) => {
      const id = Date.now() + Math.floor(Math.random() * 1000)
      setItems((current) => [...current.slice(-3), { ...input, id }])
      window.setTimeout(() => dismiss(id), 4600)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[95] flex flex-col items-end gap-2 sm:left-auto sm:w-[380px]">
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const tone = item.tone ?? 'info'
            const Icon = toneIcons[tone]
            return (
              <motion.div
                key={item.id}
                initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className={`pointer-events-auto flex w-full items-start gap-3 rounded-2xl border p-4 shadow-[0_18px_50px_-24px_rgba(14,25,21,0.45)] ${tone === 'error'
                  ? 'toast-error'
                  : tone === 'success'
                    ? 'toast-success'
                    : 'border-line bg-surface text-ink'
                }`}
                role={tone === 'error' ? 'alert' : 'status'}
                aria-atomic="true"
              >
                <Icon size={20} weight="light" className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  {item.message ? (
                    <p className="mt-0.5 text-xs leading-relaxed opacity-75">{item.message}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="rounded-full p-1 opacity-50 transition hover:bg-black/5 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  aria-label={t.common.close}
                >
                  <X size={14} />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
