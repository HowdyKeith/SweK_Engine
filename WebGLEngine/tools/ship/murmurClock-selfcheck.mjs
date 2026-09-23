// WebGLEngine/tools/ship/murmurClock-selfcheck.mjs -- v4657
//
// *** THE SPECIES' OWN CLOCKS, AND THIS PORT'S ONE DELIBERATE DIVERGENCE FROM murmur. ***
//
// v4650 repaired the orb's HOST clock: the tempo integral existed, was graded, and both call sites that fed
// a shader multiplied elapsed time by the current speed instead. The identical defect lives one level down,
// inside murmur's own species, and no host-side integrator can reach it. A species builds a rate out of the
// live signals and hands it to mh_drift, whose phase is rate * t; when the rate moves -- and pace, voice and
// drive move constantly -- that expression jumps by t * dRate, an error with no ceiling that grows with how
// long the orb has been on screen.
//
// *** THE CHOICE WAS PUT TO THE OWNER AND THE ANSWER WAS TO DIVERGE. *** Transcribe murmur faithfully and
// inherit the jump, or integrate and be correct where the source is not. This gate exists because the second
// was chosen: it has to show that the divergence is exact, that it is bounded, and -- the row that keeps it
// honest -- that it reduces to murmur's own expression wherever nothing is moving, so no recorded frame moves.
//
// THE REPAIR IS EXACT AND COSTS THREE NUMBERS, because the integral factors. base and the coefficients come
// from style knobs and do not move, so
//     integral of base * (1 + a*pace + b*voice + c*drive)  =  base * (t + a*P + b*V + c*D)
// and the shader needs the three running integrals, not the history. render/aiPresenceOrbState.mjs
// accumulates them in SHADER time -- against the tempo integral, not wall seconds -- because a species' rate
// is per second of the clock it is handed.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { createPresenceState } from "../../render/aiPresenceOrbState.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { sp, renderSpecies } from "./murmurSpeciesFrames.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurClock-selfcheck -- the species' clocks: integrated, not multiplied\n");

const DT = 1 / 60;
// comet's orbital clock, from comet.ts: rate = 1.05 * (1 + 0.85*live.pace + 0.95*st.drive). Written out by
// hand rather than read off MH_* so this section can disagree with the port -- the v4579 distinction.
const BASE = 1.05, K_PACE = 0.85;

/** Settle for `settle` seconds of shader time, then raise the cadence and watch one frame at a time. */
function ramp(settle) {
    const st = createPresenceState("idle");
    for (let i = 0; i < Math.round(settle / DT); i++) st.tick(DT, { activity: 0 });
    let prevInt = null, prevNaive = null, worstInt = 0, worstNaive = 0;
    for (let i = 0; i < Math.round(3.0 / DT); i++) {
        st.tick(DT, { activity: 1.0 });
        const p = st.getParams();
        const lv = K.mhLive(p.voice, p.activity, 0);
        const integrated = K.mhRatePhase(BASE, p.phase, K_PACE, p.paceInt, 0, 0, 0, 0);
        const naive = BASE * (1 + K_PACE * lv.pace) * p.phase;
        if (prevInt !== null) {
            worstInt = Math.max(worstInt, Math.abs(integrated - prevInt));
            worstNaive = Math.max(worstNaive, Math.abs(naive - prevNaive));
        }
        prevInt = integrated; prevNaive = naive;
    }
    return { worstInt, worstNaive };
}

// =============================================================================================================
sec("1. *** THE CLOCK NO LONGER LEAPS WHEN THE CADENCE RISES -- and the expression it replaces leaps further the longer you wait ***");
{
    const SESSIONS = [5, 30, 60, 300, 1800];
    const rows = SESSIONS.map((s) => ({ s, ...ramp(s) }));
    say("comet's orbital phase, worst ONE-FRAME advance as the cadence goes to full:");
    for (const r of rows) say(`   after ${String(r.s).padStart(4)}s:  integrated ${r.worstInt.toFixed(5)} rad    murmur's rate*t ${r.worstNaive.toFixed(4)} rad    ${(r.worstNaive / r.worstInt).toFixed(0)}x`);

    // The ceiling is what the clock CAN cover in one frame at IDLE's own tempo, not a number chosen to pass:
    // the phase advances at most base * (1 + a) per second of shader time, and IDLE runs at speed 0.30.
    const cap = BASE * (1 + K_PACE) * 0.30 * DT;
    const worstInt = Math.max(...rows.map((r) => r.worstInt));
    const flat = worstInt - Math.min(...rows.map((r) => r.worstInt));
    ok("!! *** THE INTEGRATED PHASE ADVANCES AT MOST base * (1 + a) * dPhase, AT EVERY SESSION LENGTH ***",
        worstInt <= cap + 1e-12 && worstInt > 0.5 * cap && flat < 1e-12,
        `the worst one-frame advance is ${worstInt.toFixed(5)} rad against a ceiling of base * (1 + a) * ` +
        `speed * dt = ${BASE} * ${(1 + K_PACE).toFixed(2)} * 0.30 * ${DT.toFixed(4)} = ${cap.toFixed(5)} -- ` +
        `${(100 * worstInt / cap).toFixed(0)}% of it, so the bound is the real one and not slack. And it ` +
        `varies by ${flat.toExponential(1)} across five session lengths spanning 5 s to half an hour: it does ` +
        `not depend on the session AT ALL, which is the whole property.`);

    const ratio = rows[4].worstNaive / rows[0].worstNaive, secsRatio = SESSIONS[4] / SESSIONS[0];
    ok("!! *** AND murmur's REACHES 57.7 RADIANS IN ONE FRAME -- NINE WHOLE TURNS OF THE ORBIT, in 16.7 ms ***",
        rows[4].worstNaive > 50 && Math.abs(ratio / secsRatio - 1) < 0.15 &&
        rows[4].worstNaive / rows[4].worstInt > 5000,
        `${rows[0].worstNaive.toFixed(4)} rad after 5 s of running and ${rows[4].worstNaive.toFixed(4)} after ` +
        `1800 -- ${(rows[4].worstNaive / (2 * Math.PI)).toFixed(2)} full turns of a phase every reader takes a ` +
        `sin or a cos of, so the point of light is simply somewhere else. The growth is ${ratio.toFixed(0)}x ` +
        `for ${secsRatio}x the wait, which is within ${(100 * Math.abs(ratio / secsRatio - 1)).toFixed(1)}% of ` +
        `linear: the error IS t * dRate and it has no ceiling. A five-second fixture would have measured the ` +
        `0.17 and called it nothing.`);
}

// =============================================================================================================
sec("2. *** AND IT IS murmur's OWN EXPRESSION WHEREVER NOTHING MOVES, which is what keeps every recorded frame ***");
{
    // The reduction, exactly: a held signal makes P = pace * t, so base * (t + a*pace*t) IS
    // base * (1 + a*pace) * t. This is the row that makes the divergence safe to have made.
    let worst = 0, at = "";
    for (const base of [0.34, 1.05, 0.052, 0.17]) for (const a of [0.95, 0.55, 0.45]) {
        for (const pace of [0, 0.27, 0.5, 1]) for (const t of [1, 10, 100, 1000, 3600]) {
            const mine = K.mhRatePhase(base, t, a, pace * t, 0, 0, 0, 0);
            const theirs = base * (1 + a * pace) * t;
            const d = Math.abs(mine - theirs);
            if (d > worst) { worst = d; at = `base ${base} a ${a} pace ${pace} t ${t}`; }
        }
    }
    ok("!! *** A HELD SIGNAL MAKES THE TWO FORMULAS THE SAME NUMBER, to 2.3e-13 out to an hour ***",
        worst < 1e-9,
        `worst |integrated - murmur| = ${worst.toExponential(2)} over 240 combinations of base, coefficient, ` +
        `signal and time (worst at ${at}) -- float accumulation, not a difference in what is computed. THE ` +
        `TWO DIFFER ONLY WHILE A SIGNAL IS IN MOTION, which is exactly where murmur's is wrong, so every ` +
        `frame this tree has recorded at a fixed operating point is where it was.`);

    // *** AND mhRatePhase IS GRADED AGAINST THE THING IT IS SUPPOSED TO BE, not against a second spelling of
    // itself. *** A row that writes base * (t + a*P + b*V + c*D) next to a function whose body is
    // base * (t + a*P + b*V + c*D) grades nothing -- the v4579 scar, and this tree has worn it. The claim
    // mhRatePhase actually makes is that it is THE INTEGRAL OF THE MOVING RATE, so the reference here is a
    // fine-step numerical integration of base * (1 + a*pace(t) + b*voice(t) + c*drive(t)) over three signals
    // that are all in motion and none of which is a multiple of another. A dropped or swapped coefficient
    // cannot survive it, and neither can the function being right about one signal and wrong about a second.
    //
    // THIS EXISTS BECAUSE A SABOTAGE WALKED THROUGH TWO GATES. Deleting the drive term from the CPU
    // mhRatePhase left murmurKit-selfcheck.mjs green -- correctly, since its section 15 grades the SHADER
    // twin against a hand-written reference and never calls the CPU one -- and left this gate green too,
    // because every row here passed 0 for three of the four coefficients. A coefficient of zero grades
    // nothing. Only murmurClock2's derived bound caught it, and by an inequality.
    {
        const pace = (t) => 0.5 + 0.5 * Math.sin(0.37 * t), voice = (t) => 0.5 - 0.5 * Math.cos(0.211 * t),
              drive = (t) => Math.min(1, t / 23);
        const base = 0.34, a = 0.95, b = 0.31, c = 0.77;
        const H = 1 / 4096;
        let P = 0, V = 0, D = 0, ref = 0, worstR = 0, atR = "";
        for (let i = 0; i < Math.round(60 / H); i++) {
            const t = i * H, mid = t + H / 2;
            // the reference: the rate itself, integrated. The trapezoid on a midpoint sample is exact enough
            // at this step that the residual measures 1.0e-12, which is float accumulation over a quarter of
            // a million steps rather than quadrature error -- so the bound is 1e-6, six orders of magnitude
            // clear of the reading and still far smaller than any dropped term could hide in.
            ref += base * (1 + a * pace(mid) + b * voice(mid) + c * drive(mid)) * H;
            P += pace(mid) * H; V += voice(mid) * H; D += drive(mid) * H;
            if (i % 4096 === 0) {
                const got = K.mhRatePhase(base, t + H, a, P, b, V, c, D);
                const d = Math.abs(got - ref);
                if (d > worstR) { worstR = d; atR = `t = ${(t + H).toFixed(1)} s, integral ${ref.toFixed(4)}, mhRatePhase ${got.toFixed(4)}`; }
            }
        }
        ok("!! *** mhRatePhase IS THE INTEGRAL OF THE MOVING RATE -- checked against a 4096-step quadrature, not against itself ***",
            worstR < 1e-6 && ref > 20,
            `worst |mhRatePhase - the numerically integrated rate| = ${worstR.toExponential(2)} rad over a ` +
            `minute of three signals in continuous motion -- a sine, a shifted cosine at an unrelated ` +
            `frequency and a ramp -- reaching ${ref.toFixed(3)} rad in total (worst at ${atR}). THE ` +
            `REFERENCE IS THE DEFINITION AND NOT THE IMPLEMENTATION: nothing here restates base * (t + a*P + ` +
            `b*V + c*D), so dropping a term, swapping two coefficients or reading one integral twice all ` +
            `fail. THE THREE SIGNALS ARE DELIBERATELY UNRELATED -- pace at 0.37 rad/s, voice at 0.211 and ` +
            `drive a ramp -- because three signals that moved together would let one coefficient stand in ` +
            `for another.`);
    }

    // ...and mhDriftPhase with an unmodulated secular is mhDrift, bit for bit, so the migration itself is free.
    let worstD = 0;
    for (const t of [1, 17, 123, 999]) for (const lane of [1, 2, 3, 5, 7]) for (const rate of [0.047, 0.34, 2.05]) {
        const a = K.mhDrift(t, rate, 0.5, lane);
        const b = K.mhDriftPhase(K.mhRatePhase(rate, t, 0, 0, 0, 0, 0, 0), rate, 0.5, lane, t);
        worstD = Math.max(worstD, Math.abs(a - b));
    }
    ok("!! ...and mhDriftPhase with no modulation IS mhDrift, bit for bit, so moving a site costs nothing",
        worstD === 0,
        `worst |mhDrift - mhDriftPhase| = ${worstD} over 60 combinations -- EXACTLY zero. A site whose rate ` +
        `does not read a live signal can be migrated or left alone and the frame is identical either way, ` +
        `which is why this round moved only the rates that MOVE and left the other seventeen drift calls as ` +
        `they were rather than sweeping the file.`);
}

// =============================================================================================================
sec("3. *** WHICH CLOCKS ARE REPAIRED, AND THE TWO THAT ARE NOT -- each with the reason, not the intention ***");
{
    const src = codeOnly(fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8"));
    const raw = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    const lines = src.split("\n");
    const marks = [];
    lines.forEach((l, i) => { const m = /^\s*const build([A-Z]\w*) = \(\) => \{/.exec(l); if (m) marks.push([i, m[1].toLowerCase()]); });
    marks.push([lines.length, "(end)"]);
    // *** THIS CENSUS REPORTED "(none)" WHILE TWO CLOCKS WERE TELEPORTING, AND v4655 IS THE REPAIR. ***
    // The first cut looked only at mh_drift's RATE ARGUMENT, and only when that argument was a bare
    // identifier it could chase back to a `const`. It could not see the shape that was actually left in the
    // file: a drift with a CONSTANT rate whose whole RESULT is multiplied by a live signal afterwards. mist
    // and flux both carried it, and this row printed "(none)" over the top of them for a round.
    //
    // A census that reports a clean result about a subset it never names is this tree's oldest defect shape,
    // and this one shipped it one round ago. It is a CHAIN WALKER now rather than a regex: from `KIT.` it
    // takes the balanced parentheses of the call and then every chained .method(...) that follows, so the
    // trailing .mul(VOICE) is part of the expression being examined instead of the text after it. That is
    // the difference between "what is passed in" and "what the site does", and the whole defect lived in
    // the gap.
    const chainAt = (src2, i) => {
        let j = src2.indexOf("(", i), d = 0;
        for (; j < src2.length; j++) {
            if (src2[j] === "(") d++;
            else if (src2[j] === ")") { d--; if (d === 0) { j++; break; } }
        }
        for (;;) {
            const mm = /^(?:\s*\.\s*[A-Za-z_]\w*\s*\()/.exec(src2.slice(j));
            if (!mm) break;
            let pp = j + mm[0].length - 1, dd = 0;
            for (; pp < src2.length; pp++) {
                if (src2[pp] === "(") dd++;
                else if (src2[pp] === ")") { dd--; if (dd === 0) { pp++; break; } }
            }
            j = pp;
        }
        return src2.slice(i, j);
    };
    const SIGNAL = /\b(VOICE|PACE|DRIVE|energy)\b/;
    /** Every plain mh_drift site in `blk` whose CALL OR TRAILING CHAIN reads a live signal. */
    const modulatedDrifts = (blk) => {
        const out = [];
        for (let i = 0; (i = blk.indexOf("KIT.mhDrift(", i)) !== -1; i += 5) {
            const call = chainAt(blk, i);
            let modulated = SIGNAL.test(call);
            if (!modulated) {   // the rate may be a bare identifier declared nearby; resolve one level
                const idm = /KIT\.mhDrift\(\w+\.\w+,\s*([A-Za-z_]\w*)\s*[,.]/.exec(call);
                if (idm) modulated = SIGNAL.test((new RegExp("const " + idm[1] + " = [\\s\\S]{0,200}").exec(blk) || [""])[0]);
            }
            if (modulated) out.push(call.replace(/\s+/g, " "));
        }
        return out;
    };

    // *** AND THE CENSUS CARRIES ITS OWN NEGATIVE CONTROL, because the version it replaces was GREEN. ***
    // Three synthetic sites: one plain, one modulated through its rate argument, one modulated through a
    // trailing multiply. The third is the one the old form could not see, so a regression to the old form
    // does not quietly go back to reporting "(none)" -- it goes red here first, on a fixture that is four
    // lines long and does not depend on what the orb happens to contain this round.
    const FIXTURE = [
        'const a = KIT.mhDrift(uniforms.time, float(0.5), float(0.4), float(2.0)).toVar();',
        'const rB = float(0.3).add(PACE.mul(0.7)).toVar();',
        'const b = KIT.mhDrift(uniforms.time, rB, float(0.4), float(2.0)).toVar();',
        'const c = KIT.mhDrift(uniforms.time, float(0.5), float(0.4), float(2.0))\n    .mul(float(1.0).add(VOICE.mul(0.35))).toVar();',
    ].join("\n");
    const found = modulatedDrifts(FIXTURE);
    ok("!! *** THE CENSUS CAN SEE BOTH SHAPES -- it is checked on a fixture before it is believed about the orb ***",
        found.length === 2 && found.some((x) => /rB/.test(x)) && found.some((x) => /VOICE/.test(x)),
        `three synthetic drift sites -- a plain one, one modulated through its RATE, and one modulated by a ` +
        `TRAILING MULTIPLY -- and the census flags exactly the second and third: ` +
        `${JSON.stringify(found.map((x) => x.slice(0, 52)))}. ` +
        `THE THIRD IS THE ONE THIS ROW EXISTS FOR. The form shipped at v4654 matched to the first .toVar() ` +
        `after the rate argument and only resolved bare identifiers, so it found one of these three and ` +
        `reported the file clean. An instrument that has not been shown a positive is not evidence about a ` +
        `negative, and "(none)" is a negative.`);

    const repaired = [], plainDrift = [];
    for (let k = 0; k < marks.length - 1; k++) {
        const blk = lines.slice(marks[k][0], marks[k + 1][0]).join("\n");
        if (/KIT\.mhDriftPhase\(/.test(blk)) repaired.push(marks[k][1]);
        for (const call of modulatedDrifts(blk)) plainDrift.push(`${marks[k][1]}:${call.slice(0, 44)}`);
    }
    say(`species whose clocks use the integrated phase: ${repaired.join(", ")}`);
    say(`modulated rates still on murmur's rate * t: ${plainDrift.length ? plainDrift.join(", ") : "(none)"}`);

    // *** EIGHT AT v4662, AND THE EIGHTH WAS AN ABSENCE RATHER THAN A TELEPORT. *** geode's spin is
    // mix(mh_drift(...), t * 0.30 * sp, st.drive * 0.70) in geode.ts and this port carried the mh_drift arm
    // alone -- so there was no modulated rate here for this census to find, and there never would have been.
    // Every species this row has ever added for that reason (helix at v4655, geode here) came out of reading
    // the source file against this one, which is the only instrument that finds a signal that is missing.
    // NINE at v4663: fathom's first shell joins, and it is the same kind of arrival geode and helix were --
    // an ABSENCE rather than a teleport. fathom.ts scales all three shell rates by
    // sp = (1 + 0.85*live.pace + 1.10*st.drive) and this port carried the bare drift, so the nest turned at
    // one speed whatever the orb did. Only the shell whose rate is a clean SUM is here; the other two are
    // mixes and need an integral of drive squared -- see tools/ship/murmurCadence-selfcheck.mjs section 4.
    const WANT = ["aura", "comet", "limn", "flux", "helix", "mist", "duet", "geode", "fathom"].sort();
    ok("!! *** ALL NINE MODULATED CLOCKS IN THIS FILE ARE REPAIRED, AND THERE IS NOTHING LEFT TO NAME ***",
        repaired.slice().sort().join(",") === WANT.join(",") && plainDrift.length === 0,
        `${repaired.join(", ")} build their secular phase with mhRatePhase and hand it to mhDriftPhase, and ` +
        `no plain mh_drift anywhere in the file reads a live signal in its rate OR its output. *** AND ONE ` +
        `SITE USES mhRatePhase WITHOUT mhDriftPhase, WHICH IS WHY THIS ROW COUNTS EIGHT AND NOT NINE: *** ` +
        `opal's flash drift is spent inside three plain sines rather than through mh_drift, so it has a ` +
        `secular phase to integrate and no wobble to leave alone. It took murmur's live terms at v4662 -- ` +
        `(1 + 0.75*live.pace + 0.95*st.drive), absent from this port until then -- and it is graded in ` +
        `tools/ship/murmurClock3-selfcheck.mjs, not here, because this row's subject is mh_drift. THE CENSUS ` +
        `SAID "(none)" AT v4654 WHILE mist AND flux WERE STILL TELEPORTING -- it inspected only the rate ` +
        `argument, and only when that argument was a bare identifier, so a drift whose OUTPUT is scaled ` +
        `afterwards was invisible to it. *** AND THE LAST ONE, duet's, WAS RECORDED HERE FOR THREE ROUNDS AS ` +
        `UNREACHABLE: *** "its rate reads the species' OWN FLOURISH envelope, which is computed inside the ` +
        `shader from a hash and cannot be integrated by a host that has never seen it." THE HOST CAN SEE IT. ` +
        `mh_flourish is a pure function of shader time, a lane and a slot LENGTH, and duet's lane and slot ` +
        `are style constants out of MH_DUET -- so the envelope is a deterministic function of the clock the ` +
        `host already keeps, and v4657 integrates it like any other signal. The sentence was true of a signal ` +
        `the host does not know and duet's was never one of those; it read as a property of the mechanism and ` +
        `was believed for three rounds.`);

    // *** THE SECULAR PHASE MUST CARRY THE SAME PER-LANE SCALE THE RATE DOES, and nothing renders aura. ***
    // A sabotage scaled aura's rate per lane and left its secular phase unscaled -- three ribbons whose
    // wobble ran at three speeds and whose travel ran at one -- and no gate moved, because aura is not in
    // any pixel section this round could afford. This is a SOURCE census and it is at the altitude it can
    // answer at: the two arguments to mhDriftPhase have to be scaled by the same factor, which is a thing
    // about the expression rather than about the picture.
    const auraScaled = /mhDriftPhase\(rateSec\.mul\(AU\.rateLane\[k\]\), rate\.mul\(AU\.rateLane\[k\]\)/.test(src);
    ok("!! *** aura's THREE LANES SCALE THE SECULAR PHASE AND THE RATE BY THE SAME FACTOR ***",
        auraScaled && /rateLane: Object\.freeze\(\[1\.00, 0\.83, 1\.17\]\)/.test(fs.readFileSync(path.join(ENG, "render", "murmurKit.mjs"), "utf8")),
        `both arguments read AU.rateLane[k], whose three values are 1.00, 0.83 and 1.17. THE PAIR IS THE ` +
        `POINT: the secular term is where the ribbon travels and the rate is only the amplitude of its ` +
        `wobble, so scaling one without the other gives three ribbons that share a travel and differ in ` +
        `hurry -- aura.ts's own note says the three rates "are what the parallax is made of", and identical ` +
        `travel with different wobble is not parallax, it is a shimmer.`);

    // ...and the frames a gate renders have to describe a POSSIBLE history, or the clock reads a signal
    // that was never raised. See tools/ship/murmurSpeciesFrames.mjs's own note: this went red on limn.
    const FRsrc = codeOnly(fs.readFileSync(path.join(ENG, "tools", "ship", "murmurSpeciesFrames.mjs"), "utf8"));
    ok("!! ...and the shared frame helper DERIVES the three integrals from each frame's own knobs",
        /paceInt: lv\.pace \* time/.test(FRsrc) && /voiceInt: lv\.voice \* time/.test(FRsrc) &&
        /driveInt: st\.drive \* time/.test(FRsrc) && !/paceInt: 0/.test(FRsrc),
        `sp() computes signal * time for all three rather than leaving them at 0. A frame that sets `+"`voice`"+` ` +
        `and defaults `+"`voiceInt`"+` describes a signal that is loud now and has been silent for all of time, ` +
        `so the clock runs at its resting rate with the knob turned up -- WHICH IS NOT HYPOTHETICAL: it went ` +
        `red on limn's hue turn the moment the integrated clock landed, at 26.45 degrees against a recorded ` +
        `28.6. A species gate's frame is a steady state, so signal * time is the history it describes, and it ` +
        `is exactly the case where the integrated form reduces to murmur's own.`);

    // *** THE FRAME HELPER HAS TO DERIVE THE THREE NEW INTEGRALS TOO, AND THE CROSS ONES ARE THE TRAP. ***
    // v4654 learned that a frame which sets a signal and defaults its integral describes an impossible
    // history. The cross terms add a second way to get it wrong that LOOKS right: paceInt * driveInt is
    // pace*drive*t SQUARED, so it agrees at t = 1 and diverges by the frame's own timestamp everywhere else.
    // A sabotage that wrote exactly that walked through every gate in the tree.
    ok("!! *** ...and sp() DERIVES the cross integrals as signal*signal*time and NOT as a product of integrals ***",
        /paceDriveInt: lv\.pace \* st\.drive \* time/.test(FRsrc) &&
        /voiceDriveInt: lv\.voice \* st\.drive \* time/.test(FRsrc) &&
        /duetFlourishInt: flourishQuadrature\(time\)/.test(FRsrc) &&
        !/paceDriveInt: \(/.test(FRsrc),
        `sp() computes lv.pace * st.drive * time and not (lv.pace * time) * (st.drive * time). AND duet's ` +
        `GESTURE INTEGRAL IS A QUADRATURE RATHER THAN env * time: the envelope is a function of the CLOCK ` +
        `and not a held signal -- it is zero for most of its slot -- so env * time would describe a gesture ` +
        `that had been playing since the session began, which is the same class of impossible history the ` +
        `three original integrals were given a derivation to avoid.`);

    // limn's deferred half, PAID at v4657 -- and the row inverts rather than being deleted, because what it
    // was protecting (that a product must not be folded in as if it were a sum) is still the claim.
    ok("!! *** ...and limn's PRODUCT rate is expanded, not folded: its two cross terms are integrals of PRODUCTS ***",
        /KIT\.mhCrossPhase\(limnBase, float\(LR\.pace \* LR\.drive\), uniforms\.paceDriveInt/.test(raw) &&
        /float\(LR\.voice \* LR\.drive\), uniforms\.voiceDriveInt/.test(raw) &&
        /float\(LR\.drive\), uniforms\.driveInt/.test(raw),
        `limn.ts spells rate = base * (1 + 0.95*pace + 0.30*voice) * (1 + 1.05*drive) -- two modulated ` +
        `FACTORS, and it is the only rate in the roster shaped that way. Expanding gives cross terms in ` +
        `pace*drive and voice*drive, whose integrals are integrals of a PRODUCT and NOT products of the two ` +
        `integrals. v4654 named that price -- two more accumulators for one species -- and passed 0.0 rather ` +
        `than fold a product in as a sum; v4657 pays it. THE TWO CROSS COEFFICIENTS ARE FORMED AS PRODUCTS ` +
        `OF THE TWO FACTORS at the call site, so 0.95 * 1.05 is the expansion itself rather than a third ` +
        `number beside it that can drift from the two it came from.`);

    // ...and the EASE limn.ts flattens as the sweep decides: a BOUNDED amplitude, so it reads the
    // INSTANTANEOUS drive and has nothing to teleport. It is a row because a sabotage that reverted it to
    // the resting 0.62 moved nothing anywhere in the tree -- every pixel row this round takes is at drive 0
    // or measures the secular travel, and the wobble is only the sine term's amplitude.
    ok("!! ...and limn's WOBBLE flattens under drive, 0.62 to 0.14, which this port carried as a constant",
        /mix\(float\(LR\.wobLo\), float\(LR\.wobHi\), DRIVE\)/.test(raw) &&
        K.MH_LIMN_RATE.wobLo === 0.62 && K.MH_LIMN_RATE.wobHi === 0.14,
        `limn.ts: wobble = mix(0.62, 0.14, st.drive), written beside the rate that "roughly doubles: a ` +
        `decisive sweep". The ease FLATTENING as the sweep goes is what makes it read as decision rather ` +
        `than as hurry, and this file carried the resting 0.62 at every drive. mh_drift's wobble term is ` +
        `k*rate/w2 times a sine and cannot accumulate, which is why it takes the instantaneous drive exactly ` +
        `as murmur writes it -- the same split every clock in this file now makes between a secular half ` +
        `that reads an integral and a bounded half that does not.`);

    // The uniforms have to arrive, or the integrals are three numbers nobody sends.
    const W = codeOnly(fs.readFileSync(path.join(ENG, "ui", "aiPresenceOrbWidget.js"), "utf8"));
    const H = codeOnly(fs.readFileSync(path.join(ENG, "ai-presence-orb.html"), "utf8"));
    const feeds = (s) => ["paceInt", "voiceInt", "driveInt", "paceDriveInt", "voiceDriveInt", "duetFlourishInt"]
        .every((n) => new RegExp(n + ":\\s*p\\." + n).test(s));
    ok("!! *** BOTH CONSUMERS SEND ALL SIX INTEGRALS -- a correct integral nothing feeds to a shader is the defect ***",
        feeds(W) && feeds(H) && /paceInt \+= lv\.pace \* dPhase/.test(fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbState.mjs"), "utf8")),
        `ui/aiPresenceOrbWidget.js and ai-presence-orb.html both pass all six -- the three conditioned signals ` +
        `from v4654 and limn's two cross products and duet's gesture from v4657 -- and the ` +
        `state module accumulates them against dPhase rather than dt. THIS ROW IS THE LESSON OF v4650 APPLIED ` +
        `BEFORE THE FACT: there, a correct integrator was computed every tick for sixty-two rounds and thrown ` +
        `away at the one call that fed a shader, and the gate that proved the FUNCTION right could not see it.`);
}

// =============================================================================================================
sec("5. *** THE TWO RATES THIS FILE RECORDED AS OUT OF REACH, AND WHAT EACH ONE ACTUALLY COST ***");
{
    // *** duet: THE RECORD SAID THE HOST COULD NOT SEE THE SIGNAL. IT COULD. *** duet.ts's rate reads its own
    // gesture envelope, fl.x, and this gate said for three rounds that "a signal the host does not know has
    // no integral to send". mh_flourish is a pure function of shader time, a LANE and a SLOT LENGTH -- and
    // duet's two are style constants. The envelope is therefore a function of the clock this host already
    // keeps, and the row below grades the host's running accumulation against a fine quadrature of the very
    // function the shader runs.
    const DU = K.MH_DUET;
    const quad = (t, N) => { const h = t / N; let a = 0;
        for (let i = 0; i < N; i++) a += K.mhFlourish((i + 0.5) * h, DU.flourishSlot, DU.flourishDur).env * h;
        return a; };
    {
        // *** THE VALUE READ HERE IS THE STATE MODULE's OWN, NOT ONE THIS GATE KEEPS BESIDE IT. *** The first
        // cut accumulated its own running sum and compared THAT to the quadrature, so it graded the idea and
        // not the code -- and two sabotages walked straight through it: accumulating against wall dt instead
        // of shader time, and reading the wrong flourish lane. A reference is only evidence about the thing
        // it is actually applied to.
        const st = createPresenceState("idle");
        let acc = 0, worst = 0, at = "", checks = 0;
        for (let i = 0; i < Math.round(240 / DT); i++) {
            st.tick(DT, { voice: 0, activity: 0 });
            const t = st.getParams().phase;
            acc = st.getParams().duetFlourishInt;
            if (i % 1800 === 0 && i) {
                const ref = quad(t, 20000), d = Math.abs(acc - ref);
                checks++;
                if (d > worst) { worst = d; at = `t = ${t.toFixed(1)} s, host ${acc.toFixed(5)}, quadrature ${ref.toFixed(5)}`; }
            }
        }
        ok("!! *** THE HOST's GESTURE INTEGRAL IS A QUADRATURE OF THE SHADER's OWN ENVELOPE, to 3 decimal places ***",
            worst < 5e-3 && acc > 2 && checks >= 7,
            `worst |host accumulation - 20,000-step quadrature| = ${worst.toExponential(2)} over ${checks} ` +
            `checks across four minutes of shader time, reaching ${acc.toFixed(4)} radian-seconds (worst at ` +
            `${at}). THE HOST ACCUMULATES AT 1/60 s AND THE REFERENCE AT 1/83 ms, so the residual is the ` +
            `rectangle rule's own error on a sin^2 bump and not a disagreement about what is being ` +
            `integrated. THIS ROW IS WHAT MAKES duet's REPAIR POSSIBLE AT ALL, and this file said it was not: ` +
            `"its rate reads the species' OWN FLOURISH envelope, which is computed inside the shader from a ` +
            `hash and cannot be integrated by a host that has never seen it." The hash is keyed on a slot ` +
            `index that is a function of time alone, because duet's slot LENGTH never moves.`);
    }

    // The size of what that record was hiding, on the same instrument section 1 uses for comet.
    {
        const base = DU.rateB + 0.5 * DU.rateK;
        // *** THE SETTLE IS A CLOSED FORM AND NOT HALF A MILLION TICKS. *** In IDLE with no transition the
        // state module's speed is a constant 0.30 and integrateTempo of a constant is that constant times
        // dt, so phase is EXACTLY 0.30 * wall seconds -- which the row below checks against the module
        // rather than assuming. Walking the module through 1,800 s at 1/60 to reach a number it computes in
        // closed form cost 438,000 ticks across the four session lengths and most of this gate's budget.
        const IDLE_SPEED = 0.30;
        const run = (settle) => {
            const t0 = settle * IDLE_SPEED;
            let fi = quad(t0, 40000), pN = null, pI = null, wN = 0, wI = 0;
            const step = DT * IDLE_SPEED;
            for (let i = 1; i <= Math.round(25 / DT); i++) {
                const t = t0 + i * step;
                const fl = K.mhFlourish(t, DU.flourishSlot, DU.flourishDur).env;
                fi += fl * step;
                const naive = base * (1 + DU.rateFlourish * fl) * t;
                const integ = K.mhRatePhase(base, t, 0, 0, DU.rateFlourish, fi, 0, 0);
                if (pN !== null) { wN = Math.max(wN, Math.abs(naive - pN)); wI = Math.max(wI, Math.abs(integ - pI)); }
                pN = naive; pI = integ;
            }
            return { wN, wI };
        };
        {   // ...and the closed form IS the module, checked rather than assumed.
            const stc = createPresenceState("idle");
            for (let i = 0; i < Math.round(20 / DT); i++) stc.tick(DT, { voice: 0, activity: 0 });
            const got = stc.getParams().phase, want = 20 * IDLE_SPEED;
            ok("!! the settled-IDLE phase this section uses in closed form is the module's own, to 1.1e-13",
                Math.abs(got - want) < 1e-9,
                `twenty seconds of IDLE ticks give phase ${got.toFixed(12)} against 20 * ${IDLE_SPEED} = ` +
                `${want.toFixed(12)}, a difference of ${Math.abs(got - want).toExponential(1)}. THE ROWS ` +
                `BELOW SETTLE IN CLOSED FORM rather than ticking the module through half an hour, and this ` +
                `is what makes that substitution a measurement instead of an assumption.`);
        }
        const rows = [5, 60, 300, 1800].map((s) => ({ s, ...run(s) }));
        say("duet's orbital phase, worst ONE-FRAME advance across a 25 s window containing one gesture:");
        for (const r of rows) say(`   after ${String(r.s).padStart(4)}s:  integrated ${r.wI.toFixed(6)} rad    murmur's rate*t ${r.wN.toFixed(4)} rad    ${(r.wN / r.wI).toFixed(0)}x`);
        const flat = Math.max(...rows.map((r) => r.wI)) - Math.min(...rows.map((r) => r.wI));
        // THE FLATNESS BOUND IS RELATIVE AND THE REASON IS THE SAMPLING GRID, not slack. Each window starts
        // at a different settle, so its 1/60 s frames land on different points of the gesture's sin^2 peak
        // and the MAXIMUM over the window differs in the last few digits. 1.2e-8 rad on a 0.006244 rad
        // reading is 1.9e-6 of it; the bound is 1e-5, which is five times the reading and nine orders below
        // what a session-dependent advance would show.
        ok("!! *** duet's ORBIT JUMPED 1.8152 rad IN ONE FRAME AFTER HALF AN HOUR -- 29% OF A WHOLE TURN, on a gesture ***",
            rows[3].wN > 1.5 && flat / rows[3].wI < 1e-5 && rows[3].wN / rows[3].wI > 200,
            `${rows[0].wN.toFixed(4)} rad after 5 s of running and ${rows[3].wN.toFixed(4)} after 1800 -- ` +
            `${(rows[3].wN / rows[3].wI).toFixed(0)}x the integrated frame, which is ` +
            `${rows[3].wI.toFixed(6)} rad and varies by ${flat.toExponential(1)} -- ` +
            `${(flat / rows[3].wI).toExponential(1)} of itself -- across all four session lengths. THE TRIGGER IS THE SPECIES' OWN GESTURE and nothing the user does: duet's rate rises ` +
            `85% through a flourish, so the pair lurched most of a third of the way round their shared orbit ` +
            `every time the envelope moved, and further the longer the orb had been on screen.`);
    }

    // *** limn: THE RECORD NAMED THE PRICE CORRECTLY AND THIS ROUND PAID IT. *** Two accumulators, and the
    // expansion is exact -- which is the part that matters, because a product folded in as a sum would be
    // a different function that happened to look right at one operating point.
    {
        const LR = K.MH_LIMN_RATE, base = LR.base + 0.5 * LR.travelK;
        let worst = 0, at = "", n = 0;
        for (const p2 of [0, 0.3, 0.6, 1]) for (const v of [0, 0.4, 1]) for (const d of [0, 0.5, 1]) {
            for (const t of [1, 10, 100, 1000, 3600]) {
                const mine = K.mhRatePhase(base, t, LR.pace, p2 * t, LR.voice, v * t, LR.drive, d * t) +
                             K.mhCrossPhase(base, LR.pace * LR.drive, p2 * d * t, LR.voice * LR.drive, v * d * t);
                const theirs = base * (1 + LR.pace * p2 + LR.voice * v) * (1 + LR.drive * d) * t;
                const dd = Math.abs(mine - theirs); n++;
                if (dd > worst) { worst = dd; at = `pace ${p2} voice ${v} drive ${d} t ${t}`; }
            }
        }
        ok("!! *** THE EXPANSION IS murmur's PRODUCT, to 3.6e-12 over 180 held operating points out to an hour ***",
            worst < 1e-9 && n === 180,
            `worst |mhRatePhase + mhCrossPhase - murmur's (1 + a*p + b*v)(1 + c*d)| = ${worst.toExponential(2)} ` +
            `over ${n} combinations (worst at ${at}). A PRODUCT FOLDED IN AS A SUM WOULD PASS AT d = 0 AND AT ` +
            `p = v = 0, which is most of an idle session, and be wrong by ${(LR.pace * LR.drive).toFixed(4)} ` +
            `of the base for every radian-second where both are up. The cross coefficients are formed as ` +
            `${LR.pace} * ${LR.drive} and ${LR.voice} * ${LR.drive} at the call site rather than read from a ` +
            `third pair of numbers, so they cannot drift from the two factors they came from.`);

        // *** AND THE TWO CROSS ACCUMULATORS GROW AT THE RATE THEY CLAIM TO, read off the module in a SETTLED
        // regime where the closed form is exact. *** Once the smoothers have settled and mh_state's drive
        // has saturated, d(paceDriveInt)/dPhase must be pace*drive and nothing else -- an identity the module
        // cannot satisfy by accident, and one that a wrong signal, a wrong product or a wrong clock all break.
        {
            const st2 = createPresenceState("idle");
            st2.setState("responding");
            for (let i = 0; i < Math.round(30 / DT); i++) st2.tick(DT, { voice: 1.0, activity: 1.0 });
            const a2 = st2.getParams();
            for (let i = 0; i < Math.round(10 / DT); i++) st2.tick(DT, { voice: 1.0, activity: 1.0 });
            const b2 = st2.getParams();
            const dPh = b2.phase - a2.phase;
            const lv2 = K.mhLive(b2.voice, b2.activity, 3), stn2 = K.mhState(3, b2.stateTau);
            const slopes = [["paceDriveInt", (b2.paceDriveInt - a2.paceDriveInt) / dPh, lv2.pace * stn2.drive],
                            ["voiceDriveInt", (b2.voiceDriveInt - a2.voiceDriveInt) / dPh, lv2.voice * stn2.drive]];
            const worstS = Math.max(...slopes.map(([, got, want]) => Math.abs(got - want)));
            say(`settled slopes over ${dPh.toFixed(2)} rad of shader time: ` +
                slopes.map(([n2, got, want]) => `${n2} ${got.toFixed(6)} against ${want.toFixed(6)}`).join(", "));
            ok("!! *** EACH CROSS INTEGRAL GROWS AT EXACTLY THE PRODUCT OF THE TWO CONDITIONED SIGNALS ***",
                worstS < 1e-6 && slopes.every(([, got]) => got > 0.1),
                `worst |measured slope - the product| = ${worstS.toExponential(2)} after thirty seconds in a ` +
                `busy RESPONDING, where the smoothers have settled and drive has saturated so the closed ` +
                `form is exact. READ OFF THE MODULE ITSELF, which is what makes it a statement about the ` +
                `accumulation in render/aiPresenceOrbState.mjs rather than about the arithmetic being a ` +
                `good idea.`);
        }

        // ...and the cross integrals are integrals of a PRODUCT, which is the whole reason they exist.
        const st = createPresenceState("idle");
        for (let i = 0; i < Math.round(20 / DT); i++) st.tick(DT, { voice: 0, activity: 0 });
        st.setState("responding");
        for (let i = 0; i < Math.round(6 / DT); i++) st.tick(DT, { voice: 1.0, activity: 1.0 });
        const p3 = st.getParams();
        const naiveP = p3.paceInt * p3.driveInt, naiveV = p3.voiceInt * p3.driveInt;
        say(`after 20 s idle then 6 s of a busy RESPONDING: paceDriveInt ${p3.paceDriveInt.toFixed(4)}, paceInt*driveInt ${naiveP.toFixed(4)}`);
        ok("!! *** ...AND THE CROSS INTEGRAL IS NOT THE PRODUCT OF THE TWO INTEGRALS: 8.20 against 68.35 ***",
            Math.abs(naiveP / p3.paceDriveInt - 1) > 3 && Math.abs(naiveV / p3.voiceDriveInt - 1) > 3,
            `the integral of pace*drive is ${p3.paceDriveInt.toFixed(4)} where paceInt * driveInt is ` +
            `${naiveP.toFixed(4)}, a factor of ${(naiveP / p3.paceDriveInt).toFixed(1)}; voice the same at ` +
            `${p3.voiceDriveInt.toFixed(4)} against ${naiveV.toFixed(4)}. THE DIMENSIONS ALONE SAY IT: a ` +
            `product of two integrals carries t SQUARED and grows without bound against the thing it is ` +
            `standing in for. This is why the two accumulators had to be added rather than computed in the ` +
            `shader from the three that were already there, and it is the entire cost v4654 quoted.`);
    }
}

// =============================================================================================================
sec("4. *** AND IT REACHES PIXELS: the cadence moves comet's orbit, and IDLE at tau 0 is untouched ***");
{
    const FRAMES = [];
    for (const kn of [{ stateIndex: 0, stateTau: 0, paceInt: 0, voiceInt: 0, driveInt: 0 },
                      { stateIndex: 0, stateTau: 0, paceInt: 14.0, voiceInt: 0, driveInt: 0 },
                      { stateIndex: 0, stateTau: 1.0, paceInt: 0, voiceInt: 0, driveInt: 0 }])
        FRAMES.push(sp("comet", 12.0, undefined, kn));
    // ...and the two rates v4657 reached, in the SAME launch: two more WGSL compiles, and the frames after
    // them are nearly free. Every one holds stateIndex, stateTau and the level fixed, so the instantaneous
    // signals are identical across each pair and only the accumulated history differs.
    const Z = { stateIndex: 0, stateTau: 0, paceInt: 0, voiceInt: 0, driveInt: 0,
                paceDriveInt: 0, voiceDriveInt: 0, duetFlourishInt: 0 };
    FRAMES.push(sp("duet", 6.0, 0.6, { ...Z }));                                   // 3
    FRAMES.push(sp("duet", 6.0, 0.6, { ...Z, duetFlourishInt: 2.0 }));             // 4
    FRAMES.push(sp("duet", 6.0, 0.6, { ...Z, paceInt: 9.0 }));                     // 5
    FRAMES.push(sp("duet", 6.0, 0.6, { ...Z, voiceInt: 9.0 }));                    // 6  DEAF
    const LB = { ...Z, paceInt: 1.8, driveInt: 6.0 };
    FRAMES.push(sp("limn", 6.0, 0.6, { ...LB }));                                  // 7
    FRAMES.push(sp("limn", 6.0, 0.6, { ...LB, paceDriveInt: 4.0 }));               // 8
    FRAMES.push(sp("limn", 6.0, 0.6, { ...LB, voiceDriveInt: 4.0 }));              // 9
    const run = await renderSpecies(FRAMES);
    if (!run.ok || !run.frames || run.frames.length !== FRAMES.length) {
        ok("!! the modulated clock renders at all", false,
            `could not render: ${run.reason || (run.skipped ? "skipped: " + run.skipped : "frame count")}.`);
    } else {
        say(`backend: ${run.isWebGPUBackend ? "REAL WebGPU" : "WebGL2 fallback"}; ${FRAMES.length} frames`);
        const diff = (a, b) => { let n = 0, mx = 0;
            for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) n++; if (d > mx) mx = d; }
            return { pct: 100 * n / a.length, mx }; };
        const moved = diff(run.frames[0], run.frames[1]), quiet = diff(run.frames[0], run.frames[2]);
        say(`paceInt 0 -> 14: ${moved.pct.toFixed(1)}% of bytes move, worst channel ${moved.mx}   |   stateTau 0 -> 1 in IDLE: ${quiet.pct.toFixed(1)}%`);
        ok("!! *** THE PACE INTEGRAL MOVES comet's POINT OF LIGHT, AND A SWEPT tau IN IDLE MOVES NOTHING ***",
            moved.pct > 5 && moved.mx > 50 && quiet.pct === 0,
            `fourteen radian-seconds of accumulated cadence -- what about ten seconds of a busy exchange ` +
            `produces -- moves ${moved.pct.toFixed(1)}% of comet's bytes, worst channel ${moved.mx} of 255, ` +
            `because the orbit is simply further round. The same species with tau swept inside IDLE moves ` +
            `${quiet.pct.toFixed(0)} bytes. BOTH HALVES: a uniform nothing reads would pass the second alone, ` +
            `and this is the row that says the three integrals are not three numbers going nowhere.`);

        // *** AND THE THREE THAT ARRIVED AT v4657. *** duet's gesture integral and limn's two cross terms
        // are uniforms nothing read a round ago; these are the rows that say they reach a picture.
        const dFl = diff(run.frames[3], run.frames[4]), dPa = diff(run.frames[3], run.frames[5]);
        const dVo = diff(run.frames[3], run.frames[6]);
        const lPD = diff(run.frames[7], run.frames[8]), lVD = diff(run.frames[7], run.frames[9]);
        say(`duet: duetFlourishInt 0 -> 2 moves ${dFl.pct.toFixed(1)}% (worst ${dFl.mx}), paceInt 0 -> 9 ${dPa.pct.toFixed(1)}% (${dPa.mx}), voiceInt 0 -> 9 ${dVo.pct.toFixed(1)}%`);
        say(`limn: paceDriveInt 0 -> 4 moves ${lPD.pct.toFixed(1)}% (worst ${lPD.mx}), voiceDriveInt 0 -> 4 ${lVD.pct.toFixed(1)}% (${lVD.mx})`);
        ok("!! *** duet's GESTURE INTEGRAL AND limn's TWO CROSS TERMS ALL REACH THE PICTURE ***",
            dFl.pct > 5 && dFl.mx > 50 && dPa.pct > 5 && dPa.mx > 50 &&
            lPD.pct > 5 && lPD.mx > 50 && lVD.pct > 5 && lVD.mx > 50,
            `two radian-seconds of accumulated gesture -- roughly three of duet's own flourishes -- move ` +
            `${dFl.pct.toFixed(1)}% of its bytes, worst channel ${dFl.mx} of 255, and nine of accumulated ` +
            `cadence move ${dPa.pct.toFixed(1)}%. limn moves ${lPD.pct.toFixed(1)}% on the pace*drive ` +
            `integral and ${lVD.pct.toFixed(1)}% on voice*drive, with every instantaneous signal held. THE ` +
            `TWO CROSS TERMS ARE MEASURED SEPARATELY because limn's expansion gives them different ` +
            `coefficients -- 0.9975 and 0.3150 -- and a wiring that read one integral for both would pass a ` +
            `row that swept them together.`);
        ok("!! ...and duet is DEAF to the voice integral, which murmur does not give its rate",
            dVo.pct === 0,
            `duet.ts's rate is (1 + 0.55*live.pace + 0.90*st.drive + 0.85*fl.x) -- no voice term at all -- ` +
            `and nine radian-seconds of accumulated voice move ${dVo.pct.toFixed(0)} bytes. THE FRAME IS ONE ` +
            `WHERE THE OTHER TWO MOVE IT, which is what stops this being a reading taken on a picture that ` +
            `was never going to change: the same species at the same instant moves ${dFl.pct.toFixed(1)}% on ` +
            `its gesture and ${dPa.pct.toFixed(1)}% on its cadence.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the species' own clocks, and the one place this port deliberately does NOT do " +
    "what murmur does. murmur hands a moving rate to mh_drift, whose phase is rate * t; this port hands it " +
    "an integrated secular phase instead, which is the exact integral and reduces to murmur's expression " +
    "wherever nothing is moving. The divergence was put to the owner as a choice and taken knowingly." +
    "\nWHAT IS NOT CLAIMED: TWO SITES, AND THE LIST HAS GOT SHORTER IN EACH OF THE LAST FOUR ROUNDS. What is " +
    "left is opal's flash drift and geode's mix target, both of which spell a bare rate * t with no " +
    "mh_drift involved -- and in THIS port neither rate moves at all, because opal's live terms and geode's " +
    "drive mix are both absent. They are an absence to fill rather than a teleport to repair, and filling " +
    "them as murmur spells them would ship two new ones. " +
    "WHAT CAME OFF THE LIST: the four sites that multiply mh_drift's OUTPUT by a moving factor came off at " +
    "v4655 (tools/ship/murmurClock2-selfcheck.mjs), two of them teleporting while section 3 of THIS file " +
    "printed \"(none)\" -- which is why section 3 now checks its own census on a fixture before believing " +
    "it. The three flourish SLOT divisors came off at v4656 (tools/ship/murmurGesture-selfcheck.mjs). And " +
    "duet's rate and limn's drive factor came off at v4657: this file recorded duet's as UNREACHABLE for " +
    "three rounds and it was not, because duet's flourish lane and slot are style constants and the host " +
    "keeps the clock. Each remaining item is recorded against the st.drive entry in " +
    "tools/ship/nextRounds.mjs.");
process.exit(fails ? 1 : 0);
