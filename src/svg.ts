import type { Path, Point } from './types'

export function toSvg(path: Path): string {
  if (!path || path.points.length === 0) {
    return ''
  }
  if (path.points.length === 1) {
    const p = path.points[0]
    return `M ${p.x} ${p.y}`
  }

  const result: string[] = []
  for (let i = 0; i < path.points.length - 1; i++) {
    const seg = path.points[i]
    const next = path.points[i + 1]
    if (i === 0) {
      result.push(`M ${seg.x} ${seg.y}`)
    }
    result.push(
      [
        `C ${seg.out ? seg.out.x : seg.x}`,
        `${seg.out ? seg.out.y : seg.y}, ${next.in ? next.in.x : next.x}`,
        `${next.in ? next.in.y : next.y}, ${next.x} ${next.y}`,
      ].join(' ')
    )
  }

  if (path.closed) {
    const last = path.points[path.points.length - 1]
    const first = path.points[0]
    result.push(
      [
        `C ${last.out ? last.out.x : last.x}`,
        `${last.out ? last.out.y : last.y}, ${first.in ? first.in.x : first.x}`,
        `${first.in ? first.in.y : first.y}, ${first.x} ${first.y}`,
      ].join(' ')
    )
  }

  return result.join(' ') + (path.closed ? ' Z' : '')
}

export function screenToSvg(
  point: Point,
  el: SVGGraphicsElement,
  svg: SVGSVGElement
): Point {
  const pt = svg.createSVGPoint()
  pt.x = point.x
  pt.y = point.y
  const matrix = el.getScreenCTM()
  if (matrix) {
    const transformed = pt.matrixTransform(matrix.inverse())
    return { x: transformed.x, y: transformed.y }
  }
  return { x: pt.x, y: pt.y }
}
