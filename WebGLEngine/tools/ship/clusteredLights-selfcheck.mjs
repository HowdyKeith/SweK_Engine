// WebGLEngine/tools/ship/clusteredLights-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/clusteredLights-selfcheck.mjs      (about a minute: the CPU half, then lights-demo.html in headless Chromium, ANGLE on SwiftShader)
//
// CLUSTERED LIGHTING AND THE SHADOW ATLAS, HELD. render/clusteredLights.mjs:
//
//   1  THE CLUSTERS    each cell lists exactly the lights whose range touches its box (against a direct count); every light within range of a point is in that point's cell's
//                      list; a full cell counts the rest as overflow and never lists more than its cap; so shading over the cell IS shading over every light, to 1e-12
//   2  THE FALLOFF     the window is 1/(d^2 + 1)... times 1 at the light, exactly 0 at and past the range, falling all the way; the spot cone is full inside the inner angle and
//                      0 outside the outer
//   3  THE ATLAS       shadowed lights by priority, a spot one tile and a point light six, no two tiles overlapping, all inside the atlas; a light with no room listed as
//                      unshadowed; every direction from a point light lands inside the face cubeFace names (500 directions), a spot's axis at its tile's centre
//   4  THE PAGE        lights-demo.html (67 lights, three casting shadows): clustered and every-light (?brute=1) pictures the same to a level; with shadows off, ground
//                      pixels are the CPU sum to 2 levels; with shadows on, ground no shadowed light is blocked from is unchanged, ground a pillar hides from a spot light
//                      is darker, and ground a pillar hides from the point light is darker (its cube's faces)
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as CL from "../../render/clusteredLights.mjs";
import { invert4 } from "../../render/gizmo.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require = createRequire(import.meta.url), { chromium } = resolvePlaywright(require), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
const T4 = (m, v) => [0, 1, 2, 3].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);
const randomLights = (n) => Array.from({ length: n }, () => ({ type: rnd() < 0.7 ? "point" : "spot", position: [rnd() * 20 - 10, rnd() * 4, rnd() * 20 - 10], range: 1 + 4 * rnd(), color: [rnd(), rnd(), rnd()], intensity: 1 + rnd(), direction: norm([rnd() - 0.5, -1, rnd() - 0.5]), innerAngle: 0.3, outerAngle: 0.5 }));

console.log("clusteredLights-selfcheck -- clustered lighting and the shadow atlas\n");

console.log("1. THE CLUSTERS");
await section(() => {
    const L = randomLights(120), C = CL.buildClusters(L, { cells: [10, 3, 10], maxPerCell: 64 });
    let exact = true;
    for (let z = 0; z < 10; z++) for (let y = 0; y < 3; y++) for (let x = 0; x < 10; x++) {
        const c = (z * 3 + y) * 10 + x, lo = [C.min[0] + x * C.size[0], C.min[1] + y * C.size[1], C.min[2] + z * C.size[2]], want = [];
        L.forEach((l, i) => { const q = [0, 1, 2].map((k) => Math.min(Math.max(l.position[k], lo[k]), lo[k] + C.size[k])); if (Math.hypot(q[0] - l.position[0], q[1] - l.position[1], q[2] - l.position[2]) < l.range) want.push(i); });
        if (Array.from(C.lists.subarray(c * 64, c * 64 + C.counts[c])).join() !== want.join()) exact = false;
    }
    ok("!! EACH CELL LISTS EXACTLY THE LIGHTS WHOSE RANGE TOUCHES ITS BOX (300 cells, 120 lights, against a direct count), and nothing overflowed", exact && C.overflow === 0);
    let missing = 0, worst = 0;
    for (let k = 0; k < 3000; k++) {
        const p = [rnd() * 24 - 12, rnd() * 5 - 0.5, rnd() * 24 - 12], c = CL.cellOf(C, p), list = c < 0 ? [] : Array.from(C.lists.subarray(c * 64, c * 64 + C.counts[c]));
        L.forEach((l, i) => { if (Math.hypot(...l.position.map((v, j) => v - p[j])) < l.range && !list.includes(i)) missing++; });
        const n = norm([rnd() - 0.5, rnd(), rnd() - 0.5]), v = norm([rnd() - 0.5, 1, rnd() - 0.5]), a = CL.shadeCPU(L, C, p, n, v, [0.6, 0.5, 0.4]), b = CL.shadeCPU(L, C, p, n, v, [0.6, 0.5, 0.4], { brute: true });
        worst = Math.max(worst, ...a.map((x, i) => Math.abs(x - b[i])));
    }
    ok("!! every light within range of a point is in that point's cell's list (3,000 points), so SHADING OVER THE CELL IS SHADING OVER EVERY LIGHT, to 1e-12", missing === 0 && worst < 1e-12, `${missing} missing; worst ${worst.toExponential(2)}`);
    const tight = CL.buildClusters(L, { cells: [2, 1, 2], maxPerCell: 5 });
    ok("!! a full cell counts the rest as OVERFLOW and never lists more than its cap", tight.overflow > 0 && Array.from(tight.counts).every((n) => n <= 5) && Array.from(tight.counts).reduce((s, n) => s + n, 0) + tight.overflow === (() => { const c = CL.buildClusters(L, { cells: [2, 1, 2], maxPerCell: 1000 }); return Array.from(c.counts).reduce((s, n) => s + n, 0); })(), `${tight.overflow} overflowed`);
});

console.log("2. THE FALLOFF AND THE CONE");
await section(() => {
    const r = 3, xs = Array.from({ length: 300 }, (_, k) => (k / 299) * r);
    ok("!! the window is 1 at the light, falls all the way, and is EXACTLY 0 at the range and past it (no light leaks past its cell list)", CL.window_(0, r) === 1 && xs.every((x, k) => k === 0 || CL.window_(x, r) <= CL.window_(xs[k - 1], r)) && CL.window_(r, r) === 0 && CL.window_(r * 1.5, r) === 0 && CL.window_(r * 0.999, r) < 1e-4);
    const s = { type: "spot", position: [0, 0, 0], direction: [0, -1, 0], range: 10, innerAngle: 0.3, outerAngle: 0.5, color: [1, 1, 1], intensity: 1 }, at = (a) => CL.lightAt(s, [Math.sin(a) * 2, -Math.cos(a) * 2, 0]).rad[0] / CL.window_(2, 10);
    ok("!! the spot cone is full inside the inner angle, 0 outside the outer, between in between", Math.abs(at(0.2) - 1) < 1e-12 && at(0.55) === 0 && at(0.4) > 0 && at(0.4) < 1);
});

console.log("3. THE ATLAS");
await section(() => {
    const L = [{ type: "point", position: [0, 1, 0], range: 5, shadow: true, priority: 0 }, { type: "spot", position: [3, 4, 0], direction: [0, -1, 0], range: 8, innerAngle: 0.3, outerAngle: 0.5, shadow: true, priority: 5 }, { type: "point", position: [2, 1, 2], range: 4, shadow: false }, { type: "point", position: [-2, 1, 2], range: 4, shadow: true, priority: 1 }, { type: "spot", position: [0, 4, 3], direction: [0, -1, 0], range: 8, innerAngle: 0.3, outerAngle: 0.5, shadow: true, priority: 0 }];
    const A = CL.allocateAtlas(L, { slots: 3 });   // 9 tiles: the spot (priority 5) 1, the point light (priority 1) 6, then the other spot 1; the last point light (6) does not fit
    const rects = A.faces.map((f) => f.rect), overlap = rects.some((a, i) => rects.some((b, j) => i < j && a[0] < b[0] + b[2] - 1e-9 && b[0] < a[0] + a[2] - 1e-9 && a[1] < b[1] + b[3] - 1e-9 && b[1] < a[1] + a[3] - 1e-9));
    ok("!! TILES BY PRIORITY: the priority-5 spot first (1 tile), the priority-1 point light next (6), then the other spot (1); the last point light finds no room and is listed unshadowed; the unshadowed-by-choice light takes none", JSON.stringify([...A.byLight.entries()]) === JSON.stringify([[1, [0, 1]], [3, [1, 6]], [4, [7, 1]]]) && A.unshadowed.join() === "0" && !A.byLight.has(2));
    ok("!! no two tiles overlap and every tile is inside the atlas", !overlap && rects.every((r) => r[0] >= 0 && r[1] >= 0 && r[0] + r[2] <= 1 + 1e-9 && r[1] + r[3] <= 1 + 1e-9));
    const F = CL.faceMatrices(L[0]); let bad = 0;
    for (let k = 0; k < 500; k++) { const v = norm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]), p = L[0].position.map((x, i) => x + v[i] * 2), q = T4(F[CL.cubeFace(v)].viewProj, [...p, 1]); if (!(q[3] > 0 && Math.abs(q[0] / q[3]) <= 1 + 1e-6 && Math.abs(q[1] / q[3]) <= 1 + 1e-6 && q[2] / q[3] > -1 && q[2] / q[3] < 1)) bad++; }
    const S = CL.faceMatrices(L[1])[0], axis = T4(S.viewProj, [3, 1, 0, 1]), edge = T4(S.viewProj, [3 + Math.tan(0.49) * 3, 1, 0, 1]);
    ok("!! EVERY DIRECTION FROM A POINT LIGHT LANDS INSIDE THE FACE cubeFace NAMES (500 directions); a spot's axis lands at its tile's centre and its cone's edge inside", bad === 0 && Math.abs(axis[0] / axis[3]) < 1e-6 && Math.abs(axis[1] / axis[3]) < 1e-6 && Math.abs(edge[0] / edge[3]) < 1, `${bad} outside`);
});

console.log("4. THE PAGE (lights-demo.html)");
await section(async () => {
    const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
    const srv = http.createServer((q, r) => { const f = path.join(ENG, decodeURIComponent(q.url.split("?")[0])); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
    await new Promise((res) => srv.listen(0, "127.0.0.1", res));
    const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) }), errors = [];
    const grab = async (q) => { const p = await browser.newPage({ viewport: { width: 480, height: 320 } }); p.on("pageerror", (e) => errors.push(e.message)); await p.goto(`http://127.0.0.1:${srv.address().port}/lights-demo.html?ease=0&t=3.5&gputimer=0${q}`);
        await p.waitForFunction(() => window.__lights && (window.__lights.ready || window.__lights.error), null, { timeout: 90000 });
        const r = await p.evaluate(async () => { const s = window.__lights, c = await s.capture(); return { ...c, vp: s.viewProj, eye: s.eye, stats: s.stats, lights: s.lights, pillars: s.pillars }; }); await p.close(); return r; };
    const cl = await grab(""), br = await grab("&brute=1"), off = await grab("&shadows=0");
    await browser.close(); srv.close();
    let worst = 0; for (let i = 0; i < cl.px.length; i++) if (i % 4 !== 3) worst = Math.max(worst, Math.abs(cl.px[i] - br.px[i]));
    ok("!! CLUSTERED AND EVERY-LIGHT PICTURES ARE THE SAME, to a level, over every pixel (67 lights, 3 casting shadows, no cell over its cap)", errors.length === 0 && cl.stats.overflow === 0 && worst <= 1, `worst ${worst} levels; overflow ${cl.stats.overflow}; ${errors[0] || ""}`);
    const inv = invert4(cl.vp), Lt = cl.lights, C = CL.buildClusters(Lt, { cells: [16, 6, 16], maxPerCell: 48 }), boxes = cl.pillars;
    const hitBox = (o, d, tMax) => boxes.some((b) => { let tn = 1e-4, tf = tMax; for (let k = 0; k < 3; k++) { const lo = b.position[k] - b.size[k] / 2, hi = b.position[k] + b.size[k] / 2; if (Math.abs(d[k]) < 1e-12) { if (o[k] < lo || o[k] > hi) return false; continue; } let a = (lo - o[k]) / d[k], c = (hi - o[k]) / d[k]; if (a > c) [a, c] = [c, a]; tn = Math.max(tn, a); tf = Math.min(tf, c); } return tn < tf; });
    const blocked = (g, l) => { const d = l.position.map((v, i) => v - g[i]), t = Math.hypot(...d); return hitBox(g, d.map((v) => v / t), t); };
    const marginBlocked = (g, l) => [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]].every(([dx, dz]) => blocked([g[0] + dx, g[1], g[2] + dz], l)), marginClear = (g, l) => [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]].every(([dx, dz]) => !blocked([g[0] + dx, g[1], g[2] + dz], l));
    const shadowed = Lt.map((l, i) => (l.shadow ? i : -1)).filter((i) => i >= 0), spot = shadowed[0], point = shadowed[2];
    let gp = 0, cpuWorst = 0, clear = 0, clearSame = true, inSpot = 0, spotDark = 0, inPoint = 0, pointDark = 0;
    for (let yb = 3; yb < cl.h; yb += 4) for (let x = 3; x < cl.w; x += 4) {
        const nx = ((x + 0.5) / cl.w) * 2 - 1, ny = ((yb + 0.5) / cl.h) * 2 - 1, a = T4(inv, [nx, ny, -1, 1]), b = T4(inv, [nx, ny, 1, 1]), o = a.slice(0, 3).map((v) => v / a[3]), d = norm(b.slice(0, 3).map((v, i) => v / b[3] - o[i]));
        if (d[1] >= -1e-3) continue; const t = -o[1] / d[1], g = o.map((v, i) => v + d[i] * t);
        if (Math.abs(g[0]) > 14 || Math.abs(g[2]) > 14 || hitBox(o, d, t - 1e-3)) continue;
        const near = boxes.some((bx) => Math.abs(g[0] - bx.position[0]) < bx.size[0] / 2 + 0.06 && Math.abs(g[2] - bx.position[2]) < bx.size[2] / 2 + 0.06); if (near) continue;
        const i4 = (yb * cl.w + x) * 4, on = cl.px.slice(i4, i4 + 3), nf = off.px.slice(i4, i4 + 3), v = norm(cl.eye.map((e, k) => e - g[k])), alb = [0.55, 0.55, 0.58];
        const lin = CL.shadeCPU(Lt, C, g, [0, 1, 0], v, alb).map((c, k) => alb[k] * 0.04 + c), want = lin.map((c) => Math.round((c / (1 + c)) * 255));
        gp++; cpuWorst = Math.max(cpuWorst, ...nf.map((c, k) => Math.abs(c - want[k])));
        const reach = (i) => { const r = CL.lightAt(Lt[i], g); return Math.max(...r.rad) * Math.max(0, r.L[1]); };
        if (shadowed.every((i) => marginClear(g, Lt[i]) || reach(i) === 0)) { clear++; if (on.some((c, k) => Math.abs(c - nf[k]) > 1)) { clearSame = false; if (process.env.DBG) console.log("CLEARCHG", x, yb, g.map((q) => q.toFixed(2)).join(","), on.join(), nf.join()); } }
        const drop = (i) => { const w = CL.shadeCPU(Lt, C, g, [0, 1, 0], v, alb, { shadowOf: (j) => (j === i ? 0 : 1) }).map((c, k) => alb[k] * 0.04 + c); return want.reduce((s2, c) => s2 + c, 0) - w.reduce((s2, c) => s2 + Math.round((c / (1 + c)) * 255), 0); };   // levels the light's shadow should take off
        if (drop(spot) >= 8 && marginBlocked(g, Lt[spot])) { inSpot++; if (on.reduce((s, c) => s + c, 0) < nf.reduce((s, c) => s + c, 0) - 3) spotDark++; else if (process.env.DBG) console.log("SPOTMISS", x, yb, g.map((q) => q.toFixed(2)).join(","), drop(spot), on.join(), nf.join()); }
        if (drop(point) >= 8 && marginBlocked(g, Lt[point])) { inPoint++; if (on.reduce((s, c) => s + c, 0) < nf.reduce((s, c) => s + c, 0) - 3) pointDark++; }
    }
    ok("!! WITH SHADOWS OFF THE GROUND IS THE CPU SUM, within 2 levels (the light and cell textures, the window, the cone and the tone map read as the CPU reads them)", gp > 1000 && cpuWorst <= 2, `${gp} ground pixels, worst ${cpuWorst}`);
    ok("!! WITH SHADOWS ON, ground no shadowed light is blocked from (a margin round it clear too) is unchanged, to a level", clear > 300 && clearSame, `${clear} pixels`);
    ok("!! ground a pillar hides from the first spot light is darker with shadows on, wherever that light should matter by 8 levels or more (nine in ten at least)", inSpot > 10 && spotDark >= 0.9 * inSpot, `${spotDark} of ${inSpot}`);
    ok("!! ground a pillar hides from the shadowed POINT light is darker too -- its six cube faces in the atlas (nine in ten at least)", inPoint > 20 && pointDark >= 0.9 * inPoint, `${pointDark} of ${inPoint}`);
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 15 mutants of render/clusteredLights.mjs, each in a hard-linked copy of the tree: 14 RED -- the sphere-box test skipped, the cell range one short at the top,
// overflow not counted, the window not reaching 0 at the range, the GLSL window not the CPU's, the GLSL cell index transposed, the GLSL list read from the count's texel, the
// cube face picked from the wrong direction, no shadow at all, the tile's rect ignored, no bias, the atlas handed out in order instead of by priority, a point light given one
// tile, the spot cone not applied in GLSL. ONE STAYS GREEN: cubeFace breaking an exact tie toward the later face -- a direction exactly on a face boundary lies inside both
// faces' frusta, so either answer is right; recorded, not hidden.
// BEFORE THE SABOTAGE the gate found two real faults in the shadows: a bias in DEPTH (0.002) was about two world units at seven from the spot lights, so pillars near the
// ground cast no shadow there (9 of 17 darker); a bias toward the light alone left acne at grazing angles (43 clear ground pixels a level or two darker). The bias is now in
// world units, along the surface normal and half as far toward the light.
