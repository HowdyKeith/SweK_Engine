// WebGLEngine/tools/ship/retarget-selfcheck.mjs -- v4244
//
// Run: node tools/ship/retarget-selfcheck.mjs
//
// *** PLAYING A CLIP AUTHORED FOR ONE SKELETON ON ANOTHER, AND THE CHECK THE BACKLOG ITEM ASKED FOR THAT
// TURNS OUT TO PROVE NOTHING. ***
//
// #115 proposed three tests: that a clip retargeted A -> B -> A returns to the original; that foot slide is
// measured against the bone-length ratio rather than asserted; and that a rest-pose difference which a naive
// copy gets visibly wrong is reported with a number. Two of those are good. The first one is not a test at
// all, and section 3 is the measurement that says so.
"use strict";
import * as rt from "../../anim/retarget.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const deg = (r) => (r * 180 / Math.PI).toFixed(2);

console.log("retarget-selfcheck -- a clip authored for one skeleton, played on another\n");

const qAxis = (ax, an) => {
    const s = Math.sin(an / 2), L = Math.hypot(...ax) || 1;
    return [ax[0] / L * s, ax[1] / L * s, ax[2] / L * s, Math.cos(an / 2)];
};

/**
 * Two skeletons that differ in the three ways that matter, all at once, because a rig that differs in only
 * one of them is a rig the naive answer might survive.
 *   - SCALE:      the target is 0.7x, so bone lengths differ and a stride must be rescaled
 *   - REST POSE:  the source is a T-pose, the target an A-pose with the arms dropped 0.9 rad
 *   - NAMING:     mixamorig: prefix and underscores against bare names and dots
 */
function skel(prefix, scale, armDrop, sep) {
    const n = (name, parent, t, r) => ({
        name: prefix + name.replace(/\./g, sep), parent,
        translation: new Float32Array(t),
        rotation: new Float32Array(r || [0, 0, 0, 1]),
        scale: new Float32Array([1, 1, 1]),
    });
    const drop = qAxis([0, 0, 1], -armDrop);
    return [
        n("Hips", -1, [0, 1.0 * scale, 0]),
        n("Spine", 0, [0, 0.25 * scale, 0]),
        n("Shoulder.L", 1, [0.08 * scale, 0.22 * scale, 0]),
        n("UpperArm.L", 2, [0.10 * scale, 0, 0], drop),
        n("ForeArm.L", 3, [0.28 * scale, 0, 0]),
        n("Hand.L", 4, [0.25 * scale, 0, 0]),
        n("UpLeg.L", 0, [0.09 * scale, -0.05 * scale, 0]),
        n("Leg.L", 6, [0, -0.45 * scale, 0]),
        n("Foot.L", 7, [0, -0.42 * scale, 0]),
    ];
}
const ARM_DROP = 0.9, SCALE = 0.7, FOOT = 8;
const SRC = skel("mixamorig:", 1.0, 0.0, "_");
const DST = skel("", SCALE, ARM_DROP, ".");

const { map, unmatchedSrc, unmatchedDst } = rt.autoMap(SRC, DST);
const anim = rt.restRotations(SRC);
anim[3] = rt.qMul(anim[3], qAxis([0, 0, 1], 0.87));    // raise the upper arm
anim[4] = qAxis([0, 1, 0], 1.05);                       // and bend the elbow
const good = rt.retargetPose(SRC, DST, map, anim);
const naive = rt.retargetNaive(SRC, DST, map, anim);

// =============================================================================================================
console.log("1. names: the boring part, which has to work before anything else can be measured");
{
    ok("!! three spellings of one bone normalise to one key",
        new Set(["mixamorig:UpperArm_L", "upperArm.L", "UPPERARML"].map(rt.normaliseBoneName)).size === 1,
        "-> " + rt.normaliseBoneName("mixamorig:UpperArm_L"));
    ok("!! and the two skeletons map completely, across a prefix AND a separator change",
        map.size === SRC.length && unmatchedSrc.length === 0 && unmatchedDst.length === 0,
        map.size + " of " + SRC.length + " bones matched");
    // *** UNMATCHED BONES ARE REPORTED BY NAME, NOT COUNTED. *** "3 bones unmapped" tells a rigger nothing;
    // "ForeArm.L unmapped" tells them where to look.
    const odd = DST.map((n, j) => (j === 5 ? { ...n, name: "wrist_left" } : n));
    const m2 = rt.autoMap(SRC, odd);
    ok("!! a bone the mapper cannot match is named on BOTH sides, because which side it is missing from decides what happens",
        m2.unmatchedSrc.length === 1 && m2.unmatchedDst.length === 1 &&
        /Hand/.test(m2.unmatchedSrc[0]) && /wrist/.test(m2.unmatchedDst[0]),
        "source has " + JSON.stringify(m2.unmatchedSrc) + " with no target; target has " +
        JSON.stringify(m2.unmatchedDst) + " with no source. The first is DROPPED and the second KEEPS ITS " +
        "REST POSE, and those are different outcomes.");
    ok("   ...and the matcher does not guess: it will not pair 'Hand.L' with 'wrist_left'",
        !m2.map.has(5), "no anatomy is inferred, deliberately -- a mapper that guesses is worse than one " +
        "that reports what it could not match");
}

// =============================================================================================================
console.log("\n2. *** REST POSES: what a clip actually stores, and why copying it is wrong ***");
{
    const WsRest = rt.worldRotations(SRC, rt.restRotations(SRC));
    const WdRest = rt.worldRotations(DST, rt.restRotations(DST));
    const Wsrc = rt.worldRotations(SRC, anim);
    const Wg = rt.worldRotations(DST, good);
    const Wn = rt.worldRotations(DST, naive);

    let worstGood = 0, worstNaive = 0, shoulderNaive = 0;
    for (const [i, j] of map) {
        const dS = rt.qAngle(Wsrc[i], WsRest[i]);      // how far the SOURCE bone moved from ITS rest
        const dG = rt.qAngle(Wg[j], WdRest[j]);        // how far the retargeted TARGET bone moved from ITS rest
        const dN = rt.qAngle(Wn[j], WdRest[j]);
        worstGood = Math.max(worstGood, Math.abs(dG - dS));
        worstNaive = Math.max(worstNaive, Math.abs(dN - dS));
        if (j === 3) shoulderNaive = Math.abs(dN - dS);
    }
    ok("!! *** THE RETARGETED POSE MOVES EVERY BONE EXACTLY AS FAR FROM ITS OWN REST AS THE SOURCE DID ***",
        worstGood < 1e-6,
        "worst discrepancy " + worstGood.toExponential(2) + " rad over " + map.size + " bones. The comparison " +
        "is made in WORLD space against each skeleton's OWN rest pose, which is the only frame in which the " +
        "two rigs mean the same thing.");
    ok("!! *** THE NAIVE COPY IS WRONG BY EXACTLY THE ANGLE BETWEEN THE TWO REST POSES ***",
        Math.abs(shoulderNaive - ARM_DROP) < 1e-6 && worstNaive > 0.5,
        "the shoulder is off by " + shoulderNaive.toFixed(4) + " rad (" + deg(shoulderNaive) + " degrees) " +
        "against a rest-pose difference of exactly " + ARM_DROP + ". That is not a coincidence and it is the " +
        "whole mechanism: a clip stores a bone's LOCAL rotation, which means nothing without the rest pose it " +
        "was authored against, so copying it adds the A-pose's arm drop on top of the animation.");
    report("nothing in the naive output looks malformed -- the quaternions are unit, the hierarchy is intact, " +
           "and the arms are simply " + deg(shoulderNaive) + " degrees below where they belong");
}

// =============================================================================================================
console.log("\n3. *** THE ROUND TRIP #115 ASKED FOR, AND IT CANNOT SEE THE DEFECT ***");
{
    const inv = new Map();
    for (const [i, j] of map) inv.set(j, i);
    const back = rt.retargetPose(DST, SRC, inv, good);
    let w = 0;
    for (let i = 0; i < SRC.length; i++) w = Math.max(w, rt.qAngle(back[i], anim[i]));
    ok("!! A -> B -> A returns the original pose exactly",
        w < 1e-6, "worst bone error " + w.toExponential(2) + " rad");

    // *** AND HERE IS WHY THAT PROVES NOTHING ON ITS OWN. ***
    const naiveBack = rt.retargetNaive(DST, SRC, inv, naive);
    let wn = 0;
    for (let i = 0; i < SRC.length; i++) wn = Math.max(wn, rt.qAngle(naiveBack[i], anim[i]));
    ok("!! *** THE NAIVE ALGORITHM ROUND-TRIPS PERFECTLY TOO -- SO THE ROUND TRIP IS NOT A TEST ***",
        wn < 1e-6,
        "worst bone error " + wn.toExponential(2) + " rad, for the algorithm section 2 measured to be " +
        deg(ARM_DROP) + " degrees wrong. A round trip applies the transform and then its inverse, so " +
        "ANYTHING COMMON TO BOTH DIRECTIONS CANCELS -- and a wrong transform is common to both directions. " +
        "This is the same shape as v4236's vertex stage, v4241's fragment shader and v4243's constant " +
        "texture, arriving now in a round trip. The item that asked for this check proposed it in good " +
        "faith; it is kept because it would catch a NON-INVERTIBLE error, and it is labelled as unable to " +
        "catch a systematically wrong one.");
    // What DOES catch it is comparing against the source's own rest-relative motion, which is section 2 --
    // an external reference rather than a self-consistency property.
    const mixed = rt.retargetPose(DST, SRC, inv, naive);
    let wm = 0;
    for (let i = 0; i < SRC.length; i++) wm = Math.max(wm, rt.qAngle(mixed[i], anim[i]));
    ok("   ...and running the naive pose back through the CORRECT one exposes it, because the sides differ",
        Math.abs(wm - ARM_DROP) < 1e-6,
        "worst error " + wm.toFixed(4) + " rad, exactly the rest-pose difference. Two DIFFERENT transforms " +
        "do not cancel, which is the whole reason section 2 grades against an external reference.");
}

// =============================================================================================================
// ---- v4244 SABOTAGES, RESTORED BYTE-IDENTICAL AND md5-VERIFIED -------------------------------------------
//
//   A  retargetPose copies the source's WORLD rotation straight onto the target instead of transferring the
//      delta from rest. -> 2 RED, worst discrepancy 0.900 rad -- the rest-pose difference, exactly.
//      *** AND THE ROUND TRIP IN SECTION 3 STAYED GREEN THROUGH IT. *** That is not a remark about the
//      sabotage, it is the evidence for what section 3 claims: a broken transform composed with its own
//      inverse is still the identity, so the round trip cannot see a systematic error. Section 2 caught it,
//      because section 2 grades against an EXTERNAL reference -- the source's own rest-relative motion --
//      rather than against the algorithm itself.
//
//   B  an unmapped target bone collapses to [0,0,0,1] instead of keeping its rest rotation. -> 1 RED. Note
//      which check did NOT move: "its children still follow the animated parent" stayed green, correctly --
//      a collapsed bone still passes its parent's world transform down the chain. Chain continuity and
//      rest-pose preservation are different questions and are asked separately.
//
//   C  rootScale returns 1 regardless of the two skeletons. -> 3 RED across the whole of section 4: the
//      ratio, the stride comparison and the leg-length agreement all fail together, which is what a shared
//      cause should look like.
//
console.log("\n4. bone lengths: rotations carry over, translation does not");
{
    const hs = rt.restHeight(SRC), hd = rt.restHeight(DST), rs = rt.rootScale(SRC, DST);
    ok("!! the root scale is the ratio of rest heights, and it recovers the scale the rigs were built with",
        Math.abs(rs - SCALE) < 1e-6,
        "src height " + hs.toFixed(4) + ", dst " + hd.toFixed(4) + ", ratio " + rs.toFixed(4) +
        " against a built-in scale of " + SCALE);

    const frames = (nodes, scale) => {
        const out = [];
        const base = rt.restTranslations(nodes);
        for (let f = 0; f < 24; f++) {
            const t = base.map((v) => [...v]);
            t[0] = [0, t[0][1], f * 0.05 * scale];
            out.push({ locals: rt.restRotations(nodes), trans: t });
        }
        return out;
    };
    const srcStride = rt.footSlide(SRC, frames(SRC, 1), FOOT);
    const unscaled = rt.footSlide(DST, frames(DST, 1), FOOT);
    const scaled = rt.footSlide(DST, frames(DST, rt.rootScale(SRC, DST)), FOOT);
    const srcLeg = 0.45 + 0.42, dstLeg = (0.45 + 0.42) * SCALE;
    ok("!! *** AN UNSCALED ROOT DRAGS THE SHORT SKELETON AT THE TALL ONE'S STRIDE ***",
        Math.abs(unscaled - srcStride) < 1e-9 && scaled < unscaled,
        "per-frame foot travel: source " + srcStride.toFixed(4) + ", target UNSCALED " + unscaled.toFixed(4) +
        " (identical -- the short skeleton covers the tall one's ground), target SCALED " + scaled.toFixed(4));
    ok("!! ...and the scaled stride matches the LEG-LENGTH ratio, which is the physical quantity",
        Math.abs(scaled / srcStride - dstLeg / srcLeg) < 1e-6,
        "stride ratio " + (scaled / srcStride).toFixed(4) + " against leg-length ratio " +
        (dstLeg / srcLeg).toFixed(4) + " (" + dstLeg.toFixed(4) + " / " + srcLeg.toFixed(4) + "). Measured " +
        "from the skeletons rather than asserted from the 0.7 they were built with.");
}

// =============================================================================================================
console.log("\n5. the bones the map does not cover");
{
    // A target bone with no source: it must KEEP ITS REST POSE, not collapse to identity. This is the case
    // that silently produces a limp twist bone, and it is invisible unless asked about directly.
    const twisted = DST.map((n, j) => (j === 4 ? { ...n, rotation: new Float32Array(qAxis([1, 0, 0], 0.4)) } : n));
    const partial = new Map(map);
    partial.delete(4);
    const out = rt.retargetPose(SRC, twisted, partial, anim);
    ok("!! *** A TARGET BONE WITH NO SOURCE KEEPS ITS REST ROTATION -- it does not collapse to identity ***",
        rt.qAngle(out[4], qAxis([1, 0, 0], 0.4)) < 1e-6,
        "the unmapped bone came back at its authored 0.4 rad, not at [0,0,0,1]. Collapsing it would be the " +
        "quiet version of this defect: the rig still animates, and one bone is limp.");
    ok("   ...and its CHILDREN still follow the animated parent, so the chain is not severed",
        rt.qAngle(rt.worldRotations(twisted, out)[5], rt.worldRotations(twisted, rt.restRotations(twisted))[5]) > 0.1,
        "the hand still moves even though the forearm was unmapped -- the unmapped bone keeps its LOCAL " +
        "rotation and rides on whatever its parent now does, which is what 'keep the rest pose' has to mean " +
        "in a hierarchy");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: any of this on a REAL GLB. The skeletons above are built in the gate, which makes the " +
    "rest-pose difference exact and the arithmetic checkable, and means nothing here has met a rig with a " +
    "twist chain, a non-uniform scale, or a bone whose local axes are rotated relative to its parent's -- " +
    "the world-space formulation is chosen to survive that last one, and it has not been tested against it. " +
    "Also unchecked: TRANSLATION channels on non-root bones, which some rigs animate and which this file " +
    "does not transfer at all; and whether SkeletalAnimator will accept a retargeted clip, because nothing " +
    "wires these two together yet -- anim/retarget.mjs is reached by this gate and by nothing else.");
process.exit(fails ? 1 : 0);
