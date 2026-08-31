#!/usr/bin/env node
// tools/ship/driveEnv-selfcheck.mjs -- v4218
//
// Run: node tools/ship/driveEnv-selfcheck.mjs      (pure, no world, no GL; trains, so it is not instant)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES brain/rl/driveEnv.js -- the driving environment -- and the one-word fix to brain/rl/dockPolicy.js
// that this round forced.
//
// *** EVERY FAILURE THIS GATE WATCHES FOR PRODUCED A RUNNING ENVIRONMENT AND A SILENTLY DIFFERENT TASK. ***
// None of the four threw. Each was found by measuring the env rather than by reading it:
//
//   1. reset() built its observation from _slip and _grounded, which only step() ever assigned -- so the
//      first obs of every episode carried two NaNs, the first act() spread them through the MLP, and every
//      learned rollout returned NaN while the hand expert (which reads neither slot) scored normally. The
//      symptom looked like a broken trainer.
//   2. The chassis had no vertical degree of freedom. Wheel rays were cast from a FIXED ride height, so on a
//      dip the suspension simply extended: all four wheels reporting contact and carrying 0 N of an 11,772 N
//      car, frictionLimit 0, every tyre force clamped to nothing. The car sat at full throttle with slip
//      pinned at 1 for 400 steps. That was 7 of 16 expert episodes, and it read as bad driving.
//   3. The observation rotated by -heading while the integrator pushed along (cos h, -sin h) -- the same
//      angle, opposite z. The car drove steadily AWAY from the goal and every formula was defensible alone.
//   4. trainDockES built its evaluation options without maxSteps, so training silently ran at evaluate()'s
//      default 200 while the caller had asked for 400. Episodes here need 157-267 steps to arrive, so no
//      episode could finish during training. The tell: the trainer's own best.ev disagreed with a
//      re-evaluation of the very same params on the very same seeds -- dockRate 0.21 against 1.0.
import { DriveEnv, driveExpert, defaultCar, ROOF_TURRET, OBS_DIM, ACT_DIM } from "../../brain/rl/driveEnv.js";
import { trainDockES, evaluate, FlightPolicy, rollout } from "../../brain/rl/dockPolicy.js";
import { rollsBeforeSliding, staticLoads } from "../../physics/vehicle.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const MS = 400;
const mk = (o = {}) => new DriveEnv({ maxSteps: MS, ...o });
const SEEDS = Array.from({ length: 16 }, (_, k) => 5000 + k * 17);            // the trainer's own battery
const HELD  = Array.from({ length: 24 }, (_, k) => 900000 + k * 2237);        // seeds training never sees
console.log("driveEnv-selfcheck -- four ways to build a driving task that runs and is not the task\n");

function runExpert(env, seeds) {
    let arrived = 0, rolled = 0, ret = 0, dist = 0, stuck = 0;
    for (const s of seeds) {
        let o = env.reset(s), tot = 0, last = null, moved = 0;
        for (let t = 0; t < MS; t++) {
            const r = env.step(driveExpert(o)); tot += r.reward; o = r.obs; last = r;
            moved = Math.max(moved, r.info.speed);
            if (r.done) break;
        }
        ret += tot; dist += last.info.dist;
        if (last.info.arrived) arrived++;
        if (last.info.rolled) rolled++;
        if (moved < 0.5) stuck++;
    }
    const n = seeds.length;
    return { arrived, rolled, stuck, ret: ret / n, dist: dist / n };
}

// ---- 1. THE INTERFACE trainDockES ACTUALLY CALLS -----------------------------------------------------------
console.log("1. the drop-in env interface -- obsDim / actDim / maxSteps / reset / step, and nothing more");
{
    const env = mk();
    ok("obsDim and actDim are exported and match the instance", env.obsDim === OBS_DIM && env.actDim === ACT_DIM,
        `${OBS_DIM} obs, ${ACT_DIM} act`);
    ok("maxSteps is honoured, so the trainer can set the episode budget", mk({ maxSteps: 7 }).maxSteps === 7);
    const r = env.step([0, 1]);
    ok("step returns { obs, reward, done, info }",
        r.obs instanceof Float32Array && typeof r.reward === "number" && typeof r.done === "boolean" && !!r.info);
    ok("info carries the docked/crashed keys dockPolicy's rollout reads",
        "docked" in r.info && "crashed" in r.info);
}

// ---- 2. THE OBSERVATION IS FINITE THE MOMENT reset() RETURNS ------------------------------------------------
console.log("\n2. *** reset()'s OBSERVATION MUST BE FINITE -- two unset fields made every learned return NaN ***");
{
    let bad = 0, badFields = [];
    for (const s of SEEDS) {
        const env = mk(), o = env.reset(s);
        for (let i = 0; i < o.length; i++) if (!Number.isFinite(o[i])) { bad++; if (badFields.indexOf(i) < 0) badFields.push(i); }
    }
    ok("!! every element of every reset() observation is finite, over all " + SEEDS.length + " seeds",
        bad === 0, bad ? `${bad} non-finite, at index ${badFields.join(",")}` : "");
    const env = mk(); const o = env.reset(1);
    ok("...including slip (5) and grounded (6), which only step() assigns",
        Number.isFinite(o[5]) && Number.isFinite(o[6]), `slip=${o[5]} grounded=${o[6]}`);
    ok("...and a car standing still on flat ground reads as gripping, wheels down",
        o[5] === 0 && o[6] === 1);
    // The consequence, asserted end to end rather than assumed: a policy over this env returns a number.
    const p = new FlightPolicy({ hidden: [8, 8], obsDim: OBS_DIM, seed: 11 });
    const roll = rollout(p, mk(), 5000);
    ok("!! an untrained policy's rollout returns a finite total -- the NaN symptom, at its source",
        Number.isFinite(roll.total) && Number.isFinite(roll.dist), `total=${roll.total.toFixed(2)}`);
}

// ---- 3. THE CHASSIS FALLS ----------------------------------------------------------------------------------
console.log("\n3. *** THE CAR IS PUT DOWN ON THE ROAD -- a fixed ride height carried 0 N of an 11,772 N car ***");
{
    const env = mk();
    ok("the env has a heave degree of freedom at all", typeof env.y === "number" && typeof env.vy === "number");
    // Settled height is rest length less the static compression, plus a radius, above the local ground.
    const car = defaultCar(), loads = staticLoads(car.wheels, [0, car.cogHeight, 0], car.mass);
    const w0 = car.wheels[0];
    const expectHub = w0.restLength - loads[0] / w0.stiffness;
    env.bumpiness = 0; env.reset(1);
    ok("on flat ground it starts settled, not hovering and not sunk",
        Math.abs(env.y - (expectHub + w0.radius)) < 1e-6, `y=${env.y.toFixed(4)} expected=${(expectHub + w0.radius).toFixed(4)}`);

    // The measured symptom: on rough ground, throttle produced no motion at all.
    let stuck = 0, speeds = [];
    for (const s of SEEDS) {
        const e = mk(); e.reset(s);
        let sp = 0;
        for (let t = 0; t < 40; t++) sp = e.step([0, 1]).info.speed;
        speeds.push(sp);
        if (sp < 0.5) stuck++;
    }
    ok("!! full throttle for 40 steps moves the car, from EVERY seed -- 7 of 16 used to sit at exactly 0",
        stuck === 0, stuck ? `${stuck} stuck` : `slowest ${Math.min(...speeds).toFixed(2)} m/s`);
    // And the chassis genuinely tracks the ground rather than being pinned to it.
    const e2 = mk(); e2.reset(3);
    const y0 = e2.y;
    for (let t = 0; t < 60; t++) e2.step([0.3, 1]);
    ok("...and the chassis height moves as it drives over the terrain",
        Math.abs(e2.y - y0) > 1e-4, `dy=${(e2.y - y0).toFixed(4)} m`);
}

// ---- 4. ONE SET OF AXES ------------------------------------------------------------------------------------
console.log("\n4. *** THE OBSERVATION AND THE INTEGRATOR SHARE _axes() -- two copies drove the car away ***");
{
    // Drive straight at a goal the observation says is dead ahead. If the frames disagree, the range grows.
    const env = mk({ bumpiness: 0 });
    env.reset(1); env.x = 0; env.z = 0; env.heading = 0; env.vx = 0; env.vz = 0;
    const ax = env._axes(); env.gx = ax.fx * 60; env.gz = ax.fz * 60;
    env._prevDist = Math.hypot(env.gx, env.gz);
    let o = env._obs();
    ok("a goal placed straight ahead reads as forward, not sideways",
        o[0] > 0.4 && Math.abs(o[1]) < 1e-6, `relF=${o[0].toFixed(3)} relR=${o[1].toFixed(3)}`);
    const d0 = env._prevDist;
    let last = null;
    for (let t = 0; t < 60; t++) last = env.step([0, 1]);
    ok("!! driving forward at it CLOSES the range -- the sign error drove steadily away instead",
        last.info.dist < d0 - 5, `${d0.toFixed(1)}m -> ${last.info.dist.toFixed(1)}m`);

    // And the steering sign: a goal on the right, held right lock, must reduce the lateral offset.
    const e2 = mk({ bumpiness: 0 });
    e2.reset(1); e2.x = 0; e2.z = 0; e2.heading = 0; e2.vx = 0; e2.vz = 0;
    const a2 = e2._axes();
    e2.gx = a2.fx * 40 + a2.rx * 40; e2.gz = a2.fz * 40 + a2.rz * 40;
    e2._prevDist = Math.hypot(e2.gx, e2.gz);
    for (let t = 0; t < 20; t++) e2.step([0, 1]);          // get rolling; steering needs speed
    const x0 = e2.x, z0 = e2.z;
    for (let t = 0; t < 30; t++) e2.step([1, 0.5]);        // full right lock
    // *** MEASURE THE DISPLACEMENT, NOT THE BEARING. *** The first version of this check asked whether the
    // goal's relRight had shrunk, and it passed under the flipped sign too: at full lock the car rotates
    // past 90 degrees either way, so the bearing changes sign whichever way it turned. Where the car
    // actually WENT cannot be satisfied by spinning.
    const side = (e2.x - x0) * a2.rx + (e2.z - z0) * a2.rz;
    ok("!! full right lock moves the car to ITS OWN RIGHT -- `heading += yaw` moved it left instead",
        side > 1, `${side.toFixed(2)} m along the initial right axis (the flipped sign measures -1.67)`);
}

// ---- 5. SLIP AND GROUNDED ARE VISIBLE ----------------------------------------------------------------------
console.log("\n5. the header's claim: two states differing only in grip must not share an observation");
{
    const env = mk({ bumpiness: 0 });
    env.reset(1); env.heading = 0; env.vx = 0; env.vz = 0;
    for (let t = 0; t < 60; t++) env.step([0, 1]);         // straight-line, gripping
    const gripping = env._obs()[5];
    for (let t = 0; t < 30; t++) env.step([1, 1]);         // full lock at speed: more yaw than the tyres hold
    const sliding = env._obs()[5];
    ok("!! slip separates a gripping car from a sliding one", sliding > gripping + 0.2,
        `grip=${gripping.toFixed(2)} slide=${sliding.toFixed(2)}`);
    ok("...and slip stays in [0,1] so the policy's input scale is bounded",
        gripping >= 0 && gripping <= 1 && sliding >= 0 && sliding <= 1);
}

// ---- 6. ROLLING IS A PROPERTY OF THE LOADOUT ---------------------------------------------------------------
console.log("\n6. *** WHETHER IT CAN ROLL IS GEOMETRY, NOT DRIVING -- and the turret is what changes it ***");
{
    const stock = mk(), turret = mk({ mounts: ROOF_TURRET });
    ok("the stock road car out-grips its own tip ratio: it slides wide, it does not roll",
        stock._canRoll === false);
    ok("!! a 400 kg turret at 2.4 m moves the SAME car across the threshold",
        turret._canRoll === true);
    const closed = rollsBeforeSliding({ grip: 0.9, trackWidth: stock.car.trackWidth, cogHeight: stock.cog[1] });
    ok("...and the env asks physics/vehicle.mjs rather than deciding for itself",
        stock.rollability.rolls === closed.rolls);
    // Measured, not asserted from the formula: the same driver, the two loadouts.
    const a = runExpert(stock, SEEDS), b = runExpert(turret, SEEDS);
    ok("!! the same expert never rolls the stock car and DOES roll the turret one",
        a.rolled === 0 && b.rolled > 0, `stock ${a.rolled} rolls, turret ${b.rolled} rolls of ${SEEDS.length}`);
    ok("...and the turret costs arrivals, which is the loadout mattering to the task",
        b.arrived < a.arrived, `stock ${a.arrived}/${SEEDS.length}, turret ${b.arrived}/${SEEDS.length}`);
}

// ---- 7. THE HAND EXPERT IS A FLOOR WORTH BEATING -----------------------------------------------------------
console.log("\n7. the hand driver, which is the floor and the imitation source");
{
    const env = mk();
    const e = runExpert(env, SEEDS);
    ok("!! the expert arrives on every training seed -- it braked at a fixed distance and arrived 0 times",
        e.arrived === SEEDS.length, `${e.arrived}/${SEEDS.length}  avgReturn ${e.ret.toFixed(1)}`);
    ok("...no episode is stuck at a standstill", e.stuck === 0);
    const h = runExpert(mk(), HELD);
    ok("...and on seeds it was never tuned against", h.arrived >= HELD.length - 1,
        `${h.arrived}/${HELD.length}  avgDist ${h.dist.toFixed(1)}m`);
    // Determinism: the same seed is the same drive, or no comparison in this file means anything.
    const r1 = runExpert(mk(), [777]), r2 = runExpert(mk(), [777]);
    ok("the env is deterministic in its seed", r1.ret === r2.ret && r1.dist === r2.dist);
}

// ---- 8. THE TRAINER MEASURES THE TASK IT TRAINS ON ---------------------------------------------------------
console.log("\n8. *** trainDockES's OWN VERDICT MUST SURVIVE RE-EVALUATION -- it disagreed 0.21 against 1.0 ***");
{
    const common = { envFactory: mk, obsDim: OBS_DIM, hidden: [16, 16], maxSteps: MS };
    const short = trainDockES({ ...common, iters: 4, pop: 4, sigma: 0.14, lr: 0.05, seed: 3, trainEps: 4 });
    const re = evaluate(short.params, { ...common, episodes: 24 });
    ok("!! the params the trainer returns re-evaluate to the numbers it reported for them",
        Math.abs(re.avgReturn - short.best.avgReturn) < 1e-9 && re.dockRate === short.best.dockRate,
        `best ${short.best.avgReturn.toFixed(3)} / re-eval ${re.avgReturn.toFixed(3)}`);
    const src = fs.readFileSync(path.join(ROOT, "brain", "rl", "dockPolicy.js"), "utf8");
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
                        .replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
    ok("...because the episode budget reaches evaluate() through evOpts",
        /evOpts\s*=\s*\{[^}]*maxSteps:\s*opts\.maxSteps/.test(codeOnly));
}

// ---- 9. IT LEARNS TO DRIVE ---------------------------------------------------------------------------------
console.log("\n9. *** THE POINT OF THE ROUND: a policy that has never driven, taught by reward alone ***");
{
    const common = { envFactory: mk, obsDim: OBS_DIM, hidden: [16, 16], maxSteps: MS };
    const env = mk();
    const bench = (p) => {
        let a = 0, ret = 0, d = 0;
        for (const s of HELD) { const x = rollout(p, env, s); ret += x.total; d += x.dist; if (x.docked) a++; }
        return { a, ret: ret / HELD.length, d: d / HELD.length };
    };
    const before = bench(new FlightPolicy({ hidden: [16, 16], obsDim: OBS_DIM, seed: 3 }));
    const t0 = Date.now();
    const res = trainDockES({ ...common, iters: 200, pop: 24, sigma: 0.14, lr: 0.05, seed: 3, trainEps: 10 });
    const after = bench(new FlightPolicy({ hidden: [16, 16], obsDim: OBS_DIM }).setParams(res.params));
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`  UNTRAINED: arrivals ${before.a}/${HELD.length}  avgReturn ${before.ret.toFixed(1)}  avgDist ${before.d.toFixed(1)}m`);
    console.log(`  TRAINED:   arrivals ${after.a}/${HELD.length}  avgReturn ${after.ret.toFixed(1)}  avgDist ${after.d.toFixed(1)}m   (${secs}s)`);
    ok("an untrained policy arrives nowhere", before.a === 0);
    ok("!! *** the trained policy arrives, on HELD-OUT seeds the trainer never evaluated on ***",
        after.a >= 20, `${after.a}/${HELD.length}`);
    ok("...and it is not memorisation: training only ever evaluates seeds 5000 + k*17",
        HELD.every(s => s < 5000 || (s - 5000) % 17 !== 0 || s > 5000 + 40 * 17));
    ok("...closing to inside the goal ring rather than merely pointing at it", after.d < 8,
        `avgDist ${after.d.toFixed(1)}m vs goal radius 6m`);
}

// ---- 10. THE ENV STAYS A CONSUMER OF THE VEHICLE MODEL ------------------------------------------------------
console.log("\n10. it drives physics/vehicle.mjs and owns no second copy of it");
{
    const src = fs.readFileSync(path.join(ROOT, "brain", "rl", "driveEnv.js"), "utf8");
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
                        .replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
    ok("!! the suspension, friction circle and load transfer are IMPORTED, not restated",
        /suspensionAt/.test(codeOnly) && /tyreForces/.test(codeOnly) && /lateralLoadTransfer/.test(codeOnly)
        && /from\s*""/.test(codeOnly.slice(codeOnly.indexOf("import"))));
    ok("...there is no second spring formula in the file",
        !/stiffness\s*\*\s*compression/.test(codeOnly));
    ok("...and no second friction limit either",
        !/grip\s*\*\s*normal/i.test(codeOnly));
    ok("it brings no trainer of its own -- trainDockES drives it unchanged",
        !/function\s+train/.test(codeOnly));
    ok("!! _axes() exists and is the only place the heading becomes a direction",
        (codeOnly.match(/Math\.cos\(this\.heading\)/g) || []).length === 1);
}

console.log("\ndriveEnv-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
