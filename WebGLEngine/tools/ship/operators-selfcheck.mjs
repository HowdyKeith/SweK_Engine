#!/usr/bin/env node
// WebGLEngine/tools/ship/operators-selfcheck.mjs -- v4390
//
// Run: node tools/ship/operators-selfcheck.mjs
//
// GRADES tools/mutate/operators.mjs -- the mutation operator chosen by the constant's ROLE.
//
// *** v4389 SWEPT FIVE FILES AND FOUND SEVEN SURVIVORS, FIVE OF WHICH WERE ABOUT THE OPERATOR RATHER THAN THE
// TREE: *** integer tick counts and a JSON indent, nudged by three percent, filed as constants nothing is
// checking. It recorded that judgement as a hand annotation called `plausible` and said so. This is that
// annotation becoming a function, and the measurement of what it changes.
"use strict";
import { roleOf, mutantsFor, roleCensus, ROLE, FORMAT_CALLS } from "../mutate/operators.mjs";
import { SWEEP_BY_ROLE, verdictOf, operatorComparison } from "../mutate/mechanicalSweep.mjs";
import { MUTATIONS } from "../mutate/mutate.mjs";
import { findConstants } from "../mutate/scan.mjs";
import { roleMutationsFor } from "../mutate/mechanical.mjs";
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
const at = (file, line) => ({ file, line });

console.log("operators-selfcheck -- one operator for every literal manufactures survivors\n");

// =============================================================================================================
console.log("1. THE ROLE IS READ FROM THE LINE THE COLUMN WAS MEASURED ON, NOT FROM THE PRINTED EXCERPT");
{
    // *** THIS IS THE BUG THE CLASSIFIER SHIPPED IN ITS FIRST DRAFT. *** findConstants reports `col` as an
    // index into the untrimmed code line and `context` as a TRIMMED, TRUNCATED excerpt for printing. Reading
    // the role off `context` mis-read `1 / 30` as a bare integer and did not see JSON.stringify's indent as
    // being inside the call. Same family as the length-preserving string stripper: a column is only meaningful
    // against the text it was measured on.
    const src = '    const dt = opts.dt || 1 / 30;\n';
    const c = findConstants(src).find((x) => x.text === "30");
    ok("findConstants carries the untrimmed line beside the trimmed excerpt",
       typeof c.code === "string" && c.code !== c.context && c.code.slice(c.col, c.col + 2) === "30",
       `col ${c.col} indexes code correctly; context is trimmed to "${c.context}"`);
    ok("...and the role read from it is SCALE, because the 30 is a divisor",
       roleOf(c) === ROLE.SCALE, `role ${roleOf(c)}`);
    ok("...while reading the same constant off the trimmed excerpt gets it wrong",
       roleOf({ ...c, code: undefined }) !== ROLE.SCALE,
       "which is what the first draft did, and why `code` exists");
}

// =============================================================================================================
console.log("\n2. THE THREE ROLES, AND THE ORDER THAT DECIDES BETWEEN THEM");
{
    const roles = (line) => findConstants(line + "\n").map((c) => [c.text, roleOf(c)]);
    ok("a non-integer is always a SCALE",
       roles("const a = 0.85;").every(([, r]) => r === ROLE.SCALE), "0.85 -> scale");
    ok("an integer in multiplicative context is a SCALE",
       roles("const a = 315 / (64 * Math.PI);").every(([, r]) => r === ROLE.SCALE), "315 and 64 -> scale");
    ok("*** ...and ARITHMETIC BEATS DEFAULT, which is why the timestep is not set to zero ***",
       roles("const dt = opts.dt || 1 / 30;").every(([, r]) => r === ROLE.SCALE),
       "read as a default it would become dt = 0, which every gate catches and which says nothing about 1/30");
    ok("an integer default with no arithmetic is a COUNT",
       roles("const n = opts.n != null ? opts.n : 4;").every(([, r]) => r === ROLE.COUNT), "4 -> count");
    ok("...and ADDITION does NOT make a count into a scale",
       roles("if (t < next - redundancy - 2) drop(t);").every(([, r]) => r === ROLE.COUNT),
       "a tick offset is not a quantity to nudge; multiplicative context only");
    ok("a formatting argument is FORMAT and gets no mutant at all",
       roles("fs.writeFileSync(F, JSON.stringify(sub, null, 2));").every(([, r]) => r === ROLE.FORMAT),
       "JSON.stringify's indent");
    ok("...and a number OUTSIDE the formatting call's parentheses is not",
       roles("const w = 8; s = x.toFixed(2);").find(([t]) => t === "8")[1] !== ROLE.FORMAT,
       "on the same line as toFixed( and not inside it");
    ok("...and the FORMAT list is short and NAMED, never inferred",
       FORMAT_CALLS.length <= 10 && FORMAT_CALLS.includes("JSON.stringify"),
       `${FORMAT_CALLS.length} named calls -- a skipped constant is never tested, so this may not be a guess`);
}

// =============================================================================================================
console.log("\n3. THE OPERATORS THEMSELVES");
{
    const one = (line, t) => mutantsFor(findConstants(line + "\n").find((c) => c.text === t));
    ok("a SCALE gets one mutant: the relative nudge scan.mjs always used",
       one("const a = 315 / 64;", "315").map((m) => m.kind).join() === "nudge",
       "kept unchanged for the case the old operator was right about");
    const cnt = one("const n = opts.n != null ? opts.n : 4;", "4");
    ok("a COUNT gets two: zero and off-by-one",
       cnt.map((m) => m.kind).sort().join() === "offByOne,zero",
       cnt.map((m) => m.kind + "->" + m.now).join(", "));
    // *** THIS ONE IS TESTED DIRECTLY, BECAUSE THE SCANNER CANNOT REACH IT. *** scan.mjs skips 0 and 1 as
    // identity/flag noise, so a count that is already zero never arrives here through findConstants. The guard
    // is still right and still tested -- a mutation that changes nothing is reported as a result, which is
    // exactly the phantom v4387 spent a round on -- but it is reached by handing mutantsFor a constant
    // directly, and saying so beats a check that quietly asserts on an empty list.
    ok("a count that is ALREADY zero is not asked to become zero",
       mutantsFor({ text: "0", code: "const n = opts.n != null ? opts.n : 0;", col: 35 })
         .every((m) => m.kind !== "zero"),
       "unreachable via findConstants (it skips 0), so exercised directly");
    ok("...and findConstants really does skip it, which is why that path needs a direct test",
       findConstants("const n = opts.n != null ? opts.n : 0;\n").length === 0,
       "0 and 1 are identity/flag noise by scan.mjs's own rule");
    ok("a FORMAT constant gets none", one("x = JSON.stringify(a, null, 2);", "2").length === 0);
}

// =============================================================================================================
console.log("\n4. *** THE CONTROL: A CONSTANT WHOSE ANSWER WAS KNOWN BEFORE THE RUN ***");
{
    // mutate.mjs's hand-picked table sets box3dLockstepNet's redundancy to 0 and has been CAUGHT every time
    // the suite has run. If the role operator had not caught it, the classifier would be wrong in the ONE case
    // with an independent answer.
    const hand = MUTATIONS.find((m) => /box3dLockstepNet/.test(m.file) && /redundancy/.test(m.find));
    ok("the hand-picked table mutates that constant to zero and calls it caught",
       !!hand && /redundancy = 0/.test(hand.replace), hand ? hand.replace : "missing");
    const row = SWEEP_BY_ROLE.constants.find((c) => /box3dLockstepNet/.test(c.file) && c.line === 38);
    const zero = row && row.mutants.find((m) => m.kind === "zero");
    ok("*** ...and the ROLE operator, choosing zero on its own, was caught too ***",
       !!zero && zero.state === "CAUGHT" && verdictOf(row) === "CHECKED",
       `role ${row.role}, zero -> ${zero.state}; under the 3% operator this same constant was ${row.before}`);
    ok("...and it was caught by the cheapest gate in the set, not by exhausting it",
       SWEEP_BY_ROLE.caughtBy["physics/box3dLockstepNet.js"] === "physics/box3d-lockstep-loss-selfcheck.mjs",
       SWEEP_BY_ROLE.caughtBy["physics/box3dLockstepNet.js"]);
}

// =============================================================================================================
console.log("\n5. WHAT THE OPERATOR CHANGE IS WORTH, PER CONSTANT AND DERIVED");
{
    const c = operatorComparison();
    ok("the same eleven constants were swept both ways",
       c.total === SWEEP_BY_ROLE.constants.length && c.beforeChecked + c.beforeSurvived === c.total,
       `${c.total} constants; before ${c.beforeChecked} checked / ${c.beforeSurvived} survivors`);
    ok("*** ...and choosing the operator by role turns three of the seven survivors into real verdicts ***",
       c.rescued.length === 3 && c.afterChecked > c.beforeChecked,
       `after: ${c.afterChecked} checked, ${c.afterSurvived} survivors, ${c.afterSkipped} skipped -- ` +
       `rescued ${c.rescued.map((r) => path.basename(r.file) + ":" + r.line).join(", ")}`);
    ok("...and the buckets still partition, with SKIPPED its own state",
       c.afterChecked + c.afterSurvived + c.afterSkipped === c.total,
       "a constant nobody should check and a constant nobody does check are different findings");
    ok("...and no count is stored beside the rows -- every number here is derived",
       !("afterChecked" in SWEEP_BY_ROLE) && !("total" in SWEEP_BY_ROLE),
       "operatorComparison() computes it from the mutant states");
    report("Three of seven were the operator's fault: maxCatchup and redundancy are caught the moment they " +
           "are set to 0, and the JSON indent is not a number anyone should check. FOUR SURVIVORS ARE REAL.");
}

// =============================================================================================================
console.log("\n6. *** AND ALL FOUR SURVIVORS ARE THE SAME SHAPE: A SHARED CONSTANT IN A DIFFERENTIAL GATE ***");
{
    const surv = SWEEP_BY_ROLE.constants.filter((c) => verdictOf(c) === "SURVIVED");
    ok("every remaining survivor is in the lockstep pair", surv.length === 4 &&
       surv.every((c) => /box3dLockstep/.test(c.file)),
       surv.map((c) => path.basename(c.file) + ":" + c.line + " " + c.was).join(", "));

    // v4389 found dt survives because the gates build two peers and compare them. This is the same, three more
    // times -- including inputDelay set to ZERO, which is a new finding rather than a restatement.
    const net = readFileSync(path.join(ENG, "physics/box3d-lockstep-net-selfcheck.mjs"), "utf8");
    const loss = readFileSync(path.join(ENG, "physics/box3d-lockstep-loss-selfcheck.mjs"), "utf8");
    ok("...and both gates that reach them compare peer A against peer B",
       /selfId: "A"/.test(net) && /selfId: "B"/.test(net) && /selfId: "A"/.test(loss) && /selfId: "B"/.test(loss),
       "a constant both peers share moves both sides of the equality");
    const delay = SWEEP_BY_ROLE.constants.find((c) => /Net/.test(c.file) && c.line === 18);
    ok("*** ...so inputDelay set to ZERO survives, which the 3% operator could never have asked ***",
       delay && delay.mutants.find((m) => m.kind === "zero").state === "SURVIVED",
       "lockstep schedules inputs AHEAD by this many ticks; at zero both peers misbehave identically");

    // *** THE SHARPENING: it is not that differential gates are blind, it is that something must break the
    // symmetry. Both catches came from the gate that injects PACKET LOSS.
    ok("*** ...and the two that ARE caught are caught by the gate that injects packet LOSS ***",
       SWEEP_BY_ROLE.caughtBy["physics/box3dLockstepNet.js"] === "physics/box3d-lockstep-loss-selfcheck.mjs" &&
       SWEEP_BY_ROLE.constants.filter((c) => /Net/.test(c.file) && verdictOf(c) === "CHECKED").length === 2,
       "redundancy governs what survives a lossy channel and maxCatchup whether a peer can catch up at all");
    report("So the rule is sharper than 'a differential gate is blind to a shared constant': it sees one only " +
           "when something BREAKS THE SYMMETRY. Loss does. dt, inputDelay, shipHalf and the window offset have " +
           "nothing that does, and pass. That is a statement about how to WRITE the missing check, not just " +
           "about which numbers lack one.");
}

// =============================================================================================================
console.log("\n7. THE CLASSIFIER IS A SYNTACTIC GUESS AND THE RECORD SAYS WHERE IT IS WRONG");
{
    const wrong = SWEEP_BY_ROLE.constants.find((c) => /MISCLASSIFIED/.test(c.note || ""));
    ok("a misclassification is recorded rather than smoothed over",
       !!wrong && wrong.role === ROLE.COUNT,
       wrong ? `${path.basename(wrong.file)}:${wrong.line} shipHalf read as a count; it is a half-extent` : "none");
    ok("...and the operator it chose was still a better question than the one it replaced",
       wrong && wrong.mutants.some((m) => m.kind === "zero"),
       "a body of half-extent 0 is a defect anyone could ship; 30 -> 30.9 is not");

    const census = roleCensus(findConstants(readFileSync(path.join(ENG, "physics/sph/kernels.js"), "utf8")));
    ok("...and a census of roles is derivable for any file, so the split is reported not asserted",
       census.scale + census.count + census.format > 0,
       `physics/sph/kernels.js: ${census.scale} scale, ${census.count} count, ${census.format} format`);

    const rows = roleMutationsFor(path.join(ENG, "brain/blobPolicyStore.js"));
    ok("...and the runner emits a SKIPPED row for a FORMAT constant, never silence",
       rows.some((r) => r.kind === "skip" && r.mutated === null),
       "an untested constant is visible in the record rather than absent from it");
}

// =============================================================================================================
console.log("\n8. THE RECORD KNOWS WHICH TREE IT IS ABOUT");
{
    let changed = null;
    try {
        const rel = SWEEP_BY_ROLE.files.map((f) => path.join("WebGLEngine", f));
        const out = execFileSync("git", ["log", "--name-only", "--format=", `${SWEEP_BY_ROLE.commit}..HEAD`, "--", ...rel],
                                 { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        changed = [...new Set(out.split("\n").map((s) => s.trim()).filter(Boolean))];
    } catch { changed = null; }
    if (changed === null) skip("git could not be asked whether the swept files moved", "no verdict, not a green one");
    else ok("no file this sweep is ABOUT has changed since the run", changed.length === 0,
            changed.length ? "CHANGED: " + changed.join(", ") : `${SWEEP_BY_ROLE.files.length} files unchanged since ${SWEEP_BY_ROLE.commit}`);
    ok("...and every file it names exists", SWEEP_BY_ROLE.files.every((f) => existsSync(path.join(ENG, f))));
}

// ---- v4390 SABOTAGES, grep-CONFIRMED APPLIED BEFORE READING, RESTORED md5-IDENTICAL -------------------------
//
// (operators.mjs 180d525664dd7c06e47e7dbc612197fb, scan.mjs 79a982a2fc0221ec0f16a2d7de302322,
//  mechanicalSweep.mjs f6b2fe9734260164ff8d3e7ab615340f -- before and after all four.)
//
//   A  roleOf reads the TRIMMED excerpt again, which is the bug the classifier shipped in its first draft.
//      -> 2 RED, and the second is the interesting one: the JSON indent stops being recognised as FORMAT, so
//      the SKIPPED row disappears from the runner's output. One mis-indexed column breaks two roles at once.
//
//   B  default beats arithmetic in roleOf. -> 4 RED. Every SCALE collapses into COUNT, including poly6's 315,
//      and dt would be set to ZERO -- which every gate catches instantly and which says nothing whatever about
//      whether 1/30 is checked. A mutation that is caught for the wrong reason is worse than one that survives.
//
//   C  FORMAT inferred from a wider list -- createESBox3D, writeFileSync, Math.max -- instead of a short named
//      one. -> 1 RED on the list's own size cap. That check exists because FORMAT is the only role that can
//      make a constant DISAPPEAR from the experiment: a wrong SCALE/COUNT still asks a question, a wrong FORMAT
//      asks none. So the guard is on the list rather than on any downstream count.
//
//   D  a COUNT gets only the off-by-one and no zero. -> 1 RED. Note how little goes red for how much is lost:
//      the recorded sweep still says redundancy was CAUGHT, because the record is a measurement and not a
//      recomputation. Section 4's control is what would have caught it on the next real run.
//
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THE FOUR SURVIVORS ARE STILL UNGUARDED. This round makes the question sharper and " +
    "fixes nothing in the lockstep pair -- dt, inputDelay, shipHalf and the history-window offset can all be " +
    "changed and every gate in the tree still passes. Section 6 says what the missing check would have to look " +
    "like (break the symmetry, or compare against an absolute the way lockstepDt does) and does not write it. " +
    "Also unchecked: the classifier against anything but these eleven constants and one file's census -- COUNT " +
    "versus SCALE is a syntactic guess, it is already known wrong on shipHalf, and the only role that MUST be " +
    "right is FORMAT, which is why that one is a named list of eight calls rather than a rule. And the three " +
    "wide files from v4389 are still unswept for the same reason: 100-plus gate sets holding gates past the " +
    "120 s cap. Eleven constants in three files is what this measures.");
process.exit(fails ? 1 : 0);
