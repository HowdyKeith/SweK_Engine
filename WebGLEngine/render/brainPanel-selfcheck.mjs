// WebGLEngine/render/brainPanel-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/brainPanel-selfcheck.mjs      (~22 s)
//
// THE SELECTED BRAIN ACTIVITY PANEL (render/brainPanel.mjs), the sub aquarium's and the flight page's: the activity of the selected vessel's brain drawn the way that kind of brain is, and a policy map computed by CALLING the pilot.
//   1  THE KINDS     autopilot, fly, gpu, fish, manual; the fish is not flown by either page and says so; an unknown kind is described, not thrown on
//   2  ACTIVATIONS   the hidden layer of a network (34 neurons for the fly, 32 for the GPU net), its outputs equal to the policy's own forward(), a throttle mapped to [-1, 1], a NaN feature read as 0
//   3  THE AUTOPILOT NO NETWORK: its rows are the features, the laws' intermediate numbers (scaled by the full scales the header names) and its four outputs, equal to its own decide()
//   4  THE MAP       policyMap on a sub and on an aircraft: the signs (a vessel too deep is told to pitch UP, too shallow DOWN; heading right of the target is told to turn LEFT; an aircraft too high pitches DOWN and a heading to the left of the target
//                    rolls RIGHT), the centre is quiet on an on-target vessel, the marker is the REAL offset (heading wrapped), `inside` says whether the grid holds it, a pilot that throws or answers nothing leaves zeros and not a hole
//   5  THE PANELS    the fly sub's panel has 14 / 34 / 4 rows and the hand weights' map agrees with the autopilot's (they are the same laws); the autopilot sub's has 14 / 6 / 4; a GPU aircraft's 18 / 32 / 4; a manual one the stick and no map; a fish nothing
//   6  THE DRAWING   with a context that records its calls: an arrow per cell that commands anything, the target's cross in green, the vessel's ring white on the grid and red off it, the bars of the rows, the note wrapped under
//   7  THE SIM       tank.probe(id): kind fly for a sub given 963 weights and autopilot for one with none, the live state and the target it was flown to, null for an unknown id
//   9  THE OTHER FLIGHT PAGES  es-aircraft (the PD law and the network, a map of where the nose is pushed), es-box3d-fly3d (the fly network and the scripted AI), the tactics pages flight-gpu and es-box3d (the weights, the candidates' features, the flee test, and a heat map of how attractive a target would be around the ship)
//  10  THE PAGES THAT FLY IT   source rows for the four pages and flight.html's absence; a browser run of three of them
//   8  THE PAGES     sub-aquarium.html and es-flight6dof.html have the canvas, import the panel and draw the SELECTED vessel's (the list selection; the camera's aircraft) five times a second
//
// SABOTAGE LOG -- THIRTY-FOUR, each applied in place, the gate run, the file restored; every one red by name (rows red; "crash" is red without a FAIL line):
//   render/brainPanel.mjs: B1 the fly not a network 2 | B2 the fish flown 2 | B3 the throttle not mapped 1 | B4 the OUTPUT layer counted as hidden 6 | B5 a NaN feature not read as 0 1 | B6 the depth law at the wrong scale 1 | B7 the aircraft throttle not mapped 1
//   B8 the heading offset sign 1 | B9 the depth offset sign 1 | B10 the altitude offset sign 1 | B11 the marker's sign 2 | B12 the marker's heading not wrapped 1 | B13 a throwing pilot (crash) | B14 n not floored at 3 1 | B15 the sub map yUp 2 | B16 the span 6 m 2
//   B17 the y axis not flipped for an aircraft 1 | B18 the off-grid ring not red 1 | B19 an arrow in every cell 2 | B20 a fish probe drawn 1 | B21 the fly shown as the autopilot 2 | B22 a human given a map 1 | B23 the map given no room 0 THE FIRST TIME (see below) | 
//   render/subAquariumSim.mjs: B24 probe returns nothing (crash) | B25 every sub a fly 1 | B26 the wander target in place of the flown one 0 THE FIRST TIME | B27 any weights taken, not only 963 1
//   pages: H1 the aquarium draws the first sub, not the selected one 1 | H2 no throttle on the redraw 1 | H3 drawBrain never called 1 | H4 a GPU pilot labelled fly 1 | H5 the flight page always draws aircraft 1 1 | H6 updateBoard never draws 1
// SECTIONS 9 AND 10 (the other flight pages), THIRTY-ONE more, each in place and restored (rows red): aircraftMap A1 the left axis flipped 1 | A2 yaw not negated 1 | A3 pitch not negated 1 | A4 the ring's u sign 1 | A5 the ring read in the world frame 1 | A6 span 0.4 1
//   fly3dMap F1 the yaw error entered in radians, not radians / pi 1 | F2 the ring unscaled 1 | F3 turn and pitch swapped 1 | F4 the scripted panel given a map 0 (the object's later `map: null` wins: an EQUIVALENT mutant)
//   tactics T1 no mean weakness or threat in the heat 1 | T2 no reach 1 | T3 the first foe ringed 2 | T4 a dead foe a point 1 | T5 no hysteresis in the flee bar 1 | T6 candidates the wrong way up 1 | T7 one candidate 2 | T8 never fleeing 2 | T9 the heat not red 1 | T10 no heat dispatch 1 | T11 the map's title 1 | T12 a ring on every foe 1
//   pages P1 the aircraft picker ignored 1 | P2 one weight set for every aircraft 0 (EQUIVALENT: a squadron flies one set) | P3 the fly-3D picker ignored 1 | P4 the fly-3D kind always scripted 1 | P5 the tactics panel without the side's weights 1 | P6 es-box3d never draws 1 | P7 a dead ship picked 0 (EQUIVALENT: the fallback is the first live A ship)
// A1, A6, F1, T4, T5 and P3 went 0 red the first time: A1's pattern changed the nose-axis component, which is zero for the test body; F1's tanh saturates the hand weights; T4 was masked by the panel's own filter; T5 and P3 had no row. Each has one now.
// SECTION 11 (the steer lens, render/brainLens.mjs), TEN more, each in place and restored (rows red): L1 the ablation sign flipped 1 | L2 the rank ascending 2 | L3 no floor on the layer's rms 1 | L4 the push ignoring the dose 1 | L5 connections unsorted 1 (0 THE FIRST TIME: the hand weights
//   happen to be in order, so the row now uses a fixture whose weights are not) | L6 a negative push drawn as a positive bar 1 and L6b a negative bar not moved left of the centre 1 (0 THE FIRST TIME: nothing looked at the bar's colour or side) | L7 the aircraft panel without a lens 1 | L8 the lens never drawn 1.
//   NOT SEEN: the lens on a real page. The aquarium's and the flight pages' canvases were not opened for it; the lens takes the lower 40% of the left half of the brain canvas.
// SECTION 12 (the layered map, the selected neuron, the steer, v4904), ELEVEN more, each in place and restored (rows red): M1 the hidden columns without their relu 1 | M2 the contributions not sorted 1 | M3 the selection ignored 5 | M4 pickNeuron ignoring the radius 1 | M5 no incoming
//   lines for a selection 1 | M6 steerWeights editing the original 2 | M7 the steer's sign flipped 2 | M8 negative lines drawn blue 1 | M9 linkLine giving a feature inputs 1 (a CRASH the first time, red but not by name: the row now catches it) | M10 netOf dropping the selection 3 | M11 the layers view ignored 1.
//   FIXTURES THAT HAD TO BE STRONGER: the GPU net's hand weights are sparse (8 of 1024 nonzero in h1 -> h2, four active neurons per hidden layer), so the most active neuron's lines are already among the top two and a selection added none; the row now picks the first active neuron that gains lines.
// SECTION 13 (the aquarium's clicks, v4904, a browser), FIVE page sabotages, each in place on sub-aquarium.html and restored: A1 the click picking nothing 2 (+ a page click that cannot reach a disabled button, caught) | A2 the steer delta zero 2 | A3 any selected neuron pushable 1 | A4 the view picker ignored 2 | A5 the header never saying STEERED 1.
//   The first run clicked outside the viewport (the canvas sits below the fold: the click now scrolls it into view) and then used the no-selection layout for the layers view (a selected neuron puts the wiring line on top and shifts the map 14 px down).
// SECTION 14 (the flight pages' clicks, v4904), SIX more, each in place and restored: U1 a second click not letting go (render/brainUi.mjs) 1 | U2 page coordinates not scaled to the canvas 2 | U3 the selection kept for somebody else 1 | U4 the view always bars 1+ (and it broke the aquarium rows too: see the next line) |
//   U5 es-aircraft's panel built without the selection 3 | U6 es-box3d-fly3d never saying WHO the panel is about 1. THE AQUARIUM ROWS OF SECTION 13 FLAKED ONCE under that load (the first click came before the first drawing): they now wait for the header, not for half a second; three clean runs after.
// THE HOLD SLIDER (v4904, section 13), FIVE page sabotages: S1 the slider never steering 3 | S2 the slider's position recomputed from the moving lens scale 1 | S3 zero not calling the clear 0 -- EQUIVALENT: tank.setSteer treats a delta of 0 as a clear, so the other branch does the same thing; the line stays as the intent |
//   S4 the slider snapping back while it is dragged 1 (the source row only: a headless drag cannot be told from a click) | S5 the outputs never named in the readout 2.
// B23 and B26 went 0 red the first time: no row looked at WHERE the panel put the map, and inside the steering box the flown target IS the wander target; the rows for the map's place on the canvas and for a sub outside the box now do.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as B from "./brainPanel.mjs";
import { mlpLayerCpu } from "./brainTsl.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as F from "../physics/mechanics/flightModel6dof.mjs";
import * as AS from "../brain/autopilotSub.mjs";
import * as AF from "../brain/autopilotFlight.mjs";
import * as PS from "../brain/pilotSubPolicy.mjs";
import * as PF from "../brain/pilotFlightPolicy.mjs";
import * as MF from "../brain/pilotFlightMlp.mjs";
import { createTank } from "./subAquariumSim.mjs";
import * as AP from "../brain/autopilotAircraft.mjs";
import * as PA from "../brain/pilotAircraftPolicy.mjs";
import * as PP from "../brain/pilotPolicy.mjs";
import * as TX from "../ev/esTactics.js";
import http from "node:http";
import { createRequire } from "node:module";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "../tools/ship/playwrightResolve.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t;
const rec = () => { const calls = []; return new Proxy({}, { get: (_, k) => (k === "calls" ? calls : (...a) => { calls.push([k, ...a]); }), set: (_, k, v) => { calls.push(["set:" + k, v]); return true; } }); };

const subState = (o = {}) => S.createState({ depth: 25, speed: 2, heading: 0.4, ...o }), subTarget = { depth: 30, heading: 0, speed: 2.5 };
const flState = () => F.createState({ pos: [0, 0, 300], speed: 45, heading: 0.3, mass: AF.defaultModel().mass, inertia: AF.defaultModel().inertia }), flTarget = { altitude: 300, heading: 0, airspeed: 45 };

console.log("brainPanel-selfcheck -- what the selected brain is doing\n");

console.log("1. THE KINDS");
{
    ok("!! five kinds; the fly and the GPU net are networks, the autopilot and the human are not, and the zebrafish circuit is NOT flown by these pages", Object.keys(B.KINDS).join() === "autopilot,fly,gpu,fish,manual" && B.KINDS.fly.network && B.KINDS.gpu.network && !B.KINDS.autopilot.network && !B.KINDS.manual.network && B.KINDS.fish.flown === false && B.KINDS.autopilot.flown && Object.isFrozen(B.KINDS));
    ok("an unknown kind is described as itself, no network, not flown (it does not throw)", (() => { const d = B.describeKind("toString"); const e = B.describeKind("nonsense"); return d.label === "toString" && e.label === "nonsense" && !e.network && !e.flown; })());
}

console.log("\n2. ACTIVATIONS");
{
    const w = PS.handWeights(), x = PS.features(subState(), subTarget), a = B.activations(PS, w, x, PS.OUTPUT_NAMES), c = PS.forward(w, x);
    ok("!! the fly's activations: 14 features, 34 hidden neurons, four outputs equal to the policy's own forward()", a.input.length === 14 && a.hidden.length === 34 && a.output.length === 4 && PS.OUTPUT_NAMES.every((n, i) => near(a.output[i], c[n], 1e-6)));
    const wg = MF.handWeights(), xf = PF.features(flState(), flTarget), g = B.activations(MF, wg, xf, PF.OUTPUT_NAMES), cg = MF.forward(wg, xf);
    ok("!! the GPU net's: 18 features, 32 hidden, four outputs, the throttle mapped from 0..1 to -1..1 (so a throttle of 0.66 reads 0.32)", g.input.length === 18 && g.hidden.length === 32 && near(g.output[3], cg.throttle * 2 - 1, 1e-6) && near(g.output[0], cg.pitch, 1e-6) && near(g.output[1], cg.roll, 1e-6), `throttle ${cg.throttle.toFixed(3)} -> ${g.output[3].toFixed(3)}`);
    const xn = Array.from(x); xn[2] = NaN; xn[4] = Infinity;
    const an = B.activations(PS, w, xn, PS.OUTPUT_NAMES);
    ok("a NaN or infinite feature is read as 0 and the activations stay finite", an.input[2] === 0 && an.input[4] === 0 && Array.from(an.hidden).every(Number.isFinite) && Array.from(an.output).every(Number.isFinite));
}

console.log("\n3. THE AUTOPILOT HAS NO NETWORK");
{
    const rows = B.subAutopilotRows(subState(), subTarget), g = AS.guidance(subState(), subTarget), c = AS.decide(subState(), subTarget);
    ok("!! a sub autopilot's rows are features (14), laws (6) and outputs (4), and the outputs ARE its decide()", rows.map((r) => r.layer + r.values.length).join() === "features14,laws6,outputs4" && PS.OUTPUT_NAMES.every((n, i) => rows[2].values[i] === c[n]));
    ok("!! the laws are the intermediate numbers at their stated full scales: depth error / 20 m, heading error / pi, speed error / 2, climb command / 1, pitch command / 0.3, pitch error / 0.3", near(rows[1].values[0], Math.max(-1, Math.min(1, g.depthErr / 20))) && near(rows[1].values[1], Math.max(-1, Math.min(1, g.headingErr / Math.PI))) && near(rows[1].values[2], Math.max(-1, Math.min(1, g.speedErr / 2))) && near(rows[1].values[3], g.vzCmd) && near(rows[1].values[4], g.pitchCmd / 0.3) && rows[1].values.every((v) => Math.abs(v) <= 1), JSON.stringify(rows[1].values.map((v) => +v.toFixed(3))));
    const fr = B.flightAutopilotRows(flState(), flTarget), fc = AF.decide(flState(), flTarget).controls;
    ok("!! an aircraft autopilot's: features (18), laws (5), outputs (4), the throttle mapped, outputs equal to its decide()", fr.map((r) => r.layer + r.values.length).join() === "features18,laws5,outputs4" && fr[2].values[0] === fc.pitch && fr[2].values[1] === fc.roll && near(fr[2].values[3], fc.throttle * 2 - 1, 1e-9));
}

console.log("\n4. THE MAP");
{
    const st = subState({ heading: 0 }), tg = { depth: 25, heading: 0, speed: 2 }, ap = (s, t, c) => AS.decide(s, t, c), m = B.policyMap(ap, st, tg, B.SUB_MAP, { n: 9 });
    const cell = (mm, i, j) => mm.cells[j * mm.n + i];
    ok("!! the grid is n x n (9 x 9 = 81 cells), spans +-1.2 rad and +-12 m, and the on-target cell (the middle) commands nothing a trimmed vessel on target does not (|yaw|, |pitch| under 0.05)", m.cells.length === 81 && near(cell(m, 0, 0).ox, -1.2) && near(cell(m, 8, 0).ox, 1.2) && near(cell(m, 0, 0).oy, -12) && near(cell(m, 0, 8).oy, 12) && Math.abs(cell(m, 4, 4).a) < 0.05 && Math.abs(cell(m, 4, 4).b) < 0.05, `centre ${cell(m, 4, 4).a.toFixed(3)}, ${cell(m, 4, 4).b.toFixed(3)}`);
    ok("!! SIGNS, sub: 12 m DEEPER than the target is told to pitch UP (b > 0), 12 m SHALLOWER to pitch DOWN (b < 0); a heading 1.2 rad to the RIGHT of the target is told to yaw LEFT (a < 0), to the LEFT yaw RIGHT (a > 0)", cell(m, 4, 8).b > 0.2 && cell(m, 4, 0).b < -0.2 && cell(m, 8, 4).a < -0.2 && cell(m, 0, 4).a > 0.2, `deep ${cell(m, 4, 8).b.toFixed(2)}, shallow ${cell(m, 4, 0).b.toFixed(2)}, right ${cell(m, 8, 4).a.toFixed(2)}, left ${cell(m, 0, 4).a.toFixed(2)}`);
    const live = B.policyMap(ap, subState({ heading: 0.4, depth: 20 }), { depth: 30, heading: 6.28318530718 - 0.4 + 0.4, speed: 2 }, B.SUB_MAP);
    ok("!! the marker is the vessel's REAL offset from its REAL target: heading 0.4 against a target of 2 pi is +0.4 (wrapped), depth 20 against 30 is -10, and it is on the grid", near(live.marker.ox, 0.4, 1e-9) && near(live.marker.oy, -10, 1e-9) && live.marker.inside === true);
    const off = B.policyMap(ap, subState({ heading: 2.0, depth: 5 }), tg, B.SUB_MAP);
    ok("!! a vessel off the grid (2 rad and 20 m off) has inside false, and the marker still says where it is", off.marker.inside === false && near(off.marker.ox, 2.0, 1e-9) && near(off.marker.oy, -20, 1e-9));
    const bad = B.policyMap(() => { throw new Error("no"); }, st, tg, B.SUB_MAP, { n: 5 }), none = B.policyMap(() => null, st, tg, B.SUB_MAP, { n: 5 });
    ok("!! a pilot that throws, or answers nothing, leaves a grid of zeros and not a hole", bad.cells.length === 25 && bad.cells.every((c) => c.a === 0 && c.b === 0 && c.mag === 0) && none.cells.length === 25 && bad.maxMag === 0);
    ok("n is at least 3 and the heat's scale is the strongest command on the grid", B.policyMap(ap, st, tg, B.SUB_MAP, { n: 1 }).n === 3 && near(m.maxMag, Math.max(...m.cells.map((c) => c.mag)), 1e-12) && m.maxMag > 0.5);
    const fm = B.policyMap((s, t, w) => AF.pilot(s, t, w), flState(), flTarget, B.FLIGHT_MAP, { n: 9 });
    ok("!! SIGNS, aircraft: 60 m TOO HIGH is told to pitch DOWN and 60 m too low UP (altitude up is the top of the screen), a heading 1 rad to the LEFT of the target is told to roll RIGHT and to the right LEFT", cell(fm, 4, 8).b < -0.02 && cell(fm, 4, 0).b > 0.02 && cell(fm, 0, 4).a > 0.2 && cell(fm, 8, 4).a < -0.2 && fm.yUp === true && m.yUp === false, `high ${cell(fm, 4, 8).b.toFixed(2)}, low ${cell(fm, 4, 0).b.toFixed(2)}, left ${cell(fm, 0, 4).a.toFixed(2)}, right ${cell(fm, 8, 4).a.toFixed(2)}`);
    const pt = (mm, ox, oy) => B.mapPoint(mm, ox, oy, 10, 20, 100, 200);
    ok("!! mapPoint puts the centre in the middle of the box, a sub's deeper-is-down (oy +12 is the bottom) and an aircraft's higher-is-up (oy +60 is the top), and clamps a point off the grid to the edge", near(pt(m, 0, 0)[0], 60) && near(pt(m, 0, 0)[1], 120) && near(pt(m, 0, 12)[1], 220) && near(pt(fm, 0, 60)[1], 20) && near(pt(m, 9, 99)[0], 110) && near(pt(m, -9, -99)[1], 20));
}

console.log("\n5. THE PANELS");
{
    const w = PS.handWeights(), st = subState(), pf = B.subPanel({ kind: "fly", weights: w, state: st, target: subTarget }), pa = B.subPanel({ kind: "autopilot", state: st, target: subTarget });
    ok("!! the fly sub's panel: features 14, hidden 34, outputs 4, and a 9 x 9 map of ITS OWN forward()", pf.rows.map((r) => r.layer + r.values.length).join() === "features14,hidden34,outputs4" && pf.map.cells.length === 81 && pf.kind === "fly");
    const MAXD = Math.max(...pf.map.cells.map((c, i) => Math.hypot(c.a - pa.map.cells[i].a, c.b - pa.map.cells[i].b)));
    ok("!! the fly's HAND weights are the autopilot's laws written through the network, and the two maps agree to 0.35 in every cell (the network clamps and the laws are scheduled differently at the far corners)", MAXD < 0.35, `largest difference ${MAXD.toFixed(3)}`);
    ok("!! the autopilot sub's panel: features 14, laws 6, outputs 4 and a map; no hidden layer", pa.rows.map((r) => r.layer + r.values.length).join() === "features14,laws6,outputs4" && pa.map && pa.kind === "autopilot" && !pa.rows.some((r) => r.layer === "hidden"));
    const hw = MF.handWeights(), pg = B.flightPanel({ kind: "gpu", policy: MF, weights: hw, pilot: MF.pilotFor(hw), state: flState(), target: flTarget, wind: [0, 0, 0] });
    ok("!! a GPU aircraft's panel: features 18, hidden 32, outputs 4 and a map of the GPU net's own policy", pg.rows.map((r) => r.layer + r.values.length).join() === "features18,hidden32,outputs4" && pg.map && pg.map.cells.length === 81 && pg.kind === "gpu");
    const pfl = B.flightPanel({ kind: "fly", policy: PF, weights: PF.handWeights(), pilot: PF.pilotFor(PF.handWeights()), state: flState(), target: flTarget }), pal = B.flightPanel({ kind: "autopilot", pilot: (s, t, w) => AF.pilot(s, t, w), state: flState(), target: flTarget });
    ok("!! the fly aircraft's: 18 / 34 / 4; the autopilot aircraft's: 18 / 5 / 4, no hidden layer", pfl.rows.map((r) => r.layer + r.values.length).join() === "features18,hidden34,outputs4" && pal.rows.map((r) => r.layer + r.values.length).join() === "features18,laws5,outputs4");
    const man = B.flightPanel({ kind: "manual", state: flState(), target: flTarget, stick: { pitch: 0.2, roll: -0.5, yaw: 0, throttle: 0.66 } });
    ok("!! a human's panel is the stick (pitch, roll, yaw, throttle 0.66 read as 0.32) and has no map", man.map === null && man.rows.length === 1 && man.rows[0].values[1] === -0.5 && near(man.rows[0].values[3], 0.32, 1e-9));
    const fish = B.subPanel({ kind: "fish", state: st, target: subTarget }), none = B.subPanel(null);
    ok("!! the zebrafish circuit says it is not flown here and draws nothing; no probe says no sub is selected", fish.rows.length === 0 && fish.map === null && /does not fly that brain/.test(fish.note) && none.rows.length === 0 && /no sub selected/.test(none.note) && B.flightPanel(null).rows.length === 0);
}

console.log("\n6. THE DRAWING");
{
    const p = B.subPanel({ kind: "autopilot", state: subState(), target: subTarget }), g = rec();
    const r = B.drawMap(g, 100, 50, 180, 180, p.map, { title: "T" }), c = g.calls;
    const moves = c.filter((x) => x[0] === "moveTo").length;
    const live = p.map.cells.filter((q) => q.mag > 1e-3).length;
    ok("!! drawMap draws a heat cell per grid cell (81 fillRects after the background) and ONE ARROW per cell that commands something (" + live + " of 81), each a moveTo/lineTo from its cell's centre", r.cells === 81 && r.arrows === live && c.filter((x) => x[0] === "fillRect").length === 82 && live > 40, `${r.arrows} arrows`);
    ok("!! the target is a green cross at the centre of the box and the vessel is a ring: white on the grid", c.some((x) => x[0] === "set:strokeStyle" && x[1] === "#5fe08a") && c.some((x) => x[0] === "set:strokeStyle" && x[1] === "#ffffff") && c.filter((x) => x[0] === "arc").length === 1 && !c.some((x) => x[0] === "set:strokeStyle" && x[1] === "#ff7a7a"));
    const off = B.policyMap((s, t, cc) => AS.decide(s, t, cc), subState({ heading: 2.5 }), subTarget, B.SUB_MAP), g2 = rec(); B.drawMap(g2, 0, 0, 100, 100, off);
    ok("!! a vessel off the grid is a RED ring", g2.calls.some((x) => x[0] === "set:strokeStyle" && x[1] === "#ff7a7a"));
    const arc = c.find((x) => x[0] === "arc"), [ex, ey] = B.mapPoint(p.map, p.map.marker.ox, p.map.marker.oy, 100, 50, 180, 180);
    ok("the ring is drawn at the vessel's mapPoint", near(arc[1], ex, 1e-9) && near(arc[2], ey, 1e-9));
    const gp = rec(), res = B.drawPanel(gp, 600, 300, p, { title: "x" }), rects = gp.calls.filter((x) => x[0] === "fillRect");
    ok("!! drawPanel gives the MAP the right of the box (its heat cells start at x = 330 of 600: 45% of the width, square) and the bars the left", rects.filter((x) => x[1] >= 330 && x[3] > 10 && x[3] < 40).length >= 81 && rects.some((x) => x[1] >= 40 && x[1] < 100 && x[3] < 25));
    ok("!! drawPanel draws the bars of every row (14 + 6 + 4 = 24) and the map's arrows, wraps the note under them, and a panel with no map gives the bars the whole width", res.bars === 24 && res.arrows === live && gp.calls.filter((x) => x[0] === "fillText").length >= 4 && (() => { const q = rec(); const r2 = B.drawPanel(q, 600, 300, B.flightPanel({ kind: "manual", state: flState(), target: flTarget, stick: {} })); return r2.arrows === 0 && r2.bars === 4; })());
}

console.log("\n7. THE SIM");
{
    const tank = createTank(), w = Array.from(PS.handWeights());
    tank.sync([{ id: "n", name: "Net", hue: 1, pilot: "network", from: "x", local: true, weights: w }, { id: "p", name: "Plain", hue: 2, pilot: "autopilot", from: "x", local: true, weights: null }, { id: "c", name: "Corrupt", hue: 3, pilot: "network", from: "x", local: false, weights: w.slice(1) }]);
    for (let i = 0; i < 90; i++) tank.step(1 / 30);
    const a = tank.probe("n"), b = tank.probe("p"), c = tank.probe("c");
    ok("!! probe: kind fly for the sub given 963 weights, autopilot for one with none, AND autopilot for one with 962 (it is flown by the autopilot, and the panel says what flies it)", a.kind === "fly" && a.weights.length === 963 && b.kind === "autopilot" && b.weights === null && c.kind === "autopilot" && c.weights === null, `${a.kind}, ${b.kind}, ${c.kind}`);
    ok("!! probe carries the LIVE state (the tank's own) and the target the sub was flown to last tick (depth, heading, speed), and a name", a.state === tank.subs.get("n").state && Number.isFinite(a.target.depth) && Number.isFinite(a.target.heading) && Number.isFinite(a.target.speed) && a.name === "Net");
    ok("an unknown id is null", tank.probe("nobody") === null);
    const sub = tank.subs.get("p"); sub.state = { ...sub.state, pos: [10, 150, sub.state.pos[2]] }; tank.step(1 / 30);
    const outside = tank.probe("p"), HT = Math.atan2(-(150 - 150), 250 - sub.state.pos[0]);
    ok("!! outside the steering box the probe's target is the one the sub was FLOWN to this tick (back to the middle, heading toward 250, 150), not the wander target it will take up again", Math.abs(Math.atan2(Math.sin(outside.target.heading - HT), Math.cos(outside.target.heading - HT))) < 0.3 && outside.target !== sub.target && outside.target.speed <= 2, `heading ${outside.target.heading.toFixed(2)}`);
    ok("!! and the panel built from a real probe has the fly's 34 hidden neurons and a map (the whole path: tank -> probe -> panel)", (() => { const p = B.subPanel(tank.probe("n")); return p.rows.map((r) => r.layer + r.values.length).join() === "features14,hidden34,outputs4" && p.map.cells.length === 81; })());
}

console.log("\n8. THE PAGES");
{
    const aq = fs.readFileSync(path.join(ENG, "sub-aquarium.html"), "utf8"), fl = fs.readFileSync(path.join(ENG, "es-flight6dof.html"), "utf8");
    ok("!! the aquarium: a brainView canvas, the panel imported, and drawBrain draws the SELECTED sub's probe through subPanel / drawPanel at most every 200 ms, from the frame loop", /id="brainView"/.test(aq) && /import \{ subPanel, drawPanel \} from "\/render\/brainPanel\.mjs"/.test(aq) && /selected \? tank\.probe\(selected\) : null/.test(aq) && /subPanel\(pr, \{ neuron: brainSel \}\)/.test(aq) && /now - lastBrain < 200/.test(aq) && /drawCompass\(snap\); drawBrain\(\)/.test(aq));
    ok("!! the flight page: a brainView canvas, the panel imported, every pilot record carries its kind (manual, gpu, fly twice, autopilot), and drawBrain draws the aircraft the CAMERA follows through flightPanel at most every 200 ms, from updateBoard", /id="brainView"/.test(fl) && /import \{ flightPanel, drawPanel \} from "\/render\/brainPanel\.mjs"/.test(fl) && /kind: "manual"/.test(fl) && /kind: "gpu", policy: MF/.test(fl) && (fl.match(/kind: "fly", policy: PF/g) || []).length === 2 && /kind: "autopilot" \}/.test(fl) && /document\.getElementById\("camTarget"\)\.value\) \|\| 0, s = fleet\[me\], p = resolvePilots\(\)\[me\]/.test(fl) && /flightPanel\(\{ kind: p\.kind/.test(fl) && /now - lastBrain < 200/.test(fl) && /function updateBoard\(\) \{\s*drawBrain\(\);/.test(fl));
}

console.log("\n9. THE OTHER FLIGHT PAGES: es-aircraft, es-box3d-fly3d, the tactics pages (flight-gpu, es-box3d)");
{
    const body = { q: [1, 0, 0, 0], pos: [0, 0, 100], vel: [30, 0, 0], w: [0, 0, 0] }, desired = [1, 0.3, 0.1];
    const pa = B.aircraftPanel({ kind: "autopilot", body, desired }), pf = B.aircraftPanel({ kind: "fly", weights: PA.handWeights(), body, desired });
    ok("!! the aircraft's panels: the autopilot's 12 features / 5 laws / 3 outputs and a map, the network's 12 / 34 hidden / 3 and a map; the autopilot's outputs ARE decide()'s (pitch, roll, yaw)", pa.rows.map((r) => r.layer + r.values.length).join() === "features12,laws5,outputs3" && pf.rows.map((r) => r.layer + r.values.length).join() === "features12,hidden34,outputs3" && pa.map.cells.length === 81 && pf.map.cells.length === 81 && (() => { const c = AP.decide(body, desired).controls; return near(pa.rows[2].values[0], c.pitch, 1e-9) && near(pa.rows[2].values[1], c.roll, 1e-9) && near(pa.rows[2].values[2], c.yaw, 1e-9); })());
    const pointsToward = (m) => m.cells.every((c) => (Math.abs(c.ox) < 0.3 || Math.sign(c.a) === Math.sign(c.ox)) && (Math.abs(c.oy) < 0.3 || Math.sign(c.b) === Math.sign(c.oy)));
    ok("!! THE SIGNS: in every cell a target 0.3 rad or more to the RIGHT of the nose gets an arrow pointing right, to the LEFT left, ABOVE up, BELOW down -- for the autopilot and for the network (the controller pushes the nose toward the target; the aircraft's yaw and pitch commands are positive for a target to the left and below, and the map turns both)", pointsToward(pa.map) && pointsToward(pf.map) && pa.map.yUp === true, `centre ${pa.map.cells[40].a.toFixed(3)}, ${pa.map.cells[40].b.toFixed(3)}`);
    ok("!! the ring is the real target in the nose's frame: [1, 0.3, 0.1] is 0.29 rad to the LEFT (u = -0.2915) and 0.0955 above; and it holds for an aircraft yawed 90 degrees (a target along world +y is dead ahead: ring at the centre)", near(pa.map.marker.ox, -Math.atan(0.3), 1e-9) && near(pa.map.marker.oy, Math.atan2(0.1, Math.hypot(1, 0.3)), 1e-9) && (() => { const yawed = { ...body, q: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }, m = B.aircraftPanel({ kind: "autopilot", body: yawed, desired: [0, 1, 0] }).map; return Math.abs(m.marker.ox) < 1e-9 && Math.abs(m.marker.oy) < 1e-9; })());
    ok("!! the aircraft map's grid is +-0.8 rad both ways (9 x 9, ring and cells on the same scale)", pa.map.spanX === 0.8 && pa.map.spanY === 0.8 && near(pa.map.cells[0].ox, -0.8) && near(pa.map.cells[80].oy, 0.8));
    ok("a throwing pilot leaves zeros, and no probe says no aircraft", B.aircraftMap(() => { throw new Error("x"); }, body, desired).cells.every((c) => c.mag === 0) && B.aircraftPanel(null).rows.length === 0);

    const ship = { x: 0, y: 0, z: 0, heading: 0, pitch: 0 }, target = { x: 500, y: 300, z: 100 }, hw = PP.handWeights();
    const f3 = B.fly3dPanel({ kind: "fly", weights: hw, ship, target }), sc = B.fly3dPanel({ kind: "scripted", ship, target });
    ok("  the aircraft fly net's panel and the fly-3D ship's each carry a steer lens over their 34 hidden neurons, the scripted AI none", pf.lens && pf.lens.rows.length === 34 && f3.lens && f3.lens.rows.length === 34 && !sc.lens);
    ok("!! the fly-3D panel: features 7, hidden 34, outputs 4 (turn, pitch, thrust, firing) equal to the policy's own forward(); the scripted AI shows its seven features and NO map and says it is rules", f3.rows.map((r) => r.layer + r.values.length).join() === "features7,hidden34,outputs4" && PP.OUTPUT_NAMES.every((n, i) => near(f3.rows[2].values[i], PP.forward(hw, PP.features(ship, target))[i], 1e-6)) && sc.rows.length === 1 && sc.rows[0].values.length === 7 && sc.map === null && /rules, not a network/.test(sc.note));
    ok("!! the fly-3D map: the arrow is (turn, pitch) and follows the error (hand weights: a yaw error of 1 rad turns the same way, a pitch error up pitches up), the ring is the real error (yaw error / 180 x pi, pitch error / 180 x pi), and the centre is quiet", f3.map.cells.every((c) => (Math.abs(c.ox) < 0.3 || Math.sign(c.a) === Math.sign(c.ox)) && (Math.abs(c.oy) < 0.3 || Math.sign(c.b) === Math.sign(c.oy))) && near(f3.map.marker.ox, PP.features(ship, target)[1] * Math.PI, 1e-9) && near(f3.map.marker.oy, PP.features(ship, target)[2] * Math.PI, 1e-9) && Math.hypot(f3.map.cells[40].a, f3.map.cells[40].b) < 0.2);

    ok("!! the fly-3D map's cells are the network's own forward() with the yaw error entered as radians / pi (a 0.5 rad cell is feature 0.1592): recomputed here for three cells", [7, 40, 66].every((i) => { const c = f3.map.cells[i], x = Array.from(PP.features(ship, target)); x[1] = c.ox / Math.PI; x[2] = c.oy / Math.PI; const y = PP.forward(hw, x); return near(c.a, y[0], 1e-9) && near(c.b, y[1], 1e-9); }));
    const me = { id: "A#0", x: 0, y: 0, team: "A", shield: 80, armor: 80, maxShield: 100, maxArmor: 100, dps: 10 };
    const foe = (id, x, y, hp, extra = {}) => ({ id, x, y, team: "B", shield: hp, armor: hp, maxShield: 100, maxArmor: 100, dps: 10, ...extra });
    const foes = [foe("B#0", 500, 200, 100), foe("B#1", -800, -300, 20), foe("B#2", 100, 100, 100, { dead: true })];
    const tp = B.tacticsPanel({ self: me, foes, w: TX.DEFAULT_W, opts: { range: 1400 }, label: "side A" });
    ok("!! the tactics panel: a weights row (5), the BEST candidates' features (5 each, the dead one left out) labelled with the id and the score, best first (the wounded B#1 outscores the healthy B#0 under the default weights), and the flee test (4)", tp.rows[0].layer === "weights" && tp.rows[0].values.length === 5 && tp.rows.filter((r) => r.layer === "target").length === 2 && /^B#1 /.test(tp.rows[1].label) && /^B#0 /.test(tp.rows[2].label) && tp.rows.at(-1).layer === "flee" && tp.rows.at(-1).values.length === 4 && near(tp.rows[1].values[1], 0.8, 1e-9), tp.rows.map((r) => r.label).join(" | "));
    ok("!! it says what the brain DECIDED: ENGAGING the chosen target in the note, the chosen foe ringed in the map (decide()'s own pick), the dead foe not a point", /ENGAGING B#1/.test(tp.note) && tp.map.points.length === 2 && tp.map.points.find((p) => p.chosen).id === "B#1" && tp.map.points.filter((p) => p.chosen).length === 1 && TX.decide(me, foes, TX.DEFAULT_W, { range: 1400 }).target.id === "B#1");
    ok("!! the map's own foe filter: a dead ship is not a point (tacticsMap given the dead one directly), and the flee row's bar is the health bar PLUS the hysteresis once the ship was fleeing (0.30 -> 0.42)", B.tacticsMap(me, foes, TX.DEFAULT_W, { range: 1400 }).points.length === 2 && near(B.tacticsPanel({ self: me, foes, w: TX.DEFAULT_W, opts: { range: 1400 } }).rows.at(-1).values[1], 0.30, 1e-9) && near(B.tacticsPanel({ self: me, foes, w: TX.DEFAULT_W, opts: { range: 1400, wasFleeing: true } }).rows.at(-1).values[1], 0.42, 1e-9));
    const hot = tp.map.cells, near0 = hot[Math.floor(hot.length / 2)], edge = hot[0];
    ok("!! the heat is the scoring: strongest where a target would be CLOSEST (the centre, reach 1) and weaker at the corner; at the centre it is the whole desire (wClose + wWeak x the mean weakness + wThreat x the mean threat) to 1e-9", near0.mag > edge.mag && near(near0.mag, (() => { const fe = foes.filter((f) => !f.dead).map((f) => TX.features(me, f, { range: 1400 })), m = (k) => fe.reduce((a, b) => a + b[k], 0) / fe.length; return TX.DEFAULT_W.wClose + TX.DEFAULT_W.wWeak * m("weakness") + TX.DEFAULT_W.wThreat * m("threat"); })(), 1e-9), `${near0.mag.toFixed(3)} against ${edge.mag.toFixed(3)}`);
    const weak = { ...me, shield: 5, armor: 5 }, fl = B.tacticsPanel({ self: weak, foes: [foe("B#0", 300, 0, 100), foe("B#1", 400, 100, 100)], w: TX.DEFAULT_W, opts: { range: 1400 } });
    ok("!! a ship that is hurt and outgunned FLEES: the note says FLEEING, the map is flagged and the flee row shows health under its bar and the odds under theirs, and no foe is ringed", /^FLEEING/.test(fl.note) && fl.map.fleeing === true && fl.rows.at(-1).values[0] < fl.rows.at(-1).values[1] && fl.rows.at(-1).values[2] < fl.rows.at(-1).values[3] && !fl.map.points.some((p) => p.chosen));
    const alone = B.tacticsPanel({ self: me, foes: [], w: TX.DEFAULT_W });
    ok("no foes: no target rows, a map with no points, the note says there is no target; no ship: nothing", alone.rows.length === 2 && alone.map.points.length === 0 && /^no target/.test(alone.note) && B.tacticsPanel(null).rows.length === 0 && B.tacticsPanel({}).rows.length === 0);
    const g = rec(), r = B.drawMap(g, 0, 0, 260, 260, tp.map), c = g.calls;
    ok("!! drawMap on a tactics map is the heat: a cell per grid cell (13 x 13 = 169 plus the background), a dot per foe, ONE white ring on the chosen one, the ship's green cross, no arrows; a fleeing ship's heat is red", r.cells === 169 && r.dots === 2 && r.arrows === 0 && c.filter((x) => x[0] === "fillRect").length === 170 && c.filter((x) => x[0] === "set:strokeStyle" && x[1] === "#ffffff").length === 1 && c.some((x) => x[0] === "set:strokeStyle" && x[1] === "#5fe08a") && !c.some((x) => typeof x[1] === "string" && /^rgba\(255,122,122/.test(x[1])) && (() => { const q = rec(); B.drawMap(q, 0, 0, 260, 260, fl.map); return q.calls.some((x) => typeof x[1] === "string" && /^rgba\(255,122,122/.test(x[1])); })());
    const gp = rec(), pr = B.drawPanel(gp, 520, 250, tp);
    ok("!! drawPanel takes the tactics panel whole (the rows' bars and the heat on its right) and every map has its own title (aircraft, fly3d, tactics, sub, flight)", pr.bars === 19 && gp.calls.filter((x) => x[0] === "fillText" && /target attractiveness/.test(x[1])).length === 1 && gp.calls.filter((x) => x[0] === "fillText" && /target in the nose's frame/.test(String(x[1]))).length === 0 && (() => { const q = rec(); B.drawPanel(q, 520, 250, pa); return q.calls.some((x) => x[0] === "fillText" && /target in the nose's frame/.test(x[1])); })());
}

console.log("\n10. THE PAGES THAT FLY IT (a browser; SKIPPED, and said, without one)");
{
    const ENGdir = ENG, types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json" };
    const srcOf = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
    const ac = srcOf("es-aircraft.html"), f3s = srcOf("es-box3d-fly3d.html"), gpu = srcOf("flight-gpu.html"), e2 = srcOf("es-box3d.html");
    ok("!! es-aircraft: the canvas and the aircraft picker (three), aircraftPanel fed the SELECTED aircraft's body, its heading target and the squadron's weights for that aircraft, drawn from frame() at most every 200 ms", /id="brainView"/.test(ac) && /id="brainPick"/.test(ac) && /import \{ aircraftPanel, drawPanel \}/.test(ac) && /Number\(brainSel\.value\) \|\| 0/.test(ac) && /squad\.weights\[Math\.min\(i, squad\.weights\.length - 1\)\]/.test(ac) && /aircraftPanel\(\{ kind: w \? "fly" : "autopilot", weights: w, body: s\.body, desired: HEADINGS\[s\.headingIdx\] \}, \{ neuron: bui\.neuron \}\)/.test(ac) && /now - lastBrain < 200/.test(ac) && /  drawBrain\(\);\n  syncScene/.test(ac));
    ok("!! es-box3d-fly3d: the canvas and a ship picker over BOTH teams, fly3dPanel fed the picked ship, the target the TACTICS layer gave it (tacticsDecide with its side's weights) and the roster's weights for that ship (scripted when the side is), from frame()", /id="brainView"/.test(f3s) && /id="brainPick"/.test(f3s) && /import \{ fly3dPanel, drawPanel \}/.test(f3s) && /tacticsDecide\(e, foes, W, \{ lastTargetId: e\._tgtId, wasFleeing: e\._fleeing, range: 1400 \}\)/.test(f3s) && /kind: w \? "fly" : "scripted"/.test(f3s) && /r && !r\.scripted && r\.weights\.length/.test(f3s) && /function frame\(\) \{\n  const dt = 1 \/ 30, nowMs = t \* 1000;\n  drawBrain\(\);/.test(f3s));
    ok("!! flight-gpu and es-box3d (the same fight in 3D and 2D): the canvas, the ship picker, tacticsPanel fed the picked ship, the foes and its SIDE's weights from roster.weights(team), drawBrain on the page's own door (__tacticsFight.drawBrain) and called from the render loop", [gpu, e2].every((src) => /id="brainView"/.test(src) && /id="brainPick"/.test(src) && /import \{ tacticsPanel, drawPanel \}/.test(src) && /tacticsPanel\(\{ self: e, foes, w: roster\.weights\(team\)/.test(src) && /window\.__tacticsFight = \{ drawBrain,/.test(src)) && /updateFx\(frameDt\);\n  drawBrain\(\);\n  render\(\);/.test(gpu) && /stepSim\(\);\n  drawBrain\(\);/.test(e2));
    ok("flight.html is the menu of the flight pages and flies nothing: it has no brain to show and gets no panel (said here so the absence is a decision)", !/brainView/.test(srcOf("flight.html")) && !/<canvas/.test(srcOf("flight.html")));
    const { chromium, from: pwFrom } = resolvePlaywright(createRequire(import.meta.url)), skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) { console.log("  ----  live half SKIPPED -- " + skip); console.log("  ----  *** THAT IS A SKIP AND NOT A PASS: the section's other rows are arithmetic and source; only a page shows the canvas drawn"); }
    else {
        const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split("?")[0]), fp = path.join(ENGdir, u); if (fp.startsWith(ENGdir) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); } res.writeHead(404); res.end("not found"); });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const br = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const base = "http://127.0.0.1:" + server.address().port;
            {   // the NETWORK branch of the two pages that default to the scripted pilot: set the roster to the hand-weight network and read what the page says it is drawing
                const pg = await (await br.newContext()).newPage(), errs = [];
                pg.on("pageerror", (e) => errs.push(String(e.message)));
                await pg.goto(base + "/es-box3d-fly3d.html", { waitUntil: "load" }); await pg.waitForTimeout(1500);
                await pg.evaluate(() => { window.__fly3d.setSpecs({ ...window.__fly3d.specs, A: "hand" }); window.__fly3d.startFight(); }); await pg.waitForTimeout(1500);
                const who = await pg.$eval("#brainWho", (e) => e.textContent), ink = await pg.evaluate(() => { const c = document.getElementById("brainView"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 60 || d[i + 1] > 60 || d[i + 2] > 80) k++; return k; });
                ok("!! es-box3d-fly3d with team A on the hand-weight network draws the NETWORK's panel (the header names the pilot, not the scripted AI; hidden neurons and the map inked)", !/scripted/i.test(who) && who.length > 0 && ink > 3000 && errs.length === 0, `"${who}", ${ink} px, ${errs.join("|").slice(0, 100)}`);
                await pg.selectOption("#brainPick", "B#0"); await pg.waitForTimeout(1200);
                const whoB = await pg.$eval("#brainWho", (e) => e.textContent);
                ok("!! picking a ship of the OTHER team (B#0, scripted) changes what the panel draws: the header now names the scripted AI and not the hand-weight network", /scripted/i.test(whoB) && whoB !== who, `"${whoB}"`);
                await pg.close();
                const pa = await (await br.newContext()).newPage(), errs2 = [];
                pa.on("pageerror", (e) => errs2.push(String(e.message)));
                await pa.goto(base + "/es-aircraft.html", { waitUntil: "load" }); await pa.waitForTimeout(1200);
                await pa.evaluate(() => { const r = window.__aircraftDemo ? window.__aircraftDemo.roster : null; if (r) r.setSpec("hand"); });
                await pa.selectOption("#brainPick", "1"); await pa.waitForTimeout(1200);
                const who2 = await pa.$eval("#brainWho", (e) => e.textContent);
                ok("!! es-aircraft with the squadron on the hand-weight network and aircraft 2 picked names the network pilot in the header and draws without error", /hand/i.test(who2) && errs2.length === 0, `"${who2}" ${errs2.join("|").slice(0, 100)}`);
                await pa.close();
            }
            for (const [file, ready] of [["es-aircraft.html", null], ["es-box3d-fly3d.html", null], ["es-box3d.html", "window.__tacticsFight && window.__tacticsFight.ready"]]) {
                const pg = await (await br.newContext()).newPage(); const errs = [];
                pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|WebGPU|webgpu/.test(m.text())) errs.push(m.text()); });
                await pg.goto(base + "/" + file, { waitUntil: "load" }); await pg.waitForTimeout(2500);
                if (ready) { await pg.evaluate(() => { window.__tacticsFight.step(60); window.__tacticsFight.drawBrain(true); }); }
                const info = await pg.evaluate(() => { const c = document.getElementById("brainView"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 60 || d[i + 1] > 60 || d[i + 2] > 80) k++; return { ink: k, opts: document.getElementById("brainPick").options.length, who: document.getElementById("brainWho").textContent }; });
                ok(`!! ${file} draws its selected brain: ${info.ink} inked pixels, ${info.opts} choices in the picker, the header says "${info.who.slice(0, 40)}"`, info.ink > 3000 && info.opts >= 3 && info.who.length > 0, "");
                ok(`  ${file}: no page or console error`, errs.length === 0, errs.join(" | ").slice(0, 200));
                await pg.close();
            }
        } finally { await br.close(); server.close(); }
    }
}

console.log("\n11. THE STEER LENS (render/brainLens.mjs): which hidden neurons drive which outputs, and what a push would do");
{
    const L = await import("./brainLens.mjs");
    const w = PS.handWeights(), st = subState(), x = PS.features(st, subTarget, [0, 0, 0]), act = B.activations(PS, w, x, PS.OUTPUT_NAMES), layers = PS.layersOf(w), Lo = layers[layers.length - 1];
    const lens = L.steerLens(layers, act.hidden, PS.OUTPUT_NAMES);
    ok("!! the lens has a row for every one of the fly's 34 hidden neurons and an entry for each of the four outputs", lens && lens.rows.length === 34 && lens.outputs.length === 4 && lens.rows.every((r) => r.push.length === 4 && r.ablate.length === 4), lens ? `${lens.rows.length} rows` : "null");
    ok("!! the ablation of neuron i is minus what it contributes to each output (the output layer is linear for the fly: -W[j,i] x h[i])", lens.rows.every((r) => PS.OUTPUT_NAMES.every((_, j) => near(r.ablate[j], -Lo.W[j * Lo.nIn + r.i] * act.hidden[r.i], 1e-4))), "every neuron, every output, to 1e-4");
    ok("!! the push of neuron i is +W[j,i] x scale (the dose x the layer's rms), the same for every neuron's own weight", lens.rows.every((r) => PS.OUTPUT_NAMES.every((_, j) => near(r.push[j], Lo.W[j * Lo.nIn + r.i] * lens.scale, 1e-4))), `scale ${lens.scale.toFixed(4)} = ${L.LENS.dose} x rms`);
    ok("!! the rows are ranked by what the neuron is doing now (drive) and then by what it could do (reach), never the other way", lens.rows.every((r, k) => k === 0 || lens.rows[k - 1].drive > r.drive || (lens.rows[k - 1].drive === r.drive && lens.rows[k - 1].reach >= r.reach)), `top ${lens.rows[0].i} drive ${lens.rows[0].drive.toFixed(3)}`);
    const quiet = L.steerLens(layers, new Float32Array(34), PS.OUTPUT_NAMES);
    ok("!! a silent hidden layer still gets a measurable push (the floor), and no neuron is doing anything: every ablation is zero", quiet.scale === L.LENS.floorRms * L.LENS.dose && quiet.rows.every((r) => r.drive === 0) && quiet.rows.some((r) => r.reach > 0), `scale ${quiet.scale}`);
    ok("  a lens over a hidden layer the output layer does not read is null, and so is lensOf for a brain whose hidden IS its input", L.steerLens(layers, new Float32Array(5), PS.OUTPUT_NAMES) === null && B.lensOf({ input: x, hidden: x, output: act.output }, PS, w, PS.OUTPUT_NAMES) === null);
    const cn = L.connections(layers, lens.rows[0].i, { k: 3, outputNames: PS.OUTPUT_NAMES });
    ok("!! connections: the strongest three outputs of the top neuron by |weight|, sorted, and its inputs named h<k> where the layer reads hidden neurons", cn.out.length === 3 && cn.out.every((c, k) => k === 0 || Math.abs(cn.out[k - 1].w) >= Math.abs(c.w)) && cn.out.every((c) => near(c.w, Lo.W[c.to * Lo.nIn + lens.rows[0].i], 1e-9) && c.name === PS.OUTPUT_NAMES[c.to]) && cn.into.length === 3 && cn.into.every((c) => /^h\d+$/.test(c.name)), `${cn.out.map((c) => c.name + " " + c.w.toFixed(2)).join(", ")}`);
    const first = L.connections([layers[0], Lo], 0, { inputNames: PS.FEATURE_NAMES, k: 2 });
    ok("  and an input layer that reads the features names them", first.into.length === 2 && first.into.every((c) => PS.FEATURE_NAMES.includes(c.name)), first.into.map((c) => c.name).join(", "));
    // a fixture whose weights are NOT already in order, so a missing sort cannot pass: neuron 1 feeds three outputs with 0.2, -0.9, 0.5 and the layer before it reads four inputs with 0.1, -0.7, 0.4, -0.2
    const synth = [{ nIn: 4, nOut: 2, W: Float32Array.from([0.5, 0.5, 0.5, 0.5, 0.1, -0.7, 0.4, -0.2]), b: new Float32Array(2), act: "relu" }, { nIn: 2, nOut: 3, W: Float32Array.from([0.9, 0.2, 0.9, -0.9, 0.9, 0.5]), b: new Float32Array(3), act: "none" }];
    const sc2 = L.connections(synth, 1, { k: 2, inputNames: ["a", "b", "c", "d"], outputNames: ["x", "y", "z"] });
    ok("!! connections on a fixture out of order: the two strongest outputs of neuron 1 are y (-0.9) then z (0.5), its two strongest inputs b (-0.7) then c (0.4), each by |weight|", sc2.out.map((c) => c.name).join() === "y,z" && sc2.into.map((c) => c.name).join() === "b,c", sc2.out.map((c) => c.name + c.w).join(" ") + " | " + sc2.into.map((c) => c.name + c.w).join(" "));
    // the drawing: a positive push is the blue bar and a negative one the amber, to the left of the cell's centre
    const gl = rec(); L.drawLens(gl, 0, 0, 300, 160, { outputs: ["p", "n"], dose: 0.5, scale: 1, base: [0, 0], rows: [{ i: 0, h: 1, push: [0.8, -0.8], ablate: [0, 0], drive: 0, reach: 0.8 }] });
    const fills = []; let colour = null; for (const c of gl.calls) { if (c[0] === "set:fillStyle") colour = c[1]; else if (c[0] === "fillRect") fills.push([colour, ...c.slice(1)]); }
    const blue = fills.find((f) => f[0] === "#59d1ff"), amber = fills.find((f) => f[0] === "#f6a623");
    ok("!! drawLens: a positive push is a blue bar starting at its cell's centre, a negative one an amber bar ending at its cell's centre", blue && amber && near(blue[1], 120.5, 1e-6) && blue[3] > 0 && near(amber[1] + amber[3], 237.5, 1e-6) && amber[3] > 0, blue && amber ? `blue starts at ${blue[1].toFixed(1)} (column 0 centre is 120.5), amber ends at ${(amber[1] + amber[3]).toFixed(1)} (column 1 centre is 237.5)` : "a bar is missing");
    const pf = B.subPanel({ kind: "fly", weights: w, state: st, target: subTarget }), pa = B.subPanel({ kind: "autopilot", state: st, target: subTarget });
    ok("!! the fly sub's panel carries the lens, the PD autopilot's (no network) carries none", pf.lens && pf.lens.rows.length === 34 && !pa.lens);
    const hw = MF.handWeights(), pg = B.flightPanel({ kind: "gpu", policy: MF, weights: hw, pilot: MF.pilotFor(hw), state: flState(), target: flTarget, wind: [0, 0, 0] });
    ok("  the GPU aircraft's lens is over its 32 hidden neurons", pg.lens && pg.lens.rows.length === 32);
    const g = rec(), res = B.drawPanel(g, 640, 300, pf), g2 = rec(), res2 = B.drawPanel(g2, 640, 300, { ...pf, lens: null });
    ok("!! drawPanel draws the lens bars under the rows (bars of the rows are the same with and without it) and a panel without a lens draws none", res.lensBars > 0 && res2.lensBars === 0 && res.bars <= res2.bars + 0 && g.calls.some((c) => c[0] === "fillText" && /steer lens/.test(String(c[1]))), `${res.lensBars} lens bars; rows ${res.bars} against ${res2.bars}`);
    const g3 = rec(), dn = L.drawLens(g3, 0, 0, 300, 160, null);
    ok("  a null lens is said on the canvas and draws no bars", dn.bars === 0 && g3.calls.some((c) => c[0] === "fillText" && /does not read its hidden layer/.test(String(c[1]))));
}

console.log("\n12. THE LAYERED MAP, THE SELECTED NEURON AND THE STEER (v4904): the picture of the network's own numbers, what a neuron is wired to, a push that is a copy");
{
    const L = await import("./brainLens.mjs");
    const synth = [{ nIn: 4, nOut: 2, W: Float32Array.from([0.5, 0.5, 0.5, 0.5, 0.1, -0.7, 0.4, -0.2]), b: new Float32Array(2), act: "relu" }, { nIn: 2, nOut: 3, W: Float32Array.from([0.9, 0.2, 0.9, -0.9, 0.9, 0.5]), b: new Float32Array(3), act: "none" }];
    const hw = MF.handWeights(), gl = MF.layersOf(hw), gx = Float32Array.from({ length: 18 }, (_, i) => Math.sin(i + 1));
    const st = L.layerStates(gl, gx, { output: MF.OUTPUT_NAMES });
    let cur = Float32Array.from(gx); for (const l of gl) { cur = mlpLayerCpu(l, cur, 1); }
    ok("!! layerStates of the GPU network: four columns of 18, 32, 32 and 4, labelled features, h1, h2, outputs; the last is the output layer's own result, the hidden ones have their relu applied (no negative value)", st.map((c) => c.n).join() === "18,32,32,4" && st.map((c) => c.label).join() === "features,h1,h2,outputs" && st[3].values.every((v, k) => v === cur[k]) && st[1].values.every((v) => v >= 0) && st[2].values.every((v) => v >= 0) && st[3].names === MF.OUTPUT_NAMES, st.map((c) => c.n + " " + c.label).join(" | "));
    const m0 = L.layerMap(gl, gx), act2 = Array.from(m0.cols[1].values, (v, k) => k).filter((k) => m0.cols[1].values[k] > 0).find((k) => L.layerMap(gl, gx, { sel: { layer: 1, i: k } }).edges.length > m0.edges.length) ?? 0, m1 = L.layerMap(gl, gx, { sel: { layer: 1, i: act2 } }), mBad = L.layerMap(gl, gx, { sel: { layer: 9, i: 0 } });
    // brute force: the two biggest contributions into neuron 7 of layer 1 (the layer between columns 1 and 2)
    const L1 = gl[1], contrib = Array.from({ length: L1.nIn }, (_, f) => [f, L1.W[7 * L1.nIn + f] * m0.cols[1].values[f]]).filter(([, c]) => c !== 0).sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]) || p[0] - q[0]).slice(0, 2).map(([f]) => f).sort((p, q) => p - q);
    const got = m0.edges.filter((e) => e.l === 1 && e.to === 7).map((e) => e.from).sort((p, q) => p - q);
    ok("!! layerMap keeps the two biggest contributions (weight x the sender's value) into every neuron and no zero ones: into neuron 7 of h2 they are the ones brute force picks", got.join() === contrib.join() && m0.edges.every((e) => e.c !== 0 && Math.abs(e.c - e.w * m0.cols[e.l].values[e.from]) < 1e-6) && [0, 1, 2].every((l) => m0.edges.filter((e) => e.l === l).length <= 2 * gl[l].nOut), `into h2.7: ${got.join(", ")} (brute force ${contrib.join(", ")}); ${m0.edges.length} lines`);
    ok("!! a selected neuron adds its biggest contributions in and out (more lines than without a selection, and the new ones touch it); a selection that names no neuron is dropped and changes nothing", m1.sel && m1.sel.layer === 1 && m1.sel.i === act2 && m1.edges.length > m0.edges.length && m1.edges.filter((e) => (e.l === 0 && e.to === act2) || (e.l === 1 && e.from === act2)).length >= 3 && mBad.sel === null && mBad.edges.length === m0.edges.length, `${m0.edges.length} lines, ${m1.edges.length} with h1.${act2} selected (the first active neuron that gains lines: a silent relu neuron contributes none, and the most active one is already among the top two)`);
    const fm = L.layerMap(PS.layersOf(PS.handWeights()), PS.features(subState(), subTarget, [0, 0, 0]));
    ok("  the fly circuit unrolls its three recurrent steps: six columns of 14, 34, 34, 34, 34 and 4", fm.cols.map((c) => c.n).join() === "14,34,34,34,34,4");
    // the drawing
    const g = rec(), r = L.drawLayerMap(g, 0, 0, 400, 300, m1), c = g.calls;
    ok("!! drawLayerMap draws a dot per neuron (18 + 32 + 32 + 4 = 86) and a line per kept contribution, gives every dot a hit area of radius 4 or more, rings the selected neuron in white, and draws the selected neuron's lines last (brighter)", r.dots === 86 && r.lines === m1.edges.length && r.rects.length === 86 && r.rects.every((q) => q.r >= 4) && c.some((x) => x[0] === "set:strokeStyle" && x[1] === "#ffffff") && c.filter((x) => x[0] === "stroke").length >= r.lines, `${r.dots} dots, ${r.lines} lines`);
    const col = (fn) => { const q = rec(); fn(q); const fills = []; let cl = null; for (const x of q.calls) { if (x[0] === "set:fillStyle") cl = x[1]; else if (x[0] === "fill") fills.push(cl); } return fills; };
    const two = { cols: [{ n: 2, values: Float32Array.from([1, -1]), label: "a" }, { n: 1, values: Float32Array.from([0.5]), label: "b" }], edges: [{ l: 0, from: 0, to: 0, w: 1, c: 1 }, { l: 0, from: 1, to: 0, w: 1, c: -1 }], sel: null };
    const f2 = col((q) => L.drawLayerMap(q, 0, 0, 200, 100, two)), lc = []; { const q = rec(); L.drawLayerMap(q, 0, 0, 200, 100, two); let cl = null; for (const x of q.calls) { if (x[0] === "set:strokeStyle") cl = x[1]; else if (x[0] === "stroke") lc.push(cl); } }
    ok("!! a positive neuron is blue and a negative one amber, and so are the lines of a positive and a negative contribution", f2.includes("#59d1ff") && f2.includes("#f6a623") && lc.includes("#59d1ff") && lc.includes("#f6a623"), `dots ${[...new Set(f2)].join(" ")} lines ${[...new Set(lc)].join(" ")}`);
    const ge = rec(); ok("  no network to draw says so and draws nothing", L.drawLayerMap(ge, 0, 0, 100, 50, null).dots === 0 && ge.calls.some((x) => x[0] === "fillText" && /no network to draw/.test(String(x[1]))));
    // picking
    const pt = r.rects[40], far = L.pickNeuron(r.rects, -50, -50), hit = L.pickNeuron(r.rects, pt.x + 1, pt.y + 1);
    ok("!! pickNeuron answers the dot under the point (the nearest one when areas overlap), a lens row's box anywhere along the row, and null for a miss", hit && hit.layer === pt.layer && hit.i === pt.i && far === null && (() => { const rr = [{ layer: 2, i: 9, bx: 0, by: 100, bw: 300, bh: 12 }, { layer: 1, i: 3, x: 150, y: 106, r: 5 }]; const p = L.pickNeuron(rr, 150, 106); return p.layer === 2 && p.i === 9 && L.pickNeuron(rr, 150, 130) === null; })());
    // the links line, on a fixture whose weights are known
    const sm = L.layerMap(synth, Float32Array.from([1, 1, 1, 1]));
    ok("!! linkLine: neuron 1 of the hidden layer, its three biggest weights in (f1 -0.70, f2 +0.40, f3 -0.20) then out (o1 -0.90, o2 +0.50, o0 +0.20); a feature has no inputs and an output no outputs; a selection that names nothing is null", L.linkLine(synth, sm.cols, { layer: 1, i: 1 }) === "h1 <- f1 -0.70, f2 +0.40, f3 -0.20 | -> o1 -0.90, o2 +0.50, o0 +0.20" && !/<-/.test((() => { try { return L.linkLine(synth, sm.cols, { layer: 0, i: 2 }); } catch { return "<- THREW"; } })()) && !/->/.test(L.linkLine(synth, sm.cols, { layer: 2, i: 0 })) && L.linkLine(synth, sm.cols, { layer: 5, i: 0 }) === null && L.linkLine(synth, sm.cols, null) === null, L.linkLine(synth, sm.cols, { layer: 1, i: 1 }));
    // the steer
    const x14 = PS.features(subState(), subTarget, [0, 0, 0]), sw = PS.handWeights(), sa = B.activations(PS, sw, x14, PS.OUTPUT_NAMES), lens = L.steerLens(PS.layersOf(sw), sa.hidden, PS.OUTPUT_NAMES), ni = lens.rows[0].i, snap0 = Float32Array.from(sw);
    const cw = L.steerWeights(PS, sw, ni, lens.scale), ca = B.activations(PS, cw, x14, PS.OUTPUT_NAMES), Lo = PS.layersOf(sw).at(-1), Lc = PS.layersOf(cw).at(-1);
    const dOut = PS.OUTPUT_NAMES.map((_, j) => mlpLayerCpu(Lc, sa.hidden, 1)[j] - mlpLayerCpu(Lo, sa.hidden, 1)[j]);
    ok("!! steerWeights: a COPY (the original is bit-identical), the hidden layer unchanged, and every output of the output layer moves by exactly the lens's push for that neuron", cw && cw !== sw && sw.every((v, k) => v === snap0[k]) && ca.hidden.every((v, k) => v === sa.hidden[k]) && dOut.every((d, j) => near(d, lens.rows[0].push[j], 1e-5)), `neuron ${ni}: outputs moved ${dOut.map((d) => d.toFixed(3)).join(", ")}; lens push ${lens.rows[0].push.map((d) => d.toFixed(3)).join(", ")}`);
    ok("  and a bad neuron, a NaN dose, or a policy whose layers are copies of the weights (the steer would be lost) answers null", L.steerWeights(PS, sw, 999, 1) === null && L.steerWeights(PS, sw, -1, 1) === null && L.steerWeights(PS, sw, 0, NaN) === null && L.steerWeights({ layersOf: (w) => PS.layersOf(Float32Array.from(w)) }, sw, 0, 1) === null);
    const gw = L.steerWeights(MF, hw, 3, 0.5); ok("  the GPU network steers the same way (a copy, its output layer's bias moved by W x 0.5)", gw && gw !== hw && near(MF.layersOf(gw).at(-1).b[1] - MF.layersOf(hw).at(-1).b[1], MF.layersOf(hw).at(-1).W[1 * 32 + 3] * 0.5, 1e-6));
    // the panels
    const probe = { kind: "fly", weights: sw, state: subState(), target: subTarget }, pS = B.subPanel(probe, { neuron: { layer: 4, i: ni } }), pN = B.subPanel(probe), pBad = B.subPanel(probe, { neuron: { layer: 4, i: 99 } }), pA = B.subPanel({ kind: "autopilot", state: subState(), target: subTarget });
    ok("!! a network panel carries the layered map (six columns for the fly), the selection it was given and the wiring line (h<i> <- ..., | -> ...); none selected has no line; a selection naming no neuron is dropped; the autopilot has no map", pS.layers && pS.layers.cols.length === 6 && pS.sel && pS.sel.layer === 4 && pS.sel.i === ni && new RegExp("^h" + ni + " <- ").test(pS.links) && /\| -> /.test(pS.links) && pN.sel === null && pN.links === null && pBad.sel === null && pBad.links === null && !pA.layers, pS.links);
    const gp = B.flightPanel({ kind: "gpu", policy: MF, weights: hw, pilot: MF.pilotFor(hw), state: flState(), target: flTarget, wind: [0, 0, 0] }, { neuron: { layer: 2, i: 5 } });
    ok("  the GPU aircraft's panel has its four columns and honours a selection in them", gp.layers.cols.map((c) => c.n).join() === "18,32,32,4" && gp.sel && gp.sel.layer === 2 && gp.sel.i === 5 && /^h5 <- /.test(gp.links));
    const gB = rec(), rb = B.drawPanel(gB, 640, 300, pS), gL = rec(), rl = B.drawPanel(gL, 640, 300, pS, { view: "layers" });
    ok("!! drawPanel in the bars view returns the lens rows' hit boxes (eight rows) and tints the selected row; in the layers view it draws the whole map (154 dots for the fly), the wiring line along the top, and returns the dots' hit areas", rb.view === "bars" && rb.rects.length === 8 && gB.calls.some((x) => x[0] === "set:fillStyle" && x[1] === "#16301c") && rl.view === "layers" && rl.dots === 154 && rl.rects.length === 154 && gL.calls.some((x) => x[0] === "fillText" && String(x[1]) === pS.links) && rl.lensBars === 0, `bars: ${rb.rects.length} row boxes; layers: ${rl.dots} dots, ${rl.lines} lines`);
    const gp0 = rec(), rp = B.drawPanel(gp0, 640, 300, pA, { view: "layers" });
    ok("  a panel with no network asked for the layers view draws its bars as usual (no crash, no map)", rp.view === "bars" || rp.dots === undefined);
}

console.log("\n13. THE AQUARIUM'S CLICKS (v4904; a browser, SKIPPED and said without one): select a neuron, read its wiring, push it, let go");
{
    const aq = fs.readFileSync(path.join(ENG, "sub-aquarium.html"), "utf8");
    ok("!! the page (v4904) has the view picker (bars or layers), the three steer buttons (disabled until a last-hidden-layer neuron is selected), the dose picker, a click handler that picks from the last drawn hit areas, and drives tank.setSteer from the lens's own scale",
        /id="brainMode"/.test(aq) && /id="steerUp" disabled/.test(aq) && /id="steerDown" disabled/.test(aq) && /id="steerClear" disabled/.test(aq) && /id="steerDose"/.test(aq) && /import \{ pickNeuron \} from "\/render\/brainLens\.mjs"/.test(aq) && /pickNeuron\(lastRects, x, y\)/.test(aq) && /subPanel\(pr, \{ neuron: brainSel \}\)/.test(aq) && /view: \$\("brainMode"\)\.value/.test(aq) && /tank\.setSteer\(selected, brainSel\.i, v \* steerScale\)/.test(aq) && /steerScale = lastPanel\.lens\.scale/.test(aq) && /id="steerSlider" min="-16" max="16" step="0.5" value="0" disabled/.test(aq) && /\$\("steerSlider"\)\.addEventListener\("input", \(\) => \{[^}]*steer\(Number\(\$\("steerSlider"\)\.value\)\)/.test(aq) && /if \(!sliding\)/.test(aq) && /brainSel\.layer !== lastPanel\.lens\.col/.test(aq));
    const { chromium, from: pwFrom } = resolvePlaywright(createRequire(import.meta.url)), skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) { console.log("  ----  live half SKIPPED -- " + skip); console.log("  ----  *** THAT IS A SKIP AND NOT A PASS: the clicks are only a page's"); }
    else {
        const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json" };
        const subs = [{ id: "net1", name: "Neuron", hue: 200, pilot: "network", from: "this-box", local: true, weights: Array.from(PS.handWeights()) }];
        const server = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split("?")[0]);
            if (u === "/subaquarium/list") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: true, subs })); }
            if (u.startsWith("/ai/")) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end("{}"); }
            const fp = path.join(ENG, u); if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const br = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await br.newContext()).newPage(), errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
            await pg.goto("http://127.0.0.1:" + server.address().port + "/sub-aquarium.html", { waitUntil: "load" });
            await pg.waitForFunction(() => document.querySelectorAll("#list .row").length === 1, null, { timeout: 8000 }).catch(() => {});
            await pg.click("#list .row");
            await pg.waitForFunction(() => /Giant Fiber/.test(document.getElementById("brainWho").textContent), null, { timeout: 20000 }).catch(() => {});   // WAIT FOR THE DRAWING, NOT THE CLOCK: the panel redraws five times a second and a loaded box has not drawn it after half a second
            await pg.waitForTimeout(500);
            const at = async (cx, cy) => { const b = await pg.$eval("#brainView", (e) => { e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cw: e.width, ch: e.height }; }); await pg.mouse.click(b.x + cx * b.w / b.cw, b.y + cy * b.h / b.ch); await pg.waitForTimeout(450); };
            const txt = (id) => pg.$eval(id, (e) => e.textContent), dis = () => pg.evaluate(() => [document.getElementById("steerUp").disabled, document.getElementById("steerDown").disabled, document.getElementById("steerClear").disabled]);
            const before = await dis(); await at(60, 193);   // the first row of the steer lens: the bars view's lower left
            const m1 = await txt("#steerMsg"), d1 = await dis();
            ok("!! a click on the first row of the steer lens selects that neuron of the last hidden layer: the line says h<i> is selected and can be pushed, and the push buttons come alive", before[0] && before[1] && /^h\d+ selected: push it up or down/.test(m1) && !d1[0] && !d1[1] && d1[2], JSON.stringify({ before, m1, d1 }));
            await pg.click("#steerUp", { timeout: 3000 }).catch(() => {}); await pg.waitForTimeout(500);
            const who = await txt("#brainWho"), m2 = await txt("#steerMsg"), d2 = await dis();
            ok("!! pushing it steers the sub: the panel's header says STEERED h<i>, the message gives the held push in hidden units and what it does to each output, the clear button comes alive", /STEERED h\d+/.test(who) && /^holding h\d+ at \+\d/.test(m2) && /-> outputs /.test(m2) && !d2[2], JSON.stringify({ who: who.slice(-30), m2 }));
            // v4904 -- the slider HOLDS a push live: moving it sets the steer at that many times the lens's push, the readout follows, zero lets go; the slider's own position is the held push / the scale it began with
            const slide = async (v) => { await pg.$eval("#steerSlider", (e, val) => { e.value = String(val); e.dispatchEvent(new Event("input", { bubbles: true })); }, v); await pg.waitForTimeout(500); };
            await slide(-6);
            const sw = await txt("#brainWho"), sm = await txt("#steerMsg"), sv = await pg.$eval("#steerSlider", (e) => e.value), sd = await dis();
            await slide(6); const sm2 = await txt("#steerMsg"), sv2 = await pg.$eval("#steerSlider", (e) => e.value);
            ok("!! the hold slider (disabled until a pushable neuron is selected) holds a push at -6, then +6, times the lens's push: the header says STEERED, the message gives the held value (negative, then positive) and the outputs it moves, the slider keeps its position as the lens's own scale moves", /STEERED h\d+/.test(sw) && /^holding h\d+ at -\d/.test(sm) && /-> outputs/.test(sm) && Number(sv) === -6 && !sd[0] && /^holding h\d+ at \+\d/.test(sm2) && Number(sv2) === 6, JSON.stringify({ sm, sv, sm2, sv2 }));
            await slide(0); const sw0 = await txt("#brainWho"), sm0 = await txt("#steerMsg");
            ok("  moving it back to zero lets go: no STEERED in the header and the message offers the push again", !/STEERED/.test(sw0) && /selected: push it up or down/.test(sm0), sm0);
            await pg.click("#steerUp", { timeout: 3000 }).catch(() => {}); await pg.waitForTimeout(400);
            await pg.click("#steerClear"); await pg.waitForTimeout(500);
            const who3 = await txt("#brainWho"), d3 = await dis();
            ok("  clearing lets go: no STEERED in the header and the clear button is disabled again", !/STEERED/.test(who3) && d3[2], who3.slice(-30));
            // v4904 -- NEEDS AND LIMITS on the page: the menu starts a charge and a hull on the selected sub, the list row says so, and injure hurts the hull
            await pg.selectOption("#needsSel", "battery"); await pg.waitForTimeout(700);
            const nl = await pg.evaluate(() => { const t = document.querySelector(".tk"); return t ? t.textContent : ""; });
            await pg.click("#injureBtn"); await pg.waitForTimeout(600);
            const nl2 = await pg.evaluate(() => { const t = document.querySelector(".tk"); return t ? t.textContent : ""; });
            ok("!! the needs menu gives the selected sub a battery and a 60 m hull (the list row reads battery, charge, kW, hull strain of 60 m, damage 0%), and injure hurts the hull by 20%", /^battery · charge \d+% · [\d.]+ kW.* · hull [\d.]+ of 60 m · damage 0% · flood 0\.0%$/.test(nl) && /damage 20% /.test(nl2) && /of 54 m/.test(nl2), JSON.stringify({ nl: nl.slice(0, 90), nl2: nl2.slice(-60) }));
            await pg.selectOption("#needsSel", ""); await pg.waitForTimeout(400);
            await pg.selectOption("#brainMode", "layers"); await pg.waitForTimeout(500);
            await at(26, 44);   // the first dot of the features column (the map sits 14 px lower while a neuron is selected: the wiring line takes the top, and h<i> is still selected from the lens)
            const m4 = await txt("#steerMsg"), d4 = await dis();
            const ink = await pg.evaluate(() => { const c = document.getElementById("brainView"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 60 || d[i + 1] > 60 || d[i + 2] > 60) k++; return k; });
            ok("!! in the layers view (" + ink + " inked pixels) a click on a dot of the FEATURES column selects it: it can be read and not pushed (the message says so, the push buttons stay disabled); a second click on the same dot lets go of it", /not in the last hidden layer/.test(m4) && d4[0] && d4[1] && ink > 3000 && await (async () => { await at(26, 44); return /click a neuron to select it/.test(await txt("#steerMsg")); })(), m4);
            ok("  no page or console error", errs.length === 0, errs.join(" | ").slice(0, 200));
        } finally { await br.close(); server.close(); }
    }
}

console.log("\n14. THE FLIGHT PAGES' CLICKS (v4904): render/brainUi.mjs, and the three pages that use it (select, read the wiring, the layers view; no steer there)");
{
    const U = await import("./brainUi.mjs"), L = await import("./brainLens.mjs");
    const listeners = {}, canvas = { width: 520, height: 250, style: {}, addEventListener: (t, f) => { listeners[t] = f; }, getBoundingClientRect: () => ({ left: 100, top: 40, width: 260, height: 125 }) };
    const modeListeners = {}, mode = { value: "bars", addEventListener: (t, f) => { modeListeners[t] = f; } };
    let changes = 0; const ui = U.createBrainUi({ canvas, modeEl: mode, onChange: () => { changes++; } });
    ui.setRects([{ layer: 2, i: 7, x: 100, y: 60, r: 5 }, { layer: 3, i: 1, x: 300, y: 60, r: 5 }]);
    listeners.click({ clientX: 100 + 50, clientY: 40 + 30 });   // the page shows the canvas at half size: client (150, 70) is canvas (100, 60)
    ok("!! a click maps the page's coordinates to the canvas's (the canvas is drawn at half its size here) and selects the dot under it; the pointer cursor is set", JSON.stringify(ui.neuron) === JSON.stringify({ layer: 2, i: 7 }) && changes === 1 && canvas.style.cursor === "pointer", JSON.stringify(ui.neuron));
    ui.click(100, 60); const second = ui.neuron; ui.click(100, 60); ui.click(0, 0);
    ok("!! a second click on the selected neuron lets go of it, a click on another selects that one, and a click on nothing clears the selection", second === null && JSON.stringify((ui.click(300, 60), ui.neuron)) === JSON.stringify({ layer: 3, i: 1 }) && (ui.click(0, 0), ui.neuron) === null, "");
    ui.click(100, 60); ui.forWho("a"); const afterA = ui.neuron; ui.forWho("b"); const afterB = ui.neuron; ui.click(100, 60); ui.forWho("b"); const same = ui.neuron;
    ok("!! forWho lets go of the selection when the panel is about somebody else (a selection made before forWho(a) is dropped by it, and again by forWho(b)) and keeps it for the same one (a repeated forWho(b))", afterA === null && afterB === null && JSON.stringify(same) === JSON.stringify({ layer: 2, i: 7 }));
    mode.value = "layers"; const n0 = changes; modeListeners.change();
    ok("!! the view follows the picker (bars, then layers; anything else reads as bars) and a change of it asks the page to redraw", ui.view === "layers" && changes === n0 + 1 && (() => { mode.value = "x"; return ui.view === "bars"; })() && U.createBrainUi({ canvas: null }).view === "bars");
    ui.setRects("not an array"); ok("  a bad hit-area list is an empty one (a click on it selects nothing)", ui.click(100, 60) === null);
    // the three pages
    const pages = [["es-aircraft.html", /aircraftPanel\(\{[^}]*\}, \{ neuron: bui\.neuron \}\)/, /bui\.forWho\(i\)/], ["es-flight6dof.html", /throttle: s\.controls\.throttle \} \}, \{ neuron: bui\.neuron \}\)/, /bui\.forWho\(me \+ ":" \+ \(p\.label \|\| ""\)\)/], ["es-box3d-fly3d.html", /fly3dPanel\(\{ kind: w \? "fly" : "scripted"[^)]*\}, \{ neuron: bui\.neuron \}\)/, /bui\.forWho\(e\.id\)/]];
    const bad = pages.filter(([f, panelRe, whoRe]) => { const src = fs.readFileSync(path.join(ENG, f), "utf8"); return !(/import \{ createBrainUi \} from "\/render\/brainUi\.mjs"/.test(src) && /id="brainMode"/.test(src) && /createBrainUi\(\{ canvas: brainCv, modeEl: document\.getElementById\("brainMode"\)/.test(src) && panelRe.test(src) && whoRe.test(src) && /bui\.setRects\(drawPanel\(brainCtx, brainCv\.width, brainCv\.height,/.test(src) && /view: bui\.view \}\)\.rects\)/.test(src)); }).map(([f]) => f);
    ok("!! es-aircraft, es-flight6dof and es-box3d-fly3d each import the controller, have the view picker, build their panel with the selection, name WHO it is about, and hand the drawing's hit areas back", bad.length === 0, bad.length ? "MISSING in: " + bad.join(", ") : pages.map(([f]) => f).join(", "));
    const { chromium, from: pwFrom } = resolvePlaywright(createRequire(import.meta.url)), skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) { console.log("  ----  live half SKIPPED -- " + skip); console.log("  ----  *** THAT IS A SKIP AND NOT A PASS: the clicks are only a page's"); }
    else {
        const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json" };
        const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split("?")[0]), fp = path.join(ENG, u); if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); } res.writeHead(404); res.end("nf"); });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const br = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pa = await (await br.newContext()).newPage(), errs = [];
            pa.on("pageerror", (e) => errs.push(String(e.message))); pa.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|WebGPU|webgpu/.test(m.text())) errs.push(m.text()); });
            await pa.goto("http://127.0.0.1:" + server.address().port + "/es-aircraft.html", { waitUntil: "load" }); await pa.waitForTimeout(1500);
            await pa.evaluate(() => { const r = window.__aircraftDemo ? window.__aircraftDemo.roster : null; if (r) r.setSpec("hand"); });
            await pa.selectOption("#brainPick", "1"); await pa.selectOption("#brainMode", "layers"); await pa.waitForTimeout(900);
            const white = () => pa.evaluate(() => { const c = document.getElementById("brainView"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let k = 0, ink = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] > 60 || d[i + 1] > 60 || d[i + 2] > 60) ink++; if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) k++; } return { k, ink }; });
            const w0 = await white();
            const box = await pa.$eval("#brainView", (e) => { e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, s: r.width / e.width }; });
            await pa.mouse.click(box.x + 26 * box.s, box.y + 33 * box.s); await pa.waitForTimeout(500);   // the first dot of the features column (the map is 22 px under the top)
            const w1 = await white();
            ok("!! es-aircraft on the hand network in the layers view (" + w0.ink + " inked pixels): a click on the first features dot rings it in white and writes its wiring along the top (more white pixels than before)", w0.ink > 3000 && w1.k > w0.k + 20, JSON.stringify({ before: w0.k, after: w1.k }));
            ok("  no page or console error", errs.length === 0, errs.join(" | ").slice(0, 200));
        } finally { await br.close(); server.close(); }
    }
}

// v4901 -- the exports the definition census asked this gate to name (drawHeat), checked in one row.
{ const M = await import("./brainPanel.mjs"); const names = ["drawHeat"];
  const okShape = names.every((n) => n in M && (typeof M[n] === "function" || typeof M[n] === "number" || typeof M[n] === "string" || typeof M[n] === "object"));
  ok("drawHeat, the heat-map drawer the panels share, is exported as a function", okShape, names.map((n) => n + ":" + typeof M[n]).join(" ")); }
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
