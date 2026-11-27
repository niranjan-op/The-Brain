import React from 'react'
import { Link } from 'react-router'
import { ArrowUpRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { BrandGlyph, PatternRadialHalftone } from '../patterns/GraphPatterns'
import { CopyButton } from '../shared/CopyButton'
import { LastUpdatedBadge } from '../shared/LastUpdatedBadge'
import { useAuth } from '../../lib/auth'

export function FooterSection(): React.ReactElement {
  const { user } = useAuth()

  return (
    <>
      <section className="py-16 md:py-24">
        <div className="container">
          <Card className="relative overflow-hidden rounded-3xl border border-border bg-card/85 py-14 text-center backdrop-blur-2xl shadow-2xl">
            <PatternRadialHalftone className="closing-halftone" />
            <CardContent className="relative z-10 mx-auto flex max-w-2xl flex-col items-center gap-4 px-6">
              <CardTitle className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Turn scattered files into clear, cited answers.
              </CardTitle>
              <CardDescription className="text-base text-muted-foreground sm:text-lg">
                Upload your notes, PDFs, slides, and spreadsheets—and verify
                every answer on the exact page it came from.
              </CardDescription>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-3.5">
                <Button asChild size="pill">
                  <Link to={user ? '/projects' : '/login'}>
                    <span>
                      {user ? 'Open Project Workspace' : 'Start Mapping'}
                    </span>
                    <span
                      aria-hidden="true"
                      className="inline-flex size-8 items-center justify-center rounded-full bg-primary-foreground text-primary"
                    >
                      <ArrowUpRightIcon />
                    </span>
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  size="pill"
                  className="border-border bg-card/70 pr-4 text-foreground backdrop-blur-md hover:bg-muted"
                >
                  <a
                    href="https://github.com/niranjan-op/The-Brain"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>View on GitHub</span>
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <footer className="border-t border-border bg-card/80 py-14 backdrop-blur-xl">
        <div className="container">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
            <div className="flex flex-col gap-3 md:col-span-6">
              <Link
                to="/"
                className="inline-flex items-center gap-3 text-foreground no-underline"
              >
                <BrandGlyph size={26} />
                <span className="text-base font-semibold tracking-tight">
                  Knowledge Cartographer
                </span>
              </Link>
              <p className="max-w-md text-sm text-muted-foreground">
                The workspace for students, researchers, and teams to ask
                questions across their files, verify exact page quotes, and keep
                a shared map of decisions.
              </p>
              <div className="mt-1 inline-flex w-fit max-w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 font-mono text-xs text-muted-foreground">
                <span className="truncate">
                  git clone https://github.com/niranjan-op/The-Brain.git
                </span>
                <CopyButton
                  value="git clone https://github.com/niranjan-op/The-Brain.git"
                  ariaLabel="Copy git clone command"
                />
              </div>
            </div>

            <nav
              className="flex flex-col gap-2.5 md:col-span-3"
              aria-label="Landing Page Sections"
            >
              <h3 className="text-xs font-semibold tracking-wide text-foreground">
                Explore
              </h3>
              <ul className="flex flex-col gap-2 list-none p-0 m-0 text-sm text-muted-foreground">
                <li>
                  <a
                    href="#pipeline"
                    className="no-underline transition-colors hover:text-foreground"
                  >
                    How it works
                  </a>
                </li>
                <li>
                  <a
                    href="#intelligence"
                    className="no-underline transition-colors hover:text-foreground"
                  >
                    Meet Rustin
                  </a>
                </li>
                <li>
                  <a
                    href="#walkthrough"
                    className="no-underline transition-colors hover:text-foreground"
                  >
                    Tutorial
                  </a>
                </li>
                <li>
                  <a
                    href="#deep-research"
                    className="no-underline transition-colors hover:text-foreground"
                  >
                    Deep Research
                  </a>
                </li>
                <li>
                  <a
                    href="#faq"
                    className="no-underline transition-colors hover:text-foreground"
                  >
                    FAQ
                  </a>
                </li>
              </ul>
            </nav>

            <nav
              className="flex flex-col gap-2.5 md:col-span-3"
              aria-label="Application Routes"
            >
              <h3 className="text-xs font-semibold tracking-wide text-foreground">
                Product
              </h3>
              <ul className="flex flex-col gap-2 list-none p-0 m-0 text-sm text-muted-foreground">
                <li>
                  <Link
                    to="/login"
                    className="no-underline transition-colors hover:text-foreground"
                  >
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link
                    to="/projects"
                    className="no-underline transition-colors hover:text-foreground"
                  >
                    Projects Workspace
                  </Link>
                </li>
                <li>
                  <a
                    href="https://github.com/niranjan-op/The-Brain"
                    target="_blank"
                    rel="noreferrer"
                    className="no-underline transition-colors hover:text-foreground"
                  >
                    GitHub Repository
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/niranjan-op/The-Brain/blob/main/LICENSE"
                    target="_blank"
                    rel="noreferrer"
                    className="no-underline transition-colors hover:text-foreground"
                  >
                    MIT License
                  </a>
                </li>
              </ul>
            </nav>
          </div>

          <Separator className="my-8 bg-border" />

          <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-muted-foreground">
            <span>MIT License · &copy; 2026 Niranjan Gadgil</span>
            <div className="flex flex-wrap items-center gap-4">
              <LastUpdatedBadge />
              <span>Evidence before assertion · Human-approved graph writes</span>
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}
