// WebGLEngine/tools/ship/takeLoomBench.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE DARK-LOOMING PATHWAYS ON A LOOM-RESPONSE BENCH. vendor/male-cns/PROVENANCE.md: LC6 and LC16 are NOT a second route to the Giant Fiber -- their direct output onto
// descending neurons is small beside LC4's and LPLC2's, and goes to DNp103 (LC6, directly and through PVLP151, whose synapses onto DNp103 mostly CROSS THE MIDLINE) and pIP1
// (LC16). Keith: "Loom-response bench" -- what do they carry, then, that the LC4/LPLC2 input to the Giant Fiber does not?
//
//   node tools/ship/takeLoomBench.mjs             compute the readings ONCE, write brain/loomBench.reading.json, print them; a second read is refused
//
// THE CONTRAST, LC4/LPLC2: the tree's published Giant Fiber input (brain/flyGfLoomModel.mjs, Ache et al. 2019) is ONE potential, the weighted sum of LC4's velocity term
//   and LPLC2's size term for one disk at one place: it carries the loom's TIME COURSE and no SIDE, by construction (the escape is bilateral). Nothing on this bench is
//   compared with it number for number: the bench asks the one thing the Giant Fiber input cannot say -- WHICH SIDE the loom is on.
// THE MODEL (brain/flyTracking.mjs pathwayOf, the LC10a and LC11 pathways' model, unchanged): a loom at bearing e (e > 0 on the fly's LEFT) drives one eye's LC cells at
//   their places on the sheet (a Gaussian in rank, LC10a's sigma, the eyes overlapping by 15 degrees), the connectome's own signed weights (each connection's synapse
//   count over its target's total, the sign the source's predicted transmitter) carry it three steps with a constant drive on the descending neurons; the read-out is
//   the two descending neurons' activities, left (L) and right (R). HAND-SET, NOT THE FLY'S: a loom is a drive of 1 at one bearing (no size, no time course, no dark
//   against bright -- the bench asks about SIDE only); sigma, overlap, three steps and the drive on the descending neurons are LC10a's.
// THE READING, per arm and bearing (15, 30, ..., 90 degrees): the IPSILATERAL INDEX
//      ipsi(e) = [ (L - R)(e) - (L - R)(-e) ] / [ (L + R)(e) + (L + R)(-e) ]
//   +1 when a loom drives only the descending neuron on its own side, -1 only the other side's, 0 no side at all.
// THE ARMS: lc6:medial and lc6:lateral (the front of the visual field at the sheet's medial or lateral end: the data cannot say which, so both, as for LC10a and LC11),
//   lc6:flat (no places), lc6:shuffled:4242 (connections shuffled within each type), lc6:medial:cut and lc6:lateral:cut (PVLP151's output removed: only LC6's direct
//   route to DNp103 is left); lc16:medial, lc16:lateral, lc16:flat, lc16:shuffled:4242.
//
// REGISTERED 2026-11-22, BEFORE ANY READING WAS COMPUTED ON LC6 OR LC16 (the gate runs the bench's arithmetic on hand-made toy circuits only).
// WHAT IS DECIDED:
//   A PATHWAY TELLS THE SIDE in an orientation if |ipsi(e)| >= 0.1 at every bearing from 30 to 90 degrees, all of one sign: IPSILATERAL if positive, CONTRALATERAL if
//   negative. Said for each of lc6 and lc16 in each orientation.
//   THE RELAY DECIDES LC6'S SIDE if, in an orientation where LC6 tells the side, the cut arm does not tell it the same way (it tells the other side, or none).
//   For the record only: the PLACES matter to the side if the flat arm does not tell it the way the placed orientations both do; the WIRING's particulars matter if
//   the shuffled arm does not.
// FORECAST, for the record: LC16 tells the side, ipsilaterally, in both orientations and in the flat and shuffled arms too (its only descending neuron's input from it
//   is on its own side). LC6: no forecast of the sign -- the direct route is ipsilateral, the relay's mostly crosses; whichever is the larger after three steps decides.
// READ 2026-11-22 (brain/loomBench.reading.json): BOTH PATHWAYS TELL THE SIDE, IPSILATERALLY, in both orientations -- a loom drives the descending neuron on its own side
//   more: LC6 onto DNp103 +0.22 to +0.24 (medial), +0.15 to +0.22 (lateral); LC16 onto pIP1 +0.37 to +0.45 and +0.45 to +0.49. THE RELAY DOES NOT DECIDE LC6'S SIDE: with
//   PVLP151 cut LC6 is MORE ipsilateral (+0.31 to +0.32 medial, +0.26 to +0.31 lateral) -- the mostly-crossing relay pulls against the direct route, by about a third of
//   its index, and loses. On the record: the PLACES DO NOT MATTER to the side (flat: +0.35 and +0.70, the same side -- the side comes from which eye a cell is in);
//   the WIRING'S PARTICULARS DO (shuffled within type, LC6 turns CONTRALATERAL, -0.11 to -0.13, and LC16 tells no side, +0.05 at 30 degrees). The forecast was right
//   about LC16's side and wrong about its shuffle (it said the shuffle would keep the side); it made no call on LC6. What the Giant Fiber input cannot say -- the side --
//   these two pathways do say, in this model, both the same way round.
// WHAT CHANGES: nothing in the game (no seat reads these pathways). The reading goes into vendor/male-cns/PROVENANCE.md beside the circuits.
// WHAT IS NOT HERE: a loom's size or time course in these pathways, dark against bright, LC4's or LPLC2's own connectome (not vendored), what DNp103 or pIP1 do.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as FT from "../../brain/flyTracking.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = process.env.LOOM_BENCH_READING || path.join(BRAIN, "loomBench.reading.json");   // the variable is for the gate's refusal check only
export const BEARINGS = Object.freeze([15, 30, 45, 60, 75, 90]), JUDGED = Object.freeze([30, 45, 60, 75, 90]), THRESHOLD = 0.1, SHUFFLE_SEED = 4242;
export const PATHWAYS = Object.freeze({ lc6: { eye: "LC6", dn: "DNp103", relay: "PVLP151" }, lc16: { eye: "LC16", dn: "pIP1", relay: null } });
export const ARMS = Object.freeze(["lc6:medial", "lc6:lateral", "lc6:flat", "lc6:shuffled:4242", "lc6:medial:cut", "lc6:lateral:cut", "lc16:medial", "lc16:lateral", "lc16:flat", "lc16:shuffled:4242"]);

/** The matrix with every connection FROM cells of type `relay` removed (their outputs cut; their inputs kept). */
export function cutFrom(M, types, relay) {
    const val = Float64Array.from(M.val); let cut = 0;
    for (let i = 0; i < M.start.length - 1; i++) for (let t = M.start[i]; t < M.start[i + 1]; t++) if (types[M.src[t]] === relay) { val[t] = 0; cut++; }
    return { M: { start: M.start, src: M.src, val }, cut };
}
/** The ipsilateral index at bearing e (degrees) of a circuit over pathway p (see the header). */
export function ipsiAt(p, c, deg) {
    const e = deg * Math.PI / 180, a = c.cells(e), b = c.cells(-e), L = (h) => h[p.dnL], R = (h) => h[p.dnR], den = L(a) + R(a) + L(b) + R(b);
    return den > 0 ? ((L(a) - R(a)) - (L(b) - R(b))) / den : 0;
}
/** The registered verdict over a row of indices { [deg]: ipsi }: { tells, side: "ipsilateral" | "contralateral" | null }. */
export function verdictOf(row) {
    const v = JUDGED.map((d) => row[d]), tells = v.every((x) => Math.abs(x) >= THRESHOLD) && (v.every((x) => x > 0) || v.every((x) => x < 0));
    return { tells, side: tells ? (v[0] > 0 ? "ipsilateral" : "contralateral") : null };
}
/** One arm over a pathway (built by flyTracking.pathwayOf): { row, verdict, cut? }. */
export function armOf(p, types, arm, relay) {
    const [, how, extra] = arm.split(":");
    let M = p.matrix(how === "shuffled" ? p.retarget(Number(extra)) : null), cut = null;
    if (extra === "cut") { const r = cutFrom(M, types, relay); M = r.M; cut = r.cut; }
    const c = p.circuit(M, how === "flat" ? { flat: true } : { front: how === "lateral" ? -1 : 1 }), row = Object.fromEntries(BEARINGS.map((d) => [d, ipsiAt(p, c, d)]));
    return { row, verdict: verdictOf(row), ...(cut !== null ? { cut } : {}) };
}
/** The pathway for lc6 or lc16, from its baked modules. */
export async function pathwayFor(name) {
    const P = PATHWAYS[name], T = await import(pathToFileURL(path.join(BRAIN, `${name}Topology.mjs`))), Y = await import(pathToFileURL(path.join(BRAIN, `${name}Synapses.mjs`))), L = await import(pathToFileURL(path.join(BRAIN, `${name}Places.mjs`)));
    return { p: FT.pathwayOf({ topo: T, syn: Y, places: L, eye: P.eye, dn: P.dn }), types: T.NEURON_TYPES, relay: P.relay };
}
/** The registered decisions over every arm's result. */
export function decide(R) {
    const out = {};
    for (const n of ["lc6", "lc16"]) for (const o of ["medial", "lateral"]) out[`${n}:${o}`] = R[`${n}:${o}`].verdict;
    out.relay = {};
    for (const o of ["medial", "lateral"]) { const v = R[`lc6:${o}`].verdict, c = R[`lc6:${o}:cut`].verdict; out.relay[o] = v.tells ? (c.tells && c.side === v.side ? "does not decide" : "DECIDES") : "not judged (LC6 does not tell the side here)"; }
    const same = (n, arm) => { const m = R[`${n}:medial`].verdict, l = R[`${n}:lateral`].verdict, a = R[`${n}:${arm}`].verdict; return m.tells && l.tells && m.side === l.side ? (a.tells && a.side === m.side ? "do not matter" : "MATTER") : "not judged"; };
    out.record = Object.fromEntries(["lc6", "lc16"].map((n) => [n, { places: same(n, "flat"), wiring: same(n, `shuffled:${SHUFFLE_SEED}`) }]));
    return out;
}

async function main() {
    if (fs.existsSync(READING)) { console.error(`takeLoomBench: ${path.relative(process.cwd(), READING)} exists -- the bench was read; a second read is refused.`); process.exit(2); }
    const P = { lc6: await pathwayFor("lc6"), lc16: await pathwayFor("lc16") }, R = {};
    for (const arm of ARMS) { const n = arm.split(":")[0]; R[arm] = armOf(P[n].p, P[n].types, arm, P[n].relay); }
    const D = decide(R);
    fs.writeFileSync(READING, JSON.stringify({ readAt: new Date().toISOString().slice(0, 10), bearings: BEARINGS, arms: R, decided: D }));
    for (const arm of ARMS) console.log(`${arm.padEnd(20)} ${BEARINGS.map((d) => `${d}: ${R[arm].row[d] >= 0 ? "+" : ""}${R[arm].row[d].toFixed(3)}`).join("  ")}   ${R[arm].verdict.tells ? R[arm].verdict.side.toUpperCase() : "no side"}${R[arm].cut !== undefined ? `  (${R[arm].cut} connections cut)` : ""}`);
    console.log(JSON.stringify(D, null, 1));
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
