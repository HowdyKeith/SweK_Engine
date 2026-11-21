// WebGLEngine/tools/ship/takeLc11Gunner.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE GUNNER OVER THE FLY'S SMALL-OBJECT CELLS. The page's fly-wired gunner reads the fly's target-tracking pathway (LC10a onto AOTU019/AOTU025 onto DNa02, brain/lc10Topology.mjs).
// LC11 is the eye's small-moving-object cell type; its strongest descending target is DNp35 (vendor/male-cns/PROVENANCE.md, brain/lc11Topology.mjs: 143 LC11 onto three GABA relays
// and DNp35; LC11 barely reaches DNa02). Keith: "yes, register and build it." brain/flyTracking.mjs's pathwayOf builds the SAME model over it -- the target's bearing onto one eye's
// LC11 cells at their places, the connectome's own signed weights, three steps, DNp35 right less left read the odd way -- and wiringOf names it "lc11:medial", "lc11:lateral",
// "lc11:flat" and "lc11:shuffled:<seed>". No weight inside a circuit is learned, in any arm.
//
//   node tools/ship/takeLc11Gunner.mjs [--workers n]
//
//   THE FIGHTS, the cannon on both sides: ONE SHIP A SIDE (seeds 1641001-; the gunner with no hand window, brain/seatFlyWired11WeightsOne.json, so the CIRCUIT LAYS THE GUN ALL
//   THE WAY) and fleets of THREE a side (1651001-; the 45-degree window, brain/seatFlyWired11WeightsDefault.json: the circuit makes the big swings, the hand the last 45 degrees).
//   300 pairs a fight, 75 of each of the duel's kinds. Side X carries today's best-ship helm (the split helm with the cannon: the sine twin, as tools/ship/takeCarTodayRations.mjs);
//   side Y is plain. None of these seeds was flown by anything before.
//   THE ARMS -- the same gunner file read over each wiring (tools/ship/pairPool.mjs's `wiring`): `lc10` (the page's gunner itself), `lc11:medial` and `lc11:lateral` (LC11, the front of
//   the visual field at the medial or the lateral end of the sheet: the data cannot say which, so both are flown, as LC10a's were), `lc11:flat` (LC11 with no places),
//   `lc11:shuffled:4242` (LC11's connections shuffled within each type), `sine` (no circuit).
//
// HAND-SET CHOICES, BEFORE ANY PAIR (not the fly's): DNp35 is NOT KNOWN AS A STEERING NEURON -- reading its right less left as the gun's turn is my modelling choice; its sense is
//   the one that turns the gun toward a target at a quarter turn (brain/flyTracking.mjs LC11_SENSE: +1, the read-out as it comes); sigma, the overlap, the constant drive on the
//   descending neuron, three steps and the rank-for-a-place are LC10a's, unchanged. What the read-outs compute was seen before registering (the gate pins it): LC11 medial peaks at
//   141 degrees, lateral at 38.5, flat is a switch by 15 degrees, shuffled peaks at 146.5; LC10a peaks at 80.5. EVERY LC11 read-out, the shuffled one too, swings the gun toward
//   the target at every bearing (LC10a's shuffle does not): here the shuffle is a WEAK control, and that is said before any pair. On 16 scratch pairs (seeds 901-902) many
//   fights fly to the bit alike whatever the wiring, as tools/ship/takeFlyWiredGunnerControl.mjs found for the sine.
//
// REGISTERED 2026-11-21, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain side; pair by pair, EACH LC11
//   ORIENTATION LESS LC10a, and the better-placed orientation (decided below) less lc11:flat, less lc11:shuffled:4242 and less sine.
// FORECAST, for the record: neither LC11 orientation can be told from LC10a in either fight (every fly-wired gunner so far has tied the sine); one ship a side, where the circuit
//   lays the gun all the way, is where a difference would show if there is one.
// WHAT IS DECIDED:
//   LC11 BEATS LC10a in an orientation if that orientation LEADS LC10a (z >= 2) in at least one fight and TRAILS it (z <= -2) in none. If both orientations do, the one with the
//   larger mean lead over the two fights. IF LC11 BEATS LC10a, the page's best-ship and fleet buttons fly their gunner files over that LC11 wiring. Otherwise nothing ships and the
//   reading goes in the fly-wired gunner's note.
//   For the record only (no page change), against the orientation that beat LC10a or, if none did, the one with the larger mean over LC10a: LC11'S PLACES are CREDITED if it leads
//   lc11:flat somewhere and trails it nowhere; LC11'S WIRING if the same against lc11:shuffled:4242; and whether it can be told from the sine.
// READ 2026-11-21 (brain/lc11Gunner.reading.json; the kept arms in brain/rig-results/lc11Gunner/): LC11 DOES NOT BEAT LC10a: NOTHING SHIPS. One ship a side, where the circuit lays
//   the gun all the way, BOTH LC11 orientations TRAIL LC10a (medial -0.036, z -2.38; lateral -0.112, z -3.56); in fleets of three neither can be told from it (-0.005, +0.009).
//   On the record (judged on medial, the larger mean): LC11's PLACES ARE CREDITED (medial less flat +0.116, z 3.52 one ship a side; -0.013, z -1.85 in fleets), its WIRING IS NOT
//   (against the shuffle +0.041, z 1.93, a weak control as registered), and it cannot be told from the sine (-0.007, -0.005). The forecast said LC11 could not be told from
//   LC10a; one ship a side it is worse. The fly-wired gunner's note says so.
// Every arm's leads are kept (brain/rig-results/lc11Gunner/); the reading file (brain/lc11Gunner.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: no cannon, escorts and fighters (the hand's, in every arm alike), other shuffle seeds, other LC types, DNp35's behaviour, a trained circuit.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as FS from "../../brain/flySteering.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "lc11Gunner.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "lc11Gunner");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsSineNoCannon.json"), gun: path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), gunOne: path.join(BRAIN, "seatFlyWired11WeightsOne.json") });
export const FIGHTS = Object.freeze(["one", "fleet3"]), SHIPS = Object.freeze({ one: 1, fleet3: 3 }), GUN_OF = Object.freeze({ one: "gunOne", fleet3: "gun" });
export const ORIENTATIONS = Object.freeze(["lc11:medial", "lc11:lateral"]), CONTROLS = Object.freeze(["lc11:flat", "lc11:shuffled:4242", "sine"]);
export const ARMS = Object.freeze(["lc10", ...ORIENTATIONS, ...CONTROLS]), SINE = "sine~odd";
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ one: pairs(1641001, 75), fleet3: pairs(1651001, 75) });
/** The shipped files, each checked by its policy: the split helm's cannon half (the sine twin) and the held-trigger gunner, with and without its hand window. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeLc11Gunner: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: { ...one(FILES.helm, FS.POLICY_ID3, FS.thirdOver(SINE)), wiring: SINE }, gun: one(FILES.gun, FT.POLICY_ID11, FT.nearAlways), gunOne: one(FILES.gunOne, FT.POLICY_ID11, FT.nearAlways) };
}
/** The jobs of one fight and arm: the same gunner file, read over the arm's wiring (`lc10` is the file as it is). */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    if (!ARMS.includes(arm)) throw new Error(`takeLc11Gunner: no arm ${arm}`);
    const g = b[GUN_OF[fight]], network = { ...g, weights: g.weights.slice(), ...(arm === "lc10" ? {} : { wiring: arm }) };
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: true, network, helmNet: b.helm }, y: { id: "plain", cannon: true }, kind, seed, opts: { ships: SHIPS[fight] } }));
}
const less = (a, b) => TA.stat(a.map((v, i) => v - b[i]));
/** One fight's readings: every arm against the plain side; each orientation less LC10a; each orientation less each control. Pure. */
export function fightReadings(a) {
    const r = Object.fromEntries(ARMS.map((arm) => [arm, TA.stat(a[arm])]));
    for (const o of ORIENTATIONS) { r[`${o} less lc10`] = less(a[o], a.lc10); for (const c of CONTROLS) r[`${o} less ${c}`] = less(a[o], a[c]); }
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** What is decided (see the header). Pure. */
export function decide(out) {
    const z = (o, k) => FIGHTS.map((f) => out[f].reading[`${o} less ${k}`].z), mean = (o) => FIGHTS.reduce((s, f) => s + out[f].reading[`${o} less lc10`].mean, 0) / FIGHTS.length;
    const credited = (o, k) => z(o, k).some((v) => v >= 2) && z(o, k).every((v) => v > -2);
    const beats = ORIENTATIONS.filter((o) => credited(o, "lc10")), pick = (list) => list.slice().sort((p, q) => mean(q) - mean(p))[0];
    const winner = beats.length ? pick(beats) : null, judged = winner || pick(ORIENTATIONS);
    const told = (o, k) => z(o, k).some((v) => Math.abs(v) >= 2);
    return { ok: true, beats: winner !== null, wiring: winner, judged, placesCredited: credited(judged, "lc11:flat"), wiringCredited: credited(judged, "lc11:shuffled:4242"), toldFromSine: told(judged, "sine"),
        reasons: [winner ? `LC11 (${winner}) BEATS LC10a: the best-ship and fleet buttons fly their gunner over ${winner}` : "LC11 does not beat LC10a in either orientation: nothing ships",
            `${judged}: its places ${credited(judged, "lc11:flat") ? "ARE" : "are NOT"} credited (against lc11:flat), its wiring ${credited(judged, "lc11:shuffled:4242") ? "IS" : "is NOT"} credited (against lc11:shuffled:4242), it ${told(judged, "sine") ? "CAN" : "cannot"} be told from the sine`] };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { one: "ONE SHIP A SIDE, THE CANNON ON, the gunner with no hand window", fleet3: "FLEETS OF 3 A SIDE, THE CANNON ON, the 45-degree window" };
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${title[f]}, today's best-ship helm, ${a.lc10.length} pairs, each wiring against the plain side:`); for (const arm of ARMS) log(`     ${arm}: ${TA.line(R[arm])}`);
        for (const o of ORIENTATIONS) { log(`  ${o.toUpperCase()} LESS LC10a: ${TA.line(R[`${o} less lc10`])}`); for (const c of CONTROLS) log(`     ${o} less ${c}: ${TA.line(R[`${o} less ${c}`])}`); }
    }
    const verdict = decide(out); log(`WHAT IS DECIDED: ${verdict.reasons.join("; ")}`);
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeLc11Gunner: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeLc11Gunner: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm.replace(/:/g, "-")}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
