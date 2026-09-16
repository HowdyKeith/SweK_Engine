// WebGLEngine/tools/ship/murmurSpecies2-selfcheck.mjs -- v4630
//
// Run: node tools/ship/murmurSpecies2-selfcheck.mjs
//
// GATE TWO OF TWO OVER THE SPECIES: THE TWO HEROES WHOSE SUBJECT IS MOTION. comet's point has to go round
// its orbit at a steady brightness; droplet's body has to change shape. Both need ONE hero at SEVERAL TIMES,
// which is a different frame budget from the rim ranking and ring evenness next door in
// tools/ship/murmurSpecies-selfcheck.mjs, where several heroes are needed at one time.
//
// *** SPLIT OUT AT v4630, BEFORE THE SPECIES THAT FORCED IT RATHER THAN AFTER. *** One species gate was at
// 2,780 ms against a 3,000 ms ceiling with four of eighteen ported, and a species costs about 195 ms, so the
// fifth crossed it. The measurements both gates use live in tools/ship/murmurSpeciesFrames.mjs rather than
// being copied, because two gates with their own idea of "the light at a point" eventually disagree about
// what they measured.
"use strict";
import * as K from "../../render/murmurKit.mjs";
import { N3, VOICE, SIL_VOICE, sp, renderSpecies, lin, light, bil, hotspot, interiorPeak,
         travelRadii, ringChange, interiorMeanLight, hueShift } from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSpecies2-selfcheck -- comet's orbit and droplet's body\n");

// comet is rendered at four phases of one lap; still twice as the MOTIONLESS control for both sections.
const times = [2.4, 3.2, 3.9, 4.6];
const STILL_TIMES = [2.4, 3.9];
// droplet's pair needs two WIDELY separated times: its three modes turn at periods of 76, 103 and 134
// seconds, so two frames a second apart would differ by almost nothing and the row would be measuring the
// instrument. 2.4 and 9.7 are seven seconds apart on those periods.
const DROP_TIMES = [2.4, 9.7];
// The last two are droplet's spread pair: one render each, no compile, since `spread` is an ORB_KNOBS name.
const FRAMES = [...times.map((t) => sp("comet", t)),
                ...STILL_TIMES.map((t) => sp("still", t)),
                ...DROP_TIMES.map((t) => sp("droplet", t, SIL_VOICE)),
                sp("droplet", DROP_TIMES[0], VOICE, { spread: 0 }),
                sp("droplet", DROP_TIMES[0], VOICE, { spread: 1 })];
const run = await renderSpecies(FRAMES);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) ok("!! the species render ran", false, `could not render: ${run.reason || "frames " + (run.frames ? run.frames.length : "none")}`);
// Frame map, named once so no row has to count: comet 0..3, still 4..5, droplet 6..7.
const F = { comet: [0, 1, 2, 3], still: [4, 5], droplet: [6, 7], dropSpread: [8, 9] };

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
        // *** THIS ROW COUNTED DISTINCT POSITIONS UNTIL v4629 AND REQUIRED still'S TO BE EXACTLY ONE. ***
        // That was true only of an approximation. This file's own surface used a FIXED light direction, so
        // still's catchlight was genuinely motionless; murmur's mh_key DRIFTS -- kit.ts: "enough that the
        // highlight is never in the same place twice and not enough that anybody watches it move" -- and the
        // moment the real key was ported the row went red on a species that had become MORE faithful, not
        // less. A count of distinct positions cannot tell a one-pixel drift from an orbit; it only ever
        // stood in for the magnitude, so it measures the magnitude now.
        //
        // IN BODY RADII RATHER THAN PIXELS, so the figure does not move with the frame size: comet's hotspot
        // travels 1.150 radii at 48 px and 1.164 at 64, still's 0.067 and 0.071. Stable to 0.014 radii across
        // a resolution change, and a SIXTEENFOLD separation -- where the old instrument's own margin was one
        // position against three.
        const cometPts = F.comet.map((i) => hotspot(run.frames[i]));
        const stillPts = F.still.map((i) => hotspot(run.frames[i]));
        const cT = travelRadii(cometPts), sT = travelRadii(stillPts);
        say(`interior hotspot travel -- comet ${cometPts.map((q) => q.join(",")).join(" ")} = ${cT.toFixed(3)} radii; still ${stillPts.map((q) => q.join(",")).join(" ")} = ${sT.toFixed(3)} radii`);
        ok("!! *** comet'S BRIGHT POINT CROSSES THE BODY; still'S CATCHLIGHT ONLY DRIFTS WITH THE KEY LIGHT ***",
            cT > 0.8 && sT < 0.25 && cT > sT * 5,
            `comet's hotspot travels ${cT.toFixed(3)} body radii across ${times.length} frames -- further than ` +
            `the radius itself, which is what an orbiting point does -- against still's ${sT.toFixed(3)}, ` +
            `${(cT / Math.max(sT, 1e-9)).toFixed(0)}x less. still's is NOT zero and must not be asserted as ` +
            `zero: murmur's key light drifts about 4.8 degrees over a 29.9 s period, so the catchlight moves ` +
            `about a pixel over this window and never sits in the same place twice. The limits are set from ` +
            `two frame sizes (1.150/0.067 at 48 px, 1.164/0.071 at 64), not one.`);

        // *** AND THAT ROW ALONE DOES NOT CATCH THE BUG THIS SPECIES ACTUALLY SHIPPED WITH -- the sabotage
        // sweep proved it. *** Deleting the solved head left the row above GREEN, because the TRAIL moves too:
        // "something bright moves" is satisfied by a smear. What separates a solved point from a smear is that
        // the point is EQUALLY BRIGHT WHEREVER IT IS on its orbit, give or take the depth extinction that dims
        // it behind the core, while the trail's own maximum rises and falls with the geometry. Measured: with
        // the head, the peak runs 705/692/693/698 across a lap -- a spread of 1.8%. With the head removed it
        // runs 705/677/580/561, a spread of 20.4%. The threshold is set between them and both readings are
        // written here so a later change can be judged against numbers rather than against a limit.
        const peaks = F.comet.map((i) => interiorPeak(run.frames[i]));
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
        // Measured at two frame sizes before the limits were set: droplet 71.5% and 64.3% mean change,
        // still 0.08% and 0.02%. Roughly EIGHT HUNDRED TIMES apart, with a control that is flat.
        const dropCh = ringChange(run.frames[F.droplet[0]], run.frames[F.droplet[1]]);
        // still at t=2.4 against still at t=3.9 -- the control needs two DIFFERENT times, not the same two
        // droplet uses, because still's silhouette is time-invariant and any pair proves it.
        const stillCh = ringChange(run.frames[F.still[0]], run.frames[F.still[1]]);
        say(`silhouette at voice ${SIL_VOICE}, light on a FIXED ring -- droplet (t=${DROP_TIMES[0]} vs ${DROP_TIMES[1]}) max ${(dropCh.max * 100).toFixed(1)}% mean ${(dropCh.mean * 100).toFixed(2)}%; still (t=${times[0]} vs ${STILL_TIMES[0]}) max ${(stillCh.max * 100).toFixed(2)}% mean ${(stillCh.mean * 100).toFixed(3)}%`);
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
        // light, lit against core-deleted: 0.3871 / 0.0729 at 48 px and 0.3773 / 0.0687 at 64 px -- stable
        // across the frame size, and a 5.3x separation where the byte sum shows 2.7x. The limit of 0.20 sits
        // a factor of 1.9 under the lit figure and 2.7 over the ablated one, at both resolutions.
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

        ok("!! *** THE BODY ITSELF IS THE SPECIES: droplet's SILHOUETTE moves and still's barely does ***",
            dropCh.mean > 0.20 && stillCh.mean < 0.01 && dropCh.mean > stillCh.mean * 50,
            `the light on a fixed ring at the body radius shifts by ${(dropCh.mean * 100).toFixed(1)}% on ` +
            `average for droplet and ${(dropCh.max * 100).toFixed(0)}% at its worst angle, against still's ` +
            `${(stillCh.mean * 100).toFixed(3)}% and ${(stillCh.max * 100).toFixed(2)}% -- ` +
            `${(dropCh.mean / Math.max(stillCh.mean, 1e-9)).toFixed(0)}x. still's is no longer EXACTLY zero ` +
            `and is not asserted as zero: murmur's key light drifts, so even a frozen body's rim changes a ` +
            `little between two times. droplet.ts: "the body itself is the species: a sphere of water in ` +
            `free fall."`);
    }
}

// =============================================================================================================
sec("4. *** droplet's SHARE OF THE SPREAD AXIS: dispersion through the depth ***");
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
            `${hs.dL.toFixed(4)}. Measured at two frame sizes before the limits were set: 1.53 and 1.58 ` +
            `degrees, 0.0008 both times. Before v4630 this file's march accumulated only a luminance and every ` +
            `species handed mh_lit a hue of ZERO, so the rail's spread axis -- built and proved exact in ` +
            `tools/ship/murmurKit-selfcheck.mjs section 8 at v4627 -- reached nothing that anyone could see.`);
    }
}


console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nTHE TWO HEROES WHOSE SUBJECT IS MOTION: comet's point travelling its orbit at a steady peak because " +
    "its head is SOLVED rather than marched, and droplet's silhouette moving where still's is frozen. Both " +
    "are measured against still as the motionless control, in the same frames. " +
    "\nWHAT IS NOT CLAIMED HERE: the surface all eighteen share and limn's edge, which are " +
    "tools/ship/murmurSpecies-selfcheck.mjs's subject, and the kit underneath, which is " +
    "tools/ship/murmurKit-selfcheck.mjs's.");
process.exit(fails ? 1 : 0);
