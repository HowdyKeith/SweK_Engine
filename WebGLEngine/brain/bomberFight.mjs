// WebGLEngine/brain/bomberFight.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A BOMBER AND THE FIGHTERS THAT ATTACK IT, AS A SCENARIO. physics/mechanics/bomber.mjs is the aircraft (a B-29-style hull, four engines, five gun seats); brain/dogfightArena.mjs is the fight (any number of crafts, steppable); this is the setup between them:
// where the fighters start for a seed and a kind of attack, who sits in the gun seats and how well, and the numbers a fight is summed up in. It builds an ARENA, not a result, so a page can step it and watch; fight() runs one to its end and sums it up.
//
//   KINDS      stern     the fighters come up behind the bomber, 400-600 m back, up to 120 m to either side and 60 m above or below, nose a tenth of a radian off the bomber's heading
//              beam      from the side, 500-700 m out (either side), 0-200 m behind the bomber's centre, nose at the bomber
//              head-on   ahead, 900-1,100 m out, up to 150 m to either side, flying the reciprocal heading
//              mixed     fighter 1 stern, 2 beam, 3 head-on, 4 stern again ...
//              Every fighter flies 44-48 m/s (the trainer-class fighters this tree trained top out at 52.8 m/s; the bomber at scale 2 cruises at 43.3, so a fighter closes on it from behind by a few metres a second -- the speed gap in physics/mechanics/bomber.mjs),
//              hunts the NEAREST enemy still flying with dogfightTask.pursuit()'s guidance and fires when dogfightTask.fireControl() says a round would hit the bomber's AIM RADIUS (0.35 of its span). A seed fixes every number (a Mulberry32 stream).
//   GUNNERS    the hand gunner of physics/mechanics/gunSeats.mjs in four settings, and THE SETTINGS ARE CHOSEN, NOT MEASURED: nothing here says how fast or how accurate a B-29's gunner was. perfect -- shown the target's exact velocity, a quarter-second
//              reaction, 0.012 rad of aim error; ace -- sees only where the target is (a 0.6 s window, a range error of 0.4% of the range), the same reaction and aim; regular -- a 0.4 s reaction, 0.03 rad, a 1% range error; green -- 0.6 s, 0.06 rad, a 2% range error
//              over a 0.5 s window. The default is `regular`. They are knobs on a model, and the fights below say what the knobs do, not what a war did.
//   THE FIGHT  the fighters are team 2, ids 2..N+1; the bomber is team 1, id 1, flies straight and level on a script (its autopilot is the trainer's, shown the trainer's world), and does not fire a forward gun. A fighter HOLDS FIRE for a team-mate in its line
//              (dogfightArena's rule; without it three fighters closing on one bomber from one side shoot each other: the first count was 29 friendly hits against 0.2 on the bomber) -- `holdFire: false` turns it off to see that. The fight is over when one
//              team is gone or at 90 s.
// WHAT IS NOT HERE, SAID PLAINLY: the fighters do not break away (they press until they are shot down, run into something, or run out of rounds -- a fighter that has to get past a bomber's whole hull with a lead-pursuit guidance designed for another fighter
// is not an attack doctrine); no escort, no second bomber, no formation (a box of bombers covering each other's blind spots is the thing a B-29 raid was, and it is not built); and no crew to kill. Pure: no DOM, no clock; a seed fixes the fight.
"use strict";
import * as AF from "./autopilotFlight.mjs";
import * as A from "./dogfightArena.mjs";
import * as BM from "../physics/mechanics/bomber.mjs";
import * as GS from "../physics/mechanics/gunSeats.mjs";

export const KINDS = Object.freeze(["stern", "beam", "head-on", "mixed"]);
export const BOMBER_ID = 1, SECONDS = 90, FIGHTERS = 3;
/** The gunner settings (see the header: chosen, not measured). Each is the options of gunSeats.handGunner. */
export const GUNNERS = Object.freeze({
    perfect: Object.freeze({ delay: 0.25, sigma: 0.012 }),
    ace: Object.freeze({ delay: 0.25, sigma: 0.012, observe: Object.freeze({ window: 0.6, sigmaRange: 0.004 }) }),
    regular: Object.freeze({ delay: 0.4, sigma: 0.03, observe: Object.freeze({ window: 0.6, sigmaRange: 0.01 }) }),
    green: Object.freeze({ delay: 0.6, sigma: 0.06, observe: Object.freeze({ window: 0.5, sigmaRange: 0.02 }) }),
});
export const DEFAULT_GUNNERS = "regular";

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const fwdOf = (h) => [Math.cos(h), -Math.sin(h)], rightOf = (h) => [-Math.sin(h), -Math.cos(h)];   // heading 0 is +X and a right turn increases it, so the unit vectors are (cos h, -sin h) and the right-hand side (-sin h, -cos h)

/**
 * Where everything starts for a seed and a kind, as plain data: { seed, kind, heading (the bomber's), bomber: { pos, speed, heading, pitch }, fighters: [{ kind, pos, speed, heading, pitch }] }. The bomber's altitude and speed are the bomber's
 * (scaled): pass `bomber` (a physics/mechanics/bomber.createBomber result) to place the fighters at its altitude.
 */
export function scenario(seed, kind, { fighters = FIGHTERS, bomber = BM.createBomber() } = {}) {
    if (!KINDS.includes(kind)) throw new Error(`bomberFight.scenario: kind must be one of ${KINDS.join(", ")} (got ${kind})`);
    if (!Number.isInteger(fighters) || fighters < 1) throw new Error(`bomberFight.scenario: at least one fighter (got ${fighters})`);
    const r = mulberry(seed * 7 + 1), u = (lo, hi) => lo + (hi - lo) * r(), hB = u(-3, 3), f = fwdOf(hB), rr = rightOf(hB), alt = bomber.altitude;
    const out = [];
    for (let i = 0; i < fighters; i++) {
        const k = kind === "mixed" ? ["stern", "beam", "head-on"][i % 3] : kind; let pos, h;
        if (k === "stern") { const d = u(400, 600), lat = u(-120, 120); pos = [-f[0] * d + rr[0] * lat, -f[1] * d + rr[1] * lat, alt + u(-60, 60)]; h = hB + u(-0.1, 0.1); }
        else if (k === "beam") { const d = u(500, 700), sd = r() < 0.5 ? -1 : 1, back = u(0, 200), bx = -f[0] * back + rr[0] * sd * d, by = -f[1] * back + rr[1] * sd * d; pos = [bx, by, alt + u(-60, 60)]; h = Math.atan2(by, -bx) + u(-0.15, 0.15); }
        else { const d = u(900, 1100), lat = u(-150, 150); pos = [f[0] * d + rr[0] * lat, f[1] * d + rr[1] * lat, alt + u(-60, 60)]; h = hB + Math.PI + u(-0.1, 0.1); }
        out.push({ kind: k, pos, speed: u(44, 48), heading: h, pitch: 0.03 });
    }
    return { seed, kind, heading: hB, bomber: { pos: [0, 0, alt], speed: bomber.cruiseSpeed, heading: hB, pitch: 0.16 }, fighters: out };
}

/**
 * The arena for a seed and a kind. Options: fighters (3), gunners (a preset name or a handGunner options object; default `regular`), pilot (the fighters' pilot function, or an array of them, one per fighter; default the PD autopilot), scale (the bomber's, 2),
 * holdFire (true), seconds (90), bomberPilot (the bomber's own pilot, default the PD autopilot). Returns { arena, bomber, scenario, gunners } with `arena` steppable (dogfightArena.stepArena).
 */
export function build(seed, kind, { fighters = FIGHTERS, gunners = DEFAULT_GUNNERS, pilot = AF.pilot, scale = BM.DEFAULT_SCALE, holdFire = true, seconds = SECONDS, bomberPilot = AF.pilot } = {}) {
    const opts = typeof gunners === "string" ? GUNNERS[gunners] : gunners;
    if (!opts || typeof opts !== "object") throw new Error(`bomberFight.build: gunners must be one of ${Object.keys(GUNNERS).join(", ")} or a handGunner options object (got ${gunners})`);
    const bomber = BM.createBomber({ scale }), sc = scenario(seed, kind, { fighters, bomber }), alt = bomber.altitude, hB = sc.heading, cv = bomber.cruiseSpeed;
    const crafts = [{ id: BOMBER_ID, team: 1, name: "bomber", bomber, pilot: bomberPilot, behaviour: "script", script: () => ({ heading: hB, altitude: alt, airspeed: cv }), fires: false, state: sc.bomber,
        gunner: (seat, k) => GS.handGunner({ seed: seed * 10 + k, ...opts }) }];
    sc.fighters.forEach((s, i) => crafts.push({ id: BOMBER_ID + 1 + i, team: 2, name: `fighter ${i + 1}`, pilot: Array.isArray(pilot) ? pilot[i % pilot.length] : pilot, behaviour: "hunt", fires: true, holdFire, state: { pos: s.pos, speed: s.speed, heading: s.heading, pitch: s.pitch } }));
    return { arena: A.createArena({ crafts, seconds }), bomber, scenario: sc, gunners: opts };
}

const GROUNDED = new Set(["crashed", "touchdown", "collided"]);
/** A fight in numbers, from the arena as it stands (finished or not): who is left, what each side did to the other, and the winner ("bomber" when it flies and no fighter does, "fighters" when one does and it does not, "none" otherwise). */
export function tally(arena) {
    const b = arena.crafts[0], fs = arena.crafts.slice(1), airborne = (c) => c.status === "airborne";
    const bomberFlying = airborne(b), fightersFlying = fs.filter(airborne).length;
    return {
        over: arena.over, t: arena.t, ticks: arena.i,
        bomber: { status: b.status, hpLeft: Math.max(0, b.hp - b.taken), taken: b.taken, enginesRunning: b.enginesRunning, seatRounds: b.seats.reduce((a, s) => a + s.state.gun.fired, 0), hitsDealt: b.hits, friendlyTaken: b.friendlyTaken },
        fighters: fs.map((c) => ({ id: c.id, name: c.name, status: c.status, hpLeft: Math.max(0, c.hp - c.taken), fired: c.gun.fired, hitsDealt: c.hits, friendlyHits: c.friendlyHits, friendlyTaken: c.friendlyTaken, held: c.held, killedAt: c.killedAt })),
        killed: fs.filter((c) => c.status === "destroyed").length, grounded: fs.filter((c) => GROUNDED.has(c.status)).length, flying: fightersFlying,
        hitsOnBomber: fs.reduce((a, c) => a + c.hits, 0), friendlyHits: fs.reduce((a, c) => a + c.friendlyHits, 0),
        winner: bomberFlying && fightersFlying === 0 ? "bomber" : !bomberFlying && fightersFlying > 0 ? "fighters" : "none",
    };
}

/** One fight, flown to its end and summed up: tally() of the finished arena. Same options as build(). */
export function fight(seed, kind, opts = {}) { const b = build(seed, kind, opts); A.runArena(b.arena); return tally(b.arena); }

export function reportLines() {
    const rows = [];
    for (const g of ["perfect", "regular", "green"]) { const t = [1, 2, 3, 4].map((s) => fight(s, "stern", { gunners: g })); rows.push(`${g} ${t.filter((x) => x.winner === "bomber").length}/4 bomber, ${t.reduce((a, x) => a + x.killed, 0)}/12 fighters shot down`); }
    return ["[bomberFight] a B-29-style bomber and the fighters that attack it: where they start for a seed, who sits in the gun seats and how well (chosen, not measured), and the numbers a fight is summed up in",
        `  stern attacks, seeds 1-4, three fighters each: ${rows.join("; ")}`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
