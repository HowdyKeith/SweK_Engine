// ui/svgGaugeSet.js — v1518
// Standalone SVG gauge SET, extracted from demoChrome's makeGauge. Pure SVG/CSS
// physical dials (recessed face well + metallic bezel + lit value arc), NO GL
// context — the lightweight alternative to the WebGL stage gauges, safe to run
// during heavy demos and on the no-render server.html welcome view.
//
// It reads the SAME gauge config the 3D gauges use (localStorage
// "voxelEngine.demoChrome".gauges) so a dial set rendered here stays in lockstep
// with the settings panel. Live data sources match demoChrome:
//   battery        → navigator.getBattery()
//   cpu/ram/gpu    → bridge GET /system/stats
//   email/custom/* → bridge GET /gauge/state bag
//
// Usage:
//   import { mountSvgGaugeSet } from "/ui/svgGaugeSet.js";

// v3258 -- why the gauges are empty, kept so the page can SAY it and not only the console.
let _statsWhy = "", _statsMissCount = 0;
export function gaugesWhy() { return _statsWhy; }
//   const set = mountSvgGaugeSet(hostEl, { gauges?, pollMs? });
//   set.start();           // begin polling providers
//   set.stop();            // pause polling (DOM stays)
//   set.setGauges([...]);  // re-render with a new config
//   set.destroy();         // stop + remove from DOM

import { guardedTick } from "/ui/poller.js";   // v2771 — gauge poll routes through polling discipline (hidden/in-flight/cap)

const LS_SETTINGS = "voxelEngine.demoChrome";
const RING_COLORS = { cyan: "#5ac8ff", amber: "#ffa84c", green: "#5fd886", red: "#ff6b6b", violet: "#b07bff", white: "#e8eefc" };
// v4020 -- brains/solving join the COUNT sources: "3 BRAINS" is a headcount, and rendering it as "3%" would be
// a number that looks like a reading and means nothing.
const COUNT_SOURCES = new Set(["email", "swekpeers", "swekremotepeers", "chunks", "brains", "solving"]);   // render as N, not N%
const COUNT_RING_SCALE = 12;                // count → ring%: min(100, n*scale)
const NS = "http://www.w3.org/2000/svg";
const SOURCE_LABELS = { battery: "BATTERY", cpu: "CPU", ram: "RAM", gpu: "GPU", swekpeers: "SweK PEERS", swekremotepeers: "SweK REMOTES", email: "EMAIL", fps: "FPS", chunks: "CHUNKS",
    // v4020 -- row 3. Keith: "we want a 3rd row available to list the brains available in fleet and how many
    // are working." BOTH NUMBERS ALREADY EXISTED and only server.html could see them: /ai/brain/health has
    // published registeredBrains (brains seen in the last 60s) and brainsBusy (brains that posted a solve
    // inside the census window) for rounds, and server.html read them through a brainValues() of its own --
    // as a MORPHABLE CONTENDER for slot 2, competing with the peers row, on ONE page. So the row Keith
    // remembered was real, was live, and was invisible everywhere else. Here it is a source like any other,
    // so every docked page gets it.
    brains: "BRAINS", solving: "SOLVING" };

// v1666 — packaged 6-gauge default order: CPU, RAM, GPU, SweK Peers, SweK Remote Peers, BATTERY.
const DEFAULT_GAUGES = [
    { source: "cpu",             color: "amber",  showPct: true  },
    { source: "ram",             color: "green",  showPct: true  },   // v3743 -- was false, which is why RAM showed a green ring with no % on weather.html / every pageGauges dock. showPct draws the number; RAM is a percent source like CPU/GPU.
    { source: "gpu",             color: "violet", showPct: true  },
    // v1967 — second row: engine render metrics (FPS, CHUNKS) + linked-engine count (PEERS, the
    // distributed-OS signal). Replaces the old remotes/battery row; remotes/battery stay available as
    // pickable sources in Settings for anyone who wants them.
    { source: "fps",             color: "cyan",   showPct: false },
    { source: "chunks",          color: "green",  showPct: false },
    { source: "swekpeers",       color: "white",  showPct: true  },
    // v4020 -- ROW 3: the fleet. showPct TRUE is what draws the NUMBER at all -- it is not a percent switch
    // (server.html's brains-row comment learned this the hard way and its first version rendered two dials with
    // nothing in them). BRAINS is how many are registered, SOLVING is how many are actually working.
    { source: "brains",          color: "violet", showPct: true  },
    { source: "solving",         color: "cyan",   showPct: true  },
    { source: "swekremotepeers", color: "green",  showPct: true  },
    // v4020 -- ROW 4: actions, not readings. Keith: "the record video button row, so any page that has that
    // dock can be recorded." These are CELLS IN THE SAME GRID rather than a parallel structure bolted beside
    // it, which is what lets the existing ▲/▼ scroll, the row measuring and the auto-revert all keep working
    // untouched -- _rows is ceil(cells/3) and does not care what a cell contains.
    { action: "record", label: "RECORD",  color: "amber"  },
    { action: "mp4",    label: "MP4",     color: "green"  },
    { action: "clip",   label: "CLIP",    color: "violet" },
];

function _lighten(hex, amt) {
    const h = String(hex).replace("#", "");
    const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    const f = (c) => Math.round(c + (255 - c) * amt);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// Read the gauge array the 3D gauges + settings panel persist. A fresh box, or one still on the legacy
// 3-gauge battery/cpu/ram default, gets the packaged 6-gauge default; any other saved config is padded
// up to 6 slots so existing customisations keep their first slots and gain the new ones.
export function readGaugeConfig() {
    try {
        const raw = JSON.parse(localStorage.getItem(LS_SETTINGS) || "null");
        if (raw && Array.isArray(raw.gauges) && raw.gauges.length) {
            const g = raw.gauges;
            const isLegacyDefault = g.length === 3 && g[0] && g[0].source === "battery" && g[1] && g[1].source === "cpu" && g[2] && g[2].source === "ram";
            if (isLegacyDefault) return DEFAULT_GAUGES.map((x) => Object.assign({}, x));
            // v4020 -- WAS HARDCODED 6, WHICH IS WHY THE DOCK COULD NEVER HAVE A THIRD ROW. The grid is 3
            // columns and dockedGauges derives _rows from ceil(cells/3), so the SCROLL mechanism has always
            // handled any number of rows -- Keith's ▲/▼ buttons were already generic. The cap was the only
            // thing pinning it at two, and it was a typed number rather than a consequence of the list it
            // guards. Derived from DEFAULT_GAUGES.length now, so adding a row is a one-place edit and this
            // never has to be remembered again.
            const MAX = DEFAULT_GAUGES.length;
            const out = g.slice(0, MAX);
            for (let i = out.length; i < MAX; i++) out.push(Object.assign({}, DEFAULT_GAUGES[i]));
            return out;
        }
    } catch {}
    return DEFAULT_GAUGES.map((g) => Object.assign({}, g));
}

// v3770 -- "current weather now" as a compact gauge source, dial-sized so it drops into ANY slot (row 1 in
// place of a dead GPU dial, or the empty third slot of the brains row on row 2 -- server.html decides which).
// It is a SEPARATE, SLOW feed: one shared fetch of /weather/forecast (the same free Open-Meteo bridge the big
// weather.html panel uses), refreshed at most every 10 minutes and shared across every weather cell on the
// page, so a second weather dial is NOT a second network poll. It owns no timer of the set's -- refresh()
// nudges the throttled ensure() -- so it works identically whether the set runs start() (main dials) or is fed
// by setStats (the info-panel dock). Sun vs moon comes from the bridge's is_day; if an older bridge omits it,
// the cell falls back to the local hour.
const _WMO = {
    0: ["clear", "Clear"], 1: ["clear", "Clear"], 2: ["cloudy", "Cloudy"], 3: ["cloudy", "Overcast"],
    45: ["fog", "Fog"], 48: ["fog", "Fog"],
    51: ["rain", "Drizzle"], 53: ["rain", "Drizzle"], 55: ["rain", "Drizzle"], 56: ["rain", "Drizzle"], 57: ["rain", "Drizzle"],
    61: ["rain", "Rain"], 63: ["rain", "Rain"], 65: ["rain", "Heavy rain"], 66: ["rain", "Freezing"], 67: ["rain", "Freezing"],
    71: ["snow", "Snow"], 73: ["snow", "Snow"], 75: ["snow", "Heavy snow"], 77: ["snow", "Snow"],
    80: ["rain", "Showers"], 81: ["rain", "Showers"], 82: ["rain", "Showers"],
    85: ["snow", "Snow"], 86: ["snow", "Snow"], 95: ["storm", "Storm"], 96: ["storm", "Storm"], 99: ["storm", "Storm"],
};
function _wmo(code) { return (code != null && _WMO[code]) ? { state: _WMO[code][0], label: _WMO[code][1] } : { state: "clear", label: code == null ? "—" : "Clear" }; }
// sky gradient [top, bottom] per state, day; night is a darkened variant.
const _SKY_DAY = { clear: ["#2b6fd6", "#9fd0ff"], cloudy: ["#41506a", "#8294b0"], rain: ["#2c3850", "#566379"], storm: ["#171f2e", "#3a4458"], snow: ["#5a6680", "#aab6cc"], fog: ["#586172", "#9aa3b3"] };
const _SKY_NIGHT = { clear: ["#0a1430", "#243a6b"], cloudy: ["#141a28", "#2c3750"], rain: ["#0e1524", "#28313f"], storm: ["#0a0e18", "#232a3a"], snow: ["#20293c", "#3a445c"], fog: ["#1a2030", "#333b49"] };
let _uid = 0;
const _wx = { data: null, at: 0, inflight: false, subs: new Set() };
function _weatherEnsure(force) {
    if (typeof fetch === "undefined") return;
    if (_wx.inflight) return;
    if (!force && _wx.at && (Date.now() - _wx.at) < 600000) return;   // 10-minute throttle, shared by all cells
    _wx.inflight = true;
    fetch("/weather/forecast", { cache: "no-store" }).then(r => r.json()).then(j => {
        _wx.inflight = false; _wx.at = Date.now();
        if (j && j.ok && j.current) { _wx.data = j; _wx.subs.forEach(fn => { try { fn(j); } catch {} }); }
    }).catch(() => { _wx.inflight = false; _wx.at = Date.now(); });
}

function _makeWeatherGauge(cfg, scale) {
    scale = scale || 1;
    const color = RING_COLORS[cfg.color] || RING_COLORS.cyan;
    const uid = "wx" + (_uid++);
    const NSx = NS, el = (n, a) => { const e = document.createElementNS(NSx, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const cell = document.createElement("div");
    try { cell.setAttribute("data-source", "weather"); } catch {}
    Object.assign(cell.style, { display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", minWidth: "0" });

    const svg = el("svg", { width: String(42 * scale), height: String(46 * scale), viewBox: "-2 -2 46 50" });
    svg.style.overflow = "visible";
    svg.style.transform = "perspective(150px) rotateX(17deg)";
    svg.style.transformOrigin = "center 62%";
    svg.style.filter = "drop-shadow(0 2px 2.5px rgba(0,0,0,0.55))";
    const defs = el("defs", {});
    const bezel = el("linearGradient", { id: `wbz-${uid}`, x1: "0", y1: "0", x2: "0", y2: "1" });
    bezel.appendChild(el("stop", { offset: "0%", "stop-color": "#46556e" }));
    bezel.appendChild(el("stop", { offset: "55%", "stop-color": "#1b2230" }));
    bezel.appendChild(el("stop", { offset: "100%", "stop-color": "#0a0e16" }));
    const sky = el("linearGradient", { id: `wsky-${uid}`, x1: "0", y1: "0", x2: "0", y2: "1" });
    const skyTop = el("stop", { offset: "0%", "stop-color": "#2b6fd6" });
    const skyBot = el("stop", { offset: "100%", "stop-color": "#9fd0ff" });
    sky.appendChild(skyTop); sky.appendChild(skyBot);
    const clip = el("clipPath", { id: `wclip-${uid}` });
    clip.appendChild(el("circle", { cx: "21", cy: "21", r: "16" }));
    defs.appendChild(bezel); defs.appendChild(sky); defs.appendChild(clip);
    svg.appendChild(defs);
    // recessed disc, matching the dials' bezel so the cell sits identically in the row
    svg.appendChild(el("circle", { cx: "21", cy: "21", r: "18.4", fill: "none", stroke: `url(#wbz-${uid})`, "stroke-width": "2.4" }));
    const skyRect = el("rect", { x: "5", y: "5", width: "32", height: "32", fill: `url(#wsky-${uid})`, "clip-path": `url(#wclip-${uid})` });
    svg.appendChild(skyRect);
    const art = el("g", { "clip-path": `url(#wclip-${uid})` });   // sun/moon + condition drawn here, clipped to the disc
    svg.appendChild(art);
    const temp = el("text", { x: "21", y: "34", "text-anchor": "middle", "font-size": "11", "font-weight": "700", fill: "#eef3ff" });
    temp.style.textShadow = "0 1px 2px rgba(0,0,0,0.95)"; temp.textContent = "…";
    svg.appendChild(temp);
    cell.appendChild(svg);

    const lbl = document.createElement("div");
    lbl.textContent = "WEATHER";
    const _LIFT = Math.round(10 * scale);
    Object.assign(lbl.style, { position: "relative", zIndex: "2", marginTop: (-_LIFT) + "px",
        fontSize: (7 * scale) + "px", color: color, letterSpacing: "0.05em", lineHeight: "1.2",
        background: "rgba(4,7,12,0.72)", padding: "0 " + Math.round(3 * scale) + "px", borderRadius: "3px",
        textShadow: "0 1px 1px rgba(0,0,0,0.9)" });
    cell.appendChild(lbl);

    const mk = (n, a) => art.appendChild(el(n, a));
    function paint(j) {
        const cur = j && j.current;
        while (art.firstChild) art.removeChild(art.firstChild);
        if (!cur) { temp.textContent = "…"; lbl.textContent = "WEATHER"; return; }
        const { state, label } = _wmo(cur.code);
        const day = cur.isDay != null ? !!cur.isDay : ((new Date()).getHours() >= 6 && (new Date()).getHours() < 19);
        const pal = (day ? _SKY_DAY : _SKY_NIGHT)[state] || (day ? _SKY_DAY.clear : _SKY_NIGHT.clear);
        skyTop.setAttribute("stop-color", pal[0]); skyBot.setAttribute("stop-color", pal[1]);
        // sun or moon, upper-right, dimmed under cloud cover
        const lum = (state === "clear") ? 1 : (state === "cloudy" ? 0.85 : 0.55);
        if (day) {
            mk("circle", { cx: "26", cy: "14", r: "5", fill: "#ffd447", opacity: String(lum) });
            if (state === "clear") for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, x1 = 26 + Math.cos(a) * 7, y1 = 14 + Math.sin(a) * 7, x2 = 26 + Math.cos(a) * 9, y2 = 14 + Math.sin(a) * 9; mk("line", { x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1), stroke: "#ffd447", "stroke-width": "1.2", "stroke-linecap": "round" }); }
        } else {
            mk("circle", { cx: "26", cy: "14", r: "5", fill: "#e7ecf6", opacity: String(lum) });
            mk("circle", { cx: "28.4", cy: "12.6", r: "4.4", fill: pal[0], opacity: "0.96" });   // crescent bite
            if (state === "clear") { mk("circle", { cx: "15", cy: "11", r: "0.7", fill: "#fff" }); mk("circle", { cx: "12", cy: "17", r: "0.6", fill: "#fff" }); mk("circle", { cx: "18", cy: "20", r: "0.5", fill: "#fff" }); }
        }
        // condition overlay
        const cloud = (x, y, s, c) => { for (const p of [[0, 0, 5], [4.5, 1.4, 4], [-4.5, 1.4, 4], [0, 2.6, 5.4]]) mk("circle", { cx: (x + p[0] * s).toFixed(1), cy: (y + p[1] * s).toFixed(1), r: (p[2] * s).toFixed(1), fill: c }); };
        if (state === "cloudy") cloud(19, 20, 1, "#e8eef8");
        else if (state === "fog") { for (let i = 0; i < 4; i++) mk("rect", { x: "7", y: String(14 + i * 4), width: "28", height: "2", rx: "1", fill: "rgba(226,232,242,0.5)" }); }
        else if (state === "rain" || state === "snow" || state === "storm") {
            cloud(19, 16, 1, state === "storm" ? "#9aa6ba" : "#c2ccdb");
            if (state === "snow") { for (const x of [14, 19, 24]) mk("circle", { cx: String(x), cy: "27", r: "1.2", fill: "#fff" }); }
            else if (state === "rain") { for (const x of [14, 19, 24]) mk("line", { x1: String(x), y1: "24", x2: String(x - 1.5), y2: "29", stroke: "#cfe6ff", "stroke-width": "1.3", "stroke-linecap": "round" }); }
            else { mk("polygon", { points: "20,23 16,30 19,30 17,35 24,27 20,27", fill: "#ffe14d" }); }
        }
        temp.textContent = (cur.tempF != null ? Math.round(cur.tempF) + "\u00b0" : "…");
        lbl.textContent = (label || "WEATHER").toUpperCase();
    }
    _wx.subs.add(paint);
    if (_wx.data) paint(_wx.data);
    _weatherEnsure();

    const handle = { source: "weather", update() {}, _cleanup() { try { _wx.subs.delete(paint); } catch {} } };
    return { cell, handle };
}

// v4020 -- ROW 4'S CELLS. Keith: "the record video button row, so any page that has that dock can be recorded."
//
// An ACTION cell is the same box as a dial -- same width, same caption position -- so the grid stays uniform
// and dockedGauges' row measuring, ▲/▼ scroll and auto-revert keep working with no change at all: _rows is
// ceil(cells/3) and has never cared what a cell contains.
//
// *** IT REFUSES ON A PAGE IT CANNOT SERVE, WHICH IS THE ONE REAL DESIGN DECISION HERE. *** ui/recordFloat.js
// (v3950) settled this for the floating button and its reasoning holds identically: a record button on a page
// with no <canvas> is decoration that fails on click, and this tree's own claim is "v2579 A flag that lies is
// worse than no flag." So the cell renders DISABLED with a reason in its tooltip rather than inviting a click
// that cannot work -- and the recorder's own capabilities() is asked rather than assumed, because
// captureStream + MediaRecorder are not secure-context gated but the codecs can still be missing.
function _makeActionCell(cfg, scale) {
    scale = scale || 1;
    const color = RING_COLORS[cfg.color] || RING_COLORS.cyan;
    const cell = document.createElement("div");
    try { cell.setAttribute("data-action", cfg.action); } catch {}
    Object.assign(cell.style, { display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", minWidth: "0" });

    const btn = document.createElement("button");
    btn.type = "button";
    Object.assign(btn.style, {
        width: (42 * scale) + "px", height: (42 * scale) + "px", borderRadius: "50%",
        background: "radial-gradient(circle at 50% 38%, #1b2430, #0d1219)",
        border: "1.5px solid " + color, color: color, cursor: "pointer",
        font: (11 * scale) + "px/1 ui-monospace, Menlo, Consolas, monospace",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 2px 2.5px rgba(0,0,0,0.55)", padding: "0",
    });
    btn.textContent = { record: "●", mp4: "▶", clip: "✂" }[cfg.action] || "●";

    const cap = document.createElement("div");
    Object.assign(cap.style, { font: (7.5 * scale) + "px ui-monospace, Menlo, Consolas, monospace",
                               letterSpacing: "0.08em", color: "#7f93a8", whiteSpace: "nowrap" });
    cap.textContent = cfg.label || String(cfg.action || "").toUpperCase();

    const disable = (why) => {
        btn.disabled = true; btn.style.opacity = "0.35"; btn.style.cursor = "default"; btn.title = why;
    };
    const setLabel = (t) => { cap.textContent = t; };

    // Wiring is LAZY and per-action: importing the recorder on every docked page would install a MediaRecorder
    // on pages that will never record. The import happens on the click that needs it.
    if (cfg.action === "record") {
        btn.title = "Record this page's canvas to a .webm";
        if (typeof document !== "undefined" && !document.querySelector("canvas")) {
            disable("nothing to record: this page has no <canvas>");
        } else {
            btn.onclick = async () => {
                try {
                    if (!window.swekRecord) { const m = await import("./canvasRecorder.js"); m.installRecorder(); }
                    const rec = window.swekRecord;
                    if (!rec) { disable("the recorder did not install on this page"); return; }
                    const c = rec.capabilities && rec.capabilities();
                    if (c && c.ok === false) { disable(c.message || "recording is unavailable here"); return; }
                    if (rec.recording()) { rec.stop(); setLabel(cfg.label || "RECORD"); btn.style.background = "radial-gradient(circle at 50% 38%, #1b2430, #0d1219)"; }
                    else if (rec.start()) { setLabel("STOP"); btn.style.background = "radial-gradient(circle at 50% 38%, #5a2020, #2a0d0d)"; }
                } catch (e) { disable("recorder failed to load: " + ((e && e.message) || e)); }
            };
        }
    } else if (cfg.action === "mp4") {
        // /export/mp4 turns the recorded webm into a YouTube-ready mp4 with a description sidecar. It is a
        // BRIDGE route, so it only works where the bridge is reachable -- and the honest failure is a message,
        // not a silent no-op.
        btn.title = "Convert the last recorded clip to a YouTube-ready .mp4 (needs the bridge)";
        btn.onclick = async () => {
            setLabel("...");
            try {
                const r = await fetch("/export/mp4", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
                const j = await r.json().catch(() => ({}));
                setLabel(r.ok && j && j.ok !== false ? "DONE" : "FAILED");
                if (!(r.ok && j && j.ok !== false)) btn.title = "export failed: " + ((j && j.error) || ("HTTP " + r.status));
            } catch (e) { setLabel("FAILED"); btn.title = "export failed: " + ((e && e.message) || e); }
            setTimeout(() => setLabel(cfg.label || "MP4"), 2500);
        };
    } else if (cfg.action === "clip") {
        btn.title = "Open the clip editor to trim what you just recorded";
        btn.onclick = async () => {
            try { const m = await import("./clipEditorDialog.js"); await m.openClipEditor(null, null); }
            catch (e) { disable("the clip editor did not load: " + ((e && e.message) || e)); }
        };
    }

    cell.appendChild(btn); cell.appendChild(cap);
    // The handle contract the set expects. An action has nothing to refresh, so update() is a no-op rather
    // than absent -- refresh() must never have to ask whether a handle is real.
    return { cell, handle: { source: null, action: cfg.action, update() {} } };
}

function _makeGauge(cfg, scale) {
    if (cfg && cfg.action) return _makeActionCell(cfg, scale);
    if (cfg && cfg.source === "weather") return _makeWeatherGauge(cfg, scale);
    scale = scale || 1;
    const color = RING_COLORS[cfg.color] || RING_COLORS.cyan;
    const R = 16, C = 2 * Math.PI * R, uid = "sg" + (_uid++);
    const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };

    const cell = document.createElement("div");
    try { if (cfg && cfg.source) cell.setAttribute("data-source", cfg.source); } catch {}   // v1838 — lets the dock find which row holds a given gauge
    Object.assign(cell.style, { display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", minWidth: "0" });

    const svg = el("svg", { width: String(42 * scale), height: String(46 * scale), viewBox: "-2 -2 46 50" });
    svg.style.overflow = "visible";
    svg.style.transform = "perspective(150px) rotateX(17deg)";
    svg.style.transformOrigin = "center 62%";
    svg.style.filter = "drop-shadow(0 2px 2.5px rgba(0,0,0,0.55))";

    const defs = el("defs", {});
    const face = el("radialGradient", { id: `face-${uid}`, cx: "50%", cy: "42%", r: "60%" });
    face.appendChild(el("stop", { offset: "0%",  "stop-color": "#070b12" }));
    face.appendChild(el("stop", { offset: "100%", "stop-color": "#1a2331" }));
    const bezel = el("linearGradient", { id: `bezel-${uid}`, x1: "0", y1: "0", x2: "0", y2: "1" });
    bezel.appendChild(el("stop", { offset: "0%",  "stop-color": "#46556e" }));
    bezel.appendChild(el("stop", { offset: "55%", "stop-color": "#1b2230" }));
    bezel.appendChild(el("stop", { offset: "100%","stop-color": "#0a0e16" }));
    const sheen = el("linearGradient", { id: `sheen-${uid}`, x1: "0", y1: "0", x2: "0", y2: "1" });
    sheen.appendChild(el("stop", { offset: "0%",  "stop-color": _lighten(color, 0.45) }));
    sheen.appendChild(el("stop", { offset: "55%", "stop-color": color }));
    sheen.appendChild(el("stop", { offset: "100%","stop-color": color }));
    const shadow = el("filter", { id: `depth-${uid}`, x: "-40%", y: "-40%", width: "180%", height: "180%" });
    shadow.appendChild(el("feDropShadow", { dx: "0", dy: "0.6", stdDeviation: "0.8", "flood-color": "#000", "flood-opacity": "0.7" }));
    defs.appendChild(face); defs.appendChild(bezel); defs.appendChild(sheen); defs.appendChild(shadow);
    svg.appendChild(defs);

    svg.appendChild(el("circle", { cx: "21", cy: "21", r: String(R + 2.4), fill: "none", stroke: `url(#bezel-${uid})`, "stroke-width": "2.4" }));
    svg.appendChild(el("circle", { cx: "21", cy: "21", r: String(R + 0.4), fill: `url(#face-${uid})` }));
    svg.appendChild(el("circle", { cx: "21", cy: "21", r: String(R), fill: "none", stroke: "rgba(0,0,0,0.45)", "stroke-width": "4" }));
    const fg = el("circle", {
        cx: "21", cy: "21", r: String(R), fill: "none",
        stroke: `url(#sheen-${uid})`, "stroke-width": "4", "stroke-linecap": "round",
        "stroke-dasharray": String(C), "stroke-dashoffset": String(C),
        transform: "rotate(-90 21 21)", filter: `url(#depth-${uid})`,
    });
    svg.appendChild(fg);
    const hi = el("circle", {
        cx: "21", cy: "21", r: String(R), fill: "none",
        stroke: "rgba(255,255,255,0.30)", "stroke-width": "1.4", "stroke-linecap": "round",
        "stroke-dasharray": `${C * 0.16} ${C}`, transform: "rotate(-128 21 21)",
    });
    svg.appendChild(hi);

    let txt = null;
    if (cfg.showPct && cfg.source !== "none") {
        txt = el("text", { x: "21", y: "25", "text-anchor": "middle", "font-size": "11", "font-weight": "700", fill: "#eef3ff" });
        txt.style.textShadow = "0 1px 1px rgba(0,0,0,0.8)";
        txt.textContent = "–";
        svg.appendChild(txt);
    }
    cell.appendChild(svg);

    const lbl = document.createElement("div");
    lbl.textContent = cfg.source === "none" ? "—" : (SOURCE_LABELS[cfg.source] || String(cfg.source).toUpperCase());
    // v1731 — lift the caption UP so it overlaps the lower part of the dial (the bottom arc still peeks out below/around
    // it), with a small dark pill behind the text so it stays legible over the circle. _LIFT is the single knob to turn if
    // it covers too much or too little of the dial.
    const _LIFT = Math.round(10 * scale);
    Object.assign(lbl.style, { position: "relative", zIndex: "2", marginTop: (-_LIFT) + "px",
        fontSize: (7 * scale) + "px", color: color, letterSpacing: "0.05em", lineHeight: "1.2",
        background: "rgba(4,7,12,0.72)", padding: "0 " + Math.round(3 * scale) + "px", borderRadius: "3px",
        textShadow: "0 1px 1px rgba(0,0,0,0.9)" });
    cell.appendChild(lbl);

    const onlineStroke = `url(#sheen-${uid})`;
    const handle = {
        source: cfg.source,
        update(pct, displayText, online) {
            const clamped = Math.max(0, Math.min(100, pct || 0));
            fg.setAttribute("stroke-dashoffset", String(C * (1 - clamped / 100)));
            fg.setAttribute("stroke", online === false ? "rgba(150,160,175,0.35)" : onlineStroke);
            hi.style.opacity = online === false ? "0.15" : "1";
            if (txt) txt.textContent = (displayText == null) ? "–" : String(displayText);
        },
    };
    return { cell, handle };
}

export function mountSvgGaugeSet(host, opts = {}) {
    const root = document.createElement("div");
    if (opts.columns) Object.assign(root.style, { display: "grid", gridTemplateColumns: `repeat(${opts.columns}, max-content)`, gap: "12px", alignItems: "flex-end", justifyContent: "start", justifyItems: "center" });
    else Object.assign(root.style, { display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" });
    if (host) host.appendChild(root);

    let handles = [];
    const providerValues = { battery: null, cpu: null, ram: null, gpu: null, swekpeers: null, swekremotepeers: null, batteryNA: false, fps: null, chunks: null, brains: null, solving: null };
    const gaugeBag = {};
    let _timer = null, _batBound = false;
    const _pollKey = "svgGaugeSet#" + (mountSvgGaugeSet._n = (mountSvgGaugeSet._n || 0) + 1);   // v2771 — unique per mounted set
    const _tick = () => guardedTick(_pollKey, poll);   // hidden/in-flight/cap guard around the composite poll
    let _lastPeerCount = null, _lastRemoteCount = null;   // v1838 — for the peer-count-change event

    function render(gauges) {
        for (const h of handles) { if (h && typeof h._cleanup === "function") { try { h._cleanup(); } catch {} } }   // v3770 -- drop weather subscriptions before re-render
        root.innerHTML = ""; handles = [];
        const list = gauges || opts.gauges || readGaugeConfig();
        const sc = opts.scale || 1;
        if (sc !== 1) root.style.gap = (12 * sc) + "px";
        for (const g of list) { const { cell, handle } = _makeGauge(g, sc); root.appendChild(cell); handles.push(handle); }
        refresh();
    }
    function refresh() {
        for (const h of handles) {
            if (h.action) continue;   // v4020 -- an action cell is a button, not a reading; nothing to refresh
            const s = h.source;
            if (s === "none") { h.update(0, "–", true); continue; }
            if (s === "weather") { _weatherEnsure(); continue; }   // v3770 -- weather cell paints itself from the shared store

            if (s === "battery") {
                if (providerValues.batteryNA) { h.update(0, "/", false); continue; }   // no battery on this device
                const v = providerValues.battery;
                if (v == null) h.update(0, "–", false); else h.update(v, Math.round(v), true);
                continue;
            }
            if (s === "cpu" || s === "ram" || s === "gpu") {
                const v = providerValues[s];
                if (v == null) h.update(0, "–", false); else h.update(v, Math.round(v), true);
                continue;
            }
            if (s === "swekpeers" || s === "swekremotepeers") {   // live counts, rendered as N (ring scales with count)
                const v = providerValues[s];
                if (v == null) h.update(0, "–", false); else h.update(Math.min(100, v * COUNT_RING_SCALE), v, true);
                continue;
            }
            if (s === "fps") {   // engine frames/sec — ring scales toward 60
                const v = providerValues.fps;
                if (v == null) h.update(0, "–", false); else h.update(Math.max(0, Math.min(100, (v / 60) * 100)), Math.round(v), true);
                continue;
            }
            if (s === "chunks") {   // loaded world chunks — a count, ring scales gently
                const v = providerValues.chunks;
                if (v == null) h.update(0, "–", false); else h.update(Math.min(100, v * 0.15), v, true);
                continue;
            }
            // v4020 -- the fleet dials. Counts, so the ring scales gently and the READOUT is the headcount.
            // A null reads "–", never 0: the bridge being unreachable and the fleet being empty are different
            // facts, and only one of them should look alarming (v3237's named-absence rule, third time here).
            if (s === "brains" || s === "solving") {
                const v = providerValues[s];
                if (v == null) h.update(0, "–", false);
                else h.update(Math.min(100, v * COUNT_RING_SCALE), v, true);
                continue;
            }
            const g = gaugeBag[s];
            if (!g) { h.update(0, "–", false); continue; }
            const isCount = g.isCount || COUNT_SOURCES.has(s);
            if (isCount) h.update(Math.min(100, (g.value || 0) * COUNT_RING_SCALE), g.value || 0, true);
            else { const max = g.max > 0 ? g.max : 100; const pct = Math.max(0, Math.min(100, (g.value / max) * 100)); h.update(pct, Math.round(pct), true); }
        }
    }
    async function poll() {
        if (typeof window !== "undefined" && window.__swekPollsPaused) return;   // v1641 — hold while the Settings panel is open
        const needsSystem = handles.some(h => ["cpu", "ram", "gpu"].includes(h.source));
        const needsPeers = handles.some(h => h.source === "swekpeers");
        const needsRemote = handles.some(h => h.source === "swekremotepeers");
        const needsBrains = handles.some(h => h.source === "brains" || h.source === "solving");
        const needsBag = handles.some(h => !["battery", "cpu", "ram", "gpu", "swekpeers", "swekremotepeers", "none", "weather", "brains", "solving"].includes(h.source));
        if (needsBrains) {
            // v4020 -- ONE fetch feeding both dials, and only when a brain dial is actually mounted. Named
            // absence rather than a convincing zero (v3237/v3258, the rule this file already learned twice):
            // if the bridge does not answer, the dials read "-" instead of "0 brains", because a fleet that is
            // unreachable and a fleet that is empty are different facts and only one of them is alarming.
            try {
                const r = await fetch("/ai/brain/health", { cache: "no-store" });
                if (!r.ok) throw new Error("HTTP " + r.status);
                const j = await r.json();
                providerValues.brains = Number.isFinite(j && j.registeredBrains) ? j.registeredBrains : null;
                // brainsBusy is OBSERVED (a brain that posted a solve inside the census window). The fallback
                // is the HUB's own solving flag, which answers a NARROWER question -- server.html's v3664 note
                // makes the same choice for the same reason: a dial reading 0 on a working fleet is worse than
                // one reading a narrower truth.
                providerValues.solving = Number.isFinite(j && j.brainsBusy) ? j.brainsBusy
                                       : ((j && j.solving) ? 1 : null);
            } catch (e) { providerValues.brains = null; providerValues.solving = null; }
        }
        if (needsSystem) {
            // v3258 -- *** THIS catch {} MADE "THE GAUGES ARE BROKEN" AND "EVERYTHING IS AT ZERO" THE SAME
            // PICTURE. *** Keith, from a clean boot: "still no gauges working" -- and there was nothing in the
            // console, nothing on the page, and no way from either end to tell WHICH of five things had gone
            // wrong: the fetch failing, the JSON failing, the route 404ing, the payload arriving in a different
            // shape, or every provider genuinely reading zero.
            //
            // A GAUGE THAT CANNOT SAY WHY IT IS EMPTY IS THE EMPTY-RADAR MISTAKE AGAIN (v3237), THE THIRD TIME
            // IN THIS TREE. The fix is the same sentence every time: name the absence rather than draw a
            // convincing nothing.
            try {
                const r = await fetch("/system/stats", { cache: "no-store" });
                if (!r.ok) throw new Error("HTTP " + r.status);
                const j = await r.json();
                if (!j || typeof j !== "object") throw new Error("no JSON body");
                // WHICH FIELDS ARRIVED, not merely whether the request did. A 200 carrying the wrong SHAPE is
                // the failure this cannot otherwise distinguish from a quiet machine -- and `cpu` starts life
                // null on the server by design, so an absent cpu is NORMAL on the first sample and a
                // PERSISTENT absence is not.
                const got = [];
                if (j.cpu && Number.isFinite(j.cpu.utilPct)) { providerValues.cpu = j.cpu.utilPct; got.push("cpu"); }
                if (j.mem && Number.isFinite(j.mem.usedPct)) { providerValues.ram = j.mem.usedPct; got.push("ram"); }
                if (j.gpu && Number.isFinite(j.gpu.utilPct)) { providerValues.gpu = j.gpu.utilPct; got.push("gpu"); }
                _statsWhy = got.length ? "" : "/system/stats answered 200 but carried no usable cpu/mem/gpu fields";
                if (got.length && _statsMissCount) _statsMissCount = 0;
                if (!got.length) _statsMissCount++;
                // SAID ONCE, NOT EVERY TICK. A poller that logs on every failure buries the page it is
                // describing; three consecutive misses is a pattern rather than a hiccup.
                if (_statsMissCount === 3) console.warn("[gauges] " + _statsWhy + " -- three polls running. Fields present:", Object.keys(j).join(", "));
            } catch (e) {
                _statsWhy = "/system/stats did not answer: " + String((e && e.message) || e);
                if (++_statsMissCount === 3) console.warn("[gauges] " + _statsWhy + " -- three polls running.");
            }
        }
        if (needsPeers) {
            // v1896 — /peer/list is auth-gated (trusted/local only); when a LAN device views a page
            // (e.g. the pip-boy at another box's :8787), it returns {ok:false} and the count read 0
            // even with peers online. Fall back to the UNGATED /sync/peers (same count, not sensitive)
            // so the gauge shows the real number regardless of who's viewing.
            try {
                const j = await fetch("/peer/list", { cache: "no-store" }).then(r => r.json());
                if (j && Array.isArray(j.peers)) { providerValues.swekpeers = j.peers.length; }
                else { const s = await fetch("/sync/peers", { cache: "no-store" }).then(r => r.json()); providerValues.swekpeers = (s && Array.isArray(s.peers)) ? s.peers.length : 0; }
            } catch {
                try { const s = await fetch("/sync/peers", { cache: "no-store" }).then(r => r.json()); providerValues.swekpeers = (s && Array.isArray(s.peers)) ? s.peers.length : 0; } catch { providerValues.swekpeers = 0; }
            }
        }
        if (needsRemote) {
            try { const j = await fetch("/cloud/status", { cache: "no-store" }).then(r => r.json()); providerValues.swekremotepeers = (((j && j.enabled) ? (j.peers | 0) : 0) + ((j && j.remotes) | 0)); } catch { providerValues.swekremotepeers = 0; }   // v1682 — cloud peers + Cloudflare-tunnel remotes
        }
        // v1967 — FPS + CHUNKS read straight from the engine's own live readouts (same numbers the STATUS
        // panel shows). These are in-page globals, so no fetch; if this gauge set runs on a page WITHOUT the
        // engine (e.g. a standalone tool), they simply stay "–".
        if (handles.some(h => h.source === "fps")) {
            let f = null;
            try { f = (window._hud && typeof window._hud.fps === "number") ? window._hud.fps : (typeof window._fps === "number" ? window._fps : (window.engineStats && window.engineStats.fps)); } catch {}
            providerValues.fps = (Number.isFinite(f)) ? f : null;
        }
        if (handles.some(h => h.source === "chunks")) {
            let c = null;
            try { c = (window.world && window.world.chunks && typeof window.world.chunks.size === "number") ? window.world.chunks.size : (window.engineStats && window.engineStats.chunks); } catch {}
            providerValues.chunks = (Number.isFinite(c)) ? c : null;
        }
        // v1838 — fire a one-shot event when the peer or remote COUNT changes (after the first
        // reading, so we don't fire on initial load). The docked-gauge dock listens for this to
        // drop the peers row into view for 30s, then fall back to the system/CPU row.
        if (needsPeers || needsRemote) {
            try {
                const pv = providerValues.swekpeers, rv = providerValues.swekremotepeers;
                if (_lastPeerCount !== null && ((needsPeers && pv !== _lastPeerCount) || (needsRemote && rv !== _lastRemoteCount))) {
                    if (typeof window !== "undefined" && window.dispatchEvent) {
                        window.dispatchEvent(new CustomEvent("swek:peercount", { detail: { peers: pv, remotes: rv, prevPeers: _lastPeerCount, prevRemotes: _lastRemoteCount } }));
                    }
                }
                _lastPeerCount = (pv == null ? _lastPeerCount : pv);
                _lastRemoteCount = (rv == null ? _lastRemoteCount : rv);
            } catch {}
        }
        if (typeof opts.values === "function") {
            // dedicated gauge sets (e.g. the email-rules / render-queue rows) supply live counts directly, so this set
            // never touches /gauge/state. Returns { sourceKey: number | {value, isCount} }.
            try { const v = await opts.values(); if (v) for (const k of Object.keys(v)) { const e = v[k]; gaugeBag[k] = (e && typeof e === "object") ? { value: e.value || 0, isCount: e.isCount !== false } : { value: e || 0, isCount: true }; } } catch {}
        } else if (needsBag) {
            try { const j = await fetch("/gauge/state", { cache: "no-store" }).then(r => r.json());
                if (j && j.ok && j.gauges) { for (const k of Object.keys(j.gauges)) gaugeBag[k] = j.gauges[k]; }
            } catch {}
        }
        refresh();
    }
    function start() {
        if (!navigator.getBattery) { providerValues.batteryNA = true; }   // no Battery API → show "/" on a battery gauge
        else if (!_batBound) {
            _batBound = true;
            navigator.getBattery().then((bat) => {
                const read = () => { const lvl = Math.round(bat.level * 100); if (Number.isFinite(lvl)) { providerValues.battery = lvl; providerValues.batteryNA = false; } else { providerValues.batteryNA = true; } refresh(); };
                read(); bat.addEventListener("levelchange", read); bat.addEventListener("chargingchange", read);
            }).catch(() => { providerValues.batteryNA = true; refresh(); });
        }
        if (_timer) return;
        _tick();
        _timer = setInterval(_tick, Math.max(1000, opts.pollMs || 2000));
    }
    function stop() { if (_timer) { clearInterval(_timer); _timer = null; } }
    function destroy() { stop(); try { root.remove(); } catch {} }

    render();
    // v1873 — expose a live snapshot of the current gauge values (0..100 per source) so the docked
    // panel's 3D stage can drive its ring/gyro/barrel actors from the same numbers as the SVG dials.
    function snapshot() { const o = {}; for (const k of Object.keys(gaugeBag)) { const e = gaugeBag[k]; o[k] = (e && typeof e === "object") ? (e.value || 0) : (e || 0); } return o; }
    // v3671 -- *** DRIVE A SET FROM SOMEBODY ELSE'S NUMBERS, SO A SECOND SET IS NOT A SECOND POLL. ***
    // The info-panel dock shows the same cpu/ram/gpu/peers the main dials already fetched every two seconds.
    // Mounting a second set and calling start() would have put a SECOND POLLER on the page reading the SAME
    // endpoints -- two declarations of one set of numbers, which is this tree's most repeated defect, and they
    // would drift by up to one poll interval so the two views could disagree ON SCREEN. setStats writes the
    // provider values directly and repaints; a set driven this way NEVER CALLS start(), so it owns no timer and
    // makes no request. Absent keys are LEFT ALONE rather than zeroed, because a stats object that has not
    // reported gpu yet must read "-" and not 0%.
    function setStats(s) {
        if (!s || typeof s !== "object") return false;
        for (const k of ["cpu", "ram", "gpu", "swekpeers", "swekremotepeers", "battery"]) {
            if (s[k] !== undefined) providerValues[k] = s[k];
        }
        if (s.batteryNA !== undefined) providerValues.batteryNA = !!s.batteryNA;
        refresh();
        return true;
    }
    return { root, start, stop, destroy, refresh, setGauges: render, values: snapshot, setStats };
}
