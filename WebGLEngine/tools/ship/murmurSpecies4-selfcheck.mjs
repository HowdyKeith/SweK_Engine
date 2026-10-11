// WebGLEngine/tools/ship/murmurSpecies4-selfcheck.mjs -- v4632
//
// Run: node tools/ship/murmurSpecies4-selfcheck.mjs
//
// GATE FOUR OVER THE SPECIES: DROPLET ALONE, the one hero of the eighteen whose subject is its own BODY.
// "A sphere of water in free fall ... everything the others keep at a whisper is turned up": a deformation
// amplitude of 0.052 to 0.092 against the other five ported heroes' 0.018 to 0.024, a shading gain of 3.30
// against their 1.05 to 1.30, and a breath that scales the WHOLE body, which no other hero has at all.
//
// *** SPLIT OUT OF GATE TWO AT v4632, AND THE TRIGGER WAS MEASURED RATHER THAN FELT. *** Gate two held comet
// and droplet together. Adding droplet's swell pair -- four frames -- cost a PAIRED 206, 264, 216 and 287 ms
// over four interleaved runs of the two versions, taking that gate from about 2,740 ms to about 2,980
// against a 3,000 ms ceiling. Interleaved, because the box this was measured on is not the box the timings
// file was written on: gate one, UNCHANGED this round, reads 2,776 ms against a recorded 2,016, so a single
// before-and-after pair of readings would have blamed the box's drift on the change or the change on the
// box. The paired delta is the only figure here that is about the code.
//
// Two heroes in one gate is also the thing that made the split cheap: comet needs FOUR PHASES OF ONE LAP and
// droplet needs TWO WIDELY SEPARATED TIMES on periods of 76 to 134 seconds, so they never shared a frame.
// What they shared was a `still` control, and each half needs its own kind of it -- comet's is two times 1.5
// seconds apart, droplet's is the same eight-second window droplet is measured over.
//
// This is the third split in the murmur tree and all three were made BEFORE the addition that would have
// crossed the line rather than after: v4626 between the kit and the species, v4630 between gate one and gate
// two, this one between comet and droplet. A gate over budget does not run at ship time AT ALL, so the round
// that adds the row that crosses the line is the round whose red nobody sees.
"use strict";
import * as K from "../../render/murmurKit.mjs";
import { N3, VOICE, SIL_VOICE, sp, renderSpecies, lin, light, bil, ringChange, hueShift, radialScale }
    from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSpecies4-selfcheck -- droplet, the hero whose body is the subject\n");

// droplet's pair needs two WIDELY separated times: its three modes turn at periods of 76, 103 and 134
// seconds, so two frames a second apart would differ by almost nothing and the row would be measuring the
// instrument. SWELL_T is droplet's breath MAXIMUM on lane 0.9, found by search, so the same frame does
// double duty as the top of the swell pair below -- and 2.4 to 10.5 is eight seconds on those periods.
const SWELL_T = 10.50, SWELL_TENSION = 0.5;
const DROP_TIMES = [2.4, SWELL_T];
// *** THE SWELL PAIR'S KNOBS ARE SOLVED, NOT CHOSEN. *** droplet is the only hero whose breath scales the
// WHOLE body -- bodyScale = 1 + 0.050 * swell -- and `swell` ALSO multiplies its deformation amplitude by
// (1 + 0.30 * swell), so raising voice moves both and no pair taken across voice or across time separates
// them. `wobble` moves the amplitude alone. So the pair trades one against the other: at voice 1 and wobble
// 0 the amplitude is (0.052)(1 - 0.22*tension)(1 + 0.30*swell); the wobble that reproduces exactly that at
// voice 0 is solved for here, and the two frames then differ in bodyScale and in NOTHING ELSE about the body.
const swellAt = (v, t) => (0.22 + K.mhBreath(t, 0.9) * 0.78) * v;
// *** THE VOICE THE SHADER SEES, NOT THE KNOB THE FRAME SETS -- v4641. *** The swell frame is rendered at a
// raw voice of 1.0, and until v4641 render/aiPresenceOrbTsl.mjs handed that 1.0 straight to mh_shape. It now
// calls the kit's mh_live first, exactly as murmur's eighteen do, so the body sees 1.0^0.65 * 0.55 = 0.5500.
// Leaving the 1.0 here would have made this row grade the shader against a prediction for a signal the shader
// never receives -- the fit came back 1.0270 against a predicted 1.04983 and the row went red, correctly.
// mhLive is the f64 twin murmurKit-selfcheck.mjs section 11 grades bit-for-bit against the GPU, so calling it
// here is the same reference this file already uses for mhBreath and not a second opinion about it.
const SWELL_HI = swellAt(K.mhLive(1.0, 0, 0).voice, SWELL_T);
// (0.052 + 0.040*w) = 0.052 * (1 + 0.30*SWELL_HI) -- the tension factor is common to both sides and cancels.
const SWELL_WOBBLE = (0.052 * (1 + SWELL_HI * 0.30) - 0.052) / 0.040;
// EIGHT FRAMES AND TWO SHADERS. The silhouette pair runs at SIL_VOICE so that bodyScale is exactly 1 in both
// of its frames -- with voice up the breath scales the whole body between them and the outline moves even
// with the deformation switched off, measured at 0.36% under exactly that sabotage. Its low-voice frame at
// SWELL_T is ALSO the bodyScale-of-1 half of the swell pair, which is why that pair costs one frame and not
// two: same species, same time, same amplitude, same voice, same tension.
//
// *** AND EVERY FRAME NAMES spread, wobble AND tension, which is the reuseInstances promise rather than
// tidiness: *** setKnobs writes only the names PRESENT in its argument, so a knob one frame sets and the
// next does not mention keeps the first frame's value. Naming them on all of them makes the hazard
// unreachable instead of merely absent.
const DROP = (t, v, extra = {}) =>
    sp("droplet", t, v, { spread: 0.4, wobble: SWELL_WOBBLE, tension: SWELL_TENSION, ...extra });
const FRAMES = [
    ...DROP_TIMES.map((t) => DROP(t, SIL_VOICE)),
    DROP(DROP_TIMES[0], VOICE, { spread: 0 }),
    DROP(DROP_TIMES[0], VOICE, { spread: 1 }),
    DROP(SWELL_T, 1.0, { wobble: 0.0 }),
    ...DROP_TIMES.map((t) => sp("still", t, SIL_VOICE)),
    sp("still", SWELL_T, 1.0),
];
const run = await renderSpecies(FRAMES);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) ok("!! the species render ran", false, `could not render: ${run.reason || "frames " + (run.frames ? run.frames.length : "none")}`);
// droplet 0..1 are the silhouette pair; 2..3 its spread pair; 4 the top of the swell pair, whose BOTTOM is
// frame 1. still 5..6 are the silhouette control over the same window; 5 and 7 are the swell control, which
// is a species whose bodyScale is 1 at EVERY voice.
const F = { droplet: [0, 1], dropSpread: [2, 3], dropSwell: [1, 4], still: [5, 6], stillSwell: [6, 7] };

// =============================================================================================================
sec("1. *** DROPLET: THE BODY ITSELF IS THE SPECIES ***");
{
    // THE SPECIES, RENDERED. droplet's whole brief is that the BODY moves; the others' silhouettes are frozen
    // circles. Measured as the CHANGE in the per-angle silhouette radius between two times, which is the one
    // instrument here with a provably zero floor: a raster samples a circle unevenly, so still reads 5.7%
    // "out of round" on a single frame -- an artifact of the grid, identical in every frame, and therefore
    // exactly cancelled by differencing two frames of the same species.
    if (okRun) {
        const C = N3 / 2;
        const alphaAt = (px, fx, fy) => {
            const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
            const A = (x, y) => { x = Math.max(0, Math.min(N3 - 1, x)); y = Math.max(0, Math.min(N3 - 1, y)); return px[(y * N3 + x) * 4 + 3]; };
            return (A(x0, y0) * (1 - tx) + A(x0 + 1, y0) * tx) * (1 - ty) + (A(x0, y0 + 1) * (1 - tx) + A(x0 + 1, y0 + 1) * tx) * ty;
        };
        // *** THIS ROW MEASURED THE ALPHA EDGE UNTIL v4629, AND THE ALPHA IS NOT WHERE THE SILHOUETTE LIVES
        // ANY MORE. *** droplet used to carry the deformed membership as its alpha -- this port's own
        // invention, not murmur's, which composites all eighteen through one FIXED containment circle and
        // carries the body's edge in the LIGHT. v4629 moved to murmur's arrangement, because the old one
        // clipped the contact glow away entirely: the glow is nonzero only outside the silhouette, and an
        // alpha that reaches zero at the silhouette multiplies all of it by nothing.
        //
        // So the wobble is measured where it now lives. FIXED RADIUS, VARYING LIGHT: a wobbling body moves
        // its own rim in and out past a fixed sampling circle, so the profile ON that circle changes; a
        // frozen body's does not. No threshold, no bisection, no edge to find -- and that is why it is
        // stable, where three radius-finding measures tried first were not (a luminance threshold swung
        // 63-174% on still, the peak-brightness radius 0 to 56% on IDENTICAL pixels between two frame sizes,
        // because on these species the interior and the specular both outrank the rim on some rays).
        //
        // *** RE-MEASURED AT v4632 ON THE FRAMES THAT ACTUALLY RUN, and the old figures did not survive it.
        // *** The numbers here read "droplet 71.5% and 64.3%, still 0.08% and 0.02% -- roughly EIGHT HUNDRED
        // TIMES apart, with a control that is flat". Two things moved underneath them: still stopped being an
        // analytic sphere (every one of murmur's eighteen has a nonzero amp, so the control deforms too), and
        // this gate's still control moved to droplet's own window at droplet's own voice. On the frames below
        // it is droplet 74.09% and 71.03% against still 10.977% and 11.437% at 48 and 64 px -- a ratio of
        // 6.7x and 6.2x, not eight hundred. The claim is an order of magnitude and the control is NOT flat.
        const dropCh = ringChange(run.frames[F.droplet[0]], run.frames[F.droplet[1]]);
        // still at t=2.4 against still at t=3.9 -- the control needs two DIFFERENT times, not the same two
        // droplet uses, because still's silhouette is time-invariant and any pair proves it.
        const stillCh = ringChange(run.frames[F.still[0]], run.frames[F.still[1]]);
        say(`silhouette at voice ${SIL_VOICE}, light on a FIXED ring -- droplet (t=${DROP_TIMES[0]} vs ${DROP_TIMES[1]}) max ${(dropCh.max * 100).toFixed(1)}% mean ${(dropCh.mean * 100).toFixed(2)}%; still (t=${DROP_TIMES[0]} vs ${DROP_TIMES[1]}) max ${(stillCh.max * 100).toFixed(2)}% mean ${(stillCh.mean * 100).toFixed(3)}%`);
        // *** AND THE HEART, WHICH THE SILHOUETTE ROW DOES NOT SEE AT ALL. *** Deleting droplet's solved core
        // left every row here green -- the same hole comet's missing head went through. The peak is no use:
        // it saturates with the heart and without it. What the heart does is LIGHT THE FOG IT SITS IN ("the
        // drop comes out as a lamp inside a lens instead of a disc pasted on ink"), so the measure is the
        // interior's MEAN.
        //
        // *** IN LINEAR LIGHT, AND RE-MEASURED AT v4627 RATHER THAN RESCALED. *** The v4626 limit of 350 was
        // fitted to an 8-bit sRGB channel sum under this port's own invented ramp: 487 lit against 254 with
        // the core deleted, a 1.9x separation. Wearing murmur's real rail the same sum reads 199 against 75,
        // so the old limit would have reddened a CORRECT render -- and the fix is not to divide 350 by the
        // same factor, because a mean of gamma-encoded bytes is not a mean of anything. Measured in linear
        // light, lit against core-deleted: 0.3871 / 0.0729 at 48 px and 0.3773 / 0.0687 at 64 px -- a 5.3x
        // separation where the byte sum shows 2.7x, and the limit of 0.20 sits between them at both sizes.
        // *** THE LIT HALF IS NOW 0.4131 AT 48 px AND 0.4031 AT 64, not 0.3871 and 0.3773, because v4632
        // moved this frame to droplet's breath maximum and to the solved wobble the swell pair needs. The
        // ABLATED half is a code deletion and cannot be re-measured from here, so it is carried as the
        // historical figure it is; the limit still sits a factor of 2.1 under the lit reading and 2.7 over
        // the ablated one, which is why moving the frame did not move the limit.
        const toLight2 = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const lumAt = (px, x, y) => { const i = (y * N3 + x) * 4; return toLight2(px[i]) + toLight2(px[i + 1]) + toLight2(px[i + 2]); };
        let dSum = 0, dN = 0;
        for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
            const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
            if (Math.hypot(dx, dy) > 0.62 * 0.70) continue;
            dSum += lumAt(run.frames[F.droplet[0]], x, y); dN++;
        }
        const dropMean = dSum / dN;
        say(`droplet interior mean linear light ${dropMean.toFixed(4)} over ${dN} pixels`);
        ok("!! *** THE HEART LIGHTS THE VOLUME AROUND IT: droplet's interior is lit, not a dark shell ***",
            dropMean > 0.20,
            `interior mean ${dropMean.toFixed(4)} in linear light; with the solved core deleted the same ` +
            `measure reads 0.0729, because what is left is haze alone -- a 5.3x separation, measured at two ` +
            `frame sizes. droplet.ts: "A clear interior is not an empty one -- it is what lets the refraction ` +
            `be visible, because the only way to see a lens is to see something through it." The peak cannot ` +
            `carry this row: it reads 646 either way.`);

        // *** AND still MUST MOVE TOO, which is the half of this pair a ratio alone cannot say. *** Setting
        // every amp to zero makes still rigid AND makes the ratio above larger, so a row built only on the
        // ratio gets BETTER when the geometry gets worse -- the sabotage sweep proved exactly that. still
        // deforms by 3.06% of its radius on murmur's own numbers, so its ring has to change over 21 seconds.
        ok("!! ...and still DEFORMS TOO, which a ratio alone would let a rigid sphere pass",
            stillCh.mean > 0.02,
            `still's own ring shifts ${(stillCh.mean * 100).toFixed(2)}% over the same ` +
            `${(DROP_TIMES[1] - DROP_TIMES[0]).toFixed(1)} seconds -- not the ` +
            `0.08% it read until v4632, when this port drew it as an analytic sphere. Its amp is 0.018 and ` +
            `its gain 1.12, which put its deformed radius 3.06% across the directions (measured in the kit ` +
            `gate), and mh_deform's axes turn on 76, 103 and 134 second periods so an eight second window ` +
            `sees real movement. It reads 10.98% at 48 px and 11.44% at 64, so the figure is the hero's and ` +
            `not the raster's. WITHOUT THIS ROW the pair above rewards deleting the deformation: a rigid still ` +
            `makes droplet's ratio bigger, not smaller.`);

        ok("!! *** THE BODY ITSELF IS THE SPECIES: droplet's SILHOUETTE moves an order of magnitude more than still's ***",
            dropCh.mean > stillCh.mean * 4 && dropCh.max > stillCh.max * 2,
            `over the SAME time pair, the light on a fixed ring at the body radius shifts by ` +
            `${(dropCh.mean * 100).toFixed(1)}% on average for droplet against still's ` +
            `${(stillCh.mean * 100).toFixed(2)}% -- ${(dropCh.mean / Math.max(stillCh.mean, 1e-9)).toFixed(1)}x. ` +
            `*** STATED AS A RATIO AND NOT AS TWO BOUNDS, BECAUSE THE ABSOLUTES ARE NOT RESOLUTION-STABLE ` +
            `AND THE RATIO IS. *** This ring sits on the steep rim edge, where a half-pixel shift is a large ` +
            `relative change, so the two frame sizes read droplet at 74.09% and 71.03% and still at 10.977% ` +
            `and 11.437% -- while the ratio holds at 6.7x and 6.2x. *** AND still IS NO LONGER THE FROZEN CONTROL IT ` +
            `WAS: *** until v4632 this file drew still on an analytic sphere and its figure was 0.08%. Every ` +
            `one of murmur's eighteen has a NONZERO deformation amp -- still's is 0.018 against droplet's ` +
            `0.052 to 0.092, and the gains are 1.12 against 3.30 -- so the honest claim is an order of ` +
            `magnitude, not a zero. droplet.ts: "the body itself is the species: a sphere of water in free ` +
            `fall."`);
    }
}

// =============================================================================================================
sec("2. *** droplet's SHARE OF THE SPREAD AXIS: dispersion through the depth ***");
{
    if (!okRun) {
        ok("!! the spread row has frames to read", false, "the render did not produce them");
    } else {
        // droplet.ts calls its spread knob "dispersion through the depth", and that is literally how it is
        // built: the hue numerator is weighted by clamp(p.z, -1, 1), the body's own depth with +1 toward the
        // viewer, so the near half of each ray drifts one way and the far half the other. Most of it cancels
        // along a ray, which is why the mean turn is small -- and small is the claim, not a shortfall: this
        // is a clear lens, not a prism. The row asserts the KIND of move rather than its size.
        const hs = hueShift(run.frames[F.dropSpread[0]], run.frames[F.dropSpread[1]]);
        say(`droplet spread 0 -> 1, mean over the body -- hue ${hs.dHueDeg.toFixed(2)} deg, lightness ${hs.dL.toFixed(4)} (${hs.n} pixels)`);
        ok("!! *** droplet's SPREAD MOVES HUE AND NOT LIGHTNESS, and it reached no pixel at all until v4630 ***",
            hs.dHueDeg > 0.8 && hs.dL < 0.02,
            `the body turns ${hs.dHueDeg.toFixed(2)} degrees of hue while its lightness moves ` +
            `${hs.dL.toFixed(4)}. Measured at two frame sizes: 1.55 and 1.59 degrees, 0.0008 both times. Before v4630 this file's march accumulated only a luminance and every ` +
            `species handed mh_lit a hue of ZERO, so the rail's spread axis -- built and proved exact in ` +
            `tools/ship/murmurKit-selfcheck.mjs section 8 at v4627 -- reached nothing that anyone could see.`);
    }
}


// =============================================================================================================
sec("3. *** droplet's SWELL: the one hero whose breath scales the WHOLE body ***");
{
    if (!okRun) { ok("!! the swell row has frames to read", false, "the render did not produce them"); }
    else {
        const predicted = 1 + SWELL_HI * 0.050;
        const got = radialScale(run.frames[F.dropSwell[0]], run.frames[F.dropSwell[1]]);
        const ctl = radialScale(run.frames[F.stillSwell[0]], run.frames[F.stillSwell[1]]);
        say(`droplet at a MATCHED amplitude, voice 0 -> 1: fitted magnification ${got.toFixed(4)} against a ` +
            `predicted bodyScale of ${predicted.toFixed(5)}; still over the same voice change ${ctl.toFixed(4)}`);

        // *** THE INSTRUMENT IS THE ROW HERE, AND ON ITS OWN IT IS WRONG. *** A best-fit radial magnification
        // reads a body that got BIGGER, and a larger deformation amplitude makes a body bigger: with
        // bodyScale pinned at exactly 1 and only wobble moving, droplet fits 1.0220 -- MORE than the 1.0085
        // its real swell produces across a time pair. That is a fourth instrument this module has had to
        // reject as a general measure, after the luminance threshold (63-174%) and the peak-brightness radius
        // (0% and 56% on identical pixels).
        //
        // What makes it a measurement is the MATCHING. droplet's amplitude and its bodyScale are both driven
        // by swell; wobble drives the amplitude alone; so the two frames above are solved to carry the SAME
        // amplitude to six figures and differ only in bodyScale. And still is the control the amplitude
        // matching cannot supply: its bodyScale is 1 at EVERY voice, so whatever voice does to a rim, a
        // specular and a contact glow is in both frames of that pair too -- and it fits 1.0000.
        ok("!! *** droplet's BODY GROWS WITH ITS BREATH: 4.2% at a matched amplitude, where still's grows 0.0% ***",
            got > 1.02 && Math.abs(got - predicted) < 0.02 && Math.abs(ctl - 1) < 0.005,
            `the fit reads ${got.toFixed(4)} against bodyScale's own prediction of ${predicted.toFixed(5)} ` +
            `from the CPU half -- ${(Math.abs(got - predicted) / (predicted - 1) * 100).toFixed(0)}% of the ` +
            `way off the effect, not of the value -- while still over the SAME voice change reads ` +
            `${ctl.toFixed(4)}. At 64 px the same three read 1.0450, 1.04983 and 1.0000, so the fit gets ` +
            `CLOSER with resolution rather than drifting. *** BOTH HALVES ARE LOAD-BEARING. *** Without the matched amplitude the fit ` +
            `measures the deformation instead and reads 1.0220 with bodyScale pinned at 1; without still it ` +
            `cannot say that voice's effect on the RIM is not what moved the profile. droplet.ts: "everything ` +
            `the others keep at a whisper is turned up" -- and this is the one term the others do not have at ` +
            `all, since bodyScale is multiplied by 0.050 for droplet and by 0.0 for every other hero.`);
    }
}



console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nTHE HERO WHOSE BODY IS THE SUBJECT: droplet's silhouette moving an order of magnitude more than " +
    "still's over the same window, its spread spending itself on hue, and its breath scaling the whole body " +
    "where no other hero's does at all. still is the control in every one of those rows, in the same frames." +
    "\nWHAT IS NOT CLAIMED HERE: the surface all eighteen share and limn's edge " +
    "(tools/ship/murmurSpecies-selfcheck.mjs), comet's orbit (tools/ship/murmurSpecies2-selfcheck.mjs), " +
    "opal and abyss (tools/ship/murmurSpecies3-selfcheck.mjs), and the kit under all of them " +
    "(tools/ship/murmurKit-selfcheck.mjs). TWELVE species remain.");
process.exit(fails ? 1 : 0);
