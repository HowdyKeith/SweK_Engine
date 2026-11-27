// WebGLEngine/tools/ship/takeLoomBenchGF.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE GIANT FIBER'S LOOMING INPUTS ON THE LOOM BENCH: DO LC4 AND LPLC2 TELL A LOOM'S SIDE, AS LC6 AND LC16 DO? tools/ship/takeLoomBench.mjs (registered, read once) found LC6 and LC16
// both tell the side, ipsilaterally, and that PVLP151's mostly-crossing synapses do not decide LC6's. Keith: "lets do ... 5" -- the same bench over LC4 (onto DNp04, the descending
// neuron LC11's rule gives it) and LPLC2 (onto DNp01, the Giant Fiber, directly and through the same relay PVLP151, whose synapses onto the Giant Fiber cross the midline, 582 of 603).
//
//   node tools/ship/takeLoomBenchGF.mjs           compute the readings ONCE, write brain/loomBenchGF.reading.json, print them; a second read is refused
//
// THE MODEL, THE INDEX, THE BEARINGS AND THE VERDICT ARE tools/ship/takeLoomBench.mjs's, UNCHANGED (its armOf, ipsiAt, verdictOf and cutFrom are called, not copied): a loom at
//   bearing e drives one eye's cells at their places (brain/flyTracking.mjs pathwayOf), three steps of the connectome's signed weights, the descending neurons' activity read;
//   ipsi(e) = [(L - R)(e) - (L - R)(-e)] / [(L + R)(e) + (L + R)(-e)]; a pathway TELLS THE SIDE if |ipsi| >= 0.1 at every bearing 30 to 90 degrees, one sign.
// THE ARMS: lc4:medial, lc4:lateral, lc4:flat, lc4:shuffled:4242; lplc2:medial, lplc2:lateral, lplc2:flat, lplc2:shuffled:4242, lplc2:medial:cut, lplc2:lateral:cut (PVLP151's output
//   removed). LC4 has no relay (the rule admitted none), so no cut arm.
// SEEN BEFORE REGISTERING, SAID PLAINLY: brain/evadeReflex-selfcheck.mjs pins each circuit's SENSE -- the sign of its right-less-left at a quarter turn -- and it is "own side" for
//   lc4 and lplc2 in both orientations and flat. So the SIGN of the index at 90 degrees is already known for those arms. Not seen: the index at any other bearing, its size, the
//   verdict (which needs every bearing 30 to 90), the shuffled LPLC2 arm's verdict, and the relay-cut arms.
//
// REGISTERED 2026-11-22, BEFORE ANY OF THE ABOVE WAS COMPUTED.
// WHAT IS DECIDED (tools/ship/takeLoomBench.mjs's rules, the same words):
//   A PATHWAY TELLS THE SIDE in an orientation if |ipsi| >= 0.1 at every bearing from 30 to 90 degrees, one sign: IPSILATERAL if positive, CONTRALATERAL if negative.
//   THE RELAY DECIDES LPLC2'S SIDE if, in an orientation where LPLC2 tells the side, the cut arm does not tell it the same way.
//   For the record: places matter if the flat arm does not tell the side the way both orientations do; the wiring's particulars, the same against the shuffle.
//   And, for the record, THE FOUR LOOMING PATHWAYS SIDE BY SIDE: this reading with tools/ship/takeLoomBench.mjs's.
// FORECAST, for the record: both tell the side, ipsilaterally, in both orientations (their direct synapses onto their descending neurons are all on their own side); LC4's
//   orientations alike (it feeds DNp04 with no gradient across its sheet); the relay does not decide LPLC2's side, as it did not decide LC6's; LPLC2's index weaker than LC4's
//   (the crossing relay pulls the other way).
// READ 2026-11-22 (brain/loomBenchGF.reading.json): BOTH TELL THE SIDE, IPSILATERALLY, in both orientations -- LC4 onto DNp04 +0.43 to +0.45 (medial and lateral alike to two
//   places, as forecast: no gradient across its sheet), LPLC2 onto the Giant Fiber +0.32 to +0.41 (medial) and +0.40 to +0.42 (lateral), weaker than LC4, as forecast. THE RELAY
//   DOES NOT DECIDE LPLC2'S SIDE: cut, LPLC2 is MORE ipsilateral (+0.35 to +0.44 and +0.44 to +0.46) -- PVLP151's crossing synapses pull against the direct route and lose, exactly
//   as they do for LC6. On the record: places do not matter to the side for either (flat: +0.70 and +0.61); the wiring's particulars do not for LC4 (shuffled, still ipsilateral,
//   weaker: +0.17 to +0.19) but DO for LPLC2 (shuffled, it turns CONTRALATERAL, -0.14 to -0.18, as LC6 did). Every forecast held.
//   THE FOUR LOOMING PATHWAYS SIDE BY SIDE (the two benches, 30 to 90 degrees): LC6 +0.15 to +0.24, LC16 +0.37 to +0.49, LC4 +0.43 to +0.45, LPLC2 +0.32 to +0.42 -- all four tell
//   a loom's side from its own side; in this model the Giant Fiber's inputs tell it no worse than the dark-looming cells.
// WHAT CHANGES: nothing in the game. The reading goes into vendor/male-cns/PROVENANCE.md beside the circuits and in the evade seat's draft (stage 2 has not been flown).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as FT from "../../brain/flyTracking.mjs";
import * as B from "./takeLoomBench.mjs";
import * as LC4T from "../../brain/lc4Topology.mjs";
import * as LC4S from "../../brain/lc4Synapses.mjs";
import * as LC4P from "../../brain/lc4Places.mjs";
import * as LPT from "../../brain/lplc2Topology.mjs";
import * as LPS from "../../brain/lplc2Synapses.mjs";
import * as LPP from "../../brain/lplc2Places.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = process.env.LOOM_BENCH_GF_READING || path.join(BRAIN, "loomBenchGF.reading.json");   // the variable is for the gate's refusal check only
export const PATHWAYS = Object.freeze({ lc4: { eye: "LC4", dn: "DNp04", relay: null, baked: [LC4T, LC4S, LC4P] }, lplc2: { eye: "LPLC2", dn: "DNp01", relay: "PVLP151", baked: [LPT, LPS, LPP] } });
export const ARMS = Object.freeze(["lc4:medial", "lc4:lateral", "lc4:flat", "lc4:shuffled:4242", "lplc2:medial", "lplc2:lateral", "lplc2:flat", "lplc2:shuffled:4242", "lplc2:medial:cut", "lplc2:lateral:cut"]);
export function pathwayFor(name) {
    const P = PATHWAYS[name], [T, Y, L] = P.baked;
    return { p: FT.pathwayOf({ topo: T, syn: Y, places: L, eye: P.eye, dn: P.dn }), types: T.NEURON_TYPES, relay: P.relay };
}
/** The registered decisions over every arm's result (takeLoomBench.mjs's words, LPLC2's relay, both types' record). */
export function decide(R) {
    const out = {};
    for (const n of ["lc4", "lplc2"]) for (const o of ["medial", "lateral"]) out[`${n}:${o}`] = R[`${n}:${o}`].verdict;
    out.relay = {};
    for (const o of ["medial", "lateral"]) { const v = R[`lplc2:${o}`].verdict, c = R[`lplc2:${o}:cut`].verdict; out.relay[o] = v.tells ? (c.tells && c.side === v.side ? "does not decide" : "DECIDES") : "not judged (LPLC2 does not tell the side here)"; }
    const same = (n, arm) => { const m = R[`${n}:medial`].verdict, l = R[`${n}:lateral`].verdict, a = R[`${n}:${arm}`].verdict; return m.tells && l.tells && m.side === l.side ? (a.tells && a.side === m.side ? "do not matter" : "MATTER") : "not judged"; };
    out.record = Object.fromEntries(["lc4", "lplc2"].map((n) => [n, { places: same(n, "flat"), wiring: same(n, `shuffled:${B.SHUFFLE_SEED}`) }]));
    return out;
}

async function main() {
    if (fs.existsSync(READING)) { console.error(`takeLoomBenchGF: ${path.relative(process.cwd(), READING)} exists -- the bench was read; a second read is refused.`); process.exit(2); }   // win32-ok: a display string in a message, not compared to a posix name
    const P = { lc4: pathwayFor("lc4"), lplc2: pathwayFor("lplc2") }, R = {};
    for (const arm of ARMS) { const n = arm.split(":")[0]; R[arm] = B.armOf(P[n].p, P[n].types, arm, P[n].relay); }
    const D = decide(R);
    fs.writeFileSync(READING, JSON.stringify({ readAt: new Date().toISOString().slice(0, 10), bearings: B.BEARINGS, arms: R, decided: D }));
    for (const arm of ARMS) console.log(`${arm.padEnd(20)} ${B.BEARINGS.map((d) => `${d}: ${R[arm].row[d] >= 0 ? "+" : ""}${R[arm].row[d].toFixed(3)}`).join("  ")}   ${R[arm].verdict.tells ? R[arm].verdict.side.toUpperCase() : "no side"}${R[arm].cut !== undefined ? `  (${R[arm].cut} connections cut)` : ""}`);
    console.log(JSON.stringify(D, null, 1));
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
