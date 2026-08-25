// WebGLEngine/tools/roundhouse/runtimeBench-selfcheck.mjs
//
// Run: node tools/roundhouse/runtimeBench-selfcheck.mjs
// RUNTIME 4.87s MEASURED (median of 3 -- 5171/4873/4470 -- with date(1) around the run). Section 5 spawns the
// OTHER runtime and runs the whole workload set twice, which is most of it; sections 1-4 are milliseconds. On a
// box without bun that half SKIPS and this drops to well under a second. Measured with date(1), not guessed --
// a runtime line in this tree has been wrong by 13x before.
//
// GATES tools/roundhouse/runtimeBench.mjs -- the bun-vs-node harness.
//
// *** WHAT IS GRADEABLE HERE IS THE METHOD AND THE ANSWERS, NEVER THE WINNER. *** Which runtime is faster
// depends on the box, the runtime versions and the thermal state; a gate whose correct answer depends on who
// invoked it is not a gate, which is the line tools/ship/bunSurface.mjs drew at v3966. So this file asserts:
//
//   - the harness cannot silently measure nothing (warm-up, odd reps, and the escape of every result)
//   - the two RK4 variants really are the SAME computation, or the headline comparison is between two programs
//   - every bitStable:true workload agrees bit-for-bit across the runtimes actually present
//   - the noise floor is perfLedger's MEASURED number and has not drifted away from it
//
// and it REPORTS the timings without asserting anything about them.
//
// *** THE ONE THAT MATTERS MOST IS THE DEAD-LOOP CHECK. *** A benchmark whose result nobody reads can be
// deleted by the optimiser, and it then reports the cost of deleting it -- fast, stable, and meaningless.
// runWorkloads takes a deadLoop flag for no reason other than to let section 2 prove the escape is load-bearing.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
    WORKLOADS, NOISE_FLOOR, RUNTIME, RUNTIME_KIND, runWorkloads, compareRuns, verdictFor, bitsOf,
} from "./runtimeBench.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

console.log("runtimeBench-selfcheck -- is the harness honest, and do the two runtimes agree on the numbers?\n");

// ---------------------------------------------------------------------------
console.log("1. *** EVERY WORKLOAD DECLARES WHAT IT IS FOR, AND THE SET SPANS MORE THAN ONE AXIS ***");
{
    const names = Object.keys(WORKLOADS);
    ok("there are workloads at all", names.length >= 5, names.length + ": " + names.join(", "));
    const missing = names.filter((n) => {
        const w = WORKLOADS[n];
        return typeof w.run !== "function" || typeof w.why !== "string" || w.why.length < 40 ||
               typeof w.axis !== "string" || typeof w.bitStable !== "boolean";
    });
    ok("!! every workload declares run, axis, bitStable and a REASON", missing.length === 0,
        missing.length ? "INCOMPLETE: " + missing.join(", ") : "a workload without a stated reason is a number nobody can argue with");
    const axes = [...new Set(names.map((n) => WORKLOADS[n].axis))];
    // *** ONE AXIS WOULD MAKE THIS A BENCHMARK WITH AN OPINION. *** The measured result is that the runtimes
    // have OPPOSITE strengths -- Bun calls libm faster, Node eliminates short-lived allocations better -- so a
    // set that only exercised one of them would report a winner that is an artefact of the choice of workload.
    ok("!! the set spans at least three axes, because the runtimes trade places between them",
        axes.length >= 3, axes.join(", "));
    ok("...and both sides of the allocation axis are present -- the pair IS the finding",
        names.includes("rk4-alloc") && names.includes("rk4-scalar"));
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE HARNESS CANNOT SILENTLY MEASURE NOTHING ***");
{
    let threw = false;
    try { runWorkloads({ reps: 8, only: ["sqrt"] }); } catch { threw = true; }
    ok("!! an EVEN rep count is refused -- the median must be a real sample, not an average of two",
        threw);
    let threw2 = false;
    try { runWorkloads({ reps: 3, only: ["nope"] }); } catch { threw2 = true; }
    ok("an unknown workload is refused rather than silently skipped", threw2);

    // *** THE ESCAPE CHECK. *** With deadLoop the per-rep return values are thrown away inside the runner, so
    // the sink loses them. If the sink came out the same either way, nothing would be keeping the timed loops
    // alive and every number in this file would be the cost of an optimiser deleting them.
    const live = runWorkloads({ reps: 3, warm: 1, only: ["rk4-scalar", "sqrt"] });
    const dead = runWorkloads({ reps: 3, warm: 1, only: ["rk4-scalar", "sqrt"], deadLoop: true });
    ok("!! the timed results ESCAPE into the sink -- a dead loop is measurably different",
        live.sink !== dead.sink && Number.isFinite(live.sink),
        `live sink ${live.sink.toExponential(6)} vs dead ${dead.sink.toExponential(6)}`);
    ok("...and the sink is a real number, not a NaN nobody looked at", Number.isFinite(live.sink) && live.sink !== 0);

    const r = runWorkloads({ reps: 5, warm: 2, only: ["sqrt"] });
    ok("the run records its own reps and warm-up count, so the method is arguable", r.reps === 5 && r.warm === 2);
    ok("!! min <= median <= max on every workload -- the median really is the middle sample",
        Object.values(r.results).every((v) => v.min <= v.median && v.median <= v.max));
    report("warm-up matters more than it looks: a cold JIT measures the interpreter, and the two runtimes " +
           "reach steady state at different speeds, so an unwarmed comparison measures start-up instead of work");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE TWO RK4 VARIANTS ARE THE SAME COMPUTATION, OR THE HEADLINE IS A COMPARISON OF PROGRAMS ***");
{
    const r = runWorkloads({ reps: 3, warm: 2, only: ["rk4-alloc", "rk4-scalar"] });
    ok("!! *** rk4-alloc and rk4-scalar produce BIT-IDENTICAL answers ***",
        r.results["rk4-alloc"].bits === r.results["rk4-scalar"].bits,
        r.results["rk4-alloc"].bits + " both -- so the only difference between them is that one allocates, " +
        "which is exactly what the comparison claims to isolate");
    // and they had better not be trivially zero, or "identical" would mean nothing
    ok("...and that shared answer is a real number, not zero or NaN",
        Number.isFinite(r.results["rk4-alloc"].answer) && Math.abs(r.results["rk4-alloc"].answer) > 1e-6,
        String(r.results["rk4-alloc"].answer));
    // no two workloads should return the same value by accident -- that would hide a copy-paste
    const all = runWorkloads({ reps: 3, warm: 1 });
    const bits = Object.entries(all.results).map(([n, v]) => [n, v.bits]);
    const dupes = bits.filter(([n, b], i) => bits.findIndex(([, b2]) => b2 === b) !== i)
        .filter(([n]) => n !== "rk4-scalar");     // that ONE duplicate is the deliberate control pair above
    ok("!! no OTHER pair of workloads returns the same answer -- an accidental copy would read as coverage",
        dupes.length === 0, dupes.length ? "UNEXPECTED DUPLICATES: " + dupes.map(([n]) => n).join(", ") : bits.length + " distinct");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE NOISE FLOOR IS perfLedger's MEASURED NUMBER, NOT ONE CHOSEN HERE ***");
{
    const led = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "perfLedger.mjs"), "utf8");
    ok("!! perfLedger still records the 1.35x worst-case noise range this file borrows",
        // matched as two separate facts, because perfLedger wraps the sentence across a comment line break and
        // a regex spanning "// " in the middle is a regex that breaks on the next reflow
        /1\.35/.test(led) && /variation 13%/.test(led),
        "if that measurement is ever revised, THIS goes red rather than quietly disagreeing with it");
    ok("...and NOISE_FLOOR matches it", NOISE_FLOOR === 1.35, String(NOISE_FLOOR));
    ok("!! a ratio inside the floor is reported as INDISTINGUISHABLE, in words",
        verdictFor(1.2) === "indistinguishable" && verdictFor(1 / 1.2) === "indistinguishable");
    ok("...and outside it the direction is named", verdictFor(5) === "bun-slower" && verdictFor(0.2) === "bun-faster");
    ok("...and a nonsense ratio is refused rather than rounded", verdictFor(0) === "no-measurement" && verdictFor(NaN) === "no-measurement");
    report("perfLedger's REGRESS_FACTOR is 2.0 for the same reason and against the same measurement: a " +
           "threshold under the noise fires constantly and gets switched off, which is worse than no threshold");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** THE OTHER RUNTIME: DO THE ANSWERS AGREE WHERE THEY ARE DECLARED TO ***");
{
    const other = RUNTIME_KIND === "node" ? "bun" : "node";
    const probe = spawnSync(other, ["--version"], { encoding: "utf8", timeout: 20000 });
    if (probe.error || probe.status !== 0) {
        report(`live half SKIPPED -- ${other} is not on PATH`);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-4 grade the harness, and a harness cannot show " +
               "two runtimes agree when only one of them ran");
    } else {
        const mine = runWorkloads({ reps: 5, warm: 3 });
        const p = spawnSync(other, [path.join(ENG, "tools", "roundhouse", "runtimeBench.mjs"), "--json"],
            { encoding: "utf8", timeout: 600000, env: { ...process.env, SWEK_BENCH_REPS: "5" } });
        ok(`!! ${other} ran the same harness and returned parseable results`,
            p.status === 0 && p.stdout.trim().startsWith("{"),
            p.status === 0 ? probe.stdout.trim() : "exit " + p.status + " " + (p.stderr || "").slice(0, 120));
        if (p.status === 0) {
            const theirs = JSON.parse(p.stdout);
            const cmp = compareRuns(RUNTIME_KIND === "node" ? mine : theirs, RUNTIME_KIND === "node" ? theirs : mine);

            // *** THE ASSERTION. Everything else in this section reports. ***
            const mustAgree = cmp.rows.filter((r) => r.declaredStable);
            const broke = mustAgree.filter((r) => !r.bitsAgree);
            ok("!! *** every bitStable workload agrees BIT-FOR-BIT across the two runtimes ***",
                broke.length === 0,
                broke.length ? "DISAGREE: " + broke.map((r) => `${r.name} ${r.aBits} vs ${r.bBits}`).join("; ")
                             : mustAgree.map((r) => r.name).join(", ") + " -- identical floats, not close ones");

            const mayDiffer = cmp.rows.filter((r) => !r.declaredStable);
            report("declared MAY-DIFFER workloads, reported and not asserted: " +
                mayDiffer.map((r) => r.name + " " + (r.bitsAgree ? "agreed" : "DIFFERED (rel " + r.relDiff.toExponential(1) + ")")).join(", "));
            report("ECMA-262 permits an implementation-approximated result for the transcendentals. Over 200,000 " +
                   "inputs only Math.sqrt agreed on both runtimes; cbrt, cos, sin, tan, atan, exp, log, pow, " +
                   "hypot and atan2 all differ somewhere, by 1 ulp. The tree already assumes this -- " +
                   "physics/optics/diffraction.js: 'GATED, not fingerprinted (trig is not cross-architecture)'");

            console.log();
            console.log("  " + "workload".padEnd(15) + "axis".padEnd(13) + "node ms".padStart(9) + "bun ms".padStart(9) +
                        "ratio".padStart(9) + "  verdict");
            for (const w of cmp.rows) {
                console.log("  " + w.name.padEnd(15) + w.axis.padEnd(13) + w.aMs.toFixed(2).padStart(9) +
                    w.bMs.toFixed(2).padStart(9) + (w.ratio.toFixed(2) + "x").padStart(9) + "  " + w.verdict);
            }
            const called = cmp.rows.filter((r) => r.verdict === "bun-slower" || r.verdict === "bun-faster");
            report("TIMINGS ARE REPORTED, NEVER ASSERTED. " + called.length + " of " + cmp.rows.length +
                   " workloads cleared the noise floor in either direction on this box; the rest are a tie. " +
                   "The spread across the ones that cleared it is what makes a single 'bun is Nx' claim false");
        }
    }
}

// ---------------------------------------------------------------------------
console.log("\n6. *** IT RUNS UNDER BOTH RUNTIMES, WHICH MEANS IT CANNOT IMPORT LIKE A NODE SCRIPT ***");
{
    const src = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "runtimeBench.mjs"), "utf8");
    const top = [...src.matchAll(/^\s*import[^"']*["']([^"']+)["']/gm)].map((m) => m[1]);
    ok("!! the module has NO top-level import at all -- not even node:", top.length === 0,
        top.length ? "TOP-LEVEL: " + top.join(", ") : "so a browser, Bun and Node all evaluate it identically");
    ok("...and the node: imports it does use are inside the process guard",
        /typeof process !== "undefined"/.test(src) && /await import\("node:url"\)/.test(src),
        "v3951's lesson: a bare node: specifier is resolved BEFORE a line of the module runs, so an unguarded " +
        "one kills the module in a browser with a CORS error rather than a caught failure");
    ok("does not touch the DOM either", !/\bwindow\.|\bdocument\./.test(src));
    ok("!! and it spawns nothing unless asked for --compare",
        /--compare/.test(src) && src.indexOf('await import("node:child_process")') > src.indexOf('--compare'),
        "child_process is one of the surfaces bunSurface.mjs flags as weakest under Bun on Windows; a harness " +
        "that reached for it on every run could not run on the box it is meant to measure");
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS") + "   (harness graded under " + RUNTIME + ")");
process.exit(fails ? 1 : 0);
