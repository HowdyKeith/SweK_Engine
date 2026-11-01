// WebGLEngine/brain/needsTaskReferences-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/needsTaskReferences-selfcheck.mjs      (~9 s -- measured 8.7-9.3 s alone at v4905)
//
// THE MEASUREMENTS BEHIND PIECE 4 (brain/NEEDS_AND_LIMITS.md "Round 3" and "Amendment 1"), held as rows so they cannot drift: what a lack of a held decision costs, whether the world holds the decision (it does), and what the noisy gauge does to a stateless rule and to a filtered one. Far and both kinds, seeds 501-504 (8 runs a pilot)
// -- THE CALIBRATION SEEDS, said plainly: the task was tuned on 501-508, so these rows say the references behave so ON THEM; the audits (51-62, 71-82, 91-102) are read by the experiment and not here.
//   1  GUARDED against GUARDED-1T       the hysteresis is worth it on a clean gauge: at n = 16 (seeds 501-508) GUARDED 0.850 / 0.813, GUARDED-1T 0.381 / 0.407, difference 0.437 (se 0.058)
//   2  GUARDED-OBS = GUARDED            a STATELESS rule that reads the depth reproduces the hysteresis exactly on a clean gauge (0.850 / 0.813, difference 0.000, se 0.014): the task needs no internal state with a clean gauge
//   3  GUARDED-OBS0 is worse            the crude observation rule chatters at the 3 m line (0.419 / 0.644 at n = 16)
//   4  THE NOISY GAUGE                  sd 0.1 at 1 Hz takes GUARDED to 0.256 and GUARDED-OBS to 0.198 at n = 16, and a filtered GUARDED-OBS (alpha 0.005 per tick) recovers 0.822: the memory is worth about 0.6
// SABOTAGE: the mutants of brain/needsTask-selfcheck.mjs's section 9 that change these behaviours (obsThreshold's ramp and ends, the hysteresis, the single threshold, FILTER_ALPHA, the gauge's sd and hold) were run against THIS gate as well; see the foot of that header.
"use strict";
import * as T from "./needsTask.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const margin = (p) => Math.max(0.03, 2 * p.se), fmt = (p) => `${p.diff.toFixed(3)} against ${margin(p).toFixed(3)} (se ${p.se.toFixed(3)})`;
console.log("needsTaskReferences-selfcheck -- the references of piece 4, measured on the calibration seeds\n");

const set = T.setOf(["far", "both"], 501, 504), clean = {}, noisy = {};
for (const [n, f] of [["GUARDED", T.GUARDED], ["1T", T.GUARDED_1T], ["OBS", T.GUARDED_OBS], ["OBS0", T.GUARDED_OBS0]]) clean[n] = T.evaluate(f, set);
for (const [n, f] of [["GUARDED", T.GUARDED], ["OBS", T.GUARDED_OBS], ["FILTER", T.GUARDED_FILTER]]) noisy[n] = T.evaluate(f, set, { gauge: T.GAUGE });
const mean = (e) => e.score.toFixed(3);

sec("1. WITHOUT A HELD DECISION THE JOB IS LOST (clean gauge)");
{ const p = T.paired(clean.GUARDED, clean["1T"]); ok("!! GUARDED (hysteresis) beats GUARDED-1T (one threshold at 0.45) by more than max(0.03, 2 se)", p.diff > margin(p), `GUARDED ${mean(clean.GUARDED)}, 1T ${mean(clean["1T"])}: ${fmt(p)}`); }

sec("2. BUT THE WORLD HOLDS THE DECISION (clean gauge)");
{ const p = T.paired(clean.OBS, clean.GUARDED); ok("!! GUARDED-OBS, a rule from the charge and the DEPTH alone, is within max(0.03, 2 se) of GUARDED: the task needs no internal state with a clean gauge", Math.abs(p.diff) <= margin(p), `OBS ${mean(clean.OBS)}, GUARDED ${mean(clean.GUARDED)}: ${p.diff.toFixed(3)} (se ${p.se.toFixed(3)})`);
  const q = T.paired(clean.GUARDED, clean.OBS0); ok("!! the crude observation rule (GUARDED-OBS0) is worse than GUARDED by more than max(0.03, 2 se): it chatters at the 3 m line", q.diff > margin(q), `OBS0 ${mean(clean.OBS0)}: ${fmt(q)}`); }

sec("3. THE NOISY GAUGE ASKS FOR A MEMORY");
{
    const a = T.paired(noisy.FILTER, noisy.OBS), b = T.paired(noisy.FILTER, noisy.GUARDED), c = T.paired(clean.OBS, noisy.OBS);
    ok("!! with the noisy gauge a filtered GUARDED-OBS (a leaky average, one piece of memory) beats the stateless GUARDED-OBS by more than max(0.03, 2 se)", a.diff > margin(a), `FILTER ${mean(noisy.FILTER)}, OBS ${mean(noisy.OBS)}: ${fmt(a)}`);
    ok("!! ... and beats GUARDED, whose hysteresis does not survive the noise either", b.diff > margin(b), `GUARDED ${mean(noisy.GUARDED)}: ${fmt(b)}`);
    ok("!! the noise costs a stateless rule at least 0.3 of the score (GUARDED-OBS clean against noisy), and the filtered rule keeps over 0.6", c.diff > 0.3 && noisy.FILTER.score > 0.6, `clean ${mean(clean.OBS)} -> noisy ${mean(noisy.OBS)}; filtered ${mean(noisy.FILTER)}`);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exit(fails ? 1 : 0);
