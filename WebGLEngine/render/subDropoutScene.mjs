// WebGLEngine/render/subDropoutScene.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is render/subDropoutScene-selfcheck.mjs)
//
// THE COMPASS-DROPOUT SCENE, WITHOUT A PAGE: one dive flown by several pilots through the SAME compass dropout (tools/subDropout.mjs: for two windows of 16 s the heading each pilot is shown stays at its last valid value; the body rates, depth, pitch, bank and speed stay true),
// every tick recorded, ready to be drawn. The pilots are the plain PD autopilot, the autopilot behind the ORACLE navigator (tools/subNavigator.mjs: the exact heading rate integrated, a perfect gyro), and the autopilot behind a RESERVOIR ESTIMATOR (tools/subHeadingEstimator.mjs) made from
// the vendored fruit fly heading loop and from the best random wiring of the same size, with the readouts the study fitted (render/subDropoutData.mjs). Pure: no DOM, no I/O, no clock, no Math.random. The view that draws it is render/subDropoutView.mjs.
//   THE DIVES   three dives of TRAIN_SET (not an audit set), the one of each kind on which the dropout costs the plain autopilot most (a rule the gate checks): nominal seed 7, recovery seed 8, current seed 9. Each is flown on its own, so its windows are those of a dropout's dive number 1.
//   WHAT A PILOT SEES  `believed` is the heading the AUTOPILOT inside the chain reads on that tick: for the plain pilot it is the shown (held) heading; behind the oracle or an estimator it is the shown heading turned by the estimate of the drift.
// WHAT IT IS NOT: a model of a real compass failure or a real navigator (the simulator's rates are exact), and not evidence about the fly: the fly circuit here is a reservoir with a linear readout, and the study found it recovers nothing.
"use strict";
import * as T from "../brain/subTask.mjs";
import * as A from "../brain/autopilotSub.mjs";
import * as C from "../brain/pilotSubCircuit.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as D from "../tools/subDropout.mjs";
import * as N from "../tools/subNavigator.mjs";
import * as E from "../tools/subHeadingEstimator.mjs";
import { STUDY } from "./subDropoutData.mjs";

export const DIVES = Object.freeze([
    Object.freeze({ id: "nominal-7", label: "nominal dive (seed 7)", scenario: T.scenario(7, "nominal") }),
    Object.freeze({ id: "recovery-8", label: "recovery from a bad start (seed 8)", scenario: T.scenario(8, "recovery") }),
    Object.freeze({ id: "current-9", label: "dive in a current (seed 9)", scenario: T.scenario(9, "current") }),
]);
export const TICK = T.DT, STATUS_WORDS = Object.freeze({ submerged: "completed", broached: "broached", grounded: "hit the floor", crushed: "crushed", lost: "lost" });
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const f3 = (v) => v.toFixed(3);

/**
 * The pilots of the scene, given the vendored heading loop (`circuit`: { neurons, edges, io }): [{ id, name, hue, blurb, build(inner) -> a pilot }]. `build` puts the pilot's own navigator or estimator in front of `inner` (the autopilot, or a spy of it).
 * The study's fitted readouts come from render/subDropoutData.mjs; the random wiring is the control the study built at seed 1000 + its index.
 */
export function pilotDefs(circuit, study = STUDY) {
    const est = (rec, c) => (inner) => E.estimatorPilot(E.circuitModel(c, rec.radius, true, rec.rho), Float64Array.from(rec.readout), inner);
    const erIndex = Number(study.er.spec.split(":")[1]), erCircuit = C.erControl(circuit, 1000 + erIndex);
    const pct = (k) => (k * 100).toFixed(0) + " percent";
    return [
        { id: "plain", name: "PD autopilot", hue: 0, blurb: "No navigator: through the dropout it steers on a heading that has stopped being true.", build: (inner) => inner },
        { id: "oracle", name: "autopilot + oracle navigator", hue: 140, blurb: "Integrates the exact heading rate: a perfect gyro and a hand-written formula. It is the ceiling for dead reckoning, not a model of a real navigator.", build: (inner) => N.navigator(inner) },
        { id: "cx", name: "autopilot + fly heading-loop estimator", hue: 200, blurb: `The vendored fruit fly heading loop (${circuit.neurons.length} cells, ${circuit.edges.length} synapses) as a reservoir with a fitted linear readout. At the gains the study used it explained ${pct(Math.max(0, study.cx.skill[0]))} of the drift: nothing.`, build: est(study.cx, circuit) },
        { id: "er", name: `autopilot + random-wiring estimator (${study.er.spec})`, hue: 40, blurb: `The best of ten random wirings of the same size, fitted the same way. In the study it explained ${pct(study.er.skill[0])} of the drift: a little, far below the ${pct(study.refs.leakySkill[0])} of one leaky unit.`, build: est(study.er, erCircuit) },
    ];
}

/**
 * Fly `sc` once for each pilot of `defs`, through its own dropout wrapper (so every pilot meets the same windows), and record every tick:
 * { dt, ticks, windows: [[firstTick, endTick)], target, cleanScore, pilots: [{ id, name, hue, blurb, score, status, ticks, dark (1 | 0 a tick), x, y, depth, heading, believed, error (the absolute angle from the target heading, at most pi) }] }.
 */
export function flyScene(sc, defs) {
    const pilots = [];
    let windows = [], ticks = 0;
    for (const def of defs) {
        const ap = A.pilot(), seen = { believed: 0 };
        const spy = (st, tgt, cur, aux) => { seen.believed = S.attitude(st).heading; return ap(st, tgt, cur, aux); };
        const w = D.dropout(def.build(spy)), x = [], y = [], depth = [], heading = [], believed = [], dark = [], error = [];
        const outer = (st, tgt, cur) => {
            const cmd = w(st, tgt, cur), a = S.attitude(st);
            x.push(st.pos[0]); y.push(st.pos[1]); depth.push(-st.pos[2]); heading.push(a.heading); believed.push(seen.believed); dark.push(w.log.valid[w.log.valid.length - 1] === 0 ? 1 : 0);
            error.push(Math.abs(wrap(sc.target.heading - a.heading)));
            return cmd;
        };
        const r = T.fly(outer, sc);
        if (!windows.length) windows = w.log.windows.map(([a, b]) => [a, b]);
        ticks = Math.max(ticks, x.length);
        pilots.push({ id: def.id, name: def.name, hue: def.hue, blurb: def.blurb, score: r.score, status: r.status, ticks: x.length, dark: Uint8Array.from(dark), x: Float32Array.from(x), y: Float32Array.from(y), depth: Float32Array.from(depth), heading: Float32Array.from(heading), believed: Float32Array.from(believed), error: Float32Array.from(error) });
    }
    return { dt: TICK, ticks, windows, target: sc.target, kind: sc.kind, seed: sc.seed, cleanScore: T.fly(A.pilot(), sc).score, pilots };
}

/** The window (0-based index) a tick falls in, or -1. */
export const windowAt = (windows, tick) => windows.findIndex(([a, b]) => tick >= a && tick < b);
/** The honest line for the state of the compass at a tick: 'compass valid' or 'COMPASS DARK, 12.3 s left in this window'. */
export function compassLine(windows, tick, dt = TICK) {
    const i = windowAt(windows, tick);
    return i < 0 ? "compass valid" : `COMPASS DARK, ${((windows[i][1] - tick) * dt).toFixed(1)} s left in this window`;
}
/** The size of the scene in the plan: { minX, maxX, minY, maxY } over every pilot's track, padded by `pad` metres on each side. */
export function planBounds(scene, pad = 20) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of scene.pilots) for (let i = 0; i < p.ticks; i++) { if (p.x[i] < minX) minX = p.x[i]; if (p.x[i] > maxX) maxX = p.x[i]; if (p.y[i] < minY) minY = p.y[i]; if (p.y[i] > maxY) maxY = p.y[i]; }
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
}
/** The result line for one pilot at the end of the dive. */
export const resultLine = (p, scene) => `${p.name}: score ${f3(p.score)} (the clean autopilot ${f3(scene.cleanScore)})${p.status === "submerged" ? "" : "; " + STATUS_WORDS[p.status] + " after " + (p.ticks * scene.dt).toFixed(0) + " s"}`;
/** The notes printed under the view, as plain sentences. The numbers are the study's. */
export function notesFor(study = STUDY) {
    const f = (v) => v.toFixed(2);
    return [
        "The compass is the only thing taken away: for two windows of 16 seconds the heading each pilot is shown stays at its last valid value. The vessel's own turning rate, depth, pitch, bank and speed stay true.",
        `The oracle navigator is the reference arm of the study: it integrates the exact heading rate, which a simulator can give and a real gyro cannot (it drifts). It closes ${f(study.refs.flights.navigator[0] > study.refs.flights.dropout[0] ? (study.refs.flights.navigator[0] - study.refs.flights.dropout[0]) / (study.refs.flights.clean[0] - study.refs.flights.dropout[0]) : 0)} of what the dropout costs on the study's audit dives.`,
        `The fly and random-wiring pilots are reservoirs: the circuit's wiring is fixed, a linear readout is fitted to the true drift, and the estimate turns the world the autopilot reads. On the study's fresh audit dives the fly heading loop explained ${f(Math.max(0, study.cx.skill[0]))} of the drift, the best random wiring ${f(study.er.skill[0])}, and one leaky unit ${f(study.refs.leakySkill[0])}.`,
        "This says something about that reservoir design, not about the fly's compass, which is a ring with a particular input and gain that this design does not reproduce. A check after the study found that at the gains it used, all below a nominal 1, the fly wiring forgets a pulse within about a second (the dark windows last 16), and holds a memory only in a band of gain near 1.18 that the study never tried; a version that sets every wiring's gain by measured memory is not run yet.",
        "Dives are shown on the training range; the study's numbers are on audit dives nothing had flown.",
    ];
}
