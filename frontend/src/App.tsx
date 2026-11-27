import React, { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { CookieBanner } from './components/shared/CookieBanner'
import { FloatingContactWidget } from './components/shared/FloatingContactWidget'
import { PageLoadingSkeleton } from './components/shared/PageLoadingSkeleton'
import { ScrollToTopButton } from './components/shared/ScrollToTopButton'
import {
  SiteSearchModal,
  SiteSearchProvider,
} from './components/shared/SiteSearchModal'
import { SkipToContent } from './components/shared/SkipToContent'
import { AuthProvider } from './lib/auth'
import { captureUtmParams } from './lib/utm'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { ProjectsPage } from './pages/ProjectsPage'

const ProjectWorkspacePage = lazy(() =>
  import('./pages/ProjectWorkspacePage').then((mod) => ({
    default: mod.ProjectWorkspacePage,
  })),
)

const KnowledgeBasePage = lazy(() =>
  import('./pages/KnowledgeBasePage').then((mod) => ({
    default: mod.KnowledgeBasePage,
  })),
)

function UtmAndTitleSync(): null {
  const location = useLocation()

  useEffect(() => {
    captureUtmParams(location.search, location.pathname)

    const p = location.pathname
    if (p === '/') {
      document.title =
        'Knowledge Cartographer — Cited Knowledge Base & Decision Graph'
    } else if (p === '/login') {
      document.title = 'Sign In | Knowledge Cartographer'
    } else if (p === '/signup') {
      document.title = 'Create Account | Knowledge Cartographer'
    } else if (p === '/projects') {
      document.title = 'Project Workspaces | Knowledge Cartographer'
    } else if (p.endsWith('/knowledge-base')) {
      document.title = 'Project Knowledge Base | Knowledge Cartographer'
    } else if (p.startsWith('/projects/')) {
      document.title = 'Workspace | Knowledge Cartographer'
    }
  }, [location.pathname, location.search])

  return null
}

function GlobalFloatingChrome(): React.ReactElement {
  const location = useLocation()
  const isWorkspaceChatRoute = /^\/projects\/[^/]+$/.test(location.pathname)

  return (
    <>
      <CookieBanner />
      {!isWorkspaceChatRoute && (
        <div
          data-print-hide="true"
          className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2.5"
        >
          <ScrollToTopButton />
        </div>
      )}
    </>
  )
}

export function App(): React.ReactElement {
  return (
    <AuthProvider>
      <BrowserRouter>
        <SiteSearchProvider>
          <SkipToContent />
          <UtmAndTitleSync />
          <Suspense fallback={<PageLoadingSkeleton />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage initialMode="login" />} />
              <Route
                path="/signup"
                element={<LoginPage initialMode="signup" />}
              />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route
                path="/projects/:projectId"
                element={<ProjectWorkspacePage />}
              />
              <Route
                path="/projects/:projectId/knowledge-base"
                element={<KnowledgeBasePage />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          <SiteSearchModal />
          <FloatingContactWidget />
          <GlobalFloatingChrome />
        </SiteSearchProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
