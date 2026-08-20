// tools/ship/launcherHold-selfcheck.mjs
//
// Run: node tools/ship/launcherHold-selfcheck.mjs   (instant)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3085 -- A LAUNCHER THAT RUNS A DAEMON IN THE FOREGROUND MUST HOLD THE WINDOW ON EVERY EXIT PATH.
//
// Keith: "why does the start node engine bat start and exit instead of staying running?" The answer was in the
// last ten lines of START_NODE_Engine.bat. Its exit handling had THREE states and TWO branches:
//
//     if superseded        -> say so, close (correct: the successor is already serving)
//     else if nonzero      -> say so, PAUSE   (correct: a crash, and the reason is on screen)
//     <nothing>            -> a clean exit fell through both, printed NOTHING, and the window closed
//
// EXIT CODE 0 MEANS TWO DIFFERENT THINGS AND THE LAUNCHER ONLY KNEW ONE OF THEM. For a batch job, zero means
// "no error" and closing quietly is right. For a DAEMON, zero means the server decided to stop -- and for a
// thing whose entire job is to keep running, stopping IS the event worth reporting. The launcher was reading a
// daemon's exit with a batch job's dictionary, so the single case that most needed explaining was the single
// case it stayed silent about. Same shape as the timeout reported as a failure (v3076) and the count that was
// really a cap (v3043): two different things wearing one label.
//
// server.js genuinely does exit 0 on purpose -- the auto-update spawns a detached successor and calls
// process.exit(0) about 400ms later -- which is why the supersede branch exists. A clean exit WITHOUT the
// marker therefore means the marker was not written, or something else stopped the server. Both are findings.
// Neither should close the window on top of the answer.
//
// WHAT THIS GATE ASSERTS, and it is a property rather than a wording: for every launcher that runs a long-lived
// server in the FOREGROUND, the exit-code handling that follows must be TOTAL -- every branch covered, with a
// hold on the ones a person needs to read. An if/else-if chain with no final else is the defect, and it is
// detectable without running anything, which matters because the sandbox has no cmd.exe. This is the third face
// of the session's pattern: the rig runs it, and reading is what catches it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");   // the project root, where the .bat launchers live

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (s) => console.log("  ----  " + s);

// A launcher runs a daemon in the foreground if it has a bare `node server.js` / `bun server.js` line -- no
// `start` prefix, which would background it. Comments are stripped so the REM blocks explaining the rule are
// not mistaken for the rule being broken; that is prose-as-code, hit ten times in this tree.
const stripRem = (s) => s.split(/\r?\n/).filter((l) => !/^\s*(REM\b|::)/i.test(l)).join("\n");
const FOREGROUND = /^\s*(?:node|bun|deno)\s+[^\r\n]*server\.js\s*$/im;

const launchers = fs.readdirSync(ROOT).filter((f) => f.toLowerCase().endsWith(".bat")).sort();
const daemons = [];
for (const f of launchers) {
    let raw; try { raw = fs.readFileSync(path.join(ROOT, f), "latin1"); } catch { continue; }
    const code = stripRem(raw);
    if (FOREGROUND.test(code)) daemons.push({ f, code });
}

// ---- 1. THE CENSUS IS REAL ----------------------------------------------------------------------------------------
{
    say(launchers.length + " .bat launchers at the project root; " + daemons.length +
        " run a server in the FOREGROUND: " + daemons.map((d) => d.f).join(", "));
    ok("the scan finds the launcher Keith actually uses",
        daemons.some((d) => d.f === "START_NODE_Engine.bat"),
        "a gate that missed the file the report came from would be worse than none");
    ok("...and it does not sweep in the backgrounded ones",
        daemons.length < launchers.length,
        daemons.length + " of " + launchers.length + ". A launcher that BACKGROUNDS its server with `start` has " +
        "nothing to hold -- demanding a pause there would be ceremony, and ceremony gets checks switched off");
}

// ---- 2. THE EXIT HANDLING MUST BE TOTAL ----------------------------------------------------------------------------
// v3088 -- I PINNED THIS TO A MECHANISM AND IT WENT RED FOR THE CORRECT FIX. THREE ROUNDS AFTER NAMING THE
// SPECIES. v3085 asserted that the tail contained an if/else-if chain ending in `) else (`, which was the shape
// START_NODE_Engine.bat happened to have. v3088 then did the right thing -- extracted the three-way judgement
// into ONE file, swek_exit_report.bat, so four launchers stopped carrying four copies of it -- and every
// launcher lost its inline chain. The check went red for a refactor that strictly improved what it was guarding.
// TWELFTH INSTANCE, and the first I have committed myself since writing the law down.
//
// THE PROPERTY, WHICH SURVIVES ANY MECHANISM. After a foreground server a launcher must:
//   (a) CAPTURE the real exit code -- %ERRORLEVEL% goes stale after the very next command, so this is not
//       optional bookkeeping, it is the only moment the number exists;
//   (b) HAND IT TO SOMETHING THAT EXPLAINS IT -- the shared reporter, or an inline chain that is total;
//   (c) PROPAGATE it. `exit /b 0` after a daemon is not missing error handling, IT IS ASSERTING SUCCESS: a
//       crash and a clean run leave the same trace, and every caller is told the engine ran fine.
// (c) is the one that matters most and the one v3085's mechanism check could not see at all.
{
    const tailOf = (code) => code.slice(code.search(FOREGROUND));
    const judge = (code) => {
        const t = tailOf(code);
        const captured = /set\s+"?[A-Z_]*RC[A-Z_]*=%ERRORLEVEL%"?/i.test(t) || /if\s+errorlevel/i.test(t);
        const explained = /swek_exit_report\.bat/i.test(t) || /\)\s*else\s*\(/i.test(t) || /^\s*pause\s*$/im.test(t);
        // AN exit /b 0 ON A SUPERSEDE PATH IS NOT A LIE, IT IS THE TRUTH -- an auto-update really did succeed,
        // and START_BUN_Full.bat has one under a :_swek_superseded label. The first run of this check reported
        // that file as "asserts success", which was the wrong REASON for a right verdict: it IS uncovered, but
        // because nothing explained a normal exit, not because it claimed a false one. A MESSAGE THAT TELLS YOU
        // WHERE TO LOOK HAD BETTER BE RIGHT, which is what the launcher three lines above says about its own.
        const lines = t.split(/\r?\n/);
        const lies = lines.some((ln, k) => /^\s*exit\s+\/b\s+0\s*$/i.test(ln) &&
                !lines.slice(Math.max(0, k - 4), k).some((prev) => /superseded/i.test(prev))) &&
            !/exit\s+\/b\s+%[A-Z_]*RC[A-Z_]*%/i.test(t);
        return { captured, explained, propagates: !lies };
    };
    const bad = [];
    for (const d of daemons) {
        const j = judge(d.code);
        const missing = [!j.captured && "does not capture the exit code",
                         !j.explained && "nothing explains the exit",
                         !j.propagates && "asserts success with exit /b 0"].filter(Boolean);
        if (missing.length) bad.push(d.f + " -- " + missing.join("; "));
    }
    for (const x of bad) say("uncovered: " + x);
    ok("!! every foreground launcher captures, explains and PROPAGATES its server's exit code",
        bad.length === 0,
        bad.length ? "see above" : daemons.length + " launchers. `exit /b 0` after a daemon asserts success -- " +
        "three of these did exactly that, so a crash returned zero to the auto-updater");

    // ONE DEFINITION OF THE JUDGEMENT. Four copies of a three-way message is how the fifth gets it wrong, and
    // this tree has watched three definitions of "a gate exists here" disagree for 153 versions.
    const reporters = fs.readdirSync(path.join(ROOT, "WebGLEngine", "tools", "ship"))
        .filter((f) => f.toLowerCase() === "swek_exit_report.bat");
    ok("...and the message they share has exactly ONE definition",
        reporters.length === 1 && daemons.every((d) => /swek_exit_report\.bat/i.test(tailOf(d.code))),
        "all " + daemons.length + " route through WebGLEngine/tools/ship/swek_exit_report.bat");

    ok("!! the reporter distinguishes all three outcomes, not two",
        (() => {
            const r = fs.readFileSync(path.join(ROOT, "WebGLEngine", "tools", "ship", "swek_exit_report.bat"), "latin1");
            return /swek_superseded\.flag/i.test(r) && /not "%RC%"=="0"/i.test(r) && /STOPPED CLEANLY/i.test(r);
        })(),
        "superseded, crashed, and stopped-cleanly. Two branches is what made a clean stop invisible");
}

// ---- 3. THE DETECTOR HAS POWER, BOTH WAYS --------------------------------------------------------------------------
{
    const chainNoElse = 'node server.js\r\nset "NODE_RC=%ERRORLEVEL%"\r\nif not "%NODE_RC%"=="0" (\r\n  pause\r\n)\r\n';
    const chainElse = chainNoElse.replace(/\)\r\n$/, ") else (\r\n  echo stopped cleanly\r\n  pause\r\n)\r\n");
    const detect = (code) => {
        const tail = code.slice(code.search(FOREGROUND));
        return /if\s+not\s+"%NODE_RC%"/i.test(tail) ? /\)\s*else\s*\(/i.test(tail) : /^\s*pause\s*$/im.test(tail);
    };
    ok("SABOTAGE: a chain with no final else IS detected", detect(chainNoElse) === false,
        "this is the exact shape START_NODE_Engine.bat had -- nonzero handled, zero silently dropped");
    ok("...and adding the catch-all clears it", detect(chainElse) === true);
    ok("!! a REM block explaining the rule is not mistaken for breaking it",
        stripRem('REM if not "%NODE_RC%"=="0" ( pause )\r\nnode server.js\r\n').includes("NODE_RC") === false,
        "the launcher now carries a long comment about exactly this chain. Matching raw text would report the " +
        "explanation as the violation -- prose-as-code, which this tree has hit ten times");
}

// ---- 5. v3096: TWO WAYS A LAUNCHER LIES BY OMISSION --------------------------------------------------------------
// Both found while diagnosing a real failure Keith hit: the engine exited instantly, the KPop listener never
// started, and the GPU Brain came up alone. A stale instance was holding :8787. A RESTART FIXED IT, and a
// restart should never be the diagnostic -- everything needed to say so was already on the machine.
{
    const eng = fs.readFileSync(path.join(ROOT, "START_NODE_Engine.bat"), "latin1");
    const code = stripRem(eng);

    // (a) `if errorlevel N` IS A THRESHOLD. cmd reads it as ">= N", so a guard returning anything at or above
    // its skip code is read as "skip". kpop-guard.ps1 intends only 0 or 42; powershell.exe returns codes of its
    // own when it cannot run a script at all, and a >= test cannot tell those apart.
    ok("!! the KPop guard's exit code is compared EXACTLY, not by threshold",
        /%ERRORLEVEL%\s+EQU\s+42/.test(code) && !/if\s+errorlevel\s+42/i.test(code),
        "`if errorlevel 42` means >= 42. 'The guard said skip' and 'the guard fell over' sharing one branch is " +
        "the two-things-one-label shape, in the step that decides whether the listener runs at all");
    ok("...and an out-of-contract code is reported rather than swallowed",
        /GTR\s+42/.test(code),
        "the guard documents exactly two codes. Anything else is a fact about the guard, and the launcher says " +
        "so instead of guessing which of the two it meant");

    // (b) v3097 -- THESE TWO CHECKS PINNED THE INLINE BLOCK v3096 WROTE HERE, AND v3097 EXTRACTED IT TO
    // swek_free_port.bat so five launchers could share one definition. FOURTEENTH MECHANISM-PIN, committed by
    // me one round after the thirteenth. What this file owns is that the launcher DEFERS; what the shared check
    // DOES is section 6's business, tested against the shared file itself.
    ok("!! the launcher defers the port check instead of carrying its own",
        /swek_free_port\.bat/.test(code) && !/netstat -ano[^\r\n]*8787/.test(code),
        "one call, no hand-rolled copy beside it. WHERE the check lives is not this section's business");
}

// ---- 6. v3097: ONE OWNER OF "FREE PORT 8787" ---------------------------------------------------------------------
// There were SIX hand-rolled copies of this job across five launchers and no two were alike: START_BUN.bat had
// THREE, START_BUN_Full.bat and run_node_full.bat one each written differently, and START_NODE_Full.bat had
// NONE -- it went straight to binding a port it never tried to clear. Five of the six sent both streams to nul
// one line before the server that then could not bind, so an EADDRINUSE had its cause printed nowhere.
{
    const SHARED = path.join(ROOT, "WebGLEngine", "tools", "ship", "swek_free_port.bat");
    let shared = ""; try { shared = fs.readFileSync(SHARED, "latin1"); } catch {}
    ok("the shared port check exists", shared.length > 0, "WebGLEngine/tools/ship/swek_free_port.bat");

    // ONE OWNER IS A CLAIM ABOUT ABSENCE -- the v3093 lesson. Asserting the call is present says nothing about
    // a hand-rolled copy still sitting beside it.
    // SCOPED TO LAUNCHERS THAT RUN A SERVER. The first run swept all 17 .bat files and flagged
    // FREE_PORT_8787.bat -- a standalone diagnostic whose ENTIRE JOB is to report what holds the port, so its
    // netstat is the tool, not a duplicate of one. A one-owner rule aimed at everything catches the owner.
    const own = daemons.filter((d) => /netstat -ano[^\r\n]*8787/.test(d.code)).map((d) => d.f);
    ok("!! no launcher still frees the port its own way",
        own.length === 0,
        own.length ? "offenders: " + own.join(", ") : "all six copies replaced by one call. Six spellings of one " +
        "job is how five of them ended up silent and the sixth ended up missing");

    ok("!! every FOREGROUND-server launcher calls it before binding",
        daemons.every((d) => /swek_free_port\.bat/.test(d.code)),
        daemons.map((d) => d.f).join(", ") + ". START_NODE_Full.bat had no port check at all before this -- a stale " +
        "instance meant an instant exit with nothing said");

    // The shared file must do the three things the copies did not.
    ok("...and the shared check NAMES the holder, does not silence the kill, and VERIFIES",
        /held by PID %SWEK_HOLDER%/.test(shared) &&
        !/taskkill[^\r\n]*>nul/.test(shared) &&
        (shared.match(/netstat -ano/g) || []).length >= 2,
        "a kill can report success and still leave the socket held, so it asks twice. Silencing the kill one " +
        "line before the bind is what made this invisible for six copies");
    ok("...and reads its variable OUTSIDE a parenthesised block",
        /if not defined SWEK_HOLDER goto/.test(shared) && !/if defined SWEK_HOLDER \(/.test(shared),
        "cmd expands %vars% in a block at PARSE time, so `if defined X ( echo %X% )` prints nothing -- the " +
        "v2068 KPMIN bug, which the first draft of the v3096 fix repeated. gotos throughout");
}

console.log();
if (fails) { console.log("launcherHold-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("launcherHold-selfcheck: all checks pass");
