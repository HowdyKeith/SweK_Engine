// FILE: data/meshThumbnail.js
// VERSION: v1 (v809 — thumbnails for mesh + splat asset types)
//
// Mesh thumbnail: renders an iso-projected wireframe bounding box. When the
// asset's meta.stats has a bbox {min, max}, we draw the 12 edges of that
// box scaled to fit. Different meshes get different box proportions, so
// tall things look tall and flat things look flat — usable for triage.
//
// Splat thumbnail: renders a deterministic scatter cloud of points whose
// density and color hue scale with the asset's vertex count. Not the actual
// splat positions (would require parsing the binary PLY) but gives a
// distinctive cloud-shaped silhouette.

const ISO_X = [1, 0.5];
const ISO_Y = [0, -1];
const ISO_Z = [-1, 0.5];

/**
 * Render an iso wireframe of a bounding box.
 *
 * @param {Object} bbox — { min: [x,y,z], max: [x,y,z] }
 * @param {Object} opts — { size = 96, padding = 8, color = "#7af" }
 * @returns {string|null} data URL
 */
export function meshBboxToDataUrl(bbox, opts = {}) {
    if (!bbox?.min || !bbox?.max) return null;
    const size = opts.size || 96;
    const padding = opts.padding ?? 8;
    const lineColor = opts.color || "#7af";
    const canvas = _makeCanvas(size);
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const [x0, y0, z0] = bbox.min;
    const [x1, y1, z1] = bbox.max;
    // 8 corners of the box
    const corners = [
        [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],   // bottom
        [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],   // top
    ];
    // Project to iso 2D
    const projected = corners.map(([x, y, z]) => [
        x * ISO_X[0] + y * ISO_Y[0] + z * ISO_Z[0],
        x * ISO_X[1] + y * ISO_Y[1] + z * ISO_Z[1],
    ]);
    // Compute screen bbox of projected corners
    let minSx = Infinity, maxSx = -Infinity, minSy = Infinity, maxSy = -Infinity;
    for (const [sx, sy] of projected) {
        if (sx < minSx) minSx = sx; if (sx > maxSx) maxSx = sx;
        if (sy < minSy) minSy = sy; if (sy > maxSy) maxSy = sy;
    }
    const avail = size - 2 * padding;
    const sw = maxSx - minSx || 1, sh = maxSy - minSy || 1;
    const scale = Math.min(avail / sw, avail / sh);
    const offsetX = (size - sw * scale) / 2 - minSx * scale;
    const offsetY = (size - sh * scale) / 2 - minSy * scale;
    const projScreen = projected.map(([sx, sy]) => [sx * scale + offsetX, sy * scale + offsetY]);

    // Draw 12 edges of the bounding box.
    const edges = [
        [0,1],[1,2],[2,3],[3,0],
        [4,5],[5,6],[6,7],[7,4],
        [0,4],[1,5],[2,6],[3,7],
    ];
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (const [a, b] of edges) {
        const [ax, ay] = projScreen[a];
        const [bx, by] = projScreen[b];
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
    }
    ctx.stroke();

    // Small "mesh" indicator dot in lower-right
    ctx.fillStyle = lineColor;
    ctx.font = "bold 9px monospace";
    ctx.fillText("△", size - 12, size - 4);

    return _toDataUrl(canvas);
}

/**
 * v811 — Render actual sampled geometry as projected points. Uses the
 * geomSample.points array from the bridge's GLB parser.
 * v812 — When geomSample.edges is present, draws triangle wireframe
 * (lines connecting points by edge index pairs). Falls back to points-
 * only otherwise.
 *
 * @param {Object} geomSample — { points: [[x,y,z]...], edges?: [[i,j]...], bbox }
 * @param {Object} opts — { size = 96, color = "#7af", padding = 6 }
 * @returns {string|null} data URL
 */
export function meshGeomToDataUrl(geomSample, opts = {}) {
    if (!geomSample?.points || geomSample.points.length === 0) return null;
    const size = opts.size || 96;
    const padding = opts.padding ?? 6;
    const baseHue = opts.hue ?? 205;
    const canvas = _makeCanvas(size);
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Project all points to iso 2D
    const projected = geomSample.points.map(([x, y, z], origIdx) => ({
        sx: x * ISO_X[0] + y * ISO_Y[0] + z * ISO_Z[0],
        sy: x * ISO_X[1] + y * ISO_Y[1] + z * ISO_Z[1],
        depth: z - x,
        origIdx,
    }));
    let minSx = Infinity, maxSx = -Infinity, minSy = Infinity, maxSy = -Infinity;
    let minD = Infinity, maxD = -Infinity;
    for (const p of projected) {
        if (p.sx < minSx) minSx = p.sx; if (p.sx > maxSx) maxSx = p.sx;
        if (p.sy < minSy) minSy = p.sy; if (p.sy > maxSy) maxSy = p.sy;
        if (p.depth < minD) minD = p.depth; if (p.depth > maxD) maxD = p.depth;
    }
    const sw = maxSx - minSx || 1, sh = maxSy - minSy || 1;
    const avail = size - 2 * padding;
    const scale = Math.min(avail / sw, avail / sh);
    const offsetX = (size - sw * scale) / 2 - minSx * scale;
    const offsetY = (size - sh * scale) / 2 - minSy * scale;
    const depthRange = maxD - minD || 1;

    // Pre-compute screen positions keyed by orig index for edge lookups
    const screen = projected.map(p => ({
        x: p.sx * scale + offsetX,
        y: p.sy * scale + offsetY,
        depth: p.depth,
        t: (p.depth - minD) / depthRange,
        origIdx: p.origIdx,
    }));
    const byOrigIdx = new Map();
    for (const s of screen) byOrigIdx.set(s.origIdx, s);

    // v812 — wireframe: draw edges as lines, sorted by avg depth back-to-front
    if (Array.isArray(geomSample.edges) && geomSample.edges.length > 0) {
        const edgeRecs = [];
        for (const [a, b] of geomSample.edges) {
            const sa = byOrigIdx.get(a);
            const sb = byOrigIdx.get(b);
            if (!sa || !sb) continue;
            edgeRecs.push({ sa, sb, avgT: (sa.t + sb.t) * 0.5 });
        }
        edgeRecs.sort((a, b) => a.avgT - b.avgT);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (const e of edgeRecs) {
            const t = e.avgT;
            const lite = 30 + t * 40;
            const alpha = 0.4 + t * 0.5;
            ctx.strokeStyle = `hsla(${baseHue}, 65%, ${lite}%, ${alpha.toFixed(2)})`;
            ctx.lineWidth = 0.9 + t * 0.5;
            ctx.beginPath();
            ctx.moveTo(e.sa.x, e.sa.y);
            ctx.lineTo(e.sb.x, e.sb.y);
            ctx.stroke();
        }
    } else {
        // Points-only render (no indices in source)
        const sorted = screen.slice().sort((a, b) => a.depth - b.depth);
        for (const p of sorted) {
            const lite = 32 + p.t * 38;
            const alpha = 0.5 + p.t * 0.45;
            const r = 1.3 + p.t * 0.8;
            ctx.fillStyle = `hsla(${baseHue}, 65%, ${lite}%, ${alpha.toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // "△" indicator
    ctx.fillStyle = `hsl(${baseHue}, 65%, 70%)`;
    ctx.font = "bold 9px monospace";
    ctx.fillText("△", size - 12, size - 4);

    return _toDataUrl(canvas);
}

/**
 * Render a stylized splat cloud — deterministic scatter of points based
 * on the asset id (so the same splat always renders the same cloud).
 * Color hue scales with vertex count (more splats = warmer hue).
 *
 * @param {string} assetId — used as seed
 * @param {number} vertexCount — for density + hue
 * @param {Object} opts — { size = 96 }
 * @returns {string} data URL
 */
export function splatCloudToDataUrl(assetId, vertexCount, opts = {}) {
    const size = opts.size || 96;
    const canvas = _makeCanvas(size);
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Density: 100..400 points based on log of vertex count
    const logVerts = vertexCount > 1 ? Math.log10(vertexCount) : 1;
    const pointCount = Math.max(80, Math.min(400, Math.floor(40 + logVerts * 70)));
    // Hue: 200 (cool blue) at 1k splats -> 280 (purple) at 100k -> 320 (pink) at 1M
    const hue = Math.min(330, 180 + logVerts * 25);

    // Deterministic RNG from assetId
    let seed = 0;
    for (const ch of String(assetId)) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed & 0xFFFFFF) / 0x1000000; };

    const cx = size / 2, cy = size / 2;
    const radius = size * 0.38;

    // Draw points in a sphere-ish distribution with depth-based size + alpha
    const points = [];
    for (let i = 0; i < pointCount; i++) {
        // Uniform random point on unit sphere
        const u = rand() * 2 - 1;
        const phi = rand() * Math.PI * 2;
        const r = Math.sqrt(1 - u * u);
        const x = r * Math.cos(phi);
        const y = u;
        const z = r * Math.sin(phi);
        // Iso-ish projection
        const sx = cx + (x - z * 0.3) * radius;
        const sy = cy + (y - z * 0.2) * radius - z * radius * 0.15;
        points.push({ sx, sy, depth: z });
    }
    // Sort back-to-front
    points.sort((a, b) => a.depth - b.depth);

    for (const p of points) {
        const sat = 60 + (p.depth + 1) * 15;       // depth -> saturation
        const lite = 35 + (p.depth + 1) * 22;
        const alpha = 0.5 + (p.depth + 1) * 0.25;
        const r = 1.2 + (p.depth + 1) * 0.7;
        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lite}%, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Small "splat" indicator
    ctx.fillStyle = `hsl(${hue}, 65%, 65%)`;
    ctx.font = "bold 9px monospace";
    ctx.fillText("✦", size - 14, size - 4);

    return _toDataUrl(canvas);
}

/**
 * v811 — Render the ACTUAL sampled splat positions. Used when the bridge
 * extracted real point positions from the binary PLY data (preferred over
 * the random-scatter cloud).
 *
 * @param {Object} geomSample — { points: [[x,y,z]...], bbox }
 * @param {number} vertexCount — total source count, drives density hint
 * @param {Object} opts — { size = 96 }
 * @returns {string|null} data URL
 */
export function splatGeomToDataUrl(geomSample, vertexCount, opts = {}) {
    if (!geomSample?.points || geomSample.points.length === 0) return null;
    const size = opts.size || 96;
    const canvas = _makeCanvas(size);
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const logV = vertexCount > 1 ? Math.log10(vertexCount) : 1;
    const hue = Math.min(330, 180 + logV * 25);

    // Project sampled points to iso 2D
    const projected = geomSample.points.map(([x, y, z]) => ({
        sx: x * ISO_X[0] + y * ISO_Y[0] + z * ISO_Z[0],
        sy: x * ISO_X[1] + y * ISO_Y[1] + z * ISO_Z[1],
        depth: z - x,
    }));
    let minSx = Infinity, maxSx = -Infinity, minSy = Infinity, maxSy = -Infinity;
    let minD = Infinity, maxD = -Infinity;
    for (const p of projected) {
        if (p.sx < minSx) minSx = p.sx; if (p.sx > maxSx) maxSx = p.sx;
        if (p.sy < minSy) minSy = p.sy; if (p.sy > maxSy) maxSy = p.sy;
        if (p.depth < minD) minD = p.depth; if (p.depth > maxD) maxD = p.depth;
    }
    const sw = maxSx - minSx || 1, sh = maxSy - minSy || 1;
    const padding = 5;
    const avail = size - 2 * padding;
    const scale = Math.min(avail / sw, avail / sh);
    const offsetX = (size - sw * scale) / 2 - minSx * scale;
    const offsetY = (size - sh * scale) / 2 - minSy * scale;
    const depthRange = maxD - minD || 1;

    projected.sort((a, b) => a.depth - b.depth);

    for (const p of projected) {
        const px = p.sx * scale + offsetX;
        const py = p.sy * scale + offsetY;
        const t = (p.depth - minD) / depthRange;
        const sat = 60 + t * 25;
        const lite = 36 + t * 28;
        const alpha = 0.55 + t * 0.4;
        const r = 1.4 + t * 0.7;
        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lite}%, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // "✦" indicator
    ctx.fillStyle = `hsl(${hue}, 65%, 70%)`;
    ctx.font = "bold 9px monospace";
    ctx.fillText("✦", size - 14, size - 4);

    return _toDataUrl(canvas);
}

// ----- helpers -----
function _makeCanvas(size) {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(size, size);
    if (typeof document === "undefined") return null;          // Node test path
    const c = document.createElement("canvas");
    c.width = c.height = size;
    return c;
}
function _toDataUrl(canvas) {
    if (!canvas) return null;
    // OffscreenCanvas doesn't have toDataURL — convert via a regular canvas.
    if (typeof canvas.convertToBlob === "function") {
        if (typeof document === "undefined") return null;
        const c2 = document.createElement("canvas");
        c2.width = canvas.width; c2.height = canvas.height;
        c2.getContext("2d").drawImage(canvas, 0, 0);
        return c2.toDataURL("image/png");
    }
    return canvas.toDataURL("image/png");
}
