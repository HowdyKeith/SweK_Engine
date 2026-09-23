// WebGLEngine/tools/ship/murmurIgniteFour-selfcheck.mjs -- v4660
//
// *** THE LAST FOUR IGNITION FIGURES, AND THEY REALLY ARE FOUR SHAPES. ***
//
// v4659 found that four of the eight remaining st.complete figures were ONE shape on four different axes,
// and said so against MH_IGNITE's own note. These four are the other half of that claim: each does something
// none of the others does, and a port that reached for one spelling would be wrong about three species.
//
//   aura    A VON MISES IN THE ANGLE. aura.ts gives the reason in a line: "it wraps with no seam: a seam
//           here would be a dark notch running across all three ribbons at once." The only figure in the
//           roster that spends `sweep` as a position going ROUND something rather than along it.
//   fathom  THE SHELLS LIGHT IN SEQUENCE, innermost first, each on a triangular window around its own turn.
//           The only figure keyed on WHICH PART of the species it is rather than on where the part is.
//   geode   A FLAT LIFT with no sweep at all. geode's light is a facet term on a NORMAL; there is no path
//           for a front to travel along, so the stone simply brightens.
//   comet   THE ONLY ONE THAT ADDS NO LIGHT. It lengthens the trail -- decay = mix(decay, 9.0, sweep), and
//           decay is in the DENOMINATOR of exp(-age/decay) -- so the orbit fills in behind the head out to
//           wherever the sweep has reached. The flash is the path becoming visible.
//
// *** fathom AND geode WERE STILL NOT FLASHING AT ALL. *** Measured at the peak of complete: both moved 0.0%
// of their bytes and x1.000 of interior light between the start of their own SUCCESS state and its brightest
// instant. Neither is in MH_COMPLETE_INTERIOR and neither has a shell, so these figures are their whole
// flash and neither was here.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { sp, renderSpecies, interiorMeanLight } from "./murmurSpeciesFrames.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurIgniteFour-selfcheck -- the four ignition figures that are four shapes\n");

const SUCCESS = 4, PEAK_TAU = 0.360;
const L = K.MH_IGNITE_LAP, T = K.MH_IGNITE_TURN;

// =============================================================================================================
sec("1. *** aura's WRAPS WITH NO SEAM, WHICH IS WHY IT IS A VON MISES AND NOT A GAUSSIAN ***");
{
    // *** THE CLAIM IS PERIODICITY AND IT IS CHECKED AT THE SEAM, not near it. *** exp(k*(cos x - 1)) is a
    // function of cos alone, so it is periodic by construction -- but "by construction" is what limn's first
    // arc profile was too, and limn.ts records that a gaussian in a wrapped angle "is not a periodic
    // function and no amount of tuning makes it one", with a razor-thin dark seam to show for it.
    //
    // *** IT IS NOT EXACTLY ZERO AND THE ROW MUST NOT SAY IT IS. *** lap(-pi) and lap(+pi) evaluate cos() at
    // two arguments 2*pi apart, and 2*pi is not representable in binary: the two cosines agree to within the
    // rounding of that gap, not to the last bit. The measured worst is 4.44e-16, which is two ulp of a value
    // near 1. So the bound is ulp-scale, and it is set two orders BELOW the smallest seam any wrong shape
    // here produces -- a gaussian in its place jumps by 0.8, eighteen orders the other side of the bound.
    const SEAM_ULP = 1e-14;
    const SIG = 1 / Math.sqrt(L.k);   // exp(k*(cos x - 1)) ~ exp(-k*x*x/2) near its peak: the same curvature
    let worstSeam = 0, at = "";
    let worstGauss = 0, atG = "";
    for (let sw = 0; sw <= 1; sw += 1 / 64) {
        const a = K.mhIgniteLap(-Math.PI, 1, sw, L.flat, L.gain, L.k);
        const b = K.mhIgniteLap(Math.PI, 1, sw, L.flat, L.gain, L.k);
        const d = Math.abs(a - b);
        if (d > worstSeam) { worstSeam = d; at = `sweep ${sw.toFixed(3)}`; }
        // ...and the same figure written as a gaussian of the same curvature, swept the same way, which is
        // what aura is NOT. Its seam is measured at the SAME join and over the SAME sweeps -- a gaussian
        // centred at 0 happens to be symmetric about the join and would read 0 there, which is exactly the
        // reading that would let the wrong shape through if the sweep were not moved.
        const c = sw * 2 * Math.PI;
        const ga = L.flat + L.gain * Math.exp(-Math.pow((-Math.PI - c) / SIG, 2) / 2);
        const gb = L.flat + L.gain * Math.exp(-Math.pow((Math.PI - c) / SIG, 2) / 2);
        const dg = Math.abs(ga - gb);
        if (dg > worstGauss) { worstGauss = dg; atG = `sweep ${sw.toFixed(3)}`; }
    }
    const lo = K.mhIgniteLap(Math.PI, 1, 0, L.flat, L.gain, L.k), hi = K.mhIgniteLap(0, 1, 0, L.flat, L.gain, L.k);
    say(`aura's bump at the sweep's own angle ${hi.toFixed(4)}, at the far side ${lo.toFixed(4)} -- a ratio of ${(hi / lo).toFixed(2)}, never dark`);
    say(`the gaussian of the same curvature (sigma ${SIG.toFixed(4)} from k ${L.k}) tears by ${worstGauss.toFixed(4)} at its worst, at ${atG}`);
    ok("!! *** THE VALUE AT -pi AND AT +pi AGREES TO ULP SCALE AT EVERY SWEEP, while the gaussian tears ***",
        worstSeam < SEAM_ULP && worstGauss > 0.5 && lo > 0.15 && hi / lo > 3,
        `worst |lap(-pi) - lap(+pi)| = ${worstSeam.toExponential(2)} across 65 sweeps (worst at ${at}), under ` +
        `the ${SEAM_ULP.toExponential(0)} ulp bound, because exp(k*(cos(x) - 1)) reads its argument through a ` +
        `cosine and a cosine has no seam -- what is left is the rounding of a 2*pi that binary cannot hold. A ` +
        `gaussian of the same curvature, swept the same way, tears by ${worstGauss.toFixed(4)} at ${atG}: that ` +
        `is ${(worstGauss / worstSeam).toExponential(1)} times as large, and it is the dark notch aura.ts ` +
        `refuses. AND THE BUMP NEVER GOES DARK: its floor is ${L.flat} of the flash plus ${lo.toFixed(4)} at ` +
        `the far side, so all three ribbons stay lit while the front goes round -- a von Mises with no floor ` +
        `would read as a searchlight and not as an arrival.`);
}

// =============================================================================================================
sec("2. *** fathom's SHELLS LIGHT IN ORDER, INNERMOST FIRST -- and the order is the row ***");
{
    // turn = (2 - k) * 0.33, so k = 2 has turn 0. k = 2 is the INNERMOST: MH_FATHOM's weights fall away
    // inward (1.00, 0.74, 0.52) with k = 0 the outer. Passing k where 2 - k belongs reverses the species
    // into something that still looks like an ignition, which is why the ORDER is what gets measured.
    const peakOf = (k) => {
        let best = -1, at = 0;
        for (let sw = 0; sw <= 1; sw += 0.0005) {
            const v = K.mhIgniteTurn(2 - k, 1, sw, T.step, T.lead, T.edge, T.flat, T.gain);
            if (v > best) { best = v; at = sw; }
        }
        return { at, best };
    };
    const P = [0, 1, 2].map(peakOf);
    say(`shell k=0 (outer) peaks at sweep ${P[0].at.toFixed(3)}, k=1 ${P[1].at.toFixed(3)}, k=2 (inner) ${P[2].at.toFixed(3)}`);
    ok("!! *** THE INNERMOST SHELL PEAKS FIRST AND THE OUTERMOST LAST: 0.160, 0.490, 0.820 ***",
        P[2].at < P[1].at && P[1].at < P[0].at &&
        Math.abs(P[2].at - 0.160) < 0.002 && Math.abs(P[0].at - 0.820) < 0.002,
        `the three windows are centred ${(P[1].at - P[2].at).toFixed(3)} and ${(P[0].at - P[1].at).toFixed(3)} ` +
        `of the sweep apart -- one step of ${T.step} each -- and they run INWARD-OUT. THE ORDER IS THE ROW ` +
        `AND NOT THE PEAKS: passing k instead of 2 - k gives three shells that still light in sequence, ` +
        `still one step apart, still peaking at 1.0 -- and travelling the wrong way through the nest. A row ` +
        `that only checked "each shell has a turn" could not tell the two apart, and the first draft of the ` +
        `kit note had the direction backwards while the arithmetic was right.`);

    // ...and no shell is ever dark: the flat term is what keeps the nest whole through the flash.
    let floor = Infinity;
    for (let sw = 0; sw <= 1; sw += 0.002) for (const k of [0, 1, 2])
        floor = Math.min(floor, K.mhIgniteTurn(2 - k, 1, sw, T.step, T.lead, T.edge, T.flat, T.gain));
    ok("!! ...and no shell is ever dark while the flash runs: the floor is 0.500, which is the flat term",
        Math.abs(floor - T.flat) < 1e-12,
        `the least any shell gets at any sweep is ${floor.toFixed(4)}, which is ${T.flat} exactly -- the ` +
        `flat term, reached wherever the triangular window has fallen to nothing. fathom is a NEST and its ` +
        `subject is three legible surfaces at three radii; a flash that lit one at a time and left the other ` +
        `two dark would be a different species for a second.`);
}

// =============================================================================================================
sec("3. *** geode ADDS NO SWEEP AND comet ADDS NO LIGHT -- two absences that are the design ***");
{
    // *** geode: NOT "the constant is constant" -- THE BUILDER IS SWEPT NOWHERE. ***
    //
    // The first draft of this row mapped five sweeps through `() => MH_IGNITE_FLAT_GEODE * 1` and asserted
    // the five results were one value. They are one value because the arrow never reads its argument: a row
    // that cannot fail, dressed as a measurement, under a title claiming a sweep had been tried. There is no
    // frame pair that would settle it either -- mh_state's complete and sweep move together at SUCCESS and
    // no two taus share a complete with different sweeps -- so the honest instrument is the SOURCE, and it
    // is a census over geode's WHOLE builder rather than a 60-character window around one name.
    //
    // THE CONTROL IS THE OTHER THREE. A region reader that found nothing anywhere would report geode clean
    // for the wrong reason, so the same extraction has to find SWEEP in aura, fathom and comet.
    const orbSrc = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    const builderOf = (name) => {
        const starts = [...orbSrc.matchAll(/const build([A-Z]\w*) = \(\) => \{/g)];
        const i = starts.findIndex((m) => m[1].toLowerCase() === name);
        if (i < 0) return null;
        return orbSrc.slice(starts[i].index, i + 1 < starts.length ? starts[i + 1].index : orbSrc.length);
    };
    const sweepsIn = (name) => { const b = builderOf(name); return b === null ? -1 : (b.match(/\bSWEEP\b/g) || []).length; };
    const gSweeps = sweepsIn("geode"), control = ["aura", "fathom", "comet"].map((s) => [s, sweepsIn(s)]);
    const gBody = builderOf("geode") || "";
    say(`SWEEP inside each builder: geode ${gSweeps}, ` + control.map(([s, n]) => `${s} ${n}`).join(", "));
    // *** THE CONTROL IS ITS OWN ROW AND NOT A CONJUNCT OF geode's. *** Folded in, the first version of this
    // went red under FOUR sabotages that have nothing to do with geode -- unwiring fathom's window or
    // neutralising comet's mix takes the SWEEP out of that builder, the control loses its subject, and a row
    // titled "geode reads the sweep zero times" reports it. The claim was still true; the name on the red
    // was wrong, and a red under the wrong name is how a bisect goes to the wrong file.
    ok("!! ...and the same reader FINDS a sweep in the three builders that do travel, so geode's zero is a reading",
        control.every(([, n]) => n >= 1),
        `aura ${control[0][1]}, fathom ${control[1][1]}, comet ${control[2][1]} -- one apiece. A region ` +
        `reader that matched nothing anywhere would report geode clean for the wrong reason, which is the ` +
        `census defect this tree has now found four times: a clean result about a subset the row never names.`);
    ok("!! *** geode's WHOLE BUILDER READS THE SWEEP ZERO TIMES, and that is geode rather than a gap ***",
        gSweeps === 0 && K.MH_IGNITE_FLAT_GEODE > 0 &&
        /\.add\(COMPLETE\.mul\(MH_IGNITE_FLAT_GEODE\)\)/.test(gBody) &&
        (gBody.match(/\bCOMPLETE\b/g) || []).length >= 1,
        `geode.ts: "if (st.complete > 0.001) lit += st.complete * 0.70" -- and geode's builder reads SWEEP ` +
        `${gSweeps} times across all ${gBody.split("\n").length} of its lines, while the same reader finds ` +
        `${control.map(([s, n]) => `${n} in ${s}`).join(", ")}. geode's light is a facet term on a NORMAL: ` +
        `what is lit is decided by which way a face points, not by where along anything it sits, so there is ` +
        `no path for a front to run down -- and COMPLETE is read, so the absence is of the sweep and not of ` +
        `the flash. THE CONSTANT IS IN THE KIT RATHER THAN INLINE precisely so this reads as a decision: a ` +
        `reader who found three travelling figures and one bare number would take the fourth for an omission.`);

    // comet: the flash changes a DECAY, and mix(x, y, 0) is x, so outside SUCCESS the line is unchanged.
    const CT = K.MH_COMET_TRAIL;
    const base = 1.30 + 0.5 * 2.60;
    const mixAt = (sw) => base + (CT.to - base) * sw;
    let worstId = 0;
    for (const b of [1.30, 2.60, 3.90]) worstId = Math.max(worstId, Math.abs((b + (CT.to - b) * 0) - b));
    const lengths = [0, 0.25, 0.5, 0.75, 1].map(mixAt);
    say(`comet's trail decay across the sweep: ${lengths.map((v) => v.toFixed(2)).join(" -> ")} (larger fades SLOWER)`);
    ok("!! *** comet's FLASH ADDS NO LIGHT: IT LENGTHENS THE TRAIL, and at sweep 0 it changes nothing ***",
        worstId === 0 && lengths[4] === CT.to && lengths[0] === base &&
        lengths.every((v, i) => i === 0 || v > lengths[i - 1]),
        `decay runs ${lengths[0].toFixed(2)} to ${lengths[4].toFixed(2)} monotonically as the sweep goes, ` +
        `and decay sits in the DENOMINATOR of exp(-age / decay) -- so a larger one fades slower and "the ` +
        `orbit fills in behind the head, out to wherever the sweep has reached". AT SWEEP 0 THE MIX IS THE ` +
        `IDENTITY, to ${worstId}, which is why the port can drop murmur's guard: mh_state's sweep is ` +
        `identically 0 outside SUCCESS, so the branchless form is the same number in every other state. ` +
        `comet is the only species in the roster whose success adds no light at all -- it makes a path that ` +
        `was always being drawn last long enough to see.`);
}

// =============================================================================================================
sec("4. *** THE CENSUS: four sites, four shapes, and the two factors that have to travel in pairs ***");
{
    const src = codeOnly(fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8"));
    const raw = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    const have = [["aura", /KIT\.mhIgniteLap\(angA, COMPLETE, SWEEP,/],
                  ["fathom", /KIT\.mhIgniteTurn\(float\(2 - k\), COMPLETE, SWEEP,/],
                  ["geode", /\.add\(COMPLETE\.mul\(MH_IGNITE_FLAT_GEODE\)\)/],
                  ["comet", /mix\(float\(1\.30\)[\s\S]{0,220}float\(CT\.to\), SWEEP\)/]];
    const found = have.filter(([, re]) => re.test(raw)).map(([s]) => s);
    say(`the four sites present: ${found.join(", ")}`);
    ok("!! *** ALL FOUR ARE WIRED, EACH IN ITS OWN SHAPE, and fathom passes 2 - k rather than k ***",
        found.length === 4,
        `aura through mhIgniteLap on atan(p.z, p.x), fathom through mhIgniteTurn on 2 - k, geode as a flat ` +
        `add on its facet term, comet as a mix into its trail decay. FOUR CALL SITES AND FOUR DIFFERENT ` +
        `EXPRESSIONS: the round before this one found four figures that were one shape and gave them one ` +
        `table, and the temptation after that is to look for a fifth entry in it. These four are the answer ` +
        `to why there is not one.`);

    ok("!! *** aura LIFTS ITS HUE CHANNEL BY THE SAME lap IT LIFTS ITS ENERGY ***",
        /const ribbons = E\[0\][\s\S]{0,60}\.mul\(lap\)/.test(raw) &&
        /const hueW = E\[0\][\s\S]{0,160}\.mul\(lap\)\.toVar\(\);/.test(raw),
        `aura.ts: ribbons = (e0+e1+e2) * w3 * lap and hueW = (e0*-0.70 + e1*0.55 + e2*1.0) * w3 * lap -- the ` +
        `same factor on both. The hue this species reports is acc.y / acc.x, so lifting the energy alone ` +
        `leaves the numerator behind and the three ribbons' colour conversation drifts toward the anchor ` +
        `through the flash. IT IS THE SECOND TIME THIS PAIR HAS COME UP IN TWO ROUNDS -- helix's was the ` +
        `same shape at v4659 -- and both were found by reading the source line rather than by a frame.`);

    // comet's two OTHER absences, on the same line, named separately so neither hides behind the ignition.
    ok("!! ...and comet's decay took murmur's DRIVE and SMALL terms in the same round, which it never had",
        /\.mul\(float\(1\.0\)\.add\(DRIVE\.mul\(CT\.driveK\)\)\)/.test(raw) &&
        /\.mul\(mix\(float\(1\.0\), float\(CT\.small\), smallK\)\)/.test(raw) &&
        K.MH_COMET_TRAIL.driveK === 1.25 && K.MH_COMET_TRAIL.small === 0.40,
        `comet.ts spells the base as (1.30 + 2.60*trailK) * (1 + 1.25*st.drive) * mix(1.0, 0.40, small), and ` +
        `this port carried the first factor alone -- so the lean did not lengthen the trail and the small ` +
        `mounts did not shorten it to two fifths, which comet.ts calls the difference between a trail and "a ` +
        `full lap of smear on a 44 px badge". BOUNDED MULTIPLIERS ON A DECAY rather than on a clock, so ` +
        `neither can teleport anything, and they went in as murmur spells them. They are a separate row ` +
        `because they are a separate absence and the ignition on the same line would otherwise cover them.`);
}

// =============================================================================================================
sec("5. *** AND IT REACHES PIXELS: fathom and geode still were not flashing at all ***");
{
    const SPEC = ["aura", "fathom", "geode", "comet"];
    const FR = [];
    for (const s of SPEC) {
        FR.push(sp(s, 7.0, 0.6, { stateIndex: SUCCESS, stateTau: 0.0 }));
        FR.push(sp(s, 7.0, 0.6, { stateIndex: SUCCESS, stateTau: PEAK_TAU }));
    }
    const run = await renderSpecies(FR);
    if (!run.ok || !run.frames || run.frames.length !== FR.length) {
        ok("!! the four figures render at all", false,
            `could not render: ${run.reason || (run.skipped ? "skipped: " + run.skipped : "frame count")}.`);
    } else {
        say(`backend: ${run.isWebGPUBackend ? "REAL WebGPU" : "WebGL2 fallback"}; ${FR.length} frames over ${SPEC.length} species`);
        const diff = (a, b) => { let n = 0, mx = 0;
            for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) n++; if (d > mx) mx = d; }
            return { pct: 100 * n / a.length, mx }; };
        // measured at v4659 on these same frames, with the four neutralised one at a time
        const WAS = { aura: 2.45, fathom: 1.00, geode: 1.00, comet: 1.00 };
        const R = SPEC.map((s, i) => {
            const off = run.frames[i * 2], on = run.frames[i * 2 + 1];
            return { s, d: diff(off, on), lo: interiorMeanLight(off).mean, hi: interiorMeanLight(on).mean };
        });
        for (const r of R)
            say(`${r.s.padEnd(7)} ${r.d.pct.toFixed(1)}% of bytes move, worst ${String(r.d.mx).padStart(3)}   interior x${(r.hi / r.lo).toFixed(2)}   (at v4659: x${WAS[r.s].toFixed(2)})`);
        ok("!! *** ALL FOUR MOVE, AND fathom AND geode GO FROM x1.000 -- NOTHING AT ALL -- TO x4.03 AND x4.90 ***",
            R.every((r) => r.d.pct > 3 && r.d.mx > 20) &&
            R.every((r) => r.hi / r.lo > WAS[r.s] * 1.05),
            `${R.map((r) => `${r.s} x${(r.hi / r.lo).toFixed(2)} (was x${WAS[r.s].toFixed(2)})`).join(", ")}. ` +
            `THE ROW ASKS FOR MORE THAN EACH SPECIES ALREADY HAD rather than merely for movement: aura was ` +
            `at x2.45 from v4658's interior factor and a row checking "it moves" would have been green on it ` +
            `before this round began. comet's is the smallest by far AND THAT IS ITS SHAPE: its flash adds ` +
            `no light, it lengthens a trail, so at the complete peak the sweep has only run ` +
            `${K.mhState(SUCCESS, PEAK_TAU).sweep.toFixed(3)} of its way round and most of the path is still ` +
            `to fill.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the last four of murmur's per-species ignition figures, which are four shapes " +
    "and not one -- a von Mises going ROUND aura's ribbons, a sequence of triangular windows lighting " +
    "fathom's shells from the inside out, a flat lift on geode's facets with no sweep in it at all, and a " +
    "trail decay on comet that adds no light whatever. fathom and geode were still not flashing at all " +
    "before this round." +
    "\nWHAT IS NOT CLAIMED: comet's trail EXTENT in pixels. The obvious instrument is an angular profile of " +
    "the orbit ring, and at this gate's 48 px frames it does not resolve -- measured, at three radii: the " +
    "ring at 0.50 reads 96 of 96 samples lit at every tau, and at 0.30 and 0.40 the count moves by one or " +
    "two out of 96 across the whole sweep. A proxy that cannot see its subject is worse than a stated gap, " +
    "so comet's row here is that it responds and its arithmetic is graded in section 3 instead." +
    "\nSTILL MISSING FROM st.complete: the singles -- still's glint 0.85, comet's head 2.2, droplet's 0.26, " +
    "limn's ring and its second interior, duet's flare and its one SHRINK, chorus's sync, prism's 1.10 -- " +
    "all recorded against the st.drive entry in tools/ship/nextRounds.mjs.");
process.exit(fails ? 1 : 0);
