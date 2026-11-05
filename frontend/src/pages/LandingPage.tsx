import React from 'react'
import { Navbar } from '../components/landing/Navbar'
import { HeroSection } from '../components/landing/HeroSection'
import { WorkspaceDemoSection } from '../components/landing/WorkspaceDemoSection'
import { WorkflowSection } from '../components/landing/WorkflowSection'
import { FeaturesSection } from '../components/landing/FeaturesSection'
import { KnowledgeGraphSection } from '../components/landing/KnowledgeGraphSection'
import { DeepAgentSection } from '../components/landing/DeepAgentSection'
import { FooterSection } from '../components/landing/FooterSection'
import {
  SectionConduit,
  ScrollRevealObserver,
} from '../components/patterns/GraphPatterns'

export function LandingPage(): React.ReactElement {
  return (
    <div className="landing-root">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Navbar />

      <main id="main-content">
        <HeroSection />

        <SectionConduit variant="left-to-center" />
        <WorkflowSection />

        <SectionConduit variant="center-to-right" />
        <KnowledgeGraphSection />

        <SectionConduit variant="converge" />
        <DeepAgentSection />

        <SectionConduit variant="left-to-center" />
        <WorkspaceDemoSection />

        <SectionConduit variant="left-to-center" />
        <FeaturesSection />

        <FooterSection />
      </main>
      <ScrollRevealObserver />
    </div>
  )
}
