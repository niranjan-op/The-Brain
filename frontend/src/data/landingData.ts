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
    filename: 'db_schema.md',
    kind: 'markdown',
    pages: 6,
    chunks: 18,
    status: 'ready',
    defaultIncluded: true,
    summary: 'Canonical Alembic schema c1a000000001–c1a000000007: partitions, jobs, graph, and quotas.',
  },
  {
    id: 'src-decisions',
    filename: 'architecture-decisions.md',
    kind: 'markdown',
    pages: 11,
    chunks: 29,
    status: 'ready',
    defaultIncluded: true,
    summary: 'Decision log D001–D023 covering hosting, Docling TableFormer, embeddings, and Neo4j Aura sync.',
  },
  {
    id: 'src-benchmark',
    filename: 'report-1-half.pdf',
    kind: 'pdf',
    pages: 41,
    chunks: 118,
    status: 'ready',
    defaultIncluded: true,
    summary: '41-page engineering report benchmarked through Docling (10 tables, 5 figures, 0 duplicate chunks).',
  },
  {
    id: 'src-diagram',
    filename: 'cloud-run-vpc-topology.png',
    kind: 'architecture_diagram',
    pages: 1,
    chunks: 3,
    status: 'ready',
    defaultIncluded: true,
    summary: 'Architecture diagram described by Gemini 3.5 Flash-Lite: VM Postgres + Cloud Run Worker Job.',
  },
  {
    id: 'src-legacy',
    filename: 'legacy-firestore-proposal.pdf',
    kind: 'pdf',
    pages: 8,
    chunks: 21,
    status: 'ready',
    defaultIncluded: false,
    summary: 'Superseded early draft proposing Firestore + Supabase before partition & vector benchmarks.',
  },
]

export const WORKSPACE_QUERIES: WorkspaceQueryCase[] = [
  {
    id: 'q-isolation',
    question: 'Why did we drop Supabase and how are document chunks isolated per project?',
    modeLabel: 'Hybrid RRF (k=60) + Graph Read',
    latencyMs: 380,
    tokensUsed: '612 in / 218 out · gemini-3.5-flash-lite',
    answerSegments: [
      {
        text: 'Decision D016 superseded the earlier Supabase plan (D015) so the team could run pgvector and pg_textsearch (BM25) together on a self-managed Postgres 17 instance with predictable memory and zero per-project pause limits ',
        citationId: 'cit-d016',
        requiredSourceId: 'src-decisions',
      },
      {
        text: 'Every project gets its own physical table partition via PARTITION BY LIST (project_uuid) created automatically by a database trigger on INSERT INTO projects ',
        citationId: 'cit-part',
        requiredSourceId: 'src-schema',
      },
      {
        text: 'Composite foreign keys (project_uuid, doc_uuid) and (project_uuid, node_uuid) guarantee a chunk can never reference a document or graph node belonging to another project, while heavy Docling ingestion executes asynchronously in a 4 GB Cloud Run Job ',
        citationId: 'cit-topo',
        requiredSourceId: 'src-diagram',
      },
    ],
    citations: [
      {
        id: 'cit-d016',
        sourceId: 'src-decisions',
        badge: 'node:D016 · architecture-decisions.md',
        kind: 'node',
        headingPath: 'Decisions > D016: e2-medium VM Postgres over Supabase',
        pageRange: 'p. 4',
        score: 'RRF 0.0328 (rank #1)',
        excerpt:
          'Decision D016 (status: agreed) — SUPERSEDES D015 (scope: partial, aspects: ["database hosting", "extension control"]). Co-locates pgvector HNSW and pg_textsearch BM25 on Postgres 17.',
      },
      {
        id: 'cit-part',
        sourceId: 'src-schema',
        badge: 'chk_8c41a2 · db_schema.md p.2',
        kind: 'chunk',
        headingPath: 'Schema > chunks (PARTITION BY LIST)',
        pageRange: 'p. 2',
        score: 'RRF 0.0315 (rank #2)',
        excerpt:
          'chunks (PARTITION BY LIST (project_uuid); one partition per project): chunk_id (content-derived), project_uuid (fk), embedding vector(768), indexes: HNSW on embedding (cosine), BM25 on embed_text.',
      },
      {
        id: 'cit-topo',
        sourceId: 'src-diagram',
        badge: 'chk_19f0e4 · cloud-run-vpc-topology.png',
        kind: 'chunk',
        headingPath: 'Diagram Description > Cloud Run Worker to VM Postgres',
        pageRange: 'fig. 1',
        score: 'RRF 0.0294 (rank #3)',
        excerpt:
          '[doc_kind: architecture_diagram] FastAPI serves low-latency API requests on the VM behind Caddy TLS, while multipart uploads enqueue a job in jobs and trigger the 4 GB Docling Cloud Run Job.',
      },
    ],
  },
  {
    id: 'q-tables',
    question: 'How are multi-page tables and diagrams indexed without bloating chunk counts?',
    modeLabel: 'Hybrid RRF (k=60) · Table & Vision',
    latencyMs: 340,
    tokensUsed: '540 in / 194 out · gemini-3.5-flash-lite',
    answerSegments: [
      {
        text: 'During ingestion, Docling runs with OCR off by default, TableFormer in FAST mode, and HybridChunker configured to skip document_index (table of contents) pages ',
        citationId: 'cit-bench',
        requiredSourceId: 'src-benchmark',
      },
      {
        text: 'Following Decision D007, each extracted table is formatted as compact row-column triplets in embed_text for high-recall vector + BM25 search while the full structured JSON table is preserved in chunks.payload ',
        citationId: 'cit-d007',
        requiredSourceId: 'src-decisions',
      },
      {
        text: 'Non-decorative images and diagrams (up to 10 per document) are classified and described by Gemini Flash-Lite and stored alongside documents.doc_kind ',
        citationId: 'cit-img',
        requiredSourceId: 'src-schema',
      },
    ],
    citations: [
      {
        id: 'cit-bench',
        sourceId: 'src-benchmark',
        badge: 'chk_4b12d9 · report-1-half.pdf p.11',
        kind: 'chunk',
        headingPath: 'Benchmark > 41-Page PDF Lean Run',
        pageRange: 'pp. 11–14',
        score: 'RRF 0.0325 (rank #1)',
        excerpt:
          'report-1-half.pdf (41 pages) yields 118 deduplicated chunks, 10 structured tables, and 5 classified figures. Sanity guards reject any run where chunks/page > 30 or total chars > 2x text layer.',
      },
      {
        id: 'cit-d007',
        sourceId: 'src-decisions',
        badge: 'node:D007 · architecture-decisions.md',
        kind: 'node',
        headingPath: 'Decisions > D007: Compact Triplet Table Serialization',
        pageRange: 'p. 2',
        score: 'RRF 0.0310 (rank #2)',
        excerpt:
          'Decision D007: Store compact "RowHeader | ColumnHeader: Value" triplets in embed_text so both 768-dim embeddings and BM25 match cell values accurately, keeping raw JSON cells in payload.',
      },
      {
        id: 'cit-img',
        sourceId: 'src-schema',
        badge: 'chk_91e3b0 · db_schema.md p.1',
        kind: 'chunk',
        headingPath: 'Schema > documents.doc_kind',
        pageRange: 'p. 1',
        score: 'RRF 0.0289 (rank #3)',
        excerpt:
          'doc_kind (LLM label: architecture_diagram | table | photo | screenshot | other), description (LLM-generated summary). Up to 10 figures described per document; failures do not fail the ingest job.',
      },
    ],
  },
  {
    id: 'q-conflict',
    question: 'Does legacy-firestore-proposal.pdf conflict with our agreed storage architecture?',
    modeLabel: 'Upload Conflict Check + Decision Graph',
    latencyMs: 410,
    tokensUsed: '690 in / 230 out · gemini-3.5-flash-lite',
    answerSegments: [
      {
        text: 'Conflict detected: legacy-firestore-proposal.pdf recommends storing document chunks in Firestore collections, which directly contradicts agreed Decision D016 (Postgres 17 with LIST partitioning by project_uuid) ',
        citationId: 'cit-conflict-doc',
        requiredSourceId: 'src-legacy',
      },
      {
        text: 'Per the Graph Gateway contract, uploading a conflicting file never overwrites agreed graph nodes automatically; instead, it raises a non-destructive conflict flag linked to D016 and chunks ',
        citationId: 'cit-d016',
        requiredSourceId: 'src-decisions',
      },
    ],
    citations: [
      {
        id: 'cit-conflict-doc',
        sourceId: 'src-legacy',
        badge: 'chk_f03a11 · legacy-firestore-proposal.pdf p.3',
        kind: 'chunk',
        headingPath: 'Section 2.1 > Managed NoSQL Document Store',
        pageRange: 'p. 3',
        score: 'Conflict Flag (cosine 0.89 vs D016)',
        excerpt:
          'Claim in uploaded file: "Store all parsed document chunks in Firestore subcollections and use external REST webhooks for vector search." [Flagged against agreed node D016].',
      },
      {
        id: 'cit-d016',
        sourceId: 'src-decisions',
        badge: 'node:D016 · architecture-decisions.md',
        kind: 'node',
        headingPath: 'Decisions > D016: e2-medium VM Postgres over Supabase',
        pageRange: 'p. 4',
        score: 'Agreed Authority Node',
        excerpt:
          'Agreed Decision D016: All relational metadata, 768-dim HNSW vector indexes, and BM25 lexical indexes reside in partitioned Postgres 17 tables.',
      },
    ],
    conflictAlert: {
      incomingDoc: 'legacy-firestore-proposal.pdf (p. 3)',
      agreedNode: 'D016: VM Postgres 17 + LIST Partitions',
      scope: 'full',
      summary:
        'Uploaded document proposes Firestore chunk storage, contradicting agreed Decision D016. Graph state remains untouched until an owner reviews or supersedes D016.',
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
    stepCode: 'STAGE 01 // VERIFY & ENQUEUE',
    title: 'Cryptographic Deduplication & Lease Queueing',
    subtitle: 'Multipart verification, SHA-256 hashing, and idempotent job dispatch',
    statusBadge: 'pending -> uploaded -> queued',
    summary:
      'Every upload is verified from its content magic bytes (never trusting file extensions), capped at 10 MB and 50 pages, hashed with SHA-256 per project, stored in S3/GCS, and enqueued with a unique idempotency key.',
    mechanics: [
      'Supported formats: PDF, DOCX, PPTX, XLSX, CSV, HTML, Markdown, PNG, JPEG',
      'UNIQUE (project_uuid, doc_hash) prevents duplicate parsing and re-embedding costs',
      'Workers claim jobs with FOR UPDATE SKIP LOCKED and maintain a 900s lease heartbeat',
    ],
    codeTitle: 'migrations/versions/c1a000000002 & main.py',
    codeSnippet: `INSERT INTO documents (project_uuid, filename, doc_hash, mime_type, size_bytes, status)
VALUES (:project_uuid, :filename, :sha256_hex, :mime_type, :size_bytes, 'uploaded')
RETURNING doc_uuid;

INSERT INTO jobs (project_uuid, user_uuid, doc_uuid, type, idempotency_key)
VALUES (:project_uuid, :user_uuid, :doc_uuid, 'ingest', 'ingest:' || :doc_uuid)
ON CONFLICT (idempotency_key) DO NOTHING;`,
  },
  {
    id: 'stage-parse',
    stepCode: 'STAGE 02 // PARSE, DESCRIBE & EMBED',
    title: 'Structure-Aware Docling Parsing & Diagram Vision',
    subtitle: 'Heading-path preservation, compact triplet tables, and 768-dim embeddings',
    statusBadge: 'processing -> stage:chunk_embed',
    summary:
      'Docling extracts text, headings, tables, and figures. Tables become both compact triplets for search and raw JSON for inspection. Up to 10 diagrams or images per document receive Gemini Flash-Lite descriptions before L2-normalized 768-dim embedding.',
    mechanics: [
      'Content-derived chunk_id = hash(doc_uuid, heading_path, text_hash) + ordinal counter',
      'Sanity guard halts runaway OCR if chunks/page > 30 or total chars > 2x text layer',
      'gemini-embedding-001 at 768 dimensions with task_type=RETRIEVAL_DOCUMENT',
    ],
    codeTitle: 'Parsed Chunk Payload & Vector Record',
    codeSnippet: `{
  "chunk_id": "chk_8c41a2f90e12",
  "doc_uuid": "7f4c9a10-3e8b-4b2a-9c11-08d2e5f1a904",
  "heading_path": ["3. Proposed System", "3.1.2 Components", "Table 3.1"],
  "page_start": 12,
  "embed_model": "gemini-embedding-001",
  "dims": 768,
  "payload": {
    "kind": "table",
    "doc_kind": "architecture_diagram",
    "triplet_preview": "Data Structures & Algorithms | KCs: 18 | Edges: 22"
  }
}`,
  },
  {
    id: 'stage-retrieve',
    stepCode: 'STAGE 03 // HYBRID RRF & CITATION GATE',
    title: 'Partitioned Hybrid Retrieval & Citation Validation',
    subtitle: 'HNSW cosine + BM25 fused via RRF (k=60) inside your allowed source scope',
    statusBadge: 'streaming -> answered (verified)',
    summary:
      'Queries run exclusively against the projects LIST partition, filtering out any document unticked in conversation_excluded_sources. Reciprocal Rank Fusion merges semantic and lexical hits, and the citation validator strips any unverified reference.',
    mechanics: [
      'hnsw.iterative_scan = relaxed_order guarantees k results even under strict doc filters',
      'Reciprocal Rank Fusion score: sum(1 / (60 + rank_vector) + 1 / (60 + rank_bm25))',
      'Every inline [chunk_id] is verified against retrieved candidates before writing message_sources',
    ],
    codeTitle: 'Hybrid Reciprocal Rank Fusion Query',
    codeSnippet: `WITH allowed_chunks AS (
  SELECT chunk_id, doc_uuid, text, embed_text, embedding, page_start
  FROM chunks
  WHERE project_uuid = :project_uuid
    AND doc_uuid NOT IN (
      SELECT doc_uuid FROM conversation_excluded_sources WHERE convo_uuid = :convo_uuid
    )
)
-- Fuses top-40 HNSW cosine candidates + top-40 BM25 candidates with RRF (k = 60)`,
  },
  {
    id: 'stage-graph',
    stepCode: 'STAGE 04 // DECISION GRAPH & ARTIFACTS',
    title: 'Human-Approved Decision Graph & Cited Artifacts',
    subtitle: 'Explicit proposal approval, Postgres-to-Neo4j sync, and ADR generation',
    statusBadge: 'agreed -> synced -> adr_v2',
    summary:
      'Conversations propose Decision, Alternative, and Question nodes backed by evidence rows. Only human approval writes to nodes and graph_changes, which sync idempotently to Neo4j and power one-click ADR and Architecture Plan artifacts.',
    mechanics: [
      'SUPERSEDES edges require scope = full | partial (with non-empty aspects on partial)',
      'Graph read tools (why_decision, open_questions, path_between) respect source_scope',
      'Artifact versions record exact chunk and node source_refs for auditability',
    ],
    codeTitle: 'Graph Write Gateway & SUPERSEDES Edge',
    codeSnippet: `INSERT INTO edges (project_uuid, src_node, dst_node, type, scope, aspects, status)
VALUES (
  :project_uuid,
  :node_d016,
  :node_d015,
  'SUPERSEDES',
  'partial',
  ARRAY['database_hosting', 'pgvector_bm25_colocation'],
  'agreed'
);`,
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
    label: 'Exact Decision Identifier',
    query: 'What did D016 decide about Cloud SQL vs e2-medium VM hosting?',
    vectorOnlyTop: {
      ref: 'chk_31a0 · CLOUDSQL_IMPLEMENTATION_GUIDE.md p.1',
      score: 'cosine 0.812',
      note: 'Drifts toward general Cloud SQL setup guide without pinning Decision D016.',
      hit: false,
    },
    bm25OnlyTop: {
      ref: 'node:D016 · architecture-decisions.md p.4',
      score: 'BM25 14.82',
      note: 'Exact token match on "D016" and "e2-medium", misses semantic context chunk.',
      hit: true,
    },
    hybridRrfTop: {
      ref: 'node:D016 + chk_8c41a2 (p.4 & p.2)',
      score: 'RRF 0.0328 (#1 + #2)',
      note: 'Ranks Decision D016 #1 and pairs it with the VM memory & partition spec.',
      hit: true,
    },
  },
  {
    id: 'case-table',
    label: 'Table Cell Lookup (D007)',
    query: 'How many prerequisite edges exist in the System Design domain table?',
    vectorOnlyTop: {
      ref: 'chk_4b12d9 · report-1-half.pdf p.12',
      score: 'cosine 0.834',
      note: 'Finds the prose paragraph about skill graphs, misses the exact row count.',
      hit: false,
    },
    bm25OnlyTop: {
      ref: 'chk_55c8e1 · report-1-half.pdf Table 3.1 (p.12)',
      score: 'BM25 12.40',
      note: 'Matches "System Design" and "Prerequisite edges" in compact triplet text.',
      hit: true,
    },
    hybridRrfTop: {
      ref: 'chk_55c8e1 · Table 3.1 (20 KCs, 30 Prerequisite edges)',
      score: 'RRF 0.0331 (#1)',
      note: 'Triplet embed_text + JSON table payload delivers exact cell value (30 edges).',
      hit: true,
    },
  },
  {
    id: 'case-conceptual',
    label: 'Conceptual Architecture Trade-off',
    query: 'How do we prevent a crashed ingestion worker from stalling a document forever?',
    vectorOnlyTop: {
      ref: 'chk_72d9a0 · db_schema.md (jobs.locked_until & sweeper)',
      score: 'cosine 0.868',
      note: 'Strong semantic match on lease expiry, heartbeat, and max_attempts = 3.',
      hit: true,
    },
    bm25OnlyTop: {
      ref: 'chk_11b4c2 · concerns.md (orphaned pending rows)',
      score: 'BM25 9.15',
      note: 'Matches "crashed" and "document", but misses the jobs lease sweeper spec.',
      hit: false,
    },
    hybridRrfTop: {
      ref: 'chk_72d9a0 + chk_11b4c2 (Lease Sweeper + Upload Recovery)',
      score: 'RRF 0.0322 (#1 + #2)',
      note: 'Surfaces both the 900s lease heartbeat sweeper and pending-row cleanup.',
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
