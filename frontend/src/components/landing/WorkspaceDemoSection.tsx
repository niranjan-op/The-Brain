import React, { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  WORKSPACE_QUERIES,
  WORKSPACE_SOURCES,
  type CitationItem,
} from '../../data/landingData'

export function WorkspaceDemoSection(): React.ReactElement {
  const [includedSources, setIncludedSources] = useState<Record<string, boolean>>(
    () => {
      const initial: Record<string, boolean> = {}
      WORKSPACE_SOURCES.forEach((src) => {
        initial[src.id] = src.defaultIncluded
      })
      return initial
    },
  )

  const [activeQueryId, setActiveQueryId] = useState<string>(
    WORKSPACE_QUERIES[0].id,
  )
  const [selectedCitationId, setSelectedCitationId] = useState<string>(
    WORKSPACE_QUERIES[0].citations[0].id,
  )

  const activeQuery = useMemo(
    () =>
      WORKSPACE_QUERIES.find((q) => q.id === activeQueryId) ||
      WORKSPACE_QUERIES[0],
    [activeQueryId],
  )

  const activeCount = useMemo(
    () => Object.values(includedSources).filter(Boolean).length,
    [includedSources],
  )

  const visibleCitations = useMemo(
    () =>
      activeQuery.citations.filter((c) => Boolean(includedSources[c.sourceId])),
    [activeQuery, includedSources],
  )

  const activeCitation: CitationItem | null = useMemo(() => {
    const match = visibleCitations.find((c) => c.id === selectedCitationId)
    return match || visibleCitations[0] || null
  }, [visibleCitations, selectedCitationId])

  const handleSelectQuery = (qId: string): void => {
    setActiveQueryId(qId)
    const nextQ = WORKSPACE_QUERIES.find((q) => q.id === qId)
    if (nextQ) {
      if (qId === 'q-conflict') {
        setIncludedSources((prev) => ({ ...prev, 'src-legacy': true }))
      }
      if (nextQ.citations[0]) {
        setSelectedCitationId(nextQ.citations[0].id)
      }
    }
  }

  const toggleSource = (sourceId: string): void => {
    setIncludedSources((prev) => ({
      ...prev,
      [sourceId]: !prev[sourceId],
    }))
  }

  return (
    <section id="workspace" className="py-20 md:py-28">
      <div className="container">
        <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Ask a question. See the exact page.
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Choose which files to include on the left, pick a question in the
              center, and inspect the exact page quote on the right.
            </p>
          </div>
          <Badge
            variant="outline"
            className="h-7 border-border bg-card/70 text-xs text-muted-foreground"
          >
            Interactive Demo · Try Ticking &amp; Unticking Files
          </Badge>
        </div>

        <Card className="overflow-hidden rounded-3xl border border-border bg-card/90 backdrop-blur-2xl shadow-2xl">
          {/* Top chrome bar */}
          <CardHeader className="border-b border-border bg-muted/30 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                <span
                  className="size-2 rounded-full bg-[var(--signal)]"
                  aria-hidden="true"
                />
                <span className="font-medium text-foreground/95">
                  Project: Capstone &amp; Product Launch
                </span>
                <span className="text-muted-foreground" aria-hidden="true">
                  ·
                </span>
                <span className="text-muted-foreground">
                  Shared with 4 teammates
                </span>
              </div>
              <Badge
                variant="secondary"
                className="border border-border bg-muted/60 text-xs text-foreground"
                aria-live="polite"
              >
                Using {activeCount} of {WORKSPACE_SOURCES.length} uploaded files
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="grid grid-cols-1 divide-y divide-border lg:grid-cols-12 lg:divide-x lg:divide-y-0">
              {/* Pane 1: Included Files Checklist */}
              <aside
                className="p-5 lg:col-span-3"
                aria-label="Included Files Checklist"
              >
                <div className="mb-3.5 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    1. Included Files
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="text-xs text-[var(--aurora-cyan)] hover:text-foreground"
                    onClick={() => {
                      const allOn: Record<string, boolean> = {}
                      WORKSPACE_SOURCES.forEach((s) => {
                        allOn[s.id] = true
                      })
                      setIncludedSources(allOn)
                    }}
                  >
                    Select all
                  </Button>
                </div>

                <ul className="flex flex-col gap-2 list-none p-0 m-0">
                  {WORKSPACE_SOURCES.map((src) => {
                    const checked = Boolean(includedSources[src.id])
                    const kindLabel =
                      src.kind === 'architecture_diagram'
                        ? 'Diagram'
                        : src.kind === 'markdown'
                          ? 'Notes'
                          : 'PDF'
                    return (
                      <li
                        key={src.id}
                        className={`rounded-xl border p-2.5 transition-colors ${
                          checked
                            ? 'border-border bg-muted/50'
                            : 'border-border/50 bg-muted/20 opacity-60'
                        }`}
                      >
                        <label className="flex cursor-pointer items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSource(src.id)}
                            className="mt-1 size-3.5 accent-[var(--aurora-violet)]"
                          />
                          <span className="flex flex-col gap-0.5 min-w-0">
                            <span className="truncate text-xs font-medium text-foreground">
                              {src.filename}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {kindLabel} · {src.pages}{' '}
                              {src.pages === 1 ? 'page' : 'pages'}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </aside>

              {/* Pane 2: Ask & Cited Answer */}
              <div className="flex flex-col gap-4 p-5 lg:col-span-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    2. Ask a Question
                  </h3>
                  <span className="text-[11px] text-[var(--aurora-lilac)]">
                    {activeQuery.modeLabel}
                  </span>
                </div>

                <Tabs
                  value={activeQueryId}
                  onValueChange={handleSelectQuery}
                  orientation="vertical"
                  className="w-full"
                >
                  <TabsList
                    aria-label="Sample questions"
                    className="flex h-auto! w-full flex-col items-stretch gap-1.5 bg-muted/60 p-1.5"
                  >
                    {WORKSPACE_QUERIES.map((q) => (
                      <TabsTrigger
                        key={q.id}
                        value={q.id}
                        className="h-auto! flex-none! justify-start whitespace-normal! text-left text-xs py-2 px-2.5 leading-snug"
                      >
                        {q.question}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>

                <div className="flex flex-col gap-3" aria-live="polite">
                  <div className="rounded-2xl border border-border bg-muted/35 p-4">
                    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="font-medium text-[var(--signal)]">
                        ● Answered with exact page proof
                      </span>
                      <span>{activeQuery.tokensUsed}</span>
                    </div>

                    <div className="text-sm leading-relaxed text-foreground/95">
                      {activeQuery.answerSegments.map((seg, idx) => {
                        const sourceAllowed = seg.requiredSourceId
                          ? Boolean(includedSources[seg.requiredSourceId])
                          : true
                        const citationObj = activeQuery.citations.find(
                          (c) => c.id === seg.citationId,
                        )

                        if (!sourceAllowed) {
                          const excludedDoc = WORKSPACE_SOURCES.find(
                            (s) => s.id === seg.requiredSourceId,
                          )
                          return (
                            <span
                              key={idx}
                              className="inline-block rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                            >
                              [Hidden because{' '}
                              {excludedDoc?.filename || 'this file'} is unticked
                              on the left]{' '}
                            </span>
                          )
                        }

                        return (
                          <React.Fragment key={idx}>
                            <span>{seg.text}</span>
                            {citationObj && (
                              <button
                                type="button"
                                className={`mx-0.5 inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                  activeCitation?.id === citationObj.id
                                    ? 'border-[var(--aurora-cyan)] bg-[var(--aurora-violet)]/20 text-foreground'
                                    : 'border-border bg-muted/60 text-[var(--aurora-cyan)] hover:border-primary/40'
                                }`}
                                onClick={() =>
                                  setSelectedCitationId(citationObj.id)
                                }
                              >
                                [{citationObj.badge}]
                              </button>
                            )}{' '}
                          </React.Fragment>
                        )
                      })}
                    </div>

                    {activeQuery.conflictAlert &&
                      includedSources['src-legacy'] && (
                        <div
                          className="mt-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3"
                          role="status"
                        >
                          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-amber-600 dark:text-amber-300">
                            <span>⚠ CONTRADICTION SPOTTED</span>
                            <span>Needs your review</span>
                          </div>
                          <p className="text-xs leading-relaxed text-foreground/95">
                            <strong>
                              {activeQuery.conflictAlert.incomingDoc}
                            </strong>{' '}
                            disagrees with{' '}
                            <strong>
                              {activeQuery.conflictAlert.agreedNode}
                            </strong>
                            : {activeQuery.conflictAlert.summary}
                          </p>
                        </div>
                      )}
                  </div>
                </div>
              </div>

              {/* Pane 3: Exact Page Proof Inspector */}
              <aside
                className="flex flex-col gap-3.5 p-5 lg:col-span-4"
                aria-label="Original Page Quote"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    3. Original Page Proof
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    Click any badge to inspect
                  </span>
                </div>

                {activeCitation ? (
                  <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <Badge
                        variant="outline"
                        className="border-border bg-muted/60 text-[11px] text-[var(--aurora-lilac)]"
                      >
                        {activeCitation.pageRange}
                      </Badge>
                      <span className="font-medium text-[var(--signal)]">
                        {activeCitation.score}
                      </span>
                    </div>

                    <h4 className="text-sm font-semibold text-foreground">
                      {activeCitation.headingPath}
                    </h4>

                    <p className="text-xs text-muted-foreground">
                      Source file: {activeCitation.badge}
                    </p>

                    <blockquote className="m-0 rounded-xl border border-border bg-card p-3.5 text-xs leading-relaxed text-foreground/90">
                      {activeCitation.excerpt}
                    </blockquote>

                    <Separator className="bg-border" />

                    <div className="flex flex-col gap-2">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Sources cited in this answer ({visibleCitations.length}):
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {visibleCitations.map((cit) => (
                          <button
                            key={cit.id}
                            type="button"
                            className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                              cit.id === activeCitation.id
                                ? 'border-[var(--aurora-cyan)]/60 bg-[var(--aurora-violet)]/15 text-foreground'
                                : 'border-border bg-card/60 text-muted-foreground hover:text-foreground'
                            }`}
                            onClick={() => setSelectedCitationId(cit.id)}
                          >
                            <span className="truncate">{cit.badge}</span>
                            <span className="shrink-0 pl-2 font-medium">
                              {cit.pageRange}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground">
                    <p>
                      All files for this answer are currently unticked on the
                      left. Tick at least one file to see its page proof.
                    </p>
                  </div>
                )}
              </aside>
            </div>
          </CardContent>

          <CardFooter className="justify-between border-t border-border bg-muted/25 py-3 text-xs text-muted-foreground">
            <span>
              Untick any file on the left to see how answers immediately adapt
              to your chosen sources.
            </span>
            <span className="text-[11px] text-[var(--aurora-cyan)]">
              Zero hallucinated citations
            </span>
          </CardFooter>
        </Card>
      </div>
    </section>
  )
}
