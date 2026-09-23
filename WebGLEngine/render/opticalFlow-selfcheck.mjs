#!/usr/bin/env node
// WebGLEngine/render/opticalFlow-selfcheck.mjs -- v4673
//
// Run: node render/opticalFlow-selfcheck.mjs
// RUNTIME: recorded at the foot of this file.
//
// *** THE FIRST THING IN THIS TREE THAT IS NOT FSR2. ***
//
// FSR2 is given the application's motion vectors and trusts them. FSR3 adds FRAME GENERATION, and for that
// they are not enough: they describe where GEOMETRY went, not where the PICTURE went. A shadow sliding
// across a wall, a reflection tracking in a mirror, a scrolling texture -- the surface did not move, the
// vector is zero, and an interpolated frame built on it holds the shadow still while everything slides
// around it. So FSR3 estimates a second field from COLOUR. This is that estimator.
//
// *** AND IT IS WHAT render/luminancePyramid.mjs WAS BUILT FOR. *** v4668 shipped FSR2's mip chain unable
// to be wired -- the exposure it drives multiplies by one on this content -- and left the runner gate-only
// with the reason recorded and runnerCallers' ratchet widened rather than satisfied by a decorative call.
// That gate's closing named this round: "FSR3's frame interpolation wants the same chain for a different
// reason and is where it earns its keep next." Section 3 is that claim, measured.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import { opticalFlowCPU } from "./opticalFlow.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

// *** NON-PERIODIC CONTENT, BECAUSE A PERIODIC FIXTURE MAKES THE MATCHER LOOK BROKEN WHEN IT IS RIGHT. ***
// The first draft of this fixture used sin(x) * cos(y). Its period is ~17 pixels, the search legitimately
// locked onto a different period, and the flow read (3.53, 9.63) against a truth of (3, -2) -- an answer
// that is CORRECT for that content and useless as a test. A smoothed random field has one match.
const W = 64, H = 64, N = W * H, PAD = 32;
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const base = new Float32Array((W + 2 * PAD) * (H + 2 * PAD));
for (let i = 0; i < base.length; i++) base[i] = rnd();
const smooth = (x, y) => { let s = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        s += base[(y + PAD + dy) * (W + 2 * PAD) + (x + PAD + dx)];
    return s / 25; };
const shifted = (ox, oy) => { const o = new Float32Array(N * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = smooth(x - ox, y - oy), i = (y * W + x) * 4; o[i] = o[i + 1] = o[i + 2] = v; }
    return o; };
const flat = () => { const o = new Float32Array(N * 4); o.fill(0.5); for (let i = 3; i < o.length; i += 4) o[i] = 1; return o; };

/** How many CONFIDENT blocks got the shift exactly right, and how many were confident at all. */
const score = (F, sx, sy, minConf = 0.2) => {
    let exact = 0, conf = 0;
    for (let i = 0; i < F.bw * F.bh; i++) {
        if (F.conf[i] < minConf) continue;
        conf++;
        if (F.flow[i * 2] === sx && F.flow[i * 2 + 1] === sy) exact++;
    }
    return { exact, conf };
};

console.log("opticalFlow-selfcheck -- motion from colour alone, and what a pyramid buys\n");

console.log("1. IT FINDS A KNOWN SHIFT, AND IN THE ARC'S SENSE");
const one = opticalFlowCPU({ cur: shifted(3, -2), prev: shifted(0, 0), w: W, h: H, block: 8, searchRadius: 4, levels: 1 });
const s1 = score(one, 3, -2);
say("one level, shift (3, -2)", `${s1.exact} of ${s1.conf} confident blocks exactly right`);
ok("!! *** every confident block recovers the shift EXACTLY, with no pyramid involved ***",
   s1.exact === s1.conf && s1.conf >= 60,
   `${s1.exact}/${s1.conf}. One level, a search of +-4, a displacement inside it: if the SAD, the block ` +
   "walk or the tie rule were wrong this is where it shows, before any of the coarse-to-fine machinery.");
// *** THE SENSE. *** A block matcher naturally answers "where did this block GO"; the arc's convention is
// the reverse, and a module returning the search's own sense would be a second convention in a tree that
// has spent rounds getting to one. v4638 recorded what that costs.
ok("!! *** ...and the sign is render/motionVectors.mjs's, not the search's own ***",
   one.flow[0] === 3 && one.flow[1] === -2,
   `flow reads (${one.flow[0]}, ${one.flow[1]}) for content moved by (3, -2). The search internally finds ` +
   "the block at (-3, +2) in the previous frame and the module negates once, at one site. Returning the " +
   "raw search would give a field that is exactly backwards and looks entirely plausible.");

console.log("\n2. WHAT IT REFUSES, AND WHAT IT DECLINES TO KNOW");
ok("a fractional or too-small block, radius or level count is refused rather than rounded",
   (() => { let n = 0;
     for (const a of [{ block: 1 }, { block: 8.5 }, { searchRadius: 0 }, { searchRadius: 1.5 }, { levels: 0 }, { levels: 2.5 }])
       try { opticalFlowCPU({ cur: shifted(0, 0), prev: shifted(0, 0), w: W, h: H, ...a }); } catch { n++; }
     return n === 6; })(),
   "a block of 8.5 pixels is not a window this loop can walk, and flooring it silently would search " +
   "something the caller did not ask for");
// *** THE APERTURE PROBLEM IS NOT A BUG AND MUST NOT BE HIDDEN. ***
const F = opticalFlowCPU({ cur: flat(), prev: flat(), w: W, h: H, block: 8, searchRadius: 4, levels: 1 });
let maxConf = 0; for (let i = 0; i < F.bw * F.bh; i++) maxConf = Math.max(maxConf, F.conf[i]);
ok("!! *** a FLAT field reports zero confidence everywhere, rather than a confident arbitrary vector ***",
   maxConf === 0,
   `max confidence ${maxConf}. A block of flat colour matches equally well everywhere and the search ` +
   "returns SOMETHING; the vector is arbitrary and the confidence is the only thing that says so. A " +
   "caller reading the vectors and ignoring the confidence has a field that is confidently wrong across " +
   "most of most frames.");
const Z = opticalFlowCPU({ cur: shifted(0, 0), prev: shifted(0, 0), w: W, h: H, block: 8, searchRadius: 4, levels: 1 });
let zc = 0; for (let i = 0; i < Z.bw * Z.bh; i++) if (Z.conf[i] > 0) zc++;
ok("!! ...and textured content that did NOT move reports zero confidence too, which is the same rule",
   zc === 0,
   "confidence is how much better the winner is than standing still. When nothing moved, standing still " +
   "IS the winner and the honest report is 'no information', not 'zero motion, certain'. Those are " +
   "different claims and a frame generator needs to tell them apart.");

// *** THE TIE RULE, WHICH NOTHING ABOVE CAN SEE. *** A sabotage taking nearer-OR-EQUAL scored ZERO: on the
// smoothed random field no two candidates tie exactly, and where they DO tie -- flat content -- every row
// above skips the block for having no confidence. But the vector is still written, and with `<=` the last
// candidate scanned wins, which is the corner of the search window at EVERY flat block. An arbitrary vector
// is unavoidable there; a systematic drift to the corner is not, and a frame generator warping by it would
// pull every flat region one way.
let corner = 0, zeroFlow = 0;
for (let i = 0; i < F.bw * F.bh; i++) {
    if (F.flow[i * 2] === 0 && F.flow[i * 2 + 1] === 0) zeroFlow++;
    if (F.flow[i * 2] === 4 && F.flow[i * 2 + 1] === 4) corner++;
}
say("  flat field, where every candidate ties", `${zeroFlow} blocks report no motion, ${corner} report the search corner`);
ok("!! *** where every candidate TIES the guess is kept, not the last one scanned ***",
   zeroFlow === F.bw * F.bh && corner === 0,
   "the confidence is 0 either way and every row above skips these blocks, so this is the only place the " +
   "tie rule is visible at all. Strictly-better keeps the incoming guess; nearer-or-equal hands every flat " +
   "block the corner of its own search window. render/dilate.mjs takes the same rule for the same reason.");

// *** AND WHOSE LUMINANCE IT IS, WHICH SHIFT-RECOVERY CANNOT SEE EITHER. *** Any monotone luma recovers a
// rigid shift, so a module that built its own Rec.709 chain passed every row above. This fixture is FLAT in
// the arc's luma -- 0.25r + 0.5g + 0.25b, held constant by moving r and b against each other -- and
// textured in Rec.709. The arc's pyramid must therefore find nothing here.
const metamer = (ox) => { const o = new Float32Array(N * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const r = smooth(x - ox, y), i = (y * W + x) * 4;
        o[i] = r; o[i + 1] = 0.5; o[i + 2] = 1 - r;      // r + b is constant, so 0.25r + 0.5g + 0.25b is
        o[i + 3] = 1; }
    return o; };
const M = opticalFlowCPU({ cur: metamer(3), prev: metamer(0), w: W, h: H, block: 8, searchRadius: 4, levels: 1 });
let mConf = 0; for (let i = 0; i < M.bw * M.bh; i++) mConf = Math.max(mConf, M.conf[i]);
say("  content flat in the arc's luma, textured in Rec.709", `max confidence ${mConf.toExponential(2)}`);
ok("!! *** it is render/temporalReject.mjs's luma that this searches, and not a second convention ***",
   mConf < 1e-6,
   "r and b move against each other so 0.25r + 0.5g + 0.25b is CONSTANT while 0.2126r + 0.0722b is not. " +
   "A matcher building its own Rec.709 chain sees a moving texture here and reports it confidently; this " +
   "one correctly sees nothing. Every row above recovers a rigid shift under ANY monotone luma, so this " +
   "is the only row that holds WHOSE brightness the search is of -- and the pyramid it imports is the one " +
   "whose edge bias v4668 measured.");

console.log("\n3. WHAT THE PYRAMID BUYS, WHICH IS THE WHOLE REASON IT IS HERE");
// *** AND IT WAS MEASURED THE WRONG WAY ROUND FIRST. *** See the sabotage log: shrinking the patch with
// the mip made three levels WORSE than one, which is the reverse of the point.
const rows = [];
for (const [sx, sy] of [[3, -2], [9, -7], [14, 11]])
    for (const L of [1, 3]) {
        const f = opticalFlowCPU({ cur: shifted(sx, sy), prev: shifted(0, 0), w: W, h: H, block: 8, searchRadius: 4, levels: L });
        rows.push({ sx, sy, L, ...score(f, sx, sy) });
    }
for (const r of rows) say(`  shift (${r.sx}, ${r.sy}) at ${r.L} level${r.L > 1 ? "s" : " "}`, `${r.exact} of ${r.conf} exact`);
const small1 = rows.find((r) => r.sx === 3 && r.L === 1), small3 = rows.find((r) => r.sx === 3 && r.L === 3);
const big1 = rows.filter((r) => r.sx !== 3 && r.L === 1), big3 = rows.filter((r) => r.sx !== 3 && r.L === 3);
ok("!! *** a displacement beyond one level's search radius is found by NOTHING at one level ***",
   big1.every((r) => r.exact === 0) && big1.length === 2,
   `${big1.map((r) => `(${r.sx}, ${r.sy}): ${r.exact} of ${r.conf}`).join(", ")}. A search of +-4 cannot ` +
   "reach 9 or 14 pixels, and the blocks are still CONFIDENT -- they found a good match, at the wrong " +
   "place. Confidence is not correctness and this is the row that says so.");
ok("!! *** ...and the same displacement is found by a THIRD of the blocks at three levels ***",
   big3.every((r) => r.exact > 25) && big3.length === 2,
   `${big3.map((r) => `(${r.sx}, ${r.sy}): ${r.exact} of ${r.conf}`).join(", ")}, against ZERO at one ` +
   "level. The coarsest level searches +-4 of ITS pixels, which is +-16 of the frame's, and each finer " +
   "level refines what it hands down. That is what the mip chain is for and this arc had no consumer of " +
   "one until now.");
ok("!! ...and the pyramid COSTS accuracy on a displacement one level could already reach",
   small1.exact > small3.exact,
   `${small1.exact} of ${small1.conf} at one level against ${small3.exact} of ${small3.conf} at three, ` +
   "for a shift of (3, -2). The coarse levels quantise: a guess formed on a quarter-resolution mip is a " +
   "multiple of four full-resolution pixels, and the fine refinement has to walk back from it. A round " +
   "reporting only section 3's first two rows would be selling the pyramid as free.");

console.log(fails ? `\nopticalFlow-selfcheck: ${fails} FAILED` : "\nopticalFlow-selfcheck: ALL GREEN");
console.log("unchecked here: SUB-PIXEL flow, which this returns in whole pixels only -- FSR3 refines to " +
            "fractions and an interpolated frame placed on integer motion would judder; a DEVICE mirror, " +
            "which every other module in this arc has and this one does not yet, so nothing here is a " +
            "parity claim; REAL content, since a rigid shift of a random field is the easiest case a block " +
            "matcher ever sees and says nothing about rotation, scaling or an object moving against a " +
            "background; reconciling this field with the APPLICATION's motion vectors, which is the actual " +
            "FSR3 pass and needs both fields on one frame; and FRAME INTERPOLATION itself, which is what " +
            "all of this is for and has not been started.");
//
// SABOTAGE LOG -- each applied to the live tree, run, and restored.
//   O1  the sense is not negated -- the field comes back backwards    4 RED.
//   O2  the tie rule takes nearer-OR-EQUAL                            *** 0 RED AT FIRST ***, see below.
//   O3  confidence reports 1 wherever a match was found               2 RED.
//   O4  the patch shrinks with the mip again                          1 RED, section 3's middle row.
//   O5  the module builds its own Rec.709 luminance chain             *** 0 RED AT FIRST ***, see below.
// Five mutations, five caught, after two repairs -- and one of those repairs was to the MODULE.
//
// *** O2 AND O5 WERE BOTH INVISIBLE TO EVERY ROW THIS GATE HAD, FOR THE SAME REASON: THE FIXTURE COULD NOT
// TELL. *** A rigid shift of a smoothed random field is recovered under ANY monotone luma, so a Rec.709
// chain passed everything; and no two candidates tie exactly on that field, while the blocks where they DO
// tie -- flat content -- were skipped by every row for having no confidence. Two fixtures were added: a
// FLAT field, where the tie rule is the only thing deciding the vector, and a METAMER -- r and b moved
// against each other so that 0.25r + 0.5g + 0.25b is constant while 0.2126r + 0.0722b is not, which is
// invisible to this tree's luma and a moving texture to Rec.709.
//
// *** AND THE FLAT-FIELD ROW FAILED ON THE UNSABOTAGED MODULE, WHICH IS THE ROUND'S OWN DEFECT. *** `best`
// began at Infinity, so the FIRST candidate scanned won every tie rather than the guess: 0 blocks reporting
// no motion and 64 reporting the corner of their search window (-4, -4), while the header claimed "a tie
// leaves the centre alone". The claim was false and the row written to check it is what found it. `best` is
// seeded with the guess's own score now, and every other figure in this gate is unchanged by the fix.
//
// RUNTIME: 100 ms median of five (93 97 100 100 109). No adapter: this module has no device mirror yet,
// which the closing line names.
//
process.exitCode = fails ? 1 : 0;
