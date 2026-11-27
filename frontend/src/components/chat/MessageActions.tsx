import * as React from 'react'
import { CheckIcon, CopyIcon, DownloadIcon, FileTextIcon, FileTypeIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { exportMessageApi, type ExportFormat } from '@/lib/api'

interface MessageActionsProps {
  content: string
  /** Resolves a fresh auth token at click time. */
  getToken: () => string
  projectUuid: string
  convoUuid: string
  messageUuid: string
  /** Portaled menus sit outside the themed workspace root, so the theme is passed through. */
  theme?: string
  onError: (message: string) => void
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  // Revoke on the next tick so the browser has started the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function MessageActions({
  content,
  getToken,
  projectUuid,
  convoUuid,
  messageUuid,
  theme,
  onError,
}: MessageActionsProps) {
  const [copied, setCopied] = React.useState(false)
  const [exporting, setExporting] = React.useState<ExportFormat | null>(null)

  React.useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timeout)
  }, [copied])

  const handleCopy = () => {
    navigator.clipboard
      .writeText(content)
      .then(() => setCopied(true))
      .catch(() => onError('Clipboard access was blocked. Select the answer text and copy it manually.'))
  }

  const handleExport = async (format: ExportFormat) => {
    setExporting(format)
    try {
      const file = await exportMessageApi(getToken(), projectUuid, convoUuid, messageUuid, format)
      triggerDownload(file.blob, file.filename)
    } catch (err) {
      onError(err instanceof Error ? err.message : `Could not export the answer as ${format.toUpperCase()}.`)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="flex items-center gap-1 text-muted-foreground" role="group" aria-label="Answer actions">
      <Button type="button" variant="ghost" size="xs" onClick={handleCopy}>
        {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? 'Answer copied' : exporting ? `Preparing ${exporting.toUpperCase()}` : ''}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="xs" disabled={exporting !== null}>
            {exporting ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
            {exporting ? `Preparing ${exporting.toUpperCase()}…` : 'Export'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" data-workspace-theme={theme}>
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => void handleExport('pdf')}>
              <FileTextIcon />
              Download as PDF
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void handleExport('docx')}>
              <FileTypeIcon />
              Download as Word (.docx)
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
