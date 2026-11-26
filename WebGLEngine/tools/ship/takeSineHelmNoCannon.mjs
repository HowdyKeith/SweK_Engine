// WebGLEngine/tools/ship/takeSineHelmNoCannon.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE SINE TWIN'S GAIN WITHOUT A CANNON, AND THE CONTROL WITHOUT ONE MADE FAIR. tools/ship/takeFlyWiredHelmNoCannon.mjs searched the cannon-aware fly-wired helm's gain without a cannon and shipped -0.25 (it led the old 0.25 by +0.72 one ship a
// side and +0.46 in fleets). The helm's sine twin (brain/flySteering.mjs's `thirdOver("sine~odd")`: a sine where the fly's steering circuit was, the page's `sine` helm) still turns at 0.25 without a cannon -- so a fly against sine read without a
// cannon now sets a searched helm against an unsearched one. Keith: "then 3".
//
//   node tools/ship/takeSineHelmNoCannon.mjs [--workers n] [--write]
//
//   THE GAINS: -2, -1, -0.25, 0, 0.25 (the sine twin's now), 0.5, 1 and 2, both weights together; with a cannon the sine twin keeps -2, -2.
//   EVERY FIGHT: NO CANNON on either side, the by-size hand's gunner aboard (the no-window fly-wired gunner one a side, the 45-degree one in fleets -- the fly's gunners, not their sine twins: only the helm is compared), the plain ship opposite.
//   STAGE 1, TRAIN: each gain of the SINE TWIN one ship a side and in fleets of three, 96 pairs a fight (24 of each kind; seeds 1191001- one a side, 1201001- fleets). The best mean lead over the 192 wins; a tie keeps 0.25.
//   STAGE 2, HELD OUT: if the winner is not 0.25, it and 0.25 on 96 fresh pairs of each fight (1211001-, 1221001-); it goes on only if it LEADS 0.25 on the 192 (mean above 0) and does not TRAIL (z above -2). THE SINE'S GAIN is the winner if it goes
//     on, else 0.25.
//   STAGE 3, AUDIT, READ ONCE: one ship a side (1231001-) and fleets of three (1241001-), 300 pairs each, paired: THE FLY'S HELM at its shipped -0.25, THE SINE TWIN at its gain, and (if its gain is not 0.25) the sine twin at 0.25.
//
// REGISTERED 2026-11-21, BEFORE ANY PAIR BELOW WAS FLOWN. Readings: each gain's train score; the held-out gain; in each audit fight each arm against the plain ship, THE SINE'S GAIN LESS 0.25 (if flown) and THE FLY LESS THE SINE, pair by pair.
// FORECAST, for the record: the sine wants a negative gain too, as the fly did, and wins it held out; the fly less the sine is then level, as with a cannon (tools/ship/takeFlyWiredHelmControl.mjs: -0.06 one a side, +0.01 in fleets).
// WHAT SHIPS: brain/helmFlyWired3WeightsSineNoCannon.json (policy helmFlyWired3, [-2, -2, the sine's gain, the sine's gain]) if THE SINE'S GAIN LESS 0.25 LEADS in at least one fight and TRAILS in neither; the page's `sine` helm then loads it (with a
//   cannon the sine twin to the bit). THE FLY LESS THE SINE decides nothing: it is what the fly's helm's note says about its wiring without a cannon.
// READ 2026-11-21 (brain/helmFlyWired3WeightsSineNoCannon.reading.json; the kept flights in brain/rig-results/sineHelmNoCannon/): IT SHIPS. On train -0.25 won (1.695; -1 1.678, -2 1.612, 0 1.549, 0.25 1.470, 0.5 0.582, 1 -0.559,
//   2 -1.229); held out it led 0.25 by +0.253 (z 3.96, 192 pairs). On the audit the sine at -0.25 less 0.25: +0.446 one ship a side (z 7.41), +0.212 in fleets of three (z 5.53), both LEAD. THE FLY LESS THE SINE: +0.021 (z 0.75) and +0.010 (z 0.41),
//   neither can be told. The forecast held. The page's `sine` helm loads brain/helmFlyWired3WeightsSineNoCannon.json; the fly-wired helm's note says a sine does as well without a cannon.
// Every arm's leads are kept (brain/rig-results/sineHelmNoCannon/); the reading file (brain/helmFlyWired3WeightsSineNoCannon.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: the cannon on, the sine twin gunners, escorts, fighters, unequal gains.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as FS from "../../brain/flySteering.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const DEFAULT_OUT = path.join(BRAIN, "helmFlyWired3WeightsSineNoCannon.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "sineHelmNoCannon");
export const FILES = Object.freeze({ fly: path.join(BRAIN, "helmFlyWired3WeightsNoCannon.json"), sine: path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), gun: path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), gunOne: path.join(BRAIN, "seatFlyWired11WeightsOne.json") });
export const GAINS = Object.freeze([-2, -1, -0.25, 0, 0.25, 0.5, 1, 2]), SHIPPED = 0.25, FIGHTS = Object.freeze(["one", "fleet"]), SINE = "sine~odd";
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ train: Object.freeze({ one: pairs(1191001, 24), fleet: pairs(1201001, 24) }), held: Object.freeze({ one: pairs(1211001, 24), fleet: pairs(1221001, 24) }), audit: Object.freeze({ one: pairs(1231001, 75), fleet: pairs(1241001, 75) }) });
/** The sine twin's four weights at a gain without a cannon: its file's two with a cannon, then the gain twice. Pure. */
export const weightsOf = (g, shipped) => [shipped[0], shipped[1], g, g];
/** The shipped files, each checked by its policy. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeSineHelmNoCannon: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { fly: one(FILES.fly, FS.POLICY_ID3, FS.third), sine: one(FILES.sine, FS.POLICY_ID3, FS.third), gun: one(FILES.gun, FT.POLICY_ID11, FT.nearAlways), gunOne: one(FILES.gunOne, FT.POLICY_ID11, FT.nearAlways) };
}
/** The helm an arm carries: `fly` (the fly's helm, its shipped file) or a sine gain (the sine twin at that gain without a cannon). */
export const helmOf = (arm, b) => (arm === "fly" ? { ...b.fly } : { policy: FS.POLICY_ID3, weights: weightsOf(arm, b.sine.weights), wiring: SINE });
/** The jobs of one fight and arm on a list of pairs: no cannon on either side, the by-size hand's gunner aboard. */
export function jobsOf(fight, arm, b, list) {
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: false, network: fight === "one" ? b.gunOne : b.gun, helmNet: helmOf(arm, b) }, y: { id: "plain", cannon: false }, kind, seed, opts: { ships: fight === "one" ? 1 : 3 } }));
}
/** The winner of the train scores: the highest; a tie keeps the shipped. Pure. */
export function pick(scores) { let best = SHIPPED; for (const g of GAINS) if (scores[g] > scores[best]) best = g; return best; }
/** Does the winner go on from the held-out pairs? Pure. */
export const holds = (gain) => gain.mean > 0 && gain.z > -2;
/** Does the sine's gain ship? IT LESS 0.25 LEADS in at least one fight and TRAILS in neither. Pure. */
export function qualifies(audit) {
    const reasons = [];
    if (!FIGHTS.every((f) => audit[f].sineGain)) return { ok: false, reasons: ["the sine's gain is 0.25: nothing to ship"] };
    if (!FIGHTS.some((f) => audit[f].sineGain.z >= 2)) reasons.push(`the sine's gain leads 0.25 in neither fight`);
    for (const f of FIGHTS) if (audit[f].sineGain.z <= -2) reasons.push(`in ${f} the sine's gain TRAILS 0.25`);
    return { ok: reasons.length === 0, reasons };
}
/** The study. `fly(stage, fight, arm)` -> Promise of leads (arm: "fly" or a sine gain). */
export async function study(fly, log = () => {}) {
    const scores = {};
    for (const g of GAINS) { const all = []; for (const f of FIGHTS) all.push(...await fly("train", f, g)); scores[g] = all.reduce((a, b) => a + b, 0) / all.length; log(`TRAIN, the sine twin at ${g}: ${scores[g].toFixed(3)}`); }
    const winner = pick(scores); log(`THE TRAIN WINNER: ${winner}`);
    let held = null, gain = SHIPPED;
    if (winner !== SHIPPED) {
        const w = [], s = []; for (const f of FIGHTS) { w.push(...await fly("held", f, winner)); s.push(...await fly("held", f, SHIPPED)); }
        held = TA.stat(w.map((v, i) => v - s[i])); log(`HELD OUT, ${winner} LESS ${SHIPPED}: ${TA.line(held)}`);
        if (holds(held)) gain = winner; else log("IT DOES NOT HOLD: the sine twin keeps 0.25.");
    } else log("THE SINE TWIN KEEPS 0.25.");
    const audit = {};
    for (const f of FIGHTS) {
        const fl = await fly("audit", f, "fly"), sg = await fly("audit", f, gain), s0 = gain === SHIPPED ? null : await fly("audit", f, SHIPPED), d = (a, b) => TA.stat(a.map((v, i) => v - b[i]));
        audit[f] = { fly: TA.stat(fl), sine: TA.stat(sg), sine025: s0 ? TA.stat(s0) : null, sineGain: s0 ? d(sg, s0) : null, flyLessSine: d(fl, sg) };
        log(`AUDIT ${f}: the fly's helm ${TA.line(audit[f].fly)}; the sine twin at ${gain} ${TA.line(audit[f].sine)}` + (s0 ? `; at 0.25 ${TA.line(audit[f].sine025)}; THE SINE'S GAIN LESS 0.25: ${TA.line(audit[f].sineGain)}` : ""));
        log(`  THE FLY LESS THE SINE: ${TA.line(audit[f].flyLessSine)}`);
    }
    const verdict = qualifies(audit); log(verdict.ok ? `QUALIFIES: the sine twin's gain ${gain} without a cannon ships.` : "NOTHING SHIPS: " + verdict.reasons.join("; "));
    return { scores, winner, held, gain, audit, verdict };
}
/** The file written when it qualifies. */
export function blobOf(result, b) {
    const by = `tools/ship/takeSineHelmNoCannon.mjs: the cannon-aware helm's SINE TWIN (a control: a sine where the fly's steering circuit was) at ${b.sine.weights[0]} WITH a cannon and ${result.gain} WITHOUT one, chosen of ${GAINS.join(", ")} on 192 train pairs with no cannon on either side, held on 192 more (${TA.line(result.held)}), and read once against 0.25 (` + FIGHTS.map((f) => `${f}: ${TA.line(result.audit[f].sineGain)}`).join("; ") + ")";
    return PB.exportBrain(PB.describePolicy(FS.POLICY_ID3, FS.third), Float32Array.from(weightsOf(result.gain, b.sine.weights)), { score: Number(result.audit.one.sine.mean.toFixed(3)), by, citation: "a control: brain/flySteering.mjs's thirdOver(\"sine~odd\")" });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeSineHelmNoCannon: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeSineHelmNoCannon: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (stage, fight, arm) => { const f = path.join(kept, `${stage}_${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b, SETS[stage][fight])); fs.writeFileSync(f, JSON.stringify({ stage, fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result, b)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
