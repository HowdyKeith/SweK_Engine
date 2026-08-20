// tools/ship/loopScope-selfcheck.mjs -- v3755
//
// The gate for tools/ship/loopScope.mjs -- step 0's selector.
//
// *** THE WHOLE DESIGN IS ONE SENTENCE: THE PAGE DECLARES, THE RUNNER RE-CHECKS. Keith asked whether step 0
// could be a page to select from. It can, with the constraint that decides everything else -- A PAGE THAT
// GRANTS PERMISSION BY BEING CLICKED IS A CONTROL THAT CAN BE WRONG; A PAGE THAT RECORDS A CHOICE THE RUNNER
// THEN RE-CHECKS IS A SETTING. The precedent is v3739's swek_one_terminal.flag: the panel writes it, the .bat
// tests it, and neither trusts the other. ***
//
// *** AND IT IS A PANEL ON server.html RATHER THAN A NEW PAGE, DECIDED BY MEASUREMENT: the tree holds 382 html
// files with 153 filed in sections, THREE DRAWERS ARE AT OR NEAR THE CAP OF 15 (smarthome 15, matter 14,
// voxelrender 14), and there is a standing census of 42 pages in neither list. A scope selector is A CONTROL,
// and controls live where the other controls live -- beside Boot Options, which is where the one-terminal flag
// already is. A 383rd page would have grown the census to buy nothing. ***

import { SCOPES, scopeOf, currentScope, setScope, SCOPE_FLAG } from "./loopScope.mjs";
import { search } from "./loopSearch.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { REPORTING } from "./reportingTools.mjs";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "loopScope.mjs"), "utf8");
const SEARCH_SRC = readFileSync(path.join(HERE, "loopSearch.mjs"), "utf8");
const SERVER_HTML = readFileSync(path.resolve(HERE, "..", "..", "server.html"), "utf8");

// ---- 1. THE DEFAULT IS THE NARROWEST -----------------------------------------------------------------------
console.log("1. AN ABSENT OR UNREADABLE DECLARATION MEANS SCOPE 0");
{
    setScope(0);
    ok("!! with no flag on disk the scope is 0, not the last thing anybody chose",
        !existsSync(SCOPE_FLAG) && currentScope() === 0,
        "*** THE FAILURE DIRECTION MATTERS: an unreadable flag resolving to a WIDE scope would mean a corrupted " +
        "file grants permission. It resolves to the NARROWEST, always ***");
}

// ---- 2. THE RE-CHECK ---------------------------------------------------------------------------------------
console.log("\n2. THE FILE IS A DECLARATION AND THIS IS THE RE-CHECK");
{
    ok("!! a ready scope round-trips",
        setScope(1) === 1 && currentScope() === 1,
        "written, then READ BACK from disk rather than trusted -- the disk is the setting, because the disk is " +
        "what the runner reads");
    ok("!! *** setScope REFUSES A SCOPE THAT IS NOT READY, BY NAME ***",
        (() => { try { setScope(3); return false; } catch (e) { return /NOT READY/.test(e.message) && /runner/.test(e.message); } })(),
        "the selector LISTS 2..5 so the menu is honest about what exists -- not so they can be chosen");
    ok("!! *** AND A HAND-EDITED FLAG NAMING AN UNREADY SCOPE IS NOT HONOURED EITHER ***",
        (() => { writeFileSync(SCOPE_FLAG, "3  onefile\n"); return currentScope() === 0; })(),
        "somebody editing the flag to 3 does not thereby build a runner. READING IT BACK AS 3 WOULD BE THE PAGE " +
        "GRANTING PERMISSION WITH EXTRA STEPS -- the re-check is what makes this a setting rather than a switch");
    setScope(0);
}

// ---- 3. THE SEARCHER STILL CANNOT REACH A FILE ------------------------------------------------------------
console.log("\n3. ADDING A SCOPE DID NOT COST THE SEARCHER ITS STRONGEST PROPERTY");
{
    ok("!! *** loopSearch STILL HAS NO fs IMPORT -- the scope is an ARGUMENT ***",
        !/writeFileSync|readFileSync|node:fs/.test(codeOnly(SEARCH_SRC)),
        "a scope check bolted INSIDE the searcher would have needed a file read and QUIETLY DESTROYED the " +
        "strongest thing the searcher had to say about itself (v3753). The disk-reading lives at the boundary");
    ok("!! and it refuses to run without a stated scope -- no default",
        (() => { try { search({}); return false; } catch (e) { return /scope 1/.test(e.message); } })(),
        "'the caller must remember' is the shape that produced v3746's permissive rule and v3750's optional " +
        "trace; refused the same way each time");
    ok("!! a wrong scope is refused too, not just a missing one",
        (() => { try { search({ scope: 3 }); return false; } catch { return true; } })());
}

// ---- 4. THE MENU CANNOT DRIFT FROM THE MODULE --------------------------------------------------------------
console.log("\n4. ONE MENU, NOT TWO SPELLINGS OF ONE MENU");
{
    // *** v3756 -- THE SELECTOR IS NOT ON server.html AT ALL ANY MORE, AND KEITH WAS RIGHT ABOUT WHY. I put it
    // in BOOT OPTIONS because "a control belongs with the other controls" -- a rule about SHAPE applied without
    // asking about SUBJECT. Boot Options is about HOW THE ENGINE STARTS; the loop scope is about WHAT A SEARCH
    // OVER A FLUID SOLVER MAY TOUCH, which is lab tooling and has nothing to do with booting. It lives on the
    // tools front door now, beside the other lab instruments. ***
    ok("!! *** the scope selector is NOT in server.html's boot options ***",
        !/loopScope|loop\/scope/.test(SERVER_HTML),
        "a startup panel is the wrong home for a lab setting, and the labels live in loopScope.SCOPES so nothing " +
        "can drift from the module either way");
    ok("!! and it has a front door -- a reporting-tools row, the lab's own idiom",
        REPORTING.some((r) => r.rel === "tools/ship/loopScope.mjs") &&
        REPORTING.some((r) => r.rel === "tools/ship/loopSearch.mjs"),
        "A MODULE WITH NO CALLER IS UNFINISHED, and moving something out of a panel must not leave it doorless");
    ok("!! every scope names what it may change AND what would enforce the bound",
        SCOPES.every((s) => s.may && s.enforced) && SCOPES.filter((s) => !s.ready).every((s) => s.needs),
        "a menu whose entries are numbers teaches nobody what they are choosing between, and an unready entry " +
        "that does not say what it NEEDS is a promise rather than a plan");
    ok("!! scope 5 is present and permanently unready",
        scopeOf(5).ready === false && /REFUSED/.test(scopeOf(5).needs),
        "listed rather than omitted, because a menu that silently stops at 4 does not tell you that unbounded " +
        "was considered and refused");
}

report("WHAT THIS DOES NOT CLAIM",
    "That the panel renders correctly -- nobody here can see it. placementRender drives server.html under jsdom " +
    "and all 36 inline script blocks parse, which says the page is not BROKEN; whether the selector reads well " +
    "beside Boot Options is Keith's. AND SCOPE 1 IS THE ONLY THING BEHIND THIS SELECTOR TODAY: choosing it " +
    "enables a parameter search that has already run and accepted nothing.");

console.log("\nloopScope-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
