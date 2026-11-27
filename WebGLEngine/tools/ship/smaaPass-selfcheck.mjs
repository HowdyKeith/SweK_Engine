// WebGLEngine/tools/ship/smaaPass-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/smaaPass-selfcheck.mjs      (under a minute: the lookup data in node, then the pass in headless Chromium's WebGL2)
//
// SMAA, HELD. render/smaaPass.js is PlayCanvas's SMAA 1x as a WebGL2 pass in render/fxaaPass.js's shape; main.js takes it in the anti-aliasing slot. Four things hold it:
//
//   1  THE TABLES      vendor/smaa/smaaLookup.mjs decodes to exactly 160 x 80 x 2 and 64 x 16 bytes with the sha256s recorded when they were vendored; the licence
//                      file names PlayCanvas's MIT licence and SMAA's
//   2  NOTHING TO DO   a flat frame and a frame of soft gradients come out bit for bit unchanged (no edge over the threshold, no pixel touched)
//   3  THE EDGES       hard-edged slanted shapes in FOUR ORIENTATIONS (so a flipped axis would show): against the same shapes supersampled 8 x 8 and averaged (the
//                      true coverage), SMAA's error on the edge pixels is well under the aliased frame's, every orientation -- and the pixels away from any edge
//                      are untouched; FXAA's error is reported beside it
//   4  THE CHAIN       main.js builds the pass, gives it the anti-aliasing slot when the GFX panel's SMAA toggle is on (FXAA otherwise), resizes it with the canvas
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as V from "../../vendor/smaa/smaaLookup.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require = createRequire(import.meta.url), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };

console.log("smaaPass-selfcheck -- SMAA 1x as a WebGL2 pass\n");

console.log("1. THE TABLES");
await section(() => {
    const L = V.smaaLookup(), sha = (b) => crypto.createHash("sha256").update(b).digest("hex"), lic = fs.readFileSync(path.join(ENG, "vendor", "smaa", "LICENSE"), "utf8");
    ok("!! the area table is 160 x 80 x 2 bytes and the search table 64 x 16, each with the sha256 recorded when vendored", L.area.length === 25600 && L.search.length === 1024 && sha(L.area) === V.AREA_SHA256 && sha(L.search) === V.SEARCH_SHA256 && V.AREA_SHA256 === "a365373fbcece6d1589add8d993f3541217fdacbe2cc6ca4beb578cc1dfa9b3b");
    // 2026-11-27 -- LICENSE is PlayCanvas's file from playcanvas@2.24.2 byte for byte, and SMAA's own notice, appended to it at v4933, is carried in PROVENANCE.md.
    const prov = fs.readFileSync(path.join(ENG, "vendor", "smaa", "PROVENANCE.md"), "utf8");
    ok("!! the licence file is PlayCanvas's MIT licence as playcanvas@2.24.2 ships it, and PROVENANCE.md beside it carries SMAA's notice",
        sha(Buffer.from(lic, "utf8")) === "42fa51ddd556be151a29f381fb97ee975825dcc454e805ea3ea9c079cca04d34" && /PlayCanvas Ltd/.test(lic) && /Permission is hereby granted/.test(lic) &&
        /## The SMAA notice/.test(prov) && /Copyright \(C\) 2013 Jorge Jimenez, Jose I\. Echevarria, Belen Masia, Fernando Navarro,\s+Diego Gutierrez -- MIT licence/.test(prov));
});

// the page's own test: draws scenes into the pass's input, runs it to a readable target, reads back; and the same scene at 8 x 8 for the truth
const PAGE = `<!doctype html><html><body><canvas id=c width=128 height=80></canvas><script type="module">
import { SmaaPass } from "/render/smaaPass.js";
import { FxaaPass } from "/render/fxaaPass.js";
const W = 128, H = 80,   // NOT square, so a width taken for a height shows
 gl = document.getElementById("c").getContext("webgl2", { antialias: false });
const prog = (vs, fs) => { const mk = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; }; const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); return p; };
const tri = prog("#version 300 es\\nin vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }", "#version 300 es\\nprecision highp float; uniform vec4 c; out vec4 o; void main(){ o = c; }");
const grad = prog("#version 300 es\\nout vec2 u; void main(){ vec2 q = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); u = q; gl_Position = vec4(q * 2.0 - 1.0, 0.0, 1.0); }", "#version 300 es\\nprecision highp float; in vec2 u; out vec4 o; void main(){ o = vec4(0.3 + 0.2 * u.x, 0.4 + 0.1 * u.y, 0.5, 1.0); }");
const buf = gl.createBuffer(), vao = gl.createVertexArray();
const target = (w, h) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return f; };
const read = (fbo, w, h) => { gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
// a scene: a background and slanted triangles; "o" turns the whole scene by a quarter turn n times, so the edges run in four orientations
function draw(fbo, w, h, scene, o) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, w, h); gl.disable(gl.BLEND);
    if (scene === "grad") { gl.useProgram(grad); gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3); return; }
    gl.clearColor(0.1, 0.12, 0.15, 1); gl.clear(gl.COLOR_BUFFER_BIT); if (scene === "flat") return;
    if (scene === "low") { gl.enable(gl.SCISSOR_TEST); gl.scissor(Math.round(w * 0.3), 0, Math.round(w * 0.4), h); gl.clearColor(0.13, 0.15, 0.18, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.disable(gl.SCISSOR_TEST); return; }   // a boundary of 0.03 a channel: under the threshold
    const T = [[-0.8, -0.7, 0.85, -0.45, -0.6, 0.8, 0.95, 0.85, 0.3, 1], [0.1, -0.9, 0.9, 0.2, 0.3, 0.6, 0.2, 0.9, 0.95, 1], [-0.9, 0.3, -0.2, 0.95, 0.5, 0.35, 1, 0.5, 0.2, 1]];
    gl.useProgram(tri); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const turn = (x, y) => { for (let k = 0; k < o; k++) [x, y] = [-y, x]; return [x, y]; };
    for (const t of T) { const v = []; for (let k = 0; k < 3; k++) v.push(...turn(t[2 * k], t[2 * k + 1])); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STREAM_DRAW); gl.uniform4f(gl.getUniformLocation(tri, "c"), t[6], t[7], t[8], t[9]); gl.drawArrays(gl.TRIANGLES, 0, 3); }
}
const out = target(W, H), big = target(W * 8, H * 8), smaa = new SmaaPass(gl, W, H), fxaa = new FxaaPass(gl, W, H); smaa.enabled = true; fxaa.enabled = true; smaa.outputFBO = out; fxaa.outputFBO = out;
const plain = target(W, H), R = { ok: smaa.ok, fxaaOk: fxaa.ok, scenes: {} };
for (const [scene, o] of [["flat", 0], ["grad", 0], ["low", 0], ["tris", 0], ["tris", 1], ["tris", 2], ["tris", 3]]) {
    draw(plain, W, H, scene, o); const alias = read(plain, W, H);
    draw(smaa.inputFBO, W, H, scene, o); smaa.render(); const s = read(out, W, H);
    draw(fxaa.inputFBO, W, H, scene, o); fxaa.render(); const f = read(out, W, H);
    draw(big, W * 8, H * 8, scene, o); const bp = read(big, W * 8, H * 8), truth = new Float32Array(W * H * 4);
    for (let y = 0; y < H * 8; y++) for (let x = 0; x < W * 8; x++) for (let c = 0; c < 4; c++) truth[((y >> 3) * W + (x >> 3)) * 4 + c] += bp[(y * W * 8 + x) * 4 + c] / 64;
    // edge pixels: where the truth is not one of the solid colours (any partial coverage); far pixels: 3 or more away from every edge pixel
    const edge = new Uint8Array(W * H), err = (img) => { let e = 0, n = 0; for (let p = 0; p < W * H; p++) if (edge[p]) { for (let c = 0; c < 3; c++) e += Math.abs(img[p * 4 + c] - truth[p * 4 + c]); n++; } return n ? e / (n * 3) : 0; };
    for (let p = 0; p < W * H; p++) for (let c = 0; c < 3; c++) if (Math.abs(truth[p * 4 + c] - alias[p * 4 + c]) > 1.5) edge[p] = 1;
    let farChanged = 0, changed = 0, far = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; let near = false; for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) { const q = (y + dy) * W + (x + dx); if (y + dy >= 0 && y + dy < H && x + dx >= 0 && x + dx < W && edge[q]) { near = true; break; } } let d = false; for (let c = 0; c < 4; c++) if (s[p * 4 + c] !== alias[p * 4 + c]) d = true; if (d) changed++; if (!near) { far++; if (d) farChanged++; } }
    R.scenes[scene + o] = { edgePixels: edge.reduce((a, v) => a + v, 0), aliasErr: err(alias), smaaErr: err(s), fxaaErr: err(f), changed, far, farChanged, identical: alias.every((v, i) => v === s[i]) };
}
// THE EDGES OF THE LAST FRAME DO NOT STAY: a hard frame, then a flat one -- the edge target must hold nothing after the flat one (the edge pass discards where it finds none)
draw(smaa.inputFBO, W, H, "tris", 0); smaa.render(); draw(smaa.inputFBO, W, H, "flat", 0); smaa.render();
const ed = read(smaa.edges.fbo, W, H); R.staleEdges = ed.reduce((a, v, i) => a + (i % 4 < 2 && v ? 1 : 0), 0);
window.__smaa = R;
</script></body></html>`;

console.log("2-3. THE PASS (headless Chromium, WebGL2)");
await section(async () => {
    const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
    const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split("?")[0]); if (u === "/__smaa.html") { r.writeHead(200, { "Content-Type": "text/html" }); return r.end(PAGE); } const f = path.join(ENG, u); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
    await new Promise((res) => srv.listen(0, "127.0.0.1", res));
    const { chromium } = resolvePlaywright(require), browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) });
    const p = await browser.newPage(), errors = []; p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if ((m.type() === "warning" || m.type() === "error") && !/GL Driver Message \(OpenGL, Performance/.test(m.text())) errors.push(m.text()); });   // a driver's performance notice (a readPixels stall) is not a fault
    await p.goto(`http://127.0.0.1:${srv.address().port}/__smaa.html`);
    await p.waitForFunction(() => window.__smaa, null, { timeout: 120000 }).catch(() => {});
    const R = await p.evaluate(() => window.__smaa || null); await browser.close(); srv.close();
    ok("!! the three SMAA programs compile and link in WebGL2 and the pass is ready, with no page error or warning", R && R.ok && R.fxaaOk && errors.length === 0, errors.slice(0, 2).join(" | "));
    if (!R || !R.ok) return;
    ok("!! NOTHING TO DO: a flat frame, a frame of soft gradients and a boundary of 3% a channel (under the 0.1 threshold) come out bit for bit unchanged -- and after a hard frame and then a flat one the edge target holds nothing", R.scenes.flat0.identical && R.scenes.grad0.identical && R.scenes.grad0.changed === 0 && R.scenes.low0.identical && R.staleEdges === 0, `stale edge texels ${R.staleEdges}`);
    const T = [0, 1, 2, 3].map((o) => R.scenes["tris" + o]), line = T.map((t, o) => `${o * 90} deg: aliased ${t.aliasErr.toFixed(1)}, SMAA ${t.smaaErr.toFixed(1)}, FXAA ${t.fxaaErr.toFixed(1)} (${t.edgePixels} edge px)`).join("; ");
    ok("!! THE EDGES, IN ALL FOUR ORIENTATIONS: against the 8 x 8 supersampled truth, SMAA's error on the edge pixels is under 70% of the aliased frame's every time (a flipped axis would fail at least one)", T.every((t) => t.edgePixels > 200 && t.smaaErr < 0.7 * t.aliasErr), line);
    ok("!! ...and it touches only the edges: no pixel 3 or more away from every edge pixel changes, while some hundreds near them do", T.every((t) => t.farChanged === 0 && t.far > 1000 && t.changed > 100), T.map((t) => `${t.changed} changed, ${t.farChanged} of ${t.far} far`).join("; "));
});

console.log("4. THE CHAIN (main.js and the GFX panel)");
await section(() => {
    const m = fs.readFileSync(path.join(ENG, "main.js"), "utf8"), g = fs.readFileSync(path.join(ENG, "ui", "graphicsSettings.js"), "utf8");
    ok("!! main.js builds the SMAA pass beside FXAA and resizes it with the canvas", /import \{ SmaaPass \} from "\.\/render\/smaaPass\.js";/.test(m) && /smaaPass = new SmaaPass\(gl, canvas\.width, canvas\.height\);/.test(m) && /if \(smaaPass\) smaaPass\.resize\(canvas\.width, canvas\.height\);/.test(m));
    ok("!! the anti-aliasing slot takes SMAA when its toggle is on, FXAA otherwise, and the chain composites into whichever it is", /smaaPass\.enabled = smaaPass\.ok && gfxSettings\.get\("smaa"\)/.test(m) && /const aaPass = smaaPass && smaaPass\.ok && smaaPass\.enabled \? smaaPass : fxaaPass;/.test(m) && /bloomPass\.outputFBO = aaPass\.inputFBO;/.test(m) && !/bloomPass\.outputFBO = fxaaPass\.inputFBO;/.test(m));
    ok("!! the GFX panel has an SMAA toggle, off by default, said to win over FXAA", /smaa:\s+false/.test(g) && /\["smaa",/.test(g) && /over FXAA|instead of FXAA/.test(g));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 12 mutants, each in a hard-linked copy of the tree. 10 of render/smaaPass.js: 9 RED (the blend's direction flipped, the edge target not cleared, the
// threshold at 0, no search steps, width and height swapped, the tables sampled NEAREST, the two tables swapped, no blend, the blend pass skipped) -- three of them
// (the uncleared target, the zero threshold, the swapped metrics) GREEN at first: the test frame was square, nothing sat just under the threshold, and nothing read
// the edges a hard frame left behind; it is 128 x 80 now, has a 3% boundary that must stay untouched, and reads the edge target after a flat frame. ONE GREEN AND
// EQUIVALENT: the unpack alignment of 1 removed -- both tables' rows are a multiple of 4 bytes (320 and 64), so the default of 4 reads them the same. 2 of main.js:
// ALL 2 RED (the slot always FXAA, the pass not resized).
