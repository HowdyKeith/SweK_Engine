#!/usr/bin/env node
// WebGLEngine/tools/ship/tslWide-selfcheck.mjs -- v4483
//
// GRADES THE WIDENED TRANSPLANT (docs/TSL-ROADMAP.md step 4, v4483): render/tslSource.mjs transplantIntoShell carrying
// COMPUTED varyings (an expression three writes in its vertex stage, not a bare attribute copy), a FLAT one (an integer
// band with @interpolate(flat) / `flat out`), and the CAMERA's projection matrix read in the fragment, into a host shell
// that says where they land ({{VARYINGS}}, {{ASSIGN}}, `matrices`); and computeShell folding a TSL uniformArray INTO the
// uniform struct, at the offset packCullUniforms gives struct Cull's planes, instead of a second binding. The consumers
// are render/tslWide.mjs: the quad shell with its hand-written twin, and the planes pass with its CPU twin.
//
// THE CLAIMS ARE TO THE BYTE ON BOTH BACKENDS, AND ONE OF THEM IS INDEPENDENT OF THE SHELL: the generated quad equals the
// hand-written one on every pixel (which a shell mistake cannot see -- both halves share the shell, as tslRace's sabotage N
// showed), AND at pixel centres it equals render/tslWide.mjs quadColourAt, a CPU function that never saw the shell, to
// the rounding of a byte. The planes pass equals its f32 CPU twin bit for bit.
//
// *** THE FINDING, MEASURED AND REPORTED RATHER THAN HELD AWAY: A FLAT VARYING WHOSE VERTICES DISAGREE IS BACKEND-
// DEPENDENT. *** WebGPU takes a triangle's FIRST vertex for a flat varying, OpenGL ES its LAST. The graph's band is
// computed from the cell's centre, so every vertex of a cell agrees and the two backends draw the same picture (0 pixels
// apart); the same graph with a per-vertex band draws two different pictures (8,704 of 16,384 pixels apart at v4483),
// each byte-exact against its own twin. Slug's glyph word is cell-constant, so this is a rule for the graph author, not
// a limit on the transplant -- and the rule is written where the graph is.
//
// *** AND WHAT THE FIRST DRAFT GOT WRONG, WHICH IS WHY THE BLOCK IS TAKEN BY DEPENDENCY. *** three writes a temporary
// (nodeVar0 = uv * object.scale) right before the statement that first reads it, and that can be BEFORE the displacement's
// own positionLocal = position. A window from the first varying assignment shipped `o.vScaled = nodeVar0` with nodeVar0
// never written: 0 of 16,384 pixels agreed on WebGPU, while WebGL2 agreed on all of them -- with the hand twin, because
// the shell's attributes had no NAMES and the GL path bound nothing, so both halves drew the same wrong picture. The CPU
// twin is what caught the second; the dependency closure is what fixed the first.
//
// SABOTAGE (v4483): A  the transplant's @interpolate(flat) dropped from the generated VOut        -> exit=1, red: the fixture line, and on both backends the generated
//                                                                                                   picture parts from the hand twin (WebGPU refuses an i32 varying without flat; WebGL2 interpolates it)
//                   B  the closure taking only the varying assignments (the temporary it reads dropped) -> exit=1, red: the fixture line, 0 of 16,384 on WebGPU
//                   C  quadColourAt's band offset +4 written +3                                    -> exit=1, red: the CPU-twin rows on both backends, the shell rows untouched
//                      (a first C, the band from the vertex's x instead of the cell centre's, went 0 red: two cells per band, edges aligned, so the
//                       two formulas agree at every pixel -- an equivalent spelling, not a blind check; recorded so nobody re-tries it)
//                   D  computeShell's member array no longer folded into the struct                -> exit=1, 3 red: the planes row and the refusal row in section 1 (refused by name, no throw), and the harness
//
// Run: node tools/ship/tslWide-selfcheck.mjs      (~20 s; section 1 is CPU-only)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import { varyingDecls, vertexVaryingBlock, vertexDisplacement, transplantIntoShell, transplantCompute, computeShell } from "../../render/tslSource.mjs";
import { quadShell, quadHand, quadColourAt, PLANES_UNIFORMS, QUAD_KNOBS } from "../../render/tslWide.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EMITTED = path.join(ENG, "tools/ship/tsl-emitted-wide.json");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const FIX = JSON.parse(fs.readFileSync(path.join(ENG, "tools/ship/tslWide-fixture.json"), "utf8"));
const EM = { wgsl: { vertex: FIX.wgslVertex, fragment: FIX.wgslFragment }, glsl: { vertex: FIX.glslVertex, fragment: FIX.glslFragment } };

console.log("\n1. ON THE CPU: three's computed, flat and camera-reading shader, read and transplanted into the quad shell");
{
    const dW = varyingDecls(EM.wgsl.vertex, "wgsl"), dG = varyingDecls(EM.glsl.vertex, "glsl");
    ok("varyingDecls reads the three named varyings with their types, the band FLAT, in both languages",
        dW.vScaled && dW.vScaled.type === "vec2<f32>" && dW.vLin && dW.vLin.type === "f32" && dW.vBand && dW.vBand.type === "i32" && dW.vBand.flat === true && dW.vScaled.flat === false
        && dG.vScaled && dG.vScaled.type === "vec2" && dG.vBand && dG.vBand.type === "int" && dG.vBand.flat === true, JSON.stringify(dW));
    const bW = vertexVaryingBlock(EM.wgsl.vertex, "wgsl"), bG = vertexVaryingBlock(EM.glsl.vertex, "glsl");
    ok("vertexVaryingBlock takes the three assignments AND the temporary three wrote before positionLocal = position (by dependency, not position)",
        bW && bW.computed.map((c) => c.name).join() === "vScaled,vLin,vBand" && bW.statements.length === 4 && /^nodeVar0 = /.test(bW.statements[0]) && bW.decls.length === 1
        && bG && bG.statements.length === 4 && /^nodeVar0 = /.test(bG.statements[0]), bW ? bW.statements.map((s) => s.slice(0, 28)).join(" | ") : "null");
    ok("  it names what the block reads (uv and positionLocal) and the labelled uniform (scale), and no matrix", bW.reads.join() === "uv,positionLocal" && bW.uniforms.join() === "scale" && bW.matrices.length === 0, `reads ${bW.reads.join()}, uniforms ${bW.uniforms.join()}`);
    ok("  and vertexDisplacement finds NO displacement here (the named varyings are not swallowed into one)", vertexDisplacement(EM.wgsl.vertex, "wgsl") === null && vertexDisplacement(EM.glsl.vertex, "glsl") === null);
    const d = transplantIntoShell(EM, quadShell());
    const W = d.shaders.wgsl, G = d.shaders.glsl;
    ok("*** WGSL: the shell's VOut grows the three varyings from location 1, the band @interpolate(flat) i32; the vertex stage takes the block after its own o.uv, the temp declared; the fragment reads v.vBand and cam.proj ***",
        /@location\(1\) vScaled: vec2<f32>, @location\(2\) vLin: f32, @location\(3\) @interpolate\(flat\) vBand: i32 \};/.test(W)
        && /o\.uv = uv;\s*var nodeVar0 : vec2<f32>;\s*nodeVar0 = \( uv \* cam\.scale \);\s*o\.vScaled = nodeVar0;\s*o\.vLin = \( \( \( pl\.x \* 0\.3 \)/.test(W)
        && /f32\( \( v\.vBand \+ 4 \) \)/.test(W) && /cam\.proj \* vec4<f32>\( v\.vScaled/.test(W) && !/render\.|object\.|varyings\./.test(W), validateWgsl(W).join("; ") || "validates");
    ok("  the transplanted WGSL validates against the spec scanner", validateWgsl(W).length === 0);
    ok("GLSL: `flat out int vBand` in the vertex, `flat in int vBand` in the fragment, the block after vUv, proj by the shell's name, no v_ or f_ left",
        /out vec2 vScaled; out float vLin; flat out int vBand;/.test(G.vertex) && /vUv = uv;\s*vec2 nodeVar0;\s*nodeVar0 = \( uv \* scale \);\s*vScaled = nodeVar0;/.test(G.vertex)
        && /in vec2 vScaled; in float vLin; flat in int vBand;/.test(G.fragment) && /proj \* vec4\( vScaled/.test(G.fragment) && !/\b[vf]_\w+/.test(G.vertex + G.fragment), G.vertex.split("\n").slice(4, 6).join(" "));
    ok("  the descriptor carries the shell's three uniforms and its buffers by name", d.uniforms.map((u) => u.name).join() === "scale,tint,proj" && d.buffers[0].attributes.map((a) => a.name).join() === "p,uv");
    // refusals, by name
    const noHooks = quadShell(); noHooks.wgsl.vertexTemplate = noHooks.wgsl.vertexTemplate.replace("{{ASSIGN}}", ""); noHooks.wgsl.prefix = noHooks.wgsl.prefix.replace("{{ASSIGN}}", "");
    ok("REFUSED: a shell with no {{ASSIGN}} for the computed varyings", throwsWith(() => transplantIntoShell({ wgsl: EM.wgsl }, noHooks), /no \{\{VARYINGS\}\} and \{\{ASSIGN\}\}/));
    const noMat = quadShell(); delete noMat.wgsl.matrices;
    ok("REFUSED: the fragment reads three's cameraProjectionMatrix and the shell names no matrix for it", throwsWith(() => transplantIntoShell({ wgsl: EM.wgsl }, noMat), /names no matrix of its own for it/));
    ok("REFUSED: a computed varying reading an UNLABELLED uniform; one reading the normal, which the quad shell does not carry; a fragment reading the model matrix",
        throwsWith(() => transplantIntoShell({ wgsl: { vertex: EM.wgsl.vertex.replace("object.scale", "object.nodeUniform9"), fragment: EM.wgsl.fragment } }, quadShell()), /UNLABELLED uniform \(nodeUniform9\)/)
        && throwsWith(() => transplantIntoShell({ wgsl: { vertex: EM.wgsl.vertex.replace("( uv * object.scale )", "( normal.xy * object.scale )"), fragment: EM.wgsl.fragment } }, quadShell()), /reads normal, which the shell "quad" does not carry/)
        && throwsWith(() => transplantIntoShell({ wgsl: { vertex: EM.wgsl.vertex, fragment: EM.wgsl.fragment.replace("render.cameraProjectionMatrix", "modelViewMatrix") } }, quadShell()), /model matrix/));
    // the planes pass, on the CPU: the array folded into the struct
    const shell = computeShell({ name: "planes", storage: [{ name: "pts", element: "vec4<f32>", access: "read" }, { name: "dist", element: "f32" }], uniforms: PLANES_UNIFORMS.map((u) => ({ ...u })), workgroupSize: 64 });
    let gen; try { gen = transplantCompute(FIX.planesCompute, shell); } catch (e) { gen = { wgsl: "", uniformArrays: [], error: e.message }; }
    ok("*** the planes pass: the shell's ONE uniform struct is { planes: array<vec4<f32>, 6>, info: vec4<f32> } -- struct Cull's own shape, planes first -- and the body reads u.planes[i] where three wrote planes.value[i] ***",
        /struct uStruct \{ planes: array<vec4<f32>, 6>, info: vec4<f32> \};/.test(gen.wgsl) && /u\.planes\[ i \]\.xyz/.test(gen.wgsl) && !/planes\.value/.test(gen.wgsl) && (gen.wgsl.match(/var<uniform>/g) || []).length === 1 && gen.uniformArrays.join() === "planes",
        gen.error || validateWgsl(gen.wgsl).join("; ") || "validates");
    ok("REFUSED: the struct field's length off by one; the field missing altogether",
        throwsWith(() => transplantCompute(FIX.planesCompute, computeShell({ name: "planes", storage: shell.storage, uniforms: [{ name: "planes", array: { element: "vec4<f32>", length: 5 } }, { name: "info", type: "vec4" }], workgroupSize: 64 })), /array<vec4<f32>, 6> and the shell "planes" says array<vec4<f32>, 5>/)
        && throwsWith(() => transplantCompute(FIX.planesCompute, computeShell({ name: "planes", storage: shell.storage, uniforms: [{ name: "info", type: "vec4" }], workgroupSize: 64 })), /declares 1 uniform array\(s\) \(planes\) and the shell "planes" declares 0/));
}

console.log("\n2. ON BOTH BACKENDS: emitted by three, transplanted, drawn by gfx/device.js -- the hand twin's picture to the byte, the CPU twin's to the rounding, the planes bit for bit");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const N = 128, CELLS = 8, COUNT = 64;
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N, CELLS, COUNT }, timeoutMs: 180000, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const S = await import("/render/tslSource.mjs"); const W = await import("/render/tslWide.mjs"); const { requestDevice } = await import("/gfx/device.js"); const { runCompute } = await import("/render/computeRun.mjs");
        const out = { emitted: {}, emittedPV: {}, run: {} };
        for (const mode of ["webgpu", "webgl2"]) {
            const canvas = document.createElement("canvas"); canvas.width = 16; canvas.height = 16;
            const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
            renderer.setRenderTarget(new THREE.RenderTarget(16, 16));
            const g = W.makeQuadVaryingsTsl(THREE, T, { cells: a.CELLS }); out.emitted[mode] = await S.emitShaders(renderer, { scene: g.scene, camera: g.camera, mesh: g.mesh });
            const g2 = W.makeQuadVaryingsTsl(THREE, T, { cells: a.CELLS, perVertexBand: true }); out.emittedPV[mode] = await S.emitShaders(renderer, { scene: g2.scene, camera: g2.camera, mesh: g2.mesh });
            if (mode === "webgpu") { const pg = W.makePlanesTsl(T, { count: a.COUNT }); await renderer.computeAsync(pg.node); out.planesEmitted = renderer._nodes.getForCompute(pg.node).computeShader; }
        }
        const em = { wgsl: out.emitted.webgpu, glsl: out.emitted.webgl2 }, emPV = { wgsl: out.emittedPV.webgpu, glsl: out.emittedPV.webgl2 };
        let desc, descPV; try { desc = S.transplantIntoShell(em, W.quadShell({ cells: a.CELLS })); descPV = S.transplantIntoShell(emPV, W.quadShell({ cells: a.CELLS })); } catch (e) { out.error = String(e.message); return out; }
        out.transplanted = { wgsl: desc.shaders.wgsl, glslVertex: desc.shaders.glsl.vertex, glslFragment: desc.shaders.glsl.fragment };
        const grid = W.quadGrid(a.CELLS), verts = a.CELLS * a.CELLS * 6, pics = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N; const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
                const vb = dev.buffer({ usage: "vertex", data: grid });
                const draw = async (pd) => (await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(dev.pipeline(pd)); pass.uniform("scale", W.QUAD_KNOBS.scale); pass.uniform("tint", W.QUAD_KNOBS.tint); pass.uniform("proj", Float32Array.from(W.QUAD_PROJ)); pass.vertices(vb); pass.draw(verts); }, { read: true, depth: false })).pixels;
                const hand = await draw(W.quadHand({ cells: a.CELLS })), gen = await draw(desc);
                const handPV = await draw(W.quadHand({ cells: a.CELLS, perVertexBand: true })), genPV = await draw(descPV);
                const cmp = (p, q) => { let same = 0, worst = 0; for (let i = 0; i < a.N * a.N; i++) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(p[i * 4 + c] - q[i * 4 + c])); if (d === 0) same++; worst = Math.max(worst, d); } return { same, worst, total: a.N * a.N }; };
                o.genVsHand = cmp(hand, gen); o.pvGenVsHand = cmp(handPV, genPV);
                // the CPU twin at PIXEL centres, every fourth pixel each way (row 0 is the top of the picture: y = 1 - 2 (py + 0.5) / N)
                let worstCpu = 0, samples = 0; const bands = new Set();
                for (let py = 2; py < a.N; py += 4) for (let px = 2; px < a.N; px += 4) { const x = -1 + 2 * (px + 0.5) / a.N, y = 1 - 2 * (py + 0.5) / a.N; const c = W.quadColourAt(x, y, { cells: a.CELLS }); const k = (py * a.N + px) * 4; for (let ch = 0; ch < 3; ch++) worstCpu = Math.max(worstCpu, Math.abs(gen[k + ch] - Math.round(c[ch] * 255))); samples++; bands.add(gen[k + 2]); }
                o.worstCpu = worstCpu; o.samples = samples; o.blues = bands.size; o.errs = errs; o.backend = dev.backend;
                pics[backend] = { hand, handPV };
                if (backend === "webgpu") {
                    const shell = S.computeShell({ name: "planes", storage: [{ name: "pts", element: "vec4<f32>", access: "read" }, { name: "dist", element: "f32" }], uniforms: W.PLANES_UNIFORMS.map((u) => ({ ...u })), workgroupSize: 64 });
                    const genC = S.transplantCompute(out.planesEmitted, shell); out.planesTransplanted = genC.wgsl;
                    const pts = new Float32Array(a.COUNT * 4); for (let i = 0; i < a.COUNT; i++) { pts[i * 4] = Math.sin(i * 1.7) * 1.5; pts[i * 4 + 1] = Math.cos(i * 0.9) * 1.5; pts[i * 4 + 2] = Math.sin(i * 0.3) * 1.5; pts[i * 4 + 3] = 1; }
                    const u = new Float32Array(28); u.set(W.boxPlanes(1), 0); u[24] = a.COUNT;
                    const res = await runCompute(dev, { code: genC.wgsl, workgroups: 1, buffers: { pts: { data: pts, usage: "storage" }, dist: { size: a.COUNT * 4 }, u: { data: u, usage: "uniform" } }, read: ["dist"] });
                    const cpu = W.planesCpu(W.boxPlanes(1), pts, a.COUNT), got = res.dist instanceof Float32Array ? res.dist : new Float32Array(res.dist.buffer || res.dist); let sameC = 0, worstC = 0, inside = 0; for (let i = 0; i < a.COUNT; i++) { const d = Math.abs(got[i] - cpu[i]); if (d === 0) sameC++; worstC = Math.max(worstC, d); if (cpu[i] > 0) inside++; }
                    o.planes = { same: sameC, worst: worstC, count: a.COUNT, inside, bindings: res.bindings };
                }
            } catch (e) { o.error = String(e && e.message || e).slice(0, 500); }
            out.run[backend] = o;
        }
        if (pics.webgpu && pics.webgl2) { let d = 0, dPV = 0; for (let i = 0; i < a.N * a.N; i++) { if (pics.webgpu.hand[i * 4 + 2] !== pics.webgl2.hand[i * 4 + 2]) d++; if (pics.webgpu.handPV[i * 4 + 2] !== pics.webgl2.handPV[i * 4 + 2]) dPV++; } out.crossBackend = { cellBand: d, perVertexBand: dPV, total: a.N * a.N }; }
        return out;
    }` });
    ok("the harness ran and both graphs transplanted on both backends", r.ok && r.result && !r.result.error && r.result.run && r.result.run.webgpu && r.result.run.webgl2 && !r.result.run.webgpu.error && !r.result.run.webgl2.error,
        r.ok ? (r.result.error || JSON.stringify([r.result.run && r.result.run.webgpu && r.result.run.webgpu.error, r.result.run && r.result.run.webgl2 && r.result.run.webgl2.error])) : r.reason);
    if (r.ok && r.result.run && !r.result.error && !r.result.run.webgpu.error && !r.result.run.webgl2.error) {
        const R = r.result;
        ok("three's live emission has the shape the fixture holds (three named varyings, the band flat, the camera in the fragment)", /@interpolate\( flat \) vBand : i32/.test(R.emitted.webgpu.vertex) && /flat\s+out int vBand;/.test(R.emitted.webgl2.vertex) && /render\.cameraProjectionMatrix/.test(R.emitted.webgpu.fragment) && /f_cameraProjectionMatrix/.test(R.emitted.webgl2.fragment));
        ok("  the transplanted WGSL validates", validateWgsl(R.transplanted.wgsl).length === 0 && validateWgsl(R.planesTransplanted).length === 0, validateWgsl(R.transplanted.wgsl).join("; "));
        for (const b of ["webgpu", "webgl2"]) { const o = R.run[b];
            ok(`*** ${b}: the quad drawn by the pipeline three GENERATED -- three computed varyings, one flat, the camera in the fragment -- is the hand-written twin's picture on EVERY pixel (${o.genVsHand.same} of ${o.genVsHand.total}, worst ${o.genVsHand.worst}) ***`, o.backend === b && o.genVsHand.same === o.genVsHand.total && o.errs.length === 0, o.errs.join(" | "));
            ok(`  ${b}: and the CPU twin that never saw the shell agrees at ${o.samples} pixel centres to the rounding of a byte (worst ${o.worstCpu} of 255), the blue channel taking ${o.blues} distinct values across the bands`, o.worstCpu <= 1 && o.blues >= 4);
            ok(`  ${b}: the per-vertex-band variant is ALSO its own twin's picture on every pixel (${o.pvGenVsHand.same} of ${o.pvGenVsHand.total})`, o.pvGenVsHand.same === o.pvGenVsHand.total); }
        const C = R.crossBackend;
        ok(`*** a cell-constant flat varying draws the SAME picture on both backends (${C.cellBand} pixels apart); a per-vertex one does NOT (${C.perVertexBand} of ${C.total} apart): WebGPU takes the first vertex, OpenGL ES the last -- the rule is the graph author's ***`, C.cellBand === 0 && C.perVertexBand > 1000);
        const P = R.run.webgpu.planes;
        ok(`*** WebGPU: the planes pass, its frustum INSIDE the struct at the offset packCullUniforms writes, equals the f32 CPU twin bit for bit (${P.same} of ${P.count}, ${P.inside} inside the box) through ONE uniform binding ***`, P.same === P.count && P.inside > 5 && P.inside < P.count && P.bindings.join() === "pts,dist,u", `worst ${P.worst}, bindings ${P.bindings.join(",")}`);
        fs.writeFileSync(EMITTED, JSON.stringify({ at: "v4483", three: "0.178.0", note: "render/tslWide.mjs's quad graph (three computed varyings, one flat, the camera in the fragment) and planes pass as three's node builders emitted them and as render/tslSource.mjs transplanted them; rewritten by tools/ship/tslWide-selfcheck.mjs on every green run",
            quad: { wgsl: R.emitted.webgpu, glsl: R.emitted.webgl2, transplanted: R.transplanted }, planes: { wgsl: R.planesEmitted, transplanted: R.planesTransplanted } }, null, 1));
        ok("the emitted and transplanted pair is written to tools/ship/tsl-emitted-wide.json for the WGSL corpus", fs.existsSync(EMITTED));
        report(`emitted WGSL vertex ${R.emitted.webgpu.vertex.length} chars, fragment ${R.emitted.webgpu.fragment.length} -> transplanted ${R.transplanted.wgsl.length}; planes ${R.planesEmitted.length} -> ${R.planesTransplanted.length}`);
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a computed varying that reads a TEXTURE in the vertex stage (three would emit a textureLoad there; no shell declares a vertex-stage texture); " +
    "cameraViewMatrix (the fixture reads the projection only, the rule is the same map); a flat varying of type u32 or a vector (i32 is what Slug's glyph word needs); " +
    "and the Slug graph itself, which is task 4's measurement, not this gate's.");
process.exit(fails ? 1 : 0);
