// ai-bridge/brainCensus.js -- v3664
//
// HOW MANY BRAINS ARE IN THE FLEET, AND HOW MANY ARE WORKING.
//
// v3662 put a BRAINS dial on server.html from /ai/brain/health's registeredBrains, and left SOLVING reading the
// HUB's own state because per-brain busy was not published. This is that number -- and getting it right meant
// noticing that the registry already carries TWO different answers to "is this brain busy".
//
// *** TWO DECLARATIONS, AND THEY ARE NOT THE SAME QUESTION:
//
//   DECLARED  `expBusy` -- the brain SAYS so. brain/brain.js publishes it (v2074) when it is mid-experiment and
//             must not be reassigned. It is TRUE ONLY FOR EXPERIMENTS: a brain solving flat out all day never
//             sets it. So it answers "may I be interrupted", not "is it working".
//   OBSERVED  the brain POSTED A SOLVE recently. fleetScore() stamps lastSeen on every field post, so lastSeen
//             is not a heartbeat -- IT IS THE LAST SOLVE. Silence for busyMs means it has stopped working.
//
// A DIAL LABELLED "WORKING" MUST USE THE OBSERVED ONE, because that is what the word means to somebody looking
// at a dashboard. The declared one is reported alongside, and so is the DISAGREEMENT between them, because two
// answers to one question is the shape this tree finds most often and the count is the only way to know whether
// it matters here. ***
//
// PURE: takes the entries and a clock, touches no globals, requires nothing. The bridge calls it; the gate
// grades it. That split is why the arithmetic can be tested at all -- inside the request handler it could only
// be tested by running a server and posting to it.

"use strict";

// Silence longer than this means the brain has stopped solving. Deliberately much shorter than the 60s
// eviction: a brain that has not posted for 6 seconds is IDLE but still very much in the fleet.
const BUSY_MS = 6000;
// Matches the eviction window in gpuBrainBridge.fleetScore. Kept as a named constant HERE too rather than
// assumed, so a change there that is not mirrored shows up as a disagreement in the gate rather than silently.
const LIVE_MS = 60000;

/**
 * @param entries  the fleet registry's values(): [{ id, lastSeen, expBusy, ... }]
 * @param now      ms epoch
 * @returns { registered, busy, idle, declaredBusy, disagree, oldestSilenceMs }
 */
function census(entries, now, opts) {
    const busyMs = (opts && opts.busyMs) || BUSY_MS;
    const liveMs = (opts && opts.liveMs) || LIVE_MS;
    let registered = 0, busy = 0, declaredBusy = 0, disagree = 0, oldestSilenceMs = 0;
    for (const e of entries || []) {
        if (!e) continue;
        const seen = e.lastSeen || 0;
        const silence = now - seen;
        if (silence > liveMs) continue;            // evicted / gone: not in the fleet at all
        registered++;
        const observed = silence <= busyMs;
        const declared = !!e.expBusy;
        if (observed) busy++; else oldestSilenceMs = Math.max(oldestSilenceMs, silence);
        if (declared) declaredBusy++;
        if (observed !== declared) disagree++;
    }
    return { registered, busy, idle: registered - busy, declaredBusy, disagree, oldestSilenceMs };
}

module.exports = { census, BUSY_MS, LIVE_MS };
