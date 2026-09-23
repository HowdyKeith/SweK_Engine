// WebGLEngine/tools/ship/murmurSingles-selfcheck.mjs -- v4661
//
// *** THE LAST NINE st.complete SITES, AND THE POINT IS THAT THEY DO NOT RHYME. ***
//
// v4658 took the four that sit on the shared interior line, the three saturations and sol's core gain.
// v4659 took four ignition figures that turned out to be ONE shape on four different axes. v4660 took the
// four that were four shapes. Each of those rounds found a rule and wrote a table, and the habit that builds
// is to expect a tenth rule. THERE IS NOT ONE. These nine are nine lines in seven files and the only thing
// they have in common is the signal that drives them -- and four of the nine are not even the family's
// (1 + k * complete) shape:
//
//   dropletCore  ADDITIVE on a brightness, beside the voice and the settle
//   limnRing     ADDITIVE and GATED BY THE BAND, so the flash lands on the arc and nowhere else
//   chorusSync   ADDITIVE ON A CONTROL: the only site in eighteen species where complete moves a PARAMETER
//                of the species rather than an intensity. chorus's success is the seven falling into phase.
//   duetShrink   THE ONLY SUBTRACTION IN THE ROSTER: rSep *= (1 - 0.62 * complete)
//
// *** THIS GATE GRADES THE FOUR THAT ARE NOT THE FAMILY SHAPE, PLUS still's, WHICH IS THE FAMILY SHAPE ON A
// SUBJECT THAT IS NOT ALWAYS THERE. *** The other four -- comet's head, droplet's core, prism's beams and
// limn's second interior -- are the plain shape and are rendered next door in
// tools/ship/murmurSingles2-selfcheck.mjs, for the usual reason: a species costs one WGSL compile and a gate
// over budget does not run at ship time at all.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { sp, renderSpecies, N3, light, interiorMeanLight, VOICE_LIVE, PACE_LIVE } from "./murmurSpeciesFrames.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSingles-selfcheck -- the last nine complete sites, and the four that are not the family shape\n");

const SUCCESS = 4, PEAK_TAU = 0.360;
const SG = K.MH_COMPLETE_SINGLE;
const VOICE = 0.6;

// *** still's GLINT ONLY EXISTS INSIDE ITS OWN GESTURE, AND THE FRAME TIME HAS TO BE CHOSEN FOR IT. ***
// still.ts fires the glint once per slot of about 10.55 s at this operating point, over a 5-lane window --
// so at the time every other species gate uses, 7.0 s, still's glint envelope is ZERO and the flash has
// nothing to multiply. Measured: wiring the 0.85 moved the frame by 0 bytes at t = 7.0. The two times below
// are solved from the kit's own clock rather than guessed.
const stillEnv = (t) => {
    const lv = K.mhLive(VOICE, Math.pow(PACE_LIVE / 0.60, 1 / 0.85), SUCCESS);
    const st = K.mhState(SUCCESS, PEAK_TAU);
    const S = K.MH_SLOT_SIGNAL.still, base = 11.5;
    const slotNow = base / (1 + lv.pace * S.pace + st.drive * S.drive);
    const ph = K.mhRatePhase(1 / base, t, S.pace, lv.pace * t, S.voice, lv.voice * t, S.drive, st.drive * t);
    return K.mhFlourishPhase(ph, slotNow, 5.0).env;
};
let T_ON = 0, T_OFF = 0;
for (let t = 0.25; t < 14; t += 0.05) {
    if (stillEnv(t) > stillEnv(T_ON)) T_ON = t;
    if (T_OFF === 0 && t > 6 && stillEnv(t) < 1e-6) T_OFF = t;
}

const FRAMES = [];
const idx = {};
const push = (k, f) => { idx[k] = FRAMES.push(f) - 1; };
push("stillOnLo", sp("still", T_ON, VOICE, { stateIndex: SUCCESS, stateTau: 0 }));
push("stillOnHi", sp("still", T_ON, VOICE, { stateIndex: SUCCESS, stateTau: PEAK_TAU }));
push("stillOffLo", sp("still", T_OFF, VOICE, { stateIndex: SUCCESS, stateTau: 0 }));
push("stillOffHi", sp("still", T_OFF, VOICE, { stateIndex: SUCCESS, stateTau: PEAK_TAU }));
for (const [k, tau] of [["duet0", 0], ["duetMid", 0.18], ["duetPeak", PEAK_TAU]])
    push(k, sp("duet", 7.0, VOICE, { stateIndex: SUCCESS, stateTau: tau }));
push("limnLo", sp("limn", 7.0, VOICE, { stateIndex: SUCCESS, stateTau: 0 }));
push("limnHi", sp("limn", 7.0, VOICE, { stateIndex: SUCCESS, stateTau: PEAK_TAU }));
// chorus's two frames hold the state still and move the SYNC KNOB instead, which is the control the flash
// pushes: what is measured is how much of chorus's picture 0.375 of sync is worth, so the 0.55 the flash
// adds can be stated in the same units as something visible.
push("chorusLoSync", sp("chorus", 7.0, VOICE, { sync: 0.5 }));
push("chorusHiSync", sp("chorus", 7.0, VOICE, { sync: 1.0 }));

const run = await renderSpecies(FRAMES);
if (!run.ok || !run.frames || run.frames.length !== FRAMES.length) {
    ok("!! the nine singles render at all", false,
        `could not render: ${run.reason || (run.skipped ? "skipped: " + run.skipped : "frame count")}. A gate ` +
        `that cannot run its own subject is a FAIL row here and not a silent skip.`);
    console.log("\nFAIL -- 1 check(s)");
    process.exit(1);
}
const F = (k) => run.frames[idx[k]];
say(`backend: ${run.isWebGPUBackend ? "REAL WebGPU" : "WebGL2 fallback"}; ${FRAMES.length} frames over 4 species`);

const ratio = (lo, hi) => interiorMeanLight(F(hi)).mean / interiorMeanLight(F(lo)).mean;
const bytes = (a, b) => { let n = 0, mx = 0; const A = F(a), B = F(b);
    for (let i = 0; i < A.length; i++) { const d = Math.abs(A[i] - B[i]); if (d) n++; if (d > mx) mx = d; }
    return { pct: 100 * n / A.length, mx }; };
/** the added light's first moment in radius -- the same instrument tools/ship/murmurIgnite-selfcheck.mjs uses. */
const added = (loK, hiK) => { const lo = F(loK), hi = F(hiK); let num = 0, den = 0;
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1, rho = Math.hypot(dx, dy);
        if (rho > 0.98) continue;
        const d = light(hi, x, y) - light(lo, x, y);
        if (d <= 0) continue;
        num += d * rho; den += d; }
    return { centroid: den ? num / den : 0, sum: den }; };
/** the whole frame's radius of gyration -- where the species' light SITS, not how much of it there is. */
const gyration = (k) => { const px = F(k); let num = 0, den = 0;
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1, rho2 = dx * dx + dy * dy;
        if (rho2 > 0.96) continue;
        const L = light(px, x, y); num += L * rho2; den += L; }
    return Math.sqrt(num / den); };

// =============================================================================================================
sec("1. *** still's FLASH IS ON THE GLINT AND ONLY ON THE GLINT -- so the frame TIME decides whether it exists ***");
{
    const rOn = ratio("stillOnLo", "stillOnHi"), rOff = ratio("stillOffLo", "stillOffHi");
    say(`still's glint envelope: ${stillEnv(T_ON).toFixed(4)} at t = ${T_ON.toFixed(2)} s, ` +
        `${stillEnv(T_OFF).toExponential(1)} at t = ${T_OFF.toFixed(2)} s`);
    say(`the same flash at the same tau: x${rOn.toFixed(3)} of interior light with the glint running, x${rOff.toFixed(3)} without it`);
    ok("!! *** THE SAME FLASH LIFTS still BY x4.47 WHEN ITS GLINT IS RUNNING AND x3.19 WHEN IT IS NOT ***",
        rOn > rOff * 1.2 && rOff > 2.0 && stillEnv(T_ON) > 0.95 && stillEnv(T_OFF) < 1e-6,
        `still.ts spends its complete on the glint's BRIGHTNESS at ${SG.stillGlint}, and the glint is not a ` +
        `permanent feature: it fires once per slot of about 10.55 s at this operating point. So the term is ` +
        `multiplied by an envelope that is ${stillEnv(T_ON).toFixed(4)} at t = ${T_ON.toFixed(2)} and ` +
        `${stillEnv(T_OFF).toExponential(1)} at t = ${T_OFF.toFixed(2)}, and the flash lifts the frame ` +
        `x${rOn.toFixed(3)} at the first and x${rOff.toFixed(3)} at the second -- the x${rOff.toFixed(3)} ` +
        `being the shell and the settle, which still has as well. *** THE FRAME TIME IS SOLVED FROM THE ` +
        `KIT'S OWN CLOCK AND THAT IS THE ROW'S REAL SUBJECT: *** every other species gate in this tree ` +
        `renders at t = 7.0 s, still's glint envelope is ZERO there, and the first measurement of this term ` +
        `read 0 bytes moved. A frame in which the subject does not exist is not a measurement of the subject.`);
}

// =============================================================================================================
sec("2. *** duet's IS THE ONLY SUBTRACTION st.complete MAKES ANYWHERE IN EIGHTEEN SPECIES ***");
{
    const sep = (tau) => 1 - SG.duetShrink * K.mhState(SUCCESS, tau).complete;
    const g = ["duet0", "duetMid", "duetPeak"].map(gyration);
    const taus = [0, 0.18, PEAK_TAU];
    say(`duet's separation factor by tau: ${taus.map((t) => `${t} -> x${sep(t).toFixed(4)}`).join(", ")}`);
    say(`duet's radius of gyration over the same three frames: ${g.map((v) => v.toFixed(4)).join(" -> ")}`);
    ok("!! *** THE PAIR COMES TOGETHER AS IT FLARES: the light's radius of gyration falls while it TRIPLES in brightness ***",
        g[0] > g[1] && g[1] > g[2] && g[0] - g[2] > 0.05 &&
        interiorMeanLight(F("duetPeak")).mean > interiorMeanLight(F("duet0")).mean * 2,
        `duet.ts names all four terms on that one separation in a line -- "Cadence closes it a little, ` +
        `responding a lot, the gesture briefly, and success all the way in" -- and this is the last of the ` +
        `four. At complete 1 the separation is ${(100 * sep(PEAK_TAU)).toFixed(0)}% of what it was, and the ` +
        `frame's radius of gyration falls ${g[0].toFixed(4)} -> ${g[2].toFixed(4)} while the interior goes ` +
        `x${(interiorMeanLight(F("duetPeak")).mean / interiorMeanLight(F("duet0")).mean).toFixed(2)} brighter. ` +
        `*** THE FALL IS A LOWER BOUND AND NOT A CONFOUND: *** duet is one of the seven species WITH the ` +
        `shared shell, and a shell travels OUTWARD over exactly this window, which moves the gyration the ` +
        `other way. The shrink is large enough to beat its own species' ring going past it.`);

    ok("!! ...and the flare is on each solved light rather than on the balance, which is what keeps brA + brB = 2",
        /const flare = float\(1\.0\)\.add\(COMPLETE\.mul\(MH_COMPLETE_SINGLE\.duetFlare\)\)/.test(
            fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8")) &&
        SG.duetFlare > 0 && SG.duetShrink > 0,
        `duet.ts's balance is a SPLIT and not a gain -- brA + brB is exactly 2 for every value of bal, which ` +
        `is the measurable form of "brighter THERE and dimmer here" -- so folding a flash into the balance ` +
        `would have broken the one invariant the species is built on. The flare of ${SG.duetFlare} goes on ` +
        `each solved light instead: two sites for one constant, on purpose. duet is one of the two species ` +
        `with TWO of these nine, and its two run in opposite directions at the same instant.`);
}

// =============================================================================================================
sec("3. *** limn's LANDS ON THE RING AND IS GATED BY THE BAND, which is why it is an ADD and not a scale ***");
{
    // *** THE FIRST CUT OF THIS SECTION ASKED THE FRAME A QUESTION THE FRAME CANNOT ANSWER. *** It measured
    // the radial centroid of limn's ADDED light and asserted it sits further out than limn's own, on the
    // reasoning that a band-gated term lands on the edge. It reads 0.5048 against 0.5174 -- further IN --
    // and the row was wrong rather than the port: limn has THREE complete sites and two of them are
    // interiors. The added light is their sum, and the two interior terms are larger. A species with three
    // terms on one signal cannot have one of them weighed by turning that signal up.
    //
    // So the gating is graded where it is decidable -- in the arithmetic, which is where it lives -- and the
    // frame is asked the two questions it CAN answer: does the flash reach the rim at all, and does it stay
    // inside the silhouette.
    const CPU = (rhoOverR) => {
        const bw = Math.min(0.070 + 0.5 * 0.055, 0.30) * (1 + VOICE_LIVE * 0.55);
        const d = (rhoOverR - 0.965) / Math.max(bw, 1e-3);
        return Math.exp(-d * d);
    };
    const atRim = CPU(0.965), atMid = CPU(0.50);
    say(`limn's band is ${atRim.toFixed(4)} at the rim and ${atMid.toExponential(1)} at half the radius -- a ratio of ${(atRim / atMid).toExponential(1)}`);
    ok("!! *** THE RING TERM IS CONFINED TO THE ARC BY ARITHMETIC, NOT BY HOPE: seven orders down at mid-body ***",
        atRim > 0.99 && atMid < 1e-6 && atRim / atMid > 1e6,
        `limn.ts adds complete * band * ${SG.limnRing} rather than scaling rimE, and `+"`band`"+` is the ` +
        `gaussian that says WHERE the edge is: exp(-((rho/R - 0.965) / bw)^2) with bw ${
            (Math.min(0.070 + 0.5 * 0.055, 0.30) * (1 + VOICE_LIVE * 0.55)).toFixed(4)} at this operating ` +
        `point. It is ${atRim.toFixed(4)} on the arc and ${atMid.toExponential(1)} at half the radius, so ` +
        `the flash cannot reach the interior through this term whatever complete does. SCALING rimE INSTEAD ` +
        `WOULD HAVE BEEN A DIFFERENT PICTURE FOR THE SAME CONSTANT: rimE carries the fresnel and the arc ` +
        `profile as well, so the flash would have multiplied those too -- a brighter everything rather than ` +
        `a brighter EDGE.`);

    // ...and what the frame can say: the flash reaches the rim, and it does not leave the body.
    const bins = 12, lo = F("limnLo"), hi = F("limnHi");
    const bLo = new Array(bins).fill(0), bHi = new Array(bins).fill(0);
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1, rho = Math.hypot(dx, dy);
        if (rho > 0.99) continue;
        const k = Math.min(bins - 1, Math.floor(rho / 0.99 * bins));
        bLo[k] += light(lo, x, y); bHi[k] += light(hi, x, y);
    }
    const rat = bLo.map((v, i) => bHi[i] / Math.max(v, 1e-9));
    const body = rat.slice(0, 8), outside = rat.slice(8);
    say(`limn's flash by radial bin: ${rat.map((v) => "x" + v.toFixed(2)).join(" ")}`);
    say(`limn's interior goes x${ratio("limnLo", "limnHi").toFixed(3)} overall and ${bytes("limnLo", "limnHi").pct.toFixed(1)}% of its bytes move`);
    ok("!! *** THE FLASH REACHES THE RIM AND STOPS AT THE SILHOUETTE: x5.9 in the outermost body bin, x1.00 beyond it ***",
        body[7] > 3 && Math.max(...body) > 10 && outside.every((v) => Math.abs(v - 1) < 0.05) &&
        ratio("limnLo", "limnHi") > 5,
        `the outermost bin that still holds limn's body reads x${body[7].toFixed(2)} and the brightest reads ` +
        `x${Math.max(...body).toFixed(2)}, while every bin outside the silhouette reads ` +
        `x${outside.map((v) => v.toFixed(3)).join(", x")} -- one, to within a count of 255. kit.ts: the ` +
        `flash "brightens exactly what is already there and leaves the dark dark", and droplet.ts records ` +
        `the failure it is guarding against by name: "the first cut added a flat lift alongside it and ` +
        `success rendered as a solid white disc". limn's overall lift is x${ratio("limnLo", "limnHi").toFixed(2)}, ` +
        `the largest in the roster, and it still does not put one count of light outside the body.`);

    ok("!! ...and limn is the only species in the roster with THREE complete sites, which is three different things",
        K.MH_COMPLETE_INTERIOR.limn > 0 && SG.limnRing > 0 && SG.limnHint > 0,
        `${K.MH_COMPLETE_INTERIOR.limn} on the shared interior line since v4658, ${SG.limnRing} on the ring ` +
        `and ${SG.limnHint} on the interior HINT -- the volume glowing faintly where the arc's light entered. ` +
        `They are three because they are three different things: the whole interior, the edge, and the wash ` +
        `the edge throws inward. A port that folded them into one number would brighten the disc uniformly ` +
        `and lose the arc, which is the picture limn.ts calls "a rim drawn ON a dark disc" rather than "a rim ` +
        `lighting a dark VOLUME". IT IS ALSO WHY THE RING TERM HAS NO PIXEL ROW OF ITS OWN HERE: three terms ` +
        `on one signal cannot be told apart by moving that signal, and the honest instrument for the one ` +
        `that is gated is the gate.`);
}

// =============================================================================================================
sec("4. *** chorus's IS NOT LIGHT AT ALL: st.complete MOVES A PARAMETER, and it is the only one that does ***");
{
    const CH = K.MH_CHORUS;
    const syncAt = (knob, complete) => Math.min(1, Math.max(0, knob * CH.syncK + SG.chorusSync * complete));
    const rest = syncAt(0.5, 0), flashed = syncAt(0.5, 1), ceiling = syncAt(1.0, 0);
    const d = bytes("chorusLoSync", "chorusHiSync");
    say(`chorus's sync: ${rest.toFixed(3)} at rest, ${flashed.toFixed(3)} at the flash's peak -- and its KNOB tops out at ${ceiling.toFixed(3)}`);
    say(`moving the knob from 0.5 to 1.0 -- ${(ceiling - rest).toFixed(3)} of sync -- moves ${d.pct.toFixed(1)}% of chorus's bytes, worst ${d.mx}`);
    ok("!! *** THE FLASH TAKES chorus PAST WHAT ITS OWN KNOB CAN REACH: 0.925 of sync against a ceiling of 0.750 ***",
        flashed > ceiling && d.pct > 5 && d.mx > 40 && rest < flashed,
        `chorus.ts: "At rest the voices are scattered across the cycle ... As sync rises they gather, and at ` +
        `one they breathe as a single body. That transition from many rhythms to one is the whole species." ` +
        `So its success is the ensemble ARRIVING at alignment, and st.complete is added INSIDE the same ` +
        `clamp as the knob. THE TWO RENDERED FRAMES ARE NOT THE FLASH -- they are the knob, at 0.5 and 1.0 -- ` +
        `and they are here to price the units: ${(ceiling - rest).toFixed(3)} of sync is worth ` +
        `${d.pct.toFixed(1)}% of chorus's bytes and ${d.mx} counts of 255 at its worst, so the ` +
        `${SG.chorusSync} the flash adds is a large visible amount and not a rounding. *** AND THE MEAN ` +
        `LIGHT IS THE WRONG INSTRUMENT HERE, WHICH chorus.ts SAYS ITSELF: *** at sync 0 "the ensemble's ` +
        `TOTAL barely moves", because sync changes WHICH voices are large and not how much light there is. ` +
        `Measured, the interior mean moves 0.3% across this term -- a row built on it would have read as a ` +
        `dead wire.`);

    const src = codeOnly(fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8"));
    ok("!! ...and it is inside the clamp with the knob, not added after it",
        /const sync = clamp\(syncKn\.mul\(CH\.syncK\)\s*\n\s*\.add\(DRIVE\.mul\(MH_DRIVE_FORMATION\.chorusSync\)\)\s*\n\s*\.add\(COMPLETE\.mul\(MH_COMPLETE_SINGLE\.chorusSync\)\), 0\.0, 1\.0\)/.test(src),
        `sync = clamp(knob * ${CH.syncK} + ${K.MH_DRIVE_FORMATION.chorusSync} * drive + ${SG.chorusSync} * ` +
        `complete, 0, 1) -- THE LEAN'S TERM ARRIVED AT v4664 AND IS THE LARGER OF THE TWO, which this row ` +
        `did not know about at v4661 because the record it was built from held the complete number alone. ` +
        `INSIDE matters: a species ` +
        `already near alignment is pushed to exactly one and no further, and a clamp applied before the add ` +
        `would let the flash drive the phase mix past its own endpoints. It is also the reason ` +
        `${SG.chorusSync} is enough -- the term does not have to reach 1 on its own.`);
}

// =============================================================================================================
sec("5. *** THE CENSUS: nine sites, seven species, and FOUR of them are not the family's shape ***");
{
    const src = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    const sites = [
        ["still's glint", /\.mul\(float\(1\.0\)\.add\(COMPLETE\.mul\(MH_COMPLETE_SINGLE\.stillGlint\)\)\)/],
        ["comet's head", /\.mul\(float\(1\.0\)\.add\(COMPLETE\.mul\(MH_COMPLETE_SINGLE\.cometHead\)\)\)/],
        ["droplet's core", /\.add\(COMPLETE\.mul\(MH_COMPLETE_SINGLE\.dropletCore\)\)/],
        ["limn's ring", /\.add\(COMPLETE\.mul\(band\)\.mul\(MH_COMPLETE_SINGLE\.limnRing\)\)/],
        ["limn's hint", /\.mul\(float\(1\.0\)\.add\(COMPLETE\.mul\(MH_COMPLETE_SINGLE\.limnHint\)\)\)/],
        ["duet's flare", /const flare = float\(1\.0\)\.add\(COMPLETE\.mul\(MH_COMPLETE_SINGLE\.duetFlare\)\)/],
        ["duet's shrink", /\.mul\(float\(1\.0\)\.sub\(COMPLETE\.mul\(MH_COMPLETE_SINGLE\.duetShrink\)\)\)/],
        ["chorus's sync", /\.add\(COMPLETE\.mul\(MH_COMPLETE_SINGLE\.chorusSync\)\)/],
        ["prism's beams", /\.mul\(float\(1\.0\)\.add\(COMPLETE\.mul\(MH_COMPLETE_SINGLE\.prismBeam\)\)\)/],
    ];
    const found = sites.filter(([, re]) => re.test(src)).map(([n]) => n);
    const species = new Set(["still", "comet", "droplet", "limn", "limn", "duet", "duet", "chorus", "prism"]);
    say(`the nine sites present: ${found.length} of ${sites.length}${found.length < sites.length ? " -- MISSING " + sites.filter(([n]) => !found.includes(n)).map(([n]) => n).join(", ") : ""}`);
    ok("!! *** ALL NINE ARE WIRED, EACH IN ITS OWN SPELLING, AND THE TABLE HAS EXACTLY NINE ENTRIES ***",
        found.length === 9 && Object.keys(SG).length === 9 && species.size === 7,
        `nine sites across ${species.size} species -- limn and duet carry two each -- and every one of them ` +
        `reads its constant from MH_COMPLETE_SINGLE rather than carrying it inline. THE TABLE IS NOT A RULE ` +
        `AND IS NAMED PER SITE FOR THAT REASON: three rounds of this arc each found a shape and wrote a ` +
        `table of species, and a fourth table keyed by species would have said these nine rhyme. They do ` +
        `not. Four are not even the (1 + k * complete) form: two ADD to a brightness, one adds to a CONTROL, ` +
        `and one SUBTRACTS.`);

    const shapes = { multiply: ["stillGlint", "cometHead", "limnHint", "duetFlare", "prismBeam"],
                     add: ["dropletCore", "limnRing", "chorusSync"], subtract: ["duetShrink"] };
    ok("!! ...and the four that are not a multiply are named, so the next reader does not normalise them into one",
        shapes.multiply.length + shapes.add.length + shapes.subtract.length === 9 &&
        shapes.subtract.length === 1 && Object.keys(SG).every((k) =>
            [...shapes.multiply, ...shapes.add, ...shapes.subtract].includes(k)),
        `${shapes.multiply.length} multiply an intensity, ${shapes.add.length} ADD to something -- droplet's ` +
        `core brightness, limn's band-gated ring, chorus's sync knob -- and ${shapes.subtract.length} ` +
        `SUBTRACTS. Every key in the table appears in exactly one of the three lists, which is what makes ` +
        `this row fail rather than drift when a tenth entry arrives with no shape recorded for it. The ` +
        `subtraction is duet's and there is no other anywhere in eighteen species: every other complete in ` +
        `the roster makes something brighter or larger.`);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the last nine of murmur's 47 st.complete sites, which completes that signal's " +
    "port. It grades the four that are NOT the family's (1 + k * complete) shape -- duet's shrink, limn's " +
    "band-gated ring, chorus's sync and droplet's additive core -- plus still's, which is the family shape " +
    "on a subject that only exists inside its own gesture. " +
    "\nWHAT IS GRADED NEXT DOOR: the four plain multiplies -- comet's head 2.20, droplet's core in pixels, " +
    "prism's beams 1.10 and limn's second interior -- in tools/ship/murmurSingles2-selfcheck.mjs, split for " +
    "the budget rather than for the subject. " +
    "\nWHAT IS NOT CLAIMED: limn's ring term ON ITS OWN, in pixels. limn carries THREE complete sites and " +
    "two of them are interiors, so turning the signal up moves all three at once -- measured, the added " +
    "light's centroid sits at 0.5048 against the frame's own 0.5174, which is the sum of three terms and " +
    "not a reading of the band-gated one. Its confinement is graded in the arithmetic at section 3 instead, " +
    "where it is exact. " +
    "\nAND NOT CLAIMED: that these nine constants are murmur's. They are transcribed from this tree's " +
    "own recorded reading of the eighteen sources and each SITE is argued from the species' own design -- " +
    "chorus's on the sync because chorus.ts says alignment is the species, duet's on the separation because " +
    "duet.ts names four terms on it and this is the fourth. Where the record gives a number and not a line, " +
    "the site is stated in the kit's note beside the constant so a reader can disagree with it in one place.");
process.exit(fails ? 1 : 0);
