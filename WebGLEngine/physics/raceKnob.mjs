// WebGLEngine/physics/raceKnob.mjs -- v4527
// ---------------------------------------------------------------------------------------------------------------
// THE RACE AS A LAB SCENE: A DRIVER IS A KNOB, THE PROPOSER WANTS THE FAST ONE, AND THE KEY IS A TRACK IT NEVER SAW.
//
// Racing city 4. brain/drivePolicy.mjs (v4526) has a hand policy whose drive output is
//     drive = drive0 - turn * |turn12| - speedGain * (speed / 20)
// so ONE number decides how hard the car goes: a small speedGain is a fast driver, a large one a slow driver. That
// number is the knob, in the lab's own contract (physics/proposers.mjs):
//
//     propose()            -> speedGain candidates spanning both failure modes and the good band
//     score(g)             -> CHEAP and OPTIMISABLE: lap progress in metres over 30 s on the TRAINING track, seed 1.
//                             Higher is faster. The proposer maximises this and sees nothing else.
//     adjudicate(g)        -> EXPENSIVE and INDEPENDENT: 90 s on two tracks the score never sees, the held-out seed 2
//                             and the audit seed 3. Pass iff on BOTH the car laps, laps inside LAP_BOUND seconds, and
//                             leaves the asphalt on at most OFF_BOUND of its wheel samples.
//
// *** THE SCORE AND THE KEY DISAGREE, WHICH IS WHAT MAKES THIS AN ADJUDICATION AND NOT A RUBBER STAMP. *** The score
// is highest at a SMALL speedGain -- 275 m in 30 s at 0.3, then 264 at 0.15, then 263 at 0.5 -- and both of the
// score's favourites are refused: they take the corners across the grass on a track they never saw (0.3: 1351
// off-asphalt samples of 21,600 on seed 3; 0.15: 2065, and no lap at all there because it hits a building). The
// proposer's favourite is the key's first refusal. At the other end a large speedGain never laps
// inside the bound (4 and 8 travel 244 and 134 m in 90 s), so the adjudicator refuses at BOTH ends for two
// different stated reasons -- too fast to stay on the road, too slow to finish -- and accepts between. That is the
// property knobRegistry-selfcheck holds every registered adjudicator to: a control that can say both yes and no.
//
// AND THE KEY IS NOT THE SCORE ON A DIFFERENT DAY: the score is metres on seed 1, the key is laps, lap time and
// asphalt on seeds 2 and 3 -- different tracks (drivePolicy.TRAIN_SEEDS, HELD_OUT_SEEDS, AUDIT_SEEDS) and different
// quantities. A driver that memorised seed 1's corners is exactly what seed 2 exists to catch (v4526 measured one
// training seed overfitting to 2 m on the held-out track).
//
// THE REPLAY. An accepted candidate is worth keeping as the thing that was accepted, not as a number: replay(g)
// runs the accepted driver's race on the held-out track and returns a RECORD -- the seed, the seconds, the fleet
// fingerprint, the weights and their hash, the per-tick input log and the state fingerprint -- and
// replayRecord(rec) runs the log again with no policy at all and must reach the same fingerprint. The bridge
// stores the record beside the lab's other state when the route accepts a candidate; race-brain.html plays it
// back. NOT REAL TIME, and said so on both pages: the adjudication runs in node through the bridge (2 x 90 s of
// box3d in about 0.7 s), and the lab page's view of the scene is a schematic stepped at whatever rate the frame
// allows.
//
// MEASURED (this box, 90 s episodes, off = off-asphalt wheel samples of 21,600):
//     speedGain   seed 2                      seed 3                       verdict
//     0.15        2 laps, 39.8 s, off 1379    0 laps, 1029 m, off 2065     REFUSED: off the road, and no lap on seed 3
//     0.3         2 laps, 37.8 s, off 0       1 lap,  75.4 s, off 1351     REFUSED: 6.3% off-asphalt on seed 3
//     0.5         2 laps, 39.3 s, off 0       2 laps, 39.6 s, off 70       ACCEPTED (0.3% off on seed 3)
//     0.8         2 laps, 44.8 s, off 0       2 laps, 44.8 s, off 0        accepted
//     1.2         1 lap,  56.5 s, off 0       1 lap,  56.3 s, off 0        accepted (the v4526 hand policy)
//     2           1 lap,  80.3 s, off 0       1 lap,  79.4 s, off 0        REFUSED: over the 80 s lap bound on seed 2
//     4           0 laps, 244 m               0 laps, 250 m                REFUSED: no lap
//     8           0 laps, 134 m               0 laps, 134 m                REFUSED: no lap
//     30 s score on seed 1: 0.3 -> 275 m, 0.15 -> 264, 0.5 -> 263, 0.8 -> 227, 1.2 -> 177, 2 -> 124, 4 -> 70, 8 -> 39
// So runProposer walks 0.3 (refused), 0.15 (refused), 0.5 (ACCEPTED at rank 2): the answer is the fastest driver the
// key will stand behind, which is not the driver the score would have picked.
//
// Run: node tools/ship/raceKnob-selfcheck.mjs
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import * as D from "../brain/drivePolicy.mjs";
import { worldFromModule } from "../render/slugTicker.mjs";
import { CAR } from "./raceCar.mjs";

export const KNOB = "speedGain";
export const CANDIDATES = Object.freeze([0.15, 0.3, 0.5, 0.8, 1.2, 2, 4, 8]);
export const SCORE_SECONDS = 30;
export const KEY_SECONDS = 90;
export const KEY_SEEDS = Object.freeze([...D.HELD_OUT_SEEDS, ...D.AUDIT_SEEDS]);   // [2, 3]: tracks the score never sees
export const SCORE_SEED = D.TRAIN_SEEDS[0];                                        // 1
/** A lap slower than this is not a driver the lab wants, whatever else is true of it. */
export const LAP_BOUND = 80;
/** The fraction of wheel samples that may leave the asphalt: 1% of 90 s x 60 Hz x 4 wheels = 216 samples. */
export const OFF_BOUND = 0.01;

// ---- the physics module: box3d's wasm, brought in by whoever runs this ---------------------------------------------
// The registry's adjudicate() is synchronous, so the wasm must be ready BEFORE a proposer runs. In node the module
// is the same one every racing gate uses (physics/box3d/box3dNode.mjs); a page that wants this module hands it
// box3d._mod through setModule() after box3d.init(). Nothing here imports node built-ins, so the file loads anywhere.
let MOD = null;
export function setModule(m) { MOD = m || null; return !!MOD; }
export function isReady() { return !!MOD; }
/** In node: load the vendored wasm through box3dNode and install it. Idempotent. */
export async function ready() {
    if (MOD) return true;
    const N = await import("./box3d/box3dNode.mjs");
    await N.initNode(); MOD = N.mod();
    return !!MOD;
}
const worldFrom = () => worldFromModule(MOD, [0, -9.81, 0]);
const NOT_READY = "box3d is not initialised -- await raceKnob.ready() (node) or setModule(box3d._mod) (browser) first";

/** The driver a knob value names: the v4526 hand policy with its speed gain replaced. */
export function driverOf(speedGain) { return D.handWeights({ speed: speedGain }); }

/** THE SCORE: metres of lap progress in SCORE_SECONDS on the training track. Higher is faster. -Infinity for a knob that is not a positive number. */
export function score(speedGain, opts = {}) {
    if (!Number.isFinite(speedGain) || speedGain <= 0 || !MOD) return -Infinity;
    const e = D.episode(worldFrom, driverOf(speedGain), D.surfaceFor(SCORE_SEED), { seconds: opts.scoreSeconds || SCORE_SECONDS });
    return e.metres;
}

/** One key run: the driver on one track for KEY_SECONDS, reduced to the facts the verdict reads. */
export function keyRun(speedGain, seed, opts = {}) {
    const secs = opts.keySeconds || KEY_SECONDS;
    const e = D.episode(worldFrom, driverOf(speedGain), D.surfaceFor(seed), { seconds: secs });
    const samples = Math.round(secs / CAR.dt) * 4;
    return { seed, laps: e.laps, lapTime: e.lapTime, metres: e.metres, off: e.off, offFrac: e.off / samples, samples, fingerprint: e.fingerprint };
}

/**
 * THE ADJUDICATOR. Refuses at both ends for two different stated reasons and accepts between.
 * Returns { pass, evidence } in the shape grantLicence re-checks; the evidence names the seed that refused and why.
 */
export function adjudicate(speedGain, opts = {}) {
    if (!MOD) return { pass: false, evidence: { speedGain, reason: NOT_READY } };
    if (!Number.isFinite(speedGain) || speedGain <= 0)
        return { pass: false, evidence: { speedGain, reason: "a speed gain must be finite and positive" } };
    const runs = KEY_SEEDS.map((seed) => keyRun(speedGain, seed, opts));
    const reasons = [];
    for (const r of runs) {
        if (r.laps < 1) reasons.push(`seed ${r.seed}: no lap in ${opts.keySeconds || KEY_SECONDS} s (${r.metres.toFixed(0)} m)`);
        else if (r.lapTime > LAP_BOUND) reasons.push(`seed ${r.seed}: lap ${r.lapTime.toFixed(1)} s over the ${LAP_BOUND} s bound`);
        if (r.offFrac > OFF_BOUND) reasons.push(`seed ${r.seed}: ${(100 * r.offFrac).toFixed(1)}% of wheel samples off the asphalt (bound ${100 * OFF_BOUND}%)`);
    }
    return { pass: reasons.length === 0,
             evidence: { speedGain, seeds: KEY_SEEDS.slice(), runs, lapBound: LAP_BOUND, offBound: OFF_BOUND,
                         law: "on two tracks the score never sees, the car must lap inside the bound with its wheels on the asphalt; " +
                              "the score is metres on a third track and cannot move this",
                         reason: reasons.length ? reasons.join("; ") : "laps both held-out tracks inside the bounds" } };
}

/** Candidates spanning BOTH failure modes as well as the good band. A search that only offers values its own key accepts has already decided. */
export function propose({ current = null } = {}) { return CANDIDATES.filter((v) => v !== current); }

// ---- the replay ---------------------------------------------------------------------------------------------------
/** The accepted driver's race on the held-out track, as a record that replays without the driver. */
export function replay(speedGain, opts = {}) {
    if (!MOD) throw new Error(NOT_READY);
    const w = driverOf(speedGain), seed = opts.seed || KEY_SEEDS[0], seconds = opts.seconds || KEY_SECONDS;
    const fleet = D.machineFingerprint(MOD);
    const r = D.race(worldFrom, [w], { seed, seconds, fleet });
    return { kind: "swek-race-replay", scene: "race", knob: { [KNOB]: speedGain }, seed, seconds, fleet, ticks: r.ticks,
             weightsHash: D.weightsHash(w), weights: Array.from(w), log: r.log, fingerprint: r.fingerprint,
             results: r.results.map((q) => ({ car: q.car, laps: q.laps, metres: q.metres, lapTime: q.lapTime })),
             note: "NOT REAL TIME: replayed by feeding the log back into box3d, one input per tick, with no policy" };
}
/** Run a record's log again with no policy; the fingerprint must equal the record's. */
export function replayRecord(rec) {
    if (!MOD) throw new Error(NOT_READY);
    if (!rec || rec.kind !== "swek-race-replay" || !Array.isArray(rec.log)) throw new Error("not a swek-race-replay record");
    const p = D.replay(worldFrom, { seed: rec.seed, seconds: rec.seconds, fleet: rec.fleet, log: rec.log, ticks: rec.ticks });
    return { fingerprint: p.fingerprint, same: p.fingerprint === rec.fingerprint, results: p.results.map((q) => ({ car: q.car, laps: q.laps, metres: q.metres, lapTime: q.lapTime })) };
}

export const MEASURED_V4527 = Object.freeze({
    at: "v4527", keySeconds: KEY_SECONDS, samples: 21600,
    rows: Object.freeze([
        Object.freeze({ speedGain: 0.15, seed2: { laps: 2, lapTime: 39.8, off: 1379 }, seed3: { laps: 0, metres: 1029, off: 2065 }, verdict: "refused: off the road, no lap on seed 3" }),
        Object.freeze({ speedGain: 0.3, seed2: { laps: 2, lapTime: 37.8, off: 0 }, seed3: { laps: 1, lapTime: 75.4, off: 1351 }, verdict: "refused: 6.3% off-asphalt on seed 3" }),
        Object.freeze({ speedGain: 0.5, seed2: { laps: 2, lapTime: 39.3, off: 0 }, seed3: { laps: 2, lapTime: 39.6, off: 70 }, verdict: "accepted" }),
        Object.freeze({ speedGain: 0.8, seed2: { laps: 2, lapTime: 44.8, off: 0 }, seed3: { laps: 2, lapTime: 44.8, off: 0 }, verdict: "accepted" }),
        Object.freeze({ speedGain: 1.2, seed2: { laps: 1, lapTime: 56.5, off: 0 }, seed3: { laps: 1, lapTime: 56.3, off: 0 }, verdict: "accepted" }),
        Object.freeze({ speedGain: 2, seed2: { laps: 1, lapTime: 80.3, off: 0 }, seed3: { laps: 1, lapTime: 79.4, off: 0 }, verdict: "refused: over the lap bound on seed 2" }),
        Object.freeze({ speedGain: 4, seed2: { laps: 0, metres: 244 }, seed3: { laps: 0, metres: 250 }, verdict: "refused: no lap" }),
        Object.freeze({ speedGain: 8, seed2: { laps: 0, metres: 134 }, seed3: { laps: 0, metres: 134 }, verdict: "refused: no lap" }),
    ]),
    scores30s: Object.freeze({ 0.15: 264.3, 0.3: 275.4, 0.5: 263.1, 0.8: 226.9, 1.2: 176.8, 2: 123.5, 4: 69.8, 8: 38.7 }),
    acceptedRank: 2, accepted: 0.5,
    key: "*** THE SCORE'S FAVOURITE IS THE KEY'S FIRST REFUSAL: speed gain 0.3 travels furthest on the training track " +
         "(275 m in 30 s) and leaves the asphalt on 1351 of 21,600 wheel samples on a track it never saw *** -- so " +
         "the accepted driver is the fastest one the held-out tracks will stand behind, at rank 2, and the adjudicator " +
         "refuses at both ends for two different stated reasons: off the road below 0.5, over the 80 s lap bound from 2 up.",
});

export function reportLines() {
    const L = [];
    L.push("[raceKnob] the race as a lab scene: speedGain proposed, scored on seed 1, adjudicated on seeds 2 and 3");
    L.push(`  knob ${KNOB}; candidates ${CANDIDATES.join(", ")}; score = metres in ${SCORE_SECONDS} s on seed ${SCORE_SEED}; key = ${KEY_SECONDS} s on seeds ${KEY_SEEDS.join(", ")}, lap <= ${LAP_BOUND} s, off-asphalt <= ${100 * OFF_BOUND}%`);
    for (const r of MEASURED_V4527.rows) L.push(`  ${String(r.speedGain).padEnd(5)} seed 2 ${r.seed2.laps} laps${r.seed2.lapTime ? " " + r.seed2.lapTime + " s" : ""}; seed 3 ${r.seed3.laps} laps${r.seed3.lapTime ? " " + r.seed3.lapTime + " s" : ""}${r.seed3.off != null ? " off " + r.seed3.off : ""} -- ${r.verdict}`);
    L.push("  " + MEASURED_V4527.key);
    return L;
}
