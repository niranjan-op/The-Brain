import React, { useEffect, useState } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LastUpdatedBadge } from '@/components/shared/LastUpdatedBadge'
import { FAQ_ITEMS, FAQ_LAST_UPDATED } from '@/data/faqData'

export function FaqSection(): React.ReactElement {
  const [openItems, setOpenItems] = useState<string[]>([FAQ_ITEMS[0].id])

  const allExpanded = openItems.length === FAQ_ITEMS.length

  const handleToggleAll = (): void => {
    if (allExpanded) {
      setOpenItems([])
    } else {
      setOpenItems(FAQ_ITEMS.map((item) => item.id))
    }
  }

  useEffect(() => {
    const onOpenFaq = (event: Event): void => {
      const faqId = (event as CustomEvent<string>).detail
      if (!faqId) return
      setOpenItems((prev) => (prev.includes(faqId) ? prev : [...prev, faqId]))
    }

    window.addEventListener('kc:open-faq', onOpenFaq)
    return () => window.removeEventListener('kc:open-faq', onOpenFaq)
  }, [])

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="border-b border-border/40 py-20 sm:py-28"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-2">
              <h2
                id="faq-heading"
                className="text-2xl font-semibold tracking-tight text-foreground sm:text-4xl"
              >
                Frequently asked questions
              </h2>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                How ingestion, source-scoped citations, human-approved decision graphs, and team quotas work.
              </p>
              <LastUpdatedBadge date={FAQ_LAST_UPDATED} label="Docs updated" />
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={allExpanded}
              onClick={handleToggleAll}
              className="shrink-0 self-start sm:self-end"
            >
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </Button>
          </div>

          <Accordion
            type="multiple"
            value={openItems}
            onValueChange={setOpenItems}
            className="rounded-2xl border border-border/70 bg-card/75 px-5 py-2 backdrop-blur-md sm:px-6"
          >
            {FAQ_ITEMS.map((item) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className="border-border/60 py-1"
              >
                <AccordionTrigger className="py-4 text-left text-base font-medium text-foreground hover:no-underline hover:text-primary">
                  <span className="flex items-center gap-3 pr-3">
                    <Badge
                      variant="secondary"
                      className="hidden shrink-0 font-mono text-[10px] uppercase sm:inline-flex"
                    >
                      {item.category}
                    </Badge>
                    <span>{item.question}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-4 text-sm leading-relaxed text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
}
