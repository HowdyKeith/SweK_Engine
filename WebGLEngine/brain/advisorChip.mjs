// WebGLEngine/brain/advisorChip.mjs -- UNNUMBERED (the version is chosen at ship time) (the gate is brain/advisorChip-selfcheck.mjs)
//
// THE ADVISOR CHIP: a second seat plugged in beside a pilot's seat, as REGISTERED in brain/NEEDS_AND_LIMITS.md "Round 4" before this file existed (Keith, 2026-10-28: "register the advisor chip test with GUARDED first"). A seat is (ctx) -> seat(st, obs) -> a decision
// { surface, station, cap, pump, repair } (brain/needsTask.mjs). `advised(brainSeatOf, advisorSeatOf, mode)` is a seat that runs BOTH, hands them the SAME (st, obs) objects (the advisor has no second channel: not the true charge, not the scenario), and
// combines the two decisions field by field. The advisor can only RESTRICT or SECOND the brain; it never forces a dive and never removes a safety action.
//   ALONE      the brain's decision (the advisor is still stepped, so its own state evolves the same way in every arm)
//   VETO       surface = brain OR advisor; pump = brain OR advisor; repair = brain OR advisor; cap = the smaller; station = the brain's unless it is visited or infeasible (the rule's HULL_DEPTH test), then the advisor's
//   V-SURFACE, V-CAP, V-SAFETY (pump and repair), V-STATION   only that field's rule of VETO (which veto helps; reported, not in the verdicts)
//   STALE      VETO with the advisor's decision taken STALE_SECONDS (30 s) EARLIER; silent until that many seconds have passed. The content control: a delayed conscience that does as well is not reading the situation.
// The registered audits (ADV_AUDITS, seeds 111-162) were reserved by Round 3 Amendment 1 for exactly this and are read by nothing else; RESERVED_LLM (171-222) is reserved for a later language-model chip and is read by nothing.
// Pure: no clock, no Math.random, no file.
"use strict";
import * as T from "./needsTask.mjs";

export const MODES = Object.freeze(["ALONE", "VETO", "V-SURFACE", "V-CAP", "V-SAFETY", "V-STATION", "STALE"]);
export const FIELD_MODES = Object.freeze(["V-SURFACE", "V-CAP", "V-SAFETY", "V-STATION"]);
export const STALE_SECONDS = 30, STALE_TICKS = Math.round(STALE_SECONDS / T.DT);
export const FIELDS = Object.freeze(["surface", "station", "cap", "pump", "repair"]);

/** The three fresh audits (111-122, 131-142, 151-162; four kinds each, 48 dives each) and the seeds reserved for the language-model chip. */
export const ADV_AUDITS = Object.freeze({ A: T.setOf(T.KINDS, 111, 122), B: T.setOf(T.KINDS, 131, 142), C: T.setOf(T.KINDS, 151, 162) });
export const ADV_AUDIT_NAMES = Object.freeze(["A", "B", "C"]);
export const ADV_SEEDS = Object.freeze([[111, 122], [131, 142], [151, 162]]);
export const RESERVED_LLM = Object.freeze([[171, 182], [191, 202], [211, 222]]);

/** The advisors: seats, GUARDED (the primary: the refill trip at 0.3 / 0.6) and GUARDED-FILTER (for scale: the same trip on the gauge averaged, alpha 0.005 per tick). */
export const ADVISORS = Object.freeze({ "GUARDED": T.ruleSeat("hyst"), "GUARDED-FILTER": T.ruleSeat("obs", { alpha: T.FILTER_ALPHA }) });
/** The advisor run alone as a pilot (the reference each advised brain is compared with). */
export const ADVISOR_PILOTS = Object.freeze({ "GUARDED": T.GUARDED, "GUARDED-FILTER": T.GUARDED_FILTER });

/** The rule's own test of a station the boat can safely reach (needsTask's private feasibleAt, spelled again here; the gate holds the two together). */
export const feasible = (q, r) => q.depth - T.CAPTURE.depth + 0.5 <= T.HULL_DEPTH * r.collapseDepth;
const usable = (q, r) => !!q && !q.visited && feasible(q, r);

/** One combination: `mode` (not STALE: a stale advisor is a delayed `a` handed to VETO), the brain's decision c, the advisor's decision a (null = silent), and the observation r is read from. Returns a NEW decision; c and a are not touched. */
export function combine(mode, c, a, obs) {
    if (!MODES.includes(mode)) throw new Error(`advisorChip.combine: mode ${JSON.stringify(mode)} (${MODES.join(", ")})`);
    if (!a) return { ...c };   // ALONE is no branch below: it falls through and returns the brain's decision
    const all = mode === "VETO" || mode === "STALE", out = { ...c };
    if (all || mode === "V-SURFACE") out.surface = !!(c.surface || a.surface);
    if (all || mode === "V-CAP") out.cap = Math.min(c.cap, a.cap);
    if (all || mode === "V-SAFETY") { out.pump = !!(c.pump || a.pump); out.repair = !!(c.repair || a.repair); }
    if (all || mode === "V-STATION") out.station = usable(c.station, obs.r) ? c.station : (a.station || null);
    return out;
}

/**
 * The advised seat: (ctx) -> seat(st, obs). `brainSeatOf` and `advisorSeatOf` are seats (ctx) -> seat. Both are called on EVERY tick with the identical (st, obs) objects. The seat carries `stats`: the number of ticks, and for each field the number of ticks on which the combined
 * decision differed from the brain's (how often the advisor overrode it). opts.staleSeconds (default STALE_SECONDS) is for the gate. A null advisor is ALONE.
 */
export function advised(brainSeatOf, advisorSeatOf, mode, { staleSeconds = STALE_SECONDS } = {}) {
    if (!MODES.includes(mode)) throw new Error(`advisorChip.advised: mode ${JSON.stringify(mode)} (${MODES.join(", ")})`);
    const delay = Math.round(staleSeconds / T.DT);
    return (ctx) => {
        const brain = brainSeatOf(ctx), adv = advisorSeatOf ? advisorSeatOf(ctx) : null, past = [];
        const stats = { ticks: 0, surface: 0, station: 0, cap: 0, pump: 0, repair: 0 };
        let n = 0;
        const seat = (st, obs) => {
            const c = brain(st, obs), a = adv ? adv(st, obs) : null;
            let use = a;
            if (mode === "STALE") { past.push(a); use = n >= delay ? past[n - delay] : null; }   // every decision of the run is kept (a run is 18,000 ticks): past[i] is the advisor's decision of tick i
            n++;
            const d = combine(mode, c, use, obs);
            stats.ticks++;
            for (const f of FIELDS) if (d[f] !== c[f]) stats[f]++;
            return d;
        };
        Object.defineProperty(seat, "stats", { get: () => stats });
        return seat;
    };
}

/** The advised seat flown as a pilot by the same autopilot as every other. The pilot carries `stats` of the last run. */
export function advisedPilot(brainSeatOf, advisorSeatOf, mode, opts) {
    return (ctx) => {
        let seat = null;
        const pilot = T.flyDecision((c) => (seat = advised(brainSeatOf, advisorSeatOf, mode, opts)(c)))(ctx);
        Object.defineProperty(pilot, "stats", { get: () => (seat ? seat.stats : null) });
        return pilot;
    };
}
