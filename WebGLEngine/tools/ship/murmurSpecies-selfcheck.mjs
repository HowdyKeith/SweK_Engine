// WebGLEngine/tools/ship/murmurSpecies-selfcheck.mjs
//
// Run: node tools/ship/murmurSpecies-selfcheck.mjs
//
// GATE ONE OF TWO OVER THE SPECIES: THE SURFACE THEY ALL SHARE, and limn, whose whole brief is an edge.
// tools/ship/murmurSpecies2-selfcheck.mjs holds comet's orbit and droplet's body; the kit underneath both is
// tools/ship/murmurKit-selfcheck.mjs's subject.
//
// *** THE SPLIT WAS MADE BEFORE THE SPECIES THAT FORCED IT, WHICH IS THE WHOLE POINT. *** v4629 left this
// file at 2,780 ms against a 3,000 ms ceiling with FOUR of murmur's eighteen ported, and a species costs
// about 195 ms -- one WGSL compile plus one render -- so the fifth crossed it. reuseInstances was already
// spent. A gate over budget does not run at ship time AT ALL, so the round that adds the species that
// crosses the line is the round whose red nobody sees; v4535 is a long account of exactly that.
//
// THE CUT IS BY SUBJECT AND NOT BY ALPHABET. What lives here is what needs SEVERAL HEROES IN ONE FRAME SET:
// the rim ranking, the ring's evenness, the contact glow, the paper ground. What lives next door is what
// needs ONE hero at SEVERAL TIMES: comet's point going round its orbit, droplet's body wobbling. Those are
// different frame budgets -- three shaders at one time each against two shaders at four and two -- and
// keeping them apart is what stops either gate paying for the other's frames.
"use strict";
import * as K from "../../render/murmurKit.mjs";
import { N3, VOICE, PAPER_INK, sp, renderSpecies, lin, light, bil, edgeQuartile, ringNorm, hueShift }
    from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSpecies-selfcheck -- the surface the species share, and limn\n");

const times = [2.4];
// FOUR FRAMES, THREE SHADERS: still, limn and comet at one time each, plus still again on a PAPER ground --
// which reuses still's shader, because v4629 made the colour anchors settable through setKnobs precisely so
// a paper frame would cost a render and not a compile. Half of mh_surface only does anything on paper.
// The spread pair costs three RENDERS and no compiles: `spread` is an ORB_KNOBS name, so setKnobs writes it
// and all six frames of the three heroes share three shaders.
const FRAMES = [sp("still", times[0], VOICE, { spread: 0 }), sp("limn", times[0], VOICE, { spread: 0 }),
                sp("comet", times[0], VOICE, { spread: 0 }),
                sp("still", times[0], VOICE, { colors: { ink: PAPER_INK } }),
                sp("still", times[0], VOICE, { spread: 1 }), sp("limn", times[0], VOICE, { spread: 1 }),
                sp("comet", times[0], VOICE, { spread: 1 })];
const SPREAD0 = { still: 0, limn: 1, comet: 2 }, SPREAD1 = { still: 4, limn: 5, comet: 6 };
const run = await renderSpecies(FRAMES);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) ok("!! the species render ran", false, `could not render: ${run.reason || "frames " + (run.frames ? run.frames.length : "none")}`);

sec("1. *** LIMN, THE SECOND SPECIES: THE COMMA THAT MUST NEVER CLOSE INTO A RING ***");
{
    // *** THE PROFILE IS PERIODIC BY CONSTRUCTION AND THE ROW ASSERTS IT AS AN IDENTITY. *** limn.ts records
    // its own first cut failing: one gaussian in the wrapped angle "left a razor-thin dark seam down one
    // radius of the body ... at plus and minus pi the narrow side had fallen to 0.03 and the wide side was
    // still at 0.21, so the field simply steps. A GAUSSIAN IN A WRAPPED ANGLE IS NOT A PERIODIC FUNCTION."
    const atPlus = K.limnArc(K.wrapPi(Math.PI)), atMinus = K.limnArc(K.wrapPi(-Math.PI));
    ok("!! *** THE ARC IS EXACTLY EQUAL AT +pi AND -pi -- no seam, because it is a function of cos alone ***",
        atPlus === atMinus,
        `arc(+pi) = arc(-pi) = ${atPlus.toFixed(9)}, bit-identical. A gaussian in the angle is 0.03 against ` +
        `0.21 across the same wrap, which is the seam murmur shipped once and replaced.`);

    // The far side must stay a dim glow. murmur states the numbers; they are checked against its constants.
    const truePeak = (o) => { let m = 0; for (let i = 0; i <= 36000; i++) m = Math.max(m, K.limnArc(K.wrapPi(i * Math.PI / 18000), o)); return m; };
    const wide = { kHead: 9.0, kTail: 1.6, offT: -1.05 };
    const small = { kHead: 2.2, kTail: 0.95, offT: -1.25 };
    const r120 = K.limnArc(Math.PI, wide) / truePeak(wide);
    const r18 = K.limnArc(Math.PI, small) / truePeak(small);
    say(`far side as a share of peak: ${(r120 * 100).toFixed(1)}% at the 120 pt concentrations, ${(r18 * 100).toFixed(1)}% at 18 pt`);
    ok("!! *** IT IS A COMMA AND NOT A RING: the far side is 3.8% of the peak, which is limn.ts's own 'four per cent' ***",
        r120 > 0.03 && r120 < 0.045,
        `${(r120 * 100).toFixed(1)}% against the "four per cent" its header quotes. The concentrations were ` +
        `"chosen by looking at where it started to become one", so this is the number the species IS.`);
    // *** AND THE 18 pt FIGURE DOES NOT REPRODUCE, WHICH IS REPORTED RATHER THAN ROUNDED INTO AGREEMENT. ***
    ok("...while the 18 pt figure reads 12.5% against the 'eleven' its header names, and the gap is NAMED",
        r18 > 0.11 && r18 < 0.135,
        `${(r18 * 100).toFixed(1)}% from murmur's own constants at voice 0 and drive 0, against the 11 its ` +
        `header states -- a 1.5 point gap. The most likely explanation is that mh_small does not reach 1.0 at ` +
        `18 pt, so the real concentrations never hit the extremes used here; mh_small is NOT ported, so that ` +
        `is a hypothesis and is written as one. What is not done is quietly widening this row until 11 fits.`);

    // *** wrapPi WAS UNCHECKED AND THE SABOTAGE SWEEP FOUND IT. *** Every row above evaluates it only at
    // +/-pi, where a version that rounds DOWN instead of to NEAREST happens to agree -- both map to pi -- so
    // replacing floor(x + 0.5) with floor(x) left the whole section green. The contract is that any angle,
    // from any number of turns away, lands in (-pi, pi]; that is what the shader relies on when the arc has
    // been travelling for minutes and phi0 is in the hundreds of radians.
    let outOfRange = 0, worstErr = 0;
    for (let i = -4000; i <= 4000; i++) {
        const a = i * 0.0197;                       // sweeps about +/-25 turns
        const w = K.wrapPi(a);
        if (!(w > -Math.PI - 1e-12 && w <= Math.PI + 1e-12)) outOfRange++;
        // and it must differ from the input by a whole number of turns, exactly
        const turns = (a - w) / (2 * Math.PI);
        worstErr = Math.max(worstErr, Math.abs(turns - Math.round(turns)));
    }
    ok("!! *** wrapPi LANDS IN (-pi, pi] FROM ANY NUMBER OF TURNS AWAY, and moves by a whole turn exactly ***",
        outOfRange === 0 && worstErr < 1e-9,
        `8,001 angles spanning about +/-25 turns: ${outOfRange} outside the range, worst deviation from a ` +
        `whole number of turns ${worstErr.toExponential(2)}. A version rounding down instead of to nearest ` +
        `agrees at exactly +/-pi, which is where every other row in this section happened to look.`);

    // The tail share drives the hue and must be periodic for the same reason the arc is.
    ok("the tail's share of the light is periodic too, so the hue has no seam either",
        K.limnTailShare(K.wrapPi(Math.PI)) === K.limnTailShare(K.wrapPi(-Math.PI)),
        `limn.ts chose it over the wrapped angle for exactly this: "unlike the wrapped angle the first cut ` +
        `used, PERIODIC -- so the hue has no seam either"`);

    // *** THE SPECIES, RENDERED -- AND THE v4624 VERSION OF THIS ROW WAS PASSING ON LUCK. *** It sampled two
    // pixels, (9,24) and (38,24) on a 48-wide frame, called them the left and right rim, and asserted still's
    // differed by under 2% while limn's differed by more than 25%. Those two points are 15 and 14 pixels from
    // the centre -- NOT a symmetric pair -- and they happened to read 448 and 449 on still. Sampled at
    // genuinely symmetric points, still reads 172 against 251: a 31% difference, because the key light is at a
    // fixed direction and the specular is nowhere near even. THE CLAIM WAS TRUE OF TWO PIXELS AND FALSE OF THE
    // RIM, which is the same species of error as v4535's HUD row that passed for as long as something happened
    // to sit on one of its grid points.
    //
    // What replaces it measures the RING, all the way round, 72 samples inside the antialiased edge: the
    // fraction of the ring standing at or above half its own peak. For a comma that is small; for a body lit
    // evenly enough to read as a sphere it is everything.
    //
    // *** AND THAT MEASURE WAS ITSELF REBUILT AT v4627, BECAUSE THE COLOUR RAIL EXPOSED TWO FLAWS IN IT. ***
    // The v4626 version read the ring by rounding each sample to the nearest pixel and summing the three
    // 8-BIT sRGB channels. Both parts are wrong, and neither showed while the species wore this port's own
    // gentle invented ramp:
    //
    //   * "at or above HALF its peak" is a statement about LIGHT, and an sRGB byte is not light -- it is that
    //     light through a ~2.2 gamma. Half the encoded value is about a fifth of the brightness. Once the
    //     species wore murmur's real rail, whose bottom segment runs from near-black ink to a deep blue, the
    //     encoding error stopped being a constant and started deciding the answer.
    //   * rounding to the nearest pixel makes the ring land on whichever pixels a 13-px radius happens to
    //     snap to, which is exactly the "whichever sample happens to land deepest in the dark" artifact the
    //     row below already had to write a caveat about.
    //
    // MEASURED, on identical pixels: the old instrument read still at 58% at 48 px and 100% at 64 px -- a
    // 42-point swing on a frame-size change, on a row whose own comment says a limit fitted to one frame size
    // is a limit fitted to a frame size. Sampling bilinearly in linear light, the same two resolutions read
    // 100% / 17% / 100% and 100% / 18% / 100%, and peak-over-minimum 1.35 / 193.97 / 1.74 against
    // 1.34 / 197.77 / 1.66. Every figure now agrees between the two to within a point, and limn's separation
    // got an order of magnitude sharper rather than being widened to fit.

    if (!okRun) {
        ok("!! the three species render", false, `could not render: ${run.reason || "frames " + (run.frames ? run.frames.length : "none")}`);
    } else {
        // One 8-bit sRGB channel back to the light it encodes. The same curve render/murmurKit.mjs exports
        // and the probe's own encode inverts -- not a 2.2 power, which is off by up to 4% near black and
        // therefore wrong in precisely the part of the rail the dark side of limn's ring lives in.
        const toLight = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        // Bilinear rather than nearest: a 72-sample ring at a 13-px radius snaps onto far fewer than 72
        // distinct pixels, so nearest sampling measures the grid as much as the species.
        const sampleAt = (px, x, y) => {
            const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
            let v = 0, aw = 0;
            for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)],
                                       [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
                const xx = Math.min(N3 - 1, Math.max(0, x0 + dx)), yy = Math.min(N3 - 1, Math.max(0, y0 + dy));
                const i = (yy * N3 + xx) * 4;
                v += w * (toLight(px[i]) + toLight(px[i + 1]) + toLight(px[i + 2]));
                aw += w * (px[i + 3] / 255);
            }
            return { v, a: aw };
        };
        const ring = (px) => {
            const vals = [];
            for (let a = 0; a < 72; a++) {
                const th = a * 2 * Math.PI / 72, rr = 0.62 * 0.88 * (N3 / 2);
                // -0.5 puts the sample on the pixel-centre grid the bilinear weights are written against
                const s = sampleAt(px, N3 / 2 + rr * Math.cos(th) - 0.5, N3 / 2 + rr * Math.sin(th) - 0.5);
                if (s.a < 0.8) continue;                             // stay inside the antialiased silhouette
                vals.push(s.v);
            }
            const mx = Math.max(...vals), mn = Math.min(...vals);
            return { lit: vals.filter((v) => v >= mx * 0.5).length / vals.length, peakOverMin: mx / Math.max(mn, 1e-9), n: vals.length };
        };
        const rs = ring(run.frames[0]), rl = ring(run.frames[1]), rc = ring(run.frames[2]);
        say(`ring lit at or above half its peak -- still ${(rs.lit * 100).toFixed(0)}%, limn ${(rl.lit * 100).toFixed(0)}%, comet ${(rc.lit * 100).toFixed(0)}% (${rs.n} samples each)`);
        ok("!! *** NEVER A FULL EVEN RING: limn lights under a third of its rim where the other two light all of theirs ***",
            rl.lit < 0.45 && rs.lit > 0.75 && rc.lit > 0.75,
            `still ${(rs.lit * 100).toFixed(0)}% of the ring at or above half peak, comet ${(rc.lit * 100).toFixed(0)}%, ` +
            `limn ${(rl.lit * 100).toFixed(0)}%. Peak over minimum: still ${rs.peakOverMin.toFixed(2)}, comet ` +
            `${rc.peakOverMin.toFixed(2)}, limn ${rl.peakOverMin.toFixed(2)}. *** THE THRESHOLDS ARE SET FROM ` +
            `TWO RESOLUTIONS, NOT ONE: *** in linear light this ring reads 100% / 17% / 100% at 48 px and ` +
            `100% / 18% / 100% at 64 px -- within a point either way, where the 8-bit nearest-pixel version ` +
            `this replaced swung still from 58% to 100% across the same two sizes. A limit fitted to one ` +
            `frame size is a limit fitted to a frame size. That concentration IS the species -- ` +
            `"a bright head with a soft tail streaming off one side, built so the far side of the ring never ` +
            `rises past a dim glow" -- and it is measured over the whole ring rather than at a chosen pair of points.`);
        // Still stated as a RELATION rather than three absolute bounds -- but the factor is now 10 and not
        // 1.4, because the bilinear/linear instrument measures a real separation instead of a sampling
        // artifact. The old 1.4 was set when still's own figure read 1.75 at 64 px and 2.55 at 48 px on
        // IDENTICAL pixels; those two now read 1.34 and 1.35, and limn's lead over the larger of the other
        // two is 111x at 48 px and 119x at 64 px. A limit an order of magnitude under the measurement is a
        // limit; one a third under it is a restatement.
        ok("...and limn is the DARK hero: its ring swings far harder than either of the others'",
            rl.peakOverMin > Math.max(rs.peakOverMin, rc.peakOverMin) * 10.0,
            `limn ${rl.peakOverMin.toFixed(2)} against still ${rs.peakOverMin.toFixed(2)} and comet ` +
            `${rc.peakOverMin.toFixed(2)} -- ${(rl.peakOverMin / Math.max(rs.peakOverMin, rc.peakOverMin)).toFixed(0)}x ` +
            `the larger of the two, against a limit of 10. murmur's own fitted base rim is 0.30 for limn ` +
            `against still's 1.15 -- and this sentence used to end "still's file calls its rim the highest in ` +
            `the collection", which is WRONG and was repeated here from still.ts without checking. abyss ` +
            `carries 1.70. still holds the highest SPECULAR (1.30), not the highest rim; still.ts bundles the ` +
            `two in one sentence and is half right. tools/ship/murmurKit-selfcheck.mjs section 9 asserts both ` +
            `halves over all eighteen call sites rather than quoting either file.`);
    }
}

// =============================================================================================================
sec("2. *** THE SURFACE, ON REAL PIXELS: the contact glow, the roster's rims, and the paper ground ***");
{
    if (!okRun) {
        ok("!! the surface rows have frames to read", false, "the render did not produce them");
    } else {
        // *** THE CONTACT GLOW AGAINST THE INK FLOOR, AND ALPHA-NORMALISED -- A FIRST CUT OF THIS ROW WAS
        // MEASURING NEITHER. *** Two things confound a raw ring sample outside the body. The frames are
        // alpha-composited and the containment fades the alpha from 255 to 0 across exactly this band, so a
        // raw reading falls off because the MASK falls off, not because the glow does. And where the glow is
        // gone the rail does not read zero: at zero energy mh_lit returns the palette's own s0, which IS the
        // ink, about 0.0094 in linear light -- so a row comparing "just outside" against "far outside" is
        // comparing the ink floor with itself. Dropping the glow from the composition entirely left the first
        // version of this row GREEN, and the sabotage sweep is what said so.
        //
        // Both are handled: divide by the alpha actually read back, and compare the near band against the
        // FLOOR that band sits on, which is what the far ring measures once normalised. Baseline 0.01228
        // against 0.00950; with the glow dropped both read 0.00942 and the ratio is 0.99.
        const gNear = ringNorm(run.frames[0], 0.68), gFloor = ringNorm(run.frames[0], 0.90);
        say(`outside the silhouette, alpha-normalised -- still at 0.68 of the quad ${gNear.toFixed(5)}, at 0.90 (the ink floor) ${gFloor.toFixed(5)}`);
        ok("!! *** THE CONTACT GLOW REACHES REAL PIXELS OUTSIDE THE SILHOUETTE, above the ink floor it sits on ***",
            gNear > gFloor * 1.15,
            `${gNear.toFixed(5)} in linear light just outside the body against a floor of ${gFloor.toFixed(5)} ` +
            `further out -- ${((gNear / gFloor - 1) * 100).toFixed(0)}% above it, where dropping the glow ` +
            `from the composition reads 0.99 of the floor. *** AND THE GLOW REACHED NOTHING AT ALL UNTIL THE ` +
            `ALPHA CHANGED IN THE SAME ROUND: *** this port clipped its alpha at the BODY radius, and the ` +
            `glow is nonzero only OUTSIDE the silhouette, so the whole term was multiplied by zero. This ring ` +
            `read a flat 0.00000 and is what found it. All eighteen of murmur's heroes pass a glowK, and ` +
            `kit.ts's reason is that its job "is to stop the silhouette meeting the ink as a cut line".`);

        // *** THE HEROES' RIMS ARE NOT INTERCHANGEABLE, and the roster says in what order: still 1.15,
        // comet 0.80, limn 0.30 at rest. *** Read at the 25th PERCENTILE of the edge ring and not its mean,
        // and that is not a smoothing choice: limn's arc IS at the rim, so its ring maximum is 1.42 against
        // still's 0.28 and any average puts limn top. A first cut of this row did exactly that and ranked
        // limn brightest, which is true of limn's head and false of limn's rim. The quarter-point sits in the
        // dim part of every one of the three, which is where the rim is all there is.
        const qStill = edgeQuartile(run.frames[0]), qLimn = edgeQuartile(run.frames[1]), qComet = edgeQuartile(run.frames[2]);
        say(`edge light at the ring's quarter-point -- still ${qStill.toFixed(5)}, comet ${qComet.toFixed(5)}, limn ${qLimn.toFixed(5)}`);
        ok("!! the three heroes' EDGES rank the way murmur's roster ranks their rims: still > comet > limn",
            qStill > qComet && qComet > qLimn && qStill / qLimn > 2.5,
            `still ${qStill.toFixed(5)} > comet ${qComet.toFixed(5)} > limn ${qLimn.toFixed(5)} in linear ` +
            `light, a still-over-limn ratio of ${(qStill / qLimn).toFixed(2)} against the roster's own ` +
            `1.15 / 0.30 = 3.83. Measured at 48 px and 64 px before the limits were set: the ordering holds ` +
            `and the ratio reads 3.73 and 3.77. Until v4629 this file gave every species but limn and comet ` +
            `the same INVENTED 0.85 rim, and handing all three one hero's knobs -- the sabotage that found ` +
            `this gap -- left every other row in this gate green.`);

        // *** THE PAPER GROUND, WHERE HALF OF mh_surface LIVES AND WHERE THE COMPOSITION CAN GO WRONG
        // INVISIBLY. *** On ink dark is exactly 1, so putting the rim under the (* dark) factor is
        // ALGEBRAICALLY IDENTICAL to leaving it out -- the arrangement murmur's mh_present settles cannot be
        // told from the wrong one by any ink-ground measurement whatsoever. On paper dark is near zero and
        // the wrong arrangement deletes the edge.
        const paperFrame = run.frames[3];
        const pEdge = edgeQuartile(paperFrame), pCentre = light(paperFrame, N3 >> 1, N3 >> 1);
        say(`paper ground -- edge ${pEdge.toFixed(4)}, centre ${pCentre.toFixed(4)}, ratio ${(pEdge / pCentre).toFixed(4)}`);
        ok("!! *** ON PAPER THE RIM DARKENS THE EDGE, which is what says it is composed into body and not under (* dark) ***",
            pEdge > 0 && pEdge / pCentre < 0.95,
            `the edge reads ${pEdge.toFixed(4)} against a centre of ${pCentre.toFixed(4)}, a ratio of ` +
            `${(pEdge / pCentre).toFixed(4)} -- DARKER than the page, which is the direction that matters. On ` +
            `a light ground energy does not become light: it becomes chroma and shadow, "which is what a ` +
            `tinted transparent object actually does to the light behind it", so more rim means a deeper ` +
            `edge. murmur's mh_present composes railE = body + (spec + contact) * dark with the RIM inside ` +
            `body; this file had it under the dark factor until v4629. *** THAT ERROR IS ALGEBRAICALLY ` +
            `INVISIBLE ON INK *** -- dark is exactly 1 there, so (rim * dark) IS rim and no ink-ground ` +
            `measurement whatsoever can tell the two arrangements apart, which is why this frame exists. On ` +
            `paper it moves this ratio from ${(pEdge / pCentre).toFixed(4)} to 1.0287: the edge stops being ` +
            `darker than the page at all. A first cut asked only that the ratio differ from 1 by 2%, and 1.0287 ` +
            `does -- so the sabotage passed it. The DIRECTION is the claim, not the difference.`);
    }
}


// =============================================================================================================
sec("3. *** THE SPREAD AXIS, END TO END: the knob that reached no pixel until v4630 ***");
{
    if (!okRun) {
        ok("!! the spread rows have frames to read", false, "the render did not produce them");
    } else {
        // *** THE COLOUR RAIL'S HUE AXIS WAS BUILT AND GATED AT v4627 AND REACHED NOTHING. *** murmur's
        // species each accumulate a hue NUMERATOR beside their luminance and hand mh_lit the ratio;
        // render/murmurKit.mjs's marchStillInterior has returned it as `hueNum` since v4623, and the shader
        // accumulated only the scalar, so every species passed 0. Section 8 of the kit gate proved the
        // rotation is exact and no pixel in the tree was using it.
        //
        // *** AND THE ROW ASKS WHAT KIND OF MOVE IT IS, NOT WHETHER THE PICTURE CHANGED. *** kit.ts: the
        // rotation "moves the hue while holding lightness and chroma exactly. The unsafe one is trading
        // chroma for hue, which is how a warm palette turns to mud, and this cannot do it." A row that only
        // asked whether spread 0 and spread 1 differ would pass on exactly that failure.
        const hs = {};
        for (const k of ["still", "limn", "comet"]) hs[k] = hueShift(run.frames[SPREAD0[k]], run.frames[SPREAD1[k]]);
        say(`spread 0 -> 1, mean over the body -- ` + ["still", "limn", "comet"]
            .map((k) => `${k} hue ${hs[k].dHueDeg.toFixed(2)} deg / L ${hs[k].dL.toFixed(4)}`).join(", "));
        ok("!! *** THE SPREAD KNOB MOVES HUE AND NOT LIGHTNESS, on every hero that carries one ***",
            ["still", "limn", "comet"].every((k) => hs[k].dHueDeg > 1.0 && hs[k].dL < 0.02),
            ["still", "limn", "comet"].map((k) => `${k} turns ${hs[k].dHueDeg.toFixed(2)} degrees while its ` +
            `lightness moves ${hs[k].dL.toFixed(4)}`).join("; ") + `. Pixels below 0.01 chroma are skipped ` +
            `because HUE IS UNDEFINED THERE and averaging an arbitrary angle in is averaging in noise. ` +
            `Measured at 48 px and 64 px before the limits were set: the hue figures agree to a tenth of a ` +
            `degree and the lightness figures to 1e-4.`);

        // *** AND comet CARRIES A 1.4 GAIN THAT NO LOOSE BOUND CAN SEE. *** The first cut of the row above
        // only asked that every hero turn by more than a degree, and deleting comet's gain leaves it turning
        // 2.79 -- still over the bar, so the sabotage passed. comet.ts gives its trail that gain on purpose,
        // and it is the difference between a trail that reads as cooling and one that reads as tinted.
        // Measured at two frame sizes with the gain and without: 3.713 / 3.694 against 2.787 / 2.743, so the
        // limit sits between them with about 15% either side and the instrument is stable to 0.02 degrees.
        ok("!! ...and comet's trail carries a 1.4 gain on its hue, which a bound of 'more than a degree' cannot see",
            hs.comet.dHueDeg > 3.2 && hs.comet.dHueDeg > hs.still.dHueDeg * 2.3,
            `comet turns ${hs.comet.dHueDeg.toFixed(3)} degrees, ` +
            `${(hs.comet.dHueDeg / hs.still.dHueDeg).toFixed(2)}x still's ${hs.still.dHueDeg.toFixed(3)} -- ` +
            `against 2.787 and 1.99x with the gain deleted. Both halves are asserted because either alone is ` +
            `a bound a nearby wrong answer fits inside.`);

        // *** limn's OWN HUE TERM SATURATES, AND THAT MAKES ITS MOVE A NUMBER RATHER THAN A DIRECTION. ***
        // Its hue is -tailShare * spread * MH_SPREAD, and tailShare -- the tail lobe's share of the light --
        // reaches essentially 1 out along the tail. So at spread 1 limn's tail turns by MH_SPREAD itself,
        // which is 0.50 rad = 28.65 degrees, and the measured mean over the body lands just under it.
        ok("!! ...and limn, whose tail share saturates, turns by very nearly MH_SPREAD itself",
            Math.abs(hs.limn.dHueDeg - 28.65) < 2.0 && hs.limn.dHueDeg > hs.still.dHueDeg * 10,
            `limn ${hs.limn.dHueDeg.toFixed(2)} degrees against MH_SPREAD's ${(K.MH_SPREAD * 180 / Math.PI).toFixed(2)} ` +
            `-- and ${(hs.limn.dHueDeg / hs.still.dHueDeg).toFixed(0)}x still's ${hs.still.dHueDeg.toFixed(2)}, ` +
            `which is the difference between a hero whose hue term is a SHARE that saturates and one whose is ` +
            `a depth-weighted average over a ray that mostly cancels. The four heroes do not share one ` +
            `formula: still and droplet weight by depth, comet by the trail's AGE and with a 1.4 gain and a ` +
            `sign flip, limn takes nothing from the march at all.`);
    }
}


console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nTHE SURFACE ALL EIGHTEEN SPECIES SHARE, on real pixels: the contact glow outside the silhouette, the " +
    "roster's own rim ranking, the paper ground where half of mh_surface lives and where a composition error " +
    "is invisible on ink -- plus limn, the hero whose entire brief is that edge. " +
    "\nWHAT IS NOT CLAIMED HERE: comet's orbit and droplet's body, which are " +
    "tools/ship/murmurSpecies2-selfcheck.mjs's subject and need one hero at several times rather than " +
    "several heroes at one; and the kit all of them stand on, which is tools/ship/murmurKit-selfcheck.mjs's.");
process.exit(fails ? 1 : 0);
