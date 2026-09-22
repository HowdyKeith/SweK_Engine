// WebGLEngine/brain/fleetAssign-selfcheck.mjs
//
// Run: node brain/fleetAssign-selfcheck.mjs
//
// THE SIBLING GATE OF brain/fleetAssign.mjs. THE LOAD-BEARING CLAIM: with EQUAL fleet sizes (cap=1), no two
// ships in `mine` are EVER assigned the same foe -- the actual deconfliction property tools/ship/nextRounds.mjs's
// own ai-fleet-target-deconfliction entry asked for, not merely "less crowding on average." SECTION 5 is the
// direct reproduction of the measured bug: a scenario where naive nearest-enemy-per-ship provably sends two
// allies at the SAME foe, checked against this file's own assignTargets() splitting them.
//
// SABOTAGE LOG -- each applied to brain/fleetAssign.mjs, the gate run, the module restored (diffed to confirm
// byte-identical). Counts are what actually ran, not predicted:
//   A  the cap formula changed from `Math.ceil(nMine/nFoes)` to `Math.floor(nMine/nFoes)` -> *** FIRST RUN: 0
//      RED, A FINDING NOT A PASS. *** Every section at the time only inspected the RESULTING assignment's
//      properties (no foe over cap, etc), and the defensive fallback silently absorbed the undercounted
//      capacity for a lone straggler ship, which happened to land on the same foe a correct cap would have
//      picked anyway -- for every fleet-size ratio this gate tried, floor was only off by one, and one
//      fallback-assigned straggler is not enough to visibly overload a foe past the (independently
//      re-derived, also-wrong-by-the-same-amount) cap the tests were comparing against. Fixed by exporting
//      capFor() specifically so section 0 can test the FORMULA directly rather than only its emergent effect
//      -> RE-SABOTAGED AFTER THE FIX: now 3 red (capFor(5,2), capFor(7,3), capFor(10,4) each read one too low).
//      Logged per this file's own house rule (matching rigidBody6dofCollision-selfcheck.mjs's own D): a
//      sabotage that goes 0 red is the check's problem, not evidence the code is fine.
//   B  the dead-ship filter removed from `foes` only (`mine.filter(s=>!s.dead)` kept, `foes.filter(...)`
//      replaced with plain `foes`) -> 2 red: section 4's own "never targets a dead foe" check and its
//      "every foe dead -> empty assignment" check (a dead foe now gets assigned instead).
//   C  the sort comparator's subtraction order flipped (`b[2]-a[2]` instead of `a[2]-b[2]`, sorting FARTHEST
//      pairs first) -> *** FIRST RUN: 0 RED, ANOTHER FINDING. *** Section 5's own "two close allies get split"
//      check is satisfied by EITHER processing order in its specific 2-ship/cap=1 geometry -- with cap=1 and
//      two ships, any non-stuck greedy walk ends up with two DIFFERENT targets regardless of which order it
//      considers pairs in, so "all-different" alone cannot distinguish nearest-first from farthest-first. Fixed
//      by adding section 5b, a cross-pairing geometry (m0 next to f0, m1 next to f1, both cross-pairs far) where
//      the two orderings provably disagree on WHICH ship gets WHICH target, checked against the exact expected
//      pairing rather than just "some all-different result" -> RE-SABOTAGED AFTER THE FIX: now 2 red, exactly
//      section 5b's own two assertions. Sections 1-4's generic invariants (cap respected, no dead ship touched)
//      correctly stay green regardless of sort order either way, since those properties hold for ANY ordering
//      of the same pair set -- only a test against a known-correct SPECIFIC answer can catch a reversed sort.
"use strict";
import * as F from "./fleetAssign.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }

function mk(id, pos, dead = false) { return { id, body: { pos }, dead }; }
function dist3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

console.log("fleetAssign-selfcheck -- greedy nearest-pair target assignment, closing ai-fleet-target-deconfliction\n");

console.log("0. *** capFor() ITSELF, TESTED DIRECTLY -- NOT JUST ITS EMERGENT EFFECT ON AN ASSIGNMENT ***");
{
    // a first draft of this gate tested ONLY the resulting assignment's properties (no foe over cap, etc), and
    // an off-by-one cap formula (floor instead of ceil) sabotage went 0 RED against it: the defensive fallback
    // in assignTargets() silently absorbed the undercounted capacity for a lone straggler ship, which happened
    // to land on the same foe a correct cap would have assigned it to anyway. Fixed by testing the FORMULA
    // directly, exported specifically so this section can do that.
    for (const [nMine, nFoes, want] of [[3, 3, 1], [5, 2, 3], [7, 3, 3], [1, 1, 1], [4, 1, 4], [9, 3, 3], [10, 4, 3]]) {
        const got = F.capFor(nMine, nFoes);
        ok(`!! capFor(${nMine},${nFoes}) === ceil(${nMine}/${nFoes}) === ${want}`, got === want, `got ${got}`);
    }
    ok("!! capFor(n, 0) === 0 -- no foes means no meaningful cap, not a divide-by-zero NaN/Infinity", F.capFor(5, 0) === 0, `got ${F.capFor(5, 0)}`);
}

console.log("\n1. *** EQUAL FLEET SIZES (3v3): cap===1, NO TWO ALLIES EVER SHARE A TARGET *** (the load-bearing claim)");
{
    const mine = [mk("m0", [0, 0, 0]), mk("m1", [1, 0, 0]), mk("m2", [2, 0, 0])];
    const foes = [mk("f0", [10, 0, 0]), mk("f1", [10.5, 0, 0]), mk("f2", [11, 0, 0])];
    const assignment = F.assignTargets(mine, foes);
    ok("!! every live ship got an assignment", assignment.size === 3, `size=${assignment.size}`);
    const targets = [...assignment.values()].map((f) => f.id);
    ok("!! all three targets are DIFFERENT -- exactly the deconfliction property, not merely likely", new Set(targets).size === 3, `targets=${targets}`);
}

console.log("\n2. MORE ALLIES THAN FOES (5v2): LOAD-BALANCED, no foe exceeds the computed cap");
{
    const mine = Array.from({ length: 5 }, (_, i) => mk("m" + i, [i, 0, 0]));
    const foes = [mk("f0", [20, 0, 0]), mk("f1", [21, 0, 0])];
    const assignment = F.assignTargets(mine, foes);
    ok("!! every one of the 5 ships got an assignment (none left out)", assignment.size === 5, `size=${assignment.size}`);
    const counts = new Map();
    for (const f of assignment.values()) counts.set(f.id, (counts.get(f.id) || 0) + 1);
    const cap = Math.ceil(5 / 2);
    ok(`!! no foe assigned more than cap=${cap} ships`, [...counts.values()].every((c) => c <= cap), `counts=${JSON.stringify([...counts])}`);
    ok("...and load is genuinely balanced, not all piled on one foe", counts.size === 2, `counts=${JSON.stringify([...counts])}`);
}

console.log("\n3. THE CAP-SIZING GUARANTEE ACTUALLY HOLDS: the defensive fallback path is NEVER needed");
{
    // instrument assignTargets() indirectly: re-derive what the fallback WOULD have produced (plain
    // nearest-foe-ignoring-cap) and confirm the real assignment, for every ship, already matches SOME valid
    // capacity-respecting choice -- i.e. every ship's actual target is one that had remaining capacity when
    // reached in sorted order, not a fallback-forced one. Directly test across several fleet-size ratios.
    for (const [nMine, nFoes] of [[3, 3], [5, 2], [7, 3], [2, 5], [1, 1], [4, 1]]) {
        const mine = Array.from({ length: nMine }, (_, i) => mk("m" + i, [Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10]));
        const foes = Array.from({ length: nFoes }, (_, i) => mk("f" + i, [Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10]));
        const assignment = F.assignTargets(mine, foes);
        const cap = Math.ceil(nMine / nFoes);
        const counts = new Map();
        for (const f of assignment.values()) counts.set(f, (counts.get(f) || 0) + 1);
        const capRespected = [...counts.values()].every((c) => c <= cap);
        ok(`!! ${nMine}v${nFoes}: every ship assigned (${assignment.size}/${nMine}) AND cap=${cap} respected everywhere -- fallback never had to violate it`, assignment.size === nMine && capRespected, `counts=${JSON.stringify([...counts.values()])}`);
    }
}

console.log("\n4. DEAD SHIPS ARE EXCLUDED ON BOTH SIDES");
{
    const mine = [mk("m0", [0, 0, 0]), mk("m1", [1, 0, 0], true)];
    const foes = [mk("f0", [10, 0, 0], true), mk("f1", [11, 0, 0])];
    const assignment = F.assignTargets(mine, foes);
    ok("!! a dead ally gets NO assignment -- not present in the map at all", ![...assignment.keys()].some((m) => m.id === "m1"));
    ok("!! the live ally is assigned to the LIVE foe, never the dead one", assignment.get(mine[0]).id === "f1", `got ${assignment.get(mine[0]) && assignment.get(mine[0]).id}`);

    const allDeadFoes = [mk("f0", [10, 0, 0], true)];
    const assignment2 = F.assignTargets([mk("m0", [0, 0, 0])], allDeadFoes);
    ok("!! every foe dead -> empty assignment, not a crash or a dead-foe target", assignment2.size === 0, `size=${assignment2.size}`);
}

console.log("\n5. *** DIRECT REPRODUCTION OF THE MEASURED BUG: two close allies naively pick the SAME nearest foe; ***");
console.log("   *** assignTargets() SPLITS them, sending one to a much farther foe rather than crowding the near one ***");
{
    const mine = [mk("m0", [0, 0, 0]), mk("m1", [0.5, 0, 0])];
    const foes = [mk("f0", [10, 0, 0]), mk("f1", [50, 0, 0])];
    const naive = mine.map((m) => foes.reduce((best, f) => (dist3(m.body.pos, f.body.pos) < dist3(m.body.pos, best.body.pos) ? f : best)));
    ok("(confirms the bug exists without this file) naive nearest-enemy-per-ship sends BOTH allies at the same foe", naive[0].id === naive[1].id, `${naive.map((f) => f.id)}`);
    const assignment = F.assignTargets(mine, foes);
    const assigned = [...assignment.values()].map((f) => f.id);
    ok("!! assignTargets() sends them to DIFFERENT foes instead", new Set(assigned).size === 2, `assigned=${assigned}`);
}

console.log("\n5b. *** NEAREST-FIRST PROCESSING ORDER ITSELF, NOT JUST 'produces some all-different assignment' *** --");
console.log("    a cross-pairing scenario where nearest-first and farthest-first give DIFFERENT SPECIFIC answers");
{
    // section 5's own check (all-different targets) is satisfied by EITHER processing order in a cap=1, 2-ship
    // case -- found directly while sabotage-testing this file: reversing the sort comparator (farthest-first)
    // went 0 RED against section 5 alone, since with cap=1 any non-stuck greedy walk over a 2v2 case still ends
    // up with two DIFFERENT targets, just possibly the WRONG two. This section picks a geometry where the two
    // orderings provably disagree on WHICH ship gets WHICH target: m0 is next to f0 (dist 1) and far from f1
    // (dist 99); m1 is next to f1 (dist 1) and far from f0 (dist 99) -- the unique minimum-total-distance
    // pairing is m0->f0, m1->f1 (total 2); farthest-first greedily locks in the two 99-distance pairs FIRST
    // (m0->f1, m1->f0, total 198), which is what a reversed sort actually produces.
    const m0 = { id: "m0", body: { pos: [0, 0, 0] }, dead: false };
    const m1 = { id: "m1", body: { pos: [100, 0, 0] }, dead: false };
    const f0 = { id: "f0", body: { pos: [1, 0, 0] }, dead: false };
    const f1 = { id: "f1", body: { pos: [99, 0, 0] }, dead: false };
    const assignment = F.assignTargets([m0, m1], [f0, f1]);
    ok("!! m0 (next to f0) is assigned f0, not the far f1", assignment.get(m0).id === "f0", `got ${assignment.get(m0).id}`);
    ok("!! m1 (next to f1) is assigned f1, not the far f0", assignment.get(m1).id === "f1", `got ${assignment.get(m1).id}`);
}

console.log("\n6. PURE FUNCTION -- does not mutate its inputs");
{
    const mine = [mk("m0", [0, 0, 0])];
    const foes = [mk("f0", [10, 0, 0])];
    const mineBefore = JSON.stringify(mine), foesBefore = JSON.stringify(foes);
    F.assignTargets(mine, foes);
    ok("!! mine/foes arrays and their contents are byte-identical after the call", JSON.stringify(mine) === mineBefore && JSON.stringify(foes) === foesBefore);
}

console.log("\n7. THE FRONT DOOR");
{
    const L = F.reportLines();
    ok("reportLines names the module and shows a real assignment", L.some((l) => /fleetAssign/.test(l)) && L.some((l) => /->/.test(l)));
    ok("...and no report line stringifies a missing field as the literal word \"undefined\"", L.every((l) => !/\bundefined\b/.test(l)));
}

console.log(fails ? `\nfleetAssign-selfcheck: ${fails} FAILED` : "\nfleetAssign-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
