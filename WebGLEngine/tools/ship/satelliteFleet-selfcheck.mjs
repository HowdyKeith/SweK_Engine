// WebGLEngine/tools/ship/satelliteFleet-selfcheck.mjs -- v4605
//
// Run: node tools/ship/satelliteFleet-selfcheck.mjs
//
// GATES simulation/SatelliteFleet.js's migration onto ui/machine.mjs's defineMachine()/applyEvent() --
// the fourth real migration from tools/ship/nextRounds.mjs's "npc-decision-framework" entry, after
// simulation/BossPhaseManager.js, simulation/CSBomb.js and simulation/CSRoundManager.js. Behaviour-preservation
// gate, same convention as those three: every check asserts the SAME externally observable outcome the
// original `if (sat.state === "orbiting") { ... } else { ... }` branch produced, now reached through a
// declared, audited event graph instead.
//
// *** TWO MACHINES LIVE IN THIS FILE, AND THEY ARE NOT THE SAME KIND OF CASE. *** SATELLITE_MACHINE (per
// satellite: crossing/orbiting) is the real one -- CLEANEST-SHAPED of the four so far, like CSRoundManager.js:
// no administrative override, no unreachable-state carve-out, both states reachable from each other. It also
// has the sharpest boundary-operator asymmetry of any migration in this series: the crossing->orbiting edge
// check is STRICT `>` while the orbiting->crossing timer check is INCLUSIVE `>=` -- get either backwards and a
// satellite either flickers exactly at the edge or reappears one tick late. FLEET_ACTIVE_MACHINE
// (fleet-wide: inactive/active) is the marginal, bundled-for-consistency case -- start()/stop() were ALREADY
// self-guarding no-ops before this migration, so section 5 exists mostly to prove the migration didn't change
// that, not because it found a bug.
"use strict";
import { SatelliteFleet, SATELLITE_TYPES, SATELLITE_STATE, SATELLITE_MACHINE, FLEET_ACTIVE_MACHINE }
    from "../../simulation/SatelliteFleet.js";
import { audit } from "../../ui/machine.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails++; };
console.log("satelliteFleet-selfcheck -- a fourth real hand-rolled FSM migrated onto ui/machine.mjs, behaviour pinned\n");

// Router mock matching main.js's real shape: router.exec({type, ...}) -> {id} for spawn, anything for the rest.
// See main.js's own `const satelliteFleet = new SatelliteFleet({ router, world, particles, audio, kpop,
// kaijuManager, launchIntervalMs })` construction call -- this mock covers the same three message types
// _spawnEntity/_despawnEntity/_moveEntity actually send.
function makeRouter() {
    let nextId = 1;
    const live = new Set();
    return {
        calls: [],
        exec(msg) {
            this.calls.push(msg);
            if (msg.type === "entity:spawnMesh") { const id = nextId++; live.add(id); return { id }; }
            if (msg.type === "entity:despawn") { live.delete(msg.id); return {}; }
            return {};
        },
        live,
    };
}
function makeFleet(extra = {}) {
    return new SatelliteFleet({ router: makeRouter(), world: {}, particles: null, audio: null,
        kaijuManager: null, kpop: null, launchIntervalMs: 25_000, ...extra });
}

console.log("1. THE DECLARED GRAPHS -- and why, unlike CSBomb.js, neither needs an unreachable-state carve-out");
{
    const a = audit(SATELLITE_MACHINE);
    ok("SATELLITE_MACHINE declares exactly 2 states", a.states === 2);
    ok("!! both crossing and orbiting are reachable -- crossing IS the machine's own initial value",
        a.unreachable.length === 0, a.reachable.sort().join(","));
    ok("!! neither state is dead -- each has a real way to the other", a.dead.length === 0);

    // Sabotage: remove ALL of crossing's outgoing edges -- a satellite that entered crossing (which is every
    // satellite ever launched, since it's the initial state) could never leave, so crossing becomes dead.
    const brokenCrossing = { ...SATELLITE_MACHINE, states: { ...SATELLITE_MACHINE.states, crossing: { on: {} } } };
    ok("!! SABOTAGE: with crossing's transitions all removed, it drops into the dead set",
        audit(brokenCrossing).dead.includes("crossing"),
        "the original if-chain had no equivalent check -- a satellite that could never leave crossing would have shipped silently");

    // Same sabotage on orbiting, for symmetry -- both states need a real way out, not just crossing.
    const brokenOrbiting = { ...SATELLITE_MACHINE, states: { ...SATELLITE_MACHINE.states, orbiting: { on: {} } } };
    ok("!! SABOTAGE: with orbiting's transitions all removed, it drops into the dead set too",
        audit(brokenOrbiting).dead.includes("orbiting"));

    // And prove the sabotage isn't too soft: removing a transition that ISN'T there to begin with (there's
    // only one per state in this 2-state graph) can't be tested the CSBomb/BossPhaseManager way (multiple
    // edges per state), so instead prove the INTACT graph is not itself flagged dead/unreachable -- the
    // positive control for the sabotage checks above.
    ok("...and the intact graph audits clean (positive control)", a.ok === true);

    const b = audit(FLEET_ACTIVE_MACHINE);
    ok("FLEET_ACTIVE_MACHINE declares exactly 2 states, both reachable, neither dead",
        b.states === 2 && b.unreachable.length === 0 && b.dead.length === 0, JSON.stringify(b));
}

console.log("\n2. THE HAPPY PATH: launch() constructs crossing (ordinary initial-state, not a graph transition)");
{
    const fleet = makeFleet({ seed: 1 });
    fleet.start();
    const id = fleet.launch("laser");
    const sat = fleet.satellites.get(id);
    ok("a freshly launched satellite starts crossing", sat.state === SATELLITE_STATE.CROSSING);
    ok("entity spawned immediately on launch", sat.entityId != null);
    ok("unknown type returns null, no satellite created", fleet.launch("not-a-real-type") === null);
}

console.log("\n3. CROSSING -> ORBITING: STRICT `>` boundary, pinned exactly ON the line");
{
    const fleet = makeFleet({ seed: 2 });
    fleet.start();
    const id = fleet.launch("detection");
    const sat = fleet.satellites.get(id);
    sat.vx = 0; sat.vz = 0;

    sat.x = 200; sat.z = 0;
    fleet._tickSat(sat, 0.016, 1000);
    ok("!! AT exactly |x|=WORLD_EDGE(200): stays crossing -- the boundary is strict `>`, not `>=`",
        sat.state === SATELLITE_STATE.CROSSING, "x=" + sat.x);
    ok("entity still spawned (not despawned) while sitting exactly on the edge", sat.entityId != null);

    sat.x = 200 + Number.EPSILON * 1e6;   // a hair past
    fleet._tickSat(sat, 0.016, 1000);
    ok("!! one ULP past the edge: fires -- pins the `>` boundary from the other side",
        sat.state === SATELLITE_STATE.ORBITING);

    // Same boundary on the z axis, independently.
    const fleet2 = makeFleet({ seed: 3 });
    fleet2.start();
    const id2 = fleet2.launch("aiming");
    const sat2 = fleet2.satellites.get(id2);
    sat2.vx = 0; sat2.vz = 0; sat2.x = 0; sat2.z = 200;
    fleet2._tickSat(sat2, 0.016, 1000);
    ok("z-axis AT exactly the edge: also stays crossing", sat2.state === SATELLITE_STATE.CROSSING);
}

console.log("\n4. ORBITING -> CROSSING: INCLUSIVE `>=` boundary, pinned exactly ON the line");
{
    const fleet = makeFleet({ seed: 4 });
    fleet.start();
    const id = fleet.launch("emp");
    const sat = fleet.satellites.get(id);
    sat.state = SATELLITE_STATE.ORBITING;
    sat.orbitEndMs = 5000;

    fleet._tickSat(sat, 0.016, 4999.999);
    ok("just under orbitEndMs: stays orbiting", sat.state === SATELLITE_STATE.ORBITING);

    fleet._tickSat(sat, 0.016, 5000);
    ok("!! AT exactly orbitEndMs: fires -- pins the `>=` boundary (inclusive, unlike the crossing exit)",
        sat.state === SATELLITE_STATE.CROSSING);
}

console.log("\n5. onEnter SIDE-EFFECT ORDER, PRESERVED EXACTLY FOR BOTH DIRECTIONS");
{
    // Entering orbiting: orbitEndMs must be armed BEFORE the entity despawns.
    const fleet = makeFleet({ seed: 5 });
    fleet.start();
    const id = fleet.launch("kinetic");
    const sat = fleet.satellites.get(id);
    sat.vx = 0; sat.vz = 0; sat.x = 300; sat.z = 0;   // already past the edge
    const entityIdBefore = sat.entityId;
    fleet._tickSat(sat, 0.016, 10_000);
    ok("!! orbitEndMs is armed (now + ORBIT_WAIT_MS), proving it ran, not just that despawn ran",
        sat.orbitEndMs === 10_000 + 20_000);
    ok("...and the entity was despawned", sat.entityId == null && entityIdBefore != null);

    // Entering crossing: mirror, THEN recompute velocity (one _rnd() draw), THEN spawn.
    const fleet2 = makeFleet({ seed: 6 });
    fleet2.start();
    const id2 = fleet2.launch("signal");
    const sat2 = fleet2.satellites.get(id2);
    sat2.state = SATELLITE_STATE.ORBITING;
    sat2.orbitEndMs = 100;
    sat2.x = 200; sat2.z = -50;
    sat2.entityId = null;   // despawned, as it would be while orbiting
    fleet2._tickSat(sat2, 0.016, 100);
    // mirror(val) = -Math.sign(val) * WORLD_EDGE -- it flips to the FIXED edge magnitude, not to -val, so a
    // z that entered orbit at -50 (well inside the edge, e.g. via a tunneled/administrative move) still lands
    // at the full +200, matching the exact formula the original code used.
    ok("!! mirrored position uses -Math.sign(val)*WORLD_EDGE (fixed edge magnitude) on BOTH axes",
        sat2.x === -200 && sat2.z === 200, "x=" + sat2.x + " z=" + sat2.z);
    ok("...velocity was recomputed from the mirrored position (non-zero, finite)",
        Number.isFinite(sat2.vx) && Number.isFinite(sat2.vz) && (sat2.vx !== 0 || sat2.vz !== 0));
    ok("...and the entity was respawned", sat2.entityId != null);

    // Math.sign(0) === 0 quirk: an axis exactly at 0 when orbit is entered collapses to 0, not flipped.
    const fleet3 = makeFleet({ seed: 7 });
    fleet3.start();
    const id3 = fleet3.launch("ir");
    const sat3 = fleet3.satellites.get(id3);
    sat3.state = SATELLITE_STATE.ORBITING;
    sat3.orbitEndMs = 0;
    sat3.x = 0; sat3.z = 200;
    fleet3._tickSat(sat3, 0.016, 0);
    ok("!! Math.sign(0)===0 quirk reproduced identically: x axis (was exactly 0) collapses to 0, not WORLD_EDGE",
        sat3.x === 0, "x=" + sat3.x);
}

console.log("\n6. NO SAME-TICK FALLTHROUGH ORBITING->CROSSING -- the opposite of CSRoundManager's dt-carry");
{
    const fleet = makeFleet({ seed: 8 });
    fleet.start();
    const id = fleet.launch("nuke");
    const sat = fleet.satellites.get(id);
    sat.state = SATELLITE_STATE.ORBITING;
    sat.orbitEndMs = 100;
    fleet._tickSat(sat, 5.0, 100);   // a big dt, which WOULD move the satellite far if crossing logic ran too
    const expectedX = -Math.sign(200) * 200;   // sat.x was WORLD_EDGE at launch-mirror time (see launch() below)
    ok("!! after the orbit-exit tick, position is EXACTLY the mirrored spot -- no vx*dt was added this same tick",
        Math.abs(sat.x - expectedX) < 1e-9 || sat.x === -sat.x /* covers x starting 0 */, "x=" + sat.x);

    const moveCalls = fleet.router.calls.filter(c => c.type === "entity:move").length;
    ok("!! _moveEntity() was never called on the orbit-exit tick itself (movement starts NEXT tick)",
        moveCalls === 0);
}

console.log("\n7. CROSSING TICK ORDERING: move -> effects -> particles ALL run BEFORE the off-frame check fires");
{
    const fleet = makeFleet({ seed: 9 });
    fleet.start();
    const id = fleet.launch("laser");
    const sat = fleet.satellites.get(id);
    sat.x = 199; sat.z = 0; sat.vx = 50; sat.vz = 0;   // this tick's integration will push it well past the edge
    sat.lastStrikeMs = -1e9;   // cooldown already elapsed, so the strike gate itself doesn't mask the ordering
    fleet.kaijuManager = { kaiju: new Map([["k1", {
        position: { x: 199, y: 0, z: 0 }, isAlive: () => true, energy: 1, applyTypedDamage() {},
    }]]) };
    const moveCallsBefore = fleet.router.calls.filter(c => c.type === "entity:move").length;
    fleet._tickSat(sat, 1.0, 1000);
    const moveCallsAfter = fleet.router.calls.filter(c => c.type === "entity:move").length;
    ok("!! _moveEntity() fired on the SAME tick the satellite exits crossing",
        moveCallsAfter === moveCallsBefore + 1);
    ok("!! _applyEffect()'s strike fired on that same tick too (lastStrikeMs updated) before off-frame ended it",
        sat.lastStrikeMs === 1000);
    ok("...and the satellite is orbiting by the end of that same tick", sat.state === SATELLITE_STATE.ORBITING);
}

console.log("\n8. _applyEffect()/trail-particles GATED TO crossing ONLY -- never while orbiting");
{
    const fleet = makeFleet({ seed: 10 });
    fleet.start();
    const id = fleet.launch("laser");
    const sat = fleet.satellites.get(id);
    sat.state = SATELLITE_STATE.ORBITING;
    sat.orbitEndMs = 999_999;   // won't elapse this tick
    sat.lastStrikeMs = 0;
    fleet.kaijuManager = { kaiju: new Map([["k1", {
        position: { x: sat.x, y: 0, z: sat.z }, isAlive: () => true, energy: 1, applyTypedDamage() {},
    }]]) };
    fleet.particles = { spawn: () => { throw new Error("particles must not spawn while orbiting"); } };
    fleet._tickSat(sat, 0.016, 100);
    ok("!! no strike while orbiting -- lastStrikeMs untouched", sat.lastStrikeMs === 0);
    ok("!! no trail particle spawn attempted while orbiting (mock would have thrown)", true);
}

console.log("\n9. RNG SINGLE-DRAW-PER-ORBIT-EXIT CONTRACT (v4325 seeded-stream reproducibility)");
{
    function runOnce() {
        const fleet = makeFleet({ seed: 4242 });
        fleet.start();
        const id = fleet.launch("uv");   // consumes some draws from launch() itself
        const sat = fleet.satellites.get(id);
        sat.state = SATELLITE_STATE.ORBITING;
        sat.orbitEndMs = 10;
        fleet._tickSat(sat, 0.016, 10);   // exactly one _rnd() draw inside the crossing onEnter
        return { vx: sat.vx, vz: sat.vz, nextDraw: fleet._rnd() };
    }
    const a = runOnce(), b = runOnce();
    ok("!! two identically-seeded fleets produce IDENTICAL post-orbit-exit velocity and the same next draw " +
       "-- proves exactly one _rnd() call happened at a fixed point in the sequence, not zero or two",
        a.vx === b.vx && a.vz === b.vz && a.nextDraw === b.nextDraw,
        JSON.stringify(a) + " vs " + JSON.stringify(b));

    // Unseeded fleets (seed omitted) fall back to Math.random, exactly as before this migration.
    const unseeded = makeFleet();
    ok("unseeded fleet falls back to Math.random (default unchanged)", unseeded._rnd === Math.random);
}

console.log("\n10. this.active / start() / stop() -- ALREADY self-guarding, migration must not change that");
{
    const fleet = makeFleet({ seed: 11 });
    ok("starts inactive", fleet.active === false);

    fleet.start({ cityCenterX: 5, cityCenterZ: 7 });
    ok("start() from inactive -> active, cityCenter recorded", fleet.active === true &&
        fleet._cityCenter.x === 5 && fleet._cityCenter.z === 7);

    fleet.start({ cityCenterX: 999, cityCenterZ: 999 });
    ok("!! start() while already active is a no-op -- cityCenter NOT overwritten (matches the pre-existing guard)",
        fleet._cityCenter.x === 5 && fleet._cityCenter.z === 7);

    const id = fleet.launch("laser");
    ok("a satellite exists before stop()", fleet.satellites.has(id));
    fleet.stop();
    ok("!! stop() despawns every live satellite and clears the map", fleet.active === false &&
        fleet.satellites.size === 0);

    const activeCallsBefore = fleet.router.calls.length;
    fleet.stop();
    ok("!! stop() while already inactive is a no-op -- no despawn calls fired, state unchanged",
        fleet.active === false && fleet.router.calls.length === activeCallsBefore);
}

console.log("\n11. NO OTHER FILE IN THE TREE READS sat.state DIRECTLY -- so there is no external contract to break");
{
    // Documented here rather than re-grepped at runtime: main.js, ui/orbitPassLayer.js, simulation/Kaiju.js,
    // simulation/KaijuManager.js and demos_code/satellite_strike_showcase.js were all grepped for
    // "crossing"/"orbiting"/"sat.state" during this migration -- the only hits were prose comments and the
    // public API surface (window.satellites.launch/start/stop/list), never a read of the private per-satellite
    // state field. SATELLITE_TYPES stays a plain object (unchanged shape) for exactly this reason -- it's the
    // one piece of this file other code (demos_code/satellite_strike_showcase.js) actually reads.
    ok("SATELLITE_TYPES is still a plain, unfrozen-shape object keyed by type (external contract unchanged)",
        typeof SATELLITE_TYPES === "object" && typeof SATELLITE_TYPES.laser?.cooldownMs === "number");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: a live in-engine fleet (main.js's real router/particles/audio/kaijuManager wiring is " +
    "mocked to the same shape, not booted); _fireStrike()'s damage-type/AOE/debuff logic, which this migration " +
    "did not touch (it is downstream of _applyEffect(), orthogonal to the crossing/orbiting graph, the same " +
    "way BossPhaseManager.js's counters and CSBomb.js's carrier axis were left alone); and the fleet-level " +
    "launch scheduler / per-weapon strike cooldown, both deliberately NOT folded into either machine -- see " +
    "SatelliteFleet.js's own header comment for why those stay simple timestamp gates.");
process.exit(fails ? 1 : 0);
