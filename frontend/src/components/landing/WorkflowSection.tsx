import React, { useRef, useState } from 'react'
import {
  ChatCenteredDots,
  Database,
  FolderPlus,
  Graph,
  Receipt,
} from '@phosphor-icons/react'
import { AnimatedBeam } from '@/components/ui/animated-beam'
import { Badge } from '@/components/ui/badge'

/* Real Brand Logos for Box 2: Bring your sources */
function PdfLogo(): React.ReactElement {
  return (
    <svg className="size-7 shrink-0 drop-shadow-sm" viewBox="0 0 32 32" fill="none" aria-label="Adobe PDF">
      <rect width="32" height="32" rx="7" fill="#E5252A" />
      <path
        d="M23.6 17.8c-.8-.8-2.2-.9-3.7-.4-.8-.7-1.7-1.8-2.4-3.1.3-1.4.5-2.8.2-3.6-.4-1.2-1.6-1.5-2.2-.8-.7.8-.6 2.5.2 4.6-.6 1.7-1.5 3.7-2.6 5.4-1.8.8-3.5 1.8-3.8 2.7-.4.9.1 1.8 1.1 1.8 1.4 0 3.3-1.8 5-4.5 1.5-.5 3.1-.9 4.6-1.1 1.5 1.5 2.9 2 3.8 1.6.8-.4.9-1.6-.2-2.7zm-9.3-7.5c.2 0 .4.4.2 1.3-.1.6-.3 1.4-.6 2.2-.4-1.8-.1-3.2.4-3.5zm-3.6 12.3c-.4 0-.6-.3-.4-.7.3-.6 1.4-1.4 2.6-2.1-1.3 1.9-2 2.8-2.2 2.8zm6.4-5.3c.7-.9 1.3-2 1.8-3.1.9.9 1.6 1.7 2.1 2.3-1.3.2-2.6.5-3.9.8zm6.5 1.5c-.3.2-.8.1-1.5-.4.7-.2 1.4-.2 1.7.1.1.1.1.2-.2.3z"
        fill="#FFFFFF"
      />
    </svg>
  )
}

function WordLogo(): React.ReactElement {
  return (
    <svg className="size-7 shrink-0 drop-shadow-sm" viewBox="0 0 32 32" fill="none" aria-label="Microsoft Word">
      <rect width="32" height="32" rx="7" fill="#185ABD" />
      <rect x="13" y="6" width="13" height="20" rx="3" fill="#2870D3" opacity="0.9" />
      <path d="M16 11h7M16 16h7M16 21h5" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="5" y="9" width="14" height="14" rx="3.5" fill="#103F91" />
      <path d="M7.8 12.5l2 7h1.4l1.6-5.2 1.6 5.2h1.4l2-7h-1.6l-1.2 5-1.5-5h-1.4l-1.5 5-1.2-5H7.8z" fill="#FFFFFF" />
    </svg>
  )
}

function PowerPointLogo(): React.ReactElement {
  return (
    <svg className="size-7 shrink-0 drop-shadow-sm" viewBox="0 0 32 32" fill="none" aria-label="Microsoft PowerPoint">
      <rect width="32" height="32" rx="7" fill="#D04423" />
      <rect x="13" y="6" width="13" height="20" rx="3" fill="#E85A36" opacity="0.9" />
      <circle cx="19.5" cy="16" r="3.5" fill="#FFFFFF" opacity="0.35" />
      <path d="M19.5 16L22.5 14A3.5 3.5 0 0 0 16.5 14L19.5 16z" fill="#FFFFFF" />
      <rect x="5" y="9" width="14" height="14" rx="3.5" fill="#A83015" />
      <path d="M9.5 12.5h3.6c1.5 0 2.4.8 2.4 2.1 0 1.4-1 2.2-2.5 2.2h-1.7V20H9.5v-7.5zm1.8 1.4v1.6h1.7c.6 0 1-.3 1-.8 0-.5-.4-.8-1-.8h-1.7z" fill="#FFFFFF" />
    </svg>
  )
}

function ExcelLogo(): React.ReactElement {
  return (
    <svg className="size-7 shrink-0 drop-shadow-sm" viewBox="0 0 32 32" fill="none" aria-label="Microsoft Excel">
      <rect width="32" height="32" rx="7" fill="#107C41" />
      <rect x="13" y="6" width="13" height="20" rx="3" fill="#199E55" opacity="0.9" />
      <path d="M16 11h7M16 16h7M16 21h7M19.5 8v16" stroke="#FFFFFF" strokeWidth="1.5" strokeOpacity="0.8" />
      <rect x="5" y="9" width="14" height="14" rx="3.5" fill="#0B562D" />
      <path d="M8.8 12.5l2.4 3.7-2.4 3.8h1.8l1.6-2.5 1.6 2.5h1.8l-2.4-3.8 2.4-3.7h-1.8l-1.6 2.5-1.6-2.5H8.8z" fill="#FFFFFF" />
    </svg>
  )
}

function GithubOfficialLogo(): React.ReactElement {
  return (
    <svg className="size-7 shrink-0 drop-shadow-sm" viewBox="0 0 32 32" fill="none" aria-label="GitHub">
      <rect width="32" height="32" rx="7" fill="#24292F" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16 7C11.03 7 7 11.03 7 16c0 3.98 2.58 7.35 6.16 8.54.45.08.62-.2.62-.43v-1.68c-2.5.54-3.03-1.07-3.03-1.07-.41-1.04-1-1.32-1-1.32-.82-.56.06-.55.06-.55.9.06 1.38.93 1.38.93.8 1.38 2.1.98 2.62.75.08-.58.31-.98.57-1.2-2-.23-4.1-1-4.1-4.45 0-.98.35-1.79.93-2.42-.09-.23-.4-1.15.09-2.39 0 0 .76-.24 2.48.92a8.6 8.6 0 0 1 4.52 0c1.72-1.16 2.48-.92 2.48-.92.49 1.24.18 2.16.09 2.39.58.63.93 1.44.93 2.42 0 3.46-2.1 4.22-4.11 4.44.32.28.61.83.61 1.67v2.48c0 .24.16.52.62.43A9.01 9.01 0 0 0 25 16c0-4.97-4.03-9-9-9z"
        fill="#FFFFFF"
      />
    </svg>
  )
}

function WebLinkLogo(): React.ReactElement {
  return (
    <svg className="size-7 shrink-0 drop-shadow-sm" viewBox="0 0 32 32" fill="none" aria-label="Web & Links">
      <rect width="32" height="32" rx="7" fill="url(#wfLinkGrad)" />
      <path
        d="M13.5 18.5l5-5M15.5 11l1.8-1.8a4 4 0 0 1 5.7 5.7L21.2 16.7a4 4 0 0 1-5.7 0M16.5 21l-1.8 1.8a4 4 0 0 1-5.7-5.7l1.8-1.8a4 4 0 0 1 5.7 0"
        stroke="#FFFFFF"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="wfLinkGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0284c7" />
          <stop offset="1" stopColor="#8b3dff" />
        </linearGradient>
      </defs>
    </svg>
  )
}

interface PromptChipItem {
  id: string
  label: string
  citations: string[]
}

const ASK_CHIPS: PromptChipItem[] = [
  {
    id: 'tried',
    label: 'What’s been tried?',
    citations: ['paper.pdf · p.4', 'notes.md · L18'],
  },
  {
    id: 'contradicts',
    label: 'What contradicts me?',
    citations: ['slides.pptx · #7', 'data.xlsx · R14'],
  },
  {
    id: 'missing',
    label: 'What am I missing?',
    citations: ['draft.txt · p.2', 'repo · README'],
  },
  {
    id: 'plan',
    label: 'Turn this into a plan',
    citations: ['spec.docx · p.6', 'metrics.csv · T2'],
  },
]

export function WorkflowSection(): React.ReactElement {
  const [selectedChipId, setSelectedChipId] = useState<string>(ASK_CHIPS[0].id)

  const activeChip =
    ASK_CHIPS.find((chip) => chip.id === selectedChipId) ?? ASK_CHIPS[0]

  // Refs for @magicui/animated-beam connections
  const containerRef = useRef<HTMLDivElement>(null)
  const step1Ref = useRef<HTMLDivElement>(null)
  const sourcesBoxRef = useRef<HTMLDivElement>(null)
  const brainBoxRef = useRef<HTMLDivElement>(null)
  const askRustinRef = useRef<HTMLDivElement>(null)
  const citationsBoxRef = useRef<HTMLDivElement>(null)

  return (
    <section id="pipeline" className="py-12 md:py-16">
      <div className="container max-w-[1400px]">
        {/* Minimal Section Header */}
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <Badge
            variant="outline"
            className="h-6 border-border bg-card/80 px-3 text-[11px] text-foreground backdrop-blur-md"
          >
            How It Works
          </Badge>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
            From scattered files to cited answers.
          </h2>
        </div>

        {/* Open Flowchart Stage — Separate Boxes with Large Logos & Minimal Text */}
        <div ref={containerRef} className="relative w-full py-4">
          <div className="relative z-10 grid grid-cols-1 items-center gap-7 lg:grid-cols-12 lg:gap-10">
            {/* ================================================================
                BOX 1 (2 cols): START A PROJECT
               ================================================================ */}
            <div className="flex flex-col justify-center lg:col-span-2">
              <div
                ref={step1Ref}
                className="flex flex-col items-center rounded-2xl border border-border bg-card/95 p-5 text-center backdrop-blur-xl shadow-xl"
              >
                <div className="flex size-16 items-center justify-center rounded-2xl border border-border bg-muted/60 text-foreground">
                  <FolderPlus size={36} weight="regular" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  Start a project
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Name what you&apos;re trying to figure out
                </p>
              </div>
            </div>

            {/* ================================================================
                BOX 2 (3 cols): BRING YOUR SOURCES (All Sources Clubbed in One Box)
               ================================================================ */}
            <div className="flex flex-col justify-center lg:col-span-3">
              <div
                ref={sourcesBoxRef}
                className="flex flex-col items-center rounded-2xl border border-border bg-card/95 p-5 text-center backdrop-blur-xl shadow-xl"
              >
                {/* Grid of Real Brand Source Logos */}
                <div className="grid grid-cols-3 gap-2.5">
                  <span
                    title="Adobe PDF (.pdf)"
                    className="flex size-12 items-center justify-center rounded-xl border border-border/80 bg-muted/40 transition-transform hover:scale-105 shadow-xs"
                  >
                    <PdfLogo />
                  </span>
                  <span
                    title="Microsoft Word (.docx)"
                    className="flex size-12 items-center justify-center rounded-xl border border-border/80 bg-muted/40 transition-transform hover:scale-105 shadow-xs"
                  >
                    <WordLogo />
                  </span>
                  <span
                    title="Microsoft PowerPoint (.pptx)"
                    className="flex size-12 items-center justify-center rounded-xl border border-border/80 bg-muted/40 transition-transform hover:scale-105 shadow-xs"
                  >
                    <PowerPointLogo />
                  </span>
                  <span
                    title="Microsoft Excel (.xlsx, .csv)"
                    className="flex size-12 items-center justify-center rounded-xl border border-border/80 bg-muted/40 transition-transform hover:scale-105 shadow-xs"
                  >
                    <ExcelLogo />
                  </span>
                  <span
                    title="GitHub Repositories"
                    className="flex size-12 items-center justify-center rounded-xl border border-border/80 bg-muted/40 transition-transform hover:scale-105 shadow-xs"
                  >
                    <GithubOfficialLogo />
                  </span>
                  <span
                    title="Web Links & Notes (.md, .txt, URLs)"
                    className="flex size-12 items-center justify-center rounded-xl border border-border/80 bg-muted/40 transition-transform hover:scale-105 shadow-xs"
                  >
                    <WebLinkLogo />
                  </span>
                </div>

                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  Bring your sources
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Papers, repos, docs, anything
                </p>
                <p className="mt-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                  .pdf · .docx · .pptx · .xlsx · .csv · .md · .txt
                </p>
              </div>
            </div>

            {/* ================================================================
                BOX 3 (3 cols): PROJECT BRAIN (Knowledge Graph + Vector DB in One Box)
               ================================================================ */}
            <div className="flex flex-col justify-center lg:col-span-3">
              <div
                ref={brainBoxRef}
                className="flex flex-col gap-4 rounded-2xl border border-border bg-card/95 p-5 backdrop-blur-xl shadow-xl"
              >
                <div className="text-center">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Your Project Brain
                  </span>
                </div>

                {/* Section A: Knowledge Graph (Enlarged Graph Logo) */}
                <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/40 p-3.5">
                  <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60 text-foreground">
                    <Graph size={40} weight="regular" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-base font-semibold text-foreground">
                      Knowledge Graph
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Maps concepts into a graph
                    </p>
                  </div>
                </div>

                {/* Section B: Vector Database (Enlarged Database Logo) */}
                <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/40 p-3.5">
                  <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60 text-foreground">
                    <Database size={40} weight="regular" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-base font-semibold text-foreground">
                      Vector Database
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Stores files to database
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ================================================================
                COL 4 (4 cols): ASK RUSTIN -> GET ANSWERS WITH CITATIONS
               ================================================================ */}
            <div className="flex flex-col gap-7 lg:col-span-4">
              {/* Box 4: Ask Rustin */}
              <div
                ref={askRustinRef}
                className="rounded-2xl border border-border bg-card/95 p-5 backdrop-blur-xl shadow-xl"
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60 text-foreground">
                    <ChatCenteredDots size={32} weight="regular" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      Ask Rustin
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Click a question below
                    </p>
                  </div>
                </div>

                {/* 4 Prompt Chips */}
                <div
                  className="mt-3.5 grid grid-cols-2 gap-2"
                  role="tablist"
                  aria-label="Ask Rustin prompt chips"
                >
                  {ASK_CHIPS.map((chip) => {
                    const isSelected = chip.id === activeChip.id
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        onClick={() => setSelectedChipId(chip.id)}
                        className={`cursor-pointer rounded-xl border px-3 py-2 text-left text-xs font-medium leading-tight transition-colors ${isSelected
                            ? 'border-primary/50 bg-secondary text-foreground'
                            : 'border-border bg-muted/40 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                          }`}
                      >
                        {chip.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Box 5: Get answers with citations */}
              <div
                ref={citationsBoxRef}
                className="rounded-2xl border border-border bg-card/95 p-5 backdrop-blur-xl shadow-xl"
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60 text-foreground">
                    <Receipt size={32} weight="regular" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      Get answers with citations
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Every claim links back to its source
                    </p>
                  </div>
                </div>

                <div
                  className="mt-3.5 flex flex-wrap gap-2"
                  aria-live="polite"
                >
                  {activeChip.citations.map((cit) => (
                    <span
                      key={cit}
                      className="rounded-lg border border-border bg-muted/60 px-2.5 py-1 font-mono text-xs text-foreground"
                    >
                      [{cit}]
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ==================================================================
              @magicui/animated-beam ARROWS BETWEEN THE SEPARATE BOXES
             ================================================================== */}
          <div className="hidden lg:block">
            {/* Box 1 (Start a project) -> Box 2 (Bring your sources) */}
            <AnimatedBeam
              containerRef={containerRef}
              fromRef={step1Ref}
              toRef={sourcesBoxRef}
              fromAnchor="right"
              toAnchor="left"
              curvature={0}
              duration={3.8}
            />

            {/* Box 2 (Bring your sources) -> Box 3 (Your Project Brain) */}
            <AnimatedBeam
              containerRef={containerRef}
              fromRef={sourcesBoxRef}
              toRef={brainBoxRef}
              fromAnchor="right"
              toAnchor="left"
              curvature={0}
              duration={4.0}
              delay={0.4}
            />

            {/* Box 3 (Your Project Brain) -> Box 4 (Ask Rustin) */}
            <AnimatedBeam
              containerRef={containerRef}
              fromRef={brainBoxRef}
              toRef={askRustinRef}
              fromAnchor="right"
              toAnchor="left"
              curvature={18}
              duration={4.2}
              delay={0.8}
            />

            {/* Box 4 (Ask Rustin) -> Box 5 (Get answers with citations) */}
            <AnimatedBeam
              containerRef={containerRef}
              fromRef={askRustinRef}
              toRef={citationsBoxRef}
              fromAnchor="bottom"
              toAnchor="top"
              curvature={0}
              duration={3.4}
              delay={1.1}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
