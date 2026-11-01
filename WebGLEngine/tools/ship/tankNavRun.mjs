// WebGLEngine/tools/ship/tankNavRun.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 4" of brain/SUB_FIELD_NAV_WIP.md, the gate is tools/ship/tankNavRun-selfcheck.mjs)
//
// THE DESCRIPTIVE RUN OF THE TANK'S NAVIGATION SCENE (brain/subTankNav.mjs). NOT A TEST OF THE STUDY, said in the registration: for each of 12 sea seeds (1 to 12), one PD-autopilot sub per arm is put at the SAME start (100, 150) at 25 m and flies 600 tank-seconds with its navigator; arrivals,
// contacts (hits), plans and the distance sailed are counted per sub and added per arm. Then the registration's three predictions are scored, held or missed, and move nothing:
//   T1 every arm arrives at least once in at least 10 of the 12 seas (the navigator works at all)
//   T2 the total hits are ordered straight >= any >= any+replan >= any+predict (the order of the collisions in HELD4's traffic kind)
//   T3 any+predict has at least as many arrivals as each of the other field arms
//   node tools/ship/tankNavRun.mjs [--seeds N] [--seconds S] [--write]     (--write puts one JSON line a sub in brain/tankNavRun.jsonl)
// Pure apart from the file --write puts down. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as TN from "../../brain/subTankNav.mjs";
import * as AP from "../../brain/autopilotSub.mjs";
import * as S from "../../physics/mechanics/subModel6dof.mjs";
import * as HL from "../../physics/mechanics/subHulls.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT = "brain/tankNavRun.jsonl", SEEDS = 12, SECONDS = 600, NAV_SEED = 5, MIN_SEAS = 10;
export const START = Object.freeze({ x: 100, y: 150, depth: 25, speed: 2, heading: 0 });
export const ORDER = Object.freeze(["straight", "any", "any+replan", "any+predict"]);

/** One courier: the tank's own per-sub loop (a navigator's target, the PD autopilot, the nominal hull) for `seconds` from START in sea `seed`. Returns { seed, arm, arrivals, hits, replans, travel, noRoute, lost (the vessel's own status, or null) }. */
export function flyCourier(seed, arm, { seconds = SECONDS } = {}) {
    const scene = TN.tankScene(seed), nav = TN.createNavigator(scene, { arm, seed: NAV_SEED }), model = HL.model("nominal");
    let s = S.createState({ depth: START.depth, pos: [START.x, START.y, -START.depth], speed: START.speed, heading: START.heading, model }), t = 0, lost = null;
    for (let i = 0, n = Math.round(seconds / S.DT); i < n; i++) {
        const tg = nav.step(s, t, S.DT), res = S.stepSub(model, s, AP.decide(s, tg, [0, 0, 0]), S.DT, [0, 0, 0], 0);
        s = res.state; t += S.DT;
        if (res.status !== "submerged") { lost = res.status; break; }
    }
    const k = nav.snapshot();
    return { seed, arm, arrivals: k.arrivals, hits: k.hits, replans: k.replans, travel: k.travel, noRoute: k.noRoute, lost };
}
/** The totals per arm: { arm: { subs, arrivals, hits, replans, travel, seasWithArrival, lost } }. */
export function summarize(runs) {
    const by = {};
    for (const arm of ORDER) {
        const rs = runs.filter((r) => r.arm === arm);
        by[arm] = { subs: rs.length, arrivals: rs.reduce((a, r) => a + r.arrivals, 0), hits: rs.reduce((a, r) => a + r.hits, 0), replans: rs.reduce((a, r) => a + r.replans, 0), travel: rs.reduce((a, r) => a + r.travel, 0), seasWithArrival: rs.filter((r) => r.arrivals >= 1).length, lost: rs.filter((r) => r.lost !== null).length };
    }
    return by;
}
/** The registration's T1 to T3 from a summary. T1: every arm arrives in at least MIN_SEAS seas. T2: hits straight >= any >= any+replan >= any+predict. T3: any+predict's arrivals are at least each other field arm's. */
export function judge(by) {
    const a = (arm) => by[arm] || { arrivals: NaN, hits: NaN, seasWithArrival: NaN };
    const t1 = ORDER.every((arm) => a(arm).seasWithArrival >= MIN_SEAS), t2 = a("straight").hits >= a("any").hits && a("any").hits >= a("any+replan").hits && a("any+replan").hits >= a("any+predict").hits;
    const t3 = a("any+predict").arrivals >= a("any").arrivals && a("any+predict").arrivals >= a("any+replan").arrivals;
    return { t1, t2, t3 };
}
export function table(by) {
    const lines = ["arm          | subs | arrivals | hits | seas with an arrival | plans | sailed (km) | lost"];
    for (const arm of ORDER) { const x = by[arm]; lines.push(`${arm.padEnd(12)} | ${String(x.subs).padStart(4)} | ${String(x.arrivals).padStart(8)} | ${String(x.hits).padStart(4)} | ${String(x.seasWithArrival).padStart(20)} | ${String(x.replans).padStart(5)} | ${(x.travel / 1000).toFixed(1).padStart(11)} | ${x.lost}`); }
    return lines.join("\n");
}
export function verdictText(j) {
    const yn = (v) => (v ? "HELD" : "MISSED");
    return [`T1 every arm arrives at least once in at least ${MIN_SEAS} seas: ${yn(j.t1)}`, `T2 total hits straight >= any >= any+replan >= any+predict: ${yn(j.t2)}`, `T3 any+predict has at least as many arrivals as each other field arm: ${yn(j.t3)}`].join("\n");
}
/** The command as a function: returns the exit code (0 fine, 2 a bad argument). `io` is for the gate: { out, err, writeFile }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const o = { seeds: SEEDS, seconds: SECONDS, write: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--seeds" || a === "--seconds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err(`tankNavRun: ${a} needs a positive whole number`); return 2; } o[a.slice(2)] = v; }
        else { err(`tankNavRun: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    const runs = [];
    for (let seed = 1; seed <= o.seeds; seed++) for (const arm of ORDER) runs.push(flyCourier(seed, arm, { seconds: o.seconds }));
    out(`${o.seeds} seas x ${ORDER.length} arms, ${o.seconds} tank-seconds each, one PD-autopilot sub from (${START.x}, ${START.y}) at ${START.depth} m (DESCRIPTIVE, not a test of the study)`);
    out(table(summarize(runs))); out(verdictText(judge(summarize(runs))));
    if (o.write) { writeFile(path.join(ENG, OUT), runs.map((r) => JSON.stringify(r)).join("\n") + "\n"); out(`wrote ${runs.length} subs to ${OUT}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
