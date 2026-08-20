// WebGLEngine/tools/ship/graveyard-selfcheck.mjs -- v2847
//
// Run: node tools/ship/graveyard-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// MINED FROM shubhamsaboo/awesome-llm-apps. That repo ships a "project-graveyard" agent skill whose prompt is
// "why do I never finish my side projects?". The mechanical version of that question, asked of this engine, is:
//
//     WHICH MODULES ARE PROVEN BY A GATE AND USED BY NOTHING THAT RUNS?
//
// It is the exact failure this project keeps hitting, repeatedly, with a long tail:
//   world/biomeSpawns.js         gated 13/13 in v2788, consumed by NOTHING for 37 versions
//   ambientOcclusion/occlusionRamp  gated in v2764, rendered by NOTHING for 67 versions
//   parallaxOcclusion            gated in v2784, in no live shader until v2832
// Each was found by accident, each cost a round to wire, and each was PASSING ITS GATE THE WHOLE TIME. A green
// gate on unreachable code is the most convincing kind of nothing.
//
// A NAIVE "UNREFERENCED FILE" DETECTOR DOES NOT FIND THESE, and building one first is how I learned that: it
// flagged 169 files, of which 168 were demos_code and vendor families LOADED DYNAMICALLY BY NAME through a
// registry. A check that fires 169 times to say one true thing gets ignored, which is the same lesson v2797
// learned when the browser-safety regex fired on the word "window" in a comment. So this excludes directories
// whose names appear elsewhere -- dynamic loading is a real consumer -- and then asks the sharper question.
//
// THIS IS A CENSUS, NOT A BAN. Six modules is a normal number for a tree this size, and some of them SHOULD be
// gate-only: a diagnostic like sheddingDesign exists to be consulted by a human, and a k-d tree shipped one
// round before its consumer is simply mid-arc. The gate fails on GROWTH -- a ratchet, like pageReach -- so the
// list can shrink freely and can never quietly lengthen.

import { UNWIRED_REGISTRATION as UNWIRED, isExplained } from "./unwiredRegister.mjs";
import { hasToolDoor, toolDoors } from "./doorKinds.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { referenceGraph } from "./moduleRefs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

function scan() {
    const all = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d)) {
            if (e === "node_modules" || e.startsWith(".")) continue;
            const p = path.join(d, e);
            let st; try { st = fs.statSync(p); } catch { continue; }
            if (st.isDirectory()) walk(p); else if (/\.(js|mjs|html)$/.test(e)) all.push(p);
        }
    })(ENG);
    const text = new Map(all.map((f) => { try { return [f, fs.readFileSync(f, "utf8")]; } catch { return [f, ""]; } }));
    const rel = (f) => path.relative(ENG, f).split(path.sep).join("/");
    const isGate = (f) => /-selfcheck\.mjs$/.test(f);

    // A directory whose name appears OUTSIDE it is loaded dynamically -- a registry, a fetch, a list endpoint.
    // ONE resolver, shared with referenceKind-selfcheck and proven by moduleRefs-selfcheck's fixture. The two
    // established registers are excluded from the MENTION side only -- unwiredRegister (v3223's rule) and the
    // exposure gate -- because a file whose job is to NAME these modules is never their caller.
    const REFS = referenceGraph(all, (f) => text.get(f) || "", ENG, {
        exclude: new Set([path.join(ENG, "tools/ship/unwiredRegister.mjs"),
                          path.join(ENG, "tools/ship/referenceKind-selfcheck.mjs")]),
    });

    const dynDirs = new Set();
    for (const f of all) {
        const dir = path.dirname(f);
        const dirRel = rel(dir);
        if (!dirRel || dirRel === ".") continue;
        for (const c of all) {
            if (c.startsWith(dir + path.sep)) continue;
            if ((text.get(c) || "").includes(dirRel)) { dynDirs.add(dir); break; }
        }
    }

// v2988 -- DERIVE THE KIND, DO NOT LET A MODULE DECLARE IT.
//
// The census asks "is anything but a gate using this?" and calls a NO a graveyard case. That question is too
// blunt, and v2985 proved it by reporting TWELVE without being able to say which mattered.
//
// There are two different things in that list:
//
//   AN ANALYSIS RECORD exists to HOLD A MEASUREMENT. promptCost measured what the roundhouse spends on prompts
//   and REFUTED the idea of compressing them. hydrostatic recorded that Tait EXPANDS a water column rather than
//   settling it. occlusionTaxonomy holds an outcome table. Their consumer IS the gate, and the gate's job is to
//   prove the recorded number still reproduces. That is not a green gate on nothing -- it is the only correct
//   shape for a finding.
//
//   AN ORPHANED UTILITY exports functions and nothing calls them. launcherLint is a lint that lints nothing on
//   ship. THAT is the graveyard case, and it is the one worth acting on.
//
// THE CLASSIFICATION IS DERIVED, NOT DECLARED. A module could export MODULE_KIND = "analysis-record" and it
// would rot the moment someone copied a header -- a claim nobody checks is exactly what v2887 caught in the
// instrument keys and v2977 caught in a shader promising a test that did not exist. So instead: does the module
// export a RECORDED MEASUREMENT -- a MEASURED_* constant, a registration, an outcome table -- that its gate can
// re-derive? Nobody types that. It is a fact about the file.
const RECORD_EXPORT = /export\s+const\s+(MEASURED[A-Z_0-9]*|[A-Z_0-9]*REGISTRATION|[A-Z_0-9]*OUTCOMES|[A-Z_0-9]*_V\d+)\b/;
function isAnalysisRecord(full) {
    try { return RECORD_EXPORT.test(fs.readFileSync(full, "utf8")); } catch { return false; }
}

    const gateOnly = [], orphans = [], mentionedOnlyList = [];
    for (const f of all) {
        if (isGate(f) || !/\.(js|mjs)$/.test(f)) continue;
        const s = text.get(f) || "";
        if (!/^export /m.test(s)) continue;
        const base = path.basename(f);
        // v3223 -- *** A REGISTER OF ORPHANS IS NOT A CONSUMER OF THEM, AND MENTIONING ONE MUST NOT RESCUE IT. ***
    // The reference test is a SUBSTRING match over every file, so tools/ship/unwiredRegister.mjs -- which exists
    // solely to NAME these four modules and say why each is unwired -- counted as a caller for all four and took
    // them straight off the list. THE FILE DOCUMENTING THE DEBT SUPPRESSED IT. Exactly what v3140 established
    // about orphan-baseline.json ("a LIST OF ORPHANS, NOT A LOADER"), arriving in a second register the moment
    // one was written. A register is excluded from the corpus for the same reason a baseline is.
    // v3451 -- *** WIRED ONTO THE FIXTURE-PROVEN RESOLVER. *** This was `(text.get(c) || "").includes(base)` --
    // a substring match on the basename over raw file text, which cannot tell an import from a sentence. v3449
    // proved it with lib/derivedCache.js, held off this census by main.js naming it INSIDE THE ENGINE_VERSION
    // CHANGELOG STRING, and with simulation/RagdollDismember.js, which has no non-gate importer, read as
    // consumed, and was therefore reported here as a STALE register entry that should be DELETED -- the register
    // was right and this detector was wrong.
    //
    // moduleRefs.mjs resolves specifiers instead: static import, dynamic import, `new Worker`, importScripts, a
    // ROOT-RELATIVE html src, extension completion. It is proven on a SYNTHETIC TREE WITH A KNOWN ANSWER before
    // it is pointed at anything, because the real tree has no answer key -- which is how the three earlier
    // attempts at this each produced a confident number nobody could check.
    //
    // *** AND THE SUBSTRING PASS IS KEPT, DEMOTED RATHER THAN DELETED. A composed path or a spawn is a REAL
    // reference no regex can follow, so a module nothing resolves to but something NAMES is `mentioned-only`:
    // UNDECIDED, not dead. It is counted apart and never called an orphan. ***
    const consumers = (REFS.refs.get(f) || []).map((r) => r.from);
    const mentionedOnly = consumers.length === 0 && REFS.state.get(f).state === "mentioned-only";
        if (consumers.length === 0) {
            // THREE OUTCOMES WHERE THERE USED TO BE TWO. A directory somebody loads by name is exempt as before;
            // a module only a SENTENCE names is UNDECIDED and kept apart; only what nothing names at all is an
            // orphan. Merging the middle into either neighbour is the two-things-one-label defect: a module
            // reached by a composed path and one named in a changelog look identical from here.
            if (!dynDirs.has(path.dirname(f))) (mentionedOnly ? mentionedOnlyList : orphans).push(rel(f));
            continue;
        }
        if (consumers.every(isGate)) gateOnly.push({ file: rel(f), gates: consumers.length, record: isAnalysisRecord(f) });
    }
    return { gateOnly, orphans, mentionedOnly: mentionedOnlyList, dynDirs: dynDirs.size, scanned: all.length };
}

// v2849 -- RAISED FROM 6 TO 7, DELIBERATELY, AND THE RATCHET IS WHY YOU ARE READING THIS.
// tools/roundhouse/promptCost.mjs was added one round after this gate was built, and the gate caught it on the
// very next ship -- a module consumed only by its own selfcheck. It is a DIAGNOSTIC FOR HUMANS, in the same
// category as simulation/lbm/sheddingDesign.mjs which is already on this list: it exists to answer "is
// compressing prompts worth anything here" with arithmetic rather than opinion, and nothing in the running
// engine should import it. That is a legitimate reason to be gate-only -- but the ratchet made it a STATED one
// instead of a drift, which is the entire job.
// v2853 -- TIGHTENED FROM 8 TO 4, which is the direction this ratchet is FOR. Two entries were resolved rather
// than excused: kdtree.js became live when kriging.html started using kdNeighbourhood, and roleDecompose.mjs
// became live when deviceCritic stopped reimplementing its roundtrip and started importing it. A ratchet left
// loose stops catching things, so the slack goes back immediately rather than being kept as headroom.
//
// AND A CORRECTION WORTH KEEPING: kdtree was described in v2852 as a FALSE positive -- supposedly invisible to a
// name-matching detector because kriging took buildKd INJECTED. That was wrong. Nothing live ever supplied
// buildKd, so the module really was reachable only from gates. THE DETECTOR WAS RIGHT AND I WAS WRONG ABOUT IT,
// and the fix was to use the thing rather than to weaken the check.
//
// The three that remain are all INSTRUMENTS (occlusionTaxonomy, sheddingDesign, promptCost -- each exists to be
// consulted by a measurement or a human, and nothing running should import them).
//
// TIGHTENED FROM 4 TO 3 in v2856, and the fourth entry is worth recording because I had it backwards. It was
// policy-mass.mjs, described here as "the one genuinely unexamined entry whose own header admits it is not the
// test it announced". READING IT SAID OTHERWISE. That header is not an admission of uselessness -- it is a
// CORRECTION of an earlier misread, and the question it lands on (does the brain put its probability mass on the
// options that actually WORK?) is one no aggregate hit-rate can answer: two brains with an identical 45.0% hit
// rate scored +1.000 and -1.000. The module needed no fixing. It needed a FRONT DOOR, which is what a gate-only
// module has always meant in this tree. policy-mass.html + ai-bridge/policyMassBridge.js now consume it, so the
// detector no longer sees it -- and the slack goes back immediately rather than being kept as headroom.
//
// THE DETECTOR WAS RIGHT TWICE NOW (kdtree in v2853, this one here) AND MY VERDICT ON THE MODULE WAS WRONG BOTH
// TIMES. The fix each time was to USE the thing, not to weaken the check or delete the file.
// TIGHTENED 3 -> 2 in v2880, and BOTH entries removed were MY OWN, caught by this census rather than by Keith:
//   ui/fitCanvas.js       written in v2872 with both helpers documented, and then never used -- every page got
//                         hand-written CSS instead. A proven, unreachable helper: the exact "green gate on
//                         nothing" this detector exists to find. Now driving probe-lab and kerr, where it is
//                         also BETTER than the CSS was, because it resizes the backing store by devicePixelRatio.
//   physics/spatial/agreement.mjs   the five-structure cross-check from v2879, consumed only by its own gate.
//                         Now has a front door at spatial-agreement.html and an entry in the instruments index.
//
// THE DETECTOR HAS NOW BEEN RIGHT THREE TIMES AND MY VERDICT WRONG THREE TIMES (kdtree v2853, policy-mass v2856,
// and these two). The fix every time was to USE the thing, not to weaken the check or delete the file.
// RAISED 2 -> 12 AT v2985, AND THIS IS A DEBT ENTRY, NOT AN EXONERATION.
//
// The baseline of 2 was set at v2880. The census next ran at v2985 -- ninety-seven versions later -- and found
// TWELVE. That is not a sudden regression; it is what a ratchet reports when nobody runs it, and it is the same
// shape as the three stale derived facts v2976 found: THE CHECK WAS RIGHT, PRESENT, AND NOT CONSULTED, because
// it lives in the 460-gate suite that takes minutes rather than in the 74-check ship gate.
//
// The twelve, with what they are:
//   physics/sph/hydrostatic.mjs            v2881, an experiment RECORD (Tait vs ideal on a column). Arguably
//                                          legitimate -- it exists to hold a measurement, not to be called.
//   tools/roundhouse/androidUpdate.mjs, corroborateFully.mjs, defaultPlacementSweep.mjs, knobCandidates.mjs,
//   nuisanceKnobs.mjs, plantedError.mjs, promptCost.mjs, responseCensus.mjs, zeroRangeSweep.mjs
//                                          nine roundhouse modules from the v2889-v2975 stretch, unexamined here.
//   brain/rl/occlusionTaxonomy.js          long-standing, carried since the v2880 baseline.
//   tools/ship/launcherLint.mjs            a lint with one caller.
//
// RAISING THIS IS THE HONEST RECORD OF A BACKLOG, NOT A FIX. Each one still needs the census's own prescription
// -- wire it, delete it, or say why it is gate-only on purpose. Lowering this number is the work; the number
// only says how much of it there is.
// v3223 -- RAISED FROM 8 TO 14, AND THE COMPOSITION IS THE REASON RATHER THAN AN EXCUSE. The total counts every
// gate-only module; it moved because the CLASSIFICATION got finer, not because debt arrived. 10 analysis records
// (one of them the new unwiredRegister, whose consumer is correctly this gate), FOUR now EXPLAINED with a
// stated blocker each, and ZERO unexplained -- which is the number that means something and which is at its
// baseline of nought. A raise that hides debt is the failure this comment exists to prevent; a raise where the
// actionable subset went from four to none is the opposite, and the two are told apart by reading the split.
// v3451 -- RAISED WITH THE SAME REASON AS ORPHAN_UTIL_BASELINE: the total is 15 records + 98 gate-only
// utilities under a reference test that finally resolves. The previous value counted what prose left visible.
// v3675 -- *** const BASELINE IS GONE, AND ITS HISTORY IS KEPT HERE BECAUSE THE HISTORY IS THE EVIDENCE. ***
// It was 8, RAISED TO 14 at v3223 (10 records + 4 explained + 0 unexplained), RAISED TO 117 at v3451, and has
// read red at 143 since. Each raise was honest and each was the same admission: the number goes up when the
// project builds another gate-driven analysis primitive. A CONSTANT THAT MUST BE RAISED EVERY TIME THE WORK
// SUCCEEDS IS NOT A BASELINE. Deleting it rather than leaving it declared-and-unused is deliberate: a dead
// ceiling sitting in the source reads as load-bearing to the next person, who would raise it again.
// The total is REPORTED with its four-way split, and the assertion that replaced it is a PARTITION -- see the
// paragraphs at that check. The number that means something, orphanUtils, is still ratcheted.
// THE CENSUS CAUGHT MY OWN MODULE AGAIN AT v2988. ui/machine.mjs, built LAST ROUND, was gate-only -- the
// identical failure to ui/fitCanvas.js at v2880, which was written, documented, and then not used while every
// page got hand-written CSS. Twice now. It is WIRED as of this round (rigJobBridge validates its own lifecycle
// transitions against the declared machine), so the total came back to 12 rather than being excused up to 13.
//
// THE NUMBER THAT MEANS SOMETHING IS BELOW. Of the 13, most are ANALYSIS RECORDS whose consumer is correctly the
// gate that re-derives their measurement. Only a few are ORPHANED UTILITIES -- functions nothing calls -- and
// that is the actionable list.
// THE ACTIONABLE SUBSET, and the only number here worth watching. Four remain, all from the v2889-v2975 stretch:
// launcherLint came off at v2989 (wired into verify.mjs, and found to be scanning 4 of 9 launchers).
// plantedError came off at v2990 -- used to MEASURE what fleetBench 0.05 tolerance actually catches.
// knobCandidates came off at v2992 -- its rejected-knob register now guards the floors work.
// androidUpdate came off at v2993 -- given a route at /android/update, because a CLI-only deliverable is
// unfinished under this project's own standing law rather than a legitimate gate-only module.
//
// ZERO. The debt raised at v2985 is cleared. Nine ANALYSIS RECORDS remain in the total and are NOT debt: their
// consumer is correctly the gate that re-derives their measurement. This number may never grow.
// v3449 -- *** READ THIS BEFORE TRUSTING ANY NUMBER THIS FILE PRINTS: THE ACTIONABLE COUNT IS A FLOOR, NOT A
// MEASURE. *** The reference test below is `(text.get(c) || "").includes(base)` -- a substring match on the
// basename over raw file text -- and it cannot tell an import from a sentence. main.js carries a
// quarter-megabyte of changelog naming modules BY PATH, so A PROSE MENTION COUNTS AS A CONSUMER and the census
// gets quieter the more this project documents itself.
//
// PROVEN: lib/derivedCache.js has no importer outside its own gate and reads as consumed because main.js names
// it ON THE ENGINE_VERSION LINE. And simulation/RagdollDismember.js is imported by NOTHING, reads as consumed,
// and this gate therefore calls its unwiredRegister entry STALE and asks for it to be deleted -- THE REGISTER
// WAS RIGHT AND THIS DETECTOR WAS WRONG.
//
// MEASURED at v3449: 164 modules with no resolved non-gate importer are held off this census by a mention, led
// by predictions.html (41), main.js (39), tools/ship/reportingTools.mjs (15) and THIS FILE (11 -- its own header
// and lists name the modules it judges). The directory exemption below is the same test one level up, where ONE
// SENTENCE EXEMPTS A WHOLE FOLDER.
//
// v3223 found this hazard and closed ONE instance (unwiredRegister.mjs, excluded by name) rather than the class.
// v3450 -- THE RESOLVER THIS SCAN NEEDS NOW EXISTS AND IS PROVEN: tools/ship/moduleRefs.mjs, whose gate builds a
// SYNTHETIC TREE WITH A KNOWN ANSWER and drives every route through it -- static import, dynamic import, worker
// target, importScripts, a ROOT-RELATIVE html src, extension completion -- plus the two cases that must NOT
// resolve: a module named only in a comment (MENTIONED-ONLY, undecided rather than dead) and one named only by
// an excluded register (UNREFERENCED). Wiring THIS file onto it is the next round, deliberately separate,
// because it moves a number that has been wrong three times and the move should be a measurement rather than a
// fourth guess.
//
// The exposure is counted and ratcheted in tools/ship/referenceKind-selfcheck.mjs; the rewrite of this scan is
// its own round, deliberately, because a first attempt moved this count 22 -> 97 -> 228 as the resolver learned
// more routes, and A NUMBER THAT MOVES THAT FAR UNDER ITS OWN AUTHOR IS NOT YET A MEASUREMENT.
// v3451 -- *** RE-BASELINED 0 -> 98, AND THIS IS NOT A LOOSENING. THE OLD ZERO DESCRIBED WHAT A SUBSTRING TEST
// COULD SEE. *** Every number this file printed before today was produced by a detector that counted a sentence
// as a consumer, so the census shrank as the project documented itself and the population moved under a
// baseline nobody could have held. Now that the reference test resolves, THE GATE-ONLY POPULATION IS MEASURED
// FOR THE FIRST TIME: 115 gate-only, of which 15 carry a recorded measurement, leaving 98.
//
// *** AND 98 IS A CENSUS, NOT DEBT. THE CLASSIFIER BELOW RECOGNISES EXACTLY ONE LEGITIMATE SHAPE -- a module
// exporting a RECORDED MEASUREMENT its gate re-derives -- AND THE TREE HAS GROWN TWO MORE THAT IT CANNOT NAME.
// Split by area: 46 under tools/ (per-call analysis primitives driven by their own gate -- the boundaryLint and
// claimTrace shape) and 25 under physics/ (modules graded by their own selfcheck, WHICH IS THE NORMAL SHAPE OF
// THIS ENTIRE LAB and a population gradedCoverage ALREADY OWNS AND CALLS COVERAGE). That is 71 of the 98 in
// categories that are correct by construction, and TWO INSTRUMENTS CALLING ONE POPULATION DEBT AND COVERAGE IS
// the disagreement to settle -- not by widening this regex to make a red gate green, which is the loosening this
// project refuses, but by deciding per module. THAT IS KEITH'S JUDGEMENT, ONE AT A TIME. ***
//
// THE NUMBER MAY ONLY SHRINK, and every route down is progress: wire it, delete it, or give the classifier a
// second DERIVED shape with evidence. It must not be raised again without a measurement beside it.
//
// v3670 -- *** THE LINE THAT USED TO SIT HERE WAS WRONG BY 215 VERSIONS AND WAS BELIEVED BECAUSE IT WAS IN A
// GATE. *** It read: "ONE ITEM IS ALREADY KNOWN ACTIONABLE ... ui/roundTrip.js implements the six round-trip
// rules and NO PAGE IMPORTS IT." arrival.html HAS IMPORTED IT SINCE v3455, and tools/ship/roundTrip-selfcheck
// ASSERTS SO ON EVERY RUN -- two files in this tree disagreeing about one fact, with the true one exercised
// every ship and the false one carried in prose. doorbell.html is the second conversion (v3670), and the
// unguarded ratchet has come 100 -> 91 -> 83. THE HONEST STATEMENT NOW: ui/roundTrip.js IS WIRED, and what is
// left is the remaining call sites, one file at a time -- NOT a module with no caller.
// A CLAIM ABOUT ANOTHER FILE, RESTATED HERE, GOES STALE SILENTLY; the count below is derived and did not.
// v3453 -- 98 -> 99, AND THE REASON IS physics/mesh/manifoldCensus.mjs: a per-call analysis primitive whose
// consumer is CORRECTLY its own gate, which is the 25-under-physics category named above and is correct by
// construction. IT IS RAISED WITH ITS REASON RATHER THAN EXEMPTED, because the moment a category becomes an
// automatic exemption this number stops measuring anything. If csg.html is ever linked and calls it, this
// drops back to 98 on its own.
// v3467 -- 99 -> 100: physics/render/furnace.mjs, a per-call analysis primitive whose consumer is CORRECTLY its
// own gate. Third instance of the pattern named at v3453 (moduleRefs v3450, manifoldCensus v3453) and the count
// rises by exactly one each time, because this project's two habits -- a primitive driven by its gate, and a
// changelog that names it -- ARE the two conditions these numbers measure.
//
// *** THIS ONE HAS AN END IN SIGHT AND THE OTHERS DID NOT: furnace.mjs is the answer key for a path tracer that
// does not exist yet. THE DAY ONE IS WRITTEN, IT GAINS A NON-GATE CONSUMER AND THIS DROPS BACK TO 99 ON ITS
// OWN. That fall is the measurement that the renderer arrived, and it is worth more than an exemption. ***
// v3469 -- 100 -> 101: physics/render/occlusion.mjs, gate-only like furnace.mjs beside it. SAME NOTE AS THAT
// ONE AND IT NOW COVERS TWO FILES: these are the answer key for a path tracer that does not exist yet, so the
// day one is written they BOTH gain a non-gate consumer and this falls to 99 in one step. A number that is
// scheduled to fall is a different thing from debt, and the schedule is written here so nobody has to guess.
// v3470 -- 101 -> 102: physics/render/bounces.mjs, third of the render answer-key modules and the same
// schedule as the other two: gate-only because the renderer does not exist, and ALL THREE gain a non-gate
// consumer the day one is written, dropping this to 99 in one step.
// v3472 -- 102 -> 103: physics/render/nee.mjs, fourth and last of the render answer-key modules. SAME
// SCHEDULE: all four gain a non-gate consumer the day a renderer exists, dropping this to 99 in one step.
// v3473 -- *** 103 -> 101, AND I PREDICTED 99. THE PREDICTION WAS WRONG AND THE REASON IS THE FINDING. *** The
// path tracer shipped with a page, so physics/render/furnace.mjs and occlusion.mjs gained a NON-GATE consumer
// and came off. bounces.mjs and nee.mjs DID NOT, because the renderer does not import them:
//
//   bounces.mjs -- a TWO-STATE ANALYTIC MODEL, not a renderer component. It was never going to gain a caller
//                  and my forecast quietly assumed "graded" meant "used". IT IS CORRECTLY GATE-ONLY.
//   nee.mjs     -- IS a renderer component and the tracer SHOULD call it. It does not: trace() has no direct
//                  light sampling at all, so a small bright light would be found only by chance. THAT IS REAL
//                  DEBT, NOT A CLASSIFICATION QUESTION, and wiring it is the next round -- taking this to 100.
//
// LOWERED BY HAND TO WHAT WAS MEASURED, not to what was forecast.
// v3474 -- *** 101 -> 100, AND THIS TIME THE FORECAST WAS RIGHT AND SAID SO IN ADVANCE. *** v3473 predicted
// exactly this: nee.mjs was real debt rather than a classification question, the tracer now calls it, and the
// number fell by one. bounces.mjs stays -- correctly, it is a two-state analytic model and no renderer will
// ever import it. A NUMBER THAT FALLS FOR A NAMED REASON IS WORTH MORE THAN A NUMBER THAT WAS NEVER WRONG.
// v3673 -- LOWERED 100 -> 88, AND THE RE-DERIVATION IS THE POINT RATHER THAN THE NUMBER. Sixteen members left
// the pile because they ALREADY HAD A DOOR (a tools.html row, above), so the reading fell 104 -> 88 without a
// single module being wired or deleted this round. LEAVING THE BASELINE AT 100 WOULD HAVE PUT TWELVE SLOTS OF
// SLACK IN A RATCHET -- twelve genuinely orphaned utilities could then arrive and be absorbed in silence, which
// is exactly what v3672 found in pageReach's baseline one round ago and had to fix there too. WHENEVER A
// RATCHET'S SET NARROWS, ITS COUNT IS RE-DERIVED IN THE SAME EDIT.
// v3674 -- LOWERED 88 -> 86, AND THIS TIME BY WIRING RATHER THAN BY RECLASSIFYING. physics/livePanel.js and
// physics/viewLayout.js are ONE FEATURE SPLIT ACROSS TWO MODULES -- viewLayout.validate() defaults its
// known-panel list to ["spectrum", "zeta-line"], which are exactly livePanel's two panels -- and NEITHER HAD A
// PAGE. Their arithmetic was proven (the spectrum peak lands on the analytic mode frequency; the zeta dips land
// on the published zeros) and nothing could draw it. live-panel.html imports both, so each now has a NON-GATE
// consumer and leaves the pile on its own. THE DIFFERENCE FROM v3673 MATTERS: that round narrowed what COUNTS
// as debt and this one PAID some, and a baseline that fell for the second reason must not be confused with one
// that fell for the first.
const ORPHAN_UTIL_BASELINE = 86;   // v3451 (100); v3673 door-aware (88); v3674 livePanel+viewLayout wired (86).
const ORPHAN_BASELINE = 1;

const r = scan();

// 1. THE CENSUS
{
    ok("the scan reaches the whole tree", r.scanned > 2000, `${r.scanned} files`);
    ok("dynamically-loaded families are excluded rather than flagged", r.dynDirs > 50, `${r.dynDirs} directories load by name`);
    console.log("  gate-only modules:");
    for (const g of r.gateOnly) console.log(`      ${g.file}   (only ${g.gates} gate${g.gates > 1 ? "s" : ""} reference it)`);
    if (r.orphans.length) { console.log("  unreferenced entirely:"); for (const o of r.orphans) console.log(`      ${o}`); }
}

// 2. THE RATCHET -- the list may shrink and may never grow
{
    // v2988 -- SPLIT, because the total was not actionable. An ANALYSIS RECORD exists to hold a measurement and
    // its gate exists to prove that measurement still reproduces; that is the correct shape for a finding, not a
    // graveyard case. An ORPHANED UTILITY exports functions nothing calls, and THAT is the one worth acting on.
    // The split is DERIVED from whether the module exports a recorded measurement -- nobody types it, so it
    // cannot rot the way a self-declared MODULE_KIND would.
    const records = r.gateOnly.filter((g) => g.record);
    // v3223 -- *** THE RATCHET COUNTS UNEXPLAINED ORPHANS NOW, NOT ORPHANS. ***
    // The baseline was ZERO and the reading was four -- and all four had a reason, established rounds ago, living
    // in each module's OWN SELFCHECK HEADER where this ratchet could not see it. So four SOLVED questions were
    // counted as four open ones on every run, and a number that never moves stops being read: the number went to
    // twelve at one point and nobody looked, because it had been wrong for so long.
    //
    // tools/ship/unwiredRegister.mjs holds the disposition for each -- what it is, what BLOCKS it, and what it
    // would need. THE BAR FOR AN ENTRY IS A REAL BLOCKER OR A REAL DECISION, never "not got to yet", which is
    // the sentence the register exists to make impossible to hide behind.
    //
    // *** AN ENTRY IS DEBT WITH A NAME ON IT, NOT AN EXEMPTION. Deleting a finished, gated capability to make
    // this number fall would be the worst reading of the register, and wiring one without the rig that can judge
    // the result would be the second worst. WHEN ONE IS WIRED, ITS ENTRY IS DELETED, NOT EDITED. ***
    // *** v3673 -- A ROW ON tools.html IS A DOOR, AND THIS RATCHET COULD NOT SEE ONE. *** Its own failure line
    // says of every member "these export functions and NOTHING calls them -- wire it, or delete it", and its
    // resolver is the IMPORT GRAPH. A reportingTools row does not import its module; it SPAWNS IT BY PATH from
    // a button on tools.html. SIXTEEN OF THE HUNDRED AND FOUR ALREADY HAD A DOOR -- v3608's finding, one
    // register over -- AND TWO OF THEM ARE buildKnowledgeIndex.mjs AND buildPageIndex.mjs, THE EXACT PAIR v3609
    // GAVE ROWS TO IN ORDER TO CLOSE THEIR PROSE DOORS. A round fixed a door and this register never saw it.
    //
    // THE DOOR IS READ FROM THE REGISTRY, NEVER FROM A LIST HERE, and that is what makes this a NARROWING of
    // what counts as debt rather than a LOOSENING of the rule: delete a row and its module returns to the pile
    // on the next run. A hand-written exemption could not do that, and would be the dumping ground the baseline
    // note warns about. THE DOORED ONES ARE PRINTED BY NAME, so nothing leaves the report -- only the count.
    const _doors = toolDoors();
    const allOrphanUtils = r.gateOnly.filter((g) => !g.record);
    const doored = allOrphanUtils.filter((g) => !isExplained(g.file) && hasToolDoor(g.file, _doors));
    const orphanUtils = allOrphanUtils.filter((g) => !isExplained(g.file) && !hasToolDoor(g.file, _doors));
    const explained = allOrphanUtils.filter((g) => isExplained(g.file));
    if (doored.length) {
        console.log("        already have a tools.html row (a door of another shape, v3608): " + doored.length);
        for (const g of doored) console.log("          DOORED      " + g.file);
    }
    if (explained.length) {
        console.log("        explained (unwiredRegister, each with a stated blocker): " + explained.length);
        for (const g of explained) console.log("          EXPLAINED   " + g.file + " -- " + UNWIRED.get(g.file).blocker.slice(0, 96));
    }
    console.log("        analysis records (legitimate): " + records.length +
                "   orphaned utilities (actionable): " + orphanUtils.length);
    for (const g of orphanUtils) console.log("          ACTIONABLE  " + g.file);
    ok("!! ORPHANED UTILITIES HAVE NOT INCREASED", orphanUtils.length <= ORPHAN_UTIL_BASELINE,
        `${orphanUtils.length} now vs ${ORPHAN_UTIL_BASELINE} recorded. These export functions and NOTHING calls them -- wire it, or delete it. This is the number that means something; the total includes analysis records whose consumer is correctly the gate.`);
    // EVERY REGISTER ENTRY MUST STILL BE FIRING. A disposition for a module that has since been wired is a
    // suppression holding nothing -- v3195's finding, and the reason baselineHygiene exists at all.
    const stale = [...UNWIRED.keys()].filter((k) => !allOrphanUtils.some((g) => g.file === k));
    ok("!! *** no register entry has outlived its reason ***", stale.length === 0,
        stale.length ? "STALE, DELETE THESE: " + stale.join(", ") + " -- they are no longer orphaned utilities, " +
                       "so their entries suppress nothing and would silently swallow the next real one"
                     : UNWIRED.size + " entries, every one still firing");

    // *** v3675 -- THE TOTAL'S CEILING IS RETIRED AND REPLACED BY A PARTITION, BECAUSE THE CEILING FIRED ON
    // CORRECT WORK. *** SHOWN, NOT ARGUED: add a legitimate analysis primitive -- a pure module carrying its own
    // MEASURED_ record, driven by its own gate, the exact thing this project builds most rounds -- and the total
    // goes 143 -> 144 while the ACTIONABLE count stays at 86 and NO DEBT EXISTS ANYWHERE. v3567's law: A KEY
    // THAT FIRES ON CORRECT CODE IS WORSE THAN NO KEY. The history is the same story told slowly: this number
    // was RAISED 8 -> 14 (v3223) -> 117 (v3451), each time with an honest reason, and it has sat red at 143
    // since -- A RATCHET THAT MUST BE RAISED EVERY TIME THE PROJECT SUCCEEDS HAS STOPPED MEASURING.
    //
    // WHAT REPLACES IT IS STRICTLY STRONGER, NOT WEAKER, AND CANNOT BE SATISFIED BY LOOSENING: every gate-only
    // module must fall into EXACTLY ONE of the four named populations. A ceiling can be met by raising a number;
    // a partition can only be met by every member being classified, and it goes RED the moment one is not --
    // which is the failure that actually matters here, an unclassified gate-only module sitting in a total
    // nobody reads. THE COUNT THAT MEANS SOMETHING IS STILL RATCHETED: orphanUtils, above, at 86.
    //
    // ANTIDOTE: if a FIFTH population is ever needed, ADD IT to the partition and name it. DO NOT widen an
    // existing category to absorb the stragglers -- the whole value of this line is that every member has been
    // put somewhere on purpose.
    const parts = records.length + orphanUtils.length + doored.length + explained.length;
    ok("!! every gate-only module lands in EXACTLY ONE named population", parts === r.gateOnly.length,
        `${parts} classified of ${r.gateOnly.length} gate-only: ${records.length} analysis records + ${orphanUtils.length} orphaned utilities (RATCHETED, above) + ${doored.length} with a tools.html door + ${explained.length} explained with a blocker. THE TOTAL IS REPORTED AND NO LONGER CAPPED, and the reason is measured rather than preferred: adding one CORRECT gate-driven analysis primitive raises it while the actionable count does not move, so the old ceiling fired on the project working. A PARTITION CANNOT BE MET BY RAISING A NUMBER -- it goes red when a member belongs to none of the four, which is the failure a total nobody reads would hide.`);
    ok("...and neither have fully unreferenced modules", r.orphans.length <= ORPHAN_BASELINE,
        `${r.orphans.length} vs ${ORPHAN_BASELINE}`);
    // v3223 -- *** THIS PINNED THE BASELINE VALUES THEMSELVES, so raising one with a written reason -- the very
    // thing the check on the next line requires -- turned this red. TWO CHECKS DEMANDING OPPOSITE THINGS, and
    // the same shape as decisionIndex-selfcheck vs singleSource two rounds ago: one wanted a local walk, the
    // other forbade a second one, and neither cared about readdirSync. Neither of these cares about the VALUE 8.
    // The property is that the baselines are LITERALS IN THE SOURCE -- so changing one is a visible edit to a
    // tracked file rather than a number computed at run time from whatever happens to be there.
    ok("the baselines are NUMBERS in the source, so changing one is a deliberate act",
        [ORPHAN_BASELINE, ORPHAN_UTIL_BASELINE].every((n) => Number.isInteger(n)) &&
        /const ORPHAN_UTIL_BASELINE = \d+;/.test(fs.readFileSync(path.join(HERE, "graveyard-selfcheck.mjs"), "utf8")),
        "ORPHAN_BASELINE " + ORPHAN_BASELINE + ", ORPHAN_UTIL_BASELINE " +
        ORPHAN_UTIL_BASELINE + " -- all literals, and the RAISE check below requires the reason beside them");
    ok("!! and every RAISE carries its reason in the source", /RAISED FROM \d+ TO \d+|TIGHTENED FROM \d+ TO \d+/.test(fs.readFileSync(path.join(HERE, "graveyard-selfcheck.mjs"), "utf8")));
}

// 3. THE HISTORY THIS EXISTS FOR is written down, because a ratchet without a reason becomes a dumping ground
{
    const src = fs.readFileSync(path.join(HERE, "graveyard-selfcheck.mjs"), "utf8");
    ok("the three real cases are named with their costs", /biomeSpawns/.test(src) && /37 versions/.test(src) && /67 versions/.test(src));
    ok("!! and why a naive detector fails is recorded, since I built one first", /169 files/.test(src) && /LOADED DYNAMICALLY BY NAME/.test(src));
    ok("...it is stated as a CENSUS not a ban, so a legitimate gate-only module is not a failure", /CENSUS, NOT A BAN/.test(src));
}

console.log("graveyard-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
