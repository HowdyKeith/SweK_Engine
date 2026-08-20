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
export function registerProposer({ id, knobs, propose, score, adjudicate, defaultTier = "propose", notes = "", instrument = null }) {
    if (!id || typeof propose !== "function" || typeof score !== "function" || typeof adjudicate !== "function")
        throw new Error("registerProposer(" + id + "): propose, score and adjudicate are all required");
    if (!TIERS.includes(defaultTier)) throw new Error("unknown tier " + defaultTier);
    REGISTRY.set(id, { id, knobs, propose, score, adjudicate, tier: defaultTier, notes, instrument, granted: [] });
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
             accepted, acceptedRank, acceptedScore, acceptedVerdict, adjudicated };
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
