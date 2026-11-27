/**
 * Repairs common LLM mistakes in Mermaid source before rendering. Pure string logic so it can be
 * tested without a DOM.
 *
 * The main fix: flowchart node labels containing punctuation such as `(`, `)` or `&` must be quoted
 * (`A["Profile (verified)"]`), but models usually leave them bare, which is a parse error.
 */

// A node shape ends right before whitespace, an edge (--> -.- ==> ~~~ <--), `&`, `;`, `:::` or EOL.
const SHAPE_END = String.raw`(?=\s*(?:$|[-=.~<]|&|;|:::))`

// Longer delimiters first so `([` is not mistaken for `(`.
const SHAPES: Array<[open: string, close: string]> = [
  ['([', '])'],
  ['[[', ']]'],
  ['[(', ')]'],
  ['((', '))'],
  ['{{', '}}'],
  ['[', ']'],
  ['(', ')'],
  ['{', '}'],
]

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function quoteLabels(line: string): string {
  let out = line
  for (const [open, close] of SHAPES) {
    const re = new RegExp(
      String.raw`(\b[\w-]+)${escapeRe(open)}(?!["\[\](){}/\\>])(.+?)${escapeRe(close)}${SHAPE_END}`,
      'g',
    )
    out = out.replace(re, (_m, id: string, label: string) => {
      const safe = label.trim().replace(/"/g, '#quot;')
      return `${id}${open}"${safe}"${close}`
    })
  }
  return out
}

export function normalizeMermaidSource(code: string): string {
  const src = code
    .replace(/\\n/g, '<br/>') // models write literal \n for line breaks inside labels
    .replace(/[—–]+>|⟶|→/g, '-->') // typographic arrows
    .trim()

  const header = src.split('\n').find((l) => l.trim())?.trim() ?? ''
  if (!/^(flowchart|graph)\b/i.test(header)) return src

  return src
    .split('\n')
    .map((line, idx) => {
      const t = line.trim()
      if (idx === 0 || !t || t.startsWith('%%') || /^(subgraph|end|classDef|class|style|linkStyle|click|direction)\b/.test(t)) {
        return line
      }
      return quoteLabels(line)
    })
    .join('\n')
}
