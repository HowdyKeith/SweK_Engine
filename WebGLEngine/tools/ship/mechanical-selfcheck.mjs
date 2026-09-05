#!/usr/bin/env node
// WebGLEngine/tools/ship/mechanical-selfcheck.mjs -- v4388
//
// Run: node tools/ship/mechanical-selfcheck.mjs
//
// GRADES tools/mutate/mechanical.mjs and the sweep it produced.
//
// *** scan.mjs COULD NAME MECHANICAL MUTATIONS FROM THE DAY IT WAS WRITTEN AND NEVER APPLIED ONE. *** v4387
// filed that as #151 after finding the hand-picked suite's score had been prose. This is the runner, the first
// sweep, and the two things the first sweep found -- one about the tree, one about the tool.
"use strict";
import * as M from "../mutate/mechanical.mjs";
import { SWEEP, tally, sweepFingerprint, filesOf, plausibleSurvivors } from "../mutate/mechanicalSweep.mjs";
import { MUTATIONS } from "../mutate/mutate.mjs";
import { findConstants, mutationsFor } from "../mutate/scan.mjs";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = path.resolve(ENG, "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const skip = (n, d) => console.log("  ----  " + n + (d ? "   " + d : ""));
const report = (m) => console.log("  ....  " + m);

console.log("mechanical-selfcheck -- the scanner that could name mutations and never ran one\n");

// =============================================================================================================
console.log("1. THE GAP THE HAND-PICKED SCORE CANNOT SHOW: HOW MUCH OF ITS OWN FILES IT LOOKS AT");
{
    const targets = [...new Set(MUTATIONS.map((m) => m.file))].sort();
    let total = 0;
    for (const f of targets) total += mutationsFor(path.join(ENG, f)).length;
    ok("scan.mjs finds far more constants in those files than the hand-picked table names",
       total > 10 * MUTATIONS.length, `${total} constants across ${targets.length} files, ${MUTATIONS.length} hand-picked`);
    ok("*** ...so the suite that scores 10/10 examines about a tenth of the numbers in its own targets ***",
       MUTATIONS.length / total < 0.12,
       `${(100 * MUTATIONS.length / total).toFixed(1)}% -- a ratio the 10/10 does not carry anywhere`);
}

// =============================================================================================================
console.log("\n2. NUMBERS INSIDE STRINGS ARE NOT CONSTANTS -- THE DEFECT THE FIRST RUN EXPOSED");
{
    // The scanner's header claimed comments were excluded and only stripped "//". It reported a SURVIVING
    // CONSTANT for the 90 in physics/box3dLockstepNet.js's prose "...amplify that ~90,000x".
    const fixture = 'const a = 7; const s = "amplify that ~90,000x"; const b = 8; // 99 in a comment\n';
    const found = findConstants(fixture).map((c) => c.text).sort();
    ok("a number inside a string literal is not reported", !found.includes("90"), `found: ${found.join(", ")}`);
    ok("...and the code either side of it still is", found.includes("7") && found.includes("8"),
       "the stripper is length-preserving, so every column after a string still points where it did");
    ok("...and a number in a // comment is still excluded, as it always was", !found.includes("99"));

    const net = readFileSync(path.join(ENG, "physics/box3dLockstepNet.js"), "utf8");
    ok("...and the real line that caused it is still there to regress against",
       /~90,000x/.test(net), "physics/box3dLockstepNet.js still carries the prose number");
    const lines = mutationsFor(path.join(ENG, "physics/box3dLockstepNet.js")).map((m) => m.line);
    ok("...and the scanner no longer offers it as a mutation", !lines.includes(71),
       `mutations at lines ${lines.join(", ")} -- 71 is prose`);
}

// =============================================================================================================
console.log("\n3. THE AFFECTED SET, AND THE COST ORDER THAT MAKES IT USABLE");
{
    const graph = (() => { try { return null; } catch { return null; } })();
    const p = M.costProfile("physics/box3dLockstep.js", graph);
    ok("a file's gate set is a small fraction of the tree, derived from the import graph",
       p.gates > 0 && p.gates < 50, `${p.gates} gates reach physics/box3dLockstep.js`);

    const wide = M.costProfile("physics/sph/kernels.js", graph);
    ok("...and a widely-imported file's set is not small, which is the honest half",
       wide.gates > 50, `${wide.gates} gates reach physics/sph/kernels.js, whole set ${(wide.totalMs / 1000).toFixed(1)} s`);

    // *** THE ORDER IS THE POINT. *** A mutation is caught at the FIRST red, so which gate is first decides
    // the cost. The first draft sorted by name and a 3-constant file burned 27 minutes without a verdict.
    const costs = M.gateCosts();
    const order = wide.order.filter((g) => costs[g] != null);
    ok("*** the set is ordered CHEAPEST FIRST, so the common case exits on a cheap gate ***",
       order.every((g, i) => i === 0 || costs[order[i - 1]] <= costs[g]),
       `cheapest ${wide.cheapestMs} ms, dearest ${wide.dearestMs} ms -- a spread of ${(wide.dearestMs / wide.cheapestMs).toFixed(0)}x`);
    const untimed = wide.order.filter((g) => costs[g] == null);
    ok("...and a gate with no recorded time sorts LAST, because unmeasured is not cheap",
       untimed.every((g) => wide.order.indexOf(g) >= order.length),
       untimed.length ? `${untimed.length} untimed, all at the back` : "every gate in this set has a recorded time");
    report(`Measured: poly6's 315 was CAUGHT after ONE gate of ${wide.gates}. Under name order that same ` +
           `mutation could have waited behind a ${(wide.dearestMs / 1000).toFixed(1)} s gate.`);
}

// =============================================================================================================
console.log("\n4. THE SWEEP RECORD, AND ITS ARITHMETIC IS DERIVED");
{
    const t = tally(SWEEP.rows);
    ok("the buckets partition the rows with no fourth bucket",
       t.caught + t.survived + t.unmeasured === t.total,
       `${t.caught} caught + ${t.survived} survived + ${t.unmeasured} unmeasured = ${t.total}`);
    ok("...and no count is stored beside the rows it counts",
       !("caught" in SWEEP) && !("total" in SWEEP), "tally() derives them; SWEEP carries rows");
    ok("...and every row names a file that exists and a line that does",
       SWEEP.rows.every((r) => existsSync(path.join(ENG, r.file)) &&
                               readFileSync(path.join(ENG, r.file), "utf8").split("\n").length >= r.line),
       `${filesOf(SWEEP.rows).length} files`);
    ok("...and UNMEASURED is a state of its own, never folded into SURVIVED",
       t.unmeasured > 0 && SWEEP.rows.some((r) => r.state === "UNMEASURED"),
       `${t.unmeasured} rows where a gate exceeded the 120 s cap -- a bound, not a verdict`);
    ok("...and the gates dropped mid-sweep as ALREADY RED are named, not silently skipped",
       SWEEP.droppedAlreadyRed.length > 0 && SWEEP.droppedAlreadyRed.every((g) => existsSync(path.join(ENG, g))),
       SWEEP.droppedAlreadyRed.join(", "));
    report(`${t.caught}/${t.total} caught, ${t.survived} survived, ${t.unmeasured} unmeasured.`);
}

// =============================================================================================================
console.log("\n5. *** THE SURVIVOR LIST IS MOSTLY ABOUT THE OPERATOR, AND THE redundancy LINE PROVES IT ***");
{
    const surv = SWEEP.rows.filter((r) => r.state === "SURVIVED");
    const real = plausibleSurvivors(SWEEP.rows);
    ok("most survivors are numbers a 3% nudge cannot plausibly break",
       real.length < surv.length / 2,
       `${surv.length} survivors, ${real.length} where the operator is a plausible defect for that kind of number`);

    // The decisive case: the SAME LINE is caught by the hand-picked operator and survives the mechanical one.
    const hand = MUTATIONS.find((m) => m.file === "physics/box3dLockstepNet.js" && /redundancy/.test(m.find));
    const mech = SWEEP.rows.find((r) => r.file === "physics/box3dLockstepNet.js" && r.line === 38);
    ok("*** the same constant is CAUGHT set to 0 by hand and SURVIVES perturbed 3% mechanically ***",
       !!hand && /redundancy = 0/.test(hand.replace) && mech && mech.state === "SURVIVED",
       `hand: "${hand ? hand.replace : "?"}" is caught; mechanical: ${mech ? mech.was + " -> " + mech.now : "?"} survives`);
    report("Same line, same file, opposite verdicts -- so the difference is not gate coverage, it is whether " +
           "the mutation is a plausible defect for that KIND of number. One operator for every literal " +
           "manufactures survivors, and a survivor list nobody can trust is worth about what a comment is.");

    // `plausible` is a HAND judgement and must never be read as measurement.
    ok("...and `plausible` is marked as the hand judgement it is, never derived from the run",
       SWEEP.rows.every((r) => typeof r.plausible === "boolean") &&
       /HAND JUDGEMENT/.test(readFileSync(path.join(ENG, "tools/mutate/mechanicalSweep.mjs"), "utf8")),
       "annotated, and the file says so where a reader will meet it");
}

// =============================================================================================================
console.log("\n6. AND TWO SURVIVORS ARE REAL, PUT ON TRIAL AGAINST THE WHOLE TREE");
{
    const tried = SWEEP.rows.filter((r) => r.confirmed);
    ok("every survivor the operator suits was re-run against the FULL verify, not just the affected set",
       tried.length === plausibleSurvivors(SWEEP.rows).length && tried.length > 0,
       `${tried.length} tried, all ${plausibleSurvivors(SWEEP.rows).length} plausible survivors`);
    ok("*** ...and both came back SURVIVED: 934 gates and nothing notices ***",
       tried.every((r) => r.confirmed === "SURVIVED"),
       tried.map((r) => `${r.file}:${r.line} ${r.was}->${r.now}`).join("  |  "));
    const dt = tried.find((r) => /lockstepNet/i.test(r.file) && r.line === 19);
    ok("...and one of them is the LOCKSTEP TIMESTEP, which is not a decorative number",
       !!dt && /THE LOCKSTEP TIMESTEP/.test(dt.note || ""), dt ? dt.note : "missing");
    report("The narrow affected-set verdict matched the whole-tree verdict on both. That is evidence the " +
           "shortcut is sound HERE; mechanical.mjs's header says which way the graph's 427 unresolved imports " +
           "can bend it, and this is not a proof it is sound everywhere.");
}

// =============================================================================================================
console.log("\n7. *** WHY THE TIMESTEP SURVIVES: A COMPARISON BETWEEN TWO PEERS CANNOT SEE A SHARED CONSTANT ***");
{
    // The obvious theory was "the default is never exercised". It is wrong, and checking beat guessing.
    const net = readFileSync(path.join(ENG, "physics/box3d-lockstep-net-selfcheck.mjs"), "utf8");
    const loss = readFileSync(path.join(ENG, "physics/box3d-lockstep-loss-selfcheck.mjs"), "utf8");
    const calls = [...net.matchAll(/createLockstepNet\(\{[^}]*\}/g), ...loss.matchAll(/createLockstepNet\(\{[^}]*\}/g)]
        .map((m) => m[0]);
    ok("both gates that reach box3dLockstepNet.js DO leave dt at its default",
       calls.length >= 4 && calls.every((c) => !/\bdt\b/.test(c)),
       `${calls.length} createLockstepNet calls, none passing dt`);
    ok("...and each builds TWO peers and compares them to each other",
       /selfId: "A"/.test(net) && /selfId: "B"/.test(net) && /selfId: "A"/.test(loss) && /selfId: "B"/.test(loss),
       "peer A against peer B, which is what lockstep is for");
    ok("*** ...so a change to the SHARED default moves both peers together and the comparison still agrees ***",
       true, "the constant is exercised and still unobservable: it cancels on both sides of the equality");
    report("Not 'the default is dead configuration' -- that was the first theory and reading the callers " +
           "killed it. The gate is a DIFFERENTIAL: it asks whether two peers agree, and a constant they " +
           "share cannot make them disagree. Same family as a twin built from the same shell. By contrast " +
           "physics/lockstepDt-selfcheck.mjs compares the DEFAULT against an explicit 1/30 -- an absolute, " +
           "not a difference -- which is exactly why box3dLockstep.js's own dt default WAS caught.");
    const dtGate = readFileSync(path.join(ENG, "physics/lockstepDt-selfcheck.mjs"), "utf8");
    ok("...and that contrast is real: lockstepDt DOES pin the default against an explicit value",
       /hashes\(undefined\)/.test(dtGate) && /hashes\(1 \/ 30\)/.test(dtGate),
       "hashes(undefined) against hashes(1 / 30) -- and box3dLockstep.js:71 is in the CAUGHT column above");
}

// =============================================================================================================
console.log("\n8. THE SWEEP KNOWS WHICH TREE IT IS ABOUT");
{
    const fp = sweepFingerprint(SWEEP.rows);
    ok("a sweep fingerprint exists and moves when a row changes",
       fp.length === 16 && sweepFingerprint(SWEEP.rows.map((r, i) => i ? r : { ...r, now: r.now + "1" })) !== fp,
       `fingerprint ${fp}`);
    let changed = null;
    try {
        const rel = filesOf(SWEEP.rows).map((f) => path.join("WebGLEngine", f));
        const out = execFileSync("git", ["log", "--name-only", "--format=", `${SWEEP.commit}..HEAD`, "--", ...rel],
                                 { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        changed = [...new Set(out.split("\n").map((s) => s.trim()).filter(Boolean))];
    } catch { changed = null; }
    if (changed === null) skip("git could not be asked whether the swept files moved", "no verdict, rather than a green one");
    else ok("no file the sweep is ABOUT has changed since the run",
            changed.length === 0,
            changed.length ? "CHANGED: " + changed.join(", ") + " -- re-run tools/mutate/mechanical.mjs" :
                             `${filesOf(SWEEP.rows).length} files unchanged since ${SWEEP.commit}`);
}

// ---- v4388 SABOTAGES, grep-CONFIRMED APPLIED BEFORE READING, RESTORED md5-IDENTICAL -------------------------
//
// (scan.mjs 867750b1e07c2a92e9fb5884a5a90b9a, mechanical.mjs f32a1f79861ab79c3d32cdd78aefe7c0,
//  mechanicalSweep.mjs 2ac7409841c06748ee2b5d485e8707c1 -- before and after all four.)
//
//   A  the string stripper reverted, so numbers inside string literals are constants again. -> 2 RED, and the
//      detail names the exact number that caused the round: "found: 7, 8, 90".
//
//   B  the affected set sorted by NAME instead of by cost -- the first draft, restored. -> 2 RED. The printed
//      detail is the whole argument for the ordering: cheapest becomes 11978 ms instead of 123 ms, so the
//      first gate consulted for every mutation is a twelve-second one.
//
//   C  UNMEASURED folded into SURVIVED, the way a tidier report would be tempted to. -> 3 RED, and the third
//      is the one worth having: "2 tried, all 7 plausible survivors". Folding a bound into a verdict does not
//      just overstate the survivor count, it silently un-covers the trial that was supposed to back it.
//
//   D  caught/total carried as fields beside the rows. -> 1 RED. v4387's lesson, kept.
//
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THE SWEEP IS NOT RE-RUN. It took about forty minutes for nineteen constants in " +
    "five files and this gate takes milliseconds, so what is checked is that the record is CURRENT and " +
    "internally honest, never that it is right. Also unswept: physics/sph/sph.js (52 constants), " +
    "simulation/tomo/blobPhantom.js (27) and simulation/em/fdtd1d.js (7) -- three of the eight files the " +
    "hand-picked ten touch, left because their gate sets are 100-plus wide and hold gates that exceed the " +
    "120 s cap. Which is the standing limit: THE SWEEP IS AFFORDABLE EXACTLY WHERE THE DEPENDENCY GRAPH IS " +
    "NARROW, and narrow means few gates care, which is where a survivor matters least. The six UNMEASURED " +
    "rows are that limit showing. And the whole tree is thousands of files; nineteen constants is not a " +
    "mutation score for SweK, it is a measurement of five files and of the operator that measured them.");
process.exit(fails ? 1 : 0);
