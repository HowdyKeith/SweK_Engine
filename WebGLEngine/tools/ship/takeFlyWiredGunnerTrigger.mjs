// WebGLEngine/tools/ship/takeFlyWiredGunnerTrigger.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE PAGE'S GUNNER HOLDING THE TRIGGER. The race car's trained gunner (car-big) beats every other gunner on space-duel.html, and what it learned is to HOLD THE TRIGGER whenever it has a target (tools/ship/trainTurretSeatBig.mjs). brain/flyTracking.mjs's
// `nearAlways` (policy seatFlyWired11) is the page's fly-wired gunner (seatFlyWired10) with that one change, on the circuit's ticks and the hand's (brain/seatTurretGunner.mjs's `alwaysFire`). Keith: "then 2" -- round 2.
// ON SCRATCH PAIRS (136001-136006 of each kind, 24 a fight; brain/flyTracking.mjs's header): +0.49 with the cannon, +0.81 without, +0.43 rationed to a quarter, +0.017 against fighters.
//
//   node tools/ship/takeFlyWiredGunnerTrigger.mjs [--workers n] [--write]
//
//   THE FIGHTS: fleets of THREE a side with the cannon on both sides and with none, on the same pairs (seeds 461001-); fleets of three with the cannon and A QUARTER OF EVERY MAGAZINE (battleshipDuel's `ammo` 0.25; seeds 471001-); fleets of three with SIX
//   ESCORT FIGHTERS a side and the cannon (seeds 481001-); one ship against eight PD fighters (battleshipFight; seeds 491001-). 300 pairs or attacks a fight, 75 of each kind. Side X's seats have the gunner, its helm the bow-on rule; side Y is plain.
//   THE ARMS: seatFlyWired10 (the page's) and seatFlyWired11 (the trigger held), both at [-3, -3, 0.1, 0.2, 45 degrees], on the same pairs.
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain side; THE HELD TRIGGER LESS THE PAGE'S, pair by pair.
// FORECAST, for the record: LEADS in every fleet fight, by about the scratch pairs' 0.5 to 0.8 (perhaps less: one draw of 24); rationed LEADS by less; with escorts LEADS; against fighters a small lead (about 0.02) or CANNOT BE TOLD.
// WHAT SHIPS: brain/seatFlyWired11WeightsDefault.json (policy seatFlyWired11) if the gain LEADS in at least one fight and TRAILS in none. It would replace seatFlyWired10 as the `flywired` hand on space-duel.html.
// Every arm's leads are kept (brain/rig-results/flyWiredGunnerTrigger/); the reading file is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: other rations, one ship a side (tools/ship/takeFlyWiredGunnerControl.mjs flies the page's gunner there), the trained pilot, the cannon-aware helm (the loadout study's question).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as FT from "../../brain/flyTracking.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const DEFAULT_OUT = path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredGunnerTrigger");
export const REGIMES = Object.freeze(["fleetCannon", "fleetNoCannon", "rationed", "escortsCannon", "fighters"]), ARMS = Object.freeze(["page", "held"]), RATION = 0.25, ESCORTS = 6;
export const POLICY = Object.freeze({ page: FT.POLICY_ID10, held: FT.POLICY_ID11 }), WEIGHTS = Object.freeze([-3, -3, 0.1, 0.2, Math.PI / 4]);
const pairs = (kinds, first, n) => Object.freeze(kinds.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
const FLEET = pairs(D.KINDS, 461001, 75);   // both fleet fights fly the same pairs
export const SETS = Object.freeze({ fleetCannon: FLEET, fleetNoCannon: FLEET, rationed: pairs(D.KINDS, 471001, 75), escortsCannon: pairs(D.KINDS, 481001, 75), fighters: pairs(BF.KINDS, 491001, 75) });
/** The jobs of one fight and arm. */
export function jobsOf(regime, arm, list = SETS[regime]) {
    const network = { policy: POLICY[arm], weights: WEIGHTS.slice() };
    if (regime === "fighters") return list.map(({ kind, seed }) => ({ vsFighters: { network, helm: null, seed, kind, opts: {} } }));
    const cannon = regime !== "fleetNoCannon", opts = { ships: 3, ...(regime === "escortsCannon" ? { escorts: ESCORTS } : {}), ...(regime === "rationed" ? { ammo: RATION } : {}) };
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon, network }, y: { id: "plain", cannon }, kind, seed, opts }));
}
/** One fight's readings from its two arms' leads. Pure. */
export function fightReadings(a) {
    const r = { held: TA.stat(a.held), page: TA.stat(a.page), gain: TA.stat(a.held.map((v, i) => v - a.page[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** Does it ship? The gain LEADS in at least one fight and TRAILS in none. Pure. */
export function qualifies(out) {
    const reasons = [];
    if (!REGIMES.some((g) => out[g].reading.gain.z >= 2)) reasons.push(`the gain leads in no fight (z ${REGIMES.map((g) => out[g].reading.gain.z.toFixed(2)).join(", ")})`);
    for (const g of REGIMES) if (out[g].reading.gain.z <= -2) reasons.push(`in ${g} the gain TRAILS`);
    return { ok: reasons.length === 0, reasons };
}
/** The study. `fly(regime, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { fleetCannon: "FLEETS OF 3 A SIDE, THE CANNON ON", fleetNoCannon: "FLEETS OF 3 A SIDE, NO CANNON", rationed: `FLEETS OF 3 A SIDE, THE CANNON ON, A ${RATION} RATION`, escortsCannon: `FLEETS OF 3 A SIDE WITH ${ESCORTS} ESCORTS A SIDE, THE CANNON ON`, fighters: "ONE SHIP AGAINST EIGHT FIGHTERS" };
    for (const g of REGIMES) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(g, arm); out[g] = fightReadings(a); const R = out[g].reading;
        log(`${title[g]}, ${a.held.length} ${g === "fighters" ? "attacks" : "pairs"}, each against the plain side:`); log(`     the page's gunner (seatFlyWired10): ${TA.line(R.page)}`); log(`     the trigger held (seatFlyWired11): ${TA.line(R.held)}`); log(`  THE HELD TRIGGER LESS THE PAGE'S: ${TA.line(R.gain)}`);
    }
    const verdict = qualifies(out); log(verdict.ok ? "QUALIFIES: the gunner holding the trigger ships." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { ...out, verdict };
}
/** The file written when it qualifies. */
export function blobOf(result) {
    const R = (g) => result[g].reading, by = "tools/ship/takeFlyWiredGunnerTrigger.mjs: the page's fly-wired gunner (seatFlyWired10: the circuit's big swings, the hand's last 45 degrees and every fighter; NOTHING INSIDE THE CIRCUIT IS LEARNED) with THE TRIGGER HELD WHENEVER IT HAS A TARGET. Read once, each fight 300 pairs or attacks, the held trigger less the page's: " + REGIMES.map((g) => `${g} ${TA.line(R(g).gain)}`).join("; ");
    return PB.exportBrain(PB.describePolicy(FT.POLICY_ID11, FT.nearAlways), Float32Array.from(WEIGHTS), { score: Number(R("fleetCannon").held.mean.toFixed(3)), by, citation: "male-cns visual target-tracking pathway, LC10a/AOTU019/AOTU025/DNa02, with the LC10a cells' dendrite positions (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredGunnerTrigger: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredGunnerTrigger: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (regime, arm) => { const f = path.join(kept, `${regime}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(regime, arm)); fs.writeFileSync(f, JSON.stringify({ regime, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
