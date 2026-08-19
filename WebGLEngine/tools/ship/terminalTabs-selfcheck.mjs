// WebGLEngine/tools/ship/terminalTabs-selfcheck.mjs -- v3623
//
// Run: node tools/ship/terminalTabs-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// *** THIS SANDBOX HAS NO WINDOWS, NO cmd AND NO WINDOWS TERMINAL, SO NOTHING HERE RUNS THE LAUNCHER. ***
// What is checkable is the TEXT the launcher is made of, and three properties of it that would each be a real
// failure on Keith's box:
//
//   A FALLBACK EXISTS FOR EVERY wt SITE   -- wt.exe is absent on Windows 10 without Terminal and on Server.
//                                            A launcher that assumed it would start NOTHING, silently.
//   NO wt LINE CARRIES A BARE SEMICOLON   -- wt reads ";" as a SUBCOMMAND SEPARATOR, so one stray semicolon
//                                            slices one command into several malformed tabs. This is why the
//                                            KPop one-liner became a .ps1 file: it carried five.
//   THE RECURSION GUARD IS NOT INHERITED  -- the second launch's tab is created by the ALREADY-RUNNING wt
//                                            process, with its own environment, so a guard exported by this
//                                            script would not be visible and the launcher would bounce forever.
//
// AND THE ENGINE'S EXIT CHAIN MUST SURVIVE: `node server.js` still runs in the FOREGROUND of whatever window
// holds the launcher, so NODE_RC and swek_exit_report.bat are untouched. If the engine were handed to wt, this
// launcher would read WT's exit code instead of node's -- v3088's defect, which is why the launcher re-invokes
// ITSELF into a tab rather than launching the server into one.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(ENG, "..");
const BAT = path.join(ROOT, "START_NODE_Engine.bat");
const src = fs.readFileSync(BAT, "utf8");
const lines = src.split(/\r?\n/);
const code = lines.filter((l) => !/^\s*REM\b/i.test(l));
const wtLines = code.filter((l) => /\bwt(\.exe)?\b/i.test(l) && /new-tab/i.test(l));

// ---- 1. ALL THREE SURFACES REACH THE SAME NAMED WINDOW --------------------------------------------------------
{
    ok("!! all three surfaces have a wt launch", wtLines.length === 3,
       wtLines.length + " new-tab lines -- engine, KPop Listener, GPU Brain");
    ok("!! ...and every one of them TARGETS THE SAME NAMED WINDOW", wtLines.every((l) => /-w\s+swek\b/.test(l)),
       "`-w swek` is what makes this ONE window with three tabs rather than three tabbed windows: a named " +
       "window is JOINED by every later tab. Without the name each launch opens its own.");
    ok("...and each tab is titled, so the three are tellable apart",
       wtLines.every((l) => /--title\s+"/.test(l)),
       wtLines.map((l) => (l.match(/--title\s+"([^"]+)"/) || [])[1]).join(" | "));
}

// ---- 2. THE SEMICOLON, WHICH IS WHY THE KPOP ONE-LINER MOVED TO A FILE -----------------------------------------
{
    ok("!! no wt launch line carries a semicolon", wtLines.every((l) => !l.includes(";")),
       "wt reads ';' as a SUBCOMMAND SEPARATOR, so one stray semicolon slices a single command into several " +
       "malformed tabs. THE OLD INLINE KPOP COMMAND CARRIED FIVE.");
    const ps1 = path.join(ENG, "tools", "ship", "swek_kpop_tab.ps1");
    ok("!! ...and the KPop command is a FILE, not an escaped string", fs.existsSync(ps1),
       "escaping was not the fix -- that string also nests single and double quotes. A file is ONE TOKEN.");
    const w = fs.readFileSync(ps1, "utf8");
    ok("...and the extracted wrapper still does what the inline one did",
       /health/.test(w) && /KPopListener\.ps1/.test(w) && /ENDED/.test(w),
       "waits for /health, invokes the listener, explains in yellow if the script returns while the host lives " +
       "-- the v2194 behaviour, MOVED and not rewritten");
    ok("!! and the launcher no longer carries the inline -Command form",
       !/powershell\.exe[^\r\n]*-Command\s+"\$ErrorActionPreference/.test(src),
       "two declarations of one launch would drift, and the inline one is the one wt cannot take");
}

// ---- 3. THE FALLBACK -- wt IS NOT EVERYWHERE --------------------------------------------------------------------
{
    ok("!! wt is DETECTED rather than assumed", /where wt >nul 2>nul/.test(src) && /if errorlevel 1 goto wt_done/.test(src),
       "Windows 10 without Terminal, and Server, have no wt.exe");
    for (const [name, label] of [["kpop_plain", "KPop Listener"], ["brain_plain", "GPU Brain"]]) {
        ok("!! " + label + " has a non-wt fallback that still starts it",
           new RegExp(":" + name + "\\b").test(src) && new RegExp("goto " + name + "\\b").test(src),
           "a launcher that assumed wt would start NOTHING, silently, on a machine without it");
    }
    ok("!! and the fallbacks are the ORIGINAL start lines, unchanged in shape",
       /start "KPop Listener" %KPMIN% \/D "%KP_DIR%"/.test(src) && /start "SweK GPU Brain" cmd \/c/.test(src),
       "the old behaviour is the alternate path, not a rewrite");
    ok("an unattended run does not open a window nobody will look at",
       /if defined SWEK_UNATTENDED goto wt_done/.test(src),
       "SWEK_UNATTENDED is v3333's existing convention rather than a second one invented here");
}

// ---- 4. THE RECURSION GUARD, AND WHY IT CANNOT BE ONE OF OURS ----------------------------------------------------
{
    ok("!! the guard is WT_SESSION, which TERMINAL sets", /if defined WT_SESSION goto wt_done/.test(src),
       "MY FIRST VERSION EXPORTED A VARIABLE OF MY OWN JUST BEFORE THE LAUNCH AND WOULD HAVE LOOPED FOREVER ON " +
       "THE SECOND RUN: once the named window exists, the tab is created by THAT ALREADY-RUNNING wt PROCESS, " +
       "which carries its own environment and never sees anything this script exported. A GUARD THAT RIDES ON " +
       "INHERITANCE IS ONLY A GUARD WHILE THE PARENT IS THE ONE SPAWNING.");
    ok("...and no home-made in-wt flag survives anywhere", !/SWEK_IN_WT/.test(src),
       "two guards for one question is the second-declaration shape, and the wrong one would win");
}

// ---- 5. THE ENGINE'S EXIT CHAIN IS UNTOUCHED -- v3088 ---------------------------------------------------------------
{
    ok("!! `node server.js` still runs in the FOREGROUND, not through wt",
       /^node server\.js\s*$/m.test(src) && !/wt[^\r\n]*node server\.js/.test(src),
       "wt RETURNS AS SOON AS IT HANDS OFF, so a launcher that started the server through it would read WT's " +
       "exit code instead of node's and report a clean success for a crash -- v3088's exact defect. The " +
       "LAUNCHER re-invokes itself into a tab; the SERVER does not.");
    ok("!! ...so NODE_RC and the three-way judgement still work",
       /set "NODE_RC=%ERRORLEVEL%"/.test(src) && /swek_exit_report\.bat" %NODE_RC%/.test(src),
       "capture, explain, propagate -- unchanged");
}

// ---- 6. THIS FILE'S OWN cmd LAWS ------------------------------------------------------------------------------------
//
// ANTIDOTE: if a later round adds a FOURTH surface, section 1's count of 3 goes red -- RAISE IT AND NAME THE
// NEW SURFACE, and check the new line against sections 2 and 3 too. Do not loosen the count to "at least".
{
    const added = lines.filter((l) => /goto (wt_done|kpop_plain|brain_plain)\b/.test(l) || /^:(wt_done|kpop_plain|brain_plain)/.test(l));
    ok("!! the new branches use goto, never a parenthesised block",
       added.length >= 6 && !/if (defined|not defined) SWEK_WT\s*\(/.test(src),
       "PARENTHESISED BLOCKS EXPAND %vars% AT PARSE TIME -- this launcher's own header records that as the " +
       "v2068 KPMIN bug, and the v3096 fix repeated it one screen further down");
    const raw = fs.readFileSync(BAT);
    const crlf = (raw.toString("latin1").match(/\r\n/g) || []).length;
    const lf = (raw.toString("latin1").match(/\n/g) || []).length;
    ok("!! line endings are still uniformly CRLF", crlf === lf && crlf > 300,
       crlf + " CRLF, " + (lf - crlf) + " bare LF -- v3097 DESTROYED START_BUN_Full.bat by splitting on a " +
       "single terminator; splitlines(keepends=True) is the rule and this is the check that would catch it");
}

console.log(fails ? ("[terminalTabs-selfcheck] FAILED " + fails) : "[terminalTabs-selfcheck] all passed");
process.exit(fails ? 1 : 0);
