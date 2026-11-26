// WebGLEngine/tools/ship/softShadows-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/softShadows-selfcheck.mjs      (two or three minutes: lights-demo.html on WebGL2 and lights-gpu.html on WebGPU in headless Chromium)
//
// SHADOW QUALITY, HELD (Keith: "shadow quality -- softer edges, and shadows inside the fog"). render/clusteredLights.mjs's SOFT SHADOWS (CLUSTERED_SOFT / clusteredWGSL({ soft })):
// percentage-closer soft shadows, contact-hardening, the penumbra the light's size by similar triangles; render/volumetricFog.mjs's LIGHT SHAFTS (createFogGPU(..., { lighting })):
// the moon's cascaded shadow sampled at every step of the fog's march.
//
//   1  THE PENUMBRA    on the CPU, from allocateAtlas's faces: a spot light's, times the world size of a texel at the receiver, is softness x (d_r - d_b) / d_b exactly (similar
//                      triangles); the sun's is the gap times tan(its angular radius); none where the blocker touches the receiver, none for a light with no softness
//   2, 3  THE PAGES    each backend, ?soft=1 against the hard shadows of the same frame (one moving light, no cookie): away from any shadow's edge the picture is the same, to
//                      2 levels; across the edges the gradient falls (the median under 0.6 of the hard one's); and THE EDGES HARDEN AT CONTACT -- at a pillar's foot the edge
//                      keeps half again as much of its sharpness as 0.6 or more away
//   4  THE SHAFTS      lights-gpu.html ?fog=1 against &shafts=0: the moon's shadow only ever takes light away, and takes a good deal; the GPU's fog is fogCPU's march with the moon
//                      hidden wherever a ray toward it meets a pillar (cast on the CPU, the cascades' 28-unit reach respected) -- far closer than the march that never hides
//                      it; and on the CPU, a march where nothing is hidden is the closed form, one where all is hidden has the ambient alone
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as CL from "../../render/clusteredLights.mjs";
import { fogCPU } from "../../render/volumetricFog.mjs";
import { invert4 } from "../../render/gizmo.mjs";
import { PRESENT_ARGS } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require = createRequire(import.meta.url), { chromium } = resolvePlaywright(require), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const T4 = (m, v) => [0, 1, 2, 3].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);
const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };

console.log("softShadows-selfcheck -- soft shadows that harden at contact, and light shafts in the fog\n");

console.log("1. THE PENUMBRA");
await section(async () => {
    const spot = { type: "spot", position: [0, 4, 0], direction: [0, -1, 0], range: 8, innerAngle: 0.3, outerAngle: 0.5, shadow: true, priority: 3, softness: 0.12 };
    const plain = { ...spot, position: [5, 4, 0], softness: undefined, priority: 1 };
    const sun = { type: "directional", direction: [-0.45, -1, -0.35], color: [1, 1, 1], intensity: 1, shadow: true, softness: 0.05 };
    const cam = { view: CL.lookAt([7, 6, 10], [0, 0.4, 0], [0, 1, 0]), proj: CL.perspective(0.9, 1.5, 0.05, 100), near: 0.05, far: 100 };
    const A = CL.allocateAtlas([sun, spot, plain], { slots: 4, atlasSize: 2048, camera: cam, cascades: 3, shadowDistance: 30, casterReach: 20 }), fS = A.faces[A.byLight.get(1)[0]], fP = A.faces[A.byLight.get(2)[0]];
    const z01 = (f, p) => { const q = T4(f.viewProj, [...p, 1]); return q[2] / q[3] * 0.5 + 0.5; };
    const fov = Math.min(Math.PI * 0.95, 2 * spot.outerAngle * 1.05), texelAngle = (2 * Math.tan(fov / 2)) / 512;
    let worst = 0;
    for (const [db, dr] of [[1, 4], [2, 3.9], [0.5, 1], [3, 3.5]]) {
        const pen = CL.penumbraTexels(fS, z01(fS, [0, 4 - dr, 0]), z01(fS, [0, 4 - db, 0])), world = pen * dr * texelAngle, want = (spot.softness * (dr - db)) / db;
        worst = Math.max(worst, Math.abs(world - want) / want);
    }
    ok("!! A SPOT LIGHT'S PENUMBRA, times a texel's world size at the receiver, IS softness x (d_r - d_b) / d_b -- similar triangles -- for four blocker and receiver depths", worst < 1e-4, `worst ${(worst * 100).toExponential(2)} %`);
    const sunFaces = A.byLight.get(0), c0 = A.faces[sunFaces[0]], dirS = norm(sun.direction), base = [1, 0, 1], up = [base[0] - dirS[0] * 2, base[1] - dirS[1] * 2, base[2] - dirS[2] * 2];
    const sunPen = CL.penumbraTexels(c0, z01(c0, base), z01(c0, up)), sunWorld = sunPen * c0.worldBias / 2, sunWant = 2 * Math.tan(sun.softness);
    ok("!! THE SUN'S, times its cascade's texel, IS THE GAP TIMES tan(its angular radius) (a blocker 2 units toward the sun)", Math.abs(sunWorld - sunWant) / sunWant < 1e-4, `${sunWorld.toFixed(5)} against ${sunWant.toFixed(5)}`);
    const touch = CL.penumbraTexels(fS, z01(fS, [0, 1, 0]), z01(fS, [0, 1, 0])), none = CL.penumbraTexels(fP, z01(fP, [5, 0, 0]), z01(fP, [5, 2, 0]));
    ok("!! NO PENUMBRA WHERE THE BLOCKER TOUCHES THE RECEIVER, and none for a light with no softness", touch === 0 && none === 0 && fS.penumbra > 0 && fS.depthNear > 0 && c0.depthNear === 0, `${touch}, ${none}`);
});

// ---- the pages ----
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
const srv = http.createServer((q, r) => { const f = path.join(ENG, decodeURIComponent(q.url.split("?")[0])); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const W = 480, H = 320;
const grabber = (browser, file, stateVar, errors) => async (q) => {
    const p = await browser.newPage({ viewport: { width: W, height: H } }); p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`http://127.0.0.1:${srv.address().port}/${file}?ease=0&t=3.5&gputimer=0${q}`);
    await p.waitForFunction((v) => window[v] && (window[v].ready || window[v].error), stateVar, { timeout: 90000 });
    const r = await p.evaluate(async (v) => { const s = window[v]; if (s.error) return { error: s.error }; const c = await s.capture(); return { ...c, vp: s.viewProj, eye: s.eye, pillars: [...s.pillars, ...(s.boards || [])], lights: s.lights, fogParams: s.fogParams, error: s.error }; }, stateVar); await p.close();
    if (r.error) throw new Error(`${file}${q}: ${r.error}`);
    r.px = Array.from(Buffer.from(r.b64, "base64")); delete r.b64;   // the page sends its pixels as base64 (one string, not a JSON array of numbers)
    if (!r.topDown) { const flip = new Array(r.px.length); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w * 4; x++) flip[(r.h - 1 - y) * r.w * 4 + x] = r.px[y * r.w * 4 + x]; r.px = flip; }   // WebGL2's rows bottom first: turned top first
    return r;
};
const lum = (px, i) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
// the pixel's ray (rows top first): origin the eye, through the far plane of the GL-style view-projection
const rayOf = (r, inv, x, y) => { const nx = ((x + 0.5) / r.w) * 2 - 1, ny = 1 - ((y + 0.5) / r.h) * 2, f = T4(inv, [nx, ny, 1, 1]); return norm([f[0] / f[3] - r.eye[0], f[1] / f[3] - r.eye[1], f[2] / f[3] - r.eye[2]]); };
const boxHit = (o, d, b) => { let t0 = 0, t1 = Infinity; for (let k = 0; k < 3; k++) { const lo = b.position[k] - b.size[k] / 2, hi = b.position[k] + b.size[k] / 2; if (Math.abs(d[k]) < 1e-12) { if (o[k] < lo || o[k] > hi) return Infinity; continue; } let a = (lo - o[k]) / d[k], c = (hi - o[k]) / d[k]; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) return Infinity; } return t0; };
const GROUND = { position: [0, -0.05, 0], size: [30, 0.1, 30] };   // render/lightsDemoScene.mjs's
// what the pixel's ray meets first: { t, ground } (ground: the slab's top, not a pillar), or null
const castOf = (r, pillars, o, d) => { let best = { t: Infinity, ground: false }; const g = boxHit(o, d, GROUND); if (g < best.t) best = { t: g, ground: true }; for (const b of pillars) { const t = boxHit(o, d, b); if (t < best.t) best = { t, ground: false }; } return best.t < Infinity ? best : null; };
const footDist = (p, b) => Math.hypot(Math.max(0, Math.abs(p[0] - b.position[0]) - b.size[0] / 2), Math.max(0, Math.abs(p[2] - b.position[2]) - b.size[2] / 2));

const softChecks = (title, file, stateVar, args) => section(async () => {
    const browser = await chromium.launch({ args, ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) }), errors = [], grab = grabber(browser, file, stateVar, errors);
    // one moving light (not 64) and no cookie: the shadows' edges stand out
    const [hard, soft, off] = await Promise.all([grab("&n=1&cookie=0"), grab("&n=1&cookie=0&soft=1"), grab("&n=1&cookie=0&shadows=0")]);   // side by side: three shader compiles at once
    await browser.close();
    const w = hard.w, h = hard.h, N = w * h, cls = new Int8Array(N), LH = new Float32Array(N), LS = new Float32Array(N);   // cls: 1 shadowed, 0 lit, -1 neither
    for (let k = 0; k < N; k++) { LH[k] = lum(hard.px, k * 4); LS[k] = lum(soft.px, k * 4); const d = lum(off.px, k * 4) - LH[k]; cls[k] = d >= 6 ? 1 : Math.abs(d) <= 1 ? 0 : -1; }
    const mixedWithin = (x, y, R) => { let s = false, l = false; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const c = cls[yy * w + xx]; if (c === 1) s = true; else if (c === 0) l = true; else return true; if (s && l) return true; } return false; };
    const inv = invert4(hard.vp), pillars = hard.pillars, groundAt = new Int8Array(N), foot = new Float32Array(N);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = rayOf(hard, inv, x, y), hit = castOf(hard, pillars, hard.eye, d); if (hit && hit.ground) { groundAt[y * w + x] = 1; const p = [0, 1, 2].map((i) => hard.eye[i] + d[i] * hit.t); foot[y * w + x] = Math.min(...pillars.map((b) => footDist(p, b))); } }
    // an edge's sharpness: the luminance gradient across it (central differences), soft against hard, on ground whose neighbours are ground too (no pillar's silhouette)
    const grad = (L, k) => Math.abs(L[k + 1] - L[k - 1]) + Math.abs(L[k + w] - L[k - w]);
    let away = 0, awaySame = 0; const all = [], nearFoot = [], farFoot = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const k = y * w + x;
        if (!mixedWithin(x, y, 16)) { away++; if (Math.abs(LS[k] - LH[k]) <= 2) awaySame++; continue; }
        if (!mixedWithin(x, y, 1) || cls[k] === -1 || !(groundAt[k] && groundAt[k - 1] && groundAt[k + 1] && groundAt[k - w] && groundAt[k + w])) continue;
        const gh = grad(LH, k); if (gh < 6) continue;
        const r = grad(LS, k) / gh; all.push(r); if (foot[k] < 0.12) nearFoot.push(r); else if (foot[k] > 0.6) farFoot.push(r);
    }
    const median = (a) => { const b = [...a].sort((p, q) => p - q); return b.length ? b[b.length >> 1] : NaN; };
    ok(`!! ${title}: AWAY FROM ANY SHADOW'S EDGE (16 pixels round), SOFT IS HARD to 2 levels -- in full light and deep shadow alike`, away > N * 0.3 && awaySame >= away * 0.995 && errors.length === 0, `${awaySame} of ${away}${errors[0] ? "; " + errors[0] : ""}`);
    ok(`!! ${title}: AT THE EDGES THE SHADOWS SOFTEN -- across a hard edge the soft picture's gradient is, in the median, under 0.6 of the hard one's`, all.length > 200 && median(all) < 0.6, `median ${median(all).toFixed(2)} over ${all.length} edge pixels`);
    ok(`!! ${title}: AND HARDEN AT CONTACT -- at a pillar's foot (within 0.12) the edge keeps half again as much of its sharpness as 0.6 or more away`, nearFoot.length > 15 && farFoot.length > 30 && median(nearFoot) > 1.5 * median(farFoot), `median ${median(nearFoot).toFixed(2)} at the foot (${nearFoot.length} pixels), ${median(farFoot).toFixed(2)} away (${farFoot.length})`);
});

console.log("2. THE WEBGL2 PAGE");
await softChecks("WEBGL2", "lights-demo.html", "__lights", ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]);
console.log("3. THE WEBGPU PAGE");
await softChecks("WEBGPU", "lights-gpu.html", "__lightsGpu", [...PRESENT_ARGS]);

console.log("4. THE SHAFTS");
await section(async () => {
    const P0 = { density: 0.05, falloff: 0, albedo: 0.9, ambient: [0.01, 0.012, 0.018], lightDir: [0.45, 1, 0.35], lightColor: [1.2, 1.3, 1.7], g: 0.5, maxDistance: 40, steps: 48, jitter: true };
    const ray = { origin: [3, 2, 9], dir: norm([-0.3, -0.2, -1]), distance: 14, color: [0.2, 0.3, 0.4], px: 17, py: 5 };
    const a = fogCPU(P0, ray), b = fogCPU(P0, { ...ray, shadowOf: () => 1 }), c = fogCPU(P0, { ...ray, shadowOf: () => 0 }), d = fogCPU({ ...P0, lightColor: [0, 0, 0] }, ray);
    ok("!! ON THE CPU: THE SHAFTS' MARCH WITH NOTHING HIDDEN IS THE CLOSED FORM; WITH ALL HIDDEN, THE AMBIENT ALONE", a.every((v, i) => Math.abs(v - b[i]) < 1e-12) && c.every((v, i) => Math.abs(v - d[i]) < 1e-12) && c[0] < a[0], `${b.map((v) => v.toFixed(4))} / ${c.map((v) => v.toFixed(4))}`);
    const browser = await chromium.launch({ args: [...PRESENT_ARGS], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) }), errors = [], grab = grabber(browser, "lights-gpu.html", "__lightsGpu", errors);
    const [shafts, flat, clear] = await Promise.all([grab("&fog=1"), grab("&fog=1&shafts=0"), grab("&canopy=1")]);   // the same scene, canopy and all, without the fog
    await browser.close();
    const w = shafts.w, h = shafts.h, N = w * h; let brighter = 0, darker = 0;
    for (let k = 0; k < N; k++) { const dl = lum(shafts.px, k * 4) - lum(flat.px, k * 4); if (dl > 1) brighter++; if (dl < -3) darker++; }
    ok("!! THE MOON'S SHADOW ONLY TAKES LIGHT FROM THE FOG, AND TAKES A GOOD DEAL", brighter === 0 && darker > N * 0.05 && errors.length === 0, `${darker} pixels darker by more than 3 levels, ${brighter} brighter${errors[0] ? "; " + errors[0] : ""}`);
    // the CPU's march, the moon hidden wherever a ray toward it meets a pillar; past the cascades' reach (28 along the view) the GPU has no moon shadow, nor does this
    const P = shafts.fogParams, inv = invert4(shafts.vp), toSun = norm(P.lightDir);
    const V = [T4(inv, [0, 0, 1, 1]), T4(inv, [0, 0, -1, 1])].map((q) => q.map((v) => v / q[3])), look = norm([0, 1, 2].map((i) => V[0][i] - V[1][i]));
    const hidden = (p) => { const along = [0, 1, 2].reduce((s, i) => s + (p[i] - shafts.eye[i]) * look[i], 0); if (along > 28) return 1; return shafts.pillars.some((b) => boxHit(p, toSun, b) < Infinity) ? 0 : 1; };
    let n = 0, errShadow = 0, errFlat = 0, within = 0;
    for (let y = 1; y < h; y += 5) for (let x = 2; x < w; x += 5) {
        const d = rayOf(shafts, inv, x, y), hit = castOf(shafts, shafts.pillars, shafts.eye, d), k = (y * w + x) * 4;
        const color = [0, 1, 2].map((i) => clear.px[k + i] / 255), args = { origin: shafts.eye, dir: d, distance: hit ? hit.t : 1e9, color, px: x, py: y };
        const want = fogCPU(P, { ...args, shadowOf: hidden }).map((v) => v * 255), wantFlat = fogCPU(P, args).map((v) => v * 255);
        const e = Math.max(...[0, 1, 2].map((i) => Math.abs(shafts.px[k + i] - want[i]))), ef = Math.max(...[0, 1, 2].map((i) => Math.abs(shafts.px[k + i] - wantFlat[i])));
        n++; errShadow += e; errFlat += ef; if (e <= 4) within++;
    }
    ok("!! THE GPU'S SHAFTS ARE THE CPU'S MARCH WITH THE MOON HIDDEN BEHIND THE PILLARS: nine pixels in ten to 4 levels (a 5-pixel lattice), and on average far closer than the march that never hides it", within >= n * 0.9 && errShadow < 0.4 * errFlat, `${within} of ${n} to 4 levels; mean error ${(errShadow / n).toFixed(2)} levels against ${(errFlat / n).toFixed(2)} unhidden`);
});

srv.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 11 mutants of render/clusteredLights.mjs and 7 of render/volumetricFog.mjs, each in a hard-linked copy of the tree. ALL 11 RED -- the penumbra always the most
// (WGSL, GLSL), the blocker search taking everything, the filter's taps all at the centre, the sun's penumbra fixed, the CPU's penumbra not divided by the blocker's depth, a
// spot's scale without the tile's pixels, the sun's angle not through tan, the raw-depth sampler not bound (WebGL2), the max penumbra not written (WebGPU), the face rows without
// the penumbra scale. 6 OF 7 RED -- the moon's shadow ignored (the page fails: its bindings drop out of the auto layout), sampled halfway along the ray, the transmittance never
// falling, the bind group not set, the CPU's shadow taken from the ambient, the shadow looked up toward the wrong side. GREEN AND SAID SO: the shadow taking the ambient too --
// this fog's ambient (0.01 to 0.018) is under a level. BEFORE THE SABOTAGE the gate found the first measures wrong: a per-pixel change misses a wide, faint penumbra (the edge's
// GRADIENT is what softens), the pillars alone are too thin to cut visible shafts (the canopy, ?fog=1), and penumbrae of 12 texels were too narrow to see (24 now).
