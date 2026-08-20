// tools/ship/loopTrace-selfcheck.mjs -- v3750
//
// The gate for tools/ship/loopTrace.mjs -- step 6, the last of the six.
//
// *** A TRACE IS NOT A LOG OF WHAT WORKED. It is the record that makes reward hacking visible AFTERWARDS,
// which is the one failure the whole plan was built around. So every check here is about what the trace
// REFUSES TO LEAVE OUT: rejections, the rule that judged each attempt, and a name for what was tried. ***

import { record, entries, resetTrace, summarise, toJSONL } from "./loopTrace.mjs";
import { acceptWithHoldout } from "./loopAccept.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "loopTrace.mjs"), "utf8");

// ---- 1. REJECTIONS ARE IN IT -------------------------------------------------------------------------------
console.log("1. A TRACE OF ACCEPTED ATTEMPTS IS A HIGHLIGHT REEL, NOT A RECORD");
{
    resetTrace();
    acceptWithHoldout({ score: 36, tol: 1e-8 }, { score: 35, tol: 1e-8, met: true }, { what: "gate: one-iteration change" });
    acceptWithHoldout({ score: 36, tol: 1e-8 }, { score: 31, tol: 1e-8, met: true }, { what: "gate: five-iteration change" });
    const rows = entries();
    ok("!! *** THE REJECTED ATTEMPT IS IN THE TRACE, NOT JUST THE WINNER ***",
        rows.length === 2 && rows.filter((e) => !e.accept).length === 1 && rows.filter((e) => e.accept).length === 1,
        rows.map((e) => e.n + ":" + (e.accept ? "ACCEPT" : "reject")).join(", ") + ". Fifty attempts landing one " +
        "iteration under the floor look like NOTHING AT ALL if only the winner is written down");
    ok("!! every row carries the rule that judged it -- the gain AND the floor in force",
        rows.every((e) => typeof e.gain === "number" && typeof e.floor === "number"),
        "a trace that records only OUTCOMES cannot answer 'did the bar move during the run?', and that " +
        "question is the whole reason to keep one");
    ok("!! and the accepted row carries its holdout result",
        rows.find((e) => e.accept).holdout !== null && rows.find((e) => e.accept).peeks === 4,
        "the veto evidence travels with the verdict rather than being re-derivable only by re-running");
}

// ---- 2. RECORDING IS NOT OPTIONAL --------------------------------------------------------------------------
console.log("\n2. THE ONLY WAY TO GET A VERDICT IS TO LEAVE A ROW");
{
    resetTrace();
    let threw = false;
    try { acceptWithHoldout({ score: 36, tol: 1e-8 }, { score: 31, tol: 1e-8, met: true }); } catch { threw = true; }
    ok("!! *** AN UNNAMED ATTEMPT THROWS BEFORE IT CAN SCORE, AND LEAVES NO ROW ***",
        threw === true && entries().length === 0,
        "A TRACE THE CALLER MUST REMEMBER TO WRITE IS A TRACE WITH HOLES EXACTLY WHERE A SEARCH WENT WRONG. " +
        "'The caller must remember' is the shape that produced v3746's too-permissive rule, and it is refused " +
        "in the same way here: no default, a throw by name");
    ok("record() refuses an unnamed attempt on its own too",
        (() => { try { record("", { accept: true }); return false; } catch { return true; } })(),
        "the guard lives on the recorder, not only on its caller");
}

// ---- 3. APPEND-ONLY ----------------------------------------------------------------------------------------
console.log("\n3. A TRACE THAT CAN BE REWRITTEN IS NOT A TRACE");
{
    const code = codeOnly(SRC);
    // *** MY FIRST VERSION BANNED `.pop(` ANYWHERE IN THE MODULE AND WENT RED ON
    // `process.argv[1].split("/").pop()` -- THE MAIN GUARD. A check that forbids an idiom ANYWHERE indicts
    // every legitimate use of it, and this is the THIRD time that shape has landed in one of my own gates this
    // session (v3741's summary.innerHTML, v3745's count). SCOPE TO THE SUBJECT: it is the TRACE ARRAY that
    // must not be mutated, not the file that must avoid a word. ***
    ok("!! *** the trace array is never spliced, popped or shifted, and nothing here writes a file ***",
        !/_entries\.(splice|pop|shift|unshift|sort|reverse|fill|copyWithin)\(/.test(code) &&
        !/unlinkSync|writeFileSync|appendFileSync/.test(code),
        "asserted BY MECHANISM against the ARRAY. `resetTrace` sets length to 0 and is FOR FIXTURES -- a real " +
        "run never calls it, and this gate is its only caller in the tree");
    resetTrace();
    const e = record("gate: frozen row", { accept: true, why: "x", eval: { gain: 9, floor: 3 } });
    const before = JSON.stringify(e);
    try { e.gain = 999; e.what = "rewritten"; } catch { /* frozen objects throw in strict mode */ }
    ok("!! a returned row cannot be edited after the fact",
        JSON.stringify(entries()[0]) === before,
        "rows are frozen, so a caller holding a reference cannot revise history from the outside");
    ok("!! and entries() hands back a COPY, so the array itself cannot be reached",
        (() => { const a = entries(); a.push({ n: 999 }); return entries().length === 1; })());
}

// ---- 4. THE SHAPES IT EXISTS TO SURFACE --------------------------------------------------------------------
console.log("\n4. THE SUMMARY NAMES WHAT A READER WOULD OTHERWISE HAVE TO NOTICE BY EYE");
{
    resetTrace();
    record("a", { accept: false, why: "gain 2 is inside the noise floor 3", eval: { gain: 2, floor: 3 } });
    record("b", { accept: false, why: "HOLDOUT VETO on kindBlob (+9 > floor 5)", eval: { gain: 6, floor: 3 } });
    record("c", { accept: true, why: "ok", eval: { gain: 3, floor: 3 } });
    const s = summarise();
    ok("!! a rejected gain just under the floor is a NEAR-MISS -- a searcher circling the bar",
        s.nearMisses === 1 && s.nearMissRows[0].endsWith(":a"));
    ok("!! *** AND A HOLDOUT VETO IS NOT COUNTED AS A NEAR-MISS, WHICH THE FIRST VERSION GOT WRONG ***",
        s.vetoed === 1 && !s.nearMissRows.some((r) => r.endsWith(":b")),
        "the worked example exposed it immediately: an attempt with gain 6 against floor 3 was counted a " +
        "near-miss because 3-6 = -3 is ALSO <= 1. IT HAD CLEARED THE BAR BY DOUBLE and was rejected by the " +
        "HOLDOUT -- a different rejection entirely. Conflating them would have inflated the one count whose " +
        "whole job is to look suspicious. FOUND BY READING THE OUTPUT, NOT BY TRUSTING IT");
    ok("!! an accepted gain sitting EXACTLY at the floor is a BARE PASS",
        s.barePasses === 1 && s.barePassRows[0].endsWith(":c"),
        "winning by the minimum, repeatedly, is what a search that has learned where the bar is looks like");
    ok("!! every count names its rows",
        s.nearMisses === s.nearMissRows.length && s.barePasses === s.barePassRows.length && s.vetoed === s.vetoedRows.length,
        "a count with no rows is a number nobody can check -- the shape this tree keeps finding in its own censuses");

    resetTrace();
    record("x", { accept: false, why: "", eval: { gain: 1, floor: 3 } });
    record("y", { accept: false, why: "", eval: { gain: 1, floor: 7 } });
    ok("!! FLOOR DRIFT is reported when the bar itself moved during a run",
        summarise().floorDrift === true && summarise().floorsSeen.length === 2,
        "floors " + summarise().floorsSeen.join(", ") + " -- the floor is re-measured each call, so it CAN move " +
        "honestly (a different n, a changed ensemble); the point is that a reader can SEE that it did");
}

// ---- 5. IT REPORTS, IT DOES NOT JUDGE ----------------------------------------------------------------------
console.log("\n5. COUNTS, NOT CONCLUSIONS");
ok("!! the summary carries no verdict word and says so in its own payload",
    /counts, not conclusions/.test(summarise().note) &&
    !/suspicious|cheat|hack/i.test(JSON.stringify({ ...summarise(), note: "" })),
    "*** NONE OF THESE COUNTS IS EVIDENCE OF CHEATING AND THE MODULE MUST NOT SAY IT IS. Calling a bare pass " +
    "'suspicious' would be the checker grading INTENT, and intent is not something a counter can see. They are " +
    "the things worth LOOKING AT, and naming them is what a person needs in order to look ***");

ok("the module writes no file -- where a trace lives is the caller's decision",
    !/writeFileSync|appendFileSync|createWriteStream/.test(codeOnly(SRC)) && typeof toJSONL() === "string",
    "toJSONL() serialises for a caller to persist; a tool that picks a path for you is one you have to fight later");

report("WHAT THIS DOES NOT CLAIM",
    "That the trace has ever recorded a real search. NO LOOP EXISTS -- every row in every check here is a " +
    "fixture, and the only production caller is acceptWithHoldout, which currently compares a solver to " +
    "ITSELF (v3749's structural limit). THE SHAPES ARE MEASURABLE AND THE PLUMBING IS ASSERTED; whether a real " +
    "run produces near-misses in a suspicious pattern is a thing that needs a real run, and that is step 0.");

console.log("\nloopTrace-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
