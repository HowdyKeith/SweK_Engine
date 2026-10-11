// WebGLEngine/tools/ship/murmurSpecies11-selfcheck.mjs -- v4638
//
// GATE ELEVEN OVER THE SPECIES: FLUX, the fourteenth of murmur's eighteen. "An aurora streaming inside the
// glass" -- and flux.ts asks for a permission the rest of the family is denied: "THE ONE HERO ALLOWED A BROAD
// FLOWING FIELD ... an aurora is not an object. Everything else in this collection is something IN the glass;
// this is the only one whose interior is a field with a DIRECTION."
//
// *** THE PROFILE IS THE SPECIES: *** "AURORAE ARE BRIGHT AT THE BOTTOM AND FADE UPWARD, and getting that one
// profile right is most of what makes this read as an aurora rather than as a vertical smear ... a sharp rise
// at the foot and a long exponential decay above it, ASYMMETRIC ON PURPOSE -- a symmetric profile reads as a
// band of light and not as a curtain hanging."
//
// *** AND THIS PORT GOT IT UPSIDE DOWN BY TRANSCRIBING THE SOURCE CORRECTLY, WHICH IS THE ROUND'S FINDING. ***
// flux.ts negates its height because "a colorEffect's y runs DOWN the screen, so the body frame's +y is the
// bottom of the picture", and it names what happens otherwise: "An upside-down aurora is not a subtle
// mistake; it reads as light pouring in from above rather than as curtains standing on something." THIS
// PORT'S FRAME IS NOT A colorEffect'S -- its quad comes from three's uv(), whose v is 0 at the BOTTOM -- so
// copying the negation reproduced exactly the bug the comment is about. Section 1 is the measurement that
// caught it and the one that now keeps it caught. Its sibling aura is graded in …murmurSpecies10-selfcheck.mjs.
"use strict";
import * as K from "../../render/murmurKit.mjs";
import { N3, VOICE, sp, renderSpecies, light, interiorPeak } from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSpecies11-selfcheck -- flux's curtains, and which way up they hang\n");

const DIM = 0.15;
const BASE = { glint: 0, density: 0.5, fold: 0.5, spread: 0, glow: DIM,
               layers: 0.5, parallax: 0.5, murk: 0.4, facet: 0.5, glim: 0.5, stone: 0.5,
               bow: 0.5, sway: 0.5, pin: 0.5, corona: 0.5, prom: 0.5, simmer: 0.5,
               ribbon: 0.5, swirl: 0.5, depth3d: 0.5, stream: 0.5, bend: 0.5, height: 0.5 };
const FX = (t, extra = {}) => sp("flux", t, VOICE, { ...BASE, ...extra });
const T = 6.0;

const FRAMES = [FX(T), FX(T, { height: 0.0 }), FX(T, { height: 1.0 }),
                sp("nebula", T, VOICE, BASE), sp("aura", T, VOICE, BASE)];
const F = { ref: 0, hLo: 1, hHi: 2, neb: 3, aur: 4 };
const run = await renderSpecies(FRAMES);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) ok("!! the species render ran", false, `could not render: ${run.reason || "frames"}`);
const fr = (i) => run.frames[i];

// THE ROW-BY-ROW PROFILE. Frame row 0 is the TOP of the picture: the harness's WebGPU path reads its texture
// with copyTextureToBuffer, which is top-first, and does not flip. So a NEGATIVE y here is high on the screen.
const rows = (px) => {
    const out = [];
    for (let y = 0; y < N3; y++) {
        let s = 0, n = 0;
        for (let x = 0; x < N3; x++) {
            const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
            if (Math.hypot(dx, dy) > 0.55) continue;
            s += light(px, x, y); n++;
        }
        out.push([(y + 0.5) / N3 * 2 - 1, n ? s / n : 0, n]);
    }
    return out.filter((r) => r[2] > 4);
};
const halves = (px) => {
    const R = rows(px), h = Math.floor(R.length / 2);
    const up = R.slice(0, h).reduce((a, b) => a + b[1], 0) / h;
    const lo = R.slice(R.length - h).reduce((a, b) => a + b[1], 0) / h;
    return { up, lo, ratio: lo / Math.max(up, 1e-9) };
};

// =============================================================================================================
sec("1. *** THE CURTAINS HANG DOWNWARD: bright at the foot, fading up ***");
{
    if (!okRun) { ok("!! flux rendered", false, "no frames"); }
    else {
        const f = halves(fr(F.ref)), n = halves(fr(F.neb)), a = halves(fr(F.aur));
        say(`flux upper ${f.up.toFixed(4)} lower ${f.lo.toFixed(4)} = ${f.ratio.toFixed(3)}; ` +
            `nebula ${n.ratio.toFixed(3)}; aura ${a.ratio.toFixed(3)}; peak ${interiorPeak(fr(F.ref))} of 765`);

        // *** THE NUMBER THIS ROW EXISTS TO CATCH IS 0.443, AND IT WAS THIS PORT'S OWN. *** With flux.ts's
        // negation transcribed literally, the profile peaked at y = -0.396 -- the upper third -- and fell
        // away downward, giving 0.443. Dropping the negation, because three's uv() already puts +y at the
        // top, gives 2.523. The two controls say the measurement is about flux rather than about the frame:
        // nebula, which has no vertical structure at all, reads 1.073, and aura, whose sheets are tilted
        // every which way, reads 1.623 -- both far below flux and neither anywhere near 0.443.
        ok("!! *** FLUX IS BRIGHTER IN ITS LOWER HALF THAN ITS UPPER, and a marched cloud is not ***",
            f.ratio > 1.9 && f.ratio > n.ratio * 1.7 && n.ratio < 1.3,
            `flux's lower half carries x${f.ratio.toFixed(3)} the light of its upper against nebula's ` +
            `x${n.ratio.toFixed(3)} and aura's x${a.ratio.toFixed(3)}. WITH THE SOURCE'S NEGATION COPIED ` +
            `LITERALLY THIS READ 0.443 -- the foot along the TOP, which is the one failure flux.ts names: ` +
            `"An upside-down aurora is not a subtle mistake; it reads as light pouring in from above rather ` +
            `than as curtains standing on something." The bound is above 1.9 and not merely above 1, so a ` +
            `species that merely drifted low would not pass it.`);

        // AND IT IS ASYMMETRIC, which is the half that makes it a curtain rather than a band of light sitting
        // low. The foot is a smoothstep over 0.40 of the body and the fade above it is an exponential over
        // `hi`, which is 0.42 to 0.88 -- so the rise below the peak must be short and the fall above it long.
        const R = rows(fr(F.ref));
        let bi = 0; for (let i = 1; i < R.length; i++) if (R[i][1] > R[bi][1]) bi = i;
        const halfV = R[bi][1] * 0.5;
        let below = null; for (let i = bi; i < R.length; i++) if (R[i][1] < halfV) { below = R[i][0] - R[bi][0]; break; }
        let above = null; for (let i = bi; i >= 0; i--) if (R[i][1] < halfV) { above = R[bi][0] - R[i][0]; break; }
        say(`brightest row y=${R[bi][0].toFixed(3)}; half-height reached ${below === null ? "never" : below.toFixed(3)} ` +
            `BELOW it and ${above === null ? "never" : above.toFixed(3)} ABOVE it`);
        // *** THE BOUND IS 1.25 AND NOT 1.5, AND A SABOTAGE IS WHY. *** The measured asymmetry is 1.601 --
        // 0.333 of the half-frame above the peak against 0.208 below it -- so a 1.5 bound left seven per cent
        // of headroom, which is not a bound, it is a coincidence waiting to be reported as one. Replacing the
        // foot-and-fade with a plain GAUSSIAN of the same scale (the literal "symmetric profile" flux.ts
        // rejects) reads 0.292 above against 0.333 below: 0.877, the asymmetry INVERTED. Anywhere between
        // 0.877 and 1.601 separates them, and 1.25 sits in the middle of that gap rather than at one edge.
        ok("!! ...and the profile is ASYMMETRIC: a short foot below the peak, a long fade above it",
            below !== null && (above === null || above > below * 1.25),
            `from the brightest row the light falls to half over ${below.toFixed(3)} of the half-frame going ` +
            `DOWN and ${above === null ? "never falls that far going UP within the body" : above.toFixed(3) + " going UP"}. ` +
            `That asymmetry is the species: the foot is a smoothstep across ` +
            `${(K.MH_FLUX.footOut - K.MH_FLUX.footIn).toFixed(2)} of the body and the fade above it is an ` +
            `exponential over hi, which runs ${K.MH_FLUX.hiB} to ${(K.MH_FLUX.hiB + K.MH_FLUX.hiK).toFixed(2)}. ` +
            `"A symmetric profile reads as a band of light and not as a curtain hanging." MEASURED ASYMMETRY ` +
            `${above === null ? "unbounded" : (above / below).toFixed(3)} against 0.877 for a plain gaussian ` +
            `of the same scale, which is what the rejected symmetric profile reads.`);
    }
}

// =============================================================================================================
sec("2. *** HEIGHT IS A REACH, NOT A BRIGHTNESS ***");
{
    if (!okRun) { ok("!! the height frames rendered", false, "no frames"); }
    else {
        const reach = (px) => {
            const R = rows(px);
            let bi = 0; for (let i = 1; i < R.length; i++) if (R[i][1] > R[bi][1]) bi = i;
            let rr = null; for (let i = bi; i >= 0; i--) if (R[i][1] < R[bi][1] * 0.25) { rr = R[bi][0] - R[i][0]; break; }
            return { peakAt: R[bi][0], peak: R[bi][1], reach: rr };
        };
        const a = reach(fr(F.hLo)), b = reach(fr(F.hHi));
        say(`height 0: peak ${a.peak.toFixed(4)} at y=${a.peakAt.toFixed(3)}, quarter-height ${a.reach === null ? "never" : a.reach.toFixed(3)} above it; ` +
            `height 1: peak ${b.peak.toFixed(4)} at y=${b.peakAt.toFixed(3)}, ${b.reach === null ? "never" : b.reach.toFixed(3)} above it`);

        // flux.ts: "LEVEL RAISES THE CURTAINS: a louder room gets a taller display", and `height` is the knob
        // that sets how far. hi runs 0.42 -> 0.88, so the exponential's scale length doubles. THE ROW ASSERTS
        // THE PEAK STAYS PUT while the tail lengthens, because that is what separates a taller curtain from a
        // brighter one: a gain would raise the peak and leave the shape alone.
        ok("!! *** HEIGHT LENGTHENS THE FADE AND LEAVES THE FOOT WHERE IT IS ***",
            a.reach !== null && b.reach !== null && b.reach > a.reach * 1.25 &&
            Math.abs(b.peakAt - a.peakAt) < 0.12 && b.peak < a.peak * 1.35,
            `the quarter-height point moves from ${a.reach.toFixed(3)} above the peak to ${b.reach.toFixed(3)}, ` +
            `x${(b.reach / a.reach).toFixed(2)}, while the peak itself moves only ` +
            `${Math.abs(b.peakAt - a.peakAt).toFixed(3)} of the half-frame and brightens by ` +
            `${((b.peak / a.peak - 1) * 100).toFixed(0)}%. The knob drives hi ${K.MH_FLUX.hiB} -> ` +
            `${(K.MH_FLUX.hiB + K.MH_FLUX.hiK).toFixed(2)}, an exponential SCALE LENGTH, and the measured ` +
            `x${(b.reach / a.reach).toFixed(2)} lags that because the body runs out before the tail does. ` +
            `ALL THREE HALVES ARE ASSERTED: a pure gain would raise the peak and move neither of the others.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nFLUX: three vertical sheets whose position wanders with height and depth, under one asymmetric profile " +
    "-- a sharp foot and a long fade upward -- which is what makes them curtains hanging rather than a band " +
    "of light. The port had them upside down until the profile was measured." +
    "\n*** ONE OF FLUX'S MECHANISMS IS TRANSCRIBED AND NOT GRADED, with the measurement that decided it. " +
    "*** THE THREE SHEETS' STACKING: they sit at x offsets -0.34, +0.04 and +0.40, and flux.ts says three at " +
    "three offsets \"give the stacked, overlapping look that makes an aurora read as a curtain rather than " +
    "as a stripe\". Moving the middle sheet onto the first -- two curtains in one place -- moves the rows " +
    "above by very little: the lower-to-upper ratio 2.523 to 2.438 and the foot's half-height 0.208 to 0.250. " +
    "THE REASON IS THAT EVERY ROW HERE IS A VERTICAL MEASUREMENT and the stacking is HORIZONTAL: these rows " +
    "average across each row of the frame, which is exactly the axis the offsets live on. Catching it wants " +
    "a column-wise instrument, which is a different section and not one this gate's budget bought. The " +
    "offsets are right; they are not defended here." +
    "\nWHAT IS NOT CLAIMED HERE: aura, its sibling from the same round " +
    "(tools/ship/murmurSpecies10-selfcheck.mjs), arc and sol (…Species8 and …Species9), fathom and geode " +
    "(…Species6 and …Species7), and everything named in those. FOUR species remain: prism, duet, helix, chorus.");
process.exit(fails ? 1 : 0);
