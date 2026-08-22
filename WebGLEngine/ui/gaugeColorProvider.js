// FILE: ui/gaugeColorProvider.js
// VERSION: v889 — wire the demo-chrome gauge/system state into the
// color-as-indicator system (avatarColor). The avatar becomes a status light:
//   - CPU/GPU/RAM load pegged (>= RED_PCT)   -> red wash
//   - elevated (>= AMBER_PCT)                 -> amber wash
//   - healthy / idle                          -> null (rests at the avatar's
//                                                per-favorite default color)
//
// It polls the same source the gauges use (GET /system/stats, served from the
// bridge origin) on its own ~3s loop and caches the peak load; the avatarColor
// provider callback (polled ~1Hz) maps the cached peak to a color synchronously.
//
// Honored everywhere an avatar renders: RobotExpressive.html loads this module
// directly, and demoChrome lazy-imports it so the mini stamp reacts too.
//
// Toggle: Settings -> Avatar Settings -> "Gauge -> avatar color"
// (localStorage "voxelEngine.gaugeColor"; default on). window.gaugeColorProvider
// exposes enable()/disable()/setThresholds()/refreshNow().

import avatarColor from "./avatarColor.js";

const POLL_MS = 3000;
const LS_FLAG = "voxelEngine.gaugeColor";

const COLORS = {
    red:   { rgb: [0.90, 0.18, 0.18], amt: 0.62 },
    amber: { rgb: [0.96, 0.62, 0.14], amt: 0.50 },
};

class GaugeColorProvider {
    constructor() {
        this._peak = null;       // latest max(cpu,gpu,ram) utilization %, or null if unknown
        this._timer = null;
        this._unreg = null;
        this.RED_PCT = 85;
        this.AMBER_PCT = 65;
        this._poll = this._poll.bind(this);
        this._start();
    }

    _enabled() {
        try { return localStorage.getItem(LS_FLAG) !== "off"; } catch { return true; }
    }

    _start() {
        if (this._unreg) return;
        // Highest priority among providers — a hardware alarm should win over
        // softer signals if others get added later.
        this._unreg = avatarColor.registerProvider(() => this._color(), 100);
        if (typeof setInterval !== "undefined") {
            this._poll();
            this._timer = setInterval(this._poll, POLL_MS);
        }
    }

    async _poll() {
        if (!this._enabled()) { this._peak = null; return; }
        try {
            const r = await fetch("/system/stats", { cache: "no-store" });
            const j = await r.json();
            const vals = [];
            if (j && j.cpu && Number.isFinite(j.cpu.utilPct)) vals.push(j.cpu.utilPct);
            if (j && j.gpu && Number.isFinite(j.gpu.utilPct)) vals.push(j.gpu.utilPct);
            if (j && j.mem && Number.isFinite(j.mem.usedPct)) vals.push(j.mem.usedPct);
            this._peak = vals.length ? Math.max(...vals) : null;
        } catch {
            // Bridge offline — drop the signal (the dead-eye system handles
            // offline separately; we just stop washing).
            this._peak = null;
        }
    }

    // Synchronous mapping for the avatarColor provider poll.
    _color() {
        if (!this._enabled() || this._peak == null) return null;
        if (this._peak >= this.RED_PCT)   return COLORS.red;
        if (this._peak >= this.AMBER_PCT) return COLORS.amber;
        return null;   // healthy → let the per-favorite default show
    }

    enable()  { try { localStorage.setItem(LS_FLAG, "on"); } catch {} this.refreshNow(); }
    disable() { try { localStorage.setItem(LS_FLAG, "off"); } catch {} this._peak = null; }
    setThresholds(amberPct, redPct) {
        if (Number.isFinite(amberPct)) this.AMBER_PCT = amberPct;
        if (Number.isFinite(redPct))   this.RED_PCT = redPct;
    }
    refreshNow() { return this._poll(); }
    get peak() { return this._peak; }
}

let _singleton = null;
export function getGaugeColorProvider() {
    if (!_singleton) _singleton = new GaugeColorProvider();
    return _singleton;
}

const provider = getGaugeColorProvider();
if (typeof window !== "undefined") { window.gaugeColorProvider = provider; }

export default provider;
