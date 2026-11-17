// WebGLEngine/tools/ship/lesionLeftSide.mjs -- UNNUMBERED (the version is chosen at ship time; the command is tools/ship/lesionLeftSideCmd.mjs; the gate is tools/ship/lesionLeftSide-selfcheck.mjs)
//
// THE LEFT-SIDE LESION ROUND AS REGISTERED IN brain/LESION_LEFT_SIDE_WIP.md (written and committed, 4f7934e4, before this file). The plan of arms, the Holm rule, the checks and the report. Pure: no clock, no Math.random, no file (the command reads and writes).
//   Primary: EPG_L and PEG_L (by side), L5 and L7 (by glomerulus), 79 role-matched draws each, Holm-Bonferroni over the four at a family-wise 0.05.
//   Secondary (reported, never weighed): the mirrors EPG_R, PEG_R, R4, R2 at 19 draws; the left-minus-right paired difference per pair; each primary against the intact arm on the board's 2-se word.
//   Ids sb-6001 to sb-6020, 120 s, the switchboard's dropout task; draw seed 20261117; a no-op lesion (no cells) on the first two ids must equal the intact arm exactly.
"use strict";
import * as L from "../../brain/lesion.mjs";
import * as B from "../../brain/switchboard.mjs";

export const IDS = Object.freeze({ from: 6001, to: 6020 }), SECONDS = 120, SEED = 20261117, DRAWS_PRIMARY = 79, DRAWS_MIRROR = 19, ALPHA = 0.05, NOOP_IDS = Object.freeze({ from: 6001, to: 6002 });
export const PRIMARY = Object.freeze([{ cls: "EPG_L", by: "side" }, { cls: "PEG_L", by: "side" }, { cls: "L5", by: "glomerulus" }, { cls: "L7", by: "glomerulus" }].map(Object.freeze));
export const MIRRORS = Object.freeze([{ cls: "EPG_R", by: "side", of: "EPG_L" }, { cls: "PEG_R", by: "side", of: "PEG_L" }, { cls: "R4", by: "glomerulus", of: "L5" }, { cls: "R2", by: "glomerulus", of: "L7" }].map(Object.freeze));
export const INTACT = "flycx-stateful", NOOP = "flycx-stateful~noop";

/**
 * Every arm of the round, in a fixed order, for the intact arm `base` (flyCxArms' stateful arm, carrying its topology): [{ id, role: "intact" | "primary" | "primary-random" | "mirror" | "mirror-random" | "noop", cls, by, neurons, arm }].
 */
export function planArms(base) {
    const topo = base.topo; if (!topo || topo.KIND !== "reservoir") throw new Error("lesionLeftSide.planArms: the base arm must carry the fly's reservoir topology (flyCxArms)");
    const out = [{ id: INTACT, role: "intact", cls: null, by: null, neurons: [], arm: base }];
    const add = (spec, draws, kind) => {
        for (const a of L.lesionArms({ base, topo, className: spec.cls, by: spec.by, draws, seed: SEED, matched: true }))
            out.push({ id: a.id, role: a.lesion.random ? kind + "-random" : kind, cls: spec.cls, by: spec.by, neurons: [...a.lesion.neurons], arm: a });
    };
    for (const p of PRIMARY) add(p, DRAWS_PRIMARY, "primary");
    for (const m of MIRRORS) add(m, DRAWS_MIRROR, "mirror");
    out.push({ id: NOOP, role: "noop", cls: null, by: null, neurons: [], arm: { ...base, id: NOOP, entry: (id) => { const e = base.entry(id); return { ...e, weights: L.lesionWeights(topo, e.weights, []) }; } } });
    return out;
}
/** The ids an arm flies: the no-op arm the first two, every other arm all twenty. */
export const rangeOf = (role) => (role === "noop" ? { ...NOOP_IDS } : { ...IDS });
/** Fly one planned arm: the record the results file keeps (no file touched). `task` is for the gate (default the switchboard's dropout task). */
export function flyArm(p, { task = B.dropoutTask, seconds = SECONDS } = {}) {
    const runs = task.run(p.arm, rangeOf(p.role), { seconds });
    return { kind: "arm", id: p.id, role: p.role, cls: p.cls, by: p.by, neurons: p.neurons, runs };
}

/** Holm-Bonferroni at family-wise `alpha` over named p values [{ name, p }]: the same list in the input order with { rank, threshold, confirmed }; the step-down stops at the first p above its threshold. */
export function holm(list, alpha = ALPHA) {
    const m = list.length, order = list.map((x, i) => ({ ...x, i })).sort((a, b) => a.p - b.p || a.i - b.i), out = list.map((x) => ({ ...x }));
    let open = true;
    order.forEach((x, k) => { const threshold = alpha / (m - k), ok = open && x.p <= threshold + 1e-15; if (!ok) open = false; out[x.i] = { ...out[x.i], rank: k + 1, threshold, confirmed: ok }; });
    return out;
}
/** The registered bottom line for the names of the confirmed primary classes. */
export function bottomLine(confirmed) {
    const n = confirmed.length, names = confirmed.join(", ");
    if (n === 0) return "LEFT-SIDE ROUND: NOT REPLICATED -- no primary class is confirmed: the exploratory floor was chance, as far as 20 fresh ids and 79 fresh draws can tell";
    if (n === 1) return `LEFT-SIDE ROUND: ONE CLASS CONFIRMED (${names}) -- not a left-side pattern`;
    if (n < 4) return `LEFT-SIDE ROUND: PARTLY REPLICATED -- ${n} of 4 primary classes confirmed (${names})`;
    return `LEFT-SIDE ROUND: REPLICATED -- all four left-side classes (${names}) cost more than random sets of their size and role`;
}

const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const seOf = (a) => { if (a.length < 2) return 0; const m = meanOf(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1) / a.length); };
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4);
/** The cost of a lesion record against the intact record: the mean over ids of intact - lesioned (the same ids in the same order). */
export const costOf = (lesioned, intact) => meanOf(lesioned.runs.map((r, i) => intact.runs[i].score - r.score));
/** Rank p of `c` among `rc`: (1 + #{rc >= c - 1e-12}) / (1 + rc.length), as brain/lesion.mjs lesionReading counts it. */
export const rankP = (c, rc) => (1 + rc.filter((x) => x >= c - 1e-12).length) / (1 + rc.length);

/**
 * The registered checks over the records and the header: a list of failure strings (empty = all pass). `ctx` = { plan (planArms' list), sha256 (of the weights file now) }.
 */
export function checks(records, { plan, sha256 }) {
    const fails = [], head = records.find((r) => r.kind === "header"), arms = records.filter((r) => r.kind === "arm"), byId = new Map();
    if (!head) fails.push("HEADER: the results file has no header record");
    else {
        if (head.sha256 !== sha256) fails.push(`WEIGHTS: the results were flown on weights ${head.sha256}, the file now is ${sha256}`);
        if (head.seed !== SEED || head.from !== IDS.from || head.to !== IDS.to || head.seconds !== SECONDS) fails.push(`HEADER: seed ${head.seed}, ids ${head.from}-${head.to}, ${head.seconds} s against the registered ${SEED}, ${IDS.from}-${IDS.to}, ${SECONDS} s`);
    }
    for (const r of arms) { if (byId.has(r.id)) fails.push(`COMPLETE: arm ${r.id} appears twice`); byId.set(r.id, r); }
    for (const p of plan) if (!byId.has(p.id)) fails.push(`COMPLETE: arm ${p.id} is missing`);
    for (const r of arms) if (!plan.some((p) => p.id === r.id)) fails.push(`COMPLETE: arm ${r.id} is not in the registered plan`);
    for (const p of plan) {
        const r = byId.get(p.id); if (!r) continue;
        const want = rangeOf(p.role), keys = Array.from({ length: want.to - want.from + 1 }, (_, i) => "sb-" + (want.from + i));
        if (r.runs.length !== keys.length || r.runs.some((x, i) => x.key !== keys[i])) { fails.push(`IDS: arm ${p.id} flew ${r.runs.map((x) => x.key).join(",")}`); continue; }
        if (r.neurons.join() !== p.neurons.join()) fails.push(`DRAWS: arm ${p.id} silenced ${r.neurons.join(" ")}, the seed gives ${p.neurons.join(" ")}`);
    }
    for (const [list, n] of [[PRIMARY, DRAWS_PRIMARY], [MIRRORS, DRAWS_MIRROR]]) for (const c of list) {
        const d = plan.filter((p) => p.cls === c.cls && p.role.endsWith("-random"));
        if (d.length !== n) fails.push(`DRAWS: ${c.cls} has ${d.length} random sets, ${n} registered`);
    }
    const intact = byId.get(INTACT), noop = byId.get(NOOP);
    if (intact && noop && noop.runs.some((x, i) => x.score !== intact.runs[i].score)) fails.push("NO-OP: the lesion of no cells does not fly the intact arm exactly");
    return fails;
}

/** The report's lines (the checks first when any fails, and the verdict then marked NOT WEIGHED). */
export function reportLines(records, { plan, sha256 }) {
    const fails = checks(records, { plan, sha256 }), lines = [], by = new Map(records.filter((r) => r.kind === "arm").map((r) => [r.id, r])), intact = by.get(INTACT);
    if (fails.length) lines.push(`CHECKS FAILED (${fails.length}) -- the verdict below is NOT WEIGHED:`, ...fails.map((f) => "  " + f)); else lines.push("CHECKS: IDS, WEIGHTS, DRAWS, COMPLETE, NO-OP all pass");
    if (!intact) return [...lines, "no intact arm: nothing to read"];
    const score = meanOf(intact.runs.map((r) => r.score));
    lines.push(`intact ${INTACT}: mean score ${score.toFixed(4)} on ${intact.runs.length} ids (sb-${IDS.from} to sb-${IDS.to}, ${SECONDS} s)`);
    const study = (c) => {
        const cls = plan.find((p) => p.cls === c.cls && !p.role.endsWith("-random") && p.role !== "intact"), rec = cls && by.get(cls.id);
        const rs = plan.filter((p) => p.cls === c.cls && p.role.endsWith("-random")).map((p) => by.get(p.id)).filter(Boolean);
        if (!rec || !rs.length) return null;
        const cost = costOf(rec, intact), rc = rs.map((r) => costOf(r, intact)), d = rec.runs.map((r, i) => r.score - intact.runs[i].score), pr = { mean: meanOf(d), se: seOf(d) };
        return { cls: c.cls, n: cls.neurons.length, cost, rc, p: rankP(cost, rc), board: B.readingOf(pr), pr };
    };
    const prim = PRIMARY.map(study);
    if (prim.some((s) => !s)) return [...lines, "a primary class or its draws were not flown: no verdict"];
    const h = holm(prim.map((s) => ({ name: s.cls, p: s.p })));
    lines.push("PRIMARY (Holm-Bonferroni over four at a family-wise 0.05; 79 role-matched draws each, the smallest p is 0.0125):");
    prim.forEach((s, i) => {
        const x = h[i], lo = Math.min(...s.rc), hi = Math.max(...s.rc);
        lines.push(`  ${s.cls.padEnd(6)} (${s.n} cells): cost ${sgn(s.cost)} (${(100 * s.cost / score).toFixed(2)} percent of the intact score), random ${sgn(lo)} .. ${sgn(hi)}, rank p ${s.p.toFixed(4)}; Holm step ${x.rank} needs ${x.threshold.toFixed(4)}: ${x.confirmed ? "CONFIRMED" : "NOT CONFIRMED"}; against the intact arm ${s.board === "WORSE" ? "IS BELOW" : s.board === "BETTER" ? "BEATS" : "TIES"} (${sgn(s.pr.mean)}, se ${s.pr.se.toFixed(4)})${x.confirmed && s.cost / score < 0.01 ? " -- a cost under 1 percent of the score" : ""}`);
    });
    lines.push((fails.length ? "[NOT WEIGHED] " : "") + bottomLine(prim.filter((_, i) => h[i].confirmed).map((s) => s.cls)));
    lines.push("SECONDARY (reported, never weighed):");
    for (const m of MIRRORS) {
        const s = study(m); if (!s) { lines.push(`  ${m.cls}: not flown`); continue; }
        const L_ = by.get(plan.find((p) => p.cls === m.of && p.role === "primary").id), R_ = by.get(plan.find((p) => p.cls === m.cls && p.role === "mirror").id);
        const d = R_.runs.map((r, i) => r.score - L_.runs[i].score), w = B.readingOf({ mean: meanOf(d), se: seOf(d) });
        lines.push(`  mirror ${m.cls.padEnd(6)} of ${m.of}: cost ${sgn(s.cost)}, rank p ${s.p.toFixed(3)} (19 draws, smallest 0.05); left minus right (right-lesion score - left-lesion score) ${sgn(meanOf(d))}, se ${seOf(d).toFixed(4)}: ${w === "BETTER" ? "the left lesion costs more" : w === "WORSE" ? "the right lesion costs more" : "TIES"}`);
    }
    return lines;
}
