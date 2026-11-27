export interface FaqItem {
  id: string
  category: string
  question: string
  answer: string
}

export const FAQ_LAST_UPDATED = '2026-11-27'

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'supported-formats',
    category: 'Ingestion',
    question: 'Which document formats and file sizes are supported?',
    answer:
      'You can upload PDF, DOCX, PPTX, XLSX, CSV, HTML, Markdown, and PNG/JPEG files. Each upload is validated by extension and magic bytes, parsed with Docling into structured sections and tables, and paired with image/diagram descriptions (up to 10 images per document). Current workspace defaults allow up to 50 documents per project and 5 MB per uploaded document.',
  },
  {
    id: 'page-citations',
    category: 'Citations',
    question: 'How does Knowledge Cartographer verify page and paragraph citations?',
    answer:
      'Every parsed passage is stored with its document ID, heading path, and exact page and paragraph coordinates (for example p. 4, ¶ 2). Retrieval fuses 768-dimensional Gemini embeddings with BM25 keyword search via Reciprocal Rank Fusion, and the response filter only displays citations tied to passages inside your active source scope.',
  },
  {
    id: 'source-scoping',
    category: 'Workspace',
    question: 'Can I exclude specific files from a conversation?',
    answer:
      'Yes. Every conversation maintains its own source checklist in the Sources panel ("Answering from N of M sources"). Unchecking a document excludes its passages and linked graph nodes from retrieval for that thread without deleting the file from your Knowledge Base.',
  },
  {
    id: 'decision-graph',
    category: 'Decision Graph',
    question: 'Does the AI edit our shared decision graph automatically?',
    answer:
      'No. Knowledge Cartographer keeps humans in control of shared knowledge. New uploads are checked for contradictions against agreed decisions and flagged for review, and graph updates (Decision, Alternative, Question nodes, and SUPERSEDES edges) are only committed after human approval.',
  },
  {
    id: 'roles-collaboration',
    category: 'Teams',
    question: 'How do team roles, invites, and private conversations work?',
    answer:
      'Each project workspace supports up to 4 collaborators with Owner, Editor, or Viewer roles and email invites that expire after 7 days. Conversations can be marked Shared (visible to project members) or Private (visible only to the member who started them).',
  },
  {
    id: 'quotas-byok',
    category: 'Quotas & BYOK',
    question: 'What happens when managed daily LLM or search quotas run out?',
    answer:
      'Daily LLM, upload, and web-search budgets are visible in Workspace Settings so limits are never silent. If you reach the managed quota, or prefer using your own key, you can switch chat and deep research to Bring-Your-Own-Key (BYOK) mode using a Gemini or SerpApi key stored locally on your device.',
  },
]
