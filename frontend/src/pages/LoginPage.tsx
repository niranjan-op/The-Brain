import React, { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle,
  EnvelopeSimple,
  GoogleLogo,
  LockKey,
  MagnifyingGlass,
  Moon,
  Sparkle,
  Sun,
  User,
  WarningCircle,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PasswordInput } from '@/components/shared/PasswordInput'
import { useSiteSearch } from '@/components/shared/SiteSearchModal'
import {
  focusFirstInvalidField,
  validateEmail,
  validatePassword,
  validateRequired,
} from '@/lib/formValidation'
import { attachUtmToPayload, trackEvent } from '@/lib/utm'
import {
  getAppTheme,
  runThemeViewTransition,
  setAppTheme,
  subscribeAppTheme,
} from '@/lib/workspaceStore'
import { BrandGlyph } from '../components/patterns/GraphPatterns'
import { useAuth } from '../lib/auth'

type AuthTab = 'login' | 'signup'

interface LoginPageProps {
  initialMode?: AuthTab
}

export function LoginPage({ initialMode }: LoginPageProps): React.ReactElement {
  const {
    user,
    error,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    enterDemoWorkspace,
    signOutWorkspace,
    clearError,
  } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { setOpen: setSearchOpen } = useSiteSearch()

  const derivedMode: AuthTab =
    initialMode ||
    (location.pathname === '/signup' || searchParams.get('mode') === 'signup'
      ? 'signup'
      : 'login')

  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => getAppTheme())
  const [tabOverride, setTabOverride] = useState<AuthTab | null>(null)
  const activeTab: AuthTab = tabOverride ?? derivedMode

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginTouched, setLoginTouched] = useState({ email: false, password: false })
  const [loginSubmitted, setLoginSubmitted] = useState(false)

  const [signupName, setSignupName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupTouched, setSignupTouched] = useState({
    name: false,
    email: false,
    password: false,
  })
  const [signupSubmitted, setSignupSubmitted] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const loginFormRef = useRef<HTMLFormElement | null>(null)
  const signupFormRef = useRef<HTMLFormElement | null>(null)

  const loginEmailErrId = useId()
  const loginPasswordErrId = useId()
  const signupNameErrId = useId()
  const signupEmailErrId = useId()
  const signupPasswordErrId = useId()

  useEffect(() => {
    return subscribeAppTheme(setThemeMode)
  }, [])

  const toggleTheme = (e: React.MouseEvent<HTMLButtonElement>): void => {
    void runThemeViewTransition(e, () => {
      const next: 'dark' | 'light' = themeMode === 'dark' ? 'light' : 'dark'
      setThemeMode(next)
      setAppTheme(next)
    })
  }

  const loginEmailError =
    loginTouched.email || loginSubmitted ? validateEmail(loginEmail) : null
  const loginPasswordError =
    loginTouched.password || loginSubmitted
      ? validatePassword(loginPassword)
      : null

  const signupNameError =
    signupTouched.name || signupSubmitted
      ? validateRequired(signupName, 'Full name')
      : null
  const signupEmailError =
    signupTouched.email || signupSubmitted ? validateEmail(signupEmail) : null
  const signupPasswordError =
    signupTouched.password || signupSubmitted
      ? validatePassword(signupPassword, { minLength: 6 })
      : null

  const handleTabChange = (value: string): void => {
    const nextTab: AuthTab = value === 'signup' ? 'signup' : 'login'
    setTabOverride(nextTab)
    setSuccessMessage(null)
    clearError()
    const targetPath = nextTab === 'signup' ? '/signup' : '/login'
    if (location.pathname !== targetPath) {
      navigate(targetPath, { replace: true })
    }
  }

  const finishAuthSuccess = (method: string, label: string): void => {
    const payload = attachUtmToPayload({ method })
    trackEvent('auth_success', payload)
    setSuccessMessage(`${label} — opening your workspaces...`)
    window.setTimeout(() => {
      navigate('/projects')
    }, 450)
  }

  const handleGoogleSignIn = async (): Promise<void> => {
    setSubmitting(true)
    setSuccessMessage(null)
    try {
      await signInWithGoogle()
      finishAuthSuccess('google', 'Signed in with Google')
    } catch {
      // error is set in AuthContext
    } finally {
      setSubmitting(false)
    }
  }

  const handleLoginSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setLoginSubmitted(true)
    setSuccessMessage(null)

    const eErr = validateEmail(loginEmail)
    const pErr = validatePassword(loginPassword)
    if (eErr || pErr) {
      window.requestAnimationFrame(() =>
        focusFirstInvalidField(loginFormRef.current),
      )
      return
    }

    setSubmitting(true)
    try {
      await signInWithEmail(loginEmail, loginPassword)
      finishAuthSuccess('email_login', `Signed in as ${loginEmail.trim()}`)
    } catch {
      // error is set in AuthContext
    } finally {
      setSubmitting(false)
    }
  }

  const handleSignupSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setSignupSubmitted(true)
    setSuccessMessage(null)

    const nErr = validateRequired(signupName, 'Full name')
    const eErr = validateEmail(signupEmail)
    const pErr = validatePassword(signupPassword, { minLength: 6 })
    if (nErr || eErr || pErr) {
      window.requestAnimationFrame(() =>
        focusFirstInvalidField(signupFormRef.current),
      )
      return
    }

    setSubmitting(true)
    try {
      await signUpWithEmail(signupName, signupEmail, signupPassword)
      finishAuthSuccess(
        'email_signup',
        `Account created for ${signupName.trim()}`,
      )
    } catch {
      // error is set in AuthContext
    } finally {
      setSubmitting(false)
    }
  }

  const handleQuickDemo = (): void => {
    enterDemoWorkspace()
    finishAuthSuccess('demo', 'Demo workspace activated')
  }

  return (
    <div
      data-workspace-theme={themeMode}
      className="relative flex min-h-svh flex-col justify-between bg-background text-foreground"
    >
      {/* Sticky Top Navigation */}
      <header className="sticky top-0 z-20 border-b border-border/80 bg-sidebar/90 backdrop-blur-md">
        <div className="container mx-auto flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-lg border-border bg-card/80 px-3.5 text-xs font-medium text-foreground hover:bg-secondary hover:text-foreground"
          >
            <Link to="/">
              <ArrowLeft size={14} weight="bold" />
              <span>Back to home</span>
            </Link>
          </Button>

          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSearchOpen(true)}
              aria-label="Search site (Ctrl+K)"
              className="hidden h-8 gap-1.5 border-border bg-card/70 px-2.5 text-xs text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              <MagnifyingGlass size={14} aria-hidden="true" />
              <span>Search</span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                ⌘K
              </kbd>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={toggleTheme}
              aria-label={
                themeMode === 'dark'
                  ? 'Switch to light theme'
                  : 'Switch to dark theme'
              }
              title={
                themeMode === 'dark'
                  ? 'Switch to light theme'
                  : 'Switch to dark theme'
              }
              className="rounded-lg text-muted-foreground hover:bg-card hover:text-foreground"
            >
              {themeMode === 'dark' ? (
                <Sun size={16} aria-hidden="true" />
              ) : (
                <Moon size={16} aria-hidden="true" />
              )}
            </Button>

            <Link
              to="/"
              className="inline-flex items-center gap-2.5 text-foreground no-underline transition-opacity hover:opacity-90"
              aria-label="Knowledge Cartographer Home"
            >
              <BrandGlyph size={24} />
              <span className="hidden text-sm font-semibold tracking-tight text-foreground sm:inline">
                Knowledge Cartographer
              </span>
            </Link>
          </div>
        </div>
      </header>

      {/* Centered Single-Frame Auth Card */}
      <main
        id="main-content"
        tabIndex={-1}
        className="relative z-10 flex flex-1 items-center justify-center px-4 py-10 outline-none"
      >
        <div className="w-full max-w-[430px]">
          <div className="rounded-2xl border border-border bg-card p-7 shadow-elevated sm:p-8">
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.7rem]">
                {activeTab === 'login' ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {activeTab === 'login'
                  ? 'Sign in to access your living project brain.'
                  : 'Turn your files into a living project brain.'}
              </p>
            </div>

            {user && !successMessage && (
              <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-xs text-foreground">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    Signed in as {user.displayName}
                  </p>
                  <p className="truncate text-muted-foreground">{user.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    asChild
                    size="xs"
                    className="bg-primary px-3 font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <Link to="/projects">Open</Link>
                  </Button>
                  <button
                    type="button"
                    onClick={() => void signOutWorkspace()}
                    className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}

            {/* Form Success State */}
            {successMessage && (
              <div
                role="status"
                className="mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-foreground"
              >
                <CheckCircle
                  size={18}
                  weight="duotone"
                  className="shrink-0 text-emerald-400"
                  aria-hidden="true"
                />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Auth Error Alert */}
            {error && (
              <div
                role="alert"
                className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-xs text-destructive"
              >
                <div className="flex items-start gap-2.5">
                  <WarningCircle
                    size={17}
                    weight="duotone"
                    className="mt-0.5 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                  <span className="leading-relaxed">{error}</span>
                </div>
                <button
                  type="button"
                  onClick={clearError}
                  className="shrink-0 font-medium text-destructive underline-offset-2 hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="mb-5 grid h-10 w-full grid-cols-2 rounded-lg border border-border/80 bg-muted/60 p-1">
                <TabsTrigger
                  value="login"
                  className="rounded-md text-sm font-medium text-muted-foreground transition-all data-active:border data-active:border-border/80 data-active:bg-secondary data-active:text-foreground data-active:shadow-xs"
                >
                  Log in
                </TabsTrigger>
                <TabsTrigger
                  value="signup"
                  className="rounded-md text-sm font-medium text-muted-foreground transition-all data-active:border data-active:border-border/80 data-active:bg-secondary data-active:text-foreground data-active:shadow-xs"
                >
                  Sign up
                </TabsTrigger>
              </TabsList>

              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => void handleGoogleSignIn()}
                className="h-10 w-full gap-2.5 rounded-lg border-border bg-secondary/70 text-sm font-medium text-foreground shadow-xs hover:bg-secondary hover:text-foreground"
              >
                {submitting ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <GoogleLogo size={18} weight="bold" aria-hidden="true" />
                )}
                <span>Continue with Google</span>
              </Button>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="shrink-0 text-xs text-muted-foreground">
                  or continue with email
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Log in Form */}
              <TabsContent value="login">
                <form
                  ref={loginFormRef}
                  noValidate
                  onSubmit={handleLoginSubmit}
                  className="flex flex-col gap-4"
                >
                  <FieldGroup className="gap-4">
                    <Field data-invalid={Boolean(loginEmailError) || undefined}>
                      <FieldLabel
                        htmlFor="login-email"
                        className="text-sm font-medium text-foreground"
                      >
                        Email address
                      </FieldLabel>
                      <InputGroup className="h-10 bg-muted/40">
                        <InputGroupAddon align="inline-start" className="pl-3">
                          <EnvelopeSimple
                            size={17}
                            weight="duotone"
                            className="text-muted-foreground"
                            aria-hidden="true"
                          />
                        </InputGroupAddon>
                        <InputGroupInput
                          id="login-email"
                          type="email"
                          required
                          autoComplete="email"
                          placeholder="you@example.com"
                          value={loginEmail}
                          aria-invalid={loginEmailError ? 'true' : 'false'}
                          aria-describedby={
                            loginEmailError ? loginEmailErrId : undefined
                          }
                          onBlur={() =>
                            setLoginTouched((prev) => ({ ...prev, email: true }))
                          }
                          onChange={(e) => {
                            setLoginEmail(e.target.value)
                            clearError()
                          }}
                          className="h-10"
                        />
                      </InputGroup>
                      {loginEmailError && (
                        <FieldError id={loginEmailErrId}>
                          {loginEmailError}
                        </FieldError>
                      )}
                    </Field>

                    <Field data-invalid={Boolean(loginPasswordError) || undefined}>
                      <FieldLabel
                        htmlFor="login-password"
                        className="text-sm font-medium text-foreground"
                      >
                        Password
                      </FieldLabel>
                      <PasswordInput
                        id="login-password"
                        required
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        value={loginPassword}
                        aria-invalid={loginPasswordError ? 'true' : 'false'}
                        aria-describedby={
                          loginPasswordError ? loginPasswordErrId : undefined
                        }
                        onBlur={() =>
                          setLoginTouched((prev) => ({ ...prev, password: true }))
                        }
                        onChange={(e) => {
                          setLoginPassword(e.target.value)
                          clearError()
                        }}
                        startIcon={
                          <LockKey
                            size={17}
                            weight="duotone"
                            className="text-muted-foreground"
                            aria-hidden="true"
                          />
                        }
                      />
                      {loginPasswordError && (
                        <FieldError id={loginPasswordErrId}>
                          {loginPasswordError}
                        </FieldError>
                      )}
                    </Field>
                  </FieldGroup>

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="mt-1 h-10 w-full rounded-lg bg-primary font-semibold text-primary-foreground shadow-xs hover:bg-primary/90"
                  >
                    {submitting ? (
                      <>
                        <Spinner data-icon="inline-start" />
                        <span>Signing in...</span>
                      </>
                    ) : (
                      <>
                        <span>Sign in to Workspace</span>
                        <ArrowUpRight size={15} weight="bold" aria-hidden="true" />
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>

              {/* Sign up Form */}
              <TabsContent value="signup">
                <form
                  ref={signupFormRef}
                  noValidate
                  onSubmit={handleSignupSubmit}
                  className="flex flex-col gap-4"
                >
                  <FieldGroup className="gap-4">
                    <Field data-invalid={Boolean(signupNameError) || undefined}>
                      <FieldLabel
                        htmlFor="signup-name"
                        className="text-sm font-medium text-foreground"
                      >
                        Full name
                      </FieldLabel>
                      <InputGroup className="h-10 bg-muted/40">
                        <InputGroupAddon align="inline-start" className="pl-3">
                          <User
                            size={17}
                            weight="duotone"
                            className="text-muted-foreground"
                            aria-hidden="true"
                          />
                        </InputGroupAddon>
                        <InputGroupInput
                          id="signup-name"
                          type="text"
                          required
                          autoComplete="name"
                          placeholder="Alex Rivera"
                          value={signupName}
                          aria-invalid={signupNameError ? 'true' : 'false'}
                          aria-describedby={
                            signupNameError ? signupNameErrId : undefined
                          }
                          onBlur={() =>
                            setSignupTouched((prev) => ({ ...prev, name: true }))
                          }
                          onChange={(e) => {
                            setSignupName(e.target.value)
                            clearError()
                          }}
                          className="h-10"
                        />
                      </InputGroup>
                      {signupNameError && (
                        <FieldError id={signupNameErrId}>
                          {signupNameError}
                        </FieldError>
                      )}
                    </Field>

                    <Field data-invalid={Boolean(signupEmailError) || undefined}>
                      <FieldLabel
                        htmlFor="signup-email"
                        className="text-sm font-medium text-foreground"
                      >
                        Email address
                      </FieldLabel>
                      <InputGroup className="h-10 bg-muted/40">
                        <InputGroupAddon align="inline-start" className="pl-3">
                          <EnvelopeSimple
                            size={17}
                            weight="duotone"
                            className="text-muted-foreground"
                            aria-hidden="true"
                          />
                        </InputGroupAddon>
                        <InputGroupInput
                          id="signup-email"
                          type="email"
                          required
                          autoComplete="email"
                          placeholder="you@example.com"
                          value={signupEmail}
                          aria-invalid={signupEmailError ? 'true' : 'false'}
                          aria-describedby={
                            signupEmailError ? signupEmailErrId : undefined
                          }
                          onBlur={() =>
                            setSignupTouched((prev) => ({ ...prev, email: true }))
                          }
                          onChange={(e) => {
                            setSignupEmail(e.target.value)
                            clearError()
                          }}
                          className="h-10"
                        />
                      </InputGroup>
                      {signupEmailError && (
                        <FieldError id={signupEmailErrId}>
                          {signupEmailError}
                        </FieldError>
                      )}
                    </Field>

                    <Field
                      data-invalid={Boolean(signupPasswordError) || undefined}
                    >
                      <FieldLabel
                        htmlFor="signup-password"
                        className="text-sm font-medium text-foreground"
                      >
                        Password
                      </FieldLabel>
                      <PasswordInput
                        id="signup-password"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="At least 6 characters"
                        value={signupPassword}
                        aria-invalid={signupPasswordError ? 'true' : 'false'}
                        aria-describedby={
                          signupPasswordError ? signupPasswordErrId : undefined
                        }
                        onBlur={() =>
                          setSignupTouched((prev) => ({
                            ...prev,
                            password: true,
                          }))
                        }
                        onChange={(e) => {
                          setSignupPassword(e.target.value)
                          clearError()
                        }}
                        startIcon={
                          <LockKey
                            size={17}
                            weight="duotone"
                            className="text-muted-foreground"
                            aria-hidden="true"
                          />
                        }
                      />
                      {signupPasswordError && (
                        <FieldError id={signupPasswordErrId}>
                          {signupPasswordError}
                        </FieldError>
                      )}
                    </Field>
                  </FieldGroup>

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="mt-1 h-10 w-full rounded-lg bg-primary font-semibold text-primary-foreground shadow-xs hover:bg-primary/90"
                  >
                    {submitting ? (
                      <>
                        <Spinner data-icon="inline-start" />
                        <span>Creating account...</span>
                      </>
                    ) : (
                      <>
                        <span>Create Workspace Account</span>
                        <ArrowUpRight size={15} weight="bold" aria-hidden="true" />
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="mt-6 border-t border-border pt-4 text-center">
              <button
                type="button"
                onClick={handleQuickDemo}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Sparkle
                  size={14}
                  weight="duotone"
                  className="text-primary"
                  aria-hidden="true"
                />
                <span>Just exploring? Open instant demo workspace</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-20 py-4 text-center text-xs text-muted-foreground">
        Knowledge Cartographer &copy; 2026 &middot; Privacy &amp; Data Safeguards
      </footer>
    </div>
  )
}
