// WebGLEngine/tools/ship/subAquariumLit-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subAquariumLit-selfcheck.mjs      (about a minute: sub-aquarium.html on WebGL2 in headless Chromium, four subs served in the bridge's place)
//
// THE AQUARIUM'S TANK LIT BY THE SUBS, HELD (render/subAquarium3d.mjs `lights`; Keith, 2026-11-28: "lets do the aquarium lighting"). sub-aquarium.html ?lights=1 makes the tank
// deep water and gives every sub a searchlight from its bow (render/clusteredLightsThree.mjs: a clustered spot with its own shadow tile); &fog=1 lays the engine's haze under
// the surface. The tank is held still (window.__aquaLit.state.freeze) and one switch is thrown at a time:
//
//   1  IT RUNS         no page error and no GL error; one searchlight a sub (four), each in its own atlas tile, none without room
//   2  THE BOW         each lamp is ahead of its own boat's drawn bow (a lamp inside the hull is its own boat's shadow: the first placement was, found by this gate's probe)
//   3  THE BEAMS       the lamps switched on only brighten, and what they brighten is seen along a ray through a lamp's cone, within its range (19 in 20)
//   4  THE SHADOWS     a light the gate adds straight over a sub, the boats left out of the atlas: only brighter, and inside that light's cone (9 in 10)
//   5  THE HAZE        with &fog=1, switching the lamps changes pixels that it does not change without the haze (the beams in the water) -- and darkens nothing
//   6  WITHOUT         without ?lights the page has no __aquaLit
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, HEADLESS_SHELL, WEBGL_DEFAULT_ARGS } from "./playwrightResolve.mjs";
import { invert4 } from "../../render/gizmo.mjs";

const require = createRequire(import.meta.url), { chromium } = resolvePlaywright(require), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const T4 = (m, v) => [0, 1, 2, 3].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);
const lum = (px, i) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
console.log("subAquariumLit-selfcheck -- the subs' searchlights, their shadows and the water's haze in the aquarium's 3D tank\n");

// the bridge's sub list, four autopilot boats (render/subAquariumSim.mjs takes { id, name, hue })
const SUBS = JSON.stringify({ ok: true, subs: [0, 1, 2, 3].map((k) => ({ id: "s" + k, name: "Sub " + k, hue: k * 90 })) });
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm" };
const srv = http.createServer((q, r) => {
    if (q.url.startsWith("/subaquarium/list")) { r.writeHead(200, { "Content-Type": "application/json" }); return r.end(SUBS); }
    const f = path.join(ENG, decodeURIComponent(q.url.split("?")[0])); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); }
    r.writeHead(404); r.end();
});
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const browser = await chromium.launch({ args: [...WEBGL_DEFAULT_ARGS], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) });
const open = async (q, size = [1200, 900], frames = 30) => {
    const p = await browser.newPage({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 }), errors = [];
    p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (/GL_INVALID|Shader Error|WebGLProgram/.test(m.text())) errors.push(m.text().slice(0, 160)); });
    await p.goto(`http://127.0.0.1:${srv.address().port}/sub-aquarium.html${q}`);
    if (q) await p.waitForFunction((n) => window.__aquaLit && window.__aquaLit.frames > n && window.__aquaLit.lights.length === 4, frames, { timeout: 180000 }); else await p.waitForTimeout(4000);
    return { p, errors };
};
const shot = (p, set) => p.evaluate(async (set) => { const L = window.__aquaLit; Object.assign(L.state, set); const f0 = L.frames; await new Promise((r) => { const t = () => (L.frames >= f0 + 3 ? r() : requestAnimationFrame(t)); t(); }); return { ...(await L.capture()), lights: L.lights, stats: L.stats }; }, set)
    .then((c) => { const raw = Buffer.from(c.b64, "base64"), px = Buffer.alloc(raw.length), row = c.w * 4; for (let y = 0; y < c.h; y++) raw.copy(px, (c.h - 1 - y) * row, y * row, (y + 1) * row); return { ...c, px }; });
const rayOf = (c, inv, x, y) => { const nx = ((x + 0.5) / c.w) * 2 - 1, ny = 1 - ((y + 0.5) / c.h) * 2, f = T4(inv, [nx, ny, 1, 1]), d = [f[0] / f[3] - c.eye[0], f[1] / f[3] - c.eye[1], f[2] / f[3] - c.eye[2]], l = Math.hypot(...d); return d.map((v) => v / l); };
const inCone = (l, q, mg) => { const v = q.map((x, i) => x - l.position[i]), d = Math.hypot(...v), dl = Math.hypot(...l.direction), c = (v[0] * l.direction[0] + v[1] * l.direction[1] + v[2] * l.direction[2]) / (d * dl); return d < l.range && Math.acos(Math.min(1, c)) < l.outerAngle + mg; };
// does the pixel's ray, from the eye down to the tank's floor (y = -50), pass through any of these cones? (2 m steps)
const throughCone = (c, inv, x, y, lights, mg) => { const d = rayOf(c, inv, x, y), far = d[1] < 0 ? (c.eye[1] + 50) / -d[1] : 3000; for (let s = 0; s < far + 2; s += 2) { const q = c.eye.map((e, i) => e + d[i] * s); if (lights.some((l) => inCone(l, q, mg))) return true; } return false; };
const diffs = (a, b) => { const up = [], down = []; for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const k = (y * a.w + x) * 4, d = lum(b.px, k) - lum(a.px, k); if (d > 3) up.push([x, y]); else if (d < -1) down.push([x, y]); } return { up, down }; };

console.log("1. IT RUNS, 2. THE BOW, 3. THE BEAMS, 4. THE SHADOWS");
await section(async () => {
    const { p, errors } = await open("?lights=1");
    const off = await shot(p, { freeze: true, lamps: false }), on = await shot(p, { lamps: true });
    const bows = await p.evaluate(() => { const V = window.__aquaView, out = []; for (const [, m] of V.subs) { m.updateMatrixWorld(true); out.push({ bowX: m.userData.bowX, scale: m.scale.x, pos: m.position.toArray() }); } return out; });
    ok("!! no page error, no GL error; one searchlight a sub, each with its own atlas tile, none without room", errors.length === 0 && on.lights.length === 4 && on.lights.every((l) => l.type === "spot" && l.shadow) && on.stats.faces === 4 && on.stats.unshadowed === 0, `${on.lights.length} lamps; ${JSON.stringify(on.stats)}${errors[0] ? "; " + errors[0] : ""}`);
    const ahead = on.lights.map((l) => Math.min(...bows.map((b) => Math.hypot(...l.position.map((v, i) => v - b.pos[i])) - b.bowX * b.scale)));
    ok("!! EACH LAMP IS AHEAD OF ITS OWN BOW (further from its boat's centre than the drawn hull reaches: a lamp inside the hull lights nothing but its own shadow)", ahead.every((a) => a > 0.2 && a < 3), ahead.map((a) => a.toFixed(2)).join(", "));
    const inv = invert4(on.vp), dd = diffs(off, on), sample = dd.up.filter((_, i) => i % 5 === 0), through = sample.filter(([x, y]) => throughCone(on, inv, x, y, on.lights, 0.05)).length;
    ok("!! THE LAMPS ONLY BRIGHTEN, AND WHAT THEY BRIGHTEN IS SEEN THROUGH A LAMP'S CONE (19 in 20 of a fifth of the pixels, each ray walked from the eye to the floor)", dd.up.length > 1500 && dd.down.length === 0 && through >= 0.95 * sample.length, `${dd.up.length} brighter, ${dd.down.length} darker; ${through} of ${sample.length} through a cone`);
    // a light straight over the first sub, 45 m up: its hull's shadow on the floor
    const b = bows[0], over = { type: "spot", position: [b.pos[0], b.pos[1] + 45, b.pos[2]], direction: [0, -1, 0], range: 120, innerAngle: 0.25, outerAngle: 0.35, color: [1, 1, 1], intensity: 9000, shadow: true, priority: 3 };
    const dark = await shot(p, { lamps: false, extra: [], casters: true }), withC = await shot(p, { extra: [over] }), noC = await shot(p, { casters: false });
    await p.close();
    const sd = diffs(withC, noC), s2 = sd.up.filter((_, i) => i % 3 === 0), inOver = s2.filter(([x, y]) => throughCone(withC, inv, x, y, [over], 0.05)).length;
    // the light falls on the boat itself: the middle of the sub under it (its centre projected, a 5 x 5 block) brightens -- the hulls are lit by the clusters, not only the floor
    const q = T4(withC.vp, [b.pos[0], b.pos[1], b.pos[2], 1]), cx = Math.round((q[0] / q[3] * 0.5 + 0.5) * withC.w), cy = Math.round((0.5 - q[1] / q[3] * 0.5) * withC.h); let lit = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const k = ((cy + dy) * withC.w + cx + dx) * 4; n++; if (lum(withC.px, k) - lum(dark.px, k) > 3) lit++; }
    ok("!! THE LIGHT FALLS ON THE BOAT TOO: the middle of the sub under it brightens (its centre on screen, 5 x 5 pixels, 20 of 25) -- the hulls are lit by the clusters, not only the floor", lit >= 20, `${lit} of ${n} at (${cx}, ${cy})`);
    ok("!! THE BOATS CAST SHADOWS: a light straight over a sub, the boats left out of the atlas -- only brighter, and inside that light's cone (9 in 10)", sd.up.length > 50 && sd.down.length === 0 && inOver >= 0.9 * s2.length, `${sd.up.length} brighter, ${sd.down.length} darker; ${inOver} of ${s2.length} in its cone`);
});

console.log("5. THE HAZE, 6. WITHOUT");
await section(async () => {
    const { p, errors } = await open("?lights=1&fog=1", [900, 680], 8);   // smaller and fewer frames: the haze's 48 steps a pixel are slow on SwiftShader
    const a = await shot(p, { freeze: true, fogOn: false, lamps: false }), b = await shot(p, { lamps: true }), c = await shot(p, { fogOn: true, lamps: false }), d = await shot(p, { lamps: true });
    await p.close();
    let airOnly = 0, darker = 0; for (let k = 0; k < a.px.length; k += 4) { const clear = lum(b.px, k) - lum(a.px, k), hazy = lum(d.px, k) - lum(c.px, k); if (hazy < -1) darker++; if (hazy > 3 && Math.abs(clear) <= 1) airOnly++; }
    ok("!! IN THE HAZE THE BEAMS SHOW: switching the lamps changes pixels it does not change without the haze (the water lit along each beam), and darkens nothing", airOnly > 300 && darker === 0 && errors.length === 0, `${airOnly} change only in the haze; ${darker} darker${errors[0] ? "; " + errors[0] : ""}`);
    const q = await open(""), none = await q.p.evaluate(() => window.__aquaLit === undefined); await q.p.close();
    ok("!! without ?lights the page has no __aquaLit (and its 3D view is as it was)", none && q.errors.length === 0, q.errors[0] || "");
});

await browser.close(); srv.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: (filled in after the sweep)
