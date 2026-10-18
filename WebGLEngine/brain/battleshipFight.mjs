// WebGLEngine/brain/battleshipFight.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A CAPITAL SHIP AND THE FIGHTERS THAT ATTACK IT, AS A SCENARIO. physics/mechanics/capitalShip.mjs is the ship (a Yamato-like hull, thirteen gun seats, three engine pods, a fictional cannon -- every number invented); brain/spaceArena.mjs is the fight (the 6DOF page's rigid bodies and
// fighters, steppable, with the ship's gunners in it); this is the setup between them: where the fighters start for a seed and a kind of attack, who sits in the gun seats and how well, and the numbers a fight is summed up in. It builds an ARENA, not a result, so a page can step it and watch;
// fight() runs one to its end and sums it up. The same shape as brain/bomberFight.mjs.
//
//   KINDS      bow      the fighters come from ahead of the ship, anywhere within 0.5 rad (29 degrees) of its nose, 0.5 rad above or below its deck, 350-500 units out
//              beam     from its port or its starboard side (a fighter's side drawn by the seed), within 0.5 rad of the beam, the same height and distance
//              stern    from astern, within 0.5 rad of the tail
//              swarm    from anywhere: the azimuth uniform round the ship, 0.6 rad above or below, 350-500 units out
//              Every fighter starts AT REST with its nose on the ship (the page's fleets start at rest; the shortest-arc turn from +X to the line to the ship), flies the doctrine of brain/spaceArena.mjs (approach a point to one side, strafe past) with the pilot it is given -- the PD autopilot by default -- and fires
//              when the arena lets it (strafing). A seed fixes every number (a Mulberry32 stream); the ship starts at the origin on the identity attitude, nose along +X.
//   GUNNERS    the hand gunner of physics/mechanics/gunSeats.mjs in the same four settings as the bomber's (perfect, ace, regular, green) and THE SETTINGS ARE CHOSEN, NOT MEASURED, SAID AGAIN: nothing here says how a gunner on a capital ship shot. The four are the aim error, the reaction time and, for the three that
//              are not `perfect`, a sight that sees only where the target is (see bomberFight.mjs for the numbers). What every setting is given unless it names its own, because a gun in space and a gun of 1.5 or 6 rounds a second need it: GRAVITY 0, a reach of 600 units, and a one-second BURST on the trigger (gunSeats.handGunner) -- the four presets never name them, a setting of one's own that does keeps its own. Default `regular`.
//   THE FIGHT  the ship is team 1, id 1; the fighters team 2, ids 2..N+1. It FACES the nearest enemy at the hull's own turn limit and cruises at 0.3 of its thrust (brain/spaceArena.mjs; `behaviour` and `cruise` change that). The fight is over when one team is gone or at 120 s.
//   A SECOND SHIP AND AN ESCORT (options, off by default): `ships: 2` is a second capital ship (id N+2, 'second ship', team 1, the same hull, its own gunners) SHIP_SPACING (140) units abeam of the first, the pair centred on the origin where the attackers' geometry is measured from,
//              both on the identity attitude at the same cruise -- a formation at the start, and no more than that BY DEFAULT: they face the enemy each at its own turn limit and the formation does not hold (the gate says how far apart they get: in a 120 s fight, 222 to 583 units). `formation: true` (needs `ships: 2`) makes the second ship KEEP ITS STATION on the first instead -- brain/spaceArena.mjs's behaviour 'station', the slot the starting offset from the first ship's centre, held to within about 40 units over 120 s -- and it costs gunnery, because the second ship no longer turns to the enemy (the gate says by how much). `shipCollisions: true` lets the two ships' hull boxes collide (spaceArena's option: 25 hit points to each at a contact, the fighters' cap). `escorts: n` is n fighters of the SHIP'S side (ids after the second
//              ship, 'escort k', team 1) that start 100-160 units out toward the attackers, at rest, nose out, and fly the page's plain pursuit at the nearest enemy fighter -- they are the PD autopilot, or the `escortPilot` given. Both draw from streams of their own, so a fight without them is the fight it was.
//   A NETWORK PER SEAT (option `seatNetworks`, off by default): `network` puts ONE network in every seat; `seatNetworks` puts a different one where it is asked to -- an object whose keys are a SEAT's id (main-a, pd-p1 ... as capitalShip.mjs lists them) or a GROUP (`main`: the three
//              turrets, `pd`: the ten point-defence mounts) and whose values are a network ({ module, weights }, as `network`) or null (the hand gunner's rule in that seat). A seat takes the network its own id names, else its group's, else `network`, else the rule; a key that is
//              neither a seat nor a group is REFUSED by name. build() hands back `seatHands`, one row per seat: where its hand came from ("seat", "group", "network" or "hand") and the network in it. A second ship's seats take the same assignment (its sights' seeds are its own).
//   A NETWORK AT THE HELM (option `helm`, off by default): `{ module, weights }` -- a helm library (brain/helmPolicy.mjs: `helmFactory` and `WEIGHT_COUNT`) and its weights -- puts a network behind the rule that turns each capital ship and sets its engines, as a CORRECTION to the rule's answer (spaceArena's `helmPilot`); every capital ship gets
//              a helm of its own from the factory. The weights the module calls its hand weights are the zero weights, which correct nothing: a fight with them is the fight with no helm network, to the bit. NO HELM WAS TRAINED. The escorts are fighters and keep the pilots they are given.
// WHAT IS NOT HERE, SAID PLAINLY: a formation or a collision unless asked for (two ships whose paths cross pass through each other by default), a formation of more than two ships, fighters that run out of rounds (the page's do not), and anything the page's own fleet fights are -- the fighters here are the same craft, nothing more. Pure: no DOM, no clock; a seed fixes the fight.
"use strict";
import * as SA from "./spaceArena.mjs";
import * as CS from "../physics/mechanics/capitalShip.mjs";
import * as GS from "../physics/mechanics/gunSeats.mjs";

export const KINDS = Object.freeze(["bow", "beam", "stern", "swarm"]);
export const SHIP_ID = 1, SECONDS = 120, FIGHTERS = 8, SHIP_SPACING = 140, MAX_ESCORTS = 12;
/** The groups of seats a `seatNetworks` key may name besides a seat's own id: a seat's group is what its id says before the dash (main-a -> main, pd-p1 -> pd). */
export const SEAT_GROUPS = Object.freeze(["main", "pd"]);
/** The gunner settings (see the header: chosen, not measured). Each is the options of gunSeats.handGunner before the three defaults every setting is given (gravity 0, reach 600, a burst of 1 s). */
export const GUNNERS = Object.freeze({
    perfect: Object.freeze({ delay: 0.25, sigma: 0.012 }),
    ace: Object.freeze({ delay: 0.25, sigma: 0.012, observe: Object.freeze({ window: 0.6, sigmaRange: 0.004 }) }),
    regular: Object.freeze({ delay: 0.4, sigma: 0.03, observe: Object.freeze({ window: 0.6, sigmaRange: 0.01 }) }),
    green: Object.freeze({ delay: 0.6, sigma: 0.06, observe: Object.freeze({ window: 0.5, sigmaRange: 0.02 }) }),
});
export const DEFAULT_GUNNERS = "regular";
export const SHARED = Object.freeze({ gravity: 0, maxRange: 600, burst: 1 });

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** The shortest-arc quaternion [w, x, y, z] that turns +X onto the unit vector d (a half turn about +Z when d is -X). */
export function quatFromX(d) {
    const w = 1 + d[0], x = 0, y = -d[2], z = d[1], n = Math.hypot(w, x, y, z);
    return n < 1e-9 ? [0, 0, 0, 1] : [w / n, x / n, y / n, z / n];
}

/**
 * Where everything starts for a seed and a kind, as plain data: { seed, kind, ship: { pos, q }, fighters: [{ pos, q, azimuth, elevation, distance }] }. Positions are relative to the ship at the origin; `azimuth` is measured from +X toward +Y (the ship's port), `elevation` up from its deck plane.
 */
export function scenario(seed, kind, { fighters = FIGHTERS, ships = 1, escorts = 0 } = {}) {
    if (!KINDS.includes(kind)) throw new Error(`battleshipFight.scenario: kind must be one of ${KINDS.join(", ")} (got ${kind})`);
    if (!Number.isInteger(fighters) || fighters < 1) throw new Error(`battleshipFight.scenario: at least one fighter (got ${fighters})`);
    if (ships !== 1 && ships !== 2) throw new Error(`battleshipFight.scenario: ships must be 1 or 2 (got ${ships})`);
    if (!Number.isInteger(escorts) || escorts < 0 || escorts > MAX_ESCORTS) throw new Error(`battleshipFight.scenario: escorts must be a whole number from 0 to ${MAX_ESCORTS} (got ${escorts})`);
    const r = mulberry(seed * 7 + 3), u = (lo, hi) => lo + (hi - lo) * r(), out = [];
    for (let k = 0; k < fighters; k++) {
        let az, el;
        if (kind === "swarm") { az = u(-Math.PI, Math.PI); el = u(-0.6, 0.6); }
        else { const centre = kind === "bow" ? 0 : kind === "stern" ? Math.PI : (r() < 0.5 ? Math.PI / 2 : -Math.PI / 2); az = centre + u(-0.5, 0.5); el = u(-0.5, 0.5); }
        const d = u(350, 500), dir = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
        out.push({ pos: dir.map((v) => v * d), q: quatFromX(dir.map((v) => -v)), azimuth: az, elevation: el, distance: d });
    }
    const at = ships === 1 ? [0] : [-SHIP_SPACING / 2, SHIP_SPACING / 2], shipsAt = at.map((y) => ({ pos: [0, y, 0], q: [1, 0, 0, 0] }));
    // the escorts: round the attackers' mean bearing, 100-160 units out, nose out toward them, at rest (a stream of their own: seed*13+5)
    const r2 = mulberry(seed * 13 + 5), u2 = (lo, hi) => lo + (hi - lo) * r2(), mean = Math.atan2(out.reduce((a, f) => a + Math.sin(f.azimuth), 0), out.reduce((a, f) => a + Math.cos(f.azimuth), 0)), esc = [];
    for (let k = 0; k < escorts; k++) {
        const az = mean + u2(-0.5, 0.5), el = u2(-0.3, 0.3), d = u2(100, 160), dir = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
        esc.push({ pos: dir.map((v) => v * d), q: quatFromX(dir), azimuth: az, elevation: el, distance: d });
    }
    return { seed, kind, ship: shipsAt[0], ships: shipsAt, fighters: out, escorts: esc };
}

/**
 * The arena for a seed and a kind. Options: fighters (8), gunners (a preset name or a handGunner options object; default `regular`), pilot (the fighters' pilot function, or an array of them one per fighter in turn; default the PD autopilot), seconds (120), behaviour ("face" | "hold"), cruise (0.3), friendlyFire (false: rounds hit every craft but their owner, spaceArena's option) and holdFire (true: the fighters' hold-fire rule and the seats' interlock, which only matter with friendlyFire), then wrecks (false: destroyed craft keep drifting and tumbling), impact (0: a round's mass, spaceArena.ROUND_MASS when on: hits push and spin the victim) and crew (false: the bridge crew and the gunners can die), then network (null: the gunners are the hand gunner; `{ module, weights }`, a seat-gunner library such as brain/seatGunnerPolicy.mjs or seatGunnerMlp.mjs and its weights, puts a network in every seat as the HAND behind the same hand gunner's SIGHT -- the setting above is still the sight's), then seatNetworks (null: a different network in the seats it names -- see the header), then formation, shipCollisions (the second ship keeps a station on the first; the ships' hulls collide) and helm (null: `{ module, weights }`, a network at each ship's helm).
 * Returns { arena, ship, scenario, gunners (what was asked for), gunnerOptions (what handGunner was given: the shared defaults, then the setting's own over them), network (what was asked for, or null), seatNetworks (what was asked for, or null), seatHands (per seat: { seat, from, net }), helm (what was asked for, or null) } with `arena` steppable (spaceArena.stepSpaceArena).
 */
export function build(seed, kind, { fighters = FIGHTERS, gunners = DEFAULT_GUNNERS, pilot = undefined, seconds = SECONDS, behaviour = "face", cruise = 0.3, friendlyFire = false, holdFire = true, wrecks = false, impact = 0, crew = false, network = null, seatNetworks = null, formation = false, shipCollisions = false, helm = null, ships = 1, escorts = 0, escortPilot = undefined } = {}) {
    const opts = typeof gunners === "string" ? GUNNERS[gunners] : gunners;
    if (!opts || typeof opts !== "object") throw new Error(`battleshipFight.build: gunners must be one of ${Object.keys(GUNNERS).join(", ")} or a handGunner options object (got ${gunners})`);
    const NET_SHAPE = (name, n) => `${name} must be { module (a seat-gunner library: gunnerFactory and WEIGHT_COUNT), weights (WEIGHT_COUNT of them) } (got ${n && typeof n === "object" ? `a module ${typeof n.module?.gunnerFactory === "function" ? "with" : "without"} gunnerFactory and ${n.weights?.length} weights` : n})`;
    const isNetwork = (n) => !!(n && typeof n.module?.gunnerFactory === "function" && n.weights?.length === n.module.WEIGHT_COUNT);
    if (network !== null && !isNetwork(network)) throw new Error("battleshipFight.build: " + NET_SHAPE("network", network));
    if (helm !== null && !(helm && typeof helm.module?.helmFactory === "function" && helm.weights?.length === helm.module.WEIGHT_COUNT)) throw new Error(`battleshipFight.build: helm must be { module (a helm library: helmFactory and WEIGHT_COUNT), weights (WEIGHT_COUNT of them) } (got ${helm && typeof helm === "object" ? `a module ${typeof helm.module?.helmFactory === "function" ? "with" : "without"} helmFactory and ${helm.weights?.length} weights` : helm})`);
    if (formation && ships !== 2) throw new Error(`battleshipFight.build: formation needs a second ship: ships must be 2 (got ${ships})`);
    const ship = CS.createCapitalShip(), sc = scenario(seed, kind, { fighters, ships, escorts }), gunnerOptions = { ...SHARED, ...opts };
    if (seatNetworks !== null) {
        if (typeof seatNetworks !== "object" || Array.isArray(seatNetworks)) throw new Error(`battleshipFight.build: seatNetworks must be an object of seat ids and groups to networks (got ${Array.isArray(seatNetworks) ? "an array" : typeof seatNetworks})`);
        for (const [key, n] of Object.entries(seatNetworks)) {
            if (!ship.seats.some((q) => q.id === key) && !SEAT_GROUPS.includes(key)) throw new Error(`battleshipFight.build: seatNetworks names "${key}", which is neither a seat (${ship.seats.map((q) => q.id).join(", ")}) nor a group (${SEAT_GROUPS.join(", ")})`);
            if (n !== null && !isNetwork(n)) throw new Error("battleshipFight.build: " + NET_SHAPE(`seatNetworks["${key}"]`, n));
        }
    }
    // a seat's hand: the network its own id names, else its group's, else `network`, else the rule (null)
    const handOf = (seat) => {
        if (seatNetworks !== null) for (const [key, from] of [[seat.id, "seat"], [seat.id.split("-")[0], "group"]]) if (Object.hasOwn(seatNetworks, key)) return { seat: seat.id, from, net: seatNetworks[key] };
        return { seat: seat.id, from: network ? "network" : "hand", net: network };
    };
    const seatHands = ship.seats.map(handOf);
    const sightFor = (offset) => (seat, k) => GS.handGunner({ seed: seed * 100 + offset + k, ...gunnerOptions }), makeSight = sightFor(0);
    const gunnerFor = (offset) => (seat, k) => { const h = handOf(seat); return h.net ? h.net.module.gunnerFactory(h.net.weights, sightFor(offset), { reach: gunnerOptions.maxRange })(seat, k) : sightFor(offset)(seat, k); };
    const crafts = [{ id: SHIP_ID, team: 1, name: "capital ship", kind: "capital", ship, state: sc.ship, behaviour, cruise, holdFire, gunner: gunnerFor(0), ...(helm ? { helmPilot: helm.module.helmFactory(helm.weights)() } : {}) }];
    sc.fighters.forEach((f, i) => crafts.push({ id: SHIP_ID + 1 + i, team: 2, name: `fighter ${i + 1}`, kind: "fighter", state: { pos: f.pos, q: f.q }, holdFire, ...(pilot ? { pilot: Array.isArray(pilot) ? pilot[i % pilot.length] : pilot } : {}) }));
    if (ships === 2) crafts.push({ id: SHIP_ID + 1 + sc.fighters.length, team: 1, name: "second ship", kind: "capital", ship: CS.createCapitalShip(), state: sc.ships[1], ...(formation ? { behaviour: "station", leader: SHIP_ID, offset: sc.ships[1].pos.map((v, k) => v - sc.ships[0].pos[k]) } : { behaviour }), cruise, holdFire, gunner: gunnerFor(50), ...(helm ? { helmPilot: helm.module.helmFactory(helm.weights)() } : {}) });   // its gunners' seeds are the first ship's plus 50
    sc.escorts.forEach((f, i) => crafts.push({ id: SHIP_ID + 1 + sc.fighters.length + (ships - 1) + i, team: 1, name: `escort ${i + 1}`, kind: "fighter", state: { pos: f.pos, q: f.q }, holdFire, ...(escortPilot ? { pilot: Array.isArray(escortPilot) ? escortPilot[i % escortPilot.length] : escortPilot } : {}) }));
    return { arena: SA.createSpaceArena({ crafts, seconds, friendlyFire, wrecks, impact, crew, shipCollisions }), ship, scenario: sc, gunners: opts, gunnerOptions, network, seatNetworks, seatHands, helm };
}

/**
 * A fight in numbers, from the arena as it stands (finished or not): who is left, what each side did to the other (the damage on the ship is what it has lost of its hit points, so it and `hpLeft` add up to the 1,500 whatever the last round overkilled), and the winner ("ship" when its SIDE
 * flies -- a ship or an escort -- and no raider does, "fighters" when a raider does and nothing of the ship's side, "none" otherwise). `ship` is the first capital ship; `ships` every capital ship in the arena (the same fields), `fighters` the raiders (the attackers, team 2), `escorts` the fighters of the ship's own
 * side. With one ship and no escort -- every fight before the options -- `ships` is `[ship]`, `escorts` is empty and the rest is what it was.
 */
export function tally(arena) {
    const caps = arena.crafts.filter((c) => c.kind === "capital"), s = caps[0], team = s.team, fs = arena.crafts.filter((c) => c.kind === "fighter" && c.team !== team), mates = arena.crafts.filter((c) => c.kind === "fighter" && c.team === team), flyingNow = (c) => !c.dead;
    const shipRow = (c) => ({ status: c.status, hpLeft: Math.max(0, c.hp), enginesRunning: c.enginesRunning, partsOut: [...c.partHp].filter(([, hp]) => hp <= 0).map(([id]) => c.ship.parts[id].name), seatRounds: c.seats.reduce((a, x) => a + x.state.gun.fired, 0), hitsDealt: c.hits, waves: c.waves, charge: c.charge, friendlyHits: c.friendlyHits, friendlyTaken: c.friendlyTaken, held: c.held, helm: c.helm, crewDead: c.crew ? c.seats.filter((q) => c.crew.dead.has(q.seat.id)).map((q) => q.seat.name) : [] });
    const fighterRow = (c) => ({ id: c.id, name: c.name, status: c.status, hpLeft: Math.max(0, c.hp), fired: c.gun.fired, hitsDealt: c.hits, mode: c.mode, friendlyHits: c.friendlyHits, friendlyTaken: c.friendlyTaken, held: c.held });
    const fightersFlying = fs.filter(flyingNow).length, sideFlying = caps.filter(flyingNow).length + mates.filter(flyingNow).length;
    return {
        over: arena.over, t: arena.t, ticks: arena.i,
        ship: shipRow(s), ships: caps.map(shipRow),
        fighters: fs.map(fighterRow), escorts: mates.map(fighterRow),
        killed: fs.filter((c) => c.status === "destroyed").length, rammed: fs.filter((c) => c.status === "rammed").length, flying: fightersFlying,
        damageOnShip: s.hpMax - Math.max(0, s.hp), damageOnShips: caps.reduce((a, c) => a + c.hpMax - Math.max(0, c.hp), 0),
        friendlyHits: caps.reduce((a, c) => a + c.friendlyHits, 0) + fs.reduce((a, c) => a + c.friendlyHits, 0) + mates.reduce((a, c) => a + c.friendlyHits, 0),
        winner: sideFlying > 0 && fightersFlying === 0 ? "ship" : sideFlying === 0 && fightersFlying > 0 ? "fighters" : "none",
    };
}

/** One fight, flown to its end and summed up: tally() of the finished arena. Same options as build(). */
export function fight(seed, kind, opts = {}) { const b = build(seed, kind, opts); SA.runSpaceArena(b.arena); return tally(b.arena); }

export function reportLines() {
    const rows = [];
    for (const g of ["perfect", "regular", "green"]) { const t = [1, 2, 3, 4].map((s) => fight(s, "swarm", { gunners: g })); rows.push(`${g} ${t.filter((x) => x.winner === "ship").length}/4 ship, ${t.reduce((a, x) => a + x.killed, 0)}/32 fighters shot down`); }
    return ["[battleshipFight] a capital ship and the fighters that attack it: where they start for a seed, who sits in the gun seats and how well (chosen, not measured), and the numbers a fight is summed up in",
        `  swarm attacks of eight PD-autopilot fighters, seeds 1-4: ${rows.join("; ")}`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
