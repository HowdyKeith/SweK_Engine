// WebGLEngine/tools/ship/failLines.mjs -- v4647
//
// Run: node tools/ship/failLines.mjs --from <verify-output.txt> [--write] [--timeout-s 120]
//      node tools/ship/failLines.mjs --gates a-selfcheck.mjs,b-selfcheck.mjs [--write]
//
// *** AN EXIT CODE IS NOT A FINDING, AND FOR FOUR ROUNDS THAT IS ALL A SECOND BOX COULD SEND BACK. ***
//
// tools/ship/verify.mjs reports a red gate as a PATH AND AN EXIT CODE, because it spawns gates and collects
// status. That is the right thing for a ship gate and it is useless for diagnosis: "48 NEW red" on another
// machine cannot be classified, compared against this box, or told apart from the same 48 failing for
// forty-eight different reasons. Every round that tried went through a person copying terminal output by
// hand, which is the thing this tree refuses to accept as a measurement.
//
// So: run the named gates ALONE, capture what they print, and keep the assertion lines.
//
// *** SERIAL, AND THAT IS THE WHOLE POINT RATHER THAN A PERFORMANCE CHOICE. *** redCensus.mjs's header
// records that an 8-way sweep reported 46 red and re-running those 46 one at a time turned SEVEN green --
// clock-sensitive gates starved by the other workers. Keith's Windows box reports 143 gates "false red" by
// that same definition, red under -P and green alone, which is 11% of the swept population. A diagnosis run
// that reproduced the contention would be measuring the runner.
//
// *** AND THE OUTPUT SEPARATES A FINDING FROM A CRASH, BECAUSE THIS TREE HAS CONFUSED THEM SIX TIMES. ***
// A gate that exits non-zero having printed ZERO "  FAIL" lines did not find anything -- it DIED. Six times
// this session a sabotage produced exit 1 with no failing row (an eager detail string that threw, a helper
// that was not defined on that platform, a row that called the thing it was testing for absence of). The
// ship ritual's own rule is `grep -c '^  FAIL'`, never `grep -c FAIL`, for the same reason, and that rule is
// implemented here rather than described: CRASHED is its own verdict, first-class, not a footnote.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { boxId } from "./hostScale.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// *** v4647b -- ONE PATH AND TWO BOXES WAS THE WHOLE DEFECT THE PREVIOUS ROUND FIXED, REBUILT HERE. ***
//
// The first version wrote tools/ship/fail-lines.json. Both boxes then wrote it, this one committed it, and
// Keith's `git pull` aborted -- "untracked working tree files would be overwritten by merge" -- which is the
// sweep-timings failure verbatim, in the tool built to make cross-box comparison possible, one round after
// that lesson. His capture and this one are DIFFERENT MEASUREMENTS of different machines and must not share
// a name.
//
// *** AND A CAPTURE OF GATE OUTPUT IS NOT ENGINE SOURCE, WHICH THE TREE PROVED WITHIN A MINUTE. ***
// The record quotes failing rows verbatim. reachedLicences-selfcheck walks every .js/.mjs/.glsl/.html/.css/
// .json under WebGLEngine looking for publisher names a vendored copy would carry -- and Keith's capture,
// which quotes THAT GATE'S OWN FAILING ROWS, carried all three of its tokens. The record was flagged as an
// unlicensed copy of the thing it was reporting on. That is v4480's "five suspects in the gate that hunted
// them" arriving from the other direction, and it would hit every text census in the tree, not just this one.
//
// *** AND WRITING THAT PARAGRAPH REPRODUCED IT. *** The first draft SPELLED the three tokens to explain the
// failure, so this file and its gate were flagged next -- prose about a text census is census-visible text.
// playwrightResolve-selfcheck learned the same thing and builds its needle by concatenation "per v4409's
// rule that a fixture is not a gate". Here the answer is simpler: the tokens are described, never spelled.
//
// So captures live OUTSIDE the engine tree, at the repository root, one file per box. Every census walks from
// WebGLEngine down, so nothing has to be taught to skip them -- which matters because those SKIP rules are
// copied per gate rather than shared, and widening the shared one would re-drift every census this session
// just re-derived.
export const CAPTURE_DIR = "captures";
export function captureFile(id = boxId()) { return path.join(CAPTURE_DIR, `fail-lines.${id}.json`); }

// The ritual's rule, in code: a failing ROW starts the line. "FAIL" inside prose is not a finding, and
// counting it is how a gate with one red row and four mentions of the word reads as five failures.
export const FAIL_LINE = /^ {2}FAIL(?: |$)/;

/** The gates a verify run called NEW RED, parsed from its own output. */
export function gatesFromVerify(text) {
    const out = [];
    for (const m of String(text || "").matchAll(/NEW RED:\s*(.*)/g)) {
        // "<path> exit <code>, <path> exit <code>, ... -- fix it or register it in redCensus.mjs"
        const body = m[1].split(" -- fix it")[0];
        for (const part of body.split(",")) {
            const g = part.trim().match(/^(\S+?)\s+exit\s+(-?\d+)$/);
            if (g) out.push({ gate: g[1], sweepExit: Number(g[2]) });
        }
    }
    return out;
}

/**
 * One gate, run alone. Returns { gate, exit, ms, fails, lines, verdict }.
 *
 * `verdict` is the part a person reads:
 *   GREEN    exit 0
 *   RED      exit non-zero AND at least one "  FAIL" line -- the gate found something and said what
 *   CRASHED  exit non-zero and NO failing row -- the gate died, and whatever it was checking is UNKNOWN
 *   ODD      exit 0 with failing rows -- a gate that prints FAIL and returns success, which is its own bug
 */
export function runOne(rel, { root = ENG, timeoutMs = 120000, spawn = spawnSync } = {}) {
    const t0 = Date.now();
    const r = spawn(process.execPath, [path.join(root, rel)],
        { cwd: root, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
    const ms = Date.now() - t0;
    const text = String(r.stdout || "") + String(r.stderr || "");
    const lines = text.split(/\r?\n/).filter((l) => FAIL_LINE.test(l)).map((l) => l.trim());
    // A killed gate has status null and a signal; that is a CRASH by any reading, and reporting it as exit 0
    // would turn a timeout into a pass.
    const exit = r.status == null ? (r.signal ? 124 : 1) : r.status;
    // *** v4647c -- A TIMEOUT IS NOT A CRASH, AND CALLING IT ONE SENT ME TO READ THE WRONG THING. ***
    // redCensus-selfcheck came back "CRASHED, exit 3221226505"-shaped -- exit 124, SIGTERM, 120,107 ms -- and
    // the report told me to read it first because what it was checking was UNKNOWN. It was not unknown: that
    // gate RE-RUNS other gates and simply needs longer than this tool's default cap. A crash means read the
    // code; a timeout means raise --timeout-s. Conflating them costs a detour every time, and it cost one
    // within an hour of the tool existing.
    const killed = r.status == null && !!r.signal;
    const verdict = killed ? "TIMEOUT"
                   : exit === 0 ? (lines.length ? "ODD" : "GREEN")
                                : (lines.length ? "RED" : "CRASHED");
    return { gate: rel, exit, ms, fails: lines.length, lines, verdict,
             ...(r.signal ? { signal: r.signal } : {}) };
}

/**
 * *** WHICH TREE THESE READINGS WERE TAKEN AGAINST, BECAUSE A CAPTURE THAT CANNOT SAY IS NOT COMPARABLE. ***
 *
 * v4647 spent a round on sweep-timings.json having fifteen keys and none naming its box, and this file --
 * written the round before -- recorded `at` and `platform` and not the COMMIT. The first real capture proved
 * why that matters: it was taken at 58603dcf and lands in a commit whose parent is 0bd8ff5d, so the file
 * would read as a measurement of a tree in which five of its reds had already been repaired.
 *
 * Best-effort by design: a capture on a box with no git, or in a tree with uncommitted work, is still a
 * capture. `dirty` is recorded rather than refused, because a red found on a modified tree is still a red
 * and hiding it would be worse than qualifying it.
 */
export function treeStamp({ root = ENG, run = spawnSync } = {}) {
    const git = (args) => {
        try {
            const r = run("git", args, { cwd: root, encoding: "utf8", timeout: 10000 });
            return r.status === 0 ? String(r.stdout || "").trim() : null;
        } catch { return null; }
    };
    const commit = git(["rev-parse", "HEAD"]);
    if (!commit) return { commit: null, branch: null, dirty: null, why: "git could not answer here" };
    const status = git(["status", "--porcelain"]);
    return { commit: commit.slice(0, 12), branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
             dirty: status == null ? null : status.length > 0 };
}

export function summarise(rows) {
    const by = { GREEN: 0, RED: 0, CRASHED: 0, ODD: 0, TIMEOUT: 0 };
    for (const r of rows) by[r.verdict]++;
    return { of: rows.length, ...by, totalFailRows: rows.reduce((a, r) => a + r.fails, 0) };
}

export function describe(rows) {
    const s = summarise(rows);
    const out = [`[failLines] ${s.of} gate(s) run ALONE: ${s.GREEN} green, ${s.RED} red with rows, ` +
                 `${s.CRASHED} CRASHED with no row at all, ${s.TIMEOUT} TIMED OUT at the cap, ` +
                 `${s.ODD} exited 0 while printing a failing row. ${s.totalFailRows} failing row(s) in total.`];
    if (s.GREEN) out.push(`[failLines] the ${s.GREEN} green one(s) were red in the sweep and pass alone -- ` +
                          `contention, not a finding. That is redCensus's two-phase rule doing its job.`);
    if (s.CRASHED) out.push(`[failLines] *** ${s.CRASHED} CRASHED: exit non-zero with no failing row, so what ` +
                            `they were checking is UNKNOWN rather than false. Read these first.`);
    if (s.TIMEOUT) out.push(`[failLines] ${s.TIMEOUT} TIMED OUT at this tool's cap -- not a finding about the ` +
                            `gate. Re-run those with a larger --timeout-s before reading anything into them.`);
    for (const r of rows) {
        if (r.verdict === "GREEN") continue;
        out.push(`  ${r.verdict.padEnd(7)} ${r.gate}  exit ${r.exit}${r.signal ? " (" + r.signal + ")" : ""}  ${r.ms} ms  ${r.fails} row(s)`);
        for (const l of r.lines.slice(0, 6)) out.push(`      ${l.slice(0, 200)}`);
        if (r.lines.length > 6) out.push(`      ... ${r.lines.length - 6} more`);
    }
    return out.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
    const from = arg("--from", null), gatesArg = arg("--gates", null);
    const timeoutMs = Number(arg("--timeout-s", 120)) * 1000;
    let gates = [];
    if (from) {
        let text = "";
        try { text = fs.readFileSync(path.isAbsolute(from) ? from : path.join(ENG, from), "utf8"); }
        catch (e) { console.error(`[failLines] cannot read ${from}: ${e.message}`); process.exit(2); }
        gates = gatesFromVerify(text).map((g) => g.gate);
        if (!gates.length) { console.error(`[failLines] ${from} carries no "NEW RED:" list -- nothing to run`); process.exit(2); }
    } else if (gatesArg) {
        gates = gatesArg.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
        console.error("[failLines] give --from <verify output> or --gates a,b,c"); process.exit(2);
    }
    console.log(`[failLines] ${gates.length} gate(s), run ONE AT A TIME (see this file's header for why)`);
    const rows = [];
    for (const g of gates) {
        const r = runOne(g, { timeoutMs });
        rows.push(r);
        process.stderr.write(`[failLines] ${rows.length}/${gates.length}  ${r.verdict.padEnd(7)} ${g}  ${r.fails} row(s)  ${r.ms} ms\n`);
    }
    console.log(describe(rows));
    if (process.argv.includes("--write")) {
        const stamp = treeStamp();
        const REPO = path.resolve(ENG, "..");
        const out = path.join(REPO, captureFile());
        fs.mkdirSync(path.dirname(out), { recursive: true });
        const payload = { generatedFrom: "tools/ship/failLines.mjs", at: new Date().toISOString(),
                          platform: process.platform, box: boxId(), tree: stamp,
                          summary: summarise(rows), gates: rows };
        fs.writeFileSync(out, JSON.stringify(payload, null, 1) + "\n");
        const st = stamp;
        console.log(`[failLines] wrote ${captureFile()} for ${boxId()} at ${st.commit || "an unknown commit"}` +
                    `${st.dirty ? " (WORKING TREE DIRTY -- these reds include uncommitted changes)" : ""} -- ` +
                    `commit it FROM THIS BOX and the reds can be compared against another machine's by ` +
                    `assertion rather than by exit code`);
    } else {
        console.log("[failLines] nothing written; pass --write to record this run");
    }
    // The tool's own exit says whether IT worked, not whether the gates did: a diagnosis run that fails
    // because it found failures cannot be used in a pipeline.
    process.exit(0);
}
