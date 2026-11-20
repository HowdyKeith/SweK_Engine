// WebGLEngine/tools/ship/takeFlyWiredOneWindow.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// ONE FLY-WIRED GUNNER FOR EVERY SIZE OF FIGHT. The best-ship button takes the car's always-firing gunner one ship a side and the fly-wired gunner (seatFlyWired11) in a fleet (tools/ship/takeBySizeLoadout.mjs). On scratch pairs the fly-wired gunner with NO
// HAND WINDOW (its fifth weight 0: the circuit lays the gun on a ship all the way, the trigger held) was as good as the car's one ship a side (+1.796 against +1.768; brain/flyTracking.mjs's header) -- the hand lays at the sight's shaking aim, and with the
// trigger held every round counts -- while in fleets the 45-degree window is better. Keith: "then 3" (the backlog's fly-window-by-size). If it ships, the button is fly-wired at every size.
// WHAT IS KNOWN BEFORE ANY FLIGHT: in a fleet the button already carries the fly-wired gunner with its 45-degree window, so only one ship a side is flown.
//
//   node tools/ship/takeFlyWiredOneWindow.mjs [--workers n] [--write]
//
//   THE FIGHTS: ONE SHIP A SIDE with the cannon on both sides (seeds 701001-) and with none (711001-). 300 pairs a fight, 75 of each of the duel's kinds. Side X has the cannon-aware helm at its shipped weights, side Y is plain.
//   THE ARMS: `car` (the car's gunner, the shipped file: the button's one-ship pick) and `fly0` (seatFlyWired11's shipped weights with the fifth, the hand's window, set to 0).
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain ship; NO WINDOW LESS THE CAR'S, pair by pair.
// FORECAST, for the record: CANNOT BE TOLD with the cannon (the scratch pairs' +0.03), and without it about the same.
// WHAT SHIPS: brain/seatFlyWired11WeightsOne.json (policy seatFlyWired11, the window 0) if the gain LEADS in at least one fight and TRAILS in none; the button's by-size hand then takes it one ship a side.
// Every arm's leads are kept (brain/rig-results/flyWiredOneWindow/); the reading file is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: fleets (the 45-degree window's), one ship a side with escorts or against fighters (tools/ship/takeBySightLoadout.mjs's question), other windows.
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
export const OUT = path.join(BRAIN, "seatFlyWired11WeightsOne.json"), READING = path.join(BRAIN, "seatFlyWired11WeightsOne.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredOneWindow");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), car: path.join(BRAIN, "seatTurretGunnerWeightsBig.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json") });
export const FIGHTS = Object.freeze(["oneCannon", "oneNoCannon"]), ARMS = Object.freeze(["car", "fly0"]), WINDOW0 = Object.freeze([-3, -3, 0.1, 0.2, 0]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ oneCannon: pairs(701001, 75), oneNoCannon: pairs(711001, 75) });
/** The shipped files, each checked by its policy. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeFlyWiredOneWindow: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    const fly = one(FILES.fly, FT.POLICY_ID11, FT.nearAlways);
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), car: one(FILES.car, ST.POLICY_ID, ST), fly0: { policy: FT.POLICY_ID11, weights: [...fly.weights.slice(0, 4), 0] } };   // the page's fly-wired gunner with NO hand window: its fifth weight 0
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const cannon = fight === "oneCannon";
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon, network: b[arm], helmNet: b.helm }, y: { id: "plain", cannon }, kind, seed, opts: { ships: 1 } }));
}
/** One fight's readings from its arms' leads. Pure. */
export function fightReadings(a) {
    const r = { fly0: TA.stat(a.fly0), car: TA.stat(a.car), gain: TA.stat(a.fly0.map((v, i) => v - a.car[i])) };
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
    const out = {}, title = { oneCannon: "ONE SHIP A SIDE, THE CANNON ON", oneNoCannon: "ONE SHIP A SIDE, NO CANNON" };
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${title[f]}, ${a.car.length} pairs, under the cannon-aware helm, against the plain ship:`); log(`     the car's gunner (the button's one-ship pick): ${TA.line(R.car)}`); log(`     the fly-wired gunner with no hand window: ${TA.line(R.fly0)}`); log(`  NO WINDOW LESS THE CAR'S: ${TA.line(R.gain)}`);
    }
    const verdict = qualifies(out); log(verdict.ok ? "QUALIFIES: one ship a side the button takes the fly-wired gunner with no hand window." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept", "write"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredOneWindow: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredOneWindow: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(OUT, JSON.stringify(PB.exportBrain(PB.describePolicy(FT.POLICY_ID11, FT.nearAlways), Float32Array.from(b.fly0.weights), { score: Number(result.oneCannon.reading.fly0.mean.toFixed(3)), by: "tools/ship/takeFlyWiredOneWindow.mjs: the page's fly-wired gunner (seatFlyWired11) with NO HAND WINDOW -- the circuit lays the gun on a ship all the way, the trigger held -- for ONE SHIP A SIDE; read once against the car's gunner under the cannon-aware helm: " + FIGHTS.map((f) => `${f} ${TA.line(result[f].reading.gain)}`).join("; "), citation: "male-cns visual target-tracking pathway (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" })) + "\n"); console.log(`wrote ${OUT}`); } }
    await pool.close(); process.exit(0);
}
