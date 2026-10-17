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
// WHAT IS NOT HERE, SAID PLAINLY: a formation of ships, an escort, a second capital ship (the arena can hold one: this scenario does not build it), fighters that run out of rounds (the page's do not), and anything the page's own fleet fights are -- the fighters here are the same craft, nothing more. Pure: no DOM, no clock; a seed fixes the fight.
"use strict";
import * as SA from "./spaceArena.mjs";
import * as CS from "../physics/mechanics/capitalShip.mjs";
import * as GS from "../physics/mechanics/gunSeats.mjs";

export const KINDS = Object.freeze(["bow", "beam", "stern", "swarm"]);
export const SHIP_ID = 1, SECONDS = 120, FIGHTERS = 8;
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
export function scenario(seed, kind, { fighters = FIGHTERS } = {}) {
    if (!KINDS.includes(kind)) throw new Error(`battleshipFight.scenario: kind must be one of ${KINDS.join(", ")} (got ${kind})`);
    if (!Number.isInteger(fighters) || fighters < 1) throw new Error(`battleshipFight.scenario: at least one fighter (got ${fighters})`);
    const r = mulberry(seed * 7 + 3), u = (lo, hi) => lo + (hi - lo) * r(), out = [];
    for (let k = 0; k < fighters; k++) {
        let az, el;
        if (kind === "swarm") { az = u(-Math.PI, Math.PI); el = u(-0.6, 0.6); }
        else { const centre = kind === "bow" ? 0 : kind === "stern" ? Math.PI : (r() < 0.5 ? Math.PI / 2 : -Math.PI / 2); az = centre + u(-0.5, 0.5); el = u(-0.5, 0.5); }
        const d = u(350, 500), dir = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
        out.push({ pos: dir.map((v) => v * d), q: quatFromX(dir.map((v) => -v)), azimuth: az, elevation: el, distance: d });
    }
    return { seed, kind, ship: { pos: [0, 0, 0], q: [1, 0, 0, 0] }, fighters: out };
}

/**
 * The arena for a seed and a kind. Options: fighters (8), gunners (a preset name or a handGunner options object; default `regular`), pilot (the fighters' pilot function, or an array of them one per fighter in turn; default the PD autopilot), seconds (120), behaviour ("face" | "hold"), cruise (0.3), friendlyFire (false: rounds hit every craft but their owner, spaceArena's option) and holdFire (true: the fighters' hold-fire rule and the seats' interlock, which only matter with friendlyFire).
 * Returns { arena, ship, scenario, gunners (what was asked for), gunnerOptions (what handGunner was given: the shared defaults, then the setting's own over them) } with `arena` steppable (spaceArena.stepSpaceArena).
 */
export function build(seed, kind, { fighters = FIGHTERS, gunners = DEFAULT_GUNNERS, pilot = undefined, seconds = SECONDS, behaviour = "face", cruise = 0.3, friendlyFire = false, holdFire = true } = {}) {
    const opts = typeof gunners === "string" ? GUNNERS[gunners] : gunners;
    if (!opts || typeof opts !== "object") throw new Error(`battleshipFight.build: gunners must be one of ${Object.keys(GUNNERS).join(", ")} or a handGunner options object (got ${gunners})`);
    const ship = CS.createCapitalShip(), sc = scenario(seed, kind, { fighters }), gunnerOptions = { ...SHARED, ...opts };
    const crafts = [{ id: SHIP_ID, team: 1, name: "capital ship", kind: "capital", ship, state: sc.ship, behaviour, cruise, holdFire, gunner: (seat, k) => GS.handGunner({ seed: seed * 100 + k, ...gunnerOptions }) }];
    sc.fighters.forEach((f, i) => crafts.push({ id: SHIP_ID + 1 + i, team: 2, name: `fighter ${i + 1}`, kind: "fighter", state: { pos: f.pos, q: f.q }, holdFire, ...(pilot ? { pilot: Array.isArray(pilot) ? pilot[i % pilot.length] : pilot } : {}) }));
    return { arena: SA.createSpaceArena({ crafts, seconds, friendlyFire }), ship, scenario: sc, gunners: opts, gunnerOptions };
}

/** A fight in numbers, from the arena as it stands (finished or not): who is left, what each side did to the other (the damage on the ship is what it has lost of its hit points, so it and `hpLeft` add up to the 1,500 whatever the last round overkilled), and the winner ("ship" when it flies and no fighter does, "fighters" when one does and it does not, "none" otherwise). */
export function tally(arena) {
    const s = arena.crafts[0], fs = arena.crafts.slice(1), flyingNow = (c) => !c.dead, out = [...s.partHp].filter(([, hp]) => hp <= 0).map(([id]) => s.ship.parts[id].name);
    const shipFlying = flyingNow(s), fightersFlying = fs.filter(flyingNow).length;
    return {
        over: arena.over, t: arena.t, ticks: arena.i,
        ship: { status: s.status, hpLeft: Math.max(0, s.hp), enginesRunning: s.enginesRunning, partsOut: out, seatRounds: s.seats.reduce((a, x) => a + x.state.gun.fired, 0), hitsDealt: s.hits, waves: s.waves, charge: s.charge, friendlyHits: s.friendlyHits, friendlyTaken: s.friendlyTaken, held: s.held },
        fighters: fs.map((c) => ({ id: c.id, name: c.name, status: c.status, hpLeft: Math.max(0, c.hp), fired: c.gun.fired, hitsDealt: c.hits, mode: c.mode, friendlyHits: c.friendlyHits, friendlyTaken: c.friendlyTaken, held: c.held })),
        killed: fs.filter((c) => c.status === "destroyed").length, rammed: fs.filter((c) => c.status === "rammed").length, flying: fightersFlying,
        damageOnShip: s.hpMax - Math.max(0, s.hp),
        friendlyHits: s.friendlyHits + fs.reduce((a, c) => a + c.friendlyHits, 0),
        winner: shipFlying && fightersFlying === 0 ? "ship" : !shipFlying && fightersFlying > 0 ? "fighters" : "none",
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
