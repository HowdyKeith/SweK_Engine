// WebGLEngine/brain/battleshipDuel.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// CAPITAL SHIP AGAINST CAPITAL SHIP: brain/subDuel.mjs for space. brain/battleshipFight.mjs is one ship (or two of ONE side) against the fighters that attack it; nothing in the tree set a ship against a ship, although brain/spaceArena.mjs has always let a capital ship
// be of either team. This is that setup, built ON the arena and not beside it (the arena is not edited): two SIDES, each a ship or a line of ships with its escorts, start in a geometry a seed fixes, fight for up to three minutes, and each side gets the submarine duel's score.
//
//   KINDS       A's flagship is at the origin on the identity attitude (nose +X, deck +Z). B's is 500-800 units away, up to 0.2 rad above or below A's deck plane:
//               head-on    B within 0.3 rad of A's nose, its own nose on A (to within 0.2 rad of yaw): both bows bear, and both cannons
//               broadside  B abeam of A (port or starboard, drawn by the seed), within 0.3 rad of the beam, on A's own heading to within 0.2 rad: both batteries bear and neither cannon
//               crossing   B ahead of A (within 0.3 rad) and beam-on to it (its heading 90 degrees off A's, either way): B has crossed A's T -- B's battery bears, A's bow and A's cannon bear. THE SEATS ARE NOT EQUAL, here most of all
//               chase      B ahead of A (within 0.3 rad) on A's heading: A looks at B's stern
//               Every craft starts AT REST. Because the seats are not equal, pair() flies a geometry TWICE with the sides exchanged and reads the mean, as brain/subTournament.mjs does.
//   A SIDE      { id, label, gunners (battleshipFight's four settings: CHOSEN, NOT MEASURED), network / seatNetworks (a network behind every sight, or the seats and groups named: battleshipFight's rule -- a seat takes the network its own id names, else its group's, else `network`, else the hand rule),
//               helmRule ("face": the arena's own rule, the bow on the nearest enemy | "broadside": the hand rule below), helmNet ({ module, weights }: a brain/helmPolicy.mjs network CORRECTING whichever rule is chosen), cannon (true; false takes the wave-motion cannon away),
//               pilot ({ module, weights }: a 6DOF pilot library with pilotFor, in every escort; null is the PD autopilot) }. makeSide() checks one and refuses a bad one by name.
//   THE BROADSIDE HELM is a HAND RULE, chosen, not trained: the nose is steered to the direction at right angles to the line to the nearest enemy that is nearest where the nose already points (so the ship turns the short way and keeps the side it has), leaned TOWARD the enemy when it is
//               further than BROADSIDE_RANGE (300) and away when nearer -- (range - 300) / 200 radians, clamped to -0.6..0.9 -- through the same PD and the same torque limit as the arena's own rule. The throttle is the rule's. ROLL IS NOT STEERED (the PD points a nose): a ship whose enemy is below its
//               deck cannot bring the main battery to bear and nothing here rolls it over. Said plainly, and counted among what is not here.
//   A FLEET     `ships` (1 to 4 a side, the same for both) puts each side's ships in line abreast, SHIP_SPACING (140) apart at right angles to the flagship's heading in the deck plane, centred on it; `escorts` (0 to 12 a side) puts fighters of each side 60-110 units from its flagship toward the enemy,
//               nose on the enemy, flying the arena's doctrine. Every capital ship of a side has the side's gunners, helm and cannon; each has sights and a helm network of its own.
//   THE SCORE   of a side, subDuel's: the damage its ships dealt to the enemy's CAPITAL ships less what its own took, over the hit points of a side's ships (1,500 each); +KILL_BONUS (0.5) when every enemy capital ship is destroyed, and up to SPEED_BONUS (0.5) more for doing it early
//               (0.5 x the fraction of the time left); -0.5 when every one of its own is. A fight ends when a side has no capital ship flying (escorts alone do not keep it going) or at the time limit. WHO WON is the side whose score is higher by more than DECISIVE (0.05).
//   LIVE BRAINS a NETWORK that is asked for a decision in a tick: a seat's hand, a helm's correction, an escort's pilot. duel() counts them as the fight runs -- `brains.seated` (the networks the two sides brought), `brains.asked` (forward passes over the whole fight), `brains.peak` (the most in one tick). A seat with no
//               target in its arc is not asked, a dead ship's are not, and the hand rules and the PD autopilot are not networks and are not counted. The count wraps each network's forward and changes no arithmetic (the gate flies a fight with and without the wrapping and compares).
//   PEERS' BRAINS sideFromBrains(id, blobs) seats the brains other machines exported (brain/peerBrain.mjs's swek-brain-v1 files): seat gunners (seatGunnerPolicy, seatGunnerMlp, seatGunnerFish) are dealt round the thirteen seats in turn, the first helm (helmPolicy) takes the helm, pilots (pilot6dofPolicy, pilot6dofMlp) are dealt
//               round the escorts in turn; every file goes through importBrain and a refused one is listed with its reason and seats nothing. THIS FILE READS NO NETWORK AND NO DISK: a peer's brain reaches it as a file somebody loaded.
//
// WHAT IS NOT HERE, SAID PLAINLY: a FISH network AT A HELM or flying an escort (brain/seatGunnerFish.mjs is the zebrafish circuit's SEAT; the helm's and the pilot's networks are the fruit fly's circuit, so the brains a side can seat are the fruit fly's, the fish's and the GPU Brain's in a gun seat, the fruit fly's at a helm, the fruit fly's and the GPU Brain's in an escort, and the hand rules on the CPU);
// a helm trained for anything but the bow-on rule with the cannon (brain/helmWeightsDefault.json, by tools/ship/trainHelm.mjs, leads the rule there and TRAILS it correcting the broadside rule or with the cannon taken away: its file says so); a gunner trained AGAINST A SHIP (the two shipped hands were trained against fighters behind the green sight); roll at the helm; fleets of unequal size; a ship-on-ship collision unless `shipCollisions` is passed; the GPU (the networks
// run on the CPU here -- brain/seatGunnerGpu.mjs's batch works on any arena, build()'s included). Every number of the ship is capitalShip.mjs's and INVENTED. Pure: no DOM, no clock, no random; a seed fixes the fight.
"use strict";
import * as SA from "./spaceArena.mjs";
import * as BF from "./battleshipFight.mjs";
import * as CS from "../physics/mechanics/capitalShip.mjs";
import * as GS from "../physics/mechanics/gunSeats.mjs";
import * as RB from "../physics/mechanics/rigidBody6dof.mjs";
import * as AP from "./autopilot6dof.mjs";
import * as PB from "./peerBrain.mjs";
import * as SG from "./seatGunnerPolicy.mjs";
import * as SM from "./seatGunnerMlp.mjs";
import * as SF from "./seatGunnerFish.mjs";
import * as HP from "./helmPolicy.mjs";
import * as P6 from "./pilot6dofPolicy.mjs";
import * as PM from "./pilot6dofMlp.mjs";

export const KINDS = Object.freeze(["head-on", "broadside", "crossing", "chase"]);
export const HELM_RULES = Object.freeze(["face", "broadside"]);
export const SECONDS = 180, RANGE = Object.freeze([500, 800]), SHIP_SPACING = 140, MAX_SHIPS = 4, MAX_ESCORTS = 12;
export const KILL_BONUS = 0.5, SPEED_BONUS = 0.5, LOSS = 0.5, DECISIVE = 0.05;
export const BROADSIDE_RANGE = 300, BROADSIDE_SLOPE = 200, BROADSIDE_LEAN = Object.freeze([-0.6, 0.9]), BROADSIDE_ROLL = 0.25;
/** The policies a peer's brain file may be for, and the role each takes in a side (sideFromBrains). */
export const PEER_POLICIES = Object.freeze({ seatGunnerPolicy: Object.freeze({ mod: SG, role: "seat" }), seatGunnerMlp: Object.freeze({ mod: SM, role: "seat" }), seatGunnerFish: Object.freeze({ mod: SF, role: "seat" }), helmPolicy: Object.freeze({ mod: HP, role: "helm" }), pilot6dofPolicy: Object.freeze({ mod: P6, role: "pilot" }), pilot6dofMlp: Object.freeze({ mod: PM, role: "pilot" }) });

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a, fallback = [1, 0, 0]) => { const n = norm(a); return n > 1e-9 ? [a[0] / n, a[1] / n, a[2] / n] : fallback; };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** The attitude of a hull whose nose is `heading` radians round +Z from +X (toward +Y, the port side of a ship on the identity attitude), deck up. */
export const quatYaw = (heading) => [Math.cos(heading / 2), 0, 0, Math.sin(heading / 2)];

/**
 * Where everything starts, as plain data: { seed, kind, range, bearing, elevation, headingB, a: { ships: [{ pos, q }], escorts: [{ pos, q }] }, b: the same }. `bearing` is B's flagship from A's nose toward A's port, `elevation` up from A's deck plane, `headingB` B's nose round +Z from +X.
 */
export function scenario(seed, kind, { ships = 1, escorts = 0 } = {}) {
    if (!KINDS.includes(kind)) throw new Error(`battleshipDuel.scenario: kind must be one of ${KINDS.join(", ")} (got ${kind})`);
    if (!Number.isInteger(ships) || ships < 1 || ships > MAX_SHIPS) throw new Error(`battleshipDuel.scenario: ships must be a whole number from 1 to ${MAX_SHIPS} a side (got ${ships})`);
    if (!Number.isInteger(escorts) || escorts < 0 || escorts > MAX_ESCORTS) throw new Error(`battleshipDuel.scenario: escorts must be a whole number from 0 to ${MAX_ESCORTS} a side (got ${escorts})`);
    const r = mulberry((seed * 9973 + KINDS.indexOf(kind) * 7919 + 11) >>> 0), u = (lo, hi) => lo + (hi - lo) * r();
    const range = u(RANGE[0], RANGE[1]), elevation = u(-0.2, 0.2), side = r() < 0.5 ? 1 : -1, near = u(-0.3, 0.3), jitter = u(-0.2, 0.2);
    const bearing = kind === "broadside" ? side * Math.PI / 2 + near : near;
    const headingB = kind === "head-on" ? bearing + Math.PI + jitter : kind === "crossing" ? side * Math.PI / 2 + jitter : jitter;
    const posB = [range * Math.cos(elevation) * Math.cos(bearing), range * Math.cos(elevation) * Math.sin(bearing), range * Math.sin(elevation)];
    const line = (centre, heading) => Array.from({ length: ships }, (_, k) => { const off = (k - (ships - 1) / 2) * SHIP_SPACING; return { pos: [centre[0] - Math.sin(heading) * off, centre[1] + Math.cos(heading) * off, centre[2]], q: quatYaw(heading) }; });
    // the escorts: a stream of their own (so a fight without them is the fight it was), 60-110 units from their flagship toward the other, up to 0.4 rad off that line, nose on the other flagship
    const r2 = mulberry((seed * 13 + 5) >>> 0), u2 = (lo, hi) => lo + (hi - lo) * r2();
    const screen = (from, to) => Array.from({ length: escorts }, () => {
        const l = unit(sub(to, from)), az = Math.atan2(l[1], l[0]) + u2(-0.4, 0.4), el = Math.asin(clamp(l[2], -1, 1)) + u2(-0.4, 0.4), d = u2(60, 110), dir = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)], pos = [from[0] + dir[0] * d, from[1] + dir[1] * d, from[2] + dir[2] * d];
        return { pos, q: BF.quatFromX(unit(sub(to, pos))) };
    });
    return { seed, kind, range, bearing, elevation, headingB, a: { ships: line([0, 0, 0], 0), escorts: screen([0, 0, 0], posB) }, b: { ships: line(posB, headingB), escorts: screen(posB, [0, 0, 0]) } };
}

/**
 * The broadside helm (see the header): (rule, ctx) -> { torque, thrust }, the contract of spaceArena's `helmPilot`. With no enemy the rule's answer stands.
 */
export function broadsideHelm({ range = BROADSIDE_RANGE, slope = BROADSIDE_SLOPE, lean = BROADSIDE_LEAN, roll = BROADSIDE_ROLL } = {}) {
    return (rule, { body, ship, foe }) => {
        if (!foe) return rule;
        const los = sub(foe.body.pos, body.pos), d = norm(los), l = unit(los), nose = RB.rotateByQuat(body.q, [1, 0, 0]);
        let across = sub(nose, [l[0] * dot(nose, l), l[1] * dot(nose, l), l[2] * dot(nose, l)]);
        if (norm(across) < 1e-3) across = RB.rotateByQuat(body.q, [0, 1, 0]);   // bow-on or stern-on exactly: turn to port
        across = unit(across);
        const a = clamp((d - range) / slope, lean[0], lean[1]), dir = unit([across[0] * Math.cos(a) + l[0] * Math.sin(a), across[1] * Math.cos(a) + l[1] * Math.sin(a), across[2] * Math.cos(a) + l[2] * Math.sin(a)]);
        const torque = AP.decide(body, { pos: [body.pos[0] + dir[0] * 1000, body.pos[1] + dir[1] * 1000, body.pos[2] + dir[2] * 1000] }, { kp: ship.kp, kd: ship.kd, thrustForce: 0, standoff: 1e9 }).torqueBody.slice();
        // THE ROLL: the main battery fires above the deck only (its pitch arc starts at -0.05 rad), so the deck is rolled toward the enemy until the enemy stands `roll` radians above it -- the same PD about the nose axis. Only once the enemy is off the axis (a bow-on enemy has no side to roll to).
        const lb = RB.rotateByQuat([body.q[0], -body.q[1], -body.q[2], -body.q[3]], l);
        if (roll !== null && Math.hypot(lb[1], lb[2]) > 0.3) torque[0] = body.I[0] * (ship.kp * -Math.sign(lb[1] || 1) * (roll - Math.atan2(lb[2], Math.abs(lb[1]))) - ship.kd * body.w[0]);
        return { torque: CS.limitTorque(ship, torque), thrust: rule.thrust };
    };
}

const isSeatNet = (n) => !!(n && typeof n.module?.gunnerFactory === "function" && n.weights?.length === n.module.WEIGHT_COUNT);
const SEAT_IDS = Object.freeze(CS.createCapitalShip().seats.map((q) => q.id));
/**
 * A side, checked: { id, label, gunners, network, seatNetworks, helmRule, helmNet, cannon, pilot } (see the header). Everything but `id` has a default: regular gunners behind the hand rule, the arena's own helm, the cannon, PD-autopilot escorts.
 */
export function makeSide(id, { label = "", gunners = BF.DEFAULT_GUNNERS, network = null, seatNetworks = null, helmRule = "face", helmNet = null, cannon = true, pilot = null } = {}) {
    if (typeof id !== "string" || !id) throw new Error(`battleshipDuel.makeSide: a side needs an id (got ${id})`);
    const opts = typeof gunners === "string" ? BF.GUNNERS[gunners] : gunners;
    if (!opts || typeof opts !== "object") throw new Error(`battleshipDuel.makeSide: side "${id}": gunners must be one of ${Object.keys(BF.GUNNERS).join(", ")} or a handGunner options object (got ${gunners})`);
    if (!HELM_RULES.includes(helmRule)) throw new Error(`battleshipDuel.makeSide: side "${id}": helmRule must be one of ${HELM_RULES.join(", ")} (got ${helmRule})`);
    if (network !== null && !isSeatNet(network)) throw new Error(`battleshipDuel.makeSide: side "${id}": network must be { module (a seat-gunner library: gunnerFactory and WEIGHT_COUNT), weights (WEIGHT_COUNT of them) }`);
    if (seatNetworks !== null) {
        if (typeof seatNetworks !== "object" || Array.isArray(seatNetworks)) throw new Error(`battleshipDuel.makeSide: side "${id}": seatNetworks must be an object of seat ids and groups to networks`);
        for (const [key, n] of Object.entries(seatNetworks)) {
            if (!SEAT_IDS.includes(key) && !BF.SEAT_GROUPS.includes(key)) throw new Error(`battleshipDuel.makeSide: side "${id}": seatNetworks names "${key}", which is neither a seat (${SEAT_IDS.join(", ")}) nor a group (${BF.SEAT_GROUPS.join(", ")})`);
            if (n !== null && !isSeatNet(n)) throw new Error(`battleshipDuel.makeSide: side "${id}": seatNetworks["${key}"] must be { module, weights } or null`);
        }
    }
    if (helmNet !== null && !(helmNet && typeof helmNet.module?.helmFactory === "function" && helmNet.weights?.length === helmNet.module.WEIGHT_COUNT)) throw new Error(`battleshipDuel.makeSide: side "${id}": helmNet must be { module (a helm library: helmFactory and WEIGHT_COUNT), weights (WEIGHT_COUNT of them) }`);
    if (pilot !== null && !(pilot && typeof pilot.module?.pilotFor === "function" && pilot.weights?.length === pilot.module.WEIGHT_COUNT)) throw new Error(`battleshipDuel.makeSide: side "${id}": pilot must be { module (a 6DOF pilot library: pilotFor and WEIGHT_COUNT), weights (WEIGHT_COUNT of them) }`);
    if (typeof cannon !== "boolean") throw new Error(`battleshipDuel.makeSide: side "${id}": cannon is true or false (got ${cannon})`);
    return Object.freeze({ id, label: label || id, gunners, gunnerOptions: Object.freeze({ ...BF.SHARED, ...opts }), network, seatNetworks, helmRule, helmNet, cannon, pilot, pilots: null });
}
/** The network in a seat of a side, or null for the hand rule: battleshipFight's rule (the seat's own id, else its group, else `network`). */
export function seatNetOf(side, seatId) {
    if (side.seatNetworks) for (const key of [seatId, seatId.split("-")[0]]) if (Object.hasOwn(side.seatNetworks, key)) return side.seatNetworks[key];
    return side.network;
}
/** The networks a side brings to a fight of `ships` ships and `escorts` escorts a side: { seats, helms, pilots, total }. */
export function seatedBrains(side, { ships = 1, escorts = 0 } = {}) {
    const seats = SEAT_IDS.filter((s) => seatNetOf(side, s)).length * ships, helms = side.helmNet ? ships : 0, pilots = side.pilots || side.pilot ? escorts : 0;
    return { seats, helms, pilots, total: seats + helms + pilots };
}

/**
 * The arena of a duel, steppable (spaceArena.stepSpaceArena), with the counter the fight's brains report to: { arena, scenario, sides: [A, B], shipIds: [[A's], [B's]], count: { tick, asked } }. Team 1 is A, team 2 is B; ids run A's ships, B's ships, A's escorts, B's escorts.
 * Options: ships (1), escorts (0), seconds (180), and the arena's own friendlyFire, holdFire, wrecks, impact, crew, shipCollisions (all as battleshipFight passes them, all off by default).
 */
export function build(sideA, sideB, seed, kind, { ships = 1, escorts = 0, seconds = SECONDS, cruise = 0.3, friendlyFire = false, holdFire = true, wrecks = false, impact = 0, crew = false, shipCollisions = false, countBrains = true } = {}) {
    const sc = scenario(seed, kind, { ships, escorts }), count = { tick: 0, asked: 0 }, crafts = [], shipIds = [[], []];
    const asked = () => { count.tick += 1; count.asked += 1; };
    let id = 1;
    [[sideA, sc.a], [sideB, sc.b]].forEach(([side, start], t) => start.ships.forEach((s, k) => {
        const offset = (t + 1) * 1000 + k * 50, sight = (seat, i) => GS.handGunner({ seed: seed * 100 + offset + i, ...side.gunnerOptions });
        const gunner = (seat, i) => {
            const net = seatNetOf(side, seat.id); if (!net) return sight(seat, i);
            const g = net.module.gunnerFactory(net.weights, sight, { reach: side.gunnerOptions.maxRange })(seat, i);
            if (countBrains && g.net) { const f = g.net.forward; g.net = { ...g.net, forward: (w, x) => { asked(); return f(w, x); } }; }
            return g;
        };
        const hand = side.helmRule === "broadside" ? broadsideHelm() : null, net = side.helmNet ? side.helmNet.module.helmFactory(side.helmNet.weights)() : null;
        const helmPilot = hand || net ? (rule, ctx) => { const r = hand ? hand(rule, ctx) : rule; if (!net) return r; if (countBrains) asked(); return net(r, ctx); } : null;
        const hull = CS.createCapitalShip(), ship = side.cannon ? hull : { ...hull, waveGun: { ...hull.waveGun, charge: Infinity } };   // a cannon that never finishes charging is no cannon; the arena is not edited
        shipIds[t].push(id);
        crafts.push({ id: id++, team: t + 1, name: `${side.label} ship ${k + 1}`, kind: "capital", ship, state: s, behaviour: "face", cruise, holdFire, gunner, ...(helmPilot ? { helmPilot } : {}) });
    }));
    [[sideA, sc.a], [sideB, sc.b]].forEach(([side, start], t) => start.escorts.forEach((s, k) => {
        const p = side.pilots ? side.pilots[k % side.pilots.length] : side.pilot, fly = p ? p.module.pilotFor(p.weights) : null;
        crafts.push({ id: id++, team: t + 1, name: `${side.label} escort ${k + 1}`, kind: "fighter", state: s, holdFire, ...(fly ? { pilot: countBrains ? (body, target, o) => { asked(); return fly(body, target, o); } : fly } : {}) });
    }));
    return { arena: SA.createSpaceArena({ crafts, seconds, friendlyFire, wrecks, impact, crew, shipCollisions }), scenario: sc, sides: [sideA, sideB], shipIds, count };
}

/** The score of one side from what its ships dealt and took (hit points of capital ships), whether each fleet is gone, the fraction of the time left when the fight ended and the hit points a side started with (see the header). */
export function scoreFor(dealt, taken, enemyGone, ownGone, timeLeft, hpSide) {
    return (dealt - taken) / hpSide + (enemyGone ? KILL_BONUS + SPEED_BONUS * timeLeft : 0) - (ownGone ? LOSS : 0);
}
const fnv = (h, v) => { F64[0] = v; for (let i = 0; i < 8; i++) h = Math.imul(h ^ U8[i], 0x01000193) >>> 0; return h; };
const F64 = new Float64Array(1), U8 = new Uint8Array(F64.buffer);

/**
 * One fight, flown to its end. Returns { scores: [A, B], score (A's), winner ("A" | "B" | "draw"), hp: [A, B] (the hit points left in each side's capital ships), damage: [dealt by A, dealt by B] (to capital ships), lost: [A's ships destroyed, B's], escortsLost: [A, B], waves: [A, B],
 * rounds: [A, B] (fired from seats), t, ticks, brains: { seated: [A, B], asked, peak, mean (asked per tick) }, fingerprint }. Deterministic. `onTick(arena)` is called after every tick if given.
 */
export function duel(sideA, sideB, seed, kind, opts = {}) {
    const b = build(sideA, sideB, seed, kind, opts), { arena, shipIds, count } = b, ships = opts.ships ?? 1, escorts = opts.escorts ?? 0;
    const caps = shipIds.map((ids) => ids.map((i) => arena.crafts.find((c) => c.id === i))), flying = (t) => caps[t].some((c) => !c.dead);
    let peak = 0;
    while (!arena.done && flying(0) && flying(1)) { count.tick = 0; SA.stepSpaceArena(arena); if (count.tick > peak) peak = count.tick; if (opts.onTick) opts.onTick(arena); }
    const taken = caps.map((cs) => cs.reduce((a, c) => a + c.hpMax - Math.max(0, c.hp), 0)), hpSide = caps[0].reduce((a, c) => a + c.hpMax, 0), gone = [!flying(0), !flying(1)], timeLeft = Math.max(0, 1 - arena.t / arena.seconds);
    const scores = [scoreFor(taken[1], taken[0], gone[1], gone[0], timeLeft, hpSide), scoreFor(taken[0], taken[1], gone[0], gone[1], timeLeft, hpSide)];
    const mates = [1, 2].map((t) => arena.crafts.filter((c) => c.kind === "fighter" && c.team === t));
    let h = 0x811c9dc5; for (const c of arena.crafts) { h = fnv(h, c.hp); for (const v of c.body.pos) h = fnv(h, v); for (const v of c.body.q) h = fnv(h, v); }
    return {
        scores, score: scores[0], winner: scores[0] - scores[1] > DECISIVE ? "A" : scores[1] - scores[0] > DECISIVE ? "B" : "draw",
        hp: caps.map((cs) => cs.reduce((a, c) => a + Math.max(0, c.hp), 0)), damage: [taken[1], taken[0]], lost: caps.map((cs) => cs.filter((c) => c.dead).length), escortsLost: mates.map((m) => m.filter((c) => c.dead).length),
        waves: caps.map((cs) => cs.reduce((a, c) => a + c.waves, 0)), rounds: caps.map((cs) => cs.reduce((a, c) => a + c.seats.reduce((x, s) => x + s.state.gun.fired, 0), 0)),
        t: arena.t, ticks: arena.i, brains: { seated: [seatedBrains(sideA, { ships, escorts }).total, seatedBrains(sideB, { ships, escorts }).total], asked: count.asked, peak, mean: arena.i ? count.asked / arena.i : 0 }, fingerprint: h.toString(16).padStart(8, "0"),
    };
}

/** One geometry flown twice, X in seat A and then in seat B: { first, second (the two duels), lead (X's score less Y's, the mean of the two seats), seat (what seat A was worth: the mean of A's score less B's over the two) }. */
export function pair(X, Y, seed, kind, opts = {}) {
    const first = duel(X, Y, seed, kind, opts), second = duel(Y, X, seed, kind, opts), d1 = first.scores[0] - first.scores[1], d2 = second.scores[0] - second.scores[1];
    return { first, second, lead: (d1 - d2) / 2, seat: (d1 + d2) / 2 };
}

/**
 * A side from the brains peers exported (swek-brain-v1 objects, already parsed): { side, seated: [{ index, policy, by, role, where }], refused: [{ index, reason }] }. `base` is makeSide's options for everything a brain does not decide (gunners, helmRule, cannon).
 * Seat gunners are dealt round the thirteen seats in the order capitalShip lists them (with n of them, seat k takes brain k mod n); the FIRST helm takes the helm and a later one is refused as spare; pilots are dealt round the escorts in turn. Nothing is seated from a file that importBrain refuses.
 */
export function sideFromBrains(id, blobs, base = {}) {
    if (!Array.isArray(blobs)) throw new Error(`battleshipDuel.sideFromBrains: the brains are an array of exported brains (got ${typeof blobs})`);
    const seats = [], pilots = [], seated = [], refused = []; let helm = null;
    blobs.forEach((blob, index) => {
        const kind = blob && typeof blob === "object" && Object.hasOwn(PEER_POLICIES, blob.policy) ? PEER_POLICIES[blob.policy] : null;
        if (!kind) { refused.push({ index, reason: `not a brain for a seat, a helm or a pilot (policy ${JSON.stringify(blob && blob.policy)}; this fight seats ${Object.keys(PEER_POLICIES).join(", ")})` }); return; }
        const r = PB.importBrain(PB.describePolicy(blob.policy, kind.mod), blob);
        if (!r.ok) { refused.push({ index, reason: r.reason }); return; }
        const net = { module: kind.mod, weights: r.weights }, row = { index, policy: blob.policy, by: r.meta.by, role: kind.role, where: [] };
        if (kind.role === "helm") { if (helm) { refused.push({ index, reason: "a side has one helm and an earlier brain took it" }); return; } helm = net; row.where = ["helm"]; }
        else if (kind.role === "seat") seats.push({ net, row }); else pilots.push({ net, row });
        seated.push(row);
    });
    const seatNetworks = seats.length ? {} : null;
    SEAT_IDS.forEach((s, k) => { if (seats.length) { const pick = seats[k % seats.length]; seatNetworks[s] = pick.net; pick.row.where.push(s); } });
    pilots.forEach((p, k) => p.row.where.push(`escort ${k + 1} of every ${pilots.length}`));
    const side = makeSide(id, { ...base, network: null, seatNetworks, helmNet: helm, pilot: null });
    return { side: pilots.length ? Object.freeze({ ...side, pilots: Object.freeze(pilots.map((p) => p.net)) }) : side, seated, refused };
}

export function reportLines() {
    const face = makeSide("face"), beam = makeSide("broadside", { helmRule: "broadside" }), row = (X, Y) => { let w = 0, l = 0, lead = 0; for (const kind of KINDS) for (const seed of [1, 2]) { const p = pair(X, Y, seed, kind); lead += p.lead; w += p.lead > DECISIVE ? 1 : 0; l += p.lead < -DECISIVE ? 1 : 0; } return `${X.id} against ${Y.id}: ${w} pairs won, ${l} lost of 8, mean lead ${(lead / 8).toFixed(3)}`; };
    return ["[battleshipDuel] capital ship against capital ship: four geometries a seed fixes, a side's gunners, helm and cannon, the submarine duel's score, each geometry flown from both seats",
        `  hand rules, regular gunners, seeds 1-2 of each kind: ${row(beam, face)}`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
