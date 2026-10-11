// WebGLEngine/tools/ship/murmurSpecies5-selfcheck.mjs -- v4634
//
// Run: node tools/ship/murmurSpecies5-selfcheck.mjs
//
// GATE FIVE OVER THE SPECIES: NEBULA AND TEMPEST, the seventh and eighth of murmur's eighteen and the only
// two with NO OBJECT INSIDE THE GLASS AT ALL. nebula.ts: "EVERY OTHER HERO PUTS SOMETHING INSIDE THE BODY and
// lets the medium carry it. This one deletes the something. The mist IS the species."
//
// *** THEY ARE THE PAIR murmur ITSELF NAMES, WHICH IS WHY THEY SHIP TOGETHER. *** tempest.ts opens: "NEBULA'S
// SIBLING AND ITS OPPOSITE TEMPERAMENT. Both are domain-warped mist and everything else about them differs.
// Nebula is lit evenly from within and its business is DEPTH. This one is lit from INSIDE ITS OWN FLASHES,
// its density runs harder so the cloud has real dark in it, and its business is ENERGY." Every row below is
// a comparison between the two rather than a bound on one, because that is what the source supports -- the
// same shape that made gate three's opal and abyss rows measurements instead of thresholds.
//
// THEY ALSO CALL A BYTE-IDENTICAL KIT SET -- diffed across the two source files -- and they are the ONLY two
// of the eighteen that never call mh_medium, because the density field IS the subject rather than the thing
// a subject sits in. So this pair cost the kit nothing: every function they need was already ported and
// graded against a real GPU by v4629 and v4632.
//
// A FIFTH GATE RATHER THAN MORE ROWS NEXT DOOR, and the reason is the budget arithmetic this tree has now
// been caught by twice. Gate one sits at 2,506 ms with 494 ms spare and a species costs about 375 -- one WGSL
// compile plus a render -- so putting these two there lands it at roughly 3,250 and OVER. A gate over budget
// does not run at ship time AT ALL, which v4633 spent a whole round proving is not a theoretical hazard: it
// found tools/ship/inputSets-selfcheck.mjs red for nine rounds because it was 27 ms over.
"use strict";
import * as K from "../../render/murmurKit.mjs";
import { N3, VOICE, VOICE_LIVE, sp, renderSpecies, interiorMeanLight, interiorSpread, interiorPeak, edgeQuartile,
         ringChange, hueShift } from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSpecies5-selfcheck -- nebula's depth and tempest's energy, the two heroes made of weather\n");

// *** THE THREE TIMES ARE READ OFF tempest's OWN CLOCKS, NOT SPACED EVENLY -- the lesson gate three learned
// on abyss. *** render/murmurKit.mjs's mhFlourish is the same envelope the shader runs, so the CPU half says
// exactly which lightning lane is firing when. At the CONDITIONED voice the energy term is 0.85 * 0.30 =
// 0.255 -- VOICE_LIVE and not VOICE, because since v4641 the frames set a RAW knob that mh_live conditions
// before any species sees it, and a prediction built on the raw number would name lanes the shader is not
// firing. Grading against it read the interior at 0.4067 where the row wanted the calm frame dimmest. So the two
// slots run at 2.9 and 4.3 seconds scaled by 1/(1 + 1.30 * energy) = 0.751 -- 2.178 s and 3.229 s:
//
//     t = 0.7    lane 0 at 0.000, lane 1 at 0.000   -- calm, the state this species is built to sit in
//     t = 3.6    lane 0 at 0.995, lane 1 at 0.000   -- ONE flash, the first lane
//     t = 5.2    lane 0 at 0.000, lane 1 at 0.992   -- ONE flash, the OTHER lane
//
// An evenly spaced set would also have given three moments, with no way to say which lane made any of them.
const RATE = 1 / (1 + 1.30 * 0.85 * VOICE_LIVE);
const SLOT0 = 2.9 * RATE, SLOT1 = 4.3 * RATE;
const TIMES = [0.7, 3.6, 5.2];
const CALM = 0, LANE0 = 1, LANE1 = 2;

// TEN FRAMES AND TWO SHADERS. The base frames run at glint 0 so the glint pairs below are a clean on/off of
// the buried gesture and nothing else; `spread` is named on every frame because setKnobs writes only the
// names present, and a knob one frame sets and the next does not mention keeps the first frame's value.
// `glow` is named on every frame for the same reason spread is: setKnobs writes only the names present, and
// section 6 drives glow deliberately -- an unnamed one would leak its 0.15 into whatever nebula frame ran next.
const NB = (t, extra = {}) => sp("nebula", t, VOICE, { glint: 0, density: 0.5, fold: 0.5, spread: 0, glow: 1, ...extra });
const TM = (t, extra = {}) => sp("tempest", t, VOICE, { glint: 0, density: 0.5, fold: 0.5, spread: 0, glow: 1, ...extra });
// *** SECTION 6 RUNS AT glow 0.15 AND THAT IS THE ROW, NOT A SETTING -- see the note there. ***
const DIM = 0.15;
const FRAMES = [
    ...TIMES.map((t) => NB(t)),
    ...TIMES.map((t) => TM(t)),
    NB(TIMES[LANE0], { glint: 1 }),
    TM(TIMES[LANE0], { glint: 1 }),
    NB(TIMES[LANE0], { spread: 1 }),
    TM(TIMES[LANE0], { spread: 1 }),
    // the fold pair (section 5) and the density ladder (section 6), on nebula alone -- one species is enough
    // for both, because what they measure is the march's physics rather than either hero's temperament.
    NB(TIMES[LANE0], { fold: 0 }),
    NB(TIMES[LANE0], { fold: 1 }),
    NB(TIMES[LANE0], { density: 0, glow: DIM }),
    NB(TIMES[LANE0], { density: 0.5, glow: DIM }),
    NB(TIMES[LANE0], { density: 1, glow: DIM }),
];
const F = { neb: [0, 1, 2], tem: [3, 4, 5], nebGlint: 6, temGlint: 7, nebSpread: 8, temSpread: 9,
            fold0: 10, fold1: 11, dens: [12, 13, 14] };
const run = await renderSpecies(FRAMES);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) ok("!! the species render ran", false, `could not render: ${run.reason || "frames " + (run.frames ? run.frames.length : "none")}`);

// =============================================================================================================
sec("1. *** THE MIST IS THE SPECIES: a cloud, not a soft gradient with noise on it ***");
{
    if (!okRun) { ok("!! the mist heroes have frames", false, "the render did not produce them"); }
    else {
        const nb = interiorSpread(run.frames[F.neb[LANE0]]);
        const tm = interiorSpread(run.frames[F.tem[LANE0]]);
        say(`interior percentiles -- nebula p10 ${nb.p10.toFixed(4)} median ${nb.median.toFixed(4)} p90 ` +
            `${nb.p90.toFixed(4)} (${nb.contrast.toFixed(1)}x); tempest p10 ${tm.p10.toFixed(4)} median ` +
            `${tm.median.toFixed(4)} p90 ${tm.p90.toFixed(4)} (${tm.contrast.toFixed(1)}x)`);

        // *** THE GLINT IS OFF IN BOTH OF THESE FRAMES, WHICH IS WHAT MAKES THIS A ROW ABOUT THE MIST. ***
        // Every other ported hero puts an object in the glass and lets the medium carry it; delete the object
        // and what is left is a floor. Here the buried gesture is at zero and the interior is still fully
        // structured, because there was never an object -- nebula.ts: "This one deletes the something."
        ok("!! *** BOTH READ AS CLOUD WITH THEIR BURIED GESTURE SWITCHED OFF: structure, not a floor ***",
            nb.contrast > 3 && tm.contrast > 3 && nb.median > 0.05 && tm.median > 0.05,
            `with glint at 0 the interiors still run ${nb.contrast.toFixed(1)}x and ${tm.contrast.toFixed(1)}x ` +
            `from their tenth to their ninetieth percentile. A MEAN CANNOT SAY THIS -- a smooth gradient and ` +
            `a cloud can carry the same average, which is nebula.ts's own statement of the design question: ` +
            `whether five samples down a refracted ray "can make a cloud read as a cloud rather than as a ` +
            `soft gradient with noise on it". The percentiles are the answer and the mean is not.`);

        // *** AND TEMPEST HAS REAL DARK WHERE NEBULA DOES NOT, which is the sibling difference stated as two
        // numbers. *** tempest's density smoothstep runs (-0.12, 0.46) against nebula's (-0.20, 0.30), so its
        // lower edge sits further up and more of the noise falls into the gap; and it absorbs at 3.60 against
        // 3.10. tempest.ts: "its density runs harder so the cloud has real dark in it" -- and the dark is
        // where the lightning has somewhere to be seen against.
        ok("!! ...and TEMPEST's cloud has real dark in it where nebula's is evenly lit -- twice the contrast",
            tm.contrast > nb.contrast * 1.5 && tm.p10 < nb.p10,
            `tempest runs ${tm.contrast.toFixed(1)}x against nebula's ${nb.contrast.toFixed(1)}x, and its ` +
            `DARK end is genuinely darker: p10 ${tm.p10.toFixed(4)} against ${nb.p10.toFixed(4)}. Stated as ` +
            `a ratio of contrasts rather than as two absolute levels, because the absolutes move with the ` +
            `interior gain (6.20 against 3.30) while the SHAPE of the distribution is what the density curve ` +
            `sets. Its smoothstep is (-0.12, 0.46) against nebula's (-0.20, 0.30) and it absorbs at 3.60 ` +
            `against 3.10 -- two constants, transcribed, and this is what they buy.`);
    }
}

// =============================================================================================================
sec("2. *** TEMPEST'S ONE INVIOLABLE RULE: the flickers live deep and never reach the surface ***");
{
    if (!okRun) { ok("!! the glint pair rendered", false, "the render did not produce them"); }
    else {
        const RADII = [0.25, 0.45, 0.62, 0.78];
        const tRow = RADII.map((r) => ringChange(run.frames[F.tem[LANE0]], run.frames[F.temGlint], r).mean);
        const nRow = RADII.map((r) => ringChange(run.frames[F.neb[LANE0]], run.frames[F.nebGlint], r).mean);
        say(`ring change under glint 0 -> 1, by radius ${RADII.join(" / ")} --`);
        say(`   tempest ${tRow.map((v) => (v * 100).toFixed(2) + "%").join("  ")}`);
        say(`   nebula  ${nRow.map((v) => (v * 100).toFixed(2) + "%").join("  ")}`);

        // *** tempest.ts CALLS THIS THE SPECIES' ONE INVIOLABLE RULE, and it is a number: "A depth mask kills
        // any flash outside 0.62 of the radius outright." *** The mask is 1 - smoothstep(0.35, 0.62, |p|),
        // which is EXACTLY zero at and beyond 0.62 -- not small, zero -- so however bright the lightning
        // gets it cannot light the shell. tempest.ts: that mask is "the difference between a storm in a jar
        // and a novelty lamp".
        //
        // *** AND NEBULA IS THE CONTROL THAT MAKES IT A MEASUREMENT. *** A row asserting only that tempest
        // reads zero out there would pass just as happily if the instrument were blind at that radius, or if
        // the knob did nothing at all. nebula's buried glint has NO depth mask -- the same knob, the same
        // rings, the same frame size -- and it moves them. So the zero is tempest's, not the ring's.
        const outer = RADII.map((r, i) => [r, tRow[i], nRow[i]]).filter(([r]) => r >= 0.62);
        ok("!! *** THE LIGHTNING CANNOT LIGHT THE SHELL: tempest is EXACTLY zero at 0.62 and out, where nebula is not ***",
            outer.every(([, t]) => t === 0) && nRow[RADII.indexOf(0.62)] > 0.02 && tRow[0] > 0.5,
            `at 0.62 and 0.78 of the radius tempest's rings move ${outer.map(([, t]) => (t * 100).toFixed(2) + "%").join(" and ")} ` +
            `-- exactly zero, because 1 - smoothstep(0.35, 0.62, |p|) IS zero there -- while the same knob ` +
            `moves nebula's 0.62 ring by ${(nRow[RADII.indexOf(0.62)] * 100).toFixed(2)}%. Inside, tempest's ` +
            `own 0.25 ring moves ${(tRow[0] * 100).toFixed(0)}%, so the knob is far from inert. THREE THINGS ` +
            `ARE LOAD-BEARING and a row missing any one of them would pass on a broken shader: the zero ` +
            `outside, the sibling showing light IS visible at that radius, and the large change inside.`);

        ok("  ...and the shell's own edge is untouched to the last digit the readback carries",
            edgeQuartile(run.frames[F.tem[LANE0]]) === edgeQuartile(run.frames[F.temGlint]),
            `the edge quartile reads ${edgeQuartile(run.frames[F.tem[LANE0]]).toFixed(6)} at glint 0 and ` +
            `${edgeQuartile(run.frames[F.temGlint]).toFixed(6)} at glint 1 -- identical, on 8-bit pixels. ` +
            `A mask that merely ATTENUATED the flash rather than killing it would leave a difference here.`);
    }
}

// =============================================================================================================
sec("3. *** TWO LANES, AND WHAT THE SOURCE SAYS ABOUT THEM IS ALMOST TRUE ***");
{
    if (!okRun) { ok("!! the lane frames rendered", false, "the render did not produce them"); }
    else {
        const env = (t, lane, slot) => K.mhFlourish(t, lane, slot).env;
        const lanes = TIMES.map((t) => [env(t, 21.0, SLOT0), env(t, 27.0, SLOT1)]);
        const peaks = F.tem.map((i) => interiorPeak(run.frames[i]));
        const means = F.tem.map((i) => interiorMeanLight(run.frames[i]).mean);
        say(`tempest by lane state -- ${TIMES.map((t, i) => `t=${t} [${lanes[i].map((v) => v.toFixed(3)).join(", ")}] ` +
            `mean ${means[i].toFixed(4)}`).join("; ")}`);

        // The CPU half picks the times and the GPU has to agree: the calm moment must be the dimmest of the
        // three, and each single-lane moment must be brighter than it.
        ok("!! *** THE CPU HALF NAMES THE LANE AND THE PIXELS AGREE: calm is dimmest, either lane lifts it ***",
            means[CALM] < means[LANE0] && means[CALM] < means[LANE1] &&
            lanes[CALM][0] < 0.01 && lanes[CALM][1] < 0.01 && lanes[LANE0][0] > 0.9 && lanes[LANE1][1] > 0.9,
            `at t=${TIMES[CALM]} both envelopes are under 0.01 and the interior reads ${means[CALM].toFixed(4)}; ` +
            `at t=${TIMES[LANE0]} lane 0 alone is at ${lanes[LANE0][0].toFixed(3)} and it reads ` +
            `${means[LANE0].toFixed(4)}; at t=${TIMES[LANE1]} lane 1 alone is at ${lanes[LANE1][1].toFixed(3)} ` +
            `and it reads ${means[LANE1].toFixed(4)}. The times were chosen from mhFlourish and the render ` +
            `was not consulted until afterwards, which is what stops this being a row fitted to its own frames.`);

        // *** AND HERE IS A PROSE-VS-CODE GAP, MEASURED AND CARRIED RATHER THAN SMOOTHED OVER. ***
        // tempest.ts says the two lanes "interleave without ever landing together". Run the same envelopes
        // the shader runs across ten minutes and they land together 2.41% of the time. The spirit of the
        // sentence is right -- there is no beat -- but the word "never" is not, and this tree records the
        // gap rather than repeating the claim. It is the fifth such gap the murmur port has carried:
        // MH_SCATTER_K (3.2 against 0.098), droplet's 0.339 against 0.34177, mh_small's 46 against 52, and
        // opal's stated periods against its own code.
        let both = 0, either = 0, n = 0;
        for (let t = 0; t <= 600; t += 0.01) {
            const a = env(t, 21.0, SLOT0), b = env(t, 27.0, SLOT1);
            n++; if (a > 0.5 && b > 0.5) both++; if (a > 0.5 || b > 0.5) either++;
        }
        const p = 1 - Math.sqrt(1 - either / n);          // P(one lane), if the two were independent
        ok("!! ...and \"without ever landing together\" is ALMOST true: 2.4% of the time, not never",
            both / n > 0.005 && both / n < 0.05 && (both / n) < p * p * 1.5,
            `over 600 s at 10 ms both lanes exceed 0.5 together on ${(both / n * 100).toFixed(2)}% of samples ` +
            `(${both} of ${n}), against ${(either / n * 100).toFixed(2)}% where either does. Two INDEPENDENT ` +
            `lanes with the same duty would coincide ${(p * p * 100).toFixed(2)}% of the time, so the ` +
            `measured rate is ${((both / n) / (p * p)).toFixed(2)}x that -- they are very slightly shy of ` +
            `each other and otherwise independent. WHAT IS TRUE is the thing the sentence is FOR: the slot ` +
            `ratio is ${(SLOT1 / SLOT0).toFixed(4)}, so the coincidences never fall into a repeating pattern ` +
            `and the storm has no beat. THE ROW ASSERTS THE MEASURED RATE, not the source's word, because a ` +
            `row that asserted "never" would be red on a correct port.`);
    }
}

// =============================================================================================================
sec("4. *** NEBULA'S BUSINESS IS DEPTH: the hue rides p.z through the cloud's thickness ***");
{
    if (!okRun) { ok("!! the spread pair rendered", false, "the render did not produce them"); }
    else {
        const hn = hueShift(run.frames[F.neb[LANE0]], run.frames[F.nebSpread]);
        const ht = hueShift(run.frames[F.tem[LANE0]], run.frames[F.temSpread]);
        say(`spread 0 -> 1 -- nebula hue ${hn.dHueDeg.toFixed(2)} deg / lightness ${hn.dL.toFixed(4)} over ` +
            `${hn.n} px; tempest hue ${ht.dHueDeg.toFixed(2)} deg / lightness ${ht.dL.toFixed(4)} over ${ht.n} px`);

        // *** THE ONE CHANNEL A CLOUD HAS IS DEPTH. *** nebula.ts: the accumulator is e * clamp(p.z, -1, 1),
        // weighted by the SAME transmittance the luminance is, so "the near folds one way, the deep glow the
        // other, and the cloud has two hues in conversation through its thickness". A fold that occludes the
        // glow behind it occludes that glow's HUE too, which is what stops the far half tinting a near
        // silhouette -- and it is why this channel cannot be faked with a depth gradient applied afterwards.
        ok("!! *** BOTH TURN ON THE SPREAD AXIS AND NEITHER MOVES LIGHTNESS, which is what the axis is for ***",
            hn.dHueDeg > 0.5 && ht.dHueDeg > 0.5 && hn.dL < 0.02 && ht.dL < 0.02,
            `nebula turns ${hn.dHueDeg.toFixed(2)} degrees of OKLab hue and tempest ${ht.dHueDeg.toFixed(2)}, ` +
            `while their lightness moves ${hn.dL.toFixed(4)} and ${ht.dL.toFixed(4)}. kit.ts's promise for ` +
            `this axis is that it "moves the hue while holding lightness and chroma exactly" -- so a row ` +
            `asking only whether the picture CHANGED would pass on precisely the chroma-for-hue trade the ` +
            `axis exists to rule out. Measured against the heroes gated next door: still 1.40 degrees, comet ` +
            `3.71, droplet 1.53, limn 28.47, opal 5.55.`);
    }
}

// =============================================================================================================
sec("5. *** THE FOLD IS A DOMAIN WARP, AND DELETING IT LEFT EVERY OTHER ROW GREEN ***");
{
    if (!okRun) { ok("!! the fold pair rendered", false, "the render did not produce them"); }
    else {
        const ch = ringChange(run.frames[F.fold0], run.frames[F.fold1], 0.45);
        const s0 = interiorSpread(run.frames[F.fold0]), s1 = interiorSpread(run.frames[F.fold1]);
        say(`nebula fold 0 -> 1: ring change ${(ch.mean * 100).toFixed(2)}% at r=0.45, contrast ` +
            `${s0.contrast.toFixed(2)}x -> ${s1.contrast.toFixed(2)}x`);

        // *** THIS ROW EXISTS BECAUSE THE SABOTAGE SWEEP DELETED THE WARP AND NOTHING WENT RED. ***
        // nebula.ts: "THE FOLDING is a domain warp: one noise displaces the coordinates the second noise is
        // read at. Two samples per tap, which is the entire budget this species gets and the reason it can
        // afford to be the only hero with real turbulence." Take the displacement away and what is left is
        // plain value noise -- which still has contrast, still has a mean, still reads as SOMETHING, and
        // still passed every percentile row in section 1. Turbulence and noise are not the same field and no
        // row above could tell them apart.
        //
        // THE TERM IS DRIVEN THROUGH ITS OWN INPUT, which is the only isolation that works here: `fold` is
        // the warp's amplitude and it reaches NOTHING else in either species. With the displacement deleted
        // the amplitude multiplies a vector that is never added, so these two frames become identical and
        // the row reads 0.00%.
        ok("!! *** THE WARP IS REAL: its own amplitude knob moves the cloud, and it reaches nothing else ***",
            ch.mean > 0.02,
            `taking the fold from 0 to 1 moves the light on a fixed ring by ${(ch.mean * 100).toFixed(2)}% ` +
            `-- the same instrument that reads droplet's silhouette next door. With the domain warp removed ` +
            `this is EXACTLY zero, because \`fold\` scales a displacement that is no longer added to the ` +
            `coordinates the density noise is read at. The contrast barely moves (${s0.contrast.toFixed(2)}x ` +
            `to ${s1.contrast.toFixed(2)}x), which is the point: a distribution row cannot see this and a ` +
            `row about WHERE the light is can.`);
    }
}

// =============================================================================================================
sec("6. *** THE CLOUD OCCLUDES ITSELF, which is the one line nebula.ts calls out as arithmetic ***");
{
    if (!okRun) { ok("!! the density ladder rendered", false, "the render did not produce them"); }
    else {
        const m = F.dens.map((i) => interiorMeanLight(run.frames[i]).mean);
        const first = m[1] - m[0], second = m[2] - m[1];
        say(`nebula interior at density 0 / 0.5 / 1 -- ${m.map((v) => v.toFixed(4)).join("  ")}   ` +
            `increments ${first.toFixed(4)} then ${second.toFixed(4)}, ratio ${(second / first).toFixed(3)}`);

        // *** nebula.ts: "THE LINE OF ARITHMETIC is the transmittance... NEARER FOLDS OCCLUDE FARTHER GLOW,
        // and that sentence is a coefficient of 3.1." *** Deleting the whole term -- trans *= exp(-(absorb *
        // dens + MH_EXT) * ds) becoming exp(-MH_EXT * ds) -- left every other row in every murmur gate green.
        //
        // WHAT IT LEAVES IS A SHAPE, NOT A LEVEL. The `density` knob scales emission AND absorption at once:
        // emit is LINEAR in it, so with no absorption the interior is linear in it too. With absorption each
        // extra unit lights more and hides more, and the response bends over. So the row is the SECOND
        // DIFFERENCE, which no level can fake and no gain can rescale away.
        //
        // *** AND THE FIRST VERSION OF THIS ROW MEASURED THE TONE CURVE INSTEAD, WHICH THE SABOTAGE FOUND
        // AND THE READING DID NOT. *** It ran at the default glow of 1.0, where nebula's interior peaks at
        // 646 of 765 and mh_present's compression is doing most of the bending. The real shader read 0.680
        // there and the row passed -- and with absorption DELETED it read 0.558, which is MORE bent, so the
        // row passed harder on the broken shader than on the correct one. A proxy for the fact, reported as
        // the fact: this tree's most repeated defect, caught here only because the sabotage was run.
        //
        // AT glow ${DIM} THE PEAK IS 247 OF 765 and the curve is in its straight part, so what the ratio
        // reports is the transmittance. Measured: 0.581 with absorption, 1.012 without -- and 1.00 is not a
        // threshold anybody chose, it is what linear-in-emission means.
        ok("!! *** THE CLOUD OCCLUDES ITSELF: the interior bends away from linear, and only because it absorbs ***",
            second < first * 0.75 && first > 0 && interiorPeak(run.frames[F.dens[2]]) < 400,
            `the second half of the density range adds ${second.toFixed(4)} where the first added ` +
            `${first.toFixed(4)} -- ${(second / first * 100).toFixed(0)}% as much, at a peak of ` +
            `${interiorPeak(run.frames[F.dens[2]])} of 765 where the tone curve is still straight. Emission ` +
            `is LINEAR in this knob (emit = ${K.MH_MIST.nebula.emitB} + ${K.MH_MIST.nebula.emitK} * ` +
            `density), so with the absorption term deleted the two increments are equal and this ratio ` +
            `measures 1.012. THE PEAK IS PART OF THE ASSERTION and not decoration: at the default glow the ` +
            `same three frames read 0.680 with absorption and 0.558 WITHOUT it, because the display was ` +
            `bending the curve harder than the physics was. A row that did not bound the peak would be ` +
            `measuring mh_present.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nTHE TWO HEROES MADE OF WEATHER: nebula, lit evenly from within and carrying its colour on depth, and " +
    "tempest, lit from inside its own lightning and holding that lightning to the inner two thirds of its " +
    "own radius -- exactly, not approximately. Neither has an object in it at all." +
    "\nWHAT IS NOT CLAIMED HERE: the surface all eighteen share and limn's edge " +
    "(tools/ship/murmurSpecies-selfcheck.mjs), comet's orbit (…Species2), opal and abyss (…Species3), " +
    "droplet's body (…Species4), and the kit under all of them (tools/ship/murmurKit-selfcheck.mjs). " +
    "TEN species remain.");
process.exit(fails ? 1 : 0);
