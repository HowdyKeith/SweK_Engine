// WebGLEngine/tools/ship/headToHead73.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead73Cmd.mjs; the gate is tools/ship/headToHead73-selfcheck.mjs)
//
// ROUND H73 of brain/HEAD_TO_HEAD.md (registered before this file existed): WEIGHT NOISE. The 1800-iteration champion of each searching round (H32's, H34's, H45's, each by its own rule), perturbed by multiplicative Gaussian noise w x (1 + s x z) of relative size s = 0.01, 0.03, 0.1 and 0.3 (two draws each: the z of draw seed 1
// and of draw seed 2, the generator X32.generatorAfter(seed, 0), Box-Muller over the weights in order, a zero weight staying zero), flown with c02's four numbers perturbed the same way, on 200 fresh ids (93200-93399), dark and lit, 160 s, read at 0.02 on H27's penalised priced score. No search.
// Reads and writes nothing itself (the command hands in the stored rows and the flights).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X32 from "./headToHead32.mjs";
import * as X45 from "./headToHead45.mjs";
import * as X68 from "./headToHead68.mjs";

export const IDS = Object.freeze({ from: 93200, to: 93399 }), SECONDS = 160, PRICE = 0.02, EARLIER_AUDIT_END = 92399, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02;
export const SIZES = Object.freeze([0.01, 0.03, 0.1, 0.3]), LABELS = Object.freeze(["S0.01", "S0.03", "S0.1", "S0.3"]), DRAWS = Object.freeze([1, 2]), CHECKPOINT = 1800;
export const netsOf = X68.netsOf, fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen, fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length, near = (a, b) => Math.abs(a - b) < 1e-9;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The three champions' ids by each round's own rule at 1800: H32's (X32.champion), H34's (the best held-out value of its four, the first on a tie) and H45's (X45.champion): ["s02_<seed>", "t02_<seed>", "n72_<seed>"]. `rows` = { S02, T02, N72 } stored search rows. */
export function championsOf(rows) {
    if (!rows || !["S02", "T02", "N72"].every((g) => Array.isArray(rows[g]))) throw new Error("headToHead73.championsOf: rows is { S02, T02, N72 }");
    const t = [26031, 26032, 26033, 26034].map((s) => { const r = rows.T02.find((q) => q.seed === s), k = r && cpOf(r, CHECKPOINT); if (!k || !Number.isFinite(k.heldScore)) throw new Error(`headToHead73.championsOf: T02 seed ${s} needs a checkpoint at ${CHECKPOINT} with a held-out value`); return { s, h: k.heldScore }; });
    let b = t[0]; for (const q of t) if (q.h > b.h) b = q;
    return ["s02_" + X32.champion(rows.S02, CHECKPOINT).seed, "t02_" + b.s, "n72_" + X45.champion(rows.N72, CHECKPOINT).seed];
}
/** The perturbation's standard normal draws z_0 .. z_(n-1) of draw seed `seed`: the generator X32.generatorAfter(seed, 0), two uniforms per draw (Box-Muller, the cosine branch), in order. */
export function zOf(seed, n) {
    const g = X32.generatorAfter(seed, 0), z = [];
    for (let i = 0; i < n; i++) { const u1 = Math.max(g(), 1e-300), u2 = g(); z.push(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)); }
    return z;
}
/** The weights `w` perturbed by size `s` with the draws of draw seed `seed`: w_i x (1 + s x z_i); a zero weight stays zero (its draw is still taken, so the stream does not shift). */
export function perturb(w, s, seed) { const z = zOf(seed, w.length); return Array.from(w, (x, i) => (x === 0 ? 0 : x * (1 + s * z[i]))); }
/** The id of a perturbed arm: "<source>_<label>_<draw>", e.g. s02_26011_S0.1_2 or c02_S0.03_1. */
export const perturbedId = (source, label, draw) => `${source}_${label}_${draw}`;
/** The perturbed vectors of every champion and of c02: { id: weights } in the arm order (source, then size, then draw). `nets` = the twelve netsOf networks (the champions are found in them by id). */
export function perturbedOf(champs, nets) {
    const out = {};
    for (const src of champs) { const n = nets.find((q) => q.id === src); if (!n || !wOk(n.weights)) throw new Error(`headToHead73.perturbedOf: no stored network ${src}`); LABELS.forEach((lb, k) => DRAWS.forEach((d) => { out[perturbedId(src, lb, d)] = perturb(Array.from(n.weights), SIZES[k], d); })); }
    LABELS.forEach((lb, k) => DRAWS.forEach((d) => { out[perturbedId("c02", lb, d)] = perturb(LAW_C02.slice(), SIZES[k], d); }));
    return out;
}
/** The arm ids in order: autopilot, law0, c02, q02, the champions, then the perturbed networks and the perturbed c02s. */
export const armIdsOf = (champs) => ["autopilot", "law0", "c02", "q02", ...champs, ...champs.flatMap((c) => LABELS.flatMap((lb) => DRAWS.map((d) => perturbedId(c, lb, d)))), ...LABELS.flatMap((lb) => DRAWS.map((d) => perturbedId("c02", lb, d)))];
/** The arms as { id: arm }: `h27` = { laws: [q02] }; `nets` = netsOf's twelve; `champs` the champions' ids; `pert` = perturbedOf's vectors. */
export function armsOf(h27, nets, champs, pert) {
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead73.armsOf: h27 is { laws: one 4-weight law }");
    if (!Array.isArray(champs) || champs.length !== 3) throw new Error("headToHead73.armsOf: champs is the three champions' ids");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    for (const c of champs) { const n = nets.find((q) => q.id === c); if (!n || !wOk(n.weights)) throw new Error(`headToHead73.armsOf: no stored network ${c}`); out[c] = netArm(c, n.weights); }
    for (const [id, w] of Object.entries(pert)) { if (id.startsWith("c02_")) { if (!Array.isArray(w) || w.length !== 4 || !w.every(Number.isFinite)) throw new Error(`headToHead73.armsOf: ${id} is a 4-number law`); out[id] = H16.lawArm(id, w); } else { if (!wOk(w)) throw new Error(`headToHead73.armsOf: ${id} is ${WEIGHT_COUNT} finite weights`); out[id] = netArm(id, w); } }
    const ids = armIdsOf(champs);
    for (const id of ids) if (!out[id]) throw new Error(`headToHead73.armsOf: no arm ${id}`);
    return Object.fromEntries(ids.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 39; the autopilot always) on `range` ids, dark and lit. */
export function fly(h27, nets, champs, pert, { range = IDS, seconds = SECONDS, arms = null, flyFn = flyPen } = {}) {
    const all = armsOf(h27, nets, champs, pert), want = [...new Set(["autopilot", ...(arms || Object.keys(all))])], dark = {}, lit = {};
    for (const a of want) if (!all[a]) throw new Error(`headToHead73.fly: no arm ${a}`);
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit };
}
const pen = (au, a, b) => penPair(au, a, b, PRICE);
export const penMean = (au, a) => avg(penRunsAt(au, a, PRICE).map((r) => r.score));
export const meanPower = (au, a) => (avg(au.dark[a].map((r) => r.watts)) + avg(au.lit[a].map((r) => r.watts))) / 2000;
/** The perturbed network ids at one size label (3 networks x 2 draws, in order) and the perturbed c02 ids at it. */
export const netsAt = (champs, lb) => champs.flatMap((c) => DRAWS.map((d) => perturbedId(c, lb, d)));
export const lawsAt = (lb) => DRAWS.map((d) => perturbedId("c02", lb, d));
/** An arm's fall: its paired mean difference from its own unperturbed self at 0.02. */
export const fallOf = (au, id, source) => pen(au, id, source).mean;
/** The mean fall of the perturbed networks at size label `lb`. */
export const meanFall = (au, champs, lb) => avg(champs.flatMap((c) => DRAWS.map((d) => fallOf(au, perturbedId(c, lb, d), c))));
/** The mean fall of the perturbed c02s at size label `lb`. */
export const lawFall = (au, lb) => avg(DRAWS.map((d) => fallOf(au, perturbedId("c02", lb, d), "c02")));
/** The reading of one network's two draws pooled at a size: B.paired over the 400 per-id scores of its two perturbed arms against its unperturbed self twice. */
export function pooledReading(au, champ, lb) { const u = penRunsAt(au, champ, PRICE), a = DRAWS.flatMap((d) => penRunsAt(au, perturbedId(champ, lb, d), PRICE)); return B.readingOf(B.paired(a, [...u, ...u])); }
/** The first size label at which a network's pooled fall reads WORSE, or null. */
export const firstWorse = (au, champ) => LABELS.find((lb) => pooledReading(au, champ, lb) === "WORSE") || null;
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
/** The registered verdict, eight parts joined by "; ". */
export function verdictOf(au) {
    const ch = au.champs, perLb = (f) => LABELS.map((lb) => `${lb} ${f(lb)}`).join(", "), allPert = ch.flatMap((c) => LABELS.flatMap((lb) => netsAt([c], lb)));
    const lost = allPert.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`), mf = LABELS.map((lb) => meanFall(au, ch, lb)), unp = avg(ch.map((c) => meanPower(au, c)));
    return [`MEAN FALL OF THE PERTURBED NETWORKS: ${LABELS.map((lb, k) => `${lb} ${f4(mf[k])}`).join(", ")}`, `FIRST SIZE AT WHICH A NETWORK'S FALL READS WORSE: ${ch.map((c) => `${c} ${firstWorse(au, c) || "NONE"}`).join(", ")}`,
        `PERTURBED NETWORKS NOT BEHIND C02: ${perLb((lb) => `${netsAt(ch, lb).filter((a) => pen(au, a, "c02").reading !== "WORSE").length}`)} (OF 6)`, `MEAN FALL OF THE PERTURBED C02: ${perLb((lb) => f4(lawFall(au, lb)))}`,
        `LOST SUBS IN THE PERTURBED NETWORKS: ${lost.length ? lost.join(", ") : "NONE"}`, `MEAN POWER OF THE PERTURBED NETWORKS (KW): ${LABELS.map((lb) => `${lb} ${avg(netsAt(ch, lb).map((a) => meanPower(au, a))).toFixed(2)}`).join(", ")}, UNPERTURBED ${unp.toFixed(2)}`,
        `THE FALL GROWS WITH THE SIZE: ${mf.every((x, i) => i === 0 || x < mf[i - 1]) ? "YES" : "NO"}`, `AT S0.1 THE NETWORKS FALL MORE THAN C02: ${mf[2] < lawFall(au, "S0.1") ? "YES" : "NO"}`].join("; ");
}
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
export function bottomLines(au) {
    const ch = au.champs, ids = armIdsOf(ch), shown = ["autopilot", "c02", "q02", ...ch], pertIds = ids.slice(4 + 3), src = (id) => (id.startsWith("c02_") ? "c02" : id.split("_").slice(0, 2).join("_"));
    const srcW = (id) => (id.startsWith("c02_") ? LAW_C02 : au.nets.find((n) => n.id === src(id)).weights);
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, lost ${lostBoth(au, a)}`;
    const lines = [];
    lines.push(`SIZES: ${ids.length} arms on ${au.range.to - au.range.from + 1} ids in both conditions; champions ${ch.join(", ")}`);
    lines.push(`PERTURBATION (L1 distance from the source and the largest single change): ${pertIds.map((id) => { const w = au.perturbed[id], s0 = srcW(id); return `${id} L1 ${l1(w, s0).toFixed(3)} max ${Math.max(...Array.from(w, (x, i) => Math.abs(x - s0[i]))).toFixed(4)}`; }).join("; ")}`);
    lines.push(`MEANS (dark / lit mean score, dark mean power, runs lost of 400): ${[...shown, ...pertIds].map(arm).join("; ")}`);
    lines.push(`FALLS (each perturbed arm minus its unperturbed self at 0.02): ${pertIds.map((id) => `${id} ${fmt(pen(au, id, src(id)))}`).join("; ")}`);
    lines.push(`PAIRED AGAINST C02 (penalised priced score at 0.02): ${[...ch, ...pertIds.filter((id) => !id.startsWith("c02_"))].map((id) => `${id} ${fmt(pen(au, id, "c02"))}`).join("; ")}`);
    lines.push(`VERDICT: ${verdictOf(au)}`);
    lines.push(`REPORTED, NOT IN THE VERDICT: unpenalised priced gain over the autopilot at 0.005 / 0.02 / 0.04: ${[...shown.slice(1), ...pertIds].map((a) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(penGainAt(au, a, p))).join(" / ")}`).join("; ")}`);
    return lines;
}
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, ch = Array.isArray(au.champs) ? au.champs : [], ids = ch.length === 3 ? armIdsOf(ch) : [], cells = ["dark", "lit"].flatMap((q) => ids.map((a) => [q, a]));
    const sizes = ids.length === 39 && n === IDS.to - IDS.from + 1 && cells.every(([q, a]) => au[q][a] && au[q][a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${IDS.to - IDS.from + 1} ids in both conditions: ${sizes}` });
    const aligned = ids.length > 0 && cells.every(([q, a]) => au[q][a] && au[q][a].every((r, i) => au[q].autopilot[i] && r.key === au[q].autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: aligned, text: `the ids are the same in every arm and condition: ${aligned}` });
    const inside = ids.length > 0 && cells.every(([q, a]) => au[q][a] && au[q][a].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const watts = ids.length > 0 && cells.every(([q, a]) => au[q][a] && au[q][a].every((r) => Number.isFinite(r.watts) && r.watts >= H15.MIN_WATTS && Number.isFinite(r.thrust)));
    rows.push({ name: "POWERS FINITE AND AT LEAST 200 W", ok: watts, text: `every mean power is a finite number of at least ${H15.MIN_WATTS} W and every mean thrust finite: ${watts}` });
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const ident = ["dark", "lit"].every((q) => au[q].law0 && au[q].law0.every((r, i) => au[q].autopilot[i] && ["score", "watts", "thrust"].every((k) => Math.abs(r[k] - au[q].autopilot[i][k]) < 1e-6)));
    rows.push({ name: "ZERO LAW IS THE AUTOPILOT", ok: ident, text: `law0 equals the autopilot in score, power and thrust on every id in both conditions (within 1e-6): ${ident}` });
    const fx = au.fixture, fixOk = !!fx && !!fx.real && !!fx.scripted && Number.isFinite(fx.real.pen) && fx.real.pen === fx.real.h21 && Number.isFinite(fx.scripted.pen) && Math.abs(fx.scripted.pen - fx.scripted.expected) < 1e-12;
    rows.push({ name: "PENALISED OBJECTIVE IS H18'S WITHOUT A LOST RUN AND SCORES A LOST RUN 0", ok: fixOk, text: `on real flights with no lost run the penalised objective equals H21's (H18's) to the last digit, and a scripted lost run scores 0 (0.65 expected): ${fixOk}` });
    const stored = (() => { try { const ref = X68.netsOf(au.rows), cs = championsOf(au.rows); return Array.isArray(au.nets) && ref.length === 12 && ref.every((r, i) => au.nets[i] && au.nets[i].id === r.id && au.nets[i].stored === r.stored && J(Array.from(au.nets[i].weights)) === J(Array.from(r.weights))) && J(cs) === J(ch) && cs.every((c) => ref.some((r) => r.id === c)); } catch (e) { return false; } })();
    rows.push({ name: "THE CHAMPIONS ARE THE REGISTERED ONES AND THE STORED 1800-ITERATION WEIGHTS", ok: !!stored, text: `the twelve stored networks are the weights at 1800 of H32's, H34's and H45's searches (963 finite weights each) and the three champions are the best of each round by its own rule: ${!!stored}` });
    const pert = (() => { try { const ref = perturbedOf(ch, au.nets), keys = Object.keys(ref); if (!au.perturbed || J(Object.keys(au.perturbed)) !== J(keys) || keys.length !== 32) return false; if (!keys.every((k) => J(Array.from(au.perturbed[k])) === J(ref[k]))) return false; const z1 = zOf(1, WEIGHT_COUNT), z2 = zOf(2, WEIGHT_COUNT), sd = (z) => Math.sqrt(avg(z.map((x) => x * x)) - avg(z) ** 2); const zerosOf = (id) => Array.from(au.nets.find((q) => q.id === id).weights).map((w, i) => (w === 0 ? i : -1)).filter((i) => i >= 0), srcOf = (k) => k.split("_").slice(0, 2).join("_"); const same = J(perturb([1, 2, 3, 0], 0.1, 1)) === J(perturb([1, 2, 3, 0], 0.1, 1)); const diff = J(perturb([1, 2, 3], 0.1, 1)) !== J(perturb([1, 2, 3], 0.1, 2)) && J(perturb([1, 2, 3], 0.1, 1)) !== J(perturb([1, 2, 3], 0.3, 1)); return Math.abs(avg(z1)) < 4 / Math.sqrt(WEIGHT_COUNT) && Math.abs(avg(z2)) < 4 / Math.sqrt(WEIGHT_COUNT) && sd(z1) > 0.9 && sd(z1) < 1.1 && sd(z2) > 0.9 && sd(z2) < 1.1 && same && diff && keys.filter((k) => !k.startsWith("c02_")).every((k) => zerosOf(srcOf(k)).every((i) => au.perturbed[k][i] === 0)); } catch (e) { return false; } })();
    rows.push({ name: "THE PERTURBATION IS AS REGISTERED", ok: !!pert, text: `every perturbed vector equals w x (1 + s x z) recomputed here from the stored weight, the size and the draw seed (zero weights stay zero; the same seed gives the same vector, another size or draw another one; the draws are normal: mean and spread of the 963 within their sampling error): ${!!pert}` });
    const o = au.original, k = au.h27, reg = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, wip has the shipped fingerprint, and q02 is the champion law of H27's stored Q02 search by H27's rule: ${!!reg}` });
    const dj = au.range.from === IDS.from && au.range.to === IDS.to && au.range.from > EARLIER_AUDIT_END;
    rows.push({ name: "THE AUDIT IS 93200-93399, PAST EVERY EARLIER AUDIT", ok: dj, text: `the audit ids are exactly 93200-93399, and every earlier audit ended at ${EARLIER_AUDIT_END} or below: ${dj}` });
    const rec = (() => { try { return ids.length > 0 && ids.every((a) => { const v = penRunsAt(au, a, PRICE); return v.length === n && v.every((s, i) => { const r = au.dark[a][i], l = au.lit[a][i]; return Math.abs(s.score - (0.5 * ((r.bad ? 0 : r.score) + (l.bad ? 0 : l.score)) - 0.02 * 0.5 * (r.watts + l.watts) / 1000)) < 1e-12; }); }); } catch (e) { return false; } })();
    rows.push({ name: "THE PER-ID SCORES ARE THE OBJECTIVE RECOMPUTED FROM THE RAW RUNS", ok: !!rec, text: `every arm's per-id penalised priced score at 0.02 equals 0.5 x (dark' + lit') - 0.02 x 0.5 x (dark kW + lit kW), a lost run scoring 0, recomputed here from the raw runs, to 1e-12: ${!!rec}` });
    const once = au.reads === 1;
    rows.push({ name: "THE AUDIT IS READ ONCE", ok: once, text: `the one flight was handed in and read exactly once: ${once}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H73: weight noise (ids ${au.range.from}-${au.range.to}, ${au.range.to - au.range.from + 1} ids, ${SECONDS} s, dark and lit; the three champions ${(au.champs || []).join(", ")} perturbed by w x (1 + s x z), s = 0.01, 0.03, 0.1, 0.3, draws 1 and 2, and c02 perturbed the same way); penalised priced score at 0.02`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    const ids = armIdsOf(au.champs);
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW; lost runs of 400):");
    for (const a of ids) R.push(`  ${a.padEnd(24)} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${kwOf(au, a, "lit").toFixed(2)}   ${lostBoth(au, a)}`);
    R.push("per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit):");
    for (const a of ids.slice(1)) R.push(`  ${a.padEnd(24)} ${f4(gainOf(au, a))} / ${f4(gainOf(au, a, "lit"))}  ${f3(extraKw(au, a))} / ${f3(extraKw(au, a, "lit"))}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
