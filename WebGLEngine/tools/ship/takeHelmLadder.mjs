// WebGLEngine/tools/ship/takeHelmLadder.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A LADDER OF THE DUEL PAGE'S HELMS. The loadout ladder (tools/ship/takeLadder.mjs) read every helmed loadout ahead of every bow-on one by more than a point -- but its only helm was the cannon-aware fly-wired one (helmFlyWired3). The page has three more:
// `trained` (the escape circuit's helm, brain/helmPolicy.mjs), `steer` (brain/helmSteerPolicy.mjs) and `compass` (brain/helmCompassPolicy.mjs), each correcting the bow-on rule, each trained before any gunner held its trigger. Is the fly-wired helm the best
// helm on the page, or only better than the rule? Keith: "then 4" (a stronger opponent: the page's other helms on the ladder).
//
//   node tools/ship/takeHelmLadder.mjs [--workers n]
//
//   THE ENTRANTS (all with the cannon, the shipped files, and EVERY ONE THE BEST-SHIP BUTTON'S GUNNER -- one ship a side the fly-wired gunner with no hand window, in a fleet with its 45-degree window -- so only the helm differs): `flywired`, `trained`,
//   `steer`, `compass`, and `face` (the bow-on rule, no helm network). THE FIGHTS: ONE SHIP A SIDE (seeds 801001-) and fleets of THREE a side (811001-), 160 pairs each (40 of each kind), the same pairs for every match; every match of two entrants, each pair
//   flown with each in either seat.
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings: each match's lead (the first-named less the second), a mean with a word at |z| >= 2; each entrant's SCORE in a fight, the mean of its leads over the other four.
// FORECAST, for the record: flywired first in both (it alone knows the cannon is aboard; the others were trained to correct the rule with the hand gunner); steer and compass next, ahead of trained (as they were over the rule: +0.64 and +0.20 over trained
//   on 600 pairs); face last.
// WHAT IS DECIDED: nothing ships. The page's helm notes say each helm's place, and any helm that LEADS the fly-wired one in a fight is said there (and would be a candidate for the buttons in another study).
// Every match's leads are kept (brain/rig-results/helmLadder/); the reading file (brain/helmLadder.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: the broadside rule, the first fly-wired helms, escorts, no cannon, the car's gunner.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as ST from "../../brain/seatTurretGunner.mjs";
import * as FS from "../../brain/flySteering.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as HP from "../../brain/helmPolicy.mjs";
import * as HS from "../../brain/helmSteerPolicy.mjs";
import * as HC from "../../brain/helmCompassPolicy.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "helmLadder.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "helmLadder");
export const FILES = Object.freeze({ flywired: path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), trained: path.join(BRAIN, "helmWeightsDefault.json"), steer: path.join(BRAIN, "helmSteerWeightsDefault.json"), compass: path.join(BRAIN, "helmCompassWeightsDefault.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), flyOne: path.join(BRAIN, "seatFlyWired11WeightsOne.json") });
export const ENTRANTS = Object.freeze(["flywired", "trained", "steer", "compass", "face"]), FIGHTS = Object.freeze(["one", "fleet3"]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ one: pairs(801001, 40), fleet3: pairs(811001, 40) });
export const SHIPS = Object.freeze({ one: 1, fleet3: 3 });
/** The shipped files, each checked by its policy. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeHelmLadder: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { flywired: one(FILES.flywired, FS.POLICY_ID3, FS.third), trained: one(FILES.trained, "helmPolicy", HP), steer: one(FILES.steer, "helmSteerPolicy", HS), compass: one(FILES.compass, "helmCompassPolicy", HC), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways), flyOne: one(FILES.flyOne, FT.POLICY_ID11, FT.nearAlways) };
}
/** An entrant's side in a fight, as plain data. */
export function sideOf(entrant, fight, b, id) {
    const ships = SHIPS[fight], network = ships > 1 ? b.fly : b.flyOne;   // every entrant carries the best-ship button's gunner for the fight: only the helm differs
    return { id, cannon: true, network, helmNet: entrant === "face" ? null : b[entrant], helmRule: "face" };
}
/** The matches flown in a fight: every two different entrants, but not two that are the same side there. */
export function matchesOf(fight, b) {
    const out = []; for (let i = 0; i < ENTRANTS.length; i++) for (let j = i + 1; j < ENTRANTS.length; j++) { const a = ENTRANTS[i], c = ENTRANTS[j]; if (JSON.stringify(sideOf(a, fight, b, "s")) !== JSON.stringify(sideOf(c, fight, b, "s"))) out.push([a, c]); }
    return out;
}
/** The jobs of one match: the first-named entrant on side X. */
export function jobsOf(fight, [a, c], b, list = SETS[fight]) {
    return list.map(({ kind, seed }) => ({ x: sideOf(a, fight, b, "x"), y: sideOf(c, fight, b, "y"), kind, seed, opts: { ships: SHIPS[fight] } }));
}
/** A fight's readings: each match's lead and each entrant's score (the mean of its leads over the others; a match not flown counts 0). Pure. */
export function fightReadings(leads) {
    const matches = Object.fromEntries(Object.entries(leads).map(([k, v]) => [k, TA.stat(v)])), score = {};
    for (const e of ENTRANTS) { let s = 0; for (const o of ENTRANTS) { if (o === e) continue; const k1 = `${e}~${o}`, k2 = `${o}~${e}`; s += matches[k1] ? matches[k1].mean : matches[k2] ? -matches[k2].mean : 0; } score[e] = s / (ENTRANTS.length - 1); }
    const order = ENTRANTS.slice().sort((p, q) => score[q] - score[p]);
    return { matches, words: Object.fromEntries(Object.entries(matches).map(([k, s]) => [k, TA.word(s.z)])), score, order };
}
/** The study. `fly(fight, match)` -> Promise of leads. */
export async function study(fly, b, log = () => {}) {
    const out = {};
    for (const f of FIGHTS) {
        const leads = {}; for (const m of matchesOf(f, b)) { leads[`${m[0]}~${m[1]}`] = await fly(f, m); }
        out[f] = fightReadings(leads); const R = out[f];
        log(`${f === "one" ? "ONE SHIP A SIDE" : "FLEETS OF 3 A SIDE"}, THE CANNON ON, THE BUTTON'S GUNNER ON EVERY SIDE, ${SETS[f].length} pairs a match:`);
        for (const [k, s] of Object.entries(R.matches)) log(`     ${k.replace("~", " against ")}: ${TA.line(s)}`);
        log(`  THE LADDER: ${R.order.map((e) => `${e} ${R.score[e].toFixed(3)}`).join(" > ")}`);
    }
    return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeHelmLadder: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeHelmLadder: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, m) => { const f = path.join(kept, `${fight}_${m[0]}~${m[1]}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, m, b)); fs.writeFileSync(f, JSON.stringify({ fight, match: m, leads }) + "\n"); return leads; };
    const result = await study(fly, b, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
