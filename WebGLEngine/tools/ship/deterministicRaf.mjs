// WebGLEngine/tools/ship/deterministicRaf.mjs -- v4250
//
// A requestAnimationFrame THE GATE DRIVES, so a frame is something you cause rather than something you wait
// for.
//
// The idea is FormidableLabs/mock-raf (MIT, 2015-2016) -- twenty lines, unmaintained, and not vendored: the
// licence is clean either way and what travels is the shape, not the package.
//
// ---- WHY THIS TREE NEEDS IT, WHICH IS A SPECIFIC AND REPEATED FAILURE ----------------------------------------
//
// This tree keeps measuring rAF and then correctly refusing to conclude anything from the measurement,
// because the clock is not controlled:
//
//   * #60, still open: frameDirty measured at v4232 as 0.0% of frames skippable.
//   * v4242 measured 143 rAF callbacks against 16 render cycles in five seconds -- 89% of callbacks drawing
//     nothing -- and its gate says in as many words that this is "recorded as a measurement, not read as a
//     verdict", because under swiftshader a render cycle is slow enough that other rAF consumers get many
//     turns in between. The number is real and it is unusable.
//
// Both are observations of a race. With the clock in the gate's hand they become experiments: step once, and
// exactly one frame happens, at a time you chose, and you can ask what every callback did with its turn.
//
// ---- THE ONE THING A NAIVE MOCK GETS WRONG -------------------------------------------------------------------
//
// *** A CALLBACK THAT REGISTERS ANOTHER CALLBACK MUST RUN ON THE NEXT STEP, NOT THIS ONE. *** Every animation
// loop in existence is `function frame() { ...; requestAnimationFrame(frame); }`, so a mock that iterates its
// queue while callbacks are still appending to it either runs the whole animation in one step or spins
// forever. The queue must be TAKEN before it is walked. That is the entire difficulty, and the gate has a
// control that shows a naive version failing it rather than asserting the correct one is correct.
//
// ---- AND THE CLOCK HAS TO MOVE TOO ---------------------------------------------------------------------------
//
// A frame loop reads performance.now() for its delta. Controlling rAF while leaving the clock real gives a
// loop that is stepped deterministically and computes dt from wall time, which is a different kind of
// nondeterminism rather than the absence of one. Both are driven from the same counter here.
"use strict";

/**
 * The shim, as source to inject into a page's <head> before its modules run.
 *
 * Installs window.__raf with:
 *   step(n = 1)   run n frames; each runs exactly the callbacks queued when it began
 *   pending()     how many callbacks are waiting
 *   now           the controlled clock, in ms
 *   count         total callbacks invoked since install
 *   frames        total steps taken
 */
export const RAF_SHIM = `<script>
(function () {
    var queue = [];
    var nextId = 1;
    var live = new Map();
    var clock = 0;
    var invoked = 0;
    var frames = 0;

    window.requestAnimationFrame = function (cb) {
        var id = nextId++;
        live.set(id, cb);
        queue.push(id);
        return id;
    };
    window.cancelAnimationFrame = function (id) { live.delete(id); };

    // performance.now and Date.now follow the same counter, so a loop computing dt from the clock sees the
    // step the gate chose rather than however long the machine happened to take.
    var realNow = performance.now.bind(performance);
    performance.now = function () { return clock; };
    var RealDate = Date.now;
    Date.now = function () { return 1700000000000 + clock; };

    window.__raf = {
        get now() { return clock; },
        get count() { return invoked; },
        get frames() { return frames; },
        pending: function () { return queue.length; },
        realNow: realNow,
        /**
         * Run n frames. *** THE QUEUE IS TAKEN BEFORE IT IS WALKED: *** callbacks registered DURING a frame
         * land in the fresh queue and run on the NEXT step, which is what makes a self-perpetuating loop
         * advance one frame per step instead of running to completion or spinning.
         */
        step: function (n, dtMs) {
            n = n === undefined ? 1 : n;
            dtMs = dtMs === undefined ? 1000 / 60 : dtMs;
            for (var f = 0; f < n; f++) {
                clock += dtMs;
                frames++;
                var batch = queue;
                queue = [];
                for (var i = 0; i < batch.length; i++) {
                    var cb = live.get(batch[i]);
                    if (!cb) continue;                 // cancelled between registration and this frame
                    live.delete(batch[i]);
                    invoked++;
                    try { cb(clock); } catch (e) { (window.__rafErrors = window.__rafErrors || []).push(String(e)); }
                }
            }
            return { frames: frames, invoked: invoked, pending: queue.length, now: clock };
        },
    };
})();
</script>`;

/**
 * *** THE NAIVE VERSION, FOR THE CONTROL. *** Identical except that it walks the live queue instead of taking
 * it. Exported so the gate can run a self-perpetuating loop through both and show the difference, rather
 * than asserting that taking the queue matters.
 */
export const RAF_SHIM_NAIVE = RAF_SHIM
    .replace("var batch = queue;\n                queue = [];", "var batch = queue;")
    .replace("window.__raf = {", "window.__rafNaive = true; window.__raf = {");

/** Node-side twin of the shim, so its semantics can be checked without a browser at all. */
export function makeRaf() {
    let queue = [], nextId = 1, live = new Map(), clock = 0, invoked = 0, frames = 0;
    const raf = (cb) => { const id = nextId++; live.set(id, cb); queue.push(id); return id; };
    const cancel = (id) => live.delete(id);
    const step = (n = 1, dtMs = 1000 / 60) => {
        for (let f = 0; f < n; f++) {
            clock += dtMs; frames++;
            const batch = queue; queue = [];
            for (const id of batch) {
                const cb = live.get(id);
                if (!cb) continue;
                live.delete(id); invoked++;
                cb(clock);
            }
        }
        return { frames, invoked, pending: queue.length, now: clock };
    };
    return { raf, cancel, step, get now() { return clock; }, get invoked() { return invoked; },
             get frames() { return frames; }, pending: () => queue.length };
}

/** The same thing built wrong, walking the live queue. The control for the queue-taking claim. */
export function makeRafNaive() {
    let queue = [], nextId = 1, live = new Map(), clock = 0, invoked = 0, frames = 0;
    const raf = (cb) => { const id = nextId++; live.set(id, cb); queue.push(id); return id; };
    const step = (n = 1, dtMs = 1000 / 60, cap = 10000) => {
        for (let f = 0; f < n; f++) {
            clock += dtMs; frames++;
            // NOT taken: the loop re-reads queue.length each iteration, so anything appended during the walk
            // is walked too. A self-perpetuating loop never terminates, which is why this needs a cap at all.
            for (let i = 0; i < queue.length && invoked < cap; i++) {
                const cb = live.get(queue[i]);
                if (!cb) continue;
                live.delete(queue[i]); invoked++;
                cb(clock);
            }
            queue = [];
        }
        return { frames, invoked, pending: queue.length, now: clock, capped: invoked >= cap };
    };
    return { raf, step, get invoked() { return invoked; } };
}
