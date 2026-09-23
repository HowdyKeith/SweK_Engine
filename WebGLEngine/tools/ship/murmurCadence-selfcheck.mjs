// WebGLEngine/tools/ship/murmurCadence-selfcheck.mjs -- v4663
//
// *** murmur GIVES A CADENCE TO ALL EIGHTEEN SPECIES AND THIS PORT REACHED TWELVE. *** The census in
// tools/ship/murmurLive-selfcheck.mjs has named the five builders without one for nine rounds -- droplet,
// opal, mist (nebula and tempest), fathom, geode -- and this round takes four of them.
//
// *** AND THE LARGEST THING IT FOUND IS NOT A MISSING TERM. IT IS A WRONG SIGNAL. *** tempest.ts:
//
//     float think  = (stateIndex > 1.5 && stateIndex < 2.5) ? 1.0 : 0.0;
//     float energy = clamp(0.85 * live.pace + 0.65 * think + 0.55 * st.drive, 0.0, 1.6);
//
// with the reason on the line above it: "THINKING IS THIS SPECIES' HOME STATE, so it is read directly rather
// than through mh_state, which only designs success and responding. A storm that rises while the assistant
// thinks is the whole concept."
//
// THIS PORT SPELLED IT `clamp(0.85 * voice, 0, 1.6)`. The coefficient was right and the input was not, so
// tempest's storm rose when somebody SPOKE and did nothing whatever while the assistant thought. MEASURED:
// between IDLE and THINKING, tempest moved 0 of 9,216 bytes. Its home state reached no pixel of it.
//
// energy is four sites -- the fold, the drift, both bolt slot divisors and the flicker -- so every one of
// them has been driven by the wrong number for as long as this port has had a tempest.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { sp, renderSpecies } from "./murmurSpeciesFrames.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurCadence-selfcheck -- the cadence in four builders that had none, and one wrong signal\n");

const TE = K.MH_TEMPEST_ENERGY, THINKING = K.MH_THINKING_INDEX, RESPONDING = 3;

// =============================================================================================================
sec("1. *** tempest's ENERGY: THE CLAMP NEVER BITES, AND THE REASON IS THAT TWO OF ITS TERMS CANNOT COEXIST ***");
{
    // *** THIS IS LOAD-BEARING AND NOT HOUSEKEEPING. *** The drift and the two slot divisors spend the
    // INTEGRAL of energy, and that factoring is exact only while energy is the plain sum -- a clamp that
    // bit would make the integral of the clamped signal something other than the sum of the integrals, and
    // the whole arrangement would stop being murmur's number. v4655 recorded the same check for the old
    // spelling, where energy was 0.85*voice and the margin was 1.88x. The new terms sum to 2.05, which is
    // ABOVE the 1.6 cap, so the old argument does not carry over and the question has to be asked again.
    let worst = 0, at = "", bothLive = false;
    for (let si = 0; si < 5; si++)
        for (let a = 0; a <= 1.0001; a += 0.02)
            for (let tau = 0; tau <= 1.4; tau += 0.02) {
                const lv = K.mhLive(0.6, a, si), st = K.mhState(si, tau);
                const think = (si > 1.5 && si < 2.5) ? 1 : 0;
                if (think > 0 && st.drive > 0) bothLive = true;
                const e = TE.pace * lv.pace + TE.think * think + TE.drive * st.drive;
                if (e > worst) { worst = e; at = `state ${si}, activity ${a.toFixed(2)}, tau ${tau.toFixed(2)}`; }
            }
    const naive = TE.pace + TE.think + TE.drive;
    say(`energy's three coefficients sum to ${naive.toFixed(2)}, which is ABOVE the ${TE.cap} cap -- and the most it ever reaches is ${worst.toFixed(4)}, at ${at}`);
    ok("!! *** THE CLAMP IS INERT BY 1.067x, AND ONLY BECAUSE `think` AND `drive` CAN NEVER BE LIVE TOGETHER ***",
        worst < TE.cap && !bothLive && naive > TE.cap && TE.cap / worst > 1.05,
        `swept over all five states, 51 activity levels and 71 taus: the maximum is ${worst.toFixed(4)} ` +
        `against ${TE.cap}. THE SUM OF THE COEFFICIENTS IS ${naive.toFixed(2)} AND WOULD EXCEED THE CAP, so ` +
        `the inertness is not arithmetic on the table -- it is a fact about mh_state: THINKING is state ` +
        `${THINKING} and st.drive is non-zero only in RESPONDING, so two of energy's three terms are ` +
        `mutually exclusive and the most it can hold is pace plus the larger of the other two. THAT MATTERS ` +
        `BECAUSE THE DRIFT AND BOTH SLOT DIVISORS SPEND THE INTEGRAL OF energy, and the integral of a ` +
        `clamped sum is not the sum of the integrals. The old spelling's margin was 1.88x on 0.85*voice ` +
        `alone; that argument does not survive the repair and this one was re-derived rather than inherited.`);

    // *** THE WINDOW'S BOUNDS ARE THE CLAIM, AND A SABOTAGE WALKED BEFORE THIS ROW EXISTED. *** Widening
    // (stateIndex > 1.5 && stateIndex < 2.5) to < 3.5 catches RESPONDING as well -- the storm would then
    // rise while the assistant ANSWERS, which is a different species -- and every row in this gate stayed
    // green, because every one of them asks whether the term moves rather than WHEN. The predicate is
    // evaluated at all five state indices here, which is the question the bounds are an answer to.
    const raw0 = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    const bounds = /uniforms\.stateIndex\.greaterThan\(([\d.]+)\)\.and\(uniforms\.stateIndex\.lessThan\(([\d.]+)\)\)/.exec(raw0);
    const hits = bounds ? [0, 1, 2, 3, 4].filter((i) => i > Number(bounds[1]) && i < Number(bounds[2])) : [];
    say(`the think window is (${bounds ? bounds[1] : "?"}, ${bounds ? bounds[2] : "?"}) and selects state ${hits.join(", ") || "none"} of 0..4`);
    ok("!! *** THE THINK WINDOW SELECTS THINKING AND NOTHING ELSE -- evaluated at all five state indices ***",
        !!bounds && hits.length === 1 && hits[0] === THINKING,
        `(stateIndex > ${bounds ? bounds[1] : "?"} && stateIndex < ${bounds ? bounds[2] : "?"}) is true for ` +
        `state ${hits.join(", ")} and false for the other four, which is murmur's own spelling and is what ` +
        `makes `+"`think`"+` a THINKING indicator rather than a "not idle" one. WIDENING IT TO 3.5 WALKED ` +
        `THROUGH THIS WHOLE GATE before this row existed: the storm would have risen while the assistant ` +
        `ANSWERS as well as while it thinks, and every other row here asks whether the term MOVES rather ` +
        `than when -- so all of them stayed green on a species doing the wrong thing in the wrong state.`);

    // *** AND THE HOST'S ACCUMULATOR, WHICH NO GATE COVERED UNTIL A SABOTAGE WALKED THROUGH IT. ***
    // Every shader row here is about what the shader does with thinkInt; none of them can tell whether the
    // host puts anything in it. Zeroing the accumulation left this gate entirely green, because its frames
    // set the uniform directly -- which is right for grading a shader and blind to the integrator.
    const host = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbState.mjs"), "utf8");
    const accum = /thinkInt \+= \(si === MH_THINKING_INDEX \? 1 : 0\) \* dPhase;/.test(host);
    const shipped = /paceInt, voiceInt, driveInt, thinkInt,/.test(host);
    say(`the host accumulates thinkInt: ${accum}; and sends it with the other integrals: ${shipped}`);
    ok("!! *** THE HOST ACCUMULATES IT AGAINST dPhase AND SHIPS IT, which no row here could otherwise see ***",
        accum && shipped && /let thinkInt = 0;/.test(host),
        `the integrator adds (state === ${THINKING} ? 1 : 0) * dPhase each tick and returns thinkInt beside ` +
        `the other three. AGAINST dPhase AND NOT AGAINST WALL TIME, which is the rule v4654 set for every ` +
        `one of these: the shader's clock is the tempo integral, so an integral accumulated in seconds ` +
        `would be a different quantity wherever the tempo is not 1. A SABOTAGE THAT ZEROED THE ` +
        `ACCUMULATION LEFT THIS GATE GREEN -- its frames set the uniform directly, which is correct for ` +
        `grading a shader and completely blind to the integrator that feeds it.`);

    ok("!! ...and the slot table's weights are the divisor's 1.30 times energy's own three, named not folded",
        Math.abs(K.MH_SLOT_SIGNAL.tempest.pace - K.MH_SLOT_SIGNAL.tempest.k * TE.pace) < 1e-12 &&
        Math.abs(K.MH_SLOT_SIGNAL.tempest.think - K.MH_SLOT_SIGNAL.tempest.k * TE.think) < 1e-12 &&
        Math.abs(K.MH_SLOT_SIGNAL.tempest.drive - K.MH_SLOT_SIGNAL.tempest.k * TE.drive) < 1e-12 &&
        K.MH_SLOT_SIGNAL.tempest.voice === 0,
        `the bolt slot is SLOT / (1 + ${K.MH_SLOT_SIGNAL.tempest.k} * energy), so the slot COUNT integrates ` +
        `against ${K.MH_SLOT_SIGNAL.tempest.k} times each of energy's terms: pace ` +
        `${K.MH_SLOT_SIGNAL.tempest.pace.toFixed(4)}, think ${K.MH_SLOT_SIGNAL.tempest.think.toFixed(4)}, ` +
        `drive ${K.MH_SLOT_SIGNAL.tempest.drive.toFixed(4)}, VOICE ZERO. v4656 folded the whole weight onto ` +
        `voice as 1.30 * 0.85 because this port's energy WAS voice; the row asserts the derivation now ` +
        `rather than the product, so the table and the shader's instantaneous divisor cannot drift apart. ` +
        `THE FIELD IS CALLED think AND NOT voice even though mhRatePhase's middle pair carries it: a slot ` +
        `named for the wrong signal is how a census reads the wrong number and reports it with confidence.`);
}

// =============================================================================================================
sec("2. *** droplet's TREMOR: THE THIRD MECHANISM THIS KIT CARRIED WITH NOTHING SETTING IT ***");
{
    const raw = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    const src = codeOnly(raw);
    // every mhBody call's tremor argument -- the fifth -- and how many are a bare zero
    const bodyCalls = (src.match(/KIT\.mhBody\(/g) || []).length;
    const zeroTremor = /KIT\.mhBody\(uvM, uniforms\.time, float\(0\.004\), shapeAmp, float\(0\.0\)/.test(src);
    const wired = /KIT\.mhBody\(uvM, uniforms\.time, float\(0\.004\), shapeAmp, dropletTrem/.test(src);
    say(`mhBody call sites: ${bodyCalls}; the tremor argument is a bare zero: ${zeroTremor}; it is droplet's cadence: ${wired}`);
    ok("!! *** THE TREMOR ARGUMENT IS NO LONGER A CONSTANT ZERO, after being one for the whole port ***",
        wired && !zeroTremor && K.MH_DROPLET_TREM === 0.012,
        `droplet.ts: mh_shape(wob, ${K.MH_DROPLET_TREM} * live.pace * tremGate, 3.30). Both halves of this ` +
        `port's kit have taken mh_shape's tremor since the port began and every call site passed 0.0 -- the ` +
        `THIRD mechanism transcribed, graded and unreachable, after mhDeform's flow (v4653) and mh_live's ` +
        `conditioning (v4641). A SOURCE ROW IS THE RIGHT ALTITUDE FOR THAT and a pixel row is not: a ` +
        `mechanism nothing invokes moves no pixel by construction, so every frame row ever written about ` +
        `droplet was green while this was dead.`);

    ok("!! ...and it is an AMPLITUDE, so it reads the instantaneous cadence and has nothing to integrate",
        /PACE\.mul\(MH_DROPLET_TREM \* KIT_AA\(6\.9\) \* \(1 - mhSmall\(120, 120\)\)\)/.test(raw),
        `the tremor scales a displacement, not a phase, so live.pace multiplies it directly and no integral ` +
        `is involved -- which is worth a row in a file that follows four rounds of integrating everything ` +
        `in sight. THE GATE IS FOLDED AT BUILD TIME with KIT_AA beside it: tremGate is ` +
        `mh_aa(2*pi*6.9 / MH_R, size, pixelScale) * (1 - small), and both factors are functions of a frame ` +
        `size this file compiles for rather than varies. A 6.9-cycle ripple is under a pixel on a badge, so ` +
        `murmur eases it to nothing rather than letting it alias.`);
}

// =============================================================================================================
sec("3. *** THE TWO CLOUDS SHARE A BUILDER AND DO NOT SHARE A SIGNAL ***");
{
    const N = K.MH_MIST.nebula, T = K.MH_MIST.tempest;
    say(`fold: nebula (1 + ${N.foldPace}*pace) small-mix ${N.foldSmall}; tempest (1 + ${T.foldEnergy}*energy) small-mix ${T.foldSmall}`);
    say(`drift: nebula (1 + ${N.drPace}*pace + ${N.drVoice}*voice + ${N.drDrive}*drive); tempest (1 + ${T.drEnergy}*energy)`);
    ok("!! *** EACH COEFFICIENT IS NON-ZERO FOR EXACTLY ONE OF THE TWO, so a shared field cannot mean two things ***",
        N.foldPace > 0 && T.foldPace === 0 && T.foldEnergy > 0 && N.foldEnergy === 0 &&
        N.drPace > 0 && N.drVoice > 0 && N.drDrive > 0 && N.drEnergy === 0 &&
        T.drEnergy > 0 && T.drPace === 0 && T.drVoice === 0 && T.drDrive === 0 &&
        N.foldSmall !== T.foldSmall,
        `nebula's fold and drift read the three conditioned signals directly; tempest's read its own ENERGY, ` +
        `which is a signal built out of them. The port had the VOICE term alone for nebula -- so its ` +
        `weather ignored the cadence and the lean entirely -- and an energy term built on voice for ` +
        `tempest. THE SMALL MIX DIFFERS TOO, ${N.foldSmall} against ${T.foldSmall}, and this port carried ` +
        `one literal for both. A SHARED COEFFICIENT WITH TWO MEANINGS IS HOW THE WRONG SIGNAL GOT IN: the ` +
        `two species share one builder and one table, and the fields that are genuinely per-species have to ` +
        `be per-species in the table or the builder has to guess.`);

    const raw = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    ok("!! ...and the drift's MIDDLE integral pair carries voice for one species and the THINK integral for the other",
        /float\(MIST\.drEnergy \* MH_TEMPEST_ENERGY\.think\), uniforms\.thinkInt/.test(raw) &&
        /float\(MIST\.drVoice\), uniforms\.voiceInt/.test(raw),
        `mhRatePhase's parameters were renamed off pace/voice/drive to A/B/C at v4657 for exactly this: a ` +
        `caller may spend a slot on whatever signal its species reads, and duet already spends the middle ` +
        `one on its own gesture envelope. nebula spends it on VOICE and tempest on the THINK integral, in ` +
        `two branches of one build-time conditional. Widening mhRatePhase to four pairs instead would make ` +
        `every other caller pass a zero, and a coefficient of zero grades nothing -- this tree has found ` +
        `that exact shape in five rounds now.`);

    // *** AND THE TWO NOISE LOOKUPS TAKE DIFFERENT SHARES OF THE ADVECTION, WHICH v4662 GOT WRONG. ***
    ok("!! ...and the WARP lookup takes half the advection while the DENSITY takes all of it",
        K.MH_ADVECT_WARP === 0.5 &&
        /pM\.add\(adv\.mul\(MH_ADVECT_WARP\)\)\.mul\(mWarp\)/.test(raw) &&
        /const q = pM\.add\(adv\)\.mul\(mScale\)/.test(raw),
        `nebula.ts and tempest.ts both spell the two reads differently -- mh_noise3(p * warpScale + ... - ` +
        `adv * ${K.MH_ADVECT_WARP}) for the warp and p * scale + ... - adv for the density -- and v4662 ` +
        `wired both at full. The warp is the noise that DISPLACES the coordinates the density is read at, ` +
        `so carrying the two at one speed streams the fold without deforming it. *** THIS IS A SOURCE ROW ` +
        `AND THE ALTITUDE IS THE POINT: *** the difference between the two spellings is whether the cloud's ` +
        `pattern deforms as it streams or merely translates, and telling those apart in a 48 px frame needs ` +
        `a rigid-shift search this gate cannot afford. The claim a census CAN make is that the two lookups ` +
        `read different displacements, which is exactly what the sabotage that walked through v4662's whole ` +
        `battery changed.`);
}

// =============================================================================================================
sec("4. *** fathom's SPEED FACTOR, AND THE TWO SHELLS IT IS NOT SAFE TO PUT IT ON YET ***");
{
    const FS = K.MH_FATHOM_SP, GS = K.MH_GEODE_SP;
    const raw = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    const a0Wired = /KIT\.mhRatePhase\(float\(sh\.rate\), uniforms\.time,\s*\n\s*float\(MH_FATHOM_SP\.pace\), uniforms\.paceInt/.test(raw);
    // the expansion the other two need, evaluated: (1 + p*kp + d*kd) * (1 + k*d) has a d-squared term
    const dSq = FS.drive * 0.7;
    say(`fathom sp = 1 + ${FS.pace}*pace + ${FS.drive}*drive; geode sp = 1 + ${GS.pace}*pace + ${GS.drive}*drive`);
    say(`the mix-shaped shells need integrals of pace*drive (the host sends it) and of drive SQUARED (it does not)`);
    ok("!! *** ONLY THE SHELL WHOSE RATE IS A CLEAN SUM IS WIRED, and the other two are arithmetic rather than appetite ***",
        a0Wired && FS.pace > 0 && FS.drive > 0 && GS.pace > 0 && GS.drive > 0 && dSq > 0,
        `fathom's a0 is mh_drift(t, 0.085 * sp, ...) -- sp is a SUM, which mhRatePhase integrates exactly, ` +
        `so it is wired. a1 and a2 are mix(mh_drift(t, k*sp, ...), a0, st.drive * 0.7) and geode's spin is ` +
        `the same shape, so with sp moving their secular term expands to sp*(1 + k*drive), whose last two ` +
        `terms are integrals of pace*drive -- which the host has sent since v4657 -- and of drive SQUARED, ` +
        `which it has never sent. FOLDING sp IN WITHOUT THEM WOULD BE murmur's NUMBER AT DRIVE 0 AND DRIVE ` +
        `1 AND NOBODY'S IN BETWEEN, and in between is every frame of the ramp RESPONDING is made of. The ` +
        `expansion is recorded in MH_FATHOM_SP's note and in tools/ship/nextRounds.mjs so the round that ` +
        `adds the accumulator does not have to re-derive it.`);

    ok("!! ...and the two MIX shells still pass the bare rate, which is the half of that claim a table cannot make",
        /: KIT\.mhDrift\(uniforms\.time, float\(sh\.rate\), float\(sh\.wob\), float\(sh\.lane\)\)\.toVar\(\)\)/.test(raw),
        `fathom's a1 and a2 are still mh_drift(t, sh.rate, ...) with no sp on them at all. THE ROW ABOVE ` +
        `SAYS WHY THEY ARE LEFT AND THIS ONE SAYS THEY ARE STILL LEFT, which is not the same claim: ` +
        `multiplying their rate by spF is one character, it moves pixels, it makes fathom respond to the ` +
        `cadence MORE, and it is wrong at every partial drive. A sabotage that did exactly that walked ` +
        `through this gate before this row existed -- every other row asks whether fathom answers the ` +
        `cadence, and a wrong answer is still an answer.`);
}

// =============================================================================================================
sec("5. *** AND IT REACHES PIXELS: five readings, every one of them 0.0% before this round ***");
{
    const FR = []; const ix = {}; const P = (k, f) => { ix[k] = FR.push(f) - 1; };
    for (const s of ["nebula", "tempest", "fathom"]) {
        P(s + "Lo", sp(s, 11.0, undefined, { paceInt: 0 }));
        P(s + "Hi", sp(s, 11.0, undefined, { paceInt: 14 }));
    }
    // droplet's is an AMPLITUDE, so it is the raw knob that moves and not the history
    P("dropLo", sp("droplet", 11.0, undefined, { activity: 0, stateIndex: RESPONDING, stateTau: 0.55 }));
    P("dropHi", sp("droplet", 11.0, undefined, { activity: 1, stateIndex: RESPONDING, stateTau: 0.55 }));
    // ...and tempest's home state, which is the round's headline
    P("tmpIdle", sp("tempest", 11.0, undefined, { stateIndex: 0, stateTau: 0, thinkInt: 0 }));
    P("tmpThink", sp("tempest", 11.0, undefined, { stateIndex: THINKING, stateTau: 0.5, thinkInt: 14 }));
    const run = await renderSpecies(FR);
    if (!run.ok || !run.frames || run.frames.length !== FR.length) {
        ok("!! the cadence renders at all", false,
            `could not render: ${run.reason || (run.skipped ? "skipped: " + run.skipped : "frame count")}.`);
    } else {
        say(`backend: ${run.isWebGPUBackend ? "REAL WebGPU" : "WebGL2 fallback"}; ${FR.length} frames over 4 species`);
        const diff = (a, b) => { let n = 0, mx = 0;
            for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) n++; if (d > mx) mx = d; }
            return { pct: 100 * n / a.length, mx }; };
        const R = {};
        for (const s of ["nebula", "tempest", "fathom"]) R[s] = diff(run.frames[ix[s + "Lo"]], run.frames[ix[s + "Hi"]]);
        R.droplet = diff(run.frames[ix.dropLo], run.frames[ix.dropHi]);
        const think = diff(run.frames[ix.tmpIdle], run.frames[ix.tmpThink]);
        for (const s of ["nebula", "tempest", "fathom"])
            say(`${s.padEnd(8)} paceInt 0 -> 14: ${R[s].pct.toFixed(1)}% of bytes move, worst ${R[s].mx}   (at v4662: 0.0%, worst 0)`);
        say(`droplet  activity 0 -> 1 in RESPONDING: ${R.droplet.pct.toFixed(1)}%, worst ${R.droplet.mx}   (at v4662: 0.0%, worst 0)`);
        say(`tempest  IDLE -> THINKING: ${think.pct.toFixed(1)}%, worst ${think.mx}   (at v4662: 0.0%, worst 0)`);
        ok("!! *** tempest MOVED 0 OF 9,216 BYTES ACROSS ITS OWN HOME STATE, and now moves a fifth of them ***",
            think.pct > 10 && think.mx > 100,
            `between IDLE and THINKING, holding the frame's time and every knob, tempest now moves ` +
            `${think.pct.toFixed(1)}% of its bytes with a worst channel of ${think.mx} of 255. AT v4662 IT ` +
            `MOVED ZERO -- measured on a worktree of that commit, on these identical frames. tempest.ts ` +
            `calls THINKING "this species' home state" and "a storm that rises while the assistant thinks ` +
            `is the whole concept", and this port had that concept reading the microphone instead. The ` +
            `frames hold stateTau apart as well as stateIndex, because `+"`think`"+` is a step and its ` +
            `INTEGRAL is what the drift and the slots read -- a pair that moved only the index would leave ` +
            `the secular half of the repair unmeasured.`);
        ok("!! ...and all four builders answer the cadence, none of which did before this round",
            R.nebula.pct > 5 && R.tempest.pct > 5 && R.fathom.pct > 5 && R.droplet.pct > 2 &&
            R.nebula.mx > 50 && R.fathom.mx > 50,
            `nebula ${R.nebula.pct.toFixed(1)}%, tempest ${R.tempest.pct.toFixed(1)}%, fathom ` +
            `${R.fathom.pct.toFixed(1)}%, droplet ${R.droplet.pct.toFixed(1)}%. THE FIRST THREE SWEEP THE ` +
            `INTEGRAL AND droplet SWEEPS THE KNOB, which is not an inconsistency: droplet's cadence is an ` +
            `amplitude on a surface ripple and the other three carry a clock, so the thing that has to move ` +
            `is different in kind. A row that swept paceInt at droplet would read 0.0% and be right to.`);
    }
}

// =============================================================================================================
sec("6. *** THE CENSUS: how many of the eighteen this port reaches, and which are left ***");
{
    const rawAll = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    const src = codeOnly(rawAll);
    const lines = src.split("\n"), marks = [];
    lines.forEach((l, i) => { const m = /^\s*const build([A-Z]\w*) = \(\) => \{/.exec(l); if (m) marks.push([i, m[1].toLowerCase()]); });
    marks.push([lines.length, "(end)"]);
    // *** A BUILDER READS THE CADENCE IF IT READS THE SIGNAL **OR** ITS INTEGRAL -- AND THE INTEGRAL ONLY
    // COUNTS IF ITS COEFFICIENT IS NON-ZERO. *** The census in murmurLive counts PACE alone, and v4662 moved
    // opal's cadence onto paceInt, so that census called opal cadence-less on the round AFTER opal got one.
    // A secular site cannot read the instantaneous signal and be correct, so looking only for the signal
    // reports the repair as the absence.
    //
    // *** AND THE FIRST CUT OF THE WIDER VERSION WAS WRONG THE OTHER WAY, WHICH IS WORSE. *** It matched
    // `uniforms.paceInt` anywhere in a builder and reported GEODE as carrying the cadence -- geode reads
    // paceInt because v4662's mhRatePhase call passes it with a coefficient of float(0.0), which is the
    // argument slot and not a signal. A COEFFICIENT OF ZERO GRADES NOTHING and this tree has found that
    // shape in five rounds; a census that cannot see the coefficient finds it a sixth time and calls it a
    // feature. So the coefficient immediately before the integral is read, and a zero one does not count.
    const pacedInt = (blk) => {
        let found = false;
        for (let i = 0; (i = blk.indexOf("uniforms.paceInt", i)) !== -1; i += 16) {
            const before = blk.slice(Math.max(0, i - 80), i);
            const m = /float\(([^()]*(?:\([^()]*\))?[^()]*)\)\s*,\s*$/.exec(before);
            if (!m) continue;
            const coeff = m[1].trim();
            if (coeff !== "0.0" && coeff !== "0") found = true;
        }
        return found;
    };
    const paced = [], viaInt = [], zeroCoeff = [];
    for (let k = 0; k < marks.length - 1; k++) {
        const blk = lines.slice(marks[k][0], marks[k + 1][0]).join("\n");
        const raw = /\bPACE\b/.test(blk), integ = pacedInt(blk);
        const bareInt = /uniforms\.paceInt/.test(blk);
        if (raw || integ) paced.push(marks[k][1]);
        if (integ && !raw) viaInt.push(marks[k][1]);
        if (bareInt && !integ && !raw) zeroCoeff.push(marks[k][1]);
    }
    // *** droplet's IS ABOVE EVERY CLOSURE AND IS LOOKED FOR IN THE RAW FILE. *** sourceScan's codeOnly
    // blanks STRING LITERALS as well as comments, so `species === "droplet"` comes back as `species === ""`.
    // The first cut of this row matched the blanked form and reported droplet without a cadence while the
    // shader was setting its tremor correctly -- the same trap tools/ship/murmurDrive-selfcheck.mjs records
    // falling into, in the same way, on the same species name.
    const shared = /const dropletTrem = species === "droplet"/.test(rawAll);
    const all = marks.slice(0, -1).map((m) => m[1]);
    const reached = paced.concat(shared && !paced.includes("droplet") ? ["droplet"] : []).sort();
    const without = all.filter((n) => !reached.includes(n));
    say(`builders reading the cadence, instantaneously or through a WEIGHTED integral: ${reached.join(", ")}`);
    say(`reached ONLY through the integral: ${viaInt.join(", ") || "none"}; reading paceInt with a ZERO coefficient: ${zeroCoeff.join(", ") || "none"}`);
    say(`builders still without one: ${without.join(", ") || "none"}`);
    ok("!! *** SIXTEEN OF THE SEVENTEEN BUILDERS CARRY murmur's CADENCE NOW, AND THE ONE LEFT IS NAMED ***",
        reached.length === all.length - 1 && without.length === 1 && without[0] === "geode" &&
        zeroCoeff.includes("geode") && viaInt.includes("opal"),
        `${reached.length} of ${all.length} builders, covering ${reached.length + 1} of murmur's eighteen ` +
        `species because nebula and tempest share one. THE ONE LEFT IS geode and it is left for the reason ` +
        `section 4 gives: its spin is a MIX and folding its sp in without the drive-squared integral would ` +
        `be wrong at every partial drive. *** AND THE CENSUS COUNTS THE INTEGRAL AS WELL AS THE SIGNAL, ` +
        `WHICH IT DID NOT BEFORE: *** ${viaInt.join(", ") || "no builder"} reaches it only through paceInt, ` +
        `and murmurLive's version -- which matched PACE alone -- reported opal cadence-less on the round ` +
        `after v4662 gave opal its cadence. A secular site MUST read the integral rather than the signal, ` +
        `so a census looking only for the signal reports the repair as the absence. *** AND THE WIDER ` +
        `VERSION WAS WRONG THE OTHER WAY UNTIL THE COEFFICIENT WAS READ: *** ${zeroCoeff.join(", ")} reads ` +
        `paceInt with a coefficient of float(0.0) -- an argument slot, not a signal -- and the first cut of ` +
        `this row counted it as a cadence and reported seventeen of seventeen. A coefficient of zero grades ` +
        `nothing, and a census that cannot see the coefficient turns that into a green row.`);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: murmur gives a cadence to all eighteen species and this port reached twelve. " +
    "v4663 takes four of the five builders that had none -- droplet's tremor amplitude, nebula's fold and " +
    "drift, tempest's energy, fathom's first shell -- and the largest finding is not a missing term but a " +
    "WRONG SIGNAL: tempest's energy read voice where murmur reads pace, a THINKING indicator and drive, so " +
    "the storm rose when somebody spoke and stood still while the assistant thought. " +
    "\nWHAT IS NOT CLAIMED: fathom's second and third shells, and geode's spin. All three are mixes by " +
    "st.drive * 0.7, so a moving sp puts an integral of drive SQUARED in the secular term and the host has " +
    "never sent one. The expansion is recorded rather than approximated -- an sp folded in without its " +
    "cross terms is murmur's number at both ends of the ramp and nobody's in between. " +
    "\nAND NOT CLAIMED: that `think` belongs in mh_state. tempest.ts reads the state index directly and " +
    "says why -- mh_state \"only designs success and responding\" -- so the port reads it directly too, and " +
    "the host accumulates its integral like any other signal.");
process.exit(fails ? 1 : 0);
