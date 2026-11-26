// WebGLEngine/brain/subReconcileNav.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 13" of brain/SUB_FIELD_NAV_WIP.md, written before this file; the gate is
// brain/subReconcileNav-selfcheck.mjs)
//
// THE TWO MISSION SERIES, RECONCILED. Main flew three-leg missions with brain/navMission.mjs (HELD83: the reference completed 5 of 60 and ran flat on 41); series B flew them with
// brain/subMissionNav.mjs (HELD10: the reference ran out of energy on 1 of 60). This module changes neither: it CONVERTS a mission from one series' shape to the other's, so each flyer can fly the
// other's missions (PART A), and it builds the chord bins of PART B (series B's generator with its chord window set per bin, on the seeds the registration names). Both flyers plan and fly
// through brain/subHardNav.mjs and meter energy from the needs model's power; nothing is copied. No clock, no Math.random.
"use strict";
import * as H from "./subHardNav.mjs";
import * as SB from "./subMissionNav.mjs";
import * as MN from "./navMission.mjs";
import * as AP from "./autopilotSub.mjs";

export const REFERENCE = "any+predict+edge+yield", SLOW = "any+predict+edge+yield@2.5", KIND = "hard-traffic";
export const BINS = Object.freeze([[600, 750], [750, 900], [900, 1050], [1050, 1200]].map((b) => Object.freeze(b)));
export const PER_BIN = 30, TRIES = 60, DRAWS = 20000, BIN_FIRST = Object.freeze([13001, 13101, 13201, 13301]);
export const OUTCOMES = Object.freeze(["completed", "energy-out", "collided", "left", "timeout"]);
export const pilot = (s, t, c) => AP.decide(s, t, c);

// the two flyers name the same outcomes differently: B's "complete" and "energy-out", main's "completed" and "flat"; the vessel's own statuses pass through unchanged
const NAMES = Object.freeze({ complete: "completed", completed: "completed", "energy-out": "energy-out", flat: "energy-out", collided: "collided", left: "left", timeout: "timeout" });
/** The outcome a flyer's status names, in the shared vocabulary of OUTCOMES (a status of the vessel's own is returned as it is). */
export const outcomeOf = (status) => NAMES[status] ?? String(status);

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
/** The chord sum of a mission: the straight lines start -> waypoint 1 -> 2 -> 3. */
export const chordOf = (start, points) => points.reduce((s, p, i) => s + dist(i === 0 ? start : points[i - 1], p), 0);
/** The chord at which a battery of `batteryJ` is spent flying at `jPerM` joules a metre over a path `pathOverChord` times the chord (927 m for 2,675 J/m, 3 MJ and 1.21). */
export const breakEvenChord = (jPerM, pathOverChord, batteryJ) => batteryJ / jPerM / pathOverChord;

/** A mission of series B's shape ({ seed, scenario (minDepth the shallowest of the start and every waypoint), points, chords, chord, draws, dropped }) from main's ({ seed, sc, waypoints }). */
export function toBMission(m) {
    const sc = m.sc, pts = m.waypoints.map((p) => Object.freeze({ x: p.x, y: p.y, depth: p.depth })), md = Math.min(sc.start.depth, ...pts.map((p) => p.depth));
    const chords = pts.map((p, i) => dist(i === 0 ? sc.start : pts[i - 1], p));
    return { seed: m.seed, scenario: Object.freeze({ ...sc, minDepth: md }), points: pts, chords, chord: chords[0] + chords[1] + chords[2], draws: 0, dropped: false };
}
/** A mission of main's shape from series B's: the scenario as hardScenario draws it (main's flyer sets the minimum depth leg by leg) and the points as the waypoints. */
export function toMainMission(b) {
    return Object.freeze({ seed: b.seed, sc: H.hardScenario(b.seed, KIND), waypoints: Object.freeze(b.points.map((p) => Object.freeze({ x: p.x, y: p.y, depth: p.depth }))) });
}
/** The seeds a bin may use: TRIES consecutive seeds from the bin's first. */
export const binSeeds = (bin) => Array.from({ length: TRIES }, (_, i) => BIN_FIRST[bin] + i);
/**
 * The missions of a bin: series B's generator with its chord window set to the bin's, DRAWS draws, over the bin's seeds in order, the first PER_BIN that place a mission; the seeds that could
 * not place one before the bin was full are SKIPPED and returned; `short` is true when the bin could not reach PER_BIN. `over` overrides the acceptance rule (the gate passes a tiny `draws`).
 */
export function binMissions(bin, over = {}) {
    const [lo, hi] = BINS[bin], W = { ...SB.WAYPOINT, chordLo: lo, chordHi: hi, draws: DRAWS, ...over }, placed = [], skipped = [];
    for (const seed of binSeeds(bin)) {
        if (placed.length >= PER_BIN) break;
        const m = SB.missionFor(seed, W);
        if (m.dropped) skipped.push(seed); else placed.push(m);
    }
    return { bin, window: [lo, hi], placed, skipped, short: placed.length < PER_BIN };
}

/** The record of one flight in the shared shape: { flyer, seed, arm, outcome, legs, path, energy (J), chord, t, ticks }. */
function shared(flyer, seed, arm, chord, r, energy) {
    return { flyer, seed, arm, outcome: outcomeOf(r.status), status: r.status, legs: r.legs, path: r.path, energy, chord, t: r.t, ticks: r.ticks };
}
/** Series B's flyer on a mission of main's shape (its own caps and minimum-depth rule). */
export function flyBOnMain(m, arm = REFERENCE) {
    const b = toBMission(m), r = SB.flyMission(pilot, b, arm);
    return shared("b", m.seed, arm, b.chord, r, r.energyUsed);
}
/** Series B's flyer on a mission of its own shape (what HELD10 flew; PART B's flights). */
export function flyB(b, arm = REFERENCE) {
    const r = SB.flyMission(pilot, b, arm);
    return shared("b", b.seed, arm, b.chord, r, r.energyUsed);
}
/** Main's flyer on a mission of series B's shape (its own caps, 260 s a leg, and its leg-by-leg minimum depth). */
export function flyMainOnB(b, arm = REFERENCE) {
    const m = toMainMission(b), r = MN.flyMission(m, arm);
    return shared("main", b.seed, arm, b.chord, r, r.energy);
}
/** Main's flyer on a mission of its own shape (what HELD83 flew). */
export function flyMain(m, arm = REFERENCE) {
    const r = MN.flyMission(m, arm);
    return shared("main", m.seed, arm, toBMission(m).chord, r, r.energy);
}
