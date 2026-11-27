import React, { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ShootingStars } from '@/components/ui/shooting-stars'
import { StarsBackground } from '@/components/ui/stars-background'

interface AuroraBackgroundProps extends React.HTMLProps<HTMLDivElement> {
  children: ReactNode
  showRadialGradient?: boolean
  animateOnScroll?: boolean
  themeMode?: 'dark' | 'light'
}

export const AuroraBackground = ({
  className,
  children,
  showRadialGradient = true,
  animateOnScroll = true,
  themeMode = 'dark',
  ...props
}: AuroraBackgroundProps): React.ReactElement => {
  const isLight = themeMode === 'light'
  return (
    <div
      data-landing-theme={themeMode}
      className={cn(
        'relative isolate min-h-svh bg-background text-foreground',
        className,
      )}
      {...props}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
        style={
          {
            '--violet': isLight ? '#c4b5fd' : '#8b3dff',
            '--indigo': isLight ? '#a5b4fc' : '#4b25d1',
            '--ice': isLight ? '#bae6fd' : '#8ec5ff',
            '--cyan': isLight ? '#7dd3fc' : '#2fd6ff',
            '--lilac': isLight ? '#e9d5ff' : '#d3b8ff',
            '--night': isLight ? '#f8f9fc' : '#040117',
            '--transparent': 'transparent',
          } as React.CSSProperties
        }
      >
        {/* Central vibrant orbital glow anchor */}
        <div
          className={cn(
            'pointer-events-none absolute left-1/2 top-1/2 h-[680px] w-[1040px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl',
            isLight
              ? 'bg-[radial-gradient(ellipse_at_center,rgba(139,61,255,0.16)_0%,rgba(99,102,241,0.12)_42%,rgba(56,189,248,0.1)_68%,transparent_84%)]'
              : 'bg-[radial-gradient(ellipse_at_center,rgba(139,61,255,0.38)_0%,rgba(75,37,209,0.24)_42%,rgba(47,214,255,0.12)_68%,transparent_84%)]',
          )}
        />

        {/* Aceternity Aurora Ribbons — centered and optionally scroll-responsive */}
        <div
          className={cn(
            `pointer-events-none absolute -inset-[10px] blur-[12px] will-change-transform [background-image:var(--dark-gradient),var(--aurora)] [background-size:300%,_200%] [background-position:50%_50%,50%_50%] [--aurora:repeating-linear-gradient(108deg,var(--indigo)_10%,var(--violet)_16%,var(--cyan)_22%,var(--lilac)_27%,var(--ice)_33%)] [--dark-gradient:repeating-linear-gradient(108deg,var(--night)_0%,var(--night)_6%,var(--transparent)_10%,var(--transparent)_13%,var(--night)_17%)] after:absolute after:inset-0 after:[background-image:var(--dark-gradient),var(--aurora)] after:[background-size:200%,_100%] after:[background-attachment:fixed] after:content-[""]`,
            isLight
              ? 'opacity-65 after:mix-blend-multiply'
              : 'opacity-85 after:mix-blend-screen',
            showRadialGradient && 'aurora-field',
            animateOnScroll && 'aurora-field-scroll',
          )}
        />

        {/* Aceternity StarsBackground + High-Frequency Multi-Layer ShootingStars */}
        {!isLight && (
          <>
            <StarsBackground starDensity={0.00022} />
            <ShootingStars
              starColor="#ffffff"
              trailColor="#2fd6ff"
              minSpeed={16}
              maxSpeed={36}
              minDelay={250}
              maxDelay={850}
              starWidth={16}
              starHeight={1.8}
            />
            <ShootingStars
              starColor="#d3b8ff"
              trailColor="#8b3dff"
              minSpeed={14}
              maxSpeed={32}
              minDelay={400}
              maxDelay={1100}
              starWidth={14}
              starHeight={1.6}
            />
            <ShootingStars
              starColor="#2fd6ff"
              trailColor="#d3b8ff"
              minSpeed={18}
              maxSpeed={38}
              minDelay={550}
              maxDelay={1300}
              starWidth={15}
              starHeight={1.5}
            />
          </>
        )}
      </div>
      {children}
    </div>
  )
}
