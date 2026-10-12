// WebGLEngine/tools/ship/shipVerdict.mjs
//
// v4405 -- *** VERIFY SAID "DO NOT SHIP" AND THE ROUND SHIPPED ANYWAY, BECAUSE THE DECISION WAS READ OFF A
// LOG TAIL INSTEAD OF AN EXIT CODE. ***
//
// v4404 was committed, pushed, and fast-forwarded onto main with THREE CONFLICT MARKERS still in it -- in
// main.js, brain/brain.js and tools/ship/gateSweep.mjs. verify.mjs did its job: it printed
// "1 FAILURE(S) -- DO NOT SHIP" and exited 1. The ritual step that reads it is written as "Must end
// [verify] ALL GREEN", and it was run as one `&&` chain whose git steps keyed off the tail of the log rather
// than off `$?`. The chain saw text, not a status, and pushed.
//
// This is v4392's finding at the ritual's own level: A COUNT (or a line) IS NOT A VERDICT UNLESS THE PROCESS
// FINISHED AND SAID SO IN ITS STATUS. The fix is not to read more carefully. It is to make the last line of
// the ship step BE GENERATED FROM THE EXIT CODE, so that reading the tail is reading the code -- the same
// discipline docs/EXPLAIN-ITSELF.md applies to gates: the summary comes from the same object as the argument,
// so it cannot drift from it.
//
// Two independent conditions, because the tail was only half of what went wrong:
//   1. verify's exit status is 0 AND its tail agrees. Disagreement in EITHER direction is NO VERDICT, not a
//      pass -- an exit 0 under a tail that says failure is as untrustworthy as the reverse.
//   2. No tracked file carries a conflict marker. That is the artifact that actually escaped, and it is
//      cheap, absolute, and needs no list.
"use strict";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { ensureDxc, describe as describeDxc } from "./ensureDxc.mjs";
import { plan as afterVerdictPlan } from "./afterVerdict.mjs";

// Anchored at line start and followed by a space -- the shape git writes. An unanchored match would trip on
// prose about conflict markers and on any file that mentions one mid-line; this round's changelog is such a
// file, and a detector that flagged the note describing the defect would be the shader census's mistake again.
export const MARKER_KINDS = Object.freeze(["<<<<<<<", "|||||||", ">>>>>>>"]);
const MARKER_RE = /^(<{7}|\|{7}|>{7}) /;

export function conflictMarkers(src) {
    const out = [];
    const lines = String(src).split("\n");
    for (let i = 0; i < lines.length; i++) {
        const m = MARKER_RE.exec(lines[i]);
        if (m) out.push({ line: i + 1, kind: m[1] });
    }
    return out;
}

// Binary and vendored bytes are read as utf8 and simply will not match; the cost of reading them is a second
// on 28 MB, which is cheaper than maintaining an exclusion list that could hide the one file that matters.
const SKIP_DIR = /(^|\/)(node_modules|\.git)(\/|$)/;

export function trackedFiles(root) {
    const out = execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 64 << 20 });
    return out.toString("utf8").split("\0").filter((f) => f && !SKIP_DIR.test(f));
}

export function scanTracked(root, files = null) {
    const list = files || trackedFiles(root);
    const hits = [];
    for (const f of list) {
        let src;
        try { src = fs.readFileSync(path.join(root, f), "utf8"); } catch { continue; }
        if (src.indexOf("<<<<<<< ") < 0 && src.indexOf(">>>>>>> ") < 0 && src.indexOf("||||||| ") < 0) continue;
        const marks = conflictMarkers(src);
        if (marks.length) hits.push({ file: f, marks });
    }
    return { scanned: list.length, hits };
}

// v4846 -- git's exit status, or null when git could not be started at all (no git on the box, no such folder). The two
// questions below are asked by STATUS because git's wording differs by subcommand and the status does not: v4402's skip
// matched "unknown revision", which is what `git log` says, and `git grep` says "unable to resolve revision".
function gitStatus(cwd, args) {
    try { return spawnSync("git", args, { cwd, stdio: "ignore", timeout: 15000 }).status; } catch { return null; }
}

// A ref, not the working tree: v4404's tree was clean by the time anybody looked, and what shipped was not.
//
// v4846 -- *** A REF THIS CLONE DOES NOT HAVE IS DECIDED BY GIT'S EXIT STATUS, NOT BY ITS WORDS. *** A ref git could not
// resolve came back as { ok:false, why: e.message }, and the selfcheck excused it only when the message matched
// /unknown revision|not a valid object|ambiguous argument/ -- while git grep says "fatal: unable to resolve revision:
// origin/main". So a `--depth 1 --branch` clone, which never had origin/main, was red on a fact about the clone. `rev-parse
// --verify --quiet` exits 1, silently, for exactly "no such commit" and 128 for anything else (not a repository, a broken
// one), so `absent` is that 1 and nothing wider; every other failure still reaches git grep and keeps its message.
export function scanRef(root, ref) {
    if (gitStatus(root, ["rev-parse", "--verify", "--quiet", ref + "^{commit}"]) === 1)
        return { ref, ok: false, absent: true, why: `${ref} is not in this clone`, hits: [] };
    let out;
    try {
        // v4846 -- stderr piped: git's "fatal:" belongs in `why`, not loose on the stderr of the gate that asked
        out = execFileSync("git", ["grep", "-c", "-E", "^(<{7}|>{7}|\\|{7}) ", ref, "--", "."],
                           { cwd: root, maxBuffer: 32 << 20, stdio: ["ignore", "pipe", "pipe"] }).toString("utf8");
    } catch (e) {
        // git grep exits 1 for "no matches", which is the clean answer, and 128 for what it cannot do -- a ref that is not
        // here never reaches it (rev-parse above), so 128 now means a repository git cannot open or a ref it cannot read.
        if (e && e.status === 1) return { ref, ok: true, hits: [] };
        const said = String((e && e.stderr) || "").trim().split("\n")[0];
        return { ref, ok: false, why: (said || String(e && e.message)).slice(0, 120), hits: [] };
    }
    const hits = out.split("\n").filter(Boolean).map((l) => {
        const i = l.lastIndexOf(":");
        return { file: l.slice(0, i).replace(ref + ":", ""), count: Number(l.slice(i + 1)) };
    });
    return { ref, ok: true, hits };
}

export const TAIL_GREEN = /\[verify\]\s+ALL GREEN/;

// The whole point of the file. `code` is the process's exit status -- null when it never produced one, which
// is a crash or a kill and is emphatically not a pass.
export function verdict({ code, tail }) {
    const green = TAIL_GREEN.test(String(tail || ""));
    if (code === null || code === undefined)
        return { ship: false, agrees: false, reason: "NO VERDICT: verify did not finish -- no exit status" };
    if (code === 0 && green) return { ship: true, agrees: true, reason: "verify exited 0 and its tail agrees" };
    if (code !== 0 && !green) return { ship: false, agrees: true, reason: `verify exited ${code} and reported failures` };
    if (code !== 0 && green)
        return { ship: false, agrees: false, reason: `NO VERDICT: tail says ALL GREEN, exit status is ${code}` };
    return { ship: false, agrees: false, reason: "NO VERDICT: exit status is 0, tail does not say ALL GREEN" };
}

export function decide({ verify, conflicts }) {
    const v = verdict(verify);
    if (!v.ship) return { ship: false, reason: v.reason };
    if (conflicts && conflicts.hits.length)
        return { ship: false, reason: "conflict marker(s) in " + conflicts.hits.map((h) => h.file).join(", ") };
    return { ship: true, reason: v.reason + `, and ${conflicts ? conflicts.scanned : 0} tracked files carry no conflict marker` };
}

export function runProcess(cmd, argv, opts = {}) {
    return new Promise((resolve) => {
        const p = spawn(cmd, argv, { cwd: opts.cwd, env: { ...process.env, ...(opts.env || {}) } });
        if (opts.onChild) opts.onChild(p);
        let out = "";
        const keep = (b) => { out += b; if (out.length > 200000) out = out.slice(-100000); if (opts.echo) process.stderr.write(b); };
        p.stdout.on("data", keep);
        p.stderr.on("data", keep);
        p.on("close", (code) => resolve({ code, tail: out.split("\n").filter((l) => l.trim()).slice(-6).join("\n") }));
        p.on("error", (e) => resolve({ code: null, tail: String(e && e.message) }));
    });
}

// *** v4680 -- A RUN THAT IS ENDED FROM OUTSIDE STILL SAYS SO, WHERE IT CAN. ***
//
// Keith's v4679 rig log ended at "[verify] quick sweep 1413/1413" with no trailer at all, and "the window exited
// without stated result". The file header above says a missing exit status is NO VERDICT -- but that rule lived
// in verdict(), which only runs if this process survives to call it, so the one case it exists for printed
// nothing. Some endings CAN be caught: on Windows a closed console window arrives as SIGHUP (with a few seconds'
// grace), Ctrl+C as SIGINT and Ctrl+Break as SIGBREAK; SIGTERM is the polite kill everywhere. Each now writes
// the trailer, naming the signal and how long the run had been going, and exits nonzero. What CANNOT be caught
// is TerminateProcess -- `taskkill /F`, a job-object kill, Task Manager's End task -- and a power loss; those
// still leave no trailer, and with this change the ABSENCE of one now means exactly that set.
export const CATCHABLE = Object.freeze(["SIGINT", "SIGHUP", "SIGBREAK", "SIGTERM"]);
const SIGNAL_MEANS = Object.freeze({
    SIGINT: "Ctrl+C in the console", SIGHUP: "the console window was closed",
    SIGBREAK: "Ctrl+Break in the console", SIGTERM: "a polite kill from another process",
});

export function interruptedTrailer(sig, ms, conflicts = null) {
    return [
        "",
        `[ship] verify exit=none  interrupted by ${sig} after ${Math.round(ms / 1000)} s` +
            (conflicts ? `  conflicts=${conflicts.hits.length}/${conflicts.scanned} files` : ""),
        `[ship] DO NOT SHIP -- NO VERDICT: shipVerdict received ${sig} (${SIGNAL_MEANS[sig] || "a signal"}) before verify finished`,
    ].join("\n");
}

// *** v4833 -- A BOX THAT CANNOT RUN THE BROWSER GATES IS TOLD SO BEFORE THE SWEEP, NOT BY IT. ***
//
// Keith's clone-verify of v4819 ran 898 s and ended DO NOT SHIP on 104 new reds. 103 were ONE fact about the box:
// the hand-typed clone route had no `npm install` in tools/render-qa, so Playwright did not resolve. verify printed
// that fact once per gate, each copy with its fix at the end of a skip line, and no register names those reds, so
// the run could not have passed. v4826's verify went DO NOT SHIP on four more that were one fact too: a fresh
// install's Chrome folder with no dxcompiler.dll beside the headless shell, which tools/ship/ensureDxc.mjs exists
// to put there. Both facts are knowable in milliseconds from the tree's own resolvers, so the verdict asks them
// first and refuses WITHOUT running verify, naming the one command. It does not fix anything itself: ensureDxc's
// header keeps copying into a browser cache a person's decision, and a npm install is a download.
//
// Each entry is { what } -- one line, the fact and the command. An empty list is "ready". Every input is injectable
// so shipVerdict-selfcheck can drive the branches a box with Playwright and Linux never reaches.
//
// v4844 -- THE COMMAND IS BUILT FROM THE TWO FACTS, NOT LIFTED OUT OF THE REASON'S PROSE. That prose says "cd <render-qa> &&
// npm install", which leaves the console in render-qa so "run this again" fails as typed, and does not change drive in cmd.exe
// without /d (review of the same pre-flight drafted on another line). fixCommand's --prefix is the same from any folder and
// drive; --ignore-scripts only where the browser is already on disk, as browserSkipReason has advised since v4778. A
// Playwright with no browser gets the plain install, whose postinstall is `playwright install chromium chromium-headless-shell`.
//
// v4846 -- `mainRef` is the fourth probe: the rig spent a full verify on a `--depth 1 --branch` clone with no origin/main, and
// verify's version preflight and the release-lag budget both read that ref. See originMainState below.
export function readiness({ resolve = () => resolvePlaywright(createRequire(import.meta.url)), shell = HEADLESS_SHELL,
                            skipReason = browserSkipReason, dxc = () => ensureDxc({ write: false }), eng = ENG_HERE,
                            exists = fs.existsSync, mainRef = () => originMainState(eng) } = {}) {
    const out = [];
    const { chromium, from } = resolve();
    const why = skipReason(chromium, from, shell);
    if (why) out.push({ what: "the browser gates cannot run here: " + why.replace(/ -- to fix: .*$/, "") +
        " -- to fix: " + fixCommand(eng, { playwright: !!chromium, shell: !!shell && exists(shell) }) });
    else {
        // DXC only once a browser is there: ensureDxc looks beside the headless shell, so with none it has nothing to say.
        const d = dxc();
        if (d && d.needed) out.push({ what: "the WebGPU browser gates will die on requestDevice (dxcompiler.dll is not beside " +
            "the headless shell in " + d.dest + ") -- " + (d.ok ? "to fix: node tools/ship/ensureDxc.mjs --write, once per " +
            "`playwright install` that makes a new browser folder" : describeDxc(d)) });
    }
    // v4846 -- ORDER: AFTER the browser and DXC checks, and NOT short-circuited by them. It is a separate fact -- a missing
    // browser says nothing about the refs, nor the reverse -- so a box with both gets both in the one refusal instead of one
    // per run; and after, because the browser line is the one that turns every browser gate red and is the one to meet first,
    // where this one turns two of verify's checks. Two local git calls (milliseconds), so asking unconditionally costs nothing.
    if (mainRef() === "absent") out.push({ what: "origin/main is not in this clone, so verify cannot compare this version or " +
        "the release lag with main -- to fix: git fetch --depth 1 origin main:refs/remotes/origin/main" });
    return out;
}

// v4846 -- whether the engine's tree has the origin/main verify reads. One of five answers, and only "absent" is refused:
//   "not-a-repo"  no .git beside the engine -- a release zip, which has no remote and no ref a fetch could bring
//   "no-origin"   a checkout with no 'origin' remote (a local copy, a hand-made fork) -- nothing a fetch could name
//   "present"     refs/remotes/origin/main resolves to a commit
//   "absent"      an origin remote and no origin/main: the `--depth 1 --branch` clone the rig verified in full for nothing
//   "unknown"     git could not be started, or rev-parse failed for another reason -- not a fact to refuse on
// The .git test is the tree's own, not git's walk upward: a release zip unpacked inside some other repository is still a zip.
// By exit status, as scanRef: `remote get-url` exits nonzero (2, or 128 on an older git) for no such remote.
export function originMainState(eng = ENG_HERE, { exists = fs.existsSync, git = gitStatus } = {}) {
    const root = path.resolve(eng, "..");
    if (!exists(path.join(root, ".git"))) return "not-a-repo";
    const remote = git(root, ["remote", "get-url", "origin"]);
    if (remote === null) return "unknown";
    if (remote !== 0) return "no-origin";
    const has = git(root, ["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main^{commit}"]);
    return has === 0 ? "present" : has === 1 ? "absent" : "unknown";
}

export function fixCommand(eng, { playwright, shell }) {
    return `npm install --no-audit --no-fund${shell && !playwright ? " --ignore-scripts" : ""} --prefix "${path.join(eng, "tools", "render-qa")}"`;
}

// The engine root this file sits in: the CLI's tree.
const ENG_HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Whether a run's verify is the tree's own. v4844: the choices below keyed on verifyPath being absent, so passing the real
// verify.mjs explicitly -- one edit to the CLI line -- turned the readiness check off with every row green (review).
export function isRealVerify({ eng = ENG_HERE, verifyPath = null } = {}) {
    return !verifyPath || path.resolve(verifyPath) === path.resolve(eng, "tools", "ship", "verify.mjs");
}

// Which readiness check a run gets. The REAL verify gets the real one; a stand-in verify (the selfcheck's drivers)
// needs no browser, so it gets none unless one is passed. A function rather than a default parameter, so the
// selfcheck can hold the choice without running a real verify to see it. v4844: nor does SWEK_QUICKSWEEP=0, which
// skips the quick sweep every browser gate runs in (verify.mjs, v4303) -- refusing it named facts nothing would use.
export function chosenPreflight({ eng = ENG_HERE, verifyPath = null, preflight, env = process.env } = {}) {
    if (preflight !== undefined) return preflight;
    return isRealVerify({ eng, verifyPath }) && env.SWEK_QUICKSWEEP !== "0" ? readiness : null;
}

// *** v4836 -- AFTER A SHIP, THE VERDICT NAMES STEP 4b, BECAUSE THE RITUAL'S NEXT STEP WAS ONLY IN A MARKDOWN FILE. ***
// tools/ship/afterVerdict.mjs (v4835) runs what no ship-time step ran against the record this verdict just wrote; until it is
// run the rig should not be asked. A SHIP line alone reads as "done". So a real verify's SHIP is preceded by one line naming the
// command and how many gates it holds -- read off afterVerdict's own plan, so the count cannot drift from the step. A stand-in
// verify gets none unless one is passed, as with the readiness check.
export function chosenNextStep({ eng = ENG_HERE, verifyPath = null, nextStep } = {}) {
    if (nextStep !== undefined) return nextStep;
    return !isRealVerify({ eng, verifyPath }) ? null : () => `[ship] next, before the rig is asked: node tools/ship/afterVerdict.mjs -- ${afterVerdictPlan().length} gates no ` +
        "ship-time step ran against the record this verdict wrote (the ship skill's step 4b)";
}

export function notReadyTrailer(items) {
    return [
        ...items.map((n) => `[ship]   not ready  ${n.what}`),
        "",
        `[ship] verify exit=none  not run -- ${items.length} fact(s) about this box above would turn every gate that needs it red`,
        "[ship] DO NOT SHIP -- NOT RUN: this box is not ready to verify; fix what is named above and run this again",
    ].join("\n");
}

// `verifyPath` is injectable so shipVerdict-selfcheck can drive THIS function, signals included, against a
// stand-in verify rather than a twenty-minute sweep. The CLI below passes none, so the tree's own verify.mjs runs and the
// readiness check comes first; shipVerdict-selfcheck section 9 runs that CLI line itself from a stub tree. `preflight`,
// `nextStep`, `env` and `scan` likewise (v4844: the in-process drives each read all 6,800 tracked files without `scan`).
export async function main({ eng, argv = [], verifyPath = null, preflight = undefined, nextStep = undefined, env = process.env, scan = scanTracked,
                             out = (m) => console.log(m), exit = (c) => process.exit(c) }) {
    const root = path.resolve(eng, "..");
    const t0 = Date.now();
    let child = null;
    out(`[ship] shipVerdict pid ${process.pid} started ${new Date(t0).toISOString()}  node ${process.version} ${process.platform}`);
    for (const sig of CATCHABLE) {
        try {
            process.on(sig, () => {
                try { out(interruptedTrailer(sig, Date.now() - t0)); } catch {}
                // NOT VERIFIED, AND CANNOT BE: this process exits on the next line, and on Windows a closed console
                // gives it seconds. boundaryLint reports it (KILL_NOT_VERIFIED, baselined at v4680 for this reason).
                // The backstop is the platform's: verify is a non-detached child, so on Windows it sits in this
                // process's libuv job object and dies with it; shipVerdict-selfcheck section 6 polls for the child
                // after a live SIGHUP and goes red if it survives.
                try { if (child) child.kill(); } catch {}
                exit(sig === "SIGINT" ? 130 : 1);
            });
        } catch {}   // SIGBREAK exists only on Windows; registering it elsewhere is harmless, but never let it throw
    }
    // v4844 -- the readiness check runs AFTER the handlers are in. It resolves Playwright and scans the browser roots (half a
    // second here), and with no listener a Ctrl+C or a closed console in that window ended the process with no trailer -- which
    // the v4680 note above defines as a kill nothing can catch. With them in, the signal waits for it and the trailer prints.
    const pf = chosenPreflight({ eng, verifyPath, preflight, env });
    const notReady = pf ? await pf() : [];
    if (notReady.length) {
        out(notReadyTrailer(notReady));
        exit(1);
        return { ship: false, notRun: true, reason: "NOT RUN: " + notReady.map((n) => n.what).join("; ") };
    }
    const verify = await runProcess(process.execPath, [verifyPath || path.join(eng, "tools", "ship", "verify.mjs"), ...argv],
                                    { cwd: eng, echo: true, onChild: (p) => { child = p; } });
    const conflicts = scan(root);
    const d = decide({ verify, conflicts });
    out("");
    out(`[ship] verify exit=${verify.code}  conflicts=${conflicts.hits.length}/${conflicts.scanned} files  after ${Math.round((Date.now() - t0) / 1000)} s`);
    for (const h of conflicts.hits) out(`[ship]   conflict  ${h.file}  line(s) ${h.marks.map((m) => m.line).join(", ")}`);
    const next = d.ship ? chosenNextStep({ eng, verifyPath, nextStep }) : null;
    if (next) { try { out(next()); } catch (e) { out("[ship] next: node tools/ship/afterVerdict.mjs (its plan could not be read: " + String(e && e.message).slice(0, 80) + ")"); } }
    out(`[ship] ${d.ship ? "SHIP" : "DO NOT SHIP"} -- ${d.reason}`);
    exit(d.ship ? 0 : 1);
    return d;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith("shipVerdict.mjs");
if (isMain) {
    const eng = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    await main({ eng, argv: process.argv.slice(2) });
}
