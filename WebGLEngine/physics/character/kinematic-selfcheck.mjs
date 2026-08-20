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
{
    let worst = -Infinity, n = 0;
    let rng = 12345;
    const rand = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
    for (let i = 0; i < 400; i++) {
        const pos = [rand() * 6, 0.9 + rand() * 2, rand() * 6];
        if (overlapsSolid(pos, HALF, corner)) continue;
        const delta = [(rand() - 0.5) * 4, (rand() - 0.5) * 2, (rand() - 0.5) * 4];
        const r = moveCharacter({ pos, half: HALF, delta, isSolid: corner });
        worst = Math.max(worst, r.movedDist - r.requestedDist);
        n++;
    }
    ok("displacement NEVER exceeds the request, over 400 random moves", worst <= 1e-9, `worst excess ${worst.toExponential(2)} over ${n} moves`);
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
