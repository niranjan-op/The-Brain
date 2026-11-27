'use client'

import React, { useEffect, useRef, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
out vec2 vPlane;

void main() {
  vPlane = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

const buildFragmentShader = (layers: number): string => `#version 300 es
precision highp float;

in vec2 vPlane;
out vec4 outColor;

uniform vec2 uCanvas;
uniform float uClock;
uniform float uSpin;
uniform float uStagger;
uniform float uRadius;
uniform float uDensity;
uniform float uSoftness;
uniform float uWarp;
uniform float uWarpScale;
uniform float uGain;
uniform float uExposure;
uniform float uContrast;
uniform float uReach;
uniform float uLens;
uniform float uHueDrift;
uniform float uPulse;
uniform float uPulseRate;
uniform float uGrain;
uniform float uGrainSize;
uniform float uGrainRate;
uniform vec3 uTintA;
uniform vec3 uTintB;
uniform vec3 uTintC;
uniform vec3 uBackdrop;
uniform float uBackdropAlpha;
uniform float uIsLight;
uniform float uOpacity;
uniform float uHover;

float scatter(vec3 seed) {
  vec3 wobble = fract(seed * vec3(0.1031, 0.1030, 0.0973));
  wobble += dot(wobble, wobble.yxz + 33.33);
  return fract((wobble.x + wobble.y) * wobble.z);
}

float silver(vec2 cell, float tick) {
  float a = scatter(vec3(cell, tick));
  float b = scatter(vec3(cell.yx + 41.7, tick + 19.3));
  return a + b - 1.0;
}

vec3 swivel(vec3 p, vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return p * c + cross(axis, p) * s + axis * dot(axis, p) * (1.0 - c);
}

vec3 precess(float angle) {
  return normalize(vec3(
    sin(angle * 0.41) * 0.9,
    0.85 + 0.3 * cos(angle * 0.29),
    cos(angle * 0.57) * 0.9
  ));
}

vec3 softClip(vec3 x) {
  vec3 fall = exp(-2.0 * max(x, 0.0));
  return (1.0 - fall) / (1.0 + fall);
}

float ridges(vec3 p) {
  float sum = 0.0;
  float weight = 0.5;
  for (int k = 0; k < 3; k++) {
    vec3 folded = cos(p);
    sum += weight * abs(folded.x + folded.y + folded.z) * 0.3333;
    p = p * 1.87 + vec3(1.7, -2.3, 0.9);
    weight *= 0.55;
  }
  return sum;
}

vec3 palette(float phase) {
  vec3 lobes = 0.52 + 0.78 * sin(phase + vec3(0.0, 2.0944, 4.1888));
  lobes = max(lobes, vec3(0.0));
  return uTintA * lobes.x + uTintB * lobes.y + uTintC * lobes.z;
}

void main() {
  vec2 pixel = vPlane * uCanvas;
  float minSide = max(min(uCanvas.x, uCanvas.y), 1.0);
  vec2 field = (pixel - 0.5 * uCanvas) / minSide;
  float radialDist = length(field) * 2.0;

  // Stationary camera and ray — cursor hover boosts intensity without moving the orb
  vec3 eye = vec3(0.0, 0.0, -uReach);
  vec3 ray = normalize(vec3(field, uLens));

  float travel = 0.1;
  vec3 glow = vec3(0.0);

  for (int i = 0; i < ${layers}; i++) {
    vec3 probe = eye + ray * travel;
    float turn = uClock * uSpin + float(i) * uStagger;
    vec3 spun = swivel(probe, precess(turn), turn);

    float hull = abs(length(spun) - uRadius) * uDensity + uSoftness;
    hull += ridges(spun * uWarpScale) * uWarp;

    float phase = dot(spun, vec3(0.58)) + uClock * uHueDrift;
    glow += palette(phase) / hull;

    travel += hull;
    if (travel > 60.0) break;
  }

  float breath = 1.0 + uPulse * sin(uClock * uPulseRate);
  float hoverBoost = 1.0 + uHover * 0.55;
  vec3 raw = glow * (uGain * breath * hoverBoost) / max(uExposure, 1.0);
  vec3 col = softClip(raw);
  col = pow(clamp(col, 0.0, 1.0), vec3(max(uContrast, 0.05)));

  // Smoothly feather the outer gaseous aura before the canvas edge so no container circle is needed
  float edgeFeather = smoothstep(1.0, 0.68, radialDist);
  col *= edgeFeather;

  float cover = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0) * edgeFeather;

  // In light mode, sculpt the gaseous celestial core so it has rich optical density,
  // vibrant jewel saturation, and does not blow out into a flat washed-out white blob
  if (uIsLight > 0.5) {
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 saturated = mix(vec3(luma), col, 1.4);
    float core = smoothstep(0.9, 0.2, radialDist);
    // Deepen midtones and preserve vivid chromatic richness
    vec3 sculpted = pow(clamp(saturated, 0.0, 1.0), vec3(1.18)) * 1.35;
    col = clamp(sculpted, 0.0, 1.0);
    // Reinforce cover density on light backgrounds so sphere is crisp and three-dimensional
    cover = clamp(cover * 1.3 + core * 0.38, 0.0, 1.0) * edgeFeather;
  }

  if (uGrain > 0.001) {
    vec2 cell = floor(pixel / max(uGrainSize, 1.0));
    float tick = floor(uClock * max(uGrainRate, 1.0));
    float speck = silver(cell, tick) + silver(cell * 0.5 + 7.0, tick) * 0.5;
    float response = cover * (1.0 - cover) * 4.0;
    float lift = 1.0 + speck * uGrain * response * 1.6;
    col = clamp(col * lift, 0.0, 1.0);
    cover = clamp(cover * lift, 0.0, 1.0);
  }

  float rest = uBackdropAlpha * (1.0 - cover);
  vec3 finalRgb = col + uBackdrop * rest;
  float finalAlpha = clamp((cover + rest) * uOpacity, 0.0, 1.0);
  outColor = vec4(finalRgb * finalAlpha, finalAlpha);
}
`

type RGBTuple = [number, number, number]

const clamp = (val: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, val))

const compileShader = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null => {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  gl.deleteShader(shader)
  return null
}

const createProgram = (
  gl: WebGL2RenderingContext,
  layers: number,
): {
  program: WebGLProgram
  uniforms: Record<string, WebGLUniformLocation | null>
} | null => {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    buildFragmentShader(layers),
  )
  const program = gl.createProgram()
  if (!vertex || !fragment || !program) return null

  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.bindAttribLocation(program, 0, 'aPosition')
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }

  const uniforms: Record<string, WebGLUniformLocation | null> = {}
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i)
    if (info) {
      uniforms[info.name] = gl.getUniformLocation(program, info.name)
    }
  }

  return { program, uniforms }
}

export interface AuraBlobProps {
  /** How fast the shells tumble. Default: 0.5 */
  speed?: number
  /** Number of nested shells accumulated along each ray (2..24). Default: 10 */
  layers?: number
  /** Rotation offset applied between consecutive shells, in radians. Default: 2.3 */
  stagger?: number
  /** Radius of the shell the aura wraps around. Default: 4 */
  radius?: number
  /** Thickness response of the shell. Lower spreads the glow wider. Default: 0.9 */
  density?: number
  /** Smallest distance the accumulator will divide by. Default: 0.01 */
  softness?: number
  /** Strength of the ridged distortion breaking up the shells. Default: 0.25 */
  warp?: number
  /** Spatial frequency of the distortion. Default: 1.8 */
  warpScale?: number
  /** Overall brightness before tone mapping. Default: 2.6 */
  gain?: number
  /** Tone mapping headroom. Higher keeps more of the falloff. Default: 130 */
  exposure?: number
  /** Tone response curve. Above 1 deepens the shadows. Default: 1 */
  contrast?: number
  /** Distance of the eye from the shell. Default: 13 */
  cameraDistance?: number
  /** Focal length of the virtual lens. Default: 1 */
  focal?: number
  /** First palette colour. Default: "#8b3dff" */
  color?: string
  /** Second palette colour. Default: "#38bdf8" */
  midColor?: string
  /** Third palette colour. Default: "#2fd6ff" */
  deepColor?: string
  /** How fast the palette cycles through the shells. Default: 1 */
  hueDrift?: number
  /** Depth of the slow brightness breath. 0 disables it. Default: 0.12 */
  pulse?: number
  /** Speed of the brightness breath. Default: 0.5 */
  pulseRate?: number
  /** Film grain strength, 0 to 1. Default: 0.05 */
  grain?: number
  /** Grain cell size in CSS pixels. Default: 1 */
  grainSize?: number
  /** Grain refreshes per second. Default: 24 */
  grainRate?: number
  /** Panel backdrop, or "transparent" to show the page through. Default: "transparent" */
  backgroundColor?: string
  /** Master alpha. Default: 1 */
  opacity?: number
  /** Increase intensity on pointer hover without moving the orb. Default: true */
  cursorInteraction?: boolean
  /** Intensity boost strength on hover, 0 to 1. Default: 0.6 */
  cursorTilt?: number
  /** Freeze the animation. Default: false */
  paused?: boolean
  /** Scale back resolution when the frame budget slips. Default: true */
  adaptiveQuality?: boolean
  /** Frame rate the quality meter aims to hold. Default: 60 */
  targetFps?: number
  /** Upper device pixel ratio bound. Default: 2 */
  dpr?: number
  /** Size preset: 'hero' for empty state, 'avatar' for 32px chat icon, 'mini' for 20px subheader icon */
  variant?: 'hero' | 'avatar' | 'mini'
  /** Active thinking / RAG query animation state */
  thinking?: boolean
  /** Optional className applied to the root */
  className?: string
  /** Inline styles */
  style?: CSSProperties
  /** Content layered above the aura */
  children?: React.ReactNode
}

export const AuraBlob: React.FC<AuraBlobProps> = ({
  speed = 0.5,
  layers = 10,
  stagger = 2.3,
  radius = 4,
  density = 0.9,
  softness = 0.01,
  warp = 0.25,
  warpScale = 1.8,
  gain = 2.6,
  exposure = 130,
  contrast = 1,
  cameraDistance = 13,
  focal = 1,
  color = '#8b3dff',
  midColor = '#38bdf8',
  deepColor = '#2fd6ff',
  hueDrift = 1,
  pulse = 0.12,
  pulseRate = 0.5,
  grain,
  grainSize = 1,
  grainRate = 24,
  backgroundColor = 'transparent',
  opacity = 1,
  cursorInteraction = true,
  cursorTilt = 0.6,
  paused = false,
  adaptiveQuality,
  targetFps = 60,
  dpr,
  variant = 'hero',
  thinking = false,
  className,
  style,
  children,
}) => {
  const isCompact = variant === 'avatar' || variant === 'mini'

  // Use the exact same celestial gaseous sphere parameters across hero, avatar, and mini
  // so converting from hero -> chat message keeps the identical gaseous sphere appearance.
  const resolvedLayers = clamp(Math.round(layers), 2, 24)
  const resolvedSoftness = Math.max(softness, 0.002)
  const resolvedGrain = grain ?? (isCompact ? 0 : 0.03)
  const resolvedAdaptiveQuality = adaptiveQuality ?? !isCompact
  const resolvedDpr = dpr ?? (isCompact ? 3 : 2)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wakeRef = useRef<(() => void) | null>(null)

  const propsRef = useRef({
    speed,
    stagger,
    radius,
    density,
    softness: resolvedSoftness,
    warp,
    warpScale,
    gain,
    exposure,
    contrast,
    cameraDistance,
    focal,
    color,
    midColor,
    deepColor,
    hueDrift,
    pulse,
    pulseRate,
    grain: resolvedGrain,
    grainSize,
    grainRate,
    backgroundColor,
    opacity: clamp(opacity, 0, 1),
    cursorInteraction,
    cursorTilt,
    paused,
    adaptiveQuality: resolvedAdaptiveQuality,
    targetFps,
    dpr: resolvedDpr,
    thinking,
    isCompact,
  })

  useEffect(() => {
    propsRef.current = {
      speed,
      stagger,
      radius,
      density,
      softness: resolvedSoftness,
      warp,
      warpScale,
      gain,
      exposure,
      contrast,
      cameraDistance,
      focal,
      color,
      midColor,
      deepColor,
      hueDrift,
      pulse,
      pulseRate,
      grain: resolvedGrain,
      grainSize,
      grainRate,
      backgroundColor,
      opacity: clamp(opacity, 0, 1),
      cursorInteraction,
      cursorTilt,
      paused,
      adaptiveQuality: resolvedAdaptiveQuality,
      targetFps,
      dpr: resolvedDpr,
      thinking,
      isCompact,
    }
  }, [
    speed,
    stagger,
    radius,
    density,
    resolvedSoftness,
    warp,
    warpScale,
    gain,
    exposure,
    contrast,
    cameraDistance,
    focal,
    color,
    midColor,
    deepColor,
    hueDrift,
    pulse,
    pulseRate,
    resolvedGrain,
    grainSize,
    grainRate,
    backgroundColor,
    opacity,
    cursorInteraction,
    cursorTilt,
    paused,
    resolvedAdaptiveQuality,
    targetFps,
    resolvedDpr,
    thinking,
    isCompact,
  ])

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return undefined

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    })
    if (!gl) return undefined

    const compiled = createProgram(gl, resolvedLayers)
    if (!compiled) return undefined
    const { program, uniforms: u } = compiled

    const buffer = gl.createBuffer()
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    )
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    const colorProbe = document
      .createElement('canvas')
      .getContext('2d', { willReadFrequently: true })
    const colorCache = new Map<string, RGBTuple>()

    const parseColor = (input: string, fallback: RGBTuple): RGBTuple => {
      const cached = colorCache.get(input)
      if (cached) return cached
      let rgb: RGBTuple = fallback
      if (colorProbe) {
        colorProbe.clearRect(0, 0, 1, 1)
        colorProbe.fillStyle = '#000000'
        colorProbe.fillStyle = input
        colorProbe.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = colorProbe.getImageData(0, 0, 1, 1).data
        if (a > 0) {
          rgb = [r / 255, g / 255, b / 255]
        }
      }
      colorCache.set(input, rgb)
      return rgb
    }

    const prefersReducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    const qualityMeter = {
      frames: 0,
      span: 0,
      wins: 0,
      scale: 1,
    }

    const state = {
      clock: 0,
      energy: propsRef.current.thinking ? 1 : 0,
      hoverTarget: 0,
      hoverSmooth: 0,
      raf: 0,
      lastTime: 0,
      visible: true,
      width: 1,
      height: 1,
    }

    const syncCanvasSize = (): void => {
      const p = propsRef.current
      const cssW = Math.max(1, container.clientWidth)
      const cssH = Math.max(1, container.clientHeight)
      state.width = cssW
      state.height = cssH

      const baseDpr = Math.min(
        Math.max(window.devicePixelRatio || 1, p.isCompact ? 3 : 1.5),
        Math.max(p.dpr, 1),
      )
      const effectiveDpr = baseDpr * qualityMeter.scale

      // Supersample compact avatars to at least 240px physical buffer so both
      // static 32x32 rendering and shared-layout shrink transitions stay razor-sharp.
      const minBufferSide = p.isCompact ? 240 : 64
      const targetW = Math.max(minBufferSide, Math.round(cssW * effectiveDpr))
      const targetH = Math.max(minBufferSide, Math.round(cssH * effectiveDpr))

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW
        canvas.height = targetH
      }
    }

    const renderFrame = (): void => {
      const p = propsRef.current
      const e = state.energy
      const h = state.hoverSmooth * clamp(p.cursorTilt, 0, 1.5)

      const activeSpin = p.speed * (1 + e * 1.65)
      const activeWarp = p.warp + e * 0.16
      const activeGain = p.gain * (1 + e * 0.28)
      const activeHueDrift = p.hueDrift * (1 + e * 1.35)
      const activePulse = p.pulse + e * 0.16
      const activePulseRate = p.pulseRate + e * 2.2
      const activeRadius = p.radius * (1 + 0.035 * e * Math.sin(state.clock * 3.4))

      const isLightMode =
        typeof document !== 'undefined' &&
        (document.querySelector('[data-workspace-theme="light"]') !== null ||
          document.querySelector('[data-landing-theme="light"]') !== null ||
          document.documentElement.getAttribute('data-theme') === 'light' ||
          document.documentElement.classList.contains('light') ||
          document.body.classList.contains('light') ||
          (!document.documentElement.classList.contains('dark') &&
            (window.localStorage?.getItem('kc_theme') === 'light' ||
              window.localStorage?.getItem('kc_landing_theme') === 'light')))

      const isTransparentBg =
        p.backgroundColor === 'transparent' ||
        p.backgroundColor === 'none' ||
        p.backgroundColor === ''

      let tintA = parseColor(p.color, [0.545, 0.239, 1.0])
      let tintB = parseColor(p.midColor, [0.22, 0.741, 0.973])
      let tintC = parseColor(p.deepColor, [0.184, 0.839, 1.0])

      if (isLightMode) {
        // In light mode, calibrate default/hero colors to rich saturated jewel tones
        // (royal violet, deep electric sapphire, vivid cobalt-cyan) so they have volume and body
        const isDefaultA = !p.color || p.color === '#8b3dff'
        const isDefaultB = !p.midColor || p.midColor === '#38bdf8'
        const isDefaultC = !p.deepColor || p.deepColor === '#2fd6ff'
        if (isDefaultA) tintA = [0.42, 0.18, 0.96]
        if (isDefaultB) tintB = [0.01, 0.44, 0.88]
        if (isDefaultC) tintC = [0.02, 0.62, 0.86]
      }

      const backdropRgb = isTransparentBg
        ? ([0, 0, 0] as RGBTuple)
        : parseColor(p.backgroundColor, isLightMode ? [1, 1, 1] : [0.04, 0.04, 0.05])

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(program)
      gl.bindVertexArray(vao)

      gl.uniform2f(u.uCanvas ?? null, canvas.width, canvas.height)
      gl.uniform1f(u.uClock ?? null, state.clock)
      gl.uniform1f(u.uSpin ?? null, activeSpin)
      gl.uniform1f(u.uStagger ?? null, p.stagger)
      gl.uniform1f(u.uRadius ?? null, activeRadius)
      gl.uniform1f(u.uDensity ?? null, p.density)
      gl.uniform1f(u.uSoftness ?? null, p.softness)
      gl.uniform1f(u.uWarp ?? null, activeWarp)
      gl.uniform1f(u.uWarpScale ?? null, p.warpScale)
      gl.uniform1f(u.uGain ?? null, activeGain)
      gl.uniform1f(u.uExposure ?? null, p.exposure)
      gl.uniform1f(u.uContrast ?? null, p.contrast)
      gl.uniform1f(u.uReach ?? null, p.cameraDistance)
      gl.uniform1f(u.uLens ?? null, p.focal)
      gl.uniform1f(u.uHueDrift ?? null, activeHueDrift)
      gl.uniform1f(u.uPulse ?? null, activePulse)
      gl.uniform1f(u.uPulseRate ?? null, activePulseRate)
      gl.uniform1f(u.uGrain ?? null, p.grain)
      gl.uniform1f(
        u.uGrainSize ?? null,
        Math.max(p.grainSize, 1) * (canvas.width / Math.max(state.width, 1)),
      )
      gl.uniform1f(u.uGrainRate ?? null, p.grainRate)
      gl.uniform3fv(u.uTintA ?? null, tintA)
      gl.uniform3fv(u.uTintB ?? null, tintB)
      gl.uniform3fv(u.uTintC ?? null, tintC)
      gl.uniform3fv(u.uBackdrop ?? null, backdropRgb)
      gl.uniform1f(u.uBackdropAlpha ?? null, isTransparentBg ? 0 : 1)
      gl.uniform1f(u.uIsLight ?? null, isLightMode ? 1 : 0)
      gl.uniform1f(u.uOpacity ?? null, p.opacity)
      gl.uniform1f(u.uHover ?? null, h)

      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const tick = (now: number): void => {
      state.raf = 0
      if (!state.visible || document.hidden) return

      const p = propsRef.current
      const rawDt = state.lastTime ? (now - state.lastTime) / 1000 : 1 / 60
      const dt = clamp(rawDt, 0.001, 0.05)
      state.lastTime = now

      const targetEnergy = p.thinking ? 1 : 0
      state.energy += (targetEnergy - state.energy) * (1 - Math.exp(-dt * 6))

      const targetHover = p.cursorInteraction ? state.hoverTarget : 0
      state.hoverSmooth +=
        (targetHover - state.hoverSmooth) * (1 - Math.exp(-dt * 7))

      if (p.paused || (prefersReducedMotion && !p.thinking)) {
        renderFrame()
        state.lastTime = 0
        return
      }

      const motionScale = prefersReducedMotion ? 0.25 : 1
      state.clock += dt * motionScale

      if (p.adaptiveQuality && !p.isCompact) {
        qualityMeter.frames += 1
        qualityMeter.span += dt
        if (qualityMeter.span >= 0.75) {
          const fps = qualityMeter.frames / qualityMeter.span
          qualityMeter.frames = 0
          qualityMeter.span = 0
          if (fps < 0.85 * p.targetFps && qualityMeter.scale > 0.65) {
            qualityMeter.wins = 0
            qualityMeter.scale = Math.max(0.65, qualityMeter.scale * 0.85)
            syncCanvasSize()
          } else if (fps > 0.98 * p.targetFps && qualityMeter.scale < 1) {
            qualityMeter.wins += 1
            if (qualityMeter.wins >= 3) {
              qualityMeter.wins = 0
              qualityMeter.scale = Math.min(1, qualityMeter.scale * 1.15)
              syncCanvasSize()
            }
          }
        }
      }

      renderFrame()
      state.raf = requestAnimationFrame(tick)
    }

    const wake = (): void => {
      if (!state.raf && state.visible && !document.hidden) {
        state.raf = requestAnimationFrame(tick)
      }
    }

    const onPointerEnter = (): void => {
      if (!propsRef.current.cursorInteraction) return
      state.hoverTarget = 1
      wake()
    }

    const onPointerLeave = (): void => {
      state.hoverTarget = 0
      wake()
    }

    const onVisibilityChange = (): void => {
      state.lastTime = 0
      wake()
    }

    const resizeObserver = new ResizeObserver(() => {
      syncCanvasSize()
      renderFrame()
      wake()
    })
    resizeObserver.observe(container)

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        state.visible = entries.some((entry) => entry.isIntersecting)
        if (state.visible) {
          state.lastTime = 0
          wake()
        }
      },
      { threshold: 0 },
    )
    intersectionObserver.observe(container)

    container.addEventListener('pointerenter', onPointerEnter, {
      passive: true,
    })
    container.addEventListener('pointerleave', onPointerLeave, {
      passive: true,
    })
    document.addEventListener('visibilitychange', onVisibilityChange)

    syncCanvasSize()
    renderFrame()
    wake()

    wakeRef.current = () => {
      syncCanvasSize()
      if (!state.raf) renderFrame()
      wake()
    }

    return () => {
      cancelAnimationFrame(state.raf)
      wakeRef.current = null
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      container.removeEventListener('pointerenter', onPointerEnter)
      container.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      gl.deleteProgram(program)
      gl.deleteBuffer(buffer)
      gl.deleteVertexArray(vao)
    }
  }, [resolvedLayers])

  useEffect(() => {
    wakeRef.current?.()
  })

  return (
    <div
      ref={containerRef}
      className={cn('relative select-none', className)}
      style={style}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 block h-full w-full"
      />
      {children ? (
        <div className="relative z-10 h-full w-full">{children}</div>
      ) : null}
    </div>
  )
}
