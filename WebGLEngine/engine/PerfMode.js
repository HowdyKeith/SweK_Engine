// =============================================================================
// FILE: /engine/PerfMode.js
// ROUND: 192
// =============================================================================
//
// A small pub/sub used to coordinate "engine pause" mode. When perf mode is
// engaged (typically by the bench at startup), every registered subsystem
// receives a pause callback and can stop its background work — freeing CPU
// for whatever the user wants to measure. When released, subsystems resume.
//
// Initial subscribers:
//   - IdleScheduler  → calls .stop() / .start()
//
// Future subscribers (any subsystem can self-register):
//   - civ AI tick loops
//   - kaiju AI / projectile updates
//   - weather transitions
//   - palchat narrative requests
//
// Public API on window.enginePerf:
//   pause(reason?) → engages perf mode; idempotent
//   resume()       → disengages; idempotent
//   isPaused()     → bool
//   onPause(fn)    → register a pause handler; returns unsub fn
//   onResume(fn)   → register a resume handler; returns unsub fn
//   register({ name, pause, resume }) → convenience; both handlers at once
// =============================================================================

const _pauseHandlers  = new Set();
const _resumeHandlers = new Set();
const _registered    = new Map();     // name → { pause, resume } for introspection
let   _paused        = false;
let   _reason        = null;
const _statusListeners = new Set();   // UI subscribers to mode changes

function _notifyStatus() {
    for (const fn of _statusListeners) {
        try { fn({ paused: _paused, reason: _reason }); }
        catch (e) { console.warn("[enginePerf] status listener threw:", e); }
    }
}

export const enginePerf = {
    pause(reason = null) {
        if (_paused) return;
        _paused = true;
        _reason = reason;
        for (const fn of _pauseHandlers) {
            try { fn(reason); }
            catch (e) { console.warn("[enginePerf] pause handler threw:", e); }
        }
        console.log(`[enginePerf] PAUSED${reason ? ` — ${reason}` : ""} (${_pauseHandlers.size} subsystems)`);
        _notifyStatus();
    },

    resume() {
        if (!_paused) return;
        _paused = false;
        const prev = _reason;
        _reason = null;
        for (const fn of _resumeHandlers) {
            try { fn(prev); }
            catch (e) { console.warn("[enginePerf] resume handler threw:", e); }
        }
        console.log(`[enginePerf] resumed (${_resumeHandlers.size} subsystems)`);
        _notifyStatus();
    },

    isPaused()  { return _paused; },
    reason()    { return _reason; },

    onPause(fn) {
        _pauseHandlers.add(fn);
        return () => _pauseHandlers.delete(fn);
    },
    onResume(fn) {
        _resumeHandlers.add(fn);
        return () => _resumeHandlers.delete(fn);
    },

    register({ name, pause, resume }) {
        if (!name) throw new Error("enginePerf.register: name required");
        _registered.set(name, { pause, resume });
        if (pause)  _pauseHandlers.add(pause);
        if (resume) _resumeHandlers.add(resume);
        return () => {
            _registered.delete(name);
            if (pause)  _pauseHandlers.delete(pause);
            if (resume) _resumeHandlers.delete(resume);
        };
    },

    list() { return Array.from(_registered.keys()); },

    onStatusChange(fn) {
        _statusListeners.add(fn);
        return () => _statusListeners.delete(fn);
    },
};

// Expose on window so other code (bench, console pokes) can reach it
// without imports. Idempotent; multiple imports share the same object.
if (typeof window !== "undefined" && !window.enginePerf) {
    window.enginePerf = enginePerf;
}
