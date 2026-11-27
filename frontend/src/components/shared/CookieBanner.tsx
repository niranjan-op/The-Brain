import React, { useState } from 'react'
import { CookieIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/utm'

const COOKIE_CONSENT_KEY = 'kc_cookie_consent_v1'

export function CookieBanner(): React.ReactElement | null {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    try {
      return Boolean(window.localStorage.getItem(COOKIE_CONSENT_KEY))
    } catch {
      return false
    }
  })

  if (dismissed) return null

  const handleDecision = (choice: 'accepted' | 'essential'): void => {
    try {
      window.localStorage.setItem(
        COOKIE_CONSENT_KEY,
        JSON.stringify({
          choice,
          timestamp: new Date().toISOString(),
        }),
      )
    } catch {
      // ignore storage errors
    }
    trackEvent('cookie_consent_saved', { choice })
    setDismissed(true)
  }

  return (
    <aside
      role="region"
      aria-label="Cookie and local storage notice"
      data-print-hide="true"
      className="fixed bottom-4 left-4 right-4 z-40 rounded-xl border border-border bg-popover/95 p-4 text-popover-foreground shadow-elevated backdrop-blur-md sm:right-auto sm:max-w-md"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-primary">
          <CookieIcon className="size-4" aria-hidden="true" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-foreground">
                Storage &amp; Session Notice
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Knowledge Cartographer uses essential browser storage for authentication sessions, theme preference, and campaign attribution.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => handleDecision('essential')}
              aria-label="Dismiss storage notice"
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <XIcon aria-hidden="true" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="xs"
              onClick={() => handleDecision('accepted')}
            >
              Accept
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => handleDecision('essential')}
            >
              Essential only
            </Button>
          </div>
        </div>
      </div>
    </aside>
  )
}
