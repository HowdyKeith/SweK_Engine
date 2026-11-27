// WebGLEngine/render/advisorTrace.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is render/advisorTrace-selfcheck.mjs)
//
// THE ADVICE OVER TIME, for the Sub Aquarium's advisor box (backlog `advisor-toggle-on-the-aquarium-page`, the part it listed as NOT DONE: "a view of the advice over time").
// The list line says what the rule advises NOW (render/needsView.mjs: "ADVISOR (surfaces under 45%)"); this keeps the last TRACE_SECONDS of a sub's readings while its advisor is on and draws them:
// the charge against the rule's threshold (brain/needsAdvisor.mjs's adviceOf, which is brain/needsTask.mjs's obsThreshold at the sub's depth), the depth, and a band under each for the time the rule
// advised SURFACE, PUMP and REPAIR. Watching it, a person sees the thing the rule is: the threshold falls as the boat goes deeper, and the boat is sent up when its charge line crosses it.
// The time is the event's own clock (the snapshot's needs.t, the seconds since the needs event started), so the trace is in tank seconds whatever the page's speed. A clock that goes BACKWARDS
// is a new event on the same sub and starts a new trace. A sub whose advisor is off, or that has left the tank, keeps nothing.
// Pure: no DOM, no clock, no Math.random. The page holds the traces and puts the SVG text in a box.
"use strict";

export const TRACE_SECONDS = 300, MAX_POINTS = 900;
export const BANDS = Object.freeze([
    Object.freeze({ key: "surface", label: "surface", color: "#4aa3df" }),
    Object.freeze({ key: "pump", label: "pump", color: "#e0a030" }),
    Object.freeze({ key: "repair", label: "repair", color: "#5cb85c" }),
]);

const num = (v) => (Number.isFinite(v) ? v : null);

/** One point from a snapshot row, or null when the row has no needs, no clock or no advisor on. */
export function pointOf(row) {
    const n = row && row.needs, a = n && n.advisor;
    if (!n || !a || !a.on || num(n.t) === null) return null;
    return { t: n.t, frac: num(n.frac), threshold: num(a.threshold), depth: num(n.depth), collapse: num(n.collapseDepth), surface: !!a.surface, pump: !!a.pump, repair: !!a.repair };
}

/** Add a snapshot (an array of rows) to `traces` (a Map id -> points, changed in place) and return it. A sub not in the snapshot, or with its advisor off, is dropped; a clock that goes back starts again. */
export function record(traces, rows, { seconds = TRACE_SECONDS, maxPoints = MAX_POINTS } = {}) {
    if (!(traces instanceof Map)) throw new Error("advisorTrace.record: traces must be a Map");
    const seen = new Set();
    for (const row of rows || []) {
        const p = pointOf(row); if (!p) continue;
        seen.add(row.id);
        let pts = traces.get(row.id);
        if (!pts || (pts.length && p.t < pts[pts.length - 1].t)) { pts = []; traces.set(row.id, pts); }
        if (pts.length && p.t === pts[pts.length - 1].t) pts[pts.length - 1] = p; else pts.push(p);
        let drop = 0; while (drop < pts.length && pts[drop].t < p.t - seconds) drop++;
        if (pts.length - drop > maxPoints) drop = pts.length - maxPoints;
        if (drop) pts.splice(0, drop);
    }
    for (const id of [...traces.keys()]) if (!seen.has(id)) traces.delete(id);
    return traces;
}

/** The seconds each band was advised over the points (a point's advice holds until the next point's time), and the number of times SURFACE was switched on: { surface, pump, repair, surfacings, span }. */
export function summaryOf(pts) {
    const out = { surface: 0, pump: 0, repair: 0, surfacings: 0, span: 0 };
    if (!pts || !pts.length) return out;
    for (let i = 0; i + 1 < pts.length; i++) { const dt = pts[i + 1].t - pts[i].t; for (const b of BANDS) if (pts[i][b.key]) out[b.key] += dt; }
    for (let i = 0; i < pts.length; i++) if (pts[i].surface && (i === 0 || !pts[i - 1].surface)) out.surfacings++;
    out.span = pts[pts.length - 1].t - pts[0].t;
    return out;
}

/** The line under the chart, for a reader that does not see it. */
export function summaryLine(pts) {
    if (!pts || !pts.length) return "no advice yet";
    const s = summaryOf(pts), last = pts[pts.length - 1], r = (v) => Math.round(v), pct = (v) => (v === null ? "?" : Math.round(v * 100));
    return `last ${r(s.span)} s: charge ${pct(last.frac)}% against a threshold of ${pct(last.threshold)}% at ${last.depth === null ? "?" : r(last.depth)} m; advised to surface ${s.surfacings} time${s.surfacings === 1 ? "" : "s"} (${r(s.surface)} s), pump ${r(s.pump)} s, repair ${r(s.repair)} s`;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The chart as SHAPES, w x h: { w, h, label, nodes: [{ tag, attrs, text?, title? }] } -- the charge (solid) and the threshold (dashed) on 0..1, the depth (faint, 0 at the top to the collapse depth at the bottom), and the three bands under the plot.
 * Shapes and not markup: sub-aquarium.html writes no markup at all (tools/ship/subAquariumPage-selfcheck.mjs: no innerHTML anywhere in the page, since it shows text that arrives from the network), so the page builds these with
 * createElementNS and textContent (mountSvg below). Every attribute value is a number or a constant of this file; `text` and `title` are this file's own words.
 */
export function traceShapes(pts, { w = 360, h = 130, seconds = TRACE_SECONDS } = {}) {
    const bandH = 7, gap = 2, plotH = h - BANDS.length * (bandH + gap) - 14, x0 = 42, x1 = w - 4, y0 = 4, y1 = y0 + plotH, nodes = [];
    nodes.push({ tag: "rect", attrs: { x: x0, y: y0, width: x1 - x0, height: plotH, fill: "none", stroke: "currentColor", "stroke-opacity": 0.25 } });
    nodes.push({ tag: "text", attrs: { x: x0 - 3, y: y0 + 8, "font-size": 9, "text-anchor": "end", fill: "currentColor" }, text: "100%" }, { tag: "text", attrs: { x: x0 - 3, y: y1, "font-size": 9, "text-anchor": "end", fill: "currentColor" }, text: "0%" });
    if (pts && pts.length) {
        const tEnd = pts[pts.length - 1].t, tStart = tEnd - seconds, X = (t) => x0 + ((t - tStart) / seconds) * (x1 - x0), Y = (v) => y1 - Math.max(0, Math.min(1, v)) * plotH;
        const line = (f) => pts.filter((p) => f(p) !== null).map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)},${Y(f(p)).toFixed(1)}`).join("");
        const depth = line((p) => (p.depth === null || !p.collapse ? null : 1 - p.depth / p.collapse)), thr = line((p) => p.threshold), chg = line((p) => p.frac);
        if (depth) nodes.push({ tag: "path", attrs: { d: depth, fill: "none", stroke: "currentColor", "stroke-opacity": 0.3, "stroke-width": 1 }, title: "depth (top 0 m, bottom the collapse depth)" });
        if (thr) nodes.push({ tag: "path", attrs: { d: thr, fill: "none", stroke: "#d9534f", "stroke-width": 1.5, "stroke-dasharray": "4 3" }, title: "the rule's threshold at this depth" });
        if (chg) nodes.push({ tag: "path", attrs: { d: chg, fill: "none", stroke: "currentColor", "stroke-width": 1.8 }, title: "charge" });
        BANDS.forEach((b, k) => {
            const yb = y1 + 4 + k * (bandH + gap);
            nodes.push({ tag: "text", attrs: { x: x0 - 3, y: yb + bandH - 1, "font-size": 8, "text-anchor": "end", fill: "currentColor" }, text: b.label });
            for (let i = 0; i < pts.length; i++) {
                if (!pts[i][b.key]) continue;
                const tA = Math.max(pts[i].t, tStart), tB = i + 1 < pts.length ? pts[i + 1].t : pts[i].t; if (tB <= tA) continue;
                nodes.push({ tag: "rect", attrs: { x: +X(tA).toFixed(1), y: yb, width: +Math.max(0.5, X(tB) - X(tA)).toFixed(1), height: bandH, fill: b.color }, band: b.key });
            }
        });
    } else nodes.push({ tag: "text", attrs: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, "font-size": 11, "text-anchor": "middle", fill: "currentColor", "fill-opacity": 0.6 }, text: "no advice yet" });
    return { w, h, label: summaryLine(pts), nodes };
}

/** The same chart as SVG text (for a file or a test; the page uses mountSvg). */
export function traceSvg(pts, opts = {}) {
    const { w, h, label, nodes } = traceShapes(pts, opts), at = (a) => Object.entries(a).map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">` +
        nodes.map((n) => `<${n.tag}${at(n.attrs)}>${n.title ? `<title>${esc(n.title)}</title>` : ""}${n.text !== undefined ? esc(n.text) : ""}</${n.tag}>`).join("") + "</svg>";
}

/** Build the chart into `host` (a DOM element) with createElementNS and textContent, replacing what was there; `doc` is the document. Returns the svg element. */
export function mountSvg(host, shapes, doc = host.ownerDocument) {
    const NS = "http://www.w3.org/2000/svg", svg = doc.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${shapes.w} ${shapes.h}`); svg.setAttribute("width", String(shapes.w)); svg.setAttribute("height", String(shapes.h)); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", shapes.label);
    for (const n of shapes.nodes) {
        const el = doc.createElementNS(NS, n.tag);
        for (const [k, v] of Object.entries(n.attrs)) el.setAttribute(k, String(v));
        if (n.title) { const t = doc.createElementNS(NS, "title"); t.textContent = n.title; el.appendChild(t); }
        if (n.text !== undefined) el.appendChild(doc.createTextNode(n.text));
        svg.appendChild(el);
    }
    host.replaceChildren(svg);
    return svg;
}
