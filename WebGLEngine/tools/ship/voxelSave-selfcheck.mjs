#!/usr/bin/env node
// WebGLEngine/tools/ship/voxelSave-selfcheck.mjs -- v4521
//
// SAVE AND LOAD ON THE DEVICE WORLD (sandbox round 5): render/voxelSave.mjs over world/WorldPersistence.js, whose payload and its
// application became methods this round (buildPayload, validatePayload, applyPayload) that save() and load() call. Section 1,
// headless, the format: only chunks that diverged (_modified) are in the payload, their voxels COPIED (an edit after the build
// does not reach it); applied to a freshly generated twin world the voxels come back exactly, the restored chunks are dirty and
// _modified, a chunk the twin does not have and a chunk of the wrong length are skipped by count; validatePayload refuses a
// version 3, a missing chunks array and nothing; export and import round-trip the payload byte for byte through JSON (base64
// voxels, the legacy v1 spelling load() still reads), with the tree's own base64 twins held against the runtime's; applyToState
// syncs the restored chunks so the slots equal a fresh pack (round 4's sync, round 2's twin); save() without IndexedDB refuses by
// name; the orbit-to-camera pose round-trips. Section 2, the real world: three edits in three chunks make a payload of three
// chunks, and the twin world restored from it meshes to the SAME HASH as the edited one. Section 3, IN THE BROWSER, on both
// backends: an edited world saved through WorldPersistence into IndexedDB, a second world generated and loaded from it, both drawn
// -- 0 pixels apart; the camera pose through localStorage; clear() then a third load finds no save.
//
// MEASURED AT v4521: two edits make a payload of two chunks and 32,896 bytes (hash f31a030c) that exports to 43,792 JSON bytes and
// imports back to the same hash; the real city leaves 121 chunks _modified before any edit (CityGen writes through setVoxel), three
// edits in untouched chunks make it 124, and the twin world restored from the payload meshes to the edited world's hash with 169
// chunks synced in 0.4 s; in the browser 121 chunks / 1,982,592 bytes reach IndexedDB, load back restored 121 with 0 skipped, and the
// two worlds draw 0 pixels apart on both backends, the camera pose round-trips through localStorage, and after clear() a third load
// finds no save. THREE GATE-SIDE CORRECTIONS: three edits landed in chunks the city had already modified (the payload grew by
// nothing) -- the edits go to untouched chunks now; clear() ARMS a flag that the next load() honours by wiping, so clearing before
// the save let the load under test wipe it -- the slate is cleaned through a load first; and a column at y 40 was underground where
// the terrain stands higher -- it starts at the column's top now.
//
// SABOTAGE (v4521): A  buildPayload taking every chunk, modified or not     -> 5 red: four chunks for two, 225 for 124.
//                   B  applyPayload not marking a restored chunk dirty       -> 5 red: nothing synced, the slots stale, the loaded
//                                                                                world drawn without its column on both backends.
//                   C  exportPayload dropping the version                    -> 0 RED THE FIRST TIME: importPayload THREW and the
//                                                                                gate died with no FAIL line (exit 1, but not by
//                                                                                name). The export's version is a hold of its own
//                                                                                now and the import is caught: 4 red.
//                   D  orbitToCam with the pitch's sign flipped              -> 1 red: the round trip.
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/voxelSave-selfcheck.mjs      (~25 s)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { WorldPersistence, SAVE, modifiedChunks, payloadBytes, payloadHash, bytesToB64, b64ToBytes, exportPayload, importPayload, saveWorld, applyToState, orbitToCam, camToOrbit } from "../../render/voxelSave.mjs";
import { miniWorld, meshWorld } from "../../render/voxelDevice.mjs";
import { editState, editVoxel, packSlots, FLOATS } from "../../render/voxelDeviceEdit.mjs";
import { VoxelWorld } from "../../world/world.js";
import { CityGen } from "../../world/CityGen.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const slab = () => { const w = miniWorld(); for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) { w.setVoxel(x, 3, z, 3); w.setVoxel(x, 2, z, 2); } for (const c of w.chunks.values()) c._modified = false; return w; };
function matchesFreshPack(state) { const fresh = packSlots(state.world, state.opts); for (const [k, s] of state.slots) { const f = fresh.slots.get(k); if (!f || f.count !== s.count) return false; for (let i = 0; i < s.count * FLOATS; i++) if (state.vertexData[s.offset * FLOATS + i] !== fresh.vertexData[f.offset * FLOATS + i]) return false; } return true; }
const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. the format, headless");
{
    const w = slab(), st = editState(w); editVoxel(st, 5, 5, 5, 1); editVoxel(st, 20, 5, 20, 4);
    const P = new WorldPersistence(w), payload = P.buildPayload();
    ok("two edits in two chunks: the payload holds those two chunks, version 2, a timestamp, and nothing else", payload.chunks.length === 2 && payload.version === 2 && Number.isFinite(payload.timestamp) && modifiedChunks(w) === 2, `${payload.chunks.map((c) => c.cx + "," + c.cz).join(" ")}; ${payloadBytes(payload)} bytes`);
    const before = payload.chunks[0].v.slice(); w.setVoxel(5, 6, 5, 1);
    ok("the payload's voxels are a COPY: an edit after the build does not reach it", sameBytes(payload.chunks[0].v, before) && P.buildPayload().chunks[0].v.some((v, i) => v !== before[i]));
    const w2 = slab(), st2 = editState(w2), P2 = new WorldPersistence(w2), r = P2.applyPayload(payload);
    ok("applied to a fresh twin: both chunks restored, none skipped, the voxels exactly the saved ones, the chunks dirty and _modified", r.restored === 2 && r.skipped === 0 && w2.voxelAt(5, 5, 5) === 1 && w2.voxelAt(20, 5, 20) === 4 && w2.voxelAt(5, 6, 5) === 0 && [...w2.chunks.values()].filter((c) => c.dirty).length === 2 && modifiedChunks(w2) === 2);
    const odd = { version: 2, timestamp: 1, chunks: [{ cx: 9, cz: 9, v: new Uint8Array(16384) }, { cx: 0, cz: 0, v: new Uint8Array(100) }, { cx: 1, cz: 1, v: null }] };
    ok("a chunk the world does not have, one of the wrong length and one with no bytes are skipped by count", (() => { const q = new WorldPersistence(slab()).applyPayload(odd); return q.restored === 0 && q.skipped === 3; })());
    ok("validatePayload refuses version 3, a missing chunks array and nothing, and passes version 2 and the legacy 1", WorldPersistence.validatePayload({ version: 3, chunks: [] }) === "version mismatch 3" && WorldPersistence.validatePayload({ version: 2 }) === "no chunks array" && WorldPersistence.validatePayload(null) === "no save" && WorldPersistence.validatePayload(payload) === null && WorldPersistence.validatePayload({ version: 1, chunks: [] }) === null);
    const exp = exportPayload(payload), json = JSON.stringify(exp);
    ok("the export carries the version and the timestamp (an import without the version is refused, so the export must say it)", exp.version === 2 && exp.timestamp === payload.timestamp);
    let imp = null; try { imp = importPayload(JSON.parse(json)); } catch (e) { imp = { chunks: [], error: e.message }; }
    ok("the export imports again without a refusal", imp && !imp.error, imp && imp.error);
    ok("export then import through JSON gives the payload back byte for byte (the same hash), the voxels as base64 strings in between", typeof exp.chunks[0].v === "string" && !imp.error && payloadHash(imp) === payloadHash(payload) && imp.chunks.every((c, i) => sameBytes(c.v, payload.chunks[i].v)), `hash ${payloadHash(payload)}, ${json.length} JSON bytes`);
    ok("importPayload refuses a version 3 by name", (() => { try { importPayload({ ...exp, version: 3 }); return false; } catch (e) { return /version mismatch 3/.test(e.message); } })());
    const probe = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 7]);
    ok("the base64 twins: bytesToB64 is what the runtime's btoa gives and b64ToBytes inverts it, on lengths 1..10", (() => { for (let n = 1; n <= 10; n++) { const b = probe.subarray(0, n), s = bytesToB64(b); const rt = Buffer.from(b).toString("base64"); if (s !== rt) return false; if (!sameBytes(b64ToBytes(s), b)) return false; } return true; })());
    ok("a legacy v1 payload (base64 voxels) applies too, which is what load() has always read", (() => { const w3 = slab(); const q = new WorldPersistence(w3).applyPayload({ version: 1, timestamp: 1, chunks: exp.chunks }); return q.restored === 2 && w3.voxelAt(20, 5, 20) === 4; })());
    const w4 = slab(), st4 = editState(w4), a = imp.error ? { ok: false, restored: 0, sync: { chunks: [] } } : applyToState(st4, new WorldPersistence(w4), imp);
    ok("*** applyToState restores and syncs: the slots equal a fresh pack of the restored world, and no chunk is left dirty ***", a.ok && a.restored === 2 && a.sync.chunks.length >= 2 && matchesFreshPack(st4) && [...w4.chunks.values()].every((c) => !c.dirty), `${a.sync.chunks.length} chunks synced`);
    ok("applyToState refuses a bad payload by name and touches nothing", (() => { const s5 = editState(slab()); const q = applyToState(s5, new WorldPersistence(s5.world), { version: 3, chunks: [] }); return !q.ok && q.error === "version mismatch 3" && modifiedChunks(s5.world) === 0; })());
    const sv = await saveWorld(st, P);
    ok("save() with no IndexedDB in the room refuses by name and still reports the modified count", !sv.ok && sv.error === "IDB unavailable" && sv.modified === 2);
    const o = { yaw: 0.7, pitch: 0.55, dist: 170, target: [0, 10, 0] }, cam = orbitToCam(o), back = camToOrbit(cam, o.target);
    ok("orbitToCam puts the eye where the page puts it and camToOrbit reads it back (yaw, pitch, dist within 1e-9)", near(cam.position.y, 10 + Math.sin(0.55) * 170) && near(back.yaw, 0.7) && near(back.pitch, 0.55) && near(back.dist, 170, 1e-9));
    ok("SAVE.autosaveMs is the sandbox's thirty seconds", SAVE.autosaveMs === 30000);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. the real world");
{
    const make = () => { const w = new VoxelWorld(); new CityGen(w).generate({ seed: 1, facades: true }); return w; };
    const w = make(); const st = editState(w); const m0 = modifiedChunks(w);
    // three chunks the city did NOT touch (the first draft edited three that it had, and the payload grew by nothing)
    const untouched = [...w.chunks.values()].filter((c) => !c._modified).slice(0, 3);
    for (const c of untouched) { const x = c.cx * w.chunkSize + 8, z = c.cz * w.chunkSize + 8; let y = w.chunkHeight - 2; while (y > 0 && !w.voxelAt(x, y, z)) y--; editVoxel(st, x, y + 1, z, 5); }
    const P = new WorldPersistence(w), payload = P.buildPayload();
    report(`the generated city already leaves ${m0} chunks _modified (CityGen writes through setVoxel), so the payload carries them too`);
    ok("three edits in three chunks the city never touched: the payload grows by exactly three chunks", untouched.length === 3 && payload.chunks.length === m0 + 3 && modifiedChunks(w) === m0 + 3, `${payload.chunks.length} chunks, ${(payloadBytes(payload) / 1024).toFixed(0)} KiB`);
    const w2 = make(), st2 = editState(w2), a = applyToState(st2, new WorldPersistence(w2), payload);
    ok("*** the twin world restored from the payload meshes to the same hash as the edited one, and its slots equal a fresh pack ***", a.ok && a.restored === payload.chunks.length && meshWorld(w2).hash === meshWorld(w).hash && matchesFreshPack(st2), `${a.restored} restored, ${a.sync.chunks.length} synced in ${a.sync.ms} ms`);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("3. IN THE BROWSER, on both backends: IndexedDB, localStorage, and the frames");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const W = 200, H = 120, FOV = 0.9, eye = [30, 110, 70], target = [0, 8, 0];
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, FOV, eye, target }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const G = await import("/render/gpuDriven.mjs");
            const L = await import("/render/litSphere.mjs");
            const E = await import("/render/voxelDeviceEdit.mjs");
            const V = await import("/render/voxelDevice.mjs");
            const S = await import("/render/voxelSave.mjs");
            const { VoxelWorld } = await import("/world/world.js");
            const { CityGen } = await import("/world/CityGen.js");
            const { W, H, FOV, eye, target } = a; const out = {};
            const make = () => { const w = new VoxelWorld(); new CityGen(w).generate({ seed: 1, facades: true }); return w; };
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
                const vp = { viewProj: G.multiply(G.perspective(FOV, W / H, 0.5, 600), G.lookAt(eye, target)), eye };
                const shoot = async (sc) => Array.from((await sc.frame({ ...vp, read: true, clear: [0, 0, 0, 1] }).pixels).pixels);
                // a clean slate: clear() sets the pending-clear flag that the NEXT load() honours by wiping IndexedDB -- so wipe now, through a
                // load, rather than leave the flag armed for the load under test (the first draft cleared, saved, and then watched the load wipe its own save)
                { const P0 = new S.WorldPersistence(make()); P0.clear(); await P0.load(); }
                // A: edited, saved -- a glass column ABOVE the terrain at the centre (the terrain there is not at y 40; the first draft's column was underground)
                const wA = make(), stA = E.editState(wA), PA = new S.WorldPersistence(wA), top = V.columnTop(wA, 0, 0).y + 1, top2 = V.columnTop(wA, 6, -6).y + 1;
                for (let i = 0; i < 12; i++) E.editVoxel(stA, 0, top + i, 0, 5);
                for (let i = 0; i < 6; i++) E.editVoxel(stA, 6, top2 + i, -6, 1);
                const saved = await S.saveWorld(stA, PA); PA.saveCamera(S.orbitToCam({ yaw: 0.7, pitch: 0.55, dist: 170, target: [0, 10, 0] }));
                const frameA = await shoot(E.editScene(dev, stA, G, L));
                // B: generated afresh, loaded
                const wB = make(), stB = E.editState(wB), PB = new S.WorldPersistence(wB);
                const loaded = await S.loadWorld(stB, PB); const cam = { position: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 }; const camr = PB.loadCamera(cam); const orbit = S.camToOrbit(cam, [0, 10, 0]);
                const frameB = await shoot(E.editScene(dev, stB, G, L));
                // C: cleared, a third load finds nothing
                PB.clear(); await new Promise((res) => setTimeout(res, 100)); const wC = make(), PC = new S.WorldPersistence(wC); const third = await PC.load();
                out[backend] = { path: "ok", errs, saved, loaded: loaded.load, synced: loaded.sync.chunks.length, camr, orbit, third, frameA, frameB, glassB: wB.voxelAt(0, top + 5, 0), stoneB: wB.voxelAt(6, top2 + 2, -6), top, apartAB0: null };
                dev.destroy();
            }
            return out;
        }` });
        ok("both backends saved, loaded, drew and cleared", r.ok && r.result && r.result.webgpu && r.result.webgl2 && r.result.webgpu.errs.length === 0, r.ok ? (r.result.webgpu.errs || []).join(" | ").slice(0, 300) : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && r.result.webgpu && r.result.webgl2) {
            const N = W * H, apart = (A, B) => { let n = 0; for (let p = 0; p < N; p++) if (Math.abs(A[p * 4] - B[p * 4]) > 8 || Math.abs(A[p * 4 + 1] - B[p * 4 + 1]) > 8 || Math.abs(A[p * 4 + 2] - B[p * 4 + 2]) > 8) n++; return n; };
            for (const bk of ["webgpu", "webgl2"]) {
                const R = r.result[bk];
                report(`${bk}: saved ${R.saved.chunks} chunks / ${R.saved.bytes} bytes to ${R.saved.backend}; loaded ${R.loaded.restored} (${R.loaded.skipped} skipped) from ${R.loaded.backend}, ${R.synced} chunks synced; camera ${R.camr.ok} -> yaw ${R.orbit.yaw.toFixed(2)} pitch ${R.orbit.pitch.toFixed(2)} dist ${R.orbit.dist.toFixed(1)}; third load: ${R.third.error || "found a save"}; A vs B ${apart(R.frameA, R.frameB)} apart`);
                ok(`*** ${bk}: the save reached IndexedDB, the fresh world loaded it (the glass column and the stone are there), and the two worlds draw 0 pixels apart ***`, R.saved.ok && R.saved.backend === "idb" && R.loaded.ok && R.loaded.restored === R.saved.chunks && R.glassB === 5 && R.stoneB === 1 && R.synced >= 2 && apart(R.frameA, R.frameB) === 0, `column from y ${R.top}`);
                ok(`  ${bk}: the camera pose came back through localStorage as the orbit that was saved`, R.camr.ok && Math.abs(R.orbit.yaw - 0.7) < 1e-6 && Math.abs(R.orbit.pitch - 0.55) < 1e-6 && Math.abs(R.orbit.dist - 170) < 1e-3);
                ok(`  ${bk}: after clear() a third world's load finds no save`, R.third && !R.third.ok && R.third.error === "no save");
            }
            ok("  the two backends agree on the loaded frame within 8 of 255 on all but edge pixels (fewer than 3 %)", apart(r.result.webgpu.frameB, r.result.webgl2.frameB) < N * 0.03, `${apart(r.result.webgpu.frameB, r.result.webgl2.frameB)} apart`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the legacy localStorage migration (its data shape is v1's, held above through applyPayload); quota exhaustion (the circuit breaker is WorldPersistence's own); the page's buttons (eyeballed).");
process.exit(fails ? 1 : 0);
