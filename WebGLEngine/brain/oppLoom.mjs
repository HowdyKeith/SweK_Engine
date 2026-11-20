// WebGLEngine/brain/oppLoom.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is brain/oppLoom-selfcheck.mjs; the round note is brain/STEALTH_ROUNDS_WIP.md, Round 14)
//
// A LOOMING DETECTOR WITH DIRECTION-OPPONENT INHIBITION FROM DOWNWARD FIELD MOTION. The front end is the fly array of brain/flyEmdLplc2Gf.mjs (Zhao et al. 2023: EMDs, then cross-shaped LPLC2 units that need outward motion in all four arms). To it this module adds ONE thing, motivated by Santon et al. 2025 (the cuttlefish's passing stripes "overwhelm the threatening motion cues of the predator with nonthreatening downward movement"; the paper cites Klapoetke et al. 2017 for radial motion opponency):
//   a DOWNWARD-ALIGNMENT signal, the vertical component of the net motion over the vector strength: R_down = sum(dv) / sum(sqrt(dh^2 + dv^2)) over a region, in [-1, 1] (dv > 0 is DOWN: the EMD's vertical map; dh > 0 is RIGHT). An expanding object's edges move down at its bottom and UP at its top, so R_down is about 0; a field of stripes passing DOWN has R_down near +1; a field moving UP gives -1 and is NOT inhibited (the opponency is direction-specific).
//   a unit is INHIBITED (set inactive) when R_down over its region is at least `rho`. scope "global": the region is the whole frame, so one number gates every unit (a pooled downward-motion interneuron); scope "local": the region is the unit's own receptive-field square (rfSide x rfSide, centred on it), so each unit is gated by the downward motion IN ITS FIELD.
// ASSUMPTIONS, said plainly: the form (a hard threshold on a normalised vertical alignment) and rho = 0.5 are mine, chosen before any result; no paper gives them. It is a design built to answer one question, not a model of a neuron. Pure: no DOM, no clock, no Math.random, no file.
"use strict";
import { createModel, integral, boxSum } from "./flyEmdLplc2Gf.mjs";

export const OPP = Object.freeze({ scope: "global", rho: 0.5 });

/** R_down over the box [x0,x1) x [y0,y1) of the maps dh, dv (w x h, row-major): sum(dv) / sum(sqrt(dh^2 + dv^2)); 0 when there is no motion. */
export function downwardAlignment(dh, dv, w, h, x0 = 0, x1 = w, y0 = 0, y1 = h) {
    let sy = 0, t = 0;
    const ax = Math.max(0, Math.round(x0)), bx = Math.min(w, Math.round(x1)), ay = Math.max(0, Math.round(y0)), by = Math.min(h, Math.round(y1));
    for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) { const i = y * w + x; sy += dv[i]; t += Math.hypot(dh[i], dv[i]); }
    return t > 0 ? sy / t : 0;
}

/**
 * Gate a frame's active units. `active` (0/1 per unit), `units` ([{x, y}]), the maps dh, dv, the frame size, opts { scope, rho, rfSide (100) }.
 * Returns { active: new 0/1 array, nAct, R: the global alignment (scope global) or null, suppressed: the number of units inhibited }.
 */
export function gateUnits(active, units, dh, dv, w, h, { scope = OPP.scope, rho = OPP.rho, rfSide = 100 } = {}) {
    if (scope !== "global" && scope !== "local") throw new Error(`oppLoom.gateUnits: scope is global or local, got ${JSON.stringify(scope)}`);
    if (!(rho > 0 && rho <= 1)) throw new Error(`oppLoom.gateUnits: 0 < rho <= 1, got ${rho}`);
    const out = new Uint8Array(active.length); let nAct = 0, suppressed = 0, R = null;
    if (scope === "global") {
        R = downwardAlignment(dh, dv, w, h);
        for (let k = 0; k < active.length; k++) if (active[k]) { if (R >= rho) suppressed++; else { out[k] = 1; nAct++; } }
    } else {
        const sp = new Float64Array(w * h); for (let i = 0; i < sp.length; i++) sp[i] = Math.hypot(dh[i], dv[i]);
        const Iv = integral(dv, w, h), Is = integral(sp, w, h), hs = rfSide / 2;
        for (let k = 0; k < active.length; k++) if (active[k]) {
            const u = units[k], t = boxSum(Is, w, h, u.x - hs, u.x + hs, u.y - hs, u.y + hs), r = t > 0 ? boxSum(Iv, w, h, u.x - hs, u.x + hs, u.y - hs, u.y + hs) / t : 0;
            if (r >= rho) suppressed++; else { out[k] = 1; nAct++; }
        }
    }
    return { active: out, nAct, R, suppressed };
}

/** The wrapped model: createModel's units, gated per frame. step(frame) -> { nAct (after the gate), nActRaw, active, R, suppressed }. `params` go to createModel, `opp` to gateUnits. */
export function createOppModel({ w, h, units = null, params = {}, opp = {} }) {
    const base = createModel({ w, h, units, params, keepMaps: true }), P = base.params;
    return {
        params: P, units: base.units,
        reset() { base.reset(); },
        step(frame) {
            const r = base.step(frame);
            if (!r.maps) return { nAct: 0, nActRaw: 0, active: r.active, R: null, suppressed: 0 };
            const g = gateUnits(r.active, base.units, r.maps.dh, r.maps.dv, w, h, { rfSide: P.rfSide, ...opp });
            return { nAct: g.nAct, nActRaw: r.nAct, active: g.active, R: g.R, suppressed: g.suppressed };
        },
    };
}

/** Run frames through the gated model and the Giant Fiber of flyEmdLplc2Gf (imported lazily to keep this file's imports plain): { nAct, nActRaw, Rs }. The Giant Fiber is left to the caller (gfSimulate(nAct)). */
export function runOpp(frames, { w, h, units = null, params = {}, opp = {} } = {}) {
    const m = createOppModel({ w: w || frames[0].w, h: h || frames[0].h, units, params, opp }), nAct = [], nActRaw = [], Rs = [];
    for (const f of frames) { const r = m.step(f); nAct.push(r.nAct); nActRaw.push(r.nActRaw); Rs.push(r.R); }
    return { nAct, nActRaw, Rs };
}
