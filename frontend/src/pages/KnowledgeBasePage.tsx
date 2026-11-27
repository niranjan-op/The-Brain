import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  ImageIcon,
  LayersIcon,
  MessageSquareIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  SunIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from 'lucide-react'
import {
  BrandGlyph,
  PatternDotGrid,
  ScrollProgressIndicator,
} from '../components/patterns/GraphPatterns'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { CopyButton } from '../components/shared/CopyButton'
import { LastUpdatedBadge } from '../components/shared/LastUpdatedBadge'
import { useSiteSearch } from '../components/shared/SiteSearchModal'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../components/ui/empty'
import { Input } from '../components/ui/input'
import { Progress } from '../components/ui/progress'
import { Skeleton } from '../components/ui/skeleton'
import { Spinner } from '../components/ui/spinner'
import { useAuth } from '../lib/auth'
import {
  SUPPORTED_EXTENSIONS,
  addArtifactToKbApi,
  checkDocumentConflictsApi,
  deleteDocumentApi,
  exportArtifactApi,
  fetchDocumentChunksApi,
  fetchProjectArtifactsApi,
  fetchProjectDocumentsApi,
  getEffectiveIdToken,
  type ArtifactExportFormat,
  type ArtifactRecord,
  type DocumentChunkRecord,
} from '../lib/api'
import {
  loadWorkspaceState,
  mapApiDocumentToWorkspace,
  runThemeViewTransition,
  saveWorkspaceState,
  setAppTheme,
  subscribeAppTheme,
  syncProjectsWithBackend,
  syncProjectWorkspaceData,
  uploadWorkspaceDocument,
  type WorkspaceDocument,
} from '../lib/workspaceStore'
import { cn } from '../lib/utils'

type DocCategoryFilter = 'all' | 'document' | 'table' | 'visual'

export function KnowledgeBasePage(): React.ReactElement {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { setOpen: setSiteSearchOpen } = useSiteSearch()

  const [store, setStore] = useState(() => loadWorkspaceState())
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [statusBanner, setStatusBanner] = useState<{
    kind: 'ok' | 'err'
    text: string
  } | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<DocCategoryFilter>('all')

  // Upload state
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)

  // Passage Inspector modal state
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [inspectedDoc, setInspectedDoc] = useState<WorkspaceDocument | null>(null)
  const [inspectedChunks, setInspectedChunks] = useState<DocumentChunkRecord[]>([])
  const [loadingChunks, setLoadingChunks] = useState(false)
  const [chunkSearchQuery, setChunkSearchQuery] = useState('')

  // Conflict Check modal state
  const [conflictModalOpen, setConflictModalOpen] = useState(false)
  const [conflictTargetDoc, setConflictTargetDoc] = useState<WorkspaceDocument | null>(null)
  const [conflictItems, setConflictItems] = useState<
    Array<{
      node_uuid: string
      node_name: string
      chunk_id: string
      severity: string
      explanation: string
    }>
  >([])
  const [checkingConflicts, setCheckingConflicts] = useState(false)

  // Delete confirmation modal state
  const [deleteTargetDoc, setDeleteTargetDoc] = useState<WorkspaceDocument | null>(null)
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null)

  // Project artifacts (can be promoted into Knowledge Base)
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([])
  const [promotingArtifactId, setPromotingArtifactId] = useState<string | null>(null)

  const updateStore = (updater: (prev: typeof store) => typeof store): void => {
    setStore((prev) => {
      const next = updater(prev)
      saveWorkspaceState(next)
      return next
    })
  }

  useEffect(() => {
    return subscribeAppTheme((nextTheme) => {
      setStore((prev) =>
        prev.theme === nextTheme ? prev : { ...prev, theme: nextTheme },
      )
    })
  }, [])

  const toggleTheme = (e: React.MouseEvent<HTMLButtonElement>): void => {
    void runThemeViewTransition(e, () => {
      const nextTheme: 'dark' | 'light' =
        store.theme === 'dark' ? 'light' : 'dark'
      const next = { ...store, theme: nextTheme }
      setStore(next)
      saveWorkspaceState(next)
      setAppTheme(nextTheme)
    })
  }

  const project = useMemo(
    () => store.projects.find((p) => p.project_uuid === projectId),
    [store.projects, projectId],
  )

  const allProjectDocuments = useMemo(
    () =>
      store.documents.filter(
        (d) => d.project_uuid === (project?.project_uuid || projectId),
      ),
    [store.documents, project, projectId],
  )

  const readyDocuments = useMemo(
    () => allProjectDocuments.filter((d) => d.status === 'ready'),
    [allProjectDocuments],
  )

  const hasInFlightDocs = useMemo(
    () =>
      allProjectDocuments.some((d) =>
        ['pending', 'uploaded', 'processing'].includes(String(d.status)),
      ),
    [allProjectDocuments],
  )

  // Hydrate project + documents + artifacts from backend
  useEffect(() => {
    if (!projectId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setPageError(null)
    const token = getEffectiveIdToken(user?.idToken)
    if (!token) {
      setLoading(false)
      return
    }

    const loadKbData = async (): Promise<void> => {
      try {
        let currentState = loadWorkspaceState()
        let hasProject = currentState.projects.some(
          (p) => p.project_uuid === projectId,
        )
        if (!hasProject) {
          const mergedProjects = await syncProjectsWithBackend(token, currentState)
          if (cancelled) return
          updateStore((prev) => ({
            ...prev,
            projects: mergedProjects,
          }))
          hasProject = mergedProjects.some((p) => p.project_uuid === projectId)
        }
        if (!hasProject) {
          if (!cancelled) setLoading(false)
          return
        }

        const [{ documents: mappedDocs, conversations: mappedConvos }, artList] =
          await Promise.all([
            syncProjectWorkspaceData(token, projectId),
            fetchProjectArtifactsApi(token, projectId).catch(() => []),
          ])
        if (cancelled) return

        setArtifacts(artList)
        updateStore((prev) => ({
          ...prev,
          documents: [
            ...mappedDocs,
            ...prev.documents.filter((d) => d.project_uuid !== projectId),
          ],
          conversations: [
            ...mappedConvos,
            ...prev.conversations.filter((c) => c.project_uuid !== projectId),
          ],
        }))
      } catch (err) {
        if (!cancelled) {
          setPageError(
            err instanceof Error
              ? err.message
              : 'Unable to load Knowledge Base documents.',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadKbData()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, user?.idToken])

  // Poll while documents are processing
  useEffect(() => {
    if (!projectId || !hasInFlightDocs) return undefined
    const token = getEffectiveIdToken(user?.idToken)
    if (!token) return undefined
    let cancelled = false
    const timer = window.setInterval(() => {
      void fetchProjectDocumentsApi(token, projectId)
        .then((apiDocs) => {
          if (cancelled) return
          const mapped = apiDocs.map(mapApiDocumentToWorkspace)
          updateStore((prev) => ({
            ...prev,
            documents: [
              ...mapped,
              ...prev.documents.filter((d) => d.project_uuid !== projectId),
            ],
          }))
        })
        .catch(() => {})
    }, 2500)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, hasInFlightDocs, user?.idToken])

  const filteredDocuments = useMemo(() => {
    return allProjectDocuments.filter((doc) => {
      if (categoryFilter === 'table' && doc.doc_kind !== 'table') return false
      if (
        categoryFilter === 'visual' &&
        !['architecture_diagram', 'photo', 'screenshot'].includes(doc.doc_kind)
      ) {
        return false
      }
      if (
        categoryFilter === 'document' &&
        ['table', 'architecture_diagram', 'photo', 'screenshot'].includes(
          doc.doc_kind,
        )
      ) {
        return false
      }

      if (!searchQuery.trim()) return true
      const q = searchQuery.trim().toLowerCase()
      return (
        doc.filename.toLowerCase().includes(q) ||
        (doc.description || '').toLowerCase().includes(q)
      )
    })
  }, [allProjectDocuments, categoryFilter, searchQuery])

  const totalPagesIndexed = useMemo(
    () =>
      readyDocuments.reduce((sum, doc) => sum + (doc.page_count || 1), 0),
    [readyDocuments],
  )

  const totalSizeBytes = useMemo(
    () =>
      allProjectDocuments.reduce((sum, doc) => sum + (doc.size_bytes || 0), 0),
    [allProjectDocuments],
  )

  const latestDocUpdatedAt = useMemo(() => {
    if (allProjectDocuments.length === 0) return project?.created_at ?? null
    return allProjectDocuments.reduce<string | null>((latest, doc) => {
      if (!doc.created_at) return latest
      if (!latest || doc.created_at > latest) return doc.created_at
      return latest
    }, project?.created_at ?? null)
  }, [allProjectDocuments, project?.created_at])

  const handleUploadFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0 || !project) return
    setUploading(true)
    setStatusBanner(null)
    try {
      const uploadedDocs: WorkspaceDocument[] = []
      for (const file of Array.from(files)) {
        const doc = await uploadWorkspaceDocument(
          user?.idToken,
          user?.uid || 'dev_user_1',
          project.project_uuid,
          file,
          (statusText) => setStatusBanner({ kind: 'ok', text: statusText }),
        )
        uploadedDocs.push(doc)
      }

      updateStore((prev) => ({
        ...prev,
        documents: [
          ...uploadedDocs,
          ...prev.documents.filter(
            (existing) => !uploadedDocs.some((u) => u.doc_uuid === existing.doc_uuid),
          ),
        ],
      }))

      setStatusBanner({
        kind: 'ok',
        text: `Indexed ${uploadedDocs.map((d) => d.filename).join(', ')} into Vector RAG and the Knowledge Graph.`,
      })
    } catch (err) {
      setStatusBanner({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Document upload failed.',
      })
    } finally {
      setUploading(false)
    }
  }

  const handleOpenInspector = async (doc: WorkspaceDocument): Promise<void> => {
    if (!project) return
    setInspectedDoc(doc)
    setChunkSearchQuery('')
    setInspectorOpen(true)
    setLoadingChunks(true)
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) throw new Error('Authentication required to inspect document passages.')
      const chunks = await fetchDocumentChunksApi(
        token,
        project.project_uuid,
        doc.doc_uuid,
      )
      setInspectedChunks(chunks)
    } catch (err) {
      setStatusBanner({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Failed to load passages.',
      })
      setInspectedChunks([])
    } finally {
      setLoadingChunks(false)
    }
  }

  const handleCheckConflicts = async (doc: WorkspaceDocument): Promise<void> => {
    if (!project) return
    setConflictTargetDoc(doc)
    setConflictItems([])
    setConflictModalOpen(true)
    setCheckingConflicts(true)
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) throw new Error('Authentication required to run conflict analysis.')
      const res = await checkDocumentConflictsApi(
        token,
        project.project_uuid,
        doc.doc_uuid,
      )
      setConflictItems(res.conflicts || [])
    } catch (err) {
      setStatusBanner({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Conflict check failed.',
      })
      setConflictModalOpen(false)
    } finally {
      setCheckingConflicts(false)
    }
  }

  const handleConfirmDeleteDocument = async (): Promise<void> => {
    if (!project || !deleteTargetDoc) return
    const target = deleteTargetDoc
    setDeletingDocId(target.doc_uuid)
    setPageError(null)
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) throw new Error('Authentication required to delete document.')
      await deleteDocumentApi(token, project.project_uuid, target.doc_uuid)
      updateStore((prev) => ({
        ...prev,
        documents: prev.documents.filter((d) => d.doc_uuid !== target.doc_uuid),
        conversations: prev.conversations.map((c) => ({
          ...c,
          excluded_doc_uuids: c.excluded_doc_uuids.filter(
            (id) => id !== target.doc_uuid,
          ),
        })),
      }))
      setDeleteTargetDoc(null)
      setStatusBanner({
        kind: 'ok',
        text: `Deleted "${target.filename}" and purged its passages and orphaned entities from Vector RAG and the Knowledge Graph.`,
      })
    } catch (err) {
      setStatusBanner({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Failed to delete document.',
      })
    } finally {
      setDeletingDocId(null)
    }
  }

  const handlePromoteArtifact = async (art: ArtifactRecord): Promise<void> => {
    if (!project) return
    setPromotingArtifactId(art.artifact_uuid)
    setStatusBanner(null)
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) throw new Error('Authentication required.')
      const docRecord = await addArtifactToKbApi(
        token,
        project.project_uuid,
        art.artifact_uuid,
      )
      const mapped = mapApiDocumentToWorkspace(docRecord)
      updateStore((prev) => ({
        ...prev,
        documents: [
          mapped,
          ...prev.documents.filter((d) => d.doc_uuid !== mapped.doc_uuid),
        ],
      }))
      setStatusBanner({
        kind: 'ok',
        text: `Added artifact "${art.title}" (${mapped.filename}) to the Knowledge Base.`,
      })
    } catch (err) {
      setStatusBanner({
        kind: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Failed to add artifact to Knowledge Base.',
      })
    } finally {
      setPromotingArtifactId(null)
    }
  }

  const handleInstallArtifact = async (
    artifactUuid: string,
    format: ArtifactExportFormat,
  ): Promise<void> => {
    if (!project) return
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) throw new Error('Authentication required.')
      const { blob, filename } = await exportArtifactApi(
        token,
        project.project_uuid,
        artifactUuid,
        format,
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setStatusBanner({
        kind: 'ok',
        text: `Installed ${filename}.`,
      })
    } catch (err) {
      setStatusBanner({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Failed to install artifact.',
      })
    }
  }

  const filteredChunks = useMemo(() => {
    if (!chunkSearchQuery.trim()) return inspectedChunks
    const q = chunkSearchQuery.trim().toLowerCase()
    return inspectedChunks.filter(
      (c) =>
        c.text.toLowerCase().includes(q) ||
        c.heading_path.toLowerCase().includes(q) ||
        c.page_label.toLowerCase().includes(q),
    )
  }, [inspectedChunks, chunkSearchQuery])

  if (!project) {
    if (loading) {
      return (
        <div
          data-workspace-theme={store.theme}
          role="status"
          aria-label="Loading Knowledge Base"
          className="flex min-h-screen flex-col bg-background text-foreground"
        >
          <div className="border-b border-border bg-card/90 px-4 py-3 sm:px-6">
            <div className="mx-auto flex max-w-6xl items-center justify-between">
              <Skeleton className="h-5 w-60" />
              <Skeleton className="h-8 w-36" />
            </div>
          </div>
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 outline-none sm:px-6 sm:py-8"
          >
            <Skeleton className="h-10 w-72" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Skeleton className="h-28 rounded-lg" />
              <Skeleton className="h-28 rounded-lg" />
              <Skeleton className="h-28 rounded-lg" />
            </div>
            <Skeleton className="h-64 w-full rounded-lg" />
            <span className="sr-only">Loading Knowledge Base...</span>
          </main>
        </div>
      )
    }
    return (
      <div
        data-workspace-theme={store.theme}
        className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-foreground"
      >
        <main id="main-content" tabIndex={-1} className="outline-none">
          <Empty className="max-w-md border border-border bg-card p-8">
            <EmptyHeader>
              <EmptyTitle>Project workspace not found</EmptyTitle>
              <EmptyDescription>
                {pageError ||
                  `No workspace matches UUID "${projectId}". Return to your workspaces dashboard.`}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => navigate('/projects')}>
                <ArrowLeftIcon data-icon="inline-start" />
                Back to Workspaces
              </Button>
            </EmptyContent>
          </Empty>
        </main>
      </div>
    )
  }

  return (
    <div
      data-workspace-theme={store.theme}
      className="relative flex min-h-screen flex-col bg-background text-foreground"
    >
      <PatternDotGrid className="pointer-events-none fixed inset-0 opacity-25" />

      {/* Top Navigation Header */}
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/90 px-4 backdrop-blur-md sm:px-6">
        <ScrollProgressIndicator />
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-2 text-sm"
        >
          <Link
            to="/projects"
            className="flex shrink-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <BrandGlyph size={20} />
            <span className="font-medium">Workspaces</span>
          </Link>
          <span className="text-muted-foreground/50 select-none">/</span>
          <Link
            to={`/projects/${project.project_uuid}`}
            className="truncate font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {project.name}
          </Link>
          <span className="text-muted-foreground/50 select-none">/</span>
          <span className="flex items-center gap-1.5 font-semibold text-foreground">
            <DatabaseIcon className="size-3.5 text-primary" />
            <span>Knowledge Base</span>
          </span>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSiteSearchOpen(true)}
            aria-label="Search site (Ctrl+K)"
            className="hidden h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground md:inline-flex"
          >
            <SearchIcon data-icon="inline-start" aria-hidden="true" />
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate(`/projects/${project.project_uuid}`)}
            data-testid="kc-kb-back-to-chat-btn"
          >
            <MessageSquareIcon data-icon="inline-start" />
            <span>Back to Agent Chat</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={toggleTheme}
            aria-label={
              store.theme === 'dark'
                ? 'Switch workspace to light mode'
                : 'Switch workspace to dark mode'
            }
          >
            {store.theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main
        id="main-content"
        tabIndex={-1}
        className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 outline-none sm:px-6 sm:py-8"
      >
        {/* Page Title + Upload Action Header */}
        <section
          aria-labelledby="kb-page-heading"
          className="flex flex-col justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-end"
        >
          <div className="flex flex-col gap-1.5">
            <h1
              id="kb-page-heading"
              className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
              Project Knowledge Base
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Manage all uploaded documents for <strong>{project.name}</strong>, inspect indexed page and paragraph passages (<code>p. X, ¶ Y</code>), and keep Vector RAG and the internal Knowledge Graph synchronized.
            </p>
            <LastUpdatedBadge date={latestDocUpdatedAt} label="Corpus updated" />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => {
                void handleUploadFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <Button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              data-testid="kc-kb-upload-btn"
            >
              {uploading || hasInFlightDocs ? (
                <>
                  <Spinner className="size-4" />
                  <span>Indexing Documents...</span>
                </>
              ) : (
                <>
                  <UploadIcon data-icon="inline-start" />
                  <span>Upload Documents</span>
                </>
              )}
            </Button>
          </div>
        </section>

        {/* Status Banner */}
        {statusBanner && (
          <div
            role="status"
            className={cn(
              'flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 font-mono text-xs',
              statusBanner.kind === 'ok'
                ? 'border-primary/40 bg-primary/10 text-foreground'
                : 'border-destructive/40 bg-destructive/10 text-destructive',
            )}
          >
            <div className="flex items-center gap-2">
              {statusBanner.kind === 'ok' ? (
                <CheckCircle2Icon className="size-4 shrink-0 text-primary" />
              ) : (
                <AlertTriangleIcon className="size-4 shrink-0 text-destructive" />
              )}
              <span>{statusBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss notification"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        )}

        {/* Corpus Telemetry Strip */}
        <section
          aria-label="Knowledge Base Telemetry"
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          <div className="flex flex-col justify-between gap-2 rounded-lg border border-border bg-card/90 p-4 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Uploaded Documents</span>
              <FileTextIcon className="size-4 text-primary" />
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-semibold text-foreground tabular-nums">
                {readyDocuments.length}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  / {project.max_docs}
                </span>
              </span>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {Math.round(
                  (readyDocuments.length / Math.max(1, project.max_docs)) * 100,
                )}
                % capacity
              </span>
            </div>
            <Progress
              value={Math.min(
                100,
                Math.round(
                  (readyDocuments.length / Math.max(1, project.max_docs)) * 100,
                ),
              )}
            />
          </div>

          <div className="flex flex-col justify-between gap-2 rounded-lg border border-border bg-card/90 p-4 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Indexed Pages &amp; Corpus Volume</span>
              <BookOpenIcon className="size-4 text-primary" />
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-semibold text-foreground tabular-nums">
                {totalPagesIndexed}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  pages
                </span>
              </span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {(totalSizeBytes / 1024).toFixed(1)} KB total
              </span>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">
              Page &amp; paragraph coordinates (p. X, ¶ Y) active
            </span>
          </div>

          <div className="flex flex-col justify-between gap-2 rounded-lg border border-border bg-card/90 p-4 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Vector RAG &amp; Graph Sync</span>
              <ShieldCheckIcon className="size-4 text-primary" />
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-lg font-semibold text-foreground">
                Cascade Synced
              </span>
              <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                pgvector + Neo4j
              </Badge>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">
              Deleting a source purges its RAG chunks &amp; graph entities
            </span>
          </div>
        </section>

        {/* Filter & Search Toolbar */}
        <section
          aria-label="Filter and search documents"
          className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"
        >
          <div className="relative flex-1 sm:max-w-sm">
            <label htmlFor="kb-doc-search" className="sr-only">
              Search uploaded documents
            </label>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="kb-doc-search"
              type="search"
              placeholder="Filter by filename or summary..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>

          <div
            role="group"
            aria-label="Filter documents by category"
            className="flex flex-wrap items-center gap-1.5"
          >
            {(
              [
                { id: 'all', label: `All (${allProjectDocuments.length})` },
                { id: 'document', label: 'Documents' },
                { id: 'table', label: 'Tables & CSV' },
                { id: 'visual', label: 'Diagrams & Images' },
              ] as const
            ).map((tab) => (
              <Button
                key={tab.id}
                type="button"
                variant={categoryFilter === tab.id ? 'default' : 'outline'}
                size="xs"
                onClick={() => setCategoryFilter(tab.id)}
                className="font-mono text-xs tabular-nums"
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </section>

        {/* Uploaded Documents Table (Responsive Table Pattern) */}
        <section aria-labelledby="kb-documents-table-heading">
          <h2 id="kb-documents-table-heading" className="sr-only">
            Uploaded Project Documents
          </h2>

          {filteredDocuments.length === 0 ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                void handleUploadFiles(e.dataTransfer.files)
              }}
            >
              <Empty className="border border-dashed border-border bg-card/50 py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <DatabaseIcon />
                  </EmptyMedia>
                  <EmptyTitle>
                    {allProjectDocuments.length === 0
                      ? 'No documents in this Knowledge Base yet'
                      : 'No documents match your filter'}
                  </EmptyTitle>
                  <EmptyDescription>
                    {allProjectDocuments.length === 0
                      ? `Drag and drop files here (${SUPPORTED_EXTENSIONS.join(', ')}) or click Upload Documents to index passages with page and paragraph citations.`
                      : 'Try clearing your search query or switching the category filter.'}
                  </EmptyDescription>
                </EmptyHeader>
                {allProjectDocuments.length === 0 && (
                  <EmptyContent>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <PlusIcon data-icon="inline-start" />
                      Select Files to Upload
                    </Button>
                  </EmptyContent>
                )}
              </Empty>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card/95 shadow-2xs">
              <table
                className="w-full border-collapse text-left text-xs"
                data-testid="kc-kb-documents-table"
              >
                <caption className="sr-only">
                  Uploaded documents in {project.name}
                </caption>
                <thead>
                  <tr className="border-b border-border bg-muted/40 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-medium">
                      Document &amp; Summary
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Kind
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Pages
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Size
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {filteredDocuments.map((doc) => {
                    const DocIcon =
                      doc.doc_kind === 'architecture_diagram' ||
                      doc.doc_kind === 'photo' ||
                      doc.doc_kind === 'screenshot'
                        ? ImageIcon
                        : doc.doc_kind === 'table'
                          ? FileSpreadsheetIcon
                          : FileTextIcon

                    return (
                      <tr
                        key={doc.doc_uuid}
                        className="transition-colors hover:bg-muted/25"
                      >
                        <td className="max-w-md px-4 py-3.5 align-top">
                          <div className="flex items-start gap-2.5">
                            <DocIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <button
                                type="button"
                                onClick={() => void handleOpenInspector(doc)}
                                className="truncate text-left text-xs font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline"
                              >
                                {doc.filename}
                              </button>
                              <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                                {doc.description || 'Indexed source document'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 align-top font-mono text-[11px] text-muted-foreground">
                          {doc.doc_kind.replace(/_/g, ' ')}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 align-top font-mono text-[11px] text-foreground tabular-nums">
                          {doc.page_count ? `pp. 1–${doc.page_count}` : 'p. 1'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 align-top font-mono text-[11px] text-muted-foreground tabular-nums">
                          {(doc.size_bytes / 1024).toFixed(1)} KB
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 align-top">
                          <Badge
                            variant={
                              doc.status === 'ready' ? 'secondary' : 'outline'
                            }
                            className="font-mono text-[10px] uppercase"
                          >
                            {doc.status === 'ready'
                              ? 'RAG + Graph Ready'
                              : doc.status}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right align-top">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              onClick={() => void handleOpenInspector(doc)}
                              className="font-mono text-[11px]"
                              title="Inspect indexed passages with page and paragraph numbers"
                            >
                              <BookOpenIcon data-icon="inline-start" />
                              Passages
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              onClick={() => void handleCheckConflicts(doc)}
                              className="font-mono text-[11px]"
                              title="Check for contradictions against existing project decisions"
                            >
                              Conflicts
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => setDeleteTargetDoc(doc)}
                              aria-label={`Delete ${doc.filename}`}
                              title="Delete from Knowledge Base, Vector RAG, and Knowledge Graph"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2Icon />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Project Artifacts Section (Promote to Knowledge Base or Install) */}
        {artifacts.length > 0 && (
          <section
            aria-labelledby="kb-artifacts-heading"
            className="flex flex-col gap-3 border-t border-border pt-6"
          >
            <div className="flex flex-col gap-1">
              <h2
                id="kb-artifacts-heading"
                className="flex items-center gap-2 text-base font-semibold text-foreground"
              >
                <LayersIcon className="size-4 text-primary" />
                <span>Synthesized Project Artifacts ({artifacts.length})</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Promote any generated artifact into the project Knowledge Base so future answers cite its sections and paragraphs, or install it locally.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {artifacts.map((art) => (
                <div
                  key={art.artifact_uuid}
                  className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-card p-3.5 shadow-2xs"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <Badge
                        variant="secondary"
                        className="font-mono text-[10px] uppercase"
                      >
                        {art.type.replace(/_/g, ' ')}
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                        v{art.current_version}
                      </span>
                    </div>
                    <h3 className="truncate text-xs font-semibold text-foreground">
                      {art.title}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      disabled={promotingArtifactId === art.artifact_uuid}
                      onClick={() => void handlePromoteArtifact(art)}
                      className="font-mono text-[10px]"
                    >
                      <DatabaseIcon data-icon="inline-start" />
                      Add to KB
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        void handleInstallArtifact(art.artifact_uuid, 'md')
                      }
                      className="font-mono text-[10px]"
                    >
                      <DownloadIcon data-icon="inline-start" />
                      .MD
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        void handleInstallArtifact(art.artifact_uuid, 'pdf')
                      }
                      className="font-mono text-[10px]"
                    >
                      .PDF
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        void handleInstallArtifact(art.artifact_uuid, 'docx')
                      }
                      className="font-mono text-[10px]"
                    >
                      .DOCX
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* DIALOG 1: Passage Inspector (`p. X, ¶ Y`) */}
      <Dialog open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <DialogContent
          data-workspace-theme={store.theme}
          className="flex max-h-[88vh] flex-col sm:max-w-3xl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <BookOpenIcon className="size-4 text-primary" />
              <span className="truncate">
                {inspectedDoc?.filename || 'Document Passages'}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Every indexed passage is tagged with its exact page and paragraph coordinates (<code>p. X, ¶ Y</code>) for verifiable citations.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <label htmlFor="kb-chunk-filter" className="sr-only">
              Filter passages
            </label>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="kb-chunk-filter"
              type="search"
              placeholder="Filter passages by text, section heading, or page (e.g. p. 2, ¶ 1)..."
              value={chunkSearchQuery}
              onChange={(e) => setChunkSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-card/40 p-3">
            {loadingChunks ? (
              <div
                role="status"
                aria-label="Loading indexed passages"
                className="flex flex-col gap-2.5"
              >
                {[0, 1, 2].map((idx) => (
                  <div
                    key={idx}
                    className="flex flex-col gap-2 rounded-lg border border-border/80 bg-card p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Skeleton className="h-4 w-44" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton className="h-12 w-full" />
                  </div>
                ))}
                <span className="sr-only">Loading indexed passages...</span>
              </div>
            ) : filteredChunks.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                No passages match your filter.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {filteredChunks.map((chunk) => (
                  <div
                    key={chunk.chunk_id}
                    className="flex flex-col gap-1.5 rounded-lg border border-border/80 bg-card p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <Badge
                          variant="secondary"
                          className="font-mono text-[10px] tabular-nums"
                        >
                          {chunk.page_label}
                        </Badge>
                        <span className="font-medium text-foreground">
                          {chunk.heading_path || 'Document Root'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                          Passage #{chunk.ordinal + 1} · {chunk.kind}
                        </span>
                        <CopyButton
                          value={`"${chunk.text}" — ${inspectedDoc?.filename || 'Document'} (${chunk.page_label})`}
                          ariaLabel={`Copy passage ${chunk.ordinal + 1}`}
                        />
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed text-foreground">
                      {chunk.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setInspectorOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: Conflict Analysis */}
      <Dialog open={conflictModalOpen} onOpenChange={setConflictModalOpen}>
        <DialogContent
          data-workspace-theme={store.theme}
          className="sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle>Architectural Conflict Check</DialogTitle>
            <DialogDescription>
              Checking <strong>{conflictTargetDoc?.filename}</strong> against active project decisions and specifications.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 overflow-y-auto py-2">
            {checkingConflicts ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
                <Spinner className="size-4 text-primary" />
                <span>Comparing passages against project decisions...</span>
              </div>
            ) : conflictItems.length === 0 ? (
              <div className="flex items-center gap-2.5 rounded-lg border border-primary/30 bg-primary/10 p-4 text-xs text-foreground">
                <CheckCircle2Icon className="size-4 shrink-0 text-primary" />
                <span>
                  No contradictions detected between{' '}
                  <strong>{conflictTargetDoc?.filename}</strong> and existing project decisions.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {conflictItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">
                        {item.node_name}
                      </span>
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px] uppercase text-destructive"
                      >
                        {item.severity}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">{item.explanation}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConflictModalOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: Confirm Cascade Document Deletion */}
      <ConfirmDialog
        open={Boolean(deleteTargetDoc)}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetDoc(null)
        }}
        title="Delete Document from Knowledge Base"
        description={
          <>
            Deleting <strong>{deleteTargetDoc?.filename}</strong> permanently removes its indexed passages from Vector/BM25 RAG and prunes its orphaned entities and relationships from the Knowledge Graph.
          </>
        }
        confirmLabel="Delete from RAG & Graph"
        variant="destructive"
        loading={Boolean(deletingDocId)}
        theme={store.theme}
        confirmTestId="kc-confirm-delete-doc-btn"
        onConfirm={handleConfirmDeleteDocument}
      />
    </div>
  )
}

export default KnowledgeBasePage
