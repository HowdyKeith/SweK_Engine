// WebGLEngine/tools/ship/clusteredLightsThree-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/clusteredLightsThree-selfcheck.mjs      (a minute or two: three pages on WebGL2 in headless Chromium)
//
// THE ENGINE'S LIGHTING ON THREE.JS PAGES, HELD (render/clusteredLightsThree.mjs; Keith, 2026-11-28: "lets do 3, 4, 5 and 6", 5 being the three.js pages).
//
//   1  THE SAME PICTURE   lights-three.html (the demo scene drawn by three.js, the clustered chunk patched into its materials, the atlas drawn by three) against
//                         lights-demo.html (the same scene through the raw WebGL2 binding): 999 pixels in 1000 to 2 levels -- lit, shadowed, cookie and all; and with
//                         ?fog=1 (the moon's shafts through the canopy, the spots' beams), the same
//   2  THE GAME PAGE      battleship3d.html ?lights=1: no page error and no GL error (a patched draw that fails says so in the console), its standard materials patched;
//                         a flash added on the water under the screen's middle, the scene held still -- only brighter, and what brightens lies within the flash's range of it;
//                         with &fog=1, the flash's glow in the haze only adds light; without ?lights, no __battleLit
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
console.log("clusteredLightsThree-selfcheck -- the engine's clustered lights, shadow atlas and fog through three.js\n");

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json" };
const srv = http.createServer((q, r) => { const f = path.join(ENG, decodeURIComponent(q.url.split("?")[0])); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const browser = await chromium.launch({ args: [...WEBGL_DEFAULT_ARGS], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) });
const W = 480, H = 320;
const grab = async (file, sv, q) => {
    const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }), errors = [];
    p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (/GL_INVALID|Shader Error|WebGLProgram/.test(m.text())) errors.push(m.text().slice(0, 160)); });
    await p.goto(`http://127.0.0.1:${srv.address().port}/${file}?ease=0&t=3.5&gputimer=0${q}`);
    await p.waitForFunction((v) => window[v] && (window[v].ready || window[v].error), sv, { timeout: 120000 });
    const r = await p.evaluate(async (v) => { const s = window[v]; if (s.error) return { error: s.error }; const c = await s.capture(); return { ...c, error: s.error }; }, sv); await p.close();
    if (r.error) throw new Error(`${file}${q}: ${r.error}`);
    return { ...r, px: Buffer.from(r.b64, "base64"), errors };
};
const parity = (a, b) => { let n = 0, within = 0, worst = 0, sum = 0; for (let i = 0; i < a.px.length; i += 4) { const d = Math.max(...[0, 1, 2].map((k) => Math.abs(a.px[i + k] - b.px[i + k]))); n++; if (d <= 2) within++; worst = Math.max(worst, d); sum += d; } return { n, within, worst, mean: sum / n }; };

console.log("1. THE SAME PICTURE");
await section(async () => {
    for (const [q, what] of [["", "lit, shadowed (a spot, a cube-mapped point light, the moon's three cascades), a cookie"], ["&fog=1", "with the haze: the moon's shafts through the canopy and the spots' beams"]]) {
        const [t, raw] = await Promise.all([grab("lights-three.html", "__lightsThree", q), grab("lights-demo.html", "__lights", q)]);
        const P = parity(t, raw);
        ok(`!! THREE.JS DRAWS WHAT THE RAW WEBGL2 BINDING DRAWS -- ${what}: 999 pixels in 1000 to 2 levels`, t.w === raw.w && P.within >= 0.999 * P.n && P.mean < 0.5 && t.errors.length === 0, `${P.within} of ${P.n}; mean ${P.mean.toFixed(3)}, worst ${P.worst}${t.errors[0] ? "; " + t.errors[0] : ""}`);
    }
});

console.log("2. THE GAME PAGE");
await section(async () => {
    const open = async (q) => {
        const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }), errors = [];
        p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (/GL_INVALID|Shader Error|WebGLProgram/.test(m.text())) errors.push(m.text().slice(0, 160)); });
        await p.goto(`http://127.0.0.1:${srv.address().port}/battleship3d.html${q}`);
        if (q) await p.waitForFunction(() => window.__battleLit && window.__battleLit.frames > 20, null, { timeout: 120000 }); else await p.waitForTimeout(4000);
        return { p, errors };
    };
    const shot = (p, fn) => p.evaluate(async (fn) => { const S = window.__battleLit; new Function("S", fn)(S); const f0 = S.frames; await new Promise((r) => { const t = () => (S.frames >= f0 + 3 ? r() : requestAnimationFrame(t)); t(); }); return S.capture(); }, fn).then((c) => { const raw = Buffer.from(c.b64, "base64"), px = Buffer.alloc(raw.length), row = c.w * 4; for (let y = 0; y < c.h; y++) raw.copy(px, (c.h - 1 - y) * row, y * row, (y + 1) * row); return { ...c, px }; });
    // the water under the screen's middle, from the captured view
    const middle = (c) => { const inv = invert4(c.vp), f = T4(inv, [0, 0, 1, 1]), fp = [f[0] / f[3], f[1] / f[3], f[2] / f[3]], d = fp.map((v, i) => v - c.eye[i]), t = -c.eye[1] / d[1]; return c.eye.map((v, i) => v + d[i] * t); };
    const seaOf = (c, inv, x, y) => { const nx = ((x + 0.5) / c.w) * 2 - 1, ny = 1 - ((y + 0.5) / c.h) * 2, f = T4(inv, [nx, ny, 1, 1]), d = [f[0] / f[3] - c.eye[0], f[1] / f[3] - c.eye[1], f[2] / f[3] - c.eye[2]]; return d[1] < 0 ? c.eye.map((v, i) => v + d[i] * (-c.eye[1] / d[1])) : null; };
    let upClear = 0;
    for (const fog of [false, true]) {
        const { p, errors } = await open(`?lights=1${fog ? "&fog=1" : ""}`);
        const before = await shot(p, "S.freeze = true; S.clearFlashes();"), m = middle(before), RANGE = 22;
        const after = await shot(p, `S.addFlash([${m[0]}, 2, ${m[2]}], [1, 0.62, 0.25], 300, ${RANGE});`);
        const info = await p.evaluate(() => ({ patched: window.__battleLit.patched, n: window.__battleLit.lights.length })); await p.close();
        const inv = invert4(before.vp); let up = 0, down = 0, near = 0, sea = 0;
        for (let y = 0; y < before.h; y++) for (let x = 0; x < before.w; x++) { const k = (y * before.w + x) * 4, d = lum(after.px, k) - lum(before.px, k); if (d < -1) down++; if (d <= 3) continue; up++; const h = seaOf(before, inv, x, y); if (!h) continue; sea++; if (Math.hypot(h[0] - m[0], h[2] - m[2]) < RANGE + 10) near++; }
        if (!fog) ok("!! battleship3d.html ?lights=1: NO PAGE ERROR AND NO GL ERROR, its standard materials patched (a failed patched draw is a GL error)", errors.length === 0 && info.patched > 50, `${info.patched} materials patched${errors[0] ? "; " + errors[0] : ""}`);
        ok(fog ? "!! WITH &fog=1 (the engine's haze in three's FogExp2's place) THE FLASH ALSO GLOWS IN IT: only brighter, more pixels than without the haze, no GL error" : "!! A FLASH ON THE WATER (the scene held still) ONLY BRIGHTENS, AND WHAT IT BRIGHTENS IS WITHIN ITS RANGE OF IT (19 in 20, the water's level met by each ray, 10 units' grace for the seabed under it)",
            up > 2000 && down === 0 && info.n === 1 && errors.length === 0 && (fog ? up > upClear : near >= 0.95 * sea), `${up} brighter${fog ? ` (${upClear} without the haze)` : ""}, ${down} darker; ${near} of ${sea} within range${errors[0] ? "; " + errors[0] : ""}`);
        if (!fog) upClear = up;
    }
    const plain = await open(""), none = await plain.p.evaluate(() => window.__battleLit === undefined); await plain.p.close();
    ok("!! without ?lights the page has no __battleLit (and draws as it always did)", none && plain.errors.length === 0, plain.errors[0] || "");
});

await browser.close(); srv.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: (filled in after the sweep)
