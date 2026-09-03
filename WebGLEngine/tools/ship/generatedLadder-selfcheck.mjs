// GENERATED GEOMETRY, GENERATED LODs, A GENERATED CULL -- ALL THREE IN ONE SCENE (v4373).
//
// Each link has been proved alone and none of them joined. v4365 brought a generated three.js object tree onto
// gfx/device.js. v4362-v4364 wrote render/gpuDriven.mjs's cull as a TSL graph and held it to the shipped pass, but
// only ever BESIDE it -- the generated module had never decided what draws. And the LOD ladder was never generated
// at all: every scene built on the bridge declared `lods: [{ near: the model }, { far: farMesh }]`, a single rung
// and a hand-written stand-in.
//
// *** WHY A GENERATED LADDER IS A DIFFERENT THING FROM A DECIMATED ONE, AND IT IS THE WHOLE POINT. *** A mesh file
// has one resolution. Its coarse levels have to be simplified OUT of it -- an approximation of an approximation,
// carrying whatever error the simplifier makes on top of whatever error the model already had. A model that exists
// as CODE has no such problem: call the factory again with a smaller budget and the coarse rung is built by the
// same construction as the fine one, from the same intent. img2threejs's own mesh codec already carries the idea
// (a Quality type with named levels and a ?quality= override, beside buildModel and buildModelProgressive), and
// nothing consumed it. This is what consuming it looks like.
//
// AND THE THRESHOLDS STOP BEING TYPED. render/gpuDriven.mjs's ladder is driven by hand-chosen angular sizes. With
// the rungs generated, section 3 measures what each rung COSTS in triangles and what it costs in PIXELS, so the
// distance at which a rung is safe is a number this tree derived rather than a number somebody picked.
//
// THE MODEL IS THIS GATE'S OWN, for the reason v4365 gives: the img2threejs TOOLING repo is Apache-2.0, but the
// SHOWCASE repo that holds the generated models carries no LICENSE file and no license field, so nothing from it is
// vendored. The factory here takes a segment budget the way theirs takes a quality level.
//
// v4374 -- AND THE THRESHOLDS DERIVED (sections 5 and 6), which is what v4373 left open: it priced the rungs and said
// the thresholds were "PRICED but not yet chosen", because choosing needs a policy nobody had stated.
//
// *** THE FIRST POLICY THIS ROUND STATED WAS MEASURED WRONG, AND THAT IS THE FINDING. *** It said a rung may be used
// wherever it changes at most a FRACTION of the pixels the subject covers -- of the subject and not of the frame,
// because a frame budget "is satisfied trivially by anything far enough away". Measured over a 27.5x range of angular
// size, that fraction does not move: rung 1 costs 57-75% of its own covered pixels and rung 2 costs 80-90%, spreads
// of 1.33x and 1.36x. It is SCALE-INVARIANT, because a coarser rung shades differently across the whole subject and
// not only at its outline, so changed and covered scale together. A scale-invariant cost expresses no preference
// about distance, so no threshold can be derived from it at any budget -- and the sentence written against the frame
// policy is the argument FOR it: a distant model may use a coarse rung precisely because its error is trivially small
// in absolute terms. That is what "you cannot see it from there" means.
//
// So the policy is ABSOLUTE: 64 pixels of the frame per instance, one number in one place. render/lodBudget.mjs
// derives 0.0515 and 0.0416 from the measured curve by interpolating between the two samples that bracket the budget,
// against the 0.055 and 0.03 v4373 typed -- 0.94x and 1.39x. And the derived pair is DRIVEN, in a second harness call
// parameterised by the first one's answer: 96 instances cost 1,406 pixels against rung 0 everywhere, 22.9% of the
// 6,144 the policy allows. A round that derived a number and never drove with it would be an argument.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { buildLadder, ladderInvariants, unitMesh } from "../../render/img2three.mjs";
import * as DE from "../../render/divineEye.mjs";
import { crossingFor, lodThresholdsFor, lodThresholdsOr, priceRung, COST_PIXELS, COST_FRACTION, FRAME, COVERED } from "../../render/lodBudget.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const skip = webgpuSkipReason();
const W = 256, N = W * W;

console.log("\n1. THE LADDER'S INVARIANTS, ON THE CPU: what a generated ladder must carry, as numbers rather than as a throw");
{
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    // a ring of `seg` segments in the xy plane: a real budget, in that a coarser ring is INSCRIBED in a finer one
    const ring = (seg, scale = 1) => ({ isMesh: true, matrixWorld: { elements: I },
        material: { type: "MeshStandardMaterial", color: { r: 1, g: 1, b: 1 } },
        geometry: { attributes: { position: { count: seg * 3, array: Float32Array.from(Array.from({ length: seg }, (_, k) => {
            const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
            return [0, 0, 0, Math.cos(a0) * scale, Math.sin(a0) * scale, 0, Math.cos(a1) * scale, Math.sin(a1) * scale, 0];
        }).flat()) } } } });
    const L = buildLadder((seg) => [ring(seg)], [64, 16, 6]);
    ok(`a ring built at three budgets IS a ladder: ${L.invariants.triangles.join(" -> ")} triangles, ${L.invariants.ratio.map((r) => r.toFixed(3)).join(" / ")} of the finest, every rung inside the finest by ${L.invariants.worstOutside.toExponential(1)}`,
        L.invariants.decreasing && L.invariants.contained && L.invariants.sameMaterials && L.invariants.triangles.join() === "64,16,6",
        `families ${L.invariants.families}; a coarser ring is INSCRIBED in a finer one, which is why containment is the invariant and not a tolerance`);
    // A RING'S RUNGS ALL REACH THE SAME BOUNDS -- its vertices sit ON the circle at every segment count, and it is
    // the EDGES that cut inside -- so this ladder cannot show what the framing buys. One whose coarse rung really is
    // smaller can, and the difference is the whole of v4366's lesson: framed by rung 0 the shrink is visible, framed
    // by itself it is scaled away and the two rungs look identical.
    const shrunk = buildLadder((seg) => [ring(seg, seg === 16 ? 0.8 : 1)], [64, 16, 6]);
    const ext = (m) => m.positions.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
    const byBase = ext(shrunk.rungs[1].mesh), bySelf = ext(unitMesh(shrunk.rungs[1].raw, 1));
    ok("*** every rung is framed by RUNG 0 and not by itself: a rung genuinely 0.8 the size stays 0.8 the size, where a per-rung normalisation would scale it back up to the same box and hide the shrink entirely ***",
        Math.abs(byBase / ext(shrunk.rungs[0].mesh) - 0.8) < 1e-6 && Math.abs(bySelf / ext(shrunk.rungs[0].mesh) - 1) < 1e-6 && !shrunk.invariants.contained === false,
        `framed by rung 0 it reaches ${byBase.toFixed(6)} against rung 0's ${ext(shrunk.rungs[0].mesh).toFixed(6)} (ratio ${(byBase / ext(shrunk.rungs[0].mesh)).toFixed(6)}); framed by itself, ${bySelf.toFixed(6)} -- ratio ${(bySelf / ext(shrunk.rungs[0].mesh)).toFixed(6)}, a 20% error normalised out of existence. The plain ring's rungs all reach ${ext(L.rungs[0].mesh).toFixed(6)}, identically, because a polygon's vertices lie on its circle at every segment count`);
    // the two failures a ladder can have, each named
    const grew = ladderInvariants(buildLadder((seg) => [ring(seg, seg === 6 ? 1.4 : 1)], [64, 16, 6]).rungs);
    ok("REFUSED by measurement, not by a throw: a rung that GROWS is caught by containment, and a rung that does not shrink is caught by the triangle order",
        !grew.contained && grew.worstOutside > 0.3 && !ladderInvariants(buildLadder((seg) => [ring(seg)], [16, 16]).rungs).decreasing,
        `a coarse rung scaled 1.4x reaches ${grew.worstOutside.toFixed(4)} outside the finest; two equal budgets give ${ladderInvariants(buildLadder((seg) => [ring(seg)], [16, 16]).rungs).triangles.join(",")} triangles and decreasing is false`);
    ok("  and a one-rung ladder is refused by name", throwsWith(() => buildLadder((s) => [ring(s)], [8]), /at least two budgets/));
}

console.log("\n2. A GENERATED MODEL'S LADDER, FROM ONE FACTORY AT THREE BUDGETS (and then the scene it drives)");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, BUDGETS: [24, 10, 5] }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const B = await import("/render/img2three.mjs"); const G = await import("/render/gpuDriven.mjs"); const F = await import("/render/fleets.mjs");
        const P = await import("/render/physicsTsl.mjs"); const S = await import("/render/tslSource.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        // ONE FACTORY, A SEGMENT BUDGET. Every primitive takes the budget, so a coarse rung is the same model built
        // coarsely rather than a fine model simplified -- which is the property a code-only model has and a file does not.
        const make = (seg) => {
            const root = new THREE.Group();
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, seg, Math.max(3, seg >> 1)), new THREE.MeshPhysicalMaterial({ color: 0x2b6fb0 }));
            root.add(body);
            const arm = new THREE.Group(); arm.position.set(0.5, 0.18, 0); arm.rotation.set(0.25, 0.6, 0.1); root.add(arm);
            const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.5, seg), new THREE.MeshStandardMaterial({ color: 0xf4c531 }));
            knob.rotation.z = 0.7; arm.add(knob);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, Math.max(3, seg >> 1), seg), new THREE.MeshStandardMaterial({ color: 0x27ae60 }));
            ring.position.set(-0.35, -0.2, 0.15); ring.rotation.x = 0.9; root.add(ring);
            root.updateMatrixWorld(true);
            return root;
        };
        const L = B.buildLadder(make, a.BUDGETS);
        out.ladder = { budgets: a.BUDGETS, triangles: L.invariants.triangles, ratio: L.invariants.ratio,
                       decreasing: L.invariants.decreasing, contained: L.invariants.contained, worstOutside: L.invariants.worstOutside,
                       sameMaterials: L.invariants.sameMaterials, families: L.invariants.families,
                       meshes: L.rungs.map((r2) => r2.meshes) };
        const cv = document.createElement("canvas"); cv.width = a.W; cv.height = a.W;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const look = F.LOOKS.lit, buffers = G.layoutBuffers(look.layout);
        const fleetOf = (mesh) => ({ name: "gen", look: "lit", layout: look.layout,
            pipeline: { shaders: look.shaders, vs: "vs", fs: "fs", buffers, uniforms: look.uniforms },
            pickPipeline: { shaders: look.pick, vs: "vs", fs: "fs", buffers, uniforms: [{ name: "viewProj", type: "mat4" }] },
            lods: [{ name: "near", mesh }, { name: "far", mesh: F.farMesh([1, 1, 1, 1]) }],
            bind: (pass) => pass.uniform("light", F.LIGHT) });
        const one = (mesh, eye) => { const sc = G.makeGpuDrivenScene(dev, { fleets: [fleetOf(mesh)], fleetOf: Uint32Array.from([0]), thresholds: [0.0001], records: Float32Array.from([0, 0, 0, 1]) });
            const cam = { viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 100), G.lookAt(eye, [0, 0, 0])), eye };
            return sc.frame({ ...cam, read: true, clear: [0.03, 0.03, 0.03, 1] }).pixels; };
        try {
            // (a) WHAT EACH RUNG COSTS IN PIXELS, at three distances -- so a threshold is derived, not typed
            out.rungPics = {};
            for (const [tag, eye] of [["near", [0.9, 0.7, 1.5]], ["mid", [1.8, 1.4, 3.0]], ["far", [3.6, 2.8, 6.0]]])
                out.rungPics[tag] = await Promise.all(L.rungs.map(async (r2) => Array.from((await one(r2.mesh, eye)).pixels)));

            // (b) THE LADDER IN A REAL SCENE, and the SAME scene with the GENERATED cull deciding what draws
            const COUNT = 96, LODS = 3, CAP = COUNT;
            const records = new Float32Array(COUNT * 4);
            // three blocks at three depths, chosen so the ladder is actually CLIMBED: at radius 0.5 and an eye at
            // z = 7 the angular metric is 0.5/distance, so 8 / 15 / 22 units away straddles both thresholds and
            // every rung draws. A scene where one rung takes everything would match pixel-for-pixel and prove less.
            for (let i = 0; i < COUNT; i++) { const x = (i % 8) - 3.5, y = (Math.floor(i / 8) % 4) - 1.5, z = -1 - Math.floor(i / 32) * 7;
                records.set([x, y, z, 0.5], i * 4); }
            const fleet = { ...fleetOf(L.rungs[0].mesh), lods: L.rungs.map((r2, i) => ({ name: "lod" + i, mesh: r2.mesh })) };
            const thresholds = [0.055, 0.03];
            const cam = { viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 200), G.lookAt([0, 0, 7], [0, 0, 0])), eye: [0, 0, 7] };
            const shipped = G.makeGpuDrivenScene(dev, { fleets: [fleet], fleetOf: new Uint32Array(COUNT), thresholds, records, cap: CAP });
            const picShipped = Array.from((await shipped.frame({ ...cam, read: true, clear: [0.03, 0.03, 0.03, 1] }).pixels).pixels);
            out.shippedCounts = await shipped.readCounts();

            // the generated cull: three's graph, transplanted, handed to the scene through the v4373 hook
            const renderer = new THREE.WebGPURenderer({ canvas: document.createElement("canvas"), forceWebGL: false, antialias: false }); await renderer.init();
            const g = P.makeCullPassTsl(T, { count: COUNT, lodCount: LODS, regions: LODS, cap: CAP, fleets: false, planesUniform: true });
            await renderer.computeAsync(g.node);
            const emitted = renderer._nodes.getForCompute(g.node).computeShader;
            const shell = S.computeShell({ name: "generated cull, driving", workgroupSize: G.CULL_WORKGROUP,
                storage: [{ name: "inst", element: "vec4<f32>", access: "read" }, { name: "extras", element: "vec4<f32>", access: "read" },
                          { name: "cmds", struct: P.CMD_STRUCT }, { name: "records", element: "vec4<f32>" }],
                uniforms: [{ name: "eye", type: "vec4" }, { name: "thresholds", type: "vec4" }, { name: "info", type: "vec4" }, { name: "clock", type: "vec4" }],
                uniformArrays: [{ name: "planes", element: "vec4<f32>", length: 6 }] });
            const gen = S.transplantCompute(emitted, shell);
            out.genWgsl = gen.wgsl.slice(0, 400);
            let planeBuf = null, uBuf = null;
            const driven = G.makeGpuDrivenScene(dev, { fleets: [fleet], fleetOf: new Uint32Array(COUNT), thresholds, records, cap: CAP,
                cull: { wgsl: gen.wgsl, entryPoint: "main",
                    bind(pipe, bufs) { planeBuf = dev.buffer({ size: 24 * 4, usage: "uniform" }); uBuf = dev.buffer({ size: 16 * 4, usage: "uniform" });
                        pipe.bind("inst", bufs.inst).bind("extras", bufs.extras).bind("cmds", bufs.cmds).bind("records", bufs.records).bind("planes", planeBuf).bind("u", uBuf); },
                    // the SAME 40 floats packCullUniforms produced, sliced -- the scene owns them and never knew
                    write(u) { planeBuf.write(u.slice(0, 24)); uBuf.write(u.slice(24, 40)); } } });
            const picDriven = Array.from((await driven.frame({ ...cam, read: true, clear: [0.03, 0.03, 0.03, 1] }).pixels).pixels);
            out.drivenCounts = await driven.readCounts();
            out.scene = { shipped: picShipped, driven: picDriven, count: COUNT, lods: LODS, thresholds };
            // and the refusals the hook must make
            const refuse = (fn) => { try { fn(); return null; } catch (e) { return String(e.message).slice(0, 200); } };
            out.refusals = {
                shape: refuse(() => G.makeGpuDrivenScene(dev, { fleets: [fleet], fleetOf: new Uint32Array(COUNT), thresholds, records, cap: CAP, cull: { wgsl: gen.wgsl } })),
                occ: refuse(() => G.makeGpuDrivenScene(dev, { fleets: [fleet], fleetOf: new Uint32Array(COUNT), thresholds, records, cap: CAP, occlusion: true, cull: { wgsl: gen.wgsl, bind() {}, write() {} } })),
            };
            const cv2 = document.createElement("canvas"); cv2.width = 8; cv2.height = 8;
            const gl = await requestDevice(cv2, { backend: "webgl2" });
            out.refusals.webgl2 = refuse(() => G.makeGpuDrivenScene(gl, { fleets: [fleet], fleetOf: new Uint32Array(COUNT), thresholds, records, cap: CAP, cull: { wgsl: gen.wgsl, bind() {}, write() {} } }));
            out.errs = errs;
        } catch (e) { out.error = String(e && e.stack || e).slice(0, 700); }
        return out;
    }` });
    ok("the harness built the ladder, drove the scene twice and rendered every rung", r.ok && r.result && !r.result.error && r.result.scene,
        r.ok ? (r.result && r.result.error) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.error) {
        const R = r.result, L = R.ladder;
        ok(`*** ONE FACTORY, THREE BUDGETS, THREE RUNGS: ${L.budgets.join(" / ")} segments give ${L.triangles.join(" -> ")} triangles (${L.ratio.map((x) => (100 * x).toFixed(1) + "%").join(", ")} of the finest), every rung inside the finest and all three carrying the same material families ***`,
            L.decreasing && L.contained && L.sameMaterials && L.triangles[2] < L.triangles[0] / 3,
            `worst reach outside rung 0: ${L.worstOutside.toExponential(1)}; families ${L.families}; ${L.meshes.join("/")} meshes per rung -- the SAME parts at every budget, which a decimator cannot promise`);

        console.log("\n3. WHAT EACH RUNG COSTS, MEASURED: triangles against pixels, so an LOD threshold stops being a typed number");
        const rows = [];
        for (const tag of ["near", "mid", "far"]) {
            const base = Uint8ClampedArray.from(R.rungPics[tag][0]);
            for (let i = 1; i < R.rungPics[tag].length; i++) { const p = Uint8ClampedArray.from(R.rungPics[tag][i]);
                rows.push({ tag, rung: i, tris: L.triangles[i], ...DE.exactDifference(base, p), ...DE.compare(base, p, W, W) }); }
        }
        for (const o of rows) console.log(`        ${o.tag.padEnd(5)} rung ${o.rung} (${String(o.tris).padStart(5)} tris, ${(100 * o.tris / L.triangles[0]).toFixed(0).padStart(3)}%)  ${String(o.differing).padStart(5)} px differ of ${N}  IoU ${o.iou.toFixed(4)}  scale ${String(o.scaleDelta.toFixed(4)).padStart(8)}  SSIM ${o.ssim.toFixed(4)}  coverage ${o.refCoverage.toFixed(4)}/${o.renCoverage.toFixed(4)}  ${o.passesHardGates ? "passes" : "hard-gated"}`);
        const near2 = rows.find((o) => o.tag === "near" && o.rung === 2), far2 = rows.find((o) => o.tag === "far" && o.rung === 2);
        ok(`*** THE SAME RUNG COSTS LESS THE FURTHER IT IS: rung 2 at ${(100 * L.triangles[2] / L.triangles[0]).toFixed(0)}% of the triangles moves ${near2.differing} pixels up close and ${far2.differing} far away, ${(near2.differing / Math.max(1, far2.differing)).toFixed(1)}x fewer ***`,
            near2.differing > far2.differing && far2.differing > 0,
            `THIS is what an LOD threshold is choosing between, and it is now a measured curve rather than a typed constant: near ${near2.differing} px (IoU ${near2.iou.toFixed(4)}), far ${far2.differing} px (IoU ${far2.iou.toFixed(4)})`);
        // *** AND THE COVERAGE COLUMN IS THE FINDING, NOT THE FIDELITY COLUMN. *** Below 0.035 coverage their mask is
        // REPLACED by "every pixel with alpha", which on an opaque render is the whole frame. That is a warning in
        // their code and not a failure, and it means the silhouette IoU stops depending on the picture at all.
        const fell = rows.filter((o) => o.renFellBack || o.refFellBack);
        const both = rows.filter((o) => o.renFellBack && o.refFellBack);
        ok(`*** A SMALL SUBJECT TURNS THE HARD GATE OFF RATHER THAN FAILING IT: on ${both.length} of ${rows.length} rows BOTH masks fell back to "every opaque pixel", coverage 1.0000 on each side, and the silhouette IoU then reads EXACTLY 1 and the scale delta EXACTLY 0 -- while ${both.map((o) => o.differing).join(" and ")} pixels differ ***`,
            both.length >= 2 && both.every((o) => o.iou === 1 && o.scaleDelta === 0 && o.differing > 0 && o.passesHardGates),
            `their own loader says it: "foreground mask is tiny; material extraction is likely unreliable" -- a WARNING, which their contract never lets fail a build. The far rows read 1.0000 not because the coarse rung matches but because there is no longer a silhouette to compare`);
        const mixed = rows.filter((o) => o.renFellBack !== o.refFellBack);
        ok(`  and the TRANSITION is worse than either side of it: ${mixed.length} row(s) have one mask in the fallback and one not (coverage ${mixed.map((o) => o.refCoverage.toFixed(4) + " vs " + o.renCoverage.toFixed(4)).join(", ")}), which scores IoU ${mixed.map((o) => o.iou.toFixed(4)).join(", ")} and a scale delta of ${mixed.map((o) => o.scaleDelta.toFixed(2)).join(", ")} on a ${mixed.map((o) => o.differing).join(", ")}-pixel change`,
            mixed.length >= 1 && mixed.every((o) => o.scaleDelta > 1 && o.differing < 4000),
            `a 14x scale delta on a 2,175-pixel change is two mask REGIMES being compared, not two pictures. v4366 measured what these gates cannot see; this is the other failure mode, where they report something that is not there -- and both live on the same side of a coverage threshold nobody in the loop is looking at`);
        ok("  and the cheapest rung is never free: at every distance measured it moves pixels, so a ladder is a trade this tree can price and not a free lunch",
            rows.every((o) => o.differing > 0), rows.map((o) => `${o.tag}/r${o.rung}: ${o.differing}`).join(", "));

        console.log("\n4. THE GENERATED CULL DRIVING A REAL SCENE, for the first time -- not beside the shipped pass, instead of it");
        const A = Uint8ClampedArray.from(R.scene.shipped), B2 = Uint8ClampedArray.from(R.scene.driven);
        const d = DE.exactDifference(A, B2);
        let lit = 0; for (let i = 0; i < N; i++) if (A[i * 4] + A[i * 4 + 1] + A[i * 4 + 2] > 24) lit++;
        ok(`*** THE SCENE DRAWN BY THE GENERATED CULL IS THE SCENE DRAWN BY THE SHIPPED ONE, PIXEL FOR PIXEL: ${N - d.differing} of ${N} identical, worst channel ${d.worst}, over ${R.scene.count} instances on a ${R.scene.lods}-rung generated ladder ***`,
            d.differing === 0 && d.worst === 0 && lit > 2000 && (R.errs || []).length === 0,
            `${lit} pixels lit; thresholds ${R.scene.thresholds.join(", ")}; device errors ${(R.errs || []).length}. render/gpuDriven.mjs did not know which cull it was running: it owns the buffers, hands them to bind() once, and writes the same 40 floats packCullUniforms always produced`);
        ok(`*** and the LADDER WAS ACTUALLY CLIMBED, which the picture alone could not say: the two passes put the same instances in the same regions -- ${(R.shippedCounts || []).join(" / ")} against ${(R.drivenCounts || []).join(" / ")} -- with every rung drawing something ***`,
            !!R.shippedCounts && !!R.drivenCounts && R.shippedCounts.join() === R.drivenCounts.join() &&
            R.shippedCounts.length === R.scene.lods && R.shippedCounts.every((c) => c > 0),
            `a matching picture is compatible with a ladder nobody climbed -- one rung drawing all ${R.scene.count} instances would look the same in both. The per-region counts are what say the generated cull sorted them, and it sorted them the way the shipped pass does`);
        const RF = R.refusals || {};
        ok("REFUSED by name: a cull without bind/write, a custom cull with occlusion, and a custom cull on WebGL2",
            /must be \{ wgsl, entryPoint\?, bind/.test(RF.shape || "") && /two-phase path builds a SECOND cull/.test(RF.occ || "") && /culls on the CPU/.test(RF.webgl2 || ""),
            `${(RF.shape || "NOT REFUSED").slice(0, 60)} | ${(RF.occ || "NOT REFUSED").slice(0, 60)} | ${(RF.webgl2 || "NOT REFUSED").slice(0, 60)}`);
        report("ALL THREE LINKS ARE NOW GENERATED AND EACH CARRIES A NUMBER: the GEOMETRY (a three.js factory's output " +
            "through render/img2three.mjs, held to three's own localToWorld at v4365), the LADDER (the same factory at three " +
            "budgets, its rungs held to containment and a falling triangle count, and each rung's cost measured in pixels), " +
            "and the CULL (three's node graph transplanted into a device module and handed to gpuDriven, drawing the shipped " +
            "pass's picture exactly). What is still hand-written in this scene: the render shaders -- the fleets' own lit " +
            "pair -- and the thresholds themselves, which section 3 now PRICES but does not yet choose.");
    }
}

console.log("\n5. THE POLICY, ON THE CPU (v4374): one stated number, and the three ways deriving a threshold from it can fail");
{
    const s = (metric, changed, covered = 1000) => ({ metric, changed, covered });
    const good = [s(0.10, 120), s(0.06, 60), s(0.04, 30), s(0.02, 10)];
    const c = crossingFor(good, COVERED(0.02));
    ok(`*** a threshold is INTERPOLATED between the two measured samples that bracket the budget: 1.00% at metric 0.02 and 3.00% at 0.04 put the 2.00% crossing at ${c.metric.toPrecision(4)} ***`,
        Math.abs(c.metric - 0.03) < 1e-9 && c.monotone && c.bounded === false,
        `${c.why} -- and the two bracketing samples are returned with it, so the number can be read back to the measurement it came from`);
    ok("  a rung the record never priced, and one never cheap enough at any metric measured, both return NO threshold and say which they are",
        crossingFor([], COVERED(0.02)).metric === null && /never priced/.test(crossingFor([], COVERED(0.02)).why) &&
        crossingFor([s(0.1, 500)], COVERED(0.02)).metric === null && /never within 2.00%/.test(crossingFor([s(0.1, 500)], COVERED(0.02)).why),
        `"${crossingFor([s(0.1, 500)], COVERED(0.02)).why}"`);
    const allUnder = crossingFor([s(0.02, 5), s(0.04, 8)], COVERED(0.02));
    ok("  and a rung within budget at EVERY metric measured returns the largest measured as a BOUND, flagged, rather than a crossing it never saw",
        allUnder.bounded === true && allUnder.metric === 0.04 && /BOUND and not as the crossing/.test(allUnder.why));
    ok("  a record whose cost does not rise with metric is flagged rather than interpolated through",
        priceRung([s(0.02, 90), s(0.06, 10)], { of: "covered" }).monotone === false && priceRung(good, { of: "covered" }).monotone === true,
        "a rung is cheaper the further away it is; a record saying otherwise is a measurement to look at");
    const bad = lodThresholdsFor([{ rung: 1, samples: good }, { rung: 2, samples: [s(0.1, 500)] }], { policy: COVERED(0.02) });
    ok("REFUSED: a LADDER is derived only when EVERY rung derives -- one rung short and the answer is null with the rung named, because a partly-derived ladder has a typed number hiding in it",
        bad.thresholds === null && /rung\(s\) 2 could not be derived/.test(bad.why));
    const unordered = lodThresholdsFor([{ rung: 1, samples: [s(0.02, 5), s(0.04, 30)] }, { rung: 2, samples: [s(0.06, 5), s(0.08, 30)] }], { policy: COVERED(0.02) });
    ok("  and thresholds that do not FALL are refused too: gpuDriven tests them in order, so a rising pair would skip a rung",
        unordered.thresholds === null && /do not fall/.test(unordered.why));
    const ored = lodThresholdsOr([{ rung: 1, samples: [] }], [0.055], { policy: COVERED(0.02) });
    ok("  and a caller who must have a number gets its own back MARKED, so a hand-chosen threshold stays visible as one",
        ored.typed === true && ored.thresholds.join() === "0.055" && /caller's typed thresholds/.test(ored.why),
        `the tools/roundhouse/costRecord.mjs sweepBudgetOr shape from v4361, which this is deliberately built to match`);
}

console.log("\n6. THE LADDER PRICED AND THE THRESHOLDS DERIVED, then the scene driven by them");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r2 = await runInEngineOrigin({ engineRoot: ENG, args: { W, BUDGETS: [24, 10, 5], DIST: [4, 5, 6, 8, 11, 15, 21, 30, 45, 70, 110] }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js");
        const B = await import("/render/img2three.mjs"); const G = await import("/render/gpuDriven.mjs"); const F = await import("/render/fleets.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const make = (seg) => { const root = new THREE.Group();
            root.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, seg, Math.max(3, seg >> 1)), new THREE.MeshPhysicalMaterial({ color: 0x2b6fb0 })));
            const arm = new THREE.Group(); arm.position.set(0.5, 0.18, 0); arm.rotation.set(0.25, 0.6, 0.1); root.add(arm);
            const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.5, seg), new THREE.MeshStandardMaterial({ color: 0xf4c531 })); knob.rotation.z = 0.7; arm.add(knob);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, Math.max(3, seg >> 1), seg), new THREE.MeshStandardMaterial({ color: 0x27ae60 }));
            ring.position.set(-0.35, -0.2, 0.15); ring.rotation.x = 0.9; root.add(ring);
            root.updateMatrixWorld(true); return root; };
        const L = B.buildLadder(make, a.BUDGETS);
        const cv = document.createElement("canvas"); cv.width = a.W; cv.height = a.W;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const look = F.LOOKS.lit, buffers = G.layoutBuffers(look.layout);
        const fleetOf = (lods) => ({ name: "gen", look: "lit", layout: look.layout,
            pipeline: { shaders: look.shaders, vs: "vs", fs: "fs", buffers, uniforms: look.uniforms },
            pickPipeline: { shaders: look.pick, vs: "vs", fs: "fs", buffers, uniforms: [{ name: "viewProj", type: "mat4" }] },
            lods, bind: (pass) => pass.uniform("light", F.LIGHT) });
        const RAD = 0.5;
        const shootOne = (mesh, dist) => { const sc = G.makeGpuDrivenScene(dev, { fleets: [fleetOf([{ name: "n", mesh }, { name: "f", mesh: F.farMesh([1, 1, 1, 1]) }])],
                fleetOf: Uint32Array.from([0]), thresholds: [1e-9], records: Float32Array.from([0, 0, 0, RAD]) });
            const eye = [0, 0, dist];
            const cam = { viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 300), G.lookAt(eye, [0, 0, 0])), eye };
            return sc.frame({ ...cam, read: true, clear: [0.03, 0.03, 0.03, 1] }).pixels; };
        const out = { triangles: L.invariants.triangles, record: [] };
        try {
            // PRICE: one instance at eight distances, every rung against rung 0 at the same camera
            const priced = [[], []];
            for (const d of a.DIST) {
                const base = (await shootOne(L.rungs[0].mesh, d)).pixels;
                for (let k = 1; k < L.rungs.length; k++) {
                    const p = (await shootOne(L.rungs[k].mesh, d)).pixels;
                    let changed = 0, covered = 0;
                    for (let i = 0; i * 4 < base.length; i++) {
                        let diff = 0; for (let c = 0; c < 3; c++) diff = Math.max(diff, Math.abs(base[i * 4 + c] - p[i * 4 + c]));
                        if (diff) changed++;
                        if (base[i * 4] + base[i * 4 + 1] + base[i * 4 + 2] > 24) covered++;
                    }
                    priced[k - 1].push({ metric: RAD / d, changed, covered, dist: d });
                }
            }
            out.record = [{ rung: 1, samples: priced[0] }, { rung: 2, samples: priced[1] }];

            // DRIVE: the same scene at the derived thresholds and at rung 0 everywhere
            const COUNT = 96, CAP = COUNT;
            const records = new Float32Array(COUNT * 4);
            for (let i = 0; i < COUNT; i++) { const x = (i % 8) - 3.5, y = (Math.floor(i / 8) % 4) - 1.5, z = -1 - Math.floor(i / 32) * 7;
                records.set([x, y, z, RAD], i * 4); }
            const cam = { viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 200), G.lookAt([0, 0, 7], [0, 0, 0])), eye: [0, 0, 7] };
            const lods = L.rungs.map((r3, i) => ({ name: "lod" + i, mesh: r3.mesh }));
            out.scene = { count: COUNT };
            out.shootScene = async (th) => {};   // placeholder, replaced below
            const sceneAt = async (th) => { const sc = G.makeGpuDrivenScene(dev, { fleets: [fleetOf(lods)], fleetOf: new Uint32Array(COUNT), thresholds: th, records, cap: CAP });
                const pix = Array.from((await sc.frame({ ...cam, read: true, clear: [0.03, 0.03, 0.03, 1] }).pixels).pixels);
                return { pix, counts: await sc.readCounts() }; };
            out.full = await sceneAt([1e-9, 1e-10]);    // nothing ever drops: rung 0 everywhere
            out.typed = await sceneAt([0.055, 0.03]);   // v4373's hand-chosen pair
            out.derivedPending = true;
            out.metricsOfScene = Array.from({ length: COUNT }, (_, i) => { const z = -1 - Math.floor(i / 32) * 7;
                const dx = (i % 8) - 3.5, dy = (Math.floor(i / 8) % 4) - 1.5;
                return RAD / Math.max(1e-6, Math.hypot(dx - 0, dy - 0, z - 7)); });
            out.errs = errs;
            out.__sceneAt = true;
            // the derived pair cannot be computed in here (the module is node-side), so the harness returns the
            // record and the caller re-enters with the thresholds it derived. Two passes, one page.
        } catch (e) { out.error = String(e && e.message || e).slice(0, 400); }
        delete out.shootScene;
        return out;
    }` });
    ok("the harness priced the ladder at eight distances", r2.ok && r2.result && !r2.result.error && r2.result.record && r2.result.record.length === 2,
        r2.ok ? (r2.result && r2.result.error) : (r2.reason || (r2.pageErrors || []).join("; ")));
    if (r2.ok && r2.result && !r2.result.error) {
        const R2 = r2.result;
        for (const rec of R2.record) { const abs = priceRung(rec.samples, { of: "frame" }), frac = priceRung(rec.samples, { of: "covered" });
            console.log(`        rung ${rec.rung} (${R2.triangles[rec.rung]} tris)  pixels: ` + abs.rows.map((x) => `${x.metric.toFixed(4)}->${String(x.cost).padStart(5)}`).join(" "));
            console.log(`        ${" ".repeat(String(rec.rung).length + 20)}fraction: ` + frac.rows.map((x) => `${x.metric.toFixed(4)}->${(isFinite(x.cost) ? (100 * x.cost).toFixed(0) + "%" : " n/a").padStart(4)}`).join(" ")); }
        // THE MEASUREMENT THAT SETTLED THE POLICY, checked rather than recited
        const spreads = R2.record.map((rec) => { const v = priceRung(rec.samples, { of: "covered" }).rows.map((x) => x.cost).filter((x) => isFinite(x) && x > 0);
            return { rung: rec.rung, lo: Math.min(...v), hi: Math.max(...v) }; });
        const metrics = R2.record[0].samples.map((x) => x.metric);
        const angSpread = Math.max(...metrics) / Math.min(...metrics);
        ok(`*** THE FIRST POLICY THIS ROUND STATED WAS MEASURED WRONG: a rung's cost as a FRACTION of its own covered pixels is SCALE-INVARIANT -- angular size varies ${angSpread.toFixed(1)}x across the sweep and the fraction varies ${spreads.map((s2) => (s2.hi / s2.lo).toFixed(2) + "x").join(" and ")} ***`,
            spreads.every((s2) => s2.hi / s2.lo < 2) && angSpread > 5,
            `rung ${spreads.map((s2) => `${s2.rung}: ${(100 * s2.lo).toFixed(0)}-${(100 * s2.hi).toFixed(0)}%`).join(", rung ")}. A coarser rung shades differently across the WHOLE subject, not only at its outline, so changed and covered scale together. A scale-invariant cost expresses no preference about distance, so NO threshold can be derived from it at any budget -- and the argument written against an absolute budget ("satisfied trivially by anything far enough away") turns out to be the argument FOR it`);
        const dFrac = lodThresholdsFor(R2.record, { policy: COVERED(COST_FRACTION) });
        ok(`  and the module says so by failing closed rather than by returning a number: the fraction policy derives NOTHING and names the rung`,
            dFrac.thresholds === null && /never within/.test(dFrac.why), dFrac.why.slice(0, 190));
        const D = lodThresholdsFor(R2.record, { policy: FRAME(COST_PIXELS) });
        ok(`*** AND WITH AN ABSOLUTE BUDGET THE THRESHOLDS ARE DERIVED, NOT TYPED: at a stated ${COST_PIXELS} pixels of the frame the ladder comes out at ${D.thresholds ? D.thresholds.map((x) => x.toPrecision(3)).join(", ") : "NOTHING"} ***`,
            !!D.thresholds && D.ordered && D.thresholds.length === 2,
            D.thresholds ? D.per.map((p) => `rung ${p.rung}: ${p.why}`).join(" | ") : D.why);
        if (D.thresholds) {
            ok(`  and they are a long way from the typed pair v4373 used (0.055, 0.03): ${D.thresholds.map((x, i) => (x / [0.055, 0.03][i]).toFixed(2) + "x").join(" and ")}`,
                D.thresholds.every((x) => x > 0), `derived ${D.thresholds.map((x) => x.toPrecision(3)).join(", ")} against typed 0.055, 0.03 -- the typed pair was chosen to exercise the ladder in a gate, and this is what the policy actually asks for`);
            const cost = (a2, b2) => { let ch = 0, cov = 0;
                for (let i = 0; i * 4 < a2.length; i++) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a2[i * 4 + c] - b2[i * 4 + c]));
                    if (d) ch++; if (a2[i * 4] + a2[i * 4 + 1] + a2[i * 4 + 2] > 24) cov++; }
                return { changed: ch, covered: cov, cost: cov ? ch / cov : Infinity }; };
            const full = Uint8ClampedArray.from(R2.full.pix), typed = Uint8ClampedArray.from(R2.typed.pix);
            const cTyped = cost(full, typed);
            ok(`  and the TYPED pair, measured in the units the policy is stated in: ${cTyped.changed} pixels against rung 0 everywhere over 96 instances, ${(100 * cTyped.changed / (COST_PIXELS * 96)).toFixed(1)}% of the ${COST_PIXELS * 96} the policy allows`,
                cTyped.covered > 1000 && cTyped.changed > 0,
                `regions at the typed pair: ${R2.typed.counts.join(" / ")}, at rung 0 everywhere: ${R2.full.counts.join(" / ")}. Reporting it as ${(100 * cTyped.cost).toFixed(2)}% of covered pixels would be the scale-invariant measure this round just discarded, and it is not repeated here`);
            // AND DRIVE WITH THE DERIVED PAIR. The derivation is node-side and the renderer is in the page, so the
            // record crosses out and the thresholds cross back in: a second harness call parameterised by the first
            // one's answer. A round that derived a number and never drove with it would be an argument.
            const r3 = await runInEngineOrigin({ engineRoot: ENG, args: { W, BUDGETS: [24, 10, 5], TH: D.thresholds }, script: `async (a) => {
                const THREE = await import("/vendor/three-webgpu/three.webgpu.js");
                const B = await import("/render/img2three.mjs"); const G = await import("/render/gpuDriven.mjs"); const F = await import("/render/fleets.mjs"); const { requestDevice } = await import("/gfx/device.js");
                const make = (seg) => { const root = new THREE.Group();
                    root.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, seg, Math.max(3, seg >> 1)), new THREE.MeshPhysicalMaterial({ color: 0x2b6fb0 })));
                    const arm = new THREE.Group(); arm.position.set(0.5, 0.18, 0); arm.rotation.set(0.25, 0.6, 0.1); root.add(arm);
                    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.5, seg), new THREE.MeshStandardMaterial({ color: 0xf4c531 })); knob.rotation.z = 0.7; arm.add(knob);
                    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, Math.max(3, seg >> 1), seg), new THREE.MeshStandardMaterial({ color: 0x27ae60 }));
                    ring.position.set(-0.35, -0.2, 0.15); ring.rotation.x = 0.9; root.add(ring); root.updateMatrixWorld(true); return root; };
                const L = B.buildLadder(make, a.BUDGETS);
                const cv = document.createElement("canvas"); cv.width = a.W; cv.height = a.W;
                const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
                const look = F.LOOKS.lit, buffers = G.layoutBuffers(look.layout);
                const COUNT = 96, RAD = 0.5;
                const records = new Float32Array(COUNT * 4);
                for (let i = 0; i < COUNT; i++) { const x = (i % 8) - 3.5, y = (Math.floor(i / 8) % 4) - 1.5, z = -1 - Math.floor(i / 32) * 7;
                    records.set([x, y, z, RAD], i * 4); }
                const cam = { viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 200), G.lookAt([0, 0, 7], [0, 0, 0])), eye: [0, 0, 7] };
                const at = async (th) => { const sc = G.makeGpuDrivenScene(dev, { fleets: [{ name: "gen", look: "lit", layout: look.layout,
                        pipeline: { shaders: look.shaders, vs: "vs", fs: "fs", buffers, uniforms: look.uniforms },
                        pickPipeline: { shaders: look.pick, vs: "vs", fs: "fs", buffers, uniforms: [{ name: "viewProj", type: "mat4" }] },
                        lods: L.rungs.map((r4, i) => ({ name: "lod" + i, mesh: r4.mesh })), bind: (pass) => pass.uniform("light", F.LIGHT) }],
                        fleetOf: new Uint32Array(COUNT), thresholds: th, records, cap: COUNT });
                    return { pix: Array.from((await sc.frame({ ...cam, read: true, clear: [0.03, 0.03, 0.03, 1] }).pixels).pixels), counts: await sc.readCounts() }; };
                return { full: await at([1e-9, 1e-10]), derived: await at(a.TH), count: COUNT };
            }` });
            if (r3.ok && r3.result && r3.result.derived) {
                const fullD = Uint8ClampedArray.from(r3.result.full.pix), drv = Uint8ClampedArray.from(r3.result.derived.pix);
                const cD = cost(fullD, drv), budget = COST_PIXELS * r3.result.count;
                ok(`*** AND THE DERIVED PAIR IS DRIVEN, NOT JUST DERIVED: ${r3.result.count} instances at ${D.thresholds.map((x) => x.toPrecision(3)).join(", ")} cost ${cD.changed} pixels against rung 0 everywhere, inside the ${budget} the stated policy allows (${COST_PIXELS} per instance) with ${(100 * cD.changed / budget).toFixed(1)}% of it spent ***`,
                    cD.changed > 0 && cD.changed <= budget && r3.result.derived.counts.some((c2) => c2 > 0),
                    `regions at the derived pair ${r3.result.derived.counts.join(" / ")} against ${r3.result.full.counts.join(" / ")} at rung 0 everywhere; the typed pair spent ${cTyped.changed}. The per-rung pricing is one instance at one angular size, and this is 96 of them at once -- a bound assembled from parts and then MEASURED whole, which is the only way to find out it holds`);
            } else ok("the derived pair was driven", false, r3.ok ? JSON.stringify(r3.result).slice(0, 200) : (r3.reason || (r3.pageErrors || []).join("; ")));
        }
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4374 (the policy):
//   AW the fail-closed dropped from lodThresholdsFor, so a ladder with one underivable rung returns numbers anyway
//      -> exit=1, 2 red: the refusal AND the lodThresholdsOr check, because a caller's typed floor is only reachable
//      when the derivation admits it could not answer. Half-derived is the shape a typed number hides in.
//   AX the policy's MODE ignored, so an absolute budget of 64 is compared against a fraction -> exit=1, 1 red: the
//      absolute derivation stops deriving. 64 read as a fraction is a budget of 6400% and everything is under it,
//      which would have returned the LARGEST metric measured as a bound -- a number, confidently, meaning nothing.
// MEASURED at v4373.
//   AU each rung normalised to its OWN bounds instead of rung 0's -> exit=1, 2 red, and the SECOND one is the
//      interesting half: the framing check goes, as it should, and so does the mask-regime finding in section 3 --
//      with every rung scaled back up to the same box the coarse ones never fall under the coverage threshold, so
//      the artefact this round measured stops existing. A dishonest framing does not just mis-score the model; it
//      hides the conditions under which the judge stops working.
//   AV the custom cull's per-frame uniforms never written (the scene writes its own buffer instead, which the
//      generated pass is not bound to) -> exit=1, 2 red: the picture parts on 6,859 pixels and the regions empty
//      out. The hook's write() is what makes a pass with a different binding shape drivable at all, and this is the
//      measurement that says so rather than the argument.
//   AND ONE SABOTAGE THAT WAS MALFORMED AND IS LOGGED AS SUCH: the first attempt at AU commented out the rest of the
//      line it edited, so the gate CRASHED (exit 1, zero red) instead of failing a check. A crash is not a red, and
//      reading it as one would have credited the check with catching something it never saw.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: whether 64 pixels is the RIGHT budget, which is a judgement about eyes and displays this tree cannot " +
    "make and has therefore put in one place instead of five; whether the derived pair holds at a camera or a subject it was not " +
    "priced at -- the record is one model on one screen size, and a threshold derived from it is honest only about that; the shipped " +
    "pages, which still carry typed thresholds (0.012 in orrery-gpu.html, [0.004, 0.012] in universe-gpu.html, [0.025, 0.04] in " +
    "gpu-rig-check.html) and are not rewired by this round; the ladder against a real img2threejs factory, whose Quality levels this " +
    "stands in for and which is not vendorable; the occlusion variant, refused by the hook rather than supported; the fleets variant " +
    "driving a scene; and every number the rig has not signed.");
process.exit(fails ? 1 : 0);
