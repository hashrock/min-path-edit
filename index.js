function toSvg(path) {
  if (!path) {
    return []
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
function screenToSvg(point, el, svg) {
  const pt = svg.createSVGPoint();
  pt.x = point.x;
  pt.y = point.y;
  return pt.matrixTransform(el.getScreenCTM().inverse());
}

let keydownHandler, keyupHandler

new Vue({
  el: "#app",
  data() {
    return {
      paths: [
      ],
      selectedPathIndex: 0,
      selection: null,
      selectedSegment: null,
      selectedType: "",
      offset: null,
      anchorChange: false,
      pathClosed: false,
      penMode: false,
    };
  },
  methods: {
    onPointerUp(e) {
      this.offset = null;
      if (this.anchorChange) {
        this.selectedSegment.mirror = !this.selectedSegment.mirror;
      }
    },
    onPointerDown(e, item, root, type) {
      e.stopPropagation();
      const rect = e.target;
      this.offset = screenToSvg(
        { x: e.clientX, y: e.clientY },
        rect,
        this.$refs.canv
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
    createPoint(p) {
      const item = {
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
        item.in = undefined
      }
      if (this.path.closed) {
        item.out = undefined
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
    onCreatePathDown(e) {
      // 新規作成
      if (!this.penMode) {
        return
      }

      this.offset = { x: e.clientX, y: e.clientY };
      let p = screenToSvg(
        { x: e.clientX, y: e.clientY },
        this.$refs.canv,
        this.$refs.canv
      );
      const item = this.createPoint(p)
      this.selection = item.out;
      this.selectedType = "out"
      this.selectedSegment = item;
    },
    onCreatePathMove(e) { },
    onCreatePathUp(e) { },
    onPointerMove(e) {
      if (this.offset) {
        let p = screenToSvg(
          { x: e.clientX, y: e.clientY },
          this.$refs.canv,
          this.$refs.canv
        );
        for (let i of this.movingGroup) {
          i.x += p.x - this.offset.x;
          i.y += p.y - this.offset.y;
        }
        if (this.selectedSegment != this.selection && this.selectionMirror) {
          if (!this.anchorChange && this.selectedSegment.mirror) {
            this.selectionMirror.x =
              this.selectedSegment.x * 2 - this.selection.x;
            this.selectionMirror.y =
              this.selectedSegment.y * 2 - this.selection.y;
          }
          if (this.anchorChange && !this.selectedSegment.mirror) {
            this.selectionMirror.x =
              this.selectedSegment.x * 2 - this.selection.x;
            this.selectionMirror.y =
              this.selectedSegment.y * 2 - this.selection.y;
          }
        }

        this.offset = { x: p.x, y: p.y };
      }
    },
    selectPath(index) {
      if(this.penMode){
        // 描画中に他のパスがActiveになってしまわないようblock
        return
      }
      this.selectedPathIndex = index
    }
  },
  computed: {
    path() {
      return this.paths[this.selectedPathIndex]
    },
    render() {
      return toSvg(this.path);
    },
    renders() {
      return this.paths.map(toSvg)
    },
    selectionIndex() {
      return this.path.points.indexOf(this.selectedSegment);
    },
    prev() {
      return this.path.points[(this.selectionIndex - 1) % this.path.points.length];
    },
    next() {
      return this.path.points[(this.selectionIndex + 1) % this.path.points.length];
    },
    selectionMirror() {
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
          return this.selectedSegment.out;
        case "out":
          return this.selectedSegment.in;
      }
      return null
    },
    movingGroup() {
      const group = []
      group.push(this.selection)
      if (this.selection.in) {
        group.push(this.selection.in)
      }
      if (this.selection.out) {
        group.push(this.selection.out)
      }
      if (this.path.closed) {
        const start = this.path.points[0]
        const last = this.path.points[this.path.points.length - 1]
        if (this.selection === start) {
          group.push(last)
          group.push(last.in)
        }
        if (this.selection === last) {
          group.push(start)
          group.push(start.out)
        }
      }
      return group
    }
  },
  mounted() {
    keydownHandler = window.addEventListener("keydown", (ev) => {
      if (ev.key === "Control") {
        this.anchorChange = true
      }
    })
    keyupHandler = window.addEventListener("keyup", (ev) => {
      if (ev.key === "Control") {
        this.anchorChange = false
      }
    })
  },
  beforeDestroy() {
    window.removeEventListener("keydown", keydownHandler)
    window.removeEventListener("keydown", keyupHandler)
  }
});
