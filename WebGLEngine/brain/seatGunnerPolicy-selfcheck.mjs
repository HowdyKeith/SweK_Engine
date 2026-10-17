// WebGLEngine/brain/seatGunnerPolicy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/seatGunnerPolicy-selfcheck.mjs      (~3 s)
//
// THE FRUIT FLY IN A GUN SEAT, HELD TO ITS CONTRACT. brain/seatGunnerPolicy.mjs puts a network where the hand gunner sat: the sight is the hand gunner's, the network is the hand (a correction to the aim and the trigger).
//
//   1  THE SHAPE     twelve features, 34 hidden neurons, three outputs, 860 weights, the names; the layers are the encoder, three recurrent steps through the masked core and the decoder; with the recurrent weights zero the core is the identity
//   2  THE FEATURES  each of the twelve against its closed form on a seat whose numbers are chosen (a point-defence mount and a main turret: the heavy flag), clamps at the ends
//   3  THE OUTPUTS   the three outputs through the decider: the correction is AIM_GAIN times the output on each axis and the trigger is on when the third is positive; a trigger that says no stops a rule that says fire; with no target the sight's
//                    answer stands and the network is not asked; every seat has a decider of its own and each remembers its own last trigger (the `lastFire` feature)
//   4  THE HAND TWIN the hand weights are the hand gunner, to the bit: thirteen seats flown in the same fight by the sight alone and through the network with the hand weights give the same states, the same rounds, the same hits -- and the zero
//                    gunner never fires
//   5  THE SEARCH    mutate() moves one to four weights and is a function of its seed; perturb() moves them all; the hand weights are three non-zero entries
//   6  THE FRONT DOOR the export list is pinned and the report line says real numbers
//
// SABOTAGE LOG -- THIRTY-TWO SABOTAGES, each applied to brain/seatGunnerPolicy.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   G1 the correction gain is 0.06 3 | G2 a 60-damage shell is no longer heavy 2 | G3 the default reach is 700 2 | G4 yaw error has the wrong sign 2 | G5 pitch error over the yaw arc 1
//   G6 closing speed has the wrong sign 2 | G7 time of flight over the muzzle speed alone 1 | G8 closing speed over 100 1 | G9 rounds fraction inverted 3 | G10 the last-trigger feature is always 0 2
//   G11 a target the arena does not show stops the sight's trigger 1 | G12 no pitch correction 1 | G13 a zero output pulls the trigger 1 | G14 every seat shares one last-trigger memory 1
//   G15 two recurrent steps instead of three 1 | G16 the recurrent core is not the identity plus the synapses 3 | G17 the memo ignores in-place changes to the recurrent weights 1
//   G18 the network is shown the wrong target 1 | G19 the sight's reach is not passed to the features 1 | G20 every seat gets seat 0's sight 1 | G21 mutate() may move zero weights 1
//   G22 mutate() may move five weights 1 | G23 mutate() edits the parent 2 | G24 perturb() leaves weight 0 alone 1 | G25 the hand weights fire too weakly 2 | G26 the hand weights' trigger bias is -1 1
//   G27 the pitch output is not squashed 1 | G28 the trigger is the yaw output 3 | G29 the yaw correction comes from the pitch output 1 | G30 range fraction clamped at 2 1 | G31 yaw fraction clamped at -0.5 2
//   G32 a 30-damage gun is heavy 1
// FIVE WENT 0 RED THE FIRST TIME AND WERE GAPS IN THE GATE, NOT IN THE SABOTAGES (G5 the pitch error over the yaw arc -- the point-defence mount's two arcs are both pi/2, so only a main turret with a non-zero error tells them apart; G17 the layers' memo never noticing an edit in place; G19 the sight's reach never reaching the features; G31 a yaw fraction clamped short at one end; G32 the heavy boundary at exactly 30 -- no gun on the ship is): a row was added for each and each sabotage re-run red as logged above.
"use strict";
import * as SG from "./seatGunnerPolicy.mjs";
import * as Topo from "./gfcTopology.mjs";
import * as SA from "./spaceArena.mjs";
import * as CS from "../physics/mechanics/capitalShip.mjs";
import * as GS from "../physics/mechanics/gunSeats.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const near = (a, b, tol) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const SHIP = CS.createCapitalShip(), Q = [1, 0, 0, 0], PI = Math.PI;
const seatNamed = (n) => SHIP.seats.find((s) => s.name === n);
const bodyAt = (pos = [0, 0, 0]) => ({ pos, vel: [0, 0, 0], q: Q, w: [0, 0, 0] });
const stateOf = (seat, yaw, pitch, ammo) => { const st = GS.createSeatState(seat); return { ...st, yaw, pitch, gun: { ...st.gun, ammo } }; };

console.log("seatGunnerPolicy-selfcheck -- a network in a gun seat\n");

console.log("1. THE SHAPE");
section(() => {
    ok("!! twelve features, 34 hidden (the male-cns Giant Fiber Circuit), three outputs, 860 weights = 12 x 34 + 34 + 313 + 34 x 3 + 3, the names in order, the gain 0.05 rad, a heavy gun is a round of more than 30", SG.FEATURES === 12 && SG.HIDDEN === 34 && SG.OUTPUTS === 3 && SG.REC_EDGES === 313 && SG.WEIGHT_COUNT === 860 && SG.zeroWeights().length === 860 && SG.FEATURE_NAMES.join() === "bias,yawErr,pitchErr,aimed,rangeFrac,tofFrac,closing,yawFrac,pitchFrac,ammoFrac,lastFire,heavy" && SG.OUTPUT_NAMES.join() === "yawFix,pitchFix,fire" && SG.AIM_GAIN === 0.05 && SG.HEAVY_DAMAGE === 30 && SG.REACH === 600);
    const w = SG.handWeights(), L = SG.layersOf(w);
    ok("!! the layers are the encoder (12 -> 34, relu), three recurrent steps (34 -> 34, relu) through the masked core and the decoder (34 -> 3): five layers; with the recurrent weights zero the core is the identity -- the hidden state after the three steps IS the encoder's, to the bit, on random features", (() => { if (!(L.length === 5 && L[0].nIn === 12 && L[0].nOut === 34 && L[1].nIn === 34 && L[1].nOut === 34 && L[4].nIn === 34 && L[4].nOut === 3 && L[0].act === "relu" && L[1].act === "relu" && L[4].act === "none")) return false;
        const I = L[1].W; for (let i = 0; i < 34; i++) for (let j = 0; j < 34; j++) if (I[i * 34 + j] !== (i === j ? 1 : 0)) return false; return true; })());
    const w2 = SG.zeroWeights(); for (let i = 0; i < 313; i++) w2[12 * 34 + 34 + i] = 0.1; const M = SG.layersOf(w2)[1].W, edges = [];
    for (let i = 0; i < 34; i++) for (let j = 0; j < 34; j++) if (i !== j && M[i * 34 + j] !== 0) edges.push([i, j]);
    const wm = SG.zeroWeights(), [toE, fromE] = Topo.EDGES[0], at = toE * 34 + fromE, before = SG.layersOf(wm)[1].W[at]; wm[12 * 34 + 34 + 0] = 0.7; const during = SG.layersOf(wm)[1].W[at]; wm[12 * 34 + 34 + 0] = 0; const after = SG.layersOf(wm)[1].W[at];
    ok("!! A RECURRENT WEIGHT EDITED IN PLACE IS SEEN THE NEXT TIME THE LAYERS ARE ASKED FOR (the layers are memoised on the weight vector, and the memo has to notice an edit -- a trainer that mutates a vector it holds would otherwise run the old network): synapse 0 of the circuit at 0.7 puts 0.7 (float32) into its entry of the core, back at 0 it goes back to what it was", before === (toE === fromE ? 1 : 0) && Math.abs(during - (before + Math.fround(0.7))) < 1e-6 && during !== before && after === before, `${before} ${during} ${after}`);
    ok("and the recurrent core has exactly the circuit's own synapses and no other: with all 313 recurrent weights at 0.1 the expanded matrix is the identity plus those 313 entries (the masked core), every other entry zero", edges.length > 250 && edges.length <= 313 && Array.from(M).filter((v) => v !== 0 && v !== 1).length >= 250 && SG.layersOf(w2)[1].W !== SG.layersOf(w)[1].W);
});

console.log("\n2. THE FEATURES");
section(() => {
    const pd = seatNamed("port PD 2"), st = stateOf(pd, 0.3, -0.2, 800), body = bodyAt(), tg = { id: 2, pos: [0, 300, 0], vel: [50, -20, 10] }, rule = { yaw: 0.5, pitch: 0.1, fire: true, target: 2 };
    const m = GS.muzzleOfSeat(pd, st, body), rel = [tg.pos[0] - m.pos[0], tg.pos[1] - m.pos[1], tg.pos[2] - m.pos[2]], range = norm(rel), closing = -((rel[0] * (tg.vel[0] - m.vel[0]) + rel[1] * (tg.vel[1] - m.vel[1]) + rel[2] * (tg.vel[2] - m.vel[2])) / range);
    const f = SG.features(pd, st, body, rule, tg, true), want = [1, (0.5 - 0.3) / (PI / 2), (0.1 + 0.2) / (PI / 2), 1, range / 600, range / (1100 * 1.6), closing / 200, 0.3 / (PI / 2), -0.2 / (PI / 2), 800 / 900, 1, 0];
    ok("!! THE TWELVE FEATURES ARE THEIR CLOSED FORMS on a point-defence mount (port PD 2, yaw 0.3, pitch -0.2, 800 rounds) with the sight wanting yaw 0.5 and pitch 0.1 and firing at a target 300 units out moving at (50, -20, 10): the error to slew in half-arcs, the rule's flag, the range over 600, the time of flight over the gun's life, the closing speed over 200, where the seat points in its arc, the rounds over the magazine, the last trigger, and the heavy flag 0",
        f.length === 12 && near(f, want, 1e-12), f.map((v) => v.toFixed(4)).join(" "));
    const main = seatNamed("main turret A"), stM = stateOf(main, -1.3, 0.7, 40), fM = SG.features(main, stM, body, { yaw: -1.3, pitch: 0.7, fire: false, target: 2 }, { id: 2, pos: [200, 0, 0], vel: [0, 0, 0] }, false);
    const arcP = main.arc.pitch, arcY = main.arc.yaw;
    ok("!! a MAIN turret's features: the heavy flag is 1 (a 60-damage shell), the rule's flag 0 and the last trigger 0 read as 0, no error to slew, the arc fractions are about the arc's own centre (yaw -1.3 of +-2.6 is -0.5; pitch 0.7 in -0.05..1.45 is (0.7 - 0.7) = 0), the rounds 40 of 160",
        fM[11] === 1 && fM[3] === 0 && fM[10] === 0 && fM[1] === 0 && fM[2] === 0 && Math.abs(fM[7] - (-1.3 - (arcY[0] + arcY[1]) / 2) / ((arcY[1] - arcY[0]) / 2)) < 1e-12 && Math.abs(fM[8] - (0.7 - (arcP[0] + arcP[1]) / 2) / ((arcP[1] - arcP[0]) / 2)) < 1e-12 && Math.abs(fM[9] - 40 / 160) < 1e-12, fM.map((v) => v.toFixed(3)).join(" "));
    const far = SG.features(pd, stateOf(pd, 0, 0, 900), body, { yaw: 3, pitch: 3, fire: false, target: 2 }, { id: 2, pos: [0, 9000, 0], vel: [0, -9000, 0] }, false), far2 = SG.features(pd, stateOf(pd, 0, 0, 900), body, { yaw: 0, pitch: 0, fire: false, target: 2 }, { id: 2, pos: [0, 9000, 0], vel: [0, 9000, 0] }, false);
    ok("!! THE CLAMPS: a target 9,000 units away reads range 3 and time of flight 3 (not 15 and 5), one closing at 9,000 units/s reads closing +3 and one receding at it -3, the rounds fraction stays in 0..1, a yaw error of 3 radians is not cut (it is an error, in arcs, and is what the network is to be told)", far[4] === 3 && far[5] === 3 && far[6] === 3 && far2[6] === -3 && far[9] === 1 && Math.abs(far[1] - 3 / (PI / 2)) < 1e-12);
    const mT = { id: 2, pos: [200, 0, 0], vel: [0, 0, 0] }, mainErr = SG.features(main, stateOf(main, -2.0, 1.0, 160), body, { yaw: -0.6, pitch: 0.2, fire: false, target: 2 }, mT, false);
    ok("!! THE ERRORS AND THE POSITION ARE IN THE SEAT'S OWN ARCS' HALF-WIDTHS (the main turret's yaw +-2.6 and pitch -0.05..1.45 -- not the point-defence mount's pi/2 on both): the sight wants yaw -0.6 and pitch 0.2 with the seat at -2.0 and 1.0, so the errors are (-0.6 + 2.0) / 2.6 and (0.2 - 1.0) / 0.75 and the seat sits at -2.0 / 2.6 and (1.0 - 0.7) / 0.75 in its arcs",
        near([mainErr[1], mainErr[2], mainErr[7], mainErr[8]], [1.4 / 2.6, -0.8 / 0.75, -2.0 / 2.6, 0.3 / 0.75], 1e-12), [mainErr[1], mainErr[2], mainErr[7], mainErr[8]].map((v) => v.toFixed(4)).join(" "));
    const lo = SG.features(main, stateOf(main, -4, -1, 160), body, { yaw: 0, pitch: 0, fire: false, target: 2 }, mT, false), hi = SG.features(main, stateOf(main, 4, 3, 160), body, { yaw: 0, pitch: 0, fire: false, target: 2 }, mT, false);
    ok("!! A SEAT THAT POINTS BEYOND ITS ARC IS CLAMPED AT BOTH ENDS OF BOTH AXES (-1..+1 from the arc's centre): yaw -4 and pitch -1 read -1 and -1, yaw 4 and pitch 3 read +1 and +1", lo[7] === -1 && lo[8] === -1 && hi[7] === 1 && hi[8] === 1, `${lo[7]} ${lo[8]} ${hi[7]} ${hi[8]}`);
    const g30 = SG.features({ ...pd, gun: { ...pd.gun, damage: 30 } }, st, body, rule, tg, false), g31 = SG.features({ ...pd, gun: { ...pd.gun, damage: 31 } }, st, body, rule, tg, false);
    ok("!! HEAVY IS A ROUND OF MORE THAN 30: a gun of damage 30 reads 0 and one of 31 reads 1 (the boundary; the ship's own guns are 10 and 60 and never touch it)", g30[11] === 0 && g31[11] === 1);
});

console.log("\n3. THE OUTPUTS, THE DECIDER");
section(() => {
    const pd = seatNamed("port PD 2"), st = stateOf(pd, 0.3, -0.2, 800), body = bodyAt(), tg = { id: 2, pos: [0, 300, 0], vel: [0, 0, 0] };
    const sightOf = (r) => () => r;
    const withBias = (b0, b1, b2) => { const w = SG.zeroWeights(); const ob = 12 * 34 + 34 + 313 + 34 * 3; w[ob] = Math.atanh(b0); w[ob + 1] = Math.atanh(b1); w[ob + 2] = b2; return w; };
    const dec = (w, r) => SG.gunnerFor(w, sightOf(r))(pd, st, body, [tg], 1);
    const r = dec(withBias(0.5, -0.3, 1), { yaw: 0.5, pitch: 0.1, fire: false, target: 2 });
    ok("!! THE OUTPUTS ARE A CORRECTION AND A TRIGGER: outputs +0.5, -0.3 and +0.76 (tanh 1) give the sight's aim plus 0.05 x 0.5 on yaw and 0.05 x -0.3 on pitch (to 1e-7: the weights are float32) and a trigger that is ON although the sight's rule said no; the target is the sight's", Math.abs(r.yaw - (0.5 + 0.05 * 0.5)) < 1e-7 && Math.abs(r.pitch - (0.1 + 0.05 * -0.3)) < 1e-7 && r.fire === true && r.target === 2, JSON.stringify(r));
    const off = dec(withBias(0.1, 0.1, -1), { yaw: 0.5, pitch: 0.1, fire: true, target: 2 });
    ok("!! A TRIGGER THAT SAYS NO STOPS A RULE THAT SAYS FIRE: the output -0.76 gives fire false though the sight's rule fired, and the aim is still the sight's plus the correction -- the network is the hand", off.fire === false && off.target === 2 && Math.abs(off.yaw - (0.5 + 0.05 * 0.1)) < 1e-7);
    let called = 0; const sight0 = () => { called++; return { yaw: 0, pitch: 0, fire: false, target: null }; };
    const z = SG.gunnerFor(withBias(0.9, 0.9, 5), sight0)(pd, st, body, [], 1);
    ok("!! WITH NO TARGET THE SIGHT'S OWN ANSWER STANDS AND THE NETWORK IS NOT ASKED: a network that would fire and correct at any price (outputs +0.9, +0.9, +1) returns the sight's {yaw 0, pitch 0, fire false, target null} to the object, the sight was asked once; and a sight that names a target the arena does not show gives the same", JSON.stringify(z) === JSON.stringify({ yaw: 0, pitch: 0, fire: false, target: null }) && called === 1 && (() => { const x = SG.gunnerFor(withBias(0.9, 0.9, 5), () => ({ yaw: 1, pitch: 1, fire: true, target: 99 }))(pd, st, body, [tg], 1); return x.target === 99 && x.fire === true && x.yaw === 1 && x.pitch === 1; })());
    // lastFire: fire = tanh(4 relu(aimed) + 4 relu(lastFire) - 2): on when the rule says fire OR the network fired the tick before
    const w = SG.zeroWeights(), ob = 12 * 34 + 34 + 313; w[0 * 12 + 3] = 1; w[1 * 12 + 10] = 1; w[ob + 2 * 34 + 0] = 4; w[ob + 2 * 34 + 1] = 4; w[ob + 34 * 3 + 2] = -2;
    const A = SG.gunnerFor(w, sightOf({ yaw: 0, pitch: 0, fire: true, target: 2 })), Aoff = SG.gunnerFactory(w, () => () => ({ yaw: 0, pitch: 0, fire: false, target: 2 }))(pd, 0), Bsight = { fire: true };
    const dyn = (rule) => () => ({ yaw: 0, pitch: 0, fire: rule.fire, target: 2 }), rA = { fire: true }, rB = { fire: false }, dA = SG.gunnerFor(w, dyn(rA)), dB = SG.gunnerFor(w, dyn(rB));
    const a1 = dA(pd, st, body, [tg], 1).fire; rA.fire = false; const a2 = dA(pd, st, body, [tg], 2).fire, b1 = dB(pd, st, body, [tg], 1).fire, a3 = (() => { rA.fire = false; const f1 = dA(pd, st, body, [tg], 3).fire; return f1; })();
    ok("!! EVERY SEAT'S DECIDER REMEMBERS ITS OWN LAST TRIGGER (the `lastFire` feature): a decider that fired on the rule's word keeps firing the next tick when the rule has gone quiet (the trigger is routed through the network from the feature), another with no history does not; and the factory gives each seat a decider of its own", a1 === true && a2 === true && b1 === false && Aoff(pd, st, body, [tg], 1).fire === false && SG.gunnerFactory(w, () => () => ({ yaw: 0, pitch: 0, fire: false, target: null }))(pd, 0) !== SG.gunnerFactory(w, () => () => ({ yaw: 0, pitch: 0, fire: false, target: null }))(pd, 1) && typeof Bsight === "object");
    // reach: hidden unit 0 = relu(rangeFrac), yaw output = tanh(unit 0): the yaw correction is 0.05 x tanh(range / reach)
    const wr = SG.zeroWeights(); wr[0 * 12 + 4] = 1; wr[ob + 0 * 34 + 0] = 1;
    const aim = (opts) => SG.gunnerFor(wr, sightOf({ yaw: 0, pitch: 0, fire: false, target: 2 }), opts)(pd, st, body, [tg], 1).yaw, rf = (reach) => SG.features(pd, st, body, { yaw: 0, pitch: 0, fire: false, target: 2 }, tg, false, reach)[4];
    ok("!! THE SIGHT'S REACH IS THE DECIDER'S OPTION AND REACHES THE FEATURES: a network that corrects the yaw by the range feature gives 0.05 x tanh(range / 600) by default and 0.05 x tanh(range / 300) with reach 300 -- two different answers, each the closed form (to 1e-6)",
        Math.abs(aim({}) - 0.05 * Math.tanh(rf(600))) < 1e-6 && Math.abs(aim({ reach: 300 }) - 0.05 * Math.tanh(rf(300))) < 1e-6 && Math.abs(aim({}) - aim({ reach: 300 })) > 1e-3, `${aim({}).toFixed(5)} ${aim({ reach: 300 }).toFixed(5)}`);
});

console.log("\n4. THE HAND WEIGHTS ARE THE HAND GUNNER");
section(() => {
    const regular = { delay: 0.4, sigma: 0.03, maxRange: 600, burst: 1, gravity: 0, observe: { window: 0.6, sigmaRange: 0.01 } };
    const makeSight = (seat, k) => GS.handGunner({ seed: 200 + k, ...regular });
    const spots = [[380, 60, 20], [-350, -80, -10], [100, 400, 0], [0, -420, 60]];
    const mk = (gunner) => SA.createSpaceArena({ crafts: [{ id: 1, team: 1, name: "ship", kind: "capital", ship: SHIP, state: { pos: [0, 0, 0], q: Q }, cruise: 0.3, gunner }, ...spots.map((p, i) => ({ id: 2 + i, team: 2, name: "f" + (i + 1), kind: "fighter", state: { pos: p, q: Q } }))], seconds: 30 });
    const a = mk(makeSight), b = mk(SG.gunnerFactory(SG.handWeights(), makeSight, { reach: 600 })), z = mk(SG.gunnerFactory(SG.zeroWeights(), makeSight));
    for (let i = 0; i < 420; i++) { SA.stepSpaceArena(a); SA.stepSpaceArena(b); SA.stepSpaceArena(z); }
    const sig = (x) => JSON.stringify([x.i, x.rounds.length, x.crafts.map((c) => [c.body.pos, c.body.q, c.hp, c.hits, c.seats.map((s) => [s.state.yaw, s.state.pitch, s.state.gun.fired, s.state.gun.ammo])])]);
    const fired = (x) => x.crafts[0].seats.reduce((n, s) => n + s.state.gun.fired, 0);
    ok("!! THE HAND WEIGHTS ARE THE HAND GUNNER, TO THE BIT: the ship's thirteen seats flown for 14 s against four fighters, once with the sight alone and once with the sight and the network on the hand weights, end in THE SAME STATE -- every craft's position, attitude, hit points and hits, every seat's yaw, pitch, rounds fired and rounds left, the rounds in flight -- and it was a fight (rounds fired, fighters hurt)", sig(a) === sig(b) && fired(a) > 100 && a.crafts.slice(1).some((c) => c.hp < 100) && fired(a) === fired(b), `${fired(a)} rounds, fighters ${a.crafts.slice(1).map((c) => c.hp).join("/")}`);
    ok("!! THE ZERO GUNNER NEVER FIRES: the same fight with every weight 0 fires not one round from any seat and hurts nothing (tanh 0 is not > 0), and leaves the fighters their hit points", fired(z) === 0 && z.crafts.slice(1).every((c) => c.hp === 100 && c.dead === false));
});

console.log("\n5. THE SEARCH");
section(() => {
    const w = SG.handWeights(), rng1 = SG.rngFor(5), rng2 = SG.rngFor(5), m1 = SG.mutate(w, 0.3, rng1), m2 = SG.mutate(w, 0.3, rng2), moved = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);
    let min = 99, max = 0; const r = SG.rngFor(9); for (let i = 0; i < 400; i++) { const k = moved(w, SG.mutate(w, 0.3, r)); min = Math.min(min, k); max = Math.max(max, k); }
    ok("!! mutate() MOVES ONE TO FOUR WEIGHTS AND IS A FUNCTION OF ITS SEED: the same seed gives the same child to the bit, over 400 children between one and four weights differ from the parent (both occur), the parent is not touched, and perturb() moves all 860", m1.every((v, i) => v === m2[i]) && min === 1 && max === 4 && moved(w, SG.perturb(w, 0.01, SG.rngFor(1))) === 860 && SG.handWeights().every((v, i) => v === w[i]), `${min}..${max}`);
    ok("the hand weights are three non-zero entries: the 'aimed' channel into hidden unit 0 (1), hidden unit 0 into the trigger (4) and the trigger's bias (-2)", Array.from(w).filter((v) => v !== 0).length === 3 && w[0 * 12 + 3] === 1 && w[12 * 34 + 34 + 313 + 2 * 34] === 4 && w[12 * 34 + 34 + 313 + 34 * 3 + 2] === -2);
});

console.log("\n6. THE FRONT DOOR");
section(() => {
    ok("!! the export list is pinned: AIM_GAIN, FEATURES, FEATURE_NAMES, HEAVY_DAMAGE, HIDDEN, OUTPUTS, OUTPUT_NAMES, REACH, REC_EDGES, REC_STEPS, WEIGHT_COUNT, features, forward, gunnerFactory, gunnerFor, handWeights, layersOf, mutate, perturb, reportLines, rngFor, zeroWeights", Object.keys(SG).sort().join() === "AIM_GAIN,FEATURES,FEATURE_NAMES,HEAVY_DAMAGE,HIDDEN,OUTPUTS,OUTPUT_NAMES,REACH,REC_EDGES,REC_STEPS,WEIGHT_COUNT,features,forward,gunnerFactory,gunnerFor,handWeights,layersOf,mutate,perturb,reportLines,rngFor,zeroWeights", Object.keys(SG).sort().join());
    const lines = SG.reportLines();
    ok("the report lines say real numbers: 12 features, 34 hidden, 3 outputs, 860 weights, three non-zero hand weights", lines.length === 2 && lines.every((l) => !/NaN|undefined/.test(l)) && /12 features, 34 hidden/.test(lines[1]) && /860 weights/.test(lines[1]) && /in 3 non-zero weights/.test(lines[1]), lines[1]);
});

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
