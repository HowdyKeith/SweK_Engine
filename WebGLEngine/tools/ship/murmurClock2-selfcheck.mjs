// WebGLEngine/tools/ship/murmurClock2-selfcheck.mjs -- v4655
//
// *** THE CLOCKS WHOSE OUTPUT IS MULTIPLIED -- THE HALF LAST ROUND'S CENSUS COULD NOT SEE. ***
//
// v4654 integrated the species' clocks and printed, in its own section 3: "modulated rates still on murmur's
// rate * t: (none)". TWO WERE STILL TELEPORTING WHILE IT SAID SO. The census inspected mh_drift's RATE
// ARGUMENT, and only when that argument was a bare identifier it could chase back to a `const` -- so a clock
// built the other way round, with a constant rate and the WHOLE RESULT multiplied by a live signal
// afterwards, was invisible to it. mist (nebula and tempest) and flux both carried exactly that shape.
//
// A census that reports a clean result about a subset it never names is this tree's oldest defect and the one
// it keeps rediscovering; the difference this time is that it was one round old. The repaired census lives in
// tools/ship/murmurClock-selfcheck.mjs section 3 with a fixture that makes it fail if it regresses. THIS gate
// carries what the repair itself has to be true for.
//
// *** THE ARITHMETIC IS NOT THE SAME AS THE RATE FAMILY'S, AND THE DIFFERENCE IS THE WOBBLE. *** mh_drift is
//     drift(t, rate, wobble, lane) = rate*t + (k*rate/w2) * sin(w2*t + lane*1.71)
// a secular term plus a bounded wobble whose AMPLITUDE is proportional to the rate. murmur multiplies the
// whole thing by F = 1 + a*pace + b*voice + c*drive, which scales both. Only the secular term grows without
// limit, so only it can teleport: the wobble is bounded by k*rate*F/w2 whatever F does. The repair therefore
// puts the signal integrals in the SECULAR term and leaves the wobble's amplitude reading the instantaneous
// factor -- which is not a compromise but the exact continuation of what murmur wrote, because
//     (base*t + (k*base/w2)*sin) * F   IS   base*F*t + (k*base*F/w2)*sin
// and the first summand is the only one with a t in it.
//
// *** helix IS HERE FOR THE OPPOSITE REASON: ITS CLIMB HAD NO SIGNAL AT ALL. *** helix.ts scales its climb by
// (1 + 0.75*live.pace + 0.85*st.drive) and this port carried the bare drift, so the strands rose at one speed
// whatever the exchange was doing -- on the one species whose own brief is whether somebody says "DNA" inside
// three seconds. Two of murmur's numbers that were simply absent. Added in the integrated form, because
// adding them as murmur spells them would have shipped a new teleport on the same afternoon as the repair.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { createPresenceState, STATES, STATE_INDEX } from "../../render/aiPresenceOrbState.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { sp, renderSpecies } from "./murmurSpeciesFrames.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurClock2-selfcheck -- the clocks whose OUTPUT is multiplied\n");

const DT = 1 / 60;
// The two subjects, written out by hand rather than read off MH_* so this file can DISAGREE with the port --
// the v4579 distinction: a gate that re-states the formula it grades grades nothing.
//   nebula.ts / tempest.ts:  drift(t, drB + foldK*drK, 0.45, drLane) * (1 + 0.95*energy + 0.35*live.voice)
//                            with energy = clamp(0.85*live.voice, 0, 1.6) on tempest and 0 on nebula
//   helix.ts:                drift(t, climb, 0.44, 5.0) * (1 + 0.75*live.pace + 0.85*st.drive)
const MIST_BASE = 0.070 + 0.5 * 0.075, MIST_KV = 0.85 * 0.95 + 0.35;      // tempest at foldK 0.5
const HELIX_BASE = (0.20 + 0.5 * 0.30) * 1.0, HELIX_KP = 0.75, HELIX_KD = 0.85;
const WOB_MIST = 0.45, WOB_HELIX = 0.44, LANE_MIST = 3.0, LANE_HELIX = 5.0;

/**
 * Settle for `settle` seconds of shader time in IDLE, then drive the subject's signal to full and watch ONE
 * FRAME AT A TIME -- the worst single-frame advance is what a viewer sees as a jump.
 */
function ramp(settle, kind) {
    const st = createPresenceState("idle");
    for (let i = 0; i < Math.round(settle / DT); i++) st.tick(DT, { activity: 0, voice: 0 });
    if (kind === "helix") st.setState("responding");
    let pI = null, pN = null, wI = 0, wN = 0;
    for (let i = 0; i < Math.round(3.0 / DT); i++) {
        st.tick(DT, kind === "helix" ? { activity: 1.0, voice: 0 } : { voice: 1.0, activity: 0 });
        const p = st.getParams();
        const si = STATE_INDEX[p.state];
        const lv = K.mhLive(p.voice, p.activity, si), stn = K.mhState(si, p.stateTau);
        let integ, naive;
        if (kind === "helix") {
            integ = K.mhRatePhase(HELIX_BASE, p.phase, HELIX_KP, p.paceInt, 0, 0, HELIX_KD, p.driveInt);
            naive = HELIX_BASE * (1 + HELIX_KP * lv.pace + HELIX_KD * stn.drive) * p.phase;
        } else {
            integ = K.mhRatePhase(MIST_BASE, p.phase, 0, 0, MIST_KV, p.voiceInt, 0, 0);
            naive = MIST_BASE * (1 + MIST_KV * lv.voice) * p.phase;
        }
        if (pI !== null) { wI = Math.max(wI, Math.abs(integ - pI)); wN = Math.max(wN, Math.abs(naive - pN)); }
        pI = integ; pN = naive;
    }
    return { wI, wN };
}

// =============================================================================================================
sec("1. *** MULTIPLYING THE WHOLE DRIFT AND INTEGRATING THE SECULAR HALF ARE THE SAME NUMBER, wherever nothing moves ***");
{
    // The row that makes the migration safe to have made: at a HELD signal P = s*t, so the repaired form
    // reproduces murmur's product exactly -- secular AND wobble, not just the part this round was aiming at.
    let worst = 0, at = "", n = 0;
    for (const base of [0.1075, 0.35, 0.052, 0.47]) for (const k of [1.1575, 0.75, 0.30]) {
        for (const s of [0, 0.27, 0.55, 1]) for (const t of [1, 10, 100, 1000, 3600]) {
            for (const [w, lane] of [[WOB_MIST, LANE_MIST], [WOB_HELIX, LANE_HELIX]]) {
                const F = 1 + k * s;
                const theirs = K.mhDrift(t, base, w, lane) * F;
                const mine = K.mhDriftPhase(K.mhRatePhase(base, t, 0, 0, k, s * t, 0, 0), base * F, w, lane, t);
                const d = Math.abs(mine - theirs);
                n++;
                if (d > worst) { worst = d; at = `base ${base} k ${k} s ${s} t ${t} lane ${lane}`; }
            }
        }
    }
    ok("!! *** THE PRODUCT AND THE INTEGRAL AGREE TO 14 DIGITS ACROSS 480 OPERATING POINTS OUT TO AN HOUR ***",
        worst < 1e-9,
        `worst |murmur's drift*F - integrated| = ${worst.toExponential(2)} over ${n} combinations of base, ` +
        `coefficient, held signal, time and lane (worst at ${at}) -- float accumulation, not a difference in ` +
        `what is computed. IT COVERS THE WOBBLE AS WELL AS THE TRAVEL: the wobble's amplitude is k*rate/w2 and ` +
        `the repaired call is handed rate*F, so the sine term is scaled by the same F murmur scales it by. A ` +
        `repair that integrated the secular half and left the wobble at the unscaled amplitude would pass a ` +
        `row about the secular half alone and change every frame this tree has recorded.`);

    // ...AND THE IDENTITY IS NOT VACUOUS. The two forms have to DIFFER while the signal is in motion, or the
    // row above is satisfied by two spellings of the same defect. This is the negative control for it.
    const moving = (() => {
        let mx = 0;
        for (const t of [10, 100, 1000]) for (const k of [1.1575, 0.75]) {
            // a signal that has been 0 for t-1 seconds and is 1 now: P is about 1, the instantaneous s is 1
            const theirs = K.mhDrift(t, 0.35, WOB_HELIX, LANE_HELIX) * (1 + k * 1);
            const mine = K.mhDriftPhase(K.mhRatePhase(0.35, t, 0, 0, k, 1.0, 0, 0), 0.35 * (1 + k), WOB_HELIX, LANE_HELIX, t);
            mx = Math.max(mx, Math.abs(mine - theirs));
        }
        return mx;
    })();
    ok("!! ...and they differ by 405 radians where the signal has just MOVED, so the identity is not two spellings of one thing",
        moving > 100,
        `a signal silent for a thousand seconds and loud for one gives |murmur - integrated| = ` +
        `${moving.toFixed(1)} rad. THE FIRST ROW IS ONLY MEANINGFUL BECAUSE OF THIS ONE: the two expressions ` +
        `agree on every steady state and disagree wherever the history is not the present, which is precisely ` +
        `the claim -- murmur bills the whole session at the rate of the current instant, and this port does not.`);
}

// =============================================================================================================
sec("2. *** WHAT THAT COSTS murmur ON THESE TWO: SIX AND TWENTY-NINE RADIANS IN A SINGLE 16.7 ms FRAME ***");
{
    const SESSIONS = [5, 30, 60, 300, 1800];
    for (const kind of ["mist", "helix"]) {
        const rows = SESSIONS.map((s) => ({ s, ...ramp(s, kind) }));
        say(`${kind === "mist" ? "tempest's cloud drift" : "helix's strand climb"}, worst ONE-FRAME advance as its signal goes to full:`);
        for (const r of rows)
            say(`   after ${String(r.s).padStart(4)}s:  integrated ${r.wI.toFixed(6)}    murmur's drift*F ${r.wN.toFixed(4)}    ${(r.wN / r.wI).toFixed(0)}x`);

        // THE CEILING IS DERIVED AND NOT CHOSEN. The secular phase advances at most base * (1 + sum of the
        // coefficients times the SUP of each conditioned signal) per second of shader time, and the state the
        // ramp ends in fixes the tempo. mh_live's own conditioning is what caps the signal -- IDLE's voice
        // weight is 0.55 and only LISTENING opens it to 1.00 -- so the sup is read out of mh_live rather than
        // assumed to be 1, which is the difference between a bound that is reached and a bound that is slack.
        const endState = kind === "helix" ? "responding" : "idle";
        const si = STATE_INDEX[endState], speed = STATES[endState].speed;
        const sup = K.mhLive(1, 1, si), supDrive = K.mhState(si, 999).drive;
        const cap = kind === "helix"
            ? HELIX_BASE * (1 + HELIX_KP * sup.pace + HELIX_KD * supDrive) * speed * DT
            : MIST_BASE * (1 + MIST_KV * sup.voice) * speed * DT;
        const worstInt = Math.max(...rows.map((r) => r.wI));
        const flat = worstInt - Math.min(...rows.map((r) => r.wI));
        ok(`!! *** ${kind}'s INTEGRATED CLOCK IS BOUNDED BY base * (1 + k*sup) * speed * dt AT EVERY SESSION LENGTH ***`,
            worstInt <= cap * (1 + 1e-9) && worstInt > 0.90 * cap && flat < 1e-12,
            `worst one-frame advance ${worstInt.toFixed(6)} rad against a derived ceiling of ` +
            `${cap.toFixed(6)} -- ${(100 * worstInt / cap).toFixed(1)}% of it, so the bound is the real one ` +
            `and not slack. The sup comes from mh_live itself (${endState}: voice caps at ` +
            `${sup.voice.toFixed(2)}, pace at ${sup.pace.toFixed(2)}, drive at ${supDrive.toFixed(2)}), not ` +
            `from 1. And it varies by ${flat.toExponential(1)} across five session lengths spanning 5 s to ` +
            `half an hour: IT DOES NOT DEPEND ON THE SESSION AT ALL, which is the whole property.`);

        const ratio = rows[4].wN / rows[0].wN, secs = SESSIONS[4] / SESSIONS[0];
        ok(`!! *** ...while murmur's reaches ${rows[4].wN.toFixed(1)} rad in one frame after half an hour, growing linearly with the wait ***`,
            rows[4].wN > (kind === "helix" ? 20 : 5) && Math.abs(ratio / secs - 1) < 0.15 &&
            rows[4].wN / rows[4].wI > 1000,
            `${rows[0].wN.toFixed(4)} rad after 5 s of running and ${rows[4].wN.toFixed(4)} after 1800 -- ` +
            `${(rows[4].wN / rows[4].wI).toFixed(0)}x the honest frame. The growth is ${ratio.toFixed(0)}x for ` +
            `${secs}x the wait, within ${(100 * Math.abs(ratio / secs - 1)).toFixed(1)}% of linear: THE ERROR ` +
            `IS t * dF AND IT HAS NO CEILING. A five-second fixture would have measured ` +
            `${rows[0].wN.toFixed(3)} and called it nothing, which is exactly how it survived to v4654.`);
    }
}

// =============================================================================================================
sec("3. *** THE FACTORING NEEDS tempest's CLAMP TO BE INERT, AND THE MARGIN IS READ OUT OF THE SOURCE ***");
{
    // mist's factor is 1 + 0.95*energy + 0.35*VOICE with energy = clamp(0.85*VOICE, lo, hi). The repair folds
    // 0.95*0.85 + 0.35 into ONE voice coefficient and sends one integral, which is only the same function if
    // the clamp never bites -- a clamp that bit would make the integral of `energy` something other than 0.85
    // times the integral of VOICE and this whole factoring would quietly stop being exact.
    //
    // BOTH NUMBERS COME OUT OF THE SHADER SOURCE. Restating 0.85 and 1.6 here would make this row a comment:
    // change either in aiPresenceOrbTsl.mjs and this recomputes instead of agreeing with itself.
    // `species === ""` and not `species === "tempest"` because codeOnly BLANKS string literals as well as
    // stripping comments -- a needle that names a species has to read the raw file instead, and this one does
    // not need to: it is after the three numbers, and the empty pair of quotes is what the ternary looks like
    // once the scanner has been through it.
    const src = codeOnly(fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8"));
    const m = /const energy = species === "" \? clamp\(VOICE\.mul\(([\d.]+)\), ([\d.-]+), ([\d.]+)\)/.exec(src);
    ok("!! the clamp's own three numbers are still where this row thinks they are", !!m,
        m ? `read gain ${m[1]}, floor ${m[2]}, ceiling ${m[3]} straight out of the shader source.` :
            `could not find tempest's energy clamp in render/aiPresenceOrbTsl.mjs -- if the expression moved, ` +
            `this row has to move with it rather than pass on a stale reading.`);
    if (m) {
        const gain = Number(m[1]), lo = Number(m[2]), hi = Number(m[3]);
        // The sup of mh_live's voice over its ENTIRE domain, including levels outside [0,1] -- the function
        // clamps its own input in both halves, so a caller cannot push it past 1 either.
        let supV = 0, infV = 1;
        for (const lvl of [-5, -1, -1e-9, 0, 0.001, 0.25, 0.5, 0.75, 0.999, 1, 1 + 1e-9, 2, 100]) {
            for (const si of [0, 1, 2, 3, 4, 5]) {
                const v = K.mhLive(lvl, 0.5, si).voice;
                supV = Math.max(supV, v); infV = Math.min(infV, v);
            }
        }
        ok("!! *** THE CLAMP CANNOT BITE AT EITHER END: 0.85 x sup(voice) = 0.85 against a ceiling of 1.6 ***",
            gain * supV < hi && infV >= lo && supV <= 1 + 1e-12 && hi / (gain * supV) > 1.5,
            `mh_live's voice output over 78 points of its full domain -- levels from -5 to 100, every state ` +
            `index -- runs [${infV.toFixed(4)}, ${supV.toFixed(4)}], because the function clamps its own ` +
            `level to [0,1] in BOTH halves of the kit and its heaviest state weight is 1.00. So energy tops ` +
            `out at ${gain} x ${supV.toFixed(4)} = ${(gain * supV).toFixed(4)} against a ceiling of ${hi}, a ` +
            `margin of ${(hi / (gain * supV)).toFixed(2)}x, and bottoms at ${(gain * infV).toFixed(4)} ` +
            `against a floor of ${lo}. THIS IS WHY THE TWO COEFFICIENTS COULD BE FOLDED INTO ONE: 0.95*${gain} ` +
            `+ 0.35 = ${(0.95 * gain + 0.35).toFixed(4)} is the voice coefficient of the WHOLE factor only ` +
            `while energy is a linear function of voice, and the clamp is the one thing that could make it ` +
            `not be. Measured, because "it probably never gets that loud" is not an argument about a bound.`);

        // ...and the folded coefficient in the shader IS that number, for tempest and for nebula alike.
        const folded = /const mistKV = \(species === "" \? 0\.85 \* 0\.95 : 0\) \+ 0\.35;/.test(src);
        ok("!! ...and nebula gets 0.35 while tempest gets 1.1575, because nebula's energy is the constant zero",
            folded && Math.abs((0.95 * gain + 0.35) - 1.1575) < 1e-12,
            `the shader folds the coefficient at BUILD time with the same ternary that decides whether energy ` +
            `exists at all, so the two species get ${(0.95 * gain + 0.35).toFixed(4)} and 0.3500. Folding it ` +
            `unconditionally would have given nebula a voice term murmur does not give it -- nebula.ts has no ` +
            `energy at all, and 0.95 times a constant zero is a term that should not appear rather than a ` +
            `term that evaluates to nothing.`);
    }
}

// =============================================================================================================
sec("4. *** helix's CLIMB: TWO OF murmur's NUMBERS THAT WERE NOT ABSENT BY DESIGN, THEY WERE JUST ABSENT ***");
{
    const kit = fs.readFileSync(path.join(ENG, "render", "murmurKit.mjs"), "utf8");
    const src = codeOnly(fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8"));
    ok("!! *** MH_HELIX CARRIES climbPace 0.75 AND climbDrive 0.85, and the climb expression READS BOTH ***",
        /climbPace: 0\.75, climbDrive: 0\.85/.test(kit) &&
        /mhRatePhase\(climbBase, uniforms\.time, float\(HX\.climbPace\), uniforms\.paceInt,/.test(src) &&
        /float\(HX\.climbDrive\), uniforms\.driveInt\)/.test(src) &&
        /climbBase\.mul\(float\(1\.0\)\.add\(PACE\.mul\(HX\.climbPace\)\)\.add\(DRIVE\.mul\(HX\.climbDrive\)\)\)/.test(src),
        `both knobs exist, both are read by mhRatePhase for the secular phase, and BOTH ARE READ AGAIN for ` +
        `the wobble amplitude -- that second reading is the one a repair forgets. The secular term and the ` +
        `rate argument must carry the SAME factor or the strands travel at one speed and shimmer at another, ` +
        `which is the identical defect aura's three lanes carry in tools/ship/murmurClock-selfcheck.mjs.`);

    // *** AND THE STRUCTURAL ROW THE OTHER TWO NEED, because only helix has one above. ***
    // The repair splits murmur's single product into two arguments: an integrated SECULAR phase and a rate
    // that is only the wobble's amplitude. Both have to carry the same base and the same factor. Passing the
    // UNSCALED base as the second argument is the easiest wrong repair available -- it leaves the travel
    // right and the shimmer wrong, it moves no row in section 5 because the travel is what those measure,
    // and it is the same defect aura's three lanes carry in murmurClock-selfcheck.mjs section 3. So: every
    // site whose wobble argument is `X.mul(...)` must be handed `mhRatePhase(X, ...)` as its secular one.
    const pairs = [];
    for (let i = 0; (i = src.indexOf("KIT.mhDriftPhase(", i)) !== -1; i += 8) {
        let j = src.indexOf("(", i), d = 0;
        for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) { j++; break; } } }
        const inner = src.slice(src.indexOf("(", i) + 1, j - 1);
        // split the top-level arguments of the call
        const args = []; let depth = 0, last = 0;
        for (let q = 0; q < inner.length; q++) {
            if (inner[q] === "(") depth++;
            else if (inner[q] === ")") depth--;
            else if (inner[q] === "," && depth === 0) { args.push(inner.slice(last, q).trim()); last = q + 1; }
        }
        args.push(inner.slice(last).trim());
        // arg1 is the secular phase, arg2 the wobble amplitude. A site whose amplitude is `X.mul(F)` is
        // scaled, and there are exactly TWO ways for its secular half to carry the same scaling:
        //   INTO THE COEFFICIENTS -- mhRatePhase(X, ...) with the signal coefficients spelling out F.
        //                            That is the three clocks this round repaired.
        //   ONTO THE WHOLE PHASE   -- Y.mul(F) with the identical F. That is aura's three lanes, whose
        //                            factor is a constant per-lane number and not a signal, so it multiplies
        //                            the finished phase rather than living in a coefficient.
        // The first draft of this row knew only the first shape and went red on aura -- a correct subject,
        // which is the tell. Both spellings are here because both are in the file and both are right.
        const mm = /^([A-Za-z_]\w*)\.mul\(([\s\S]*)\)$/.exec(args[1] || "");
        if (mm) {
            const viaCoeff = new RegExp("^KIT\\.mhRatePhase\\(\\s*" + mm[1] + "\\s*,").test(args[0] || "");
            const viaPhase = new RegExp("\\.mul\\(\\s*" + mm[2].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\)$").test(args[0] || "");
            pairs.push({ base: mm[1], how: viaCoeff ? "coefficients" : viaPhase ? "whole phase" : "NEITHER", ok: viaCoeff || viaPhase });
        }
    }
    say(`drift sites whose wobble amplitude is a scaled base: ${pairs.map((x) => x.base + " (" + x.how + ")").join(", ")}`);
    ok("!! *** EVERY SCALED SITE CARRIES ITS FACTOR ON BOTH HALVES -- travel and shimmer agree, four of four ***",
        pairs.length === 4 && pairs.every((x) => x.ok) && pairs.filter((x) => x.how === "coefficients").length === 3,
        `four sites in the file hand mhDriftPhase a wobble amplitude of the form \`X.mul(F)\`, and all four ` +
        `carry F on the secular half as well: ${pairs.map((x) => x.base + " via " + x.how).join(", ")}. ` +
        `murmur wrote ONE product and the repair writes TWO arguments, so there is now a way to get the ` +
        `travel right and the shimmer wrong that did not exist before this round -- passing the unscaled ` +
        `base as the amplitude. NOTHING IN SECTION 5 WOULD SEE IT: those rows measure where the cloud is, ` +
        `and this is about how much it trembles on the way there.`);

    // *** AND THE DISTINCTION IS RECORDED AS A NOTE RATHER THAN AS A ROW, because it is not checkable here
    // and a row that cannot fail is worse than a sentence. *** nebula, tempest and flux each multiplied a
    // drift by a moving factor and jumped; helix multiplied it by NOTHING and sat still. The census in
    // murmurClock-selfcheck.mjs section 3 could only ever have found the first three -- there was no signal
    // in helix's climb for a signal-hunting census to see. It was found by reading helix.ts against this file
    // line for line, which is the only instrument that finds an ABSENCE, and no arrangement of this repo's
    // own sources can go red on a mechanism murmur has and this port never had. The first draft of this
    // section asserted it anyway, with a condition ending in `|| true`.
    say("helix's climb was an ABSENCE, not a teleport -- found by reading helix.ts, not by any census here");
}

// =============================================================================================================
sec("5. *** AND ALL THREE REACH PIXELS -- with the instantaneous signal held at ZERO, so only the history can move them ***");
{
    // THE ISOLATION IS THE POINT. Every frame here holds stateIndex at 0 and the level fixed, so PACE, VOICE
    // and DRIVE as the shader computes them are IDENTICAL between the pairs. murmur's spelling reads only
    // those, so under murmur's spelling every one of these pairs would be byte-identical. What moves is the
    // accumulated history, which is the mechanism this round added and nothing else in the file can supply.
    const FR = [];
    const base = { stateIndex: 0, stateTau: 0, paceInt: 0, voiceInt: 0, driveInt: 0 };
    FR.push(sp("tempest", 12.0, 0.6, { ...base }));
    FR.push(sp("tempest", 12.0, 0.6, { ...base, voiceInt: 14.0 }));
    FR.push(sp("helix", 12.0, 0.6, { ...base }));
    FR.push(sp("helix", 12.0, 0.6, { ...base, driveInt: 14.0 }));
    FR.push(sp("helix", 12.0, 0.6, { ...base, paceInt: 9.0 }));
    // ...and the three NEGATIVE frames, which cost a draw each and no extra shader: the same two species
    // swept on the integrals murmur does NOT give them.
    FR.push(sp("tempest", 12.0, 0.6, { ...base, paceInt: 14.0 }));
    FR.push(sp("tempest", 12.0, 0.6, { ...base, driveInt: 14.0 }));
    FR.push(sp("helix", 12.0, 0.6, { ...base, voiceInt: 14.0 }));
    // flux is the THIRD species and it costs the third shader compile, which is most of what this section
    // spends. It is in rather than described because it is one of the TWO that was actually teleporting --
    // leaving it out and heading the section "all three reach pixels" would have been a title covering two.
    FR.push(sp("flux", 12.0, 0.6, { ...base }));
    FR.push(sp("flux", 12.0, 0.6, { ...base, paceInt: 14.0 }));
    FR.push(sp("flux", 12.0, 0.6, { ...base, voiceInt: 14.0 }));
    FR.push(sp("flux", 12.0, 0.6, { ...base, driveInt: 14.0 }));
    const run = await renderSpecies(FR);
    if (!run.ok || !run.frames || run.frames.length !== FR.length) {
        ok("!! the output-multiplied clocks render at all", false,
            `could not render: ${run.reason || (run.skipped ? "skipped: " + run.skipped : "frame count")}.`);
    } else {
        say(`backend: ${run.isWebGPUBackend ? "REAL WebGPU" : "WebGL2 fallback"}; ${FR.length} frames over three species`);
        const diff = (a, b) => { let n = 0, mx = 0;
            for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) n++; if (d > mx) mx = d; }
            return { pct: 100 * n / a.length, mx }; };
        const tV = diff(run.frames[0], run.frames[1]);
        const hD = diff(run.frames[2], run.frames[3]);
        const hP = diff(run.frames[2], run.frames[4]);
        say(`tempest voiceInt 0 -> 14: ${tV.pct.toFixed(1)}% of bytes move, worst channel ${tV.mx}`);
        const fP = diff(run.frames[8], run.frames[9]);
        say(`helix   driveInt 0 -> 14: ${hD.pct.toFixed(1)}%, worst ${hD.mx}   |   helix paceInt 0 -> 9: ${hP.pct.toFixed(1)}%, worst ${hP.mx}`);
        say(`flux    paceInt  0 -> 14: ${fP.pct.toFixed(1)}% of bytes move, worst channel ${fP.mx}`);
        ok("!! *** THE CLOUD MOVES ON voiceInt, THE STREAM ON paceInt AND THE STRANDS ON BOTH OF helix's -- WITH EVERY INSTANTANEOUS SIGNAL FIXED ***",
            tV.pct > 5 && tV.mx > 50 && hD.pct > 5 && hD.mx > 50 && hP.pct > 5 && hP.mx > 50 &&
            fP.pct > 5 && fP.mx > 50,
            `fourteen radian-seconds of accumulated voice -- what about a half-minute of somebody talking ` +
            `produces -- moves ${tV.pct.toFixed(1)}% of tempest's bytes, worst channel ${tV.mx} of 255. ` +
            `helix's strands move ${hD.pct.toFixed(1)}% on the drive integral and ${hP.pct.toFixed(1)}% on ` +
            `the pace integral, and BOTH HAD TO BE MEASURED SEPARATELY: a climb wired to one of murmur's two ` +
            `coefficients and not the other passes a row that sweeps them together. flux's stream moves ` +
            `${fP.pct.toFixed(1)}%, worst ${fP.mx}. EVERY FRAME HOLDS stateIndex 0, stateTau 0 AND voice ` +
            `0.6, so DRIVE is zero and PACE and VOICE are the same number in both halves of every pair -- ` +
            `under the expression this round replaced, all four of these comparisons would be a picture ` +
            `against itself.`);

        // *** AND THE OTHER HALF: A UNIFORM THAT MOVES EVERYTHING IS NOT A CLOCK, IT IS A GLOBAL. *** The
        // rows above would all pass if the three integrals were wired into some shared term every species
        // reads. murmur gives tempest's cloud a VOICE term and no pace or drive, and helix's climb a pace and
        // a drive term and no voice -- so each species has to be DEAF to the integrals murmur does not give
        // it, and that is a thing a frame can show. It is also the row that catches the easiest wrong repair
        // there is: folding all three integrals into one accumulated "activity" and sending it everywhere.
        const tP = diff(run.frames[0], run.frames[5]), tD = diff(run.frames[0], run.frames[6]);
        const hV = diff(run.frames[2], run.frames[7]);
        const fV = diff(run.frames[8], run.frames[10]), fD = diff(run.frames[8], run.frames[11]);
        say(`tempest paceInt 0 -> 14: ${tP.pct.toFixed(1)}%   tempest driveInt 0 -> 14: ${tD.pct.toFixed(1)}%   helix voiceInt 0 -> 14: ${hV.pct.toFixed(1)}%`);
        say(`flux    voiceInt 0 -> 14: ${fV.pct.toFixed(1)}%   flux driveInt 0 -> 14: ${fD.pct.toFixed(1)}%`);
        ok("!! *** ...AND EACH SPECIES IS DEAF TO THE INTEGRALS murmur DOES NOT GIVE IT: five sweeps, zero bytes ***",
            tP.pct === 0 && tD.pct === 0 && hV.pct === 0 && fV.pct === 0 && fD.pct === 0,
            `the SAME fourteen radian-seconds that move ${tV.pct.toFixed(1)}% of tempest on voiceInt move ` +
            `${tP.pct.toFixed(0)} bytes on paceInt and ${tD.pct.toFixed(0)} on driveInt, and the same sweep ` +
            `that moves ${hD.pct.toFixed(1)}% of helix on driveInt moves ${hV.pct.toFixed(0)} bytes on ` +
            `voiceInt, and flux moves ${fV.pct.toFixed(0)} and ${fD.pct.toFixed(0)} bytes on the two it does ` +
            `not read. nebula.ts and tempest.ts scale their drift by voice alone; flux.ts scales its stream ` +
            `by pace alone; helix.ts scales its climb by pace and drive alone. THE POSITIVE ROWS ABOVE ` +
            `CANNOT TELL THE DIFFERENCE between three wires ` +
            `and one bus -- this one can, and it is the reason the three integrals were kept as three ` +
            `uniforms instead of being summed into the single "how busy has it been" number that would have ` +
            `been cheaper and would have been a different function.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the three clocks whose OUTPUT is multiplied by a live signal rather than whose " +
    "rate is -- nebula's and tempest's cloud drift, flux's stream, and helix's climb. Two of them were " +
    "teleporting while v4654's census printed \"(none) left\", because that census looked at mh_drift's rate " +
    "argument and these three are built the other way round. The repair puts the signal integrals in the " +
    "secular term and leaves the wobble amplitude reading the instantaneous factor, which is exactly what " +
    "murmur's product expands to." +
    "\nWHAT IS NOT CLAIMED: the two sites that spell a bare rate * t (opal's flash drift, geode's mix " +
    "target), the two flourish SLOT divisors (still, abyss) where a changing slot re-indexes which gesture " +
    "plays rather than advancing a phase, duet's rate (it reads the shader's own flourish, which no host has " +
    "an integral of), and limn's drive FACTOR (its rate is a product, so the factoring would need the " +
    "integral of pace*drive and voice*drive rather than of each signal). Each is recorded against the " +
    "st.drive entry in tools/ship/nextRounds.mjs.");
process.exit(fails ? 1 : 0);
