// WebGLEngine/tools/ship/shipVerdict-selfcheck.mjs
//
// Run: node tools/ship/shipVerdict-selfcheck.mjs   (~12.7s — re-measured v4804: 13.1 s alone (median of three; one run read 65.7 s), 12.3 s the sweep's serial median; it read ~4.9s -- MEASURED at v4680; was ~0.83s before section 6's live drivers)
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
{
    ok("!! *** the working tree is clean of conflict markers ***", scan.hits.length === 0,
        scan.hits.length ? scan.hits.map((h) => h.file + ":" + h.marks.map((x) => x.line).join("/")).join(", ")
                         : `${scan.scanned} tracked files read in full -- no allowance list, no ceiling`);
    const ref = SV.scanRef(ROOT, "origin/main");
    if (!ref.ok) {
        // Narrowed on purpose (v4402): the ONLY thing that excuses this row is the ref being absent, because an
        // absence read as a skip is an absence read as a pass, and that is what this whole round is about.
        ok("origin/main could not be read, and that is the only skip allowed here", /unknown revision|not a valid object|ambiguous argument/i.test(ref.why || ""),
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

console.log("\n7. v4832 -- a tree that cannot launch a browser is refused before verify runs, and the last line says what to type");
// The rig's v4819 verify ran in a hand-typed, unprovisioned clone and came back after the whole sweep with 104 NEW reds, 103 of
// them one missing playwright. Driven against a stand-in verify that leaves a file behind when it runs, so "verify was not run"
// is read off the disk and not off the message that claims it. The conflict scan is stubbed: a first draft let two drives read
// all 6,772 tracked files each, and this gate measured 25.6 s against its ~12.7s header -- past declaredCost's 2x line.
// main() is driven IN THIS PROCESS here, and it registers handlers for every catchable signal whose `exit` is these drives'
// stub -- so each drive's listeners are removed after it, or this gate would ignore Ctrl+C for the rest of its run.
// SABOTAGES (v4832, each restored by copy):
//   * main()'s pre-flight block skipped                          -> 7 red: the three refusal rows, the cannot-run control
//     (its report line is printed by that block), the CLI-route row, the real-CLI row and the mid-pre-flight SIGHUP row
//     (its driver's pre-flight never announces itself); the empty-pre-flight control stayed green
//   * provisioning() asks THIS file's resolver instead of eng's   -> the "asks the tree's resolver" row and the CLI-route row
//   * the pre-flight applied to a stand-in verify as well         -> the default-route row went red alone
//   * main() reads `preflight` alone, dropping the default        -> 2 red, the CLI-route row and the real-CLI row (review: every
//     row before them passes an explicit pre-flight, so this mutation was green on all of them)
//   * fixCommand back to the reason's "cd <render-qa> && ..."    -> the command row went red alone
//   * the CLI line itself passes `preflight: null`                -> the real-CLI row went red alone: main() was refusing, the
//     command was not (review: the earlier rows call main() directly and never run that line)
//   * the CLI line takes its tree from process.cwd()               -> the real-CLI row went red alone, run from outside the stub
//     (review: run from inside it, the row could not tell the two apart)
//   * the REAL playwrightResolve's browserSkipReason renamed      -> the real-resolver row went red alone, "pr.browserSkipReason
//     is not a function"; every other row uses a stub that copies the API, so it was green on all of them
//   CONTROL, not a sabotage: the CLI line passing the real verify.mjs explicitly still refuses -- the pre-flight keys on the
//     tree's own verify.mjs, not on the argument being absent (review found that version green on every row, refusing nothing)
//   * the listeners left in place after each drive                -> the listener row went red alone
//   * the pre-flight moved back above the handler registration    -> the mid-pre-flight SIGHUP row went red alone: exit null,
//     signal SIGHUP, and the last line the driver printed was its own "[preflight] waiting"
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shipverdict-pre-"));
    const ran = path.join(dir, "ran");
    const standIn = path.join(dir, "verify-standin.mjs");
    fs.writeFileSync(standIn, `import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(ran)}, "1");\nconsole.log("[verify] ALL GREEN");\n`);
    const noScan = () => ({ scanned: 0, hits: [] });
    const listening = () => SV.CATCHABLE.map((sig) => process.listeners(sig));
    const before = listening();
    const settle = () => SV.CATCHABLE.forEach((sig, i) => {
        for (const l of process.listeners(sig)) if (!before[i].includes(l)) process.removeListener(sig, l);
    });
    const drive = async (opts) => {
        const lines = []; let code = null;
        try { fs.rmSync(ran, { force: true }); } catch {}
        try {
            const d = await SV.main({ eng: ENG, verifyPath: standIn, scan: noScan, out: (m) => lines.push(m), exit: (c) => { code = c; }, ...opts });
            return { d, code, lines, ran: fs.existsSync(ran) };
        } finally { settle(); }
    };
    const FIX = SV.fixCommand("/x", { playwright: false, shell: true });
    const no = await drive({ preflight: async () => ({ why: "playwright is not installed here -- tried: playwright (a headless shell at /s IS present) -- to fix: cd /x/tools/render-qa && npm install --ignore-scripts", fix: FIX }) });
    ok("*** a pre-flight that names a missing browser refuses: exit 1, and the stand-in verify never ran ***",
        no.code === 1 && !no.ran && no.d && no.d.ship === false, `exit=${no.code} ran=${no.ran}`);
    const last = no.lines[no.lines.length - 1] || "";
    ok("...and the LAST line is the verdict, naming NOT PROVISIONED and the command that fixes it",
        last.startsWith("[ship] DO NOT SHIP -- NOT PROVISIONED") && last.includes(`to fix: ${FIX}, then run this again`), last);
    ok("...and the full reason is printed above it, so the tried list survives for a box whose layout is new -- without its cd",
        no.lines.some((l) => l.startsWith("[ship] NOT PROVISIONED: playwright is not installed here") && !l.includes("cd /x")), `${no.lines.length} line(s)`);
    const yes = await drive({ preflight: async () => "" });
    ok("!! CONTROL: an empty pre-flight runs verify exactly as before, to its SHIP",
        yes.code === 0 && yes.ran && yes.d.ship === true, `exit=${yes.code} ran=${yes.ran}`);
    const thrown = await drive({ preflight: async () => { throw new Error("resolver module missing"); } });
    ok("!! CONTROL: a pre-flight that cannot run is reported and verify runs anyway -- it saves a sweep, it never blocks one",
        thrown.ran && thrown.code === 0 && thrown.lines.some((l) => l.includes("pre-flight could not run")), `exit=${thrown.code} ran=${thrown.ran}`);
    ok("...and the drives leave no signal handler behind: each one main() added is removed, so this gate still stops on Ctrl+C",
        SV.CATCHABLE.every((sig, i) => process.listeners(sig).length === before[i].length),
        SV.CATCHABLE.map((sig, i) => `${sig} ${before[i].length}->${process.listeners(sig).length}`).join(", "));
    ok("...and the default asks only for the real verify, and not when the quick sweep is switched off; a given one is used as given",
        SV.preflightFor({ verifyPath: null, env: {} }) === SV.provisioning && SV.preflightFor({ verifyPath: standIn, env: {} }) === null &&
        SV.preflightFor({ verifyPath: null, env: { SWEK_QUICKSWEEP: "0" } }) === null &&
        SV.preflightFor({ eng: ENG, verifyPath: path.join(ENG, "tools", "ship", "verify.mjs"), env: {} }) === SV.provisioning &&
        SV.preflightFor({ verifyPath: standIn, preflight: SV.provisioning, env: { SWEK_QUICKSWEEP: "0" } }) === SV.provisioning,
        "the tree's own verify.mjs named explicitly is still the real one; section 6's drivers pass a stand-in and no pre-flight, " +
        "so they run whatever this box has installed; SWEK_QUICKSWEEP=0 " +
        "skips the sweep every browser gate runs in, so there is nothing for a missing browser to fail");
    // The command must work as typed from wherever the console is: no cd, the directory named once and quoted, and the browser
    // fetched only where it is missing (render-qa's postinstall is `playwright install chromium chromium-headless-shell`).
    const W = "C:\\SweK clone\\WebGLEngine", rqa = path.join(W, "tools", "render-qa");
    const cmds = [[false, true], [false, false], [true, false]].map(([playwright, shell]) => SV.fixCommand(W, { playwright, shell }));
    ok("...and the command names render-qa by --prefix, quoted, never by cd -- so the next line, run this again, works as typed",
        cmds.every((c) => c.startsWith("npm install ") && c.endsWith(`--prefix "${rqa}"`) && !/\bcd\b/.test(c)) &&
        cmds[0].includes("--ignore-scripts") && !cmds[1].includes("--ignore-scripts") && !cmds[2].includes("--ignore-scripts"),
        cmds.join(" | "));
    const plain = SV.unprovisionedLines("no browser here"), built = SV.unprovisionedLines({ why: "no browser -- to fix: cd x && y", fix: "z" });
    ok("...and unprovisionedLines takes a plain reason as well as provisioning's { why, fix }, and ends on the verdict either way",
        plain.length === 4 && plain[0] === "[ship] NOT PROVISIONED: no browser here" && /^\[ship\] DO NOT SHIP -- NOT PROVISIONED.*verify was not run$/.test(plain[3]) &&
        built[0] === "[ship] NOT PROVISIONED: no browser" && built[3].endsWith("-- to fix: z, then run this again"),
        `${plain[3]} | ${built[3]}`);
    // provisioning() must ask THE TREE BEING VERIFIED, not the copy of the resolver beside this file: a stub tree whose resolver
    // finds nothing has to come back with that tree's reason.
    const stubEng = path.join(dir, "eng"), stubShip = path.join(stubEng, "tools", "ship");
    fs.mkdirSync(stubShip, { recursive: true });
    fs.writeFileSync(path.join(stubShip, "playwrightResolve.mjs"),
        'export function resolvePlaywright() { return { chromium: null, from: "" }; }\n' +
        'export function browserSkipReason(c) { return c ? "" : "stub tree: no playwright -- to fix: cd stub && npm install"; }\n');
    const stubWhy = await SV.provisioning(stubEng);
    ok("...and provisioning() asks the resolver of the tree it is handed, not the one beside this file",
        stubWhy && stubWhy.why === "stub tree: no playwright -- to fix: cd stub && npm install" &&
        stubWhy.fix === SV.fixCommand(stubEng, { playwright: false, shell: false }), JSON.stringify(stubWhy));
    // *** AND THE ROUTE THE CLI TAKES, END TO END. *** Review of the first draft: every row above passes an explicit pre-flight or
    // calls preflightFor directly, so main() could drop the default -- the one thing the rig's typed command depends on -- with
    // every row green. Here main() gets the stub tree, no verifyPath and no pre-flight, exactly as the CLI calls it; the stub's
    // verify.mjs leaves its own file if it is ever run.
    const stubRan = path.join(dir, "stub-ran");
    fs.writeFileSync(path.join(stubShip, "verify.mjs"), `import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(stubRan)}, "1");\nconsole.log("[verify] ALL GREEN");\n`);
    const cliLines = []; let cliCode = null;
    try { await SV.main({ eng: stubEng, env: {}, scan: noScan, out: (m) => cliLines.push(m), exit: (c) => { cliCode = c; } }); } finally { settle(); }
    ok("*** ...and main() called as the CLI calls it -- no verifyPath, no pre-flight -- refuses the unprovisioned tree before its verify runs ***",
        cliCode === 1 && !fs.existsSync(stubRan) && (cliLines[cliLines.length - 1] || "").startsWith("[ship] DO NOT SHIP -- NOT PROVISIONED"),
        `exit=${cliCode} verify ran=${fs.existsSync(stubRan)}; ${cliLines[cliLines.length - 1] || "(no lines)"}`);
    // *** AND THE CLI LINE ITSELF. *** The row above calls main() as the CLI does; this one RUNS the CLI: shipVerdict.mjs copied
    // into the stub tree finds that tree by its own location, as it does on the rig, so its resolver and its verify are the stub's.
    // It imports nothing but node's own modules, which is what lets the copy run there. Run from OUTSIDE the stub tree: review
    // found that with the stub as its cwd, a CLI that took its tree from the cwd instead of its own location passed this row.
    fs.copyFileSync(path.join(ENG, "tools", "ship", "shipVerdict.mjs"), path.join(stubShip, "shipVerdict.mjs"));
    const cliEnv = { ...process.env }; delete cliEnv.SWEK_QUICKSWEEP;
    const real = spawnSync(process.execPath, [path.join(stubShip, "shipVerdict.mjs"), "--version", "v0"], { cwd: dir, env: cliEnv, encoding: "utf8", timeout: 60000 });
    const realLast = String(real.stdout || "").trim().split("\n").pop() || "";
    ok("*** ...and the command itself, run in that tree, refuses it: exit 1, its verify never ran, and the last line says what to type ***",
        real.status === 1 && !fs.existsSync(stubRan) && realLast.startsWith("[ship] DO NOT SHIP -- NOT PROVISIONED") && realLast.includes("npm install"),
        `exit=${real.status} verify ran=${fs.existsSync(stubRan)}; ${realLast}`);
    // *** AND THE REAL RESOLVER, AS provisioning() CALLS IT. *** Every row above hands main() a pre-flight or a stub resolver that
    // copies the API rather than reading it. provisioning() reaches this tree's playwrightResolve.mjs by a computed import that no
    // static import check can see, and a pre-flight that throws is reported and verify runs anyway -- so a drift in that API
    // would put the rig back on the 104-red sweep with every row green (review of v4832). Asked here of this tree's own resolver,
    // and checked against what the resolver says when asked directly.
    let realPre, realThrew = "";
    try { realPre = await SV.provisioning(ENG); } catch (e) { realThrew = String(e && e.message); }
    let direct = null;
    try {
        const PR = await import(pathToFileURL(path.join(ENG, "tools", "ship", "playwrightResolve.mjs")).href);
        const asked = PR.resolvePlaywright(); direct = PR.browserSkipReason(asked.chromium, asked.from) || "";
    } catch (e) { realThrew = realThrew || "asked directly: " + String(e && e.message); }
    ok("!! *** ...and provisioning() runs against this tree's REAL resolver without throwing, and agrees with it asked directly ***",
        !realThrew && direct !== null && (direct === "" ? realPre === "" : !!realPre && realPre.why === direct && /^npm install /.test(realPre.fix)),
        realThrew ? `THREW: ${realThrew}` : (direct === "" ? "this box resolves a browser, and provisioning() returned \"\"" :
            `this box does not: ${String(realPre && realPre.fix)}`));
    // *** AND A SIGNAL DURING THE PRE-FLIGHT STILL LEAVES THE TRAILER. *** Review of this round: the first version asked the
    // resolver BEFORE registering section 6's handlers, so a SIGHUP in that window (537-681 ms, measured) ended the process with
    // the start line and nothing else -- the shape section 6's control row says means only an uncatchable kill. Driven live,
    // in a child, like section 6: the pre-flight announces itself and waits, and is sent a real SIGHUP while it waits.
    if (process.platform !== "win32") {
        const drv = path.join(dir, "pre-driver.mjs");
        fs.writeFileSync(drv, `import { main } from ${JSON.stringify(pathToFileURL(path.join(ENG, "tools", "ship", "shipVerdict.mjs")).href)};\n` +
            `await main({ eng: ${JSON.stringify(ENG)}, verifyPath: ${JSON.stringify(standIn)}, scan: () => ({ scanned: 0, hits: [] }),\n` +
            `  preflight: async () => { console.log("[preflight] waiting"); await new Promise((r) => setTimeout(r, 20000)); return ""; } });\n`);
        const mid = await new Promise((resolve) => {
            const p = spawn(process.execPath, [drv], { stdio: ["ignore", "pipe", "pipe"] });
            let o = "", sent = false;
            const t = setTimeout(() => { try { p.kill("SIGKILL"); } catch {} }, 15000);
            p.stdout.on("data", (b) => { o += b; if (!sent && o.includes("[preflight] waiting")) { sent = true; p.kill("SIGHUP"); } });
            p.on("close", (code, signal) => { clearTimeout(t); resolve({ code, signal, o, sent }); });
        });
        ok("!! *** a SIGHUP while the pre-flight is still asking leaves the trailer, exit 1 -- the handlers are in before it runs ***",
            mid.sent && mid.code === 1 && /interrupted by SIGHUP/.test(mid.o) && /\[ship\] DO NOT SHIP -- NO VERDICT/.test(mid.o),
            `sent=${mid.sent} exit=${mid.code} signal=${mid.signal}; ${mid.o.trim().split("\n").pop()}`);
    } else {
        say("the mid-pre-flight SIGHUP row is driven on POSIX, for section 6's reason: child.kill(sig) is TerminateProcess on win32");
    }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
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
