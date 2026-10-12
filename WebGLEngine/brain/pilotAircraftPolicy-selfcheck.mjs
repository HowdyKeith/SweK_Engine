// WebGLEngine/brain/pilotAircraftPolicy-selfcheck.mjs -- v4839 (beside brain/pilotAircraftPolicy.mjs and es-aircraft.html's Load Pilots panel)
//
// Run: node brain/pilotAircraftPolicy-selfcheck.mjs
//
// GRADES brain/pilotAircraftPolicy.mjs -- a learned heading-hold pilot with brain/autopilotAircraft.mjs's own contract, (body, desiredForward) -> { controls: { pitch, roll, yaw }, facingCos, ... } -- and
// the Load Pilots panel es-aircraft.html now has, through brain/pilotRoster.mjs (handed this module as its policy).
//
// Section 1, THE NETWORK: twelve features and three outputs through the 34 neurons of the Giant Fiber Circuit, a weight count (860) that is none of the other pilots' (725, 896, 930), the recurrent core
// permanently zero outside the 313 real synapses, the zero pilot commanding nothing. Section 2, THE GEOMETRY IS decide()'s: the restated pointing error, bank and cosine held to autopilotAircraft.decide() on
// 60 seeded states. Section 3, THE HAND WEIGHTS ARE THE PD CONTROLLER: through the network and the clamp they are decide() -- not an approximation of it, the controls agree to float32 rounding on every state --
// and in closed loop they fly the same flights. Section 4, THE FLIGHT: the page's constants held to es-aircraft.html's source (a copy of the flight in this module that has drifted from the page grades nothing),
// the score is exactly what it says, the zero pilot flies straight and loses. Section 5, THE PAGE: es-aircraft.html in its own browser -- the panel is there, the default squadron is the PD autopilot (named as
// such), a hand squadron flies the SAME patrol to rounding, a zero squadron never turns, the shipped pilot loads and flies the patrol better than the autopilot, an import is accepted and refused by name, and the
// choice survives a reload (including a saved 'shipped' made before the file arrives). Section 6, TRAINING and the pilot this page ships: the score, the three disjoint scenario sets, the sparse child, the
// train/prune invariants, and the SHIPPED FILE -- its `by` reproduced, beating the PD controller where it was never trained, and not worse on the page's own patrol.
//
// SABOTAGE LOG -- v4843, twenty-three, each applied to the file named, the gate run, the file restored (cmp-identical). Reds are rows (`grep -c '^  FAIL'`).
//   A  pilotAircraftPolicy.mjs: the hand weights' pitch damping halved                       6 red (the controls-are-decide()'s row, the closed-loop and patrol rows, the hand squadron on the page, the file's `by`, the fixed-point row)
//   B  pilotAircraftPolicy.mjs: forward() no longer clamps to [-1, 1]                        9 red (the forward row, the controls row, closed loop, patrol, the unstable-flight row, the page's hand squadron, ...)
//   C  pilotAircraftPolicy.mjs: the bank error is not wrapped to (-pi, pi]                   3 red (the controls-are-decide()'s row on the states with a large bank, the file's `by`, the fixed-point row; the closed-loop rows do NOT see it -- no flight there banks past pi)
//   D  pilotAircraftPolicy.mjs: upZ's sign flipped                                           3 red (the twelve-features row, the file's `by`, the fixed-point row: the hand weights give upZ no weight, so only the features row and the shipped file read it)
//   E  pilotAircraftPolicy.mjs: the airspeed feature scaled by 20, not 30                    3 red (the twelve-features row, the file's `by`, the fixed-point row; same reason as D)
//   F  pilotAircraftPolicy.mjs: the unstable-flight penalty dropped from the score           1 red (the unstable-flight-is-charged-5 row)
//   G  pilotAircraftPolicy.mjs: a child moves EVERY weight                                   2 red (the sparse-child row, the maxK row)
//   H  pilotAircraftPolicy.mjs: train() accepts a worse child as 'neutral'                   *** FIRST TRY WENT 0 RED: the sabotaged branch kept the old best SCORE while returning the worse child's weights, so the row's three clauses (deterministic, not below the hand
//      pilot's score, history only rises) all read the unchanged score. The row now also demands that the weights train() RETURNS score what it says they do *** -> 1 red
//   I  pilotAircraftPolicy.mjs: prune() makes one pass and stops                             1 red (the idempotence row: pruning its own output again moves more)
//   J  pilotAircraftPolicy.mjs: the zero pilot has a yaw bias                                8 red (the zero-pilot-commands-nothing row, forward(), the controls row, closed loop, patrol, the page's hand squadron, ...)
//   K  pilotAircraftPolicy.mjs: an audit start repeats a train start (yaw 36)                1 red (the disjoint-sets row)
//   L  pilotAircraftPolicy.mjs: the patrol never changes heading                             1 red (the file's `by` quotes a patrol it no longer reproduces)
//   M  pilotAircraftPolicy.mjs: the module's thrust drifts from the page's (55)              2 red (the constants-are-the-page's row and the file's `by`)
//   N  es-aircraft.html: the page's thrust drifts from the module's (55)                     1 red (the constants row)
//   O  es-aircraft.html: the patrol ignores the roster (always AP.decide)                    2 red (the zero squadron turns, the shipped pilot does not fly better)
//   P  es-aircraft.html: every aircraft flies the first pilot's function                     1 red (!! 'hand + noise' gives each aircraft its own pilot: the function count, 3 against 1)
//   Q  es-aircraft.html: 'shipped' is never offered                                          2 red
//   R  es-aircraft.html: the choice is not saved                                             2 red (the reload row, the saved-shipped row)
//   S  es-aircraft.html: an import without the policy check                                  1 red (the refusal row)
//   T  es-aircraft.html: Clear imported does nothing                                         1 red
//   U  es-aircraft.html: Start Patrol does not respawn                                       3 red (the laps no longer start from the same place: the hand-squadron row, the zero-squadron row and the shipped-patrol row)
//   V  pilotAircraftWeightsDefault.json: the file misquotes its held-out score               1 red (the `by` row)
//   W  pilotAircraftWeightsDefault.json: one shipped weight changed                          2 red (the `by` row and the fixed-point row)
// A NOTE ON G, H AND THE SERIAL RUN: the sabotages that make a search blow up (B, F, G) take three to four minutes each instead of one, because the gate's own train/prune rows then fly unstable aircraft for the whole 30 s.
// FOUND BEFORE THE SABOTAGES, BY THE GATE: my own comment in pilotAircraftPolicy.mjs said no angle repeats across the train, held-out and audit sets. 90 degrees does (a seeded axis in training, the vertical in the audit); the
// comment and the row now say so. The sets were not changed, because the audit had already been read for the champion.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as PA from "./pilotAircraftPolicy.mjs";
import * as PP from "./pilotPolicy.mjs";
import * as GP from "./gunnerPolicy.mjs";
import * as P6 from "./pilot6dofPolicy.mjs";
import * as AP from "./autopilotAircraft.mjs";
import * as R from "./pilotRoster.mjs";
import * as RB from "../physics/mechanics/rigidBody6dof.mjs";
import * as Topo from "./gfcTopology.mjs";
import * as PB from "./peerBrain.mjs";
import { weightsHash } from "./drivePolicy.mjs";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);
const mkRng = (seed) => { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const read = (f) => fs.readFileSync(path.join(ENG, f), "utf8");

// 60 seeded states of an aircraft: any orientation, a spin, a speed from 12 to 45 m/s along its own nose (so the airspeed feature varies), and a held heading anywhere on the sphere
const I = RB.boxInertia({ m: PA.AIRCRAFT_MASS, hx: PA.HX, hy: PA.HY, hz: PA.HZ });
const rng = mkRng(4839), STATES = [];
const unit = () => { const v = [rng() - 0.5, rng() - 0.5, rng() - 0.5], n = Math.hypot(...v) || 1; return v.map((c) => c / n); };
for (let k = 0; k < 60; k++) {
    const qv = [rng() - 0.5, rng() - 0.5, rng() - 0.5, rng() - 0.5], qn = Math.hypot(...qv) || 1, q = qv.map((c) => c / qn), sp = 12 + rng() * 33;
    STATES.push({ body: RB.createBody({ mass: PA.AIRCRAFT_MASS, I, pos: [rng() * 10, rng() * 10, rng() * 10], q, vel: RB.rotateByQuat(q, [sp, 0, 0]), w: [(rng() - 0.5) * 1.6, (rng() - 0.5) * 1.6, (rng() - 0.5) * 1.6] }), desired: unit() });
}
// and states that exercise the clamp and the bank wrap on purpose: nearly inverted, and pointed straight away
for (const q of [[0, 1, 0, 0], [0.05, 0.99, 0.05, 0], [0, 0, 0, 1], [0.7071, 0.7071, 0, 0]]) STATES.push({ body: RB.createBody({ mass: PA.AIRCRAFT_MASS, I, pos: [0, 0, 0], q, vel: [30, 0, 0], w: [0.1, -0.2, 0.3] }), desired: [1, 0, 0] });

sec("1. THE NETWORK");
{
    ok("!! twelve features and three outputs through the Giant Fiber Circuit's 34 neurons: 860 weights, which is none of the plane pilot's " + PP.WEIGHT_COUNT + ", the gunner's " + GP.WEIGHT_COUNT + " or the space-battle pilot's " + P6.WEIGHT_COUNT + " (a blob of one is not mistaken for another by its length)",
        PA.FEATURES === 12 && PA.OUTPUTS === 3 && PA.HIDDEN === Topo.NEURON_ORDER.length && PA.WEIGHT_COUNT === 12 * PA.HIDDEN + PA.HIDDEN + Topo.EDGES.length + PA.HIDDEN * 3 + 3 && PA.WEIGHT_COUNT === 860 &&
        ![PP.WEIGHT_COUNT, GP.WEIGHT_COUNT, P6.WEIGHT_COUNT].includes(PA.WEIGHT_COUNT) && PA.FEATURE_NAMES.length === 12 && PA.OUTPUT_NAMES.length === 3 && J(PA.OUTPUT_NAMES) === J(["pitch", "roll", "yaw"]), `${PA.HIDDEN} neurons, ${Topo.EDGES.length} synapses`);
    const w = new Float32Array(PA.WEIGHT_COUNT).fill(0); for (let k = 0; k < Topo.EDGES.length; k++) w[PA.FEATURES * PA.HIDDEN + PA.HIDDEN + k] = 1;
    const Wm = PA.layersOf(w)[1].W, edge = new Set(Topo.EDGES.map(([o, k]) => o * PA.HIDDEN + k));
    let outside = 0, onEdges = 0; for (let o = 0; o < PA.HIDDEN; o++) for (let k = 0; k < PA.HIDDEN; k++) { const v = Wm[o * PA.HIDDEN + k]; if (o === k) continue; if (v !== 0 && !edge.has(o * PA.HIDDEN + k)) outside++; if (v !== 0) onEdges++; }
    ok("!! the recurrent core is structurally zero outside the real synapses: with EVERY one of the 313 weights set, no entry outside the circuit's edges is nonzero", outside === 0 && onEdges > 0, `${onEdges} nonzero off-diagonal entries, ${outside} outside the circuit`);
    const z = PA.pilotFor(PA.zeroWeights()), outs = STATES.map((s) => z(s.body, s.desired));
    ok("!! the zero pilot commands nothing: zero pitch, roll and yaw on all " + STATES.length + " states", outs.every((o) => o.controls.pitch === 0 && o.controls.roll === 0 && o.controls.yaw === 0));
    ok("the hand and zero vectors are the right length and finite, and a perturbed vector keeps its length and differs", PA.handWeights().length === 860 && PA.handWeights().every(Number.isFinite) && (() => { const n = PA.perturb(PA.handWeights(), 0.05, mkRng(1)); return n.length === 860 && !same(n, PA.handWeights()); })());
    const hw = PA.handWeights(), x = PA.features(STATES[0].body, STATES[0].desired), y = PA.forward(hw, x), yz = PA.forward(PA.zeroWeights(), x), pf = PA.pilotFor(hw)(STATES[0].body, STATES[0].desired), L = PA.layersOf(hw);
    ok("!! forward() is the output layer: three numbers inside [-1, 1] (the clamp mixControls() takes), exactly zero for the zero weights, and pilotFor() is those numbers -- not a second computation", y.length === 3 && y.every((v) => Math.abs(v) <= 1) && yz.every((v) => v === 0) && pf.controls.pitch === y[0] && pf.controls.roll === y[1] && pf.controls.yaw === y[2], y.map((v) => v.toFixed(3)).join(","));
    ok("!! the core is " + PA.REC_STEPS + " weight-tied recurrent steps over " + PA.REC_EDGES + " real synapses: an encoder, REC_STEPS copies of ONE recurrent layer (the same object, so the weights are tied), and a decoder", PA.REC_STEPS === 3 && PA.REC_EDGES === Topo.EDGES.length && PA.REC_EDGES === 313 && L.length === PA.REC_STEPS + 2 && L.slice(1, 1 + PA.REC_STEPS).every((l) => l === L[1]) && L[0].nIn === PA.FEATURES && L[L.length - 1].nOut === PA.OUTPUTS);
    ok("the twelve features have the right size, in order: a bias of 1, a facing cosine of 1 when the nose is on the heading, an airspeed of 1 at 30 m/s, an upZ of 1 when upright", (() => {
        const level = RB.createBody({ mass: PA.AIRCRAFT_MASS, I, pos: [0, 0, 0], q: [1, 0, 0, 0], vel: [30, 0, 0] }), f = PA.features(level, [1, 0, 0]);
        return f.length === 12 && f[0] === 1 && Math.abs(f[9] - 1) < 1e-12 && Math.abs(f[10] - 1) < 1e-12 && Math.abs(f[11] - 1) < 1e-12 && f.slice(1, 9).every((v) => Math.abs(v) < 1e-9);
    })());
}
function J(x) { return JSON.stringify(x); }

sec("2. THE GEOMETRY IS decide()'s, state for state");
{
    let eq = true, bankEq = true, cosEq = true, desEq = true;
    for (const s of STATES) {
        const g = PA.geometry(s.body, s.desired), d = AP.decide(s.body, s.desired);
        cosEq = cosEq && g.facingCos === d.facingCos; bankEq = bankEq && g.currentBank === d.currentBank; desEq = desEq && g.desiredBank === d.desiredBank;
        eq = eq && g.eBody.every((v, i) => v === d.eBody[i]);
    }
    ok("!! the cosine to the heading is decide()'s, bit for bit, on all " + STATES.length + " states", cosEq);
    ok("!! the pointing error in the body frame is decide()'s, bit for bit", eq);
    ok("!! the bank it has and the bank it asks for are decide()'s, bit for bit", bankEq && desEq);
    const upright = RB.createBody({ mass: PA.AIRCRAFT_MASS, I, pos: [0, 0, 0], q: [1, 0, 0, 0], vel: [30, 0, 0] }), inverted = RB.createBody({ mass: PA.AIRCRAFT_MASS, I, pos: [0, 0, 0], q: [0, 1, 0, 0], vel: [30, 0, 0] });
    ok("upZ tells upright from inverted (a bank angle alone cannot at the pole): +1 and -1", Math.abs(PA.geometry(upright, [1, 0, 0]).upZ - 1) < 1e-12 && Math.abs(PA.geometry(inverted, [1, 0, 0]).upZ + 1) < 1e-12);
}

sec("3. THE HAND WEIGHTS ARE THE PD CONTROLLER, WRITTEN THROUGH THE NETWORK");
{
    const hand = PA.pilotFor(PA.handWeights());
    let worst = 0, signs = true, sat = 0, n = 0;
    for (const s of STATES) {
        const d = AP.decide(s.body, s.desired), h = hand(s.body, s.desired);
        for (const k of ["pitch", "roll", "yaw"]) { const a = d.controls[k], b = h.controls[k]; worst = Math.max(worst, Math.abs(a - b)); n++; if (Math.abs(a) === 1) sat++; if (Math.abs(a) > 1e-3 && Math.sign(a) !== Math.sign(b)) signs = false; }
    }
    ok("!! the controls ARE decide()'s: pitch, roll and yaw agree to float32 rounding (under 1e-5) on every one of the " + STATES.length + " states, the clamp included (" + sat + " of " + n + " readings sit on it)", worst < 1e-5 && sat > 10 && signs, `worst difference ${worst.toExponential(2)}`);
    // closed loop: a flight on the hand weights is the autopilot's flight
    const scs = [PA.scenario(5, 30), PA.scenario(6, 90), PA.scenario(7, 150), PA.scenario(1, 60, [0, 0, 1])];
    const fa = scs.map((sc) => PA.fly("autopilot", sc)), fh = scs.map((sc) => PA.fly("hand", sc));
    ok("!! in closed loop a hand-weights flight is the autopilot's flight: the same score to 1e-4 on four starts (30, 90 and 150 degrees about a seeded axis and a 60-degree yaw), and the same flight to the fingerprint on those that do not saturate",
        fa.every((a, i) => Math.abs(a.score - fh[i].score) < 1e-4 && Math.abs(a.mean - fh[i].mean) < 1e-4), fa.map((a, i) => `${a.score.toFixed(4)}/${fh[i].score.toFixed(4)}`).join(" "));
    const pa = PA.patrol("autopilot"), ph = PA.patrol("hand");
    ok("...and the same patrol (the page's own task, three legs): mean and worst leg agree to 1e-4", Math.abs(pa.mean - ph.mean) < 1e-4 && Math.abs(pa.worstLeg - ph.worstLeg) < 1e-4, `autopilot ${pa.mean.toFixed(4)} / ${pa.worstLeg.toFixed(4)}, hand ${ph.mean.toFixed(4)} / ${ph.worstLeg.toFixed(4)}`);
}

sec("4. THE FLIGHT: the page's constants, the score, the zero pilot");
{
    const src = read("es-aircraft.html"), num = (re) => { const m = re.exec(src); return m ? Number(m[1]) : NaN; };
    const mount = /const ENGINE_MOUNT = \[(-?[\d.]+), (-?[\d.]+), (-?[\d.]+)\]/.exec(src);
    ok("!! the constants this module flies with are the page's: mass, half-extents, engine mount and thrust, cruise speed, ten headings of 30 s -- read out of es-aircraft.html's source",
        num(/const AIRCRAFT_MASS = ([\d.]+)/) === PA.AIRCRAFT_MASS && num(/HX = ([\d.]+)/) === PA.HX && num(/HY = ([\d.]+)/) === PA.HY && num(/HZ = ([\d.]+)/) === PA.HZ && mount && J(mount.slice(1).map(Number)) === J(PA.ENGINE_MOUNT) &&
        num(/const ENGINE_THRUST = ([\d.]+)/) === PA.ENGINE_THRUST && num(/const CRUISE_SPEED = ([\d.]+)/) === PA.CRUISE_SPEED && num(/const N_HEADINGS = (\d+)/) === PA.N_HEADINGS && num(/LEG_SECONDS = (\d+)/) === PA.LEG_SECONDS && PA.DT === 1 / 30,
        `mass ${num(/const AIRCRAFT_MASS = ([\d.]+)/)}, thrust ${num(/const ENGINE_THRUST = ([\d.]+)/)}`);
    ok("the page's patrol headings are the module's: ten, evenly spaced about the vertical", J(PA.PATROL_HEADINGS.map((h) => h.map((v) => +v.toFixed(6)))) === J(Array.from({ length: 10 }, (_, i) => [Math.cos(i / 10 * 2 * Math.PI), Math.sin(i / 10 * 2 * Math.PI), 0].map((v) => +v.toFixed(6)))) && /Math\.cos\(a\), Math\.sin\(a\), 0/.test(src));
    const f = PA.fly("hand", PA.scenario(3, 90));
    ok("!! the score is exactly what it says: half the mean cosine plus half the final one, minus 5 for a flight that went non-finite or spun past 20 rad/s", Math.abs(f.score - (0.5 * f.mean + 0.5 * f.final - (f.bad ? 5 : 0))) < 1e-12 && f.bad === false && f.finite);
    const DEC0 = PA.FEATURES * PA.HIDDEN + PA.HIDDEN + PA.REC_EDGES, spin = PA.fly(Float32Array.from(PA.handWeights(), (v, i) => v * (i >= DEC0 ? -3 : 1)), PA.scenario(3, 120));
    ok("!! a flight that goes unstable is charged the 5: a hand pilot with its decoder reversed (positive feedback) spins up past 20 rad/s or goes non-finite and scores more than 4 below the real one on the same start", spin.bad === true && spin.score < PA.fly("hand", PA.scenario(3, 120)).score - 4, `bad ${spin.bad}, max rate ${spin.maxW.toFixed(1)}, score ${spin.score.toFixed(2)}`);
    const z = PA.fly("zero", PA.scenario(3, 90)), h = PA.fly("hand", PA.scenario(3, 90));
    ok("!! the zero pilot flies straight and loses: a 90-degree start never comes round (the final cosine stays at the starting offset's) while the hand pilot brings the nose most of the way", z.final < 0.2 && h.final > z.final + 0.4 && z.maxW < 0.5, `zero: final ${z.final.toFixed(3)}, max rate ${z.maxW.toFixed(2)}; hand: final ${h.final.toFixed(3)}`);
    ok("a flight is deterministic: the same pilot and start is the same fingerprint, and a different start another", PA.fly("hand", PA.scenario(3, 90)).fingerprint === h.fingerprint && PA.fly("hand", PA.scenario(4, 90)).fingerprint !== h.fingerprint);
}

const shippedExists = fs.existsSync(path.join(ENG, "brain", "pilotAircraftWeightsDefault.json"));
sec("5. THE PAGE: es-aircraft.html in its own browser");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const blobText = shippedExists ? read("brain/pilotAircraftWeightsDefault.json") : null;
        const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 400000, args: { shippedExists: !!blobText, blob: blobText ? JSON.parse(blobText) : null }, script: `async (args) => {
            const waitFor = async (fn, ms) => { const t = performance.now(); while (performance.now() - t < ms) { try { if (fn()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 100)); } return false; };
            const boot = async () => {
                const f = document.createElement("iframe"); f.style.cssText = "width:900px;height:600px;border:0"; f.src = "/es-aircraft.html"; document.body.appendChild(f);
                await waitFor(() => { const w = f.contentWindow; return w && w.__aircraftDemo && w.__aircraftDemo.roster && w.__aircraftDemo.state().tick >= 2; }, 60000);
                return { f, w: f.contentWindow, d: f.contentDocument };
            };
            try { localStorage.clear(); } catch (e) {}
            const P = await boot(); const D = P.w.__aircraftDemo, d = P.d, byId = (id) => d.getElementById(id), choose = (v) => { const s = byId("pilotSquad"); s.value = v; s.dispatchEvent(new P.w.Event("change", { bubbles: true })); };
            const out = { booted: !!D };
            out.btn = !!byId("rosterBtn") && !!byId("pilotSquad") && !!byId("startPatrol");
            byId("rosterBtn").click(); out.panelShown = byId("rosterPanel").style.display !== "none";
            if (args.shippedExists) await waitFor(() => D.roster.shipped || D.roster.shippedError, 30000);
            out.opts = Array.from(byId("pilotSquad").options).map((o) => o.value); out.def = byId("pilotSquad").value;
            out.squad0 = { id: D.roster.squad.id, scripted: D.roster.squad.scripted, label: D.roster.squad.label, note: byId("rosterNote").textContent };
            // run the patrol N ticks under a choice and report the squadron's quality and pose. step() is synchronous, so the page's own loop cannot interleave
            const lap = (spec, ticks) => {
                D.roster.setSpec(spec); D.roster.startPatrol();
                let sum = 0, n = 0, worst = 1; for (let i = 0; i < ticks; i++) { D.step(1); for (const a of D.state().fleet) { sum += a.facingCos; n++; if (a.facingCos < worst) worst = a.facingCos; } }
                const st = D.state(); return { spec, mean: sum / n, worst, tick: st.tick, fleet: st.fleet.map((a) => ({ pos: a.pos, q: a.q, idx: a.headingIdx, facing: a.facingCos })) };
            };
            const TICKS = 3000;
            out.auto = lap("auto", TICKS); out.hand = lap("hand", TICKS); out.zero = lap("zero", TICKS);
            out.poseDiff = Math.max(...out.auto.fleet.map((a, i) => Math.hypot(a.pos[0] - out.hand.fleet[i].pos[0], a.pos[1] - out.hand.fleet[i].pos[1], a.pos[2] - out.hand.fleet[i].pos[2])));
            out.qDiff = Math.max(...out.auto.fleet.map((a, i) => Math.max(...a.q.map((v, k) => Math.abs(v - out.hand.fleet[i].q[k])))));
            out.zeroQ = out.zero.fleet.map((a) => a.q.map((v) => +v.toFixed(3)));
            out.autoQ = out.auto.fleet.map((a) => a.q.map((v) => +v.toFixed(3)));
            // noise: each aircraft its own pilot
            D.roster.setSpec("noise10"); D.roster.startPatrol(); out.noise = { label: D.roster.squad.label, distinct: new Set(D.roster.squad.weights.map((w) => Array.from(w.slice(0, 60)).join())).size, scripted: D.roster.squad.scripted, fns: new Set(D.roster.pilots()).size };
            D.roster.setSpec("hand"); out.handFns = new Set(D.roster.pilots()).size;
            out.tallyTick = D.state().tick;
            // the shipped pilot
            if (args.shippedExists) {
                out.shipped = { loaded: !!D.roster.shipped, error: D.roster.shippedError, choices: D.roster.choices, line: byId("pilotLine").textContent };
                out.shippedLap = lap("shipped", TICKS); out.shippedSquad = { id: D.roster.squad.id, label: D.roster.squad.label, n: D.roster.squad.weights.length, sameWeights: D.roster.squad.weights.every((w) => w === D.roster.shipped) };
            }
            // import: refused by name, then accepted
            out.bad = { ok: D.roster.importBlob({ format: "swek-brain-v1", policy: "pilot6dofPolicy", weights: [] }), line: byId("pilotLine").textContent, importedStill: !!D.roster.imported };
            if (args.blob) {
                out.imp = { ok: D.roster.importBlob(args.blob), choices: D.roster.choices, imported: !!D.roster.imported };
                choose("imported"); D.roster.startPatrol(); out.impSquad = { id: D.roster.squad.id, label: D.roster.squad.label, same: D.roster.squad.weights.every((w) => w === D.roster.imported) };
                byId("clearPilot").click(); out.cleared = { imported: !!D.roster.imported, labels: Array.from(byId("pilotSquad").options).map((o) => o.textContent), squadId: D.roster.squad.id, problems: D.roster.squad.problems };
            }
            // persistence
            D.roster.setSpec("noise10"); out.persisted = JSON.stringify({ spec: D.roster.spec });
            P.f.remove();
            const Q = await boot(); out.reload = Q.d.getElementById("pilotSquad").value;
            Q.d.getElementById("rosterReset").click(); out.afterReset = Q.d.getElementById("pilotSquad").value;
            if (args.shippedExists) {
                Q.w.__aircraftDemo.roster.setSpec("shipped"); Q.f.remove();
                const R2 = await boot(); await waitFor(() => R2.w.__aircraftDemo.roster.shipped, 30000);
                out.shippedReload = { id: R2.w.__aircraftDemo.roster.squad.id, label: R2.w.__aircraftDemo.roster.squad.label, selected: R2.d.getElementById("pilotSquad").value };
                R2.w.__aircraftDemo.roster.setSpec("auto");
            }
            try { localStorage.clear(); } catch (e) {}
            return out;
        }` });
        ok("the harness booted es-aircraft.html and drove the panel", r.ok && r.result && r.result.booted, r.ok ? "" : String(r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 300));
        if (r.ok && r.result && r.result.booted) {
            const p = r.result;
            ok("!! the panel is there: a Load Pilots button opens it, one select for the squadron and Start Patrol; it starts on 'default for this team' with the choices a bare page holds (the PD autopilot, hand, two noise levels, zero, default) plus the shipped pilot once its file has loaded, and no 'Brain panel' choice, since this page has none",
                p.btn && p.panelShown && p.def === "auto" && ["auto", "scripted", "hand", "noise05", "noise10", "zero"].every((c) => p.opts.includes(c)) && !p.opts.includes("brain") && !p.opts.includes("imported") && p.opts.includes("shipped") === shippedExists, p.opts.join());
            ok("!! the default squadron is the old page: the PD heading-hold autopilot, named as such", p.squad0.id === "scripted" && p.squad0.scripted && /PD heading-hold autopilot/.test(p.squad0.label) && /PD heading-hold autopilot/.test(p.squad0.note), p.squad0.note);
            ok("!! a HAND squadron flies the same patrol as the default to rounding: after " + p.auto.tick + " ticks (three legs and more) every aircraft is within 5 cm and 1e-3 of the PD autopilot's position and attitude", p.poseDiff < 0.05 && p.qDiff < 1e-3 && Math.abs(p.auto.mean - p.hand.mean) < 1e-3, `position ${p.poseDiff.toExponential(2)} m, attitude ${p.qDiff.toExponential(2)}, mean cosine ${p.auto.mean.toFixed(4)} / ${p.hand.mean.toFixed(4)}`);
            ok("!! a ZERO squadron never turns: its three aircraft are still pointing where they started (attitude unchanged to 0.01) while the default's have come round, and it holds the heading far worse", p.zero.fleet.every((a) => Math.abs(a.q[0] - 1) < 0.01 && a.q.slice(1).every((v) => Math.abs(v) < 0.01)) && p.autoQ.some((q) => Math.abs(q[0] - 1) > 0.05) && p.zero.mean < p.auto.mean - 0.2, `zero mean ${p.zero.mean.toFixed(3)}, default ${p.auto.mean.toFixed(3)}`);
            ok("!! 'hand + noise' gives each aircraft its own pilot: three distinct weight vectors AND three distinct pilot functions the patrol loop flies (ship 3 flies pilot 3), against one shared function for a hand squadron", /noise 0.1/.test(p.noise.label) && p.noise.distinct === 3 && !p.noise.scripted && p.noise.fns === 3 && p.handFns === 1, `${p.noise.label}: ${p.noise.fns} functions; hand: ${p.handFns}`);
            if (shippedExists && p.shipped) {
                ok("!! the shipped pilot LOADS and is offered: the file arrives, 'shipped' is in the select, and the line names its hash and held-out score", p.shipped.loaded && !p.shipped.error && p.shipped.choices.includes("shipped") && !p.shipped.choices.includes("imported") && /shipped pilot [0-9a-f]{8}: held-out score/.test(p.shipped.line), J(p.shipped).slice(0, 260));
                ok("!! choosing it flies it: all three aircraft on the very weights the file carries", p.shippedSquad.id === "shipped" && /shipped pilot/.test(p.shippedSquad.label) && p.shippedSquad.n === 3 && p.shippedSquad.sameWeights, J(p.shippedSquad));
                ok("!! ...and on the PAGE'S OWN PATROL (three aircraft, " + p.auto.tick + " ticks) it holds the heading better than the PD autopilot it replaces: a higher mean cosine and no worse a worst reading", p.shippedLap.mean > p.auto.mean && p.shippedLap.worst >= p.auto.worst - 0.02, `shipped mean ${p.shippedLap.mean.toFixed(4)} worst ${p.shippedLap.worst.toFixed(3)}; autopilot mean ${p.auto.mean.toFixed(4)} worst ${p.auto.worst.toFixed(3)}`);
            }
            ok("!! a brain for another policy is REFUSED with a reason on the page and nothing is imported", p.bad.ok === false && /import refused/.test(p.bad.line) && p.bad.importedStill === false, p.bad.line);
            if (p.imp) {
                ok("!! a good file is imported: 'imported' joins the select, and choosing it flies those weights on every aircraft", p.imp.ok && p.imp.imported && p.imp.choices.includes("imported") && p.impSquad.id === "imported" && p.impSquad.same, J(p.impSquad));
                ok("!! Clear imported takes it away: the choice is no longer offered (a squadron that had picked it keeps a labelled 'not available here' entry) and is told so by name and flies the hand pilot rather than nothing", !p.cleared.imported && p.cleared.labels.some((l) => /imported.*not available here/.test(l)) && p.cleared.squadId === "hand" && p.cleared.problems.some((m) => /imported/.test(m)), J(p.cleared).slice(0, 260));
            }
            ok("!! the choice survives a reload (noise on the squadron), and Default pilots puts the select back on 'default for this team'", p.reload === "noise10" && p.afterReset === "auto", `${p.reload} then ${p.afterReset}`);
            if (p.shippedReload) ok("!! a SAVED choice of the shipped pilot survives the next load: it is made before the file has arrived, falls back to the hand pilot for a moment, and becomes the shipped pilot when the file lands", p.shippedReload.id === "shipped" && p.shippedReload.selected === "shipped" && /shipped pilot/.test(p.shippedReload.label), J(p.shippedReload));
        }
    }
}

sec("6. TRAINING and the pilot this page ships: brain/pilotAircraftWeightsDefault.json");
{
    const hand = PA.handWeights();
    const key = (sc) => `${sc.deg}|${J(sc.q.map((v) => +v.toFixed(5)))}`;
    const all = [...PA.TRAIN_SET, ...PA.HELD_OUT_SET, ...PA.AUDIT_SET];
    ok("the train, held-out and audit sets are three disjoint sets (" + PA.TRAIN_SET.length + ", " + PA.HELD_OUT_SET.length + ", " + PA.AUDIT_SET.length + " starts): no start is in two of them (the quaternion of every start is distinct), and the angles are disjoint but for ONE -- 90 degrees, flown about a seeded axis in training and about the vertical in the audit (a different start, said here rather than hidden)",
        new Set(all.map(key)).size === all.length && J(PA.TRAIN_SET.filter((a) => PA.AUDIT_SET.some((b) => a.deg === b.deg)).map((a) => a.deg)) === J([90, 90]) && !PA.HELD_OUT_SET.some((a) => PA.AUDIT_SET.some((b) => a.deg === b.deg)) && !PA.TRAIN_SET.some((a) => PA.HELD_OUT_SET.some((b) => a.deg === b.deg)) &&
        PA.TRAIN_SET.filter((a) => PA.AUDIT_SET.some((b) => a.deg === b.deg)).every((a) => PA.AUDIT_SET.filter((b) => b.deg === a.deg).every((b) => J(a.q.map((v) => +v.toFixed(4))) !== J(b.q.map((v) => +v.toFixed(4))))), `${all.length} starts, ${new Set(all.map(key)).size} distinct`);
    ok("the sets are frozen records (a gate cannot be passed by editing the set it grades)", Object.isFrozen(PA.TRAIN_SET) && Object.isFrozen(PA.HELD_OUT_SET) && Object.isFrozen(PA.AUDIT_SET) && Object.isFrozen(PA.TRAIN_SET[0]));
    const ev = PA.evaluate(hand, PA.TRAIN_SET.slice(0, 3));
    ok("evaluate is the mean flight score with the unstable count it says, over the starts it was given", Math.abs(ev.score - ev.runs.reduce((a, r) => a + r.score, 0) / 3) < 1e-12 && ev.runs.length === 3 && ev.unstable === ev.runs.filter((r) => r.bad).length && /^\d\.\d{3} \(mean/.test(PA.describeEval(ev)), PA.describeEval(ev));
    const bhw = PA.evaluate(hand, PA.HELD_OUT_SET), bz = PA.evaluate(PA.zeroWeights(), PA.HELD_OUT_SET);
    ok("versus() counts the starts flown better and worse by more than 0.01: the hand pilot against itself is all level, against the zero pilot all better", J(PA.versus(bhw, bhw)) === J({ better: 0, worse: 0, same: PA.HELD_OUT_SET.length }) && PA.versus(bhw, bz).better >= PA.HELD_OUT_SET.length - 1 && PA.versus(bz, bhw).worse >= PA.HELD_OUT_SET.length - 1);
    const before = Float32Array.from(hand), child = PA.mutate(hand, 0.3, mkRng(5), 4), diffs = Array.from(child).filter((v, i) => v !== hand[i]).length;
    ok("a child moves between one and four weights (it is SPARSE), and the parent is untouched", diffs >= 1 && diffs <= 4 && same(hand, before), `${diffs} weights moved`);
    ok("...with maxK 1 exactly one, and the same generator gives the same child", Array.from(PA.mutate(hand, 0.3, mkRng(9), 1)).filter((v, i) => v !== hand[i]).length === 1 && same(PA.mutate(hand, 0.3, mkRng(5), 4), child));
    // sigma 3 and up to twelve weights a child: a destructive search, so most children are clearly WORSE and a trainer that accepted them would show
    const small = PA.TRAIN_SET.slice(0, 3), t1 = PA.train({ seed: 3, iters: 20, sigma: 3, maxK: 12, trainSet: small }), t2 = PA.train({ seed: 3, iters: 20, sigma: 3, maxK: 12, trainSet: small });
    ok("train is deterministic for a seed, never ends below the hand pilot's own score on the starts it trained on (even when most children are worse), the weights it RETURNS score exactly what it says they do (a trainer that keeps a worse child but reports the best score it saw would pass every other clause), and its history only rises",
        same(t1.weights, t2.weights) && t1.trainScore >= PA.evaluate(hand, small).score - 1e-9 && Math.abs(PA.evaluate(t1.weights, small).score - t1.trainScore) < 1e-6 && t1.history.every((h, i, a) => !i || h.score >= a[i - 1].score - 1e-9) && t1.improved + t1.neutral <= 20, `train ${t1.trainScore.toFixed(3)}, ${t1.improved} improvements, ${t1.neutral} neutral`);
    const drift = Float32Array.from(hand); for (const i of [3, 77, 301, 640, 805]) drift[i] += 0.4;
    const pr = PA.prune(drift, { trainSet: small });
    ok("prune puts back weights that carry nothing: a hand pilot with five weights nudged comes back with fewer moved than it went in with, and no lower a score", pr.moved === 5 && pr.kept < 5 && pr.trainScore >= PA.evaluate(drift, small).score - 1e-9 && pr.weights !== drift, `${pr.moved} moved, ${pr.kept} kept`);
    const raw = PA.train({ seed: 3001, iters: 40, trainSet: small }).weights, p1 = PA.prune(raw, { trainSet: small }), p2 = PA.prune(p1.weights, { trainSet: small });
    ok("prune goes round until a pass reverts nothing: pruning its own output again changes nothing, and it never ends with more weights moved than it began with", p2.kept === p2.moved && same(p1.weights, p2.weights) && p1.kept <= p1.moved && p1.passes >= 1, `${p1.moved} moved -> ${p1.kept} kept in ${p1.passes} passes; again: ${p2.moved} -> ${p2.kept}`);
    ok("...and pruning the hand pilot itself moves nothing", PA.prune(hand, { trainSet: small.slice(0, 1) }).moved === 0);

    const file = path.join(ENG, "brain", "pilotAircraftWeightsDefault.json"), exists = fs.existsSync(file);
    ok("the shipped pilot's file exists", exists, file);
    if (exists) {
        const blob = JSON.parse(fs.readFileSync(file, "utf8")), imp = PB.importBrain(PB.describePolicy("pilotAircraftPolicy", PA), blob), w = imp.ok ? imp.weights : null;
        ok("it is a swek-brain-v1 file for THIS policy: 860 finite weights, imported by the same code the page uses; the space-battle pilot's descriptor refuses it by name", imp.ok && blob.weightCount === 860 && PB.importBrain(PB.describePolicy("pilot6dofPolicy", P6), blob).ok === false && /pilotAircraftPolicy/.test(PB.importBrain(PB.describePolicy("pilot6dofPolicy", P6), blob).reason), imp.ok ? `hash ${weightsHash(w)}` : imp.reason);
        if (w) {
            const diffN = Array.from(w).filter((v, i) => Math.abs(v - hand[i]) > 1e-6).length, claimed = /(\d+) of the 860 weights differ/.exec(blob.by || "");
            const held = PA.evaluate(w, PA.HELD_OUT_SET), aud = PA.evaluate(w, PA.AUDIT_SET), handAud = PA.evaluate("hand", PA.AUDIT_SET), handHeld = PA.evaluate("hand", PA.HELD_OUT_SET), pat = PA.patrol(w), patHand = PA.patrol("hand");
            ok("!! what the file SAYS about itself is what the code gets: its `by` quotes the held-out and audit results, the patrol, and the count of weights that differ from the hand pilot, and a fresh run reproduces all of them",
                blob.by.includes(PA.describeEval(held)) && blob.by.includes(PA.describeEval(aud)) && blob.by.includes(`patrol mean ${pat.mean.toFixed(3)}`) && claimed && Number(claimed[1]) === diffN && blob.score === Number(held.score.toFixed(3)), `held-out ${PA.describeEval(held)}; audit ${PA.describeEval(aud)}; patrol ${pat.mean.toFixed(3)}; ${diffN} weights differ`);
            const vs = PA.versus(aud, handAud);
            ok("!! IT BEATS THE PILOT IT REPLACES where it was never trained: a higher score than the PD controller on the audit starts AND on the held-out starts, and on the audit more starts flown better than worse, with no more flights lost to instability", aud.score > handAud.score && held.score > handHeld.score && vs.better > vs.worse && aud.unstable <= handAud.unstable, `audit ${PA.describeEval(aud)} vs PD ${PA.describeEval(handAud)}; held-out ${PA.describeEval(held)} vs PD ${PA.describeEval(handHeld)}; better ${vs.better} / worse ${vs.worse} / same ${vs.same}`);
            ok("!! ...and it has not bought that with the page's own task: its patrol (three legs of the page's 36-degree turns) is no worse than the PD controller's, to 0.01 on the mean", pat.mean >= patHand.mean - 0.01, `patrol mean ${pat.mean.toFixed(3)} (worst leg ${pat.worstLeg.toFixed(3)}) vs PD ${patHand.mean.toFixed(3)} (${patHand.worstLeg.toFixed(3)})`);
            ok("it is a smaller thing than it looks: the file differs from the PD controller in fewer than a fifth of the weights (the rest went back; prune's header has why)", diffN > 0 && diffN < 172, `${diffN} of 860`);
            const again = PA.prune(w, { trainSet: PA.TRAIN_SET });
            ok("pruning the shipped pilot again reverts nothing (it is already at a fixed point: every weight left is one the score needs)", again.kept === again.moved && again.passes === 1, `${again.moved} moved, ${again.kept} kept, ${again.passes} pass(es)`);
        }
    }
}

console.log(fails ? `\npilotAircraftPolicy-selfcheck: ${fails} FAILED` : "\npilotAircraftPolicy-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
