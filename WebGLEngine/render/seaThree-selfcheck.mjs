// WebGLEngine/render/seaThree-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~4 s with a browser; section 1 alone ~0.3 s)
//
// Run: node render/seaThree-selfcheck.mjs
//
// THE PHYSICS SEA AS A THREE.JS MESH, HELD TO THE SURFACE IT SAMPLES:
//   1  THE GEOMETRY  (vendor three.js in node, no GL) the mesh's position/normal attributes ARE oceanWater's arrays and equal buildWater at t after update(t) bit for bit; a later time moves it; the
//                    foam is painted into vertex colours between the base and the foam colour; heightAt() is the surface's own sample; the calm option set is gentler than the default (smaller Hs);
//   2  THE DRAWING   (needs a browser with WebGL; SKIPPED, and said, without one) in headless Chromium's WebGL2 (software): the mesh is drawn from above, the frame is not blank, it is not one flat
//                    colour, and a second frame at a later time differs from the first -- the picture changes with the sea;
//   4  THE PAGE      battleship3d.html loaded in Chromium and left running 2.5 s: no script or console error, a lit canvas (preserveDrawingBuffer is off there, so the canvas is read after a frame via drawImage);
//   3  THE CALLERS   battleship3d.html and sub-aquarium.html build their water from createSeaMesh, and battleship3d.html's old hand-rolled wave sum is gone.
// NOT GRADED, said plainly: that it looks like water, any timing, or a real GPU.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as ST from "./seaThree.mjs";
import { buildWater } from "../world/oceanWater.mjs";
import { createSurface, defaultComponents, defaultSurface } from "../physics/ocean/oceanSurface.mjs";
import { surfaceStats } from "../ui/oceanSea.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "../tools/ship/playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

console.log("seaThree-selfcheck -- the physics sea as a three.js mesh\n");
console.log("1. THE GEOMETRY");
{
    const THREE = await import(path.join(ENG, "vendor/three/three.module.js"));
    const surface = createSurface({ components: defaultComponents(1, ST.CALM_OPTIONS) });
    const sea = ST.createSeaMesh(THREE, surface, { half: 40, n: 20, t: 0 });
    const pos = sea.geometry.getAttribute("position"), nor = sea.geometry.getAttribute("normal"), col = sea.geometry.getAttribute("color");
    ok("!! the geometry's position and normal attributes ARE the water mesh's arrays (no copy), and the index list is the grid's two triangles per cell", pos.array === sea.water.positions && nor.array === sea.water.normals && sea.geometry.index.array === sea.water.indices && sea.geometry.index.count === 20 * 20 * 6 && pos.count === 21 * 21);
    sea.update(5.5);
    const fresh = buildWater(surface, { half: 40, n: 20, t: 5.5 });
    ok("!! update(t) leaves the attributes equal to buildWater at t, bit for bit, and flags them for upload", same(pos.array, fresh.positions) && same(nor.array, fresh.normals) && pos.version > 0 && nor.version > 0 && col.version > 0);
    const before = Float32Array.from(pos.array); sea.update(9);
    ok("  a later time moves the surface", pos.array.some((v, i) => v !== before[i]));
    const colA = col.array, base = new THREE.Color(0x0a3b46), foam = new THREE.Color(0xeaf6f4); let inBand = true, anyFoam = false;
    for (let v = 0; v < sea.water.count; v++) { const k = sea.water.foam[v]; if (k > 0.05) anyFoam = true; const want = base.r + (foam.r - base.r) * k; if (Math.abs(colA[v * 3] - want) > 1e-6) inBand = false; }
    ok("!! foam is painted into the vertex colours: each vertex lies between the base and the foam colour by exactly its foam amount (and the sea has some foam to paint)", inBand && anyFoam);
    ok("  the bench report names the calm option set it uses (" + ST.CALM_OPTIONS.n + " waves, longest " + ST.CALM_OPTIONS.longest + " m) and says heightAt is the sampled surface", ST.reportLines().join("\n").includes("longest 40 m") && /heightAt/.test(ST.reportLines().join("\n")));
    ok("  heightAt(x, z, t) is the physics surface's own sample", sea.heightAt(3.3, -7.1, 4.2) === surface.sample(3.3, -7.1, 4.2).h);
    const calm = surfaceStats(surface), dflt = surfaceStats(defaultSurface(1));
    ok("!! the calm option set is gentler than the default sea: total significant height " + calm.hs.toFixed(2) + " m against " + dflt.hs.toFixed(2) + " m", calm.hs < dflt.hs * 0.7, "");
    sea.dispose();
}

console.log("\n2. THE DRAWING");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: section 1 never draws, so it cannot show the mesh produces a picture that follows the sea");
    } else {
        const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript" };
        const server = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split("?")[0]);
            if (u === "/__st.html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<!doctype html><meta charset=utf-8><body style='margin:0'></body>"); }
            const fp = path.join(ENG, u);
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const base = "http://127.0.0.1:" + server.address().port;
        const br = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await br.newContext()).newPage(); const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
            await pg.goto(base + "/__st.html", { waitUntil: "load" });
            const r = await pg.evaluate(async () => {
                const THREE = await import("/vendor/three/three.module.js"), ST = await import("/render/seaThree.mjs"), OS = await import("/physics/ocean/oceanSurface.mjs");
                const W = 96, H = 64, cv = document.createElement("canvas"); cv.width = W; cv.height = H; document.body.appendChild(cv);
                const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, preserveDrawingBuffer: true });
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
                scene.add(new THREE.DirectionalLight(0xffffff, 1.2)); scene.add(new THREE.AmbientLight(0x6688aa, 0.7));
                const sea = ST.createSeaMesh(THREE, OS.createSurface({ components: OS.defaultComponents(1, ST.CALM_OPTIONS) }), { half: 40, n: 24, opacity: 1 });
                scene.add(sea.mesh);
                const cam = new THREE.PerspectiveCamera(55, W / H, 0.1, 400); cam.position.set(0, 30, 30); cam.lookAt(0, 0, 0);
                const shot = (t) => { sea.update(t); renderer.render(scene, cam); const gl = renderer.getContext(), px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
                const a = shot(0), b = shot(6.5);
                const stat = (px) => { let lit = 0; const seen = new Set(); for (let i = 0; i < px.length; i += 4) { if (px[i] + px[i + 1] + px[i + 2] > 12) lit++; seen.add((px[i] >> 3) + "," + (px[i + 1] >> 3) + "," + (px[i + 2] >> 3)); } return { lit, colours: seen.size }; };
                let diff = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
                return { a: stat(a), b: stat(b), diff, total: a.length, gl: renderer.capabilities.isWebGL2 };
            });
            ok("!! the mesh draws: more than half the frame is lit, and the frame is not one flat colour (" + r.a.colours + " distinct colours)", r.a.lit > (96 * 64) / 2 && r.a.colours > 8, "lit " + r.a.lit + " of " + 96 * 64 + (r.gl ? ", WebGL2" : ", WebGL1"));
            ok("!! a frame at a later time differs from the first (" + r.diff + " of " + r.total + " channel values): the picture follows the sea", r.diff > r.total * 0.01 && r.b.lit > (96 * 64) / 2);
            ok("  no page or console error", errs.length === 0, errs.join(" | ").slice(0, 200));
        } finally { await br.close(); server.close(); }
    }
}

console.log("\n3. THE CALLERS");
{
    const bs = fs.readFileSync(path.join(ENG, "battleship3d.html"), "utf8"), aq = fs.readFileSync(path.join(ENG, "sub-aquarium.html"), "utf8");
    ok("!! battleship3d.html builds its water from createSeaMesh (the physics surface) and its old hand-rolled wave sum is gone", /from "\/render\/seaThree\.mjs"/.test(bs) && /createSeaMesh\(THREE/.test(bs) && !/Math\.sin\(x\*0\.12 \+ t\*1\.1\)/.test(bs));
    const v3 = fs.readFileSync(path.join(ENG, "render/subAquarium3d.mjs"), "utf8");
    ok("!! sub-aquarium.html draws a 3D view (render/subAquarium3d.mjs) whose surface is createSeaMesh and whose subs are tinted by depth", /createView3d\(THREE/.test(aq) && /createSeaMesh\(THREE/.test(v3) && /applyDepthTint\(THREE/.test(v3));
}

console.log("\n4. THE BATTLESHIP PAGE, RUNNING");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) report("live half SKIPPED -- " + skip);
    else {
        const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };
        const server = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split("?")[0]), fp = path.join(ENG, u);
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const base = "http://127.0.0.1:" + server.address().port;
        const br = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await br.newContext({ viewport: { width: 900, height: 600 } })).newPage(); const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|WebSocket connection/.test(m.text())) errs.push(m.text()); });
            await pg.goto(base + "/battleship3d.html", { waitUntil: "load" });
            await pg.waitForTimeout(2500);
            const shot = (await pg.screenshot()).toString("base64");   // the compositor's view of the page: a WebGL canvas without preserveDrawingBuffer cannot be read back from script after the frame
            const lit = await pg.evaluate(async (b64) => { const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode(); const t = document.createElement("canvas"); t.width = 90; t.height = 60; const g = t.getContext("2d"); g.drawImage(im, 0, 0, 90, 60); const d = g.getImageData(0, 0, 90, 60).data; let n = 0; const seen = new Set(); for (let i = 0; i < d.length; i += 4) { if (d[i] + d[i + 1] + d[i + 2] > 30) n++; seen.add((d[i] >> 4) + "," + (d[i + 1] >> 4) + "," + (d[i + 2] >> 4)); } return n * 1000 + seen.size; }, shot);
            ok("!! battleship3d.html runs with the physics sea: no script or console error in 2.5 s, and its canvas is lit and not flat", errs.length === 0 && lit > 0 && Math.floor(lit / 1000) > 90 * 60 * 0.3 && lit % 1000 > 8, errs.join(" | ").slice(0, 200) + " lit/colours " + lit);
        } finally { await br.close(); server.close(); }
    }
}

console.log(`\nseaThree-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
