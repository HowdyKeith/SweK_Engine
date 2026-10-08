#!/usr/bin/env node
// WebGLEngine/render/threeWorkarounds-selfcheck.mjs -- v4809
// Run: node render/threeWorkarounds-selfcheck.mjs   (~2.2s -- MEASURED v4809, both backends)
//
// render/threeWorkarounds.mjs, held on BOTH of three's backends to the frame drawn right -- and three's own behaviour without it,
// held beside it, so that when three takes the patches (docs/upstream-three/dev/17 and 18) the rows that say "three's" go red and
// say the workaround may go. A striped wall, a plain MeshPhysicalMaterial lens with transmission in front of it, the wall moved a
// quarter between renders: of eight pixels in a row through the lens, how many changed -- and every pixel against the same frame
// drawn by a fresh scene into a fresh target, which three draws right.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { refreshEveryRender, REFRESH_MARK } from "./threeWorkarounds.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };

console.log("\n1. HEADLESS: the mark");
{
    const made = [], THREE = { TSL: { float: (v) => { const n = { isNode: true, value: v }; made.push(n); return n; } } }, m = { needsUpdate: false };
    const first = refreshEveryRender(THREE, m), again = (m.needsUpdate = false, refreshEveryRender(THREE, m));
    ok(`refreshEveryRender puts a node in ${REFRESH_MARK} and rebuilds the material once; a second call does nothing`,
        first === true && again === false && m[REFRESH_MARK] === made[0] && made.length === 1 && m.needsUpdate === false && refreshEveryRender(THREE, null) === false);
}

console.log("\n2. ON THE DEVICE: three's two behaviours, and the frames the workarounds draw");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: {}, script: `async () => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"), WK = await import("/render/threeWorkarounds.mjs"), out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
            const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL: mode === "webgl2" }); await renderer.init();
            const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50); camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
            const stripes = new THREE.DataTexture(Uint8Array.from({ length: 64 }, (_, i) => (i % 8 < 4 ? 255 : 40)), 16, 1, THREE.RGBAFormat);
            stripes.magFilter = THREE.NearestFilter; stripes.needsUpdate = true;
            const make = (mark) => { const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ map: stripes }));
                const lens = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0, ior: 1.5, thickness: 0.4 }));
                if (mark) WK.refreshEveryRender(THREE, lens.material);
                lens.position.z = 0.5; const scene = new THREE.Scene(); scene.add(wall, lens, new THREE.AmbientLight(0xffffff, 1)); return { wall, lens, scene }; };
            const D = 64, target = () => new THREE.RenderTarget(D, D);
            const draw = async (s, x, rt, read) => { s.wall.position.x = x; s.wall.updateMatrixWorld(); renderer.setRenderTarget(rt); await renderer.renderAsync(s.scene, camera);
                return Array.from(await read(rt)); };
            const plain = (rt) => renderer.readRenderTargetPixelsAsync(rt, 0, 0, D, D), helper = (rt) => WK.readTargetPixels(THREE, renderer, rt, 0, 0, D, D);
            const lens = (px) => Array.from({ length: 8 }, (_, i) => px[(32 * D + 28 + i) * 4]);
            const moved = (a, b) => lens(a).reduce((n, v, i) => n + (v !== lens(b)[i] ? 1 : 0), 0), diff = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);
            const fresh = async (x) => draw(make(false), x, target(), helper);
            const o = {};
            // issue 17: two renders into two targets, the wall moved between
            { const s = make(false); const a = await draw(s, 0, target(), helper), b = await draw(s, 0.25, target(), helper); o.i17plain = { lensMoved: moved(a, b), off: diff(b, await fresh(0.25)) }; }
            { const s = make(true); const a = await draw(s, 0, target(), helper), b = await draw(s, 0.25, target(), helper); o.i17marked = { lensMoved: moved(a, b), off: diff(b, await fresh(0.25)) }; }
            // ...marked after its first render, as the layer marks a scene it meets late
            { const s = make(false); const a = await draw(s, 0, target(), helper); WK.refreshEveryRender(THREE, s.lens.material); const b = await draw(s, 0.25, target(), helper); o.i17late = { off: diff(b, await fresh(0.25)) }; }
            // ...and the mark draws the same bytes as no mark
            o.markSame = diff(await draw(make(true), 0, target(), helper), await draw(make(false), 0, target(), helper));
            // issue 18: one target, read back between the renders -- plainly, and through readTargetPixels
            { const s = make(true), t = target(); const a = await draw(s, 0, t, plain), b = await draw(s, 0.25, t, plain); o.i18plain = { lensMoved: moved(a, b), off: diff(b, await fresh(0.25)) }; }
            { const s = make(true), t = target(); const a = await draw(s, 0, t, helper), b = await draw(s, 0.25, t, helper); o.i18helper = { lensMoved: moved(a, b), off: diff(b, await fresh(0.25)) }; }
            // readTargetPixels leaves the render target bound that was bound before it
            { const t = target(), u = target(); await draw(make(true), 0, t, helper); renderer.setRenderTarget(u); await WK.readTargetPixels(THREE, renderer, t, 0, 0, D, D); o.keepsTarget = renderer.getRenderTarget() === u; renderer.setRenderTarget(null); }
            renderer.dispose(); out[mode] = o;
        }
        return out; }` });
    if (!r.ok) ok("the page ran", false, r.reason || (r.pageErrors || []).join("; "));
    else for (const [mode, o] of Object.entries(r.result)) {
        ok(`  [${mode}] THREE'S OWN, issue 17: a plain transmission lens drawn into a second target shows the first's backdrop -- lensMoved ${o.i17plain.lensMoved}, ${o.i17plain.off} channel values off`,
            o.i17plain.lensMoved === 0 && o.i17plain.off > 0, "r186's #34162; when three takes patch 17 this row goes red, and refreshEveryRender may go");
        ok(`*** [${mode}] refreshEveryRender: the same lens marked is the frame drawn right -- lensMoved ${o.i17marked.lensMoved}, ${o.i17marked.off} off; marked after its first render, ${o.i17late.off} off; and the mark draws the same bytes as none, ${o.markSame} off ***`,
            o.i17marked.lensMoved > 0 && o.i17marked.off === 0 && o.i17late.off === 0 && o.markSame === 0);
        if (mode === "webgl2") ok(`  [${mode}] THREE'S OWN, issue 18: read back between two renders into one target, the lens keeps the first render's backdrop -- lensMoved ${o.i18plain.lensMoved}, ${o.i18plain.off} off`,
            o.i18plain.lensMoved === 0 && o.i18plain.off > 0, "WebGLState's skipped framebuffer bind, r185 and since; when three takes patch 18 this row goes red, and the scratch render in readTargetPixels may go");
        else ok(`  [${mode}] ...and WebGPU has no issue 18: read back plainly between the renders, the lens is right -- ${o.i18plain.off} off`, o.i18plain.off === 0);
        ok(`*** [${mode}] readTargetPixels: read back between the renders, the lens is the frame drawn right -- lensMoved ${o.i18helper.lensMoved}, ${o.i18helper.off} off -- and the render target bound before it is bound after ***`,
            o.i18helper.lensMoved > 0 && o.i18helper.off === 0 && o.keepsTarget === true);
    }
}

// ---- v4809 SABOTAGE LOG ----------------------------------------------------------------------------------------
// W1 the mark without needsUpdate -> 2 (marked after its first render, 3072 off, both backends); W2 the mark a number, not a node -> 3
// (the headless row; lensMoved 0 marked, both backends); W3 readTargetPixels without its scratch render -> 1 (webgl2, lensMoved 0);
// W4 the target bound before not bound again -> 1. And against render/translucentLayer.mjs in fx/fsr/fsrFrameGenBackdrop-selfcheck.mjs:
// W5 the layer marking nothing -> 6 (the late rebuild, the midpoint, the worst arm, on both backends); W6 that gate reading back
// plainly -> 1 (webgl2's midpoint 9.09 and 8.16 dB, where it is exact). None green.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a lens that is a node material already (three refreshes those fully, mark or none); multisampled targets, " +
    "whose WebGL copy blits rather than copyTexSubImage2D; and a real GPU.");
process.exitCode = fails ? 1 : 0;
