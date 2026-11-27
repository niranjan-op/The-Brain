import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  ArrowUpRightIcon,
  CheckCircle2Icon,
  FileTextIcon,
  FolderKanbanIcon,
  LogOutIcon,
  MessageSquareIcon,
  MoonIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SunIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react'
import {
  BrandGlyph,
  PatternDotGrid,
  ScrollProgressIndicator,
} from '../components/patterns/GraphPatterns'
import { CopyButton } from '../components/shared/CopyButton'
import { useSiteSearch } from '../components/shared/SiteSearchModal'
import { Avatar, AvatarFallback } from '../components/ui/avatar'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card'
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from '../components/ui/field'
import { Input } from '../components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '../components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { Separator } from '../components/ui/separator'
import { Skeleton } from '../components/ui/skeleton'
import { Spinner } from '../components/ui/spinner'
import { Textarea } from '../components/ui/textarea'
import { useAuth } from '../lib/auth'
import {
  focusFirstInvalidField,
  validateRequired,
} from '../lib/formValidation'
import { attachUtmToPayload, trackEvent } from '../lib/utm'
import {
  createWorkspaceProject,
  loadWorkspaceState,
  runThemeViewTransition,
  saveWorkspaceState,
  setAppTheme,
  subscribeAppTheme,
  syncProjectsWithBackend,
  type InviteRole,
  type WorkspaceProject,
} from '../lib/workspaceStore'
import { cn } from '../lib/utils'

export function ProjectsPage(): React.ReactElement {
  const {
    user,
    backendOnline,
    refreshBackendHealth,
    signOutWorkspace,
  } = useAuth()
  const navigate = useNavigate()
  const { setOpen: setSiteSearchOpen } = useSiteSearch()

  const [store, setStore] = useState(() => loadWorkspaceState())
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'owner' | 'edit' | 'view'>('all')
  const [syncing, setSyncing] = useState(false)
  const [hasInitialSynced, setHasInitialSynced] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [createSuccessMsg, setCreateSuccessMsg] = useState<string | null>(null)

  // New Project Workspace Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [createTouched, setCreateTouched] = useState({ name: false, description: false })
  const [createSubmitted, setCreateSubmitted] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<InviteRole>('edit')
  const [stagedInvites, setStagedInvites] = useState<{ email: string; role: InviteRole }[]>([])
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const createFormRef = useRef<HTMLFormElement | null>(null)
  const projectNameErrId = useId()
  const projectDescErrId = useId()
  const inviteErrId = useId()
  const maxMembers = 4

  // Sync projects with backend if available
  const handleSyncProjects = async (): Promise<void> => {
    setSyncing(true)
    setSyncError(null)
    try {
      await refreshBackendHealth()
      const mergedProjects = await syncProjectsWithBackend(user?.idToken, store)
      const next = { ...store, projects: mergedProjects }
      setStore(next)
      saveWorkspaceState(next)
    } catch (err) {
      setSyncError(
        err instanceof Error
          ? err.message
          : 'Unable to sync projects with the backend.',
      )
    } finally {
      setSyncing(false)
      setHasInitialSynced(true)
    }
  }

  useEffect(() => {
    void handleSyncProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.idToken])

  useEffect(() => {
    return subscribeAppTheme((nextTheme) => {
      setStore((prev) =>
        prev.theme === nextTheme ? prev : { ...prev, theme: nextTheme },
      )
    })
  }, [])

  const toggleTheme = (e: React.MouseEvent<HTMLButtonElement>): void => {
    void runThemeViewTransition(e, () => {
      const nextTheme: 'dark' | 'light' = store.theme === 'dark' ? 'light' : 'dark'
      const next = { ...store, theme: nextTheme }
      setStore(next)
      saveWorkspaceState(next)
      setAppTheme(nextTheme)
    })
  }

  const handleAddCollaborator = (): void => {
    setInviteError(null)
    const trimmed = inviteEmail.trim().toLowerCase()
    if (!trimmed) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setInviteError('Enter a valid collaborator email address.')
      return
    }
    const maxAdditional = Math.max(0, maxMembers - 1)
    if (stagedInvites.length >= maxAdditional) {
      setInviteError(`Maximum ${maxMembers} members per project (owner + ${maxAdditional} collaborators).`)
      return
    }
    if (stagedInvites.some((item) => item.email === trimmed)) {
      setInviteError('Collaborator already added to this project.')
      return
    }
    setStagedInvites((prev) => [...prev, { email: trimmed, role: inviteRole }])
    setInviteEmail('')
  }

  const handleRemoveCollaborator = (email: string): void => {
    setStagedInvites((prev) => prev.filter((item) => item.email !== email))
    setInviteError(null)
  }

  const resetCreateForm = (): void => {
    setProjectName('')
    setProjectDescription('')
    setCreateTouched({ name: false, description: false })
    setCreateSubmitted(false)
    setInviteEmail('')
    setInviteRole('edit')
    setStagedInvites([])
    setInviteError(null)
    setCreateError(null)
  }

  const projectNameError =
    createTouched.name || createSubmitted
      ? validateRequired(projectName, 'Project title')
      : null
  const projectDescError =
    createTouched.description || createSubmitted
      ? validateRequired(projectDescription, 'Description')
      : null

  const handleCreateWorkspace = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setCreateSubmitted(true)

    const nErr = validateRequired(projectName, 'Project title')
    const dErr = validateRequired(projectDescription, 'Description')
    if (nErr || dErr) {
      window.requestAnimationFrame(() =>
        focusFirstInvalidField(createFormRef.current),
      )
      return
    }

    setCreating(true)
    setCreateError(null)
    try {
      const createdProject: WorkspaceProject = await createWorkspaceProject(
        user?.idToken,
        user?.uid || 'dev_user_1',
        {
          name: projectName,
          description: projectDescription,
          invites: stagedInvites,
        },
      )

      const nextState = {
        ...store,
        projects: [createdProject, ...store.projects],
      }
      setStore(nextState)
      saveWorkspaceState(nextState)
      trackEvent(
        'project_created',
        attachUtmToPayload({
          project_uuid: createdProject.project_uuid,
          invite_count: stagedInvites.length,
        }),
      )
      setCreateDialogOpen(false)
      resetCreateForm()
      setCreateSuccessMsg(`Workspace "${createdProject.name}" created.`)
      window.setTimeout(() => {
        navigate(`/projects/${createdProject.project_uuid}`)
      }, 450)
    } catch (err) {
      setCreateError(
        err instanceof Error
          ? err.message
          : 'Unable to create project workspace.',
      )
    } finally {
      setCreating(false)
    }
  }

  const filteredProjects = useMemo(() => {
    return store.projects.filter((project) => {
      const matchesRole = roleFilter === 'all' || project.role === roleFilter
      if (!matchesRole) return false
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        project.name.toLowerCase().includes(q) ||
        project.description.toLowerCase().includes(q) ||
        project.project_uuid.toLowerCase().includes(q)
      )
    })
  }, [store.projects, searchQuery, roleFilter])

  const userInitials = useMemo(() => {
    if (!user?.displayName && !user?.email) return 'KC'
    const source = user.displayName || user.email
    return source.slice(0, 2).toUpperCase()
  }, [user])

  return (
    <div
      data-workspace-theme={store.theme}
      className="relative min-h-screen bg-background text-foreground"
    >
      <PatternDotGrid id="dashboard-dot-grid" className="opacity-[0.04] pointer-events-none" />

      {/* Top Navigation Header */}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-sidebar/95 backdrop-blur-md">
        <ScrollProgressIndicator />
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-foreground transition-opacity hover:opacity-90"
            >
              <BrandGlyph size={24} />
              <span>Knowledge Cartographer</span>
            </Link>
            <Separator orientation="vertical" className="h-5 bg-border/60" />
            <span className="rounded-md border border-border/60 bg-card px-2 py-0.5 font-mono text-xs text-muted-foreground">
              Workspaces
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSiteSearchOpen(true)}
              aria-label="Search site (Ctrl+K)"
              className="hidden h-8 gap-1.5 border-border bg-card/70 px-2.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground sm:inline-flex"
            >
              <SearchIcon data-icon="inline-start" aria-hidden="true" />
              <span>Search</span>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
                ⌘K
              </kbd>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleSyncProjects()}
              disabled={syncing}
              title="Sync projects with PostgreSQL backend"
              className="h-8 gap-1.5 border-border bg-card/70 px-2.5 text-xs font-medium hover:bg-secondary hover:text-foreground"
            >
              <RefreshCwIcon
                data-icon="inline-start"
                className={cn('size-3.5', syncing && 'animate-spin')}
              />
              <span className="hidden sm:inline">
                {backendOnline ? 'DB Connected' : 'Local Preview'}
              </span>
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  backendOnline ? 'bg-emerald-400' : 'bg-amber-400',
                )}
              />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={toggleTheme}
              aria-label={
                store.theme === 'dark'
                  ? 'Switch to light theme'
                  : 'Switch to dark theme'
              }
              title={
                store.theme === 'dark'
                  ? 'Switch to light theme'
                  : 'Switch to dark theme'
              }
              className="rounded-lg text-muted-foreground hover:bg-card hover:text-foreground"
            >
              {store.theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </Button>

            <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-card px-2.5 py-1">
              <Avatar className="size-6">
                <AvatarFallback className="bg-secondary text-xs font-normal text-foreground">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-40 truncate text-xs font-normal text-muted-foreground sm:inline">
                {user?.email || 'dev_user_1@kc.local'}
              </span>
            </div>

            {user ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={async () => {
                  await signOutWorkspace()
                  navigate('/login')
                }}
                aria-label="Sign out"
                title="Sign out"
                className="text-muted-foreground hover:bg-card hover:text-foreground"
              >
                <LogOutIcon />
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm" className="h-8 border-border bg-card">
                <Link to="/login">Sign in</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main
        id="main-content"
        tabIndex={-1}
        className="relative z-10 mx-auto flex max-w-7xl flex-col gap-7 px-4 py-8 outline-none sm:px-6 lg:px-8"
      >
        {/* Page Heading + New Project Trigger */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Project Workspaces
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-secondary-foreground/90 sm:text-base">
              Select a workspace to query uploaded documents, filter active sources per conversation, and inspect the decision graph.
            </p>
          </div>

          <Dialog
            open={createDialogOpen}
            onOpenChange={(open) => {
              setCreateDialogOpen(open)
              if (!open) resetCreateForm()
            }}
          >
            <DialogTrigger asChild>
              <Button size="default" className="h-10 gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground shadow-xs hover:bg-primary/90">
                <PlusIcon data-icon="inline-start" className="size-4" />
                New Project Workspace
              </Button>
            </DialogTrigger>

            <DialogContent
              data-workspace-theme={store.theme}
              className="max-h-[90vh] overflow-y-auto border-border bg-popover shadow-elevated sm:max-w-xl"
            >
              <form
                ref={createFormRef}
                noValidate
                onSubmit={(e) => void handleCreateWorkspace(e)}
                className="flex flex-col gap-5"
              >
                <DialogHeader>
                  <DialogTitle className="text-xl font-semibold tracking-tight text-foreground">
                    Create Project Workspace
                  </DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    Create your project workspace and configure collaborator access
                  </DialogDescription>
                </DialogHeader>

                <FieldGroup className="gap-4">
                  <Field data-invalid={Boolean(projectNameError) || undefined}>
                    <FieldLabel
                      htmlFor="project-name-input"
                      className="text-sm font-medium text-foreground"
                    >
                      Project Title
                    </FieldLabel>
                    <Input
                      id="project-name-input"
                      required
                      placeholder="e.g., Payments Migration"
                      value={projectName}
                      aria-invalid={projectNameError ? 'true' : 'false'}
                      aria-describedby={
                        projectNameError ? projectNameErrId : undefined
                      }
                      onBlur={() =>
                        setCreateTouched((prev) => ({ ...prev, name: true }))
                      }
                      onChange={(e) => setProjectName(e.target.value)}
                      className="border-border bg-card text-foreground focus-visible:border-primary"
                    />
                    {projectNameError && (
                      <FieldError id={projectNameErrId}>
                        {projectNameError}
                      </FieldError>
                    )}
                  </Field>

                  <Field data-invalid={Boolean(projectDescError) || undefined}>
                    <FieldLabel
                      htmlFor="project-description-input"
                      className="text-sm font-medium text-foreground"
                    >
                      Description
                    </FieldLabel>
                    <Textarea
                      id="project-description-input"
                      required
                      rows={3}
                      placeholder="Workspace overview and goals..."
                      value={projectDescription}
                      aria-invalid={projectDescError ? 'true' : 'false'}
                      aria-describedby={
                        projectDescError ? projectDescErrId : undefined
                      }
                      onBlur={() =>
                        setCreateTouched((prev) => ({
                          ...prev,
                          description: true,
                        }))
                      }
                      onChange={(e) => setProjectDescription(e.target.value)}
                      className="border-border bg-card text-foreground focus-visible:border-primary"
                    />
                    <FieldDescription className="text-xs text-muted-foreground">
                      Shown on the workspace card so collaborators understand the project focus.
                    </FieldDescription>
                    {projectDescError && (
                      <FieldError id={projectDescErrId}>
                        {projectDescError}
                      </FieldError>
                    )}
                  </Field>

                  <Field data-invalid={Boolean(inviteError) || undefined}>
                    <div className="flex items-center justify-between">
                      <FieldLabel
                        htmlFor="collaborator-email-input"
                        className="text-sm font-medium text-foreground"
                      >
                        Add Collaborators
                      </FieldLabel>
                      <span className="font-mono text-xs text-muted-foreground">
                        {1 + stagedInvites.length} / {maxMembers} members
                      </span>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="collaborator-email-input"
                        type="email"
                        placeholder="colleague@company.com"
                        value={inviteEmail}
                        aria-invalid={inviteError ? 'true' : 'false'}
                        aria-describedby={inviteError ? inviteErrId : undefined}
                        onChange={(e) => {
                          setInviteEmail(e.target.value)
                          if (inviteError) setInviteError(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddCollaborator()
                          }
                        }}
                        className="flex-1 border-border bg-card text-foreground focus-visible:border-primary"
                      />
                      <Select
                        value={inviteRole}
                        onValueChange={(val) => setInviteRole(val as InviteRole)}
                      >
                        <SelectTrigger className="w-full sm:w-32 border-border bg-card text-xs font-normal" aria-label="Collaborator role">
                          <SelectValue placeholder="Role" />
                        </SelectTrigger>
                        <SelectContent data-workspace-theme={store.theme}>
                          <SelectGroup>
                            <SelectItem value="edit" className="text-xs font-normal">Can Edit</SelectItem>
                            <SelectItem value="view" className="text-xs font-normal">Can View</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleAddCollaborator}
                        className="border border-border/60 bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      >
                        <UserPlusIcon data-icon="inline-start" />
                        Add
                      </Button>
                    </div>

                    {inviteError && (
                      <FieldError id={inviteErrId} className="text-xs">
                        {inviteError}
                      </FieldError>
                    )}

                    <FieldDescription className="text-xs text-muted-foreground">
                      Invite up to 3 collaborators by email with Edit or View access.
                    </FieldDescription>

                    {stagedInvites.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-border bg-card/60 p-2.5">
                        {stagedInvites.map((inv) => (
                          <div
                            key={inv.email}
                            className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-xs font-normal"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate font-mono text-xs text-foreground">
                                {inv.email}
                              </span>
                              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium uppercase">
                                {inv.role}
                              </Badge>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleRemoveCollaborator(inv.email)}
                              aria-label={`Remove ${inv.email}`}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2Icon className="size-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Field>

                  {/* Workspace Terms & Conditions */}
                  <div className="flex flex-col gap-1.5 rounded-lg border border-border/80 bg-card/50 p-3.5 text-xs text-muted-foreground">
                    <span className="text-xs font-medium text-foreground">
                      Workspace Quotas &amp; Safeguards
                    </span>
                    <ul className="flex flex-col gap-1 list-disc pl-4 text-xs leading-relaxed text-secondary-foreground/80">
                      <li>Up to 4 members per workspace (1 owner + 3 collaborators)</li>
                      <li>Up to 50 documents (5 MB max per file)</li>
                      <li>25 daily file uploads with hybrid vector + BM25 indexing</li>
                    </ul>
                  </div>
                  {createError && (
                    <div
                      role="alert"
                      className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                    >
                      {createError}
                    </div>
                  )}
                </FieldGroup>

                <DialogFooter className="gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateDialogOpen(false)}
                    className="border-border bg-card hover:bg-secondary"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating} className="bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
                    {creating && <Spinner data-icon="inline-start" />}
                    <span>
                      {creating ? 'Creating Workspace...' : 'Create & Open Workspace'}
                    </span>
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {createSuccessMsg && (
          <div
            role="status"
            className="flex items-center gap-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-foreground"
          >
            <CheckCircle2Icon className="size-4 shrink-0 text-emerald-400" aria-hidden="true" />
            <span>{createSuccessMsg}</span>
          </div>
        )}

        {syncError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs text-destructive"
          >
            <span>{syncError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleSyncProjects()}
              className="h-7 border-destructive/40 bg-transparent px-2.5 text-xs text-destructive hover:bg-destructive/15"
            >
              Retry sync
            </Button>
          </div>
        )}

        {/* Search & Role Filter Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <InputGroup className="w-full sm:max-w-md rounded-lg border border-border bg-card shadow-xs focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
            <InputGroupAddon align="inline-start" className="pl-3">
              <SearchIcon className="size-4 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search workspaces by title or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search workspaces"
              className="border-0 bg-transparent text-sm placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:border-0"
            />
            {searchQuery && (
              <InputGroupAddon align="inline-end" className="pr-2">
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                  aria-label="Clear search"
                >
                  Clear
                </button>
              </InputGroupAddon>
            )}
          </InputGroup>

          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/80 bg-card/80 p-1">
            {(['all', 'owner', 'edit', 'view'] as const).map((role) => {
              const count =
                role === 'all'
                  ? store.projects.length
                  : store.projects.filter((p) => p.role === role).length
              const isActive = roleFilter === role
              const label =
                role === 'all'
                  ? 'All Workspaces'
                  : role === 'owner'
                    ? 'Owner'
                    : role === 'edit'
                      ? 'Editor'
                      : 'Viewer'

              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => setRoleFilter(role)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                    isActive
                      ? 'border border-border/80 bg-secondary text-foreground shadow-xs'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                  )}
                >
                  <span>{label}</span>
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.2 font-mono text-[10px]',
                      isActive
                        ? 'bg-muted text-foreground'
                        : 'bg-muted/40 text-muted-foreground',
                    )}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Workspaces Grid */}
        {syncing && !hasInitialSynced && store.projects.length === 0 ? (
          <div
            role="status"
            aria-label="Loading project workspaces"
            className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
          >
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5"
              >
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-5 w-44" />
                  <Skeleton className="h-8 w-full" />
                </div>
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <Empty className="my-8 rounded-xl border border-dashed border-border bg-card/40 py-16 shadow-xs">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="size-10 rounded-xl bg-secondary text-primary">
                <FolderKanbanIcon className="size-5" />
              </EmptyMedia>
              <EmptyTitle className="text-base font-semibold text-foreground">No matching workspaces</EmptyTitle>
              <EmptyDescription className="text-sm leading-relaxed text-secondary-foreground/80">
                {searchQuery
                  ? `No workspaces found matching "${searchQuery}". Clear your search or change the filter.`
                  : 'Create a new project workspace to upload documents, invite collaborators, and start querying with source-scoped citations.'}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="mt-2">
              <Button onClick={() => setCreateDialogOpen(true)} className="bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
                <PlusIcon data-icon="inline-start" />
                New Project Workspace
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => {
              const projectDocs = store.documents.filter(
                (d) => d.project_uuid === project.project_uuid,
              )
              const projectConvos = store.conversations.filter(
                (c) => c.project_uuid === project.project_uuid,
              )
              const docCount =
                projectDocs.length > 0 ? projectDocs.length : (project.doc_count ?? 0)
              const convoCount =
                projectConvos.length > 0 ? projectConvos.length : (project.convo_count ?? 0)
              const memberCount = 1 + (project.invites?.length || 0)

              return (
                <Card
                  key={project.project_uuid}
                  className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-0 shadow-card transition-all duration-200 hover:border-primary/50 hover:bg-[color-mix(in_oklab,var(--card),#38BDF8_2%)] hover:shadow-elevated"
                >
                  <CardHeader className="flex flex-col gap-3 p-5">
                    <div className="flex items-center justify-between gap-2">
                      {project.role === 'owner' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          <span className="size-1.5 rounded-full bg-primary" />
                          Owner
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground capitalize">
                          {project.role === 'edit' ? 'Editor' : 'Viewer'}
                        </span>
                      )}
                      <span className="font-mono text-xs text-muted-foreground">
                        {new Date(project.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <CardTitle className="text-base font-semibold leading-snug tracking-tight text-foreground group-hover:text-primary transition-colors">
                        <Link
                          to={`/projects/${project.project_uuid}`}
                          className="after:absolute after:inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {project.name}
                        </Link>
                      </CardTitle>

                      <CardDescription className="line-clamp-2 min-h-[2.25rem] text-xs leading-relaxed text-secondary-foreground/80">
                        {project.description || 'No description provided.'}
                      </CardDescription>
                    </div>
                  </CardHeader>

                  <CardContent className="px-5 pb-4 pt-0">
                    <div className="rounded-lg border border-border/60 bg-muted/50 p-2.5">
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="flex items-center gap-1.5" title="Uploaded documents">
                          <FileTextIcon className="size-3.5 shrink-0 text-sky-400" />
                          <span className="truncate font-medium text-foreground">
                            {docCount}{' '}
                            <span className="font-normal text-muted-foreground">
                              {docCount === 1 ? 'doc' : 'docs'}
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5" title="Conversations in project">
                          <MessageSquareIcon className="size-3.5 shrink-0 text-indigo-400" />
                          <span className="truncate font-medium text-foreground">
                            {convoCount}{' '}
                            <span className="font-normal text-muted-foreground">
                              {convoCount === 1 ? 'chat' : 'chats'}
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5" title="Team members">
                          <UsersIcon className="size-3.5 shrink-0 text-emerald-400" />
                          <span className="truncate font-medium text-foreground">
                            {memberCount}{' '}
                            <span className="font-normal text-muted-foreground">
                              {memberCount === 1 ? 'member' : 'members'}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="flex items-center justify-between border-t border-border/70 bg-transparent px-5 py-3 text-xs">
                    <div className="relative z-10 flex items-center gap-1.5">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        Shared workspace
                      </span>
                      <CopyButton
                        value={
                          typeof window !== 'undefined'
                            ? `${window.location.origin}/projects/${project.project_uuid}`
                            : `/projects/${project.project_uuid}`
                        }
                        ariaLabel={`Copy link to ${project.name}`}
                      />
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-transform group-hover:translate-x-0.5">
                      Open Workspace
                      <ArrowUpRightIcon className="size-3.5" />
                    </span>
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
export default ProjectsPage
