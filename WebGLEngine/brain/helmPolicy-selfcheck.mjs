// WebGLEngine/brain/helmPolicy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/helmPolicy-selfcheck.mjs      (~0.2 s)
//
// A NETWORK FOR A CAPITAL SHIP'S HELM, HELD TO WHAT ITS HEADER SAYS. brain/helmPolicy.mjs puts a fruit fly's escape-circuit network (pilot6dofPolicy's, 930 weights) behind the rule that turns the hull and sets the engines, as a CORRECTION to the rule's answer: up to half the hull's torque limit about each axis and up to
// 0.3 of the pods' thrust. This holds the module on its own; the arena's hook is held by brain/spaceArena-selfcheck.mjs, the fight's option by brain/battleshipFight-selfcheck.mjs and the page by tools/ship/battleshipPage-selfcheck.mjs.
//
//   1  THE CONTRACT       the sizes are the 6DOF pilot's (12 features, 34 hidden, 5 outputs, 930 weights) and the fractions are 0.5 and 0.3; the rule is the zero weights (930 of them, a fresh array each call)
//   2  THE FEATURES       the twelve the helm is shown are the 6DOF pilot's for the hull against its enemy, called as the rule calls the autopilot -- worked by hand for three enemies (dead ahead, dead astern, abeam), where the pointing error is nothing, a half turn about z and a quarter turn about z
//   3  THE HELM           with no enemy the rule's answer stands, untouched (the very object) and the network is not asked; with zero weights the answer is the rule's, to the bit, torque and thrust, whatever the enemy; a network whose outputs are set by hand (the output biases) gives the rule plus half the hull's torque limit times the
//                         moment of inertia times tanh(bias) about each axis and 0.3 of the pods' thrust times tanh(bias) on the throttle; the thrust is clamped at 0 and at what the pods give; the corrections are in the BODY frame; and a network that reads a FEATURE (the cosine to the aim, through a hidden unit)
//                         gives a different answer for an enemy ahead and one astern -- it is wired from the features to the outputs, not only from the biases
//   4  THE FACTORY        each ship gets a helm of its own; what one was last shown is not what another was
//   5  THE FRONT DOOR     the export list is pinned and the report lines say real numbers
//
// SABOTAGE LOG (each applied to brain/helmPolicy.mjs, the gate run, the file restored byte for byte; the number is how many rows went red):
//   W1 the rule is not the zero weights 2 | W2 the rule is one shared array 1 | W3 the torque fraction is 1 2 | W4 the throttle fraction is 0.5 4 | W5 the ship thrusts for the enemy (thrustOk opens) 2 | W6 no enemy gives a copy of the rule 1 | W7 the torque is not scaled by the moment of inertia 1
//   W8 the hull limit is 1 1 | W9 the torque correction is subtracted 1 | W10 the thrust may go negative 1 | W11 the pods do not cap the thrust 1 | W12 the throttle is the fifth output 3 | W13 the torques are the next outputs 1 | W14 the network's answer is not kept 2
//   W15 the ships share one helm 1 | W16 the thrust is the throttle's alone 4 | W17 the network is shown the enemy astern as ahead 4
// ONE WENT 0 RED THE FIRST TIME AND WAS A GAP IN THE GATE: W11 (the pods do not cap the thrust) -- the row meant to show the cap used a rule of 400 and a correction of 300 on a cap of 1,000, which never reached it; a rule of 900 does.
// ONE THING THE GATE FOUND ABOUT THE MODULE: the first version passed the ship's gains (kp, kd) to the feature call "so the features are the ship's"; the features do not depend on them (only the rule's torque does), so changing them went 0 red for want of any effect. They are not passed.
"use strict";
import * as H from "./helmPolicy.mjs";
import * as P6 from "./pilot6dofPolicy.mjs";
import * as CS from "../physics/mechanics/capitalShip.mjs";
import * as RB from "../physics/mechanics/rigidBody6dof.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, tol) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const SHIP = CS.createCapitalShip(), body = () => RB.createBody({ mass: SHIP.mass, I: [...SHIP.I] });
const foeAt = (p) => ({ body: { pos: p, vel: [0, 0, 0] } });
const OUT_BASE = H.FEATURES * H.HIDDEN + H.HIDDEN + H.REC_EDGES, B2 = (o) => OUT_BASE + H.HIDDEN * H.OUTPUTS + o;   // the index of output o's bias
const ctx = (foe, o = {}) => ({ body: body(), ship: SHIP, foe, thrustMax: 1500, ...o });

console.log("helmPolicy-selfcheck -- a network for a capital ship's helm\n");

console.log("1. THE CONTRACT");
{
    ok("!! the sizes are the 6DOF pilot's: 12 features, 34 hidden neurons, 5 outputs, 930 weights, three recurrent steps over 313 synapses -- and the names are its feature names and the helm's output names", H.FEATURES === 12 && H.HIDDEN === 34 && H.OUTPUTS === 5 && H.WEIGHT_COUNT === 930 && H.REC_EDGES === 313 && H.REC_STEPS === 3 && H.FEATURES === P6.FEATURES && H.WEIGHT_COUNT === P6.WEIGHT_COUNT && H.FEATURE_NAMES === P6.FEATURE_NAMES && H.OUTPUT_NAMES.join() === "torqueX,torqueY,torqueZ,throttle,unused");
    ok("!! the fractions are half the hull's torque limit and 0.3 of the pods' thrust", H.TORQUE_FRACTION === 0.5 && H.THROTTLE_FRACTION === 0.3);
    const a = H.handWeights(), b = H.handWeights();
    ok("!! the rule is the zero weights: 930 of them, all zero, a fresh array each call (one that is changed does not change the next)", a.length === 930 && a.every((v) => v === 0) && a !== b && (() => { a[5] = 1; return H.handWeights()[5] === 0; })() && H.zeroWeights().length === 930);
}

console.log("\n2. THE FEATURES");
{
    const f = (p) => H.featuresOf(body(), foeAt(p)), ahead = f([500, 0, 0]), astern = f([-500, 0, 0]), abeam = f([0, 300, 0]);
    ok("!! the twelve features are the 6DOF pilot's for the hull and its enemy, worked by hand: an enemy 500 dead ahead is no pointing error, no spin, cosine 1, range 500 over the fire range 300 (1.667), no closing, neither gate; dead astern is a half turn about z (1), cosine -1; 300 abeam a quarter turn (0.5), cosine 0, range 1",
        near(ahead, [1, 0, 0, 0, 0, 0, 0, 1, 500 / 300, 0, 0, 0], 1e-12) && near(astern, [1, 0, 0, 1, 0, 0, 0, -1, 500 / 300, 0, 0, 0], 1e-12) && near(abeam, [1, 0, 0, 0.5, 0, 0, 0, 0, 1, 0, 0, 0], 1e-12), `${ahead.slice(0, 3)} | ${astern.slice(0, 4)}`);
    const moving = { body: { pos: [400, 0, 0], vel: [-20, 0, 0] } }, spinning = body(); spinning.w = [0.5, -1, 4];
    const fm = H.featuresOf(body(), moving), fs = H.featuresOf(spinning, foeAt([500, 0, 0]));
    ok("...the closing speed is over 20 (an enemy coming at 20 closes at 20: feature 1), the spin over 2 and clamped to plus or minus 3 (0.5, -1 and 4 rad/s give 0.25, -0.5 and 2), and the gates are the rule's -- `thrustOk` never opens (the ship does not thrust for the enemy), `aligned` opens inside the fire range when on the aim",
        Math.abs(fm[9] - 1) < 1e-12 && near(fs.slice(4, 7), [0.25, -0.5, 2], 1e-12) && H.featuresOf(Object.assign(body(), { w: [0, 0, 9] }), foeAt([500, 0, 0]))[6] === 3 && H.featuresOf(body(), foeAt([200, 0, 0]))[11] === 1 && H.featuresOf(body(), foeAt([200, 0, 0]))[10] === 0 && H.featuresOf(body(), foeAt([500, 0, 0]))[11] === 0, `closing ${fm[9]}`);
}

console.log("\n3. THE HELM");
{
    const rule = { torque: [100, -200, 300], thrust: 450 }, z = H.helmFor(H.handWeights());
    const none = z(rule, ctx(null));
    ok("!! WITH NO ENEMY THE RULE'S ANSWER STANDS -- the very object, untouched -- and the network was not asked (`last` is null)", none === rule && z.last === null && rule.torque.join() === "100,-200,300" && rule.thrust === 450);
    const one = z(rule, ctx(foeAt([500, 100, 50])));
    ok("!! WITH THE RULE FOR THE WEIGHTS THE ANSWER IS THE RULE'S, TO THE BIT, whatever the enemy and whatever the rule asked: torque and thrust equal for an enemy ahead, astern, above and with a rule that asks for nothing and for everything; and the network WAS asked (`last` holds the features and five zeros)",
        [[500, 100, 50], [-500, 0, 0], [0, 0, 700], [10, 10, 10]].every((p) => [{ torque: [0, 0, 0], thrust: 0 }, rule, { torque: [-1e5, 1e5, 0], thrust: 1500 }].every((r) => { const o = z(r, ctx(foeAt(p))); return o.torque.every((t, i) => t === r.torque[i]) && o.thrust === r.thrust; })) && z.last && z.last.y.every((v) => v === 0) && z.last.x.length === 12 && one.thrust === 450);
    // a network whose outputs are its biases: output o is tanh(bias o)
    const withBias = (b) => { const w = H.zeroWeights(); b.forEach((v, o) => { w[B2(o)] = v; }); return H.helmFor(w); };
    const t = (v) => Math.tanh(v), lim = SHIP.maxAlpha, I = body().I;
    const h = withBias([0.5, -0.25, 1, 0.5, 3]), o = h(rule, ctx(foeAt([500, 0, 0])));
    ok("!! A NETWORK SET BY HAND CORRECTS AS THE HEADER SAYS: output biases 0.5, -0.25, 1 on the torques and 0.5 on the throttle (and 3 on the unused fifth, which is not read) give the rule plus 0.5 x the hull's 0.25 rad/s^2 x the moment of inertia about each axis x tanh(bias), and the thrust plus 0.3 x 1,500 x tanh(0.5) -- the corrections are in the body frame (the moments differ by axis: 53,167, 868,267 and 874,500)",
        near(o.torque, [100 + 0.5 * lim * I[0] * t(0.5), -200 + 0.5 * lim * I[1] * t(-0.25), 300 + 0.5 * lim * I[2] * t(1)], 1e-9) && Math.abs(o.thrust - (450 + 0.3 * 1500 * t(0.5))) < 1e-9 && I[0] !== I[1], `${o.torque.map((v) => v.toFixed(0))} ${o.thrust.toFixed(1)}`);
    const up = withBias([0, 0, 0, 10, 0])(rule, ctx(foeAt([500, 0, 0]))), down = withBias([0, 0, 0, -10, 0])({ torque: [0, 0, 0], thrust: 100 }, ctx(foeAt([500, 0, 0]))), top = withBias([0, 0, 0, 10, 0])({ torque: [0, 0, 0], thrust: 1400 }, ctx(foeAt([500, 0, 0]))), few = withBias([0, 0, 0, 10, 0])({ torque: [0, 0, 0], thrust: 900 }, ctx(foeAt([500, 0, 0]), { thrustMax: 1000 }));
    ok("!! THE THRUST IS CLAMPED TO WHAT THE PODS CAN GIVE: a full throttle correction on the cruise (450) is 450 + 450 = 900; a full correction down on a rule of 100 is 0 and not negative; a full correction up on 1,400 is 1,500 and not 1,850; with two pods (1,000) a rule of 900 and a full correction would be 1,200 and is 1,000 -- the pods left are the most",
        Math.abs(up.thrust - (450 + 450 * t(10))) < 1e-9 && down.thrust === 0 && top.thrust === 1500 && few.thrust === 1000);
    // wired from the features: hidden unit 0 = relu(cosine to the aim), the throttle = that unit
    const w = H.zeroWeights(); w[0 * H.FEATURES + 7] = 1; w[OUT_BASE + 3 * H.HIDDEN + 0] = 2;
    const net = H.helmFor(w), ahead = net(rule, ctx(foeAt([500, 0, 0]))), astern = net(rule, ctx(foeAt([-500, 0, 0]))), expectAhead = 450 + 0.3 * 1500 * t(2);
    ok("!! A NETWORK THAT READS A FEATURE IS WIRED FROM IT: a hidden unit that reads the cosine to the aim (feature 7) into the throttle gives 450 + 450 x tanh(2) = 862.9 for an enemy dead ahead (cosine 1) and the rule's 450 for one dead astern (cosine -1: the unit is a relu, off) -- through the hidden layer, not only the biases",
        Math.abs(ahead.thrust - expectAhead) < 1e-9 && astern.thrust === 450 && ahead.thrust !== astern.thrust, `${ahead.thrust.toFixed(1)} ${astern.thrust}`);
    const last = net.last;
    ok("...and `last` is what it was shown and said at the last ask: the twelve features of that enemy (an enemy astern: feature 7 is -1, feature 3 is 1) and the five outputs (output 3 is 0, the unit being off)", last && last.x.length === 12 && last.x[7] === -1 && last.x[3] === 1 && last.y.length === 5 && last.y[3] === 0);
}

console.log("\n4. THE FACTORY");
{
    const w = H.zeroWeights(); w[0 * H.FEATURES + 7] = 1; w[OUT_BASE + 3 * H.HIDDEN + 0] = 2;
    const f = H.helmFactory(w), a = f(), b = f(), rule = { torque: [0, 0, 0], thrust: 450 };
    a(rule, ctx(foeAt([500, 0, 0]))); b(rule, ctx(foeAt([-500, 0, 0])));
    ok("!! EACH SHIP GETS A HELM OF ITS OWN: two from one factory are two functions, and what one was last shown (an enemy ahead: feature 7 is 1) is not what the other was (astern: -1) -- while a third, never asked, has nothing", a !== b && a.last.x[7] === 1 && b.last.x[7] === -1 && f().last === null);
}

console.log("\n5. THE FRONT DOOR");
{
    ok("!! the export list is pinned: FEATURES, FEATURE_NAMES, HIDDEN, OUTPUTS, OUTPUT_NAMES, REC_EDGES, REC_STEPS, THROTTLE_FRACTION, TORQUE_FRACTION, WEIGHT_COUNT, featuresOf, forward, handWeights, helmFactory, helmFor, layersOf, perturb, reportLines, zeroWeights",
        Object.keys(H).sort().join() === "FEATURES,FEATURE_NAMES,HIDDEN,OUTPUTS,OUTPUT_NAMES,REC_EDGES,REC_STEPS,THROTTLE_FRACTION,TORQUE_FRACTION,WEIGHT_COUNT,featuresOf,forward,handWeights,helmFactory,helmFor,layersOf,perturb,reportLines,zeroWeights", Object.keys(H).sort().join());
    const lines = H.reportLines();
    ok("!! the report lines name the module, say 930 weights and that the rule is the network with none non-zero, and say that NO HELM WAS TRAINED", lines.length === 2 && lines.every((l) => !/NaN|undefined/.test(l)) && /helmPolicy/.test(lines[0]) && /930 weights/.test(lines[1]) && /0 non-zero weights/.test(lines[1]) && /no helm network was trained/.test(lines[1]), lines[1]);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
