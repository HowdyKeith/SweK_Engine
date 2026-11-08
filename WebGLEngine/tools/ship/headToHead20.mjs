// WebGLEngine/tools/ship/headToHead20.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead20Cmd.mjs; the gate is tools/ship/headToHead20-selfcheck.mjs)
//
// ROUND H20 of brain/HEAD_TO_HEAD.md (registered before this file existed): IS THE THRUST SHAPE THE CAUSE OF THE GAIN? A TRANSPLANT ROUND. 46 arms on the tank's compass dropout (200 fresh ids, dark and lit): the autopilot, the laws c02, c04, h16, four term ablations and four
// single terms of c02, six gated halves (a law's thrust used only above, or only at or below, 0.2 rad of the pilot's own heading error), and the 8 shipped networks each alone, with c02's thrust in its body, and with its thrust in the autopilot's body. A MIXED pilot is a body (pitch,
// yaw, ballast) and a thrust source. The flight is H15's (it scores as switchboard.dropout does and records power and thrust). Reads nothing from disk (the command hands the weights in). THE IDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as AS from "../../brain/autopilotSub.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as H9 from "./headToHead9.mjs";

export const IDS = Object.freeze({ from: 20000, to: 20199 }), SECONDS = 160, BAND = 0.2, LEARN_MARGIN = 0.02;
export const LAW_C02 = Object.freeze([2.2035859388880334, 0.8758638340144, -0.6433501233386668, -2]);
export const LAW_C04 = Object.freeze([2.6422458154661608, 0.14972036308189385, -0.02662452197229641, -2]);
export const LAW_H16 = Object.freeze([1.2322693581401742, -0.061415416013719054, -0.6, -0.15850584538981266]);
export const TERMS = Object.freeze(["c", "d", "k", "s"]);
export const NET8 = Object.freeze(H9.SHIPPED.map((n) => "network-" + n)), C02THR = Object.freeze(NET8.map((n) => "c02thr:" + n)), NETTHR = Object.freeze(NET8.map((n) => "netthr:" + n));
export const ABLATE_IDS = Object.freeze(TERMS.map((t) => "c02-" + t)), SINGLE_IDS = Object.freeze(TERMS.map((t) => "only-" + t));
export const HALF_IDS = Object.freeze(["c02-big", "c02-small", "c04-big", "c04-small", "h16-big", "h16-small"]);
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "c04", "h16", "ap+c02thr", "ap+apthr", "net+netthr", ...ABLATE_IDS, ...SINGLE_IDS, ...HALF_IDS, ...NET8, ...C02THR, ...NETTHR]);
const need963 = (w, what) => { if (!(Array.isArray(w || null) || ArrayBuffer.isView(w || null)) || w.length !== 963) throw new Error(`headToHead20.armsOf: ${what} must be an array of 963 numbers`); };
/** A mixed pilot kind: the body's pitch, yaw and ballast, the thrust of the thrust source; with `gate` "big" ("small") the source's thrust is used only where the pilot's own heading error is above (at most) BAND rad and the autopilot's thrust elsewhere. Spec: body { net: w } or {} (the autopilot); thrust { net: w }, { law: w4 } or {} (the autopilot). */
export function mixKind(id, body, thrust, gate = null) {
    if (gate !== null && gate !== "big" && gate !== "small") throw new Error(`headToHead20.mixKind: gate must be null, "big" or "small", got ${JSON.stringify(gate)}`);
    const bodyNet = !!body.net;
    return Object.freeze({
        circuit: "h20-" + id, label: "H20 " + id, weightCount: bodyNet ? 963 : 1, persist: false,
        build: (weights) => {
            const bp = bodyNet ? PS.pilotFor(Float32Array.from(weights)) : AS.pilot(), ap = AS.pilot(), tp = thrust.net ? PS.pilotFor(Float32Array.from(thrust.net)) : thrust.law ? H16.KIND.build(Float32Array.from(thrust.law)) : ap;
            return (state, target, current = [0, 0, 0]) => {
                const b = bp(state, target, current), t = tp(state, target, current);
                if (gate === null) return { ...b, thrust: t.thrust };
                const big = Math.abs(AS.guidance(state, target, current).headingErr) > BAND;
                return { ...b, thrust: (gate === "big") === big ? t.thrust : ap(state, target, current).thrust };
            };
        },
    });
}
const mixArm = (id, body, thrust, gate = null) => { const kind = mixKind(id, body, thrust, gate); return { id, layer: "flying", controls: ["autopilot"], note: `mixed pilot ${id}`, entry: () => ({ pilot: "network", circuit: kind.circuit, weights: body.net ? Array.from(body.net) : [0] }), register: (tank) => tank.registerPilotKind(kind.circuit, kind) }; };
const netArm = (id, w) => ({ id, layer: "flying", controls: ["autopilot"], note: `network ${id}`, entry: () => ({ pilot: "network", circuit: "gfc", weights: Array.from(w) }) });
const zero = (w, i) => w.map((v, j) => (j === i ? 0 : v)), only = (w, i) => w.map((v, j) => (j === i ? v : 0));
/** The 46 arms as { id: arm } (`nets` = a Map or object id -> 963 numbers for the 8 shipped networks, ids network-<name>). */
export function armsOf(nets) {
    const get = (id) => (nets && typeof nets.get === "function" ? nets.get(id) : nets ? nets[id] : undefined);
    for (const id of NET8) { if (get(id) === undefined || get(id) === null) throw new Error(`headToHead20.armsOf: no network ${id}`); need963(get(id), `network ${id}`); }
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), c04: H16.lawArm("c04", LAW_C04), h16: H16.lawArm("h16", LAW_H16) };
    out["ap+c02thr"] = mixArm("ap+c02thr", {}, { law: LAW_C02 }); out["ap+apthr"] = mixArm("ap+apthr", {}, {}); out["net+netthr"] = mixArm("net+netthr", { net: get("network-Wip") }, { net: get("network-Wip") });
    TERMS.forEach((t, i) => { out["c02-" + t] = H16.lawArm("c02-" + t, zero(LAW_C02, i)); out["only-" + t] = H16.lawArm("only-" + t, only(LAW_C02, i)); });
    for (const [n, law] of [["c02", LAW_C02], ["c04", LAW_C04], ["h16", LAW_H16]]) for (const g of ["big", "small"]) out[`${n}-${g}`] = mixArm(`${n}-${g}`, {}, { law }, g);
    NET8.forEach((id, i) => { const w = get(id); out[id] = netArm(id, w); out[C02THR[i]] = mixArm(C02THR[i], { net: w }, { law: LAW_C02 }); out[NETTHR[i]] = mixArm(NETTHR[i], {}, { net: w }); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 46; the autopilot is always flown) on `range` ids, dark and lit: { dark, lit, range, seconds, nets, laws }. `flyFn` is the flight (the gate hands in a fake). */
export function audit(nets, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = H15.fly } = {}) {
    const all = armsOf(nets), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead20.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, nets, laws: [LAW_C02.slice(), LAW_C04.slice(), LAW_H16.slice()] };
}
// ---- the readings
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length, sum = (xs) => xs.reduce((p, q) => p + q, 0);
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
export const meanOf = H15.meanOf, kwOf = H15.kwOf, extraKw = H15.extraKw, gainOf = H15.gainOf;
/** `a` minus `b` on the score, paired by id, in the condition. */
export const pair = (au, a, b, cond = "dark") => mk(B.paired(au[cond][a], au[cond][b]));
/** The per-id mean score over a list of arms as a run list. */
export const meanRuns = (au, ids, cond = "dark") => au[cond].autopilot.map((r, i) => ({ key: r.key, score: avg(ids.map((a) => au[cond][a][i].score)), bad: false }));
/** A list of arms (mean over the arms, per id) minus another list's, paired by id. */
export const pairLists = (au, A, Bl, cond = "dark") => mk(B.paired(meanRuns(au, A, cond), meanRuns(au, Bl, cond)));
const word = (r, up, down, same) => (r === "BETTER" ? up : r === "WORSE" ? down : same);
/** The registered verdict, six parts joined by "; ". */
export function verdictOf(au) {
    const needs = TERMS.filter((t) => pair(au, "c02-" + t, "c02").reading === "WORSE"), singles = TERMS.filter((t) => { const p = pair(au, "only-" + t, "autopilot"); return p.mean > LEARN_MARGIN && p.reading === "BETTER"; });
    const big = pair(au, "c02-big", "autopilot").reading, small = pair(au, "c02-small", "autopilot").reading, w3 = (r) => word(r, "BEATS", "IS BEHIND", "TIES");
    const D = word(pairLists(au, C02THR, NET8).reading, "C02'S THRUST RAISES THE NETWORKS' SCORE", "C02'S THRUST LOWERS THE NETWORKS' SCORE", "C02'S THRUST LEAVES THE NETWORKS' SCORE UNCHANGED");
    const E = word(mk(B.paired(meanRuns(au, C02THR), au.dark.c02)).reading, "THE NETWORKS' OTHER CHANNELS ADD TO C02'S THRUST", "THE NETWORKS' OTHER CHANNELS COST C02'S THRUST", "THE NETWORKS' OTHER CHANNELS CHANGE NOTHING");
    const F = word(pairLists(au, NETTHR, NET8).reading, "THE AUTOPILOT WITH THE NETWORKS' THRUST BEATS THE NETWORKS", "THE AUTOPILOT WITH THE NETWORKS' THRUST IS BEHIND THE NETWORKS", "THE AUTOPILOT WITH THE NETWORKS' THRUST TIES THE NETWORKS");
    return [`C02'S GAIN NEEDS: ${needs.length ? needs.join(", ") : "NONE"}`, `A SINGLE TERM GAINS: ${singles.length ? singles.join(", ") : "NONE"}`, `C02'S LARGE-ERROR HALF ALONE ${w3(big)} THE AUTOPILOT AND ITS SETTLED HALF ALONE ${w3(small)} IT`, D, E, F].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2);
const lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const groupMean = (au, ids, f) => avg(ids.map(f));
export function bottomLines(au) {
    const g = (a, c = "dark") => gainOf(au, a, c), gd = (ids) => f4(groupMean(au, ids, (a) => g(a))), gl = (ids) => f4(groupMean(au, ids, (a) => g(a, "lit"))), xk = (ids) => f2(groupMean(au, ids, (a) => extraKw(au, a)));
    const pD = pairLists(au, C02THR, NET8), pE = mk(B.paired(meanRuns(au, C02THR), au.dark.c02)), pF = pairLists(au, NETTHR, NET8), ln = NET8.map((a) => lostBoth(au, a));
    const gains = (ids) => ids.map((a) => `${a} ${f4(g(a))} / ${f4(g(a, "lit"))}`).join("; ");
    return [
        `GAINS (dark / lit): ${gains(["c02", "c04", "h16", "ap+c02thr"])}`,
        `ABLATION (c02 with one term removed, minus c02; dark): ${TERMS.map((t) => `c02-${t} ${fmt(pair(au, "c02-" + t, "c02"))}`).join("; ")}`,
        `SINGLE (one term kept, gain over the autopilot; dark / lit): ${TERMS.map((t) => `only-${t} ${f4(g("only-" + t))} / ${f4(g("only-" + t, "lit"))} ${pair(au, "only-" + t, "autopilot").reading}`).join("; ")}`,
        `HALVES (gain dark / lit, extra kW, reading against the autopilot): ${HALF_IDS.map((a) => `${a} ${f4(g(a))} / ${f4(g(a, "lit"))}, ${f2(extraKw(au, a))}, ${pair(au, a, "autopilot").reading}`).join("; ")}`,
        `NETWORKS (the 8: mean gain dark / lit, mean extra kW): the networks ${gd(NET8)} / ${gl(NET8)}, ${xk(NET8)}; with c02's thrust ${gd(C02THR)} / ${gl(C02THR)}, ${xk(C02THR)}; the autopilot with their thrust ${gd(NETTHR)} / ${gl(NETTHR)}, ${xk(NETTHR)}`,
        `PAIRED (dark): net+c02thr minus the networks ${fmt(pD)}; net+c02thr minus c02 ${fmt(pE)}; ap+netthr minus the networks ${fmt(pF)}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, c02 ${lostBoth(au, "c02")}, halves ${sum(HALF_IDS.map((a) => lostBoth(au, a)))}, networks ${sum(ln)} (${Math.max(...ln)} in the worst), with c02's thrust ${sum(C02THR.map((a) => lostBoth(au, a)))}, with their thrust ${sum(NETTHR.map((a) => lostBoth(au, a)))}`,
    ];
}
const J = JSON.stringify;
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((c) => ARM_IDS.map((a) => [c, a]));
    const sizes = cells.every(([c, a]) => au[c][a] && au[c][a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids in both conditions: ${sizes}` });
    const same = cells.every(([c, a]) => au[c][a] && au[c][a].every((r, i) => au[c].autopilot[i] && r.key === au[c].autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: same, text: `the ids are the same in every arm and condition: ${same}` });
    const inside = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const watts = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => Number.isFinite(r.watts) && r.watts >= H15.MIN_WATTS && Number.isFinite(r.thrust)));
    rows.push({ name: "POWERS FINITE AND AT LEAST 200 W", ok: watts, text: `every mean power is a finite number of at least ${H15.MIN_WATTS} W and every mean thrust finite: ${watts}` });
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const get = (id) => (au.nets && typeof au.nets.get === "function" ? au.nets.get(id) : au.nets ? au.nets[id] : undefined);
    const nets = NET8.every((id) => { const w = get(id); return !!w && w.length === 963 && Array.from(w).every(Number.isFinite); });
    rows.push({ name: "NETWORKS", ok: nets, text: `every network is 963 finite weights: ${nets}` });
    const eq = (a, b) => ["dark", "lit"].every((c) => au[c][a] && au[c][b] && au[c][a].every((r, i) => au[c][b][i] && ["score", "watts", "thrust"].every((k) => Math.abs(r[k] - au[c][b][i][k]) < 1e-6)));
    const ident = eq("law0", "autopilot") && eq("ap+apthr", "autopilot") && eq("net+netthr", "network-Wip");
    rows.push({ name: "IDENTITY ARMS", ok: ident, text: `law0 and ap+apthr equal the autopilot and net+netthr equals network-Wip in score, power and thrust on every id in both conditions (within 1e-6): ${ident}` });
    const mixer = eq("ap+c02thr", "c02");
    rows.push({ name: "THE MIXER GIVES THE LAW", ok: mixer, text: `ap+c02thr (the autopilot's body with c02's thrust through the mixer) equals c02 flown as a law in score, power and thrust (within 1e-6): ${mixer}` });
    const laws = Array.isArray(au.laws) && au.laws.length === 3 && J(au.laws[0]) === J(LAW_C02) && J(au.laws[1]) === J(LAW_C04) && J(au.laws[2]) === J(LAW_H16);
    rows.push({ name: "LAWS ARE THE REGISTERED ONES", ok: laws, text: `c02, c04 and h16 are the laws written in the registration: ${laws}` });
    const key = (a) => (au.dark[a] || []).map((r) => r.score).join("|"), distinct = new Set(NET8.map(key)).size === NET8.length;
    rows.push({ name: "NETWORKS DISTINCT", ok: distinct, text: `the ${NET8.length} networks are pairwise different in the dark: ${distinct}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H20: is the thrust shape the cause of the gain. Ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; dark mean thrust):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(26)} ${meanOf(au, a, "dark").toFixed(4)} / ${meanOf(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${meanOf(au, a, "dark", "thrust").toFixed(2)}`);
    R.push("per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit):");
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(26)} ${f4(gainOf(au, a))} / ${f4(gainOf(au, a, "lit"))}  ${f3(extraKw(au, a))} / ${f3(extraKw(au, a, "lit"))}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
