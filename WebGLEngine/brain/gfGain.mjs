// WebGLEngine/brain/gfGain.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is brain/gfGain-selfcheck.mjs; the round note is brain/STEALTH_ROUNDS_WIP.md, Round 18)
//
// AN OUTPUT-STAGE DIVISIVE GAIN ON THE GIANT FIBER'S INPUT. Round 17 found that the unit-level downward gain (Round 16) adds Giant Fiber spikes to STATIC stripes because it changes the active count N in time and the Giant Fiber's current is w N dN/dt. Here N is the UNTOUCHED count of brain/flyEmdLplc2Gf.mjs and the gain divides the CURRENT:
//   I(t) = gfInput(N)(t) / (1 + g D~(t)),  D(t) = max(0, sum over the frame of dv) / (w h)  (the absolute net DOWNWARD drift: dv > 0 is down), D~ = D low-passed with time constant tauD seconds (D~ = D for tauD 0): D~(t) = D~(t-1) + (step / tauD)(D(t) - D~(t-1)), D~(0) = 0 (first frame, no maps).
// Round 19 option normalize "contrast": D is divided by C2 + 1e-9, C2 the spatial variance of the frame's luminance (x lumScale), so D^ is independent of the luminance scale and of the contrast.
// One factor for one Giant Fiber, so the form is global by construction. ASSUMPTIONS, said plainly: the form, tauD and g are mine (no paper gives them); a symmetric expansion has D about 0, a field passing UP has D = 0, so the gain is direction-specific. Pure: no DOM, no clock, no Math.random, no file.
"use strict";
import { createModel, gfInput, lifRun } from "./flyEmdLplc2Gf.mjs";

/** The absolute net downward drift of a vertical-motion map: max(0, sum dv) / (w h). */
export function downDrift(dv, w, h) { let s = 0; for (let i = 0; i < dv.length; i++) s += dv[i]; return Math.max(0, s) / (w * h); }

/** D~ from a series D by the first-order low-pass with time constant tauD (seconds) at frame step `step`; tauD 0 returns a copy. */
export function smoothDrift(D, tauD, step = 0.01) {
    if (!(tauD >= 0)) throw new Error(`gfGain.smoothDrift: tauD is a number at least 0, got ${tauD}`);
    if (tauD === 0) return D.slice();
    const out = new Array(D.length); let d = 0; for (let t = 0; t < D.length; t++) { d += (step / tauD) * (D[t] - d); out[t] = d; } return out;
}

/** The gained current: gfInput(nAct)[t] / (1 + g Dsmooth[t]). g at least 0. */
export function gainedCurrent(nAct, Dsmooth, g, params = {}) {
    if (!(g >= 0)) throw new Error(`gfGain.gainedCurrent: g is a number at least 0, got ${g}`);
    if (Dsmooth.length !== nAct.length) throw new Error(`gfGain.gainedCurrent: D has ${Dsmooth.length} entries, N ${nAct.length}`);
    return gfInput(nAct, params).map((I, t) => I / (1 + g * Dsmooth[t]));
}

/** The spatial variance of a frame's luminance after multiplication by lumScale (the contrast energy C2 of Round 19): mean((x l)^2) - mean(x l)^2, in squared grey levels. */
export function frameContrastSq(data, lumScale = 255) {
    let s = 0, s2 = 0; const n = data.length; for (let i = 0; i < n; i++) { const v = data[i] * lumScale; s += v; s2 += v * v; }
    return Math.max(0, s2 / n - (s / n) * (s / n));
}

/** Run frames through the array and the gained Giant Fiber: { nAct, D, Dsmooth, current, spikes, V }. opts { w, h, params (to the array), g, tauD }. */
export function runGained(frames, { w, h, params = {}, g = 0, tauD = 0, normalize = "none" } = {}) {
    if (normalize !== "none" && normalize !== "contrast") throw new Error(`gfGain.runGained: normalize is none or contrast, got ${JSON.stringify(normalize)}`);
    const W = w || frames[0].w, H = h || frames[0].h, m = createModel({ w: W, h: H, params, keepMaps: true }), nAct = [], D = [], ls = (params.lumScale === undefined ? 255 : params.lumScale);
    for (const f of frames) { const r = m.step(f); nAct.push(r.nAct); let d = r.maps ? downDrift(r.maps.dv, W, H) : 0; if (normalize === "contrast") d = d / (frameContrastSq(f.data, ls) + 1e-9); D.push(d); }
    const Ds = smoothDrift(D, tauD, m.params.step), current = gainedCurrent(nAct, Ds, g, params), gf = lifRun(current, params);
    return { nAct, D, Dsmooth: Ds, current, spikes: gf.spikes, V: gf.V };
}
