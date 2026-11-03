// WebGLEngine/brain/subSensedDetect.mjs -- UNNUMBERED (the version is chosen at ship time; the registrations are "FOLLOW-UP 8" to "FOLLOW-UP 24" of brain/SENSED_NAV_WIP.md, the gate is brain/subSensedDetect-selfcheck.mjs)
//
// THE GENERAL DETECTOR OF THE SENSED MAP: one cell rule for follow-ups 8 to 24, built once so that no later study edits it.
//   A cell keeps `win` (the last 32 readings as bits, newest lowest; a reading is counted at each ping that ensonifies the cell), `nread` (readings since it was emptied), `ev` (EVIDENCE: the occupied readings since it was last cleared, kept while marked), and, for the gates and the ghost, `rmark` / `rmin` (its range at the ping that marked it / the least range it has read occupied from since it was emptied) and `ghost` (readings of life left).
//   MARK: a free cell is marked when at least m of its last n readings were occupied; `mark` [m, n] beyond `near` metres of the sonar at the ping, `markNear` [m, n] within it (inclusive; null: `mark`). [k, k] is a run of k readings; [1, 1] marks at the first.
//   CLEAR: a marked cell is cleared when at least K = ceil(f L) of its last L readings were free (and it has L readings): L is the HOLD at the cell's range r, `cap` beyond `near` and `capNear` within it (a STEP), or max(1, round(cap (1 - r / sonar range))) (a RAMP); with `evidence` L is min(L, ev), so a cell watched once is held once. f = 1 is L free readings in a row. r is the range `range` says: "ping" (now), "mark" (at the marking) or "min" (the nearest it has read occupied).
//   GHOST: a cell cleared with ev at least `ghost.min` keeps its window and evidence for `ghost.life` readings; in that time a reading of it as occupied marks it again (ev back to ghost.min), at once, or with `nbr` only if one of its eight neighbours was also read occupied at the same ping or was marked when the ping began (so the order the cells are visited in does not matter). A cell cleared without a ghost, or whose ghost ran out, is emptied.
//   COND: the faults the studies fly under (clean, W, V, R1, R3, D3, D10, D30, WD30, VD30, WD30L, R3D30, P); ARM_DEFS: the detectors by name; an arm is "<detector>@<condition>". flyDetArm flies one.
// Pure. No clock, no Math.random. Imports the flight and the constants from subSensedNav.mjs, which is not edited by a study.
"use strict";
import * as X from "./subSensedNav.mjs";

export const NEAR = 80, CAP = 30, WINDOW = 32;
const popcnt = (v) => { let c = 0; v >>>= 0; while (v) { v &= v - 1; c++; } return c; };
const maskOf = (n) => (n >= 32 ? 0xffffffff : ((1 << n) - 1) >>> 0);

/** The rate-free faults of the studies, by name. A condition is the `realism` object flySensed takes (null: none). */
const WHITE = X.REALISM.all;   // misses 0.2, false returns 0.001, first surfaces only, a white 2 degree heading error
const dropOf = (persist, leak = 0) => Object.freeze({ rate: 0.2, persist, rangeDep: true, ...(leak ? { leak } : {}) });
const W = Object.freeze({ ...WHITE, falseRate: 0.01 }), V = Object.freeze({ ...W, miss: 0.4 });
export const COND = Object.freeze({
    clean: null, W, V,
    R1: Object.freeze({ ...WHITE, falseRate: 0.01, rangeDep: true }), R3: Object.freeze({ ...WHITE, falseRate: 0.03, rangeDep: true }),
    D3: Object.freeze({ drop: dropOf(3) }), D10: Object.freeze({ drop: dropOf(10) }), D30: Object.freeze({ drop: dropOf(30) }),
    WD30: Object.freeze({ ...W, drop: dropOf(30) }), VD30: Object.freeze({ ...V, drop: dropOf(30) }), WD30L: Object.freeze({ ...W, drop: dropOf(30, 0.15) }),
    R3D30: Object.freeze({ ...WHITE, falseRate: 0.03, rangeDep: true, drop: dropOf(30) }), P: X.PERSIST.pall,
});

const need = (ok, msg) => { if (!ok) throw new Error(`subSensedDetect.makeDetector: ${msg}`); };
const ruleOk = (r) => Array.isArray(r) && r.length === 2 && Number.isInteger(r[0]) && Number.isInteger(r[1]) && r[0] >= 1 && r[0] <= r[1] && r[1] <= WINDOW;
/**
 * A detector from `spec` { mark: [m, n], markNear: [m, n] | null, near, clear: { cap, capNear, evidence, f, shape: "step" | "ramp", range: "ping" | "mark" | "min" }, ghost: null | { min, life, nbr } }. Frozen; its state is on the map it is given (map.dt), so one detector serves any number of flights.
 * The object flySensed's ping calls: begin(map), apply(map, { i, gx, gy, hit, d }) -> 0 | 1, end(map) -> number changed, stats(map) -> { marks, clears, ghostMarks, ghostRefused }.
 */
export function makeDetector(spec, sonarRange = X.LONG_SONAR.range) {
    need(spec && ruleOk(spec.mark), "mark is [m, n] with 1 <= m <= n <= 32");
    need(spec.markNear === null || ruleOk(spec.markNear), "markNear is null or [m, n]");
    need(Number.isFinite(spec.near) && spec.near >= 0, "near is a distance in metres");
    const c = spec.clear;
    need(c && Number.isInteger(c.cap) && c.cap >= 1 && c.cap <= 30 && Number.isInteger(c.capNear) && c.capNear >= 1 && c.capNear <= 30, "clear.cap and clear.capNear are whole numbers from 1 to 30");
    need(Number.isFinite(c.f) && c.f > 0 && c.f <= 1, "clear.f is in (0, 1]");
    need(c.shape === "step" || c.shape === "ramp", "clear.shape is step or ramp");
    need(["ping", "mark", "min"].includes(c.range), "clear.range is ping, mark or min");
    need(typeof c.evidence === "boolean", "clear.evidence is true or false");
    const g = spec.ghost;
    need(g === null || (!!g && Number.isInteger(g.min) && g.min >= 1 && Number.isInteger(g.life) && g.life >= 1 && g.life <= 255 && typeof g.nbr === "boolean"), "ghost is null or { min, life, nbr }");
    const holdAt = (r) => (c.shape === "ramp" ? Math.max(1, Math.round(c.cap * (1 - Math.min(r, sonarRange) / sonarRange))) : r <= spec.near ? c.capNear : c.cap);
    const state = (map) => {
        if (map.dt) return map.dt;
        const n = map.occ.length;
        return (map.dt = { occ0: new Uint8Array(n), win: new Uint32Array(n), nread: new Uint8Array(n), ev: new Uint8Array(n), rmark: new Float32Array(n), rmin: new Float32Array(n).fill(Infinity), ghost: new Uint8Array(n), hitAt: new Uint32Array(n), pid: 0, pend: [], marks: 0, clears: 0, ghostMarks: 0, ghostRefused: 0 });
    };
    const empty = (S, i) => { S.win[i] = 0; S.nread[i] = 0; S.ev[i] = 0; S.rmark[i] = 0; S.rmin[i] = Infinity; S.ghost[i] = 0; };
    const mark = (map, S, i, ev, d) => { map.occ[i] = 1; map.nOcc++; S.ev[i] = ev; S.rmark[i] = d; S.ghost[i] = 0; S.marks++; };
    return Object.freeze({
        spec,
        begin(map) { const S = state(map); S.pid++; S.pend.length = 0; if (g && g.nbr) S.occ0.set(map.occ); },
        apply(map, ctx) {
            const S = state(map), i = ctx.i, hit = !!ctx.hit, d = ctx.d, wasGhost = S.ghost[i] > 0;
            if (wasGhost) S.ghost[i]--;
            S.win[i] = ((S.win[i] << 1) | (hit ? 1 : 0)) >>> 0;
            if (S.nread[i] < 255) S.nread[i]++;
            if (hit) { S.hitAt[i] = S.pid; if (d < S.rmin[i]) S.rmin[i] = d; }
            if (!map.occ[i]) {
                const rule = spec.markNear && d <= spec.near ? spec.markNear : spec.mark, cnt = popcnt(S.win[i] & maskOf(rule[1]));
                if (cnt >= rule[0]) { mark(map, S, i, cnt, d); return 1; }
                if (wasGhost && hit) {
                    if (!g.nbr) { mark(map, S, i, g.min, d); S.ghostMarks++; return 1; }
                    S.pend.push(i, ctx.gx, ctx.gy, d);
                    return 0;
                }
                if (wasGhost && S.ghost[i] === 0) empty(S, i);
                return 0;
            }
            if (hit && S.ev[i] < 255) S.ev[i]++;
            const r = c.range === "ping" ? d : c.range === "mark" ? S.rmark[i] : S.rmin[i];
            let L = holdAt(r);
            if (c.evidence) L = Math.min(L, Math.max(1, S.ev[i]));
            if (S.nread[i] < L) return 0;
            const K = c.f >= 1 ? L : Math.ceil(c.f * L - 1e-9);
            if (L - popcnt(S.win[i] & maskOf(L)) < K) return 0;
            map.occ[i] = 0; map.nOcc--; S.clears++;
            if (g && S.ev[i] >= g.min) S.ghost[i] = g.life; else empty(S, i);
            return 1;
        },
        end(map) {
            const S = state(map), p = S.pend;
            if (!p.length) return 0;
            const ok = [];
            for (let k = 0; k < p.length; k += 4) {
                const gx = p[k + 1], gy = p[k + 2];
                let near = false;
                for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy) continue;
                    const x = gx + dx, y = gy + dy;
                    if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
                    const j = y * map.w + x;
                    if (S.hitAt[j] === S.pid || S.occ0[j]) { near = true; break; }
                }
                ok.push(near);
            }
            let changed = 0;
            for (let k = 0, m = 0; k < p.length; k += 4, m++) {
                const i = p[k];
                if (ok[m]) { mark(map, S, i, g.min, p[k + 3]); S.ghostMarks++; changed++; }
                else { S.ghostRefused++; if (S.ghost[i] === 0) empty(S, i); }
            }
            p.length = 0;
            return changed;
        },
        stats(map) { const S = state(map); return { marks: S.marks, clears: S.clears, ghostMarks: S.ghostMarks, ghostRefused: S.ghostRefused }; },
    });
}

// ---- the detectors of follow-ups 8 to 24, by the names the registrations use ----
const clearOf = (cap, capNear = cap, { evidence = false, f = 1, shape = "step", range = "ping" } = {}) => ({ cap, capNear, evidence, f, shape, range });
const spec = (mark, clear, { markNear = null, ghost = null } = {}) => Object.freeze({ mark: Object.freeze(mark), markNear: markNear && Object.freeze(markNear), near: NEAR, clear: Object.freeze(clear), ghost: ghost && Object.freeze(ghost) });
const ONE = clearOf(1), RUN = (k) => [k, k], GH = Object.freeze({ min: 4, life: 60, nbr: false }), GHN = Object.freeze({ min: 4, life: 60, nbr: true });
const EV = (cap = CAP, o = {}) => clearOf(cap, cap, { evidence: true, ...o }), EVR = (o = {}) => clearOf(1, CAP, { evidence: true, ...o });   // the evidence hold at every range / within `near` only
export const ARM_DEFS = Object.freeze({
    // follow-up 7's: a run to mark, a plain hold to clear
    "d1-1": spec(RUN(1), ONE), "d2-1": spec(RUN(2), ONE), "d1-12": spec(RUN(1), clearOf(12)), "d2-3": spec(RUN(2), clearOf(3)), "d2-12": spec(RUN(2), clearOf(12)), "d3-12": spec(RUN(3), clearOf(12)),
    // follow-ups 8, 9, 10: the range-aware run and lock
    inc: spec(RUN(1), ONE), uni: spec(RUN(2), clearOf(12)), lock: spec(RUN(2), clearOf(1, CAP)),
    c2: spec(RUN(2), ONE), c3: spec(RUN(3), ONE), cr: spec(RUN(3), ONE, { markNear: RUN(1) }), rd: spec(RUN(3), clearOf(1, CAP), { markNear: RUN(1) }),
    // follow-up 11: the M-of-N family (the registration names them m1-1 ... m3-4; m23 is the same rule under its later name)
    "m1-1": spec(RUN(1), ONE), "m2-2": spec(RUN(2), ONE), "m3-3": spec(RUN(3), ONE), "m2-3": spec([2, 3], ONE), "m2-4": spec([2, 4], ONE), "m3-4": spec([3, 4], ONE),
    m23: spec([2, 3], ONE),
    // follow-up 12: the hold rule, a mark of one
    h12: spec(RUN(1), clearOf(12)), h30: spec(RUN(1), clearOf(30)), e12: spec(RUN(1), EV(12)), e30: spec(RUN(1), EV()),
    // follow-up 13: the range-gated hold
    n30: spec(RUN(1), clearOf(1, CAP)), re30: spec(RUN(1), EVR()),
    // follow-up 14: the range-aware memory confirmation
    rm23: spec([2, 3], ONE, { markNear: RUN(1) }), rm24: spec([2, 4], ONE, { markNear: RUN(1) }), rm34: spec([3, 4], ONE, { markNear: RUN(1) }),
    // follow-up 15: which range the hold goes by, and its shape
    mk30: spec(RUN(1), EVR({ range: "mark" })), mn30: spec(RUN(1), EVR({ range: "min" })), rp30: spec(RUN(1), clearOf(CAP, CAP, { evidence: true, shape: "ramp" })), rn30: spec(RUN(1), clearOf(CAP, CAP, { evidence: true, shape: "ramp", range: "min" })),
    // follow-ups 16 to 20: the pair of the memory mark and the hold
    m23h30: spec([2, 3], clearOf(30)), m23e30: spec([2, 3], EV()),
    m11e30: spec(RUN(1), EV()), m22e30: spec(RUN(2), EV()), m33e30: spec(RUN(3), EV()), m24e30: spec([2, 4], EV()), m34e30: spec([3, 4], EV()),
    // follow-up 17, 18, 19: both ends range-aware
    rm23re30: spec([2, 3], EVR(), { markNear: RUN(1) }), rm23e30: spec([2, 3], EV(), { markNear: RUN(1) }), rm23re30g: spec([2, 3], EVR(), { markNear: RUN(1), ghost: GH }), rm23e30g: spec([2, 3], EV(), { markNear: RUN(1), ghost: GH }),
    rm23lk: spec([2, 3], clearOf(1, CAP), { markNear: RUN(1) }), crre30: spec(RUN(3), EVR(), { markNear: RUN(1) }),
    // follow-up 21: the confirmed clear (a 2-of-3 mark, the evidence hold at every range, a fraction f of the window free)
    f100: spec([2, 3], EV(CAP, { f: 1 })), f90: spec([2, 3], EV(CAP, { f: 0.9 })), f80: spec([2, 3], EV(CAP, { f: 0.8 })), f60: spec([2, 3], EV(CAP, { f: 0.6 })),
    // follow-up 22: the mark family under the confirmed clear
    m11f80: spec(RUN(1), EV(CAP, { f: 0.8 })), m22f80: spec(RUN(2), EV(CAP, { f: 0.8 })), m33f80: spec(RUN(3), EV(CAP, { f: 0.8 })), m23f80: spec([2, 3], EV(CAP, { f: 0.8 })), m24f80: spec([2, 4], EV(CAP, { f: 0.8 })), m34f80: spec([3, 4], EV(CAP, { f: 0.8 })),
    // follow-up 23: the four stages and each taken out
    full: spec([2, 3], EV(CAP, { f: 0.8 }), { ghost: GHN }), noG: spec([2, 3], EV(CAP, { f: 0.8 })), gU: spec([2, 3], EV(CAP, { f: 0.8 }), { ghost: GH }), noK: spec([2, 3], EV(CAP, { f: 1 }), { ghost: GHN }), noM: spec(RUN(1), EV(CAP, { f: 0.8 }), { ghost: GHN }), noE: spec([2, 3], clearOf(CAP, CAP, { f: 0.8 }), { ghost: GHN }),
    // follow-up 24: the range-gated hold with the clear confirmed
    m23e30k: spec([2, 3], EV(CAP, { f: 0.8 })), m23re30: spec([2, 3], EVR()), m23re30k: spec([2, 3], EVR({ f: 0.8 })),
});
export const DETECTORS = Object.freeze(Object.fromEntries(Object.entries(ARM_DEFS).map(([k, v]) => [k, makeDetector(v)])));

/** "<detector>@<condition>" -> { name, cond }. */
export function splitArm(arm) {
    const k = arm.lastIndexOf("@"), name = arm.slice(0, k), cond = arm.slice(k + 1);
    const own = (o, key) => Object.prototype.hasOwnProperty.call(o, key);
    if (k < 1 || !own(DETECTORS, name) || !own(COND, cond)) throw new Error(`subSensedDetect.splitArm: "${arm}" is not <detector>@<condition> (detectors ${Object.keys(ARM_DEFS).join(", ")}; conditions ${Object.keys(COND).join(", ")})`);
    return { name, cond };
}
/** The text of a detector's rule, for the gate to compare with the registration's words. */
export function describe(name) {
    const s = ARM_DEFS[name]; if (!s) throw new Error(`subSensedDetect.describe: unknown detector "${name}"`);
    const m = (r) => `${r[0]}/${r[1]}`, c = s.clear;
    const hold = c.shape === "ramp" ? `ramp ${c.cap}` : c.cap === c.capNear ? `${c.cap}` : `${c.cap} beyond ${s.near} m, ${c.capNear} within`;
    return `mark ${s.markNear ? `${m(s.mark)} beyond ${s.near} m, ${m(s.markNear)} within` : m(s.mark)}; clear ${hold}${c.evidence ? " by evidence" : ""}${c.f < 1 ? ` f ${c.f}` : ""} by range ${c.range}${s.ghost ? `; ghost ${s.ghost.min}/${s.ghost.life}${s.ghost.nbr ? " with a neighbour" : ""}` : ""}`;
}
/** Fly one scenario with a detector arm ("<detector>@<condition>"): the 200 m sonar, the white 3 m fix, the map that forgets as the base, the detector's rule on the cells. The record carries the arm's name. */
export function flyDetArm(pilot, sc, arm, opts = {}) {
    const { name, cond } = splitArm(arm);
    return { ...X.flySensed(pilot, sc, X.LONG_ARMS["long+fix+forget"], { ...opts, sonar: X.LONG_SONAR, realism: COND[cond], det: DETECTORS[name] }), arm };
}
/** The flight for any arm the detector studies use: `exact` and the clean `long+fix+forget` by subSensedNav's flyArm, a detector arm by flyDetArm. */
export const flyArm = (pilot, sc, arm, opts = {}) => (arm === "exact" || arm === "long+fix+forget" ? X.flyArm(pilot, sc, arm, opts) : flyDetArm(pilot, sc, arm, opts));
