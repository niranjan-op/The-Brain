import React, { useEffect, useRef, useState } from 'react'
import { AuraBlob } from '@/components/ui/aura-blob'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Telescope, Network, TextQuote } from 'lucide-react'

export function RustinIntelligenceSection(): React.ReactElement {
  const sectionRef = useRef<HTMLElement | null>(null)
  const [isInView, setIsInView] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }
    return false
  })

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    // If user prefers reduced motion, show awakened state immediately
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    // High-performance IntersectionObserver triggers GPU transitions without main-thread scroll lag
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry) {
          setIsInView(entry.isIntersecting)
        }
      },
      {
        root: null,
        // Start coming to life slightly before reaching center
        rootMargin: '0px 0px -12% 0px',
        threshold: 0.15,
      },
    )

    observer.observe(el)

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <section
      id="intelligence"
      ref={sectionRef}
      aria-label="Meet Rustin - Intelligence"
      className="relative overflow-hidden border-b border-border/40 py-20 sm:py-28"
    >
      {/* Background ambient cosmic glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-60"
      >
        <div
          className={`size-96 rounded-full bg-gradient-to-tr from-sky-500/15 via-purple-600/15 to-cyan-400/10 blur-[100px] transition-all duration-1000 ease-out sm:size-[30rem] ${
            isInView ? 'scale-105 opacity-80' : 'scale-90 opacity-25'
          }`}
        />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
          {/* Living Celestial Orb */}
          <div className="relative mb-8 flex items-center justify-center sm:mb-10">
            {/* Outer Orbital Pulse Ring */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute size-64 rounded-full border border-sky-400/25 transition-all duration-1000 ease-out sm:size-80 md:size-96 ${
                isInView
                  ? 'scale-100 opacity-60 shadow-[0_0_40px_rgba(56,189,248,0.25)]'
                  : 'scale-90 opacity-20 shadow-none'
              }`}
            />

            {/* Inner Celestial Core Canvas */}
            <div
              className={`relative size-64 transition-all duration-1000 ease-out sm:size-80 md:size-96 ${
                isInView ? 'scale-100 opacity-100' : 'scale-[0.92] opacity-80'
              }`}
              data-testid="landing-rustin-orb"
            >
              <AuraBlob
                variant="hero"
                color="#8b3dff"
                midColor="#38bdf8"
                deepColor="#2fd6ff"
                backgroundColor="transparent"
                speed={0.18}
                gain={2.2}
                warp={0.18}
                thinking={false}
                cursorInteraction={true}
                cursorTilt={0.5}
                adaptiveQuality={true}
                dpr={1.5}
                className="size-full"
              />
            </div>
          </div>

          {/* Title & Narrative: Meet Rustin! */}
          <div
            className={`transition-all duration-1000 ease-out ${
              isInView
                ? 'translate-y-0 opacity-100'
                : 'translate-y-4 opacity-75'
            }`}
          >
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl">
              Meet Rustin!
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              The cognitive agent at the heart of Knowledge Cartographer. Grounded in your project documents, Rustin navigates interconnected decision graphs, detects contradictions before they cascade, and delivers verifiable answers with pinpoint citations.
            </p>
          </div>

          {/* Three Agentic Capability Cards */}
          <div
            className={`mt-12 grid w-full grid-cols-1 gap-5 text-left sm:mt-16 sm:grid-cols-3 sm:gap-6 ${
              isInView
                ? 'translate-y-0 opacity-100'
                : 'translate-y-6 opacity-75'
            } transition-all duration-1000 ease-out`}
          >
            {/* Card 1: Deep Research (Telescope Logo) */}
            <Card className="group/card relative rounded-2xl border-border/70 bg-card/60 p-6 backdrop-blur-md transition-all duration-300 hover:border-border hover:bg-card/85 hover:shadow-[0_8px_30px_rgba(0,0,0,0.15)]">
              <CardHeader className="p-0">
                <div className="flex items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-xl border border-border/80 bg-muted/60 text-black dark:text-white transition-colors group-hover/card:border-foreground/30 group-hover/card:bg-muted/90">
                    <Telescope className="size-5" />
                  </div>
                  <Badge
                    variant="outline"
                    className="border-border/80 bg-muted/50 font-mono text-[10px] uppercase tracking-wider text-black dark:text-white"
                  >
                    Deep Research
                  </Badge>
                </div>
                <CardTitle className="mt-4 text-lg font-semibold tracking-tight text-black dark:text-white">
                  Reads &amp; Connects All Your Files
                </CardTitle>
                <CardDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Instead of hunting keyword by keyword, Rustin reads across dozens of PDFs, notes, and spreadsheets simultaneously—synthesizing answers you&apos;d otherwise spend hours piecing together.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Card 2: Conflict Recognition & Resolution (Graph Logo) */}
            <Card className="group/card relative rounded-2xl border-border/70 bg-card/60 p-6 backdrop-blur-md transition-all duration-300 hover:border-border hover:bg-card/85 hover:shadow-[0_8px_30px_rgba(0,0,0,0.15)]">
              <CardHeader className="p-0">
                <div className="flex items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-xl border border-border/80 bg-muted/60 text-black dark:text-white transition-colors group-hover/card:border-foreground/30 group-hover/card:bg-muted/90">
                    <Network className="size-5" />
                  </div>
                  <Badge
                    variant="outline"
                    className="border-border/80 bg-muted/50 font-mono text-[10px] uppercase tracking-wider text-black dark:text-white"
                  >
                    Conflict Match
                  </Badge>
                </div>
                <CardTitle className="mt-4 text-lg font-semibold tracking-tight text-black dark:text-white">
                  Catches Clashing Information
                </CardTitle>
                <CardDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  If an old proposal draft contradicts an agreed decision from last week, Rustin flags the discrepancy automatically. You catch conflicting facts before they cause costly mistakes.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Card 3: Citations (TextQuote Logo) */}
            <Card className="group/card relative rounded-2xl border-border/70 bg-card/60 p-6 backdrop-blur-md transition-all duration-300 hover:border-border hover:bg-card/85 hover:shadow-[0_8px_30px_rgba(0,0,0,0.15)]">
              <CardHeader className="p-0">
                <div className="flex items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-xl border border-border/80 bg-muted/60 text-black dark:text-white transition-colors group-hover/card:border-foreground/30 group-hover/card:bg-muted/90">
                    <TextQuote className="size-5" />
                  </div>
                  <Badge
                    variant="outline"
                    className="border-border/80 bg-muted/50 font-mono text-[10px] uppercase tracking-wider text-black dark:text-white"
                  >
                    Citations
                  </Badge>
                </div>
                <CardTitle className="mt-4 text-lg font-semibold tracking-tight text-black dark:text-white">
                  Every Answer Backed by Proof
                </CardTitle>
                <CardDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Zero guesswork and zero made-up facts. Every claim links straight to the exact page, chart, or paragraph it came from. Click any citation to open the source and verify immediately.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}
