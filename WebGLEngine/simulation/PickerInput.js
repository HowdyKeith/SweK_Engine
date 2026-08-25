// FILE: simulation/PickerInput.js
// VERSION: v615 — generalized picker input source.
//
// Owns "where is the cursor right now in NDC, and who last touched it" plus a
// click event bus. Two input sources feed it: the mouse (via canvas listeners
// in SandboxMode) and the phone (via WS messages from phone.html, routed in
// by main.js — see the phone:picker:* handlers there).
//
// Why this abstraction: SandboxMode previously tracked the cursor itself from
// canvas mousemove. To let the phone drive the same picker, we need a single
// "current cursor" that either source can update, and a single click event
// that the SandboxMode consumer subscribes to. Other demos can install their
// own SandboxMode-style consumer pointing at this same global pickerInput.
//
// Exposed as `window._pickerInput` after creation so the WS routing in main.js
// can reach it without an import chain.

export class PickerInput {
    constructor() {
        this.ndcX = 0;
        this.ndcY = 0;
        this.valid = false;
        this.source = null;             // 'mouse' | 'phone' | null
        this.lastActivityMs = 0;

        // phone calibration: first orient sample after the phone enables
        // picker mode becomes (0, 0). Subsequent samples report Δ from there.
        this._phoneBase = null;         // { beta, gamma } once set
        this._phoneSensitivity = 0.04;  // NDC units per degree of tilt — ~25° spans the full screen

        this._clickCbs = new Set();
        this._rightClickCbs = new Set();   // v618 — mouse contextmenu + phone long-press
    }

    onClick(cb) { this._clickCbs.add(cb); return () => this._clickCbs.delete(cb); }
    onRightClick(cb) { this._rightClickCbs.add(cb); return () => this._rightClickCbs.delete(cb); }

    // ---- mouse path (called from SandboxMode mousemove) ----
    setMousePixel(px, py, w, h) {
        if (!w || !h) return;
        this.ndcX = (px / w) * 2 - 1;
        this.ndcY = -((py / h) * 2 - 1);
        this.valid = true;
        this.source = "mouse";
        this.lastActivityMs = Date.now();
    }
    fireMouseClick() {
        this._fireClick("mouse");
    }
    clearMouse() {
        if (this.source === "mouse") {
            this.valid = false;
            this.source = null;
        }
    }

    // ---- phone path (called by main.js WS handler) ----
    // Enter "picker mode" on the phone: next orient sample is the calibration
    // baseline (cursor at center). Tap = click.
    phoneArm() { this._phoneBase = null; this.lastActivityMs = Date.now(); }
    phoneDisarm() {
        this._phoneBase = null;
        if (this.source === "phone") {
            this.valid = false;
            this.source = null;
        }
    }
    setPhoneOrient(alpha, beta, gamma) {
        // beta  = front/back tilt   (positive when tipping toward the user)
        // gamma = left/right tilt   (positive when tipping right)
        if (this._phoneBase == null) {
            this._phoneBase = { beta, gamma };
        }
        const dBeta  = beta  - this._phoneBase.beta;
        const dGamma = gamma - this._phoneBase.gamma;
        // gamma -> ndcX (right tilt = cursor right)
        // beta  -> ndcY (tilt up = cursor up; beta increases when tipping back away)
        this.ndcX = _clamp(dGamma * this._phoneSensitivity, -1, 1);
        this.ndcY = _clamp(-dBeta  * this._phoneSensitivity, -1, 1);
        this.valid = true;
        this.source = "phone";
        this.lastActivityMs = Date.now();
    }
    firePhoneTap() {
        this._fireClick("phone");
    }
    // v618 — right-click parity. Mouse path fires from contextmenu; phone path
    // fires from the long-press WS message (phone.html holds the threshold).
    fireMouseRightClick() { this._fireRightClick("mouse"); }
    firePhoneRightClick() { this._fireRightClick("phone"); }
    recalibrate() { this._phoneBase = null; }

    // ---- query ----
    getNDC()    { return this.valid ? { x: this.ndcX, y: this.ndcY, source: this.source } : null; }
    getStatus() {
        return {
            source: this.source,
            valid: this.valid,
            ndcX: this.ndcX, ndcY: this.ndcY,
            lastActivityMs: this.lastActivityMs,
            phoneCalibrated: this._phoneBase != null,
        };
    }

    _fireClick(source) {
        for (const cb of this._clickCbs) { try { cb({ source, ndcX: this.ndcX, ndcY: this.ndcY }); } catch (e) { console.warn("[picker click cb]", e?.message); } }
    }
    _fireRightClick(source) {
        for (const cb of this._rightClickCbs) { try { cb({ source, ndcX: this.ndcX, ndcY: this.ndcY }); } catch (e) { console.warn("[picker rclick cb]", e?.message); } }
    }
}

function _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
