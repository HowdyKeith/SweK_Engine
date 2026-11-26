// WebGLEngine/tools/ship/takeFlyWiredGunnerSees.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY-WIRED GUNNER THAT SEES ITS TARGET MOVE. brain/flyTracking.mjs's motion gunner drives the LC10a cells at the bearing plus tau times the bearing's rate; read off the sight's noisy aim that rate was a cost (the module's header), but read off the TARGET'S OWN
// BEARING in the ship's frame (where it really is each tick), on scratch pairs, tau 0.1 took the ships-sticky gunner's kills against fighters from 117 to 128 (the plain ship's) and was level in fleets. `movingTarget` (policy seatFlyWired7: tau 0.1, the slip
// low-passed over 0.2 s, BOTH CHOSEN ON THOSE SCRATCH PAIRS) is flown here on fresh pairs. Keith: "then 4 and 5" -- round 4 of the rounds suggested on 2026-11-18.
// WHAT IS KNOWN BEFORE ANY FLIGHT (brain/flyTracking-selfcheck.mjs, to the bit): at tau 0 it IS the ships-sticky gunner.
//
//   node tools/ship/takeFlyWiredGunnerSees.mjs [--workers n] [--write]
//
//   THE FIGHTS: one ship against eight fighters (battleshipFight, as tools/ship/pairPool.mjs's fighterLead; seeds 291001-, 75 of each attack); fleets of THREE ships a side with the cannon on both sides (301001-) and with none (311001-), 75 of each of the duel's
//   kinds. Side X's seats have the gunner, its helm the bow-on rule; side Y (or the fighters' target) is plain. THE ARMS: the ships-sticky gunner (seatFlyWired3 at -3, -3, shipped) and the gunner that sees its target move (seatFlyWired7 at -3, -3, 0.1), on the same pairs.
//
// REGISTERED 2026-11-19, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: the seeing gunner against the plain side; the ships-sticky against the plain side; THE SEEING LESS THE SHIPS-STICKY, pair by pair.
// FORECAST, for the record: against fighters the gain LEADS, by about 0.02 (eleven kills in 64 attacks on the scratch pairs is +0.02 of kills over eight); in the fleets CANNOT BE TOLD.
// WHAT SHIPS: brain/seatFlyWired7WeightsDefault.json (policy seatFlyWired7, the weights -3, -3, 0.1) if the gain LEADS in at least one fight and TRAILS in none. It would then be a candidate for the `flywired` hand on space-duel.html.
// READ 2026-11-19 (brain/seatFlyWired7WeightsDefault.reading.json): the seeing less the ships-sticky +0.137 (z 16.1) against fighters, +0.102 (z 3.8) in fleets with the cannon, +0.113 (z 3.6) without. IT SHIPS: brain/seatFlyWired7WeightsDefault.json.
//   Against the plain side it is nearly level against fighters (-0.021, where the ships-sticky gunner was -0.158), leads in fleets without the cannon (+0.201) and still trails with it (-0.160). The forecast was far under against fighters and wrong in
//   the fleets. NOT ON THE PAGE YET: the page's `flywired` hand became the holding mixed gunner (seatFlyWired6) the same day, and the two have not been flown against each other; the hold with this slip on ships is the next arm (tools/ship/todo.mjs).
// Every arm's leads are kept (brain/rig-results/flyWiredGunnerSees/); the reading file is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: other taus and smoothings (chosen on scratch, not searched here), escorts, the trained 6DOF pilot, the mixed gunners with this slip.
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
export const DEFAULT_OUT = path.join(BRAIN, "seatFlyWired7WeightsDefault.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredGunnerSees");
export const REGIMES = Object.freeze(["fighters", "fleetCannon", "fleetNoCannon"]), ARMS = Object.freeze(["ships", "sees"]), FLEET_SHIPS = 3, GAINS = Object.freeze([-3, -3]), TAU = 0.1;
export const POLICY = Object.freeze({ ships: FT.POLICY_ID3, sees: FT.POLICY_ID7 });
export const WEIGHTS = Object.freeze({ ships: Object.freeze([...GAINS]), sees: Object.freeze([...GAINS, TAU]) });
const pairs = (kinds, first, n) => Object.freeze(kinds.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ fighters: pairs(BF.KINDS, 291001, 75), fleetCannon: pairs(D.KINDS, 301001, 75), fleetNoCannon: pairs(D.KINDS, 311001, 75) });
/** The jobs of one fight and arm. */
export function jobsOf(regime, arm, list = SETS[regime]) {
    const network = { policy: POLICY[arm], weights: WEIGHTS[arm].slice() };
    if (regime === "fighters") return list.map(({ kind, seed }) => ({ vsFighters: { network, helm: null, seed, kind, opts: {} } }));
    const cannon = regime === "fleetCannon", opts = { ships: FLEET_SHIPS };
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon, network }, y: { id: "plain", cannon }, kind, seed, opts }));
}
/** One fight's readings from its two arms' leads. Pure. */
export function fightReadings(a) {
    const r = { sees: TA.stat(a.sees), ships: TA.stat(a.ships), gain: TA.stat(a.sees.map((v, i) => v - a.ships[i])) };
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
    const out = {}, title = { fighters: "ONE SHIP AGAINST EIGHT FIGHTERS", fleetCannon: "FLEETS OF 3 A SIDE, THE CANNON ON", fleetNoCannon: "FLEETS OF 3 A SIDE, NO CANNON" };
    for (const g of REGIMES) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(g, arm); out[g] = fightReadings(a); const R = out[g].reading;
        log(`${title[g]}, ${a.sees.length} ${g === "fighters" ? "attacks" : "pairs"}, each against the plain side:`); log(`     the ships-sticky gunner: ${TA.line(R.ships)}`); log(`     the gunner that sees its target move: ${TA.line(R.sees)}`); log(`  IT LESS THE SHIPS-STICKY: ${TA.line(R.gain)}`);
    }
    const verdict = qualifies(out); log(verdict.ok ? "QUALIFIES: the gunner that sees its target move ships." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { ...out, verdict };
}
/** The file written when it qualifies. */
export function blobOf(result) {
    const R = (g) => result[g].reading, part = (g, what) => `${what}: it ${TA.line(R(g).sees)}, the ships-sticky one ${TA.line(R(g).ships)}, the gain ${TA.line(R(g).gain)}`;
    const by = "tools/ship/takeFlyWiredGunnerSees.mjs: brain/flyTracking.mjs's fly-wired gunner (NOTHING INSIDE THE CIRCUIT IS LEARNED; the gains -3) behind a sight that sticks to capital ships, its LC10a cells driven at the bearing PLUS 0.1 s TIMES THE TARGET'S OWN BEARING RATE in the ship's frame (from where the target really is, low-passed over 0.2 s); at 0 s it is the ships-sticky gunner to the bit. Read once, each fight 300 pairs or attacks against the plain side: " +
        [part("fighters", "ONE SHIP AGAINST EIGHT FIGHTERS"), part("fleetCannon", "FLEETS OF THREE, THE CANNON ON"), part("fleetNoCannon", "FLEETS OF THREE, NO CANNON")].join("; ") + "; regular gunners, PD fighters";
    return PB.exportBrain(PB.describePolicy(FT.POLICY_ID7, FT.movingTarget), Float32Array.from(WEIGHTS.sees), { score: Number(R("fighters").sees.mean.toFixed(3)), by, citation: "male-cns visual target-tracking pathway, LC10a/AOTU019/AOTU025/DNa02, with the LC10a cells' dendrite positions (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredGunnerSees: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredGunnerSees: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (regime, arm) => { const f = path.join(kept, `${regime}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(regime, arm)); fs.writeFileSync(f, JSON.stringify({ regime, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
