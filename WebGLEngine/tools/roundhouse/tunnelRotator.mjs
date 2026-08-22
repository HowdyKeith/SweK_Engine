// tools/roundhouse/tunnelRotator.mjs
//
// v2957 -- ROTATION WITHOUT LOSS. Quick tunnels die unpredictably, so the hub wants a fresh one periodically.
// The naive rotation -- stop the old, start the new, point everyone at the new URL -- is exactly wrong here, for
// the reason v2956 established: tunnel liveness is not monotonic. A new URL frequently does NOT work at first,
// and the old one you just tore down might have been fine, or might come back. Rotating by REPLACEMENT means
// there is a window where the hub has no reachable address at all and no peer has any alternative to try.
//
// So rotation here is ADDITIVE. Starting a new tunnel registers a new candidate; it does not retire the old one.
// The candidate list grows, ordered by evidence, and every peer holds several ways in. The old tunnel stays in
// the list until an operator retires it deliberately -- which is the only removal this system has.
//
// WHAT THIS MODULE DOES AND DOES NOT DO. It does not spawn cloudflared: that is the hub's job and depends on how
// the operator runs it. It provides the POLICY -- when a rotation is due, what to do with the URL that comes
// back, and how to keep the list from growing without bound -- so the spawning side has one obvious thing to
// call and cannot get the bookkeeping wrong.

import { addCandidate, recordAttempt, retire, orderedCandidates } from "./tunnelCandidates.mjs";

export const DEFAULT_ROTATE_HOURS = 6;      // quick tunnels are typically good for hours, not days
export const KEEP_CANDIDATES = 12;          // beyond this, retire the least promising -- see pruneOldest

/** Is a rotation due? Pure: the caller supplies now and the last rotation time. */
export function rotationDue({ lastRotatedAt = null, now = null, everyHours = DEFAULT_ROTATE_HOURS } = {}) {
    if (!lastRotatedAt) return { due: true, why: "no tunnel has been started yet" };
    const t = (now ? new Date(now) : new Date()) - new Date(lastRotatedAt);
    const hrs = t / 3600000;
    return hrs >= everyHours
        ? { due: true, why: `${hrs.toFixed(1)}h since last rotation (every ${everyHours}h)` }
        : { due: false, why: `${(everyHours - hrs).toFixed(1)}h until the next rotation` };
}

/**
 * Register a newly started tunnel. ADDITIVE by design: the previous URL keeps its place in the list and its
 * history. Returns the updated registry and the try-order a peer should now be given.
 */
export function onTunnelStarted(reg, url, { at = null, label = null } = {}) {
    const updated = addCandidate(reg, url, { label: label || "rotation " + (at || new Date().toISOString()).slice(0, 16), at });
    return { registry: updated, ordered: orderedCandidates(updated) };
}

/** The hub's own reachability probe result for a candidate -- same recorder the peers feed. */
export function onProbeResult(reg, url, ok, { at = null } = {}) {
    return recordAttempt(reg, url, ok, { at });
}

/**
 * Keep the list bounded WITHOUT throwing away anything that might work. Retires only the least promising --
 * never-succeeded candidates with the oldest failures -- and only once the list exceeds `keep`. A URL that has
 * EVER succeeded is never auto-retired, because it demonstrated it can work and these come back.
 */
export function pruneOldest(reg, { keep = KEEP_CANDIDATES, now = null } = {}) {
    const all = Object.values((reg && reg.urls) || {}).filter((c) => !c.retired);
    if (all.length <= keep) return { registry: reg, retired: [], why: `${all.length} live candidates, under the ${keep} cap` };
    const everSucceeded = all.filter((c) => c.successes > 0);
    const neverSucceeded = all.filter((c) => c.successes === 0);
    // sort the never-succeeded worst-first: most failures, then oldest last-failure
    neverSucceeded.sort((a, b) => (b.failures - a.failures) || (new Date(a.lastFailure || 0) - new Date(b.lastFailure || 0)));
    const overBy = all.length - keep;
    const doomed = neverSucceeded.slice(0, Math.min(overBy, neverSucceeded.length));
    let out = reg;
    for (const c of doomed) out = retire(out, c.url, true);
    return {
        registry: out, retired: doomed.map((c) => c.url),
        why: doomed.length
            ? `retired ${doomed.length} candidate(s) that have NEVER succeeded; all ${everSucceeded.length} that ever worked are kept regardless of age`
            : `over the cap but every candidate has succeeded at least once -- nothing auto-retired`,
    };
}

/** One call for the hub: given the registry and the clock, say what should happen. */
export function rotationPlan(reg, { lastRotatedAt = null, now = null, everyHours = DEFAULT_ROTATE_HOURS, keep = KEEP_CANDIDATES } = {}) {
    const due = rotationDue({ lastRotatedAt, now, everyHours });
    const live = Object.values((reg && reg.urls) || {}).filter((c) => !c.retired);
    return {
        ...due,
        liveCandidates: live.length,
        withSuccess: live.filter((c) => c.successes > 0).length,
        ordered: orderedCandidates(reg),
        overCap: live.length > keep,
        // stated plainly because it is the whole policy
        policy: "rotation ADDS a candidate and never retires the previous one; only never-succeeded candidates are ever auto-retired, and only over the cap",
    };
}

// ---- v2967: THE TICK -- what a timer should actually do ----------------------------------------------------------
//
// The schedule stores an interval and the policy says rotation is additive. What was missing is the thing that
// FIRES, and its one real design question is when to record that a rotation happened. Both obvious answers are
// wrong in opposite directions:
//
//   Record before the spawn succeeds -> a broken cloudflared (not installed, not on PATH, rate-limited) means
//   the hub waits the FULL interval before trying again. Four hours of no tunnel because of a fixable error.
//
//   Record only on success -> a permanently broken cloudflared retries on EVERY poll, spawning failing processes
//   forever. That is thrashing, and it is worse than the first because it looks like activity.
//
// So attempts and successes are recorded separately, and a failure backs off: the next attempt waits
// backoffMinutes, doubling to a ceiling, until one succeeds and clears it. A transient failure costs minutes; a
// permanent one settles into a slow retry that leaves a readable trail instead of a spin.
//
// tick() is PURE: it takes the clock and the state and returns a DECISION. The caller performs the spawn and
// reports back through recordAttemptResult(). Keeping the decision separate from the effect is what makes every
// branch here testable without a cloudflared binary anywhere in sight.

export const DEFAULT_BACKOFF_MIN = 5;
export const MAX_BACKOFF_MIN = 120;

/**
 * Decide whether to rotate now.
 * `sched` = { enabled, everyHours, lastRotatedAt, lastAttemptAt, consecutiveFailures }
 */
export function tick(sched = {}, { now = null, tunnelLive = null } = {}) {
    const t = now ? new Date(now) : new Date();
    if (!sched.enabled) return { act: "idle", why: "auto-rotation is switched off" };

    // v3575 -- *** THE SWITCH NOW MEANS "KEEP A TUNNEL UP", NOT ONLY "REPLACE IT EVERY N HOURS". ***
    // It used to decide purely on the clock, so with the box ticked and NO tunnel live, a box that had rotated
    // an hour ago sat there answering "wait" for three more hours with nothing serving. The operator ticked a
    // control labelled auto-rotate and reasonably expected a tunnel to exist. The liveness check comes FIRST,
    // before the backoff, because "there is nothing running" is more urgent than "we failed recently" -- but
    // the failure count still gates the retry through the backoff branch below, so a box whose cloudflared is
    // broken does not spin. tunnelLive === null means the caller could not tell, and an unknown is NOT treated
    // as absent: guessing "no tunnel" would spawn a duplicate every minute.
    if (tunnelLive === false && !(Number(sched.consecutiveFailures) > 0)) {
        return { act: "rotate", why: "auto-rotation is on and no tunnel is live" };
    }

    const fails = Number(sched.consecutiveFailures) || 0;
    if (fails > 0 && sched.lastAttemptAt) {
        const waitMin = Math.min(MAX_BACKOFF_MIN, DEFAULT_BACKOFF_MIN * Math.pow(2, fails - 1));
        const sinceMin = (t - new Date(sched.lastAttemptAt)) / 60000;
        if (sinceMin < waitMin) {
            return { act: "backoff", why: `${fails} failed attempt(s); waiting ${(waitMin - sinceMin).toFixed(1)} more minute(s) before retrying`, waitMin };
        }
        return { act: "rotate", why: `retrying after ${fails} failure(s) and a ${waitMin}-minute backoff` };
    }

    const due = rotationDue({ lastRotatedAt: sched.lastRotatedAt, now: t.toISOString(), everyHours: sched.everyHours || DEFAULT_ROTATE_HOURS });
    return due.due ? { act: "rotate", why: due.why } : { act: "wait", why: due.why };
}

/**
 * Fold the outcome of an attempt back into the schedule. A SUCCESS sets lastRotatedAt and clears the failure
 * count; a FAILURE records the attempt and increments it, leaving lastRotatedAt alone -- so a failed rotation
 * never makes the hub believe it has a fresh tunnel.
 */
export function recordAttemptResult(sched = {}, ok, { now = null, url = null, error = null } = {}) {
    const at = (now ? new Date(now) : new Date()).toISOString();
    return ok
        ? { ...sched, lastAttemptAt: at, lastRotatedAt: at, lastUrl: url || sched.lastUrl || null, consecutiveFailures: 0, lastError: null }
        : { ...sched, lastAttemptAt: at, consecutiveFailures: (Number(sched.consecutiveFailures) || 0) + 1, lastError: String(error || "spawn failed").slice(0, 200) };
}
