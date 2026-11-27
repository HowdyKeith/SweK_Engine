// WebGLEngine/brain/lplc2Subunits.mjs -- UNNUMBERED (the version is chosen at ship time; registered in brain/FLY_RETINOTOPY_RF_WIP.md Part 5 before this file; the gate is brain/lplc2Subunits-selfcheck.mjs)
//
// ONE LPLC2 CELL AS FOUR DISPLACED SUBUNITS, from Klapoetke et al. 2017 (Nature 551:237, PMC7457385): each lobula plate layer's dendritic arm is excited by motion OUTWARD along its own direction and inhibited
// by motion inward (radial motion opponency), and the arms are integrated nonlinearly. As registered (Part 5): a 90 x 90 frame at 1 degree a pixel, the cell centred, the frame's axes its cardinal axes;
// layer 1 is brain/flyEmdLplc2Gf.mjs's motion detectors unchanged; four disks of radius 15 degrees at 10 degrees from the centre along +x, -x, +y, -y; each disk's drive is the outward motion along its
// axis summed over the disk, less the inward; the cell is [sum of the four drives]+ squared; a stimulus's response is the largest 300 ms mean.
// The stimuli are Part 4's, read from the text, with the arms' reach (30 degrees from the centre) ASSUMED where only the figure gives it. Edges are drawn with fractional coverage (4 x 4 supersampling).
// 2026-11-26 -- PART 9 (registered first): `surround` subtracts w x the motion energy of the field outside the four disks before the rectification (SURROUND, surroundMask).
// 2026-11-26 -- PART 7 (registered first): `tuning: "cos2"` reads each arm's motion through a signed squared cosine; S11 the 60 degree bar on a cardinal axis; predictions7 adds the clover (P8).
// Pure: no DOM, no clock, no Math.random, no file.
"use strict";
import * as FE from "./flyEmdLplc2Gf.mjs";

export const FRAME = Object.freeze({ w: 90, h: 90, degPerPx: 1, step: 0.01 });
export const SUBUNITS = Object.freeze({ offset: 10, radius: 15 });
export const STIM = Object.freeze({ background: 0.5, dark: 0, holdS: 2, barWidth: 10, edgeSpeed: 20, centreSquare: 10, reach: 30, discFrom: 5, discTo: 60, discSpeed: 10, gratingPeriod: 20, wideBar: 60 });
export const PEAK_WINDOW_S = 0.3;
export const STIMULI = Object.freeze(["S1", "S2", "S3r", "S3l", "S4", "S5", "S6", "S7", "S8", "S9", "S10"]);
/** PART 7 (the oriented-arms round): Part 5's stimuli and S11, the 60 degree bar along the cell's +x axis (a cardinal axis). */
export const STIMULI7 = Object.freeze([...STIMULI, "S11"]);
/** Part 5's arm reads the plain component of the local motion along its axis; Part 7's reads it through a signed squared cosine (half the drive at 45 degrees). */
export const TUNINGS = Object.freeze(["component", "cos2"]);

const X0 = (FRAME.w - 1) / 2, Y0 = (FRAME.h - 1) / 2, SS = 4;

/** A frame drawn from an indicator `dark(x, y)` in degrees from the centre (+x right, +y down), with 4 x 4 coverage per pixel. */
export function draw(dark) {
    const { w, h } = FRAME, f = FE.blank(w, h, STIM.background);
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        let n = 0;
        for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) if (dark(px - X0 - 0.5 + (sx + 0.5) / SS, py - Y0 - 0.5 + (sy + 0.5) / SS)) n++;
        if (n) f.data[py * w + px] = STIM.background + (STIM.dark - STIM.background) * (n / (SS * SS));
    }
    return f;
}

const half = STIM.centreSquare / 2, inSquare = (x, y) => Math.abs(x) <= half && Math.abs(y) <= half;
// an arm along +x/-x/+y/-y reaching `r` degrees from the centre (r >= half: the square's edge), 10 degrees wide
const arm = (dir, r) => (x, y) => { const a = dir === "+x" ? x : dir === "-x" ? -x : dir === "+y" ? y : -y, b = dir === "+x" || dir === "-x" ? y : x; return a >= 0 && a <= r && Math.abs(b) <= STIM.barWidth / 2; };

/** The motion as frames, with the 2 s holds: `shape(t)` gives the indicator at motion time t in [0, T]. */
function moving(shape, T) {
    const n = Math.round(T / FRAME.step), hold = Math.round(STIM.holdS / FRAME.step), frames = [];
    const first = draw(shape(0)), last = draw(shape(T));
    for (let k = 0; k < hold; k++) frames.push(first);
    for (let k = 1; k < n; k++) frames.push(draw(shape(k * FRAME.step)));
    for (let k = 0; k < hold; k++) frames.push(last);
    return frames;
}

/** The registered stimuli by name (Part 5). Returns { name, frames, motionS }. */
export function stimulus(name, { reach = STIM.reach } = {}) {   // reach: 2026-11-26 (fly-lplc2-geometry-sensitivity) -- the arms' and bars' reach, Part 5's ASSUMED 30 by default; another value is a reported check, never a registered stimulus
    if (!(reach > half && reach <= 44)) throw new Error(`lplc2Subunits.stimulus: a reach is above ${half} and at most 44 degrees (the frame), got ${JSON.stringify(reach)}`);
    const v = STIM.edgeSpeed, reachT = (reach - half) / v;          // the arms' edges run from the square's edge (5) to the reach (30): 1.25 s at 20 degrees/s
    const grow = (t) => half + v * t, shrink = (t) => reach - v * t;
    const cross = (dirs, rOf, inDirs = [], rIn = null) => (t) => { const a = dirs.map((d) => arm(d, rOf(t))), b = inDirs.map((d) => arm(d, rIn(t))); return (x, y) => inSquare(x, y) || a.some((f) => f(x, y)) || b.some((f) => f(x, y)); };
    const all = ["+x", "-x", "+y", "-y"];
    switch (name) {
        case "S1": return { name, frames: moving(cross(all, grow), reachT), motionS: reachT };
        case "S2": return { name, frames: moving(cross(all, shrink), reachT), motionS: reachT };
        case "S3r": return { name, frames: moving(cross(["+x"], grow), reachT), motionS: reachT };
        case "S3l": return { name, frames: moving(cross(["-x"], grow), reachT), motionS: reachT };
        case "S4": return { name, frames: moving(cross(["+x", "-x"], grow), reachT), motionS: reachT };
        case "S5": return { name, frames: moving(cross(["+x", "-x"], grow, ["+y", "-y"], shrink), reachT), motionS: reachT };
        case "S6": { const T = reachT, P = STIM.gratingPeriod; return { name, frames: moving((t) => (x) => ((((x - v * t) % P) + P) % P) < STIM.barWidth, T), motionS: T }; }
        case "S7": case "S8": {
            const T = (STIM.discTo - STIM.discFrom) / 2 / STIM.discSpeed, r0 = STIM.discFrom / 2, r1 = STIM.discTo / 2;   // the edge (the radius) at 10 degrees/s: 2.75 s
            const r = name === "S7" ? (t) => r0 + STIM.discSpeed * t : (t) => r1 - STIM.discSpeed * t;
            return { name, frames: moving((t) => { const R = r(t); return (x, y) => x * x + y * y <= R * R; }, T), motionS: T };
        }
        case "S11": { const L0 = grow; return { name, frames: moving((t) => { const L = L0(t); return (x, y) => Math.abs(x) <= L && Math.abs(y) <= STIM.wideBar / 2; }, reachT), motionS: reachT }; }
        case "S9": case "S10": {
            const W = name === "S9" ? STIM.barWidth : STIM.wideBar, c = Math.SQRT1_2;
            return { name, frames: moving((t) => { const L = grow(t); return (x, y) => Math.abs(c * (x + y)) <= L && Math.abs(c * (y - x)) <= W / 2; }, reachT), motionS: reachT };
        }
        default: throw new Error(`lplc2Subunits.stimulus: no stimulus named ${JSON.stringify(name)} (${STIMULI7.join(", ")})`);
    }
}

/** PART 9: the surround -- every pixel within `field` degrees of the centre that lies in none of the four disks; its weight is registered as 1. */
export const SURROUND = Object.freeze({ field: 30, weight: 1 });
export function surroundMask(M = masks(), { field = SURROUND.field } = {}) {
    const inDisk = new Set([...M["+x"], ...M["-x"], ...M["+y"], ...M["-y"]]), idx = [], { w, h } = FRAME;
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) { const x = px - X0, y = py - Y0, i = py * w + px; if (x * x + y * y <= field * field && !inDisk.has(i)) idx.push(i); }
    return { idx, weight: SURROUND.weight };
}

/** The four subunits' pixel masks: { "+x": [indices], ... } -- disks of SUBUNITS.radius at SUBUNITS.offset from the centre. */
export function masks({ offset = SUBUNITS.offset, radius = SUBUNITS.radius } = {}) {
    const out = {}, { w, h } = FRAME;
    for (const [d, cx, cy] of [["+x", offset, 0], ["-x", -offset, 0], ["+y", 0, offset], ["-y", 0, -offset]]) {
        const idx = [];
        for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) { const x = px - X0, y = py - Y0; if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) idx.push(py * w + px); }
        out[d] = idx;
    }
    return out;
}

/**
 * The cell from one frame's motion maps (dh: + is motion toward +x; dv: + is motion toward +y, as flyEmdLplc2Gf's maps): each subunit's drive is the outward motion along its axis summed over its disk
 * (the inward motion counts negative, one weight for both signs), and R = [the four drives summed]+ squared. Returns { drives, R }.
 */
export function cellFromMaps(dh, dv, M = masks(), { tuning = "component", surround = null } = {}) {
    if (!TUNINGS.includes(tuning)) throw new Error(`lplc2Subunits.cellFromMaps: a tuning is ${TUNINGS.join(" or ")}, got ${JSON.stringify(tuning)}`);
    // component: the arm takes |m| cos(theta) = the component itself. cos2 (Part 7): |m| cos(theta) |cos(theta)| = c |c| / |m| for the component c -- the same sign, half the drive at 45 degrees, none at 90.
    const along = tuning === "component" ? (a) => a : null;
    const sum = (a, b, idx) => { let s = 0; for (const i of idx) { const c = a[i]; if (along) s += c; else { const m = Math.hypot(a[i], b[i]); if (m > 0) s += (c * Math.abs(c)) / m; } } return s; };
    const drives = { "+x": sum(dh, dv, M["+x"]), "-x": -sum(dh, dv, M["-x"]), "+y": sum(dv, dh, M["+y"]), "-y": -sum(dv, dh, M["-y"]) };
    // PART 9: the surround's motion energy (|m| over its pixels, any direction), times its weight, subtracted before the rectification
    let E = 0; if (surround) { for (const i of surround.idx) E += Math.hypot(dh[i], dv[i]); }
    const s = drives["+x"] + drives["-x"] + drives["+y"] + drives["-y"] - (surround ? surround.weight * E : 0);
    return { drives, E, R: s > 0 ? s * s : 0 };
}

/** The largest mean of `trace` over a window of `n` samples. */
export function peakWindow(trace, n = Math.round(PEAK_WINDOW_S / FRAME.step)) {
    if (trace.length < n) return trace.length ? trace.reduce((a, b) => a + b, 0) / trace.length : 0;
    let s = 0, best = -Infinity;
    for (let i = 0; i < trace.length; i++) { s += trace[i]; if (i >= n) s -= trace[i - n]; if (i >= n - 1) best = Math.max(best, s / n); }
    return best;
}

/** One stimulus through layer 1 and the subunit cell: { name, peak, trace }. */
export function respond(frames, M = masks(), { tuning = "component", surround = null } = {}) {
    const m = FE.createModel({ w: FRAME.w, h: FRAME.h, units: [{ x: Math.round(X0), y: Math.round(Y0) }], keepMaps: true }), trace = [], eTrace = [];
    for (const f of frames) { const r = m.step(f); const c = r.maps ? cellFromMaps(r.maps.dh, r.maps.dv, M, { tuning, surround }) : { R: 0, E: 0 }; trace.push(c.R); eTrace.push(c.E); }
    return { peak: peakWindow(trace), trace, eTrace };
}

/** The comparison, reported only: Zhao et al.'s multiplicative cross unit (flyEmdLplc2Gf, its own rule) on the same frames, its receptive field the paper's 60 degree bound: the frames it is active on. */
export function respondZhao(frames) {
    const m = FE.createModel({ w: FRAME.w, h: FRAME.h, units: [{ x: Math.round(X0), y: Math.round(Y0) }], params: { rfSide: 60 } });
    let active = 0; for (const f of frames) active += m.step(f).nAct;
    return { activeFrames: active };
}

/** THE REGISTERED PREDICTIONS (Part 5) over { S1: peak, ... }: each { id, holds, detail }, and the verdict. */
export function predictions(p) {
    for (const k of STIMULI) if (!Number.isFinite(p[k])) throw new Error(`lplc2Subunits.predictions: no finite response for ${k}`);
    const P = [
        { id: "P1", holds: p.S1 > 0 && p.S2 < 0.1 * p.S1, detail: "S1 > 0 and S2 < 10 % of S1" },
        { id: "P2", holds: p.S3r > 0 && p.S3l > 0 && p.S3r < p.S4 && p.S3l < p.S4, detail: "S3r, S3l > 0, each below S4" },
        { id: "P3", holds: p.S4 > p.S3r + p.S3l, detail: "S4 > S3r + S3l" },
        { id: "P4", holds: p.S5 < p.S4, detail: "S5 < S4" },
        { id: "P5", holds: p.S6 < 0.1 * p.S1, detail: "S6 < 10 % of S1" },
        { id: "P6", holds: p.S7 > 0 && p.S8 < 0.1 * p.S7, detail: "S7 > 0 and S8 < 10 % of S7" },
        { id: "P7", holds: p.S10 < p.S9, detail: "S10 < S9" },
    ];
    const failed = P.filter((x) => !x.holds).map((x) => x.id);
    return { predictions: P, verdict: failed.length ? `NOT SUPPORTED (${failed.join(", ")})` : "SUPPORTED" };
}

/** PART 7'S REGISTERED PREDICTIONS: Part 5's P1 to P7 and P8 (the clover, S11 > S10), and the verdict. */
export function predictions7(p) {
    if (!Number.isFinite(p.S11)) throw new Error("lplc2Subunits.predictions7: no finite response for S11");
    const base = predictions(p).predictions, P = [...base, { id: "P8", holds: p.S11 > p.S10, detail: "S11 > S10 (the clover)" }];
    const failed = P.filter((x) => !x.holds).map((x) => x.id);
    return { predictions: P, verdict: failed.length ? `NOT SUPPORTED (${failed.join(", ")})` : "SUPPORTED" };
}

