// FILE: ui/runnerPanel.js
// VERSION: v4163 -- RunCatNeo's readout, pointed at any JSON endpoint this engine serves.
//
// The arithmetic and every decision worth arguing about live in ui/runnerGauge.mjs, which is pure and gated.
// This file is the DOM and the clock, and deliberately holds no judgement of its own.
//
// *** IT DOES NOT POLL. *** ui/poller.js already owns that -- backoff on a failing endpoint, a concurrency
// cap, and a pause when the tab is hidden -- and a second polling loop in this tree would be the defect it
// names most. pollOnce(key, url, apply) is the whole transport here.
import { pollOnce } from "./poller.js";
import { pickPath, rateFor, feedState, frameAt, observedRange, ASCII_RUNNER,
         MIN_FPS, MAX_FPS } from "./runnerGauge.mjs";

export class RunnerPanel {
    /**
     * @param {object} o
     * @param {string} o.url      the JSON endpoint, e.g. "/bridge/state"
     * @param {string} o.path     where the number lives in it, e.g. "state.tick" or "queue/depth"
     * @param {number} o.min/max  THE DOMAIN. Required in spirit -- see runnerGauge's note on auto-ranging.
     */
    constructor({ url = "/bridge/state", path = "tick", min = 0, max = 100, curve = "linear",
                  label = "", pollMs = 3000, frames = ASCII_RUNNER, mount = null } = {}) {
        Object.assign(this, { url, path, min, max, curve, label: label || path, pollMs, frames });
        this.value = null; this.lastOkMs = 0; this.range = observedRange();
        this._build(mount);
        this._poll();
        this._pollTimer = setInterval(() => this._poll(), this.pollMs);
        this._raf = requestAnimationFrame((t) => this._tick(t));
    }

    _build(mount) {
        const el = this.el = document.createElement("div");
        el.className = "swek-runner";
        Object.assign(el.style, {
            font: "12px ui-monospace,Menlo,Consolas,monospace", color: "#9ce0b4",
            background: "rgba(10,14,20,.82)", border: "1px solid #2c4a3a", borderRadius: "6px",
            padding: "4px 8px", display: "inline-flex", gap: "8px", alignItems: "baseline", whiteSpace: "pre",
        });
        this.figEl = document.createElement("span");
        this.figEl.style.cssText = "display:inline-block;width:2.2ch;color:#dfe6f0";
        this.txtEl = document.createElement("span");
        el.appendChild(this.figEl); el.appendChild(this.txtEl);
        (mount || document.body).appendChild(el);
    }

    async _poll() {
        await pollOnce("runner:" + this.url, this.url, (json) => {
            const v = pickPath(json, this.path);
            this.value = v; this.range.see(v); this.lastOkMs = Date.now();
        }).catch(() => {});   // poller owns the backoff; a failure here just leaves lastOkMs where it was
    }

    /** The frame clock. Runs every frame; the number underneath it changes every few seconds. */
    _tick(t) {
        const feed = feedState(this.lastOkMs);
        const r = rateFor(this.value, { min: this.min, max: this.max, curve: this.curve });
        // *** A STOPPED FEED STOPS THE FIGURE. *** Slowing it would render "the endpoint is gone" and "nothing
        // is happening" identically, and the reassuring one of those two is the wrong answer.
        const fps = feed.moving ? r.fps : 0;
        this.figEl.textContent = this.frames[frameAt(t, fps, this.frames.length)];
        this.figEl.style.opacity = feed.moving ? "1" : "0.35";
        const val = Number.isFinite(Number(this.value)) ? Number(this.value) : null;
        this.txtEl.textContent =
            this.label + " " + (val === null ? "--" : val) +
            (feed.moving ? "  " + fps.toFixed(1) + "fps" : "  " + feed.state.toUpperCase());
        this.el.title = feed.why || r.why ||
            (this.url + " -> " + this.path + ", domain " + this.min + ".." + this.max +
             " mapped to " + MIN_FPS + ".." + MAX_FPS + "fps (" + this.curve + ")" +
             this._rangeHint());
        this.el.style.borderColor = feed.state === "live" ? "#2c4a3a" : feed.state === "never" ? "#33455c" : "#6a5320";
        this._raf = requestAnimationFrame((t2) => this._tick(t2));
    }

    /** What the metric has actually done, offered as a SUGGESTION and never applied. See runnerGauge. */
    _rangeHint() {
        const o = this.range.get();
        if (!o.suggestion) return "";
        return "\nobserved " + o.min + ".." + o.max + " over " + o.n + " samples" +
               ((o.min < this.min || o.max > this.max) ? " -- OUTSIDE the set domain, so the gauge is clipping" : "");
    }

    destroy() {
        clearInterval(this._pollTimer); cancelAnimationFrame(this._raf);
        try { this.el.remove(); } catch {}
    }
}

/** Console-armable, like the rest of this tree's panels: window.swekRunner({url, path, min, max}). */
try {
    if (typeof window !== "undefined") window.swekRunner = (o) => new RunnerPanel(o);
} catch {}
