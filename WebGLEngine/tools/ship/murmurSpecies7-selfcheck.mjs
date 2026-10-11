// WebGLEngine/tools/ship/murmurSpecies7-selfcheck.mjs -- v4636
//
// Run: node tools/ship/murmurSpecies7-selfcheck.mjs
//
// GATE SEVEN OVER THE SPECIES: GEODE, the tenth of murmur's eighteen and the second of the two whose
// interior is SOLVED rather than marched. Its own file opens by rejecting its first build, in terms this
// port has now met three times: "A FACET IS A PLANE, AND THE FIRST BUILD'S WASN'T. It partitioned the volume
// by which of six DIRECTIONS a point was most aligned with ... the partition was then integrated along the
// view ray, and integrating a hard-edged structure through five samples averages exactly the angularity that
// was the point." comet's head fell between the taps for the same reason; droplet's heart was solved for the
// same reason; this is the third.
//
// SO THE CRYSTAL IS A REAL CONVEX SOLID, INTERSECTED. Four axes make eight planes -- a slab per axis, with
// different offsets on the two sides so the gem is irregular rather than a symmetric octahedron -- and the
// ray is tested by the slab method: the entry is the LAST plane the ray crosses going in, the exit the FIRST
// it crosses coming out. AND THE ENTRY PLANE IS THE FACE YOU ARE LOOKING AT, which is the whole species: its
// normal shades it against the key, so as the solid turns, faces come up bright one at a time and roll away
// into near-darkness. Nothing animates that; the rotation does all of it.
//
// *** ITS SIBLING FATHOM SHIPPED IN THE SAME ROUND AND IS GRADED NEXT DOOR, IN murmurSpecies6-selfcheck.mjs,
// AND THE SPLIT IS A BUDGET MEASUREMENT RATHER THAN A JUDGEMENT ABOUT THE TWO. *** They were written as one
// gate and it came in at 5,064 ms against a 3,000 ms sweep budget -- 69% over, which means it would not have
// run at ship time AT ALL. The cost is compiles, measured: one species and one frame is 931 ms and each
// ADDITIONAL species about 280. Trimming the shared control from ten species to five landed at 3,499 and to
// four at 3,161 -- both still over, with no room for the drift this box shows between runs. Two gates of two
// subjects each is the shape the arithmetic allows. Gate six's header carries the same note.
//
// *** TWO INSTRUMENTS WERE BUILT FOR THIS GATE AND BOTH WERE REJECTED. THEY ARE WRITTEN UP IN SECTION 1,
// WITH THEIR NUMBERS, because a rejected instrument that leaves no trace gets rebuilt by the next person --
// which is why tools/ship/murmurSpeciesFrames.mjs carries the same kind of note on radialScale. ***
"use strict";
import * as K from "../../render/murmurKit.mjs";
import { N3, VOICE, sp, renderSpecies, light, interiorPeak, hotspot } from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSpecies7-selfcheck -- geode's cut stone, eight planes and the face you are looking at\n");

// *** EVERY FRAME IN THIS GATE RUNS AT glow 0.15, AND THAT IS A ROW'S WORTH OF REASONING, NOT A SETTING. ***
// v4634 caught a density row in gate five measuring the TONE CURVE instead of the physics: at the default
// glow the frame peaked at 646 of 765, and the row read 0.680 with absorption and 0.558 with absorption
// DELETED -- passing harder on the broken shader, because the display was bending the curve more than the
// material was. Every row here reads structure -- where a knob's light lands, which pixels a frame lights --
// and structure is exactly what a saturating display destroys. At 0.15 the peaks below sit between 131 and
// 379 of 765, where the curve is still straight. The peaks are printed on the rows for that reason.
const DIM = 0.15;
const T = 5.1;
// Every knob is named on EVERY frame because setKnobs writes only the names present in its argument, so a
// knob one frame sets and the next does not mention silently keeps the previous frame's value.
const BASE = { glint: 0, density: 0.5, fold: 0.5, spread: 0, glow: DIM,
               layers: 0.5, parallax: 0.5, murk: 0.0, facet: 0.5, glim: 0.0, stone: 0.5 };
const GE = (t, voice, extra = {}) => sp("geode", t, voice, { ...BASE, ...extra });

// *** THE FOIL IN SECTION 2 IS ABYSS, AND IT WAS PICKED BY MEASUREMENT. *** That section needs a species
// whose bright place TRAVELS, as the contrast to geode's pinned one. Over the same six times, hotspot travel
// runs opal 16.28 px, comet 12.04, tempest 11.40, abyss 8.60, fathom 2.00, and still, droplet and geode 1.00
// or less. opal is the most extreme and abyss is the cheapest that still makes the argument at 8.6x -- and
// the budget above buys exactly one extra compile, so it buys abyss.
const CONTROL_TRAVEL = "abyss";
const TIMES = [0, 3.4, 6.8, 10.2, 13.6, 17.0];

const FRAMES = [
    GE(T, VOICE, { facet: 0.0, glim: 0.0 }), GE(T, VOICE, { facet: 0.0, glim: 1.0 }), // 0,1
    GE(T, VOICE, { facet: 1.0, glim: 0.0 }), GE(T, VOICE, { facet: 1.0, glim: 1.0 }), // 2,3
    ...TIMES.map((t) => GE(t, VOICE)),                                     // 4.. 9  the stone turning
    ...TIMES.map((t) => sp(CONTROL_TRAVEL, t, VOICE, BASE)),               // 10..15 the foil that travels
    GE(T, VOICE, { stone: 0.0 }), GE(T, VOICE, { stone: 1.0 }),            // 16,17
];
const F = { s0g0: 0, s0g1: 1, s1g0: 2, s1g1: 3, geoT: 4, travT: 10, stLo: 16, stHi: 17 };
const run = await renderSpecies(FRAMES);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) ok("!! the species render ran", false, `could not render: ${run.reason || "frames " + (run.frames ? run.frames.length : "none")}`);
const fr = (i) => run.frames[i];
const GEODE_TIMES = TIMES;

// ---- the measurements this gate needs and no other gate has -------------------------------------------------
const totalLight = (px) => { let s = 0; for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) s += light(px, x, y); return s; };
// How FEW pixels carry half of the light one knob added. A line concentrates; a wash does not.
const addedHalf = (a, b) => {
    const d = [];
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) d.push(light(b, x, y) - light(a, x, y));
    d.sort((p, q) => q - p);
    const tot = d.reduce((p, q) => p + q, 0);
    let acc = 0, k = 0; while (k < d.length && acc < tot * 0.5) { acc += d[k]; k++; }
    return { px: k, share: k / d.length, tot, top: d[0] };
};
// THE FOOTPRINT: the pixels a frame lights above a threshold read off its OWN distribution, so a frame
// that is merely brighter has the same one. For geode this set is decided by where the ray's chord through
// the solid is positive -- by the PLANES -- and the key light cannot move it, which is the whole reason
// section 5 uses it.
const footprint = (px, q = 0.90) => {
    const P = [];
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
        if (Math.hypot(dx, dy) > 0.55) continue;
        P.push([y * N3 + x, light(px, x, y)]);
    }
    const S = P.map((p) => p[1]).sort((a, b) => a - b), th = S[Math.floor(S.length * q)];
    return new Set(P.filter((p) => p[1] > th).map((p) => p[0]));
};
const jaccardDistance = (a, b) => {
    let inter = 0; for (const v of a) if (b.has(v)) inter++;
    return 1 - inter / (a.size + b.size - inter);
};

// The radius holding 90% of the light that stands above the murk floor -- how big the lit solid is.
const litExtent = (px, floorQ = 0.75) => {
    const P = [];
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1, rr = Math.hypot(dx, dy);
        if (rr > 0.62) continue; P.push([rr, light(px, x, y)]);
    }
    const S = P.map((p) => p[1]).sort((a, b) => a - b), fl = S[Math.floor(S.length * floorQ)];
    const L = P.filter((p) => p[1] > fl).map((p) => [p[0], p[1] - fl]).sort((a, b) => a[0] - b[0]);
    const tot = L.reduce((a, b) => a + b[1], 0);
    let acc = 0; for (const [rr, v] of L) { acc += v; if (acc >= tot * 0.9) return rr; }
    return 0.62;
};
// =============================================================================================================
sec("1. *** GEODE'S EDGE IS A LINE, AND ITS WIDTH IS SET BY THE SECOND-BEST ENTRY PLANE ***");
{
    if (!okRun) { ok("!! geode's edge frames rendered", false, "the render did not produce them"); }
    else {
        const soft0 = addedHalf(fr(F.s0g0), fr(F.s0g1));
        const soft1 = addedHalf(fr(F.s1g0), fr(F.s1g1));
        const sB = K.MH_GEODE.softB, sK = K.MH_GEODE.softK;
        say(`glim 0->1 adds ${soft0.tot.toFixed(3)} at facet 0 (half in ${soft0.px} px) and ` +
            `${soft1.tot.toFixed(3)} at facet 1 (half in ${soft1.px} px); peaks ` +
            `${interiorPeak(fr(F.s0g1))} / ${interiorPeak(fr(F.s1g1))} of 765`);

        // *** THIS IS THE ROW THAT SAYS THE SOLID IS SOLVED AND NOT MARCHED, AND IT SAYS IT THROUGH A
        // QUANTITY A MARCH DOES NOT HAVE. *** The slab method finds the LAST plane the ray crosses going in;
        // the shader also keeps the RUNNER-UP, and two entry planes nearly equally last means the ray is
        // arriving at an EDGE. eMix = exp(-(tIn - tIn2)/soft) is that closeness, and `glim` paints it. A ray
        // march has a tIn -- it is where the density starts -- but it has no tIn2 at all, because there is
        // no second-best anything in an integral. So the existence of a bright LINE, and its width tracking
        // `soft`, is a direct readout of the two-deep ranking.
        const narrow = soft0.px / Math.max(soft1.px, 1);
        const predicted = (sB - 0 * sK) / (sB - sK);
        ok("!! *** THE EDGE LINE NARROWS WHEN `soft` NARROWS -- the runner-up entry plane, measured ***",
            soft0.share < 0.03 && soft1.share < 0.03 && narrow > 1.6 && soft0.tot > 0 && soft1.tot > 0,
            `half the light glim adds lands in ${soft0.px} pixels of ${N3 * N3} ` +
            `(${(soft0.share * 100).toFixed(2)}%) at facet 0, and in ${soft1.px} ` +
            `(${(soft1.share * 100).toFixed(2)}%) at facet 1 -- x${narrow.toFixed(2)} narrower against a ` +
            `soft that shrinks ${sB} -> ${(sB - sK).toFixed(3)}, x${predicted.toFixed(2)}. Both under 3% of ` +
            `the frame, which is what makes the word "line" a measurement. A LINE IS NOT A GLOW: if glim ` +
            `were a wash over the stone its light would spread across the hundreds of pixels the stone ` +
            `covers, and this row would read tens of percent.`);

        // *** TWO INSTRUMENTS FOR "HARD-EDGED, NOT MARCHED" WERE BUILT BEFORE THIS ONE AND BOTH WERE
        // REJECTED. Writing them down, with their numbers, because a rejected instrument that leaves no
        // trace gets rebuilt by the next person -- which is why murmurSpeciesFrames.mjs carries the same
        // kind of note on radialScale.
        //
        // (a) GRADIENT CONCENTRATION -- the share of the frame's total |grad light| held by its steepest 3%
        //     of pixels. It read geode 27.0% against nebula 15.3% and opal 14.1%, which looked decisive
        //     until the other six were run: still 75.1%, comet 72.1%, limn 57.2%, droplet 33.7%. It does
        //     not measure hardness. It measures SPARSENESS -- a nearly dark frame with one small bright
        //     feature concentrates its gradient trivially -- and still and comet are exactly that. A row
        //     built on it would have ranked the two softest species in the set above the only hard one.
        //
        // (b) EDGE WIDTH -- pixels for the outermost 80%-to-20% fall along each of 64 rays. geode came out
        //     the WIDEST of all ten, 12.96 px against nebula's 9.36 and limn's 0.96. Correct, and about the
        //     wrong subject: geode's OUTLINE is deliberately soft (bodyG ramps over gScale * ${K.MH_GEODE.bodyEdge}
        //     because the chord goes to zero at every silhouette edge) and the murk halo around the stone
        //     dominates the outermost fall. The hard edges in this species are INTERNAL, where two faces
        //     meet, and an instrument that walks in from outside never reaches them.
        //
        // Both failures are the same failure, and it is this session's most frequent one: an instrument
        // confounded by something other than its subject. The row above is not confounded because it does
        // not measure geode against other species at all -- it measures geode against ITSELF with one
        // constant changed, and the quantity it reads (where a knob's added light lands) has no other cause.
        say("REJECTED INSTRUMENTS, kept in the source with their numbers: gradient concentration measured " +
            "sparseness (still 75.1% and comet 72.1% beat geode's 27.0%), and edge width measured the murk " +
            "halo (geode widest of ten at 12.96 px). See the note above this line.");
    }
}

// =============================================================================================================
sec("2. *** THE FACES COME UP ONE AT A TIME, AND NOTHING TRAVELS ***");
{
    if (!okRun) { ok("!! the rotation series rendered", false, "the render did not produce them"); }
    else {
        const gPk = GEODE_TIMES.map((_, i) => interiorPeak(fr(F.geoT + i)));
        const oPk = GEODE_TIMES.map((_, i) => interiorPeak(fr(F.travT + i)));
        const move = (off) => {
            const h = GEODE_TIMES.map((_, i) => hotspot(fr(off + i)));
            let m = 0; for (let i = 1; i < h.length; i++) m = Math.max(m, Math.hypot(h[i][0] - h[i - 1][0], h[i][1] - h[i - 1][1]));
            return m;
        };
        const gMove = move(F.geoT), oMove = move(F.travT);
        const gSwing = Math.max(...gPk) / Math.max(Math.min(...gPk), 1);
        const oSwing = Math.max(...oPk) / Math.max(Math.min(...oPk), 1);
        say(`geode peaks over ${GEODE_TIMES[GEODE_TIMES.length - 1]} s: [${gPk.join(", ")}] swing ` +
            `x${gSwing.toFixed(2)}, hotspot moves at most ${gMove.toFixed(2)} px`);
        say(`${CONTROL_TRAVEL} peaks over the same times: [${oPk.join(", ")}] swing x${oSwing.toFixed(2)}, ` +
            `hotspot moves at most ${oMove.toFixed(2)} px`);

        // *** NOTHING ANIMATES THE FACES. THE ROTATION DOES ALL OF IT. *** The entry plane IS the face you
        // are looking at, and its normal shades it against the key, so as the solid turns a face comes up
        // bright and rolls away into near-darkness. The signature of that is peculiar and worth stating
        // exactly: the brightness swings hard while the bright PLACE does not move, because the stone is
        // centred and whichever face is facing you is in front of you. A species whose brightness is an
        // EVENT AT A PLACE looks the opposite, and abyss is that foil -- its rare glows are born somewhere in
        // the dark and its hotspot jumps across the body between them.
        //
        // *** THE THIRD CONJUNCT IS THERE BECAUSE THE FIRST TWO WERE NOT ENOUGH, AND A SABOTAGE PROVED IT. ***
        // A frozen stone under a MOVING KEY gives exactly "brightness swings, hotspot pinned" -- mhKey turns
        // with time for every species in this engine, so the first two halves are satisfied by a shader in
        // which the crystal never rotates at all. Halting the spin drift alone walked straight through the
        // row. So the row also reads the FOOTPRINT: the pixels the frame lights above its own ninetieth
        // percentile. That set is decided by where the chord is positive -- by the PLANES -- and the key
        // cannot touch it, so it moves when the SOLID turns and not when the LIGHT does. Its smallest
        // step-to-step change is the statistic, not its largest: a stone that turns steadily never has a
        // quiet step, and it is the quiet steps that a half-frozen shader produces.
        //
        //     live 0.409   spin drift halted 0.167   both rotation angles halted 0.149
        //
        // Every half is asserted, because each alone is satisfiable by something dull: a frame that never
        // changes passes the pinned hotspot, a flickering mess passes the swing, and a rigid stone under a
        // sweeping key passes both.
        const F5 = GEODE_TIMES.map((_, i) => footprint(fr(F.geoT + i)));
        let minStep = Infinity;
        for (let i = 1; i < F5.length; i++) minStep = Math.min(minStep, jaccardDistance(F5[i - 1], F5[i]));
        say(`geode footprint ${F5[0].size} px above its own p90; smallest step-to-step change ${minStep.toFixed(3)}`);
        ok("!! *** GEODE'S BRIGHTNESS SWINGS, ITS BRIGHT PLACE STAYS PUT, AND ITS FOOTPRINT NEVER RESTS ***",
            gSwing > 2.0 && gMove <= 2.0 && oMove > gMove * 4 && minStep > 0.30,
            `geode's interior peak runs x${gSwing.toFixed(2)} across ${GEODE_TIMES.length} times spanning ` +
            `${GEODE_TIMES[GEODE_TIMES.length - 1]} s while its hotspot never moves more than ` +
            `${gMove.toFixed(2)} px of ${N3}. ${CONTROL_TRAVEL}, over the SAME times with the same rig, swings ` +
            `x${oSwing.toFixed(2)} -- comparable -- and moves ${oMove.toFixed(2)} px, ` +
            `x${(oMove / Math.max(gMove, 0.01)).toFixed(0)} further. The swings being comparable is what ` +
            `makes the travel the discriminator rather than a side effect of one species being livelier. ` +
            `AND THE SOLID IS DEMONSTRABLY TURNING: the smallest step-to-step change in the footprint is ` +
            `${minStep.toFixed(3)}, against 0.167 with the spin drift halted and 0.149 with both rotation ` +
            `angles halted -- the footprint is a set the key light cannot reach, so only the PLANES can move it.`);

        // The stone is a solid whose silhouette its own planes decide, and `stone` scales the planes. The
        // measured growth lags the constant because the murk halo around the crystal does not scale with it
        // -- which is why the row bounds the direction and the constants, and does not claim the ratio.
        const eLo = litExtent(fr(F.stLo)), eHi = litExtent(fr(F.stHi));
        const sPred = (K.MH_GEODE.scaleB + K.MH_GEODE.scaleK) / K.MH_GEODE.scaleB;
        ok("!! ...and the solid's size is its own: `stone` grows the lit body, short of the plane offsets",
            eHi > eLo * 1.05 && eHi / eLo < sPred,
            `stone 0->1 takes the lit extent from ${eLo.toFixed(4)} to ${eHi.toFixed(4)} of the half-frame, ` +
            `x${(eHi / eLo).toFixed(4)}, against plane offsets that scale ${K.MH_GEODE.scaleB} -> ` +
            `${(K.MH_GEODE.scaleB + K.MH_GEODE.scaleK).toFixed(2)}, x${sPred.toFixed(4)}. THE LAG IS THE ` +
            `HONEST PART and it is bounded on both sides: the murk the stone sits in does not scale with ` +
            `the stone, so a measurement that came back at the full x${sPred.toFixed(2)} would mean the ` +
            `instrument was reading the glass rather than the crystal.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nGEODE: eight planes by the slab method, so that a facet is a plane instead of an average of " +
    "one. The entry plane is the face you are looking at; the runner-up entry plane is its edge, and " +
    "that runner-up is the quantity a ray march does not have at all." +
    "\nWHAT IS NOT CLAIMED HERE: fathom, its sibling from the same round " +
    "(tools/ship/murmurSpecies6-selfcheck.mjs), the surface all eighteen share and limn's edge " +
    "(…murmurSpecies-selfcheck.mjs), comet's orbit (…Species2), opal and abyss (…Species3), " +
    "droplet's body (…Species4), nebula and tempest (…Species5), and the kit under all of them " +
    "(tools/ship/murmurKit-selfcheck.mjs). EIGHT species remain: aura, prism, duet, arc, flux, helix, " +
    "sol, chorus.");
process.exit(fails ? 1 : 0);
