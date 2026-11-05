import React, { useMemo, useState } from 'react'
import {
  WORKSPACE_QUERIES,
  WORKSPACE_SOURCES,
  type CitationItem,
} from '../../data/landingData'

export function WorkspaceDemoSection(): React.ReactElement {
  const [includedSources, setIncludedSources] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    WORKSPACE_SOURCES.forEach((src) => {
      initial[src.id] = src.defaultIncluded
    })
    return initial
  })

  const [activeQueryId, setActiveQueryId] = useState<string>(WORKSPACE_QUERIES[0].id)
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
    <section id="workspace" className="workspace-demo-section">
      <div className="container">
        <div className="section-header-row" data-reveal="up">
          <div className="section-header-copy">
            <h2 className="section-heading">
              Scoped sources, verified citations.
            </h2>
            <p className="section-description">
              Toggle allowed files per conversation and inspect every inline
              page or decision citation in real time.
            </p>
          </div>
          <div className="preview-disclosure-badge mono">
            Interactive Workspace · Sample Data
          </div>
        </div>

        <div className="workspace-frame" data-reveal="scale">
          {/* Top chrome bar */}
          <div className="workspace-chrome">
            <div className="chrome-project-title">
              <span className="status-dot status-dot-ready" aria-hidden="true" />
              <span className="mono">project: knowledge-cartographer-core</span>
              <span className="chrome-divider" aria-hidden="true">/</span>
              <span className="mono">convo_visibility: shared</span>
            </div>
            <div className="chrome-scope-pill mono" aria-live="polite">
              Answering from {activeCount} of {WORKSPACE_SOURCES.length} sources
            </div>
          </div>

          <div className="workspace-three-pane">
            {/* Pane 1: Source Scope Checklist */}
            <aside className="workspace-pane pane-sources" aria-label="Conversation Source Checklist">
              <div className="pane-header">
                <h3 className="pane-title">Source Scope Checklist</h3>
                <button
                  type="button"
                  className="text-action-btn mono"
                  onClick={() => {
                    const allOn: Record<string, boolean> = {}
                    WORKSPACE_SOURCES.forEach((s) => {
                      allOn[s.id] = true
                    })
                    setIncludedSources(allOn)
                  }}
                >
                  Include all
                </button>
              </div>

              <ul className="source-checklist">
                {WORKSPACE_SOURCES.map((src) => {
                  const checked = Boolean(includedSources[src.id])
                  return (
                    <li
                      key={src.id}
                      className={`source-item ${checked ? 'is-included' : 'is-excluded'}`}
                    >
                      <label className="source-checkbox-label">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSource(src.id)}
                        />
                        <span className="source-meta">
                          <span className="source-filename mono">{src.filename}</span>
                          <span className="source-submeta mono">
                            {src.kind} · {src.pages}p · {src.chunks} chunks · {src.status}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </aside>

            {/* Pane 2: Grounded Chat & Inline Citations */}
            <div className="workspace-pane pane-chat">
              <div className="pane-header">
                <h3 className="pane-title">Grounded Conversation Stream</h3>
                <span className="mono pane-meta-tag">{activeQuery.modeLabel}</span>
              </div>

              <div className="query-switcher" role="tablist" aria-label="Sample engineering questions">
                {WORKSPACE_QUERIES.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    role="tab"
                    aria-selected={q.id === activeQueryId}
                    className={`query-tab-btn ${q.id === activeQueryId ? 'is-active' : ''}`}
                    onClick={() => handleSelectQuery(q.id)}
                  >
                    {q.question}
                  </button>
                ))}
              </div>

              <div className="chat-transcript" aria-live="polite">
                <div className="chat-bubble chat-bubble-human">
                  <div className="bubble-meta mono">
                    <span>type: human</span>
                    <span>source_scope: {activeCount} docs allowed</span>
                  </div>
                  <p className="bubble-question-text">{activeQuery.question}</p>
                </div>

                <div className="chat-bubble chat-bubble-ai">
                  <div className="bubble-meta mono">
                    <span>status: answered</span>
                    <span>{activeQuery.tokensUsed}</span>
                    <span>{activeQuery.latencyMs} ms</span>
                  </div>

                  <div className="ai-answer-body">
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
                          <span key={idx} className="excluded-segment-notice mono">
                            [Claim omitted: source{' '}
                            {excludedDoc?.filename || seg.requiredSourceId} is
                            excluded from this conversation&apos;s scope.]{' '}
                          </span>
                        )
                      }

                      return (
                        <React.Fragment key={idx}>
                          <span>{seg.text}</span>
                          {citationObj && (
                            <button
                              type="button"
                              className={`citation-chip mono ${activeCitation?.id === citationObj.id ? 'is-selected' : ''}`}
                              onClick={() => setSelectedCitationId(citationObj.id)}
                            >
                              [{citationObj.badge}]
                            </button>
                          )}{' '}
                        </React.Fragment>
                      )
                    })}
                  </div>

                  {activeQuery.conflictAlert && includedSources['src-legacy'] && (
                    <div className="conflict-flag-banner" role="status">
                      <div className="conflict-flag-header mono">
                        <span>CONFLICT CHECK ON UPLOAD</span>
                        <span>SCOPE: {activeQuery.conflictAlert.scope.toUpperCase()}</span>
                      </div>
                      <p className="conflict-flag-text">
                        <strong>{activeQuery.conflictAlert.incomingDoc}</strong> vs{' '}
                        <strong>{activeQuery.conflictAlert.agreedNode}</strong>:{' '}
                        {activeQuery.conflictAlert.summary}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pane 3: Citation & Evidence Inspector */}
            <aside className="workspace-pane pane-evidence" aria-label="Retrieved Chunk and Node Evidence">
              <div className="pane-header">
                <h3 className="pane-title">Evidence Inspector</h3>
                <span className="mono pane-meta-tag">message_sources</span>
              </div>

              {activeCitation ? (
                <div className="evidence-card">
                  <div className="evidence-badge-row mono">
                    <span className="evidence-kind-pill">
                      source_kind: {activeCitation.kind}
                    </span>
                    <span className="evidence-score">{activeCitation.score}</span>
                  </div>

                  <h4 className="evidence-heading-path">
                    {activeCitation.headingPath}
                  </h4>

                  <p className="evidence-page-meta mono">
                    Document ref: {activeCitation.badge} · {activeCitation.pageRange}
                  </p>

                  <blockquote className="evidence-excerpt">
                    {activeCitation.excerpt}
                  </blockquote>

                  <div className="evidence-citation-list">
                    <p className="evidence-list-title mono">
                      VERIFIED CITATIONS IN THIS TURN ({visibleCitations.length}):
                    </p>
                    <div className="evidence-chip-stack">
                      {visibleCitations.map((cit) => (
                        <button
                          key={cit.id}
                          type="button"
                          className={`evidence-select-btn mono ${cit.id === activeCitation.id ? 'is-active' : ''}`}
                          onClick={() => setSelectedCitationId(cit.id)}
                        >
                          <span>{cit.badge}</span>
                          <span>{cit.pageRange}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="evidence-empty">
                  <p>
                    All sources backing this answer are currently unticked in the
                    Source Scope Checklist. Re-enable at least one source on the
                    left to inspect its retrieved chunks.
                  </p>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </section>
  )
}

