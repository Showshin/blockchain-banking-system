import { X } from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { type ReactNode } from 'react'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useI18n } from '../i18n/lang'

export function Modal({
  open,
  onClose,
  children,
  label,
  size = 'md',
  closeDisabled = false,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  label: string
  size?: 'sm' | 'md' | 'lg'
  closeDisabled?: boolean
}) {
  const reduceMotion = useReducedMotion()
  const dialogRef = useDialogFocus<HTMLDivElement>({ open, onClose, canClose: !closeDisabled })

  const width = size === 'sm' ? 'max-w-[420px]' : size === 'lg' ? 'max-w-[760px]' : 'max-w-[560px]'

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={label}
          ref={dialogRef}
          tabIndex={-1}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]"
            onClick={() => {
              if (!closeDisabled) onClose()
            }}
            aria-hidden="true"
          />
          <motion.section
            className={`relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-[24px] border border-line bg-surface shadow-[0_30px_90px_-30px_rgba(8,20,16,0.4)] sm:rounded-[24px] ${width}`}
            initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.985 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export function ModalClose({ onClose, disabled = false }: { onClose: () => void; disabled?: boolean }) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={onClose}
      className="icon-button"
      aria-label={t.common.close}
      disabled={disabled}
    >
      <X size={18} weight="light" />
    </button>
  )
}
