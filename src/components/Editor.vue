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

let keydownHandler: KeyboardEvent | null = null;
let keyupHandler: KeyboardEvent | null = null;

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
    };
  },
  methods: {
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

      let p = screenToSvg(
        { x: e.clientX, y: e.clientY },
        this.$refs.canv as SVGRectElement,
        this.$refs.canv as SVGSVGElement
      );
      this.offset = { x: p.x, y: p.y };
      const item = this.createPoint(p)
      this.selection = item.out;
      this.selectedType = "out"
      this.selectedSegment = item;
    },
    onPointerMove(e: PointerEvent) {
      if (this.offset) {
        let p = screenToSvg(
          { x: e.clientX, y: e.clientY },
          this.$refs.canv as SVGRectElement,
          this.$refs.canv as SVGSVGElement
        );
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
    // keydownHandler = window.addEventListener("keydown", (ev) => {
    //   if (ev.key === "Control") {
    //     this.anchorChange = true
    //   }
    // })
    // keyupHandler = window.addEventListener("keyup", (ev) => {
    //   if (ev.key === "Control") {
    //     this.anchorChange = false
    //   }
    // })
  },
  beforeDestroy() {
    // window.removeEventListener("keydown", keydownHandler)
    // window.removeEventListener("keydown", keyupHandler)
  }
})
</script>

<template>
  <div class="editor-container">
    <header class="header">
      <h1 class="app-title">Path Editor</h1>
      <div class="toolbar">
        <button class="tool-btn" :class="{ active: penMode }" @click="penMode = !penMode" title="Pen Mode">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 19l7-7 3 3-7 7-3-3z"/>
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
            <path d="M2 2l7.586 7.586"/>
            <circle cx="11" cy="11" r="2"/>
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
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e0e0e0" stroke-width="0.5"/>
            </pattern>
          </defs>
          <rect width="400" height="400" fill="url(#grid)" />
          
          <path v-for="(render, i) in renders" :d="render" class="rendered-path" @click="selectPath(i)"></path>
          
          <g v-if="path">
            <g v-for="(i, idx) in path.points">
              <line v-if="i.out" :x1="i.x" :y1="i.y" :x2="i.out.x" :y2="i.out.y" class="handle-line"></line>
              <circle @pointerdown="onPointerDown($event, i.out, i, 'out')" @pointermove="onPointerMove"
                @pointerup="onPointerUp" v-if="i.out" :cx="i.out.x" :cy="i.out.y" r="6"
                class="handle-point" :class="{ 'selected': selection === i.out }"></circle>
              <line v-if="i.in" :x1="i.x" :y1="i.y" :x2="i.in.x" :y2="i.in.y" class="handle-line"></line>
              <circle @pointerdown="onPointerDown($event, i.in, i, 'in')" @pointermove="onPointerMove"
                @pointerup="onPointerUp" v-if="i.in" :cx="i.in.x" :cy="i.in.y" r="6"
                class="handle-point" :class="{ 'selected': selection === i.in }"></circle>
            </g>
            <path :d="render" class="preview-path"></path>
            <circle v-for="i in path.points" :cx="i.x" :cy="i.y" r="8" 
              @pointerdown="onPointerDown($event, i, i, '')" @pointermove="onPointerMove" 
              @pointerup="onPointerUp" class="anchor-point" :class="{ 'selected': selection === i }"></circle>
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
  background: #f5f5f7;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.header {
  background: white;
  border-bottom: 1px solid #e1e1e3;
  padding: 1rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.app-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1a1a1a;
}

.toolbar {
  display: flex;
  gap: 0.5rem;
}

.tool-btn {
  background: white;
  border: 1px solid #d1d1d6;
  border-radius: 8px;
  padding: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
  color: #6e6e73;
}

.tool-btn:hover {
  background: #f5f5f7;
}

.tool-btn.active {
  background: #007aff;
  color: white;
  border-color: #007aff;
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
  padding: 2rem;
}

.drawing-canvas {
  width: 100%;
  max-width: 600px;
  height: auto;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  cursor: crosshair;
}

.rendered-path {
  stroke: #2c2c2e;
  stroke-width: 2;
  fill: rgba(0, 122, 255, 0.1);
  cursor: pointer;
  transition: fill 0.2s;
}

.rendered-path:hover {
  fill: rgba(0, 122, 255, 0.2);
}

.preview-path {
  stroke: #007aff;
  stroke-width: 2;
  fill: none;
}

.handle-line {
  stroke: #007aff;
  stroke-width: 1;
  opacity: 0.5;
}

.handle-point {
  fill: white;
  stroke: #007aff;
  stroke-width: 2;
  cursor: move;
}

.handle-point.selected {
  fill: #007aff;
}

.anchor-point {
  fill: white;
  stroke: #007aff;
  stroke-width: 2;
  cursor: move;
}

.anchor-point.selected {
  fill: #007aff;
  stroke-width: 3;
}

.sidebar {
  width: 320px;
  background: white;
  border-left: 1px solid #e1e1e3;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  overflow-y: auto;
}

.panel {
  background: white;
  border-radius: 12px;
  padding: 1rem;
  border: 1px solid #e1e1e3;
}

.panel-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #6e6e73;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 1rem;
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
  padding: 0.5rem;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.layer-item:hover {
  background: #f5f5f7;
}

.layer-item.active {
  background: #e8f2ff;
}

.layer-thumb {
  width: 40px;
  height: 40px;
  border: 1px solid #e1e1e3;
  border-radius: 4px;
  background: white;
}

.layer-path {
  stroke: #2c2c2e;
  stroke-width: 2;
  fill: rgba(0, 0, 0, 0.1);
}

.layer-name {
  font-size: 0.875rem;
  color: #2c2c2e;
}

.add-layer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem;
  background: #007aff;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.add-layer-btn:hover {
  background: #0051d5;
}

.svg-output {
  width: 100%;
  height: 120px;
  padding: 0.75rem;
  border: 1px solid #e1e1e3;
  border-radius: 8px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 0.75rem;
  resize: vertical;
  background: #f5f5f7;
}

.copy-btn {
  width: 100%;
  padding: 0.75rem;
  margin-top: 0.5rem;
  background: white;
  color: #007aff;
  border: 1px solid #007aff;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.copy-btn:hover {
  background: #007aff;
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
