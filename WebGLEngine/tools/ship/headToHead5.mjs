// WebGLEngine/tools/ship/headToHead5.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead5Cmd.mjs; the gate is tools/ship/headToHead5-selfcheck.mjs)
//
// ROUND H5 of brain/HEAD_TO_HEAD.md (registered before this file existed): the connectome-wired 963-weight network (`Wip`, the Giant Fiber Circuit) against ten random wirings of its size (`er:0..9`) and ten dense nets of its weight count
// (`dense:0..9`), every control trained by the SAME recipe (four (1+1)-ES searches from the hand weights, 400 iterations, sigma 0.3, pruned, the champion picked on HELD_OUT_SET), flown on the tank's compass dropout (200 fresh ids, dark and lit)
// through the switchboard, and read as paired differences with a registered verdict. Reads nothing from disk (the command hands the champion records and the Wip weights in). THE IDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as GFC from "../../brain/gfcTopology.mjs";
import * as PF from "../../brain/pilotSubFish.mjs";
import * as T from "../../brain/subTask.mjs";

export const IDS = Object.freeze({ from: 5000, to: 5199 }), SECONDS = 160;
export const RECIPE = Object.freeze({ runs: 4, iters: 400, sigma: 0.3, maxK: 4 });
export const COUNTS = Object.freeze({ er: 10, dense: 10 }), DENSE_NEURONS = 23, LEARN_MARGIN = 0.02, SUPPORT_MIN = 9, LEARN_MIN = 8;
export const WEIGHTS_OF = Object.freeze({ er: 963, dense: 947 });
/** The control specs in order: er:0 .. er:9, dense:0 .. dense:9. */
export const SPECS = Object.freeze([...Array.from({ length: COUNTS.er }, (_, c) => "er:" + c), ...Array.from({ length: COUNTS.dense }, (_, c) => "dense:" + c)]);
export const ARM_IDS = Object.freeze(["autopilot", "network-Wip", ...SPECS.map((s) => s.replace(":", "-"))]);
export const armIdOf = (spec) => spec.replace(":", "-");
export const familyOf = (spec) => spec.split(":")[0], indexOf = (spec) => Number(spec.split(":")[1]);
const TRAINED_IDS = Object.freeze(ARM_IDS.filter((a) => a !== "autopilot"));

/** Parse `er:3` / `dense:0`, or throw naming the fault. */
export function parseSpec(spec) {
    const m = /^(er|dense):(\d+)$/.exec(String(spec));
    if (!m) throw new Error(`headToHead5.parseSpec: ${JSON.stringify(spec)} is not er:K or dense:K`);
    const k = Number(m[2]); if (k >= COUNTS[m[1]]) throw new Error(`headToHead5.parseSpec: ${spec} is past ${m[1]}:${COUNTS[m[1]] - 1}`);
    return { family: m[1], index: k };
}
/** The circuit of a control: `er:c` a random circuit with the GFC's neuron and synapse counts (seed 6300 + c), `dense:c` every ordered pair of 23 neurons but self-loops (the same circuit for every c). */
export function topologyOf(spec) {
    const { family, index } = parseSpec(spec);
    if (family === "er") return PF.controlTopology(GFC, 6300 + index);
    const edges = []; for (let to = 0; to < DENSE_NEURONS; to++) for (let from = 0; from < DENSE_NEURONS; from++) if (to !== from) edges.push([to, from]);
    return Object.freeze({ NEURON_ORDER: Object.freeze(Array.from({ length: DENSE_NEURONS }, (_, i) => 9500 + i)), EDGES: Object.freeze(edges) });
}
const policies = new Map();
/** The pilot policy of a control (cached): features, forward pass, hand weights, training, as brain/pilotSubPolicy.mjs makes them for any circuit. */
export function policyOf(spec) {
    if (!policies.has(spec)) policies.set(spec, PS.createSubPolicy(topologyOf(spec), "headToHead5 " + spec));
    return policies.get(spec);
}
/** The seed of search k of a control: 6310 + 10 c + k for er, 6510 + 10 c + k for dense. */
export const searchSeed = (spec, k) => (familyOf(spec) === "er" ? 6310 : 6510) + 10 * indexOf(spec) + k;
/** One search of a control by the recipe (or by `opts` for the gate: { iters, sigma, maxK, trainSet, heldSet }): { spec, k, seed, weights, trainScore, heldScore, improved, neutral, moved, kept }. Deterministic for (spec, k, opts). */
export function searchOne(spec, k, opts = {}) {
    if (!Number.isInteger(k) || k < 0 || k >= RECIPE.runs) throw new Error(`headToHead5.searchOne: search k must be 0..${RECIPE.runs - 1}, got ${JSON.stringify(k)}`);
    const o = { iters: RECIPE.iters, sigma: RECIPE.sigma, maxK: RECIPE.maxK, ...opts }, P = policyOf(spec), seed = searchSeed(spec, k), trainSet = o.trainSet || T.TRAIN_SET;
    const found = P.train({ seed, iters: o.iters, sigma: o.sigma, maxK: o.maxK, trainSet }), out = P.prune(found.weights, { trainSet }), held = P.evaluate(out.weights, o.heldSet || T.HELD_OUT_SET);
    return { spec, k, seed, weights: Array.from(out.weights), trainScore: out.trainScore, heldScore: held.score, improved: found.improved, neutral: found.neutral, moved: out.moved, kept: out.kept };
}
/** The champion of a control's searches: the best heldScore, ties to the smaller k; throws unless there are exactly RECIPE.runs searches of that one spec with distinct k. */
export function championOf(spec, runs) {
    parseSpec(spec);
    if (!Array.isArray(runs) || runs.length !== RECIPE.runs) throw new Error(`headToHead5.championOf: ${spec} needs exactly ${RECIPE.runs} searches, got ${Array.isArray(runs) ? runs.length : JSON.stringify(runs)}`);
    if (runs.some((r) => r.spec !== spec) || new Set(runs.map((r) => r.k)).size !== RECIPE.runs) throw new Error(`headToHead5.championOf: the searches of ${spec} must be of that spec and have distinct k`);
    const best = [...runs].sort((a, b) => b.heldScore - a.heldScore || a.k - b.k)[0];
    return { spec, weights: best.weights, heldScore: best.heldScore, seed: best.seed, k: best.k, searches: runs.map((r) => ({ k: r.k, seed: r.seed, trainScore: r.trainScore, heldScore: r.heldScore })).sort((a, b) => a.k - b.k) };
}
/** The tank kind of a control (the shape of render/subAquariumFlyCx.mjs): its circuit name is `h5-<spec>`, its pilot the policy's own. */
export function kindOf(spec) {
    const P = policyOf(spec);
    return Object.freeze({ circuit: "h5-" + spec, label: "H5 " + spec, weightCount: P.WEIGHT_COUNT, persist: false, build: (weights) => P.pilotFor(Float32Array.from(weights)) });
}
/** The board arm of a control champion: controls are the autopilot and `network-Wip`. */
export function armOf(spec, weights) {
    const kind = kindOf(spec);
    if (!Array.isArray(weights) || weights.length !== kind.weightCount) throw new Error(`headToHead5.armOf: ${spec} takes ${kind.weightCount} weights, got ${Array.isArray(weights) ? weights.length : JSON.stringify(weights)}`);
    return { id: armIdOf(spec), layer: "flying", controls: ["autopilot", "network-Wip"], note: `H5 control ${spec}: ${kind.weightCount} weights`, entry: () => ({ pilot: "network", circuit: kind.circuit, weights: Array.from(weights) }), register: (tank) => tank.registerPilotKind(kind.circuit, kind) };
}
/** The board: the dropout task, the autopilot, `network-Wip` (the GFC's own network, flown by the tank's built-in circuit) and the twenty controls. `wip` = 963 numbers; `champions` = a Map of champion records by spec (all twenty). */
export function boardOf(wip, champions) {
    if (!Array.isArray(wip) || wip.length !== 963) throw new Error("headToHead5.boardOf: wip must be an array of 963 numbers");
    for (const s of SPECS) if (!champions || typeof champions.get !== "function" || !champions.get(s)) throw new Error(`headToHead5.boardOf: no champion for ${s}`);
    const b = B.createBoard().addTask(B.dropoutTask);
    for (const a of B.flyingArms({ Wip: wip })) { if (a.id !== "autopilot") a.controls = ["autopilot"]; b.addArm(a); }
    for (const s of SPECS) b.addArm(armOf(s, champions.get(s).weights));
    return b;
}
/** EVERY arm once, dark and lit, on `range` ids: { dark, lit, range, seconds, champions (the records, for the checks and the report) }. */
export function audit(wip, champions, { range = IDS, seconds = SECONDS } = {}) {
    const b = boardOf(wip, champions);
    return { dark: b.run("dropout", [...ARM_IDS], range, { seconds }).runs, lit: b.run("dropout", [...ARM_IDS], range, { seconds, event: null }).runs, range, seconds, champions };
}
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
/** `a` minus `b` in the condition ("dark" or "lit"), pooled and paired. */
export const pairOf = (au, a, b, cond) => mk(B.paired(au[cond][a], au[cond][b]));
export const meanOf = (au, a, cond) => au[cond][a].reduce((s, r) => s + r.score, 0) / au[cond][a].length;
const gainOf = (au, a, cond) => pairOf(au, a, "autopilot", cond).mean;
const sdOf = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1)); };
const specsOf = (family) => SPECS.filter((s) => familyOf(s) === family);
/** How many controls of the family beat the autopilot in the dark by more than LEARN_MARGIN on the score. */
export const learnedCount = (au, family) => specsOf(family).filter((s) => gainOf(au, armIdOf(s), "dark") > LEARN_MARGIN).length;
/** How many controls of the family `network-Wip` reads `want` against, in `cond`. */
export const winsOver = (au, family, want, cond = "dark") => specsOf(family).filter((s) => pairOf(au, "network-Wip", armIdOf(s), cond).reading === want).length;
/** The registered verdict. */
export function verdictOf(au) {
    const er = learnedCount(au, "er"), de = learnedCount(au, "dense");
    if (er < LEARN_MIN || de < LEARN_MIN) return "NOT ASSESSED: THE CONTROLS DID NOT LEARN";
    return winsOver(au, "er", "BETTER") >= SUPPORT_MIN && winsOver(au, "dense", "BETTER") >= SUPPORT_MIN ? "THE WIRING IS SUPPORTED" : "THE WIRING IS NOT SUPPORTED";
}
/** The rank of `network-Wip` among the twenty-one trained arms by dark mean (1 = best; an exact tie counts the others as ahead only when strictly higher). */
export const rankOfWip = (au) => 1 + TRAINED_IDS.filter((a) => a !== "network-Wip" && meanOf(au, a, "dark") > meanOf(au, "network-Wip", "dark")).length;
const lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4);
const stat = (xs) => `${f4(xs.reduce((a, b) => a + b, 0) / xs.length)} (sd ${sdOf(xs).toFixed(4)}, range ${f4(Math.min(...xs))} to ${f4(Math.max(...xs))})`;
export function bottomLines(au) {
    const er = learnedCount(au, "er"), de = learnedCount(au, "dense"), learned = er >= LEARN_MIN && de >= LEARN_MIN;
    const gains = (family) => specsOf(family).map((s) => gainOf(au, armIdOf(s), "dark"));
    const lostC = (family) => specsOf(family).map((s) => lostBoth(au, armIdOf(s))), sum = (a) => a.reduce((x, y) => x + y, 0);
    return [
        `THE CONTROLS ${learned ? "LEARNED" : "DID NOT LEARN"}: ${er} OF 10 RANDOM WIRINGS AND ${de} OF 10 DENSE NETS BEAT THE AUTOPILOT IN THE DARK BY MORE THAN ${LEARN_MARGIN}`,
        `THE CONNECTOME NETWORK BEATS ${winsOver(au, "er", "BETTER")} OF 10 RANDOM WIRINGS AND ${winsOver(au, "dense", "BETTER")} OF 10 DENSE NETS IN THE DARK; TIES ${winsOver(au, "er", "TIES")} AND ${winsOver(au, "dense", "TIES")}; IS BELOW ${winsOver(au, "er", "WORSE")} AND ${winsOver(au, "dense", "WORSE")}`,
        `THE CONNECTOME NETWORK RANKS ${rankOfWip(au)} OF 21 BY DARK MEAN`,
        `DARK GAIN OVER THE AUTOPILOT: CONNECTOME ${f4(gainOf(au, "network-Wip", "dark"))}; RANDOM WIRINGS ${stat(gains("er"))}; DENSE NETS ${stat(gains("dense"))}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, connectome ${lostBoth(au, "network-Wip")}, random wirings ${sum(lostC("er"))} (${Math.max(...lostC("er"))} in the worst), dense nets ${sum(lostC("dense"))} (${Math.max(...lostC("dense"))} in the worst)`,
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
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const champs = SPECS.every((s) => { const c = au.champions && au.champions.get(s); return c && c.weights.length === WEIGHTS_OF[familyOf(s)] && c.searches && c.searches.length === RECIPE.runs; });
    rows.push({ name: "CHAMPIONS OF FOUR SEARCHES", ok: !!champs, text: `every control is the champion of exactly ${RECIPE.runs} searches with its circuit's weight count (963 er, 947 dense): ${!!champs}` });
    const distinct = new Set(TRAINED_IDS.map((a) => (au.dark[a] || []).map((r) => r.score).join("|"))).size === TRAINED_IDS.length;
    rows.push({ name: "ARMS DISTINCT", ok: distinct, text: `the ${TRAINED_IDS.length} trained arms are pairwise different in the dark: ${distinct}` });
    const edgeKey = (s) => topologyOf(s).EDGES.map((e) => e.join(",")).join(";"), erTop = new Set(specsOf("er").map(edgeKey)).size === COUNTS.er;
    rows.push({ name: "TOPOLOGIES DISTINCT", ok: erTop, text: `the ${COUNTS.er} random wirings are pairwise different circuits: ${erTop}` });
    return rows;
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function report(au) {
    const L = [`ROUND H5: the connectome network against random wirings and dense nets. Ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    L.push("means (dark / lit) and the champion's held-out score in training:");
    for (const a of ARM_IDS) {
        const spec = SPECS.find((s) => armIdOf(s) === a), held = spec ? `   held-out ${au.champions.get(spec).heldScore.toFixed(4)} (searches ${au.champions.get(spec).searches.map((s) => s.heldScore.toFixed(3)).join(" ")})` : "";
        L.push(`  ${a.padEnd(12)} ${meanOf(au, a, "dark").toFixed(4)} / ${meanOf(au, a, "lit").toFixed(4)}${held}`);
    }
    L.push("gains over the autopilot, dark / lit:");
    for (const a of TRAINED_IDS) L.push(`${a}:`, `   dark ${fmt(pairOf(au, a, "autopilot", "dark"))}`, `   lit  ${fmt(pairOf(au, a, "autopilot", "lit"))}`);
    L.push("the connectome network minus each control, dark / lit:");
    for (const s of SPECS) L.push(`${armIdOf(s)}:`, `   dark ${fmt(pairOf(au, "network-Wip", armIdOf(s), "dark"))}`, `   lit  ${fmt(pairOf(au, "network-Wip", armIdOf(s), "lit"))}`);
    L.push(`lit tank: the connectome network beats ${winsOver(au, "er", "BETTER", "lit")} OF 10 random wirings and ${winsOver(au, "dense", "BETTER", "lit")} OF 10 dense nets; ties ${winsOver(au, "er", "TIES", "lit")} and ${winsOver(au, "dense", "TIES", "lit")}; is below ${winsOver(au, "er", "WORSE", "lit")} and ${winsOver(au, "dense", "WORSE", "lit")}`);
    for (const l of bottomLines(au)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
