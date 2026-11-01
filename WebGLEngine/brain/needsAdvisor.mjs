// WebGLEngine/brain/needsAdvisor.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE ADVISOR THE AQUARIUM PAGE CAN SWITCH ON: the Round 4 rule advisor (brain/NEEDS_AND_LIMITS.md, GUARDED-OBS: surface when the charge fraction is under a threshold that is high near the surface and falls with depth,
// work the flood pump when there is water in the boat and charge to spare, work the repair when the boat is at the surface and hurt) seated on a sub of the aquarium's `needs` event in place of the fixed refill trip of brain/needsPilot.mjs.
// It is the SAME rule: the threshold and the numbers come from brain/needsTask.mjs (obsThreshold, RETURN_DEPTH), not from a copy, so a change to the registered rule changes this one.
// WHAT IT IS NOT: the survey task's stations and its noisy gauge are not here (the aquarium has neither; its gauge is clean, so the exponential filter GUARDED-FILTER adds is left out), no `cap` (the rule's cap is the hull's own depth), and not a language model:
// Round 5 found two local models add nothing beyond a fixed depth cap and lose to this rule. A hull that never refills (air-independent, unlimited) is the wrapped pilot, bit for bit, with the pump and the repair still advised.
// Pure: no clock, no Math.random. `read()` is the caller's (subNeeds.readings() for this vessel NOW).
"use strict";
import { obsThreshold, RETURN_DEPTH } from "./needsTask.mjs";

export const PUMP_MIN_CHARGE = 0.1, FLOOD_MIN = 0.001;

/** The advice for one reading r (subNeeds.readings): { surface, pump, repair, threshold }. `surface` is only ever true for a hull that refills. */
export function adviceOf(r) {
    if (!r) return { surface: false, pump: false, repair: false, threshold: 0 };
    const threshold = obsThreshold(r.depth);
    return { surface: !!r.refills && r.frac < threshold, pump: r.flood > FLOOD_MIN && r.frac > PUMP_MIN_CHARGE, repair: r.depth < RETURN_DEPTH && r.damage > 0 && r.frac > PUMP_MIN_CHARGE, threshold };
}

/** wrap(inner, { read, speed }) -> pilot(state, target, current, aux) with `advice` (the last one, a getter) and `refilling` (it is on the refill trip now). `inner` is a pilot function; it must be brain/surfacePilot.mjs's wrapper for a battery hull (the target's `surface: true` is read there). */
export function wrap(inner, { read, speed = 1.5, snorkelFraction = 0.75 } = {}) {
    if (typeof inner !== "function" || typeof read !== "function") throw new Error("needsAdvisor.wrap: a pilot function and a read() function are needed");
    let last = adviceOf(null);
    const pilot = (state, target, current = [0, 0, 0], aux) => {
        const r = read(); last = adviceOf(r);
        if (!last.surface) return inner(state, target, current, aux);
        const sp = target.speed === undefined ? speed : target.speed;
        const t = r.refillDepth <= 1 ? { ...target, surface: true, speed: sp } : { ...target, depth: Math.min(target.depth, r.refillDepth * snorkelFraction), speed: sp };
        return inner(state, t, current, aux);
    };
    Object.defineProperty(pilot, "advice", { get: () => ({ ...last }) });
    Object.defineProperty(pilot, "refilling", { get: () => last.surface });
    return pilot;
}
