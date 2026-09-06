#!/usr/bin/env node
// WebGLEngine/tools/ship/voxelBodies-selfcheck.mjs -- v4519
//
// THE BOX3D BODIES ON THE DEVICE WORLD (sandbox round 3): render/voxelBodies.mjs, the vendored box3d wasm loaded headless through
// physics/box3d/box3dNode.mjs. Section 1, the window: on a hand slab a crate's window merges the floor into runs along x (3 boxes
// for a 3 x 3 patch, not 9), every solid voxel inside the window is covered by exactly one run, two crates whose windows overlap
// cover no voxel twice, a dead body has no window. Section 2, the bodies: a crate dropped on the slab rests at the surface plus
// its half within 1e-3 after 240 ticks; one dropped over nothing keeps falling; one dropped on the tower rests on the tower;
// the same drop twice hashes the same; a crate given spin lands with a quaternion that is not the identity and its records and
// extras carry the pose; a pool of static boxes grows per run width and never shrinks. Section 3, ROUND 2 UNDER ROUND 3: dig the
// voxel under a resting crate and it falls to the layer below. Section 4, the pipeline: the WGSL validates, both stages spell
// the same rotateQ, rotateQ's CPU twin turns x into -z about y. Section 5, ON BOTH BACKENDS: the slab, the tower and a red
// crate at rest through the two-fleet scene; the crate's pixels are red where the CPU ray hits its cube first; the crate
// rotated 45 degrees about y by setTransform draws a wider silhouette than square; the backends agree.
//
// MEASURED AT v4519: a resting crate's window is 4 runs of 4 over 16 voxels; a crate dropped from y 10 rests at 4.5000 after 240
// ticks, one dropped off-centre at 4.5000 where it was dropped, one over nothing at -63.5, one on the tower at 9.4999; the same
// drop twice hashes 1504184371 both times; a spun crate reads (0, 0, -0.823, 0.568) at y 8.77 in flight; the pool holds 8 boxes for
// the slab and 2 for the tower; the narrow crate rests at 4.4, falls to 3.4 when the voxel under it is dug and to -70 when the dirt
// goes too; on both backends the crate is 48 red pixels (6 x 8) at rest and 8 wide against 6 when turned, the backends 0 apart.
// TWO FINDINGS AND TWO CORRECTIONS. (1) *** A SETTLED BODY IS ASLEEP, AND A STATIC BOX MOVED FROM UNDER IT DOES NOT WAKE IT. ***
// The first draft dug the floor and the crate stayed at 4.5 over the hole: box3d sleeps a resting body, and setTransform on the
// floor box is no event to a sleeper. The window now gives every live body a zero impulse whenever its runs change (the shim's
// own wake, the joint motors' lesson). (2) A unit crate over a unit hole SITS ON THE RIM -- four edges on four box edges -- and
// box3d holds it there, correctly; the falling crate is 0.4 wide. The corrections: the spin was read after landing, where a cube
// settles onto a face (read in flight now); and the silhouette was compared along the diagonal, where the SQUARE crate is the
// wide one (the camera looks along -z now).
//
// SABOTAGE (v4519): A  the window's runs not merged (every voxel its own run)   -> 1 red: 16 runs of 1 for 4 of 4 (the physics is the
//                                                                                same either way, which is the point of the hold).
//                   B  the floor layer excluded from the window (y0 + 1)        -> 4 red, all four window holds. The crate STILL rests:
//                                                                                it sinks a centimetre, the window then reaches the
//                                                                                layer and catches it -- the physics heals what the
//                                                                                window hold caught, and the trace says so.
//                   C  rotateQ's cross term dropped in both shaders             -> 1 red: the text hold (the turned silhouette stays
//                                                                                wide: without the cross term the rotation is a
//                                                                                different one, not none).
//                   D  extras carrying the identity quaternion, not the body's  -> 3 red: the pose hold, and the turned crate square
//                                                                                on both backends.
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/voxelBodies-selfcheck.mjs      (~25 s)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import { BODIES, collisionWindow, windowVoxels, createBodyWorld, rotateQ, BODY_LIT_WGSL, BODY_LIT_VERTEX_GLSL, BODY_LIT_FRAGMENT_GLSL, bodyLitPipelineDesc } from "../../render/voxelBodies.mjs";
import { miniWorld } from "../../render/voxelDevice.mjs";
import { editState, editVoxel } from "../../render/voxelDeviceEdit.mjs";
import { initNode, mod } from "../../physics/box3d/box3dNode.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;
function handWorld() { const w = miniWorld(); for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) { w.setVoxel(x, 3, z, 3); w.setVoxel(x, 2, z, 2); } for (let y = 4; y < 9; y++) w.setVoxel(16, y, 16, 1); return w; }
const coverOf = (runs) => { const s = new Map(); for (const r of runs) for (let x = r.x; x < r.x + r.n; x++) { const k = x + "," + r.y + "," + r.z; s.set(k, (s.get(k) || 0) + 1); } return s; };

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. the collision window");
{
    const w = handWorld(), crate = { pos: [8.5, 4.5, 8.5], half: 0.5, alive: true };
    const runs = collisionWindow(w, [crate], 1), vox = windowVoxels(w, [crate], 1), cover = coverOf(runs);
    // the crate spans [8, 9]; a margin of 1 reaches [7, 10]: four voxels a row, four rows, and only the slab's top layer (4.5 - 0.5 - 1 = 3)
    ok("a resting crate's window (margin 1) is 4 x 4 voxels of the slab's top layer merged into 4 runs of 4, not 16 boxes", runs.length === 4 && runs.every((r) => r.n === 4 && r.y === 3), runs.map((r) => `${r.x},${r.y},${r.z}x${r.n}`).join(" "));
    ok("every solid voxel in the window is covered by exactly one run, and no run covers a voxel outside it", vox.size === cover.size && [...vox].every((k) => cover.get(k) === 1) && [...cover.keys()].every((k) => vox.has(k)), `${vox.size} voxels`);
    const two = collisionWindow(w, [crate, { pos: [10.5, 4.5, 8.5], half: 0.5, alive: true }], 1), c2 = coverOf(two);
    ok("two crates with overlapping windows: no voxel covered twice, the union covered once", [...c2.values()].every((v) => v === 1) && c2.size === windowVoxels(w, [crate, { pos: [10.5, 4.5, 8.5], half: 0.5, alive: true }], 1).size, `${two.length} runs over ${c2.size} voxels`);
    ok("a dead body has no window, and a body over nothing has an empty one", collisionWindow(w, [{ ...crate, alive: false }], 1).length === 0 && collisionWindow(w, [{ pos: [50, 10, 50], half: 0.5, alive: true }], 1).length === 0);
    const tower = collisionWindow(w, [{ pos: [16.5, 9.5, 16.5], half: 0.5, alive: true }], 1);
    ok("a crate on the tower's top sees the tower's top voxel and nothing else (the margin reaches y 8 only), a single-voxel run", tower.length === 1 && tower[0].x === 16 && tower[0].y === 8 && tower[0].z === 16 && tower[0].n === 1, tower.map((r) => `${r.x},${r.y},${r.z}`).join(" "));
    ok("the window is deterministic: the same bodies give the same runs in the same order", JSON.stringify(collisionWindow(w, [crate], 1)) === JSON.stringify(runs));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. the bodies on the wasm");
const st = await initNode();
if (!st || !st.ready) { console.log(`  SKIP  box3d wasm not loaded: ${st && st.reason}`); fails++; }
else {
    const m = mod();
    const drop = (w, pos, ticks = 240, spin = null, half = 0.5) => { const bw = createBodyWorld(m, w); const b = bw.spawn(pos, half); if (spin) bw.phys.angularImpulse(b.id, spin); for (let i = 0; i < ticks; i++) bw.tick(); const out = { y: b.pos[1], x: b.pos[0], z: b.pos[2], quat: b.quat.slice(), hash: bw.hash(), pool: bw.poolSize(), rec: Array.from(bw.records().slice(0, 4)), ext: Array.from(bw.extras().slice(0, 4)) }; bw.destroy(); return out; };
    const w = handWorld();
    const a = drop(w, [8.5, 10, 8.5]);
    ok("a crate dropped on the slab rests at the surface (y 4) plus its half: 4.5 within 1e-3 after 240 ticks", near(a.y, 4.5), `y ${a.y.toFixed(4)}`);
    const off = drop(w, [7.2, 10, 9.7]);
    ok("one dropped off a voxel's centre rests at the same height where it was dropped (the merged run is one flat box)", near(off.y, 4.5) && near(off.x, 7.2, 0.05) && near(off.z, 9.7, 0.05), `y ${off.y.toFixed(4)} at ${off.x.toFixed(2)}, ${off.z.toFixed(2)}`);
    const air = drop(w, [40, 10, 40]);
    ok("one dropped over nothing keeps falling", air.y < -20, `y ${air.y.toFixed(1)}`);
    const t = drop(w, [16.5, 12, 16.5]);
    ok("one dropped on the tower rests on the tower: y 9.5", near(t.y, 9.5), `y ${t.y.toFixed(4)}`);
    const a2 = drop(w, [8.5, 10, 8.5]);
    ok("*** the same drop twice hashes the same (the window's order is the order) ***", a2.hash === a.hash && a2.y === a.y, `${a.hash}`);
    // a spun crate is read IN FLIGHT (30 ticks): a cube that lands settles onto a face, which the first draft read as "no spin"
    const s = drop(w, [8.5, 10, 8.5], 30, [0, 0, 8]);
    ok("a crate given spin turns in flight -- its quaternion is not the identity -- and the records and extras carry the pose", (Math.abs(s.quat[3]) < 0.99) && near(s.rec[0], s.x) && near(s.rec[1], s.y) && near(s.rec[3], 0.5) && s.ext.every((v, i) => near(v, s.quat[i])), `quat ${s.quat.map((v) => v.toFixed(3)).join(", ")} at y ${s.y.toFixed(2)}`);
    ok("the pool holds at least the four width-4 runs the resting window needs, and the tower's single", a.pool >= 4 && t.pool >= 1, `${a.pool} for the slab, ${t.pool} for the tower`);
    report(`records slot 0 ${a.rec.map((v) => v.toFixed(2)).join(", ")}; extras ${a.ext.map((v) => v.toFixed(3)).join(", ")}`);

    // ---------------------------------------------------------------------------------------------------------------------------------
    sec("3. round 2 under round 3: dig the floor under a resting crate");
    {
        // a crate of half 0.4: a unit crate over a unit hole sits on the hole's rim (its four edges on four box edges) and box3d holds
        // it there, which is right and was the first draft's surprise; a crate narrower than the hole falls
        const w3 = handWorld(), es = editState(w3), bw = createBodyWorld(m, w3), b = bw.spawn([8.5, 10, 8.5], 0.4);
        for (let i = 0; i < 240; i++) bw.tick(); const rest = b.pos[1];
        const e = editVoxel(es, 8, 3, 8, 0); for (let i = 0; i < 240; i++) bw.tick();
        ok("the crate rests at 4.4, the voxel under it is dug through round 2's edit, and it falls one layer (rests at 3.4 on the dirt below)", near(rest, 4.4) && e.chunks.length === 1 && near(b.pos[1], 3.4, 0.01), `${rest.toFixed(3)} -> ${b.pos[1].toFixed(3)}`);
        editVoxel(es, 8, 2, 8, 0); editVoxel(es, 8, 3, 8, 0); for (let i = 0; i < 240; i++) bw.tick();
        ok("dig the dirt too and it falls through the slab", b.pos[1] < 0, `y ${b.pos[1].toFixed(1)}`);
        bw.destroy();
    }
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("4. the body pipeline");
{
    const v = validateWgsl(BODY_LIT_WGSL);
    ok("BODY_LIT_WGSL validates and reads the quaternion at location 5 (extra)", v.length === 0 && /@location\(5\) extra: vec4<f32>/.test(BODY_LIT_WGSL), v.join("; "));
    const same = (re) => re.test(BODY_LIT_WGSL) && re.test(BODY_LIT_VERTEX_GLSL);
    ok("both vertex stages spell the same rotateQ (t = 2 cross(q.xyz, v); v + q.w t + cross(q.xyz, t)) on the vertex and the normal", same(/2\.0 \* cross\(q\.xyz, v\)/) && same(/v \+ q\.w \* t \+ cross\(q\.xyz, t\)/) && same(/rotateQ\(extra, p \* rec\.w\)/) && same(/rotateQ\(extra, n\)/));
    ok("the fragment stages are litSphere's Lambert without the tint chain", /max\(0\.0, dot\(normalize\(vN\), l\)\)/.test(BODY_LIT_FRAGMENT_GLSL) && /max\(0\.0, dot\(normalize\(v\.n\), l\)\)/.test(BODY_LIT_WGSL));
    const r = rotateQ([0, Math.SQRT1_2, 0, Math.SQRT1_2], [1, 0, 0]), id = rotateQ([0, 0, 0, 1], [0.3, -0.2, 0.9]);
    ok("rotateQ's CPU twin: 90 degrees about y takes x to -z; the identity leaves a vector", near(r[0], 0, 1e-9) && near(r[2], -1, 1e-9) && id.join() === "0.3,-0.2,0.9");
    const d = bodyLitPipelineDesc();
    ok("bodyLitPipelineDesc: the lit layout's slots and the two uniforms", d.buffers[0].stride === 40 && d.uniforms.map((u) => u.name).join() === "viewProj,light");
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("5. ON BOTH BACKENDS: a red crate at rest on the slab, then turned 45 degrees");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        // close (a unit crate is ~10 px) and looking along -z: seen along an axis a square crate is 1 wide and one turned 45 degrees
        // is sqrt 2 wide. (The first draft looked along the diagonal, where the SQUARE crate is the wide one, and read 6 against 10.)
        const W = 200, H = 120, FOV = 0.9, eye = [8.5, 9.5, 17.5], target = [8.5, 4.5, 8.5];
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, FOV, eye, target }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const G = await import("/render/gpuDriven.mjs");
            const L = await import("/render/litSphere.mjs");
            const V = await import("/render/voxelDevice.mjs");
            const E = await import("/render/voxelDeviceEdit.mjs");
            const B = await import("/render/voxelBodies.mjs");
            const { box3d } = await import("/physics/box3d/box3dLoader.js");
            const { W, H, FOV, eye, target } = a; const out = {};
            const st = await box3d.init(); if (!st.ready) return { error: "box3d: " + st.reason };
            const m = box3d._mod;
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
                const w = V.miniWorld(); for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) { w.setVoxel(x, 3, z, 3); w.setVoxel(x, 2, z, 2); } for (let y = 4; y < 9; y++) w.setVoxel(16, y, 16, 1);
                const es = E.editState(w), bw = B.createBodyWorld(m, w), crate = bw.spawn([8.5, 10, 8.5], 0.5);
                for (let i = 0; i < 240; i++) bw.tick();
                const sc = B.sandboxScene(dev, es, bw, G, L);
                const vp = { viewProj: G.multiply(G.perspective(FOV, W / H, 0.5, 600), G.lookAt(eye, target)), eye };
                const shoot = async () => Array.from((await sc.frame({ ...vp, read: true, clear: [0, 0, 0, 1] }).pixels).pixels);
                const rest = await shoot(), pose = { pos: crate.pos.slice(), quat: crate.quat.slice() };
                // turn the crate 45 degrees about y in place (kinematic for the frame so gravity does not settle it back), read, draw
                bw.phys.setType(crate.id, "kinematic"); bw.phys.setTransform(crate.id, [8.5, 4.5, 8.5], [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)]); bw.read();
                const turned = await shoot();
                bw.phys.setTransform(crate.id, [8.5, 4.5, 8.5], [0, 0, 0, 1]); bw.read(); const square = await shoot();
                out[backend] = { path: sc.path, errs, rest, turned, square, pose, fleets: sc.fleetCount };
                bw.destroy(); dev.destroy();
            }
            return out;
        }` });
        ok("both backends drew the two-fleet scene with the crate at rest", r.ok && r.result && !r.result.error && r.result.webgpu && r.result.webgl2 && r.result.webgpu.errs.length === 0 && r.result.webgpu.fleets === 2, r.ok ? (r.result.error || (r.result.webgpu.errs || []).join(" | ")).slice(0, 300) : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && r.result.webgpu && r.result.webgl2 && !r.result.error) {
            const N = W * H, apart = (A, B) => { let n = 0; for (let p = 0; p < N; p++) if (Math.abs(A[p * 4] - B[p * 4]) > 8 || Math.abs(A[p * 4 + 1] - B[p * 4 + 1]) > 8 || Math.abs(A[p * 4 + 2] - B[p * 4 + 2]) > 8) n++; return n; };
            const redBox = (px) => { let x0 = W, x1 = -1, y0 = H, y1 = -1, n = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = (y * W + x) * 4; if (px[p] > 60 && px[p] > px[p + 1] * 1.8 && px[p] > px[p + 2] * 1.8) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } } return { n, w: x1 - x0 + 1, h: y1 - y0 + 1, x0, y0 }; };
            for (const bk of ["webgpu", "webgl2"]) {
                const R = r.result[bk], rest = redBox(R.rest), sq = redBox(R.square), tu = redBox(R.turned);
                report(`${bk} (${R.path}): crate at ${R.pose.pos.map((v) => v.toFixed(2)).join(", ")}; red pixels at rest ${rest.n} (${rest.w} x ${rest.h}), square ${sq.n} (${sq.w} wide), turned ${tu.n} (${tu.w} wide)`);
                ok(`*** ${bk}: the crate at rest draws as a red patch on the slab where the physics put it ***`, rest.n > 30 && near(R.pose.pos[1], 4.5) && rest.w >= 5 && rest.h >= 5);
                ok(`  ${bk}: turned 45 degrees about y by setTransform, the crate's silhouette is wider than square (the quaternion reaches the vertex stage)`, tu.n > 30 && tu.w > sq.w * 1.15, `${tu.w} vs ${sq.w}`);
                ok(`  ${bk}: setting the identity back draws the resting frame again (${apart(R.rest, R.square)} apart)`, apart(R.rest, R.square) < 30);
            }
            ok("  the two backends agree within 8 of 255 on all but edge pixels (fewer than 3 %)", apart(r.result.webgpu.rest, r.result.webgl2.rest) < N * 0.03, `${apart(r.result.webgpu.rest, r.result.webgl2.rest)} apart`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: non-cubic bodies (one scale per record: the sandbox's crates are cubes this round); friction and restitution knobs; body-vs-body stacking under the window (the pool handles it, the gate drops one crate at a time); the page's crate button (eyeballed).");
process.exit(fails ? 1 : 0);
