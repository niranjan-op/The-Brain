import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  ArrowLeftIcon,
  ArrowUpIcon,
  BookOpenIcon,
  ChevronDownIcon,
  CpuIcon,
  DatabaseIcon,
  DownloadIcon,
  EyeIcon,
  FileCodeIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderKanbanIcon,
  GlobeIcon,
  ImageIcon,
  KeyRoundIcon,
  LayersIcon,
  LockIcon,
  MoonIcon,
  MoreHorizontalIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  PencilIcon,
  PlusIcon,
  SearchCheckIcon,
  SearchIcon,
  SettingsIcon,
  Share2Icon,
  SparklesIcon,
  SquarePenIcon,
  SunIcon,
  Trash2Icon,
  UploadIcon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react'
import { BrandGlyph } from '../components/patterns/GraphPatterns'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { CopyButton } from '../components/shared/CopyButton'
import { LastUpdatedBadge } from '../components/shared/LastUpdatedBadge'
import { PasswordInput } from '../components/shared/PasswordInput'
import {
  Attachment,
  AttachmentAction,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '../components/ui/attachment'
import { AuraBlob } from '../components/ui/aura-blob'
import { AgentMarkdown } from '../components/chat/AgentMarkdown'
import { MessageActions } from '../components/chat/MessageActions'
import { Orb } from '../components/ui/orb'
import { Badge } from '../components/ui/badge'
import { Bubble, BubbleContent } from '../components/ui/bubble'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from '../components/ui/code-block'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../components/ui/empty'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from '../components/ui/field'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '../components/ui/hover-card'
import { Input } from '../components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '../components/ui/input-group'
import {
  Message,
  MessageAvatar,
  MessageContent,
} from '../components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '../components/ui/message-scroller'
import { Progress } from '../components/ui/progress'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { Spinner } from '../components/ui/spinner'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs'
import { Textarea } from '../components/ui/textarea'
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '../components/ui/trace'
import { useAuth } from '../lib/auth'
import {
  SUPPORTED_EXTENSIONS,
  addArtifactToKbApi,
  createConversationApi,
  createProjectInviteApi,
  deleteArtifactApi,
  deleteConversationApi,
  deleteDocumentApi,
  deleteProjectApi,
  deleteProjectInviteApi,
  exportArtifactApi,
  fetchArtifactDetailApi,
  fetchConversationDetailApi,
  fetchDocumentChunksApi,
  fetchProjectArtifactsApi,
  fetchProjectDocumentsApi,
  fetchUsageSummaryApi,
  generateArtifactApi,
  getEffectiveIdToken,
  updateConversationApi,
  updateExcludedSourcesApi,
  updateProjectApi,
  updateSearchLimitsApi,
  type ArtifactDetailRecord,
  type ArtifactExportFormat,
  type ArtifactRecord,
  type DocumentChunkRecord,
  type UsageSummaryRecord,
} from '../lib/api'
import {
  getLlmByokKey,
  getSerpApiKey,
  setAgentOrbStyle,
  subscribeAgentOrbStyle,
  loadSearchLimits,
  loadWorkspaceState,
  MANAGED_SEARCHES_PER_USER_PER_DAY,
  mapApiDocumentToWorkspace,
  mapApiMessageToWorkspace,
  queryWorkspaceAgent,
  removeProjectFromState,
  runThemeViewTransition,
  saveProjectLocalMeta,
  saveSearchLimits,
  saveWorkspaceState,
  setAppTheme,
  SERP_MAX_PER_HOUR,
  SERP_MAX_PER_MONTH,
  setLlmByokKey,
  setSerpApiKey,
  subscribeAppTheme,
  syncProjectsWithBackend,
  syncProjectWorkspaceData,
  uploadWorkspaceDocument,
  validateSearchLimits,
  type AgentOrbStyle,
  type AgentQueryMode,
  type ConversationVisibility,
  type EffortLevel,
  type ExecutionMode,
  type InviteRole,
  type MessageTraceStep,
  type SearchLimits,
  type WorkspaceConversation,
  type WorkspaceDocument,
  type WorkspaceMessage,
} from '../lib/workspaceStore'
import { cn } from '../lib/utils'

const MODELS = [
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
] as const

const EFFORTS: { id: EffortLevel; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
]

const STARTER_PROMPTS = [
  'Summarize the active documents and key architectural decisions',
  'How does unticking a source in the sidebar filter RAG and Neo4j queries?',
  'Which earlier decisions were superseded and why?',
]

const JARVIS_GREETINGS = [
  (name: string) => `Ready when you are${name ? `, ${name}` : ''}.`,
  (name: string) => `${name || 'Chief'} returns. All diagnostics operational.`,
  (name: string) => `Standing by for your instructions${name ? `, ${name}` : ''}.`,
  (name: string) => `At your service${name ? `, ${name}` : ''}. Where shall we begin?`,
  (name: string) => `Systems calibrated and ready for your command${name ? `, ${name}` : ''}.`,
  (name: string) => `All neural matrices online. What's on your mind${name ? `, ${name}` : ''}?`,
  (name: string) => `Awaiting your query${name ? `, ${name}` : ''}. Power levels at optimum.`,
  (name: string) => `How may I assist you today${name ? `, ${name}` : ''}?`,
  (name: string) => `Cognitive synthesis engaged. Ready when you are${name ? `, ${name}` : ''}.`,
  (name: string) => `Good to have you back${name ? `, ${name}` : ''}. The knowledge graph is primed.`,
  (name: string) => `Protocols initiated. What are we exploring today${name ? `, ${name}` : ''}?`,
  (name: string) => `Sensors and retrieval engines at your disposal${name ? `, ${name}` : ''}.`,
  (name: string) => `Always a pleasure${name ? `, ${name}` : ''}. How can I assist?`,
  (name: string) => `Running telemetry checks${name ? `, ${name}` : ''}. All systems green.`,
  (name: string) => `Thought synthesis online. The floor is yours${name ? `, ${name}` : ''}.`,
]

interface AgentOrbProps {
  styleType: AgentOrbStyle
  variant: 'hero' | 'avatar' | 'mini'
  thinking?: boolean
  color: string
  midColor: string
  deepColor: string
  backgroundColor?: string
  cursorInteraction?: boolean
  className?: string
}

function AgentOrb({
  styleType,
  variant,
  thinking = false,
  color,
  midColor,
  deepColor,
  backgroundColor = 'transparent',
  cursorInteraction = true,
  className = 'size-full',
}: AgentOrbProps): React.ReactElement {
  if (styleType === 'ring') {
    return (
      <Orb
        variant={variant}
        thinking={thinking}
        colors={[color, midColor, deepColor]}
        backgroundColor={backgroundColor}
        rotateOnHover={cursorInteraction}
        followCursor={cursorInteraction}
        intro={false}
        className={className}
      />
    )
  }

  return (
    <AuraBlob
      variant={variant}
      thinking={thinking}
      color={color}
      midColor={midColor}
      deepColor={deepColor}
      backgroundColor={backgroundColor}
      cursorInteraction={cursorInteraction}
      className={className}
    />
  )
}

interface AgentResponseOrbAvatarProps {
  color: string
  midColor: string
  deepColor: string
  thinking: boolean
  orbStyle?: AgentOrbStyle
  originRectRef: React.MutableRefObject<DOMRect | null>
}

function AgentResponseOrbAvatar({
  color,
  midColor,
  deepColor,
  thinking,
  orbStyle = 'sphere',
  originRectRef,
}: AgentResponseOrbAvatarProps): React.ReactElement {
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const el = wrapperRef.current
    const fromRect = originRectRef.current
    if (!el || !fromRect) return
    originRectRef.current = null

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const toRect = el.getBoundingClientRect()
    if (!toRect.width || !toRect.height) return

    const dx =
      fromRect.left + fromRect.width / 2 - (toRect.left + toRect.width / 2)
    const dy =
      fromRect.top + fromRect.height / 2 - (toRect.top + toRect.height / 2)
    const scale = Math.max(1, fromRect.width / toRect.width)

    el.style.zIndex = '40'
    const anim = el.animate(
      [
        {
          transform: `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`,
        },
        {
          transform: 'translate3d(0px, 0px, 0) scale(1)',
        },
      ],
      {
        duration: 680,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    )
    anim.onfinish = () => {
      el.style.zIndex = ''
    }
    anim.oncancel = () => {
      el.style.zIndex = ''
    }
  }, [originRectRef])

  return (
    <div
      ref={wrapperRef}
      className="relative size-8 will-change-transform"
      title={
        thinking
          ? 'Knowledge Cartographer is thinking...'
          : 'Knowledge Cartographer Agent'
      }
      data-testid={thinking ? 'kc-agent-orb-thinking' : 'kc-agent-orb-avatar'}
      data-agent-state={thinking ? 'thinking' : 'idle'}
      data-orb-style={orbStyle}
    >
      <AgentOrb
        styleType={orbStyle}
        variant="avatar"
        thinking={thinking}
        color={color}
        midColor={midColor}
        deepColor={deepColor}
        backgroundColor="transparent"
        cursorInteraction
        className="size-full"
      />
    </div>
  )
}

export function ProjectWorkspacePage(): React.ReactElement {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [store, setStore] = useState(() => loadWorkspaceState())
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  const [usageSummary, setUsageSummary] = useState<UsageSummaryRecord | null>(null)
  const [pendingTraceSteps, setPendingTraceSteps] = useState<MessageTraceStep[]>([])

  // Sidebar visibility states
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)
  const [rightSidebarTab, setRightSidebarTab] = useState<'sources' | 'artifacts'>('sources')

  // Artifacts state
  const [projectArtifacts, setProjectArtifacts] = useState<ArtifactRecord[]>([])
  const [artifactBanner, setArtifactBanner] = useState<{
    kind: 'ok' | 'err'
    text: string
  } | null>(null)
  const [createArtifactDialogOpen, setCreateArtifactDialogOpen] = useState(false)
  const [artifactTypeDraft, setArtifactTypeDraft] = useState<
    'architecture_plan' | 'adr' | 'prd' | 'tech_report' | 'diagram'
  >('architecture_plan')
  const [artifactTitleDraft, setArtifactTitleDraft] = useState('')
  const [artifactInstructionsDraft, setArtifactInstructionsDraft] = useState('')
  const [generatingArtifact, setGeneratingArtifact] = useState(false)
  const [selectedArtifactDetail, setSelectedArtifactDetail] =
    useState<ArtifactDetailRecord | null>(null)
  const [artifactPreviewOpen, setArtifactPreviewOpen] = useState(false)
  const [loadingArtifactDetail, setLoadingArtifactDetail] = useState(false)
  const [promotingArtifactId, setPromotingArtifactId] = useState<string | null>(null)
  const [exportingArtifactKey, setExportingArtifactKey] = useState<string | null>(null)

  // Source Passage Inspector state (exact page & paragraph inspection)
  const [passageInspectorOpen, setPassageInspectorOpen] = useState(false)
  const [inspectedDocMeta, setInspectedDocMeta] = useState<{
    docUuid: string
    filename: string
    targetPage?: number
    targetPara?: number
    targetChunkId?: string
    highlightExcerpt?: string
  } | null>(null)
  const [inspectedChunks, setInspectedChunks] = useState<DocumentChunkRecord[]>([])
  const [loadingInspectedChunks, setLoadingInspectedChunks] = useState(false)

  // Current project lookup
  const project = useMemo(
    () => store.projects.find((p) => p.project_uuid === projectId),
    [store.projects, projectId],
  )

  // Persisted conversations in this project (unprompted new conversations stay in draft until first message)
  const projectConversations = useMemo(
    () =>
      store.conversations.filter(
        (c) => c.project_uuid === (project?.project_uuid || projectId),
      ),
    [store.conversations, project, projectId],
  )

  const [activeConvoUuid, setActiveConvoUuid] = useState<string>(() => {
    const first = store.conversations.find((c) => c.project_uuid === projectId)
    return first?.convo_uuid || 'draft'
  })

  const [isDraftConvo, setIsDraftConvo] = useState<boolean>(() => {
    const first = store.conversations.find((c) => c.project_uuid === projectId)
    return !first
  })

  const [draftExcludedDocUuids, setDraftExcludedDocUuids] = useState<string[]>([])
  const [newConvoVisibility] = useState<ConversationVisibility>('shared')
  const [convoSearchQuery, setConvoSearchQuery] = useState('')
  const [jarvisGreetingIndex, setJarvisGreetingIndex] = useState(0)

  const userGreetingName = useMemo(() => {
    const raw = user?.displayName?.trim() || user?.email?.split('@')[0]?.trim() || ''
    if (!raw || raw.toLowerCase().startsWith('dev_user')) {
      return 'Sir'
    }
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  }, [user?.displayName, user?.email])

  const currentJarvisGreeting = useMemo(() => {
    const template =
      JARVIS_GREETINGS[jarvisGreetingIndex % JARVIS_GREETINGS.length]
    return template(userGreetingName)
  }, [jarvisGreetingIndex, userGreetingName])

  const filteredConversations = useMemo(() => {
    if (!convoSearchQuery.trim()) return projectConversations
    const q = convoSearchQuery.trim().toLowerCase()
    return projectConversations.filter((c) =>
      c.title.toLowerCase().includes(q),
    )
  }, [projectConversations, convoSearchQuery])

  // Ensure activeConvoUuid stays valid when switching projects
  const activeConversation: WorkspaceConversation | undefined = useMemo(() => {
    if (isDraftConvo || activeConvoUuid === 'draft') {
      return {
        convo_uuid: 'draft',
        project_uuid: project?.project_uuid || projectId || '',
        created_by: user?.uid || 'dev_user_1',
        title: 'New conversation',
        visibility: newConvoVisibility,
        excluded_doc_uuids: draftExcludedDocUuids,
        created_at: '',
        updated_at: '',
      }
    }
    const match = projectConversations.find(
      (c) => c.convo_uuid === activeConvoUuid,
    )
    if (!match && projectConversations.length > 0) {
      return projectConversations[0]
    }
    return match
  }, [
    projectConversations,
    activeConvoUuid,
    isDraftConvo,
    project?.project_uuid,
    projectId,
    user?.uid,
    newConvoVisibility,
    draftExcludedDocUuids,
  ])

  // Sync active conversation only when switching projects
  const prevProjectIdRef = useRef(projectId)
  useEffect(() => {
    if (prevProjectIdRef.current !== projectId) {
      prevProjectIdRef.current = projectId
      const first = store.conversations.find((c) => c.project_uuid === projectId)
      if (first) {
        setActiveConvoUuid(first.convo_uuid)
        setIsDraftConvo(false)
      } else {
        setActiveConvoUuid('draft')
        setIsDraftConvo(true)
      }
      setDraftExcludedDocUuids([])
    }
  }, [projectId, store.conversations])

  // Documents in this project whose preprocessing & chunking completed end to end
  const projectDocuments = useMemo(
    () =>
      store.documents.filter(
        (d) =>
          d.project_uuid === (project?.project_uuid || projectId) &&
          d.status === 'ready',
      ),
    [store.documents, project, projectId],
  )

  const inFlightProjectDocuments = useMemo(
    () =>
      store.documents.filter(
        (d) =>
          d.project_uuid === (project?.project_uuid || projectId) &&
          ['pending', 'uploaded', 'processing'].includes(String(d.status)),
      ),
    [store.documents, project, projectId],
  )

  // Messages in active conversation
  const conversationMessages = useMemo(
    () =>
      store.messages.filter(
        (m) => m.convo_uuid === activeConversation?.convo_uuid,
      ),
    [store.messages, activeConversation],
  )

  // Active source scope (`conversation_excluded_sources`)
  const excludedDocUuids = useMemo(
    () => activeConversation?.excluded_doc_uuids || [],
    [activeConversation],
  )

  const includedDocuments = useMemo(
    () =>
      projectDocuments.filter(
        (doc) => !excludedDocUuids.includes(doc.doc_uuid),
      ),
    [projectDocuments, excludedDocUuids],
  )


  // Prompt composer & AI Elements controls
  const [promptInput, setPromptInput] = useState('')
  const [selectedModel, setSelectedModel] = useState<string>(MODELS[0].id)
  const [selectedEffort, setSelectedEffort] = useState<EffortLevel>('medium')
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('managed')
  const [researchMode, setResearchMode] = useState<AgentQueryMode>('normal')
  const [stagedAttachments, setStagedAttachments] = useState<
    { id: string; name: string; size_bytes: number }[]
  >([])
  const [sendingMessage, setSendingMessage] = useState(false)
  const sendingMessageRef = useRef(false)
  const [pendingAiMessageId, setPendingAiMessageId] = useState<string | null>(
    null,
  )
  const [streamingMessageUuid, setStreamingMessageUuid] = useState<string | null>(
    null,
  )
  const emptyOrbRef = useRef<HTMLDivElement | null>(null)
  const orbOriginRectRef = useRef<DOMRect | null>(null)

  useEffect(() => {
    setStreamingMessageUuid(null)
  }, [activeConvoUuid])

  // Right sidebar upload controls
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const composerFileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [uploadBanner, setUploadBanner] = useState<{
    kind: 'ok' | 'err'
    text: string
  } | null>(null)

  // Collaborators dialog state
  const [collabDialogOpen, setCollabDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<InviteRole>('edit')
  const [inviteError, setInviteError] = useState<string | null>(null)

  // Editable workspace name state
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [workspaceTitleDraft, setWorkspaceTitleDraft] = useState('')

  // Workspace Settings dialog state (General, Memory, Quotas, SerpApi / BYOK, Delete)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<
    'general' | 'appearance' | 'quotas' | 'keys' | 'danger'
  >('general')
  const [settingsNameDraft, setSettingsNameDraft] = useState('')
  const [settingsDescDraft, setSettingsDescDraft] = useState('')
  const [settingsMemoryDraft, setSettingsMemoryDraft] = useState('')
  const [settingsMemoryEnabled, setSettingsMemoryEnabled] = useState(true)
  const [generalSavedNote, setGeneralSavedNote] = useState<string | null>(null)

  const [serpKeyDraft, setSerpKeyDraft] = useState(() => getSerpApiKey() || '')
  const [savedSerpKeyPresent, setSavedSerpKeyPresent] = useState(() =>
    Boolean(getSerpApiKey()),
  )
  const [llmByokKeyDraft, setLlmByokKeyDraft] = useState(() => getLlmByokKey() || '')
  const [searchLimitsDraft, setSearchLimitsDraft] = useState<SearchLimits>(() =>
    loadSearchLimits(),
  )
  const [searchSettingsMessage, setSearchSettingsMessage] = useState<{
    kind: 'ok' | 'err'
    text: string
  } | null>(null)

  const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{
    kind: 'conversation' | 'document' | 'artifact' | 'invite'
    id: string
    label: string
  } | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const vertexSearchEnabled = Boolean(
    usageSummary?.web_search_status?.vertex_enabled,
  )
  const webSearchConfigured = savedSerpKeyPresent || vertexSearchEnabled

  const openSettingsDialog = (
    tab: 'general' | 'appearance' | 'quotas' | 'keys' | 'danger' = 'general',
  ): void => {
    setSettingsTab(tab)
    handleOpenSettingsDialog(true)
  }

  const handleOpenSettingsDialog = (open: boolean): void => {
    setSettingsDialogOpen(open)
    if (!open) {
      setSettingsTab('general')
      return
    }
    if (open && project) {
      setSettingsNameDraft(project.name)
      setSettingsDescDraft(project.description)
      setSettingsMemoryDraft(project.memory || '')
      setSettingsMemoryEnabled(project.memory_enabled !== false)
      setGeneralSavedNote(null)
      const activeSerp = getSerpApiKey() || ''
      setSerpKeyDraft(activeSerp)
      setSavedSerpKeyPresent(Boolean(activeSerp))
      setLlmByokKeyDraft(getLlmByokKey() || '')
      setSearchLimitsDraft(loadSearchLimits())
      setSearchSettingsMessage(null)
      setDeleteConfirmInput('')
      const token = getEffectiveIdToken(user?.idToken)
      if (token) {
        void fetchUsageSummaryApi(token)
          .then((summary) => {
            setUsageSummary(summary)
            if (summary.search_limits) {
              saveSearchLimits(summary.search_limits)
              setSearchLimitsDraft(summary.search_limits)
            }
          })
          .catch(() => {
            // Usage summary fetch failures are non-blocking for opening Settings
          })
      }
    }
  }

  const handleSaveGeneralAndMemory = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!project) return
    const cleanName = settingsNameDraft.trim()
    if (!cleanName) return
    const cleanDesc = settingsDescDraft.trim()
    const cleanMemory = settingsMemoryDraft.trim()

    setWorkspaceError(null)
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) {
        throw new Error('Authentication required to update project details.')
      }
      if (cleanName !== project.name) {
        await updateProjectApi(token, project.project_uuid, cleanName)
      }
      saveProjectLocalMeta(project.project_uuid, {
        description: cleanDesc,
        memory: cleanMemory,
        memory_enabled: settingsMemoryEnabled,
      })

      updateStore((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.project_uuid === project.project_uuid
            ? {
              ...p,
              name: cleanName,
              description: cleanDesc,
              memory: cleanMemory,
              memory_enabled: settingsMemoryEnabled,
            }
            : p,
        ),
      }))
      setGeneralSavedNote('Project details and memory saved.')
    } catch (err) {
      setGeneralSavedNote(null)
      setWorkspaceError(
        err instanceof Error ? err.message : 'Failed to save project settings.',
      )
    }
  }

  const handleSaveSearchAndApiSettings = async (
    e: React.FormEvent,
  ): Promise<void> => {
    e.preventDefault()
    const validationErr = validateSearchLimits(searchLimitsDraft)
    if (validationErr) {
      setSearchSettingsMessage({ kind: 'err', text: validationErr })
      return
    }
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) {
        throw new Error('Authentication required to save search limits.')
      }
      setSerpApiKey(serpKeyDraft)
      setSavedSerpKeyPresent(Boolean(serpKeyDraft.trim()))
      setSerpKeyDraft(serpKeyDraft.trim())
      setLlmByokKey(llmByokKeyDraft)
      if (llmByokKeyDraft.trim()) {
        setExecutionMode('byok')
      }
      const savedLimits = await updateSearchLimitsApi(token, {
        serp_per_hour: searchLimitsDraft.serp_per_hour,
        serp_per_day: searchLimitsDraft.serp_per_day,
        serp_per_month: searchLimitsDraft.serp_per_month,
      })
      saveSearchLimits(savedLimits)
      setSearchLimitsDraft(savedLimits)
      setSearchSettingsMessage({
        kind: 'ok',
        text: serpKeyDraft.trim()
          ? 'SerpApi key saved for this browser origin and rate limits synced to backend.'
          : 'Search rate limits synced to backend; no personal SerpApi key saved in this browser.',
      })
    } catch (err) {
      setSearchSettingsMessage({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Failed to save search limits.',
      })
    }
  }

  const isDeleteConfirmMatch = Boolean(
    project &&
    (deleteConfirmInput.trim() === project.name ||
      deleteConfirmInput.trim() === `"${project.name}"`),
  )

  const handleDeleteProjectWorkspace = async (): Promise<void> => {
    if (!project || !isDeleteConfirmMatch) return
    setWorkspaceError(null)
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) {
        throw new Error('Authentication required to delete project workspace.')
      }
      await deleteProjectApi(token, project.project_uuid)
      const nextState = removeProjectFromState(store, project.project_uuid)
      setStore(nextState)
      saveWorkspaceState(nextState)
      setSettingsDialogOpen(false)
      navigate('/projects')
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : 'Failed to delete project workspace.',
      )
    }
  }

  const updateStore = (updater: (prev: typeof store) => typeof store): void => {
    setStore((prev) => {
      const next = updater(prev)
      saveWorkspaceState(next)
      return next
    })
  }

  const hasInFlightDocs = inFlightProjectDocuments.length > 0

  // Hydrate project record, documents, conversations, and usage summary from backend
  useEffect(() => {
    if (!projectId) {
      setWorkspaceLoading(false)
      return
    }
    let cancelled = false
    setWorkspaceLoading(true)
    setWorkspaceError(null)
    const token = getEffectiveIdToken(user?.idToken)
    if (!token) {
      setWorkspaceLoading(false)
      return
    }

    const loadWorkspace = async (): Promise<void> => {
      try {
        let currentState = loadWorkspaceState()
        let hasProject = currentState.projects.some(
          (p) => p.project_uuid === projectId,
        )
        if (!hasProject) {
          const mergedProjects = await syncProjectsWithBackend(token, currentState)
          if (cancelled) return
          currentState = { ...currentState, projects: mergedProjects }
          updateStore((prev) => ({
            ...prev,
            projects: mergedProjects,
          }))
          hasProject = mergedProjects.some((p) => p.project_uuid === projectId)
        }
        if (!hasProject) {
          if (!cancelled) setWorkspaceLoading(false)
          return
        }

        const [
          { documents: mappedDocs, conversations: mappedConvos },
          usage,
          artifacts,
        ] = await Promise.all([
          syncProjectWorkspaceData(token, projectId),
          fetchUsageSummaryApi(token).catch(() => null),
          fetchProjectArtifactsApi(token, projectId).catch(() => []),
        ])
        if (cancelled) return

        setProjectArtifacts(artifacts)

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

        if (usage) {
          setUsageSummary(usage)
          if (usage.search_limits) {
            saveSearchLimits(usage.search_limits)
            setSearchLimitsDraft(usage.search_limits)
          }
        }

        setActiveConvoUuid((curr) => {
          if (
            curr !== 'draft' &&
            mappedConvos.some((c) => c.convo_uuid === curr)
          ) {
            return curr
          }
          if (mappedConvos.length > 0) {
            setIsDraftConvo(false)
            return mappedConvos[0].convo_uuid
          }
          setIsDraftConvo(true)
          return 'draft'
        })
      } catch (err) {
        if (!cancelled) {
          setWorkspaceError(
            err instanceof Error
              ? err.message
              : 'Unable to load workspace data from backend.',
          )
        }
      } finally {
        if (!cancelled) setWorkspaceLoading(false)
      }
    }

    void loadWorkspace()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, user?.idToken])

  // Hydrate full conversation messages + citations + exclusions when selecting a persisted conversation
  useEffect(() => {
    if (
      !projectId ||
      isDraftConvo ||
      !activeConvoUuid ||
      activeConvoUuid === 'draft' ||
      sendingMessageRef.current
    ) {
      return
    }
    const token = getEffectiveIdToken(user?.idToken)
    if (!token) return
    const convoExists = store.conversations.some(
      (c) => c.project_uuid === projectId && c.convo_uuid === activeConvoUuid,
    )
    if (!convoExists) return

    let cancelled = false
    void fetchConversationDetailApi(token, projectId, activeConvoUuid)
      .then((detail) => {
        if (cancelled || sendingMessageRef.current) return
        const mappedMessages = (detail.messages || []).map(
          mapApiMessageToWorkspace,
        )
        const excluded = detail.excluded_doc_uuids || []
        updateStore((prev) => ({
          ...prev,
          conversations: prev.conversations.map((c) =>
            c.convo_uuid === activeConvoUuid
              ? {
                ...c,
                title: detail.title || c.title,
                visibility: detail.visibility || c.visibility,
                excluded_doc_uuids: excluded,
                updated_at: detail.updated_at || c.updated_at,
              }
              : c,
          ),
          messages:
            mappedMessages.length > 0
              ? [
                ...prev.messages.filter((m) => m.convo_uuid !== activeConvoUuid),
                ...mappedMessages,
              ]
              : prev.messages,
        }))
      })
      .catch((err) => {
        if (!cancelled) {
          setWorkspaceError(
            err instanceof Error
              ? err.message
              : 'Unable to load conversation messages.',
          )
        }
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, activeConvoUuid, isDraftConvo, user?.idToken])

  // Poll backend documents while any upload is still processing/pending ingestion
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
        .catch(() => {
          // Transient polling errors are retried automatically on the next tick
        })
    }, 2500)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, hasInFlightDocs, user?.idToken])

  useEffect(() => {
    return subscribeAppTheme((nextTheme) => {
      setStore((prev) =>
        prev.theme === nextTheme ? prev : { ...prev, theme: nextTheme },
      )
    })
  }, [])

  useEffect(() => {
    return subscribeAgentOrbStyle((nextStyle) => {
      setStore((prev) =>
        prev.agent_orb_style === nextStyle
          ? prev
          : { ...prev, agent_orb_style: nextStyle },
      )
    })
  }, [])

  const handleSelectOrbStyle = (style: AgentOrbStyle): void => {
    setAgentOrbStyle(style)
    setStore((prev) => ({ ...prev, agent_orb_style: style }))
  }

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

  const handleSaveWorkspaceTitle = async (): Promise<void> => {
    setIsEditingTitle(false)
    if (!project) return
    const clean = workspaceTitleDraft.trim()
    if (!clean || clean === project.name) return
    const previousName = project.name
    updateStore((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.project_uuid === project.project_uuid ? { ...p, name: clean } : p,
      ),
    }))
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) throw new Error('Authentication required to rename project.')
      await updateProjectApi(token, project.project_uuid, clean)
    } catch (err) {
      updateStore((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.project_uuid === project.project_uuid
            ? { ...p, name: previousName }
            : p,
        ),
      }))
      setWorkspaceError(
        err instanceof Error ? err.message : 'Failed to rename project.',
      )
    }
  }

  // Start a new unlogged draft conversation in the workspace
  const handleStartNewConversation = (): void => {
    setJarvisGreetingIndex((prev) => (prev + 1) % JARVIS_GREETINGS.length)
    setIsDraftConvo(true)
    setActiveConvoUuid('draft')
    setDraftExcludedDocUuids([])
    setPromptInput('')
    setStagedAttachments([])
  }

  const handleDeleteConversation = async (convoUuid: string): Promise<void> => {
    if (!project) return
    setWorkspaceError(null)
    try {
      if (convoUuid !== 'draft') {
        const token = getEffectiveIdToken(user?.idToken)
        if (!token) {
          throw new Error('Authentication required to delete conversation.')
        }
        await deleteConversationApi(token, project.project_uuid, convoUuid)
      }
      updateStore((prev) => ({
        ...prev,
        conversations: prev.conversations.filter(
          (c) => c.convo_uuid !== convoUuid,
        ),
        messages: prev.messages.filter((m) => m.convo_uuid !== convoUuid),
      }))
      if (activeConvoUuid === convoUuid) {
        const remainingInProject = projectConversations.filter(
          (c) => c.convo_uuid !== convoUuid,
        )
        if (remainingInProject.length > 0) {
          setActiveConvoUuid(remainingInProject[0].convo_uuid)
          setIsDraftConvo(false)
        } else {
          handleStartNewConversation()
        }
      }
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : 'Failed to delete conversation.',
      )
    }
  }

  const handleToggleConversationVisibility = async (
    convo: WorkspaceConversation,
  ): Promise<void> => {
    if (!project) return
    const nextVis: ConversationVisibility =
      convo.visibility === 'shared' ? 'private' : 'shared'
    const prevVis = convo.visibility
    updateStore((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.convo_uuid === convo.convo_uuid ? { ...c, visibility: nextVis } : c,
      ),
    }))
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) {
        throw new Error('Authentication required to update conversation.')
      }
      await updateConversationApi(token, project.project_uuid, convo.convo_uuid, {
        visibility: nextVis,
      })
    } catch (err) {
      updateStore((prev) => ({
        ...prev,
        conversations: prev.conversations.map((c) =>
          c.convo_uuid === convo.convo_uuid ? { ...c, visibility: prevVis } : c,
        ),
      }))
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : 'Failed to update conversation visibility.',
      )
    }
  }

  const [isRenamingConvo, setIsRenamingConvo] = useState(false)
  const [convoTitleDraft, setConvoTitleDraft] = useState('')

  const handleSaveConvoTitle = async (convoUuid: string): Promise<void> => {
    setIsRenamingConvo(false)
    if (!project) return
    const clean = convoTitleDraft.trim()
    if (!clean) return
    const existing = store.conversations.find((c) => c.convo_uuid === convoUuid)
    const prevTitle = existing?.title
    updateStore((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.convo_uuid === convoUuid ? { ...c, title: clean } : c,
      ),
    }))
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) {
        throw new Error('Authentication required to rename conversation.')
      }
      await updateConversationApi(token, project.project_uuid, convoUuid, {
        title: clean,
      })
    } catch (err) {
      if (prevTitle !== undefined) {
        updateStore((prev) => ({
          ...prev,
          conversations: prev.conversations.map((c) =>
            c.convo_uuid === convoUuid ? { ...c, title: prevTitle } : c,
          ),
        }))
      }
      setWorkspaceError(
        err instanceof Error ? err.message : 'Failed to rename conversation.',
      )
    }
  }

  const persistExcludedSources = async (
    convoUuid: string,
    nextExcluded: string[],
  ): Promise<void> => {
    if (!project) return
    const token = getEffectiveIdToken(user?.idToken)
    if (!token) return
    try {
      await updateExcludedSourcesApi(
        token,
        project.project_uuid,
        convoUuid,
        nextExcluded,
      )
    } catch (err) {
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : 'Failed to update conversation source filters.',
      )
    }
  }

  // Toggle document checkbox in Right Sources Sidebar (`conversation_excluded_sources`)
  const handleToggleSourceDocument = (
    docUuid: string,
    checked: boolean,
  ): void => {
    if (
      isDraftConvo ||
      activeConvoUuid === 'draft' ||
      !activeConversation ||
      activeConversation.convo_uuid === 'draft'
    ) {
      setDraftExcludedDocUuids((prev) => {
        const next = new Set(prev)
        if (checked) {
          next.delete(docUuid)
        } else {
          next.add(docUuid)
        }
        return Array.from(next)
      })
      return
    }

    const currentConvo = activeConversation
    const excludedSet = new Set(currentConvo.excluded_doc_uuids)
    if (checked) {
      excludedSet.delete(docUuid)
    } else {
      excludedSet.add(docUuid)
    }
    const nextExcluded = Array.from(excludedSet)

    updateStore((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.convo_uuid === currentConvo.convo_uuid
          ? {
            ...c,
            excluded_doc_uuids: nextExcluded,
            updated_at: new Date().toISOString(),
          }
          : c,
      ),
    }))
    void persistExcludedSources(currentConvo.convo_uuid, nextExcluded)
  }

  const handleSelectAllSources = (): void => {
    if (
      isDraftConvo ||
      activeConvoUuid === 'draft' ||
      !activeConversation ||
      activeConversation.convo_uuid === 'draft'
    ) {
      setDraftExcludedDocUuids([])
      return
    }
    updateStore((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.convo_uuid === activeConversation.convo_uuid
          ? { ...c, excluded_doc_uuids: [] }
          : c,
      ),
    }))
    void persistExcludedSources(activeConversation.convo_uuid, [])
  }

  const handleClearAllSources = (): void => {
    const allIds = projectDocuments.map((d) => d.doc_uuid)
    if (
      isDraftConvo ||
      activeConvoUuid === 'draft' ||
      !activeConversation ||
      activeConversation.convo_uuid === 'draft'
    ) {
      setDraftExcludedDocUuids(allIds)
      return
    }
    updateStore((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.convo_uuid === activeConversation.convo_uuid
          ? { ...c, excluded_doc_uuids: allIds }
          : c,
      ),
    }))
    void persistExcludedSources(activeConversation.convo_uuid, allIds)
  }

  // Upload document (`POST /upload` + wait for preprocessing & chunking end-to-end)
  const handleUploadFiles = async (
    files: FileList | null,
    attachToComposer = false,
  ): Promise<void> => {
    if (!files || files.length === 0 || !project) return
    setUploadingDoc(true)
    setUploadBanner(null)

    try {
      const uploadedDocs: WorkspaceDocument[] = []
      for (const file of Array.from(files)) {
        const doc = await uploadWorkspaceDocument(
          user?.idToken,
          user?.uid || 'dev_user_1',
          project.project_uuid,
          file,
          (statusText) => setUploadBanner({ kind: 'ok', text: statusText }),
        )
        uploadedDocs.push(doc)
      }

      // Per D022: new uploads are NOT in conversation_excluded_sources, so they are ticked by default
      updateStore((prev) => ({
        ...prev,
        documents: [
          ...uploadedDocs,
          ...prev.documents.filter(
            (existing) => !uploadedDocs.some((u) => u.doc_uuid === existing.doc_uuid),
          ),
        ],
      }))

      if (attachToComposer) {
        setStagedAttachments((prev) => [
          ...prev,
          ...uploadedDocs.map((d) => ({
            id: d.doc_uuid,
            name: d.filename,
            size_bytes: d.size_bytes,
          })),
        ])
      }

      setUploadBanner({
        kind: 'ok',
        text: `Uploaded ${uploadedDocs.map((d) => d.filename).join(', ')} — preprocessing & chunking complete.`,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setUploadBanner({ kind: 'err', text: msg })
    } finally {
      setUploadingDoc(false)
    }
  }

  const handleDeleteDocument = async (docUuid: string): Promise<void> => {
    if (!project) return
    setWorkspaceError(null)
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) {
        throw new Error('Authentication required to delete document.')
      }
      await deleteDocumentApi(token, project.project_uuid, docUuid)
      updateStore((prev) => ({
        ...prev,
        documents: prev.documents.filter((d) => d.doc_uuid !== docUuid),
        conversations: prev.conversations.map((c) => ({
          ...c,
          excluded_doc_uuids: c.excluded_doc_uuids.filter((id) => id !== docUuid),
        })),
      }))
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : 'Failed to delete document.',
      )
    }
  }

  // Send message to agent
  const handleSendMessage = async (overridePrompt?: string): Promise<void> => {
    const text = (overridePrompt ?? promptInput).trim()
    if (!text || sendingMessage || !project) return

    const token = getEffectiveIdToken(user?.idToken)
    if (!token) {
      setWorkspaceError('Authentication required to message the agent.')
      return
    }

    setWorkspaceError(null)
    let activeConvoId = activeConvoUuid
    let targetConvoTitle = activeConversation?.title || 'New research conversation'
    const nowIso = new Date().toISOString()

    const isCurrentDraft =
      isDraftConvo ||
      activeConvoUuid === 'draft' ||
      !activeConversation ||
      activeConversation.convo_uuid === 'draft' ||
      !store.conversations.some((c) => c.convo_uuid === activeConvoUuid)

    sendingMessageRef.current = true
    setSendingMessage(true)
    setPendingTraceSteps([])

    let draftConvoToSave: WorkspaceConversation | null = null
    try {
      if (isCurrentDraft) {
        const cleanTitle = text.length > 48 ? `${text.slice(0, 48).trim()}...` : text
        const createdConvo = await createConversationApi(token, project.project_uuid, {
          title: cleanTitle,
          visibility: newConvoVisibility,
        })
        if (draftExcludedDocUuids.length > 0) {
          await updateExcludedSourcesApi(
            token,
            project.project_uuid,
            createdConvo.convo_uuid,
            draftExcludedDocUuids,
          )
        }
        draftConvoToSave = {
          convo_uuid: createdConvo.convo_uuid,
          project_uuid: createdConvo.project_uuid || project.project_uuid,
          created_by: createdConvo.created_by || user?.uid || 'dev_user_1',
          title: createdConvo.title || cleanTitle,
          visibility: createdConvo.visibility || newConvoVisibility,
          excluded_doc_uuids: [...draftExcludedDocUuids],
          created_at: createdConvo.created_at || nowIso,
          updated_at: createdConvo.updated_at || nowIso,
        }
        activeConvoId = createdConvo.convo_uuid
        targetConvoTitle = draftConvoToSave.title
        setActiveConvoUuid(createdConvo.convo_uuid)
        setIsDraftConvo(false)
        setDraftExcludedDocUuids([])
      }

      const currentAllowedDocUuids = includedDocuments.map((d) => d.doc_uuid)
      const nextAiMessageUuid = crypto.randomUUID()
      const optimisticHumanUuid = crypto.randomUUID()

      if (emptyOrbRef.current) {
        orbOriginRectRef.current = emptyOrbRef.current.getBoundingClientRect()
      }

      const humanMessage: WorkspaceMessage = {
        message_uuid: optimisticHumanUuid,
        convo_uuid: activeConvoId,
        user_uuid: user?.uid || 'dev_user_1',
        content: text,
        type: 'human',
        status: 'answered',
        mode: executionMode,
        model: selectedModel,
        effort: selectedEffort,
        research_mode: researchMode,
        input_tokens: Math.max(12, Math.ceil(text.length / 4)),
        output_tokens: 0,
        source_scope: currentAllowedDocUuids,
        citations: [],
        trace_steps: [],
        attachments: stagedAttachments.length > 0 ? [...stagedAttachments] : undefined,
        created_at: nowIso,
      }

      setPromptInput('')
      setStagedAttachments([])
      setPendingAiMessageId(nextAiMessageUuid)

      const shouldRenameTitle =
        !draftConvoToSave &&
        conversationMessages.length === 0 &&
        (targetConvoTitle === 'New research conversation' ||
          targetConvoTitle === 'Architecture & document overview' ||
          targetConvoTitle === 'New conversation')
      const renamedTitle = text.slice(0, 52)
      if (shouldRenameTitle) {
        void updateConversationApi(token, project.project_uuid, activeConvoId, {
          title: renamedTitle,
        }).catch(() => {
          // Non-fatal auto-title update
        })
      }

      updateStore((prev) => {
        let nextConversations = prev.conversations
        if (draftConvoToSave) {
          nextConversations = [
            draftConvoToSave,
            ...prev.conversations.filter((c) => c.convo_uuid !== 'draft'),
          ]
        } else if (shouldRenameTitle) {
          nextConversations = prev.conversations.map((c) =>
            c.convo_uuid === activeConvoId
              ? {
                ...c,
                title: renamedTitle,
                updated_at: nowIso,
              }
              : c,
          )
        }

        return {
          ...prev,
          conversations: nextConversations,
          messages: [...prev.messages, humanMessage],
        }
      })

      const response = await queryWorkspaceAgent({
        idToken: token,
        projectUuid: project.project_uuid,
        convoUuid: activeConvoId,
        query: text,
        includedDocs: includedDocuments,
        excludedDocUuids,
        mode: executionMode,
        model: selectedModel,
        effort: selectedEffort,
        researchMode,
        onTraceUpdate: (steps) => setPendingTraceSteps(steps),
      })

      const aiMessage: WorkspaceMessage = {
        message_uuid: response.aiMessageUuid || nextAiMessageUuid,
        // Without a server id the export endpoint cannot find this answer.
        local_only: !response.aiMessageUuid,
        convo_uuid: activeConvoId,
        user_uuid: null,
        content: response.content,
        type: 'ai',
        status: 'answered',
        mode: executionMode,
        model: selectedModel,
        effort: selectedEffort,
        research_mode: researchMode,
        input_tokens: response.inputTokens,
        output_tokens: response.outputTokens,
        source_scope: currentAllowedDocUuids,
        citations: response.citations,
        trace_steps: response.traceSteps,
        created_at: new Date().toISOString(),
      }

      setStreamingMessageUuid(aiMessage.message_uuid)

      updateStore((prev) => ({
        ...prev,
        messages: [
          ...prev.messages.map((m) =>
            m.message_uuid === optimisticHumanUuid && response.humanMessageUuid
              ? { ...m, message_uuid: response.humanMessageUuid }
              : m,
          ),
          aiMessage,
        ],
      }))

      if (response.artifacts && response.artifacts.length > 0) {
        setProjectArtifacts((prev) => {
          const newItems = response.artifacts!.filter(
            (a) => !prev.some((existing) => existing.artifact_uuid === a.artifact_uuid),
          )
          return [...newItems, ...prev]
        })
        setRightSidebarOpen(true)
        setRightSidebarTab('artifacts')
        setArtifactBanner({
          kind: 'ok',
          text: `Generated artifact: "${response.artifacts[0].title}"`,
        })
      }

      void fetchUsageSummaryApi(token)
        .then((summary) => setUsageSummary(summary))
        .catch(() => {
          // Non-fatal quota refresh
        })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to send message.'
      setWorkspaceError(msg)
      if (!isCurrentDraft || draftConvoToSave) {
        updateStore((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              message_uuid: crypto.randomUUID(),
              convo_uuid: activeConvoId,
              user_uuid: null,
              content: `Error: ${msg}`,
              type: 'ai',
              status: 'failed',
              mode: executionMode,
              model: selectedModel,
              effort: selectedEffort,
              research_mode: researchMode,
              input_tokens: 0,
              output_tokens: 0,
              source_scope: [],
              citations: [],
              trace_steps: [],
              error: msg,
              created_at: new Date().toISOString(),
            },
          ],
        }))
      }
    } finally {
      sendingMessageRef.current = false
      setSendingMessage(false)
      setPendingAiMessageId(null)
      setPendingTraceSteps([])
    }
  }

  // Add Collaborator in project header modal
  const handleInviteCollaborator = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!project) return
    setInviteError(null)
    const cleanEmail = inviteEmail.trim().toLowerCase()
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setInviteError('Enter a valid email address.')
      return
    }
    const maxAdditional = Math.max(0, project.max_members - 1)
    if (project.invites.length >= maxAdditional) {
      setInviteError(
        `Project member limit reached (${project.max_members} members max).`,
      )
      return
    }
    if (project.invites.some((i) => i.email === cleanEmail)) {
      setInviteError('This collaborator is already invited.')
      return
    }

    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) {
        throw new Error('Authentication required to invite collaborators.')
      }
      const created = await createProjectInviteApi(
        token,
        project.project_uuid,
        cleanEmail,
        inviteRole,
      )
      const nowIso = new Date().toISOString()
      const newInvite = {
        invite_uuid: created.invite_uuid,
        project_uuid: created.project_uuid || project.project_uuid,
        email: created.email || cleanEmail,
        role: created.role || inviteRole,
        invited_by: created.invited_by || user?.uid || 'dev_user_1',
        expires_at:
          created.expires_at ||
          new Date(Date.now() + 7 * 86400000).toISOString(),
        accepted_at: created.accepted_at ?? null,
        created_at: created.created_at || nowIso,
      }

      updateStore((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.project_uuid === project.project_uuid
            ? { ...p, invites: [...p.invites, newInvite] }
            : p,
        ),
      }))
      setInviteEmail('')
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : 'Failed to invite collaborator.',
      )
    }
  }

  const handleRemoveInvite = async (inviteUuid: string): Promise<void> => {
    if (!project) return
    setInviteError(null)
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) {
        throw new Error('Authentication required to remove invite.')
      }
      await deleteProjectInviteApi(token, project.project_uuid, inviteUuid)
      updateStore((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.project_uuid === project.project_uuid
            ? {
              ...p,
              invites: p.invites.filter((i) => i.invite_uuid !== inviteUuid),
            }
            : p,
        ),
      }))
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : 'Failed to remove invite.',
      )
    }
  }

  // Open Source Passage Inspector at exact page & paragraph
  const handleOpenPassageInspector = async (opts: {
    docUuid: string
    filename: string
    targetPage?: number
    targetPara?: number
    targetChunkId?: string
    highlightExcerpt?: string
  }): Promise<void> => {
    if (!project) return
    setInspectedDocMeta(opts)
    setPassageInspectorOpen(true)
    setLoadingInspectedChunks(true)
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) throw new Error('Authentication required to inspect document passages.')
      const chunks = await fetchDocumentChunksApi(token, project.project_uuid, opts.docUuid)
      setInspectedChunks(chunks)
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : 'Failed to load document passages.',
      )
      setInspectedChunks([])
    } finally {
      setLoadingInspectedChunks(false)
    }
  }

  // Generate Project Artifact
  const handleGenerateArtifact = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!project || generatingArtifact) return
    const cleanTitle =
      artifactTitleDraft.trim() ||
      `Project ${artifactTypeDraft.replace(/_/g, ' ').toUpperCase()}`
    setGeneratingArtifact(true)
    setArtifactBanner(null)
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) throw new Error('Authentication required to generate artifact.')
      const created = await generateArtifactApi(token, project.project_uuid, {
        artifact_type: artifactTypeDraft,
        title: cleanTitle,
        instructions: artifactInstructionsDraft.trim() || undefined,
        convo_uuid:
          !isDraftConvo && activeConversation && activeConversation.convo_uuid !== 'draft'
            ? activeConversation.convo_uuid
            : undefined,
        mode: executionMode,
        byokKey: executionMode === 'byok' ? getLlmByokKey() || null : null,
      })
      setProjectArtifacts((prev) => [
        created,
        ...prev.filter((a) => a.artifact_uuid !== created.artifact_uuid),
      ])
      setCreateArtifactDialogOpen(false)
      setArtifactTitleDraft('')
      setArtifactInstructionsDraft('')
      setArtifactBanner({
        kind: 'ok',
        text: `Generated "${created.title}" (v${created.current_version}).`,
      })
      void handlePreviewArtifact(created.artifact_uuid)
    } catch (err) {
      setArtifactBanner({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Failed to generate artifact.',
      })
    } finally {
      setGeneratingArtifact(false)
    }
  }

  const handlePreviewArtifact = async (artifactUuid: string): Promise<void> => {
    if (!project) return
    setArtifactPreviewOpen(true)
    setLoadingArtifactDetail(true)
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) throw new Error('Authentication required to load artifact.')
      const detail = await fetchArtifactDetailApi(token, project.project_uuid, artifactUuid)
      setSelectedArtifactDetail(detail)
    } catch (err) {
      setArtifactBanner({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Failed to load artifact preview.',
      })
      setArtifactPreviewOpen(false)
    } finally {
      setLoadingArtifactDetail(false)
    }
  }

  const handleDownloadArtifact = async (
    artifactUuid: string,
    format: ArtifactExportFormat,
  ): Promise<void> => {
    if (!project) return
    const key = `${artifactUuid}:${format}`
    setExportingArtifactKey(key)
    setArtifactBanner(null)
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) throw new Error('Authentication required to install artifact.')
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
      setArtifactBanner({
        kind: 'ok',
        text: `Installed ${filename} to your device.`,
      })
    } catch (err) {
      setArtifactBanner({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Failed to install artifact.',
      })
    } finally {
      setExportingArtifactKey(null)
    }
  }

  const handlePromoteArtifactToKb = async (artifact: ArtifactRecord): Promise<void> => {
    if (!project) return
    setPromotingArtifactId(artifact.artifact_uuid)
    setArtifactBanner(null)
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) throw new Error('Authentication required to add artifact to knowledge base.')
      const docRecord = await addArtifactToKbApi(
        token,
        project.project_uuid,
        artifact.artifact_uuid,
      )
      const mappedDoc = mapApiDocumentToWorkspace(docRecord)
      updateStore((prev) => ({
        ...prev,
        documents: [
          mappedDoc,
          ...prev.documents.filter((d) => d.doc_uuid !== mappedDoc.doc_uuid),
        ],
      }))
      setArtifactBanner({
        kind: 'ok',
        text: `Added "${mappedDoc.filename}" to Project Knowledge Base & Vector RAG.`,
      })
    } catch (err) {
      setArtifactBanner({
        kind: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Failed to add artifact to knowledge base.',
      })
    } finally {
      setPromotingArtifactId(null)
    }
  }

  const handleDeleteArtifact = async (artifactUuid: string): Promise<void> => {
    if (!project) return
    setArtifactBanner(null)
    try {
      const token = getEffectiveIdToken(user?.idToken)
      if (!token) throw new Error('Authentication required to delete artifact.')
      await deleteArtifactApi(token, project.project_uuid, artifactUuid)
      setProjectArtifacts((prev) =>
        prev.filter((a) => a.artifact_uuid !== artifactUuid),
      )
      if (selectedArtifactDetail?.artifact_uuid === artifactUuid) {
        setArtifactPreviewOpen(false)
        setSelectedArtifactDetail(null)
      }
      setArtifactBanner({
        kind: 'ok',
        text: 'Artifact removed from project.',
      })
    } catch (err) {
      setArtifactBanner({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Failed to delete artifact.',
      })
    }
  }

  const executePendingDelete = async (): Promise<void> => {
    if (!pendingDelete) return
    setConfirmingDelete(true)
    try {
      if (pendingDelete.kind === 'conversation') {
        await handleDeleteConversation(pendingDelete.id)
      } else if (pendingDelete.kind === 'document') {
        await handleDeleteDocument(pendingDelete.id)
      } else if (pendingDelete.kind === 'artifact') {
        await handleDeleteArtifact(pendingDelete.id)
      } else if (pendingDelete.kind === 'invite') {
        await handleRemoveInvite(pendingDelete.id)
      }
      setPendingDelete(null)
    } finally {
      setConfirmingDelete(false)
    }
  }

  // Context window estimate for `ai-elements/context` HoverCard
  const totalConvoTokens = useMemo(() => {
    return conversationMessages.reduce(
      (sum, m) => sum + (m.input_tokens || 0) + (m.output_tokens || 0),
      0,
    )
  }, [conversationMessages])
  const contextPercent = Math.min(
    100,
    Math.max(2, Math.round((totalConvoTokens / 128000) * 100)),
  )

  if (!project) {
    if (workspaceLoading) {
      return (
        <div
          data-workspace-theme={store.theme}
          className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-foreground"
        >
          <Spinner className="size-6 text-primary" />
          <p className="text-xs font-medium text-muted-foreground">
            Loading project workspace...
          </p>
        </div>
      )
    }
    return (
      <div
        data-workspace-theme={store.theme}
        className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-foreground"
      >
        <Empty className="max-w-md border border-border bg-card p-8">
          <EmptyHeader>
            <EmptyTitle>Project workspace not found</EmptyTitle>
            <EmptyDescription>
              {workspaceError
                ? workspaceError
                : `No workspace matches UUID \`${projectId}\`. Return to your dashboard to select or create a workspace.`}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => navigate('/projects')}>
              <ArrowLeftIcon data-icon="inline-start" />
              Back to Workspaces
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  const currentModelLabel =
    MODELS.find((m) => m.id === selectedModel)?.label ?? selectedModel
  const currentEffortLabel =
    EFFORTS.find((e) => e.id === selectedEffort)?.label ?? selectedEffort

  const auraPalette =
    store.theme === 'light'
      ? {
        color: '#6d28d9',
        midColor: '#0284c7',
        deepColor: '#4f46e5',
        bg: '#ffffff',
      }
      : {
        color: '#8b3dff',
        midColor: '#38bdf8',
        deepColor: '#2fd6ff',
        bg: '#111114',
      }

  const currentOrbStyle: AgentOrbStyle = store.agent_orb_style ?? 'sphere'

  const displayMessages: WorkspaceMessage[] =
    sendingMessage && pendingAiMessageId && activeConversation
      ? [
        ...conversationMessages,
        {
          message_uuid: pendingAiMessageId,
          convo_uuid: activeConversation.convo_uuid,
          user_uuid: null,
          type: 'ai',
          content: '',
          model: currentModelLabel,
          mode: executionMode,
          effort: selectedEffort,
          research_mode: researchMode,
          input_tokens: 0,
          output_tokens: 0,
          source_scope: includedDocuments.map((d) => d.doc_uuid),
          citations: [],
          trace_steps: [],
          status: 'streaming',
          created_at: activeConversation.updated_at,
        },
      ]
      : conversationMessages

  return (
    <div
      data-workspace-theme={store.theme}
      className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground"
    >
      {/* Top Workspace Header Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-card via-card/95 to-card px-3 shadow-2xs backdrop-blur-sm sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setLeftSidebarOpen((prev) => !prev)}
            aria-label={
              leftSidebarOpen
                ? 'Hide conversations panel'
                : 'Show conversations panel'
            }
            title={
              leftSidebarOpen
                ? 'Hide conversations panel'
                : 'Show conversations panel'
            }
          >
            {leftSidebarOpen ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
          </Button>

          <div className="flex min-w-0 items-center gap-1.5">
            <Link
              to="/projects"
              className="flex shrink-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
              title="Back to all workspaces"
            >
              <BrandGlyph size={20} />
              <span className="text-sm font-medium">Workspaces</span>
            </Link>

            <span className="text-sm text-muted-foreground/60 select-none">
              /
            </span>

            <input
              type="text"
              value={isEditingTitle ? workspaceTitleDraft : (project.name || '')}
              onFocus={() => {
                setWorkspaceTitleDraft(project.name)
                setIsEditingTitle(true)
              }}
              onChange={(e) => setWorkspaceTitleDraft(e.target.value)}
              onBlur={handleSaveWorkspaceTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur()
                } else if (e.key === 'Escape') {
                  setWorkspaceTitleDraft(project.name)
                  setIsEditingTitle(false)
                  e.currentTarget.blur()
                }
              }}
              className="field-sizing-content h-7 max-w-xs truncate rounded border border-transparent bg-transparent px-1 text-sm font-semibold tracking-tight text-foreground transition-colors hover:border-border hover:bg-muted/30 focus:border-input focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring sm:max-w-md sm:text-base md:max-w-xl"
              title="Click to rename workspace"
              aria-label="Workspace Name"
            />
            <Badge variant="secondary" className="hidden shrink-0 font-mono text-[10px] uppercase sm:inline-flex">
              {project.role}
            </Badge>
          </div>
        </div>

        {/* Right Header Controls: Knowledge Base, Manage Access Dialog, Workspace Settings Dialog, Theme Toggle, Sources Sidebar Toggle */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate(`/projects/${project.project_uuid}/knowledge-base`)}
            title="Open dedicated Knowledge Base manager"
            data-testid="kc-open-kb-page-btn"
          >
            <DatabaseIcon data-icon="inline-start" />
            <span className="hidden md:inline">Knowledge Base</span>
            <Badge
              variant="secondary"
              className="ml-0.5 px-1.5 py-0 font-mono text-[10px] tabular-nums"
            >
              {projectDocuments.length}
            </Badge>
          </Button>

          {/* Manage Access / Collaborators Dialog (`invites` & `project_members`) */}
          <Dialog open={collabDialogOpen} onOpenChange={setCollabDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <UsersIcon data-icon="inline-start" />
                <span>Manage Access</span>
              </Button>
            </DialogTrigger>
            <DialogContent data-workspace-theme={store.theme} className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Workspace Collaborators</DialogTitle>
                <DialogDescription>
                  Manage team members and email invites for <strong>{project.name}</strong> (up to {project.max_members} members).
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleInviteCollaborator} className="flex flex-col gap-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="workspace-invite-email">
                      Invite by Email
                    </FieldLabel>
                    <div className="flex gap-2">
                      <Input
                        id="workspace-invite-email"
                        type="email"
                        placeholder="researcher@team.dev"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="flex-1"
                      />
                      <Select
                        value={inviteRole}
                        onValueChange={(v) => setInviteRole(v as InviteRole)}
                      >
                        <SelectTrigger className="w-28" aria-label="Role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent data-workspace-theme={store.theme}>
                          <SelectGroup>
                            <SelectItem value="edit">Edit</SelectItem>
                            <SelectItem value="view">View</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <Button type="submit" size="sm">
                        <UserPlusIcon data-icon="inline-start" />
                        Invite
                      </Button>
                    </div>
                    {inviteError && (
                      <p className="text-xs text-destructive">{inviteError}</p>
                    )}
                  </Field>
                </FieldGroup>

                <div className="flex flex-col gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    MEMBERS &amp; PENDING INVITES ({1 + project.invites.length} / {project.max_members})
                  </span>
                  <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 p-2.5">
                    <div className="flex items-center justify-between rounded-md bg-card px-2.5 py-1.5 text-xs font-normal">
                      <span className="font-mono text-[11px] font-normal text-muted-foreground">
                        {user?.email || 'dev_user_1@kc.local'} (You)
                      </span>
                      <Badge variant="secondary" className="font-mono text-[10px] font-normal uppercase">
                        owner
                      </Badge>
                    </div>
                    {project.invites.map((inv) => (
                      <div
                        key={inv.invite_uuid}
                        className="flex items-center justify-between gap-2 rounded-md bg-card px-2.5 py-1.5 text-xs font-normal"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-mono text-[11px] font-normal text-muted-foreground">
                            {inv.email}
                          </span>
                          <Badge variant="outline" className="font-mono text-[10px] font-normal uppercase">
                            {inv.role}
                          </Badge>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() =>
                            setPendingDelete({
                              kind: 'invite',
                              id: inv.invite_uuid,
                              label: inv.email,
                            })
                          }
                          aria-label={`Remove ${inv.email}`}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCollabDialogOpen(false)}
                  >
                    Done
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Workspace Settings Dialog (General, Memory, Quotas, SerpApi & BYOK, Delete Project) */}
          <Dialog open={settingsDialogOpen} onOpenChange={handleOpenSettingsDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Workspace Settings">
                <SettingsIcon data-icon="inline-start" />
                <span className="hidden sm:inline">Settings</span>
              </Button>
            </DialogTrigger>
            <DialogContent
              data-workspace-theme={store.theme}
              className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
            >
              <DialogHeader>
                <DialogTitle className="text-lg font-medium tracking-tight text-foreground sm:text-xl">
                  Workspace Settings
                </DialogTitle>
                <DialogDescription className="text-xs font-normal text-muted-foreground">
                  Configure project details, standing memory, search &amp; API keys, quotas, or delete this workspace.
                </DialogDescription>
              </DialogHeader>

              <Tabs
                value={settingsTab}
                onValueChange={(val) =>
                  setSettingsTab(
                    val as 'general' | 'appearance' | 'quotas' | 'keys' | 'danger',
                  )
                }
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="general" className="text-xs">
                    General
                  </TabsTrigger>
                  <TabsTrigger value="appearance" className="text-xs">
                    Appearance
                  </TabsTrigger>
                  <TabsTrigger value="quotas" className="text-xs">
                    Quotas
                  </TabsTrigger>
                  <TabsTrigger value="keys" className="text-xs">
                    Search &amp; Keys
                  </TabsTrigger>
                  <TabsTrigger value="danger" className="text-xs">
                    Delete
                  </TabsTrigger>
                </TabsList>

                {/* TAB 1: General Details & Project Memory */}
                <TabsContent value="general" className="mt-4">
                  <form
                    onSubmit={handleSaveGeneralAndMemory}
                    className="flex flex-col gap-4"
                  >
                    <FieldGroup className="gap-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
                        <span className="truncate font-mono text-muted-foreground">
                          ID: {project.project_uuid}
                        </span>
                        <div className="flex items-center gap-1">
                          <CopyButton
                            value={project.project_uuid}
                            label="Copy ID"
                            copiedLabel="Copied"
                            showLabel
                          />
                          <CopyButton
                            value={
                              typeof window !== 'undefined'
                                ? `${window.location.origin}/projects/${project.project_uuid}`
                                : `/projects/${project.project_uuid}`
                            }
                            label="Copy link"
                            copiedLabel="Copied"
                            showLabel
                          />
                        </div>
                      </div>
                      <Field>
                        <FieldLabel
                          htmlFor="settings-project-name"
                          className="text-sm font-medium text-foreground"
                        >
                          Project Name
                        </FieldLabel>
                        <Input
                          id="settings-project-name"
                          required
                          value={settingsNameDraft}
                          onChange={(e) => {
                            setSettingsNameDraft(e.target.value)
                            setGeneralSavedNote(null)
                          }}
                        />
                      </Field>

                      <Field>
                        <FieldLabel
                          htmlFor="settings-project-desc"
                          className="text-sm font-medium text-foreground"
                        >
                          Description
                        </FieldLabel>
                        <Textarea
                          id="settings-project-desc"
                          rows={2}
                          value={settingsDescDraft}
                          onChange={(e) => {
                            setSettingsDescDraft(e.target.value)
                            setGeneralSavedNote(null)
                          }}
                        />
                      </Field>

                      <Field>
                        <div className="flex items-center justify-between gap-2">
                          <FieldLabel
                            htmlFor="settings-project-memory"
                            className="text-sm font-medium text-foreground"
                          >
                            Project Memory
                          </FieldLabel>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="settings-memory-enabled"
                              checked={settingsMemoryEnabled}
                              onCheckedChange={(checked) => {
                                setSettingsMemoryEnabled(checked === true)
                                setGeneralSavedNote(null)
                              }}
                            />
                            <FieldLabel
                              htmlFor="settings-memory-enabled"
                              className="cursor-pointer text-xs font-normal text-muted-foreground"
                            >
                              Active across conversations
                            </FieldLabel>
                          </div>
                        </div>
                        <Textarea
                          id="settings-project-memory"
                          rows={4}
                          disabled={!settingsMemoryEnabled}
                          placeholder="Standing instructions, domain terminology, or architectural conventions the agent should remember across all conversations in this project..."
                          value={settingsMemoryDraft}
                          onChange={(e) => {
                            setSettingsMemoryDraft(e.target.value)
                            setGeneralSavedNote(null)
                          }}
                        />
                        <FieldDescription className="text-[11px] font-normal text-muted-foreground/80">
                          Injected into the agent context for every conversation in this workspace when enabled.
                        </FieldDescription>
                      </Field>

                      <Field>
                        <div className="flex items-center justify-between gap-2">
                          <FieldLabel className="text-sm font-medium text-foreground">
                            Agent Orb Style
                          </FieldLabel>
                          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
                            <button
                              type="button"
                              onClick={() => handleSelectOrbStyle('sphere')}
                              className={cn(
                                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                currentOrbStyle === 'sphere'
                                  ? 'bg-card text-foreground shadow-2xs font-semibold'
                                  : 'text-muted-foreground hover:text-foreground',
                              )}
                            >
                              ✦ Celestial Sphere
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectOrbStyle('ring')}
                              className={cn(
                                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                currentOrbStyle === 'ring'
                                  ? 'bg-card text-foreground shadow-2xs font-semibold'
                                  : 'text-muted-foreground hover:text-foreground',
                              )}
                            >
                              🌀 Fluid Ring
                            </button>
                          </div>
                        </div>
                        <FieldDescription className="text-[11px] font-normal text-muted-foreground/80">
                          Toggle between the celestial gaseous sphere and the fluid chromatic ring orb. Also preview both side-by-side in the Appearance tab.
                        </FieldDescription>
                      </Field>
                    </FieldGroup>

                    {generalSavedNote && (
                      <p className="text-xs font-normal text-primary">
                        {generalSavedNote}
                      </p>
                    )}

                    <DialogFooter>
                      <Button type="submit" size="sm">
                        Save Changes
                      </Button>
                    </DialogFooter>
                  </form>
                </TabsContent>

                {/* TAB 2: Appearance & Agent Orb Selection */}
                <TabsContent value="appearance" className="mt-4 flex flex-col gap-5">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <SparklesIcon className="size-4 text-primary" />
                      <h3 className="text-sm font-semibold tracking-tight text-foreground">
                        Agent Orb Visual Identity
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Choose which visual representation to use for the Knowledge Cartographer agent across the empty-state hero, subheader, and chat response avatars.
                    </p>
                  </div>

                  <div
                    className="grid grid-cols-1 gap-3.5 sm:grid-cols-2"
                    role="radiogroup"
                    aria-label="Agent Orb Style Selection"
                  >
                    {/* Option 1: Celestial Gaseous Sphere */}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={currentOrbStyle === 'sphere'}
                      onClick={() => handleSelectOrbStyle('sphere')}
                      className={cn(
                        'group relative flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        currentOrbStyle === 'sphere'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/40 shadow-xs'
                          : 'border-border/70 bg-card/60 hover:border-border hover:bg-card',
                      )}
                    >
                      <div className="flex w-full items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'flex size-4 items-center justify-center rounded-full border transition-colors',
                              currentOrbStyle === 'sphere'
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-muted-foreground/40',
                            )}
                          >
                            {currentOrbStyle === 'sphere' && (
                              <span className="size-1.5 rounded-full bg-white" />
                            )}
                          </span>
                          <span className="text-xs font-semibold text-foreground">
                            Celestial Gaseous Sphere
                          </span>
                        </div>
                        {currentOrbStyle === 'sphere' && (
                          <Badge
                            variant="secondary"
                            className="font-mono text-[10px] uppercase text-primary"
                          >
                            Active
                          </Badge>
                        )}
                      </div>

                      {/* Live preview */}
                      <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
                        <AuraBlob
                          variant="hero"
                          color={auraPalette.color}
                          midColor={auraPalette.midColor}
                          deepColor={auraPalette.deepColor}
                          backgroundColor="transparent"
                          cursorInteraction
                          className="size-full"
                        />
                      </div>

                      <div className="flex flex-col gap-1 text-left">
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          Soft glowing aura blob with shifting gaseous plasma. Stationary on hover with an ambient luminous boost.
                        </p>
                        <span className="font-mono text-[10px] text-muted-foreground/75">
                          React Bits Pro · Raymarched Multi-Shell
                        </span>
                      </div>
                    </button>

                    {/* Option 2: Fluid Chromatic Ring */}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={currentOrbStyle === 'ring'}
                      onClick={() => handleSelectOrbStyle('ring')}
                      className={cn(
                        'group relative flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        currentOrbStyle === 'ring'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/40 shadow-xs'
                          : 'border-border/70 bg-card/60 hover:border-border hover:bg-card',
                      )}
                    >
                      <div className="flex w-full items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'flex size-4 items-center justify-center rounded-full border transition-colors',
                              currentOrbStyle === 'ring'
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-muted-foreground/40',
                            )}
                          >
                            {currentOrbStyle === 'ring' && (
                              <span className="size-1.5 rounded-full bg-white" />
                            )}
                          </span>
                          <span className="text-xs font-semibold text-foreground">
                            Fluid Chromatic Ring
                          </span>
                        </div>
                        {currentOrbStyle === 'ring' && (
                          <Badge
                            variant="secondary"
                            className="font-mono text-[10px] uppercase text-primary"
                          >
                            Active
                          </Badge>
                        )}
                      </div>

                      {/* Live preview */}
                      <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
                        <Orb
                          variant="hero"
                          colors={[
                            auraPalette.color,
                            auraPalette.midColor,
                            auraPalette.deepColor,
                          ]}
                          backgroundColor="transparent"
                          rotateOnHover
                          followCursor
                          intro={false}
                          className="size-full"
                        />
                      </div>

                      <div className="flex flex-col gap-1 text-left">
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          Dynamic organic fluid ring with wobbling light trails, simplex noise deformation, and kinetic swirl.
                        </p>
                        <span className="font-mono text-[10px] text-muted-foreground/75">
                          Original React Bits · Simplex 3D Noise Ring
                        </span>
                      </div>
                    </button>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-foreground">
                        Workspace Theme
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Currently using {store.theme} mode
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={toggleTheme}
                      className="text-xs"
                    >
                      {store.theme === 'dark' ? (
                        <>
                          <SunIcon data-icon="inline-start" />
                          Switch to Light
                        </>
                      ) : (
                        <>
                          <MoonIcon data-icon="inline-start" />
                          Switch to Dark
                        </>
                      )}
                    </Button>
                  </div>
                </TabsContent>

                {/* TAB 2: Workspace & Personal Quotas */}
                <TabsContent value="quotas" className="mt-4 flex flex-col gap-4">
                  <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">
                        Workspace Quotas
                      </span>
                      <Badge variant="secondary" className="font-mono text-[10px] font-normal uppercase">
                        {project.role}
                      </Badge>
                    </div>

                    <div className="flex flex-col gap-3 text-xs">
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Team Members</span>
                          <span className="font-mono text-foreground">
                            {1 + project.invites.length} / {project.max_members} members
                          </span>
                        </div>
                        <Progress
                          value={Math.min(
                            100,
                            Math.round(
                              ((1 + project.invites.length) /
                                Math.max(1, project.max_members)) *
                              100,
                            ),
                          )}
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">
                            Uploaded Documents (5 MB max per file)
                          </span>
                          <span className="font-mono text-foreground">
                            {projectDocuments.length} / {project.max_docs} docs
                          </span>
                        </div>
                        <Progress
                          value={Math.min(
                            100,
                            Math.round(
                              (projectDocuments.length /
                                Math.max(1, project.max_docs)) *
                              100,
                            ),
                          )}
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">
                            Daily Document Uploads
                          </span>
                          <span className="font-mono text-foreground">
                            {usageSummary?.daily_used.doc_upload ?? projectDocuments.length} /{' '}
                            {usageSummary?.daily_limits.doc_upload ?? project.daily_uploads} today
                          </span>
                        </div>
                        <Progress
                          value={Math.min(
                            100,
                            Math.round(
                              ((usageSummary?.daily_used.doc_upload ?? projectDocuments.length) /
                                Math.max(
                                  1,
                                  usageSummary?.daily_limits.doc_upload ?? project.daily_uploads,
                                )) *
                              100,
                            ),
                          )}
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">
                            Daily Managed AI Queries
                          </span>
                          <span className="font-mono text-foreground">
                            {usageSummary?.daily_used.llm_call ??
                              store.messages.filter(
                                (m) =>
                                  m.type === 'ai' &&
                                  projectConversations.some(
                                    (c) => c.convo_uuid === m.convo_uuid,
                                  ),
                              ).length}{' '}
                            / {usageSummary?.daily_limits.llm_call ?? project.daily_llm_calls} today
                          </span>
                        </div>
                        <Progress
                          value={Math.min(
                            100,
                            Math.round(
                              ((usageSummary?.daily_used.llm_call ??
                                store.messages.filter(
                                  (m) =>
                                    m.type === 'ai' &&
                                    projectConversations.some(
                                      (c) => c.convo_uuid === m.convo_uuid,
                                    ),
                                ).length) /
                                Math.max(
                                  1,
                                  usageSummary?.daily_limits.llm_call ?? project.daily_llm_calls,
                                )) *
                              100,
                            ),
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
                    <span className="text-xs font-medium text-foreground">
                      Personal &amp; Shared Quota Rules
                    </span>
                    <ul className="flex flex-col gap-1 list-disc pl-4">
                      <li>
                        Every metered action checks your personal daily allowance first, then the workspace cap.
                      </li>
                      <li>
                        {savedSerpKeyPresent
                          ? 'Your personal SerpApi key stored on this device powers Web Search and Deep Research.'
                          : vertexSearchEnabled
                            ? `Managed web search includes up to ${MANAGED_SEARCHES_PER_USER_PER_DAY} grounded Google searches per user per day (~8 per deep research run). Save a personal SerpApi key below to route search through your own account.`
                            : 'Enter your personal SerpApi key in Search & Keys below (stored locally on this device only) to enable live Web Search and Deep Research.'}
                      </li>
                      <li>
                        Switch to <strong>BYOK</strong> with your own API key for unlimited interactive chat turns when managed quota is spent.
                      </li>
                    </ul>
                  </div>
                </TabsContent>

                {/* TAB 3: Web Search (SerpApi) & BYOK LLM Keys */}
                <TabsContent value="keys" className="mt-4">
                  <form
                    onSubmit={handleSaveSearchAndApiSettings}
                    className="flex flex-col gap-4"
                  >
                    <FieldGroup className="gap-3.5">
                      <Field>
                        <div className="flex items-center justify-between gap-2">
                          <FieldLabel
                            htmlFor="settings-serp-key"
                            className="text-sm font-medium text-foreground"
                          >
                            SerpApi Web Search Key
                          </FieldLabel>
                          <Badge
                            variant={
                              serpKeyDraft.trim() !== (getSerpApiKey() || '')
                                ? 'secondary'
                                : savedSerpKeyPresent
                                  ? 'default'
                                  : 'outline'
                            }
                            className="font-mono text-[10px] font-normal"
                          >
                            {serpKeyDraft.trim() !== (getSerpApiKey() || '')
                              ? 'Unsaved — Click Save'
                              : savedSerpKeyPresent
                                ? 'Saved On Device'
                                : 'Not Saved On Device'}
                          </Badge>
                        </div>
                        <PasswordInput
                          id="settings-serp-key"
                          autoComplete="off"
                          showLabel="Show SerpApi key"
                          hideLabel="Hide SerpApi key"
                          placeholder="Paste your SerpApi key..."
                          value={serpKeyDraft}
                          onChange={(e) => {
                            setSerpKeyDraft(e.target.value)
                            setSearchSettingsMessage(null)
                          }}
                        />
                        <FieldDescription className="text-[11px] font-normal text-muted-foreground/80">
                          Usable in both Managed and BYOK chat modes for Web Search &amp; Deep Research. Stored locally on this device only (per site origin in browser storage — never stored in server .env) when you click Save Search &amp; API Settings.
                        </FieldDescription>
                      </Field>

                      <Field>
                        <FieldLabel className="text-sm font-medium text-foreground">
                          SerpApi Per-User Rate Limits
                        </FieldLabel>
                        <div className="grid grid-cols-3 gap-2.5">
                          <div className="flex flex-col gap-1">
                            <FieldLabel
                              htmlFor="serp-limit-hour"
                              className="text-[11px] font-normal text-muted-foreground"
                            >
                              Per Hour (max {SERP_MAX_PER_HOUR})
                            </FieldLabel>
                            <Input
                              id="serp-limit-hour"
                              type="number"
                              min={0}
                              max={SERP_MAX_PER_HOUR}
                              aria-invalid={
                                searchSettingsMessage?.kind === 'err'
                                  ? 'true'
                                  : 'false'
                              }
                              value={searchLimitsDraft.serp_per_hour}
                              onChange={(e) => {
                                setSearchLimitsDraft((prev) => ({
                                  ...prev,
                                  serp_per_hour: Number(e.target.value) || 0,
                                }))
                                setSearchSettingsMessage(null)
                              }}
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <FieldLabel
                              htmlFor="serp-limit-day"
                              className="text-[11px] font-normal text-muted-foreground"
                            >
                              Per Day
                            </FieldLabel>
                            <Input
                              id="serp-limit-day"
                              type="number"
                              min={0}
                              max={SERP_MAX_PER_MONTH}
                              aria-invalid={
                                searchSettingsMessage?.kind === 'err'
                                  ? 'true'
                                  : 'false'
                              }
                              value={searchLimitsDraft.serp_per_day}
                              onChange={(e) => {
                                setSearchLimitsDraft((prev) => ({
                                  ...prev,
                                  serp_per_day: Number(e.target.value) || 0,
                                }))
                                setSearchSettingsMessage(null)
                              }}
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <FieldLabel
                              htmlFor="serp-limit-month"
                              className="text-[11px] font-normal text-muted-foreground"
                            >
                              Per Month (max {SERP_MAX_PER_MONTH})
                            </FieldLabel>
                            <Input
                              id="serp-limit-month"
                              type="number"
                              min={0}
                              max={SERP_MAX_PER_MONTH}
                              aria-invalid={
                                searchSettingsMessage?.kind === 'err'
                                  ? 'true'
                                  : 'false'
                              }
                              value={searchLimitsDraft.serp_per_month}
                              onChange={(e) => {
                                setSearchLimitsDraft((prev) => ({
                                  ...prev,
                                  serp_per_month: Number(e.target.value) || 0,
                                }))
                                setSearchSettingsMessage(null)
                              }}
                            />
                          </div>
                        </div>
                        <FieldDescription className="text-[11px] font-normal text-muted-foreground/80">
                          Set your own hourly, daily, and monthly search thresholds (capped at {SERP_MAX_PER_HOUR}/hr and {SERP_MAX_PER_MONTH}/mo on the free plan). Normalized queries are cached for 24 hours.
                        </FieldDescription>
                      </Field>

                      <Field>
                        <div className="flex items-center justify-between">
                          <FieldLabel
                            htmlFor="settings-byok-key"
                            className="text-sm font-medium text-foreground"
                          >
                            Personal LLM API Key (BYOK)
                          </FieldLabel>
                          <Badge variant="outline" className="font-mono text-[10px] font-normal">
                            Stored Locally
                          </Badge>
                        </div>
                        <PasswordInput
                          id="settings-byok-key"
                          autoComplete="off"
                          showLabel="Show Gemini API key"
                          hideLabel="Hide Gemini API key"
                          placeholder="Paste your Gemini API key for unlimited chat..."
                          value={llmByokKeyDraft}
                          onChange={(e) => {
                            setLlmByokKeyDraft(e.target.value)
                            setSearchSettingsMessage(null)
                          }}
                        />
                        <FieldDescription className="text-[11px] font-normal text-muted-foreground/80">
                          Used for interactive chat when your managed daily quota is spent or by choice. Background document ingestion stays on managed models.
                        </FieldDescription>
                      </Field>
                    </FieldGroup>

                    {searchSettingsMessage && (
                      <p
                        className={cn(
                          'text-xs font-normal',
                          searchSettingsMessage.kind === 'ok'
                            ? 'text-primary'
                            : 'text-destructive',
                        )}
                      >
                        {searchSettingsMessage.text}
                      </p>
                    )}

                    <DialogFooter>
                      <Button type="submit" size="sm">
                        Save Search &amp; API Settings
                      </Button>
                    </DialogFooter>
                  </form>
                </TabsContent>

                {/* TAB 4: Danger Zone (Type Project Name to Delete) */}
                <TabsContent value="danger" className="mt-4">
                  <div className="flex flex-col gap-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-sm font-medium text-destructive">
                        Delete Project Workspace
                      </h3>
                      <p className="text-xs font-normal leading-relaxed text-muted-foreground">
                        Deleting <strong>&quot;{project.name}&quot;</strong> permanently removes its uploaded documents, indexed passages, knowledge graph nodes, and conversation history.
                      </p>
                    </div>

                    <Field>
                      <FieldLabel
                        htmlFor="delete-project-confirm-input"
                        className="text-xs font-normal text-foreground"
                      >
                        Type <span className="font-mono font-medium text-foreground">&quot;{project.name}&quot;</span> to confirm deletion
                      </FieldLabel>
                      <Input
                        id="delete-project-confirm-input"
                        type="text"
                        placeholder={project.name}
                        value={deleteConfirmInput}
                        onChange={(e) => setDeleteConfirmInput(e.target.value)}
                      />
                    </Field>

                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={!isDeleteConfirmMatch}
                        onClick={handleDeleteProjectWorkspace}
                      >
                        <Trash2Icon data-icon="inline-start" />
                        Delete Project Workspace
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>

          {/* Dark / Light Surface Theme Toggle */}
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
            title={
              store.theme === 'dark'
                ? 'Switch workspace to light mode'
                : 'Switch workspace to dark mode'
            }
          >
            {store.theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </Button>

          {/* Toggle Right Sources & Upload Sidebar */}
          <Button
            type="button"
            variant={rightSidebarOpen ? 'secondary' : 'outline'}
            size="icon-sm"
            onClick={() => setRightSidebarOpen((prev) => !prev)}
            aria-label={
              rightSidebarOpen ? 'Hide sources sidebar' : 'Show sources sidebar'
            }
            title={
              rightSidebarOpen ? 'Hide sources sidebar' : 'Show sources sidebar'
            }
          >
            {rightSidebarOpen ? <PanelRightCloseIcon /> : <PanelRightOpenIcon />}
          </Button>
        </div>
      </header>

      {workspaceError && (
        <div
          role="alert"
          className="flex shrink-0 items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive"
        >
          <span className="truncate">{workspaceError}</span>
          <button
            type="button"
            onClick={() => setWorkspaceError(null)}
            className="shrink-0 rounded p-0.5 hover:bg-destructive/15"
            aria-label="Dismiss error"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}

      {/* 3-Pane Workspace Body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* LEFT PANEL: Conversations Sidebar (`conversations` table) */}
        {leftSidebarOpen && (
          <aside
            aria-label="Project Conversations"
            className="flex w-72 shrink-0 flex-col border-r border-border bg-gradient-to-b from-sidebar via-sidebar to-sidebar/95 text-sidebar-foreground shadow-2xs"
          >
            <div className="flex flex-col gap-2 border-b border-border bg-muted/30 p-3">
              {/* Search Bar with Search Icon */}
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search conversations..."
                  value={convoSearchQuery}
                  onChange={(e) => setConvoSearchQuery(e.target.value)}
                  className="h-8 pl-8 pr-7 text-xs bg-card/70 border-border/80 text-foreground placeholder:text-muted-foreground/70 focus-visible:bg-card focus-visible:border-primary/50"
                />
                {convoSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setConvoSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <XIcon className="size-3" />
                  </button>
                )}
              </div>

              {/* New chat button (matches Image 1: SquarePenIcon + "New chat", no blue background) */}
              <button
                type="button"
                onClick={handleStartNewConversation}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-normal text-foreground transition-colors hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="New chat"
                title="New chat"
              >
                <SquarePenIcon className="size-4 shrink-0 text-foreground" />
                <span>New chat</span>
              </button>
            </div>

            {/* Conversation Thread List */}
            <div className="flex-1 overflow-y-auto p-2">
              {filteredConversations.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {convoSearchQuery.trim()
                    ? `No conversations match "${convoSearchQuery}".`
                    : 'No conversations yet. Start a new chat above.'}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {filteredConversations.map((convo) => {
                    const isSelected =
                      !isDraftConvo && convo.convo_uuid === activeConversation?.convo_uuid
                    const excludedCount = convo.excluded_doc_uuids.length
                    const activeCount = Math.max(
                      0,
                      projectDocuments.length - excludedCount,
                    )

                    return (
                      <div
                        key={convo.convo_uuid}
                        className={cn(
                          'group relative flex flex-col gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors',
                          isSelected
                            ? 'border-primary/50 bg-secondary text-foreground shadow-xs'
                            : 'border-transparent hover:bg-sidebar-accent/70 text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setIsDraftConvo(false)
                            setActiveConvoUuid(convo.convo_uuid)
                          }}
                          className="flex w-full flex-col gap-1 text-left focus-visible:outline-none"
                        >
                          <span className="line-clamp-1 pr-6 text-xs font-medium text-foreground">
                            {convo.title}
                          </span>
                          <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              {convo.visibility === 'private' ? (
                                <LockIcon className="size-3" />
                              ) : (
                                <GlobeIcon className="size-3" />
                              )}
                              {convo.visibility}
                            </span>
                            <span>·</span>
                            <span>
                              {activeCount}/{projectDocuments.length} docs
                            </span>
                          </div>
                        </button>

                        <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() =>
                              handleToggleConversationVisibility(convo)
                            }
                            title={`Switch to ${convo.visibility === 'shared' ? 'private' : 'shared'}`}
                            aria-label="Toggle conversation visibility"
                          >
                            {convo.visibility === 'private' ? (
                              <LockIcon />
                            ) : (
                              <GlobeIcon />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() =>
                              setPendingDelete({
                                kind: 'conversation',
                                id: convo.convo_uuid,
                                label: convo.title,
                              })
                            }
                            title="Delete conversation"
                            aria-label={`Delete ${convo.title}`}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2Icon />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* CENTER PANEL: Agent Chatbot (shadcn AI Elements, zero Aurora UI) */}
        <main
          id="main-content"
          tabIndex={-1}
          aria-label="Workspace Agent Chat"
          className="relative flex min-w-0 flex-1 flex-col bg-background outline-none"
        >
          {/* Top Chat Header (matching Image 1 / ChatGPT clean style) */}
          {activeConversation && !isDraftConvo && displayMessages.length > 0 && (
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-2">
                {isRenamingConvo ? (
                  <input
                    type="text"
                    value={convoTitleDraft}
                    onChange={(e) => setConvoTitleDraft(e.target.value)}
                    onBlur={() => handleSaveConvoTitle(activeConversation.convo_uuid)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveConvoTitle(activeConversation.convo_uuid)
                      } else if (e.key === 'Escape') {
                        setIsRenamingConvo(false)
                      }
                    }}
                    autoFocus
                    className="h-7 w-64 max-w-sm rounded border border-border bg-card px-2 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring sm:w-80"
                  />
                ) : (
                  <h2
                    className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-[15px]"
                    title={activeConversation.title}
                  >
                    {activeConversation.title}
                  </h2>
                )}
              </div>

              <div className="flex items-center gap-1">
                {/* Share button like Image 1 */}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => handleToggleConversationVisibility(activeConversation)}
                  className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  title={`Visibility: ${activeConversation.visibility}. Click to toggle.`}
                >
                  <Share2Icon className="size-3.5" />
                  <span className="capitalize">{activeConversation.visibility === 'shared' ? 'Share' : 'Private'}</span>
                </Button>

                {/* Conversation Options Menu like Image 1 (...) */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Conversation options"
                      title="More options"
                    >
                      <MoreHorizontalIcon className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent data-workspace-theme={store.theme} align="end" className="w-40">
                    <DropdownMenuItem
                      onClick={() => {
                        setConvoTitleDraft(activeConversation.title)
                        setIsRenamingConvo(true)
                      }}
                    >
                      <PencilIcon className="mr-2 size-3.5" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        setPendingDelete({
                          kind: 'conversation',
                          id: activeConversation.convo_uuid,
                          label: activeConversation.title,
                        })
                      }
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2Icon className="mr-2 size-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}

          {/* Message Scroller Thread (`@shadcn/message-scroller`) */}
          <MessageScrollerProvider autoScroll>
            <MessageScroller className="flex-1">
              <MessageScrollerViewport className="px-4 py-2 sm:px-6">
                <MessageScrollerContent
                  className={cn(
                    'mx-auto w-full max-w-3xl gap-4',
                    displayMessages.length === 0 && 'h-full justify-center',
                  )}
                >
                  {displayMessages.length === 0 ? (
                    <MessageScrollerItem className="w-full">
                      <Empty className="my-auto border border-dashed border-border bg-card/40 px-4 py-4 sm:py-5">
                        <EmptyHeader className="max-w-lg">
                          <div
                            ref={emptyOrbRef}
                            className="relative mx-auto mb-3 h-44 w-44 sm:h-56 sm:w-56"
                            data-testid="kc-chat-empty-orb"
                          >
                            <AgentOrb
                              styleType={currentOrbStyle}
                              variant="hero"
                              color={auraPalette.color}
                              midColor={auraPalette.midColor}
                              deepColor={auraPalette.deepColor}
                              backgroundColor="transparent"
                              cursorInteraction
                              className="size-full"
                            />
                          </div>
                          <EmptyTitle className="text-base font-medium tracking-tight text-foreground sm:text-lg">
                            {currentJarvisGreeting}
                          </EmptyTitle>
                        </EmptyHeader>
                        <EmptyContent className="mt-2.5">
                          <div className="flex flex-wrap justify-center gap-1.5">
                            {STARTER_PROMPTS.map((starter) => (
                              <Button
                                key={starter}
                                type="button"
                                variant="outline"
                                size="xs"
                                onClick={() => void handleSendMessage(starter)}
                                className="h-7 text-xs font-normal"
                              >
                                {starter}
                              </Button>
                            ))}
                          </div>
                        </EmptyContent>
                      </Empty>
                    </MessageScrollerItem>
                  ) : (
                    displayMessages.map((msg) => {
                      if (msg.type === 'human') {
                        return (
                          <MessageScrollerItem
                            key={msg.message_uuid}
                            scrollAnchor
                          >
                            <Message align="end">
                              <MessageContent>
                                {msg.attachments && msg.attachments.length > 0 && (
                                  <AttachmentGroup className="justify-end">
                                    {msg.attachments.map((att) => (
                                      <Attachment key={att.id} size="sm">
                                        <AttachmentMedia>
                                          <FileTextIcon />
                                        </AttachmentMedia>
                                        <AttachmentTitle>{att.name}</AttachmentTitle>
                                      </Attachment>
                                    ))}
                                  </AttachmentGroup>
                                )}
                                <Bubble align="end" variant="secondary">
                                  <BubbleContent>{msg.content}</BubbleContent>
                                </Bubble>
                                <span className="self-end font-mono text-[10px] text-muted-foreground">
                                  Scoped to {msg.source_scope.length} source
                                  {msg.source_scope.length === 1 ? '' : 's'} · {msg.mode.toUpperCase()}
                                </span>
                              </MessageContent>
                            </Message>
                          </MessageScrollerItem>
                        )
                      }

                      const isThinkingMsg = msg.status === 'streaming'
                      const isTokenStreaming = msg.message_uuid === streamingMessageUuid

                      return (
                        <MessageScrollerItem key={msg.message_uuid}>
                          <Message align="start">
                            <MessageAvatar className="self-start overflow-visible bg-transparent">
                              <AgentResponseOrbAvatar
                                color={auraPalette.color}
                                midColor={auraPalette.midColor}
                                deepColor={auraPalette.deepColor}
                                thinking={isThinkingMsg || isTokenStreaming}
                                orbStyle={currentOrbStyle}
                                originRectRef={orbOriginRectRef}
                              />
                            </MessageAvatar>

                            <MessageContent className="gap-3">
                              {isThinkingMsg ? (
                                pendingTraceSteps.length > 0 ? (
                                  <Trace>
                                    {pendingTraceSteps.map((step) => (
                                      <TraceLine key={step.id} status={step.status}>
                                        <TraceIcon>
                                          {step.status === 'running' ? (
                                            <Spinner className="size-3.5" />
                                          ) : step.kind === 'rag_hybrid' ? (
                                            <SearchCheckIcon />
                                          ) : step.kind === 'graph_query' ? (
                                            <DatabaseIcon />
                                          ) : step.kind === 'web_search' ? (
                                            <GlobeIcon />
                                          ) : (
                                            <CpuIcon />
                                          )}
                                        </TraceIcon>
                                        <TraceTitle>{step.title}</TraceTitle>
                                        {step.description && (
                                          <TraceDescription>{step.description}</TraceDescription>
                                        )}
                                      </TraceLine>
                                    ))}
                                  </Trace>
                                ) : (
                                  <Trace>
                                    <TraceLine status="running">
                                      <TraceIcon>
                                        <Spinner className="size-3.5" />
                                      </TraceIcon>
                                      <TraceTitle>Thinking...</TraceTitle>
                                    </TraceLine>
                                  </Trace>
                                )
                              ) : (
                                <>
                                  {/* 1. Agent Activity Trace (`@shadcn/trace` + `@shadcn/code-block`) */}
                                  {msg.trace_steps && msg.trace_steps.length > 0 && (
                                    <Trace>
                                      {msg.trace_steps.map((step) => {
                                        const StepIcon =
                                          step.kind === 'rag_hybrid'
                                            ? SearchCheckIcon
                                            : step.kind === 'graph_query'
                                              ? DatabaseIcon
                                              : step.kind === 'web_search'
                                                ? GlobeIcon
                                                : CpuIcon

                                        if (!step.output) {
                                          return (
                                            <TraceLine key={step.id} status={step.status}>
                                              <TraceIcon>
                                                <StepIcon />
                                              </TraceIcon>
                                              <TraceTitle>{step.title}</TraceTitle>
                                              {step.description && (
                                                <TraceDescription>
                                                  {step.description}
                                                </TraceDescription>
                                              )}
                                            </TraceLine>
                                          )
                                        }

                                        return (
                                          <TraceCollapsible key={step.id}>
                                            <TraceCollapsibleTrigger>
                                              <TraceLine status={step.status}>
                                                <TraceIcon>
                                                  <StepIcon />
                                                </TraceIcon>
                                                <TraceTitle>{step.title}</TraceTitle>
                                                {step.description && (
                                                  <TraceDescription>
                                                    {step.description}
                                                  </TraceDescription>
                                                )}
                                              </TraceLine>
                                            </TraceCollapsibleTrigger>
                                            <TraceCollapsibleContent>
                                              <CodeBlock size="sm" className="my-1">
                                                <CodeBlockHeader>
                                                  <CodeBlockTitle>
                                                    {step.kind === 'graph_query'
                                                      ? 'Knowledge Graph Lookup'
                                                      : step.kind === 'rag_hybrid'
                                                        ? 'Document Passage Search'
                                                        : step.kind === 'web_search'
                                                          ? 'Web Search Lookup'
                                                          : 'Reasoning Step'}
                                                  </CodeBlockTitle>
                                                  <CodeBlockActions>
                                                    <CodeBlockCopyButton
                                                      value={step.output}
                                                    />
                                                  </CodeBlockActions>
                                                </CodeBlockHeader>
                                                <CodeBlockContent wrap>
                                                  {step.output}
                                                </CodeBlockContent>
                                              </CodeBlock>
                                            </TraceCollapsibleContent>
                                          </TraceCollapsible>
                                        )
                                      })}
                                    </Trace>
                                  )}

                                  {/* 2. Sources Used Collapsible (`ai-elements/sources` pattern) */}
                                  {msg.citations && msg.citations.length > 0 && (
                                    <Trace>
                                      <TraceCollapsible>
                                        <TraceCollapsibleTrigger>
                                          <TraceLine>
                                            <TraceIcon>
                                              <BookOpenIcon />
                                            </TraceIcon>
                                            <TraceTitle>
                                              Used {msg.citations.length} cited source
                                              {msg.citations.length === 1 ? '' : 's'}
                                            </TraceTitle>
                                            <TraceDescription>
                                              {msg.model} · {msg.effort} effort
                                            </TraceDescription>
                                          </TraceLine>
                                        </TraceCollapsibleTrigger>
                                        <TraceCollapsibleContent className="flex flex-col gap-1.5">
                                          {msg.citations.map((cit) => {
                                            const isCurrentlyExcluded =
                                              cit.doc_uuid &&
                                              excludedDocUuids.includes(cit.doc_uuid)
                                            const kindBadge =
                                              cit.source_kind === 'url' ? 'web' : 'document'
                                            return (
                                              <div
                                                key={cit.citation_id}
                                                className="flex flex-wrap items-center gap-2 text-xs"
                                              >
                                                <Badge
                                                  variant="secondary"
                                                  className="font-mono text-[10px] tabular-nums"
                                                >
                                                  [{cit.rank}] {kindBadge}
                                                </Badge>
                                                {cit.doc_uuid ? (
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      void handleOpenPassageInspector({
                                                        docUuid: cit.doc_uuid!,
                                                        filename: cit.filename,
                                                        targetPage: cit.page_start,
                                                        targetPara: cit.para_start,
                                                        targetChunkId: cit.source_id,
                                                        highlightExcerpt: cit.excerpt,
                                                      })
                                                    }
                                                    className="font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
                                                  >
                                                    {cit.filename}
                                                  </button>
                                                ) : (
                                                  <span className="font-medium text-foreground">
                                                    {cit.filename}
                                                  </span>
                                                )}
                                                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                                                  ({cit.heading_path} · {cit.page_label})
                                                </span>
                                                {isCurrentlyExcluded && (
                                                  <Badge
                                                    variant="outline"
                                                    className="border-destructive/40 text-[10px] text-destructive"
                                                  >
                                                    Unticked now
                                                  </Badge>
                                                )}
                                              </div>
                                            )
                                          })}
                                        </TraceCollapsibleContent>
                                      </TraceCollapsible>
                                    </Trace>
                                  )}

                                  {/* 3. Formatted Answer Text */}
                                  <AgentMarkdown
                                    content={msg.content}
                                    animateTokens={isTokenStreaming}
                                    onStreamComplete={() =>
                                      setStreamingMessageUuid((curr) =>
                                        curr === msg.message_uuid ? null : curr,
                                      )
                                    }
                                  />

                                  {/* 4. Inline Citations (`ai-elements/inline-citation` HoverCard pattern) */}
                                  {!isTokenStreaming && msg.citations && msg.citations.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                      {msg.citations.map((cit) => {
                                        const isCurrentlyExcluded =
                                          cit.doc_uuid &&
                                          excludedDocUuids.includes(cit.doc_uuid)

                                        return (
                                          <HoverCard
                                            key={cit.citation_id}
                                            openDelay={150}
                                            closeDelay={100}
                                          >
                                            <HoverCardTrigger asChild>
                                              <Button
                                                type="button"
                                                variant="secondary"
                                                size="xs"
                                                onClick={() => {
                                                  if (cit.doc_uuid) {
                                                    void handleOpenPassageInspector({
                                                      docUuid: cit.doc_uuid,
                                                      filename: cit.filename,
                                                      targetPage: cit.page_start,
                                                      targetPara: cit.para_start,
                                                      targetChunkId: cit.source_id,
                                                      highlightExcerpt: cit.excerpt,
                                                    })
                                                  } else if (
                                                    cit.source_kind === 'url' &&
                                                    cit.source_id.startsWith('http')
                                                  ) {
                                                    window.open(
                                                      cit.source_id,
                                                      '_blank',
                                                      'noopener,noreferrer',
                                                    )
                                                  }
                                                }}
                                                className="font-mono text-[11px] tabular-nums"
                                                title={
                                                  cit.doc_uuid
                                                    ? `Inspect ${cit.filename} at ${cit.page_label}`
                                                    : cit.filename
                                                }
                                              >
                                                [{cit.rank}] {cit.filename} · {cit.page_label}
                                              </Button>
                                            </HoverCardTrigger>
                                            <HoverCardContent
                                              data-workspace-theme={store.theme}
                                              align="start"
                                              className="flex w-80 flex-col gap-2 text-xs"
                                            >
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="truncate font-semibold text-foreground">
                                                  {cit.filename}
                                                </span>
                                                <Badge
                                                  variant="outline"
                                                  className="font-mono text-[10px] tabular-nums"
                                                >
                                                  {cit.page_label}
                                                </Badge>
                                              </div>
                                              <div className="font-mono text-[11px] text-muted-foreground">
                                                {cit.heading_path}
                                              </div>
                                              <blockquote className="border-l-2 border-primary/50 pl-2.5 italic text-muted-foreground">
                                                &ldquo;{cit.excerpt}&rdquo;
                                              </blockquote>
                                              {cit.doc_uuid && (
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="xs"
                                                  onClick={() =>
                                                    void handleOpenPassageInspector({
                                                      docUuid: cit.doc_uuid!,
                                                      filename: cit.filename,
                                                      targetPage: cit.page_start,
                                                      targetPara: cit.para_start,
                                                      targetChunkId: cit.source_id,
                                                      highlightExcerpt: cit.excerpt,
                                                    })
                                                  }
                                                  className="mt-0.5 w-full justify-center font-mono text-[11px]"
                                                >
                                                  <BookOpenIcon data-icon="inline-start" />
                                                  Inspect passage ({cit.page_label})
                                                </Button>
                                              )}
                                              {isCurrentlyExcluded && (
                                                <p className="font-mono text-[11px] text-destructive">
                                                  Note: This source is currently unticked in the right sidebar.
                                                </p>
                                              )}
                                            </HoverCardContent>
                                          </HoverCard>
                                        )
                                      })}
                                    </div>
                                  )}

                                  {/* 5. Copy + PDF/DOCX export, only for answers saved on the server */}
                                  {!isTokenStreaming &&
                                    msg.status === 'answered' &&
                                    !msg.local_only &&
                                    msg.convo_uuid !== 'draft' &&
                                    project && (
                                      <MessageActions
                                        content={msg.content}
                                        getToken={() => getEffectiveIdToken(user?.idToken)}
                                        projectUuid={project.project_uuid}
                                        convoUuid={msg.convo_uuid}
                                        messageUuid={msg.message_uuid}
                                        theme={store.theme}
                                        onError={setWorkspaceError}
                                      />
                                    )}
                                </>
                              )}
                            </MessageContent>
                          </Message>
                        </MessageScrollerItem>
                      )
                    })
                  )}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>

          {/* Bottom Prompt Composer (`ai-elements/prompt-input` + `model-selector` + `context`) */}
          <div className="shrink-0 bg-background px-4 pb-4 pt-2 sm:px-6">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleSendMessage()
              }}
              className="mx-auto flex w-full max-w-3xl flex-col gap-2"
            >
              <input
                ref={composerFileInputRef}
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => {
                  void handleUploadFiles(e.target.files, true)
                  e.target.value = ''
                }}
              />

              {(researchMode === 'web' || researchMode === 'deep_research') &&
                !webSearchConfigured && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-foreground">
                    <span>
                      No SerpApi key saved on this device ({window.location.host}). Web search will not run until you configure one.
                    </span>
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      onClick={() => openSettingsDialog('keys')}
                      className="h-auto shrink-0 px-0 py-0 text-[11px] font-medium text-primary"
                    >
                      Configure SerpApi key
                    </Button>
                  </div>
                )}

              <InputGroup
                focusRing={false}
                className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700/80 dark:bg-[#2c2d37] dark:shadow-md dark:shadow-black/30"
              >
                {stagedAttachments.length > 0 && (
                  <InputGroupAddon align="block-start">
                    <AttachmentGroup>
                      {stagedAttachments.map((file) => (
                        <Attachment key={file.id} size="sm">
                          <AttachmentMedia>
                            <FileTextIcon />
                          </AttachmentMedia>
                          <AttachmentTitle>{file.name}</AttachmentTitle>
                          <AttachmentAction
                            aria-label={`Remove ${file.name}`}
                            onClick={() =>
                              setStagedAttachments((prev) =>
                                prev.filter((item) => item.id !== file.id),
                              )
                            }
                          >
                            <XIcon />
                          </AttachmentAction>
                        </Attachment>
                      ))}
                    </AttachmentGroup>
                  </InputGroupAddon>
                )}

                <InputGroupTextarea
                  placeholder={
                    includedDocuments.length > 0
                      ? `Ask across ${includedDocuments.length} ticked document${includedDocuments.length === 1 ? '' : 's'}...`
                      : 'Ask anything across this workspace...'
                  }
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void handleSendMessage()
                    }
                  }}
                  rows={2}
                  className="min-h-14 text-sm text-foreground placeholder:text-zinc-500 dark:placeholder:text-zinc-300/80"
                />

                <InputGroupAddon
                  align="block-end"
                  className="flex flex-wrap items-center justify-between gap-1.5"
                >
                  <div className="flex flex-wrap items-center gap-1">
                    {/* Attach / Upload file button */}
                    <InputGroupButton
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="rounded-full text-zinc-600 hover:bg-zinc-100 hover:text-foreground dark:text-zinc-200 dark:hover:bg-zinc-700/60"
                      aria-label="Upload and attach source file"
                      title="Upload file to project sources"
                      onClick={() => composerFileInputRef.current?.click()}
                    >
                      <PlusIcon />
                    </InputGroupButton>

                    {/* Model & Effort Selector (`ai-elements/model-selector`) */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <InputGroupButton
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="font-mono text-xs text-zinc-600 hover:bg-zinc-100 hover:text-foreground dark:text-zinc-200 dark:hover:bg-zinc-700/60"
                        >
                          {currentModelLabel} · {currentEffortLabel}
                          <ChevronDownIcon data-icon="inline-end" />
                        </InputGroupButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        data-workspace-theme={store.theme}
                        align="start"
                        className="w-52"
                      >
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-xs text-muted-foreground">
                            Model
                          </DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={selectedModel}
                            onValueChange={setSelectedModel}
                          >
                            {MODELS.map((m) => (
                              <DropdownMenuRadioItem key={m.id} value={m.id}>
                                {m.label}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-xs text-muted-foreground">
                            Reasoning Effort
                          </DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={selectedEffort}
                            onValueChange={(v) => setSelectedEffort(v as EffortLevel)}
                          >
                            {EFFORTS.map((ef) => (
                              <DropdownMenuRadioItem key={ef.id} value={ef.id}>
                                {ef.label}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Web Search Toggle */}
                    <InputGroupButton
                      type="button"
                      variant={researchMode === 'web' ? 'secondary' : 'ghost'}
                      size="xs"
                      onClick={() =>
                        setResearchMode((prev) =>
                          prev === 'web' ? 'normal' : 'web',
                        )
                      }
                      title={
                        webSearchConfigured
                          ? 'Toggle live SerpApi web search for single-turn answers'
                          : 'Enable web search (save a SerpApi key in Settings -> Search & Keys)'
                      }
                      className="font-mono text-xs text-zinc-600 hover:bg-zinc-100 hover:text-foreground dark:text-zinc-200 dark:hover:bg-zinc-700/60"
                    >
                      <GlobeIcon data-icon="inline-start" />
                      Web Search
                      {!webSearchConfigured && (
                        <span
                          aria-hidden="true"
                          className="ml-0.5 inline-block size-1.5 rounded-full bg-amber-500"
                        />
                      )}
                    </InputGroupButton>

                    {/* Normal vs Deep Research Toggle (`D021`) */}
                    <InputGroupButton
                      type="button"
                      variant={
                        researchMode === 'deep_research' ? 'secondary' : 'ghost'
                      }
                      size="xs"
                      onClick={() =>
                        setResearchMode((prev) =>
                          prev === 'deep_research' ? 'normal' : 'deep_research',
                        )
                      }
                      title="Toggle between single-turn RAG and checkpointed Deep Research"
                      className="font-mono text-xs text-zinc-600 hover:bg-zinc-100 hover:text-foreground dark:text-zinc-200 dark:hover:bg-zinc-700/60"
                    >
                      <SparklesIcon data-icon="inline-start" />
                      {researchMode === 'deep_research'
                        ? 'Deep Research'
                        : 'Standard RAG'}
                    </InputGroupButton>

                    {/* Managed vs BYOK Mode (`D019`) */}
                    <InputGroupButton
                      type="button"
                      variant={executionMode === 'byok' ? 'secondary' : 'ghost'}
                      size="xs"
                      onClick={() =>
                        setExecutionMode((prev) =>
                          prev === 'managed' ? 'byok' : 'managed',
                        )
                      }
                      title="Switch between Managed Project Quota and Bring-Your-Own-Key (BYOK)"
                      className="hidden font-mono text-xs text-zinc-600 hover:bg-zinc-100 hover:text-foreground dark:text-zinc-200 dark:hover:bg-zinc-700/60 sm:inline-flex"
                    >
                      <KeyRoundIcon data-icon="inline-start" />
                      {executionMode === 'byok' ? 'BYOK' : 'Managed'}
                    </InputGroupButton>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Context Window Usage HoverCard (`ai-elements/context`) */}
                    <HoverCard openDelay={150} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <InputGroupButton
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="font-mono text-[11px] text-zinc-500 hover:text-foreground dark:text-zinc-300"
                        >
                          {contextPercent}% ctx
                        </InputGroupButton>
                      </HoverCardTrigger>
                      <HoverCardContent
                        data-workspace-theme={store.theme}
                        align="end"
                        side="top"
                        className="flex w-64 flex-col gap-2.5 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between font-medium">
                          <span>Context &amp; Quota Scope</span>
                          <span className="font-mono">
                            {totalConvoTokens.toLocaleString()} / 128k tok
                          </span>
                        </div>
                        <Progress value={contextPercent} />
                        <div className="flex flex-col gap-1 border-t border-border pt-2 font-mono text-[11px] text-muted-foreground">
                          <div className="flex justify-between">
                            <span>Ticked sources</span>
                            <span>
                              {includedDocuments.length} / {projectDocuments.length}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Daily LLM limit</span>
                            <span>{project.daily_llm_calls} calls/day</span>
                          </div>
                        </div>
                      </HoverCardContent>
                    </HoverCard>

                    {/* Submit Prompt Button */}
                    <InputGroupButton
                      type="submit"
                      size="icon-sm"
                      variant="default"
                      className="rounded-full"
                      aria-label="Send message"
                      disabled={!promptInput.trim() || sendingMessage}
                    >
                      <ArrowUpIcon />
                    </InputGroupButton>
                  </div>
                </InputGroupAddon>
              </InputGroup>
            </form>
          </div>
        </main>

        {/* RIGHT PANEL: Collapsible Sources & Artifacts Sidebar */}
        {rightSidebarOpen && (
          <aside
            aria-label="Project Sources and Artifacts"
            className="flex w-80 shrink-0 flex-col border-l border-border bg-gradient-to-b from-sidebar via-sidebar to-sidebar/95 text-sidebar-foreground shadow-2xs sm:w-88"
          >
            {/* Sidebar Segmented Toggle Header (`Sources | Artifacts`) */}
            <div className="flex flex-col gap-2.5 border-b border-border bg-muted/30 px-3.5 py-3">
              <div
                role="tablist"
                aria-label="Right sidebar mode"
                className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card/60 p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={rightSidebarTab === 'sources'}
                  data-testid="kc-sidebar-tab-sources"
                  onClick={() => setRightSidebarTab('sources')}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    rightSidebarTab === 'sources'
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <DatabaseIcon className="size-3.5" />
                  <span>Sources</span>
                  <span
                    className={cn(
                      'rounded px-1 py-0.2 font-mono text-[10px] tabular-nums',
                      rightSidebarTab === 'sources'
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {projectDocuments.length}
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={rightSidebarTab === 'artifacts'}
                  data-testid="kc-sidebar-tab-artifacts"
                  onClick={() => setRightSidebarTab('artifacts')}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    rightSidebarTab === 'artifacts'
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <LayersIcon className="size-3.5" />
                  <span>Artifacts</span>
                  <span
                    className={cn(
                      'rounded px-1 py-0.2 font-mono text-[10px] tabular-nums',
                      rightSidebarTab === 'artifacts'
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {projectArtifacts.length}
                  </span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {rightSidebarTab === 'sources'
                    ? 'Tick documents to ground answers'
                    : 'Synthesized specs, ADRs & plans'}
                </span>
                {rightSidebarTab === 'sources' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      navigate(`/projects/${project.project_uuid}/knowledge-base`)
                    }
                    className="h-6 px-2 font-mono text-[11px] text-primary hover:text-primary"
                  >
                    <FolderKanbanIcon data-icon="inline-start" />
                    Manage KB
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    data-testid="kc-open-create-artifact-btn"
                    onClick={() => setCreateArtifactDialogOpen(true)}
                    className="h-6 px-2 font-mono text-[11px]"
                  >
                    <PlusIcon data-icon="inline-start" />
                    New Artifact
                  </Button>
                )}
              </div>
            </div>

            {rightSidebarTab === 'sources' ? (
              <>
                {/* Upload Documents Dropzone (`POST /upload`) */}
                <div className="border-b border-border p-3.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      void handleUploadFiles(e.target.files, false)
                      e.target.value = ''
                    }}
                  />

                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      void handleUploadFiles(e.dataTransfer.files, false)
                    }}
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/90 bg-card/70 px-3 py-4 text-center transition-colors hover:border-primary/60 hover:bg-card"
                  >
                    <div className="flex size-8 items-center justify-center rounded-md bg-muted text-primary">
                      {uploadingDoc || hasInFlightDocs ? (
                        <Spinner className="size-4" />
                      ) : (
                        <UploadIcon className="size-4" />
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-foreground">
                        Upload Source Documents
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {SUPPORTED_EXTENSIONS.join(', ')} · max 5 MB
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      disabled={uploadingDoc}
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-1"
                    >
                      <PlusIcon data-icon="inline-start" />
                      {uploadingDoc || hasInFlightDocs
                        ? 'Preprocessing & chunking...'
                        : 'Select Files'}
                    </Button>
                  </div>

                  {uploadBanner && (
                    <div
                      role="status"
                      className={cn(
                        'mt-2 flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[11px]',
                        uploadBanner.kind === 'ok'
                          ? 'border-primary/30 bg-primary/10 text-foreground'
                          : 'border-destructive/40 bg-destructive/10 text-destructive',
                      )}
                    >
                      <span className="line-clamp-2">{uploadBanner.text}</span>
                      <button
                        type="button"
                        onClick={() => setUploadBanner(null)}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label="Dismiss upload message"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Source Selection Controls Header (`conversation_excluded_sources`) */}
                <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3.5 py-2 text-xs">
                  <span className="font-mono text-[11px] font-medium text-foreground tabular-nums">
                    Included: {includedDocuments.length} of {projectDocuments.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={handleSelectAllSources}
                      disabled={excludedDocUuids.length === 0}
                      className="h-6 px-1.5 font-mono text-[11px]"
                    >
                      All
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={handleClearAllSources}
                      disabled={includedDocuments.length === 0}
                      className="h-6 px-1.5 font-mono text-[11px]"
                    >
                      None
                    </Button>
                  </div>
                </div>

                {/* Uploaded Documents List with Checkboxes */}
                <div className="flex-1 overflow-y-auto p-3">
                  {projectDocuments.length === 0 ? (
                    <Empty className="border border-dashed border-border bg-card/30 py-8">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <FileTextIcon />
                        </EmptyMedia>
                        <EmptyTitle className="text-sm">No sources uploaded</EmptyTitle>
                        <EmptyDescription className="text-xs">
                          Upload PDFs, Markdown notes, tables, or architecture diagrams above to ground agent answers.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <FieldSet className="gap-2">
                      <FieldGroup className="gap-2">
                        {projectDocuments.map((doc) => {
                          const isIncluded = !excludedDocUuids.includes(doc.doc_uuid)
                          const checkboxId = `source-check-${doc.doc_uuid}`
                          const DocIcon =
                            doc.doc_kind === 'architecture_diagram' ||
                              doc.doc_kind === 'photo' ||
                              doc.doc_kind === 'screenshot'
                              ? ImageIcon
                              : doc.doc_kind === 'table'
                                ? FileSpreadsheetIcon
                                : FileTextIcon

                          return (
                            <div
                              key={doc.doc_uuid}
                              className={cn(
                                'group relative flex flex-col gap-1.5 rounded-lg border p-2.5 transition-colors',
                                isIncluded
                                  ? 'border-border/90 bg-card text-foreground shadow-xs hover:border-primary/50'
                                  : 'border-border/40 bg-muted/20 text-muted-foreground opacity-65 hover:opacity-90',
                              )}
                            >
                              <Field
                                orientation="horizontal"
                                className="items-start gap-2.5"
                              >
                                <Checkbox
                                  id={checkboxId}
                                  checked={isIncluded}
                                  onCheckedChange={(checked) =>
                                    handleToggleSourceDocument(
                                      doc.doc_uuid,
                                      checked === true,
                                    )
                                  }
                                  className="mt-0.5"
                                />
                                <div className="flex min-w-0 flex-1 flex-col gap-1">
                                  <FieldLabel
                                    htmlFor={checkboxId}
                                    className="flex cursor-pointer items-center gap-1.5 text-xs font-medium leading-snug text-foreground"
                                  >
                                    <DocIcon className="size-3.5 shrink-0 text-primary" />
                                    <span className="truncate">{doc.filename}</span>
                                  </FieldLabel>

                                  <FieldDescription className="line-clamp-2 text-[11px] leading-normal">
                                    {doc.description}
                                  </FieldDescription>

                                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground tabular-nums">
                                    <Badge
                                      variant="secondary"
                                      className="px-1.5 py-0 font-mono text-[10px] uppercase"
                                    >
                                      {doc.status === 'ready' ? 'uploaded' : doc.status}
                                    </Badge>
                                    <span>
                                      {(doc.size_bytes / 1024).toFixed(0)} KB
                                    </span>
                                    {doc.page_count && (
                                      <span>· {doc.page_count}p</span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleOpenPassageInspector({
                                          docUuid: doc.doc_uuid,
                                          filename: doc.filename,
                                        })
                                      }
                                      className="text-primary underline-offset-2 hover:underline"
                                    >
                                      · Passages
                                    </button>
                                    {!isIncluded && (
                                      <span className="text-destructive">
                                        · Excluded
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() =>
                                    setPendingDelete({
                                      kind: 'document',
                                      id: doc.doc_uuid,
                                      label: doc.filename,
                                    })
                                  }
                                  aria-label={`Remove ${doc.filename}`}
                                  title="Delete document from RAG & Knowledge Graph"
                                  className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
                                >
                                  <Trash2Icon />
                                </Button>
                              </Field>
                            </div>
                          )
                        })}
                      </FieldGroup>
                    </FieldSet>
                  )}
                </div>

                {/* Sidebar Footer Quota Summary */}
                <div className="border-t border-border bg-card/50 px-3.5 py-2.5 font-mono text-[11px] text-muted-foreground">
                  <div className="flex items-center justify-between tabular-nums">
                    <span>Project Document Quota</span>
                    <span>
                      {projectDocuments.length} / {project.max_docs} docs
                    </span>
                  </div>
                </div>
              </>
            ) : (
              /* ARTIFACTS TAB PANEL */
              <>
                <div className="border-b border-border p-3.5">
                  <div className="flex flex-col gap-2 rounded-lg border border-border/90 bg-card/70 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium text-foreground">
                          Project Artifacts
                        </span>
                        <span className="text-[11px] leading-snug text-muted-foreground">
                          Generate ADRs, architecture plans, PRDs, or technical reports. Install locally or promote into the Knowledge Base.
                        </span>
                      </div>
                      <FileCodeIcon className="size-4 shrink-0 text-primary" />
                    </div>
                    <Button
                      type="button"
                      variant="default"
                      size="xs"
                      onClick={() => setCreateArtifactDialogOpen(true)}
                      className="mt-1 w-full justify-center"
                    >
                      <SparklesIcon data-icon="inline-start" />
                      Generate Grounded Artifact
                    </Button>
                  </div>

                  {artifactBanner && (
                    <div
                      role="status"
                      className={cn(
                        'mt-2 flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[11px]',
                        artifactBanner.kind === 'ok'
                          ? 'border-primary/30 bg-primary/10 text-foreground'
                          : 'border-destructive/40 bg-destructive/10 text-destructive',
                      )}
                    >
                      <span className="line-clamp-2">{artifactBanner.text}</span>
                      <button
                        type="button"
                        onClick={() => setArtifactBanner(null)}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label="Dismiss artifact message"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  {projectArtifacts.length === 0 ? (
                    <Empty className="border border-dashed border-border bg-card/30 py-8">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <LayersIcon />
                        </EmptyMedia>
                        <EmptyTitle className="text-sm">No artifacts yet</EmptyTitle>
                        <EmptyDescription className="text-xs">
                          Ask the agent in chat to draft an ADR or architecture plan, or click &ldquo;Generate Grounded Artifact&rdquo; above.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {projectArtifacts.map((art) => {
                        const isPromoting = promotingArtifactId === art.artifact_uuid
                        return (
                          <div
                            key={art.artifact_uuid}
                            className="flex flex-col gap-2 rounded-lg border border-border/90 bg-card p-3 shadow-xs transition-colors hover:border-primary/50"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => void handlePreviewArtifact(art.artifact_uuid)}
                                className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                              >
                                <span className="truncate text-xs font-semibold text-foreground hover:text-primary">
                                  {art.title}
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground tabular-nums">
                                  <Badge
                                    variant="secondary"
                                    className="px-1.5 py-0 font-mono text-[10px] uppercase"
                                  >
                                    {art.type.replace(/_/g, ' ')}
                                  </Badge>
                                  <span>v{art.current_version}</span>
                                </div>
                              </button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                onClick={() =>
                                  setPendingDelete({
                                    kind: 'artifact',
                                    id: art.artifact_uuid,
                                    label: art.title,
                                  })
                                }
                                aria-label={`Delete ${art.title}`}
                                title="Delete artifact"
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2Icon />
                              </Button>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                onClick={() => void handlePreviewArtifact(art.artifact_uuid)}
                                className="h-6 px-2 font-mono text-[10px]"
                              >
                                <EyeIcon data-icon="inline-start" />
                                Preview
                              </Button>

                              {/* Install / Download Dropdown (MD / PDF / DOCX) */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="xs"
                                    className="h-6 px-2 font-mono text-[10px]"
                                    disabled={
                                      exportingArtifactKey !== null &&
                                      exportingArtifactKey.startsWith(art.artifact_uuid)
                                    }
                                  >
                                    <DownloadIcon data-icon="inline-start" />
                                    Install
                                    <ChevronDownIcon data-icon="inline-end" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  data-workspace-theme={store.theme}
                                  align="start"
                                  className="w-44"
                                >
                                  <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                                    Install / Download Format
                                  </DropdownMenuLabel>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      void handleDownloadArtifact(art.artifact_uuid, 'md')
                                    }
                                  >
                                    Markdown (.md)
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      void handleDownloadArtifact(art.artifact_uuid, 'pdf')
                                    }
                                  >
                                    PDF Document (.pdf)
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      void handleDownloadArtifact(art.artifact_uuid, 'docx')
                                    }
                                  >
                                    Word Document (.docx)
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>

                              {/* Add to Knowledge Base button */}
                              <Button
                                type="button"
                                variant="secondary"
                                size="xs"
                                disabled={isPromoting}
                                onClick={() => void handlePromoteArtifactToKb(art)}
                                className="h-6 px-2 font-mono text-[10px]"
                                title="Index this artifact into the project Knowledge Base & Vector RAG"
                              >
                                {isPromoting ? (
                                  <Spinner className="size-3" />
                                ) : (
                                  <DatabaseIcon data-icon="inline-start" />
                                )}
                                Add to KB
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="border-t border-border bg-card/50 px-3.5 py-2.5 font-mono text-[11px] text-muted-foreground">
                  <div className="flex items-center justify-between tabular-nums">
                    <span>Project Artifacts</span>
                    <span>{projectArtifacts.length} saved</span>
                  </div>
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      {/* DIALOG 1: Generate Project Artifact */}
      <Dialog
        open={createArtifactDialogOpen}
        onOpenChange={setCreateArtifactDialogOpen}
      >
        <DialogContent
          data-workspace-theme={store.theme}
          className="sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle>Generate Grounded Project Artifact</DialogTitle>
            <DialogDescription>
              Synthesize a structured engineering document from your ticked project sources with exact page &amp; paragraph citations.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleGenerateArtifact} className="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="artifact-type-select">
                  Artifact Type
                </FieldLabel>
                <Select
                  value={artifactTypeDraft}
                  onValueChange={(v) =>
                    setArtifactTypeDraft(
                      v as
                      | 'architecture_plan'
                      | 'adr'
                      | 'prd'
                      | 'tech_report'
                      | 'diagram',
                    )
                  }
                >
                  <SelectTrigger id="artifact-type-select" aria-label="Artifact Type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent data-workspace-theme={store.theme}>
                    <SelectGroup>
                      <SelectItem value="architecture_plan">
                        Architecture Plan
                      </SelectItem>
                      <SelectItem value="adr">
                        Architecture Decision Record (ADR)
                      </SelectItem>
                      <SelectItem value="prd">
                        Product Requirements Document (PRD)
                      </SelectItem>
                      <SelectItem value="tech_report">
                        Technical Synthesis Report
                      </SelectItem>
                      <SelectItem value="diagram">
                        System Diagram Specification
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="artifact-title-input">Title</FieldLabel>
                <Input
                  id="artifact-title-input"
                  required
                  placeholder="e.g., ADR-004: Hybrid Vector & Graph Storage"
                  value={artifactTitleDraft}
                  onChange={(e) => setArtifactTitleDraft(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="artifact-instructions-input">
                  Focus &amp; Instructions (Optional)
                </FieldLabel>
                <Textarea
                  id="artifact-instructions-input"
                  rows={3}
                  placeholder="Describe specific trade-offs, sections, or requirements to emphasize..."
                  value={artifactInstructionsDraft}
                  onChange={(e) => setArtifactInstructionsDraft(e.target.value)}
                />
              </Field>
            </FieldGroup>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateArtifactDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={generatingArtifact || !artifactTitleDraft.trim()}
              >
                {generatingArtifact ? (
                  <>
                    <Spinner className="size-3.5" />
                    Synthesizing...
                  </>
                ) : (
                  <>
                    <SparklesIcon data-icon="inline-start" />
                    Generate Artifact
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: Artifact Preview, Install & Add to Knowledge Base */}
      <Dialog open={artifactPreviewOpen} onOpenChange={setArtifactPreviewOpen}>
        <DialogContent
          data-workspace-theme={store.theme}
          className="flex max-h-[88vh] flex-col sm:max-w-3xl"
        >
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
              <DialogTitle className="text-base font-semibold text-foreground sm:text-lg">
                {selectedArtifactDetail?.title || 'Artifact Preview'}
              </DialogTitle>
              {selectedArtifactDetail && (
                <div className="flex items-center gap-1.5 font-mono text-xs">
                  <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                    {selectedArtifactDetail.type.replace(/_/g, ' ')}
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
                    v{selectedArtifactDetail.current_version}
                  </Badge>
                </div>
              )}
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Install this artifact locally as Markdown, PDF, or Word DOCX, or promote it directly into the project Knowledge Base.
            </DialogDescription>
            {selectedArtifactDetail?.updated_at && (
              <LastUpdatedBadge date={selectedArtifactDetail.updated_at} />
            )}
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-card/50 p-4">
            {loadingArtifactDetail ? (
              <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
                <Spinner className="size-4 text-primary" />
                <span>Loading artifact content...</span>
              </div>
            ) : selectedArtifactDetail &&
              selectedArtifactDetail.versions &&
              selectedArtifactDetail.versions.length > 0 ? (
              <AgentMarkdown
                content={
                  selectedArtifactDetail.versions[
                    selectedArtifactDetail.versions.length - 1
                  ].content
                }
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                No content available for this artifact.
              </p>
            )}
          </div>

          <DialogFooter className="flex flex-wrap items-center justify-between gap-2 sm:justify-between">
            {selectedArtifactDetail && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void handleDownloadArtifact(
                      selectedArtifactDetail.artifact_uuid,
                      'md',
                    )
                  }
                >
                  <DownloadIcon data-icon="inline-start" />
                  Install .MD
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void handleDownloadArtifact(
                      selectedArtifactDetail.artifact_uuid,
                      'pdf',
                    )
                  }
                >
                  <DownloadIcon data-icon="inline-start" />
                  Install .PDF
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void handleDownloadArtifact(
                      selectedArtifactDetail.artifact_uuid,
                      'docx',
                    )
                  }
                >
                  <DownloadIcon data-icon="inline-start" />
                  Install .DOCX
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={
                    promotingArtifactId === selectedArtifactDetail.artifact_uuid
                  }
                  onClick={() =>
                    void handlePromoteArtifactToKb(selectedArtifactDetail)
                  }
                >
                  <DatabaseIcon data-icon="inline-start" />
                  Add to Knowledge Base
                </Button>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setArtifactPreviewOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: Source Passage Inspector (Exact Page & Paragraph Verification) */}
      <Dialog open={passageInspectorOpen} onOpenChange={setPassageInspectorOpen}>
        <DialogContent
          data-workspace-theme={store.theme}
          className="flex max-h-[88vh] flex-col sm:max-w-3xl"
        >
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
              <BookOpenIcon className="size-4 text-primary" />
              <span className="truncate">
                {inspectedDocMeta?.filename || 'Source Document Passages'}
              </span>
              {inspectedDocMeta?.targetPage && (
                <Badge
                  variant="secondary"
                  className="font-mono text-[11px] tabular-nums"
                >
                  p. {inspectedDocMeta.targetPage}
                  {inspectedDocMeta.targetPara
                    ? `, ¶ ${inspectedDocMeta.targetPara}`
                    : ''}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Indexed document passages with exact page and paragraph coordinates used for grounded retrieval.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-card/40 p-3.5">
            {loadingInspectedChunks ? (
              <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
                <Spinner className="size-4 text-primary" />
                <span>Loading indexed passages...</span>
              </div>
            ) : inspectedChunks.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                No indexed passages found for this document.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {inspectedChunks.map((chunk) => {
                  const isTarget =
                    (inspectedDocMeta?.targetChunkId &&
                      chunk.chunk_id === inspectedDocMeta.targetChunkId) ||
                    (inspectedDocMeta?.targetPage !== undefined &&
                      chunk.page_start === inspectedDocMeta.targetPage &&
                      (inspectedDocMeta?.targetPara === undefined ||
                        chunk.para_start === inspectedDocMeta.targetPara))

                  return (
                    <div
                      key={chunk.chunk_id}
                      className={cn(
                        'flex flex-col gap-1.5 rounded-lg border p-3 text-xs transition-colors',
                        isTarget
                          ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                          : 'border-border/80 bg-card',
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <Badge
                            variant={isTarget ? 'default' : 'secondary'}
                            className="font-mono text-[10px] tabular-nums"
                          >
                            {chunk.page_label}
                          </Badge>
                          <span className="text-muted-foreground">
                            {chunk.heading_path || 'Document Root'}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                          Passage #{chunk.ordinal + 1} · {chunk.kind}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed text-foreground">
                        {chunk.text}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPassageInspectorOpen(false)
                navigate(`/projects/${project.project_uuid}/knowledge-base`)
              }}
              className="font-mono text-xs text-primary"
            >
              <FolderKanbanIcon data-icon="inline-start" />
              Open Full Knowledge Base Manager
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPassageInspectorOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title={
          pendingDelete?.kind === 'conversation'
            ? 'Delete conversation'
            : pendingDelete?.kind === 'document'
              ? 'Delete document'
              : pendingDelete?.kind === 'artifact'
                ? 'Delete artifact'
                : 'Remove invite'
        }
        description={
          pendingDelete?.kind === 'document' ? (
            <>
              Deleting <strong>{pendingDelete.label}</strong> permanently removes its indexed passages from Vector/BM25 RAG and prunes orphaned entities from the Knowledge Graph.
            </>
          ) : (
            <>
              Are you sure you want to permanently remove <strong>{pendingDelete?.label}</strong>? This action cannot be undone.
            </>
          )
        }
        confirmLabel={
          pendingDelete?.kind === 'invite' ? 'Remove invite' : 'Delete'
        }
        variant="destructive"
        loading={confirmingDelete}
        theme={store.theme}
        onConfirm={executePendingDelete}
      />
    </div>
  )
}

export default ProjectWorkspacePage

