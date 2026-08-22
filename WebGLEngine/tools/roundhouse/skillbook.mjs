// WebGLEngine/tools/roundhouse/skillbook.mjs — v3395
// ---------------------------------------------------------------------------------------------------------------
// THE PERSISTENT SKILLBOOK — the one role the roundhouse was missing, and a stricter version of it than the paper.
//
// THE IDEA IS ACE's (kayba-ai/agentic-context-engine, implementing arXiv 2510.04618, Stanford/SambaNova). Three
// roles around a persistent Skillbook: an Agent executes, a Reflector mines traces for what worked, a
// SkillManager adds, refines and removes strategies. It is not adopted as a dependency -- uv, LiteLLM, an API key
// and a hosted product all fail this tree's bar. The IDEA is taken; none of the code is.
//
// THE ROUNDHOUSE ALREADY HAS TWO OF THE THREE ROLES, and one of them is better than ACE's:
//   AGENT      -- roleDecompose is propose/critique/revise with a real gate at the end.
//   REFLECTOR  -- deviceCritic is a DETERMINISTIC critic. It cannot hallucinate, cannot rate-limit, and cannot
//                 be charged for. ACE's Reflector INFERS what worked from traces with no ground truth; this one
//                 KNOWS, because critiqueClaim names the exact defect from a fixed list.
//   SKILLBOOK  -- missing. Every critique the roundhouse produces has died with its session.
//
// *** AND THE SWEK VERSION IS STRICTLY STRONGER FOR ONE REASON: A STRATEGY IS ONLY EVER MINED FROM A NAMED,
// DETERMINISTIC FAILURE, AND IS ONLY EVER KEPT IF IT IS MEASURED TO CHANGE AN OUTCOME. ***
//
// modelBench already draws the line that makes this possible, and it drew it before this file existed:
//   MALFORMED  -- the model could not produce a usable claim: no observable, an observable this device does not
//                 have, no comparator, a target with no tol. THIS IS A STRATEGY FAILURE. It is about the
//                 interface, and a hint can fix it.
//   REFUSED    -- a WELL-FORMED claim the physics rejected. The model was WRONG. modelBench's own words: "only a
//                 better model fixes this". NO STRATEGY CAN FIX A REFUSED, and a Skillbook that tried would be
//                 teaching a model to guess better rather than to ask better.
//   CRYSTALLISED -- the claim stood. Nothing to learn except that the route worked.
//
// So the Skillbook's scope is exactly the MALFORMED column, and that boundary is the whole reason it can be
// honest. ACE mines "what worked" from traces and cannot tell those three apart.
//
// *** THE RULE THAT KEEPS IT FROM BECOMING DECORATION: A STRATEGY MUST BE SHOWN TO CHANGE AN OUTCOME. ***
// A strategy arrives PROPOSED and is NOT USED. It becomes PROVEN only when a measured trial shows it lowers the
// malformed rate for its trigger, against a control run without it. A trial that shows no movement RETIRES it.
// There is no state in which an unmeasured strategy is injected into a prompt, because a Skillbook full of
// plausible advice nobody tested is the exact failure this tree has spent a dozen rounds removing elsewhere.
//
// AND THE STORED STATE IS A CLAIM, NOT A GRANT -- the licence ratchet from physics/proposers.mjs, applied here.
// Hand-editing "state": "proven" into the JSON buys nothing: load() re-derives state from the evidence attached,
// so a strategy with no trial is PROPOSED however it describes itself on disk.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILLBOOK_PATH = path.join(HERE, "skillbook.json");

/** The MALFORMED reasons deviceCritic can name. A strategy must trigger on one of these and nothing else. */
export const TRIGGERS = [
    "no-claim",                 // not an object at all
    "observable-missing",       // named no observable
    "observable-unknown",       // named one this device does not have
    "comparator-missing",       // no max/min/target/equals/withinBracket
    "target-without-tol",       // a target that can never be satisfied
];

/** Map a deviceCritic issue string onto a trigger. Deterministic, and unmatched issues are NOT invented. */
export function triggerOf(issue) {
    const s = String(issue || "");
    if (/^No claim at all/.test(s)) return "no-claim";
    if (/names no observable/.test(s)) return "observable-missing";
    if (/is not an observable of this device/.test(s)) return "observable-unknown";
    if (/has no comparator/.test(s)) return "comparator-missing";
    if (/needs a "tol" beside it/.test(s)) return "target-without-tol";
    return null;                 // an issue this file does not understand yields NO strategy, rather than a guess
}

/**
 * Evidence that a strategy changed an outcome. `before` and `after` are malformed RATES for the trigger, from
 * runs that differ only in whether the hint was injected.
 */
export function evidenceIsSound(ev) {
    if (!ev || typeof ev !== "object") return { ok: false, why: "no evidence object" };
    const { before, after, n } = ev;
    if (![before, after].every((x) => typeof x === "number" && x >= 0 && x <= 1)) return { ok: false, why: "before/after must be rates in [0,1]" };
    if (typeof n !== "number" || n < 20) return { ok: false, why: "fewer than 20 trials: a rate from a handful of runs is a rumour" };
    return { ok: true };
}

/** The improvement a strategy must clear to be PROVEN. Absolute drop in malformed rate for its trigger. */
export const MIN_IMPROVEMENT = 0.10;

// v3396 -- *** THE SIZE BAR ALONE PROVES NOTHING, AND THE FALSE-PROOF RATE WAS MEASURED AT 32%. ***
//
// v3395 called a strategy PROVEN when before - after >= 0.10 with n >= 20. Both arms are Bernoulli samples, so
// their difference has a standard error of about sqrt(2 p (1-p) / n) -- at p = 0.5 and n = 20 that is 0.158,
// and a 0.10 bar sits well INSIDE the noise. MEASURED by running 20,000 trials of a strategy that does
// NOTHING (both arms drawn from the same coin): it was called PROVEN 32.3% of the time at n = 20, 21.9% at
// n = 40, 8.6% at n = 100 and 2.5% at n = 200. A ratchet that certifies a useless strategy a third of the
// time is worse than no ratchet: the book fills with hints that were noise, and each one then gets injected
// into a real prompt.
//
// THE FIX IS NOT A BIGGER CONSTANT. A fixed bar cannot be right at every n, and raising it would only move
// the same defect to a different sample size. The drop is compared to ITS OWN standard error:
//
//     z = (before - after) / sqrt( p_pooled (1 - p_pooled) (1/n + 1/n) )
//
// *** AND THE THIRD STATE IS THE POINT. *** A strategy that clears the size bar but not the noise bar is
// NOT retired -- retiring it would throw away something that may well be real -- and it is not proven. It is
// UNDERPOWERED: the measurement was taken, and it was too small to decide. That is the same distinction this
// tree draws everywhere else (UNKNOWN is not ABSENT), and collapsing it in either direction is the error.
// UNDERPOWERED is NEVER INJECTED, so the safety property is unchanged; what changes is that the book can now
// say "run more" instead of quietly promoting noise or quietly discarding a real effect.

/** One-sided z threshold. 2.33 is the 1% tail: a useless strategy should slip through about 1 time in 100. */
export const Z_MIN = 2.33;

/** The drop measured against its own standard error. Returns 0 when there is nothing to measure. */
export function proofStrength({ before, after, n }) {
    const drop = before - after;
    const pooled = (before + after) / 2;
    const varTerm = pooled * (1 - pooled) * (2 / n);
    if (!(varTerm > 0)) return drop > 0 ? Infinity : 0;   // both arms at 0 or 1: no sampling noise to clear
    return drop / Math.sqrt(varTerm);
}

/** How many runs per arm this effect would need to clear Z_MIN. Lets a trial say "run more" with a number. */
export function requiredN({ before, after }) {
    const drop = before - after;
    if (!(drop > 0)) return Infinity;
    const pooled = (before + after) / 2;
    return Math.ceil(2 * pooled * (1 - pooled) * (Z_MIN / drop) ** 2);
}

/** State is DERIVED, never read from disk. This is the ratchet. */
export function deriveState(strategy) {
    const ev = strategy && strategy.evidence;
    const sound = evidenceIsSound(ev);
    if (!sound.ok) return { state: "PROPOSED", why: "not trialled: " + sound.why + " -- a PROPOSED strategy is never injected" };
    const drop = ev.before - ev.after;
    const z = proofStrength(ev);
    const rate = `${ev.before.toFixed(3)} -> ${ev.after.toFixed(3)} over ${ev.n} trials`;
    if (drop < MIN_IMPROVEMENT) return { state: "RETIRED", why: `no measured effect: ${rate}, below the ${MIN_IMPROVEMENT} bar` };
    // Clears the size bar. Does it clear its own noise?
    if (z < Z_MIN) return { state: "UNDERPOWERED", why: `${rate} -- a drop of ${drop.toFixed(3)} at z=${z.toFixed(2)}, under the ${Z_MIN} bar. NOT retired and NOT proven: the measurement was taken and it is too small to decide. ${requiredN(ev)} runs per arm would settle it. UNDERPOWERED is never injected.` };
    return { state: "PROVEN", why: `malformed rate ${rate}, z=${z.toFixed(2)}` };
}

export function makeStrategy({ id, trigger, hint, evidence = null, refines = null }) {
    if (!TRIGGERS.includes(trigger)) throw new Error(`skillbook: "${trigger}" is not a deterministic trigger. A strategy that fires on an inferred condition is exactly what this file exists to avoid.`);
    if (!hint || typeof hint !== "string") throw new Error("skillbook: a strategy needs a hint to inject");
    return refines ? { id, trigger, hint, evidence, refines } : { id, trigger, hint, evidence };
}

// v3399 -- *** REFINE, THE THIRD SkillManager OPERATION -- AND THE WHOLE POINT IS THAT IT CANNOT INHERIT
// EVIDENCE. ***
//
// ACE's SkillManager adds, refines and removes; this had only add and retire, and that gap has been on the open
// list since v3396. THE TEMPTING IMPLEMENTATION IS THE DANGEROUS ONE: edit the hint in place and keep the
// numbers. A refined strategy would then be PROVEN for text that was never trialled, and it would look exactly
// like a strategy that had been -- same shape, same well-formed evidence, same green state. deriveState CANNOT
// TELL: the evidence is sound, it simply belongs to different words.
//
// SO A REFINEMENT IS A NEW STRATEGY WITH A NEW ID, `evidence: null` AND THEREFORE PROPOSED, carrying `refines`
// so the lineage is not lost. *** AND THE PARENT IS KEPT, NOT DELETED, for the same reason a RETIRED strategy is
// kept with its numbers: "we tried this wording and it did nothing" is a result the next person should not have
// to rediscover, and a refinement that turns out worse than its parent is only visible if the parent is there.
//
// THE HINT TEXT ITSELF IS NOT WRITTEN HERE. Generating better wording needs a model; this file supplies the
// BOOKKEEPING that makes a refinement honest, and refuses a refinement that changes nothing.
export function refine(parent, newHint, { id = null } = {}) {
    if (!parent || !parent.id) throw new Error("skillbook: refine needs a parent strategy with an id");
    if (!newHint || typeof newHint !== "string") throw new Error("skillbook: a refinement needs a new hint");
    if (newHint === parent.hint) throw new Error("skillbook: a refinement with the same hint is not a refinement. Nothing changed, so the parent's evidence still applies and a second entry would only split it.");
    return makeStrategy({ id: id || `${parent.id}-r${(parent.generation || 0) + 1}`,
                          trigger: parent.trigger, hint: newHint, evidence: null, refines: parent.id });
}

/**
 * Did a refinement arrive carrying its parent's numbers? The evidence would be perfectly well formed, so
 * deriveState is blind to it -- this is a STRUCTURAL check, and the tell is that a measurement taken at a
 * particular instant cannot belong to two different hints.
 */
export function inheritedEvidence(child, byId) {
    if (!child || !child.refines || !child.evidence) return null;
    const parent = byId[child.refines];
    if (!parent || !parent.evidence) return null;
    const a = child.evidence, b = parent.evidence;
    if (a.measuredAt && b.measuredAt && a.measuredAt === b.measuredAt) {
        return `evidence measuredAt ${a.measuredAt} is its parent's to the instant -- one measurement cannot belong to two hints`;
    }
    if (a.before === b.before && a.after === b.after && a.n === b.n) {
        return `evidence (${a.before} -> ${a.after}, n=${a.n}) is identical to its parent's in every field`;
    }
    return null;
}

/** Load, re-deriving every state from its evidence. Nothing on disk is trusted to describe itself. */
export function load({ file = SKILLBOOK_PATH } = {}) {
    let raw = null;
    try { raw = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return { strategies: [], missing: true }; }
    const list = Array.isArray(raw && raw.strategies) ? raw.strategies : [];
    const strategies = [];
    for (const s of list) {
        if (!TRIGGERS.includes(s && s.trigger) || !s.hint) continue;      // malformed entries are dropped, not repaired
        const d = deriveState(s);
        strategies.push({ id: s.id, trigger: s.trigger, hint: s.hint, evidence: s.evidence || null,
                          refines: s.refines || null,
                          state: d.state, why: d.why,
                          claimedState: s.state || null,
                          // NAMED so a hand-edit is visible rather than merely ineffective
                          claimOverridden: s.state && s.state !== d.state ? `file claimed ${s.state}, evidence says ${d.state}` : null });
    }
    // v3399 -- INHERITED EVIDENCE IS CAUGHT AFTER THE LIST EXISTS, because it is a fact about a PAIR. A child
    // holding its parent's numbers is FORCED BACK TO PROPOSED and the reason is named: silently ignoring it
    // would leave untrialled text in a prompt, and silently dropping the entry would hide that somebody tried.
    const byId = Object.fromEntries(strategies.map((x) => [x.id, x]));
    for (const s of strategies) {
        const why = inheritedEvidence(s, byId);
        if (!why) continue;
        s.inherited = why;
        s.state = "PROPOSED";
        s.why = `refinement of ${s.refines} arrived with INHERITED evidence -- ${why}. A NEW HINT IS A NEW CLAIM AND NEEDS ITS OWN TRIAL, so this is PROPOSED and is never injected.`;
    }
    return { strategies, missing: false };
}

export function save(strategies, { file = SKILLBOOK_PATH } = {}) {
    const out = { kind: "swek-skillbook", schemaVersion: 1, savedAt: new Date().toISOString(),
        note: "state is DERIVED from evidence on load; editing it here changes nothing. A strategy with no trial is PROPOSED and is never injected.",
        strategies: strategies.map((s) => ({ id: s.id, trigger: s.trigger, hint: s.hint, evidence: s.evidence || null,
                                             refines: s.refines || null,
                                             state: deriveState(s).state })) };
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
    return out;
}

/**
 * The hints to inject for a set of observed issues. ONLY PROVEN strategies are returned -- this is the whole
 * discipline, expressed as one filter.
 */
export function hintsFor(issues, { book = null, file = SKILLBOOK_PATH } = {}) {
    const b = book || load({ file });
    const triggers = new Set((issues || []).map(triggerOf).filter(Boolean));
    const used = b.strategies.filter((s) => s.state === "PROVEN" && triggers.has(s.trigger));
    return { hints: used.map((s) => s.hint), used,
             skipped: b.strategies.filter((s) => s.state !== "PROVEN" && triggers.has(s.trigger))
                                  .map((s) => ({ id: s.id, state: s.state, why: s.why })) };
}

/** Summary for a report or a gate. */
export function summary(book) {
    const by = (st) => book.strategies.filter((s) => s.state === st);
    return { total: book.strategies.length, proven: by("PROVEN").length, proposed: by("PROPOSED").length,
             retired: by("RETIRED").length, underpowered: by("UNDERPOWERED").length,
             overridden: book.strategies.filter((s) => s.claimOverridden).length,
             refinements: book.strategies.filter((s) => s.refines).length,
             inherited: book.strategies.filter((s) => s.inherited).length };
}
