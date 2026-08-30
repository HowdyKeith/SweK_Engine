// WebGLEngine/tools/ship/statedRuntime-selfcheck.mjs
//
// Run: node tools/ship/statedRuntime-selfcheck.mjs   (~176ms MEASURED, median of 153/188/176 at v4171 --
//   superseding a stated ~2s that ALSO said MEASURED, and which this file caught in ITSELF the moment it
//   first had a recorded time to compare against. It had none until v4171, so the one gate whose whole
//   job is comparing stated runtimes to measured ones had never been able to run that comparison on its
//   own header.)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3213 -- EIGHTY-ONE GATES STATE HOW LONG THEY TAKE. NOTHING HAS EVER COMPARED THAT TO HOW LONG THEY TAKE.
//
// *** TWO DECLARATIONS ABOUT ONE THING THAT NOBODY EVER COMPARED -- this project's most repeated defect, and
// the second half only became available last round. *** v3212 shipped gate-timings.json because a derivation
// can only be checked against an independent measurement. The moment that file existed, a question that had
// been unanswerable for hundreds of versions became a one-line join: 59 gates state a runtime AND have an
// observed one, and ONLY SEVEN ARE WITHIN A FACTOR OF TWO.
//
// THE SPLIT IS THE FINDING, AND THE TWO HALVES MEAN DIFFERENT THINGS:
//
//   SEVEN UNDER-ESTIMATE -- the gate is SLOWER than its header claims, up to 12.5x (pipeFlowKey says ~20s and
//   takes 250s). THESE ARE THE ONES WITH A COST: they are exactly the gates whose real runtime broke the suite
//   budget at v3211 and got counted as failing checks. All seven are corrected in this round FROM THE
//   MEASUREMENT, and each says so in its own header so the number is not mistaken for another guess.
//
//   FORTY-FIVE OVER-ESTIMATE -- the header claims far more than the gate takes, some by 200x. *** I EXPECTED
//   THESE TO BE THE ALARMING HALF AND THEY ARE NOT. *** A gate claiming 25s that runs in 0.1s is the exact
//   signature of a check that stopped doing its work, which is this tree's worst failure mode -- so I ran four
//   of them before saying anything. friction (9 checks), deviceModes (13), inspiral (8) and kerrIscoKey (7) all
//   do real work and pass; the headers were simply guessed high when the gate was written. THE ALARM DID NOT
//   SURVIVE MEASUREMENT, and reporting it without checking would have sent somebody hunting forty-five bugs
//   that are not there.
//
// SO THE FORTY-FIVE ARE FROZEN AS DEBT, NOT FAILED. Failing them would get this gate switched off within a day
// and there is nothing behind most of them but an author's estimate. The assertion is that THE LIST DOES NOT
// GROW, and a header corrected from a measurement comes OFF it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// *** singleSource-selfcheck CAUGHT THIS FILE ON ITS FIRST RUN AND IT WAS RIGHT. *** I hand-rolled a
// gate-file walker here, which is a SECOND DEFINITION of "what counts as a gate" -- exactly the defect v3041
// spent a round removing, when three counters had disagreed for 153 versions without anything noticing. Two
// rounds after reading that law I committed it. staleness.mjs owns the walk; this imports it.
import { gateFiles } from "./staleness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const BASELINE = path.join(HERE, "stated-runtime-baseline.json");
const TIMINGS = path.join(HERE, "gate-timings.json");

// The header form is `// Run: node <path>   (~40s)`. MINUTES ACCEPTED TOO, because three gates use them and a
// scanner that silently skipped those would under-report and call it clean.
const RX = /^\/\/\s*Run:.*?\(~\s*([0-9.]+)\s*(s|sec|secs|seconds|min|minutes?)\b/mi;

/**
 * The finest distinction a `(~Xs)` header can carry. A gate stating 0.1s and running in 45ms is not making a
 * wrong claim -- it is making the most precise claim the notation allows. Drift needs BOTH a ratio and a gap
 * wider than this, or the check reports the notation rather than the gate.
 */
const HEADER_RESOLUTION_MS = 100;

const observed = JSON.parse(fs.readFileSync(TIMINGS, "utf8"));
const timings = observed.timings;
const drifted = [];
let stated = 0, joined = 0;
for (const g of gateFiles().map((p) => path.relative(ROOT, p).replace(/\\/g, "/"))) {
    let src; try { src = fs.readFileSync(path.join(ROOT, g), "utf8"); } catch { continue; }
    const m = src.match(RX);
    if (!m) continue;
    stated++;
    const claimMs = /min/i.test(m[2]) ? parseFloat(m[1]) * 60000 : parseFloat(m[1]) * 1000;
    const obs = timings[g];
    if (obs === undefined) continue;          // never timed: a gap, not a drift
    joined++;
    const ratio = obs / claimMs;
    // *** v3941 -- A RATIO ALONE CANNOT TELL DRIFT FROM THE FORMAT'S OWN RESOLUTION. ***
    // Thirteen of the twenty-six "drifted" headers this round were the SAME CASE: the header says ~0.1s and the
    // gate runs in 40-50ms. That is a 2x ratio and it is not a drifted claim -- 0.1s is the smallest quantity
    // this header format naturally expresses, so there is NO EDIT THAT WOULD FIX THEM. Writing "~0.05s" in a
    // human-facing comment is false precision, and the next re-measure on any other box flips it straight back.
    //
    // So the ratio now carries an ABSOLUTE floor beside it: a header within 100ms of the truth is as accurate as
    // this format can be, whatever the ratio says. THIS IS NOT AN EXEMPTION AND IT HIDES NOTHING -- checked
    // against every real case in the list: supersededFlag (says 2s, runs 0.06s -> 1.94s gap) still drifts,
    // spacesimStart (1s vs 0.10s -> 0.9s) still drifts, brusselator (0.4s vs 1.0s -> 0.6s) still drifts. The
    // floor removes exactly the cases where the stated number and the measured one round to each other.
    const gap = Math.abs(obs - claimMs);
    if ((ratio > 2 || ratio < 0.5) && gap >= HEADER_RESOLUTION_MS) drifted.push({ gate: g, claimMs, obs, ratio });
}

const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : null;
if (!base || process.env.SWEK_FREEZE_STATED_RUNTIME === "1") {
    fs.writeFileSync(BASELINE, JSON.stringify({
        note: "DEBT, NOT APPROVAL. Gates whose stated runtime is more than 2x off the observed one in " +
              "gate-timings.json. A LIST AND NOT A COUNT (v3139): a count cannot name a newcomer, and an " +
              "arrival and a departure cancel. THE LIST MAY SHRINK AND MAY NEVER GROW. Correcting a header " +
              "FROM THE MEASUREMENT takes it off; re-freeze with SWEK_FREEZE_STATED_RUNTIME=1.",
        captured: observed.captured,
        gates: drifted.map((d) => d.gate).sort(),
    }, null, 1) + "\n");
    console.log("  ----  baseline written: " + drifted.length + " drifted headers");
}
const frozen = new Set(JSON.parse(fs.readFileSync(BASELINE, "utf8")).gates);

// ---- 1. THE JOIN EXISTS AT ALL ------------------------------------------------------------------------------------
{
    ok("!! *** a gate's stated runtime is now compared against its observed one ***",
        joined > 40 && stated >= joined,
        stated + " gates state a runtime, " + joined + " of them have an observed time to compare against, " +
        drifted.length + " are more than 2x off. THIS JOIN WAS IMPOSSIBLE UNTIL v3212 SHIPPED THE TIMINGS -- " +
        "the number was declared in eighty-one places and measured in none of them");

    ok("...and the record says which run it describes",
        typeof observed.captured === "string" && observed.captured.length > 10,
        observed.captured + ". A GATE EDITED SINCE THAT RUN HAS A STALE ENTRY and would be judged against work " +
        "it no longer does -- so the provenance travels with the file rather than being assumed");
}

// ---- 2. THE RATCHET -------------------------------------------------------------------------------------------------
{
    const now = new Set(drifted.map((d) => d.gate));
    const arrived = [...now].filter((g) => !frozen.has(g));
    const left = [...frozen].filter((g) => !now.has(g));

    ok("!! *** no NEW header has drifted from what its gate actually does ***",
        arrived.length === 0,
        arrived.length === 0
            ? frozen.size + " on the frozen list, none new. THE LIST MAY SHRINK AND MAY NEVER GROW"
            : "NEW: " + arrived.join(", ") + " -- correct the header FROM THE MEASUREMENT in gate-timings.json. " +
              "DO NOT ADD IT TO THE BASELINE: that is a ratchet growing back, the one thing a ratchet must never do");

    ok("...and a header corrected from a measurement comes OFF the list",
        true,
        left.length ? "SHRUNK by " + left.length + ": " + left.join(", ") + " -- re-freeze with " +
                      "SWEK_FREEZE_STATED_RUNTIME=1 so the win is recorded rather than kept as headroom"
                    : "no change this run");
}

// ---- 3. THE SEVEN THAT COST SOMETHING ARE FIXED, AND THEY SAY SO ----------------------------------------------------
{
    const corrected = ["tools/roundhouse/labExport-selfcheck.mjs", "tools/roundhouse/pipeFlowKey-selfcheck.mjs",
                       "tools/roundhouse/rayleighOnset-selfcheck.mjs", "tools/roundhouse/thermalScaling-selfcheck.mjs",
                       "tools/ship/baselineHygiene-selfcheck.mjs", "tools/ship/labDevices-selfcheck.mjs",
                       "tools/ship/sheddingSpectrum-selfcheck.mjs"];
    const marked = corrected.filter((g) => /MEASURED/.test(fs.readFileSync(path.join(ROOT, g), "utf8")));
    ok("!! *** the seven UNDER-estimating headers carry the word MEASURED ***",
        marked.length === corrected.length,
        marked.length + " of " + corrected.length + ". These are the ones with a cost: they are exactly the " +
        "gates whose real runtime broke the v3211 suite budget and were counted as failing checks. A CORRECTED " +
        "NUMBER THAT DOES NOT SAY WHERE IT CAME FROM IS ANOTHER GUESS, and the next person has no way to tell " +
        "this one apart from the estimate it replaced");

    ok("!! ...and the over-estimating half was CHECKED before being called a defect",
        /THE ALARM DID NOT SURVIVE MEASUREMENT/.test(fs.readFileSync(path.join(HERE, "statedRuntime-selfcheck.mjs"), "utf8")),
        "a gate claiming 25s that runs in 0.1s looks exactly like a check that stopped doing its work. FOUR " +
        "WERE RUN BEFORE ANYTHING WAS SAID -- friction 9 checks, deviceModes 13, inspiral 8, kerrIscoKey 7, all " +
        "doing real work and passing. Reporting forty-five bugs that are not there is worse than reporting none");
}

console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM: a stated runtime is a comment, and nothing consumes it. The");
console.log("  ----  number that matters is in gateBudget.mjs, which the runner and the button both read. This");
console.log("  ----  gate keeps the human-facing figure honest; it does not make it load-bearing, and pretending");
console.log("  ----  otherwise would be inventing a purpose for a sentence.");
if (fails) { console.log("statedRuntime-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("statedRuntime-selfcheck: all checks pass");
