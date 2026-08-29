// WebGLEngine/physics/proposers.mjs — v3284
// ---------------------------------------------------------------------------------------------------------------
// THE LAB-WIDE PROPOSER REGISTRY — generalizing the shape the HMC tuner and the measurement-budget allocator
// both arrived at independently, before a third instrument invents a slightly different one.
//
// THE SHAPE, and it is the same shape in both existing cases:
//     propose(knobs)     -> a candidate setting. Sees the data. Sees the reward. NEVER sees a verdict.
//     score(candidate)   -> cheap, fast, and OPTIMIZABLE. This is what the proposer maximizes.
//     adjudicate(cand)   -> expensive, independent, and anchored to something the proposer cannot influence:
//                           a closed form, an exact identity, a measurement from another mechanism.
// The separation is the entire safety property. A proposer that could write its own verdict would tune the
// verdict, and both of the existing devices measured exactly that failure: the HMC tuner's acceptance-only
// reward picks eps = 0.02 at 100% acceptance and is 89x worse, and the budget allocator's "confident
// measurements" reward camps in the deep phases where nothing is learned. In both cases the SCORE was happy.
// Only the adjudicator, holding a number the proposer could not move, said no.
//
// THE KNOB LICENCE, deliberately mirroring the update-policy tier ratchet in ai-bridge (import the idea, not the
// code -- one is about installing builds, the other about turning dials, and conflating them would be worse than
// the duplication):
//     "read"    -- may report what a knob is, may not change it
//     "propose" -- may suggest a value; a human or a gate applies it
//     "adopt"   -- may apply a value ON ITS OWN, and ONLY after adjudicate() returns pass
// THE RATCHET: grantLicence can only move a device UP a tier when the caller supplies a passing adjudication,
// and NOTHING in this module can raise its own tier. A proposer asking for more licence is a request, never a
// grant -- exactly as the hub can never raise a phone's update tier.
// ---------------------------------------------------------------------------------------------------------------
//
// v3285 -- THE RATCHET IS NOW DURABLE, which it had to be to mean anything. v3284 mirrored the update-policy
// TIER IDEA and not its PERSISTENCE: grants lived in a Map, so a tier earned by adjudicated evidence evaporated
// on process exit and there was no record of what had been granted on what grounds. A ratchet that resets every
// restart is a suggestion. The licence file carries the tier, the evidence that bought it, and when -- so the
// question "why is this device allowed to turn its own knobs" has a written answer.
//
// THE FILE IS READ WITH THE SAME SUSPICION AS ANY OTHER INPUT: a licence claiming a tier is only honoured if it
// carries the evidence that tier requires, so hand-editing "adopt" into the JSON grants nothing. That is the
// difference between persisting a DECISION and persisting a CLAIM, and it is the same rule the peer path
// learned in v3284 -- the artefact does not get a vote on its own trustworthiness.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TIERS = ["read", "propose", "adopt"];
export const tierRank = (t) => TIERS.indexOf(t);

const REGISTRY = new Map();

// Register an instrument's knobs. `adjudicate` is REQUIRED: an instrument with no independent verdict cannot be
// tuned by anything, at any tier, and registering one without it is a programming error rather than a warning.
// v3286 -- `instrument` is the registry id this knob belongs to, carried EXPLICITLY rather than inferred from
// the proposer's name. The first version of the knob-registry gate tried to match "lz-window" to "landau-zener"
// by stem and reported a false orphan; a link that has to be guessed is not a link.
export function registerProposer({ id, knobs, propose, score, adjudicate, defaultTier = "propose", notes = "", instrument = null, search = null }) {
    if (!id || typeof propose !== "function" || typeof score !== "function" || typeof adjudicate !== "function")
        throw new Error("registerProposer(" + id + "): propose, score and adjudicate are all required");
    if (!TIERS.includes(defaultTier)) throw new Error("unknown tier " + defaultTier);
    // v4066 -- `search` is OPTIONAL and OPT-IN: declare it and runProposer hunts the boundary by bisection,
    // omit it and the static shortlist walk runs exactly as it always has. propose() stays REQUIRED even for a
    // searching proposer, and that is deliberate rather than an oversight -- it is the fallback the gate drives
    // with {adaptive:false} to prove the two paths are separable, and it keeps a searching instrument readable
    // by every tool that already knows how to ask a proposer what it would offer.
    if (search) {
        if (typeof search.make !== "function") throw new Error("registerProposer(" + id + "): search.make(value) is required -- the search walks knob VALUES and needs to build a candidate from one");
        if (search.cheap === undefined || search.costly === undefined) throw new Error("registerProposer(" + id + "): search needs both cheap and costly ends -- the direction is declared, never inferred");
    }
    REGISTRY.set(id, { id, knobs, propose, score, adjudicate, tier: defaultTier, notes, instrument, search, granted: [] });
    return REGISTRY.get(id);
}
export const getProposer = (id) => REGISTRY.get(id);
export const listProposers = () => [...REGISTRY.values()].map((p) => ({ id: p.id, knobs: p.knobs, tier: p.tier, notes: p.notes, instrument: p.instrument }));
export function resetRegistry() { REGISTRY.clear(); }

// THE RATCHET. Raising a tier requires a passing adjudication supplied BY THE CALLER, and the verdict object is
// re-checked here rather than trusted as a boolean: a proposer that could hand in {pass:true} would be grading
// itself, which is the failure this whole structure exists to prevent.
export function grantLicence(id, tier, verdict, { persist = true } = {}) {
    const p = REGISTRY.get(id);
    if (!p) throw new Error("no such proposer: " + id);
    if (!TIERS.includes(tier)) throw new Error("unknown tier " + tier);
    if (tierRank(tier) <= tierRank(p.tier)) {
        p.tier = tier;
        if (persist) writeLicences();
        return { ok: true, tier: p.tier, reason: "lowered or unchanged; always allowed" };
    }
    if (!verdict || verdict.pass !== true || typeof verdict.evidence !== "object")
        return { ok: false, tier: p.tier, reason: "raising a tier needs a passing adjudication WITH evidence; a bare boolean is not enough" };
    p.tier = tier; p.granted.push({ tier, at: Date.now(), evidence: verdict.evidence });
    if (persist) writeLicences();
    return { ok: true, tier: p.tier, reason: "granted on adjudicated evidence" };
}

// ---- durability ---------------------------------------------------------------------------------------------
// Default location sits beside the other roundhouse state. Overridable so a gate can use a temp file and never
// touch shipped state -- a gate that wrote to the real licence file would be changing the thing it audits.
let LICENCE_PATH = (() => {
    try { return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tools", "roundhouse", "knob-licences.json"); }
    catch { return "knob-licences.json"; }
})();
export function setLicencePath(p) { LICENCE_PATH = p; }
export function licencePath() { return LICENCE_PATH; }

export function writeLicences() {
    const out = { kind: "swek-knob-licences", at: new Date().toISOString(), licences: {} };
    for (const p of REGISTRY.values()) {
        // "read" is the floor, so recording it buys nothing and would grow the file forever
        if (p.tier === "read" && !p.granted.length) continue;
        out.licences[p.id] = { tier: p.tier, granted: p.granted };
    }
    try { fs.writeFileSync(LICENCE_PATH, JSON.stringify(out, null, 2) + "\n"); return { ok: true, path: LICENCE_PATH }; }
    catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

/**
 * Restore tiers from disk. A STORED TIER IS A CLAIM, NOT A GRANT: "adopt" is honoured only if the record carries
 * the evidence that tier requires, so hand-editing the file upgrades nothing. Anything unsupported falls back to
 * the registered default and is REPORTED -- silently downgrading would leave an operator wondering why a device
 * stopped tuning itself.
 */
export function loadLicences({ now = Date.now(), maxAgeMs = null } = {}) {
    let raw = null;
    try { raw = JSON.parse(fs.readFileSync(LICENCE_PATH, "utf8")); } catch { return { ok: true, restored: 0, rejected: [], reason: "no licence file (every proposer keeps its registered default)" }; }
    const rejected = [];
    let restored = 0;
    for (const [id, rec] of Object.entries((raw && raw.licences) || {})) {
        const p = REGISTRY.get(id);
        if (!p) { rejected.push({ id, why: "no such proposer registered" }); continue; }
        if (!rec || !TIERS.includes(rec.tier)) { rejected.push({ id, why: "unknown tier in file" }); continue; }
        if (tierRank(rec.tier) > tierRank("propose")) {
            const ev = Array.isArray(rec.granted) ? rec.granted.filter((g) => g && g.tier === rec.tier && g.evidence && typeof g.evidence === "object") : [];
            if (!ev.length) { rejected.push({ id, why: "tier '" + rec.tier + "' claimed with no adjudicated evidence -- ignored" }); continue; }
            if (maxAgeMs != null) {
                const newest = Math.max(...ev.map((g) => Number(g.at) || 0));
                // EVIDENCE GOES STALE: hardware changes, code changes, and a verdict from a year ago is a fact
                // about a machine that may no longer exist. Expiry is opt-in so the default cannot surprise, but
                // the mechanism is here rather than left to a caller to reinvent.
                if (now - newest > maxAgeMs) { rejected.push({ id, why: "evidence older than the permitted age -- re-adjudication required" }); continue; }
            }
        }
        p.tier = rec.tier; p.granted = Array.isArray(rec.granted) ? rec.granted : [];
        restored++;
    }
    return { ok: true, restored, rejected };
}

// The one path by which a knob value may be applied. Everything routes through here so the tier check exists in
// exactly one place; a device that applied its own knobs directly would make the licence decorative.
export function applyKnobs(id, candidate, { force = false } = {}) {
    const p = REGISTRY.get(id);
    if (!p) throw new Error("no such proposer: " + id);
    if (p.tier === "read") return { applied: false, reason: "tier 'read': may report, may not change" };
    if (p.tier === "propose" && !force) return { applied: false, reason: "tier 'propose': a human or a gate applies this", candidate };
    const verdict = p.adjudicate(candidate);
    if (!verdict.pass) return { applied: false, reason: "adjudicator refused", verdict };
    return { applied: true, candidate, verdict };
}

// Run the full loop for one instrument and report honestly, including the case where the best-scoring candidate
// is REJECTED -- which is the interesting case and the one a summary line would hide.
//
// v3594 -- *** IT REPORTED THE GREEDY PICK'S VERDICT AND NOTHING ELSE, SO ITS ONLY POSSIBLE ANSWER ON A
// WORKING PROPOSER WAS "REFUSED". *** This module's own header states the design: the score is what the
// proposer MAXIMISES and the adjudicator is the independent thing that says no -- and it records that the HMC
// tuner's greedy optimum is 89x worse than the right answer and that the budget allocator camps where nothing
// is learned. IN BOTH CASES THE GREEDY PICK IS *MEANT* TO BE REFUSED. So a loop that adjudicated only
// scored[0] could report that the search failed and could NEVER report what survived, which is the one thing
// somebody pressing a button wants to know.
//
// THE FIX IS TO WALK THE SCORE ORDER AND STOP AT THE FIRST PASS, which is why the score's DIRECTION had to be
// declared in the same round: `accepted` means THE CHEAPEST CANDIDATE THAT SURVIVES ADJUDICATION, and that
// sentence is only true if higher score really is more desirable. See SCORE_IS_A_REWARD below.
//
// COST IS THE MINIMUM, NOT THE FULL SWEEP: if the greedy pick passes, exactly ONE adjudication runs and this
// is bit-for-bit the old behaviour. Extra adjudications happen only in the case that previously reported a
// bare refusal, i.e. only where the old answer was least useful.
//
// `best` / `bestScore` / `verdict` / `adopted` / `scored` KEEP THEIR EXACT OLD MEANING. Three existing gates
// read them, and redefining a field in place is how a green gate quietly starts asserting something else.
export function runProposer(id, opts = {}) {
    const p = REGISTRY.get(id);
    if (!p) throw new Error("no such proposer: " + id);
    // v4066 -- THE ADAPTIVE PATH IS OPT-IN AT REGISTRATION AND NOWHERE ELSE. A proposer that declares `search`
    // gets the boundary hunt; the ten registered before this round declare none and take the identical static
    // path they always did, byte for byte. `opts.adaptive === false` forces the static list even on a searching
    // proposer, which is how the gate proves the two paths are separable rather than entangled.
    if (p.search && opts.adaptive !== false) return runAdaptiveProposer(p, opts);
    const candidates = p.propose(opts);
    const scored = candidates.map((c) => ({ candidate: c, score: p.score(c, opts) }));
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    // Walk in score order, adjudicating until one passes. scored[0]'s verdict IS the old `verdict`.
    let accepted = null, acceptedRank = -1, acceptedScore = null, acceptedVerdict = null;
    for (let i = 0; i < scored.length; i++) {
        const v = p.adjudicate(scored[i].candidate, opts);
        scored[i].verdict = v;
        if (v.pass) { accepted = scored[i].candidate; acceptedRank = i; acceptedScore = scored[i].score;
                      acceptedVerdict = v; break; }
    }
    const verdict = scored[0].verdict;
    const adjudicated = scored.filter((s) => s.verdict !== undefined).length;

    return { id, tier: p.tier, tried: scored.length, best: best.candidate, bestScore: best.score,
             verdict, adopted: verdict.pass && p.tier === "adopt", scored,
             // v3594 additions. `accepted` is null when EVERY candidate is refused, which is a real outcome
             // and not an error -- the proposer offered nothing this instrument's own key will stand behind.
             accepted, acceptedRank, acceptedScore, acceptedVerdict, adjudicated,
             // v4066 -- null on the static path, so a reader can always tell WHICH search produced the answer.
             // Two answers that mean different things must not wear the same shape without a label.
             searched: null };
}

// ---------------------------------------------------------------------------------------------------------------
// v4066 -- THE ADAPTIVE SHAPE: FIND THE BOUNDARY, DO NOT GUESS AT IT.
//
// *** WHAT WAS ACTUALLY WRONG, AND IT IS THE SAME IN ALL TEN REGISTERED PROPOSERS. *** Every propose() in this
// lab returns a HAND-PICKED SHORTLIST -- gyroKnob offers [2,5,10,20,40,80,160], schrodinger-grid offers
// N in {10,60,400}. runProposer then walks them in score order and stops at the first pass. So the honest
// reading of any answer it has ever given is "the cheapest of the three-to-seven numbers a human typed that
// happened to survive", NOT "the cheapest value that survives". Those differ by however far the typed list sits
// from the real boundary, and nothing in the loop could report that gap because nothing in the loop knew it.
//
// THE SEARCH IS A BISECTION AND THE MACHINERY FOR IT WAS ALREADY HERE. This module's own header states the two
// properties a boundary hunt needs and the reason both are load-bearing: score() is MONOTONE and declared
// higher-is-cheaper (SCORE_IS_A_REWARD), and adjudicate() is INDEPENDENT -- the proposer cannot move it. So the
// verdict flips exactly once along the cheap->costly axis, and bisecting on the adjudicator's own answer walks
// straight to it. This is the same technique the hands in-plane-roll fixture used to derive a boundary pose by
// bisection on the module's own verdict, applied to the knob instead of the pose.
//
// *** MONOTONICITY IS AN ASSUMPTION AND IT IS CHECKED RATHER THAN ASSERTED. *** A bisection over a verdict that
// flips more than once lands on A boundary, silently, and reports it with exactly the same confidence as the
// right one -- which would be a worse failure than the shortlist it replaces, because it LOOKS like a search.
// So every result carries a VERIFIED bracket (the cheap end really fails, the costly end really passes) and a
// VERIFIED local boundary (the accepted value passes, the next step cheaper fails). Neither proves global
// monotonicity -- nothing short of a full sweep does, and a full sweep is the cost this exists to avoid -- so
// `assumesMonotone` is reported true on every adaptive result rather than quietly held.
// ---------------------------------------------------------------------------------------------------------------

/**
 * Walk to the pass/fail boundary between a CHEAP end that fails and a COSTLY end that passes.
 *
 * Direction is declared by the caller rather than inferred from the numbers, because both directions are real
 * in this lab: schrodinger's grid is cheap at SMALL N (score 1/N) while md's timestep is cheap at LARGE dt
 * (score dt). Bisection never compares `cheap` and `costly` numerically -- it only ever holds "this end fails,
 * that end passes" -- so a descending range works unchanged.
 *
 * @param {object} o
 * @param {number} o.cheap   knob value at the cheap end, EXPECTED TO FAIL adjudication
 * @param {number} o.costly  knob value at the costly end, EXPECTED TO PASS adjudication
 * @param {(v:number)=>boolean} o.passes   the adjudicator's verdict at a value, as a bare boolean
 * @param {boolean} [o.integer]  stop when the two ends are adjacent integers
 * @param {number}  [o.tol]      continuous stopping width; ignored when integer
 * @param {number}  [o.steps]    hard cap on halvings, so a pathological passes() cannot spin forever
 */
export function bisectBoundary({ cheap, costly, passes, integer = false, tol = 0, steps = 40 }) {
    if (typeof passes !== "function") throw new TypeError("bisectBoundary needs a passes(value) function");
    if (!Number.isFinite(cheap) || !Number.isFinite(costly)) throw new TypeError("cheap and costly must be finite numbers");
    if (cheap === costly) throw new RangeError("cheap and costly must differ -- there is no range to search");
    let calls = 0;
    const P = (v) => { calls++; return passes(v) === true; };

    // THE BRACKET IS CHECKED FIRST AND BOTH FAILURES ARE REPORTED AS OUTCOMES, NOT ERRORS. "the cheapest end
    // already passes" and "the costliest end still fails" are both real answers about this instrument, and a
    // search that threw on them would hide the two most interesting things it can discover.
    if (P(cheap)) {
        return { ok: true, bracketed: false, boundary: cheap, failingSide: null, calls, iters: 0,
                 why: "the cheap end already passes -- the whole range survives, so the cheapest value IS the answer" };
    }
    if (!P(costly)) {
        return { ok: false, bracketed: false, boundary: null, failingSide: cheap, calls, iters: 0,
                 why: "the costly end still fails -- no value in this range survives adjudication, and that is a " +
                      "finding about the instrument rather than a search that went wrong" };
    }

    // INVARIANT, held every iteration: passes(lo) === false and passes(hi) === true.
    let lo = cheap, hi = costly, iters = 0;
    while (iters < steps) {
        if (integer) { if (Math.abs(hi - lo) <= 1) break; }
        else if (tol > 0 && Math.abs(hi - lo) <= tol) break;
        const mid = integer ? Math.round((lo + hi) / 2) : (lo + hi) / 2;
        if (mid === lo || mid === hi) break;          // no representable room left between the ends
        if (P(mid)) hi = mid; else lo = mid;
        iters++;
    }
    // `hi` is the answer: the passing side of the boundary. `lo` is the last value proven to fail, which is what
    // makes the answer meaningful -- a passing value with no failing neighbour is not a boundary, it is a guess.
    return { ok: true, bracketed: true, boundary: hi, failingSide: lo, calls, iters };
}

/**
 * *** COUNT THE VERDICT FLIPS ACROSS THE RANGE, BECAUSE "MONOTONE" WAS AN ASSUMPTION AND THE FIRST INSTRUMENT
 * IT WAS TRIED ON VIOLATED IT. *** v4066 declared `assumesMonotone` and adopted the search on four proposers;
 * lz-window was one of them, and its own registry comment presented a clean falling ladder -- "rel error 0.207
 * at T=1, 0.094 at T=2, 0.064 at T=3, 0.020 at T=6, 0.004 at T=40". SAMPLED DENSELY IT IS NOT A LADDER: the
 * Landau-Zener sweep RINGS, and the verdict reads PASS at T=4, fail at 5, PASS at 6 and 7, fail at 8, PASS at
 * 9. Five flips where the comment implied one, because every T in that comment happened to land on the same
 * side of the oscillation.
 *
 * A bisection over that finds A boundary and reports it with exactly the confidence of a right answer -- it
 * returned T=5.875 while T=4, cheaper, also passes. The local edge check cannot see this: T=5.875 really does
 * pass and T=5.837 really does fail. ONLY A SWEEP CAN, so a sweep is what earns a search the right to run.
 *
 * This is deliberately a PROBE and not a proof: N samples can miss a flip narrower than the spacing, and it
 * says so in `resolved`. It is a cheap, honest filter against the failure that actually happened, not a
 * guarantee against every failure that could.
 *
 * @returns {{flips:number, monotone:boolean, samples:number, firstPass:number|null, trail:Array}}
 */
export function probeMonotone({ cheap, costly, passes, samples = 24, integer = false }) {
    if (typeof passes !== "function") throw new TypeError("probeMonotone needs a passes(value) function");
    const n = Math.max(3, samples | 0);
    const trail = [];
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        let v = cheap + (costly - cheap) * t;
        if (integer) v = Math.round(v);
        if (trail.length && trail[trail.length - 1].value === v) continue;   // integer rounding can repeat
        trail.push({ value: v, pass: passes(v) === true });
    }
    let flips = 0;
    for (let i = 1; i < trail.length; i++) if (trail[i].pass !== trail[i - 1].pass) flips++;
    const firstPass = trail.find((x) => x.pass);
    return {
        flips, monotone: flips <= 1, samples: trail.length,
        firstPass: firstPass ? firstPass.value : null,
        // A single flip cheap->costly is the shape a bisection is valid over. Zero flips means the whole range
        // agrees and there is no boundary in it. Two or more means the search would be picking one arbitrarily.
        resolved: "sampled " + trail.length + " points; a flip narrower than the spacing is invisible to this probe",
        trail,
    };
}

/**
 * The adaptive counterpart to runProposer's static walk. Returns THE SAME SHAPE -- every field keeps the exact
 * meaning three existing gates already read -- plus `searched`, which is null on the static path.
 *
 * `scored` is built from the probe trail rather than from a candidate list, so it stays what it always was: the
 * values this run actually considered, in descending score order, each with the verdict it earned. That makes
 * the two paths readable by one reader, which is the whole reason the shape is preserved.
 */
function runAdaptiveProposer(p, opts = {}) {
    const s = p.search;
    const make = s.make || ((v) => v);
    const trail = new Map();   // knob value -> { candidate, score, verdict }

    const probe = (v) => {
        if (trail.has(v)) return trail.get(v).verdict.pass === true;   // never pay twice for the same value
        const candidate = make(v, opts);
        const verdict = p.adjudicate(candidate, opts);
        trail.set(v, { candidate, score: p.score(candidate, opts), verdict, knob: v });
        return verdict.pass === true;
    };

    const cheap = (typeof s.cheap === "function") ? s.cheap(opts) : s.cheap;
    const costly = (typeof s.costly === "function") ? s.costly(opts) : s.costly;

    // *** THE DECLARED DIRECTION IS VERIFIED AGAINST THE DECLARED SCORE, because getting it backwards is a real
    // and recent bug in this lab: v3594 found two proposers scoring on the adjudicator's own error term, which
    // sorted the search into handing the adjudicator its WORST candidate every time. Here the same mistake would
    // silently invert the search -- bisecting toward the expensive end and calling it cheap -- so it is checked
    // once, out loud, before any bisection happens. ***
    const cheapScore = p.score(make(cheap, opts), opts);
    const costlyScore = p.score(make(costly, opts), opts);
    const directionOk = cheapScore > costlyScore;

    const res = bisectBoundary({ cheap, costly, passes: probe, integer: !!s.integer,
                                tol: s.tol || 0, steps: s.steps || 40 });

    // The local boundary check: the answer passes AND the last value proven cheaper fails. This is what separates
    // "a value that works" from "the edge of what works", and it is the only monotonicity evidence a bisection
    // can honestly offer (see this section's header).
    let boundaryVerified = false;
    if (res.ok && res.bracketed) {
        const at = trail.get(res.boundary), below = trail.get(res.failingSide);
        boundaryVerified = !!(at && below && at.verdict.pass === true && below.verdict.pass === false);
    }

    const scored = [...trail.values()].sort((a, b) => b.score - a.score);
    const best = scored[0];
    const acceptedEntry = (res.ok && res.boundary !== null) ? trail.get(res.boundary) : null;
    const acceptedRank = acceptedEntry ? scored.findIndex((x) => x === acceptedEntry) : -1;

    return {
        id: p.id, tier: p.tier, tried: scored.length,
        best: best.candidate, bestScore: best.score,
        verdict: best.verdict,
        adopted: !!(acceptedEntry && p.tier === "adopt"),
        scored,
        accepted: acceptedEntry ? acceptedEntry.candidate : null,
        acceptedRank,
        acceptedScore: acceptedEntry ? acceptedEntry.score : null,
        acceptedVerdict: acceptedEntry ? acceptedEntry.verdict : null,
        adjudicated: trail.size,
        searched: {
            kind: "bisect", knob: s.knob || null, cheap, costly,
            integer: !!s.integer, boundary: res.boundary, failingSide: res.failingSide,
            calls: res.calls, iters: res.iters, bracketed: res.bracketed, why: res.why || null,
            boundaryVerified, directionOk, cheapScore, costlyScore,
            // Reported on EVERY adaptive result, passing or not. A bisection cannot prove the verdict flips only
            // once; it can only prove the bracket and the local edge. Saying so beside the answer is the
            // difference between a measurement and a number.
            assumesMonotone: true,
        },
    };
}

// *** THE CONVENTION runProposer HAS ALWAYS ENFORCED AND NEVER STATED. *** It sorts DESCENDING and takes
// scored[0], so a bigger score is a better candidate. Every proposer registered before v3594 follows it --
// 1/N, 1/T, 1/reps, 1/L, dt: all CHEAPNESS, higher is cheaper is preferred, with the adjudicator as the
// independent thing that refuses a candidate for being too cheap to be right. Two proposers registered at
// v3591 and v3593 returned `adjudicate(c).evidence.relErr` instead, which is backwards TWICE OVER: an error
// is smaller-is-better, so the sort handed the adjudicator the WORST candidate every time; and it is the
// adjudicator's own number, so the search was optimising the verdict it exists to be checked by -- the exact
// thing this file's header forbids in capitals. Both are fixed in gyroKnob.mjs and pileKnob.mjs.
export const SCORE_IS_A_REWARD = {
    direction: "HIGHER IS BETTER. runProposer sorts descending; scored[0] is the candidate the search wants.",
    independence:
        "A score MUST NOT call its own adjudicate(). The separation is the entire safety property (see this " +
        "file's header): a search that optimises the verdict's own number has been told the answer, and the " +
        "adjudicator stops being an independent second opinion and becomes the objective function.",
    shape:
        "Say what the CALLER wants, cheaply and monotonically -- fewer samples, a shorter run, a coarser " +
        "grid, a visible precession. The tension that makes the loop worth running is that the adjudicator " +
        "refuses the greedy optimum; that tension is REAL only if the two quantities are independent.",
    gate: "physics/scoreDirection-selfcheck.mjs drives it: a spy adjudicator that fires if any score consults it.",
};
