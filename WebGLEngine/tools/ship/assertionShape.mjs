// tools/ship/assertionShape.mjs -- v4480
//
// *** THE TREE'S MOST-USED ASSERTION HAS 1,489 INDEPENDENT COPIES, 38 DISTINCT DEFINITIONS, TWO INCOMPATIBLE
// SIGNATURES AND NO OWNER. *** 1,497 of 1,518 gates call `ok(...)`. 1,489 of them DEFINE it, in their own file,
// a few lines from the top. ZERO import one. So when v4479 said its repair -- a signature that refuses a
// function -- "belongs to whichever round owns the helper", that sentence had no referent. Nothing owns it,
// and a defect in it cannot be fixed once.
//
// ---- *** WHY THAT MATTERS, AND IT IS NOT TIDINESS *** --------------------------------------------------------
//
// `ok(name, condition)` takes ANY value in the condition slot. A function is a value. A promise is a value. A
// non-empty string is a value, and every one of them is truthy, so a check written in any of those shapes
// prints PASS with the code under it completely broken. This session wrote it THREE TIMES in three rounds --
// `ok(name, async () => true)` at v4478, and at v4479 both `ok(name, (() => true)())` and
// `ok(name, async () => {...}())`, the last handing `ok` a promise. All three were caught by reading, not by
// running, which is the part worth being uncomfortable about: nothing in a tree of fifteen hundred gates
// would have said a word.
//
// And the two signatures make a fourth shape possible. 1,439 gates spell it `ok(name, cond, detail)`; 78
// spell it `ok(cond, message)`, condition FIRST. A line pasted from a majority gate into one of those 78
// reads `ok("some message", cond)` -- and the message is a non-empty string, so it ALWAYS PASSES.
// (16 more gates spell it in a shape this classifier will not guess at, and are reported `unknown`
// rather than folded into either camp -- a census that resolves its own ambiguity by picking is
// a census with a thumb on it.)
//
// ---- *** WHAT THE SWEEP FOUND TODAY, WHICH IS NOTHING, AND WHY THAT IS REPORTED RATHER THAN BURIED *** -------
//
//     gates                                              1518
//     calling ok()                                       1497
//     defining their own ok()                            1489   (importing one: 0)
//     distinct definitions                                 38
//     condition-first signatures                           78
//     call sites with a function in the condition slot       0
//     call sites with an un-awaited async IIFE               0
//     condition-first calls passing a string first           0
//
// Every hazard this file describes is currently un-fired. That is a real result and it is the reason the
// positive controls in the gate are not optional: a detector that has only ever returned zero is
// indistinguishable from a detector that cannot return anything else, and this tree has caught that shape five
// times this session alone. Each of the three finders is therefore driven against a fixture built to trip it,
// and the zero above means something only because of that.
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That it finds every way a non-boolean reaches the condition slot. It reads SOURCE TEXT and finds three
// shapes it can name: an arrow that is never invoked, an async IIFE that is never awaited, and a string
// literal where a condition-first signature expects the condition. `ok(name, someHelper())` returning a
// promise from a named function is INVISIBLE to it, and so is anything computed into a variable first. The
// three it finds are the three this session actually wrote, which is a reason to trust the shapes and not the
// coverage.
//
// That consolidating the 1,489 copies is proposed here. It is not: rewriting the assertion in every gate in
// the tree is a change to fifteen hundred files whose only test is the gates themselves, and the census is
// what an argument for doing it would have to start from. This round measures and detects; it does not
// consolidate, and the number is left on the page for the round that wants to.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";

import * as TR from "./treeRead.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// (the old walker's SKIP set retired with it at v4548 -- see gateFiles below)

/** Every gate in the tree, by the same rule gateSweep uses: `-selfcheck.mjs`, and never a `__` fixture. */
// v4548 -- filtered out of tools/ship/treeRead.mjs's single cached walk instead of walking again. VERIFIED
// BEFORE SWITCHING, not assumed: the old walker's 1,602 gates and the filtered tree's 1,602 are the same set
// AND THE SAME ORDER, zero either way -- which matters because recordDrift-selfcheck picks gateFiles()[0] as
// its sample gate, so a reordering would have silently changed what that fixture tests. treeRead-selfcheck
// keeps asserting it. The old rule skipped .git and dot-directories and did NOT skip dist/; the new one is
// the other way round, and the two agree because no gate lives in either place.
export function gateFiles(root = ENG) {
    return TR.treePaths(root).filter((p) => {
        const n = p.split(/[\\/]/).pop();
        return n.endsWith("-selfcheck.mjs") && !n.startsWith("__");
    });
}

export const SIG = Object.freeze({ nameFirst: "nameFirst", condFirst: "condFirst", unknown: "unknown", none: "none" });

/**
 * How one file spells `ok`. The classification reads the BODY rather than the parameter names, because a
 * parameter called `c` proves nothing -- what settles it is whether the first parameter is the one branched on.
 */
export function signatureOf(src) {
    const m = src.match(/^[ \t]*(?:const|let)\s+ok\s*=\s*(?:async\s*)?\(\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)/m);
    if (!m) return /^import\s*\{[^}]*\bok\b[^}]*\}\s*from/m.test(src) ? SIG.unknown
         : /\bok\s*\(/.test(src) ? SIG.unknown : SIG.none;
    const body = src.slice(src.indexOf(m[0]), src.indexOf(m[0]) + 300);
    const firstIsCond = new RegExp(`(if\\s*\\(\\s*!?${m[1]}\\b)|(\\b${m[1]}\\s*\\?)`).test(body);
    const secondIsCond = new RegExp(`(if\\s*\\(\\s*!?${m[2]}\\b)|(\\b${m[2]}\\s*\\?)`).test(body);
    return firstIsCond ? SIG.condFirst : secondIsCond ? SIG.nameFirst : SIG.unknown;
}

const stripComments = (s) => s
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** The three shapes, each named. A finder that cannot say WHICH shape it found is a finder nobody can act on. */
export const SHAPE = Object.freeze({
    arrowNotInvoked: "arrowNotInvoked",     // ok(msg, () => ...)          -- a function object, always truthy
    asyncIife: "asyncIife",                 // ok(msg, async () => {...}()) -- a promise, always truthy
    stringAsCondition: "stringAsCondition", // ok("msg", cond) under condFirst -- a string, always truthy
});

/**
 * Call sites where a non-boolean provably reaches the condition slot. `src` is passed in rather than read, so
 * the gate can hand this a fixture -- the whole point, given the tree's own answer today is zero.
 */
export function suspectCalls(src, signature = SIG.nameFirst) {
    const code = stripComments(src);
    const found = [];
    if (signature === SIG.condFirst) {
        const re = /\bok\(\s*(["'`])(?:[^\\]|\\.)*?\1\s*,/g;
        let m;
        while ((m = re.exec(code))) found.push({ shape: SHAPE.stringAsCondition, at: m.index, text: m[0].replace(/\s+/g, " ") });
        return found;
    }
    // *** WHETHER THE ARROW IS INVOKED IS DECIDED BY BALANCING, NOT BY A REGEX GUESS. *** The first version
    // tested the tail against two hopeful patterns and got `}()` wrong -- it read an async IIFE as an
    // un-invoked arrow, which is the right verdict for the wrong reason and would have been the wrong verdict
    // the moment the body changed shape. The record check in the gate caught it: a probe for `asyncIife` came
    // back classified `arrowNotInvoked`. Walking the body is a few more lines and cannot be fooled by layout.
    const re = /\bok\(\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\s*,\s*(await\s+)?(async\s+)?\(\s*\)\s*=>/g;
    let m;
    while ((m = re.exec(code))) {
        const isAwait = !!m[1], isAsync = !!m[2];
        let i = re.lastIndex;
        while (i < code.length && /\s/.test(code[i])) i++;
        if (code[i] === "{") {                       // block body: balance the braces
            let depth = 0;
            for (; i < code.length; i++) {
                if (code[i] === "{") depth++;
                else if (code[i] === "}") { depth--; if (depth === 0) { i++; break; } }
            }
        } else {                                     // expression body: balance to the arg's comma or ok's close
            let depth = 0;
            for (; i < code.length; i++) {
                if ("([".includes(code[i])) depth++;
                else if (")]".includes(code[i])) { if (depth === 0) break; depth--; }
                else if (code[i] === "," && depth === 0) break;
            }
        }
        while (i < code.length && /\s/.test(code[i])) i++;
        const invoked = code[i] === "(";
        if (!invoked) found.push({ shape: SHAPE.arrowNotInvoked, at: m.index, text: m[0].replace(/\s+/g, " ") });
        else if (isAsync && !isAwait) found.push({ shape: SHAPE.asyncIife, at: m.index, text: m[0].replace(/\s+/g, " ") });
    }
    return found;
}

/** The tree-wide census. Members where it matters, counts where the members are the whole tree. */
export function census({ root = ENG, files = null } = {}) {
    const gates = files || gateFiles(root);
    const bySig = { [SIG.nameFirst]: 0, [SIG.condFirst]: 0, [SIG.unknown]: 0, [SIG.none]: 0 };
    const definitions = new Map();
    const suspects = [];
    let usesOk = 0, definesOk = 0, importsOk = 0;
    for (const g of gates) {
        const src = TR.textOf(g);   // v4548: out of the shared memo, not a fourth read of the same file
        if (/\bok\s*\(/.test(src)) usesOk++;
        const def = src.match(/^[ \t]*(?:const|let|function)\s+ok\b[^\n]*/m);
        if (def) { definesOk++; const k = def[0].trim().replace(/\s+/g, " "); definitions.set(k, (definitions.get(k) || 0) + 1); }
        else if (/^import\s*\{[^}]*\bok\b[^}]*\}\s*from/m.test(src)) importsOk++;
        const sig = signatureOf(src);
        bySig[sig] = (bySig[sig] || 0) + 1;
        for (const s of suspectCalls(src, sig)) suspects.push({ file: path.relative(root, g), ...s });
    }
    return {
        gates: gates.length, usesOk, definesOk, importsOk,
        distinctDefinitions: definitions.size,
        bySignature: bySig,
        suspects,
        byShape: Object.fromEntries(Object.values(SHAPE).map((s) => [s, suspects.filter((x) => x.shape === s).length])),
    };
}

export function reportLines() {
    const c = census();
    const L = [];
    L.push("the assertion helper -- who defines it, how, and whether anything non-boolean reaches its condition");
    L.push(`  gates ${c.gates}; calling ok() ${c.usesOk}; DEFINING their own ${c.definesOk}; importing one ${c.importsOk}`);
    L.push(`  ${c.distinctDefinitions} distinct definitions; signatures: ` +
           Object.entries(c.bySignature).map(([k, v]) => `${k} ${v}`).join(", "));
    L.push("  non-boolean conditions found: " + (c.suspects.length
        ? c.suspects.map((s) => s.file + " (" + s.shape + ")").join("; ")
        : "none -- and the gate's positive controls are what make that a result"));
    return L;
}

export const SHAPE_AT_V4480 = Object.freeze({
    // Counted WITH this round's own gate in the population, because it is one: 1518 -> 1519 gates, and the
    // helper it defines is the 1,490th copy. A census that excused its own instrument would be measuring a
    // tree that does not exist.
    // v4526 MERGE -- RE-TAKEN on the merged tree: this branch's sixty-five gates joined the population (1525 -> 1590) and
    // five rows moved with them; distinctDefinitions, unknownSignature and suspects did not, which is the discriminating shape.
    // v4527 -- RE-TAKEN: one gate (raceKnob) joined, and exactly the four rows a gate that uses ok(name, cond) moves, moved by one.
    // v4528 -- RE-TAKEN: one gate (raceReplayBake) joined, and the same four rows moved by one again.
    // v4529 -- RE-TAKEN: one gate (ribbonRoad) joined, the same four rows by one.
    // v4530 -- RE-TAKEN: one gate (crashDamage) joined, the same four rows by one.
    // v4536 -- RE-TAKEN: one gate (uvUnwrap) joined, and the same four rows moved by one. Fifth round running
    // in which a single new gate moves gates/usesOk/definesOk/nameFirst by exactly one and moves nothing else,
    // which is what makes the other five rows worth keeping: they are the ones that would say a gate arrived
    // with a DIFFERENT shape, and they have now stayed still across six arrivals.
    // v4537 -- RE-TAKEN: one gate (uvLscm) joined, the same four rows by one, seventh arrival running.
    // v4539 -- RE-TAKEN: one gate (splitSum) joined, the same four rows by one, eighth arrival running.
    // v4543 -- RE-TAKEN: one gate (navmesh) joined, the same four rows by one, NINTH arrival running. The
    // five rows that have now stayed still across nine consecutive arrivals are the ones carrying the
    // information: distinctDefinitions, condFirst, unknownSignature, importsOk and suspects would each move
    // if a gate turned up written in a different shape, and none of them has.
    // v4544 -- RE-TAKEN: one gate (terrainWalk) joined, the same four rows by one, TENTH arrival running.
    // v4545 -- RE-TAKEN: one gate (navWiring) joined, the same four rows by one, ELEVENTH arrival running.
    // v4546 -- RE-TAKEN: one gate (navWiringLive) joined, the same four rows by one, TWELFTH arrival running.
    // v4547 -- RE-TAKEN: one gate (engineSceneBot) joined, the same four rows by one, THIRTEENTH arrival
    // running -- and this one is the arrival most likely to have moved the OTHER five, because it is the
    // first gate in the tree that boots index.html and reads its assertions out of a page rather than out of
    // a fixture. It did not: it is written in the same shape as the other 1,473.
    // v4548 -- RE-TAKEN: TWO gates (treeRead, recordReach) joined, the same four rows by TWO, FOURTEENTH
    // arrival. The round's third new file is tools/ship/recordReach.mjs, a module rather than a gate, and it
    // moves none of these -- which is the distinction these nine rows exist to make.
    // v4550 -- RE-TAKEN: one gate (glbConformance) joined, the same four rows by one, FIFTEENTH arrival.
    // v4551 -- RE-TAKEN, AND FIVE ARRIVALS LATE. *** THE RECORD WAS RED FOR FIVE CONSECUTIVE ROUNDS AND
    // NOTHING RAN IT. *** The FSR arc (fsr, motionVectors, jitter, temporalAccumulate, temporalResolve) added
    // one gate per round; each round ran gateSweep, instruments and sweepCoverage and called that the ritual,
    // and this record is not in that set. So the drift did not announce itself once -- it accumulated to
    // gates 1605 -> 1610 and was found only because v4551 went looking. That is the SAME fault v4548 recorded
    // under the title "the ship ritual does not check half its own records"; finding it once did not stop it
    // recurring, because the repair there was to re-take the records and not to make the ritual reach them.
    // The four rows moved by FIVE, one per arrival, and the other five rows did not move at all -- across five
    // gates in five different subsystems (a CPU upscaler, a matrix reprojection, a Halton sequence, a history
    // blend, a resampling kernel), TWENTIETH arrival running with no gate written in a different shape.
    // v4552 -- RE-TAKEN: one gate (temporalReject) joined, the same four rows by one, TWENTY-FIRST arrival --
    // and the first re-taken because a CHECK SAID SO rather than because a round went looking. v4551 added the
    // sixth row to recordDrift's pre-flight after this record drifted five rounds unnoticed; this round ran it
    // before the verify and it named all four obligations at once. The other five rows have still never moved.
    // v4553 -- RE-TAKEN: one gate (temporalLock) joined, the same four rows by one, TWENTY-SECOND arrival,
    // and the second round running that the pre-flight prompted rather than a search. The other five rows have
    // still never moved.
    // v4554 -- RE-TAKEN: one gate (temporalDepthLock) joined, the same four rows by one, TWENTY-THIRD
    // arrival, third round running that the pre-flight prompted. The other five rows have still never moved.
    // v4555 -- RE-TAKEN: one gate (temporalCoherentLock) joined, the same four rows by one, TWENTY-FOURTH
    // arrival, fourth round running that the pre-flight prompted. The other five rows have still never moved.
    // v4556 -- RE-TAKEN: one gate (temporalRidgePhase) joined, the same four rows by one, TWENTY-FIFTH
    // arrival, fifth round running that the pre-flight prompted. The other five rows have still never moved.
    // v4557 -- RE-TAKEN: one gate (temporalRidgeMargin) joined, the same four rows by one, TWENTY-SIXTH
    // arrival, sixth round running that the pre-flight prompted. The other five rows have still never moved.
    // v4558 -- RE-TAKEN: one gate (temporalRingFloor) joined, the same four rows by one, TWENTY-SEVENTH
    // arrival, seventh round running that the pre-flight prompted. The other five rows have still never moved.
    // v4559 -- RE-TAKEN: one gate (temporalRingContent) joined, the same four rows by one, TWENTY-EIGHTH
    // arrival, eighth round running that the pre-flight prompted. The other five rows have still never moved.
    // v4560 -- RE-TAKEN: one gate (ringFloor) joined, the same four rows by one, TWENTY-NINTH arrival, ninth
    // round running that the pre-flight prompted. The other five rows have still never moved.
    // v4561 -- RE-TAKEN: one gate (ringFloorCost) joined, the same four rows by one, THIRTIETH arrival, tenth
    // round running that the pre-flight prompted. The other five rows have still never moved.
    // v4562 -- RE-TAKEN: one gate (ringFloorPerspective) joined, the same four rows by one, THIRTY-FIRST
    // arrival, eleventh round running that the pre-flight prompted. The other five rows have never moved.
    // v4563 -- RE-TAKEN: one gate (ringFloorMargin) joined, the same four rows by one, THIRTY-SECOND
    // arrival, twelfth round running that the pre-flight prompted. The other five rows have never moved.
    // v4564 -- RE-TAKEN: one gate (ringFloorControl) joined, the same four rows by one, THIRTY-THIRD
    // arrival, thirteenth round running that the pre-flight prompted. The other five rows have never moved.
    // v4565 -- RE-TAKEN: one gate (ringFloorStep) joined, the same four rows by one, THIRTY-FOURTH arrival,
    // fourteenth round running that the pre-flight prompted. The other five rows have never moved.
    // v4566 -- RE-TAKEN: one gate (ringFloorLight) joined, the same four rows by one, THIRTY-FIFTH arrival,
    // fifteenth round running that the pre-flight prompted. The other five rows have never moved.
    // v4567 -- RE-TAKEN: one gate (ringFloorYaw) joined, the same four rows by one, THIRTY-SIXTH arrival,
    // sixteenth round running that the pre-flight prompted. The other five rows have never moved.
    // v4568 -- RE-TAKEN: one gate (ringFloorStat) joined, the same four rows by one, THIRTY-SEVENTH arrival,
    // seventeenth round running that the pre-flight prompted. The other five rows have never moved.
    // v4569 -- RE-TAKEN: one gate (ringFloorDevice) joined, the same four rows by one, THIRTY-EIGHTH arrival,
    // eighteenth round running that the pre-flight prompted. The other five rows have never moved.
    // v4570 -- RE-TAKEN: one gate (kernelAudit) joined, the same four rows by one, THIRTY-NINTH arrival,
    // nineteenth round running that the pre-flight prompted. The other five rows have never moved.
    // v4580 -- RE-TAKEN: one gate (timingProvenance) joined, the same four rows by one, FORTIETH arrival,
    // twentieth round running that the pre-flight prompted. The other five rows have never moved.
    // v4581 -- RE-TAKEN: one gate (budgetProvenance) joined, the same four rows by one, FORTY-FIRST arrival,
    // twenty-first round running that the pre-flight prompted. The other five rows have never moved.
    // v4582 -- RE-TAKEN: one gate (skipReading) joined, the same four rows by one, FORTY-SECOND arrival,
    // twenty-second round running that the pre-flight prompted. The other five rows have never moved.
    // v4583 -- RE-TAKEN: one gate (runnerReach) joined, the same four rows by one, FORTY-THIRD arrival,
    // twenty-third round running that the pre-flight prompted. The other five rows have never moved.
    // v4584 -- RE-TAKEN: one gate (walkerParity) joined, the same four rows by one, FORTY-FOURTH arrival,
    // twenty-fourth round running that the pre-flight prompted. The other five rows have never moved.
    // v4585 -- RE-TAKEN: one gate (redAction) joined, the same four rows by one, FORTY-FIFTH arrival,
    // twenty-fifth round running that the pre-flight prompted. The other five rows have never moved.
    // v4588 -- RE-TAKEN: one gate (fsrGPU) joined, and FIVE rows moved rather than four, because nameFirst is
    // the fifth. *** THE PRE-FLIGHT PROMPTED THREE OF THEM AND THE GATE FOUND THE FOURTH. *** recordDrift's
    // assertionShape row compares `gates` and `definesOk` and reports "1644 vs 1644, copies 1615 vs 1615"; this
    // file's own gate compares ALL NINE and went red with "DRIFTED: nameFirst 1515 -> 1516". The label on that
    // row already says "not the four this compared", so the narrowness is recorded rather than discovered -- but
    // it is the same shape v4587 found in the knowledge-index check one round earlier: a cheap pre-view that
    // answers a smaller question than the gate it previews, read as though it answered the same one.
    // v4589 -- RE-TAKEN: one gate (kernelReach) joined, the same five rows by one, and the pre-flight named three
    // while the gate names all nine, the same split recorded a round ago.
    // v4590 -- RE-TAKEN: one gate (temporalGPU) joined, the same five rows by one.
    // v4592 -- RE-TAKEN: one gate (motionVectorsGPU) joined, the same five rows by one again.
    // v4593 -- RE-TAKEN: one gate (temporalRejectGPU) joined. Five rounds running, five rows by one each time.
    // v4552 -- RE-TAKEN: one gate (detourScale) joined, the same four rows by one, SIXTEENTH arrival.
    // v4554 -- RE-TAKEN: one gate (surfaceProbe) joined, the same four rows by one, SEVENTEENTH arrival.
    // v4555 -- RE-TAKEN: one gate (chunk) joined, the same four rows by one, EIGHTEENTH arrival.
    // v4556 -- RE-TAKEN: one gate (versionMarker) joined, the same four rows by one, NINETEENTH arrival.
    // v4557 -- RE-TAKEN: one gate (ritualCoherence) joined, the same four rows by one, TWENTIETH arrival.
    // v4559 -- RE-TAKEN: one gate (pipboyItems) joined, the same four rows by one, TWENTY-FIRST arrival.
    // v4560 -- RE-TAKEN: one gate (xatlasRef) joined, the same four rows by one, TWENTY-SECOND arrival.
    // v4563 -- RE-TAKEN: one gate (fluidSystem) joined, the same four rows by one, TWENTY-THIRD arrival.
    // v4564 -- RE-TAKEN: one gate (sourceExtensions) joined, the same four rows by one, TWENTY-FOURTH.
    // v4566 -- RE-TAKEN: one gate (inputSets) joined, the same four rows by one, TWENTY-FIFTH -- AND
    // distinctDefinitions MOVED for the first time in ten arrivals, 38 -> 39. The new gate spells its own
    // ok() with a default argument (`(name, cond, detail = "")`) that no existing gate uses verbatim, so it
    // is a thirty-ninth distinct text rather than a thirty-eighth copy. Worth a line: this row is the one
    // that would notice a tree drifting toward everybody inventing their own assertion helper, and every
    // previous arrival had reused one.
    // v4569 -- RE-TAKEN: one gate (exactHash) joined, the same four rows by one, TWENTY-SIXTH arrival --
    // and distinctDefinitions moved AGAIN, 39 -> 40, for the second round running after ten that did not.
    // The new gate spells `ok(n, c, d = "")` where v4566's spelled `(name, cond, detail = "")`: same shape,
    // different parameter names, so it is a fortieth distinct text. Two in a row is worth watching -- this
    // row exists to notice a tree drifting toward everybody inventing their own assertion helper.
    // v4572 -- RE-TAKEN for one new gate, tools/ship/recordShape-selfcheck.mjs: gates 1616 -> 1617,
    // usesOk 1595 -> 1596, definesOk 1587 -> 1588, nameFirst 1488 -> 1489. distinctDefinitions holds
    // at 40 -- the new gate uses the ok(name, cond, detail) shape already counted, which is the
    // point of that row: a gate adding a FORTY-FIRST spelling of the same idea is the thing worth
    // noticing, and this one does not.
    // v4572b -- RE-TAKEN for tools/ship/recordProvenance-selfcheck.mjs: 1617 -> 1618 and the three
    // rows that follow a gate by one. distinctDefinitions holds at 40 for the second round running.
    // v4573 -- RE-TAKEN for tools/ship/importClosure-selfcheck.mjs: 1618 -> 1619 and the three rows
    // that follow a gate by one. distinctDefinitions holds at 40 for the THIRD round running.
    // v4575 -- RE-TAKEN for physics/render/conductorFresnel-selfcheck.mjs: 1619 -> 1620 and the three
    // rows that follow a gate by one. distinctDefinitions holds at 40 for the FOURTH round running,
    // and this one is a render gate rather than a tools/ship one, which is the harder case for it.
    // v4576 -- RE-TAKEN for tools/ship/recordTier-selfcheck.mjs: 1620 -> 1621 and the three rows that
    // follow a gate by one. distinctDefinitions holds at 40 for the FIFTH round running.
    // v4577 -- RE-TAKEN for physics/raceKnob-selfcheck.mjs: 1621 -> 1622 and the three rows that follow a
    // gate by one. distinctDefinitions holds at 40 for the SIXTH round running, and this gate is in physics/
    // rather than tools/ship/ -- it lives beside its module on purpose, because registryOrphans derives an
    // instrument's module from its gate path.
    // v4577 -- RE-TAKEN for physics/raceKnob-selfcheck.mjs: 1621 -> 1622.
    // v4579 -- RE-TAKEN for tools/ship/starField-selfcheck.mjs: 1622 -> 1623 and the three rows that follow a
    // gate by one. distinctDefinitions holds at 40 for the SEVENTH round running.
    // v4580 -- RE-TAKEN for tools/ship/skyStars-selfcheck.mjs: 1623 -> 1624 and the three rows that follow a
    // gate by one. distinctDefinitions holds at 40 for the EIGHTH round running.
    // v4582 -- RE-TAKEN for tools/ship/zipWriter-selfcheck.mjs: 1624 -> 1625 and the three rows that follow a
    // gate by one. NOT THIS ROUND'S GATE -- it arrived on main in commit c3f1fecb (the release zip's pure-Node
    // writer) and is re-taken here because that commit and this one merged, and the tree has to be green for
    // whichever lands second. distinctDefinitions holds at 40 for the NINTH round running.
    // 2026-09-14 -- RE-TAKEN after a prior session fixed dozens of gates across the tree, adding 25 gates
    // (1625 -> 1650) between this record and the tree: usesOk 1604 -> 1629, definesOk 1596 -> 1621,
    // nameFirst 1497 -> 1522 -- the same three-rows-move-together pattern every earlier arrival showed, now
    // scaled up because many gates landed instead of one. distinctDefinitions ALSO moved, 40 -> 41: one of
    // the new definitions is not verbatim-identical to an existing one, so it is a forty-first distinct text
    // rather than reuse. importsOk, condFirst, unknownSignature and suspects held at 0, 91, 16 and 0 --
    // verified against a fresh `census()` run (node -e importing tools/ship/assertionShape.mjs) before this
    // edit, independent of the failing gate's own printed numbers.
    // v4622 -- RE-TAKEN: 1650 -> 1656 (usesOk 1629 -> 1635, definesOk 1621 -> 1627, nameFirst 1522 -> 1528),
    // the same three-rows-move-together pattern, six gates landing across this branch's own unshipped rounds
    // since the record above was taken -- tools/ship/ffmpegWasmBridge-selfcheck.mjs is this round's own; the
    // other five arrived in earlier rounds on the same branch. condFirst, unknownSignature, suspects and
    // distinctDefinitions held at 91, 16, 0 and 41 -- verified against a fresh census() run, independent of
    // the failing gate's own printed numbers.
    // v4584 -- RE-TAKEN on the tree merged with main at v4583 (this history diverged from the branch above at
    // 1625): one gate (fleetRouting) joined, the same four rows by one.
    // v4585 -- RE-TAKEN: one gate (labHome) joined, the same four rows by one.
    // v4586 -- RE-TAKEN: one gate (labKnobs) joined, the same four rows by one.
    // v4587 -- RE-TAKEN with the three sibling gates of the v4586 knob modules (physics/apsidalKnob-, impactKnob-,
    // hologramKnob-selfcheck.mjs): 1628 -> 1631 gates, and usesOk, definesOk and nameFirst each by three; nothing else moved.
    // v4588 -- RE-TAKEN with the turret copilot's three gates (physics/turret-, brain/gunnerPolicy-, tools/ship/raceTurret-selfcheck.mjs):
    // 1631 -> 1634 gates, and usesOk, definesOk and nameFirst each by three; nothing else moved.
    // v4589 -- RE-TAKEN: one gate (tools/ship/carViews-selfcheck.mjs) joined, the same four rows by one.
    // v4590 -- RE-TAKEN: one gate (physics/slick-selfcheck.mjs) joined, the same four rows by one.
    // v4591 -- RE-TAKEN: one gate (world/buildingTopple-selfcheck.mjs) joined, the same four rows by one.
    // v4592 -- RE-TAKEN: one gate (physics/spellAmmo-selfcheck.mjs) joined, the same four rows by one.
    // v4622-merge -- RE-TAKEN on this branch's actual merge of origin/main: the two histories above are BOTH
    // real, diverged at 1625, and this round's own merge joins them -- so the final reading is neither one
    // alone but a fresh census() over the merged tree: 1656 -> 1669, usesOk 1635 -> 1648, definesOk 1627 ->
    // 1640, nameFirst 1528 -> 1541 -- the same three-rows-move-together pattern. importsOk, condFirst,
    // unknownSignature, suspects and distinctDefinitions held at 0, 91, 16, 0 and 41.
    // v4623 -- RE-TAKEN 1669 -> 1670 for tools/ship/murmurKit-selfcheck.mjs, the kit's gate. usesOk,
    // definesOk and nameFirst move with it, which is the same three-rows-together pattern the note above
    // records: one new gate that names its subject first is counted by all four.
    // v4626 -- RE-TAKEN 1670 -> 1671 for tools/ship/murmurSpecies-selfcheck.mjs.
    // v4630 -- RE-TAKEN 1671 -> 1672 for tools/ship/murmurSpecies2-selfcheck.mjs, the species gate split
    // off BEFORE the fifth species would have crossed the budget. tools/ship/murmurSpeciesFrames.mjs is a
    // MODULE and not a gate, so it moves runtimeGap's file count by two and this one by one.
    // v4632 -- RE-TAKEN 1672 -> 1674 for TWO gates: tools/ship/murmurSpecies3-selfcheck.mjs (opal and abyss)
    // and tools/ship/murmurSpecies4-selfcheck.mjs (droplet, split out of gate two in the same round because
    // its swell pair cost a paired 206-287 ms against a 3,000 ms ceiling). The second was NOT a new subject:
    // its five rows moved out of tools/ship/murmurSpecies2-selfcheck.mjs, so the tree gained one gate FILE
    // and no new rows -- which is exactly the kind of move that makes a count of gates and a count of claims
    // disagree, and is why this record carries both.
    // v4634 -- RE-TAKEN 1674 -> 1675 for tools/ship/murmurSpecies5-selfcheck.mjs, carrying nebula and
    // tempest. ONE gate for TWO species, which is the shape murmur's own pairing makes possible: the two
    // files call a byte-identical kit set and every row in the gate is a comparison between them.
    // v4636 -- RE-TAKEN 1675 -> 1677 for TWO gates: tools/ship/murmurSpecies6-selfcheck.mjs (fathom) and
    // tools/ship/murmurSpecies7-selfcheck.mjs (geode). TWO gates for TWO species where the round before
    // managed one for two, and the difference is arithmetic rather than temperament: nebula and tempest
    // share a compiled shader's worth of subject matter, while fathom's rows need a three-species ridge
    // control and geode's need a travelling foil, so the pair written as one gate came in at 5,064 ms
    // against a 3,000 ms budget. Trimming the control from ten species to five landed at 3,499 and to four
    // at 3,161 -- still over. THE COUNT OF GATES AND THE COUNT OF SUBJECTS DISAGREE HERE FOR A REASON THE
    // BUDGET DECIDED, which is the same reason v4632's droplet split made them disagree the other way.
    // v4584 -- RE-TAKEN on the tree merged with main at v4583: one gate (fleetRouting) joined, the same four rows by one.
    // v4536 -- RE-TAKEN AGAIN AT THE MERGE, for tools/ship/partitionScore-selfcheck.mjs: 1619 -> 1620.
    // *** BOTH LINES RE-TOOK THIS TABLE IN THE SAME WINDOW, TWICE IN TWO ROUNDS, AND THE MERGE HAS TO ADD
    // THE TWO MOVES RATHER THAN PICK ONE: *** each side's note is correct for a tree containing its own new
    // gate and neither is correct for the tree containing both. Re-derived from the merged tree.
    // v4537 -- RE-TAKEN for tools/ship/backlogAbsence-selfcheck.mjs: 1620 -> 1621 and the three rows that
    // follow a gate by one. distinctDefinitions holds at 40 for the fourth round running.
    // v4537 -- RE-TAKEN AT THE MERGE: 1625 -> 1627, the two gates this branch added. FOURTH MERGE RUNNING
    // where both lines re-took this table in the same window. distinctDefinitions holds at 40 for the tenth
    // round; every number here is re-derived from the merged tree and never summed from the two notes.
    // v4538 -- RE-TAKEN for tools/ship/pathCost-selfcheck.mjs: 1627 -> 1628 and the three rows that follow
    // a gate by one. distinctDefinitions holds at 40 for the eleventh round running.
    // v4539 -- RE-TAKEN for tools/ship/groundProbe-selfcheck.mjs: 1628 -> 1629 and the three rows that follow
    // a gate by one.
    // v4540 -- RE-TAKEN AT THE MERGE: 1626 -> 1630.
    // v4541 -- RE-TAKEN for tools/ship/capsuleMove-selfcheck.mjs: 1630 -> 1631 and the three rows that
    // follow a gate by one -- usesOk 1610, definesOk 1602, nameFirst 1503. The round's second new file is
    // physics/character/capsuleMove.mjs, a MODULE, and it moves none of these, which is the distinction
    // these nine rows exist to make. distinctDefinitions holds at 40 for the twelfth round running: the new
    // gate reuses the ok(name, cond, detail) spelling already counted rather than inventing a forty-first.
    // v4543 -- RE-TAKEN for tools/ship/capsuleGround-selfcheck.mjs: 1631 -> 1632 and the three rows that
    // follow a gate by one. The round's second new file is physics/character/capsuleGround.mjs, a MODULE,
    // and it moves none of these. distinctDefinitions holds at 40 for the thirteenth round running.
    // v4544 -- RE-TAKEN for tools/ship/fallBody-selfcheck.mjs: 1632 -> 1633 and the three rows that follow
    // a gate by one. The round's second new file is physics/character/fallBody.mjs, a MODULE, and it moves
    // none of these. distinctDefinitions holds at 40 for the fourteenth round running.
    // v4545 -- RE-TAKEN for tools/ship/playerGround-selfcheck.mjs: 1633 -> 1634 and the three rows that
    // follow a gate by one. The round's other change is to camera/camera.js, an existing MODULE, and a
    // round that edits a module without adding one moves none of these. distinctDefinitions holds at 40
    // for the fifteenth round running.
    // v4546 -- RE-TAKEN for tools/ship/playerSlope-selfcheck.mjs: 1634 -> 1635 and the three rows that
    // follow a gate by one. The round's other changes are all to existing files -- camera/camera.js and
    // two gates whose expectations moved -- and a round that edits without adding moves none of these.
    // distinctDefinitions holds at 40 for the sixteenth round running.
    // v4547 -- RE-TAKEN for tools/ship/controllerAgreement-selfcheck.mjs: 1635 -> 1636 and the three rows
    // that follow a gate by one. The round's second new file is tools/ship/controllerAgreement.mjs, a
    // MODULE, and it moves none of these. distinctDefinitions holds at 40 for the seventeenth round.
    // v4548 -- RE-TAKEN for tools/ship/cameraFall-selfcheck.mjs: 1636 -> 1637 and the three rows that
    // follow a gate by one. The round's other change is to camera/camera.js, an existing module -- it
    // REMOVES code rather than adding a file. distinctDefinitions holds at 40 for the eighteenth round.
    // v4549 -- RE-TAKEN for tools/ship/playerBody-selfcheck.mjs: 1637 -> 1638 and the three rows that
    // follow a gate by one. The round's other change is to camera/camera.js, an existing module.
    // distinctDefinitions holds at 40 for the nineteenth round running.
    // v4550 -- RE-TAKEN for tools/ship/playerWater-selfcheck.mjs: gates 1638 -> 1639, usesOk 1617 ->
    // 1618, definesOk 1609 -> 1610, nameFirst 1510 -> 1511. One gate moves four of the nine rows.
    // v4551 -- RE-TAKEN for tools/ship/voxelAvatarDevice-selfcheck.mjs, the device half split out of
    // voxelAvatar: 1639 -> 1640, usesOk 1619, definesOk 1611, nameFirst 1512. *** A SPLIT ADDS A GATE TO
    // THIS CENSUS EVEN THOUGH IT ADDED NO CHECK TO THE TREE *** -- the rows moved files, they did not
    // arrive -- so this table counts FILES and not coverage, which is worth saying where it is read.
    // v4552 -- RE-TAKEN for tools/ship/walkGround-selfcheck.mjs: 1640 -> 1641, usesOk 1620, definesOk
    // 1612, nameFirst 1513.
    // v4554 -- RE-TAKEN for tools/ship/kaijuGround-selfcheck.mjs: 1641 -> 1642, usesOk 1621, definesOk
    // 1613, nameFirst 1514.
    // *** BOTH LINES RE-TOOK THIS TABLE AGAINST A TREE THE OTHER COULD NOT SEE, AND THE READINGS BELOW ARE
    // NEITHER OF THEIRS. *** The sets overlap on everything predating the split, so the two are not summed;
    // they are RE-DERIVED by running the census over the merged tree. Both note chains are kept, because a
    // chain that loses a round stops being a history of how the number moved.
    // *** RE-DERIVED AT THE main MERGE. *** Both lines re-took this against a tree the other could not see,
    // and the readings overlap on everything predating the split, so they are run over the merged tree rather
    // than added. Both prior readings are kept in the chain above; a discarded one is evidence about the method.
    // v4638 -- RE-TAKEN for tools/ship/fsrPage-selfcheck.mjs, the temporal arc's first page gate: 1736 -> 1737,
    // usesOk 1715 -> 1716, definesOk 1707 -> 1708, nameFirst 1608 -> 1609. One gate arrived and four of the
    // nine rows moved by one; the five that did not (distinctDefinitions, condFirst, unknownSignature,
    // importsOk, suspects) are the ones that say the new gate uses the tree's own assertion shape rather than
    // inventing a tenth. That is what this census is for, and it is the reason the row compares all nine.
    // v4640 -- RE-TAKEN for tools/ship/pipeTruncation-selfcheck.mjs: 1737 -> 1738, usesOk 1716 -> 1717,
    // definesOk 1708 -> 1709, nameFirst 1609 -> 1610. Named by the pre-flight BEFORE the verify this time,
    // which is what v4639 built the runner for -- last round the same six records were found one at a time
    // across two full sweeps.
    gates: 1738, usesOk: 1717, definesOk: 1709, importsOk: 0,
    distinctDefinitions: 41, nameFirst: 1610, condFirst: 91, unknownSignature: 16,
    suspects: 0,
    // Written three times in three rounds by this session, all caught by reading and none by running.
    writtenThisSession: Object.freeze([
        Object.freeze({ round: "v4478", shape: "arrowNotInvoked", text: "ok(name, async () => true)" }),
        Object.freeze({ round: "v4479", shape: "arrowNotInvoked", text: "ok(name, (() => true)())" }),
        Object.freeze({ round: "v4479", shape: "asyncIife", text: "ok(name, async () => {...}())" }),
    ]),
});
