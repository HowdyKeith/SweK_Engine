// WebGLEngine/tools/ship/takeFlyWiredGunnerFix.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY-WIRED GUNNER WITH A STICKY SIGHT. tools/ship/takeFlyWiredFights.mjs read the fly-wired gunner (brain/seatFlyWiredWeightsDefault.json) LEADING the hand gunner one ship a side and TRAILING it by 0.5 in fleets of three and by 0.15 against fighters; its header has why (diagnostics on scratch pairs): the sight re-picks
// its target every tick, which in a fleet changes it every two seconds, and a gun laid by rates smooths its aim and is left pointing between targets. With a STICKY sight (brain/seatTurretGunner.mjs's stickySight: keep the target while it can be shot) the scratch fleet loss went. Keith: "do the suggested fix".
// The sticky gunner is brain/flyTracking.mjs's `sticky` (policy seatFlyWired2): the same circuit and the same two gains (-3), only the sight sticky. ONE SHIP A SIDE IT IS THE SHIPPED GUNNER TO THE BIT (brain/flyTracking-selfcheck.mjs), so the duel is not flown again here.
//
//   node tools/ship/takeFlyWiredGunnerFix.mjs [--workers n] [--write]
//
//   THE FIGHTS: fleets of THREE ships a side with no cannon on either side and with the cannon on both (battleshipDuel pairs: side X's gun seats the gunner, its helm the bow-on rule; side Y the plain fleet), 300 pairs, seeds 141001-141075 of each kind; and ONE SHIP AGAINST EIGHT FIGHTERS (battleshipFight, the cannon on,
//   PD fighters; the gunner's ship against the plain ship in the same attack: tools/ship/pairPool.mjs's fighterLead), 300 attacks, seeds 151001-151075 of each kind. THE ARMS in each: the shipped gunner and the sticky gunner, on the same pairs.
//
// REGISTERED 2026-11-17, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each of the three fights, each a mean with a word at |z| >= 2: the sticky gunner against the plain side; the shipped gunner against the plain side (a replication of the fights study's -0.50, -0.50, -0.15); THE STICKY LESS THE SHIPPED, pair by pair.
// FORECAST, for the record: in fleets the sticky gunner CANNOT BE TOLD from the plain side, and sticky less shipped LEADS by about 0.45 with the cannon and without; against fighters (eight targets for one ship: the sight flips there too) sticky less shipped LEADS a little and the sticky gunner still trails or cannot be told.
// WHAT SHIPS: brain/seatFlyWired2WeightsDefault.json (policy seatFlyWired2, the gains -3) if sticky less shipped LEADS in BOTH fleet fights and TRAILS in none. It would replace the shipped gunner on space-duel.html: one ship a side it is the same, elsewhere better.
// Every arm's leads are kept (brain/rig-results/flyWiredGunnerFix/); the reading file is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: a sticky sight for the hand gunner (it does not care: -0.12 on scratch pairs) or for the race car's gunner, a sight that remembers the other targets while it sticks, the trained 6DOF fighter pilot.
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
export const DEFAULT_OUT = path.join(BRAIN, "seatFlyWired2WeightsDefault.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredGunnerFix");
export const REGIMES = Object.freeze(["fleetNoCannon", "fleetCannon", "fighters"]), ARMS = Object.freeze(["shipped", "sticky"]), FLEET_SHIPS = 3, GAINS = Object.freeze([-3, -3]);
const pairs = (kinds, first, n) => Object.freeze(kinds.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const FLEET_PAIRS = pairs(D.KINDS, 141001, 75), FIGHTER_ATTACKS = pairs(BF.KINDS, 151001, 75);
export const POLICY = Object.freeze({ shipped: FT.POLICY_ID, sticky: FT.POLICY_ID2 });
/** The jobs of one fight and arm. */
export function jobsOf(regime, arm, list = regime === "fighters" ? FIGHTER_ATTACKS : FLEET_PAIRS) {
    const network = { policy: POLICY[arm], weights: GAINS.slice() };
    if (regime === "fighters") return list.map(({ kind, seed }) => ({ vsFighters: { network, helm: null, seed, kind, opts: {} } }));
    const cannon = regime === "fleetCannon";
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon, network }, y: { id: "plain", cannon }, kind, seed, opts: { ships: FLEET_SHIPS } }));
}
/** One fight's readings from its two arms' leads. Pure. */
export function fightReadings(a) {
    const r = { sticky: TA.stat(a.sticky), shipped: TA.stat(a.shipped), gain: TA.stat(a.sticky.map((v, i) => v - a.shipped[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** Does the sticky gunner ship? Sticky less shipped LEADS in both fleet fights and TRAILS in none of the three. Pure. */
export function qualifies(out) {
    const reasons = [];
    for (const g of ["fleetNoCannon", "fleetCannon"]) if (!(out[g].reading.gain.z >= 2)) reasons.push(`in ${g} sticky less shipped reads ${TA.word(out[g].reading.gain.z)} (z ${out[g].reading.gain.z.toFixed(2)})`);
    for (const g of REGIMES) if (out[g].reading.gain.z <= -2) reasons.push(`in ${g} sticky less shipped TRAILS`);
    return { ok: reasons.length === 0, reasons };
}
/** The study. `fly(regime, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { fleetNoCannon: `FLEETS OF ${FLEET_SHIPS} A SIDE, NO CANNON`, fleetCannon: `FLEETS OF ${FLEET_SHIPS} A SIDE, THE CANNON ON`, fighters: "ONE SHIP AGAINST EIGHT FIGHTERS" };
    for (const g of REGIMES) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(g, arm); out[g] = fightReadings(a); const R = out[g].reading;
        log(`${title[g]}, ${a.sticky.length} ${g === "fighters" ? "attacks" : "pairs"}, each against the plain side:`); log(`     the shipped gunner: ${TA.line(R.shipped)}`); log(`     the sticky gunner: ${TA.line(R.sticky)}`); log(`  THE STICKY LESS THE SHIPPED: ${TA.line(R.gain)}`);
    }
    const verdict = qualifies(out); log(verdict.ok ? "QUALIFIES: the sticky gunner ships." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { ...out, verdict };
}
/** The file written when it qualifies: a seatFlyWired2 brain of the gains -3 whose `by` carries every reading. */
export function blobOf(result) {
    const R = (g) => result[g].reading;
    const by = `tools/ship/takeFlyWiredGunnerFix.mjs: brain/flyTracking.mjs's fly-wired gunner (NOTHING INSIDE THE CIRCUIT IS LEARNED; the gains -3, chosen one ship a side by tools/ship/takeFlyWiredGunner.mjs) behind a STICKY SIGHT (brain/seatTurretGunner.mjs's stickySight: it keeps its target while it can be shot); one ship a side it is that gunner to the bit. ` +
        `Read once, each against the plain side: FLEETS OF THREE, NO CANNON (${FLEET_PAIRS.length} pairs, seeds ${FLEET_PAIRS[0].seed}-): the sticky gunner ${TA.line(R("fleetNoCannon").sticky)}, the shipped one ${TA.line(R("fleetNoCannon").shipped)}, sticky less shipped ${TA.line(R("fleetNoCannon").gain)}; ` +
        `FLEETS OF THREE, THE CANNON ON: sticky ${TA.line(R("fleetCannon").sticky)}, shipped ${TA.line(R("fleetCannon").shipped)}, sticky less shipped ${TA.line(R("fleetCannon").gain)}; ONE SHIP AGAINST EIGHT FIGHTERS (${FIGHTER_ATTACKS.length} attacks, seeds ${FIGHTER_ATTACKS[0].seed}-): sticky ${TA.line(R("fighters").sticky)}, shipped ${TA.line(R("fighters").shipped)}, sticky less shipped ${TA.line(R("fighters").gain)}; regular gunners, PD fighters`;
    return PB.exportBrain(PB.describePolicy(FT.POLICY_ID2, FT.sticky), Float32Array.from(GAINS), { score: Number(R("fleetNoCannon").sticky.mean.toFixed(3)), by, citation: "male-cns visual target-tracking pathway, LC10a/AOTU019/AOTU025/DNa02, with the LC10a cells' dendrite positions (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredGunnerFix: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredGunnerFix: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (regime, arm) => { const f = path.join(kept, `${regime}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(regime, arm)); fs.writeFileSync(f, JSON.stringify({ regime, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
