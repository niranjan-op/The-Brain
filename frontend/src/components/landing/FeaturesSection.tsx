import React, { useState } from 'react'
import { RRF_BENCHMARK_CASES } from '../../data/landingData'

export function FeaturesSection(): React.ReactElement {
  const [selectedRrfCaseId, setSelectedRrfCaseId] = useState<string>(
    RRF_BENCHMARK_CASES[0].id,
  )
  const [proposalDecision, setProposalDecision] = useState<
    'pending' | 'approved' | 'rejected'
  >('pending')
  const [quotaMode, setQuotaMode] = useState<'managed' | 'byok'>('managed')

  const activeRrfCase =
    RRF_BENCHMARK_CASES.find((c) => c.id === selectedRrfCaseId) ||
    RRF_BENCHMARK_CASES[0]

  return (
    <section id="capabilities" className="features-section">
      <div className="container">
        <div className="section-header-row" data-reveal="up">
          <div className="section-header-copy">
            <h2 className="section-heading">
              Built for verifiable engineering memory.
            </h2>
            <p className="section-description">
              Hybrid retrieval, human-gated graph writes, and transparent usage
              controls.
            </p>
          </div>
        </div>

        <div className="capabilities-ledger">
          {/* Card 1: Hybrid RRF Retrieval Interactive Comparator */}
          <article className="ledger-block ledger-block-wide" data-reveal="up">
            <div className="ledger-copy">
              <h3 className="ledger-title">Hybrid RRF Fusion (k=60)</h3>
              <p className="ledger-body">
                Combines 768-dim <code>gemini-embedding-001</code> vectors with{' '}
                <code>pg_textsearch</code> BM25 keyword precision.
              </p>

              <div
                className="rrf-case-selector"
                role="group"
                aria-label="Select retrieval benchmark query"
              >
                {RRF_BENCHMARK_CASES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`cluster-pill ${item.id === selectedRrfCaseId ? 'is-active' : ''}`}
                    onClick={() => setSelectedRrfCaseId(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="ledger-interactive-panel">
              <div className="rrf-query-bar mono">
                <span>QUERY:</span>
                <strong>&ldquo;{activeRrfCase.query}&rdquo;</strong>
              </div>

              <div className="rrf-comparison-grid">
                <div
                  className={`rrf-lane ${activeRrfCase.vectorOnlyTop.hit ? 'is-hit' : 'is-miss'}`}
                >
                  <div className="rrf-lane-header mono">
                    <span>Vector (768d)</span>
                    <span>{activeRrfCase.vectorOnlyTop.score}</span>
                  </div>
                  <p className="rrf-lane-ref mono">
                    {activeRrfCase.vectorOnlyTop.ref}
                  </p>
                  <p className="rrf-lane-note">
                    {activeRrfCase.vectorOnlyTop.note}
                  </p>
                </div>

                <div
                  className={`rrf-lane ${activeRrfCase.bm25OnlyTop.hit ? 'is-hit' : 'is-miss'}`}
                >
                  <div className="rrf-lane-header mono">
                    <span>BM25 Lexical</span>
                    <span>{activeRrfCase.bm25OnlyTop.score}</span>
                  </div>
                  <p className="rrf-lane-ref mono">
                    {activeRrfCase.bm25OnlyTop.ref}
                  </p>
                  <p className="rrf-lane-note">
                    {activeRrfCase.bm25OnlyTop.note}
                  </p>
                </div>

                <div className="rrf-lane is-hybrid-winner">
                  <div className="rrf-lane-header mono">
                    <span>Hybrid RRF (k=60)</span>
                    <span>{activeRrfCase.hybridRrfTop.score}</span>
                  </div>
                  <p className="rrf-lane-ref mono">
                    {activeRrfCase.hybridRrfTop.ref}
                  </p>
                  <p className="rrf-lane-note">
                    {activeRrfCase.hybridRrfTop.note}
                  </p>
                </div>
              </div>
            </div>
          </article>

          {/* Card 2: Human-Approved Graph Gateway */}
          <article className="ledger-block" data-reveal="up">
            <div className="ledger-copy">
              <h3 className="ledger-title">Human-Approved Graph Gate</h3>
              <p className="ledger-body">
                Proposed decisions deduplicate against aliases and commit only
                after explicit approval.
              </p>
            </div>

            <div className="proposal-gate-widget">
              <div className="proposal-widget-header mono">
                <span>PROPOSED WRITE · DEDUPE PASSED</span>
                <span className={`proposal-state-badge is-${proposalDecision}`}>
                  status: {proposalDecision}
                </span>
              </div>

              <div className="proposal-node-preview">
                <p className="proposal-node-title">
                  <strong>Decision D024:</strong> Enforce 10 MB / 50-Page Cap at
                  MIME Gate
                </p>
                <p className="proposal-node-meta mono">
                  SUPERSEDES: D014_draft (scope: partial)
                </p>
              </div>

              <div className="proposal-actions">
                <button
                  type="button"
                  className={`btn-primary btn-sm ${proposalDecision === 'approved' ? 'is-selected' : ''}`}
                  onClick={() => setProposalDecision('approved')}
                >
                  Approve &amp; Commit
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setProposalDecision('rejected')}
                >
                  Reject
                </button>
                {proposalDecision !== 'pending' && (
                  <button
                    type="button"
                    className="text-action-btn mono"
                    onClick={() => setProposalDecision('pending')}
                  >
                    Reset
                  </button>
                )}
              </div>

              <p className="proposal-outcome-line mono" aria-live="polite">
                {proposalDecision === 'approved' &&
                  'Committed: INSERT INTO nodes + graph_changes -> Neo4j sync.'}
                {proposalDecision === 'rejected' &&
                  'Discarded: zero rows written to Postgres or Neo4j.'}
                {proposalDecision === 'pending' &&
                  'Awaiting owner approval before writing to graph.'}
              </p>
            </div>
          </article>

          {/* Card 3: Atomic Quotas & Explicit BYOK */}
          <article className="ledger-block" data-reveal="up">
            <div className="ledger-copy">
              <h3 className="ledger-title">Atomic Quotas &amp; BYOK Switch</h3>
              <p className="ledger-body">
                Metered daily usage with instant browser-stored BYOK switch and
                zero silent fallback.
              </p>
            </div>

            <div className="quota-byok-widget">
              <div className="quota-mode-header">
                <span className="mono">MODE:</span>
                <div
                  className="mode-toggle-group"
                  role="group"
                  aria-label="Execution credential mode"
                >
                  <button
                    type="button"
                    className={`cluster-pill ${quotaMode === 'managed' ? 'is-active' : ''}`}
                    onClick={() => setQuotaMode('managed')}
                  >
                    managed
                  </button>
                  <button
                    type="button"
                    className={`cluster-pill ${quotaMode === 'byok' ? 'is-active' : ''}`}
                    onClick={() => setQuotaMode('byok')}
                  >
                    byok (Browser Key)
                  </button>
                </div>
              </div>

              <div className="quota-meters-grid mono">
                <div className="quota-meter-item">
                  <span>llm_call</span>
                  <strong>
                    {quotaMode === 'managed' ? '18 / 50 daily' : 'BYOK direct'}
                  </strong>
                </div>
                <div className="quota-meter-item">
                  <span>doc_upload</span>
                  <strong>4 / 15 files (≤10 MB)</strong>
                </div>
                <div className="quota-meter-item">
                  <span>web_search</span>
                  <strong>4 / 8 run budget</strong>
                </div>
                <div className="quota-meter-item">
                  <span>device_guard</span>
                  <strong>1 / 3 accounts/day</strong>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
