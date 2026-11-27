import { useEffect, useId, useState, type RefObject } from "react"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"

export type BeamAnchor = "center" | "right" | "left" | "top" | "bottom"

export interface AnimatedBeamProps {
  className?: string
  containerRef: RefObject<HTMLElement | null>
  fromRef: RefObject<HTMLElement | null>
  toRef: RefObject<HTMLElement | null>
  fromAnchor?: BeamAnchor
  toAnchor?: BeamAnchor
  curvature?: number
  reverse?: boolean
  pathColor?: string
  pathWidth?: number
  pathOpacity?: number
  gradientStartColor?: string
  gradientStopColor?: string
  delay?: number
  duration?: number
  repeat?: number
  repeatDelay?: number
  startXOffset?: number
  startYOffset?: number
  endXOffset?: number
  endYOffset?: number
  showArrow?: boolean
}

function getAnchorPoint(
  rect: DOMRect,
  containerRect: DOMRect,
  anchor: BeamAnchor
): { x: number; y: number } {
  const left = rect.left - containerRect.left
  const top = rect.top - containerRect.top
  switch (anchor) {
    case "right":
      return { x: left + rect.width, y: top + rect.height / 2 }
    case "left":
      return { x: left, y: top + rect.height / 2 }
    case "top":
      return { x: left + rect.width / 2, y: top }
    case "bottom":
      return { x: left + rect.width / 2, y: top + rect.height }
    case "center":
    default:
      return { x: left + rect.width / 2, y: top + rect.height / 2 }
  }
}

export const AnimatedBeam: React.FC<AnimatedBeamProps> = ({
  className,
  containerRef,
  fromRef,
  toRef,
  fromAnchor = "right",
  toAnchor = "left",
  curvature = 0,
  reverse = false,
  duration = 3.6,
  delay = 0,
  pathColor = "var(--border-subtle, rgba(148, 163, 184, 0.45))",
  pathWidth = 2.2,
  pathOpacity = 0.75,
  gradientStartColor = "var(--aurora-cyan, #2fd6ff)",
  gradientStopColor = "var(--aurora-violet, #8b3dff)",
  repeat = Infinity,
  repeatDelay = 0,
  startXOffset = 0,
  startYOffset = 0,
  endXOffset = 0,
  endYOffset = 0,
  showArrow = true,
}) => {
  const id = useId()
  const [pathD, setPathD] = useState("")
  const [arrowTransform, setArrowTransform] = useState<string | null>(null)
  const [svgDimensions, setSvgDimensions] = useState({ width: 0, height: 0 })
  const [endpoints, setEndpoints] = useState<{
    startX: number
    startY: number
    endX: number
    endY: number
  } | null>(null)

  useEffect(() => {
    const updatePath = () => {
      if (containerRef.current && fromRef.current && toRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect()
        const rectA = fromRef.current.getBoundingClientRect()
        const rectB = toRef.current.getBoundingClientRect()

        const svgWidth = containerRect.width
        const svgHeight = containerRect.height
        setSvgDimensions({ width: svgWidth, height: svgHeight })

        const ptA = getAnchorPoint(rectA, containerRect, fromAnchor)
        const ptB = getAnchorPoint(rectB, containerRect, toAnchor)

        const startX = ptA.x + startXOffset
        const startY = ptA.y + startYOffset
        const endX = ptB.x + endXOffset
        const endY = ptB.y + endYOffset

        setEndpoints({ startX, startY, endX, endY })

        const controlX = (startX + endX) / 2
        const controlY = (startY + endY) / 2 - curvature
        const d = `M ${startX},${startY} Q ${controlX},${controlY} ${endX},${endY}`
        setPathD(d)

        // Place directional arrowhead slightly toward destination (t = 0.62)
        const t = 0.62
        const omt = 1 - t
        const arrowX =
          omt * omt * startX + 2 * omt * t * controlX + t * t * endX
        const arrowY =
          omt * omt * startY + 2 * omt * t * controlY + t * t * endY
        const tx = 2 * omt * (controlX - startX) + 2 * t * (endX - controlX)
        const ty = 2 * omt * (controlY - startY) + 2 * t * (endY - controlY)
        const angleDeg = (Math.atan2(ty, tx) * 180) / Math.PI
        setArrowTransform(`translate(${arrowX}, ${arrowY}) rotate(${angleDeg})`)
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      updatePath()
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    updatePath()

    return () => {
      resizeObserver.disconnect()
    }
  }, [
    containerRef,
    fromRef,
    toRef,
    fromAnchor,
    toAnchor,
    curvature,
    reverse,
    startXOffset,
    startYOffset,
    endXOffset,
    endYOffset,
  ])

  // Compute precise coordinates along the path so the energy beam travels directly across the segment
  const dx = endpoints ? endpoints.endX - endpoints.startX : 100
  const dy = endpoints ? endpoints.endY - endpoints.startY : 0
  const sx = endpoints?.startX ?? 0
  const ex = endpoints?.endX ?? 100
  const sy = endpoints?.startY ?? 0
  const ey = endpoints?.endY ?? 0

  const gradientCoordinates = reverse
    ? {
      x1: [ex + dx * 0.3, sx - dx * 0.4],
      x2: [ex, sx - dx * 0.6],
      y1: [ey + dy * 0.3, sy - dy * 0.4],
      y2: [ey, sy - dy * 0.6],
    }
    : {
      x1: [sx - dx * 0.3, ex + dx * 0.4],
      x2: [sx, ex + dx * 0.6],
      y1: [sy - dy * 0.3, ey + dy * 0.4],
      y2: [sy, ey + dy * 0.6],
    }

  return (
    <svg
      fill="none"
      width={svgDimensions.width}
      height={svgDimensions.height}
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        "pointer-events-none absolute top-0 left-0 z-20 transform-gpu stroke-2",
        className
      )}
      viewBox={`0 0 ${svgDimensions.width} ${svgDimensions.height}`}
    >
      {/* Background connector path */}
      <path
        d={pathD}
        stroke={pathColor}
        strokeWidth={pathWidth}
        strokeOpacity={pathOpacity}
        strokeLinecap="round"
      />

      {/* Luminous neon beam glow layer */}
      <path
        d={pathD}
        strokeWidth={pathWidth + 3.2}
        stroke={`url(#${id})`}
        strokeOpacity="0.75"
        strokeLinecap="round"
        className="filter blur-[2px]"
      />

      {/* Focused bright core beam */}
      <path
        d={pathD}
        strokeWidth={pathWidth + 0.8}
        stroke={`url(#${id})`}
        strokeOpacity="1"
        strokeLinecap="round"
      />

      {/* Dynamic color-shifting and brightness-pulsing arrowhead */}
      {showArrow && arrowTransform && (
        <g transform={arrowTransform}>
          {/* Luminous aura behind arrowhead */}
          <motion.path
            d="M -7 -6 L 7 0 L -7 6 Z"
            fill={gradientStartColor}
            className="filter blur-[3px]"
            animate={{
              opacity: [0.35, 0.95, 0.35],
              scale: [0.95, 1.25, 0.95],
            }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              ease: "easeInOut",
              delay,
            }}
          />
          {/* Color-changing and brightness-pulsing arrow mark */}
          <motion.path
            d="M -6 -5 L 6 0 L -6 5 Z"
            animate={{
              fill: [
                gradientStartColor,
                gradientStopColor,
                "#38bdf8",
                "#14f194",
                gradientStartColor,
              ],
              filter: [
                "drop-shadow(0 0 3px rgba(47,214,255,0.7)) brightness(1)",
                "drop-shadow(0 0 9px rgba(139,61,255,0.95)) brightness(1.7)",
                "drop-shadow(0 0 11px rgba(56,189,248,1)) brightness(1.9)",
                "drop-shadow(0 0 7px rgba(20,241,148,0.9)) brightness(1.5)",
                "drop-shadow(0 0 3px rgba(47,214,255,0.7)) brightness(1)",
              ],
            }}
            transition={{
              duration: 2.6,
              repeat: Infinity,
              ease: "easeInOut",
              delay,
            }}
            stroke="var(--background)"
            strokeWidth="0.9"
          />
        </g>
      )}

      <defs>
        <motion.linearGradient
          className="transform-gpu"
          id={id}
          gradientUnits={"userSpaceOnUse"}
          initial={{
            x1: sx,
            x2: sx,
            y1: sy,
            y2: sy,
          }}
          animate={{
            x1: gradientCoordinates.x1,
            x2: gradientCoordinates.x2,
            y1: gradientCoordinates.y1,
            y2: gradientCoordinates.y2,
          }}
          transition={{
            delay,
            duration,
            ease: [0.16, 1, 0.3, 1],
            repeat,
            repeatDelay,
          }}
        >
          <stop stopColor={gradientStartColor} stopOpacity="0" />
          <stop stopColor={gradientStartColor} stopOpacity="1" />
          <stop offset="35%" stopColor="#38bdf8" stopOpacity="1" />
          <stop offset="70%" stopColor={gradientStopColor} stopOpacity="1" />
          <stop offset="100%" stopColor={gradientStopColor} stopOpacity="0" />
        </motion.linearGradient>
      </defs>
    </svg>
  )
}
