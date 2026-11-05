import React, { useState, useMemo, useEffect, useCallback } from 'react'
import {
  DECISION_CLUSTERS,
  DECISION_GRAPH_EDGES,
  DECISION_GRAPH_NODES,
  type DecisionEntityKind,
  type DecisionGraphNode,
  type RelationshipType,
} from '../../data/landingData'
import { PatternDotGrid } from '../patterns/GraphPatterns'

const KIND_STYLES: Record<
  DecisionEntityKind,
  { stroke: string; badgeBg: string; label: string }
> = {
  decision: {
    stroke: '#af63ff',
    badgeBg: 'rgba(175, 99, 255, 0.16)',
    label: 'Decision',
  },
  replaced: {
    stroke: '#cc9cff',
    badgeBg: 'rgba(204, 156, 255, 0.16)',
    label: 'Replaced decision',
  },
  document: {
    stroke: '#a4a1ff',
    badgeBg: 'rgba(164, 161, 255, 0.16)',
    label: 'Source file',
  },
  evidence: {
    stroke: '#14f194',
    badgeBg: 'rgba(20, 241, 148, 0.16)',
    label: 'Evidence passage',
  },
  component: {
    stroke: '#cdc2ed',
    badgeBg: 'rgba(205, 194, 237, 0.16)',
    label: 'System component',
  },
  artifact: {
    stroke: '#f5f7ff',
    badgeBg: 'rgba(245, 247, 255, 0.16)',
    label: 'Generated document',
  },
  question: {
    stroke: '#fbbf24',
    badgeBg: 'rgba(251, 191, 36, 0.16)',
    label: 'Open question',
  },
}

const RELATIONSHIP_STYLES: Record<
  RelationshipType,
  { color: string; dash?: string; markerId: string }
> = {
  'replaces': {
    color: '#cc9cff',
    dash: '6 4',
    markerId: 'arrow-violet',
  },
  'backed by': {
    color: '#14f194',
    markerId: 'arrow-emerald',
  },
  'cites': {
    color: '#af63ff',
    markerId: 'arrow-cyan',
  },
  'from': {
    color: '#a4a1ff',
    dash: '3 3',
    markerId: 'arrow-ice',
  },
  'depends on': {
    color: '#fbbf24',
    dash: '5 3',
    markerId: 'arrow-amber',
  },
  'references': {
    color: '#cdc2ed',
    markerId: 'arrow-cyan',
  },
  'informs': {
    color: '#cc9cff',
    dash: '4 3',
    markerId: 'arrow-violet',
  },
}

export function KnowledgeGraphSection(): React.ReactElement {
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(false)

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)
    const handler = (e: MediaQueryListEvent): void => {
      setPrefersReducedMotion(e.matches)
    }
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  const nodeLookup = useMemo(() => {
    const map = new Map<string, DecisionGraphNode>()
    DECISION_GRAPH_NODES.forEach((n) => map.set(n.id, n))
    return map
  }, [])

  const activeNodeId = hoveredNodeId || selectedNodeId
  const activeNode = useMemo(
    () => (activeNodeId ? nodeLookup.get(activeNodeId) : null) || null,
    [activeNodeId, nodeLookup],
  )

  // Compute connected nodes for highlighting
  const connectedNodeIds = useMemo(() => {
    if (!activeNodeId) return new Set<string>()
    const set = new Set<string>()
    set.add(activeNodeId)
    DECISION_GRAPH_EDGES.forEach((edge) => {
      if (edge.from === activeNodeId) set.add(edge.to)
      if (edge.to === activeNodeId) set.add(edge.from)
    })
    return set
  }, [activeNodeId])

  // Compute evidence trail for decision nodes
  const evidenceTrailNodeIds = useMemo(() => {
    if (!activeNode || activeNode.kind !== 'decision') return null
    const trail = new Set<string>()
    trail.add(activeNode.id)
    
    // Find evidence and source nodes backing this decision
    DECISION_GRAPH_EDGES.forEach((edge) => {
      if (edge.from === activeNode.id) {
        const targetNode = nodeLookup.get(edge.to)
        if (targetNode && (targetNode.kind === 'evidence' || targetNode.kind === 'document')) {
          trail.add(edge.to)
        }
      }
    })
    
    return trail
  }, [activeNode, nodeLookup])

  // Get related relationships for overlay card
  const relatedRelationships = useMemo(() => {
    if (!activeNode) return []
    return DECISION_GRAPH_EDGES.filter(
      (e) => e.from === activeNode.id || e.to === activeNode.id,
    ).map((edge) => {
      const isOutgoing = edge.from === activeNode.id
      const otherId = isOutgoing ? edge.to : edge.from
      const otherNode = nodeLookup.get(otherId)
      return {
        edge,
        isOutgoing,
        otherNode,
      }
    })
  }, [activeNode, nodeLookup])

  const handleSelectNode = useCallback((nodeId: string): void => {
    setSelectedNodeId(nodeId)
  }, [])

  const handleCloseOverlay = useCallback((): void => {
    setSelectedNodeId(null)
  }, [])

  // Handle keyboard navigation for overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && selectedNodeId) {
        handleCloseOverlay()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeId, handleCloseOverlay])

  return (
    <section id="decision-graph" className="knowledge-graph-section">
      <div className="container">
        <div className="section-header-row" data-reveal="up">
          <div className="section-header-copy">
            <h2 className="section-heading">
              Explore the decision graph.
            </h2>
            <p className="section-description">
              Your project's decisions, evidence, and open questions live across dozens of files. 
              Knowledge Cartographer connects them into a single map you can explore.
            </p>
          </div>
        </div>

        {/* Transformation Toggle */}
        <div className="kg-toggle-wrapper" data-reveal="up">
          <div className="kg-toggle-control" role="group" aria-label="Toggle between scattered files and connected map view">
            <button
              type="button"
              className={`kg-toggle-btn ${!isConnected ? 'is-active' : ''}`}
              onClick={() => setIsConnected(false)}
              aria-pressed={!isConnected}
            >
              <span className="kg-toggle-icon kg-toggle-scattered" aria-hidden="true" />
              Scattered files
            </button>
            <button
              type="button"
              className={`kg-toggle-btn ${isConnected ? 'is-active' : ''}`}
              onClick={() => setIsConnected(true)}
              aria-pressed={isConnected}
            >
              <span className="kg-toggle-icon kg-toggle-connected" aria-hidden="true" />
              Connected map
            </button>
          </div>
        </div>

        {/* Graph Visualization */}
        <div className="kg-graph-container" data-reveal="scale">
          <PatternDotGrid id="kg-graph-dots" />

          <svg
            className="kg-graph-svg"
            viewBox="16 14 824 414"
            role="img"
            aria-label="Interactive knowledge graph showing decisions, evidence, and questions"
          >
            <defs>
              <marker
                id="arrow-cyan"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#af63ff" />
              </marker>
              <marker
                id="arrow-violet"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#cc9cff" />
              </marker>
              <marker
                id="arrow-emerald"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#14f194" />
              </marker>
              <marker
                id="arrow-ice"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#a4a1ff" />
              </marker>
              <marker
                id="arrow-amber"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#fbbf24" />
              </marker>
            </defs>

            {/* Cluster Hulls */}
            {DECISION_CLUSTERS.map((hull) => (
              <g key={hull.id} className="kg-cluster-hull">
                <rect
                  x={hull.x}
                  y={hull.y}
                  width={hull.width}
                  height={hull.height}
                  rx={12}
                  fill={hull.color}
                  stroke={
                    isConnected
                      ? 'rgba(205, 194, 237, 0.16)'
                      : 'rgba(205, 194, 237, 0.26)'
                  }
                  strokeDasharray={!isConnected ? '5 4' : undefined}
                />
                <text
                  x={hull.x + 14}
                  y={hull.y + 20}
                  className="kg-cluster-label"
                >
                  {hull.label}
                </text>
              </g>
            ))}

            {/* Edges - only rendered when connected */}
            {isConnected && DECISION_GRAPH_EDGES.map((edge, idx) => {
              const src = nodeLookup.get(edge.from)
              const dst = nodeLookup.get(edge.to)
              if (!src || !dst) return null

              const relStyle = RELATIONSHIP_STYLES[edge.relationship]
              const isHighlighted = activeNodeId
                ? connectedNodeIds.has(edge.from) && connectedNodeIds.has(edge.to)
                : false
              const isTrailEdge = evidenceTrailNodeIds
                ? evidenceTrailNodeIds.has(edge.from) && evidenceTrailNodeIds.has(edge.to)
                : false

              const offset = edge.curveOffset ?? -16
              const midX = (src.x + dst.x) / 2
              const midY = (src.y + dst.y) / 2 + offset
              const pathD = `M ${src.x} ${src.y} Q ${midX} ${midY} ${dst.x} ${dst.y}`
              const labelY = offset >= 0 ? midY + 14 : midY - 8

              return (
                <g
                  key={edge.id}
                  className={`kg-edge-group ${isHighlighted || isTrailEdge ? 'is-highlighted' : 'is-dimmed'}`}
                  style={
                    {
                      '--edge-idx': idx,
                    } as React.CSSProperties
                  }
                >
                  {/* Wide transparent hit target */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={16}
                  />

                  {/* Base edge line */}
                  <path
                    d={pathD}
                    pathLength={100}
                    fill="none"
                    className={`kg-edge-line ${!prefersReducedMotion ? 'kg-edge-animate' : ''}`}
                    stroke={relStyle.color}
                    strokeWidth={isTrailEdge ? 2.4 : isHighlighted ? 2 : 1.25}
                    strokeOpacity={isTrailEdge ? 1 : isHighlighted ? 0.9 : 0.4}
                    strokeDasharray={relStyle.dash}
                    markerEnd={`url(#${relStyle.markerId})`}
                  />

                  {/* Traveling light pulse on highlighted edges */}
                  {(isHighlighted || isTrailEdge) && !prefersReducedMotion && (
                    <path
                      d={pathD}
                      pathLength={100}
                      fill="none"
                      className="kg-edge-pulse"
                      stroke="#f8fafc"
                      strokeWidth={2.2}
                      strokeLinecap="round"
                    />
                  )}

                  {/* Relationship label pill */}
                  <g transform={`translate(${midX}, ${labelY})`}>
                    <rect
                      x={-48}
                      y={-10}
                      width={96}
                      height={14}
                      rx={4}
                      fill="rgba(7, 10, 18, 0.88)"
                      stroke={
                        isHighlighted || isTrailEdge
                          ? relStyle.color
                          : 'rgba(148, 169, 201, 0.22)'
                      }
                      strokeWidth={isHighlighted || isTrailEdge ? 1 : 0.7}
                    />
                    <text
                      textAnchor="middle"
                      y={2}
                      className={`kg-edge-label ${isHighlighted || isTrailEdge ? 'is-highlighted' : ''}`}
                      style={{
                        fill: isHighlighted || isTrailEdge ? '#f0f6fc' : '#9baece',
                      }}
                    >
                      {edge.relationship}
                    </text>
                  </g>
                </g>
              )
            })}

            {/* Nodes */}
            {DECISION_GRAPH_NODES.map((node, idx) => {
              const style = KIND_STYLES[node.kind]
              const isSelected = node.id === selectedNodeId
              const isConnectedNode = connectedNodeIds.has(node.id)
              const isTrailNode = evidenceTrailNodeIds?.has(node.id) ?? false

              return (
                <g
                  key={node.id}
                  data-interactive="true"
                  transform={`translate(${node.x}, ${node.y})`}
                  style={
                    {
                      '--node-idx': idx,
                    } as React.CSSProperties
                  }
                  className={`kg-node-item ${isSelected ? 'is-selected' : ''} ${isConnectedNode || isTrailNode ? 'is-connected' : activeNodeId ? 'is-dimmed' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.title} (${style.label})`}
                  aria-pressed={isSelected}
                  onClick={() => handleSelectNode(node.id)}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  onFocus={() => setHoveredNodeId(node.id)}
                  onBlur={() => setHoveredNodeId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleSelectNode(node.id)
                    }
                  }}
                >
                  {/* Hit target */}
                  <circle r="35" fill="transparent" />

                  {/* Selection / Trail halo */}
                  {(isSelected || isTrailNode) && (
                    <circle
                      r={isSelected ? 30 : 26}
                      fill={isSelected ? style.badgeBg : 'transparent'}
                      stroke={style.stroke}
                      strokeOpacity={isSelected ? 0.9 : 0.4}
                      strokeWidth={isSelected ? 2 : 1.2}
                      strokeDasharray={isSelected ? undefined : '4 3'}
                      className="kg-node-halo"
                    />
                  )}

                  {/* Core node circle */}
                  <circle
                    r="22"
                    fill="#0c0b0e"
                    stroke={isSelected ? '#f5f7ff' : style.stroke}
                    strokeWidth={isSelected ? 2.5 : isConnectedNode || isTrailNode ? 1.8 : 1.2}
                  />

                  {/* Node label */}
                  <text
                    y="4"
                    textAnchor="middle"
                    className="kg-node-label"
                  >
                    {node.shortTitle}
                  </text>

                  {/* Caption below node */}
                  <g transform="translate(0, 36)">
                    <rect
                      x={-60}
                      y={-10}
                      width={120}
                      height={16}
                      rx={4}
                      fill="rgba(12, 11, 14, 0.88)"
                    />
                    <text
                      y={2}
                      textAnchor="middle"
                      className={`kg-node-caption ${isSelected || isTrailNode ? 'is-active' : ''}`}
                    >
                      {style.label}
                    </text>
                  </g>
                </g>
              )
            })}
          </svg>

          {/* Simple Legend */}
          <div className="kg-legend">
            <div className="kg-legend-item">
              <span className="kg-legend-dot kg-dot-cyan" aria-hidden="true" />
              <span className="kg-legend-text">Decisions</span>
            </div>
            <div className="kg-legend-item">
              <span className="kg-legend-dot kg-dot-violet" aria-hidden="true" />
              <span className="kg-legend-text">Replaced decisions</span>
            </div>
            <div className="kg-legend-item">
              <span className="kg-legend-dot kg-dot-green" aria-hidden="true" />
              <span className="kg-legend-text">Source files and evidence</span>
            </div>
            <div className="kg-legend-item">
              <span className="kg-legend-dot kg-dot-amber" aria-hidden="true" />
              <span className="kg-legend-text">Open questions</span>
            </div>
          </div>
        </div>

        {/* Overlay Card */}
        {activeNode && (
          <div
            className="kg-overlay-card"
            role="dialog"
            aria-labelledby="kg-overlay-title"
            aria-describedby="kg-overlay-summary"
          >
            <div className="kg-overlay-header">
              <span
                className="kg-overlay-badge"
                style={{
                  color: KIND_STYLES[activeNode.kind].stroke,
                  background: KIND_STYLES[activeNode.kind].badgeBg,
                }}
              >
                {KIND_STYLES[activeNode.kind].label}
              </span>
              <button
                type="button"
                className="kg-overlay-close"
                onClick={handleCloseOverlay}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <h3 id="kg-overlay-title" className="kg-overlay-title">
              {activeNode.title}
            </h3>
            <p id="kg-overlay-summary" className="kg-overlay-summary">
              {activeNode.summary}
            </p>

            {/* Evidence trail narrative for decisions */}
            {activeNode.kind === 'decision' && relatedRelationships.length > 0 && (
              <div className="kg-overlay-trail">
                {relatedRelationships
                  .filter((r) => r.otherNode && (r.otherNode.kind === 'evidence' || r.otherNode.kind === 'document'))
                  .slice(0, 2)
                  .map(({ edge, otherNode }) => (
                    <p key={edge.id} className="kg-trail-text">
                      This decision is {edge.relationship}{' '}
                      <button
                        type="button"
                        className="kg-trail-link"
                        onClick={() => otherNode && handleSelectNode(otherNode.id)}
                      >
                        {otherNode?.shortTitle}
                      </button>
                      .
                    </p>
                  ))}
              </div>
            )}

            {/* Connections list */}
            {relatedRelationships.length > 0 && (
              <div className="kg-overlay-connections">
                <div className="kg-connections-label">Connected to:</div>
                <div className="kg-connections-list">
                  {relatedRelationships.slice(0, 5).map(({ edge, isOutgoing, otherNode }) => {
                    if (!otherNode) return null
                    return (
                      <button
                        key={edge.id}
                        type="button"
                        className="kg-connection-chip"
                        onClick={() => handleSelectNode(otherNode.id)}
                      >
                        <span
                          className="kg-connection-rel"
                          style={{ color: RELATIONSHIP_STYLES[edge.relationship].color }}
                        >
                          {isOutgoing ? `${edge.relationship} →` : `← ${edge.relationship}`}
                        </span>
                        <span className="kg-connection-title">{otherNode.shortTitle}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Three Plain-Language Takeaways */}
        <div className="kg-takeaways" data-reveal="up">
          <div className="kg-takeaway">
            <div className="kg-takeaway-icon" aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="8" cy="16" r="6" stroke="#af63ff" strokeWidth="2" />
                <line x1="14" y1="16" x2="24" y2="16" stroke="#14f194" strokeWidth="2" />
                <rect x="22" y="12" width="8" height="8" rx="1" stroke="#a4a1ff" strokeWidth="2" fill="none" />
              </svg>
            </div>
            <p className="kg-takeaway-text">
              Every decision traces back to the exact page that proves it.
            </p>
          </div>
          <div className="kg-takeaway">
            <div className="kg-takeaway-icon" aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="10" cy="16" r="6" stroke="#cc9cff" strokeWidth="2" strokeDasharray="3 2" />
                <path d="M16 16L22 16" stroke="#cc9cff" strokeWidth="2" markerEnd="url(#arrow-violet-takeaway)" />
                <circle cx="24" cy="16" r="6" stroke="#af63ff" strokeWidth="2" />
                <defs>
                  <marker id="arrow-violet-takeaway" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#cc9cff" />
                  </marker>
                </defs>
              </svg>
            </div>
            <p className="kg-takeaway-text">
              See which plans are current and which were replaced.
            </p>
          </div>
          <div className="kg-takeaway">
            <div className="kg-takeaway-icon" aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="6" stroke="#fbbf24" strokeWidth="2" />
                <text x="16" y="20" textAnchor="middle" fill="#fbbf24" fontSize="12" fontWeight="bold">?</text>
              </svg>
            </div>
            <p className="kg-takeaway-text">
              Open questions stay visible so nothing falls through the cracks.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
