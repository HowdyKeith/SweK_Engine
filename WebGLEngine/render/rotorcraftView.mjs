// WebGLEngine/render/rotorcraftView.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHAT rotorcraft-demo.html SHOWS OF THE HELICOPTER'S AND THE QUADROTOR'S FLIGHTS, AS PURE FUNCTIONS (the tree had no renderer for either): the replay `trace` that brain/rotorTask.mjs and brain/droneTask.mjs record when asked, drawn on a 2D canvas as a PLAN view (x east, y north: the point to hold, the trail, the machine with its heading,
// the wind) beside a SIDE view (x against altitude: the ground, the trail, the machine with its pitch), a gust scaler for the scenario's wind, and the caption of a result. Nothing here flies anything: it draws what a flight recorded. A gate holds all of it without a browser (a recording fake canvas stands for the 2D context);
// the page only wires the controls. The machines are drawn at a fixed size in pixels (a helicopter is 15 m long and a quadrotor 1 m: at the scale of a 300 m hover neither is visible to scale), said on the page.
"use strict";
import * as TR from "../physics/mechanics/terrain.mjs";

export const COLOURS = Object.freeze({ bg: "#050a12", grid: "#14233a", ground: "#2b3b52", target: "#f6a623", wind: "#7c93b8", trailA: "#59d1ff", trailB: "#f6a623", up: "#5fe08a", down: "#ff7a7a", text: "#dbe7ff", dim: "#7c93b8", dead: "#ff7a7a" });
export const MIN_SPAN = 40;   // metres: the smallest extent the view is scaled to (a hover would otherwise be zoomed to nothing)

/** The scenario with its wind's gusts scaled by `k` (the mean wind and the frequencies are left alone): a new scenario object, the original untouched; a scenario with no wind is returned as it is (it has none to scale). k must be a finite number >= 0. */
export function withGust(sc, k) {
    if (!Number.isFinite(k) || k < 0) throw new Error(`rotorcraftView.withGust: k must be a number >= 0, got ${k}`);
    if (!sc || !sc.wind) return sc;
    return { ...sc, wind: { ...sc.wind, amp: sc.wind.amp.map((a) => a * k) } };
}

/** The last frame of a trace at or before time t (seconds): the first frame before the start, the last after the end; null for an empty trace. */
export function frameAt(trace, t) {
    if (!trace || !trace.length) return null;
    if (t <= trace[0].t) return trace[0];
    let lo = 0, hi = trace.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (trace[mid].t <= t) lo = mid; else hi = mid - 1; }
    return trace[lo];
}
/** The frames of a trace up to and including time t (for the trail). */
export function trailTo(trace, t) {
    if (!trace || !trace.length) return [];
    let n = 0; while (n < trace.length && trace[n].t <= t) n++;
    return trace.slice(0, Math.max(1, n));
}
/** The length in seconds of the longest of several traces (0 for none). */
export const durationOf = (traces) => Math.max(0, ...traces.filter((t) => t && t.length).map((t) => t[t.length - 1].t));

/** The extent that holds every trace and the scenario's target: { x0, x1, y0, y1, z0, z1 }, each axis at least MIN_SPAN wide (centred on what it holds) and padded by `pad` (a fraction of the span, default 0.1). */
export function boundsOf(traces, sc, pad = 0.1) {
    const xs = [], ys = [], zs = [];
    for (const tr of traces) if (tr) for (const f of tr) { xs.push(f.pos[0]); ys.push(f.pos[1]); zs.push(f.pos[2]); }
    if (sc && sc.target) { if (sc.target.pos) { xs.push(sc.target.pos[0]); ys.push(sc.target.pos[1]); } if (sc.target.altitude != null) zs.push(sc.target.altitude); }   // an engine or motor flight has only an altitude, a terrain flight only a point and a height over the ground
    if (!xs.length) return { x0: -MIN_SPAN / 2, x1: MIN_SPAN / 2, y0: -MIN_SPAN / 2, y1: MIN_SPAN / 2, z0: 0, z1: MIN_SPAN };
    const fit = (v) => { let lo = Math.min(...v), hi = Math.max(...v), span = Math.max(MIN_SPAN, hi - lo), mid = (lo + hi) / 2; return [mid - span / 2 - span * pad, mid + span / 2 + span * pad]; };
    const [x0, x1] = fit(xs), [y0, y1] = fit(ys), [z0, z1] = fit([...zs, 0]);
    return { x0, x1, y0, y1, z0, z1 };
}
/** A world point to screen pixels in a rectangle { x, y, w, h }, one scale for both axes (so a heading looks like one), the extent centred: plan view takes (x, y) with y up, side view (x, z) with z up. */
export function toScreen(b, rect, a, c, side = false) {
    const u0 = b.x0, u1 = b.x1, v0 = side ? b.z0 : b.y0, v1 = side ? b.z1 : b.y1, k = Math.min(rect.w / (u1 - u0), rect.h / (v1 - v0)), cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    return [cx + (a - (u0 + u1) / 2) * k, cy - (c - (v0 + v1) / 2) * k];
}

/** The caption of a result: what the flight scored and how it ended, in the task's own words. kind is the scenario kind ("engine" and "motor" are the failure flights). */
export function captionOf(r, kind) {
    if (!r) return "";
    if (kind === "engine" || kind === "motor") {
        const what = kind === "engine" ? "engine out" : "motor out", s = r.score.toFixed(3);
        if (r.touchdown === "landed" && r.settled) return `${what}: LANDED and still standing (sink ${r.sink.toFixed(1)} m/s, ground speed ${r.gs.toFixed(1)} m/s), score ${s}`;
        if (r.touchdown) return `${what}: the machine is LOST (${r.touchdown} at sink ${r.sink.toFixed(1)} m/s, ground speed ${r.gs.toFixed(1)} m/s${r.why ? ", " + r.why : ""}), score ${s}`;
        return `${what}: never came down in the time allowed, score ${s}`;
    }
    const e = (x) => (Number.isFinite(x) ? x.toFixed(3) : "?");
    return `${kind}: score ${r.score.toFixed(3)} (position error ${e(r.ePos)}, altitude ${e(r.eAlt)}, heading ${e(r.eHdg)}); ${r.status === "airborne" ? "flew the whole time" : "ended " + r.status + (r.why ? " (" + r.why + ")" : "")}`;
}

/**
 * Draw one panel: the plan view in the left 56% and the side view in the right 44% of the canvas `g` of w x h pixels. `p` is { frame (the current frame), trail (the frames so far), sc (the scenario: its target and its terrain), bounds, machine ("rotor" | "drone"), colour, label, windNow ([x, y, z] or absent) }.
 * Returns the number of drawing calls it made (a gate counts them: a panel with nothing to draw draws only the frame and the label).
 */
export function drawPanel(g, w, h, p) {
    let calls = 0; const c = new Proxy(g, { get(t, k) { const v = t[k]; if (typeof v === "function") return (...a) => { calls++; return v.apply(t, a); }; return v; }, set(t, k, v) { t[k] = v; return true; } });
    c.fillStyle = COLOURS.bg; c.fillRect(0, 0, w, h);
    const plan = { x: 6, y: 22, w: Math.floor(w * 0.56) - 10, h: h - 28 }, side = { x: Math.floor(w * 0.56) + 4, y: 22, w: w - Math.floor(w * 0.56) - 10, h: h - 28 }, b = p.bounds;
    c.strokeStyle = COLOURS.grid; c.lineWidth = 1; c.strokeRect(plan.x, plan.y, plan.w, plan.h); c.strokeRect(side.x, side.y, side.w, side.h);
    c.fillStyle = COLOURS.text; c.font = "12px ui-monospace, Menlo, monospace"; c.textAlign = "left"; c.fillText(p.label || "", 8, 14);
    c.fillStyle = COLOURS.dim; c.font = "10px ui-monospace, Menlo, monospace"; c.fillText("plan (x east, y north)", plan.x + 4, plan.y + 12); c.fillText("side (x, altitude)", side.x + 4, side.y + 12);
    if (!b) return calls;
    // the ground in the side view: flat at 0, or the scenario's terrain along y = 0
    const terrain = p.sc && p.sc.terrain ? TR.createTerrain(p.sc.terrain) : null;
    c.strokeStyle = COLOURS.ground; c.lineWidth = 1.5; c.beginPath();
    for (let i = 0; i <= 48; i++) { const x = b.x0 + (b.x1 - b.x0) * i / 48, z = terrain ? terrain.height(x, p.frame ? p.frame.pos[1] : 0) : 0, [sx, sy] = toScreen(b, side, x, z, true); if (i === 0) c.moveTo(sx, sy); else c.lineTo(sx, sy); }
    c.stroke();
    // the point to hold
    if (p.sc && p.sc.target && p.sc.target.pos) {
        const T = p.sc.target, [px, py] = toScreen(b, plan, T.pos[0], T.pos[1]);
        c.strokeStyle = COLOURS.target; c.lineWidth = 1.5; c.beginPath(); c.arc(px, py, 7, 0, Math.PI * 2); c.moveTo(px - 11, py); c.lineTo(px + 11, py); c.moveTo(px, py - 11); c.lineTo(px, py + 11); c.stroke();
        if (T.altitude != null) { const [sx, sy] = toScreen(b, side, T.pos[0], T.altitude, true); c.beginPath(); c.arc(sx, sy, 5, 0, Math.PI * 2); c.stroke(); }
    }
    // the trail in both views
    if (p.trail && p.trail.length > 1) {
        c.strokeStyle = p.colour || COLOURS.trailA; c.lineWidth = 1.5; c.beginPath();
        p.trail.forEach((f, i) => { const [sx, sy] = toScreen(b, plan, f.pos[0], f.pos[1]); if (i === 0) c.moveTo(sx, sy); else c.lineTo(sx, sy); }); c.stroke();
        c.beginPath(); p.trail.forEach((f, i) => { const [sx, sy] = toScreen(b, side, f.pos[0], f.pos[2], true); if (i === 0) c.moveTo(sx, sy); else c.lineTo(sx, sy); }); c.stroke();
    }
    // the machine
    if (p.frame) {
        const f = p.frame, down = f.status !== "airborne", col = down ? (f.status === "landed" ? COLOURS.up : COLOURS.down) : (p.colour || COLOURS.trailA), [mx, my] = toScreen(b, plan, f.pos[0], f.pos[1]), [nx, ny] = toScreen(b, side, f.pos[0], f.pos[2], true);
        c.save(); c.translate(mx, my); c.rotate(f.heading); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 2;
        if (p.machine === "drone") {
            c.beginPath(); c.moveTo(-9, -9); c.lineTo(9, 9); c.moveTo(-9, 9); c.lineTo(9, -9); c.stroke();
            const arm = [[9, -9], [9, 9], [-9, 9], [-9, -9]];   // the four rotors; the model's motor order is not drawn to scale, the dead ones are marked red
            arm.forEach(([ax, ay], k) => { const dead = f.health && f.health[k] === 0; c.beginPath(); c.arc(ax, ay, 4.5, 0, Math.PI * 2); c.strokeStyle = dead ? COLOURS.dead : col; if (dead) { c.fillStyle = COLOURS.dead; c.fill(); } c.stroke(); });
            c.strokeStyle = COLOURS.text; c.beginPath(); c.moveTo(0, 0); c.lineTo(12, 0); c.stroke();
        } else {
            c.beginPath(); c.ellipse(0, 0, 9, 4, 0, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(-9, 0); c.lineTo(-17, 0); c.stroke();
            c.beginPath(); c.arc(0, 0, 11, 0, Math.PI * 2); c.strokeStyle = down ? col : COLOURS.dim; c.stroke();
        }
        c.restore();
        c.save(); c.translate(nx, ny); c.rotate(-(f.pitch || 0)); c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.stroke(); c.beginPath(); c.arc(8, 0, 2, 0, Math.PI * 2); c.stroke(); c.restore();
        c.fillStyle = COLOURS.dim; c.font = "10px ui-monospace, Menlo, monospace"; c.fillText(`t ${f.t.toFixed(1)} s  alt ${f.pos[2].toFixed(1)} m  ${f.status}`, plan.x + 4, plan.y + plan.h - 6);
    }
    // the wind (the caller's task computes it: `windNow` is the air's velocity [x, y, z] at the current time)
    if (p.windNow) {
        const wv = p.windNow, ox = plan.x + plan.w - 34, oy = plan.y + 34, s = 4; c.strokeStyle = COLOURS.wind; c.lineWidth = 2; c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + wv[0] * s, oy - wv[1] * s); c.stroke(); c.fillStyle = COLOURS.dim; c.font = "10px ui-monospace, Menlo, monospace"; c.fillText(`wind ${Math.hypot(wv[0], wv[1]).toFixed(1)} m/s`, ox - 28, oy + 22);
    }
    return calls;
}
