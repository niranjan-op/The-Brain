import React, { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { BrandGlyph, ScrollProgressIndicator } from '../patterns/GraphPatterns'
import { useAuth } from '../../lib/auth'

const NAV_LINKS = [
  { href: '#pipeline', label: 'How It Works' },
  { href: '#decision-graph', label: 'Decision Graph' },
  { href: '#deep-agent', label: 'Deep Agent' },
  { href: '#workspace', label: 'Workspace' },
  { href: '#capabilities', label: 'Architecture' },
]

export function Navbar(): React.ReactElement {
  const { user } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setMobileOpen(false)
      }
    }
    const onScroll = (): void => {
      setIsScrolled(window.scrollY > 36)
    }
    onScroll()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    <header className={`site-header ${isScrolled ? 'is-scrolled' : ''}`}>
      <ScrollProgressIndicator />
      <div className="container nav-inner">
        <Link to="/" className="brand-link" aria-label="Knowledge Cartographer Home">
          <BrandGlyph size={28} />
          <span className="brand-text">
            <span className="brand-name">Knowledge Cartographer</span>
            <span className="brand-tag mono">DECISION INTELLIGENCE</span>
          </span>
        </Link>

        <nav className="desktop-nav" aria-label="Primary Navigation">
          <ul className="nav-list">
            {NAV_LINKS.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="nav-item-link">
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href="https://github.com/niranjan-op/The-Brain"
                target="_blank"
                rel="noreferrer"
                className="nav-item-link nav-external"
              >
                GitHub
              </a>
            </li>
          </ul>
        </nav>

        <div className="nav-actions">
          {user ? (
            <Link to="/projects" className="btn-primary btn-sm">
              Open Workspace
            </Link>
          ) : (
            <>
              <Link to="/login" className="nav-signin-link">
                Sign in
              </Link>
              <Link to="/login" className="btn-primary btn-sm">
                Start Mapping
              </Link>
            </>
          )}

          <button
            type="button"
            className="mobile-menu-btn"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-drawer"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMobileOpen((prev) => !prev)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              {mobileOpen ? (
                <path
                  d="M5 5L15 15M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M3 6H17M3 10H17M3 14H13"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          id="mobile-nav-drawer"
          className="mobile-drawer"
          aria-label="Mobile Navigation"
        >
          <ul className="mobile-nav-list">
            {NAV_LINKS.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="mobile-nav-link"
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href="https://github.com/niranjan-op/The-Brain"
                target="_blank"
                rel="noreferrer"
                className="mobile-nav-link"
              >
                GitHub
              </a>
            </li>
          </ul>
          <div className="mobile-drawer-actions">
            <Link
              to={user ? '/projects' : '/login'}
              className="btn-primary"
              onClick={() => setMobileOpen(false)}
            >
              {user ? 'Open Workspace' : 'Start Mapping'}
            </Link>
          </div>
        </nav>
      )}
    </header>
  )
}
