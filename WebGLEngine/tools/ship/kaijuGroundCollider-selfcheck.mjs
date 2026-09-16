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
//
// *** A REAL BUG SECTION 5'S OWN FIRST RUN FOUND: k._hazard READ 0.5 FOR A KAIJU STANDING IN OPEN AIR. ***
// The first draft computed hazard straight from the iterations:2 depenetrateCapsule call that also resolves
// position, on the theory that any contacts beyond the expected single floor touch meant a wall pressing in.
// But that call's SECOND iteration re-touches the SAME already-resolved floor triangle -- still within
// radius+CONTACT_SKIN after the first pass settles it there -- and counts it as contact #2, an iteration-count
// artifact with no second surface behind it. Fixed by reading hazard off a SEPARATE, single-iteration probe
// instead (see _resolveGroundKaijuPosition's own comment for the full reasoning); section 5 below is what
// caught the 0.5-in-open-air reading in the first place.
//
// *** TASK BOARD #91 (sections 6-10), TWO MORE REAL BUGS THEIR OWN FIRST RUN FOUND, PLUS FIVE MORE SABOTAGES. ***
// (1) k._fallAccumS was never initialised to 0 when a fall began -- only k._vy got the `|| 0` treatment -- so
// `k._fallAccumS += delta` started from `undefined`, producing NaN forever (`NaN + anything` is NaN), and
// `NaN > MAX_FALL_S` is ALWAYS FALSE: section 7's own first run caught the safety net silently never firing --
// a kaiju with nothing to land on sat at y=99.5, not gy, after the cap should long since have tripped. (2)
// MEASURED, NOT ASSUMED: MAX_FALL_UNITS (150) and MAX_FALL_S (3) are NOT independent under constant gravity --
// falling 150 units takes sqrt(2*150/18)=4.08s, longer than 3s, so ordinary tick-by-tick integration always
// crosses the time cap before the distance one, no matter how the ticks are split. Removing the distance
// condition ENTIRELY (`if (k._fallAccumS > MAX_FALL_S)` alone) passed sections 6-8 and 10 with zero red --
// section 9 was added specifically because of that finding, hand-constructing the one state (already airborne,
// a huge recorded fallStartY gap, zero accumulated time) ordinary gravity can never produce, to prove the
// distance check is doing real, independent work rather than riding along with the time one.
// SABOTAGE LOG, task #91's own additions: (1) reverting the k._fallAccumS=0 init reproduced the exact bug
// above, section 7 red by name. (2) flipping the gravity sign (`+=` for `-=`) turned the kaiju's fall into a
// climb -- section 6's monotonic-fall, landing-height and reference-tick-count checks all red. (3) dropping
// the distance half of the safety-net OR -- section 9 red by name (the check built specifically to catch it).
// (4) delaying the landing condition by 5 units (`<= surfaceY - 5`) missed the tick budget section 6's loop
// allows -- red by name rather than an infinite loop, because the loop itself is bounded (ref.ticks + 20).
// Restored, gate re-confirmed all-green after each.
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

/** A real Chunk-backed voxel world with a genuine cliff: x<8 is low ground (floor y=0..2, surface y=3), x>=8
 *  is a high plateau (floor y=40..42, surface y=43) -- a sharp 40-unit drop at x=8, no ramp. H=64 so there is
 *  real headroom above the plateau to drop a capsule from. Task #91's own fall/gravity tests. */
function buildCliffWorld() {
    const CH = 64;
    const c00 = new Chunk(0, 0, S, CH);
    for (let x = 0; x < 8; x++) for (let z = 0; z < S; z++) for (let y = 0; y <= 2; y++) c00.set(x, y, z, STONE);
    for (let x = 8; x < S; x++) for (let z = 0; z < S; z++) for (let y = 0; y <= 42; y++) c00.set(x, y, z, STONE);
    const chunks = new Map([["0,0", c00]]);
    const isAir = (x, y, z) => {
        const cx = Math.floor(x / S), cz = Math.floor(z / S);
        const chunk = chunks.get(cx + "," + cz);
        if (!chunk) return true;
        return chunk.get(x - cx * S, y, z - cz * S) === 0;
    };
    return { chunkSize: S, chunkHeight: CH, chunks, isAir, _heightAt: () => 43 };
}

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

// ---------------------------------------------------------------------------
console.log("\n5. k._hazard (task board #90): a SINGLE-ITERATION probe, not an iteration-count artifact");
{
    const fake = { world: buildVoxelWorld(),
        _kaijuColliderBVH: KaijuManager.prototype._kaijuColliderBVH,
        _kaijuCapsuleRadius: KaijuManager.prototype._kaijuCapsuleRadius };

    // Standing on the open floor, far from the wall: exactly one contact (the floor), grounded -- the
    // baseline "nothing to report" case every kaiju is in most of the time.
    const kOpen = kaiju(2, 2, 2);
    KaijuManager.prototype._resolveGroundKaijuPosition.call(fake, kOpen, 3);
    report("open floor", `hazard=${kOpen._hazard}`);
    ok("!! *** standing in the open reads hazard=0, not a nonzero 'always some signal' number ***", kOpen._hazard === 0);

    // Half-embedded in the wall (the SAME setup section 3 already proved gets pushed out): the push itself
    // came from a SECOND contact beyond the floor, so hazard must read strictly above the open-floor case.
    const radius = KaijuManager.prototype._kaijuCapsuleRadius.call(null, kOpen);
    const kWall = kaiju(8 - radius * 0.5, 3, 5);
    KaijuManager.prototype._resolveGroundKaijuPosition.call(fake, kWall, 3);
    report("wedged against the wall", `hazard=${kWall._hazard}`);
    ok("!! *** wedged against the wall reads a HIGHER hazard than standing in the open ***", kWall._hazard > kOpen._hazard, `wall=${kWall._hazard} open=${kOpen._hazard}`);

    // Far outside the loaded chunk: the collider exists (this world hasVoxels) but finds nothing at all --
    // depenetrateCapsule reports grounded=false, contacts=0. That is genuinely unstable footing (nothing is
    // holding this kaiju up), so it reads as the MAXIMUM hazard, not the 0 a missing-collider world would.
    const kVoid = kaiju(9000, 0, 9000);
    KaijuManager.prototype._resolveGroundKaijuPosition.call(fake, kVoid, 5);
    report("far outside every loaded chunk", `hazard=${kVoid._hazard}`);
    ok("!! *** nothing found under the capsule at all reads hazard=1 (maximally unstable), not 0 ***", kVoid._hazard === 1);

    // A height-only world (no collider): k._hazard must stay the neutral default, not be left undefined --
    // main.js's payload builder reads `k._hazard ?? 0`, but the SOURCE of truth should already be a number.
    const fakeHeightOnly = { world: buildHeightOnlyWorld(),
        _kaijuColliderBVH: KaijuManager.prototype._kaijuColliderBVH,
        _kaijuCapsuleRadius: KaijuManager.prototype._kaijuCapsuleRadius };
    const kNoCollider = kaiju(0, 0, 0);
    KaijuManager.prototype._resolveGroundKaijuPosition.call(fakeHeightOnly, kNoCollider, 7);
    ok("!! *** no collider at all -> hazard is exactly 0, a real number not undefined ***", kNoCollider._hazard === 0);
}

// ---------------------------------------------------------------------------
console.log("\n6. TASK BOARD #91: A REAL FALL OFF A GENUINE CLIFF MATCHES ITS OWN INTEGRATION, TICK FOR TICK");
{
    const fake = { world: buildCliffWorld(),
        _kaijuColliderBVH: KaijuManager.prototype._kaijuColliderBVH,
        _kaijuCapsuleRadius: KaijuManager.prototype._kaijuCapsuleRadius };
    const DT = 1 / 60, G = 18;   // must match simulation/KaijuManager.js's own KAIJU_GRAVITY
    const y0 = 43, surfaceY = 3;

    // An INDEPENDENT reimplementation of the exact same explicit-Euler recurrence
    // (vy -= g*dt; y += vy*dt), never calling the production code -- the reference this section holds the
    // real code to, not a copy of it.
    function referenceFall(y0, surfaceY, g, dt) {
        let y = y0, vy = 0, ticks = 0;
        while (y > surfaceY && ticks < 100000) { vy -= g * dt; y += vy * dt; ticks++; }
        return { ticks, y };
    }
    const ref = referenceFall(y0, surfaceY, G, DT);
    report("independent reference: lands at tick", `${ref.ticks} (y=${ref.y.toFixed(4)})`);
    ok("the reference itself lands in a physically plausible number of ticks",
        ref.ticks > 100 && ref.ticks < 200, `sqrt(2*40/18)/dt ≈ ${Math.round(Math.sqrt(2 * 40 / 18) / DT)}`);

    const k = kaiju(4, y0, 8);   // just walked from the plateau (x>=8) onto the low side (x<8), y not yet corrected
    // gy is _terrainTop(x,z) -- recomputed EVERY tick from the kaiju's CURRENT (x,z) column, independent of
    // its own Y history. Once x=4 (the low side), a real height oracle reports something close to the real
    // low-ground surface (surfaceY=3), not the plateau it just left -- passing the stale plateau height here
    // instead would anchor probeGround's own search origin (gy + radius*4+8) too shallow to ever reach the
    // real surface 40 units below, which is a test-fixture bug, not a production one (caught by hand before
    // this section's own first run: with gy pinned to 43, the kaiju never fell at all).
    let landedTick = -1, sawAirborneMidFall = false, prevY = Infinity, monotoneFall = true;
    for (let t = 1; t <= ref.ticks + 20; t++) {
        KaijuManager.prototype._resolveGroundKaijuPosition.call(fake, k, surfaceY, DT);
        if (k._airborne) {
            if (k.position.y > prevY + 1e-9) monotoneFall = false;
            prevY = k.position.y;
            if (t === 5) sawAirborneMidFall = (k._hazard === 1);
        }
        if (landedTick < 0 && !k._airborne && Math.abs(k.position.y - surfaceY) < 1e-3) landedTick = t;
        if (landedTick >= 0) break;
    }
    report("production code: lands at tick", `${landedTick} (y=${k.position.y.toFixed(4)})`);
    ok("!! *** falls monotonically downward the whole way -- no bounce, no upward jump ***", monotoneFall);
    ok("!! *** mid-fall reads hazard=1 (airborne is unstable footing) ***", sawAirborneMidFall);
    ok("!! *** lands on the EXACT real lower surface (y=3), not the plateau it started on ***",
        Math.abs(k.position.y - surfaceY) < 1e-3, `y=${k.position.y.toFixed(4)}`);
    ok("!! *** lands within 1 tick of the INDEPENDENT reference's own tick count ***",
        landedTick >= 0 && Math.abs(landedTick - ref.ticks) <= 1, `production=${landedTick} reference=${ref.ticks}`);
    ok("!! ...and state is fully reset on landing -- no residual velocity or fall bookkeeping", k._vy === 0 && k._fallAccumS === 0 && k._airborne === false);
}

// ---------------------------------------------------------------------------
console.log("\n7. THE SAFETY NET: A FALL WITH NOTHING TO LAND ON EVENTUALLY SNAPS BACK TO gy, NOT FOREVER");
{
    // Far outside the one loaded chunk -- probeGround/depenetrateCapsule find NOTHING, every tick, for the
    // entire fall (chunksTouchingBox(world, ...) never resolves a chunk out there). gy=5 is deliberately far
    // below the y=200 starting height -- farther than either MAX_FALL_S or MAX_FALL_UNITS alone would cover
    // -- so if the safety net did NOT exist, this kaiju would still be well above 5 long after both caps
    // should have fired; if it does, this section is what would catch it never landing.
    const fake = { world: buildVoxelWorld(),
        _kaijuColliderBVH: KaijuManager.prototype._kaijuColliderBVH,
        _kaijuCapsuleRadius: KaijuManager.prototype._kaijuCapsuleRadius };
    const DT = 1 / 60;
    const GY = 5;
    const k = kaiju(9000, 200, 9000);

    for (let t = 0; t < 170; t++) KaijuManager.prototype._resolveGroundKaijuPosition.call(fake, k, GY, DT);   // ~2.83s -- before either cap fires
    report("still falling after 170 ticks (~2.83s)", `y=${k.position.y.toFixed(2)} airborne=${k._airborne}`);
    ok("!! *** still airborne, and still well above gy -- the fall has not been cut short early ***",
        k._airborne === true && k.position.y > GY + 50, `y=${k.position.y.toFixed(2)}`);

    for (let t = 0; t < 30; t++) KaijuManager.prototype._resolveGroundKaijuPosition.call(fake, k, GY, DT);   // now past 3s of fall time
    report("after 200 ticks total (~3.33s)", `y=${k.position.y.toFixed(4)} airborne=${k._airborne}`);
    ok("!! *** the safety net fired: snapped to EXACTLY gy, not left falling indefinitely ***",
        k.position.y === GY && k._airborne === false, `y=${k.position.y}`);
    ok("!! ...and the fall bookkeeping is fully cleared, not left dangling for the next tick", k._vy === 0 && k._fallAccumS === 0 && k._fallStartY === undefined);
}

// ---------------------------------------------------------------------------
console.log("\n8. THE SAFETY NET ALSO CATCHES A SINGLE HUGE-DELTA TICK (A FRAME HITCH), NOT JUST ACCUMULATED TIME");
{
    // One call with a deliberately enormous delta -- the shape a real stall/debugger-pause/tab-backgrounding
    // frame hitch takes. A single 10s step blows past MAX_FALL_S on its own (10 > 3) -- section 9 below is
    // where the DISTANCE cap is isolated and proven independently, since under ordinary gravity integration
    // the two are coupled and this single-huge-tick case alone cannot tell them apart (measured, not assumed:
    // see section 9's own header). What matters here is that a huge single step is caught at all, immediately.
    const fake = { world: buildVoxelWorld(),
        _kaijuColliderBVH: KaijuManager.prototype._kaijuColliderBVH,
        _kaijuCapsuleRadius: KaijuManager.prototype._kaijuCapsuleRadius };
    const GY = 5;
    const k = kaiju(9000, 200, 9000);
    KaijuManager.prototype._resolveGroundKaijuPosition.call(fake, k, GY, 10);   // one 10-second tick
    report("after one 10s tick", `y=${k.position.y} airborne=${k._airborne}`);
    ok("!! *** a single pathological tick is caught immediately, not left at some huge negative y ***",
        k.position.y === GY && k._airborne === false, `y=${k.position.y}`);
    ok("!! ...and it is a real number, never NaN or -Infinity from the huge vy*dt step", Number.isFinite(k.position.y));
}

// ---------------------------------------------------------------------------
console.log("\n9. THE DISTANCE CAP SPECIFICALLY: ISOLATED FROM THE TIME CAP, NOT JUST RIDING ALONG WITH IT");
{
    // *** MEASURED, NOT ASSUMED: under CONSTANT gravity, MAX_FALL_S and MAX_FALL_UNITS are NOT independent. ***
    // Falling MAX_FALL_UNITS (150) takes sqrt(2*150/18) = 4.08s, longer than MAX_FALL_S (3s) -- so under
    // ordinary tick-by-tick integration, no matter how the ticks are split, elapsed TIME always crosses
    // MAX_FALL_S before elapsed DISTANCE could ever cross MAX_FALL_UNITS on its own. Section 7's own test
    // (many small ticks) and section 8's (one huge tick) both only ever prove the TIME half of the OR -- a
    // gate that removed the distance half ENTIRELY (checked directly: `if (k._fallAccumS > MAX_FALL_S)` alone)
    // still went all-green. The distance check earns its place when k.position.y moves independently of the
    // fall's own elapsed time -- e.g. a lateral depenetration correction that lands far from where gravity
    // integration alone would put it -- which is hand-constructed here rather than guessed at, since ordinary
    // gravity can never produce the combination this isolates.
    const fake = { world: buildVoxelWorld(),
        _kaijuColliderBVH: KaijuManager.prototype._kaijuColliderBVH,
        _kaijuCapsuleRadius: KaijuManager.prototype._kaijuCapsuleRadius };
    const GY = 5;
    const k = kaiju(9000, 100, 9000);
    // Already airborne, with a recorded fall-start 1000 units above where it stands NOW, but ZERO accumulated
    // fall time -- impossible to reach through gravity integration alone (time and distance are coupled), so
    // it is set by hand to isolate exactly the `(k._fallStartY - k.position.y) > MAX_FALL_UNITS` condition.
    k._airborne = true; k._vy = 0; k._fallAccumS = 0; k._fallStartY = k.position.y + 1000;
    KaijuManager.prototype._resolveGroundKaijuPosition.call(fake, k, GY, 1 / 60);
    report("one tick after a hand-set 1000-unit fallStartY gap, zero accumulated time", `y=${k.position.y} airborne=${k._airborne}`);
    ok("!! *** the distance condition alone caps the fall -- accumulated time was near zero, and still capped ***",
        k.position.y === GY && k._airborne === false, `y=${k.position.y}`);
}

// ---------------------------------------------------------------------------
console.log("\n10. REGRESSION: A MINOR STEP (WITHIN GROUND_SNAP_EPS) STILL SNAPS INSTANTLY -- NO JITTER ON ROUGH GROUND");
{
    const fake = { world: buildVoxelWorld(),
        _kaijuColliderBVH: KaijuManager.prototype._kaijuColliderBVH,
        _kaijuCapsuleRadius: KaijuManager.prototype._kaijuCapsuleRadius };
    // A tiny 0.2-unit ledge (well under GROUND_SNAP_EPS = radius*0.5 = 0.75 for the default radius 1.5) --
    // the shape a single voxel-mesh quad seam or a rough-terrain lip actually looks like underfoot.
    const k = kaiju(2, 3.2, 2);
    KaijuManager.prototype._resolveGroundKaijuPosition.call(fake, k, 3, 1 / 60);
    ok("!! *** a 0.2-unit step snaps in ONE tick, never enters the falling state ***",
        k._airborne === false && Math.abs(k.position.y - 3) < 1e-3, `y=${k.position.y.toFixed(4)} airborne=${k._airborne}`);
}

console.log(fails ? `\nkaijuGroundCollider-selfcheck: ${fails} FAILED` : "\nkaijuGroundCollider-selfcheck: all checks pass");
console.log("unchecked here: the rest of KaijuManager.tick() (flying/swimming branches, _waterWake, the many state-machine paths) -- " +
    "this file gates only the three new methods task #89 added, not the class those methods now live in; a live browser boot to " +
    "watch a real kaiju stand on real terrain (no rig available in this sandbox).");
process.exit(fails ? 1 : 0);
