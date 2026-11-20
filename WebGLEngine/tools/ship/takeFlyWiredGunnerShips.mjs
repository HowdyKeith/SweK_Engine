// WebGLEngine/tools/ship/takeFlyWiredGunnerShips.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY-WIRED GUNNER WITH A SIGHT THAT STICKS TO SHIPS ONLY. tools/ship/takeFlyWiredGunnerFix.mjs read a sticky sight (keep the target while it can be shot) helping the fly-wired gunner in fleets (+0.660 without the cannon, +0.274 with) and costing it a little against fighters (-0.029, z -2.9), so it did not ship.
// brain/flyTracking.mjs's `stickyShips` (policy seatFlyWired3) sticks to a capital ship and re-picks among fighters every tick, as the plain sight does (brain/seatTurretGunner.mjs's SHIPS_ONLY: an aim radius over 3). Keith: "run the next step".
// WHAT IS KNOWN BEFORE ANY FLIGHT (brain/flyTracking-selfcheck.mjs, to the bit): against fighters alone it IS the shipped gunner; in a fleet with no fighters it IS the sticky gunner. So the question here is the fight with BOTH: fleets with escort fighters.
//
//   node tools/ship/takeFlyWiredGunnerShips.mjs [--workers n] [--write]
//
//   THE FIGHTS: fleets of THREE ships a side with no cannon and with the cannon (no escorts); fleets of three a side WITH SIX ESCORT FIGHTERS A SIDE, no cannon (battleshipDuel's escorts: the PD autopilot); one ship against eight fighters (battleshipFight, as tools/ship/pairPool.mjs's fighterLead). Side X's seats have the gunner,
//   its helm the bow-on rule; side Y is plain. 300 pairs or attacks a fight, seeds 161001- (fleets), 171001- (fleets with escorts), 181001- (fighters), 75 of each kind. THE ARMS: the shipped gunner and the gunner that sticks to ships, on the same pairs.
//
// REGISTERED 2026-11-17, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: the ships-sticky gunner against the plain side; the shipped against the plain side; THE SHIPS-STICKY LESS THE SHIPPED, pair by pair.
// FORECAST, for the record: in the fleets without escorts the gain is what the sticky gunner's was (it is the same gunner there): LEADS by about 0.6 without the cannon and 0.3 with; against fighters EXACTLY 0 (the same gunner); in fleets with escorts LEADS, by less (about 0.3).
// WHAT SHIPS: brain/seatFlyWired3WeightsDefault.json (policy seatFlyWired3, the gains -3) if the gain LEADS in both fleets without escorts and TRAILS in no fight. It would replace the shipped gunner on space-duel.html.
// READ 2026-11-17 (brain/seatFlyWired3WeightsDefault.reading.json): the gain +0.706 (z 9.4) with no cannon, +0.269 (z 5.2) with it, +0.932 (z 13.8) with escorts, exactly 0 against fighters. IT SHIPS: brain/seatFlyWired3WeightsDefault.json, the `flywired` hand on space-duel.html.
//   Against the plain side it is then level in fleets without the cannon (+0.066) and with escorts (+0.105), and still behind with the cannon (-0.283) and against fighters (-0.148). The forecast was under for the escort fleet: the gain there is the largest.
// WHY IT STILL TRAILS IN FLEETS WITH THE CANNON (2026-11-18; Keith: "lets do both"). NOT REGISTERED: diagnostics on scratch pairs (seeds 131001-131012 of each kind, fleets of three, the cannon on both sides), the ships-sticky gunner against the hand gunner on side X. FOUND: with the cannon the fly-wired side's guns fire
//   about 5% fewer rounds and deal about 6% less damage (paired over 96 fights: -98 of 1,640 a fight, z -2.9); the enemy then keeps more turrets and ships, so the fly side also takes more gun damage (+59, z 2.2) and more cannon shots (+0.24 a fight, z 2.4), and the gap compounds -- without the cannon its rounds and damage
//   are the hand gunner's to within 1%. EXCLUDED, each by a measurement: TRACKING ERROR (the laid gun is off the sight's solution by a median 3.1 degrees, 2.6 when firing, the same with the cannon and without); A LATE OPENING (the hand gunner's laying until each seat's first aimed shot, then the circuit, made it worse: -0.40
//   against -0.21 on 48 pairs); RE-ACQUIRING after a kill or a target change (no slower with the cannon); HITS WASTED on dead parts (every hit counts its whole damage, brain/spaceArena.mjs); THE GEOMETRY (the arena moves a ship the same way with a cannon or without; an earlier `first shot sooner with the cannon`
//   was a survivor effect: cannon fights end sooner). NOT FOUND: what starts the 5%. One ship a side the gunner's lead also shrinks with the cannon (+0.141 against +0.79 without, tools/ship/takeFlyWiredNext.mjs's together study).
// THE CANNON ON ONE SIDE ONLY (2026-11-18; Keith's item 2). NOT REGISTERED: scratch pairs 132001-132060 of each kind (240), fleets of three, the ships-sticky gunner less the hand gunner on side X, paired: the cannon on BOTH sides -0.266 (z -4.6, as above);
//   on X's side ONLY -0.063 (z -2.5); on the enemy's ONLY +0.097 (z 2.7); on neither +0.086 (z 1.6). So the cost goes with the FLY SIDE CARRYING A CANNON, and the enemy's cannon alone does not cause it (there the fly side is if anything ahead).
//   WHERE IN THE FIGHT, AND WHAT IT IS NOT (2026-11-19, scratch, seeds 134001-134012 of each kind with only X's cannon against none; and 132001-132030): split by the enemy's ships left, the fly-wired side's gun damage is the hand gunner's x1.08 with three left and x1.08 with
//   one, but x0.84 (rounds x0.77) in the stretch with TWO left -- the stretch after its own cannon's first kill; without the cannon the same stretch is x1.04. NOT THE HULL TURNING (the fly gun is worse while the hull turns, x0.70-0.74, but as much without the
//   cannon, and the hull turns about 5% of the time either way); NOT THE TARGET CHOICE (the hand's own laying behind the same ships-sticky sight is level with the plain hand gunner: +0.016, se 0.053, with the cannon; +0.040 without); NOT A SLOW LONG SWING
//   (the circuit slews at 89-99% of full from 20 to 150 degrees off; it is soft only close in, 27% at 5 degrees). So it is in the circuit's LAYING, in the stretch after a wave kill; what about that stretch is still not found. The cannon touches nothing but its beam (brain/spaceArena.mjs).
//   WHAT THE GUN DOES THERE (2026-11-20, scratch, seatFlyWired8 against the hand gunner, the cannon on both sides, seeds 134001-134012 of each kind): the fly gun is NEARER the target's true bearing than the hand's (median 2.5 against 2.6 degrees,
//   and far fewer seats wildly off) but fires less (52% of its seat-ticks against 61% with two enemy ships left; 46% against 66% in the two seconds after a kill). The trigger fires within about 5 degrees of the sight's LEAD solution; when not firing the
//   fly gun sits a median 3-5 degrees off it -- just outside the window -- where the hand's is far off, swinging (19-55). The circuit's command is soft close in (10% of the slew at 2 degrees); a stiffer gain overshot and lost. The fix tried: the hand
//   laying the last degrees (brain/flyTracking.mjs's holdNear, seatFlyWired9), registered in tools/ship/takeFlyWiredGunnerNear.mjs.
//   CAVEAT: a one-sided cannon fight is near decided (leads about +-2.1), which squeezes any gunner's difference, so the one-sided numbers are not to be added up against the both-sides one. Still not found: what about a side's own cannon makes its rate-laid guns fire less.
// Every arm's leads are kept (brain/rig-results/flyWiredGunnerShips/); the reading file is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: the trained 6DOF fighter pilot, escorts with the cannon on, a sight that remembers the other targets while it sticks, a radius rule told by anything but the aim radius the arena shows.
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
export const DEFAULT_OUT = path.join(BRAIN, "seatFlyWired3WeightsDefault.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredGunnerShips");
export const REGIMES = Object.freeze(["fleetNoCannon", "fleetCannon", "fleetEscorts", "fighters"]), ARMS = Object.freeze(["shipped", "ships"]), FLEET_SHIPS = 3, ESCORTS = 6, GAINS = Object.freeze([-3, -3]);
export const POLICY = Object.freeze({ shipped: FT.POLICY_ID, ships: FT.POLICY_ID3 });
const pairs = (kinds, first, n) => Object.freeze(kinds.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
const FLEET = pairs(D.KINDS, 161001, 75);   // the two fleets without escorts fly the same pairs
export const SETS = Object.freeze({ fleetNoCannon: FLEET, fleetCannon: FLEET, fleetEscorts: pairs(D.KINDS, 171001, 75), fighters: pairs(BF.KINDS, 181001, 75) });
/** The jobs of one fight and arm. */
export function jobsOf(regime, arm, list = SETS[regime]) {
    const network = { policy: POLICY[arm], weights: GAINS.slice() };
    if (regime === "fighters") return list.map(({ kind, seed }) => ({ vsFighters: { network, helm: null, seed, kind, opts: {} } }));
    const cannon = regime === "fleetCannon", opts = regime === "fleetEscorts" ? { ships: FLEET_SHIPS, escorts: ESCORTS } : { ships: FLEET_SHIPS };
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon, network }, y: { id: "plain", cannon }, kind, seed, opts }));
}
/** One fight's readings from its two arms' leads. Pure. */
export function fightReadings(a) {
    const r = { ships: TA.stat(a.ships), shipped: TA.stat(a.shipped), gain: TA.stat(a.ships.map((v, i) => v - a.shipped[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** Does it ship? The gain LEADS in both fleets without escorts and TRAILS in no fight. Pure. */
export function qualifies(out) {
    const reasons = [];
    for (const g of ["fleetNoCannon", "fleetCannon"]) if (!(out[g].reading.gain.z >= 2)) reasons.push(`in ${g} the gain reads ${TA.word(out[g].reading.gain.z)} (z ${out[g].reading.gain.z.toFixed(2)})`);
    for (const g of REGIMES) if (out[g].reading.gain.z <= -2) reasons.push(`in ${g} the gain TRAILS`);
    return { ok: reasons.length === 0, reasons };
}
/** The study. `fly(regime, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { fleetNoCannon: "FLEETS OF 3 A SIDE, NO CANNON", fleetCannon: "FLEETS OF 3 A SIDE, THE CANNON ON", fleetEscorts: `FLEETS OF 3 A SIDE WITH ${ESCORTS} ESCORT FIGHTERS A SIDE, NO CANNON`, fighters: "ONE SHIP AGAINST EIGHT FIGHTERS" };
    for (const g of REGIMES) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(g, arm); out[g] = fightReadings(a); const R = out[g].reading;
        log(`${title[g]}, ${a.ships.length} ${g === "fighters" ? "attacks" : "pairs"}, each against the plain side:`); log(`     the shipped gunner: ${TA.line(R.shipped)}`); log(`     the gunner that sticks to ships: ${TA.line(R.ships)}`); log(`  THE SHIPS-STICKY LESS THE SHIPPED: ${TA.line(R.gain)}`);
    }
    const verdict = qualifies(out); log(verdict.ok ? "QUALIFIES: the gunner that sticks to ships ships." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { ...out, verdict };
}
/** The file written when it qualifies. */
export function blobOf(result) {
    const R = (g) => result[g].reading, part = (g, what) => `${what}: it ${TA.line(R(g).ships)}, the shipped one ${TA.line(R(g).shipped)}, the gain ${TA.line(R(g).gain)}`;
    const by = `tools/ship/takeFlyWiredGunnerShips.mjs: brain/flyTracking.mjs's fly-wired gunner (NOTHING INSIDE THE CIRCUIT IS LEARNED; the gains -3) behind a sight that STICKS TO CAPITAL SHIPS ONLY (brain/seatTurretGunner.mjs's SHIPS_ONLY: an aim radius over 3) and re-picks among fighters every tick; one ship a side and against fighters alone it is the shipped gunner to the bit. Read once, each against the plain side: ` +
        [part("fleetNoCannon", "FLEETS OF THREE, NO CANNON"), part("fleetCannon", "FLEETS OF THREE, THE CANNON ON"), part("fleetEscorts", `FLEETS OF THREE WITH ${ESCORTS} ESCORTS A SIDE, NO CANNON`), part("fighters", "ONE SHIP AGAINST EIGHT FIGHTERS")].join("; ") + "; regular gunners, PD fighters and escorts";
    return PB.exportBrain(PB.describePolicy(FT.POLICY_ID3, FT.stickyShips), Float32Array.from(GAINS), { score: Number(R("fleetNoCannon").ships.mean.toFixed(3)), by, citation: "male-cns visual target-tracking pathway, LC10a/AOTU019/AOTU025/DNa02, with the LC10a cells' dendrite positions (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredGunnerShips: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredGunnerShips: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (regime, arm) => { const f = path.join(kept, `${regime}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(regime, arm)); fs.writeFileSync(f, JSON.stringify({ regime, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
