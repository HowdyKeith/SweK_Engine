// SVG backend (docs/DESIGN.md §4: "SVG first — exact, resolution-independent vector
// output"). Pure: it only turns `RenderStroke`s into an SVG string and knows
// nothing about geometry, cameras, or the pipeline upstream of the emit contract.
function fmt(n, prec) {
    // fixed then trim trailing zeros / dot
    return n.toFixed(prec).replace(/\.?0+$/, "");
}
const isGroup = (i) => i.strokes !== undefined;
function polyline(s, prec, indent) {
    const pts = s.path.map((p) => `${fmt(p[0], prec)},${fmt(p[1], prec)}`).join(" ");
    const st = s.style;
    const attrs = [
        `points="${pts}"`,
        `fill="none"`,
        `stroke="${st.color}"`,
        `stroke-width="${fmt(st.weight, 3)}"`,
        st.opacity !== 1 ? `stroke-opacity="${fmt(st.opacity, 3)}"` : "",
        st.dash && st.dash.length ? `stroke-dasharray="${st.dash.map((d) => fmt(d, 3)).join(",")}"` : "",
        `stroke-linecap="round"`,
        `stroke-linejoin="round"`,
    ].filter(Boolean);
    return `${indent}<polyline ${attrs.join(" ")} />`;
}
/**
 * A variable-width stroke as a filled ribbon: offset each vertex by ±w/2 along the
 * local screen normal and fill the resulting band. Gives smooth taper/pressure
 * that SVG's uniform `stroke-width` can't. The centreline stays dense (post-wobble)
 * so the outline reads as smooth.
 */
function ribbon(s, prec, indent) {
    const p = s.path;
    const w = s.width;
    const n = p.length;
    const left = [];
    const right = [];
    for (let i = 0; i < n; i++) {
        const prev = p[Math.max(0, i - 1)];
        const next = p[Math.min(n - 1, i + 1)];
        let tx = next[0] - prev[0];
        let ty = next[1] - prev[1];
        const len = Math.hypot(tx, ty) || 1;
        tx /= len;
        ty /= len;
        const nx = -ty;
        const ny = tx;
        const h = (w[i] ?? w[n - 1] ?? s.style.weight) / 2;
        left.push([p[i][0] + nx * h, p[i][1] + ny * h]);
        right.push([p[i][0] - nx * h, p[i][1] - ny * h]);
    }
    const pt = (q) => `${fmt(q[0], prec)},${fmt(q[1], prec)}`;
    const d = [
        `M ${pt(left[0])}`,
        ...left.slice(1).map((q) => `L ${pt(q)}`),
        ...right.reverse().map((q) => `L ${pt(q)}`),
        "Z",
    ].join(" ");
    const st = s.style;
    const attrs = [
        `d="${d}"`,
        `fill="${st.color}"`,
        st.opacity !== 1 ? `fill-opacity="${fmt(st.opacity, 3)}"` : "",
        // a hairline stroke of the same colour smooths the faceted ribbon edges
        `stroke="${st.color}"`,
        `stroke-width="0.4"`,
        st.opacity !== 1 ? `stroke-opacity="${fmt(st.opacity, 3)}"` : "",
        `stroke-linejoin="round"`,
    ].filter(Boolean);
    return `${indent}<path ${attrs.join(" ")} />`;
}
/** A stroke's centreline as a single open `<path>` (M…L…) at constant width — the
 *  pen-plotter form: one path per stroke, no fill, no ribbon. */
function centerlinePath(s, prec, indent) {
    const st = s.style;
    const d = s.path.map((p, i) => `${i === 0 ? "M" : "L"} ${fmt(p[0], prec)},${fmt(p[1], prec)}`).join(" ");
    const attrs = [
        `d="${d}"`,
        `fill="none"`,
        `stroke="${st.color}"`,
        `stroke-width="${fmt(st.weight, 3)}"`,
        st.opacity !== 1 ? `stroke-opacity="${fmt(st.opacity, 3)}"` : "",
        st.dash && st.dash.length ? `stroke-dasharray="${st.dash.map((d) => fmt(d, 3)).join(",")}"` : "",
        `stroke-linecap="round"`,
        `stroke-linejoin="round"`,
    ].filter(Boolean);
    return `${indent}<path ${attrs.join(" ")} />`;
}
/** A solid variable-width stroke renders as a ribbon; everything else as a stroke.
 *  In `centerline` mode every stroke is a single-line `<path>` (see `SvgOptions`). */
function strokeSVG(s, prec, indent, centerline) {
    if (centerline)
        return centerlinePath(s, prec, indent);
    const dashed = s.style.dash && s.style.dash.length;
    return s.width && s.width.length === s.path.length && !dashed ? ribbon(s, prec, indent) : polyline(s, prec, indent);
}
/** Render styled strokes (and opacity groups) to a standalone SVG document. */
export function renderItemsSVG(items, viewport, opts = {}) {
    const prec = opts.precision ?? 2;
    const centerline = opts.centerline ?? false;
    const { width, height } = viewport;
    const body = [];
    body.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`);
    if (opts.background)
        body.push(`  <rect width="${width}" height="${height}" fill="${opts.background}" />`);
    for (const item of items) {
        if (isGroup(item)) {
            const members = item.strokes.filter((s) => s.path.length >= 2);
            if (members.length === 0)
                continue;
            body.push(`  <g opacity="${fmt(item.opacity, 3)}">`);
            for (const s of members)
                body.push(strokeSVG(s, prec, "    ", centerline));
            body.push(`  </g>`);
        }
        else if (item.path.length >= 2) {
            body.push(strokeSVG(item, prec, "  ", centerline));
        }
    }
    body.push(`</svg>`);
    return body.join("\n");
}
/** Render styled strokes to a standalone SVG document string. */
export function renderStrokesSVG(strokes, viewport, opts = {}) {
    return renderItemsSVG(strokes, viewport, opts);
}
//# sourceMappingURL=svg.js.map