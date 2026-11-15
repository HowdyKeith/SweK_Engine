// WebGLEngine/brain/crabMlg1.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is brain/crabMlg1-selfcheck.mjs; the round note is brain/STEALTH_ROUNDS_WIP.md, Round 4)
//
// THE CRAB NEOHELICE'S LOOMING-LOCATION NEURONS AS A NETWORK, from Luan, Fu, Zhang, Hua, Chen and Yue 2022, "A Looming Spatial Localization Neural Network Inspired by MLG1 Neurons in the Crab Neohelice", Frontiers in Neuroscience 15:787256 (Section 3, equations 1 to 22, Table 1).
// The crab's 16 monostratified lobula giant type-1 neurons (MLG1) are spread along the lobula and map the 360 degrees of azimuth; each has a receptive field of about 118 degrees and so overlaps its neighbours. The model divides a PANORAMIC image into 16 equal segments (each a field of 37.5 degrees, 15 degrees shared with each neighbour, the central 7.5 degrees its own) and runs the SAME partial neural network (PNN) on each:
//   photoreceptor     P(t) = sum_i a_i P(t - i) + L(t) - L(t - 1)                     (eq. 1, 2: N_p = 1 persistence, a_i = 1/(1 + e^(mu i)))
//   excitation        E = P (eq. 3);   inhibition  I(t) = P(t - 1) convolved with the neighbour kernel W_i (eq. 4, 5);   summation  S = E + W_I I (eq. 6: the paper prints a plus; lateral inhibition is meant to SUBTRACT and is implemented so, see below)
//   grouping          Ce = the 3 x 3 mean of S (eq. 7, 8);  G~ = S Ce / omega with omega = dc + max|Ce| / C_w (eq. 9, 10);  G = G~ if G~ >= T_g else 0 (eq. 11): an extended edge (a cluster) passes and isolated noise does not
//   MLG1 cell         m(t) = sum |G| (eq. 12), M(t) = 1 / (1 + exp(-c(t) m(t) / n_cell)) (eq. 13), with c(t) an ADAPTIVE coefficient that grows while m is rising and decays otherwise (eq. 14 to 16: the spike-frequency-adaptation stage that favours approach over recession)
//   feed-forward inhibition   F(t) = sum_j a_j F(t - j) + (sum |P(t - 1)|) / n_cell (eq. 17: a GLOBAL scene-change signal) against the adaptive threshold T_FFI(t) = T_F0 + a_ffi T_FFI(t - 1) (eq. 18); a spike S = 1 when M >= T_s and F < T_FFI (eq. 19), so a whole-scene movement silences the cell
//   collision alarm   C_j = 1 when n_sp successive frames spike (eq. 20)
//   winner-take-all   the FIRST MLG1 to give an alarm names the location (a hidden unit h_j inhibits the others, eq. 21, 22); two neighbours alarming together name the point between them. LSL = the winning segment (the output).
// WHAT THE PAPER REPORTS (checked as properties): the segment nearest the approach direction wins and an approach 5 degrees off the course changes the answer by at most one segment; larger, faster and higher-contrast objects excite earlier; a receding object does not alarm; a changing background (a rotation) is suppressed by the FFI; spike-frequency adaptation favours approaching over receding.
// ASSUMPTIONS WHERE THE PAPER IS SILENT OR AMBIGUOUS, each changing behaviour (stated in the note): mu (eq. 2) is 0 (a_1 = 0.5); the FFI persistence a_1 is 0.5; n_cell is the number of pixels of the segment; luminance is 0 to 255 (T_g 30 and T_FF0 15 mean that); the sign of the lateral inhibition is NEGATIVE (the paper's eq. 6 prints +); m(t) sums |G| (thresholded) not |G~| as eq. 12 prints; the alarm needs n_sp successive spikes (n_sp = 4, Table 1 says 4 to 5); the winner-take-all weights alpha_i are not used (the first alarm wins; simultaneous alarms in adjacent segments give the point between them).
// NOT THE AUTHORS' CODE (not seen). The paper's experiments (a panoramic camera on a desk, a robot ball) are not reproduced: synthetic panoramic stimuli stand in. Pure: no DOM, no clock, no Math.random, no file.
"use strict";

/** Table 1 and the Methods, with the assumptions above. Times in seconds; frames at 30 per second. */
export const PARAMS = Object.freeze({
    segments: 16, segmentDeg: 37.5,
    Np: 1, mu: 0, Wi: 0.3, inhibitionSign: -1,
    Cw: 4, dc: 0.01, Tg: 30,
    ci1: 0.5, ci2: 0.3, ca: 0.3, tau: 0.04,
    Ts: 0.7, nsp: 4, Na: 1, aFfi1: 0.5, TF0: 15, aFfi: 0.02,
    mFromThresholded: true, polarity: "both",       // true: m = sum |G| over the pixels that pass T_g (eq. 11; the grouping layer exists to suppress noise); false: sum |G~| over all pixels (eq. 12 as printed)
});

// the lateral inhibition kernel (eq. 5): the 8 neighbours, 1/8 at the corners and 1/4 at the edge midpoints, 0 at the centre
const KI = [1 / 8, 1 / 4, 1 / 8, 1 / 4, 0, 1 / 4, 1 / 8, 1 / 4, 1 / 8];

/** A 3 x 3 convolution of a w x h plane with a kernel of 9 weights (row-major), edges clamped. Returns a new Float32Array. */
export function conv3(src, w, h, k) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let s = 0;
        for (let j = -1; j <= 1; j++) { const yy = Math.min(h - 1, Math.max(0, y + j)); for (let i = -1; i <= 1; i++) { const xx = Math.min(w - 1, Math.max(0, x + i)); s += k[(j + 1) * 3 + (i + 1)] * src[yy * w + xx]; } }
        out[y * w + x] = s;
    }
    return out;
}

/** The columns of the panorama (a strip of `W` pixels covering 360 degrees, azimuth increasing with x) that segment `j` of `n` sees: its centre j x 360/n degrees and its width `segmentDeg`, wrapping around: an array of column indices. */
export function segmentColumns(j, W, { segments = 16, segmentDeg = 37.5 } = {}) {
    const pxPerDeg = W / 360, centre = j * (360 / segments), start = Math.round((centre - segmentDeg / 2) * pxPerDeg), width = Math.max(1, Math.round(segmentDeg * pxPerDeg)), cols = [];
    for (let i = 0; i < width; i++) cols.push((((start + i) % W) + W) % W);
    return cols;
}

/** The azimuth (degrees, 0 to 360) of the centre of segment `j`. */
export const segmentCentre = (j, segments = 16) => (j * (360 / segments)) % 360;

/** Eq. 2: the persistence coefficient a_i = 1 / (1 + e^(mu i)). */
export const persistence = (mu, i) => 1 / (1 + Math.exp(mu * i));

/** Eq. 1 with N_p = 1: P(t) = a_1 P(t - 1) + L(t) - L(t - 1), elementwise (a new Float32Array). */
export function photoreceptor(Pprev, L, Lprev, a1) { const out = new Float32Array(L.length); for (let i = 0; i < out.length; i++) out[i] = a1 * Pprev[i] + L[i] - Lprev[i]; return out; }

/** Eq. 6: S = E + sign W_I I (E = P, eq. 3; I the neighbour-weighted previous P, eq. 4 and 5; `sign` -1 in this implementation, +1 as the paper prints it). */
export function summation(P, I, Wi, sign) { const out = new Float32Array(P.length); for (let i = 0; i < out.length; i++) out[i] = P[i] + sign * Wi * I[i]; return out; }

/** Eq. 7 to 12: the grouping layer and the cell's potential on a w x h plane S: Ce = the 3 x 3 mean (eq. 7, 8); omega = dc + max|Ce| / Cw (eq. 10); G~ = S Ce / omega (eq. 9); G = G~ where G~ >= Tg (eq. 11); m = sum |G~| over all pixels (eq. 12 as printed) or, with `thresholded`, sum |G| over the pixels that pass. `polarity` (NOT in the paper as far as read; an addition, Round 4b): "both" (default) lets every pixel contribute, "off" only the pixels whose summation S is negative (a DARKENING; the expansion of a dark object), "on" only the positive. Returns { m, omega, Ce }. */
export function groupingM(S, w, h, { Cw, dc, Tg, thresholded = false, polarity = "both" }) {
    const Ce = conv3(S, w, h, [1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9]); let mx = 0; for (let i = 0; i < Ce.length; i++) mx = Math.max(mx, Math.abs(Ce[i]));
    const omega = dc + mx / Cw; let m = 0; for (let i = 0; i < S.length; i++) { if (polarity === "off" && !(S[i] < 0)) continue; if (polarity === "on" && !(S[i] > 0)) continue; const g = (S[i] * Ce[i]) / omega; if (thresholded) { if (g >= Tg) m += Math.abs(g); } else m += Math.abs(g); }
    return { m, omega, Ce };
}

/** Eq. 14 to 16: the adaptive coefficient. m' = (m - m1) / tau and m'' = (m + m2 - 2 m1) / tau^2 (m1, m2 the two previous potentials); c grows by c_i1 while m rises with m'' >= 0, by c_i2 while it rises with m'' < 0, and falls by c_a when m does not rise; a coefficient at or below 0 becomes dc. */
export function adaptC(c, m, m1, m2, { ci1, ci2, ca, tau, dc }) {
    const d1 = (m - m1) / tau, d2 = (m + m2 - 2 * m1) / (tau * tau); let n = c;
    if (d1 > 0 && d2 >= 0) n += ci1; else if (d1 > 0 && d2 < 0) n += ci2; else n -= ca;
    return n <= 0 ? dc : n;
}

/** Eq. 13: M = 1 / (1 + exp(-c m / n_cell)). */
export const sigmoidM = (c, m, ncell) => 1 / (1 + Math.exp(-(c * m) / ncell));

/** Eq. 17 and 18 with N_a = 1: F = a_1 F(t - 1) + (sum |P(t - 1)|) / n_cell and T_FFI = T_F0 + a_ffi T_FFI(t - 1). Returns { F, Tffi }. */
export function ffiStep(F, Tffi, absP, ncell, { aFfi1, TF0, aFfi }) { return { F: aFfi1 * F + absP / ncell, Tffi: TF0 + aFfi * Tffi }; }

/** Eq. 19: a spike (1) when M >= T_s and F < T_FFI, else 0. */
export const spikeOf = (M, F, Tffi, Ts) => (M >= Ts && F < Tffi ? 1 : 0);

/** Eq. 20: an alarm (1) when the last `nsp` frames all spiked (a history of 0/1 of at least nsp entries). */
export const alarmOf = (hist, nsp) => (hist.length >= nsp && hist.slice(hist.length - nsp).every((v) => v === 1) ? 1 : 0);

/** Eq. 21 and 22 (the winner-take-all as implemented): given the segments that alarm at the first alarming frame (a list of indices) and the number of segments n, the location in segment units: one segment is itself; several are the circular mean rounded to half a segment (two neighbours name the point between them); none is null. Returns { lsl, winner }. */
export function winnerTakeAll(active, n) {
    if (!active.length) return { lsl: null, winner: null };
    if (active.length === 1) return { lsl: active[0], winner: active[0] };
    let sx = 0, sy = 0; for (const j of active) { sx += Math.cos(2 * Math.PI * j / n); sy += Math.sin(2 * Math.PI * j / n); }
    const mean = ((Math.atan2(sy, sx) / (2 * Math.PI) * n) + n) % n, lsl = Math.round(mean * 2) / 2;
    return { lsl, winner: Math.round(lsl) % n };
}

/**
 * The network. `opts`: { W (the panorama's width in pixels = 360 degrees), H (its height), params (overrides of PARAMS) }. step(frame) takes a frame { w: W, h: H, data: Float32Array } of luminance 0..255 and returns
 * { M (16 sigmoid outputs), spike (16 of 0/1), alarm (16 of 0/1), m (16), F (16), lsl (the winning location in SEGMENT units, possibly x.5 for two neighbours, or null), winner (an integer segment or null), t (frame index) }. reset() restores the rest state.
 */
export function createNetwork({ W, H, params = {} }) {
    const P = { ...PARAMS, ...params }, n = P.segments;
    if (!["both", "off", "on"].includes(P.polarity)) throw new Error(`crabMlg1.createNetwork: polarity is both, off or on, got ${JSON.stringify(P.polarity)}`);
    if (!(W >= n && H >= 3)) throw new Error(`crabMlg1.createNetwork: a panorama at least ${n} x 3 pixels, got ${W} x ${H}`);
    const cols = Array.from({ length: n }, (_, j) => segmentColumns(j, W, P)), sw = cols[0].length, ncell = sw * H;
    const a1 = 1 / (1 + Math.exp(P.mu * 1)), fresh = () => ({ Lprev: null, Pprev: new Float32Array(sw * H), c: P.dc, m1: 0, m2: 0, F: 0, Tffi: P.TF0, hist: [], started: false });
    let st = Array.from({ length: n }, fresh), t = -1, won = false, winnerIdx = null, lslVal = null;
    const step = (frame) => {
        if (frame.w !== W || frame.h !== H) throw new Error(`crabMlg1.step: the frame is ${frame.w} x ${frame.h}, the network ${W} x ${H}`);
        t++;
        const out = { M: new Array(n).fill(0), spike: new Array(n).fill(0), alarm: new Array(n).fill(0), m: new Array(n).fill(0), F: new Array(n).fill(0), c: new Array(n).fill(0), lsl: lslVal, winner: winnerIdx, t };
        for (let j = 0; j < n; j++) {
            const s = st[j], L = new Float32Array(sw * H);
            for (let y = 0; y < H; y++) for (let i = 0; i < sw; i++) L[y * sw + i] = frame.data[y * W + cols[j][i]];
            if (!s.started) { s.Lprev = L; s.started = true; continue; }
            const Pn = photoreceptor(s.Pprev, L, s.Lprev, a1);                                            // eq. 1, 2
            const Iin = conv3(s.Pprev, sw, H, KI), Sg = summation(Pn, Iin, P.Wi, P.inhibitionSign);       // eq. 3 to 6
            const { m } = groupingM(Sg, sw, H, { Cw: P.Cw, dc: P.dc, Tg: P.Tg, thresholded: P.mFromThresholded, polarity: P.polarity });   // eq. 7 to 12
            s.c = adaptC(s.c, m, s.m1, s.m2, P);                                                          // eq. 14 to 16
            const M = sigmoidM(s.c, m, ncell);                                                            // eq. 13
            let absP = 0; for (let i = 0; i < s.Pprev.length; i++) absP += Math.abs(s.Pprev[i]);
            const ff = ffiStep(s.F, s.Tffi, absP, ncell, P); s.F = ff.F; s.Tffi = ff.Tffi;                // eq. 17, 18
            const spike = spikeOf(M, s.F, s.Tffi, P.Ts); s.hist.push(spike); if (s.hist.length > P.nsp) s.hist.shift();   // eq. 19
            const alarm = alarmOf(s.hist, P.nsp);                                                         // eq. 20
            out.M[j] = M; out.spike[j] = spike; out.alarm[j] = alarm; out.m[j] = m; out.F[j] = s.F; out.c[j] = s.c;
            s.m2 = s.m1; s.m1 = m; s.Pprev = Pn; s.Lprev = L;
        }
        // eq. 21, 22: the first frame with an alarm names the location
        if (!won) {
            const act = []; for (let j = 0; j < n; j++) if (out.alarm[j]) act.push(j);
            if (act.length) { won = true; const r = winnerTakeAll(act, n); lslVal = r.lsl; winnerIdx = r.winner; out.lsl = lslVal; out.winner = winnerIdx; }
        }
        return out;
    };
    return { params: P, segments: n, step, reset() { st = Array.from({ length: n }, fresh); t = -1; won = false; winnerIdx = null; lslVal = null; } };
}

/** Run a panoramic frame sequence through the network: { alarmFrame (per segment: the first frame with an alarm, or null), spikeFrame (the first spike frame), lsl, winner, M (per frame, per segment), spikes (per frame), firstAlarm (the earliest alarm frame over segments or null) }. */
export function runPanorama(frames, { params = {} } = {}) {
    const net = createNetwork({ W: frames[0].w, H: frames[0].h, params }), n = net.segments, alarmFrame = new Array(n).fill(null), spikeFrame = new Array(n).fill(null), Ms = [], spikes = [];
    let lsl = null, winner = null;
    frames.forEach((f, k) => { const r = net.step(f); for (let j = 0; j < n; j++) { if (r.alarm[j] && alarmFrame[j] === null) alarmFrame[j] = k; if (r.spike[j] && spikeFrame[j] === null) spikeFrame[j] = k; } Ms.push(r.M); spikes.push(r.spike); if (r.lsl !== null) { lsl = r.lsl; winner = r.winner; } });
    const fa = alarmFrame.filter((v) => v !== null);
    return { alarmFrame, spikeFrame, lsl, winner, M: Ms, spikes, firstAlarm: fa.length ? Math.min(...fa) : null };
}

/**
 * A synthetic panorama of a dark ball APPROACHING from azimuth `az0` degrees (elevation `el0`): an equirectangular strip of W x H pixels covering 360 x `elDeg` degrees, luminance 0..255 with a mid-grey background `bg` and a ball of `fg`, 30 frames per second.
 * The object has half-size `halfSize` (cm) and approaches at constant `speed` (cm/s), so its angular diameter is theta = 2 atan(halfSize / (speed |t|)) (t < 0 before contact; r/v = halfSize / speed), from `th0` to `th1` degrees. `receding` plays it backwards; `drift` (degrees/second) rotates the whole panorama (a moving background);
 * `texture` adds a fixed random luminance texture (grey levels) to the whole scene.
 * Returns { frames, theta (degrees), t (seconds to contact), dist (cm), fps }.
 */
export function approachingBall({ halfSize = 4, speed = 10, az0 = 0, el0 = 0, W = 180, H = 60, elDeg = 120, th0 = 4, th1 = 40, fps = 30, bg = 150, fg = 10, receding = false, drift = 0, texture = 0 } = {}) {
    if (!(halfSize > 0) || !(speed > 0)) throw new Error(`crabMlg1.approachingBall: halfSize and speed are positive, got ${halfSize}, ${speed}`);
    const rv = halfSize / speed, pxPerDegX = W / 360, pxPerDegY = H / elDeg, tStart = -rv / Math.tan(th0 * Math.PI / 360), tEnd = -rv / Math.tan(th1 * Math.PI / 360), frames = [], th = [], tt = [], dd = [];
    const tex = new Float32Array(W * H); for (let i = 0; i < tex.length; i++) tex[i] = (((i * 7919 + 13) % 997) / 997 - 0.5) * 2 * texture;
    for (let k = 0, t = tStart; t <= tEnd + 1e-12; k++, t = tStart + k * (1 / fps)) {
        const theta = 2 * Math.atan(rv / -t) * 180 / Math.PI, f = { w: W, h: H, data: new Float32Array(W * H) }, r = theta / 2 * pxPerDegX, ry = theta / 2 * pxPerDegY, cx = az0 * pxPerDegX, cy = H / 2 - el0 * pxPerDegY, off = Math.round(drift * (t - tStart) * pxPerDegX);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            let dx = x - cx; dx = ((dx + W / 2) % W + W) % W - W / 2;
            const dy = y - cy, rr = Math.sqrt((dx * dx) / (r * r) + (dy * dy) / (ry * ry)), soft = 1 / Math.max(1, Math.min(r, ry)), cover = Math.min(1, Math.max(0, (1 - rr) / soft + 0.5)), xs = (((x - off) % W) + W) % W;   // a one-pixel anti-aliased edge: a real image has no pixel-flip noise
            f.data[y * W + x] = bg * (1 - cover) + fg * cover + tex[y * W + xs];
        }
        frames.push(f); th.push(theta); tt.push(t); dd.push(speed * -t);
    }
    if (receding) { frames.reverse(); th.reverse(); tt.reverse(); dd.reverse(); }
    return { frames, theta: th, t: tt, dist: dd, fps };
}
