import React from 'react'
import { Link } from 'react-router'
import { BrandGlyph, PatternRadialHalftone } from '../patterns/GraphPatterns'
import { useAuth } from '../../lib/auth'

export function FooterSection(): React.ReactElement {
  const { user } = useAuth()

  return (
    <>
      <section className="closing-cta-section">
        <div className="container">
          <div className="closing-cta-frame" data-reveal="scale">
            <PatternRadialHalftone className="closing-halftone" />
            <div className="closing-cta-content">
              <h2 className="closing-headline">
                Map your project&apos;s decisions.
              </h2>
              <p className="closing-subcopy">
                Upload your specs and diagrams, and trace every answer to its
                exact page and approved node.
              </p>
              <div className="closing-cta-buttons">
                <Link
                  to={user ? '/projects' : '/login'}
                  className="btn-primary btn-lg"
                >
                  {user ? 'Open Project Workspace' : 'Start Mapping'}
                </Link>
                <a
                  href="https://github.com/niranjan-op/The-Brain"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary btn-lg"
                >
                  View on GitHub
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container footer-grid">
          <div className="footer-brand-col">
            <Link to="/" className="brand-link">
              <BrandGlyph size={26} />
              <span className="brand-name">Knowledge Cartographer</span>
            </Link>
            <p className="footer-tagline">
              Decision intelligence and cited knowledge graphs powered by
              FastAPI, Postgres 17, Docling, Gemini, and Neo4j.
            </p>
            <p className="footer-copyright mono">
              MIT License · &copy; 2026 Niranjan Gadgil
            </p>
          </div>

          <nav className="footer-nav-col" aria-label="Landing Page Sections">
            <h3 className="footer-col-heading">Explore</h3>
            <ul className="footer-link-list">
              <li>
                <a href="#pipeline">How It Works</a>
              </li>
              <li>
                <a href="#decision-graph">Decision Graph</a>
              </li>
              <li>
                <a href="#workspace">Workspace Preview</a>
              </li>
              <li>
                <a href="#capabilities">Architecture</a>
              </li>
            </ul>
          </nav>

          <nav className="footer-nav-col" aria-label="Application Routes">
            <h3 className="footer-col-heading">Product</h3>
            <ul className="footer-link-list">
              <li>
                <Link to="/login">Sign in</Link>
              </li>
              <li>
                <Link to="/projects">Projects Workspace</Link>
              </li>
              <li>
                <a
                  href="https://github.com/niranjan-op/The-Brain"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub Repository
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/niranjan-op/The-Brain/blob/main/LICENSE"
                  target="_blank"
                  rel="noreferrer"
                >
                  MIT License
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </>
  )
}
