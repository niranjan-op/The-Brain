import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useNavigate } from 'react-router'
import {
  ArrowRightIcon,
  FolderKanbanIcon,
  HelpCircleIcon,
  LayersIcon,
  MessageCircleIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { FAQ_ITEMS } from '@/data/faqData'
import { trackEvent } from '@/lib/utm'
import { cn } from '@/lib/utils'
import {
  getAppTheme,
  loadWorkspaceState,
  subscribeAppTheme,
  toggleAppTheme,
} from '@/lib/workspaceStore'

interface SiteSearchContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  contactOpen: boolean
  setContactOpen: (open: boolean) => void
  openContact: () => void
}

const SiteSearchContext = createContext<SiteSearchContextValue | null>(null)

export function useSiteSearch(): SiteSearchContextValue {
  const ctx = useContext(SiteSearchContext)
  if (!ctx) {
    throw new Error('useSiteSearch must be used within SiteSearchProvider')
  }
  return ctx
}

export function SiteSearchProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const openContact = useCallback(() => {
    setOpen(false)
    setContactOpen(true)
  }, [])

  return (
    <SiteSearchContext.Provider
      value={{ open, setOpen, contactOpen, setContactOpen, openContact }}
    >
      {children}
    </SiteSearchContext.Provider>
  )
}

interface SearchEntry {
  id: string
  group: 'Pages' | 'Sections' | 'FAQ' | 'Workspaces' | 'Actions'
  title: string
  subtitle: string
  keywords: string
  badge?: string
  icon: React.ReactNode
  onSelect: () => void
}

export function SiteSearchModal(): React.ReactElement {
  const { open, setOpen, openContact } = useSiteSearch()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => getAppTheme())

  useEffect(() => {
    return subscribeAppTheme(setThemeMode)
  }, [])

  const navigateToSection = useCallback(
    (hash: string, faqId?: string): void => {
      setOpen(false)
      if (faqId) {
        window.dispatchEvent(new CustomEvent('kc:open-faq', { detail: faqId }))
      }
      navigate('/')
      window.setTimeout(() => {
        const el = document.querySelector(hash)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
        if (faqId) {
          window.dispatchEvent(new CustomEvent('kc:open-faq', { detail: faqId }))
        }
      }, 90)
    },
    [navigate, setOpen],
  )

  const entries = useMemo<SearchEntry[]>(() => {
    if (!open) return []
    const store = loadWorkspaceState()

    const pageEntries: SearchEntry[] = [
      {
        id: 'page-home',
        group: 'Pages',
        title: 'Home — Knowledge Cartographer',
        subtitle: 'Overview, workflow pipeline, Rustin intelligence, and walkthrough',
        keywords: 'landing home overview',
        icon: <LayersIcon className="size-4 text-primary" aria-hidden="true" />,
        onSelect: () => {
          setOpen(false)
          navigate('/')
        },
      },
      {
        id: 'page-projects',
        group: 'Pages',
        title: 'Project Workspaces',
        subtitle: 'Browse workspaces, filter by role, or create a new project',
        keywords: 'workspaces projects dashboard',
        icon: <FolderKanbanIcon className="size-4 text-primary" aria-hidden="true" />,
        onSelect: () => {
          setOpen(false)
          navigate('/projects')
        },
      },
      {
        id: 'page-login',
        group: 'Pages',
        title: 'Sign in',
        subtitle: 'Log in with Google, email/password, or instant demo workspace',
        keywords: 'login auth signin account',
        icon: <ArrowRightIcon className="size-4 text-primary" aria-hidden="true" />,
        onSelect: () => {
          setOpen(false)
          navigate('/login')
        },
      },
      {
        id: 'page-signup',
        group: 'Pages',
        title: 'Create account',
        subtitle: 'Sign up for Knowledge Cartographer',
        keywords: 'signup register create account',
        icon: <ArrowRightIcon className="size-4 text-primary" aria-hidden="true" />,
        onSelect: () => {
          setOpen(false)
          navigate('/signup')
        },
      },
    ]

    const sectionEntries: SearchEntry[] = [
      {
        id: 'sec-pipeline',
        group: 'Sections',
        title: 'How it works (Pipeline)',
        subtitle: 'Upload sources, hybrid RAG indexing, and citation verification',
        keywords: 'pipeline workflow docling pdf docx',
        icon: <LayersIcon className="size-4 text-muted-foreground" aria-hidden="true" />,
        onSelect: () => navigateToSection('#pipeline'),
      },
      {
        id: 'sec-intelligence',
        group: 'Sections',
        title: 'Meet Rustin (Intelligence)',
        subtitle: 'Deep research, conflict detection, and page-level proof',
        keywords: 'rustin intelligence agent conflicts citations',
        icon: <LayersIcon className="size-4 text-muted-foreground" aria-hidden="true" />,
        onSelect: () => navigateToSection('#intelligence'),
      },
      {
        id: 'sec-walkthrough',
        group: 'Sections',
        title: 'Product Walkthrough',
        subtitle: 'Create projects, upload files, and inspect cited answers',
        keywords: 'tutorial walkthrough screenshots',
        icon: <LayersIcon className="size-4 text-muted-foreground" aria-hidden="true" />,
        onSelect: () => navigateToSection('#walkthrough'),
      },
      {
        id: 'sec-deep-research',
        group: 'Sections',
        title: 'Deep Research',
        subtitle: 'Budgeted multi-step research with Markdown exports',
        keywords: 'deep research reports markdown',
        icon: <LayersIcon className="size-4 text-muted-foreground" aria-hidden="true" />,
        onSelect: () => navigateToSection('#deep-research'),
      },
      {
        id: 'sec-faq',
        group: 'Sections',
        title: 'Frequently Asked Questions',
        subtitle: 'Formats, citations, source scoping, roles, and BYOK quotas',
        keywords: 'faq help questions answers',
        icon: <HelpCircleIcon className="size-4 text-muted-foreground" aria-hidden="true" />,
        onSelect: () => navigateToSection('#faq'),
      },
    ]

    const faqEntries: SearchEntry[] = FAQ_ITEMS.map((item) => ({
      id: `faq-${item.id}`,
      group: 'FAQ',
      title: item.question,
      subtitle: item.answer,
      keywords: `${item.category} ${item.question} ${item.answer}`,
      badge: item.category,
      icon: <HelpCircleIcon className="size-4 text-primary" aria-hidden="true" />,
      onSelect: () => navigateToSection('#faq', item.id),
    }))

    const workspaceEntries: SearchEntry[] = store.projects.map((proj) => ({
      id: `proj-${proj.project_uuid}`,
      group: 'Workspaces',
      title: proj.name,
      subtitle: proj.description || 'Project workspace',
      keywords: `${proj.name} ${proj.description} ${proj.project_uuid}`,
      badge: proj.role,
      icon: <FolderKanbanIcon className="size-4 text-primary" aria-hidden="true" />,
      onSelect: () => {
        setOpen(false)
        navigate(`/projects/${proj.project_uuid}`)
      },
    }))

    const actionEntries: SearchEntry[] = [
      {
        id: 'act-theme',
        group: 'Actions',
        title:
          themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        subtitle: 'Toggle application color theme',
        keywords: 'theme dark light mode appearance',
        icon:
          themeMode === 'dark' ? (
            <SunIcon className="size-4 text-primary" aria-hidden="true" />
          ) : (
            <MoonIcon className="size-4 text-primary" aria-hidden="true" />
          ),
        onSelect: () => {
          toggleAppTheme()
          setOpen(false)
        },
      },
      {
        id: 'act-contact',
        group: 'Actions',
        title: 'Open Contact & Feedback',
        subtitle: 'Send feedback, ask a question, or copy repository details',
        keywords: 'contact feedback support bug question',
        icon: <MessageCircleIcon className="size-4 text-primary" aria-hidden="true" />,
        onSelect: openContact,
      },
    ]

    return [
      ...pageEntries,
      ...workspaceEntries,
      ...sectionEntries,
      ...faqEntries,
      ...actionEntries,
    ]
  }, [open, navigate, navigateToSection, openContact, setOpen, themeMode])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q),
    )
  }, [entries, query])

  const clampedActiveIndex =
    filtered.length > 0 ? Math.min(activeIndex, filtered.length - 1) : 0

  const handleSelect = (entry: SearchEntry): void => {
    trackEvent('site_search_select', { id: entry.id, group: entry.group })
    entry.onSelect()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (prev + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = filtered[clampedActiveIndex]
      if (selected) handleSelect(selected)
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<SearchEntry['group'], SearchEntry[]>()
    for (const item of filtered) {
      const list = map.get(item.group) ?? []
      list.push(item)
      map.set(item.group, list)
    }
    return Array.from(map.entries())
  }, [filtered])

  let runningIdx = 0

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setActiveIndex(0)
        if (!next) setQuery('')
      }}
    >
      <DialogContent
        showCloseButton={true}
        className="flex max-h-[82vh] flex-col gap-3 p-4 sm:max-w-xl"
      >
        <DialogHeader className="gap-1">
          <DialogTitle className="text-base font-semibold">
            Search Knowledge Cartographer
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Jump to pages, landing sections, FAQ answers, workspaces, or quick actions.
          </DialogDescription>
        </DialogHeader>

        <InputGroup className="h-10 bg-muted/40">
          <InputGroupAddon align="inline-start" className="pl-3">
            <SearchIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, sections, FAQs, workspaces..."
            aria-label="Search site pages and content"
            className="h-10"
          />
          <InputGroupAddon align="inline-end" className="pr-3">
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              Esc
            </kbd>
          </InputGroupAddon>
        </InputGroup>

        <div
          role="listbox"
          aria-label="Search results"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1"
        >
          {filtered.length === 0 ? (
            <Empty className="border border-dashed border-border py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchIcon />
                </EmptyMedia>
                <EmptyTitle className="text-sm">No matching results</EmptyTitle>
                <EmptyDescription className="text-xs">
                  No pages, FAQ topics, or workspaces matched &ldquo;{query}&rdquo;.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            grouped.map(([groupName, items]) => (
              <div key={groupName} className="flex flex-col gap-1.5">
                <span className="px-2 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {groupName}
                </span>
                <div className="flex flex-col gap-1">
                  {items.map((item) => {
                    const idx = runningIdx
                    runningIdx += 1
                    const isActive = idx === clampedActiveIndex
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => handleSelect(item)}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                          isActive
                            ? 'border-ring/60 bg-accent text-accent-foreground'
                            : 'border-transparent hover:bg-muted/60',
                        )}
                      >
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="mt-0.5 shrink-0">{item.icon}</span>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate text-sm font-medium text-foreground">
                              {item.title}
                            </span>
                            <span className="line-clamp-1 text-xs text-muted-foreground">
                              {item.subtitle}
                            </span>
                          </div>
                        </div>
                        {item.badge && (
                          <Badge
                            variant="secondary"
                            className="shrink-0 font-mono text-[10px] uppercase"
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-2.5 text-[11px] text-muted-foreground">
          <span>Use Up/Down arrows to select, Enter to open</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setOpen(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
