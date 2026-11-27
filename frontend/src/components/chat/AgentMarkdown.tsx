import * as React from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { MermaidDiagram } from '@/components/chat/MermaidDiagram'
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from '@/components/ui/code-block'
import { useHighlightedCode } from '@/hooks/use-highlighted-code'
import { cn } from '@/lib/utils'

function HighlightedCode({ code, language }: { code: string; language: string }) {
  const lines = useHighlightedCode(code, language)
  return (
    <CodeBlock size="sm" className="my-1">
      <CodeBlockHeader>
        <CodeBlockTitle className="font-mono">{language || 'text'}</CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton value={code} />
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent>
        {lines.map((line, index) => (
          <CodeBlockLine key={index}>{line}</CodeBlockLine>
        ))}
      </CodeBlockContent>
    </CodeBlock>
  )
}

function textOf(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

function tokenizeText(input: string): string[] {
  return input.match(/\S+\s*|\s+/g) ?? []
}

function renderTokenizedChildren(children: React.ReactNode, animate: boolean): React.ReactNode {
  if (!animate) return children
  return React.Children.map(children, (child, childIdx) => {
    if (typeof child === 'string') {
      // Preserve whitespace as normal text nodes for natural wrapping while animating word tokens on the compositor.
      return child.split(/(\s+)/g).map((part, partIdx) => {
        if (!part) return null
        if (/^\s+$/.test(part)) return part
        return (
          <span key={`${childIdx}-${partIdx}`} className="kc-stream-token">
            {part}
          </span>
        )
      })
    }
    return child
  })
}

function buildComponents(animate: boolean): Components {
  return {
    h1: ({ node: _node, className, children, ...props }) => (
      <h2 className={cn('agent-md-section mt-5 text-[15px] font-semibold tracking-tight text-foreground first:mt-0', className)} {...props}>
        {renderTokenizedChildren(children, animate)}
      </h2>
    ),
    h2: ({ node: _node, className, children, ...props }) => (
      <h2 className={cn('agent-md-section mt-5 text-[15px] font-semibold tracking-tight text-foreground first:mt-0', className)} {...props}>
        {renderTokenizedChildren(children, animate)}
      </h2>
    ),
    h3: ({ node: _node, className, children, ...props }) => (
      <h3 className={cn('mt-4 text-sm font-semibold text-foreground first:mt-0', className)} {...props}>
        {renderTokenizedChildren(children, animate)}
      </h3>
    ),
    h4: ({ node: _node, className, children, ...props }) => (
      <h4 className={cn('mt-3 text-sm font-medium text-foreground first:mt-0', className)} {...props}>
        {renderTokenizedChildren(children, animate)}
      </h4>
    ),
    p: ({ node: _node, className, children, ...props }) => (
      <p className={cn('max-w-[72ch] leading-[1.65] text-pretty', className)} {...props}>
        {renderTokenizedChildren(children, animate)}
      </p>
    ),
    ul: ({ node: _node, className, ...props }) => (
      <ul
        className={cn(
          'flex max-w-[72ch] list-disc flex-col gap-1 pl-5 marker:text-muted-foreground [&_ul]:mt-1 [&.contains-task-list]:list-none [&.contains-task-list]:pl-1',
          className,
        )}
        {...props}
      />
    ),
    ol: ({ node: _node, className, ...props }) => (
      <ol
        className={cn('flex max-w-[72ch] list-decimal flex-col gap-1 pl-5 marker:text-muted-foreground marker:tabular-nums [&_ol]:mt-1', className)}
        {...props}
      />
    ),
    li: ({ node: _node, className, children, ...props }) => (
      <li className={cn('pl-0.5 leading-[1.65] [&>input]:mr-2 [&>input]:align-middle [&>input]:accent-primary', className)} {...props}>
        {renderTokenizedChildren(children, animate)}
      </li>
    ),
    a: ({ node: _node, className, href, children, ...props }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'font-medium text-primary underline decoration-primary/40 underline-offset-[3px] transition-colors hover:decoration-primary focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          className,
        )}
        {...props}
      >
        {renderTokenizedChildren(children, animate)}
      </a>
    ),
    blockquote: ({ node: _node, className, ...props }) => (
      <blockquote
        className={cn('max-w-[72ch] border-l border-primary/60 pl-3 italic text-muted-foreground [&>p]:leading-relaxed', className)}
        {...props}
      />
    ),
    hr: ({ node: _node, className, ...props }) => <hr className={cn('my-2 border-border', className)} {...props} />,
    table: ({ node: _node, className, ...props }) => (
      <div
        role="region"
        aria-label="Table"
        tabIndex={0}
        className="max-w-full overflow-x-auto rounded-md border border-border focus-visible:outline-2 focus-visible:outline-ring"
      >
        <table className={cn('w-full border-collapse text-[13px] tabular-nums', className)} {...props} />
      </div>
    ),
    thead: ({ node: _node, className, ...props }) => <thead className={cn('bg-muted/60', className)} {...props} />,
    th: ({ node: _node, className, style, children, ...props }) => (
      <th
        style={style}
        className={cn('border-b border-border px-3 py-1.5 text-left text-xs font-semibold whitespace-nowrap text-foreground', className)}
        {...props}
      >
        {renderTokenizedChildren(children, animate)}
      </th>
    ),
    td: ({ node: _node, className, style, children, ...props }) => (
      <td style={style} className={cn('border-b border-border/60 px-3 py-1.5 align-top [tr:last-child_&]:border-b-0', className)} {...props}>
        {renderTokenizedChildren(children, animate)}
      </td>
    ),
    strong: ({ node: _node, className, children, ...props }) => (
      <strong className={cn('font-semibold text-foreground', className)} {...props}>
        {renderTokenizedChildren(children, animate)}
      </strong>
    ),
    em: ({ node: _node, className, children, ...props }) => (
      <em className={cn('italic', className)} {...props}>
        {renderTokenizedChildren(children, animate)}
      </em>
    ),
    del: ({ node: _node, className, children, ...props }) => (
      <del className={className} {...props}>
        {renderTokenizedChildren(children, animate)}
      </del>
    ),
    code: ({ node: _node, className, ...props }) => (
      <code className={cn('rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground', className)} {...props} />
    ),
    pre: ({ children }) => {
      // react-markdown renders fenced code as <pre><code class="language-x">…</code></pre>.
      const codeEl = React.Children.toArray(children).find((child) =>
        React.isValidElement<{ className?: string; children?: React.ReactNode }>(child),
      ) as React.ReactElement<{ className?: string; children?: React.ReactNode }> | undefined
      const language = /language-([\w+-]+)/.exec(codeEl?.props.className ?? '')?.[1] ?? ''
      const code = textOf(codeEl?.props.children ?? children).replace(/\n$/, '')
      const codeBlock = <HighlightedCode code={code} language={language} />
      // While tokens stream the diagram source is incomplete, so render it once the answer settles.
      if (language === 'mermaid' && !animate) {
        return <MermaidDiagram code={code} fallback={codeBlock} />
      }
      return codeBlock
    },
  }
}

const staticComponents = buildComponents(false)
const animatedComponents = buildComponents(true)

/**
 * Renders agent answers as GitHub-flavored Markdown. Raw HTML in model output is never
 * rendered (react-markdown escapes it by default), so injected markup cannot execute.
 * When `animateTokens` is true, reveals the response strictly one token at a time with a smooth
 * compositor-only entrance animation (`kc-stream-token`) and inline pulse caret.
 */
export function AgentMarkdown({
  content,
  className,
  animateTokens = false,
  onStreamComplete,
}: {
  content: string
  className?: string
  animateTokens?: boolean
  onStreamComplete?: () => void
}) {
  const tokens = React.useMemo(() => tokenizeText(content), [content])
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const shouldAnimate = animateTokens && !prefersReducedMotion
  const [visibleCount, setVisibleCount] = React.useState<number>(() =>
    shouldAnimate ? 1 : tokens.length,
  )
  const completedRef = React.useRef(false)
  const onStreamCompleteRef = React.useRef(onStreamComplete)

  React.useEffect(() => {
    onStreamCompleteRef.current = onStreamComplete
  }, [onStreamComplete])

  React.useEffect(() => {
    if (!shouldAnimate) {
      if (animateTokens && !completedRef.current) {
        completedRef.current = true
        onStreamCompleteRef.current?.()
      }
      return
    }

    if (visibleCount >= tokens.length) {
      if (!completedRef.current) {
        completedRef.current = true
        onStreamCompleteRef.current?.()
      }
      return
    }

    const timer = window.setTimeout(() => {
      setVisibleCount((prev) => Math.min(tokens.length, prev + 1))
    }, 18)

    return () => window.clearTimeout(timer)
  }, [shouldAnimate, animateTokens, visibleCount, tokens.length])

  const isStreaming = shouldAnimate && visibleCount < tokens.length
  const displayedContent = isStreaming
    ? tokens.slice(0, visibleCount).join('')
    : content

  return (
    <div
      className={cn(
        'agent-md flex min-w-0 flex-col gap-3 text-sm text-foreground',
        isStreaming && 'kc-md-streaming',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={shouldAnimate ? animatedComponents : staticComponents}
      >
        {displayedContent}
      </ReactMarkdown>
    </div>
  )
}
