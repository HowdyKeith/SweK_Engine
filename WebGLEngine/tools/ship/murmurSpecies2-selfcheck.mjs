// WebGLEngine/tools/ship/murmurSpecies2-selfcheck.mjs -- v4630
//
// Run: node tools/ship/murmurSpecies2-selfcheck.mjs
//
// GATE TWO OVER THE SPECIES: COMET, whose subject is a POINT GOING ROUND. It needs one hero at four phases
// of ONE LAP, which is a different frame budget from the rim ranking and ring evenness next door in
// tools/ship/murmurSpecies-selfcheck.mjs, where several heroes are needed at one time.
//
// *** SPLIT OUT AT v4630, BEFORE THE SPECIES THAT FORCED IT RATHER THAN AFTER. *** One species gate was at
// 2,780 ms against a 3,000 ms ceiling with four of eighteen ported, and a species costs about 195 ms, so the
// fifth crossed it. The measurements the gates share live in tools/ship/murmurSpeciesFrames.mjs rather than
// being copied, because two gates with their own idea of "the light at a point" eventually disagree about
// what they measured.
//
// *** AND SPLIT AGAIN AT v4632, WHEN droplet LEFT FOR tools/ship/murmurSpecies4-selfcheck.mjs. *** This gate
// held comet and droplet together, and droplet's swell pair cost a PAIRED 206 to 287 ms over four
// interleaved runs -- taking it from about 2,740 to about 2,980 against the 3,000 ms ceiling. The two heroes
// never shared a frame anyway: comet needs four phases of a 2.2-second lap, droplet needs two times eight
// seconds apart on 76-to-134-second periods. What they shared was a `still` control, and each needed its own
// kind -- comet's two times 1.5 s apart, droplet's the whole window it is measured over.
"use strict";
import * as K from "../../render/murmurKit.mjs";
import { N3, VOICE, sp, renderSpecies, lin, light, bil, hotspot, interiorPeak, travelRadii }
    from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSpecies2-selfcheck -- comet's orbit: a trail in closed form and a head that is a solved point\n");

// comet is rendered at four phases of one lap; still twice as the control for the hotspot row.
const times = [2.4, 3.2, 3.9, 4.6];
// TWO still frames spanning comet's OWN lap, 2.4 to 4.6, so the control is asked the same question over the
// same window rather than over a shorter one. It read 2.4 to 3.9 until v4632, which was comet's first three
// phases and not its four. A third frame at 9.7 stood here for droplet's silhouette control, which wanted
// droplet's OWN eight-second window; that row and its frame left with droplet at v4632.
const STILL_TIMES = [2.4, 4.6];
const FRAMES = [...times.map((t) => sp("comet", t)), ...STILL_TIMES.map((t) => sp("still", t))];
const run = await renderSpecies(FRAMES);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) ok("!! the species render ran", false, `could not render: ${run.reason || "frames " + (run.frames ? run.frames.length : "none")}`);
// Frame map, named once so no row has to count: comet 0..3, still 4..5.
const F = { comet: [0, 1, 2, 3], still: [4, 5] };

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
        // travels 1.150 radii at 48 px and 1.169 at 64. Stable to 0.019 across a resolution change.
        //
        // *** AND still'S HALF OF THIS ROW WAS WRONG IN BOTH DIRECTIONS UNTIL v4632, WHICH IS WHY IT IS AN
        // ABSOLUTE NOW AND NOT A RATIO. *** The text here said "still's is NOT zero and must not be asserted
        // as zero" and quoted 0.067 radii at 48 px and 0.071 at 64. Re-measured, still reads 0.000 at 48 px
        // and 0.050 at 64 -- neither figure reproduces, and the 48 px one is EXACTLY ZERO. That is the right
        // answer and not a floor: murmur's key drifts 4.80 degrees over a 29.9 second period (measured on the
        // CPU in tools/ship/murmurKit-selfcheck.mjs, which is where a claim about the key belongs), so over
        // comet's 2.2-second lap it turns 0.35 degrees and moves the catchlight a small fraction of one
        // pixel. A hotspot is an integer pixel; a sub-pixel drift is zero to it, at 48 px, correctly.
        //
        // So the ratio clause is gone. cT > sT * 5 against an sT of zero is not a measurement -- it is
        // satisfied by anything, and it printed "1150352337x less" from its own divide-by-zero guard, which
        // is a number no reader could use. The row now bounds the two sides SEPARATELY: comet's travel
        // exceeds the body radius, and still's stays under one pixel of the frame it was measured in.
        const cometPts = F.comet.map((i) => hotspot(run.frames[i]));
        const stillPts = [F.still[0], F.still[1]].map((i) => hotspot(run.frames[i]));
        const cT = travelRadii(cometPts), sT = travelRadii(stillPts);
        say(`interior hotspot travel -- comet ${cometPts.map((q) => q.join(",")).join(" ")} = ${cT.toFixed(3)} radii; still ${stillPts.map((q) => q.join(",")).join(" ")} = ${sT.toFixed(3)} radii`);
        const PX = 0.62 * N3 / 2;   // one body radius, in pixels of this frame
        ok("!! *** comet'S BRIGHT POINT CROSSES THE BODY; still'S CATCHLIGHT DOES NOT MOVE A WHOLE PIXEL ***",
            cT > 0.8 && sT * PX < 1.5,
            `comet's hotspot travels ${cT.toFixed(3)} body radii across ${times.length} frames -- further ` +
            `than the radius itself, which is what an orbiting point does -- while still's travels ` +
            `${sT.toFixed(3)} radii, which is ${(sT * PX).toFixed(2)} of a pixel at this ` +
            `${N3} px frame. Measured at two frame sizes: comet 1.150 and 1.169, still 0.000 and 0.050. ` +
            `*** STILL'S FIGURE IS ZERO AT 48 px AND THAT IS CORRECT RATHER THAN A FLOOR: *** murmur's key ` +
            `drifts 4.80 degrees over a 29.9 s period, so across comet's 2.2 s lap it turns 0.35 degrees, ` +
            `which is a fraction of one pixel -- and a hotspot is an integer pixel. The two sides are bounded ` +
            `SEPARATELY because a ratio against zero is satisfied by anything; until v4632 this row carried ` +
            `cT > sT * 5 and printed "1150352337x less" out of its own divide-by-zero guard.`);

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
console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nTHE HERO WHOSE SUBJECT IS A POINT GOING ROUND: comet's trail solved in closed form against a " +
    "60,000-sample search, and its head solved at closest approach so it is as bright at the back of its " +
    "orbit as at the front -- measured against still, whose catchlight only drifts with the key light, in " +
    "the same frames. " +
    "\nWHAT IS NOT CLAIMED HERE: the surface all eighteen share and limn's edge " +
    "(tools/ship/murmurSpecies-selfcheck.mjs), droplet's body (tools/ship/murmurSpecies4-selfcheck.mjs), " +
    "opal and abyss (tools/ship/murmurSpecies3-selfcheck.mjs), and the kit under all of them " +
    "(tools/ship/murmurKit-selfcheck.mjs).");
process.exit(fails ? 1 : 0);
