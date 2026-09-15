// WebGLEngine/tools/ship/murmurSpecies-selfcheck.mjs
//
// Run: node tools/ship/murmurSpecies-selfcheck.mjs
//
// GATES the SPECIES built on render/murmurKit.mjs -- what render/aiPresenceOrbTsl.mjs draws, as opposed to
// tools/ship/murmurKit-selfcheck.mjs, which gates the kit they are all built out of.
//
// *** THIS FILE EXISTS BECAUSE OF A BUDGET, AND THE SPLIT IS STRUCTURAL RATHER THAN A DODGE. *** Every species
// row here needs a REAL RENDER, and a render needs a Chromium: the kit gate's own CPU work totals 165 ms
// against 2,800 ms of browser. Folding four species into that gate put it at 2,806 ms against a 3,000 ms
// budget, and the tree measures a contended sweep running about 10% slower -- 3,087 ms, and OVER. Tuning it
// down bought 194 ms and would have to be done again for every species added.
//
// *** FIFTEEN OF murmur-web's EIGHTEEN SPECIES ARE STILL UNPORTED. *** A single gate that renders all of them
// crosses the budget no matter how it is tuned, and a gate over budget does not run at ship time at all --
// which is the state v4535 spent a long record describing. So the species get their own gate, which is also
// the better attribution: a red here says a species is wrong, a red next door says the kit is.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { renderThreeTslToPixels } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSpecies-selfcheck -- the four species drawn out of the shared kit\n");

// 48 rather than 64: the claims below are separations of threefold and more, and the instruments are swept
// over 64 angles either way, so the frame size buys nothing but readback. The still control runs at two times
// rather than four because still's silhouette is time-invariant and any two prove it.
const N3 = 48, times = [2.4, 3.2, 3.9, 4.6], VOICE = 0.3, STILL_TIMES = [3.9];
// droplet's silhouette pair needs two WIDELY separated times -- its three modes turn at periods of 76, 103 and
// 134 seconds, so two frames a second apart would differ by almost nothing and the row would be measuring the
// instrument. 2.4 and 9.7 are seven seconds apart on those periods.
const DROP_TIMES = [2.4, 9.7];

// ONE LAUNCH FOR EVERY SPECIES FRAME. The launch is nearly the whole cost of a render, so the eight frames
// below share a page: v4625 gave renderThreeTslToPixels a variants list and v4626 let a variant name its own
// module, and this is what both were for.
const sp = (species, time, voice = VOICE) => ({ factoryArgs: { species }, knobs: { time, voice } });
// *** THE DROPLET PAIR RUNS AT VOICE ZERO, AND THAT IS WHAT GIVES THE ROW ITS ZERO FLOOR. *** With
// voice up, droplet's breath scales the WHOLE body between the two frames, so the silhouette changes
// even when the deformation is switched off -- measured, an amp of 0 still moved it 0.36%, and the
// row stayed green under exactly that sabotage. At voice 0 the swell is 0 and bodyScale is exactly 1,
// so the only thing that can move the outline is the deformation this species IS.
const SIL_VOICE = 0;
const run = await renderThreeTslToPixels({
    engineRoot: ENG, moduleImportPath: "/render/aiPresenceOrbTsl.mjs", factoryName: "makeAiPresenceOrbTsl",
    factoryArgs: { species: "still" }, knobs: { time: times[0], voice: VOICE }, width: N3, height: N3,
    variants: [
        sp("limn", times[0]),
        ...times.map((t) => sp("comet", t)),
        ...STILL_TIMES.map((t) => sp("still", t)),
        ...DROP_TIMES.map((t) => sp("droplet", t, SIL_VOICE)),
    ],
});
const okRun = run.ok && run.frames && run.frames.length === 2 + times.length + STILL_TIMES.length + DROP_TIMES.length;
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
    // evenly enough to read as a sphere it is everything. Measured: still 100%, comet 100%, limn 29%.

    if (!okRun) {
        ok("!! the three species render", false, `could not render: ${run.reason || "frames " + (run.frames ? run.frames.length : "none")}`);
    } else {
        const ring = (px) => {
            const vals = [];
            for (let a = 0; a < 72; a++) {
                const th = a * 2 * Math.PI / 72, rr = 0.62 * 0.88 * (N3 / 2);
                const x = Math.round(N3 / 2 + rr * Math.cos(th)), y = Math.round(N3 / 2 + rr * Math.sin(th));
                const i = (y * N3 + x) * 4;
                if (px[i + 3] < 200) continue;                       // stay inside the antialiased silhouette
                vals.push(px[i] + px[i + 1] + px[i + 2]);
            }
            const mx = Math.max(...vals), mn = Math.min(...vals);
            return { lit: vals.filter((v) => v >= mx * 0.5).length / vals.length, peakOverMin: mx / mn, n: vals.length };
        };
        const rs = ring(run.frames[0]), rl = ring(run.frames[1]), rc = ring(run.frames[2]);
        say(`ring lit at or above half its peak -- still ${(rs.lit * 100).toFixed(0)}%, limn ${(rl.lit * 100).toFixed(0)}%, comet ${(rc.lit * 100).toFixed(0)}% (${rs.n} samples each)`);
        ok("!! *** NEVER A FULL EVEN RING: limn lights under a third of its rim where the other two light all of theirs ***",
            rl.lit < 0.45 && rs.lit > 0.75 && rc.lit > 0.75,
            `still ${(rs.lit * 100).toFixed(0)}% of the ring at or above half peak, comet ${(rc.lit * 100).toFixed(0)}%, ` +
            `limn ${(rl.lit * 100).toFixed(0)}%. Peak over minimum: still ${rs.peakOverMin.toFixed(2)}, comet ` +
            `${rc.peakOverMin.toFixed(2)}, limn ${rl.peakOverMin.toFixed(2)}. *** THE THRESHOLDS ARE SET FROM ` +
            `TWO RESOLUTIONS, NOT ONE: *** at 64 px this ring read 100% / 100% / 29% and at 48 px it reads ` +
            `86% / 89% / 28% -- the absolute figures move with how many distinct pixels a 72-sample ring can ` +
            `land on, and the THREEFOLD separation does not. A limit fitted to one frame size is a limit ` +
            `fitted to a frame size. That concentration IS the species -- ` +
            `"a bright head with a soft tail streaming off one side, built so the far side of the ring never ` +
            `rises past a dim glow" -- and it is measured over the whole ring rather than at a chosen pair of points.`);
        // Stated as a RELATION rather than three absolute bounds, for the same reason: still's own peak-over-
        // minimum reads 1.75 at 64 px and 2.55 at 48 px on identical pixels, because the minimum is whichever
        // sample happens to land deepest in the dark. limn's lead over both survives either.
        ok("...and limn is the DARK hero: its ring swings far harder than either of the others'",
            rl.peakOverMin > Math.max(rs.peakOverMin, rc.peakOverMin) * 1.4,
            `limn ${rl.peakOverMin.toFixed(2)} against still ${rs.peakOverMin.toFixed(2)} and comet ` +
            `${rc.peakOverMin.toFixed(2)}. murmur's own fitted base rim is 0.30 for limn where still's is 0.85, ` +
            `and still's file calls its rim "the highest in the collection".`);
    }
}

// =============================================================================================================
sec("2. *** COMET, THE THIRD SPECIES: A TRAIL SOLVED IN CLOSED FORM, AND A HEAD THAT HAD TO BE SOLVED TOO ***");
{
    // mh_spin must be a rotation, or the orbit plane is not a plane.
    const B = K.cometBasis(0.5, 0.3);
    ok("!! the orbit basis is orthonormal to f64 -- e1.e2 exactly zero, all three unit",
        Math.abs(K.dot3(B.e1, B.e2)) < 1e-15 && Math.abs(K.len3(B.e1) - 1) < 1e-15 &&
        Math.abs(K.len3(B.e2) - 1) < 1e-15 && Math.abs(K.len3(B.nrm) - 1) < 1e-15,
        `e1.e2 = ${K.dot3(B.e1, B.e2).toExponential(1)}, |e1| |e2| |nrm| = ${K.len3(B.e1).toFixed(12)} ${K.len3(B.e2).toFixed(12)} ${K.len3(B.nrm).toFixed(12)}`);
    // The tilt is bounded away from BOTH degeneracies, which is a stated design constraint and not a range.
    ok("the orbit tilt is bounded away from face-on and edge-on at both ends of the knob",
        K.cometBasis(0, 0).tau === 0.30 && Math.abs(K.cometBasis(1, 0).tau - 1.05) < 1e-12,
        `tau runs ${K.cometBasis(0, 0).tau} .. ${K.cometBasis(1, 0).tau} rad. comet.ts: "face-on is a circle ` +
        `drawn on the glass, edge-on is a line."`);

    // *** THE CLOSED-FORM NEAREST POINT, AGAINST A DIFFERENT METHOD. *** This is the whole trail: comet.ts
    // cannot keep a history buffer ("these shaders are stateless by contract"), so the age of the trail at a
    // sample is the ANGLE of the nearest point on the orbit. If that is wrong the trail is wrong everywhere.
    const r0 = 0.55;
    let worst = 0, compared = 0;
    for (let i = 0; i < 12; i++) {
        const p = [Math.sin(i * 1.7) * 0.8, Math.cos(i * 2.3) * 0.7, Math.sin(i * 0.9) * 0.6];
        const { dist2 } = K.cometNearest(p, B, r0);
        let best = Infinity;
        for (let a = 0; a < 60000; a++) {
            const th = a * 2 * Math.PI / 60000;
            const c = [r0 * (Math.cos(th) * B.e1[0] + Math.sin(th) * B.e2[0]),
                       r0 * (Math.cos(th) * B.e1[1] + Math.sin(th) * B.e2[1]),
                       r0 * (Math.cos(th) * B.e1[2] + Math.sin(th) * B.e2[2])];
            const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
            if (d < best) best = d;
        }
        compared++; worst = Math.max(worst, Math.abs(dist2 - best));
    }
    ok("!! *** THE TRAIL'S GEOMETRY AGREES WITH A 60,000-SAMPLE SEARCH OVER THE CIRCLE ***",
        compared === 12 && worst < 1e-8,
        `worst |closed form - brute force| = ${worst.toExponential(2)} over ${compared} points; the residual ` +
        `is the SEARCH's own angular resolution, not the formula's. A different method reaching the same ` +
        `answer, which is the only agreement worth asserting about a closed form.`);

    // *** THE TRAIL HAS TO DIE BEFORE IT WRAPS, and comet.ts records what happened when it did not: ***
    // "a soft gradient meeting a step is the step" -- a hard-edged wedge cut through the glass along the
    // head's own radius.
    const fPlus = K.cometFall(Math.PI, 2.0), fMinus = K.cometFall(-Math.PI, 2.0);
    ok("!! *** THE TRAIL IS GONE AT BOTH ENDS OF THE WRAP, so it never meets its own head as a step ***",
        fPlus < 1e-6 && fMinus < 1e-3,
        `fall(+pi) = ${fPlus.toExponential(2)} behind the head and fall(-pi) = ${fMinus.toExponential(2)} ` +
        `ahead of it, at murmur's own decay of 2.0 -- where an unfaded exponential would still stand at a fifth.`);
    ok("...and the two branches meet at the head at exactly one, a kink rather than a step",
        K.cometFall(0, 2.0) === 1 && Math.abs(K.cometFall(-1e-12, 2.0) - 1) < 1e-9,
        `fall(0) = ${K.cometFall(0, 2.0)} from behind and ${K.cometFall(-1e-12, 2.0).toFixed(12)} from ahead. ` +
        `comet.ts keeps the kink deliberately, "under the head's own bloom, which is where a comet keeps it too".`);

    // *** THE ROW THAT WOULD HAVE CAUGHT THIS SPECIES SHIPPING WITHOUT ITS HEAD -- AND DID. ***
    // comet's whole brief is ONE BRIGHT POINT ORBITING. Ported with only the march, its brightest interior
    // pixel sat at (36,25) at every time tested -- the SPECULAR CATCHLIGHT, motionless -- because the head is
    // 0.043 body units across against a march step of about 0.38 and simply fell between the taps. comet.ts
    // says so in its own words and solves the head at the ray's closest approach instead. So the claim worth
    // asserting is not that comet renders: it is that its brightest interior point MOVES, and that the two
    // species without an orbiting object hold still.
    // *** THE SAME NINE FRAMES SECTION 7 ALREADY PAID FOR. *** Rendering them again here cost a second
    // browser launch and took this gate to 3,339 ms, over the 3,000 ms budget -- which promptly moved
    // KIT_AT_V4623 out of recordReach's CHECKED set, because a record guarded by a gate the sweep cannot
    // afford is guarded on paper. Frames 2..5 are comet across a lap; frames 0 and 6..8 are still across the
    // same times.
    if (!okRun) {
        ok("!! comet's bright point travels and still's does not", false,
            `could not render: ${run.reason || "frames " + (run.frames ? run.frames.length : "none")}`);
    } else {
        const peak = (px) => {
            let best = -1;
            for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
                const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
                if (Math.hypot(dx, dy) > 0.62 * 0.75) continue;
                const i = (y * N3 + x) * 4, v = px[i] + px[i + 1] + px[i + 2];
                if (v > best) best = v;
            }
            return best;
        };
        const hotspot = (px) => {
            let best = -1, bx = 0, by = 0;
            for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
                const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
                if (Math.hypot(dx, dy) > 0.62 * 0.75) continue;        // interior only, clear of the rim
                const i = (y * N3 + x) * 4, v = px[i] + px[i + 1] + px[i + 2];
                if (v > best) { best = v; bx = x; by = y; }
            }
            return bx + "," + by;
        };
        const cometPts = run.frames.slice(2, 6).map(hotspot);
        const stillPts = [run.frames[0], run.frames[6]].map(hotspot);
        const cN = new Set(cometPts).size, sN = new Set(stillPts).size;
        say(`interior hotspot over ${times.length} times -- comet ${cometPts.join(" ")} (${cN} distinct), still ${stillPts.join(" ")} (${sN} distinct)`);
        ok("!! *** comet'S BRIGHT POINT TRAVELS ITS ORBIT AND still'S CATCHLIGHT DOES NOT MOVE AT ALL ***",
            cN >= 3 && sN === 1,
            `comet takes ${cN} distinct hotspot positions across ${times.length} frames; still takes ${sN} across ${stillPts.length}.`);

        // *** AND THAT ROW ALONE DOES NOT CATCH THE BUG THIS SPECIES ACTUALLY SHIPPED WITH -- the sabotage
        // sweep proved it. *** Deleting the solved head left the row above GREEN, because the TRAIL moves too:
        // "something bright moves" is satisfied by a smear. What separates a solved point from a smear is that
        // the point is EQUALLY BRIGHT WHEREVER IT IS on its orbit, give or take the depth extinction that dims
        // it behind the core, while the trail's own maximum rises and falls with the geometry. Measured: with
        // the head, the peak runs 705/692/693/698 across a lap -- a spread of 1.8%. With the head removed it
        // runs 705/677/580/561, a spread of 20.4%. The threshold is set between them and both readings are
        // written here so a later change can be judged against numbers rather than against a limit.
        const peaks = run.frames.slice(2, 6).map(peak);
        const spread = (Math.max(...peaks) - Math.min(...peaks)) / Math.max(...peaks);
        say(`comet peak brightness across the lap: ${peaks.join(" ")} -- spread ${(spread * 100).toFixed(1)}%`);
        ok("!! *** THE HEAD IS A SOLVED POINT, SO IT IS AS BRIGHT AT THE BACK OF ITS ORBIT AS AT THE FRONT ***",
            spread < 0.10,
            `spread ${(spread * 100).toFixed(1)}% over ${peaks.length} phases, against 20.4% measured with the ` +
            `head deleted. comet.ts: the head is 0.043 body units across against a march step of about 0.38, ` +
            `so sampling it "depended on where the tap planes happened to fall" -- it flickered, and near the ` +
            `limb it drew a SECOND comet. This is the row that fails when it is left to the march.`);
    }
}
// =============================================================================================================
sec("3. *** DROPLET: THE BODY ITSELF IS THE SPECIES ***");
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
        const radii = (px) => {
            const out = [];
            for (let a = 0; a < 64; a++) {
                const th = a * 2 * Math.PI / 64;
                let lo = 0.1, hi = 0.98;
                for (let it = 0; it < 40; it++) {          // bisect the alpha = 128 crossing, subpixel
                    const mid = (lo + hi) / 2;
                    if (alphaAt(px, C + mid * C * Math.cos(th), C + mid * C * Math.sin(th)) > 128) lo = mid; else hi = mid;
                }
                out.push((lo + hi) / 2);
            }
            return out;
        };
        const change = (a, b) => {
            const A = radii(a), B = radii(b);
            const mean = A.reduce((x, y) => x + y, 0) / A.length;
            const d = A.map((v, i) => Math.abs(v - B[i]));
            return { max: Math.max(...d) / mean, mean: d.reduce((x, y) => x + y, 0) / d.length / mean };
        };
        const dropCh = change(run.frames[7], run.frames[8]);
        // still at t=2.4 against still at t=3.9 -- the control needs two DIFFERENT times, not the same two
        // droplet uses, because still's silhouette is time-invariant and any pair proves it. Rendering a
        // fourth still frame to match droplet's times exactly cost a tenth frame and took this gate to
        // 3,120 ms, over budget, to establish a zero that frames 0 and 6 already establish.
        const stillCh = change(run.frames[0], run.frames[6]);
        say(`silhouette change at voice ${SIL_VOICE} -- droplet (t=${DROP_TIMES[0]} vs ${DROP_TIMES[1]}) max ${(dropCh.max * 100).toFixed(2)}% mean ${(dropCh.mean * 100).toFixed(2)}%; still (t=${times[0]} vs ${STILL_TIMES[0]}) max ${(stillCh.max * 100).toFixed(3)}%`);
        // *** AND THE HEART, WHICH THE SILHOUETTE ROW DOES NOT SEE AT ALL. *** Deleting droplet's solved core
        // left every row here green -- the same hole comet's missing head went through. The peak is no use:
        // it saturates at 765 with the heart and without it. What the heart does is LIGHT THE FOG IT SITS IN
        // ("the drop comes out as a lamp inside a lens instead of a disc pasted on ink"), so the measure is
        // the interior's MEAN, which halves when the core is removed: 487 against 254.
        const lumAt = (px, x, y) => { const i = (y * N3 + x) * 4; return px[i] + px[i + 1] + px[i + 2]; };
        let dSum = 0, dN = 0;
        for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
            const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
            if (Math.hypot(dx, dy) > 0.62 * 0.70) continue;
            dSum += lumAt(run.frames[7], x, y); dN++;
        }
        const dropMean = dSum / dN;
        say(`droplet interior mean luminance ${dropMean.toFixed(0)} over ${dN} pixels`);
        ok("!! *** THE HEART LIGHTS THE VOLUME AROUND IT: droplet's interior is lit, not a dark shell ***",
            dropMean > 350,
            `interior mean ${dropMean.toFixed(0)}; with the solved core deleted the same measure reads 254, ` +
            `because what is left is haze alone. droplet.ts: "A clear interior is not an empty one -- it is ` +
            `what lets the refraction be visible, because the only way to see a lens is to see something ` +
            `through it." The peak cannot carry this row: it saturates at 765 either way.`);

        ok("!! *** THE BODY ITSELF IS THE SPECIES: droplet's SILHOUETTE moves and still's does not move at all ***",
            dropCh.mean > 0.002 && stillCh.max === 0,
            `droplet's per-angle radius shifts by ${(dropCh.mean * 100).toFixed(2)}% on average and ` +
            `${(dropCh.max * 100).toFixed(2)}% at its worst angle; still's shifts by EXACTLY ` +
            `${(stillCh.max * 100).toFixed(3)}% -- the grid artifact cancels, which is what makes this the one ` +
            `silhouette measurement here with no floor to argue about. droplet.ts: "the body itself is the ` +
            `species: a sphere of water in free fall."`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nFOUR OF murmur-web's EIGHTEEN SPECIES: still (the kit's first consumer), limn, comet and droplet. Each " +
    "row here is a property of the SPECIES measured on real pixels -- limn's ring lit under a third of the way " +
    "round, comet's point travelling its orbit at a steady peak, droplet's silhouette moving where the other " +
    "three are frozen circles -- and not a restatement of the shader that drew them. " +
    "\nWHAT IS NOT CLAIMED HERE: the kit those species stand on, which is tools/ship/murmurKit-selfcheck.mjs's " +
    "subject, including the deformed body solve droplet is the first to need. Fifteen species remain.");
process.exit(fails ? 1 : 0);
