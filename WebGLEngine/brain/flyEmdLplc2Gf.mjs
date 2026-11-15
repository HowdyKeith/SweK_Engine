// WebGLEngine/brain/flyEmdLplc2Gf.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is brain/flyEmdLplc2Gf-selfcheck.mjs; the round note is brain/STEALTH_ROUNDS_WIP.md, Round 2)
//
// THE FLY'S LOOMING PATH AS A THREE-LAYER MODEL, from Zhao, Xi, Li, Guo and Wu 2023, "A fly inspired solution to looming detection for collision avoidance", iScience 26:106337 (STAR Methods "EMD array", "LPLC2 layer", "GF unit"; equations 1 to 10; Table 1):
//   layer 1  an array of elementary motion detectors (T4 and T5): per pixel a first-order HIGH-PASS filter (tau 250 ms), then two half-wave rectifiers (ON with cutoff 0, OFF with cutoff 0.05), then first-order LOW-PASS filters (tau 50 ms); two mirror-symmetric half-detectors per axis on neighbouring pixels (A then B gives
//            the rightward half H^r = LP(A) x B, the leftward half H^l = A x LP(B); the same down and up), the ON and OFF paths added. Time step 10 ms.
//   layer 2  an array of LPLC2 units, each with a CROSS-shaped receptive field of four arms (right, left, down, up; the arm width one third of the side, the side 100 pixels in the paper's 200 x 150 frame of 118 x 103 degrees): L^r = sum over the right arm of (H^r - H^l), L^l = sum over the left arm of (H^l - H^r), L^d = sum over the down arm of
//            (V^d - V^u), L^u = sum over the up arm of (V^u - V^d) (eq. 1 to 4: motion in the preferred direction excites, in the null direction inhibits, from the lobula plate interneurons), combined MULTIPLICATIVELY (eq. 5): LPLC2 = [L^r - L0]+ [L^l - L0]+ [L^d - L0]+ [L^u - L1]+, so a unit is active only when it sees outward motion in all four arms at once.
//            In closed-loop and real-animal runs L1 is NEGATIVE so that three arms expanding and the fourth only weakly is enough. An ADDITIVE variant (the sum of the four rectified terms) is the paper's control.
//   layer 3  the Giant Fiber, a leaky integrate-and-fire unit (eq. 6): tau_m dV/dt = -V + E_leak + R I, spike at V_th then reset to V_re; its input I = w N_act(t) dN_act/dt (eq. 7 to 9: the number of active LPLC2 units multiplied by its rate of change, so size AND speed), integrated by 4th-order Runge-Kutta in 0.5 ms steps, 20 per 10 ms frame, V never below -80 mV.
// WHAT THE PAPER REPORTS (and the gate checks as properties): a unit stays silent for unidirectional motion (bars, edges, gratings) and for contraction and receding squares, and fires for a looming or expanding square; the active population is unimodal in time; the Giant Fiber's first spike (34 degrees) and peak (55 degrees) come at a CONSISTENT angular size whatever the r/v, set by the receptive-field side
// (a smaller field, a smaller threshold), with the spike time linear in L/v; the multiplicative unit is what makes the selectivity (the additive one answers everything).
// ASSUMPTIONS THIS FILE MAKES WHERE THE PAPER IS SILENT (each changes behaviour and is stated in the note): luminance is 0 to 1 (the OFF cutoff 0.05 only makes sense so); the Giant Fiber's input current uses N_act in THOUSANDS of units and dN/dt in thousands per SECOND (the paper gives no units for N_act dN/dt, and w 5 to 250 gives millivolt-scale input only with these); w and tau_m are
// taken from the middle of the paper's ranges (w 40, tau_m 100 ms: Table 1 gives 5 to 250 and 30 to 300); the central square of the cross belongs to no arm; units are placed at every pixel and a receptive field that leaves the frame sees zeros there. NOT the authors' code (a MATLAB repository exists at github.com/zhaojunyu01/EMD-LPLC2-GF-model; it was not read).
// Pure: no DOM, no clock, no Math.random, no file.
"use strict";

/** Table 1 and the STAR Methods, with the assumptions above. All times in seconds, potentials in millivolts. */
export const PARAMS = Object.freeze({
    step: 0.01, tauHP: 0.25, tauLP: 0.05, cutOn: 0, cutOff: 0.05,
    L0: 2, L1: 2,                 // open-loop (Table 1, superscript a); closed-loop and real animals: L0 1.5, L1 -2
    rfSide: 100,                  // pixels, in a 200 x 150 frame (118 x 103 degrees)
    w: 40, tauM: 0.1, eLeak: -60, vTh: -50, vRe: -70, vMin: -80, R: 1,
    rkStep: 0.0005,
    lumScale: 255,                // input luminance 0..1 is multiplied by this (grey levels 0..255): the paper gives the thresholds L0, L1 = 2 and the OFF cutoff 0.05 without units
    integration: "multiplicative",
    polarity: "both",             // Round 8: "both" (ON and OFF paths, as the paper), "off" (the darkening path only) or "on" (the brightening path only)
    surroundKappa: null,          // Round 3 variant C: null = off; a number kappa inhibits a unit whose RING motion energy exceeds kappa x its arms' outward motion (an assumed strength; Klapoetke 2017 gives the direction only)
    surroundOuter: 1.5,           // the ring runs from the receptive-field side out to this multiple of it
});

const clampPos = (x) => (x > 0 ? x : 0);

/** The four arms of a cross-shaped receptive field of side `side` centred on a unit at (cx, cy): { r, l, d, u } each [x0, x1, y0, y1) in pixel coordinates (half-open), the arm width side/3, the central square excluded. */
export function crossArms(cx, cy, side) {
    const a = side / 3, hs = side / 2, hc = a / 2;
    return {
        r: [cx + hc, cx + hs, cy - hc, cy + hc],
        l: [cx - hs, cx - hc, cy - hc, cy + hc],
        d: [cx - hc, cx + hc, cy + hc, cy + hs],
        u: [cx - hc, cx + hc, cy - hs, cy - hc],
    };
}

/** A summed-area table of `m` (w x h), with a zero border: (w+1) x (h+1) doubles. */
export function integral(m, w, h) {
    const W = w + 1, I = new Float64Array(W * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += m[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row; } }
    return I;
}
/** The sum of the table's matrix over the half-open box [x0, x1) x [y0, y1) in (fractional) pixel coordinates rounded to whole pixels, clipped to the frame (outside is zero). */
export function boxSum(I, w, h, x0, x1, y0, y1) {
    const W = w + 1, ax = Math.max(0, Math.min(w, Math.round(x0))), bx = Math.max(0, Math.min(w, Math.round(x1))), ay = Math.max(0, Math.min(h, Math.round(y0))), by = Math.max(0, Math.min(h, Math.round(y1)));
    if (bx <= ax || by <= ay) return 0;
    return I[by * W + bx] - I[ay * W + bx] - I[by * W + ax] + I[ay * W + ax];
}

/**
 * The model of layers 1 and 2. `opts`: { w, h (the frame size), units (a list of { x, y } unit centres in pixels; default every pixel), params (overrides of PARAMS) }.
 * Returns { step(frame) -> { nAct, active (the units' 0/1, in `units` order), L } , reset() }: frames are { w, h, data: Float32Array } of luminance 0..1, one per 10 ms. The first frame sets the filters' rest state and activates nothing.
 */
export function createModel({ w, h, units = null, params = {}, keepMaps = false }) {
    const P = { ...PARAMS, ...params };
    if (!(w > 3 && h > 3)) throw new Error(`flyEmdLplc2Gf.createModel: a frame at least 4 x 4, got ${w} x ${h}`);
    if (!["both", "off", "on"].includes(P.polarity)) throw new Error(`flyEmdLplc2Gf.createModel: polarity is both, off or on, got ${JSON.stringify(P.polarity)}`);
    if (!["multiplicative", "additive"].includes(P.integration)) throw new Error(`flyEmdLplc2Gf.createModel: integration is multiplicative or additive, got ${JSON.stringify(P.integration)}`);
    const n = w * h, ux = [], uy = [];
    if (units) for (const u of units) { ux.push(u.x); uy.push(u.y); } else for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { ux.push(x); uy.push(y); }
    const aHP = P.tauHP / (P.tauHP + P.step), aLP = P.step / (P.tauLP + P.step);
    let hp = new Float32Array(n), xprev = new Float32Array(n), onLp = new Float32Array(n), offLp = new Float32Array(n), started = false;
    const on = new Float32Array(n), off = new Float32Array(n), dh = new Float64Array(n), dv = new Float64Array(n);
    if (P.surroundKappa !== null && !(P.surroundKappa >= 0 && P.surroundOuter > 1)) throw new Error("flyEmdLplc2Gf.createModel: surroundKappa >= 0 and surroundOuter > 1");
    const arms = ux.map((x, i) => crossArms(x, uy[i], P.rfSide)), surr = P.surroundKappa !== null, ab = new Float64Array(n);
    return {
        params: P, units: ux.map((x, i) => ({ x, y: uy[i] })),
        reset() { hp.fill(0); xprev.fill(0); onLp.fill(0); offLp.fill(0); started = false; },
        step(frame) {
            if (frame.w !== w || frame.h !== h) throw new Error(`flyEmdLplc2Gf.step: the frame is ${frame.w} x ${frame.h}, the model ${w} x ${h}`);
            const x = P.lumScale === 1 ? frame.data : frame.data.map((v) => v * P.lumScale);
            if (!started) { xprev.set(x); started = true; return { nAct: 0, active: new Uint8Array(ux.length), L: null }; }
            for (let i = 0; i < n; i++) {
                hp[i] = aHP * (hp[i] + x[i] - xprev[i]); xprev[i] = x[i];
                on[i] = P.polarity === "off" ? 0 : clampPos(hp[i] - P.cutOn); off[i] = P.polarity === "on" ? 0 : clampPos(-hp[i] - P.cutOff);
            }
            // the half-detectors use the low-pass of the PREVIOUS step as the delayed arm; then the low-pass is updated
            dh.fill(0); dv.fill(0);
            for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
                const i = y * w + xx;
                if (xx < w - 1) { const j = i + 1; const hr = onLp[i] * on[j] + offLp[i] * off[j], hl = on[i] * onLp[j] + off[i] * offLp[j]; dh[i] = hr - hl; }
                if (y < h - 1) { const j = i + w; const vd = onLp[i] * on[j] + offLp[i] * off[j], vu = on[i] * onLp[j] + off[i] * offLp[j]; dv[i] = vd - vu; }
            }
            for (let i = 0; i < n; i++) { onLp[i] += aLP * (on[i] - onLp[i]); offLp[i] += aLP * (off[i] - offLp[i]); }
            const Ih = integral(dh, w, h), Iv = integral(dv, w, h);
            let Ie = null;
            if (surr) { for (let i = 0; i < n; i++) ab[i] = Math.abs(dh[i]) + Math.abs(dv[i]); Ie = integral(ab, w, h); }
            const active = new Uint8Array(ux.length); let nAct = 0;
            for (let k = 0; k < ux.length; k++) {
                const a = arms[k];
                const Lr = boxSum(Ih, w, h, ...a.r), Ll = -boxSum(Ih, w, h, ...a.l), Ld = boxSum(Iv, w, h, ...a.d), Lu = -boxSum(Iv, w, h, ...a.u);
                const v = P.integration === "multiplicative" ? clampPos(Lr - P.L0) * clampPos(Ll - P.L0) * clampPos(Ld - P.L0) * clampPos(Lu - P.L1) : clampPos(Lr - P.L0) + clampPos(Ll - P.L0) + clampPos(Ld - P.L0) + clampPos(Lu - P.L1);
                if (v > 0 && surr) {
                    const hs = P.rfSide / 2, ho = hs * P.surroundOuter, X = ux[k], Y = uy[k];
                    const ring = boxSum(Ie, w, h, X - ho, X + ho, Y - ho, Y + ho) - boxSum(Ie, w, h, X - hs, X + hs, Y - hs, Y + hs);
                    if (ring > P.surroundKappa * (clampPos(Lr) + clampPos(Ll) + clampPos(Ld) + clampPos(Lu))) continue;
                }
                if (v > 0) { active[k] = 1; nAct++; }
            }
            return { nAct, active, L: null, maps: keepMaps ? { dh: Float64Array.from(dh), dv: Float64Array.from(dv) } : null };
        },
    };
}

/** The Giant Fiber's input current per frame (eq. 7 to 9): I(t) = w N_k(t) dN_k/dt with N_k = N_act / 1000 and the derivative (N_k(t) - N_k(t-1)) / step in thousands per second; the first frame has no derivative (I = 0). In millivolts (R = 1). */
export function gfInput(nAct, params = {}) {
    const P = { ...PARAMS, ...params };
    return nAct.map((n, t) => (t === 0 ? 0 : P.w * (n / 1000) * ((n - nAct[t - 1]) / 1000 / P.step)));
}

/**
 * The leaky integrate-and-fire core (eq. 6) driven by a current per frame, held over the frame and integrated by RK4 in `rkStep` steps: tau_m dV/dt = -V + E_leak + R I; V is clamped at `vMin`; at `vTh` a spike is recorded (its time in seconds, at the sub-step) and V resets to `vRe`.
 * Returns { V (the potential at the end of each frame), spikes, vTrace (every sub-step) }.
 */
export function lifRun(current, params = {}) {
    const P = { ...PARAMS, ...params }, sub = Math.round(P.step / P.rkStep), dt = P.rkStep, f = (V, I) => (-V + P.eLeak + P.R * I) / P.tauM;
    let V = P.eLeak; const out = { V: [], spikes: [], vTrace: [] };
    for (let t = 0; t < current.length; t++) {
        const I = current[t];
        for (let s = 0; s < sub; s++) {
            const k1 = f(V, I), k2 = f(V + 0.5 * dt * k1, I), k3 = f(V + 0.5 * dt * k2, I), k4 = f(V + dt * k3, I);
            V += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
            if (V < P.vMin) V = P.vMin;
            if (V >= P.vTh) { out.spikes.push(t * P.step + (s + 1) * dt); V = P.vRe; }
            out.vTrace.push(V);
        }
        out.V.push(V);
    }
    return out;
}

/** The Giant Fiber unit driven by the active-unit counts: lifRun(gfInput(nAct)). Returns { V, spikes, vTrace }. */
export function gfSimulate(nAct, params = {}) { return lifRun(gfInput(nAct, params), params); }

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// STIMULI (the paper's four kinds, as frame sequences at 10 ms)

export function blank(w, h, v = 0.5) { const data = new Float32Array(w * h); data.fill(v); return { w, h, data }; }

/** The side in pixels of a looming square on a planar screen of `w` pixels spanning `fovDeg`: w tan(theta/2) / tan(fov/2) for the subtended horizontal angle theta = 2 atan(rv / |t|). */
export function loomSidePx(rv, t, w = 200, fovDeg = 118) { const th = 2 * Math.atan(rv / -t); return w * Math.tan(th / 2) / Math.tan((fovDeg / 2) * Math.PI / 180); }

/**
 * A square looming on a collision course with half-size to speed ratio `rv` seconds: a frame every `step` seconds from the time its side is `startPx` until it reaches `endPx` (the paper: 6 to 105 pixels in a 200 x 150 frame). `receding` plays the same sequence backwards.
 * `dark` is a black square on mid-grey (else a white one). Returns { frames, t (seconds to collision at each frame, negative), theta (degrees, the subtended horizontal angle), side (pixels) }.
 */
export function loomingSquare({ rv, w = 200, h = 150, fovDeg = 118, startPx = 6, endPx = 105, step = 0.01, dark = true, receding = false, cx = null, cy = null } = {}) {
    if (!(rv > 0)) throw new Error(`flyEmdLplc2Gf.loomingSquare: r/v is a positive number of seconds, got ${rv}`);
    const frames = [], tt = [], th = [], sd = [], X = cx === null ? (w - 1) / 2 : cx, Y = cy === null ? (h - 1) / 2 : cy, tanHalf = Math.tan((fovDeg / 2) * Math.PI / 180);
    // side = w tan(theta/2) / tan(fov/2) with tan(theta/2) = rv / |t|  =>  |t| = rv w / (side tan(fov/2))
    const tStart = -rv * w / (startPx * tanHalf), tEnd = -rv * w / (endPx * tanHalf);
    for (let k = 0, t = tStart; t <= tEnd + 1e-12; k++, t = tStart + k * step) {
        const side = loomSidePx(rv, t, w, fovDeg), f = blank(w, h, 0.5), fg = dark ? 0 : 1, x0 = X - side / 2, x1 = X + side / 2, y0 = Y - side / 2, y1 = Y + side / 2;
        for (let y = 0; y < h; y++) { const cy2 = Math.min(y1, y + 0.5) - Math.max(y0, y - 0.5); if (cy2 <= 0) continue; for (let x = 0; x < w; x++) { const cx2 = Math.min(x1, x + 0.5) - Math.max(x0, x - 0.5); if (cx2 <= 0) continue; const cov = Math.min(1, cx2) * Math.min(1, cy2); f.data[y * w + x] = 0.5 * (1 - cov) + fg * cov; } }
        frames.push(f); tt.push(t); th.push(2 * Math.atan(rv / -t) * 180 / Math.PI); sd.push(side);
    }
    if (receding) { frames.reverse(); tt.reverse(); th.reverse(); sd.reverse(); }
    return { frames, t: tt, theta: th, side: sd };
}

/** A square whose edges move outward at a constant `speed` pixels/second from `startPx` to `endPx` (the paper's second column), `dark` or not. Returns { frames }. */
export function constantEdgeSquare({ speed = 50, w = 200, h = 150, startPx = 6, endPx = 105, step = 0.01, dark = true, inward = false } = {}) {
    const frames = [], X = (w - 1) / 2, Y = (h - 1) / 2, n = Math.max(2, Math.round(((endPx - startPx) / 2) / (speed * step)) + 1);
    for (let k = 0; k < n; k++) { const side = startPx + 2 * speed * step * k, f = blank(w, h, 0.5), fg = dark ? 0 : 1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.abs(x - X) <= side / 2 && Math.abs(y - Y) <= side / 2) f.data[y * w + x] = fg; frames.push(f); }
    if (inward) frames.reverse();
    return { frames };
}

/** A moving bar, edge or grating: `kind` "bar" (a dark bar `bar` pixels wide), "edge" (a dark half-plane) or "grating" (a dark/light square wave of period 2 `bar` pixels), moving `direction` right, left, down or up at `speed` pixels/second for `frames` frames. */
export function translating({ kind = "bar", direction = "right", speed = 50, bar = 20, w = 200, h = 150, frames: nF = 100, step = 0.01 } = {}) {
    if (!["bar", "edge", "grating"].includes(kind) || !["right", "left", "down", "up"].includes(direction)) throw new Error(`flyEmdLplc2Gf.translating: kind bar, edge or grating; direction right, left, down or up; got ${kind}, ${direction}`);
    const horiz = direction === "right" || direction === "left", sign = direction === "right" || direction === "down" ? 1 : -1, len = horiz ? w : h, out = [];
    for (let k = 0; k < nF; k++) {
        const off = sign * speed * step * k, f = blank(w, h, 0.5);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const c = horiz ? x : y;
            let dk;
            if (kind === "bar") dk = Math.abs(c - (len / 2 + off)) < bar / 2;
            else if (kind === "edge") dk = sign > 0 ? c < len / 2 + off : c > len / 2 + off;   // a dark half-plane whose edge moves in `direction`
            else dk = ((((c - off) % (2 * bar)) + 2 * bar) % (2 * bar)) < bar;                 // a square wave drifting in `direction`
            if (dk) f.data[y * w + x] = 0;
        }
        out.push(f);
    }
    return { frames: out };
}

/** A cross of four bars whose ends' edges move `outward` (or inward): the paper's cross motion stimulus (a static 10 pixel square at the centre, four bars growing outward from it). Returns { frames }. */
export function crossMotion({ outward = true, speed = 50, w = 200, h = 150, arm = 10, maxLen = 90, step = 0.01 } = {}) {
    const n = Math.round(maxLen / (speed * step)), X = (w - 1) / 2, Y = (h - 1) / 2, frames = [];
    for (let k = 0; k < n; k++) {
        const len = speed * step * k, f = blank(w, h, 0.5);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dx = Math.abs(x - X), dy = Math.abs(y - Y); if ((dy <= arm / 2 && dx <= arm / 2 + len) || (dx <= arm / 2 && dy <= arm / 2 + len)) f.data[y * w + x] = 0; }
        frames.push(f);
    }
    if (!outward) frames.reverse();
    return { frames };
}

/** Run a stimulus through the model and the Giant Fiber: { nAct, spikes, V, active (the last frame's unit map) }. `units` as createModel. */
export function runStimulus(frames, { w, h, units = null, params = {} } = {}) {
    const m = createModel({ w: w || frames[0].w, h: h || frames[0].h, units, params }), nAct = []; let last = null;
    for (const f of frames) { const r = m.step(f); nAct.push(r.nAct); last = r.active; }
    const gf = gfSimulate(nAct, params);
    return { nAct, spikes: gf.spikes, V: gf.V, vTrace: gf.vTrace, active: last, units: m.units };
}

/**
 * The paper's looming analysis at one r/v: run loomingSquare through the model and report where, in angular size, the population and the Giant Fiber respond:
 * { rv, nPeakIndex, thetaNPeak (degrees when N_act peaks), tNPeak (seconds to collision), firstSpike: { t, theta } or null, firstSpikeTheta, spikes }.
 */
export function loomAnalysis(rv, { params = {}, ...stim } = {}) {
    const s = loomingSquare({ rv, ...stim }), r = runStimulus(s.frames, { params }), k = r.nAct.indexOf(Math.max(...r.nAct));
    const first = r.spikes.length ? r.spikes[0] : null;
    let thetaFirst = null, tFirst = null;
    if (first !== null) { const i = Math.min(s.t.length - 1, Math.floor(first / (params.step || PARAMS.step) + 1e-9)); tFirst = s.t[i]; thetaFirst = s.theta[i]; }
    return { rv, nAct: r.nAct, nPeakIndex: k, thetaNPeak: s.theta[k], tNPeak: s.t[k], spikes: r.spikes, firstSpikeTheta: thetaFirst, firstSpikeT: tFirst, theta: s.theta, t: s.t, V: r.V };
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// THE LATTICE-PLACED VARIANT: LPLC2 units at the MEASURED positions of the cells of vendor/male-cns/giant-fiber-visual-retinotopy.json (male-cns:v1.0; brain/FLY_RETINOTOPY_RF_WIP.md) instead of one unit at every pixel.

/**
 * The model's unit list from the retinotopy file: the LPLC2 cells of one `side` ("R" or "L") placed by their lobula plate centroid (lop.x, lop.y, in the dataset's column lattice units). The lattice's own axes run along the DIAGONALS of the visual field: from the lobula plate layer sub-field offsets
 * (FLY_RETINOTOPY_RF_WIP.md, Part 3: layer 1 front-to-back toward (-1, +1), layer 2 toward (+1, -1), layer 3 up toward (+1, +1), layer 4 down toward (-1, -1)): FRONT is (+1, -1) / sqrt 2 and UP is (+1, +1) / sqrt 2. So with (x0, y0) the mean of the cells' positions,
 azimuth (to the front, degrees) = ((x - x0) - (y - y0)) / sqrt 2 x degPerColumn and elevation (up) = ((x - x0) + (y - y0)) / sqrt 2 x degPerColumn; the pixel is (cx + azimuth / degPerPixel, cy - elevation / degPerPixel) in a frame of frameW x frameH (the image's +x is toward the FRONT, +y down).
 ASSUMPTIONS, each said in the note: degPerColumn 5 (one lattice column is one ommatidium of about 5 degrees: from memory, not verified here); the sign convention of the two axes (the data fix which lattice direction is front and which is up only through the nominal layer names); a unit whose centre falls outside the frame is dropped.
 Returns { units: [{ x, y, bodyId, azimuth, elevation }], center: { x0, y0 }, dropped }.
 */
export function latticeUnits(retino, { side = "R", degPerColumn = 5, degPerPixel = 118 / 200, frameW = 200, frameH = 150 } = {}) {
    const cells = (retino && retino.cells || []).filter((c) => c.type === "LPLC2" && c.side === side && c.lop && Number.isFinite(c.lop.x) && Number.isFinite(c.lop.y));
    if (!cells.length) throw new Error(`flyEmdLplc2Gf.latticeUnits: no LPLC2 cells with a lobula plate position on side ${side}`);
    const x0 = cells.reduce((a, c) => a + c.lop.x, 0) / cells.length, y0 = cells.reduce((a, c) => a + c.lop.y, 0) / cells.length, r2 = Math.SQRT1_2, units = []; let dropped = 0;
    for (const c of cells) {
        const dx = c.lop.x - x0, dy = c.lop.y - y0, az = (dx - dy) * r2 * degPerColumn, el = (dx + dy) * r2 * degPerColumn, px = (frameW - 1) / 2 + az / degPerPixel, py = (frameH - 1) / 2 - el / degPerPixel;
        if (px < 0 || px > frameW - 1 || py < 0 || py > frameH - 1) { dropped++; continue; }
        units.push({ x: px, y: py, bodyId: c.bodyId, azimuth: az, elevation: el });
    }
    return { units, center: { x0, y0 }, dropped };
}

/** The mean position of the units that are active (a 0/1 list in `units` order): { x, y, n } or null when none is. This is the model's looming-direction readout (the centre of the active population points at the focus of expansion). */
export function populationCentroid(units, active) {
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < units.length; i++) if (active[i]) { sx += units[i].x; sy += units[i].y; n++; }
    return n ? { x: sx / n, y: sy / n, n } : null;
}

/**
 * Run a stimulus with the units at `units` (e.g. latticeUnits(...).units) and the Giant Fiber driven by the active count SCALED to the pixel-array equivalent: N_eff = N_act x (frame pixels / units), so that w and tau_m mean what they mean for the one-unit-per-pixel array of the paper.
 * Returns { nAct, nEff, spikes, V, activeFrames (each frame's 0/1 map), centroids (each frame's population centroid or null), units }.
 */
export function runLattice(frames, units, { params = {} } = {}) {
    const w = frames[0].w, h = frames[0].h, m = createModel({ w, h, units, params }), nAct = [], activeFrames = [], centroids = [], scale = (w * h) / units.length;
    for (const f of frames) { const r = m.step(f); nAct.push(r.nAct); activeFrames.push(r.active); centroids.push(populationCentroid(m.units, r.active)); }
    const nEff = nAct.map((v) => v * scale), gf = gfSimulate(nEff, params);
    return { nAct, nEff, spikes: gf.spikes, V: gf.V, activeFrames, centroids, units: m.units };
}
