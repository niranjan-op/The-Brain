import React from 'react'
import { Link } from 'react-router'
import { ArrowUpRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '../../lib/auth'

export function HeroSection(): React.ReactElement {
  const { user } = useAuth()

  return (
    <section className="relative flex min-h-[calc(100svh-4.5rem)] items-center justify-center overflow-hidden pt-20 pb-10">
      <div className="container">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-6 text-center">
          <h1 className="max-w-[15ch] text-[clamp(2.85rem,6.2vw,5.35rem)] leading-[1.04] font-semibold tracking-[-0.035em] text-foreground">
            Turn your files into a living project brain.
          </h1>

          <p className="max-w-[52ch] text-base leading-relaxed sm:text-xl">
            <span className="font-semibold text-foreground">
              Upload your notes, PDFs, slides, and diagrams.
            </span>{' '}
            <span className="text-muted-foreground">
              Ask questions in plain language, get answers linked to the exact
              page, and keep every project decision connected.
            </span>
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <Button asChild size="pill">
              <Link to={user ? '/projects' : '/signup'}>
                <span>
                  {user ? 'Open Knowledge Workspace' : 'Start a Project'}
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
              className="border-border bg-card/70 pr-5 text-foreground backdrop-blur-md hover:bg-muted"
            >
              <a href="#pipeline">
                <span>See how it works</span>
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
