// FILE: ai-bridge/lagBlame.js
//
// v3411 - *** THE `[lag]` LINE REPORTS A DURATION AND NOT A FUNCTION, AND THAT HAS COST THREE ROUNDS OF GUESSING.
// ***
//
// Keith's boot log has said `event loop blocked 144961ms` for six versions. I read it three times and proposed
// three causes: a request flood (wrong), slow static serves (wrong -- four files reporting the SAME seventy
// seconds are four requests queued behind one blocking call), and the folder delete (A blocker, measurably, but
// NOT THE blocker -- v3406 detached it and the stalls continued at 47s, 99s and 145s).
//
// *** THREE GUESSES IS THE SIGNAL THAT THE INSTRUMENT IS MISSING, NOT THAT THE NEXT GUESS WILL BE BETTER. ***
//
// V8's own sampling profiler can see the blocking frame, because it samples INSIDE the engine rather than from a
// timer the block would starve. Node exposes it through `inspector` with no dependency, no flag and no restart:
// start a profile, let it run, and when the lag detector reports a stall, stop and read the frames with the most
// SELF time in that window.
//
// SELF TIME, NOT TOTAL. Total time blames whatever called the blocker -- usually a bootstrap function that is
// merely the ancestor of everything. THE FRAME THAT WAS ON THE CPU IS THE ONE THAT HELD THE LOOP.
//
// *** IT IS OFF UNLESS ASKED FOR, AND SAYS SO. *** A sampling profiler costs a few percent, which is a poor
// trade on a box that is already struggling; SWEK_LAG_BLAME=1 turns it on for a boot. A diagnostic that quietly
// runs forever is how the thing being diagnosed gets blamed on the diagnosis.

const DEFAULT_WINDOW_MS = 600000;     // profile the first ten minutes; the stalls in every log so far are in it
const SAMPLE_US = 1000;               // 1ms sampling: fine enough to name a frame, coarse enough to be cheap

/**
 * Start the profiler if it was asked for. Returns a handle whose blame(lagMs) reports the frames that held the
 * loop, or null when it is off -- and NULL IS A STATE THE CALLER MUST HANDLE, not an error: this is a diagnostic,
 * and a server that refused to boot without its profiler would be worse than one that stalls.
 */
// v3412 -- *** A ONE-SHOT FLAG FILE, NOT AN ENV VAR, AND THAT IS NOT A CONVENIENCE. ***
//
// Keith asked for a button that sets SWEK_LAG_BLAME=1 and restarts the server. An env var CANNOT survive that
// restart: sysadminBridge.restart() relaunches THE LAUNCHER -- `cmd /c start` on Windows, `open` on macOS -- and
// `open` hands the app to launchd, which does NOT carry an arbitrary environment across. A button that set an
// env var would work on one platform and silently do nothing on the other, WHICH IS WORSE THAN NO BUTTON:
// Keith would read a quiet boot as "the profiler found nothing".
//
// A file next to the tree works identically on both, and it is BETTER THAN THE ENV VAR IN A WAY THAT MATTERS:
// *** THE BOOT CONSUMES IT. Profiling cannot silently persist across reboots, which is the property this
// module's own header asks for -- a diagnostic that quietly runs forever is how the thing being diagnosed gets
// blamed on the diagnosis. *** An env var set in a launcher stays set until somebody remembers to unset it.
const FLAG_FILE = require("path").join(require("os").tmpdir(), "swek_lag_blame.flag");
function consumeFlagFile() {
    const fs = require("fs");
    try {
        if (!fs.existsSync(FLAG_FILE)) return false;
        try { fs.unlinkSync(FLAG_FILE); } catch {}   // consumed even if the profiler then fails to start
        return true;
    } catch { return false; }
}
/** Arm the next boot. Returns the path, so a caller can tell the user WHERE the arming lives. */
function armFlagFile() {
    require("fs").writeFileSync(FLAG_FILE, String(Date.now()));
    return FLAG_FILE;
}

function startLagBlame({ enabled, windowMs = DEFAULT_WINDOW_MS, log = console.log } = {}) {
    // The flag file is CONSUMED whichever way this resolves, so an armed flag is never left behind by an
    // explicit `enabled: false` -- it would otherwise fire on some later boot nobody asked to profile.
    const flagged = consumeFlagFile();
    if (enabled === undefined) enabled = process.env.SWEK_LAG_BLAME === "1" || flagged;
    if (!enabled) return null;
    if (flagged) log("[lagBlame] armed by the System Tools button (one shot -- the flag is consumed by this boot).");
    let session;
    try {
        const inspector = require("inspector");
        session = new inspector.Session();
        session.connect();
    } catch (e) {
        log("[lagBlame] could not start: " + ((e && e.message) || e) + " -- the stall will still be TIMED, just not NAMED.");
        return null;
    }
    const post = (method, params) => new Promise((res, rej) =>
        session.post(method, params || {}, (err, out) => (err ? rej(err) : res(out))));

    let running = false;
    const ready = (async () => {
        await post("Profiler.enable");
        await post("Profiler.setSamplingInterval", { interval: SAMPLE_US });
        await post("Profiler.start");
        running = true;
        log("[lagBlame] sampling profiler ON for " + Math.round(windowMs / 1000) + "s (SWEK_LAG_BLAME=1). A stall will be NAMED, not just timed.");
    })().catch((e) => log("[lagBlame] failed to start: " + ((e && e.message) || e)));

    const stopTimer = setTimeout(() => { if (running) stop().catch(() => {}); }, windowMs);
    stopTimer.unref && stopTimer.unref();

    async function stop() {
        if (!running) return null;
        running = false;
        const { profile } = await post("Profiler.stop");
        try { await post("Profiler.disable"); } catch {}
        try { session.disconnect(); } catch {}
        return profile;
    }

    return {
        get running() { return running; },
        ready,
        stop,
        /** The frames that held the CPU, worst self-time first. */
        async blame(topN = 5) {
            const profile = await stop();
            if (!profile) return null;
            const ranked = rankSelfTime(profile, topN);
            if (!ranked.length) { log("[lagBlame] profile carried no attributable samples."); return ranked; }
            log("[lagBlame] the frames that held the loop, worst SELF time first:");
            for (const f of ranked) log("[lagBlame]   " + f.selfMs + "ms  " + f.name + "  " + f.where);
            // *** AND WHO CALLED IT, WHICH IS THE HALF THAT WAS MISSING. Self time named diffraction.js at
            // v3477 and I then guessed the caller TWICE and was wrong both times. The tree knew. ***
            const chain = blameChain(profile);
            if (chain.length) {
                log("[lagBlame] the call path that got there, OUTERMOST FIRST:");
                for (let i = 0; i < chain.length; i++) log("[lagBlame]   " + "  ".repeat(i) + chain[i].name + "  " + chain[i].where);
            }
            ranked.chain = chain;
            return ranked;
        },
    };
}

/**
 * Rank a V8 CPU profile by SELF time. Exported so the gate can drive it on a profile it produced from a KNOWN
 * blocker -- a ranker nobody has watched name a function it was told to look for is not evidence of anything.
 */
function rankSelfTime(profile, topN = 5) {
    if (!profile || !Array.isArray(profile.nodes)) return [];
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const hits = new Map();
    // `samples` is the id of the node ON THE CPU at each tick, and `timeDeltas` the microseconds since the last
    // one -- so summing deltas per sampled id IS self time, without walking the tree.
    const samples = profile.samples || [];
    const deltas = profile.timeDeltas || [];
    for (let i = 0; i < samples.length; i++) {
        const id = samples[i];
        const dt = Math.max(0, deltas[i] || 0);
        hits.set(id, (hits.get(id) || 0) + dt);
    }
    const out = [];
    for (const [id, us] of hits) {
        const n = byId.get(id);
        if (!n || !n.callFrame) continue;
        const f = n.callFrame;
        const name = f.functionName || "(anonymous)";
        // (program), (idle) and (garbage collector) are V8's own buckets. GC IS KEPT AND LABELLED, because a
        // stall that is really GC is a finding rather than noise; idle is dropped because idle is the opposite
        // of the thing being hunted.
        if (name === "(idle)" || name === "(program)") continue;
        const url = (f.url || "").replace(/^file:\/\/\/?/, "");
        out.push({ name, selfMs: Math.round(us / 1000), where: url ? url + ":" + ((f.lineNumber | 0) + 1) : "(native)" });
    }
    out.sort((a, b) => b.selfMs - a.selfMs);
    return out.slice(0, topN);
}


/**
 * *** WHO CALLED IT. rankSelfTime NAMES THE FUNCTION ON THE CPU; THIS NAMES THE PATH THAT GOT THERE. ***
 *
 * v3477's profiler named physics/optics/diffraction.js:53 and I then GUESSED the caller twice -- deviceBridge
 * (wrong; v3482 wired it to a worker and the stall came back unchanged at v3482) and roundhouseBridge (also a
 * guess). *** TWO GUESSES ABOUT THE CALLER, AFTER FOUR ABOUT THE CAUSE, AND THE PROFILE HAD THE ANSWER THE
 * WHOLE TIME -- I was only reading its leaves. A sampling profile is a TREE, and the ancestor chain of the
 * hottest sample says which entry point is responsible. ***
 *
 * Returns the call path from the root down to the hottest sampled frame, outermost first, so the first
 * recognisable file in the list is the caller worth looking at.
 */
function blameChain(profile, { maxDepth = 24 } = {}) {
    if (!profile || !Array.isArray(profile.nodes)) return [];
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    // V8 gives children, not parents, so the parent map is derived once.
    const parent = new Map();
    for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);

    const samples = profile.samples || [], deltas = profile.timeDeltas || [];
    const hits = new Map();
    for (let i = 0; i < samples.length; i++) hits.set(samples[i], (hits.get(samples[i]) || 0) + Math.max(0, deltas[i] || 0));

    // The hottest LEAF that is real work -- idle and program are V8's own buckets and lead nowhere.
    let best = null, bestUs = -1;
    for (const [id, us] of hits) {
        const n = byId.get(id);
        const nm = n && n.callFrame && (n.callFrame.functionName || "(anonymous)");
        if (!n || !nm || nm === "(idle)" || nm === "(program)") continue;
        if (us > bestUs) { bestUs = us; best = id; }
    }
    if (best == null) return [];

    const chain = [];
    for (let id = best, d = 0; id != null && d < maxDepth; id = parent.get(id), d++) {
        const f = byId.get(id) && byId.get(id).callFrame;
        if (!f) break;
        const url = (f.url || "").replace(/^file:\/\/\/?/, "");
        chain.push({ name: f.functionName || "(anonymous)", where: url ? url + ":" + ((f.lineNumber | 0) + 1) : "(native)" });
    }
    return chain.reverse();          // outermost first: the entry point reads at the top
}

module.exports = { startLagBlame, rankSelfTime, blameChain, armFlagFile, consumeFlagFile, FLAG_FILE, DEFAULT_WINDOW_MS, SAMPLE_US };
