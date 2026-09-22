// WebGLEngine/tools/ship/murmurClock-selfcheck.mjs -- v4654
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
    const repaired = [], plainDrift = [];
    for (let k = 0; k < marks.length - 1; k++) {
        const blk = lines.slice(marks[k][0], marks[k + 1][0]).join("\n");
        if (/KIT\.mhDriftPhase\(/.test(blk)) repaired.push(marks[k][1]);
        // a plain mhDrift whose rate reads a live signal is an UNREPAIRED modulated clock
        for (const m of blk.matchAll(/KIT\.mhDrift\(uniforms\.time,\s*([A-Za-z_]\w*)\s*[,.]/g)) {
            const re = new RegExp("const " + m[1] + " = [\\s\\S]{0,200}");
            const decl = (re.exec(blk) || [""])[0];
            if (/\b(VOICE|PACE|DRIVE)\b/.test(decl)) plainDrift.push(`${marks[k][1]}:${m[1]}`);
        }
    }
    say(`species whose clocks use the integrated phase: ${repaired.join(", ")}`);
    say(`modulated rates still on murmur's rate * t: ${plainDrift.length ? plainDrift.join(", ") : "(none)"}`);

    const WANT = ["aura", "comet", "limn"];
    ok("!! *** THE THREE MODULATED CLOCKS THIS PORT HAD ARE ALL REPAIRED, and the census names what is left ***",
        repaired.slice().sort().join(",") === WANT.join(",") && plainDrift.length === 0,
        `${repaired.join(", ")} build their secular phase with mhRatePhase and hand it to mhDriftPhase. Those ` +
        `are the three clocks in this file whose rate read a live signal at all. THE ONE REMAINING MODULATED ` +
        `RATE IS duet's, and it is not an oversight: its rate reads the species' OWN FLOURISH envelope, which ` +
        `is computed inside the shader from a hash and cannot be integrated by a host that has never seen it. ` +
        `A signal the host does not know has no integral to send, and that is a property of the mechanism ` +
        `rather than a gap in this round.`);

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

    // limn's deferred half, named precisely rather than left to a reader to notice.
    ok("!! ...and limn's DRIVE factor is still murmur's, because limn's rate is a PRODUCT and not a sum",
        /limnBase/.test(src) && /float\(0\.0\), uniforms\.driveInt/.test(raw) &&
        !/limnRate[\s\S]{0,80}DRIVE/.test(src),
        `limn.ts spells rate = base * (1 + 0.95*pace + 0.30*voice) * (1 + 1.05*drive) -- two modulated ` +
        `FACTORS. Expanding gives cross terms in pace*drive and voice*drive, and the factoring this round ` +
        `rests on needs the integral of each PRODUCT, not of each signal: two more accumulators for one ` +
        `species. It is the only rate in the roster shaped this way, its sum factor IS repaired here, and ` +
        `its drive factor is passed 0.0 rather than quietly folded in as if it were a sum.`);

    // The uniforms have to arrive, or the integrals are three numbers nobody sends.
    const W = codeOnly(fs.readFileSync(path.join(ENG, "ui", "aiPresenceOrbWidget.js"), "utf8"));
    const H = codeOnly(fs.readFileSync(path.join(ENG, "ai-presence-orb.html"), "utf8"));
    const feeds = (s) => /paceInt:\s*p\.paceInt/.test(s) && /voiceInt:\s*p\.voiceInt/.test(s) && /driveInt:\s*p\.driveInt/.test(s);
    ok("!! *** BOTH CONSUMERS SEND ALL THREE INTEGRALS -- a correct integral nothing feeds to a shader is the defect ***",
        feeds(W) && feeds(H) && /paceInt \+= lv\.pace \* dPhase/.test(fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbState.mjs"), "utf8")),
        `ui/aiPresenceOrbWidget.js and ai-presence-orb.html both pass paceInt, voiceInt and driveInt, and the ` +
        `state module accumulates them against dPhase rather than dt. THIS ROW IS THE LESSON OF v4650 APPLIED ` +
        `BEFORE THE FACT: there, a correct integrator was computed every tick for sixty-two rounds and thrown ` +
        `away at the one call that fed a shader, and the gate that proved the FUNCTION right could not see it.`);
}

// =============================================================================================================
sec("4. *** AND IT REACHES PIXELS: the cadence moves comet's orbit, and IDLE at tau 0 is untouched ***");
{
    const FRAMES = [];
    for (const kn of [{ stateIndex: 0, stateTau: 0, paceInt: 0, voiceInt: 0, driveInt: 0 },
                      { stateIndex: 0, stateTau: 0, paceInt: 14.0, voiceInt: 0, driveInt: 0 },
                      { stateIndex: 0, stateTau: 1.0, paceInt: 0, voiceInt: 0, driveInt: 0 }])
        FRAMES.push(sp("comet", 12.0, undefined, kn));
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
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the species' own clocks, and the one place this port deliberately does NOT do " +
    "what murmur does. murmur hands a moving rate to mh_drift, whose phase is rate * t; this port hands it " +
    "an integrated secular phase instead, which is the exact integral and reduces to murmur's expression " +
    "wherever nothing is moving. The divergence was put to the owner as a choice and taken knowingly." +
    "\nWHAT IS NOT CLAIMED: the other three mechanisms that carry the same shape and are NOT repaired -- the " +
    "four sites that multiply mh_drift's OUTPUT by a moving factor (flux, helix, nebula, tempest), the two " +
    "that spell a bare rate * t (opal's flash drift, geode's mix target), and the two flourish SLOT divisors " +
    "(still, abyss), where a changing slot re-indexes the gesture rather than advancing a phase. Each needs " +
    "its own treatment and each is recorded against the st.drive entry in tools/ship/nextRounds.mjs.");
process.exit(fails ? 1 : 0);
