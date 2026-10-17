// WebGLEngine/tools/ship/shipVerdict-selfcheck.mjs
//
// Run: node tools/ship/shipVerdict-selfcheck.mjs   (~17s -- v4846: section 10's temp repo adds ~0.2 s, measured alone 191-207 ms over three runs, about thirty git calls; re-measured v4844: 17.2 / 17.3 s alone, warm, with sections 7 and 8's in-process drives on a stub scan; 30.6 s on the real one, as v4833-v4836 ran them; it read ~12.7s at v4804 -- then: 13.1 s alone (median of three; one run read 65.7 s), 12.3 s the sweep's serial median; it read ~4.9s -- MEASURED at v4680; was ~0.83s before section 6's live drivers)
//
// v4405 -- *** THE ROUND BEFORE THIS ONE SHIPPED A CONFLICT MARKER ONTO main, PAST A VERIFY THAT SAID
// "DO NOT SHIP". ***
//
// verify.mjs printed "1 FAILURE(S) -- DO NOT SHIP" and exited 1. The commit, the push and the fast-forward all
// ran anyway, because they were chained behind a read of the LOG rather than a read of `$?`. Nothing in the
// tree could have caught it: every gate here grades the tree, and the thing that failed was the hand between
// the gate and the push.
//
// Two things it holds, matching the two halves of the failure:
//   * NO TRACKED FILE CARRIES A CONFLICT MARKER, here and on origin/main. No allowance list and no ceiling --
//     the answer to finding one is to resolve it, never to file it, which is the rule claimEvidence uses for
//     contradicted claims.
//   * A VERDICT IS THE EXIT STATUS, and a tail that disagrees with it in EITHER direction is no verdict at
//     all. Proven against a live child process that prints "[verify] ALL GREEN" and exits 1 -- the exact shape
//     that would have fooled the chain -- not against a string in a fixture.
//
// Read with tools/ship/shipVerdict.mjs, which is what the ritual's step 4 now runs.
//
// SABOTAGES (3, all logged, MEASURED 1/3/1 reds by name -- the middle one lands in three places because the
// pair table, the named row and the LIVE child process all read the same rule from different directions):
//   * dropped the `^` anchor from MARKER_RE -> section 2 went red naming this very file, which quotes markers
//     in prose. Restored. That is why the anchor is the design and not an accident.
//   * made verdict() trust the tail when the exit status disagreed -> section 3's "tail says green, exit 1"
//     row went red BY NAME. Restored.
//   * put a conflict marker at line start in a scratch tracked file -> section 2 named the file and the line.
//     Removed.
//   * v4680: deleted the child.kill() in main()'s signal handler -> section 6's "takes its verify child with it"
//     went red alone (the first draft of that row read the child's liveness ONCE and was red on the unsabotaged
//     code too -- the child dies a moment after the driver; it is polled for 2 s now). Restored.
//   * v4680: registered the handlers over an empty list -> the SIGHUP, child and SIGINT rows went red, three by
//     name; the SIGKILL control stayed green, as it must. Restored.
//   * v4833, section 7 (a box not ready to verify is refused before verify runs), five, each red by name:
//     A. readiness() ignores the Playwright resolver                  -> 2 (no Playwright; no browser on disk)
//     B. readiness() ignores ensureDxc                               -> 2 (the DLL missing; no bundle carries it)
//     C. main() runs verify although readiness answered              -> 1 (verify NEVER STARTED)
//     D. the real verify gets no readiness check                     -> 1 (the choice row)
//     E. the --write command is named where ensureDxc said CANNOT    -> 1 (the CANNOT row)
//   * v4844, sections 7 and 9 (fixes ported from a review of the same pre-flight drafted on another line), each red by name:
//     F. the readiness check moved back above the handler registration -> 1 (the mid-check SIGHUP row)
//     G. fixCommand back to "cd <render-qa> && npm install"           -> 2 (the command row and section 7's no-browser row)
//     H. chosenPreflight ignores SWEK_QUICKSWEEP=0                    -> 1 (the choice row)
//     I. isRealVerify back to "no verifyPath"                         -> 1 (the choice row)
//     J. the CLI line passes preflight: null                          -> 1 (the CLI row)
//     and the in-process drives given the real scan again: no row, the cost -- 30.6 s against 17.2, past twice the old header
//   * v4846, sections 2 and 10 (a --depth 1 --branch clone with no origin/main, built as a real temp repo), each red by name:
//     K. scanRef without its rev-parse absence check (git grep's failure again) -> 2 (the ABSENT row; the skip row)
//     L. scanRef's absence widened to any nonzero rev-parse status             -> 1 (the CONTROL row: an unopenable checkout read as absent)
//     M. section 2's skip back to the v4402 message match on ref.why           -> 1 (the skip row: git grep says "unable to resolve revision")
//     N. readiness() without the origin/main refusal                            -> 2 (the ABSENT row; the both-named row)
//     O. readiness() refusing whatever is not "present"                         -> 2 (the NO ORIGIN row; the NOT A REPO row)
//     P. originMainState without its .git test                                  -> 1 (NOT A REPO: the zip read as "no-origin")
//     Q. readiness()'s default probe asking the CLI's own tree, not `eng`       -> 2 (the ABSENT row; the both-named row)
//   v4847 (section 11, the declared limit; step 4b found shipVerdict SILENT in runnerBudget-selfcheck):
//     R. the git probes' limit moved to 30 s, budgetIsOwn left saying 15        -> 1 (the declaration row)
//     S. budgetIsOwn removed                                                   -> 1 here and 1 in runnerBudget-selfcheck.
//        *** FIRST TRY WAS NO SABOTAGE: the cut stopped at a ';' inside the declaration's own text and left a file that
//        does not parse -- 0 rows red, exit 1, a SyntaxError. Re-cut to the end of the string. ***
"use strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as SV from "./shipVerdict.mjs";
import { gateReport } from "./gateReport.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(ENG, "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
// v4844: the conflict scan for main() driven IN THIS PROCESS -- each drive that reached it read all 6,800 tracked files, and
// sections 7 and 8 have two such drives; section 2 runs the real scan once, which is what that scan's rows are about.
const noScan = () => ({ scanned: 0, hits: [] });
const REPORT = gateReport("tools/ship/shipVerdict-selfcheck.mjs");

console.log("\n1. the detector sees all three marker shapes, and only at line start");
{
    const planted = ["ok line", "<<<<<<< HEAD", "one", "||||||| base", "two", "=======", "three", ">>>>>>> other", "end"].join("\n");
    const m = SV.conflictMarkers(planted);
    ok("all three anchored kinds are found, with their line numbers", m.length === 3 && m[1].line === 4,
        m.map((x) => x.kind + "@" + x.line).join(" "));
    ok("...and prose that MENTIONS a marker mid-line is not one", SV.conflictMarkers("see <<<<<<< HEAD in the log").length === 0,
        "this gate's own header quotes markers; an unanchored detector would flag the file that explains the defect");
    ok("...and a bare ======= rule is not counted", SV.conflictMarkers("Title\n=======\nbody").length === 0,
        "LIMIT SAID PLAINLY: `=======` carries no trailing text and is a markdown underline as often as a merge. " +
        "It is not matched, so a conflict reduced to that ONE line survives this gate. Both bracketing markers are");
}

console.log("\n2. no tracked file carries one -- here or on origin/main");
const scan = SV.scanTracked(ROOT);
// Narrowed on purpose (v4402): the ONLY thing that excuses section 2's origin/main row is the ref being absent, because an
// absence read as a skip is an absence read as a pass, and that is what this whole round is about.
// v4846 -- and "absent" is scanRef's flag, decided by git's exit status, NEVER a match on its message: this was
// /unknown revision|not a valid object|ambiguous argument/ on ref.why, and git grep words a missing ref "unable to resolve
// revision", so a --depth 1 --branch clone with no origin/main was red here. A function, so section 10 can hand it a real
// absent clone's answer -- on a box that HAS origin/main (this one, usually) section 2 never reaches it.
const onlySkip = (ref) => ref.ok === false && ref.absent === true;
{
    ok("!! *** the working tree is clean of conflict markers ***", scan.hits.length === 0,
        scan.hits.length ? scan.hits.map((h) => h.file + ":" + h.marks.map((x) => x.line).join("/")).join(", ")
                         : `${scan.scanned} tracked files read in full -- no allowance list, no ceiling`);
    const ref = SV.scanRef(ROOT, "origin/main");
    if (!ref.ok) {
        ok("origin/main is not in this clone, and that is the only skip allowed here", onlySkip(ref),
            "SKIPPED: " + ref.why);
    } else {
        // A ROUND CANNOT SHIP THE REPAIR OF main IF THE GATE THAT DEMANDS main BE CLEAN IS RED UNTIL IT LANDS.
        // So the rule is not "main is clean" but "main is clean OR THIS TREE CARRIES THE REPAIR": every marked
        // file on the ref is clean here, so the push clears it. That has no slack -- it cannot be satisfied by
        // ignoring the marker, only by holding its fix in the very commit being verified.
        const unrepaired = ref.hits.filter((h) => scan.hits.some((x) => x.file === h.file) || !fs.existsSync(path.join(ROOT, h.file)));
        ok("!! *** and what is actually ON origin/main is clean, or repaired by THIS tree ***", unrepaired.length === 0,
            unrepaired.length ? unrepaired.map((h) => h.file + " x" + h.count).join(", ") + " -- still marked here too"
                : ref.hits.length ? "origin/main carries " + ref.hits.map((h) => h.file + " x" + h.count).join(", ") +
                    " -- v4404 shipped exactly that, and EVERY ONE IS CLEAN IN THIS TREE, so this commit is the repair"
                : "the ref, not the working tree: a clean tree is not evidence about what shipped");
    }
}

console.log("\n3. a verdict is the exit status, and a tail that disagrees is no verdict");
{
    const rows = [
        { code: 0, tail: "[verify] ALL GREEN", ship: true, agrees: true },
        { code: 1, tail: "[verify] 1 FAILURE(S) - DO NOT SHIP", ship: false, agrees: true },
        { code: 1, tail: "[verify] ALL GREEN", ship: false, agrees: false },
        { code: 0, tail: "[verify] 1 FAILURE(S) - DO NOT SHIP", ship: false, agrees: false },
        { code: null, tail: "[verify] ALL GREEN", ship: false, agrees: false },
    ];
    let wrong = [];
    for (const r of rows) {
        const v = SV.verdict(r);
        if (v.ship !== r.ship || v.agrees !== r.agrees) wrong.push(`exit ${r.code} tail ${JSON.stringify(r.tail.slice(0, 20))}`);
    }
    ok("all five (status, tail) pairs land where they must", wrong.length === 0, wrong.join("; ") || "5 of 5");
    ok("!! *** a tail saying ALL GREEN under a NONZERO exit is NOT a pass ***", SV.verdict({ code: 1, tail: "[verify] ALL GREEN" }).ship === false,
        "THE EXACT SHAPE THAT SHIPPED v4404: the chain read the words and not the status");
    ok("...and a ZERO exit under a tail that does not say green is not one either", SV.verdict({ code: 0, tail: "nothing" }).ship === false,
        "disagreement in either direction is an unfinished or lying run, not a green one");
    ok("...and a process with NO exit status is not a pass", SV.verdict({ code: null, tail: "[verify] ALL GREEN" }).ship === false,
        "v4392's finding, third and fourth sighting this session: a crashed process's output is not a verdict");
    REPORT.table("what a (exit status, tail) pair is worth", ["exit", "tail says", "ship?", "agrees?"],
        rows.map((r) => [String(r.code), SV.TAIL_GREEN.test(r.tail) ? "ALL GREEN" : "failures", SV.verdict(r).ship ? "SHIP" : "NO", SV.verdict(r).agrees ? "yes" : "no"]),
        "The row that shipped v4404 is (1, ALL GREEN) -- the tail was true of an earlier run in the same log.");
}

console.log("\n4. proven against a live process, not a fixture");
{
    const liar = path.join(ENG, "tools", "ship", ".shipVerdict-liar.mjs");
    fs.writeFileSync(liar, 'console.log("[verify] ALL GREEN");\nprocess.exit(1);\n');
    let r;
    try { r = await SV.runProcess(process.execPath, [liar], { cwd: ENG }); } finally { fs.unlinkSync(liar); }
    ok("a REAL child that prints ALL GREEN and exits 1 is caught", r.code === 1 && SV.verdict(r).ship === false,
        `exit=${r.code} tail=${JSON.stringify(r.tail)}`);
    const d = SV.decide({ verify: { code: 0, tail: "[verify] ALL GREEN" }, conflicts: { scanned: 9, hits: [{ file: "x.js", marks: [{ line: 3 }] }] } });
    ok("...and a green verify still does not ship with a marker in the tree", d.ship === false, d.reason);
    ok("...the two conditions are independent: green + clean is the only SHIP",
        SV.decide({ verify: { code: 0, tail: "[verify] ALL GREEN" }, conflicts: { scanned: 9, hits: [] } }).ship === true,
        "one gate for two failures would send different work to the same place -- v4401's rule");
}

console.log("\n5. the ritual points at the status, not at the log");
{
    const skill = path.join(ROOT, ".claude", "skills", "ship", "SKILL.md");
    const src = fs.existsSync(skill) ? fs.readFileSync(skill, "utf8") : "";
    ok("the ship skill exists and names shipVerdict", src.includes("shipVerdict.mjs"),
        src ? "step 4 runs it, so the last line of the step IS derived from the exit code" : "SKILL.md not found at " + skill);
    ok("...and says in as many words that the exit status decides", /exit status|\$\?/.test(src),
        "LIMIT: this is a check for words in prose, which is the weakest shape in the tree and is named as such. " +
        "It cannot tell whether the hand running the ritual obeys it. Section 2 is the one that catches the result");
}

console.log("\n6. a run ended from outside says so where it can -- and the silence that remains has one meaning");
// v4680 -- Keith's v4679 rig log stopped at "[verify] quick sweep 1413/1413" with no trailer. Driven LIVE: a real
// driver process runs main() against a stand-in verify that never finishes, and is sent a real signal. The
// stand-in is imported by FILE URL, not by a path string -- v4676's thrownRow/wasmTeardown lesson: "C:" parses
// as a protocol on the rig.
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shipverdict-sig-"));
    const standIn = path.join(dir, "verify-standin.mjs");
    fs.writeFileSync(standIn, 'process.stderr.write("[standin] pid " + process.pid + "\\n");\nsetInterval(() => {}, 1000);\n');
    const driver = path.join(dir, "driver.mjs");
    fs.writeFileSync(driver, `import { main } from ${JSON.stringify(pathToFileURL(path.join(ENG, "tools", "ship", "shipVerdict.mjs")).href)};\n` +
        `await main({ eng: ${JSON.stringify(ENG)}, verifyPath: ${JSON.stringify(standIn)} });\n`);
    const drive = (sig) => new Promise((resolve) => {
        const p = spawn(process.execPath, [driver], { stdio: ["ignore", "pipe", "pipe"] });
        let out = "", err = "", sent = false, standinPid = null;
        const t = setTimeout(() => { try { p.kill("SIGKILL"); } catch {} }, 20000);
        const maybe = () => {
            const m = /\[standin\] pid (\d+)/.exec(err);
            if (!sent && m && out.includes("[ship] shipVerdict pid")) { sent = true; standinPid = Number(m[1]); p.kill(sig); }
        };
        p.stdout.on("data", (b) => { out += b; maybe(); });
        p.stderr.on("data", (b) => { err += b; maybe(); });
        p.on("close", async (code, signal) => {
            clearTimeout(t);
            // Polled, not read once: the child is signalled as the driver exits, and dies a moment later.
            const alive = () => { try { process.kill(standinPid, 0); return true; } catch { return false; } };
            let standinAlive = false;
            if (standinPid) {
                const until = Date.now() + 2000;
                while ((standinAlive = alive()) && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
                try { process.kill(standinPid, "SIGKILL"); } catch {}
            }
            resolve({ code, signal, out, sent, standinAlive });
        });
    });
    const pure = SV.interruptedTrailer("SIGHUP", 2600);
    ok("the interrupted trailer names the signal, what it means, the clock, and NO VERDICT",
        /interrupted by SIGHUP after 3 s/.test(pure) && /console window was closed/.test(pure) && /DO NOT SHIP -- NO VERDICT/.test(pure),
        pure.trim().split("\n").join(" | "));
    // v4845 -- CATCHABLE is the list main() registers its handlers over, and the one export of shipVerdict.mjs no importing gate
    // named (definitionGates' owned census). An empty list was the v4680 sabotage above; this row holds the list's contents: the
    // four endings the header says CAN be caught, each with its own meaning in the trailer, and none of the uncatchable ones.
    const meanings = SV.CATCHABLE.map((sig) => (SV.interruptedTrailer(sig, 1000).match(/\(([^)]*)\) before verify/) || [])[1]);
    ok("!! CATCHABLE is exactly SIGINT, SIGHUP, SIGBREAK and SIGTERM, each trailer naming its own cause -- and no SIGKILL, which no handler sees",
        SV.CATCHABLE.slice().sort().join() === "SIGBREAK,SIGHUP,SIGINT,SIGTERM" && Object.isFrozen(SV.CATCHABLE) &&
        meanings.every((m) => m && m !== "a signal") && new Set(meanings).size === 4 && !SV.CATCHABLE.includes("SIGKILL"),
        SV.CATCHABLE.map((sig, i) => `${sig}: ${meanings[i]}`).join("; "));
    // v4845 -- notReadyTrailer, the readiness check's refusal (section 7 drives it live through main); its own shape held here:
    // every unready fact on its own line, the count, and a verdict line that cannot be read as a run
    const nr = SV.notReadyTrailer([{ what: "no playwright in tools/render-qa" }, { what: "no Vulkan driver" }]).split("\n");
    ok("!! notReadyTrailer names each unready fact on its own line, counts them, and ends DO NOT SHIP -- NOT RUN, with no exit status a reader could take for verify's",
        nr[0] === "[ship]   not ready  no playwright in tools/render-qa" && nr[1] === "[ship]   not ready  no Vulkan driver" &&
        /verify exit=none {2}not run -- 2 fact\(s\)/.test(nr[3]) && /^\[ship\] DO NOT SHIP -- NOT RUN:/.test(nr.at(-1)) && !nr.some((l) => /exit=\d/.test(l)),
        nr.filter(Boolean).join(" | "));
    if (process.platform !== "win32") {
        const hup = await drive("SIGHUP");
        ok("!! *** a LIVE run sent SIGHUP -- what a closed console window delivers on Windows -- prints the NO VERDICT trailer ***",
            hup.sent && hup.code === 1 && /interrupted by SIGHUP/.test(hup.out) && /NO VERDICT/.test(hup.out),
            `exit=${hup.code} sent=${hup.sent} tail=${JSON.stringify(hup.out.trim().split("\n").slice(-1)[0])}`);
        ok("...and takes its verify child with it rather than leaving it running", hup.sent && !hup.standinAlive,
            "an orphaned verify would keep sweeping into a log nobody is reading");
        const int = await drive("SIGINT");
        ok("...Ctrl+C likewise, exiting 130", int.sent && int.code === 130 && /interrupted by SIGINT/.test(int.out), `exit=${int.code}`);
    } else {
        say("SIGHUP/SIGINT cannot be SENT from here on win32 -- child.kill(sig) is TerminateProcess there -- so the " +
            "catchable rows are driven on POSIX. What IS driven here is the row below, which is the Windows half.");
    }
    const kill = await drive("SIGKILL");
    ok("!! *** CONTROL: a TerminateProcess-class kill leaves NO trailer -- so on the rig, a missing trailer now means exactly that ***",
        kill.sent && !/\[ship\] (verify exit|DO NOT SHIP|SHIP)/.test(kill.out) && kill.out.includes("[ship] shipVerdict pid"),
        `exit=${kill.code} signal=${kill.signal} -- taskkill /F, End task, a job-object kill or a power loss; the start line is there, the trailer is not`);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

console.log("\n7. v4833 -- a box that cannot run the browser gates is refused BEFORE verify, with the one command");
// Keith's v4819 clone-verify: 898 s, 104 new reds, 103 of them "playwright is not installed here" once per gate. v4826's:
// four reds that were dxcompiler.dll missing beside a fresh headless shell. Both are facts about the box that the tree's
// own resolvers answer in milliseconds; readiness() asks them, and main() refuses on any answer without running verify.
{
    const { browserSkipReason, SHELL_DIR_SAMPLES, SHELL_LEAVES, DXC_LEAVES } = await import("./playwrightResolve.mjs");
    const { ensureDxc } = await import("./ensureDxc.mjs");
    const noDxc = () => ({ needed: false });
    // v4846 -- readiness() also asks whether origin/main is in this clone; these rows are about the browser, so they say it is,
    // and a --depth 1 --branch clone (the rig's) does not turn them red on a second fact. Section 10 drives that probe for real.
    const hasMain = () => "present";
    const none = SV.readiness({ resolve: () => ({ chromium: null, from: "" }), shell: "", skipReason: browserSkipReason, dxc: noDxc, mainRef: hasMain });
    ok("!! *** no Playwright: ONE line, naming tools/render-qa's npm install -- not one red per browser gate ***",
        none.length === 1 && /tools[\\/]render-qa/.test(none[0].what) && /npm install/.test(none[0].what),
        none.length ? none[0].what.slice(0, 160) + "..." : "readiness said ready with no Playwright at all");
    const noShell = SV.readiness({ resolve: () => ({ chromium: {}, from: "playwright" }), shell: "", skipReason: browserSkipReason, dxc: noDxc, mainRef: hasMain });
    // v4844: render-qa's own install, by --prefix -- its postinstall is `playwright install chromium chromium-headless-shell`
    ok("...Playwright but no browser on disk: the install that fetches one is named, by --prefix, with its postinstall",
        noShell.length === 1 && /npm install --no-audit --no-fund --prefix "[^"]*render-qa"/.test(noShell[0].what) &&
        !/--ignore-scripts/.test(noShell[0].what) && !/\bcd\b/.test(noShell[0].what.replace(/^.*-- to fix: /, "")),
        noShell.length ? noShell[0].what.slice(-110) : "readiness said ready with no browser binary");
    // ensureDxc itself, driven on a fixture Windows box: Playwright's root holds a full browser carrying dxcompiler.dll
    // and a headless shell that does not -- the state a fresh `playwright install` leaves (v4828's four reds).
    // The folder and leaf names come from the resolver's own exports: playwrightResolve-selfcheck refuses a browser path
    // spelt by hand anywhere else, and this fixture was its first catch (v4833's verdict).
    const ROOTPW = path.join(path.sep, "pw");
    const [FULL_DIR, SHELL_DIR] = SHELL_DIR_SAMPLES;
    const FULL = path.join(ROOTPW, FULL_DIR, DXC_LEAVES.find((l) => l.startsWith("chrome-win64")));
    const shellExe = path.join(ROOTPW, SHELL_DIR, SHELL_LEAVES.find((l) => l.startsWith("chrome-headless-shell-win64")));
    const fixDxc = (has) => () => ensureDxc({ platform: "win32", shell: shellExe, env: { PLAYWRIGHT_BROWSERS_PATH: ROOTPW }, home: path.join(path.sep, "nohome"),
        exists: (q) => has.includes(q), readdir: (r) => { if (r === ROOTPW) return [FULL_DIR, SHELL_DIR]; throw new Error("no " + r); } });
    const ready = () => ({ chromium: {}, from: "playwright" }), shellOk = () => "";
    const dxcDry = SV.readiness({ resolve: ready, shell: shellExe, skipReason: shellOk, dxc: fixDxc([FULL]), mainRef: hasMain });
    ok("!! *** a fresh Windows browser folder without dxcompiler.dll: ensureDxc --write is named, before 15 minutes of sweep ***",
        dxcDry.length === 1 && /ensureDxc\.mjs --write/.test(dxcDry[0].what) && /dxcompiler\.dll/.test(dxcDry[0].what),
        dxcDry.length ? dxcDry[0].what.slice(0, 170) + "..." : "readiness said ready with the DLL missing beside the shell");
    const dxcNone = SV.readiness({ resolve: ready, shell: shellExe, skipReason: shellOk, dxc: fixDxc([]), mainRef: hasMain });
    ok("...and when no bundle on the box carries it, the reason ensureDxc gives is passed on rather than a command that cannot work",
        dxcNone.length === 1 && /CANNOT/.test(dxcNone[0].what) && !/ensureDxc\.mjs --write/.test(dxcNone[0].what),
        dxcNone.length ? dxcNone[0].what.slice(-120) : "readiness said ready");
    const dxcThere = SV.readiness({ resolve: ready, shell: shellExe, skipReason: shellOk,
        dxc: fixDxc([FULL, path.join(path.dirname(shellExe), "dxcompiler.dll")]), mainRef: hasMain });
    ok("CONTROL: the DLL already beside the shell, and Playwright resolved -- ready, no entries",
        dxcThere.length === 0, JSON.stringify(dxcThere).slice(0, 160));

    // main() itself: a stand-in verify that leaves a mark if it is ever started.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shipverdict-ready-"));
    try {
        const mark = path.join(dir, "verify-ran");
        const standIn = path.join(dir, "verify-standin.mjs");
        fs.writeFileSync(standIn, `import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(mark)}, "ran");\n`);
        const lines = []; let code = null;
        const d = await SV.main({ eng: ENG, verifyPath: standIn, preflight: () => [{ what: "the browser gates cannot run here: FIXTURE" }],
                                  out: (m) => lines.push(m), exit: (c) => { code = c; } });
        const text = lines.join("\n");
        ok("!! *** not ready: verify is NEVER STARTED, the exit is 1, and the last line says DO NOT SHIP -- NOT RUN ***",
            !fs.existsSync(mark) && code === 1 && d && d.notRun === true &&
            /\[ship\] DO NOT SHIP -- NOT RUN/.test(text.trim().split("\n").slice(-1)[0]) && text.includes("FIXTURE"),
            `verify ${fs.existsSync(mark) ? "RAN" : "not started"}, exit ${code}, last line ${JSON.stringify(text.trim().split("\n").slice(-1)[0])}`);
        lines.length = 0; code = null;
        await SV.main({ eng: ENG, verifyPath: standIn, preflight: () => [], scan: noScan, out: (m) => lines.push(m), exit: (c) => { code = c; } });
        // main() registered its signal handlers on THIS process on the way through; they would swallow a Ctrl+C here.
        for (const sig of SV.CATCHABLE) process.removeAllListeners(sig);
        ok("CONTROL: ready -- the same stand-in IS started, so the row above is about the refusal and not a stand-in that never runs",
            fs.existsSync(mark) && code !== null, `verify ${fs.existsSync(mark) ? "ran" : "NOT STARTED"}, exit ${code}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }

    ok("the REAL verify gets the real readiness check -- named explicitly too, and not with the quick sweep off; a stand-in gets none unless one is passed",
        SV.chosenPreflight({ verifyPath: null, env: {} }) === SV.readiness && SV.chosenPreflight({ verifyPath: "x.mjs", env: {} }) === null &&
        SV.chosenPreflight({ eng: ENG, verifyPath: path.join(ENG, "tools", "ship", "verify.mjs"), env: {} }) === SV.readiness &&
        SV.chosenPreflight({ verifyPath: null, env: { SWEK_QUICKSWEEP: "0" } }) === null &&
        typeof SV.chosenPreflight({ verifyPath: "x.mjs", preflight: () => [], env: {} }) === "function",
        "so sections 4 and 6, which drive main() against stand-ins, are unchanged on a box without Playwright; SWEK_QUICKSWEEP=0 skips " +
        "the sweep every browser gate runs in (v4844: refusing it named facts nothing would use)");
    const here = SV.readiness();
    say(`THIS BOX: ${here.length ? "NOT READY -- " + here.map((n) => n.what).join(" | ") : "ready (Playwright resolves, a browser is on disk, DXC is " + (process.platform === "win32" ? "beside the shell" : "not needed off Windows") + ", and origin/main reads " + SV.originMainState() + ")"}`);
}

console.log("\n8. v4836 -- after a SHIP, the verdict names step 4b; the verdict line stays last");
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shipverdict-next-"));
    try {
        const green = path.join(dir, "verify-green.mjs");
        fs.writeFileSync(green, 'console.log("[verify] ALL GREEN");\n');
        const run = async (opts) => { const lines = []; let code = null;
            await SV.main({ eng: ENG, verifyPath: green, preflight: () => [], scan: noScan, out: (m) => lines.push(...String(m).split("\n")), exit: (c) => { code = c; }, ...opts });
            for (const sig of SV.CATCHABLE) process.removeAllListeners(sig);
            const t = lines.filter((l) => l.trim()); return { t, code }; };
        const a = await run({ nextStep: () => "[ship] next, before the rig is asked: node tools/ship/afterVerdict.mjs -- FIXTURE" });
        ok("!! *** a SHIP names afterVerdict.mjs on the line before the verdict, and the verdict is still the LAST line ***",
            a.code === 0 && /^\[ship\] SHIP /.test(a.t[a.t.length - 1]) && /afterVerdict\.mjs/.test(a.t[a.t.length - 2] || ""),
            `exit ${a.code}; last two: ${JSON.stringify(a.t.slice(-2))}`);
        const real = SV.chosenNextStep({ verifyPath: null });
        ok("...the real verify's line carries afterVerdict's own plan count, so the number cannot drift from the step",
            typeof real === "function" && /afterVerdict\.mjs -- \d+ gates/.test(real()) && SV.chosenNextStep({ verifyPath: "x.mjs" }) === null,
            typeof real === "function" ? real().slice(0, 120) : "no next step for the real verify");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// v4871 -- SABOTAGED, each restored by copy: the after-verify check removed -> 2 RED (the free-label control, asked once
// not twice, and the spent-while-verify-ran row, which SHIPPED); the before-verify refusal removed -> 1 RED (the already-spent
// row: verify RAN); checkLabel fetching on ANY refusal -> 1 RED (the no-fetch row); a failed fetch returned as a pass -> 1 RED
// (the git's-words row); a stand-in given the real checkLabel -> 1 RED (the choice row); VERIFY_ARGS missing verify's --zip
// -> 1 RED (the spec row). Six, six caught.
console.log("\n8b. v4871 -- the label is asked before verify and again after it, the window v4853 was lost in");
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shipverdict-label-"));
    try {
        const mark = path.join(dir, "verify-ran");
        const green = path.join(dir, "verify-green.mjs");
        fs.writeFileSync(green, `import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(mark)}, "ran");\nconsole.log("[verify] ALL GREEN");\n`);
        const run = async (labelCheck, argv = ["--version", "v9001"]) => {
            const lines = [], asked = []; let code = null;
            try { fs.rmSync(mark, { force: true }); } catch {}
            const d = await SV.main({ eng: ENG, argv, verifyPath: green, preflight: () => [], nextStep: null, scan: noScan,
                                      labelCheck: labelCheck && (async (v) => { asked.push(v); return labelCheck(asked.length); }),
                                      out: (m) => lines.push(...String(m).split("\n")), exit: (c) => { code = c; } });
            for (const sig of SV.CATCHABLE) process.removeAllListeners(sig);
            const t = lines.filter((l) => l.trim());
            return { d, t, code, asked, ran: fs.existsSync(mark), last: t[t.length - 1] || "" };
        };
        const free = await run(() => ({ ok: true, fetched: false, refusal: null }));
        ok("CONTROL: a label free before and after -- asked TWICE, verify runs, SHIP, and the after-line says still free",
            free.code === 0 && free.ran && free.asked.join() === "v9001,v9001" && /^\[ship\] SHIP /.test(free.last) &&
            free.t.some((l) => /label v9001 asked again after verify: still free/.test(l)),
            `exit ${free.code}, asked ${free.asked.join()}; last ${JSON.stringify(free.last)}`);
        const lost = await run((n) => n === 1 ? { ok: true, fetched: false, refusal: null }
                                              : { ok: false, fetched: true, refusal: "v9001 is already spent on refs/remotes/origin/FIXTURE" });
        ok("!! *** a label SPENT WHILE VERIFY RAN turns a green verify into DO NOT SHIP, naming the label and the branch, as the last line ***",
            lost.code === 1 && lost.ran && /^\[ship\] DO NOT SHIP -- the label v9001 was spent while verify ran -- .*FIXTURE/.test(lost.last) &&
            lost.t.some((l) => /asked again after verify: SPENT \(every branch head fetched first\)/.test(l)) && lost.d.labelSpent === true,
            `exit ${lost.code}; last ${JSON.stringify(lost.last)}`);
        const gone = await run(() => ({ ok: false, fetched: false, refusal: "v9001 is already spent on refs/remotes/origin/EARLIER" }));
        ok("!! *** a label ALREADY spent is refused BEFORE verify: the sweep never starts, exit 1, DO NOT SHIP -- NOT RUN ***",
            gone.code === 1 && !gone.ran && gone.asked.length === 1 && /^\[ship\] DO NOT SHIP -- NOT RUN: the label v9001 is not free/.test(gone.last) &&
            gone.t.some((l) => /label refused\s+v9001: .*EARLIER/.test(l)) &&
            SV.labelRefusedTrailer("v9001", { refusal: "v9001 is already spent on refs/remotes/origin/EARLIER" }).split("\n").filter((l) => l.trim()).every((l) => gone.t.includes(l)),
            `verify ${gone.ran ? "RAN" : "not started"}, exit ${gone.code}; last ${JSON.stringify(gone.last)}`);
        const noVersion = await run(() => ({ ok: false, refusal: "must not be asked" }), ["--markers", "x"]);
        ok("CONTROL: with no --version there is no label to ask about, and nothing is refused for one",
            noVersion.asked.length === 0 && noVersion.code === 0 && noVersion.ran, `asked ${noVersion.asked.length}, exit ${noVersion.code}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }

    ok("the REAL verify asks with checkLabel; a stand-in asks nothing unless a check is passed",
        SV.chosenLabelCheck({ verifyPath: null }) === SV.checkLabel && SV.chosenLabelCheck({ verifyPath: "x.mjs" }) === null &&
        SV.chosenLabelCheck({ eng: ENG, verifyPath: path.join(ENG, "tools", "ship", "verify.mjs") }) === SV.checkLabel &&
        SV.versionArg(["--markers", "a", "--version", "v1"]) === "v1" && SV.versionArg(["--version", "--markers"]) === null);
    // VERIFY_ARGS is verify.mjs's own spec, copied so shipVerdict can refuse a typo before running anything; held to verify's line here
    const vline = (fs.readFileSync(path.join(ENG, "tools", "ship", "verify.mjs"), "utf8").match(/parseOrExit\("verify", (\{[^\n]*\})\);/) || [])[1];
    ok("!! shipVerdict's VERIFY_ARGS is verify.mjs's own option spec, value for value -- a drifted copy would refuse what verify accepts",
        !!vline && JSON.stringify(Function("return " + vline)()) === JSON.stringify(SV.VERIFY_ARGS), vline ? vline.slice(0, 120) : "verify.mjs's parseOrExit line not found");
    // checkLabel itself, with the preflight and the fetch stubbed: it fetches only for a stale VIEW, and asks again after
    const seq = (...answers) => { let i = 0; return () => answers[Math.min(i++, answers.length - 1)]; };
    let fetches = 0;
    const fetch = () => { fetches++; };
    const a = await SV.checkLabel("v1", { preflight: seq({ ok: false, staleView: true, refusal: "stale" }, { ok: true }), fetch });
    ok("!! checkLabel: a refusal that is ONLY a stale view fetches every branch head once and asks again -- free after the fetch",
        a.ok === true && a.fetched === true && fetches === 1, JSON.stringify(a));
    fetches = 0;
    const b = await SV.checkLabel("v1", { preflight: seq({ ok: false, staleView: false, refusal: "spent on X" }), fetch });
    ok("...a real refusal is returned as it stands, with no fetch -- fetching cannot unspend a number", b.ok === false && fetches === 0 && b.refusal === "spent on X");
    const c = await SV.checkLabel("v1", { preflight: seq({ ok: false, staleView: true, refusal: "stale" }), fetch: () => { throw Object.assign(new Error("x"), { stderr: "fatal: unable to access FIXTURE\n" }); } });
    ok("...and a fetch that fails is a refusal in git's own words, never a pass", c.ok === false && /fetching every branch head failed -- fatal: unable to access FIXTURE/.test(c.refusal || ""), c.refusal);
}

console.log("\n9. v4844 -- the command the refusal names works as typed, the CLI line itself refuses, and a signal during the check still says so");
// Ported from a review of the same pre-flight drafted on another line before v4833 reached it: the printed fix began with cd,
// so "run this again" failed from render-qa; passing the real verify.mjs explicitly turned the check off with every row
// green; no row ran the CLI line; and the check ran before the signal handlers, so a Ctrl+C during it left no trailer.
{
    const W = "C:\\SweK clone\\WebGLEngine", rqa = path.join(W, "tools", "render-qa");
    const cmds = [[false, true], [false, false], [true, false]].map(([playwright, shell]) => SV.fixCommand(W, { playwright, shell }));
    ok("  the command names render-qa by --prefix, quoted, never by cd -- the same from any folder and drive; --ignore-scripts only where the browser is on disk",
        cmds.every((c) => c.startsWith("npm install ") && c.endsWith(`--prefix "${rqa}"`) && !/\bcd\b/.test(c)) &&
        cmds[0].includes("--ignore-scripts") && !cmds[1].includes("--ignore-scripts") && !cmds[2].includes("--ignore-scripts"),
        cmds.join(" | "));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shipverdict-cli-"));
    try {
        // THE CLI LINE ITSELF, from a stub tree: shipVerdict.mjs copied in finds that tree by its own location, as on the rig, and
        // its tree imports are the stub's (cliArgs.mjs, v4871, the real file). Run from OUTSIDE the tree, so a CLI that took its tree from the cwd would fail.
        const stubEng = path.join(dir, "eng"), stubShip = path.join(stubEng, "tools", "ship"), ran = path.join(dir, "verify-ran");
        fs.mkdirSync(stubShip, { recursive: true });
        fs.copyFileSync(path.join(ENG, "tools", "ship", "shipVerdict.mjs"), path.join(stubShip, "shipVerdict.mjs"));
        // v4871 -- and the parser it reads argv with, copied as it stands: a stub of the tree's one parser would test the stub
        fs.copyFileSync(path.join(ENG, "tools", "ship", "cliArgs.mjs"), path.join(stubShip, "cliArgs.mjs"));
        fs.writeFileSync(path.join(stubShip, "playwrightResolve.mjs"), 'export const HEADLESS_SHELL = "";\n' +
            'export function resolvePlaywright() { return { chromium: null, from: "" }; }\n' +
            'export function browserSkipReason(c) { return c ? "" : "stub: playwright is not installed here -- to fix: cd somewhere && npm install"; }\n');
        fs.writeFileSync(path.join(stubShip, "ensureDxc.mjs"), 'export function ensureDxc() { return { needed: false }; }\nexport function describe() { return ""; }\n');
        fs.writeFileSync(path.join(stubShip, "afterVerdict.mjs"), "export function plan() { return []; }\n");
        fs.writeFileSync(path.join(stubShip, "verify.mjs"), `import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(ran)}, "1");\nconsole.log("[verify] ALL GREEN");\n`);
        const env = { ...process.env }; delete env.SWEK_QUICKSWEEP;
        const r = spawnSync(process.execPath, [path.join(stubShip, "shipVerdict.mjs"), "--version", "v0"], { cwd: dir, env, encoding: "utf8", timeout: 60000 });
        const lines = String(r.stdout || "").trim().split("\n"), notReady = lines.find((l) => l.includes("not ready")) || "";
        ok("!! *** the CLI line itself, in an unprovisioned tree, refuses before its verify runs: exit 1, NOT RUN, and the --prefix command ***",
            r.status === 1 && !fs.existsSync(ran) && /DO NOT SHIP -- NOT RUN/.test(lines[lines.length - 1] || "") &&
            notReady.includes(`--prefix "${path.join(stubEng, "tools", "render-qa")}"`) && !notReady.includes("cd somewhere"),
            `exit ${r.status}; verify ${fs.existsSync(ran) ? "RAN" : "not started"}; ${notReady.slice(0, 160)}`);
        // A SIGNAL WHILE THE CHECK IS STILL ASKING: driven live in a child, as section 6 drives its signals.
        if (process.platform !== "win32") {
            const standIn = path.join(dir, "verify-standin.mjs"); fs.writeFileSync(standIn, 'console.log("[verify] ALL GREEN");\n');
            const drv = path.join(dir, "pre-driver.mjs");
            fs.writeFileSync(drv, `import { main } from ${JSON.stringify(pathToFileURL(path.join(ENG, "tools", "ship", "shipVerdict.mjs")).href)};\n` +
                `await main({ eng: ${JSON.stringify(ENG)}, verifyPath: ${JSON.stringify(standIn)}, scan: () => ({ scanned: 0, hits: [] }),\n` +
                `  preflight: async () => { console.log("[preflight] waiting"); await new Promise((r) => setTimeout(r, 20000)); return []; } });\n`);
            const mid = await new Promise((resolve) => {
                const p = spawn(process.execPath, [drv], { stdio: ["ignore", "pipe", "pipe"] });
                let o = "", sent = false;
                const t = setTimeout(() => { try { p.kill("SIGKILL"); } catch {} }, 15000);
                p.stdout.on("data", (b) => { o += b; if (!sent && o.includes("[preflight] waiting")) { sent = true; p.kill("SIGHUP"); } });
                p.on("close", (code, signal) => { clearTimeout(t); resolve({ code, signal, o, sent }); });
            });
            ok("!! *** a SIGHUP while the readiness check is still asking leaves the trailer, exit 1 -- the handlers are in before it runs ***",
                mid.sent && mid.code === 1 && /interrupted by SIGHUP/.test(mid.o) && /\[ship\] DO NOT SHIP -- NO VERDICT/.test(mid.o),
                `sent=${mid.sent} exit=${mid.code} signal=${mid.signal}; ${mid.o.trim().split("\n").pop()}`);
        } else say("the mid-check SIGHUP row is driven on POSIX, for section 6's reason: child.kill(sig) is TerminateProcess on win32");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log("\n10. v4846 -- a clone without origin/main: scanRef says ABSENT by git's exit status, and the readiness check refuses it with the fetch");
// The rig's v4845 run was a `git clone --depth 1 --branch <line>`: an origin remote, origin/<line>, and no origin/main. Section 2
// went red on it (git grep words a missing ref "unable to resolve revision", which v4402's message match did not know), and
// verify ran its full 27 minutes before its version preflight and release-lag budget met the same absence. Driven on a REAL
// temp repo built to that shape, because the point is what git itself answers -- a stub of git would hold the old match too.
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shipverdict-main-"));
    // Nothing in the env may aim these calls at another repository (a hook's GIT_DIR would point every one at the real tree),
    // and no hook, signing key or identity of this box's may decide whether the fixture commit is made.
    const genv = { ...process.env };
    for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) delete genv[k];
    const git = (cwd, ...args) => spawnSync("git", ["-c", "user.name=selfcheck", "-c", "user.email=selfcheck@localhost", "-c", "commit.gpgsign=false",
        "-c", "core.hooksPath=" + path.join(dir, "no-hooks"), ...args], { cwd, env: genv, encoding: "utf8" });
    try {
        const clone = path.join(dir, "clone"), cloneEng = path.join(clone, "WebGLEngine");
        const zipEng = path.join(dir, "zip", "WebGLEngine"), lost = path.join(dir, "lost");
        fs.mkdirSync(cloneEng, { recursive: true }); fs.mkdirSync(zipEng, { recursive: true }); fs.mkdirSync(lost);
        // One committed file with a marker at line start, so the control row proves a ref that IS here still reads its hits.
        fs.writeFileSync(path.join(cloneEng, "marked.txt"), "<<<<<<< fixture\n");
        git(clone, "init", "-q"); git(clone, "add", "-A"); git(clone, "commit", "-q", "-m", "fixture");
        git(clone, "remote", "add", "origin", "https://example.invalid/never-fetched.git");
        git(clone, "update-ref", "refs/remotes/origin/line", "HEAD");
        // A checkout git cannot open: its .git names a folder that is not there (a worktree whose repository moved). Its .git
        // also stops git walking up past it, so this answer cannot come from whatever repository the temp folder sits in.
        fs.writeFileSync(path.join(lost, ".git"), "gitdir: " + path.join(dir, "moved-away") + "\n");
        const built = git(clone, "rev-parse", "--verify", "--quiet", "refs/remotes/origin/line^{commit}").status === 0;
        const grepSays = String(git(clone, "grep", "-c", "x", "origin/main", "--", ".").stderr || "").trim().split("\n")[0];

        const absentRef = SV.scanRef(clone, "origin/main");
        ok("!! *** a clone with an origin remote and no origin/main: scanRef says ABSENT, from git's exit status, and reads no hits ***",
            built && absentRef.ok === false && absentRef.absent === true && absentRef.why === "origin/main is not in this clone" && absentRef.hits.length === 0,
            `${built ? "" : "FIXTURE NOT BUILT -- "}${JSON.stringify(absentRef)}; git grep itself says ${JSON.stringify(grepSays)}`);
        const OLD = /unknown revision|not a valid object|ambiguous argument/i;
        ok("!! *** ...and section 2's one allowed skip takes that answer -- keyed on `absent`, never on git's message ***",
            onlySkip(absentRef),
            `v4402's message match on what git grep says here ${OLD.test(grepSays) ? "would match too" : "would NOT match -- the red the rig's clone carried"}`);
        const lineRef = SV.scanRef(clone, "origin/line"), lostRef = SV.scanRef(lost, "origin/main");
        ok("CONTROL: a ref the clone HAS still reads its marker, and a checkout git cannot open is NOT absent -- that stays red in section 2",
            lineRef.ok === true && lineRef.absent !== true && lineRef.hits.length === 1 && lineRef.hits[0].count === 1 &&
            lostRef.ok === false && lostRef.absent !== true && !onlySkip(lostRef),
            `origin/line: ${lineRef.hits.map((h) => h.file + " x" + h.count).join(", ") || "no hits"}; unopenable: ${String(lostRef.why).split("\n")[0].slice(0, 80)}`);

        // readiness() itself, with its DEFAULT origin/main probe and the browser said ready, on each of the four shapes of tree.
        const ready = () => ({ chromium: {}, from: "playwright" }), shellOk = () => "", noDxc = () => ({ needed: false });
        const ask = (eng) => SV.readiness({ resolve: ready, shell: "", skipReason: shellOk, dxc: noDxc, eng });
        const FETCH = "-- to fix: git fetch --depth 1 origin main:refs/remotes/origin/main";
        const absent = ask(cloneEng);
        ok("!! *** ABSENT: the readiness check refuses before verify, in one line naming the fetch that brings origin/main ***",
            SV.originMainState(cloneEng) === "absent" && absent.length === 1 && absent[0].what.startsWith("origin/main is not in this clone") &&
            absent[0].what.endsWith(FETCH),
            absent.map((n) => n.what).join(" | ") || "readiness said ready on a clone with no origin/main");
        const both = SV.readiness({ resolve: () => ({ chromium: null, from: "" }), shell: "", skipReason: () => "FIXTURE no playwright", dxc: noDxc, eng: cloneEng });
        ok("...and with the browser missing too, the ONE refusal names both, the browser's first -- the order readiness() gives and why",
            both.length === 2 && /^the browser gates cannot run here: FIXTURE/.test(both[0].what) && both[1].what.endsWith(FETCH),
            both.map((n) => n.what.slice(0, 60)).join(" | "));
        git(clone, "update-ref", "refs/remotes/origin/main", "HEAD");
        const present = ask(cloneEng);
        ok("CONTROL: PRESENT -- the same clone once origin/main exists is not refused",
            SV.originMainState(cloneEng) === "present" && present.length === 0, JSON.stringify(present).slice(0, 160));
        git(clone, "remote", "remove", "origin");
        const noOrigin = ask(cloneEng), noOriginState = SV.originMainState(cloneEng);
        ok("NO ORIGIN: a checkout with no 'origin' remote (and so no origin/main) is not refused -- there is nothing a fetch could name",
            noOriginState === "no-origin" && noOrigin.length === 0, `state ${noOriginState}; ${JSON.stringify(noOrigin).slice(0, 140)}`);
        const zip = ask(zipEng), zipState = SV.originMainState(zipEng);
        ok("NOT A REPO: a release zip's tree (no .git) is not refused",
            zipState === "not-a-repo" && zip.length === 0, `state ${zipState}; ${JSON.stringify(zip).slice(0, 140)}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ---- 11. v4847 -- THE LIMIT THIS FILE PICKS IS DECLARED, AND THE DECLARATION IS THE CODE'S -----------------------
// v4846's git probes made shipVerdict a runner that PICKS a limit (timeout: 15000), and tools/ship/runnerBudget-selfcheck.mjs
// counted it silent: the step-4b run of v4847 found it. budgetIsOwn says why; this row holds it to the code, so the reason
// cannot outlive the number it explains.
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "shipVerdict.mjs"), "utf8")
        .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    const picked = [...src.matchAll(/timeout:\s*(\d+)/g)].map((m) => Number(m[1]));
    // v4871: two limits now -- the label check's fetch of every branch head joined the git probes, and is declared beside them
    ok("!! budgetIsOwn names the limits shipVerdict picks -- 15 s on git probes, 180 s on the label's fetch, none on gates -- and the code picks no other",
        typeof SV.budgetIsOwn === "string" && /15 s/.test(SV.budgetIsOwn) && /180 s/.test(SV.budgetIsOwn) && /not gates/.test(SV.budgetIsOwn) &&
        picked.includes(15000) && picked.includes(180000) && picked.every((ms) => ms === 15000 || ms === 180000),
        `picked ${JSON.stringify(picked)}; ${String(SV.budgetIsOwn).slice(0, 80)}`);
}

say("WHAT THIS DOES NOT CLAIM. That a round cannot be pushed unverified -- nothing in a repository can stop a " +
    "person from typing `git push`. What it does is make the unverified push LEAVE A MARK the next gate run " +
    "finds, on origin/main and not merely here, and remove the incentive that produced this one by making the " +
    "ritual's last line a rendering of the exit code rather than a thing to be read past. It also cannot see a " +
    "conflict resolved WRONGLY -- markers gone, semantics broken -- which is a different and harder question " +
    "that the gates for the affected files answer, and which is why gateSweep-selfcheck was the thing that " +
    "first told me v4404's merge was bad.");

REPORT.write();
console.log(`\nshipVerdict-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
