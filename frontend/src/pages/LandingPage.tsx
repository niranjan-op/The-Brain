import React, { useEffect, useState } from 'react'
import { AuroraBackground } from '@/components/ui/aurora-background'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Navbar } from '../components/landing/Navbar'
import { HeroSection } from '../components/landing/HeroSection'
import { WorkflowSection } from '../components/landing/WorkflowSection'
import { RustinIntelligenceSection } from '../components/landing/RustinIntelligenceSection'
import { ProductWalkthroughSection } from '../components/landing/ProductWalkthroughSection'
import { FaqSection } from '../components/landing/FaqSection'
import { FooterSection } from '../components/landing/FooterSection'
import {
  getAppTheme,
  runThemeViewTransition,
  setAppTheme,
  subscribeAppTheme,
} from '../lib/workspaceStore'

export function LandingPage(): React.ReactElement {
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() =>
    getAppTheme(),
  )

  useEffect(() => {
    return subscribeAppTheme((next) => {
      setThemeMode(next)
    })
  }, [])

  const toggleLandingTheme = (e: React.MouseEvent<HTMLButtonElement>): void => {
    void runThemeViewTransition(e, () => {
      const next: 'dark' | 'light' = themeMode === 'dark' ? 'light' : 'dark'
      setThemeMode(next)
      setAppTheme(next)
    })
  }

  return (
    <TooltipProvider delayDuration={150}>
      <AuroraBackground themeMode={themeMode} className="landing-root">
        <Navbar themeMode={themeMode} onToggleTheme={toggleLandingTheme} />

        <main id="main-content" tabIndex={-1} className="outline-none">
          <HeroSection />
          <WorkflowSection />
          <RustinIntelligenceSection />
          <ProductWalkthroughSection />
          <FaqSection />
          <FooterSection />
        </main>
      </AuroraBackground>
    </TooltipProvider>
  )
}
