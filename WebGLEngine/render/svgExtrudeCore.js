// WebGLEngine/render/svgExtrudeCore.js — v3831 (SVG -> 3D "forge", after CatsJuice/medal-forge)
//
// TURN SVG PATHS INTO CLEAN 2D OUTLINES READY TO EXTRUDE, with no Three.js in it so the parsing can be pinned by
// an answer key. medal-forge extrudes SVG layers into 3D medals/badges; this is the vector counterpart to the
// sprite-loft (v3828) -- where that radial-sampled a raster silhouette and convex-bridged notches, this reads the
// actual path, so concavities and HOLES survive (a shield with a cut-out, a ring, a star's inner points). The
// Three.js half (svgExtrude.js) turns these into THREE.Shape + ExtrudeGeometry with bevel and thickness.
//
// Supports the path commands that cover emblem art: M/L/H/V/C/S/Q/T/Z (absolute + relative), and A flattened as
// an elliptical arc. Ignores <transform> and CSS (a documented limit -- flatten transforms before forging).

const flatten = (arr) => arr; // (kept for readability at call sites)

function tokenize(d) {
    const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g;
    const out = []; let m;
    while ((m = re.exec(d))) out.push(m[1] ? { cmd: m[1] } : { num: parseFloat(m[2]) });
    return out;
}

function cubic(p0, p1, p2, p3, steps, push) {
    for (let i = 1; i <= steps; i++) { const t = i / steps, u = 1 - t;
        push(u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x, u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y); }
}
function quad(p0, p1, p2, steps, push) {
    for (let i = 1; i <= steps; i++) { const t = i / steps, u = 1 - t;
        push(u*u*p0.x + 2*u*t*p1.x + t*t*p2.x, u*u*p0.y + 2*u*t*p1.y + t*t*p2.y); }
}
// endpoint -> center arc parameterization, sampled to line segments.
function arc(p0, rx, ry, rot, large, sweep, p1, push, seg = 24) {
    rx = Math.abs(rx); ry = Math.abs(ry); if (!rx || !ry) { push(p1.x, p1.y); return; }
    const phi = rot * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi);
    const dx = (p0.x - p1.x) / 2, dy = (p0.y - p1.y) / 2;
    const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
    let l = (x1*x1)/(rx*rx) + (y1*y1)/(ry*ry); if (l > 1) { const s = Math.sqrt(l); rx *= s; ry *= s; }
    const num = rx*rx*ry*ry - rx*rx*y1*y1 - ry*ry*x1*x1, den = rx*rx*y1*y1 + ry*ry*x1*x1;
    let co = Math.sqrt(Math.max(0, num / den)); if (large === sweep) co = -co;
    const cxp = co * rx * y1 / ry, cyp = -co * ry * x1 / rx;
    const cx = cp * cxp - sp * cyp + (p0.x + p1.x) / 2, cy = sp * cxp + cp * cyp + (p0.y + p1.y) / 2;
    const ang = (ux, uy, vx, vy) => { const d = Math.hypot(ux, uy) * Math.hypot(vx, vy); let c = (ux*vx + uy*vy) / d; c = Math.max(-1, Math.min(1, c)); let a = Math.acos(c); if (ux*vy - uy*vx < 0) a = -a; return a; };
    let th1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
    let dth = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
    if (!sweep && dth > 0) dth -= 2 * Math.PI; if (sweep && dth < 0) dth += 2 * Math.PI;
    const n = Math.max(2, Math.ceil(Math.abs(dth) / (Math.PI / seg)));
    for (let i = 1; i <= n; i++) { const th = th1 + dth * (i / n), c = Math.cos(th), s = Math.sin(th);
        push(cp * rx * c - sp * ry * s + cx, sp * rx * c + cp * ry * s + cy); }
}

// Parse one path "d" into an array of subpaths, each an array of {x,y}. Curves are flattened.
export function parsePathData(d, curveSteps = 18) {
    const t = tokenize(d); const subs = []; let cur = null;
    let cx = 0, cy = 0, sx = 0, sy = 0, i = 0, cmd = "", pcx = 0, pcy = 0, prevC = "";
    const num = () => (t[i] && t[i].num !== undefined ? t[i++].num : 0);
    const push = (x, y) => { cur.push({ x, y }); cx = x; cy = y; };
    while (i < t.length) {
        if (t[i].cmd) { cmd = t[i++].cmd; } // else repeat previous command with new coords
        const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
        if (C === "M") { const x = num() + (rel ? cx : 0), y = num() + (rel ? cy : 0); cur = [{ x, y }]; subs.push(cur); cx = x; cy = y; sx = x; sy = y; cmd = rel ? "l" : "L"; }
        else if (C === "L") { push(num() + (rel ? cx : 0), num() + (rel ? cy : 0)); }
        else if (C === "H") { push(num() + (rel ? cx : 0), cy); }
        else if (C === "V") { push(cx, num() + (rel ? cy : 0)); }
        else if (C === "C") { const p1 = { x: num() + (rel ? cx : 0), y: num() + (rel ? cy : 0) }, p2 = { x: num() + (rel ? cx : 0), y: num() + (rel ? cy : 0) }, p3 = { x: num() + (rel ? cx : 0), y: num() + (rel ? cy : 0) }; cubic({ x: cx, y: cy }, p1, p2, p3, curveSteps, push); pcx = p2.x; pcy = p2.y; }
        else if (C === "S") { const p1 = (prevC === "C" || prevC === "S") ? { x: 2 * cx - pcx, y: 2 * cy - pcy } : { x: cx, y: cy }; const p2 = { x: num() + (rel ? cx : 0), y: num() + (rel ? cy : 0) }, p3 = { x: num() + (rel ? cx : 0), y: num() + (rel ? cy : 0) }; cubic({ x: cx, y: cy }, p1, p2, p3, curveSteps, push); pcx = p2.x; pcy = p2.y; }
        else if (C === "Q") { const p1 = { x: num() + (rel ? cx : 0), y: num() + (rel ? cy : 0) }, p2 = { x: num() + (rel ? cx : 0), y: num() + (rel ? cy : 0) }; quad({ x: cx, y: cy }, p1, p2, curveSteps, push); pcx = p1.x; pcy = p1.y; }
        else if (C === "T") { const p1 = (prevC === "Q" || prevC === "T") ? { x: 2 * cx - pcx, y: 2 * cy - pcy } : { x: cx, y: cy }; const p2 = { x: num() + (rel ? cx : 0), y: num() + (rel ? cy : 0) }; quad({ x: cx, y: cy }, p1, p2, curveSteps, push); pcx = p1.x; pcy = p1.y; }
        else if (C === "A") { const rx = num(), ry = num(), rot = num(), large = num(), sweep = num(), x = num() + (rel ? cx : 0), y = num() + (rel ? cy : 0); arc({ x: cx, y: cy }, rx, ry, rot, large, sweep, { x, y }, push); }
        else if (C === "Z") { if (cur && cur.length) { cx = sx; cy = sy; } }
        else { i++; }
        prevC = C;
    }
    return subs.filter((s) => s.length >= 2);
}

// Extract every <path d="..."> from an SVG string (transforms/CSS ignored) -> flat list of subpaths.
export function parseSvgShapes(svg, curveSteps = 18) {
    const subs = []; const re = /<path\b[^>]*\bd\s*=\s*"([^"]+)"/gi; let m;
    while ((m = re.exec(svg))) for (const s of parsePathData(m[1], curveSteps)) subs.push(s);
    // also support <polygon points="..."> and <polyline>
    const rp = /<polygon\b[^>]*\bpoints\s*=\s*"([^"]+)"/gi;
    while ((m = rp.exec(svg))) { const nums = (m[1].match(/-?[\d.]+(?:e[-+]?\d+)?/gi) || []).map(Number); const p = []; for (let k = 0; k + 1 < nums.length; k += 2) p.push({ x: nums[k], y: nums[k + 1] }); if (p.length >= 3) subs.push(p); }
    return subs;
}

export function signedArea(pts) { let a = 0; for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p.x * q.y - q.x * p.y; } return a / 2; }
export function bounds(subs) { let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity; for (const s of subs) for (const p of s) { if (p.x < mnx) mnx = p.x; if (p.y < mny) mny = p.y; if (p.x > mxx) mxx = p.x; if (p.y > mxy) mxy = p.y; } return { mnx, mny, mxx, mxy, w: mxx - mnx, h: mxy - mny }; }
export function pointInPolygon(pt, poly) { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (((a.y > pt.y) !== (b.y > pt.y)) && (pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x)) inside = !inside; } return inside; }

// Center on origin, scale so the larger extent == size, FLIP Y (SVG is y-down; shapes are y-up).
export function normalizeShapes(subs, size = 2) {
    const b = bounds(subs); const ext = Math.max(b.w, b.h) || 1, scale = size / ext, cx = (b.mnx + b.mxx) / 2, cy = (b.mny + b.mxy) / 2;
    return subs.map((s) => s.map((p) => ({ x: (p.x - cx) * scale, y: -(p.y - cy) * scale })));
}

// Classify normalized subpaths into outers with holes (largest containing subpath owns a contained one).
export function classifyShapes(subs) {
    const byArea = subs.map((p) => ({ p, a: Math.abs(signedArea(p)) })).sort((x, y) => y.a - x.a);
    const outers = [];
    for (const { p } of byArea) { let placed = false; for (const o of outers) if (pointInPolygon(p[0], o.outer)) { o.holes.push(p); placed = true; break; } if (!placed) outers.push({ outer: p, holes: [] }); }
    return outers;
}

// The whole pure pipeline: svg string -> [{outer:[{x,y}], holes:[[{x,y}]]}], centered/unit/+Y-up. null if empty.
export function svgToShapes(svg, opts = {}) {
    const subs = parseSvgShapes(svg, opts.curveSteps);
    if (!subs.length) return null;
    return classifyShapes(normalizeShapes(subs, opts.size || 2));
}
