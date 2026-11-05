import React, { useEffect, useRef, useState } from 'react'

type BrainRegion =
  | 'frontal'
  | 'parietal'
  | 'occipital'
  | 'temporal'
  | 'cerebellum'
  | 'stem'
  | 'deep'

interface BrainVertex {
  x: number
  y: number
  z: number
  nx: number
  ny: number
  nz: number
  region: BrainRegion
  baseRadius: number
  isHub: boolean
  isSignalNode: boolean // Luminous electric-cyan / mint-green active data node
  clusterWeight: number // Local density weight for additive bloom
}

interface BrainEdge {
  a: number
  b: number
  region: BrainRegion
  weight: number // 0.35 (fine plexus filament) to 1.0 (primary structural edge)
  isDeep: boolean
}

interface SynapticPulse {
  edgeIdx: number
  t: number
  speed: number
  direction: 1 | -1
  isMint: boolean
}

interface SynapticWave {
  originX: number
  originY: number
  originZ: number
  startTime: number
}

function normalize3(
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  const len = Math.hypot(x, y, z) || 1
  return [x / len, y / len, z / len]
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * 3D Cortical Gyri / Sulci Folding Field
 * Creates organic cortical ridges (+1) and sulcal grooves (-1) in 3D space.
 */
function corticalGyriField(x: number, y: number, z: number): number {
  const f1 = Math.sin(x * 11.5 + y * 8.5 + Math.sin(z * 10.0) * 1.2)
  const f2 = Math.cos(y * 13.0 - z * 11.0 + Math.sin(x * 9.5) * 1.1)
  const f3 = Math.sin((x * 8.4 - y * 10.2 + z * 12.5) * 1.2)
  return f1 * 0.45 + f2 * 0.35 + f3 * 0.2
}

/**
 * Sculpted 3D Anatomical Envelope for a Cerebral Hemisphere
 * Maps a unit hemisphere point (ux, uy, uz) where ux in [-1, 1], uy in [-1, 1], uz in [0, 1]
 * onto a true 3D anatomical cerebral hemisphere (Frontal, Parietal, Occipital, Temporal lobes)
 * with zero pole pinching and smooth organic contours.
 */
function mapToCerebralHemisphere(
  ux: number,
  uy: number,
  uz: number,
  side: 1 | -1,
): {
  x: number
  y: number
  z: number
  nx: number
  ny: number
  nz: number
  region: BrainRegion
  gyri: number
} {
  // Normalize direction on the unit half-sphere (uz >= 0)
  const [dx, dy, dz] = normalize3(ux, uy, Math.max(0.02, uz))

  // Recover exact spherical surface parameters (u, v) from isotropic Fibonacci point (dx, dy, dz)
  const theta = Math.acos(Math.max(-1, Math.min(1, -dx)))
  const u = theta / Math.PI
  const sinT = Math.sin(theta)

  const phi = Math.atan2(dz, -dy) // 0 = dorsal midline, PI/2 = lateral equator, PI = ventral base
  const v = phi / Math.PI
  const sinP = Math.sin(phi)
  const cosP = Math.cos(phi)

  // Vertical interpolation parameter crossT in [0 (dorsal vault), 1 (ventral base)]
  const crossT = 0.5 - 0.5 * cosP

  // 1. Longitudinal X coordinate (-1.05 frontal pole to +1.05 occipital pole)
  let x = dx * 1.05

  // 2. Anatomical Dorsal Vault (yTop) & Ventral Base (yBot)
  const yTop = -Math.pow(sinT, 0.85) * (0.78 + 0.06 * Math.sin(theta - 0.2))

  // Temporal lobe ventral pouch (u = 0.20..0.80), orbital frontal base, & tentorial occipital notch
  const temporalEnv =
    smoothstep(0.18, 0.34, u) * (1 - smoothstep(0.62, 0.84, u))
  const orbitalBase = 0.1 - 0.05 * (1 - u)
  const tentorialRise = 0.09 * smoothstep(0.68, 0.96, u)
  const yBot = orbitalBase + 0.3 * temporalEnv - tentorialRise

  // Rounded interhemispheric longitudinal fissure indentation along dorsal midline (v -> 0)
  const fissureIndent = 0.085 * Math.exp(-Math.pow(v / 0.14, 2)) * sinT

  let y =
    yTop * (1 - crossT) +
    yBot * crossT +
    fissureIndent -
    0.045 * sinP * sinT

  // Pronounced anterior temporal pole hook under the Sylvian cleft
  const tempPoleHook =
    -0.16 *
    Math.exp(-Math.pow((u - 0.29) / 0.095, 2)) *
    smoothstep(0.5, 0.68, v) *
    (1 - smoothstep(0.88, 1.0, v))
  const sylvianNotchY =
    -0.05 *
    Math.exp(-Math.pow((u - 0.24) / 0.08, 2)) *
    Math.exp(-Math.pow((v - 0.48) / 0.08, 2))

  x += tempPoleHook
  y += sylvianNotchY

  // 3. Lateral 3D Dome Width (Z) + Sylvian Fissure Indentation
  const baseWidth =
    Math.pow(sinT, 0.68) * (0.54 + 0.13 * Math.sin(theta - 0.25))
  const latCurve = Math.pow(sinP, 0.76)

  const tempLatBulge =
    0.18 *
    temporalEnv *
    smoothstep(0.44, 0.64, v) *
    (1 - smoothstep(0.85, 1.0, v))
  const sylvianValley =
    0.095 * temporalEnv * Math.exp(-Math.pow((v - 0.48) / 0.058, 2))

  const medialGap = 0.03 + 0.012 * (1 - sinT)
  let z =
    side *
    (medialGap + baseWidth * latCurve + tempLatBulge - sylvianValley)

  // Outward 3D normal
  const [nx, ny, nz] = normalize3(
    dx * 0.72,
    -cosP * 0.95,
    side * (0.2 + sinP * 1.15),
  )

  // Organic 3D cortical gyri / sulci relief
  const gyri = corticalGyriField(x, y, z)
  const disp = gyri * 0.024 * sinT
  x += nx * disp
  y += ny * disp
  z += nz * disp

  // Anatomical lobe classification
  const isTemporal = u > 0.2 && u < 0.74 && v > 0.48 && v < 0.94
  const region: BrainRegion = isTemporal
    ? 'temporal'
    : u < 0.42
      ? 'frontal'
      : u < 0.74
        ? 'parietal'
        : 'occipital'

  return { x, y, z, nx, ny, nz, region, gyri }
}

/**
 * Builds an isotropic, true 3D Volumetric Neural Plexus & Point-Cloud Brain:
 * - Uses Fibonacci Golden-Spiral point distribution on each hemisphere so there is ZERO pole-pinching
 *   and ZERO rigid horizontal/vertical grid lines.
 * - Connects nodes via 3D k-Nearest-Neighbor (KNN) proximity plexus interconnects with localized
 *   lobe clustering, distinct bi-hemispheric cerebellum, brainstem, and deep internal limbic pathways.
 */
function buildVolumetricPlexusBrain(): {
  vertices: BrainVertex[]
  edges: BrainEdge[]
  bloomAnchorIds: number[]
} {
  const vertices: BrainVertex[] = []
  const edges: BrainEdge[] = []
  const bloomAnchorIds: number[] = []
  const edgeSet = new Set<string>()

  const addVertex = (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    region: BrainRegion,
    baseRadius: number,
    isHub: boolean,
    isSignalNode: boolean,
    clusterWeight = 0.5,
  ): number => {
    const [unx, uny, unz] = normalize3(nx, ny, nz)
    const id = vertices.length
    vertices.push({
      x,
      y,
      z,
      nx: unx,
      ny: uny,
      nz: unz,
      region,
      baseRadius,
      isHub,
      isSignalNode,
      clusterWeight,
    })
    return id
  }

  const addEdge = (
    a: number,
    b: number,
    region: BrainRegion,
    weight = 0.8,
    isDeep = false,
  ) => {
    if (a === b) return
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (edgeSet.has(key)) return
    edgeSet.add(key)
    edges.push({ a, b, region, weight, isDeep })
  }

  /**
   * Connects a group of 3D vertices into an organic 3D KNN proximity plexus network.
   */
  const connectKNNPlexus = (
    nodeIds: number[],
    kNeighbors: number,
    maxDist: number,
    isDeep = false,
  ) => {
    for (let i = 0; i < nodeIds.length; i += 1) {
      const idA = nodeIds[i]
      const va = vertices[idA]
      const candidates: Array<{ id: number; dist: number }> = []

      for (let j = 0; j < nodeIds.length; j += 1) {
        if (i === j) continue
        const idB = nodeIds[j]
        const vb = vertices[idB]
        const dist = Math.hypot(va.x - vb.x, va.y - vb.y, va.z - vb.z)
        if (dist <= maxDist) {
          candidates.push({ id: idB, dist })
        }
      }

      candidates.sort((m, n) => m.dist - n.dist)
      const count = Math.min(kNeighbors, candidates.length)
      for (let c = 0; c < count; c += 1) {
        const cand = candidates[c]
        const distRatio = 1 - cand.dist / maxDist
        const weight = Math.max(0.35, Math.min(1.0, 0.45 + distRatio * 0.55))
        addEdge(idA, cand.id, va.region, weight, isDeep)
      }
    }
  }

  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  const hemiNodes: Record<1 | -1, number[]> = { 1: [], '-1': [] }
  const medialNodes: Record<1 | -1, number[]> = { 1: [], '-1': [] }

  // =========================================================================
  // 1. 3D CEREBRAL CORTEX OUTER SHELL (Isotropic Fibonacci Point Cloud + Lobe Clusters)
  //    235 nodes per hemisphere (470 cortical nodes total) with zero pole pinching
  // =========================================================================
  const pointsPerHemisphere = 235

  for (const side of [1, -1] as const) {
    for (let i = 0; i < pointsPerHemisphere; i += 1) {
      // Fibonacci distribution on a unit half-sphere (uz >= 0)
      const t = (i + 0.5) / pointsPerHemisphere
      // Bias slightly toward the outer/lateral and silhouette rim for crisp 3D volume definition
      const uz = Math.pow(1 - t, 0.78)
      const ringRadius = Math.sqrt(Math.max(0, 1 - uz * uz))
      const angle = i * goldenAngle + (side === 1 ? 0 : 0.62)

      // Deterministic subtle organic jitter so nodes cluster along cortical gyri
      const jitterA = Math.sin(i * 19.7 + side * 3.1) * 0.055
      const ux = Math.cos(angle + jitterA) * ringRadius
      const uy = Math.sin(angle + jitterA) * ringRadius

      const mapped = mapToCerebralHemisphere(ux, uy, uz, side)

      const isHub = i % 7 === 0 || (mapped.gyri > 0.48 && i % 4 === 0)
      const isSignalNode =
        i % 13 === 0 || (isHub && (i + (side === 1 ? 0 : 2)) % 5 === 0)
      const radius = isSignalNode
        ? 2.35
        : isHub
          ? 1.95
          : mapped.gyri > 0.2
            ? 1.45
            : 1.15
      const clusterWeight = isHub
        ? 0.95
        : 0.45 + Math.max(0, mapped.gyri) * 0.4

      const id = addVertex(
        mapped.x,
        mapped.y,
        mapped.z,
        mapped.nx,
        mapped.ny,
        mapped.nz,
        mapped.region,
        radius,
        isHub,
        isSignalNode,
        clusterWeight,
      )
      hemiNodes[side].push(id)

      if (Math.abs(mapped.z) < 0.14 && mapped.y < 0.05) {
        medialNodes[side].push(id)
      }
      if (isHub && i % 21 === 0) {
        bloomAnchorIds.push(id)
      }
    }

    // Add localized high-density cortical cluster nodes in key anatomical hubs
    // (Prefrontal executive pole, Temporal language hub, Parietal crown, Occipital visual pole)
    const lobeHubDirections: Array<[number, number, number]> = [
      [-0.82, -0.22, 0.52], // Prefrontal dorsolateral hub
      [-0.52, -0.68, 0.52], // Frontal motor strip hub
      [-0.22, 0.48, 0.84], // Anterior Temporal pole cluster
      [0.12, 0.34, 0.92], // Superior Temporal / Sylvian cluster
      [0.24, -0.78, 0.58], // Parietal association crown
      [0.84, -0.18, 0.5], // Occipital visual cortex cluster
    ]

    lobeHubDirections.forEach(([bx, by, bz], cIdx) => {
      for (let k = 0; k < 7; k += 1) {
        const subAng = (k / 7) * Math.PI * 2 + cIdx
        const spread = 0.08 + (k % 3) * 0.045
        const mapped = mapToCerebralHemisphere(
          bx + Math.cos(subAng) * spread,
          by + Math.sin(subAng) * spread,
          bz + 0.05,
          side,
        )
        const isSignal = k === 0 || k === 3
        const id = addVertex(
          mapped.x,
          mapped.y,
          mapped.z,
          mapped.nx,
          mapped.ny,
          mapped.nz,
          mapped.region,
          isSignal ? 2.4 : 1.75,
          k === 0,
          isSignal,
          1.0,
        )
        hemiNodes[side].push(id)
        if (k === 0) bloomAnchorIds.push(id)
      }
    })

    // Connect each hemisphere into an intricate 3D KNN proximity plexus (k = 6 nearest neighbors)
    connectKNNPlexus(hemiNodes[side], 6, 0.31, false)
  }

  // Interhemispheric commissural fibers bridging the longitudinal fissure
  for (let i = 0; i < medialNodes[1].length; i += 2) {
    const idL = medialNodes[1][i]
    const vL = vertices[idL]
    let bestR = -1
    let bestDist = 0.28
    for (let j = 0; j < medialNodes[-1].length; j += 1) {
      const idR = medialNodes[-1][j]
      const vR = vertices[idR]
      const d = Math.hypot(vL.x - vR.x, vL.y - vR.y, vL.z - vR.z)
      if (d < bestDist) {
        bestDist = d
        bestR = idR
      }
    }
    if (bestR !== -1) {
      addEdge(idL, bestR, 'deep', 0.45, true)
    }
  }

  // =========================================================================
  // 2. DEEP INTERNAL 3D NEURAL PATHWAYS (Hippocampus, Corpus Callosum, Thalamus)
  //    Suspended inside the 3D volume so the viewer looks *through* the outer cortex
  // =========================================================================
  const thalamicHubs: Record<1 | -1, number[]> = { 1: [], '-1': [] }

  for (const side of [1, -1] as const) {
    const deepSideNodes: number[] = []

    // 2A. Corpus Callosum & Cingulate Inner Arch (15 nodes per side)
    const callosalArch: number[] = []
    for (let k = 0; k < 15; k += 1) {
      const t = k / 14
      const ang = (0.14 + t * 0.74) * Math.PI
      const x = -Math.cos(ang) * 0.58 - 0.03
      const y = -Math.sin(ang) * 0.37 - 0.03
      const z = side * (0.075 + 0.055 * Math.sin(t * Math.PI))
      const [nx, ny, nz] = normalize3(-Math.cos(ang), -Math.sin(ang), side * 0.5)
      const isSignal = k % 4 === 1
      const id = addVertex(
        x,
        y,
        z,
        nx,
        ny,
        nz,
        'deep',
        isSignal ? 2.15 : 1.5,
        k % 3 === 0,
        isSignal,
        0.85,
      )
      callosalArch.push(id)
      deepSideNodes.push(id)
      if (k > 0) addEdge(callosalArch[k - 1], id, 'deep', 0.76, true)
    }

    // 2B. Hippocampal -> Fornix -> Amygdala Deep Limbic Spiral (16 nodes per side)
    const hippoLoop: number[] = []
    for (let k = 0; k < 16; k += 1) {
      const t = k / 15
      const ang = t * Math.PI * 1.28 - 0.28
      const x = -0.05 + Math.sin(ang) * 0.35
      const y = 0.09 + Math.cos(ang) * 0.23
      const z = side * (0.14 + 0.14 * Math.sin(t * Math.PI))
      const [nx, ny, nz] = normalize3(Math.sin(ang), Math.cos(ang), side * 0.8)
      const isSignal = k === 0 || k === 5 || k === 10 || k === 14
      const id = addVertex(
        x,
        y,
        z,
        nx,
        ny,
        nz,
        'deep',
        isSignal ? 2.25 : 1.55,
        k % 3 === 0,
        isSignal,
        0.9,
      )
      hippoLoop.push(id)
      deepSideNodes.push(id)
      if (k > 0) addEdge(hippoLoop[k - 1], id, 'deep', 0.8, true)
    }

    // 2C. Thalamic & Basal Ganglia Core Relay Cluster (10 dense inner nodes per side)
    for (let k = 0; k < 10; k += 1) {
      const ang = (k / 10) * Math.PI * 2
      const x = -0.03 + Math.cos(ang) * 0.17
      const y = -0.01 + Math.sin(ang) * 0.12
      const z = side * (0.11 + (k % 2) * 0.065)
      const isSignal = k % 2 === 0
      const id = addVertex(
        x,
        y,
        z,
        0,
        -0.25,
        side,
        'deep',
        isSignal ? 2.4 : 1.85,
        true,
        isSignal,
        1.0,
      )
      thalamicHubs[side].push(id)
      deepSideNodes.push(id)
      if (k === 0 || k === 5) bloomAnchorIds.push(id)
    }

    connectKNNPlexus(deepSideNodes, 4, 0.26, true)

    // 2D. Corona Radiata / Thalamocortical Projection Fibers radiating to the outer cortex
    const hList = hemiNodes[side]
    for (let i = 0; i < hList.length; i += 10) {
      const corticalId = hList[i]
      const thalId =
        thalamicHubs[side][Math.floor(i / 10) % thalamicHubs[side].length]
      addEdge(thalId, corticalId, 'deep', 0.4, true)
    }
  }

  // Cross-midline thalamic commissures
  for (let k = 0; k < thalamicHubs[1].length; k += 2) {
    addEdge(thalamicHubs[1][k], thalamicHubs[-1][k], 'deep', 0.58, true)
  }

  // =========================================================================
  // 3. 3D BI-HEMISPHERIC CEREBELLUM (High-density posterior-inferior plexus)
  //    72 nodes per hemisphere (144 total) for distinct cerebellar cluster density
  // =========================================================================
  const cerebPtsPerSide = 72
  const cerebNodes: Record<1 | -1, number[]> = { 1: [], '-1': [] }

  for (const side of [1, -1] as const) {
    for (let i = 0; i < cerebPtsPerSide; i += 1) {
      const t = (i + 0.5) / cerebPtsPerSide
      const uz = Math.pow(1 - t, 0.75)
      const ringR = Math.sqrt(Math.max(0, 1 - uz * uz))
      const ang = i * goldenAngle + (side === 1 ? 0.2 : 0.9)

      const ux = Math.cos(ang) * ringR
      const uy = Math.sin(ang) * ringR

      // Sculpted cerebellar hemisphere with horizontal folia waves
      const folia = Math.cos(uy * 14) * 0.015
      const x = 0.52 + ux * 0.33 + folia
      const y = 0.39 + uy * 0.21
      const z = side * (0.035 + Math.pow(uz, 0.8) * 0.36)

      const [nx, ny, nz] = normalize3(ux, uy + 0.1, side * (0.3 + uz))
      const isHub = i % 6 === 0
      const isSignal = i % 11 === 0
      const id = addVertex(
        x,
        y,
        z,
        nx,
        ny,
        nz,
        'cerebellum',
        isSignal ? 2.15 : isHub ? 1.75 : 1.25,
        isHub,
        isSignal,
        0.85,
      )
      cerebNodes[side].push(id)
      if (i === 0 || i === 24) bloomAnchorIds.push(id)
    }

    // Dense local KNN plexus inside each cerebellar lobe
    connectKNNPlexus(cerebNodes[side], 6, 0.22, false)

    // Cerebellar peduncle tracts connecting into deep thalamus
    addEdge(cerebNodes[side][0], thalamicHubs[side][2], 'deep', 0.58, true)
    addEdge(cerebNodes[side][12], thalamicHubs[side][6], 'deep', 0.52, true)
  }

  // Vermis midline connections between left and right cerebellar hemispheres
  for (let i = 0; i < 12; i += 2) {
    const idL = cerebNodes[1][cerebPtsPerSide - 1 - i]
    const idR = cerebNodes[-1][cerebPtsPerSide - 1 - i]
    addEdge(idL, idR, 'cerebellum', 0.65, false)
  }

  // =========================================================================
  // 4. 3D BRAINSTEM COLUMN (Midbrain -> Pons belly -> Medulla Oblongata)
  // =========================================================================
  const stemLevels = [
    { y: 0.18, xCenter: 0.01, rx: 0.145, rz: 0.175, ponsBulge: 0.02 },
    { y: 0.29, xCenter: 0.032, rx: 0.152, rz: 0.182, ponsBulge: 0.068 },
    { y: 0.4, xCenter: 0.055, rx: 0.142, rz: 0.168, ponsBulge: 0.06 },
    { y: 0.51, xCenter: 0.082, rx: 0.122, rz: 0.142, ponsBulge: 0.025 },
    { y: 0.62, xCenter: 0.11, rx: 0.102, rz: 0.122, ponsBulge: 0.0 },
    { y: 0.74, xCenter: 0.135, rx: 0.088, rz: 0.104, ponsBulge: 0.0 },
    { y: 0.86, xCenter: 0.158, rx: 0.075, rz: 0.09, ponsBulge: 0.0 },
  ]
  const ringPts = 11
  const stemRings: number[][] = []
  const allStemIds: number[] = []

  stemLevels.forEach((lvl, rIdx) => {
    const ring: number[] = []
    for (let k = 0; k < ringPts; k += 1) {
      const ang = (k / ringPts) * Math.PI * 2 + (rIdx % 2) * 0.28
      const cosA = Math.cos(ang)
      const sinA = Math.sin(ang)
      const antBulge = cosA < 0 ? -cosA * lvl.ponsBulge : 0
      const x = lvl.xCenter + cosA * (lvl.rx + antBulge)
      const z = sinA * lvl.rz
      const [nx, ny, nz] = normalize3(cosA, 0.1, sinA)
      const isHub = (rIdx + k) % 3 === 0
      const isSignal = (rIdx * 3 + k) % 4 === 0
      const id = addVertex(
        x,
        lvl.y,
        z,
        nx,
        ny,
        nz,
        'stem',
        isSignal ? 2.2 : isHub ? 1.75 : 1.3,
        isHub,
        isSignal,
        0.8,
      )
      ring.push(id)
      allStemIds.push(id)
      if (rIdx === 2 && k === 2) bloomAnchorIds.push(id)
    }
    stemRings.push(ring)
  })

  connectKNNPlexus(allStemIds, 5, 0.21, false)

  // Connect midbrain (top of brainstem) into left & right thalamic hubs & cerebellum
  for (let k = 0; k < ringPts; k += 2) {
    const topStemId = stemRings[0][k]
    const side: 1 | -1 = k < ringPts / 2 ? 1 : -1
    addEdge(
      topStemId,
      thalamicHubs[side][k % thalamicHubs[side].length],
      'deep',
      0.72,
      true,
    )
  }

  return { vertices, edges, bloomAnchorIds }
}

const BRAIN_PLEXUS = buildVolumetricPlexusBrain()

// NovaGrid & Holographic Plexus Color Palette
const REGION_FG_RGB: Record<BrainRegion, [number, number, number]> = {
  frontal: [192, 122, 255], // Luminous Electric Violet
  parietal: [214, 164, 255], // Crisp Lavender
  occipital: [182, 154, 255], // Periwinkle Violet
  temporal: [202, 140, 255], // Orchid Violet
  cerebellum: [224, 178, 255], // Bright Cerebellar Orchid
  stem: [20, 241, 148], // Electric Mint-Green Signal
  deep: [152, 205, 255], // Ethereal Cyan-Lavender Internal Tract
}

const REGION_BG_RGB: Record<BrainRegion, [number, number, number]> = {
  frontal: [82, 36, 146], // Deep Indigo-Violet (Far Z)
  parietal: [92, 44, 156],
  occipital: [76, 40, 140],
  temporal: [86, 38, 150],
  cerebellum: [96, 46, 160],
  stem: [16, 114, 86],
  deep: [68, 48, 142],
}

export function HeroNeuralGraph(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isHovered, setIsHovered] = useState(false)
  const pointerRef = useRef<{
    active: boolean
    normX: number
    normY: number
    canvasX: number
    canvasY: number
    rotY: number
    rotX: number
    waves: SynapticWave[]
    rafId: number
  }>({
    active: false,
    normX: 0,
    normY: 0,
    canvasX: -999,
    canvasY: -999,
    // Signature 3/4 3D oblique perspective angle from Version 1
    rotY: -0.36,
    rotX: -0.17,
    waves: [],
    rafId: 0,
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    // 72 Synaptic firing pulses (neon mint-green & electric lavender) traveling along plexus edges
    const pulses: SynapticPulse[] = Array.from({ length: 72 }, (_, idx) => ({
      edgeIdx: (idx * 37) % BRAIN_PLEXUS.edges.length,
      t: (idx * 0.071) % 1,
      speed: 0.009 + (idx % 7) * 0.0024,
      direction: idx % 2 === 0 ? 1 : -1,
      isMint: idx % 3 !== 0, // Majority neon-green active data pulses
    }))

    const state = pointerRef.current

    const render = (now: number) => {
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

      const cx = width * 0.5
      const cy = height * 0.49
      const scale = Math.min(width, height) * 0.38

      const ptr = pointerRef.current

      // Prune finished click-triggered synaptic waves
      ptr.waves = ptr.waves.filter((w) => now - w.startTime < 2200)

      // Smooth, gentle continuous 3D yaw/pitch orbital rotation + cursor parallax reaction
      if (!prefersReducedMotion) {
        const autoYaw = -0.34 + Math.sin(now * 0.00046) * 0.32
        const autoPitch = -0.16 + Math.cos(now * 0.00035) * 0.085
        const targetY = ptr.active ? -0.22 + ptr.normX * 0.68 : autoYaw
        const targetX = ptr.active ? -0.15 + ptr.normY * 0.38 : autoPitch
        ptr.rotY += (targetY - ptr.rotY) * 0.06
        ptr.rotX += (targetX - ptr.rotX) * 0.06
      }

      const rotY = ptr.rotY
      const rotX = ptr.rotX

      // 1. Deep Violet/Indigo Volumetric Ambient Halo behind the 3D Plexus
      const ambientGrad = ctx.createRadialGradient(
        cx,
        cy,
        scale * 0.05,
        cx,
        cy,
        scale * 1.18,
      )
      ambientGrad.addColorStop(
        0,
        ptr.active ? 'rgba(138, 68, 235, 0.22)' : 'rgba(116, 52, 204, 0.16)',
      )
      ambientGrad.addColorStop(0.45, 'rgba(68, 28, 128, 0.09)')
      ambientGrad.addColorStop(1, 'rgba(4, 3, 8, 0)')
      ctx.fillStyle = ambientGrad
      ctx.beginPath()
      ctx.arc(cx, cy, scale * 1.18, 0, Math.PI * 2)
      ctx.fill()

      // 2. Project 3D Vertices & Compute True Z-Axis Depth Cueing + Synaptic Wave Excitation
      const cosY = Math.cos(rotY)
      const sinY = Math.sin(rotY)
      const cosX = Math.cos(rotX)
      const sinX = Math.sin(rotX)
      const fov = 2.65

      const projected = BRAIN_PLEXUS.vertices.map((v) => {
        const x1 = v.x * cosY - v.z * sinY
        const z1 = v.z * cosY + v.x * sinY
        const y2 = v.y * cosX - z1 * sinX
        const z2 = z1 * cosX + v.y * sinX

        const nx1 = v.nx * cosY - v.nz * sinY
        const nz1 = v.nz * cosY + v.nx * sinY
        const ny2 = v.ny * cosX - nz1 * sinX
        const nz2 = nz1 * cosX + v.ny * sinX

        const perspective = fov / (fov - z2 * 0.78)
        let sx = cx + x1 * scale * perspective
        let sy = cy + y2 * scale * perspective

        // Normalized depth in [0 (far back Z), 1 (foreground Z)]
        const depthNorm = Math.max(0, Math.min(1, (z2 + 0.78) / 1.56))

        // Subtle cursor hover excitation
        let hoverEnergy = 0
        if (ptr.active) {
          const dx = ptr.canvasX - sx
          const dy = ptr.canvasY - sy
          const dist = Math.hypot(dx, dy)
          const radius = 125
          if (dist < radius) {
            hoverEnergy =
              Math.pow(1 - dist / radius, 1.65) * (0.45 + 0.55 * depthNorm)
            sx += nx1 * hoverEnergy * 5.2
            sy += ny2 * hoverEnergy * 5.2
          }
        }

        // Interactive 3D Synaptic Ripple Waves expanding from clicked cortex coordinate
        let waveEnergy = 0
        for (let wIdx = 0; wIdx < ptr.waves.length; wIdx += 1) {
          const w = ptr.waves[wIdx]
          const elapsed = (now - w.startTime) * 0.001
          const waveRadius = elapsed * 1.65
          const dist3D = Math.hypot(
            v.x - w.originX,
            v.y - w.originY,
            v.z - w.originZ,
          )
          const ringDelta = Math.abs(dist3D - waveRadius)
          if (ringDelta < 0.26) {
            const fade = Math.max(0, 1 - elapsed / 2.1)
            const pulse = Math.cos((ringDelta / 0.26) * (Math.PI * 0.5))
            waveEnergy = Math.max(waveEnergy, pulse * fade)
          }
        }

        const totalEnergy = Math.min(1, hoverEnergy + waveEnergy * 0.95)

        return {
          sx,
          sy,
          z: z2,
          depthNorm,
          nx: nx1,
          ny: ny2,
          nz: nz2,
          perspective,
          totalEnergy,
          waveEnergy,
          v,
        }
      })

      // 3. Emissive Holographic Bloom around Dense Node Clusters (Additive Blending)
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < BRAIN_PLEXUS.bloomAnchorIds.length; i += 1) {
        const p = projected[BRAIN_PLEXUS.bloomAnchorIds[i]]
        const bloomAlpha =
          (0.028 + p.depthNorm * 0.05 + p.totalEnergy * 0.085) *
          p.v.clusterWeight
        const bloomRadius = scale * (0.17 + p.depthNorm * 0.075) * p.perspective
        const grad = ctx.createRadialGradient(
          p.sx,
          p.sy,
          0,
          p.sx,
          p.sy,
          bloomRadius,
        )
        if (p.v.isSignalNode || p.waveEnergy > 0.25) {
          grad.addColorStop(0, `rgba(20, 241, 148, ${bloomAlpha.toFixed(3)})`)
          grad.addColorStop(
            0.5,
            `rgba(175, 99, 255, ${(bloomAlpha * 0.5).toFixed(3)})`,
          )
        } else {
          grad.addColorStop(0, `rgba(175, 99, 255, ${bloomAlpha.toFixed(3)})`)
          grad.addColorStop(
            0.55,
            `rgba(118, 56, 205, ${(bloomAlpha * 0.45).toFixed(3)})`,
          )
        }
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(p.sx, p.sy, bloomRadius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      // 4. Sort & Render All 3D Plexus Edges Back-to-Front with True Z-Depth Cueing
      //    Back-Z edges: opacity 0.14–0.24, darker indigo-violet, thin (0.42px)
      //    Front-Z edges: opacity 0.68–0.92, bright neon purple/lavender/mint, crisp (0.85–1.3px)
      const sortedEdges = BRAIN_PLEXUS.edges
        .map((edge) => {
          const pa = projected[edge.a]
          const pb = projected[edge.b]
          return {
            edge,
            pa,
            pb,
            depth: (pa.z + pb.z) * 0.5,
            depthNorm: (pa.depthNorm + pb.depthNorm) * 0.5,
          }
        })
        .sort((m, n) => m.depth - n.depth)

      for (let i = 0; i < sortedEdges.length; i += 1) {
        const { edge, pa, pb, depthNorm } = sortedEdges[i]
        const energy = Math.max(pa.totalEnergy, pb.totalEnergy)
        const wave = Math.max(pa.waveEnergy, pb.waveEnergy)

        const fg = REGION_FG_RGB[edge.region]
        const bg = REGION_BG_RGB[edge.region]

        // Smooth depth interpolation of hue from dark indigo-violet (back) to luminous violet/lavender (front)
        const colorMix = Math.pow(depthNorm, 1.15)
        let r = Math.round(bg[0] + (fg[0] - bg[0]) * colorMix)
        let g = Math.round(bg[1] + (fg[1] - bg[1]) * colorMix)
        let b = Math.round(bg[2] + (fg[2] - bg[2]) * colorMix)

        // True depth-cued opacity: 0.15 at back Z up to 0.85+ at foreground Z
        let alpha: number
        if (edge.isDeep) {
          // Faint internal neural pathways (hippocampus / thalamus / corpus callosum) visible inside volume
          alpha = (0.14 + Math.pow(depthNorm, 1.2) * 0.28) * edge.weight
        } else {
          alpha =
            (0.14 + Math.pow(depthNorm, 1.65) * 0.72) *
            (0.55 + edge.weight * 0.45)
        }

        if (wave > 0.08) {
          // Synaptic click wave shifts filaments toward electric mint-green & white
          r = Math.round(r * (1 - wave) + 45 * wave)
          g = Math.round(g * (1 - wave) + 248 * wave)
          b = Math.round(b * (1 - wave) + 178 * wave)
          alpha = Math.min(0.96, alpha + wave * 0.45)
        } else if (energy > 0.08) {
          r = Math.min(255, Math.round(r + (245 - r) * energy * 0.65))
          g = Math.min(255, Math.round(g + (247 - g) * energy * 0.65))
          b = Math.min(255, Math.round(b + (255 - b) * energy * 0.65))
          alpha = Math.min(0.95, alpha + energy * 0.35)
        }

        const lineWidth = edge.isDeep
          ? 0.42 + depthNorm * 0.42 + energy * 0.55
          : 0.42 + Math.pow(depthNorm, 1.4) * 0.82 + energy * 0.72

        ctx.beginPath()
        ctx.moveTo(pa.sx, pa.sy)
        ctx.lineTo(pb.sx, pb.sy)
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`
        ctx.lineWidth = lineWidth
        ctx.stroke()
      }

      // 5. Periodic Synaptic Firing Pulses with Additive Glow (Neon Mint-Green & Electric Lavender)
      if (!prefersReducedMotion) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        const speedBoost = ptr.active ? 1.45 : 1.0

        for (let i = 0; i < pulses.length; i += 1) {
          const p = pulses[i]
          p.t += p.speed * speedBoost * p.direction
          if (p.t > 1) {
            p.t = 0
            p.edgeIdx = (p.edgeIdx + 29) % BRAIN_PLEXUS.edges.length
          } else if (p.t < 0) {
            p.t = 1
            p.edgeIdx = (p.edgeIdx + 37) % BRAIN_PLEXUS.edges.length
          }

          const edge = BRAIN_PLEXUS.edges[p.edgeIdx]
          const pa = projected[edge.a]
          const pb = projected[edge.b]
          const depthNorm = pa.depthNorm + (pb.depthNorm - pa.depthNorm) * p.t

          // Depth-cued pulse visibility (pulses at back of brain are dimmer, foreground pulses blaze)
          const pulseAlpha = 0.22 + Math.pow(depthNorm, 1.3) * 0.76
          const px = pa.sx + (pb.sx - pa.sx) * p.t
          const py = pa.sy + (pb.sy - pa.sy) * p.t
          const tailT = Math.max(0, Math.min(1, p.t - p.direction * 0.24))
          const tx = pa.sx + (pb.sx - pa.sx) * tailT
          const ty = pa.sy + (pb.sy - pa.sy) * tailT
          const pScale = pa.perspective + (pb.perspective - pa.perspective) * p.t

          // Glowing comet trail along the edge vector
          const trailGrad = ctx.createLinearGradient(tx, ty, px, py)
          trailGrad.addColorStop(0, 'rgba(20, 241, 148, 0)')
          trailGrad.addColorStop(
            1,
            p.isMint
              ? `rgba(20, 241, 148, ${(pulseAlpha * 0.85).toFixed(3)})`
              : `rgba(216, 180, 254, ${(pulseAlpha * 0.8).toFixed(3)})`,
          )
          ctx.beginPath()
          ctx.moveTo(tx, ty)
          ctx.lineTo(px, py)
          ctx.strokeStyle = trailGrad
          ctx.lineWidth = (1.1 + depthNorm * 1.1) * pScale
          ctx.stroke()

          // Outer pulse halo
          ctx.beginPath()
          ctx.arc(px, py, (2.6 + depthNorm * 2.4) * pScale, 0, Math.PI * 2)
          ctx.fillStyle = p.isMint
            ? `rgba(20, 241, 148, ${(pulseAlpha * 0.34).toFixed(3)})`
            : `rgba(175, 99, 255, ${(pulseAlpha * 0.34).toFixed(3)})`
          ctx.fill()

          // Bright core spark
          ctx.beginPath()
          ctx.arc(px, py, (0.95 + depthNorm * 0.85) * pScale, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(245, 247, 255, ${pulseAlpha.toFixed(3)})`
          ctx.fill()
        }
        ctx.restore()
      }

      // 6. Render 3D Volumetric Point-Cloud Nodes Back-to-Front with True Depth Cueing & Additive Glow
      const sortedNodes = projected
        .map((p, idx) => ({ p, idx }))
        .sort((m, n) => m.p.z - n.p.z)

      for (let i = 0; i < sortedNodes.length; i += 1) {
        const { p } = sortedNodes[i]
        const { v, depthNorm, totalEnergy, waveEnergy } = p

        const fg = REGION_FG_RGB[v.region]
        const bg = REGION_BG_RGB[v.region]
        const colorMix = Math.pow(depthNorm, 1.1)

        const r = Math.round(bg[0] + (fg[0] - bg[0]) * colorMix)
        const g = Math.round(bg[1] + (fg[1] - bg[1]) * colorMix)
        const b = Math.round(bg[2] + (fg[2] - bg[2]) * colorMix)

        // True Z-depth opacity: 0.16 at far back Z -> 0.95 at foreground Z
        const baseAlpha =
          v.region === 'deep'
            ? 0.2 + Math.pow(depthNorm, 1.2) * 0.55
            : 0.16 + Math.pow(depthNorm, 1.45) * 0.79
        const nodeAlpha = Math.min(0.98, baseAlpha + totalEnergy * 0.38)

        const depthScale = 0.56 + depthNorm * 0.56
        const radius =
          (v.baseRadius + totalEnergy * 1.65) *
          depthScale *
          (0.75 + p.perspective * 0.25)

        const isMintActive = v.isSignalNode || waveEnergy > 0.22

        // Soft glowing aura around foreground hub nodes & active mint signal nodes
        if ((v.isHub && depthNorm > 0.45) || isMintActive || totalEnergy > 0.15) {
          const haloRadius = radius * (isMintActive ? 3.1 : 2.5)
          const haloAlpha =
            nodeAlpha * (isMintActive ? 0.32 : 0.24) * (0.5 + depthNorm * 0.5)
          const haloGrad = ctx.createRadialGradient(
            p.sx,
            p.sy,
            radius * 0.2,
            p.sx,
            p.sy,
            haloRadius,
          )
          if (isMintActive) {
            haloGrad.addColorStop(0, `rgba(20, 241, 148, ${haloAlpha.toFixed(3)})`)
            haloGrad.addColorStop(1, 'rgba(20, 241, 148, 0)')
          } else {
            haloGrad.addColorStop(
              0,
              `rgba(${fg[0]}, ${fg[1]}, ${fg[2]}, ${haloAlpha.toFixed(3)})`,
            )
            haloGrad.addColorStop(1, `rgba(${fg[0]}, ${fg[1]}, ${fg[2]}, 0)`)
          }
          ctx.fillStyle = haloGrad
          ctx.beginPath()
          ctx.arc(p.sx, p.sy, haloRadius, 0, Math.PI * 2)
          ctx.fill()
        }

        // Primary node dot
        ctx.beginPath()
        ctx.arc(p.sx, p.sy, radius, 0, Math.PI * 2)
        if (isMintActive) {
          ctx.fillStyle =
            depthNorm > 0.55
              ? `rgba(20, 241, 148, ${nodeAlpha.toFixed(3)})`
              : `rgba(18, 175, 118, ${nodeAlpha.toFixed(3)})`
        } else {
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${nodeAlpha.toFixed(3)})`
        }
        ctx.fill()

        // Crisp specular core on foreground hubs & active nodes
        if ((v.isHub || isMintActive) && depthNorm > 0.52) {
          ctx.beginPath()
          ctx.arc(p.sx, p.sy, radius * 0.46, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(245, 247, 255, ${(nodeAlpha * 0.9).toFixed(3)})`
          ctx.fill()
        }
      }

      ctx.restore()
      state.rafId = window.requestAnimationFrame(render)
    }

    state.rafId = window.requestAnimationFrame(render)
    return () => {
      window.cancelAnimationFrame(state.rafId)
    }
  }, [])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const normX = (x / rect.width) * 2 - 1
    const normY = (y / rect.height) * 2 - 1

    pointerRef.current.active = true
    pointerRef.current.canvasX = x
    pointerRef.current.canvasY = y
    pointerRef.current.normX = normX
    pointerRef.current.normY = normY
    if (!isHovered) setIsHovered(true)
  }

  const handleMouseLeave = () => {
    pointerRef.current.active = false
    pointerRef.current.canvasX = -999
    pointerRef.current.canvasY = -999
    setIsHovered(false)
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const normY = ((e.clientY - rect.top) / rect.height) * 2 - 1

    // Map click into 3D cortex space so the synaptic ripple wave radiates from the clicked lobe
    const rotY = pointerRef.current.rotY
    const ox = normX * 0.85 * Math.cos(rotY)
    const oy = normY * 0.65
    const oz = 0.35

    pointerRef.current.waves.push({
      originX: ox,
      originY: oy,
      originZ: oz,
      startTime: performance.now(),
    })
  }

  return (
    <div
      className={`hero-brain-stage ${isHovered ? 'is-hovered' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      role="img"
      aria-label="Interactive 3D volumetric neural plexus brain. Move cursor to tilt and excite nodes; click to ripple a synaptic wave across the cortex."
    >
      <canvas ref={canvasRef} className="hero-brain-canvas" />
      <div className="hero-brain-caption font-mono">
        <span className="hero-brain-pulse-dot" aria-hidden="true" />
        <span>
          {isHovered
            ? '3D neural plexus active · Click to ripple a synaptic wave'
            : 'Move cursor to rotate 3D plexus & ignite connections'}
        </span>
      </div>
    </div>
  )
}
