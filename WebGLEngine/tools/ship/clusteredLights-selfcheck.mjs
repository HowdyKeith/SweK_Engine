// WebGLEngine/tools/ship/clusteredLights-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/clusteredLights-selfcheck.mjs      (about a minute: the CPU half, then lights-demo.html in headless Chromium, ANGLE on SwiftShader)
//
// CLUSTERED LIGHTING AND THE SHADOW ATLAS, HELD. render/clusteredLights.mjs:
//
//   1  THE CLUSTERS    each cell lists exactly the lights whose range touches its box (against a direct count); every light within range of a point is in that point's cell's
//                      list; a full cell counts the rest as overflow and never lists more than its cap; so shading over the cell IS shading over every light, to 1e-12
//   1b FROXELS     (2026-11-22) clusters fitted to the view: every frustum point lies in the box of the froxel it looks up, every light in range of it is listed, so shading
//                      over the froxel is shading over every light; the slices exponential; the sun in no cell yet in every sum
//   3b CASCADES AND COOKIES  the practical splits; each cascade's map holds all eight corners of its slice; centres on whole texels (no shimmer); the cascades first in the
//                      atlas; four distinct cookie tiles, the lookup exact at a texel's centre, a cookie multiplying its spot's light and black outside its projection
//   2  THE FALLOFF     the window is 1/(d^2 + 1)... times 1 at the light, exactly 0 at and past the range, falling all the way; the spot cone is full inside the inner angle and
//                      0 outside the outer
//   3  THE ATLAS       shadowed lights by priority, a spot one tile and a point light six, no two tiles overlapping, all inside the atlas; a light with no room listed as
//                      unshadowed; every direction from a point light lands inside the face cubeFace names (500 directions), a spot's axis at its tile's centre
//   4, 5  THE PAGES    lights-demo.html (WebGL2) and lights-gpu.html (WebGPU, 2026-11-22), the same scene (67 lights, three casting shadows), each: clustered and every-light (?brute=1) pictures the same to a level; with shadows off, ground
//                      pixels are the CPU sum to 2 levels; with shadows on, ground no shadowed light is blocked from is unchanged, ground a pillar hides from a spot light
//                      is darker, and ground a pillar hides from the point light is darker (its cube's faces); 2026-11-22: froxels and world clusters both equal every-light;
//                      ground the moon is hidden from is darker; the cookie shows wherever the CPU says it should
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

await section(() => {
    const view = CL.lookAt([6, 5, 9], [0, 0.5, 0], [0, 1, 0]), proj = CL.perspective(0.9, 1.5, 0.05, 60), cam = { view, proj, near: 0.05, far: 60 }, L = randomLights(90), V = CL.buildViewClusters(L, cam, { viewCells: [12, 8, 16], maxPerCell: 64 }), inv = invert4(Array.from((() => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s2 = 0; for (let k = 0; k < 4; k++) s2 += proj[k * 4 + r] * view[c * 4 + k]; o[c * 4 + r] = s2; } return o; })()));
    let missing = 0, outside = 0, worst = 0, n = 0;
    for (let k = 0; k < 3000; k++) {
        const nd = [rnd() * 2 - 1, rnd() * 2 - 1, 0], dist = 0.05 * Math.pow(1200, rnd() * 0.999), a = T4(inv, [nd[0], nd[1], -1, 1]), b = T4(inv, [nd[0], nd[1], 1, 1]), o = a.slice(0, 3).map((x) => x / a[3]), dir = norm(b.slice(0, 3).map((x, i) => x / b[3] - o[i]));
        const fwd = [-view[2], -view[6], -view[10]], t = (dist - 0.05) / Math.max(1e-6, dir[0] * fwd[0] + dir[1] * fwd[1] + dir[2] * fwd[2]), p = o.map((x, i) => x + dir[i] * t), c = CL.cellOfView(V, p);
        if (c < 0) continue; n++;
        const s = Math.floor(c / 96), y = Math.floor((c % 96) / 12), x = c % 12, box = CL.froxelBox(V, x, y, s), pv = T4(view, [...p, 1]);
        if ([0, 1, 2].some((j) => pv[j] < box.lo[j] - 1e-4 || pv[j] > box.hi[j] + 1e-4)) outside++;
        const list = Array.from(V.lists.subarray(c * 64, c * 64 + V.counts[c]));
        L.forEach((l, i) => { if (Math.hypot(...l.position.map((q, j) => q - p[j])) < l.range && !list.includes(i)) missing++; });
        const nn = norm([rnd() - 0.5, 1, rnd() - 0.5]), vv = norm([rnd() - 0.5, 1, rnd() - 0.5]), A = CL.shadeCPU(L, V, p, nn, vv, [0.5, 0.6, 0.4]), B = CL.shadeCPU(L, V, p, nn, vv, [0.5, 0.6, 0.4], { brute: true });
        worst = Math.max(worst, ...A.map((q, i) => Math.abs(q - B[i])));
    }
    ok("!! CLUSTERS FITTED TO THE VIEW (froxels): every point of the frustum lies in the box of the froxel it looks up; every light within range of it is in that froxel's list; so shading over the froxel IS shading over every light, to 1e-12 (3,000 points, exponential slices)", n > 2000 && outside === 0 && missing === 0 && V.overflow === 0 && worst < 1e-12, `${n} points; ${outside} outside their box; ${missing} missing; worst ${worst.toExponential(2)}`);
    const sl = [0, 4, 8, 16].map((s) => CL.sliceDepth(V, s));
    ok("!! the slices are exponential: near at 0, far at the last, each the same ratio to the one before", Math.abs(sl[0] - 0.05) < 1e-12 && Math.abs(sl[3] - 60) < 1e-9 && Math.abs(sl[1] / sl[0] - sl[2] / sl[1]) < 1e-9);
    const withSun = [...L, { type: "directional", direction: [0, -1, 0], color: [1, 1, 1], intensity: 1 }], W2 = CL.buildClusters(withSun, { cells: [6, 2, 6], maxPerCell: 128 }), V2 = CL.buildViewClusters(withSun, cam, { viewCells: [6, 4, 8], maxPerCell: 128 });
    ok("!! the sun is in no cell of either kind (it has no range), yet every point adds it: the clustered sum with the sun is the brute sum", ![W2, V2].some((K) => Array.from(K.lists).includes(L.length)) && (() => { const p = [0.3, 0.1, 0.2], a = CL.shadeCPU(withSun, V2, p, [0, 1, 0], [0, 1, 0], [0.5, 0.5, 0.5]), b = CL.shadeCPU(withSun, V2, p, [0, 1, 0], [0, 1, 0], [0.5, 0.5, 0.5], { brute: true }); return a.every((q, i) => Math.abs(q - b[i]) < 1e-12) && a[0] > 0.2; })());
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

import { PRESENT_ARGS } from "./webgpuHarness.mjs";
const pageChecks = (title, file, stateVar, args) => section(async () => {
    const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
    const srv = http.createServer((q, r) => { const f = path.join(ENG, decodeURIComponent(q.url.split("?")[0])); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
    await new Promise((res) => srv.listen(0, "127.0.0.1", res));
    const browser = await chromium.launch({ args, ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) }), errors = [];
    const grab = async (q) => { const p = await browser.newPage({ viewport: { width: 480, height: 320 } }); p.on("pageerror", (e) => errors.push(e.message)); await p.goto(`http://127.0.0.1:${srv.address().port}/${file}?ease=0&t=3.5&gputimer=0${q}`);
        await p.waitForFunction((v) => window[v] && (window[v].ready || window[v].error), stateVar, { timeout: 90000 });
        const r = await p.evaluate(async (v) => { const s = window[v]; if (s.error) return { error: s.error }; const c = await s.capture(); return { ...c, vp: s.viewProj, eye: s.eye, stats: s.stats, lights: s.lights, pillars: s.pillars, camera: s.camera, error: s.error }; }, stateVar); await p.close();
        if (r.error) throw new Error(`${file}${q}: ${r.error}`);
        r.px = Array.from(Buffer.from(r.b64, "base64")); delete r.b64;   // the page sends its pixels as base64 (one string, not a JSON array of numbers)
        if (r.topDown) { const flip = new Array(r.px.length); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w * 4; x++) flip[(r.h - 1 - y) * r.w * 4 + x] = r.px[y * r.w * 4 + x]; r.px = flip; }   // WebGPU's rows top first: turned to WebGL2's
        return r; };
    const [cl, br, off, wcl, noCookie] = await Promise.all([grab(""), grab("&brute=1"), grab("&shadows=0"), grab("&clusters=world"), grab("&shadows=0&cookie=0")]);   // the five pages load side by side: each is its own shader compile on SwiftShader
    await browser.close(); srv.close();
    let worst = 0; for (let i = 0; i < cl.px.length; i++) if (i % 4 !== 3) worst = Math.max(worst, Math.abs(cl.px[i] - br.px[i]));
    let worstW = 0; for (let i = 0; i < cl.px.length; i++) if (i % 4 !== 3) worstW = Math.max(worstW, Math.abs(wcl.px[i] - br.px[i]));
    ok(`!! ${title}: CLUSTERS FITTED TO THE VIEW AND EVERY-LIGHT PICTURES ARE THE SAME, to a level, over every pixel (68 lights: 64 moving, two spots and a point light casting shadows, the moon with three cascades, a cookie; no froxel over its cap) -- and so are clusters over the lights (?clusters=world)`, errors.length === 0 && cl.stats.overflow === 0 && cl.stats.space === "view" && wcl.stats.space === "world" && cl.stats.cascades === 3 && worst <= 1 && worstW <= 1, `worst ${worst} levels (view), ${worstW} (world); overflow ${cl.stats.overflow}; ${errors[0] || ""}`);
    const inv = invert4(cl.vp), Lt = cl.lights, C = CL.buildViewClusters(Lt, cl.camera, { viewCells: [16, 9, 24], maxPerCell: 48 }), boxes = cl.pillars, COOKIES = CL.makeCookieAtlas(256);
    const hitBox = (o, d, tMax) => boxes.some((b) => { let tn = 1e-4, tf = tMax; for (let k = 0; k < 3; k++) { const lo = b.position[k] - b.size[k] / 2, hi = b.position[k] + b.size[k] / 2; if (Math.abs(d[k]) < 1e-12) { if (o[k] < lo || o[k] > hi) return false; continue; } let a = (lo - o[k]) / d[k], c = (hi - o[k]) / d[k]; if (a > c) [a, c] = [c, a]; tn = Math.max(tn, a); tf = Math.min(tf, c); } return tn < tf; });
    const blocked = (g, l) => { if (l.type === "directional") return hitBox(g, norm(l.direction).map((v) => -v), 1e9); const d = l.position.map((v, i) => v - g[i]), t = Math.hypot(...d); return hitBox(g, d.map((v) => v / t), t); };
    const marginBlocked = (g, l) => [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]].every(([dx, dz]) => blocked([g[0] + dx, g[1], g[2] + dz], l)), marginClear = (g, l) => [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]].every(([dx, dz]) => !blocked([g[0] + dx, g[1], g[2] + dz], l));
    const shadowed = Lt.map((l, i) => (l.shadow ? i : -1)).filter((i) => i >= 0), spot = shadowed[0], point = shadowed[2], sun = CL.sunIndexOf(Lt), cookieSpot = Lt.findIndex((l) => l.cookie != null);
    let gp = 0, cpuWorst = 0, clear = 0, clearSame = true, inSpot = 0, spotDark = 0, inPoint = 0, pointDark = 0, inSun = 0, sunDark = 0, inCookie = 0, cookieShows = 0;
    for (let yb = 3; yb < cl.h; yb += 3) for (let x = 3; x < cl.w; x += 3) {
        const nx = ((x + 0.5) / cl.w) * 2 - 1, ny = ((yb + 0.5) / cl.h) * 2 - 1, a = T4(inv, [nx, ny, -1, 1]), b = T4(inv, [nx, ny, 1, 1]), o = a.slice(0, 3).map((v) => v / a[3]), d = norm(b.slice(0, 3).map((v, i) => v / b[3] - o[i]));
        if (d[1] >= -1e-3) continue; const t = -o[1] / d[1], g = o.map((v, i) => v + d[i] * t);
        if (Math.abs(g[0]) > 14 || Math.abs(g[2]) > 14 || hitBox(o, d, t - 1e-3)) continue;
        const rayAt = (px, py) => { const a2 = T4(inv, [((px + 0.5) / cl.w) * 2 - 1, ((py + 0.5) / cl.h) * 2 - 1, -1, 1]), b2 = T4(inv, [((px + 0.5) / cl.w) * 2 - 1, ((py + 0.5) / cl.h) * 2 - 1, 1, 1]), o2 = a2.slice(0, 3).map((q) => q / a2[3]); return [o2, norm(b2.slice(0, 3).map((q, i) => q / b2[3] - o2[i]))]; };
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const [o2, d2] = rayAt(x + dx, yb + dy); return hitBox(o2, d2, 1e3); })) continue;   // a pillar's silhouette beside it: CPU and GPU may round it either way
        const near = boxes.some((bx) => Math.abs(g[0] - bx.position[0]) < bx.size[0] / 2 + 0.06 && Math.abs(g[2] - bx.position[2]) < bx.size[2] / 2 + 0.06); if (near) continue;
        const i4 = (yb * cl.w + x) * 4, on = cl.px.slice(i4, i4 + 3), nf = off.px.slice(i4, i4 + 3), v = norm(cl.eye.map((e, k) => e - g[k])), alb = [0.55, 0.55, 0.58];
        const lin = CL.shadeCPU(Lt, C, g, [0, 1, 0], v, alb, { cookies: COOKIES }).map((c, k) => alb[k] * 0.04 + c), want = lin.map((c) => Math.round((c / (1 + c)) * 255));
        gp++; cpuWorst = Math.max(cpuWorst, ...nf.map((c, k) => Math.abs(c - want[k])));
        if (process.env.DBG && nf.some((c, k) => Math.abs(c - want[k]) > 2)) { const nc = noCookie.px.slice(i4, i4 + 3), noCk = CL.shadeCPU(Lt, C, g, [0, 1, 0], v, alb).map((c, k) => Math.round(((alb[k] * 0.04 + c) / (1 + alb[k] * 0.04 + c)) * 255)); console.log("CPUDIFF", title, x, yb, g.map((q) => q.toFixed(2)).join(","), "gpu", nf.join(), "cpu", want.join(), "gpuNoCookie", nc.join(), "cpuNoCookie", noCk.join(), "tint", CL.cookieAt(COOKIES, Lt[cookieSpot], g).map((q) => q.toFixed(2)).join(), "brute", CL.shadeCPU(Lt, C, g, [0, 1, 0], v, alb, { brute: true, cookies: COOKIES }).map((c, k) => Math.round(((alb[k] * 0.04 + c) / (1 + alb[k] * 0.04 + c)) * 255)).join(), "cell", CL.cellOfView(C, g), "viewz", -T4(cl.camera.view, [...g, 1])[2]); for (let i = 0; i < Lt.length; i++) { const d = Lt[i].type === "directional" ? 0 : Math.hypot(...Lt[i].position.map((q, j) => q - g[j])); if (Lt[i].type === "directional" || d < Lt[i].range * 1.3) console.log("   light", i, Lt[i].type, "dist", d.toFixed(3), "range", Lt[i].range && Lt[i].range.toFixed(3), "pos", (Lt[i].position || []).map((q) => q.toFixed(2)).join(), "rad", CL.lightAt(Lt[i], g, COOKIES).rad.map((q) => q.toFixed(4)).join()); } }
        const reach = (i) => { const r = CL.lightAt(Lt[i], g, COOKIES); return Math.max(...r.rad) * Math.max(0, r.L[1]); }, viewDepth = -T4(cl.camera.view, [...g, 1])[2];
        if (shadowed.every((i) => marginClear(g, Lt[i]) || reach(i) === 0)) { clear++; if (on.some((c, k) => Math.abs(c - nf[k]) > 1)) { clearSame = false; if (process.env.DBG) console.log("CLEARCHG", x, yb, g.map((q) => q.toFixed(2)).join(","), on.join(), nf.join()); } }
        const drop = (i) => { const w = CL.shadeCPU(Lt, C, g, [0, 1, 0], v, alb, { cookies: COOKIES, shadowOf: (j) => (j === i ? 0 : 1) }).map((c, k) => alb[k] * 0.04 + c); return want.reduce((s2, c) => s2 + c, 0) - w.reduce((s2, c) => s2 + Math.round((c / (1 + c)) * 255), 0); };   // levels the light's shadow should take off
        if (drop(spot) >= 8 && marginBlocked(g, Lt[spot])) { inSpot++; if (on.reduce((s, c) => s + c, 0) < nf.reduce((s, c) => s + c, 0) - 3) spotDark++; else if (process.env.DBG) console.log("SPOTMISS", x, yb, g.map((q) => q.toFixed(2)).join(","), drop(spot), on.join(), nf.join()); }
        if (drop(point) >= 8 && marginBlocked(g, Lt[point])) { inPoint++; if (on.reduce((s, c) => s + c, 0) < nf.reduce((s, c) => s + c, 0) - 3) pointDark++; }
        if (viewDepth < 26 && drop(sun) >= 6 && marginBlocked(g, Lt[sun])) { inSun++; if (on.reduce((s, c) => s + c, 0) < nf.reduce((s, c) => s + c, 0) - 2) sunDark++; }
        { const noC = CL.shadeCPU(Lt, C, g, [0, 1, 0], v, alb).map((c, k) => Math.round(((alb[k] * 0.04 + c) / (1 + alb[k] * 0.04 + c)) * 255));
          if (Math.max(...noC.map((c, k) => Math.abs(c - want[k]))) >= 8) { inCookie++; const nc = noCookie.px.slice(i4, i4 + 3); if (nf.some((c, k) => Math.abs(c - nc[k]) > 4)) cookieShows++; } }
    }
    ok(`!! ${title}: WITH SHADOWS OFF THE GROUND IS THE CPU SUM, within 2 levels (the froxels, the light and cell data, the window, the cone, the moon, the cookie and the tone map read as the CPU reads them)`, gp > 1000 && cpuWorst <= 2, `${gp} ground pixels, worst ${cpuWorst}`);
    ok(`!! ${title}: WITH SHADOWS ON, ground no shadowed light is blocked from (a margin round it clear too) is unchanged, to a level`, clear > 300 && clearSame, `${clear} pixels`);
    ok(`!! ${title}: ground a pillar hides from the first spot light is darker with shadows on, wherever that light should matter by 8 levels or more (nine in ten at least)`, inSpot > 10 && spotDark >= 0.9 * inSpot, `${spotDark} of ${inSpot}`);
    ok(`!! ${title}: ground a pillar hides from the shadowed POINT light is darker too -- its six cube faces in the atlas (nine in ten at least)`, inPoint > 20 && pointDark >= 0.9 * inPoint, `${pointDark} of ${inPoint}`);
    ok(`!! ${title}: GROUND A PILLAR HIDES FROM THE MOON IS DARKER (its cascades, within the shadow distance; nine in ten at least)`, inSun > 10 && sunDark >= 0.9 * inSun, `${sunDark} of ${inSun}`);
    ok(`!! ${title}: THE COOKIE SHOWS: wherever the CPU says it changes the picture by 8 levels or more, the picture with the cookie is not the picture without (nine in ten at least) -- and the CPU sum above, which samples the cookie as the GPU does, held to 2 levels`, inCookie > 10 && cookieShows >= 0.9 * inCookie, `${cookieShows} of ${inCookie}`);
});

console.log("3b. THE SUN'S CASCADES AND THE COOKIES (2026-11-22)");
await section(() => {
    const sp = CL.cascadeSplits(0.05, 30, 3, 0.6), even = CL.cascadeSplits(1, 31, 3, 0), logs = CL.cascadeSplits(1, 1000, 3, 1);
    ok("!! THE SPLITS: rising, the last at the shadow distance; lambda 0 is even, 1 logarithmic", sp[0] < sp[1] && sp[1] < sp[2] && Math.abs(sp[2] - 30) < 1e-9 && even.map((v) => Math.round(v * 1e6) / 1e6).join() === "11,21,31" && logs.map((v) => Math.round(v * 1e6) / 1e6).join() === "10,100,1000", sp.map((v) => v.toFixed(3)).join(", "));
    const view = CL.lookAt([7, 6, 10], [0, 0.4, 0], [0, 1, 0]), proj = CL.perspective(0.9, 1.5, 0.05, 100), cam = { view, proj, near: 0.05, far: 100 }, sun = { type: "directional", direction: [-0.45, -1, -0.35], color: [1, 1, 1], intensity: 1, shadow: true };
    const K = CL.cascadeMatrices(sun, cam, { cascades: 3, shadowDistance: 30, tileSize: 512 }), [r, u, bk] = [[view[0], view[4], view[8]], [view[1], view[5], view[9]], [view[2], view[6], view[10]]], eye = [7, 6, 10];
    let bad = 0; K.forEach((c) => { for (const d of [c.splitNear, c.splitFar]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const q = eye.map((e, i) => e + r[i] * sx * d / proj[0] + u[i] * sy * d / proj[5] - bk[i] * d), h = T4(c.viewProj, [...q, 1]); if (Math.abs(h[0] / h[3]) > 1 + 1e-6 || Math.abs(h[1] / h[3]) > 1 + 1e-6 || h[2] / h[3] <= -1 || h[2] / h[3] >= 1) bad++; } });
    ok("!! EACH CASCADE HOLDS ITS SLICE OF THE VIEW: all eight corners of every slice inside its orthographic map", bad === 0 && K.length === 3 && K[0].worldTexel < K[2].worldTexel, `${bad} corners outside; texels ${K.map((c) => c.worldTexel.toFixed(4)).join(", ")} world units`);
    const reach = K.every((c) => { const q = c.center.map((v, i) => v - norm(sun.direction)[i] * (c.radius + 15)), h = T4(c.viewProj, [...q, 1]); return h[2] / h[3] > -1 && h[2] / h[3] < 1; });
    ok("!! A CASTER OUTSIDE THE VIEW, BETWEEN A CASCADE AND THE SUN, IS STILL IN ITS MAP: 15 units beyond each cascade's sphere toward the sun lies inside its depth range", reach);
    const moved = CL.cascadeMatrices(sun, { ...cam, view: CL.lookAt([7.013, 6, 10.007], [0.013, 0.4, 0.007], [0, 1, 0]) }, { cascades: 3, shadowDistance: 30, tileSize: 512 }), lr = (() => { const R = CL.lookAt([0, 0, 0], norm(sun.direction), [0, 1, 0]); return [[R[0], R[4], R[8]], [R[1], R[5], R[9]]]; })();
    const snapped = [...K, ...moved].every((c) => lr.every((ax) => { const t = (c.center[0] * ax[0] + c.center[1] * ax[1] + c.center[2] * ax[2]) / c.worldTexel; return Math.abs(t - Math.round(t)) < 1e-4; }));
    ok("!! THE CASCADES DO NOT SHIMMER: each centre sits on a whole texel of the light's frame, before and after the camera slides a hair (it moves by whole texels or not at all)", snapped);
    const lights = [{ type: "spot", position: [0, 4, 0], direction: [0, -1, 0], range: 8, innerAngle: 0.3, outerAngle: 0.5, shadow: true, priority: 9 }, sun], A = CL.allocateAtlas(lights, { slots: 4, camera: cam, cascades: 3, shadowDistance: 30 });
    ok("!! THE SUN'S CASCADES TAKE THE ATLAS'S FIRST TILES, before a spot light of any priority, each with a bias of two of its texels", JSON.stringify([...A.byLight.entries()]) === JSON.stringify([[1, [0, 3]], [0, [3, 1]]]) && A.faces.slice(0, 3).every((f, k) => Math.abs(f.worldBias - 2 * K[k].worldTexel) < 1e-9));
    const CK = CL.makeCookieAtlas(64), tile = (k) => { const r2 = CL.cookieRect(k), s2 = []; for (let i = 0; i < 4; i++) s2.push(CL.cookieSample(CK, r2, (i + 0.5) / 4, 0.37).join()); return s2.join("|"); };
    const texel = CL.cookieSample(CK, [0, 0, 1, 1], (10 + 0.5) / 64, (20 + 0.5) / 64), raw = [0, 1, 2].map((c) => CK.data[(20 * 64 + 10) * 4 + c] / 255);
    const grey = (c) => Math.max(...c) - Math.min(...c) < 0.02, at = (k) => CL.cookieSample(CK, CL.cookieRect(k), 0.8, 0.43);
    ok("!! EACH TILE HOLDS ITS PATTERN: tile 1 (rings) is grey, tile 2 (stained glass) is a saturated colour, tile 3 (leaves) is green-leaning", grey(at(1)) && !grey(at(2)) && Math.max(...at(2)) - Math.min(...at(2)) > 0.4 && at(3)[1] >= at(3)[0] && at(3)[1] >= at(3)[2], JSON.stringify([0, 1, 2, 3].map((k) => at(k).map((v) => v.toFixed(2)))));
    ok("!! THE COOKIE ATLAS: four different tiles; the lookup at a texel's centre is that texel exactly (rows from v = 0)", new Set([0, 1, 2, 3].map(tile)).size === 4 && texel.every((v, i) => Math.abs(v - raw[i]) < 1e-12));
    const spot = { type: "spot", position: [0, 4, 0], direction: [0, -1, 0], range: 8, innerAngle: 0.3, outerAngle: 0.5, color: [1, 1, 1], intensity: 2, cookie: 1 }, p0 = [0.3, 0, 0.2], tint = CL.cookieAt(CK, spot, p0), a = CL.lightAt(spot, p0, CK), b = CL.lightAt({ ...spot, cookie: null }, p0, CK);
    ok("!! A COOKIE MULTIPLIES ITS SPOT'S LIGHT by the tile projected down the cone, and is black outside the projection", a.rad.every((v, i) => Math.abs(v - b.rad[i] * tint[i]) < 1e-12) && CL.cookieAt(CK, spot, [20, 0, 0]).every((v) => v === 0) && tint.some((v) => v < 0.99));
});

console.log("4. THE PAGE ON WEBGL2 (lights-demo.html)");
await pageChecks("WEBGL2", "lights-demo.html", "__lights", ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]);
console.log("5. THE PAGE ON WEBGPU (lights-gpu.html, 2026-11-22)");
await pageChecks("WEBGPU", "lights-gpu.html", "__lightsGpu", [...PRESENT_ARGS]);

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
// 2026-11-22, WEBGPU (section 5, lights-gpu.html): 11 mutants of the WGSL half, 10 RED -- the cell index transposed, the list read from the count's slot, the window not the CPU's,
// the tile's v not flipped (WebGL2's order), the cube face from the wrong direction, no shadow bias, the spot cone dropped, the cell counts written as zero, the light count
// wrong (the brute loop runs none), the atlas never cleared. ONE STAYS GREEN: the shadow matrices left in -1..1 depth -- the shadow pass and the lookup then agree on the same
// -1..1 values, and only casters within about 0.1 of a light (where that depth is below WebGPU's 0) are lost; nothing in this scene is that close. Recorded, not hidden.
// 2026-11-22, FROXELS, CASCADES AND COOKIES: 16 more, ALL 16 RED -- froxel slices even instead of exponential, a froxel's box from one depth only, the GLSL froxel tile y flipped,
// the WGSL slice linear, GLSL not adding the sun outside brute, WGSL lighting from the sun's wrong side, cascades not snapped, cascades not pushed back toward the sun (GREEN at
// first: no check put a caster outside the view; one 15 units beyond each cascade toward the sun now must lie in its map), GLSL picking a cascade too far, WGSL giving the sun the
// spot's bias, the splits all even, cookies never sampled on the CPU, the GLSL cookie's v flipped, the WGSL cookie not clamped inside its tile, cookie tiles swapped (GREEN at first:
// both backends read the same wrong tile and only "four tiles differ" was asked; which pattern each tile holds is now checked), and a cookie not black outside its projection.
