// WebGLEngine/tools/ship/oceanLit-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/oceanLit-selfcheck.mjs      (about a minute: ocean-default.html on WebGL2 in headless Chromium)
//
// THE SEA LIT BY THE ENGINE, HELD (Keith, 2026-11-27: "lets do 1 through 6" -- 1 the sea pages' many lights and fog at sea level). ocean-default.html ?lights=1 shades its
// physics sea and buoys with render/clusteredLights.mjs at dusk -- a low sun with three cascades, a lamp over each buoy, three searchlights sweeping from masts -- and &fog=1 lays
// render/volumetricFog.mjs's sea-level haze over it with the sun's shafts and the searchlights' beams. The sea and the lights are held still (?t=12) and the page's switches
// (window.__ocean.lit) are thrown on ONE frame, so two pictures differ only by the switch:
//
//   1  IT RUNS          lights and fog: no page error; nine lights (the sun, five lamps, three searchlights), six atlas tiles (three cascades, three spots), none without room;
//                       each lamp over a buoy, each searchlight on a mast with its pool near it;
//                       without ?lights the page has no lit state and draws as before
//   2  THE SEARCHLIGHTS switched off and on: what changes is water inside the searchlights' cones (each pixel's ray met with the sea's level, a cone's angle and range)
//   3  THE LAMPS        likewise, within a lamp's range of the pixel's water
//   4  THE SHADOWS      a searchlight a gate adds, aimed past the middle buoy; the buoys left out of the atlas: brighter only beyond the buoy in that cone, darker nowhere
//                       (the low sun's own buoy shadows on dusk water are about a level: the water's albedo is 0.04)
//   5  THE HAZE         without shadows in it: where no water was drawn the pixel is fogCPU's closed form (height fog along the ray to 420 m) over the clear colour, to 2 levels;
//                       over the water, the closed form at the water's distance over the unfogged picture, to 4 levels
//   6  THE BEAMS        switched on: they only add light, and what they light is a ray that passes through a searchlight's cone within its range
//   7  THE SHAFTS       the sun's shadow in the haze only takes light away
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, HEADLESS_SHELL, WEBGL_DEFAULT_ARGS } from "./playwrightResolve.mjs";
import { fogCPU } from "../../render/volumetricFog.mjs";
import { invert4 } from "../../render/gizmo.mjs";

const require = createRequire(import.meta.url), { chromium } = resolvePlaywright(require), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const T4 = (m, v) => [0, 1, 2, 3].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);
const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
const lum = (px, i) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];

console.log("oceanLit-selfcheck -- the engine's lights, shadows and fog on the physics sea (ocean-default.html ?lights=1)\n");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json" };
const srv = http.createServer((q, r) => { const f = path.join(ENG, decodeURIComponent(q.url.split("?")[0])); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const browser = await chromium.launch({ args: [...WEBGL_DEFAULT_ARGS], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) });
const open = async (q) => {
    const p = await browser.newPage({ viewport: { width: 720, height: 560 }, deviceScaleFactor: 1 }), errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`http://127.0.0.1:${srv.address().port}/ocean-default.html?t=12&gputimer=0${q}`);
    await p.waitForFunction(() => window.__ocean && (window.__ocean.frames > 5 || window.__ocean.error), null, { timeout: 120000 });
    return { p, errors };
};
// throw the switches, let three frames pass, capture (rows turned top first)
const shot = (p, set = {}) => p.evaluate(async (set) => {
    const s = window.__ocean; Object.assign(s.lit, set); const f0 = s.frames; await new Promise((res) => { const t = () => (s.frames >= f0 + 3 ? res() : requestAnimationFrame(t)); t(); });
    const c = await s.capture(); return { ...c, vp: s.lit.vp, eye: s.lit.eye, lights: s.lit.lights, fogParams: s.lit.fogParams, stats: s.lit.stats, error: s.error };
}, set).then((c) => { const raw = Buffer.from(c.b64, "base64"), px = Buffer.alloc(raw.length), row = c.w * 4; for (let y = 0; y < c.h; y++) raw.copy(px, (c.h - 1 - y) * row, y * row, (y + 1) * row); return { ...c, px }; });
// the pixel's ray, and where it meets the sea's level (y = 0; the waves are a metre or two either side, hence the margins below)
const rayOf = (r, inv, x, y) => { const nx = ((x + 0.5) / r.w) * 2 - 1, ny = 1 - ((y + 0.5) / r.h) * 2, f = T4(inv, [nx, ny, 1, 1]); return norm([f[0] / f[3] - r.eye[0], f[1] / f[3] - r.eye[1], f[2] / f[3] - r.eye[2]]); };
const seaHit = (r, d) => (d[1] < -1e-4 ? r.eye.map((e, i) => e + d[i] * (-r.eye[1] / d[1])) : null);
const inCone = (l, p, margin) => { const v = [0, 1, 2].map((i) => p[i] - l.position[i]), dist = Math.hypot(...v), c = (v[0] * l.direction[0] + v[1] * l.direction[1] + v[2] * l.direction[2]) / (dist * Math.hypot(...l.direction)); return dist < l.range && Math.acos(Math.min(1, c)) < l.outerAngle + margin; };
const diffs = (a, b, thr) => { const out = []; for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const k = (y * a.w + x) * 4, d = lum(b.px, k) - lum(a.px, k); if (Math.abs(d) > thr) out.push({ x, y, d }); } return out; };

let L0 = null;
console.log("1. IT RUNS");
await section(async () => {
    const { p, errors } = await open("&lights=1&fog=1");
    const r = await shot(p, {}); L0 = r; await p.close();
    const kinds = r.lights.reduce((m, l) => ({ ...m, [l.type]: (m[l.type] || 0) + 1 }), {});
    ok("!! lights and fog: no page error; the sun, five lamps and three searchlights; three cascades and three spot tiles in the atlas, none left without room, no cell over its cap", errors.length === 0 && !r.error && kinds.directional === 1 && kinds.point === 5 && kinds.spot === 3 && r.stats.faces === 6 && r.stats.cascades === 3 && r.stats.unshadowed === 0 && r.stats.overflow === 0, `${JSON.stringify(kinds)}; ${JSON.stringify(r.stats)}${errors[0] ? "; " + errors[0] : ""}`);
    // where the lights are: each lamp about 3 m over a buoy; each searchlight's axis meets the water near its mast (it lights the sea round its buoy, not the horizon)
    const BUOYS = [[0, 0], [22, -14], [-30, 18], [45, 40], [-55, -38]], lampsOk = r.lights.filter((l) => l.type === "point").every((l) => BUOYS.some(([x, z]) => Math.hypot(l.position[0] - x, l.position[2] - z) < 2) && l.position[1] > 1.5 && l.position[1] < 5.5);
    const spotsOk = r.lights.filter((l) => l.type === "spot").every((l) => { const d = norm(l.direction), t = -l.position[1] / d[1], h = [l.position[0] + d[0] * t, l.position[2] + d[2] * t]; return d[1] < 0 && t > 0 && Math.hypot(h[0] - l.position[0], h[1] - l.position[2]) < 25 && BUOYS.some(([x, z]) => Math.hypot(l.position[0] - x, l.position[2] - z) < 2); });
    ok("!! THE LIGHTS ARE WHERE THE PAGE SAYS: each lamp 1.5 to 5.5 m over a buoy; each searchlight on a buoy's mast, its axis meeting the water within 25 m of it", lampsOk && spotsOk, JSON.stringify(r.lights.filter((l) => l.type !== "directional").map((l) => l.position.map((v) => +v.toFixed(1)))));
    const q = await open(""), plain = await q.p.evaluate(() => ({ lit: window.__ocean.lit, capture: typeof window.__ocean.capture, frames: window.__ocean.frames, error: window.__ocean.error })); await q.p.close();
    ok("!! without ?lights the page has no lit state and no capture, and runs as it did", plain.lit === undefined && plain.capture === "undefined" && plain.frames > 5 && !plain.error && q.errors.length === 0, JSON.stringify(plain));
});

console.log("2. THE SEARCHLIGHTS, 3. THE LAMPS, 4. THE SHADOWS");
await section(async () => {
    const { p, errors } = await open("&lights=1");
    const on = await shot(p, {}), noSearch = await shot(p, { searchlights: false }), noLamps = await shot(p, { searchlights: true, lamps: false });
    const inv = invert4(on.vp), spots = on.lights.filter((l) => l.type === "spot"), lamps = on.lights.filter((l) => l.type === "point");
    const where = (list, test) => { let inside = 0, sea = 0; for (const c of list) { const h = seaHit(on, rayOf(on, inv, c.x, c.y)); if (!h) continue; sea++; if (test(h)) inside++; } return { inside, sea }; };
    const sd = diffs(noSearch, on, 3), sw = where(sd, (h) => spots.some((l) => inCone(l, h, 0.12)));
    ok("!! THE SEARCHLIGHTS LIGHT THE WATER IN THEIR CONES: switched on, the pixels brighter by over 3 levels are water inside a cone (to 0.12 rad, the waves' height) -- 19 in 20 of them", sd.length > 300 && sw.inside >= 0.95 * sw.sea && sd.every((c) => c.d > 0) && errors.length === 0, `${sd.length} changed, ${sw.inside} of ${sw.sea} in a cone, ${sd.filter((c) => c.d < 0).length} darker`);
    const ld = diffs(noLamps, on, 3), lw = where(ld, (h) => lamps.some((l) => Math.hypot(h[0] - l.position[0], h[2] - l.position[2]) < l.range + 2));
    ok("!! THE LAMPS LIGHT THE WATER WITHIN THEIR RANGE: the pixels they change are water within a lamp's range (and 2 m) -- 19 in 20", ld.length > 30 && lw.inside >= 0.95 * lw.sea && ld.every((c) => c.d > 0), `${ld.length} changed, ${lw.inside} of ${lw.sea} in range`);
    // the sun's diffuse light on dusk water (albedo 0.04) is about a level, and so are the buoys' sun shadows; a bright pool shows a shadow: one more searchlight, 8 m up and
    // 10 m off the middle buoy, aimed past it at the water beyond -- the buoy stands in its cone
    const wc = await shot(p, { lamps: true, casters: true, extra: [{ type: "spot", position: [-20, 4, 0], direction: [1, -0.133, 0], range: 60, innerAngle: 0.2, outerAngle: 0.3, color: [1, 1, 1], intensity: 900, shadow: true, priority: 3 }] });
    const nc = await shot(p, { casters: false });
    await p.close();
    const cd = diffs(wc, nc, 1), brighter = cd.filter((c) => c.d > 3), darker = cd.filter((c) => c.d < -1).length, extra = wc.lights[wc.lights.length - 1];
    // beyond the buoy in that cone, or on a buoy itself (its own faces shade each other; the ray's water point within 4 m of a buoy, the buoy standing above it)
    const onBuoy = (h) => [[0, 0], [22, -14], [-30, 18], [45, 40], [-55, -38]].some(([bx, bz]) => Math.hypot(h[0] - bx, h[2] - bz) < 4);
    const behind = brighter.filter((c) => { const h = seaHit(wc, rayOf(wc, inv, c.x, c.y)); return h && ((h[0] > 0 && inCone(extra, h, 0.12)) || onBuoy(h)); }).length;
    ok("!! THE BUOYS CAST SHADOWS: a searchlight aimed past the middle buoy, the buoys left out of the atlas -- brighter (over 3 levels) where the water lay beyond the buoy in that cone or on a buoy (9 in 10: the waves stand off the flat level the rays are met at), darker nowhere (over 1)", brighter.length > 30 && behind >= 0.9 * brighter.length && darker === 0, `${brighter.length} brighter (${behind} beyond the buoy in the cone, or on a buoy), ${darker} darker`);
});

console.log("5. THE HAZE, 6. THE BEAMS, 7. THE SHAFTS");
await section(async () => {
    const { p, errors } = await open("&lights=1&fog=1");
    const clearPic = await shot(p, { fogOn: false }), flat = await shot(p, { fogOn: true, shaftsOn: false }), flatDark = await shot(p, { searchlights: false }), shafts = await shot(p, { searchlights: true, shaftsOn: true, beamsOn: false }), beams = await shot(p, { beamsOn: true }); await p.close();
    const inv = invert4(flat.vp), P = flat.fogParams, clear = [0.05, 0.06, 0.1], spots = flat.lights.filter((l) => l.type === "spot");
    // where no water was drawn: the ray rises, or meets the sea's level beyond the 300 m square (a band either side of its edge left out)
    let sky = 0, match = 0, worst = 0;
    for (let y = 0; y < flat.h; y += 2) for (let x = 0; x < flat.w; x += 2) {
        const d = rayOf(flat, inv, x, y), h = seaHit(flat, d); if (h && Math.max(Math.abs(h[0]), Math.abs(h[2])) < 175) continue; if (!h && d[1] < 0.01) continue;
        const want = fogCPU(P, { origin: flat.eye, dir: d, distance: 1e9, color: clear, px: x, py: flat.h - 1 - y }).map((v) => Math.min(255, Math.max(0, v * 255))), k = (y * flat.w + x) * 4;
        const e = Math.max(...[0, 1, 2].map((i) => Math.abs(flat.px[k + i] - want[i]))); sky++; if (e <= 2) match++; worst = Math.max(worst, e);
    }
    // and over the water: the haze at the water's distance (the ray met with the sea's level; the waves a metre or two off it) on the clear picture's pixel
    let wn = 0, wok = 0;
    for (let y = 1; y < flat.h; y += 3) for (let x = 1; x < flat.w; x += 3) {
        const d = rayOf(flat, inv, x, y), h = seaHit(flat, d); if (!h || Math.max(Math.abs(h[0]), Math.abs(h[2])) > 140) continue;
        const k = (y * flat.w + x) * 4, want = fogCPU(P, { origin: flat.eye, dir: d, distance: Math.hypot(...h.map((v, i) => v - flat.eye[i])), color: [0, 1, 2].map((i) => clearPic.px[k + i] / 255), px: x, py: flat.h - 1 - y }).map((v) => v * 255);
        wn++; if (Math.max(...[0, 1, 2].map((i) => Math.abs(flat.px[k + i] - want[i]))) <= 4) wok++;
    }
    ok("!! OVER THE WATER TOO: the haze without shadows is the closed form at the water's distance over the unfogged picture, 9 in 10 pixels to 4 levels (the waves stand off the level)", wn > 2000 && wok >= 0.9 * wn, `${wok} of ${wn}`);
    // the haze without shadows knows nothing of the lights: switching the searchlights changes only the water in their pools (seen through the haze), never the air
    const fd = diffs(flatDark, flat, 3), fw = (() => { let inside = 0, sea = 0; for (const c of fd) { const h = seaHit(flat, rayOf(flat, inv, c.x, c.y)); if (!h) continue; sea++; if (flat.lights.filter((l) => l.type === "spot").some((l) => inCone(l, h, 0.12))) inside++; } return { inside, sea }; })();
    ok("!! AND IT KNOWS NOTHING OF THE LIGHTS: with it, switching the searchlights changes only water inside their cones (19 in 20 pixels), no beam in the air", fd.length > 100 && fw.inside >= 0.95 * fw.sea, `${fd.length} changed, ${fw.inside} of ${fw.sea} in a cone`);
    ok("!! THE SEA-LEVEL HAZE IS THE CLOSED FORM: where no water was drawn, the pixel is fogCPU's height fog over 420 m on the clear colour, to 2 levels (97 in 100, a 2-pixel lattice)", sky > 500 && match >= 0.97 * sky && errors.length === 0, `${match} of ${sky}; worst ${worst.toFixed(1)}${errors[0] ? "; " + errors[0] : ""}`);
    const bd = diffs(shafts, beams, 3), along = (c) => { const d = rayOf(beams, inv, c.x, c.y), h = seaHit(beams, d), far = h ? Math.hypot(...h.map((v, i) => v - beams.eye[i])) : P.maxDistance; for (let s = 0.5; s < far; s += 0.5) { const q = beams.eye.map((e, i) => e + d[i] * s); if (spots.some((l) => inCone(l, q, 0.03))) return true; } return false; };
    const sample = bd.filter((_, i) => i % 7 === 0), through = sample.filter(along).length;
    ok("!! THE SEARCHLIGHTS' BEAMS ONLY ADD LIGHT, AND WHAT THEY LIGHT IS A RAY THROUGH A CONE: switched on, nothing darker; of the pixels brighter by over 3 levels, 19 in 20 rays pass through a searchlight's cone within its range", bd.length > 200 && bd.every((c) => c.d > 0) && through >= 0.95 * sample.length, `${bd.length} brighter, ${bd.filter((c) => c.d < 0).length} darker; ${through} of ${sample.length} sampled rays through a cone`);
    const sd = diffs(flat, shafts, 1), darker = sd.filter((c) => c.d < -1).length, brighter = sd.filter((c) => c.d > 1).length;
    ok("!! THE SUN'S SHADOW IN THE HAZE ONLY TAKES LIGHT AWAY", brighter === 0, `${darker} darker by over a level, ${brighter} brighter`);
});

await browser.close(); srv.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG (2026-11-27): 10 mutants of ocean-default.html, each in a hard-linked copy of the tree. ALL 10 RED -- the searchlights not added, no casters in the atlas,
// the lighting bound before the atlas was drawn, the haze from the wrong eye or the wrong depth range, the beams switch ignored, the clustered light left out of the water;
// and, after three were GREEN at first: the lamps 30 m off their buoys and the searchlights aimed level (the gate read the lights' places from the page itself, so a light
// put in the wrong place was consistent with itself -- now each lamp must hang over a buoy and each pool lie near its mast), and the plain haze given the lighting (the beams
// were 0.3% of the water, inside a 9-in-10 bar -- now switching the searchlights under the plain haze may change only the water in their pools). BEFORE THE SABOTAGE the gate
// found the buoys' sun shadows on dusk water worth about a level (albedo 0.04), so the shadows are held under a searchlight aimed past a buoy.
