// WebGLEngine/render/subDropoutScene-selfcheck.mjs -- UNNUMBERED
//
// THE GATE OF THE COMPASS-DROPOUT SCENE (render/subDropoutScene.mjs) AND THE NUMBERS IT IS BUILT FROM (render/subDropoutData.mjs). Pure Node: no browser, no network. The page that draws the scene is gated by render/subDropoutView-selfcheck.mjs.
//   1  THE DATA   every number in the baked study equals the record in brain/flyEstimatorStudy.jsonl, circuit by circuit and audit by audit; the random wiring kept is the best of the ten by audit RMSE; the spectral radius baked matches the vendored circuit it was measured on (a stale
//                 file of numbers for a changed circuit is caught here); the readouts have the width a model reads; the study is frozen.
//   2  THE DIVES  the three dives are the three of TRAIN_SET (never an audit set) on which the dropout costs the plain autopilot most, one per kind -- recomputed here from the flights, not copied.
//   3  THE SCENE  each dive flown once for each of the four pilots: the windows are the dropout's (two of 480 ticks, pinned), the plain pilot believes the held heading in the dark and the true one in the light, the oracle believes the truth to 3e-3 rad, no pilot's belief differs from the truth outside
//                 the windows, the scores are the task's own, the oracle's score is the clean one, the fly estimator is no better than the plain pilot and the random wiring's is better only where the study says it can be, the tracks are the vessel's.
//   4  THE PILOTS the random wiring is the control of seed 1000 + its index (checked by building the same pilot by hand from the study's own `circuitFor` at another index); the readouts are the ones fitted; a pilot that is lost is reported as lost and as many ticks as it flew.
//   5  THE WORDS  the honest lines the view prints, checked by hand: the compass line before, in and after a window; the result line for a completed dive and for one that ended early; the bounds of a plan; the notes with the study's numbers in them.
// NOT CHECKED, said plainly: that the scene is a model of a real compass failure (the simulator's rates are exact); that the numbers of the study are right (that is the study gate's job: tools/subHeadingEstimator-selfcheck.mjs and tools/ship/subEstimatorStudy.mjs); how the page looks.
//
// SABOTAGE LOG (the thing broken -> the rows that went red; every mutant must be red BY NAME):
//   render/subDropoutScene.mjs, 77 mutants, 74 red by name and 3 equivalent (said so; the full run repeated over the finished gate after the plan's frame was added): the dives (a seed changed in each of the three, a dive of the wrong kind, frozen-ness, the tick, the status words); the pilots (the fly pilot built from the random record, the random wiring's seed
//   without its index or off by one, its index read from the wrong half of the spec, no state, a fixed radius, a reversed readout, the hue, the names, the blurbs and the numbers in them); the flight records (the vessel's heading read as pitch, y as x, the depth's sign, the believed heading read
//   as the truth, the dark flag inverted or one tick late, the error unwrapped or signed, the windows dropped, the scene as long as the LAST pilot, the clean score flown through the dropout, the score negated, the status always submerged, a pilot's ticks always the dive's, a dropout of another
//   seed or of 8 s, kind and seed swapped, the wrong dive's target, the plan's frame with a sign flipped, of heading zero, or the v track copied from u); the words (a window one tick late or one tick long, the seconds left off by a tick or to a second, the first tick of a window read as light, the plan's box padded inward or not at all or on one side or by 10 m or read past a pilot's own length,
//   a result to two places or in ticks or only for completed pilots, the notes to three places, the closed fraction when the navigator is worse or inverted, and each caveat of the notes removed in turn). Findings the sabotage made: the 'frozen' row looked only at the top of the study (the readouts
//   could be changed by a page) -> the data module is frozen all the way down and the row checks the leaves; the error's wrap was not exercised by any of the three dives (the unwrapped mutant was green) -> a dive flown from heading -3 to a target of 3 is checked to read 0.28 rad, not 6; a scene
//   as long as the last pilot passed because every pilot completes -> a scene with a pilot that completes first and a lost one last; the blurbs were checked for length only -> their key sentences are pinned; a guard in front of the windows (`if (!windows.length)`) was dead -> cut.
//   EQUIVALENT, left and said so: S15 (the study's spectral radius passed to circuitModel against recomputing it: the same number, and the passing saves 130 ms a pilot); S66 (the spy forwarding the fourth argument to the autopilot: A.pilot takes three parameters and ignores it, the spy
//   forwards it so that an inner that reads the compass flag still gets it); S67 (a pilot shared between the four chains instead of one each: A.pilot is a pure function of its arguments today; one each is the safe contract).
//   render/subDropoutData.mjs, 26 mutants, 26 red by name: each baked number of both circuits and of the references changed in turn (rho, radius, penalty, a readout number, the spec, RMSE, skill, closed-loop score, the audit order, the audit base, the source file, the leaky sigma, the three
//   flights), the freezing of the study removed or stopped at the top, and a readout number dropped.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as T from "../brain/subTask.mjs";
import * as A from "../brain/autopilotSub.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as D from "../tools/subDropout.mjs";
import * as CS from "../brain/pilotSubCircuitState.mjs";
import * as E from "../tools/subHeadingEstimator.mjs";
import * as TS from "../tools/ship/trainSubState.mjs";
import * as V from "./subDropoutScene.mjs";
import { STUDY } from "./subDropoutData.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const AUDITS = ["audit", "safetyAudit", "reserve"];
console.log("subDropoutScene-selfcheck -- the compass-dropout scene and the numbers it draws from\n");

const recs = fs.readFileSync(path.join(ENG, "brain", "flyEstimatorStudy.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const refs = recs.find((r) => r.spec === "refs"), byspec = new Map(recs.filter((r) => r.spec !== "refs").map((r) => [r.spec, r]));
const circuit = TS.loadCircuit();

console.log("1. THE DATA");
{
    const rec = (spec) => byspec.get(spec);
    const check = (name, baked) => {
        const r = rec(baked.spec), sc = r.scores;
        ok(`!! ${name}: spec ${baked.spec}, radius ${baked.radius}, penalty ${baked.lambda} and spectral radius are the study's`, baked.spec === r.spec && baked.radius === r.chosen.radius && baked.lambda === r.chosen.lambda && baked.rho === r.rho);
        ok(`!! ${name}: the 65 readout numbers equal the fitted ones, number for number`, baked.readout.length === 65 && r.readout.length === 65 && baked.readout.every((v, i) => v === r.readout[i]));
        ok(`!! ${name}: RMSE, skill and closed-loop score on the three audits (audit, safetyAudit, reserve, in that order) equal the record's`, same(baked.rmse, AUDITS.map((k) => sc[k].rmse)) && same(baked.skill, AUDITS.map((k) => sc[k].skill)) && same(baked.closedLoop, AUDITS.map((k) => r.closedLoop[k])));
    };
    ok("the audits are named in the order the arrays use", same(STUDY.audits, AUDITS));
    check("the fly circuit", STUDY.cx); check("the random wiring", STUDY.er);
    ok("!! the fly circuit is the real wiring (spec cx) and the random wiring is of the ER family", STUDY.cx.spec === "cx" && /^er:\d+$/.test(STUDY.er.spec) && rec(STUDY.er.spec).family === "er");
    const ers = recs.filter((r) => r.family === "er"), best = ers.reduce((a, r) => (r.scores.audit.rmse < a.scores.audit.rmse ? r : a));
    ok(`!! the random wiring kept is the BEST of the ${ers.length} by RMSE on the first audit (${best.spec}, ${best.scores.audit.rmse.toFixed(4)}) and no other is as good`, ers.length === 10 && STUDY.er.spec === best.spec && ers.filter((r) => r.scores.audit.rmse <= best.scores.audit.rmse).length === 1);
    ok("!! the references equal the study's: NONE and ORACLE RMSE, the leaky unit's skill and its sigma, and the three flights (clean, dropout, navigator) on every audit",
        same(STUDY.refs.none, AUDITS.map((k) => refs.none[k])) && same(STUDY.refs.oracle, AUDITS.map((k) => refs.oracle[k])) && same(STUDY.refs.leakySkill, AUDITS.map((k) => refs.leaky.scores[k].skill)) && STUDY.refs.leakySigma === refs.leaky.chosen.sigma
        && same(STUDY.refs.flights.clean, AUDITS.map((k) => refs.flights[k].clean)) && same(STUDY.refs.flights.dropout, AUDITS.map((k) => refs.flights[k].dropout)) && same(STUDY.refs.flights.navigator, AUDITS.map((k) => refs.flights[k].navigator)));
    ok("!! the study records the audit base it was read at (50000) and the source file it was baked from", /flyEstimatorStudy\.jsonl/.test(STUDY.source) && recs.every((r) => r.auditBase === 50000) && /50000/.test(STUDY.source));
    for (const [nm, b] of [["cx", STUDY.cx], ["er", STUDY.er]]) {
        const c = TS.circuitFor({ family: b.spec.split(":")[0], index: Number(b.spec.split(":")[1] || 0) }, circuit);
        ok(`!! the spectral radius baked for ${nm} (${b.rho.toFixed(3)}) is that of the vendored circuit it is built on (${E.spectralRadius(CS_R(c)).toFixed(3)}), so a changed circuit file is caught`, near(E.spectralRadius(CS_R(c)), b.rho, 1e-6 * b.rho));
    }
    ok("!! the baked study is frozen all the way down, readouts included (a page cannot change what it draws from)", [STUDY, STUDY.cx, STUDY.er, STUDY.refs, STUDY.refs.flights, STUDY.cx.readout, STUDY.er.skill, STUDY.refs.flights.clean].every(Object.isFrozen));
}
function CS_R(c) { return CS.reservoirOf(c); }

console.log("\n2. THE DIVES");
const defs = V.pilotDefs(circuit);
{
    ok("!! three dives, one of each kind, named nominal, recovery and current, seeds 7, 8 and 9, each with a label that says so", V.DIVES.length === 3 && same(V.DIVES.map((d) => d.scenario.kind), ["nominal", "recovery", "current"]) && same(V.DIVES.map((d) => d.scenario.seed), [7, 8, 9]) && V.DIVES.every((d) => d.id === d.scenario.kind + "-" + d.scenario.seed && d.label.includes("seed " + d.scenario.seed)));
    ok("!! every dive is one of TRAIN_SET (a training dive: no audit set is ever drawn here)", V.DIVES.every((d) => T.TRAIN_SET.some((s) => s.kind === d.scenario.kind && s.seed === d.scenario.seed)) && V.DIVES.every((d) => !T.AUDIT_SET.some((s) => s.kind === d.scenario.kind && s.seed === d.scenario.seed)));
    const cost = (sc) => T.fly(A.pilot(), sc).score - T.fly(D.dropout(A.pilot()), sc).score;
    const worst = {};
    for (const sc of T.TRAIN_SET) { const c = cost(sc); if (!(sc.kind in worst) || c > worst[sc.kind].c) worst[sc.kind] = { c, seed: sc.seed }; }
    ok(`!! each dive is the one of its kind in TRAIN_SET on which the dropout costs the plain autopilot MOST (recomputed: ${["nominal", "recovery", "current"].map((k) => k + " seed " + worst[k].seed + " costs " + worst[k].c.toFixed(3)).join(", ")})`, V.DIVES.every((d) => worst[d.scenario.kind].seed === d.scenario.seed));
    ok("the dive's scenario is the task's (T.scenario of its seed and kind)", V.DIVES.every((d) => same(d.scenario, T.scenario(d.scenario.seed, d.scenario.kind))));
    ok("the dives are frozen", Object.isFrozen(V.DIVES) && V.DIVES.every((d) => Object.isFrozen(d)));
    ok("the tick is the task's tick (one thirtieth of a second)", V.TICK === T.DT && near(V.TICK, 1 / 30, 1e-12));
}

console.log("\n3. THE SCENE");
const scenes = V.DIVES.map((d) => V.flyScene(d.scenario, defs));
{
    ok("!! four pilots in a scene, in the order plain, oracle, cx, er, each with a name, a hue and a blurb", scenes.every((sc) => same(sc.pilots.map((p) => p.id), ["plain", "oracle", "cx", "er"]) && sc.pilots.every((p) => p.name && p.blurb.length > 30 && Number.isFinite(p.hue))) && same(defs.map((d) => d.hue), [0, 140, 200, 40]));
    ok("!! the pilots are named as the study names them, and the blurbs say what each is: the plain one steers on a heading that has stopped being true; the oracle is a perfect gyro and a ceiling, not a model of a real navigator; the estimators are reservoirs with a fitted linear readout", same(defs.map((d) => d.name), ["PD autopilot", "autopilot + oracle navigator", "autopilot + fly heading-loop estimator", "autopilot + random-wiring estimator (er:1)"])
        && defs[0].blurb.includes("stopped being true") && defs[1].blurb.includes("perfect gyro") && defs[1].blurb.includes("not a model of a real navigator") && defs[2].blurb.includes("reservoir with a fitted linear readout") && defs[3].blurb.includes("best of ten random wirings"));
    ok("!! the scene's windows are the dropout's two windows of 480 ticks (16 s), [205, 685) and [1279, 1759), the same for every pilot and every dive (they are seeded by the dive's number in the wrapper, and each pilot meets a fresh wrapper)", scenes.every((sc) => same(sc.windows, [[205, 685], [1279, 1759]])));
    const w = D.dropout(A.pilot()); T.fly(w, V.DIVES[0].scenario);
    ok("!! and they are what the dropout wrapper itself logs for the same dive", same(scenes[0].windows, w.log.windows) && w.log.valid.filter((v) => v === 0).length === 960);
    ok("!! the dark flag of each pilot is 1 exactly inside the windows (960 ticks of 1800) and 0 outside", scenes.every((sc) => sc.pilots.every((p) => p.dark.length === 1800 && p.dark.every((v, i) => v === (V.windowAt(sc.windows, i) >= 0 ? 1 : 0)))));
    ok("!! each dive runs 1800 ticks (60 s) and every pilot completes it", scenes.every((sc) => sc.ticks === 1800 && sc.dt === V.TICK && sc.pilots.every((p) => p.ticks === 1800 && p.status === "submerged" && p.x.length === 1800 && p.error.length === 1800)));
    const hold = (sc) => { const p = sc.pilots[0]; let worst = 0; for (const [a, b] of sc.windows) for (let i = a; i < b; i++) worst = Math.max(worst, Math.abs(p.believed[i] - p.heading[a - 1])); return worst; };
    ok("!! the plain pilot's believed heading in the dark is the heading it had on the last tick of light, held (to the rounding of a 32-bit number)", scenes.every((sc) => hold(sc) < 2e-6));
    const lit = (sc, p) => { let worst = 0; for (let i = 0; i < sc.ticks; i++) if (V.windowAt(sc.windows, i) < 0) worst = Math.max(worst, Math.abs(wrap(p.believed[i] - p.heading[i]))); return worst; };
    ok("!! no pilot's belief differs from the truth when the compass is lit (the estimate is zero there: nothing is turned)", scenes.every((sc) => sc.pilots.every((p) => lit(sc, p) < 2e-6)));
    const dark = (sc, p) => { let worst = 0; for (const [a, b] of sc.windows) for (let i = a; i < b; i++) worst = Math.max(worst, Math.abs(wrap(p.believed[i] - p.heading[i]))); return worst; };
    ok("!! the ORACLE navigator believes the truth to 3e-3 rad all through the dark (a perfect gyro), and the plain pilot is wrong by more than 1 rad by the end of a window (the dropout is not nothing)", scenes.every((sc) => dark(sc, sc.pilots[1]) < 3e-3) && scenes.every((sc) => { const p = sc.pilots[0]; return Math.abs(wrap(p.believed[sc.windows[0][1] - 1] - p.heading[sc.windows[0][1] - 1])) > 1; }));
    const hdg = (sc, k) => sc.pilots[k].heading;
    ok("!! the headings are the vessel's own: the plain pilot's heading at the first tick of a window is the one the held value was taken from, within one tick of turning (0.01 rad)", scenes.every((sc) => near(sc.pilots[0].heading[sc.windows[0][0]], sc.pilots[0].believed[sc.windows[0][0]], 0.01)));
    const pl = (sc, k) => sc.pilots[k].score;
    ok("!! scores are the task's own: the plain pilot's equals T.evaluate of the dropout over a one-dive set, to the digit (that is how the study scored it)", scenes.every((sc, i) => pl(sc, 0) === T.evaluate(D.dropout(A.pilot()), [V.DIVES[i].scenario]).score));
    ok("!! the clean score is the plain autopilot flown with every compass lit, and the plain pilot is worse than it by more than 0.2 on every dive (nominal -0.7149, recovery -0.4264, current -0.4719, to 4 places)", same(scenes.map((sc) => sc.cleanScore.toFixed(4)), ["-0.7149", "-0.4264", "-0.4719"]) && scenes.every((sc) => sc.cleanScore - sc.pilots[0].score > 0.2));
    ok("!! the oracle's score is the clean score to 1e-3 (it recovers all that the dropout cost), the plain pilot's is the dropout's: -0.9425, -0.7940 and -0.7450 to 4 places", scenes.every((sc) => near(pl(sc, 1), sc.cleanScore, 1e-3)) && same(scenes.map((sc) => pl(sc, 0).toFixed(4)), ["-0.9425", "-0.7940", "-0.7450"]));
    ok("!! the FLY estimator recovers nothing on any dive: its score is within 0.01 of the plain pilot's, as the study found (skill -0.01)", scenes.every((sc) => near(pl(sc, 2), pl(sc, 0), 0.01)));
    ok("!! the random-wiring estimator helps where it can: on the recovery dive it recovers more than 80 percent of what the dropout costs (-0.4742), on the other two it recovers less than 5 percent", pl(scenes[1], 3).toFixed(4) === "-0.4742" && (pl(scenes[1], 3) - pl(scenes[1], 0)) / (scenes[1].cleanScore - pl(scenes[1], 0)) > 0.8 && [0, 2].every((i) => (pl(scenes[i], 3) - pl(scenes[i], 0)) / (scenes[i].cleanScore - pl(scenes[i], 0)) < 0.05));
    ok("!! the dive starts at the origin and the tracks are the vessel's: tick 0 at x = y = 0 and the depth of the scenario's start; the plain pilot's last x, y and depth for dive 7 are the pinned (-1.18, 142.91, 39.97) metres", scenes.every((sc, i) => sc.pilots.every((p) => p.x[0] === 0 && p.y[0] === 0 && near(p.depth[0], V.DIVES[i].scenario.start.pos ? -V.DIVES[i].scenario.start.pos[2] : p.depth[0], 1e-3))) && [scenes[0].pilots[0].x[1799], scenes[0].pilots[0].y[1799], scenes[0].pilots[0].depth[1799]].map((v) => v.toFixed(2)).join() === "-1.18,142.91,39.97");
    ok("!! every pilot's track in the plan's frame (u along the target heading, v to the right of it) is its world track put through planFrame (to a millimetre), starts at (0, 0), and, for the oracle (which flies straight; the others are turning and slip sideways, and a current carries the boat) on a dive without a current, moves in the direction of its own heading measured from the target: at tick 900 the direction of (u, v) is the heading minus the target's, to 0.05 rad", scenes.every((sc) => sc.pilots.every((p) => { let worst = 0; for (let i = 0; i < p.ticks; i++) { const [uu, vv] = V.planFrame(p.x[i], p.y[i], sc.target.heading); worst = Math.max(worst, Math.abs(uu - p.u[i]), Math.abs(vv - p.v[i])); } const dir = Math.atan2(p.v[905] - p.v[900], p.u[905] - p.u[900]); return worst < 1e-2 && p.u[0] === 0 && p.v[0] === 0 && p.u.length === p.ticks && p.v.length === p.ticks && (p.id !== "oracle" || sc.kind === "current" || near(wrap(dir - (p.heading[900] - sc.target.heading)), 0, 0.05)); })));
    const eq = (sc) => sc.pilots.every((p) => { let worst = 0; for (let i = 0; i < p.ticks; i++) worst = Math.max(worst, Math.abs(p.error[i] - Math.abs(wrap(sc.target.heading - p.heading[i])))); return worst < 1e-6 && p.error.every((e) => e >= 0 && e <= Math.PI + 1e-6); });
    ok("!! the error of every tick is the absolute angle from the target heading, between 0 and pi", scenes.every(eq));
    ok("the final heading of the plain pilot is the task's own final heading of the same flight (the scene records what the flight did)", scenes.every((sc, i) => { const r = T.fly(D.dropout(A.pilot()), V.DIVES[i].scenario); return near(sc.pilots[0].heading[1799], wrap(r.final.hdg), 2e-3) || near(Math.abs(sc.pilots[0].heading[1799] - r.final.hdg), 2 * Math.PI, 2e-3); }));
    ok("the scene carries the dive's kind, seed and target, and is flown twice to the same bytes (it is deterministic)", scenes.every((sc, i) => sc.kind === V.DIVES[i].scenario.kind && sc.seed === V.DIVES[i].scenario.seed && same(sc.target, V.DIVES[i].scenario.target)) && same(Array.from(V.flyScene(V.DIVES[0].scenario, defs).pilots[3].believed), Array.from(scenes[0].pilots[3].believed)));
}

console.log("\n4. THE PILOTS");
{
    const rec3 = byspec.get("er:3"), study3 = { ...STUDY, er: { spec: "er:3", rho: rec3.rho, radius: rec3.chosen.radius, lambda: rec3.chosen.lambda, readout: rec3.readout, rmse: [0, 0, 0], skill: [0.25, 0.25, 0.34], closedLoop: [0, 0, 0] } };
    const d3 = V.pilotDefs(circuit, study3), er3 = d3.find((d) => d.id === "er");
    const hand = (inner) => E.estimatorPilot(E.circuitModel(TS.circuitFor({ family: "er", index: 3 }, circuit), rec3.chosen.radius, true, rec3.rho), Float64Array.from(rec3.readout), inner);
    const sc = V.DIVES[1].scenario, a = T.fly(D.dropout(er3.build(A.pilot())), sc).score, b = T.fly(D.dropout(hand(A.pilot())), sc).score, c = T.fly(D.dropout(defs[3].build(A.pilot())), sc).score;
    ok(`!! the random-wiring pilot is the control of seed 1000 + its INDEX: built from the record of er:3 it flies exactly as the same pilot built by hand from the study's circuitFor (${a.toFixed(4)} = ${b.toFixed(4)}), and not as er:1 (${c.toFixed(4)})`, a === b && a !== c);
    ok("!! the name of the random-wiring pilot carries its spec, and the blurb says how it ranked in the study (a percent of the drift explained, and the leaky unit's)", defs[3].name.includes(STUDY.er.spec) && defs[3].blurb.includes("25 percent") && defs[3].blurb.includes("89 percent"));
    ok("the fly pilot's blurb says the study found it explained 0 percent at the gains used (the skill -0.01 is shown as zero, not negative)", defs[2].blurb.includes("0 percent") && !defs[2].blurb.includes("-") && defs[2].blurb.includes("148 cells") && defs[2].blurb.includes("7080 synapses"));
    const lost = V.flyScene(V.DIVES[0].scenario, [{ id: "diver", name: "a pilot that dives", hue: 10, blurb: "x", build: () => () => ({ thrust: 0, rudder: 0, sternPlane: -1, ballast: 1 }) }]);
    const p = lost.pilots[0];
    ok("!! a pilot that is lost mid-dive is recorded as lost: its status is not 'submerged', it flew fewer ticks than the dive, and its arrays are as long as the ticks it flew", p.status !== "submerged" && p.ticks > 0 && p.ticks < 1800 && p.x.length === p.ticks && p.error.length === p.ticks && p.dark.length === p.ticks && lost.ticks === p.ticks, `${p.status} after ${p.ticks} ticks`);
    const diverDef = { id: "diver", name: "a pilot that dives", hue: 10, blurb: "x", build: () => () => ({ thrust: 0, rudder: 0, sternPlane: -1, ballast: 1 }) };
    const mixed = V.flyScene(V.DIVES[0].scenario, [defs[0], diverDef]);
    ok("!! in a scene of a pilot that completes and one that is lost, the scene runs as long as the LONGEST pilot (1800 ticks) and each pilot keeps its own length, whichever is last", mixed.ticks === 1800 && same(mixed.pilots.map((q) => q.ticks), [1800, p.ticks]) && mixed.pilots[0].status === "submerged" && mixed.pilots[1].status !== "submerged");
    const sc0 = V.DIVES[0].scenario, wsc = { ...sc0, start: { ...sc0.start, heading: -3 }, target: { ...sc0.target, heading: 3 } }, wsn = V.flyScene(wsc, [defs[0]]).pilots[0];
    ok("!! the error is the angle the SHORT way round: a heading of -3 against a target of 3 is 0.283 rad apart, not 6, and no tick of that dive reads more than pi", near(wsn.error[0], 2 * Math.PI - 6, 1e-4) && wsn.error.every((e) => e >= 0 && e <= Math.PI + 1e-6));
    ok("the result line of that pilot says it ended early and how soon; a completed pilot's does not", V.resultLine(p, lost).includes(V.STATUS_WORDS[p.status]) && V.resultLine(p, lost).includes("after") && !V.resultLine(scenes[0].pilots[0], scenes[0]).includes("after"));
}

console.log("\n5. THE WORDS");
{
    const W = [[10, 20], [50, 60]];
    ok("!! windowAt: -1 before, the window's index on its first tick and its last tick, -1 on its end tick (half-open), the second window", V.windowAt(W, 9) === -1 && V.windowAt(W, 10) === 0 && V.windowAt(W, 19) === 0 && V.windowAt(W, 20) === -1 && V.windowAt(W, 55) === 1 && V.windowAt(W, 60) === -1);
    ok("!! compassLine says 'compass valid' in the light and 'COMPASS DARK' with the seconds left in the window in the dark (to a tenth, from a tick of 1/30 s)", V.compassLine(W, 5) === "compass valid" && V.compassLine(W, 20) === "compass valid" && V.compassLine(W, 10) === "COMPASS DARK, 0.3 s left in this window" && V.compassLine(W, 15, 0.1) === "COMPASS DARK, 0.5 s left in this window" && V.compassLine(scenes[0].windows, 205) === "COMPASS DARK, 16.0 s left in this window" && V.compassLine(scenes[0].windows, 684) === "COMPASS DARK, 0.0 s left in this window");
    const pf = (x, y, t) => V.planFrame(x, y, t).map((n) => +n.toFixed(9));
    ok("!! planFrame turns the world so the target heading points along u and a RIGHT turn goes to +v (the vessel travels (cos h, -sin h): heading 0 is +x, heading pi/2 is -y): (3, 4) is (3, -4) for a target of 0 and (-4, -3) for a target of pi/2, and a vessel at heading 0.5 that travels (cos .5, -sin .5) is at v > 0 for a target of 0", same(pf(3, 4, 0), [3, -4]) && same(pf(3, 4, Math.PI / 2), [-4, -3]) && V.planFrame(Math.cos(0.5), -Math.sin(0.5), 0)[1] > 0 && near(Math.atan2(V.planFrame(Math.cos(0.5), -Math.sin(0.5), 0.2)[1], V.planFrame(Math.cos(0.5), -Math.sin(0.5), 0.2)[0]), 0.3, 1e-9));
    const toy = { pilots: [{ ticks: 3, u: [0, 10, -5], v: [2, 4, 8] }, { ticks: 2, u: [100, 1], v: [0, -3] }] };
    ok("!! planBounds is the box round every tick of every pilot, padded by 20 m by default and by the pad asked for, and a pilot's later ticks are not read past its own length", same(V.planBounds(toy), { minU: -25, maxU: 120, minV: -23, maxV: 28 }) && same(V.planBounds(toy, 0), { minU: -5, maxU: 100, minV: -3, maxV: 8 }));
    const done = { name: "PD autopilot", score: -0.9425, status: "submerged", ticks: 1800 }, sc0 = { cleanScore: -0.7149, dt: 1 / 30 };
    ok("!! resultLine: 'name: score -0.943 (the clean autopilot -0.715)' for a completed dive (3 places) and, for one that ended early, the status in words and the seconds flown", V.resultLine(done, sc0) === "PD autopilot: score -0.943 (the clean autopilot -0.715)" && V.resultLine({ ...done, status: "grounded", ticks: 600 }, sc0) === "PD autopilot: score -0.943 (the clean autopilot -0.715); hit the floor after 20 s" && V.resultLine({ ...done, status: "crushed", ticks: 90 }, sc0).endsWith("crushed after 3 s"));
    ok("!! every status the vessel can report has a word", ["submerged", "broached", "grounded", "crushed", "lost"].every((s) => typeof V.STATUS_WORDS[s] === "string" && V.STATUS_WORDS[s].length > 3) && Object.isFrozen(V.STATUS_WORDS));
    const notes = V.notesFor();
    ok("!! the notes are five plain sentences or more, with the study's numbers in them: the oracle closes 1.00 of the dropout's cost, the fly heading loop explained 0.00 of the drift, the best random wiring 0.25 and one leaky unit 0.89", notes.length === 5 && notes.every((n) => typeof n === "string" && n.length > 60) && notes[1].includes("closes 1.00 of") && notes[2].includes("explained 0.00 of the drift") && notes[2].includes("0.25") && notes[2].includes("0.89"));
    ok("!! the notes say what the scene is not (a real compass failure; the fly's compass), and carry the check made after the study: forgets a pulse within about a second at the gains used, a band near 1.18 untried, a calibrated version not run", /real gyro/.test(notes[1]) && /not about the fly's compass/.test(notes[3]) && /within about a second/.test(notes[3]) && /1\.18/.test(notes[3]) && /not run yet/.test(notes[3]) && /training range/.test(notes[4]) && /audit dives/.test(notes[4]));
    ok("a navigator that is no better than the dropout is reported as closing 0.00 (no negative fraction), not a minus sign", V.notesFor({ ...STUDY, refs: { ...STUDY.refs, flights: { clean: [-0.5, 0, 0], dropout: [-1, 0, 0], navigator: [-1.2, 0, 0] } } })[1].includes("closes 0.00 of"));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
