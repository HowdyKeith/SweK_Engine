#!/usr/bin/env node
// WebGLEngine/tools/ship/carveGpu-selfcheck.mjs -- v4372
//
// GRADES render/carveTsl.mjs: the silhouette carve as a TSL compute pass, against mesh/carve.mjs.
//
// tools/ship/carve-selfcheck.mjs closed by naming its own next step -- "the carve is n^3 per view in JavaScript,
// which is a compute pass wanting to happen and is not one yet". This is it: one invocation per voxel, the views
// looped inside the kernel so the grid is read and written once instead of once per view, transplanted into a
// gfx/device.js compute module by render/tslSource.mjs.
//
// *** THIS IS NOT THE LEAPFROG'S CLAIM AND IT IS THE HARDER SHAPE. *** v4370 held a TSL graph to a shipped WGSL
// kernel BIT FOR BIT because that kernel is smooth arithmetic: an ulp of disagreement stays an ulp. This pass
// ends in a floor(), which is DISCONTINUOUS. The CPU projects in f64, the device in f32, and a voxel landing
// within an ulp of a pixel boundary can floor into a DIFFERENT PIXEL on the two machines -- at which point it is
// not off by an ulp, it is solid on one and carved on the other. No tolerance expresses that; a voxel is or is
// not. So the twin is mesh/carve.mjs's own f32 mirror (projectF32, Math.fround after every operation, which is
// tools/roundhouse/hmcGpu.mjs's one-implementation-one-knob idiom), and the f32-versus-f64 gap is a separate
// measured number rather than something a threshold swallows.
//
// AND THE MEASUREMENT SAYS THE DISCONTINUITY IS REAL AND DOES NOT PROPAGATE. Over 17.3 million voxel/view pairs,
// 66 of them (0.0004%) floor to a different pixel at f32. NONE of the 66 changes a verdict, because a flip only
// matters when the two candidate pixels DISAGREE IN THE MASK -- and being within an ulp of a PIXEL boundary has
// nothing to do with being near a SILHOUETTE boundary. Two unrelated edges have to coincide, and in 17.3 million
// trials they never did. The f32 mirror is the twin because the flips exist, not because they were seen to bite.
//
// *** AND BUILDING THIS FOUND A DEFECT IN render/tslSource.mjs THAT HAD STOOD SINCE v4336. *** Its write-detector
// asked whether a body contained `<buffer>.value[ ... ] =`, which matches the first `=` of `==`. Every earlier
// pass in this arc bound a storage read to a var before testing it; this one compares inline -- `if (
// masks.value[p] == 0u )` -- and was REFUSED BY NAME: "the pass writes masks and the shell declares it read".
// Nothing ever shipped wrong from it, because it refuses rather than mis-declaring a binding, but it is the
// species versionPreflight's header names: a guard that fires on legitimate work is a guard people route around.
// Section 1 pins both directions and needs no device to do it.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node tools/ship/carveGpu-selfcheck.mjs   (exit 0 all-pass, 1 on any fail; SKIPs count as failures)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { computeShell, transplantCompute } from "../../render/tslSource.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import { silhouetteOf, carve, volumeOf, contains, project, projectF32, turntable } from "../../mesh/carve.mjs";
import { viewRow } from "../../render/carveTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const N = 64, C = N / 2, V = 8, YAWS = turntable(V);
const S = {
    cube:   (i, j, k) => Math.abs(i + 0.5 - C) < 12 && Math.abs(j + 0.5 - C) < 12 && Math.abs(k + 0.5 - C) < 12,
    sphere: (i, j, k) => (i + 0.5 - C) ** 2 + (j + 0.5 - C) ** 2 + (k + 0.5 - C) ** 2 < 144,
    cross:  (i, j, k) => Math.abs(j + 0.5 - C) < 12 && Math.abs(i + 0.5 - C) < 12 && Math.abs(k + 0.5 - C) < 12 && (Math.abs(i + 0.5 - C) < 4 || Math.abs(k + 0.5 - C) < 4),
    cup:    (i, j, k) => { const x = i + 0.5 - C, y = j + 0.5 - C, z = k + 0.5 - C, r2 = x * x + z * z; return Math.abs(y) < 12 && r2 < 144 && !(r2 < 64 && y > -6); },
    tube:   (i, j, k) => { const x = i + 0.5 - C, y = j + 0.5 - C, z = k + 0.5 - C, r2 = x * x + z * z; return Math.abs(y) < 12 && r2 < 144 && !(r2 < 64); },
    wide:   (i, j, k) => Math.abs(i + 0.5 - C) < 28 && Math.abs(j + 0.5 - C) < 12 && Math.abs(k + 0.5 - C) < 28,
};
const gridOf = (f) => Uint8Array.from({ length: N * N * N }, (_, o) => (f(o % N, ((o / N) | 0) % N, (o / (N * N)) | 0) ? 1 : 0));
const SHELL = { name: "carve", workgroupSize: 64,
    storage: [{ name: "grid", element: "u32" }, { name: "masks", element: "u32", access: "read" }, { name: "rows", element: "vec4<f32>", access: "read" }],
    uniforms: [{ name: "info", type: "vec4" }] };

console.log("\n1. *** THE WRITE-DETECTOR READ `==` AS AN ASSIGNMENT FOR THIRTY-SIX ROUNDS (no device needed) ***");
{
    // The two fixture shaders live in tools/ship/carveRoles-fixture.json, NOT inline. A file that spells a
    // shader marker becomes a file render/backendParity.mjs's census counts, and a gate is not a shader-bearing
    // module -- the census went red on this file's first run and said so by name. v4331 made the same decision
    // for tools/ship/tslCompute-fixture.json.
    const FIX = JSON.parse(fs.readFileSync(path.join(ENG, "tools/ship/carveRoles-fixture.json"), "utf8"));
    const mk = (test) => FIX.compare.split("__TEST__").join(test);
    const shell = computeShell({ name: "roles", workgroupSize: 64,
        storage: [{ name: "out", element: "u32" }, { name: "src", element: "u32", access: "read" }], uniforms: [{ name: "info", type: "vec4" }] });
    const rolesOf = (test) => { try { const r = transplantCompute(mk(test), shell); return { reads: r.reads.join(), writes: r.writes.join() }; }
                                catch (e) { return { refusal: String(e.message).slice(0, 120) }; } };
    const eq = rolesOf("== 0u");
    ok('*** a buffer READ inside an `==` is read, not written -- the defect that refused this whole pass by name ***',
        eq.reads === "src" && eq.writes === "out",
        eq.refusal ? "STILL REFUSED: " + eq.refusal : `reads ${eq.reads}, writes ${eq.writes}`);
    for (const t of ["!= 0u", ">= 1u", "<= 1u"]) {
        const r = rolesOf(t);
        ok(`  ...and \`${t}\` too, which the old pattern happened to survive because its operator sits between the ] and the =`,
            r.reads === "src" && r.writes === "out", r.refusal ? "REFUSED: " + r.refusal : `reads ${r.reads}, writes ${r.writes}`);
    }
    // AND THE OTHER DIRECTION: a real assignment must still be detected, or the fix would have traded one fault for a worse one
    const asn = FIX.assign;
    let refused = null;
    try { transplantCompute(asn, shell); } catch (e) { refused = String(e.message); }
    ok("*** and a buffer the pass REALLY writes is still caught: declaring it read is refused by name ***",
        refused !== null && /the pass writes "src"/.test(refused),
        refused ? refused.slice(0, 110) : "NOT REFUSED -- the fix would have traded a false refusal for a silent one, which is worse");
}

console.log("\n2. THE f32 DISCONTINUITY: real, measured, and it does not propagate (no device needed)");
{
    let pairs = 0, flips = 0, propagate = 0;
    const yaws = []; for (let t = 0; t < 64; t++) yaws.push((t * Math.PI) / 64 + 1e-3 * t);
    for (const f of [S.sphere, S.cross, S.tube]) for (const yaw of yaws) {
        const m = silhouetteOf(f, N, { yaw, proj: projectF32 });
        for (let k = 0; k < N; k++) for (let j = 0; j < N; j += 3) for (let i = 0; i < N; i++) {
            const a = project(i + 0.5, j + 0.5, k + 0.5, N, yaw), b = projectF32(i + 0.5, j + 0.5, k + 0.5, N, yaw);
            pairs++;
            const ua = Math.floor(a.u), va = Math.floor(a.v), ub = Math.floor(b.u), vb = Math.floor(b.v);
            if (ua === ub && va === vb) continue;
            flips++;
            const inA = (ua >= 0 && va >= 0 && ua < N && va < N) ? m[va * N + ua] : 0;
            const inB = (ub >= 0 && vb >= 0 && ub < N && vb < N) ? m[vb * N + ub] : 0;
            if (inA !== inB) propagate++;
        }
    }
    ok(`*** the f32 projection really does floor into a different pixel -- ${flips} times in ${pairs.toLocaleString()} voxel/view pairs -- and NOT ONE of them changes a verdict ***`,
        flips > 0 && propagate === 0,
        `${flips} flips (${(100 * flips / pairs).toFixed(4)}%), ${propagate} that would flip a voxel. A flip only bites when the two candidate pixels DISAGREE IN THE MASK, and being within an ulp of a PIXEL boundary has nothing to do with being near a SILHOUETTE boundary -- two unrelated edges have to coincide`);
    report("WHICH IS WHY THE TWIN IS THE f32 MIRROR AND NOT THE f64 CARVE: the flips EXIST, so the claim below is " +
           "written against the arithmetic the device actually does. That it also matches the f64 carve is then a " +
           "MEASUREMENT (section 3) rather than the thing being assumed. If a future fixture ever makes a flip bite, " +
           "the f32 comparison stays exact and only the f64 one moves, which is the right way round.");
}

const skip = webgpuSkipReason();
console.log("\n3. *** THE PASS ON THE DEVICE, AGAINST mesh/carve.mjs, VOXEL FOR VOXEL ***");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const jobs = [];
    for (const [name, f] of Object.entries(S)) {
        const flat = new Uint32Array(V * N * N);
        YAWS.forEach((yaw, v) => { const m = silhouetteOf(f, N, { yaw, proj: projectF32 }); for (let i = 0; i < N * N; i++) flat[v * N * N + i] = m[i]; });
        const rows = new Float32Array(V * 4); YAWS.forEach((y, v) => rows.set(viewRow(y, 0), v * 4));
        jobs.push({ name, flat: [...flat], rows: [...rows], clear: 0 });
        if (name === "wide") jobs.push({ name: "wide/clear", flat: [...flat], rows: [...rows], clear: 1 });
    }
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { n: N, V, jobs, shell: computeShell(SHELL), SHELL }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const C = await import("/render/carveTsl.mjs"); const S2 = await import("/render/tslSource.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = { grids: {} };
        try {
            const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
            const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: false, antialias: false }); await renderer.init();
            const g = C.makeCarvePassTsl(T, { n: a.n, views: a.V });
            await renderer.computeAsync(g.node);
            const emitted = renderer._nodes.getForCompute(g.node).computeShader;
            const gen = S2.transplantCompute(emitted, a.shell);
            out.wgsl = gen.wgsl; out.reads = gen.reads; out.writes = gen.writes;
            // SPECIFIED OPERATIONS ONLY: the four trig values arrive in a buffer, so no vendor transcendental is in play
            out.noTrig = !(new RegExp("\\\\b(cos|sin|tan|exp|log|pow|sqrt|inverseSqrt)\\\\s*\\\\(").test(gen.wgsl));
            const refuse = (fn) => { try { fn(); return null; } catch (e) { return String(e.message).slice(0, 220); } };
            out.refusals = {
                masksWritable: refuse(() => S2.transplantCompute(emitted, S2.computeShell(Object.assign({}, a.SHELL,
                    { storage: a.SHELL.storage.map((s) => (s.name === "masks" ? { name: s.name, element: s.element } : s)) })))),
                gridReadOnly: refuse(() => S2.transplantCompute(emitted, S2.computeShell(Object.assign({}, a.SHELL,
                    { storage: [{ name: "grid", element: "u32", access: "read" }].concat(a.SHELL.storage.slice(1)) })))),
            };
            const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32;
            const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
            const N3 = a.n * a.n * a.n, p = dev.compute({ wgsl: gen.wgsl });
            for (const job of a.jobs) {
                const gb = dev.buffer({ data: new Uint32Array(N3).fill(1), usage: ["storage"] });
                const mb = dev.buffer({ data: new Uint32Array(job.flat), usage: ["storage"] });
                const rb = dev.buffer({ data: new Float32Array(job.rows), usage: ["storage"] });
                const ub = dev.buffer({ data: new Float32Array([job.clear, a.n, a.V, 0]), usage: "uniform" });
                p.bind("grid", gb).bind("masks", mb).bind("rows", rb).bind("u", ub);
                dev.frame(({ pass }) => { pass.dispatch(p, Math.ceil(N3 / 64)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
                const raw = new Uint32Array(await dev.read(gb));
                const bits = new Uint8Array(N3); for (let i = 0; i < N3; i++) bits[i] = raw[i] ? 1 : 0;
                out.grids[job.name] = [...bits];
                gb.destroy(); mb.destroy(); rb.destroy(); ub.destroy();
            }
            out.errs = errs;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 600); }
        return out;
    }` });
    ok("the harness built the graph, transplanted it and ran every fixture on one device",
        r.ok && r.result && !r.result.error && r.result.grids && r.result.grids.cube,
        r.ok ? (r.result && r.result.error) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.error) {
        const F = r.result;
        let d32 = 0, d64 = 0, total = 0, held = 0, fixtures = 0;
        const rows = [];
        for (const [name, f] of Object.entries(S)) {
            const views32 = YAWS.map((yaw) => ({ m: silhouetteOf(f, N, { yaw, proj: projectF32 }), yaw }));
            const a32 = carve(views32, N, { proj: projectF32 });
            const a64 = carve(YAWS.map((yaw) => ({ m: silhouetteOf(f, N, { yaw }), yaw })), N);
            const dev = Uint8Array.from(F.grids[name]);
            let x = 0, y = 0;
            for (let i = 0; i < dev.length; i++) { if (dev[i] !== a32[i]) x++; if (dev[i] !== a64[i]) y++; }
            d32 += x; d64 += y; total += dev.length; fixtures++;
            if (contains(dev, gridOf(f))) held++;
            rows.push(`${name} ${volumeOf(dev, N)}`);
        }
        ok(`*** the DEVICE carve and mesh/carve.mjs's f32 mirror agree on all ${total.toLocaleString()} voxels across ${fixtures} fixtures -- 0 differing, not a tolerance ***`,
            d32 === 0 && total === fixtures * N * N * N && (F.errs || []).length === 0,
            `${d32} differing of ${total.toLocaleString()}; device hulls ${rows.join(", ")}; device errors ${(F.errs || []).length}`);
        ok(`  and it agrees with the f64 carve too, on the same ${total.toLocaleString()} voxels -- which section 2 says is a measurement rather than a given`,
            d64 === 0, `${d64} differing. 66 pixel flips exist in 17.3 million pairs and none of them lands where it would matter`);
        ok(`  and the BOUND survives the crossing: the device's hull contains the object on all ${fixtures} fixtures`,
            held === fixtures, `${held}/${fixtures} contained -- the one guarantee the technique has, checked on the hardware and not only in the mirror`);
        ok("SPECIFIED OPERATIONS ONLY: the generated module carries no transcendental, because the four trig values arrive in a buffer",
            F.noTrig === true && validateWgsl(F.wgsl).length === 0 && !/NodeBuffer_|object\./.test(F.wgsl) && F.reads.join() === "masks,rows" && F.writes.join() === "grid",
            `${validateWgsl(F.wgsl).join("; ") || "validates"}; reads ${F.reads.join()}, writes ${F.writes.join()}. three's cos() against SwiftShader's cos() is not a thing this tree has measured, and it does not have to be`);
        ok("REFUSED by name: a shell that lets the pass write its masks, and one that declares the grid read-only",
            /declares "masks" read_write and the pass never writes it/.test(F.refusals.masksWritable || "") &&
            /the pass writes "grid" and the shell "carve" declares it read/.test(F.refusals.gridReadOnly || ""),
            `${(F.refusals.masksWritable || "NOT REFUSED").slice(0, 80)} | ${(F.refusals.gridReadOnly || "NOT REFUSED").slice(0, 80)}`);

        // *** v4371's FINDING, REPRODUCED ON HARDWARE. *** The out-of-frame policy is a uniform here, so the
        // device can be asked the same question the CPU was, and it must give the same wrong answer.
        const wf = S.wide, views32 = YAWS.map((yaw) => ({ m: silhouetteOf(wf, N, { yaw, proj: projectF32 }), yaw }));
        const cpuClear = carve(views32, N, { proj: projectF32, outside: "clear" });
        const devClear = Uint8Array.from(F.grids["wide/clear"]);
        let dc = 0; for (let i = 0; i < devClear.length; i++) if (devClear[i] !== cpuClear[i]) dc++;
        const truth = gridOf(wf);
        ok(`*** and v4371's out-of-frame finding reproduces on the device: with outside:"clear" the hull comes back ${((volumeOf(devClear, N) - volumeOf(wf, N)) / volumeOf(wf, N) * 100).toFixed(1)}% and STOPS containing the object, exactly as the CPU says ***`,
            dc === 0 && contains(devClear, truth) === false && contains(cpuClear, truth) === false && contains(Uint8Array.from(F.grids.wide), truth),
            `${dc} voxels differing from the CPU's clear carve; device contains=${contains(devClear, truth)}, CPU contains=${contains(cpuClear, truth)}, and the same fixture under the KEEP default contains=${contains(Uint8Array.from(F.grids.wide), truth)}`);
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. Every number below was produced by running it.
//   A  the `=(?!=)` fix reverted in render/tslSource.mjs, back to the pattern that stood from v4336 -> exit=1,
//      2 red: section 1's unit check names it with no device involved, and section 3 cannot even transplant --
//      "the pass writes masks and the shell declares it read". The defect this round found, held by the gate that
//      found it, at both the unit and the whole-pass level.
//   B  the turntable spin half-done: rx = dx*cy with the dz*sy term dropped -> exit=1, 3 red and 133,352 of
//      1,572,864 voxels differing. The loud one, and it is the less interesting of the two below.
//   C  the view stride dropped from the mask index, so every view reads view 0's mask -> exit=1, 4 red and only
//      17,128 voxels differing -- ONE EIGHTH OF SABOTAGE B'S DAMAGE, AND IT BREAKS THE GUARANTEE B LEAVES INTACT:
//      containment falls to 3 of 6 fixtures. Reading the wrong mask carves material no view ever called empty,
//      which is precisely why the bound is asserted separately from the agreement instead of being assumed to
//      follow from it. A smaller number that matters more.
//   D  the out-of-frame policy inverted, so "keep" clears and "clear" keeps -> exit=1, 4 red, 5,472 voxels
//      differing and containment at 5 of 6. The smallest difference of the four and still a broken bound -- and
//      it is v4371's finding arriving from the other side: that round measured the policy wrong on the CPU, and
//      this one shows the same choice is load-bearing once it crosses to a device.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER ANY OF THIS IS FASTER. The sandbox's device is SwiftShader, a software " +
    "rasteriser, so a timing taken here would measure a CPU pretending to be a GPU and would say nothing about the " +
    "hardware this pass exists for. The n^3-per-view cost that motivated the round is therefore still an argument " +
    "and not a measurement, and it stays that way until the rig signs one. Also unchecked: a real GPU's f32 against " +
    "SwiftShader's -- section 2's 66 flips are this device's, and a vendor that rounds the projection differently " +
    "would move them, though it cannot move the bound; a grid too big for one buffer, since n=64 is 1 MB of u32 and " +
    "n=256 would be 64 MB; and the segmentation problem, which mesh/carve.mjs's own gate names and this one inherits " +
    "unchanged -- every mask here is still computed from a solid the tree defines.");
process.exit(fails ? 1 : 0);
