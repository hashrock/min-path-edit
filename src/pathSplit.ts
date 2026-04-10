import type { Path, Point, Segment } from './types'

export interface Hit {
  pathIndex: number
  segmentIndex: number
  t: number
  point: Point
  distance: number
}

function clonePoint(p: Point): Point {
  return { x: p.x, y: p.y }
}

function cloneSegment(seg: Segment): Segment {
  return {
    x: seg.x,
    y: seg.y,
    in: seg.in ? clonePoint(seg.in) : null,
    out: seg.out ? clonePoint(seg.out) : null,
    mirror: seg.mirror,
  }
}

export function cubicBezierPoint(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number
): Point {
  const u = 1 - t
  const uu = u * u
  const uuu = uu * u
  const tt = t * t
  const ttt = tt * t
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  }
}

interface CubicSegment {
  p0: Point
  p1: Point
  p2: Point
  p3: Point
}

interface CubicSplitResult {
  left: CubicSegment
  right: CubicSegment
  mid: Point
}

/**
 * Split a cubic Bezier curve at parameter t using De Casteljau's algorithm.
 * Returns the two sub-curves and the split point.
 */
export function splitCubic(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number
): CubicSplitResult {
  const u = 1 - t
  const lerp = (a: Point, b: Point): Point => ({
    x: u * a.x + t * b.x,
    y: u * a.y + t * b.y,
  })
  const q0 = lerp(p0, p1)
  const q1 = lerp(p1, p2)
  const q2 = lerp(p2, p3)
  const r0 = lerp(q0, q1)
  const r1 = lerp(q1, q2)
  const s0 = lerp(r0, r1)
  return {
    left: { p0: clonePoint(p0), p1: q0, p2: r0, p3: clonePoint(s0) },
    right: { p0: clonePoint(s0), p1: r1, p2: q2, p3: clonePoint(p3) },
    mid: s0,
  }
}

/**
 * Find the closest point on a cubic Bezier curve to a target,
 * returning the parameter t, the point, and the distance.
 */
export function closestPointOnCubic(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  target: Point,
  samples = 500
): { t: number; point: Point; distance: number } {
  let bestT = 0
  let bestDistSq = Infinity
  let bestPoint: Point = p0
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const pt = cubicBezierPoint(p0, p1, p2, p3, t)
    const dx = pt.x - target.x
    const dy = pt.y - target.y
    const d = dx * dx + dy * dy
    if (d < bestDistSq) {
      bestDistSq = d
      bestT = t
      bestPoint = pt
    }
  }
  return { t: bestT, point: bestPoint, distance: Math.sqrt(bestDistSq) }
}

function getSegmentControls(
  segStart: Segment,
  segEnd: Segment
): { p0: Point; p1: Point; p2: Point; p3: Point } {
  const p0 = { x: segStart.x, y: segStart.y }
  const p3 = { x: segEnd.x, y: segEnd.y }
  const p1 = segStart.out ? clonePoint(segStart.out) : p0
  const p2 = segEnd.in ? clonePoint(segEnd.in) : p3
  return { p0, p1, p2, p3 }
}

/**
 * Find the closest curve segment across all paths within a distance threshold.
 */
export function hitTestPaths(
  paths: Path[],
  target: Point,
  threshold: number
): Hit | null {
  let best: Hit | null = null
  for (let pi = 0; pi < paths.length; pi++) {
    const path = paths[pi]
    const n = path.points.length
    if (n < 2) continue
    const segmentCount = path.closed ? n : n - 1
    for (let si = 0; si < segmentCount; si++) {
      const startIdx = si
      const endIdx = (si + 1) % n
      const { p0, p1, p2, p3 } = getSegmentControls(
        path.points[startIdx],
        path.points[endIdx]
      )
      const r = closestPointOnCubic(p0, p1, p2, p3, target)
      if (r.distance <= threshold && (best === null || r.distance < best.distance)) {
        best = {
          pathIndex: pi,
          segmentIndex: si,
          t: r.t,
          point: r.point,
          distance: r.distance,
        }
      }
    }
  }
  return best
}

/**
 * Insert a new anchor at the given (segmentIndex, t) position on the curve.
 *
 * The curve is split using De Casteljau; the new anchor shares the position
 * and the path remains connected (open or closed status is preserved).
 */
export function splitPathAtSegment(
  path: Path,
  segmentIndex: number,
  t: number
): Path {
  const n = path.points.length
  if (n < 2) return path

  const startIdx = segmentIndex
  const endIdx = (segmentIndex + 1) % n
  const segStart = path.points[startIdx]
  const segEnd = path.points[endIdx]
  const { p0, p1, p2, p3 } = getSegmentControls(segStart, segEnd)
  const { left, right, mid } = splitCubic(p0, p1, p2, p3, t)

  const newAnchor: Segment = {
    x: mid.x,
    y: mid.y,
    in: clonePoint(left.p2), // R0
    out: clonePoint(right.p1), // R1
    mirror: false,
  }

  const newPoints: Segment[] = path.points.map((pt, i) => {
    const cloned = cloneSegment(pt)
    if (i === startIdx) {
      cloned.out = clonePoint(left.p1) // Q0
    }
    if (i === endIdx) {
      cloned.in = clonePoint(right.p2) // Q2
    }
    return cloned
  })

  // Closing segment of a closed path (startIdx = n-1, endIdx = 0): append.
  // Otherwise insert between startIdx and endIdx.
  if (path.closed && endIdx === 0) {
    newPoints.push(newAnchor)
  } else {
    newPoints.splice(startIdx + 1, 0, newAnchor)
  }

  return { ...path, points: newPoints }
}
