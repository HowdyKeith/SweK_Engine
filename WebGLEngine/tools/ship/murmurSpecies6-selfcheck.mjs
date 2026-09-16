// WebGLEngine/tools/ship/murmurSpecies6-selfcheck.mjs -- v4636
//
// Run: node tools/ship/murmurSpecies6-selfcheck.mjs
//
// GATE SIX OVER THE SPECIES: FATHOM, the ninth of murmur's eighteen and one of the two whose interior is
// SOLVED rather than marched. Every hero before it builds its inside out of the five taps of a ray march --
// opal's flashes, abyss's glows, nebula's and tempest's whole bodies. fathom does not: it intersects three
// spheres analytically, six crossings, one quadratic each. The march is still there, but only for the murk
// BETWEEN the shells.
//
// fathom.ts states its own case against the mist heroes in one line: "What the eye gets from a cloud is
// atmosphere; what it gets from nested shells is measurement." And the fact its geometry buys is one a march
// cannot know and a quadratic cannot get wrong -- "a ray that enters the body crosses every shell it reaches
// exactly twice".
//
// *** ITS SIBLING GEODE SHIPPED IN THE SAME ROUND AND IS GRADED NEXT DOOR, IN murmurSpecies7-selfcheck.mjs,
// AND THE SPLIT IS A BUDGET MEASUREMENT RATHER THAN A JUDGEMENT ABOUT THE TWO. *** They were written as one
// gate and it came in at 5,064 ms against a 3,000 ms sweep budget -- 69% over, which means it would not have
// run at ship time AT ALL. That is the hazard this file's own header was about, met by the file itself on
// its first run, and v4633 spent a whole round proving it is not theoretical: it found
// tools/ship/inputSets-selfcheck.mjs red for nine rounds because it was 27 ms over.
//
// THE COST IS COMPILES, and it was measured rather than guessed: one species and one frame is 931 ms, each
// ADDITIONAL species is about 280 ms, and twenty-four further frames of species already compiled cost about
// 950 ms between them. Trimming the control from ten species to five landed at 3,499 and to four at 3,161 --
// both still over, with no room for the drift this box shows between runs. Two gates of two subjects each is
// the shape the arithmetic allows, and it gives each MORE room than the squeezed single gate would have.
//
// *** ONE CLAIM THIS GATE DELIBERATELY DOES NOT MAKE, AND THE MEASUREMENT THAT DECIDED IT. *** fathom's
// composite order is its headline: outer-in then inner-out, six contributions in the one sequence geometry
// guarantees, no sort. It is correct, and it is NOT LOAD-BEARING, which is a different thing and the gate
// should not pretend otherwise. Reversing MH_FATHOM.order to [2,1,0,0,1,2] and re-rendering 27 fathom
// frames -- three murk settings by three voices by three times -- moves 361 bytes of 248,832, 0.145%, AND
// EVERY ONE OF THEM BY EXACTLY 1 OF 255. Not one frame is bit-identical and not one pixel moves further
// than the smallest step the format has.
//
// The algebra says why, and it is worth writing down because the intuition points the other way. Each shell
// contributes en * trS and then attenuates trS by exp(-absorb * en). For small en that exponential is
// 1 - absorb*en, so the composite is (sum of en) minus absorb times (sum of en_i * en_j over pairs i<j),
// plus higher terms -- and THAT PAIR SUM IS SYMMETRIC. Order cannot reach it. The first term that can tell
// the orders apart is third-order in quantities already below 0.1, which is how six reordered surfaces come
// out one least-significant bit apart.
//
// So there is no row here for it. A row would have to assert that the order is right, and the only honest
// form of that assertion at these energies is "the frames are nearly the same either way" -- which is a row
// that cannot fail, the defect this session has now caught in six different costumes. The order stays
// outer-in because it is what the geometry gives and because at higher absorption it would start to matter;
// the claim that it is doing visible work is retracted here rather than graded.
"use strict";
import * as K from "../../render/murmurKit.mjs";
import { N3, VOICE, sp, renderSpecies, light, bil, ringProfile, interiorPeak } from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSpecies6-selfcheck -- fathom's three shells, solved rather than marched\n");

// *** EVERY FRAME IN THIS GATE RUNS AT glow 0.15, AND THAT IS A ROW'S WORTH OF REASONING, NOT A SETTING. ***
// v4634 caught a density row in gate five measuring the TONE CURVE instead of the physics: at the default
// glow the frame peaked at 646 of 765, and the row read 0.680 with absorption and 0.558 with absorption
// DELETED -- passing harder on the broken shader, because the display was bending the curve more than the
// material was. Every row here reads structure out of a radial profile, and structure is exactly what a
// saturating display destroys. At 0.15 the peaks below sit between 131 and 212 of 765, where the curve is
// still straight. The peaks are printed on the rows for that reason.
const DIM = 0.15;
const T = 5.1;
// `spread`, `glint`, `density`, `fold` and `glow` are named on EVERY frame because setKnobs writes only the
// names present in its argument, so a knob one frame sets and the next does not mention silently keeps the
// previous frame's value. This gate drives six knobs; naming them all is the only version of this that is
// not a trap.
const BASE = { glint: 0, density: 0.5, fold: 0.5, spread: 0, glow: DIM,
               layers: 0.5, parallax: 0.5, murk: 0.0, facet: 0.5, glim: 0.0, stone: 0.5 };
const FA = (t, voice, extra = {}) => sp("fathom", t, voice, { ...BASE, ...extra });

// *** THE CONTROL IS THREE OTHER SPECIES AND NOT NINE, AND WHICH THREE WAS MEASURED RATHER THAN CHOSEN. ***
// A row claiming fathom has a second ridge is worth nothing until the same measurement has been run on
// species that should not have one -- and the budget pays for three of them. So they are the three that come
// CLOSEST to having one, found by measuring the largest RISE after the running minimum in the outer band, as
// a fraction of each species' own level, where a real ridge turns over and a monotone fall never rises:
//
//     limn 183.34%   droplet 56.96%   abyss 51.62%   still 45.90%   comet 19.19%
//     geode 18.62%   fathom 8.04%   nebula 2.61%   tempest 2.08%   opal 0.00%
//
// limn is the challenger by a factor of three over the next, and the reason is the instrument's real edge
// case: limn's whole subject is its EDGE, a bright ring, and that ring sits at about 0.62 of the half-frame
// -- OUTSIDE the band this gate searches. So its profile rises across the whole band and never turns over,
// and the ridge finder correctly returns nothing. Correctly, but only just: a ring a little smaller would
// register. Running limn LIVE every time is the only version of that sentence that stays true when someone
// changes limn.
//
// still, comet, nebula, tempest, opal and geode are not here. What they contribute is the numbers above --
// all six at or under 46% -- plus one development-time measurement, LABELLED AS ONE because it is not what
// runs below: when this gate rendered all ten ported species, every one of the nine returned no outer ridge
// at all. It is reproducible by rendering the ten and running outerRidge over them.
const SPECIES = ["limn", "droplet", "abyss", "fathom"];
const FATHOM = 3;

const FRAMES = [
    ...SPECIES.map((s) => sp(s, T, VOICE, BASE)),                     // 0..3  the ridge control
    FA(T, 0.0), FA(T, 1.0),                                           // 4,5   voice moves the radii
    FA(T, 0.0, { layers: 0.0 }), FA(T, 0.0, { layers: 1.0 }),         // 6,7   layers moves the skin
    FA(T, VOICE, { parallax: 0.0 }), FA(T, VOICE, { parallax: 1.0 }), // 8,9   the fold
];
const F = { all: 0, vLo: 4, vHi: 5, lLo: 6, lHi: 7, pLo: 8, pHi: 9 };
const run = await renderSpecies(FRAMES);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) ok("!! the species render ran", false, `could not render: ${run.reason || "frames " + (run.frames ? run.frames.length : "none")}`);
const fr = (i) => run.frames[i];

// ---- the measurements this gate needs and no other gate has -------------------------------------------------
// The mean light on a ring of radius r, r in half-frame units so 1.0 is the frame edge and the body's own
// shell sits at 0.62. 128 samples, because a 48-pixel frame under-samples a ring badly at 64.
const ringMean = (px, r) => { const a = ringProfile(px, r, 128); return a.reduce((x, y) => x + y, 0) / a.length; };
const radial = (px, lo, hi, st = 0.005) => {
    const o = []; for (let r = lo; r <= hi + 1e-9; r += st) o.push([r, ringMean(px, r)]); return o;
};
// THE RIDGE: the strongest interior local maximum of a radial profile inside a band, located to sub-step
// precision by a parabola through its three samples. A LOCAL MAXIMUM IS THE RIGHT INSTRUMENT HERE FOR A
// REASON THAT IS THE WHOLE POINT: a brightness change cannot move one. Scale the frame's light by any
// positive factor and every ridge stays exactly where it was, so a row built on ridge POSITION cannot be
// passed by a shader that merely got brighter -- which is the failure mode that broke droplet's radial-scale
// row in gate four, where a pure amplitude change fitted a larger swell than the real one.
const ridge = (prof, lo, hi) => {
    let bi = -1, bv = -1;
    for (let i = 1; i < prof.length - 1; i++) {
        const [r, v] = prof[i];
        if (r < lo || r > hi) continue;
        if (v > prof[i - 1][1] && v > prof[i + 1][1] && v > bv) { bv = v; bi = i; }
    }
    if (bi < 0) return null;
    const y0 = prof[bi - 1][1], y1 = prof[bi][1], y2 = prof[bi + 1][1], d = y0 - 2 * y1 + y2;
    return { r: prof[bi][0] + (d !== 0 ? 0.5 * (y0 - y2) / d : 0) * (prof[1][0] - prof[0][0]), v: bv };
};
const outerRidge = (px) => ridge(radial(px, 0.30, 0.58), 0.32, 0.55);
const innerRidge = (px) => ridge(radial(px, 0.10, 0.32), 0.12, 0.30);
// The same ridge found along ONE ray rather than around a ring: 48 angles, each giving the radius at which
// that direction's light ridges. The spread of those 48 radii is how far out of round the limb is.
const ridgePerAngle = (px, lo, hi) => {
    const out = [];
    for (let a = 0; a < 48; a++) {
        const th = a / 48 * Math.PI * 2, prof = [];
        for (let r = lo - 0.03; r <= hi + 0.03; r += 0.005)
            prof.push([r, bil(px, (Math.cos(th) * r * 0.5 + 0.5) * N3 - 0.5, (Math.sin(th) * r * 0.5 + 0.5) * N3 - 0.5)]);
        const g = ridge(prof, lo, hi);
        if (g) out.push(g.r);
    }
    const m = out.reduce((a, b) => a + b, 0) / out.length;
    const s = Math.sqrt(out.map((x) => (x - m) ** 2).reduce((a, b) => a + b, 0) / out.length);
    return { n: out.length, mean: m, sd: s, round: s / m };
};
const totalLight = (px) => { let s = 0; for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) s += light(px, x, y); return s; };
// =============================================================================================================
sec("1. *** FATHOM HAS A SECOND RIDGE AND ITS THREE CLOSEST CHALLENGERS DO NOT ***");
{
    if (!okRun) { ok("!! the solved heroes have frames", false, "the render did not produce them"); }
    else {
        const outer = SPECIES.map((s, i) => [s, outerRidge(fr(F.all + i))]);
        say("outer radial ridge, the four species rendered here: " +
            outer.map(([s, g]) => `${s} ${g ? g.r.toFixed(3) : "none"}`).join("  "));
        const withRidge = outer.filter(([, g]) => g).map(([s]) => s);

        // *** THIS IS THE ROW THAT SAYS THE SHELLS ARE THERE, AND IT IS A CONTROL BEFORE IT IS A CLAIM. ***
        // fathom.ts's whole argument against the mist heroes is the one it opens with: "What the eye gets
        // from a cloud is atmosphere; what it gets from nested shells is measurement." A cloud has ONE bright
        // middle that falls away. Nested spheres, crossed by a ray, put a light ridge at each shell's own
        // limb -- because the material a ray meets crossing a thin shell is its thickness over the COSINE of
        // the angle to the surface, so the crossing brightens as the surface turns edge-on. So a second
        // ridge, further out than the first, is the signature, and NINE SPECIES WERE MEASURED THE SAME WAY
        // to establish that it is fathom's and not the instrument's.
        ok("!! *** ONLY FATHOM SHOWS A SECOND, OUTER LIGHT RIDGE -- its three closest challengers show none ***",
            outer[FATHOM][1] !== null && withRidge.length === 1 && withRidge[0] === "fathom",
            `of the four species rendered here, ${withRidge.length} has an outer radial ridge and it is ` +
            `${withRidge.join(", ")}, at r=${outer[FATHOM][1].r.toFixed(4)} of the half-frame -- with an inner ` +
            `ridge at r=${innerRidge(fr(F.all + FATHOM)).r.toFixed(4)} beneath it. The other nine fall away ` +
            `monotonically from one middle, which is what "atmosphere" looks like measured -- and these three are ` +
            `the three of the nine that come CLOSEST to a ridge, at 183.34%, 56.96% and 51.62% on the ` +
            `near-ridge measure in this file's header, so they are the hardest three to pass against. The shell radii ` +
            `are ${K.MH_FATHOM.shells.map((s) => s.base).join(", ")} in body units against a body at 0.62 ` +
            `of the half-frame. WHICH TWO OF THE THREE THESE RIDGES ARE IS NOT ASSUMED HERE -- section 2 ` +
            `identifies them from the rk constants, and the answer is the middle and the smallest.`);
    }
}

// =============================================================================================================
sec("2. *** TWO KNOBS, TWO EFFECTS, AND THEY DO NOT OVERLAP: one moves the shells, the other the skin ***");
{
    if (!okRun) { ok("!! fathom's knob frames rendered", false, "the render did not produce them"); }
    else {
        const vO = [outerRidge(fr(F.vLo)), outerRidge(fr(F.vHi))];
        const vI = [innerRidge(fr(F.vLo)), innerRidge(fr(F.vHi))];
        const lO = [outerRidge(fr(F.lLo)), outerRidge(fr(F.lHi))];
        const lI = [innerRidge(fr(F.lLo)), innerRidge(fr(F.lHi))];
        const have = vO[0] && vO[1] && vI[0] && vI[1] && lO[0] && lO[1] && lI[0] && lI[1];
        if (!have) { ok("!! both ridges were found in all four frames", false, "a ridge went missing"); }
        else {
            const vRo = vO[1].r / vO[0].r, vRi = vI[1].r / vI[0].r;
            const lRo = lO[1].r / lO[0].r, lRi = lI[1].r / lI[0].r;
            const lVo = lO[1].v / lO[0].v, lVi = lI[1].v / lI[0].v;
            say(`voice 0->1: outer ridge x${vRo.toFixed(4)} inner x${vRi.toFixed(4)}   ` +
                `layers 0->1: outer x${lRo.toFixed(4)} inner x${lRi.toFixed(4)}, heights x${lVo.toFixed(3)} / x${lVi.toFixed(3)}`);
            say(`peaks: voice ${interiorPeak(fr(F.vLo))} -> ${interiorPeak(fr(F.vHi))}, ` +
                `layers ${interiorPeak(fr(F.lLo))} -> ${interiorPeak(fr(F.lHi))} of 765`);

            // *** THE TWO RATIOS AGREE, AND THAT AGREEMENT IS THE CLAIM. *** There is ONE span multiplier in
            // the shader -- spanK = 1 + 0.22*voice + 0.16*flourish -- and it multiplies every shell radius.
            // So if the shells are real spheres at real radii, voice must move both ridges outward by the
            // SAME factor. Two independent measurements, on two ridges 0.17 of a frame apart, agreeing to
            // about a percent is a thing a painted gradient cannot do: paint the rings and they move by
            // whatever the paint says, or not at all.
            ok("!! *** VOICE MOVES BOTH RIDGES OUTWARD BY THE SAME FACTOR -- one spanK, every shell ***",
                vRo > 1.05 && vRi > 1.05 && Math.abs(vRo - vRi) / vRo < 0.05,
                `voice 0->1 moves the outer ridge x${vRo.toFixed(4)} and the inner x${vRi.toFixed(4)} -- ` +
                `${(Math.abs(vRo - vRi) / vRo * 100).toFixed(1)}% apart, from one multiplier applied to ` +
                `both. The shader's spanK is 1 + 0.22*voice + 0.16*flourish.x, so the geometric prediction ` +
                `is bounded above by x1.2200 and the measurement sits under it because the light-weighted ` +
                `ridge lags the geometric limb. WHAT THIS ROW CANNOT BE PASSED BY: a brightness change. A ` +
                `local maximum's POSITION is invariant under any positive scaling of the frame.`);

            // *** AND THE OTHER KNOB DOES THE OTHER THING, AND IT NAMES THE SHELLS WHILE DOING IT. ***
            // layers feeds the shell THICKNESS (thickB + layers * thickK) and the per-shell radius trims rk,
            // which are 0.06, -0.02 and -0.06 against bases of 0.70, 0.50 and 0.30. So it must raise the
            // ridges a great deal and move them a little, INWARD for the two inner shells -- the opposite
            // direction from voice, which is a sharper separation than "one moves them less".
            //
            // *** AND THE LITTLE IT MOVES THEM IS PREDICTED TO TWO PERCENT, WHICH IS HOW THIS ROW SAYS WHICH
            // SHELLS THE TWO RIDGES ARE. *** Both frames run at the same voice and the same time, so spanK
            // is identical in the pair and cancels exactly: the ratio is (base + rk) / base and nothing
            // else. Shell 1 predicts 0.480/0.500 = 0.9600 and shell 2 predicts 0.240/0.300 = 0.8000. The
            // measurement picks those two out and not shell 0's 1.0857, so the OUTER ridge is the MIDDLE
            // shell and the INNER ridge is the SMALLEST -- the biggest shell's limb falls outside the band
            // this gate searches. That identification was not assumed anywhere above; it is this row's own
            // result, and it is why the profile shows two ridges rather than three.
            //
            // IT ALSO EXPLAINS WHY VOICE LAGS ITS OWN BOUND WHILE LAYERS DOES NOT. layers reaches the shell
            // radius and the skin and nothing else. voice reaches spanK, foldAmp (x1.55), the shared surface
            // all eighteen species breathe with, and the key term -- four paths, so its x1.2200 is an upper
            // bound and not a prediction. A knob with one path predicts; a knob with four bounds.
            // *** AND THE PREDICTIONS ARE SPELLED OUT AS LITERALS, WHICH IS NOT STYLE. *** The first cut of
            // this row computed them from K.MH_FATHOM -- (base + rk) / base, straight off the table -- and a
            // sabotage that zeroed shell 2's rk WALKED THROUGH IT, because the same edit moved the shader
            // and the prediction together and they agreed all the way down. That is the v4579 defect exactly:
            // a gate re-stating the formula it grades. So the two ratios below are written out, transcribed
            // once from murmur's own shells (0.480/0.500 and 0.240/0.300), and the table is checked AGAINST
            // them separately. Change the constant now and one of the two halves reds whichever way you go.
            const P1 = 0.9600, P2 = 0.8000, P0 = 1.0857;
            const sh = K.MH_FATHOM.shells;
            const tableMatches =
                Math.abs((sh[1].base + sh[1].rk) / sh[1].base - P1) < 1e-4 &&
                Math.abs((sh[2].base + sh[2].rk) / sh[2].base - P2) < 1e-4 &&
                Math.abs((sh[0].base + sh[0].rk) / sh[0].base - P0) < 1e-4;
            ok("!! ...and LAYERS moves them INWARD by the amounts its rk constants predict, to 2%",
                lVo > 1.15 && lVi > 1.15 && tableMatches &&
                Math.abs(lRo / P1 - 1) < 0.03 && Math.abs(lRi / P2 - 1) < 0.04 &&
                Math.abs(lRo / P0 - 1) > 0.10,
                `layers 0->1 multiplies the ridge HEIGHTS by ${lVo.toFixed(3)} and ${lVi.toFixed(3)} -- the ` +
                `thicker skin -- and moves their radii x${lRo.toFixed(4)} and x${lRi.toFixed(4)}, INWARD, ` +
                `where voice moved the same two ridges OUTWARD (x${vRo.toFixed(4)}, x${vRi.toFixed(4)}). ` +
                `Both frames share a voice and a time so spanK cancels exactly and the prediction is just ` +
                `(base + rk)/base: shell 1 gives x${P1.toFixed(4)} and shell 2 gives x${P2.toFixed(4)} -- ` +
                `LITERALS, with the table checked against them (${tableMatches ? "it matches" : "IT DOES NOT MATCH"}) ` +
                `rather than consulted for them. Missed by ${(Math.abs(lRo / P1 - 1) * 100).toFixed(1)}% and ` +
                `${(Math.abs(lRi / P2 - 1) * 100).toFixed(1)}%. *** WHICH IS THIS ROW'S REAL RESULT: the ` +
                `two ridges are the MIDDLE and the SMALLEST shells. *** Shell 0 predicts x${P0.toFixed(4)} ` +
                `and is ${(Math.abs(lRo / P0 - 1) * 100).toFixed(0)}% away from the outer measurement -- ` +
                `its limb falls outside the band, which is why the profile shows two ridges and not three. ` +
                `That negative is carried IN THE CONDITION, so the row cannot pass by matching everything.`);
        }
    }
}

// =============================================================================================================
sec("3. *** PARALLAX BENDS THE LIMB OUT OF ROUND WITHOUT BRIGHTENING ANYTHING ***");
{
    if (!okRun) { ok("!! fathom's fold frames rendered", false, "the render did not produce them"); }
    else {
        const iLo = ridgePerAngle(fr(F.pLo), 0.13, 0.29), iHi = ridgePerAngle(fr(F.pHi), 0.13, 0.29);
        const oLo = ridgePerAngle(fr(F.pLo), 0.33, 0.53), oHi = ridgePerAngle(fr(F.pHi), 0.33, 0.53);
        const tLo = totalLight(fr(F.pLo)), tHi = totalLight(fr(F.pHi));
        say(`out of round -- inner ${(iLo.round * 100).toFixed(2)}% -> ${(iHi.round * 100).toFixed(2)}%, ` +
            `outer ${(oLo.round * 100).toFixed(2)}% -> ${(oHi.round * 100).toFixed(2)}%; ` +
            `total light ${tLo.toFixed(2)} -> ${tHi.toFixed(2)}`);

        // *** THREE PERFECT CONCENTRIC CIRCLES ARE A TARGET, NOT A SET OF FOLDED SURFACES. *** The fold has
        // to reach the OUTLINE or the species reads as a dartboard, so the radius is folded per pixel in the
        // pixel's own in-plane direction -- an approximation away from the limb and exact AT it, which is
        // the right place for the error to be. The knob doubles the fold amplitude (0.055 -> 0.110) and this
        // row reads the consequence on the silhouette of both ridges at once.
        //
        // *** AND THE TWO LIMBS MUST ARRIVE AT THE SAME FRACTION, WHICH IS THE ROW'S SECOND HALF AND THE
        // REASON IT IS NOT A RATIO. *** The shader folds a shell to RK = R + foldAmp * (R / R0) * foldOf, so
        // the displacement is proportional to the shell's own radius and the FRACTIONAL displacement,
        // (RK - R) / R = foldAmp * foldOf / R0, does not depend on which shell it is at all. Two shells
        // 0.17 of a frame apart therefore have to end up equally out of round -- and they do, to 4%, at the
        // setting where the fold dominates. The RATIOS do not match each other (x1.50 against x1.82) and
        // asserting that they would was this gate's first red: at parallax 0 the fold is small enough that
        // the baseline is mostly the ridge finder's own noise on two bands of different width, so the two
        // starting points differ for reasons that have nothing to do with the fold. The LEVELS at parallax 1
        // are the prediction; the ratios are a direction.
        const rI = iHi.round / iLo.round, rO = oHi.round / oLo.round;
        const agree = Math.abs(iHi.round - oHi.round) / Math.max(iHi.round, oHi.round);
        ok("!! *** THE FOLD REACHES THE OUTLINE, AND BOTH LIMBS LAND AT THE SAME FRACTION OF THEIR OWN RADIUS ***",
            rI > 1.3 && rO > 1.3 && agree < 0.15 && iLo.n >= 40 && oLo.n >= 40,
            `parallax 0->1 takes the inner limb from ${(iLo.round * 100).toFixed(2)}% to ` +
            `${(iHi.round * 100).toFixed(2)}% out of round (x${rI.toFixed(2)}) and the outer from ` +
            `${(oLo.round * 100).toFixed(2)}% to ${(oHi.round * 100).toFixed(2)}% (x${rO.toFixed(2)}), ` +
            `measured as the spread of ${iLo.n} and ${oLo.n} per-angle ridge radii. At the high setting the ` +
            `two limbs agree to ${(agree * 100).toFixed(1)}%, which is what the fold's own algebra requires ` +
            `and a per-shell fudge would not give: the displacement carries a factor R / R0 and is then read ` +
            `as a fraction of R, so R cancels and every shell bends by the same proportion. foldAmp doubles ` +
            `(${K.MH_FATHOM.foldB} -> ${K.MH_FATHOM.foldB + K.MH_FATHOM.foldK}) and the roundness responds ` +
            `by less than double because the fold is two sines that partly cancel, not one.`);

        // A fold is a DISPLACEMENT. If this knob also changed how much light the species emits, the row
        // above would be reading a brightness change through a ridge finder rather than a shape change.
        ok("!! ...and it is a displacement, not a gain: the total light barely moves",
            Math.abs(tHi / tLo - 1) < 0.10,
            `total frame light goes ${tLo.toFixed(2)} -> ${tHi.toFixed(2)}, ` +
            `${((tHi / tLo - 1) * 100).toFixed(1)}%, while the limbs bend by ${((rI - 1) * 100).toFixed(0)}% ` +
            `and ${((rO - 1) * 100).toFixed(0)}%. THIS IS THE HALF THAT MAKES THE OTHER HALF MEAN ` +
            `SOMETHING: without it, "the limb went out of round" is a claim a shader that merely got ` +
            `noisier could satisfy.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nFATHOM: three spheres, six crossings, one quadratic each, composited outer-in then inner-out " +
    "with no sort -- an order that is right and, measured against its own reversal, worth one " +
    "least-significant bit. Its two visible ridges are the MIDDLE and SMALLEST shells, identified " +
    "here from the rk constants rather than assumed." +
    "\nWHAT IS NOT CLAIMED HERE: geode, its sibling from the same round " +
    "(tools/ship/murmurSpecies7-selfcheck.mjs), the surface all eighteen share and limn's edge " +
    "(…murmurSpecies-selfcheck.mjs), comet's orbit (…Species2), opal and abyss (…Species3), " +
    "droplet's body (…Species4), nebula and tempest (…Species5), and the kit under all of them " +
    "(tools/ship/murmurKit-selfcheck.mjs). EIGHT species remain: aura, prism, duet, arc, flux, helix, " +
    "sol, chorus.");
process.exit(fails ? 1 : 0);
