// simulation/RagdollDismember-selfcheck.mjs
//
// v3146 -- SIXTH FINISHED CAPABILITY FOUND UNWIRED, AND THE FIRST ONE WITH A GRAPH INVARIANT TO CHECK.
//
// simulation/RagdollDismember.js is round 307: per-bone damage accumulation and limb severance for active
// ragdolls. No gate, no caller. Its correctness is not a matter of taste or appearance -- it is a statement
// about a tree:
//
//     SEVERING A BONE MUST SEVER EXACTLY ITS SUBTREE. Not less, or a limb detaches while its own forearm is
//     still constrained to a parent that is no longer there. Not more, or an unrelated limb falls off.
//
// That is checkable with no renderer, no GPU and no physics tick, because the module takes its dependencies by
// injection -- { ragdollManager, particles } -- so a seven-bone skeleton built by hand is a complete test rig.
//
// THE SECOND INVARIANT is where the severance impulse lands. The limb is pushed away by editing prevPos (Verlet
// convention), and that edit must touch the severed subtree ONLY. A stray impulse on the parent would kick the
// body every time an arm came off, which looks like a physics bug and is really a loop bound.
//
// Note the fake ragdoll needs prevPos as well as worldPos: the first version of this rig omitted it and the
// module threw. That was the test being wrong, not the module -- worth recording, because "it crashed" is the
// easiest thing to mistake for a defect in something nobody has run before.

import { RagdollDismember } from "./RagdollDismember.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

//        0 root
//        ├── 1 torso ── 2 upperArm ── 3 forearm ── 4 hand
//        │            └─ 5 otherArm
//        └── 6 leg
const PARENTS = [-1, 0, 1, 2, 3, 1, 0];
const POS = [[0,0,0],[0,1,0],[1,1,0],[2,1,0],[3,1,0],[-1,1,0],[0,-1,0]];

function rig() {
    const rd = {
        active: true, boneCount: 7, parents: PARENTS,
        worldPos: POS.map((p) => p.slice()), prevPos: POS.map((p) => p.slice()),
        _severedSet: null,
    };
    const d = new RagdollDismember({ ragdollManager: { _active: new Map([["e1", rd]]) } });
    return { rd, d };
}
const sorted = (s) => [...(s || [])].sort((a, b) => a - b);

// ---- 1. SEVERING A BONE SEVERS EXACTLY ITS SUBTREE ---------------------------------------------------------------
{
    const { rd, d } = rig();
    const r = d.recordHit("e1", { x: 1, y: 1, z: 0 }, d.severThreshold + 1, { x: 1, y: 0, z: 0 });
    ok("!! hitting the upper arm severs the upper arm, forearm and hand -- and nothing else",
        JSON.stringify(sorted(rd._severedSet)) === JSON.stringify([2, 3, 4]) &&
        JSON.stringify(r.subtree) === JSON.stringify([2, 3, 4]),
        "severed " + JSON.stringify(sorted(rd._severedSet)) + ". Fewer would leave the forearm constrained to a " +
        "parent that has left; more would take the torso or the other arm with it");

    const leaf = rig();
    leaf.d.recordHit("e1", { x: 3, y: 1, z: 0 }, leaf.d.severThreshold + 1, { x: 1, y: 0, z: 0 });
    ok("...and severing a LEAF takes only itself",
        JSON.stringify(sorted(leaf.rd._severedSet)) === JSON.stringify([4]),
        "the hand has no descendants, so the subtree is one bone -- the case a hard-coded 'walk two levels' " +
        "would get wrong without ever failing on a limb");

    // CORRECTION: this first asserted that hitting the torso severs it and everything below. It does not, and the
    // module is right -- _isSeverable falls back to a depth heuristic and returns depth >= 2, so depth-0 roots and
    // depth-1 TRUNK pieces are protected and only limbs come off. My expectation was the wrong one; a torso that
    // detached on damage would be a worse game than one that does not, and the rule is deliberate rather than a
    // missing case. The real invariant is the protection.
    const torso = rig();
    for (let i = 0; i < 4; i++) torso.d.recordHit("e1", { x: 0, y: 1, z: 0 }, torso.d.severThreshold + 1, { x: 1, y: 0, z: 0 });
    ok("!! the TRUNK is protected -- depth-1 bones never sever, however hard they are hit",
        !torso.rd._severedSet || !torso.rd._severedSet.has(1),
        "four over-threshold hits on the torso and it stays attached. _isSeverable requires depth >= 2, so root " +
        "(0) and trunk (1) are out and only limbs and extremities can be removed. Hitting the torso instead " +
        "severs nothing rather than taking both arms with it");
}

// ---- 2. THE IMPULSE LANDS ONLY ON THE SEVERED LIMB ------------------------------------------------------------------
{
    const { rd, d } = rig();
    const before = rd.prevPos.map((p) => p.slice());
    d.recordHit("e1", { x: 1, y: 1, z: 0 }, d.severThreshold + 1, { x: 1, y: 0, z: 0 });
    const moved = rd.prevPos
        .map((p, i) => (p.some((v, k) => Math.abs(v - before[i][k]) > 1e-12) ? i : -1))
        .filter((i) => i >= 0);
    ok("!! the severance impulse touches the severed subtree and nothing else",
        JSON.stringify(moved) === JSON.stringify([2, 3, 4]),
        "prevPos moved for " + JSON.stringify(moved) + ". A stray impulse on the parent would kick the whole body " +
        "every time an arm came off -- which reads as a physics bug and is really a loop bound");
}

// ---- 3. THE ROOT CANNOT BE SEVERED -----------------------------------------------------------------------------------
{
    const { rd, d } = rig();
    for (let i = 0; i < 5; i++) d.recordHit("e1", { x: 0, y: 0, z: 0 }, d.severThreshold + 1, { x: 1, y: 0, z: 0 });
    ok("!! the root survives any amount of damage",
        !rd._severedSet || !rd._severedSet.has(0),
        "severing the root would detach the skeleton from itself. The guard is parents[idx] < 0, and five " +
        "over-threshold hits directly on it change nothing");
}

// ---- 4. DAMAGE ACCUMULATES RATHER THAN NEEDING ONE BIG HIT ------------------------------------------------------------
{
    const { rd, d } = rig();
    const small = d.severThreshold / 4;
    let severedAfter = -1;
    for (let i = 1; i <= 6; i++) {
        const r = d.recordHit("e1", { x: 1, y: 1, z: 0 }, small, { x: 1, y: 0, z: 0 });
        if (r && severedAfter < 0) severedAfter = i;
    }
    ok("!! many small hits sever the same limb one big hit would",
        severedAfter > 1 && JSON.stringify(sorted(rd._severedSet)) === JSON.stringify([2, 3, 4]),
        `severed on hit ${severedAfter} of ${d.severThreshold}/${small} = ` +
        `${Math.ceil(d.severThreshold / small)} expected. A per-bone bucket, not a single-blow threshold`);

    const spread = rig();
    for (let i = 0; i < 6; i++) spread.d.recordHit("e1", { x: -1, y: 1, z: 0 }, spread.d.severThreshold / 4, { x: 1, y: 0, z: 0 });
    ok("...and damage on a DIFFERENT bone does not sever the first",
        !spread.rd._severedSet || !spread.rd._severedSet.has(2),
        "six hits on the other arm leave the upper arm attached -- the buckets are per bone, so damage does not " +
        "pool across the skeleton");
}

console.log();
if (fails) { console.log("RagdollDismember-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("RagdollDismember-selfcheck: all checks pass");
