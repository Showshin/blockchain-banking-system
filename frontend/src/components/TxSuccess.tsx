import { Check } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'

export function TxSuccess({ title, message }: { title: string; message: string }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-[24px] bg-surface/95 px-6 text-center backdrop-blur-sm"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.18 }}
      role="status"
      aria-live="polite"
    >
      <motion.span
        className="notice-success flex h-16 w-16 items-center justify-center rounded-full border"
        initial={reduceMotion ? false : { scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
      >
        <Check size={34} weight="light" />
      </motion.span>
      <p className="text-lg font-medium tracking-[-0.03em]">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-muted">{message}</p>
    </motion.div>
  )
}
