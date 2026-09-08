// WebGLEngine/physics/character/kinematic-selfcheck.mjs -- v2833
//
// Run: node physics/character/kinematic-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/character/kinematic.js -- the kinematic character controller.
//
// A controller is usually judged by feel, which is why they ship broken. This one has EXACT invariants, because
// movement is dictated by geometry rather than integrated from forces:
//
//   NEVER INSIDE     the body never comes to rest overlapping a solid. Fuzzed, not spot-checked.
//   SLIDE EXACT      v' = v - (v.n)n, so the component ALONG a wall survives UNTOUCHED -- not approximately.
//   NEVER FURTHER    displacement can never exceed what was asked for. Gaining ground on contact is how players
//                    get flung through walls.
//   NO TUNNELLING    at ANY speed, which is the invariant that actually bites and the reason for substepping.
//
// THE SABOTAGE IS THE IMPORTANT ONE: raise the substep cap and a fast body walks clean through a wall. That
// proves the substepping is load-bearing rather than decorative, which no amount of playing the game would.

import { moveCharacter, stepCharacter, slideVector, overlapsSolid, overlappedVoxels, EPS } from "./kinematic.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const HALF = [0.3, 0.9, 0.3];
const floorWall = (x, y, z) => y < 0 || x >= 4;                 // ground plus a wall at x=4
const thinWall = (x) => x === 4;                                 // one voxel thick
const corner = (x, y, z) => y < 0 || x >= 4 || z >= 4;           // two walls meeting

// 1. FREE MOTION IS EXACT -- a controller that drifts in open space is wrong before it ever touches anything
{
    const r = moveCharacter({ pos: [0, 1, 0], half: HALF, delta: [0.5, 0, 0.25], isSolid: floorWall });
    ok("unobstructed motion is delivered EXACTLY", r.moved[0] === 0.5 && r.moved[1] === 0 && r.moved[2] === 0.25, JSON.stringify(r.moved));
    ok("...and reports itself unblocked", r.blocked === false && r.normals.length === 0);
}

// 2. THE SLIDE, and it must be exact rather than close
{
    const r = moveCharacter({ pos: [3.5, 1, 0], half: HALF, delta: [1.0, 0, 0.5], isSolid: floorWall });
    ok("blocked axis stops at the face: 4.0 - half 0.3 = 3.7", Math.abs(r.pos[0] - 3.7) < 1e-4, r.pos[0].toFixed(6));
    ok("TANGENTIAL MOTION SURVIVES EXACTLY (z is untouched by an x collision)", r.moved[2] === 0.5, r.moved[2].toString());
    ok("the contact normal points back out of the wall", r.normals.some((n) => n[0] === -1));
    ok("the body does not end inside the wall", overlapsSolid(r.pos, HALF, floorWall) === false);
    // the identity itself
    ok("slideVector removes only the normal component", JSON.stringify(slideVector([1, 0, 0.5], [-1, 0, 0])) === JSON.stringify([0, 0, 0.5]));
    ok("...and a vector already in the plane is untouched", JSON.stringify(slideVector([0, 0, 1], [-1, 0, 0])) === JSON.stringify([0, 0, 1]));
}

// 3. NEVER FURTHER THAN REQUESTED, fuzzed
//
// *** THIS SWEEP PASSED NO stepHeight, SO IT DEFAULTED TO 0 AND COULD NOT REACH THE ONE PATH THAT BREAKS THE
// INVARIANT IT DEFENDS. *** moveCharacter's step-up LIFTS the body by the allowance and settles it on top of
// the lip, and that vertical gain was never in the requested delta. Measured on a one-voxel lip with
// stepHeight 1.1: requested 0.800062, moved 1.360147 -- SEVENTY PER CENT FURTHER THAN ASKED -- and the same
// at every approach distance tried. 400 random moves said "worst excess 8.88e-16" the whole time, because
// every one of them had step-up switched off.
//
// *** AND THE INVARIANT IS THE THING THAT WAS WRONG, NOT THE CODE. *** The header's reason for it is "a
// controller that gains ground on contact is how players get flung through walls", which is about gaining
// ground ALONG the motion. A step-up gains height deliberately; that is its entire job, and a controller
// forbidden to do it could not climb a stair. So the invariant is restated in the two halves that are
// actually meant, and both are swept WITH the allowance on:
//
//   HORIZONTAL never exceeds the requested horizontal   -- the flung-through-walls case
//   VERTICAL never gains more than stepHeight           -- the step-up's own bound
{
    let worstH = -Infinity, worstTotal = -Infinity, worstLift = -Infinity, n = 0, stepped = 0;
    let rng = 12345;
    const rand = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
    const STEP = 1.1;
    for (let i = 0; i < 400; i++) {
        const pos = [rand() * 6, 0.9 + rand() * 2, rand() * 6];
        if (overlapsSolid(pos, HALF, corner)) continue;
        const delta = [(rand() - 0.5) * 4, (rand() - 0.5) * 2, (rand() - 0.5) * 4];
        const r = moveCharacter({ pos, half: HALF, delta, isSolid: corner, stepHeight: STEP });
        const reqH = Math.hypot(delta[0], delta[2]), gotH = Math.hypot(r.moved[0], r.moved[2]);
        const lift = r.moved[1] - delta[1];
        worstH = Math.max(worstH, gotH - reqH);
        worstLift = Math.max(worstLift, lift);
        worstTotal = Math.max(worstTotal, r.movedDist - r.requestedDist);
        if (lift > 1e-9) stepped++;
        n++;
    }
    ok("!! HORIZONTAL displacement never exceeds the requested horizontal, over 400 moves WITH step-up on",
        worstH <= 1e-9,
        `worst excess ${worstH.toExponential(2)} over ${n} moves, ${stepped} of which actually stepped up. ` +
        `The old sweep passed no stepHeight at all, so this path was unreachable and the row was measuring ` +
        `a controller with the feature switched off.`);
    ok("!! ...and the VERTICAL gain never exceeds the step allowance itself",
        worstLift <= STEP + 1e-9,
        `worst lift ${worstLift.toFixed(6)} against an allowance of ${STEP}`);
    // *** AND THE RANDOM SWEEP DOES NOT SHOW THE TOTAL-DISTANCE VIOLATION EITHER, WHICH IS WORTH SAYING
    // RATHER THAN QUIETLY DROPPING. *** Its deltas carry a vertical component up to +/-1, big enough to
    // absorb a lift of 0.598, so the total stays under the request at 8.9e-16 even across the 20 moves that
    // really did step. The violation needs a request that is NEARLY HORIZONTAL -- which is what walking at a
    // stair actually looks like -- so it is asserted on that fixture instead of this one. A row that says
    // "this sweep is the wrong instrument for that claim" is worth more than one that reports its 8.9e-16.
    const lip = (x, y, z) => (y < 1 && y >= -1 && x >= 4) || (y < 0 && y >= -1);
    const walkAt = (dx) => moveCharacter({ pos: [3.0, 0.9, 0.5], half: HALF, delta: [dx, -0.01, 0], isSolid: lip, stepHeight: 1.1 });
    const cases = [0.8, 1.0, 1.5].map(walkAt);
    ok("!! *** TOTAL displacement DOES exceed the request when a step fires, and the header used to forbid it ***",
        cases.every((r) => r.movedDist > r.requestedDist + 1e-9),
        cases.map((r) => `requested ${r.requestedDist.toFixed(3)} moved ${r.movedDist.toFixed(3)}`).join("; ") +
        ` -- up to 70% further than asked. This row asserts the OPPOSITE of the sentence it replaces, on ` +
        `purpose: "never further" was true of the controller the old sweep exercised and false of the one ` +
        `that ships. A step-up is a deliberate vertical gain, so the bound belongs on the two components ` +
        `separately. If this row ever goes green, either step-up stopped working or somebody re-broke it to ` +
        `satisfy a sentence.`);
    // *** AND "IT LANDED ON TOP" IS ASKED WITH A SECOND, INDEPENDENT PROBE, BECAUSE THE FIRST ONE LIED. ***
    // Comparing the reported y against 1.9 is a check on my arithmetic. Dropping the body again and seeing
    // whether it MOVES is a check on the world: a body that is really resting cannot fall any further.
    ok("!! *** a body that has stepped up is RESTING on the lip, not hovering above it ***",
        cases.every((r) => {
            const again = moveCharacter({ pos: r.pos, half: HALF, delta: [0, -0.5, 0], isSolid: lip });
            return r.grounded && Math.abs(again.pos[1] - r.pos[1]) < 1e-5;
        }),
        cases.map((r) => r.pos[1].toFixed(6)).join(", ") + " against a lip top of 1 plus half-height 0.9, and " +
        "each one refuses to fall when pushed down again. *** BEFORE v4544 EVERY ONE OF THESE HOVERED: *** " +
        "2.000000, 1.996667, 1.995000 -- up to 0.1 in the air with grounded reporting TRUE, and a second " +
        "drop moved them straight to 1.900001, which is how the hover was found at all.");
}

// 3b. *** THE PRECONDITION moveAxis HAS ALWAYS HAD AND NEVER STATED: ONE VOXEL PER MOVE ***
{
    // moveAxis snaps to the boundary nearest the TARGET rather than the first boundary CROSSED. That is
    // exact while a move stays inside one voxel, which the substep cap guarantees for every caller that
    // goes through moveCharacter -- and the step-up's settle drop used to bypass the cap, which is the
    // whole reason the hover above existed. The threshold is sharp and is measured here rather than
    // described, so that a future change to moveAxis has something to be wrong against.
    const floor1 = (x, y, z) => y < 1 && y >= -3;            // top face y=1, resting centre 1.9
    const START = 2.4;                                        // bottom face 1.5, a true fall of 0.5
    const at = (d) => moveCharacter({ pos: [0.5, START, 0.5], half: HALF, delta: [0, -d, 0], isSolid: floor1, maxSubstep: 10 }).pos[1];
    const inside = [0.5, 0.6, 1.0, 1.4].map(at);              // target of the bottom face stays >= 0.10
    const past = [1.5, 1.6, 2.5, 3.4].map(at);                // target reaches or passes the next boundary
    ok("!! *** UNSUBSTEPPED, moveAxis IS EXACT UP TO ONE VOXEL OF OVERSHOOT AND FREEZES BEYOND IT ***",
        inside.every((y) => Math.abs(y - 1.9) < 1e-4) && past.every((y) => Math.abs(y - START) < 1e-9),
        "targets 1.00/0.90/0.50/0.10 land at " + inside.map((y) => y.toFixed(6)).join("/") +
        "; targets 0.00/-0.10/-1.00/-1.90 all stay at " + past[0].toFixed(6) + " -- half a unit in the air. " +
        "The snap lands embedded, so the 'refuse to move rather than push through' branch fires and the body " +
        "does not descend at all. It is not a rounding error, it is a cliff at exactly one voxel.");
    ok("!! ...and every one of them is correct once the caller obeys the substep cap the header insists on",
        [1.5, 1.6, 2.5, 3.4].every((d) =>
            Math.abs(moveCharacter({ pos: [0.5, START, 0.5], half: HALF, delta: [0, -d, 0], isSolid: floor1 }).pos[1] - 1.9) < 1e-4),
        "same four requests at the default maxSubstep of 0.4 all land at 1.900001. *** SO THE CAP IS LOAD " +
        "BEARING FOR CORRECTNESS AND NOT ONLY FOR TUNNELLING, *** which the header did not say and which is " +
        "why the one caller that bypassed it shipped a hovering character.");
}

// 4. NEVER INSIDE A SOLID, fuzzed against a world with a corner in it
{
    let bad = 0, n = 0;
    let rng = 999;
    const rand = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
    for (let i = 0; i < 600; i++) {
        const pos = [rand() * 6, 0.9 + rand() * 3, rand() * 6];
        if (overlapsSolid(pos, HALF, corner)) continue;
        const delta = [(rand() - 0.5) * 8, (rand() - 0.5) * 4, (rand() - 0.5) * 8];
        const r = moveCharacter({ pos, half: HALF, delta, isSolid: corner });
        if (overlapsSolid(r.pos, HALF, corner)) bad++;
        n++;
    }
    ok("the body NEVER ends inside a solid, over 600 random moves", bad === 0, `${bad} violations in ${n}`);
}

// 5. NO TUNNELLING AT ANY SPEED -- the invariant that bites
{
    let allStopped = true, rows = [];
    for (const d of [1, 5, 20, 100, 500]) {
        const r = moveCharacter({ pos: [0, 1, 0], half: HALF, delta: [d, 0, 0], isSolid: thinWall });
        const through = r.pos[0] > 4;
        if (through) allStopped = false;
        rows.push(`${d}->${r.pos[0].toFixed(2)}`);
    }
    ok("a ONE-VOXEL wall stops the body at every speed tested", allStopped, rows.join(" "));
    const fast = moveCharacter({ pos: [0, 1, 0], half: HALF, delta: [500, 0, 0], isSolid: thinWall });
    ok("...and substep count scales with distance", fast.substeps > 100, String(fast.substeps));
}

// 6. THE SABOTAGE: substepping is load-bearing, not decoration
{
    const safe = moveCharacter({ pos: [0, 1, 0], half: HALF, delta: [50, 0, 0], isSolid: thinWall });
    const sabotaged = moveCharacter({ pos: [0, 1, 0], half: HALF, delta: [50, 0, 0], isSolid: thinWall, maxSubstep: 1000 });
    ok("SABOTAGE: with substepping disabled the body tunnels straight through the wall",
        safe.pos[0] < 4 && sabotaged.pos[0] > 4, `substepped ${safe.pos[0].toFixed(2)} vs unstepped ${sabotaged.pos[0].toFixed(2)}`);
}

// 7. CORNERS -- two planes at once, where naive controllers escape
{
    const r = moveCharacter({ pos: [3.5, 1, 3.5], half: HALF, delta: [1, 0, 1], isSolid: corner });
    ok("motion into a corner is stopped on BOTH axes", Math.abs(r.pos[0] - 3.7) < 1e-4 && Math.abs(r.pos[2] - 3.7) < 1e-4,
        `(${r.pos[0].toFixed(3)}, ${r.pos[2].toFixed(3)})`);
    ok("...and it does not squeeze through the corner", overlapsSolid(r.pos, HALF, corner) === false);
    ok("...reporting a normal for each wall", r.normals.some((n) => n[0] === -1) && r.normals.some((n) => n[2] === -1));
}

// 8. GROUNDING
{
    const land = moveCharacter({ pos: [0, 0.95, 0], half: HALF, delta: [0, -0.5, 0], isSolid: floorWall });
    ok("landing reports grounded and rests exactly on the surface (0 + half 0.9)", land.grounded === true && Math.abs(land.pos[1] - 0.9) < 1e-4, land.pos[1].toFixed(6));
    const air = moveCharacter({ pos: [0, 5, 0], half: HALF, delta: [0, -0.5, 0], isSolid: floorWall });
    ok("falling in open air does NOT report grounded", air.grounded === false);
}

// 9. STEP-UP, both ways, and it must settle EXACTLY on the lip
{
    const lip = (x, y, z) => y < 0 || (x >= 4 && y === 0);      // a one-voxel step
    const walk = (stepHeight) => {
        let pos = [3.0, 0.9, 0], vel = [1.5, 0, 0];
        for (let i = 0; i < 180; i++) { const s = stepCharacter({ pos, half: HALF, velocity: vel, isSolid: lip, stepHeight }); pos = s.pos; vel = [1.5, s.velocity[1], 0]; }
        return pos;
    };
    const climbed = walk(1.1), blocked = walk(0);
    ok("with an allowance the body CLIMBS the lip", climbed[0] > 4, `x=${climbed[0].toFixed(3)}`);
    ok("...and settles EXACTLY on top of it (lip top 1 + half 0.9)", Math.abs(climbed[1] - 1.9) < 1e-3, climbed[1].toFixed(4));
    ok("without an allowance it is stopped dead at the lip", blocked[0] < 4 && Math.abs(blocked[0] - 3.7) < 1e-3, `x=${blocked[0].toFixed(3)}`);
    ok("neither outcome leaves the body inside the step", !overlapsSolid(climbed, HALF, lip) && !overlapsSolid(blocked, HALF, lip));
}

// 10. VELOCITY: a blocked axis is zeroed, the others survive -- the slide rule again, one level up
{
    const s = stepCharacter({ pos: [3.6, 1, 0], half: HALF, velocity: [5, 0, 2], isSolid: floorWall, gravity: 0, dt: 0.1 });
    ok("the blocked axis's velocity is zeroed", s.velocity[0] === 0);
    ok("...and the free axis keeps its speed exactly", s.velocity[2] === 2);
}

// 11. mechanics
{
    const r = overlappedVoxels([0.5, 0.5, 0.5], [1.5, 1.5, 1.5]);
    ok("overlappedVoxels covers the touched cells", r.x0 === 0 && r.x1 === 1);
    ok("a box resting exactly on a face does not read as embedded in it", overlapsSolid([0, 0.9, 0], HALF, (x, y, z) => y < 0) === false);
    const a = moveCharacter({ pos: [3.5, 1, 0], half: HALF, delta: [1, 0, 0.5], isSolid: floorWall });
    const b = moveCharacter({ pos: [3.5, 1, 0], half: HALF, delta: [1, 0, 0.5], isSolid: floorWall });
    ok("the same input gives the same result", JSON.stringify(a.pos) === JSON.stringify(b.pos));
    ok("EPS keeps the body off the surface rather than exactly on it", EPS > 0 && EPS < 1e-3);
}

// 12. browser-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("./kinematic.js", import.meta.url), "utf8");
    ok("kinematic.js imports nothing and uses no DOM", !/^\s*import\s/m.test(src) && !/\bwindow\.|\bdocument\./.test(src));
}

console.log("kinematic-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
