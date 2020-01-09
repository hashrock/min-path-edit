function toSvg(path) {
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
  return result.join(" ");
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
        {
          x: 20,
          y: 20,
          out: { x: 100, y: 020 }
        },
        {
          x: 100,
          y: 300,
          mirror: true,
          in: { x: 100, y: 220 },
          out: { x: 210, y: 130 }
        },
        {
          x: 300,
          y: 300,
          in: { x: 200, y: 120 }
        }
      ],
      selection: null,
      selectedSegment: null,
      selectionMirror: null,
      offset: null,
      anchorChange: false
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
    onPointerMove(e) {
      if (this.offset) {
        let p = screenToSvg(
          { x: e.clientX, y: e.clientY },
          this.$refs.canv,
          this.$refs.canv
        );
        this.selection.x += p.x - this.offset.x;
        this.selection.y += p.y - this.offset.y;

        if (this.selection.in) {
          this.selection.in.x += p.x - this.offset.x;
          this.selection.in.y += p.y - this.offset.y;
        }
        if (this.selection.out) {
          this.selection.out.x += p.x - this.offset.x;
          this.selection.out.y += p.y - this.offset.y;
        }

        if (this.selectedSegment != this.selection) {
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
      return toSvg(this.path);
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
