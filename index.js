function toSvg(path, closed) {
  let result = [];
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    const next = path[i + 1];
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
  return result.join(" ") + (closed ? "Z" : "");
}
function screenToSvg(point, el, svg) {
  const pt = svg.createSVGPoint();
  pt.x = point.x;
  pt.y = point.y;
  return pt.matrixTransform(el.getScreenCTM().inverse());
}

new Vue({
  el: "#app",
  data() {
    return {
      path: [

      ],
      selection: null,
      selectedSegment: null,
      selectionMirror: null,
      offset: null,
      anchorChange: false,
      pathClosed: false,
      penMode: true
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

      if (item === this.path[0] && this.penMode) {
        this.pathClosed = true
        const i = this.createPoint(this.path[0])
        this.selection = this.path[0].out
        this.selectionMirror = i.in
        this.selectedSegment = i
        this.penMode = false
        return
      }

      switch (type) {
        case "in":
          this.selectionMirror = root.out;
          break;
        case "out":
          this.selectionMirror = root.in;
          break;
        default:
          this.selectionMirror = null;
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
      if (this.path.length === 0) {
        item.in = undefined
      }
      if (this.pathClosed) {
        item.out = undefined
      }

      this.path.push(item);
      return item
    },
    onCreatePathDown(e) {
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
      this.selectionMirror = item.in;
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
        this.selection.x += p.x - this.offset.x;
        this.selection.y += p.y - this.offset.y;

        if (this.pathClosed) {
          const start = this.path[0]
          const last = this.path[this.path.length - 1]
          if (this.selection === start) {
            last.x = this.selection.x
            last.y = this.selection.y
          }
          if (this.selection === last) {
            start.x = this.selection.x
            start.y = this.selection.y
          }
        }

        if (this.selection.in) {
          this.selection.in.x += p.x - this.offset.x;
          this.selection.in.y += p.y - this.offset.y;
        }
        if (this.selection.out) {
          this.selection.out.x += p.x - this.offset.x;
          this.selection.out.y += p.y - this.offset.y;
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
    }
  },
  computed: {
    render() {
      return toSvg(this.path, this.pathClosed);
    },
    selectionIndex() {
      return this.path.indexOf(this.selectedSegment);
    },
    prev() {
      return this.path[(this.selectionIndex - 1) % this.path.length];
    },
    next() {
      return this.path[(this.selectionIndex + 1) % this.path.length];
    }
  }
});
