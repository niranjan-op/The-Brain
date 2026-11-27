import React, { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface WalkthroughStep {
  id: string
  title: string
  description: string
  imageSrc: string
  imageAlt: string
}

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    id: 'create-projects',
    title: 'Create new projects',
    description:
      'Spin up a dedicated workspace for each paper, course, or team initiative with isolated files and conversations.',
    imageSrc: '/screenshots/step-create-project.png',
    imageAlt:
      'Knowledge Cartographer Project Workspaces dashboard showing active projects and the New Project Workspace button',
  },
  {
    id: 'upload-files',
    title: 'Upload your files',
    description:
      'Drop in PDFs, Word docs, spreadsheets, or notes and tick the exact sources you want Rustin to ground answers in.',
    imageSrc: '/screenshots/step-upload-files.png',
    imageAlt:
      'Knowledge Cartographer workspace with Rustin ready and the Sources panel for uploading and ticking project documents',
  },
  {
    id: 'ask-insights',
    title: 'Ask questions and get insights',
    description:
      'Ask across your ticked files and get structured answers with clickable page and paragraph citations you can verify.',
    imageSrc: '/screenshots/step-ask-insights.png',
    imageAlt:
      'Knowledge Cartographer workspace displaying a cited answer with clickable page and paragraph references',
  },
]

export function ProductWalkthroughSection(): React.ReactElement {
  const [activeIndex, setActiveIndex] = useState<number>(0)

  const total = WALKTHROUGH_STEPS.length
  const prevIndex = (activeIndex - 1 + total) % total
  const nextIndex = (activeIndex + 1) % total
  const activeStep = WALKTHROUGH_STEPS[activeIndex]

  const goPrev = (): void => {
    setActiveIndex((idx) => (idx - 1 + total) % total)
  }

  const goNext = (): void => {
    setActiveIndex((idx) => (idx + 1) % total)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      goPrev()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      goNext()
    }
  }

  return (
    <div className="border-b border-border/40">
      {/* Subsection A: NotebookLM-style Tutorial Carousel */}
      <section
        id="walkthrough"
        aria-label="How to use Knowledge Cartographer"
        className="overflow-hidden py-20 sm:py-28"
      >
        <div
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          role="region"
          aria-roledescription="carousel"
          aria-label="Product walkthrough steps"
        >
          {/* Peeking 3-Card Stage matching NotebookLM showcase geometry */}
          <div className="relative mx-auto flex w-full items-center justify-center">
            {/* Left Peeking Slide (desktop only) */}
            <button
              type="button"
              onClick={goPrev}
              aria-label={`Previous step: ${WALKTHROUGH_STEPS[prevIndex].title}`}
              className="group hidden shrink-0 cursor-pointer overflow-hidden rounded-[28px] border border-border/50 bg-muted/35 p-4 opacity-45 transition-all duration-300 hover:opacity-75 lg:block lg:w-[24%] xl:w-[22%] -translate-x-6"
            >
              <div className="overflow-hidden rounded-2xl border border-border/40 bg-background/80">
                <img
                  src={WALKTHROUGH_STEPS[prevIndex].imageSrc}
                  alt=""
                  aria-hidden="true"
                  width={1440}
                  height={900}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[16/10] w-full object-cover object-left-top"
                />
              </div>
            </button>

            {/* Center Active Slide */}
            <div className="w-full max-w-4xl shrink-0 px-4 sm:px-6 lg:w-[68%] lg:px-0">
              <div className="relative overflow-hidden rounded-[28px] border border-border/70 bg-muted/40 p-4 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-7 md:p-9">
                {/* Subtle restrained top ambient halo */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-24 left-1/2 h-48 w-3/4 -translate-x-1/2 rounded-full bg-gradient-to-r from-cyan-400/20 via-violet-500/20 to-sky-400/20 blur-3xl"
                />

                <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-[#090a0f] shadow-2xl">
                  <img
                    src={activeStep.imageSrc}
                    alt={activeStep.imageAlt}
                    width={1440}
                    height={900}
                    loading="lazy"
                    decoding="async"
                    className="block aspect-[16/10] w-full object-cover object-top"
                  />
                </div>
              </div>
            </div>

            {/* Right Peeking Slide (desktop only) */}
            <button
              type="button"
              onClick={goNext}
              aria-label={`Next step: ${WALKTHROUGH_STEPS[nextIndex].title}`}
              className="group hidden shrink-0 cursor-pointer overflow-hidden rounded-[28px] border border-border/50 bg-muted/35 p-4 opacity-45 transition-all duration-300 hover:opacity-75 lg:block lg:w-[24%] xl:w-[22%] translate-x-6"
            >
              <div className="overflow-hidden rounded-2xl border border-border/40 bg-background/80">
                <img
                  src={WALKTHROUGH_STEPS[nextIndex].imageSrc}
                  alt=""
                  aria-hidden="true"
                  width={1440}
                  height={900}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[16/10] w-full object-cover object-right-top"
                />
              </div>
            </button>
          </div>

          {/* Caption + Pill/Dot Pagination Bar aligned directly below the active card */}
          <div className="mx-auto mt-7 flex w-full max-w-4xl flex-col gap-5 px-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:w-[68%] lg:px-0">
            <div className="max-w-xl text-left" aria-live="polite">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {activeStep.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground sm:text-base">
                {activeStep.description}
              </p>
            </div>

            <div className="flex items-center gap-3 self-start md:self-center">
              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous tutorial step"
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-border/70 bg-card/70 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
              </button>

              <div
                className="flex items-center gap-2"
                role="tablist"
                aria-label="Select tutorial step"
              >
                {WALKTHROUGH_STEPS.map((step, idx) => {
                  const isActive = idx === activeIndex
                  return (
                    <button
                      key={step.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-label={`Step ${idx + 1}: ${step.title}`}
                      onClick={() => setActiveIndex(idx)}
                      className={`h-2 cursor-pointer rounded-full transition-all duration-300 ${
                        isActive
                          ? 'w-8 bg-foreground'
                          : 'w-2 bg-muted-foreground/35 hover:bg-muted-foreground/65'
                      }`}
                    />
                  )
                })}
              </div>

              <button
                type="button"
                onClick={goNext}
                aria-label="Next tutorial step"
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-border/70 bg-card/70 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Subsection B: Deep Research with Actual App Screenshot */}
      <section
        id="deep-research"
        aria-label="Deep Research"
        className="border-t border-border/40 py-20 sm:py-28"
      >
        <div className="container mx-auto px-4 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <div className="mb-8 max-w-2xl text-left">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Deep research that reads your files and writes cited reports.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                When a quick answer isn&apos;t enough, switch to Deep Research to
                cross-check your selected documents, surface flaws or gaps, and
                export structured Markdown reports with page-level proof.
              </p>
            </div>

            <div className="relative overflow-hidden rounded-[28px] border border-border/70 bg-muted/40 p-4 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-7 md:p-9">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 left-1/2 h-48 w-3/4 -translate-x-1/2 rounded-full bg-gradient-to-r from-violet-500/20 via-sky-400/20 to-cyan-400/20 blur-3xl"
              />
              <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-[#090a0f] shadow-2xl">
                <img
                  src="/screenshots/deep-research-workspace.png"
                  alt="Knowledge Cartographer Deep Research workspace showing a cited multi-point analysis with clickable page and paragraph citations"
                  width={1440}
                  height={900}
                  loading="lazy"
                  decoding="async"
                  className="block aspect-[16/10] w-full object-cover object-top"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
