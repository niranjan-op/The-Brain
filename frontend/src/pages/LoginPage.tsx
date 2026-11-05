import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { BrandGlyph, PatternDotGrid } from '../components/patterns/GraphPatterns'
import { useAuth } from '../lib/auth'
import { hasProductionFirebaseConfig } from '../lib/firebase'

export function LoginPage(): React.ReactElement {
  const {
    user,
    backendOnline,
    deviceId,
    error,
    signInWithGoogle,
    signInWithEmulatorAccount,
    signInWithLocalDev,
    clearError,
  } = useAuth()
  const navigate = useNavigate()

  const [devEmail, setDevEmail] = useState('niranjan@knowledge-cartographer.local')
  const [devName, setDevName] = useState('Niranjan Gadgil')
  const [emuEmail, setEmuEmail] = useState('niranjan@knowledge-cartographer.local')
  const [emuName, setEmuName] = useState('Niranjan Gadgil')
  const [submitting, setSubmitting] = useState(false)

  const handleGoogleSignIn = async (): Promise<void> => {
    setSubmitting(true)
    try {
      await signInWithGoogle()
      navigate('/projects')
    } catch {
      // error is set in AuthContext
    } finally {
      setSubmitting(false)
    }
  }

  const handleEmulatorSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!emuEmail.trim()) return
    setSubmitting(true)
    try {
      await signInWithEmulatorAccount(emuEmail, emuName)
      navigate('/projects')
    } catch {
      // error is set in AuthContext
    } finally {
      setSubmitting(false)
    }
  }

  const handleLocalDevSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!devEmail.trim()) return
    setSubmitting(true)
    try {
      await signInWithLocalDev(devEmail, devName)
      navigate('/projects')
    } catch {
      // keep on page if POST /session/start returned 403 device cap error
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <PatternDotGrid id="login-bg-grid" />

      <header className="workspace-topbar">
        <div className="container workspace-topbar-inner">
          <Link to="/" className="brand-link">
            <BrandGlyph size={26} />
            <span className="brand-name">Knowledge Cartographer</span>
          </Link>
          <div className="workspace-topbar-right">
            <Link to="/projects" className="btn-primary btn-sm">
              Open Test Console (/projects)
            </Link>
            <Link to="/" className="btn-secondary btn-sm">
              Landing Page
            </Link>
          </div>
        </div>
      </header>

      <main className="container auth-main">
        <div className="auth-panel">
          <div className="auth-status-strip mono">
            <span>
              <i
                className={`status-dot ${backendOnline ? 'status-dot-ready' : 'status-dot-warn'}`}
                aria-hidden="true"
              />{' '}
              API ({backendOnline ? 'http://127.0.0.1:8000 connected' : 'http://127.0.0.1:8000 unreachable'})
            </span>
            <span>X-Device-Id: {deviceId}</span>
          </div>

          <h1 className="auth-heading">Sign in to Test Workspace</h1>
          <p className="auth-subtitle">
            Authenticate via Local Dev Token, Firebase Auth Emulator, or Google OAuth to call{' '}
            <code>POST /session/start</code>, <code>GET/POST /projects</code>, and{' '}
            <code>POST /upload</code>.
          </p>

          {user && (
            <div className="auth-active-banner">
              <p className="mono">
                Active user: <strong>{user.email}</strong> (mode: {user.mode})
              </p>
              <Link to="/projects" className="btn-primary btn-sm">
                Continue to /projects
              </Link>
            </div>
          )}

          {error && (
            <div className="auth-error-banner" role="alert">
              <p>{error}</p>
              <button
                type="button"
                className="text-action-btn mono"
                onClick={clearError}
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="auth-methods-stack">
            {/* Method 1: Local Dev User (Direct DB / FastAPI testing without Firebase friction) */}
            <form
              className="auth-method-block auth-method-highlighted"
              onSubmit={handleLocalDevSubmit}
            >
              <div className="method-header">
                <h2 className="method-title">
                  Local Dev Account (Direct FastAPI + Postgres Auth)
                </h2>
                <span className="method-badge mono">Recommended for Local Test</span>
              </div>
              <p className="method-desc">
                Issues a local <code>dev:&lt;uid&gt;:&lt;email&gt;:&lt;name&gt;</code> bearer
                token accepted by <code>get_current_user</code> in local mode and calls{' '}
                <code>POST /session/start</code> immediately.
              </p>

              <div className="auth-form-grid">
                <label className="auth-field">
                  <span className="mono">Email address</span>
                  <input
                    type="email"
                    required
                    value={devEmail}
                    onChange={(e) => setDevEmail(e.target.value)}
                    placeholder="engineer@example.com"
                  />
                </label>
                <label className="auth-field">
                  <span className="mono">Display name</span>
                  <input
                    type="text"
                    required
                    value={devName}
                    onChange={(e) => setDevName(e.target.value)}
                    placeholder="Project Owner"
                  />
                </label>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
              >
                {submitting
                  ? 'Starting Session...'
                  : 'Sign In & Call POST /session/start'}
              </button>
            </form>

            {/* Method 2: Firebase Local Auth Emulator */}
            <form className="auth-method-block" onSubmit={handleEmulatorSubmit}>
              <div className="method-header">
                <h2 className="method-title">Firebase Auth Emulator Sign-In</h2>
                <span className="method-badge mono">127.0.0.1:9099</span>
              </div>
              <p className="method-desc">
                Connects to the local Firebase Auth Emulator container from{' '}
                <code>docker-compose.yml</code>, issues a signed JWT, and registers
                this browser in <code>account_devices</code>.
              </p>

              <div className="auth-form-grid">
                <label className="auth-field">
                  <span className="mono">Email address</span>
                  <input
                    type="email"
                    required
                    value={emuEmail}
                    onChange={(e) => setEmuEmail(e.target.value)}
                    placeholder="engineer@example.com"
                  />
                </label>
                <label className="auth-field">
                  <span className="mono">Display name</span>
                  <input
                    type="text"
                    required
                    value={emuName}
                    onChange={(e) => setEmuName(e.target.value)}
                    placeholder="Project Owner"
                  />
                </label>
              </div>

              <button
                type="submit"
                className="btn-secondary"
                disabled={submitting}
              >
                {submitting
                  ? 'Connecting to Auth Emulator...'
                  : 'Sign in via Firebase Emulator'}
              </button>
            </form>

            {/* Method 3: Production Google OAuth */}
            <div className="auth-method-block">
              <div className="method-header">
                <h2 className="method-title">Google Account (Firebase OAuth)</h2>
                <span className="method-badge mono">
                  {hasProductionFirebaseConfig()
                    ? 'Configured'
                    : 'Requires VITE_FIREBASE_API_KEY'}
                </span>
              </div>
              <p className="method-desc">
                Sign in with Google via Firebase Authentication and verify your ID
                token with <code>firebase_admin.auth.verify_id_token</code> on the
                FastAPI backend.
              </p>
              <button
                type="button"
                className="btn-secondary"
                disabled={submitting}
                onClick={handleGoogleSignIn}
              >
                Continue with Google
              </button>
            </div>
          </div>

          <div className="auth-policy-footer mono">
            <span>DEVICE CAP: MAX 3 DISTINCT ACCOUNTS / DEVICE / IST DAY</span>
            <span>ENFORCED VIA pg_advisory_xact_lock</span>
          </div>
        </div>
      </main>
    </div>
  )
}


