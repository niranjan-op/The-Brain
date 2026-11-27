import React, { useId, useRef, useState } from 'react'
import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  SendIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { CopyButton } from '@/components/shared/CopyButton'
import { useSiteSearch } from '@/components/shared/SiteSearchModal'
import {
  focusFirstInvalidField,
  validateEmail,
  validateRequired,
} from '@/lib/formValidation'
import { attachUtmToPayload, trackEvent } from '@/lib/utm'

const CONTACT_REPO_URL = 'https://github.com/niranjan-op/The-Brain'
const CONTACT_ISSUES_URL = 'https://github.com/niranjan-op/The-Brain/issues'
const CONTACT_SUBMISSIONS_KEY = 'kc_contact_submissions_v1'

interface SubmittedReceipt {
  id: string
  name: string
  email: string
  topic: string
  message: string
  submittedAt: string
}

export function FloatingContactWidget(): React.ReactElement {
  const { contactOpen, setContactOpen } = useSiteSearch()
  const formRef = useRef<HTMLFormElement | null>(null)
  const nameErrId = useId()
  const emailErrId = useId()
  const msgErrId = useId()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [topic, setTopic] = useState('feedback')
  const [message, setMessage] = useState('')
  const [touched, setTouched] = useState<{
    name: boolean
    email: boolean
    message: boolean
  }>({ name: false, email: false, message: false })
  const [submittedAttempt, setSubmittedAttempt] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt] = useState<SubmittedReceipt | null>(null)

  const nameError =
    touched.name || submittedAttempt ? validateRequired(name, 'Name') : null
  const emailError =
    touched.email || submittedAttempt ? validateEmail(email) : null
  const messageError =
    touched.message || submittedAttempt
      ? validateRequired(message, 'Message')
      : null

  const resetForm = (): void => {
    setName('')
    setEmail('')
    setTopic('feedback')
    setMessage('')
    setTouched({ name: false, email: false, message: false })
    setSubmittedAttempt(false)
    setReceipt(null)
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    setSubmittedAttempt(true)

    const nErr = validateRequired(name, 'Name')
    const eErr = validateEmail(email)
    const mErr = validateRequired(message, 'Message')

    if (nErr || eErr || mErr) {
      window.requestAnimationFrame(() => focusFirstInvalidField(formRef.current))
      return
    }

    setSubmitting(true)
    window.setTimeout(() => {
      const payload = attachUtmToPayload({
        id: `msg-${Date.now().toString(36)}`,
        name: name.trim(),
        email: email.trim(),
        topic,
        message: message.trim(),
        submittedAt: new Date().toISOString(),
      })

      try {
        const raw = window.localStorage.getItem(CONTACT_SUBMISSIONS_KEY)
        const existing = raw ? (JSON.parse(raw) as unknown[]) : []
        const next = Array.isArray(existing)
          ? [...existing.slice(-19), payload]
          : [payload]
        window.localStorage.setItem(CONTACT_SUBMISSIONS_KEY, JSON.stringify(next))
      } catch {
        // ignore storage errors
      }

      trackEvent('contact_form_submitted', {
        topic: payload.topic,
        receipt_id: payload.id,
      })

      setSubmitting(false)
      setReceipt({
        id: payload.id,
        name: payload.name,
        email: payload.email,
        topic: payload.topic,
        message: payload.message,
        submittedAt: payload.submittedAt,
      })
    }, 260)
  }

  return (
    <Dialog
      open={contactOpen}
      onOpenChange={(next) => {
        setContactOpen(next)
        if (!next && receipt) {
          resetForm()
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Contact &amp; Feedback
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Share feedback, report an issue, or ask about Knowledge Cartographer.
            </DialogDescription>
          </DialogHeader>

          {receipt ? (
            <div
              role="status"
              className="flex flex-col gap-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm"
            >
              <div className="flex items-start gap-2.5">
                <CheckCircle2Icon
                  className="mt-0.5 size-5 shrink-0 text-emerald-400"
                  aria-hidden="true"
                />
                <div className="flex flex-col gap-1">
                  <p className="font-semibold text-foreground">
                    Message recorded ({receipt.id})
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Thanks, {receipt.name}. Your {receipt.topic} note has been saved with your session attribution. You can also open a public GitHub issue directly if you are reporting a bug.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                <CopyButton
                  value={`Topic: ${receipt.topic}\nFrom: ${receipt.name} <${receipt.email}>\n\n${receipt.message}`}
                  label="Copy message"
                  copiedLabel="Copied"
                  showLabel
                  variant="outline"
                />
                <div className="flex items-center gap-2">
                  <Button asChild variant="outline" size="xs">
                    <a href={CONTACT_ISSUES_URL} target="_blank" rel="noreferrer">
                      <span>Open GitHub Issues</span>
                      <ExternalLinkIcon data-icon="inline-end" aria-hidden="true" />
                    </a>
                  </Button>
                  <Button type="button" size="xs" onClick={resetForm}>
                    Send another
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <form
              ref={formRef}
              noValidate
              onSubmit={handleSubmit}
              className="flex flex-col gap-4"
            >
              <FieldGroup className="gap-4">
                <Field data-invalid={Boolean(nameError) || undefined}>
                  <FieldLabel htmlFor="contact-name">Your name</FieldLabel>
                  <Input
                    id="contact-name"
                    name="name"
                    type="text"
                    required
                    autoComplete="name"
                    placeholder="Alex Rivera"
                    value={name}
                    aria-invalid={nameError ? 'true' : 'false'}
                    aria-describedby={nameError ? nameErrId : undefined}
                    onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
                    onChange={(e) => setName(e.target.value)}
                  />
                  {nameError && <FieldError id={nameErrId}>{nameError}</FieldError>}
                </Field>

                <Field data-invalid={Boolean(emailError) || undefined}>
                  <FieldLabel htmlFor="contact-email">Email address</FieldLabel>
                  <Input
                    id="contact-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    aria-invalid={emailError ? 'true' : 'false'}
                    aria-describedby={emailError ? emailErrId : undefined}
                    onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  {emailError && <FieldError id={emailErrId}>{emailError}</FieldError>}
                </Field>

                <Field>
                  <FieldLabel htmlFor="contact-topic">Topic</FieldLabel>
                  <Select value={topic} onValueChange={setTopic}>
                    <SelectTrigger id="contact-topic" className="w-full">
                      <SelectValue placeholder="Select a topic" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="feedback">Product feedback</SelectItem>
                        <SelectItem value="bug">Bug report</SelectItem>
                        <SelectItem value="question">Architecture question</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <Field data-invalid={Boolean(messageError) || undefined}>
                  <FieldLabel htmlFor="contact-message">Message</FieldLabel>
                  <Textarea
                    id="contact-message"
                    name="message"
                    required
                    rows={3}
                    placeholder="How can we help?"
                    value={message}
                    aria-invalid={messageError ? 'true' : 'false'}
                    aria-describedby={messageError ? msgErrId : undefined}
                    onBlur={() =>
                      setTouched((prev) => ({ ...prev, message: true }))
                    }
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <FieldDescription className="text-xs">
                    Include steps to reproduce if reporting an issue.
                  </FieldDescription>
                  {messageError && (
                    <FieldError id={msgErrId}>{messageError}</FieldError>
                  )}
                </Field>
              </FieldGroup>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
                <span className="truncate font-mono text-muted-foreground">
                  {CONTACT_REPO_URL}
                </span>
                <CopyButton
                  value={CONTACT_REPO_URL}
                  label="Copy repo URL"
                  copiedLabel="Copied"
                  showLabel
                />
              </div>

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setContactOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Spinner data-icon="inline-start" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <SendIcon data-icon="inline-start" aria-hidden="true" />
                      <span>Send message</span>
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
  )
}
