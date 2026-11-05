import React, { useEffect, useRef } from 'react'

interface AntigravityPixel {
  refX: number
  refY: number
  posX: number
  posY: number
  scale: number
  velocity: number
  seedA: number
  seedB: number
  seedC: number
}

function pseudoSimplex2D(x: number, y: number, t: number): number {
  const s1 = Math.sin(x * 1.7 + y * 1.3 + t * 0.85)
  const s2 = Math.cos(x * 2.9 - y * 2.1 - t * 0.62)
  const s3 = Math.sin((x + y) * 1.45 + t * 1.15)
  return (s1 + s2 + s3) / 3
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1e-6)))
  return t * t * (3 - 2 * t)
}

export function HeroNovaBackground(): React.ReactElement {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const stageEl = stageRef.current
    const canvas = canvasRef.current
    if (!stageEl || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    // Generate Poisson-like stratified grid of moving micro-capsules (antigravity.google port)
    const cols = 28
    const rows = 16
    const pixels: AntigravityPixel[] = []
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const jitterX = ((r * 17 + c * 31) % 100) / 100 - 0.5
        const jitterY = ((r * 29 + c * 13) % 100) / 100 - 0.5
        const refX = ((c + 0.5 + jitterX * 0.68) / cols) * 2 - 1
        const refY = ((r + 0.5 + jitterY * 0.68) / rows) * 2 - 1
        pixels.push({
          refX,
          refY,
          posX: refX,
          posY: refY,
          scale: 0.35,
          velocity: 0,
          seedA: ((r * 41 + c * 19) % 100) / 100,
          seedB: ((r * 23 + c * 53) % 100) / 100,
          seedC: ((r * 67 + c * 11) % 100) / 100,
        })
      }
    }

    const loop = {
      rafId: null as number | null,
      isRunning: false,
    }
    const pointer = {
      active: false,
      targetX: 0,
      targetY: 0,
      ringX: -0.18,
      ringY: 0.06,
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1
      if (nx >= -1.05 && nx <= 1.05 && ny >= -1.05 && ny <= 1.05) {
        pointer.active = true
        pointer.targetX = nx
        pointer.targetY = ny
      } else {
        pointer.active = false
      }
    }

    const onPointerLeave = () => {
      pointer.active = false
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerleave', onPointerLeave, { passive: true })

    // NovaGrid fast-paced diagonal light streaks rendered on the canvas under the pixel wave
    const lightStreaks = [
      {
        baseX: 0.22,
        baseY: 0.62,
        angle: -1.02,
        speed: 0.28,
        length: 1.35,
        width: 150,
        coreWidth: 16,
        colorOuter: 'rgba(103, 52, 145, 0.32)',
        colorMid: 'rgba(175, 99, 255, 0.38)',
        colorCore: 'rgba(245, 247, 255, 0.52)',
        phase: 0.0,
      },
      {
        baseX: 0.68,
        baseY: 0.58,
        angle: -0.98,
        speed: 0.36,
        length: 1.4,
        width: 175,
        coreWidth: 18,
        colorOuter: 'rgba(103, 52, 145, 0.28)',
        colorMid: 'rgba(164, 161, 255, 0.36)',
        colorCore: 'rgba(205, 194, 237, 0.48)',
        phase: 2.1,
      },
      {
        baseX: 0.88,
        baseY: 0.72,
        angle: -1.04,
        speed: 0.44,
        length: 1.25,
        width: 130,
        coreWidth: 12,
        colorOuter: 'rgba(175, 99, 255, 0.24)',
        colorMid: 'rgba(204, 156, 255, 0.32)',
        colorCore: 'rgba(245, 247, 255, 0.44)',
        phase: 4.2,
      },
    ]

    const renderFrame = (nowMs: number) => {
      if (!loop.isRunning) return
      const time = nowMs * 0.001
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(320, Math.floor(rect.width))
      const height = Math.max(320, Math.floor(rect.height))

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr
        canvas.height = height * dpr
      }

      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      // 1. NovaGrid Fast-Paced Prismatic Light Beams (sweeping diagonal aurora streaks)
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      for (let i = 0; i < lightStreaks.length; i += 1) {
        const b = lightStreaks[i]
        const drift = prefersReducedMotion
          ? 0
          : Math.sin(time * b.speed + b.phase) * 0.11
        const pulse = prefersReducedMotion
          ? 1
          : 0.82 + Math.sin(time * (b.speed * 2.4) + b.phase) * 0.18

        const cx = (b.baseX + drift) * width
        const cy = (b.baseY - drift * 0.45) * height
        const diag = Math.hypot(width, height) * b.length

        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(b.angle)

        // Wide atmospheric violet/periwinkle bloom
        const outerGrad = ctx.createLinearGradient(0, -b.width, 0, b.width)
        outerGrad.addColorStop(0, 'rgba(12, 11, 14, 0)')
        outerGrad.addColorStop(0.28, b.colorOuter)
        outerGrad.addColorStop(0.5, b.colorMid)
        outerGrad.addColorStop(0.72, b.colorOuter)
        outerGrad.addColorStop(1, 'rgba(12, 11, 14, 0)')

        ctx.fillStyle = outerGrad
        ctx.globalAlpha = pulse
        ctx.fillRect(-diag * 0.5, -b.width, diag, b.width * 2)

        // Fast-traveling high-velocity light packet along the beam axis
        const packetOffset = prefersReducedMotion
          ? 0
          : (((time * b.speed * 1.9 + b.phase) % 2) - 1) * (diag * 0.38)
        const coreGrad = ctx.createLinearGradient(
          0,
          -b.coreWidth,
          0,
          b.coreWidth,
        )
        coreGrad.addColorStop(0, 'rgba(245, 247, 255, 0)')
        coreGrad.addColorStop(0.5, b.colorCore)
        coreGrad.addColorStop(1, 'rgba(245, 247, 255, 0)')

        ctx.fillStyle = coreGrad
        ctx.fillRect(
          packetOffset - diag * 0.28,
          -b.coreWidth,
          diag * 0.56,
          b.coreWidth * 2,
        )
        ctx.restore()
      }
      ctx.restore()

      // 2. Google Antigravity Moving Pixels (MainParticlesComponent shader simulation)
      const idleX = Math.sin(time * 0.66 + 1.4) * 0.42
      const idleY = Math.cos(time * 0.52 + 0.8) * 0.28
      const goalX = pointer.active ? pointer.targetX : idleX
      const goalY = pointer.active ? pointer.targetY : idleY
      const lerpFactor = pointer.active ? 0.065 : 0.025

      pointer.ringX += (goalX - pointer.ringX) * lerpFactor
      pointer.ringY += (goalY - pointer.ringY) * lerpFactor

      const ringRadius =
        0.26 + Math.sin(time * 1.1) * 0.035 + Math.cos(time * 2.7) * 0.02
      const ringWidth = 0.14
      const ringWidth2 = 0.055
      const ringDisplacement = pointer.active ? 0.24 : 0.15
      const simTime = prefersReducedMotion ? 1.0 : time * 0.55

      for (let i = 0; i < pixels.length; i += 1) {
        const p = pixels[i]
        const rx = p.refX
        const ry = p.refY

        // Wave & multi-scale noise displacement (matching MainParticlesComponent fragmentShader)
        const n1 = pseudoSimplex2D(rx * 2.2 + 1.8, ry * 2.2 + 3.2, simTime * 0.7)
        const n2 = pseudoSimplex2D(rx * 2.2 + 5.1, ry * 2.2 + 1.2, simTime * 0.7)

        const dxRing = rx - pointer.ringX
        const dyRing = ry - pointer.ringY
        const dist = Math.hypot(dxRing, dyRing)
        const distJitter = Math.hypot(
          dxRing + n1 * 0.01,
          dyRing + n2 * 0.01,
        )

        let dispX = n1 * 0.024
        let dispY = n2 * 0.024
        if (!prefersReducedMotion) {
          const clampDist = Math.min(1, dist)
          dispX += Math.sin(rx * 12 + simTime * 3.8) * 0.016 * clampDist
          dispY += Math.cos(ry * 12 + simTime * 2.9) * 0.016 * clampDist
        }

        let t =
          smoothstep(ringRadius - ringWidth * 2, ringRadius, dist) -
          smoothstep(ringRadius, ringRadius + ringWidth, distJitter)
        let t2 =
          smoothstep(ringRadius - ringWidth2 * 2, ringRadius, dist) -
          smoothstep(ringRadius, ringRadius + ringWidth2, distJitter)
        const t3 = smoothstep(ringRadius + ringWidth2, ringRadius, dist)

        t = t * t
        t2 = t2 * t2 * t2
        t += t2 * 2.6 + t3 * 0.35

        const nS = pseudoSimplex2D(rx * 1.4 + 1.8, ry * 1.4 + 7.2, simTime * 0.5)
        t += Math.pow((nS + 1.45) * 0.5, 2) * 0.48

        const pushStrength = Math.pow(Math.max(0, t2), 0.75) * ringDisplacement
        const targetPosX =
          rx + dispX + (rx + dispX - pointer.ringX) * pushStrength
        const targetPosY =
          ry + dispY + (ry + dispY - pointer.ringY) * pushStrength

        p.posX += (targetPosX - p.posX) * 0.18
        p.posY += (targetPosY - p.posY) * 0.18
        p.scale += (t - p.scale) * 0.2
        p.velocity = p.velocity * 0.5 + p.scale * 0.25

        const screenX = (p.posX * 0.5 + 0.5) * width
        const screenY = (p.posY * 0.5 + 0.5) * height

        // Capsule orientation toward ring center + organic curl angle
        const noiseAngle = pseudoSimplex2D(
          p.posX * 4.5 + 1.8,
          p.posY * 4.5 + 7.2,
          simTime * 1.2,
        )
        const angle =
          Math.atan2(p.posY - pointer.ringY, p.posX - pointer.ringX) +
          noiseAngle * 0.55

        const s = Math.max(0.18, Math.min(1.65, p.scale))
        const alpha = smoothstep(0.12, 0.28, s) * (0.32 + Math.min(0.58, s * 0.42))
        if (alpha < 0.03) continue

        const pillLen = (3.4 + s * 5.2) * (0.85 + p.seedA * 0.35)
        const pillThick = Math.max(1.5, (1.4 + s * 1.55) * (0.9 + p.seedB * 0.2))

        // Color progression across NovaGrid palette (#af63ff -> #cdc2ed -> #14f194)
        const colorMix = (p.seedC + (n1 + 1) * 0.35) % 1
        let fillColor = '#af63ff'
        if (t2 > 0.18) {
          fillColor = '#f5f7ff'
        } else if (colorMix > 0.82) {
          fillColor = '#14f194'
        } else if (colorMix > 0.46) {
          fillColor = '#cdc2ed'
        } else if (colorMix > 0.22) {
          fillColor = '#a4a1ff'
        }

        ctx.save()
        ctx.translate(screenX, screenY)
        ctx.rotate(angle)
        ctx.globalAlpha = Math.min(0.92, alpha)
        ctx.fillStyle = fillColor
        ctx.beginPath()
        ctx.roundRect(
          -pillLen * 0.5,
          -pillThick * 0.5,
          pillLen,
          pillThick,
          pillThick * 0.5,
        )
        ctx.fill()
        ctx.restore()
      }

      ctx.restore()

      if (!prefersReducedMotion && loop.isRunning) {
        loop.rafId = window.requestAnimationFrame(renderFrame)
      }
    }

    const startAnimation = () => {
      if (loop.isRunning) return
      loop.isRunning = true
      loop.rafId = window.requestAnimationFrame(renderFrame)
    }

    const stopAnimation = () => {
      loop.isRunning = false
      if (loop.rafId !== null) {
        window.cancelAnimationFrame(loop.rafId)
        loop.rafId = null
      }
    }

    // Modern Web Guidance: pause canvas work via contentvisibilityautostatechange + IntersectionObserver fallback
    const onContentVisibilityChange = (event: Event) => {
      const cvEvent = event as Event & { skipped?: boolean }
      if (cvEvent.skipped) {
        stopAnimation()
      } else {
        startAnimation()
      }
    }

    stageEl.addEventListener(
      'contentvisibilityautostatechange',
      onContentVisibilityChange,
    )

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            startAnimation()
          } else {
            stopAnimation()
          }
        })
      },
      { rootMargin: '150px' },
    )
    observer.observe(stageEl)

    startAnimation()

    return () => {
      stopAnimation()
      observer.disconnect()
      stageEl.removeEventListener(
        'contentvisibilityautostatechange',
        onContentVisibilityChange,
      )
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [])

  return (
    <div
      ref={stageRef}
      className="hero-novagrid-bg"
      aria-hidden="true"
    >
      {/* Layer 1: Canvas with NovaGrid fast-paced diagonal light streaks + Antigravity moving pixels */}
      <canvas ref={canvasRef} className="hero-novagrid-canvas" />

      {/* Layer 2: Subtle bottom vignette transition into next section */}
      <div className="hero-novagrid-vignette" />
    </div>
  )
}
