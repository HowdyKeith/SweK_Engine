// WebGLEngine/tools/ship/takeEvadeSeat.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE EVADE SEAT: CAN A CAPITAL SHIP GET OUT OF THE WAY OF THE FIRE, AND DOES A FLY'S LOOMING CIRCUIT DO IT BETTER THAN A SINE? brain/evadeReflex.mjs is the reflex (its gate
// brain/evadeReflex-selfcheck.mjs); brain/EVADE_SEAT_REGISTRATION_DRAFT.md is the draft this registration was made from, with Keith's answers (2026-11-22: "Screen first",
// ten circuit arms, DNp04 for LC4, "Rounds on a hitting course"). The circuits: brain/maleCnsCircuits-selfcheck.mjs sections 8-12 and vendor/male-cns/PROVENANCE.md.
//
//   node tools/ship/takeEvadeSeat.mjs --stage 1 [--workers n]      the action screen; then --stage 2 (the circuits); then --stage 3 (the controls, if stage 2 asks for any)
//
// THE REFLEX (brain/evadeReflex.mjs; HAND-SET, NOT THE FLY'S): the THREAT is the enemy round whose straight path, relative to the hull, passes within the hull's radius (6 m) of its
//   centre soonest, under 2 s; with none the ship flies as its helm says. While there is one, after today's best-ship helm (the split helm with the cannon, the sine twin), ONE
//   action: `turn` (a yaw torque AWAY from where the round comes from, tanh(2 S) of half the torque limit), `burst` (the thrust up toward all the pods give), `climb` (a pitch
//   torque away from the round's elevation: down from above, up from level or below), `jink` (full yaw swings, the first away, swapped every 0.5 s). S is the sine of the round's
//   bearing, or a circuit's read-out: brain/flyTracking.mjs pathwayOf over LC6 (onto DNp103), LC16 (pIP1), LC4 (DNp04) or LPLC2 (DNp01, the Giant Fiber), the descending
//   neurons' right less left, odd in the bearing, over its own peak, its sense set (pinned) so a round from a quarter turn left turns the hull right; for `burst` and `climb`
//   the circuit's even read-out (the two together, less rest, over its peak) scales the action instead.
// THE FIGHTS: side X flies today's best ship (the helm above and the fly-wired gunner, brain/seatFlyWired11Weights*.json, as tools/ship/takeLc11Gunner.mjs's `lc10` arm) with the
//   arm's reflex; side Y is plain. The cannon on both sides. ONE SHIP A SIDE (the gunner with no hand window) and FLEETS OF THREE A SIDE (the 45-degree window). 300 pairs a
//   fight, 75 of each of the duel's four kinds. NONE OF THESE SEEDS HAS BEEN FLOWN BY ANYTHING.
//
// STAGE 1, THE ACTION SCREEN (seeds 1681001- one ship a side, 1691001- fleets of three): arms `none` (no reflex), `turn`, `burst`, `climb`, `jink`, each with the sine read-out.
//   THE ACTION IS CHOSEN BY THIS RULE: the action whose arm LEADS `none` (z >= 2, pair by pair) in at least one fight and TRAILS it (z <= -2) in none; if several, the larger
//   mean lead over the two fights; IF NONE DOES, STAGE 2 FLIES `turn`, and says so.
// STAGE 2, THE CIRCUITS (seeds 1701001- and 1711001-; NOT 1661001-/1671001-, which the draft named and tools/ship/takeFleetHandSizes.mjs had flown -- caught
//   while registering), on stage 1's action: `none`, `sine`, and `lc6:medial`, `lc6:lateral`, `lc16:medial`, `lc16:lateral`, `lc4:medial`,
//   `lc4:lateral`, `lplc2:medial`, `lplc2:lateral` (which end of each sheet is the front of the visual field is not in the data, so both).
//   AN EVADE REFLEX SHIPS if some circuit-and-orientation LEADS `none` in at least one fight and TRAILS it in none; if several, the larger mean lead. The best-ship and fleet
//   buttons then fly it. OTHERWISE NOTHING SHIPS, and the reading goes in the fly-wired helm's note. For the record, no page change: THE DARK-LOOMING CELLS AGAINST THE
//   GIANT FIBER'S INPUTS -- the better of LC6 and LC16 (by mean lead over `none`) less the better of LC4 and LPLC2, pair by pair, in each fight -- and whether the shipped
//   circuit (or, if none shipped, the best) can be told from `sine`.
// STAGE 3, THE CONTROLS (stage 2's seeds), only for a circuit that shipped: `<type>:flat` (no places) and `<type>:shuffled:4242` (connections shuffled within each type). Its
//   PLACES are credited if it leads `flat` somewhere and trails it nowhere; its WIRING, the same against the shuffle. If nothing shipped, stage 3 flies nothing and says so.
//
// REGISTERED 2026-11-22, BEFORE ANY PAIR OF ANY STAGE WAS FLOWN. What the reflex does in a fight was looked at only in fights with NO reflex (how often rounds and ships close),
//   and that is what moved the threat from closing ships to rounds -- recorded in the draft.
// FORECAST, for the record: no action can be told from `none` in fleets of three; one ship a side, `burst` or `jink` may lead (a 6 m hull moves out of a round's path faster
//   than it turns); no circuit can be told from `sine`, and the dark-looming cells cannot be told from the Giant Fiber's inputs.
// Every arm's leads are kept (brain/rig-results/evadeSeat/); each stage's reading file (brain/evadeSeat.stage<n>.reading.json) is the mark that it was read; a second read is
// refused, and a stage is refused before the one it depends on was read.
// WHAT IS NOT HERE: rounds from fighters (there are none in these fights), the cannon's charge as a threat, any learned weight, any other descending neuron for LC4.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as EV from "../../brain/evadeReflex.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { brainsOf } from "./takeLc11Gunner.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING_DIR = BRAIN, KEPT_DIR = path.join(BRAIN, "rig-results", "evadeSeat");
export const readingFile = (stage, dir = READING_DIR) => path.join(dir, `evadeSeat.stage${stage}.reading.json`);
export const FIGHTS = Object.freeze(["one", "fleet3"]), SHIPS = Object.freeze({ one: 1, fleet3: 3 }), GUN_OF = Object.freeze({ one: "gunOne", fleet3: "gun" });
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ 1: { one: pairs(1681001, 75), fleet3: pairs(1691001, 75) }, 2: { one: pairs(1701001, 75), fleet3: pairs(1711001, 75) } });
export const STAGE1_ARMS = Object.freeze(["none", ...EV.ACTIONS]);
export const CIRCUITS = Object.freeze(["lc6:medial", "lc6:lateral", "lc16:medial", "lc16:lateral", "lc4:medial", "lc4:lateral", "lplc2:medial", "lplc2:lateral"]);
export const STAGE2_ARMS = Object.freeze(["none", "sine", ...CIRCUITS]);
export const DARK = Object.freeze(["lc6", "lc16"]), GIANT = Object.freeze(["lc4", "lplc2"]);
export const controlsOf = (circuit) => { const t = circuit.split(":")[0]; return [`${t}:flat`, `${t}:shuffled:4242`]; };

/** The evade spec of an arm: null for `none`; the stage-1 action with the sine; or the chosen action with the arm's wiring. */
export function evadeOf(stage, arm, action = null) {
    if (arm === "none") return null;
    if (stage === 1) { if (!EV.ACTIONS.includes(arm)) throw new Error(`takeEvadeSeat: no stage-1 arm ${arm}`); return { action: arm, wiring: "sine" }; }
    if (!EV.ACTIONS.includes(action)) throw new Error(`takeEvadeSeat: stage ${stage} needs stage 1's action (got ${action})`);
    const why = EV.checkWiring(arm); if (why) throw new Error(`takeEvadeSeat: ${why}`);
    return { action, wiring: arm };
}
/** The jobs of one fight and arm: side X today's best ship with the arm's reflex, side Y plain; stage 3 flies stage 2's seeds. */
export function jobsOf(stage, fight, arm, b, action = null) {
    const list = SETS[stage === 3 ? 2 : stage][fight], g = b[GUN_OF[fight]], network = { ...g, weights: g.weights.slice() }, evade = evadeOf(stage, arm, action);
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: true, network, helmNet: b.helm, ...(evade ? { evade } : {}) }, y: { id: "plain", cannon: true }, kind, seed, opts: { ships: SHIPS[fight] } }));
}
const less = (a, b) => TA.stat(a.map((v, i) => v - b[i]));
const credited = (zs) => zs.some((z) => z >= 2) && zs.every((z) => z > -2);
/** Every arm against the plain side, and each arm less `base`, in one fight. Pure. */
export function fightReadings(a, base = "none") {
    const r = Object.fromEntries(Object.keys(a).map((arm) => [arm, TA.stat(a[arm])]));
    for (const arm of Object.keys(a)) if (arm !== base && a[base]) r[`${arm} less ${base}`] = less(a[arm], a[base]);
    return r;
}
/** STAGE 1's rule. Pure. */
export function decideAction(out) {
    const z = (x) => FIGHTS.map((f) => out[f][`${x} less none`].z), mean = (x) => FIGHTS.reduce((s, f) => s + out[f][`${x} less none`].mean, 0) / FIGHTS.length;
    const beats = EV.ACTIONS.filter((x) => credited(z(x))), action = beats.length ? beats.slice().sort((p, q) => mean(q) - mean(p))[0] : "turn";
    return { action, chosen: beats.length > 0, beats, reasons: [beats.length ? `THE ACTION IS ${action.toUpperCase()}: it leads no reflex in a fight and trails it in none${beats.length > 1 ? ` (of ${beats.join(", ")}, the larger mean lead)` : ""}` : "NO ACTION BEATS NO REFLEX: stage 2 flies TURN, as registered"] };
}
/** STAGE 2's rule and its record. Pure. */
export function decideCircuits(out) {
    const z = (x, k = "none") => FIGHTS.map((f) => out[f].reading[`${x} less ${k}`].z), mean = (x) => FIGHTS.reduce((s, f) => s + out[f].reading[`${x} less none`].mean, 0) / FIGHTS.length;
    const bestOf = (list) => list.slice().sort((p, q) => mean(q) - mean(p))[0], beats = CIRCUITS.filter((c) => credited(z(c))), winner = beats.length ? bestOf(beats) : null, judged = winner || bestOf(CIRCUITS);
    const dark = bestOf(CIRCUITS.filter((c) => DARK.includes(c.split(":")[0]))), giant = bestOf(CIRCUITS.filter((c) => GIANT.includes(c.split(":")[0])));
    const darkLessGiant = Object.fromEntries(FIGHTS.map((f) => [f, less(out[f].arms[dark], out[f].arms[giant])])), lessSine = Object.fromEntries(FIGHTS.map((f) => [f, less(out[f].arms[judged], out[f].arms.sine)])), told = FIGHTS.some((f) => Math.abs(lessSine[f].z) >= 2);
    return { ships: winner !== null, winner, judged, dark, giant, darkLessGiant, lessSine, toldFromSine: told,
        reasons: [winner ? `AN EVADE REFLEX SHIPS: ${winner} leads no reflex in a fight and trails it in none -- the best-ship and fleet buttons fly it` : "NO CIRCUIT BEATS NO REFLEX: NOTHING SHIPS",
            `the dark-looming cells (${dark}) less the Giant Fiber's inputs (${giant}): ${FIGHTS.map((f) => `${f} ${darkLessGiant[f].mean >= 0 ? "+" : ""}${darkLessGiant[f].mean.toFixed(3)} (z ${darkLessGiant[f].z.toFixed(2)})`).join(", ")}`,
            `${judged} ${told ? "CAN" : "cannot"} be told from the sine`] };
}
/** STAGE 3's record. Pure. */
export function decideControls(out, circuit) {
    const [flat, shuf] = controlsOf(circuit), z = (k) => FIGHTS.map((f) => less(out[f].arms[circuit], out[f].arms[k]).z);
    const places = credited(z(flat)), wiring = credited(z(shuf));
    return { places, wiring, reasons: [`${circuit}'s PLACES ${places ? "ARE" : "are NOT"} credited (against ${flat}); its WIRING ${wiring ? "IS" : "is NOT"} credited (against ${shuf})`] };
}
const readJSON = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
/** Which arms a stage flies, and on what action -- refusing a stage before the one it depends on was read. */
export function planOf(stage, dir = READING_DIR) {
    if (fs.existsSync(readingFile(stage, dir))) throw new Error(`takeEvadeSeat: ${readingFile(stage, dir)} is already there -- STAGE ${stage} HAS BEEN READ ONCE and is not read again`);
    if (stage === 1) return { arms: STAGE1_ARMS, action: null };
    if (!fs.existsSync(readingFile(stage - 1, dir))) throw new Error(`takeEvadeSeat: stage ${stage} waits for stage ${stage - 1}'s reading (${readingFile(stage - 1, dir)})`);
    const one = readJSON(readingFile(1, dir)), action = one.verdict.action;
    if (stage === 2) return { arms: STAGE2_ARMS, action };
    const two = readJSON(readingFile(2, dir));
    return { arms: two.verdict.ships ? [two.verdict.winner, ...controlsOf(two.verdict.winner)] : [], action, circuit: two.verdict.winner };
}
/** A stage. `fly(fight, arm)` -> Promise of leads. */
export async function study(stage, plan, fly, log = () => {}) {
    const out = {};
    if (!plan.arms.length) { log("stage 3: nothing shipped in stage 2, so no control is flown"); return { stage, verdict: { flown: false, reasons: ["nothing shipped in stage 2: no control flown"] } }; }
    for (const f of FIGHTS) {
        const a = {}; for (const arm of plan.arms) a[arm] = await fly(f, arm);
        out[f] = { arms: a, reading: fightReadings(a, stage === 3 ? plan.circuit : "none") };
        log(`STAGE ${stage}, ${f === "one" ? "ONE SHIP A SIDE" : "FLEETS OF THREE"}${plan.action ? `, the ${plan.action}` : ""}, ${a[plan.arms[0]].length} pairs:`);
        for (const [k, s] of Object.entries(out[f].reading)) log(`     ${k}: mean ${s.mean >= 0 ? "+" : ""}${s.mean.toFixed(3)}, z ${s.z.toFixed(2)} ${TA.word(s.z)}`);
    }
    const flat = Object.fromEntries(FIGHTS.map((f) => [f, out[f].reading]));
    const verdict = stage === 1 ? decideAction(flat) : stage === 2 ? decideCircuits(out) : decideControls(out, plan.circuit);
    log(`WHAT IS DECIDED: ${verdict.reasons.join("; ")}`);
    return { stage, action: plan.action, readings: Object.fromEntries(FIGHTS.map((f) => [f, out[f].reading])), verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["stage", "workers", "dir", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeEvadeSeat: unknown option ${bad.join(", ")}`); process.exit(2); }
    const stage = Number(arg("stage")); if (![1, 2, 3].includes(stage)) { console.error("takeEvadeSeat: --stage 1, 2 or 3"); process.exit(2); }
    const dir = arg("dir", READING_DIR), kept = arg("kept", KEPT_DIR);
    let plan; try { plan = planOf(stage, dir); } catch (e) { console.error(e.message); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `stage${stage}_${plan.action || "screen"}_${fight}_${arm.replace(/:/g, "-")}.json`); if (fs.existsSync(f)) return readJSON(f).leads; const leads = await pool.leads(jobsOf(stage, fight, arm, b, plan.action)); fs.writeFileSync(f, JSON.stringify({ stage, fight, arm, action: plan.action, leads }) + "\n"); return leads; };
    const result = await study(stage, plan, fly, (m) => console.log(m));
    fs.writeFileSync(readingFile(stage, dir), JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile(stage, dir)}`);
    await pool.close(); process.exit(0);
}
