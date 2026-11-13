// WebGLEngine/render/spaceDuelCore.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHAT space-duel.html KNOWS, WITHOUT A PAGE: the choices a side can be given, the side those choices make, and a fight that is stepped and read a frame at a time. brain/battleshipDuel.mjs is the fight (a ship against a ship); this is the part of its page that is arithmetic, kept out of the page so that a
// node gate holds it and the page is left with drawing.
//
//   HANDS   who works a side's thirteen gun seats: `rule` (the hand gunner), the three CORRECTING networks' shipped files (`fly`: the fruit fly's circuit; `gpu`: the GPU Brain's plain network, run here by its CPU twin; `fish`: the zebrafish circuit -- whose wiring did nothing in training, its file says), and the
//           RACE CAR'S turret gunner laying the gun itself (`car`: the car's own untrained hand weights, no file; `car-trained`: the file trained in a ship's seat). Each says in `note` what it is NOT, in a line a page can show.
//   HELMS   `face` (the arena's rule: the bow on the enemy), `broadside` (the hand rule), `trained` (the trained helm network correcting the bow-on rule -- the only rule it was trained for).
//   FILES   the core reads no disk and no network: the page (or a gate) loads the brain files named in FILES and hands the parsed objects in. Each goes through brain/peerBrain.mjs's importBrain against the module it is for; a file that is refused refuses the SIDE, by name and with the reason.
//   A FIGHT createFight({ seed, kind, ships, escorts, a, b }, files) -> { step(n), snapshot(), done, build }. step() is battleshipDuel's own loop a tick at a time (finished(), the arena's step, the peak of networks asked); snapshot() is battleshipDuel.tally of the fight AS IT STANDS plus what a page draws:
//           every craft's place and attitude, every seat's angles and whether it fired this tick, the rounds in flight, the cannon's charge. A fight stepped to its end here IS battleshipDuel.duel() of the same choices, to the bit, IN THE SAME ENGINE (the gate compares in node; the page's gate compares in the browser, where Math.log differs from node's in the last place and a fight is another fight).
//
// Pure: no DOM, no clock, no I/O.
"use strict";
import * as D from "../brain/battleshipDuel.mjs";
import * as SA from "../brain/spaceArena.mjs";
import * as BF from "../brain/battleshipFight.mjs";
import * as PB from "../brain/peerBrain.mjs";
import * as SG from "../brain/seatGunnerPolicy.mjs";
import * as SM from "../brain/seatGunnerMlp.mjs";
import * as SF from "../brain/seatGunnerFish.mjs";
import * as ST from "../brain/seatTurretGunner.mjs";
import * as HP from "../brain/helmPolicy.mjs";

/** The brain files the page loads, by the name the catalogues below use: a path under brain/ and the policy it must be for. */
export const FILES = Object.freeze({
    fly: Object.freeze({ path: "brain/seatGunnerWeightsDefault.json", policy: "seatGunnerPolicy", mod: SG }),
    gpu: Object.freeze({ path: "brain/seatGunnerMlpWeightsDefault.json", policy: "seatGunnerMlp", mod: SM }),
    fish: Object.freeze({ path: "brain/seatGunnerFishWeightsDefault.json", policy: "seatGunnerFish", mod: SF }),
    "car-trained": Object.freeze({ path: "brain/seatTurretGunnerWeightsDefault.json", policy: "gunnerPolicy", mod: ST }),
    helm: Object.freeze({ path: "brain/helmWeightsDefault.json", policy: "helmPolicy", mod: HP }),
});
export const HANDS = Object.freeze([
    Object.freeze({ id: "rule", label: "hand gunner (the rule)", file: null, note: "no network: the sight's own aim and trigger" }),
    Object.freeze({ id: "gpu", label: "GPU Brain's network (corrects the sight)", file: "gpu", note: "a plain 12-32-32-3 network, run on the CPU here; trained against fighters behind green sights, not against a ship" }),
    Object.freeze({ id: "fly", label: "fruit fly's circuit (corrects the sight)", file: "fly", note: "trained against fighters behind green sights; none of its 313 synapses carries a weight" }),
    Object.freeze({ id: "fish", label: "zebrafish circuit (corrects the sight)", file: "fish", note: "trained against fighters behind green sights; none of its 153 synapses carries a weight, and a random circuit trained to the same weights" }),
    Object.freeze({ id: "car", label: "race car's turret gunner, untrained (lays the gun)", file: null, note: "the car's own hand weights, carried over as they are; on 600 pairs they lead the hand gunner by about 0.1" }),
    Object.freeze({ id: "car-trained", label: "race car's turret gunner, trained in a seat (lays the gun)", file: "car-trained", note: "trained against a ship; on 300 fresh pairs its training bought nothing that could be told from the untrained one" }),
]);
export const HELMS = Object.freeze([
    Object.freeze({ id: "face", label: "bow-on rule", rule: "face", file: null, note: "the arena's own: the bow, and the cannon, on the nearest enemy" }),
    Object.freeze({ id: "broadside", label: "broadside rule", rule: "broadside", file: null, note: "a hand rule; it loses to the bow-on rule in seven pairs of eight" }),
    Object.freeze({ id: "trained", label: "trained helm (corrects the bow-on rule)", rule: "face", file: "helm", note: "leads the bow-on rule by 0.67 on its audit; trails it without the cannon" }),
]);
export const GUNNERS = Object.freeze(Object.keys(BF.GUNNERS)), KINDS = D.KINDS, MAX_SHIPS = D.MAX_SHIPS, MAX_ESCORTS = D.MAX_ESCORTS;
export const DEFAULT_CHOICE = Object.freeze({ hand: "rule", helm: "face", gunners: "regular", cannon: true });

/** The weights of a named file, checked: { ok, weights } or { ok: false, reason }. */
export function weightsOf(name, files) {
    const f = FILES[name]; if (!f) return { ok: false, reason: `no brain file is called "${name}"` };
    const blob = files && files[name]; if (!blob) return { ok: false, reason: `${f.path} was not loaded` };
    const r = PB.importBrain(PB.describePolicy(f.policy, f.mod), blob);
    return r.ok ? { ok: true, weights: r.weights, by: r.meta.by } : { ok: false, reason: `${f.path}: ${r.reason}` };
}
/** A side from a choice ({ hand, helm, gunners, cannon }; what is left out is DEFAULT_CHOICE's) and the loaded files. Refuses by name: a hand or a helm that is not in the catalogue, and a file that was not loaded or that importBrain refuses. */
export function sideOf(id, choice = {}, files = {}) {
    const c = { ...DEFAULT_CHOICE, ...choice }, hand = HANDS.find((h) => h.id === c.hand), helm = HELMS.find((h) => h.id === c.helm);
    if (!hand) throw new Error(`spaceDuelCore.sideOf: side "${id}": no hand "${c.hand}" (${HANDS.map((h) => h.id).join(", ")})`);
    if (!helm) throw new Error(`spaceDuelCore.sideOf: side "${id}": no helm "${c.helm}" (${HELMS.map((h) => h.id).join(", ")})`);
    let network = null, helmNet = null;
    if (hand.id === "car") network = { module: ST, weights: ST.handWeights() };
    else if (hand.file) { const r = weightsOf(hand.file, files); if (!r.ok) throw new Error(`spaceDuelCore.sideOf: side "${id}": ${r.reason}`); network = { module: FILES[hand.file].mod, weights: r.weights }; }
    if (helm.file) { const r = weightsOf(helm.file, files); if (!r.ok) throw new Error(`spaceDuelCore.sideOf: side "${id}": ${r.reason}`); helmNet = { module: HP, weights: r.weights }; }
    return D.makeSide(id, { label: id, gunners: c.gunners, cannon: c.cannon, helmRule: helm.rule, network, helmNet });
}

/**
 * A fight to step and read. `setup` is { seed, kind, ships, escorts, seconds, a, b } (a and b are choices). Returns { build, sides, setup, step(n = 1) -> ticks stepped, snapshot(), get done() }.
 */
export function createFight(setup = {}, files = {}) {
    const s = { seed: 1, kind: "head-on", ships: 1, escorts: 0, seconds: D.SECONDS, a: {}, b: {}, ...setup }, sides = [sideOf("A", s.a, files), sideOf("B", s.b, files)];
    const build = D.build(sides[0], sides[1], s.seed, s.kind, { ships: s.ships, escorts: s.escorts, seconds: s.seconds });
    let peak = 0, askedNow = 0; const firedBefore = new Map();
    const fight = {
        build, sides, setup: s,
        get done() { return D.finished(build); },
        step(n = 1) {
            let k = 0;
            for (; k < n && !D.finished(build); k++) {
                for (const c of build.arena.crafts) if (c.seats) for (const q of c.seats) firedBefore.set(q, q.state.gun.fired);
                build.count.tick = 0; SA.stepSpaceArena(build.arena); askedNow = build.count.tick; if (askedNow > peak) peak = askedNow;
            }
            return k;
        },
        /** The fight as it stands: battleshipDuel.tally's numbers and, for drawing, { crafts: [{ id, team, kind, name, pos, q, hp, hpMax, dead, charge, chargeFull, waves, seats: [{ id, name, yaw, pitch, fired, firing, working, net, target }] }], shots: [{ pos, team }] (the rounds in flight; `rounds` is the tally's count of rounds fired a side), askedNow, done, events }. */
        snapshot() {
            const a = build.arena, t = D.tally(build, peak);
            const crafts = a.crafts.map((c) => ({
                id: c.id, team: c.team, kind: c.kind, name: c.name, pos: c.body.pos.slice(), q: c.body.q.slice(), hp: Math.max(0, c.hp), hpMax: c.hpMax, dead: !!c.dead,
                ...(c.kind === "capital" ? { charge: Number.isFinite(c.ship.waveGun.charge) ? c.charge : 0, chargeFull: Number.isFinite(c.ship.waveGun.charge) ? c.ship.waveGun.charge : 0, waves: c.waves,
                    seats: c.seats.map((q, k) => ({ id: q.seat.id, name: q.seat.name, yaw: q.state.yaw, pitch: q.state.pitch, fired: q.state.gun.fired, firing: q.state.gun.fired > (firedBefore.get(q) ?? q.state.gun.fired), working: (c.partHp.get(c.ship.seatPart[k]) ?? 1) > 0 && !c.dead, net: !!(q.decide && q.decide.net), target: q.last ? q.last.target ?? null : null })) } : {}),
            }));
            return { ...t, crafts, shots: a.rounds.map((r) => ({ pos: r.pos.slice(), team: r.team })), askedNow, done: D.finished(build), events: a.events ? a.events.slice() : [] };
        },
    };
    return fight;
}

export function reportLines() {
    return ["[spaceDuelCore] what space-duel.html knows without a page: the hands and helms a side can be given, the side they make, and a ship-against-ship fight stepped and read a frame at a time",
        `  ${HANDS.length} hands (${HANDS.map((h) => h.id).join(", ")}), ${HELMS.length} helms (${HELMS.map((h) => h.id).join(", ")}), ${Object.keys(FILES).length} brain files the page loads; a fight stepped to its end is battleshipDuel.duel() of the same choices`];
}
