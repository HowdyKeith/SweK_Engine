// FILE: ui/svgPath.mjs -- v4180
//
// Measure and flatten an SVG path, in pure JavaScript, with no DOM.
//
// The technique this serves is the self-drawing line -- set stroke-dasharray to the path's length and animate
// stroke-dashoffset from that length to zero -- as in merri-ment/lazy-line-painter (MIT) and
// lcdsantos/jquery-drawsvg (MIT). SweK already dashes CIRCLES correctly: ui/svgGaugeSet.js computes
// `C = 2 * Math.PI * R` and animates the offset, which is exact because a circle's length is a formula.
// What it cannot do is dash an arbitrary PATH, because nothing here measures one.
//
// *** THE OBVIOUS PRIMITIVE IS getTotalLength(), AND IT IS THE WRONG ONE TO BUILD ON. *** It is a DOM method:
// it needs a live SVGPathElement inside a document. Anything resting on it cannot run in node, which means it
// cannot be gated the way this tree gates everything else, and it cannot be used by svg-forge or any export
// path that has no browser. So the measurement is done here from the `d` string, and the browser-side helper
// beside this file PREFERS getTotalLength when a live element happens to be at hand and uses this otherwise --
// with the gate asserting the two agree, which is a real cross-check rather than trusting either alone.
//
// ---- WHAT IS SUPPORTED, AND WHAT IS REFUSED BY NAME --------------------------------------------------------
// M L H V C S Q T A Z, absolute and relative. Arcs are included rather than skipped because they are common
// in real SVG and because skipping one would not fail -- it would return a SHORTER length, the dash would run
// out early, and the line would finish drawing before the animation did. A quiet undermeasurement is the
// characteristic failure of this whole family of libraries, so anything this parser does not understand is
// refused BY NAME instead of contributing zero.
"use strict";

/** Commands this parser implements. Anything else is refused rather than ignored. */
const KNOWN = "MmLlHhVvCcSsQqTtAaZz";
/** Arguments each command consumes per repetition. */
const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/**
 * Split a `d` string into { cmd, args } records, expanding implicit repeats (the SVG rule that "M 0 0 1 1"
 * means a moveto followed by a LINETO, not a second moveto -- a detail that silently adds or drops a segment
 * if you get it wrong).
 */
export function parsePath(d) {
    if (typeof d !== "string") throw new TypeError("parsePath: d must be a string");
    const out = [];
    // numbers: optional sign, digits with optional decimal, optional exponent. The exponent matters -- real
    // exported SVG contains 1e-5 and a naive tokeniser splits it at the minus sign.
    const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g;
    let m, cmd = null, args = [];
    const flush = () => {
        if (!cmd) return;
        const n = ARITY[cmd.toUpperCase()];
        if (n === 0) { out.push({ cmd, args: [] }); args = []; return; }
        if (args.length % n !== 0 || args.length === 0) {
            throw new Error(`parsePath: '${cmd}' takes ${n} argument(s) per repetition, got ${args.length}`);
        }
        for (let i = 0; i < args.length; i += n) {
            // *** THE IMPLICIT-REPEAT RULE: a repeated M becomes L (and m becomes l). *** Treating the repeat
            // as another moveto would break the path into pieces and drop every segment between them from the
            // measured length.
            const c = (i > 0 && (cmd === "M" || cmd === "m")) ? (cmd === "M" ? "L" : "l") : cmd;
            out.push({ cmd: c, args: args.slice(i, i + n) });
        }
        args = [];
    };
    while ((m = re.exec(d)) !== null) {
        if (m[1]) { flush(); cmd = m[1]; if (cmd === "Z" || cmd === "z") flush(); }
        else {
            if (!cmd) throw new Error("parsePath: a number appeared before any command");
            args.push(parseFloat(m[2]));
        }
    }
    flush();
    // anything the regex could not classify
    const leftovers = d.replace(re, "").replace(/[\s,]/g, "");
    if (leftovers.length) throw new Error(`parsePath: unrecognised characters in the path data: ${JSON.stringify(leftovers.slice(0, 20))}`);
    return out;
}

const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

/** Cubic bezier at t. */
function cubicAt(t, p0, p1, p2, p3) {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1]];
}
/** Quadratic bezier at t. */
function quadAt(t, p0, p1, p2) {
    const u = 1 - t, a = u * u, b = 2 * u * t, c = t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]];
}

/**
 * Endpoint-parameterised arc -> centre parameterisation, per the SVG 1.1 implementation notes (F.6.5).
 * Returns null for a degenerate arc (zero radius, or identical endpoints), which the spec says to treat as a
 * straight line -- and which is why this returns null rather than throwing.
 */
function arcToCentre(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
    if (!rx || !ry) return null;
    if (x1 === x2 && y1 === y2) return null;
    rx = Math.abs(rx); ry = Math.abs(ry);
    const phi = (phiDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
    const dx2 = (x1 - x2) / 2, dy2 = (y1 - y2) / 2;
    const x1p = cp * dx2 + sp * dy2, y1p = -sp * dx2 + cp * dy2;
    // radii too small to span the endpoints are SCALED UP, per the spec -- not an error
    const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
    const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    let co = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
    if (fa === fs) co = -co;
    const cxp = co * (rx * y1p) / ry, cyp = co * -(ry * x1p) / rx;
    const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => {
        const d = Math.hypot(ux, uy) * Math.hypot(vx, vy);
        if (!d) return 0;
        let c = (ux * vx + uy * vy) / d;
        c = Math.min(1, Math.max(-1, c));
        const a = Math.acos(c);
        return (ux * vy - uy * vx < 0) ? -a : a;
    };
    const theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dtheta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dtheta > 0) dtheta -= 2 * Math.PI;
    if (fs && dtheta < 0) dtheta += 2 * Math.PI;
    return { cx, cy, rx, ry, phi, theta1, dtheta };
}

export const DEFAULT_TOLERANCE = 0.05;   // max chord deviation, in user units, when flattening a curve

/**
 * Flatten a path to polylines: [[x, y], ...] per subpath.
 *
 * @param opts.tolerance  maximum deviation of the polyline from the true curve, in user units.
 *
 * *** THE TOLERANCE IS THE ONE REAL DECISION AND IT IS A STATED NUMBER. *** Flattening always UNDERSTATES a
 * curve, because a chord is shorter than the arc it spans. Too coarse and the measured length is short, the
 * dasharray is short, and the line finishes drawing before the animation ends -- the exact quiet failure this
 * whole family of libraries has. The default of 0.05 user units keeps the error on a 100-unit circle under
 * about a hundredth of a percent, which the gate measures rather than asserts.
 */
export function flattenPath(d, opts = {}) {
    const tol = Math.max(1e-6, opts.tolerance ?? DEFAULT_TOLERANCE);
    const segs = parsePath(d);
    const subpaths = [];
    let pts = null;
    let x = 0, y = 0, sx = 0, sy = 0;         // current point, subpath start
    let lastC = null, lastQ = null;           // previous control points, for S and T

    const start = () => { pts = [[x, y]]; subpaths.push(pts); };
    const push = (nx, ny) => { if (!pts) start(); pts.push([nx, ny]); x = nx; y = ny; };
    /** Steps for a curve of this rough size at this tolerance. Cheap and conservative. */
    const stepsFor = (approxLen) => Math.max(2, Math.min(2048, Math.ceil(Math.sqrt(approxLen / tol) * 2)));

    for (const { cmd, args: a } of segs) {
        const rel = cmd >= "a" && cmd <= "z";
        const up = cmd.toUpperCase();
        if (up === "M") {
            x = rel ? x + a[0] : a[0]; y = rel ? y + a[1] : a[1];
            sx = x; sy = y; start(); lastC = lastQ = null;
        } else if (up === "L") {
            push(rel ? x + a[0] : a[0], rel ? y + a[1] : a[1]); lastC = lastQ = null;
        } else if (up === "H") {
            push(rel ? x + a[0] : a[0], y); lastC = lastQ = null;
        } else if (up === "V") {
            push(x, rel ? y + a[0] : a[0]); lastC = lastQ = null;
        } else if (up === "C" || up === "S") {
            let c1, c2, p3;
            if (up === "C") {
                c1 = [rel ? x + a[0] : a[0], rel ? y + a[1] : a[1]];
                c2 = [rel ? x + a[2] : a[2], rel ? y + a[3] : a[3]];
                p3 = [rel ? x + a[4] : a[4], rel ? y + a[5] : a[5]];
            } else {
                // S reflects the PREVIOUS cubic's second control point through the current point. When the
                // previous command was not a cubic the reflection is the current point itself -- getting that
                // wrong bends the curve and changes its length.
                c1 = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y];
                c2 = [rel ? x + a[0] : a[0], rel ? y + a[1] : a[1]];
                p3 = [rel ? x + a[2] : a[2], rel ? y + a[3] : a[3]];
            }
            const p0 = [x, y];
            const rough = dist(p0[0], p0[1], c1[0], c1[1]) + dist(c1[0], c1[1], c2[0], c2[1]) + dist(c2[0], c2[1], p3[0], p3[1]);
            const n = stepsFor(rough);
            for (let i = 1; i <= n; i++) { const q = cubicAt(i / n, p0, c1, c2, p3); push(q[0], q[1]); }
            lastC = c2; lastQ = null;
        } else if (up === "Q" || up === "T") {
            let c1, p2;
            if (up === "Q") {
                c1 = [rel ? x + a[0] : a[0], rel ? y + a[1] : a[1]];
                p2 = [rel ? x + a[2] : a[2], rel ? y + a[3] : a[3]];
            } else {
                c1 = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y];
                p2 = [rel ? x + a[0] : a[0], rel ? y + a[1] : a[1]];
            }
            const p0 = [x, y];
            const rough = dist(p0[0], p0[1], c1[0], c1[1]) + dist(c1[0], c1[1], p2[0], p2[1]);
            const n = stepsFor(rough);
            for (let i = 1; i <= n; i++) { const q = quadAt(i / n, p0, c1, p2); push(q[0], q[1]); }
            lastQ = c1; lastC = null;
        } else if (up === "A") {
            const [rx, ry, rot, fa, fs] = a;
            const ex = rel ? x + a[5] : a[5], ey = rel ? y + a[6] : a[6];
            const arc = arcToCentre(x, y, rx, ry, rot, !!fa, !!fs, ex, ey);
            if (!arc) { push(ex, ey); }         // degenerate: the spec says draw a line
            else {
                const rough = Math.abs(arc.dtheta) * Math.max(arc.rx, arc.ry);
                const n = stepsFor(rough);
                const cp = Math.cos(arc.phi), sp = Math.sin(arc.phi);
                for (let i = 1; i <= n; i++) {
                    const th = arc.theta1 + arc.dtheta * (i / n);
                    const ax = arc.rx * Math.cos(th), ay = arc.ry * Math.sin(th);
                    push(arc.cx + cp * ax - sp * ay, arc.cy + sp * ax + cp * ay);
                }
            }
            lastC = lastQ = null;
        } else if (up === "Z") {
            // *** THE CLOSING SEGMENT IS PART OF THE LENGTH. *** Dropping it is the commonest way a closed
            // shape measures short, and the dash then runs out just before the path joins up.
            if (pts && (x !== sx || y !== sy)) push(sx, sy);
            x = sx; y = sy; lastC = lastQ = null;
        } else {
            throw new Error(`flattenPath: unsupported command '${cmd}'`);
        }
    }
    return subpaths.filter((p) => p.length > 1);
}

/** Total length of a path, summed over its subpaths. */
export function pathLength(d, opts = {}) {
    let total = 0;
    for (const pts of flattenPath(d, opts)) {
        for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    }
    return total;
}

/** Per-subpath lengths, for a caller that wants to draw them in sequence rather than all at once. */
export function subpathLengths(d, opts = {}) {
    return flattenPath(d, opts).map((pts) => {
        let n = 0;
        for (let i = 1; i < pts.length; i++) n += dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
        return n;
    });
}

/** True when every command in the path is one this parser implements. Never throws. */
export function isSupported(d) {
    try { parsePath(d); return true; } catch { return false; }
}

export { KNOWN as SUPPORTED_COMMANDS };
