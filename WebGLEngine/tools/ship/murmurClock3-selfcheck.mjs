// WebGLEngine/tools/ship/murmurClock3-selfcheck.mjs -- v4662
//
// *** THE LAST THREE PLACES A MOVING SIGNAL MULTIPLIES ELAPSED TIME, AND ALL THREE WERE ABSENCES. ***
//
// v4654 chose to integrate rather than transcribe murmur's rate * t. v4655 took the clocks whose whole
// OUTPUT is scaled, v4656 the flourish slot divisors, v4657 the two rates that are products. Each of those
// repaired a teleport that was LIVE in this port. What was left were three sites where murmur's rate moves
// and this port's did not move at all:
//
//   opal    flash drift. opal.ts: drift = (0.055 + 0.075*driftK) * (1 + 0.75*live.pace + 0.95*st.drive),
//           spent as drift * t inside three sines. This port carried the style half and neither signal.
//   geode   spin. geode.ts: mix(mh_drift(t, 0.088*sp, ...), t * 0.30 * sp, st.drive * 0.70). This port
//           carried the mh_drift arm alone, so the stone turned at one speed whatever the orb was doing.
//   nebula  the ADVECTION, shared with tempest. nebula.ts: adv = V * (st.drive * k * t), displacing the
//           medium's sample point. Carried in MH_DRIVE_HEADING with wired: false since v4653.
//
// *** AN ABSENCE IS NOT FINDABLE BY ANY CENSUS THAT HUNTS FOR MOVING RATES, and this tree has now proved
// that three times. *** helix's climb at v4655, geode's and opal's here: each came out of reading the
// species' own source against this file line by line. tools/ship/murmurClock-selfcheck.mjs's census printed
// a clean "(none) left" in the same rounds, correctly, because there was nothing moving for it to find.
//
// AND TRANSCRIBING THEM WOULD HAVE SHIPPED THREE NEW TELEPORTS at the end of the arc that removed them.
//
// *** THIS GATE RENDERS NOTHING, AND THE SPLIT FROM tools/ship/murmurClock4-selfcheck.mjs IS BY INSTRUMENT
// RATHER THAN BY SUBJECT -- WHICH IS THE CLOCK'S DOING AND IS SAID SO RATHER THAN DRESSED UP. *** One file
// held both halves and measured 3,605 ms against a 3,000 ms ceiling once sol's frames joined it, and a gate
// over budget does not run at ship time AT ALL. Every claim here is arithmetic or source, so it costs 0.2 s;
// the five species that have to be rendered are next door. The subject is one subject and the two files say
// so at the top of each.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { VOICE_LIVE, PACE_LIVE } from "./murmurSpeciesFrames.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurClock3-selfcheck -- the last three bare rate*t sites, and all three were absences\n");

const RESPONDING = 3, DT = 1 / 60;
const OD = K.MH_OPAL_DRIFT, GS = K.MH_GEODE_SPIN, GE = K.MH_GEODE, GP = K.MH_GEODE_SP;
const gC = K.mhSpMixCoef(GE.spinRate, GS.to, GS.w, GP.pace, GP.drive);
const PACE_C = K.mhLive(VOICE_LIVE, Math.pow(PACE_LIVE / 0.60, 1 / 0.85), 0).pace;

// =============================================================================================================
sec("1. *** geode's SPIN IS A MIX OF TWO SPEED-FACTORED ARMS, GRADED AGAINST THAT MIX AND NOT AGAINST ITSELF ***");
{
    // *** THE FIVE COEFFICIENTS ARE NOT NUMBERS murmur WROTE, so they are not written down and not restated
    // here. *** geode.ts spells mix(mh_drift(t, 0.088*sp, ...), t*0.30*sp, 0.70*st.drive) with
    // sp = (1 + 0.80*live.pace + 1.00*st.drive). This evaluates THAT, arm by arm, at a held signal -- where
    // murmur's own rate*t is the correct integral -- and compares it with what mhSpMixCoef's expansion and
    // the host's five integrals produce.
    //
    // *** AND THE PACE ARM IS SWEPT, WHICH IS THE WHOLE REASON THIS ROW WAS REWRITTEN AT v4668. *** Its
    // first form carried `sp2 = 1` as a default parameter and never passed anything else, so it graded the
    // sp = 1 special case -- true of the port until v4668 and never true of geode.ts. A parameter that only
    // ever takes its default is a row that cannot fail in the dimension it appears to cover.
    const murmurMix = (t, p, d) => {
        const sp2 = 1 + GP.pace * p + GP.drive * d;
        return (GE.spinRate * sp2 * t) * (1 - GS.w * d) + (t * GS.to * sp2) * (GS.w * d);
    };
    // The host's integrals at a signal held since zero: P = p*t, D = d*t, PD = p*d*t, DD = d*d*t.
    const ours = (t, p, d) => K.mhSpMixPhase(gC, t, p * t, d * t, p * d * t, d * d * t);
    let worst = 0, at = "", worstRel = 0;
    for (const t of [0.5, 7, 60, 600, 1800, 3600])
        for (let p = 0; p <= 1.0001; p += 0.1)
            for (let d = 0; d <= 1.0001; d += 0.05) {
                const e = Math.abs(murmurMix(t, p, d) - ours(t, p, d));
                const rel = e / Math.max(1e-9, Math.abs(murmurMix(t, p, d)));
                if (rel > worstRel) worstRel = rel;
                if (e > worst) { worst = e; at = `t=${t}s p=${p.toFixed(1)} d=${d.toFixed(2)}`; }
            }
    // *** THE BOUND IS RELATIVE AND ulp-SCALE, AND THE ROW MUST NOT SAY "ZERO". *** The two sides group the
    // same numbers differently -- a sum of five products against a product of two sums -- so they agree to
    // the rounding of that regrouping and not to the bit. A first cut of this row's ancestor asserted
    // `worst === 0`, passed at t = 17 s where the phase is small, and went red the moment the sweep reached
    // an hour: an exactness claim that is really a magnitude claim about whichever points were in the loop.
    say(`geode's spin expands to ${gC.t.toFixed(6)}*t + ${gC.pace.toFixed(6)}*P + ${gC.drive.toFixed(6)}*D ` +
        `+ ${gC.paceDrive.toFixed(6)}*PD + ${gC.driveSq.toFixed(6)}*DD`);
    say(`at the ramp's own drive 0.568 and this tree's pace ${PACE_C.toFixed(4)}, that is ` +
        `${(gC.t + gC.pace * PACE_C + gC.drive * 0.568 + gC.paceDrive * PACE_C * 0.568 + gC.driveSq * 0.568 * 0.568).toFixed(6)} rad/s ` +
        `against ${(GE.spinRate * (1 + (GS.to * GS.w / GE.spinRate - GS.w) * 0.568)).toFixed(6)} for the sp = 1 spelling v4662 shipped`);
    ok("!! *** THE INTEGRATED SPIN IS murmur's MIX TO ONE ULP OVER 1,386 HELD OPERATING POINTS ***",
        worstRel < 1e-13 && gC.driveSq > 0 && Math.abs(gC.driveSq - GS.w * (GS.to - GE.spinRate) * GP.drive) < 1e-15,
        `worst |murmur's mix - integrated| = ${worst.toExponential(2)} across six session lengths out to an ` +
        `hour, eleven pace levels and 21 drive levels (worst at ${at || "nowhere"}); worst RELATIVE gap ` +
        `${worstRel.toExponential(1)}, which is the regrouping's own rounding and not a modelling ` +
        `difference. THE COEFFICIENTS ARE A FUNCTION AND NOT A TABLE: mhSpMixCoef(base, toward, mixW, q, s) ` +
        `derives all five from the four numbers geode.ts actually contains, so an edit to any of them moves ` +
        `the expansion with it. Writing ${gC.driveSq.toFixed(6)} down would present a derived quantity as a ` +
        `transcription and leave it free to go stale -- the defect this tree has repaired in its own records ` +
        `more often than in its code.`);

    ok("!! ...and the wobble keeps the INSTANTANEOUS sp AND mix factor, which is v4655's rule rather than a new decision",
        /float\(GE\.spinRate\)\.mul\(spG\)\.mul\(spinMix\), float\(GE\.spinWob\)/.test(
            fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8")),
        `mh_drift's wobble is (k * rate / w2) * sin(...), bounded by k*rate/w2 whatever the rate does, so it ` +
        `cannot accumulate and never needed an integral. murmur mixes the WHOLE drift result, so the ` +
        `wobble's amplitude carries sp and (1 - ${GS.w}*drive) instantaneously while the secular half ` +
        `carries the integral. v4662 had the mix factor and NOT sp, because this port had no sp anywhere.`);
}

// =============================================================================================================
sec("2. *** opal's PHASE IS GRADED AGAINST A QUADRATURE OF THE MOVING RATE -- the definition, not a spelling ***");
{
    // *** THE STRONGEST THING THAT CAN BE SAID ABOUT AN INTEGRAL IS THAT IT IS THE INTEGRAL. *** A row that
    // compared base*(t + a*P + b*D) against base*t*(1 + a*p + b*d) at a HELD signal would pass with any
    // coefficients at all, because both sides would carry the same two numbers -- v4655 walked exactly that
    // sabotage. So the rate is swept along a real RESPONDING ramp and the phase is compared against a
    // 4,096-step definite integral of drift(t) over the same ramp, which is what the phase is FOR.
    const base = OD.base + 0.4 * OD.knob;                       // the drift knob's default
    const lv0 = K.mhLive(VOICE_LIVE, Math.pow(PACE_LIVE / 0.60, 1 / 0.85), 0);
    const lvR = K.mhLive(VOICE_LIVE, Math.pow(PACE_LIVE / 0.60, 1 / 0.85), RESPONDING);
    const T0 = 60;                                              // a minute of idle, then the ramp
    const rateAt = (t) => {
        const tau = t - T0;
        const d = tau <= 0 ? 0 : K.mhState(RESPONDING, tau).drive;
        const lv = tau <= 0 ? lv0 : lvR;
        return base * (1 + OD.pace * lv.pace + OD.drive * d);
    };
    const N = 4096, T1 = T0 + 0.60, h = (T1 - 0) / N;
    let quad = 0;
    for (let i = 0; i < N; i++) quad += rateAt((i + 0.5) * h) * h;
    // ...and the same thing the shader computes, from the host's own accumulators
    let t = 0, P = 0, D = 0;
    for (let i = 0; i < Math.round(T1 / DT); i++) {
        const tau = t - T0, d = tau <= 0 ? 0 : K.mhState(RESPONDING, tau).drive;
        const lv = tau <= 0 ? lv0 : lvR;
        P += lv.pace * DT; D += d * DT; t += DT;
    }
    const ours = K.mhRatePhase(base, t, OD.pace, P, 0, 0, OD.drive, D);
    const err = Math.abs(ours - quad);
    say(`opal's phase over a minute of idle and a 0.60 s ramp: quadrature ${quad.toFixed(6)} rad, integrated ${ours.toFixed(6)} rad`);
    ok("!! *** THE PHASE IS THE INTEGRAL OF THE MOVING RATE TO 0.0006 rad OVER A RAMPED MINUTE ***",
        err < 1e-3 && quad > 3 && OD.pace > 0 && OD.drive > 0,
        `|integrated - quadrature| = ${err.toExponential(2)} rad against a phase of ${quad.toFixed(4)} -- ` +
        `${(100 * err / quad).toExponential(1)}% -- and what is left is the 1/60 s rectangle rule the host ` +
        `accumulates with against a 4,096-step midpoint rule, not a modelling difference. THE COMPARISON IS ` +
        `AGAINST THE DEFINITION: a check against base*t*(1 + a*pace + b*drive) at a held signal passes for ` +
        `ANY pair of coefficients, because both sides read the same two numbers -- that sabotage walked ` +
        `through v4655 until the quadrature replaced it. Here the rate genuinely moves, and only the right ` +
        `coefficients land on the right integrals.`);

    ok("!! ...and the three sines share ONE phase and scale it, which is why one accumulator is enough",
        /const c0 = vec3\(sin\(opalPhase\.mul\(0\.83/.test(fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8")),
        `opal.ts spends the same drift on three axes at 0.83+0.11*fk, 0.67+0.13*fk and 0.95+0.09*fk. The ` +
        `integral of drift(t)*m for a constant m is m times the integral of drift(t), so three axes need ` +
        `three multiplications and not three accumulators -- and computing the phase once is what makes ` +
        `that visible in the source rather than true by accident three times over.`);
}

// =============================================================================================================
sec("3. *** THE TELEPORT NONE OF THE THREE SHIPPED: what murmur's spelling would have done in ONE frame ***");
{
    // Half an hour of idle, then RESPONDING's ramp, stepped at 60 Hz -- the same operating point v4654-v4657
    // measured every other site of this arc at, so the numbers are comparable with those rounds' records.
    const IDLE_S = 1800;
    const lv0 = K.mhLive(VOICE_LIVE, Math.pow(PACE_LIVE / 0.60, 1 / 0.85), 0);
    const lvR = K.mhLive(VOICE_LIVE, Math.pow(PACE_LIVE / 0.60, 1 / 0.85), RESPONDING);
    let t = 0, P = 0, D = 0, PD = 0, DD = 0;
    for (let i = 0; i < IDLE_S / DT; i++) { P += lv0.pace * DT; t += DT; }
    const oBase = OD.base + 0.4 * OD.knob;
    const ADV = K.MH_DRIVE_HEADING.nebula;
    let prev = null; const worst = { oM: 0, oO: 0, gM: 0, gO: 0, aM: 0, aO: 0 };
    for (let tau = 0; tau <= 0.60; tau += DT) {
        const d = K.mhState(RESPONDING, tau).drive;
        const cur = {
            oM: oBase * (1 + OD.pace * lvR.pace + OD.drive * d) * t,
            oO: K.mhRatePhase(oBase, t, OD.pace, P, 0, 0, OD.drive, D),
            // geode's is murmur's WHOLE mix now, both arms carrying sp -- see section 1. The jump it would
            // have made is correspondingly larger than v4662 measured, because the factor it was missing
            // multiplies the very product of signal and elapsed time that jumps.
            gM: (1 + GP.pace * lvR.pace + GP.drive * d)
                * (GE.spinRate * (1 - GS.w * d) + GS.to * GS.w * d) * t,
            gO: K.mhSpMixPhase(gC, t, P, D, PD, DD),
            aM: ADV.k * d * t,
            aO: ADV.k * D,
        };
        if (prev) for (const k of Object.keys(worst)) worst[k] = Math.max(worst[k], Math.abs(cur[k] - prev[k]));
        prev = cur;
        P += lvR.pace * DT; D += d * DT; PD += lvR.pace * d * DT; DD += d * d * DT; t += DT;
    }
    const TURN = 2 * Math.PI;
    say(`opal   murmur ${worst.oM.toFixed(4)} rad in one frame, integrated ${worst.oO.toFixed(6)} -- ${(worst.oM / worst.oO).toFixed(0)}x, and ${(worst.oM / TURN).toFixed(2)} of a turn`);
    say(`geode  murmur ${worst.gM.toFixed(4)} rad in one frame, integrated ${worst.gO.toFixed(6)} -- ${(worst.gM / worst.gO).toFixed(0)}x, and ${(worst.gM / TURN).toFixed(2)} of a turn`);
    say(`advect murmur ${worst.aM.toFixed(4)} units in one frame, integrated ${worst.aO.toFixed(6)} -- ${(worst.aM / worst.aO).toFixed(0)}x`);
    ok("!! *** ALL THREE WOULD HAVE JUMPED MORE THAN A WHOLE TURN OR ITS EQUIVALENT IN A SINGLE 1/60 s FRAME ***",
        worst.oM > TURN && worst.gM > TURN && worst.aM > 10 &&
        worst.oO < 0.02 && worst.gO < 0.02 && worst.aO < 0.02,
        `entering RESPONDING after half an hour on screen: opal's flashes would have crossed ` +
        `${(worst.oM / TURN).toFixed(2)} of a full cycle between two frames and geode's stone ` +
        `${(worst.gM / TURN).toFixed(2)} of a turn, and nebula's cloud would have been advected ` +
        `${worst.aM.toFixed(1)} units of noise space -- ${(worst.aM / ADV.k).toFixed(0)} times its own ` +
        `per-second rate at full drive. The integrated forms advance ${worst.oO.toFixed(6)}, ` +
        `${worst.gO.toFixed(6)} and ${worst.aO.toFixed(6)}: what one frame is worth. *** AND THE JUMP GROWS ` +
        `WITH SESSION LENGTH WITHOUT BOUND, which is what makes this a defect rather than a tuning choice -- ` +
        `every one of these three is a product of elapsed time and a signal that moves, so the error is ` +
        `t * dSignal and nothing caps t.`);
}

// =============================================================================================================
// =============================================================================================================
sec("4. *** AND THE ROUND'S OWN CENSUS FOUND A FOURTH SITE, LIVE, THAT FOUR ROUNDS OF CENSUSES MISSED ***");
{
    // *** sol's GRANULATION WAS STILL SPELLING murmur's rate * t AT v4661. *** The noise that gives sol's
    // core its boil is sampled at z = uniforms.time * (0.35 + 0.75 * live.pace) -- a pace-modulated rate
    // times elapsed time, which is this arc's defect exactly. v4654 through v4657 each ran a census and each
    // printed a clean result, correctly: every one of them looked at mh_drift call sites, and sol's
    // granulation is a bare product inside a noise lookup. Section 5's rule is written as "a signal
    // multiplied by uniforms.time ANYWHERE", which is what found it on this round's first run.
    const SO = K.MH_SOL, kP = SO.granRateK / SO.granRateB;
    const lv0 = K.mhLive(VOICE_LIVE, Math.pow(PACE_LIVE / 0.60, 1 / 0.85), 0);
    const lvR = K.mhLive(VOICE_LIVE, Math.pow(PACE_LIVE / 0.60, 1 / 0.85), RESPONDING);
    let t = 0, P = 0;
    for (let i = 0; i < 1800 / DT; i++) { P += lv0.pace * DT; t += DT; }
    const mBefore = t * (SO.granRateB + SO.granRateK * lv0.pace);
    const oBefore = K.mhRatePhase(SO.granRateB, t, kP, P, 0, 0, 0, 0);
    P += lvR.pace * DT; t += DT;
    const mAfter = t * (SO.granRateB + SO.granRateK * lvR.pace);
    const oAfter = K.mhRatePhase(SO.granRateB, t, kP, P, 0, 0, 0, 0);
    const jumpM = Math.abs(mAfter - mBefore), jumpO = Math.abs(oAfter - oBefore);
    say(`sol's granulation rate is ${SO.granRateB} + ${SO.granRateK}*live.pace, so the coefficient derives to ${kP.toFixed(6)}`);
    say(`entering RESPONDING after 30 min: murmur ${jumpM.toFixed(4)} units of noise space in one frame, integrated ${jumpO.toFixed(6)} -- ${(jumpM / jumpO).toFixed(0)}x`);
    ok("!! *** IT WAS THE LARGEST SINGLE JUMP THIS ARC HAS FOUND: 270 UNITS OF NOISE SPACE IN ONE 1/60 s FRAME ***",
        jumpM > 200 && jumpO < 0.05 && jumpM / jumpO > 10000 &&
        /const granPhase = KIT\.mhRatePhase\(float\(SO\.granRateB\), uniforms\.time,/.test(
            fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8")),
        `granScale is ${SO.granScale}, so ${jumpM.toFixed(1)} units is ` +
        `${(jumpM / SO.granScale).toFixed(0)} body radii of noise space crossed between two frames: the ` +
        `granulation was not drifting, it was being REPLACED. The integrated form advances ` +
        `${jumpO.toFixed(6)}. THE COEFFICIENT IS DERIVED FROM THE TWO CONSTANTS sol.ts CONTAINS -- ` +
        `granRateK / granRateB -- for the reason geode's is in section 1: a ratio written out as a third ` +
        `number is a derived quantity presented as a transcription, and it goes stale in silence when ` +
        `either of the two moves.`);

    // *** AND THE ROUND NEARLY RECORDED A GAP THAT WAS NOT THERE. *** The first draft of this section said
    // sol's granulation "cannot be seen at all", on a byte count that reads 0.0% and worst 1 of 255 when
    // its own `simmer` knob is swept end to end at the default operating point -- measured at 48 px AND at
    // 128 px, so not a resolution limit, and the kit's moire gate ruled out too (KIT_AA(8.5) is 1.00000000).
    // It was one edit away from shipping as a named absence with three measurements behind it.
    //
    // tools/ship/murmurSpecies9-selfcheck.mjs HAS BEEN MEASURING IT SINCE THE ROUND THAT PORTED IT. That
    // gate renders sol at simmer 0.0 and 1.0 already, at a DIMMED operating point, and reads a
    // neighbour-to-neighbour TEXTURE statistic rather than a byte difference: x1.488 on the knob. A
    // zero-mean noise on a bright disc moves almost no bytes and a great deal of texture. The absence was
    // the instrument's and not the species', and what caught it was checking whether any existing gate
    // already rendered the thing -- one grep, after the byte count had produced a confident zero.
    const s9 = fs.readFileSync(path.join(ENG, "tools", "ship", "murmurSpecies9-selfcheck.mjs"), "utf8");
    ok("!! ...and the granulation's OWN gate grades this term in pixels, which is where the pace-integral row went",
        /GRANULATION/i.test(s9) && /paceInt/.test(s9) && /texture\(/.test(s9),
        `sol's granulation is owned by tools/ship/murmurSpecies9-selfcheck.mjs, which has the texture ` +
        `statistic the term needs, and v4662 put the row that sweeps the PACE INTEGRAL through it there ` +
        `rather than here. THE POINT OF THIS ROW IS THE NEAR MISS: a gap recorded on the wrong instrument ` +
        `is worse than no gap at all, because the next reader believes the term is unreachable and stops ` +
        `looking -- and this one would have shipped with a byte count, two resolutions and a ruled-out ` +
        `moire gate behind it, which is exactly how confident a wrong absence looks.`);
}

// =============================================================================================================
sec("5. *** THE CENSUS: the clock arc is closed, and the closing is checkable rather than announced ***");
{
    const raw = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    const src = codeOnly(raw);
    const unwired = Object.entries(K.MH_DRIVE_HEADING).filter(([, v]) => !v.wired).map(([k]) => k);

    // *** THE PRODUCT TEST HAS TO NAME uniforms.time AS AN OPERAND, NOT AS AN ARGUMENT. *** The first cut of
    // this row flagged any line holding a signal and a uniforms.time with a .mul between them, and it fired
    // on TWO CORRECT SITES: droplet's and the shared body's swell, VOICE * (0.22 + 0.78*mh_breath(time)),
    // where the time is an ARGUMENT to a bounded oscillator and the signal multiplies its bounded result.
    // That is a signal times something between 0 and 1, which cannot accumulate; the shape this row exists
    // for is a signal times elapsed time itself. tools/ship/murmurDrive-selfcheck.mjs had the identical
    // proxy and repaired it at v4657 for the identical reason -- "a bounded amplitude and a clock argument
    // side by side is exactly the arrangement this row exists to bless."
    const lines = src.split("\n");
    // *** AND THE TEST READS THE MULTIPLICAND NOW, NOT THE LINE -- v4664, THE THIRD TIME THIS PROXY HAS
    // FIRED ON A CORRECT SITE. *** It flagged any line holding both a signal and a `.mul(uniforms.time)`.
    // v4662 narrowed it once, off two swell lines where the time was an ARGUMENT to a bounded oscillator.
    // v4664 hit the next variant: opal's procession is mix(c0, c0*0.55 + lean*sin(uniforms.time * (2*pi/5.2)
    // - fk*1.4), DRIVE) -- the time is multiplied by a CONSTANT angular frequency inside a sine, and the
    // signal on that line is the mix WEIGHT, which is nowhere near it.
    //
    // A line is the wrong unit for this question. What the rule is about is one expression: elapsed time
    // multiplied by something that MOVES. So the multiplicand is extracted by a balanced-paren walk and
    // asked whether IT mentions a signal -- and `time * (2*pi/5.2)` does not, however many signals share
    // its line.
    const mulArg = (l, at) => {
        let o = l.indexOf("(", at); if (o < 0) return "";
        let d = 0, j = o;
        for (; j < l.length; j++) { if (l[j] === "(") d++; else if (l[j] === ")") { d--; if (!d) break; } }
        return l.slice(o + 1, j);
    };
    const sig = /\b(DRIVE|PACE|VOICE)\b/;
    const isProduct = (l) => {
        for (let i = 0; (i = l.indexOf("uniforms.time.mul(", i)) !== -1; i += 18)
            if (sig.test(mulArg(l, i + 17))) return true;
        for (let i = 0; (i = l.indexOf(".mul(uniforms.time)", i)) !== -1; i += 19) {
            const head = l.slice(0, i);
            if (sig.test(head.slice(Math.max(0, head.length - 120)))) return true;
        }
        return false;
    };
    const hasSignal = (l) => sig.test(l);
    const badProduct = lines.filter(isProduct);
    const blessed = lines.filter((l) => !isProduct(l) && hasSignal(l) && /uniforms\.time/.test(l));
    say(`MH_DRIVE_HEADING entries still unwired: ${unwired.length ? unwired.join(", ") : "none"}`);
    say(`lines multiplying a signal BY uniforms.time: ${badProduct.length}; lines holding both where the time is an ARGUMENT: ${blessed.length}`);
    ok("!! *** NO ENTRY IS UNWIRED AND NO LINE MULTIPLIES A LIVE SIGNAL BY ELAPSED TIME ITSELF ***",
        unwired.length === 0 && badProduct.length === 0 && blessed.length >= 1,
        `${Object.keys(K.MH_DRIVE_HEADING).length} heading entries, ${unwired.length} unwired; ` +
        `${badProduct.length} expressions multiply uniforms.time by something that mentions a signal, and ` +
        `${blessed.length} lines hold both where the time is an argument to a bounded function, or is ` +
        `multiplied by a CONSTANT, while the signal does something else on the same line. THE TEST READS ` +
        `THE MULTIPLICAND AND NOT THE LINE, which is its third narrowing: v4657 found it firing on limn's ` +
        `flattening wobble, v4662 on two swell lines where the time was an argument to mh_breath, and v4664 ` +
        `on opal's procession, whose time is multiplied by a fixed angular frequency inside a sine while ` +
        `the signal on that line is the mix WEIGHT. A LINE IS THE WRONG UNIT FOR THIS QUESTION and it took ` +
        `three correct sites to say so. THE SECOND ` +
        `COUNT IS ASSERTED NON-ZERO ON PURPOSE: a refined pattern that matched nothing anywhere would pass ` +
        `this row for being blind, and the sites it must NOT flag are the evidence that it can still see. ` +
        `THIS IS ALSO A LINE TEST AND ITS REACH IS STATED: a product reintroduced through a local variable ` +
        `would not be spelled on one line and this could not find it. The row below is the one that holds ` +
        `the property structurally.`);

    // *** EVERY INTEGRAL IS AN ARGUMENT OF mhRatePhase OR mhCrossPhase, PARSED RATHER THAN PATTERN-MATCHED.
    // *** The first cut of this row counted `uniforms.paceInt)` against `uniforms.paceInt` and asserted they
    // were equal -- which is true only when the integral is the LAST argument, and v4662's opal site is the
    // first to pass paceInt in the middle of the list. It read 39 against a smaller number and went red on
    // a correct file. A character after an identifier is not an argument position.
    const callArgs = (txt, at) => {
        let open = txt.indexOf("(", at), j = open, d = 0;
        for (; j < txt.length; j++) { if (txt[j] === "(") d++; else if (txt[j] === ")") { d--; if (!d) break; } }
        return txt.slice(open + 1, j);
    };
    // *** THE PATTERN NAMES THE INTEGRALS RATHER THAN DESCRIBING THEM, AND v4668 IS WHY. *** It used to
    // match /uniforms\.(pace|voice|drive)Int/, which reads as "any of the signal integrals" and is in fact
    // "the three whose names are a signal followed by Int". thinkInt arrived at v4663 and paceDriveInt and
    // voiceDriveInt at v4657 and none of them matched; driveSqInt at v4668 does not either. So the census
    // was quietly reporting about a SUBSET it never named -- this tree's own recurring finding, in the row
    // whose whole job is to say that every integral is spent as a phase argument. The list is explicit now,
    // and adding an eighth accumulator without adding it here leaves the total short and the row red.
    // *** AND THE LIST IS CHECKED AGAINST THE HOST RATHER THAN MAINTAINED BY HAND, because a census that
    // narrows its own pattern narrows BOTH sides of its equality and stays green. *** A sabotage that deleted
    // driveSqInt from the list below walked straight through: the read vanished from `total` and from
    // `inside` together, and 54 of 55 became 52 of 53. THE HOST IS THE SOURCE OF TRUTH FOR WHICH INTEGRALS
    // EXIST -- render/aiPresenceOrbState.mjs accumulates them and returns them by name -- so the names are
    // read from its getParams() return and the pattern is required to cover every one. An eighth accumulator
    // reddens this row on the day it is added, which is the day the shader needs to be looked at.
    const hostReturn = /paceInt, voiceInt, driveInt[^;]*duetFlourishInt \};/.exec(
        fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbState.mjs"), "utf8"));
    const hostNames = hostReturn ? hostReturn[0].replace(/[};]/g, "").split(",").map((x) => x.trim()).filter(Boolean) : [];
    const INTEGRAL_NAMES = ["paceInt", "voiceInt", "driveInt", "thinkInt", "paceDriveInt", "voiceDriveInt", "driveSqInt"];
    const uncovered = hostNames.filter((n) => n !== "duetFlourishInt" && !INTEGRAL_NAMES.includes(n));
    const INTEGRALS = new RegExp("uniforms\\.(" + INTEGRAL_NAMES.join("|") + ")\\b", "g");
    let inside = 0;
    for (const fn of ["KIT.mhRatePhase(", "KIT.mhCrossPhase(", "KIT.mhSpMixPhase("])
        for (let i = 0; (i = src.indexOf(fn, i)) !== -1; i += fn.length)
            inside += (callArgs(src, i + fn.length - 1).match(INTEGRALS) || []).length;
    const total = (src.match(INTEGRALS) || []).length;
    const flourish = (src.match(/uniforms\.duetFlourishInt/g) || []).length;
    // *** AND THE ADVECTION IS A THIRD LEGITIMATE USE, WHICH THIS ROW HAD TO LEARN IN THE SAME ROUND THAT
    // CREATED IT. *** A phase is an angle and belongs inside mhRatePhase; a DISPLACEMENT is not, and
    // nebula's adv = V * k * driveInt is spent directly on a sample point. The row asserts the count rather
    // than allowing "anything outside the phase functions", so a fourth use goes red and gets read.
    const advReads = (src.match(/MH_ADVECT_SIGN\)\.mul\(uniforms\.driveInt\)/g) || []).length;
    say(`integral reads in the shader: ${total}; inside a phase function ${inside}, in the advection ${advReads}`);
    ok("!! *** EVERY INTEGRAL READ IS AN ARGUMENT OF THE THREE PHASE FUNCTIONS OR THE ONE ADVECTION, AND NOTHING ELSE ***",
        inside + advReads === total && total >= 20 && advReads === 1 &&
        hostNames.length >= 8 && uncovered.length === 0,
        `${inside} of ${total} inside a phase call, over the ${INTEGRAL_NAMES.length} integrals the host ` +
        `returns (${hostNames.length} names read from getParams(), ${uncovered.length} not covered by ` +
        `this row's pattern), found by walking each call's balanced parentheses rather ` +
        `than by matching the character after the name -- the first cut compared "uniforms.paceInt)" against ` +
        `"uniforms.paceInt" and read 39 against 38, because that only holds when the integral is the LAST ` +
        `argument and v4662's opal site is the first to pass paceInt in the middle. The remaining ` +
        `${advReads} is the advection, which is a DISPLACEMENT and not a phase: V * k * driveInt on a sample ` +
        `point. It is counted rather than excused, so a fourth use of an integral outside these two shapes ` +
        `turns this row red. ` +
        `the character after the name. AN INTEGRAL SPENT AS A PLAIN MULTIPLIER WOULD BE A DIFFERENT ` +
        `QUANTITY ENTIRELY -- radian-seconds where radians belong -- and it would grow without bound in a ` +
        `term meant to be bounded, which is this arc's own defect inverted. duet's gesture integral is ` +
        `counted separately (${flourish} reads) because it is not one of the three conditioned signals: it ` +
        `is the definite integral of an envelope, and v4657's note says why a host can compute it at all.`);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the last three sites where murmur multiplies elapsed time by a signal that " +
    "moves -- opal's flash drift, geode's spin mix and the nebula/tempest advection -- which closes the arc " +
    "that ran from v4654. All three were ABSENCES in this port rather than live teleports: the rates were " +
    "there, fixed, and the signals simply never arrived. " +
    "\nWHAT IT CLAIMS AND HOW: geode's coefficient is graded against murmur's MIX evaluated directly rather " +
    "than against a restatement of its own expansion; opal's phase against a 4,096-step quadrature of the " +
    "moving rate over a real RESPONDING ramp, because a held-signal comparison passes for any coefficients " +
    "at all and that sabotage walked through v4655. " +
    "\nWHAT IS NOT CLAIMED: the DIRECTION the advection carries the cloud, in pixels. The sign is a stated " +
    "decision -- the sample point is displaced by MINUS the advection so the field appears to move along " +
    "+V, the same vector the heading family leans toward -- and at 48 px the two signs differ by which " +
    "noise features arrive where, which this gate cannot read without a figure it cannot resolve. It is " +
    "recorded beside MH_ADVECT_SIGN rather than measured by a proxy here. " +
    "\nWHAT IS NEXT DOOR: the pixels -- the four species that moved 0 of 9,216 bytes across the whole drive " +
    "ramp before this round, and sol's granulation gap -- in tools/ship/murmurClock4-selfcheck.mjs.");
process.exit(fails ? 1 : 0);
