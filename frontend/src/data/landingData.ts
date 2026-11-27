// Section A: Hero Neural Graph Data
export type ClusterId =
  | 'ingestion'
  | 'storage'
  | 'retrieval'
  | 'decisions'
  | 'synthesis'

export interface HeroCluster {
  id: ClusterId
  label: string
  code: string
  accent: 'cyan' | 'ice' | 'violet'
  summary: string
}

export interface HeroNode {
  id: string
  label: string
  shortLabel: string
  cluster: ClusterId
  x: number
  y: number
  r: number
  importance: 'core' | 'primary' | 'secondary'
  kind: string
  metric: string
  detail: string
  evidenceRef: string
}

export interface HeroEdge {
  id: string
  from: string
  to: string
  relation: 'flows_to' | 'indexes' | 'supersedes' | 'cites' | 'gates'
  curveOffset?: number
}

export const HERO_CLUSTERS: HeroCluster[] = [
  {
    id: 'ingestion',
    label: 'Docling & Vision',
    code: 'CL-01 // INGEST',
    accent: 'cyan',
    summary:
      'MIME magic-byte validation, Docling lean parsing, TableFormer compact triplets, and Gemini descriptions for diagrams.',
  },
  {
    id: 'storage',
    label: 'Partitioned Postgres',
    code: 'CL-02 // STORAGE',
    accent: 'ice',
    summary:
      'LIST-partitioned chunks per project_uuid, SHA-256 doc_hash deduplication, and FOR UPDATE SKIP LOCKED worker leases.',
  },
  {
    id: 'retrieval',
    label: 'Hybrid RRF Search',
    code: 'CL-03 // RETRIEVAL',
    accent: 'cyan',
    summary:
      '768-dim gemini-embedding-001 HNSW cosine scan fused with BM25 pg_textsearch via Reciprocal Rank Fusion (k=60).',
  },
  {
    id: 'decisions',
    label: 'Decision Graph',
    code: 'CL-04 // GRAPH',
    accent: 'violet',
    summary:
      'Decision, Alternative, and Question nodes with full or partial SUPERSEDES scope and upload conflict checks.',
  },
  {
    id: 'synthesis',
    label: 'Cited Chat & ADRs',
    code: 'CL-05 // SYNTHESIS',
    accent: 'ice',
    summary:
      'Per-conversation source scope checklists, citation validation, budgeted deep research, and versioned ADR exports.',
  },
]

export const HERO_NODES: HeroNode[] = [
  {
    id: 'n-docling',
    label: 'Docling Lean Converter',
    shortLabel: 'Docling Parser',
    cluster: 'ingestion',
    x: 158,
    y: 196,
    r: 13,
    importance: 'core',
    kind: 'PARSER_ENGINE',
    metric: '<=50 pages · <=10 MB',
    detail:
      'Converts PDF, DOCX, PPTX, XLSX, HTML & Markdown into structured ParsedDoc elements with TOC skipping.',
    evidenceRef: 'src/kc/modules/ingestion/parsers/parse.py',
  },
  {
    id: 'n-mime',
    label: 'MIME & SHA-256 Gate',
    shortLabel: 'SHA-256 Gate',
    cluster: 'ingestion',
    x: 92,
    y: 262,
    r: 8.5,
    importance: 'secondary',
    kind: 'VALIDATION_GUARD',
    metric: 'UNIQUE(project_uuid, doc_hash)',
    detail:
      'Verifies file signature bytes before storage upload and deduplicates identical documents per project.',
    evidenceRef: 'src/kc/modules/ingestion/parsers/types.py',
  },
  {
    id: 'n-vision',
    label: 'Gemini Diagram Describer',
    shortLabel: 'Diagram Vision',
    cluster: 'ingestion',
    x: 134,
    y: 122,
    r: 10,
    importance: 'primary',
    kind: 'VISION_EXTRACTOR',
    metric: 'max 10 figures / doc',
    detail:
      'Classifies architecture_diagram, table, screenshot or photo and writes searchable semantic descriptions.',
    evidenceRef: 'src/kc/modules/ingestion/images.py',
  },
  {
    id: 'n-chunker',
    label: 'HybridChunker & Triplet Tables',
    shortLabel: 'HybridChunker',
    cluster: 'ingestion',
    x: 238,
    y: 148,
    r: 11,
    importance: 'primary',
    kind: 'CHUNK_BUILDER',
    metric: 'D007 compact triplets',
    detail:
      'Serializes table rows into compact triplets for embed_text while keeping the full JSON matrix in payload.',
    evidenceRef: 'migrations/versions/c1a000000002_documents_graph_chunks.py',
  },
  {
    id: 'n-ocr',
    label: 'Selective RapidOCR Branch',
    shortLabel: 'RapidOCR Fallback',
    cluster: 'ingestion',
    x: 202,
    y: 268,
    r: 8,
    importance: 'secondary',
    kind: 'OCR_STAGE',
    metric: 'Scanned PDFs only',
    detail:
      'Detects missing text layers and invokes RapidOCR only when native PDF text extraction is absent.',
    evidenceRef: 'KC_Implementation_Tracker.xlsx // T024',
  },
  {
    id: 'n-partitions',
    label: 'Postgres LIST Partitions',
    shortLabel: 'LIST Partitions',
    cluster: 'storage',
    x: 272,
    y: 338,
    r: 12.5,
    importance: 'core',
    kind: 'TENANT_ISOLATION',
    metric: 'PARTITION BY LIST (project_uuid)',
    detail:
      'Database trigger creates an isolated chunks partition on project creation, enforcing composite tenant foreign keys.',
    evidenceRef: 'db_schema.md // chunks',
  },
  {
    id: 'n-jobqueue',
    label: 'SKIP LOCKED Lease Queue',
    shortLabel: 'Job Queue',
    cluster: 'storage',
    x: 170,
    y: 360,
    r: 9.5,
    importance: 'primary',
    kind: 'WORKER_QUEUE',
    metric: 'lease 900s · max_attempts 3',
    detail:
      'Claims queued ingestion jobs via FOR UPDATE SKIP LOCKED with heartbeat renewal and Cloud Run Job dispatch.',
    evidenceRef: 'src/kc/worker/runner.py',
  },
  {
    id: 'n-objectstore',
    label: 'S3 / GCS Object Store',
    shortLabel: 'Object Store',
    cluster: 'storage',
    x: 226,
    y: 408,
    r: 8.5,
    importance: 'secondary',
    kind: 'BLOB_STORAGE',
    metric: '{project_uuid}/{doc_uuid}',
    detail:
      'Stores raw uploads, parsed JSON caches, and extracted figure crops via MinIO locally and GCS in production.',
    evidenceRef: 'src/kc/core/storage.py',
  },
  {
    id: 'n-quotas',
    label: 'Atomic Quota & Device Guard',
    shortLabel: 'Quota Ledger',
    cluster: 'storage',
    x: 348,
    y: 420,
    r: 9,
    importance: 'secondary',
    kind: 'USAGE_METER',
    metric: '3 accounts/device/day',
    detail:
      'Enforces IST daily device sign-in caps with pg_advisory_xact_lock and tracks llm_call, doc_upload & web_search.',
    evidenceRef: 'main.py // session_start',
  },
  {
    id: 'n-embedder',
    label: 'gemini-embedding-001 (768d)',
    shortLabel: '768d Embedder',
    cluster: 'retrieval',
    x: 328,
    y: 108,
    r: 11.5,
    importance: 'primary',
    kind: 'VECTOR_ENCODER',
    metric: '768 dims · L2 normalized',
    detail:
      'Encodes chunks with RETRIEVAL_DOCUMENT and queries with RETRIEVAL_QUERY at bounded concurrency 8.',
    evidenceRef: 'src/kc/modules/ingestion/embedder.py',
  },
  {
    id: 'n-rrf',
    label: 'Hybrid RRF Fusion Core',
    shortLabel: 'Hybrid RRF (k=60)',
    cluster: 'retrieval',
    x: 392,
    y: 214,
    r: 15,
    importance: 'core',
    kind: 'RETRIEVAL_HUB',
    metric: 'RRF k=60 · HNSW + BM25',
    detail:
      'Combines dense HNSW cosine similarity with BM25 lexical matching inside the conversations allowed source_scope.',
    evidenceRef: 'KC_Implementation_Tracker.xlsx // T037',
  },
  {
    id: 'n-bm25',
    label: 'BM25 pg_textsearch Index',
    shortLabel: 'BM25 Lexical',
    cluster: 'retrieval',
    x: 434,
    y: 104,
    r: 10,
    importance: 'primary',
    kind: 'LEXICAL_INDEX',
    metric: 'Exact decision & table terms',
    detail:
      'Catches exact identifiers like D016, error codes, and column headers that dense embeddings alone smooth over.',
    evidenceRef: 'db_schema.md // KEYWORD_ENGINE=bm25',
  },
  {
    id: 'n-scope',
    label: 'Conversation Source Scope Filter',
    shortLabel: 'Source Scope',
    cluster: 'retrieval',
    x: 334,
    y: 262,
    r: 10.5,
    importance: 'primary',
    kind: 'SCOPE_FILTER',
    metric: 'conversation_excluded_sources',
    detail:
      'Excludes unticked documents before vector/BM25 retrieval and blocks out-of-scope nodes in graph read tools.',
    evidenceRef: 'db_schema.md // conversation_excluded_sources',
  },
  {
    id: 'n-gateway',
    label: 'Human-Approved Graph Gateway',
    shortLabel: 'Approval Gateway',
    cluster: 'decisions',
    x: 528,
    y: 160,
    r: 13.5,
    importance: 'core',
    kind: 'GRAPH_GATEWAY',
    metric: 'Human approval required',
    detail:
      'Deduplicates proposed nodes via alias lookup + top-3 embedding similarity and writes to graph_changes in one tx.',
    evidenceRef: 'db_schema.md // nodes, edges, graph_changes',
  },
  {
    id: 'n-d016',
    label: 'Decision D016: VM Postgres',
    shortLabel: 'Node D016',
    cluster: 'decisions',
    x: 622,
    y: 128,
    r: 10,
    importance: 'primary',
    kind: 'DECISION_NODE',
    metric: 'SUPERSEDES D015 (partial)',
    detail:
      'Agreed architecture node: run Postgres + pgvector + pg_textsearch on e2-medium VM, superseding managed DB cost.',
    evidenceRef: 'KC_Implementation_Tracker.xlsx // T086',
  },
  {
    id: 'n-conflict',
    label: 'Upload Conflict Detector',
    shortLabel: 'Conflict Check',
    cluster: 'decisions',
    x: 486,
    y: 278,
    r: 10.5,
    importance: 'primary',
    kind: 'CONFLICT_FLAGGER',
    metric: 'Non-destructive flag',
    detail:
      'Compares claims in newly uploaded documents against agreed Decision nodes and surfaces contradictions for review.',
    evidenceRef: 'KC_Implementation_Tracker.xlsx // T100',
  },
  {
    id: 'n-neo4j',
    label: 'Neo4j Aura Sync Worker',
    shortLabel: 'Neo4j Sync',
    cluster: 'decisions',
    x: 650,
    y: 222,
    r: 9.5,
    importance: 'secondary',
    kind: 'GRAPH_REPLICA',
    metric: 'graph_sync_state replay',
    detail:
      'Applies ordered graph_changes from Postgres to Neo4j idempotently with full replay recovery on instance resume.',
    evidenceRef: 'db_schema.md // graph_sync_state',
  },
  {
    id: 'n-chat',
    label: 'SSE Grounded Chat & Validator',
    shortLabel: 'Cited SSE Chat',
    cluster: 'synthesis',
    x: 564,
    y: 334,
    r: 13,
    importance: 'core',
    kind: 'CITATION_ENGINE',
    metric: 'Inline [chunk_id] verified',
    detail:
      'Streams grounded answers and strips any citation not retrieved in the current turn or outside source_scope.',
    evidenceRef: 'db_schema.md // messages, message_sources',
  },
  {
    id: 'n-research',
    label: 'Budgeted Deep Research',
    shortLabel: 'Deep Research',
    cluster: 'synthesis',
    x: 658,
    y: 318,
    r: 9.5,
    importance: 'primary',
    kind: 'RESEARCH_RUNNER',
    metric: 'search_budget <= 8 / run',
    detail:
      'Executes multi-step research with Vertex Grounding or SerpApi, 60s heartbeat leases, and pause/resume.',
    evidenceRef: 'db_schema.md // research_runs',
  },
  {
    id: 'n-artifacts',
    label: 'Versioned ADR & Plan Artifacts',
    shortLabel: 'ADR Artifacts',
    cluster: 'synthesis',
    x: 484,
    y: 396,
    r: 11,
    importance: 'primary',
    kind: 'ARTIFACT_GENERATOR',
    metric: 'artifact_versions + source_refs',
    detail:
      'Synthesizes architecture_plan, adr, prd, and report artifacts with immutable version history and resolvable citations.',
    evidenceRef: 'db_schema.md // artifacts, artifact_versions',
  },
  {
    id: 'n-byok',
    label: 'Explicit BYOK Mode Switch',
    shortLabel: 'BYOK Mode',
    cluster: 'synthesis',
    x: 602,
    y: 406,
    r: 8.5,
    importance: 'secondary',
    kind: 'CREDENTIAL_MODE',
    metric: 'mode: managed | byok',
    detail:
      'Lets users continue with a browser-stored API key when managed quota is exhausted—never logged, zero silent fallback.',
    evidenceRef: 'db_schema.md // messages.mode',
  },
]

export const HERO_EDGES: HeroEdge[] = [
  { id: 'e01', from: 'n-mime', to: 'n-docling', relation: 'flows_to' },
  { id: 'e02', from: 'n-docling', to: 'n-vision', relation: 'flows_to' },
  { id: 'e03', from: 'n-docling', to: 'n-chunker', relation: 'flows_to' },
  { id: 'e04', from: 'n-docling', to: 'n-ocr', relation: 'flows_to' },
  { id: 'e05', from: 'n-vision', to: 'n-chunker', relation: 'flows_to' },
  { id: 'e06', from: 'n-ocr', to: 'n-chunker', relation: 'flows_to' },
  { id: 'e07', from: 'n-mime', to: 'n-jobqueue', relation: 'gates' },
  { id: 'e08', from: 'n-jobqueue', to: 'n-docling', relation: 'flows_to' },
  { id: 'e09', from: 'n-jobqueue', to: 'n-objectstore', relation: 'flows_to' },
  { id: 'e10', from: 'n-objectstore', to: 'n-partitions', relation: 'flows_to' },
  { id: 'e11', from: 'n-chunker', to: 'n-embedder', relation: 'flows_to' },
  { id: 'e12', from: 'n-chunker', to: 'n-partitions', relation: 'indexes' },
  { id: 'e13', from: 'n-embedder', to: 'n-rrf', relation: 'indexes' },
  { id: 'e14', from: 'n-bm25', to: 'n-rrf', relation: 'indexes' },
  { id: 'e15', from: 'n-partitions', to: 'n-scope', relation: 'gates' },
  { id: 'e16', from: 'n-scope', to: 'n-rrf', relation: 'gates' },
  { id: 'e17', from: 'n-rrf', to: 'n-gateway', relation: 'cites' },
  { id: 'e18', from: 'n-rrf', to: 'n-conflict', relation: 'cites' },
  { id: 'e19', from: 'n-rrf', to: 'n-chat', relation: 'cites' },
  { id: 'e20', from: 'n-gateway', to: 'n-d016', relation: 'supersedes' },
  { id: 'e21', from: 'n-gateway', to: 'n-neo4j', relation: 'flows_to' },
  { id: 'e22', from: 'n-conflict', to: 'n-gateway', relation: 'gates' },
  { id: 'e23', from: 'n-d016', to: 'n-neo4j', relation: 'flows_to' },
  { id: 'e24', from: 'n-d016', to: 'n-chat', relation: 'cites' },
  { id: 'e25', from: 'n-chat', to: 'n-artifacts', relation: 'flows_to' },
  { id: 'e26', from: 'n-chat', to: 'n-research', relation: 'flows_to' },
  { id: 'e27', from: 'n-chat', to: 'n-byok', relation: 'gates' },
  { id: 'e28', from: 'n-quotas', to: 'n-byok', relation: 'gates' },
  { id: 'e29', from: 'n-partitions', to: 'n-quotas', relation: 'flows_to' },
  { id: 'e30', from: 'n-conflict', to: 'n-artifacts', relation: 'cites' },
]

// Section C: Product Demonstration Data
export interface WorkspaceSourceDoc {
  id: string
  filename: string
  kind: 'pdf' | 'markdown' | 'architecture_diagram' | 'xlsx'
  pages: number
  chunks: number
  status: 'ready'
  defaultIncluded: boolean
  summary: string
}

export interface CitationItem {
  id: string
  sourceId: string
  badge: string
  kind: 'chunk' | 'node'
  headingPath: string
  pageRange: string
  score: string
  excerpt: string
}

export interface WorkspaceQueryCase {
  id: string
  question: string
  modeLabel: string
  latencyMs: number
  tokensUsed: string
  answerSegments: Array<{
    text: string
    citationId?: string
    requiredSourceId?: string
  }>
  citations: CitationItem[]
  conflictAlert?: {
    incomingDoc: string
    agreedNode: string
    scope: 'partial' | 'full'
    summary: string
  }
}

export const WORKSPACE_SOURCES: WorkspaceSourceDoc[] = [
  {
    id: 'src-schema',
    filename: 'project-plan-v2.pdf',
    kind: 'pdf',
    pages: 6,
    chunks: 6,
    status: 'ready',
    defaultIncluded: true,
    summary: 'Current project roadmap, goals, and agreed timeline.',
  },
  {
    id: 'src-decisions',
    filename: 'team-meeting-notes.md',
    kind: 'markdown',
    pages: 4,
    chunks: 4,
    status: 'ready',
    defaultIncluded: true,
    summary: 'Weekly decisions, trade-offs, and assigned action items.',
  },
  {
    id: 'src-benchmark',
    filename: 'research-report.pdf',
    kind: 'pdf',
    pages: 24,
    chunks: 24,
    status: 'ready',
    defaultIncluded: true,
    summary: '24-page research report with comparison tables and figures.',
  },
  {
    id: 'src-diagram',
    filename: 'system-overview.png',
    kind: 'architecture_diagram',
    pages: 1,
    chunks: 1,
    status: 'ready',
    defaultIncluded: true,
    summary: 'Visual workflow diagram uploaded from the whiteboard.',
  },
  {
    id: 'src-legacy',
    filename: 'old-proposal-draft.pdf',
    kind: 'pdf',
    pages: 8,
    chunks: 8,
    status: 'ready',
    defaultIncluded: false,
    summary: 'Earlier draft from last month that was later replaced.',
  },
]

export const WORKSPACE_QUERIES: WorkspaceQueryCase[] = [
  {
    id: 'q-isolation',
    question: 'What did we finally decide for our project setup, and why?',
    modeLabel: 'Cited Answer + Decision Map',
    latencyMs: 320,
    tokensUsed: 'Verified across 3 files',
    answerSegments: [
      {
        text: 'Your team decided to keep all project files and search in one dedicated workspace rather than splitting across separate tools, reducing monthly cost and keeping every project isolated ',
        citationId: 'cit-d016',
        requiredSourceId: 'src-decisions',
      },
      {
        text: 'As outlined on page 2 of the project plan, each project sits in its own private container so files from one project never leak into another ',
        citationId: 'cit-part',
        requiredSourceId: 'src-schema',
      },
      {
        text: 'Large file uploads are processed in the background so your workspace stays fast while you read and chat ',
        citationId: 'cit-topo',
        requiredSourceId: 'src-diagram',
      },
    ],
    citations: [
      {
        id: 'cit-d016',
        sourceId: 'src-decisions',
        badge: 'team-meeting-notes.md · p. 2',
        kind: 'node',
        headingPath: 'Agreed Decision > Unified Project Workspace',
        pageRange: 'Page 2',
        score: 'Verified Decision',
        excerpt:
          '"Agreed: We will replace the earlier multi-tool draft with a single unified workspace so every project stays private and predictable in cost."',
      },
      {
        id: 'cit-part',
        sourceId: 'src-schema',
        badge: 'project-plan-v2.pdf · p. 2',
        kind: 'chunk',
        headingPath: 'Section 2 > Project Privacy & Isolation',
        pageRange: 'Page 2',
        score: 'Exact Page Match',
        excerpt:
          '"Every project created by a student or team is strictly isolated. Documents, notes, and decisions inside one project can never be accessed by another project."',
      },
      {
        id: 'cit-topo',
        sourceId: 'src-diagram',
        badge: 'system-overview.png · Fig. 1',
        kind: 'chunk',
        headingPath: 'Diagram > Background File Processing',
        pageRange: 'Figure 1',
        score: 'Diagram Match',
        excerpt:
          '"Uploaded PDFs, slides, and spreadsheets are read in the background while the main workspace remains responsive."',
      },
    ],
  },
  {
    id: 'q-tables',
    question: 'What were the key numbers in our research comparison table?',
    modeLabel: 'Table & Diagram Reader',
    latencyMs: 290,
    tokensUsed: 'Verified across 2 files',
    answerSegments: [
      {
        text: 'Table 3.1 on page 12 of the research report compares all three options side by side, showing a 32% faster setup time and 100% source citation accuracy ',
        citationId: 'cit-bench',
        requiredSourceId: 'src-benchmark',
      },
      {
        text: 'Every row and column header is kept intact when you upload a PDF or spreadsheet, so you can ask about specific numbers without losing context ',
        citationId: 'cit-d007',
        requiredSourceId: 'src-decisions',
      },
    ],
    citations: [
      {
        id: 'cit-bench',
        sourceId: 'src-benchmark',
        badge: 'research-report.pdf · p. 12',
        kind: 'chunk',
        headingPath: 'Section 3 > Table 3.1: Results Summary',
        pageRange: 'Page 12',
        score: 'Exact Table Match',
        excerpt:
          '"Table 3.1 — Setup Time: -32% vs baseline | Verified Page Citations: 100% | Contradictions Caught Before Final Submission: 4."',
      },
      {
        id: 'cit-d007',
        sourceId: 'src-decisions',
        badge: 'team-meeting-notes.md · p. 1',
        kind: 'node',
        headingPath: 'Note > Keeping Tables & Diagrams Searchable',
        pageRange: 'Page 1',
        score: 'Verified Note',
        excerpt:
          '"Make sure spreadsheets, tables, and whiteboard diagrams inside our reports remain searchable by exact numbers and labels."',
      },
    ],
  },
  {
    id: 'q-conflict',
    question: 'Does old-proposal-draft.pdf conflict with our current plan?',
    modeLabel: 'Contradiction Check',
    latencyMs: 350,
    tokensUsed: 'Conflict flagged automatically',
    answerSegments: [
      {
        text: 'Contradiction found: page 3 of old-proposal-draft.pdf recommends the old split storage setup, which conflicts with your teams current agreed plan ',
        citationId: 'cit-conflict-doc',
        requiredSourceId: 'src-legacy',
      },
      {
        text: 'Uploading an older or conflicting file never overwrites your agreed decisions automatically—it highlights the exact page so you can review it first ',
        citationId: 'cit-d016',
        requiredSourceId: 'src-decisions',
      },
    ],
    citations: [
      {
        id: 'cit-conflict-doc',
        sourceId: 'src-legacy',
        badge: 'old-proposal-draft.pdf · p. 3',
        kind: 'chunk',
        headingPath: 'Section 2.1 > Earlier Draft Proposal',
        pageRange: 'Page 3',
        score: 'Conflicts with Current Plan',
        excerpt:
          '"Proposal: Keep project notes and uploaded files in separate external folders." [Flagged: contradicts your current agreed project plan].',
      },
      {
        id: 'cit-d016',
        sourceId: 'src-decisions',
        badge: 'team-meeting-notes.md · p. 2',
        kind: 'node',
        headingPath: 'Agreed Decision > Unified Project Workspace',
        pageRange: 'Page 2',
        score: 'Current Agreed Decision',
        excerpt:
          '"Current Plan: Keep all project files, search, and decisions unified in one workspace."',
      },
    ],
    conflictAlert: {
      incomingDoc: 'old-proposal-draft.pdf (Page 3)',
      agreedNode: 'Current Project Plan (Page 2)',
      scope: 'full',
      summary:
        'This file suggests an older approach that your team already replaced. Your decision map stays untouched unless you choose to update it.',
    },
  },
]

// Section D: Workflow Pipeline Stages
export interface WorkflowStage {
  id: string
  stepCode: string
  title: string
  subtitle: string
  statusBadge: string
  summary: string
  mechanics: string[]
  codeTitle: string
  codeSnippet: string
}

export const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    id: 'stage-ingest',
    stepCode: 'STEP 01 // UPLOAD',
    title: 'Drop in your PDFs, notes, slides, and spreadsheets',
    subtitle: 'Supports 9 everyday file formats with automatic duplicate protection',
    statusBadge: 'Step 1 · Upload',
    summary:
      'Upload lecture slides, research papers, meeting notes, spreadsheets, or whiteboard diagrams. Knowledge Cartographer checks every file and skips duplicates automatically.',
    mechanics: [
      'Works with PDF, Word, PowerPoint, Excel, CSV, Markdown, HTML, PNG, and JPEG',
      'Reads tables, charts, and diagrams—not just plain paragraphs',
      'Organizes everything neatly inside your private project workspace',
    ],
    codeTitle: 'Supported Files',
    codeSnippet: 'PDF · DOCX · PPTX · XLSX · CSV · MD · HTML · PNG · JPG',
  },
  {
    id: 'stage-parse',
    stepCode: 'STEP 02 // ASK & FILTER',
    title: 'Ask questions across the exact files you choose',
    subtitle: 'Include or exclude any file with one click before asking',
    statusBadge: 'Step 2 · Ask',
    summary:
      'Ask questions in plain English. Need an answer from only two specific reports while ignoring an old draft? Just untick the old draft in your file checklist.',
    mechanics: [
      'Searches by both meaning and exact keywords, names, or numbers',
      'Unticked files are completely ignored so old drafts never muddy your answers',
      'Start private solo chats or shared threads with up to 4 project teammates',
    ],
    codeTitle: 'File Scope Control',
    codeSnippet: '☑ project-plan-v2.pdf   ☑ research-report.pdf   ☐ old-draft.pdf',
  },
  {
    id: 'stage-retrieve',
    stepCode: 'STEP 03 // VERIFY THE PAGE',
    title: 'Every answer points to the exact page and quote',
    subtitle: 'No guessing or made-up claims—click any citation to read the source',
    statusBadge: 'Step 3 · Verify',
    summary:
      'Every statement comes with a clickable page badge. Click it to inspect the exact paragraph, table row, or diagram from your uploaded file side by side.',
    mechanics: [
      'Shows the file name, section heading, page number, and original passage',
      'Strips out any claim that cannot be backed by your uploaded files',
      'Saves hours of scrolling through 40-page PDFs to double-check a detail',
    ],
    codeTitle: 'Instant Page Proof',
    codeSnippet: '[research-report.pdf · Page 12] → Opens exact paragraph & table',
  },
  {
    id: 'stage-graph',
    stepCode: 'STEP 04 // MAP & EXPORT',
    title: 'Spot contradictions and keep a living decision map',
    subtitle: 'You stay in control—nothing changes on your map without your approval',
    statusBadge: 'Step 4 · Map',
    summary:
      'When a new file contradicts an earlier decision, Knowledge Cartographer flags the conflict immediately. Approve updates with one click and export clean Markdown summaries or reports.',
    mechanics: [
      'Highlights when a new upload disagrees with what your team already decided',
      'Visual map connects your decisions, replaced plans, evidence, and open questions',
      'Export polished reports, study guides, or decision logs to Markdown anytime',
    ],
    codeTitle: 'Human-Approved Updates',
    codeSnippet: 'Conflict Flagged → Review Quote → Click Approve to Update Map',
  },
]

// Section E: Retrieval Benchmark Comparison Cases
export interface RrfComparisonCase {
  id: string
  label: string
  query: string
  vectorOnlyTop: { ref: string; score: string; note: string; hit: boolean }
  bm25OnlyTop: { ref: string; score: string; note: string; hit: boolean }
  hybridRrfTop: { ref: string; score: string; note: string; hit: boolean }
}

export const RRF_BENCHMARK_CASES: RrfComparisonCase[] = [
  {
    id: 'case-exact',
    label: 'Specific Names & Codes',
    query: 'What did we decide about Project Atlas in Tuesday’s meeting?',
    vectorOnlyTop: {
      ref: 'general-overview.pdf · Page 1',
      score: 'Meaning Only',
      note: 'Finds general paragraphs about project planning, but misses the specific meeting decision.',
      hit: false,
    },
    bm25OnlyTop: {
      ref: 'team-meeting-notes.md · Page 4',
      score: 'Exact Words Only',
      note: 'Finds the words "Project Atlas", but misses the related budget notes on page 2.',
      hit: true,
    },
    hybridRrfTop: {
      ref: 'team-meeting-notes.md (Page 4) + project-plan.pdf (Page 2)',
      score: 'Combined Smart Search',
      note: 'Pins the exact Project Atlas decision and links the supporting budget page automatically.',
      hit: true,
    },
  },
  {
    id: 'case-table',
    label: 'Numbers Inside Tables',
    query: 'What was the setup time reduction in Table 3.1?',
    vectorOnlyTop: {
      ref: 'research-report.pdf · Page 11',
      score: 'Meaning Only',
      note: 'Finds the introduction paragraph, but misses the actual number inside the table.',
      hit: false,
    },
    bm25OnlyTop: {
      ref: 'research-report.pdf · Table 3.1 (Page 12)',
      score: 'Exact Words Only',
      note: 'Matches the table title "Table 3.1", but needs context to explain the row.',
      hit: true,
    },
    hybridRrfTop: {
      ref: 'research-report.pdf · Table 3.1 (-32% setup time)',
      score: 'Combined Smart Search',
      note: 'Reads the exact row and column inside Table 3.1 and cites Page 12 directly.',
      hit: true,
    },
  },
  {
    id: 'case-conceptual',
    label: 'Broad Questions',
    query: 'How do we make sure old drafts do not confuse our final report?',
    vectorOnlyTop: {
      ref: 'project-plan-v2.pdf · Page 5',
      score: 'Meaning Only',
      note: 'Understands the concept of filtering out older drafts during review.',
      hit: true,
    },
    bm25OnlyTop: {
      ref: 'old-proposal-draft.pdf · Page 1',
      score: 'Exact Words Only',
      note: 'Matches the word "draft", accidentally pulling up the old file itself.',
      hit: false,
    },
    hybridRrfTop: {
      ref: 'project-plan-v2.pdf (Page 5) + Contradiction Guard',
      score: 'Combined Smart Search',
      note: 'Combines meaning and exact terms to show how old drafts are excluded or flagged.',
      hit: true,
    },
  },
]

// ============================================================================
// Section F: Simplified Interactive Knowledge Graph Data
// Plain-language labels only — no technical codes, jargon, or function signatures
// ============================================================================

export type DecisionEntityKind =
  | 'decision'
  | 'replaced'
  | 'document'
  | 'evidence'
  | 'component'
  | 'artifact'
  | 'question'

export type RelationshipType =
  | 'replaces'
  | 'backed by'
  | 'cites'
  | 'from'
  | 'depends on'
  | 'references'
  | 'informs'

export interface DecisionGraphClusterHull {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  color: string
}

export interface DecisionGraphNode {
  id: string
  shortTitle: string
  title: string
  kind: DecisionEntityKind
  status: 'current' | 'replaced' | 'open' | 'verified'
  clusterGroup: string
  layer: string
  x: number
  y: number
  summary: string
}

export interface DecisionGraphEdge {
  id: string
  from: string
  to: string
  relationship: RelationshipType
  curveOffset?: number
  scope?: 'full' | 'partial'
  aspects?: string[]
  rationale: string
}

export const DECISION_CLUSTERS: DecisionGraphClusterHull[] = [
  {
    id: 'hull-sources',
    label: 'Source files',
    x: 34,
    y: 230,
    width: 248,
    height: 184,
    color: 'rgba(20, 241, 148, 0.05)',
  },
  {
    id: 'hull-decisions',
    label: 'Team decisions',
    x: 56,
    y: 28,
    width: 454,
    height: 196,
    color: 'rgba(175, 99, 255, 0.06)',
  },
  {
    id: 'hull-outcomes',
    label: 'Questions and output',
    x: 524,
    y: 28,
    width: 292,
    height: 386,
    color: 'rgba(164, 161, 255, 0.06)',
  },
]

export const DECISION_GRAPH_NODES: DecisionGraphNode[] = [
  {
    id: 'node-current-decision',
    shortTitle: 'Current decision',
    title: 'Current decision: Self-hosted database',
    kind: 'decision',
    status: 'current',
    clusterGroup: 'Team decisions',
    layer: 'Active team decision',
    x: 365,
    y: 168,
    summary:
      'The team chose to run their own database on a dedicated server so search and project data live in one place with predictable monthly cost.',
  },
  {
    id: 'node-replaced-decision',
    shortTitle: 'Replaced plan',
    title: 'Replaced plan: Managed cloud database',
    kind: 'replaced',
    status: 'replaced',
    clusterGroup: 'Team decisions',
    layer: 'Earlier option that was superseded',
    x: 138,
    y: 112,
    summary:
      'The team originally planned to use a managed cloud database, but replaced it once they needed custom search extensions and isolated project storage.',
  },
  {
    id: 'node-source-file',
    shortTitle: 'Source file',
    title: 'Uploaded file: Database specification',
    kind: 'document',
    status: 'verified',
    clusterGroup: 'Source files',
    layer: 'Uploaded specification',
    x: 98,
    y: 348,
    summary:
      'A 6-page specification uploaded by the team that defines how projects, documents, and decisions are stored and isolated.',
  },
  {
    id: 'node-evidence-passage',
    shortTitle: 'Evidence passage',
    title: 'Evidence passage: Page 2 of specification',
    kind: 'evidence',
    status: 'verified',
    clusterGroup: 'Source files',
    layer: 'Extracted passage',
    x: 222,
    y: 294,
    summary:
      'The exact paragraph extracted from page 2 that backs the teams decision to use isolated project storage.',
  },
  {
    id: 'node-worker-service',
    shortTitle: 'Background service',
    title: 'System service: Background file parser',
    kind: 'component',
    status: 'current',
    clusterGroup: 'Questions and output',
    layer: 'System component',
    x: 590,
    y: 196,
    summary:
      'A dedicated background worker that parses large PDFs, spreadsheets, and diagrams without slowing down the main web app.',
  },
  {
    id: 'node-open-question',
    shortTitle: 'Open question',
    title: 'Open question: Private network vs cloud bucket?',
    kind: 'question',
    status: 'open',
    clusterGroup: 'Questions and output',
    layer: 'Unresolved team question',
    x: 616,
    y: 84,
    summary:
      'Still undecided: should the background file parser send extracted passages over a direct private network link or through a cloud storage bucket?',
  },
  {
    id: 'node-generated-doc',
    shortTitle: 'Generated document',
    title: 'Generated document: Storage architecture plan',
    kind: 'artifact',
    status: 'current',
    clusterGroup: 'Questions and output',
    layer: 'Generated team document',
    x: 612,
    y: 338,
    summary:
      'A finished architecture plan generated by Knowledge Cartographer, complete with links to the decision, the replaced plan, and the supporting evidence passage.',
  },
  {
    id: 'node-table-decision',
    shortTitle: 'Table handling',
    title: 'Decision: Keep spreadsheet rows intact',
    kind: 'decision',
    status: 'current',
    clusterGroup: 'Team decisions',
    layer: 'Active team decision',
    x: 348,
    y: 66,
    summary:
      'Keep every row and column header of extracted tables together so searching for a number or metric returns the exact cell.',
  },
  {
    id: 'node-search-decision',
    shortTitle: 'Search approach',
    title: 'Decision: Combine keyword + meaning search',
    kind: 'decision',
    status: 'current',
    clusterGroup: 'Team decisions',
    layer: 'Active team decision',
    x: 396,
    y: 344,
    summary:
      'Combine exact keyword matching with semantic meaning search so users can find both specific identifiers and broad concepts.',
  },
  {
    id: 'node-sync-question',
    shortTitle: 'Sync question',
    title: 'Open question: Instant graph sync after sleep?',
    kind: 'question',
    status: 'open',
    clusterGroup: 'Questions and output',
    layer: 'Unresolved team question',
    x: 756,
    y: 222,
    summary:
      'How do we make sure the visual graph rebuilds itself automatically if the graph replica pauses after a weekend of inactivity?',
  },
]

export const DECISION_GRAPH_EDGES: DecisionGraphEdge[] = [
  {
    id: 'edge-replaces',
    from: 'node-current-decision',
    to: 'node-replaced-decision',
    relationship: 'replaces',
    curveOffset: -22,
    scope: 'partial',
    aspects: ['database hosting', 'extension control'],
    rationale:
      'The current decision replaces the earlier managed cloud plan for database hosting and search extension control, while keeping standard database compatibility.',
  },
  {
    id: 'edge-backed-by',
    from: 'node-current-decision',
    to: 'node-evidence-passage',
    relationship: 'backed by',
    curveOffset: -16,
    rationale:
      'The current decision is backed directly by the evidence passage extracted from page 2 of the uploaded specification.',
  },
  {
    id: 'edge-from',
    from: 'node-evidence-passage',
    to: 'node-source-file',
    relationship: 'from',
    curveOffset: 16,
    rationale:
      'The evidence passage was extracted from page 2 of the uploaded specification file.',
  },
  {
    id: 'edge-depends-on',
    from: 'node-open-question',
    to: 'node-current-decision',
    relationship: 'depends on',
    curveOffset: -20,
    rationale:
      'Deciding how the background worker connects depends on the database hosting decision.',
  },
  {
    id: 'edge-references',
    from: 'node-worker-service',
    to: 'node-current-decision',
    relationship: 'references',
    curveOffset: 14,
    rationale:
      'The background file parser writes all extracted passages into the self-hosted database.',
  },
  {
    id: 'edge-cites',
    from: 'node-generated-doc',
    to: 'node-current-decision',
    relationship: 'cites',
    curveOffset: -18,
    rationale:
      'The generated storage plan document cites the current decision as its core architectural choice.',
  },
  {
    id: 'edge-doc-backed',
    from: 'node-generated-doc',
    to: 'node-evidence-passage',
    relationship: 'backed by',
    curveOffset: -42,
    rationale:
      'The generated document links directly to the evidence passage so readers can verify the source.',
  },
  {
    id: 'edge-table-references',
    from: 'node-table-decision',
    to: 'node-current-decision',
    relationship: 'references',
    curveOffset: 14,
    rationale:
      'Extracted spreadsheet and table rows are stored inside the per-project partitions created under the database decision.',
  },
  {
    id: 'edge-search-references',
    from: 'node-search-decision',
    to: 'node-evidence-passage',
    relationship: 'references',
    curveOffset: 18,
    rationale:
      'The combined keyword + meaning search indexes every passage stored in the specification.',
  },
  {
    id: 'edge-informs',
    from: 'node-sync-question',
    to: 'node-generated-doc',
    relationship: 'informs',
    curveOffset: 18,
    rationale:
      'The sync question informs the operations checklist inside the generated storage plan.',
  },
]
