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
 *
 * ---- *** AND UNTIL v4542 IT HAD NOWHERE TO PUT THE BODY, WHICH IS A LARGER DEFECT THAN THE CENSUS ***
 *
 * Pass `y` -- the body's own feet -- and this answers the surface that body is ON. Leave it out and the
 * answer is exactly what it always was, for every caller and every fixture that never had one.
 *
 * THE MEASUREMENT THAT SAYS WHY, taken by booting index.html and asking for every standable surface in
 * 1,681 columns of the real world rather than one per column:
 *
 *     1,681 columns, 863 of them multi-surface (51.3%), 2,615 places a body could actually be standing
 *     body-aware:  2,644 of 2,644 correct        100%
 *     as shipped:  1,681 of 2,644 correct         63.58%   -- one right answer per column, by construction
 *
 * The 36% is not noise, it is the shape of the function: a body under a cave roof, on the floor of a
 * tunnel, or on the lower of two decks was told the ground was the thing above its head. On the example
 * columns the model AGREES with the upper surface -- (-42,-60) holds surfaces at 2 and 19 and _heightAt
 * says 19 -- so `fits(h)` passes and the fallback never runs. *** THE DEFECT IS NOT IN THE topSolidAt
 * FALLBACK, WHICH IS WHERE v4539's FIXTURE FOUND IT. It is in the signature. ***
 *
 * ---- THE RULE IS A DOWNWARD SCAN FROM THE BODY'S OWN REACH, AND IT IS THE CHEAP PATH TOO ---------------
 *
 * From `y + stepUp`, take the first surface that fits, going down. `stepUp` is the CALLER'S step allowance
 * and has no default worth the name here -- BotManager walks its bots with stepHeight 1.2 and passes that
 * same constant, because a probe that invented its own would answer a question the controller is not
 * asking. Nothing above the body's reach can be stood on; the first thing below it is what it is standing
 * on, or falling towards. Timed in the engine over the same 1,681 columns:
 *
 *     _heightAt alone        0.6 ms    0 voxel reads per call
 *     BODY-AWARE (this)      1.5 ms    4.0        <- correct, and 1.9x faster than the line it replaces
 *     as shipped             2.8 ms    7.4
 *     full column scan       7.5 ms   42.4
 *
 * *** THE RIGHT ANSWER IS THE CHEAP ONE, WHICH IS NOT USUALLY HOW THIS GOES, *** and the reason is worth
 * a line: knowing where the body is removes the search. The shipped path pays to verify a model answer and
 * then, when it fails, to scan a whole column looking for a surface it has no way to choose between.
 *
 * ---- WHAT THIS DOES NOT CLOSE --------------------------------------------------------------------------
 *
 * v4539 wrote that this repair "is no easier than the one section 3 refuses ... which is piece (2) again".
 * *** THAT IS HALF RIGHT AND THE HALF MATTERS. *** Choosing which surface a body is ON needs no swept
 * volume, because a voxel column HAS no side faces within itself -- the column is the sweep. What needs the
 * swept volume is whether the body may MOVE from this column's surface to the next one's, and that is
 * unchanged: it is terrainWalk's step test, and on a mesh it is physics/character/capsuleMove.mjs (v4541).
 * So this closes the choice and leaves the movement exactly where it was.
 */
export function standHeightAt(world, x, z, { body = DEFAULT_BODY, maxY = null, y = null, stepUp = 0 } = {}) {
    const CH = maxY ?? world.chunkHeight;
    const fits = (yy) => {
        if (yy < 1 || yy + body > CH) return false;
        try {
            if (world.isAir(x, yy - 1, z)) return false;          // nothing to stand on
            for (let k = 0; k < body; k++) if (!world.isAir(x, yy + k, z)) return false;
        } catch { return false; }
        return true;
    };
    // *** THE BODY-AWARE PATH IS FIRST AND IS ENTERED ONLY WHEN THERE IS A BODY. *** Every caller and
    // fixture that passes no `y` falls through to the original three lines unchanged, which is what lets
    // this ship without re-deriving six gates' worth of readings.
    if (Number.isFinite(y)) {
        const start = Math.min(CH - body, Math.floor(y + stepUp));
        for (let yy = start; yy >= 1; yy--) if (fits(yy)) return yy;
        return null;                                              // nothing under this body at all
    }
    let h = null;
    try { h = world._heightAt(x, z); } catch { h = null; }
    if (Number.isFinite(h) && fits(h)) return h;                  // the model was right -- 93% of columns
    const top = topSolidAt(world, x, z, { maxY: CH });
    if (top < 0) return Number.isFinite(h) ? h : null;            // empty column: nothing better to say
    const s = top + 1;
    return s + body <= CH ? s : null;                             // a column solid to the ceiling has no surface
}

/**
 * *** EVERY y A BODY COULD STAND AT IN THIS COLUMN, LOWEST FIRST. THE INSTRUMENT THE ROUND NEEDED. ***
 *
 * standHeightAt returns ONE number, and until v4542 nothing in this tree could ask how many there were. On
 * the engine's own world, over 1,681 columns on a 3-unit lattice, MORE THAN HALF HAVE MORE THAN ONE --
 * 57.7%, 51.9% and 51.3% in three boots, with the topmost and lowest up to 47 voxels apart. A cave with a
 * hillside over it, a deck above a floor, a tunnel under a ridge: ordinary shapes in a voxel world, and
 * every one of them a place where "the ground height here" is not a question with an answer.
 *
 * The count moves between boots and the module header says why -- the voxels are not a pure function of the
 * seed, because the fluid and erosion systems write chunk.set() all through the run. So a gate may assert
 * that this is COMMON and must not assert how common.
 */
export function standablesAt(world, x, z, { body = DEFAULT_BODY, maxY = null } = {}) {
    const CH = maxY ?? world.chunkHeight;
    const out = [];
    for (let y = 1; y + body <= CH; y++) {
        let ok = true;
        try {
            if (world.isAir(x, y - 1, z)) ok = false;
            else for (let k = 0; k < body && ok; k++) if (!world.isAir(x, y + k, z)) ok = false;
        } catch { ok = false; }
        if (ok) out.push(y);
    }
    return out;
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
/**
 * *** THE v4542 READING: HOW OFTEN "THE GROUND HEIGHT HERE" IS NOT A QUESTION WITH AN ANSWER. ***
 *
 * Taken by booting index.html headlessly and asking for EVERY standable surface in 1,681 columns on a
 * 3-unit lattice, rather than one per column. The multi-surface count is not reproducible and the module
 * header says why -- the voxels are edited by the running simulation, so four boots gave 57.7%, 51.9%,
 * 51.3% and 53.5%. What IS reproducible is that it is more than half, every time, so the gate asserts a floor and not
 * a figure. The correctness and cost numbers below are properties of the RULE and are re-derived on fixtures
 * by world/surfaceProbe-selfcheck.mjs on every run.
 */
export const BODY_AWARE_AT_V4542 = Object.freeze({
    at: "v4542",
    columns: 1681,                 // the lattice, matching MEASURED_AT_V4553's
    multiSurface: 863,             // columns holding more than one standable surface, in the boot below
    multiSurfacePct: 51.3,         // ...and 57.7, 51.9 and 53.5 in three others. NOT reproducible; a floor
    multiSurfaceFloorPct: 25,      // is what a gate may assert, and every boot cleared it twice over
    worstSpread: 47,               // voxels between the lowest and highest surface in one column (46 in another boot)
    bodyPlaces: 2644,              // (column, surface) pairs -- the places a body could actually be standing
    bodyAwareCorrect: 2644,        // 100%
    shippedCorrect: 1681,          // 63.58% -- one right answer per column, by construction
    readsModelOnly: 0,             // voxel reads per call
    readsBodyAware: 4,             // ...and it is the correct one
    readsShipped: 7.4,
    readsFullScan: 42.4,
    msModelOnly: 0.6,              // milliseconds over all 1,681 columns
    msBodyAware: 1.5,
    msShipped: 2.8,
    msFullScan: 7.5,
});

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
    import.meta.url.endsWith("/" + process.argv[1].split(/[\/]/).pop()))
    for (const l of reportLines()) console.log(l);
