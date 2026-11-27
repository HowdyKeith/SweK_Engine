// WebGLEngine/tools/ship/flightLights-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flightLights-selfcheck.mjs      (a minute or two: flight-gpu.html on WebGPU in headless Chromium)
//
// THE NEW LIGHTING IN A GAME PAGE, HELD. flight-gpu.html ?lights=1 lights its ships with render/clusteredLights.mjs -- a sun with three cascades of shadow, every shot and every
// explosion or muzzle flash a clustered point light -- and ?fog=1 lays render/volumetricFog.mjs's haze over the battle. Each is held to what it does to the picture, with the sim
// and the orbit frozen (window.__flightLights.freeze) so two frames differ only by the switch thrown between them:
//
//   1  IT RUNS        lights and fog together, 40 frames: no page error, no WebGPU error; the sun's three cascades in the atlas, no cell overflowing; the frame's lights are the sun,
//                     every shot the sim has and every flash 36 units or larger -- counted against the sim's own lists
//   2  THE SUN        it lights the ships (sun off, the ships darker; nothing else on screen moves), and its cascades shade them: two ships set side by side across the sun,
//                     with the ships' depth left out of the atlas the picture is brighter by the pair (and on ships only), darker nowhere -- close up and from 1100 units
//                     (a later cascade)
//   3  A POINT LIGHT  a red light 40 units over a ship reddens that ship and nothing but ships within its range -- a ship framed at the left edge too; the same light 2000 units higher, outside its range, changes nothing at all
//   4  THE FOG        where nothing wrote depth (all but the ships) the fogged pixel is render/volumetricFog.mjs fogCPU's closed form over the 12000-unit ray, to 2 levels; the
//                     ships each by their own distance: (fogged - fog light) / (clear - fog light) is e^-(density x distance); without ?lights and ?fog the page has no __flightLights
//   5  THE SHAFTS     (2026-11-27) on by default with lights and fog; in a thickened haze, looking past a ship toward the sun, switched live on one frozen frame, the ships' shadows only darken the fog, and with the
//                     ships out of the atlas the switch changes nothing
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PRESENT_ARGS } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { mat4Invert } from "../../render/motionVectors.mjs";
import { fogCPU } from "../../render/volumetricFog.mjs";

const require = createRequire(import.meta.url), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };

console.log("flightLights-selfcheck -- clustered lights, cascaded sun shadows and fog on flight-gpu.html\n");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".json": "application/json" };
const srv = http.createServer((q, r) => { const f = path.join(ENG, decodeURIComponent(q.url.split("?")[0])); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const { chromium } = resolvePlaywright(require), browser = await chromium.launch({ args: [...PRESENT_ARGS], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) });
const W = 960, H = 600;
const open = async (q, until = "L.frames > 40") => {
    const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }), errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`http://127.0.0.1:${srv.address().port}/flight-gpu.html${q}`);
    // the brain panel covers the bottom left; hide every overlay so the canvas is all there is
    await p.addStyleTag({ content: "body > *:not(canvas) { display: none !important; }" });
    if (until) await p.waitForFunction(`(() => { const L = window.__flightLights; return L && (${until}); })()`, null, { timeout: 150000 });
    return { p, errors };
};
// freeze, then let two frames pass with the switches as given, then capture
const shot = (p, set = {}) => p.evaluate(async (set) => {
    const L = window.__flightLights; Object.assign(L, set);
    const f0 = L.frames; await new Promise((res) => { const t = () => (L.frames >= f0 + 3 ? res() : requestAnimationFrame(t)); t(); });
    const c = await L.capture(); return c;
}, set).then((c) => ({ ...c, px: Buffer.from(c.b64, "base64") }));   // the page sends its pixels as base64 (a JS array of millions of numbers cost most of this gate)
const lum = (px, i) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];

console.log("1. IT RUNS");
await section(async () => {
    const { p, errors } = await open("?lights=1&fog=1", "L.frames > 40 && L.count && L.count.simShots > 3");
    const R = await p.evaluate(() => { const L = window.__flightLights; return { stats: L.stats, count: L.count, error: L.error, frames: L.frames }; });
    await p.close();
    const c = R.count, wantShots = Math.min(c.simShots, 250 - 1 - Math.min(c.simFx, 249));
    ok("!! lights and fog together, 40 frames: no page error, no WebGPU error", errors.length === 0 && !R.error, errors[0] || R.error || `${R.frames} frames`);
    ok("!! THE SUN'S THREE CASCADES ARE IN THE ATLAS, viewed through view-fitted clusters, no cell overflowing", R.stats.cascades === 3 && R.stats.faces === 3 && R.stats.space === "view" && R.stats.overflow === 0, JSON.stringify(R.stats));
    ok("!! THE FRAME'S LIGHTS ARE THE SUN, EVERY SHOT AND EVERY FLASH 36 UNITS OR LARGER (against the sim's own lists)", c.sun === 1 && c.fx === Math.min(c.simFx, 249) && c.shots === wantShots && c.shots > 3 && c.lights === 1 + c.fx + c.shots, JSON.stringify(c));
});

// the ships on screen: where the lit frame differs from the frame with no light at all but the ambient
const shipMask = (lit, dark) => { const m = new Uint8Array(lit.w * lit.h); for (let k = 0; k < m.length; k++) m[k] = Math.abs(lum(lit.px, k * 4) - lum(dark.px, k * 4)) > 3 ? 1 : 0; return m; };
const near = (m, w, h, x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && m[yy * w + xx]) return true; } return false; };

console.log("2. THE SUN");
await section(async () => {
    const { p, errors } = await open("?lights=1");
    const base = { freeze: true, points: false, sun: true, casters: true };
    // two ships side by side across the sun (frozen, the sim moves neither): the sunward one's shadow, 60 units long, falls on the other's near wing
    const pair = await p.evaluate(async () => { await new Promise((r) => { window.__flightLights.freeze = true; requestAnimationFrame(() => requestAnimationFrame(r)); });
        const live = window.__tacticsFight.A.filter((x) => !x.dead), [a, b] = live, s = [0.75, 0.53], n = Math.hypot(s[0], s[1]), u = [s[0] / n, s[1] / n];
        const h = Math.atan2(-u[1], -u[0]) * 180 / Math.PI;   // the heading whose vector (sin, -cos) is (-u.z, u.x): across the sun
        a.heading = b.heading = h; b.x = a.x + 80 * u[0]; b.y = a.y + 80 * u[1];
        const mid = [(a.x + b.x) / 2, 0, (a.y + b.y) / 2]; window.__flightLights.view = { eye: [mid[0] - 220, 420, mid[2] - 160], center: mid };   // close, from above
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
        const m = window.__flightLights.vp, cv = document.getElementById("c"), at = (x, z) => { const c = [0, 1, 2, 3].map((r) => m[r] * x + m[4 + r] * 10 + m[8 + r] * z + m[12 + r]); return [(c[0] / c[3] * 0.5 + 0.5) * cv.width, (0.5 - c[1] / c[3] * 0.5) * cv.height]; };
        return { a: at(a.x, a.y), b: at(b.x, b.y), mid }; });
    const lit = await shot(p, base), dark = await shot(p, { ...base, sun: false }), open_ = await shot(p, { ...base, casters: false }), again = await shot(p, base);
    // the same pair from 1100 units: past the first cascade (its far split some 860 units out), so a later cascade's tile shades it
    const farPair = await p.evaluate(async (mid) => { const L = window.__flightLights; L.view = { eye: [mid[0] - 484, 924, mid[2] - 352], center: mid };
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
        const m = L.vp, cv = document.getElementById("c"), c = [0, 1, 2, 3].map((r) => m[r] * mid[0] + m[4 + r] * 10 + m[8 + r] * mid[2] + m[12 + r]); return [(c[0] / c[3] * 0.5 + 0.5) * cv.width, (0.5 - c[1] / c[3] * 0.5) * cv.height]; }, pair.mid);
    const litF = await shot(p, base), openF = await shot(p, { ...base, casters: false });
    const err = await p.evaluate(() => window.__flightLights.error); await p.close();
    let liftedF = 0, darkF = 0; for (let k = 0; k < litF.w * litF.h; k++) { const x = k % litF.w, y = (k / litF.w) | 0, d = lum(openF.px, k * 4) - lum(litF.px, k * 4); if (d > 3 && Math.hypot(x - farPair[0], y - farPair[1]) < 60) liftedF++; if (d < -3) darkF++; }
    const N = lit.w * lit.h, m = shipMask(lit, dark); let ships = 0, brighter = 0, elsewhere = 0, lifted = 0, liftedByPair = 0, liftedOnShips = 0, darkened = 0, same = 0;
    for (let k = 0; k < N; k++) {
        const a = lum(lit.px, k * 4), b = lum(dark.px, k * 4), o = lum(open_.px, k * 4);
        if (m[k]) { ships++; if (a > b) brighter++; } else if (Math.abs(a - b) > 3) elsewhere++;
        const x = k % lit.w, y = (k / lit.w) | 0, byPair = Math.hypot(x - pair.a[0], y - pair.a[1]) < 80 || Math.hypot(x - pair.b[0], y - pair.b[1]) < 80;
        if (o - a > 3) { lifted++; if (byPair) liftedByPair++; else if (Math.abs(o - lum(dark.px, k * 4)) > 3) liftedOnShips++; }   // a ship: what the sun lights once nothing is shadowed if (a - o > 3) darkened++;
        if (Math.abs(a - lum(again.px, k * 4)) > 1) same++;
    }
    ok("!! FROZEN, THE SAME SWITCHES GIVE THE SAME PICTURE (the comparisons below are the switch's alone)", same === 0 && errors.length === 0 && !err, `${same} pixels differ`);
    ok("!! THE SUN LIGHTS THE SHIPS: with it off, the ships are darker -- every pixel that changed is brighter lit, and nothing off the ships changed", ships > 200 && brighter === ships && elsewhere === 0, `${ships} ship pixels, ${brighter} brighter lit; ${elsewhere} elsewhere`);
    ok("!! ITS CASCADES SHADE THEM: two ships side by side across the sun -- with the ships' depth left out of the atlas, pixels by the pair are brighter, none darker, and any others brighter are on ships too (a ship in the frame shading itself or a neighbour)", liftedByPair > 100 && liftedByPair + liftedOnShips === lifted && darkened === 0, `${lifted} brighter without shadows (${liftedByPair} by the pair, ${liftedOnShips} on other ships), ${darkened} darker`);
    ok("!! AND FROM 1100 UNITS, IN A LATER CASCADE, THE PAIR IS STILL SHADED (pixels by it brighter without the casters, none darker)", liftedF > 12 && darkF === 0, `${liftedF} brighter by the pair, ${darkF} darker`);
});

console.log("3. A POINT LIGHT");
await section(async () => {
    const { p, errors } = await open("?lights=1");
    const base = { freeze: true, points: false, sun: false, casters: true, extra: [] };
    const ship = await p.evaluate(async () => { const e = window.__tacticsFight.A.find((x) => !x.dead), L = window.__flightLights; L.freeze = true; L.view = { eye: [e.x - 260, 380, e.y - 200], center: [e.x, 0, e.y] };
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))); const m = L.vp, v = [e.x, 30, e.y], c = [0, 1, 2, 3].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r]), cv = document.getElementById("c");
        const proj = (x, z) => { const c = [0, 1, 2, 3].map((r) => m[r] * x + m[4 + r] * 15 + m[8 + r] * z + m[12 + r]); return [(c[0] / c[3] * 0.5 + 0.5) * cv.width, (0.5 - c[1] / c[3] * 0.5) * cv.height]; };
        const inReach = window.__tacticsFight.A.concat(window.__tacticsFight.B).filter((o) => !o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 300 + 90).map((o) => proj(o.x, o.y));   // the light's range and a ship's length
        return { inReach, x: e.x, y: e.y, sx: Math.round((c[0] / c[3] * 0.5 + 0.5) * cv.width), sy: Math.round((0.5 - c[1] / c[3] * 0.5) * cv.height) }; });
    const plain = await shot(p, base);
    const red = (x, z) => ({ type: "point", position: [x, 40, z], range: 300, color: [1, 0.1, 0.1], intensity: 30000, shadow: false });
    const lit = await shot(p, { ...base, extra: [red(ship.x, ship.y)] }), far = await shot(p, { ...base, extra: [{ ...red(ship.x, ship.y), position: [ship.x, 2040, ship.y] }] });
    const err = await p.evaluate(() => window.__flightLights.error); await p.close();
    let reddened = 0, nearIt = 0, neighbour = 0, farChanged = 0, farLight = 0; const w = lit.w;
    for (let k = 0; k < w * lit.h; k++) {
        const i = k * 4, dR = lit.px[i] - plain.px[i], dG = lit.px[i + 1] - plain.px[i + 1], x = k % w, y = (k / w) | 0;
        if (dR > 3) { reddened++; if (Math.hypot(x - ship.sx, y - ship.sy) < 250 && dR > dG) nearIt++; else if (Math.hypot(x - ship.sx, y - ship.sy) < 250 || ship.inReach.some(([a, b]) => Math.hypot(x - a, y - b) < 250)) neighbour++; else farChanged++; }
        if (Math.abs(lum(far.px, i) - lum(plain.px, i)) > 1) farLight++;
    }
    ok("!! A RED LIGHT 40 UNITS OVER A SHIP REDDENS THAT SHIP -- and nothing but it and any ship within its 300-unit range", nearIt > 300 && farChanged === 0 && errors.length === 0 && !err, `${reddened} pixels redder: ${nearIt} on the ship at (${ship.sx}, ${ship.sy}), ${neighbour} by the ${ship.inReach.length} other ships in reach, ${farChanged} elsewhere`);
    ok("!! THE SAME LIGHT 2000 UNITS HIGHER, OUTSIDE ITS 300-UNIT RANGE, CHANGES NOTHING", farLight === 0, `${farLight} pixels changed`);
    // AT THE FRAME'S EDGE: the camera slid 330 units to its right, the ship near the left edge -- the view clusters must cover the whole frustum, not only its middle
    const q = await open("?lights=1");
    const edge = await q.p.evaluate(async () => { const e = window.__tacticsFight.A.find((x) => !x.dead), L = window.__flightLights; L.freeze = true;
        const eye = [e.x - 260, 380, e.y - 200], f = [e.x - eye[0], -eye[1], e.y - eye[2]], r = [-f[2], 0, f[0]], rl = Math.hypot(r[0], r[2]), sh = [330 * r[0] / rl, 0, 330 * r[2] / rl];
        L.view = { eye: eye.map((v, i) => v + sh[i]), center: [e.x + sh[0], 0, e.y + sh[2]] };
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(res))));
        const m = L.vp, c = [0, 1, 2, 3].map((k) => m[k] * e.x + m[4 + k] * 30 + m[8 + k] * e.y + m[12 + k]), cv = document.getElementById("c"); return { x: e.x, y: e.y, ndcX: c[0] / c[3], sx: (c[0] / c[3] * 0.5 + 0.5) * cv.width, sy: (0.5 - c[1] / c[3] * 0.5) * cv.height }; });
    const ePlain = await shot(q.p, base), eLit = await shot(q.p, { ...base, extra: [red(edge.x, edge.y)] }); await q.p.close();
    let eRed = 0; for (let k = 0; k < eLit.w * eLit.h; k++) { const x = k % eLit.w, y = (k / eLit.w) | 0; if (eLit.px[k * 4] - ePlain.px[k * 4] > 3 && Math.hypot(x - edge.sx, y - edge.sy) < 250) eRed++; }
    ok("!! AND AT THE FRAME'S EDGE TOO: a ship framed near the left edge is reddened by the light over it", Math.abs(edge.ndcX) > 0.6 && eRed > 300 && q.errors.length === 0, `the ship at ${edge.ndcX.toFixed(2)} of the half-width; ${eRed} pixels redder`);
});

console.log("4. THE FOG");
await section(async () => {
    const { p, errors } = await open("?lights=1&fog=1&shafts=0");   // the closed form has nothing hidden from the sun: the shafts are section 5's
    const clear = await shot(p, { freeze: true, fogOn: false }), hazy = await shot(p, { freeze: true, fogOn: true });
    const cam = await p.evaluate(() => { const L = window.__flightLights, live = window.__tacticsFight.A.concat(window.__tacticsFight.B).filter((e) => !e.dead), d = live.map((e) => Math.hypot(e.x - L.eye[0], -L.eye[1], e.y - L.eye[2]));
        return { vp: L.vp, eye: L.eye, P: L.fogParams, error: L.error, dmin: Math.min(...d), dmax: Math.max(...d) }; }); await p.close();
    // where the depth buffer is clear (all but the ships: the grid, the shots and the flashes write no depth), the ray runs maxDistance through fog of one density: the closed form
    const inv = mat4Invert(cam.vp), w = clear.w, h = clear.h; const Ts = []; let sky = 0, match = 0, worst = 0, skyChange = 0, rest = 0, restChange = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        const k = (y * w + x) * 4, nx = ((x + 0.5) / w) * 2 - 1, ny = 1 - ((y + 0.5) / h) * 2, f = [0, 1, 2, 3].map((r) => inv[r] * nx + inv[4 + r] * ny + inv[8 + r] + inv[12 + r]), q = [f[0] / f[3] - cam.eye[0], f[1] / f[3] - cam.eye[1], f[2] / f[3] - cam.eye[2]], l = Math.hypot(...q), dir = q.map((v) => v / l);
        const want = fogCPU(cam.P, { origin: cam.eye, dir, distance: 1e9, color: [0, 1, 2].map((c) => clear.px[k + c] / 255) }).map((v) => Math.min(255, Math.max(0, v * 255)));
        const e = Math.max(...[0, 1, 2].map((c) => Math.abs(hazy.px[k + c] - want[c]))), d = Math.abs(lum(hazy.px, k) - lum(clear.px, k));
        if (e <= 2) { match++; skyChange += d; } else { rest++; restChange += d;
            // a ship: what was left of it, (hazy - fog's light) / (clear - fog's light), is its transmittance; read where the ship stands well clear of the fog's light
            const F = fogCPU(cam.P, { origin: cam.eye, dir, distance: 1e9, color: [0, 0, 0] }).map((v) => v / (1 - Math.exp(-cam.P.density * cam.P.maxDistance)) * 255), c = [0, 1, 2].reduce((b, i) => (Math.abs(clear.px[k + i] - F[i]) > Math.abs(clear.px[k + b] - F[b]) ? i : b), 0);
            if (Math.abs(clear.px[k + c] - F[c]) > 40) Ts.push((hazy.px[k + c] - F[c]) / (clear.px[k + c] - F[c])); }
        worst = Math.max(worst, e); sky++;
    }
    ok("!! THE SKY'S HAZE IS THE CLOSED FORM: everywhere but the ships, the fogged pixel is the clear one times e^-(density x 12000) plus the fog's light, to 2 levels (on a 2-pixel lattice)", match >= sky * 0.97 && skyChange / match > 4 && errors.length === 0 && !cam.error, `${match} of ${sky} to 2 levels, changed ${(skyChange / match).toFixed(1)} levels on average`);
    const lo = Math.exp(-cam.P.density * (cam.dmax + 150)), hi = Math.exp(-cam.P.density * Math.max(0, cam.dmin - 150)), inside = Ts.filter((t) => t >= lo - 0.03 && t <= hi + 0.03).length;
    ok("!! AND EACH SHIP IS HAZED BY ITS OWN DISTANCE: what is left of it, (fogged - the fog's light) / (clear - the fog's light), lies between e^-(density x distance) for the farthest ship and for the nearest (150 units either way, 0.03 for the levels) -- not the sky's e^-3", Ts.length > 20 && inside >= Ts.length * 0.95, `${inside} of ${Ts.length} ship pixels in [${lo.toFixed(3)}, ${hi.toFixed(3)}]; the sky's ${Math.exp(-cam.P.density * cam.P.maxDistance).toFixed(3)}`);
    const q = await open("", null), none = await q.p.evaluate(async () => { await new Promise((r) => setTimeout(r, 1500)); return window.__flightLights; }); await q.p.close();
    ok("!! without ?lights and ?fog the page has no __flightLights (and draws as it always did)", none === null && q.errors.length === 0);
});

console.log("5. THE SUN'S SHAFTS IN THE HAZE (2026-11-27)");
await section(async () => {
    // the page's own haze lets a ship's shadow take under a level from the fog; thickened (the same fogParams object the page draws with), the shafts show. One frozen frame,
    // the shafts switched live (flightLights.shaftsOn), and again with the ships' depth left out of the atlas (casters: false) -- then nothing may hide the sun
    const { p, errors } = await open("?lights=1&fog=1");
    // framed as shafts are seen: from 400 units behind a live ship, looking past it toward the sun, so the rays round its silhouette run inside its shadow (seen side-on from
    // the orbit, a ship's 50-unit shadow crosses a ray for 50 units of 12000 and takes under a level). The haze thick enough to show it, not so bright it saturates
    const info = await p.evaluate(() => { const L = window.__flightLights; L.freeze = true; Object.assign(L.fogParams, { density: 0.002, lightColor: [0.2, 0.19, 0.17], ambient: [0.01, 0.012, 0.02], steps: 48 });
        const s = window.__tacticsFight.A.concat(window.__tacticsFight.B).filter((e) => !e.dead)[0], u = (() => { const t = L.fogParams.lightDir, n = Math.hypot(...t); return t.map((v) => v / n); })(), c = [s.x, 0, s.y];
        L.view = { eye: c.map((v, i) => v - u[i] * 400), center: c }; return { shafts: L.shafts, timer: L.gpuTimer }; });
    const off = await shot(p, { freeze: true, shaftsOn: false }), on = await shot(p, { freeze: true, shaftsOn: true });
    const offNC = await shot(p, { freeze: true, shaftsOn: false, casters: false }), onNC = await shot(p, { freeze: true, shaftsOn: true, casters: false });
    const R = await p.evaluate(() => ({ error: window.__flightLights.error })); await p.close();
    const N = on.w * on.h; let darker = 0, brighter = 0, ncDiff = 0;
    for (let k = 0; k < N; k++) { const d = lum(on.px, k * 4) - lum(off.px, k * 4); if (d < -3) darker++; if (d > 1) brighter++; if (Math.abs(lum(onNC.px, k * 4) - lum(offNC.px, k * 4)) > 1) ncDiff++; }
    ok("!! THE SHAFTS ARE ON BY DEFAULT WITH ?lights=1&fog=1, and &shafts=0 is the plain haze", info.shafts === true && errors.length === 0 && !R.error, `${JSON.stringify(info)}${errors[0] ? "; " + errors[0] : ""}`);
    ok("!! LOOKING PAST A SHIP TOWARD THE SUN, IN A THICKER HAZE, ITS SHADOW TAKES LIGHT FROM IT: a fiftieth of the picture darker by over 3 levels, none brighter by over 1", darker > N * 0.02 && brighter === 0, `${darker} darker, ${brighter} brighter, of ${N}`);
    ok("!! AND IT IS THE SHIPS THAT DO IT: with their depth left out of the atlas, the shafts change nothing (to a level)", ncDiff <= N * 0.0005, `${ncDiff} pixels differ`);
});

await browser.close(); srv.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 12 mutants of flight-gpu.html, each in a hard-linked copy of the tree: 10 RED, 2 GREEN AND SAID SO -- the lit ships without the clustered light, no casters in the
// atlas, the first shot no light, the engine glows lit too, the fog marched from the wrong eye, the fog thicker than its params, the world position halved, no sun, every atlas
// face drawn with the first face's matrix (GREEN at first: the close pair sat in the first cascade; the pair seen from 1100 units, in a later one, is now held), the extra lights
// ignored. GREEN: the clusters fitted to a narrower (30-degree) camera -- a pixel past the narrow frustum's side is clamped to the edge cell, and the edge cells hold lights
// past it, so a ship at the frame's edge is still lit (the edge check added for it passes either way); the eye not written -- it feeds only the specular term, too faint here
// to cross a threshold. THE FIRST SWEEP FOUND THE GATE FLAKY: under load the battle had run on before the freeze and other ships, wholly in shadow, sat in the frame -- the
// ships are now told by what the unshadowed sun lights, not by what the shadowed sun lights.
// 2026-11-27, THE SHAFTS (section 5): 4 mutants of flight-gpu.html. ALL 4 RED -- the shafts' fog made without the lighting, the live switch ignored, the switch inverted,
// the shafts off by default. BEFORE THE SABOTAGE the section found the first framing wrong: from the orbit a ship's 50-unit shadow crosses a ray for 50 units of 12000 and
// changes nothing; looking past a ship toward the sun its shadow runs along the rays, and the shafts show.
