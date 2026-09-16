#!/usr/bin/env node
// WebGLEngine/tools/ship/kaijuGroundCollider-selfcheck.mjs
//
// Gates simulation/KaijuManager.js's three new methods from task board #89 -- _kaijuColliderBVH,
// _kaijuCapsuleRadius, _resolveGroundKaijuPosition -- the glue that makes a ground kaiju's per-tick Y (and now
// X/Z) come from the REAL per-chunk collision geometry world/worldColliderBVH.mjs builds, instead of only ever
// _terrainTop's coarse height oracle.
//
// *** NO KaijuManager IS EVER CONSTRUCTED HERE. *** The class has no existing gate anywhere in this tree (grep
// confirms it: zero tools/ship/*.mjs files construct one) and its constructor pulls in kaijuKinds, structure-
// builder, KaijuRivalry, KingPack and more -- real weight this task did not touch and has no business dragging
// into a gate for three small methods. Each method is called directly off the class's own prototype
// (KaijuManager.prototype._foo.call(fakeThis, ...)) against a minimal `this` carrying only what those three
// methods actually read (`this.world`, `this._colliderFor`, `this._collider`, and each other) -- the REAL,
// unmodified method bodies, exercised without the rest of the class along for the ride.
//
// SABOTAGE-VERIFIED, three tries. (1) Removing the `if (hit)` guard before reading hit.point[1] in
// _resolveGroundKaijuPosition turned section 4's "far outside every loaded chunk" case into an uncaught
// TypeError (not just a wrong number) -- exactly the crash-into-the-void failure mode that guard exists to
// prevent when a kaiju roams past the edge of loaded terrain. (2) Removing the `this._colliderFor !== w` cache
// check in _kaijuColliderBVH (an unconditional rebuild every call) turned section 1's cache-identity check red
// by name. (3) Dropping the `* (k.absorbScale || 1)` term from _kaijuCapsuleRadius turned section 2's
// multiplication check red by name. Restored, gate re-confirmed all-green after each of the three.
"use strict";
import { KaijuManager } from "../../simulation/KaijuManager.js";
import { Chunk } from "../../world/chunk.js";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

const S = 16, H = 32, STONE = 1;

/** A real Chunk-backed voxel world: floor at y=0..2 (surface y=3), a wall at x=8 (y=0..10). */
function buildVoxelWorld() {
    const c00 = new Chunk(0, 0, S, H);
    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) for (let y = 0; y <= 2; y++) c00.set(x, y, z, STONE);
    for (let z = 0; z < S; z++) for (let y = 0; y <= 10; y++) c00.set(8, y, z, STONE);
    const chunks = new Map([["0,0", c00]]);
    const isAir = (x, y, z) => {
        const cx = Math.floor(x / S), cz = Math.floor(z / S);
        const chunk = chunks.get(cx + "," + cz);
        if (!chunk) return true;
        return chunk.get(x - cx * S, y, z - cz * S) === 0;
    };
    return { chunkSize: S, chunkHeight: H, chunks, isAir, _heightAt: () => 3 };
}

/** A world with only the height oracle -- no isAir/chunkHeight -- the shape hasVoxels() must reject. */
function buildHeightOnlyWorld() { return { _heightAt: () => 3 }; }

const kaiju = (x, y, z, over = {}) => ({ position: { x, y, z }, config: { radius: 1.5, scale: 1 }, absorbScale: 1, ...over });

console.log("kaijuGroundCollider-selfcheck -- KaijuManager's new methods against real voxel geometry\n");

// ---------------------------------------------------------------------------
console.log("1. _kaijuColliderBVH: hasVoxels-GATED, AND CACHED AGAINST WORLD IDENTITY");
{
    const fake = { world: buildVoxelWorld() };
    const a = KaijuManager.prototype._kaijuColliderBVH.call(fake);
    ok("!! a real voxel world gets a real adapter", !!a && typeof a.trianglesInBox === "function");
    const b = KaijuManager.prototype._kaijuColliderBVH.call(fake);
    ok("!! *** the SAME world returns the SAME cached adapter object, not a rebuild every call ***", a === b,
        "mirrors BotManager.js's own _groundOracle() cache-by-world-identity shape (task #85)");

    const fake2 = { world: buildHeightOnlyWorld() };
    const c = KaijuManager.prototype._kaijuColliderBVH.call(fake2);
    ok("!! *** a height-only world (no isAir/chunkHeight) gets null, not a crash ***", c === null,
        "the SAME hasVoxels() guard world/surfaceProbe.mjs's own standHeightAt dispatch already uses");

    const fake3 = { world: null };
    ok("a null world also returns null", KaijuManager.prototype._kaijuColliderBVH.call(fake3) === null);
}

// ---------------------------------------------------------------------------
console.log("\n2. _kaijuCapsuleRadius: config.radius * config.scale * absorbScale, WITH THE 1.5 DEFAULT");
{
    ok("!! default radius (no config.radius set) is 1.5", KaijuManager.prototype._kaijuCapsuleRadius.call(null, { config: {} }) === 1.5);
    ok("!! explicit radius, scale and absorbScale all multiply",
        Math.abs(KaijuManager.prototype._kaijuCapsuleRadius.call(null, { config: { radius: 2, scale: 3 }, absorbScale: 1.5 }) - 9) < 1e-9,
        `2*3*1.5 = 9`);
}

// ---------------------------------------------------------------------------
console.log("\n3. _resolveGroundKaijuPosition: CORRECTS gy AGAINST THE REAL SURFACE, THEN PUSHES OUT OF WALLS");
{
    const fake = { world: buildVoxelWorld(),
        _kaijuColliderBVH: KaijuManager.prototype._kaijuColliderBVH,
        _kaijuCapsuleRadius: KaijuManager.prototype._kaijuCapsuleRadius };
    // A deliberately WRONG gy (as _terrainTop would hand in on a divergent column) -- the real surface is y=3.
    const k = kaiju(2, 2, 2);
    KaijuManager.prototype._resolveGroundKaijuPosition.call(fake, k, 12);
    report("resolved from a wrong gy=12", `y=${k.position.y.toFixed(4)}`);
    ok("!! *** settles at the REAL voxel surface (y=3), not the wrong gy it was handed ***", Math.abs(k.position.y - 3) < 1e-3, `y=${k.position.y.toFixed(4)}`);

    // Standing right against the wall (x=8): the lateral nudge must hold it outside, not let it clip through.
    const radius = KaijuManager.prototype._kaijuCapsuleRadius.call(null, k);
    const kw = kaiju(8 - radius * 0.5, 3, 5);   // half-embedded in the wall on purpose
    KaijuManager.prototype._resolveGroundKaijuPosition.call(fake, kw, 3);
    report("pushed out of the wall", `x=${kw.position.x.toFixed(4)}`);
    ok("!! *** the lateral nudge holds it outside the wall face, not clipped through it ***",
        kw.position.x < 8 - radius + 1e-3, `x=${kw.position.x.toFixed(4)}, wall face at x=${(8 - radius).toFixed(4)}`);
}

// ---------------------------------------------------------------------------
console.log("\n4. FALLBACK: NEVER WORSE THAN _terrainTop's PLAIN ANSWER");
{
    // A height-only world (no collider at all) -- must behave EXACTLY like the old unconditional `k.position.y = gy`.
    const fakeHeightOnly = { world: buildHeightOnlyWorld(),
        _kaijuColliderBVH: KaijuManager.prototype._kaijuColliderBVH,
        _kaijuCapsuleRadius: KaijuManager.prototype._kaijuCapsuleRadius };
    const k1 = kaiju(0, 0, 0);
    KaijuManager.prototype._resolveGroundKaijuPosition.call(fakeHeightOnly, k1, 7);
    ok("!! no collider at all -> y is exactly the passed-in gy, x/z untouched", k1.position.y === 7 && k1.position.x === 0 && k1.position.z === 0);

    // A real voxel world, but the kaiju is far outside the one loaded chunk -- probeGround/depenetrateCapsule
    // both find nothing there, so this must ALSO fall back to gy rather than doing anything undefined.
    const fakeVoxel = { world: buildVoxelWorld(),
        _kaijuColliderBVH: KaijuManager.prototype._kaijuColliderBVH,
        _kaijuCapsuleRadius: KaijuManager.prototype._kaijuCapsuleRadius };
    const k2 = kaiju(9000, 0, 9000);
    KaijuManager.prototype._resolveGroundKaijuPosition.call(fakeVoxel, k2, 5);
    ok("!! *** far outside every loaded chunk -- falls back to gy, not NaN or a crash ***",
        k2.position.y === 5 && Number.isFinite(k2.position.x) && Number.isFinite(k2.position.z), `y=${k2.position.y} x=${k2.position.x}`);
}

console.log(fails ? `\nkaijuGroundCollider-selfcheck: ${fails} FAILED` : "\nkaijuGroundCollider-selfcheck: all checks pass");
console.log("unchecked here: the rest of KaijuManager.tick() (flying/swimming branches, _waterWake, the many state-machine paths) -- " +
    "this file gates only the three new methods task #89 added, not the class those methods now live in; a live browser boot to " +
    "watch a real kaiju stand on real terrain (no rig available in this sandbox).");
process.exit(fails ? 1 : 0);
