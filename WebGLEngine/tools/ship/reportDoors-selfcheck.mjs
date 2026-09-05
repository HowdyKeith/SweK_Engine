// tools/ship/reportDoors-selfcheck.mjs -- v4459 -- the gate for the reportLines convention.
//
// *** THE LARGEST UNTESTED CONVENTION IN THE TREE, AND THE REASON IS A COST RATHER THAN AN OVERSIGHT. ***
// Seventy-eight modules export reportLines; server.html, instrument-bench.html, fleet-report.mjs and the
// fingerprint bridge consume it. Exercising it once costs about seven and a half minutes, so no gate ever
// has -- and a convention nothing exercises is a convention nobody has checked.
//
// WHAT THIS GATE DOES AND DELIBERATELY DOES NOT DO. It imports every member (free -- 0.0s each, measured) and
// checks the SHAPE of the convention on all of them. It calls a BOUNDED SAMPLE, because calling all of them
// is 71 seconds before the slow six and knobLiveness are even reached. The full sweep has a front door:
// `node tools/ship/reportDoors-selfcheck.mjs --all`, which is where the expensive measurement lives rather
// than in the 60-second suite. What is NOT claimed is that every member's report is correct -- only that it
// exists, arrives, and is a non-empty array of ASCII strings.
//
// ---- *** v4459 (SECOND ROUND) SABOTAGES: THE FRONT DOOR AND THE COST RECORD *** -----------------------------
//
//   O. the "never" row comes back into the printer              -> 2 RED
//   P. the summary calls one of them a manufactured finding     -> 1 RED
//   Q. doorKinds goes back to a flag that HAS NO EFFECT + 72.3s -> 1 RED
//   R. levelClaim, which DOES take a parameter, typed IMPOSSIBLE-> 1 RED
//   S. knobLiveness's UNMEASURED borrows a measured shape       -> *** 0 RED, THEN 3 RED AFTER THE REPAIR ***
//   T. a tolerant formatter loses its reason                    -> 1 RED
//   U. a MEASURED entry's line count is off by one              -> 2 RED
//   V. the cheap flag stops being a different question          -> 1 RED
//
// *** S IS THE ROUND. *** Section 8 checked that an unmeasured entry cannot wear the SHAPE of a measured one
// -- a flag and a finite number -- and a FABRICATED entry has that shape by construction, so promoting
// knobLiveness to `MEASURED, cheapFlag: "totalBudgetMs", cheapSeconds: 38.0` passed everything. That is
// v4458's 72.3 exactly: a number beside a claim, indistinguishable from a number taken with a clock, in the
// gate written to catch precisely that. Section 9 is the repair -- MEASURED entries are re-taken here, every
// run, from an argument the record carries -- and S now goes 3 RED.
//
// HONEST WEAKNESS IN V, LEFT IN PLACE: a wrong cheapArg makes this gate SLOW before it makes it red. V points
// orphanTriage's cheap call at `{ live: true }`, and section 9 pays the full 71 s and then fails on the line
// count. The clock assertion is the check; it is not a budget, and this gate has no way to abandon a call it
// has started.
//
// ---- *** v4459 SABOTAGES, RESULTS BY NAME *** ---------------------------------------------------------------
//
//   L. composeValidate reports a CONTENT field for no input   -> 1 RED
//   M. composeValidate stops varying with its input           -> 1 RED
//   N. curriculum stops defaulting its options                -> 1 RED
//
// *** AND THE FIRST RUN OF THESE THREE READ 1/0/0 BECAUSE THE HARNESS RESTORED THE WRONG FILES. *** It edited
// composeValidate.mjs and curriculum.mjs and then restored reportDoors.mjs, so L's sabotage was still in the
// tree when M and N were measured, and the BASELINE at the end was taken on a corrupted tree too. A control
// that damages what it measures reports zeros that look like unreachable branches -- which is exactly what
// this session has now chased four times, and this time the zero was the instrument rather than the code.
// The harness restores THE FILE IT EDITED now, and all three bite.

// ---- *** SABOTAGES, RESULTS BY NAME *** -------------------------------------------------------------------
//
//   A. classify by the SOURCE SIGNATURE instead of Function.length   -> 2 RED
//   B. drop a formatter from the registry                            -> 2 RED
//   G. move a tolerant formatter into the strict list                 -> 1 RED
//   H. the never-call list is emptied                                -> 0 RED, THEN 1 RED AFTER THE REPAIR
//      *** UNREACHABLE THE FIRST TIME: with the clean classifier knobLiveness falls outside the sample
//      anyway, so the list could be deleted and nothing here noticed -- while the only guard against a
//      future call site hanging went with it. And a hang is NOT a red. Fixed by checking the list as a
//      DECLARATION rather than by exercising it. Third instance of this shape in three rounds.
//   C. add a self-report to the formatter registry                   -> 1 RED
//   D. contractOf accepts an empty array                             -> 2 RED
//   E. contractOf stops checking for non-ASCII                       -> 1 RED
//   F. the no-gate list loses an entry                               -> 1 RED
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateComposition } from "./composeValidate.mjs";
import { overNonEmpty, emptyOfNonEmpty } from "./vacuity.mjs";
import { population, classify, contractOf, FORMATTERS, STRICT_FORMATTERS, TOLERANT_FORMATTERS, NEVER_CALL,
         RETURNS_BARE_BECAUSE, CHEAP_STATES, CHEAP_STATES_WITH_SECONDS,
         CALL_COST_V4459 as COST, NO_GATE_V4458 as NOGATE,
         reportLines as doorsReport } from "./reportDoors.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ALL = process.argv.includes("--all");

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);

console.log("reportDoors-selfcheck -- the front-door convention, counted and driven\n");

const rows = await classify(ENG);
const CALLED = [];                      // every module this gate calls, recorded so the guard below is real
const selfReports = rows.filter((r) => r.kind === "self-report");
const formatters = rows.filter((r) => r.kind === "formatter");

// ---- 1. THE POPULATION IS DERIVED, AND THIS FILE IS IN IT -----------------------------------------------
console.log("1. the population");
{
    say(`${rows.length} modules export reportLines; ${selfReports.length} self-reports, ${formatters.length} formatters, ` +
        `${rows.filter((r) => r.kind === "unimportable").length} unimportable`);
    ok("!! the population is derived from the tree, not listed in this file",
       rows.length > 60 && population(ENG).length === rows.length,
       `${rows.length} members found by walking. A convention counted by hand is a number that goes stale the ` +
       "first time somebody adds a module, which is the defect this tree has paid for most often");
    ok("!! ...and reportDoors.mjs is a member of the population it counts",
       rows.some((r) => r.rel === "tools/ship/reportDoors.mjs"),
       "the cheapest possible check that the convention it describes is one a module can actually satisfy. " +
       "Writing the census changed the population by one, and the census said so.");
    ok("every member imports",
       rows.every((r) => r.kind !== "unimportable"),
       "importing all " + rows.length + " is free -- the entire cost of this convention is in the CALL");
}

// ---- 2. *** READING THE SIGNATURE IS THE WRONG INSTRUMENT *** --------------------------------------------
console.log("\n2. what the source says against what a caller feels");
{
    const declared = rows.filter((r) => r.declaredParams > 0);
    say(`declare a parameter: ${declared.length}    REQUIRE one (Function.length): ${formatters.length}`);
    for (const r of declared.filter((x) => x.arity === 0).slice(0, 6))
        say(`  callable bare despite its signature: ${r.rel}  (${r.declared})`);
    ok("!! *** TWENTY DECLARE A PARAMETER AND ONLY SIX REQUIRE ONE ***",
       declared.length > formatters.length + 8 && formatters.length === FORMATTERS.length,
       `${declared.length} against ${formatters.length}. The other ${declared.length - formatters.length} have ` +
       "defaults -- `{ live = true } = {}`, `opts = {}`, `root = ROOT` -- so they are callable bare. A CENSUS " +
       "BUILT ON THE SOURCE TEXT WOULD HAVE MISCLASSIFIED FOURTEEN OF TWENTY, and Function.length answers the " +
       "question a consumer actually asks.");
}

// ---- 3. *** THREE INSTRUMENTS, THREE ANSWERS, AND ONLY THE LAST IS THE CONSUMER'S QUESTION *** -----------
console.log("\n3. the six that are a different kind of thing, and the two that are a third kind");
{
    ok("!! the registry names exactly the modules whose reportLines REQUIRES an argument",
       formatters.length === FORMATTERS.length && formatters.every((f) => FORMATTERS.includes(f.rel)),
       `${FORMATTERS.length} registered, ${formatters.length} measured, and they are the same set.`);

    // *** NEVER_CALL IS CONSULTED HERE TOO, AND SABOTAGING THIS ROUND'S OWN CLASSIFIER IS WHAT PUT IT HERE:
    // classify members by their SOURCE SIGNATURE and knobLiveness becomes a "formatter", this loop calls it,
    // and the gate HANGS rather than failing. A guard downstream of a classification cannot protect against a
    // defect in that classification. ***
    const refused = [], returned = [];
    for (const f of formatters) {
        if (NEVER_CALL.includes(f.rel)) { say(`NOT CALLED (never observed to return): ${f.rel}`); continue; }
        CALLED.push(f.rel);
        const mod = await import(pathToFileURL(path.join(ENG, f.rel)).href);
        try { const v = await mod.reportLines(); returned.push({ rel: f.rel, v }); } catch { refused.push(f.rel); }
    }
    say(`bare call: ${refused.length} refuse, ${returned.length} return a report anyway`);
    for (const r of returned) say(`  ${r.rel} returned ${r.v.length} lines -- first: ${JSON.stringify(r.v[0]).slice(0, 62)}`);
    ok("!! *** FOUR REFUSE AND TWO RETURN, AND Function.length CANNOT TELL THEM APART ***",
       refused.length === STRICT_FORMATTERS.length && refused.every((r) => STRICT_FORMATTERS.includes(r)) &&
       returned.length === TOLERANT_FORMATTERS.length && returned.every((r) => TOLERANT_FORMATTERS.includes(r.rel)),
       "the source text says 20 modules take a parameter, Function.length says 6 REQUIRE one, and CALLING says " +
       "4 refuse and 2 return. Three instruments, three answers, and the last is the only one a consumer feels.");

    // *** v4459 -- THE ROW THAT STOOD HERE SAID composeValidate "MANUFACTURES A FINDING", AND IT WAS WRONG.
    // *** It was written from the first line of the output. The second line names the cause -- "(root): not an
    // object -- a composition is { avatar, scene, pet, room, gauges, props }" -- and the report is exactly
    // right about what it was handed. A headline promoted to a property, in the round that had just made that
    // mistake twice about knobLiveness. What replaces it is the property that would make the old claim TRUE
    // if it ever became true: that the bare report names its own cause rather than inventing a content defect.
    const cv = returned.find((r) => r.rel === "tools/ship/composeValidate.mjs");
    const bare = validateComposition(), real = validateComposition({ avatar: null, scene: null, pet: null, room: null, gauges: null, props: null });
    say(`composeValidate with no argument: ${bare.problems.length} problem, field ${JSON.stringify(bare.problems[0].field)}; ` +
        `with an actual empty composition: ${real.problems.length}`);
    ok("!! *** THE BARE REPORT NAMES ITS OWN CAUSE, SO IT IS NOT A FABRICATED FINDING ***",
       cv && bare.problems.length === 1 && bare.problems[0].field === "(root)" &&
       /not an object/.test(bare.problems[0].why) && real.problems.length > bare.problems.length,
       `it reports ONE problem at "(root)" saying "not an object", and an actual empty composition reports ` +
       `${real.problems.length} -- so the count tracks the input rather than being a canned complaint. IF THIS ` +
       "EVER REPORTED A CONTENT PROBLEM FOR AN ABSENT COMPOSITION, THAT WOULD BE THE FABRICATION v4458 CLAIMED " +
       "AND THIS ROW WOULD CATCH IT.");

    // *** AND THE OTHER ONE RETURNS FOR A DIFFERENT REASON ENTIRELY, WHICH Function.length ALSO CANNOT SEE. ***
    const cur = await import(pathToFileURL(path.join(ENG, "tools/roundhouse/curriculum.mjs")).href);
    const bareC = await cur.reportLines(), emptyC = await cur.reportLines({});
    ok("!! curriculum's parameter is REQUIRED IN THE DECLARATION AND OPTIONAL IN FACT",
       JSON.stringify(bareC) === JSON.stringify(emptyC) && bareC.length > 1,
       `reportLines() and reportLines({}) return the identical ${bareC.length} lines, because propose() defaults ` +
       "every field one call deeper. Function.length reads the signature and cannot follow it there -- so the " +
       "two tolerant members are tolerant for two unrelated reasons, and neither is the one v4458 recorded.");
}

// ---- 4. THE CONTRACT, ON A BOUNDED SAMPLE BY DEFAULT AND ON EVERYTHING UNDER --all ------------------------
console.log("\n4. the contract: a non-empty array of ASCII strings");
{
    // *** THE PREDICATE IS DRIVEN ON FIXTURES BEFORE IT IS TRUSTED ON THE TREE. *** Every real member returns
    // a well-formed report, so contractOf's failure branches are UNREACHABLE from the population -- and an
    // unreachable branch is code nobody has run, which this session has now been bitten by twice. Fixtures
    // make each branch reachable, so breaking one goes red instead of going unnoticed.
    ok("contractOf accepts a well-formed report and names every way one can be malformed",
       contractOf(["a line"]) === null &&
       contractOf([]) === "empty" &&
       contractOf("not an array") === "not an array (string)" &&
       contractOf([1, 2]) === "not all strings" &&
       contractOf(["caf\u00e9"]) === "non-ASCII",
       "five fixtures, one per branch. The population exercises exactly one of them -- the passing one -- so " +
       "without these the other four could say anything at all.");

    const slow = new Set(COST.slow.map((s) => s.rel).concat(NEVER_CALL));   // both, always -- see NEVER_CALL
    const callable = selfReports.filter((r) => !slow.has(r.rel));
    const sample = ALL ? callable : callable.slice(0, 14);
    const broken = [];
    const t0 = Date.now();
    for (const r of sample) {
        CALLED.push(r.rel);
        const mod = await import(pathToFileURL(path.join(ENG, r.rel)).href);
        try {
            const v = await mod.reportLines();
            const why = contractOf(v);
            if (why) broken.push(r.rel + " :: " + why);
        } catch (e) { broken.push(r.rel + " :: threw " + e.message.slice(0, 40)); }
    }
    say(`called ${sample.length} of ${callable.length} callable self-reports in ${((Date.now() - t0) / 1000).toFixed(1)}s` +
        (ALL ? " (--all)" : " -- pass --all for every one, which costs 71s"));
    ok("!! every self-report called returns a non-empty array of ASCII strings",
       broken.length === 0,
       broken.length ? broken.join("; ") : `${sample.length} reports, ${sample.length} well-formed. THE SAMPLE IS ` +
       "BOUNDED AND SAYS SO: the whole convention costs about seven and a half minutes, which is the reason it " +
       "went unchecked, and hiding that cost inside a gate would just move the problem.");
}

// ---- 5. THE COST, FROZEN, AND THE ONE MEMBER THAT HAS NEVER BEEN SEEN TO RETURN ---------------------------
console.log("\n5. the cost, which is the reason this convention was never checked");
{
    ok("!! every module in the frozen cost table is still a member of the population",
       COST.slow.every((s) => rows.some((r) => r.rel === s.rel)),
       COST.slow.map((s) => s.rel.split("/").pop() + " " + s.bare + "s").join(", ") +
       ". A record that outlives its subject is a suppression, so the entries are checked against the tree " +
       "rather than trusted.");
    // *** THIS GUARD IS ASSERTED, NOT EXERCISED, AND THAT IS FORCED BY WHAT IT GUARDS. *** Emptying
    // NEVER_CALL went 0 RED the first time it was sabotaged: with the clean classifier knobLiveness falls
    // outside the sample anyway, so removing the list changed nothing HERE while removing the only thing
    // stopping a future call site from hanging. AND A HANG IS NOT A RED -- a gate that proved the module
    // hangs by hanging would take the suite down instead of reporting. So the list is checked as a
    // DECLARATION: non-empty, every entry a real member, every entry the kind of thing this gate would
    // otherwise call, and no entry in the set anything actually called.
    // v4459 -- overNonEmpty rather than `length > 0 && every(...)`: this is the guard whose sabotage went 0 RED,
    // and the helper exists so the empty case cannot be forgotten the next time somebody edits this line.
    ok("!! the never-call list is non-empty, real, and absent from everything this gate called",
       overNonEmpty(NEVER_CALL, (r) => rows.some((x) => x.rel === r && x.kind === "self-report")) &&
       overNonEmpty(NEVER_CALL, (r) => !CALLED.includes(r)),
       `${NEVER_CALL.length} entry: ${NEVER_CALL.join(", ")}, a zero-arity self-report that every walker of ` +
       `this convention will call, absent from all ${CALLED.length} modules this gate called. A call site that ` +
       "forgets the list fails here rather than hanging the suite.");
    // *** THIS ROW SAID "HAS NEVER BEEN OBSERVED TO RETURN", AND MEASURING THAT CLOSED IT LATER IN THE SAME ROUND. *** The
    // mechanism was a budget spent PER DEVICE across a 129-device registry: a worst case of forty-three
    // minutes with no budget on the census itself. knobLiveness has one now, reportLines() returns in 38.0s
    // covering 19 of 129 devices and saying which. It stays uncalled here FOR COST, which is a different
    // reason, and the record carries both.
    const kl = COST.slow.find((s) => s.rel === "tools/roundhouse/knobLiveness.mjs");
    ok("!! the member that never returned now does, and is still too expensive for a bounded sample",
       COST.doesNotFinish === null && kl && kl.bare > 30 && kl.was &&
       rows.some((r) => r.rel === "tools/roundhouse/knobLiveness.mjs" && r.kind === "self-report"),
       `38.0s where it used to run past 90 and be killed -- ${kl ? kl.was : "?"}. It is a zero-arity ` +
       "self-report, so every walker of this convention calls it; before v4458 every walker hung.");

    // *** THE CHEAP PATH THAT NOTHING RECORDED, AND IT IS NOT THE SAME REPORT. *** One fast call, and it
    // carries a number rather than an adjective.
    const mod = await import(pathToFileURL(path.join(ENG, "tools/ship/orphanTriage.mjs")).href);
    const t0 = Date.now();
    const dead = await mod.reportLines({ live: false });
    const ms = Date.now() - t0;
    const rec = COST.slow.find((s) => s.rel === "tools/ship/orphanTriage.mjs");
    say(`orphanTriage.reportLines({ live: false }): ${dead.length} lines in ${(ms / 1000).toFixed(2)}s, against ` +
        `${rec.linesBare} lines in ${rec.bare}s bare`);
    ok("!! *** THE CHEAP CALL IS FAST AND IS A DIFFERENT REPORT -- BOTH HALVES MEASURED ***",
       ms < 3000 && dead.length === rec.linesCheap && rec.linesCheap < rec.linesBare,
       `${rec.bare}s and ${rec.linesBare} lines becomes ${(ms / 1000).toFixed(2)}s and ${dead.length}. THE FLAG IS ` +
       "NOT A PERFORMANCE SWITCH, IT IS A DIFFERENT QUESTION -- and doorKinds takes no parameter at all, so " +
       "'pass live:false' is not general advice, it is not even possible there. Nothing recorded which " +
       "members have a cheap path until v4458, and v4458 recorded a flag for a function with nowhere to " +
       "put one.");
}

// ---- 6. THE PROVIDERS WITH NO GATE OF THEIR OWN -----------------------------------------------------------
console.log("\n6. who provides the convention and cannot check it");
{
    const noGate = rows.filter((r) => !r.hasGate).map((r) => r.rel).sort();
    say(`no sibling gate: ${noGate.join(", ") || "(none)"}`);
    ok("!! the modules providing this convention with no gate of their own are named, not counted",
       noGate.length === NOGATE.length && noGate.every((r) => NOGATE.includes(r)),
       `${noGate.length} of ${rows.length}. They are LISTED so that adding a member without a gate fails here ` +
       "rather than passing quietly under a number that moved by one.");
}

// ---- 7. *** THE FRONT DOOR IS THE LAST COPY CORRECTED AND THE ONLY COPY ANYBODY RUNS *** -------------------
//
// Every check above this line grades a RECORD. Nothing graded the print statement that publishes those
// records, and two retired claims were shipping through it at v4458:
//
//   "one of them a manufactured finding"     retired in this module's header, the changelog, main.js and
//                                            brain.js one round earlier. FOUR copies of the prose corrected,
//                                            and the print statement -- the fifth copy, and the only
//                                            executable one -- left saying the withdrawn thing.
//   "knobLiveness ... never"                 a hand-typed eighth row, printed UNDERNEATH the seventh row the
//                                            cost table derives at 38.0s, sixty lines below the paragraph
//                                            explaining that "never returns" was an observation at ninety
//                                            seconds promoted to a property.
//
// *** A DUPLICATE AND A WITHDRAWN CLAIM, IN THE FRONT DOOR OF THE MODULE WHOSE SUBJECT IS FRONT DOORS. ***
// So this section grades the OUTPUT against the records, structurally where it can and by string where it
// must, and the string half says so.
console.log("\n7. the front door against the records it prints");
{
    const out = doorsReport();
    const joined = out.join("\n");
    const rowRe = /^ {4}(\S+\.mjs)\s/;
    const printedRows = out.map((l) => (rowRe.exec(l) || [])[1]).filter(Boolean);

    // (a) STRUCTURAL, AND IT IS THE ONE THAT CATCHES THE DUPLICATE. A name printed twice in the cost block
    // is a printer disagreeing with its table, whatever the second row says.
    const costRows = printedRows.filter((r) => COST.slow.some((s) => s.rel === r));
    const costSet = new Set(costRows);
    ok("!! *** THE COST BLOCK PRINTS EACH MEMBER ONCE AND PRINTS EXACTLY THE TABLE ***",
       costRows.length === COST.slow.length && costSet.size === costRows.length &&
       COST.slow.every((s) => costSet.has(s.rel)),
       `${costRows.length} rows for ${COST.slow.length} entries, ${costSet.size} distinct. v4458 printed ` +
       "EIGHT rows for seven entries -- knobLiveness at 38.0 from the table and knobLiveness at 'never' from " +
       "a literal. The loop types no member name of its own now, so the second row cannot come back.");

    // (b) Nothing is named in the output that is not a real member. A printer that outlives its subject
    // reports on a module that is gone.
    const members = new Set(rows.map((r) => r.rel));
    const strays = printedRows.filter((r) => !members.has(r));
    ok("!! every module named in the front door is a live member of the population",
       strays.length === 0 && !emptyOfNonEmpty(printedRows, out),
       `${printedRows.length} names printed, ${strays.length} of them stale` +
       (strays.length ? ": " + strays.join(", ") : "") + ".");

    // (c) *** THE RETIRED CLAIMS, BY STRING, AND THE FLOOR IS STATED. *** This cannot see a claim rephrased,
    // only these two exact withdrawals -- which is worth having anyway, because both of them survived a
    // correction round that touched four other copies. A structural check would need the printer to know
    // which of its words were once wrong, and words do not carry that.
    const retired = [
        { re: /manufactur/i, was: 'v4458: "one of them a manufactured finding" -- composeValidate reports its own cause and its count varies with input' },
        { re: /\bnever\b/i, was: 'v4458: knobLiveness printed as "never" -- it returns in 38.0s with the census budget, and in 989.8s without' },
    ];
    const alive = retired.filter((r) => r.re.test(joined));
    ok("!! *** NO CLAIM THIS MODULE HAS WITHDRAWN IS STILL COMING OUT OF ITS FRONT DOOR ***",
       alive.length === 0,
       alive.length ? "STILL SHIPPING: " + alive.map((a) => a.was).join(" | ")
                    : "both v4458 phrases gone from the output. Floor said plainly: this is a match on two " +
                      "exact words, so a retired claim REPHRASED passes here. It is the check that would " +
                      "have caught the two that actually happened.");

    // (d) The reason each tolerant formatter returns is DATA, so the summary sentence cannot be corrected in
    // the prose and shipped from the print statement -- which is precisely what happened to it.
    const keys = Object.keys(RETURNS_BARE_BECAUSE).sort();
    ok("!! every tolerant formatter carries its own reason, and nothing else does",
       keys.length === TOLERANT_FORMATTERS.length &&
       overNonEmpty(TOLERANT_FORMATTERS, (f) => typeof RETURNS_BARE_BECAUSE[f] === "string" &&
                                                RETURNS_BARE_BECAUSE[f].length > 20 &&
                                                joined.includes(RETURNS_BARE_BECAUSE[f])),
       `${keys.length} reasons for ${TOLERANT_FORMATTERS.length} tolerant formatters, each printed verbatim. ` +
       "The adjective in the summary line is gone: the line says NEITHER fabricates and then shows why each " +
       "returns, from the map.");
}

// ---- 8. *** THE CHEAP-PATH STATE, DERIVED FROM THE LIVE SIGNATURES RATHER THAN TYPED *** -------------------
//
// v4458 wrote `cheapFlag: null` on three entries that had never been measured, beside a doorKinds entry
// carrying a flag, a verdict and a number. Two states wearing one label, inside a record presented as fact.
//
// *** AND THIS SECTION FAILED ON ITS FIRST RUN AND CORRECTED THE ROUND THAT WROTE IT. *** All four are
// `export [async] function reportLines()` with NO PARAMETER. The three nulls were accidentally right --
// accidentally right is not a measurement -- and the FOURTH, the only one that looked measured, was the
// worst: `{ live: false } -- HAS NO EFFECT` names a flag that has nowhere to go, and its 71.0 s and 72.3 s
// are the bare call timed twice, 1.3 s apart. *** A NUMBER BESIDE A CLAIM MADE THE CLAIM LOOK MEASURED. ***
// The state is derived from the live signature here, in both directions, which is what caught it.
console.log("\n8. the cheap-path column, and no entry may sit in an unmeasured state without saying so");
{
    const decl = new Map(rows.map((r) => [r.rel, r.declaredParams]));
    const bad = COST.slow.filter((s) => !CHEAP_STATES.includes(s.cheap));
    ok("!! every entry declares one of the four states and none is null",
       bad.length === 0 && COST.slow.length > 0,
       `${COST.slow.length} entries over ${CHEAP_STATES.join(" / ")}` +
       (bad.length ? "; BAD: " + bad.map((b) => b.rel + "=" + String(b.cheap)).join(", ") : "") + ".");

    // *** BOTH DIRECTIONS. *** One direction lets IMPOSSIBLE be typed onto a member that does take a
    // parameter; the other lets a member with no parameter be recorded as merely UNMEASURED, which is the
    // state v4458 was in and could not express.
    const wrongImp = COST.slow.filter((s) => s.cheap === "IMPOSSIBLE" && decl.get(s.rel) !== 0);
    const wrongPos = COST.slow.filter((s) => s.cheap !== "IMPOSSIBLE" && decl.get(s.rel) === 0);
    say("declared parameters: " + COST.slow.map((s) => s.rel.split("/").pop() + "=" + decl.get(s.rel)).join(", "));
    ok("!! *** IMPOSSIBLE MEANS `reportLines()` TAKES NO PARAMETER, DERIVED FROM THE TREE, BOTH WAYS ***",
       wrongImp.length === 0 && wrongPos.length === 0 &&
       COST.slow.some((s) => s.cheap === "IMPOSSIBLE"),
       `${COST.slow.filter((s) => s.cheap === "IMPOSSIBLE").length} entries take no parameter and say so; ` +
       `${COST.slow.filter((s) => s.cheap !== "IMPOSSIBLE").length} take one and do not` +
       (wrongImp.length ? "; TYPED WRONG: " + wrongImp.map((b) => b.rel).join(", ") : "") +
       (wrongPos.length ? "; MISSING: " + wrongPos.map((b) => b.rel).join(", ") : "") +
       ". The state is a claim about the source, so the source answers it.");

    const needSecs = COST.slow.filter((s) => CHEAP_STATES_WITH_SECONDS.includes(s.cheap));
    const missing = needSecs.filter((s) => !s.cheapFlag || typeof s.cheapSeconds !== "number" ||
                                           !Number.isFinite(s.cheapSeconds));
    const overclaim = COST.slow.filter((s) => !CHEAP_STATES_WITH_SECONDS.includes(s.cheap) &&
                                              s.cheapSeconds !== undefined);
    ok("!! *** MEASURED AND NONE CARRY SECONDS; IMPOSSIBLE AND UNMEASURED CARRY NONE ***",
       missing.length === 0 && overclaim.length === 0 && needSecs.length > 0,
       `${needSecs.length} measured entries all carry a flag and a number` +
       (missing.length ? "; UNBACKED: " + missing.map((b) => b.rel).join(", ") : "") +
       (overclaim.length ? "; SECONDS WITHOUT A MEASUREMENT: " + overclaim.map((b) => b.rel).join(", ") : "") +
       ". An unmeasured entry cannot borrow the shape of a measured one, which is the whole reason the null " +
       "read as a fact.");

    const un = COST.slow.filter((s) => s.cheap === "UNMEASURED");
    say(`UNMEASURED: ${un.map((s) => s.rel).join(", ") || "(none)"} -- the state v4458's shape could not hold`);
}

// ---- 9. *** MEASURED IS RE-TAKEN HERE, BECAUSE THE CHECKS ABOVE CANNOT TELL A CLOCK FROM A KEYBOARD *** ----
//
// Sabotage S moved knobLiveness from UNMEASURED to `MEASURED, cheapFlag: "totalBudgetMs", cheapSeconds: 38.0`
// and went 0 RED. Section 8 asks whether a MEASURED entry has the SHAPE of a measurement -- a flag and a
// finite number -- and a fabricated entry has that shape by construction. *** THAT IS v4458's 72.3 EXACTLY:
// A NUMBER BESIDE A CLAIM, INDISTINGUISHABLE FROM A NUMBER TAKEN WITH A CLOCK. *** Building a control out of
// the defect it controls for is the third time this session; this one was caught by its own sabotage.
//
// So MEASURED stops being a claim. The record carries the ARGUMENT, this gate applies it, times it and
// compares the line counts, every run. Both cheap calls cost 0.0s, so the whole verification is free -- and
// that is not a coincidence: an entry whose cheap path is too expensive for this gate to take is an entry
// nobody has verified, which is UNMEASURED with a number attached. NEVER_CALL members cannot be MEASURED.
console.log("\n9. the MEASURED entries, re-measured");
{
    const claimed = COST.slow.filter((s) => s.cheap === "MEASURED");
    ok("!! no member of the never-call list claims a cheap path this gate could not have taken",
       overNonEmpty(claimed, (s) => !NEVER_CALL.includes(s.rel)),
       `${claimed.length} MEASURED entries, none of them on the ${NEVER_CALL.length}-entry never-call list. ` +
       "A cheap path nobody can afford to exercise is a claim, not a measurement -- which is the state " +
       "sabotage S constructed and this row refuses.");

    const shaped = claimed.filter((s) => s.cheapArg && typeof s.cheapArg === "object" &&
                                         typeof s.linesBare === "number" && typeof s.linesCheap === "number");
    ok("!! every MEASURED entry carries the ARGUMENT ITSELF, not a sentence describing one",
       shaped.length === claimed.length && claimed.length > 0,
       `${shaped.length} of ${claimed.length} carry cheapArg and both line counts. cheapFlag is for the ` +
       "reader; cheapArg is what makes the claim executable, and an entry without one cannot be re-taken.");

    const taken = [];
    for (const s of claimed) {
        if (!s.cheapArg || NEVER_CALL.includes(s.rel)) continue;
        const m = await import(pathToFileURL(path.join(ENG, s.rel)).href);
        const t0 = Date.now();
        const lines = await m.reportLines(s.cheapArg);
        taken.push({ rel: s.rel, ms: Date.now() - t0, n: lines.length, rec: s });
    }
    for (const t of taken) {
        say(`${t.rel}  ${t.rec.cheapFlag} -> ${t.n} lines in ${(t.ms / 1000).toFixed(2)}s ` +
            `(record: ${t.rec.linesCheap} lines, ${t.rec.cheapSeconds}s, against ${t.rec.linesBare} bare)`);
    }
    ok("!! *** EVERY MEASURED CHEAP PATH IS TAKEN IN THIS RUN AND MATCHES THE RECORD ***",
       taken.length === claimed.length && !emptyOfNonEmpty(taken, claimed) &&
       overNonEmpty(taken, (t) => t.ms < 3000 && t.rec.cheapSeconds < 3.0 &&
                                  t.n === t.rec.linesCheap && t.rec.linesCheap < t.rec.linesBare),
       `${taken.length} of ${claimed.length} re-taken, worst ` +
       `${(Math.max(0, ...taken.map((t) => t.ms)) / 1000).toFixed(2)}s. The line count is checked as well as ` +
       "the clock, because a flag that returns fast and returns THE SAME REPORT is a performance switch and " +
       "not the different question this record says it is.");
}

console.log(`\nreportDoors-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
