// =============================================================================
// FILE: /simulation/DayNightCycle.js
// ROUND: 238
// =============================================================================
//
// Time-of-day cycle that drives a tinted darkening filter via the
// CanvasFilter "lighting" slot. Pairs with v235 vision modes: at
// night the world goes nearly black, and the player NEEDS the
// flashlight or night-vision to see anything. Heat and soul-tracker
// modes are still useful (their compass projections are independent
// of world lighting).
//
// Time model:
//   • Hours are floats in [0, 24).
//   • A full 24-hour cycle takes `secondsPerDay` real seconds (default
//     240s = 4 minutes — long enough that you don't feel rushed, short
//     enough that you see a full night during one dungeon).
//   • Cycle can be paused / set to a fixed hour. OllamaLevelGenerator
//     can pin a dungeon to a specific time of day for atmospheric
//     fixed-lighting levels (e.g., "haunted catacombs at midnight").
//
// Filter palette interpolation: 4 keyframe palettes (night/dawn/day/
// dusk) lerped piecewise to produce smooth transitions. Each palette
// has { brightness, saturate, hue, contrast }; the composed filter
// string is a brightness+saturate+hue-rotate+contrast quad.
//
// HUD: top-right corner clock showing the current hour with a sun/
// moon emoji that matches the period. Click-through (pointer-events:
// none) so it never gets in the way.
//
// API:
//   const dn = new DayNightCycle({ ollamaLevelGen, secondsPerDay: 240 });
//   dn.tick(dt);
//   dn.setHour(18.5);           — pin to a specific hour
//   dn.setSecondsPerDay(120);   — half-speed cycle
//   dn.pause() / dn.resume();
//   dn.getHour();
//   dn.getPeriod();             — "dawn" | "day" | "dusk" | "night"
// =============================================================================

import { CanvasFilter } from "./CanvasFilter.js";

// Keyframe palettes. Hours below are the PEAK time for each palette;
// interpolation between two neighbors covers the in-between hours.
const PALETTES = {
    // Round 259 — night brightness raised from 0.20 → 0.45 (more than
    // doubled). User feedback: dark world was too dark to play through.
    // Saturation and hue keep the night/blue feel intact.
    night: { brightness: 0.45, saturate: 0.78, hue: 215, contrast: 1.05 },
    // Round 259 — dawn lifted from 0.70 → 0.85 so the dawn-to-day
    // transition isn't a sudden brightness jump.
    dawn:  { brightness: 0.85, saturate: 1.15, hue:  -8, contrast: 1.00 },
    day:   { brightness: 1.00, saturate: 1.00, hue:   0, contrast: 1.00 },
    // Round 259 — dusk lifted from 0.60 → 0.80
    dusk:  { brightness: 0.80, saturate: 1.20, hue:  22, contrast: 1.00 },
};

// Period boundaries chosen so dawn + dusk last ~2 hours each and
// night/day fill the rest. Returns { name, t01 } where t01 is the
// 0..1 position within the interpolation between this period's
// palette and the next.
function _periodAndLerp(hour) {
    if (hour < 5)             return { from: "night", to: "night", t: 0 };
    if (hour < 7)             return { from: "night", to: "dawn",  t: (hour - 5) / 2 };
    if (hour < 10)            return { from: "dawn",  to: "day",   t: (hour - 7) / 3 };
    if (hour < 16)            return { from: "day",   to: "day",   t: 0 };
    if (hour < 18)            return { from: "day",   to: "dusk",  t: (hour - 16) / 2 };
    if (hour < 20)            return { from: "dusk",  to: "night", t: (hour - 18) / 2 };
    return                           { from: "night", to: "night", t: 0 };
}

function _lerp(a, b, t) { return a + (b - a) * t; }

function _composeFilter(hour) {
    const { from, to, t } = _periodAndLerp(hour);
    const a = PALETTES[from], b = PALETTES[to];
    const brightness = _lerp(a.brightness, b.brightness, t);
    const saturate   = _lerp(a.saturate,   b.saturate,   t);
    const hue        = _lerp(a.hue,        b.hue,        t);
    const contrast   = _lerp(a.contrast,   b.contrast,   t);
    // Pure noon is a no-op
    if (brightness > 0.99 && Math.abs(hue) < 0.5 && Math.abs(saturate - 1) < 0.02 && Math.abs(contrast - 1) < 0.02) {
        return null;
    }
    return `brightness(${brightness.toFixed(3)}) saturate(${saturate.toFixed(3)}) hue-rotate(${hue.toFixed(1)}deg) contrast(${contrast.toFixed(3)})`;
}

// Map an hour to a coarse-grained period label for the HUD + tests
function _periodLabel(hour) {
    if (hour < 5 || hour >= 20) return "night";
    if (hour < 7)               return "dawn";
    if (hour < 18)              return "day";
    return "dusk";
}

const PERIOD_EMOJI = {
    dawn: "🌅", day: "☀️", dusk: "🌇", night: "🌃",
};

// Named alias → hour. Used both by the schema field and by the
// console API for ergonomics.
const NAMED_TIMES = {
    midnight:    0,
    pre_dawn:    4,
    dawn:        6,
    morning:     9,
    noon:       12,
    afternoon:  15,
    dusk:       18,
    twilight:   19.5,
    night:      22,
};

export function resolveNamedTime(value) {
    if (typeof value === "number" && isFinite(value)) {
        return ((value % 24) + 24) % 24;
    }
    if (typeof value === "string" && NAMED_TIMES[value] != null) {
        return NAMED_TIMES[value];
    }
    return null;
}

export class DayNightCycle {
    constructor({ ollamaLevelGen = null, secondsPerDay = 240, startHour = 12 } = {}) {
        this.ollamaLevelGen = ollamaLevelGen;
        this._secondsPerDay = Math.max(10, secondsPerDay);
        this._hour = startHour;
        this._paused = false;
        this._pinnedHour = null;     // set when a dungeon fixes time
        this._hudEl = null;
        this._lastSeenLayout = null;
    }

    tick(dt) {
        // Read possible time pin from the current dungeon (only on
        // first tick after a new dungeon loads — detect via reference)
        if (this.ollamaLevelGen) {
            const layout = this.ollamaLevelGen._lastLevel;
            if (layout !== this._lastSeenLayout) {
                this._lastSeenLayout = layout;
                const pinned = resolveNamedTime(layout?.time_of_day);
                this._pinnedHour = pinned;
                if (pinned != null) this._hour = pinned;
            }
        }

        if (!this._paused && this._pinnedHour == null) {
            const hoursPerSec = 24 / this._secondsPerDay;
            this._hour = (this._hour + hoursPerSec * dt) % 24;
        }

        this._applyFilter();
        this._renderClock();
    }

    setHour(h) {
        const resolved = resolveNamedTime(h);
        if (resolved != null) this._hour = resolved;
    }
    setSecondsPerDay(s) { this._secondsPerDay = Math.max(10, s); }
    pause()  { this._paused = true; }
    resume() { this._paused = false; }

    getHour()   { return this._hour; }
    getPeriod() { return _periodLabel(this._hour); }
    getStats()  {
        return {
            hour: this._hour,
            period: this.getPeriod(),
            paused: this._paused,
            pinnedHour: this._pinnedHour,
            secondsPerDay: this._secondsPerDay,
        };
    }
    getFilterString() { return _composeFilter(this._hour); }

    dispose() {
        CanvasFilter.setSlot("lighting", null);
        if (this._hudEl?.parentNode) this._hudEl.parentNode.removeChild(this._hudEl);
        this._hudEl = null;
    }

    // ----- Internal -----------------------------------------------------

    _applyFilter() {
        CanvasFilter.setSlot("lighting", _composeFilter(this._hour));
    }

    _renderClock() {
        if (typeof document === "undefined") return;
        if (!this._hudEl) {
            const el = document.createElement("div");
            el.id = "daynight-clock";
            Object.assign(el.style, {
                position: "fixed",
                right: "12px", top: "12px",
                padding: "5px 10px",
                background: "rgba(10,14,22,0.78)",
                border: "1px solid #345",
                borderRadius: "4px",
                fontFamily: "monospace",
                fontSize: "11px",
                letterSpacing: "1px",
                color: "#cef",
                zIndex: "8600",
                pointerEvents: "none",
            });
            document.body.appendChild(el);
            this._hudEl = el;
        }
        const period = _periodLabel(this._hour);
        const emoji = PERIOD_EMOJI[period];
        const hh = Math.floor(this._hour);
        const mm = Math.floor((this._hour - hh) * 60);
        const pinTag = this._pinnedHour != null ? ' <span style="color:#fc6;">📌</span>' : "";
        this._hudEl.innerHTML = `${emoji} ${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}${pinTag}`;
    }
}
