// FILE: ui/runnerGauge.mjs
// VERSION: v4163 -- RunCat's idea, pointed at any JSON endpoint in this tree: a figure whose RUNNING SPEED is
// a live number.
//
// runcat-dev/RunCatNeo (Apache-2.0) animates a cat in the macOS menubar faster as CPU load rises. The code is
// Swift 6.2 against AppKit and cannot come here; the IDEA is four lines of arithmetic, and it is a genuinely
// good readout -- a rate is legible from the corner of an eye in a way a number is not. *** ITS ARTWORK IS NOT
// IN THAT REPOSITORY AT ALL ("Runners are managed in the Runner Gallery"), so there was nothing to take even
// had the licence invited it, and the frames here are this tree's own ASCII. ***
//
// *** THREE THINGS THE MENUBAR VERSION GETS FOR FREE AND A GENERAL ONE DOES NOT. ***
//
// 1. CPU LOAD HAS A DOMAIN AND AN ARBITRARY JSON NUMBER DOES NOT. RunCat knows 0-100. Pointed at
//    /bridge/state's tick count or a queue depth, "fast" means nothing until somebody says what the top of the
//    scale is. Auto-ranging looks like the fix and is a trap in two directions: a metric that has not moved
//    yet gives min === max and a divide by zero, and a single spike permanently rescales everything after it,
//    so the reading silently stops meaning what it meant this morning. THE DOMAIN IS REQUIRED, and the
//    observed range is REPORTED so a person can set it from evidence instead of guessing.
//
// 2. A DEAD FEED MUST NOT LOOK LIKE AN IDLE ONE. A cat at 0% CPU still ambles. If the endpoint stops
//    answering and the runner keeps ambling, "the server is gone" and "nothing is happening" render
//    identically -- and the ambling one is the more reassuring of the two, which is the wrong way round. So
//    staleness is a SEPARATE state from a low value, and it stops the figure rather than slowing it.
//
// 3. POLL RATE IS NOT FRAME RATE. The number arrives every few seconds; the animation runs every frame. They
//    are different clocks and conflating them makes a 2 s poll into a 0.5 fps animation.

/** Below this a figure is walking, above it running. Frames per second, not a speed in the world. */
export const MIN_FPS = 1;
export const MAX_FPS = 20;
/** No answer for this long and the feed is stale. Deliberately a small multiple of a normal poll interval. */
export const STALE_AFTER_MS = 12000;
/** ...and this long and it is dead: not slow, not late, gone. */
export const DEAD_AFTER_MS = 60000;

/** This tree's own runner. Eight frames of ASCII, so a panel needs no asset and no licence. */
export const ASCII_RUNNER = ["|>", "/>", "->", "\\>", "|>", "/>", "->", "\\>"];

/**
 * Read a value out of a JSON response by path.
 *
 * `a.b[2].c` and `a/b/2/c` both work, because half this tree's endpoints are documented one way and half the
 * other. Returns undefined for anything missing rather than throwing -- a panel must survive an endpoint
 * changing shape, which they do.
 */
export function pickPath(obj, path) {
    if (obj == null || !path) return undefined;
    const parts = String(path).replace(/\[(\d+)\]/g, ".$1").replace(/\//g, ".").split(".").filter(Boolean);
    let cur = obj;
    for (const p of parts) {
        if (cur == null || typeof cur !== "object") return undefined;
        cur = cur[p];
    }
    return cur;
}

/**
 * Map a value onto frames per second.
 *
 * `curve` is "linear" or "log". LOG IS THE USEFUL ONE FOR THIS TREE AND IT IS NOT THE DEFAULT BY ACCIDENT:
 * queue depths and tick counts are heavy-tailed, so a linear map spends most of its life at the bottom of the
 * scale and then saturates. Linear stays the default because it is the one whose readout means what a person
 * assumes it means; log is chosen deliberately, per gauge.
 */
export function rateFor(value, { min = 0, max = 100, minFps = MIN_FPS, maxFps = MAX_FPS, curve = "linear" } = {}) {
    // *** null AND "" COERCE TO ZERO, AND ZERO IS A PERFECTLY GOOD SPEED. *** Number(null) === 0 and
    // Number("") === 0, both finite, so a Number()-then-isFinite guard lets an ABSENT field through as a
    // genuine reading of nought -- and the runner then ambles at minimum speed exactly as it would for a real
    // idle metric. That is section 3's "gone must not look like quiet" arriving one level down, through the
    // value instead of through the feed. An endpoint that returns `"depth": null` is not reporting no queue;
    // it is reporting no answer. Caught by this file's own gate, which asked for undefined AND null and got
    // one of the two.
    if (value === null || value === undefined || value === "") {
        return { fps: 0, frac: null, why: "no value at that path (null/undefined/empty), which is not the same as zero" };
    }
    if (typeof value === "boolean") return { fps: 0, frac: null, why: "value is a boolean, not a measurement" };
    const v = Number(value);
    if (!Number.isFinite(v)) return { fps: 0, frac: null, why: "value is not a finite number" };
    if (!(max > min)) return { fps: 0, frac: null, why: "domain is empty (max must exceed min)" };
    let frac = (v - min) / (max - min);
    frac = Math.max(0, Math.min(1, frac));
    if (curve === "log") {
        // log1p over the fraction, normalised, so 0 stays 0 and 1 stays 1 with the detail at the bottom.
        frac = Math.log1p(frac * 9) / Math.log(10);
    }
    return { fps: minFps + frac * (maxFps - minFps), frac, why: null };
}

/**
 * How the feed itself is doing, which is a different question from what it last said.
 *
 * "live" | "stale" | "dead" | "never" -- and `never` is not `dead`: a panel that has only just opened has no
 * information, and reporting that as a failure is the shape v3103 named. The runner STOPS on stale and dead;
 * it does not slow down, because slowing down is what a real low value looks like.
 */
export function feedState(lastOkMs, now = Date.now(), { staleAfterMs = STALE_AFTER_MS, deadAfterMs = DEAD_AFTER_MS } = {}) {
    if (!lastOkMs) return { state: "never", ageMs: null, moving: false, why: "no answer yet" };
    const ageMs = now - lastOkMs;
    if (ageMs >= deadAfterMs) return { state: "dead", ageMs, moving: false, why: "no answer for " + Math.round(ageMs / 1000) + "s" };
    if (ageMs >= staleAfterMs) return { state: "stale", ageMs, moving: false, why: "last answer " + Math.round(ageMs / 1000) + "s ago" };
    return { state: "live", ageMs, moving: true, why: null };
}

/** Which frame to draw. `t` is a timestamp in ms; fps 0 pins frame 0 so a stopped runner is stopped, not
 *  frozen mid-stride at whatever frame it happened to reach. */
export function frameAt(t, fps, frameCount = ASCII_RUNNER.length) {
    if (!(fps > 0) || !(frameCount > 0)) return 0;
    return Math.floor((t / 1000) * fps) % frameCount;
}

/**
 * Watch what a metric actually does, so a domain can be set from evidence.
 *
 * *** THIS DELIBERATELY DOES NOT FEED BACK INTO THE RATE. *** It is a notebook, not a controller. An
 * auto-ranging gauge rescales itself the moment anything unusual happens, which is exactly when a person is
 * looking at it and needs it to mean what it meant before.
 */
export function observedRange() {
    let min = null, max = null, n = 0;
    return {
        see(v) {
            const x = Number(v);
            if (!Number.isFinite(x)) return;
            n++; min = min === null ? x : Math.min(min, x); max = max === null ? x : Math.max(max, x);
        },
        get() { return { min, max, n, suggestion: (n >= 2 && max > min) ? { min, max } : null }; },
    };
}
