// WebGLEngine/tools/ship/checkerCensus-selfcheck.mjs -- v3566
//
// Run: node tools/ship/checkerCensus-selfcheck.mjs
// RUNTIME 2s MEASURED with date(1) around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTIONS 2 AND 3 ARE THE ROUND: they drive the two properties I TRIED FIRST AND REJECTED, and show what
// each admits that it should not. A census that only demonstrated the shipped answer would be hiding the part
// worth keeping. ***
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { census, drivenByVerify, spawnedByVerify, spawnedIn, shipReach, BY_HAND, SPAWNED_BY_VARIABLE, isNamed, isShaped, shapeCounts, selfExclusions, walkMjs,
         SHAPE_MIN, ENG, VERIFY, MEASURED_V3566, reportLines } from "./checkerCensus.mjs";
import { hasMainBlock } from "./orphanTriage.mjs";
import { noComments } from "./sourceScan.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);
const src = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");

console.log("checkerCensus-selfcheck -- does the filename decide what counts as a check?\n");
const C = census();

// ---------------------------------------------------------------------------
console.log("1. *** THE ANSWER TO THE QUESTION: EIGHT MODULES RUN EVERY SHIP THAT isGate CANNOT SEE ***");
{
    const dnn = C.drivenAll.filter((f) => !isNamed(f));
    report("NAMED / DRIVEN / SHAPED", C.named + " / " + C.drivenAll.length + " / " + C.shaped);
    for (const f of dnn) report("  driven, not named", f);

    ok("!! verify DRIVES modules that a name-based isGate treats as non-gates", dnn.length > 3,
        "*** rigidSuite.mjs is among them, and it grades physics/voxel/fracture.js against the ANALYTIC box " +
        "tensor to 1e-9 and checks the flood fill EXACTLY. I said that file had no gate. IT HAS A VERY GOOD " +
        "ONE AND verify HAS BEEN RUNNING IT ON EVERY SHIP ALL SESSION. ***");
    ok("!! ...and orphanTriage's isGate really is just a filename test",
        /\/-selfcheck\\\.mjs\$\//.test(noComments(src("tools/ship/orphanTriage.mjs"))),
        "`const isGate = (f) => /-selfcheck\\.mjs$/.test(f)`. Not my grep's blind spot alone -- EVERY 'does X " +
        "have a gate?' question in this project is asking about a filename.");
    // *** THIS LINE WENT RED AT v3726 BECAUSE THE MECHANISM IT PINNED WAS CORRECTLY REPLACED, which is the
    // twenty-sixth instance of that shape in these notes. It asserted `drivenByVerify().size === drivenAll.length`
    // -- i.e. that DRIVEN comes from EXACTLY ONE ROUTE -- and v3726 added the SPAWN route because verify reaches
    // files it never imports. REWRITTEN TO THE PROPERTY (drivenAll is DERIVED FROM verify's OWN TEXT and is the
    // union of the routes) rather than to the arrangement that satisfied it yesterday. If a THIRD route is ever
    // added, this goes red again and must be widened to include it -- never weakened to a subset test. ***
    const _imp = drivenByVerify(), _spw = spawnedByVerify(), _union = new Set([..._imp, ..._spw]);
    ok("!! the DRIVEN list is read from verify's OWN TEXT, not from a hand-kept list, and it is EVERY route",
        C.drivenAll.length === _union.size && _union.size > 0 &&
        C.drivenAll.every((f) => _union.has(f)),
        "resolved out of tools/ship/verify.mjs by import AND by spawn, so it is what the ship ritual RUNS " +
        "rather than what anybody believes it runs -- two declarations about one thing that nobody had compared");
    ok("!! ...and DRIVEN is reported rather than treated as the answer, because it admits a non-checker",
        C.drivenOutsideCorpus.length > 0 && C.drivenAll.includes("physics/jolt/joltLoader.js"),
        "joltLoader.js is driven by verify and CHECKS NOTHING -- it is a loader. *** A ROUTE THAT ADMITS " +
        "SOMETHING IT SHOULD NOT IS REPORTED WITH THAT FACT, NOT QUIETLY FILTERED. *** It is also a .js, so " +
        "counting only what the .mjs walk contains would have hidden the very file that proves the point.");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE FIRST SHAPED PROPERTY WAS `tol:` AND IT CANNOT TELL A SOLVER FROM A SUITE ***");
{
    const TOL = /\btol\s*:/;
    const tolOnly = walkMjs().map((f) => path.relative(ENG, f).split(path.sep).join("/"))
        .filter((r) => !isNamed(r) && TOL.test(noComments(src(r))));
    report("unnamed files carrying `tol:`", String(tolOnly.length));
    report("...including", tolOnly.filter((f) => /flip2d|multigrid\.mjs|consistency\.mjs/.test(f)).join(", "));

    ok("!! `tol:` alone admits SOLVERS", tolOnly.some((f) => /flip2d/.test(f)) && tolOnly.some((f) => /consistency\.mjs/.test(f)),
        "*** A SOLVER'S `tol:` IS A CONVERGENCE TOLERANCE AND A SUITE'S IS AN EXPECTED-VALUE WINDOW. TWO " +
        "THINGS WEARING ONE LABEL -- this tree's most-repeated shape, committed in my own detector ONE TURN " +
        "AFTER I NAMED IT. ***");

    const counts = (f) => shapeCounts(src(f));
    for (const f of ["tools/ship/rigidSuite.mjs", "tools/ship/physicsSuite.mjs", "physics/consistency.mjs", "fluid/flip2d.mjs"])
        report(f.padEnd(30), "exact " + counts(f).exact + "   got " + counts(f).got + "   tol " + counts(f).tol);
    ok("!! *** REQUIRING `exact:` BESIDE IT SEPARATES THEM CLEANLY ***",
        isShaped(src("tools/ship/rigidSuite.mjs")) && isShaped(src("tools/ship/physicsSuite.mjs")) &&
        !isShaped(src("physics/consistency.mjs")) && !isShaped(src("fluid/flip2d.mjs")),
        "a solver has a tolerance and NO EXPECTED VALUE TO COMPARE AGAINST, because there is nothing it is " +
        "supposed to equal. *** physics/consistency.mjs IS THE SHARP CASE: THREE `tol:` AND ZERO `exact:` -- a " +
        "tol-only property admits it outright, and my FIRST SABOTAGE OF THIS GATE PASSED because the files I " +
        "had picked to discriminate on carried only ONE `tol:` each and fell under the count threshold for the " +
        "wrong reason. A PLANT THAT DOES NOT FLIP THE CHECK IS NOT A SABOTAGE, IT IS A COINCIDENCE. ***");
    ok("...and it counts rather than merely detects, so one word in a string cannot qualify a file",
        SHAPE_MIN >= 2, "both markers must appear at least " + SHAPE_MIN + " times");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** AND `CAN EXIT NONZERO` WAS REJECTED THE SAME WAY ***");
{
    const NONZERO = /process\.exit\(\s*(?!0\s*\))/;
    const exiters = walkMjs().map((f) => path.relative(ENG, f).split(path.sep).join("/"))
        .filter((r) => !isNamed(r) && hasMainBlock(src(r)) && NONZERO.test(noComments(src(r))));
    report("unnamed files that can exit nonzero", String(exiters.length));
    report("...including", exiters.filter((f) => /applyStaged|androidUpdate|ledger/.test(f)).join(", "));
    ok("!! it admits TOOLS, not just checkers", exiters.some((f) => /applyStaged|androidUpdate|ledger/.test(f)),
        "*** EXITING NONZERO IS HOW A TOOL REPORTS TROUBLE, NOT HOW A CHECKER REPORTS A WRONG ANSWER. *** " +
        "Both rejected properties fail the same way: they catch the MACHINERY of failing without the " +
        "SUBSTANCE of comparing.");
    ok("...so neither rejected property is shipped as the classifier",
        !/process\.exit\(\s*\(\?!/.test(src("tools/ship/checkerCensus.mjs")),
        "they are DRIVEN HERE as evidence and named in the register, which is worth more than deleting them");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE CENSUS COUNTED ITSELF, AND IS CLOSED ON ITSELF BY IDENTITY");
{
    ok("!! this file and its gate are excluded", selfExclusions().length === 2,
        "*** ON THE FIRST RUN checkerCensus.mjs QUALIFIED AS A CHECKER, because explaining the SHAPED property " +
        "requires writing `exact:` and `got`. FIFTH COLLECTION: v3449's gate rescued a module with its own " +
        "header, moduleRefs (built to DETECT prose-rescue) was itself prose-rescued, and v3560's shaderRefs " +
        "rescued four shaders and then counted its own gate's prose. ***");
    ok("!! ...BY IDENTITY, so a rename cannot silently re-open it",
        selfExclusions().every((f) => f.endsWith(".mjs")) &&
        !/"tools\/ship\/checkerCensus/.test(src("tools/ship/checkerCensus.mjs").match(/export function selfExclusions[\s\S]*?\n}/)[0]),
        "derived from import.meta.url rather than written as a string -- v3449's precedent");
    ok("...and it is genuinely absent from the rows", !C.rows.some((r) => /checkerCensus/.test(r.file)),
        "not merely unlisted in the report");
}

// ---------------------------------------------------------------------------
console.log("\n5. WHAT THE CENSUS DOES NOT DECIDE, SAID PLAINLY");
{
    report("SHAPED but not named", C.shapedNotNamed.join(", "));
    report("...and not driven either", C.shapedNotNamedNotDriven.join(", ") || "(none)");
    ok("!! all three routes are POPULATED, so none is a dead branch",
        C.named > 0 && C.drivenAll.length > 0 && C.shaped > 0);
    ok("!! ...and they DISAGREE, which is the only reason to have three",
        C.drivenAll.some((f) => !isNamed(f)) && C.shapedNotNamed.length > 0,
        "a set of routes that always agreed would be one route with three names");
    ok("!! nothing is ratcheted and nothing is decided", !("baseline" in MEASURED_V3566),
        "*** WHETHER A FILE FAILS WHEN THE THING IT CHECKS BREAKS IS BEHAVIOURAL, and only sabotage answers " +
        "it, one file at a time. This SORTS BY EVIDENCE AND DECIDES NOTHING -- v3548's orphanTriage in a new " +
        "subject, and the same instruction applies: read them one at a time. ***");
    ok("the report prints and the tool exits zero", reportLines().length > 15,
        "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");
    ok("and isGate itself is NOT edited", /-selfcheck\\.mjs\$/.test(src("tools/ship/orphanTriage.mjs")),
        "widening isGate would move graveyard's membership and every count built on it. THE CENSUS REPORTS THE " +
        "gap; changing the classifier is a separate decision with a baseline behind it.");
}


// ---- *** ROUTE B2: THE SPAWN, WHICH THE REFERENCE GRAPH HAS NO ENTRY FOR (v3726) *** ---------------------------
// moduleRefs.ROUTES is import / dynamic / script / worker / importScripts -- FIVE WAYS TO REACH A FILE AND NONE
// OF THEM IS A CHILD PROCESS. drivenByVerify() reads specifiers(), so it could only ever see what verify IMPORTS,
// and it reported 8 while verify reaches 13 through this file's corpus. WHEN THIS SECTION GOES RED the fix is to
// re-derive the counts and name who moved -- never to relax the comparison, since the whole value of the route is
// that the two halves are counted SEPARATELY.
{
    const imported = drivenByVerify(), spawned = spawnedByVerify();
    report("driven by IMPORT", [...imported].sort().join(", "));
    report("driven by SPAWN", [...spawned].sort().join(", "));

    ok("!! the SPAWN route finds files the IMPORT route cannot",
        [...spawned].some((f) => !imported.has(f)),
        [...spawned].filter((f) => !imported.has(f)).length + " of " + spawned.size + " spawned files are invisible " +
        "to the import route -- a route that agreed with the other would be one route with two names");

    // *** DRIVEN ON A FIXTURE, BECAUSE THE OBVIOUS VERSION OF THIS CHECK COULD NOT FAIL. Asking whether every
    // extracted path is on disk RE-ASKS THE QUESTION THE EXTRACTION JUST ANSWERED -- v3551's shape -- and the
    // plant proved it: deleting the on-disk test left this gate fully green, because verify happens to name only
    // real files. The fixture spawns one path that EXISTS and one that DOES NOT, so the guard is shown working
    // rather than assumed. ***
    const fixture = 'execFileSync(process.execPath, ["tools/ship/pageParse.mjs"]);\n' +
                    'execSync("node tools/ship/thisFileDoesNotExist.mjs");';
    const fx = spawnedIn(fixture, ENG);
    ok("!! a spawn of a path that is NOT on disk is dropped, shown on a fixture rather than assumed",
        fx.has("tools/ship/pageParse.mjs") && !fx.has("tools/ship/thisFileDoesNotExist.mjs") && fx.size === 1,
        "the fixture names one real file and one invented one; the extractor keeps " + [...fx].join(", ") +
        " and drops the rest. WITHOUT THIS THE ON-DISK TEST COULD BE DELETED AND NOTHING WOULD GO RED");

    ok("...and a COMMENT naming a spawn is not a spawn",
        spawnedIn('// execSync("node tools/ship/pageParse.mjs")', ENG).size === 0,
        "noComments strips it first -- prose-as-code, anticipated rather than discovered");

    // *** THE KNOWN LIMIT, PINNED RATHER THAN DESCRIBED. This route reads the ARGUMENT of the spawn call, so a
    // path arriving in a VARIABLE is invisible. verify's three lockstep selfchecks come from a loop array, and
    // they ARE spawned on every ship. A WIDER HEURISTIC COULD REACH THEM AND A SECOND HEURISTIC IS HOW A CENSUS
    // STARTS GUESSING, so the shortfall is asserted instead of closed.
    // WHEN SOMEBODY WIDENS THE ROUTE THIS GOES RED: REWRITE IT TO THE NEW COUNT AND NAME WHO IS NOW SEEN. Do not
    // delete it -- what it guards is that the gap is KNOWN rather than absent.
    ok("!! the variable-path shortfall is DECLARED, and it is still exactly the three lockstep gates",
        SPAWNED_BY_VARIABLE.length === 3 &&
        SPAWNED_BY_VARIABLE.every((f) => !spawned.has(f) && !imported.has(f)) &&
        SPAWNED_BY_VARIABLE.every((f) => { try { return fs.statSync(path.join(ENG, f)).isFile(); } catch { return false; } }),
        "all three are on disk, spawned every ship, and unseen by both routes -- 5 spawned of the 8 verify " +
        "actually spawns. A LIMIT THAT LIVES ONLY IN PROSE IS ONE NOTHING CAN READ");

    ok("!! ...and they are named as LITERALS in verify, which is why the gap is the extraction and not the tree",
        SPAWNED_BY_VARIABLE.every((f) => noComments(src("tools/ship/verify.mjs")).includes(f)),
        "verify spells all three one line above the call that runs them; what this route cannot do is follow " +
        "the loop variable from the array into execFileSync");
}


// ---- *** ROUTE D: WHAT THE SHIP RITUAL ACTUALLY EXECUTES, AND THE BY-HAND SET AS DATA (v3727) *** -------------
// DRIVEN says "verify reaches this file directly". THIS walks the CLOSURE over both routes and asks how many of
// the tree's NAMED gates fall inside it. MEASURED: ONE (blob-policy-selfcheck), plus the three lockstep gates
// SPAWNED_BY_VARIABLE cannot see -- FOUR OF 993. The by-hand set adds seven more that isGate can see, and one
// (pageReach) that it cannot.
// *** THIS DECIDES NOTHING AND MUST NOT ACQUIRE A RATCHET. gateSelection.mjs already says why in the right
// words: NOT RUN IS A THIRD STATE BESIDE PASS AND FAIL. A ratchet here would push gates INTO verify and turn a
// ~4-minute ship into a ~26-minute one, which is how a suite becomes a suite nobody runs. ***
{
    const reach = shipReach(ENG);
    report("named gates the ritual runs", (C.namedRunByVerify.length + C.namedByHand.length) + " of " + C.namedTotal);
    report("by-hand set (declared as data)", BY_HAND.join(", "));

    ok("!! the ship ritual EXECUTES only a small named minority, and the number is DERIVED not typed",
        C.namedTotal > 100 && C.namedRunByVerify.length >= 1 &&
        (C.namedRunByVerify.length + C.namedByHand.length) < C.namedTotal / 10,
        C.namedRunByVerify.length + " named gates are reachable from verify (" + C.namedRunByVerify.join(", ") +
        ") and " + C.namedByHand.length + " more are run by hand, against " + C.namedTotal + " named. THE OTHER " +
        C.namedNotInRitual + " RUN ON DEMAND. *** NOT RUN IS A THIRD STATE BESIDE PASS AND FAIL and this line " +
        "claims nothing about whether they would pass -- DO NOT PUT A RATCHET ON IT ***");

    // *** EVERY BY-HAND ENTRY MUST BE ON DISK AND MUST GENUINELY NOT BE REACHED BY verify, or the list is a lie
    // about the ritual rather than an extra margin. WHEN THIS GOES RED because somebody wired one into verify:
    // REMOVE IT FROM BY_HAND AND NAME WHO WIRED IT. Do not weaken the check. ***
    ok("!! every declared by-hand gate is ON DISK and is genuinely NOT reached by verify",
        BY_HAND.length > 0 && C.byHandMissing.length === 0 && C.byHandUnreachable.length === BY_HAND.length,
        C.byHandMissing.length ? "MISSING: " + C.byHandMissing.join(", ")
            : BY_HAND.length + " entries, none missing, none reachable from verify's closure of " + reach.size +
              " files. A by-hand list naming something verify already runs would overstate what a human must do");

    // THE FOUNDING FINDING OF THIS FILE, ARRIVING IN ITS OWN LIST.
    ok("!! ...and at least one of them is a real gate isGate CANNOT SEE, which is why RITUAL reads 7 and not 8",
        C.byHandNotNamed.length >= 1 && C.byHandNotNamed.every((f) => BY_HAND.includes(f)),
        C.byHandNotNamed.join(", ") + " carries no `-selfcheck` in its name. Rounding the count up would claim " +
        "isGate saw something it cannot -- the same blind spot that hid rigidSuite from six builds' worth of " +
        "'does X have a gate?'");

    ok("!! the closure follows SPAWNS and not only imports, which is what makes the number honest",
        reach.has("tools/ship/pageParse.mjs") && reach.has("brain/blob-policy-selfcheck.mjs"),
        "blob-policy-selfcheck is reachable ONLY by spawn -- before v3726's route it would have counted as " +
        "unrun, and the one named gate verify does execute would have read as zero");
}

console.log(fails ? `\ncheckerCensus-selfcheck: ${fails} FAILED` : "\ncheckerCensus-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
