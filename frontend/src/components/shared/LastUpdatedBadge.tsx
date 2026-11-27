import React from 'react'
import { ClockIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const FALLBACK_BUILD_DATE =
  typeof __BUILD_DATE__ !== 'undefined'
    ? __BUILD_DATE__
    : '2026-11-27T00:00:00.000Z'

interface LastUpdatedBadgeProps {
  date?: string | null
  label?: string
  className?: string
}

export function LastUpdatedBadge({
  date,
  label = 'Last updated',
  className,
}: LastUpdatedBadgeProps): React.ReactElement {
  const raw = date || FALLBACK_BUILD_DATE
  const parsed = new Date(raw)
  const valid = !Number.isNaN(parsed.getTime())
  const iso = valid ? parsed.toISOString() : raw
  const formatted = valid
    ? parsed.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : raw

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground',
        className,
      )}
    >
      <ClockIcon className="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {label}{' '}
        <time dateTime={iso} className="text-foreground/90">
          {formatted}
        </time>
      </span>
    </span>
  )
}
