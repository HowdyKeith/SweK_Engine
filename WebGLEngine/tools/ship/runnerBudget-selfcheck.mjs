// WebGLEngine/tools/ship/runnerBudget-selfcheck.mjs -- v3919
//
// *** "THERE IS ONE TABLE" WAS WRITTEN IN A COMMENT AT v3212 AND WAS FALSE FOR SEVEN HUNDRED VERSIONS. ***
//
// gatesBridge.js says it in as many words: "THE BUDGET IS NOT THE PAGE'S BUSINESS. It comes from
// tools/ship/gateBudget.mjs -- the same table selfchecks.mjs uses -- so a gate cannot be given one budget by the
// button and another by the ship. TWO DECLARATIONS ABOUT ONE THING IS THIS TREE'S MOST REPEATED DEFECT; there is
// one table." That round fixed THE BUTTON and THE SHIP. It did not look for a third runner, and there were two.
//
// ai-bridge/rigRunner.js -- what rig.html actually calls -- carried a flat TIMEOUT_MS = 180000. The number was
// ABOVE the general default of 139.9s, so ordinary gates were unaffected and nothing looked wrong; it was BELOW
// TWENTY OF THE THIRTY-FIVE MEASURED BUDGETS, so those twenty COULD NEVER PASS ON THAT PAGE. levelClaim is
// budgeted 2116s and was killed at 180. Keith's rig report reads "assumptionMap TIMEOUT (180s budget)" beside a
// table that says 568s, and the honest reading of that line was never "the gate is slow" -- it was "the page and
// the table disagree and only one of them is maintained".
//
// A WIRING CLAIM IS A FACT ABOUT THE IMPORT GRAPH. Written in prose it is a fact about the past, so this gate
// re-derives it: find every module that spawns a selfcheck under a time limit, and require it to read the table
// or to SAY WHY IT DOES NOT. androidRunner.mjs is the second kind and now carries budgetIsOwn -- an Android
// device is a different machine class and importing host timings would apply a limit to a thing it was never
// measured against. Refusing is a decision; carrying a bare 180000 is not.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";
import { budgetFor, DEFAULT_BUDGET_MS, MEASURED } from "./gateBudget.mjs";

const ENG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

const SKIP = new Set(["node_modules", ".git", "deleted", "dist", "build"]);
function walk(d, acc = []) {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return acc; }
    for (const e of ents) {
        if (SKIP.has(e.name)) continue;
        const f = path.join(d, e.name);
        if (e.isDirectory()) walk(f, acc);
        else if (/\.(js|mjs|cjs)$/.test(e.name)) acc.push(f);
    }
    return acc;
}

// *** noComments, NOT codeOnly, AND THE DIFFERENCE IS THE WHOLE SCAN. ***
// codeOnly strips comments AND STRINGS, which is right when the question is "does this bind merely MENTION a
// plant in a comment". Here the fact being checked LIVES IN A STRING -- the import specifier
// "../tools/ship/gateBudget.mjs" and the signal name "SIGKILL" -- so codeOnly reported rigRunner and
// gatesBridge as NOT reading the table while they plainly do. noComments keeps strings and drops comments,
// which is what excludes main.js, whose changelog merely discusses all of this at length.
// *** AND A MENTION IS STILL NOT A WIRING, ONE LEVEL UP. *** The first version of this scan asked
// /gateBudget/.test(src) and PASSED WITH rigRunner'S IMPORT POINTED AT A FILE THAT DOES NOT EXIST -- because
// spawnOne carries the literal "tools/ship/gateBudget.mjs" as a fallback LABEL for the budget's source, and a
// display string reads exactly like an import to a regex. THE KEYWORD PROBE HAS NOW MISLED THIS PROJECT FOUR
// TIMES, the fourth being inside the gate written to stop it. What is tested is the CALL: an import() or a
// require() or a `from` whose specifier is the table.
const IMPORTS_TABLE = /(?:\bimport\s*\(|\brequire\s*\(|\bfrom\s+)\s*["'][^"']*gateBudget\.mjs["']/;

// *** v4583 -- THE POPULATION WAS THREE STRING COINCIDENCES, AND EACH ONE WAS WRONG SOMEWHERE. ***
//
// Membership was: spawns `spawn(process.execPath` or `execFile(process.execPath`, AND contains `SIGKILL` or
// `timeout:`, AND mentions `-selfcheck` outside its own basename. Measured at v4583, all three fail:
//
//   1. THE SPAWN TEST MISSED execFileSync. tools/ship/verify.mjs -- the ship's own gate runner -- destructures it
//      from a dynamic import and calls `execFileSync(process.execPath, [file], { timeout: 180000 })` on three
//      lockstep gates that selfchecks.mjs deliberately leaves to it. The regex matched neither spelling, so the
//      primary gate runner of the ship was never in the population. ITS CONSEQUENCE TODAY IS NIL and that is
//      stated rather than dramatised: those three gates cost 61, 127 and 112 ms against a 180,000 ms cap.
//   2. THE TIME-LIMIT TEST ADMITS ANY `timeout:`. ai-bridge/sourceChainBridge.js entered the candidate set on a
//      `timeout: 1500` HTTP health probe, nothing to do with the verify it spawns -- which carries NO cap at all.
//      Admitted for the wrong reason and then excluded for another one, so the absence was never a decision.
//   3. THE `-selfcheck` MENTION IS A PROXY FOR "RUNS GATES" AND MISSES ONE LEVEL OF INDIRECTION. quickSweep was
//      outside the population for eleven rounds purely because it happened not to contain the string (v4582).
//      ai-bridge/shipBridge.js spawns ship.mjs and ai-bridge/sourceChainBridge.js spawns verify.mjs: each puts
//      EVERY GATE IN THE TREE under a wall-clock limit and neither names a selfcheck. shipBridge's dry-run total
//      was 600 s around ship.mjs's own 900 s PER-STEP cap -- an outer limit below the inner one it contained.
//
// WHAT REPLACES IT IS A CLOSURE RATHER THAN A LONGER LIST OF SPELLINGS. A runner is a file that spawns a GATE, or
// that spawns a file which is itself a runner. That is computed to a fixed point from the tree, so ship.mjs enters
// because it spawns verify.mjs, and shipBridge enters because it spawns ship.mjs, with nothing typed.
//
// ITS OWN FAILURE MODE, NAMED: the spawned path is still recognised by NAME, so a runner that builds its target
// entirely at run time from data would stay invisible. That is a smaller hole than three coincidences and it is
// the hole that remains.
// *** AND THE CANDIDATE TEST STILL REQUIRED process.execPath AS THE LITERAL FIRST ARGUMENT, WHICH ship.mjs IS NOT.
// *** ship.mjs spawns through a helper -- `const run = (cmd, args, opts) => execFileSync(cmd, args, {...})`, called
// as `run(process.execPath, [...])` -- so the literal never sits next to the call. It was invisible, and because the
// closure walks OUTWARD from members, shipBridge.js was invisible too: it spawns ship.mjs, which was not a member,
// so the chain never started. THE HOLE THIS SECTION NAMED AS REMAINING WAS ALREADY LOAD-BEARING.
// Asked as two facts instead of one pattern: the file calls a spawn function, and the file names process.execPath.
const SPAWN_CALL = /\b(?:spawn|spawnSync|execFile|execFileSync)\s*\(/;
const NAMES_NODE = /process\.execPath/;
const SPAWNS_NODE = { test: (src) => SPAWN_CALL.test(src) && NAMES_NODE.test(src) };
const HAS_LIMIT = /SIGKILL|timeout\s*:/;

// *** AND A GATE THAT SPAWNS A GATE IS NOT A RUNNER, WHICH THE FIRST CLOSURE GOT WRONG. ***
// Widening the population to a closure took it from 5 modules to 25, and eleven of the newcomers were
// *-selfcheck.mjs files that spawn a child gate AS A FIXTURE -- tools/ship/skipReading-selfcheck.mjs (v4582) runs
// three gates to ask whether they decline; quickSweep-selfcheck drives the sweep on a fixture; todo-selfcheck and
// changedPaths-selfcheck spawn a gate to observe it. None of them allocates a budget to the suite, and asking them
// to declare one would be a checklist item rather than a control. A GATE IS A SUBJECT, NOT AN AUTHORITY: the
// runners are the non-gate modules -- verify.mjs, ship.mjs, selfchecks.mjs, quickSweep.mjs, the bridges.
const IS_GATE = /-selfcheck\.mjs$/;
const scanned = [];
for (const f of walk(ENG)) {
    let src; try { src = noComments(fs.readFileSync(f, "utf8")); } catch { continue; }
    if (!SPAWNS_NODE.test(src)) continue;
    if (IS_GATE.test(path.basename(f))) continue;
    scanned.push({ f, src, base: path.basename(f) });
}
// Seed: spawns a *-selfcheck.mjs that is not itself. Then close: spawns any file already in the set.
const isRunner = new Set();
for (const { f, src, base } of scanned) {
    const foreign = src.split(base.replace(/\.(js|mjs|cjs)$/, "")).join("");
    // *** TWO WAYS TO RUN GATES: NAME THEM, OR ASK FOR THE LIST. *** Seeding on a gate path alone dropped
    // quickSweep.mjs -- the file v4582 had just brought into this population -- because it contains no gate path at
    // all: it calls enumerateGates() and spawns whatever comes back. A seed that only recognises literal paths
    // recognises the small runners and misses the one that runs everything, which is the shape of this whole round.
    if (/-selfcheck\.mjs/.test(foreign) || /\b(?:enumerateGates|gateFiles)\s*\(/.test(foreign)) isRunner.add(f);
}
for (let grew = true; grew;) {
    grew = false;
    for (const { f, src } of scanned) {
        if (isRunner.has(f)) continue;
        // *** REQUIRING A RUNNER IS NOT BEING ONE. *** ai-bridge/server.js joined the closure because it
        // `require`s shipBridge and sourceChainBridge to host them, and its only `timeout:` values are on
        // nvidia-smi and system_profiler probes. Import and require LINES are removed before asking, so the link
        // is "hands this module's name to something" rather than "mentions it anywhere".
        const linkable = src.split("\n").filter((l) => !/^\s*(?:import\b|export\s|const\s+.*\brequire\s*\(|.*\brequire\s*\()/.test(l)).join("\n");
        for (const g of isRunner) {
            if (g !== f && linkable.includes(path.basename(g))) { isRunner.add(f); grew = true; break; }
        }
    }
}

const rows = [];
for (const { f, src } of scanned) {
    if (!isRunner.has(f)) continue;
    if (!HAS_LIMIT.test(src) && !/budgetIsOwn/.test(src)) continue;
    // A MODULE NAMING ITSELF IS NOT A MODULE RUNNING THE SUITE. freshMachine-selfcheck.mjs and
    // boot-trace-selfcheck.mjs matched /-selfcheck/ because that is THEIR OWN BASENAME, printed in their own
    // output lines -- and the first version of this scan let them in while the paragraph below claimed they
    // were excluded. THE PROSE WAS RIGHT AND THE CODE WAS WRONG, which is the defect this whole gate is about,
    // committed inside the gate. Their own name is removed before asking, and what is left is the real test:
    // do they spawn a path (not `node -e` on an inline fixture) and name a selfcheck that is not themselves.
    // A MODULE SPAWNING `node -e` ON AN INLINE FIXTURE IS NOT RUNNING THE SUITE, and this exclusion predates the
    // closure: freshMachine-selfcheck and boot-trace-selfcheck matched the old scan on THEIR OWN basename.
    const spawnsInline = /(?:execFileSync|spawn)\s*\(\s*process\.execPath\s*,\s*\[\s*"-e"/.test(src);
    if (spawnsInline && !IMPORTS_TABLE.test(src)) continue;
    const rel = path.relative(ENG, f).split(path.sep).join("/");
    // *** AND A MODULE THAT ACCEPTS A LIMIT IS NOT A MODULE THAT CHOOSES ONE. ***
    // Widening the population surfaced six silent runners, and three of them -- redCensus, collisionCensus,
    // budgetExile -- spawn with `timeout: timeoutMs`, a PARAMETER their caller supplies. They have no number to
    // declare: asking them for a reason would produce a comment about somebody else's decision, which is the
    // checklist-item shape this tree refuses. Only a limit the module PICKS is a limit it owes an account of.
    // Detected from the argument's own spelling: a literal, or a module-level CONSTANT, is chosen; a lowercase
    // local identifier is passed in.
    const picks = /timeout:\s*(?:\d|[A-Z][A-Z0-9_]*\b)/.test(src) || /SIGKILL/.test(src);
    rows.push({ rel, reads: IMPORTS_TABLE.test(src), own: /budgetIsOwn/.test(src), picks });
}

// ---- 1. THE POPULATION IS DERIVED, AND WHAT IT EXCLUDES IS NAMED ------------------------------------------
say(rows.length + " modules spawn a selfcheck under a time limit: " +
    rows.filter((r) => r.reads).length + " read gateBudget, " +
    rows.filter((r) => !r.reads && r.own).length + " declare their own with a reason, " +
    rows.filter((r) => !r.reads && !r.own).length + " neither");
for (const r of rows) say("  " + (r.reads ? "TABLE " : r.own ? "OWN   " : "SILENT") + "  " + r.rel);
say("EXCLUDED ON PURPOSE: freshMachine-selfcheck and boot-trace-selfcheck spawn `node -e` on their own");
say("  fixtures rather than running the gate suite, and main.js only DISCUSSES the table in its changelog --");
say("  which is exactly the match codeOnly would have kept and noComments drops.");

// ---- 2. THE WALL ------------------------------------------------------------------------------------------
// A runner that takes its limit from its caller is reported apart, never counted silent: it has nothing to own.
const passedIn = rows.filter((r) => !r.reads && !r.own && !r.picks);
for (const r of passedIn)
    say("  PASSED-IN  " + r.rel + "  -- spawns with a caller-supplied timeout, so it chooses no budget to declare");
const silent = rows.filter((r) => !r.reads && !r.own && r.picks);
ok("!! *** every runner that budgets a gate reads the one table, or says why it does not ***",
   silent.length === 0,
   rows.length + " runners, " + silent.length + " silent" +
   (silent.length ? " -- " + silent.map((r) => r.rel).join(", ")
    : ". rigRunner was silent from v2559 to v3919 and rig.html reported its number as though it were the " +
      "budget. A second constant is not a bug you can see by reading either file"));

ok("!! ...and the population is not empty, which is the way this check would go vacuous",
   rows.length >= 3 && rows.some((r) => r.reads),
   rows.length + " runners found, " + rows.filter((r) => r.reads).length + " reading the table. A scan whose " +
   "regex stopped matching would report zero runners and zero silent ones and print PASS");

// ---- 3. THE TWO CONSTANTS THAT SHARE A NAME MUST NOT SHARE IT SILENTLY ------------------------------------
const android = await import("../roundhouse/androidRunner.mjs");
ok("!! *** androidRunner exports DEFAULT_BUDGET_MS TOO, and the collision is declared rather than discovered ***",
   android.DEFAULT_BUDGET_MS !== DEFAULT_BUDGET_MS && typeof android.budgetIsOwn === "string" &&
   android.budgetIsOwn.length >= 80,
   "androidRunner " + android.DEFAULT_BUDGET_MS + "ms vs gateBudget " + DEFAULT_BUDGET_MS + "ms, same name. " +
   "Whichever one you are reading looks authoritative, which is why the difference is stated in the file " +
   "rather than left for the next reader to find");

// ---- 4. THE CONSEQUENCE, MEASURED RATHER THAN ASSERTED ----------------------------------------------------
const OLD_FLAT = 180000;
const strangled = Object.keys(MEASURED).filter((k) => budgetFor(k) > OLD_FLAT);
ok("!! the twenty gates the old flat budget could never have passed are COUNTED, not described",
   strangled.length >= 20,
   strangled.length + " of " + Object.keys(MEASURED).length + " MEASURED gates have a budget above the old " +
   "flat 180s -- worst is " + strangled.map((k) => [k, budgetFor(k)]).sort((a, b) => b[1] - a[1])[0][0] +
   " at " + Math.round(Math.max(...strangled.map((k) => budgetFor(k))) / 1000) + "s. The flat number sat ABOVE " +
   "the 139.9s general default, so the ordinary population was fine and only the measured tail was strangled -- " +
   "which is why it read as `assumptionMap is slow` for seven hundred versions");

// ---- 5. AND THE PAGE NO LONGER CARRIES ITS OWN COPY -------------------------------------------------------
// *** noComments IS A JS TOKENIZER AND rig.html IS NOT JS. *** Run over the whole page it takes an apostrophe
// in ordinary HTML text as the start of a string literal and swallows the rest of the file, so the comment
// below reporting this very fix survived the strip and the check failed on its own explanation. Line-wise
// removal of `//` lines is the crude tool and it is the CORRECT one for the question being asked.
const rig = fs.readFileSync(path.join(ENG, "rig.html"), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
ok("!! rig.html does not substitute a number of its own when the server sends none",
   !/180000/.test(rig),
   "the page read `r.timeoutMs || 180000` and would have gone on printing `180s budget` after the server " +
   "started sending 568s. A budget the page cannot read is now reported as unknown; inventing one is how two " +
   "copies stay agreeing while both are wrong");

console.log(failed ? "\nrunnerBudget-selfcheck: " + failed + " FAILED" : "\nrunnerBudget-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
