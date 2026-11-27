'use client'

import React, { useEffect, useRef, type CSSProperties } from 'react'
import './Orb.css'

const INTRO_SECONDS = 1.1
const FOCAL = 3.2

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uRotation;
uniform vec2 uReach;
uniform float uNear;
uniform float uAwake;
uniform vec3 uBackground;
uniform float uBackgroundAlpha;
uniform float uIsLight;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uScale;
uniform float uWobble;
uniform float uGlow;
uniform float uBleed;
uniform float uHighlight;
uniform float uSwirl;
uniform float uOrbit;
uniform vec2 uEcho;
uniform float uReveal;
uniform float uOpacity;
uniform float uTrail;
uniform vec2 uTilt;
out vec4 outColor;

vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yxz + 19.19);
  return -1.0 + 2.0 * fract(vec3(p3.x + p3.y, p3.x + p3.z, p3.y + p3.z) * p3.zyx);
}

float snoise3(vec3 p) {
  const float K1 = 0.333333333;
  const float K2 = 0.166666667;
  vec3 i = floor(p + (p.x + p.y + p.z) * K1);
  vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
  vec3 e = step(vec3(0.0), d0 - d0.yzx);
  vec3 i1 = e * (1.0 - e.zxy);
  vec3 i2 = 1.0 - e.zxy * (1.0 - e);
  vec3 d1 = d0 - (i1 - K2);
  vec3 d2 = d0 - (i2 - K1);
  vec3 d3 = d0 - 0.5;
  vec4 h = max(0.6 - vec4(dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3)), 0.0);
  vec4 n = h * h * h * h * vec4(dot(d0, hash33(i)), dot(d1, hash33(i + i1)), dot(d2, hash33(i + i2)), dot(d3, hash33(i + 1.0)));
  return dot(vec4(31.316), n);
}

float light1(float intensity, float attenuation, float dist) {
  return intensity / (1.0 + dist * attenuation);
}

float light2(float intensity, float attenuation, float dist) {
  return intensity / (1.0 + dist * dist * attenuation);
}

vec4 draw(vec2 uv) {
  float rawLen = length(uv);
  vec2 dir = rawLen > 0.0001 ? uv / rawLen : vec2(1.0, 0.0);
  float reachAmount = length(uReach);
  vec2 reachDir = reachAmount > 0.00001 ? uReach / reachAmount : vec2(1.0, 0.0);
  float facing = exp((dot(dir, reachDir) - 1.0) * 3.2);
  float len = max(rawLen - reachAmount * facing * smoothstep(0.25, 0.65, rawLen), 0.0);
  uv = dir * len;
  float ang = atan(dir.y, dir.x);
  float invLen = len > 0.0 ? 1.0 / len : 0.0;
  float near = facing * uNear;
  float bgLuminance = dot(uBackground, vec3(0.299, 0.587, 0.114));

  float n0 = snoise3(vec3(uv * 0.65, uTime * 0.5)) * 0.5 + 0.5;
  float r0 = mix(0.8 - 0.04 * uWobble, 0.8 + 0.04 * uWobble, n0);
  float d0 = distance(uv, (r0 * invLen) * uv);
  float v0 = light1(1.0, 10.0 / uGlow, d0);
  v0 *= smoothstep(r0 * 1.05, r0, len);
  float reach = max(uBleed, 0.04);
  float innerFade = smoothstep(r0 * (1.0 - 0.2 * reach), r0 * (1.0 - 0.05 * reach), len);
  v0 *= mix(innerFade, 1.0, bgLuminance * 0.7 * min(uBleed, 1.0));
  float body = smoothstep(0.8 - 0.2 * reach, 0.8, len);
  float cl = cos(ang + uSwirl) * 0.5 + 0.5;

  vec2 pos = vec2(cos(uOrbit), sin(uOrbit)) * r0;
  float d = distance(uv, pos);
  vec2 head = vec2(cos(uOrbit), sin(uOrbit));
  float lag = atan(head.x * dir.y - head.y * dir.x, dot(dir, head));
  float trail = uTrail > 0.0 ? smoothstep(0.0, 0.35, lag) * exp(-max(lag, 0.0) * 2.6 / uTrail) : 0.0;
  float v1 = (light2(1.5, 5.0, d) + trail * 0.6) * uHighlight;
  v1 *= light1(1.0, 50.0, d0);
  float band = v0 * smoothstep(1.0, mix(0.6, 1.0, n0 * 0.5), len) * body;
  float heat = pow(clamp(band / 0.82, 0.0, 1.0), 3.0);
  float bloom = light2(1.0, 160.0 / uGlow, max(len - r0, 0.0)) * smoothstep(0.4, 0.0, len - r0) * step(r0, len);

  float v2 = smoothstep(1.0, mix(0.6, 1.0, n0 * 0.5), len);
  float v3 = body;

  vec3 colBase = mix(uColor1, uColor2, cl);
  float fadeAmount = mix(1.0, 0.1, bgLuminance);

  float echoD = abs(len - r0 - uEcho.x);
  float echo = light1(1.0, 60.0, echoD) * smoothstep(0.12, 0.0, echoD) * uEcho.y;

  // Dark-mode fluid ring calculation
  vec3 darkRing = mix(uColor3, colBase, v0);
  darkRing = (darkRing + v1) * v2 * v3 * (1.0 + uAwake + near * 0.35) + mix(colBase, vec3(1.0), 0.25) * heat * (0.28 + near * 0.3);
  darkRing = clamp(darkRing + colBase * (bloom * 0.12 + echo * 0.85), 0.0, 1.0);

  // Light-mode fluid ribbon: saturated, luminous jewel ribbons rather than muddy inverted gray
  vec3 lightRing = mix(uColor3, colBase, clamp(v0 * 1.25, 0.0, 1.0));
  lightRing = (lightRing + v1 * 1.15) * clamp(v2 * v3 * 1.35, 0.0, 1.0) * (1.0 + uAwake + near * 0.35);
  lightRing += colBase * (bloom * 0.25 + echo * 0.9);
  lightRing += mix(colBase, vec3(1.0), 0.35) * heat * 0.45;
  // Saturated chromatic tone curve for light backgrounds
  lightRing = pow(clamp(lightRing, 0.0, 1.0), vec3(1.15)) * 1.35;
  lightRing = clamp(lightRing, 0.0, 1.0);

  vec3 activeRing = uIsLight > 0.5 ? lightRing : darkRing;

  // Exact ring coverage mask (zero outside the ring/bloom/echo)
  float ringCore = v0 * v2 * v3;
  float beadAlpha = v1 * 0.95;
  float bloomAlpha = bloom * 0.4;
  float echoAlpha = echo * 0.75;
  float ringAlpha = clamp(ringCore * 1.55 + beadAlpha + bloomAlpha + echoAlpha, 0.0, 1.0);

  vec3 finalCol;
  float alpha;
  if (uBackgroundAlpha > 0.01) {
    finalCol = mix(uBackground, activeRing, ringAlpha);
    alpha = 1.0;
  } else {
    finalCol = activeRing;
    alpha = ringAlpha;
  }

  return vec4(finalCol, alpha);
}

vec2 toPlane(vec2 p, out float hit) {
  float cx = cos(uTilt.x);
  float sx = sin(uTilt.x);
  float cy = cos(uTilt.y);
  float sy = sin(uTilt.y);
  vec3 ex = vec3(cy, 0.0, -sy);
  vec3 ey = vec3(sy * sx, cx, cy * sx);
  vec3 normal = vec3(sy * cx, -sx, cy * cx);
  vec3 origin = vec3(0.0, 0.0, ${FOCAL.toFixed(1)});
  vec3 ray = vec3(p, -${FOCAL.toFixed(1)});
  float denom = dot(normal, ray);
  float t = -dot(normal, origin) / (abs(denom) > 0.00001 ? denom : -0.00001);
  hit = t > 0.0 ? 1.0 : 0.0;
  vec3 q = origin + ray * t;
  return vec2(dot(q, ex), dot(q, ey));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - uResolution * 0.5) / min(uResolution.x, uResolution.y) * 2.0;
  uv *= uScale;
  float hit = 1.0;
  if (abs(uTilt.x) + abs(uTilt.y) > 0.0001) uv = toPlane(uv, hit);

  float s = sin(uRotation);
  float c = cos(uRotation);
  uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);

  vec4 col = draw(uv);
  float dither = col.a > 0.001 ? (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0 : 0.0;
  float alpha = clamp(col.a * hit * uReveal * uOpacity + dither, 0.0, 1.0);
  outColor = vec4(col.rgb * alpha, alpha);
}`

type RGBTuple = [number, number, number]

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const compile = (
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

const link = (
  gl: WebGL2RenderingContext,
): {
  program: WebGLProgram
  uniforms: Record<string, WebGLUniformLocation | null>
} | null => {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
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
    if (info) uniforms[info.name] = gl.getUniformLocation(program, info.name)
  }
  return { program, uniforms }
}

export interface OrbProps {
  colors?: string[]
  hue?: number
  backgroundColor?: string
  size?: number
  glow?: number
  bleed?: number
  wobble?: number
  highlight?: number
  trail?: number
  tiltX?: number
  tiltY?: number
  speed?: number
  hoverIntensity?: number
  rotateOnHover?: boolean
  forceHoverState?: boolean
  followCursor?: boolean
  clickPulse?: boolean
  intro?: boolean
  opacity?: number
  paused?: boolean
  dpr?: number
  variant?: 'hero' | 'avatar' | 'mini'
  thinking?: boolean
  className?: string
  style?: CSSProperties
}

export const Orb: React.FC<OrbProps> = ({
  colors = ['#8b3dff', '#38bdf8', '#1e1b4b'],
  hue = 0,
  backgroundColor = 'transparent',
  size,
  glow = 1,
  bleed = 1,
  wobble,
  highlight,
  trail,
  tiltX = 0,
  tiltY = 0,
  speed,
  hoverIntensity = 1,
  rotateOnHover = true,
  forceHoverState = false,
  followCursor = true,
  clickPulse = true,
  intro = false,
  opacity = 1,
  paused = false,
  dpr,
  variant = 'hero',
  thinking = false,
  className = '',
  style,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wakeRef = useRef<(() => void) | null>(null)
  const palette = Array.isArray(colors) ? colors : []

  const isCompact = variant === 'avatar' || variant === 'mini'
  const resolvedWobble = wobble ?? (thinking ? 2.4 : isCompact ? 1.6 : 1.8)
  const resolvedSpeed = speed ?? (thinking ? 2.4 : isCompact ? 1.0 : 1.0)
  const resolvedHighlight = highlight ?? (thinking ? 1.35 : 1.15)
  const resolvedTrail = trail ?? (thinking ? 1.2 : 1.0)
  const resolvedSize =
    size ?? (variant === 'mini' ? 1.08 : isCompact ? 1.05 : 1.0)
  const resolvedForceHover = forceHoverState || thinking

  const settings = {
    colors: [
      palette[0] ?? '#8b3dff',
      palette[1] ?? palette[0] ?? '#38bdf8',
      palette[2] ?? '#1e1b4b',
    ].map(String),
    hue,
    backgroundColor: String(backgroundColor),
    size: clamp(resolvedSize, 0.1, 3),
    glow: clamp(glow, 0.1, 5),
    bleed: clamp(bleed, 0, 4),
    wobble: Math.max(0, resolvedWobble),
    highlight: Math.max(0, resolvedHighlight),
    trail: Math.max(0, resolvedTrail),
    tiltX: clamp(tiltX, -70, 70),
    tiltY: clamp(tiltY, -70, 70),
    speed: resolvedSpeed,
    hoverIntensity: Math.max(0, hoverIntensity),
    rotateOnHover,
    forceHoverState: resolvedForceHover,
    followCursor,
    clickPulse,
    intro,
    opacity: clamp(opacity, 0, 1),
    paused,
    dpr,
    isCompact,
  }
  const settingsRef = useRef(settings)

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    const gl = canvas?.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    })
    if (!container || !canvas || !gl) return undefined

    const program = link(gl)
    if (!program) return undefined
    const u = program.uniforms

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

    const probe = document
      .createElement('canvas')
      .getContext('2d', { willReadFrequently: true })
    const reduce =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const cache = new Map<string, RGBTuple>()
    const parse = (value: string): RGBTuple => {
      if (value === 'transparent' || value === 'none' || value === '') {
        return [0, 0, 0]
      }
      const cached = cache.get(value)
      if (cached) return cached
      let rgb: RGBTuple = [0, 0, 0]
      if (probe) {
        probe.clearRect(0, 0, 1, 1)
        probe.fillStyle = '#000000'
        probe.fillStyle = value
        probe.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
        rgb = a ? [r / 255, g / 255, b / 255] : [0, 0, 0]
      }
      cache.set(value, rgb)
      return rgb
    }
    const shiftHue = (rgb: RGBTuple, degrees: number): RGBTuple => {
      if (!degrees) return rgb
      const angle = (degrees * Math.PI) / 180
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const [r, g, b] = rgb
      const y = 0.299 * r + 0.587 * g + 0.114 * b
      const i = 0.596 * r - 0.274 * g - 0.322 * b
      const q = 0.211 * r - 0.523 * g + 0.312 * b
      const ni = i * cos - q * sin
      const nq = i * sin + q * cos
      return [
        y + 0.956 * ni + 0.621 * nq,
        y - 0.272 * ni - 0.647 * nq,
        y - 1.106 * ni + 1.703 * nq,
      ]
    }

    const view = { width: 1, height: 1 }
    const pointer = { x: 0, y: 0, inside: false }
    const state = {
      time: 0,
      swirl: 0,
      orbit: 0,
      echo: 1,
      rotation: 0,
      hover: 0,
      near: 0,
      reachX: 0,
      reachY: 0,
      reachSpeedX: 0,
      reachSpeedY: 0,
      pulse: 0,
      pulseSpeed: 0,
      kick: settingsRef.current.intro && !reduce ? 2.5 : 0,
      reveal: settingsRef.current.intro && !reduce ? 0 : 1,
      raf: 0,
      last: 0,
      visible: true,
      lastDpr: settingsRef.current.dpr,
    }

    const toOrb = (x: number, y: number): [number, number] => {
      const s = settingsRef.current
      const side = Math.min(view.width, view.height)
      const scale = 1 / (s.size * (1 + state.pulse))
      let ux = ((x - view.width / 2) / side) * 2 * scale
      let uy = ((view.height / 2 - y) / side) * 2 * scale
      if (s.tiltX || s.tiltY) {
        const ax = (-s.tiltX * Math.PI) / 180
        const ay = (s.tiltY * Math.PI) / 180
        const [cx, sx, cy, sy] = [
          Math.cos(ax),
          Math.sin(ax),
          Math.cos(ay),
          Math.sin(ay),
        ]
        const normal: [number, number, number] = [sy * cx, -sx, cy * cx]
        const ray: [number, number, number] = [ux, uy, -FOCAL]
        const denom =
          normal[0] * ray[0] + normal[1] * ray[1] + normal[2] * ray[2]
        const t =
          -(normal[2] * FOCAL) /
          (Math.abs(denom) > 0.00001 ? denom : -0.00001)
        if (t <= 0) return [99, 99]
        const q: [number, number, number] = [
          ray[0] * t,
          ray[1] * t,
          FOCAL + ray[2] * t,
        ]
        ux = q[0] * cy - q[2] * sy
        uy = q[0] * sy * sx + q[1] * cx + q[2] * cy * sx
      }
      const sin = Math.sin(state.rotation)
      const cos = Math.cos(state.rotation)
      return [cos * ux - sin * uy, sin * ux + cos * uy]
    }

    const render = (): void => {
      const s = settingsRef.current
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

      const isTransparent =
        s.backgroundColor === 'transparent' ||
        s.backgroundColor === 'none' ||
        s.backgroundColor === ''

      let [c1, c2, c3] = s.colors.map((value) =>
        shiftHue(parse(value), s.hue),
      )

      if (isLightMode) {
        // In light mode, calibrate default colors to deep royal violet, electric sapphire, vivid cobalt
        const isDefaultColors =
          s.colors.length === 3 &&
          s.colors[0] === '#8b3dff' &&
          s.colors[1] === '#38bdf8'
        if (isDefaultColors) {
          c1 = [0.42, 0.18, 0.96]
          c2 = [0.01, 0.44, 0.88]
          c3 = [0.02, 0.62, 0.86]
        }
      }

      const reveal = state.reveal
      const back = reveal - 1
      const grow = 1 + 2.2 * back * back * back + 1.2 * back * back
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(program.program)
      gl.bindVertexArray(vao)
      gl.uniform2f(u.uResolution ?? null, canvas.width, canvas.height)
      gl.uniform1f(u.uTime ?? null, state.time)
      gl.uniform2f(u.uReach ?? null, state.reachX, state.reachY)
      gl.uniform1f(u.uNear ?? null, state.near)
      gl.uniform1f(u.uAwake ?? null, state.hover * s.hoverIntensity * 0.18)
      gl.uniform1f(u.uRotation ?? null, state.rotation)
      gl.uniform3fv(u.uBackground ?? null, isTransparent ? [0, 0, 0] : parse(s.backgroundColor))
      gl.uniform1f(u.uBackgroundAlpha ?? null, isTransparent ? 0 : 1)
      gl.uniform1f(u.uIsLight ?? null, isLightMode ? 1 : 0)
      gl.uniform3fv(u.uColor1 ?? null, c1)
      gl.uniform3fv(u.uColor2 ?? null, c2)
      gl.uniform3fv(u.uColor3 ?? null, c3)
      gl.uniform1f(
        u.uScale ?? null,
        1 / (s.size * (1 + state.pulse) * (0.62 + 0.38 * grow)),
      )
      gl.uniform1f(u.uWobble ?? null, s.wobble)
      gl.uniform1f(u.uGlow ?? null, s.glow)
      gl.uniform1f(u.uBleed ?? null, s.bleed)
      gl.uniform1f(u.uHighlight ?? null, s.highlight)
      gl.uniform2f(
        u.uEcho ?? null,
        state.echo * 0.55,
        state.echo < 1 ? (1 - state.echo) * (1 - state.echo) : 0,
      )
      gl.uniform1f(u.uSwirl ?? null, state.swirl)
      gl.uniform1f(u.uOrbit ?? null, state.orbit)
      gl.uniform1f(
        u.uReveal ?? null,
        Math.min(1, reveal / 0.55) *
        Math.min(1, reveal / 0.55) *
        (3 - 2 * Math.min(1, reveal / 0.55)),
      )
      gl.uniform1f(u.uOpacity ?? null, s.opacity)
      gl.uniform1f(u.uTrail ?? null, s.trail)
      gl.uniform2f(
        u.uTilt ?? null,
        (-s.tiltX * Math.PI) / 180,
        (s.tiltY * Math.PI) / 180,
      )
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const frame = (now: number): void => {
      state.raf = 0
      if (!state.visible || document.hidden) return
      const s = settingsRef.current
      const dt = state.last ? clamp((now - state.last) / 1000, 0.0005, 0.05) : 1 / 60
      state.last = now
      if (s.paused) {
        state.reveal = 1
        render()
        state.last = 0
        return
      }
      const motion = reduce ? 0 : 1
      const [px, py] = toOrb(pointer.x, pointer.y)
      const distance = Math.hypot(px, py)
      const region =
        pointer.inside && motion ? clamp((1.45 - distance) / 0.4, 0, 1) : 0
      const zone = region * region * (3 - 2 * region)
      const aimed = zone * clamp((distance - 0.15) / 0.45, 0, 1)
      const near = zone > 0.5
      const target = s.forceHoverState ? 1 : zone
      state.hover += (target - state.hover) * (1 - Math.exp(-dt / 0.16))
      const reach = 0.075 * s.hoverIntensity * aimed
      const goalX = distance > 0.0001 ? (px / distance) * reach : 0
      const goalY = distance > 0.0001 ? (py / distance) * reach : 0
      state.reachSpeedX +=
        (70 * (goalX - state.reachX) - 7 * state.reachSpeedX) * dt
      state.reachSpeedY +=
        (70 * (goalY - state.reachY) - 7 * state.reachSpeedY) * dt
      state.reachX += state.reachSpeedX * dt
      state.reachY += state.reachSpeedY * dt
      state.near +=
        (aimed * s.hoverIntensity - state.near) * (1 - Math.exp(-dt / 0.12))

      const step = dt * s.speed * motion
      state.time += step
      state.swirl += step * 2 * (1 + state.kick)
      state.echo = Math.min(1, state.echo + dt / 1.2)
      if (s.rotateOnHover) state.rotation += dt * 0.3 * state.hover * motion

      const aim = Math.atan2(py, px)
      if (s.followCursor && near && motion) {
        const delta = Math.atan2(
          Math.sin(aim - state.orbit),
          Math.cos(aim - state.orbit),
        )
        state.orbit += delta * (1 - Math.exp(-dt * 6))
      } else {
        state.orbit -= step
      }
      state.orbit = Math.atan2(Math.sin(state.orbit), Math.cos(state.orbit))

      state.pulseSpeed += (-170 * state.pulse - 11 * state.pulseSpeed) * dt
      state.pulse += state.pulseSpeed * dt
      state.kick *= Math.exp(-dt * 2.5)

      if (!s.intro || reduce) state.reveal = 1
      else if (state.reveal < 1)
        state.reveal = Math.min(1, state.reveal + dt / INTRO_SECONDS)

      render()
      state.raf = requestAnimationFrame(frame)
    }

    const wake = (): void => {
      if (!state.raf && state.visible && !document.hidden)
        state.raf = requestAnimationFrame(frame)
    }

    const resize = (): void => {
      const s = settingsRef.current
      const width = Math.max(1, container.clientWidth)
      const height = Math.max(1, container.clientHeight)
      const isSmall = s.isCompact || width <= 64 || height <= 64
      const ratio = isSmall
        ? Math.min(Math.max(window.devicePixelRatio || 1, 3), 3)
        : Math.min(s.dpr || window.devicePixelRatio || 1, 2)
      view.width = width
      view.height = height
      const minBuffer = isSmall ? 240 : 64
      canvas.width = Math.max(minBuffer, Math.round(width * ratio))
      canvas.height = Math.max(minBuffer, Math.round(height * ratio))
      render()
      wake()
    }

    const locate = (event: PointerEvent): void => {
      const rect = container.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
      pointer.inside =
        pointer.x >= 0 &&
        pointer.y >= 0 &&
        pointer.x <= rect.width &&
        pointer.y <= rect.height
    }

    const onPointerMove = (event: PointerEvent): void => {
      locate(event)
      if (!settingsRef.current.paused) wake()
    }

    const onPointerDown = (event: PointerEvent): void => {
      const s = settingsRef.current
      locate(event)
      if (!pointer.inside || !s.clickPulse || s.paused || reduce) return
      const [px, py] = toOrb(pointer.x, pointer.y)
      if (Math.hypot(px, py) > 1) return
      state.pulseSpeed += 0.9
      state.kick = 2.2
      state.echo = 0
      wake()
    }

    const onPointerUp = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse') pointer.inside = false
    }

    const onPointerLeave = (): void => {
      pointer.inside = false
    }

    const onVisibility = (): void => {
      state.last = 0
      wake()
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    const intersection = new IntersectionObserver((entries) => {
      state.visible = entries.some((entry) => entry.isIntersecting)
      if (state.visible) {
        state.last = 0
        wake()
      }
    })
    intersection.observe(container)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('pointerup', onPointerUp, { passive: true })
    window.addEventListener('pointercancel', onPointerUp, { passive: true })
    document.documentElement.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('visibilitychange', onVisibility)
    resize()

    wakeRef.current = () => {
      const s = settingsRef.current
      if (s.dpr !== state.lastDpr) {
        state.lastDpr = s.dpr
        resize()
        return
      }
      if (!state.raf) render()
      wake()
    }

    return () => {
      cancelAnimationFrame(state.raf)
      wakeRef.current = null
      resizeObserver.disconnect()
      intersection.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      document.documentElement.removeEventListener(
        'pointerleave',
        onPointerLeave,
      )
      document.removeEventListener('visibilitychange', onVisibility)
      gl.deleteProgram(program.program)
      gl.deleteBuffer(buffer)
      gl.deleteVertexArray(vao)
    }
  }, [])

  useEffect(() => {
    settingsRef.current = settings
    wakeRef.current?.()
  })

  return (
    <div
      ref={containerRef}
      className={`orb-container${className ? ` ${className}` : ''}`}
      style={style}
    >
      <canvas ref={canvasRef} className="orb-canvas" aria-hidden="true" />
    </div>
  )
}

export default Orb
