import React, { useState } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

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
    folder: 'project-plan',
    title: 'Check New Upload Against Agreed Plan',
    timeLabel: 'Just now',
    statusText: 'Step 5/6 · Summary ready for review',
    statusKind: 'review',
    badges: ['Page Proof', 'Conflict Check', '3/8 web searches'],
    promptTitle:
      'Check if our newly uploaded draft conflicts with our current project plan and write a 1-page summary',
    narrativeLead:
      'Compared 4 selected project files against your agreed decisions and ran 3 live web searches to verify external facts.',
    narrativeSub:
      'Every statement links to an exact page number. Suggested updates wait for your approval before changing your shared decision map.',
    inlineEvents: [
      {
        code: '1 — SELECTED FILES CHECKED',
        badge: '4 files included',
        tone: 'emerald',
        title: 'Searching only the 4 files you ticked',
        detail: '1 older draft was unticked and excluded from this run',
        meta: '4 of 5 files active',
      },
      {
        code: '2 — CONTRADICTION SPOTTED',
        badge: 'Conflict found',
        tone: 'amber',
        title: 'old-proposal-draft.pdf (Page 3) disagrees with your current plan',
        detail: 'Highlighted for review—your existing decision map was not overwritten',
        meta: 'Page 3 vs Page 2',
      },
      {
        code: '3 — READY FOR YOUR APPROVAL',
        badge: 'Waiting for review',
        tone: 'cyan',
        title: 'Drafted Project-Decision-Summary.md with 4 page citations',
        detail: 'Approve to update your shared map and export to Markdown',
        meta: '4/4 page links verified',
      },
    ],
    artifactFile: 'Project-Decision-Summary.md',
    artifactTag: 'SUMMARY · v2',
    artifactTitle: 'Updated Project Plan & Contradiction Review',
    artifactSummary: 'Version 2 · Ready to export · 4 verified page citations',
    artifactStats: { files: 2, added: 48, removed: 12, checks: '4/4 citations verified' },
    sourceRefs: ['project-plan-v2.pdf (p.2)', 'team-notes.md (p.2)', 'research-report.pdf (p.12)', 'system-overview.png (Fig.1)'],
    terminalTool: 'Cross-Checking Files & Decisions',
    terminalToolArgs: 'Checking 4 selected files · 3 of 8 web searches used',
    terminalPrompt:
      'Combine the findings from project-plan-v2.pdf and team-notes.md into a clean summary with clickable page numbers.',
    terminalStatus: 'Waiting for your review (you can pause or steer anytime)',
    searchesUsed: '3 / 8 web searches',
    stepsUsed: 'Step 5 / 6',
  },
  {
    id: 'sess-vpc-spike',
    folder: 'literature-review',
    title: 'Compare Options & Gather Web Evidence',
    timeLabel: '14m ago',
    statusText: 'Researching... · 4/8 web searches',
    statusKind: 'thinking',
    badges: ['Open Question', 'Web + Files', '4/8 searches'],
    promptTitle:
      'Compare our two shortlisted options using our uploaded slides and current web benchmarks',
    narrativeLead:
      'Combining your uploaded lecture slides and meeting notes with live web sources to answer an open team question.',
    narrativeSub:
      'You can pause the research run at any step, add a follow-up instruction, or resume without losing progress.',
    inlineEvents: [
      {
        code: '1 — OPEN QUESTION LOADED',
        badge: 'Open question',
        tone: 'cyan',
        title: 'Found unresolved question from Tuesday’s meeting notes',
        detail: 'Linked related slides and cost spreadsheet rows automatically',
        meta: 'team-notes.md · Page 3',
      },
      {
        code: '2 — LIVE WEB CHECK',
        badge: 'Web source verified',
        tone: 'emerald',
        title: 'Pulled latest published comparison numbers from the web',
        detail: 'Kept web sources separate from your private uploaded files',
        meta: '4 of 8 web searches used',
      },
      {
        code: '3 — DRAFTING COMPARISON REPORT',
        badge: 'Draft v1',
        tone: 'amber',
        title: 'Building side-by-side pros, cons, and page citations',
        detail: 'Suggesting a new decision card to close your open question',
        meta: 'Report draft in progress',
      },
    ],
    artifactFile: 'Option-Comparison-Report.md',
    artifactTag: 'REPORT · v1',
    artifactTitle: 'Side-by-Side Option Comparison & Recommendation',
    artifactSummary: 'Version 1 · Draft · 5 verified page & web citations',
    artifactStats: { files: 1, added: 64, removed: 0, checks: '5/5 citations verified' },
    sourceRefs: ['team-notes.md (p.3)', 'research-report.pdf (p.14)', 'system-overview.png (Fig.1)', 'Web Benchmark'],
    terminalTool: 'Searching Files + Live Web',
    terminalToolArgs: 'Querying uploaded PDFs and verified web sources',
    terminalPrompt:
      'Build a clear comparison table showing cost, setup time, and trade-offs from our uploaded notes and web sources.',
    terminalStatus: 'Researching... (Step 4 of 6 running)',
    searchesUsed: '4 / 8 web searches',
    stepsUsed: 'Step 4 / 6',
  },
  {
    id: 'sess-table-prd',
    folder: 'final-report',
    title: 'Summarize Tables & Diagrams into Study Guide',
    timeLabel: 'Yesterday',
    statusText: 'Completed · Exported Markdown',
    statusKind: 'done',
    badges: ['Tables & Figures', 'Exported', 'Completed'],
    promptTitle:
      'Turn our 24-page report, spreadsheets, and whiteboard diagrams into a cited study & briefing guide',
    narrativeLead:
      'Extracted key takeaways from 10 tables and 5 diagrams across your report and organized them into a clean Markdown document.',
    narrativeSub:
      'Shared with all 4 project members so everyone can click any claim and jump straight to the original page.',
    inlineEvents: [
      {
        code: '1 — TABLES & SPREADSHEETS READ',
        badge: '10 tables read',
        tone: 'emerald',
        title: 'Extracted every row and column from research-report.pdf',
        detail: 'Kept exact numbers intact and linked to Pages 11–14',
        meta: 'Pages 11–14 verified',
      },
      {
        code: '2 — DIAGRAMS DESCRIBED',
        badge: '5 figures indexed',
        tone: 'cyan',
        title: 'Read 5 architecture and workflow diagrams',
        detail: 'Made every label inside your uploaded images searchable',
        meta: 'Figures 1–5 verified',
      },
      {
        code: '3 — EXPORTED TO MARKDOWN',
        badge: 'Final v2',
        tone: 'emerald',
        title: 'Saved Final-Briefing-Guide.md to shared workspace',
        detail: 'Ready to download or share with your team',
        meta: 'Version 2 (Final)',
      },
    ],
    artifactFile: 'Final-Briefing-Guide.md',
    artifactTag: 'GUIDE · v2',
    artifactTitle: 'Complete Project Briefing & Table Summary',
    artifactSummary: 'Version 2 · Final · 6 verified page citations',
    artifactStats: { files: 3, added: 92, removed: 18, checks: '6/6 citations verified' },
    sourceRefs: ['research-report.pdf (p.11)', 'Table 3.1 (p.12)', 'system-overview.png (Fig.1)', 'project-plan-v2.pdf (p.1)'],
    terminalTool: 'Exporting Clean Markdown',
    terminalToolArgs: 'Format: Markdown with page links · Status: Complete',
    terminalPrompt:
      'Export finalized briefing guide with clickable page references for all 4 project teammates.',
    terminalStatus: 'Completed · 2/8 web searches used · 100% cited',
    searchesUsed: '2 / 8 web searches',
    stepsUsed: 'Step 6 / 6 (Done)',
  },
]

const COMPLETE_PROJECT_PILLARS = [
  {
    code: '01 // DEEP RESEARCH',
    title: 'Multi-Step Research Across Files & Web',
    summary:
      'Give it a big question and let it read your selected files, check your decision map, and run up to 8 live web searches—while you pause, steer, or resume anytime.',
    meta: 'Files + Decision Map + Live Web',
  },
  {
    code: '02 // CONTRADICTION ALERTS',
    title: 'Catches Conflicts Before They Cause Mistakes',
    summary:
      'When a new PDF or slide deck disagrees with something your team already decided, it highlights the exact page instead of silently overwriting your work.',
    meta: 'Automatic Page-Level Conflict Checks',
  },
  {
    code: '03 // ONE-CLICK REPORTS',
    title: 'Turn Chats into Cited Reports & Study Guides',
    summary:
      'Generate clean project plans, decision logs, and briefing reports where every section links back to the exact page or diagram that backs it up.',
    meta: 'Instant Markdown Export',
  },
  {
    code: '04 // BUILT FOR SMALL TEAMS',
    title: 'Share with up to 4 Teammates',
    summary:
      'Keep private solo notes or collaborate in shared project threads. If you ever use up your daily free questions, plug in your own API key in the browser with zero lockout.',
    meta: 'Solo or Team · Zero Lockout',
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
        <div className="section-header-row">
          <div className="section-header-copy">
            <h2 className="section-heading">
              Deep research that reads your files and writes cited reports.
            </h2>
            <p className="section-description">
              When a simple chat isn&apos;t enough, launch a multi-step research
              run that cross-checks your documents, spots contradictions, and
              drafts clean Markdown reports for your review.
            </p>
          </div>

          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={viewMode}
            onValueChange={(v) => {
              if (v === 'interactive' || v === 'skeleton') setViewMode(v)
            }}
            aria-label="Research preview mode"
            className="rounded-xl border border-border bg-card/85 p-1 backdrop-blur-xl"
          >
            <ToggleGroupItem value="interactive" className="text-xs px-3">
              Interactive Preview
            </ToggleGroupItem>
            <ToggleGroupItem value="skeleton" className="text-xs px-3">
              Layout Overview
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

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
            <div
              className="agent-skeleton-arrangement"
              data-agent-gui-slot="live-mount"
            >
              <div className="agent-skeleton-grid">
                <div className="agent-skeleton-window">
                  <div className="agent-skeleton-badge mono">
                    3-PANE RESEARCH WORKSPACE
                  </div>
                  <h3 className="agent-skeleton-title">
                    How the Deep Research workspace is organized
                  </h3>
                  <p className="agent-skeleton-copy">
                    Everything stays in one clear view so you can follow every
                    step from question to finished report.
                  </p>
                  <div className="agent-skeleton-wireframes">
                    <div className="skeleton-col">
                      <span className="mono">Left Column</span>
                      <strong>Your Research Runs</strong>
                      <small className="mono">
                        Switch between active and completed topics
                      </small>
                    </div>
                    <div className="skeleton-col">
                      <span className="mono">Center Column</span>
                      <strong>Step-by-Step Progress</strong>
                      <small className="mono">
                        See which files were checked and any conflicts found
                      </small>
                    </div>
                    <div className="skeleton-col">
                      <span className="mono">Right Column</span>
                      <strong>Generated Report &amp; Page Links</strong>
                      <small className="mono">
                        Review the draft and export to Markdown
                      </small>
                    </div>
                  </div>
                </div>

                <div className="agent-skeleton-terminal">
                  <div className="agent-skeleton-badge mono">
                    LIVE PROGRESS MONITOR
                  </div>
                  <p className="agent-skeleton-copy">
                    Shows which files and web sources are being checked in real
                    time, with one-click Pause and Resume controls.
                  </p>
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() => setViewMode('interactive')}
                  >
                    Back to Interactive Preview
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="agent-composite-canvas">
              {/* WINDOW 1: Main Desktop 3-Pane Session GUI */}
              <div
                className="agent-desktop-window"
                role="region"
                aria-label="Deep Research Interface"
              >
                <div className="agent-window-titlebar">
                  <div className="agent-window-dots" aria-hidden="true">
                    <span className="win-dot win-dot-red" />
                    <span className="win-dot win-dot-amber" />
                    <span className="win-dot win-dot-green" />
                  </div>

                  <div className="agent-workspace-tabs mono">
                    <span className="ws-tab">Files</span>
                    <span className="ws-tab">Decision Map</span>
                    <span className="ws-tab is-active">Deep Research · 3</span>
                  </div>

                  <div className="agent-command-search mono">
                    Search your files, notes, or decisions...
                  </div>

                  <div className="agent-titlebar-right">
                    <span className="agent-collab-pill mono">
                      4/4 Teammates · Shared
                    </span>
                    <span className="agent-feature-btn mono">
                      + Export Report
                    </span>
                  </div>
                </div>

                <div className="agent-window-body">
                  <div className="agent-icon-rail" aria-hidden="true">
                    <div className="rail-avatar">KC</div>
                    <span className="rail-dot is-active" />
                    <span className="rail-dot" />
                    <span className="rail-dot" />
                    <span className="rail-dot" />
                  </div>

                  <aside
                    className="agent-sessions-sidebar"
                    aria-label="Research Topics"
                  >
                    <div className="sessions-sidebar-header">
                      <span className="sessions-heading">Research Topics</span>
                      <span className="sessions-new-btn mono">+ New</span>
                    </div>

                    <div className="sessions-search-box mono">
                      Filter topics...
                    </div>

                    <div className="sessions-group-label mono">
                      ▾ Recent Runs
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

                    <div className="stream-steering-footer">
                      <div className="stream-quick-Write-pills">
                        <button
                          type="button"
                          className="stream-steer-pill mono"
                          onClick={() => setAgentPaused((p) => !p)}
                        >
                          {agentPaused
                            ? '▶ Resume Research'
                            : '⏸ Pause & Add Note'}
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
                          Plan: {credentialMode === 'managed' ? 'Included Daily' : 'Own API Key'}
                        </button>
                      </div>

                      <div className="stream-composer-box">
                        <span className="composer-placeholder">
                          Ask a follow-up question or tag a file...
                        </span>
                        <div className="composer-meta-row mono">
                          <span>⊞ {activeSession.folder}</span>
                          <span>
                            {credentialMode === 'managed'
                              ? 'Included Daily Plan'
                              : 'Own Browser Key'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <aside
                    className="agent-artifact-sidebar"
                    aria-label="Generated Report and Page Citations"
                  >
                    <div className="artifact-sidebar-tabs mono">
                      <span className="art-tab is-active">Draft Report</span>
                      <span className="art-tab">{activeSession.artifactFile}</span>
                    </div>

                    <div className="artifact-preview-card">
                      <div className="artifact-badge-row mono">
                        <span className="artifact-tag-pill">
                          {activeSession.artifactTag}
                        </span>
                        <span className="artifact-status-pill">
                          100% cited
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
                          +{activeSession.artifactStats.added} lines
                        </span>
                        <span className="diff-check">
                          ✓ {activeSession.artifactStats.checks}
                        </span>
                      </div>

                      <div className="artifact-refs-box">
                        <div className="artifact-refs-label mono">
                          VERIFIED PAGE LINKS ({activeSession.sourceRefs.length})
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

              {/* WINDOW 2: Overlapping Bottom-Right Live Progress Card */}
              <div
                className="agent-terminal-window"
                role="region"
                aria-label="Live Research Progress"
              >
                <div className="terminal-titlebar">
                  <div className="agent-window-dots" aria-hidden="true">
                    <span className="win-dot win-dot-red" />
                    <span className="win-dot win-dot-amber" />
                    <span className="win-dot win-dot-green" />
                  </div>
                  <span className="terminal-title mono">
                    Live Research Progress
                  </span>
                </div>

                <div className="terminal-body mono">
                  <div className="terminal-welcome">
                    <span className="term-accent-violet">
                      Deep Research Assistant
                    </span>
                  </div>
                  <div className="terminal-subwelcome">
                    Reads your selected files, checks for contradictions, and
                    writes a cited report you can export in one click.
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
                        ? 'Paused — click Resume whenever you are ready'
                        : activeSession.terminalStatus}
                    </span>
                  </div>

                  <div className="terminal-status-line">
                    <span>
                      {activeSession.searchesUsed} ·{' '}
                      <span className="term-green">● Every claim cited</span>
                    </span>
                    <span className="term-cloud-pill">
                      ☁ Auto-Saved
                    </span>
                  </div>

                  <div className="terminal-footer-bar">
                    <span>
                      {agentPaused
                        ? 'Research paused · Type to add instructions'
                        : 'Click any topic on the left to switch examples'}
                    </span>
                    <button
                      type="button"
                      className="terminal-pause-btn mono"
                      onClick={() => setAgentPaused((p) => !p)}
                      aria-label={
                        agentPaused ? 'Resume research' : 'Pause research'
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
            Click any research topic on the left of the window above to see how
            Knowledge Cartographer handles conflicts, web comparisons, and
            tables.
          </span>
        </div>

        <div
          className="agent-pillars-grid"
          aria-label="Key Highlights"
        >
          {COMPLETE_PROJECT_PILLARS.map((pillar) => (
            <article key={pillar.code} className="agent-pillar-card">
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
