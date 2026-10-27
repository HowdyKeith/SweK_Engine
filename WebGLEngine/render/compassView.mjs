// WebGLEngine/render/compassView.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE COMPASS-DROPOUT VIEW OF THE SUB AQUARIUM: the plain autopilot beside the dead-reckoning navigator. render/subAquariumSim.mjs setEvent(id, "dropout") takes a sub's compass away in windows (tools/subDropout.mjs: the pilot is shown the last valid
// heading) and setEvent(id, "navigator") puts the same pilot behind tools/subNavigator.mjs, which integrates the vessel's own heading rate through the dark. A snapshot row carries `compass` = { valid, seen, error } for either. This module is what the
// page draws from it, in two halves that a gate holds without a browser:
//   THE NUMBERS  dialInfo (a row -> the dial's figures, in degrees), pair (which two rows to put side by side), pushTrace (the rolling error), lineFor (the one line the list row shows)
//   THE DRAWING  drawDial and drawTrace, which take any 2D context (a gate hands them one that records its calls)
// A DIAL is the plan view's convention: the nose of a heading h points to (cos h, -sin h) on the canvas (0 = east, a right turn increases it). The GREEN needle is the TRUE heading; the AMBER needle is what the pilot is shown (the held heading for the
// plain autopilot, the navigator's estimate for the navigator); the dial turns red while the compass is dark.
// Pure: no DOM, no clock.
"use strict";

export const TRACE_MAX = 300, TRACE_SPAN_DEG = 90;
// v4904 -- the two estimator events (render/subAquariumSim.mjs) read like the others: a dial figure and a list line; their `seen` is the heading the autopilot read last
const KINDS = Object.freeze({ dropout: "plain autopilot", navigator: "navigator", "fly-estimator": "fly estimator", "er-estimator": "random-wiring estimator" });
const DEG = 180 / Math.PI, wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const finite = (v) => (Number.isFinite(v) ? v : 0);

/** A snapshot row's dial: { kind ("plain autopilot" | "navigator" | "fly estimator" | "random-wiring estimator"), valid, dark, trueDeg, seenDeg, errDeg } -- degrees, the error wrapped to -180..180 -- or null for a row with no compass event. */
export function dialInfo(row) {
    if (!row || !row.compass || !Object.prototype.hasOwnProperty.call(KINDS, row.event)) return null;
    const err = finite(row.compass.error);
    return { kind: KINDS[row.event], valid: !!row.compass.valid, dark: !row.compass.valid, trueDeg: finite(row.heading) * DEG, seenDeg: finite(row.compass.seen) * DEG, errDeg: wrap(err) * DEG };
}

/** The two rows to show beside each other: the first sub on the plain dropout and the first on the navigator ({ plain, nav }, each a row or null). */
export function pair(rows) {
    const list = rows || [];
    return { plain: list.find((r) => r.event === "dropout") || null, nav: list.find((r) => r.event === "navigator") || null };
}

/** One frame of a rolling trace of the absolute heading error (degrees): { t, e } points, at most TRACE_MAX. Returns a NEW array; a row with no compass adds nothing. */
export function pushTrace(trace, row, t) {
    const d = dialInfo(row);
    if (!d || !Number.isFinite(t)) return trace;
    const out = trace.concat([{ t, e: Math.abs(d.errDeg), dark: d.dark }]);
    return out.length > TRACE_MAX ? out.slice(out.length - TRACE_MAX) : out;
}

/**
 * v4904 -- THE TANK'S OWN MARK OF A DARK COMPASS (ported from the tank-wide compass of b6b418f..b30f9e0): an amber dashed ring of radius `r` round a sub whose compass is dark, and an amber GHOST LINE from the sub's centre along the heading its
 * autopilot BELIEVES (`believed`, the snapshot's compass.seen) for 2.2 r. The plan view's convention: the nose of a heading h points to (cos h, -sin h) on the canvas, so the sub's own nose (drawn separately) is the TRUTH and this line is the belief;
 * the gap between them is the error. Returns { ring: true, tipX, tipY } what was drawn (the tip is where the ghost line ends); a non-finite belief draws the ring and no line.
 */
export function drawDark(g, px, py, believed, r) {
    g.save && g.save(); g.strokeStyle = "#f6a623"; g.lineWidth = 1.5; g.setLineDash && g.setLineDash([4, 3]); g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.stroke(); g.setLineDash && g.setLineDash([]);
    let tipX = null, tipY = null;
    if (Number.isFinite(believed)) { tipX = px + Math.cos(believed) * r * 2.2; tipY = py - Math.sin(believed) * r * 2.2; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py); g.lineTo(tipX, tipY); g.stroke(); }
    g.restore && g.restore();
    return { ring: true, tipX, tipY };
}

/** The list row's compass line, or "". */
export function lineFor(row) {
    const d = dialInfo(row);
    if (!d) return "";
    return `${d.kind.toUpperCase()} · compass ${d.dark ? "DARK" : "ok"} · heading error ${Math.abs(d.errDeg).toFixed(0)}°`;
}

const tip = (cx, cy, r, deg) => { const h = deg / DEG; return [cx + r * Math.cos(h), cy - r * Math.sin(h)]; };

/** Draw one dial centred (cx, cy) with radius r on a 2D context: the face, the true needle, the shown needle, the title and the error. `info` null draws an empty face with `title`. */
export function drawDial(g, cx, cy, r, info, title = "") {
    g.save && g.save();
    g.lineWidth = 2; g.strokeStyle = info && info.dark ? "#ff7a7a" : "#1c2c44"; g.fillStyle = info && info.dark ? "#2a0d12" : "#07131f";
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); g.stroke();
    if (info) {
        const needle = (deg, colour, len) => { const [x, y] = tip(cx, cy, r * len, deg); g.strokeStyle = colour; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke(); };
        needle(info.seenDeg, "#f6a623", 0.8);
        needle(info.trueDeg, "#5fe08a", 0.95);
    }
    g.fillStyle = "#dbe7ff"; g.font = "15px monospace"; g.textAlign = "center";
    g.fillText(info ? info.kind : title, cx, cy - r - 8);
    g.fillStyle = info && info.dark ? "#ff7a7a" : "#7c93b8";
    g.fillText(info ? (info.dark ? "compass DARK  " : "compass ok  ") + "error " + Math.abs(info.errDeg).toFixed(0) + "°" : "not running", cx, cy + r + 18);
    g.restore && g.restore();
}

/** Draw the rolling error of the two subs on one set of axes (x .. x + w, y .. y + h): plain in amber, navigator in cyan, the scale TRACE_SPAN_DEG at the top, the dark spans shaded where `dark` is true in the plain trace. */
export function drawTrace(g, x, y, w, h, plain, nav) {
    g.save && g.save();
    g.fillStyle = "#07131f"; g.fillRect(x, y, w, h); g.strokeStyle = "#1c2c44"; g.lineWidth = 1; g.strokeRect(x, y, w, h);
    const line = (tr, colour) => {
        if (!tr || tr.length < 2) return;
        g.strokeStyle = colour; g.lineWidth = 2; g.beginPath();
        tr.forEach((p, i) => { const px = x + w * i / (TRACE_MAX - 1), py = y + h - h * Math.min(1, p.e / TRACE_SPAN_DEG); i ? g.lineTo(px, py) : g.moveTo(px, py); });
        g.stroke();
    };
    line(plain, "#f6a623"); line(nav, "#59d1ff");
    g.fillStyle = "#7c93b8"; g.font = "13px monospace"; g.textAlign = "left"; g.fillText(TRACE_SPAN_DEG + "° heading error", x + 4, y + 14);
    g.restore && g.restore();
}
