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

interface Point{ 
  x: number;
  y: number;
}

interface Segment extends Point{
  out: Point | null;
  in: Point | null;
  mirror: boolean | null
}

interface Path{
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
          if(this.selectedSegment === null) {
            return null
          }
          return this.selectedSegment?.out;
        case "out":
          if(this.selectedSegment === null) {
            return null
          }
          return this.selectedSegment?.in;
      }
      return null
    },
    movingGroup(): (Point | Segment)[] {
      const group = [] as (Point | Segment)[]
      if(this.selectedSegment === null) {
        return group
      }
      if(this.selection){
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
          if(last.in){
            group.push(last.in)
          }
        }
        if (this.selection === last) {
          group.push(start)
          if(start.out){
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
  <img id="logo" src="../assets/logo.svg" alt="min_path_edit">
  <svg ref="canv" id="canv" viewBox="0 0 400 400" height="400" width="400" @keydown.z="anchorChange = true"
    @keyup.z="anchorChange = false" @pointerdown="onCreatePathDown" @pointermove="onPointerMove"
    @pointerup="onPointerUp" tabindex="0">
    <path v-for="(render, i) in renders" :d="render" class="rendered" @click="selectPath(i)"></path>
    <g v-if="path">
      <g v-for="(i, idx) in path.points">
        <line v-if="i.out" :x1="i.x" :y1="i.y" :x2="i.out.x" :y2="i.out.y"></line>
        <circle @pointerdown="onPointerDown($event, i.out, i, 'out')" @pointermove="onPointerMove"
          @pointerup="onPointerUp" v-if="i.out" :cx="i.out.x" :cy="i.out.y" r="7"
          :class="{ 'selected': selection === i.out }"></circle>
        <line v-if="i.in" :x1="i.x" :y1="i.y" :x2="i.in.x" :y2="i.in.y"></line>
        <circle @pointerdown="onPointerDown($event, i.in, i, 'in')" @pointermove="onPointerMove"
          @pointerup="onPointerUp" v-if="i.in" :cx="i.in.x" :cy="i.in.y" r="7"
          :class="{ 'selected': selection === i.in }"></circle>
      </g>
      <path :d="render" class="preview"></path>
      <circle v-for="i in path.points" :cx="i.x" :cy="i.y" r="10" @pointerdown="onPointerDown($event, i, i, '')"
        @pointermove="onPointerMove" @pointerup="onPointerUp" :class="{ 'selected': selection === i }"></circle>
    </g>
  </svg>

  <div>
    <div class="thumbs">
      <svg viewBox="0 0 400 400" width=40 height=40 v-for="(render, i) in thumbs" :d="render" class="thumb"
        @click="selectedPathIndex = i" :class="{ selected: i === selectedPathIndex }">
        <path :d="render"></path>
      </svg>
      <button class="button-add" @click="addPath">+</button>
    </div>
    <textarea v-model="render"></textarea>
  </div>

</template>

<style scoped>
path.rendered {
  stroke: black;
  fill: rgba(0, 0, 0, 0.2);
}

path.preview {
  stroke: lightseagreen;
  fill: none;
}

.thumbs {
  display: flex;
  margin-bottom: 10px;
}

.thumb {
  border: 1px solid #666;
  display: inline-block;
}

.thumb.selected {
  border: 1px solid rgb(191, 59, 59);
}

.thumb path {
  stroke: black;
  fill: rgba(0, 0, 0, 1);
}

.button-add {
  width: 42px;
  height: 42px;
  border: 1px solid #666;
  background: #eee;
  margin: 0;
}

circle {
  fill: rgba(255, 255, 255, 0.233);
  stroke: lightseagreen;
}

circle.selected {
  fill: rgba(148, 255, 223, 0.377);
  stroke: rgb(69, 173, 0);
}

line {
  stroke: lightseagreen;
}

textarea {
  width: 400px;
  height: 100px;
  border: 1px solid #EEE;
}

ul {
  padding: 0;
}

li {
  list-style: none;
  cursor: pointer;
}

li.selected {
  font-weight: 800;
}

html,
body {
  height: 100%;
}

body {
  margin: 0;
  background: #EEE;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

#canv {
  background: white;
}

#logo {
  display: block;
  position: absolute;
  top: 0;
  right: 0;
}
</style>
