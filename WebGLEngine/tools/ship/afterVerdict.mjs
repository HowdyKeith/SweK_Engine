// WebGLEngine/tools/ship/afterVerdict.mjs -- v4835 (v4838: a shallow clone is reported NOT GRADED for the two gates that read history)
//
// Run: node tools/ship/afterVerdict.mjs [--list] [--timeout-s 900]
//
// *** THE SHIP RITUAL'S STEP 4b WAS A REGEX IN A MARKDOWN FILE, AND IT ASKED ONE OF THE TWO QUESTIONS. ***
//
// Step 4b exists because a SHIP verdict runs its gates against the timing record from BEFORE its own sweep and
// then rewrites that record, so a gate that reads the record can be green in the verdict and red on the rig
// (v4815). The step was a shell one-liner in .claude/skills/ship/SKILL.md: a regex over every gate's text,
// then a loop. Two things were wrong with that, and v4819 met the second.
//
//   1. THE REGEX MATCHED COMMENTS. labResults-selfcheck names the record only in prose and costs about
//      fifteen minutes, so the step told the person running it to "read and set aside" what it had selected.
//      Here the match is made on the source with comments stripped, so a mention in prose selects nothing.
//
//   2. IT ASKED ONLY ABOUT THE TIMING RECORD. The verdict's quick sweep runs gates under 3,000 ms. A gate over
//      that line which guards a frozen record is not run by ANY ship-time step, and v4819 shipped two of them
//      red on the merge's first verdict: world/orreryFleet.mjs's commit belt (orreryFleet-selfcheck, 20.9 s)
//      and world/universeWire.mjs's key drift (universeWire-selfcheck, 5.4 s), both moved by the vendor
//      re-vendors the merge brought. universeWire was caught only because it ALSO reads the timing record;
//      orreryFleet was caught by hand. tools/ship/recordReach.mjs already derives exactly that population --
//      `blockers`, the gates that are the only guard of a record and are too slow for the sweep -- and its
//      ratchet holds the COUNT. Nothing ran them. This does.
//
// So the step is one command: the timing-record readers (the same pattern the skill carried, now held here)
// together with recordReach's blockers, each run alone, serially, with a timeout, and every red named. It
// exits 1 on any red. It grades the tree it is run in and writes nothing.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { enumerateGates } from "./gateSweep.mjs";
import { reach, readTimings } from "./recordReach.mjs";
import { noComments } from "./sourceScan.mjs";
import { parseOrExit } from "./cliArgs.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// The pattern step 4b of .claude/skills/ship/SKILL.md carried until v4835, character for character. It lives here
// now and the skill names this command; afterVerdict-selfcheck holds both halves of that move.
export const TIMING_READER = /sweep-timings|quickSweep\.mjs|sweepCoverage\.mjs|sweepRotation\.mjs|recordReach\.mjs|declaredCost\.mjs|budgetExile\.mjs|redCensus\.mjs|timingsTarget|readTimings|capReading|gate-timings/;

const rel = (g) => path.relative(ENG, path.resolve(ENG, g)).split(path.sep).join("/");

/** Gates whose CODE (comments stripped) names the timing record or a module that reads it. */
export function timingReaders({ gates = null, read = (g) => fs.readFileSync(path.resolve(ENG, g), "utf8") } = {}) {
    const all = (gates || enumerateGates()).map(rel);
    return all.filter((g) => { try { return TIMING_READER.test(noComments(read(g))); } catch { return false; } });
}

/** The gates nothing at ship time runs that are a frozen record's only guard -- recordReach's `blockers`. */
export function recordGuardians(r = null) {
    const R = r || reach();
    return (R.blockers || []).map((b) => ({ gate: rel(b.gate), ms: b.ms, records: [...b.records] }));
}

// *** v4846 -- A THIRD KIND: A TREE-WIDE COUNT THAT A MERGE MOVES. *** definitionGates-selfcheck freezes how many exported
// symbols no gate names, over the whole tree. main went red there twice with nobody seeing it -- 709 against 703 before v4831,
// 364 against 362 before v4845 -- because the gate sat a hundred milliseconds over the sweep's line and its numbers are not
// a frozen RECORD (an exported Object.freeze) that recordReach could find, so neither list above held it. A merge is
// exactly what moves such a count: it brings modules the census has not seen. These are the gates that hold one, each with
// the constant (or file) its number lives in; afterVerdict-selfcheck finds each named in the gate's code. Over the sweep's
// line (or never timed) a gate goes on the plan; under it the sweep already runs it and it is left off.
export const TREE_RATCHETS = Object.freeze([
    Object.freeze({ gate: "tools/ship/definitionGates-selfcheck.mjs", holds: Object.freeze(["BASELINE_WIDE", "BASELINE_SHAPES", "BASELINE_OWNED"]) }),
    Object.freeze({ gate: "tools/ship/referenceKind-selfcheck.mjs", holds: Object.freeze(["orphanSets.mjs"]) }),   // v4886: the count became a recorded SET (orphanSets.RECORDED), a file the gate reads
    Object.freeze({ gate: "tools/ship/graveyard-selfcheck.mjs", holds: Object.freeze(["orphanSets.mjs"]) }),
    Object.freeze({ gate: "tools/ship/unknownNotDefault-selfcheck.mjs", holds: Object.freeze(["BASELINE"]) }),
    Object.freeze({ gate: "tools/ship/orphanScan-selfcheck.mjs", holds: Object.freeze(["orphan-baseline.json"]) }),
]);

/** The TREE_RATCHETS the quick sweep does not run: over its line in the record, or never timed. */
export function treeRatchets({ timings = null } = {}) {
    const t = timings || readTimings(ENG), budget = t.budgetMs ?? 3000;
    return TREE_RATCHETS.filter((x) => !(t.timings?.[x.gate] <= budget))
        .map((x) => ({ gate: x.gate, holds: [...x.holds], ms: t.timings?.[x.gate] ?? null }));
}

/** All three lists, joined, each gate with why it is on the plan. Sorted by path so two boxes print the same order. */
export function plan({ gates = null, read, r = null, timings = null } = {}) {
    const why = new Map();
    const add = (g, w) => { if (!why.has(g)) why.set(g, []); why.get(g).push(w); };
    for (const g of timingReaders({ gates, read })) add(g, "reads the timing record the verdict rewrote");
    for (const b of recordGuardians(r)) add(b.gate, "the only guard of " + b.records.join(", ") +
        " and over the sweep's line (" + (b.ms == null ? "never timed" : b.ms + " ms") + ")");
    for (const x of treeRatchets({ timings })) add(x.gate, "holds a tree-wide count a merge moves (" + x.holds.join(", ") +
        ") and is over the sweep's line (" + (x.ms == null ? "never timed" : x.ms + " ms") + ")");
    return [...why.keys()].sort().map((g) => ({ gate: g, why: why.get(g) }));
}

// *** v4838 -- TWO GATES READ GIT HISTORY, AND THE PUBLISH ROUTE THE TREE PRINTS CLONES --depth 1. *** Keith's rig ran this command on the v4837 clone and got two REDs after an ALL GREEN verdict:
// orreryFleet-selfcheck (29 s) and budgetExile-selfcheck (317 s). Neither was a defect in v4837. Reproduced here in a depth-1 clone of the same commit: orreryFleet-selfcheck names "0 commits" for
// the recorded prefixes and reads "1 of 1 commits touch vendor/"; budgetExile-selfcheck runs the 17 gates of v4425's census live and one of them is orreryFleet-selfcheck, so it reads the same history
// through it. Deepened with `git fetch --unshallow` (2,400 commits), both pass, unchanged. The verdict does not see it because the quick sweep skips both (over its line).
// So a shallow clone cannot grade these two, and the command now says that instead of printing a red: they are NOT GRADED, the exit code is 3 (not 0, not 1), and the line names the one command that fixes it.
export const NEEDS_HISTORY = Object.freeze({
    "tools/ship/orreryFleet-selfcheck.mjs": "measures which commit last touched each vendored body with `git log`; a depth-1 clone holds one commit",
    "tools/ship/budgetExile-selfcheck.mjs": "runs the 17 gates of v4425's census live, and orreryFleet-selfcheck is one of them (measured: red shallow, green deepened)",
});

/** Is the repository at `cwd` a shallow clone? `run` is injectable so the gate can drive both answers. */
export function isShallow({ cwd = ENG, probeMs = 20000, run = (args) => spawnSync("git", args, { cwd, encoding: "utf8", timeout: probeMs }) } = {}) {   // probeMs: a git call's limit, NOT a gate budget -- a parameter, as runAll's timeoutMs is, so tools/ship/runnerBudget-selfcheck.mjs does not read this runner as one that picks a gate limit of its own
    const r = run(["rev-parse", "--is-shallow-repository"]);
    return !!r && r.status === 0 && String(r.stdout).trim() === "true";
}

/** What the run came to: reds beat everything (1); gates that could not be graded come next (3) so a shallow clone is never read as a pass; otherwise 0. */
export function outcome({ reds = [], ungraded = [], total = 0 } = {}) {
    if (reds.length) return { code: 1, line: `${reds.length} RED -- fix before the rig is asked` + (ungraded.length ? `; ${ungraded.length} more NOT GRADED (shallow clone)` : "") };
    if (ungraded.length) return { code: 3, line: `${total - ungraded.length} green, ${ungraded.length} NOT GRADED: this clone is shallow (depth 1) and ${ungraded.map((u) => u.gate).join(", ")} read git history. Run: git fetch --unshallow   and then this command again` };
    return { code: 0, line: "all " + total + " green" };
}

/** Run each gate alone and serially. `run` is injectable so the gate can drive a red and a timeout cheaply. When `shallow`, the NEEDS_HISTORY gates are not run: they are pushed onto `ungraded` (if given). */
export function runAll(list, { timeoutMs = 900000, cwd = ENG, out = (m) => console.log(m), shallow = false, ungraded = [],
                               run = (g) => spawnSync(process.execPath, [g], { cwd, timeout: timeoutMs, stdio: "ignore" }) } = {}) {
    const reds = [];
    for (const [i, p] of list.entries()) {
        if (shallow && NEEDS_HISTORY[p.gate]) { ungraded.push({ gate: p.gate, why: NEEDS_HISTORY[p.gate] }); out(`  SKIP  ${i + 1}/${list.length}  ${p.gate}  -- needs git history; this clone is shallow (git fetch --unshallow)`); continue; }
        const t0 = Date.now();
        const r = run(p.gate);
        const ms = Date.now() - t0;
        const code = r.signal ? "killed (" + r.signal + ")" : r.status;
        if (r.status === 0 && !r.signal) out(`  ok    ${i + 1}/${list.length}  ${p.gate}  ${ms} ms`);
        else { reds.push({ gate: p.gate, code, ms, why: p.why }); out(`  RED   ${i + 1}/${list.length}  ${p.gate}  exit ${code}  ${ms} ms  -- ${p.why.join("; ")}`); }
    }
    return reds;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const cli = parseOrExit("afterVerdict", { values: { "--timeout-s": "number" }, flags: ["--list"] });
    const timeoutMs = (cli.values["--timeout-s"] || 900) * 1000;
    const p = plan(), shallow = isShallow();
    const readers = p.filter((x) => x.why.some((w) => w.startsWith("reads"))).length;
    const guards = p.filter((x) => x.why.some((w) => w.startsWith("the only guard"))).length;
    console.log(`[afterVerdict] ${p.length} gates: ${readers} read the timing record, ${guards} are a frozen record's only guard and over the sweep's line`);
    if (shallow) console.log(`[afterVerdict] this is a SHALLOW clone: ${Object.keys(NEEDS_HISTORY).join(" and ")} read git history and will be reported NOT GRADED, not run`);
    if (cli.flags.has("--list")) { for (const x of p) console.log(`  ${x.gate}  -- ${x.why.join("; ")}` + (shallow && NEEDS_HISTORY[x.gate] ? "  [needs history]" : "")); }
    else {
        const ungraded = [], reds = runAll(p, { timeoutMs, shallow, ungraded }), o = outcome({ reds, ungraded, total: p.length });
        console.log(`[afterVerdict] ${o.line}`);
        process.exitCode = o.code;
    }
}
