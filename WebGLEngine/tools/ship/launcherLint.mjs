// tools/ship/launcherLint.mjs
//
// v2909 -- THE BUG IN Start_Everything.bat IS A CLASS, NOT AN INCIDENT.
//
// Open item 10 has read "the GPU Brain block sits after `pause`, so it never auto-starts" for many rounds. It is
// true, and it is small, and fixing the one line is not the round. The round is that NOTHING IN THIS TREE CHECKS
// LAUNCHERS, there are 21 .bat files, and the identical mistake is invisible in all of them.
//
// WHAT MAKES IT INVISIBLE. A batch file has no compiler and no test. Code after `pause` is not unreachable in
// the way a linter usually means -- press a key and it runs. What makes it dead in PRACTICE is that
// Start_Everything.bat prints
//
//     Engine running. Close this window to leave it running in the background.
//     pause >nul
//     ... start "SweK GPU Brain" ...
//
// so the launcher's own instruction tells the user to do the one thing that guarantees the brain never starts.
// The code is reachable; the INSTRUCTIONS are not compatible with reaching it. No static tool that reasons only
// about control flow would flag that, which is why this one reads the echo lines too.
//
// THE SECOND RULE IS THE STRICTER ONE. `node server.js` runs in the FOREGROUND: nothing after it executes until
// the server exits. START_NODE_Engine.bat gets this right and says so in a comment -- "Placed BEFORE the
// foreground `node server.js` below, because nothing after that line runs until shutdown." The knowledge exists
// in the tree, in prose, in one file. It was never back-ported to Start_Everything.bat and nothing would have
// noticed. That is the actual failure: a lesson learned in one launcher and not enforced across the rest.
//
// SCOPE, STATED HONESTLY. This is a text analyser for a language with goto, delayed expansion, and
// parenthesised blocks whose contents expand at parse time. It does not model batch semantics and cannot. It
// implements three narrow rules with known false-positive modes, and reports what it cannot decide rather than
// guessing. A launcher lint that pretended to understand cmd.exe would be worse than none.

import fs from "fs";
import path from "path";

/** Commands that start something and therefore matter if they are stranded. */
const LAUNCHES = /^\s*(start\s|call\s+npm|npm\s+install|powershell(\.exe)?\s|taskkill\s|robocopy\s)/i;

/** Commands that block the script indefinitely. */
const BLOCKERS = [
    { re: /^\s*pause(\s|$|>)/i, kind: "pause", note: "waits for a keypress" },
    { re: /^\s*node\s+server\.js\s*$/i, kind: "foreground-server", note: "runs in the foreground until shutdown" },
    { re: /^\s*(deno|bun)\s+run\s/i, kind: "foreground-server", note: "runs in the foreground until shutdown" },
];

/**
 * *** R3 -- A QUOTED ARGUMENT HANDED TO A PROGRAM MUST NOT END IN A BACKSLASH. v3654.
 *
 * %~dp0 ALWAYS ends in a backslash. `cd /d "%~dp0"` is fine, because cd is an INTERNAL command and cmd parses
 * its own line. But hand the same thing to an EXE -- `wt.exe -d "%~dp0"` -- and the argument reaches the C
 * runtime's parser, where \" is an ESCAPED QUOTE. The program then reads the rest of the command line as part
 * of that argument.
 *
 * THAT IS EXACTLY HOW START_NODE_Engine.bat BROKE FROM v3623 TO v3653, on every machine that had Windows
 * Terminal, and the error message said so in plain sight:
 *     Could not access starting directory "C:\Intel\SweK_Engine_v3653" cmd /k C:\...\START_NODE_Engine.bat"
 * The reported DIRECTORY contains `cmd /k`. The argument swallowed the rest of the line. And because the outer
 * window then ran `exit /b 0`, the only other symptom was a window that opened and vanished -- so ONE BUG
 * PRODUCED TWO REPORTS THAT LOOKED UNRELATED, and I misdiagnosed the second as a broken shortcut.
 *
 * The rule is deliberately narrow: only arguments to a PROGRAM (a token ending .exe, or a bare known launcher),
 * only when the quoted value ends in a backslash. `cd /d "%~dp0"` is NOT flagged, because it genuinely works. ***
 */
const PROGRAM_CALL = /(^|\s)(?:start\s+"[^"]*"\s+)?([A-Za-z0-9_.-]+\.exe)\b/i;
// *** MY FIRST VERSION OF THIS REGEX LOOKED FOR A BACKSLASH BEFORE THE CLOSING QUOTE AND FOUND NOTHING -- NOT
// EVEN ON THE LINE THAT BROKE. THE BACKSLASH IS NOT IN THE SOURCE TEXT. `"%~dp0"` has no backslash in it; the
// backslash arrives when cmd EXPANDS %~dp0 at runtime. A LINT THAT READS THE FILE CANNOT SEE THE HAZARD IN THE
// CHARACTERS -- it has to know which tokens EXPAND to a trailing separator. So the rule matches a quoted
// argument that ENDS in %~dpN (always a directory WITH its trailing backslash) or in a literal backslash.
// `"%~dp0WebGLEngine\brain"` ends in `brain` and is correctly NOT flagged. ***
const TRAILING_SLASH_ARG = /"[^"]*(?:%~dp\d|\\)"/;

export function trailingSlashFindings(rawLines) {
    const out = [];
    for (let i = 0; i < rawLines.length; i++) {
        const s = stripped(rawLines[i]);
        if (!s) continue;
        if (!PROGRAM_CALL.test(s)) continue;
        if (!TRAILING_SLASH_ARG.test(s)) continue;
        out.push({
            rule: "R3-trailing-backslash-in-quoted-arg", severity: "high", line: i + 1, code: s.slice(0, 100),
            blockedBy: 'a quoted argument ending in %~dpN (or a literal backslash) escapes its own closing quote when a PROGRAM parses it',
            closeAdvice: null,
        });
    }
    return out;
}

/**
 * *** R4 -- DO NOT WRITE A SCRIPT INTO %TEMP% AND EXECUTE IT. v3658.
 *
 * Until v3658 three sites across two launchers did this on every boot:
 *     > "%TEMP%\swek_killbrain.ps1" echo <one line of PowerShell>
 *     powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\swek_killbrain.ps1"
 *     del "%TEMP%\swek_killbrain.ps1"
 * DROP, EXECUTE WITH POLICY BYPASS, REMOVE THE EVIDENCE. On 2026-08-10 Avast's Behaviour Shield quarantined
 * START_NODE_Engine.bat as IDP.ALEXA.54 for exactly that, and IT WAS RIGHT ABOUT THE SHAPE -- a heuristic that
 * watches what a process DOES cannot tell an installer from a dropper, because at that level they are the same
 * program.
 *
 * The original reason was real and is recorded in the launcher: "inline PowerShell with quotes/pipes/braces is a
 * batch parsing footgun." THAT REASON EVAPORATES ONCE THE SCRIPT IS A FILE ON DISK. So the rule costs nothing it
 * was buying: ship the script, call the script.
 *
 * FLAGS THE WRITE, not the execute -- a launcher may legitimately run a .ps1 that SHIPS in the tree, and does,
 * eight times. What it may not do is author one at runtime in a world-writable directory. ***
 */
const TEMP_SCRIPT_WRITE = /^\s*(?:>>?|type\s|echo\s.*>)\s*"?%(?:TEMP|TMP)%[\\\/][^"\s]*\.(?:ps1|vbs|cmd|bat|js|wsf)/i;

export function tempScriptFindings(rawLines) {
    const out = [];
    for (let i = 0; i < rawLines.length; i++) {
        const s = stripped(rawLines[i]);
        if (!s || !TEMP_SCRIPT_WRITE.test(s)) continue;
        out.push({
            rule: "R4-script-written-into-TEMP", severity: "high", line: i + 1, code: s.slice(0, 100),
            blockedBy: "drop-execute-delete is the dropper shape; ship the script and call it instead",
            closeAdvice: null,
        });
    }
    return out;
}

/** Lines that end the script outright. */
const TERMINATORS = /^\s*(exit\s*\/b|goto\s*:eof)/i;

const stripped = (l) => l.replace(/\r$/, "").replace(/^\s*(REM|::)\b.*$/i, "").trim();

export function lintLauncher(file) {
    const raw = fs.readFileSync(file, "utf8").split("\n");
    const findings = [];
    let blocker = null;          // the blocking line currently in force
    let sawLabelSince = false;   // a :label after the blocker means goto may re-enter
    let closeAdvice = null;      // an echo telling the user to close the window

    for (let i = 0; i < raw.length; i++) {
        const line = raw[i];
        const s = stripped(line);
        if (!s) continue;

        if (/^\s*:[A-Za-z_]/.test(s)) { sawLabelSince = true; continue; }

        // "close this window" is the instruction that turns a pause into a wall
        if (/^\s*echo\b.*close\s+this\s+window/i.test(s)) closeAdvice = { line: i + 1, text: s.slice(0, 90) };

        if (blocker && LAUNCHES.test(s) && !sawLabelSince) {
            findings.push({
                rule: blocker.kind === "pause" ? "R1-after-pause" : "R2-after-foreground",
                severity: blocker.kind === "pause" ? (closeAdvice ? "high" : "medium") : "high",
                line: i + 1,
                code: s.slice(0, 80),
                blockedBy: `line ${blocker.line}: ${blocker.code} (${blocker.note})`,
                closeAdvice: blocker.kind === "pause" ? closeAdvice : null,
            });
        }

        if (TERMINATORS.test(s)) { blocker = null; sawLabelSince = false; continue; }

        for (const b of BLOCKERS) {
            if (b.re.test(s)) { blocker = { kind: b.kind, note: b.note, line: i + 1, code: s.slice(0, 60) }; sawLabelSince = false; break; }
        }
    }
    findings.push(...trailingSlashFindings(raw));
    findings.push(...tempScriptFindings(raw));
    findings.sort((a, b) => a.line - b.line);
    return { file: path.basename(file), path: file, findings };
}

// v2989 -- RECURSIVE. The first version used a flat readdirSync per root, so it scanned the FOUR .bat files at
// the top of the tree and none of the FIVE nested ones -- in ai-bridge, brain, tools/roundhouse and wasm-terrain.
// A lint that inspects less than half of its own subject reports "0 findings" and means "0 findings HERE", and
// nothing anywhere said which. That is the same shape as the mutation whose find-string had drifted (v2884) and
// the render-QA route nested inside a guard it could never match (v2857): a check that runs, passes, and covers
// nothing.
const SKIP_DIR = /node_modules|[\\/]\.git|[\\/]vendor|GPU_Assets/;
function walkLaunchers(dir, out = []) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (SKIP_DIR.test(full)) continue;
        if (e.isDirectory()) walkLaunchers(full, out);
        else if (e.name.toLowerCase().endsWith(".bat")) out.push(full);
    }
    return out;
}

export function lintAll(roots) {
    const files = [];
    for (const root of roots) {
        if (!fs.existsSync(root)) continue;
        walkLaunchers(root, files);
    }
    return files.map(lintLauncher).sort((a, b) => b.findings.length - a.findings.length);
}

export function lintLines(reports) {
    const L = [];
    let total = 0;
    for (const r of reports) {
        if (!r.findings.length) continue;
        total += r.findings.length;
        L.push(`  ${r.file}`);
        for (const f of r.findings) {
            L.push(`      [${f.severity}] ${f.rule} line ${f.line}: ${f.code}`);
            L.push(`          stranded by ${f.blockedBy}`);
            if (f.closeAdvice) L.push(`          and line ${f.closeAdvice.line} tells the user to CLOSE THE WINDOW`);
        }
    }
    L.unshift(`  ${reports.length} launchers scanned, ${total} stranded launch(es) in ${reports.filter((r) => r.findings.length).length} file(s)`);
    return L;
}
