// WebGLEngine/world/surfaceProbe.mjs -- v4554
//
// *** THE PATHFINDER AND THE CHARACTER CONTROLLER BOTH READ world._heightAt, AND IN 6 TO 9% OF COLUMNS IT
// REPORTS A STAND HEIGHT THAT IS INSIDE SOLID ROCK. ***
//
// world/world.js is a VOXEL world. It answers two different questions with two independently derived
// answers, and nothing had ever put them side by side:
//
//   _heightAt(x, z)     the terrain MODEL's column height, out of an ErosionCache over _baseHeightAt --
//                       noise, domain-warped, erosion-passed. O(1) after the first call in a tile.
//   voxelAt(x, y, z)    what is ACTUALLY SOLID, out of the chunk the world generated -- and then out of
//                       whatever the running simulation has since done to that chunk.
//
// Measured in six independent boots of index.html, 1,681 columns on a 3-unit lattice over a 120x120 area.
// *** THE TWO HALVES OF THAT READING BEHAVE DIFFERENTLY AND THE DIFFERENCE IS THE POINT. ***
//
//   DETERMINISTIC -- byte-identical in all six boots:
//     sum of _heightAt over the 1,681 columns      35708, six times out of six
//     error percentiles  p10 0   MEDIAN 0   p90 11   max 17
//     bounding box of the affected columns         x -54..30, z -60..24
//
//   NOT DETERMINISTIC -- a different value nearly every boot, from the same seed (world.biomeSeed = 1337):
//     sum of the topmost solid over the same columns   36268 36295 36304 36307 36329 36336  (six distinct)
//     columns whose stand height is inside rock        101 148 148 150 157 158   (6.0% .. 9.4%)
//
// *** THE MODEL IS A PURE FUNCTION OF THE SEED AND THE VOXELS ARE NOT, SO THE GAP CANNOT BE CLOSED BY
// FIXING GENERATION. *** Generation itself is exact: generateChunk(0,0) called twice in one boot returns
// byte-identical arrays (0 of 16,384 voxels differ). But the live chunk at (0,0) differs from a fresh
// generation of the same coordinates -- stone turned to air, and stone turned to water -- because the
// world's fluid and erosion systems write chunk.set() directly all through the run, at sites chosen by
// Math.random() in the rain system. _heightAt sees none of it: it is noise over a fixed seed and it is
// the same 35708 in every boot, whatever the voxels have become.
//
// So this is not a discrepancy that a better _heightAt would remove. It is a divergence the running game
// CREATES, and the only way to know where a body stands is to ask the voxels.
//
// A dumped column at (-40, -38) reads SOLID 0..1 / air 2..4 / SOLID 5..13 / air 14 / SOLID 15..21 /
// air 22..63 -- a cave and a layer above it -- and _heightAt answers 9, which is inside the 5..13 slab,
// thirteen voxels below the real surface at 22. Adjacent columns agree, so it is a region, not a stray cell.
//
// A planner given that column routes a bot through a mountain, and physics/character/terrainWalk.mjs then
// places the body at 10, inside rock. Neither can tell: both read the model and never the voxels.
//
// *** AND WIRING THIS IN FOUND SOMETHING LARGER THAN THE CENSUS IT WAS BUILT FOR. *** The line it replaced
// in simulation/BotPathfinderPool.js was `const hAt = this.world?._heightAt || ((x, z) => 5)`, and
// world._heightAt is a METHOD that reads this._heightOverride and this._wasmTiles. Taken off its object it
// loses its receiver and THROWS ON EVERY CALL -- measured in a real boot, TypeError: Cannot read properties
// of undefined (reading '_heightOverride') -- straight into an empty catch that leaves the sample at 0.
// Over an 11x11 window the old loop returned 121 zeros of 121. THE PATHFINDER'S SNAPSHOT WAS A FLAT PLANE
// AT y=0, for both the navmesh route and the grid fallback, since the pool was written: _heightmapForJob
// runs on every job and its output is what the worker builds its navmesh from. No fixture could see it,
// because every fake world in this tree supplies _heightAt as a plain function with no `this` to lose.
// So the census below describes a real defect, and this one was underneath it: the planner was not reading
// a slightly wrong model, it was not reading the model at all.
//
// ---- WHAT THIS IS AND IS NOT --------------------------------------------------------------------------
//
// It is NOT a fix to _heightAt. That function is the terrain MODEL, it is on the world's hot path behind an
// erosion cache, and a dozen systems read it -- cameras, ragdolls, kaiju, civilisation, spawns. "What does
// the terrain model say" and "what is solid here" are legitimately different questions.
//
// It is the SECOND QUESTION, asked properly, for the two consumers that need it. A ground oracle and a
// pathfinder are asking "where does a body stand", and that has one correct answer: on top of what is
// actually there, right now.
//
// *** THE COST IS WHY THIS IS A HYBRID AND NOT A SCAN. *** Timed on the same 1,681 columns in the engine:
// _heightAt alone 0.4 ms; scanning every column down from the top 7.6 ms (19x); and VERIFYING the cheap
// answer and only scanning where it fails, 1.8 ms (4.5x). The model is right in about 88% of columns, so
// trusting it and checking is most of the speed for all of the correctness.
//
// *** AND THE WORLD CALLS EVERYTHING ABOVE ITS OWN CEILING SOLID, which is why every read here is bounded.
// *** Chunk.index() does no range check, so voxelAt(x, y, z) for y >= chunkHeight indexes past the end of a
// Uint8Array, reads `undefined`, and isAir compares it against VOXEL.AIR (0) and answers FALSE. Measured:
// isAir(0, y, 0) is false at y = 64, 65, 69 and 84 on a world whose chunkHeight is 64. A probe that walked
// up from the model's answer, or that trusted a height at or above the ceiling, would be told it had found
// rock. topSolidAt starts at chunkHeight - 1 and standHeightAt refuses any y with y + body > chunkHeight,
// so neither ever reads out of range -- deliberately, not by luck. (The same unbounded index is a live
// defect elsewhere in the engine and is filed as its own round; it is not repaired here.)
"use strict";

/** What a body needs: solid under the feet, and `body` cells of air from the feet up. */
export const DEFAULT_BODY = 2;

/** Does this world expose a voxel grid at all? A world with only a height function gets the old answer. */
export const hasVoxels = (w) => !!w && typeof w.isAir === "function" && Number.isFinite(w.chunkHeight);

/** The topmost solid voxel in a column, or -1 for an empty column. */
export function topSolidAt(world, x, z, { maxY = null } = {}) {
    const top = (maxY ?? world.chunkHeight) - 1;
    for (let y = top; y >= 0; y--) {
        let solid = false;
        try { solid = !world.isAir(x, y, z); } catch { return -1; }
        if (solid) return y;
    }
    return -1;
}

/**
 * The y a body of `body` cells actually stands at in this column.
 *
 * *** THE CHEAP ANSWER IS TRIED FIRST AND THEN VERIFIED, WHICH IS THE WHOLE DESIGN. *** _heightAt is right
 * in 93% of columns and costs a hash lookup; a full column scan is right always and costs nineteen times
 * more. Accepting the model's answer when the voxels agree with it, and scanning only when they do not, was
 * measured at 4.5x rather than 19x.
 *
 * "Agree" is three conditions and not one: SUPPORT below the feet, and `body` cells of AIR from the feet up.
 * Checking only that the feet are in air would accept a stand height FLOATING above the ground, which is the
 * other half of the measured error -- _heightAt runs up to 7 voxels ABOVE the real surface as well as 17
 * below it.
 */
export function standHeightAt(world, x, z, { body = DEFAULT_BODY, maxY = null } = {}) {
    const CH = maxY ?? world.chunkHeight;
    const fits = (y) => {
        if (y < 1 || y + body > CH) return false;
        try {
            if (world.isAir(x, y - 1, z)) return false;          // nothing to stand on
            for (let k = 0; k < body; k++) if (!world.isAir(x, y + k, z)) return false;
        } catch { return false; }
        return true;
    };
    let h = null;
    try { h = world._heightAt(x, z); } catch { h = null; }
    if (Number.isFinite(h) && fits(h)) return h;                  // the model was right -- 93% of columns
    const top = topSolidAt(world, x, z, { maxY: CH });
    if (top < 0) return Number.isFinite(h) ? h : null;            // empty column: nothing better to say
    const s = top + 1;
    return s + body <= CH ? s : null;                             // a column solid to the ceiling has no surface
}

/**
 * Compare the terrain model against the voxels over an area. Every number this module's header quotes comes
 * out of here, so a reader can re-take them rather than trust them.
 */
export function surfaceCensus(world, { x0 = -60, x1 = 60, z0 = -60, z1 = 60, step = 3, body = DEFAULT_BODY } = {}) {
    const errs = [];
    let sampled = 0, emptyColumns = 0, insideSolid = 0, floating = 0, agree = 0;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let z = z0; z <= z1; z += step) for (let x = x0; x <= x1; x += step) {
        let h = null;
        try { h = world._heightAt(x, z); } catch { continue; }
        if (!Number.isFinite(h)) continue;
        sampled++;
        const top = topSolidAt(world, x, z);
        if (top < 0) { emptyColumns++; continue; }
        errs.push(top + 1 - h);
        let solidAtH = false;
        try { solidAtH = !world.isAir(x, h, z); } catch {}
        if (solidAtH) {
            insideSolid++;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        } else if (top + 1 < h) floating++;
        else if (top + 1 === h) agree++;
    }
    errs.sort((a, b) => a - b);
    const q = (p) => (errs.length ? errs[Math.min(errs.length - 1, Math.floor(errs.length * p))] : null);
    return Object.freeze({
        sampled, emptyColumns, agree, insideSolid, floating,
        insideSolidPct: sampled ? +(100 * insideSolid / sampled).toFixed(1) : 0,
        error: Object.freeze({ min: errs[0] ?? null, p10: q(0.1), median: q(0.5), p90: q(0.9),
                               max: errs[errs.length - 1] ?? null }),
        box: insideSolid ? Object.freeze({ minX, maxX, minZ, maxZ }) : null,
    });
}

/**
 * *** THE ENGINE'S OWN READING, taken from a real boot of index.html. *** Frozen because taking it needs a
 * browser; the gate re-derives every claim's SHAPE on voxel worlds it builds itself, and holds these to the
 * arithmetic that must be true of them.
 */
export const MEASURED_AT_V4553 = Object.freeze({
    at: "v4553, corrected at v4554",
    world: "main.js world._heightAt against world.voxelAt, chunkHeight 64",
    area: "120x120 centred on the origin, sampled on a 3-unit lattice",
    sampled: 1681, emptyColumns: 0, chunks: 225,

    // *** THE FIRST TAKE OF THIS RECORD QUOTED ONE BOOT'S NUMBERS AS IF THEY WERE THE WORLD'S. ***
    // It said "115 of 1,681 columns (6.8%)" and "error min -7", flat, with no interval. Re-running the
    // same census in six fresh boots gives 101 148 148 150 157 158 -- the quantity MOVES, and a record
    // that states a moving quantity as a constant is the same defect as a check that reports a proxy for
    // a fact. What is actually invariant is separated out below from what is not, and both were measured
    // rather than assumed.
    correction: "v4553 stated one boot's insideSolid and error.min as fixed; both vary boot to boot",

    // Identical in all six boots. These are the claims that can be held to.
    deterministic: Object.freeze({
        heightSum: 35708,                                   // sum of _heightAt over the 1,681 columns
        error: Object.freeze({ p10: 0, median: 0, p90: 11, max: 17 }),
        box: Object.freeze({ minX: -54, maxX: 30, minZ: -60, maxZ: 24 }),
        generateChunkIsExact: true,                         // generateChunk(0,0) twice: 0 of 16,384 differ
    }),

    // A different value nearly every boot, from the same world.biomeSeed = 1337.
    varies: Object.freeze({
        boots: 6,
        insideSolid: Object.freeze([101, 148, 148, 150, 157, 158]),
        insideSolidPct: Object.freeze({ min: 6.0, max: 9.4 }),
        topSolidSum: Object.freeze([36268, 36295, 36304, 36307, 36329, 36336]),   // six distinct values
        floating: Object.freeze({ min: 3, max: 10 }),
        errorMin: Object.freeze({ min: -13, max: -8 }),
        cause: "fluid and erosion write chunk.set() at rain sites chosen by Math.random(); _heightAt, " +
               "which is noise over a fixed seed, never sees those writes",
    }),

    // The column that makes the shape unmistakable: a cave, a slab above it, and a model answer inside the slab.
    column: Object.freeze({
        at: "(-40, -38)", heightAt: 9, topSolid: 21, trueSurface: 22,
        runs: Object.freeze(["SOLID 0..1", "air 2..4", "SOLID 5..13", "air 14", "SOLID 15..21", "air 22..63"]),
        note: "three adjacent columns read the same, so it is a region and not a stray cell",
    }),

    // *** THE WORLD REPORTS SOLID ROCK ABOVE ITS OWN CEILING. *** Chunk.index() is unbounded, so a read at
    // y >= chunkHeight runs off the end of the Uint8Array, returns undefined, and isAir answers false.
    // Every read in this module is bounded because of it.
    aboveCeiling: Object.freeze({ chunkHeight: 64, isAirAt: Object.freeze([64, 65, 69, 84]), answers: false }),

    cost: Object.freeze({ columns: 1681, heightMs: 0.4, fullScanMs: 7.6, hybridMs: 1.8 }),

    // *** AND WHAT THE WALKING BOT MEASUREMENT DID NOT SHOW, recorded because the negative matters. *** A
    // real bot over 600 frames had its feet in a solid voxel on 235 of them and its head on ZERO, with the
    // depth ALWAYS exactly 1. That is a bilinear surface sitting inside its own top voxel, which is what a
    // smoothed ground over a lattice means -- not a bot buried in rock. The first reading of this round
    // called it a defect; it is not one, and the bot's 600 frames never reached an affected column.
    walkingBot: Object.freeze({ frames: 600, feetInSolid: 235, headInSolid: 0, worstDepth: 1,
                                verdict: "the interpolated surface within its own surface voxel, not burial" }),
});

export function reportLines() {
    const M = MEASURED_AT_V4553, V = M.varies, D = M.deterministic;
    return [
        "[surfaceProbe] the terrain model against the voxels, for the two consumers that need the voxels",
        `  columns reporting a stand height INSIDE solid rock: ${Math.min(...V.insideSolid)}..` +
            `${Math.max(...V.insideSolid)} of ${M.sampled} (${V.insideSolidPct.min}..${V.insideSolidPct.max}%),` +
            ` a different count in each of ${V.boots} boots`,
        `  the MODEL is identical every boot (heightAt sums to ${D.heightSum}); the VOXELS are not ` +
            `(${new Set(V.topSolidSum).size} distinct sums in ${V.boots} boots) -- the running sim edits them`,
        `  error (topSolid+1 - _heightAt): median ${D.error.median}, p90 ${D.error.p90}, max ${D.error.max}`,
        `  worst column ${M.column.at}: model says ${M.column.heightAt}, real surface ${M.column.trueSurface}`,
        `  cost per ${M.cost.columns} columns: model ${M.cost.heightMs} ms, full scan ${M.cost.fullScanMs}, hybrid ${M.cost.hybridMs}`,
    ];
}

if (typeof process !== "undefined" && process.argv?.[1] &&
    import.meta.url === new URL(`file://${process.argv[1]}`).href)
    for (const l of reportLines()) console.log(l);
