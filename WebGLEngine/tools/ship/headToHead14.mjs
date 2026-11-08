// WebGLEngine/tools/ship/headToHead14.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead14Cmd.mjs; the gate is tools/ship/headToHead14-selfcheck.mjs)
//
// ROUND H14 of brain/HEAD_TO_HEAD.md (registered before this file existed): WHEN DO THE NETWORKS GO FASTER, AND WHAT DRIVES THEIR THRUST? 47 arms (the autopilot, four identity arms, H13's eight constants, six thrust laws scheduled on the heading error, the 28
// networks of H9 flown through a recording kind) flown on the tank's compass dropout (200 fresh ids, dark and lit) by this file's own flight, which scores EXACTLY as switchboard.dropout does (the gate holds it to the board), splits every tick into a TURN, a SCORED or
// an OTHER phase, and (for the networks) adds every tick's 14 features and thrust excess over the autopilot to a regression. Reads nothing from disk (the command hands the weights in). THE IDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as AS from "../../brain/autopilotSub.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as A from "../../render/subAquariumSim.mjs";
import * as H13 from "./headToHead13.mjs";
import * as H9 from "./headToHead9.mjs";

export const IDS = Object.freeze({ from: 14000, to: 14199 }), SECONDS = 160, TICK = 1 / 30, SETTLE = 12;
export const LEARN_MARGIN = 0.02, MIN_EXTRA = 0.1, MATCH = 0.8, BETTER_THAN_CONSTANT = 1.25, R2_LINEAR = 0.5, TURN_BAND = 0.2;
export const C_FACTORS = Object.freeze([0.5, 1, 2, 4]), TURN_OFFSETS = Object.freeze([0.3, 0.6]);
export const SCHED_IDS = Object.freeze(C_FACTORS.map((c) => `sched*${c}`)), TURN_IDS = Object.freeze(TURN_OFFSETS.map((d) => `turn+${d}`));
export const SCHEDULED_IDS = Object.freeze([...SCHED_IDS, ...TURN_IDS]), IDENT_IDS = Object.freeze(["thr+0", "spd*1", "sched*0", "turn+0"]);
export const CONSTANT_IDS = H13.SIMPLE_IDS, NET_IDS = H9.NET_IDS, PHASES = Object.freeze(["turn", "scored", "other"]), FEATURES = PS.FEATURES, FEATURE_NAMES = PS.FEATURE_NAMES;
export const ARM_IDS = Object.freeze(["autopilot", ...IDENT_IDS, ...H13.THR_IDS, ...H13.SPD_IDS, ...SCHEDULED_IDS, ...NET_IDS]);
const TWO_PI = 2 * Math.PI, wrap = (a) => { let x = a % TWO_PI; if (x > Math.PI) x -= TWO_PI; if (x <= -Math.PI) x += TWO_PI; return x; }, clamp = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);

// ---- the recorder: the recording kind adds to it on every tick of a flight that set it
let REC = null, LAST = null;
const newAcc = () => ({ n: 0, xtx: new Array(FEATURES * FEATURES).fill(0), xty: new Array(FEATURES).fill(0), sx: new Array(FEATURES).fill(0), yty: 0, sy: 0 });
function addSample(acc, x, y) {
    for (let i = 0; i < FEATURES; i++) { acc.xty[i] += x[i] * y; acc.sx[i] += x[i]; for (let j = 0; j < FEATURES; j++) acc.xtx[i * FEATURES + j] += x[i] * x[j]; }
    acc.yty += y * y; acc.sy += y; acc.n++;
}
/** Sum accumulators (a list) into one. */
export function mergeAcc(list) { const out = newAcc(); for (const a of list) { out.n += a.n; out.yty += a.yty; out.sy += a.sy; for (let i = 0; i < FEATURES; i++) { out.xty[i] += a.xty[i]; out.sx[i] += a.sx[i]; } for (let k = 0; k < FEATURES * FEATURES; k++) out.xtx[k] += a.xtx[k]; } return out; }
/** Solve the ridge normal equations of an accumulator: { n, coef (14), r2, weight (14: |coef| x the feature's sd) }. Ridge = 1e-8 of the mean diagonal. */
export function solveAcc(acc) {
    const F = FEATURES, n = acc.n; if (!(n > 1)) throw new Error("headToHead14.solveAcc: an accumulator with fewer than 2 samples");
    let tr = 0; for (let i = 0; i < F; i++) tr += acc.xtx[i * F + i]; const ridge = 1e-8 * tr / F;
    const M = Array.from({ length: F }, (_, i) => [...Array.from({ length: F }, (_, j) => acc.xtx[i * F + j] + (i === j ? ridge : 0)), acc.xty[i]]);
    for (let c = 0; c < F; c++) {
        let p = c; for (let r = c + 1; r < F; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
        [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c];
        for (let r = 0; r < F; r++) if (r !== c) { const f = M[r][c] / d; if (f !== 0) for (let k = c; k <= F; k++) M[r][k] -= f * M[c][k]; }
    }
    const coef = M.map((row, i) => row[F] / row[i]);
    let bXty = 0, bXXb = 0; for (let i = 0; i < F; i++) { bXty += coef[i] * acc.xty[i]; for (let j = 0; j < F; j++) bXXb += coef[i] * coef[j] * acc.xtx[i * F + j]; }
    const sst = acc.yty - acc.sy * acc.sy / n, sse = acc.yty - 2 * bXty + bXXb, r2 = sst > 1e-12 ? 1 - sse / sst : 0;
    const weight = coef.map((b, i) => { const m = acc.sx[i] / n, v = Math.max(0, acc.xtx[i * F + i] / n - m * m); return Math.abs(b) * Math.sqrt(v); });
    return { n, coef, r2, weight };
}

// ---- the tank kinds
/** `sched` (weight c: the autopilot's thrust plus c x |heading error|/pi, clamped), `turn` (weight d: plus d while |heading error| is above TURN_BAND) and `rec` (963 weights: the network's own command; when a flight has set the recorder, each tick's features and thrust excess over the autopilot's go into it). */
export function kindOf(family) {
    if (family !== "sched" && family !== "turn" && family !== "rec") throw new Error(`headToHead14.kindOf: family must be "sched", "turn" or "rec", got ${JSON.stringify(family)}`);
    if (family === "rec") return Object.freeze({
        circuit: "h14-rec", label: "H14 rec", weightCount: PS.WEIGHT_COUNT, persist: false,
        build: (weights) => {
            const net = PS.pilotFor(Float32Array.from(weights)), ap = AS.pilot();
            return (state, target, current = [0, 0, 0]) => {
                const cmd = net(state, target, current);
                if (REC) addSample(REC, PS.features(state, target, current), cmd.thrust - ap(state, target, current).thrust);
                return cmd;
            };
        },
    });
    return Object.freeze({
        circuit: "h14-" + family, label: "H14 " + family, weightCount: 1, persist: false,
        build: (weights) => {
            const v = weights[0], ap = AS.pilot();
            return (state, target, current = [0, 0, 0]) => {
                const a = ap(state, target, current), e = Math.abs(AS.guidance(state, target, current).headingErr);
                return { ...a, thrust: clamp(family === "sched" ? a.thrust + v * e / Math.PI : e > TURN_BAND ? a.thrust + v : a.thrust) };
            };
        },
    });
}
const lawArm = (id, family, value) => { const kind = kindOf(family); return { id, layer: "flying", controls: ["autopilot"], note: `autopilot with a thrust law (${family}) ${value}`, entry: () => ({ pilot: "network", circuit: kind.circuit, weights: [value] }), register: (tank) => tank.registerPilotKind(kind.circuit, kind) }; };
const recArm = (id, weights) => { const kind = kindOf("rec"); return { id, layer: "flying", controls: ["autopilot"], record: true, note: `network ${id} (recorded)`, entry: () => ({ pilot: "network", circuit: kind.circuit, weights: Array.from(weights) }), register: (tank) => tank.registerPilotKind(kind.circuit, kind) }; };
const need963 = (w, what) => { if (!(Array.isArray(w || null) || ArrayBuffer.isView(w || null)) || w.length !== PS.WEIGHT_COUNT) throw new Error(`headToHead14.armsOf: ${what} must be an array of ${PS.WEIGHT_COUNT} numbers`); };
/** The 47 arms as { id: arm } (`nets` = a Map or object id -> 963 numbers). */
export function armsOf(nets) {
    const get = (id) => (nets && typeof nets.get === "function" ? nets.get(id) : nets ? nets[id] : undefined);
    for (const id of NET_IDS) { if (get(id) === undefined || get(id) === null) throw new Error(`headToHead14.armsOf: no network ${id}`); need963(get(id), `network ${id}`); }
    const old = H13.armsOf(new Map(NET_IDS.map((id) => [id, get(id)]))), out = { autopilot: old.autopilot };
    for (const id of [...IDENT_IDS.slice(0, 2), ...H13.THR_IDS, ...H13.SPD_IDS]) out[id] = old[id];
    out["sched*0"] = lawArm("sched*0", "sched", 0); out["turn+0"] = lawArm("turn+0", "turn", 0);
    C_FACTORS.forEach((c, i) => { out[SCHED_IDS[i]] = lawArm(SCHED_IDS[i], "sched", c); });
    TURN_OFFSETS.forEach((d, i) => { out[TURN_IDS[i]] = lawArm(TURN_IDS[i], "turn", d); });
    for (const id of NET_IDS) out[id] = recArm(id, get(id));
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/**
 * One arm on `range` ids in one condition ("dark": the compass dropout event; "lit": none): [{ key, score (as switchboard.dropout scores it), bad, speed, excess, thrust, ticks, phase: { turn|scored|other: { n, excess, thrust, err } (a mean, null when the phase has no tick) } }].
 * A recording arm also leaves the regression accumulator of the whole flight for takeReg(). `makeTank` is for the gate.
 */
export function fly(arm, range, seconds, event, makeTank = A.createTank) {
    const out = []; REC = arm.record ? newAcc() : null; LAST = null;
    try {
        for (let n = range.from; n <= range.to; n++) {
            const id = "sb-" + n, q = makeTank();
            if (arm.register) arm.register(q);
            q.sync([{ id, name: "H14 " + arm.id, hue: 100, from: "board", local: true, theta: null, ...arm.entry(id) }]);
            if (event) q.setEvent(id, event);
            let target = null, age = 0, sum = 0, cnt = 0, sumAll = 0, cntAll = 0, sp = 0, ex = 0, th = 0, ticks = 0;
            const ph = { turn: [0, 0, 0, 0], scored: [0, 0, 0, 0], other: [0, 0, 0, 0] };
            for (let i = 0, m = Math.round(seconds / TICK); i < m; i++) {
                q.step(TICK); const s = q.snapshot()[0];
                if (s.target !== target) { target = s.target; age = 0; } else age += TICK;
                const dark = !!(s.compass && s.compass.valid === false), e = Math.abs(wrap(s.target.heading - s.heading)), inBucket = event ? dark : true;
                if (inBucket) { sumAll += e; cntAll++; if (age >= SETTLE) { sum += e; cnt++; } }
                const x = s.speed - s.target.speed;
                sp += s.speed; ex += x; th += s.cmd.thrust; ticks++;
                const p = ph[age < SETTLE ? "turn" : inBucket ? "scored" : "other"]; p[0]++; p[1] += x; p[2] += s.cmd.thrust; p[3] += e;
            }
            const last = q.snapshot()[0], err = cnt ? sum / cnt : cntAll ? sumAll / cntAll : NaN;
            if (!Number.isFinite(err)) throw new Error(`headToHead14.fly: arm ${arm.id} id ${id} has no ticks in the bucket it is scored on`);
            const phase = {}; for (const k of PHASES) phase[k] = ph[k][0] ? { n: ph[k][0], excess: ph[k][1] / ph[k][0], thrust: ph[k][2] / ph[k][0], err: ph[k][3] / ph[k][0] } : { n: 0, excess: null, thrust: null, err: null };
            out.push({ key: id, score: 1 - err / Math.PI, bad: !!last.lost, speed: sp / ticks, excess: ex / ticks, thrust: th / ticks, ticks, phase });
        }
        LAST = REC;
    } finally { REC = null; }
    return out;
}
/** The accumulator the last flight of a recording arm left (null when it was not recording). */
export const takeReg = () => { const r = LAST; LAST = null; return r; };
/** The arms of `arms` (default all 47; the autopilot is always flown) on `range` ids, dark and lit: { dark, lit, reg: { dark: {net: acc}, lit: {...} }, range, seconds, nets }. `flyFn` is the flight (the gate hands in a fake). */
export function audit(nets, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = fly } = {}) {
    const all = armsOf(nets), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead14.audit: no arm ${a}`);
    const dark = {}, lit = {}, reg = { dark: {}, lit: {} };
    for (const a of want) for (const [cond, event, store] of [["dark", "dropout", dark], ["lit", null, lit]]) { store[a] = flyFn(all[a], range, seconds, event); const r = takeReg(); if (r) reg[cond][a] = r; }
    return { dark, lit, reg, range, seconds, nets };
}

// ---- the readings
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length, sum = (xs) => xs.reduce((p, q) => p + q, 0);
export const pairOf = (au, a, b, cond) => mk(B.paired(au[cond][a], au[cond][b]));
export const meanOf = (au, a, cond, field = "score") => avg(au[cond][a].map((r) => r[field]));
export const gainOf = (au, a, cond = "dark") => pairOf(au, a, "autopilot", cond).mean;
export const gainsOf = (au, ids, cond = "dark") => ids.map((a) => gainOf(au, a, cond));
export const excessOf = (au, a, cond = "dark") => meanOf(au, a, cond, "excess");
/** An arm's extra speed: its mean speed excess (every tick) minus the autopilot's, in the condition. */
export const extraSpeed = (au, a, cond = "dark") => excessOf(au, a, cond) - excessOf(au, "autopilot", cond);
/** gain / extra speed, or null when the extra speed is below MIN_EXTRA. */
export const efficiencyOf = (au, a) => { const x = extraSpeed(au, a); return x >= MIN_EXTRA ? gainOf(au, a) / x : null; };
/** The networks' mean dark gain, mean extra speed and efficiency (null when the extra speed is below MIN_EXTRA). */
export function netEfficiency(au) { const g = avg(gainsOf(au, NET_IDS)), x = avg(NET_IDS.map((a) => extraSpeed(au, a))); return { gain: g, extra: x, eff: x >= MIN_EXTRA ? g / x : null }; }
/** The best (largest) efficiency among `ids` with a defined efficiency (and, when `minGain` is given, a gain above it): { name, eff } or null. The first of a tie. */
export function bestEfficiency(au, ids, minGain = -Infinity) {
    let b = null; for (const a of ids) { const e = efficiencyOf(au, a); if (e !== null && gainOf(au, a) > minGain && (b === null || e > b.eff)) b = { name: a, eff: e }; } return b;
}
/** A flight's mean speed excess in a phase minus its mean over every tick (null when the phase is empty). */
const phaseDelta = (r, ph) => (r.phase[ph].n ? r.phase[ph].excess - r.excess : null);
/** The networks' phase speed-up (scored less overall, networks less autopilot), per id paired: { mean, se, reading ... }; ids with an empty scored phase in the autopilot or any network are left out. */
export function phaseSpeedUp(au, cond = "dark") {
    const ap = au[cond].autopilot, rows = [];
    ap.forEach((r, i) => { const d = NET_IDS.map((a) => phaseDelta(au[cond][a][i], "scored")), da = phaseDelta(r, "scored"); if (da !== null && d.every((x) => x !== null)) rows.push({ key: r.key, net: avg(d), ap: da }); });
    return mk(B.paired(rows.map((r) => ({ key: r.key, score: r.net, bad: false })), rows.map((r) => ({ key: r.key, score: r.ap, bad: false }))));
}
/** The solved regression of every network in the condition: { id: solveAcc }. */
export const regOf = (au, cond = "dark") => Object.fromEntries(NET_IDS.map((a) => [a, solveAcc(au.reg[cond][a])]));
/** { r2 (mean), lo, hi, leading (the feature index with the largest mean weight), top3: [{ i, w }] } over the networks in the dark. */
export function regSummary(au) {
    const r = regOf(au), ids = NET_IDS, r2 = ids.map((a) => r[a].r2), w = Array.from({ length: FEATURES }, (_, i) => avg(ids.map((a) => r[a].weight[i])));
    const order = w.map((x, i) => ({ i, w: x })).sort((p, q) => q.w - p.w || p.i - q.i);
    return { r2: avg(r2), lo: Math.min(...r2), hi: Math.max(...r2), leading: order[0].i, top3: order.slice(0, 3) };
}
/** The registered verdict: three parts joined by "; ". */
export function verdictOf(au) {
    const pa = phaseSpeedUp(au).reading, partA = pa === "BETTER" ? "THE NETWORKS SPEED UP IN THE SCORED TICKS" : pa === "WORSE" ? "THE NETWORKS SLOW DOWN IN THE SCORED TICKS" : "THE NETWORKS FLY THE SAME IN THE SCORED TICKS AS OVERALL";
    const rs = regSummary(au), partB = `THE NETWORKS' THRUST EXCESS IS ${rs.r2 >= R2_LINEAR ? "" : "NOT "}A LINEAR FUNCTION OF THE FEATURES (R2 ${rs.r2.toFixed(2)}), LED BY ${FEATURE_NAMES[rs.leading]}`;
    const net = netEfficiency(au); let partC;
    if (net.gain <= LEARN_MARGIN) partC = "NOT ASSESSED: THE NETWORKS DID NOT GAIN";
    else if (net.eff === null) partC = "NOT ASSESSED: THE NETWORKS' EXTRA SPEED IS BELOW 0.1 m/s";
    else {
        const s = bestEfficiency(au, SCHEDULED_IDS, LEARN_MARGIN), c = bestEfficiency(au, CONSTANT_IDS), cEff = c ? c.eff : 0;
        partC = s && s.eff >= MATCH * net.eff ? "A SCHEDULED THRUST LAW MATCHES THE NETWORKS' EFFICIENCY" : s && s.eff >= BETTER_THAN_CONSTANT * cEff ? "A SCHEDULED THRUST LAW IS MORE EFFICIENT THAN A CONSTANT, NOT AS EFFICIENT AS THE NETWORKS" : "A SCHEDULED THRUST LAW IS NO MORE EFFICIENT THAN A CONSTANT";
    }
    return `${partA}; ${partB}; ${partC}`;
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3), lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
const effText = (e) => (e === null ? "n/a" : e.toFixed(3));
/** Per phase the mean over the arm's ids of the phase mean ("n/a" for an empty phase): `a / b / c`. */
const phaseText = (au, ids, field) => PHASES.map((ph) => { const v = []; for (const a of ids) for (const r of au.dark[a]) if (r.phase[ph].n) v.push(r.phase[ph][field]); return v.length ? f2(avg(v)) : "n/a"; }).join(" / ");
export function bottomLines(au) {
    const G = gainsOf(au, NET_IDS), net = netEfficiency(au), rs = regSummary(au), sp = phaseSpeedUp(au), cb = bestEfficiency(au, CONSTANT_IDS), sb = bestEfficiency(au, SCHEDULED_IDS, LEARN_MARGIN);
    const lc = CONSTANT_IDS.map((a) => lostBoth(au, a)), ls = SCHEDULED_IDS.map((a) => lostBoth(au, a)), ln = NET_IDS.map((a) => lostBoth(au, a));
    return [
        `LEARNED: ${G.filter((g) => g > LEARN_MARGIN).length} OF ${NET_IDS.length} NETWORKS BEAT THE AUTOPILOT IN THE DARK BY MORE THAN ${LEARN_MARGIN}; MEAN GAIN ${f4(net.gain)}; EXTRA SPEED ${f2(net.extra)} m/s; EFFICIENCY ${effText(net.eff)}`,
        `SPEED EXCESS BY PHASE (m/s, dark; turn / scored / other): AUTOPILOT ${phaseText(au, ["autopilot"], "excess")}; THE NETWORKS ${phaseText(au, NET_IDS, "excess")}; thr+0.3 ${phaseText(au, ["thr+0.3"], "excess")}; spd*1.5 ${phaseText(au, ["spd*1.5"], "excess")}`,
        `THRUST BY PHASE (command, dark; turn / scored / other): AUTOPILOT ${phaseText(au, ["autopilot"], "thrust")}; THE NETWORKS ${phaseText(au, NET_IDS, "thrust")}`,
        `THE NETWORKS' PHASE SPEED-UP (scored less overall, networks less autopilot): ${f3(sp.mean)} m/s (${sp.reading})`,
        `REGRESSION OF THE NETWORKS' THRUST EXCESS ON THE FEATURES (dark): R2 ${rs.r2.toFixed(2)} (range ${rs.lo.toFixed(2)} to ${rs.hi.toFixed(2)}); THE LEADING FEATURES ${rs.top3.map((t) => `${FEATURE_NAMES[t.i]} ${t.w.toFixed(3)}`).join(", ")}`,
        `EFFICIENCY (gain per m/s of extra speed): THE NETWORKS ${effText(net.eff)}; BEST CONSTANT ${cb ? `${cb.name} ${cb.eff.toFixed(3)}` : "n/a"}; SCHEDULED ${SCHEDULED_IDS.map((a) => `${a} ${effText(efficiencyOf(au, a))}`).join(", ")}${sb ? ` (best with a gain above ${LEARN_MARGIN}: ${sb.name} ${sb.eff.toFixed(3)})` : " (none gains more than " + LEARN_MARGIN + ")"}`,
        `DARK GAIN OF THE SCHEDULED ARMS: ${SCHEDULED_IDS.map((a) => `${a} ${f4(gainOf(au, a))}`).join(", ")}; EXTRA SPEED ${SCHEDULED_IDS.map((a) => f2(extraSpeed(au, a))).join(", ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, constants ${sum(lc)}, scheduled ${sum(ls)} (${Math.max(...ls)} in the worst), networks ${sum(ln)} (${Math.max(...ln)} in the worst)`,
    ];
}
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((c) => ARM_IDS.map((a) => [c, a])), ticksPer = Math.round(au.seconds / TICK);
    const sizes = cells.every(([c, a]) => au[c][a] && au[c][a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids in both conditions: ${sizes}` });
    const same = cells.every(([c, a]) => au[c][a] && au[c][a].every((r, i) => au[c].autopilot[i] && r.key === au[c].autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: same, text: `the ids are the same in every arm and condition: ${same}` });
    const inside = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const fin = (x) => x === null || Number.isFinite(x);
    const finite = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => Number.isFinite(r.speed) && Number.isFinite(r.excess) && Number.isFinite(r.thrust) && r.phase && PHASES.every((k) => r.phase[k] && fin(r.phase[k].excess) && fin(r.phase[k].thrust) && fin(r.phase[k].err))));
    rows.push({ name: "SPEEDS, THRUSTS AND PHASE MEANS FINITE", ok: finite, text: `every speed, speed excess, thrust and phase mean is a finite number (or an empty phase): ${finite}` });
    const adds = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => r.phase && PHASES.reduce((s, k) => s + r.phase[k].n, 0) === r.ticks && r.ticks === ticksPer));
    rows.push({ name: "PHASE TICKS ADD UP", ok: adds, text: `in every flight the three phases' ticks add up to the flight's ${ticksPer} ticks: ${adds}` });
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const get = (id) => (au.nets && typeof au.nets.get === "function" ? au.nets.get(id) : au.nets ? au.nets[id] : undefined);
    const nets = NET_IDS.every((id) => { const w = get(id); return !!w && w.length === PS.WEIGHT_COUNT && Array.from(w).every(Number.isFinite); });
    rows.push({ name: "NETWORKS", ok: nets, text: `every network is ${PS.WEIGHT_COUNT} finite weights: ${nets}` });
    const ident = ["dark", "lit"].every((c) => IDENT_IDS.every((a) => au[c][a] && au[c][a].every((r, i) => au[c].autopilot[i] && Math.abs(r.score - au[c].autopilot[i].score) < 1e-6)));
    rows.push({ name: "IDENTITY ARMS ARE THE AUTOPILOT", ok: ident, text: `thr+0, spd*1, sched*0 and turn+0 equal the autopilot on every id in both conditions (within 1e-6): ${ident}` });
    const regOk = ["dark", "lit"].every((c) => NET_IDS.every((a) => { const acc = au.reg && au.reg[c] && au.reg[c][a]; if (!acc || acc.n !== n * ticksPer) return false; const s = solveAcc(acc); return s.r2 >= -1e-9 && s.r2 <= 1 + 1e-9 && s.coef.every(Number.isFinite); }));
    rows.push({ name: "REGRESSIONS COMPLETE", ok: regOk, text: `every network has ${n * ticksPer} samples in both conditions, R2 in [0, 1] and finite coefficients: ${regOk}` });
    const e = (a) => (au.dark[a] ? excessOf(au, a) : NaN), t = H13.THR_IDS, faster = e(t[0]) < e(t[t.length - 1]) && e(t[t.length - 1]) > e("autopilot");
    rows.push({ name: "OFFSETS FLY FASTER", ok: faster, text: `the largest thrust offset flies faster than the smallest and than the autopilot (mean speed excess): ${faster}` });
    const key = (a) => (au.dark[a] || []).map((r) => r.score).join("|"), distinct = new Set(NET_IDS.map(key)).size === NET_IDS.length;
    rows.push({ name: "NETWORKS DISTINCT", ok: distinct, text: `the ${NET_IDS.length} networks are pairwise different in the dark: ${distinct}` });
    return rows;
}
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function report(au) {
    const R = [`ROUND H14: when do the networks go faster, what drives their thrust. Ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark speed excess m/s; dark thrust command):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(20)} ${meanOf(au, a, "dark").toFixed(4)} / ${meanOf(au, a, "lit").toFixed(4)}   ${f2(excessOf(au, a))}   ${f2(meanOf(au, a, "dark", "thrust"))}`);
    R.push("per arm, dark: gain over the autopilot, extra speed (m/s), efficiency; phases turn / scored / other (speed excess):");
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(20)} ${f4(gainOf(au, a))}  ${f2(extraSpeed(au, a))}  ${effText(efficiencyOf(au, a)).padStart(6)}   ${phaseText(au, [a], "excess")}`);
    R.push("gains over the autopilot of the identity arms and the scheduled arms:");
    for (const a of [...IDENT_IDS, ...SCHEDULED_IDS]) R.push(`${a}:`, `   dark ${fmt(pairOf(au, a, "autopilot", "dark"))}`, `   lit  ${fmt(pairOf(au, a, "autopilot", "lit"))}`);
    const r = regOf(au); R.push("per network: R2 (dark, lit), the three leading features (dark):");
    for (const a of NET_IDS) { const d = r[a], l = solveAcc(au.reg.lit[a]), top = d.weight.map((w, i) => ({ i, w })).sort((p, q) => q.w - p.w || p.i - q.i).slice(0, 3); R.push(`  ${a.padEnd(20)} ${d.r2.toFixed(3)} ${l.r2.toFixed(3)}   ${top.map((t) => `${FEATURE_NAMES[t.i]} ${t.w.toFixed(3)}`).join(", ")}`); }
    R.push(`the networks' phase speed-up: ${fmt(phaseSpeedUp(au))}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
