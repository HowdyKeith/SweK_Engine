// FILE: engine/frameDirty.js
// VERSION: v1 -- v4174
//
// Dirty-flag rendering: skip the draw when nothing in the scene changed.
// The idea is from boona13/mykonos-island-voxels (MIT), whose 2D-canvas
// loop exits early when the scene is static and no animation is pending.
// The rendering there does not transfer to WebGL2; the loop discipline does.
//
// *** THE FAILURE MODES ARE NOT SYMMETRIC, AND THIS MODULE IS BUILT AROUND
// *** THAT FACT. A dirty flag that fires when nothing moved costs one wasted
// *** frame. A dirty flag that MISSES a change freezes the screen, and a
// *** frozen screen is indistinguishable from a crash. So the whole design
// *** is arranged so the cheap failure is the one you get when you are wrong.
//
// Two consequences of that, both load-bearing:
//
// 1. CLEAN IS PROVEN, NEVER ASSUMED. The frame is skipped only when EVERY
//    registered source affirmatively reports itself static. Anything this
//    module has not been told about cannot vote for "clean" -- it can only
//    fail to vote for "dirty" -- which is why registration is the ONLY way
//    to be quiet, and why a probe that THROWS renders the frame instead of
//    being ignored. Forgetting to register a new animated system costs a
//    wasted frame; it can never freeze the screen.
//
// 2. THERE IS A HEARTBEAT. Even if every rule above were wrong at once, the
//    loop cannot skip more than maxSkip frames in a row. A total logic
//    failure degrades to a slow screen, not a dead one, and the run counter
//    in stats() makes that visible instead of silent.
//
// Two ways to say something changed, because there are two kinds of change:
//
//   markDirty(reason)      edge-triggered. "This just happened." A block was
//                          placed, a panel opened, the camera moved. One
//                          frame is drawn and the flag clears.
//
//   addSource(name, probe) level-triggered. probe() is truthy for as long as
//                          that system is animating. Water, particles, a
//                          playing cinematic. Cleared by the system itself
//                          going quiet, not by us drawing a frame.
//
// The falling edge of a source is itself a change, and this is the subtle
// one. If a probe is truthy on frame N and falsy on frame N+1, the state the
// system settled into during frame N+1's tick has never been drawn -- the
// last frame of every animation would be dropped, leaving the screen showing
// the second-to-last. So a source going active -> inactive marks dirty, and
// that final frame gets drawn.
//
// Usage:
//   const fd = new FrameDirty({ enabled: true });
//   fd.addSource("water", () => waterField.isAnimating());
//   // in the render loop, AFTER the ticks and BEFORE the draw:
//   if (fd.shouldRender().render) renderer.render(visible, camera);

/** Sentinel returned when a probe throws. Renders the frame. */
const PROBE_FAILED = "probe-threw";

export class FrameDirty {
    constructor(opts = {}) {
        // Off by default. Turning this on for the whole engine is a decision
        // that needs a census of every animated subsystem behind it, not a
        // default -- see the module note above on which way to be wrong.
        this.enabled = opts.enabled ?? false;

        // Hard ceiling on consecutive skipped frames. At 60fps a maxSkip of
        // 30 means the worst case a bug can produce is a half-second stale
        // screen, which a person notices as a stutter and not as a crash.
        this.maxSkip = Math.max(1, opts.maxSkip ?? 30);

        this._dirty = true;             // first frame always draws
        this._reason = "init";
        this._sources = new Map();      // name -> probe fn
        this._covers = new Map();       // name -> [ticker names this probe guards]
        this._wasActive = new Map();    // name -> truthiness last seen, for the falling edge
        this._skipRun = 0;              // consecutive frames skipped
        this._frames = 0;
        this._skipped = 0;
        this._rendered = 0;
        this._lastWhy = "init";
        this._faults = new Map();       // name -> count of probe throws
    }

    /**
     * Edge-triggered change. Safe to call from anywhere at any time,
     * including from inside a probe, and any number of times per frame.
     * The reason is kept for diagnostics only -- the flag is a boolean and
     * the last reason wins.
     */
    markDirty(reason) {
        this._dirty = true;
        this._reason = (typeof reason === "string" && reason) ? reason : "unspecified";
    }

    /**
     * Register a level-triggered source. probe() should return truthy for
     * as long as that system is animating. Registering the same name twice
     * REPLACES the probe rather than adding a second one, so a module that
     * re-registers on reload does not accumulate stale closures over the
     * old object -- a stale probe reading a dead system is exactly the kind
     * of quiet wrong answer this module must not have.
     * Returns an unregister function.
     */
    addSource(name, probe, opts = {}) {
        if (typeof probe !== "function") throw new TypeError("FrameDirty.addSource: probe must be a function");
        const key = String(name);
        // v4183 -- WHAT THIS PROBE GUARDS, by the names the census knows them under. A probe is named for its
        // ROLE ("agents") while the census counts TICKERS (aiManager, botManager, remotePlayers), so without
        // this a probe covering three systems is credited with none of them and the census permanently
        // under-reports its own progress -- a measuring instrument reading low, which is worse than no
        // instrument because it looks like data.
        if (Array.isArray(opts.covers) && opts.covers.length) this._covers.set(key, opts.covers.slice());
        this._sources.set(key, probe);
        this._wasActive.delete(key);
        // A newly registered source is a change by itself: whatever it is
        // about to animate is not on screen yet.
        this.markDirty("source-added:" + key);
        return () => { this._sources.delete(key); this._wasActive.delete(key); this.markDirty("source-removed:" + key); };
    }

    /** Names of every registered source, for diagnostics and for the gate. */
    sources() { return Array.from(this._sources.keys()); }

    /**
     * Every TICKER name guarded by some probe. This is what engine/frameDirtyCensus.mjs counts against, and
     * it is deliberately not the same list as sources(): one probe can guard several tickers, and the census
     * is asking which SYSTEMS are covered, not how many probes exist.
     */
    covered() {
        const out = new Set();
        for (const list of this._covers.values()) for (const n of list) out.add(n);
        return [...out].sort();
    }

    /**
     * Called once per frame, after the ticks and before the draw. Returns
     * { render, why }. Never throws: a probe that throws is counted, named
     * in `why`, and renders the frame.
     */
    shouldRender() {
        this._frames++;
        const decide = (render, why) => {
            this._lastWhy = why;
            if (render) { this._rendered++; this._skipRun = 0; this._dirty = false; this._reason = ""; }
            else { this._skipped++; this._skipRun++; }
            return { render, why };
        };

        // Every probe runs every frame even once one has already voted to
        // render, because _wasActive has to stay current for ALL of them.
        // Short-circuiting on the first active source would leave the others'
        // last-seen state frozen at whatever it was when the short-circuit
        // began, and their falling edges would then be missed -- the exact
        // dropped-final-frame bug the edge rule exists to prevent.
        let active = null;
        let fell = null;
        let threw = null;
        for (const [name, probe] of this._sources) {
            let now = false;
            try {
                now = !!probe();
            } catch (e) {
                now = false;
                this._faults.set(name, (this._faults.get(name) || 0) + 1);
                if (threw === null) threw = name;
            }
            const before = this._wasActive.get(name);
            if (before === true && now === false && fell === null) fell = name;
            this._wasActive.set(name, now);
            if (now && active === null) active = name;
        }

        if (!this.enabled) return decide(true, "disabled");
        if (threw !== null) return decide(true, PROBE_FAILED + ":" + threw);
        if (this._dirty) return decide(true, "marked:" + (this._reason || "unspecified"));
        if (active !== null) return decide(true, "active:" + active);
        if (fell !== null) return decide(true, "settled:" + fell);
        if (this._skipRun >= this.maxSkip) return decide(true, "heartbeat");
        return decide(false, "clean");
    }

    /** Force the next frame to draw and reset the skip run. */
    reset() { this._dirty = true; this._reason = "reset"; this._skipRun = 0; this._wasActive.clear(); }

    setEnabled(b) { const on = !!b; if (on !== this.enabled) { this.enabled = on; this.markDirty(on ? "enabled" : "disabled"); this._skipRun = 0; } }
    setMaxSkip(n) { this.maxSkip = Math.max(1, +n || 30); }

    stats() {
        return {
            enabled: this.enabled,
            maxSkip: this.maxSkip,
            frames: this._frames,
            rendered: this._rendered,
            skipped: this._skipped,
            skipRun: this._skipRun,
            savedPct: this._frames ? Math.round((this._skipped / this._frames) * 1000) / 10 : 0,
            lastWhy: this._lastWhy,
            sources: this.sources(),
            faults: Object.fromEntries(this._faults),
        };
    }
}

export default FrameDirty;
