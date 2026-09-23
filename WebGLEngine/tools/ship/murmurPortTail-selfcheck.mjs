// WebGLEngine/tools/ship/murmurPortTail-selfcheck.mjs -- v4669
//
// *** THE LAST THREE ITEMS OF THE murmur PORT, AND TWO OF THEM TURNED OUT NOT TO BE WHAT THE RECORD SAID. ***
//
// tools/ship/nextRounds.mjs carried three: tempest's bolt slots "missing murmur's `small` mix", prism's hue
// question from v4661, and mh_out's triangular-PDF dither. They share a gate because they are one round's
// subject and not one mechanism -- the file says so in its name rather than borrowing the dither's.
//
//   1. tempest's slots were NOT missing the mix. This file compiles for one badge size and says so where the
//      size dial is declared, so `small` is 0 and murmur's mix(2.9, 5.2, small) evaluates to 2.9 -- which is
//      what the table has always held. What was missing was the OTHER END of murmur's four numbers.
//   2. prism's question is answered by prism.ts in two adjacent lines, and the answer is that the port was
//      already right. The row exists so a later tidying cannot quietly make it wrong.
//   3. The dither was a real absence, and it is the last of kit.ts's 41 functions this port did not have.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { sp, renderSpecies, ditherAt, lin } from "./murmurSpeciesFrames.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurPortTail-selfcheck -- the last three items of the murmur port\n");

const TSL_SRC = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");

// =============================================================================================================
sec("1. *** tempest's BOLT SLOTS: the mix was FOLDED, and only half of murmur's four numbers were written down ***");
{
    const B = K.MH_TEMPEST_BOLT, small = K.mhSmall(120, 120);
    // murmur's two lines, transcribed here rather than read off the table, so the table is GRADED and not
    // merely restated -- the v4579 distinction this tree keeps returning to.
    const MURMUR = [{ seed: 21.0, big: 2.9, small: 5.2 }, { seed: 27.0, big: 4.3, small: 7.4 }];
    const folded = B.lanes.map((L) => K.mhBoltSlot(L, small));
    say(`the size dial here is mhSmall(120, 120) = ${small}, so the fold is murmur's mix at small = 0`);
    say(`lane 21: ${K.mhBoltSlot(B.lanes[0], 0)} big / ${K.mhBoltSlot(B.lanes[0], 1)} small;  ` +
        `lane 27: ${K.mhBoltSlot(B.lanes[1], 0)} big / ${K.mhBoltSlot(B.lanes[1], 1)} small`);
    ok("!! *** BOTH ENDS OF murmur's MIX ARE IN THE TABLE, AND THE FOLD AT THIS SIZE IS THE OLD CONSTANT ***",
        small === 0 &&
        MURMUR.every((m, i) => B.lanes[i].seed === m.seed &&
            Math.abs(K.mhBoltSlot(B.lanes[i], 0) - m.big) < 1e-12 &&
            Math.abs(K.mhBoltSlot(B.lanes[i], 1) - m.small) < 1e-12) &&
        folded[0] === 2.9 && folded[1] === 4.3,
        `tempest.ts: mh_flourish(t, 21.0, mix(2.9, 5.2, small) * rate) and mh_flourish(t, 27.0, ` +
        `mix(4.3, 7.4, small) * rate) -- "TWO LIGHTNING LANES, on slots that shorten as the storm rises", ` +
        `and that LENGTHEN as the badge shrinks, because a bolt two pixels long reads as noise unless it is ` +
        `rare enough to be an event. *** THE PORT WAS NOT MISSING THE TERM. *** small is ${small} here, so ` +
        `murmur's mix IS 2.9 and 4.3 and that is what the table held. What it did not hold was 5.2 and 7.4, ` +
        `which no gate could have caught because nothing reads them at this size. The four numbers are all ` +
        `here now and the compiled shader is unchanged -- the fold is exact, not approximate: multiplying ` +
        `the gap by a small of exactly 0 returns the big end to the bit.`);

    ok("!! ...and the shader folds through the kit's own mhSmall rather than writing 2.9 down again",
        /mhBoltSlot\(L, mhSmall\(120, 120\)\)/.test(TSL_SRC) &&
        !/MH_TEMPEST_BOLT\.lanes\[[01]\]\.slot/.test(TSL_SRC),
        `the shader reads MH_TEMPEST_BOLT.lanes.map((L) => mhBoltSlot(L, mhSmall(120, 120))) and no longer ` +
        `reaches for .slot directly. THE SECOND CONJUNCT IS THE ONE THAT MATTERS: a fold added beside the ` +
        `old constant, with the old constant still read somewhere, is two spellings of one number and the ` +
        `size dial would move only one of them. This is the shape KIT_AA and droplet's tremGate already ` +
        `use -- the badge size decided in one place -- and it is now three sites rather than two.`);
}

// =============================================================================================================
sec("2. *** prism's HUE QUESTION, ASKED AT v4661 AND ANSWERED BY prism.ts ***");
{
    // v4661 put st.complete's constant on brightP -- which beams AND the hue numerator both read -- and
    // explicitly refused to say whether prism's GESTURE PULSE and its v4659 travelling figure belonged on
    // the hue as well: "what this round refused to do is add a third term in the shape it is unsure about."
    //
    // prism.ts settles it in two adjacent lines:
    //     float beams = (e0 + e1 + e2) * bright * run * (1.0 + pulse) ...
    //     float hueW  = (e0 * -1.0 + e2 * 1.0) * bright * run;
    // `bright` is on both. `(1 + pulse)` is on the beams ALONE. The port already matches, and this row is
    // here so that stays true -- the answer to an open question is worth a check precisely because the next
    // reader will find the asymmetry and think it is an oversight.
    const beamsHasPulse = /const beams = E\[0\]\.add\(E\[1\]\)\.add\(E\[2\]\)\.mul\(brightP\)\.mul\(run\)\.mul\(float\(1\.0\)\.add\(pulse\)\)/.test(TSL_SRC);
    const hueLine = /const hueWP = ([^\n]*)\.toVar\(\);/.exec(TSL_SRC);
    const hueBody = hueLine ? hueLine[1] : "";
    const hueHasBright = /\.mul\(brightP\)\.mul\(run\)/.test(hueBody);
    const hueHasPulse = /pulse/.test(hueBody);
    say(`beams carries (1 + pulse): ${beamsHasPulse}; hueWP carries brightP*run: ${hueHasBright}; hueWP mentions pulse: ${hueHasPulse}`);
    ok("!! *** THE PULSE IS ON THE ENERGY AND NOT ON THE HUE NUMERATOR, WHICH IS murmur's OWN ASYMMETRY ***",
        beamsHasPulse && hueHasBright && !hueHasPulse,
        `prism accumulates a luminance and a hue NUMERATOR separately and divides one by the other, so a ` +
        `term on the energy alone drifts the colour toward the anchor while it fires. murmur does that ON ` +
        `PURPOSE: the flash is brighter, not differently coloured. v4661 could not tell whether the ` +
        `asymmetry was murmur's design or this port's oversight and said so rather than guessing; with the ` +
        `upstream in hand it is two lines of prism.ts and the port was already right. *** THE NEGATIVE ` +
        `CONJUNCT IS THE WHOLE ROW: *** "hueWP does not mention pulse" is what a tidying pass would break, ` +
        `and a row asserting only the two positives would stay green while it did.`);
}

// =============================================================================================================
sec("3. *** mh_out: the last of kit.ts's 41 FUNCTIONS THIS PORT DID NOT HAVE ***");
{
    // *** THE CPU TWIN IS GRADED AGAINST A FRESH TRANSCRIPTION OF kit.ts, NOT AGAINST ITSELF. *** Written out
    // here from the source rather than imported, so an edit to either side shows up as a disagreement.
    const fract = (x) => x - Math.floor(x);
    const ref = (linRGB, px, py) => {
        const n = fract(52.9829189 * fract(px * 0.06711056 + py * 0.00583715));
        const tri = n < 0.5 ? Math.sqrt(2 * n) - 1 : 1 - Math.sqrt(Math.max(0, 2 - 2 * n));
        return linRGB.map((c) => Math.min(1, Math.max(0, K.linearToSrgb(c) + tri * (1 / 255))));
    };
    let worst = 0;
    for (let px = 0; px < 48; px++) for (let py = 0; py < 48; py++) {
        const l = [0.01 + px * 0.02, 0.5, 0.97];
        const a = K.mhOut(l, px, py), b = ref(l, px, py);
        for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
    }
    ok("!! the kit's mhOut IS kit.ts's mh_out, over 2,304 pixels and three levels each",
        worst === 0,
        `worst |mhOut - transcription| = ${worst}. The reference is written out in this file from kit.ts ` +
        `rather than imported from the thing it grades, which is the only version of this comparison that ` +
        `can fail.`);

    // *** AND THE PDF IS TRIANGULAR, WHICH IS THE ONE PROPERTY murmur GIVES A REASON FOR. *** "Triangular
    // rather than uniform because uniform dither leaves a faint texture of its own in flat areas." A row
    // that only checked the support would pass for a uniform hash, which is the thing being rejected.
    const N = 400, vals = [];
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) vals.push(ditherAt(x, y));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const varr = vals.reduce((a, b) => a + b * b, 0) / vals.length - mean * mean;
    // a triangular PDF on [-1,1] has variance 1/6; a uniform one on [-1,1] has 1/3
    const sorted = vals.slice().sort((a, b) => a - b);
    const q = (f) => sorted[Math.floor(f * (sorted.length - 1))];
    say(`over ${vals.length} pixels: mean ${mean.toFixed(5)}, variance ${varr.toFixed(5)} ` +
        `(triangular 1/6 = 0.16667, uniform 1/3 = 0.33333), support [${q(0).toFixed(4)}, ${q(1).toFixed(4)}]`);
    say(`quartiles: ${q(0.25).toFixed(4)} / ${q(0.5).toFixed(4)} / ${q(0.75).toFixed(4)} ` +
        `(triangular -0.2929 / 0 / +0.2929, uniform -0.5 / 0 / +0.5)`);
    ok("!! *** IT IS TRIANGULAR AND NOT UNIFORM, WHICH IS THE PROPERTY murmur STATES A REASON FOR ***",
        Math.abs(mean) < 0.01 && Math.abs(varr - 1 / 6) < 0.01 &&
        Math.abs(q(0.25) + 0.2929) < 0.02 && Math.abs(q(0.75) - 0.2929) < 0.02 &&
        q(0) < -0.98 && q(1) > 0.98,
        `variance ${varr.toFixed(5)} against 1/6 for a triangular PDF and 1/3 for a uniform one -- a factor ` +
        `of two apart, so this cannot pass for the wrong shape. THE QUARTILES ARE ASSERTED AS WELL AS THE ` +
        `VARIANCE because a symmetric distribution can match a variance with the wrong shape; a uniform hash ` +
        `puts its quartiles at +/-0.5 and this one puts them at +/-0.293. The support still reaches +/-1, ` +
        `which is what makes it one CODE VALUE of dither and not less.`);

    ok("!! ...and it is a function of the PIXEL and of nothing else, so a still orb cannot crawl",
        /const mhOut = Fn\(\(\[linearRGB, pixel\]\)/.test(
            fs.readFileSync(path.join(ENG, "render", "murmurKitTsl.mjs"), "utf8")) &&
        !/uniforms\.time/.test(/const mhOut = Fn[\s\S]{0,600}/.exec(
            fs.readFileSync(path.join(ENG, "render", "murmurKitTsl.mjs"), "utf8"))[0]),
        `mh_out takes a pixel and returns a colour; there is no clock in it. A dither that moved frame to ` +
        `frame would be visible as CRAWL on an orb that is otherwise perfectly still, which is the one ` +
        `thing this roster is never allowed to do -- and it is the obvious "improvement" somebody adds ` +
        `later to make the noise less visible in a single frame.`);
}

// =============================================================================================================
sec("4. *** AND IT REACHES PIXELS: the dither is RECOVERED from the render and measured against the model ***");
{
    // *** THE FIRST CUT OF THIS SECTION WAS A ROW THAT COULD NOT FAIL, AND THREE SABOTAGES WALKED THROUGH IT.
    // *** It reconstructed the undithered byte as round(b - ditherAt(x,y)) and reported how often that
    // differed from b -- which is a statement about ditherAt and about nothing else. Making the SHADER's
    // dither uniform, or twice as large, or one-sided, changed the picture and did not change that row by a
    // single count, because the shader never entered the comparison.
    //
    // *** SO THE DITHER IS RECOVERED FROM THE FRAMEBUFFER INSTEAD. *** The written byte is
    // round(255*srgb(x,y) + tri(x,y)): a smooth field plus a per-pixel noise. A discrete Laplacian kills any
    // field that is locally linear and leaves the noise intact, so regressing the RENDER's Laplacian on the
    // MODEL's Laplacian estimates the amplitude at which murmur's dither is actually present. The slope is
    // the statistic and the correlation is not: everything else in that Laplacian -- the field's own
    // curvature, the eight-bit rounding -- is uncorrelated with the model, so it inflates the scatter
    // without biasing the answer.
    //
    // 128 px AND NOT 48, WHICH IS A BUDGET DECISION WITH A NUMBER BEHIND IT: at 48 the standard error on the
    // slope is +/-0.45, which does not separate a correct dither from one of twice the size. At 128 it is
    // +/-0.053. The frames helper's own note says a gate that needs to see a figure should pay the 340 ms.
    const run = await renderSpecies([sp("still", 7.0, 0.30)], 128);
    if (!run.ok || !run.frames) { ok("!! still renders at 128", false, `could not render: ${run.reason || run.skipped}`); }
    else {
        const f = run.frames[0], N = Math.round(Math.sqrt(f.length / 4));
        const at = (x, y, c) => f[(y * N + x) * 4 + c];
        const lap = (g, x, y) => 4 * g(x, y) - g(x - 1, y) - g(x + 1, y) - g(x, y - 1) - g(x, y + 1);
        const fit = (model) => {
            let n = 0, sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
            for (let y = 2; y < N - 2; y++) for (let x = 2; x < N - 2; x++) {
                const dx = (x + 0.5) / N * 2 - 1, dy = (y + 0.5) / N * 2 - 1;
                if (Math.hypot(dx, dy) > 0.45) continue;       // inside the body, away from the limb
                for (let c = 0; c < 3; c++) {
                    let clipped = false;
                    for (const [ox, oy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]])
                        if (at(x + ox, y + oy, c) <= 1 || at(x + ox, y + oy, c) >= 254) clipped = true;
                    if (clipped) continue;                      // clamping destroys the dither at both ends
                    const L = lap((a, b) => at(a, b, c), x, y), T = lap(model, x, y);
                    n++; sx += T; sy += L; sxy += T * L; sxx += T * T; syy += L * L;
                }
            }
            const mx = sx / n, my = sy / n, cov = sxy / n - mx * my, vx = sxx / n - mx * mx, vy = syy / n - my * my;
            const slope = cov / vx;
            return { n, slope, se: Math.sqrt((vy - cov * cov / vx) / vx / n) };
        };
        const got = fit((x, y) => ditherAt(x, y));
        const flip = fit((x, y) => ditherAt(x, N - 1 - y));
        say(`regressing the render's Laplacian on murmur's dither: slope ${got.slope.toFixed(4)} +/- ${got.se.toFixed(4)} over ${got.n} samples`);
        say(`the same fit against a VERTICALLY FLIPPED model: slope ${flip.slope.toFixed(4)} +/- ${flip.se.toFixed(4)}`);
        ok("!! *** murmur's DITHER IS PRESENT IN THE FRAMEBUFFER AT UNIT AMPLITUDE, RECOVERED AND NOT ASSUMED ***",
            Math.abs(got.slope - 1) < 4 * got.se && got.n > 5000 && Math.abs(flip.slope) < 4 * flip.se,
            `slope ${got.slope.toFixed(4)} +/- ${got.se.toFixed(4)} against a predicted 1.0000 -- the dither ` +
            `the shader wrote IS the dither this file models, at the amplitude murmur specifies. A dither of ` +
            `two code values reads 1.62 here and a one-sided one reads 0.20, both of which this bound ` +
            `rejects. *** THE FLIPPED FIT IS THE CONTROL AND IT IS ASSERTED AT ZERO: *** three's uv() has v ` +
            `at the bottom and the readback is top-down, so a y-flip was the live suspect, and a model that ` +
            `correlated with the render either way round would be telling us nothing about alignment. It ` +
            `reads ${flip.slope.toFixed(4)}, consistent with no relationship at all. *** AND THE ARGUMENT IS ` +
            `THE FRAGMENT CENTRE: *** hashing the integer index instead recovers 0.690, which is what the ` +
            `first cut of tools/ship/murmurSpeciesFrames.mjs did -- a subtraction at 69% of the right ` +
            `amplitude, removing two thirds of the dither and injecting a third of a new one.`);

        // ...and the step itself, which is the other half of "one code value".
        let worst = 0, up = 0, down = 0, moved = 0, tot = 0;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let c = 0; c < 3; c++) {
            const b = at(x, y, c); if (b <= 1 || b >= 254) continue;
            const d = b - Math.round(b - ditherAt(x, y)); tot++;
            if (d !== 0) { moved++; d > 0 ? up++ : down++; }
            worst = Math.max(worst, Math.abs(d));
        }
        const frac = moved / tot;
        say(`the step it takes: worst ${worst} code value(s), ${(frac * 100).toFixed(1)}% of channels moved ` +
            `(triangular predicts 25.0%, uniform 50.0%), ${up} up and ${down} down`);
        ok("!! ...and the step is one code value, both ways, on the share the triangular density predicts",
            worst <= 1 && Math.abs(frac - 0.25) < 0.04 && Math.min(up, down) > 0.8 * Math.max(up, down),
            `round(b - tri) differs from b exactly when |tri| >= 0.5, whose probability under a triangular ` +
            `density on [-1,1] is (1 - 0.5)^2 = 0.25 and under a uniform one is 0.50. THIS ROW IS ABOUT ` +
            `ditherAt AND THE ROW ABOVE IS ABOUT THE SHADER, and that division is the point: this one cannot ` +
            `catch a wrong dither in the shader and does not claim to. It catches a wrong one HERE, in the ` +
            `model every other gate now subtracts before it measures anything.`);

        ok("!! ...and it is on the DIRECT path only, because murmur's present pass owns the pipeline's",
            /linear \? colorLinear : KIT\.mhOut\(colorLinear, screenCoordinate\)/.test(TSL_SRC) &&
            /noise\.sub\(0\.5\)\.div\(255\.0\)/.test(
                fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbPresent.mjs"), "utf8")),
            `on the \`linear\` path this shader feeds render/aiPresenceOrbPresent.mjs, a port of murmur's ` +
            `present.wgsl, whose header says the pass owns "exposure, bloom, the tone curve, THE DITHER and ` +
            `the sRGB encode" -- and which has carried its own since the first ship. Dithering in both ` +
            `places would be two independent noise fields on one image, which is louder than either and is ` +
            `not what murmur does. The second conjunct checks the present pass still has one, so this row ` +
            `cannot go green by the pipeline quietly losing it.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the last three items on the port's backlog, and two of them were not what the " +
    "record said. tempest's bolt slots were not missing murmur's `small` mix -- this file compiles for one " +
    "badge size, so the mix was folded correctly and only half of murmur's four numbers were written down. " +
    "prism's hue question was answered by two adjacent lines of prism.ts, in favour of what already shipped. " +
    "mh_out's dither was a real absence and is the last of kit.ts's 41 functions to arrive." +
    "\nWHAT IS NOT CLAIMED: that the size dial does anything. It is 0 at the size this port compiles for, at " +
    "all 69 of its sites, and that is a stated decision rather than a gap -- making it live would be a " +
    "design change that moves nothing at the default. The small-size end of tempest's slots is recorded " +
    "here so that a round which DOES make it live has murmur's numbers rather than a reconstruction." +
    "\nAND NOT CLAIMED: that the dither is invisible to every instrument. It moved two species gates the " +
    "hour it landed, and both were reading a single pixel where they meant a figure -- see " +
    "tools/ship/murmurSpeciesFrames.mjs, which now removes it exactly before any measurement.");
process.exit(fails ? 1 : 0);
