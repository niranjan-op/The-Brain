import React from 'react'
import { Link } from 'react-router'
import { HeroNovaBackground } from './HeroNovaBackground'
import { HeroNeuralGraph } from './HeroNeuralGraph'
import { useAuth } from '../../lib/auth'

export function HeroSection(): React.ReactElement {
  const { user } = useAuth()

  return (
    <section className="hero-section">
      <HeroNovaBackground />

      <div className="container hero-grid">
        <div className="hero-copy-col is-in-view" data-reveal="up">
          <h1 className="hero-headline">
            A second brain for every decision.
          </h1>

          <p className="hero-subheadline">
            Turn scattered documents, diagrams, and notes into a living map of
            what your team knows, what was decided, and why.
          </p>

          <div className="hero-cta-row">
            <Link
              to={user ? '/projects' : '/login'}
              className="btn-primary btn-lg"
            >
              {user ? 'Open Knowledge Workspace' : 'Start Mapping'}
            </Link>
            <a href="#decision-graph" className="btn-secondary btn-lg">
              Explore Live Graph
            </a>
          </div>

          <div className="hero-minimal-pills" aria-label="Core capabilities">
            <span className="hero-arch-pill">
              <i className="legend-dot legend-cyan" aria-hidden="true" />
              Connects all your files
            </span>
            <span className="hero-arch-pill">
              <i className="legend-dot legend-emerald" aria-hidden="true" />
              Answers with exact proof
            </span>
            <span className="hero-arch-pill">
              <i className="legend-dot legend-violet" aria-hidden="true" />
              Catches contradictions early
            </span>
          </div>
        </div>

        <div className="hero-visual-col is-in-view" data-reveal="scale">
          <HeroNeuralGraph />
        </div>
      </div>
    </section>
  )
}
