// WebGLEngine/tools/ship/takeFleetHandSizes.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLEET BUTTON'S GUNNER IN FLEETS OF TWO AND FOUR. tools/ship/takeSplitHelmSizes.mjs settled the fleet button's HELM at two and four a side (the split kept); its
// HAND -- the 45-degree fly-wired gunner (brain/seatFlyWired11WeightsDefault.json, the by-size hand's `fleet` pick too) -- was chosen in fleets of three only. Keith:
// "1" -- does it hold at two and four?
//
//   node tools/ship/takeFleetHandSizes.mjs [--workers n]
//
//   THE FIGHTS: fleets of TWO and of FOUR a side, the cannon on both sides, 600 pairs each (150 of each of the duel's kinds), seeds 1661001- and 1671001-. None flown by
//   anything before. Side X carries today's fleet button but for the gunner: the split helm (with the cannon the sine twin, takeFlyVsSine's sine arm); side Y plain.
//   THE ARMS: `fly` (the button's gunner), `today` (car-today, the by-size hand's pick one ship a side with escorts or no cannon), `sine` (the button's gunner file read over
//   a sine: a control).
//
// REGISTERED 2026-11-22, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain ship; pair by pair,
//   THE FLY-WIRED GUNNER LESS CAR-TODAY, and the fly-wired gunner less its sine twin.
// FORECAST, for the record: the fly-wired gunner leads car-today at both sizes (it was chosen over it in fleets), and cannot be told from its sine twin (as in fleets of three).
// WHAT IS DECIDED: the fleet button and the by-size hand keep the fly-wired gunner in fleets UNLESS CAR-TODAY LEADS IT (the fly less car-today at z <= -2) at either size and
//   trails it at neither (z >= 2); then both take car-today in fleets (the by-size hand's `fleet` pick becomes car-today and the fleet button carries the by-size hand). The
//   sine twin is a control: read, said, never a change.
// @@READ@@
// Every arm's leads are kept (brain/rig-results/fleetHandSizes/); the reading file (brain/fleetHandSizes.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: escorts, fighters, one ship a side and fleets of three (read already), other helms, no cannon.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import * as FV from "./takeFlyVsSine.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "fleetHandSizes.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "fleetHandSizes");
export const FIGHTS = Object.freeze(["fleet2", "fleet4"]), ARMS = Object.freeze(["fly", "today", "sine"]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ fleet2: pairs(1661001, 150), fleet4: pairs(1671001, 150) });
export const SHIPS = Object.freeze({ fleet2: 2, fleet4: 4 });
export const brainsOf = FV.brainsOf;
/** The gunner of an arm: the button's file, car-today, or the button's file over a sine. */
export const gunnerOf = (arm, b) => (arm === "fly" ? b.gun : arm === "today" ? b.today : arm === "sine" ? { ...b.gun, wiring: "sine" } : null);
/** The jobs of one fight and arm: takeFlyVsSine's fleet jobs under the split helm (its sine arm) at this fleet size, the arm's gunner on side X. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const g = gunnerOf(arm, b); if (!g) throw new Error(`takeFleetHandSizes: no arm ${arm}`);
    return FV.jobsOf("fleetCannon", "sine", b, list).map((j) => ({ ...j, x: { ...j.x, network: g }, opts: { ...j.opts, ships: SHIPS[fight] } }));
}
const less = (a, b) => TA.stat(a.map((v, i) => v - b[i]));
/** One fight's readings: each arm, the fly less car-today, the fly less its sine twin. Pure. */
export function fightReadings(a) {
    const r = { fly: TA.stat(a.fly), today: TA.stat(a.today), sine: TA.stat(a.sine), overToday: less(a.fly, a.today), overSine: less(a.fly, a.sine) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** What is decided (see the header). Pure. */
export function decide(out) {
    const z = FIGHTS.map((f) => out[f].reading.overToday.z), todayLeads = z.some((v) => v <= -2) && z.every((v) => v < 2);
    return { ok: true, change: todayLeads, fleetHand: todayLeads ? "car-today" : "flywired", todayLeadsIn: FIGHTS.filter((f, i) => z[i] <= -2), reasons: [todayLeads ? `car-today LEADS the fly-wired gunner in ${FIGHTS.filter((f, i) => z[i] <= -2).join(", ")} and trails it nowhere: both the fleet button and the by-size hand take car-today in fleets` : "car-today does not lead the fly-wired gunner at either size without trailing it at the other: the fleet hand stays"] };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {};
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`FLEETS OF ${SHIPS[f]} A SIDE, THE CANNON ON, the split helm, ${a.fly.length} pairs, against the plain ship:`);
        log(`     the fly-wired gunner: ${TA.line(R.fly)}`); log(`     car-today: ${TA.line(R.today)}`); log(`     the fly-wired gunner over a sine: ${TA.line(R.sine)}`);
        log(`  THE FLY-WIRED GUNNER LESS CAR-TODAY: ${TA.line(R.overToday)}`); log(`     the fly-wired gunner less its sine twin: ${TA.line(R.overSine)}`);
    }
    const verdict = decide(out); log(`WHAT IS DECIDED: ${verdict.reasons.join("; ")}`);
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFleetHandSizes: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFleetHandSizes: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
