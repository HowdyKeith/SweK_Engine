// WebGLEngine/tools/ship/ragdollFromSkeleton-selfcheck.mjs -- v4245
//
// Run: node tools/ship/ragdollFromSkeleton-selfcheck.mjs
//
// *** #116 CAME FROM sunag/Oimo.js-Lab AND THE ASSESSMENT FOUND NOTHING TO TAKE. *** Its two headline
// features are ragdolls and a BVH, and this tree has both. What the assessment found instead was a grep
// result: the box3d joint API has exactly ONE real caller in the entire tree, and its eleven box positions
// and ten joint anchors are typed in as world coordinates while gpu/SkeletalAnimator.js holds real bone
// hierarchies from real GLBs that nothing connects to it.
//
// This gate checks that grep result against the tree, derives the same creature from a hierarchy instead,
// and measures the defect the obvious derivation has.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "../../physics/ragdollFromSkeleton.mjs";
import { qAngle } from "../../anim/retarget.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

console.log("ragdollFromSkeleton-selfcheck -- a joint graph derived from a skeleton, not typed out\n");

const n = (name, parent, t) => ({
    name, parent, translation: new Float32Array(t),
    rotation: new Float32Array([0, 0, 0, 1]), scale: new Float32Array([1, 1, 1]),
});
// The same creature ragdoll.html types out, expressed as a HIERARCHY instead of as world boxes.
const SKEL = [
    n("pelvis", -1, [0, 6.0, 0]),
    n("chest", 0, [0, 0.62, 0]),
    n("head", 1, [0, 0.70, 0]),
    n("upperArmL", 1, [-0.42, 0.10, 0]),
    n("lowerArmL", 3, [-0.64, 0, 0]),
    n("upperArmR", 1, [0.42, 0.10, 0]),
    n("lowerArmR", 5, [0.64, 0, 0]),
    n("thighL", 0, [-0.22, -0.24, 0]),
    n("shinL", 7, [0, -0.88, 0]),
    n("thighR", 0, [0.22, -0.24, 0]),
    n("shinR", 9, [0, -0.88, 0]),
];
const RD = R.ragdollFromSkeleton(SKEL);
const inside = (p, b) => [0, 1, 2].every((k) => Math.abs(p[k] - b.pos[k]) <= b.half[k] + 1e-9);

// =============================================================================================================
console.log("1. *** THE GREP RESULT THAT IS THE WHOLE REASON FOR THIS ROUND, CHECKED AGAINST THE TREE ***");
{
    const files = [];
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (e.name === "node_modules" || e.name === ".git" || e.name === "vendor") continue;
            const f = path.join(d, e.name);
            if (e.isDirectory()) walk(f);
            else if (/\.(js|mjs|html)$/.test(e.name)) files.push(f);
        }
    };
    walk(ENG);
    // A CALL, not a mention: the name followed by an open bracket, and not preceded by a dot-free definition.
    const callers = [];
    for (const f of files) {
        const src = fs.readFileSync(f, "utf8");
        const rel = path.relative(ENG, f);
        if (/\bworld\.joint(Spherical|Revolute|Weld)\s*\(/.test(src)) callers.push(rel);
    }
    // *** #116 SAID "ragdoll.html IS THE ONLY CALLER". THAT WAS WRONG, AND THIS CHECK IS WHAT SAID SO. ***
    // The assessment's grep matched `jointSpherical` loosely and read flesh.html's hits as mentions. There
    // are TWO real callers, and finding the second made the argument stronger rather than weaker -- see the
    // duplication check below.
    const pages = callers.filter((c) => /\.html$/.test(c)).sort();
    ok("!! *** TWO PAGES CALL THE JOINT API, NOT ONE -- #116 SAID ONE AND THIS CHECK CORRECTED IT ***",
        pages.length === 2 && pages[0] === "flesh.html" && pages[1] === "ragdoll.html",
        "callers of world.jointSpherical / jointRevolute / jointWeld: " + JSON.stringify(callers) + ". The " +
        "non-page entry is physics/backendConformance.mjs, which calls jointWeld to check that a backend " +
        "claiming joints does not throw -- a probe, not a rig. Everything else that mentions those names is " +
        "a stub returning -1 (planarFallbackWorld, freeSpaceWorld, joltLoader) or a comment.");
    const readBones = (f) => {
        const src = fs.readFileSync(path.join(ENG, f), "utf8");
        const m = /const BONES = \[([\s\S]*?)\n\];/.exec(src);
        if (!m) return null;
        return [...m[1].matchAll(/\["(\w+)",\s*\[([^\]]*)\],\s*\[([^\]]*)\]/g)]
            .map((r) => r[1] + "|" + r[2].replace(/\s/g, "") + "|" + r[3].replace(/\s/g, ""));
    };
    const bRag = readBones("ragdoll.html"), bFlesh = readBones("flesh.html");
    // *** AND THE SECOND CALLER IS THE ARGUMENT. *** The same eleven bones, at the same coordinates, typed
    // out twice in two files. A derivation replaces both with one function of the skeleton.
    ok("!! *** AND BOTH PAGES CARRY THE SAME ELEVEN BONES AT THE SAME COORDINATES, TYPED OUT TWICE ***",
        bRag && bFlesh && bRag.length === 11 && JSON.stringify(bRag) === JSON.stringify(bFlesh),
        bRag.length + " bones in ragdoll.html and " + bFlesh.length + " in flesh.html, identical row for " +
        "row including every half-extent. Two files, one creature, and nothing keeps them in step: move a " +
        "bone in one and the other silently disagrees, while inside EACH file eleven box centres and ten " +
        "joint anchors have to be kept consistent by hand as well.");
}

// =============================================================================================================
console.log("\n2. the derivation: a body per bone, a joint per link, and the anchor for free");
{
    ok("!! the derived graph has the same shape as the one ragdoll.html types out",
        RD.bodies.length === 11 && RD.joints.length === 10,
        RD.bodies.length + " bodies and " + RD.joints.length + " joints, against 11 and 10 typed out by hand");
    // *** THE ANCHOR IS THE POINT THAT MAKES THIS A DERIVATION RATHER THAN A TRANSCRIPTION. *** Parent and
    // child were both measured from the child's head, so the anchor cannot drift from the geometry.
    let worst = 0;
    for (const j of RD.joints) {
        const h = RD.segments[j.childBone].head;
        worst = Math.max(worst, Math.hypot(...j.anchor.map((v, k) => v - h[k])));
    }
    ok("!! *** EVERY JOINT ANCHOR IS EXACTLY THE CHILD'S HEAD -- 0 error, not a small one ***",
        worst === 0,
        "worst deviation " + worst + " over " + RD.joints.length + " joints. Both bodies were measured from " +
        "that point, so it is the same number and not two numbers that agree.");
    ok("!! and the joint TYPES reproduce the hand-authored table",
        RD.joints.find((j) => j.name === "upperArmL").type === "spherical" &&
        RD.joints.find((j) => j.name === "lowerArmL").type === "revolute" &&
        RD.joints.find((j) => j.name === "thighL").type === "spherical" &&
        RD.joints.find((j) => j.name === "shinL").type === "revolute" &&
        RD.joints.find((j) => j.name === "chest").type === "weld",
        "shoulder spherical, elbow revolute, hip spherical, knee revolute, spine weld -- the same five " +
        "answers ragdoll.html gives, read off bone names rather than typed per joint");
    ok("   ...including the limits, which are the part that makes a knee a knee",
        JSON.stringify(RD.joints.find((j) => j.name === "shinL").limit) === "[-145,0]" &&
        RD.joints.find((j) => j.name === "thighL").limit === 60,
        "knee [-145, 0] and hip cone 60, matching ragdoll.html. An unrecognised bone gets a WELD, which is " +
        "the conservative answer: too stiff looks wrong, too free puts a knee through a shin.");
}

// =============================================================================================================
console.log("\n3. *** THE OBVIOUS DERIVATION IS WRONG, AND THIS IS THE NUMBER THAT SAYS SO ***");
{
    // The natural body is a box spanning head to tail. Building it that way is one argument away, so both
    // are built here and compared -- the defect is measured rather than described in a comment.
    const naive = R.bodiesFromSegments(RD.segments, 1000, null);
    const fixed = RD.bodies;
    const outN = RD.joints.filter((j) => !inside(j.anchor, naive[j.parentBone]));
    const outF = RD.joints.filter((j) => !inside(j.anchor, fixed[j.parentBone]));
    ok("!! *** A BOX SPANNING HEAD-TO-TAIL PUTS 4 OF 10 ANCHORS OUTSIDE THE BODY THEY ATTACH TO ***",
        outN.length === 4,
        outN.map((j) => j.name).join(", ") + " -- both shoulders and both hips. A bone with several children " +
        "has only ONE tail: the pelvis's segment runs to the spine, so the hips, which hang off its sides, " +
        "are nowhere near the box. The solver then pulls on a point the body does not contain.");
    ok("!! *** ENCLOSING EVERY CHILD HEAD FIXES IT: 0 OF 10 ***",
        outF.length === 0,
        "a body is the box containing every point it must REACH -- its head, its tail, and the head of every " +
        "child. That is exactly what makes ragdoll.html's chest and pelvis wide, done there by typing the " +
        "numbers and here by deriving them.");
    const pelvis = fixed[0], pelvisN = naive[0];
    ok("   ...and it is the multi-child bones that grew, which is the mechanism showing up in the sizes",
        pelvis.half[0] > pelvisN.half[0] * 1.5 && fixed[4].half[0] <= naive[4].half[0] + 1e-9,
        "pelvis half-width " + pelvisN.half[0].toFixed(3) + " -> " + pelvis.half[0].toFixed(3) +
        " (3 children), while lowerArmL is unchanged at " + fixed[4].half[0].toFixed(3) + " (0 children)");
}

// =============================================================================================================
console.log("\n4. the one thing that cannot be derived, declared rather than hidden");
{
    const leaves = RD.segments.filter((s) => !s.derived);
    ok("!! a leaf bone has no child, so it has no measurable length -- and those bones are named",
        leaves.length === 5 && leaves.every((s) => s.children === 0),
        leaves.map((s) => s.name).join(", ") + " have no child to measure to. Everything else is derived " +
        "from the hierarchy; these five come from LEAF_FACTOR = " + R.LEAF_FACTOR + " of the parent's length.");
    // A guess that is measured is a different thing from a guess that is hidden: move it and see what moves.
    const before = RD.segments[2].length;
    const saved = R.LEAF_FACTOR;
    ok("   ...and the guess is a declared constant, so its effect is visible rather than baked in",
        typeof saved === "number" && before > 0,
        "head length " + before.toFixed(3) + " = parent length " + (before / saved).toFixed(3) + " x " + saved +
        ". Nothing DERIVES a hand's length; the alternative to a declared factor is an undeclared one.");
    ok("!! mass follows volume, so a thigh outweighs a forearm without anyone choosing a number",
        RD.bodies[7].mass > RD.bodies[4].mass,
        "thighL " + RD.bodies[7].mass.toFixed(1) + " against lowerArmL " + RD.bodies[4].mass.toFixed(1) +
        " -- a ratio of " + (RD.bodies[7].mass / RD.bodies[4].mass).toFixed(2) + ", from box volume alone");
    report("a bone with several children takes its FIRST as its tail, so the pelvis's segment is the spine's. " +
           "That is a real limitation and section 3's fix is what stops it mattering for the ANCHORS; the " +
           "segment direction is still the first child's, which nothing here needs and something later might");
}

// =============================================================================================================
// ---- v4245 SABOTAGES, RESTORED BYTE-IDENTICAL AND md5-VERIFIED -------------------------------------------
//
//   A  ragdollFromSkeleton stops passing the attach points, so bodies span head-to-tail again. -> 2 RED, and
//      the pelvis reads 0.112 against 0.332. This is the defect section 3 measures, re-introduced on the
//      REAL path rather than only in the side-by-side, because a comparison a gate builds for itself can be
//      right while the shipped path is wrong.
//
//   B  the joint anchor taken from the parent's TAIL instead of the child's HEAD. -> 2 RED at 0.888. Those
//      two points are the SAME for a single-child bone and differ for every other, so this sabotage is
//      invisible on a chain and obvious on a humanoid -- which is why the test creature has a pelvis with
//      three children rather than a spine with one.
//
//   C  blendPose lerps instead of slerping. -> 1 RED. Worst |q| - 1 goes from 4e-8 to 3.7e-2, and the check
//      reports the two as equal because it is comparing the blend against a lerp and the blend now IS one.
//      Note what stayed green: the endpoints and the MONOTONICITY, both of which a lerp satisfies perfectly.
//      A blend can be monotone, hit both ends exactly, and still shorten every bone in the middle.
//
console.log("\n5. *** THE CONVERSE, WHICH IS WHAT MAKES IT A HIT REACTION RATHER THAN A DROP ***");
{
    const q = (a) => { const L = Math.hypot(...a); return a.map((v) => v / L); };
    const anim = SKEL.map(() => [0, 0, 0, 1]);
    const phys = SKEL.map((_, i) => q([0.3 + i * 0.02, 0.1, 0.2, 0.9]));
    ok("!! weight 0 is the animated pose EXACTLY, not nearly",
        R.blendPose(anim, phys, 0).every((v, i) => v.every((c, k) => c === anim[i][k])),
        "no slerp is run at the endpoints, so a bone at weight 0 is bit-identical to the animation and a " +
        "character standing still cannot drift");
    // *** THE ENDPOINT CLAIM IS BIT-IDENTITY, AND qAngle CANNOT EXPRESS IT. *** 2*acos(dot) on two copies of
    // a float-normalised quaternion returns ~1e-8 rather than 0, because |q| is not exactly 1 -- so the
    // first version of this check failed on a pose that was already bit-identical. The angle is the wrong
    // instrument for an equality; the components are the right one.
    ok("!! weight 1 is the simulated pose EXACTLY -- compared componentwise, because an ANGLE cannot say 'identical'",
        R.blendPose(anim, phys, 1).every((v, i) => v.every((c, k) => c === phys[i][k])),
        "bit-identical components at the endpoint. Measured through qAngle this reads 1e-8 and looks like a " +
        "tolerance question, which is how a check ends up asserting 'near enough' about an exact property.");
    // Monotone: as the weight rises the pose leaves the animation and approaches the simulation, without
    // turning back. A blend that is not monotone reads as a twitch.
    let mono = true, prevA = -1, prevP = Infinity;
    const row = [];
    for (let w = 0; w <= 1.0001; w += 0.125) {
        const d = R.blendDistance(anim, phys, R.blendPose(anim, phys, w));
        if (d.toAnim < prevA - 1e-9 || d.toPhys > prevP + 1e-9) mono = false;
        prevA = d.toAnim; prevP = d.toPhys;
        row.push(w.toFixed(3) + ":" + d.toAnim.toFixed(3));
    }
    ok("!! *** AND IT IS MONOTONE ALL THE WAY ACROSS -- a blend that turns back reads as a twitch ***",
        mono, "distance from the animated pose at w = " + row.join(", "));
    // *** SLERP, NOT LERP, AND THE REASON IS MEASURABLE. *** A linear blend of two quaternions leaves the
    // unit sphere; feeding a non-unit quaternion to a rotation matrix scales the bone. SkeletalAnimator's
    // round-292 note records exactly this dip for its own matrix lerp.
    let worstNorm = 0, worstLerp = 0;
    for (let w = 0; w <= 1.0001; w += 0.0625) {
        for (const b of R.blendPose(anim, phys, w)) worstNorm = Math.max(worstNorm, Math.abs(Math.hypot(...b) - 1));
        for (let i = 0; i < anim.length; i++) {
            const l = anim[i].map((v, k) => v * (1 - w) + phys[i][k] * w);
            worstLerp = Math.max(worstLerp, Math.abs(Math.hypot(...l) - 1));
        }
    }
    ok("!! *** THE BLEND STAYS ON THE UNIT SPHERE; A LINEAR ONE WOULD NOT ***",
        worstNorm < 1e-6 && worstLerp > 1e-3,
        "worst |q| - 1 is " + worstNorm.toExponential(2) + " for the slerp against " + worstLerp.toExponential(2) +
        " for a lerp of the same two poses. A non-unit quaternion fed to a rotation matrix SHORTENS THE BONE, " +
        "which is the scale dip SkeletalAnimator's round-292 note records for its own matrix lerp.");
    ok("   per-bone weights work, so a blend can be partial -- one arm limp, the rest animating",
        (() => {
            const w = SKEL.map((_, i) => (i === 3 || i === 4 ? 1 : 0));
            const out = R.blendPose(anim, phys, w);
            return out[4].every((c, k) => c === phys[4][k]) && out[0].every((c, k) => c === anim[0][k]);
        })(),
        "the arm bones land on the simulated pose while the pelvis stays on the animated one -- which is " +
        "what a hit reaction to one shoulder actually is");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: any of this INSIDE box3d. Nothing in this gate creates a world, adds a body or makes a " +
    "joint -- it derives the description that would be handed to those calls and checks the description. " +
    "A derived graph that box3d rejects, or that explodes on the first step, would pass every check above. " +
    "ragdoll.html remains the only caller of the joint API and this file has not changed that. Also " +
    "unchecked: whether the blend WEIGHTS are driven by anything -- blendPose takes them and nothing " +
    "produces them, so the ramp that makes a stagger is still a caller's job; and the segment direction for " +
    "a multi-child bone, which is still its first child's and which section 4 reports rather than solves.");
process.exit(fails ? 1 : 0);
