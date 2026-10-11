// WebGLEngine/brain/pilot6dofPolicy-selfcheck.mjs -- v4829 (beside brain/pilot6dofPolicy.mjs and es-box3d-6dof.html's Load Pilots panel)
//
// Run: node brain/pilot6dofPolicy-selfcheck.mjs
//
// GRADES brain/pilot6dofPolicy.mjs -- a learned pilot with brain/autopilot6dof.mjs's own contract, (body, target, opts) -> { torqueBody, thrust, firing, range, facingCos } -- and the Load Pilots
// panel es-box3d-6dof.html now has, through brain/pilotRoster.mjs (handed this module as its policy).
//
// Section 1, THE NETWORK: twelve features and five outputs through the 34 neurons of the Giant Fiber Circuit, a weight count (930) that is neither the plane pilot's (725) nor the gunner's (896), so a
// blob of one cannot be taken for another by its length; the recurrent core permanently zero outside the 313 real synapses even with every weight set; the zero pilot never turning, thrusting or
// firing. Section 2, THE GEOMETRY IS decide()'s: the restated aim geometry (range, the cosine to the aim, the two gates, the pointing error) held to autopilot6dof.decide() on 60 seeded states.
// Section 3, THE HAND WEIGHTS ARE THE PD AUTOPILOT: thrust and fire identical to decide() on all 60 states, torque within 2% wherever the pointing error is under a radian (measured worst 1.13%: tanh(x) is x
// less x^3/3, which at the page's gains is 0.74% at one radian of error alone) and within the tanh's saturation (measured, bounded) at the largest errors. Section 4, THE DUELS: a hand brain against the PD autopilot flies the same fight to the bit; hand against zero wins without a scratch and
// zero against hand loses; the same pairing twice is the same fingerprint, swapped is another; a noisy brain is another fight; and brain/pilotRoster.mjs's resolved weights reach the ship.
// Section 5, THE PAGE: es-box3d-6dof.html in its own browser -- the panel is there, the default lineup is the PD autopilot against the PD autopilot, a choice made in a select is the pilot that flies
// after Start Fight (a zero team holds still and takes the damage; a hand team moves and deals it), Start Fight clears the tally, and the choices survive a reload.
//
// SABOTAGE LOG -- v4829, sixteen, each applied to the file named, the gate run, the file restored. Reds are rows (`grep -c '^  FAIL'`).
//   A  pilot6dofPolicy.mjs: the hand brain never opens the thrust gate                    4 red (thrust-and-fire-are-decide's, both duel rows that need the winner to close, and the hand-against-autopilot row)
//   B  pilot6dofPolicy.mjs: the hand brain never opens the fire gate                      6 red (the same row, every duel that needs a hit, the page's fights)
//   C  pilot6dofPolicy.mjs: no damping term (kd = 0)                                      4 red (the 2% torque row, the 180-degree row, the hand-against-autopilot fingerprint, the duels)
//   D  pilot6dofPolicy.mjs: the aim ignores the weapon speed (no lead)                    5 red (range and cosine, the gates, the PD law, the duels)
//   E  pilot6dofPolicy.mjs: the closing speed has the wrong sign                          1 red -- *** ONLY THE ROW ADDED FOR IT. Nothing else reads the closing feature (the hand weights give it no weight), so before that row this
//      sabotage would have gone 0 red; the feature is graded by its own sign and size, 10 m/s on a stationary target reading 0.5 ***
//   F  pilot6dofPolicy.mjs: the torque gain halved on the way out                         4 red
//   G  pilot6dofPolicy.mjs: the pilot ignores the thrust force it is given                2 red
//   H  pilot6dofPolicy.mjs: a forbidden recurrent slot leaks (one extra entry, [1][30])   1 red (the structural-mask row)
//   J  pilot6dofPolicy.mjs: duel() takes no weight vector                                  4 red
//   K  pilot6dofPolicy.mjs: the zero pilot has a thrust bias                               3 red (the zero-pilot row and both page fights). *** THE FIRST FORM OF THIS (zeroWeights calling handWeights, which calls zeroWeights) RECURSED
//      TO A STACK OVERFLOW AND EXITED 1 WITH ZERO FAIL ROWS: a crash that looks like a catch and is not one, re-done as a real breakage ***
//   L  es-box3d-6dof.html: team B flies the default whatever is chosen                     3 red
//   M  es-box3d-6dof.html: Start Fight does not clear the tally                            1 red
//   N  es-box3d-6dof.html: the choices are not saved                                       1 red (the reload row)
//   P  es-box3d-6dof.html: offers a Brain panel choice the page does not have              1 red (seven choices, not six)
//   Q  es-box3d-6dof.html: team A is handed no pilot                                       1 red (the page's hand-against-zero fight)
//   R  pilotRoster.mjs: the resolved scripted team ignores the name it is given            1 red (the PD autopilot is named as such, on the page and in the roster row)
//   FIRST RUN OF THE GATE: one red, and it was my claim and not the code: the hand brain tracks the PD autopilot to 1.13% at small errors, not the 1% the header said -- the tanh's first-order
//   saturation (tanh(0.15) is 0.9926 of 0.15, at one radian of error; the angular-velocity term adds the rest). The bound is 2% now and says why.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P6 from "./pilot6dofPolicy.mjs";
import * as PP from "./pilotPolicy.mjs";
import * as GP from "./gunnerPolicy.mjs";
import * as AP from "./autopilot6dof.mjs";
import * as R from "./pilotRoster.mjs";
import * as RB from "../physics/mechanics/rigidBody6dof.mjs";
import * as Topo from "./gfcTopology.mjs";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);
const mkRng = (seed) => { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

// 60 seeded states of a ship against a target: any orientation, a small spin, the target 30-200 units away and moving, the ship moving a little
const I = RB.boxInertia({ m: 8, hx: 1.6, hy: 0.7, hz: 0.7 });
const rng = mkRng(4829), STATES = [];
for (let k = 0; k < 60; k++) {
    const q = (() => { const v = [rng() - 0.5, rng() - 0.5, rng() - 0.5, rng() - 0.5], n = Math.hypot(...v) || 1; return v.map((c) => c / n); })();
    const dir = (() => { const v = [rng() - 0.5, rng() - 0.5, rng() - 0.5], n = Math.hypot(...v) || 1; return v.map((c) => c / n); })(), dist = 30 + rng() * 170;
    STATES.push({ body: RB.createBody({ mass: 8, I, pos: [rng() * 10, rng() * 10, rng() * 10], q, vel: [(rng() - 0.5) * 6, (rng() - 0.5) * 6, (rng() - 0.5) * 6], w: [(rng() - 0.5) * 1.2, (rng() - 0.5) * 1.2, (rng() - 0.5) * 1.2] }),
                  target: { pos: dir.map((c) => c * dist), vel: [(rng() - 0.5) * 8, (rng() - 0.5) * 8, (rng() - 0.5) * 8] } });
}
// and a handful aimed near the nose so the gates (thrust, fire) are exercised both ways, not only closed
const aimed = (cone, dist, thrustless = false) => {
    const q = [1, 0, 0, 0], b = RB.createBody({ mass: 8, I, pos: [0, 0, 0], q, vel: [0, 0, 0], w: [0, 0, 0] });
    return { body: b, target: { pos: [dist * Math.cos(cone), dist * Math.sin(cone), 0], vel: [0, 0, 0] } };
};
for (const [cone, dist] of [[0.01, 120], [0.01, 400], [0.3, 120], [0.3, 30], [0.04, 200], [0.7, 120], [0.01, 30]]) STATES.push(aimed(cone, dist));
const OPTS = { weaponSpeed: 900, thrustForce: 16, standoff: 50 };

sec("1. THE NETWORK");
{
    ok("!! twelve features and five outputs through the Giant Fiber Circuit's 34 neurons: 930 weights, which is neither the plane pilot's " + PP.WEIGHT_COUNT + " nor the gunner's " + GP.WEIGHT_COUNT + " (a blob of one is not mistaken for another by its length)",
       P6.FEATURES === 12 && P6.OUTPUTS === 5 && P6.HIDDEN === Topo.NEURON_ORDER.length && P6.WEIGHT_COUNT === 12 * P6.HIDDEN + P6.HIDDEN + Topo.EDGES.length + P6.HIDDEN * 5 + 5 && P6.WEIGHT_COUNT === 930 && P6.WEIGHT_COUNT !== PP.WEIGHT_COUNT && P6.WEIGHT_COUNT !== GP.WEIGHT_COUNT && P6.FEATURE_NAMES.length === 12 && P6.OUTPUT_NAMES.length === 5,
       `${P6.HIDDEN} neurons, ${Topo.EDGES.length} synapses`);
    const w = new Float32Array(P6.WEIGHT_COUNT).fill(0); for (let k = 0; k < Topo.EDGES.length; k++) w[P6.FEATURES * P6.HIDDEN + P6.HIDDEN + k] = 1;
    const Wm = P6.layersOf(w)[1].W, edge = new Set(Topo.EDGES.map(([o, k]) => o * P6.HIDDEN + k));
    let outside = 0, onEdges = 0; for (let o = 0; o < P6.HIDDEN; o++) for (let k = 0; k < P6.HIDDEN; k++) { const v = Wm[o * P6.HIDDEN + k]; if (o === k) continue; if (v !== 0 && !edge.has(o * P6.HIDDEN + k)) outside++; if (v !== 0) onEdges++; }
    ok("!! the recurrent core is structurally zero outside the real synapses: with EVERY one of the 313 weights set, no entry outside the circuit's edges is nonzero", outside === 0 && onEdges > 0, `${onEdges} nonzero off-diagonal entries, ${outside} outside the circuit`);
    const z = P6.pilotFor(P6.zeroWeights()), outs = STATES.map((s) => z(s.body, s.target, OPTS));
    ok("!! the zero pilot never turns, thrusts or fires: zero torque, zero thrust, no fire on all " + STATES.length + " states", outs.every((o) => o.torqueBody.every((t) => t === 0) && o.thrust === 0 && o.firing === false));
    ok("the hand and zero vectors are the right length, finite, and a perturbed vector keeps its length and differs", P6.handWeights().length === 930 && P6.handWeights().every(Number.isFinite) && (() => { const n = P6.perturb(P6.handWeights(), 0.05, mkRng(1)); return n.length === 930 && !same(n, P6.handWeights()); })());
}

{
    // forward(), REC_STEPS and REC_EDGES are the network's own shape, graded here and not merely exported
    const w = P6.handWeights(), x = P6.features(STATES[0].body, STATES[0].target, OPTS), y = P6.forward(w, x), yz = P6.forward(P6.zeroWeights(), x);
    const pf = P6.pilotFor(w)(STATES[0].body, STATES[0].target, OPTS), L = P6.layersOf(w);
    ok("!! forward() is the output layer: five numbers inside [-1, 1], exactly zero for the zero weights, and pilotFor() is those numbers times the torque gain times each axis' moment of inertia -- not a second computation", y.length === 5 && y.every((v) => Math.abs(v) <= 1) && yz.every((v) => v === 0) && [0, 1, 2].every((i) => pf.torqueBody[i] === STATES[0].body.I[i] * P6.TORQUE_GAIN * y[i]), y.map((v) => v.toFixed(3)).join(","));
    ok("!! the core is " + P6.REC_STEPS + " weight-tied recurrent steps over " + P6.REC_EDGES + " real synapses: the layer list is an encoder, REC_STEPS copies of ONE recurrent layer (the same object, so the weights are tied), and a decoder; the synapse count is the circuit's own", P6.REC_STEPS === 3 && P6.REC_EDGES === Topo.EDGES.length && P6.REC_EDGES === 313 && L.length === P6.REC_STEPS + 2 && L.slice(1, 1 + P6.REC_STEPS).every((l) => l === L[1]) && L[0].nIn === P6.FEATURES && L[L.length - 1].nOut === P6.OUTPUTS);
}

sec("2. THE GEOMETRY IS decide()'s, state for state");
{
    let worst = 0, gates = true, ranges = true, cos = true, nT = 0, nF = 0;
    for (const s of STATES) {
        const g = P6.geometry(s.body, s.target, OPTS), d = AP.decide(s.body, s.target, OPTS);
        ranges = ranges && g.range === d.range; cos = cos && g.facingCos === d.facingCos;
        gates = gates && (g.thrustOk === (d.thrust > 0)) && (g.aligned === d.firing);
        if (d.thrust > 0) nT++; if (d.firing) nF++;
        const kp = AP.AUTOPILOT.kp, kd = 2 * Math.sqrt(kp);
        for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(s.body.I[i] * (kp * g.eBody[i] - kd * s.body.w[i]) - d.torqueBody[i]));
    }
    ok("!! the range and the cosine to the aim are decide()'s, bit for bit, on all " + STATES.length + " states", ranges && cos);
    ok("!! the two gates are decide()'s: the thrust gate is open exactly when decide() thrusts, the fire gate exactly when it fires -- and both open and closed occur in the states (" + nT + " thrusting, " + nF + " firing)", gates && nT > 3 && nT < STATES.length - 3 && nF >= 2 && nF < STATES.length - 3);
    // the closing feature (what the PD controller does not have): positive when the gap is shrinking, negative when it grows, zero when neither ship moves
    const still = aimed(0.1, 100), toward = { body: RB.createBody({ mass: 8, I, pos: [0, 0, 0], q: [1, 0, 0, 0], vel: [10, 0, 0], w: [0, 0, 0] }), target: { pos: [100, 0, 0], vel: [0, 0, 0] } }, away = { body: RB.createBody({ mass: 8, I, pos: [0, 0, 0], q: [1, 0, 0, 0], vel: [-10, 0, 0], w: [0, 0, 0] }), target: { pos: [100, 0, 0], vel: [0, 0, 0] } }, chase = { body: toward.body, target: { pos: [100, 0, 0], vel: [10, 0, 0] } };
    const cl = (s) => P6.features(s.body, s.target, OPTS)[9];
    ok("!! the closing-speed feature has the right sign and size: +0.5 closing at 10 m/s on a stationary target (10 / 20), -0.5 opening, 0 when neither ship moves, and 0 when the target runs away at the same speed", Math.abs(cl(toward) - 0.5) < 1e-9 && Math.abs(cl(away) + 0.5) < 1e-9 && cl(still) === 0 && Math.abs(cl(chase)) < 1e-9, `${cl(toward)} / ${cl(away)} / ${cl(still)} / ${cl(chase)}`);
    ok("the pointing error, in the body frame, reproduces decide()'s torque through the PD law to rounding", worst < 1e-9, `worst difference ${worst.toExponential(2)}`);
}

sec("3. THE HAND WEIGHTS ARE THE PD AUTOPILOT, WRITTEN THROUGH THE NETWORK");
{
    const hand = P6.pilotFor(P6.handWeights());
    let thrustSame = true, fireSame = true, worstSmall = 0, nSmall = 0, worstBig = 0, nBig = 0, signs = true;
    for (const s of STATES) {
        const d = AP.decide(s.body, s.target, OPTS), h = hand(s.body, s.target, OPTS), g = P6.geometry(s.body, s.target, OPTS);
        thrustSame = thrustSame && h.thrust === d.thrust; fireSame = fireSame && h.firing === d.firing;
        const emax = Math.max(...g.eBody.map(Math.abs));
        for (let i = 0; i < 3; i++) {
            const scale = Math.max(Math.abs(d.torqueBody[i]), 1e-6), rel = Math.abs(h.torqueBody[i] - d.torqueBody[i]) / scale;
            if (emax < 1) { nSmall++; worstSmall = Math.max(worstSmall, Math.abs(h.torqueBody[i] - d.torqueBody[i]) / Math.max(1, Math.abs(d.torqueBody[i]))); }
            else { nBig++; worstBig = Math.max(worstBig, rel); }
            if (Math.abs(d.torqueBody[i]) > 1e-3 && Math.sign(h.torqueBody[i]) !== Math.sign(d.torqueBody[i])) signs = false;
        }
    }
    ok("!! thrust and fire are decide()'s on every state: the hand brain thrusts and fires exactly when the PD autopilot does", thrustSame && fireSame);
    ok("!! torque is the PD controller's to within 2% wherever the pointing error is under a radian (" + nSmall + " axis readings; the tanh's own first-order saturation, 1.1% measured), and the same SIGN everywhere", worstSmall < 0.02 && nSmall > 20 && signs, `worst ${(worstSmall * 100).toFixed(3)}% on small errors, signs agree ${signs}`);
    ok("...and at large errors it saturates (tanh) by a bounded amount: under 40% off on any axis of the " + nBig + " large-error readings (the autopilot is unbounded; the network tops out at " + P6.TORQUE_GAIN + " rad/s^2 per axis)", worstBig < 0.4 && nBig > 20, `worst ${(worstBig * 100).toFixed(1)}%`);
    const back = { body: RB.createBody({ mass: 8, I, pos: [0, 0, 0], q: [0, 0, 1, 0], vel: [0, 0, 0], w: [0, 0, 0] }), target: { pos: [100, 20, 0], vel: [0, 0, 0] } };
    const dB = AP.decide(back.body, back.target, OPTS), hB = hand(back.body, back.target, OPTS);
    report(`facing straight away: autopilot ${dB.torqueBody.map((v) => v.toFixed(1)).join(",")} network ${hB.torqueBody.map((v) => v.toFixed(1)).join(",")}`);
    ok("a ship facing straight away from its target (the largest error, 180 degrees) turns the same way with at least 90% of the autopilot's demand", dB.torqueBody.every((v, i) => Math.abs(v) < 1e-9 || (Math.sign(hB.torqueBody[i]) === Math.sign(v) && Math.abs(hB.torqueBody[i]) >= 0.9 * Math.abs(v))));
}

sec("4. THE DUELS: the choice reaches the fight");
{
    const aa = P6.duel("autopilot", "autopilot", { seed: 1, seconds: 40 }), ha = P6.duel("hand", "autopilot", { seed: 1, seconds: 40 }), hz = P6.duel("hand", "zero", { seed: 1, seconds: 40 }), zh = P6.duel("zero", "hand", { seed: 1, seconds: 40 });
    ok("!! a hand brain against the PD autopilot flies the SAME FIGHT as the PD autopilot against itself: same fingerprint, hits and hit points (the brain IS the autopilot)", ha.fingerprint === aa.fingerprint && ha.hits === aa.hits && ha.hitsTaken === aa.hitsTaken && ha.aHp === aa.aHp && ha.bHp === aa.bHp, `${ha.fingerprint} / ${aa.fingerprint}, ${ha.hits} hits each way`);
    ok("!! a HAND brain against a ZERO brain wins without a scratch: lands hits, takes none, the zero ship dead (the zero pilot never fires)", hz.hits >= 3 && hz.hitsTaken === 0 && hz.bDead && !hz.aDead && hz.aHp === P6.HP_MAX, `${hz.hits} hits of ${hz.shotsFired}, hp ${hz.aHp} against ${hz.bHp}`);
    ok("!! ...and swapped, the ZERO brain loses: no shots, takes the hits, dead (B's weights reach B's ship)", zh.shotsFired === 0 && zh.hits === 0 && zh.hitsTaken >= 3 && zh.aDead && !zh.bDead, `${zh.hitsTaken} hits taken`);
    const hz2 = P6.duel("hand", "zero", { seed: 1, seconds: 40 }), hn = P6.duel("hand", R.resolveTeam("B", "noise10", { PP: P6 }, 1).weights[0], { seed: 1, seconds: 40 }), hz3 = P6.duel("hand", "zero", { seed: 2, seconds: 40 });
    ok("the same pairing twice is the same fight to the bit, a different seed is another, and the pairing swapped is another", hz.fingerprint === hz2.fingerprint && hz.fingerprint !== hz3.fingerprint && hz.fingerprint !== zh.fingerprint, `${hz.fingerprint} / ${hz2.fingerprint} / seed 2 ${hz3.fingerprint} / swapped ${zh.fingerprint}`);
    ok("a noisy brain is another fight from the hand brain it is made from (the weights reach the ship)", hn.fingerprint !== ha.fingerprint, `${hn.fingerprint} against ${ha.fingerprint}`);
    const r = R.resolveRoster({ A: "hand", B: "zero" }, { PP: P6, shipped: null, imported: null, brainPilotOn: false }, 1), viaRoster = P6.duel(r.A.weights[0], r.B.weights[0], { seed: 1, seconds: 40 });
    ok("brain/pilotRoster.mjs, handed this module as its policy, resolves hand-against-zero to the same fight: the plane page's resolver flies this page's ships", viaRoster.fingerprint === hz.fingerprint && r.A.weights[0].length === 930, viaRoster.fingerprint);
}

{
    // the duel's ship and weapon are the PAGE's, and a copy that drifts from the page is a duel of some other game: each constant is read out of the page's own source
    const html = fs.readFileSync(path.join(ENG, "es-box3d-6dof.html"), "utf8"), num = (re) => { const m = re.exec(html); return m ? m[1].split(",").map((v) => +v.trim()) : null; };
    const pa = /const PAGE_AUTOPILOT = \{ thrustForce: (\d+), standoff: (\d+) \}/.exec(html);
    ok("!! the duel's ship, engine mount, mass, damage, spawn and thrust settings are the PAGE's own, read from es-box3d-6dof.html's source: HALF, ENGINE_MOUNT, SHIP_MASS, SHOT_DAMAGE, SPAWN_X and PAGE_AUTOPILOT (and the hit points, which the duel's ships start with)",
       same(num(/const HALF = \[([^\]]+)\]/), P6.HALF) && same(num(/const ENGINE_MOUNT = \[([^\]]+)\]/), P6.ENGINE_MOUNT) && num(/const SHIP_MASS = (\d+)/)[0] === P6.SHIP_MASS && num(/SHOT_DAMAGE = (\d+)/)[0] === P6.SHOT_DAMAGE && num(/SPAWN_X = (\d+)/)[0] === P6.SPAWN_X && num(/HP_MAX = (\d+)/)[0] === P6.HP_MAX && !!pa && +pa[1] === P6.PAGE_AUTOPILOT.thrustForce && +pa[2] === P6.PAGE_AUTOPILOT.standoff,
       `${P6.HALF.join("x")}, mount ${P6.ENGINE_MOUNT[0]}, mass ${P6.SHIP_MASS}, damage ${P6.SHOT_DAMAGE}, spawn +-${P6.SPAWN_X}, thrust ${P6.PAGE_AUTOPILOT.thrustForce}, standoff ${P6.PAGE_AUTOPILOT.standoff}`);
}

sec("5. THE PAGE: es-box3d-6dof.html in its own browser");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 240000, script: `async () => {
            const boot = async () => {
                const f = document.createElement("iframe"); f.style.cssText = "width:900px;height:600px;border:0"; f.src = "/es-box3d-6dof.html"; document.body.appendChild(f);
                const t = performance.now(); while (performance.now() - t < 60000) { await new Promise((r) => setTimeout(r, 250)); const w = f.contentWindow; if (w && w.__sixdof && w.__sixdof.roster) break; }
                return { f, w: f.contentWindow, d: f.contentDocument };
            };
            const waitFor = async (fn, ms) => { const t = performance.now(); while (performance.now() - t < ms) { try { if (fn()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 100)); } return false; };
            const P = await boot(); const S = P.w.__sixdof, d = P.d, byId = (id) => d.getElementById(id), choose = (id, v) => { const s = byId(id); s.value = v; s.dispatchEvent(new P.w.Event("change", { bubbles: true })); };
            const out = { booted: !!(S && S.roster) };
            byId("rosterBtn").click(); out.panelShown = byId("rosterPanel").style.display === "block";
            out.opts = Array.from(byId("pilotA").options).map((o) => o.value); out.defaults = [byId("pilotA").value, byId("pilotB").value];
            await waitFor(() => S.roster.lineup.A && S.roster.lineup.B, 5000);
            out.lineup0 = { A: S.roster.lineup.A.id, B: S.roster.lineup.B.id, label: S.roster.lineup.A.label, note: byId("rosterNote").textContent };
            const hurt = (fl) => fl.some((s) => s.hp < 100), moved = (fl) => fl.some((s) => Math.hypot(...s.body.vel) > 0.5), spun = (fl) => fl.some((s) => Math.hypot(...s.body.w) > 0.01);
            // a fight ends in seconds (a wiped fleet resets the battle), so the page is SAMPLED every 30 ms and the evidence is OR-ed: has a team been hurt, has it moved, has it spun -- until the tally ticks or the time is up
            const observe = async (ms) => {
                const o = { aHurt: false, bHurt: false, aMoved: false, bMoved: false, aSpun: false, bSpun: false, ended: false }, w0 = S.state().wins, t = performance.now();
                while (performance.now() - t < ms) {
                    const F = S.fleets; o.aHurt ||= hurt(F.A); o.bHurt ||= hurt(F.B); o.aMoved ||= moved(F.A); o.bMoved ||= moved(F.B); o.aSpun ||= spun(F.A); o.bSpun ||= spun(F.B);
                    const w = S.state().wins; if (w.A + w.B > w0.A + w0.B) { o.ended = true; break; }
                    await new Promise((r) => setTimeout(r, 30));
                }
                return o;
            };
            choose("pilotA", "hand"); choose("pilotB", "zero"); byId("startFight").click();
            out.afterStart = { A: S.roster.lineup.A.id, B: S.roster.lineup.B.id, ships: S.roster.lineup.A.weights.length, alive: S.fleets.A.length + S.fleets.B.length };
            out.hz = await observe(40000);
            choose("pilotA", "zero"); choose("pilotB", "hand"); byId("startFight").click();
            out.zh = await observe(40000);
            S.roster.setSpecs({ A: "noise10", B: "noise05" }); byId("startFight").click(); out.noise = { A: S.roster.lineup.A.label, B: S.roster.lineup.B.label, distinct: new Set(S.roster.lineup.A.weights.map((w) => w.slice(0, 40).join())).size };
            out.tallyCleared = S.state().wins.A + S.state().wins.B === 0;
            out.persisted = JSON.stringify(S.roster.specs);
            P.f.remove();
            const Q = await boot(); out.reload = [Q.d.getElementById("pilotA").value, Q.d.getElementById("pilotB").value];
            Q.d.getElementById("rosterReset").click(); out.afterReset = [Q.d.getElementById("pilotA").value, Q.d.getElementById("pilotB").value];
            return out;
        }` });
        ok("the harness booted es-box3d-6dof.html and drove the panel", r.ok && r.result && r.result.booted, r.ok ? "" : String(r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 300));
        if (r.ok && r.result && r.result.booted) {
            const p = r.result;
            ok("!! the panel is there: a Load Pilots button opens it, a select for each team; both start on 'default for this team'; six choices (the PD autopilot, hand, zero, two noise levels, and default) and no 'Brain panel' choice, since this page has none", p.panelShown && p.defaults.join() === "auto,auto" && p.opts.length === 6 && !p.opts.includes("brain") && !p.opts.includes("imported") && !p.opts.includes("shipped"), p.opts.join(","));
            ok("!! the default lineup is the old page: the PD autopilot against the PD autopilot, named as such", p.lineup0.A === "scripted" && p.lineup0.B === "scripted" && p.lineup0.label === "PD autopilot" && /PD autopilot/.test(p.lineup0.note), p.lineup0.note);
            ok("!! a choice made in a select is the pilot that flies after Start Fight: team A hand, team B zero is the lineup, three ships a side", p.afterStart.A === "hand" && p.afterStart.B === "zero" && p.afterStart.ships === 3 && p.afterStart.alive === 6, JSON.stringify(p.afterStart));
            ok("!! a ZERO team holds still and takes the damage, a HAND team moves and deals it: team B is hurt and never moved or spun, team A is not hurt and did move", p.hz.bHurt && !p.hz.aHurt && p.hz.aMoved && !p.hz.bMoved && !p.hz.bSpun, JSON.stringify(p.hz));
            ok("!! ...and swapped, team A (zero) is the one hurt, motionless and not spinning, and team B (hand) is moving", p.zh.aHurt && !p.zh.bHurt && p.zh.bMoved && !p.zh.aMoved && !p.zh.aSpun, JSON.stringify(p.zh));
            ok("'hand + noise' gives each ship of its team its own pilot (three distinct), and Start Fight clears the tally", /noise 0.1/.test(p.noise.A) && /noise 0.05/.test(p.noise.B) && p.noise.distinct === 3 && p.tallyCleared, `${p.noise.A} against ${p.noise.B}`);
            ok("!! the choices survive a reload (noise on both sides), and Default pilots puts both selects back on 'default for this team'", p.reload.join() === "noise10,noise05" && p.afterReset.join() === "auto,auto", `${p.reload.join()} then ${p.afterReset.join()}`);
        }
    }
}

console.log(fails ? `\npilot6dofPolicy-selfcheck: ${fails} FAILED` : "\npilot6dofPolicy-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
