import React, { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { RRF_BENCHMARK_CASES } from '../../data/landingData'

export function FeaturesSection(): React.ReactElement {
  const [selectedRrfCaseId, setSelectedRrfCaseId] = useState<string>(
    RRF_BENCHMARK_CASES[0].id,
  )
  const [proposalDecision, setProposalDecision] = useState<
    'pending' | 'approved' | 'rejected'
  >('pending')
  const [quotaMode, setQuotaMode] = useState<'managed' | 'byok'>('managed')

  const activeRrfCase =
    RRF_BENCHMARK_CASES.find((c) => c.id === selectedRrfCaseId) ||
    RRF_BENCHMARK_CASES[0]

  return (
    <section id="capabilities" className="py-20 md:py-28">
      <div className="container">
        <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Built so you can trust every answer.
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Find exact numbers and broad ideas at once, review changes before
              they go live, and collaborate with your team.
            </p>
          </div>
          <Badge
            variant="outline"
            className="h-7 border-border bg-card/70 text-xs text-muted-foreground"
          >
            Why Teams &amp; Students Switch
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Card 1: Smart Search (Meaning + Exact Words) */}
          <Card className="lg:col-span-12 rounded-3xl border border-border bg-card/90 backdrop-blur-2xl shadow-2xl">
            <CardHeader className="border-b border-border pb-4">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div>
                  <CardTitle className="text-lg font-semibold text-foreground">
                    Smart Search: Meaning + Exact Words
                  </CardTitle>
                  <CardDescription className="mt-1 text-sm text-muted-foreground">
                    Standard search misses context, while AI-only search misses
                    exact names and numbers. We combine both automatically.
                  </CardDescription>
                </div>

                <Tabs
                  value={selectedRrfCaseId}
                  onValueChange={(v) => setSelectedRrfCaseId(v)}
                >
                  <TabsList
                    aria-label="Select search example"
                    className="h-auto! w-auto! bg-muted/70 p-1"
                  >
                    {RRF_BENCHMARK_CASES.map((item) => (
                      <TabsTrigger
                        key={item.id}
                        value={item.id}
                        className="flex-initial! text-xs px-3 py-1.5"
                      >
                        {item.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>

            <CardContent className="flex flex-col gap-4 pt-4">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-xs">
                <span className="text-muted-foreground">Example question:</span>
                <strong className="text-foreground">
                  &ldquo;{activeRrfCase.query}&rdquo;
                </strong>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {/* Lane 1: Meaning Only */}
                <div
                  className={`flex flex-col gap-2 rounded-2xl border p-4 ${
                    activeRrfCase.vectorOnlyTop.hit
                      ? 'border-border bg-muted/35'
                      : 'border-border/60 bg-muted/15 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Meaning Search Alone
                    </span>
                    <Badge
                      variant="outline"
                      className="border-border text-[11px]"
                    >
                      {activeRrfCase.vectorOnlyTop.score}
                    </Badge>
                  </div>
                  <p className="text-xs font-medium text-foreground">
                    {activeRrfCase.vectorOnlyTop.ref}
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {activeRrfCase.vectorOnlyTop.note}
                  </p>
                </div>

                {/* Lane 2: Exact Words Only */}
                <div
                  className={`flex flex-col gap-2 rounded-2xl border p-4 ${
                    activeRrfCase.bm25OnlyTop.hit
                      ? 'border-border bg-muted/35'
                      : 'border-border/60 bg-muted/15 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Keyword Search Alone
                    </span>
                    <Badge
                      variant="outline"
                      className="border-border text-[11px]"
                    >
                      {activeRrfCase.bm25OnlyTop.score}
                    </Badge>
                  </div>
                  <p className="text-xs font-medium text-foreground">
                    {activeRrfCase.bm25OnlyTop.ref}
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {activeRrfCase.bm25OnlyTop.note}
                  </p>
                </div>

                {/* Lane 3: Combined Winner */}
                <div className="flex flex-col gap-2 rounded-2xl border border-[var(--aurora-cyan)]/45 bg-[var(--aurora-violet)]/15 p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--aurora-cyan)]">
                      Knowledge Cartographer
                    </span>
                    <Badge className="bg-[var(--signal)] text-white dark:text-[#070318] font-medium text-[11px]">
                      Best Match
                    </Badge>
                  </div>
                  <p className="text-xs font-semibold text-foreground">
                    {activeRrfCase.hybridRrfTop.ref}
                  </p>
                  <p className="text-xs leading-relaxed text-foreground/90">
                    {activeRrfCase.hybridRrfTop.note}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: You Approve Every Update */}
          <Card className="lg:col-span-6 rounded-3xl border border-border bg-card/90 backdrop-blur-2xl shadow-xl">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg font-semibold text-foreground">
                  You Approve Every Map Change
                </CardTitle>
                <Badge
                  variant="outline"
                  className={`text-[11px] ${
                    proposalDecision === 'approved'
                      ? 'border-[var(--signal)]/50 text-[var(--signal)]'
                      : proposalDecision === 'rejected'
                        ? 'border-red-400/50 text-red-500 dark:text-red-300'
                        : 'border-border text-muted-foreground'
                  }`}
                >
                  {proposalDecision === 'approved'
                    ? 'Approved'
                    : proposalDecision === 'rejected'
                      ? 'Skipped'
                      : 'Waiting for you'}
                </Badge>
              </div>
              <CardDescription className="text-sm text-muted-foreground">
                AI never silently rewrites your project&apos;s decision map. You
                review and approve every suggested update.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              <div className="rounded-2xl border border-border bg-muted/40 p-4">
                <div className="mb-1 text-[11px] font-medium text-[var(--aurora-lilac)]">
                  SUGGESTED UPDATE FROM MEETING NOTES
                </div>
                <p className="text-sm font-medium text-foreground">
                  <strong>New Decision:</strong> Finalize Friday 5 PM submission
                  deadline for all slide decks
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Replaces: Earlier draft schedule (Page 2)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setProposalDecision('approved')}
                >
                  Approve Update
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setProposalDecision('rejected')}
                >
                  Dismiss
                </Button>
                {proposalDecision !== 'pending' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setProposalDecision('pending')}
                  >
                    Reset
                  </Button>
                )}
              </div>
            </CardContent>

            <CardFooter
              className="border-t border-border bg-muted/25 py-3 text-xs text-muted-foreground"
              aria-live="polite"
            >
              {proposalDecision === 'approved' &&
                '✓ Added to your shared decision map with a link to Page 2.'}
              {proposalDecision === 'rejected' &&
                '✕ Ignored—your decision map was not changed.'}
              {proposalDecision === 'pending' &&
                'Click Approve or Dismiss above to see how review works.'}
            </CardFooter>
          </Card>

          {/* Card 3: Built for Teams & Zero Lockout */}
          <Card className="lg:col-span-6 rounded-3xl border border-border bg-card/90 backdrop-blur-2xl shadow-xl">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg font-semibold text-foreground">
                  Team-Ready &amp; Never Locked Out
                </CardTitle>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={quotaMode}
                  onValueChange={(val) => {
                    if (val === 'managed' || val === 'byok') setQuotaMode(val)
                  }}
                  aria-label="Usage mode"
                >
                  <ToggleGroupItem value="managed" className="text-xs">
                    Included Daily Plan
                  </ToggleGroupItem>
                  <ToggleGroupItem value="byok" className="text-xs">
                    Own API Key
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <CardDescription className="text-sm text-muted-foreground">
                Work solo or with up to 4 teammates. If you ever hit the daily
                free limit on a deadline night, plug in your own key to keep
                going.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-2xl border border-border bg-muted/40 p-3.5">
                  <span className="block text-[11px] text-muted-foreground">
                    Daily Questions
                  </span>
                  <strong className="mt-1 block text-sm text-foreground">
                    {quotaMode === 'managed'
                      ? '50 included / day'
                      : 'Unlimited with own key'}
                  </strong>
                </div>
                <div className="rounded-2xl border border-border bg-muted/40 p-3.5">
                  <span className="block text-[11px] text-muted-foreground">
                    Team Size
                  </span>
                  <strong className="mt-1 block text-sm text-foreground">
                    Up to 4 collaborators
                  </strong>
                </div>
                <div className="rounded-2xl border border-border bg-muted/40 p-3.5">
                  <span className="block text-[11px] text-muted-foreground">
                    Export Formats
                  </span>
                  <strong className="mt-1 block text-sm text-foreground">
                    Clean Markdown reports
                  </strong>
                </div>
                <div className="rounded-2xl border border-border bg-muted/40 p-3.5">
                  <span className="block text-[11px] text-muted-foreground">
                    File Size Support
                  </span>
                  <strong className="mt-1 block text-sm text-foreground">
                    Up to 50 pages / file
                  </strong>
                </div>
              </div>
            </CardContent>

            <CardFooter className="border-t border-border bg-muted/25 py-3 text-xs text-muted-foreground">
              Your own key stays in your browser and is never stored on our
              servers.
            </CardFooter>
          </Card>
        </div>
      </div>
    </section>
  )
}
