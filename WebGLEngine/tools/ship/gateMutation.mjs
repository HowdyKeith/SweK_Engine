// WebGLEngine/tools/ship/gateMutation.mjs — v3312
// ---------------------------------------------------------------------------------------------------------------
// DOES A GATE ACTUALLY FAIL WHEN SOMETHING FAILS? — the only question that matters about a test suite, and this
// tree had 674 gates and no way to ask it.
//
// v3311 found ONE gate that could not fail, by accident: crossDevice-selfcheck exited on its failure counter
// partway down and then printed "all checks pass" unconditionally at the bottom, so six checks below that line
// printed FAIL and exited zero. Going looking afterwards found EIGHT MORE, each counting failures into a
// variable it never read again.
//
// *** AND A GREP CANNOT ANSWER THIS. *** Searching for gates with no process.exit found those eight and missed
// crossDevice entirely, because crossDevice HAD one -- in the wrong place. Searching for the `fails` idiom
// flagged 79 gates of which ~71 were false positives that spell it `fail`, or `bad`, or count differently. The
// property is behavioural: inject a failure, and see whether the process says so. So that is what this does.
//
// THE MUTATION IS APPLIED IN PLACE AND RESTORED FROM A BYTE-EXACT BACKUP. Copying a gate elsewhere would break
// its relative imports, and renaming it would break the gates that read their own source -- several do. In-place
// is the faithful option, so the restore is verified byte-for-byte and a mismatch is reported as a hard error
// rather than a warning: a mutation harness that corrupts the tree it audits is the worst tool in the box.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Appended to the end of the gate. `ok` is the near-universal assertion name here; gates using another name are
// reported as UNPROBEABLE rather than quietly passed, because "the probe did not apply" and "the gate is fine"
// are different answers and merging them is the exact failure this file exists to prevent.
export const PROBE = '\nok("FORCED FAILURE (gateMutation probe)", false, "injected by tools/ship/gateMutation.mjs");\n';

export function probeable(src) {
    return /(?:^|\s)(?:const|let|var|function)\s+ok\b/.test(src) || /\bconst\s+ok\s*=/.test(src);
}

/**
 * WHERE THE PROBE GOES, AND THE FIRST VERSION OF THIS HARNESS GOT IT WRONG IN THE MOST INSTRUCTIVE WAY.
 *
 * It APPENDED the forced failure to the end of the file and reported 89 of 90 gates as unable to fail --
 * including gates written and hand-verified hours earlier. The probe was dead code: a gate ends with
 * `process.exit(fails ? 1 : 0)`, so a line after that never runs. A mutation harness that measures nothing,
 * while reporting a catastrophe, in the round built to find checks that measure nothing.
 *
 * The probe must land BEFORE the verdict: immediately above the first top-level line that reports or exits.
 */
export function injectionPoint(src) {
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        // ANY top-level line that decides the exit status, whatever idiom it uses. This tree writes at least
        // five: `if (fails) {...process.exit(1)}`, `process.exit(fails ? 1 : 0)`, `process.exitCode = fails ? 1
        // : 0`, `if (pass !== total && process.exit) process.exit(1)`, and a bare summary console.log with a
        // ternary. Each of the first four was found only after the harness misreported gates that used it -- the
        // second run blamed twelve healthy gates whose only sin was `if (pass !== total)`.
        if (/^\s{0,2}\S/.test(l) && /process\.exit(?:Code)?\b/.test(l)) return i;
        if (/^\s{0,2}(?:if\s*\(\s*fail|if\s*\(\s*bad|console\.log\(\s*fail|console\.log\(\s*bad)/.test(l)) return i;
        // the common `console.log(x ? "...FAILED..." : "...passed")` summary line
        if (/^\s{0,2}console\.log\(/.test(l) && /(FAIL|failed|FAILURES)/.test(l) && /\?/.test(l)) return i;
    }
    return lines.length;
}

export function mutate(src) {
    const lines = src.split(/\r?\n/);
    const at = injectionPoint(src);
    lines.splice(at, 0, PROBE.trim());
    return lines.join("\n");
}

/**
 * Mutate one gate, run it, restore it. Returns { verdict, exitCode, restored }.
 *   CAN-FAIL      -- injected failure produced a non-zero exit. The gate works.
 *   CANNOT-FAIL   -- injected failure and the process still exited 0. The gate is a decoration.
 *   UNPROBEABLE   -- no ok() to hook, so the probe says nothing either way.
 *   TIMEOUT/ERROR -- the run did not complete; reported, never counted as passing.
 */
export function probeGate(relPath, { timeoutMs = 120000, node = process.execPath } = {}) {
    const abs = path.join(ENG, relPath);
    const original = fs.readFileSync(abs, "utf8");
    if (!probeable(original)) return { gate: relPath, verdict: "UNPROBEABLE", why: "no ok() assertion helper to hook" };

    // *** A THROWN PROBE LOOKS EXACTLY LIKE A WORKING GATE, AND THAT NEARLY SHIPPED. *** If the probe lands
    // somewhere `ok` is not in scope it raises a ReferenceError, the process exits non-zero, and a naive reading
    // calls that CAN-FAIL -- crediting the gate for crashing. voxelRLE-selfcheck, which was hand-proven unable to
    // fail minutes earlier, was reported healthy by exactly this mistake. So a non-zero exit is only believed
    // when the probe's own marker appears in the OUTPUT: the injected assertion has to have actually run and
    // been counted, not merely have blown the process up on its way past.
    let exitCode = null, timedOut = false, out = "";
    try {
        fs.writeFileSync(abs, mutate(original));
        try {
            out = String(execFileSync(node, [abs], { timeout: timeoutMs, stdio: "pipe", cwd: ENG }) || "");
            exitCode = 0;
        } catch (e) {
            if (e && e.killed) timedOut = true;
            out = String((e && e.stdout) || "") + String((e && e.stderr) || "");
            exitCode = e && typeof e.status === "number" ? e.status : (timedOut ? null : 1);
        }
    } finally {
        // RESTORE FIRST, VERIFY SECOND, and report a bad restore as an error rather than a note.
        fs.writeFileSync(abs, original);
    }
    const restored = fs.readFileSync(abs, "utf8") === original;
    if (!restored) return { gate: relPath, verdict: "RESTORE-FAILED", restored, why: "the harness could not put the file back — investigate before running anything else" };
    if (timedOut) return { gate: relPath, verdict: "TIMEOUT", restored, why: "did not finish inside the probe budget; says nothing about whether it can fail" };
    const probeRan = out.includes("FORCED FAILURE (gateMutation probe)");
    if (!probeRan) return { gate: relPath, verdict: "PROBE-DID-NOT-RUN", exitCode, restored,
        why: exitCode === 0
            ? "the injected assertion never printed and the gate exited 0 -- it was placed after an exit, so this says nothing"
            : "the gate exited non-zero WITHOUT the probe printing, i.e. it crashed rather than failed; crediting that would reward a broken gate" };
    return { gate: relPath, verdict: exitCode === 0 ? "CANNOT-FAIL" : "CAN-FAIL", exitCode, restored };
}

/** Probe a list of gates, cheapest first if timings are available. */
export function probeMany(gates, opts = {}) {
    const rows = [];
    for (const g of gates) rows.push(probeGate(g, opts));
    const by = (v) => rows.filter((r) => r.verdict === v);
    return { rows, canFail: by("CAN-FAIL"), cannotFail: by("CANNOT-FAIL"),
             unprobeable: by("UNPROBEABLE"), timeout: by("TIMEOUT"), restoreFailed: by("RESTORE-FAILED"),
             probeDidNotRun: by("PROBE-DID-NOT-RUN") };
}

/** Gates ordered by observed runtime, so a budgeted probe covers as many as possible. */
export function gatesByCost({ limit = null, maxMs = null } = {}) {
    let timings = {};
    try { timings = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "gate-timings.json"), "utf8")).timings || {}; } catch {}
    const all = Object.keys(timings).filter((g) => fs.existsSync(path.join(ENG, g)));
    const sorted = all.sort((a, b) => (timings[a] || 1e9) - (timings[b] || 1e9));
    const capped = maxMs == null ? sorted : sorted.filter((g) => (timings[g] || 1e9) <= maxMs);
    return limit == null ? capped : capped.slice(0, limit);
}

export function mutationLines(r) {
    const out = [];
    out.push(`probed ${r.rows.length}: ${r.canFail.length} can fail, ${r.cannotFail.length} CANNOT, ${r.unprobeable.length} unprobeable, ${r.probeDidNotRun.length} inconclusive, ${r.timeout.length} timed out`);
    for (const c of r.cannotFail) out.push(`  CANNOT FAIL: ${c.gate} — an injected failure printed and still exited 0`);
    for (const c of r.probeDidNotRun) out.push(`  INCONCLUSIVE: ${c.gate} — ${c.why}`);
    for (const c of r.restoreFailed) out.push(`  RESTORE FAILED: ${c.gate} — ${c.why}`);
    return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : 60;
    const maxMs = args.includes("--maxMs") ? Number(args[args.indexOf("--maxMs") + 1]) : 1200;
    const explicit = args.filter((a) => a.endsWith(".mjs"));
    const gates = explicit.length ? explicit : gatesByCost({ limit, maxMs });
    console.log(`[gateMutation] probing ${gates.length} gate(s)`);
    const r = probeMany(gates);
    for (const l of mutationLines(r)) console.log(l);
}
