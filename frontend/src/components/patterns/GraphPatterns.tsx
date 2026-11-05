import React, { useEffect, useRef } from 'react'

export function BrandGlyph({ size = 28 }: { size?: number }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      className="brand-glyph"
    >
      <circle
        cx="18"
        cy="18"
        r="15.5"
        stroke="var(--accent-cyan)"
        strokeOpacity="0.28"
        strokeWidth="1"
        strokeDasharray="2 2.5"
      />
      <path
        d="M9.5 24.5L15.5 11.5L26.5 10.5L24 25.5L15.5 11.5"
        stroke="var(--accent-cyan)"
        strokeOpacity="0.72"
        strokeWidth="1.25"
      />
      <path
        d="M9.5 24.5L24 25.5L26.5 10.5"
        stroke="var(--accent-violet)"
        strokeOpacity="0.68"
        strokeWidth="1.25"
      />
      <circle
        cx="15.5"
        cy="11.5"
        r="3.2"
        fill="var(--bg-obsidian)"
        stroke="var(--accent-ice)"
        strokeWidth="1.6"
      />
      <circle
        cx="26.5"
        cy="10.5"
        r="2.6"
        fill="var(--bg-obsidian)"
        stroke="var(--accent-cyan)"
        strokeWidth="1.5"
      />
      <circle
        cx="24"
        cy="25.5"
        r="2.9"
        fill="var(--bg-obsidian)"
        stroke="var(--accent-violet)"
        strokeWidth="1.5"
      />
      <circle cx="9.5" cy="24.5" r="2.2" fill="var(--accent-cyan)" />
    </svg>
  )
}

export function ScrollProgressIndicator(): React.ReactElement {
  const barRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof CSS === 'undefined') return
    if (CSS.supports('animation-timeline', 'scroll()')) return

    const updateProgress = (): void => {
      const el = barRef.current
      if (!el) return
      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight
      const ratio =
        scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0
      el.style.transform = `scaleX(${ratio})`
    }

    updateProgress()
    window.addEventListener('scroll', updateProgress, { passive: true })
    return () => window.removeEventListener('scroll', updateProgress)
  }, [])

  return (
    <div
      id="scroll-progress"
      ref={barRef}
      className="scroll-progress-bar"
      aria-hidden="true"
    />
  )
}

export function ScrollRevealObserver(): null {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const elements = Array.from(
      document.querySelectorAll<HTMLElement>('[data-reveal]'),
    )
    if (elements.length === 0) return

    // Immediately reveal elements already within the initial viewport
    const vh = window.innerHeight || 900
    elements.forEach((el) => {
      const rect = el.getBoundingClientRect()
      if (rect.top < vh * 0.92 && rect.bottom > 0) {
        el.classList.add('is-in-view')
      }
    })

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in-view')
          }
        })
      },
      {
        threshold: 0.08,
        rootMargin: '0px 0px -4% 0px',
      },
    )

    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return null
}

export function PatternDotGrid({
  id = 'kc-dot-grid',
  className = '',
}: {
  id?: string
  className?: string
}): React.ReactElement {
  return (
    <svg
      className={`pattern-svg pattern-dot-grid ${className}`}
      aria-hidden="true"
      width="100%"
      height="100%"
    >
      <defs>
        <pattern id={id} width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="rgba(205, 194, 237, 0.14)" />
        </pattern>
        <pattern
          id={`${id}-major`}
          width="140"
          height="140"
          patternUnits="userSpaceOnUse"
        >
          <rect width="140" height="140" fill={`url(#${id})`} />
          <path
            d="M 140 0 L 0 0 0 140"
            fill="none"
            stroke="rgba(205, 194, 237, 0.06)"
            strokeWidth="1"
          />
          <path
            d="M 0 2 L 6 2 M 2 0 L 2 6"
            stroke="rgba(175, 99, 255, 0.28)"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id}-major)`} />
    </svg>
  )
}

const HALFTONE_RINGS = [46, 82, 118, 156, 196, 238, 282, 326]

export function PatternRadialHalftone({
  className = '',
}: {
  className?: string
}): React.ReactElement {
  const dots: Array<{ key: string; cx: number; cy: number; r: number; opacity: number }> = []

  HALFTONE_RINGS.forEach((radius, ringIndex) => {
    const count = 16 + ringIndex * 6
    const dotRadius = Math.max(0.85, 2.1 - ringIndex * 0.16)
    const opacity = Math.max(0.06, 0.26 - ringIndex * 0.025)
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2
      const cx = 360 + Math.cos(angle) * radius
      const cy = 360 + Math.sin(angle) * radius
      dots.push({
        key: `${ringIndex}-${i}`,
        cx: Number(cx.toFixed(1)),
        cy: Number(cy.toFixed(1)),
        r: Number(dotRadius.toFixed(2)),
        opacity: Number(opacity.toFixed(3)),
      })
    }
  })

  return (
    <svg
      className={`pattern-svg pattern-radial-halftone ${className}`}
      viewBox="0 0 720 720"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="360"
        cy="360"
        r="138"
        stroke="rgba(175, 99, 255, 0.12)"
        strokeWidth="1"
        strokeDasharray="3 5"
      />
      <circle
        cx="360"
        cy="360"
        r="248"
        stroke="rgba(204, 156, 255, 0.1)"
        strokeWidth="1"
        strokeDasharray="2 6"
      />
      {dots.map((d) => (
        <circle
          key={d.key}
          cx={d.cx}
          cy={d.cy}
          r={d.r}
          fill="#cdc2ed"
          fillOpacity={d.opacity}
        />
      ))}
    </svg>
  )
}

export function SectionConduit({
  variant = 'left-to-center',
}: {
  variant?: 'left-to-center' | 'center-to-right' | 'converge'
  coordLabel?: string
}): React.ReactElement {
  const anchorX =
    variant === 'left-to-center'
      ? 600
      : variant === 'center-to-right'
        ? 820
        : 600

  const strands = [-90, -60, -30, 0, 30, 60, 90]

  return (
    <div className="section-conduit" aria-hidden="true">
      <div className="container section-conduit-inner">
        <svg
          className="conduit-svg"
          viewBox="0 0 1200 84"
          fill="none"
          preserveAspectRatio="none"
        >
          {strands.map((offset, idx) => {
            const topX = anchorX + offset * 1.65
            const botX = anchorX + offset * 0.52
            const d = `M ${topX} 0 C ${topX} 36, ${botX} 44, ${botX} 84`
            const isCenter = idx === 3
            return (
              <g key={offset}>
                <path
                  d={d}
                  stroke={
                    isCenter
                      ? 'rgba(175, 99, 255, 0.48)'
                      : 'rgba(205, 194, 237, 0.16)'
                  }
                  strokeWidth={isCenter ? 1.6 : 1}
                />
                {(idx === 2 || idx === 3 || idx === 4) && (
                  <path
                    d={d}
                    pathLength={100}
                    stroke={idx === 3 ? '#af63ff' : '#14f194'}
                    strokeWidth={1.9}
                    strokeLinecap="round"
                    className="conduit-signal-pulse"
                    style={
                      {
                        '--pulse-delay': `${idx * 0.45}s`,
                      } as React.CSSProperties
                    }
                  />
                )}
              </g>
            )
          })}
          <circle
            cx={anchorX}
            cy={42}
            r={5.5}
            fill="var(--bg-obsidian)"
            stroke="var(--accent-cyan)"
            strokeWidth={1.8}
          />
          <circle cx={anchorX} cy={42} r={2.2} fill="#f5f7ff" />
        </svg>
      </div>
    </div>
  )
}
