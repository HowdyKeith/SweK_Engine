// WebGLEngine/tools/ship/murmurSingles2-selfcheck.mjs -- v4661
//
// *** THE FOUR OF THE NINE THAT ARE THE FAMILY'S PLAIN (1 + k * complete), IN PIXELS. ***
//
// Its sibling tools/ship/murmurSingles-selfcheck.mjs holds the four that are NOT that shape -- duet's
// subtraction, limn's band-gated ring, chorus's sync and droplet's additive core -- plus still's, whose
// subject only exists inside its own gesture. This gate holds comet's head 2.20, droplet's core in pixels,
// prism's beams 1.10 and limn's second interior 0.90, and the split is the usual budget one: a species costs
// one WGSL compile, seven measured 4,300 ms against a 3,000 ms ceiling, and a gate over budget does not run
// at ship time at all.
//
// *** WHAT IT ASKS FOR IS MORE THAN EACH SPECIES ALREADY HAD, and the numbers are the point. *** All four
// were already flashing before v4661 -- comet's trail from v4660, droplet's and prism's shells and figures
// from v4644 and v4659, limn's interior from v4658 -- so a row checking "it moves" would have been green on
// every one of them the day before this round began. The bound is each species' own v4660 reading.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { sp, renderSpecies, interiorMeanLight } from "./murmurSpeciesFrames.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSingles2-selfcheck -- the four plain multiplies of the nine, in pixels\n");

const SUCCESS = 4, PEAK_TAU = 0.360;
const SG = K.MH_COMPLETE_SINGLE;
const SPEC = ["comet", "droplet", "limn", "prism"];
// measured on these identical frames at v4660, with MH_COMPLETE_SINGLE's nine entries neutralised to zero
// and the count of entries neutralised ASSERTED -- v4659's baseline lied once because a regex silently
// missed one table entry and its "before" reading was the wired version.
const WAS = { comet: 1.136, droplet: 2.109, limn: 3.743, prism: 2.082 };

const FRAMES = [];
for (const s of SPEC) {
    FRAMES.push(sp(s, 7.0, 0.6, { stateIndex: SUCCESS, stateTau: 0 }));
    FRAMES.push(sp(s, 7.0, 0.6, { stateIndex: SUCCESS, stateTau: PEAK_TAU }));
}
const run = await renderSpecies(FRAMES);
if (!run.ok || !run.frames || run.frames.length !== FRAMES.length) {
    ok("!! the four plain multiplies render at all", false,
        `could not render: ${run.reason || (run.skipped ? "skipped: " + run.skipped : "frame count")}.`);
    console.log("\nFAIL -- 1 check(s)");
    process.exit(1);
}
say(`backend: ${run.isWebGPUBackend ? "REAL WebGPU" : "WebGL2 fallback"}; ${FRAMES.length} frames over ${SPEC.length} species`);

const diff = (a, b) => { let n = 0, mx = 0;
    for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) n++; if (d > mx) mx = d; }
    return { pct: 100 * n / a.length, mx }; };
const R = SPEC.map((s, i) => {
    const lo = run.frames[i * 2], hi = run.frames[i * 2 + 1];
    return { s, d: diff(lo, hi), x: interiorMeanLight(hi).mean / interiorMeanLight(lo).mean };
});

// =============================================================================================================
sec("1. *** ALL FOUR GO UP, AND EACH ONE GOES UP FROM WHERE IT ALREADY WAS ***");
{
    for (const r of R)
        say(`${r.s.padEnd(8)} ${r.d.pct.toFixed(1)}% of bytes move, worst ${String(r.d.mx).padStart(3)}   interior x${r.x.toFixed(3)}   (at v4660: x${WAS[r.s].toFixed(3)})`);
    ok("!! *** EVERY ONE OF THE FOUR LIFTS ITS SPECIES FURTHER THAN v4660 LEFT IT -- comet x1.14 -> x1.88 ***",
        R.every((r) => r.x > WAS[r.s] * 1.05) && R.every((r) => r.d.pct > 3 && r.d.mx > 20),
        `${R.map((r) => `${r.s} x${r.x.toFixed(2)} (was x${WAS[r.s].toFixed(2)})`).join(", ")}. THE BOUND IS ` +
        `EACH SPECIES' OWN PREVIOUS READING and not a threshold: all four were already flashing before this ` +
        `round -- comet's trail from v4660, droplet's shell from v4644, prism's travelling figure from ` +
        `v4659, limn's interior from v4658 -- so "it moves" was true of every one of them the day before. ` +
        `comet's is the largest proportional jump because ${SG.cometHead} is the largest constant in the ` +
        `whole table and it lands on the point of light that IS the species.`);
}

// =============================================================================================================
sec("2. *** comet's IS THE LARGEST NUMBER IN THE TABLE AND IT SITS BESIDE THE SMALLEST SETTLE ***");
{
    const head = SG.cometHead, settle = K.MH_SETTLED_COMET_HEAD;
    say(`comet's headBright carries complete at ${head} and settled at ${settle} -- a ratio of ${(head / settle).toFixed(1)}`);
    ok("!! *** THE HEAD FLARES NINE TIMES HARDER THAN IT SETTLES, which is the species written in two numbers ***",
        head === Math.max(...Object.values(SG)) && head / settle > 8 && settle > 0,
        `${head} against ${settle} on the SAME brightness: the point of light flares to ${(1 + head).toFixed(2)}x ` +
        `at the peak and keeps ${(1 + settle).toFixed(2)}x of it afterwards. comet is the species whose ` +
        `subject is one bright point, and MH_SETTLED's own note says "the species whose subject is one ` +
        `bright point spends its settle on the point first" -- this is the same argument for the flash, at ` +
        `nine times the size. IT IS ALSO comet's SECOND st.complete-adjacent site AND ITS ONLY ONE THAT ADDS ` +
        `LIGHT: v4660 gave comet's SWEEP the trail's length, a figure that adds no light whatever, so until ` +
        `this round comet's success was a path becoming visible and nothing else.`);

    ok("!! ...and droplet's is the SMALLEST, additive, and beside two other signals on the same brightness",
        SG.dropletCore === Math.min(...Object.values(SG)) &&
        /\.add\(COMPLETE\.mul\(MH_COMPLETE_SINGLE\.dropletCore\)\)/.test(
            fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8")),
        `coreBright = 1 + 0.85*live.voice + ${K.MH_SETTLED.droplet}*st.settled + ${SG.dropletCore}*st.complete ` +
        `-- three signals ADDED to a brightness rather than multiplying an interior, which is the shape ` +
        `droplet keeps for the same reason MH_SETTLED.droplet sits outside MH_SETTLED_INTERIOR. At ` +
        `${SG.dropletCore} it is the smallest of the nine, and that is the species rather than a shortfall: ` +
        `droplet's success is a body that swells, not a lamp that flares, and droplet.ts records the failure ` +
        `of the other reading by name -- "the first cut added a flat lift alongside it and success rendered ` +
        `as a solid white disc, which is precisely the white overlay the family law forbids".`);
}

// =============================================================================================================
sec("3. *** prism's GOES ON brightP, WHICH IS THE ONE PLACE BOTH ITS CHANNELS READ ***");
{
    const src = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    // v4664 put murmur's 0.55 * st.drive on the same brightness, ahead of the complete gain
    const onBright = /const brightP = float\(PR\.brightB\)\.add\(VOICE\.mul\(PR\.brightVoice\)\)\s*\n\s*\.mul\(float\(1\.0\)\.add\(DRIVE\.mul\(MH_DRIVE_FORMATION\.prismBright\)\)\)\s*\n\s*\.mul\(float\(1\.0\)\.add\(COMPLETE\.mul\(MH_COMPLETE_SINGLE\.prismBeam\)\)\)/.test(src);
    const beamsReads = /const beams = [^\n]*\.mul\(brightP\)/.test(src);
    const hueReads = /const hueWP = [^\n]*\.mul\(brightP\)/.test(src);
    say(`prism: the constant is on brightP (${onBright}); beams reads brightP (${beamsReads}); hueWP reads brightP (${hueReads})`);
    ok("!! *** ONE SITE REACHES BOTH THE ENERGY AND THE HUE NUMERATOR, by construction rather than by memory ***",
        onBright && beamsReads && hueReads,
        `prism accumulates a luminance and a hue NUMERATOR separately, and the ratio of the two is where on ` +
        `the rail's spread axis the pixel sits -- so a gain on the energy alone drifts the colour toward the ` +
        `anchor through the flash. v4660 found exactly that pairing TWICE in one round, on aura's ribbons ` +
        `and helix's strands, and both were found by reading the source line rather than by a frame. Spelled ` +
        `on brightP, which beams and hueWP both already read, it reaches both without anybody having to ` +
        `remember to write it twice. *** AND THAT IS WHY IT IS NOT ON `+"`beams`"+`, WHERE THE OTHER TWO ` +
        `TERMS ON THAT LINE LIVE: *** prism's gesture pulse and its v4659 travelling figure are both inside ` +
        `(1 + pulse) on the beams alone. Whether those two belong on the hue as well is a question about ` +
        `v4659's wiring and murmur's own spelling, and it is NOT answered here -- what this round refused to ` +
        `do is add a third term in the shape it is unsure about.`);

    ok("!! ...and limn's second interior is a multiply on the hint's AMOUNT, which is the wash and not the arc",
        /const hintAmt = [^;]*\.mul\(float\(1\.0\)\.add\(COMPLETE\.mul\(MH_COMPLETE_SINGLE\.limnHint\)\)\)/.test(src) &&
        SG.limnHint > 0 && K.MH_COMPLETE_INTERIOR.limn !== SG.limnHint,
        `hintAmt is the strength of "the volume glowing faintly where that light entered", which limn.ts ` +
        `calls "the difference between a rim drawn ON a dark disc and a rim lighting a dark VOLUME". The ` +
        `${SG.limnHint} here and the ${K.MH_COMPLETE_INTERIOR.limn} on the shared interior line are ` +
        `different numbers on different things, and the row asserts they are different so a tidying pass ` +
        `cannot collapse limn's three sites into one that happens to be green.`);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the four of v4661's nine st.complete singles that ARE the family's plain " +
    "(1 + k * complete) -- comet's head, droplet's core, prism's beams and limn's second interior -- " +
    "rendered, against each species' own v4660 reading rather than against a threshold. " +
    "\nWHAT IS NEXT DOOR: the four that are not that shape, plus still's, in " +
    "tools/ship/murmurSingles-selfcheck.mjs. " +
    "\nWHAT IS NOT CLAIMED: whether prism's gesture pulse and its v4659 travelling figure belong on the hue " +
    "numerator as well as on the energy. They are on `beams` alone today; this round put its own constant " +
    "on brightP, which both channels read, and left the other two where it found them rather than changing " +
    "a shipped wiring on an inference.");
process.exit(fails ? 1 : 0);
