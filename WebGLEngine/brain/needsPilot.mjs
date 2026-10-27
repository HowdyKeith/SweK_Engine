// WebGLEngine/brain/needsPilot.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE REFILL TRIP: a RULE wrapper (not a learned pilot) for a vessel with needs (physics/mechanics/subNeeds.mjs). While the charge is above `low` it flies its task as the wrapped pilot would; when the charge falls under `low` it goes to
// refill -- a battery hull asks to SURFACE (the target gains `surface: true`, which brain/surfacePilot.mjs's wrapper reads: so the wrapped pilot must be that wrapper), a snorkel hull flies to three quarters of its snorkel depth -- at the speed the task asked (a boat at 1 m/s does not rise: measured, the planes are too weak, and the first version capped it there);
// and it returns to the task when the charge is back over `high`. The gap between the two numbers is the hysteresis: the pilot does not flip between the modes on a tick. A hull that never refills (air-independent, unlimited) is the wrapped pilot, bit for bit.
// WHAT IT IS NOT: it knows nothing of the hull (strain, damage, a leak) -- piece 3 of the idea, the task with audits, is where a pilot that weighs the two needs belongs, registered before it is run. `read()` is the caller's: it returns
// subNeeds.readings() for this vessel NOW. Pure: no clock, no Math.random.
"use strict";

export const REFILL = Object.freeze({ low: 0.3, high: 0.9, speed: 1.5, snorkelFraction: 0.75 });   // `speed`: used only when the target names none

/** wrap(inner, { read, low, high }) -> pilot(state, target, current, aux) with `refilling` (a getter: is it on the refill trip now). `inner` is a pilot function (state, target, current, aux) -> controls. */
export function wrap(inner, { read, low = REFILL.low, high = REFILL.high } = {}) {
    if (typeof inner !== "function" || typeof read !== "function") throw new Error("needsPilot.wrap: a pilot function and a read() function are needed");
    if (!(low >= 0 && high <= 1 && low < high)) throw new Error(`needsPilot.wrap: low under high, both in [0, 1], got ${low} and ${high}`);
    let refilling = false;
    const pilot = (state, target, current = [0, 0, 0], aux) => {
        const r = read();
        if (!r || !r.refills) { refilling = false; return inner(state, target, current, aux); }
        if (!refilling && r.frac < low) refilling = true; else if (refilling && r.frac >= high) refilling = false;
        if (!refilling) return inner(state, target, current, aux);
        const speed = target.speed === undefined ? REFILL.speed : target.speed;
        const t = r.refillDepth <= 1 ? { ...target, surface: true, speed } : { ...target, depth: Math.min(target.depth, r.refillDepth * REFILL.snorkelFraction), speed };
        return inner(state, t, current, aux);
    };
    Object.defineProperty(pilot, "refilling", { get: () => refilling });
    return pilot;
}
