// WebGLEngine/ui/seaDepthTint-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~3 s with a browser; section 1 alone ~0.1 s)
//
// Run: node ui/seaDepthTint-selfcheck.mjs
//
// THE DEPTH TINT (the stand-in for a depth composite), HELD TO ITS OWN ARITHMETIC AND TO A REAL DRAW:
//   1  THE TWIN     tintFactor is 0 at and above the level, rises monotonically toward 1, equals 1 - exp(-density*depth), and is the mix weight mixTint uses; the hand-checked values are printed;
//   2  THE DRAW     (needs a browser with WebGL; SKIPPED, and said, without one) a flat red three.js sphere is drawn above the level, 5 m, 20 m and 60 m under it with applyDepthTint on its material: the
//                   centre pixel of each equals the twin's mix of red toward the water colour (within 3 of 255 levels), and the same sphere with no tint stays red at every depth;
//   3  THE LIMIT    the tint reads a FLAT level: a sphere at y = -1 under a crest 2 m high is tinted as if the crest were not there. Printed as the approximation's stated edge, asserted so a later
//                   wave-aware version flips it red on purpose.
// NOT GRADED, said plainly: that it looks like water from below, other material types than MeshBasic (the chunk is injected before the dithering include, which Standard/Phong/Lambert also have), any GPU.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as DT from "./seaDepthTint.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "../tools/ship/playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

console.log("seaDepthTint-selfcheck -- the stand-in for a depth composite\n");
console.log("1. THE TWIN");
{
    ok("!! no tint at or above the level; 1 - exp(-density * depth) below; monotone toward 1", DT.tintFactor(0) === 0 && DT.tintFactor(-3) === 0 && Math.abs(DT.tintFactor(10, 0.1) - (1 - Math.exp(-1))) < 1e-15 && DT.tintFactor(5) < DT.tintFactor(20) && DT.tintFactor(20) < DT.tintFactor(60) && DT.tintFactor(1e6) > 0.999999);
    const m = DT.mixTint([1, 0, 0], [0, 0.5, 1], 10, 0.1), f = 1 - Math.exp(-1);
    ok("  mixTint moves each channel toward the water colour by exactly that weight", Math.abs(m[0] - (1 - f)) < 1e-12 && Math.abs(m[1] - 0.5 * f) < 1e-12 && Math.abs(m[2] - f) < 1e-12);
    ok("  the injected GLSL is the twin's arithmetic: one varying (vSeaY), declared once for each stage, and a chunk that mixes by 1 - exp(-uSeaDensity * depth) with depth = max(0, uSeaLevel - vSeaY)", DT.GLSL_VARYING === "varying float vSeaY;" && /float seaDepth = max\(0\.0, uSeaLevel - vSeaY\)/.test(DT.GLSL_CHUNK) && /1\.0 - exp\(-uSeaDensity \* seaDepth\)/.test(DT.GLSL_CHUNK) && /mix\(gl_FragColor\.rgb, uSeaColor, seaMix\)/.test(DT.GLSL_CHUNK));
    report(DT.reportLines().join(" | "));
}

console.log("\n2. THE DRAW");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: section 1 is arithmetic; only a draw shows the injected shader chunk compiles and does the same arithmetic");
    } else {
        const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript" };
        const server = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split("?")[0]);
            if (u === "/__dt.html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<!doctype html><meta charset=utf-8><body style='margin:0'></body>"); }
            const fp = path.join(ENG, u);
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const base = "http://127.0.0.1:" + server.address().port;
        const br = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await br.newContext()).newPage(); const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.text()); });
            await pg.goto(base + "/__dt.html", { waitUntil: "load" });
            const WATER = 0x0a3b46, DENS = 0.06, depths = [-5, 5, 20, 60];   // negative = above the level
            const r = await pg.evaluate(async ({ WATER, DENS, depths }) => {
                const THREE = await import("/vendor/three/three.module.js"), DT = await import("/ui/seaDepthTint.mjs");
                const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32; document.body.appendChild(cv);
                const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, preserveDrawingBuffer: true });
                const cam = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100); cam.position.set(0, 0, 20); cam.lookAt(0, 0, 0);
                const px = (tint, depth) => {
                    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
                    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); if (tint) DT.applyDepthTint(THREE, mat, { level: 0, density: DENS, color: WATER });
                    const m = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), mat); m.position.set(0, -depth, 0); scene.add(m); cam.position.set(0, -depth, 20);   // world y = -depth; the camera follows so the sphere stays centred
                    renderer.render(scene, cam); const gl = renderer.getContext(), p = new Uint8Array(4); gl.readPixels(16, 16, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return Array.from(p.slice(0, 3));
                };
                return { tinted: depths.map((d) => px(true, d)), plain: depths.map((d) => px(false, d)) };
            }, { WATER, DENS, depths });
            const water = [(WATER >> 16) & 255, (WATER >> 8) & 255, WATER & 255];
            const want = depths.map((d) => DT.mixTint([255, 0, 0], water, d, DENS).map((v) => Math.round(v)));
            const worst = r.tinted.map((p, i) => Math.max(...p.map((v, c) => Math.abs(v - want[i][c]))));
            ok("!! each tinted sphere's centre pixel equals the twin's mix of red toward the water colour (worst difference " + Math.max(...worst) + " of 255, allowed 3)", Math.max(...worst) <= 3, "got " + JSON.stringify(r.tinted) + " want " + JSON.stringify(want));
            ok("!! the same spheres with no tint stay red at every depth, so the change is the tint's and nothing else's", r.plain.every((p) => p[0] > 240 && p[1] < 12 && p[2] < 12), JSON.stringify(r.plain));
            ok("  the sphere above the level is untouched, and the tint grows with depth (red falls, the water's blue-green rises)", r.tinted[0][0] > 240 && r.tinted[1][0] > r.tinted[2][0] && r.tinted[2][0] > r.tinted[3][0] && r.tinted[3][2] > r.tinted[1][2]);
            ok("  no page, console or shader error or warning", errs.length === 0, errs.join(" | ").slice(0, 200));
        } finally { await br.close(); server.close(); }
    }
}

console.log("\n3. THE LIMIT");
{
    // the chunk reads uSeaLevel (a flat number) and the fragment's own world y: no wave field is an input at all
    const src = fs.readFileSync(path.join(ENG, "ui/seaDepthTint.mjs"), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    ok("!! the tint's inputs are a flat level, a density, a colour and the fragment's world y: no surface, wave sample or time is read anywhere in the module (a crest above a hull at y = -1 does not tint it; a wave-aware version must flip this)",
        /uSeaLevel - vSeaY/.test(src) && !/surface|\.sample\(|performance|Date/.test(src));
    report("THE EDGE: near the waterline a hull under a crest is tinted as if the crest were not there. A true depth composite needs the sea's depth target, which the patched sea does not expose.");
}

console.log(`\nseaDepthTint-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
