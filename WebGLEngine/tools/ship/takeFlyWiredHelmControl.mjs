// WebGLEngine/tools/ship/takeFlyWiredHelmControl.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// DOES THE FLY'S WIRING STILL DO ANYTHING IN THE HELM? The cannon-aware fly-wired helm (helmFlyWired3) is worth more than any gunner (tools/ship/takeBestShipLoadout3.mjs). When it shipped, its circuit (fly2~odd) led a SHUFFLED circuit's helm by 1.013 and could
// NOT be told from a SINE helm (-0.039) -- one ship a side, the hand gunner in the seats (brain/flySteering.mjs's header). The gunners have changed since (they hold the trigger) and fleets were never asked. Keith: "then 2".
//
//   node tools/ship/takeFlyWiredHelmControl.mjs [--workers n]
//
//   THE FIGHTS, the cannon on both sides: ONE SHIP A SIDE (seeds 681001-) with the car's always-firing gunner aboard; fleets of THREE a side (seeds 691001-) with the page's fly-wired gunner (seatFlyWired11) -- the best-ship button's by-size pick in each.
//   300 pairs a fight, 75 of each of the duel's kinds. Side X is the helm over the gunner, side Y the plain ship. THE ARMS, all the cannon-aware helm at its shipped weights [-2, -2, 0.25, 0.25] over a read-out (brain/flySteering.mjs's thirdOver): `fly`
//   (fly2~odd, the helm itself), `sine` (sine~odd: no circuit, an ideal comparator), `shuffled` (shuffled2:4242~odd: the fly's cells with each pathway's targets shuffled within their type).
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain ship; THE FLY LESS EACH CONTROL, pair by pair.
// FORECAST, for the record: against the shuffle the fly LEADS (by about a whole point, as when it shipped); against sine CANNOT BE TOLD in both fights.
// WHAT IS DECIDED (nothing ships): the fly's wiring is CREDITED against a control if it LEADS it in at least one fight and TRAILS it in none. The page's helm note says what it read either way.
// Every arm's leads are kept (brain/rig-results/flyWiredHelmControl/); the reading file (brain/flyWiredHelmControl.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: other shuffle seeds (one draw), escorts, the gains without a cannon, the first helm's wirings.
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
export const READING = path.join(BRAIN, "flyWiredHelmControl.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredHelmControl");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), car: path.join(BRAIN, "seatTurretGunnerWeightsBig.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json") });
export const FIGHTS = Object.freeze(["one", "fleet"]), ARMS = Object.freeze(["fly", "sine", "shuffled"]), CONTROLS = Object.freeze(["sine", "shuffled"]);
export const WIRING = Object.freeze({ fly: null, sine: "sine~odd", shuffled: "shuffled2:4242~odd" });
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ one: pairs(681001, 75), fleet: pairs(691001, 75) });
/** The shipped files, each checked by its policy. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeFlyWiredHelmControl: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), car: one(FILES.car, ST.POLICY_ID, ST), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways) };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const helmNet = { ...b.helm, ...(WIRING[arm] ? { wiring: WIRING[arm] } : {}) }, network = fight === "one" ? b.car : b.fly;
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: true, network, helmNet }, y: { id: "plain", cannon: true }, kind, seed, opts: { ships: fight === "one" ? 1 : 3 } }));
}
/** One fight's readings from its arms' leads. Pure. */
export function fightReadings(a) {
    const r = Object.fromEntries(ARMS.map((arm) => [arm, TA.stat(a[arm])]));
    for (const c of CONTROLS) r[`flyOver:${c}`] = TA.stat(a.fly.map((v, i) => v - a[c][i]));
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** The controls the fly's wiring is CREDITED against (leads in one fight, trails in none). Pure. */
export function decide(out) {
    const credited = CONTROLS.filter((c) => FIGHTS.some((f) => out[f].reading[`flyOver:${c}`].z >= 2) && FIGHTS.every((f) => out[f].reading[`flyOver:${c}`].z > -2));
    return { credited, beatsSine: credited.includes("sine") };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { one: "ONE SHIP A SIDE, THE CANNON ON, THE CAR'S GUNNER ABOARD", fleet: "FLEETS OF 3 A SIDE, THE CANNON ON, THE FLY-WIRED GUNNER ABOARD" };
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${title[f]}, ${a.fly.length} pairs, the cannon-aware helm over each read-out, against the plain ship:`); for (const arm of ARMS) log(`     ${arm}: ${TA.line(R[arm])}`); for (const c of CONTROLS) log(`  THE FLY LESS ${c.toUpperCase()}: ${TA.line(R["flyOver:" + c])}`);
    }
    const verdict = decide(out); log(`THE FLY'S WIRING IS CREDITED against ${verdict.credited.length ? verdict.credited.join(", ") : "no control"}${verdict.beatsSine ? "" : " -- not against the sine comparator"}.`);
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredHelmControl: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredHelmControl: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
