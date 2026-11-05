import React, { useEffect, useRef, useState } from 'react'
import { PatternDotGrid } from '../patterns/GraphPatterns'

interface ScrollyChapter {
  id: string
  step: string
  title: string
  lead: string
  checks: [string, string, string]
  actionLabel: string
  activeNodes: string[]
  activeEdges: string[]
  callouts: Array<{
    id: string
    x: string
    y: string
    badge: string
    tone: 'cyan' | 'emerald' | 'amber' | 'violet'
    headline: string
    subline: string
  }>
}

const SCROLLY_CHAPTERS: ScrollyChapter[] = [
  {
    id: 'ch-unify',
    step: '01',
    title: 'Turn complexity into clarity',
    lead: 'Bring your PDFs, diagrams, and notes into one connected project map.',
    checks: [
      'Reads tables, pages, and headings',
      'Understands architecture diagrams',
      'Keeps every project isolated',
    ],
    actionLabel: 'Unify project sources',
    activeNodes: ['sc-doc1', 'sc-doc2', 'sc-chk1', 'sc-chk2'],
    activeEdges: ['sce-1', 'sce-2'],
    callouts: [
      {
        id: 'c1-a',
        x: '8%',
        y: '12%',
        badge: 'SOURCE INGESTED',
        tone: 'cyan',
        headline: '18 passages mapped automatically',
        subline: 'Tables, headings, and page numbers preserved',
      },
      {
        id: 'c1-b',
        x: '50%',
        y: '68%',
        badge: 'DIAGRAM PARSED',
        tone: 'emerald',
        headline: 'Visual components linked to text',
        subline: 'Every diagram element becomes searchable',
      },
    ],
  },
  {
    id: 'ch-retrieve',
    step: '02',
    title: 'Fast-track your answers',
    lead: 'Ask questions in plain language and trace every answer back to the exact page.',
    checks: [
      'Finds concepts and exact keywords',
      'Filter which files are in scope',
      'Zero unverified guesses',
    ],
    actionLabel: 'Trace grounded answers',
    activeNodes: ['sc-chk1', 'sc-chk2', 'sc-rrf', 'sc-d016'],
    activeEdges: ['sce-3', 'sce-4', 'sce-5'],
    callouts: [
      {
        id: 'c2-a',
        x: '46%',
        y: '12%',
        badge: 'EXACT PROOF · 94% MATCH',
        tone: 'cyan',
        headline: 'Verified across 3 source pages',
        subline: 'Direct quote highlighted on Page 4, Section 2',
      },
      {
        id: 'c2-b',
        x: '8%',
        y: '66%',
        badge: 'FOCUSED SCOPE',
        tone: 'emerald',
        headline: 'Outdated drafts excluded',
        subline: 'Only your selected files shape the answer',
      },
    ],
  },
  {
    id: 'ch-conflicts',
    step: '03',
    title: 'Uncover what’s hidden',
    lead: 'Spot when a new document contradicts an earlier decision before it causes a mistake.',
    checks: [
      'Flags conflicting claims automatically',
      'Shows what changed and why',
      'Nothing overwritten without review',
    ],
    actionLabel: 'Spot hidden conflicts',
    activeNodes: ['sc-d015', 'sc-d016', 'sc-q04'],
    activeEdges: ['sce-6', 'sce-7'],
    callouts: [
      {
        id: 'c3-a',
        x: '10%',
        y: '14%',
        badge: 'CONFLICT DETECTED',
        tone: 'amber',
        headline: 'New note contradicts agreed plan',
        subline: 'Side-by-side comparison ready for review',
      },
      {
        id: 'c3-b',
        x: '48%',
        y: '66%',
        badge: 'DECISION LINEAGE',
        tone: 'violet',
        headline: 'Current Plan → Replaced Earlier Option',
        subline: 'Full history of why the team switched',
      },
    ],
  },
  {
    id: 'ch-decide',
    step: '04',
    title: 'Collaborate with confidence',
    lead: 'Approve key decisions in one click and export clean decision records for your team.',
    checks: [
      'One-click human approval',
      'Live graph stays in sync',
      'Export shareable decision docs',
    ],
    actionLabel: 'Approve & share decisions',
    activeNodes: ['sc-d016', 'sc-adr', 'sc-neo4j'],
    activeEdges: ['sce-8', 'sce-9'],
    callouts: [
      {
        id: 'c4-a',
        x: '48%',
        y: '14%',
        badge: 'DECISION APPROVED',
        tone: 'emerald',
        headline: 'Added to your team’s knowledge map',
        subline: 'Linked to 4 supporting passages',
      },
      {
        id: 'c4-b',
        x: '12%',
        y: '68%',
        badge: 'READY TO SHARE',
        tone: 'cyan',
        headline: 'Decision Summary Exported',
        subline: 'Every claim linked to its original file',
      },
    ],
  },
]

const STAGE_NODES = [
  { id: 'sc-doc1', x: 112, y: 122, color: '#a4a1ff', r: 10 },
  { id: 'sc-doc2', x: 104, y: 276, color: '#a4a1ff', r: 9.5 },
  { id: 'sc-chk1', x: 248, y: 162, color: '#14f194', r: 11 },
  { id: 'sc-chk2', x: 242, y: 294, color: '#14f194', r: 10 },
  { id: 'sc-rrf', x: 392, y: 218, color: '#af63ff', r: 14 },
  { id: 'sc-d015', x: 386, y: 92, color: '#cc9cff', r: 10 },
  { id: 'sc-d016', x: 542, y: 186, color: '#af63ff', r: 13.5 },
  { id: 'sc-q04', x: 558, y: 82, color: '#fbbf24', r: 9.5 },
  { id: 'sc-adr', x: 544, y: 318, color: '#cdc2ed', r: 11 },
  { id: 'sc-neo4j', x: 676, y: 242, color: '#14f194', r: 10 },
]

const STAGE_EDGES = [
  { id: 'sce-1', from: 'sc-doc1', to: 'sc-chk1', label: 'EXTRACTS' },
  { id: 'sce-2', from: 'sc-doc2', to: 'sc-chk2', label: 'EXTRACTS' },
  { id: 'sce-3', from: 'sc-chk1', to: 'sc-rrf', label: '768D + BM25' },
  { id: 'sce-4', from: 'sc-chk2', to: 'sc-rrf', label: 'TRIPLET' },
  { id: 'sce-5', from: 'sc-rrf', to: 'sc-d016', label: 'BACKS' },
  { id: 'sce-6', from: 'sc-d016', to: 'sc-d015', label: 'SUPERSEDES' },
  { id: 'sce-7', from: 'sc-q04', to: 'sc-d016', label: 'DEPENDS_ON' },
  { id: 'sce-8', from: 'sc-adr', to: 'sc-d016', label: 'CITES_NODE' },
  { id: 'sce-9', from: 'sc-d016', to: 'sc-neo4j', label: 'REPLAY_SYNC' },
]

export function WorkflowSection(): React.ReactElement {
  const [activeIdx, setActiveIdx] = useState<number>(0)
  const chapterRefs = useRef<Array<HTMLElement | null>>([])
  const scrollStateRef = useRef<{ hasScrolled: boolean }>({ hasScrolled: false })

  useEffect(() => {
    const elements = chapterRefs.current.filter(Boolean) as HTMLElement[]
    if (elements.length === 0) return

    const state = scrollStateRef.current
    const onScroll = () => {
      state.hasScrolled = true
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    const observer = new IntersectionObserver(
      (entries) => {
        if (!state.hasScrolled) return
        state.hasScrolled = false
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute('data-chapter-idx'))
            if (!Number.isNaN(idx)) {
              setActiveIdx(idx)
            }
          }
        })
      },
      {
        rootMargin: '-28% 0px -42% 0px',
        threshold: 0.25,
      },
    )

    elements.forEach((el) => observer.observe(el))
    return () => {
      window.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [])

  const activeChapter = SCROLLY_CHAPTERS[activeIdx] || SCROLLY_CHAPTERS[0]

  return (
    <section id="pipeline" className="workflow-section scrolly-section">
      <div className="container">
        <div className="scrolly-grid">
          {/* Left Column: 4 Minimalist Linkurious-Style Chapters */}
          <div className="scrolly-chapters-col">
            {SCROLLY_CHAPTERS.map((chapter, idx) => {
              const isActive = idx === activeIdx
              return (
                <article
                  key={chapter.id}
                  ref={(el) => {
                    chapterRefs.current[idx] = el
                  }}
                  data-chapter-idx={idx}
                  data-reveal="up"
                  className={`scrolly-chapter-card ${isActive ? 'is-active' : ''}`}
                  onClick={() => setActiveIdx(idx)}
                >
                  <div className="scrolly-step-pill mono">
                    <span>STAGE {chapter.step}</span>
                  </div>
                  <h2 className="scrolly-chapter-title">{chapter.title}</h2>
                  <p className="scrolly-chapter-lead">{chapter.lead}</p>

                  <ul className="scrolly-check-list">
                    {chapter.checks.map((check) => (
                      <li key={check} className="scrolly-check-item">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 18 18"
                          fill="none"
                          aria-hidden="true"
                          className="scrolly-check-icon"
                        >
                          <path
                            d="M4 9.5L7.5 13L14 5.5"
                            stroke="#af63ff"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span>{check}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    className={`scrolly-action-btn ${isActive ? 'is-active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveIdx(idx)
                    }}
                  >
                    <span className="scrolly-action-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle
                          cx="8"
                          cy="8"
                          r="5.5"
                          stroke="currentColor"
                          strokeWidth="1.4"
                        />
                        <circle cx="8" cy="8" r="2" fill="currentColor" />
                      </svg>
                    </span>
                    <span>{chapter.actionLabel}</span>
                    <span className="scrolly-action-arrow" aria-hidden="true">
                      →
                    </span>
                  </button>
                </article>
              )
            })}
          </div>

          {/* Right Column: Sticky Interactive Graph Stage with Floating Callout Cards */}
          <div className="scrolly-stage-col">
            <div className="scrolly-sticky-frame">
              <PatternDotGrid id="scrolly-stage-dots" />

              {/* Stage Progress Stepper */}
              <div
                className="scrolly-stage-header"
                role="tablist"
                aria-label="Pipeline stage visual selector"
              >
                {SCROLLY_CHAPTERS.map((ch, idx) => (
                  <button
                    key={ch.id}
                    type="button"
                    role="tab"
                    aria-selected={idx === activeIdx}
                    className={`scrolly-stage-tab mono ${idx === activeIdx ? 'is-active' : ''}`}
                    onClick={() => setActiveIdx(idx)}
                  >
                    {ch.step} · {ch.title.split(' ')[0]}
                  </button>
                ))}
              </div>

              <div className="scrolly-canvas-wrap">
                <svg
                  className="scrolly-svg"
                  viewBox="30 30 710 350"
                  role="img"
                  aria-label={`Stage ${activeChapter.step}: ${activeChapter.title}`}
                >
                  {/* Concentric target rings around hybrid core */}
                  <circle
                    cx="392"
                    cy="218"
                    r="88"
                    fill="none"
                    stroke="rgba(175, 99, 255, 0.16)"
                    strokeDasharray="4 6"
                  />
                  <circle
                    cx="542"
                    cy="186"
                    r="76"
                    fill="none"
                    stroke="rgba(204, 156, 255, 0.16)"
                    strokeDasharray="3 5"
                  />

                  {/* Stage Edges */}
                  {STAGE_EDGES.map((edge) => {
                    const src = STAGE_NODES.find((n) => n.id === edge.from)
                    const dst = STAGE_NODES.find((n) => n.id === edge.to)
                    if (!src || !dst) return null

                    const isActive = activeChapter.activeEdges.includes(edge.id)
                    const mx = (src.x + dst.x) / 2
                    const my = (src.y + dst.y) / 2 - 18
                    const pathD = `M ${src.x} ${src.y} Q ${mx} ${my} ${dst.x} ${dst.y}`

                    return (
                      <g key={edge.id}>
                        <path
                          d={pathD}
                          pathLength={100}
                          fill="none"
                          stroke={
                            isActive ? '#af63ff' : 'rgba(205, 194, 237, 0.2)'
                          }
                          strokeWidth={isActive ? 2.4 : 1.1}
                          strokeOpacity={isActive ? 0.95 : 0.35}
                          className="scrolly-edge-path"
                        />
                        {isActive && (
                          <path
                            d={pathD}
                            pathLength={100}
                            fill="none"
                            stroke="#f5f7ff"
                            strokeWidth={2.6}
                            strokeLinecap="round"
                            className="kg-edge-pulse"
                          />
                        )}
                      </g>
                    )
                  })}

                  {/* Stage Nodes (Pure Geometric Points — Zero Text Clutter) */}
                  {STAGE_NODES.map((node) => {
                    const isActive = activeChapter.activeNodes.includes(node.id)
                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        className={`scrolly-node ${isActive ? 'is-active' : 'is-dimmed'}`}
                      >
                        {isActive && (
                          <circle
                            r={node.r + 9}
                            fill="rgba(175, 99, 255, 0.18)"
                            stroke={node.color}
                            strokeWidth={1.6}
                            className="scrolly-node-pulse-ring"
                          />
                        )}
                        <circle
                          r={node.r}
                          fill={isActive ? '#f5f7ff' : node.color}
                          stroke="#0c0b0e"
                          strokeWidth={2}
                        />
                      </g>
                    )
                  })}
                </svg>

                {/* Linkurious-Style Floating Inspection Callout Cards */}
                <div className="scrolly-callouts-layer" aria-live="polite">
                  {activeChapter.callouts.map((callout) => (
                    <div
                      key={callout.id}
                      className={`scrolly-floating-card tone-${callout.tone}`}
                      style={{ left: callout.x, top: callout.y }}
                    >
                      <span className="scrolly-card-badge mono">
                        {callout.badge}
                      </span>
                      <strong className="scrolly-card-headline">
                        {callout.headline}
                      </strong>
                      <span className="scrolly-card-subline">
                        {callout.subline}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
