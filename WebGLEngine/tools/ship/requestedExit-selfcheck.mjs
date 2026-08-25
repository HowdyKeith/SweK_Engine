// WebGLEngine/tools/ship/requestedExit-selfcheck.mjs
//
// Run: node tools/ship/requestedExit-selfcheck.mjs
// RUNTIME 1.08s MEASURED (median of 3 -- 1067/1146/1075 -- with date(1) around the run). Four short-lived node
// children dominate it: three real bridge loads in section 1 and 5(b), plus process spawn. No header guess was
// written here first -- this line has been wrong by 13x in this tree before, so the number went in after date(1).
//
// *** A STOP THAT WAS ASKED FOR USED TO LOOK EXACTLY LIKE THE ONE SHAPE THE LAUNCHER STOPS THE WINDOW OVER. ***
//
// POST /sys/exit -> sysadminBridge.exitNow() exited 0. swek_exit_report.bat's RC==0 branch prints a nine-line
// box -- "It started, then chose to stop. That is not a crash, and it is not success either -- this window
// should have kept serving." -- lists three suspects, and PAUSES. It is the strictest branch in that file, and
// a deliberate shutdown walked straight into it.
//
// AND THE LAUNCHER ITSELF TAKES THAT PATH. v3251's swek_ask_exit.bat asks a running server to stand down before
// reaching for taskkill -- the right change. THE POLITE PATH THEN LEFT THE DEAD WINDOW THAT THE KILL DID NOT:
// a reap exits -1 with a fresh supersede flag and closes silently; an ask exited 0 with no flag and sat on
// "Press any key" forever. The ghost windows v2418 through v3250 chased came back through the courteous door.
//
// TWO MECHANISMS, AND THE BOUNDARY BETWEEN THEM IS WHETHER A SUCCESSOR EXISTS:
//     swek_superseded.flag  -- someone else has the baton (applyUpdate, restart() on Win/Mac). Exit code 0.
//     exit code 20          -- NOBODY has the baton, and that is what was asked for.
// Writing the flag here was the first fix I reached for and it was wrong twice over: the report reads that flag
// out as "an auto-update replaced this instance" (nothing did), and it leaves a file in %TEMP% that outlives the
// process -- the v3250 shape, where a flag nobody consumed silenced every later launch until freshness was added.
//
// Section 1 runs the real function in a real child process and reads the real exit code. Sections 2-4 are source,
// because the readers are .bat and .sh files this sandbox cannot execute -- so what they check is not "does it
// print the right thing" but ORDER: a nonzero code that is not caught before the catch-all is not caught at all.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROJ = path.resolve(ENG, "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const rd = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };

const EXPECTED = 20;
const BRIDGE = path.join(ENG, "ai-bridge", "sysadminBridge.js");

// Run one exported call of the real bridge in a child, with TMPDIR pointed at a scratch directory so we can see
// whether anything was written to os.tmpdir() -- which is where swek_superseded.flag would land.
function runCall(expr) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swek-exitgate-"));
    const r = spawnSync(process.execPath,
        ["-e", `const sb=require(${JSON.stringify(BRIDGE)});const r=sb.${expr};process.stdout.write(JSON.stringify(r));`],
        { cwd: ENG, env: { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp }, encoding: "utf8", timeout: 20000 });
    let wrote = [];
    try { wrote = fs.readdirSync(tmp); } catch {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    return { code: r.status, out: r.stdout || "", err: r.stderr || "", wrote };
}

console.log("requestedExit-selfcheck -- does a shutdown the server was ASKED for say so, and does every launcher hear it?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE REAL FUNCTION, IN A REAL PROCESS: WHAT EXIT CODE DOES IT ACTUALLY LEAVE ***");
{
    const e = runCall("exitNow()");
    ok("!! exitNow() exits " + EXPECTED + ", not 0", e.code === EXPECTED,
        `child exited ${e.code}` + (e.err ? " | stderr: " + e.err.trim().slice(0, 200) : ""));
    ok("...and 0 is specifically what it must NOT be -- that is the code the report pauses over", e.code !== 0);
    ok("...and it reports the code to its HTTP caller too, not only to the process table",
        /"code":\s*20/.test(e.out), e.out.slice(0, 160));

    // *** THE FIX I REJECTED, CHECKED AS A FIX I REJECTED. *** If a later edit "helpfully" writes the supersede
    // flag here, the report would announce an auto-update that never happened, and leave a file in %TEMP% that
    // outlives this process. That is the v3250 failure, re-entered through a different door.
    ok("!! exitNow() writes NO swek_superseded.flag -- a requested stop is not a handoff",
        !e.wrote.some((f) => /swek_superseded/.test(f)),
        e.wrote.length ? "tmpdir received: " + e.wrote.join(", ") : "tmpdir untouched");

    const r = runCall("restart()");
    ok("!! restart()'s no-relauncher fallback exits " + EXPECTED + " too -- nobody has the baton there either",
        r.code === EXPECTED, `child exited ${r.code}`);
    report("both are run as the real module in a real child; the code read here is the code a launcher reads");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE CODE IS DISJOINT FROM EVERY OTHER CODE THIS TREE OR THIS RUNTIME ASSIGNS MEANING TO ***");
{
    ok("!! not inside node's own reserved band 1-13", EXPECTED < 1 || EXPECTED > 13, "node uses 1-13 for its fatal conditions");
    ok("not a signal code (128+n)", EXPECTED < 128);
    ok("not in the BSD sysexits band 64-78 -- this is not an error", EXPECTED < 64 || EXPECTED > 78);
    // kpop-guard already documents "0 launch / 42 skip" in START_NODE_Engine.bat. Reusing 42 for a second meaning
    // is how three definitions of one judgement end up disagreeing, which this tree has paid for before.
    const launcher = rd(path.join(PROJ, "START_NODE_Engine.bat"));
    ok("!! not 42, which kpop-guard already spends one file over", EXPECTED !== 42,
        /42/.test(launcher) ? "START_NODE_Engine.bat documents kpop-guard's 0 launch / 42 skip" : "");
    ok("...and the bridge names the constant rather than sprinkling the literal",
        /const EXIT_REQUESTED = 20;/.test(rd(BRIDGE)) &&
        (rd(BRIDGE).match(/process\.exit\(EXIT_REQUESTED\)/g) || []).length >= 2);
}

// ---------------------------------------------------------------------------
console.log("\n3. *** EVERY READER THAT JUDGES THE EXIT CODE KNOWS ABOUT 20 -- AND CATCHES IT IN TIME ***");
{
    // A nonzero code that reaches a catch-all before its own branch is not handled at all. Each check below is
    // an ORDER check for that reason, not a presence check.
    const readers = [
        {
            name: "tools/ship/swek_exit_report.bat",
            src: rd(path.join(ENG, "tools", "ship", "swek_exit_report.bat")),
            branch: /if "%RC%"=="20" \(/,
            catchall: /if not "%RC%"=="0" \(/,
            why: 'the crash branch tests only "not 0", so 20 lands in it unless caught first',
        },
        {
            name: "SweK_Run.bat",
            src: rd(path.join(ENG, "SweK_Run.bat")),
            branch: /if "%CODE%"=="20" \(/,
            catchall: /echo \[SweK\] the ai-bridge exited with code %CODE%\./,
            why: "its clean-exit test is CODE==0 only, so 20 falls through to the crash message and its pause",
        },
        {
            name: "swek-run.sh",
            src: rd(path.join(ENG, "swek-run.sh")),
            branch: /if \[ "\$CODE" = "20" \]; then/,
            catchall: /read -r _/,
            why: 'its clean-exit test is CODE = "0" only, so 20 reaches "press return to close"',
        },
    ];
    for (const r of readers) {
        ok(`${r.name} was read at all`, r.src.length > 200, r.src.length + " bytes");
        const bi = r.src.search(r.branch), ci = r.src.search(r.catchall);
        ok(`!! ${r.name} has a branch for code 20`, bi >= 0, r.why);
        ok(`!! ...and it sits BEFORE the catch-all that would otherwise swallow it`,
            bi >= 0 && ci >= 0 && bi < ci, `branch at ${bi}, catch-all at ${ci}`);
        ok(`...and that branch closes the window instead of holding it`,
            /exit \/b 0|exit 0/.test(r.src.slice(bi, bi + 400)));
    }
    report("these three are the whole set: no other launcher in the tree inspects the server's exit code " +
           "(START_BUN.bat, First_Start_AI_Bridge.bat and Start-AIBridge.ps1 pause or exit unconditionally)");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE 0 BRANCH KEEPS ITS MEANING, AND ITS SIGNPOST STAYS TRUE ***");
{
    const rep = rd(path.join(ENG, "tools", "ship", "swek_exit_report.bat"));
    ok("!! exit 0 still gets the STOPPED CLEANLY box -- an unexplained clean exit is still an event",
        /STOPPED CLEANLY \(exit code 0\)/.test(rep) && /pause/.test(rep));
    // A MESSAGE THAT TELLS YOU WHERE TO LOOK HAD BETTER BE RIGHT -- launcherExit-selfcheck's own words. That box
    // used to list "a /restart or shutdown route" among the suspects for an exit 0. It cannot be that any more:
    // the shutdown route identifies itself now, so leaving the line would send the reader after a ruled-out cause.
    ok("!! ...and it no longer blames the shutdown route, which now identifies itself",
        !/Something asked it to stop \(a \/restart or shutdown route/.test(rep),
        "a wrong signpost costs you the walk");
    ok("...while still naming Ctrl+C, which genuinely does land here", /Ctrl\+C in this window/.test(rep));
    ok("the supersede branch is untouched and still judged by freshness",
        /call "%~dp0swek_flag_fresh\.bat"/.test(rep) && /if "%FRESH%"=="1"/.test(rep));
}

// ---------------------------------------------------------------------------
console.log("\n5. *** SABOTAGE: EACH FINDING MUST BE ABLE TO FAIL ***");
{
    const rep = rd(path.join(ENG, "tools", "ship", "swek_exit_report.bat"));
    // (a) move the 20 branch AFTER the catch-all -- the exact mistake the order check exists for
    const branch = rep.match(/if "%RC%"=="20" \([\s\S]*?\r?\n\)\r?\n/);
    ok("the 20 branch could be located for sabotage", !!branch);
    if (branch) {
        // *** THE FIRST VERSION OF THIS SABOTAGE WAS A NO-OP AND SAID SO. *** It removed the branch and
        // re-inserted it immediately before `if not "%RC%"=="0" (` -- which is exactly where it already sits,
        // so the "moved" source was byte-identical to the real one and the order check correctly did not fire.
        // The gate reported that as two FAILs rather than a pass, which is the only reason it was noticed.
        // A sabotage has to land somewhere the finding actually forbids: BELOW the catch-all.
        const AFTER = /echo  \[SweK\] the ai-bridge STOPPED CLEANLY/;
        const moved = rep.replace(branch[0], "").replace(AFTER, branch[0] + "echo  [SweK] the ai-bridge STOPPED CLEANLY");
        ok("...and the sabotage really changed the source", moved !== rep && moved.length === rep.length);
        const bi = moved.search(/if "%RC%"=="20" \(/), ci = moved.search(/if not "%RC%"=="0" \(/);
        ok("!! moving the 20 branch below the catch-all reddens the order check", !(bi >= 0 && ci >= 0 && bi < ci),
            `sabotaged branch at ${bi}, catch-all at ${ci}`);
    }
    // (b) a bridge that exits 0 again
    const src = rd(BRIDGE);
    const broken = src.replace("const EXIT_REQUESTED = 20;", "const EXIT_REQUESTED = 0;");
    ok("the bridge constant could be located for sabotage", broken !== src);
    // *** THE COPY MUST LIVE BESIDE THE ORIGINAL, OR IT FAILS FOR THE WRONG REASON. *** Written to os.tmpdir()
    // first, this copy could not resolve its own `require("./kpopHandoff.js")` and died with code 1 -- which is
    // !== 20, so the check went green while proving nothing about the constant. A sabotage that cannot load is
    // not a sabotage. It sits in ai-bridge/ now, and the assertion is the STRONG one: the reverted bridge must
    // exit exactly 0, the old broken behaviour, which only a copy that really ran can do.
    const tmpBridge = path.join(ENG, "ai-bridge", ".swek-exitgate-tmp.js");
    fs.writeFileSync(tmpBridge, broken);
    const r = spawnSync(process.execPath,
        ["-e", `const sb=require(${JSON.stringify(tmpBridge)});sb.exitNow();`],
        { cwd: ENG, encoding: "utf8", timeout: 20000 });
    try { fs.unlinkSync(tmpBridge); } catch {}
    ok("!! a bridge reverted to exit 0 reproduces the ORIGINAL bug, and section 1 would catch it",
        r.status === 0 && r.status !== EXPECTED,
        `sabotaged child exited ${r.status}` + (r.status !== 0 ? " -- it did not run; stderr: " + (r.stderr || "").trim().slice(0, 200) : ""));
    // (c) restoring the ruled-out suspect
    const reblamed = rep.replace(/echo    2\. Ctrl\+C[\s\S]*?So it is not this\.\^\)/,
        "echo    2. Something asked it to stop (a /restart or shutdown route,");
    ok("!! putting the shutdown route back among the suspects reddens section 4",
        /Something asked it to stop \(a \/restart or shutdown route/.test(reblamed) && reblamed !== rep);
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
