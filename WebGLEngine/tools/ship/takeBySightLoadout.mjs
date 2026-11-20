// WebGLEngine/tools/ship/takeBySightLoadout.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE BY-SIZE HAND THAT ALSO SEES FIGHTERS. The best-ship button's `bysize` hand (tools/ship/takeBySizeLoadout.mjs) takes the car's always-firing gunner whenever a side has ONE ship. tools/ship/takePresetsHard.mjs read the fly-wired gunner leading the car's
// by +0.131 (z 8.0) one ship against the trained pilot's fighters under the same helm. A rule BY SIGHT takes the car's gunner only when there is one ship AND NOTHING ELSE in the fight -- the fly-wired gunner with escorts or fighters about.
// Keith: "1 first, since it fixes a known weak spot in the button" (the backlog's bysize-sees-fighters).
// WHAT IS KNOWN BEFORE ANY FLIGHT: the two rules pick the same gunner one ship a side with nothing else, and in every fleet (the fly-wired one), so those fights are not flown.
//
//   node tools/ship/takeBySightLoadout.mjs [--workers n]
//
//   THE FIGHTS, the cannon on both sides: ONE SHIP A SIDE WITH TWO ESCORTS A SIDE (the PD autopilot; seeds 651001-); one ship a side with SIX escorts a side (661001-); ONE SHIP AGAINST EIGHT PD FIGHTERS, the ship's helm the cannon-aware one (battleshipFight;
//   671001-). 300 pairs or attacks a fight, 75 of each kind. Side X has the cannon-aware helm at its shipped weights and the gunner its rule picks, side Y (or the fighters' target) is plain. THE ARMS: `bySize` (here the car's gunner, the shipped file)
//   and `bySight` (here the fly-wired gunner, seatFlyWired11's shipped file).
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain ship; BY SIGHT LESS BY SIZE, pair by pair.
// FORECAST, for the record: LEADS in all three -- with escorts by about the fleet's +0.3, more with six than with two; against PD fighters by less than the pilot's +0.13 (the PD fighters are easier for both).
// WHAT SHIPS: if the gain LEADS in at least one fight and TRAILS in none, the page's `bysize` hand takes the car's gunner only when a side has one ship and the fight no escorts. Nothing is written but the reading; the page is changed by hand in
//   render/spaceDuelCore.mjs and its gate pins the reading.
// Every arm's leads are kept (brain/rig-results/bySightLoadout/); the reading file (brain/bySightLoadout.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: one ship a side with one escort, the trained pilot (tools/ship/takePresetsHard.mjs read it), fights without the cannon.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as ST from "../../brain/seatTurretGunner.mjs";
import * as FS from "../../brain/flySteering.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "bySightLoadout.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "bySightLoadout");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), car: path.join(BRAIN, "seatTurretGunnerWeightsBig.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json") });
export const FIGHTS = Object.freeze(["oneEscorts2", "oneEscorts6", "fighters"]), ARMS = Object.freeze(["bySize", "bySight"]);
/** The gunner each rule carries in a fight of `ships` ships and `others` escorts or raiders: by size (the button now) the car's whenever there is one ship; by sight the car's only when there is one ship AND nothing else. */
export const gunnerOf = (arm, ships, others) => (ships > 1 ? "fly" : arm === "bySight" && others > 0 ? "fly" : "car");
const pairs = (kinds, first, n) => Object.freeze(kinds.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ oneEscorts2: pairs(D.KINDS, 651001, 75), oneEscorts6: pairs(D.KINDS, 661001, 75), fighters: pairs(BF.KINDS, 671001, 75) });
export const SETUP = Object.freeze({ oneEscorts2: Object.freeze({ ships: 1, escorts: 2 }), oneEscorts6: Object.freeze({ ships: 1, escorts: 6 }), fighters: Object.freeze({ ships: 1, raiders: 8 }) });
/** The shipped files the arms carry, each checked by its own policy (a file another policy's, or a weight short, is refused by name). */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeBySightLoadout: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), car: one(FILES.car, ST.POLICY_ID, ST), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways) };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const S = SETUP[fight], g = gunnerOf(arm, S.ships, S.escorts ?? S.raiders ?? 0);
    if (fight === "fighters") return list.map(({ kind, seed }) => ({ vsFighters: { network: b[g], helm: b.helm, seed, kind, opts: {} } }));
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: true, network: b[g], helmNet: b.helm }, y: { id: "plain", cannon: true }, kind, seed, opts: { ships: S.ships, escorts: S.escorts } }));
}
/** One fight's readings from its arms' leads. Pure. */
export function fightReadings(a) {
    const r = { bySight: TA.stat(a.bySight), bySize: TA.stat(a.bySize), gain: TA.stat(a.bySight.map((v, i) => v - a.bySize[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** Does it ship? The gain LEADS in at least one fight and TRAILS in none. Pure. */
export function qualifies(out) {
    const reasons = [];
    if (!FIGHTS.some((f) => out[f].reading.gain.z >= 2)) reasons.push(`the gain leads in no fight (z ${FIGHTS.map((f) => out[f].reading.gain.z.toFixed(2)).join(", ")})`);
    for (const f of FIGHTS) if (out[f].reading.gain.z <= -2) reasons.push(`in ${f} the gain TRAILS`);
    return { ok: reasons.length === 0, reasons };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { oneEscorts2: "ONE SHIP A SIDE WITH 2 ESCORTS A SIDE, THE CANNON ON", oneEscorts6: "ONE SHIP A SIDE WITH 6 ESCORTS A SIDE, THE CANNON ON", fighters: "ONE SHIP AGAINST EIGHT PD FIGHTERS" };
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${title[f]}, ${a.bySize.length} ${f === "fighters" ? "attacks" : "pairs"}, against the plain ship:`); log(`     by size (the button now: the car's gunner): ${TA.line(R.bySize)}`); log(`     by sight (the fly-wired gunner): ${TA.line(R.bySight)}`); log(`  BY SIGHT LESS BY SIZE: ${TA.line(R.gain)}`);
    }
    const verdict = qualifies(out); log(verdict.ok ? "QUALIFIES: the button also sees escorts and fighters." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeBySightLoadout: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeBySightLoadout: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
