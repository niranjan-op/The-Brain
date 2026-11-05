import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { BrandGlyph, PatternDotGrid } from '../components/patterns/GraphPatterns'
import { useAuth } from '../lib/auth'
import {
  API_BASE_URL,
  createProjectApi,
  fetchProjectsApi,
  startDeviceSession,
  SUPPORTED_EXTENSIONS,
  uploadDocumentApi,
  validateUploadFile,
  type ProjectRecord,
} from '../lib/api'

interface UploadedDocLog {
  doc_uuid: string
  job_uuid: string | null
  filename: string
  sizeBytes: number
  project_uuid: string
  uploadedAt: string
}

interface ApiLogEntry {
  id: string
  time: string
  method: 'GET' | 'POST'
  endpoint: string
  ok: boolean
  durationMs: number
  summary: string
}

const PRESET_DEV_USERS = [
  { uid: 'dev_user_1', email: 'user1@kc.local', name: 'Dev User 1' },
  { uid: 'dev_user_2', email: 'user2@kc.local', name: 'Dev User 2' },
  { uid: 'dev_user_3', email: 'user3@kc.local', name: 'Dev User 3' },
  { uid: 'dev_user_4', email: 'user4@kc.local', name: 'Dev User 4 (4th Account Cap)' },
] as const

export function ProjectsPage(): React.ReactElement {
  const {
    user,
    backendOnline,
    deviceId,
    error: authError,
    refreshBackendHealth,
    updateDeviceId,
    rotateDeviceId,
    signInWithLocalDev,
    signOutWorkspace,
    clearError,
  } = useAuth()
  const navigate = useNavigate()

  const [deviceInput, setDeviceInput] = useState<string>(deviceId)
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [selectedProjectUuid, setSelectedProjectUuid] = useState<string>('')
  const [newProjectName, setNewProjectName] = useState<string>('')
  const [loadingProjects, setLoadingProjects] = useState<boolean>(false)

  const [enforceClientValidation, setEnforceClientValidation] = useState<boolean>(true)
  const [uploading, setUploading] = useState<boolean>(false)
  const [uploads, setUploads] = useState<UploadedDocLog[]>([])
  const [statusBanner, setStatusBanner] = useState<{
    kind: 'ok' | 'err'
    text: string
  } | null>(null)

  const [apiLogs, setApiLogs] = useState<ApiLogEntry[]>([])

  const appendLog = useCallback(
    (
      method: 'GET' | 'POST',
      endpoint: string,
      ok: boolean,
      durationMs: number,
      summary: string,
    ) => {
      const entry: ApiLogEntry = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        time: new Date().toLocaleTimeString(),
        method,
        endpoint,
        ok,
        durationMs: Math.round(durationMs),
        summary,
      }
      setApiLogs((prev) => [entry, ...prev.slice(0, 29)])
    },
    [],
  )

  const loadProjects = useCallback(async (): Promise<void> => {
    if (!user) return
    setLoadingProjects(true)
    const t0 = performance.now()
    try {
      const rows = await fetchProjectsApi(user.idToken)
      appendLog(
        'GET',
        '/projects',
        true,
        performance.now() - t0,
        `200 OK -> ${rows.length} project(s): ${JSON.stringify(rows)}`,
      )
      setProjects(rows)
      setSelectedProjectUuid((prev) => {
        if (prev && rows.some((r) => r.project_uuid === prev)) return prev
        return rows[0]?.project_uuid || ''
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'GET /projects failed'
      appendLog('GET', '/projects', false, performance.now() - t0, msg)
      setStatusBanner({ kind: 'err', text: `GET /projects: ${msg}` })
    } finally {
      setLoadingProjects(false)
    }
  }, [user, appendLog])

  useEffect(() => {
    void refreshBackendHealth().then((online) => {
      if (online && user) {
        void loadProjects()
      }
    })
  }, [user, refreshBackendHealth, loadProjects])

  const handlePingHealth = async (): Promise<void> => {
    const t0 = performance.now()
    const ok = await refreshBackendHealth()
    appendLog(
      'GET',
      '/healthz',
      ok,
      performance.now() - t0,
      ok ? '{"status":"ok"}' : 'Backend unreachable',
    )
    setStatusBanner({
      kind: ok ? 'ok' : 'err',
      text: ok
        ? `GET /healthz -> {"status": "ok"} (${API_BASE_URL})`
        : `GET /healthz failed -> cannot reach ${API_BASE_URL}`,
    })
  }

  const handleCallSessionStart = async (): Promise<void> => {
    if (!user) {
      setStatusBanner({ kind: 'err', text: 'Select or sign in with an account first.' })
      return
    }
    clearError()
    const appliedDevice = updateDeviceId(deviceInput)
    const t0 = performance.now()
    try {
      const res = await startDeviceSession(user.idToken, appliedDevice)
      appendLog(
        'POST',
        `/session/start [X-Device-Id: ${appliedDevice}]`,
        true,
        performance.now() - t0,
        `200 OK -> ${JSON.stringify(res)} (user: ${user.email})`,
      )
      setStatusBanner({
        kind: 'ok',
        text: `POST /session/start succeeded for ${user.email} on device ${appliedDevice}`,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'POST /session/start failed'
      appendLog(
        'POST',
        `/session/start [X-Device-Id: ${appliedDevice}]`,
        false,
        performance.now() - t0,
        `Error -> ${msg} (user: ${user.email})`,
      )
      setStatusBanner({ kind: 'err', text: `POST /session/start: ${msg}` })
    }
  }

  const handleSwitchPresetUser = async (
    preset: (typeof PRESET_DEV_USERS)[number],
  ): Promise<void> => {
    clearError()
    const t0 = performance.now()
    try {
      await signInWithLocalDev(preset.email, preset.name, preset.uid)
      appendLog(
        'POST',
        `/session/start [user=${preset.email}]`,
        true,
        performance.now() - t0,
        `Switched to ${preset.email} & called POST /session/start`,
      )
      setStatusBanner({
        kind: 'ok',
        text: `Switched active account to ${preset.email} (${preset.uid}) and registered device session.`,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Session start failed'
      appendLog(
        'POST',
        `/session/start [user=${preset.email}]`,
        false,
        performance.now() - t0,
        `Error -> ${msg}`,
      )
      setStatusBanner({ kind: 'err', text: `POST /session/start (${preset.email}): ${msg}` })
    }
  }

  const handleCreateProject = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const trimmed = newProjectName.trim()
    if (!trimmed || !user) return

    const t0 = performance.now()
    try {
      const created = await createProjectApi(user.idToken, trimmed)
      appendLog(
        'POST',
        `/projects?name=${encodeURIComponent(trimmed)}`,
        true,
        performance.now() - t0,
        `200 OK -> ${JSON.stringify(created)}`,
      )
      setProjects((prev) => [...prev, created])
      setSelectedProjectUuid(created.project_uuid)
      setNewProjectName('')
      setStatusBanner({
        kind: 'ok',
        text: `Created project "${created.name}" -> project_uuid: ${created.project_uuid}`,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'POST /projects failed'
      appendLog(
        'POST',
        `/projects?name=${encodeURIComponent(trimmed)}`,
        false,
        performance.now() - t0,
        msg,
      )
      setStatusBanner({ kind: 'err', text: `POST /projects: ${msg}` })
    }
  }

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return

    if (!selectedProjectUuid.trim()) {
      setStatusBanner({
        kind: 'err',
        text: 'Create or select a project_uuid before uploading a file.',
      })
      return
    }

    if (enforceClientValidation) {
      const validationError = validateUploadFile(file)
      if (validationError) {
        setStatusBanner({ kind: 'err', text: `Client validation: ${validationError}` })
        return
      }
    }

    setUploading(true)
    const t0 = performance.now()
    try {
      const res = await uploadDocumentApi(
        user.idToken,
        selectedProjectUuid.trim(),
        file,
        enforceClientValidation,
      )
      appendLog(
        'POST',
        `/upload?project_uuid=${selectedProjectUuid.trim()}`,
        true,
        performance.now() - t0,
        `200 OK (${file.name}) -> ${JSON.stringify(res)}`,
      )
      const entry: UploadedDocLog = {
        doc_uuid: res.doc_uuid,
        job_uuid: res.job_uuid,
        filename: file.name,
        sizeBytes: file.size,
        project_uuid: selectedProjectUuid.trim(),
        uploadedAt: new Date().toLocaleTimeString(),
      }
      setUploads((prev) => [entry, ...prev])
      setStatusBanner({
        kind: 'ok',
        text: `POST /upload succeeded: doc_uuid=${res.doc_uuid}, job_uuid=${res.job_uuid ?? 'null'}`,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'POST /upload failed'
      appendLog(
        'POST',
        `/upload?project_uuid=${selectedProjectUuid.trim()}`,
        false,
        performance.now() - t0,
        `Error (${file.name}) -> ${msg}`,
      )
      setStatusBanner({ kind: 'err', text: `POST /upload: ${msg}` })
    } finally {
      setUploading(false)
    }
  }

  const activeProject = projects.find((p) => p.project_uuid === selectedProjectUuid)

  return (
    <div className="workspace-page">
      <PatternDotGrid id="projects-bg-grid" />

      <header className="workspace-topbar">
        <div className="container workspace-topbar-inner">
          <Link to="/" className="brand-link">
            <BrandGlyph size={26} />
            <span className="brand-name">Knowledge Cartographer · Test Console</span>
          </Link>

          <div className="workspace-topbar-right">
            <button
              type="button"
              className="btn-secondary btn-sm mono"
              onClick={handlePingHealth}
            >
              <i
                className={`status-dot ${backendOnline ? 'status-dot-ready' : 'status-dot-warn'}`}
                aria-hidden="true"
              />{' '}
              GET /healthz ({backendOnline ? 'online' : 'offline'})
            </button>
            <span className="topbar-user-pill mono">
              {user ? `${user.email} [${user.mode}]` : 'Not signed in'}
            </span>
            <Link to="/login" className="btn-secondary btn-sm">
              Auth Options
            </Link>
            {user && (
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={async () => {
                  await signOutWorkspace()
                  navigate('/login')
                }}
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="container workspace-main">
        {/* Status / Error Banner */}
        {(statusBanner || authError) && (
          <div
            className={
              statusBanner?.kind === 'ok'
                ? 'upload-success-banner mono'
                : 'auth-error-banner mono'
            }
            role="status"
          >
            <p>{statusBanner ? statusBanner.text : authError}</p>
            <button
              type="button"
              className="text-action-btn mono"
              onClick={() => {
                setStatusBanner(null)
                clearError()
              }}
            >
              Clear
            </button>
          </div>
        )}

        {/* Section 1: Session & Device Cap Tester (POST /session/start) */}
        <section className="test-console-section" aria-label="Session and Device Cap Control">
          <div className="detail-card-header">
            <div>
              <h2 className="panel-section-title">
                1. Auth &amp; Device Session (<code>POST /session/start</code>)
              </h2>
              <p className="mono detail-uuid-line">
                Switch accounts on the same X-Device-Id to test the 3-accounts/device/day cap (4th returns HTTP 403).
              </p>
            </div>
            <span className="role-chip mono">API: {API_BASE_URL}</span>
          </div>

          <div className="session-controls-grid">
            <div className="session-control-box">
              <span className="mono session-label">Quick Account Switcher (Local Dev Auth):</span>
              <div className="preset-users-row">
                {PRESET_DEV_USERS.map((preset) => {
                  const isCurrent = user?.email === preset.email
                  return (
                    <button
                      key={preset.uid}
                      type="button"
                      className={`btn-sm mono ${isCurrent ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => void handleSwitchPresetUser(preset)}
                    >
                      {preset.name}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="session-control-box">
              <label className="auth-field">
                <span className="mono">X-Device-Id Header</span>
                <div className="inline-input-row">
                  <input
                    type="text"
                    className="mono"
                    value={deviceInput}
                    onChange={(e) => setDeviceInput(e.target.value)}
                    placeholder="dev_..."
                  />
                  <button
                    type="button"
                    className="btn-secondary btn-sm mono"
                    onClick={() => {
                      const next = rotateDeviceId()
                      setDeviceInput(next)
                      setStatusBanner({
                        kind: 'ok',
                        text: `Rotated X-Device-Id to ${next}`,
                      })
                    }}
                  >
                    New Device ID
                  </button>
                  <button
                    type="button"
                    className="btn-primary btn-sm mono"
                    onClick={() => void handleCallSessionStart()}
                  >
                    Call POST /session/start
                  </button>
                </div>
              </label>
            </div>
          </div>
        </section>

        {/* Section 2 & 3: Projects + Upload */}
        <div className="projects-layout-grid">
          {/* Left column: GET /projects & POST /projects */}
          <section className="projects-sidebar-card" aria-label="Projects List">
            <div className="sidebar-header-row">
              <h2 className="panel-section-title">
                2. Projects (<code>/projects</code>)
              </h2>
              <button
                type="button"
                className="btn-secondary btn-sm mono"
                onClick={() => void loadProjects()}
                disabled={loadingProjects}
              >
                {loadingProjects ? 'Loading...' : 'GET /projects'}
              </button>
            </div>

            <form className="create-project-form" onSubmit={handleCreateProject}>
              <label className="auth-field">
                <span className="mono">Create Project (POST /projects?name=...)</span>
                <input
                  type="text"
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g., test-project-alpha"
                />
              </label>
              <button type="submit" className="btn-primary btn-sm">
                Create Project
              </button>
            </form>

            <div className="projects-list-container">
              <p className="documents-subheading mono">
                DB PROJECTS ({projects.length})
              </p>
              {projects.length === 0 ? (
                <p className="empty-hint mono">
                  No projects returned for {user?.email || 'current user'}. Create one above or click GET /projects.
                </p>
              ) : (
                <ul className="project-selector-list">
                  {projects.map((proj) => {
                    const isSelected = proj.project_uuid === selectedProjectUuid
                    return (
                      <li key={proj.project_uuid}>
                        <button
                          type="button"
                          className={`project-select-btn ${isSelected ? 'is-active' : ''}`}
                          onClick={() => setSelectedProjectUuid(proj.project_uuid)}
                        >
                          <span className="project-select-name">{proj.name}</span>
                          <span className="project-select-meta mono">
                            role: {proj.role} · {proj.project_uuid}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* Right column: POST /upload */}
          <section className="projects-detail-card" aria-label="Document Upload">
            <div className="detail-card-header">
              <div>
                <h2 className="panel-section-title">
                  3. Document Ingestion (<code>POST /upload</code>)
                </h2>
                <p className="mono detail-uuid-line">
                  Active project: {activeProject ? `${activeProject.name} (${activeProject.project_uuid})` : selectedProjectUuid || 'None selected'}
                </p>
              </div>
              {activeProject && (
                <span className="role-chip mono">role: {activeProject.role}</span>
              )}
            </div>

            <div className="upload-config-stack">
              <label className="auth-field">
                <span className="mono">Target project_uuid query param</span>
                <input
                  type="text"
                  className="mono"
                  value={selectedProjectUuid}
                  onChange={(e) => setSelectedProjectUuid(e.target.value)}
                  placeholder="Select a project on the left or paste project_uuid"
                />
              </label>

              <label className="checkbox-row mono">
                <input
                  type="checkbox"
                  checked={enforceClientValidation}
                  onChange={(e) => setEnforceClientValidation(e.target.checked)}
                />
                <span>
                  Enforce client-side check (&le;5 MB &amp; normalize MIME for{' '}
                  {SUPPORTED_EXTENSIONS.join(', ')}). Uncheck to test server 413/415 errors directly.
                </span>
              </label>
            </div>

            <div className="upload-box">
              <div className="upload-box-copy">
                <h3 className="upload-box-title">
                  Upload File to S3/MinIO &amp; Enqueue Worker Job
                </h3>
                <p className="upload-box-desc mono">
                  POST /upload?project_uuid={selectedProjectUuid || '<project_uuid>'}
                </p>
              </div>

              <label className="btn-primary upload-trigger-label">
                <span>{uploading ? 'Uploading...' : 'Choose File & Upload'}</span>
                <input
                  type="file"
                  className="sr-only"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
              </label>
            </div>

            <div className="documents-table-wrap">
              <h3 className="documents-subheading mono">
                SESSION UPLOADS ({uploads.length})
              </h3>

              {uploads.length === 0 ? (
                <p className="empty-hint mono">
                  No files uploaded in this browser session yet. Select a project and upload a file to see returned doc_uuid and job_uuid.
                </p>
              ) : (
                <div className="documents-list">
                  {uploads.map((doc) => (
                    <div key={`${doc.doc_uuid}_${doc.uploadedAt}`} className="document-row">
                      <div className="doc-row-main">
                        <span className="doc-row-name mono">{doc.filename}</span>
                        <span className="doc-row-stage mono">
                          doc_uuid: {doc.doc_uuid} · job_uuid: {doc.job_uuid ?? 'null'}
                        </span>
                      </div>
                      <div className="doc-row-meta mono">
                        <span>{(doc.sizeBytes / 1024).toFixed(1)} KB</span>
                        <span>{doc.uploadedAt}</span>
                        <span className="doc-status-chip status-uploaded">
                          uploaded
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Section 4: Live Request / Response Log */}
        <section className="test-console-section log-section" aria-label="API Request Log">
          <div className="sidebar-header-row">
            <h2 className="panel-section-title mono">
              4. Live HTTP Request / Response Log ({apiLogs.length})
            </h2>
            {apiLogs.length > 0 && (
              <button
                type="button"
                className="btn-secondary btn-sm mono"
                onClick={() => setApiLogs([])}
              >
                Clear Log
              </button>
            )}
          </div>

          {apiLogs.length === 0 ? (
            <p className="empty-hint mono">
              Click any endpoint action above to inspect HTTP status, timing, and raw response payload.
            </p>
          ) : (
            <div className="api-log-list mono">
              {apiLogs.map((entry) => (
                <div
                  key={entry.id}
                  className={`api-log-row ${entry.ok ? 'is-ok' : 'is-err'}`}
                >
                  <div className="api-log-meta">
                    <span className="api-log-badge">
                      {entry.ok ? 'OK' : 'ERR'}
                    </span>
                    <span>{entry.time}</span>
                    <strong>
                      {entry.method} {entry.endpoint}
                    </strong>
                    <span>({entry.durationMs} ms)</span>
                  </div>
                  <div className="api-log-body">{entry.summary}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
