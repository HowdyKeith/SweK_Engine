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
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { buildLadder, ladderInvariants, unitMesh } from "../../render/img2three.mjs";
import * as DE from "../../render/divineEye.mjs";

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

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4373.
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
console.log("unchecked here: whether the thresholds section 3 prices should be DERIVED from that curve, which needs a policy " +
    "(how many pixels a rung may cost) that nobody has stated; the ladder against a real img2threejs factory, whose Quality " +
    "levels this stands in for and which is not vendorable; the occlusion variant, refused by the hook rather than supported; " +
    "the fleets variant driving a scene, which the graph supports and this section does not exercise; and every number the rig " +
    "has not signed.");
process.exit(fails ? 1 : 0);
