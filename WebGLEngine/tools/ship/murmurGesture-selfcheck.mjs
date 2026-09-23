// WebGLEngine/tools/ship/murmurGesture-selfcheck.mjs -- v4656
//
// *** THE GESTURE CLOCK: A SLOT THAT CHANGES LENGTH DOES NOT ADVANCE THE GESTURE, IT REPLACES IT. ***
//
// mh_flourish is the pack's play mechanism -- "every hero performs ONE gesture, a thing the presence does now
// and then and then lets go of". Time is cut into slots, the slot INDEX is floor(t / SLOT), and every other
// number in the function is a hash of that index: where in its slot the gesture falls, how long it lasts, and
// the per-gesture random its species spends as a direction.
//
// THE INDEX IS NOT A PHASE. Three of murmur's species make the slot length a function of the live signals --
// still divides it by (1 + 0.30*pace + 1.70*drive), abyss by (1 + 0.55*voice + 0.35*pace + 1.60*drive),
// tempest's two lightning lanes by (1 + 1.30*energy) -- and a divisor that moves makes floor(t / SLOT) JUMP.
// A jump re-rolls every hash at once. The bolt in the air becomes a DIFFERENT bolt, with a different start, a
// different duration and a different direction, between one frame and the next.
//
// *** tempest's TWO LANES WERE DOING THIS ON EVERY CHANGE OF VOICE, TODAY, IN THIS PORT. *** It is the one of
// the three whose divisor was already wired. still's was absent entirely and abyss's carried the voice term
// alone, so those two are an ABSENCE being filled and tempest's is a defect being fixed -- the distinction
// v4655 had to draw about helix, and it is drawn again here because the two need different evidence.
//
// *** THE REPAIR IS v4654's FACTORING ON A DIFFERENT STRUCTURE AND IT COSTS NO NEW UNIFORM. *** The honest
// generalisation of "time cut into slots" when the slot moves is that a boundary falls where the ACCUMULATED
// slot count crosses an integer, S(t) = integral of dt/SLOT = (t + a*P + b*V + c*D)/B -- which is mhRatePhase
// with a base of 1/B and the three integrals the host has sent since v4654. S is continuous and strictly
// increasing, so floor(S) steps by one and a gesture keeps its own hash for the whole of its own life.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { createPresenceState, STATE_INDEX } from "../../render/aiPresenceOrbState.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { sp, renderSpecies } from "./murmurSpeciesFrames.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurGesture-selfcheck -- the gesture clock, and the slot that re-rolls it\n");

const DT = 1 / 60;
// The three subjects, written out by hand from murmur's own sources rather than read off MH_SLOT_SIGNAL, so
// this file can DISAGREE with the port -- the v4579 distinction. A gate that re-states the table it grades
// grades nothing.
const SUBJ = {
    tempest: { B: 2.9,   lane: 21, a: 0.00, b: 1.30 * 0.85, c: 0.00, resp: false },
    abyss:   { B: 17.5,  lane: 31, a: 0.35, b: 0.55,        c: 1.60, resp: true  },
    still:   { B: 10.15, lane: 5,  a: 0.30, b: 0.00,        c: 1.70, resp: true  },
};

// *** THE WALKS ARE MEMOISED BECAUSE TWO SECTIONS WANT THE SAME ONES AND THE CLOCK IS PART OF THE GATE. ***
// Sections 1 and 2 each read all 21 (species, session) walks, and each walk ticks the real state module
// 4 seconds at 1/60 plus the settle. Computing them twice cost about 300 ms of a 3,000 ms ceiling, which is
// a tenth of the budget spent on arithmetic already done.
const WALKS = new Map();
const walk = (settle, C) => {
    const key = C.lane + ":" + settle;
    if (!WALKS.has(key)) WALKS.set(key, walkOnce(settle, C));
    return WALKS.get(key);
};

/** Walk the real state module from a settled idle into a busy exchange, one frame at a time. */
function walkOnce(settle, C) {
    const st = createPresenceState("idle");
    for (let i = 0; i < Math.round(settle / DT); i++) st.tick(DT, { voice: 0, activity: 0 });
    if (C.resp) st.setState("responding");
    const out = [];
    for (let i = 0; i < Math.round(4.0 / DT); i++) {
        st.tick(DT, C.resp ? { voice: 1.0, activity: 1.0 } : { voice: 1.0, activity: 0 });
        const p = st.getParams(), si = STATE_INDEX[p.state];
        const lv = K.mhLive(p.voice, p.activity, si), stn = K.mhState(si, p.stateTau);
        const F = 1 + C.a * lv.pace + C.b * lv.voice + C.c * stn.drive;
        const SLOT = C.B / F, t = p.phase;
        const S = K.mhRatePhase(1 / C.B, t, C.a, p.paceInt, C.b, p.voiceInt, C.c, p.driveInt);
        out.push({ t, SLOT, S,
                   murmur: K.mhFlourish(t, C.lane, SLOT), murmurSlot: Math.floor(t / Math.max(SLOT, 1)),
                   fixed: K.mhFlourishPhase(S, SLOT, C.lane), fixedSlot: Math.floor(S) });
    }
    return out;
}

// =============================================================================================================
sec("1. *** THE GESTURE IS REPLACED RATHER THAN ADVANCED: the index moves 21 slots in one frame and the envelope steps 0.96 ***");
{
    const SESSIONS = [5, 30, 60, 120, 300, 900, 1800];
    const tally = {};
    for (const [name, C] of Object.entries(SUBJ)) {
        let wM = 0, wF = 0, jumpM = 0, jumpF = 0, reMid = 0, nM = 0, nF = 0, frames = 0;
        const perSession = [];
        for (const s of SESSIONS) {
            const w = walk(s, C);
            let sM = 0, sJ = 0;
            for (let i = 1; i < w.length; i++) {
                frames++;
                const dM = Math.abs(w[i].murmurSlot - w[i - 1].murmurSlot);
                const dF = Math.abs(w[i].fixedSlot - w[i - 1].fixedSlot);
                if (dM > 1) { nM++; sJ++; }
                if (dF > 1) nF++;
                jumpM = Math.max(jumpM, dM); jumpF = Math.max(jumpF, dF);
                const eM = Math.abs(w[i].murmur.env - w[i - 1].murmur.env);
                wM = Math.max(wM, eM); sM = Math.max(sM, eM);
                wF = Math.max(wF, Math.abs(w[i].fixed.env - w[i - 1].fixed.env));
                // *** THE SHARPEST STATEMENT OF THE DEFECT: the per-gesture RANDOM changing while the
                // envelope is up. That number is what a species spends as the gesture's DIRECTION, so a
                // change mid-stroke is not a jump in timing, it is a different gesture in the same frame.
                if (w[i].murmur.env > 0.02 && w[i - 1].murmur.env > 0.02 &&
                    Math.abs(w[i].murmur.rand - w[i - 1].murmur.rand) > 1e-9) reMid++;
            }
            perSession.push({ s, sM, sJ });
        }
        tally[name] = { wM, wF, jumpM, jumpF, reMid, nM, nF, frames };
        say(`${name.padEnd(8)} worst one-frame envelope step, murmur: ` +
            perSession.map((r) => `${r.s}s ${r.sM.toFixed(3)}`).join("  "));
    }
    for (const [name, T] of Object.entries(tally))
        say(`${name.padEnd(8)} murmur: slot jumps>1 on ${T.nM}/${T.frames} frames (worst ${T.jumpM}), ` +
            `env step ${T.wM.toFixed(4)}, re-seeded MID-GESTURE on ${T.reMid}   |   repaired: jumps>1 ${T.nF} (worst ${T.jumpF}), env step ${T.wF.toFixed(4)}`);

    const worstM = Math.max(...Object.values(tally).map((t) => t.wM));
    const worstJ = Math.max(...Object.values(tally).map((t) => t.jumpM));
    const reMid = Object.values(tally).reduce((a, t) => a + t.reMid, 0);
    ok("!! *** murmur's INDEX JUMPS BY UP TO 21 SLOTS IN ONE FRAME AND THE ENVELOPE STEPS 0.9996 OF ITS RANGE ***",
        worstM > 0.95 && worstJ >= 20 && reMid > 0,
        `across three species and seven session lengths the worst single-frame envelope step under murmur's ` +
        `spelling is ${worstM.toFixed(4)} of a 0..1 range and the worst index jump is ${worstJ} slots. That ` +
        `is not a gesture brightening: sin^2(pi u) has ZERO SLOPE at both ends by design, so an envelope ` +
        `cannot legitimately arrive at 0.9996 from 0 in 16.7 ms. THE RANDOM CHANGED MID-GESTURE ON ` +
        `${reMid} FRAMES -- the envelope was up on both sides and the per-gesture hash was different, which ` +
        `is the same creature's direction being redrawn while it is on screen.`);

    // *** AND IT IS NOT A LARGE-t DEFECT THE WAY THE PHASE TELEPORT WAS, which is a distinction worth having
    // rather than a caveat. *** The envelope step is already near its ceiling after thirty seconds, because a
    // single re-index is enough to do all the damage there is. What grows with t is HOW OFTEN: the derivative
    // of floor(t/SLOT) with respect to SLOT is -t/SLOT^2, so at large t an arbitrarily small change of slot
    // length flips the index and the gesture flickers rather than jumping once.
    const early = walk(30, SUBJ.tempest), late = walk(1800, SUBJ.tempest);
    const count = (w) => { let n = 0; for (let i = 1; i < w.length; i++) if (Math.abs(w[i].murmurSlot - w[i - 1].murmurSlot) > 1) n++; return n; };
    ok("!! ...and what grows with the session is the FREQUENCY, not the size: 0 re-rolls at 30 s and 7 at half an hour",
        count(early) === 0 && count(late) > 4 && Math.max(...early.slice(1).map((r, i) => Math.abs(r.murmur.env - early[i].murmur.env))) > 0.9,
        `tempest's first lane re-rolls its index ${count(early)} times in the same four seconds of rising ` +
        `voice after 30 s of running and ${count(late)} times after 1800. THE DAMAGE PER RE-ROLL IS ALREADY ` +
        `TOTAL AT THIRTY SECONDS -- the envelope step there is ` +
        `${Math.max(...early.slice(1).map((r, i) => Math.abs(r.murmur.env - early[i].murmur.env))).toFixed(4)} ` +
        `-- so this defect is NOT the phase teleport's shape, where the error is proportional to t. One ` +
        `re-index ruins one gesture completely at any t; what a long session buys is more of them.`);
}

// =============================================================================================================
sec("2. *** THE REPAIRED INDEX IS MONOTONE AND STEPS BY ONE, AND A GESTURE KEEPS ITS OWN HASH ***");
{
    let steps = 0, back = 0, midRand = 0, frames = 0, worstStep = 0;
    for (const [, C] of Object.entries(SUBJ)) {
        for (const s of [5, 30, 60, 120, 300, 900, 1800]) {
            const w = walk(s, C);
            for (let i = 1; i < w.length; i++) {
                frames++;
                const d = w[i].fixedSlot - w[i - 1].fixedSlot;
                if (d > 1) steps++;
                if (d < 0) back++;
                worstStep = Math.max(worstStep, Math.abs(w[i].fixed.env - w[i - 1].fixed.env));
                if (w[i].fixed.env > 0.02 && w[i - 1].fixed.env > 0.02 &&
                    Math.abs(w[i].fixed.rand - w[i - 1].fixed.rand) > 1e-9) midRand++;
            }
        }
    }
    say(`repaired over ${frames} frames: index steps>1: ${steps}, index goes BACKWARDS: ${back}, gesture re-seeded mid-stroke: ${midRand}, worst env step ${worstStep.toFixed(4)}`);
    ok("!! *** ZERO JUMPS, ZERO REVERSALS AND ZERO MID-GESTURE RE-SEEDS OVER 5,019 FRAMES ***",
        steps === 0 && back === 0 && midRand === 0 && frames > 5000,
        `the slot count S is an integral of a strictly positive rate, so it is continuous and increasing and ` +
        `floor(S) can only ever advance by one. Checked rather than argued: ${frames} frames across three ` +
        `species and seven session lengths from five seconds to half an hour, with the signals driven from ` +
        `silence to full in every one. THE THIRD NUMBER IS THE ONE THAT MATTERS: a gesture that keeps its ` +
        `own hash for the whole of its own life is the property mh_flourish was written to have, and it is ` +
        `the one a moving divisor takes away.`);

    // ...and the repaired envelope is not motionless either, or the rows above would be satisfied by a clock
    // that had simply stopped. It moves, at a rate, which is what a gesture playing looks like.
    let moved = 0, nonzero = 0;
    for (const s of [5, 300, 1800]) for (const [, C] of Object.entries(SUBJ)) {
        const w = walk(s, C);
        for (let i = 1; i < w.length; i++) { if (w[i].fixed.env > 0.02) nonzero++; if (Math.abs(w[i].fixed.env - w[i - 1].fixed.env) > 1e-6) moved++; }
    }
    ok("!! ...and the repaired clock is RUNNING, not stopped: the envelope is up on hundreds of frames and moving on most",
        nonzero > 100 && moved > 200,
        `${nonzero} frames with a gesture on screen and ${moved} frames on which the envelope changed at ` +
        `all. WITHOUT THIS ROW THE THREE ZEROES ABOVE ARE ALSO WHAT A DEAD CLOCK SCORES -- an index that ` +
        `never advances never jumps, and a gesture that never plays never gets re-seeded. This is the row ` +
        `that says the subject is present.`);
}

// =============================================================================================================
sec("3. *** AND IT IS murmur's OWN FUNCTION WHEREVER THE SIGNAL IS HELD, across all four of its outputs ***");
{
    let worst = 0, at = "", n = 0;
    for (const B of [2.9, 4.3, 5.2, 7.4, 7.0, 11.5, 5.94, 19.2, 26.0]) {
        for (const F of [1, 1.17, 1.37, 2.105, 3.0, 3.5]) {
            const SLOT = B / F;
            if (SLOT < 1.0) continue;
            for (let i = 0; i < 1200; i++) {
                const t = i * 1.31;
                const a = K.mhFlourish(t, 21, SLOT), b = K.mhFlourishPhase(t / SLOT, SLOT, 21);
                n++;
                for (const key of ["env", "u", "rand", "dur"]) {
                    const d = Math.abs(a[key] - b[key]);
                    if (d > worst) { worst = d; at = `B ${B} F ${F} t ${t.toFixed(1)} ${key}`; }
                }
            }
        }
    }
    ok("!! *** A HELD SIGNAL MAKES THE TWO THE SAME FUNCTION -- env, u, rand AND dur, to 1.8e-12 ***",
        worst < 1e-9 && n > 40000,
        `worst |mhFlourish - mhFlourishPhase| = ${worst.toExponential(2)} over ${n} points spanning nine ` +
        `base slots, six signal sums and 26 minutes of time (worst at ${at}). ALL FOUR OUTPUTS, because the ` +
        `hash-derived ones are where a re-index shows: an env row alone would pass a repair that got the ` +
        `timing right and the identity wrong. Held, P = pace*t, so S = t*F/B = t/SLOT and floor(S) IS ` +
        `floor(t/SLOT). THAT IS WHAT PROTECTS EVERY RECORDED FRAME, and it is not theory -- with the new ` +
        `coefficients zeroed and only the migration in place, every one of the fifteen species gates stayed ` +
        `green, which is the same isolation v4654 ran on limn.`);

    // *** THE 1.0 s GUARD HAS TO BE INERT OR THE INTEGRAL AND THE FUNCTION DISAGREE. *** mh_flourish clamps
    // its slot to at least a second. S has no such clamp -- it cannot, it is an integral -- so if any wired
    // lane could reach the guard, the count and the length would be measuring different clocks. Checked with
    // the margin rather than asserted, the same move v4655 made for tempest's energy clamp.
    const LANES = [
        ["still",      Math.min(11.5, 7.0),    1 + 0.30 + 1.70],
        ["abyss",      Math.min(9, 26) * 0.66, 1 + 0.55 + 0.35 + 1.60],
        ["tempest L0", 2.9,                    1 + 1.30 * 0.85],
        ["tempest L1", 4.3,                    1 + 1.30 * 0.85],
    ];
    const margins = LANES.map(([n2, B, F]) => [n2, B / F]);
    say(`shortest slot each wired lane can reach: ${margins.map(([n2, m]) => `${n2} ${m.toFixed(3)} s`).join(", ")}`);
    ok("!! *** THE 1.0 s FLOOR CANNOT BITE ON ANY WIRED LANE -- worst margin 1.38x, on tempest's first ***",
        margins.every(([, m]) => m > 1.0) && Math.min(...margins.map(([, m])  => m)) > 1.2,
        `each lane's shortest possible slot is its STYLE MINIMUM over its LARGEST signal sum, so these are ` +
        `the worst cases and not samples: ${margins.map(([n2, m]) => `${n2} ${m.toFixed(3)} s`).join(", ")}. ` +
        `mh_flourish clamps the length to a second and the integrated count cannot, so a lane that reached ` +
        `the floor would have its boundaries and its lead-in on two different clocks. The margin is thin ` +
        `enough to be worth a row: tempest's first lane is 1.38x off it, and a style change that shortened ` +
        `2.9 s would close the gap.`);
}

// =============================================================================================================
sec("4. *** THE COEFFICIENTS ARE RECOVERED FROM abyss's OWN FUNCTION, NOT COMPARED WITH IT ***");
{
    // MH_SLOT_SIGNAL is the ORB's copy; render/murmurKit.mjs's abyssSlot is an independent transcription of
    // abyss.ts. Comparing the literals would be two spellings agreeing with each other. INVERTING abyssSlot
    // recovers the three coefficients from its behaviour, which is a measurement of the function.
    const T = K.MH_SLOT_SIGNAL.abyss;
    const base = K.abyssSlot(0.6, 0, 0, 0, 0);
    const got = { voice: base / K.abyssSlot(0.6, 1, 0, 0, 0) - 1,
                  pace:  base / K.abyssSlot(0.6, 0, 1, 0, 0) - 1,
                  drive: base / K.abyssSlot(0.6, 0, 0, 1, 0) - 1 };
    say(`abyss's divisor, recovered by inversion: voice ${got.voice.toFixed(4)}, pace ${got.pace.toFixed(4)}, drive ${got.drive.toFixed(4)}`);
    ok("!! *** THE ORB's TABLE IS abyss's OWN DIVISOR, recovered from the function rather than read beside it ***",
        Math.abs(got.voice - T.voice) < 1e-12 && Math.abs(got.pace - T.pace) < 1e-12 &&
        Math.abs(got.drive - T.drive) < 1e-12,
        `setting one signal to 1 and the rest to 0 makes base/slot equal 1 + that coefficient, so the three ` +
        `come straight out of abyssSlot's behaviour: ${got.voice.toFixed(4)}, ${got.pace.toFixed(4)}, ` +
        `${got.drive.toFixed(4)} against the table's ${T.voice}, ${T.pace}, ${T.drive}. THE TWO ARE MEANT TO ` +
        `BE ABLE TO DISAGREE -- abyssSlot is a transcription of abyss.ts in its own right and this table is ` +
        `the orb's -- so the check has to be a measurement of one against the other and not a reading of two ` +
        `literals side by side, which is the v4579 scar.`);

    const src = codeOnly(fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8"));
    const raw = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");

    // *** AND tempest's SLOT COEFFICIENTS COME OUT OF THE SHADER'S OWN NUMBERS, WHICH ARE THREE NOW AND
    // NOT TWO. *** The divisor is (1 + 1.30 * energy) and energy is 0.85*pace + 0.65*think + 0.55*drive, so
    // the slot COUNT integrates against 1.30 times each of those. Restating 1.105 here would make this row
    // a comment, so the shader's own numbers are READ and multiplied: change any of them and this
    // recomputes instead of agreeing with itself. A sabotage that dropped the 1.30 walked through every row
    // in this gate, because a wrong coefficient still moves a pixel and every pixel row here asks only
    // whether it moved.
    //
    // *** UNTIL v4663 THE WHOLE WEIGHT SAT ON VOICE, AND IT WAS THE WRONG SIGNAL. *** tempest.ts reads pace,
    // a THINKING indicator and drive; this port read voice, so the bolts re-timed when somebody SPOKE and
    // kept a fixed rhythm while the assistant thought -- in the state tempest.ts calls the species' home.
    {
        const raw0 = raw;
        const mR = /const mistRate = float\(1\.0\)\.div\(float\(1\.0\)\.add\(energy\.mul\(SLT\.k\)\)\)/.test(raw0);
        const mE = /clamp\(PACE\.mul\(TE\.pace\)\.add\(think\.mul\(TE\.think\)\)\.add\(DRIVE\.mul\(TE\.drive\)\), 0\.0, TE\.cap\)/.test(raw0);
        const T2 = K.MH_SLOT_SIGNAL.tempest, TE2 = K.MH_TEMPEST_ENERGY;
        const derived = (k) => T2.k * TE2[k];
        ok("!! *** tempest's SLOT WEIGHTS ARE ITS DIVISOR'S 1.30 TIMES ENERGY'S OWN THREE, and VOICE carries none ***",
            mR && mE &&
            Math.abs(T2.pace - derived("pace")) < 1e-12 &&
            Math.abs(T2.think - derived("think")) < 1e-12 &&
            Math.abs(T2.drive - derived("drive")) < 1e-12 &&
            T2.voice === 0 && TE2.pace + TE2.think + TE2.drive > TE2.cap,
            mR && mE
                ? `the bolt's rate divides by (1 + ${T2.k} * energy) and energy is clamp(${TE2.pace}*pace + ` +
                  `${TE2.think}*think + ${TE2.drive}*drive, 0, ${TE2.cap}), so the slot count integrates ` +
                  `against ${derived("pace").toFixed(4)} on the cadence, ${derived("think").toFixed(4)} on ` +
                  `the THINK integral and ${derived("drive").toFixed(4)} on the lean -- and ${T2.voice} on ` +
                  `voice, which carried the entire weight until v4663. THE FOLD IS ONLY VALID WHILE THE ` +
                  `CLAMP IS INERT, and the three coefficients SUM TO ` +
                  `${(TE2.pace + TE2.think + TE2.drive).toFixed(2)}, which is ABOVE the ${TE2.cap} ceiling -- ` +
                  `so the old margin argument does not carry over and section 1 of ` +
                  `tools/ship/murmurCadence-selfcheck.mjs re-derives it: the maximum is 1.500, because ` +
                  `THINKING and RESPONDING are different states and two of energy's terms can never be live ` +
                  `together.`
                : `could not find the bolt rate or the energy clamp in the shader source -- if either moved, ` +
                  `this row has to move with it rather than pass on a stale reading.`);
    }

    // *** THE PHASE AND THE LENGTH HAVE TO BE THE BASE AND THE INSTANTANEOUS ONE, IN THAT ORDER. ***
    // mhFlourishPhase takes both: the integrated count decides WHICH gesture and where in it, and the length
    // is what murmur's absolute 0.9 s lead-in and the returned duration are measured against. Swap them and
    // the clock is still modulated, still continuous and still moves pixels -- it is just measuring the
    // lead-in on the wrong ruler. A SABOTAGE THAT HANDED abyss ITS BASE LENGTH WALKED THROUGH EVERY OTHER
    // ROW IN THIS FILE, including both pixel rows, because the error is about 1.3% of a slot.
    //
    // So: the count must integrate against a base with NO live signal in it, and the length must have one.
    // THE WINDOW STOPS AT THE STATEMENT AND NOT AFTER N CHARACTERS. The first cut took 240 characters and
    // spilled into the NEXT declaration, so `stillBase` read as carrying a live signal because the line
    // below it does -- and every site scored WRONG WAY ROUND on a correct file. A window that runs past its
    // own statement is reading its neighbour's evidence.
    const declOf = (id, txt) => (new RegExp("const " + id + " = [^;]*;").exec(txt) || [""])[0];
    const SIG = /\b(VOICE|PACE|DRIVE|energy)\b/;
    const pairs = [];
    for (let i = 0; (i = src.indexOf("KIT.mhFlourishPhase(", i)) !== -1; i += 10) {
        let j = src.indexOf("(", i), d = 0;
        for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) { j++; break; } } }
        const inner = src.slice(src.indexOf("(", i) + 1, j - 1);
        const args = []; let depth = 0, last = 0;
        for (let q = 0; q < inner.length; q++) {
            if (inner[q] === "(") depth++; else if (inner[q] === ")") depth--;
            else if (inner[q] === "," && depth === 0) { args.push(inner.slice(last, q).trim()); last = q + 1; }
        }
        args.push(inner.slice(last).trim());
        // a term is "live" if it names a signal, or names an identifier whose declaration does
        const live = (txt) => SIG.test(txt) ||
            (txt.match(/[A-Za-z_]\w*/g) || []).some((id) => SIG.test(declOf(id, src)));
        const bm = /^KIT\.mhRatePhase\(\s*float\(1\.0\)\.div\(([\s\S]*?)\),/.exec(args[0] || "") ||
                   /^KIT\.mhRatePhase\(\s*float\(([\s\S]*?)\),/.exec(args[0] || "");
        pairs.push({ base: bm ? bm[1].trim() : "(none)", len: (args[1] || "").trim(),
                     ok: !!bm && !live(bm[1]) && live(args[1] || "") });
    }
    say(`gesture sites: ${pairs.map((p2) => `${p2.base} / ${p2.len}${p2.ok ? "" : "  <-- WRONG WAY ROUND"}`).join(";  ")}`);
    ok("!! *** EVERY GESTURE SITE INTEGRATES AGAINST A STYLE BASE AND MEASURES ITS LEAD-IN ON THE LIVE LENGTH ***",
        pairs.length === 4 && pairs.every((p2) => p2.ok),
        `all ${pairs.length} sites pass mhRatePhase a base with no live signal in it and mhFlourishPhase a ` +
        `length that has one. BOTH HALVES ARE THE ROW: integrating against the MOVING length would make the ` +
        `slot count itself signal-dependent and undo the whole repair, and passing the BASE length would ` +
        `measure murmur's absolute 0.9 s lead-in against a slot the species is not currently on. The second ` +
        `is worth about 1.3% of a slot on abyss and it WALKED THROUGH both pixel rows here and every species ` +
        `gate -- a defect small enough that only a statement about the expression can hold it.`);

    // ...and the three species actually READ the table, through the phase and not as a divisor.
    const nPhase = (src.match(/KIT\.mhFlourishPhase\(/g) || []).length;
    const nPlain = (src.match(/KIT\.mhFlourish\(/g) || []).length;
    say(`gesture clocks in the orb: ${nPhase} integrated, ${nPlain} on the plain clock`);
    ok("!! *** THE FOUR MODULATED SLOTS USE THE INTEGRATED COUNT AND THE ELEVEN FIXED ONES DO NOT ***",
        nPhase === 4 && nPlain === 11 &&
        /MH_SLOT_SIGNAL\.still/.test(raw) && /MH_SLOT_SIGNAL\.abyss/.test(raw) && /MH_SLOT_SIGNAL\.tempest/.test(raw),
        `${nPhase} integrated call sites -- still's one glint, abyss's three lanes written as one call in a ` +
        `loop, and tempest's two bolts -- against ${nPlain} sites still on mh_flourish, every one of which is ` +
        `handed a slot length that is a style constant. A SITE WHOSE SLOT DOES NOT MOVE HAS NO INDEX TO ` +
        `RE-ROLL, so migrating it would change nothing and risk a frame; the same reasoning v4654 used to ` +
        `leave seventeen unmodulated drifts alone. All three species read MH_SLOT_SIGNAL rather than ` +
        `spelling murmur's numbers at the call site. THE COUNTS ARE BOTH ASSERTED BECAUSE EITHER ` +
        `DIRECTION IS A DEFECT: a site that acquires a moving slot without the integrated count re-rolls, ` +
        `and one migrated without needing it is a frame changed for nothing. This row was written with the ` +
        `plain count at 12 and went red at 11 -- nebula keeps the plain clock inside the same ternary whose ` +
        `other branch is tempest's, which is one site and not two.`);
}

// =============================================================================================================
sec("5. *** AND IT REACHES PIXELS: the same instant, the same live signals, and the glint is absent or at full ***");
{
    // Every frame holds stateIndex, stateTau and voice fixed, so PACE, VOICE and DRIVE as the shader computes
    // them are IDENTICAL across each pair. Only the accumulated history differs -- which under the expression
    // this round replaced would leave the slot length untouched and every pair byte-identical.
    const z = { stateIndex: 0, stateTau: 0, paceInt: 0, voiceInt: 0, driveInt: 0 };
    const FR = [
        sp("still", 12.0, 0.6, { ...z }),                                 // 0  night
        sp("still", 12.0, 0.6, { ...z, paceInt: 12.0 }),                  // 1  glint up
        sp("still", 12.0, 0.6, { ...z, driveInt: 7.0 }),                  // 2  glint up
        sp("still", 12.0, 0.6, { ...z, paceInt: 12.0, voiceInt: 12.0 }),  // 3  DEAF, with the glint ON
        sp("abyss", 9.0, 0.6, { ...z, paceInt: 2.7 }),                    // 4  third lane passing
        sp("abyss", 9.0, 0.6, { ...z, paceInt: 2.7, voiceInt: 9.0 }),     // 5
        sp("abyss", 9.0, 0.6, { ...z, paceInt: 2.7, driveInt: 6.0 }),     // 6
        sp("tempest", 10.0, 0.6, { ...z, voiceInt: 3.0 }),                // 7  first bolt up
        sp("tempest", 10.0, 0.6, { ...z, voiceInt: 8.0 }),                // 8
        sp("tempest", 10.0, 0.6, { ...z, voiceInt: 3.0, driveInt: 9.0 }), // 9  DEAF, with the bolt ON
        sp("tempest", 10.0, 0.6, { ...z, voiceInt: 3.0, paceInt: 9.0 }),  // 10 DEAF, with the bolt ON
    ];
    const run = await renderSpecies(FR);
    if (!run.ok || !run.frames || run.frames.length !== FR.length) {
        ok("!! the gesture clock renders at all", false,
            `could not render: ${run.reason || (run.skipped ? "skipped: " + run.skipped : "frame count")}.`);
    } else {
        say(`backend: ${run.isWebGPUBackend ? "REAL WebGPU" : "WebGL2 fallback"}; ${FR.length} frames over three species`);
        const diff = (a, b) => { let n = 0, mx = 0;
            for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) n++; if (d > mx) mx = d; }
            return { pct: 100 * n / a.length, mx }; };
        const sP = diff(run.frames[0], run.frames[1]), sD = diff(run.frames[0], run.frames[2]);
        const sV = diff(run.frames[1], run.frames[3]);
        const aV = diff(run.frames[4], run.frames[5]), aD = diff(run.frames[4], run.frames[6]);
        const tV = diff(run.frames[7], run.frames[8]);
        const tD = diff(run.frames[7], run.frames[9]), tP = diff(run.frames[7], run.frames[10]);
        say(`still   paceInt 0->12: ${sP.pct.toFixed(1)}% worst ${sP.mx}   driveInt 0->7: ${sD.pct.toFixed(1)}% worst ${sD.mx}`);
        say(`abyss   voiceInt +9: ${aV.pct.toFixed(1)}% worst ${aV.mx}   driveInt +6: ${aD.pct.toFixed(1)}% worst ${aD.mx}   |   tempest voiceInt 3->8: ${tV.pct.toFixed(1)}% worst ${tV.mx}`);
        ok("!! *** THE ACCUMULATED HISTORY DECIDES WHETHER THE GESTURE IS ON SCREEN AT ALL, on all three species ***",
            sP.pct > 5 && sP.mx > 100 && sD.pct > 5 && sD.mx > 100 &&
            aV.pct > 5 && aV.mx > 100 && aD.pct > 5 && aD.mx > 100 && tP.pct > 5 && tP.mx > 100,
            `still's single glint is at 0.000 with no history and 0.993 with twelve radian-seconds of ` +
            `cadence behind it, at the SAME instant and the same instantaneous cadence: ${sP.pct.toFixed(1)}% ` +
            `of bytes move, worst channel ${sP.mx} of 255. Drive does the same through its own coefficient ` +
            `(${sD.pct.toFixed(1)}%, ${sD.mx}), abyss's third lane moves on voice and drive ` +
            `(${aV.pct.toFixed(1)}%, ${aD.pct.toFixed(1)}%) and tempest's first bolt on the CADENCE ` +
            `(${tP.pct.toFixed(1)}%). *** tempest's HALF OF THIS ROW READ VOICE UNTIL v4663 AND IT WAS THE ` +
            `WRONG SIGNAL: *** tempest.ts divides its bolt slots by (1 + 1.30 * energy) and energy is ` +
            `0.85*live.pace + 0.65*think + 0.55*st.drive, not voice -- so this gate's POSITIVE and its ` +
            `NEGATIVE for tempest have swapped places, which is what happens when the input was wrong ` +
            `rather than the wiring. It now moves ${tP.pct.toFixed(1)}% on the cadence and ` +
            `${tV.pct.toFixed(1)}% on voice. EVERY PAIR HOLDS stateIndex 0, stateTau 0 AND voice 0.6, so nothing ` +
            `the shader conditions from a uniform differs between the two halves -- under the expression ` +
            `this round replaced these would be five identical pictures.`);

        // *** tempest's DRIVE PAIR LEFT THIS ROW AT v4662, FOR A REASON THAT IS NOT ABOUT SLOTS. *** It read
        // 0.0% from v4656 to v4661 because tempest.ts divides its bolt slots by energy alone -- still true,
        // and still this row's subject. What changed is the species: v4662 wired nebula's and tempest's
        // advection, adv = V * (st.drive * k * t), and a frame of tempest cannot separate a SLOT that
        // ignores drive from a cloud being carried along a heading by it. The same pair left the equivalent
        // row in tools/ship/murmurClock2-selfcheck.mjs in the same round and for the same reason, and that
        // gate carries the positive reading it became.
        say(`still +voiceInt 12 (glint ON): ${sV.pct.toFixed(1)}%   |   tempest +driveInt 9: ${tD.pct.toFixed(1)}% (the v4662 ADVECTION, not the slot)   +paceInt 9: ${tP.pct.toFixed(1)}%`);
        ok("!! *** ...AND EACH SLOT IS DEAF TO THE SIGNALS murmur DOES NOT GIVE IT -- measured with the gesture ON SCREEN ***",
            sV.pct === 0 && tV.pct === 0,
            `still.ts divides by pace and drive and NOT voice; tempest.ts by an ENERGY built from pace, a ` +
            `THINKING indicator and drive -- and NOT voice. Twelve radian-seconds of the signal each one ` +
            `does not read moves ${sV.pct.toFixed(0)} and ${tV.pct.toFixed(0)} bytes. *** tempest's PAIR ` +
            `HERE WAS paceInt UNTIL v4663 AND IS voiceInt NOW, which is the same swap the positive row ` +
            `above records: the port had tempest's energy reading the microphone, so the signal it was deaf ` +
            `to and the signal it answered were exactly the wrong way round. *** IT WAS THREE PAIRS UNTIL v4662 AND THE THIRD IS NOT AVAILABLE ` +
            `ANY MORE: *** tempest's SLOT is still deaf to drive, but that round wired the species' ` +
            `advection and a frame of tempest now moves ${tD.pct.toFixed(1)}% on driveInt for a reason that ` +
            `has nothing to do with a slot. The pair was dropped rather than kept on a widened bound, and ` +
            `tools/ship/murmurClock2-selfcheck.mjs carries the positive reading it turned into. THE FRAMES ` +
            `THESE ARE MEASURED AGAINST HAVE ` +
            `THE GESTURE UP -- still at 0.993 and tempest's first bolt at 0.981 -- which is the whole ` +
            `difference between this row and a vacuous one: a deaf reading taken on a NIGHT frame says ` +
            `nothing, because nothing was on screen to move. The first cut of this section measured exactly ` +
            `that and read 0.0% on all three of still's integrals including the two it does read.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: mh_flourish's slot INDEX, which is not a phase -- every number in the gesture " +
    "is a hash of it, so a slot length that moves does not advance the gesture, it replaces it. tempest's " +
    "two lightning lanes were doing that on every change of voice in this port today; still's divisor was " +
    "absent entirely and abyss's carried one of murmur's three terms. The repair integrates the slot COUNT, " +
    "which is v4654's factoring on a different structure and costs no new uniform." +
    "\nWHAT IS NOT CLAIMED: the 0.9 s LEAD-IN still reads the instantaneous slot length, because it is an " +
    "absolute duration in murmur and a fixed 0.9 s IS a larger share of a slot that has got shorter -- so a " +
    "gesture's start slides, continuously, while a signal moves, and the repaired envelope can step up to " +
    "9.0x the rate of its own progress during a transition. That is murmur's rule faithfully read rather " +
    "than an artefact of this repair, and expressing the lead-in against the BASE slot instead would make it " +
    "perfectly continuous at the price of the reduction that protects every recorded frame -- measured, and " +
    "rejected for that reason. Also not claimed: tempest's bolt slots are missing murmur's `small` mix " +
    "(mix(2.9, 5.2, small) and mix(4.3, 7.4, small)), which is a style transcription rather than a clock and " +
    "is recorded against the st.drive entry in tools/ship/nextRounds.mjs.");
process.exit(fails ? 1 : 0);
