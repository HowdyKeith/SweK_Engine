#!/usr/bin/env node
// WebGLEngine/tools/ship/tslRace-selfcheck.mjs -- v4322
//
// GRADES A RACE PAINTED BY A TSL NODE: the Chaos race's look (render/lyapunovWgsl.mjs LYAPUNOV_LOOK -- the hull's own
// coordinates as r and the seed, the exponent as the shade, lit by the normal) written once as a TSL graph
// (render/physicsTsl.mjs makeLyapunovLookTsl), emitted by three's node builders in WGSL and GLSL, and transplanted by
// render/tslSource.mjs INTO THE FLEET'S OWN SHELL -- the look's vertex stage, its Cam struct, its varyings (local, n,
// color) -- by the semantics three's vertex shader wrote beside each varying (uv, normal, color). The claim is to the
// byte on both backends: the fleets scene with the Chaos fleet's pipeline swapped for the generated one draws the
// hand-written Chaos race on every pixel; the pick is untouched; and the rules refuse by name.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import { varyingSemantics, transplantIntoShell } from "../../render/tslSource.mjs";
import { lyapunovLookShell } from "../../render/physicsTsl.mjs";
import { RACES } from "../../render/fleets.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EMITTED = path.join(ENG, "tools/ship/tsl-emitted-race.json");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const FIX = JSON.parse(fs.readFileSync(path.join(ENG, "tools/ship/tslRace-fixture.json"), "utf8"));
const fill = (t, m) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => m[k] == null ? "" : m[k]);

console.log("\n1. THE SHELL TRANSPLANT ON THE CPU: three's varyings named by what its vertex stage put in them, the shell's names put in their place");
{
    const shell = lyapunovLookShell([{ stride: 40, stepMode: "vertex", attributes: [] }, { stride: 48, stepMode: "instance", attributes: [] }]);
    const em = { wgsl: { vertex: FIX.wgslVertex, fragment: fill(FIX.wgslFragment, {}) }, glsl: { vertex: FIX.glslVertex, fragment: fill(FIX.glslFragment, {}) } };
    ok("varyingSemantics reads `varyings.nodeVaryingN = uv | normal | color` off the WGSL vertex and `nodeVaryingN = ...` off the GLSL one", JSON.stringify(varyingSemantics(em.wgsl.vertex, "wgsl")) === JSON.stringify({ nodeVarying3: "uv", nodeVarying4: "normal", nodeVarying5: "color" }) && JSON.stringify(varyingSemantics(em.glsl.vertex, "glsl")) === JSON.stringify({ nodeVarying3: "uv", nodeVarying4: "normal", nodeVarying5: "color" }));
    const d = transplantIntoShell(em, shell);
    ok("*** the transplanted WGSL is the look's own shell (struct Cam, its vertex stage, VOut) with three's body reading v.local, v.n, v.color and cam.light / cam.chaos ***", d.shaders.wgsl.includes(shell.wgsl.prefix) && /fs\(v: VOut\)/.test(d.shaders.wgsl) && /v\.local\.x/.test(d.shaders.wgsl) && /normalLocal = v\.n;/.test(d.shaders.wgsl) && /v\.color\.x/.test(d.shaders.wgsl) && /cam\.light\.xyz/.test(d.shaders.wgsl) && !/nodeVarying|object\.|output\.color/.test(d.shaders.wgsl) && validateWgsl(d.shaders.wgsl).length === 0, validateWgsl(d.shaders.wgsl).join("; "));
    ok("  the GLSL the same: the look's vertex stage, vLocal / vN / vColor, light and chaos by name", d.shaders.glsl.vertex === shell.glsl.vertex && /vLocal\.x/.test(d.shaders.glsl.fragment) && /normalLocal = vN;/.test(d.shaders.glsl.fragment) && /vColor\.x/.test(d.shaders.glsl.fragment) && /\blight\.xyz/.test(d.shaders.glsl.fragment) && !/nodeVarying|f_light/.test(d.shaders.glsl.fragment));
    ok("  the descriptor carries the shell's uniform list (viewProj, light, chaos) and the fleet's buffers", d.uniforms.map((u) => u.name).join() === "viewProj,light,chaos" && d.buffers.length === 2 && d.shell === "lyapunov look");
    const noNormal = lyapunovLookShell([]); noNormal.wgsl.varyings = { uv: "v.local" }; noNormal.glsl.varyings = { uv: "vLocal" };
    ok("REFUSED: a varying the shell does not carry (the graph reads the normal, the shell passes only uv)", throwsWith(() => transplantIntoShell(em, noNormal), /which the shell "lyapunov look" does not carry/));
    ok("REFUSED: a uniform the shell's struct lacks, and a fragment that samples a texture", throwsWith(() => transplantIntoShell({ wgsl: { vertex: FIX.wgslVertex, fragment: FIX.wgslFragment.replace("light : vec4<f32>,", "light : vec4<f32>,\n\tgain : f32,") }, glsl: em.glsl }, shell), /not in the shell "lyapunov look"'s struct/) && throwsWith(() => transplantIntoShell({ wgsl: { vertex: FIX.wgslVertex, fragment: FIX.wgslFragment.replace("// uniforms", "// uniforms\n@binding( 3 ) @group( 1 ) var tDiffuse : texture_2d<f32>;") }, glsl: em.glsl }, shell), /carries no textures/));
    ok("REFUSED: a uniform whose type differs between the fragment and the shell", throwsWith(() => transplantIntoShell({ wgsl: { vertex: FIX.wgslVertex, fragment: FIX.wgslFragment.replace("light : vec4<f32>,", "light : f32,") }, glsl: em.glsl }, shell), /is f32 in the fragment and vec4 in the shell/));
}

console.log("\n2. ON BOTH BACKENDS: the Chaos race drawn by the generated pipeline is the hand-written Chaos race, to the byte, and the pick still names it");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const CHAOS = RACES.findIndex((x) => x.name === "Chaos");
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 192, CHAOS }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/physicsTsl.mjs"); const S = await import("/render/tslSource.mjs"); const G = await import("/render/gpuDriven.mjs"); const F = await import("/render/fleets.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const em = {};
        for (const mode of ["webgpu", "webgl2"]) { const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64; const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
            const look = P.makeLyapunovLookTsl(THREE, T, {}); renderer.setRenderTarget(new THREE.RenderTarget(64, 64)); em[mode] = await S.emitShaders(renderer, { scene: look.scene, camera: look.camera, mesh: look.scene.children[0] }); }
        const out = { sem: S.varyingSemantics(em.webgpu.vertex, "wgsl"), emitted: { wgsl: em.webgpu, glsl: em.webgl2 } };
        const records = G.gridScene({ side: 6, z: -2, spacing: 1.2, radii: [0.45] }), count = records.length / 4; const fleetOf = Uint32Array.from({ length: count }, (_, i) => (i % 3 === 0 ? a.CHAOS : i % 10));
        const cam = { viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 100), G.lookAt([0, 0, 8], [0, 0, 0])), eye: [0, 0, 8] };
        for (const backend of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N; const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
                const std = F.standardFleets(dev, { clock: () => 0.5 });
                const scH = G.makeGpuDrivenScene(dev, { fleets: std.fleets, fleetOf, thresholds: [0.03], records }); const pixH = (await scH.frame({ ...cam, read: true, clear: [0.05, 0.05, 0.08, 1] }).pixels).pixels;
                const shell = P.lyapunovLookShell(std.fleets[a.CHAOS].pipeline.buffers); const desc = S.transplantIntoShell({ wgsl: em.webgpu, glsl: em.webgl2 }, shell); if (backend === "webgpu") out.transplanted = { wgsl: desc.shaders.wgsl, glsl: desc.shaders.glsl.fragment };
                const std2 = F.standardFleets(dev, { clock: () => 0.5 }); std2.fleets[a.CHAOS] = { ...std2.fleets[a.CHAOS], pipeline: desc };
                const scT = G.makeGpuDrivenScene(dev, { fleets: std2.fleets, fleetOf, thresholds: [0.03], records }); const pixT = (await scT.frame({ ...cam, read: true, clear: [0.05, 0.05, 0.08, 1] }).pixels).pixels;
                let same = 0, worst = 0, lit = 0; for (let i = 0; i < a.N * a.N; i++) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(pixH[i * 4 + c] - pixT[i * 4 + c])); if (d === 0) same++; worst = Math.max(worst, d); if (pixT[i * 4 + 1] > 40) lit++; }
                const pk = await scT.pickPicture(); let chaosHits = 0; for (const h of pk.hits) if (h && h.fleet === a.CHAOS) chaosHits++;
                o.same = same; o.worst = worst; o.lit = lit; o.total = a.N * a.N; o.chaosHits = chaosHits; o.errs = errs; o.backend = dev.backend;
            } catch (e) { o.error = String(e && e.message || e).slice(0, 400); }
            out[backend] = o;
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error, r.ok ? JSON.stringify([r.result.webgpu && r.result.webgpu.error, r.result.webgl2 && r.result.webgl2.error]) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result.webgpu && !r.result.webgpu.error && !r.result.webgl2.error) {
        const R = r.result;
        ok("three's vertex stage carried three varyings and said what each is: uv, normal, color", JSON.stringify(R.sem) === JSON.stringify({ nodeVarying3: "uv", nodeVarying4: "normal", nodeVarying5: "color" }), JSON.stringify(R.sem));
        for (const b of ["webgpu", "webgl2"]) { const o = R[b];
            ok(`*** ${b}: the Chaos race drawn by the pipeline three GENERATED is the hand-written Chaos race on EVERY pixel (${o.same} of ${o.total}, worst 0), lit and among the other races ***`, o.backend === b && o.same === o.total && o.worst === 0 && o.lit > 500 && o.errs.length === 0, `${o.same}/${o.total}, worst ${o.worst}, ${o.lit} lit; errors ${o.errs.length}`);
            ok(`  ${b}: the pick still names the Chaos ships (the pick pipeline is the fleet's own)`, o.chaosHits > 200, `${o.chaosHits} pixels name Chaos`); }
        fs.writeFileSync(EMITTED, JSON.stringify({ at: "v4322", three: "0.178.0", note: "the Lyapunov look as three's node builders emitted it from render/physicsTsl.mjs makeLyapunovLookTsl, and as render/tslSource.mjs transplanted it into the look's own shell; rewritten by tools/ship/tslRace-selfcheck.mjs on every run", ...R.emitted, transplanted: R.transplanted }, null, 1));
        ok("the emitted and transplanted look is written to tools/ship/tsl-emitted-race.json for the WGSL corpus", fs.existsSync(EMITTED));
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4322.
//   A  varyingSemantics() swapping normal and color -> exit=1, 4 red: the fixture's semantics line, both transplant lines, and on
//      the device the GLSL refuses to compile (a vec4 assigned to a vec3) -- a wrong map is a type error before it is a wrong picture.
//   B  the TSL look's shade fixed at 1 (the light dropped) -> exit=1, 3 red: three's vertex stage carries TWO varyings now (uv,
//      color -- the normal is dead and three drops it), and on both backends 36,175 of 36,864 pixels agree: every lit hull pixel
//      differs from the hand-written race, the background and the other races do not.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the page (orrery-gpu.html draws the hand-written Chaos look; swapping in the generated one needs three loaded on the page, 3 MB, " +
    "which no page does yet); the LOOK_KNOBS baked into the TSL Loop where the WGSL reads them at run time (the fleet binds the same numbers, " +
    "so the pictures agree; a page turning the knobs would need a new graph); and a race that is NOT the Lyapunov one -- the shell is written for " +
    "the lit layout's varyings, and a sprite or ink race would need its own.");
process.exit(fails ? 1 : 0);
