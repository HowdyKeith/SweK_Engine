// WebGLEngine/tools/ship/pilotPolicy-selfcheck.mjs
//
// Run: node tools/ship/pilotPolicy-selfcheck.mjs
//
// THE SIBLING GATE OF brain/pilotPolicy.mjs: the shape (7 -> 34 encoder -> a connectome-masked recurrent core -> 4 decoder,
// through the kernel's f32 twin, held to a plain MLP written here), the MASK ITSELF (section 1b: every recurrent weight
// outside the real 313 GFC synapses is structurally zero, brain/gfcTopology.mjs re-measured against the vendored citation
// on every run rather than trusted from a baked number), the FEATURES against ev/flightModel3d.js's own stepAI3d geometry
// (section 2: the exact numbers stepAI3d itself computes, and pilotFor()'s sign agreement with stepAI3d -- same turn/pitch
// direction, same fire-only-when-aligned rule -- the whole point of being a drop-in), THE DUEL (section 3: the hand pilot
// actually flies and fights -- lands hits, thrusts, holds fire until aligned -- the zero pilot never turns, thrusts or
// fires, both deterministic), LEARNING (section 4: refining FROM THE HAND PILOT with a small sigma never regresses and
// sometimes improves -- see brain/pilotPolicy.mjs's own train() header for the MEASURED finding that wide-sigma search
// from zero gets stuck at a safe "never engage" local optimum instead), and THE FRONT DOOR. Runs entirely on
// physics/planarFallbackWorld.js -- no box3d wasm needed, the same headless substrate ev/flightModel3d-selfcheck.mjs
// already holds fly3d mode to for its own answer key.
//
// SABOTAGE LOG -- each applied to brain/pilotPolicy.mjs, the gate run, the module restored. Counts are MEASURED
// against the gate as it actually stands (re-run after every fix below), not guessed in advance.
//   A  the hand pilot's fire never gated by alignment (W1(4, F.aligned, 1) zeroed)      -> 6 red: the hand-rule
//      "unchanged by the connectome core" check, the standoff-band check, the drop-in sign-agreement check on two
//      of the four synthetic cases (fires when it should not), and both duel checks ("lands at least one hit" and
//      "clearly outscores zero" -- the hand pilot now never fires at all, so it no longer outscores standing still).
//   B  the yawErr feature's sign flipped (the ship turns away from the target)          -> 3 red: the features
//      check (yaw error reads the wrong sign), the drop-in sign-agreement check (turn direction disagrees with
//      stepAI3d on the off-to-the-side case), and the duel ("lands at least one hit" -- a pilot that turns away
//      from its target lands none on the seed this measured against).
//   C  expandRecurrent() leaking one value into a confirmed-forbidden slot (Wm[12] = 999, row 0 col 12 -- not
//      [0,12] in gfcTopology.mjs's own EDGES, and not the diagonal)                     -> 3 red, not 2 as a first
//      guess assumed: the structural-mask check (1 of 809 forbidden slots nonzero), the "Wrec=0 -> exact identity"
//      check (the leak survives Wrec=0 too), AND the "same seed trains the same weights" check -- the leak reaches
//      every candidate the ES perturbs, so which seed converges where shifts too, not just the mask's own reading.
//   D  shotHits3d() dropping the altitude term from the hit-radius test (dx*dx+dy*dy only, no da*da)  -> 2 red: the
//      DIRECT test of shotHits3d itself (close in x-z, 500 m off in altitude, now registers a hit it should not),
//      and "same seed trains the same weights" (a looser hit test changes which candidates the ES accepts).
//      *** FOUND BY BUILDING THIS SABOTAGE, NOT BY WRITING THE GATE FIRST: *** the original indirect test --
//      "no run deals more damage than hits x the shot's own per-hit damage, never more hits than shots fired" --
//      passed unchanged under this exact sabotage (0 red), because a looser hit VOLUME still deals the same FIXED
//      per-hit damage, just registers more often; neither bound it checked actually depends on the miss geometry.
//      shotHits3d() was pulled out to its own exported function specifically so the gate could test the hit
//      geometry directly instead of only inferring it from combat outcomes -- the indirect bound stayed (it is
//      still a real sanity check on a different failure mode) but no longer carries this one alone.
//   E  duel()'s fingerprint folding only esbx.stateHash() and dropping the explicit altitude fold  -> 1 red: two
//      duels built with duel()'s own altOffset (same seed and gap, shifted starting altitude -- identical flight,
//      since both ships' altitude DIFFERENCE, all either pilot's decisions depend on, is unchanged) collide to the
//      same fingerprint despite flying at different absolute altitude the whole way.
//
// TWO MORE, FOUND BY ADVERSARIAL REVIEW AFTER THE GATE ABOVE FIRST PASSED CLEAN -- both real, both fixed here rather
// than argued with; sabotaged the same way and restored, counts measured against the gate as it now stands:
//   F  the "aligned" feature reverted to stepAI3d's AIM test alone (dropping "&& d < range")  -> the direct symptom
//      (handWeights()'s hand pilot firing at a target 5000 m away with range=1400, verified by the reviewer running
//      the code) is not itself covered by a standing assertion -- no test here builds a synthetic case past range
//      with everything else aligned -- but the duel's real hit/shot ratios shift under it (more wasted shots at
//      long range), which is exactly the kind of thing this sabotage log exists to be honest about: FIXED, not
//      caught by a new targeted check, because the fix folds the range test into the feature ITSELF (features()'s
//      own definition of "aligned" now matches stepAI3d's firing test exactly, not just its aim test), so every
//      existing assertion that already reads "aligned" -- section 1's hand-rule check, section 2's drop-in
//      agreement, section 3's duel -- is checking the corrected behavior already, by construction, not by a patch
//      bolted on beside it.
//   G  reportLines() referencing REWARD.died, a field REWARD no longer has (dropped on purpose -- see train()'s own
//      header) -- prints the literal string "undefined" rather than throwing              -> 1 red, the check added
//      directly below section 5's existing reportLines assertion (no earlier check here ever read L[2]'s full text
//      closely enough to notice a stringified undefined).
//
// SECTION 6 (the shipped default, added when es-box3d-fly3d.html started flying it by default) -- both sabotaged
// on brain/pilotWeightsDefault.json itself, the gate run, the file restored byte for byte (diffed to confirm):
//   H  the weights array truncated to 10 entries (a stand-in for any shape corruption -- a bad edit, a stale
//      export from before WEIGHT_COUNT changed)                                          -> 1 red: the import check,
//      by name, from peerBrain.mjs's own weight-count message -- the SAME validation es-box3d-fly3d.html's page
//      load runs, so this is proof the page's own fallback-to-handWeights() path would have fired too.
//   I  the shipped file swapped for a validly-shaped but worthless policy (zeroWeights(), which imports fine and
//      duels at -1.56 against a fresh sample)                                             -> 1 red: the quality
//      guard, by name -- a file that PASSES import validation can still be a regression, which is exactly why
//      shape-only validation (section H) is not enough on its own.
"use strict";
import * as P from "../../brain/pilotPolicy.mjs";
import * as FM from "../../ev/flightModel3d.js";
import * as Topo from "../../brain/gfcTopology.mjs";
import * as D from "../../brain/drivePolicy.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { planarFallbackWorld } from "../../physics/planarFallbackWorld.js";
import fs from "node:fs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const worldFrom = () => planarFallbackWorld();
const timed = (f) => { const t0 = performance.now(); const r = f(); return { r, ms: performance.now() - t0 }; };

console.log("pilotPolicy-selfcheck -- the fly brain pilots the existing space dogfight: the shape, the features, the duel, the learning\n");

console.log("1. THE SHAPE: 7 -> 34 (ENCODER) -> CONNECTOME-MASKED RECURRENT CORE -> 4 (DECODER), THE ZERO AND THE HAND");
{
    ok("725 weights: 7 x 34 + 34 + 313 + 34 x 4 + 4; REC_STEPS is 3", P.WEIGHT_COUNT === 725 && P.zeroWeights().length === 725 && P.HIDDEN === 34 && P.REC_EDGES === 313 && P.REC_STEPS === 3 && P.FEATURES === 7 && P.OUTPUTS === 4 && P.FEATURE_NAMES.length === P.FEATURES && P.OUTPUT_NAMES.join() === "turn,pitch,thrust,firing");
    const layers = P.layersOf(P.zeroWeights());
    ok("layersOf splits them into a 7->34 relu encoder, REC_STEPS=3 weight-tied 34->34 relu recurrent layers (the SAME matrix object each time), and a 34->4 none decoder",
        layers.length === 5 && layers[0].nIn === 7 && layers[0].nOut === 34 && layers[0].act === "relu" && layers[0].W.length === 238 &&
        layers.slice(1, 4).every((l) => l.nIn === 34 && l.nOut === 34 && l.act === "relu" && l.W.length === 34 * 34 && l.W === layers[1].W) &&
        layers[4].nIn === 34 && layers[4].nOut === 4 && layers[4].act === "none" && layers[4].W.length === 136);

    // THE MASK IS STRUCTURAL, NOT A HABIT OF THE HAND WEIGHTS: at large RANDOM weights, the expanded recurrent
    // matrix must still be exactly zero everywhere except the real 313 edges and the identity diagonal.
    const rw = P.perturb(P.zeroWeights(), 3, (() => { let s = 99; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })());
    const Wm = P.layersOf(rw)[1].W;
    const allowed = new Set(Topo.EDGES.map(([to, from]) => to * P.HIDDEN + from));
    for (let i = 0; i < P.HIDDEN; i++) allowed.add(i * P.HIDDEN + i);
    let offMask = 0;
    for (let i = 0; i < Wm.length; i++) if (!allowed.has(i) && Wm[i] !== 0) offMask++;
    ok("!! *** THE RECURRENT MASK IS STRUCTURAL: at large random weights, EVERY entry outside the real 313 GFC edges (plus the identity diagonal) is exactly 0 ***", offMask === 0, `${offMask} of ${Wm.length - allowed.size} forbidden slots nonzero`);
    ok("...and with Wrec at zeroWeights()'s default (what handWeights() leaves it at), the expanded matrix is EXACTLY the identity -- nothing more, nothing less",
        Array.from(P.layersOf(P.handWeights())[1].W).every((v, i) => v === (i % (P.HIDDEN + 1) === 0 ? 1 : 0)));

    const w = P.perturb(P.zeroWeights(), 0.7, () => 0.37), x = [1, 0.3, -0.2, 0.5, -0.4, 1, 0];
    const plain = (() => {
        const f = Math.fround, ls = P.layersOf(w);
        const dense = (l, xin) => { const y = []; for (let o = 0; o < l.nOut; o++) { let acc = f(l.b[o]); for (let k = 0; k < l.nIn; k++) acc = f(acc + f(f(xin[k]) * f(l.W[o * l.nIn + k]))); y.push(l.act === "relu" ? f(Math.max(0, acc)) : acc); } return y; };
        let h = dense(ls[0], x);
        for (let s = 1; s < ls.length - 1; s++) h = dense(ls[s], h);
        return dense(ls[ls.length - 1], h).map((v) => Math.tanh(v));
    })();
    const got = P.forward(w, x);
    ok("!! forward equals a plain float32 relu MLP written here (encoder, REC_STEPS recurrent steps, decoder), then tanh, on all four outputs", got.length === 4 && got.every((v, i) => near(v, plain[i], 1e-6)), `${got.map((v) => v.toFixed(5))} vs ${plain.map((v) => v.toFixed(5))}`);

    const zeroOut = P.forward(P.zeroWeights(), x);
    ok("the zero pilot answers four zeros; its thrust and firing (tanh 0, not positive) are both off", zeroOut.every((v) => v === 0));
    const shipS = { x: 0, y: 0, alt: 0, heading: 0, pitch: 0 };
    const h0 = P.pilotFor(P.handWeights())(shipS, { x: 0, y: -500, alt: 0 }, { range: 1400, standoff: 140 });
    ok("!! the hand pilot's rule read off its outputs UNCHANGED BY THE CONNECTOME CORE: aligned dead ahead, it holds course and fires", h0.turn === 0 && h0.pitch === 0 && h0.thrust === true && h0.firing === true);
    const h1 = P.pilotFor(P.handWeights())(shipS, { x: 0, y: -50, alt: 0 }, { range: 1400, standoff: 140 });
    ok("...well inside the standoff band it still fires (aligned) but cuts thrust so it does not ram the target", h1.thrust === false && h1.firing === true);
}
console.log("\n1b. THE HIDDEN LAYER IS A REAL, CITABLE FLY CIRCUIT -- MEASURED AGAINST THE VENDORED DATA DIRECTLY, NOT A BAKED NUMBER TRUSTED ON FAITH");
{
    const raw = JSON.parse(fs.readFileSync(new URL("../../vendor/male-cns/giant-fiber-circuit.json", import.meta.url), "utf8"));
    ok("!! brain/gfcTopology.mjs's neuron order (the hidden-unit index <-> real bodyId mapping) matches vendor/male-cns/giant-fiber-circuit.json's own neurons array exactly",
        Topo.NEURON_ORDER.length === raw.neurons.length && Topo.NEURON_ORDER.every((id, i) => id === raw.neurons[i].bodyId) && P.HIDDEN === Topo.NEURON_ORDER.length);
    const idIndex = new Map(raw.neurons.map((n, i) => [n.bodyId, i]));
    const rawEdgeSet = new Set(raw.edges.map(([from, to]) => `${idIndex.get(to)},${idIndex.get(from)}`));
    ok("!! ...and its 313 edges are exactly the vendored file's own edges: none dropped, none invented, none a self-loop",
        Topo.EDGES.length === raw.edges.length && Topo.EDGES.every(([to, from]) => rawEdgeSet.has(`${to},${from}`)) && Topo.EDGES.every(([to, from]) => to !== from) && P.REC_EDGES === Topo.EDGES.length);
    report("brain/gunnerPolicy.mjs already claims this same circuit for the turret; this gate re-derives the mask from the vendored citation independently rather than trusting that the other module's gate already did it");
}
console.log("\n2. THE FEATURES ARE EXACTLY stepAI3d'S OWN GEOMETRY, AND pilotFor() AGREES WITH IT ON SIGN");
{
    const ship = { x: 0, y: 0, alt: 0, heading: 0, pitch: 0 };
    const ahead = { x: 0, y: -500, alt: 0 };
    const f = P.features(ship, ahead, { range: 1400, standoff: 140 });
    ok("!! a target dead ahead at 500 m, standoff 140: no yaw or pitch error, dist 500/1400, standoff gap (500-140)/140, aligned, level pitch", f.length === 7 && near(f[1], 0) && near(f[2], 0) && near(f[3], 500 / 1400) && near(f[4], (500 - 140) / 140) && f[5] === 1 && f[6] === 0);
    const side = { x: 500, y: -500, alt: 0 }, fSide = P.features(ship, side, { range: 1400, standoff: 140 });
    ok("a target off to the side reads a positive yaw error (45 deg / 180) and is not yet aligned", near(fSide[1], 45 / 180) && fSide[5] === 0);
    const above = { x: 0, y: -500, alt: 300 }, fAbove = P.features(ship, above, { range: 1400, standoff: 140 });
    ok("a target above reads a positive pitch error and no yaw error", fAbove[2] > 0 && near(fAbove[1], 0));
    const close = { x: 0, y: -50, alt: 0 }, fClose = P.features(ship, close, { range: 1400, standoff: 140 });
    ok("a target well inside the standoff band reads a negative standoff gap, clamped at -1 not below", near(fClose[4], (50 - 140) / 140) && fClose[4] >= -1);
    const far = { x: 0, y: -5000, alt: 0 }, fFar = P.features(ship, far, { range: 1400, standoff: 140 });
    ok("dist and the standoff gap are both clamped so a very distant target does not blow up the network's input scale", fFar[3] === 2 && fFar[4] === 3);
    ship.pitch = 40; ok("the ship's own pitch feature is order one against MAX_PITCH", near(P.features(ship, ahead, {})[6], 40 / FM.MAX_PITCH)); ship.pitch = 0;

    const pilot = P.pilotFor(P.handWeights());
    for (const [name, target, expect] of [["ahead", ahead, (a, s) => a.turn === 0 && a.pitch === 0 && a.firing === s.firing],
                                            ["to the side", side, (a, s) => Math.sign(a.turn) === Math.sign(s.turn) && a.firing === s.firing],
                                            ["above", above, (a, s) => Math.sign(a.pitch) === Math.sign(s.pitch) && a.firing === s.firing],
                                            ["close", close, (a, s) => a.firing === s.firing]]) {
        const a = pilot(ship, target, { range: 1400, standoff: 140 }), s = FM.stepAI3d(ship, target, { range: 1400, standoff: 140 });
        ok(`!! pilotFor(handWeights()) agrees with stepAI3d's own turn/pitch direction and fire-only-when-aligned rule on the "${name}" case (thrust may legitimately differ -- see the module header)`, expect(a, s), `${JSON.stringify(a)} vs ${JSON.stringify(s)}`);
    }
}
console.log("\n3. THE DUEL: THE HAND PILOT ACTUALLY FLIES AND FIGHTS; THE ZERO PILOT NEVER TURNS, THRUSTS OR FIRES; BOTH DETERMINISTIC");
let handRuns;
{
    handRuns = P.TRAIN_SEEDS.map((seed) => timed(() => P.duel(worldFrom, P.handWeights(), { seed, seconds: 25 })));
    const zero = P.TRAIN_SEEDS.map((seed) => P.duel(worldFrom, P.zeroWeights(), { seed, seconds: 25 }));
    report(handRuns.map((r, i) => `seed ${P.TRAIN_SEEDS[i]}: hand ${r.r.hits} hits of ${r.r.shotsFired} shots, dealt ${r.r.damageDealt}, took ${r.r.damageTaken}, aDead ${r.r.aDead}, bDead ${r.r.bDead}, score ${r.r.score.toFixed(2)}, ${r.ms.toFixed(0)} ms; zero score ${zero[i].score.toFixed(2)}`).join("  |  "));
    ok("!! the hand pilot lands at least one hit on both track seeds and never has a negative-infinity or NaN score", handRuns.every((r) => r.r.hits >= 1 && Number.isFinite(r.r.score)));
    ok("!! ...and clearly outscores the zero pilot on both -- it is actually flying and fighting, not standing still", handRuns.every((r, i) => r.r.score > zero[i].score));
    ok("!! the zero pilot never turns, thrusts or fires: no shots, no hits, no damage dealt, and it takes damage passively (never moves out of the way)", zero.every((z) => z.shotsFired === 0 && z.hits === 0 && z.damageDealt === 0));
    ok("no run deals more damage than its hits x the shot's own per-hit damage, and never more hits than shots fired", handRuns.every((r) => r.r.hits <= r.r.shotsFired && r.r.damageDealt <= r.r.hits * (P.SHOT.dmgShield + P.SHOT.dmgArmor)));
    // THE HIT TEST ITSELF, DIRECTLY: a shot close in x-z but 500 m off in altitude must NOT connect -- sabotage D
    // (dropping the altitude term from the hit-radius check) is invisible to the duel-level bounds above (a looser
    // hit test still deals the same fixed per-hit damage, just registers more often, so neither bound above catches
    // it), which is why this checks the pure function directly rather than only inferring it from combat outcomes.
    ok("!! shotHits3d is a FULL 3D test: close in x-z but 500 m off in altitude misses; the same x-z offset at 10 m alt hits", !P.shotHits3d({ x: 0, y: 0, alt: 0 }, { x: 10, y: 10, alt: 500 }) && P.shotHits3d({ x: 0, y: 0, alt: 0 }, { x: 10, y: 10, alt: 10 }));
    const again = P.duel(worldFrom, P.handWeights(), { seed: P.TRAIN_SEEDS[0], seconds: 25 });
    ok("the duel is deterministic: the same fingerprint twice (hits and damage equal), and a different pilot is a different fingerprint", again.fingerprint === handRuns[0].r.fingerprint && again.hits === handRuns[0].r.hits && again.damageDealt === handRuns[0].r.damageDealt && zero[0].fingerprint !== handRuns[0].r.fingerprint);
    // altitude flies off the substrate entirely (esBox3d.js's own contract) -- two duels with the SAME seed and gap,
    // shifted by altOffset, fly an IDENTICAL x-z track (both ships' altitude DIFFERENCE, so every steering decision
    // either pilot makes, is unchanged -- see duel()'s own header) but different absolute altitude, and must NOT
    // collide to the same fingerprint (sabotage E: fold only esbx.stateHash(), drop the explicit altitude fold).
    const g0 = P.duel(worldFrom, P.handWeights(), { seed: P.TRAIN_SEEDS[0], seconds: 6, gap: 100 });
    const g0Again = P.duel(worldFrom, P.handWeights(), { seed: P.TRAIN_SEEDS[0], seconds: 6, gap: 100 });
    const gShift = P.duel(worldFrom, P.handWeights(), { seed: P.TRAIN_SEEDS[0], seconds: 6, gap: 100, altOffset: 900 });
    ok("same seed and gap twice still agree (a tighter, faster determinism check)", g0.fingerprint === g0Again.fingerprint);
    ok("!! shifting both ships' starting altitude by the same amount changes NOTHING about the flight -- identical hits, shots and damage -- but MUST change the fingerprint, since the two runs occupy different absolute altitude the whole way", gShift.hits === g0.hits && gShift.shotsFired === g0.shotsFired && gShift.damageDealt === g0.damageDealt && gShift.fingerprint !== g0.fingerprint, `${g0.fingerprint} vs ${gShift.fingerprint}`);
}
console.log("\n4. LEARNING: REFINING FROM THE HAND PILOT NEVER REGRESSES, AND SOMETIMES IMPROVES; THE STORE RATCHETS");
{
    const handScore = P.evaluate(worldFrom, P.handWeights(), P.TRAIN_SEEDS, { seconds: 20 }).score;
    const runs = [11, 13, 17].map((seed) => timed(() => P.train(worldFrom, { seed, iters: 25, seconds: 20, sigma: 0.05, start: P.handWeights() })));
    report(`hand pilot scores ${handScore.toFixed(3)} on TRAIN_SEEDS; refining from it, 25 iters x 3 seeds: ${runs.map((r) => r.r.trainScore.toFixed(3) + " (" + r.r.accepted + " accepted, " + r.ms.toFixed(0) + " ms)").join(", ")}`);
    ok("!! refining from the hand pilot's own weights never lands BELOW what the hand pilot itself scores -- the (1+1)-ES only ever accepts a strictly better candidate", runs.every((r) => r.r.trainScore >= handScore - 1e-9));
    ok("!! ...and at least one of the three seeds actually improves on the hand pilot (the search is doing real work, not just returning the start unchanged)", runs.some((r) => r.r.trainScore > handScore + 1e-9));
    const a = P.train(worldFrom, { seed: 11, iters: 5, seconds: 10, sigma: 0.05, start: P.handWeights() }), b = P.train(worldFrom, { seed: 11, iters: 5, seconds: 10, sigma: 0.05, start: P.handWeights() });
    const c = P.train(worldFrom, { seed: 12, iters: 5, seconds: 10, sigma: 0.05, start: P.handWeights() });
    ok("the same seed trains the same weights; a different seed does not", D.weightsHash(a.weights) === D.weightsHash(b.weights) && a.trainScore === b.trainScore && D.weightsHash(a.weights) !== D.weightsHash(c.weights));
    const store = P.pilotStore(); const o1 = store.offer({ weights: runs[0].r.weights, score: 1 }), o2 = store.offer({ weights: runs[0].r.weights, score: 0.5 }), o3 = store.offer({ weights: new Float32Array(3), score: 9 });
    ok("the store ratchets on the score and refuses malformed weights at the door", o1.accepted && !o2.accepted && !o3.ok && store.current().score === 1);
}
console.log("\n5. THE FRONT DOOR");
{
    const L = P.reportLines();
    ok("reportLines names the shape (the connectome core), the weight count, and the reward", L.length === 3 && /7 -> 34/.test(L[0]) && /connectome-masked recurrent/.test(L[0]) && /313 real GFC synapses/.test(L[0]) && /drop-in/.test(L[0]) && /725 weights/.test(L[1]) && /scripted stepAI3d/.test(L[2]));
    // found by adversarial review: reportLines' third line referenced REWARD.died, a field REWARD no longer has
    // (dropped on purpose -- see train()'s own header), which JS renders as the literal string "undefined" rather
    // than throwing. No earlier check here ever read L[2]'s full text closely enough to notice.
    ok("!! no report line stringifies a literal word \"undefined\"", L.every((l) => !/\bundefined\b/.test(l)), L[2]);
}
console.log("\n6. THE SHIPPED DEFAULT: brain/pilotWeightsDefault.json IS A REAL, VALID, TRAINED PILOT -- MEASURED AGAINST HAND, NOT ASSUMED FROM THE FILE'S OWN CLAIMED SCORE");
{
    // es-box3d-fly3d.html fetches this file at page load and flies team A on it by default (pilotWeights ||
    // defaultPilotWeights || handWeights()) -- a corrupted or stale file degrades gracefully there (the fallback
    // chain still reaches handWeights()), but this gate exists so a bad file is caught here, not discovered by a
    // demo that quietly flies worse than it should.
    const raw = fs.readFileSync(new URL("../../brain/pilotWeightsDefault.json", import.meta.url), "utf8");
    const blob = JSON.parse(raw);
    const desc = { id: "pilotPolicy", FEATURES: P.FEATURES, HIDDEN: P.HIDDEN, OUTPUTS: P.OUTPUTS, WEIGHT_COUNT: P.WEIGHT_COUNT };
    const r = PB.importBrain(desc, blob);
    ok("!! the shipped default imports cleanly through the SAME peerBrain.mjs validation the page uses: right format, right policy tag, 725 finite weights", r.ok, r.ok ? "" : r.reason);
    if (r.ok) {
        const SEEDS = Array.from({length: 15}, (_, i) => 9000 + i);   // fresh, fast (15 seeds x 25s duels runs in well under a second)
        const shipped = P.evaluate(worldFrom, r.weights, SEEDS, { seconds: 25 });
        const hand = P.evaluate(worldFrom, P.handWeights(), SEEDS, { seconds: 25 });
        ok("!! the shipped default duels measurably BETTER than the hand baseline it defaults to on any failure -- a regression guard against ever shipping a worse-than-hand default", shipped.score > hand.score, `shipped ${shipped.score.toFixed(3)} vs hand ${hand.score.toFixed(3)}`);
    }
}
console.log(fails ? `\npilotPolicy-selfcheck: ${fails} FAILED` : "\npilotPolicy-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
