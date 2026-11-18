// WebGLEngine/tools/ship/takeFlyWiredPilot.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE SHIPPED FLY-WIRED BRAINS AGAINST THE TRAINED FIGHTER PILOT. Every fighter fight so far (tools/ship/takeFlyWiredFights.mjs, takeFlyWiredGunnerFix.mjs, takeFlyWiredGunnerShips.mjs) flew the fighters with the PD autopilot. brain/battleshipFight.mjs's gate calls the trained 6DOF pilot (brain/pilot6dofWeightsDefault-d18.json, the
// weights frozen for this arena's damage and standoff) the real threat: eight of them put 14,796 damage on a ship over twelve attacks where the PD fighters put 1,692. Keith: "lets do both" (this and the cannon-fleet question).
//
//   node tools/ship/takeFlyWiredPilot.mjs [--workers n]
//
//   THE FIGHT: brain/battleshipFight.mjs, one capital ship (the cannon on) against EIGHT fighters flown by the trained 6DOF pilot, in the four kinds of attack, regular gunners; 300 attacks, seeds 191001-191075 of each kind. A lead is the ship with the brains less the plain ship (the hand gunner, the rule) in the same attack,
//   scored by the share of fighters destroyed less the share of hit points lost (tools/ship/pairPool.mjs's fighterLead, with the pilot given by name). THE ARMS: the cannon-aware fly-wired helm (brain/helmFlyWired3WeightsDefault.json) alone, the ships-sticky fly-wired gunner (brain/seatFlyWired3WeightsDefault.json) alone, both.
//   Beside them, from the plain ship's own fights: how often it survives and how much of it is left.
//
// REGISTERED 2026-11-18, BEFORE ANY ATTACK BELOW WAS FLOWN (one scratch attack of each kind, seed 99011, was flown while adding the pilot to the fighter job; in no registered set). Readings, each a mean with a word at |z| >= 2: each arm against the plain ship; BOTH LESS THE BETTER ALONE.
// FORECAST, for the record: the helm CANNOT BE TOLD or leads a little (it did +0.027 against PD fighters); the gunner TRAILS, by more than against PD fighters (-0.148 there; it lays by rates and a trained fighter jinks), and so does both.
// READ 2026-11-18 (brain/flyWiredPilot.reading.json): the plain ship wins 233 and is lost in 64 of 300 (173 hit points left on average); the helm +0.081 (z 3.8) LEADS; the gunner -0.308 (z -17) TRAILS; both -0.146 TRAILS (both less the helm -0.227). The forecast was right; the gunner costs twice what
//   it costs against PD fighters. Against fighters a ship wants the hand gunner in its seats and the fly-wired helm at its helm.
// NOTHING SHIPS: it says what the shipped brains do against the real threat. Every arm's leads are kept (brain/rig-results/flyWiredPilot/); the reading file is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: the League and close-quarters pilots, green or ace gunners, two ships, escorts.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as FS from "../../brain/flySteering.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "flyWiredPilot.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredPilot"), PILOT_FILE = "pilot6dofWeightsDefault-d18.json";
export const ARMS = Object.freeze(["helm", "gunner", "both"]), ATTACKS = Object.freeze(BF.KINDS.flatMap((kind) => Array.from({ length: 75 }, (_, i) => Object.freeze({ kind, seed: 191001 + i }))));
/** The two shipped brains and the pilot, checked: { helm, gunner, pilot } as { policy, weights }. */
export function shipped(dir = BRAIN) {
    const read = (file, id, lib) => { const blob = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")), r = PB.importBrain(PB.describePolicy(id, lib), blob); if (!r.ok) throw new Error(`takeFlyWiredPilot.shipped: ${file} is refused: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: read("helmFlyWired3WeightsDefault.json", FS.POLICY_ID3, FS.third), gunner: read("seatFlyWired3WeightsDefault.json", FT.POLICY_ID3, FT.stickyShips), pilot: read(PILOT_FILE, "pilot6dofPolicy", P6) };
}
/** The jobs of one arm: fighter jobs with the trained pilot named. */
export const jobsOf = (arm, b, list = ATTACKS) => list.map(({ kind, seed }) => ({ vsFighters: { network: arm === "gunner" || arm === "both" ? b.gunner : null, helm: arm === "helm" || arm === "both" ? b.helm : null, seed, kind, opts: { pilotNet: b.pilot } } }));
/** The readings from the three arms' leads. Pure. */
export function readings(a) {
    const mh = TA.stat(a.helm), mg = TA.stat(a.gunner), better = mh.mean >= mg.mean ? "helm" : "gunner", r = { helm: mh, gunner: mg, both: TA.stat(a.both), overBetter: TA.stat(a.both.map((v, i) => v - a[better][i])) };
    return { reading: r, better, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** The plain ship's fights against the trained pilot, summed: how often it survives, and its hit points left. */
export function plainFate(b, list = ATTACKS) {
    const pilot = P6.pilotFor(Float32Array.from(b.pilot.weights)); let won = 0, lost = 0, hp = 0;
    for (const { kind, seed } of list) { const t = BF.fight(seed, kind, { pilot }); if (t.winner === "ship") won++; if (t.winner === "fighters") lost++; hp += t.ship.hpLeft; }
    return { attacks: list.length, won, lost, hpLeft: hp / list.length };
}
/** The study. `fly(arm)` -> Promise of leads; `fate` the plain ship's (or null). */
export async function study(fly, fate = null, log = () => {}) {
    const a = {}; for (const arm of ARMS) a[arm] = await fly(arm); const out = readings(a), R = out.reading;
    log(`ONE SHIP AGAINST EIGHT TRAINED-PILOT FIGHTERS, ${a.helm.length} attacks, each against the plain ship:`);
    if (fate) log(`     the plain ship itself wins ${fate.won} and is lost in ${fate.lost} of ${fate.attacks}, with ${fate.hpLeft.toFixed(0)} of 1,500 hit points left on average`);
    for (const arm of ARMS) log(`     the ${arm === "both" ? "helm and the gunner" : arm + " alone"}: ${TA.line(R[arm])}`);
    log(`  BOTH LESS THE BETTER ALONE (the ${out.better}): ${TA.line(R.overBetter)}`);
    return { ...out, fate };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredPilot: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("out", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredPilot: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const b = shipped(), pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (arm) => { const f = path.join(kept, `${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(arm, b)); fs.writeFileSync(f, JSON.stringify({ arm, leads }) + "\n"); return leads; };
    const result = await study(fly, plainFate(b), (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
