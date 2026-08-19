// WebGLEngine/tools/roundhouse/curriculum.mjs -- v3698
// ---------------------------------------------------------------------------------------------------------------
// WHAT TO ATTEMPT NEXT, DERIVED FROM WHAT IS ALREADY MEASURED -- AND IT NEVER GRADES ANYTHING.
//
// Voyager (MineDojo, MIT) has three parts: an automatic curriculum, a skill library, and self-verification.
// SweK already has the second and the third, and the third is the stronger of the two designs -- skillbook.mjs
// certifies a strategy only when a MEASURED before/after clears a size bar AND a noise bar (Z_MIN = 2.33), and
// carries UNDERPOWERED for "measured, too small to decide". Voyager keeps a skill when the generated code did
// not throw and an LLM critic approves, WHICH IS THE MODEL JUDGING ITS OWN WORK. THE PART SweK NEVER HAD IS THE
// FIRST ONE: nothing proposes what to attempt next from the capability frontier. This is that, and nothing else.
//
// *** THE DANGER IS OBVIOUS AND IT SHAPES EVERY LINE BELOW: A LOOP THAT GENERATES ITS OWN WORK CAN ALSO MARK IT
// PASSED. *** So:
//   1. THIS FILE PROPOSES AND NEVER GRADES. It has no write path -- it does not touch a baseline, a coverage
//      register, or a freeze file, and its own gate asserts that by mechanism.
//   2. A TASK WITH NO NAMED GRADER IS NOT PROPOSED. Every proposal carries the gate or census that would decide
//      it, and that grader must EXIST ON DISK. Candidates without one are reported in a separate bucket, by
//      name, because "we cannot check this yet" is a finding and not a thing to hide.
//   3. NOTHING IS INVENTED. Every subject name comes out of a registry this tree already maintains; the
//      curriculum does not write task descriptions, it reads counts and says which subject is next.
//   4. A PROPOSAL IS NOT A CLAIM OF VALUE. Ranking says "this is reachable and checkable", never "this is worth
//      doing" -- that judgement is Keith's, and the report says so on every run.
//
// THE FRONTIER RULE, WHICH IS THE ONE IDEA WORTH TAKING FROM VOYAGER: propose what is NOT ALREADY DONE and
// whose PREREQUISITES EXIST. Too easy is already in a register; too hard has no grader yet. What is left is the
// edge, and the edge is where a round is cheap.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENG = path.resolve(HERE, "..", "..");

/**
 * Every kind of task this file knows how to propose, with THE GRADER THAT WOULD DECIDE IT. The grader is a real
 * path, checked on disk before anything is proposed -- a task whose checker does not exist is not a task, it is
 * a wish, and this tree has a word for proposing those.
 */
export const KINDS = [
    { kind: "plant", grader: "tools/roundhouse/plantedCoverage.mjs",
      what: "give this bind a planted error and declare what it overturns",
      why: "plantedCoverage --verify turns the declaration into a measurement; a bind with no plant has never been shown to CATCH anything" },
    { kind: "grade", grader: "tools/roundhouse/gradedCoverage.mjs",
      what: "give this physics module an answer key a device can grade",
      why: "gradedCoverage separates PROVEN from merely imported; an ungraded module is arithmetic nobody checks" },
    // *** OPT-IN, AND THE REASON IS MEASURED: its census (orphanTriage.actionable) WALKS THE WHOLE TREE AND
    // TAKES OVER 285 SECONDS -- the first run of this file timed out at 290s because of it. A curriculum nobody
    // runs proposes nothing, so the default is the two fast kinds and `--doors` adds this one. THE SAME
    // TREATMENT labResults GETS (nine minutes, and verify does not drive it): SLOW IS NOT WRONG, BUT IT MUST BE
    // OPT-IN OR IT SILENTLY BECOMES NEVER. ***
    { kind: "door", slow: true, grader: "tools/ship/graveyard-selfcheck.mjs",
      what: "give this module a caller, or delete it",
      why: "graveyard's actionable pile is the one number that means something -- wire it, or delete it" },
];

export function graderExists(kind) { return fs.existsSync(path.join(ENG, kind.grader)); }

/** Candidates for a plant, straight out of the census -- binds that declare none. NOT a list I wrote. */
let _plantCache = undefined;
async function plantCandidates() {
    // *** v3853 -- THIS ASKED FOR AN EXPORT THAT HAS NEVER EXISTED, AND THE FALLBACK WAS THE SWEEP. ***
    //
    // The line read `P.declaredPlants ? P.declaredPlants(...) : await P.plantedCoverage(...)`. There is no
    // `declaredPlants` in plantedCoverage.mjs and there never was -- the source-only census is called
    // `declaredCensus`. So the ternary took the else branch on EVERY run, and the else branch BUILDS EVERY
    // DEVICE AT EVERY MODE, TWICE. `node tools/roundhouse/curriculum.mjs` took OVER FIVE MINUTES against
    // toolFrontDoor's 120-second budget, exited on the timeout with no output at all, and the gate reported
    // NONZERO EXIT (exit null) -- which is what a carried red looked like from the outside.
    //
    // *** AND declaredCensus's OWN DOCSTRING IS THIS EXACT ACCIDENT, WRITTEN DOWN 282 VERSIONS EARLIER: ***
    // "v3395 learned what that costs at a front door -- capabilityCard ran this and blew toolFrontDoor's
    // budget (every reporting tool runs TWICE at 120s each) and turned a green gate red." The function was
    // split out FOR THIS, with the caveat carried in the name, and this file walked past the name into the
    // sweep because a feature test spelled it wrong. A FEATURE TEST THAT NAMES NOTHING IS ALWAYS FALSE, and
    // an `||` fallback turns always-false into always-the-expensive-route WITHOUT EVER SAYING SO.
    //
    // SO THE NAME IS NOW CALLED DIRECTLY AND NOT PROBED FOR. If plantedCoverage stops exporting it the import
    // throws, plantCandidates returns null, and propose() reports UNMEASURED -- which is the honest answer.
    // A SILENT FALLBACK TO A FIVE-MINUTE SWEEP IS NOT A FALLBACK, IT IS THE DEFECT WEARING A CONDITIONAL.
    //
    // MEASURED BOTH WAYS ON THIS BOX: `node tools/roundhouse/curriculum.mjs` was 5m0s (killed at the 300s
    // ceiling, no output) and is 0.31s. THE CACHE BELOW STAYS ANYWAY -- its reason was never only the cost.
    // The gate calls propose() five times and a curriculum that answered differently between two calls on one
    // unchanged tree would be advising from a frontier that moved while nobody touched it.
    if (_plantCache !== undefined) return _plantCache;
    try {
        const P = await import("./plantedCoverage.mjs");
        const D = await import("./devices.mjs");
        // *** AND declaredCensus ALONE WOULD HAVE BEEN THE WRONG FIX, WHICH ITS OWN SIBLING SAYS OUT LOUD. ***
        // It reads the KNOB shape only, through readsPlantedKnob's /\bplanted\b/ over source -- and
        // declaredPlantMode's docstring, four lines below it, is "readsPlantedKnob cannot see any of them, so
        // they counted as undeclared". Taken bare it calls 65 binds undeclared against the census's 41
        // declared, and would propose plants for binds planted this very arc -- SENDING SOMEBODY TO REDO DONE
        // WORK, which is the one failure refusedPlants() already exists to prevent.
        //
        // SO BOTH SHAPES ARE READ, AND NEITHER IS THE SWEEP. The knob comes from SOURCE; the mode comes from
        // the BUILT DEVICE, which is a thunk and costs milliseconds. What is expensive is RUNNING a device at
        // every mode twice, and nothing here runs one.
        const bySource = P.declaredCensus(ENG, D.DEVICE_NAMES || []);
        const undeclared = [];
        for (const name of bySource.undeclared || []) {
            let dev = null;
            try { dev = await D.getDevice(name); } catch { /* a bind that will not build has declared nothing */ }
            if (!P.declaredPlantMode(dev)) undeclared.push(name);
        }
        _plantCache = undeclared;
    } catch { _plantCache = null; }
    return _plantCache;          // null means COULD NOT MEASURE -- never an empty list, which would read as "none left"
}

/** Candidates for an answer key: physics modules gradedCoverage counts as ungraded. */
let _gradeCache = undefined;
async function gradeCandidates() {
    if (_gradeCache !== undefined) return _gradeCache;
    try {
        const G = await import("./gradedCoverage.mjs");
        const c = G.gradedCoverage(ENG);
        _gradeCache = (c.ungraded || []).map((x) => (typeof x === "string" ? x : x.file || x.name)).filter(Boolean);
    } catch { _gradeCache = null; }
    return _gradeCache;
}

/**
 * Candidates for a door: graveyard's actionable orphans.
 * *** MEMOISED PER PROCESS, AND THE REASON IS A MEASUREMENT: orphanTriage.actionable() WALKS THE WHOLE TREE AND
 * TAKES OVER 285 SECONDS HERE. *** Calling it once per kind per propose() made the first run of this file time
 * out at 290s -- A TIMEOUT IS NOT A FAILURE, and it is also not a tool anybody will run. The cache is scoped to
 * the process and never written to disk: the register cannot change under a single run, and a curriculum that
 * cached ACROSS runs would be advising from a frontier that had already moved.
 */
let _doorCache = undefined;
async function doorCandidates() {
    if (_doorCache !== undefined) return _doorCache;
    try {
        const T = await import("../ship/orphanTriage.mjs");
        _doorCache = (T.actionable() || []).slice();
    } catch { _doorCache = null; }
    return _doorCache;
}

/**
 * *** THE PROPOSAL. *** Returns { proposals, ungradable, unmeasured } and NEVER a bare list: the three states
 * are different findings and collapsing them is how a curriculum starts inventing work. `unmeasured` means a
 * census could not be read at all, which must never be reported as "nothing left to do".
 */
/**
 * *** onPhase IS A CALLBACK, NOT A WRITE. *** The curriculum must stay unable to touch anything (see its gate),
 * so it does not publish its own progress: it CALLS BACK after each census and whoever asked decides what that
 * means. The bridge route sets globalThis.__swekActiveRun around the call; this file never sees it.
 * THE PHASE COUNT IS THE HONEST PROGRESS UNIT AND THE ONLY ONE AVAILABLE: each census is a single opaque call
 * that returns when it returns, so there is nothing finer to report. A SMOOTH BAR HERE WOULD BE A DRAWING, NOT
 * A MEASUREMENT.
 */
/**
 * *** A SUBJECT THAT DECLARED A REFUSAL IS NOT AT THE FRONTIER. *** The proposer reads "is a plant declared" and
 * that CANNOT TELL AN UNEXAMINED SUBJECT FROM AN EXAMINED ONE THAT SAID NO -- beam was proposed for a plant its
 * own bind had already tried and measured to be uncatchable. Re-proposing that sends somebody to redo work
 * deliberately not done. The refusal is read as A FIELD, never grepped out of prose: a mention test is the
 * species of claim this tree has got wrong three times this session alone.
 */
export async function refusedPlants() {
    const out = new Map();
    try {
        // The registry maps a name to a THUNK returning the device; the refusal is declared on the MODULE the
        // device comes from, so the module is what gets read. DEVICE_NAMES is the registry's own list -- this
        // file does not keep a second copy of which devices exist.
        const D = await import("./devices.mjs");
        for (const name of D.DEVICE_NAMES || []) {
            try {
                const dev = await D.getDevice(name);
                const src = (dev && dev.module) || dev;
                const r = src && src.plantRefused;
                if (typeof r === "string" && r) { out.set(name, r); continue; }
            } catch { /* a device that will not load is not a refusal */ }
        }
    } catch { /* no registry: refuse nothing, propose everything -- the safe direction */ }
    return out;
}

export async function propose({ perKind = 3, slow = false, onPhase = null } = {}) {
    const proposals = [], ungradable = [], unmeasured = [], skipped = [], refused = [];
    const sources = { plant: plantCandidates, grade: gradeCandidates, door: doorCandidates };
    // total = the kinds that will actually be ATTEMPTED, so "2 of 3" never counts a phase that was skipped.
    const planned = KINDS.filter((k) => (!k.slow || slow) && graderExists(k)).length;
    let phase = 0;
    for (const k of KINDS) {
        if (k.slow && !slow) { skipped.push({ ...k, why: "SLOW (its census walks the whole tree, >285s) -- pass { slow: true } or --doors" }); continue; }
        if (!graderExists(k)) { ungradable.push({ ...k, why: "its grader is not on disk: " + k.grader }); continue; }
        if (onPhase) { try { onPhase({ kind: k.kind, done: phase, total: planned }); } catch { /* a reporter must never break the report */ } }
        const names = await sources[k.kind]();
        phase++;
        if (names === null) { unmeasured.push({ ...k, why: "the census could not be read -- NOT the same as an empty frontier" }); continue; }
        // Stable order so two runs on one tree agree; the curriculum must not shuffle its own advice.
        const no = k.kind === "plant" ? await refusedPlants() : new Map();
        for (const name of names.slice().sort()) {
            if (no.has(name)) { refused.push({ kind: k.kind, subject: name, why: no.get(name) }); }
        }
        for (const name of names.slice().sort().filter((n) => !no.has(n)).slice(0, perKind)) {
            proposals.push({ kind: k.kind, subject: name, grader: k.grader, task: k.what, why: k.why });
        }
    }
    if (onPhase) { try { onPhase({ kind: null, done: phase, total: planned }); } catch {} }
    return { proposals, ungradable, unmeasured, skipped, refused, phases: planned };
}

export async function reportLines(opts) {
    const r = await propose(opts);
    const L = ["[curriculum] what is at the frontier -- PROPOSED, NEVER GRADED"];
    for (const p of r.proposals) {
        L.push("  " + p.kind.toUpperCase().padEnd(6) + p.subject);
        L.push("         " + p.task + "   [graded by " + p.grader + "]");
    }
    if (!r.proposals.length) L.push("  (nothing proposable -- see the two lines below before reading that as 'done')");
    for (const u of r.ungradable) L.push("  NO GRADER   " + u.kind + ": " + u.why);
    for (const u of r.unmeasured) L.push("  UNMEASURED  " + u.kind + ": " + u.why);
    for (const u of r.skipped) L.push("  SKIPPED     " + u.kind + ": " + u.why);
    for (const u of r.refused) L.push("  REFUSED     " + u.subject + ": " + u.why);
    L.push("");
    L.push("  A PROPOSAL IS NOT A CLAIM OF VALUE. This says a subject is REACHABLE and CHECKABLE, never that it");
    L.push("  is worth doing -- that judgement is Keith's. And nothing here marks anything done: the graders");
    L.push("  named above are the only things that decide, and this file cannot write to any of them.");
    return L;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    reportLines({ slow: process.argv.includes("--doors") }).then((L) => console.log(L.join("\n")));
}
