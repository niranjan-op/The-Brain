import * as React from 'react'
import { AlertCircleIcon, CheckIcon, CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function legacyCopyText(text: string): boolean {
  if (typeof document === 'undefined') return false
  const previousFocus = document.activeElement as HTMLElement | null
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0;pointer-events:none;'
  document.body.append(field)
  field.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
    previousFocus?.focus({ preventScroll: true })
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall back to execCommand when clipboard permission is unavailable
  }
  return legacyCopyText(text)
}

let lastCopyAnnouncement = ''

interface CopyButtonProps extends Omit<React.ComponentProps<typeof Button>, 'onClick'> {
  value: string
  label?: string
  copiedLabel?: string
  showLabel?: boolean
  ariaLabel?: string
  onCopied?: () => void
  onCopyError?: () => void
}

export function CopyButton({
  value,
  label = 'Copy',
  copiedLabel = 'Copied',
  showLabel = false,
  ariaLabel,
  variant = 'ghost',
  size = showLabel ? 'xs' : 'icon-xs',
  className,
  onCopied,
  onCopyError,
  ...props
}: CopyButtonProps): React.ReactElement {
  const [status, setStatus] = React.useState<'idle' | 'copied' | 'failed'>('idle')
  const [liveText, setLiveText] = React.useState('')
  const timerRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  const announce = (msg: string): void => {
    const nextMsg = msg === lastCopyAnnouncement ? `${msg}\u00A0` : msg
    lastCopyAnnouncement = nextMsg
    setLiveText('')
    window.requestAnimationFrame(() => {
      setLiveText(nextMsg)
    })
  }

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>): Promise<void> => {
    e.stopPropagation()
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
    }

    const ok = await copyTextToClipboard(value)
    if (ok) {
      setStatus('copied')
      announce(copiedLabel)
      onCopied?.()
    } else {
      setStatus('failed')
      announce('Copy failed')
      onCopyError?.()
    }

    timerRef.current = window.setTimeout(() => {
      setStatus('idle')
      setLiveText('')
    }, 2000)
  }

  const accessibleName = showLabel
    ? undefined
    : status === 'copied'
      ? copiedLabel
      : status === 'failed'
        ? 'Copy failed'
        : ariaLabel || label

  return (
    <span className="relative inline-flex shrink-0 items-center">
      <Button
        type="button"
        variant={variant}
        size={size}
        data-copied={status === 'copied' || undefined}
        data-failed={status === 'failed' || undefined}
        aria-label={accessibleName}
        title={
          status === 'copied'
            ? copiedLabel
            : status === 'failed'
              ? 'Copy failed'
              : ariaLabel || label
        }
        onClick={(e) => void handleCopy(e)}
        className={cn(
          'min-h-6 min-w-6 transition-colors',
          status === 'copied' && 'text-emerald-400',
          status === 'failed' && 'text-destructive',
          className,
        )}
        {...props}
      >
        {status === 'copied' ? (
          <CheckIcon data-icon={showLabel ? 'inline-start' : undefined} aria-hidden="true" />
        ) : status === 'failed' ? (
          <AlertCircleIcon data-icon={showLabel ? 'inline-start' : undefined} aria-hidden="true" />
        ) : (
          <CopyIcon data-icon={showLabel ? 'inline-start' : undefined} aria-hidden="true" />
        )}
        {showLabel && (
          <span>
            {status === 'copied'
              ? copiedLabel
              : status === 'failed'
                ? 'Failed'
                : label}
          </span>
        )}
      </Button>
      <span role="status" className="sr-only">
        {liveText}
      </span>
    </span>
  )
}
