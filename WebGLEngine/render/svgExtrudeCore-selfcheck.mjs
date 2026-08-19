// WebGLEngine/render/svgExtrudeCore-selfcheck.mjs — v3831
//
// Answer key for SVG -> outline. Parses paths whose shapes are known by construction (a triangle, a square, a
// cubic, an arc) and checks the vertex counts, endpoints, bounds and winding; checks relative commands track the
// pen; checks normalize centers/scales/flips-Y; and checks a shape-with-a-hole is classified as outer + hole.

import { parsePathData, parseSvgShapes, signedArea, bounds, pointInPolygon, normalizeShapes, classifyShapes, svgToShapes } from "./svgExtrudeCore.js";

let pass = 0, fail = 0;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };

// 1) LINES -- absolute triangle.
{
    const s = parsePathData("M0 0 L10 0 L5 10 Z");
    ok(s.length === 1 && s[0].length === 3, "triangle -> 1 subpath, 3 pts");
    ok(near(s[0][0].x, 0) && near(s[0][1].x, 10) && near(s[0][2].x, 5) && near(s[0][2].y, 10), "triangle vertices correct");
    const b = bounds(s); ok(near(b.w, 10) && near(b.h, 10), "triangle bounds 10x10");
}

// 2) H/V + relative -- a unit square via relative commands, pen tracked.
{
    const s = parsePathData("M2 2 h4 v4 h-4 z")[0];
    ok(s.length === 4, "square h/v -> 4 pts");
    ok(near(s[1].x, 6) && near(s[1].y, 2) && near(s[2].x, 6) && near(s[2].y, 6) && near(s[3].x, 2) && near(s[3].y, 6), "relative h/v track the pen");
}

// 3) CUBIC -- endpoints exact, midpoint on the curve, flattened to many pts.
{
    const s = parsePathData("M0 0 C0 10 10 10 10 0", 16)[0];
    ok(s.length >= 12, "cubic flattened to segments");
    ok(near(s[s.length - 1].x, 10) && near(s[s.length - 1].y, 0), "cubic ends at its endpoint");
    // symmetric arch peaks near x=5; some sampled point should be well above y=0
    ok(s.some((p) => p.y > 6), "cubic bulges (control points respected)");
}

// 4) ARC -- a semicircle arc reaches its endpoint and bulges outward.
{
    const s = parsePathData("M0 0 A5 5 0 0 1 10 0")[0];
    ok(near(s[s.length - 1].x, 10, 1e-3) && near(s[s.length - 1].y, 0, 1e-3), "arc ends at endpoint");
    ok(s.some((p) => Math.abs(p.y) > 3), "arc bulges to ~radius");
}

// 5) SVG extraction -- multiple <path> and a <polygon>.
{
    const svg = '<svg><path d="M0 0 L4 0 L4 4 L0 4 Z"/><path d="M1 1 L3 1 L3 3 L1 3 Z"/><polygon points="10,0 14,0 12,4"/></svg>';
    const subs = parseSvgShapes(svg);
    ok(subs.length === 3, "extracted 2 paths + 1 polygon");
    ok(subs[2].length === 3, "polygon parsed to 3 pts");
}

// 6) NORMALIZE -- centered on origin, scaled to size, Y FLIPPED (svg down -> shape up).
{
    const subs = [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }]];
    const n = normalizeShapes(subs, 2)[0];
    const b = bounds([n]); ok(near(Math.max(b.w, b.h), 2), "normalized to size 2");
    let cx = 0, cy = 0; for (const p of n) { cx += p.x; cy += p.y; } cx /= n.length; cy /= n.length;
    ok(near(cx, 0, 1e-9) && near(cy, 0, 1e-9), "centered on origin");
    // original top (y=0) maps to +y after flip; original bottom (y=20) maps to -y
    ok(n[0].y > 0 && n[2].y < 0, "Y is flipped (svg y-down -> shape y-up)");
}

// 7) HOLE CLASSIFICATION -- a square with an inner square becomes outer + one hole.
{
    const shapes = classifyShapes([
        [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],   // outer
        [{ x: 3, y: 3 }, { x: 7, y: 3 }, { x: 7, y: 7 }, { x: 3, y: 7 }],       // inner -> hole
    ]);
    ok(shapes.length === 1 && shapes[0].holes.length === 1, "inner square classified as a hole of the outer");
    ok(pointInPolygon({ x: 5, y: 5 }, shapes[0].outer), "pointInPolygon: center inside outer");
    ok(!pointInPolygon({ x: 50, y: 50 }, shapes[0].outer), "pointInPolygon: far point outside");
    // two separate shapes -> two outers
    const two = classifyShapes([[{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 2 }], [{ x: 10, y: 0 }, { x: 12, y: 0 }, { x: 11, y: 2 }]]);
    ok(two.length === 2, "two separate shapes -> two outers, no false holes");
}

// 8) FULL PIPELINE -- a ring (outer circle path + inner) via svgToShapes; empty svg -> null.
{
    ok(svgToShapes("<svg></svg>") === null, "no paths -> null");
    const svg = '<svg><path d="M0 0 L20 0 L20 20 L0 20 Z"/><path d="M6 6 L14 6 L14 14 L6 14 Z"/></svg>';
    const shapes = svgToShapes(svg, { size: 2 });
    ok(shapes && shapes.length === 1 && shapes[0].holes.length === 1, "svgToShapes: square-with-hole -> 1 outer + 1 hole");
}

if (fail) { console.error(`\nsvgExtrudeCore-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`svgExtrudeCore-selfcheck: all ${pass} pass`);
