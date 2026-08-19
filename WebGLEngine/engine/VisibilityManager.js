// FILE: engine/VisibilityManager.js
// VERSION: v1 — round 337
//
// Tracks page visibility (browser tab focus / window minimize) and
// exposes a flag the main loop reads to decide whether to render full
// frames or skip to a low background tick rate. This is the WebGL
// equivalent of a screensaver — when the user tabs away or minimizes
// the window, the engine shouldn't be burning GPU/CPU/battery rendering
// frames nobody is looking at.
//
// Uses the Page Visibility API (document.visibilityState +
// visibilitychange event). Reliable across Chrome, Edge, Firefox,
// Safari. Browsers also throttle requestAnimationFrame in background
// tabs to ~1Hz on their own, but this is opt-in explicit control —
// we can also pause audio + cancel timers, not just rendering.
//
// Usage:
//   const vis = new VisibilityManager();
//   vis.attach();
//   // in render loop:
//   if (vis.shouldSkipFrame()) return;
//
// State machine:
//   "visible"   — page is foreground tab + window not minimized
//   "hidden"    — tab switched away OR window minimized
//
// The hidden→visible transition immediately re-enables rendering.

export class VisibilityManager {
    constructor(opts = {}) {
        // When hidden, render ONE frame every N frames (where N is
        // computed from a target background fps). 1fps in the background
        // keeps the canvas state fresh enough for thumbnail previews but
        // basically idles the GPU.
        this.backgroundFps   = opts.backgroundFps ?? 1;
        this.foregroundFps   = opts.foregroundFps ?? 60;
        this.muteAudioWhenHidden = opts.muteAudioWhenHidden ?? false;

        // v1421 — IDLE auto-throttle. A *foreground* tab left untouched (e.g. running
        // overnight) otherwise renders at foregroundFps forever, pegging a CPU core + the
        // GPU. After idleAfterMs with no input we drop to idleFps; ANY input resumes
        // instantly. Disable with setIdleEnabled(false) for an always-animating kiosk.
        this.idleEnabled  = opts.idleEnabled  ?? true;
        this.idleAfterMs  = opts.idleAfterMs  ?? 300000;     // 5 min (bare sandbox)
        // While a demo is actively playing we DON'T idle on lack of input (passive-watch
        // demos keep animating). A much longer hard-idle window still catches a demo left
        // running overnight so it can't peg the GPU forever.
        this.hardIdleAfterMs = opts.hardIdleAfterMs ?? 2700000;   // 45 min
        this._activityProbe  = null;   // () => true when a demo is actively playing
        this.idleFps      = opts.idleFps       ?? 8;
        this._lastInput   = (typeof performance !== "undefined" ? performance.now() : Date.now());
        this._idle        = false;
        this._inputHandler = null;

        this._state = "visible";
        this._frameSinceLastRender = 0;
        this._listeners = new Set();
        this._handler = null;
        this._attached = false;

        // Audio mute restoration tracking. Only used if
        // muteAudioWhenHidden is true.
        this._wasMutedBeforeHidden = false;
    }

    attach() {
        if (this._attached || typeof document === "undefined") return;
        // Initial state from document
        this._state = document.visibilityState === "hidden" ? "hidden" : "visible";
        this._handler = () => this._onVisibilityChange();
        document.addEventListener("visibilitychange", this._handler);
        // input activity → reset the idle clock (and resume immediately if we were idle)
        this._lastInput = (typeof performance !== "undefined" ? performance.now() : Date.now());
        this._inputHandler = () => {
            this._lastInput = (typeof performance !== "undefined" ? performance.now() : Date.now());
            if (this._idle) { this._idle = false; this._frameSinceLastRender = 0; this._emit("visible"); console.log("[visibility] idle off (input)"); }
        };
        if (typeof window !== "undefined") {
            for (const ev of ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "pointerdown"]) {
                try { window.addEventListener(ev, this._inputHandler, { passive: true }); } catch (e) { try { window.addEventListener(ev, this._inputHandler); } catch (e2) {} }
            }
        }
        this._attached = true;
    }

    detach() {
        if (!this._attached) return;
        document.removeEventListener("visibilitychange", this._handler);
        this._handler = null;
        if (this._inputHandler && typeof window !== "undefined") { for (const ev of ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "pointerdown"]) { try { window.removeEventListener(ev, this._inputHandler); } catch (e) {} } this._inputHandler = null; }
        this._attached = false;
    }

    _onVisibilityChange() {
        const prev = this._state;
        this._state = document.visibilityState === "hidden" ? "hidden" : "visible";
        if (prev === this._state) return;
        this._frameSinceLastRender = 0;
        if (this.muteAudioWhenHidden) {
            if (this._state === "hidden") {
                this._wasMutedBeforeHidden = !!(window._muteState?.muted);
                if (!this._wasMutedBeforeHidden) {
                    try { window.muteAllAudio?.(); } catch {}
                }
            } else {
                if (!this._wasMutedBeforeHidden) {
                    try { window.unmuteAllAudio?.(); } catch {}
                }
            }
        }
        this._emit(this._state);
        console.log(`[visibility] ${prev} → ${this._state}`);
    }

    _emit(state) { for (const fn of this._listeners) { try { fn(state); } catch (e) { console.warn("[VisibilityManager] listener error:", e); } } }

    /** Subscribe to state changes. Returns an unsubscribe function. */
    onChange(fn) {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    /** Current state ("visible" or "hidden"). */
    get state() { return this._state; }
    isVisible() { return this._state === "visible"; }
    isHidden()  { return this._state === "hidden"; }

    /**
     * Called once per render-loop tick. Returns true if THIS FRAME should
     * be skipped (don't render, don't run heavy logic). Counts frames so
     * we still produce occasional output when hidden — useful for tab
     * thumbnail previews and to keep WebGL contexts alive.
     */
    shouldSkipFrame() {
        // v1643 — hard render floor: when set (docked renderless mode), throttle to this fps regardless of
        // visible/idle so the 3D loop costs almost nothing while the SVG dock is the active view.
        if (this._renderFloor != null) return this._throttleTo(this._renderFloor);
        // Hidden tab → background fps.
        if (this._state === "hidden") return this._throttleTo(this.backgroundFps);
        // Visible but idle (no input for idleAfterMs) → idle fps.
        if (this.idleEnabled) {
            const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
            let active = false; if (this._activityProbe) { try { active = !!this._activityProbe(); } catch (e) {} }
            const threshold = active ? this.hardIdleAfterMs : this.idleAfterMs;   // playing demo defers idle
            const idle = (now - this._lastInput) > threshold;
            if (idle !== this._idle) { this._idle = idle; this._frameSinceLastRender = 0; this._emit(idle ? "idle" : "visible"); console.log(`[visibility] idle ${idle ? `on (${active ? "demo " + Math.round(this.hardIdleAfterMs / 60000) + "min" : "no input"})` : "off"}`); }
            if (idle) return this._throttleTo(this.idleFps);
        }
        return false;  // full fps
    }
    _throttleTo(fps) {
        this._frameSinceLastRender++;
        const skip = Math.max(1, Math.round(this.foregroundFps / Math.max(0.1, fps)));
        if (this._frameSinceLastRender >= skip) { this._frameSinceLastRender = 0; return false; }
        return true;
    }
    /** True while a foreground tab is throttled for being idle. */
    isIdle() { return this._idle; }

    /** Tuning knobs at runtime. */
    setBackgroundFps(fps) { this.backgroundFps = Math.max(0.1, +fps || 1); }
    setRenderFloor(fps) { this._renderFloor = (fps == null) ? null : Math.max(0.2, +fps || 1); }   // v1643 — null = normal; a value forces that fps (docked renderless mode)
    setMuteAudioWhenHidden(b) { this.muteAudioWhenHidden = !!b; }
    setIdleEnabled(b) { this.idleEnabled = !!b; if (!b) this._idle = false; }
    setIdleAfter(ms)  { this.idleAfterMs = Math.max(5000, +ms || 300000); }
    setIdleFps(fps)   { this.idleFps = Math.max(0.5, +fps || 8); }
    setActivityProbe(fn) { this._activityProbe = (typeof fn === "function") ? fn : null; }   // v1422
    setHardIdleAfter(ms) { this.hardIdleAfterMs = Math.max(this.idleAfterMs, +ms || 2700000); }

    /** Snapshot for diagnostics. */
    stats() {
        return {
            state: this._state,
            attached: this._attached,
            backgroundFps: this.backgroundFps,
            idle: this._idle,
            idleEnabled: this.idleEnabled,
            idleAfterMs: this.idleAfterMs,
            hardIdleAfterMs: this.hardIdleAfterMs,
            demoActive: (() => { try { return this._activityProbe ? !!this._activityProbe() : false; } catch { return false; } })(),
            idleFps: this.idleFps,
            secsSinceInput: Math.round(((typeof performance !== "undefined" ? performance.now() : Date.now()) - this._lastInput) / 1000),
            muteAudioWhenHidden: this.muteAudioWhenHidden,
            listeners: this._listeners.size,
        };
    }
}
