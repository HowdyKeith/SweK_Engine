// WebGLEngine/tools/ship/murmurSpecies3-selfcheck.mjs -- v4632
//
// Run: node tools/ship/murmurSpecies3-selfcheck.mjs
//
// GATE THREE OVER THE SPECIES: OPAL AND ABYSS, the fifth and sixth of murmur's eighteen, and the two that
// sit at opposite ends of the collection's one axis -- how much is happening. opal is the busiest hero in the
// set and abyss is the only one whose default state is almost nothing at all, so the rows here are mostly
// about TIME: what each looks like across a span long enough for its own events to come and go.
//
// That is a third frame budget again, and the reason this file exists rather than more rows next door: gate
// one needs several heroes at ONE time (the rim ranking, the ring's evenness), gate two needs one hero at
// several times over a SHORT span (comet's lap, droplet's wobble), and these two need one hero over a span
// of half a minute, because abyss's default slot is about twenty seconds and opal's four lives run on
// periods of 14.3 to 22.4. Sampling those in a gate built for a 2.2-second window would measure nothing.
"use strict";
import * as K from "../../render/murmurKit.mjs";
import { N3, VOICE, VOICE_LIVE, sp, renderSpecies, lin, light, bil, edgeQuartile, interiorMeanLight, hueShift,
         hueTurn, hotspotMove, interiorPeak } from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSpecies3-selfcheck -- opal's play of colour and abyss's long dark\n");

// FOUR TIMES ACROSS 20.5 SECONDS, which is chosen from the species rather than round: abyss's default slot
// is 16.48 s at these knobs and opal's four lives run at 14.3, 17.1, 19.6 and 22.4, so a span shorter than
// this can miss an abyss event entirely and would sample opal at what is effectively one phase.
//
// *** AND THE FOUR ARE CHOSEN FROM abyss's OWN CLOCKS RATHER THAN SPACED EVENLY, which is what lets the rows
// below name a LANE instead of a moment. *** render/murmurKit.mjs's mhFlourish is the same envelope the
// shader runs, so the CPU half says exactly which of the three lanes is passing at any time. At the default
// rarity (0.6) and this voice the slot is 16.48 s, and over the first half-minute:
//
//     t = 2.0    all three lanes at 0.000          -- night
//     t = 9.0    lane 2 at 0.909, lanes 0,1 at 0.000/0.005  -- ONE creature, the third lane, hue step +1
//     t = 16.0   all three lanes at 0.000          -- night
//     t = 22.5   lane 0 at 0.333, lanes 1,2 at 0.000        -- ONE creature, the first lane, hue step -1
//
// Two nights and two single-lane passes BY DIFFERENT LANES. An evenly spaced set would have been two nights
// and two passes as well, but with no way to say which lane made either -- and the hue row below turns
// entirely on that, because the two lanes are meant to turn the body in OPPOSITE directions.
const TIMES = [2.0, 9.0, 16.0, 22.5];
// The two single-lane passes, by index into TIMES.
const PASS_THIRD = 1, PASS_FIRST = 3, NIGHT = 2;
// THIRTEEN FRAMES AND TWO SHADERS, and every one of those three numbers is a budget decision. The ceiling is
// 3,000 ms and a gate over it does not run at ship time AT ALL, so the arithmetic is part of the gate:
//
//   * A first cut took six times and a separate spread-0 frame -- fifteen frames -- and measured 3,097 ms.
//     opal's spread knob moves HUE ONLY (0.0017 of lightness, measured below), so the spread-0 frame is also
//     a perfectly good interior-energy sample. Four times, ten frames, 2,700 ms.
//   * v4632's four abyss lane frames took it to 2,956 ms. That is green and it is NOT enough margin: the
//     run-to-run spread here is about 100 ms and eviction needs two consecutive crossings, so a gate sitting
//     44 ms under the line is a gate that will eventually stop running and take its rows with it.
//   * *** SO THE THIRD SPECIES WENT, AND WHAT IT COST IS NAMED RATHER THAN GLOSSED. *** A `still` frame sat
//     here as a neutral reference for two rows, and being a third SHADER it cost a WGSL compile as well as a
//     render. Its two rows are now stated against opal, which is this gate's own other species, and the gate
//     measures 2,357 ms on the rotation with the lane frames in -- the rotation's figure and not a standalone
//     one, because a standalone timing is not the number the eviction rule reads. The numbers got STRONGER (abyss's edge outruns opal's
//     by 112x where it outran still's by 10x) and the claim got NARROWER: "the highest rim in the roster" is a
//     ranking over eighteen heroes and neither version of this row ever measured that. What it measures is
//     two species at opposite ends of one axis, which is what this file is for. The roster-wide rim ranking
//     lives in gate one, where several heroes are on screen at one time.
// *** EVERY FRAME HERE NAMES spread AND drift, and that is the reuseInstances promise rather than tidiness.
// *** setKnobs writes only the names PRESENT in its argument, so a knob one frame sets and the next does not
// mention keeps the first frame's value. Before v4632 the abyss frames named neither, so they ran on
// whatever the k0 defaults happened to be (0.4 and 0.4) while the opal frames beside them were driving
// spread deliberately -- harmless here only because instances are cached per SPECIES, so opal's writes could
// not reach abyss's uniforms. That is a property of the harness holding a gate up, which is the shape this
// tree has had to repair once already (v4630's paper-ground ink leak, read back as a 0.57 lightness shift in
// a row asking about hue). Named on every frame, the hazard is unreachable rather than merely absent.
const AB = (t, extra = {}) => sp("abyss", t, VOICE, { spread: 0, drift: 0, ...extra });
const FRAMES = [
    ...TIMES.map((t) => sp("opal", t, VOICE, { spread: 0, drift: 0.4 })),
    ...TIMES.map((t) => AB(t)),
    sp("opal", TIMES[0], VOICE, { spread: 1, drift: 0.4 }),
    AB(TIMES[PASS_THIRD], { spread: 1 }),
    AB(TIMES[PASS_FIRST], { spread: 1 }),
    AB(TIMES[PASS_THIRD], { drift: 1 }),
    AB(TIMES[NIGHT], { drift: 1 }),
];
const F = {
    opal: [0, 1, 2, 3], abyss: [4, 5, 6, 7], opalSpread: [0, 8],
    abyssThirdSpread: 9, abyssFirstSpread: 10, abyssThirdDrift: 11, abyssNightDrift: 12,
};
const run = await renderSpecies(FRAMES);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) ok("!! the species render ran", false, `could not render: ${run.reason || "frames " + (run.frames ? run.frames.length : "none")}`);

// =============================================================================================================
sec("1. *** ABYSS: THE PATIENCE PIECE -- rare glows passing through, mostly night ***");
{
    if (!okRun) { ok("!! abyss has frames", false, "the render did not produce them"); }
    else {
        const ab = F.abyss.map((i) => interiorMeanLight(run.frames[i]).mean);
        const op = F.opal.map((i) => interiorMeanLight(run.frames[i]).mean);
        const mn = Math.min(...ab), mx = Math.max(...ab), opMin = Math.min(...op);
        say(`abyss interior across ${TIMES.length} times: ${ab.map((v) => v.toFixed(3)).join(" ")}`);
        say(`opal  interior across the same: ${op.map((v) => v.toFixed(3)).join(" ")}`);

        // *** THE EVENTS ARE RARE, AND THAT IS THE SPECIES RATHER THAN A SHORTFALL. *** abyss.ts: "at the
        // default rarity a creature passes roughly every twenty seconds, and between them there is a dark
        // bead with an edge. Nothing else in this collection asks the viewer to wait, and a set of eighteen
        // presences needs one that does." So the row asserts a SWING across time, not a level: most samples
        // sit on the night floor and at least one is many times above it.
        ok("!! *** abyss IS MOSTLY NIGHT WITH RARE PASSES: its interior swings many-fold across half a minute ***",
            mx / mn > 4 && ab.filter((v) => v < mn * 2).length >= TIMES.length / 2,
            `its interior runs ${mn.toFixed(3)} to ${mx.toFixed(3)}, a ${(mx / mn).toFixed(1)}x swing, with ` +
            `${ab.filter((v) => v < mn * 2).length} of ${TIMES.length} samples still on the floor. A species ` +
            `whose events were continuous would show a small swing and a high floor; this one waits. The span ` +
            `is 20.5 s because abyss's slot at these knobs is 16.48 -- a shorter window can miss every pass ` +
            `and would measure the gate rather than the hero. *** THE LIMIT IS 4x AND THE MEASUREMENT IS ` +
            `${(mx / mn).toFixed(1)}x, WHICH IS NOT SLACK BUT A STATEMENT ABOUT WHICH HALF IS STABLE: *** the ` +
            `FLOOR is in every sample and barely moves, while the PEAK depends on whether one of four times ` +
            `happens to land on a pass -- six times read 31.8x and four read ${(mx / mn).toFixed(1)}x on the ` +
            `same shader. A bound set at the peak would be a row passing on lucky sample points, which is a ` +
            `defect this tree has had to repair twice. The floor and the count on it carry this row.`);

        // *** IT IS THE FLOOR THAT SAYS abyss IS DARK, NOT THE MEAN, and the difference is the whole species.
        // *** ONE pass out of four times pulls its average to three times its own floor, so a row comparing
        // averages would be right about the arithmetic and wrong about the hero. What abyss IS, is dark
        // BETWEEN its events -- and the figure for that is the FLOOR.
        //
        // *** AND THE COMPARISON IS AGAINST opal RATHER THAN A THIRD SPECIES, WHICH COST A FRAME AND CHANGED
        // THE CLAIM. *** A `still` frame stood here to be neutral, and being a third shader it cost a WGSL
        // compile this gate could not afford once abyss's four lane frames landed (see the budget note at the
        // top). Against still the numbers were 0.014 / 0.101 / 0.498; against opal alone they are the two
        // species this file is FOR, at the two ends of the one axis it is about.
        const opMean = op.reduce((a, b) => a + b, 0) / op.length, abMean = ab.reduce((a, b) => a + b, 0) / ab.length;
        ok("!! ...and it is the darkest BETWEEN its events while opal is never dark, which is the axis they bracket",
            opMin > mn * 10 && opMean > abMean * 4 && opMin > Math.max(...ab),
            `abyss's floor is ${mn.toFixed(3)} and opal's is ${opMin.toFixed(3)} -- ` +
            `${(opMin / mn).toFixed(0)}x -- and opal's DIMMEST sample is brighter than abyss's BRIGHTEST ` +
            `(${Math.max(...ab).toFixed(3)}), which is the part a level cannot fake: the two ranges do not ` +
            `overlap at all. Their MEANS are ${abMean.toFixed(3)} and ${opMean.toFixed(3)}, a ` +
            `${(opMean / abMean).toFixed(0)}x gap that UNDERSTATES the floor's ${(opMin / mn).toFixed(0)}x ` +
            `because abyss's one pass carries its average. abyss.ts: "the only hero whose default state is ` +
            `genuinely almost nothing happening. Still is quiet; this one is dark."`);

        // *** THE RIM IS THE FIGURE HERE, and abyss.ts argues for 1.70 against its own first try. *** A rim
        // term "peaks around a third of its coefficient once the fresnel and the membership have taken their
        // share -- so at 0.92 the silhouette was genuinely almost invisible and the species read as an empty
        // cell rather than as a dark one".
        const eAb = edgeQuartile(run.frames[F.abyss[NIGHT]]), eOp = edgeQuartile(run.frames[F.opal[NIGHT]]);
        const rAb = eAb / ab[NIGHT], rOp = eOp / op[NIGHT];
        say(`edge over interior on a night frame -- abyss ${rAb.toFixed(3)}, opal ${rOp.toFixed(3)}`);
        // VOICE_LIVE and not VOICE: the frames set a RAW knob that mh_live conditions before mh_surface sees
        // it (v4641), so the rim gain the SHADER computes is the roster's coefficient times the conditioned
        // signal. The row stayed green through the change because its bound is a RANKING, but the two numbers
        // it prints are quoted as the species' rims and a rim read off the wrong signal is the wrong rim.
        const rimAb = K.MH_SURFACE_KNOBS.abyss[0] + K.MH_SURFACE_KNOBS.abyss[1] * VOICE_LIVE;
        const rimOp = K.MH_SURFACE_KNOBS.opal[0] + K.MH_SURFACE_KNOBS.opal[1] * VOICE_LIVE;
        ok("!! *** abyss's EDGE OUTWEIGHS ITS INTERIOR, where opal's is swamped by it -- the roster's two rim extremes ***",
            rAb > 2 && rAb > rOp * 4 && rimAb > rimOp,
            `abyss's edge is ${rAb.toFixed(2)}x its own interior against opal's ${rOp.toFixed(2)}x -- ` +
            `${(rAb / rOp).toFixed(0)} times the ratio, on a species whose rim at this voice is ` +
            `${rimAb.toFixed(2)} against opal's ${rimOp.toFixed(2)} (read off the kit's own roster, not off ` +
            `a number typed here), at a time when abyss has no creature passing. It is what abyss.ts means by "the ` +
            `only thing in the frame during the long dark stretches". *** WHAT THIS ROW DOES NOT MEASURE IS ` +
            `THE WORD "HIGHEST". *** Two frames rank two heroes; "the highest rim in the roster" is a claim ` +
            `about eighteen and belongs to the gate that puts several on screen at one time. This file's ` +
            `earlier wording made that claim off a two-species comparison and off a THIRD species that has ` +
            `since gone for budget -- the ranking was never in the measurement either way.`);
    }
}

// =============================================================================================================
sec("2. *** OPAL: NO STROBE, EVER -- and the widest spread in the collection ***");
{
    if (!okRun) { ok("!! opal has frames", false, "the render did not produce them"); }
    else {
        const op = F.opal.map((i) => interiorMeanLight(run.frames[i]).mean);
        const ab = F.abyss.map((i) => interiorMeanLight(run.frames[i]).mean);
        const mn = Math.min(...op), mx = Math.max(...op);

        // *** NOTHING EVER SWITCHES ON, and opal.ts builds the whole species around it: *** play-of-colour
        // "is not a flicker; it is a slow shifting of where the light is coming from as the stone turns".
        // Each of the four lives is a sin SQUARED, for flat ends, on a FLOOR of 0.16 rather than a zero, "so
        // a flash at its dimmest is still faintly present and there is no moment of switching on" -- and the
        // four periods (14.3, 17.1, 19.6, 22.4) are mutually incommensurate so no two arrive together.
        //
        // The row is the CONTRAST WITH abyss rather than an absolute: both species have events, and what
        // separates them is whether the light ever leaves. abyss drops to its night floor between passes;
        // opal's dimmest sample over the same half-minute is still a large fraction of its brightest.
        ok("!! *** NO STROBE: opal's dimmest moment is a fraction of its brightest, where abyss's is an eighth ***",
            mx / mn < Math.max(...ab) / Math.min(...ab) / 2 && mn > 0.05,
            `opal swings ${(mx / mn).toFixed(1)}x across ${TIMES.length} times (${mn.toFixed(3)} to ` +
            `${mx.toFixed(3)}) against abyss's ${(Math.max(...ab) / Math.min(...ab)).toFixed(1)}x over the ` +
            `SAME times. Four lives on periods of 14.3, 17.1, 19.6 and 22.4 seconds, each a sin squared for ` +
            `flat ends and each on a floor of 0.16 rather than a zero. Stated against abyss rather than as a ` +
            `bound, because "never switches on" is a claim about a species that HAS events -- a hero with no ` +
            `events at all would pass any absolute version of this row.`);

        // *** AND THE SPREAD, WHICH IS WHY THIS SPECIES WAS PORTED FIRST OF THE REMAINING FOURTEEN. ***
        // opal carries the roster's highest default (0.7) and the one internal multiplier above the family
        // cap: spreadAmt = spread * MH_SPREAD * 1.30, which opal.ts says "takes the extremes to about
        // thirty-seven degrees of OKLAB hue at spread 1".
        const extremeDeg = 1.30 * K.MH_SPREAD * 180 / Math.PI;
        ok("!! opal's own multiplier puts its extremes at about 37 degrees of OKLab hue, past the family cap",
            Math.abs(extremeDeg - 37.2) < 0.5 && extremeDeg > K.MH_SPREAD * 180 / Math.PI,
            `1.30 x MH_SPREAD is ${extremeDeg.toFixed(2)} degrees against the family's own ` +
            `${(K.MH_SPREAD * 180 / Math.PI).toFixed(2)} -- opal.ts's "about thirty-seven degrees ... still ` +
            `one hue family by the rail's own definition, and the widest this collection ever goes". Its four ` +
            `flashes sit at four points across that, two either side of the anchor, at hue keys -1, -1/3, ` +
            `+1/3 and +1.`);

        const h = hueShift(run.frames[F.opalSpread[0]], run.frames[F.opalSpread[1]]);
        say(`opal spread 0 -> 1: hue ${h.dHueDeg.toFixed(2)} deg, lightness ${h.dL.toFixed(4)} over ${h.n} pixels`);
        ok("!! ...and on real pixels its spread turns further than any hero gated so far, without moving lightness",
            h.dHueDeg > 4.5 && h.dL < 0.02,
            `the body turns ${h.dHueDeg.toFixed(2)} degrees of hue while its lightness moves ` +
            `${h.dL.toFixed(4)} -- against still's 1.40 and comet's 3.71 measured next door. The MEAN is far ` +
            `below the 37-degree extreme and should be: most of the body is not sitting on a flash, and the ` +
            `four flashes pull in opposite directions by construction. What the row asserts is that opal ` +
            `spends more of the axis than anything else here, and spends it on HUE.`);
    }
}

// =============================================================================================================
sec("3. *** ABYSS'S CREATURE IS A PASSAGE, AND ITS THREE LANES TAKE THREE HUE STEPS ***");
{
    if (!okRun) { ok("!! abyss has its lane frames", false, "the render did not produce them"); }
    else {
        const fr = run.frames;
        const pk = (i) => interiorPeak(fr[i]);
        say(`interior peak -- night ${pk(F.abyss[NIGHT])}, third-lane pass ${pk(F.abyss[PASS_THIRD])}, ` +
            `first-lane pass ${pk(F.abyss[PASS_FIRST])}`);

        // *** THE ROW NEEDS THE CREATURE TO BE THE BRIGHTEST THING IN THE FRAME BEFORE IT CAN MEASURE WHERE
        // IT IS, and on this species that is not a given. *** The hotspot is the brightest interior pixel,
        // and on a NIGHT frame that pixel is the shell's own specular sitting in the same place every time.
        // So the two rows below run on the third lane's pass, whose peak is a multiple of the night's --
        // and the first lane's pass at 0.333 of its envelope is NOT used for position, because its peak is
        // within a few counts of the night's and its "hotspot" is the specular, not the creature. That is
        // the difference between a row about the hero and a row passing on a lucky sample point.
        const creatureIsFound = pk(F.abyss[PASS_THIRD]) > pk(F.abyss[NIGHT]) * 2;
        ok("!! the third lane's pass is what the hotspot is actually reading, not the shell's own catchlight",
            creatureIsFound,
            `its interior peak is ${pk(F.abyss[PASS_THIRD])} against a night frame's ${pk(F.abyss[NIGHT])}, ` +
            `${(pk(F.abyss[PASS_THIRD]) / pk(F.abyss[NIGHT])).toFixed(1)}x. The first lane's pass reads ` +
            `${pk(F.abyss[PASS_FIRST])} at 0.333 of its envelope, which is NOT enough to outrank the ` +
            `catchlight -- so it carries the hue row below and not the position row.`);

        // *** A CREATURE CROSSES, IT DOES NOT SWITCH ON IN PLACE. *** abyss.ts: it enters one side of the
        // volume and leaves by the other "over the whole life of its gesture, on a line hashed per pass, so
        // what the eye sees is something crossing rather than something switching on in place".
        //
        // The travel term is gp += dirA * mix(-reach, +reach, smoothstep(f.y)), and `drift` is the ONLY knob
        // that touches it: abyssReach = 0.62 + 0.30*drift, used nowhere else on this species. So the pair is
        // the same time, the same lane, the same pass, the same everything EXCEPT the length of the line the
        // creature is walking -- and a creature at a fixed point does not care how long a line it is not
        // walking. *** THAT IS WHY THIS IS A drift PAIR AND NOT TWO TIMES. *** Two times inside one pass
        // would also move the creature, and would move it under a body that merely brightened in place too,
        // because the lane envelope f.x changes the hotspot's neighbours; driving the travel term through
        // its OWN input isolates it.
        const movedOnPass = hotspotMove(fr[F.abyss[PASS_THIRD]], fr[F.abyssThirdDrift]);
        const movedOnNight = hotspotMove(fr[F.abyss[NIGHT]], fr[F.abyssNightDrift]);
        say(`hotspot under drift 0 -> 1 -- on the pass ${movedOnPass.toFixed(1)} px, on a night frame ` +
            `${movedOnNight.toFixed(1)} px, of a ${(0.62 * N3 / 2).toFixed(1)} px body radius`);
        ok("!! *** THE CREATURE IS SOMETHING CROSSING: lengthening its line moves it, and moves NOTHING on a night frame ***",
            movedOnPass >= 3 && movedOnNight === 0,
            `taking abyssReach from 0.62 to 0.92 moves the brightest point ${movedOnPass.toFixed(1)} px on ` +
            `the third lane's pass -- ${(movedOnPass / (0.62 * N3 / 2) * 100).toFixed(0)}% of the body ` +
            `radius -- while the SAME knob change on a night frame moves it ${movedOnNight.toFixed(1)} px. ` +
            `The night frame is the half that makes this a row about the passage: drift is a knob, and a ` +
            `knob that redrew the picture generally would move the hotspot whether or not anything was ` +
            `crossing. Predicted from the CPU half at u = 0.60: the creature sits at reach * (2*smoothstep(u) ` +
            `- 1) = 0.296 * reach along its line, so 0.62 -> 0.92 should carry it 0.089 of a unit, and the ` +
            `body's own radius is MH_R = ${K.MH_R.toFixed(3)}.`);

        // *** THE THREE LANES TAKE ONE HUE STEP EACH -- -1, 0, +1 -- SO TWO OF THEM TURN THE BODY OPPOSITE
        // WAYS. *** glowH accumulates eA * (lane - 1), and the hue the rail receives is that sum over the
        // lanes' own energy. On a single-lane pass there is exactly one term, so the direction of the turn
        // NAMES THE LANE. The third lane must turn it one way and the first the other, and the two nights in
        // between must turn it not at all.
        //
        // *** SIGNED, AND THAT IS THE ROW RATHER THAN A DETAIL. *** hueShift() next door takes |dh| per
        // pixel, which is right for "does the axis move the body" and useless here: under an absolute value
        // a hero whose every lane took the SAME step reads exactly like one whose lanes disagree, and so
        // does a hero with one lane. Measured, the signed pair reads the two passes at opposite signs while
        // the absolute pair reads them as two positive numbers that would not tell those three apart.
        const tThird = hueTurn(fr[F.abyss[PASS_THIRD]], fr[F.abyssThirdSpread]);
        const tFirst = hueTurn(fr[F.abyss[PASS_FIRST]], fr[F.abyssFirstSpread]);
        const aThird = hueShift(fr[F.abyss[PASS_THIRD]], fr[F.abyssThirdSpread]);
        const aFirst = hueShift(fr[F.abyss[PASS_FIRST]], fr[F.abyssFirstSpread]);
        say(`spread 0 -> 1 on a single-lane pass -- third lane ${tThird.deg.toFixed(2)} deg over ${tThird.n} ` +
            `px, first lane ${tFirst.deg.toFixed(2)} deg over ${tFirst.n} px`);
        ok("!! *** abyss's FIRST AND THIRD LANES TURN THE BODY OPPOSITE WAYS: three lanes, three hue steps ***",
            tThird.deg > 3 && tFirst.deg < -3 && Math.sign(tThird.deg) !== Math.sign(tFirst.deg),
            `the third lane carries the body ${tThird.deg.toFixed(2)} degrees of OKLab hue and the first ` +
            `carries it ${tFirst.deg.toFixed(2)} -- opposite signs, from the same knob, on the same species, ` +
            `at two times the CPU half picked because exactly one lane is passing at each. The absolute ` +
            `instrument reads these two as ${aThird.dHueDeg.toFixed(2)} and ${aFirst.dHueDeg.toFixed(2)}: ` +
            `two positive numbers that agree equally well with the hero, with all three lanes taking the ` +
            `SAME step, and with a species that had one lane. The lightness moves ` +
            `${aThird.dL.toFixed(4)} and ${aFirst.dL.toFixed(4)} across the same pair, which is the rail's ` +
            `own promise that spread is a hue axis and nothing else.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nTHE TWO ENDS OF THE COLLECTION'S ONE AXIS: opal, whose four flashes are never all absent and whose " +
    "spread is the widest murmur ships, and abyss, which is dark for sixteen seconds at a time on purpose " +
    "and carries a rim its own file argues for twice over, because the edge is all there is between passes. " +
    "\nWHAT IS NOT CLAIMED HERE: the surface all eighteen share and the rim RANKING across them (gate one), " +
    "comet's orbit and droplet's body (gate two), and the kit under all of them " +
    "(tools/ship/murmurKit-selfcheck.mjs). TWELVE species remain.");
process.exit(fails ? 1 : 0);
