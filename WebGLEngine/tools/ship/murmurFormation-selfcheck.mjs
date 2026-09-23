// WebGLEngine/tools/ship/murmurFormation-selfcheck.mjs -- v4664
//
// *** RESPONDING HAS A THIRD THING AND THIS PORT HAD TWO OF THEM. ***
//
// v4653 ported the HEADING -- a swarm acquires an axis -- and the NARROWING -- it stops scattering around
// it. Read across murmur's eighteen sources with the upstream in front of you, st.drive does a THIRD thing
// at eight more sites, and every one of them is the same idea in that species' own terms: THE PARTS ACT IN
// FORMATION.
//
//   aura    "responding pulls the tilts halfway toward a common one ... What drive actually does is make
//           them travel together and faster, in formation." AND THE ROLLS ARE EXEMPT, in the same breath:
//           "The rolls -- which are what keeps the sheets in visibly different planes -- do not align."
//   opal    "Responding brightens them in sequence along the procession axis" and "Under drive they all
//           lean the same way: a procession, not a swarm."
//   chorus  the LEAN pushes the sync knob, at 0.85 -- larger than the flash's 0.55, which v4661 took alone.
//   flux    "responding stills the turn and leans it."
//
// plus three plain brightnesses -- arc's shimmer, flux's and prism's gains -- which belong with them because
// they are the same signal at the same instant and nothing else in the roster carries them.
//
// *** TWO OF THE SIX SPECIES DID NOT RESPOND TO RESPONDING AT ALL. *** chorus and flux each moved 0 of 9,216
// bytes between drive 0 and drive 1 -- measured on a worktree of v4663, on these identical frames.
//
// *** NOT ONE OF THE EIGHT IS A CLOCK, which is worth stating after four rounds of integrating. *** Every
// one multiplies an amplitude, mixes toward a constant or moves a knob inside a clamp, so all eight read the
// INSTANTANEOUS drive and none has an integral. Nothing here can teleport.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { sp, renderSpecies, interiorMeanLight } from "./murmurSpeciesFrames.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurFormation-selfcheck -- RESPONDING's third thing, and the two species that ignored it entirely\n");

const FM = K.MH_DRIVE_FORMATION, AU = K.MH_AURA, RESPONDING = 3, T = 11.0;

// =============================================================================================================
sec("1. *** aura's RIBBONS COME HALFWAY INTO FORMATION, AND THE ROLL IS EXEMPT BY DESIGN ***");
{
    const spread = (a) => Math.max(...a) - Math.min(...a);
    const at = (d) => {
        const t = d * FM.auraHalf;
        const ay = [0, 1, 2].map((k) => { const raw = K.mhDrift(T, AU.yawRate[k], AU.yawWob[k], AU.yawLane[k]) + AU.yawPhase[k];
            return raw + (FM.auraYaw - raw) * t; });
        const ax = [0, 1, 2].map((k) => { const raw = AU.tiltB[k] + Math.sin(T * AU.tiltRate[k] + AU.tiltPhase[k]) * AU.tiltAmp[k];
            return raw + (FM.auraTilt - raw) * t; });
        const ro = [0, 1, 2].map((k) => AU.rollB[k] + Math.sin(T * AU.rollRate[k] + AU.rollPhase[k]) * AU.rollAmp[k]);
        return { ay: spread(ay), ax: spread(ax), ro: spread(ro) };
    };
    const lo = at(0), hi = at(1);
    say(`yaw spread ${lo.ay.toFixed(4)} -> ${hi.ay.toFixed(4)}; tilt ${lo.ax.toFixed(4)} -> ${hi.ax.toFixed(4)}; ROLL ${lo.ro.toFixed(4)} -> ${hi.ro.toFixed(4)}`);
    ok("!! *** THE TWO THAT ALIGN HALVE EXACTLY AND THE ONE THAT MUST NOT DOES NOT MOVE AT ALL ***",
        Math.abs(hi.ay / lo.ay - 0.5) < 1e-12 && Math.abs(hi.ax / lo.ax - 0.5) < 1e-12 &&
        hi.ro === lo.ro && lo.ro > 1,
        `at full drive the three ribbons' yaws close from ${lo.ay.toFixed(4)} to ${hi.ay.toFixed(4)} and ` +
        `their tilts from ${lo.ax.toFixed(4)} to ${hi.ax.toFixed(4)} -- EXACTLY half in both, because the mix ` +
        `weight is ${FM.auraHalf} * st.drive and a mix toward a common target closes a spread by its own ` +
        `weight whatever the three values are. The ROLL spread is ${hi.ro.toFixed(4)}, the same number to ` +
        `the bit. *** THE EXEMPTION IS THE DESIGN AND aura.ts STATES IT IN THE SAME BREATH AS THE RULE: *** ` +
        `"The rolls -- which are what keeps the sheets in visibly different planes -- do not align at all." ` +
        `Three sheets agreeing on all three angles are ONE sheet drawn three times, so a port that aligned ` +
        `the roll as well would read as the species collapsing under the lean. AND IT IS HALF AND NOT ALL: ` +
        `"pulls the tilts HALFWAY toward a common one" is the sentence, and ${FM.auraHalf} is the number ` +
        `that makes it true rather than nearly true.`);

    const raw = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    ok("!! ...and the shader mixes the yaw and the tilt and leaves RO untouched, which a spread alone cannot show",
        /AY\.push\(mix\(KIT\.mhDrift/.test(raw) && /AX\.push\(mix\(float\(AU\.tiltB\[k\]\)/.test(raw) &&
        /RO\.push\(float\(AU\.rollB\[k\]\)\.add\(sin\(/.test(raw) && !/RO\.push\(mix\(/.test(raw),
        `the spread row above is arithmetic and would read identically if the shader aligned all three and ` +
        `this file's CPU twin aligned two -- the numbers come from the kit, not from the compiled graph. So ` +
        `the source is read as well: AY and AX are mixes and RO is not. TWO HALVES OF ONE CLAIM, and the ` +
        `half that a gate usually forgets is the one saying the code does what the table describes.`);
}

// =============================================================================================================
sec("2. *** opal's FOUR FLASHES BECOME A PROCESSION: two mixes, both by st.drive outright ***");
{
    // *** THE FIRST CUT OF THIS SECTION MEASURED A SPREAD AND THE SPREAD DISTINGUISHES NOTHING. *** It
    // compared the four lives' mean spread at rest (0.6200) against the procession's (0.6218) and asserted
    // the second was "> 0.2" -- two numbers a thousandth apart, and a bound neither could fail. A procession
    // and four independent breaths hold the SAME spread by construction: both are four values of one
    // bounded function at four phases. What separates them is not how far apart they are, it is whether
    // they are the SAME function at a FIXED lag.
    //
    // So the statistic is a cross-correlation of flash 0 against flash 1 SHIFTED BY THE LAG THE CONSTANTS
    // PREDICT. A travelling wave scores 1; four incommensurate breaths score nothing; and the same wave at
    // ZERO shift scores nothing either, which is the half that proves it is a wave and not a common pulse.
    const wave = (k, t) => FM.opalLifeB + FM.opalLifeK * Math.max(Math.sin(2 * Math.PI * t / FM.opalPeriod - k * FM.opalLane), 0);
    const own = (k, t) => K.opalLife(k, t);
    const lag = FM.opalLane / (2 * Math.PI) * FM.opalPeriod;
    const corrAt = (f, shift) => {
        let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0, n = 0;
        for (let t = 0; t < 200; t += 0.05) {
            const x = f(0, t), y = f(1, t + shift);
            sx += x; sy += y; sxy += x * y; sxx += x * x; syy += y * y; n++;
        }
        const cx = sxy / n - (sx / n) * (sy / n), vx = sxx / n - (sx / n) ** 2, vy = syy / n - (sy / n) ** 2;
        return cx / Math.sqrt(vx * vy);
    };
    const cWave = corrAt(wave, lag), cOwn = corrAt(own, lag), cZero = corrAt(wave, 0);
    say(`neighbour correlation at the predicted ${lag.toFixed(4)} s lag: procession ${cWave.toFixed(6)}, their own breaths ${cOwn.toFixed(6)}`);
    say(`the same procession at ZERO shift: ${cZero.toFixed(6)} -- which is what says it travels rather than pulses together`);
    ok("!! *** THE PROCESSION IS ONE FUNCTION AT A FIXED LAG: correlation 1.000000 where the breaths score -0.06 ***",
        cWave > 0.999999 && Math.abs(cOwn) < 0.2 && Math.abs(cZero) < 0.2 && lag > 0.5,
        `flash 0 against flash 1 shifted by ${lag.toFixed(4)} s -- the lag ${FM.opalLane} rad on a ` +
        `${FM.opalPeriod} s period predicts -- correlates ${cWave.toFixed(6)} under the procession and ` +
        `${cOwn.toFixed(6)} on their own breaths, which are three incommensurate rates apiece and line up ` +
        `with nothing. *** AND THE SAME WAVE AT ZERO SHIFT SCORES ${cZero.toFixed(6)}, WHICH IS THE HALF ` +
        `THAT MATTERS: *** a common pulse would correlate at zero and this does not, so the four flashes ` +
        `file PAST in order rather than brightening together. opal.ts spends its opening refusing the ` +
        `second reading -- "a procession, not a swarm" -- and the fk*${FM.opalLane} lane offset is the one ` +
        `term that makes the difference.`);

    const raw = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    ok("!! *** AND THE ORDER IS murmur's: DRIVE MIXES FIRST, THEN complete SATURATES ***",
        /mix\(KIT\.mhOpalLife\(float\(fk\), uniforms\.time\), wave, DRIVE\)/.test(raw) &&
        /const c = mix\(c0, c0\.mul\(FM\.opalKeep\)/.test(raw),
        `opal.ts writes life = mix(life, wave, st.drive) and THEN life = mix(life, 1.0, st.complete * 0.85). ` +
        `At full drive AND full complete the two orders agree -- both land on 1.0 -- so the difference lives ` +
        `entirely at PARTIAL complete, where the saturation pulls from wherever the procession left the ` +
        `flash rather than from its resting breath. A round that got this backwards would be exactly right ` +
        `at both ends of the flash and wrong through all of it, which is the same shape as every mix this ` +
        `arc has had to be careful about. The WANDER takes the second mix on the same travelling phase: ` +
        `c keeps ${FM.opalKeep} of its own path and adds a common lean, "a procession, not a swarm".`);
}

// =============================================================================================================
sec("3. *** chorus AND flux DID NOT RESPOND TO RESPONDING AT ALL ***");
{
    const SPEC = ["chorus", "flux", "prism"];
    const FR = [];
    for (const s of SPEC) {
        FR.push(sp(s, T, undefined, { stateIndex: RESPONDING, stateTau: 0 }));
        FR.push(sp(s, T, undefined, { stateIndex: RESPONDING, stateTau: 0.55 }));
    }
    const run = await renderSpecies(FR);
    if (!run.ok || !run.frames || run.frames.length !== FR.length) {
        ok("!! the formation renders at all", false,
            `could not render: ${run.reason || (run.skipped ? "skipped: " + run.skipped : "frame count")}.`);
    } else {
        say(`backend: ${run.isWebGPUBackend ? "REAL WebGPU" : "WebGL2 fallback"}; ${FR.length} frames over ${SPEC.length} species`);
        const diff = (a, b) => { let n = 0, mx = 0;
            for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) n++; if (d > mx) mx = d; }
            return { pct: 100 * n / a.length, mx }; };
        const WAS = { chorus: 0.0, flux: 0.0, prism: 16.6 };
        const R = SPEC.map((s, i) => ({ s,
            d: diff(run.frames[i * 2], run.frames[i * 2 + 1]),
            x: interiorMeanLight(run.frames[i * 2 + 1]).mean / interiorMeanLight(run.frames[i * 2]).mean }));
        for (const r of R)
            say(`${r.s.padEnd(7)} drive 0 -> 1: ${r.d.pct.toFixed(1)}% of bytes move, worst ${r.d.mx}, interior x${r.x.toFixed(4)}   (at v4663: ${WAS[r.s].toFixed(1)}%)`);
        const ch = R[0], fx = R[1], pr = R[2];
        ok("!! *** TWO SPECIES MOVED 0 OF 9,216 BYTES ACROSS THE WHOLE LEAN, AND BOTH MOVE A SIXTH OF THEM NOW ***",
            ch.d.pct > 10 && ch.d.mx > 50 && fx.d.pct > 10 && fx.d.mx > 20,
            `chorus ${ch.d.pct.toFixed(1)}% and flux ${fx.d.pct.toFixed(1)}%, against 0.0% and worst 0 at ` +
            `v4663 -- measured on a worktree of that commit, on these identical frames. chorus's whole ` +
            `subject is alignment and murmur gives its sync knob 0.85 of the lean; flux's display "stills ` +
            `the turn and leans it". NEITHER HAD ANY OTHER st.drive SITE, so RESPONDING reached no pixel of ` +
            `either species -- the state murmur designs a heading, a narrowing and a formation for.`);

        ok("!! ...and the two brightness gains are visible as LIGHT, which is the instrument they need",
            pr.x > 2.0 && fx.x > 1.2 && pr.x / fx.x > 1.4,
            `prism's interior goes x${pr.x.toFixed(4)} and flux's x${fx.x.toFixed(4)} between drive 0 and ` +
            `drive 1, and murmur's two coefficients are ${FM.prismBright} and ${FM.fluxBright} -- the larger ` +
            `gain on the larger reading, in the right order. A BYTE COUNT IS THE WRONG INSTRUMENT FOR A ` +
            `GAIN and this gate learned that the expensive way at v4662: prism already moved 16.6% of its ` +
            `bytes at v4663 through its fan narrowing, so "it moves" was true of it before this round ` +
            `began. What is new is how much LIGHT is there, which is what a brightness coefficient means.`);
    }
}

// =============================================================================================================
sec("3b. *** flux's TURN STILLS, AND opal's WANDER CLOSES -- the two the battery walked through ***");
{
    // *** BOTH OF THESE WENT MISSING FROM THE FIRST CUT AND A SABOTAGE FOUND THEM. *** Deleting flux's turn
    // mix and deleting opal's common lean each left this gate entirely green: section 3 asks whether flux
    // MOVES under the lean and it still did, through its brightness gain, and opal has no pixel row at all.
    // A species answering the lean for one of two reasons is not evidence about the other.
    const FX = K.MH_FLUX;
    const yaw = (t, d) => { const raw = K.mhDrift(t, FX.yawRate, FX.yawWob, FX.yawLane);
        return raw + (FM.fluxYaw - raw) * (d * FM.fluxTurn); };
    const swing = (d) => { let lo = 1e9, hi = -1e9;
        for (let t = 0; t < 600; t += 0.5) { const v = yaw(t, d); lo = Math.min(lo, v); hi = Math.max(hi, v); }
        return hi - lo; };
    const s0 = swing(0), s1 = swing(1);
    say(`flux's yaw swings ${s0.toFixed(4)} rad over ten minutes at rest and ${s1.toFixed(4)} at full lean -- a ratio of ${(s1 / s0).toFixed(6)}`);
    // *** AND THE BOUND IS 0.40 WRITTEN OUT, NOT (1 - FM.fluxTurn). *** The first cut asserted the measured
    // ratio equalled one minus the table's own weight, which is true for EVERY weight including zero -- so
    // deleting flux's turn mix set both sides to 1 and the row passed. A check whose expectation is derived
    // from the thing it is checking grades nothing; this tree has found that shape in a table, in a census
    // and now in a ratio. The literal is murmur's number and the identity is asserted beside it.
    ok("!! *** THE TURN STILLS TO 0.40 OF ITS SWING, AND THAT IS EXACTLY (1 - 0.60) -- both halves ***",
        Math.abs(s1 / s0 - 0.40) < 1e-9 && Math.abs(s1 / s0 - (1 - FM.fluxTurn)) < 1e-9 &&
        FM.fluxTurn > 0 && s1 < s0 * 0.9 && s0 > 5,
        `flux.ts: ay = mix(mh_drift(t, ...), ${FM.fluxYaw}, st.drive * ${FM.fluxTurn}) -- "responding stills ` +
        `the turn and leans it". A mix toward a CONSTANT leaves a signal's swing scaled by one minus the ` +
        `weight whatever the signal is doing, so the ratio is ${(1 - FM.fluxTurn).toFixed(2)} exactly and ` +
        `not approximately. AND IT IS NOT A RATE CHANGE, which is why this is here and not in the clock arc: ` +
        `at full drive the yaw is ${FM.fluxYaw} plus a shrunken wobble whatever the clock has accumulated, ` +
        `so nothing about it can teleport. A SABOTAGE THAT DELETED IT WALKED THROUGH SECTION 3: flux still ` +
        `moved under the lean, through the brightness gain on the same round, and "it moves" is not "it ` +
        `stills".`);

    // ...and opal's wander: the four paths keep 0.55 of their own and take a common lean
    const c0 = (k, t) => [0.44 * Math.sin(t * 0.08 * (0.83 + 0.11 * k) + k * 2.1),
                          0.40 * Math.sin(t * 0.08 * (0.67 + 0.13 * k) + k * 3.7 + 1.1),
                          0.42 * Math.sin(t * 0.08 * (0.95 + 0.09 * k) + k * 1.3 + 2.6)];
    const leanAt = (k, t) => { const q = Math.sin(2 * Math.PI * t / FM.opalPeriod - k * FM.opalLane);
        return FM.opalLean.map((x) => x * q); };
    const at2 = (k, t, d) => { const a = c0(k, t), b = a.map((x, i) => x * FM.opalKeep + leanAt(k, t)[i]);
        return a.map((x, i) => x + (b[i] - x) * d); };
    const apart = (d) => { let sum = 0, n = 0;
        for (let t = 0; t < 400; t += 0.5) { const P = [0, 1, 2, 3].map((k) => at2(k, t, d));
            for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
                sum += Math.hypot(...P[i].map((x, q) => x - P[j][q])); n++; } }
        return sum / n; };
    const a0 = apart(0), a1 = apart(1);
    say(`opal's four flashes sit ${a0.toFixed(4)} apart on average at rest and ${a1.toFixed(4)} at full lean -- ${(100 * (1 - a1 / a0)).toFixed(1)}% closer`);
    ok("!! ...and opal's four paths close on each other while the lean carries them, which is what a procession is",
        a1 < a0 * 0.95 && a1 > a0 * 0.5 && FM.opalKeep > 0 && FM.opalLean.some((x) => x !== 0),
        `each flash keeps ${FM.opalKeep} of its own wander and takes a COMMON offset on the travelling ` +
        `phase, so the four draw in without landing on top of each other -- ${(100 * (1 - a1 / a0)).toFixed(1)}% ` +
        `closer and not 100%. THE TWO HALVES ARE BOTH THE POINT: a keep of 0 would make four flashes into ` +
        `one, which is the swarm-to-blob reading opal.ts refuses, and a lean of zero would leave them ` +
        `wandering independently while their LIVES processed, which is half a species. This row and the ` +
        `correlation above are the two halves of "a procession, not a swarm" -- when they move, and where.`);
}

// =============================================================================================================
sec("4. *** arc's SHIMMER, WHICH NO FRAME CAN ISOLATE -- and the reason is stated rather than worked around ***");
{
    const AR = K.MH_ARC;
    const shim = (pace, drive) => pace * AR.shimPace + drive * FM.arcShim;
    say(`arc's shimAmt is shimGate * (${AR.shimPace}*pace + ${FM.arcShim}*drive); at pace 0 it was ${shim(0, 1) - FM.arcShim} before this round and is ${shim(0, 1)} now`);
    ok("!! *** THE LEAN ALONE NOW RAISES arc's SHIMMER, WHICH WAS IDENTICALLY ZERO AT ZERO CADENCE ***",
        FM.arcShim > 0 && shim(0, 1) === FM.arcShim && shim(1, 0) === AR.shimPace &&
        /\.mul\(PACE\.mul\(AR\.shimPace\)\.add\(DRIVE\.mul\(MH_DRIVE_FORMATION\.arcShim\)\)\)/.test(
            fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8")),
        `arc.ts: shimAmt = shimGate * (${AR.shimPace} * live.pace + ${FM.arcShim} * st.drive), and the two ` +
        `are ADDED so either signal alone raises it. This port carried the cadence term alone, so arc's ` +
        `filament shimmered when somebody spoke quickly and NOT AT ALL when the assistant leaned in, ` +
        `however hard. At pace 0 the shimmer was exactly 0 at every drive and is ${shim(0, 1)} of the gate ` +
        `at full lean. *** AND THERE IS NO FRAME ROW FOR IT, WHICH IS MEASURED AND NOT AN OMISSION: *** ` +
        `st.drive also drives arc's sway and pin narrowing, so between drive 0 and drive 1 the species' ` +
        `whole geometry moves and its interior light goes x0.7559 -- DARKER. A shimmer is a texture on a ` +
        `filament that is simultaneously being narrowed and swung, and no statistic this gate can afford ` +
        `separates the two. The arithmetic and the source are the altitude that can answer.`);
}

// =============================================================================================================
sec("5. *** THE CENSUS, AGAINST murmur's OWN SOURCES: every st.drive site in the roster ***");
{
    const raw = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    const kit = fs.readFileSync(path.join(ENG, "render", "murmurKit.mjs"), "utf8");
    const both = raw + kit;
    // Every st.drive coefficient murmur writes, read off the upstream sources at v4664 and listed here so
    // the port can be checked against the SOURCE rather than against this tree's own memory of it.
    const MURMUR = [
        ["abyss slot", "1.60"], ["abyss heading", "0.80"], ["abyss narrowing", "0.7"],
        ["arc sway", "0.55"], ["arc pin", "0.40"], ["arc shimmer", "0.75"],
        ["aura rate", "1.05"], ["aura align", "0.50"],
        ["comet rate", "0.95"], ["comet decay", "1.25"],
        ["duet sep", "0.34"], ["duet rate", "0.90"], ["duet braid", "0.16"],
        ["fathom sp", "1.10"], ["geode sp", "1.00"],
        ["helix strand", "0.35"], ["helix climb", "0.85"], ["helix r0", "0.14"],
        ["limn wobble", "0.14"], ["limn rate", "1.05"], ["limn tailK", "0.30"], ["limn offT", "0.30"],
        ["prism fan", "0.62"], ["prism bright", "0.55"],
        ["sol heading", "0.70"], ["still slot", "1.70"], ["still heading", "1.00"], ["still narrowing", "0.7"],
        ["nebula drift", "0.90"], ["nebula adv", "0.42"], ["tempest energy", "0.55"], ["tempest adv", "0.50"],
        ["chorus sync", "0.85"], ["flux turn", "0.60"], ["flux rate", "0.95"], ["flux bright", "0.35"],
        ["opal drift", "0.95"], ["droplet flow", "0.30"],
    ];
    const missing = MURMUR.filter(([, v]) => !both.includes(v));
    say(`murmur's st.drive coefficients checked against the port: ${MURMUR.length - missing.length} of ${MURMUR.length} present`);
    ok("!! *** EVERY st.drive COEFFICIENT murmur WRITES IS SOMEWHERE IN THIS PORT'S TABLES ***",
        missing.length === 0,
        `${MURMUR.length} coefficients, read off krispuckett/murmur-web at v4664 rather than off this ` +
        `tree's own notes, and every one of them appears in render/murmurKit.mjs or the shader. *** THIS IS ` +
        `A WEAK CHECK AND IT IS HERE BECAUSE IT IS THE ONE A CENSUS CAN MAKE: *** a number being present ` +
        `does not prove it is on the right expression -- v4663 found tempest's 0.85 sitting correctly in the ` +
        `table and multiplying the WRONG SIGNAL, and no census of constants could have seen that. What this ` +
        `catches is the other failure, the one that has happened more often here: a coefficient murmur ` +
        `writes that this port simply does not have. Eight of these arrived in this round and the six ` +
        `rounds before it found nineteen more.`);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: RESPONDING's third thing. v4653 ported the heading and the narrowing; read " +
    "across murmur's own sources, st.drive does one more thing at eight sites and it is FORMATION -- aura's " +
    "ribbons pulled halfway into line, opal's four flashes into a procession, chorus's voices into sync, " +
    "flux's turn stilled and leaned, and three brightnesses. chorus and flux moved 0 of 9,216 bytes across " +
    "the whole lean before this round: RESPONDING reached no pixel of either. " +
    "\nWHAT IT CLAIMS AND HOW: aura's alignment in arithmetic, because the three ribbons' angles are the " +
    "claim and 48 px cannot resolve three sheets' planes; opal's procession likewise; chorus's and flux's " +
    "arrival in pixels, where zero is zero; the two brightness gains as LIGHT rather than as moved bytes, " +
    "because prism already moved 16.6% of its bytes through its narrowing before this round. " +
    "\nWHAT IS NOT CLAIMED: arc's shimmer in pixels. st.drive moves arc's sway and pin at the same instant, " +
    "so the species' geometry changes underneath the texture and its interior goes x0.7559 -- darker -- " +
    "between the two frames. Section 4 measures that and says so rather than offering a row that would pass " +
    "for the wrong reason.");
process.exit(fails ? 1 : 0);
