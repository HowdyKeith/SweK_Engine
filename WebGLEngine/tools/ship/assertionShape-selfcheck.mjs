// tools/ship/assertionShape-selfcheck.mjs -- v4480 -- the gate for tools/ship/assertionShape.mjs.
//
// Run: node tools/ship/assertionShape-selfcheck.mjs
//
// *** THE SWEEP THIS FILE GRADES RETURNS ZERO, SO THE POSITIVE CONTROLS ARE NOT A FORMALITY -- THEY ARE THE
// WHOLE REASON THE ZERO IS WORTH READING. *** A detector that has only ever returned zero is indistinguishable
// from one that cannot return anything else, and this session has caught that exact shape five times: v4435's
// path check that could not fail, v4436's and v4447's branches nothing reached, v4443's and v4445's checks
// grading their own copy, v4456's filesystem clause and v4478's rows-that-worked count. Section 2 therefore
// drives each of the three finders against a fixture built to trip it, BEFORE section 3 is allowed to report
// that the tree is clean.
//
// ---- *** SIX SABOTAGES, RESULTS BY NAME, AND NONE WENT ZERO-RED *** --------------------------------------------
//
//  A. `suspectCalls` returns [] whatever it is given            -> 5 RED
//  B. Read every signature as nameFirst                         -> 3 RED
//  C. Classify the signature from PARAMETER NAMES, not the body -> 1 RED
//  D. Count an invoked IIFE as a suspect too                    -> 2 RED
//  E. Read the source with comments left in                     -> 1 RED
//  F. Report a suspect with no `shape` field                    -> 3 RED
//
// C and E read 1 because each is owned by one assertion, and both are assertions nothing else can stand in
// for: C's decoy helper is the only one in the file whose parameter names lie, and E's fixture is the only
// commented-out call. Low counts are printed rather than argued away.
//
// *** AND TWO DEFECTS IN THIS ROUND'S OWN WORK WERE FOUND BY ITS OWN CHECKS RATHER THAN BY READING, WHICH IS
// THE FIRST TIME THAT HAS HAPPENED THIS SESSION. *** The record check in section 4 asks that every shape the
// record NAMES is a shape the detector can FIND, and it went red: a probe for `asyncIife` came back classified
// `arrowNotInvoked`, because the first version decided invoked-or-not by testing the tail against two hopeful
// regexes and `}()` matched neither. It is now decided by BALANCING the arrow body -- a few more lines that
// cannot be fooled by layout. And section 3 reported five suspects, ALL OF THEM IN THIS FILE: the fixtures
// were written as literal source, so they sit in code where the comment strip cannot reach, and the detector
// found itself. Every fixture is built by concatenation now, which is v4409's "a fixture is not a gate"
// arriving through a STRING and the second time this session -- v4478's synthetic shader carried a literal
// @compute and did the same to backendParity's census.
//
// ---- *** WHAT THIS GATE DOES NOT CLAIM *** --------------------------------------------------------------------
//
// That the three shapes are all of them -- `ok(name, helper())` where a named function returns a promise is
// invisible to a source-text reader, and so is anything computed into a variable first. That the 1,489 copies
// should be consolidated: this round measures, and the number is left for the round that wants to argue it.
// And that a gate whose signature came back `unknown` is wrong -- 16 did, and they are reported as unknown
// rather than assumed into whichever camp would have made the sweep tidier.

import {
    gateFiles, signatureOf, suspectCalls, census, reportLines, SIG, SHAPE,
    SHAPE_AT_V4480 as REC, ENG,
    maskStrings, firstArgOf, looksLikeCondition,
} from "./assertionShape.mjs";
import fs from "fs";
import path from "path";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);

console.log("assertionShape-selfcheck -- the helper 1,489 gates define and nothing owns\n");

// *** EVERY FIXTURE BELOW IS BUILT BY CONCATENATION, AND THE FIRST DRAFT WAS NOT. *** Written literally, the
// fixture strings ARE the thing this file hunts for -- they sit in code, not in comments, so the strip cannot
// reach them -- and section 3 duly reported five suspects, all of them in this file. A fixture that inflates
// the population it measures is v4409's rule ("a fixture is not a gate") arriving through a STRING, and it is
// the second time this session: v4478's synthetic shader carried a literal @compute and did the same to
// backendParity's census. render/backendParity.mjs has solved it since it was written, spelling its own
// markers "@" + "vertex", and this is that idiom.
const OK = "o" + "k";

// ---- 1. THE SIGNATURE IS READ FROM THE BODY, NOT FROM THE PARAMETER NAMES -------------------------------------
console.log("1. which parameter is the condition is settled by what the body branches on");

const NAME_FIRST = 'const ok = (n, c, d = "") => { if (!c) fails++; console.log(c ? "PASS" : "FAIL"); };';
const COND_FIRST = 'const ok = (c, m) => { if (c) pass++; else { fail++; console.error("FAIL " + m); } };';
const DECOY      = 'const ok = (cond, name) => { if (!name) fails++; console.log(name ? "PASS" : "FAIL"); };';

ok("!! a name-first helper is read as name-first", signatureOf(NAME_FIRST) === SIG.nameFirst);
ok("!! a condition-first helper is read as condition-first", signatureOf(COND_FIRST) === SIG.condFirst);
ok("!! and a helper whose PARAMETER NAMES lie is read by its body, not its labels",
    signatureOf(DECOY) === SIG.nameFirst,
    "sabotage C: `(cond, name)` branching on `name` is name-first however it is spelled -- a classifier " +
    "reading the labels would call this condition-first and mis-scan every call in the file");
ok("a file with no ok at all is 'none', not silently name-first",
    signatureOf("export const x = 1;\n") === SIG.none);

// ---- 2. *** EACH FINDER IS DRIVEN AGAINST A FIXTURE BUILT TO TRIP IT *** ---------------------------------------
console.log("\n2. the three shapes, each demonstrated before the tree is reported clean");

{
    const arrow = OK + '("a claim nobody checks", () => 1 === 2);';
    const f = suspectCalls(arrow);
    say(`fixture: ${arrow}`);
    ok("!! an arrow that is never invoked is caught, and named as such",
        f.length === 1 && f[0].shape === SHAPE.arrowNotInvoked,
        "a function object is truthy, so this prints PASS with 1 === 2 underneath it");
}
{
    const iife = OK + '("a claim behind a promise", async () => { return false; }());';
    const f = suspectCalls(iife);
    say(`fixture: ${iife}`);
    ok("!! an async IIFE is caught even though it IS invoked, because it returns a promise",
        f.length === 1 && f[0].shape === SHAPE.asyncIife,
        "this is the exact line v4479 shipped and removed -- invoked, and still always true");
}
{
    const swapped = OK + '("pasted from a name-first gate", value > 0);';
    const f = suspectCalls(swapped, SIG.condFirst);
    say(`fixture (condition-first file): ${swapped}`);
    ok("!! a string in the condition slot of a condition-first helper is caught",
        f.length === 1 && f[0].shape === SHAPE.stringAsCondition,
        "78 gates in this tree take the condition first; a line pasted from the other 1,403 always passes");
}
{
    // *** THE MIRROR, WHICH WAS MISSING FOR 1,637 FILES AGAINST 91 -- v4647e. ***
    // The row above catches the swap under condFirst. Under nameFirst, suspectCalls only ever looked for the
    // two ARROW shapes and ASSUMED the first argument was a name, so ok(cond, "name") printed "PASS true"
    // forever. The census read suspects: 0 while THREE shipped in one session, all in nameFirst files, all
    // mine -- the detector covered the smaller population by a factor of eighteen and its zero was read as an
    // all-clear.
    const swaps = [
        ['a regex .test in the name slot',            NAME_FIRST + '\nok(/a/.test(v) && /b/.test(v), "n", "d");'],
        ['a comparison in the name slot',             NAME_FIRST + '\nok(EXPECTED === "a" && EXPECTED !== "b", "n", "d");'],
        // *** THIS ONE WAS MISSED BY THE FIRST DRAFT AND IS WHY THE MASKER NOW KNOWS REGEX LITERALS. ***
        // The `\(` inside the pattern counted as an open paren, so the balancer never found the top-level
        // comma. Two of the three real swaps were caught and this was the third.
        ['a regex literal CONTAINING a paren',        NAME_FIRST + '\nok(!/scaled\\(/.test(q), "n", "d");'],
    ];
    for (const [label, src] of swaps) {
        const f = suspectCalls(src, SIG.nameFirst);
        ok("!! *** " + label + " is caught under nameFirst ***",
            f.length === 1 && f[0].shape === SHAPE.boolAsName,
            f.length ? f[0].text.slice(0, 70) : "NOT FOUND -- this is the shape that prints PASS true forever");
    }
    // The controls matter more than the catches here: this shape runs over 1,637 files, and a false positive
    // in a detector nobody can silence is worse than the hole it closed.
    const legit = [
        ['a correct row',                             NAME_FIRST + '\nok("a correct row", x === 1, "d");'],
        // glbConformance-selfcheck really writes this: a ternary CHOOSING A PREFIX, concatenated into a name.
        // It was the only survivor of the first tree-wide run and it is not a defect.
        ['a name BUILT by a ternary and concatenation', NAME_FIRST + '\nok((f ? "!! " : "  ") + code + " -- " + what, hit, "d");'],
        ['a division, which is not a regex',          NAME_FIRST + '\nok("n", a / b > 2, "d");'],
        // gateQuality-selfcheck PINS example calls as data. Four of the first run's six hits were this.
        ['an example call quoted as DATA',            NAME_FIRST + '\npinned("ok(\\"five knobs\\", Object.keys(K).length === 5)");'],
    ];
    // *** AND THE UNKNOWN-SIGNATURE GUARD IS DRIVEN, BECAUSE THE TREE NO LONGER EXERCISES IT. ***
    // Before signatureOf learned the `function ok(a, b)` form, ev/esFlight3dMath-selfcheck.mjs was UNKNOWN
    // and this shape reported every correct call in it as a swap. Fixing signatureOf removed the only live
    // example -- so removing the guard now goes 0 RED against the tree, and the property is a fixture.
    const UNREADABLE = 'const helper = makeOk();\nok(a === 1, "n");\nok(b !== 2, "n");';
    ok("!! *** an UNKNOWN signature yields NO suspects: a shape about WHICH SLOT cannot run without the order ***",
        signatureOf(UNREADABLE) === SIG.unknown && suspectCalls(UNREADABLE, SIG.unknown).length === 0,
        "guessing nameFirst there turns every correct condition-first call into a reported swap -- a flood, " +
        "in a detector running over sixteen hundred files");
    ok("  ...and the SAME source under a known condFirst order is still clean, so the guard is not hiding a catch",
        suspectCalls(UNREADABLE, SIG.condFirst).length === 0,
        "the calls are correct; it is only the ORDER that was unreadable");

    for (const [label, src] of legit) {
        ok("  CONTROL: " + label + " is NOT flagged",
            suspectCalls(src, SIG.nameFirst).length === 0,
            "a detector over 1,637 files earns its keep by what it leaves alone");
    }
}
{
    const good = [
        OK + '("a real check", 1 === 1);',
        OK + '("an invoked IIFE, which is the CORRECT idiom", (() => { return 1 === 1; })());',
        OK + '("an awaited call", await probe());',
    ].join("\n");
    const f = suspectCalls(good);
    say(`three correct forms, including the invoked-IIFE idiom this tree uses everywhere`);
    ok("!! and none of the correct forms is flagged",
        f.length === 0,
        "sabotage D: counting the invoked IIFE would flag hundreds of honest checks and make the sweep useless");
    ok("...so the finder distinguishes an arrow that runs from one that does not",
        suspectCalls(OK + '("x", () => true);').length === 1 && suspectCalls(OK + '("x", (() => true)());').length === 0);
}
ok("a suspect always carries its shape, so a reader knows what to fix",
    suspectCalls(OK + '("x", () => true);').every((s) => Object.values(SHAPE).includes(s.shape)),
    "sabotage F: 'there is a problem somewhere' is not a finding anybody can act on");
ok("comments are stripped before the scan, so a shape DESCRIBED is not a shape FOUND",
    suspectCalls('// ' + OK + '("described in prose", () => true);\n' + OK + '("real", 1 === 1);').length === 0,
    "sabotage E: this very file's header quotes all three shapes, so a scanner reading comments finds itself");

// ---- 3. WHAT THE TREE ACTUALLY SAYS ---------------------------------------------------------------------------
console.log("\n3. and only now, the sweep");

const c = census();
say(reportLines().join("\n  ----  "));
ok("!! no gate in the tree puts a non-boolean in the condition slot",
    c.suspects.length === 0,
    c.suspects.length ? c.suspects.map((s) => s.file + " " + s.shape).join("; ")
                      : `${c.gates} gates scanned, and section 2 is why this zero is a measurement`);
ok("!! the helper is defined per-gate and imported by nobody",
    c.definesOk > 1400 && c.importsOk === 0,
    `${c.definesOk} define their own, ${c.importsOk} import one -- so v4479's "belongs to whichever round owns ` +
    `the helper" had no referent`);
ok("both signatures are present, which is what makes the third shape possible at all",
    c.bySignature[SIG.condFirst] > 0 && c.bySignature[SIG.nameFirst] > 0,
    `nameFirst ${c.bySignature[SIG.nameFirst]}, condFirst ${c.bySignature[SIG.condFirst]}, ` +
    `unknown ${c.bySignature[SIG.unknown]} -- unknown is reported, not assigned`);
ok("the scan covers every gate the sweep does, by the same rule",
    c.gates === gateFiles(ENG).length && c.gates > 1400);
ok("every gate that calls ok either defines one or imports one",
    c.usesOk <= c.definesOk + c.importsOk + c.bySignature[SIG.unknown]);

// ---- 4. THE RECORD --------------------------------------------------------------------------------------------
console.log("\n4. the frozen record");

// *** v4487 -- THIS COMPARED FOUR OF THE RECORD'S NINE NUMBERS AND CALLED IT "the recorded census". ***
// `gates`, `usesOk`, `nameFirst`, `distinctDefinitions` and `unknownSignature` were re-taken BY HAND every
// round with nothing checking them: v4487's corruption sweep bumped `gates` by seven and this gate passed.
// It is the same defect vba/runtimeGap.mjs found in ITSELF at v4462 -- "ALL TWELVE ARE CHECKED, NOT THREE.
// The gate's first draft re-derived the census and then compared only files/threads/closures against it, so
// nine of these were decoration" -- shipped again here eighteen rounds later. The lesson did not travel.
// EVERY ROW IS COMPARED NOW, and each is named so a red says which one moved.
{
    const rows = [
        ["gates", REC.gates, c.gates],
        ["usesOk", REC.usesOk, c.usesOk],
        ["definesOk", REC.definesOk, c.definesOk],
        ["importsOk", REC.importsOk, c.importsOk],
        ["distinctDefinitions", REC.distinctDefinitions, c.distinctDefinitions],
        ["nameFirst", REC.nameFirst, c.bySignature[SIG.nameFirst]],
        ["condFirst", REC.condFirst, c.bySignature[SIG.condFirst]],
        ["unknownSignature", REC.unknownSignature, c.bySignature.unknown],
        ["suspects", REC.suspects, c.suspects.length],
    ];
    const drift = rows.filter(([, a, b]) => a !== b);
    ok("!! *** the recorded census is what the code reports now -- ALL NINE ROWS, not the four this compared ***",
        drift.length === 0,
        drift.length ? "DRIFTED: " + drift.map(([n, a, b]) => `${n} ${a} -> ${b}`).join(", ")
                     : `${rows.length} rows, every one re-derived. Five of them were decoration until v4487 ` +
                       "corrupted each field of every frozen record in the tree and asked what noticed");
}
ok("!! the three shapes written THIS SESSION are recorded with the text that shipped",
    REC.writtenThisSession.length === 3 &&
    REC.writtenThisSession.every((w) => Object.values(SHAPE).includes(w.shape) && /ok\(/.test(w.text)),
    "all three caught by reading and none by running, in a tree of 1,518 gates");
ok("...and each recorded shape is one this file can actually find", (() => {
    const probes = {
        arrowNotInvoked: OK + '("x", () => true);',
        asyncIife: OK + '("x", async () => { return true; }());',
        stringAsCondition: OK + '("x", y);',
    };
    return REC.writtenThisSession.every((w) => {
        const sig = w.shape === SHAPE.stringAsCondition ? SIG.condFirst : SIG.nameFirst;
        return suspectCalls(probes[w.shape], sig).some((s) => s.shape === w.shape);
    });
})(), "a record naming a shape the detector cannot find would be a claim about nothing");
ok("the record is frozen", Object.isFrozen(REC) && REC.writtenThisSession.every(Object.isFrozen));

// ---------------------------------------------------------------------------------------------------------
// THE THREE PARTS boolAsName IS BUILT OUT OF, GRADED APART (v4647q)
// ---------------------------------------------------------------------------------------------------------
// definitionGates counts an exported symbol no gate names, and maskStrings, firstArgOf and looksLikeCondition
// were on that list: NOTHING in the tree named them, not this gate and not any other. They were graded only
// THROUGH suspectCalls, which is the composition of all three -- so a fault in one could be cancelled by a
// second and the end-to-end row would stay green. Each is graded here on its own, against the cases the
// module's own comments record it getting WRONG, because those are the ones that actually happened.
{
    // maskStrings: offsets must survive, or every `at` this detector reports points at the wrong place.
    const src = 'ok(a === b, "a === b");';
    const m = maskStrings(src);
    ok("!! *** maskStrings replaces a string BODY with filler of the SAME LENGTH ***",
       m.length === src.length && m.indexOf('"') === src.indexOf('"'),
       `${m.length} against ${src.length}. Every at-offset suspectCalls reports is an index into the masked copy ` +
       `and is printed against the real source; a mask that changed a length would move every one of them`);
    ok("!! ...and the masked copy no longer contains the condition that was INSIDE the literal",
       !/a === b/.test(m.slice(src.indexOf('"'))) && /a === b/.test(m.slice(0, src.indexOf('"'))),
       `masked: ${m}. gateQuality-selfcheck PINS example calls as data, and the first tree-wide run counted ` +
       `four of those as real calls -- a census matching its own prose, the third time this tree met it`);
    // The regex case is the one that broke the balancer on the first real test, and it is not hypothetical.
    const rx = 'ok(!/scaled\\(/.test(q), "name");';
    const mrx = maskStrings(rx);
    ok("!! *** a REGEX literal is masked too, so an escaped paren inside a pattern cannot open a depth ***",
       mrx.length === rx.length && !/scaled/.test(mrx),
       `masked: ${mrx}. This exact call was MISSED: the \\( inside the pattern counted as an open paren, so ` +
       `firstArgOf never found the top-level comma. Two of my own three swaps were caught and this was the third`);
    ok("CONTROL: code outside any literal is returned untouched",
       maskStrings("const x = a + b;") === "const x = a + b;",
       "a masker that altered ordinary code would corrupt the thing being scanned");

    // firstArgOf: BALANCED, not pattern-matched -- layout must not decide a verdict.
    const open = (t) => t.indexOf("(");
    ok("!! *** firstArgOf balances to the top-level comma, through nested calls and commas ***",
       firstArgOf("ok(f(a, b) === c, \"n\")", open("ok(")) === "f(a, b) === c",
       `got ${JSON.stringify(firstArgOf("ok(f(a, b) === c, \"n\")", 2))} -- the comma inside f(a, b) is at ` +
       `depth 2 and is not the argument boundary. A regex to the first comma would cut this in half and ` +
       `hand looksLikeCondition the text "f(a"`);
    ok("...and a call with ONE argument yields that argument, up to its closing paren",
       firstArgOf("ok(done)", 2) === "done", "the boundary is whichever comes first, comma or close");
    ok("!! *** a call that never closes returns null rather than a truncated guess ***",
       firstArgOf("ok(a === b", 2) === null,
       "null is the one honest answer for text that does not parse; a partial slice would be graded as though " +
       "it were the whole argument");
    ok("...and a comma inside a STRING does not end the argument either",
       firstArgOf('ok("a, b" === c, "n")', 2) === '"a, b" === c',
       "firstArgOf skips a literal whole, so it is correct on raw source as well as on a masked copy");

    // looksLikeCondition: conservative on purpose, and the one survivor of the first tree-wide run is a NAME.
    ok("!! *** a comparison is a condition ***",
       ["a === b", "a !== b", "x <= 1", "a && b", "!ok", "s.includes(x)", "xs.every(f)"].every(looksLikeCondition),
       "these are the shapes that put a boolean in the name slot");
    // *** THE THIRD CASE HERE IS THE REAL CALL, AND MY FIRST DRAFT'S WAS A CONTROL THAT COULD NOT FAIL. ***
    // I first wrote `(cond ? "!! " : "   ") + code + " -- " + what`, which contains no comparison operator at
    // all -- so deleting the concatenation guard entirely (sabotage SA-3) left this row GREEN and only the
    // tree-wide scan went red. The text below is glbConformance-selfcheck:275 verbatim, which carries BOTH a
    // concatenation and `||` and `===`, so it is rescued by the guard and by nothing else.
    const builtName = '(code.startsWith("ACCESSOR_MIN") || code.startsWith("ACCESSOR_MAX") || ' +
                      'code === "ACCESSOR_INDEX_OOB" ? "!! " : "   ") + code + " -- " + what';
    ok("!! *** a string literal is a NAME, however it was assembled ***",
       !looksLikeCondition('"a name"') && !looksLikeCondition('`a ${x} name`') &&
       !looksLikeCondition(builtName),
       "the third is the ONLY survivor of the first tree-wide run -- glbConformance-selfcheck:275 builds a " +
       "name from a ternary CHOOSING A PREFIX, and the ternary's own test carries || and ===. It is not a " +
       "defect, and a detector that called it one would have made its own first result a false positive");
    ok("CONTROL: the same text WITHOUT the concatenation reads as a condition",
       looksLikeCondition('code.startsWith("ACCESSOR_MIN") || code === "ACCESSOR_INDEX_OOB"'),
       "without this the row above passes on a function that calls nothing a condition -- which is exactly " +
       "how my first draft of it passed under a sabotage that deleted the guard it was written to check");
    ok("CONTROL: empty and absent argument text is not a condition",
       !looksLikeCondition("") && !looksLikeCondition(null) && !looksLikeCondition(undefined),
       "firstArgOf returns null on text that does not parse, and null must not read as a finding");

    // And the composition still agrees with its parts, so grading them apart did not replace the end-to-end row.
    const swapped = "ok(a === b, \"a name\");";
    const found = suspectCalls(swapped, SIG.nameFirst);
    ok("!! *** the three compose: suspectCalls finds the swap its parts predict ***",
       found.some((f) => f.shape === SHAPE.boolAsName) &&
       looksLikeCondition(firstArgOf(maskStrings(swapped), swapped.indexOf("("))),
       `${found.length} found. Grading the parts apart is only worth anything if the whole still agrees with ` +
       `them -- otherwise this section is a second spelling of the detector rather than a check on it`);
}

console.log(`\nassertionShape-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
