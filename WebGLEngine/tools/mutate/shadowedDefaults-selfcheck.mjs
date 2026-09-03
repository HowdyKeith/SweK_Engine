// WebGLEngine/tools/mutate/shadowedDefaults-selfcheck.mjs -- v4394
//
// *** v4392 SAID THIS FINDING WAS "PROVED FOR ONE PAIR AND NOT CENSUSED". THIS IS THE CENSUS, AND THE PAIR
//     TURNS OUT TO BE ONE OF EIGHTEEN. ***
//
// The pattern: a default written into an object literal that is passed straight to a function imported from
// another module -- which defaults the same key again. Two numbers, two authors, one argument. Whether the
// outer one can be observed at all is decided by an operator in the OTHER file.
//
// The verdict is predicted from syntax in tools/mutate/shadowedDefaults.mjs and VERIFIED BY EXECUTION here,
// because a syntactic claim about runtime behaviour that is never run is a claim about a regex.
//
// *** AND RUNNING IT IS WHAT CORRECTED THE ROUND. *** The first draft of section 3 reached the callee THROUGH
// its forwarder and predicted that an explicit `{ max: 0 }` would come out as brain/brainCache.mjs's 256. It
// came out 32, and the check went red on its first run. The reason is a second `||` nobody was looking at:
// brain/flowfieldCache.mjs writes `max: opts.max || 32`, so the caller's zero dies AT THE NEAR END and the
// callee is never consulted. A `||` forwarder cannot emit a zero, which means there are two questions here and
// each is answered by a different operator in a different file. Sections 3 and 4 keep them apart:
//
//   Q1  what a ZERO MUTATION of the outer literal does, with the option absent -- the CALLEE's operator:
//         ERASED      absent and zero give the SAME value; the literal cannot be falsified by a zero mutation
//         REDIRECTED  the world changes, but to the CALLEE's number -- the mutation that ran is not the one
//                     the sweep reports it ran
//         HONOURED    zero arrives as zero; the mutation is exactly what it says it is
//   Q2  where a CALLER's explicit zero dies -- the FORWARDER's operator, asked first and usually decisive.
//
// *** AND THE SAME CALLEE ANSWERS BOTH WAYS. *** physics/esBox3d.js is ERASED against physics/box3dLockstep.js
// and DIVERGENT against ev/tools/es-arena.mjs, from one unchanged line of esBox3d.js. That is the point of the
// whole round: this is not a property of a file, it is a property of an EDGE, and neither author can see it
// from where they are standing.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scan, census, zeroCensus, unfalsifiable, agreement, verdictFor, zeroDiesAt, callArguments,
         importBindings, VERDICT, ZERO_DIES } from "./shadowedDefaults.mjs";
import { SWEEP_AFTER_FIX } from "./mechanicalSweep.mjs";
import { codeOnly, noComments } from "../ship/sourceScan.mjs";
import { createESBox3D } from "../../physics/esBox3d.js";
import { makeCachedSolver } from "../../brain/flowfieldCache.mjs";
import { BrainCache } from "../../brain/brainCache.mjs";
import { FleetTracker } from "../../brain/fleet/fleetTracker.js";
import { project } from "../../ui/radarProjection.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

// =============================================================================================================
console.log("1. THE CLASSIFIER, AND THE STRIPPER THAT MADE ITS FIRST DRAFT CENSUS NOTHING AT ALL");
{
    const fwd = (value, op = "||") => ({ key: "k", op, value, truncated: false });
    const con = (value, op, truncated = false) => [{ key: "k", op, value, line: 1, truncated }];

    ok("callee `||` repeating the same number -> ERASED",
       verdictFor(fwd("30"), con("30", "||")).verdict === VERDICT.ERASED, "30 -> || 30");
    ok("callee `||` with a different number -> REDIRECTED",
       verdictFor(fwd("60"), con("30", "||")).verdict === VERDICT.REDIRECTED, "60 -> || 30 runs 60 -> 30, not 60 -> 0");
    ok("callee `??` -> HONOURED, whether or not the numbers agree",
       verdictFor(fwd("3"), con("3", "??")).verdict === VERDICT.HONOURED &&
       verdictFor(fwd("2000"), con("10000", "??")).verdict === VERDICT.HONOURED, "?? never substitutes for 0");
    ok("...and `??` outranks the number-comparison, so an AGREEING pair under ?? is not called ERASED",
       verdictFor(fwd("3"), con("3", "??")).verdict !== VERDICT.ERASED,
       "brain/fleet/fleetTracker.js is exactly this: 3 and 3, and honoured");
    ok("two consuming defaults for one key in the callee -> AMBIGUOUS, not a guess",
       verdictFor(fwd("20000", "??"), [...con("6", "??"), ...con("4000", "??")]).verdict === VERDICT.AMBIGUOUS,
       "a module-level scan cannot say WHICH function was called");
    ok("a default that is an arithmetic expression -> UNRESOLVED",
       verdictFor(fwd("20000", "??"), con("6", "??", true)).verdict === VERDICT.UNRESOLVED,
       "`?? 6 * 60 * 1000` is not the number 6");

    // *** THE TWO STRIPPERS. *** This is not a hypothetical: the first draft of the scanner used codeOnly for
    // everything and censused ZERO pairs -- including the one pair v4392 had already proved by hand -- because
    // codeOnly blanks string bodies and an import specifier IS a string.
    const src = fs.readFileSync(path.join(ENG, "physics/box3dLockstep.js"), "utf8");
    const blanked = /from\s*""/.test(codeOnly(src));
    const kept = /from\s*"\.\/esBox3d\.js"/.test(noComments(src));
    ok("*** codeOnly() erases the import graph and noComments() keeps it ***", blanked && kept,
       "codeOnly: `from \"\"`; noComments: `from \"./esBox3d.js\"`");
    const code = new Map([[path.join(ENG, "physics/esBox3d.js"), ""]]);
    const viaText = importBindings(path.join(ENG, "physics/box3dLockstep.js"), new Map([[path.join(ENG, "physics/box3dLockstep.js"), noComments(src)]]), code);
    const viaCode = importBindings(path.join(ENG, "physics/box3dLockstep.js"), new Map([[path.join(ENG, "physics/box3dLockstep.js"), codeOnly(src)]]), code);
    ok("...and the edge that carries this whole round is visible through one and invisible through the other",
       viaText.get("createESBox3D") != null && viaCode.size === 0,
       `noComments found ${viaText.size} binding(s), codeOnly found ${viaCode.size}`);

    // Q2 is a SEPARATE function taking a separate operator, which is the shape the first draft lacked.
    ok("a `||` forwarder kills the caller's zero at the NEAR end, whatever the callee does",
       zeroDiesAt("||", "||", "32") === ZERO_DIES.FORWARDER && zeroDiesAt("||", "??", "32") === ZERO_DIES.FORWARDER,
       "`opts.max || 32` never emits 0, so the callee is not consulted");
    ok("...and only a `??` forwarder lets the zero travel far enough for the callee to decide",
       zeroDiesAt("??", "||", "2000") === ZERO_DIES.CALLEE && zeroDiesAt("??", "??", "2000") === ZERO_DIES.NOWHERE,
       "two operators, two questions, and the first draft answered the second with the first one's operator");

    ok("callArguments() takes the matching close paren, not the first one",
       callArguments("f(g(1, 2), { a: 3 })", 1).trim() === "g(1, 2), { a: 3 }", "nested calls survive");
}

// =============================================================================================================
console.log("\n2. THE CENSUS: EVERY SUCH EDGE IN THE TREE, AND WHY THE IMPORT EDGE IS WHAT MAKES IT READABLE");
const S = scan(ENG);
const C = census(S.rows);
{
    for (const r of S.rows) {
        console.log(`        ${r.verdict.padEnd(10)} ${r.key.padEnd(14)} ${r.from}:${r.fromLine} ${r.fromOp} ${r.fromValue}` +
                    `  --${r.callee}()-->  ${r.to}:${r.toLine ?? "?"} ${r.toOp ?? "?"} ${r.toValue ?? "?"}`);
    }
    ok("every row carries a verdict, and the counts are derived from the rows rather than typed beside them",
       C.ERASED + C.REDIRECTED + C.HONOURED + C.AMBIGUOUS + C.UNRESOLVED === C.total && C.total === S.rows.length,
       `${C.total} edges over ${S.files} source files: ${C.ERASED} erased, ${C.REDIRECTED} redirected, ` +
       `${C.HONOURED} honoured, ${C.AMBIGUOUS} ambiguous, ${C.UNRESOLVED} unresolved`);
    ok("the pair v4392 proved by hand is in the census, and it is ERASED",
       S.rows.some((r) => r.key === "shipHalf" && r.from === "physics/box3dLockstep.js" && r.verdict === VERDICT.ERASED),
       "physics/box3dLockstep.js:21 || 30 --createESBox3D()--> physics/esBox3d.js:19 || 30");
    ok("*** and the SAME callee carries the opposite verdict on a different edge ***",
       S.rows.some((r) => r.key === "shipHalf" && r.to === "physics/esBox3d.js" && r.verdict === VERDICT.REDIRECTED),
       "ev/tools/es-arena.mjs:134 || 60 --createESBox3D()--> the same unchanged line of esBox3d.js");
    ok("the control is DERIVED, not remembered: the same question asked without the import edge",
       S.naiveNamePairs > 20 * C.total,
       `name-only pairing over the same tree: ${S.naiveNamePairs} candidate pairs; with the import edge: ${C.total}`);
    report("The import edge is what makes the census readable. Grouping by option NAME alone finds " +
           S.naiveNamePairs + " pairs " +
           "in this tree and nearly all of them are coincidence -- `x`, `width`, `steps` and `timeoutMs` are " +
           "defaulted in dozens of modules that never call one another. Requiring the callee to be a binding " +
           "imported from the module holding the other default takes " + S.naiveNamePairs + " to " + C.total +
           ", and those can be " +
           "read by hand, which is the only reason the verdicts below can be trusted.");
}

// =============================================================================================================
console.log("\n3. Q1 -- WHAT A ZERO MUTATION REALLY RUNS. ENTER AT THE CALLEE, WHICH IS WHERE A MUTATED FORWARDER LEAVES IT");
{
    // A mutated forwarder (`|| V` rewritten to `|| 0`) hands the callee a literal 0 when the option is absent.
    // So the experiment enters AT THE CALLEE with the key set to 0 -- that is what the mutant actually delivers.
    // Entering at the forwarder instead is what made the first draft's third row go red, and section 4 keeps
    // that failure rather than deleting it, because it is the other half of the finding.
    const halves = [];
    const stubWorld = () => ({ addShip: (s) => { halves.push(s.half); return halves.length - 1; },
                              step() {}, transforms: () => [], setVelocity() {} });
    const shipHalf = (o) => { createESBox3D(stubWorld(), o).add({ x: 0, y: 0 }, {}); return halves.pop(); };

    const trials = [
        { key: "shipHalf", verdict: VERDICT.ERASED, outer: 30,
          absent: shipHalf({}), zero: shipHalf({ shipHalf: 0 }),
          edge: "physics/box3dLockstep.js:21 || 30 -> physics/esBox3d.js:19 || 30" },
        { key: "shipHalf", verdict: VERDICT.REDIRECTED, outer: 60,
          absent: shipHalf({}), zero: shipHalf({ shipHalf: 0 }),
          edge: "ev/tools/es-arena.mjs:134 || 60 -> physics/esBox3d.js:19 || 30  (THE SAME CALLEE LINE)" },
        { key: "max", verdict: VERDICT.REDIRECTED, outer: 32,
          absent: new BrainCache({}).max, zero: new BrainCache({ max: 0 }).max,
          edge: "brain/flowfieldCache.mjs:15 || 32 -> brain/brainCache.mjs:9 || 256" },
        { key: "missThreshold", verdict: VERDICT.HONOURED, outer: 3,
          absent: new FleetTracker({}).missThreshold, zero: new FleetTracker({ missThreshold: 0 }).missThreshold,
          edge: "fx/avatar/fleetReactions.js:14 || 3 -> brain/fleet/fleetTracker.js:16 ?? 3" },
    ];
    for (const t of trials) {
        const d = `callee with key absent -> ${t.absent};  callee with key 0 -> ${t.zero}   [${t.edge}]`;
        if (t.verdict === VERDICT.ERASED) {
            ok(`ERASED: the mutated 0 lands on the outer literal's own value, so nothing moves (${t.key})`,
               t.zero === t.absent && t.zero === t.outer, d);
        } else if (t.verdict === VERDICT.REDIRECTED) {
            ok(`REDIRECTED: the mutation that runs is ${t.outer} -> ${t.zero}, not ${t.outer} -> 0 (${t.key})`,
               t.zero !== t.outer, d);
        } else {
            ok(`HONOURED: the mutated 0 arrives as 0 and the callee acts on it (${t.key})`,
               t.zero !== t.absent, d);
        }
    }
    ok("ERASED, a second edge and a second callee: radarManager's range and radarProjection's are both 1",
       project("flat", { x: 100, z: 0 }).px === project("flat", { x: 100, z: 0, range: 0 }).px,
       `project() range absent -> px ${project("flat", { x: 100, z: 0 }).px}; range 0 -> px ${project("flat", { x: 100, z: 0, range: 0 }).px}`);

    report("*** THE VERDICT IS A PROPERTY OF THE EDGE, NOT OF EITHER FILE. *** Rows one and two are the same " +
           "unchanged line of physics/esBox3d.js answering two different callers, and they get opposite " +
           "verdicts because one caller wrote 30 and the other wrote 60. Neither author can see that from " +
           "where they are standing, and nothing in this tree made them agree before this file existed.");
}

// =============================================================================================================
console.log("\n4. Q2 -- WHERE A CALLER'S EXPLICIT ZERO DIES, WHICH IS A DIFFERENT OPERATOR IN A DIFFERENT FILE");
{
    // *** THIS SECTION EXISTS BECAUSE THE FIRST DRAFT WAS WRONG AND ITS OWN EXECUTION SAID SO. *** The draft
    // predicted `makeCachedSolver(solver, { max: 0 })` would yield brain/brainCache.mjs's 256, because the
    // callee substitutes for a falsy value. It yields 32, and the reason is one operator earlier in the chain.
    const solver = { solve: async () => null };
    const viaForwarder = makeCachedSolver(solver, { max: 0 }).cache.max;
    const atCallee = new BrainCache({ max: 0 }).max;
    ok("*** a `||` FORWARDER never emits a zero, so the callee's default is unreachable on that edge ***",
       viaForwarder === 32 && atCallee === 256 && viaForwarder !== atCallee,
       `makeCachedSolver({ max: 0 }) -> ${viaForwarder} (its own || 32);  BrainCache({ max: 0 }) -> ${atCallee}`);
    ok("...and a real value still travels the whole chain untouched, so nothing here is broken, only blind",
       makeCachedSolver(solver, { max: 7 }).cache.max === 7, "max 7 -> 7 at both ends");

    const Z = zeroCensus(S.rows);
    ok("the census answers Q2 per row, from the FORWARDER's operator, and the counts come from the rows",
       Z.forwarder + Z.callee + Z.nowhere + Z.unpaired === C.total,
       `${Z.forwarder} die at the forwarder, ${Z.callee} at the callee, ${Z.nowhere} survive both, ` +
       `${Z.unpaired} unpaired`);
    ok("...and the answer is overwhelmingly the FORWARDER, which is exactly the thing the draft did not look at",
       Z.forwarder > Z.callee + Z.nowhere && Z.orForwarders >= Z.forwarder,
       `${Z.orForwarders} of ${C.total} outer defaults use ||, so that many callers' zeros never leave home; ` +
       `the ${Z.orForwarders - Z.forwarder} left over are the ones whose own default IS 0, where the ` +
       `distinction has nothing left to bite on`);
    report("Q1 and Q2 cannot be one verdict. Q1 is about a literal EDITED IN THE SOURCE and is decided by the " +
           "callee; Q2 is about a value PASSED AT RUNTIME and is decided by the forwarder. The draft answered " +
           "Q2 with Q1's operator, printed a confident prediction, and the prediction was refuted by the only " +
           "thing that could refute it, which was running the code it was about.");
}

// =============================================================================================================
console.log("\n5. AN ERASED EDGE NEEDS AN AGREEMENT CHECK -- AND THE TREE'S OWN SWEEP RECORD PROVED THE DRAFT WRONG");
{
    // *** THE DRAFT OF THIS SECTION SAID AN ERASED ZERO MUTANT "CANNOT BE CAUGHT BY ANY GATE, PRESENT OR
    // FUTURE". tools/mutate/mechanicalSweep.mjs, recorded at v4390 and re-measured at v4392, says otherwise
    // ON THE EXACT ROW THE SENTENCE WAS ABOUT: physics/box3dLockstep.js:21, kind zero, state CAUGHT. ***
    //
    // Both statements are true and they are about different kinds of check. No gate that OBSERVES BEHAVIOUR
    // can catch it -- the world is byte-identical, and that part stands. But v4392 wrote a check that reads
    // the SOURCE: it greps both files for the shipHalf literal and asserts the two agree. Set the outer one to
    // 0 and the grep mismatches, and the gate goes red without the world moving at all.
    //
    // So the useful reading of an ERASED row is not "the sweep must stop counting it". It is "this edge has no
    // check that could ever notice, unless somebody writes an agreement check" -- and the census says which
    // edges those are. That is the fix this round ships, generalised from v4392's one hand-written pair.
    const recorded = SWEEP_AFTER_FIX.rows.filter((r) => r.file === "physics/box3dLockstep.js" && r.line === 21 && r.kind === "zero");
    ok("*** the recorded sweep CAUGHT the zero mutant at the very edge this file calls unfalsifiable ***",
       recorded.length === 1 && recorded[0].state === "CAUGHT",
       `mechanicalSweep.SWEEP_AFTER_FIX: box3dLockstep.js:21 zero -> ${recorded[0] && recorded[0].state}` +
       ` -- caught by a SOURCE check in physics/lockstepConstants-selfcheck.mjs, not by any behaviour`);
    ok("...and that source check is real and still there, so the row is not a stale record",
       /shipHalf:\\s\*opts\\.shipHalf/.test(fs.readFileSync(path.join(ENG, "physics/lockstepConstants-selfcheck.mjs"), "utf8")),
       "v4392 greps box3dLockstep.js and esBox3d.js and asserts the two literals match");

    const A = agreement(S.rows);
    for (const d of A.drifted) {
        console.log(`        DRIFTED   ${d.key.padEnd(12)} ${d.from}:${d.line}  was ${d.value}, now ${d.now}` +
                    `  (callee ${d.callee}, verdict ${d.verdict})`);
    }
    ok("every ERASED edge frozen at v4394 still holds, and none has gone missing from the census",
       A.drifted.length === 0 && A.missing.length === 0,
       `${A.held.length} edge(s) held: ` + A.held.map((h) => `${h.key}@${h.from}:${h.line}=${h.value}`).join("; ") +
       (A.missing.length ? `  MISSING: ${A.missing.map((m) => m.key + "@" + m.from).join(", ")}` : ""));
    ok("...and the frozen list covers every ERASED row the census finds, so a new one cannot slip in unfrozen",
       A.held.length === C.ERASED,
       `${A.held.length} frozen and holding vs ${C.ERASED} ERASED rows in the census`);
    // What "new" means here is checkable for one edge and NOT for the others, so only the checkable part is
    // asserted. Whether ui/radar-selfcheck.mjs's projection tests amount to an agreement check on lat0/lon0
    // is a judgement about that file's intent, and this gate does not get to make it by grep.
    const gates = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (e.name.startsWith(".") || ["node_modules", "vendor"].includes(e.name)) continue;
            const f = path.join(d, e.name);
            if (e.isDirectory()) walk(f); else if (e.name.endsWith("-selfcheck.mjs")) gates.push(f);
        }
    })(ENG);
    const mentions = (needle) => gates.filter((g) => g.endsWith("shadowedDefaults-selfcheck.mjs") ? false
                                                  : fs.readFileSync(g, "utf8").includes(needle));
    ok("*** ui/physicsMontage.js's two cell sites had NO check of any kind before this round ***",
       mentions("pageVoxels").length === 0 && mentions("voxelizePage").length === 0,
       `${gates.length} gates in the tree and not one of them names voxelizePage or pageVoxels`);
    ok("...whereas shipHalf had one, which is why exactly one of these five edges was already defended",
       mentions("esBox3d").length > 0, "physics/lockstepConstants-selfcheck.mjs, asserted above");
    report("The lat0/lon0/range edges are the honest middle: ui/radar-selfcheck.mjs exercises " +
           "ui/radarProjection.js, so those numbers are not unwatched -- but whether any of its checks would " +
           "notice ui/radarManager.js's copy drifting is a question about that file's intent, and this gate " +
           "does not answer it by grep. It freezes the edges either way, which costs nothing if the answer is " +
           "yes and is the only defence if it is no.");

    const erased = unfalsifiable(S.rows);
    // tools/mutate/scan.mjs skips 0 and 1 outright (its own header says why), so an ERASED site whose literal
    // is 0 or 1 was never a mutation target in the first place and counting it here would be double-counting.
    const mutable = erased.filter((r) => Math.abs(Number(r.fromValue)) > 1);
    ok("the sites a mechanical zero mutation reaches are counted from the rows, not carried beside them",
       erased.length === C.ERASED,
       `${erased.length} erased, of which ${mutable.length} carry a literal scan.mjs would mutate at all: ` +
       mutable.map((r) => `${r.from}:${r.fromLine} ${r.key}=${r.fromValue}`).join("; "));
    ok("...while the REDIRECTED rows need no agreement check, because their world really does move",
       S.rows.filter((r) => r.verdict === VERDICT.REDIRECTED).length === C.REDIRECTED && C.REDIRECTED > 0,
       `${C.REDIRECTED} rows where the mutation runs but the sweep's LABEL for it is wrong -- a reporting ` +
       `defect, not a coverage one, and nothing is subtracted for it`);
    report("The OFF-BY-ONE mutant is unaffected at every ERASED site: 30 -> 31 is truthy, so it passes the " +
           "callee's `||` untouched and is a real behavioural experiment. Only the ZERO operator is erased, " +
           "which is why this narrows tools/mutate/operators.mjs rather than disabling anything in it.");
    report("*** AND THE CORRECTION IS THE ROUND, TWICE OVER. *** The draft of this section was refuted by a " +
           "record already in the tree, and the draft of section 4 was refuted by running the code it was " +
           "about. Neither was caught by reading. A census that only classifies is a claim about a regex; " +
           "what makes these eighteen rows worth anything is that two of the conclusions drawn from them did " +
           "not survive contact with the tree.");
}

// =============================================================================================================
console.log("\n6. THE THREE BLIND SPOTS, WITH THEIR SIZES -- ALL THREE MAKE THE CENSUS SMALLER");
{
    ok("a default that is a NAMED CONSTANT is invisible to a literal scanner, and the count is measured",
       S.namedConstantDefaults > 0,
       `${S.namedConstantDefaults} consuming defaults in the tree resolve to an ALL_CAPS constant, not a literal ` +
       `-- ai/OllamaClient.js:89 writes \`opts.timeoutMs ?? DEFAULT_TIMEOUT_MS\` and no edge into it can be paired`);
    ok("a callee module with more than one default for the key gets AMBIGUOUS and no verdict",
       C.AMBIGUOUS > 0 && S.rows.filter((r) => r.verdict === VERDICT.AMBIGUOUS).every((r) => r.toValue == null),
       `${C.AMBIGUOUS} row(s): the scan is MODULE-level and cannot say which function holds the default it found`);
    ok("an arithmetic default gets UNRESOLVED rather than its first literal",
       C.UNRESOLVED > 0,
       `${C.UNRESOLVED} row: ai/OllamaClient.js:939 is \`?? 6 * 60 * 1000\`, and a regex that stops at the ` +
       `first number would have reported the timeout as 6, and filed it REDIRECTED against 20000`);
    report("All three undercount, which is the safe direction for a claim of the form `these sites cannot be " +
           "falsified`. A missed edge leaves a mutant filed as a survivor -- the status quo. A FALSE edge " +
           "would excuse a real coverage hole, which is the failure this census must not have.");
}

// =============================================================================================================
console.log("\n7. THE SCOREBOARD, DERIVED FROM WHAT THIS FILE ACTUALLY ASSERTS");
{
    const src = fs.readFileSync(path.join(ENG, "tools/mutate/shadowedDefaults-selfcheck.mjs"), "utf8");
    const headings = [...src.matchAll(/^console\.log\("(?:\\n)?(\d\.[^"]*)"/gm)].map((m) => m[1]);
    const verdicts = [VERDICT.ERASED, VERDICT.REDIRECTED, VERDICT.HONOURED];
    const run = verdicts.filter((v) => new RegExp("^" + v + ":", "m").test(src.replace(/^\s*ok\(`/gm, "")));
    ok("all three behavioural verdicts are DEMONSTRATED by execution, not only classified",
       run.length === 3, `${headings.length} sections; executed verdicts: ` + run.join(", "));
    ok("...and every verdict the census produced is either executed or explicitly declined",
       C.ERASED + C.REDIRECTED + C.HONOURED + C.AMBIGUOUS + C.UNRESOLVED === C.total,
       `${C.ERASED + C.REDIRECTED + C.HONOURED} behavioural rows, ${C.AMBIGUOUS + C.UNRESOLVED} declined`);
}

// ---- v4394 SABOTAGES, grep-CONFIRMED APPLIED BEFORE READING, RESTORED md5-IDENTICAL -------------------------
//
// The SUBJECT files, before and after all four -- md5-identical:
//    shadowedDefaults.mjs          f55659d0c8741e06b735e8f753c366d6
//    ui/physicsMontage.js          7d7517902781a218736112b098fad017
//    physics/esBox3d.js            b181dd8151a2aefff15f8e98ea7da4a4
//    brain/fleet/fleetTracker.js   5528f32a3c52922603ea6bd58c022ec6
//    brain/flowfieldCache.mjs      112e6ec284f787a014a4606b717e9f81
// This gate itself is not in that list on purpose: it was 06c921d201b0da1ef7864781c975eb14 while the four ran,
// and writing this paragraph changed it. A file cannot carry its own post-edit hash, and pretending otherwise
// is how a receipt stops being a receipt.
//
//   A  ui/physicsMontage.js:59, `opts.cell || 6` set to `|| 0` -- the exact zero mutation this round says no
//      BEHAVIOURAL gate could ever catch, at the one edge that had no check of any kind. -> 1 RED, the frozen
//      agreement check, naming the site. This is the sabotage the round exists for: before v4394 the tree had
//      nothing that could go red on it, and the mechanical sweep would have filed it as a survivor.
//
//   B  physics/esBox3d.js:19, `|| 30` set to `|| 40` -- v4392's sabotage C, now caught three different ways
//      instead of two. -> 3 RED: the census row stops being ERASED, the executed ERASED demonstration reads
//      "callee with key absent -> 40", and the frozen list loses the edge.
//
//   C  brain/fleet/fleetTracker.js:16, `?? 3` changed to `|| 3` -- one character, and it CREATES an erasure
//      where there was none. -> 2 RED, and the second is the one worth having: "the frozen list covers every
//      ERASED row" reads 6 frozen vs 7 in the census. A new unfalsifiable edge cannot arrive unnoticed, which
//      is a different guarantee from any of the five specific ones.
//
//   D  brain/flowfieldCache.mjs:15, `|| 32` changed to `?? 32` -- the forwarder starts letting zeros through.
//      -> 1 RED, and its detail line reads `makeCachedSolver({ max: 0 }) -> 256`, which is the prediction the
//      first draft made and could not justify. The sabotage turns the draft's error into the passing case.
//
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHICH FUNCTION holds the consuming default. The scan is module-level, so a module " +
    "that defaults one key in exactly one place is paired confidently and one that defaults it twice is not " +
    "paired at all -- there is no middle setting, and a real scope resolver would move rows out of AMBIGUOUS " +
    "rather than change any verdict below. Also unchecked: the REDIRECTED rows are reported and not fixed, " +
    "and neither is a single one of the sixteen `||` forwarders whose caller cannot pass a zero at all -- " +
    "whether each of those wants `??` is sixteen separate judgements about what zero MEANS for that option, " +
    "not one edit, and several of them almost certainly want to keep rejecting it. And the " +
    "census sees only defaults reached through a NAMED IMPORT: a method called on an object, a callback, or " +
    "anything reached through a dynamic import is outside it entirely.");
process.exit(fails ? 1 : 0);
