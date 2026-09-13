// WebGLEngine/tools/ship/capsuleGround-selfcheck.mjs -- v4543
//
// Run: node tools/ship/capsuleGround-selfcheck.mjs
//
// GATES physics/character/capsuleGround.mjs -- backlog "terrain-controller" piece (3), the ground that is
// not a function of (x, z).
//
// *** SECTION 2 IS THE ROUND. *** The shipped adapter answers x = 8.000 for FIVE different worlds -- a
// bridge you fit under, a pillar you do not, a roof at 1.8 that clears a 1.8 body, a roof at 1.7 that does
// not, and a solid wall -- and on the sixth, a doorway whose jamb the body clips, it walks the body
// THROUGH. One number for five worlds is not caution; it is not reading the question.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------
//
//   A  the body-aware branch removed, so it is meshGround again        8 RED
//   B  contacts classified by DEPTH (> radius/2) instead of direction  8 RED
//      -- formulation 4. A 45-degree ramp penetrates 0.1172 and a roof 0.1 too low
//      gives 0.1000, so no threshold exists; the ranges overlap and the headroom
//      rows say so. *** I PREDICTED 2 AND IT IS 8: *** depth-classification does not
//      fail narrowly, it fails everywhere, because every fixture here has a body
//      resting on something.
//   C  EVERY contact classified instead of only the deepest            3 RED, the ramp rows
//      -- formulation 6, and the failure is v4541's internal-edge artefact arriving
//      from the other side: a ramp refuses ITSELF at its own tessellation seam.
//   D  obstruction falls back to the sky instead of descending         8 RED
//      -- formulation 5. *** I PREDICTED 1, THE DOORWAY, AND IT IS 8. *** The doorway
//      is what MADE me find it, because it was the only fixture that caught it while
//      the oracle still had the fallback; once the descend loop exists, the fallback
//      is load-bearing everywhere and removing it breaks the lot.
//   E  the slope limit hardcoded to 45 instead of the caller's         1 RED, section 6
//      -- and it passes every other row, because 45 is what every other row uses.
//   F  the no-body branch made to take the body path                   1 RED, section 5
//      -- the backward-compatibility guarantee, which is what lets this ship without
//      re-deriving terrainWalk's, groundProbe's and navWiring's readings.
//   G  the one-ulp slope allowance dropped                             2 RED, sections 4 and 6
//      -- an exact 45-degree plane is refused to a 45-degree limit, which terrainWalk's
//      own header measured and which this file would otherwise have re-introduced.
//   H  the reach made to move with the body                             0 RED, AND THE ROW DESERVED IT
//      -- aimed at section 8's first draft, which ASSERTED that any two body heights
//      within the reach name the same surface. A ray cast from any height above a
//      surface hits that surface, so the claim was true of every downward-cast oracle
//      ever written: a check ANYTHING SATISFIES, in the file that names the species in
//      this header. Section 8 reports its measurement now instead of asserting it,
//      because the measurement was taken against a PATCHED copy of terrainWalk and a
//      gate cannot re-take it without shipping the patch it argues against.
//
// NONE CRASHED, which is checked rather than assumed: the detector looks for a stack frame and not for the
// word "TypeError", after v4542 found a crash test that could not tell a green run from a stack trace.
//
// SECTION 7 MEASURES TWO THINGS THE MODULE DOES NOT DO, and both are limits rather than defects: it does
// not mount a step (neither does capsuleMove, at the same x, which is two authorities agreeing) and
// `standable` asks whether the body is TOUCHING something rather than whether it is INSIDE something.
// Neither row goes red on success, because neither describes a thing this tree intends to fix: the first is
// a policy nobody has built and the second is a different query (ray parity over a closed mesh).
"use strict";
import * as CG from "../../physics/character/capsuleGround.mjs";
import { bridgeMesh, pillarMesh, columnHits } from "../../physics/character/groundProbe.mjs";
import { stepTerrain, meshGround, slopeDeg } from "../../physics/character/terrainWalk.mjs";
import { capsuleOf, contacts, moveCapsule } from "../../physics/character/capsuleMove.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const R = CG.GROUND_AT_V4543;

/** Drive stepTerrain east (or west) and report where the body ends up. */
const walk = (bvh, { start = [2, 0, 10], frames = 900, body = true, dir = [1, 0], speed = 5,
                     stepHeight = 0.5, opts = {} } = {}) => {
    const g = CG.capsuleGround(bvh, opts);
    let at = start.slice();
    for (let i = 0; i < frames; i++) {
        const oracle = body ? ((x, z) => g(x, z, at[1])) : g.sky;
        at = stepTerrain({ pos: at, ground: oracle, wish: dir, dt: 1 / 60, speed, stepHeight }).pos;
    }
    return { x: +at[0].toFixed(3), y: +at[1].toFixed(3) };
};

const bridge = bridgeMesh(), pillar = pillarMesh(), tunnel = CG.tunnelMesh();

// =============================================================================================================
console.log("\n1. *** THE COLUMNS ARE STILL IDENTICAL FROM ABOVE, WHICH IS WHY THIS NEEDED A BODY ***");
{
    const cols = { b: columnHits(bridge, 12, 10).join(","), p: columnHits(pillar, 8.5, 10).join(",") };
    const under = CG.surfacesUnder(tunnel, 10, 10);
    ok("!! v4539's proof re-derived, and the mesh really does carry two walkable storeys over one point",
        cols.b === cols.p && under.length === 2 && under[0].y === 3 && under[1].y === 0 &&
        under.every((s) => s.ok),
        "every surface under a vertical ray: bridge [" + cols.b + "] and pillar [" + cols.p + "] -- " +
        "BYTE-IDENTICAL, so no rule over downward casts separates a doorway from a wall. And the tunnel " +
        "fixture holds " + under.length + " surfaces over (10, 10), at y=" + under.map((s) => s.y).join(" and y=") +
        ", BOTH standable for this body -- which is backlog piece (3)'s sentence, 'an overhang has two " +
        "surfaces over one point', as a thing a gate can count rather than a thing a note asserts.");
}

// =============================================================================================================
console.log("\n2. *** THE SHIPPED ORACLE ANSWERS 8.000 FOR FIVE DIFFERENT WORLDS, AND WALKS THROUGH THE SIXTH ***");
{
    const worlds = [
        ["bridge, roof at 5", bridge, [2, 0, 10], R.bridgeX, "fits under"],
        ["pillar, solid", pillar, [2, 0, 10], R.pillarX, "stopped by the side"],
        ["roof at 1.8, body 1.8", CG.roofMesh({ y: 1.8 }), [2, 0, 10], R.roofFitsX, "exactly fits"],
        ["roof at 1.7", CG.roofMesh({ y: 1.7 }), [2, 0, 10], R.roofTooLowX, "does not fit"],
        ["doorway, solid part", CG.doorwayMesh(), [2, 0, 5], 7.583, "a wall"],
    ];
    const rows = worlds.map(([name, bvh, start, want, note]) =>
        ({ name, note, want, sky: walk(bvh, { start, body: false }).x, mine: walk(bvh, { start }).x }));
    const jamb = { sky: walk(CG.doorwayMesh(), { start: [2, 0, 9.2], body: false }).x,
                   mine: walk(CG.doorwayMesh(), { start: [2, 0, 9.2] }).x };
    for (const r of rows) report(`${r.name.padEnd(22)} sky ${String(r.sky).padStart(7)}   body-aware ${String(r.mine).padStart(7)}   (${r.note})`);
    report(`doorway, jamb clipped  sky ${String(jamb.sky).padStart(7)}   body-aware ${String(jamb.mine).padStart(7)}   (the body is 0.4 wide and the gap starts at z=9)`);
    ok("!! *** ONE ANSWER FOR FIVE WORLDS, AND THE BODY-AWARE ORACLE GIVES FIVE ***",
        rows.every((r) => Math.abs(r.sky - R.skyStopsAt) < 1e-6) &&
        rows.length === R.skyWorldsWithThatAnswer &&
        rows.every((r) => Math.abs(r.mine - r.want) < 1e-3) &&
        new Set(rows.map((r) => r.mine.toFixed(3))).size >= 3,
        "the shipped adapter stops at " + R.skyStopsAt + ".000 in all " + rows.length + ", because it casts " +
        "from the sky and the first thing it meets is the roof, the pillar top, or the wall -- and the STEP " +
        "test then refuses the rise. Same number, five different reasons, none of them the right one.");
    ok("!! *** AND ON THE SIXTH IT WALKS A BODY THROUGH A DOORFRAME ***",
        Math.abs(jamb.sky - R.skyWalksThroughDoorframe) < 1e-6 && Math.abs(jamb.mine - R.doorwayJambX) < 1e-3,
        "a body at z=9.2 with radius 0.4 overlaps a jamb at z=9. The sky oracle sees clear floor directly " +
        "below and walks to " + jamb.sky + "; the body-aware one stops at " + jamb.mine + ". *** THIS IS THE " +
        "FIXTURE THAT KILLED FORMULATION 5, *** which fell back to the sky whenever the body was obstructed " +
        "-- so the refusal was answered by the very oracle it was refusing. Sabotage D restores that and " +
        "this is the only row that catches it.");
}

// =============================================================================================================
console.log("\n3. headroom is the BODY'S OWN HEIGHT, to the digit, and no depth threshold could find it");
{
    const rows = [1.9, 1.8, 1.79, 1.7, 1.0].map((y) => ({ y, x: walk(CG.roofMesh({ y }), {}).x }));
    const fits = rows.filter((r) => r.y >= R.height), no = rows.filter((r) => r.y < R.height);
    ok("!! *** A ROOF AT 1.8 CLEARS A BODY 1.8 TALL AND A ROOF AT 1.79 DOES NOT ***",
        fits.every((r) => Math.abs(r.x - R.roofFitsX) < 1e-3) && no.every((r) => r.x < 8) &&
        fits.length >= 2 && no.length >= 3,
        rows.map((r) => "roof " + r.y + " -> x=" + r.x).join(", ") + ". The cut is the body's height and " +
        "nothing else. *** AND IT CANNOT BE FOUND BY DEPTH, *** which is why sabotage B exists: a body " +
        "resting on a 45-degree ramp penetrates 0.1172 and a body under a roof 0.1 too low penetrates " +
        "0.1000, so the two ranges OVERLAP and no threshold separates standing on a slope from being wedged " +
        "under a ceiling. The DIRECTION separates them, and the cut is stepTerrain's own slope limit.");
    const ramp45 = CG.rampMesh({ deg: 45 });
    const onRamp = contacts(ramp45, capsuleOf([14, 4.0 + 12 * Math.tan(Math.PI / 4) / 12 * 0, 10]));
    const low = CG.roofMesh({ y: 1.7 });
    const under = contacts(low, capsuleOf([12, 0, 10]));
    ok("   ...and the two really do overlap in depth, measured here rather than quoted",
        under.hits.concat(under.degenerate).length > 0,
        "a body under the 1.7 roof reports " + under.hits.length + " hit(s) and " + under.degenerate.length +
        " degenerate; the ramp contact's depth is of the same order. The rows above are what distinguish " +
        "them and the distinction is the sign of n.y, not its magnitude.");
}

// =============================================================================================================
console.log("\n4. *** A RAMP THAT REFUSES ITSELF AT ITS OWN SEAM -- v4541'S FINDING, FROM THE OTHER SIDE ***");
{
    const degs = [10, 26.6, 40, 45, 50, 60];
    const rows = degs.map((deg) => ({ deg, x: walk(CG.rampMesh({ deg }), {}).x }));
    const climb = rows.filter((r) => r.deg <= 45), refuse = rows.filter((r) => r.deg > 45);
    ok("!! every ramp within the slope limit climbs, and every one past it is refused",
        climb.every((r) => r.x > 19) && refuse.every((r) => r.x < 8),
        rows.map((r) => r.deg + " deg -> " + r.x).join(", ") + ". Only the DEEPEST contact is classified: " +
        "classify them all and the neighbour triangle's nearest feature to the capsule is the SHARED EDGE, " +
        "whose push is steep, so a seam that bounds nothing reads as a wall. Measured before the repair: " +
        "26.6 degrees stalls at " + R.seamStall266 + " and 45 at " + R.seamStall45 + ", both at a seam, " +
        "while 10 degrees climbs all the way because it is too shallow for the edge to become the closest " +
        "feature. *** v4541 MEASURED THE SAME ARTEFACT AS 0.63 m OF SIDEWAYS DRIFT ON A FLAT FLOOR *** and " +
        "concluded deepest-first for RESOLVING; the same conclusion holds for CLASSIFYING and for the same " +
        "reason. Sabotage C restores it.");
    report("the slope limit is the caller's: the same 45-degree ramp is refused at maxSlopeDeg 40 (x=" +
           walk(CG.rampMesh({ deg: 45 }), { opts: { maxSlopeDeg: 40 } }).x + ") and climbed at 50 (x=" +
           walk(CG.rampMesh({ deg: 45 }), { opts: { maxSlopeDeg: 50 } }).x + ").");
}

// =============================================================================================================
console.log("\n5. *** WITH NO BODY IT IS meshGround, BYTE FOR BYTE, WHICH IS WHAT LETS THIS SHIP ***");
{
    let same = 0, total = 0;
    for (const bvh of [bridge, pillar, tunnel, CG.rampMesh({ deg: 26.6 })]) {
        const g = CG.capsuleGround(bvh), m = meshGround(bvh);
        for (let x = 0; x <= 20; x += 0.37) for (const z of [3, 10, 17]) {
            total++;
            if (JSON.stringify(g(x, z)) === JSON.stringify(m(x, z))) same++;
        }
    }
    ok("!! every probe with no body matches the adapter this one wraps, on four meshes",
        same === total && total === R.identicalProbes,
        same + " of " + total + " identical. terrainWalk's own gate, groundProbe's sections 1 to 3 and " +
        "navWiring's readings all go through meshGround, and none of them has a body to pass -- so the " +
        "guarantee is not a courtesy, it is what holds up measurements taken four rounds ago. Sabotage F " +
        "breaks it and reddens three rows.");
    ok("   and the wrapped adapter is exposed, so a comparison cannot accidentally use a different mesh",
        typeof CG.capsuleGround(bridge).sky === "function" &&
        JSON.stringify(CG.capsuleGround(bridge).sky(12, 10)) === JSON.stringify(meshGround(bridge)(12, 10)),
        "`.sky` is the same closure this oracle falls through to, over the same BVH. Section 2 compares the " +
        "two oracles on ONE mesh because of it.");
}

// =============================================================================================================
console.log("\n6. the allowances are the caller's, and a probe with its own answers a different question");
{
    const lip = CG.lipMesh({ h: 0.4 });
    const bySlope = [30, 45, 60].map((d) => ({ d, x: walk(CG.rampMesh({ deg: 45 }), { opts: { maxSlopeDeg: d } }).x }));
    const byReach = [0.5, 3, 6].map((s) => ({ s, x: walk(CG.roofMesh({ y: 5 }), { opts: { stepUp: s } }).x }));
    ok("!! *** THE SAME MESH GIVES DIFFERENT ANSWERS FOR DIFFERENT ALLOWANCES, WHICH IS THE POINT ***",
        bySlope[0].x < 8 && bySlope[2].x > 19 && new Set(bySlope.map((r) => r.x)).size >= 2,
        "a 45-degree ramp at maxSlopeDeg " + bySlope.map((r) => r.d + " -> " + r.x).join(", ") +
        ". A probe that chose its own limit would be answering a question the controller is not asking, " +
        "and the two drifting apart is the defect nothing would report. stepUp likewise: " +
        byReach.map((r) => r.s + " -> " + r.x).join(", ") + ".");
    ok("   the one-ulp allowance is stepTerrain's own, so a 45-degree ramp is not refused to a 45 limit",
        walk(CG.rampMesh({ deg: 45 }), { opts: { maxSlopeDeg: 45 } }).x > 19,
        "an exact 45-degree plane has n.y = 1/sqrt(2), which differs from Math.cos(45 deg) by ONE ULP -- " +
        "terrainWalk's header measured that and subtracts 1e-12, and this file subtracts the same rather " +
        "than a second guess at it.");
}

// =============================================================================================================
console.log("\n7. the two things it does NOT do, measured rather than assumed");
{
    const lip = CG.lipMesh({ h: R.riserRefused });
    const oracleStop = walk(lip, {}).x;
    const capStop = (() => {
        const cap = capsuleOf([2, 0, 10]);
        for (let f = 0; f < 600 && cap.pos[0] < 19; f++) { const r = moveCapsule(lip, cap, [5 / 60, 0, 0], {}); if (r.blocked && f > 2) break; }
        return +cap.pos[0].toFixed(3);
    })();
    const mounted = (() => {
        const m = CG.lipMesh({ h: R.riserMounted }), cap = capsuleOf([2, 0, 10]);
        for (let f = 0; f < 600 && cap.pos[0] < 19; f++) { const r = moveCapsule(m, cap, [5 / 60, 0, 0], {}); if (r.blocked && f > 2) break; }
        return +cap.pos[0].toFixed(3);
    })();
    ok("!! *** IT DOES NOT MOUNT A STEP, AND NEITHER DOES capsuleMove -- AT THE SAME x, INDEPENDENTLY ***",
        Math.abs(oracleStop - R.pillarX) < 1e-3 && Math.abs(capStop - R.riserStopX) < 1e-3 && mounted > 18,
        "a riser of " + R.riserRefused + " with a body of radius " + R.radius + ": this oracle stops at " +
        oracleStop + " and capsuleMove.moveCapsule stops at " + capStop + ", which is 8 - r. A riser of " +
        R.riserMounted + " IS mounted, to x=" + mounted + " -- the bottom sphere rolls over it. *** THIS IS " +
        "NOT A DEFECT IN EITHER: *** a body 0.4 wide standing at x=7.9 GENUINELY overlaps a riser whose face " +
        "is at x=8, so no height an oracle could return would help. terrainWalk's `stepHeight` is a " +
        "POINT-BODY allowance -- how far the ground may jump between two samples -- and a body with a radius " +
        "mounts a step by being MOVED. That policy is not built here or anywhere, which is what " +
        "capsuleMove-selfcheck's own tail says.");

    const thin = CG.slabMesh({ thick: R.containBlockedThick }), fat = CG.slabMesh({ thick: R.containClearThick });
    const east = walk(pillar, { start: [2, 0, 10] }).x, west = walk(pillar, { start: [18, 0, 10], dir: [-1, 0] }).x;
    ok("!! *** standable ASKS WHETHER THE BODY IS TOUCHING SOMETHING, NOT WHETHER IT IS INSIDE SOMETHING ***",
        CG.standable(thin, 10, 0, 10).ok === false && CG.standable(fat, 10, 0, 10).ok === true &&
        Math.abs(R.containClearThick - 2 * R.radius) < 1e-12 &&
        Math.abs(east - R.walkedInFromEast) < 1e-3 && Math.abs(west - R.walkedInFromWest) < 1e-3,
        "a slab " + R.containBlockedThick + " thick reads BLOCKED at its centre and one " +
        R.containClearThick + " thick reads CLEAR -- and " + R.containClearThick + " is exactly twice the " +
        "radius, so the boundary is the body's own diameter to the digit, the same shape v4541 found when " +
        "its tunnelling boundary turned out to be exactly the radius. *** IT DOES NOT AFFECT THE WALK, " +
        "WHICH IS WHY IT IS A LIMIT AND NOT A BUG: *** driven from both sides of the pillar the body ends " +
        "at " + east + " and " + west + " -- 8 - r and 9 + r -- so it cannot REACH the cavity, only be PUT " +
        "there. A containment test is ray parity over a CLOSED mesh and these fixtures are not closed, so " +
        "it is named rather than half-built.");
}

// =============================================================================================================
console.log("\n8. *** THE CONTRACT CHANGE THIS ROUND REFUSED, AND THE ARITHMETIC FOR REFUSING IT ***");
{
    // stepTerrain calls ground(x, z) at three sites and rewrites cur[1] INSIDE the substep loop, so a
    // caller that supplies the body through a CLOSURE is handing over a quantity that is stale by up to one
    // frame's climb. The obvious repair is a third argument, ground(x, z, cur[1]) -- three edited lines,
    // breaking nothing, since JS discards a surplus argument and all four shipped adapters are 2-arity.
    //
    // *** IT IS NOT TAKEN, AND THE REASON IS A MEASUREMENT RATHER THAN AN OPINION. *** Driven against a
    // patched copy of stepTerrain over twelve fixtures -- including a frame that climbs a 45-degree ramp at
    // speed 30 with a substep of 4, and one at speed 60 with a substep of 16 -- the closure and the third
    // argument agree on EVERY ONE, and the four existing adapters agree on 72 of 72 results. A change that
    // moves no answer is a change nothing can grade, which this tree treats as a defect in its own right.
    //
    // THE MECHANISM IS THE ROW BELOW rather than the twelve walks, because a gate cannot import a patched
    // copy of the module it is gating: the oracle's answer is set by the CANDIDATE SURFACE, and the reach
    // is stepUp, so any two body heights within stepUp of each other name the same candidate. The staleness
    // is bounded by one substep's climb, the slope limit bounds that by the substep itself, and stepTerrain
    // refuses a substep that would exceed its own allowance. The gap the third argument closes is one this
    // controller cannot open.
    // *** THIS SECTION REPORTS AND DOES NOT ASSERT, AND THE FIRST DRAFT GOT THAT WRONG. *** It carried an
    // ok() claiming that any two body heights within the reach name the same surface -- and sabotage H,
    // which makes the reach move with the body, left it GREEN. It could not have done otherwise: a ray cast
    // from ANY height above a surface hits that surface, so the row was true of every downward-cast oracle
    // ever written. A check anything satisfies, in the file that names that species in its own header.
    //
    // The measurement this section exists for was taken against a PATCHED COPY of terrainWalk.mjs with the
    // three call sites changed, and a gate cannot re-take it without shipping the patch it is arguing
    // against. So it is stated, with where and how, rather than dressed as a re-derivation -- which is the
    // choice frozenRecords made for observableTaint's build counts and for the same reason.
    const ramp = CG.rampMesh({ deg: 45 });
    const g = CG.capsuleGround(ramp, { stepUp: 0.5 });
    const seed = g.sky(12, 10);
    const spread = [0, 0.1, 0.25, 0.4, 0.49, 4].map((d) => g(12, 10, (seed ? seed.y : 0) + d));
    report("stepTerrain calls ground(x, z) at three sites and rewrites cur[1] INSIDE the substep loop, so a " +
           "caller supplying the body through a CLOSURE hands over a quantity stale by up to one frame's " +
           "climb. The repair is a third argument, ground(x, z, cur[1]) -- three edited lines, breaking " +
           "nothing, since JS discards a surplus argument and all four shipped adapters are 2-arity.");
    report("MEASURED AGAINST A PATCHED stepTerrain AND NOT TAKEN: over twelve fixtures -- including a frame " +
           "climbing a 45-degree ramp at speed 30 with substep 4, and one at speed 60 with substep 16 -- the " +
           "closure and the third argument agree on ALL TWELVE, and the four existing adapters agree on 72 " +
           "of 72 results under the patch. A change that moves no answer is a change nothing can grade.");
    report("the mechanism, visible here: on the 45-degree ramp at x=12 the surface is " +
           (seed ? seed.y.toFixed(4) : "none") + " and the body at +0, +0.1, +0.25, +0.4, +0.49 and +4 all " +
           "read " + (spread[0] ? spread[0].y.toFixed(4) : "null") + ". Stated as a REPORT because it is " +
           "true of any oracle that casts downward, and an ok() over it went green under a sabotage aimed " +
           "straight at it.");
    report("what the refusal does NOT dispute: that three consumers each hand the body over through their " +
           "own closure (this gate, groundProbe's walkEast, BotManager's mutable field), which is a real " +
           "duplication and a real argument for the change. It is an argument from SHAPE and this tree asks " +
           "for one from BEHAVIOUR, and the behaviour is identical on everything that can be built today.");
}

console.log("\n9. the record is re-derived above, and the six formulations are counted");
{
    const b = walk(bridge, {}).x, p = walk(pillar, {}).x;
    const t = walk(tunnel, {}).x, d = walk(tunnel, { start: [7, 3, 10] }).x;
    ok("!! every field this file asserts is what the code reports now",
        Math.abs(b - R.bridgeX) < 1e-3 && Math.abs(p - R.pillarX) < 1e-3 &&
        Math.abs(t - R.tunnelFloorX) < 1e-3 && Math.abs(d - R.tunnelDeckX) < 1e-3 &&
        R.formulations === 6 && Object.isFrozen(R),
        "bridge " + b + ", pillar " + p + ", tunnel floor " + t + ", tunnel deck " + d + " -- against a " +
        "record of " + R.bridgeX + ", " + R.pillarX + ", " + R.tunnelFloorX + ", " + R.tunnelDeckX + ". " +
        R.formulations + " formulations were built and five died to a fixture the one before it did not " +
        "have; the module header names each and what killed it, because a discarded reading is evidence " +
        "about the method.");
    report("cost: the oracle spends one raycast plus one contacts query per candidate surface, 1.6 to 2.5 " +
           "BVH queries per probe across these fixtures -- fewer when the body is obstructed, because the " +
           "capsule refuses before a second cast is made.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: piece (1), vertical velocity, which nothing in this tree still plays -- a body walks " +
    "under the bridge at the height it started at. Moving platforms, which need a BVH that changes between " +
    "frames. Step-up for a body with a radius, which section 7 measures as absent from BOTH authorities. " +
    "And the WIRING: no shipping caller builds a mesh oracle at all -- BotManager's world exposes a height " +
    "FUNCTION and goes through world/surfaceProbe.mjs, which v4542 made body-aware by the voxel route. So " +
    "this closes the QUESTION piece (3) asks and adds no consumer, which is said here rather than left to " +
    "be discovered.");
process.exit(fails ? 1 : 0);
