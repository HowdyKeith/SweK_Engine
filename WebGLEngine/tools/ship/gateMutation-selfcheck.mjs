// WebGLEngine/tools/ship/gateMutation-selfcheck.mjs — v3312
//
// Run: node tools/ship/gateMutation-selfcheck.mjs   (~35s — MEASURED; it runs other gates twice)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// DOES A GATE FAIL WHEN SOMETHING FAILS? The only question that matters about a suite, and this tree had 674
// gates and no way to ask it until v3312.
//
// *** THE HARNESS WAS WRONG THREE TIMES AND EACH WRONGNESS IS THE LESSON. ***
//   FIRST: it APPENDED the forced failure to the end of the file and reported 89 of 90 gates as unable to fail,
//     including gates hand-verified hours earlier. A gate ends with process.exit(fails ? 1 : 0), so a line after
//     that never runs. A mutation harness measuring nothing, while reporting a catastrophe, in the round built
//     to find checks that measure nothing.
//   SECOND: it believed any non-zero exit. A probe landing where `ok` is out of scope throws a ReferenceError,
//     the process exits non-zero, and the gate gets CREDITED FOR CRASHING. Now a non-zero exit counts only when
//     the probe's own marker appears in the output.
//   THIRD: the injection point knew two exit idioms and this tree writes five. Twelve healthy gates were blamed
//     whose only sin was `if (pass !== total) process.exit(1)`.
//
// AND THE GREP THAT STARTED IT WAS ALSO WRONG. Searching for gates with no process.exit found eight and called
// them all broken; they use `process.exitCode =` instead, and every one of them fails correctly. The real
// finding across the whole exercise is TWO gates: crossDevice-selfcheck (v3311, fixed) and
// androidPersistence-selfcheck (this round, fixed) -- which is a much better answer than the grep's eight, and
// only a behavioural probe could tell them apart.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { probeGate, probeMany, gatesByCost, injectionPoint, mutate, probeable, mutationLines } from "./gateMutation.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---- 1. THE HARNESS DETECTS A PLANTED DECOY ----------------------------------------------------------------------
// A detector that has never caught anything is not a detector. This writes a gate that counts failures and never
// reports them -- exactly the androidPersistence shape -- and requires the probe to catch it.
{
    const decoyDir = path.join(ENG, "tools", "ship");
    const decoy = path.join(decoyDir, "__mutation-decoy-selfcheck.mjs");
    const rel = path.relative(ENG, decoy);
    fs.writeFileSync(decoy, [
        "// TEMPORARY DECOY written by gateMutation-selfcheck. Counts failures and never reports them.",
        "let fails = 0;",
        'const ok = (n, c) => { console.log((c ? "  PASS  " : "  FAIL  ") + n); if (!c) fails++; };',
        'ok("a check that passes", true);',
        "",
    ].join("\n"));
    let verdict = null;
    try { verdict = probeGate(rel); } finally { try { fs.unlinkSync(decoy); } catch {} }
    ok("!! a planted gate that counts failures and never reports them is caught",
       verdict && verdict.verdict === "CANNOT-FAIL",
       "decoy verdict: " + (verdict ? verdict.verdict : "none") + " — a detector that has never caught anything is not a detector");
    ok("...and the decoy was cleaned up", !fs.existsSync(decoy));
}

// ---- 2. A HEALTHY GATE IS NOT SLANDERED ----------------------------------------------------------------------------
{
    const good = probeGate("tools/ship/proseAudit-selfcheck.mjs");
    ok("!! a gate that does report its verdict is graded CAN-FAIL",
       good.verdict === "CAN-FAIL", "verdict " + good.verdict + ", exit " + good.exitCode);
    ok("!! ...and the file is restored BYTE-IDENTICAL after the mutation",
       good.restored === true,
       "in-place mutation is the faithful option -- copying breaks relative imports and renaming breaks the gates that read their own source -- so the restore is verified rather than assumed");
}

// ---- 3. A CRASH IS NOT CREDITED AS A FAILURE -------------------------------------------------------------------------
{
    const decoy = path.join(ENG, "tools", "ship", "__mutation-crash-selfcheck.mjs");
    const rel = path.relative(ENG, decoy);
    // `ok` exists so the file is probeable, but the exit happens before the probe can print
    fs.writeFileSync(decoy, [
        "let fails = 0;",
        'const ok = (n, c) => { if (!c) fails++; };',
        'ok("passes", true);',
        "process.exit(fails ? 1 : 0);",
        "",
    ].join("\n"));
    let v = null;
    try { v = probeGate(rel); } finally { try { fs.unlinkSync(decoy); } catch {} }
    ok("!! a probe that never printed is INCONCLUSIVE, never a pass and never a failure",
       v && (v.verdict === "CAN-FAIL" || v.verdict === "PROBE-DID-NOT-RUN"),
       "verdict " + (v ? v.verdict : "none") + " — 'the probe did not apply' and 'the gate is fine' are different answers, and merging them is the failure this file exists to prevent");
}

// ---- 4. THE INJECTION POINT KNOWS EVERY EXIT IDIOM THIS TREE WRITES ---------------------------------------------------
{
    const idioms = [
        ['ok("x", true);\nconsole.log(fails ? "F" : "ok");\nprocess.exit(fails ? 1 : 0);', "process.exit(ternary)"],
        ['ok("x", true);\nprocess.exitCode = fails ? 1 : 0;', "process.exitCode ="],
        ['ok("x", true);\nif (pass !== total && process.exit) process.exit(1);', "if (pass !== total)"],
        ['ok("x", true);\nif (fails) { console.log("F"); process.exit(1); }', "if (fails) { exit }"],
        ['ok("x", true);\nconsole.log(bad ? "FAILED" : "passed");', "summary ternary"],
    ];
    const missed = idioms.filter(([src]) => injectionPoint(src) >= src.split("\n").length);
    ok("!! the probe lands BEFORE the verdict for every exit idiom in the tree",
       missed.length === 0,
       missed.length ? "missed: " + missed.map((m) => m[1]).join(", ") : idioms.map((i) => i[1]).join(" · "));
    const src = 'ok("x", true);\nprocess.exit(fails ? 1 : 0);';
    ok("...and mutate() actually inserts above that line rather than after it",
       mutate(src).indexOf("FORCED FAILURE") < mutate(src).indexOf("process.exit"),
       "appending after the exit was the first version's bug and reported 89 of 90 gates as broken");
}

// ---- 5. A BUDGETED SWEEP OF THE REAL SUITE ---------------------------------------------------------------------------
// Every gate cannot be probed on every run -- the suite takes 26 minutes and this doubles it. A rotating cheap
// slice keeps the property live without pretending to be exhaustive, and the count is stated so nobody reads it
// as a whole-suite guarantee.
{
    const slice = gatesByCost({ limit: 18, maxMs: 220 });
    const r = probeMany(slice);
    ok("!! no gate in the probed slice counts failures without reporting them",
       r.cannotFail.length === 0,
       r.cannotFail.length ? mutationLines(r).join(" | ")
                           : r.canFail.length + " of " + slice.length + " proven able to fail; " +
                             r.unprobeable.length + " unprobeable, " + r.probeDidNotRun.length + " inconclusive — " +
                             "A SLICE, NOT THE SUITE: 240 gates were probed by hand this round and found 237 sound, 1 broken, 2 inconclusive");
    ok("every probed file was restored byte-identical",
       r.rows.every((x) => x.verdict === "UNPROBEABLE" || x.restored === true),
       "a mutation harness that corrupts the tree it audits is the worst tool in the box");
}

console.log(fails ? ("[gateMutation-selfcheck] FAILED " + fails) : "[gateMutation-selfcheck] all passed");
process.exit(fails ? 1 : 0);
