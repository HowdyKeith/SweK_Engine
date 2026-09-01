// ui/procBrushCanvas.js -- v4216 -- the renderer for fx/procBrush.mjs.
//
// fx/procBrush.mjs turns a stroke into SEGMENTS and knows nothing about a canvas. This is the half that owns
// the canvas and the pointer, and it is deliberately small: everything worth reasoning about is next door and
// gated in node.
//
// *** THE ONE THING THIS FILE MUST GET RIGHT IS THAT IT NEVER REDRAWS. *** These brushes accumulate -- the
// mark IS the accumulated alpha of thousands of translucent segments -- so clearing and re-rendering the
// stroke each frame would both destroy the accumulation and cost O(n) per point. Segments are drawn ONCE, as
// they are produced, and the canvas is the document.
import { BRUSHES, DEFAULTS, dedupe, StrokeIndex } from "../fx/procBrush.mjs";

export function mountProcBrush(canvas, opts = {}) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, reason: "no 2d context" };

    const state = {
        brush: opts.brush || "sketchy",
        colour: opts.colour || "#e8f0ff",
        opts: { ...DEFAULTS, ...(opts.brushOpts || {}) },
        points: [],
        // The index is grown as the stroke is drawn -- the same order strokeSegments uses, so a live
        // drawing and a replayed one produce identical marks.
        index: null,
        drawing: false,
        strokes: 0,
        segments: 0,
    };

    function paint(segs) {
        for (const s of segs) {
            ctx.globalAlpha = Math.max(0, Math.min(1, s.alpha));
            ctx.lineWidth = s.width;
            ctx.beginPath();
            ctx.moveTo(s.x1, s.y1);
            ctx.lineTo(s.x2, s.y2);
            ctx.stroke();
            state.segments++;
        }
        ctx.globalAlpha = 1;
    }

    function posOf(e) {
        const r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (canvas.width / r.width),
                 y: (e.clientY - r.top) * (canvas.height / r.height),
                 t: e.timeStamp || performance.now() };
    }

    function down(e) {
        state.drawing = true; state.points = [posOf(e)]; state.strokes++;
        state.index = new StrokeIndex(state.opts.radius);
        state.index.add(state.points[0], 0);
        ctx.strokeStyle = state.colour; ctx.lineCap = "round";
        try { canvas.setPointerCapture(e.pointerId); } catch {}
    }
    function move(e) {
        if (!state.drawing) return;
        // Deduping happens HERE, on the way in, so the pile a stalled hand creates never enters the stroke at
        // all -- it is the precondition for both the neighbour bound and the alpha guard next door.
        const next = dedupe(state.points.concat([posOf(e)]), state.opts.minSpacing);
        if (next.length === state.points.length) return;       // the new point was too close; nothing happened
        state.points = next;
        const fn = BRUSHES[state.brush] || BRUSHES.sketchy;
        const i = state.points.length - 1;
        paint(fn(state.points, i, { ...state.opts, index: state.index }));
        state.index.add(state.points[i], i);
    }
    function up() { state.drawing = false; }

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", up);

    return {
        ok: true,
        setBrush: (n) => { if (BRUSHES[n]) state.brush = n; return state.brush; },
        setColour: (c) => { state.colour = c; },
        setOpts: (o) => { state.opts = { ...state.opts, ...o }; },
        clear: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); state.segments = 0; state.strokes = 0; },
        stats: () => ({ brush: state.brush, strokes: state.strokes, segments: state.segments, points: state.points.length }),
        destroy: () => {
            canvas.removeEventListener("pointerdown", down);
            canvas.removeEventListener("pointermove", move);
            canvas.removeEventListener("pointerup", up);
            canvas.removeEventListener("pointercancel", up);
            canvas.removeEventListener("pointerleave", up);
        },
    };
}
export default mountProcBrush;
