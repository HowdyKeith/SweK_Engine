// WebGLEngine/tools/ship/takeFlyWiredHelmOneAxis.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A HELM THAT TURNS ABOUT ONE AXIS WITH A CANNON. tools/ship/takeFlyWiredHelmAxes.mjs searched the cannon-aware helm's two gains with a cannon apart: the SECOND axis at 0 loses (0.78-0.93 on train), the FIRST at 0 costs little (0,-1 1.534 to 0,-4
// 1.676, against the shipped -2,-2 at 1.746). The best candidate with the first gain at 0 is (0, -4). Keith: "and 5" (a one-gain helm, the simpler helm).
//
//   node tools/ship/takeFlyWiredHelmOneAxis.mjs [--workers n]
//
//   THE CANDIDATE: (0, -4) with a cannon -- fixed now from takeFlyWiredHelmAxes's train scores, not searched again -- and the page's -0.25, -0.25 without one; against the page's helm (-2, -2 with a cannon).
//   THE FIGHTS: THE CANNON ON both sides, the by-size hand's gunner aboard (the no-window fly-wired gunner one a side, the 45-degree one in fleets), the plain ship opposite: ONE SHIP A SIDE (seeds 1271001-) and FLEETS OF THREE (1281001-), 300 pairs
//   each, 75 of each kind. None flown by anything before.
//
// REGISTERED 2026-11-21, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight: each helm against the plain ship; THE ONE-AXIS HELM LESS THE PAGE'S, pair by pair.
// FORECAST, for the record: it trails by about 0.07 (the train scores' gap), which can be told in one fight at least.
// WHAT IS DECIDED: the simpler helm is SAID TO DO AS WELL only if it TRAILS in neither fight; it REPLACES the page's only if it also LEADS in one. Nothing is written but the reading: if it replaces, a file is written by hand from the reading and the
//   page loads it; if it only does as well, the fly-wired helm's note says the first gain hardly matters; otherwise the note says the first axis is worth what the reading says.
// Every arm's leads are kept (brain/rig-results/flyWiredHelmOneAxis/); the reading file (brain/flyWiredHelmOneAxis.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: no cannon, escorts, fighters, the second axis alone at 0, other one-axis gains.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as FS from "../../brain/flySteering.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "flyWiredHelmOneAxis.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredHelmOneAxis");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsNoCannon.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), flyOne: path.join(BRAIN, "seatFlyWired11WeightsOne.json") });
export const CANDIDATE = Object.freeze([0, -4]), FIGHTS = Object.freeze(["one", "fleet"]), ARMS = Object.freeze(["oneAxis", "page"]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ one: pairs(1271001, 75), fleet: pairs(1281001, 75) });
/** The helm's four weights: the page's, or the candidate's two with a cannon and the page's two without. Pure. */
export const weightsOf = (arm, page) => (arm === "page" ? [...page] : [CANDIDATE[0], CANDIDATE[1], page[2], page[3]]);
/** The shipped files, each checked by its policy. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeFlyWiredHelmOneAxis: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways), flyOne: one(FILES.flyOne, FT.POLICY_ID11, FT.nearAlways) };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: true, network: fight === "one" ? b.flyOne : b.fly, helmNet: { policy: FS.POLICY_ID3, weights: weightsOf(arm, b.helm.weights) } }, y: { id: "plain", cannon: true }, kind, seed, opts: { ships: fight === "one" ? 1 : 3 } }));
}
/** One fight's readings. Pure. */
export function fightReadings(a) {
    const r = { oneAxis: TA.stat(a.oneAxis), page: TA.stat(a.page), gain: TA.stat(a.oneAxis.map((v, i) => v - a.page[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** What is decided: AS WELL if it trails in neither fight; REPLACES if it also leads in one. Pure. */
export function decide(out) {
    const z = (f) => out[f].reading.gain.z, asWell = !FIGHTS.some((f) => z(f) <= -2), replaces = asWell && FIGHTS.some((f) => z(f) >= 2);
    return { ok: replaces, asWell, replaces, reasons: [FIGHTS.map((f) => `${f} ${TA.word(z(f))}`).join(", ")] };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {};
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${f === "one" ? "ONE SHIP A SIDE" : "FLEETS OF 3 A SIDE"}, THE CANNON ON, ${a.page.length} pairs, against the plain ship:`); log(`     the one-axis helm (${CANDIDATE.join(", ")}): ${TA.line(R.oneAxis)}`); log(`     the page's helm (-2, -2): ${TA.line(R.page)}`); log(`  THE ONE-AXIS HELM LESS THE PAGE'S: ${TA.line(R.gain)}`);
    }
    const verdict = decide(out); log(verdict.replaces ? "IT REPLACES THE PAGE'S HELM." : verdict.asWell ? "IT DOES AS WELL: the first gain hardly matters." : "IT DOES NOT DO AS WELL: " + verdict.reasons.join("; "));
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredHelmOneAxis: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredHelmOneAxis: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
