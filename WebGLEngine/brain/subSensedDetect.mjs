// WebGLEngine/brain/subSensedDetect.mjs -- UNNUMBERED (the version is chosen at ship time; the registrations are "FOLLOW-UP 8" to "FOLLOW-UP 24" of brain/SENSED_NAV_WIP.md, the gate is brain/subSensedDetect-selfcheck.mjs)
//
// THE GENERAL DETECTOR OF THE SENSED MAP: one cell rule for follow-ups 8 to 58, built twice (follow-ups 8 to 24, then the five optional fields of follow-ups 25 to 58) so that no study edits it.
//   A cell keeps `win` (the last 32 readings as bits, newest lowest; a reading is counted at each ping that ensonifies the cell), `nread` (readings since it was emptied), `ev` (EVIDENCE: the occupied readings since it was last cleared, kept while marked), and, for the gates and the ghost, `rmark` / `rmin` (its range at the ping that marked it / the least range it has read occupied from since it was emptied) and `ghost` (readings of life left).
//   MARK: a free cell is marked when at least m of its last n readings were occupied; `mark` [m, n] beyond `near` metres of the sonar at the ping, `markNear` [m, n] within it (inclusive; null: `mark`). [k, k] is a run of k readings; [1, 1] marks at the first.
//   CLEAR: a marked cell is cleared when at least K = ceil(f L) of its last L readings were free (and it has L readings): L is the HOLD at the cell's range r, `cap` beyond `near` and `capNear` within it (a STEP), or max(1, round(cap (1 - r / sonar range))) (a RAMP); with `evidence` L is min(L, ev), so a cell watched once is held once. f = 1 is L free readings in a row. r is the range `range` says: "ping" (now), "mark" (at the marking) or "min" (the nearest it has read occupied).
//   GHOST: a cell cleared with ev at least `ghost.min` keeps its window and evidence for `ghost.life` readings; in that time a reading of it as occupied marks it again (ev back to ghost.min), at once, or with `nbr` only if one of its eight neighbours was also read occupied at the same ping or was marked when the ping began (so the order the cells are visited in does not matter). A cell cleared without a ghost, or whose ghost ran out, is emptied.
//   FOLLOW-UPS 25 TO 58 add five OPTIONAL fields (a spec without them is the detector of follow-ups 8 to 24, flight for flight): `clear.fNear` (the fraction f within `near` of the sonar at the ping, `clear.f` beyond), `ghost.carry` (a ghost cell marked again by the ORDINARY rule takes its evidence back to ghost.min, so a ghost does something behind a mark of one), `ghost.zone` ("all", "far" or "near": the ghost acts only from that side of `near`) and `ghost.at` ("mark": the zone is the range at the ping that re-marks the cell; "clear": the range at the ping that clears it, a cell cleared from the other zone being emptied), and `lock` { life, below } (a cell cleared with fewer than `below` occupied readings is locked FREE for `life` readings of that cell: an occupied reading in that time is recorded and cannot mark it; a cell that becomes a ghost is not locked).
//   COND: the faults the studies fly under (clean, W, V, R1, R3, D3, D10, D30, WD30, VD30, WD30L, R3D30, P); ARM_DEFS: the detectors by name; an arm is "<detector>@<condition>". flyDetArm flies one.
// Pure. No clock, no Math.random. Imports the flight and the constants from subSensedNav.mjs, which is not edited by a study.
"use strict";
import * as X from "./subSensedNav.mjs";

export const NEAR = 80, CAP = 30, WINDOW = 32, HOLD_MAX = 64;   // WINDOW: the readings a MARK rule may look at; HOLD_MAX: the longest hold, which looks at a second word of 32 older readings (follow-up 61)
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
    need(c && Number.isInteger(c.cap) && c.cap >= 1 && c.cap <= HOLD_MAX && Number.isInteger(c.capNear) && c.capNear >= 1 && c.capNear <= HOLD_MAX, "clear.cap and clear.capNear are whole numbers from 1 to 64");
    need(Number.isFinite(c.f) && c.f > 0 && c.f <= 1, "clear.f is in (0, 1]");
    need(c.fNear === undefined || (Number.isFinite(c.fNear) && c.fNear > 0 && c.fNear <= 1), "clear.fNear is in (0, 1] when given");
    need(c.shape === "step" || c.shape === "ramp", "clear.shape is step or ramp");
    need(["ping", "mark", "min"].includes(c.range), "clear.range is ping, mark or min");
    need(typeof c.evidence === "boolean", "clear.evidence is true or false");
    const g = spec.ghost;
    need(g === null || (!!g && Number.isInteger(g.min) && g.min >= 1 && Number.isInteger(g.life) && g.life >= 1 && g.life <= 255 && typeof g.nbr === "boolean"), "ghost is null or { min, life, nbr }");
    need(!g || g.carry === undefined || typeof g.carry === "boolean", "ghost.carry is true or false when given");
    need(!g || g.zone === undefined || ["all", "far", "near"].includes(g.zone), "ghost.zone is all, far or near when given");
    need(!g || g.at === undefined || ["mark", "clear"].includes(g.at), "ghost.at is mark or clear when given");
    const lk = spec.lock === undefined ? null : spec.lock;
    need(lk === null || (!!lk && Number.isInteger(lk.life) && lk.life >= 1 && lk.life <= 255 && Number.isInteger(lk.below) && lk.below >= 1), "lock is null or { life, below }");
    const zone = g && g.zone ? g.zone : "all", at = g && g.at ? g.at : "mark", carry = !!(g && g.carry);
    const inZone = (d) => zone === "all" || (zone === "far" ? d > spec.near : d <= spec.near);
    const okMark = (d) => at === "clear" || inZone(d), okClear = (d) => at === "mark" || inZone(d);
    const holdAt = (r) => (c.shape === "ramp" ? Math.max(1, Math.round(c.cap * (1 - Math.min(r, sonarRange) / sonarRange))) : r <= spec.near ? c.capNear : c.cap);
    const state = (map) => {
        if (map.dt) return map.dt;
        const n = map.occ.length;
        return (map.dt = { occ0: new Uint8Array(n), win: new Uint32Array(n), win2: new Uint32Array(n), nread: new Uint8Array(n), ev: new Uint8Array(n), rmark: new Float32Array(n), rmin: new Float32Array(n).fill(Infinity), ghost: new Uint8Array(n), lock: new Uint8Array(n), hitAt: new Uint32Array(n), pid: 0, pend: [], marks: 0, clears: 0, ghostMarks: 0, ghostRefused: 0, lockRefused: 0 });
    };
    const empty = (S, i) => { S.win[i] = 0; S.win2[i] = 0; S.nread[i] = 0; S.ev[i] = 0; S.rmark[i] = 0; S.rmin[i] = Infinity; S.ghost[i] = 0; };
    const mark = (map, S, i, ev, d) => { map.occ[i] = 1; map.nOcc++; S.ev[i] = ev; S.rmark[i] = d; S.ghost[i] = 0; S.marks++; };
    return Object.freeze({
        spec,
        begin(map) { const S = state(map); S.pid++; S.pend.length = 0; if (g && g.nbr) S.occ0.set(map.occ); },
        apply(map, ctx) {
            const S = state(map), i = ctx.i, hit = !!ctx.hit, d = ctx.d, wasGhost = S.ghost[i] > 0, locked = S.lock[i] > 0;
            if (wasGhost) S.ghost[i]--;
            if (locked) S.lock[i]--;
            S.win2[i] = ((S.win2[i] << 1) | (S.win[i] >>> 31)) >>> 0;   // the reading that leaves the first word (the 33rd newest) enters the second
            S.win[i] = ((S.win[i] << 1) | (hit ? 1 : 0)) >>> 0;
            if (S.nread[i] < 255) S.nread[i]++;
            if (hit) { S.hitAt[i] = S.pid; if (d < S.rmin[i]) S.rmin[i] = d; }
            if (!map.occ[i]) {
                const rule = spec.markNear && d <= spec.near ? spec.markNear : spec.mark, cnt = popcnt(S.win[i] & maskOf(rule[1]));
                if (cnt >= rule[0]) {
                    if (locked) S.lockRefused++;
                    else {
                        const carried = carry && wasGhost && okMark(d) && cnt < g.min;
                        mark(map, S, i, carried ? g.min : cnt, d);
                        if (carried) S.ghostMarks++;
                        return 1;
                    }
                }
                if (wasGhost && hit && okMark(d)) {
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
            const fx = c.fNear !== undefined && d <= spec.near ? c.fNear : c.f, K = fx >= 1 ? L : Math.ceil(fx * L - 1e-9);
            if (L - popcnt(S.win[i] & maskOf(L)) - (L > WINDOW ? popcnt(S.win2[i] & maskOf(L - WINDOW)) : 0) < K) return 0;
            map.occ[i] = 0; map.nOcc--; S.clears++;
            if (g && S.ev[i] >= g.min && okClear(d)) S.ghost[i] = g.life;
            else { const ev = S.ev[i]; empty(S, i); if (lk && ev < lk.below) S.lock[i] = lk.life; }
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
        stats(map) { const S = state(map); return { marks: S.marks, clears: S.clears, ghostMarks: S.ghostMarks, ghostRefused: S.ghostRefused, lockRefused: S.lockRefused }; },
    });
}

// ---- the detectors of follow-ups 8 to 24, by the names the registrations use ----
const clearOf = (cap, capNear = cap, { evidence = false, f = 1, shape = "step", range = "ping", fNear } = {}) => ({ cap, capNear, evidence, f, shape, range, ...(fNear !== undefined ? { fNear } : {}) });
const spec = (mark, clear, { markNear = null, ghost = null, lock, near = NEAR } = {}) => Object.freeze({ mark: Object.freeze(mark), markNear: markNear && Object.freeze(markNear), near, clear: Object.freeze(clear), ghost: ghost && Object.freeze(ghost), ...(lock ? { lock: Object.freeze(lock) } : {}) });
const ONE = clearOf(1), RUN = (k) => [k, k], GH = Object.freeze({ min: 4, life: 60, nbr: false }), GHN = Object.freeze({ min: 4, life: 60, nbr: true });
const GHC = Object.freeze({ min: 4, life: 60, nbr: false, carry: true }), LK = Object.freeze({ life: 8, below: 4 });   // follow-ups 25 to 58: the carry, the lock
const GHZ = (zone, at) => Object.freeze({ min: 4, life: 60, nbr: false, zone, at }), GHCZ = (zone) => Object.freeze({ min: 4, life: 60, nbr: false, carry: true, zone, at: "mark" }), GHNZ = (zone) => Object.freeze({ min: 4, life: 60, nbr: true, zone, at: "mark" });
const RN = (o = {}) => clearOf(CAP, CAP, { evidence: true, shape: "ramp", range: "min", ...o }), RP = (o = {}) => clearOf(CAP, CAP, { evidence: true, shape: "ramp", range: "ping", ...o });   // the ramp hold on the nearest range / on the range now
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
    // follow-ups 25 to 58 (the registrations are in brain/SENSED_NAV_WIP.md; a name appears once here however many studies use it)
    // 25, 26, 28, 30: the range-aware mark with the evidence hold at every range, and the clear confirmed
    rm23f80: spec([2, 3], EV(CAP, { f: 0.8 }), { markNear: RUN(1) }), rm23re30k: spec([2, 3], EVR({ f: 0.8 }), { markNear: RUN(1) }),
    rm22e30: spec(RUN(2), EV(), { markNear: RUN(1) }), rm33e30: spec(RUN(3), EV(), { markNear: RUN(1) }), rm24e30: spec([2, 4], EV(), { markNear: RUN(1) }), rm34e30: spec([3, 4], EV(), { markNear: RUN(1) }),
    n22f34e30: spec([3, 4], EV(), { markNear: RUN(2) }), n23f34e30: spec([3, 4], EV(), { markNear: [2, 3] }), rm34e30g: spec([3, 4], EV(), { markNear: RUN(1), ghost: GH }),
    // 27, 34, 43, 48, 52: the confirmed hold by range and shape (mk / mn: the step on the range at the marking / the nearest; rp / rn: the ramp on the range now / the nearest), with the ghost and its zone
    m23mk30k: spec([2, 3], EVR({ f: 0.8, range: "mark" })), m23mn30k: spec([2, 3], EVR({ f: 0.8, range: "min" })), m23rp30k: spec([2, 3], RP({ f: 0.8 })), m23rn30k: spec([2, 3], RN({ f: 0.8 })),
    m23rn30kg: spec([2, 3], RN({ f: 0.8 }), { ghost: GH }), m23rp30kg: spec([2, 3], RP({ f: 0.8 }), { ghost: GH }), m23rn30kgf: spec([2, 3], RN({ f: 0.8 }), { ghost: GHZ("far", "mark") }), m23rn30kgn: spec([2, 3], RN({ f: 0.8 }), { ghost: GHZ("near", "mark") }), m23rn30kgc: spec([2, 3], RN({ f: 0.8 }), { ghost: GHN }),
    m23rn30: spec([2, 3], RN()), m23rn30kn: spec([2, 3], RN({ f: 0.8, fNear: 1 })), m23rn30kf: spec([2, 3], RN({ f: 1, fNear: 0.8 })),
    // 29, 35, 38, 40, 49, 53: the ghost on the confirmed hold (gated / at every range), its zone, its neighbour test, the mark rules
    m23re30kg: spec([2, 3], EVR({ f: 0.8 }), { ghost: GH }), m23e30kg: spec([2, 3], EV(CAP, { f: 0.8 }), { ghost: GH }), m23re30kgf: spec([2, 3], EVR({ f: 0.8 }), { ghost: GHZ("far", "mark") }), m23re30kgn: spec([2, 3], EVR({ f: 0.8 }), { ghost: GHZ("near", "mark") }),
    m23re30kgfc: spec([2, 3], EVR({ f: 0.8 }), { ghost: GHNZ("far") }), m23re30kgc: spec([2, 3], EVR({ f: 0.8 }), { ghost: GHN }),
    m23f80g: spec([2, 3], EV(CAP, { f: 0.8 }), { ghost: GH }), m33f80g: spec(RUN(3), EV(CAP, { f: 0.8 }), { ghost: GH }), m34f80g: spec([3, 4], EV(CAP, { f: 0.8 }), { ghost: GH }), f80g: spec([2, 3], EV(CAP, { f: 0.8 }), { ghost: GH }),
    // 31, 40, 43, 50: the confirmed clear's fraction by range (fn<near>f<far>: 100 is a run, 80 is 0.8)
    fn100f80: spec([2, 3], EV(CAP, { f: 0.8, fNear: 1 })), fn80f100: spec([2, 3], EV(CAP, { f: 1, fNear: 0.8 })), fn100f80g: spec([2, 3], EV(CAP, { f: 0.8, fNear: 1 }), { ghost: GH }), fn80f100g: spec([2, 3], EV(CAP, { f: 1, fNear: 0.8 }), { ghost: GH }),
    // 32, 37, 45, 50, 56, 58: the ramp hold on the nearest range with a mark of one, the carry (c), its zone (cf / cn), the clear confirmed (k), the fraction by range, the lock (l)
    rn30c: spec(RUN(1), RN(), { ghost: GHC }), rp30c: spec(RUN(1), RP(), { ghost: GHC }), rn30cf: spec(RUN(1), RN(), { ghost: GHCZ("far") }), rn30cn: spec(RUN(1), RN(), { ghost: GHCZ("near") }),
    rn30k: spec(RUN(1), RN({ f: 0.8 })), rn30ck: spec(RUN(1), RN({ f: 0.8 }), { ghost: GHC }), rn30cfn100f80: spec(RUN(1), RN({ f: 0.8, fNear: 1 }), { ghost: GHC }), rn30cfn80f100: spec(RUN(1), RN({ f: 1, fNear: 0.8 }), { ghost: GHC }),
    rn30cl: spec(RUN(1), RN(), { ghost: GHC, lock: LK }), rn30cfn100f80l: spec(RUN(1), RN({ f: 0.8, fNear: 1 }), { ghost: GHC, lock: LK }), rn30l: spec(RUN(1), RN(), { lock: LK }), rn30cfl: spec(RUN(1), RN(), { ghost: GHCZ("far"), lock: LK }),
    // (r3e30 and r3re30 are follow-up 33's names for cre30 and follow-up 19's crre30)
    // 33, 44, 47, 51, 55, 57: the plain run (three in a row beyond 80 m, a first reading within) with the evidence hold at every range (cre30) or gated (crre30), the clear confirmed (k), the ghost (g), its zone, the lock (l)
    cre30: spec(RUN(3), EV(), { markNear: RUN(1) }), r3e30: spec(RUN(3), EV(), { markNear: RUN(1) }), r3re30: spec(RUN(3), EVR(), { markNear: RUN(1) }), crre30k: spec(RUN(3), EVR({ f: 0.8 }), { markNear: RUN(1) }), crre30g: spec(RUN(3), EVR(), { markNear: RUN(1), ghost: GH }), cre30g: spec(RUN(3), EV(), { markNear: RUN(1), ghost: GH }),
    crre30kg: spec(RUN(3), EVR({ f: 0.8 }), { markNear: RUN(1), ghost: GH }), cre30kg: spec(RUN(3), EV(CAP, { f: 0.8 }), { markNear: RUN(1), ghost: GH }), rm23re30kg: spec([2, 3], EVR({ f: 0.8 }), { markNear: RUN(1), ghost: GH }),
    crre30gf: spec(RUN(3), EVR(), { markNear: RUN(1), ghost: GHZ("far", "clear") }), crre30gn: spec(RUN(3), EVR(), { markNear: RUN(1), ghost: GHZ("near", "clear") }), rm23re30gf: spec([2, 3], EVR(), { markNear: RUN(1), ghost: GHZ("far", "clear") }),
    crre30kl: spec(RUN(3), EVR({ f: 0.8 }), { markNear: RUN(1), lock: LK }), crre30kgl: spec(RUN(3), EVR({ f: 0.8 }), { markNear: RUN(1), ghost: GH, lock: LK }), rm23re30kgl: spec([2, 3], EVR({ f: 0.8 }), { markNear: RUN(1), ghost: GH, lock: LK }),
    // 36: the range-aware 2-of-3 mark with the plain lock by range and shape (mn: the step on the nearest range; rp / rn: the ramp on the range now / the nearest)
    rm23lkmn: spec([2, 3], clearOf(1, CAP, { range: "min" }), { markNear: RUN(1) }), rm23lkrp: spec([2, 3], clearOf(CAP, CAP, { shape: "ramp", range: "ping" }), { markNear: RUN(1) }), rm23lkrn: spec([2, 3], clearOf(CAP, CAP, { shape: "ramp", range: "min" }), { markNear: RUN(1) }),
    // 39, 42, 46, 41, 54: the range-aware mark rules with the clear confirmed, the ghost, its zone judged at the clearing ping, the lock
    rm22f80: spec(RUN(2), EV(CAP, { f: 0.8 }), { markNear: RUN(1) }), rm33f80: spec(RUN(3), EV(CAP, { f: 0.8 }), { markNear: RUN(1) }), rm34f80: spec([3, 4], EV(CAP, { f: 0.8 }), { markNear: RUN(1) }),
    rm34f80g: spec([3, 4], EV(CAP, { f: 0.8 }), { markNear: RUN(1), ghost: GH }), rm23f80g: spec([2, 3], EV(CAP, { f: 0.8 }), { markNear: RUN(1), ghost: GH }),
    rm34f80l: spec([3, 4], EV(CAP, { f: 0.8 }), { markNear: RUN(1), lock: LK }), rm34f80gl: spec([3, 4], EV(CAP, { f: 0.8 }), { markNear: RUN(1), ghost: GH, lock: LK }), rm23f80gl: spec([2, 3], EV(CAP, { f: 0.8 }), { markNear: RUN(1), ghost: GH, lock: LK }),
    rm23e30gf: spec([2, 3], EV(), { markNear: RUN(1), ghost: GHZ("far", "clear") }), rm23e30gn: spec([2, 3], EV(), { markNear: RUN(1), ghost: GHZ("near", "clear") }),
    rm34e30gf: spec([3, 4], EV(), { markNear: RUN(1), ghost: GHZ("far", "clear") }), rm34e30gn: spec([3, 4], EV(), { markNear: RUN(1), ghost: GHZ("near", "clear") }),
    // 61: the sensitivity sweep around two bases, one constant at a time (n: the near radius in metres, c: the cap, f: the fraction beyond the near radius, l: the ghost's life)
    "fn100f80g-n40": spec([2, 3], EV(CAP, { f: 0.8, fNear: 1 }), { ghost: GH, near: 40 }), "fn100f80g-n120": spec([2, 3], EV(CAP, { f: 0.8, fNear: 1 }), { ghost: GH, near: 120 }),
    "fn100f80g-c15": spec([2, 3], EV(15, { f: 0.8, fNear: 1 }), { ghost: GH }), "fn100f80g-c60": spec([2, 3], EV(60, { f: 0.8, fNear: 1 }), { ghost: GH }),
    "fn100f80g-f70": spec([2, 3], EV(CAP, { f: 0.7, fNear: 1 }), { ghost: GH }), "fn100f80g-f90": spec([2, 3], EV(CAP, { f: 0.9, fNear: 1 }), { ghost: GH }),
    "fn100f80g-l20": spec([2, 3], EV(CAP, { f: 0.8, fNear: 1 }), { ghost: Object.freeze({ min: 4, life: 20, nbr: false }) }), "fn100f80g-l180": spec([2, 3], EV(CAP, { f: 0.8, fNear: 1 }), { ghost: Object.freeze({ min: 4, life: 180, nbr: false }) }),
    "m23re30-n40": spec([2, 3], EVR(), { near: 40 }), "m23re30-n120": spec([2, 3], EVR(), { near: 120 }),
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
    return `mark ${s.markNear ? `${m(s.mark)} beyond ${s.near} m, ${m(s.markNear)} within` : m(s.mark)}; clear ${hold}${c.evidence ? " by evidence" : ""}${c.f < 1 || c.fNear !== undefined ? ` f ${c.f}` : ""}${c.fNear !== undefined ? ` (${c.fNear} within ${s.near} m)` : ""} by range ${c.range}${s.ghost ? `; ghost ${s.ghost.min}/${s.ghost.life}${s.ghost.nbr ? " with a neighbour" : ""}${s.ghost.carry ? " carrying" : ""}${s.ghost.zone && s.ghost.zone !== "all" ? ` ${s.ghost.zone} zone at the ${s.ghost.at || "mark"}` : ""}` : ""}${s.lock ? `; lock ${s.lock.life} below ${s.lock.below}` : ""}`;
}
/** Fly one scenario with a detector arm ("<detector>@<condition>"): the 200 m sonar, the white 3 m fix, the map that forgets as the base, the detector's rule on the cells. The record carries the arm's name. */
export function flyDetArm(pilot, sc, arm, opts = {}) {
    const { name, cond } = splitArm(arm);
    return { ...X.flySensed(pilot, sc, X.LONG_ARMS["long+fix+forget"], { ...opts, sonar: X.LONG_SONAR, realism: COND[cond], det: DETECTORS[name] }), arm };
}
/** The flight for any arm the detector studies use: `exact` and the clean `long+fix+forget` by subSensedNav's flyArm, a detector arm by flyDetArm. */
export const flyArm = (pilot, sc, arm, opts = {}) => (arm === "exact" || arm === "long+fix+forget" ? X.flyArm(pilot, sc, arm, opts) : flyDetArm(pilot, sc, arm, opts));
