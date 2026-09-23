// WebGLEngine/tools/ship/murmurSpMix-selfcheck.mjs -- v4668
//
// *** THE INTEGRAL OF DRIVE SQUARED, AND THE THREE CLOCKS THAT COULD NOT BE WIRED WITHOUT IT. ***
//
// murmur spells three clocks as a MIX of two arms whose rates BOTH carry the species' own speed factor:
//
//   geode.ts   ay = mix(mh_drift(t, 0.088 * sp, 0.48, 2.0), t * 0.30 * sp, st.drive * 0.70)
//   fathom.ts  a1 = mix(mh_drift(t, -0.062 * sp, 0.50, 2.0), a0, st.drive * 0.70)
//              a2 = mix(mh_drift(t,  0.108 * sp, 0.40, 3.0), a0, st.drive * 0.70)
//
// with sp = (1 + q*live.pace + s*st.drive). A mix of two rates is ONE rate -- A + B*drive with B the mix
// weight times the gap between the arms -- and multiplying it by sp puts a DRIVE-SQUARED term in it. The
// exact integral is then A*t + A*q*P + (A*s+B)*D + B*q*PD + B*s*DD, and DD is the one integral this host had
// never accumulated. ONE accumulator closed all three sites, which is why they were held together.
//
// *** WHAT THE PORT ACTUALLY DID BEFORE THIS ROUND, WHICH IS LARGER THAN THE MISSING CROSS TERMS. ***
// fathom's a1 and a2 were plain mh_drift at murmur's rates: no sp, no mix, no drive at all. So the second and
// third shells turned at one fixed speed in one fixed direction whatever the orb did, while murmur pulls them
// onto the FIRST shell's turn as the orb responds -- and a1's rate CHANGES SIGN doing it. geode had the mix
// from v4662 and no sp, which left it the last builder in the roster without a cadence.
//
// *** AND geode HAS A SECOND DRIVE SITE NOBODY HAD LOOKED FOR: *** ax = mix(0.34 + 0.22*sin(t*0.041), 0.30,
// st.drive*0.7). The stone stops NODDING as well as wobbling. v4664's st.drive audit passed it because that
// audit counts COEFFICIENTS and 0.70 was already in the table -- the weakness it states about itself.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { createPresenceState } from "../../render/aiPresenceOrbState.mjs";
import { sp, renderSpecies, VOICE_LIVE, PACE_LIVE } from "./murmurSpeciesFrames.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSpMix-selfcheck -- the drive-squared integral, and the three clocks that needed it\n");

const DT = 1 / 60, RESPONDING = 3;
const FA = K.MH_FATHOM, FS = K.MH_FATHOM_SP, GE = K.MH_GEODE, GSP = K.MH_GEODE_SP, GS = K.MH_GEODE_SPIN;

// The three sites, each named by the four numbers its own source contains.
const SITES = [
    ["fathom a1", FA.shells[1].rate, FA.shells[0].rate, FS.mixW, FS.pace, FS.drive],
    ["fathom a2", FA.shells[2].rate, FA.shells[0].rate, FS.mixW, FS.pace, FS.drive],
    ["geode ay", GE.spinRate, GS.to, GS.w, GSP.pace, GSP.drive],
].map(([n, base, toward, m, q, s]) => ({ n, base, toward, m, q, s, c: K.mhSpMixCoef(base, toward, m, q, s) }));

// murmur's own expression, evaluated directly: both arms at the instantaneous sp, mixed by the instantaneous
// weight. This is what the phase must be the integral OF.
const murmurRate = (S, p, d) => (1 + S.q * p + S.s * d) * (S.base * (1 - S.m * d) + S.toward * (S.m * d));

// =============================================================================================================
sec("1. *** THE FIVE COEFFICIENTS ARE THE INTEGRAL OF murmur's MIX ALONG A REAL RAMP -- not a restatement of it ***");
{
    // *** THE COMPARISON IS AGAINST A QUADRATURE AND NOT AGAINST A HELD SIGNAL. *** At a held signal both
    // sides carry the same numbers and the row passes for ANY coefficients -- v4655 walked exactly that
    // sabotage, and murmurClock3 section 2 replaced it with this shape for opal. So the signals are swept
    // along a genuine RESPONDING ramp and the phase is compared with a 4,096-step definite integral of the
    // moving rate, which is what a phase IS.
    const lv0 = K.mhLive(VOICE_LIVE, Math.pow(PACE_LIVE / 0.60, 1 / 0.85), 0);
    const lvR = K.mhLive(VOICE_LIVE, Math.pow(PACE_LIVE / 0.60, 1 / 0.85), RESPONDING);
    const T0 = 60, RAMP = 0.60, END = T0 + RAMP;
    const at = (t) => {
        const tau = t - T0;
        return tau <= 0 ? { p: lv0.pace, d: 0 } : { p: lvR.pace, d: K.mhState(RESPONDING, tau).drive };
    };
    const quad = (S) => { const N = 4096, h = END / N; let a = 0;
        for (let i = 0; i < N; i++) { const s = at((i + 0.5) * h); a += murmurRate(S, s.p, s.d) * h; } return a; };
    // the host's own integrals over the same ramp, at the same 4,096 steps
    let P = 0, D = 0, PD = 0, DD = 0;
    { const N = 4096, h = END / N;
      for (let i = 0; i < N; i++) { const s = at((i + 0.5) * h); P += s.p * h; D += s.d * h; PD += s.p * s.d * h; DD += s.d * s.d * h; } }
    let worstRel = 0, at2 = "";
    for (const S of SITES) {
        const q = quad(S), mine = K.mhSpMixPhase(S.c, END, P, D, PD, DD);
        const rel = Math.abs(q - mine) / Math.abs(q);
        say(`${S.n}: quadrature ${q.toFixed(6)} rad, expansion ${mine.toFixed(6)} rad`);
        if (rel > worstRel) { worstRel = rel; at2 = S.n; }
    }
    ok("!! *** ALL THREE PHASES ARE THE DEFINITE INTEGRAL OF murmur's MOVING RATE OVER A RAMPED MINUTE ***",
        worstRel < 1e-12,
        `worst relative gap ${worstRel.toExponential(1)} (at ${at2}) over 60 s of idle and a 0.60 s ramp, ` +
        `against a 4,096-step midpoint rule on murmur's own expression. BOTH SIDES SWEEP THE SAME RAMP AND ` +
        `ONLY ONE OF THEM KNOWS THE COEFFICIENTS: the quadrature evaluates (1 + q*pace + s*drive) * ` +
        `(base*(1-m*d) + toward*m*d) at 4,096 instants, and the expansion spends five constants on four ` +
        `accumulated integrals. A check against base*t*(1 + ...) at a held signal would pass with any ` +
        `coefficients at all, because both sides would read the same two numbers.`);
}

// =============================================================================================================
sec("1b. *** AND murmur MIXES THE WHOLE DRIFT, SO THE TWO WOBBLES MIX TOO ***");
{
    // *** THIS IS THE HALF OF THE MIX THAT IS NOT A CLOCK, AND IT IS EASY TO DROP. *** fathom.ts writes
    // mix(mh_drift(...), a0, w), not mix(secular, secular, w) + one wobble: the WHOLE of the second shell's
    // drift is mixed toward the WHOLE of the first shell's, ripple included. So as the orb responds, the
    // second shell's own ripple -- its lane, its period, its amplitude -- fades out and the first shell's
    // fades in, which is the visible half of "the nest closes up".
    //
    // *** IT IS A CPU ROW AND THE REASON IS STATED RATHER THAN THE BUDGET. *** The wobble mix moves with the
    // INSTANTANEOUS drive, exactly like the wobble's own amplitude through sp, so any two frames that differ
    // in drive differ in both at once -- and the shells' secular angles move too. There is no operating point
    // at which the mix alone changes, so a pixel row here would be measuring three things and reporting one.
    // Section 6 shows what it takes to isolate a term of this kind honestly, and there is no such crossing
    // for this one.
    const w2 = (lane) => 0.137 + 0.0413 * lane;
    const wob = (rate, k, lane, t, spf) => Math.min(0.72, Math.max(0, k)) * (rate * spf) / w2(lane) * Math.sin(w2(lane) * t + lane * 1.71);
    const PC = 0.30;
    let worst = 0, atT = 0;
    for (let t = 0; t <= 400; t += 0.05) {
        const spf = 1 + FS.pace * PC + FS.drive * 1;             // full drive
        const w0 = wob(FA.shells[0].rate, FA.shells[0].wob, FA.shells[0].lane, t, spf);
        const w1 = wob(FA.shells[1].rate, FA.shells[1].wob, FA.shells[1].lane, t, spf);
        const mixed = w1 * (1 - FS.mixW) + w0 * FS.mixW, plain = w1;
        if (Math.abs(mixed - plain) > worst) { worst = Math.abs(mixed - plain); atT = t; }
    }
    const shaderSrc = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    const spelled = /\.add\(mix\(wobF\[k\], wobF\[0\], wF\)\)/.test(shaderSrc);
    say(`fathom a1's ripple at full drive: mixing the two wobbles moves it by up to ${worst.toFixed(4)} rad ` +
        `(worst at t = ${atT.toFixed(2)} s), against a second shell whose own ripple spans ${(2 * 0.50 * Math.abs(FA.shells[1].rate) * (1 + FS.pace * PC + FS.drive) / w2(2)).toFixed(4)} rad`);
    ok("!! *** THE TWO WOBBLES MIX AT THE SAME WEIGHT AS THE RATES, AND IT IS WORTH A THIRD OF A RADIAN ***",
        spelled && worst > 0.30,
        `the shader spells .add(mix(wobF[k], wobF[0], wF)) -- the second shell's ripple weighted ` +
        `${(1 - FS.mixW).toFixed(2)} against the first's ${FS.mixW.toFixed(2)} at full drive -- and dropping ` +
        `it changes a1 by up to ${worst.toFixed(4)} rad. *** THE SPELLING CONJUNCT IS THE ONE THAT CATCHES ` +
        `THE DELETION AND IT IS LABELLED AS A SPELLING: *** the arithmetic beside it says what the deletion ` +
        `would cost, which is the part a reader needs and the part a regex cannot say. A sabotage that ` +
        `replaced the mix with wobF[k] walked through every other row in this gate.`);
}

// =============================================================================================================
sec("2. *** DRIVE SQUARED IS NOT REACHABLE FROM THE INTEGRALS THE HOST ALREADY SENT ***");
{
    // *** THE ACCUMULATOR HAS TO EARN ITS PLACE. *** Six integrals were already travelling to the shader, and
    // a seventh is worth adding only if the quantity is not some arithmetic of those six. It is not, and the
    // two plausible substitutions are both shown failing rather than argued away: DD is not driveInt squared
    // over t -- that is the square of a MEAN, which is never the mean of the squares unless drive is constant
    // -- and it is not driveInt scaled by anything fixed, because the scale depends on the ramp's shape.
    const lvR = K.mhLive(VOICE_LIVE, Math.pow(PACE_LIVE / 0.60, 1 / 0.85), RESPONDING);
    const mk = (hold) => { let t = 0, D = 0, DD = 0;
        for (let i = 0; i < Math.round(hold / DT); i++) { const d = K.mhState(RESPONDING, t).drive; D += d * DT; DD += d * d * DT; t += DT; }
        return { t, D, DD }; };
    const rows = [0.2, 0.35, 0.6, 3.0].map(mk);
    for (const r of rows)
        say(`held ${r.t.toFixed(2)} s into the ramp: D ${r.D.toFixed(6)}, DD ${r.DD.toFixed(6)}, ` +
            `D*D/t ${(r.D * r.D / r.t).toFixed(6)}, DD/D ${(r.DD / r.D).toFixed(6)}`);
    const sqErr = Math.max(...rows.map((r) => Math.abs(r.DD - r.D * r.D / r.t) / r.DD));
    const ratios = rows.map((r) => r.DD / r.D);
    const spread = Math.max(...ratios) / Math.min(...ratios);
    ok("!! *** IT IS NEITHER THE SQUARE OF THE DRIVE INTEGRAL NOR A FIXED MULTIPLE OF IT ***",
        sqErr > 0.05 && spread > 1.5,
        `D*D/t is off DD by up to ${(sqErr * 100).toFixed(1)}% across the ramp -- the square of the mean ` +
        `against the mean of the square, which agree only where drive is constant -- and DD/D varies by ` +
        `${spread.toFixed(2)}x over the same four points, so no fixed coefficient on driveInt reproduces it ` +
        `either. *** THIS ROW IS WHY THERE IS A SEVENTH ACCUMULATOR AND NOT A SIXTH REUSED. *** It is also ` +
        `asserted with a FLOOR rather than a ceiling: a row saying "these differ" that could be satisfied by ` +
        `a rounding difference would bless folding the term in at any tolerance.`);
}

// =============================================================================================================
sec("3. *** WHAT murmur's OWN SPELLING WOULD HAVE DONE IN ONE FRAME, AND WHAT THE INTEGRAL DOES ***");
{
    const IDLE_S = 1800;
    const lv0 = K.mhLive(VOICE_LIVE, Math.pow(PACE_LIVE / 0.60, 1 / 0.85), 0);
    const lvR = K.mhLive(VOICE_LIVE, Math.pow(PACE_LIVE / 0.60, 1 / 0.85), RESPONDING);
    let t = 0, P = 0, D = 0, PD = 0, DD = 0;
    for (let i = 0; i < IDLE_S / DT; i++) { P += lv0.pace * DT; t += DT; }
    const prev = {}, worst = {};
    for (const S of SITES) { worst[S.n] = { m: 0, o: 0 }; }
    for (let tau = 0; tau <= 0.60; tau += DT) {
        const d = K.mhState(RESPONDING, tau).drive;
        for (const S of SITES) {
            const m = murmurRate(S, lvR.pace, d) * t;             // murmur: rate(now) * elapsed
            const o = K.mhSpMixPhase(S.c, t, P, D, PD, DD);       // this port: the integral
            if (prev[S.n]) {
                worst[S.n].m = Math.max(worst[S.n].m, Math.abs(m - prev[S.n].m));
                worst[S.n].o = Math.max(worst[S.n].o, Math.abs(o - prev[S.n].o));
            }
            prev[S.n] = { m, o };
        }
        P += lvR.pace * DT; D += d * DT; PD += lvR.pace * d * DT; DD += d * d * DT; t += DT;
    }
    const TURN = 2 * Math.PI;
    for (const S of SITES)
        say(`${S.n}: murmur ${worst[S.n].m.toFixed(4)} rad in one 1/60 s frame (${(worst[S.n].m / TURN).toFixed(2)} of a turn), integrated ${worst[S.n].o.toFixed(6)}`);
    ok("!! *** EVERY ONE OF THE THREE WOULD HAVE CROSSED WHOLE TURNS BETWEEN TWO FRAMES ***",
        SITES.every((S) => worst[S.n].m > TURN && worst[S.n].o < 0.02),
        `entering RESPONDING after half an hour on screen. The integrated forms advance at most ` +
        `${Math.max(...SITES.map((S) => worst[S.n].o)).toFixed(6)} rad: what one frame is worth. *** AND ` +
        `THE JUMP GROWS WITH SESSION LENGTH WITHOUT BOUND, which is what makes this a defect rather than a ` +
        `tuning choice -- the error is t * dRate and nothing caps t. This is the same measurement v4654 ` +
        `through v4662 made of every other clock in the roster; these three are the last of them.`);
}

// =============================================================================================================
sec("4. *** THE HOST ACCUMULATES IT, AND THE ACCUMULATION IS THE INTEGRAL AND NOT A SPELLING ***");
{
    const st = createPresenceState("idle");
    for (let i = 0; i < Math.round(30 / DT); i++) st.tick(DT, { voice: 0, activity: 0 });
    st.setState("responding");
    let ref = 0, prevT = st.getParams().phase, worst = 0, checks = 0;
    for (let i = 0; i < Math.round(20 / DT); i++) {
        st.tick(DT, { voice: 0, activity: 0 });
        const p = st.getParams();
        // The reference is built from the SHADER-TIME step and the state's own drive, independently of what
        // the host stored -- the same quantity, accumulated by a second party.
        const d = K.mhState(3, p.stateTau).drive;
        ref += d * d * (p.phase - prevT);
        prevT = p.phase;
        if (i % 120 === 0 && i) { checks++; worst = Math.max(worst, Math.abs(p.driveSqInt - ref)); }
    }
    const fin = st.getParams();
    // THE FIELD IS READ DEFENSIVELY AND THAT IS NOT DEFENSIVE PROGRAMMING. A sabotage that deletes
    // driveSqInt from the host's returned params made the first cut of this section throw on .toFixed, and a
    // gate that CRASHES is a worse diagnosis than one that goes red: the runner files it under whatever the
    // last line of the stack says, which is how seventeen crashed gates were once filed under the Node
    // version banner. A missing field is a finding and it is reported as one.
    const hostDD = Number(fin.driveSqInt);
    say(`after 20 s of RESPONDING: host driveSqInt ${Number.isFinite(hostDD) ? hostDD.toFixed(6) : "ABSENT from getParams()"}, independent sum ${ref.toFixed(6)}, driveInt ${fin.driveInt.toFixed(6)}`);
    ok("!! *** THE HOST'S driveSqInt IS THE INTEGRAL OF drive*drive IN SHADER TIME, checked every 2 s through the ramp ***",
        Number.isFinite(hostDD) && hostDD > 0 && worst < 1e-9 && checks >= 8 && Math.abs(hostDD - fin.driveInt) > 0,
        `worst |host - independent| = ${worst.toExponential(2)} across ${checks} checkpoints. *** IT IS ` +
        `ACCUMULATED AGAINST dPhase AND NOT AGAINST dt, *** exactly like the six before it: the shader's ` +
        `clock is the tempo integral and not wall seconds, so an integral kept in seconds would be the ` +
        `wrong quantity everywhere the orb's speed is not 1. The last conjunct is there because drive and ` +
        `drive-squared coincide at drive 1 and at drive 0 -- a run that only ever saw those two would pass ` +
        `an accumulator that squared nothing.`);

    // *** AND THE GATES' OWN FRAME HELPER HAS TO SEND THE SAME QUANTITY, which is a separate claim with its
    // own failure. *** A frame is a steady state, so its consistent integral is signal*time -- and for the
    // SQUARE that is drive*drive*time, not drive*time and not driveInt*driveInt. v4654 found this exact trap
    // one signal earlier: a frame that sets a signal and leaves its integral at a default describes an
    // impossible history, and the species then renders at its resting rate with its knob turned up. A
    // sabotage that made murmurSpeciesFrames send drive*time walked through every row of this gate before
    // this one existed, because every pixel row here compares two frames that share the mistake.
    const PARTIAL = K.mhState(RESPONDING, 0.3).drive, TF = 7.0;
    const fk = sp("geode", TF, 0.30, { stateIndex: RESPONDING, stateTau: 0.3 }).knobs;
    say(`the frame helper at drive ${PARTIAL.toFixed(4)}, t = ${TF}: driveSqInt ${fk.driveSqInt.toFixed(6)}, driveInt ${fk.driveInt.toFixed(6)}`);
    ok("!! *** A GATE FRAME'S driveSqInt IS drive*drive*time AND IS MEASURABLY NOT drive*time ***",
        Math.abs(fk.driveSqInt - PARTIAL * PARTIAL * TF) < 1e-12 &&
        Math.abs(fk.driveSqInt - PARTIAL * TF) > 1.0 &&
        Math.abs(fk.driveSqInt - fk.driveInt * fk.driveInt) > 1.0,
        `${fk.driveSqInt.toFixed(6)} against ${(PARTIAL * TF).toFixed(6)} for drive*time and ` +
        `${(fk.driveInt * fk.driveInt).toFixed(6)} for the square of the integral. *** THE OPERATING POINT IS ` +
        `A PARTIAL DRIVE ON PURPOSE: *** at drive 0 all three are 0 and at drive 1 the first two are equal, ` +
        `so a row written at either end of the ramp cannot tell the right quantity from the wrong one -- and ` +
        `both ends are where a frame is easiest to write.`);

    const hostSrc = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbState.mjs"), "utf8");
    ok("!! ...and it is in the returned params, so a shader can actually read it",
        /driveSqInt \+= stn\.drive \* stn\.drive \* dPhase/.test(hostSrc) && /driveSqInt,/.test(hostSrc) &&
        /"driveSqInt"/.test(fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8")),
        `the accumulation, the return and the uniform name. v4663 built an energyInt node in the shader, ` +
        `needed it nowhere and left it as dead code -- a mechanism nobody invokes, in the round whose ` +
        `subject was mechanisms nobody invokes -- so the two ends are checked rather than the middle.`);
}

// *** BOTH PIXEL SECTIONS RENDER FROM ONE LAUNCH PER SPECIES, WHICH IS A BUDGET DECISION AND IS STATED. ***
// A headless launch is nearly the whole cost of a frame -- four geode frames cost barely more than two -- and
// a gate over its 3,000 ms budget does not run at ship time AT ALL, which is the failure this tree records as
// worse than a red one. Three launches measured 2,711 ms; two measure comfortably under. reuseInstances means
// frames differing only in knobs share a compiled shader, so the four geode frames are one WGSL compile.
const T5 = 11.0, TAU5 = 0.3, D5 = K.mhState(RESPONDING, TAU5).drive;
const W2 = 0.137 + 0.0413 * GE.spinLane;
// t* -- the fourth zero of the spin wobble's own sine; see section 6 for why it is the fourth and not the
// second, and why a zero of that sine is what makes section 6 a measurement of ONE thing.
const T_STAR = (4 * Math.PI - GE.spinLane * 1.71) / W2;
const ZERO_INTS = { paceInt: 0, voiceInt: 0, driveInt: 0, paceDriveInt: 0, voiceDriveInt: 0, driveSqInt: 0 };
const GEODE_FR = [
    sp("geode", T5, 0.30, { stateIndex: RESPONDING, stateTau: TAU5 }),                      // 0 DD true
    sp("geode", T5, 0.30, { stateIndex: RESPONDING, stateTau: TAU5, driveSqInt: 0 }),       // 1 DD zero
    sp("geode", T_STAR, 0.30, { ...ZERO_INTS }),                                            // 2 tilt, at rest
    sp("geode", T_STAR, 0.30, { ...ZERO_INTS, stateIndex: RESPONDING, stateTau: 99 }),      // 3 tilt, driven
];
const FATHOM_FR = [
    sp("fathom", T5, 0.30, { stateIndex: RESPONDING, stateTau: TAU5 }),
    sp("fathom", T5, 0.30, { stateIndex: RESPONDING, stateTau: TAU5, driveSqInt: 0 }),
];
const geodeRun = await renderSpecies(GEODE_FR), fathomRun = await renderSpecies(FATHOM_FR);
const framesOf = (run, n) => (run.ok && run.frames && run.frames.length === n) ? run.frames : null;
const GF = framesOf(geodeRun, 4), FF = framesOf(fathomRun, 2);
/** bytes that differ between two RGBA frames, alpha excluded. */
const movedBetween = (a, b) => {
    let moved = 0, tot = 0, worst = 0;
    for (let i = 0; i < a.length; i++) { if (i % 4 === 3) continue; tot++; if (a[i] !== b[i]) moved++; worst = Math.max(worst, Math.abs(a[i] - b[i])); }
    return { moved, tot, worst };
};

// =============================================================================================================
sec("5. *** AND IT REACHES PIXELS: the drive-squared term ALONE, isolated by holding everything else ***");
{
    if (!GF || !FF) ok("!! the two species render at all", false,
        `could not render: ${geodeRun.reason || geodeRun.skipped || ""} ${fathomRun.reason || fathomRun.skipped || ""}`);
    else {
        // *** THE FRAMES DIFFER IN ONE UNIFORM. *** Both are at the RESPONDING ramp's own drive of 0.568 with
        // the same time, the same conditioned signals and the same P, D and PD; one carries the true
        // driveSqInt and the other carries the 0 a port without the accumulator would send. Anything that
        // moves is the drive-squared term and nothing else -- a stronger claim than "the species responds",
        // and the claim this round is actually making.
        const g = movedBetween(GF[0], GF[1]), f = movedBetween(FF[0], FF[1]);
        say(`at drive ${D5.toFixed(3)}, driveSqInt true vs 0 -- geode ${g.moved} of ${g.tot} bytes ` +
            `(${(100 * g.moved / g.tot).toFixed(1)}%, worst ${g.worst}); fathom ${f.moved} of ${f.tot} ` +
            `(${(100 * f.moved / f.tot).toFixed(1)}%, worst ${f.worst})`);
        ok("!! *** THE TERM THE HOST HAD NEVER SENT MOVES BOTH SPECIES ON ITS OWN ***",
            g.moved > g.tot * 0.05 && f.moved > f.tot * 0.05 && g.worst > 32 && f.worst > 32,
            `backend: REAL WebGPU. This is not "geode responds to drive" -- every frame here is AT the same ` +
            `drive, and the only difference is whether the seventh integral arrives. A port that folded sp ` +
            `into the mix without its cross terms would render the right-hand frame and call it murmur's. ` +
            `*** THE OPERATING POINT IS THE RAMP'S OWN AND NOT A CONVENIENT ONE: *** the term vanishes at ` +
            `drive 0 and this row would read 0 bytes there, so a partial drive is not a choice of ` +
            `sensitivity, it is the only place the question exists.`);
    }
}

// =============================================================================================================
sec("6. *** geode's SECOND DRIVE SITE, MEASURED WHERE ITS OWN WOBBLE CANNOT INTERFERE ***");
{
    // *** THE STONE STOPS NODDING, AND ISOLATING THAT TAKES ONE PIECE OF ARITHMETIC. *** buildGeode reads the
    // instantaneous DRIVE in exactly two places: the tilt mix, and the spin's WOBBLE amplitude through spG
    // and spinMix. mh_drift's wobble is (k*rate/w2) * sin(w2*t + lane*1.71), so at a time where that SINE is
    // zero the wobble contributes nothing at any amplitude -- and with the four integrals held at 0 the
    // secular half of the spin is 0.088*t in both frames. So at t* the two frames differ by the TILT alone.
    //
    // THE FOURTH ZERO IS CHOSEN RATHER THAN THE SECOND because sin(0.041*t) is 0.9906 there against 0.5095:
    // the nod is near its own extreme, which is where the mix has the most to take away. Choosing the zero
    // that makes the reading largest is legitimate only because the zero is decided by the WOBBLE's period
    // and the nod's value there is then whatever it is -- the two sines are incommensurate and neither was
    // tuned. Every one of the first six zeroes was computed before one was picked, and they are listed here:
    // 13.04 s (0.5095), 27.34 (0.9006), 41.65 (0.9906), 55.96 (0.7496), 70.26 (0.2579).
    const tiltAt = (d) => { const raw = GE.tiltB + Math.sin(T_STAR * GE.tiltRate) * GE.tiltAmp;
        return raw + (GE.tiltTo - raw) * (GS.w * d); };
    const swing = (d) => GE.tiltAmp * (1 - GS.w * d);
    say(`t* = ${T_STAR.toFixed(4)} s: wobble sine ${Math.sin(W2 * T_STAR + GE.spinLane * 1.71).toExponential(1)}, nod sine ${Math.sin(T_STAR * GE.tiltRate).toFixed(4)}`);
    say(`tilt ${tiltAt(0).toFixed(4)} rad at rest -> ${tiltAt(1).toFixed(4)} under drive; the nod's own swing ${swing(0).toFixed(3)} -> ${swing(1).toFixed(3)}`);
    if (!GF) ok("!! geode renders at the wobble's zero", false, "could not render");
    else {
        const m = movedBetween(GF[2], GF[3]);
        say(`geode at t*, drive 0 vs drive 1 with every integral held at 0: ${m.moved} of ${m.tot} bytes (${(100 * m.moved / m.tot).toFixed(1)}%), worst channel ${m.worst}`);
        ok("!! *** THE NOD IS A THIRD OF ITS SIZE UNDER DRIVE, AND THE PICTURE SHOWS IT WITH THE SPIN HELD ***",
            m.moved > m.tot * 0.05 && m.worst > 32 &&
            Math.abs(swing(1) / swing(0) - (1 - GS.w)) < 1e-12 && Math.abs(tiltAt(1) - 0.3774) < 1e-3,
            `the secular spin is 0.088*t in BOTH frames because every integral is 0, and the wobble is ` +
            `identically 0 in both because its sine is at a zero -- so the ${m.moved} bytes are the tilt. The ` +
            `swing falls to exactly 1 - ${GS.w} of itself, which is the mix weight at full drive and is ` +
            `asserted against murmur's number rather than against the measurement. *** WITHOUT THE ZERO ` +
            `CROSSING THIS ROW WOULD BE MEASURING TWO THINGS: *** spG runs 1.24 at rest and 2.24 under ` +
            `drive and spinMix 1.00 to 0.30, so the wobble's own amplitude moves 0.239 rad to 0.129 -- ` +
            `the same order as the tilt, on the same species, in the same frame.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the seventh host integral. Three of murmur's clocks are a MIX of two arms that " +
    "both carry the species' speed factor, which makes the rate quadratic in drive; the exact phase then " +
    "needs the integral of drive SQUARED, which is not the square of the drive integral and not a multiple " +
    "of it. v4663 recorded the expansion rather than approximating it and v4668 wired all three at once." +
    "\nAND WHAT THE ROUND FOUND ON THE WAY: fathom's second and third shells had no drive at all -- not a " +
    "missing cross term but a missing mix -- so the nest never closed up under RESPONDING, and a1's rate " +
    "runs the WRONG WAY at full drive. geode's tilt mix was absent too, and v4664's coefficient census " +
    "could not see it because 0.70 was already in the table for the spin." +
    "\nWHAT IS NOT CLAIMED: that the wobble halves are integrated. They are bounded by k*rate/w2 and keep " +
    "murmur's instantaneous sp and mix weight, which is v4655's split and is applied here rather than " +
    "re-argued. Section 6 depends on that being true and measures at a zero of the wobble to prove it does " +
    "not need it to be.");
process.exit(fails ? 1 : 0);
