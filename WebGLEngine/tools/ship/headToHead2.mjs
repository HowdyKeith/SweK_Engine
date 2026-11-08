// WebGLEngine/tools/ship/headToHead2.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead2Cmd.mjs; the gate is tools/ship/headToHead2-selfcheck.mjs)
//
// ROUND H2 of brain/HEAD_TO_HEAD.md (registered before this file existed): the eight 963-weight networks, the untrained hand weights, the leaky unit (and its lesion), five rung 4b plain nets and the PD autopilot flown on the
// tank's compass dropout (200 fresh ids, dark and lit) through the switchboard, and read as paired differences: each network against each plain net, each plain net and the leaky unit against the autopilot and the leaky unit,
// and which gains are specific to the dark. Reads nothing from disk (the command hands the weights and the champion records in). THE IDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as L from "../../brain/pilotLeakyHeading.mjs";
import * as PNK from "../../render/subAquariumPlainNet.mjs";
import { NETWORK_NAMES } from "./headToHead.mjs";

export { NETWORK_NAMES };
export const PLAIN_SPECS = Object.freeze(["P/B/mn:3", "P/whole/mn:0", "E/whole/mn:1", "P/B/mg:0", "E/E/mn:0"]);
export const IDS = Object.freeze({ from: 3000, to: 3199 }), SECONDS = 160;
const netId = (n) => "network-" + n, plainId = (s) => `${PNK.PREFIX}-${s}`;
export const ARM_IDS = Object.freeze(["autopilot", "network-hand", ...NETWORK_NAMES.map(netId), "leaky-unit", "leaky-unit-off", ...PLAIN_SPECS.map(plainId)]);
/** The sixteen arms that must differ from one another (the lesion is the autopilot by construction). */
export const DISTINCT_IDS = Object.freeze(ARM_IDS.filter((a) => a !== "leaky-unit-off"));

/** The board for this round. `weights` = { hand, <network name>: 963 numbers }; `records` = a Map of plain-net champion records by spec (every spec of PLAIN_SPECS must be there). */
export function boardOf(weights, records) {
    for (const n of ["hand", ...NETWORK_NAMES]) if (!weights || !Array.isArray(weights[n] || null) || weights[n].length !== 963) throw new Error(`headToHead2.boardOf: weights.${n} must be an array of 963 numbers`);
    for (const s of PLAIN_SPECS) if (!records || typeof records.get !== "function" || !records.get(s)) throw new Error(`headToHead2.boardOf: no plain-net champion ${JSON.stringify(s)}`);
    const b = B.createBoard().addTask(B.dropoutTask);
    for (const a of B.flyingArms(Object.fromEntries(["hand", ...NETWORK_NAMES].map((n) => [n, weights[n]])))) {
        if (a.id !== "autopilot") a.controls = ["autopilot"];
        b.addArm(a);
    }
    b.addArm(L.leakyArm());
    b.addArm(L.leakyArm({ id: "leaky-unit-off", weights: [L.DEFAULTS.sigma, 0], controls: [] }));
    for (const s of PLAIN_SPECS) b.addArm(PNK.plainNetArm({ record: records.get(s), controls: ["autopilot", "leaky-unit"] }));
    return b;
}
/** EVERY arm once, dark (the compass dropout) and lit (no event), on `range` ids. Returns { dark: runs by arm, lit: runs by arm, range, seconds }. */
export function audit(weights, records, { range = IDS, seconds = SECONDS } = {}) {
    const b = boardOf(weights, records);
    return { dark: b.run("dropout", [...ARM_IDS], range, { seconds }).runs, lit: b.run("dropout", [...ARM_IDS], range, { seconds, event: null }).runs, range, seconds };
}
const diffRuns = (ra, rb) => ra.map((r, i) => ({ key: r.key, score: r.score - rb[i].score, bad: false }));
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
/** One arm's readings against the autopilot: dark, lit, and the dark-specific difference (dark gain minus lit gain, per id). */
export function gainOf(au, id) {
    return {
        id, dark: mk(B.paired(au.dark[id], au.dark.autopilot)), lit: mk(B.paired(au.lit[id], au.lit.autopilot)),
        specific: mk(B.paired(diffRuns(au.dark[id], au.dark.autopilot), diffRuns(au.lit[id], au.lit.autopilot))),
    };
}
/** `a` against `b` in the dark. */
export const darkPair = (au, a, b) => mk(B.paired(au.dark[a], au.dark[b]));
const lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0);
const lostBoth = (au, id) => lostOf(au.dark[id]) + lostOf(au.lit[id]);
const list = (xs) => xs.join(", ");
/** The 40 network-against-plain-net pairs, each { network, plain, p } with p the paired difference in the dark. */
export function networkPlainPairs(au) {
    const out = [];
    for (const n of NETWORK_NAMES) for (const s of PLAIN_SPECS) out.push({ network: n, plain: s, p: darkPair(au, netId(n), plainId(s)) });
    return out;
}
export function bottomLines(au) {
    const pairs = networkPlainPairs(au), count = (w) => pairs.filter((x) => x.p.reading === w).length;
    const beatAll = NETWORK_NAMES.filter((n) => PLAIN_SPECS.every((s) => pairs.find((x) => x.network === n && x.plain === s).p.reading === "BETTER"));
    const pg = PLAIN_SPECS.map((s) => gainOf(au, plainId(s))), pname = (f) => pg.filter(f).map((g) => g.id.slice(PNK.PREFIX.length + 1));
    const pDark = pname((g) => g.dark.reading === "BETTER"), pLit = pname((g) => g.lit.reading === "BETTER"), pSpec = pname((g) => g.specific.reading === "BETTER");
    const lk = gainOf(au, "leaky-unit"), word = lk.dark.reading === "BETTER" ? "BEATS" : lk.dark.reading === "WORSE" ? "IS BELOW" : "TIES";
    const pVsLeaky = PLAIN_SPECS.filter((s) => darkPair(au, plainId(s), "leaky-unit").reading === "BETTER");
    const ng = NETWORK_NAMES.map((n) => gainOf(au, netId(n))), nBeat = ng.filter((g) => g.dark.reading === "BETTER"), nSpec = ng.filter((g) => g.specific.reading === "BETTER").map((g) => g.id.slice(8));
    const lostP = PLAIN_SPECS.map((s) => lostBoth(au, plainId(s))), lostN = NETWORK_NAMES.map((n) => lostBoth(au, netId(n)));
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    return [
        `NETWORKS AGAINST PLAIN NETS IN THE DARK: ${count("BETTER")} OF ${pairs.length} PAIRS READ BETTER, ${count("TIES")} TIE, ${count("WORSE")} WORSE; ${list(beatAll) || "none"} BEAT ALL FIVE PLAIN NETS`,
        `PLAIN NETS BEAT THE AUTOPILOT IN THE DARK: ${pDark.length} OF 5 (${list(pDark) || "none"}); IN THE LIT TANK: ${pLit.length} OF 5 (${list(pLit) || "none"}); THE GAIN IS DARK-SPECIFIC IN ${pSpec.length} OF 5 (${list(pSpec) || "none"})`,
        `THE LEAKY UNIT ${word} THE AUTOPILOT IN THE DARK AND ITS GAIN ${lk.specific.reading === "BETTER" ? "IS" : "IS NOT"} DARK-SPECIFIC`,
        `${pVsLeaky.length} OF 5 PLAIN NETS BEAT THE LEAKY UNIT IN THE DARK (${list(pVsLeaky) || "none"})`,
        `${nBeat.length} OF ${NETWORK_NAMES.length} NETWORKS BEAT THE AUTOPILOT IN THE DARK; THE GAIN IS DARK-SPECIFIC IN ${nSpec.length} (${list(nSpec) || "none"})`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, leaky unit ${lostBoth(au, "leaky-unit")}, plain nets ${sum(lostP)} (${Math.max(...lostP)} in the worst), networks ${sum(lostN)} (${Math.max(...lostN)} in the worst)`,
    ];
}
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((c) => ARM_IDS.map((a) => [c, a]));
    const sizes = cells.every(([c, a]) => au[c][a] && au[c][a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids in both conditions: ${sizes}` });
    const same = cells.every(([c, a]) => au[c][a] && au[c][a].every((r, i) => au[c].autopilot[i] && r.key === au[c].autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: same, text: `the ids are the same in every arm and condition: ${same}` });
    const inside = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const event = au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const lesion = ["dark", "lit"].every((c) => au[c]["leaky-unit-off"] && au[c]["leaky-unit-off"].every((r, i) => au[c].autopilot[i] && r.score === au[c].autopilot[i].score));
    rows.push({ name: "LESION IS THE AUTOPILOT", ok: lesion, text: `leaky-unit-off equals the autopilot on every id, dark and lit: ${lesion}` });
    const distinct = new Set(DISTINCT_IDS.map((a) => au.dark[a].map((r) => r.score).join("|"))).size === DISTINCT_IDS.length;
    rows.push({ name: "ARMS DISTINCT", ok: distinct, text: `the ${DISTINCT_IDS.length} arms other than the lesion are pairwise different in the dark: ${distinct}` });
    return rows;
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function report(au) {
    const L2 = [`ROUND H2: the networks, the plain nets and the leaky unit on the compass dropout. Ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L2.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { L2.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L2; }
    const mean = (runs) => runs.reduce((s, r) => s + r.score, 0) / runs.length;
    L2.push("means (dark / lit):");
    for (const a of ARM_IDS) L2.push(`  ${a.padEnd(24)} ${mean(au.dark[a]).toFixed(4)} / ${mean(au.lit[a]).toFixed(4)}`);
    L2.push("gains over the autopilot:");
    for (const a of ARM_IDS.filter((x) => x !== "autopilot")) {
        const g = gainOf(au, a);
        L2.push(`${a}:`, `   dark          ${fmt(g.dark)}`, `   lit           ${fmt(g.lit)}`, `   dark-specific ${fmt(g.specific)}`);
    }
    L2.push("plain nets against the leaky unit, dark:");
    for (const s of PLAIN_SPECS) L2.push(`   ${s.padEnd(14)} ${fmt(darkPair(au, plainId(s), "leaky-unit"))}`);
    L2.push("networks against plain nets, dark (rows networks, columns " + PLAIN_SPECS.join(" | ") + "):");
    const pairs = networkPlainPairs(au);
    for (const n of NETWORK_NAMES) L2.push(`   ${n.padEnd(12)} ` + PLAIN_SPECS.map((s) => { const p = pairs.find((x) => x.network === n && x.plain === s).p; return `${sgn(p.mean)} ${p.reading}`; }).join(" | "));
    const pg = PLAIN_SPECS.map((s) => gainOf(au, plainId(s)).dark.mean), ng = NETWORK_NAMES.map((n) => gainOf(au, netId(n)).dark.mean);
    L2.push(`spread of the five plain nets' dark gains: ${sgn(Math.min(...pg))} to ${sgn(Math.max(...pg))}; of the eight networks': ${sgn(Math.min(...ng))} to ${sgn(Math.max(...ng))}`);
    for (const l of bottomLines(au)) L2.push(`BOTTOM LINE: ${l}`);
    return L2;
}
