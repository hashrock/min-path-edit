<script lang="ts">
import { defineComponent } from 'vue'

function toSvg(path: Path) {
  if (!path) {
    return ""
  }
  let result = [];
  for (let i = 0; i < path.points.length - 1; i++) {
    const seg = path.points[i];
    const next = path.points[i + 1];
    if (i === 0) {
      result.push(`M ${seg.x} ${seg.y}`);
    }
    result.push(
      [
        `C ${seg.out ? seg.out.x : seg.x}`,
        `${seg.out ? seg.out.y : seg.y}, ${next.in ? next.in.x : next.x}`,
        `${next.in ? next.in.y : next.y}, ${next.x} ${next.y}`
      ].join(" ")
    );
  }
  return result.join(" ") + (path.closed ? " Z" : "");
}
function screenToSvg(point: Point, el: SVGGraphicsElement, svg: SVGSVGElement) {
  const pt = svg.createSVGPoint();
  pt.x = point.x;
  pt.y = point.y;

  const matrix = el.getScreenCTM();
  if (matrix) {
    return pt.matrixTransform(matrix.inverse());
  }
  // No Matrix
  return pt;
}

let keydownHandler: ((ev: KeyboardEvent) => void) | null = null;
let keyupHandler: ((ev: KeyboardEvent) => void) | null = null;

interface Point {
  x: number;
  y: number;
}

interface Segment extends Point {
  out: Point | null;
  in: Point | null;
  mirror: boolean | null
}

interface Path {
  points: Segment[];
  closed: boolean;
}

interface Offset {
  x: number;
  y: number;
}
type UnknownObject<T extends object> = {
  [P in keyof T]: unknown;
};

function isSegment(obj: unknown): obj is Segment {
  if (typeof obj !== "object") {
    return false;
  }
  if (obj === null) {
    return false;
  }
  const { out } = obj as UnknownObject<Segment>;
  if (typeof out !== "object") {
    return false;
  }
  return true
}

export default defineComponent({
  el: "#app",
  data() {
    return {
      paths: [
        {
          points: [] as Segment[],
          closed: false
        }
      ] as Path[],
      selectedPathIndex: 0,
      selection: null as Point | Segment | null,
      selectedSegment: null as Segment | null,
      selectedType: "",
      offset: null as Offset | null,
      anchorChange: false,
      pathClosed: false,
      penMode: true,
      snapToGrid: true,
      gridSize: 20,
    };
  },
  methods: {
    snapPoint(point: Point): Point {
      if (!this.snapToGrid) {
        return point;
      }
      const halfGrid = this.gridSize / 2;
      return {
        x: Math.round(point.x / halfGrid) * halfGrid,
        y: Math.round(point.y / halfGrid) * halfGrid
      };
    },
    copyToClipboard() {
      navigator.clipboard.writeText(this.render).then(() => {
        console.log('Copied to clipboard');
      });
    },
    onPointerUp(e: PointerEvent) {
      this.offset = null;
      if (this.anchorChange && this.selectedSegment) {
        this.selectedSegment.mirror = !this.selectedSegment.mirror;
      }
    },
    onPointerDown(e: PointerEvent, item: Point | null, root: Segment, type: "out" | "in" | "") {
      e.stopPropagation();
      const rect = e.currentTarget as SVGRectElement;
      this.offset = screenToSvg(
        { x: e.clientX, y: e.clientY },
        rect,
        this.$refs.canv as SVGSVGElement
      );
      rect.setPointerCapture(e.pointerId);
      this.selection = item;
      this.selectedSegment = root;
      this.selectedType = type

      if (item === this.path.points[0] && this.penMode) {
        this.path.closed = true
        const i = this.createPoint(this.path.points[0])
        this.selection = this.path.points[0].out
        this.selectedType = "out"
        this.selectedSegment = i
        this.penMode = false
        return
      }
    },
    createPoint(p: Point) {
      const item: Segment = {
        x: p.x,
        y: p.y,
        in: {
          x: p.x,
          y: p.y
        },
        out: {
          x: p.x,
          y: p.y
        },
        mirror: true
      };
      if (this.path.points.length === 0) {
        item.in = null
      }
      if (this.path.closed) {
        item.out = null
      }

      this.path.points.push(item);
      return item
    },
    addPath() {
      this.paths.push({
        points: [],
        closed: false
      })
      this.selectedPathIndex = this.paths.length - 1
      this.penMode = true
    },
    onCreatePathDown(e: PointerEvent) {
      // 新規作成
      if (!this.penMode) {
        return
      }

      let svgPoint = screenToSvg(
        { x: e.clientX, y: e.clientY },
        this.$refs.canv as SVGRectElement,
        this.$refs.canv as SVGSVGElement
      );
      let p = this.snapPoint({ x: svgPoint.x, y: svgPoint.y });
      this.offset = { x: p.x, y: p.y };
      const item = this.createPoint(p)
      this.selection = item.out;
      this.selectedType = "out"
      this.selectedSegment = item;
    },
    onPointerMove(e: PointerEvent) {
      if (this.offset) {
        let svgPoint = screenToSvg(
          { x: e.clientX, y: e.clientY },
          this.$refs.canv as SVGRectElement,
          this.$refs.canv as SVGSVGElement
        );
        let p = this.snapPoint({ x: svgPoint.x, y: svgPoint.y });
        for (let i of this.movingGroup) {
          i.x += p.x - this.offset.x;
          i.y += p.y - this.offset.y;
        }
        if (this.selectedSegment != this.selection && this.selectionMirror) {
          if (!this.anchorChange && this.selectedSegment?.mirror && this.selection) {
            this.selectionMirror.x =
              this.selectedSegment.x * 2 - this.selection.x;
            this.selectionMirror.y =
              this.selectedSegment.y * 2 - this.selection.y;
          }
          if (this.anchorChange && this.selectedSegment && !this.selectedSegment?.mirror && this.selection) {
            this.selectionMirror.x =
              this.selectedSegment.x * 2 - this.selection.x;
            this.selectionMirror.y =
              this.selectedSegment.y * 2 - this.selection.y;
          }
        }

        this.offset = { x: p.x, y: p.y };
      }
    },
    selectPath(index: number) {
      if (this.penMode) {
        // 描画中に他のパスがActiveになってしまわないようblock
        return
      }
      this.selectedPathIndex = index
    }
  },
  computed: {
    path(): Path {
      return this.paths[this.selectedPathIndex]
    },
    render(): string {
      return toSvg(this.path);
    },
    thumbs(): string[] {
      return this.paths.map(p => {
        return toSvg(p);
      });
    },
    renders(): string[] {
      return this.paths.map(toSvg)
    },
    selectionIndex(): number {
      if (this.selectedSegment === null) {
        return -1;
      }
      return this.path.points.indexOf(this.selectedSegment);
    },
    prev(): Segment {
      return this.path.points[(this.selectionIndex - 1) % this.path.points.length];
    },
    next(): Segment {
      return this.path.points[(this.selectionIndex + 1) % this.path.points.length];
    },
    selectionMirror(): Point | null {
      if (this.path.closed) {
        const start = this.path.points[0]
        const last = this.path.points[this.path.points.length - 1]
        if (this.selectedSegment === start && this.selectedType === "out") {
          return last.in
        }
        if (this.selectedSegment === last && this.selectedType === "in") {
          return start.out
        }
      }
      switch (this.selectedType) {
        case "in":
          if (this.selectedSegment === null) {
            return null
          }
          return this.selectedSegment?.out;
        case "out":
          if (this.selectedSegment === null) {
            return null
          }
          return this.selectedSegment?.in;
      }
      return null
    },
    movingGroup(): (Point | Segment)[] {
      const group = [] as (Point | Segment)[]
      if (this.selectedSegment === null) {
        return group
      }
      if (this.selection) {
        group.push(this.selection)
      }
      if (isSegment(this.selection) && this.selection && this.selection.in) {
        group.push(this.selection.in)
      }
      if (isSegment(this.selection) && this.selection && this.selection.out) {
        group.push(this.selection.out)
      }
      if (this.path.closed) {
        const start = this.path.points[0]
        const last = this.path.points[this.path.points.length - 1]
        if (this.selection === start) {
          group.push(last)
          if (last.in) {
            group.push(last.in)
          }
        }
        if (this.selection === last) {
          group.push(start)
          if (start.out) {
            group.push(start.out)
          }
        }
      }
      return group
    }
  },
  mounted() {
    keydownHandler = (ev: KeyboardEvent) => {
      // macOSではCmd(Meta)キー、その他ではCtrlキーを使用
      if (ev.metaKey || ev.ctrlKey) {
        this.anchorChange = true
      }
    }
    keyupHandler = (ev: KeyboardEvent) => {
      // macOSではCmd(Meta)キー、その他ではCtrlキーを使用
      if (!ev.metaKey && !ev.ctrlKey) {
        this.anchorChange = false
      }
    }
    window.addEventListener("keydown", keydownHandler)
    window.addEventListener("keyup", keyupHandler)
  },
  beforeUnmount() {
    // Vue 3では beforeDestroy ではなく beforeUnmount を使用
    if (keydownHandler) {
      window.removeEventListener("keydown", keydownHandler)
    }
    if (keyupHandler) {
      window.removeEventListener("keyup", keyupHandler)
    }
  }
})
</script>

<template>
  <div class="editor-container">
    <header class="header">
      <h1 class="app-title">Path Editor</h1>
      <div class="toolbar">
        <button class="tool-btn" :class="{ active: penMode }" @click="penMode = !penMode" title="Pen Mode">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 19l7-7 3 3-7 7-3-3z"/>
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
            <path d="M2 2l7.586 7.586"/>
            <circle cx="11" cy="11" r="2"/>
          </svg>
        </button>
        <button class="tool-btn" :class="{ active: snapToGrid }" @click="snapToGrid = !snapToGrid" title="Snap to Grid">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
          </svg>
        </button>
      </div>
    </header>

    <div class="main-content">
      <div class="canvas-section">
        <svg ref="canv" class="drawing-canvas" viewBox="0 0 400 400" @keydown.z="anchorChange = true"
          @keyup.z="anchorChange = false" @pointerdown="onCreatePathDown" @pointermove="onPointerMove"
          @pointerup="onPointerUp" tabindex="0">
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="1" fill="#b0b0b0"/>
            </pattern>
          </defs>
          <rect width="400" height="400" fill="white" />
          <rect width="400" height="400" fill="url(#grid)" />
          
          <path v-for="(render, i) in renders" :d="render" class="rendered-path" @click="selectPath(i)"></path>
          
          <g v-if="path">
            <g v-for="(i, idx) in path.points">
              <line v-if="i.out" :x1="i.x" :y1="i.y" :x2="i.out.x" :y2="i.out.y" class="handle-line"></line>
              <g v-if="i.out">
                <circle :cx="i.out.x" :cy="i.out.y" r="6" fill="transparent" stroke="none"
                  @pointerdown="onPointerDown($event, i.out, i, 'out')" @pointermove="onPointerMove"
                  @pointerup="onPointerUp" style="cursor: move;"></circle>
                <circle :cx="i.out.x" :cy="i.out.y" r="3"
                  class="handle-point" :class="{ 'selected': selection === i.out }"
                  pointer-events="none"></circle>
              </g>
              <line v-if="i.in" :x1="i.x" :y1="i.y" :x2="i.in.x" :y2="i.in.y" class="handle-line"></line>
              <g v-if="i.in">
                <circle :cx="i.in.x" :cy="i.in.y" r="6" fill="transparent" stroke="none"
                  @pointerdown="onPointerDown($event, i.in, i, 'in')" @pointermove="onPointerMove"
                  @pointerup="onPointerUp" style="cursor: move;"></circle>
                <circle :cx="i.in.x" :cy="i.in.y" r="3"
                  class="handle-point" :class="{ 'selected': selection === i.in }"
                  pointer-events="none"></circle>
              </g>
            </g>
            <path :d="render" class="preview-path"></path>
            <g v-for="i in path.points">
              <circle :cx="i.x" :cy="i.y" r="8" fill="transparent" stroke="none"
                @pointerdown="onPointerDown($event, i, i, '')" @pointermove="onPointerMove"
                @pointerup="onPointerUp" style="cursor: move;"></circle>
              <circle :cx="i.x" :cy="i.y" r="4"
                class="anchor-point" :class="{ 'selected': selection === i }"
                pointer-events="none"></circle>
            </g>
          </g>
        </svg>
      </div>

      <aside class="sidebar">
        <div class="panel">
          <h3 class="panel-title">Layers</h3>
          <div class="layer-list">
            <div v-for="(render, i) in thumbs" :key="i" 
              class="layer-item" :class="{ active: i === selectedPathIndex }"
              @click="selectedPathIndex = i">
              <svg viewBox="0 0 400 400" class="layer-thumb">
                <path :d="render" class="layer-path"></path>
              </svg>
              <span class="layer-name">Path {{ i + 1 }}</span>
            </div>
            <button class="add-layer-btn" @click="addPath">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Path
            </button>
          </div>
        </div>

        <div class="panel">
          <h3 class="panel-title">SVG Output</h3>
          <textarea v-model="render" class="svg-output" readonly></textarea>
          <button class="copy-btn" @click="copyToClipboard">
            Copy SVG
          </button>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.editor-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  position: relative;
}

.header {
  position: absolute;
  top: 1rem;
  left: 1rem;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  padding: 0.5rem 0.75rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  z-index: 100;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.app-title {
  font-size: 0.625rem;
  font-weight: 400;
  color: #666;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.toolbar {
  display: flex;
  gap: 0.5rem;
}

.tool-btn {
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 2px;
  padding: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
  color: #666;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tool-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  border-color: #000000;
  color: #000000;
}

.tool-btn.active {
  background: #000000;
  color: white;
  border-color: #000000;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.canvas-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: #f8f8f8;
}

.drawing-canvas {
  width: 100%;
  max-width: 600px;
  height: auto;
  background: white;
  border: 1px solid #000000;
  cursor: crosshair;
}

.rendered-path {
  stroke: #000000;
  stroke-width: 1;
  fill: rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: fill 0.15s;
}

.rendered-path:hover {
  fill: rgba(0, 0, 0, 0.1);
}

.preview-path {
  stroke: #000000;
  stroke-width: 1;
  fill: none;
}

.handle-line {
  stroke: #000000;
  stroke-width: 0.5;
  opacity: 0.3;
}

.handle-point {
  fill: white;
  stroke: #000000;
  stroke-width: 1;
  cursor: move;
}

.handle-point.selected {
  fill: #000000;
}

.anchor-point {
  fill: white;
  stroke: #000000;
  stroke-width: 1;
  cursor: move;
}

.anchor-point.selected {
  fill: #000000;
  stroke-width: 1.5;
}

.sidebar {
  width: 280px;
  background: white;
  border-left: 1px solid #000000;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem;
  overflow-y: auto;
}

.panel {
  background: white;
}

.panel-title {
  font-size: 0.625rem;
  font-weight: 400;
  color: #000000;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 0.75rem;
}

.layer-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.layer-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  cursor: pointer;
  transition: all 0.15s;
  border-bottom: 1px solid transparent;
}

.layer-item:hover {
  border-bottom-color: #e0e0e0;
}

.layer-item.active {
  border-bottom-color: #000000;
}

.layer-thumb {
  width: 32px;
  height: 32px;
  border: 1px solid #000000;
  background: white;
}

.layer-path {
  stroke: #000000;
  stroke-width: 1;
  fill: rgba(0, 0, 0, 0.05);
}

.layer-name {
  font-size: 0.75rem;
  color: #000000;
}

.add-layer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem;
  background: white;
  color: #000000;
  border: 1px solid #000000;
  font-size: 0.75rem;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.15s;
  margin-top: 0.5rem;
}

.add-layer-btn:hover {
  background: #000000;
  color: white;
}

.svg-output {
  width: 100%;
  height: 100px;
  padding: 0.5rem;
  border: 1px solid #000000;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 0.625rem;
  resize: vertical;
  background: #fafafa;
}

.copy-btn {
  width: 100%;
  padding: 0.5rem;
  margin-top: 0.5rem;
  background: white;
  color: #000000;
  border: 1px solid #000000;
  font-size: 0.75rem;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.15s;
}

.copy-btn:hover {
  background: #000000;
  color: white;
}

@media (max-width: 768px) {
  .main-content {
    flex-direction: column;
  }
  
  .sidebar {
    width: 100%;
    border-left: none;
    border-top: 1px solid #e1e1e3;
  }
  
  .canvas-section {
    padding: 1rem;
  }
}
</style>
