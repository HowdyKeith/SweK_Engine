#!/usr/bin/env node
// WebGLEngine/tools/ship/voxelDamage-selfcheck.mjs -- v4520
//
// WEAPONS AND DAMAGE ON THE DEVICE WORLD (sandbox round 4): render/voxelDamage.mjs. Section 1, the sync: voxels written straight
// into the world (as CityGen writes them) mark chunks dirty, syncDirty re-meshes them and their neighbours, and every slot then
// holds what a fresh pack of the world holds (THE TWIN, per slot: a fresh pack re-fits the caps, so the slots are compared by
// content); a second sync does nothing. Section 2, the blast: carveSphere removes exactly the voxels whose centres lie within r
// (against a brute-force set), leaves air inside and solid outside, the debris system bursts six cubes per solid voxel with the
// voxel's colour and ages them out, the records park the rest. Section 3, CityGen under the blast on a hand world: a building
// loses the voxels the sphere took from it in hit points; a blast that crosses 75 % fires CityGen's own crumble pass (the top
// layer goes too, more air than the sphere alone); one that takes it to zero topples it (its voxels erased and rubble stamped
// elsewhere); after EACH the slots equal a fresh pack. Section 4, the weapon: shootAt carves where the ray lands and nothing
// where it does not. Section 5, the real city: a blast into a building of the 225-chunk world syncs in bounded time and the
// slots equal a fresh pack. Section 6, ON BOTH BACKENDS: the hand slab and tower drawn through the three-fleet scene; a blast
// on the tower's top with no debris draws exactly a full rebuild of the carved world; a blast on the grass slab with debris draws
// green cubes above the crater; two seconds later they are gone and the frame is the no-debris frame again.
//
// MEASURED AT v4520: three direct writes dirty three chunks and stale three slots, syncDirty re-meshes 9 in 16 ms and the slots match a
// fresh pack; a write on the slab beside the seam, synced without neighbours, leaves three neighbour slots stale by name; the tower blast
// at radius 1.5 takes 2 voxels (the brute-force set) and bursts 12 stone-coloured cubes that are gone by 1.5 s; the 4 x 4 x 8 building
// loses 24 hit points to a radius-2 blast (hp 104, standing), 88 to a radius-3 blast through its middle with CityGen's passes taking
// 114 in all (hp 40, crumbling), and topples under a radius-40 blast (87 of 128 rubble voxels stamped, 9 chunks synced) with the slots
// matching a fresh pack after each; a shot straight down carves 6 voxels of the slab; the real city's first building (4 x 5 x 6)
// loses 112 voxels to a radius-3 blast, crumbling, 15 chunks synced in 46 ms; on both backends the tower blast is 0 pixels from a
// full rebuild and 910 from the frame before, the slab blast's 84 debris cubes raise the green count from 18,067 to 18,200, and two
// seconds later the frame is 0 pixels from the full rebuild of both craters. THREE FINDINGS: (1) *** ON WEBGPU A { count, cpu }
// RECORD SOURCE IS UPLOADED ONCE *** -- the debris, born parked, never appeared on WebGPU while WebGL2's twin route drew it; the
// scenes now own a storage buffer for the records and write it every frame, and round 3's crate, which had only APPEARED to move
// (its quaternion rides in the extras, which are re-read), gained a moved-crate hold. (2) packSlots cleared the world's dirty flags,
// so the gate's twin was erasing the evidence it was about to check; the clearing moved to editState. (3) A voxel floating at y 6
// beside the seam touched nothing of the far chunk; the control write sits on the slab, where the far chunk's corner AO reads it.
//
// SABOTAGE (v4520): A  syncDirty without the neighbours                          -> 1 red: the real city's slots off a fresh pack (the
//                                                                                  hand blasts sit inside one chunk's seam-free middle).
//                   B  the building charged 1 hit point per blast, not the voxels  -> 3 red: hp 127 for 104, no crumble, no topple.
//                   C  carveSphere measuring from the voxel's corner               -> 2 red: 1 voxel for 2, the wrong ones.
//                   D  the debris pipeline drawing the mesh's colour (white)       -> 3 red: the text hold, and no green rise on either
//                                                                                  backend.
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/voxelDamage-selfcheck.mjs      (~30 s)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import { DAMAGE, syncDirty, carveSphere, blastAt, shootAt, debrisRecords, DEBRIS_LIT_WGSL, DEBRIS_LIT_VERTEX_GLSL } from "../../render/voxelDamage.mjs";
import { miniWorld, colourOf } from "../../render/voxelDevice.mjs";
import { editState, packSlots, FLOATS } from "../../render/voxelDeviceEdit.mjs";
import { VoxelDebrisSystem } from "../../world/voxelDebrisSystem.js";
import { VoxelWorld } from "../../world/world.js";
import { CityGen } from "../../world/CityGen.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function handWorld(size = 48) { const w = miniWorld(); for (let x = 0; x < size; x++) for (let z = 0; z < size; z++) { w.setVoxel(x, 3, z, 3); w.setVoxel(x, 2, z, 2); } for (let y = 4; y < 9; y++) w.setVoxel(16, y, 16, 1); return w; }
/** THE TWIN, per slot: every slot's used floats equal the fresh pack's for that chunk, and the tail is zero */
function matchesFreshPack(state) {
    const fresh = packSlots(state.world, state.opts); let bad = [];
    for (const [k, s] of state.slots) { const f = fresh.slots.get(k); if (!f || f.count !== s.count) { bad.push(k + " count " + s.count + " vs " + (f && f.count)); continue; }
        for (let i = 0; i < s.count * FLOATS; i++) if (state.vertexData[s.offset * FLOATS + i] !== fresh.vertexData[f.offset * FLOATS + i]) { bad.push(k + " float " + i); break; }
        for (let i = (s.offset + s.count) * FLOATS; i < (s.offset + s.cap) * FLOATS; i++) if (state.vertexData[i] !== 0) { bad.push(k + " tail"); break; } }
    return { same: bad.length === 0, bad, dirty: [...state.world.chunks.values()].filter((c) => c.dirty).length };
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. the sync: the world's dirty flags reach the slots");
{
    const w = handWorld(), st = editState(w);
    ok("a fresh pack leaves no chunk dirty", matchesFreshPack(st).same && matchesFreshPack(st).dirty === 0);
    w.setVoxel(5, 6, 5, 1); w.setVoxel(30, 6, 30, 4); w.setVoxel(16, 6, 15, 5);   // straight into the world, the way CityGen writes
    const dirtyBefore = [...w.chunks.values()].filter((c) => c.dirty).length, before = matchesFreshPack(st);
    ok("three direct writes mark their chunks dirty and leave the slots STALE (the twin sees it)", dirtyBefore === 3 && !before.same, `${dirtyBefore} dirty, ${before.bad.length} slots stale`);
    const s1 = syncDirty(st);
    ok("*** syncDirty re-meshes the dirty chunks and their neighbours, and every slot equals a fresh pack ***", s1.dirty === 3 && s1.chunks.length >= 3 && matchesFreshPack(st).same, `${s1.dirty} dirty -> ${s1.chunks.length} chunks in ${s1.ms} ms`);
    ok("a second sync finds nothing", syncDirty(st).chunks.length === 0 && matchesFreshPack(st).dirty === 0);
    // a write ON the slab beside the seam x 16, in chunk 0,0 only: chunk 1,0's top-face corner AO at (16, 3, 15) reads it, so 1,0 is
    // stale though never dirty (a voxel floating at y 6 touched nothing of 1,0, which is what the first draft wrote)
    const w2 = handWorld(), st2 = editState(w2); w2.setVoxel(15, 4, 15, 1);
    const s2 = syncDirty(st2, { neighbours: false });
    ok("CONTROL: without the neighbours a write beside the seam re-meshes one chunk and leaves the far side stale, which is why the neighbours are re-meshed", s2.chunks.length === 1 && !matchesFreshPack(st2).same, `${s2.chunks.length} chunk without neighbours, ${matchesFreshPack(st2).bad.join("; ")}`);
    const w3 = handWorld(), st3 = editState(w3); w3.setVoxel(15, 4, 15, 1); const s3 = syncDirty(st3);
    ok("  and with them (a fresh world, the same write) it is whole", s3.chunks.length === 4 && matchesFreshPack(st3).same, `${s3.chunks.length} chunks`);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. the blast shape and the debris");
{
    const w = handWorld(), c = [16.5, 8.5, 16.5], r = 1.5, expect = new Set();
    for (let y = 0; y < 12; y++) for (let z = 10; z < 22; z++) for (let x = 10; x < 22; x++) if (w.voxelAt(x, y, z) && Math.hypot(x + 0.5 - c[0], y + 0.5 - c[1], z + 0.5 - c[2]) <= r) expect.add(x + "," + y + "," + z);
    const removed = carveSphere(w, c, r), got = new Set(removed.map((v) => v.x + "," + v.y + "," + v.z));
    ok("carveSphere removes exactly the solid voxels whose centres lie within r (the brute-force set)", got.size === expect.size && [...expect].every((k) => got.has(k)), `${got.size} voxels`);
    ok("inside is air now, the voxel just outside the sphere is still stone, and the ids came back with the voxels", w.voxelAt(16, 8, 16) === 0 && w.voxelAt(16, 7, 16) === 0 && w.voxelAt(16, 6, 16) === 1 && removed.every((v) => v.id === 1));
    const w2 = handWorld(), st = editState(w2), debris = new VoxelDebrisSystem(), b = blastAt(st, { debris }, [16.5, 8.5, 16.5], 1.5);
    ok("blastAt bursts six debris cubes per solid voxel removed, coloured as the voxel, and syncs the slots", b.debris === b.removed.length * 6 && debris.particles.length === b.debris && debris.particles.every((p) => near(p.r, colourOf(1)[0]) && near(p.g, colourOf(1)[1])) && matchesFreshPack(st).same, `${b.removed.length} voxels, ${b.debris} debris, ${b.sync.chunks.length} chunks in ${b.ms} ms`);
    const d0 = debrisRecords(debris, 400);
    ok("debrisRecords packs the live particles as records with the colour in the extras and parks the rest below the world", d0.count === b.debris && d0.records[3] > 0 && near(d0.extras[0], colourOf(1)[0]) && d0.records[(d0.count) * 4 + 1] === DAMAGE.park[1]);
    for (let i = 0; i < 30; i++) debris.update(1 / 60); const mid = debris.particles.length; for (let i = 0; i < 60; i++) debris.update(1 / 60);
    ok("the debris ages: still flying at half a second, all gone after a second and a half", mid > 0 && debris.particles.length === 0, `${mid} at 0.5 s`);
    const w3 = handWorld(), st3 = editState(w3), air = blastAt(st3, { debris: new VoxelDebrisSystem() }, [40.5, 30, 40.5], 1.5);
    ok("a blast in the air removes nothing, bursts nothing, syncs nothing", air.removed.length === 0 && air.debris === 0 && air.sync.chunks.length === 0);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("3. CityGen under the blast: hit points, the crumble pass, the topple, the slots");
{
    const build = () => { const w = handWorld(); const city = new CityGen(w); city.generateFrom([{ x: 20, z: 20, w: 4, d: 4, h: 8 }], { groundY: 3, facades: false }); return { w, city, st: editState(w), b: city.buildings[0] }; };
    const A = build();
    ok("a 4 x 4 x 8 building on the slab: 128 hit points, one per voxel, standing", A.b.maxHp === 128 && A.b.hp === 128 && A.b.state === "standing" && A.w.voxelAt(21, 8, 21) === 1);
    const r1 = blastAt(A.st, { city: A.city, groundY: 4 }, [22, 11.5, 22], 2);
    ok("a blast of radius 2 into its upper storeys charges it exactly the voxels it lost (hp 128 -> 128 - lost), still standing above 75 %", r1.buildings.length === 1 && r1.buildings[0].lost === r1.removed.length && A.b.hp === 128 - r1.removed.length && A.b.hp > 96 && A.b.state === "standing" && !r1.buildings[0].crumbled, `${r1.removed.length} lost, hp ${A.b.hp}`);
    ok("  and the slots equal a fresh pack", matchesFreshPack(A.st).same);
    // a blast into the building's LOWER storeys: the sphere takes voxels the crumble passes do not (they take the top layer and a
    // side bite from the top), so the passes' own removals show as air beyond the sphere's
    const B = build(), r2 = blastAt(B.st, { city: B.city, groundY: 4 }, [22, 7, 22], 3);
    let standing = 0; for (let y = 4; y < 12; y++) for (let x = 20; x < 24; x++) for (let z = 20; z < 24; z++) if (B.w.voxelAt(x, y, z)) standing++;
    ok("a blast of radius 3 through its middle storeys crosses 75 %: CityGen's crumble passes fire (damaged or crumbling, the top layer gone beyond the sphere), and the slots still equal a fresh pack", r2.buildings[0].crumbled && (B.b.state === "damaged" || B.b.state === "crumbling") && standing < 128 - r2.removed.length && B.w.voxelAt(21, 11, 21) === 0 && matchesFreshPack(B.st).same, `${r2.removed.length} by the sphere, ${128 - standing} gone in all, hp ${B.b.hp}, ${B.b.state}`);
    const C = build(), r3 = blastAt(C.st, { city: C.city, groundY: 4 }, [22, 7.5, 22], 40);
    let left = 0; for (let y = 4; y < 12; y++) for (let x = 20; x < 24; x++) for (let z = 20; z < 24; z++) if (C.w.voxelAt(x, y, z)) left++;
    ok("a blast that takes it to zero topples it: CityGen erases the footprint and stamps rubble, and the slots equal a fresh pack", r3.buildings[0].toppled && C.b.state === "toppled" && C.b.hp === 0 && matchesFreshPack(C.st).same, `${r3.removed.length} removed by the sphere, ${left} voxels left standing in the footprint, ${r3.sync.chunks.length} chunks synced`);
    ok("a blast beside the building charges it nothing", blastAt(build().st, { city: build().city, groundY: 4 }, [5, 4.5, 5], 1.5).buildings.length === 0);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("4. the weapon");
{
    const w = handWorld(), st = editState(w), r = shootAt(st, {}, [8.5, 20, 8.5], [0, -1, 0], { radius: 1.2 });
    ok("a shot straight down lands on the slab's top (y 3) and carves there", r.hit && r.hit.y === 3 && r.removed.length > 0 && w.voxelAt(8, 3, 8) === 0 && matchesFreshPack(st).same, `${r.removed.length} voxels`);
    const miss = shootAt(st, {}, [8.5, 20, 8.5], [0, 1, 0]);
    ok("a shot into the sky hits nothing and carves nothing", miss.hit === null && miss.removed.length === 0);
    ok("a shot along the slab at the tower lands on the tower's side", (() => { const t = shootAt(st, {}, [2, 6.5, 16.5], [1, 0, 0], { radius: 0.5 }); return t.hit && t.hit.x === 16 && t.hit.normal[0] === -1; })());
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("5. the real city");
{
    const w = new VoxelWorld(), city = new CityGen(w); city.generate({ seed: 1, facades: true }); const st = editState(w), b = city.buildings[0];
    const gy = (city._lastStamp && city._lastStamp.groundY) || 0, top = gy + 1 + b.h - 1;
    const r = blastAt(st, { city, groundY: gy + 1, debris: new VoxelDebrisSystem() }, [b.x + b.w / 2, top - 1, b.z + b.d / 2], 3);
    ok(`a blast into the first building of the real city (${b.w} x ${b.d} x ${b.h}) charges it, syncs its chunks, and the slots equal a fresh pack`, r.buildings.length >= 1 && r.removed.length > 0 && r.sync.chunks.length >= 1 && matchesFreshPack(st).same, `${r.removed.length} removed, hp ${b.hp}/${b.maxHp} ${b.state}, ${r.sync.chunks.length} chunks in ${r.ms} ms`);
    ok("  in bounded time (under 400 ms for the sync of a few chunks)", r.ms < 400);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("6. ON BOTH BACKENDS: the blast against a full rebuild, the debris seen and gone");
{
    const v = validateWgsl(DEBRIS_LIT_WGSL);
    ok("DEBRIS_LIT_WGSL validates and both vertex stages take the colour from the extras", v.length === 0 && /vec4<f32>\(extra\.rgb, color\.a\)/.test(DEBRIS_LIT_WGSL) && /vec4\(extra\.rgb, color\.a\)/.test(DEBRIS_LIT_VERTEX_GLSL), v.join("; "));
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const W = 200, H = 120, FOV = 0.9, eye = [8.5, 12, 22], target = [12, 4.5, 12];
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, FOV, eye, target }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const G = await import("/render/gpuDriven.mjs");
            const L = await import("/render/litSphere.mjs");
            const V = await import("/render/voxelDevice.mjs");
            const E = await import("/render/voxelDeviceEdit.mjs");
            const D = await import("/render/voxelDamage.mjs");
            const { VoxelDebrisSystem } = await import("/world/voxelDebrisSystem.js");
            const { W, H, FOV, eye, target } = a; const out = {};
            const make = () => { const w = V.miniWorld(); for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) { w.setVoxel(x, 3, z, 3); w.setVoxel(x, 2, z, 2); } for (let y = 4; y < 9; y++) w.setVoxel(16, y, 16, 1); return w; };
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
                const vp = { viewProj: G.multiply(G.perspective(FOV, W / H, 0.5, 600), G.lookAt(eye, target)), eye };
                const shoot = async (sc) => Array.from((await sc.frame({ ...vp, read: true, clear: [0, 0, 0, 1] }).pixels).pixels);
                const w = make(), st = E.editState(w), debris = new VoxelDebrisSystem(), sc = D.damageScene(dev, st, null, debris, G, L);
                const before = await shoot(sc);
                const b1 = D.blastAt(st, {}, [16.5, 8.5, 16.5], 1.5); const after = await shoot(sc);
                const w2 = make(); D.carveSphere(w2, [16.5, 8.5, 16.5], 1.5); const full = await shoot(D.damageScene(dev, E.editState(w2), null, new VoxelDebrisSystem(), G, L));
                const b2 = D.blastAt(st, { debris }, [8.5, 3.5, 8.5], 1.5); for (let i = 0; i < 6; i++) debris.update(1 / 60); const withDebris = await shoot(sc);
                for (let i = 0; i < 120; i++) debris.update(1 / 60); const gone = await shoot(sc);
                const w3 = make(); D.carveSphere(w3, [16.5, 8.5, 16.5], 1.5); D.carveSphere(w3, [8.5, 3.5, 8.5], 1.5); const full2 = await shoot(D.damageScene(dev, E.editState(w3), null, new VoxelDebrisSystem(), G, L));
                out[backend] = { path: sc.path, errs, before, after, full, withDebris, gone, full2, b1: { removed: b1.removed.length, chunks: b1.sync.chunks.length }, b2: { removed: b2.removed.length, debris: b2.debris }, fleets: sc.fleetCount };
                dev.destroy();
            }
            return out;
        }` });
        ok("both backends drew the three-fleet scene, blasted twice and aged the debris", r.ok && r.result && r.result.webgpu && r.result.webgl2 && r.result.webgpu.errs.length === 0 && r.result.webgpu.fleets === 2, r.ok ? (r.result.webgpu.errs || []).join(" | ").slice(0, 300) : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && r.result.webgpu && r.result.webgl2) {
            const N = W * H, apart = (A, B) => { let n = 0; for (let p = 0; p < N; p++) if (Math.abs(A[p * 4] - B[p * 4]) > 8 || Math.abs(A[p * 4 + 1] - B[p * 4 + 1]) > 8 || Math.abs(A[p * 4 + 2] - B[p * 4 + 2]) > 8) n++; return n; };
            const greenAbove = (px) => { let n = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = (y * W + x) * 4; if (px[p + 1] > 70 && px[p + 1] > px[p] * 1.4 && px[p + 1] > px[p + 2] * 1.4) n++; } return n; };
            for (const bk of ["webgpu", "webgl2"]) {
                const R = r.result[bk];
                report(`${bk} (${R.path}): tower blast removed ${R.b1.removed} voxels over ${R.b1.chunks} chunks; slab blast removed ${R.b2.removed} for ${R.b2.debris} debris; after vs full ${apart(R.after, R.full)} apart, before vs after ${apart(R.before, R.after)}, with debris vs gone ${apart(R.withDebris, R.gone)}, gone vs full2 ${apart(R.gone, R.full2)}`);
                ok(`*** ${bk}: the blast on the tower draws EXACTLY a full rebuild of the carved world, and not the frame before ***`, apart(R.after, R.full) === 0 && apart(R.before, R.after) > 5);
                ok(`  ${bk}: the slab blast's debris is on the picture (the frame differs from the debris-free one) and the crater's grass is what it wears (green pixels rise)`, apart(R.withDebris, R.gone) > 20 && greenAbove(R.withDebris) > greenAbove(R.gone), `${greenAbove(R.withDebris)} green with debris, ${greenAbove(R.gone)} without`);
                ok(`  ${bk}: two seconds later the debris is gone and the frame is exactly the full rebuild of both craters`, apart(R.gone, R.full2) === 0);
            }
            ok("  the two backends agree within 8 of 255 on all but edge pixels (fewer than 3 %)", apart(r.result.webgpu.after, r.result.webgl2.after) < N * 0.03, `${apart(r.result.webgpu.after, r.result.webgl2.after)} apart`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the sandbox's kaiju, FPS shooter and dungeon grenade (their own pages); debris that collides (the sandbox's does not); a topple as rigid bodies (kaijuBox3d's, not here); the page's Blast button (eyeballed).");
process.exit(fails ? 1 : 0);
