// WebGLEngine/render/spaceDuelCore-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/spaceDuelCore-selfcheck.mjs      (about twenty seconds: a dozen fights)
//
// WHAT space-duel.html KNOWS, HELD WITHOUT A PAGE. render/spaceDuelCore.mjs is the catalogue of hands and helms a side can be given, the side a choice makes, and a brain/battleshipDuel.mjs fight stepped and read a frame at a time. Six things hold it:
//
//   1  THE CATALOGUES       six hands, three helms, five brain files; every file a catalogue names is in FILES, is on disk, and is a brain for the policy and module FILES says; every entry says what it is not
//   2  A FILE IS CHECKED    weightsOf gives the file's weights; a name that is not a file, a file not loaded, and a file for another policy are refused with a reason that names the file
//   3  A SIDE IS ITS CHOICE each hand puts the right module and weights in the seats (none for the rule; the car's own hand weights for `car`; the trained file's for `car-trained`), each helm the right rule and network; sights and cannon pass; a bad hand, helm or file is refused by name
//   4  THE FIGHT IS THE DUEL stepped to its end here it is battleshipDuel.duel() of the same sides to the bit; step() says how many ticks it stepped and steps none when the fight is done
//   5  THE SNAPSHOT         the tally's numbers untouched (its `rounds` are still the rounds FIRED a side) plus the drawing's: a craft for a craft, thirteen seats a ship with the seat's own angles, `firing` exactly when the seat's count rose in the last tick, `working` exactly while its mount stands,
//                           `net` exactly where a network sits, the rounds in flight, the cannon's charge (none without a cannon), the networks asked this tick
//   6  THE FRONT DOOR       the export list and the report
//
// SABOTAGE LOG: (18 mutants, each applied to a COPY of render/spaceDuelCore.mjs with a copy of this gate importing it, the copies deleted by name; the number is how many rows went red):
//   C1 the fish's file is the fruit fly's 5 | C2 the untrained car seats the trained file 1 | C3 a file is not checked 2 | C4 the trained helm corrects the broadside rule 2 | C5 the cannon is always on 3 | C6 the sights are always regular 1 | C7 a bad hand is the rule 1
//   C8 the helm's network is dropped 1 (a section that THREW: red by the section's own row) | C9 the peak is not kept 2 | C10 the tick's count is not reset 2 | C11 a finished fight steps on 1 | C12 firing is any round ever fired 1 | C13 a shot-out mount still works 1 | C14 net is every seat 1
//   C15 the rounds in flight overwrite the rounds fired 3 | C16 the arena's arrays are handed out 1 | C17 no cannon shows the never 1 | C18 the escorts are not passed 2
// ONE WENT 0 RED THE FIRST TIME AND WAS A GAP IN THE GATE, closed and re-run: C11 -- in every natural fight the escorts are dead before a flagship is, so 'the arena is over' and 'a side has no capital ship' were the same tick (a flagship is now struck out by hand with its escorts flying).
// TWO OF THE MUTANTS ARE MISTAKES THIS FILE'S FIRST DRAFT REALLY MADE, found by running it and not by the gate: C15 (the snapshot's rounds in flight took the name of the tally's rounds fired) and a seat's mount looked up by the seat's id where the ship lists it by the seat's place (C13's row holds that one).
// NOT CHECKED HERE: anything drawn (tools/ship/spaceDuelPage-selfcheck.mjs, in a browser).
"use strict";
import fs from "node:fs";
import * as C from "./spaceDuelCore.mjs";
import * as D from "../brain/battleshipDuel.mjs";
import * as SA from "../brain/spaceArena.mjs";
import * as PB from "../brain/peerBrain.mjs";
import * as SG from "../brain/seatGunnerPolicy.mjs";
import * as SM from "../brain/seatGunnerMlp.mjs";
import * as SF from "../brain/seatGunnerFish.mjs";
import * as ST from "../brain/seatTurretGunner.mjs";
import * as HP from "../brain/helmPolicy.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const disk = (p) => JSON.parse(fs.readFileSync(new URL("../" + p, import.meta.url), "utf8")), FILES = Object.fromEntries(Object.entries(C.FILES).map(([k, f]) => [k, disk(f.path)]));

console.log("spaceDuelCore-selfcheck -- what space-duel.html knows, without a page\n");

console.log("1. THE CATALOGUES");
section(() => {
    ok("six hands (rule, gpu, fly, fish, car, car-trained), three helms (face, broadside, trained), five files; the four sights, the four starts and the fleet limits are the duel's own", C.HANDS.map((h) => h.id).join() === "rule,gpu,fly,fish,car,car-trained" && C.HELMS.map((h) => h.id).join() === "face,broadside,trained" && Object.keys(C.FILES).join() === "fly,gpu,fish,car-trained,helm" && C.GUNNERS.join() === "perfect,ace,regular,green" && C.KINDS === D.KINDS && C.MAX_SHIPS === 4 && C.MAX_ESCORTS === 12 && JSON.stringify(C.DEFAULT_CHOICE) === '{"hand":"rule","helm":"face","gunners":"regular","cannon":true}');
    ok("!! every file a hand or a helm names is in FILES; every FILES entry is on disk and is a brain for the policy AND the module the entry says (peerBrain takes it); the policies are the ones battleshipDuel seats", [...C.HANDS, ...C.HELMS].every((x) => x.file === null || x.file in C.FILES) && Object.entries(C.FILES).every(([k, f]) => PB.importBrain(PB.describePolicy(f.policy, f.mod), FILES[k]).ok && D.PEER_POLICIES[f.policy].mod === f.mod) && C.FILES.fly.mod === SG && C.FILES.gpu.mod === SM && C.FILES.fish.mod === SF && C.FILES["car-trained"].mod === ST && C.FILES.helm.mod === HP);
    ok("every hand and helm has a label and says in a note what it is NOT; the rule and the untrained car need no file; a helm's rule is one the duel has", [...C.HANDS, ...C.HELMS].every((x) => x.label.length > 5 && x.note.length > 20) && C.HANDS.filter((h) => h.file === null).map((h) => h.id).join() === "rule,car" && C.HELMS.every((h) => D.HELM_RULES.includes(h.rule)) && C.HELMS.find((h) => h.id === "trained").rule === "face");
});

console.log("2. A FILE IS CHECKED");
section(() => {
    const w = C.weightsOf("fish", FILES);
    ok("weightsOf gives a loaded file's weights (a Float32Array of the file's own numbers) and who made it", w.ok && w.weights instanceof Float32Array && w.weights.length === 700 && w.weights.join() === Float32Array.from(FILES.fish.weights).join() && w.by === FILES.fish.by);
    ok("!! refused with a reason that names the file: a name that is no file; a file that was not loaded; the fruit fly's file handed in as the fish's (another policy); a file a weight short", /no brain file is called "zebra"/.test(C.weightsOf("zebra", FILES).reason) && /brain\/seatGunnerFishWeightsDefault\.json was not loaded/.test(C.weightsOf("fish", {}).reason) && /brain\/seatGunnerFishWeightsDefault\.json: this brain is for "seatGunnerPolicy"/.test(C.weightsOf("fish", { fish: FILES.fly }).reason) && /brain\/helmWeightsDefault\.json: weight count 929/.test(C.weightsOf("helm", { helm: { ...FILES.helm, weights: FILES.helm.weights.slice(1) } }).reason) && !C.weightsOf("fish", null).ok);
});

console.log("3. A SIDE IS ITS CHOICE");
section(() => {
    const s = (c) => C.sideOf("X", c, FILES), w = (k) => Float32Array.from(FILES[k].weights).join();
    ok("!! each hand: the rule seats no network; gpu, fly and fish seat their module with their file's weights; `car` seats brain/seatTurretGunner.mjs with the CAR'S OWN hand weights and no file; `car-trained` the same module with the trained file's, which are not the hand weights", s({ hand: "rule" }).network === null && s({ hand: "gpu" }).network.module === SM && s({ hand: "gpu" }).network.weights.join() === w("gpu") && s({ hand: "fly" }).network.module === SG && s({ hand: "fly" }).network.weights.join() === w("fly") && s({ hand: "fish" }).network.module === SF && s({ hand: "fish" }).network.weights.join() === w("fish")
        && s({ hand: "car" }).network.module === ST && s({ hand: "car" }).network.weights.join() === ST.handWeights().join() && C.sideOf("X", { hand: "car" }, {}).network.module === ST && s({ hand: "car-trained" }).network.module === ST && s({ hand: "car-trained" }).network.weights.join() === w("car-trained") && w("car-trained") !== ST.handWeights().join());
    ok("each helm: `face` and `broadside` are the two rules with no network; `trained` is the helm network with the file's weights CORRECTING THE BOW-ON RULE; the sights and the cannon pass; what is left out is the default choice", s({ helm: "face" }).helmRule === "face" && s({ helm: "face" }).helmNet === null && s({ helm: "broadside" }).helmRule === "broadside" && s({ helm: "broadside" }).helmNet === null && s({ helm: "trained" }).helmRule === "face" && s({ helm: "trained" }).helmNet.module === HP && s({ helm: "trained" }).helmNet.weights.join() === w("helm")
        && s({ gunners: "green" }).gunners === "green" && s({ cannon: false }).cannon === false && s({}).cannon === true && s({}).gunners === "regular" && s({}).network === null && s({}).id === "X");
    ok("!! refused by name: a hand that is not in the catalogue, a helm that is not, a hand whose file was not loaded, a helm whose file is another policy's", throwsWith(() => s({ hand: "laser" }), /side "X": no hand "laser" \(rule, gpu, fly, fish, car, car-trained\)/) && throwsWith(() => s({ helm: "ram" }), /side "X": no helm "ram" \(face, broadside, trained\)/) && throwsWith(() => C.sideOf("B", { hand: "gpu" }, {}), /side "B": brain\/seatGunnerMlpWeightsDefault\.json was not loaded/) && throwsWith(() => C.sideOf("B", { helm: "trained" }, { helm: FILES.fly }), /side "B": brain\/helmWeightsDefault\.json: this brain is for "seatGunnerPolicy"/));
});

console.log("4. THE FIGHT IS THE DUEL");
section(() => {
    for (const setup of [{ seed: 2, kind: "crossing", a: { hand: "car", helm: "trained" }, b: { hand: "gpu" } }, { seed: 3, kind: "broadside", ships: 2, escorts: 3, a: { hand: "fish", gunners: "green" }, b: { hand: "rule", helm: "broadside", cannon: false } }]) {
        const f = C.createFight(setup, FILES); let stepped = 0, n; while ((n = f.step(77)) > 0) stepped += n;
        const s = f.snapshot(), d = D.duel(f.sides[0], f.sides[1], setup.seed, setup.kind, { ships: setup.ships ?? 1, escorts: setup.escorts ?? 0 });
        ok(`!! ${setup.kind}, seed ${setup.seed}, ${setup.ships ?? 1}+${setup.escorts ?? 0} a side: stepped to its end 77 ticks at a time it is battleshipDuel.duel() of the same sides TO THE BIT -- every number of the tally, the fingerprint and the peak of networks asked; step() counted the fight's ticks and a finished fight steps none`, Object.keys(d).every((k) => JSON.stringify(s[k]) === JSON.stringify(d[k])) && stepped === d.ticks && f.done && f.step(5) === 0 && s.done === true, `${d.fingerprint}, ${d.winner}, peak ${d.brains.peak}`);
    }
    const e = C.createFight({ seed: 4, kind: "chase", escorts: 2 }, FILES); e.step(1); e.build.arena.crafts[1].hp = 0; e.step(1);   // B's flagship struck out by hand: its escorts fly on and the ARENA is not over
    ok("!! a fight is DONE when a side has no capital ship flying, although escorts fly on and the arena itself is not over -- and then it steps no further", e.done && e.build.arena.done === false && e.build.arena.crafts.filter((c) => c.kind === "fighter" && !c.dead).length === 4 && e.step(5) === 0 && e.snapshot().ticks === 2 && e.snapshot().winner === "A");
    const f = C.createFight({}, FILES);
    ok("with nothing said the fight is head-on, seed 1, one ship a side and no escort, the hand gunner behind the bow-on rule on both sides, three minutes; it is not done before it starts and step() with no number steps one tick", f.setup.kind === "head-on" && f.setup.seed === 1 && f.setup.ships === 1 && f.setup.escorts === 0 && f.setup.seconds === 180 && f.build.arena.crafts.length === 2 && f.sides[0].network === null && !f.done && f.step() === 1 && f.snapshot().ticks === 1);
});

console.log("5. THE SNAPSHOT");
section(() => {
    const f = C.createFight({ seed: 3, kind: "head-on", a: { hand: "car", cannon: false }, b: { hand: "rule", cannon: false } }, FILES), a = f.build.arena; let firingOk = true, sawFire = false, askedOk = true, out = null;   // with no cannon the guns have time to shoot a mount out (at tick 1,966 of this fight)
    for (let i = 0; i < 5400 && !f.done; i++) {
        const before = a.crafts.filter((c) => c.seats).map((c) => c.seats.map((q) => q.state.gun.fired)); f.step(1); const s = f.snapshot(), caps = s.crafts.filter((c) => c.kind === "capital");
        caps.forEach((c, k) => c.seats.forEach((q, j) => { const rose = q.fired > before[k][j]; if (q.firing !== rose) firingOk = false; if (rose) sawFire = true; }));
        if (s.askedNow !== f.build.count.tick) askedOk = false;
        if (!out) { const real = a.crafts.filter((c) => c.seats); for (let k = 0; k < real.length && !out; k++) real[k].seats.forEach((q, j) => { if (!out && !real[k].dead && (real[k].partHp.get(real[k].ship.seatPart[j]) ?? 1) <= 0) out = { k, j, snap: f.snapshot() }; }); }
    }
    ok("!! a seat is `firing` exactly in the ticks its count of rounds rose (every seat of both ships, every tick of the fight), seats did fire, and `askedNow` is the networks asked in the tick just stepped", firingOk && sawFire && askedOk);
    ok("!! a seat whose mount was shot out is not `working` while its ship still flies, and its neighbours are", out !== null && out.snap.crafts.filter((c) => c.kind === "capital")[out.k].seats[out.j].working === false && out.snap.crafts.filter((c) => c.kind === "capital")[out.k].seats.some((q) => q.working), out ? `ship ${out.k + 1} seat ${out.j}` : "no mount was shot out in this fight");
    const g = C.createFight({ seed: 3, kind: "broadside", ships: 1, escorts: 2, a: { hand: "car" }, b: { hand: "rule", cannon: false } }, FILES); g.step(150); const s = g.snapshot(), ga = g.build.arena, [A, B] = s.crafts.filter((c) => c.kind === "capital");
    ok("the tally's numbers are untouched -- `rounds` is still the rounds FIRED a side (two numbers), not the rounds in flight, which are `shots` -- and a snapshot is D.tally of the fight as it stands", Array.isArray(s.rounds) && s.rounds.length === 2 && typeof s.rounds[0] === "number" && s.shots.length === ga.rounds.length && s.shots.length > 0 && s.shots.every((r, i) => r.pos.join() === ga.rounds[i].pos.join() && r.team === ga.rounds[i].team) && s.ticks === 150 && s.done === false && s.fingerprint === D.tally(g.build, 0).fingerprint);
    ok("!! a craft for a craft at its own place and attitude (copies: the arena's arrays are not handed out); thirteen seats a ship with the seat's own id, angles and count; `net` in every seat of the side a network works and in none of the other's", s.crafts.length === ga.crafts.length && s.crafts.every((c, i) => c.id === ga.crafts[i].id && c.team === ga.crafts[i].team && c.pos.join() === ga.crafts[i].body.pos.join() && c.pos !== ga.crafts[i].body.pos && c.q.join() === ga.crafts[i].body.q.join()) && A.seats.length === 13 && A.seats.every((q, j) => q.id === ga.crafts[0].seats[j].seat.id && q.yaw === ga.crafts[0].seats[j].state.yaw && q.pitch === ga.crafts[0].seats[j].state.pitch && q.fired === ga.crafts[0].seats[j].state.gun.fired && q.net === true) && B.seats.every((q) => q.net === false) && s.crafts.filter((c) => c.kind === "fighter").length === 4 && s.crafts.filter((c) => c.kind === "fighter").every((c) => c.seats === undefined));
    ok("the cannon's charge is the craft's, out of the ship's twelve seconds; a side with no cannon shows no charge and nothing to fill (not the 'never' that takes it away)", A.chargeFull === 12 && A.charge === Math.min(12, ga.crafts[0].charge) && A.charge > 0 && B.chargeFull === 0 && B.charge === 0 && Number.isFinite(B.charge) && s.hp.join() === [A.hp, B.hp].join());
});

console.log("6. THE FRONT DOOR");
section(() => {
    ok("the report says the catalogues as they are", C.reportLines().length === 2 && C.reportLines()[1].includes("6 hands (rule, gpu, fly, fish, car, car-trained), 3 helms (face, broadside, trained), 5 brain files"));
    ok("the export list", Object.keys(C).sort().join() === "DEFAULT_CHOICE,FILES,GUNNERS,HANDS,HELMS,KINDS,MAX_ESCORTS,MAX_SHIPS,createFight,reportLines,sideOf,weightsOf");
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
