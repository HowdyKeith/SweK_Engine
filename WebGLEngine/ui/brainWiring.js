// WebGLEngine/ui/brainWiring.js -- v3025
//
// ONE PLACE THAT KNOWS HOW TO DRIVE A BRAIN. Any page with a SweK robot gets the lights in one line.
//
// v3024 wired the avatar's brain lights to the roundhouse and put the polling loop INLINE IN server.html. That
// works exactly once. The moment a second surface wants the same lights -- the render panel, gauges3000, an
// avatar-mode window -- the natural move is to copy the loop, and then there are two things deciding what a
// state means and one of them will be older. THAT IS THE DUPLICATED-TABLE CLASS THIS TREE HAS NOW PAID FOR
// SEVEN TIMES: five spatial structures, two claims parsers, two "this box's score" implementations, two policy
// engines avoided, two queue paths, two bench prefixes, and a fingerprint field hand-copied into two rows.
//
// So the loop moves here BEFORE a second caller exists, rather than after one has already drifted.
//
// IT OWNS NO INTERPRETATION. readActivity() lives in tools/roundhouse/activity.mjs and is the same function the
// fleet view, the minipanel and the peer itself use. This file owns the POLLING, not the MEANING.
"use strict";

export const DEFAULT_MS = 20000;

/**
 * @param {object} bot        a createSwekRobot() handle -- needs setBrain()
 * @param {object} [opts]     { intervalMs, source, fetchImpl }
 * @returns {{stop:Function, tick:Function}}  stop() so a page that swaps views does not leak a timer
 */
export function attachBrain(bot, opts = {}) {
    const ms = opts.intervalMs || DEFAULT_MS;
    const src = opts.source || "/fingerprint";
    const f = opts.fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!bot || typeof bot.setBrain !== "function") {
        return { stop() {}, tick: async () => null, why: "no robot handle with setBrain -- attaching to nothing and saying so beats a silent no-op" };
    }

    let timer = null, stopped = false, A = null;

    async function tick() {
        if (stopped) return null;
        try {
            if (!A) A = await import("/tools/roundhouse/activity.mjs");
            if (!f) throw new Error("no fetch");
            const fp = await (await f(src, { cache: "no-store" })).json();
            const act = A.readActivity(fp && fp.roundhouse);
            bot.setBrain(act);
            return act;
        } catch {
            // A LOST BRIDGE IS NOT AN IDLE ENGINE. Unknown, not idle -- the same rule every other surface carries.
            // Showing idle here would be the avatar quietly asserting something nobody measured.
            const act = { state: "unknown" };
            bot.setBrain(act);
            return act;
        }
    }

    tick();
    if (typeof setInterval === "function") timer = setInterval(tick, ms);

    return {
        tick,
        // A page that swaps views must not leak a timer -- the same rule fitPlot's detach carries.
        stop() { stopped = true; if (timer && typeof clearInterval === "function") clearInterval(timer); timer = null; },
    };
}
