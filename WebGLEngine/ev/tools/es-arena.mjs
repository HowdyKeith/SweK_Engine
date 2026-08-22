// WebGLEngine/ev/tools/es-arena.mjs — v2250
//
// A headless fleet-vs-fleet ARENA for the Endless Sky combat stack. Two fleets spawn facing each other
// and fight to the death (or a time cap), flown by the engine's OWN pure modules -- the same decide ->
// stepAI -> stepFlight -> applyDamage chain that brain/esPilot.mjs uses in the live game. The two sides
// carry SEPARATE tactics weight vectors, so this is both a spectacle and a training/eval ground: pit the
// hand-authored opening book against a brain-served policy and measure whether the brain actually wins.
//
//   node ev/tools/es-arena.mjs                         hand vs hand (fair-fight sanity)
//   node ev/tools/es-arena.mjs --a sharp --b hand      a tuned policy vs the opening book
//   node ev/tools/es-arena.mjs --a brain.json --b hand  a served/learned weight file vs the book
//   flags: --n <battles> --count <ships/side> --seconds <cap> --seed <base>
//
// Importable: runBattle(opts) runs one fight; runSeries(opts) runs N and tallies win rates.

import { spawnEnemies, stepAI, applyDamage } from "../combat.js";
import { stepFlight, headingVector } from "../flightModel.js";
import { createESBox3D } from "../../physics/esBox3d.js";              // v2263 -- optional box3d flight substrate (collisions)
import { planarFallbackWorld } from "../../physics/planarFallbackWorld.js";
import { DEFAULT_W, decide as tacticsDecide, applyBrainWeights } from "../esTactics.js";
import { readFileSync } from "fs";

// Ship opening book (mirrors esPilot's; EV "Maneuver" units -> shipFlightStats scales by TURN_SCALE=3).
export const CLASSES = [
    { id: 1, name: "Raider",   shield: 80,  armor: 60, speed: 340, accel: 240, maneuver: 11, dps: 12 },
    { id: 2, name: "Marauder", shield: 120, armor: 90, speed: 300, accel: 200, maneuver: 8,  dps: 18 },
    { id: 3, name: "Corsair",  shield: 60,  armor: 40, speed: 400, accel: 280, maneuver: 14, dps: 8  },
];
const SHOT = { speed: 1050, life: 1.7, dmgShield: 14, dmgArmor: 12, cooldownMs: 360 };

// EV-flavoured fleet (classic Escape Velocity feel): a fast glass-cannon fighter, a balanced corvette, and a
// slow heavy cruiser -- a rock/paper/scissors mix distinct from the ES book. The arena runs on the SAME shared
// combat.js, so this is a real EV fleet battle; on the rig, load your mod's actual ship records instead.
export const EV_CLASSES = [
    { id: 11, name: "Fighter",  shield: 40,  armor: 30,  speed: 430, accel: 300, maneuver: 16, dps: 7  },
    { id: 12, name: "Corvette", shield: 100, armor: 80,  speed: 320, accel: 220, maneuver: 9,  dps: 15 },
    { id: 13, name: "Cruiser",  shield: 180, armor: 140, speed: 260, accel: 160, maneuver: 5,  dps: 24 },
];
export const FLEETS = { es: CLASSES, ev: EV_CLASSES };
const HIT_RADIUS = 90;

// Named policies. "hand" is the shipped opening book; "sharp" stands in for what a learned brain converges
// toward: commit to a target (focus) and finish the wounded (weakness), i.e. concentration of fire.
export const PRESETS = {
    hand: { ...DEFAULT_W },
    // "brawler": in this range-limited furball, target choice steers movement, so committing to the NEAREST
    // threat (high wClose) and finishing wounded without chasing beats the book. Stands in for what a policy
    // learns by playing the arena -- it is not hand-blessed to win, it wins because the sim rewards staying engaged.
    brawler: applyBrainWeights({ wClose: 1.5, wWeak: 0.55, wThreat: 0.15, wPlayer: 0.0, wFocus: 0.45 }, DEFAULT_W),
    // "sharp": chase the weakest/most-dangerous regardless of distance. Sounds clever, loses here (chasing = exposure).
    sharp: applyBrainWeights({ wWeak: 1.5, wFocus: 0.70, wThreat: 0.70, wPlayer: 0.0, wClose: 1.0 }, DEFAULT_W),
    // "scatter": only proximity, no prioritization. A naive baseline.
    scatter: applyBrainWeights({ wWeak: 0.0, wFocus: 0.0, wThreat: 0.0, wPlayer: 0.0, wClose: 1.0 }, DEFAULT_W),
};

function makeRng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

function makeFleet(team, classes, center, count, rng) {
    return spawnEnemies(classes, {}, center, { count, team, minR: 150, spread: 500, rnd: rng }).map((e, i) => ({
        ...e, id: team + "#" + i, team,
        vx: e.vx || 0, vy: e.vy || 0,
        dps: (e.cls && e.cls.dps) || e.dps || 10,
        _cool: 0, _tgtId: null, _fleeing: false,
    }));
}

// One side acts on the living foes; returns the shots it fired (tagged with the shooter's team).
function stepSide(mine, foesLiving, weights, dt, nowMs, esbx) {
    const shots = [];
    for (const e of mine) {
        if (e.dead) continue;
        const d = tacticsDecide(e, foesLiving, weights, { lastTargetId: e._tgtId, wasFleeing: e._fleeing, range: 1400 });
        e._fleeing = !!d.fleeing;
        e._tgtId = (d.target && !d.target._flee) ? d.target.id : null;
        if (!d.target) continue;
        const ai = stepAI(e, d.target, { range: 1400, standoff: d.fleeing ? 0 : 160 });
        if (esbx) {
            // box3d substrate: heading + target velocity go to the body; position/velocity are pulled back
            // by esbx.sync() after BOTH sides move, so cross-fleet ships actually collide.
            esbx.driveShip(e._bx, { turn: ai.turn, thrust: ai.thrust }, dt);
        } else {
            const ns = stepFlight(e, { turn: ai.turn, thrust: ai.thrust }, e.stats, dt);
            e.x = ns.x; e.y = ns.y; e.vx = ns.vx; e.vy = ns.vy; e.heading = ns.heading;
        }
        if (ai.firing && d.engaging && nowMs >= (e._cool || 0)) {
            e._cool = nowMs + SHOT.cooldownMs;
            const dir = headingVector(e.heading);   // engine convention {x:sin, y:-cos}
            shots.push({ team: e.team, x: e.x, y: e.y, vx: dir.x * SHOT.speed, vy: dir.y * SHOT.speed, life: SHOT.life });
        }
    }
    return shots;
}

// Advance shots one step; a shot hits the first living OPPOSING-team ship within HIT_RADIUS. Mutates ships.
function advanceShots(shots, ships, dt) {
    const rr = HIT_RADIUS * HIT_RADIUS, alive = []; let hits = 0, kills = 0;
    for (const sh of shots) {
        sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.life -= dt;
        if (sh.life <= 0) continue;
        let consumed = false;
        for (const e of ships) {
            if (e.dead || e.team === sh.team) continue;   // no friendly fire
            const dx = e.x - sh.x, dy = e.y - sh.y;
            if (dx * dx + dy * dy <= rr) { const dead = applyDamage(e, SHOT.dmgShield, SHOT.dmgArmor); hits++; if (dead) { e.dead = true; kills++; } consumed = true; break; }
        }
        if (!consumed) alive.push(sh);
    }
    return { alive, hits, kills };
}

// A light, read-only view of a fleet's LIVING ships, taken before anyone moves, so both sides decide and
// aim against the same pre-tick world. Without it, whichever side steps first is aimed at by a foe that
// already saw its new position -- a systematic edge that skews the mirror match.
function snapshot(fleet) {
    const out = [];
    for (const e of fleet) if (!e.dead) out.push({ id: e.id, x: e.x, y: e.y, team: e.team, shield: e.shield, armor: e.armor, maxShield: e.maxShield, maxArmor: e.maxArmor, dps: e.dps, dead: false });
    return out;
}

// Run one battle. Returns { winner, survA, survB, ticks, seconds, shotsFired, hits }.
export function runBattle(opts = {}) {
    const classesA = opts.classesA || CLASSES, classesB = opts.classesB || CLASSES;
    const countA = opts.countA || opts.count || 6, countB = opts.countB || opts.count || 6;
    const wA = opts.weightsA || DEFAULT_W, wB = opts.weightsB || DEFAULT_W;
    const dt = opts.dt || 1 / 30, maxT = Math.round((opts.maxSeconds || 60) / dt);
    const rng = makeRng(opts.seed || 12345);
    const A = makeFleet("A", classesA, { x: -1200, y: 0 }, countA, rng);
    const B = makeFleet("B", classesB, { x: 1200, y: 0 }, countB, rng);
    const ships = A.concat(B);
    // v2263 -- optional box3d substrate: ships become planar bodies that COLLIDE (ram/bump, no overlap).
    // The classic path (no esbx) is byte-identical to before.
    let esbx = null;
    if (opts.physics === "box3d") {
        esbx = createESBox3D(planarFallbackWorld(), { shipHalf: opts.shipHalf || 60 });
        for (const e of ships) e._bx = esbx.add(e, e.stats);
    }
    let shots = [], t = 0, ticks = 0, shotsFired = 0, hits = 0;
    for (; ticks < maxT; ticks++) {
        const Asnap = snapshot(A), Bsnap = snapshot(B);
        if (!Asnap.length || !Bsnap.length) break;
        const nowMs = t * 1000;
        const sA = stepSide(A, Bsnap, wA, dt, nowMs, esbx);
        const sB = stepSide(B, Asnap, wB, dt, nowMs, esbx);
        if (esbx) { esbx.step(dt); esbx.sync(); }   // one shared physics step -> cross-fleet collisions resolve
        shotsFired += sA.length + sB.length;
        shots = shots.concat(sA, sB);
        const r = advanceShots(shots, ships, dt); shots = r.alive; hits += r.hits;
        t += dt;
    }
    const survA = A.filter((e) => !e.dead).length, survB = B.filter((e) => !e.dead).length;
    const winner = (survA > 0 && survB === 0) ? "A" : (survB > 0 && survA === 0) ? "B"
        : (survA === survB) ? "draw" : (survA > survB ? "A" : "B");
    return { winner, survA, survB, countA, countB, ticks, seconds: +t.toFixed(1), shotsFired, hits, physics: opts.physics || "classic" };
}

// Run N battles across seeds; tally win rates + averages.
export function runSeries(opts = {}) {
    const n = opts.n || 40, base = opts.seed || 1;
    let aw = 0, bw = 0, dr = 0, sA = 0, sB = 0, sec = 0, timeouts = 0;
    for (let i = 0; i < n; i++) {
        const r = runBattle({ ...opts, seed: base + i * 7919 });
        if (r.winner === "A") aw++; else if (r.winner === "B") bw++; else dr++;
        sA += r.survA; sB += r.survB; sec += r.seconds;
        if (r.seconds >= (opts.maxSeconds || 60) - 0.001) timeouts++;
    }
    return { n, aWins: aw, bWins: bw, draws: dr, aWinRate: +(aw / n).toFixed(3), bWinRate: +(bw / n).toFixed(3),
        avgSurvA: +(sA / n).toFixed(2), avgSurvB: +(sB / n).toFixed(2), avgSeconds: +(sec / n).toFixed(1), timeouts };
}

// ---- CLI ----------------------------------------------------------------------------------
function weightsFrom(spec) {
    if (!spec || spec === "hand") return PRESETS.hand;
    if (PRESETS[spec]) return PRESETS[spec];
    try { const j = JSON.parse(readFileSync(spec, "utf8")); return applyBrainWeights(j.weights || j, DEFAULT_W); }
    catch (e) { console.error("could not read weights '" + spec + "': " + e.message + " (using hand)"); return PRESETS.hand; }
}

if (import.meta.url === ("file://" + process.argv[1]) || process.argv[1] && process.argv[1].endsWith("es-arena.mjs")) {
    const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
    const aSpec = arg("--a", "hand"), bSpec = arg("--b", "hand");
    const fleet = arg("--fleet", "es"); const classes = FLEETS[fleet] || CLASSES;
    const opts = {
        weightsA: weightsFrom(aSpec), weightsB: weightsFrom(bSpec), classesA: classes, classesB: classes,
        count: +arg("--count", 6), n: +arg("--n", 40), maxSeconds: +arg("--seconds", 60), seed: +arg("--seed", 1),
        physics: arg("--physics", "classic"),   // v2263 -- "box3d" runs ships as colliding bodies
    };
    const r = runSeries(opts);
    console.log(`\nES ARENA  ${aSpec} (A) vs ${bSpec} (B)   ${fleet.toUpperCase()} fleet, ${opts.count}v${opts.count}, ${r.n} battles   physics=${opts.physics}\n`);
    console.log(`  A (${aSpec})  wins ${r.aWins}  (${(r.aWinRate * 100).toFixed(0)}%)   avg survivors ${r.avgSurvA}`);
    console.log(`  B (${bSpec})  wins ${r.bWins}  (${(r.bWinRate * 100).toFixed(0)}%)   avg survivors ${r.avgSurvB}`);
    console.log(`  draws ${r.draws}   avg battle ${r.avgSeconds}s   timeouts ${r.timeouts}`);
    const edge = aSpec === bSpec ? "(mirror match -- expect ~50/50)" : (r.aWinRate > r.bWinRate ? "-> A's policy wins" : r.bWinRate > r.aWinRate ? "-> B's policy wins" : "-> dead even");
    console.log(`\n  ${edge}\n`);
}
