// WebGLEngine/tools/ship/ragdollSelfCollide-selfcheck.mjs -- v4249
//
// Run: node tools/ship/ragdollSelfCollide-selfcheck.mjs
//
// *** EVERY RAGDOLL THIS TREE CAN DERIVE FIGHTS ITSELF, AND THE FIX IS NOT AVAILABLE THROUGH THE SHIM. ***
//
// v4245 derived a ragdoll from a skeleton and fixed 4 of 10 joint anchors that lay outside the body they
// attached to, by growing each body to enclose every child head. v4248 ran it in a real solver and found
// three instruments could not show that fix helping: joint separation (the naive graph is TIGHTER at rest),
// drop asymmetry (1.7x a chaos floor of 0.455 m), hanging asymmetry (indistinguishable at a floor of 9.5e-7).
// It filed the remaining possibility -- that the argument is about COLLISION VOLUME rather than the
// constraint -- and noted that contacts had become available without anyone using them.
//
// This round used them, and found something neither previous round was looking for.
//
// *** THE JOINTED NEIGHBOURS OVERLAP. *** Not as a consequence of the fix -- BOTH derivations do it, because a
// bone's box runs to its child's head and the child's box starts there, so by construction they meet, and
// each is inflated by a radius on top. Every pair then generates contacts, and the collision solver spends
// the whole simulation shoving apart bodies the joints are holding together.
//
// Every ragdoll implementation handles this the same way: DISABLE COLLISION BETWEEN JOINTED NEIGHBOURS. This
// tree cannot ask for that. physics/box3d/box3d_shim.c exposes no collision filtering of any kind -- no
// collideConnected on a joint def, no category or mask bits, no groups -- so there is no argument to pass.
//
// AND THE SHIM CANNOT BE FIXED FROM HERE, which is why this round measures rather than repairs: box3d's own
// header is not vendored. vendor/box3d/ holds box3d.js and box3d.wasm and nothing else, and the shim's
// `#include "box3d/box3d.h"` resolves only on a machine where build-box3d-wasm-clang.sh has fetched the
// library. Writing a collideConnected parameter against an API that cannot be read here would be guessing at
// a signature and calling it a fix.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initNode, mod } from "../../physics/box3d/box3dNode.mjs";
import * as R from "../../physics/ragdollFromSkeleton.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

console.log("ragdollSelfCollide-selfcheck -- the derived ragdoll fights itself, and the fix is out of reach\n");

const nd = (n, p, t) => ({
    name: n, parent: p, translation: new Float32Array(t),
    rotation: new Float32Array([0, 0, 0, 1]), scale: new Float32Array([1, 1, 1]),
});
const SKEL = [
    nd("pelvis", -1, [0, 6.0, 0]), nd("chest", 0, [0, 0.62, 0]), nd("head", 1, [0, 0.70, 0]),
    nd("upperArmL", 1, [-0.42, 0.10, 0]), nd("lowerArmL", 3, [-0.64, 0, 0]),
    nd("upperArmR", 1, [0.42, 0.10, 0]), nd("lowerArmR", 5, [0.64, 0, 0]),
    nd("thighL", 0, [-0.22, -0.24, 0]), nd("shinL", 7, [0, -0.88, 0]),
    nd("thighR", 0, [0.22, -0.24, 0]), nd("shinR", 9, [0, -0.88, 0]),
];
const SEGS = R.boneSegments(SKEL);
const ATTACH = R.attachPoints(SKEL, SEGS);
const JOINTS = R.jointsFromSegments(SKEL, SEGS);
const ENC = R.bodiesFromSegments(SEGS, 1000, ATTACH);
const NAIVE = R.bodiesFromSegments(SEGS, 1000, null);

/** Do two axis-aligned boxes interpenetrate, and by how much along the least-penetrating axis? */
function overlapPairs(bodies) {
    const out = [];
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        const A = bodies[i], B = bodies[j];
        const d = [0, 1, 2].map((k) => Math.abs(A.pos[k] - B.pos[k]) - (A.half[k] + B.half[k]));
        if (d.every((v) => v < 0)) out.push({ a: A.name, b: B.name, depth: Math.min(...d.map((v) => -v)) });
    }
    return out.sort((x, y) => y.depth - x.depth);
}

// =============================================================================================================
console.log("1. *** THE BODIES OVERLAP EACH OTHER AT REST -- pure geometry, before any solver runs ***");
{
    const oe = overlapPairs(ENC), on = overlapPairs(NAIVE);
    ok("!! *** BOTH DERIVATIONS SELF-OVERLAP, SO THIS IS NOT A CONSEQUENCE OF v4245's FIX ***",
        oe.length > 0 && on.length > 0,
        oe.length + " overlapping pairs for the shipped enclosing bodies and " + on.length + " for the naive " +
        "ones. A bone's box runs to its child's head and the child's box STARTS there, so by construction they " +
        "meet -- and each is inflated by a radius on top of that.");
    report("deepest enclosing overlaps: " + oe.slice(0, 4).map((o) => o.a + "/" + o.b + " " + o.depth.toFixed(3) + " m").join(", "));
    report("deepest naive overlaps:     " + on.slice(0, 4).map((o) => o.a + "/" + o.b + " " + o.depth.toFixed(3) + " m").join(", "));
    // *** AND HERE IS THE FIRST MEASURED COST OF THE ENCLOSING FIX, WHICH v4248 COULD FIND NO BENEFIT FOR. ***
    ok("!! *** THE ENCLOSING FIX MAKES IT WORSE: " + oe.length + " OVERLAPPING PAIRS AGAINST " + on.length + " ***",
        oe.length > on.length,
        "growing each body to reach its child's head necessarily grows it INTO the child. v4248 measured no " +
        "behavioural benefit from that fix through three instruments; this is a cost it does have. The fix is " +
        "still geometrically right about the anchors -- and it is no longer free.");
    const arm = oe.find((o) => /chest/.test(o.a + o.b) && /upperArm/.test(o.a + o.b));
    ok("   ...and the worst new pair is exactly the one the fix created",
        !!arm && arm.depth > 0.2,
        arm ? arm.a + " / " + arm.b + " interpenetrate by " + arm.depth.toFixed(3) + " m, because the chest box " +
        "was grown out to x = +/-0.42 to reach the shoulder anchors, which is where the arms begin" : "(absent)");
}

// =============================================================================================================
const st = await initNode();
if (!st.ready) {
    report("SKIPPED -- box3d did not load: " + (st.reason || "unknown"));
    console.log("\nSKIPPED");
    process.exit(0);
}
const m = mod();

/** Hang the ragdoll from a pinned pelvis and read the contacts it generates against ITSELF. */
function hangContacts(bodies, steps) {
    m._swk_world_create(0, -9.8, 0);
    const idx = new Map();
    for (const b of bodies) {
        idx.set(b.bone, m._swk_body_box(b.bone === 0 ? 0 : 1, b.pos[0], b.pos[1], b.pos[2], b.half[0], b.half[1], b.half[2], 1000));
    }
    for (const j of JOINTS) {
        const A = idx.get(j.parentBone), B = idx.get(j.childBone), a = j.anchor;
        if (j.type === "weld") m._swk_joint_weld(A, B, a[0], a[1], a[2], 8, 0.5);
        else if (j.type === "spherical") m._swk_joint_spherical(A, B, a[0], a[1], a[2], j.axis[0], j.axis[1], j.axis[2], j.limit);
        else m._swk_joint_revolute(A, B, a[0], a[1], a[2], j.axis[0], j.axis[1], j.axis[2], j.limit[0], j.limit[1]);
    }
    for (let k = 0; k < steps; k++) m._swk_world_step(1 / 60, 4);
    const n = m._swk_contact_count(), stride = m._swk_contact_stride();
    let impulse = 0, bodies_hit = new Set();
    if (n > 0) {
        const ptr = m._malloc(n * stride * 4);
        m._swk_contacts(ptr);
        const f = new Float32Array(m.HEAPF32.buffer, ptr, n * stride);
        for (let r = 0; r < n; r++) { impulse += Math.abs(f[r * stride + 7]); bodies_hit.add(f[r * stride]); }
        m._free(ptr);
    }
    m._swk_world_destroy();
    return { n, stride, impulse, bodiesHit: bodies_hit.size };
}

console.log("\n2. *** AND THE OVERLAP IS REAL TO THE SOLVER: it generates contacts, with impulse ***");
{
    // NO GROUND in this world and the pelvis is pinned, so every contact reported is the ragdoll against
    // ITSELF. That is what makes the number mean something rather than counting the floor.
    const e = hangContacts(ENC, 200), n = hangContacts(NAIVE, 200);
    ok("!! *** HANGING IN EMPTY SPACE, THE RAGDOLL STILL GENERATES CONTACTS -- against its own limbs ***",
        e.n > 0 && n.n > 0,
        "enclosing " + e.n + " contact rows across " + e.bodiesHit + " bodies, naive " + n.n + " across " +
        n.bodiesHit + ". There is no ground in this world and the pelvis is static, so every one of these is " +
        "the ragdoll colliding with itself while its joints hold it together.");
    ok("!! ...and they carry real impulse, so the solver is doing work to push the body apart",
        e.impulse > 0 && n.impulse > 0,
        "summed |normal impulse| " + e.impulse.toFixed(1) + " enclosing, " + n.impulse.toFixed(1) + " naive. " +
        "Contacts with zero impulse would be touching pairs the solver had already resolved; these are a fight.");
    // *** AND THE SECOND MEASURED COST OF THE ENCLOSING FIX, WHICH IS FAR LARGER THAN THE PAIR COUNT SUGGESTS.
    // 14 pairs against 10 is a 40% difference. The FORCE is not 40% -- the enclosing bodies overlap far more
    // DEEPLY (0.241 m at the shoulder against nothing comparable), and contact impulse grows with penetration.
    ok("!! *** THE ENCLOSING BODIES FIGHT THEMSELVES " + (e.impulse / n.impulse).toFixed(0) + " TIMES HARDER ***",
        e.impulse > 50 * n.impulse,
        e.impulse.toFixed(0) + " against " + n.impulse.toFixed(0) + " -- a factor of " +
        (e.impulse / n.impulse).toFixed(0) + ", where the PAIR COUNT differs by only 40%. Penetration depth is " +
        "what drives contact impulse, and growing the chest out to the shoulder anchors buries the arms 0.241 m " +
        "inside it. This is the cost v4248 went looking for benefit from and did not find.");
    report("*** EVERY RAGDOLL IMPLEMENTATION SOLVES THIS THE SAME WAY: disable collision between jointed " +
           "neighbours. A shoulder and an upper arm are SUPPOSED to occupy the same space -- that is what a " +
           "shoulder is -- and no amount of careful box fitting changes that.");
}

// =============================================================================================================
console.log("\n3. *** THE FIX IS NOT AVAILABLE, AND THAT IS A FACT ABOUT THE SHIM RATHER THAN AN OPINION ***");
{
    const shim = fs.readFileSync(path.join(ENG, "physics/box3d/box3d_shim.c"), "utf8");
    const filtering = /collideConnected|enableCollision|categoryBits|maskBits|b3Filter|swk_body_set_filter/.test(shim);
    ok("!! *** box3d_shim.c EXPOSES NO COLLISION FILTERING OF ANY KIND ***",
        !filtering,
        "no collideConnected on any joint def, no category or mask bits, no groups, no filter setter. The " +
        "three joint constructors set bodyIdA, bodyIdB and the two local frames and nothing else, so there is " +
        "no argument a caller could pass to say 'these two are meant to overlap'.");
    // *** AND IT CANNOT BE ADDED FROM HERE. *** The shim compiles against a header this repository does not
    // contain, so the signature of any such field is unreadable. Guessing one and calling it a fix is the
    // failure this session has spent several rounds learning to avoid.
    const vendored = fs.readdirSync(path.join(ENG, "vendor/box3d"));
    ok("!! *** AND THE HEADER IT WOULD NEED IS NOT VENDORED, so the change cannot be written here ***",
        !vendored.some((f) => /\.h$/.test(f)) && /#include "box3d\/box3d\.h"/.test(shim),
        "vendor/box3d/ holds " + JSON.stringify(vendored) + " -- the built artifact and its glue, no headers. " +
        "The shim's #include resolves only where build-box3d-wasm-clang.sh has fetched the library. Writing a " +
        "collideConnected parameter against an API that cannot be read here would be guessing at a signature " +
        "and shipping it as a fix.");
    report("SO THIS ROUND MEASURES AND REFUSES TO REPAIR. The repair is a shim change plus a wasm rebuild, " +
           "which is rig work: physics/box3d/build-box3d-wasm-clang.sh on a machine with the toolchain and " +
           "the library. PENDING_REBUILD in box3dNode.mjs is the mechanism that already exists for exactly " +
           "that hand-off, and it is empty because nothing is currently waiting on a rebuild.");
}

// =============================================================================================================
// ---- v4249 SABOTAGES, RESTORED BYTE-IDENTICAL AND md5-VERIFIED ------------------------------------------
//
//   A  bodiesFromSegments ignores its attach points, so the enclosing bodies become the naive ones. -> 3 RED:
//      14 pairs collapses to 10 against 10, and the impulse ratio to 1. Both comparisons in sections 1 and 2
//      are load-bearing and neither survives the two sides becoming the same thing.
//      *** IT TOOK THREE ATTEMPTS TO LAND, AND THE FIRST TWO GREEN RUNS WERE WORTHLESS. *** The first aimed
//      at ragdollFromSkeleton's wiring, which this gate does not use -- it builds both derivations itself,
//      deliberately, so the sabotage hit a path under no test. The second was a sed whose `|` delimiter
//      collided with the `||` in the line it was matching; it printed an error, changed nothing, and the
//      gate went green. This is v4248's lesson arriving again one round later: A SABOTAGE MUST BE CONFIRMED
//      APPLIED BEFORE ITS RESULT IS READ, and `grep -c` on the marker is what confirms it.
//
//   B  a commented-out `def.base.collideConnected = false;` added to box3d_shim.c. -> 1 RED. The filtering
//      check reads SOURCE TEXT, so it fires on a mention rather than on a call -- which is the right
//      sensitivity here: the claim is that no such argument exists anywhere in the shim, and a commented
//      line is somebody having thought about it, which would make the claim wrong.
//
console.log("\n4. and shrinking the boxes is NOT the workaround it looks like");
{
    // The obvious escape: if they overlap, make them smaller. Measured across the whole range, it never
    // finishes the job -- because adjacent segments MEET BY CONSTRUCTION and shrinking moves the meeting
    // point without removing it.
    const rows = [];
    let clearedAt = null;
    for (const sc of [1.0, 0.8, 0.6, 0.4, 0.3, 0.2, 0.1]) {
        const shrink = (bs) => bs.map((b) => ({ ...b, half: b.half.map((h) => h * sc) }));
        const e = overlapPairs(shrink(ENC)).length, n = overlapPairs(shrink(NAIVE)).length;
        rows.push(sc.toFixed(1) + ": " + e + "/" + n);
        if (e === 0 && n === 0 && clearedAt === null) clearedAt = sc;
    }
    // *** THE FIRST VERSION OF THIS CHECK ASSERTED "SHRINKING NEVER CLEARS IT" AND WAS SIMPLY WRONG. *** It
    // does clear, at a fifth of the size, and the gate caught the overclaim on its first run. The honest
    // statement is not that the escape is impossible but that it costs more than it saves.
    const armR = ENC.find((b) => b.name === "lowerArmL").half[1];
    ok("!! *** SHRINKING DOES CLEAR IT -- AT " + clearedAt.toFixed(1) + "x, WHERE THE LIMBS STOP BEING LIMBS ***",
        clearedAt !== null && clearedAt <= 0.3,
        "overlapping pairs (enclosing/naive) at shrink factors " + rows.join(", ") + ". It reaches zero at " +
        clearedAt.toFixed(1) + "x, which takes the forearm's collider radius from " + armR.toFixed(3) + " m to " +
        (armR * clearedAt).toFixed(3) + " m -- a limb about a centimetre thick. The overlap is gone because " +
        "there is almost nothing left to overlap.");
    report("and shrinking is not free either: thinner limbs mean a ragdoll that falls THROUGH things and a " +
           "visual mesh that no longer matches its collider. It is not a workaround, it is a different defect.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: what the self-collision actually COSTS in behaviour. This round establishes that the " +
    "overlap exists, that the solver is doing real work about it, and that the fix cannot be requested -- it " +
    "does NOT show the ragdoll behaving wrongly because of it, and after v4248 found three instruments unable " +
    "to separate two derivations, that distinction is worth keeping. It is entirely possible that a ragdoll " +
    "which fights itself still looks fine. Also unchecked: whether box3d supports collideConnected AT ALL. " +
    "The claim here is that the SHIM does not expose filtering and that the header cannot be read from this " +
    "repository -- not that the library lacks the feature, which is a question only the rig can answer.");
process.exit(fails ? 1 : 0);
