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

ok("the recorded census is what the code reports now",
    REC.definesOk === c.definesOk && REC.importsOk === c.importsOk &&
    REC.condFirst === c.bySignature[SIG.condFirst] && REC.suspects === c.suspects.length);
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

console.log(`\nassertionShape-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
