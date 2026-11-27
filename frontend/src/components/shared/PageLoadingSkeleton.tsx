import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

export function PageLoadingSkeleton(): React.ReactElement {
  return (
    <div
      role="status"
      aria-label="Loading page"
      className="flex min-h-screen flex-col bg-background text-foreground"
    >
      <div className="border-b border-border bg-card/70">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="size-8 rounded-lg" />
          </div>
        </div>
      </div>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6"
      >
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
        <span className="sr-only">Loading page content...</span>
      </main>
    </div>
  )
}
