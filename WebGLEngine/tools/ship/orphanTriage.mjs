// tools/ship/orphanTriage.mjs
//
// v3548 -- TRIAGE THE ORPHANED-UTILITY PILE BY DERIVED EVIDENCE, SO "READ THEM ONE AT A TIME" IS A LIST A
// PERSON CAN ACTUALLY WORK. And the pile is 104, not the 103 my notes carried -- CHECK NUMBERS AGAINST THE
// TREE.
//
// v3451 measured graveyard's actionable pile honestly for the first time and said what was owed: READ THEM ONE
// AT A TIME. It has been asked for six times since and never done, and the reason is that 104 undifferentiated
// paths is not a task. This does not decide any of them -- IT SORTS THEM BY EVIDENCE THAT ALREADY EXISTS IN
// THE TREE, and the only thing it adds is that the sort is DERIVED rather than declared.
//
// *** NOTHING HERE IS RATCHETED AND graveyard'S NUMBER IS NOT TOUCHED. *** Changing a classifier to make a
// count fall is how a ratchet stops meaning anything (v3453). graveyard still says 104 and still says it is
// red; this says which 104.
//
// ---- FINDING 1: A STANDING WORRY, REFUTED BY FINALLY COMPARING THE TWO INSTRUMENTS ------------------------
//
// v3448 recorded, and this project's notes have carried for ~100 versions: "gradedCoverage ALREADY OWNS THAT
// POPULATION AND CALLS IT COVERAGE WHILE GRAVEYARD CALLS IT DEBT -- TWO INSTRUMENTS, ONE POPULATION, OPPOSITE
// FRAMINGS, AND NOTHING COMPARED THEM."
//
// *** COMPARED: THE OVERLAP IS EXACTLY ZERO, AND NOT BY LUCK. *** `graded` means REACHABLE FROM A DEVICE
// BIND. A bind is a non-gate importer. A non-gate importer is precisely what disqualifies a module from being
// GATE-ONLY. So the two sets CANNOT intersect: the instruments are COMPLEMENTARY BY CONSTRUCTION, not
// contradictory, and there was never a conflict to resolve. THE REAL OVERLAP IS WITH `ungraded` (19), AND IT
// IS THE AGREEING ONE -- both instruments saying the same thing about the same modules from two directions.
//
// Of the six the v3448 claim named: friedmann and lensing are now GRADED and off the pile entirely (bound to
// the astroparticle device at v3501 onward, so the claim aged out correctly and nobody noticed); beerLambert
// and kerrLadder are ungraded AND actionable; halo and oscillation are not standalone modules at all, they are
// MODES. THE RECORD WAS WRONG IN ITS DIAGNOSIS AND HALF-RIGHT IN ITS MEMBERSHIP, AND ONLY A COMPARISON COULD
// TELL WHICH.
//
// ---- FINDING 2: MY OWN SPAWN DETECTOR WAS THE DEFECT THIS ROUND IS ABOUT ----------------------------------
//
// v3547 established that A SPAWN IS NOT AN IMPORT -- decisionIndex carries a main block and still resolves to
// zero references because it is only ever spawned. Two modules in the unclassified pile are ones the ship
// ritual runs EVERY ROUND (buildKnowledgeIndex, buildPageIndex), so a SPAWNED class is clearly owed.
//
// *** I BUILT ONE AND IT REPORTED 31 OF 36 SPAWNED. THE TRUE ANSWER IS 4. *** My first corpus was every
// .bat/.sh/.json/.md/.yml in the project -- which includes BACKLOG.md, TODO.md, knowledge-index.json and the
// okf/claims prose. A PROSE MENTION COUNTED AS A SPAWN: the exact defect graveyard itself was rebuilt to fix
// at v3451, committed by me inside the round examining it, and an EIGHTFOLD error whose give-away was that the
// number was implausible (v3448's rule: an implausible number is a finding about the instrument).
//
// SO THE CORPUS IS EXECUTABLE THINGS ONLY -- .bat / .sh / .command / .ps1, and package.json's "scripts" VALUE
// rather than the whole manifest. NO MARKDOWN. NO DERIVED JSON (knowledge-index, baselines, registers): a file
// that NAMES modules for a reader is never their launcher, which is v3223's rule about registers arriving in a
// third place.
//
// *** AND THE CONSEQUENCE IS A REAL FINDING ABOUT THE BUILD, NOT A CLASSIFICATION QUIBBLE: buildKnowledgeIndex
// AND buildPageIndex ARE NOT SPAWN-RESCUED. Nothing in the tree invokes them. They run because the ship ritual
// says so, and the ship ritual lives in a person's notes rather than in the tree. ***
//
// ===========================================================================================================
// v3558 -- TWO SIGNALS ALREADY IN THE TREE THAT NOTHING READ, AND THE UNCLASSIFIED PILE HALVES
// ===========================================================================================================
//
// v3551 fixed hasOwnGate's DIRECTORY assumption and left its NAMING assumption standing. Both new classes here
// were derived by measuring all 25 rather than by reading their headers, and NEITHER IS ALLOWED TO COLLAPSE THE
// PILE -- v3551's own trap, where "has any gate consumer" took 32 to 0 because actionable() already guarantees
// it. Each is checked for collapse in the gate, with the negative case named.
//
// ---- SIGNAL A: A DEDICATED GATE NAMED FOR THE CONCEPT RATHER THAN THE MODULE --------------------------------
//
// hasOwnGate matches a file called <basename>-selfcheck.mjs. That is a PROXY for "somebody built a gate FOR
// this module", and the proxy misses the case where they named the gate after the IDEA instead of the file.
//
// *** v3550 WROTE THIS EXACT SENTENCE IN PROSE AND NOTHING RE-DERIVED IT: *** "tools/voxelExtremity-selfcheck
// .mjs is named for the concept rather than the class, so it does not register as VoxelWorld.js's OWN gate even
// though it is a real, working one." A WIRING CLAIM IN PROSE WHERE NOTHING RE-DERIVES IT -- twelve-plus
// instances in this tree, and this one sat one round old inside the file the claim is about.
//
// THE DERIVED FORM, AND IT IS NARROW ON PURPOSE: a gate whose ONLY subject is this module IS this module's
// dedicated gate, whatever it is called. Subjects come from the SAME referenceGraph actionable() already built
// -- one derivation, read a third time -- so there is no second resolver to drift.
//
// NON-VACUITY, MEASURED RATHER THAN HOPED: it admits FOUR (box3dSyncCompare, wasmImports, emitStrictLibm,
// VoxelWorld) and REFUSES run-device.mjs, which has SIX gate importers and whose leanest imports four modules.
// A gate that tests this module ALONGSIDE FIVE OTHERS is not a gate built for it -- which is precisely the
// distinction v3551 kept when it refused to credit buildKnowledgeIndex with instruments-selfcheck.mjs.
//
// ---- SIGNAL B: A CLI FRONT DOOR AND NO PAGE ROW --------------------------------------------------------------
//
// A module with a main block CAN BE RUN. That is evidence, and `registered` only ever asked whether reportingTools
// names it. So cliOnly is its own class -- AND IT IS A WORK LIST, NOT AN EXEMPTION: this project's standing law
// is that a CLI-only deliverable is unfinished, so landing here means "give it a page row or state why not".
//
// *** THE DETECTOR IS THE PROPERTY, NOT A SPELLING, BECAUSE THERE ARE SIX SPELLINGS. *** import.meta.url is
// compared against process.argv[1] as `pathToFileURL(argv[1]).href`, as `fileURLToPath(meta) === argv[1]`, as
// `path.resolve(argv[1]) === fileURLToPath(meta)`, through an AWAITED dynamic import of node:url, against
// Deno.mainModule, and -- most commonly of all -- as a TEMPLATE LITERAL, `file://${process.argv[1]}`. A regex
// for any one of them would report a stale answer about five others. What is asserted is the property: ONE LINE
// NAMES BOTH THIS MODULE AND THE PROCESS ENTRY POINT.
//
// *** AND THE STRIPPER CHOICE IS THE ROUND'S SHARPEST HALF: codeOnly() IS THE WRONG ONE HERE AND MISSES TWELVE.
// *** codeOnly blanks string literals, so `${process.argv[1]}` inside a template literal DISAPPEARS -- and that
// is the tree's most-used spelling. Measured on the actionable pile: raw 35, codeOnly 22, noComments 34. This is
// v3526's pair from a new angle: codeOnly for an IDIOM, noComments for TEXT THE CODE CONTAINS -- and a main
// guard is an IDIOM WHOSE OPERAND LIVES IN A STRING, so it needs the stripper that keeps strings.
//
// ONE HONEST GAP, NAMED RATHER THAN PAPERED OVER: noComments reads 34 where the raw text reads 35, and the
// difference is tools/ship/proseAudit.mjs, whose real main block on its last lines the stripper cannot see.
// That is NOT a prose rescue -- it is the lexer DESYNCING on a regex literal containing a quote, which
// sourceScan's own header warns about in its first paragraph, in the file most full of quote-bearing regexes.
// A KNOWN LIMIT OF A SHARED PRIMITIVE, REPORTED WITH ITS NAME, not worked around with a second stripper.
//
// ---- AND THE BUCKETS STOP DISCARDING EVIDENCE ---------------------------------------------------------------
//
// The sort is EXCLUSIVE, so a module carrying two signals had one of them silently dropped by the order of an
// if-chain. emitStrictLibm.mjs carries BOTH new signals. The exclusive split stays (a partition is what makes
// the counts readable and the gate checks it sums), but `evidence` now records EVERY signal for EVERY member,
// and the report prints the ones carrying more than one. A SORT IS A VIEW; IT MUST NOT BE THE ONLY RECORD.
//
// ---- AND THE HEADLINE WAS A TYPED NUMBER, IN TWO PLACES ------------------------------------------------------
//
// reportLines printed "WHICH 104" as a LITERAL one line above the derived count, and reportingTools' page label
// read "Which 104 orphans?". The tree reads 105. A HAND-TYPED COUNT INSIDE THE REPORT WHOSE ENTIRE SUBJECT IS
// DERIVED EVIDENCE, already stale by one, in both the terminal output and the page row. The headline is derived
// now and the label no longer carries a count, because a page label cannot re-derive one at render time.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { referenceGraph } from "./moduleRefs.mjs";
import { REPORTING, ARTEFACT_TOOLS } from "./reportingTools.mjs";
import { UNWIRED_REGISTRATION, isExplained } from "./unwiredRegister.mjs";
import { noComments } from "./sourceScan.mjs";
import { gradedCoverage } from "../roundhouse/gradedCoverage.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENG = path.join(HERE, "..", "..");        // WebGLEngine/
export const PROJ = path.join(ENG, "..");              // the project root, where the launchers live

/** Executable things a module can be SPAWNED from. Prose and derived artefacts are deliberately absent. */
export const SPAWN_EXT = /\.(bat|sh|command|ps1)$/i;
/** Named apart so the exclusion is a stated rule rather than an accident of the extension list. */
export const NOT_A_LAUNCHER = /\.(md|txt)$|knowledge-index\.json$|-baseline\.json$|Register\.mjs$/i;

const isGate = (f) => /-selfcheck\.mjs$/.test(f);
const rel = (f) => path.relative(ENG, f).split(path.sep).join("/");

function walk(root, keep) {
    const out = [];
    (function w(d) {
        for (const e of fs.readdirSync(d)) {
            if (e === "node_modules" || e.startsWith(".")) continue;
            const p = path.join(d, e);
            let st; try { st = fs.statSync(p); } catch { continue; }
            if (st.isDirectory()) w(p); else if (keep(e, p)) out.push(p);
        }
    })(root);
    return out;
}

/**
 * *** ONE DECLARATION OF THE WALK AND THE GRAPH, SHARED BY actionable() AND classify(). *** Building this
 * twice -- once to decide membership, once to explain a member -- is exactly the second-declaration shape
 * this tree hunts down constantly, and it very nearly happened here: actionable() already resolves REAL
 * consumers (any importer, any directory) to decide whether a module is gate-only; classify()'s hasOwnGate
 * bucket used to re-guess the answer with a same-directory-same-basename filename check instead of asking
 * this same graph. ONE DERIVATION, READ TWICE.
 */
function buildRefs() {
    const all = walk(ENG, (e) => /\.(js|mjs|html)$/.test(e));
    const text = new Map(all.map((f) => {
        try { return [f, fs.readFileSync(f, "utf8")]; } catch { return [f, ""]; }
    }));
    const REFS = referenceGraph(all, (f) => text.get(f) || "", ENG, {
        exclude: new Set([path.join(ENG, "tools/ship/unwiredRegister.mjs"),
                          path.join(ENG, "tools/ship/referenceKind-selfcheck.mjs")]),
    });
    return { all, text, REFS };
}

/**
 * *** THE SAME DERIVATION graveyard-selfcheck MAKES, EXCLUSIONS INCLUDED. *** A second copy of this walk would
 * be the two-declarations defect inside the file whose subject is a census, so if graveyard's number and this
 * one ever disagree, ONE OF THEM HAS DRIFTED -- and the gate asserts they agree rather than assuming it.
 */
export function actionable(shared = null) {
    const { all, text, REFS } = shared || buildRefs();
    // graveyard's own record shape -- "carries a recorded measurement", derived rather than declared.
    const RECORD = /export\s+const\s+(MEASURED[A-Z_0-9]*|[A-Z_0-9]*REGISTRATION|[A-Z_0-9]*OUTCOMES|[A-Z_0-9]*_V\d+)\b/;
    const out = [];
    for (const f of all) {
        if (isGate(f) || !/\.(js|mjs)$/.test(f)) continue;
        if (!/^export /m.test(text.get(f) || "")) continue;
        const consumers = (REFS.refs.get(f) || []).map((r) => r.from);
        if (consumers.length === 0) continue;                       // orphan or mentioned-only, counted apart
        if (!consumers.every(isGate)) continue;                     // has a real caller
        if (RECORD.test(text.get(f) || "")) continue;               // an analysis record, legitimately gate-only
        if (isExplained(rel(f))) continue;                          // debt with a name on it (unwiredRegister)
        // *** v3673 -- I PUT A DOOR-AWARE `continue` HERE AND THIS FILE'S OWN GATE REFUSED IT, CORRECTLY. ***
        // orphanTriage-selfcheck asserts "graveyard's number is STILL untouched -- this round moves DISPLAY
        // CATEGORISATION only ... CHANGING A CLASSIFIER TO MAKE A COUNT FALL IS HOW A RATCHET STOPS MEANING
        // ANYTHING (v3453)", and that is a fair description of the edit I had just made, however good the
        // reason felt. So the door rule lives in the RATCHET THAT MAKES THE CLAIM (graveyard-selfcheck) and not
        // in this classifier. THE TWO NUMBERS NOW DIFFER ON PURPOSE AND IT IS NOT TWO DECLARATIONS: this file
        // answers "gate-only by import", which the doored sixteen still are, and graveyard answers "actionable
        // debt", which they are not. Both read the SAME hasToolDoor from doorKinds; only the questions differ,
        // and graveyard prints the sixteen by name so the gap is visible rather than inferred.
        out.push(rel(f));
    }
    return out.sort();
}

/** Which modules an EXECUTABLE names. Never markdown, never a derived artefact -- see the header. */
export function spawnSites() {
    const files = walk(PROJ, (e) => SPAWN_EXT.test(e) || e === "package.json")
        .filter((p) => !NOT_A_LAUNCHER.test(p));
    const src = new Map();
    for (const f of files) {
        let s = "";
        try { s = fs.readFileSync(f, "utf8"); } catch { s = ""; }
        if (path.basename(f) === "package.json") {
            // ONLY the scripts block. A dependency list names packages, not launchers.
            try { s = JSON.stringify(JSON.parse(s).scripts || {}); } catch { s = ""; }
        }
        src.set(f, s);
    }
    return src;
}

/**
 * *** WHAT EACH GATE IS ABOUT, INVERTED OUT OF THE SAME GRAPH -- A THIRD READING OF ONE DERIVATION. ***
 * referenceGraph gives target -> importers; this gives gate -> the project modules it references. No second
 * resolver, so a gate's subjects cannot drift from the consumers actionable() reads to decide membership.
 * Returns Map(gate rel -> Set(module rel)).
 */
export function gateSubjects(shared) {
    const { REFS } = shared;
    const out = new Map();
    for (const [target, list] of REFS.refs.entries()) {
        if (isGate(target) || !/\.(js|mjs)$/.test(target)) continue;   // a gate importing a gate is not a subject
        for (const { from } of list) {
            if (!isGate(from)) continue;
            if (!out.has(from)) out.set(from, new Set());
            out.get(from).add(rel(target));
        }
    }
    return new Map([...out].map(([g, s]) => [rel(g), s]));
}

/**
 * *** A MAIN GUARD IS A PROPERTY, NOT A SPELLING -- THERE ARE SIX OF THEM IN THIS TREE. *** See the header.
 * The property asserted: one line names BOTH this module (import.meta.url) AND the process entry point
 * (process.argv[1], or Deno.mainModule for the Deno branch rocketLoop.mjs carries).
 */
export const MAIN_SELF = /import\.meta\.url/;
export const MAIN_ENTRY = /process\.argv\[1\]|Deno\.mainModule/;

/**
 * noComments AND NOT codeOnly, and the difference is TWELVE MODULES. codeOnly blanks string literals, and this
 * tree's commonest spelling puts the entry point INSIDE a template literal -- `file://${process.argv[1]}` --
 * so codeOnly cannot see it at all. v3526's rule from a new angle: codeOnly for an IDIOM, noComments for TEXT
 * THE CODE CONTAINS, and a main guard is an idiom whose operand is text.
 */
export function hasMainBlock(src) {
    return noComments(src).split("\n").some((l) => MAIN_SELF.test(l) && MAIN_ENTRY.test(l));
}

export function classify({ list = null, cov = null, spawn = null, refs = null } = {}) {
    const shared = refs || buildRefs();
    const act = list || actionable(shared);
    const C = cov || gradedCoverage(ENG + path.sep);
    const graded = new Set(C.graded), ungraded = new Set(C.ungraded);
    const registered = new Set([...REPORTING, ...(ARTEFACT_TOOLS || [])].map((t) => t.rel || t));
    const sites = spawn || spawnSites();
    const spawnedBy = (r) => {
        const base = path.basename(r);
        return [...sites.entries()].filter(([, s]) => s.includes(base)).map(([f]) => path.relative(PROJ, f));
    };
    // *** ASK THE RESOLVER FOR THE RIGHT QUESTION, NOT "ANY GATE" -- THAT ONE IS ALREADY GUARANTEED TRUE. ***
    // A first attempt here widened hasOwnGate to "consumers.every(isGate)", reusing the exact check actionable()
    // already applies to decide membership -- and that collapsed unclassified from 32 to 0, because EVERY
    // member of `act` already satisfies that by construction (it is the entry test). Asking a question whose
    // answer is guaranteed is not evidence. THE OLD, NARROWER CHECK WAS TESTING SOMETHING REAL -- a DEDICATED,
    // purpose-built gate, which the same-basename convention is this tree's own proxy for -- but wrongly
    // required it to sit in the SAME DIRECTORY. render/depthProject.js's dedicated gate is
    // tools/ship/depthProject-selfcheck.mjs; render/frameTrace.js's is tools/ship/frameTrace-selfcheck.mjs;
    // world/autoExtremity.js's is tools/autoExtremity-selfcheck.mjs -- same basename, three different
    // directories, all missed by the old fs.existsSync(sameDir, ...) check. WIDENED TO THE WHOLE TREE, SAME
    // NAMING CONVENTION KEPT: a module counts as hasOwnGate only if some file ANYWHERE is named exactly
    // <basename>-selfcheck.mjs -- not merely "some gate happens to import this" (buildKnowledgeIndex.mjs is
    // imported by instruments-selfcheck.mjs as one utility among many it tests; that is real but is not a gate
    // BUILT FOR buildKnowledgeIndex, so it correctly stays unclassified rather than being credited with one).
    const { all: allFiles, text } = shared;
    const gateBasenames = new Set(allFiles.filter(isGate).map((f) => path.basename(f)));
    const hasOwnGate = (r) => gateBasenames.has(path.basename(r).replace(/\.(mjs|js)$/, "") + "-selfcheck.mjs");

    // v3558 SIGNAL A -- a gate whose ONLY subject is this module is its dedicated gate, whatever it is NAMED.
    const subjects = gateSubjects(shared);
    const soleSubjectGate = new Map();
    for (const [g, s] of subjects) if (s.size === 1) soleSubjectGate.set([...s][0], g);
    const dedicatedGate = (r) => soleSubjectGate.get(r) || null;

    // v3558 SIGNAL B -- a CLI front door. A WORK LIST, NOT AN EXEMPTION (a CLI-only deliverable is unfinished).
    const srcOf = (r) => text.get(path.join(ENG, ...r.split("/"))) ?? (() => {
        try { return fs.readFileSync(path.join(ENG, ...r.split("/")), "utf8"); } catch { return ""; }
    })();
    const cliOnly = (r) => hasMainBlock(srcOf(r));

    const split = {
        gradedPhysics: [], ungradedPhysics: [], spawned: [], registered: [],
        hasOwnGate: [], dedicatedGate: [], cliOnly: [], unclassified: [],
    };
    const why = new Map();
    // *** THE SORT IS A VIEW, NOT THE RECORD. *** An exclusive if-chain drops the second reason a module
    // qualifies; `evidence` keeps every signal for every member so nothing is discarded by ordering alone.
    const evidence = new Map();
    for (const r of act) {
        const sp = spawnedBy(r), ded = dedicatedGate(r), tags = [];
        if (graded.has(r)) tags.push("gradedPhysics");
        if (sp.length) tags.push("spawned");
        if (ungraded.has(r)) tags.push("ungradedPhysics");
        if (registered.has(r)) tags.push("registered");
        if (hasOwnGate(r)) tags.push("hasOwnGate");
        if (ded) tags.push("dedicatedGate");
        if (cliOnly(r)) tags.push("cliOnly");
        evidence.set(r, tags);

        if (graded.has(r)) split.gradedPhysics.push(r);
        else if (sp.length) { split.spawned.push(r); why.set(r, sp.slice(0, 2).join(", ")); }
        else if (ungraded.has(r)) split.ungradedPhysics.push(r);
        else if (registered.has(r)) split.registered.push(r);
        else if (hasOwnGate(r)) split.hasOwnGate.push(r);
        else if (ded) { split.dedicatedGate.push(r); why.set(r, ded); }
        else if (cliOnly(r)) split.cliOnly.push(r);
        else split.unclassified.push(r);
    }
    const multi = act.filter((r) => (evidence.get(r) || []).length > 1);
    return { total: act.length, split, why, graded, ungraded, evidence, multi, subjects };
}

export const MEASURED_V3548 = {
    actionable: 104,                       // graveyard's own number at v3547; its baseline is 100 and it is RED
    split: { gradedPhysics: 0, spawned: 5, ungradedPhysics: 19, registered: 13, hasOwnGate: 34, unclassified: 32 },
    // AND 103 not 104: writing this file rescued moduleRefs.mjs from the pile by importing it. See section 1.
    spawnCorpusDefect: {
        wrong: 31, right: 5, proseCorpusOnWholePile: 77,
        note: "My first spawn corpus was every .bat/.sh/.json/.md/.yml and reported 31 of 36 SPAWNED. It " +
              "included BACKLOG.md, TODO.md, knowledge-index.json and okf/claims prose, so A PROSE MENTION " +
              "COUNTED AS A SPAWN -- the exact defect graveyard was rebuilt to fix at v3451, committed inside " +
              "the round examining it. EIGHTFOLD, and the give-away was that the number was implausible.",
    },
    complementarity: "graded INTERSECT actionable = 0, BY CONSTRUCTION: graded means reachable from a device " +
        "bind, a bind is a non-gate importer, and a non-gate importer is exactly what disqualifies a module " +
        "from being gate-only. v3448's 'two instruments, one population, OPPOSITE framings' is REFUTED -- they " +
        "are COMPLEMENTARY. The real overlap is with ungraded (19) and it is the AGREEING one.",
    theSix: "Of the six v3448 named: friedmann and lensing are now GRADED and off the pile (bound to " +
        "astroparticle from v3501); beerLambert and kerrLadder are ungraded AND actionable; halo and " +
        "oscillation are MODES, not standalone modules.",
    buildTools: "buildKnowledgeIndex and buildPageIndex are NOT spawn-rescued and have no DEDICATED gate " +
        "(v3551 corrected the narrower claim: instruments-selfcheck.mjs and pageIndex-selfcheck.mjs DO call " +
        "them for real, to check freshness -- 'nothing invokes them' was wrong). What survives: no launcher " +
        "or npm script REBUILDS the shipped artefact -- a person still runs these by hand, and the ship " +
        "ritual that says so lives in a person's notes rather than in the tree.",
};

/**
 * v3558. The v3548 register above is LEFT STANDING with its own numbers -- a superseded measurement is a record
 * that the question was asked (v3202), and its counts are correct for the tree it was taken on.
 */
export const MEASURED_V3558 = {
    before: { actionable: 105, unclassified: 25 },
    // *** THE BUCKET AND THE SIGNAL ARE DIFFERENT NUMBERS, AND THE GATE CAUGHT ME WRITING ONE FOR THE OTHER. ***
    // The sole-subject signal reaches SIX modules the naming convention misses; two of them (corpus.mjs,
    // roundTripCensus.mjs) are already `registered` and lose the if-chain, so the BUCKET shows four. Recording
    // only the four would have understated the rule's reach by a third -- which is the very thing `evidence`
    // was added to stop an exclusive sort from doing.
    after: { dedicatedGateBucket: 4, dedicatedGateSignal: 6, cliOnlyBucket: 8, unclassifiedRemaining: 13 },
    routeOverlap: { agree: 34, nameOnly: 41, soleSubjectOnly: 6 },
    dedicatedGateRule:
        "A gate whose ONLY subject is this module IS its dedicated gate, WHATEVER IT IS NAMED. hasOwnGate's " +
        "<basename>-selfcheck.mjs test is a PROXY for that, and it misses a gate named for the IDEA. v3550 " +
        "wrote exactly this about tools/voxelExtremity-selfcheck.mjs and world/VoxelWorld.js IN PROSE, where " +
        "nothing re-derives it -- a wiring claim in prose, one round old, inside the file it is about.",
    dedicatedGateNegative:
        "It refuses run-device.mjs, which has SIX gate importers and whose leanest imports FOUR modules. A gate " +
        "that tests this module alongside five others was not built for it -- the same line v3551 drew when it " +
        "refused to credit buildKnowledgeIndex with instruments-selfcheck.mjs.",
    mainGuardSpellings: 6,
    stripperGap: { raw: 35, codeOnly: 22, noComments: 34 },
    stripperNote:
        "codeOnly() IS THE WRONG STRIPPER FOR A MAIN GUARD AND MISSES TWELVE. It blanks string literals, and " +
        "this tree's commonest spelling is a TEMPLATE LITERAL -- `file://${process.argv[1]}` -- so the entry " +
        "point vanishes. v3526's pair from a new angle: codeOnly for an IDIOM, noComments for TEXT THE CODE " +
        "CONTAINS, and a main guard is an idiom whose operand is text.",
    knownStripperLimit:
        "noComments reads 34 where raw text reads 35, and the difference is tools/ship/proseAudit.mjs, whose " +
        "REAL main block the stripper cannot see. NOT a prose rescue -- the lexer DESYNCS on a regex literal " +
        "containing a quote, which sourceScan's own header warns about, in the file most full of them. A KNOWN " +
        "LIMIT OF A SHARED PRIMITIVE, REPORTED WITH ITS NAME rather than routed around with a second stripper.",
    evidenceIsNotTheSort:
        "The buckets are EXCLUSIVE, so a module carrying two signals had one dropped by the order of an " +
        "if-chain -- emitStrictLibm.mjs carries both new ones. The partition stays (it is what makes the " +
        "counts readable and the gate checks it sums) and `evidence` now records every signal for every " +
        "member. A SORT IS A VIEW; IT MUST NOT BE THE ONLY RECORD.",
    typedHeadline:
        "reportLines printed 'WHICH 104' as a LITERAL one line above the derived count, and reportingTools' " +
        "page label read 'Which 104 orphans?'. The tree reads 105. A hand-typed count inside the report whose " +
        "subject is derived evidence, already stale by one, in BOTH the terminal output and the page row.",
    stillOwed:
        "THIRTEEN, and they are two different things rather than one list. Correct-by-construction per-call " +
        "primitives driven by their gate: coverage, suspiciousZero, routeContrast, trendVsNoise, skillTrial, " +
        "imagePair, bptt, occludedHuntEnv. BUILT ENGINE FEATURES NOTHING WIRED, which is real debt of the " +
        "ui/roundTrip.js kind: physics/livePanel.js, ui/radarManager.js, simulation/lbm/lbmShader.js, " +
        "physics/octree/svoGenerator.js, voxel/ddaFloat32.js. NONE IS DECIDED HERE.",
};

// ---- FRONT DOOR -------------------------------------------------------------------------------------------
export function reportLines({ live = true } = {}) {
    const L = [];
    // *** THE HEADLINE IS DERIVED. *** It read "WHICH 104" as a LITERAL, one line above the computed count, and
    // the tree had moved to 105 -- a typed number inside the report whose whole subject is derived evidence.
    const r = live ? classify() : null;
    L.push("[orphanTriage] WHICH " + (r ? r.total : "?") +
           " -- graveyard's actionable pile sorted by evidence already in the tree");
    L.push("");
    if (live) {
        L.push("  " + r.total + " actionable (graveyard's own derivation, same resolver, same exclusions)");
        const rows = [["gradedPhysics", "reachable from a device bind -- MUST be 0, see below"],
                      ["spawned", "named by a LAUNCHER (.bat/.sh/.command/.ps1, package.json scripts)"],
                      ["ungradedPhysics", "physics with a gate and no bind -- both instruments AGREE"],
                      ["registered", "named in reportingTools, so it has a front door and a page row"],
                      ["hasOwnGate", "a <name>-selfcheck.mjs exists ANYWHERE in the tree (v3551: was same-dir only)"],
                      ["dedicatedGate", "a gate whose ONLY subject is this module -- CONCEPT-NAMED (v3558)"],
                      ["cliOnly", "has a main block, no page row -- A WORK LIST, NOT AN EXEMPTION (v3558)"],
                      ["unclassified", "*** THE READ-ONE-AT-A-TIME LIST ***"]];
        for (const [k, note] of rows)
            L.push("    " + k.padEnd(16) + String(r.split[k].length).padStart(4) + "   " + note);
        L.push("");
        L.push("  *** graded INTERSECT actionable = " + r.split.gradedPhysics.length +
               ". NOT LUCK: " + MEASURED_V3548.complementarity.split(" v3448's")[0].trim());
        L.push("");
        L.push("  SPAWNED, and each names the executable that runs it:");
        for (const s of r.split.spawned) L.push("    " + s.padEnd(38) + " <- " + (r.why.get(s) || ""));
        L.push("");
        L.push("  DEDICATED GATE, NAMED FOR THE CONCEPT RATHER THAN THE MODULE (" + r.split.dedicatedGate.length +
               ") -- the gate's ONLY subject is that module:");
        for (const s of r.split.dedicatedGate) L.push("    " + s.padEnd(38) + " <- " + (r.why.get(s) || ""));
        L.push("");
        L.push("  A CLI FRONT DOOR AND NO PAGE ROW (" + r.split.cliOnly.length +
               ") -- runnable, and by this project's own law UNFINISHED until it has a page:");
        for (const s of r.split.cliOnly) L.push("    " + s);
        L.push("");
        L.push("  CARRYING MORE THAN ONE SIGNAL (" + r.multi.length +
               ") -- the exclusive sort shows only the first, so they are listed here too:");
        for (const s of r.multi) L.push("    " + s.padEnd(38) + " " + (r.evidence.get(s) || []).join(" + "));
        L.push("");
        L.push("  THE UNCLASSIFIED PILE (" + r.split.unclassified.length + "):");
        for (const s of r.split.unclassified) L.push("    " + s);
    }
    L.push("");
    L.push("  *** THE SPAWN CORPUS IS EXECUTABLES ONLY, AND THAT IS A CORRECTION: " +
           MEASURED_V3548.spawnCorpusDefect.note);
    L.push("  *** " + MEASURED_V3548.buildTools);
    return L;
}

// A REPORTING TOOL MUST PRINT AND EXIT ZERO; the gate beside it is what exits nonzero.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
