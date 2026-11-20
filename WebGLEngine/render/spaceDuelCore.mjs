// WebGLEngine/render/spaceDuelCore.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHAT space-duel.html KNOWS, WITHOUT A PAGE: the choices a side can be given, the side those choices make, and a fight that is stepped and read a frame at a time. brain/battleshipDuel.mjs is the fight (a ship against a ship); this is the part of its page that is arithmetic, kept out of the page so that a
// node gate holds it and the page is left with drawing.
//
//   HANDS   who works a side's thirteen gun seats: `rule` (the hand gunner), the three CORRECTING networks' shipped files (`fly`: the fruit fly's circuit; `gpu`: the GPU Brain's plain network, run here by its CPU twin; `fish`: the zebrafish circuit -- whose wiring did nothing in training, its file says), and the
//           RACE CAR'S turret gunner laying the gun itself (`car`: the car's own untrained hand weights, no file; `car-trained`: the file trained in a ship's seat on 8 pairs a child; `car-big`: the file the rig trained on 300 pairs a child, which always fires; `track`: brain/seatTrackGunner.mjs, the fly's target-tracking circuit with the car's hand rule on it, untrained, no file). Each says in `note` what it is NOT, in a line a page can show.
//   HELMS   `face` (the arena's rule: the bow on the enemy), `broadside` (the hand rule), `trained` (the trained helm network correcting the bow-on rule -- the only rule it was trained for), `steer` (the helm trained over the fly's steering circuit, brain/helmSteerPolicy.mjs, correcting the bow-on rule), `compass` (the same over the circuit with its inputs, brain/helmCompassPolicy.mjs), `flywired` (brain/flySteering.mjs: the fly's steering circuit wired as the fly wires it, nothing inside it learned, two gains).
//   FILES   the core reads no disk and no network: the page (or a gate) loads the brain files named in FILES and hands the parsed objects in. Each goes through brain/peerBrain.mjs's importBrain against the module it is for; a file that is refused refuses the SIDE, by name and with the reason.
//   PEERS   a side's choice may carry `peer`: brain files as they arrived ([{ name, text }]). They go through brain/peerFleet.mjs (which never throws on a file) and take the seats, the helm and the escorts where they have a brain for them; the catalogue's choice stands for the rest. peerLines() is the report.
//   RATION  `setup.ammo` is battleshipDuel's: the fraction of every gun seat's magazine both sides carry (1 by default: the whole magazines). A snapshot's seat says the rounds it has LEFT.
//   A FIGHT createFight({ seed, kind, ships, escorts, ammo, a, b }, files) -> { step(n), snapshot(), done, build }. step() is battleshipDuel's own loop a tick at a time (finished(), the arena's step, the peak of networks asked); snapshot() is battleshipDuel.tally of the fight AS IT STANDS plus what a page draws:
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
import * as HS from "../brain/helmSteerPolicy.mjs";
import * as SK from "../brain/seatTrackGunner.mjs";
import * as HC from "../brain/helmCompassPolicy.mjs";
import * as FS from "../brain/flySteering.mjs";
import * as FT from "../brain/flyTracking.mjs";
import * as PF from "../brain/peerFleet.mjs";

/** The brain files the page loads, by the name the catalogues below use: a path under brain/ and the policy it must be for. */
export const FILES = Object.freeze({
    fly: Object.freeze({ path: "brain/seatGunnerWeightsDefault.json", policy: "seatGunnerPolicy", mod: SG }),
    gpu: Object.freeze({ path: "brain/seatGunnerMlpWeightsDefault.json", policy: "seatGunnerMlp", mod: SM }),
    fish: Object.freeze({ path: "brain/seatGunnerFishWeightsDefault.json", policy: "seatGunnerFish", mod: SF }),
    "car-trained": Object.freeze({ path: "brain/seatTurretGunnerWeightsDefault.json", policy: "gunnerPolicy", mod: ST }),
    "car-big": Object.freeze({ path: "brain/seatTurretGunnerWeightsBig.json", policy: "gunnerPolicy", mod: ST }),
    "seat-flywired": Object.freeze({ path: "brain/seatFlyWired11WeightsDefault.json", policy: "seatFlyWired11", mod: FT.nearAlways }),
    "seat-flywired-one": Object.freeze({ path: "brain/seatFlyWired11WeightsOne.json", policy: "seatFlyWired11", mod: FT.nearAlways }),
    helm: Object.freeze({ path: "brain/helmWeightsDefault.json", policy: "helmPolicy", mod: HP }),
    "helm-steer": Object.freeze({ path: "brain/helmSteerWeightsDefault.json", policy: "helmSteerPolicy", mod: HS }),
    "helm-compass": Object.freeze({ path: "brain/helmCompassWeightsDefault.json", policy: "helmCompassPolicy", mod: HC }),
    "helm-flywired": Object.freeze({ path: "brain/helmFlyWired3WeightsDefault.json", policy: "helmFlyWired3", mod: FS.third }),
});
export const HANDS = Object.freeze([
    Object.freeze({ id: "rule", label: "hand gunner (the rule)", file: null, note: "no network: the sight's own aim and trigger" }),
    Object.freeze({ id: "gpu", label: "GPU Brain's network (corrects the sight)", file: "gpu", note: "a plain 12-32-32-3 network, run on the CPU here; trained against fighters behind green sights, not against a ship" }),
    Object.freeze({ id: "fly", label: "fruit fly's circuit (corrects the sight)", file: "fly", note: "trained against fighters behind green sights; none of its 313 synapses carries a weight" }),
    Object.freeze({ id: "fish", label: "zebrafish circuit (corrects the sight)", file: "fish", note: "trained against fighters behind green sights; none of its 153 synapses carries a weight, and a random circuit trained to the same weights" }),
    Object.freeze({ id: "car", label: "race car's turret gunner, untrained (lays the gun)", file: null, note: "the car's own hand weights, carried over as they are; on 600 pairs they lead the hand gunner by about 0.1" }),
    Object.freeze({ id: "car-trained", label: "race car's turret gunner, trained in a seat (lays the gun)", file: "car-trained", note: "trained against a ship; on 300 fresh pairs its training bought nothing that could be told from the untrained one" }),
    Object.freeze({ id: "car-big", label: "race car's turret gunner, trained on 300 pairs a child (lays the gun, always fires)", file: "car-big", note: "the one trained gunner shown to beat the rest: +0.85 over the hand gunner on 600 pairs. What it learned is to HOLD THE TRIGGER whenever it has a target; its one synapse does what a trigger bias would" }),
    Object.freeze({ id: "track", label: "fruit fly's target-tracking circuit, untrained (lays the gun)", file: null, note: "281 neurons of the fly's visual pursuit pathway, carrying the race car's hand rule and no weight on any of its 6,589 synapses: untrained, it flies the untrained car's fights to the bit" }),
    Object.freeze({ id: "flywired", label: "the fly's tracking circuit, wired as the fly wires it (lays the gun)", file: "seat-flywired", note: "a target's bearing goes onto the fly's LC10a cells of one eye, each at its own place; the connectome's own weights do the rest and NOTHING inside is learned (two gains outside it are; the trigger is the sight's). its sight keeps a ship it is shooting at instead of re-choosing every tick, and on a FIGHTER the seat is the hand gunner, on a ship the cells also see the target move, and within 45 degrees of the sight's solution the hand lays the gun, and with a target the trigger is held (since 2026-11-20, tools/ship/takeFlyWiredGunnerTrigger.mjs and tools/ship/takeFlyWiredGunnerHold.mjs, takeFlyWiredGunnerHoldSees.mjs, takeFlyWiredGunnerNear.mjs and takeFlyWiredGunnerTune.mjs). ONE SHIP A SIDE with no cannon it leads the hand gunner by 0.75 on 600 pairs; in fleets of three it is level with the hand gunner without the cannon and trails by 0.28 with it; in fleets of three it leads the plain side in every fight flown: by 1.66 with six escort fighters a side and the cannon, by 1.32 and 0.55 without escorts (without and with the cannon), by 0.58 with a quarter of every magazine; against fighters alone by 0.02. BUT IN THIS GUNNER THE CIRCUIT'S SHAPE IS NOT SHOWN TO MATTER: over a sine rule, the cells' places scrambled or no places at all it flies as well (tools/ship/takeFlyWiredGunnerControl.mjs); only a wiring that swings the gun the wrong way loses" }),
    Object.freeze({ id: "flywired-one", label: "the fly's tracking circuit with no hand window (lays the gun itself on a ship; for one ship a side)", file: "seat-flywired-one", note: "the fly-wired gunner with its trigger held and the hand laying only fighters: the circuit lays the gun on a ship all the way (tools/ship/takeFlyWiredOneWindow.mjs). One ship a side under the cannon-aware helm it is level with the car's gunner with the cannon (+0.02) and leads it without (+0.15). NOT for fleets, where the 45-degree window is better" }),
    Object.freeze({ id: "bysize", label: "by the fight: the fly-wired gunner with no hand window one ship a side with nothing else, with its window in a fleet or with escorts", file: null, bySize: Object.freeze({ one: "flywired-one", fleet: "flywired" }), note: "under the cannon-aware helm it led the car's gunner by +0.16 in fleets of two, +0.24 in fleets of three and +0.37 with six escort fighters a side (tools/ship/takeBySizeLoadout.mjs, 300 pairs each); one ship a side with nothing else it was the car's gunner and IS SINCE 2026-11-20 the fly-wired gunner with no hand window (tools/ship/takeFlyWiredOneWindow.mjs: level with the car's with the cannon, +0.15 without), so the hand is FLY-WIRED AT EVERY SIZE. Since 2026-11-20 it takes the fly-wired gunner also one ship a side WITH ESCORTS (tools/ship/takeBySightLoadout.mjs: there the two cannot be told, -0.03 and +0.05; one ship against fighters the fly-wired one leads, +0.01 against PD fighters and +0.13 against the trained pilot's). in fleets of four and without the cannon its pick leads the car's gunner too (+0.27 to +0.54) and is level one ship a side with escorts (tools/ship/takeButtonUntried.mjs). NOT flown rationed one ship a side, nor against the trained pilot's escorts one ship a side" }),
]);
export const HELMS = Object.freeze([
    Object.freeze({ id: "face", label: "bow-on rule", rule: "face", file: null, note: "the arena's own: the bow, and the cannon, on the nearest enemy" }),
    Object.freeze({ id: "broadside", label: "broadside rule", rule: "broadside", file: null, note: "a hand rule; it loses to the bow-on rule in seven pairs of eight" }),
    Object.freeze({ id: "trained", label: "trained helm (corrects the bow-on rule)", rule: "face", file: "helm", note: "on 300 fresh pairs it leads the bow-on rule by 0.38; with no cannon on either side it is no better than the rule; it was not trained for the broadside rule and trails behind it" }),
    Object.freeze({ id: "steer", label: "trained helm over the fly's steering circuit (corrects the bow-on rule)", rule: "face", file: "helm-steer", note: "three weights and no synapse: it throttles back and turns harder about one axis. On 600 pairs it leads the bow-on rule by 0.64 and the other trained helm by 0.20, in the one fight it was trained in; the fly's wiring took no part" }),
    Object.freeze({ id: "compass", label: "trained helm over the fly's steering circuit with its inputs (corrects the bow-on rule)", rule: "face", file: "helm-compass", note: "220 neurons, the compass and the goal cells with the steering cells; what was trained is three weights and no synapse: it throttles back and damps the spin about one axis. On 600 pairs it leads the bow-on rule by 0.47 and cannot be told from the first trained helm; the fly's wiring took no part" }),
    Object.freeze({ id: "flywired", label: "the fly's steering circuit, wired as the fly wires it (corrects the bow-on rule)", rule: "face", file: "helm-flywired", note: "the ship's heading goes into the fly's compass cells and the enemy's bearing into its goal cells; the connectome's own weights do the rest and NOTHING inside is learned (two gains outside it are). it asks whether its ship has a cannon: WITH ONE it leads the bow-on rule by about 1.0 on 600 pairs (three times over), six shuffles of its connections lead by 0.3 or less, and an ideal comparator does no better -- WITH TODAY'S GUNNERS A SINE COMPARATOR DOES AS WELL OR A LITTLE BETTER (tools/ship/takeFlyWiredHelmControl.mjs: the fly less sine -0.06 one ship a side, +0.01 in fleets; a shuffle loses by 2.0), so the fly's wiring is NOT shown to beat a sine; WITHOUT ONE it turns a little the other way and leads by 0.15 (at the gain it has with a cannon it trailed by 0.69); in fleets of three with the cannon it leads by 1.2, and against eight trained-pilot fighters by 0.08" }),
]);
/** LOADOUTS a page offers in one click: a hand, a helm and the cannon (the sights stay as chosen: they are the crew, not the ship). `best`: Keith, 2026-11-18, "a best ship loadout preset"; first the cannon-aware fly-wired helm over the hand gunner,
 *  and since 2026-11-19 over the car's always-firing gunner, as tools/ship/takeBestShipLoadout.mjs decided (read once): under that helm it leads the hand gunner by +0.856 one ship a side with the cannon, +0.322 in fleets with it and +0.547 without, z 9 to 15; and tools/ship/takeBestShipLoadout2.mjs (2026-11-20) kept it, with escorts and rationed, and tools/ship/takeBestShipLoadout3.mjs over the fly gunner under the same helm (it leads in fleets, trails one ship a side). */
export const PRESETS = Object.freeze([
    Object.freeze({ id: "best", label: "best ship", choice: Object.freeze({ hand: "bysize", helm: "flywired", cannon: true }), note: "since 2026-11-20 the cannon-aware fly-wired helm over the gunner picked BY THE FIGHT'S SIZE (tools/ship/takeBySizeLoadout.mjs: +0.16 to +0.37 over the car's gunner in fleets) -- the race car's always-firing gunner one ship a side, the fly-wired gunner in a fleet. Before: the helm over the car's gunner alone, the cannon on: of three gunners flown under this helm it led the others in every fight of two studies -- one ship a side, fleets of three with and without the cannon, with six escort fighters a side, and with a quarter of every magazine (against the plain ship +1.76 one ship a side, +1.72 with escorts and the cannon). and a third study (2026-11-20) kept it over the page's fly gunner under the same helm, which leads it in fleets but trails it one ship a side. rationed and against the trained pilot (tools/ship/takePresetsHard.mjs) both of its gunners lead the plain ship; the fly-wired one leads the car's there, against the pilot's fighters too -- so one ship against fighters this button's car gunner is NOT the better one" }),
    Object.freeze({ id: "fleet", label: "best fleet", choice: Object.freeze({ hand: "flywired", helm: "flywired", cannon: true }), note: "the cannon-aware fly-wired helm over the fly-wired gunner (the hand's last degrees and every fighter, the trigger held), the cannon on: in fleets of three it led the best-ship loadout by +0.18 and with six escort fighters a side by +0.34 (tools/ship/takeBestShipLoadout3.mjs, 300 pairs each), against the plain ship +1.71 and +2.16. NOT for one ship a side, where the best-ship loadout leads it by 0.10" }),
]);
/** `fleet` (2026-11-20, Keith: "1 first"): what tools/ship/takeBestShipLoadout3.mjs read best in fleets -- the cannon-aware helm over the page's fly-wired gunner. */
/** A preset by id, or a refusal by name. */
export function presetOf(id) { const p = PRESETS.find((q) => q.id === id); if (!p) throw new Error(`spaceDuelCore.presetOf: no preset "${id}" (${PRESETS.map((q) => q.id).join(", ")})`); return p; }
/** The rations of the magazines a page offers (battleshipDuel's `ammo`): the whole magazines, and what tools/ship/takeAmmoStudy.mjs flew. */
export const RATIONS = Object.freeze([1, 0.5, 0.25, 0.125, 0.0625]);
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
export function sideOf(id, choice = {}, files = {}, { ships = 1, escorts = 0 } = {}) {
    const c0 = { ...DEFAULT_CHOICE, ...choice }, picked = HANDS.find((h) => h.id === c0.hand), c = picked && picked.bySize ? { ...c0, hand: ships > 1 || escorts > 0 ? picked.bySize.fleet : picked.bySize.one } : c0, hand = HANDS.find((h) => h.id === c.hand),   // a `bySize` hand (2026-11-20) is another hand by the side's ships: `ships` is the fight's
        helm = HELMS.find((h) => h.id === c.helm);
    if (!hand) throw new Error(`spaceDuelCore.sideOf: side "${id}": no hand "${c.hand}" (${HANDS.map((h) => h.id).join(", ")})`);
    if (!helm) throw new Error(`spaceDuelCore.sideOf: side "${id}": no helm "${c.helm}" (${HELMS.map((h) => h.id).join(", ")})`);
    let network = null, helmNet = null;
    if (hand.id === "car") network = { module: ST, weights: ST.handWeights() };
    else if (hand.id === "track") network = { module: SK, weights: SK.handWeights() };
    else if (hand.file) { const r = weightsOf(hand.file, files); if (!r.ok) throw new Error(`spaceDuelCore.sideOf: side "${id}": ${r.reason}`); network = { module: FILES[hand.file].mod, weights: r.weights }; }
    if (helm.file) { const r = weightsOf(helm.file, files); if (!r.ok) throw new Error(`spaceDuelCore.sideOf: side "${id}": ${r.reason}`); helmNet = { module: FILES[helm.file].mod, weights: r.weights }; }
    // A PEER'S FILES (`choice.peer`: [{ name, text }], as they arrived) go through brain/peerFleet.mjs and OVERRIDE the catalogue where they have something to seat: gunners' brains take the seats from `hand`, a helm's brain takes the helm (correcting the rule the helm choice names), pilots' brains fly the escorts.
    // What the files do not decide stays the choice's. A file that is refused seats nothing and refuses nothing else: peerLines() says which and why.
    const F = peerFleet(id, c), s = F ? F.side : null;
    const side = D.makeSide(id, { label: id, gunners: c.gunners, cannon: c.cannon, helmRule: helm.rule, network: s && F.roles.seat ? null : network, seatNetworks: s && F.roles.seat ? s.seatNetworks : null, helmNet: s && F.roles.helm ? s.helmNet : helmNet });
    return s && F.roles.pilot ? Object.freeze({ ...side, pilots: s.pilots }) : side;
}
const peerFleet = (id, c) => (Array.isArray(c.peer) && c.peer.length ? PF.fleet(id, c.peer, { gunners: c.gunners, cannon: c.cannon, helmRule: (HELMS.find((h) => h.id === c.helm) || HELMS[0]).rule }) : null);
/** What a side's peer files came to, in lines a page shows (brain/peerFleet.mjs's fleetLines), or [] when the side has none. Never throws on a file. */
export function peerLines(id, choice = {}) { const F = peerFleet(id, { ...DEFAULT_CHOICE, ...choice }); return F ? PF.fleetLines(F) : []; }

/**
 * A fight to step and read. `setup` is { seed, kind, ships, escorts, seconds, a, b } (a and b are choices). Returns { build, sides, setup, step(n = 1) -> ticks stepped, snapshot(), get done() }.
 */
export function createFight(setup = {}, files = {}) {
    const s = { seed: 1, kind: "head-on", ships: 1, escorts: 0, seconds: D.SECONDS, ammo: 1, a: {}, b: {}, ...setup }, sides = [sideOf("A", s.a, files, { ships: s.ships, escorts: s.escorts }), sideOf("B", s.b, files, { ships: s.ships, escorts: s.escorts })];
    const build = D.build(sides[0], sides[1], s.seed, s.kind, { ships: s.ships, escorts: s.escorts, seconds: s.seconds, ammo: s.ammo });
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
                    seats: c.seats.map((q, k) => ({ id: q.seat.id, name: q.seat.name, yaw: q.state.yaw, pitch: q.state.pitch, fired: q.state.gun.fired, left: q.state.gun.ammo, firing: q.state.gun.fired > (firedBefore.get(q) ?? q.state.gun.fired), working: (c.partHp.get(c.ship.seatPart[k]) ?? 1) > 0 && !c.dead, net: !!(q.decide && q.decide.net), target: q.last ? q.last.target ?? null : null })) } : {}),
            }));
            return { ...t, crafts, shots: a.rounds.map((r) => ({ pos: r.pos.slice(), team: r.team })), askedNow, done: D.finished(build), events: a.events ? a.events.slice() : [] };
        },
    };
    return fight;
}

export function reportLines() {
    return ["[spaceDuelCore] what space-duel.html knows without a page: the hands and helms a side can be given, the side they make, and a ship-against-ship fight stepped and read a frame at a time",
        `  ${HANDS.length} hands (${HANDS.map((h) => h.id).join(", ")}), ${HELMS.length} helms (${HELMS.map((h) => h.id).join(", ")}), ${Object.keys(FILES).length} brain files the page loads, ${PRESETS.length} preset${PRESETS.length === 1 ? "" : "s"} (${PRESETS.map((p) => p.id).join(", ")}); a fight stepped to its end is battleshipDuel.duel() of the same choices`];
}
