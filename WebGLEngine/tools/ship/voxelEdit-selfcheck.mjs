#!/usr/bin/env node
// WebGLEngine/tools/ship/voxelEdit-selfcheck.mjs -- v4518
//
// DIG AND BUILD ON THE DEVICE WORLD (sandbox round 2): render/voxelDeviceEdit.mjs. Section 1, headless on a hand world (a 32 x 32
// two-layer slab and a stone tower on a chunk corner, four chunks): the slots are contiguous, multiples of 3, at least MIN_SLOT,
// their tails zero; the interleaved buffer is float for float what gpuDriven's packMeshes makes of the same mesh (THE TWIN); an
// edit's affected set is 1 chunk inside, 2 at a seam, 4 at a corner; digging the tower's top rewrites exactly the four corner
// slots to what a fresh pack of the edited world holds, byte for byte, and leaves every other float alone; a no-change edit and
// one outside the height are refused by name; a pick through a pixel finds the tower and buildAt places across the hit face;
// a chunk that outgrows its slot repacks the world and says so; an edit on the real 225-chunk world costs under 60 ms.
// Section 2, ON BOTH BACKENDS: the hand world drawn; the tower's top dug through a pixel the browser picks; the frame after the
// slot write equals a FULL rebuild of the edited world (99.5 % within 8) and differs from the frame before; a build across the
// face equals its full rebuild the same way; the backends agree.
//
// MEASURED AT v4518: the hand world is 4 slots of 258 vertices (36 / 36 / 36 / 72 used); the interleaved buffer is 10,320 floats, float
// for float packMeshes' own; a corner dig rewrites 4 slots in 11 ms here and 15 / 7 ms in the browser (WebGPU / WebGL2); a flood of 512
// isolated voxels into one chunk repacks the world 6 times (the grown slot doubles: 258 -> 20,664); on the real 225-chunk world
// (686,301 vertex slots) an interior edit rewrites 1 slot and a corner one 4 in 11 ms; on both backends the dug frame is 0 pixels from a
// full rebuild and 16 from the frame before, the built frame 0 from its rebuild, and a sand voxel built on the slab (1,002 pixels)
// and dug again returns the frame to EXACTLY the built one. TWO GATE-SIDE CORRECTIONS: the first browser build picked through the
// dug pixel, which now looked past the tower onto the slab (1 chunk, 246 pixels from the twin) -- the new top is found again; and
// the real-world edit hit a voxel that was already stone (0 chunks, 0 ms, the hold passed on nothing) -- it edits above the
// terrain's top now.
//
// SABOTAGE (v4518): A  affectedChunks returning the edit's own chunk only        -> 8 red: the affected sets, the corner dig (1 chunk),
//                                                                                the frames off their full rebuilds on both backends.
//                   B  interleave writing one vertex late                       -> 3 red: a tail no longer zero, the slot and the buffer
//                                                                                off the fresh pack.
//                   C  buildAt placing at the hit instead of across its face    -> 1 red: (16, 8, 16) is not stone again.
//                   D  the slot's tail left uncleared after a shrink            -> 0 RED THE FIRST TIME: no edit in the gate shrank a
//                                                                                chunk (a shorter column has the same quads). A sand
//                                                                                voxel built and dug again was added in both
//                                                                                sections: 3 red (the buffer keeps the stale floats;
//                                                                                11 pixels of stale sand on both backends).
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/voxelEdit-selfcheck.mjs      (~20 s)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { MIN_SLOT, FLOATS, STRIDE, slotCap, interleave, packSlots, splitMesh, affectedChunks, editState, editVoxel, pickVoxel, digAt, buildAt } from "../../render/voxelDeviceEdit.mjs";
import { miniWorld, meshOneChunk } from "../../render/voxelDevice.mjs";
import { packMeshes, LAYOUTS } from "../../render/gpuDriven.mjs";
import { VoxelWorld } from "../../world/world.js";
import { CityGen } from "../../world/CityGen.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);

/** the hand world: a two-layer slab 32 x 32 (grass over dirt at y 2..3) and a stone tower y 4..8 on the corner voxel (16, 16) */
function handWorld() { const w = miniWorld(); for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) { w.setVoxel(x, 3, z, 3); w.setVoxel(x, 2, z, 2); } for (let y = 4; y < 9; y++) w.setVoxel(16, y, 16, 1); return w; }
const sameFloats = (a, b, from = 0, to = a.length) => { for (let i = from; i < to; i++) if (a[i] !== b[i]) return false; return true; };

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. headless: slots, the pack twin, affected chunks, the edits");
{
    const w = handWorld(), st = editState(w);
    ok("four chunks, four slots, contiguous, multiples of 3, at least MIN_SLOT, capacity their sum", st.slots.size === 4 && (() => { let off = 0; for (const s of st.slots.values()) { if (s.offset !== off || s.cap % 3 || s.cap < MIN_SLOT || s.count > s.cap) return false; off += s.cap; } return off === st.capacity; })(), `${[...st.slots.values()].map((s) => s.cap + "/" + s.count).join(" ")}`);
    ok("slotCap: 36 -> 258 (MIN_SLOT rounded to a multiple of 3), 1000 -> 1251 (a quarter more, rounded up)", slotCap(36) === 258 && slotCap(1000) === 1251);
    ok("every slot's tail is zero", (() => { for (const s of st.slots.values()) for (let i = (s.offset + s.count) * FLOATS; i < (s.offset + s.cap) * FLOATS; i++) if (st.vertexData[i] !== 0) return false; return true; })());
    const packed = packMeshes([st.mesh], LAYOUTS.lit);
    ok("*** THE TWIN: the interleaved buffer is float for float what gpuDriven's packMeshes makes of the split mesh, at 40 bytes a vertex ***", packed.stride === STRIDE && packed.vertexData.length === st.vertexData.length && sameFloats(packed.vertexData, st.vertexData), `${st.vertexData.length} floats`);
    ok("splitMesh round-trips: split then interleave gives the same floats", (() => { const m = splitMesh(st.vertexData, st.capacity), back = new Float32Array(st.capacity * FLOATS); for (let i = 0; i < st.capacity; i++) { const o = i * FLOATS; back[o] = m.positions[i * 3]; back[o + 1] = m.positions[i * 3 + 1]; back[o + 2] = m.positions[i * 3 + 2]; back[o + 3] = m.colors[i * 4]; back[o + 4] = m.colors[i * 4 + 1]; back[o + 5] = m.colors[i * 4 + 2]; back[o + 6] = m.colors[i * 4 + 3]; back[o + 7] = m.normals[i * 3]; back[o + 8] = m.normals[i * 3 + 1]; back[o + 9] = m.normals[i * 3 + 2]; } return sameFloats(back, st.vertexData); })());
    ok("affectedChunks: 1 inside a chunk, 2 at a seam, 4 at a corner, 2 one voxel from a seam", affectedChunks(w, 5, 5).length === 1 && affectedChunks(w, 16, 5).length === 2 && affectedChunks(w, 16, 16).length === 4 && affectedChunks(w, 15, 5).length === 2 && affectedChunks(w, 14, 5).length === 1);
    const before = st.vertexData.slice(), r = editVoxel(st, 16, 8, 16, 0);
    ok("digging the tower's top (on the corner) re-meshes the four corner chunks, no rebuild, in a few ms", r.chunks.length === 4 && !r.rebuilt && r.ms < 100, `${r.chunks.join(" ")} in ${r.ms} ms`);
    ok("the world reads air there now", w.voxelAt(16, 8, 16) === 0 && w.voxelAt(16, 7, 16) === 1);
    const fresh = packSlots(w);
    ok("*** every rewritten slot is byte for byte what a fresh pack of the edited world holds ***", [...st.slots.entries()].every(([k, s]) => { const f = fresh.slots.get(k); return f.count === s.count && f.cap === s.cap && sameFloats(st.vertexData, fresh.vertexData, s.offset * FLOATS, (s.offset + s.cap) * FLOATS); }));
    ok("and the whole buffer equals the fresh pack (the caps did not move)", st.capacity === fresh.capacity && sameFloats(st.vertexData, fresh.vertexData));
    // an interior edit: only its own slot changes and every other float is what it was
    const before2 = st.vertexData.slice(), countBefore = st.slots.get("0,0").count, r2 = editVoxel(st, 5, 4, 5, 4);
    ok("an interior build (sand at (5, 4, 5)) rewrites one slot and leaves every float outside it untouched", r2.chunks.length === 1 && (() => { const s = st.slots.get(r2.chunks[0]); return sameFloats(st.vertexData, before2, 0, s.offset * FLOATS) && sameFloats(st.vertexData, before2, (s.offset + s.cap) * FLOATS); })() && !sameFloats(st.vertexData, before2), `${r2.chunks[0]}`);
    // THE SHRINK: digging the sand back out leaves the chunk with FEWER vertices than it just had; the tail those vertices occupied
    // must read zero again, or the stale triangles stay in the buffer (sabotage D was blind until this hold: nothing above shrank)
    const r3 = editVoxel(st, 5, 4, 5, 0);
    ok("*** digging the sand back out shrinks the slot, and the buffer is byte for byte what it was before the build (the tail cleared) ***", r3.chunks.length === 1 && st.slots.get("0,0").count === countBefore && sameFloats(st.vertexData, before2), `${st.slots.get("0,0").count} vertices in slot 0,0`);
    ok("a no-change edit and one outside the height are refused by name", editVoxel(st, 3, 3, 3, 3).refused === "no change" && editVoxel(st, 5, 99, 5, 1).refused === "outside the world's height" && editVoxel(st, 5, -1, 5, 1).refused === "outside the world's height");
    const cam = { W: 200, H: 120, fov: 0.9, eye: [40, 30, 40], target: [16, 5, 16] };
    let hit = null, at = null; for (let py = 0; py < 120 && !hit; py += 2) for (let px = 0; px < 200; px += 2) { const h = pickVoxel(w, cam, px, py); if (h && h.id === 1 && h.normal[1] === 1) { hit = h; at = [px, py]; break; } }
    ok("pickVoxel through a pixel finds the tower's top face", hit && hit.x === 16 && hit.y === 7 && hit.z === 16, hit ? `pixel ${at.join(",")}, voxel ${hit.x},${hit.y},${hit.z}` : "no pixel hit the tower");
    const b = buildAt(st, hit, 1);
    ok("buildAt places stone across the hit face: (16, 8, 16) is stone again, four chunks rewritten", w.voxelAt(16, 8, 16) === 1 && b.chunks.length === 4);
    const d = digAt(st, pickVoxel(w, cam, at[0], at[1]));
    ok("digAt through the same pixel takes it away again; a null hit is refused by name", w.voxelAt(16, 8, 16) === 0 && d.chunks.length === 4 && digAt(st, null).refused === "no voxel under the pointer");
    // overflow: a checkerboard fills a chunk with isolated voxels, thousands of faces where the slot held 258
    const cap0 = st.slots.get("0,0").cap; let overflowOk = 0, overflowBad = 0, edits = 0;
    for (let x = 0; x < 16; x += 2) for (let z = 0; z < 16; z += 2) for (let y = 5; y < 20; y += 2) { const e = editVoxel(st, x, y, z, 1); edits++;
        // at the moment of a repack the state must be exactly a fresh pack of the world with that chunk grown; later edits move the counts on
        if (e.rebuilt) { const f = packSlots(w, { grow: e.overflow }); if (e.overflow === "0,0" && f.capacity === st.capacity && sameFloats(f.vertexData, st.vertexData)) overflowOk++; else overflowBad++; } }
    ok("a chunk that outgrows its slot repacks the world naming the chunk, the state is exactly the fresh (grown) pack at that moment, and 480 isolated voxels cost few repacks (the grown slot doubles)", st.rebuilds >= 1 && st.rebuilds <= 8 && overflowBad === 0 && overflowOk === st.rebuilds && st.slots.get("0,0").cap > cap0, `${st.rebuilds} repack(s) in ${edits} edits, slot 0,0 ${cap0} -> ${st.slots.get("0,0").cap}`);
    ok("after the flood the used counts equal a fresh pack's, chunk by chunk", (() => { const f = packSlots(w); for (const [k, s] of st.slots) if (f.slots.get(k).count !== s.count) return false; return true; })());
    const real = new VoxelWorld(); new CityGen(real).generate({ seed: 1, facades: true }); const rs = editState(real);
    // one voxel above the terrain's own top, so the edit is a change (the first draft edited (3, 20, 3), which was already stone: 0 chunks, 0 ms, and the hold passed on nothing)
    const yTop = (x, z) => { for (let y = real.chunkHeight - 1; y >= 0; y--) if (real.voxelAt(x, y, z)) return y; return 0; };
    const t0 = Date.now(); const re = editVoxel(rs, 3, yTop(3, 3) + 1, 3, 1); const re2 = editVoxel(rs, 16, yTop(16, 16) + 1, 16, 1);
    ok(`an edit on the real world (${rs.slots.size} chunks, ${rs.capacity.toLocaleString()} vertex slots) rewrites its chunk under 60 ms, a corner one its four under 120`, re.chunks.length === 1 && re2.chunks.length === 4 && re.ms < 60 && re2.ms < 120 && !re.rebuilt, `${re.ms} ms for ${re.chunks.length} chunk(s), ${re2.ms} ms for ${re2.chunks.length}; total ${Date.now() - t0} ms`);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. ON BOTH BACKENDS: a dig and a build through the slot writes against a full rebuild");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const W = 200, H = 120, FOV = 0.9, eye = [40, 30, 40], target = [16, 5, 16];
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, FOV, eye, target }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const G = await import("/render/gpuDriven.mjs");
            const L = await import("/render/litSphere.mjs");
            const V = await import("/render/voxelDevice.mjs");
            const E = await import("/render/voxelDeviceEdit.mjs");
            const { W, H, FOV, eye, target } = a; const out = {};
            const make = () => { const w = V.miniWorld(); for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) { w.setVoxel(x, 3, z, 3); w.setVoxel(x, 2, z, 2); } for (let y = 4; y < 9; y++) w.setVoxel(16, y, 16, 1); return w; };
            const cam = { W, H, fov: FOV, eye, target };
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
                const vp = { viewProj: G.multiply(G.perspective(FOV, W / H, 0.5, 600), G.lookAt(eye, target)), eye };
                const shoot = async (sc) => Array.from((await sc.frame({ ...vp, read: true, clear: [0, 0, 0, 1] }).pixels).pixels);
                const w = make(), st = E.editState(w), sc = E.editScene(dev, st, G, L);
                const before = await shoot(sc);
                let hit = null, at = null; for (let py = 0; py < H && !hit; py += 2) for (let px = 0; px < W; px += 2) { const h = E.pickVoxel(w, cam, px, py); if (h && h.id === 1 && h.normal[1] === 1) { hit = h; at = [px, py]; break; } }
                const dig = E.digAt(st, hit); const after = await shoot(sc);
                const w2 = make(); w2.setVoxel(16, 8, 16, 0); const full = await shoot(E.editScene(dev, E.editState(w2), G, L));
                // the dug pixel now looks past the tower: find the NEW top face (y 7) the way the first was found, and build across it
                let hit2 = null; for (let py = 0; py < H && !hit2; py += 2) for (let px = 0; px < W; px += 2) { const h = E.pickVoxel(w, cam, px, py); if (h && h.id === 1 && h.normal[1] === 1) { hit2 = h; break; } }
                const build = E.buildAt(st, hit2, 5); const afterBuild = await shoot(sc);
                const w3 = make(); w3.setVoxel(16, 8, 16, 0); w3.setVoxel(16, 8, 16, 5); const fullBuild = await shoot(E.editScene(dev, E.editState(w3), G, L));
                // the shrink on the device: a sand voxel built on the open slab (the top face splits, the slot grows), then dug again --
                // the frame must return EXACTLY to the frame after the tower build (same scene, same buffer bytes), stale tail or not
                let slab = null; for (let py = H - 1; py >= 0 && !slab; py -= 2) for (let px = 0; px < W; px += 2) { const h = E.pickVoxel(w, cam, px, py); if (h && h.id === 3 && h.normal[1] === 1 && Math.abs(h.x - 16) > 4 && Math.abs(h.z - 16) > 4) { slab = h; break; } }
                const grow = E.buildAt(st, slab, 4); const grown = await shoot(sc); const shrink = E.editVoxel(st, slab.x, slab.y + 1, slab.z, 0); const shrunk = await shoot(sc);
                out[backend] = { path: sc.path, errs, before, after, full, afterBuild, fullBuild, grown, shrunk, hit, at, dig, build, grow, shrink, writes: st.writes, rebuilds: st.rebuilds };
                dev.destroy();
            }
            return out;
        }` });
        ok("both backends drew the hand world, dug and built through the slot writes", r.ok && r.result && r.result.webgpu && r.result.webgl2 && r.result.webgpu.errs.length === 0, r.ok ? (r.result.webgpu.errs || []).join(" | ").slice(0, 300) : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && r.result.webgpu && r.result.webgl2) {
            const N = W * H, apart = (A, B) => { let n = 0; for (let p = 0; p < N; p++) if (Math.abs(A[p * 4] - B[p * 4]) > 8 || Math.abs(A[p * 4 + 1] - B[p * 4 + 1]) > 8 || Math.abs(A[p * 4 + 2] - B[p * 4 + 2]) > 8) n++; return n; };
            for (const bk of ["webgpu", "webgl2"]) {
                const R = r.result[bk];
                report(`${bk} (${R.path}): picked the tower at pixel ${R.at && R.at.join(",")}, dig wrote ${R.dig.chunks.length} chunks in ${R.dig.ms} ms, build ${R.build.chunks.length}; ${R.writes} slot writes, ${R.rebuilds} rebuilds; dig vs full ${apart(R.after, R.full)} apart, build vs full ${apart(R.afterBuild, R.fullBuild)}, before vs after ${apart(R.before, R.after)}`);
                ok(`*** ${bk}: after the dig the frame is a FULL rebuild of the edited world (99.5 % within 8) and not the frame before ***`, R.hit && R.dig.chunks.length === 4 && R.rebuilds === 0 && apart(R.after, R.full) < N * 0.005 && apart(R.before, R.after) > 5);
                ok(`  ${bk}: after the build (glass across the top face) the frame is its full rebuild too, and differs from the dug frame`, R.build.chunks.length === 4 && apart(R.afterBuild, R.fullBuild) < N * 0.005 && apart(R.after, R.afterBuild) > 5);
            }
            for (const bk of ["webgpu", "webgl2"]) { const R = r.result[bk];
                ok(`  ${bk}: a sand voxel built on the slab and dug again -- the frame returns EXACTLY to the built frame (${apart(R.afterBuild, R.grown)} pixels changed while it stood)`, R.grow.chunks.length >= 1 && R.shrink.chunks.length >= 1 && apart(R.afterBuild, R.grown) > 0 && apart(R.afterBuild, R.shrunk) === 0, `${apart(R.afterBuild, R.shrunk)} apart after the shrink`); }
            ok("  the two backends agree on the dug frame within 8 of 255 on all but edge pixels (fewer than 3 %)", apart(r.result.webgpu.after, r.result.webgl2.after) < N * 0.03, `${apart(r.result.webgpu.after, r.result.webgl2.after)} apart`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the sandbox's own tools (which block a click places is the page's select); undo; persistence (round 5); the page's pointer handling (eyeballed).");
process.exit(fails ? 1 : 0);
