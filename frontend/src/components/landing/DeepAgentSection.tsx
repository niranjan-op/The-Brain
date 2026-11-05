import React, { useState } from 'react'

/**
 * ============================================================================
 * DEEP AGENT GUI SHOWCASE & FUTURE DROP-IN SLOT (`DeepAgentSection.tsx`)
 * ============================================================================
 *
 * HOW TO SWAP IN YOUR FINAL AGENT SCREENSHOT OR LIVE FRONTEND COMPONENT LATER:
 *
 * 1. Static Screenshot / Video Drop-in:
 *    - Place your screenshot or WebM recording in `frontend/public/agent-gui-preview.png`
 *    - Set `AGENT_GUI_CUSTOM_IMAGE_URL = '/agent-gui-preview.png'` below, OR
 *      replace the contents of `[data-agent-gui-slot="stage"]` with an `<img>` / `<video>`.
 *
 * 2. Live React Agent Layout Drop-in:
 *    - When you build the production `/projects/:id/research` Agent Workspace UI,
 *      import it here and mount it inside `[data-agent-gui-slot="live-mount"]`.
 *    - Backend tables backing this UI (already migrated in Alembic `c1a000000003`):
 *      - `research_runs` (`plan`, `status`, `steps_used`, `searches_used`, `search_budget`, `lease_until`, `last_heartbeat_at`)
 *      - `search_cache` & `search_limits` (`provider`: `vertex` | `serpapi`)
 *      - `artifacts` & `artifact_versions` (`type`: `architecture_plan` | `prd` | `adr` | `report` | `diagram`, `source_refs`)
 *      - `project_members` & `invites` (`owner` | `edit` | `view`, max 4 members/project)
 * ============================================================================
 */

const AGENT_GUI_CUSTOM_IMAGE_URL: string | null = null

interface AgentDemoSession {
  id: string
  folder: string
  title: string
  timeLabel: string
  statusText: string
  statusKind: 'review' | 'thinking' | 'done'
  badges: string[]
  promptTitle: string
  narrativeLead: string
  narrativeSub: string
  inlineEvents: Array<{
    code: string
    badge: string
    tone: 'amber' | 'cyan' | 'emerald'
    title: string
    detail: string
    meta: string
  }>
  artifactFile: string
  artifactTag: string
  artifactTitle: string
  artifactSummary: string
  artifactStats: { files: number; added: number; removed: number; checks: string }
  sourceRefs: string[]
  terminalTool: string
  terminalToolArgs: string
  terminalPrompt: string
  terminalStatus: string
  searchesUsed: string
  stepsUsed: string
}

const AGENT_DEMO_SESSIONS: AgentDemoSession[] = [
  {
    id: 'sess-storage-adr',
    folder: 'storage-arch',
    title: 'Storage Migration Deep Research & ADR-004',
    timeLabel: 'Just now',
    statusText: 'Step 5/6 · ADR ready for review',
    statusKind: 'review',
    badges: ['#D016', '#ADR-004', '3/8 searches'],
    promptTitle:
      'Verify whether our new PDF upload conflicts with agreed storage decisions & draft ADR-004',
    narrativeLead:
      'Deep Agent cross-checked 4 scoped project files against 7 agreed Decision nodes and ran 3 budgeted web searches on Postgres 17 HNSW + BM25 memory overhead.',
    narrativeSub:
      'Every claim is pinned to an exact document chunk or graph node. Proposed graph updates are paused at the Human Approval Gate until an owner approves.',
    inlineEvents: [
      {
        code: '1 — SOURCE SCOPE ENFORCED (RECOMMENDED)',
        badge: 'Scope check passed',
        tone: 'emerald',
        title: 'Scoped retrieval locked to 4 active files',
        detail: '1 unticked draft excluded from vector, BM25, and graph read tools',
        meta: 'scope: 4/5 docs · RRF k=60',
      },
      {
        code: '2 — CONTRADICTION FLAGGED ON UPLOAD',
        badge: 'Conflict detected',
        tone: 'amber',
        title: 'legacy-firestore-proposal.pdf (p. 3) contradicts agreed Decision D016',
        detail: 'Non-destructive flag raised — existing Decision Graph was not overwritten',
        meta: 'cosine 0.89 vs node:D016',
      },
      {
        code: '3 — HUMAN APPROVAL GATE',
        badge: 'Awaiting owner approval',
        tone: 'cyan',
        title: 'Drafted ADR-004 v2 and queued SUPERSEDES edge for confirmation',
        detail: 'Approve below to commit to Postgres graph_changes & sync to Neo4j',
        meta: 'tx: graph_gateway · 0 unverified refs',
      },
    ],
    artifactFile: 'ADR-004-Storage-Plan.md',
    artifactTag: 'ADR #004 · v2',
    artifactTitle: 'feat(adr): formalize self-hosted Postgres 17 + LIST partitions over managed tier',
    artifactSummary: 'artifact_versions.v2 · status: draft → final · 4 verified citations',
    artifactStats: { files: 2, added: 48, removed: 12, checks: '4/4 citations verified' },
    sourceRefs: ['node:D016', 'node:D015', 'chk_8c41a2 (p.2)', 'chk_19f0e4 (fig.1)'],
    terminalTool: 'why_decision & hybrid_rrf_search',
    terminalToolArgs: 'toolName=why_decision("D016") · search_budget=3/8 · scope=4_docs',
    terminalPrompt:
      'Synthesize Postgres 17 partition benchmarks and Decision D016 provenance into versioned artifact ADR-004-Storage-Plan.md with inline [chunk_id] citations.',
    terminalStatus: 'Thinking... (esc to pause · 60s lease heartbeat active)',
    searchesUsed: '3 / 8 web searches',
    stepsUsed: 'Step 5 / 6',
  },
  {
    id: 'sess-vpc-spike',
    folder: 'cloud-network',
    title: 'Open Question Q04: VPC Egress vs. Cloud Bucket',
    timeLabel: '14m ago',
    statusText: 'Thinking... · 4/8 web searches',
    statusKind: 'thinking',
    badges: ['#Q04', '#SVC-WORKER', '4/8 searches'],
    promptTitle:
      'Compare Direct VPC Egress vs. GCS Bundle Handoff for the 4 GB Background File Parser',
    narrativeLead:
      'Investigating Open Question Q04 by combining internal Cloud Run worker specs with live Google Cloud pricing documentation via cached Vertex Grounding.',
    narrativeSub:
      'Run holds an active 900s worker lease with 60s heartbeat updates so you can pause, steer, or resume without losing intermediate citations.',
    inlineEvents: [
      {
        code: '1 — GRAPH READ TOOL EXECUTED',
        badge: 'open_questions()',
        tone: 'cyan',
        title: 'Loaded Open Question Q04 and dependent node D016',
        detail: 'Traced dependency between 4 GB Docling Worker Job and VM Postgres 17',
        meta: 'path: Q04 -> D016 -> SVC-WORKER',
      },
      {
        code: '2 — BUDGETED WEB SEARCH (CACHED)',
        badge: 'search_cache hit',
        tone: 'emerald',
        title: 'Queried Cloud Run Job Direct VPC egress pricing & NAT rules',
        detail: 'Deduplicated via 24h search_cache to save daily search_limits quota',
        meta: 'provider: vertex · budget: 4/8',
      },
      {
        code: '3 — ARTIFACT DRAFT STREAMING',
        badge: 'Report v1 draft',
        tone: 'amber',
        title: 'Compiling cost & latency comparison table with source_refs',
        detail: 'Proposing new Decision node D025 to close Open Question Q04',
        meta: 'type: report · status: draft',
      },
    ],
    artifactFile: 'Report-Q04-Network-Spike.md',
    artifactTag: 'REPORT #009 · v1',
    artifactTitle: 'docs(spike): benchmark Direct VPC egress vs GCS bundle handoff for worker',
    artifactSummary: 'artifact_versions.v1 · status: draft · 5 verified citations',
    artifactStats: { files: 1, added: 64, removed: 0, checks: '5/5 citations verified' },
    sourceRefs: ['node:Q04', 'node:D016', 'chk_19f0e4 (fig.1)', 'web:gcp-vpc-pricing'],
    terminalTool: 'web_search_grounded',
    terminalToolArgs: 'provider=vertex · query="Cloud Run Job Direct VPC egress cost" · cache=hit',
    terminalPrompt:
      'Compare monthly fixed cost of Cloud Run Direct VPC egress against GCS signed-bundle handoff for 50-page PDF ingestion jobs.',
    terminalStatus: 'Thinking... (esc to pause · step 4 of 6 running)',
    searchesUsed: '4 / 8 web searches',
    stepsUsed: 'Step 4 / 6',
  },
  {
    id: 'sess-table-prd',
    folder: 'ingestion-core',
    title: 'Spreadsheet & Diagram Extraction Architecture Plan',
    timeLabel: 'Yesterday',
    statusText: 'Completed · Exported Plan v2',
    statusKind: 'done',
    badges: ['#D007', '#Plan-v2', 'Completed'],
    promptTitle:
      'Generate an Architecture Plan for indexing multi-page PDF tables and diagrams without chunk bloat',
    narrativeLead:
      'Synthesized Decision D007 (compact triplet tables) and the 41-page engineering report benchmark into a final Architecture Plan artifact.',
    narrativeSub:
      'Exported to clean Markdown with immutable version history so all 4 project collaborators can inspect the exact source pages.',
    inlineEvents: [
      {
        code: '1 — TABLE TRIPLET VERIFICATION',
        badge: 'Decision D007',
        tone: 'emerald',
        title: 'Verified 118 deduplicated chunks & 10 tables from report-1-half.pdf',
        detail: 'Confirmed sanity guard: chunks/page <= 30 and 0 duplicate chunk_ids',
        meta: 'chk_4b12d9 · pp. 11–14',
      },
      {
        code: '2 — VISION DIAGRAM DESCRIPTIONS',
        badge: 'Gemini Flash-Lite',
        tone: 'cyan',
        title: 'Indexed 5 architecture diagrams with semantic descriptions',
        detail: 'Capped at 10 figures per document with non-blocking fallback',
        meta: 'doc_kind: architecture_diagram',
      },
      {
        code: '3 — ARTIFACT FINALIZED & EXPORTED',
        badge: 'Final v2',
        tone: 'emerald',
        title: 'Published Architecture-Plan-Ingestion-v2.md to team workspace',
        detail: 'Shared with 4 project members (owner, edit, view roles)',
        meta: 'artifact_versions: v2 (final)',
      },
    ],
    artifactFile: 'Architecture-Plan-Ingestion-v2.md',
    artifactTag: 'PLAN #002 · v2',
    artifactTitle: 'feat(plan): finalize Docling TableFormer triplet + Gemini vision pipeline',
    artifactSummary: 'artifact_versions.v2 · status: final · 6 verified citations',
    artifactStats: { files: 3, added: 92, removed: 18, checks: '6/6 citations verified' },
    sourceRefs: ['node:D007', 'chk_4b12d9 (p.11)', 'chk_55c8e1 (Table 3.1)', 'chk_91e3b0 (p.1)'],
    terminalTool: 'export_artifact_markdown',
    terminalToolArgs: 'artifactType=architecture_plan · version=2 · status=final',
    terminalPrompt:
      'Export finalized Architecture Plan v2 with embedded source_refs and notify shared project workspace.',
    terminalStatus: 'Run completed · 2/8 web searches used · All citations verified',
    searchesUsed: '2 / 8 web searches',
    stepsUsed: 'Step 6 / 6 (Done)',
  },
]

const COMPLETE_PROJECT_PILLARS = [
  {
    code: '01 // DEEP RESEARCH AGENT',
    title: 'Budgeted Multi-Step Research Runs',
    summary:
      'Plans and executes multi-step investigations combining your private document chunks, Decision Graph tools, and live web search (capped at 8 searches/run) with 60s heartbeat leases you can pause, steer, and resume.',
    meta: 'Tables: research_runs · search_cache · search_limits',
  },
  {
    code: '02 // CONFLICT DETECTION',
    title: 'Non-Destructive Upload Conflict Guards',
    summary:
      'When a newly uploaded PDF or spec contradicts an agreed Decision, the agent never overwrites your graph automatically—it flags the exact page and drafts a scoped SUPERSEDES proposal for human review.',
    meta: 'Tables: nodes · edges · evidence · graph_changes',
  },
  {
    code: '03 // ARTIFACT STUDIO',
    title: 'Versioned ADRs, Plans, PRDs & Reports',
    summary:
      'Turn any research run or decision thread into versioned Architecture Plans, ADRs, PRDs, Reports, and Diagrams (draft → final) where every section pins its exact chunk and node source_refs and exports to Markdown.',
    meta: 'Tables: artifacts · artifact_versions',
  },
  {
    code: '04 // TEAM WORKSPACES & BYOK',
    title: '4-Member Collaboration & Zero-Lockout BYOK',
    summary:
      'Invite up to 4 teammates per project with owner, edit, or view roles and shared or private conversation threads. When daily managed quota runs out, switch to your own browser-stored API key with zero lockout.',
    meta: 'Tables: project_members · invites · usage_ledger',
  },
]

export function DeepAgentSection(): React.ReactElement {
  const [activeSessionId, setActiveSessionId] = useState<string>(
    AGENT_DEMO_SESSIONS[0].id,
  )
  const [agentPaused, setAgentPaused] = useState<boolean>(false)
  const [credentialMode, setCredentialMode] = useState<'managed' | 'byok'>(
    'managed',
  )
  const [viewMode, setViewMode] = useState<'interactive' | 'skeleton'>(
    'interactive',
  )

  const activeSession =
    AGENT_DEMO_SESSIONS.find((s) => s.id === activeSessionId) ||
    AGENT_DEMO_SESSIONS[0]

  return (
    <section id="deep-agent" className="deep-agent-section">
      <div className="container">
        <div className="section-header-row" data-reveal="up">
          <div className="section-header-copy">
            <div className="kg-dataset-meta-row">
              <span className="kg-meta-tag mono">
                Autonomous Deep Research Agent
              </span>
              <span className="kg-meta-divider" aria-hidden="true">
                ·
              </span>
              <span className="kg-meta-dataset mono">
                Multi-Step Planning · Scoped Docs + Web Search · Versioned ADRs
              </span>
            </div>
            <h2 className="section-heading">
              Meet the Deep Agent that researches, checks conflicts, and writes your ADRs.
            </h2>
            <p className="section-description">
              Beyond visual mapping, Knowledge Cartographer runs an autonomous
              Deep Research Agent that cross-examines your uploaded files, your
              team&apos;s Decision Graph, and live web search—pausing for your
              approval before changing the graph or publishing a document.
            </p>
          </div>

          <div
            className="agent-view-mode-switch"
            role="group"
            aria-label="Agent GUI preview mode"
          >
            <button
              type="button"
              className={`cluster-pill ${viewMode === 'interactive' ? 'is-active' : ''}`}
              onClick={() => setViewMode('interactive')}
            >
              Interactive Agent GUI
            </button>
            <button
              type="button"
              className={`cluster-pill ${viewMode === 'skeleton' ? 'is-active' : ''}`}
              onClick={() => setViewMode('skeleton')}
            >
              Future Drop-in Slot
            </button>
          </div>
        </div>

        {/* ====================================================================
            AGENT_GUI_STAGE_CONTAINER:
            Modeled after the Kiro-style multi-pane session + overlapping live
            terminal layout. When your production Agent UI or screenshot is ready,
            set `AGENT_GUI_CUSTOM_IMAGE_URL` at the top of this file or mount your
            component inside `[data-agent-gui-slot="stage"]`.
           ==================================================================== */}
        <div
          className="agent-showcase-stage"
          data-agent-gui-slot="stage"
          data-reveal="scale"
        >
          {AGENT_GUI_CUSTOM_IMAGE_URL ? (
            <img
              src={AGENT_GUI_CUSTOM_IMAGE_URL}
              alt="Knowledge Cartographer Deep Research Agent GUI"
              className="agent-custom-screenshot"
            />
          ) : viewMode === 'skeleton' ? (
            /* Explicit Developer Arrangement / Drop-in Skeleton Slot */
            <div
              className="agent-skeleton-arrangement"
              data-agent-gui-slot="live-mount"
            >
              <div className="agent-skeleton-grid">
                <div className="agent-skeleton-window">
                  <div className="agent-skeleton-badge mono">
                    SLOT A // MAIN 3-PANE AGENT WORKSPACE GUI (1200×680)
                  </div>
                  <h3 className="agent-skeleton-title">
                    Ready for your live Agent Frontend or screenshot drop-in
                  </h3>
                  <p className="agent-skeleton-copy">
                    Edit{' '}
                    <code>
                      frontend/src/components/landing/DeepAgentSection.tsx
                    </code>{' '}
                    and set <code>AGENT_GUI_CUSTOM_IMAGE_URL</code> to drop in a
                    screenshot, or mount your live React{' '}
                    <code>&lt;DeepResearchWorkspace /&gt;</code> component
                    directly inside{' '}
                    <code>[data-agent-gui-slot=&quot;live-mount&quot;]</code>.
                  </p>
                  <div className="agent-skeleton-wireframes">
                    <div className="skeleton-col">
                      <span className="mono">Left Pane (240px)</span>
                      <strong>Research Sessions List</strong>
                      <small className="mono">
                        research_runs · status: running | paused | completed
                      </small>
                    </div>
                    <div className="skeleton-col">
                      <span className="mono">Center Pane (Flex)</span>
                      <strong>Reasoning Stream &amp; Guard Cards</strong>
                      <small className="mono">
                        Source scope filter · Conflict flags · Human approval gate
                      </small>
                    </div>
                    <div className="skeleton-col">
                      <span className="mono">Right Pane (300px)</span>
                      <strong>Versioned Artifact Diff</strong>
                      <small className="mono">
                        artifacts + artifact_versions · Markdown export
                      </small>
                    </div>
                  </div>
                </div>

                <div className="agent-skeleton-terminal">
                  <div className="agent-skeleton-badge mono">
                    SLOT B // OVERLAPPING AGENT LIVE TRACE TERMINAL (540×360)
                  </div>
                  <p className="agent-skeleton-copy">
                    Streams real-time tool calls (<code>why_decision()</code>,{' '}
                    <code>hybrid_rrf_search()</code>,{' '}
                    <code>web_search_grounded()</code>), search budget meters (
                    <code>searches_used / 8</code>), and 60s worker lease
                    heartbeats.
                  </p>
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() => setViewMode('interactive')}
                  >
                    Return to Interactive Agent GUI Preview
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Live Interactive Multi-Pane Agent GUI + Overlapping Terminal Showcase */
            <div className="agent-composite-canvas">
              {/* WINDOW 1: Main Desktop 3-Pane Agent Session GUI */}
              <div
                className="agent-desktop-window"
                role="region"
                aria-label="Deep Research Agent Desktop Interface"
              >
                {/* Top Window Titlebar */}
                <div className="agent-window-titlebar">
                  <div className="agent-window-dots" aria-hidden="true">
                    <span className="win-dot win-dot-red" />
                    <span className="win-dot win-dot-amber" />
                    <span className="win-dot win-dot-green" />
                  </div>

                  <div className="agent-workspace-tabs mono">
                    <span className="ws-tab">Local</span>
                    <span className="ws-tab">Prod-Graph</span>
                    <span className="ws-tab is-active">Deep Agent · 3</span>
                  </div>

                  <div className="agent-command-search mono">
                    ⌘K — Search sessions, decisions, or @files...
                  </div>

                  <div className="agent-titlebar-right">
                    <span className="agent-collab-pill mono">
                      4/4 Members · Shared
                    </span>
                    <span className="agent-feature-btn mono">
                      + Generate ADR
                    </span>
                  </div>
                </div>

                {/* 3-Pane Interior */}
                <div className="agent-window-body">
                  {/* Far-left Icon Rail */}
                  <div className="agent-icon-rail" aria-hidden="true">
                    <div className="rail-avatar">KC</div>
                    <span className="rail-dot is-active" />
                    <span className="rail-dot" />
                    <span className="rail-dot" />
                    <span className="rail-dot" />
                  </div>

                  {/* Left Pane: Sessions List */}
                  <aside
                    className="agent-sessions-sidebar"
                    aria-label="Deep Agent Research Sessions"
                  >
                    <div className="sessions-sidebar-header">
                      <span className="sessions-heading">Sessions</span>
                      <span className="sessions-new-btn mono">+ New</span>
                    </div>

                    <div className="sessions-search-box mono">
                      Search research runs...
                    </div>

                    <div className="sessions-group-label mono">
                      ▾ Active &amp; In Review
                    </div>

                    <div className="sessions-list" role="tablist">
                      {AGENT_DEMO_SESSIONS.map((sess) => {
                        const isSelected = sess.id === activeSession.id
                        return (
                          <button
                            key={sess.id}
                            type="button"
                            role="tab"
                            aria-selected={isSelected}
                            className={`session-card-btn ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => setActiveSessionId(sess.id)}
                          >
                            <div className="session-card-top mono">
                              <span className="session-folder">
                                ⊞ {sess.folder}
                              </span>
                              <span className="session-time">
                                {sess.timeLabel}
                              </span>
                            </div>
                            <div className="session-card-title">
                              {sess.title}
                            </div>
                            <div
                              className={`session-card-status status-${sess.statusKind} mono`}
                            >
                              {sess.statusText}
                            </div>
                            <div className="session-card-badges">
                              {sess.badges.map((b) => (
                                <span key={b} className="session-mini-badge mono">
                                  {b}
                                </span>
                              ))}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </aside>

                  {/* Center Pane: Session Stream & Inline Event Cards */}
                  <div className="agent-session-stream" aria-live="polite">
                    <div className="stream-top-bar">
                      <h3 className="stream-session-title">
                        {activeSession.promptTitle}
                      </h3>
                      <span className="stream-scope-tag mono">
                        {activeSession.stepsUsed}
                      </span>
                    </div>

                    <p className="stream-narrative-text">
                      {activeSession.narrativeLead}
                    </p>
                    <p className="stream-narrative-sub">
                      {activeSession.narrativeSub}
                    </p>

                    {/* Numbered Inline Safety & Provenance Event Cards */}
                    <div className="stream-events-stack">
                      {activeSession.inlineEvents.map((ev) => (
                        <div key={ev.code} className="stream-event-block">
                          <div className="stream-event-code mono">{ev.code}</div>
                          <div className={`stream-event-card tone-${ev.tone}`}>
                            <div className="stream-event-main">
                              <span className="stream-event-badge mono">
                                {ev.badge}
                              </span>
                              <strong className="stream-event-title">
                                {ev.title}
                              </strong>
                              <span className="stream-event-detail">
                                {ev.detail}
                              </span>
                            </div>
                            <span className="stream-event-meta mono">
                              {ev.meta}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Steering Action Pills + Prompt Bar */}
                    <div className="stream-steering-footer">
                      <div className="stream-quick-Write-pills">
                        <button
                          type="button"
                          className="stream-steer-pill mono"
                          onClick={() => setAgentPaused((p) => !p)}
                        >
                          {agentPaused
                            ? '▶ Resume Research Run'
                            : '⏸ Pause Run & Steer'}
                        </button>
                        <button
                          type="button"
                          className="stream-steer-pill mono"
                          onClick={() =>
                            setCredentialMode((m) =>
                              m === 'managed' ? 'byok' : 'managed',
                            )
                          }
                        >
                          Mode: {credentialMode.toUpperCase()} (Switch)
                        </button>
                      </div>

                      <div className="stream-composer-box">
                        <span className="composer-placeholder">
                          Message Deep Agent... (<code>/research</code> ·{' '}
                          <code>@file</code> · <code>$why_decision</code>)
                        </span>
                        <div className="composer-meta-row mono">
                          <span>⊞ {activeSession.folder}</span>
                          <span>
                            {credentialMode === 'managed'
                              ? 'Managed Quota'
                              : 'BYOK Browser Key'}{' '}
                            · gemini-2.5-flash
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Pane: Artifact / ADR Changes Preview */}
                  <aside
                    className="agent-artifact-sidebar"
                    aria-label="Generated Artifact and Source References"
                  >
                    <div className="artifact-sidebar-tabs mono">
                      <span className="art-tab is-active">Changes</span>
                      <span className="art-tab">{activeSession.artifactFile}</span>
                    </div>

                    <div className="artifact-preview-card">
                      <div className="artifact-badge-row mono">
                        <span className="artifact-tag-pill">
                          {activeSession.artifactTag}
                        </span>
                        <span className="artifact-status-pill">
                          verified
                        </span>
                      </div>

                      <h4 className="artifact-pr-title">
                        {activeSession.artifactTitle}
                      </h4>
                      <p className="artifact-pr-sub mono">
                        {activeSession.artifactSummary}
                      </p>

                      <div className="artifact-diff-stats mono">
                        <span>Files {activeSession.artifactStats.files}</span>
                        <span className="diff-add">
                          +{activeSession.artifactStats.added}
                        </span>
                        <span className="diff-del">
                          -{activeSession.artifactStats.removed}
                        </span>
                        <span className="diff-check">
                          ✓ {activeSession.artifactStats.checks}
                        </span>
                      </div>

                      <div className="artifact-refs-box">
                        <div className="artifact-refs-label mono">
                          PINNED SOURCE_REFS ({activeSession.sourceRefs.length})
                        </div>
                        <div className="artifact-refs-chips">
                          {activeSession.sourceRefs.map((ref) => (
                            <span key={ref} className="artifact-ref-chip mono">
                              {ref}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </aside>
                </div>
              </div>

              {/* WINDOW 2: Overlapping Bottom-Right Live Agent Execution Terminal */}
              <div
                className="agent-terminal-window"
                role="region"
                aria-label="Deep Agent Live Tool Execution Terminal"
              >
                <div className="terminal-titlebar">
                  <div className="agent-window-dots" aria-hidden="true">
                    <span className="win-dot win-dot-red" />
                    <span className="win-dot win-dot-amber" />
                    <span className="win-dot win-dot-green" />
                  </div>
                  <span className="terminal-title mono">
                    Deep Agent Live Trace — research_runs · 80×24
                  </span>
                </div>

                <div className="terminal-body mono">
                  <div className="terminal-welcome">
                    Welcome to{' '}
                    <span className="term-accent-violet">
                      Knowledge Cartographer Deep Agent!
                    </span>
                  </div>
                  <div className="terminal-subwelcome">
                    What&apos;s inside: Budgeted multi-step research, upload
                    conflict guards, and one-click ADR synthesis grounded in your
                    Decision Graph.
                  </div>

                  <div className="terminal-tip">
                    Tip: Need to inspect raw SQL or graph hops? Run{' '}
                    <span className="term-accent-cyan">/why_decision</span> or{' '}
                    <span className="term-accent-cyan">/open_questions</span>!
                  </div>

                  <div className="terminal-tool-call">
                    <span className="term-dot-green">●</span>{' '}
                    <strong>{activeSession.terminalTool}</strong>
                    <div className="terminal-tool-sub">
                      └─ {activeSession.terminalToolArgs}
                    </div>
                  </div>

                  <div className="terminal-prompt-box">
                    {activeSession.terminalPrompt}
                  </div>

                  <div className="terminal-thinking-row">
                    <span className="term-thinking-text">
                      {agentPaused
                        ? 'Run Paused (lease preserved · click Resume to continue)'
                        : activeSession.terminalStatus}
                    </span>
                  </div>

                  <div className="terminal-status-line">
                    <span>
                      {credentialMode === 'managed' ? 'Managed' : 'BYOK'} ·
                      Gemini 2.5 Pro · {activeSession.searchesUsed} ·{' '}
                      <span className="term-green">● 100% cited</span>
                    </span>
                    <span className="term-cloud-pill">
                      ☁ Worker Lease Active
                    </span>
                  </div>

                  <div className="terminal-footer-bar">
                    <span>
                      {agentPaused
                        ? 'Agent is paused · Type to steer next step'
                        : 'Deep Agent is working · Type to steer · Ctrl+S to checkpoint'}
                    </span>
                    <button
                      type="button"
                      className="terminal-pause-btn mono"
                      onClick={() => setAgentPaused((p) => !p)}
                      aria-label={
                        agentPaused ? 'Resume agent run' : 'Pause agent run'
                      }
                    >
                      {agentPaused ? '▶' : '⏸'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="agent-stage-caption">
          <span className="mono">
            Interactive Deep Agent Preview · Click any session on the left or
            toggle &ldquo;Future Drop-in Slot&rdquo; above when ready to drop in
            your live Agent UI
          </span>
        </div>

        {/* Complete Project Pillars: Explaining Everything We Haven't Covered Yet */}
        <div
          className="agent-pillars-grid"
          data-reveal="stagger"
          aria-label="Complete Knowledge Cartographer Capabilities"
        >
          {COMPLETE_PROJECT_PILLARS.map((pillar) => (
            <article key={pillar.code} className="agent-pillar-card">
              <span className="agent-pillar-code mono">{pillar.code}</span>
              <h3 className="agent-pillar-title">{pillar.title}</h3>
              <p className="agent-pillar-summary">{pillar.summary}</p>
              <span className="agent-pillar-meta mono">{pillar.meta}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

