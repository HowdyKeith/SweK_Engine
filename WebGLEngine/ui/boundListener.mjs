// ui/boundListener.mjs -- v4223 -- a listener that only exists while its element is in the document.
//
// Idea from mutant (a binding should only listen while its element is attached). What is taken is the RULE,
// not the framework: mutant is a template-binding library and this tree has no templates, but it has 71
// listeners on window or document inside ui/ against 8 removals, and 27 modules that add a global listener
// and remove none.
//
// *** WHY window AND document ARE THE ONLY TARGETS THAT MATTER HERE, AND THE CRUDE COUNT IS MISLEADING. ***
// ui/ has 619 addEventListener calls, which sounds alarming and mostly is not: a listener attached TO an
// element dies with that element, so a panel that is dropped takes its own button handlers with it. A
// listener on window or document does not. It holds its closure, the closure holds the element, and both
// outlive the panel for the life of the page -- and, worse than the memory, THE HANDLER KEEPS RUNNING. A
// dismissed panel still answers resize, still answers keydown, still recomputes a layout nobody can see.
//
// MEASURED IN THIS TREE: ui/HeartbeatAvatar.js installs onDragMove and onDragUp on `document` at construction
// and never removes them, so every mousemove anywhere on the page runs a drag handler that immediately
// returns. ui/kaggleLab.js already hand-rolls a MutationObserver for exactly this reason -- its own comment
// says "The dock system may remove the wrap; use a MutationObserver as a safety net for that case" -- which
// is the tell that the need is real and was being solved once, locally, by hand.
"use strict";

/**
 * *** ONE OBSERVER FOR THE WHOLE PAGE, NOT ONE PER BINDING. *** A MutationObserver on document.body with
 * subtree:true fires its callback for every DOM change anywhere. With one observer per binding, N bindings
 * means N callbacks per mutation, and a page that adds a row to a log does N pieces of work to discover that
 * nothing it cares about moved. One observer walking a registry is the same information at 1/N the cost.
 */
let _observer = null;
const _bindings = new Set();
let _sweeps = 0;

const hasDOM = () => typeof document !== "undefined" && !!document && typeof MutationObserver !== "undefined";

function _sweep() {
    _sweeps++;
    for (const b of _bindings) b.sync();
}

function _ensureObserver() {
    if (_observer || !hasDOM()) return;
    _observer = new MutationObserver(_sweep);
    try { _observer.observe(document.documentElement || document.body, { childList: true, subtree: true }); }
    catch { _observer = null; }
}

function _maybeStopObserver() {
    // *** AN OBSERVER WITH NOTHING TO WATCH IS THE LEAK THIS MODULE EXISTS TO PREVENT, IN THE MODULE ITSELF. ***
    if (_observer && _bindings.size === 0) { try { _observer.disconnect(); } catch {} _observer = null; }
}

class Binding {
    constructor(owner, target, type, handler, options) {
        this.owner = owner; this.target = target; this.type = type;
        // *** THE EXACT FUNCTION REFERENCE IS STORED, AND THIS IS THE CLASSIC SILENT FAILURE. ***
        // removeEventListener matches on identity. Hand it a fresh wrapper -- a bind(), an arrow, anything
        // built at call time -- and it removes NOTHING, returns undefined, and reports no error at all. The
        // listener stays, the "cleanup" looks done, and the bug surfaces as a handler firing twice later.
        this.handler = handler;
        this.options = options;
        this.listening = false;
        this.adds = 0; this.removes = 0;
    }
    attached() {
        const o = this.owner;
        if (!o) return false;
        if (typeof o.isConnected === "boolean") return o.isConnected;
        return hasDOM() ? document.contains(o) : false;      // isConnected is what this is, spelled out
    }
    sync() {
        const want = this.attached();
        if (want === this.listening) return false;
        if (want) { this.target.addEventListener(this.type, this.handler, this.options); this.adds++; }
        else { this.target.removeEventListener(this.type, this.handler, this.options); this.removes++; }
        this.listening = want;
        return true;
    }
    dispose() {
        if (this.listening) {
            this.target.removeEventListener(this.type, this.handler, this.options);
            this.removes++; this.listening = false;
        }
        _bindings.delete(this);
        _maybeStopObserver();
    }
}

/**
 * Listen on `target` only while `owner` is in the document.
 *
 * The owner is usually the panel the handler belongs to, and the target is usually window or document -- the
 * combination that outlives it. Re-attaching the owner re-attaches the listener, because elements MOVE in
 * this tree: the dock system reparents panels rather than rebuilding them, and a binding that only ever tore
 * down would leave a docked panel deaf.
 *
 * @returns { dispose, sync, get listening } -- dispose is idempotent.
 */
export function bindWhileAttached(owner, target, type, handler, options) {
    if (!owner || !target || typeof handler !== "function") {
        throw new TypeError("bindWhileAttached needs an owner element, a target and a handler");
    }
    const b = new Binding(owner, target, type, handler, options);
    _bindings.add(b);
    _ensureObserver();
    b.sync();                                                 // take the current state immediately
    return {
        dispose: () => b.dispose(),
        sync: () => b.sync(),
        get listening() { return b.listening; },
        get counts() { return { adds: b.adds, removes: b.removes }; },
    };
}

/**
 * Call `fn` once, when `owner` leaves the document.
 *
 * *** THIS IS THE SHAPE ui/kaggleLab.js ALREADY HAND-ROLLED, AND ITS COMMENT SAYS WHY. *** "The dock system
 * may remove the wrap; use a MutationObserver as a safety net for that case" -- and then a whole observer,
 * for one panel, to clear one interval. That is the one-idea-many-copies pattern this tree keeps finding
 * (v4191's stagger, v4212's simplex noise), and the cost is not the duplication: it is that each copy
 * observes document.body with subtree:true on its own, so every DOM change anywhere runs all of them.
 *
 * An owner that is ALREADY detached fires on the next sweep rather than immediately, so a caller cannot be
 * re-entered from inside its own constructor.
 */
export function whenDetached(owner, fn) {
    if (!owner || typeof fn !== "function") throw new TypeError("whenDetached needs an owner element and a callback");
    let done = false;
    const shim = {
        owner, target: null, listening: true, adds: 0, removes: 0,
        sync() {
            if (done) return false;
            const still = typeof owner.isConnected === "boolean" ? owner.isConnected
                : (hasDOM() ? document.contains(owner) : false);
            if (still) return false;
            done = true;
            _bindings.delete(shim);
            _maybeStopObserver();
            try { fn(); } catch { /* a teardown must not take the sweep down with it */ }
            return true;
        },
        dispose() { done = true; _bindings.delete(shim); _maybeStopObserver(); },
    };
    _bindings.add(shim);
    _ensureObserver();
    return { dispose: () => shim.dispose(), get fired() { return done; } };
}

/** Bind several at once, and dispose them together. */
export function bindAllWhileAttached(owner, specs) {
    const made = specs.map(({ target, type, handler, options }) =>
        bindWhileAttached(owner, target, type, handler, options));
    return { dispose: () => made.forEach((m) => m.dispose()), bindings: made };
}

/**
 * Run one sweep by hand.
 *
 * In a browser the MutationObserver does this. In node there is no DOM and no observer, so a test drives the
 * same code path explicitly -- which is what lets the logic be gated without a browser, and is why sync() and
 * this are public rather than internal.
 */
export function sweepAll() { _sweep(); return bindingStats(); }

/** What the registry currently holds. For the gate, and for anyone wondering what a page is listening to. */
export function bindingStats() {
    let listening = 0;
    for (const b of _bindings) if (b.listening) listening++;
    return { bindings: _bindings.size, listening, observing: !!_observer, sweeps: _sweeps };
}

/** Drop everything. Used by the gate between cases; a page would not normally call it. */
export function resetBindings() {
    for (const b of Array.from(_bindings)) b.dispose();
    _bindings.clear();
    _maybeStopObserver();
    _sweeps = 0;
}

export default bindWhileAttached;
