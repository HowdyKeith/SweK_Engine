// WebGLEngine/face/detectPump.js -- v3116
//
// THE DECISION LOGIC OF AN OFF-THREAD DETECT LOOP, SEPARATED SO IT CAN BE TESTED.
//
// v3110 found that detectForVideo() runs SYNCHRONOUSLY inside a requestAnimationFrame tick with no worker
// anywhere -- the third appearance of this tree's oldest lesson, after the poller and after /sync/status walking
// the asset tree on the server thread. It diagnosed and gated it. Nothing fixed it, because the fix needs a
// browser and a camera and this sandbox has neither.
//
// SO THE UNTESTABLE PART IS MADE THIN AND THE TESTABLE PART IS MADE REAL. The worker shell and the ImageBitmap
// transfer cannot be exercised here and are kept to a few lines. Everything that DECIDES anything -- when to
// send a frame, what to do when a reply never comes, whether the pipeline is even alive -- lives here, is pure,
// and is checked headlessly. A design whose only proof is "it looked fine on the rig" is the thing this whole
// project is arranged against.
//
// THREE THINGS CHANGE WHEN THE DETECT MOVES OFF-THREAD, AND ONLY THE FIRST IS OBVIOUS:
//
//   1. LATENCY REPLACES BLOCKING. The main thread stops stalling and the answer arrives a frame or two later.
//      That is the trade, and it is worth making for a camera surface -- but it IS a trade and is stated, not
//      hidden. snapshot() necessarily returns an older truth in worker mode than in sync mode.
//
//   2. BACKPRESSURE BECOMES POSSIBLE. Nothing stops the main thread grabbing bitmaps faster than the worker
//      drains them. Queueing them grows latency without bound and leaks memory a frame at a time, and the
//      symptom -- a face that lags further behind the longer you watch -- looks like a slow model rather than a
//      full queue. SO A FRAME IS DROPPED, NEVER QUEUED: at most one detect is in flight.
//
//   3. *** A SILENT WORKER LOOKS EXACTLY LIKE AN EMPTY ROOM. *** If the worker dies, or the model fails to
//      load inside it, blendshapes simply stop arriving -- which v3114's wiring reads as "noface", the state
//      that means "the camera is working and nobody is in frame". That is the two-things-one-label shape one
//      layer deeper than v3114 fixed it, and it is the reason this file exists rather than a few lines inline.

/** How long without a reply before the pipeline is presumed dead rather than merely quiet. */
export const SILENCE_MS = 2000;

export function createPump(opts = {}) {
    const minIntervalMs = 1000 / (opts.targetHz || 30);
    const silenceMs = opts.silenceMs || SILENCE_MS;
    let inFlight = false;          // at most ONE -- see (2) above
    let lastSentT = -Infinity;
    let lastReplyT = -Infinity;
    let sent = 0, done = 0, dropped = 0, everReplied = false;

    return {
        /**
         * May the main thread grab a bitmap and send it right now?
         * Drops rather than queues: a frame skipped is a frame that never became latency.
         */
        shouldSend(now) {
            if (inFlight) { dropped++; return false; }
            if (now - lastSentT < minIntervalMs) return false;
            inFlight = true; lastSentT = now; sent++;
            return true;
        },

        /** A reply arrived. */
        onResult(now) { inFlight = false; lastReplyT = now; done++; everReplied = true; },

        /** The send itself threw -- the bitmap never left. Clear the slot or the pump wedges forever. */
        onSendFailed() { inFlight = false; },

        /**
         * Is the pipeline ALIVE, SILENT, or simply IDLE?
         *
         * IDLE means nothing has been asked of it yet -- not a fault. SILENT means a frame went out and
         * nothing came back within the budget, which is a fact about the WORKER and must never be reported as
         * a fact about the FACE. A caller that cannot tell those apart will show an empty-room state for a
         * dead pipeline, and the user will go and check the lighting.
         */
        health(now) {
            if (!everReplied && !inFlight && sent === 0) return "idle";
            if (inFlight && now - lastSentT > silenceMs) return "silent";
            if (everReplied && now - lastReplyT > silenceMs) return "silent";
            if (!everReplied && sent > 0 && now - lastSentT > silenceMs) return "silent";
            return "alive";
        },

        /** Numbers a human reads. dropped is the interesting one: steady growth means the model cannot keep up. */
        stats() { return { sent, done, dropped, inFlight }; },
    };
}
