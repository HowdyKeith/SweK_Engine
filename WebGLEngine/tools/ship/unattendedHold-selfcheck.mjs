// unattendedHold-selfcheck.mjs -- v3333. A REFUSAL MUST NOT WAIT FOR A KEYPRESS NOBODY WILL PRESS.
//
// Keith met this as a window sitting on "Press any key to continue . . ." after an auto-update. The message it
// was holding was CORRECT -- another launcher already owned port 8787 and this one refused to fight it, which is
// exactly what v3256 built that refusal to do. THE REFUSAL WAS RIGHT AND THE HOLD WAS WRONG.
//
// *** A HOLD FOR A READER AND A HOLD FOR A SCRIPT ARE TWO DIFFERENT THINGS WEARING ONE `pause`. *** For a person
// the hold is the whole point: a window that closes before its message is read is the black-screen-without-a-
// reason failure this tree has fixed on four surfaces. For anything unattended the same line is a HANG, and a
// hang is worse than a failure -- the parent waits on a process that will never exit, so nothing downstream
// ever learns the launch did not happen. One label, two situations, opposite correct behaviours.
//
// *** I WROTE A COUNT INTO THIS HEADER AND THE CENSUS BELOW CONTRADICTED IT ON THE FIRST RUN. *** I had written
// "28 pause sites, most of them right, only two on a refusal path". The measurement says 26 sites across 23 .bat
// files and NINETEEN of them sit immediately before a nonzero exit -- AFTER the two this round converted, so it
// was twenty-one. THE REFUSAL HOLD IS THE MAJORITY PATTERN, NOT THE EXCEPTION, and my "only two" was a guess
// wearing the clothes of a finding. A script printing a hardcoded conclusion its own data contradicts is a
// failure this tree has recorded before; the number stays here as the correction rather than being quietly
// rewritten.
//
// SO THE ASSERTION IS A RATCHET, NOT A WALL. Failing all nineteen would get this file switched off within a day,
// and a switched-off gate is worth nothing. Converting nineteen launchers in one scripted pass is the v3202
// shape that deleted 61 live modules -- each call site means something slightly different and wants reading.
// The count MAY SHRINK AND MAY NEVER GROW, and the baseline is labelled a DEBT rather than a target.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prose } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const ROOT = path.resolve(ENG, "..");

let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (label, cond, note) => { console.log("  " + (cond ? "PASS" : "FAIL") + "  " + label + (note ? "   " + note : "")); if (!cond) failed++; };

const HOLD = path.join(ENG, "tools", "ship", "swek_hold.bat");
const holdSrc = fs.existsSync(HOLD) ? fs.readFileSync(HOLD, "latin1") : "";

// ---- 1. ONE OWNER FOR THE BOUNDED HOLD --------------------------------------------------------------------
ok("!! the bounded hold has ONE definition", !!holdSrc,
    "the port-free job lived in six hand-written copies across five launchers before v3097 gave it an owner; " +
    "a second hand-rolled bounded hold would start that again");

ok("...and it is BOUNDED rather than removed",
    /timeout \/t %SECS%/.test(holdSrc) && !/^\s*pause\s*$/m.test(holdSrc),
    "removing the hold outright would trade a hang for the failure the hold exists to prevent: a person who " +
    "never sees why the launcher refused");

ok("...and an unattended caller can skip the wait outright",
    /if defined SWEK_UNATTENDED goto :done/.test(holdSrc),
    "SWEK_UNATTENDED=1 is for a caller that already knows nobody is watching");

// prose() extracts JS comments; a .bat comments with REM, so it returned nothing here and this check failed on
// text that was present and correct. The batch analogue is three lines, and a SHORT phrase is matched rather
// than a sentence -- a long contiguous regex over prose is the debt gateQuality ratchets.
const remProse = (src) => String(src).split(/\r?\n/)
    .map((l) => (l.match(/^\s*REM\s?(.*)$/i) || [])[1] || "").join(" ").replace(/\s+/g, " ");
ok("...and it explains that redirected stdin is itself the answer",
    remProse(holdSrc).includes("redirected stdin means nobody is watching"),
    "`timeout` fails when stdin is redirected and that failure IS the signal. Unwrapped from REM lines, so " +
    "re-flowing the comment cannot defeat it");

// ---- 2. THE CENSUS, AND THE SPLIT THAT IS THE ACTUAL FINDING ------------------------------------------------
// A crude count near a hundred is not a backlog, it is an unasked question. Ask it: of every `pause`, how many
// sit immediately before a NONZERO exit? Those are the refusals.
const bats = [];
for (const dir of [ROOT, path.join(ENG, "tools", "ship")]) {
    for (const f of fs.readdirSync(dir)) if (f.toLowerCase().endsWith(".bat")) bats.push(path.join(dir, f));
}
let total = 0;
const refusals = [];
for (const f of bats) {
    const lines = fs.readFileSync(f, "latin1").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (!/^\s*pause\s*$/.test(lines[i])) continue;
        total++;
        // A refusal hold: a pause whose next non-blank, non-comment line exits nonzero.
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const t = lines[j].trim();
            if (!t || /^REM\b/i.test(t) || /^endlocal$/i.test(t)) continue;
            if (/^exit \/b [1-9]/i.test(t)) refusals.push(path.relative(ROOT, f) + ":" + (i + 1));
            break;
        }
    }
}
say("`pause` sites across " + bats.length + " .bat files: " + total + " -- of those, holds sitting immediately before a NONZERO exit: " + refusals.length);
for (const r of refusals) say("    REFUSAL HOLD: " + r);

const REFUSAL_HOLD_BASELINE = 19;   // measured at v3333, down from 21. A DEBT, NOT A TARGET.
ok("!! *** the refusal-hold debt does not GROW ***", refusals.length <= REFUSAL_HOLD_BASELINE,
    refusals.length > REFUSAL_HOLD_BASELINE
        ? "a NEW refusal path holds on an unconditional keypress -- call swek_hold.bat instead"
        : refusals.length + " <= " + REFUSAL_HOLD_BASELINE + ". A hold before a nonzero exit is a message for a " +
          "person AND a hang for a script; the two converted here are the port-owner refusal in " +
          "START_NODE_Engine.bat and the still-held-port refusal in swek_free_port.bat");

ok("...and the baseline is honest: it matches what is actually there",
    refusals.length === REFUSAL_HOLD_BASELINE || refusals.length < REFUSAL_HOLD_BASELINE,
    refusals.length < REFUSAL_HOLD_BASELINE
        ? "DOWN " + (REFUSAL_HOLD_BASELINE - refusals.length) + " -- LOWER REFUSAL_HOLD_BASELINE IN THE SAME " +
          "COMMIT to lock the gain in, or the ratchet stops ratcheting"
        : "at baseline");

// ---- 3. THE TWO CONVERTED SITES STILL REFUSE, AND STILL SAY WHY ---------------------------------------------
const launcher = fs.readFileSync(path.join(ROOT, "START_NODE_Engine.bat"), "latin1");
const freePort = fs.readFileSync(path.join(ENG, "tools", "ship", "swek_free_port.bat"), "latin1");

// *** v4482 -- THIS READ `ALREADY OWNS PORT 8787` AND THE LAUNCHER HAD STOPPED SAYING 8787 ON PURPOSE. ***
// v4134 derived the port ONE way -- `set "SWEK_PORT=8787"` then `if defined PORT set "SWEK_PORT=%PORT%"` --
// so the refusal echoes `%SWEK_PORT%`, and its own comment says writing PORT back "would be this launcher
// deciding something it was only ever meant to observe". THE REFUSAL NEVER STOPPED REFUSING. The gate was
// pinned to a LITERAL that a correct round removed, and it has been red ever since, in two files: this one
// and supersededFlag-selfcheck, both grepping the same four characters.
//
// A LITERAL FOR A LITERAL WOULD BE THE SAME DEFECT SPELLED DIFFERENTLY. What is actually being claimed is
// that the refusal BLOCK is intact: it names the owning PID, it calls the bounded hold, and it exits nonzero.
// So the block is EXTRACTED -- from the refusal echo to its own `exit /b` -- and read, which is a claim about
// the branch that runs rather than about the characters in the file. The port it names must be a VARIABLE and
// not a number, which is the property v4134 established and the one this line was accidentally forbidding.
const refusalBlock = (src, headRe) => {
    const lines = String(src).split(/\r?\n/);
    const i = lines.findIndex((l) => headRe.test(l));
    if (i < 0) return null;
    const j = lines.findIndex((l, k) => k >= i && /^\s*exit \/b \d/i.test(l));
    return j < 0 ? null : lines.slice(i, j + 1).join("\n");
};
const OWNS = /ALREADY OWNS PORT/;
const ownerRefusal = refusalBlock(launcher, OWNS);

ok("!! the port-owner refusal still REFUSES -- the fix was to the hold, not the verdict",
    !!ownerRefusal && /swek_hold\.bat/.test(ownerRefusal) && /^\s*exit \/b [1-9]/mi.test(ownerRefusal),
    "it must still decline to fight the owner and still exit nonzero. Making it proceed would restore the " +
    "two-windows-take-turns-forever loop v3256 was built to end" +
    (ownerRefusal ? " -- block is " + ownerRefusal.split(/\n/).length + " lines" : " -- NO REFUSAL BLOCK FOUND"));

ok("...and the port it names is DERIVED, not typed -- which is what actually reddened this gate",
    !!ownerRefusal && /ALREADY OWNS PORT %[A-Za-z_][A-Za-z0-9_]*%/.test(ownerRefusal) &&
    !/ALREADY OWNS PORT \d/.test(ownerRefusal),
    "v4134 gave the port ONE derivation and the refusal reads it. A gate demanding the number back would " +
    "make the honest fix look like a regression, which is what it did for 348 versions");

ok("...and it names the holding PID, which is the part that made it diagnosable",
    /%OWNER_PID%/.test(launcher),
    "a refusal that will not say WHICH process holds the port sends somebody hunting");

ok("...and the un-parenthesised form respects this file's own cmd law",
    /if not "%PORT_OWNER%"=="other" goto :port_not_owned/.test(launcher),
    "cmd expands %vars% in a parenthesised block at PARSE time -- the v2068 KPMIN bug, which the launcher's " +
    "own header records and which a later edit walked into again");

ok("!! the still-held-port refusal is bounded too",
    /swek_hold\.bat/.test(freePort) && /exit \/b 1/.test(freePort),
    "same shape, same reachability: an unattended launcher stuck on a keypress never reports the failure it " +
    "is sitting on");

// ---- 4. WHAT WAS DELIBERATELY LEFT ALONE ---------------------------------------------------------------------
// swek_exit_report.bat's holds are on the MAIN path, not a refusal, and changing them is a behaviour decision
// about what a crashed server should do to a window somebody is watching. Reported so the decision is visible
// rather than looking like an oversight -- a page listing only what it changed makes the rest look like gaps.
const exitReport = fs.readFileSync(path.join(ENG, "tools", "ship", "swek_exit_report.bat"), "latin1");
const exitHolds = (exitReport.match(/^\s*pause\s*$/gm) || []).length;
say("NOT CHANGED: swek_exit_report.bat still holds unconditionally on " + exitHolds + " path(s) -- CRASHED and " +
    "STOPPED CLEANLY. Those are the main path, not a refusal, and whether an unattended crash should close " +
    "the window is Keith's call, not a sweep's.");
ok("...and that exemption is NAMED rather than silent", exitHolds > 0,
    "if these ever get converted this line goes red and should be DELETED, not weakened");

console.log(failed ? "unattendedHold-selfcheck: " + failed + " FAILED" : "unattendedHold-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
