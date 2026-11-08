// WebGLEngine/tools/ship/headToHead19.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead19Cmd.mjs; the gate is tools/ship/headToHead19-selfcheck.mjs)
//
// ROUND H19 of brain/HEAD_TO_HEAD.md (registered before this file existed): WHERE DOES THE PRICED LAW SPEND ITS THRUST, AND IS IT WHAT THE NETWORKS DO? The 35 arms of H18 with the champions fixed as constants (autopilot, law0, c01, c02, c04, h16, sched*2, the 28 networks) flown
// on the tank's compass dropout (200 fresh ids, dark and lit) by this file's own flight, which scores EXACTLY as switchboard.dropout does (the gate holds it to the board) and records, per flight, by band (|heading error| above or at most 0.2 rad) and by phase (H14's
// turn / scored / other): the ticks, the mean thrust, the mean speed excess over the target speed and the mean power (H15's formula). Reads nothing from disk. THE IDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as A from "../../render/subAquariumSim.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H18 from "./headToHead18.mjs";

export const IDS = Object.freeze({ from: 19000, to: 19199 }), SECONDS = 160, TICK = 1 / 30, SETTLE = 12, BAND = 0.2, MIN_BAND_TICKS = 20, MIN_EXTRA_KW = 0.1;
export const LAW_C01 = Object.freeze([1.5583196668982158, 0.28628511493415953, -0.383655969709773, -0.4262203519156169]);
export const LAW_C02 = Object.freeze([2.2035859388880334, 0.8758638340144, -0.6433501233386668, -2]);
export const LAW_C04 = Object.freeze([2.6422458154661608, 0.14972036308189385, -0.02662452197229641, -2]);
export const LAWS = Object.freeze([LAW_C01, LAW_C02, LAW_C04]);
export const NET_IDS = H18.NET_IDS, ARM_IDS = H18.ARM_IDS, PHASES = Object.freeze(["turn", "scored", "other"]), BANDS = Object.freeze(["big", "small"]);
const TWO_PI = 2 * Math.PI, wrap = (a) => { let x = a % TWO_PI; if (x > Math.PI) x -= TWO_PI; if (x <= -Math.PI) x += TWO_PI; return x; };
/** The arms as { id: arm } (`nets` = a Map or object id -> 963 numbers): H18's with the three champions' laws fixed to the registered ones. */
export const armsOf = (nets) => H18.armsOf(nets, LAWS.map((l) => l.slice()));
/** The laws the champion and h16 arms are built from: [c01, c02, c04, h16] as the arms hold them. */
export function lawsBuilt(nets) { const a = armsOf(nets); return ["c01", "c02", "c04", "h16"].map((id) => a[id].entry().weights); }
const acc = () => ({ n: 0, th: 0, ex: 0, w: 0 });
const fin = (c) => (c.n ? { n: c.n, thrust: c.th / c.n, excess: c.ex / c.n, watts: c.w / c.n } : { n: 0, thrust: null, excess: null, watts: null });
/**
 * One arm on `range` ids in one condition ("dark": the compass dropout event; "lit": none): [{ key, score (as switchboard.dropout scores it), bad, watts (mean over every tick), speed, thrust, excess (mean speed less the target speed), ticks,
 * band: { big, small }, phase: { turn, scored, other } }] with each band and phase { n, thrust, excess, watts } (means, null when empty). `makeTank` is for the gate.
 */
export function fly(arm, range, seconds, event, makeTank = A.createTank) {
    const out = [];
    for (let n = range.from; n <= range.to; n++) {
        const id = "sb-" + n, q = makeTank();
        if (arm.register) arm.register(q);
        q.sync([{ id, name: "H19 " + arm.id, hue: 100, from: "board", local: true, theta: null, ...arm.entry(id) }]);
        if (event) q.setEvent(id, event);
        let target = null, age = 0, sum = 0, cnt = 0, sumAll = 0, cntAll = 0, w = 0, sp = 0, th = 0, ex = 0, ticks = 0;
        const band = { big: acc(), small: acc() }, phase = { turn: acc(), scored: acc(), other: acc() };
        for (let i = 0, m = Math.round(seconds / TICK); i < m; i++) {
            q.step(TICK); const s = q.snapshot()[0];
            if (s.target !== target) { target = s.target; age = 0; } else age += TICK;
            const dark = !!(s.compass && s.compass.valid === false), e = Math.abs(wrap(s.target.heading - s.heading)), inBucket = event ? dark : true;
            if (inBucket) { sumAll += e; cntAll++; if (age >= SETTLE) { sum += e; cnt++; } }
            const watts = H15.wattsOf(s.cmd.thrust, s.speed), x = s.speed - s.target.speed;
            w += watts; sp += s.speed; th += s.cmd.thrust; ex += x; ticks++;
            for (const c of [band[e > BAND ? "big" : "small"], phase[age < SETTLE ? "turn" : inBucket ? "scored" : "other"]]) { c.n++; c.th += s.cmd.thrust; c.ex += x; c.w += watts; }
        }
        const last = q.snapshot()[0], err = cnt ? sum / cnt : cntAll ? sumAll / cntAll : NaN;
        if (!Number.isFinite(err)) throw new Error(`headToHead19.fly: arm ${arm.id} id ${id} has no ticks in the bucket it is scored on`);
        out.push({ key: id, score: 1 - err / Math.PI, bad: !!last.lost, watts: w / ticks, speed: sp / ticks, thrust: th / ticks, excess: ex / ticks, ticks, band: { big: fin(band.big), small: fin(band.small) }, phase: { turn: fin(phase.turn), scored: fin(phase.scored), other: fin(phase.other) } });
    }
    return out;
}
/** The arms of `arms` (default all 35; the autopilot is always flown) on `range` ids, dark and lit: { dark, lit, range, seconds, nets, laws }. `flyFn` is the flight (the gate hands in a fake). */
export function audit(nets, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = fly } = {}) {
    const all = armsOf(nets), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead19.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, nets, laws: lawsBuilt(nets) };
}
// ---- the readings
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length, sum = (xs) => xs.reduce((p, q) => p + q, 0);
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
export const meanOf = H15.meanOf, kwOf = H15.kwOf, extraKw = H15.extraKw, gainOf = H15.gainOf;
/** The speed excess (mean over every tick) of an arm minus the autopilot's, paired by id, in the condition. */
export const speedPair = (au, a, cond = "dark") => mk(B.paired(au[cond][a].map((r) => ({ key: r.key, score: r.excess, bad: false })), au[cond].autopilot.map((r) => ({ key: r.key, score: r.excess, bad: false }))));
const shapeOf = (r) => (r.band.big.n >= MIN_BAND_TICKS && r.band.small.n >= MIN_BAND_TICKS ? r.band.big.thrust - r.band.small.thrust : null);
/** A shape series for an arm (`a` an arm id, or "networks" for the per-id mean over the 28 networks, null for an id where any network is invalid): [value or null per id]. */
export function shapeSeries(au, a, cond = "dark") {
    if (a === "networks") return au[cond].autopilot.map((r, i) => { const v = NET_IDS.map((id) => shapeOf(au[cond][id][i])); return v.every((x) => x !== null) ? avg(v) : null; });
    return au[cond][a].map(shapeOf);
}
/** `a` minus `b` on the shape (an arm id or "networks"), paired by id over the ids valid in both: { mean, se, ... , reading, left (the ids left out) }. */
export function shapePair(au, a, b, cond = "dark") {
    const x = shapeSeries(au, a, cond), y = shapeSeries(au, b, cond), keys = au[cond].autopilot.map((r) => r.key), rows = [];
    keys.forEach((k, i) => { if (x[i] !== null && y[i] !== null) rows.push({ k, x: x[i], y: y[i] }); });
    return { ...mk(B.paired(rows.map((r) => ({ key: r.k, score: r.x, bad: false })), rows.map((r) => ({ key: r.k, score: r.y, bad: false })))), left: keys.length - rows.length };
}
/** The mean shape of an arm over its valid ids (null when none). */
export const shapeMean = (au, a, cond = "dark") => { const v = shapeSeries(au, a, cond).filter((x) => x !== null); return v.length ? avg(v) : null; };
/** An arm's mean fraction of ticks in the BIG band (dark by default). */
export const bigFraction = (au, a, cond = "dark") => avg(au[cond][a].map((r) => r.band.big.n / r.ticks));
/** A band's contribution to an arm's mean power in kW: the mean over the ids of (the band's fraction of ticks x its mean power). */
const contribution = (au, a, b, cond) => avg(au[cond][a].map((r) => (r.band[b].n ? (r.band[b].n / r.ticks) * r.band[b].watts : 0))) / 1000;
/** The BIG share of an arm's extra mean power over the autopilot, or null when the extra power is under MIN_EXTRA_KW in magnitude. */
export function bigShare(au, a, cond = "dark") {
    const x = extraKw(au, a, cond); if (Math.abs(x) < MIN_EXTRA_KW) return null;
    return (contribution(au, a, "big", cond) - contribution(au, "autopilot", "big", cond)) / x;
}
const word = (r, more, less, same) => (r === "BETTER" ? more : r === "WORSE" ? less : same);
/** The registered verdict, five parts joined by "; ". */
export function verdictOf(au) {
    const sp = speedPair(au, "c02"), A = word(sp.reading, "C02 FLIES FASTER THAN THE AUTOPILOT", "C02 FLIES SLOWER THAN THE AUTOPILOT", "C02 FLIES AT THE AUTOPILOT'S SPEED");
    const Bp = word(shapePair(au, "c02", "autopilot").reading, "C02 RAISES THRUST MORE IN LARGE HEADING ERRORS THAN THE AUTOPILOT", "C02 RAISES THRUST LESS IN LARGE HEADING ERRORS THAN THE AUTOPILOT", "C02 RAISES THRUST AS MUCH IN LARGE HEADING ERRORS AS THE AUTOPILOT");
    const sh = bigShare(au, "c02"), C = sh === null ? "C02'S EXTRA POWER IS BELOW 0.1 kW" : `${Math.round(100 * sh)} PERCENT OF C02'S EXTRA POWER IS DRAWN IN LARGE HEADING ERRORS`;
    const D = word(shapePair(au, "networks", "autopilot").reading, "THE NETWORKS RAISE THRUST MORE IN LARGE HEADING ERRORS THAN THE AUTOPILOT", "THE NETWORKS RAISE THRUST LESS IN LARGE HEADING ERRORS THAN THE AUTOPILOT", "THE NETWORKS RAISE THRUST AS MUCH IN LARGE HEADING ERRORS AS THE AUTOPILOT");
    const E = word(shapePair(au, "c02", "networks").reading, "C02 RAISES THRUST MORE IN LARGE HEADING ERRORS THAN THE NETWORKS", "C02 RAISES THRUST LESS IN LARGE HEADING ERRORS THAN THE NETWORKS", "C02 RAISES THRUST AS MUCH IN LARGE HEADING ERRORS AS THE NETWORKS");
    return [A, Bp, C, D, E].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2);
const lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}; ${p.left === undefined ? "all ids" : p.left + " ids left out"}) ${p.reading}`;
const SHOWN = Object.freeze(["autopilot", "c02", "c04", "h16", "sched*2"]);
/** The mean over the ids that have the phase/band of a field of an arm, "n/a" when none; the networks' entry is the mean over the 28 networks' means. */
const cellMean = (au, a, kind, key, field, cond = "dark") => { const one = (id) => { const v = au[cond][id].filter((r) => r[kind][key].n).map((r) => r[kind][key][field]); return v.length ? avg(v) : null; }; if (a === "networks") { const m = NET_IDS.map(one).filter((x) => x !== null); return m.length ? avg(m) : null; } return one(a); };
const cellText = (v, f) => (v === null ? "n/a" : f(v));
const rowText = (au, kind, keys, field, f) => [...SHOWN, "networks"].map((a) => `${a === "networks" ? "THE NETWORKS" : a} ${keys.map((k) => cellText(cellMean(au, a, kind, k, field), f)).join(" / ")}`).join("; ");
export function bottomLines(au) {
    const sp = speedPair(au, "c02"), pr = { shape: shapePair(au, "c02", "autopilot"), nets: shapePair(au, "networks", "autopilot"), res: shapePair(au, "c02", "networks") };
    const ln = NET_IDS.map((a) => lostBoth(au, a)), arms = [...SHOWN, "networks"], nm = (a) => (a === "networks" ? "THE NETWORKS" : a);
    const bigF = (a) => (a === "networks" ? avg(NET_IDS.map((id) => bigFraction(au, id))) : bigFraction(au, a)), bigFL = NET_IDS.map((id) => bigFraction(au, id));
    const shp = (a, c) => (a === "networks" ? (() => { const v = NET_IDS.map((id) => shapeMean(au, id, c)).filter((x) => x !== null); return v.length ? avg(v) : null; })() : shapeMean(au, a, c)), shpT = (v) => (v === null ? "n/a" : f3(v));
    const netShapes = NET_IDS.map((id) => shapeMean(au, id)).filter((x) => x !== null);
    const share = (a) => { const s = bigShare(au, a); return s === null ? "n/a" : `${Math.round(100 * s)} percent`; }, netShare = (() => { const s = NET_IDS.map((id) => bigShare(au, id)).filter((x) => x !== null); return s.length ? `${Math.round(100 * avg(s))} percent` : "n/a"; })();
    return [
        `SPEED EXCESS BY PHASE (m/s, dark; turn / scored / other): ${rowText(au, "phase", PHASES, "excess", f2)}`,
        `THRUST BY PHASE (command, dark; turn / scored / other): ${rowText(au, "phase", PHASES, "thrust", f2)}`,
        `BANDS (dark; fraction of ticks in BIG; thrust in BIG / SMALL; power kW in BIG / SMALL): ${arms.map((a) => `${nm(a)} ${bigF(a).toFixed(3)}; ${cellText(cellMean(au, a, "band", "big", "thrust"), (v) => v.toFixed(2))} / ${cellText(cellMean(au, a, "band", "small", "thrust"), (v) => v.toFixed(2))}; ${cellText(cellMean(au, a, "band", "big", "watts"), (v) => (v / 1000).toFixed(2))} / ${cellText(cellMean(au, a, "band", "small", "watts"), (v) => (v / 1000).toFixed(2))}`).join("; ")}`,
        `SHAPE (thrust in BIG less thrust in SMALL; dark / lit): ${arms.map((a) => `${nm(a)} ${shpT(shp(a, "dark"))} / ${shpT(shp(a, "lit"))}`).join("; ")}; THE NETWORKS' SHAPE RANGE ${f3(Math.min(...netShapes))} to ${f3(Math.max(...netShapes))}, THEIR BIG FRACTION ${Math.min(...bigFL).toFixed(3)} to ${Math.max(...bigFL).toFixed(3)}`,
        `PAIRED (dark): c02 minus the autopilot on the speed excess ${fmt(sp)}; c02 minus the autopilot on the shape ${fmt(pr.shape)}; the networks minus the autopilot on the shape ${fmt(pr.nets)}; c02 minus the networks on the shape ${fmt(pr.res)}`,
        `POWER (extra mean kW; BIG share of the extra power): ${arms.map((a) => `${nm(a)} ${a === "networks" ? f2(avg(NET_IDS.map((id) => extraKw(au, id)))) : f2(extraKw(au, a))}, ${a === "networks" ? netShare : share(a)}`).join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, c02 ${lostBoth(au, "c02")}, c04 ${lostBoth(au, "c04")}, h16 ${lostBoth(au, "h16")}, sched*2 ${lostBoth(au, "sched*2")}, networks ${sum(ln)} (${Math.max(...ln)} in the worst)`,
    ];
}
const J = JSON.stringify;
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((c) => ARM_IDS.map((a) => [c, a])), tk = Math.round(au.seconds / TICK);
    const sizes = cells.every(([c, a]) => au[c][a] && au[c][a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids in both conditions: ${sizes}` });
    const same = cells.every(([c, a]) => au[c][a] && au[c][a].every((r, i) => au[c].autopilot[i] && r.key === au[c].autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: same, text: `the ids are the same in every arm and condition: ${same}` });
    const inside = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const watts = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => Number.isFinite(r.watts) && r.watts >= H15.MIN_WATTS && Number.isFinite(r.speed) && Number.isFinite(r.thrust) && Number.isFinite(r.excess)));
    rows.push({ name: "POWERS FINITE AND AT LEAST 200 W", ok: watts, text: `every mean power is a finite number of at least ${H15.MIN_WATTS} W and every mean speed, thrust and speed excess finite: ${watts}` });
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const get = (id) => (au.nets && typeof au.nets.get === "function" ? au.nets.get(id) : au.nets ? au.nets[id] : undefined);
    const nets = NET_IDS.every((id) => { const w = get(id); return !!w && w.length === 963 && Array.from(w).every(Number.isFinite); });
    rows.push({ name: "NETWORKS", ok: nets, text: `every network is 963 finite weights: ${nets}` });
    const ident = ["dark", "lit"].every((c) => au[c].law0 && au[c].law0.every((r, i) => au[c].autopilot[i] && ["score", "watts", "speed", "thrust"].every((k) => Math.abs(r[k] - au[c].autopilot[i][k]) < 1e-6)));
    rows.push({ name: "ZERO LAW IS THE AUTOPILOT", ok: ident, text: `law0 equals the autopilot in score, power, speed and thrust on every id in both conditions (within 1e-6): ${ident}` });
    const adds = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => r.band && r.phase && r.ticks === tk && r.band.big.n + r.band.small.n === r.ticks && PHASES.reduce((s, k) => s + r.phase[k].n, 0) === r.ticks));
    rows.push({ name: "BAND AND PHASE TICKS ADD UP", ok: adds, text: `in every flight the two bands' ticks and the three phases' ticks each add up to the flight's ${tk} ticks: ${adds}` });
    const laws = Array.isArray(au.laws) && au.laws.length === 4 && J(au.laws[0]) === J(LAW_C01) && J(au.laws[1]) === J(LAW_C02) && J(au.laws[2]) === J(LAW_C04) && J(au.laws[3]) === J(H18.H16_LAW);
    rows.push({ name: "LAWS ARE THE REGISTERED ONES", ok: laws, text: `c01, c02, c04 and h16 are built from the laws written in the registration: ${laws}` });
    const key = (a) => (au.dark[a] || []).map((r) => r.score).join("|"), distinct = new Set(NET_IDS.map(key)).size === NET_IDS.length;
    rows.push({ name: "NETWORKS DISTINCT", ok: distinct, text: `the ${NET_IDS.length} networks are pairwise different in the dark: ${distinct}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H19: where the priced law spends its thrust. Ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; dark mean speed excess; BIG fraction dark):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(20)} ${meanOf(au, a, "dark").toFixed(4)} / ${meanOf(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${f2(meanOf(au, a, "dark", "excess"))}   ${bigFraction(au, a).toFixed(3)}`);
    R.push("per arm: dark / lit gain over the autopilot, extra power (kW, dark); dark shape, dark BIG share:");
    for (const a of ARM_IDS.slice(1)) { const s = shapeMean(au, a), t = bigShare(au, a); R.push(`  ${a.padEnd(20)} ${f4(gainOf(au, a))} / ${f4(gainOf(au, a, "lit"))}  ${f3(extraKw(au, a))}  ${s === null ? "n/a" : f3(s)}  ${t === null ? "n/a" : (100 * t).toFixed(0) + "%"}`); }
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
