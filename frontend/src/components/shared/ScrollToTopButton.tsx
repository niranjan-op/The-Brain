import React, { useEffect, useState } from 'react'
import { ArrowUpIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ScrollToTopButton(): React.ReactElement | null {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const checkScroll = (): void => {
      const threshold = Math.max(400, window.innerHeight * 0.75)
      setVisible(window.scrollY > threshold)
    }

    checkScroll()
    window.addEventListener('scroll', checkScroll, { passive: true })
    window.addEventListener('resize', checkScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [])

  if (!visible) return null

  const handleScrollTop = (): void => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={handleScrollTop}
      data-print-hide="true"
      aria-label="Scroll back to top"
      title="Back to top"
      className="size-10 rounded-full border-border bg-card/90 text-foreground shadow-elevated backdrop-blur-md transition-transform hover:-translate-y-0.5 hover:bg-muted"
    >
      <ArrowUpIcon aria-hidden="true" />
    </Button>
  )
}
