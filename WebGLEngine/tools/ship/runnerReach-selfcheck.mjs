// WebGLEngine/tools/ship/runnerReach-selfcheck.mjs -- v4583
//
// Run: node tools/ship/runnerReach-selfcheck.mjs
// RUNTIME 3414 ms ALONE (median of 3259/3414/3447) and 3431 ms AT EIGHT-WIDE (median of five). *** IT IS OVER THE
// 3000 ms SHIP-TIME SWEEP BUDGET AND THAT IS DELIBERATE. *** The row that matters here reads the POPULATION
// runnerBudget-selfcheck actually computes, by running it and parsing its own output, because seven sabotages
// walked past a draft that tested for declarations instead. That child walks the whole tree, and it is what the
// three seconds buy. quickSweep will confirm it serially per v4408 and file an ALONE reading; it belongs in the
// full suite rather than the quick sweep, which is what being over budget means and not a failing.
//
// SABOTAGE: 15 mutations, 15 red, no 0-RED -- after a first pass with SEVEN 0-REDs, every one a defect here. Six of
// them were the same defect: rows testing that a declaration EXISTS while the sabotage changed the BEHAVIOUR it
// declares -- the spawn test narrowed, the closure disabled, gates re-admitted as authorities, the import-line strip
// dropped, caller-supplied limits counted as chosen, the seed narrowed. All seven are now covered by one row that
// runs the check and reads the number it prints. The seventh was a substring: renaming `budgetIsOwn` to
// `budgetIsOwnX` left `/budgetIsOwn/` matching, so three declarations could be removed invisibly.
//
// *** THE CHECK THAT ASKS "WHO BUDGETS A GATE" DEFINED ITS POPULATION BY THREE STRING COINCIDENCES. ***
//
// tools/ship/runnerBudget-selfcheck.mjs exists because rigRunner was silent from v2559 to v3919 and rig.html
// reported its own number as though it were gateBudget's. It requires every runner that budgets a gate either to
// read that table or to say why not. Its population was: spawns `spawn(process.execPath` or
// `execFile(process.execPath`, AND contains `SIGKILL` or `timeout:`, AND mentions `-selfcheck` outside its own
// basename. v4582 found the third predicate by accident -- adding a SKIP_LINE regex to quickSweep introduced the
// string and pulled a runner of eleven rounds' standing into the population for the first time. This round asked
// what else those three predicates were hiding. All three are wrong, in different directions:
//
//   THE SPAWN TEST wanted process.execPath as the literal first argument. tools/ship/verify.mjs destructures
//   execFileSync from a dynamic import; tools/ship/ship.mjs passes process.execPath through a `run` helper. THE
//   SHIP AND ITS GATE RUNNER WERE BOTH OUTSIDE THE POPULATION, and so was ai-bridge/shipBridge.js, which reaches
//   gates only through ship.mjs.
//
//   THE TIME-LIMIT TEST admits any `timeout:`. ai-bridge/sourceChainBridge.js entered the candidate set on a
//   `timeout: 1500` HTTP health probe and was then excluded for not naming a selfcheck -- while the verify.mjs it
//   spawns over a freshly cloned tree carries NO cap at all. Admitted for one wrong reason, excluded for another.
//
//   THE `-selfcheck` MENTION is a proxy for "runs gates" that misses one level of indirection and misses
//   enumeration entirely: quickSweep contains no gate path because it calls enumerateGates().
//
// *** AND THE MEASURED CONSEQUENCE, STATED AT ITS TRUE SIZE RATHER THAN ITS MOST ALARMING ONE. ***
// shipBridge's dry-run limit was 600,000 ms around a process whose own per-step cap is 900,000: AN OUTER TOTAL
// BELOW THE INNER PER-STEP LIMIT IT CONTAINS, so a dry run could die while its slowest step was well inside its
// budget, reporting `timedOut` with no text -- ship.mjs's v3936 note records that exact failure after a 923-second
// ritual, because a killed child's buffered stdout never flushes. That one is real and is fixed. verify.mjs's flat
// 180,000 ms on three lockstep gates is NOT a live problem: they cost 61, 127 and 112 ms, three orders of magnitude
// clear. It is declared anyway, because an undeclared number is not excused by being generous today.
//
// THE POPULATION IS A CLOSURE NOW, NOT A LONGER LIST OF SPELLINGS: a runner spawns a gate, or spawns a file that is
// itself a runner, computed to a fixed point. 5 modules became 14. Four refinements were needed and each came from
// a wrong result rather than from foresight -- a gate spawning a gate as a fixture is not an authority, requiring a
// runner is not being one, accepting a caller's timeout is not choosing one, and a runner may enumerate rather than
// name. WHAT REMAINS: a target built entirely from run-time data would still be invisible, and that hole was
// load-bearing within minutes of being written down as remaining.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { noComments, proseHas } from "./sourceScan.mjs";
import { DEFAULT_BUDGET_MS, MEASURED, TAIL_HEADROOM } from "./gateBudget.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

const RB = fs.readFileSync(path.join(HERE, "runnerBudget-selfcheck.mjs"), "utf8");
const src = (rel) => noComments(fs.readFileSync(path.join(ENG, rel), "utf8"));

console.log("runnerReach-selfcheck -- which runners the budget check can see, and which it could not\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE THREE PREDICATES THAT DEFINED THE OLD POPULATION, AND WHAT EACH MISSED ***");
{
    // Driven against the real files, not asserted from the write-up. Each row names a runner the old rule could
    // not reach and the predicate that stopped it.
    const OLD_SPAWN = /(?:spawn|execFile)\s*\(\s*process\.execPath/;
    const ship = src("tools/ship/ship.mjs"), verify = src("tools/ship/verify.mjs");
    const chain = src("ai-bridge/sourceChainBridge.js"), bridge = src("ai-bridge/shipBridge.js");

    say("ship.mjs matches the old spawn test", String(OLD_SPAWN.test(ship)));
    say("verify.mjs matches the old spawn test", String(OLD_SPAWN.test(verify)));

    ok("*** the old spawn test could not see the ship or its gate runner ***",
        !OLD_SPAWN.test(ship) && !OLD_SPAWN.test(verify) &&
        /process\.execPath/.test(ship) && /process\.execPath/.test(verify),
        "both spawn node and neither writes process.execPath as the literal first argument -- ship.mjs passes it " +
        "through a `run` helper, verify.mjs destructures execFileSync from a dynamic import. THE PATTERN TESTED A " +
        "SPELLING AND THE PROPERTY WAS 'SPAWNS NODE'.");

    ok("...and the new candidate test asks for the two facts separately",
        /const SPAWN_CALL = /.test(RB) && /const NAMES_NODE = /.test(RB),
        "calls a spawn function, and names process.execPath. Two questions that are each answerable, instead of " +
        "one pattern that answers a narrower one.");

    // The chain bridge's only timeout has nothing to do with the gates it runs.
    const chainHasHttpTimeout = /timeout:\s*1500/.test(chain);
    const chainCapsVerify = /verify\.mjs[\s\S]{0,400}?timeout/.test(chain);
    ok("*** sourceChainBridge was admitted by an HTTP probe's timeout and caps its verify not at all ***",
        chainHasHttpTimeout && !chainCapsVerify,
        "`timeout: 1500` on a /health poll is what put it in the candidate set; the verify.mjs it spawns over a " +
        "cloned tree runs unbounded. ADMITTED FOR ONE WRONG REASON AND EXCLUDED FOR ANOTHER, so the absence of a " +
        "cap was never a decision anybody made -- it is now, and it is declared.");

    ok("...and shipBridge reaches gates only through ship.mjs, which the old rule also could not see",
        /ship\.mjs/.test(bridge) && !/-selfcheck/.test(bridge),
        "so no chain of the old predicates could ever have reached it: it names no selfcheck, and the one file it " +
        "does name was itself outside the population.");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE POPULATION IS A CLOSURE, AND IT NEARLY TRIPLED ***");
{
    const POP_V4583 = Object.freeze({ before: 5, after: 14 });
    const isClosure = /for \(let grew = true; grew;\)/.test(RB);
    const seedBoth = /enumerateGates\|gateFiles/.test(RB);
    say("population before / after", `${POP_V4583.before} / ${POP_V4583.after}`);

    // *** THE POPULATION IS OBSERVED BY RUNNING THE CHECK, NOT BY READING ITS SOURCE. ***
    //
    // The first draft of this section tested that `const SPAWN_CALL =` and the closure loop were PRESENT, and seven
    // sabotages walked straight past it: narrowing the spawn test back, disabling the closure, re-admitting gates as
    // authorities, dropping the import-line strip, counting caller-supplied limits as chosen, narrowing the seed,
    // and editing the frozen figures -- every one of them changed the population and none of them changed a
    // declaration. A ROW THAT CHECKS A DECLARATION IS EXISTS CANNOT SEE THE BEHAVIOUR IT DECLARES. The count that
    // matters is printed by the check itself, so it is read from there.
    const out = spawnSync(process.execPath, [path.join(HERE, "runnerBudget-selfcheck.mjs")],
                          { cwd: ENG, encoding: "utf8", timeout: 120000 });
    const m = String(out.stdout || "").match(/(\d+) modules spawn a selfcheck under a time limit: (\d+) read gateBudget, (\d+) declare/);
    const live = m ? { total: Number(m[1]), table: Number(m[2]), own: Number(m[3]) } : null;
    say("observed by running the check", live ? `${live.total} runners, ${live.table} read the table, ${live.own} declare their own` : "(could not read its output)");

    ok("*** the population it actually computes is the widened one, read from its own output ***",
        !!live && live.total === POP_V4583.after && live.total > POP_V4583.before * 2,
        `${live ? live.total : "?"} against a frozen ${POP_V4583.after}, up from ${POP_V4583.before}. Every ` +
        "predicate this round changed moves this number, and nothing else in this gate does -- which is why it is " +
        "the row that has to hold. If the check cannot be run at all this row fails rather than passing quietly.");

    ok("...and every member accounts for its limit, which is the check's own verdict rather than this gate's summary",
        out.status === 0 && live && live.table + live.own === live.total - 3,
        `exit ${out.status}; ${live ? live.table + live.own : "?"} of ${live ? live.total : "?"} account for a ` +
        "limit and 3 take their caller's. Reading a gate's EXIT CODE as well as its numbers, because a count " +
        "parsed out of a failing run is a number from a run that said no.");

    ok("*** membership is computed to a fixed point rather than matched against a list of spellings ***",
        isClosure && seedBoth,
        "a runner spawns a gate, or spawns a file that is itself a runner. ship.mjs enters because it spawns " +
        "verify.mjs; shipBridge enters because it spawns ship.mjs. NOTHING IS TYPED, which is what stops the next " +
        "runner from being outside by coincidence the way quickSweep was for eleven rounds.");

    ok("...and the seed admits a runner that ENUMERATES as well as one that names",
        seedBoth,
        "quickSweep contains no gate path at all -- it calls enumerateGates() and spawns what comes back. Seeding " +
        "on literal paths dropped the one runner that runs everything, which was this round's own regression: the " +
        "import-line fix that removed server.js took quickSweep with it, and the count is what showed it.");

    ok("...and the four refinements are each in the file, because each came from a wrong answer",
        // proseHas: these four live in runnerBudget's COMMENTS, and an unwrapped regex breaks the moment an editor
        // re-flows a line. gateQuality-selfcheck names that debt class and its list may only shrink -- these four
        // arrived on it in this round's first run, which is what prompted the conversion.
        proseHas(RB, /A GATE THAT SPAWNS A GATE IS NOT A RUNNER/) &&
        proseHas(RB, /REQUIRING A RUNNER IS NOT BEING ONE/) &&
        proseHas(RB, /A MODULE THAT ACCEPTS A LIMIT IS NOT A MODULE THAT CHOOSES ONE/) &&
        proseHas(RB, /TWO WAYS TO RUN GATES/),
        "25 members when gates counted as authorities, 15 when requiring one counted as being one, six silent " +
        "before caller-supplied limits were separated out, and 13 before enumeration was admitted. FOUR WRONG " +
        "POPULATIONS BEFORE ONE THAT HOLDS, every one corrected by a count rather than by review.");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE INVERSION: AN OUTER TOTAL LIMIT BELOW THE INNER PER-STEP LIMIT IT CONTAINED ***");
{
    const WAS = Object.freeze({ real: 900000, dry: 600000 });
    const bridge = await import("../../ai-bridge/shipBridge.js").then((m) => m.default || m).catch(() => null);
    const step = bridge ? bridge.SHIP_STEP_CAP_MS : null;
    const total = bridge ? bridge.SHIP_TIMEOUT_MS : null;
    say("ship.mjs per-step cap, read from its source by the bridge", `${step} ms`);
    say("bridge total, before / now", `real ${WAS.real}, dry ${WAS.dry} / ${total} for both`);

    ok("*** the old dry-run total was BELOW the per-step cap it wrapped ***",
        WAS.dry < step,
        `${WAS.dry} < ${step}. A dry run still executes the verify step -- that is where the time goes -- so it ` +
        "could be killed while its slowest step sat well inside its own budget, and the bridge would report " +
        "timedOut with NO TEXT, because a killed child's buffered stdout never flushes. ship.mjs's v3936 note " +
        "records that after a 923-second ritual hit the same 900.");

    const bridgeSrc = noComments(fs.readFileSync(path.join(ENG, "ai-bridge/shipBridge.js"), "utf8"));
    ok("...and the bridge's limit is DERIVED from that cap now, and the CALL SITE uses it",
        total === step * 2 && /--step-timeout/.test(bridgeSrc) &&   // in a regex literal, so the escaped paren is not searched for
        /runShip\(args, SHIP_TIMEOUT_MS\)/.test(bridgeSrc) && !/runShip\(args, isReal \?/.test(bridgeSrc),
        `${total} = ${step} x 2, with the step cap read out of ship.mjs the way this bridge already reads ` +
        "ENGINE_VERSION out of main.js. The multiple is a judgement and is named as one; what it guarantees is " +
        "that this bridge never kills a ship the ritual's own cap would have allowed.");

    // AND IT IS NOT DERIVED FROM THE TABLE, WHICH IS THE HONEST HALF.
    const tailSum = Object.values(MEASURED).reduce((a, b) => a + b, 0);
    const singleOverBridge = Object.entries(MEASURED).filter(([, v]) => v > WAS.real);
    say("MEASURED tail, summed", `${(tailSum / 60000).toFixed(1)} min across ${Object.keys(MEASURED).length} gates`);
    ok("*** and no wall-clock ship limit could be derived from the table, which is why it is declared instead ***",
        singleOverBridge.length === 3 && tailSum > 15000000,
        `${singleOverBridge.length} single gates cost more than the whole 900 s limit on their own (worst ` +
        `${Math.max(...singleOverBridge.map(([, v]) => v))} ms), and the tail sums to ` +
        `${(tailSum / 60000).toFixed(0)} minutes. A ship limit derived from these numbers would be four hours; ` +
        "the limit is a claim about a RITUAL, not about gates, and budgetIsOwn says so rather than pretending " +
        "otherwise.");
}

// ---------------------------------------------------------------------------
console.log("\n4. EVERY RUNNER NOW ACCOUNTS FOR ITS LIMIT, AND THE THREE THAT HAVE NOTHING TO ACCOUNT FOR SAY SO");
{
    const declares = ["tools/ship/ship.mjs", "tools/ship/verify.mjs", "ai-bridge/shipBridge.js",
                      "ai-bridge/sourceChainBridge.js", "tools/ship/quickSweep.mjs"];
    // `budgetIsOwn\s*=` rather than `budgetIsOwn`: renaming the constant to budgetIsOwnX left the substring intact
    // and three sabotages -- shipBridge's, ship.mjs's and verify.mjs's declarations each renamed away -- moved
    // nothing at all. A SUBSTRING TEST PASSES ON A NAME THAT MERELY STARTS THE SAME WAY, which is the weaker-test-
    // than-intended shape v4581 found in a duplicated key.
    const missing = declares.filter((r) => !/\bbudgetIsOwn\s*=/.test(src(r)));
    ok("*** the five runners this arc brought into the population all declare their own limit ***",
        missing.length === 0,
        declares.map((r) => r.split("/").pop()).join(", ") +
        (missing.length ? " -- MISSING: " + missing.join(", ") : ""));

    ok("...and the check separates a limit CHOSEN from a limit ACCEPTED",
        /const passedIn = rows\.filter/.test(RB) && /PASSED-IN/.test(RB),
        "redCensus, collisionCensus and budgetExile spawn with `timeout: timeoutMs` -- their caller's number. " +
        "Asking them for a reason would produce a comment about somebody else's decision, which is a checklist " +
        "item rather than a control. Reported apart, never counted silent.");

    ok("...and verify.mjs's flat cap is declared with its consequence measured at NIL, not dramatised",
        // Read out of the DECLARATION, not out of the file: the numbers appear twice in verify.mjs -- once in the
        // comment above and once in budgetIsOwn -- so deleting them from the reason left the file still matching
        // and the sabotage invisible. The reason is what a reader is handed, so the reason is what is checked.
        /61, 127 and 112 ms/.test(declarationOf("tools/ship/verify.mjs")) && 180000 < DEFAULT_BUDGET_MS,
        `180,000 ms against a ${DEFAULT_BUDGET_MS} ms default the table would otherwise grant -- 0.55x, which ` +
        "sounds alarming and is not: the three gates it guards cost about a tenth of a second each. THE ROUND " +
        "SAYS WHICH OF ITS FINDINGS BITES AND WHICH DOES NOT.");
}

/** The text of a module's budgetIsOwn declaration, so a claim can be checked where a reader will meet it. */
function declarationOf(rel) {
    const m = src(rel).match(/\bbudgetIsOwn\s*=\s*([\s\S]*?);\n/);
    return m ? m[1] : "";
}

console.log(fails ? `\nrunnerReach-selfcheck: ${fails} FAILED` : "\nrunnerReach-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
