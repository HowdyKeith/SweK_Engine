// WebGLEngine/tools/ship/checkerCensus.mjs -- v3566
// ---------------------------------------------------------------------------------------------------------------
// WHICH FILES ACTUALLY CHECK SOMETHING? -- ASKED THREE WAYS, BECAUSE THE FILENAME IS ONLY ONE OF THEM.
//
// Keith asked whether physics/voxel/fracture.js really had no gate. IT HAS A VERY GOOD ONE. tools/ship/
// rigidSuite.mjs grades massProperties against the ANALYTIC box tensor to 1e-9 (its own comment records that
// being adjudicated against Jolt's shape-derived tensor to 3.5e-11%) and checks the flood fill EXACTLY -- a
// pillar shot through must give 2 pieces, 1 anchored, 1 falling, and the faller must be the TOP half. AND
// verify.mjs RUNS IT ON EVERY SHIP, so it had been running all session, including on the six builds where I
// said it did not exist.
//
// *** I MISSED IT BECAUSE I GREPPED `--include=*-selfcheck.mjs` AND rigidSuite IS A SUITE. THE FILENAME
// CONVENTION HID IT. *** And that blind spot is not mine alone: orphanTriage's isGate is literally
// /-selfcheck\.mjs$/, so rigidSuite counts as a NON-GATE across the entire orphan census, and every "does X
// have a gate?" question in this project is really asking about a filename.
//
// ================================================================================================================
// THREE ROUTES, AND THE POINT IS THE DISAGREEMENTS
// ================================================================================================================
//
//   NAMED    the file is called <x>-selfcheck.mjs -- what isGate matches and what selfchecks.mjs discovers
//   DRIVEN   verify.mjs resolves an import to it -- read from verify's OWN specifiers, so it is what the ship
//            ritual actually runs rather than what anybody believes it runs
//   SHAPED   the file carries an EXPECTED-VS-MEASURED comparison: `exact:` AND `got` together, which is the
//            rigidSuite/physicsSuite row shape
//
// *** DRIVEN-BUT-NOT-NAMED IS THE ANSWER TO KEITH'S QUESTION AND IT IS EIGHT MODULES: staleness, unboundBuiltin,
// launcherLint, backendParity, physicsSuite, rigidSuite, qa-suite -- and joltLoader.js, WHICH IS NOT A CHECKER
// AT ALL. *** That last one matters: it proves DRIVEN does not mean CHECKS, so the route is reported beside the
// others rather than treated as the answer.
//
// ================================================================================================================
// WHY THE OBVIOUS PROPERTY WAS REJECTED, MEASURED RATHER THAN ARGUED
// ================================================================================================================
//
// My first SHAPED detector matched `tol:` -- 27 unnamed carriers on stripped code (53 on raw text, since the
// first pass did not strip comments) -- including flip2d, multigrid and consistency. *** THOSE ARE SOLVERS. A
// CONVERGENCE TOLERANCE AND A SUITE'S `tol:` IS AN EXPECTED-VALUE TOLERANCE -- TWO THINGS WEARING ONE LABEL,
// this tree's most-repeated shape, committed in my own detector one turn after I named it. ***
//
// The pair separates them cleanly, measured: rigidSuite 8 `exact:` / 10 `got`, physicsSuite 39 / 51, against
// flip2d 0 / 1 and multigrid 0 / 0. A solver has a tolerance and NO EXPECTED VALUE TO COMPARE AGAINST, because
// there is nothing it is supposed to equal.
//
// AND `can exit nonzero` WAS REJECTED THE SAME WAY: it admits applyStaged, androidUpdate and ledger, which exit
// nonzero ON AN ERROR rather than on a FAILED CHECK. EXITING NONZERO IS HOW A TOOL REPORTS TROUBLE, NOT HOW A
// CHECKER REPORTS A WRONG ANSWER.
//
// *** WHAT NONE OF THE THREE CAN DECIDE, SAID PLAINLY: whether a file FAILS WHEN THE THING IT CHECKS BREAKS.
// That is behavioural and only sabotage answers it, one file at a time. This is a CENSUS THAT SORTS BY
// EVIDENCE AND DECIDES NOTHING -- v3548's orphanTriage in a new subject. ***
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { specifiers, resolveSpec } from "./moduleRefs.mjs";
import { noComments, argOf } from "./sourceScan.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const VERIFY = path.join(ENG, "tools", "ship", "verify.mjs");

const rel = (f) => path.relative(ENG, f).split(path.sep).join("/");

export function walkMjs(root = ENG) {
    const out = [];
    const walk = (d) => {
        let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of es) {
            if (e.name === "node_modules" || e.name.startsWith(".")) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p); else if (/\.mjs$/.test(p)) out.push(p);
        }
    };
    walk(root);
    return out;
}

/** ROUTE A -- the naming convention. Exactly what orphanTriage's isGate and selfchecks.mjs both use. */
export const isNamed = (f) => /-selfcheck\.mjs$/.test(f);

/**
 * ROUTE B2 -- WHAT verify.mjs SPAWNS, WHICH IS A WAY OF REACHING A FILE THE REFERENCE GRAPH HAS NO ROUTE FOR.
 *
 * *** moduleRefs.ROUTES IS import / dynamic / script / worker / importScripts -- FIVE WAYS, AND NONE OF THEM IS
 * A CHILD PROCESS. *** So drivenByVerify(), which reads specifiers(), could only ever see what verify IMPORTS.
 * MEASURED at v3726: verify SPAWNS SIX MORE FILES ON EVERY SHIP, all present on disk, every one of them
 * reported as not driven -- the three box3d lockstep selfchecks, blob-policy-selfcheck, claimsGate and
 * pageParse, plus check.mjs and bun-audit through a shell string. DRIVEN read 8 where verify reaches 14.
 *
 * AND THE BLAST RADIUS IS BOUNDED RATHER THAN ASSUMED: measured in the same round, NONE of the six is reported
 * as an orphan today, because each is either `-selfcheck` named or referenced elsewhere. So the missing route
 * costs a WRONG DRIVEN COUNT and not a wrong orphan verdict -- stated because "a route the graph cannot see"
 * invites a bigger claim than the measurement supports.
 *
 * noComments AND NOT codeOnly, for the reason v3680 recorded about worker specifiers: A SPAWNED PATH IS A
 * STRING LITERAL, so blanking string contents would blank the thing being hunted. The argument text is bounded
 * by argOf's matching close paren rather than a fixed window (v3677), and a path is kept ONLY IF IT IS ON DISK,
 * so a spawn of something that does not exist cannot invent a driven file.
 *
 * *** A KNOWN LIMIT, REPORTED BY NAME AND PINNED BY A CHECK RATHER THAN LEFT IN PROSE -- the same treatment
 * sourceScan gives its regex-literal lexer desync. THIS ROUTE READS THE ARGUMENT OF THE SPAWN CALL, so a spawn
 * whose path arrives in a VARIABLE is invisible to it. MEASURED: verify's three box3d lockstep selfchecks are
 * spawned from a `for (const [file, label] of [...])` loop, so `execFileSync(process.execPath, [file], ...)`
 * carries no literal and all three are missed. They ARE named as literals in verify.mjs, one line above the
 * call, and a wider heuristic could reach them -- BUT A SECOND HEURISTIC IS HOW A CENSUS STARTS GUESSING, so
 * the gap is asserted instead. The count is 5 spawned of 8 files verify actually spawns.
 * *** WHEN SOMEBODY WIDENS THIS, THE ASSERTION IN checkerCensus-selfcheck GOES RED AND MUST BE REWRITTEN TO
 * THE NEW COUNT -- do not delete it, because what it guards is that the shortfall is KNOWN rather than absent.
 */
export const SPAWNED_BY_VARIABLE = [
    "physics/box3d-lockstep-selfcheck.mjs",
    "physics/box3d-lockstep-net-selfcheck.mjs",
    "physics/box3d-lockstep-loss-selfcheck.mjs",
];
export const SPAWNERS = /\b(?:execSync|execFileSync|spawnSync|spawn)\s*\(/g;

/**
 * THE PURE FORM, AND IT IS PURE FOR A MEASURED REASON. My first version read the file inside itself, so the
 * "every spawned path is ON DISK" check could only ever re-ask the question the extraction had just answered --
 * A QUESTION WHOSE ANSWER IS STRUCTURALLY GUARANTEED (v3551). *** THE PLANT PROVED IT: deleting the on-disk test
 * left the gate FULLY GREEN, because verify happens to name only real files, so nothing could tell a guard that
 * was working from a guard that was gone. *** Taking `src` as an argument lets the gate drive a FIXTURE that
 * spawns a file which does not exist, which is the only way that guard can be shown failing.
 * A FUNCTION THAT TAKES ITS INPUT IS TESTABLE; ONE THAT READS A CLOSURE IS NOT.
 */
export function spawnedIn(src, root) {
    const text = noComments(src || "");
    const out = new Set();
    let m; SPAWNERS.lastIndex = 0;
    while ((m = SPAWNERS.exec(text))) {
        const arg = argOf(text, m.index + m[0].length);
        for (const t of arg.matchAll(/[A-Za-z][\w./-]*\.(?:mjs|js)/g)) {
            const r = t[0];
            try { if (fs.statSync(path.join(root, r)).isFile()) out.add(r); } catch { /* not a tree file */ }
        }
    }
    return out;
}

export function spawnedByVerify() {
    return spawnedIn(fs.readFileSync(VERIFY, "utf8"), ENG);
}

/** ROUTE B -- what verify.mjs RESOLVES an import to. Read from verify's own text, never from a list. */
export function drivenByVerify() {
    const src = fs.readFileSync(VERIFY, "utf8");
    const out = new Set();
    for (const { spec } of specifiers(src)) {
        const hit = resolveSpec(VERIFY, spec, ENG);
        if (hit) out.add(rel(hit));
    }
    return out;
}

/**
 * ROUTE C -- an EXPECTED-VS-MEASURED comparison, which is what distinguishes a check from a computation.
 *
 * *** `tol:` ALONE IS NOT IT AND THAT WAS MEASURED, NOT ASSUMED: a SOLVER'S tolerance is a convergence
 * criterion and a SUITE'S is an expected-value window. Requiring an `exact:` BESIDE it demands that the file
 * name what the answer is supposed to BE -- which a solver has no way to state, because there is nothing it is
 * supposed to equal. *** Counts rather than presence, so a single word in a string cannot qualify a file.
 */
export const SHAPE_MIN = 2;
export function shapeCounts(src) {
    const code = noComments(src);
    const n = (re) => (code.match(re) || []).length;
    return { exact: n(/\bexact\s*:/g), got: n(/\bgot\b/g), tol: n(/\btol\s*:/g) };
}
export const isShaped = (src) => {
    const c = shapeCounts(src);
    return c.exact >= SHAPE_MIN && c.got >= SHAPE_MIN;
};

/**
 * *** THIS FILE EXCLUDES ITSELF, BECAUSE IT COUNTED ITSELF ON THE FIRST RUN. *** Explaining the SHAPED
 * property requires writing `exact:` and `got`, so checkerCensus.mjs promptly qualified as a checker. FIFTH
 * COLLECTION of the defect landing on the file studying it -- v3449's gate rescued a module with its own
 * header, moduleRefs (built to DETECT prose-rescue) was itself prose-rescued, v3560's shaderRefs rescued four
 * shaders and then counted its own gate's prose. CLOSED BY IDENTITY so a rename cannot silently re-open it.
 */
export function selfExclusions() {
    const me = fileURLToPath(import.meta.url);
    return [me, me.replace(/\.mjs$/, "-selfcheck.mjs")].map((f) => path.relative(ENG, f).split(path.sep).join("/"));
}

/** The census. Every .mjs sorted by which of the three routes reach it. */
/**
 * ROUTE D -- WHAT THE SHIP RITUAL ACTUALLY EXECUTES, TRANSITIVELY.
 *
 * DRIVEN answers "does verify reach this file directly". THIS ANSWERS THE QUESTION UNDERNEATH IT: walk the
 * closure from verify.mjs over BOTH routes -- imports and spawns -- and ask how many of the tree's NAMED gates
 * fall inside it. *** MEASURED AT v3727: ONE. `brain/blob-policy-selfcheck.mjs`, plus the three lockstep
 * selfchecks that this file's own SPAWNED_BY_VARIABLE limit cannot see, so FOUR OF 993. ***
 *
 * *** AND THE NUMBER IS NOT A VERDICT, WHICH IS THE WHOLE REASON IT IS SAFE TO PRINT. gateSelection.mjs already
 * says it in the right words: "this decides what to RUN. It is not a claim that unrun gates pass. NOT RUN IS A
 * THIRD STATE BESIDE PASS AND FAIL, and collapsing it into 'fine' is the same error the boot sidecar refuses to
 * make about a missing report." The other 981 are run by gates.html on demand, by a full suite run (~26 minutes,
 * last done at v3211), or by whoever remembers. THIS ROUTE MEASURES THE RITUAL, NOT THE TREE'S HEALTH. ***
 *
 * ALSO NOT COUNTED HERE, DELIBERATELY: the three SUITES verify drives (physicsSuite, rigidSuite, qa-suite) carry
 * their own expected-vs-measured rows -- that is what ROUTE C is for -- and they are NOT runners of the named
 * gates. Folding their internal rows into this count would be the count-absorbing-a-different-kind mistake.
 */
export function shipReach(root = ENG) {
    const relTo = (p) => String(p).replace(/\\/g, "/").replace(root.replace(/\\/g, "/") + "/", "");
    const read = (r) => { try { return fs.readFileSync(path.join(root, r), "utf8"); } catch { return ""; } };
    const seen = new Set(), queue = ["tools/ship/verify.mjs"];
    while (queue.length) {
        const cur = queue.pop();
        if (seen.has(cur)) continue;
        seen.add(cur);
        const src = read(cur), abs = path.join(root, cur);
        for (const { spec } of specifiers(src)) {
            const hit = resolveSpec(abs, spec, root);
            if (hit) queue.push(relTo(hit));
        }
        for (const r of spawnedIn(src, root)) queue.push(r);
    }
    return seen;
}

/**
 * *** THE BY-HAND SET, DECLARED AS DATA FOR THE FIRST TIME. It has lived in a chat note and in prose and
 * NOWHERE THAT ANYTHING COULD READ, which is the same defect this file was built to find one register over --
 * and it is how plantedCoverage-selfcheck sat red through a shipped build while the set was reported green.
 *
 * EVERY MEMBER NAMES THE *-selfcheck AND NOT THE TOOL. v3726 measured why that matters:
 * deviceInstrumentMap.mjs EXITS 0 while deviceInstrumentMap-selfcheck.mjs EXITS 1 on the same tree -- the tool
 * REPORTS an unexplained device and the GATE FAILS on it. TWO THINGS WEARING ONE LABEL, inside the list itself.
 *
 * WHEN A MEMBER BECOMES REACHABLE FROM verify, the check below goes RED: REMOVE IT FROM THIS LIST AND NAME WHO
 * WIRED IT. Do not weaken the check -- the property worth guarding is that this list means "verify does not run
 * this", so an entry verify now runs is a lie about the ritual rather than an extra safety margin. ***
 */
export const BY_HAND = [
    "tools/pageReach.mjs",
    "tools/ship/gateQuality-selfcheck.mjs",
    "tools/ship/pageSections-selfcheck.mjs",
    "tools/ship/deviceInstrumentMap-selfcheck.mjs",
    "tools/ship/graveyard-selfcheck.mjs",
    "tools/ship/orphanTriage-selfcheck.mjs",
    "tools/ship/launchIndex-selfcheck.mjs",
    "tools/ship/deadImportScan-selfcheck.mjs",
    // *** v3751 -- THE THREE SHIP-TIME TOOLS ADDED AT v3742-v3745. THE INSTRUCTION TO RUN THEM EVERY ROUND HAD
    // LIVED ONLY IN THE HANDOFF NOTES, WHICH IS THIS TREE'S OWN NAMED FAILURE: A LIST THAT LIVES ONLY IN PROSE
    // IS ONE NOTHING CAN READ. The by-hand set was made DATA at v3727 for exactly this reason -- and then three
    // rounds of new every-round tools were added WITHOUT joining it, so a reader of the tree (rather than of my
    // notes) had no way to learn they exist. THEY ARE THE SAME KIND AS THE EIGHT ABOVE: verify does not drive
    // them, and each one has caught something in the rounds since it was built. ***
    "tools/ship/claimCheck-selfcheck.mjs",
    "tools/ship/frozenReferee-selfcheck.mjs",
    "tools/ship/loopTrace-selfcheck.mjs",
];

export function census(root = ENG) {
    const imported = drivenByVerify();
    const spawned = spawnedByVerify();
    // *** THE UNION IS REPORTED WITH BOTH HALVES NAMED. Collapsing them into one number would lose exactly what
    // this round found: that one of the two ways verify reaches a file was invisible for 159 versions. ***
    const driven = new Set([...imported, ...spawned]);
    const self = new Set(selfExclusions());
    const rows = [];
    for (const f of walkMjs(root)) {
        const r = rel(f);
        const src = fs.readFileSync(f, "utf8");
        const named = isNamed(f), drv = driven.has(r), shaped = isShaped(src);
        if (self.has(r)) continue;
        if (named || drv || shaped) rows.push({ file: r, named, driven: drv, shaped, counts: shapeCounts(src) });
    }
    rows.sort((a, b) => a.file.localeCompare(b.file));
    const pick = (fn) => rows.filter(fn).map((x) => x.file);
    // *** DRIVEN IS REPORTED IN FULL, NOT FILTERED TO THE WALK. *** The walk takes .mjs because that is the
    // convention NAMED and SHAPED live in -- and verify also drives physics/jolt/joltLoader.js, a .js. Counting
    // only what the corpus happens to contain would have hidden the very file that proves DRIVEN is not CHECKS.
    const drivenAll = [...driven].sort();

    // ROUTE D, folded in. NAMED gates the ship ritual actually EXECUTES, against the ones it does not.
    const reach = shipReach(root);
    const namedAll = pick((x) => x.named);
    const namedRunByVerify = namedAll.filter((f) => reach.has(f));
    const namedByHand = namedAll.filter((f) => BY_HAND.includes(f));
    const namedRitual = new Set([...namedRunByVerify, ...namedByHand]);
    return {
        shipReachSize: reach.size,
        namedTotal: namedAll.length,
        namedRunByVerify,
        namedByHand,
        namedNotInRitual: namedAll.length - namedRitual.size,
        byHandUnreachable: BY_HAND.filter((f) => !reach.has(f)),
        // *** ONE OF THE EIGHT IS NOT NAME-MATCHED, WHICH IS THIS FILE'S FOUNDING FINDING ARRIVING IN ITS OWN
        // BY-HAND LIST: tools/pageReach.mjs is a real gate that carries no `-selfcheck` in its name, so the
        // RITUAL count above reads 7 by hand and not 8. REPORTED RATHER THAN ROUNDED UP -- a count that quietly
        // absorbed it would be claiming isGate saw something it cannot see. ***
        byHandNotNamed: BY_HAND.filter((f) => !isNamed(f)),
        byHandMissing: BY_HAND.filter((f) => { try { return !fs.statSync(path.join(root, f)).isFile(); } catch { return true; } }),
        rows,
        drivenAll,
        drivenImported: [...imported].sort(),
        drivenSpawned: [...spawned].sort(),
        spawnedNotImported: [...spawned].filter((f) => !imported.has(f)).sort(),
        drivenOutsideCorpus: drivenAll.filter((f) => !/\.mjs$/.test(f)),
        named: pick((x) => x.named).length,
        driven: pick((x) => x.driven).length,
        shaped: pick((x) => x.shaped).length,
        drivenNotNamed: pick((x) => x.driven && !x.named),
        shapedNotNamed: pick((x) => x.shaped && !x.named),
        shapedNotNamedNotDriven: pick((x) => x.shaped && !x.named && !x.driven),
    };
}

export const MEASURED_V3566 = {
    theQuestion: "Keith asked whether physics/voxel/fracture.js really had no gate. IT HAS A VERY GOOD ONE -- " +
        "tools/ship/rigidSuite.mjs, which verify.mjs RUNS ON EVERY SHIP. I missed it because I grepped " +
        "--include=*-selfcheck.mjs and rigidSuite IS A SUITE. THE FILENAME CONVENTION HID IT.",
    notJustMine: "orphanTriage's isGate is literally /-selfcheck\\.mjs$/, so rigidSuite counts as a NON-GATE " +
        "across the whole orphan census. Every 'does X have a gate?' question in this project is asking about " +
        "a filename.",
    tolIsTwoThings:
        "*** MY FIRST SHAPED DETECTOR MATCHED `tol:` AND READ 27 UNNAMED CARRIERS ON STRIPPED CODE (53 on raw " +
        "text, since the first pass did not strip comments), INCLUDING flip2d, multigrid AND consistency.mjs -- " +
        "WHICH ARE SOLVERS. A solver's `tol:` is a CONVERGENCE tolerance; a suite's is an " +
        "EXPECTED-VALUE window. TWO THINGS WEARING ONE LABEL, in my own detector, one turn after naming that " +
        "shape. *** Requiring `exact:` beside it separates them: rigidSuite 8/10 and physicsSuite 39/51 " +
        "against flip2d 0/1 and multigrid 0/0.",
    exitCodeRejected:
        "`can exit nonzero` was rejected the same way -- it admits applyStaged, androidUpdate and ledger, which " +
        "exit nonzero ON AN ERROR rather than on a FAILED CHECK. EXITING NONZERO IS HOW A TOOL REPORTS TROUBLE, " +
        "NOT HOW A CHECKER REPORTS A WRONG ANSWER.",
    drivenIsNotChecks:
        "joltLoader.js is DRIVEN by verify and is not a checker at all. That is why DRIVEN is reported beside " +
        "the other routes instead of being treated as the answer.",
    whatNoneDecide:
        "*** WHETHER A FILE FAILS WHEN THE THING IT CHECKS BREAKS. That is behavioural and only sabotage " +
        "answers it, one file at a time. THIS SORTS BY EVIDENCE AND DECIDES NOTHING -- v3548's orphanTriage in " +
        "a new subject. ***",
};

// ---- FRONT DOOR -------------------------------------------------------------------------------------------------
export function reportLines() {
    const L = [];
    const c = census();
    L.push("[checkerCensus] Which files actually check something? -- asked four ways, because the filename is");
    L.push("                only one of them");
    L.push("");
    L.push("  NAMED  <x>-selfcheck.mjs .................... " + c.named + "   (what isGate matches)");
    L.push("  DRIVEN verify.mjs reaches it ................. " + c.drivenAll.length + "   (what the ship ritual RUNS)");
    L.push("         ...by IMPORT ........................... " + c.drivenImported.length);
    L.push("         ...by SPAWN (v3726) .................... " + c.drivenSpawned.length +
        "   -- a route moduleRefs.ROUTES has no entry for");
    L.push("  SHAPED carries `exact:` AND `got` ........... " + c.shaped + "   (an expected-vs-measured row)");
    L.push("         (" + c.byHandNotNamed.length + " of the by-hand set is NOT name-matched: " +
        c.byHandNotNamed.join(", ") + " -- a real gate isGate cannot see)");
    L.push("  RITUAL of the " + c.namedTotal + " NAMED gates, the ship ritual runs " +
        (c.namedRunByVerify.length + c.namedByHand.length) + "   (" + c.namedRunByVerify.length +
        " reached from verify + " + c.namedByHand.length + " by hand)");
    L.push("         the other " + c.namedNotInRitual + " run on demand -- gates.html, a full suite run, or " +
        "whoever remembers. NOT RUN IS A THIRD STATE BESIDE PASS AND FAIL AND THIS DECIDES NOTHING.");
    L.push("");
    const dnn = c.drivenAll.filter((f) => !/-selfcheck\.mjs$/.test(f));
    L.push("  *** DRIVEN EVERY SHIP AND INVISIBLE TO A NAME-BASED isGate (" + dnn.length + "): ***");
    for (const f of dnn) L.push("    " + f + (/\.mjs$/.test(f) ? "" : "   <- NOT EVEN .mjs, and NOT A CHECKER"));
    L.push("    " + MEASURED_V3566.drivenIsNotChecks);
    L.push("");
    L.push("  SHAPED BUT NOT NAMED (" + c.shapedNotNamed.length + "):");
    for (const f of c.shapedNotNamed) L.push("    " + f);
    L.push("");
    L.push("  ...of which NOBODY RUNS from verify (" + c.shapedNotNamedNotDriven.length + "):");
    for (const f of c.shapedNotNamedNotDriven) L.push("    " + f);
    L.push("");
    L.push("  " + MEASURED_V3566.tolIsTwoThings.replace(/\*\*\*/g, "").replace(/\s+/g, " "));
    L.push("");
    L.push("  " + MEASURED_V3566.whatNoneDecide.replace(/\*\*\*/g, "").replace(/\s+/g, " "));
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
