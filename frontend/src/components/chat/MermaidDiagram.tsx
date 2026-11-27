import * as React from 'react'

import { normalizeMermaidSource } from '@/components/chat/mermaidSource'
import { cn } from '@/lib/utils'

type MermaidApi = typeof import('mermaid').default

let mermaidPromise: Promise<MermaidApi> | null = null
let renderSeq = 0

// Mermaid is ~1 MB, so it is loaded on first diagram only, never in the main bundle.
function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import('mermaid').then((m) => m.default)
  return mermaidPromise
}

/** Render the repaired source first; fall back to the untouched source if the repair misfired. */
async function renderWithRepair(mermaid: MermaidApi, code: string): Promise<string> {
  const candidates = Array.from(new Set([normalizeMermaidSource(code), code.trim()]))
  let lastError: unknown
  for (const source of candidates) {
    try {
      // Parse first: a failed render() leaves Mermaid's error graphic attached to <body>.
      await mermaid.parse(source)
      renderSeq += 1
      return (await mermaid.render(`kc-mermaid-${renderSeq}`, source)).svg
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

function currentTheme(el: HTMLElement | null): 'dark' | 'default' {
  const scope = el?.closest('[data-workspace-theme]')
  return scope?.getAttribute('data-workspace-theme') === 'light' ? 'default' : 'dark'
}

export function MermaidDiagram({
  code,
  fallback,
  className,
}: {
  code: string
  fallback: React.ReactNode
  className?: string
}) {
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const [svg, setSvg] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const run = { cancelled: false }
    const theme = currentTheme(hostRef.current)

    void loadMermaid()
      .then(async (mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          // Strict mode sanitizes labels and disables click handlers in model-generated diagrams.
          securityLevel: 'strict',
          theme,
          fontFamily: 'inherit',
          themeVariables:
            theme === 'dark'
              ? { primaryColor: '#111827', primaryBorderColor: '#38bdf8', lineColor: '#7dd3fc', primaryTextColor: '#f4f4f5' }
              : undefined,
        })
        const rendered = await renderWithRepair(mermaid, code)
        if (!run.cancelled) {
          setSvg(rendered)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!run.cancelled) {
          setSvg(null)
          setError(err instanceof Error ? err.message.split('\n')[0] : 'Diagram could not be rendered.')
        }
      })

    return () => {
      run.cancelled = true
    }
  }, [code])

  if (error) {
    return (
      <div className="flex flex-col gap-1">
        {fallback}
        <p className="font-mono text-[11px] text-muted-foreground">Diagram syntax error: {error}</p>
      </div>
    )
  }

  return (
    <figure
      ref={hostRef}
      role="img"
      aria-label="Diagram"
      className={cn(
        'my-1 flex min-h-24 items-center justify-center overflow-x-auto rounded-md border border-border bg-card/60 p-4 [&_svg]:h-auto [&_svg]:max-w-full',
        className,
      )}
    >
      {svg ? (
        // Output comes from mermaid.render with securityLevel 'strict' (DOMPurify-sanitized SVG).
        <div className="w-full [&>svg]:mx-auto" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <span className="font-mono text-[11px] text-muted-foreground">Rendering diagram…</span>
      )}
    </figure>
  )
}
