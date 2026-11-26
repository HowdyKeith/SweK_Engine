// WebGLEngine/tools/ship/takeLadder.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A LADDER OF THE DUEL PAGE'S LOADOUTS, EACH AGAINST EACH. Every study so far read a loadout against the PLAIN SHIP, which the best of them now beat by 1.5 to 2.2: the plain ship no longer tells them apart. This flies them against each other.
// Keith: "1 first" (a ladder of the page's loadouts).
//
//   node tools/ship/takeLadder.mjs [--workers n]
//
//   THE ENTRANTS (all with the cannon; the shipped files): `best` (the best-ship preset: the cannon-aware fly-wired helm over the by-the-fight hand -- one ship a side the fly-wired gunner with no hand window, in a fleet with its 45-degree window); `fleet` (the
//   best-fleet preset: the same helm over the 45-degree gunner); `oldBest` (the same helm over the car's always-firing gunner, the best-ship preset until 2026-11-20); `faceFly` (the bow-on rule over the 45-degree gunner); `plain` (the bow-on rule over the
//   hand gunner: the plain ship).
//   THE FIGHTS: ONE SHIP A SIDE (seeds 761001-) and fleets of THREE a side (771001-), 160 pairs each (40 of each of the duel's kinds), the same pairs for every match. A MATCH is two entrants, each pair flown with each in either seat (the lead is the mean of the
//   two). Every match of two different entrants is flown, except where the two are the same side in that fight (best and fleet in a fleet: a lead of exactly 0).
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings: each match's lead (the first-named less the second), a mean with a word at |z| >= 2; each entrant's SCORE in a fight, the mean of its leads over the other four (a match not flown counts 0).
// FORECAST, for the record: one ship a side best > fleet ~ oldBest > faceFly > plain; in fleets best = fleet > oldBest > faceFly > plain; every helmed entrant leads every bow-on one by about a point.
// WHAT IS DECIDED: nothing ships. The page's notes say the ladder (each preset's place, and any match a preset LOSES).
// READ 2026-11-20 (brain/ladder.reading.json): one ship a side best 0.799 > oldBest 0.775 > fleet 0.678 > faceFly -0.701 > plain -1.550 (best less oldBest +0.030, cannot be told; fleet less oldBest -0.137, TRAILS); in fleets best = fleet 0.831 > oldBest 0.453 >
//   faceFly -0.731 > plain -1.383 (best less oldBest +0.307). Every helmed entrant leads every bow-on one by more than a point. The forecast was right but one ship a side, where best and oldBest cannot be told. The presets' notes say their places.
// Every match's leads are kept (brain/rig-results/ladder/); the reading file (brain/ladder.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: other hands and helms, escorts, no cannon, rationed magazines.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as ST from "../../brain/seatTurretGunner.mjs";
import * as FS from "../../brain/flySteering.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "ladder.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "ladder");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), car: path.join(BRAIN, "seatTurretGunnerWeightsBig.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), flyOne: path.join(BRAIN, "seatFlyWired11WeightsOne.json") });
export const ENTRANTS = Object.freeze(["best", "fleet", "oldBest", "faceFly", "plain"]), FIGHTS = Object.freeze(["one", "fleet3"]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ one: pairs(761001, 40), fleet3: pairs(771001, 40) });
export const SHIPS = Object.freeze({ one: 1, fleet3: 3 });
/** The shipped files, each checked by its policy. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeLadder: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), car: one(FILES.car, ST.POLICY_ID, ST), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways), flyOne: one(FILES.flyOne, FT.POLICY_ID11, FT.nearAlways) };
}
/** An entrant's side in a fight, as plain data. */
export function sideOf(entrant, fight, b, id) {
    const ships = SHIPS[fight], helm = ["best", "fleet", "oldBest"].includes(entrant) ? b.helm : null;
    const network = { best: ships > 1 ? b.fly : b.flyOne, fleet: b.fly, oldBest: b.car, faceFly: b.fly, plain: null }[entrant];
    return { id, cannon: true, network, helmNet: helm };
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
        log(`${f === "one" ? "ONE SHIP A SIDE" : "FLEETS OF 3 A SIDE"}, THE CANNON ON, ${SETS[f].length} pairs a match:`);
        for (const [k, s] of Object.entries(R.matches)) log(`     ${k.replace("~", " against ")}: ${TA.line(s)}`);
        log(`  THE LADDER: ${R.order.map((e) => `${e} ${R.score[e].toFixed(3)}`).join(" > ")}`);
    }
    return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeLadder: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeLadder: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, m) => { const f = path.join(kept, `${fight}_${m[0]}~${m[1]}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, m, b)); fs.writeFileSync(f, JSON.stringify({ fight, match: m, leads }) + "\n"); return leads; };
    const result = await study(fly, b, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
