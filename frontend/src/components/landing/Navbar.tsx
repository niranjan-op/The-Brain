import React, { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  ArrowUpRightIcon,
  MenuIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { BrandGlyph, ScrollProgressIndicator } from '../patterns/GraphPatterns'
import { useSiteSearch } from '../shared/SiteSearchModal'
import { useAuth } from '../../lib/auth'

const NAV_LINKS = [
  { href: '#pipeline', label: 'How it works' },
  { href: '#intelligence', label: 'Meet Rustin' },
  { href: '#walkthrough', label: 'Tutorial' },
  { href: '#deep-research', label: 'Deep Research' },
  { href: '#faq', label: 'FAQ' },
]

interface NavbarProps {
  themeMode?: 'dark' | 'light'
  onToggleTheme?: (e: React.MouseEvent<HTMLButtonElement>) => void
}

export function Navbar({
  themeMode = 'dark',
  onToggleTheme,
}: NavbarProps): React.ReactElement {
  const { user } = useAuth()
  const { setOpen: setSearchOpen } = useSiteSearch()
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const onScroll = (): void => {
      setIsScrolled(window.scrollY > 24)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-200 ${isScrolled
          ? 'border-b border-border/80 bg-background/85 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
        }`}
    >
      <ScrollProgressIndicator />
      <div className="container flex min-h-18 items-center justify-between gap-4">
        <Link
          to="/"
          className="inline-flex items-center gap-3 text-foreground no-underline"
          aria-label="Knowledge Cartographer Home"
        >
          <BrandGlyph size={28} />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            Knowledge Cartographer
          </span>
        </Link>

        <nav className="hidden lg:block" aria-label="Primary Navigation">
          <ul className="flex items-center gap-7 list-none m-0 p-0">
            {NAV_LINKS.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="text-sm text-muted-foreground no-underline transition-colors hover:text-foreground"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href="https://github.com/niranjan-op/The-Brain"
                target="_blank"
                rel="noreferrer"
                className="text-sm text-muted-foreground no-underline transition-colors hover:text-foreground"
              >
                GitHub
              </a>
            </li>
          </ul>
        </nav>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSearchOpen(true)}
            aria-label="Search site (Ctrl+K)"
            className="hidden h-8 gap-2 border-border/80 bg-card/60 px-2.5 text-xs text-muted-foreground hover:text-foreground sm:inline-flex"
          >
            <SearchIcon data-icon="inline-start" aria-hidden="true" />
            <span>Search</span>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </Button>
          {onToggleTheme && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onToggleTheme}
              aria-label={
                themeMode === 'dark'
                  ? 'Switch landing page to light mode'
                  : 'Switch landing page to dark mode'
              }
              title={
                themeMode === 'dark'
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
              }
            >
              {themeMode === 'dark' ? <SunIcon /> : <MoonIcon />}
            </Button>
          )}
          {user ? (
            <Button asChild size="pill" className="hidden sm:inline-flex">
              <Link to="/projects">
                Open Workspace
                <span
                  aria-hidden="true"
                  className="inline-flex size-8 items-center justify-center rounded-full bg-primary-foreground text-primary"
                >
                  <ArrowUpRightIcon />
                </span>
              </Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex text-muted-foreground hover:text-foreground"
              >
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild size="pill" className="hidden sm:inline-flex">
                <Link to="/signup">
                  Get Started
                  <span
                    aria-hidden="true"
                    className="inline-flex size-8 items-center justify-center rounded-full bg-primary-foreground text-primary"
                  >
                    <ArrowUpRightIcon />
                  </span>
                </Link>
              </Button>
            </>
          )}

          {/* Mobile Drawer via shadcn Sheet */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="lg:hidden border-border/80 bg-card/80 backdrop-blur-md"
                aria-label="Open navigation menu"
              >
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              data-landing-theme={themeMode}
              className="border-border/80 bg-popover/95 backdrop-blur-xl"
            >
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-2.5 text-base font-semibold">
                  <BrandGlyph size={24} />
                  <span>Knowledge Cartographer</span>
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  Cited project knowledge base and human-approved decision graph.
                </SheetDescription>
              </SheetHeader>
              <Separator className="bg-border/70" />
              <div className="px-4 pt-2">
                <SheetClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchOpen(true)}
                    className="w-full justify-between text-xs text-muted-foreground"
                  >
                    <span className="inline-flex items-center gap-2">
                      <SearchIcon data-icon="inline-start" aria-hidden="true" />
                      <span>Search site...</span>
                    </span>
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                      ⌘K
                    </kbd>
                  </Button>
                </SheetClose>
              </div>
              <nav aria-label="Mobile Navigation" className="px-4">
                <ul className="flex flex-col gap-1 list-none m-0 p-0">
                  {NAV_LINKS.map((item) => (
                    <li key={item.href}>
                      <SheetClose asChild>
                        <a
                          href={item.href}
                          className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-foreground no-underline transition-colors hover:bg-muted"
                        >
                          <span>{item.label}</span>
                        </a>
                      </SheetClose>
                    </li>
                  ))}
                  <li>
                    <SheetClose asChild>
                      <a
                        href="https://github.com/niranjan-op/The-Brain"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-foreground no-underline transition-colors hover:bg-muted"
                      >
                        <span>GitHub Repository</span>
                      </a>
                    </SheetClose>
                  </li>
                </ul>
              </nav>
              <div className="mt-auto flex flex-col gap-2.5 p-4">
                {!user && (
                  <SheetClose asChild>
                    <Button asChild variant="outline" className="w-full">
                      <Link to="/login">Sign in</Link>
                    </Button>
                  </SheetClose>
                )}
                <SheetClose asChild>
                  <Button asChild size="pill" className="w-full justify-between">
                    <Link to={user ? '/projects' : '/login'}>
                      <span>{user ? 'Open Workspace' : 'Start Mapping'}</span>
                      <span
                        aria-hidden="true"
                        className="inline-flex size-8 items-center justify-center rounded-full bg-primary-foreground text-primary"
                      >
                        <ArrowUpRightIcon />
                      </span>
                    </Link>
                  </Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
