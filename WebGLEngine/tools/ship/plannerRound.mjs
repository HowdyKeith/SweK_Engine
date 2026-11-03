// WebGLEngine/tools/ship/plannerRound.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerRoundCmd.mjs; the gate is tools/ship/plannerRound-selfcheck.mjs)
//
// ROUND 11 of brain/NEEDS_AND_LIMITS.md ("a planned visiting order on the tuned rule", registered first, amended before any audit seed was read): flies TUNED-R8, the planner in nearest mode (the identity), the TWIN planner and the hindsight oracle once on the fresh
// audits (761-864, far and both) and reads the one registered verdict. THE AUDITS ARE READ ONLY BY audits(). No clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as S from "../../physics/mechanics/subModel6dof.mjs";
import * as N from "../../physics/mechanics/subNeeds.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as P from "../../brain/plannerSeat.mjs";
import { judge, verdictOf } from "./trainResidual.mjs";
import { oracleRuns, gapShare, HARD } from "./stationRound.mjs";

export { HARD, gapShare };
export const AUDIT_RANGES = Object.freeze({ Y1: [761, 784], Y2: [801, 824], Y3: [841, 864] }), AUDIT_NAMES = Object.freeze(["Y1", "Y2", "Y3"]);
export const ARMS = Object.freeze(["TUNED-R8", "PLANNER-NEAREST", "PLANNER-TWIN", "ORACLE-ORDER"]);
const GAUGE = T.GAUGE;
let FLIGHT = {};
/** Flight options for every flight this library makes (the gate shortens dives with { seconds } for the rows that do not depend on their length; the real run never calls this). */
export const setFlight = (o) => { FLIGHT = { ...o }; };

/** The flyable pilot of one arm (not the oracle). `r8` the tuned rule's parameters; `seconds` shortens the twin's rollouts (the gate only). */
export function pilotOf(arm, { r8 = null, seconds = FLIGHT.seconds } = {}) {
    if (!r8) throw new Error("plannerRound.pilotOf: the tuned rule's parameters (r8) are needed");
    if (arm === "TUNED-R8") return T.flyDecision(U.tunedSeat(r8, U.WIDE_BOUNDS));
    if (arm === "PLANNER-NEAREST") return T.flyDecision(P.plannerSeat(r8, { mode: "nearest" }));
    if (arm === "PLANNER-TWIN") return T.flyDecision(P.plannerSeat(r8, { mode: "twin", ...(seconds ? { seconds } : {}) }));
    throw new Error(`plannerRound.pilotOf: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")}; the oracle is oracleRuns)`);
}
export const scoreOf = (arm, opts, set) => T.evaluate(pilotOf(arm, opts), set, { gauge: GAUGE, ...FLIGHT });

/** The real run's start state, rebuilt from a scenario exactly as needsTask.fly builds it (for the rollout identity check). */
export function startOf(sc) {
    const m = T.model();
    return { model: m, st: { ...S.createState({ depth: sc.depth0, speed: 2, model: m }), tank: S.initialTank(m) }, nd: { ...N.initialNeeds(T.CLASS, { crushDepth: T.CRUSH }), energy: sc.frac0 * N.CLASSES[T.CLASS].capacityJ, damage: sc.damage0 } };
}
/** The rollout of nearest-first from the start of `sc` and the real noise-free dive of the same pilot: the twin's simulator must BE the real one. Returns { rollout, real }. */
export function rolloutIdentity(r8, sc, seconds = T.SECONDS) {
    const { model, st, nd } = startOf(sc);
    const stations = sc.stations.map((q) => ({ x: q.x, y: q.y, depth: q.depth, visited: false }));
    return { rollout: P.rollout(model, st, nd, stations, 0, null, U.normalise(r8, U.WIDE_BOUNDS), seconds), real: T.fly(pilotOf("TUNED-R8", { r8 }), sc, { gauge: null, seconds }).score };
}
/** THE AUDITS: every arm once, the oracle too. `kinds` and `ranges` are for the gate. */
export function audits(opts, { ranges = AUDIT_RANGES, kinds = HARD } = {}) {
    const out = {};
    for (const n of AUDIT_NAMES) { const set = T.setOf(kinds, ranges[n][0], ranges[n][1]); out[n] = Object.fromEntries(ARMS.filter((a) => a !== "ORACLE-ORDER").map((a) => [a, scoreOf(a, opts, set)])); out[n]["ORACLE-ORDER"] = oracleRuns(opts.r8, set); }
    return out;
}
/** Mean replans per dive of the twin on `set` (reported). */
export function plansOf(opts, set) {
    let total = 0;
    for (const sc of set) { let seat = null; T.fly((ctx) => T.flyDecision((c) => (seat = P.plannerSeat(opts.r8, { mode: "twin" })(c)))(ctx), sc, { gauge: GAUGE, ...FLIGHT }); total += seat.stats.plans; }
    return total / set.length;
}
export function bottomLine(vsStart) {
    if (vsStart === "BEATS") return "A PLANNED ORDER (WITH A PERFECT MODEL OF THE BOAT) IMPROVES THE TUNED RULE";
    if (vsStart === "LOSES") return "HURTS";
    return "NO GAIN OVER THE TUNED RULE";
}
export function checksOf(au) {
    const rows = [];
    for (const n of AUDIT_NAMES) {
        const x = au[n], same = x["PLANNER-NEAREST"].runs.every((r, i) => r.fingerprint === x["TUNED-R8"].runs[i].fingerprint);
        rows.push({ name: `IDENTITY ${n}`, ok: same, text: `PLANNER-NEAREST equals TUNED-R8 dive for dive on ${n}: ${same}` });
        const atLeast = x["ORACLE-ORDER"].runs.every((r, i) => r.score >= x["TUNED-R8"].runs[i].score - 1e-12);
        rows.push({ name: `ORACLE ${n}`, ok: atLeast, text: `the oracle is at least TUNED-R8 on every dive of ${n}: ${atLeast}` });
    }
    return rows;
}
export function report(au, { plans = null, r8 = null } = {}) {
    const L = [`ROUND 11: a planned visiting order on the tuned rule (the twin: every order tried on a copy of the boat's own simulation), hard kinds (far, both), noisy gauge sd 0.1; audits ${AUDIT_NAMES.map((n) => `${n} ${AUDIT_RANGES[n][0]}-${AUDIT_RANGES[n][1]}`).join(", ")} (48 dives each, read once)`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    L.push("means " + AUDIT_NAMES.join(" | "));
    for (const arm of ARMS) L.push(`  ${arm.padEnd(16)} ${AUDIT_NAMES.map((n) => au[n][arm].score.toFixed(3)).join(" | ")}   crushed ${AUDIT_NAMES.map((n) => au[n][arm].crashed).join("/")}  stranded ${AUDIT_NAMES.map((n) => au[n][arm].stranded).join("/")}`);
    const v = (a, b) => AUDIT_NAMES.map((n) => judge(au[n][a], au[n][b])), show = (js) => js.map((j) => `${j.diff >= 0 ? "+" : ""}${j.diff.toFixed(3)} ${j.wins ? "WINS" : j.loses ? "LOSES" : "tie"}`).join(" | ");
    const tw = v("PLANNER-TWIN", "TUNED-R8"), os = v("ORACLE-ORDER", "TUNED-R8");
    L.push(`PLANNER-TWIN against TUNED-R8: ${show(tw)} = ${verdictOf(tw)}`, `ORACLE-ORDER against TUNED-R8 (reported, it sees the future and the noise): ${show(os)}`);
    const shares = AUDIT_NAMES.map((n) => gapShare(au[n]["PLANNER-TWIN"].score, au[n]["TUNED-R8"].score, au[n]["ORACLE-ORDER"].score));
    L.push(`share of the oracle gap closed by the twin: ${shares.map((s) => (s === null ? "n/a" : s.toFixed(2))).join(" | ")}`);
    if (plans !== null) L.push(`replans per dive (twin): ${plans.toFixed(2)}`);
    L.push(`BOTTOM LINE: ${bad.length ? "NOT WEIGHED (a check failed)" : bottomLine(verdictOf(tw))}`);
    return L;
}
