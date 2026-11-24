// WebGLEngine/tools/ship/subFleetStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 12" in brain/SUB_FIELD_NAV_WIP.md, the gate is tools/ship/subFleetStudy-selfcheck.mjs)
//
// THE STUDY OF A FLEET OF COURIERS: flies N couriers together through the tank's sea (brain/subFleetNav.mjs) at two fleet sizes under two arms (the tank navigator that does not see the other subs, and `fleet` that does) and reads the registered verdict and F1 to F6.
//   node tools/ship/subFleetStudy.mjs --set dev [--seeds N]                DEV (seeds 1 to 10): the sanity run; not a result
//   node tools/ship/subFleetStudy.mjs --set held12 [--seeds N] [--write]    HELD12, seeds 1201 to 1230, READ ONCE; --write puts every fleet run in brain/subFleetHeld12.jsonl
//   --seconds S (DEV only; default 240) shortens a run for the gate; HELD12 is always 240 s.
// Pure apart from the file --write puts down. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as F from "../../brain/subFleetNav.mjs";
import * as AP from "../../brain/autopilotSub.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT = "brain/subFleetHeld12.jsonl", SETS = F.SETS;
export const THRESH = Object.freeze({ contactFraction: 0.5, arrivalFraction: 0.9, seaSlack: 1.1, noRoute: 0.05, medianContacts: 1 });
export const pilot = (s, t, c) => AP.decide(s, t, c);
export const cellKey = (n, arm) => `${n}|${arm}`;

/** The median of a list (the mean of the two middle values when the count is even); NaN for an empty list. */
export function median(xs) {
    if (!xs.length) return NaN;
    const a = xs.slice().sort((p, q) => p - q), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
/** { "n|arm": { n, arm, runs, subs, subContacts, seaHits, arrivals, travel, plans, noRoutePlans, lost, medianContacts (per run) } } in SIZES then FLEET_ARMS order, only the cells flown. */
export function summarize(runs) {
    const cells = {};
    for (const n of F.SIZES) for (const arm of F.FLEET_ARMS) {
        const rs = runs.filter((r) => r.n === n && r.arm === arm);
        if (!rs.length) continue;
        const sum = (k) => rs.reduce((m, r) => m + r[k], 0);
        cells[cellKey(n, arm)] = { n, arm, runs: rs.length, subs: sum("subs"), subContacts: sum("subContacts"), seaHits: sum("seaHits"), arrivals: sum("arrivals"), travel: sum("travel"), plans: sum("plans"), noRoutePlans: sum("noRoutePlans"), lost: sum("lost"), medianContacts: median(rs.map((r) => r.subContacts)) };
    }
    return cells;
}
const pooled = (cells, arm, k) => F.SIZES.reduce((m, n) => m + ((cells[cellKey(n, arm)] || {})[k] || 0), 0);
/**
 * The verdict and F1 to F6 (brain/SUB_FIELD_NAV_WIP.md, "FOLLOW-UP 12"), the sizes pooled. GAIN (F2): the designated arm's sub contacts are at most THRESH.contactFraction of the reference's. KEEPS MOVING (F3): its arrivals are at least THRESH.arrivalFraction of the reference's.
 * SUPPORTED if both, PARTLY SUPPORTED if one, NOT SUPPORTED otherwise. F1: the reference's median N = 8 run has at least THRESH.medianContacts sub contacts. F4: the designated arm's sea contacts are at most THRESH.seaSlack times the reference's. F5: at least THRESH.noRoute of the designated arm's plans find no route.
 * F6: the fleet / reference sub-contact ratio is lower at N = 4 than at N = 8. A missing cell is a miss, never a throw.
 */
export function judge(cells) {
    const rc = pooled(cells, F.REFERENCE, "subContacts"), dc = pooled(cells, F.DESIGNATED, "subContacts"), ra = pooled(cells, F.REFERENCE, "arrivals"), da = pooled(cells, F.DESIGNATED, "arrivals");
    const flown = !!cells[cellKey(4, F.REFERENCE)] || !!cells[cellKey(8, F.REFERENCE)], gain = flown && (!!cells[cellKey(4, F.DESIGNATED)] || !!cells[cellKey(8, F.DESIGNATED)]) && dc <= THRESH.contactFraction * rc, moves = flown && ra > 0 && da >= THRESH.arrivalFraction * ra;
    const ratio = (n) => { const r = cells[cellKey(n, F.REFERENCE)], d = cells[cellKey(n, F.DESIGNATED)]; return r && d && r.subContacts > 0 ? d.subContacts / r.subContacts : NaN; };
    const r8 = cells[cellKey(8, F.REFERENCE)], d = (k) => pooled(cells, F.DESIGNATED, k);
    return { gain, moves, verdict: gain && moves ? "SUPPORTED" : gain || moves ? "PARTLY SUPPORTED" : "NOT SUPPORTED", f1: !!r8 && r8.medianContacts >= THRESH.medianContacts, f2: gain, f3: moves, f4: d("runs") > 0 && d("seaHits") <= THRESH.seaSlack * pooled(cells, F.REFERENCE, "seaHits"), f5: d("plans") > 0 && d("noRoutePlans") / d("plans") >= THRESH.noRoute, f6: Number.isFinite(ratio(4)) && Number.isFinite(ratio(8)) && ratio(4) < ratio(8), ratios: [ratio(4), ratio(8)] };
}
const f2s = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
export function table(cells, title) {
    const lines = [title, "fleet arm         | runs subs | sub contacts median/run | sea hits | arrivals | travel (km) | plans no-route | lost"];
    for (const n of F.SIZES) for (const arm of F.FLEET_ARMS) { const x = cells[cellKey(n, arm)]; if (!x) continue; lines.push(`${String(n).padStart(2)} ${arm.padEnd(12)} | ${String(x.runs).padStart(4)} ${String(x.subs).padStart(4)} | ${String(x.subContacts).padStart(12)} ${f2s(x.medianContacts).padStart(10)} | ${String(x.seaHits).padStart(8)} | ${String(x.arrivals).padStart(8)} | ${f2s(x.travel / 1000).padStart(11)} | ${String(x.plans).padStart(5)} ${String(x.noRoutePlans).padStart(8)} | ${String(x.lost).padStart(4)}`); }
    return lines.join("\n");
}
export function verdictText(j) {
    const yn = (v) => (v ? "HELD" : "MISSED"), d = F.DESIGNATED, rf = F.REFERENCE;
    return [`${d} against ${rf}, the sizes pooled: sub contacts at most ${THRESH.contactFraction} of the reference's ${yn(j.gain)}; arrivals at least ${THRESH.arrivalFraction} of the reference's ${yn(j.moves)} => ${j.verdict}`,
        `F1 the reference's median N = 8 run has at least ${THRESH.medianContacts} sub contact: ${yn(j.f1)}`, `F2 the sub-contact gain: ${yn(j.f2)}`, `F3 the arrivals are kept: ${yn(j.f3)}`, `F4 ${d}'s contacts with the sea are at most ${THRESH.seaSlack} times ${rf}'s: ${yn(j.f4)}`,
        `F5 at least ${100 * THRESH.noRoute} percent of ${d}'s plans find no route: ${yn(j.f5)}`, `F6 the fleet/reference sub-contact ratio is lower at N = 4 than at N = 8 (${j.ratios.map(f2s).join(", ")}): ${yn(j.f6)}`].join("\n");
}
/** The command as a function: returns the exit code (0 fine, 2 a bad argument). `io` is for the gate: { out, err, writeFile }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const o = { set: "dev", seeds: null, write: false, seconds: F.SECONDS_FLEET };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--set") { o.set = argv[++i]; if (!SETS[o.set]) { err(`subFleetStudy: --set needs one of ${Object.keys(SETS).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("subFleetStudy: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else if (a === "--seconds") { const v = Number(argv[++i]); if (!Number.isFinite(v) || v <= 0) { err("subFleetStudy: --seconds needs a positive number"); return 2; } o.seconds = v; }
        else { err(`subFleetStudy: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (o.write && o.set !== "held12") { err("subFleetStudy: --write goes with --set held12 only"); return 2; }
    if (o.seconds !== F.SECONDS_FLEET && o.set !== "dev") { err("subFleetStudy: --seconds goes with --set dev only (HELD12 is always 240 s)"); return 2; }
    const seeds = o.seeds ? SETS[o.set].slice(0, o.seeds) : SETS[o.set], runs = [];
    out(`${o.set.toUpperCase()} set: ${seeds.length} seas x fleets of ${F.SIZES.join(" and ")} x ${F.FLEET_ARMS.length} arms, ${o.seconds} s a run`);
    for (const seed of seeds) for (const n of F.SIZES) for (const arm of F.FLEET_ARMS) runs.push(F.flyFleet(pilot, seed, n, arm, { seconds: o.seconds }));
    const cells = summarize(runs);
    out(""); out(table(cells, `standard 500 x 300 m tank, a sub contact under ${F.CONTACT_XY} m apart and ${F.CONTACT_Z} m in depth, other subs 4 m full-depth discs, replan every 3 s, ${o.seconds} s`)); out(verdictText(judge(cells)));
    if (o.write) { writeFile(path.join(ENG, OUT), runs.map((r) => JSON.stringify({ set: o.set, ...r })).join("\n") + "\n"); out(`wrote ${runs.length} runs to ${OUT}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
