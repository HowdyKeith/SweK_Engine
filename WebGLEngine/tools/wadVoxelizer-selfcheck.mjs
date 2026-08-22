// tools/wadVoxelizer-selfcheck.mjs -- v3736
//
// *** tools/wadVoxelizer.js IS 457 LINES WITH FIVE EXPORTED PURE FUNCTIONS AND HAD NO GATE AT ALL. *** This is
// its first. It arrived from a question about somebody else's repo, which is worth recording: Keith asked
// whether achrefelouafi/LinearAbiltyCastingThreeJS could tie into the WAD games, and THAT REPO'S OWN "known
// rough edges" section answers it -- "the ground is a single plane at y = 0, and the aim raycast targets that
// plane", and of its far-cast circle: "neither would drape over a step". SO THE QUESTION BECAME ONE ABOUT
// SweK: what IS a step here? The answer is in this file, and it had nothing checking it.
//
// *** THE KEY, AND IT IS NOT A TRANSCRIPTION OF ANYTHING THIS MODULE WAS TOLD. *** The voxelizer quantises
// EACH sector independently:
//     floorY[si] = baseY + max(0, floor(sector.floorH / unitsPerVoxel))
// A targeting layer -- an aim indicator, a step-up check, a decal draped on the ground -- would naturally ask
// "how tall is this step" as floor((floorH_a - floorH_b) / unitsPerVoxel). THOSE ARE DIFFERENT FUNCTIONS, and
// floor(a/u) - floor(b/u) != floor((a-b)/u) in general.
//
// MEASURED over every pair 0 <= b <= a <= 256 at unitsPerVoxel 16: 33153 pairs, 14640 DISAGREE -- 44.2% --
// and the disagreement is ALWAYS EXACTLY ONE VOXEL. Example: floorH 16 over floorH 1 is ONE voxel of step in
// the world the player collides with, and ZERO by the height difference.
//
// *** ONE VOXEL IS THE DIFFERENCE BETWEEN STEPPING UP AND BEING BLOCKED, so this is not a rounding curiosity:
// any ability, decal or indicator that computes its own ground height from sector.floorH RATHER THAN FROM THE
// VOXELS WILL DISAGREE WITH THE FLOOR THE PLAYER IS STANDING ON, on nearly half of all sector pairs. THE
// SINGLE-PLANE ASSUMPTION IN THAT REPO IS THE SAME BUG WITH THE STEP SET TO ZERO. ***
//
// WHEN A CHECK HERE GOES RED: the fix is in the voxelizer or the caller, NEVER in this file's arithmetic --
// the disagreement is derived from floor(), not measured with a tolerance, and it does not have error bars.
// AND THE CORRECT RESPONSE TO "44.2% is uncomfortable" IS NOT TO CHANGE THE QUANTISER: it is for every ground
// consumer to READ THE VOXEL COLUMN, which is the only thing that is true by construction.

import { pointInPolygon, pointToSubsector, subsectorToSector, buildSectorPolys, voxelizeWadMap, hasBSPData, mapBounds } from "./wadVoxelizer.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

// ---- THE FIXTURE. Two rooms side by side sharing one wall, at DIFFERENT floor heights. The geometry is OURS,
// so the truth is ours -- the CT phantom's argument (tomographyBind): a reconstruction lab is honest because
// the answer is an image we built rather than a published constant to be matched.
//   room A: x 0..128, z 0..128, floorH 0
//   room B: x 128..256, z 0..128, floorH 24     <- 24 is DELIBERATE: not a multiple of 16
const V = [0, 0, 128, 0, 128, 128, 0, 128, 256, 0, 256, 128];   // vertices, flat pairs
let bsp;                                   // assigned in section 4, reused in section 5
const mkMap = (floorA, floorB) => ({
    vertices: V,
    lines: [],                                   // voxelizeWadMap requires the field; walls are not the subject here
    sectors: [
        { floorH: floorA, ceilH: 128, floorTex: "FLOOR4_8", light: 160 },
        { floorH: floorB, ceilH: 128, floorTex: "FLAT1", light: 160 },
    ],
    sidedefs: [{ sector: 0 }, { sector: 1 }],
    linedefs: [
        { v1: 0, v2: 1, rightSide: 0, leftSide: 0xFFFF },
        { v1: 1, v2: 2, rightSide: 0, leftSide: 1 },     // the SHARED wall -- the step
        { v1: 2, v2: 3, rightSide: 0, leftSide: 0xFFFF },
        { v1: 3, v2: 0, rightSide: 0, leftSide: 0xFFFF },
        { v1: 1, v2: 4, rightSide: 1, leftSide: 0xFFFF },
        { v1: 4, v2: 5, rightSide: 1, leftSide: 0xFFFF },
        { v1: 5, v2: 2, rightSide: 1, leftSide: 0xFFFF },
    ],
});

// ---- 1. THE POLYGONS COME BACK, AND EACH POINT LANDS IN ITS OWN ROOM ---------------------------------------
console.log("1. THE GEOMETRY RESOLVES -- point in room A is not point in room B");
{
    const polys = buildSectorPolys(mkMap(0, 24));
    ok("!! buildSectorPolys closes a loop for each of the two sectors",
        polys.size === 2 && [...polys.values()].every((p) => p.length >= 1),
        `${polys.size} sectors with polygons -- the loops are chained from undirected edges, which is where a ` +
        `malformed map silently produces an open ring and a floor that never fills`);

    const inA = [...polys.get(0)].some((poly) => pointInPolygon(64, 64, poly));
    const inB = [...polys.get(1)].some((poly) => pointInPolygon(192, 64, poly));
    const crossA = [...polys.get(0)].some((poly) => pointInPolygon(192, 64, poly));
    ok("!! a point in room A is inside A's polygon and NOT inside B's, and the reverse",
        inA && inB && !crossA,
        "asserted BOTH ways: a containment test that returns true everywhere would pass the first half alone");
}

// ---- 2. THE KEY: WHAT A STEP IS IN VOXELS ------------------------------------------------------------------
console.log("\n2. THE STEP, AND THE TWO WAYS OF ASKING FOR IT THAT DISAGREE 44.2% OF THE TIME");
{
    const ups = 16;
    // Written out here from the two floor heights -- NOT imported from the voxelizer, because a check that
    // re-derives its answer from the code it describes never tests it (v3724, and v3733 in my own new code).
    const q = (h) => Math.max(0, Math.floor(h / ups));

    let disagree = 0, total = 0, worst = 0;
    for (let a = 0; a <= 256; a++) for (let b = 0; b <= a; b++) {
        const viaVoxels = q(a) - q(b);
        const viaHeights = Math.floor((a - b) / ups);
        total++;
        if (viaVoxels !== viaHeights) { disagree++; worst = Math.max(worst, Math.abs(viaVoxels - viaHeights)); }
    }
    const frac = disagree / total;
    ok("!! *** THE VOXEL STEP AND THE HEIGHT-DIFFERENCE STEP DISAGREE ON NEARLY HALF OF ALL SECTOR PAIRS ***",
        Math.abs(frac - 0.4416) < 0.01 && worst === 1,
        `${disagree} of ${total} pairs (${(100 * frac).toFixed(1)}%), worst |difference| ${worst} voxel. ` +
        `floor(a/u) - floor(b/u) IS NOT floor((a-b)/u), and ONE VOXEL IS THE DIFFERENCE BETWEEN STEPPING UP ` +
        `AND BEING BLOCKED`);

    ok("!! ...and the disagreement is EXACTLY one voxel, never more -- which is why it is easy to miss",
        worst === 1,
        "a defect that is off by ten is found in a minute; one that is off by one on 44% of cases looks like " +
        "an alignment problem with the art");

    // The canonical case, asserted on its own so a worst-of aggregate cannot carry it.
    ok("!! the named example holds: floorH 16 over floorH 1 is ONE voxel of step and ZERO by height difference",
        q(16) - q(1) === 1 && Math.floor((16 - 1) / ups) === 0);
}

// ---- 3. THE VOXELS THE PLAYER ACTUALLY STANDS ON -----------------------------------------------------------
console.log("\n3. AND THE VOXELIZER'S OWN FLOOR AGREES WITH THE VOXEL FORM, NOT THE HEIGHT FORM");
// *** WHICH PATH THIS SECTION DRIVES, AND IT IS NOT THE ONE I FIRST CLAIMED. wadVoxelizer HAS TWO FLOOR
// FILLS: a BSP branch gated on hasBSPData(parsedMap) (nodes + subsectors + segs) quantising at line 341, and
// a HEURISTIC FALLBACK quantising at line 388. THIS SYNTHETIC MAP HAS NO BSP LUMPS, SO EVERY ASSERTION BELOW
// EXERCISES THE FALLBACK. I found that by planting a THROW at line 341 and watching the gate stay green --
// v3718's mistake exactly (planting a path the run never executes), caught only because the first plant did
// not fire. A PLANT THAT DOES NOT FIRE IS EITHER A FINDING OR A BADLY CHOSEN PLANT, and this was the second.
// PLANTED ON LINE 388 INSTEAD -- floor() -> round() -- the rounding-mode check below GOES RED, so it has teeth
// on the path it actually drives.
// *** THE BSP BRANCH IS UNGRADED AND THAT IS THE FIRST THING A NEXT ROUND SHOULD CLOSE: it is the path real
// Doom maps take, the fallback is what runs without nodes, and NOTHING HERE HAS EVER EXERCISED IT. Reaching it
// needs a fixture carrying nodes/ssectors/segs, which means inventing BSP structure -- real work, and not to be
// faked casually, because a wrong BSP fixture would grade the traversal against my own misunderstanding. ***
{
    const ups = 16, baseY = 0;
    const placed = new Map();
    const world = { setVoxel(x, y, z, m) { placed.set(x + "," + y + "," + z, m); } };
    const map = mkMap(0, 24);
    let threw = null;
    try {
        voxelizeWadMap(world, map, { unitsPerVoxel: ups, baseY, centerOnPlayerStart: false });
    } catch (e) { threw = e; }

    ok("the voxelizer runs on a synthetic map and fills something",
        !threw && placed.size > 0,
        threw ? "threw: " + threw.message : placed.size + " voxels placed");

    if (!threw && placed.size > 0) {
        // Column heights either side of the shared wall, read from the VOXELS rather than from the sectors.
        const topAt = (vx, vz) => {
            let top = null;
            for (const k of placed.keys()) {
                const [x, y, z] = k.split(",").map(Number);
                if (x === vx && z === vz && (top === null || y > top)) top = y;
            }
            return top;
        };
        const a = topAt(4, 4), b = topAt(12, 4);
        // *** THIS PAIR PINS THE ROUNDING MODE, AND IT TOOK A PLANT THAT DID NOT FIRE TO NOTICE IT WAS ONLY A
        // REPORT. Changing floor() to round() in the sector quantiser left the (1,16) assertion below GREEN --
        // round(1/16)=0 and round(16/16)=1, the same step -- so that fixture cannot see the rounding mode at
        // all. floorH 24 is where they part: floor(24/16)=1 but round(1.5)=2. TWO DEFECTS, TWO FIXTURES, AND
        // NEITHER SUBSTITUTES FOR THE OTHER. ***
        ok("!! the sector quantiser FLOORS rather than rounds, pinned by a height that separates them",
            a === 0 && b === 1,
            "room A (floorH 0) y=" + a + ", room B (floorH 24) y=" + b + ". floor(24/16) = 1; round(24/16) = " +
            "round(1.5) = 2. A quantiser that rounded would put room B one voxel higher than the geometry says " +
            "-- and the (1,16) pair below would NOT notice, which is why both are here");

        report("the two floors, read back from the voxels",
            "room A (floorH 0) top voxel y=" + a + ", room B (floorH 24) top voxel y=" + b +
            ". Expected by the VOXEL form: " + (Math.floor(24 / ups) - Math.floor(0 / ups)) +
            "; by the HEIGHT-DIFFERENCE form: " + Math.floor((24 - 0) / ups) +
            " -- THIS PAIR AGREES (24 and 0 both land cleanly), which is exactly why a fixture chosen for " +
            "convenience would have missed the whole finding.");

        // *** AND NOW THE PAIR THAT DISAGREES, WHICH IS WHAT MAKES THIS SECTION LOAD-BEARING RATHER THAN A
        // REPORT: floorH 16 over floorH 1. The voxel form says ONE step; the height difference says ZERO.
        // The question is which one the SHIPPED voxelizer builds, and the answer is not arithmetic -- it is
        // whatever the code does. ***
        const placed2 = new Map();
        const world2 = { setVoxel(x, y, z, m) { placed2.set(x + "," + y + "," + z, m); } };
        voxelizeWadMap(world2, mkMap(1, 16), { unitsPerVoxel: ups, baseY, centerOnPlayerStart: false });
        const topAt2 = (vx, vz) => {
            let top = null;
            for (const k of placed2.keys()) {
                const [x, y, z] = k.split(",").map(Number);
                if (x === vx && z === vz && (top === null || y > top)) top = y;
            }
            return top;
        };
        const lo = topAt2(4, 4), hi = topAt2(12, 4);
        ok("!! *** THE SHIPPED VOXELIZER BUILDS THE VOXEL STEP, NOT THE HEIGHT-DIFFERENCE STEP ***",
            lo !== null && hi !== null && (hi - lo) === 1,
            "floorH 1 -> top voxel y=" + lo + ", floorH 16 -> top voxel y=" + hi + ", so the step the player " +
            "collides with is " + (hi - lo) + " voxel. THE HEIGHT DIFFERENCE (16-1=15) DIVIDED BY 16 IS ZERO -- " +
            "a targeting layer using it would draw its indicator flat across a step the player cannot walk over. " +
            "THIS IS THE ANSWER TO WHETHER A FLAT-PLANE GROUND INDICATOR TIES IN: not without reading the voxels");
    }
}

// ---- 4. THE BSP BRANCH, WHICH v3736 LEFT UNGRADED AND PROVED UNREACHED ------------------------------------
console.log("\n4. THE BSP BRANCH -- the path a real Doom map takes, reached at last");
{
    const ups = 16, baseY = 0;
    // *** THE BSP FIXTURE. v3736 could not reach this branch because the map carried no nodes/ssectors/segs,
    // and I said inventing them must not be done casually -- a wrong BSP fixture grades the traversal against
    // my own misunderstanding. SO THE FIXTURE IS DERIVED FROM THE TRAVERSAL'S OWN ARITHMETIC, WHICH IS FOUR
    // LINES LONG AND READABLE: pointToSubsector computes
    //     cross = (px - partX) * partDY - (py - partY) * partDX
    // and takes rightChild when cross <= 0. One partition down x = 128 with direction (0, 1) gives
    // cross = px - 128, so x <= 128 goes RIGHT and x > 128 goes LEFT. Room A is right, room B is left.
    // Children carry SUBSECTOR_FLAG (0x8000) and the code masks with 0x7FFF, so 0x8000|0 and 0x8000|1 are the
    // two subsectors. Each subsector's sector is resolved through its FIRST SEG -> linedef -> sidedef, so both
    // segs point at linedef 1 (the shared wall) and differ only in `side`.
    // *** THAT IS A FIXTURE BUILT FROM THE CODE UNDER TEST, WHICH IS A MIRROR RISK AND IS DECLARED: it cannot
    // prove the traversal matches DOOM. What it CAN do -- and what section 4 actually asserts -- is that the
    // BSP path and the HEURISTIC path, which share no code, AGREE about which sector holds a point and about
    // the floor heights they build. Two routes sharing no code is the thing worth having. ***
    bsp = (floorA, floorB) => Object.assign(mkMap(floorA, floorB), {
        nodes: [{ partX: 128, partY: 0, partDX: 0, partDY: 1, rightChild: 0x8000 | 0, leftChild: 0x8000 | 1 }],
        subsectors: [{ firstSeg: 0, segCount: 1 }, { firstSeg: 1, segCount: 1 }],
        segs: [{ linedef: 1, side: 0 }, { linedef: 1, side: 1 }],
        // *** AND THIS LINE IS A FINDING, NOT BOILERPLATE: hasBSPData() checks nodes + subsectors + segs and
        // RETURNS TRUE WITHOUT IT, but the BSP branch then reads parsedMap.bounds.minX and THROWS. The gate
        // crashed on exactly that -- a TypeError, not a red check, which is the shape that prints no FAIL
        // lines and reads like a gate that did not fire. THE PRECONDITION AND THE REQUIREMENT ARE TWO
        // DECLARATIONS ABOUT ONE THING AND THEY DISAGREE. Reported below rather than fixed here: widening
        // hasBSPData is a change to shipped behaviour and a map that has nodes but no bounds would then take
        // the fallback silently, which may or may not be what the callers want. ***
        bounds: { minX: 0, maxX: 256, minY: 0, maxY: 128 },
    });

    const m = bsp(0, 24);
    ok("!! the fixture actually reaches the BSP branch, which is the whole point of section 4",
        hasBSPData(m) === true,
        "v3736's fixture returned FALSE here and every assertion in it silently graded the fallback instead. " +
        "A THROW planted at the BSP quantiser is what exposed that -- the gate stayed green");

    ok("!! the traversal puts a point in room A in subsector 0 and a point in room B in subsector 1",
        pointToSubsector(m, 64, 64) === 0 && pointToSubsector(m, 192, 64) === 1,
        "asserted BOTH ways: a traversal that always returned 0 would pass the first half");

    ok("!! *** AND THE TWO ROUTES AGREE ABOUT WHICH SECTOR HOLDS THE POINT, SHARING NO CODE ***",
        subsectorToSector(m, pointToSubsector(m, 64, 64)) === 0 &&
        subsectorToSector(m, pointToSubsector(m, 192, 64)) === 1,
        "the BSP route is point -> partition test -> subsector -> first seg -> linedef -> sidedef -> sector. " +
        "The heuristic route in section 1 is point -> polygon containment over edges chained from linedefs. " +
        "THEY MEET NOWHERE IN BETWEEN, which is why agreeing is evidence rather than a tautology");

    // And the floors the BSP branch builds, read from the voxels.
    const placed = new Map();
    const world = { setVoxel(x, y, z) { placed.set(x + "," + y + "," + z, 1); } };
    voxelizeWadMap(world, m, { unitsPerVoxel: ups, baseY, centerOnPlayerStart: false });
    const topAt = (vx, vz) => {
        let top = null;
        for (const k of placed.keys()) {
            const [x, y, z] = k.split(",").map(Number);
            if (x === vx && z === vz && (top === null || y > top)) top = y;
        }
        return top;
    };
    const a = topAt(4, 4), b = topAt(12, 4);
    report("hasBSPData WAS NOT A SUFFICIENT PRECONDITION -- FIXED AT v3738, SEE SECTION 5",
        "it tests nodes + subsectors + segs and returned TRUE for a map with no `bounds`, after which the BSP " +
        "branch read parsedMap.bounds.minX and threw a TypeError. A CRASH IS NOT A RED CHECK -- it prints no " +
        "FAIL line, which is the failure shape this tree has hit five times. THE FIX WAS NOT THE OBVIOUS ONE: " +
        "the extent is DERIVED from the vertices the function already requires, rather than the guard being " +
        "widened -- which would have downgraded such a map to the heuristic fallback SILENTLY. Section 5 " +
        "asserts it, including that the derived and supplied forms build voxel-for-voxel identical output.");

    ok("!! the BSP branch floors at the same voxels the heuristic did -- floor(), not round()",
        a === 0 && b === 1,
        "room A y=" + a + ", room B y=" + b + ". floor(24/16)=1, round(1.5)=2. THE QUANTISER AT THE BSP SITE " +
        "IS A SEPARATE LINE FROM THE FALLBACK'S and had never been exercised, so this is the first time the " +
        "two have been shown to agree rather than assumed to");
}

// ---- 5. THE bounds DEFECT v3737 REPORTED, NOW FIXED BY DERIVING RATHER THAN GUARDING --------------------
console.log("\n5. THE bounds PRECONDITION -- repaired, and the repair is the interesting part");
{
    const ups = 16, baseY = 0;
    const withB = bsp(0, 24);
    const noB = bsp(0, 24); delete noB.bounds;      // a map with nodes and NO bounds: v3737 threw a TypeError

    ok("!! *** A MAP WITH NODES AND NO bounds NO LONGER THROWS -- THE EXTENT IS DERIVED FROM ITS VERTICES ***",
        (() => { try { const p2 = new Map(); voxelizeWadMap({ setVoxel(x, y, z) { p2.set(x + "," + y + "," + z, 1); } },
            noB, { unitsPerVoxel: ups, baseY, centerOnPlayerStart: false }); return p2.size > 0; }
            catch { return false; } })(),
        "hasBSPData() checks nodes + subsectors + segs and returned TRUE without bounds, after which the BSP " +
        "branch read parsedMap.bounds.minX. THE OBVIOUS REPAIR WAS THE WRONG ONE: widening the guard would " +
        "make this map take the HEURISTIC FALLBACK SILENTLY -- a loud crash traded for a quiet downgrade to " +
        "the less exact path, which is worse. THE EXTENT OF A MAP IS A FACT ABOUT ITS VERTICES, and " +
        "voxelizeWadMap already required vertices, so there was never anything to guard, only something to compute");

    ok("!! ...and it builds the SAME floors either way, so deriving is not a second behaviour",
        (() => {
            const run = (m) => { const acc = new Map();
                voxelizeWadMap({ setVoxel(x, y, z) { acc.set(x + "," + y + "," + z, 1); } }, m,
                    { unitsPerVoxel: ups, baseY, centerOnPlayerStart: false });
                return [...acc.keys()].sort().join("|"); };
            return run(withB) === run(noB);
        })(),
        "the supplied-bounds map and the derived-bounds map produce voxel-for-voxel identical output -- which " +
        "is what says the derivation reproduces what the parser would have handed over");

    ok("!! a caller-supplied bounds still WINS, because a clipped region is a deliberate choice",
        (() => { const clip = bsp(0, 24); clip.bounds = { minX: 0, maxX: 64, minY: 0, maxY: 64 };
                 const b = mapBounds(clip); return b.maxX === 64; })(),
        "deriving must not overrule a caller who passed a narrower box on purpose");

    ok("!! an empty map has NO extent rather than a default box",
        mapBounds({ vertices: [] }) === null && mapBounds({}) === null,
        "inventing a box for a map with no geometry would put a floor where there is none -- UNKNOWN IS NOT A " +
        "DEFAULT, and returning null makes the caller say what it wants instead");

    const derived = mapBounds({ vertices: V });
    ok("the derived extent is the vertices' own min/max, computed here rather than read back from the module",
        derived.minX === 0 && derived.maxX === 256 && derived.minY === 0 && derived.maxY === 128,
        JSON.stringify(derived) + " against the fixture's own vertex list");
}

report("WHAT THIS DOES NOT CLAIM",
    "That the voxelizer is correct. Walls, BSP subsector resolution (pointToSubsector / subsectorToSector), " +
    "texture and light-tint routing, and centreOnPlayerStart are ALL UNGRADED -- this is the module's FIRST " +
    "gate and it grades the HEURISTIC floor path only -- the BSP branch at line 341, which is what real Doom " +
    "maps take, is NEVER REACHED by this fixture and is proven unreached by a throw. AND NOTHING HERE IS A REAL WAD: there is no .wad file and " +
    "no parser in this tree, so the fixture is synthetic and the map's own conventions (0xFFFF for no sidedef, " +
    "right-side-is-the-sector) are TAKEN FROM THIS MODULE'S OWN COMMENTS, not from a Doom spec I checked.");

console.log("\nwadVoxelizer-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
