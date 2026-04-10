import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Path, Point, Segment } from '../types'
import { screenToSvg, toSvg } from '../svg'
import { hitTestPaths, splitPathAtSegment } from '../pathSplit'
import './Editor.css'

type HandleType = 'anchor' | 'in' | 'out'

interface Selection {
  pathIndex: number
  pointIndex: number
  type: HandleType
}

interface DragState {
  pathIndex: number
  pointIndex: number
  type: HandleType
  offset: Point
  closePathOnPointerUp: boolean
  anchorChangeUsed: boolean
}

const GRID_SIZE = 20
const HALF_GRID = GRID_SIZE / 2
const SCISSORS_HIT_THRESHOLD = 10

function createEmptyPath(): Path {
  return { points: [], closed: false }
}

export default function Editor() {
  const [paths, setPaths] = useState<Path[]>(() => [createEmptyPath()])
  const [selectedPathIndex, setSelectedPathIndex] = useState(0)
  const [penMode, setPenMode] = useState(true)
  const [scissorsMode, setScissorsMode] = useState(false)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [selection, setSelection] = useState<Selection | null>(null)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const anchorChangeRef = useRef(false)

  const currentPath = paths[selectedPathIndex] ?? createEmptyPath()

  const snapPoint = useCallback(
    (p: Point): Point => {
      if (!snapToGrid) return p
      return {
        x: Math.round(p.x / HALF_GRID) * HALF_GRID,
        y: Math.round(p.y / HALF_GRID) * HALF_GRID,
      }
    },
    [snapToGrid]
  )

  const toSvgPoint = useCallback((clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current
    if (!svg) return null
    return screenToSvg({ x: clientX, y: clientY }, svg, svg)
  }, [])

  // Global key listeners for Ctrl/Cmd (anchor-change toggle)
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey) {
        anchorChangeRef.current = true
      }
    }
    const up = (ev: KeyboardEvent) => {
      if (!ev.metaKey && !ev.ctrlKey) {
        anchorChangeRef.current = false
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const onCanvasPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const svgPoint = toSvgPoint(e.clientX, e.clientY)
    if (!svgPoint) return

    if (scissorsMode) {
      const hit = hitTestPaths(paths, svgPoint, SCISSORS_HIT_THRESHOLD)
      if (!hit) return
      const target = paths[hit.pathIndex]
      const result = splitPathAtSegment(target, hit.segmentIndex, hit.t)
      setPaths((prev) => {
        const next = [...prev]
        next[hit.pathIndex] = result
        return next
      })
      setSelectedPathIndex(hit.pathIndex)
      setSelection(null)
      return
    }

    if (!penMode) return
    const p = snapPoint(svgPoint)

    const path = paths[selectedPathIndex]
    const isFirst = path.points.length === 0
    const newSegment: Segment = {
      x: p.x,
      y: p.y,
      in: isFirst ? null : { x: p.x, y: p.y },
      out: { x: p.x, y: p.y },
      mirror: true,
    }
    const newPointIndex = path.points.length

    setPaths((prev) =>
      prev.map((pth, i) =>
        i === selectedPathIndex
          ? { ...pth, points: [...pth.points, newSegment] }
          : pth
      )
    )

    dragRef.current = {
      pathIndex: selectedPathIndex,
      pointIndex: newPointIndex,
      type: 'out',
      offset: p,
      closePathOnPointerUp: false,
      anchorChangeUsed: false,
    }
    setSelection({
      pathIndex: selectedPathIndex,
      pointIndex: newPointIndex,
      type: 'out',
    })

    svgRef.current?.setPointerCapture(e.pointerId)
  }

  const onHandlePointerDown = (
    e: ReactPointerEvent<SVGCircleElement>,
    pointIndex: number,
    type: HandleType
  ) => {
    e.stopPropagation()
    const svgPoint = toSvgPoint(e.clientX, e.clientY)
    if (!svgPoint) return

    svgRef.current?.setPointerCapture(e.pointerId)

    const path = paths[selectedPathIndex]

    // Close the path by clicking the first anchor in pen mode
    if (
      type === 'anchor' &&
      pointIndex === 0 &&
      penMode &&
      path.points.length > 1
    ) {
      setPaths((prev) =>
        prev.map((pth, i) => {
          if (i !== selectedPathIndex) return pth
          const lastIdx = pth.points.length - 1
          const points = pth.points.map((seg, si) => {
            if (si === 0 && seg.in === null) {
              return { ...seg, in: { x: seg.x, y: seg.y } }
            }
            if (si === lastIdx && seg.out === null) {
              return { ...seg, out: { x: seg.x, y: seg.y } }
            }
            return seg
          })
          return { ...pth, points, closed: true }
        })
      )
      dragRef.current = {
        pathIndex: selectedPathIndex,
        pointIndex: 0,
        type: 'out',
        offset: svgPoint,
        closePathOnPointerUp: true,
        anchorChangeUsed: false,
      }
      setSelection({
        pathIndex: selectedPathIndex,
        pointIndex: 0,
        type: 'out',
      })
      return
    }

    dragRef.current = {
      pathIndex: selectedPathIndex,
      pointIndex,
      type,
      offset: svgPoint,
      closePathOnPointerUp: false,
      anchorChangeUsed: false,
    }
    setSelection({
      pathIndex: selectedPathIndex,
      pointIndex,
      type,
    })
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const svgPoint = toSvgPoint(e.clientX, e.clientY)
    if (!svgPoint) return
    const p = snapPoint(svgPoint)
    const dx = p.x - drag.offset.x
    const dy = p.y - drag.offset.y
    if (dx === 0 && dy === 0) return

    if (anchorChangeRef.current) {
      drag.anchorChangeUsed = true
    }

    setPaths((prev) =>
      prev.map((pth, pi) => {
        if (pi !== drag.pathIndex) return pth
        return {
          ...pth,
          points: pth.points.map((seg, si) => {
            if (si !== drag.pointIndex) return seg
            const newSeg: Segment = {
              x: seg.x,
              y: seg.y,
              in: seg.in ? { x: seg.in.x, y: seg.in.y } : null,
              out: seg.out ? { x: seg.out.x, y: seg.out.y } : null,
              mirror: seg.mirror,
            }

            if (drag.type === 'anchor') {
              newSeg.x += dx
              newSeg.y += dy
              if (newSeg.in) {
                newSeg.in.x += dx
                newSeg.in.y += dy
              }
              if (newSeg.out) {
                newSeg.out.x += dx
                newSeg.out.y += dy
              }
            } else if (drag.type === 'out' && newSeg.out) {
              newSeg.out.x += dx
              newSeg.out.y += dy
              const effectiveMirror = anchorChangeRef.current
                ? !seg.mirror
                : seg.mirror
              if (effectiveMirror && newSeg.in) {
                newSeg.in.x = newSeg.x * 2 - newSeg.out.x
                newSeg.in.y = newSeg.y * 2 - newSeg.out.y
              }
            } else if (drag.type === 'in' && newSeg.in) {
              newSeg.in.x += dx
              newSeg.in.y += dy
              const effectiveMirror = anchorChangeRef.current
                ? !seg.mirror
                : seg.mirror
              if (effectiveMirror && newSeg.out) {
                newSeg.out.x = newSeg.x * 2 - newSeg.in.x
                newSeg.out.y = newSeg.y * 2 - newSeg.in.y
              }
            }

            return newSeg
          }),
        }
      })
    )

    drag.offset = p
  }

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag) return

    try {
      svgRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      // no-op
    }

    if (drag.anchorChangeUsed) {
      setPaths((prev) =>
        prev.map((pth, pi) => {
          if (pi !== drag.pathIndex) return pth
          return {
            ...pth,
            points: pth.points.map((seg, si) =>
              si === drag.pointIndex ? { ...seg, mirror: !seg.mirror } : seg
            ),
          }
        })
      )
    }

    if (drag.closePathOnPointerUp) {
      setPenMode(false)
    }

    dragRef.current = null
  }

  const addPath = () => {
    setPaths((prev) => [...prev, createEmptyPath()])
    setSelectedPathIndex(paths.length)
    setPenMode(true)
    setScissorsMode(false)
    setSelection(null)
  }

  const selectPath = (index: number) => {
    if (penMode || scissorsMode) return
    setSelectedPathIndex(index)
    setSelection(null)
  }

  const togglePenMode = () => {
    if (!currentPath.closed) return
    setPenMode((v) => {
      const next = !v
      if (next) setScissorsMode(false)
      return next
    })
  }

  const toggleScissorsMode = () => {
    setScissorsMode((v) => {
      const next = !v
      if (next) {
        setPenMode(false)
        setSelection(null)
      }
      return next
    })
  }

  const render = useMemo(() => toSvg(currentPath), [currentPath])
  const renders = useMemo(() => paths.map(toSvg), [paths])

  const copyToClipboard = () => {
    navigator.clipboard.writeText(render).then(
      () => {
        console.log('Copied to clipboard')
      },
      () => {
        // no-op
      }
    )
  }

  const isSelected = (pointIndex: number, type: HandleType): boolean =>
    selection !== null &&
    selection.pathIndex === selectedPathIndex &&
    selection.pointIndex === pointIndex &&
    selection.type === type

  return (
    <div className="editor-container">
      <header className="header">
        <h1 className="app-title">Path Editor</h1>
        <div className="toolbar">
          <button
            type="button"
            className={`tool-btn ${penMode ? 'active' : ''}`}
            disabled={!currentPath.closed}
            onClick={togglePenMode}
            title="Pen Mode"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
              <circle cx="11" cy="11" r="2" />
            </svg>
          </button>
          <button
            type="button"
            className={`tool-btn ${scissorsMode ? 'active' : ''}`}
            onClick={toggleScissorsMode}
            title="Scissors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="6" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <line x1="20" y1="4" x2="8.12" y2="15.88" />
              <line x1="14.47" y1="14.48" x2="20" y2="20" />
              <line x1="8.12" y1="8.12" x2="12" y2="12" />
            </svg>
          </button>
          <button
            type="button"
            className={`tool-btn ${snapToGrid ? 'active' : ''}`}
            onClick={() => setSnapToGrid((v) => !v)}
            title="Snap to Grid"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          </button>
        </div>
      </header>

      <div className="main-content">
        <div className="canvas-section">
          <svg
            ref={svgRef}
            className={`drawing-canvas ${scissorsMode ? 'scissors-mode' : ''}`}
            viewBox="0 0 400 400"
            tabIndex={0}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="10" r="1" fill="#b0b0b0" />
              </pattern>
            </defs>
            <rect width="400" height="400" fill="white" />
            <rect width="400" height="400" fill="url(#grid)" />

            {renders.map((d, i) => (
              <path
                key={`layer-${i}`}
                d={d}
                className="rendered-path"
                onClick={() => selectPath(i)}
              />
            ))}

            {!scissorsMode && (
            <g>
              {currentPath.points.map((pt, idx) => (
                <g key={`handle-${idx}`}>
                  {pt.out && (
                    <>
                      <line
                        x1={pt.x}
                        y1={pt.y}
                        x2={pt.out.x}
                        y2={pt.out.y}
                        className="handle-line"
                      />
                      <circle
                        cx={pt.out.x}
                        cy={pt.out.y}
                        r={6}
                        fill="transparent"
                        stroke="none"
                        style={{ cursor: 'move' }}
                        onPointerDown={(e) => onHandlePointerDown(e, idx, 'out')}
                      />
                      <circle
                        cx={pt.out.x}
                        cy={pt.out.y}
                        r={3}
                        className={`handle-point ${isSelected(idx, 'out') ? 'selected' : ''}`}
                        pointerEvents="none"
                      />
                    </>
                  )}
                  {pt.in && (
                    <>
                      <line
                        x1={pt.x}
                        y1={pt.y}
                        x2={pt.in.x}
                        y2={pt.in.y}
                        className="handle-line"
                      />
                      <circle
                        cx={pt.in.x}
                        cy={pt.in.y}
                        r={6}
                        fill="transparent"
                        stroke="none"
                        style={{ cursor: 'move' }}
                        onPointerDown={(e) => onHandlePointerDown(e, idx, 'in')}
                      />
                      <circle
                        cx={pt.in.x}
                        cy={pt.in.y}
                        r={3}
                        className={`handle-point ${isSelected(idx, 'in') ? 'selected' : ''}`}
                        pointerEvents="none"
                      />
                    </>
                  )}
                </g>
              ))}
              <path d={render} className="preview-path" />
              {currentPath.points.map((pt, idx) => (
                <g key={`anchor-${idx}`}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={8}
                    fill="transparent"
                    stroke="none"
                    style={{ cursor: 'move' }}
                    onPointerDown={(e) => onHandlePointerDown(e, idx, 'anchor')}
                  />
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={4}
                    className={`anchor-point ${isSelected(idx, 'anchor') ? 'selected' : ''}`}
                    pointerEvents="none"
                  />
                </g>
              ))}
            </g>
            )}
          </svg>
        </div>

        <aside className="sidebar">
          <div className="panel">
            <h3 className="panel-title">Layers</h3>
            <div className="layer-list">
              {renders.map((d, i) => (
                <div
                  key={`thumb-${i}`}
                  className={`layer-item ${i === selectedPathIndex ? 'active' : ''}`}
                  onClick={() => selectPath(i)}
                >
                  <svg viewBox="0 0 400 400" className="layer-thumb">
                    <path d={d} className="layer-path" />
                  </svg>
                  <span className="layer-name">Path {i + 1}</span>
                </div>
              ))}
              <button type="button" className="add-layer-btn" onClick={addPath}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Path
              </button>
            </div>
          </div>

          <div className="panel">
            <h3 className="panel-title">SVG Output</h3>
            <textarea value={render} className="svg-output" readOnly />
            <button type="button" className="copy-btn" onClick={copyToClipboard}>
              Copy SVG
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
