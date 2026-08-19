// tools/ship/brickJumpEquivalence-selfcheck.mjs
//
// Run: node tools/ship/brickJumpEquivalence-selfcheck.mjs   (~15s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3092 -- THE JUMPING TRAVERSAL WAS RIGHT TO BE KEPT OUT OF THE DEFAULT, FOR THE WRONG REASON.
//
// rleBrickMap.js has carried traverseBrickedJumping "EXPORTED FOR MEASUREMENT, NOT FOR USE" for a long time,
// with a stated reason: it advances by n * tDelta in one operation instead of adding tDelta n times, which is
// arithmetically identical and NUMERICALLY different, so near a tie the two forms could take different branches
// and return a different first-hit face. The note ends "if that number is ever shown to be zero across a large
// enough ray set, this becomes a candidate for the default -- with its own equivalence gate". This is that gate,
// and it says something the note did not anticipate.
//
// THE FLOAT DIVERGENCE IS ZERO. 21,600 rays over five origins and nine step budgets, compared field for field
// on hit, vx, vy, vz, nx, ny, nz, steps and t. Not one mismatch. The thing everyone was worried about does not
// happen here.
//
// THE THINGS THAT ACTUALLY DIFFERED WERE INTERFACE, NOT ARITHMETIC, AND NOBODY HAD LOOKED:
//   (a) maxSteps MEANT TWO DIFFERENT THINGS. traverseBricked's budget is a hard bound -- its loop runs at most
//       maxSteps times. The jumping form added kx+ky+kz in one go and sailed past it: MEASURED at 6667 rays
//       over budget by up to 20 voxels, while the stepping form was inside it on every single ray.
//   (b) THE STEP COUNTS DISAGREED ON ~60% OF RAYS, which the old measurement reported next to the float
//       question as though it were the same kind of evidence. It was not. It was (a) showing through.
//   (c) THE JUMPING FORM HAD NO queries FIELD AT ALL, so a caller reading .queries got undefined rather than a
//       number -- silently, since undefined compares false against everything without throwing.
// All three are fixed, and the equivalence below is measured against the fixed version.
//
// AND THEN THE POINT OF THE WHOLE THING EVAPORATED. The jump exists to skip empty bricks. But traverseBricked
// ALREADY skips isSolid on an empty brick -- that is what the brick map is for -- so the two make EXACTLY THE
// SAME NUMBER OF isSolid CALLS, measured equal to the digit. The jump saves LOOP ITERATIONS and buys them with
// per-brick arithmetic: three modulos, three divisions, three floors, three multiplies. Measured on this
// fixture it runs about 0.72x the speed of the form it was meant to replace -- SLOWER BY ROUGHLY 39%.
//
// SO THE VERDICT INVERTS. It was kept out of the default because its equivalence was unproven. Its equivalence
// is now proven, and it still should not be the default, because THE OPTIMISATION IS NOT ONE. The stated reason
// and the real reason were different things -- the shape this tree keeps meeting -- and the note inviting a
// future round to promote it was an invitation to make the engine slower.

import { readFileSync } from "node:fs";
import { brickMapFromRLE, traverseBricked, traverseBrickedJumping } from "../../voxel/rleBrickMap.js";
import { buildIndex, getRLEIndexed } from "../../voxel/voxelRLE.js";
import { chunkToRLE, chunkIndexReal } from "../../voxel/rleWorldBridge.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);

const SX = 48, SY = 32, SZ = 48, DIMS = { sx: SX, sy: SY, sz: SZ };
function terrain(seed = 1) {
    const v = new Uint8Array(SX * SY * SZ);
    for (let x = 0; x < SX; x++) for (let z = 0; z < SZ; z++) {
        const h = Math.min(SY - 1, Math.floor(9 + 5 * Math.sin((x + seed) * 0.19) * Math.cos(z * 0.15) + 3 * Math.sin((x + z) * 0.11)));
        for (let y = 0; y < h; y++) v[chunkIndexReal(x, y, z, DIMS)] = (y === h - 1) ? 1 : (y >= h - 3 ? 4 : 6);
    }
    for (let x = 20; x < 27; x++) for (let z = 20; z < 27; z++) for (let y = 22; y < 27; y++) v[chunkIndexReal(x, y, z, DIMS)] = 5;
    return v;
}
const rle = chunkToRLE(terrain(1), DIMS, chunkIndexReal), idx = buildIndex(rle);
const isSolid = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) ? false : getRLEIndexed(rle, idx, x, y, z) !== 0;
const map = brickMapFromRLE(rle);

// FIVE ORIGINS, NOT ONE. The prior measurement swept 4000 directions from a SINGLE point high above the middle
// of the world -- so every ray started in the same brick, in open sky, pointing down. A fan from one origin is
// one geometry sampled finely, not a varied test.
const ORIGINS = [
    [SX / 2 + 0.37, SY - 1.61, SZ / 2 + 0.29],   // the original: high, central, open
    [1.3, SY - 0.7, 1.7],                        // a corner, so rays leave the world early
    [SX - 2.4, SY - 3.2, 2.6],                   // the opposite corner
    [3.1, 4.4, SZ - 2.2],                        // LOW and inside the terrain's height band
    [SX / 3 + 0.5, SY / 2 + 0.5, SZ / 3 + 0.5],  // mid-height, near the floating block
];
// NINE BUDGETS DOWN TO ONE. maxSteps is where the two forms actually disagreed, so the sweep has to reach the
// values where the budget bites rather than sitting at 300 where it never does.
const BUDGETS = [300, 128, 64, 32, 16, 8, 4, 2, 1];
const FIELDS = ["hit", "vx", "vy", "vz", "nx", "ny", "nz", "steps", "queries"];

const rayset = [];
for (const ro of ORIGINS) for (let i = 0; i < 600; i++) {
    const a = i * 0.0619 + 0.007, b = (i % 89) * 0.0233 - 1.0;
    const rd = [Math.cos(a) * Math.cos(b), Math.sin(b) - 0.35, Math.sin(a) * Math.cos(b)];
    if (isSolid(Math.floor(ro[0]), Math.floor(ro[1]), Math.floor(ro[2]))) continue;
    rayset.push([ro, rd]);
}

// ---- 1. EQUIVALENCE, FIELD FOR FIELD ---------------------------------------------------------------------------
let N = 0, over = 0, qs = 0, qj = 0, tDiff = 0;
const mismatch = {};
{
    for (const ms of BUDGETS) for (const [ro, rd] of rayset) {
        const s = traverseBricked(ro[0], ro[1], ro[2], rd[0], rd[1], rd[2], isSolid, map, ms);
        const j = traverseBrickedJumping(ro[0], ro[1], ro[2], rd[0], rd[1], rd[2], isSolid, map, ms);
        N++; qs += s.queries; qj += j.queries;
        if (j.steps > ms) over++;
        for (const f of FIELDS) if (s[f] !== j[f]) mismatch[f] = (mismatch[f] || 0) + 1;
        if (s.hit && Math.abs(s.t - j.t) > 1e-12) tDiff++;
    }
    ok("!! the two forms agree on every reported field, over " + N + " rays",
        Object.keys(mismatch).length === 0,
        Object.keys(mismatch).length ? JSON.stringify(mismatch) :
        FIELDS.join(", ") + " -- " + ORIGINS.length + " origins x " + BUDGETS.length + " step budgets. The " +
        "numerical divergence the source note was written to worry about does not occur on this fixture");
    ok("...including t, which is where an n*tDelta jump would show up first",
        tDiff === 0,
        "the accumulated ray parameter is identical to within 1e-12 on every hit. Adding n*tDelta once is not " +
        "the same float as adding tDelta n times, and here the difference never reached the answer");
    ok("!! the jumping form now HONOURS its step budget",
        over === 0,
        "0 overshoots. Before this round the same sweep put 6667 rays past their own maxSteps by up to 20 " +
        "voxels, while the stepping form was inside it every time -- so the two disagreed about where a ray " +
        "was allowed to END, and that showed up as a step-count difference that read like float noise");
}

// ---- 2. THE OPTIMISATION IS NOT ONE, AND THAT IS DETERMINISTIC ------------------------------------------------------
{
    ok("!! the jump saves EXACTLY ZERO isSolid queries",
        qs === qj && qs > 0,
        qs + " queries either way. traverseBricked ALREADY skips isSolid on an empty brick -- that is what the " +
        "brick map is FOR -- so there was never a query left for the jump to save. It saves loop ITERATIONS and " +
        "pays for them in per-brick arithmetic: three modulos, three divisions, three floors, three multiplies");

    // TIMING IS REPORTED, NEVER ASSERTED. A speed threshold is a flaky gate, and this file would start failing
    // on a loaded machine for reasons that have nothing to do with the code. The DETERMINISTIC half of the claim
    // is the query count above; this is the corroborating measurement, printed so the next person sees a number
    // rather than an opinion.
    const bench = (fn) => {
        let h = 0; const t0 = process.hrtime.bigint();
        for (let r = 0; r < 2; r++) for (const [ro, rd] of rayset) {
            if (fn(ro[0], ro[1], ro[2], rd[0], rd[1], rd[2], isSolid, map, 300).hit) h++;
        }
        return { ms: Number(process.hrtime.bigint() - t0) / 1e6, h };
    };
    bench(traverseBricked); bench(traverseBrickedJumping);              // warm both
    const a = bench(traverseBricked), b = bench(traverseBrickedJumping);
    say("TIMING (reported, not asserted): stepping " + a.ms.toFixed(1) + " ms, jumping " + b.ms.toFixed(1) +
        " ms, ratio " + (a.ms / b.ms).toFixed(3) + "x over " + rayset.length + " rays. Measured at roughly 0.72x " +
        "when this was written -- the jump is SLOWER than the form it was meant to replace.");
    ok("...and both find the same hits while being timed",
        a.h === b.h,
        a.h + " hits each. A benchmark whose two sides do different amounts of work measures nothing");
}

// ---- 3. THE SOURCE MUST NOT STILL INVITE A PROMOTION -------------------------------------------------------------
// The old note said the jumping form "becomes a candidate for the default" once the divergence is shown to be
// zero. The divergence IS zero and it is still the wrong choice, so leaving that sentence in place would send
// the next round to do the opposite of what the evidence says. A REMEMBERED ASSUMPTION LEFT STANDING AS A
// STANDING INVITATION is the same shape as a diagnosis recorded as an invariant.
{
    const src = readFileSync(new URL("../../voxel/rleBrickMap.js", import.meta.url), "utf8");
    ok("!! the source no longer calls the jumping form a candidate for the default",
        !/candidate for the default/i.test(src),
        "the equivalence it asked for exists now, and it says do not promote this. A note that outlived its " +
        "own condition is worse than no note, because it reads as current guidance");
    ok("...and traverseBricked is still what the one production caller gets",
        /export function traverseBricked\(/.test(src),
        "volume-cache.html is the only caller outside the gates, and nothing in this round changed which " +
        "function it reaches");
}

console.log();
if (fails) { console.log("brickJumpEquivalence-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("brickJumpEquivalence-selfcheck: all checks pass");
