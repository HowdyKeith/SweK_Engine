// WebGLEngine/render/brainPanel-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/brainPanel-selfcheck.mjs      (~3 s)
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
//   8  THE PAGES     sub-aquarium.html and es-flight6dof.html have the canvas, import the panel and draw the SELECTED vessel's (the list selection; the camera's aircraft) five times a second
//
// SABOTAGE LOG -- THIRTY-FOUR, each applied in place, the gate run, the file restored; every one red by name (rows red; "crash" is red without a FAIL line):
//   render/brainPanel.mjs: B1 the fly not a network 2 | B2 the fish flown 2 | B3 the throttle not mapped 1 | B4 the OUTPUT layer counted as hidden 6 | B5 a NaN feature not read as 0 1 | B6 the depth law at the wrong scale 1 | B7 the aircraft throttle not mapped 1
//   B8 the heading offset sign 1 | B9 the depth offset sign 1 | B10 the altitude offset sign 1 | B11 the marker's sign 2 | B12 the marker's heading not wrapped 1 | B13 a throwing pilot (crash) | B14 n not floored at 3 1 | B15 the sub map yUp 2 | B16 the span 6 m 2
//   B17 the y axis not flipped for an aircraft 1 | B18 the off-grid ring not red 1 | B19 an arrow in every cell 2 | B20 a fish probe drawn 1 | B21 the fly shown as the autopilot 2 | B22 a human given a map 1 | B23 the map given no room 0 THE FIRST TIME (see below) | 
//   render/subAquariumSim.mjs: B24 probe returns nothing (crash) | B25 every sub a fly 1 | B26 the wander target in place of the flown one 0 THE FIRST TIME | B27 any weights taken, not only 963 1
//   pages: H1 the aquarium draws the first sub, not the selected one 1 | H2 no throttle on the redraw 1 | H3 drawBrain never called 1 | H4 a GPU pilot labelled fly 1 | H5 the flight page always draws aircraft 1 1 | H6 updateBoard never draws 1
// B23 and B26 went 0 red the first time: no row looked at WHERE the panel put the map, and inside the steering box the flown target IS the wander target; the rows for the map's place on the canvas and for a sub outside the box now do.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as B from "./brainPanel.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as F from "../physics/mechanics/flightModel6dof.mjs";
import * as AS from "../brain/autopilotSub.mjs";
import * as AF from "../brain/autopilotFlight.mjs";
import * as PS from "../brain/pilotSubPolicy.mjs";
import * as PF from "../brain/pilotFlightPolicy.mjs";
import * as MF from "../brain/pilotFlightMlp.mjs";
import { createTank } from "./subAquariumSim.mjs";

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
    ok("!! the aquarium: a brainView canvas, the panel imported, and drawBrain draws the SELECTED sub's probe through subPanel / drawPanel at most every 200 ms, from the frame loop", /id="brainView"/.test(aq) && /import \{ subPanel, drawPanel \} from "\/render\/brainPanel\.mjs"/.test(aq) && /selected \? tank\.probe\(selected\) : null/.test(aq) && /subPanel\(pr\)/.test(aq) && /now - lastBrain < 200/.test(aq) && /drawCompass\(snap\); drawBrain\(\)/.test(aq));
    ok("!! the flight page: a brainView canvas, the panel imported, every pilot record carries its kind (manual, gpu, fly twice, autopilot), and drawBrain draws the aircraft the CAMERA follows through flightPanel at most every 200 ms, from updateBoard", /id="brainView"/.test(fl) && /import \{ flightPanel, drawPanel \} from "\/render\/brainPanel\.mjs"/.test(fl) && /kind: "manual"/.test(fl) && /kind: "gpu", policy: MF/.test(fl) && (fl.match(/kind: "fly", policy: PF/g) || []).length === 2 && /kind: "autopilot" \}/.test(fl) && /document\.getElementById\("camTarget"\)\.value\) \|\| 0, s = fleet\[me\], p = resolvePilots\(\)\[me\]/.test(fl) && /flightPanel\(\{ kind: p\.kind/.test(fl) && /now - lastBrain < 200/.test(fl) && /function updateBoard\(\) \{\s*drawBrain\(\);/.test(fl));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
