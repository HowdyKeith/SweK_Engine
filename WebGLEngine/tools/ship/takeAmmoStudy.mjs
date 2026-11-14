// WebGLEngine/tools/ship/takeAmmoStudy.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// AT WHAT RATION DOES HOLDING THE TRIGGER STOP PAYING? The big search's champion (brain/seatTurretGunnerWeightsBig.json) learned one thing: fire whenever there is a target. It is right because, with the ship's whole magazines, no gun runs dry in a fight. brain/battleshipDuel.mjs now has `ammo`, a fraction of the
// magazines both sides carry. Keith: "lets do 3 then 1" (1: make firing cost something). Before anything is trained in a rationed arena, this asks what the ration does to the gunners there are. WRITTEN BEFORE ANY PAIR WAS FLOWN (2026-11-14).
//
//   THE PAIRS    120 fresh battleshipDuel pairs, seeds 11001-11030 of each kind, flown at each of five rations: 1 (the whole magazines), 0.5, 0.25, 0.125, 0.0625 (10 rounds a main gun, 56 a mount).
//   THE ARMS     three gunners, each in all thirteen seats against the HAND GUNNER (who fires when the sight says the gun is on) at the same ration, regular sights, the bow-on rule, the cannon (which is not rationed):
//                `start`     the car's untrained hand weights (fires when the sight says to)
//                `champion`  the big search's (the same, but ALWAYS fires)
//                `eager`     the hand gunner made to always fire (its `tolerance` out of reach) -- no network
//   THE READINGS at each ration, mean, standard error, z and the word at z 2:
//                A1  WHAT ALWAYS FIRING IS WORTH: champion less start, paired. THE REGISTERED QUESTION: the LARGEST ration at which this does not read LEADS is where holding the trigger stops paying; a ration at which it reads TRAILS is one where discipline pays.
//                A2  the same question without a network: `eager` against the hand gunner.
//                A3  the champion and the start, each against the hand gunner (what a rationed arena does to the leads already measured).
//   FORECAST, for the record: always firing still LEADS at 0.5, cannot be told at 0.25, TRAILS at 0.125 and 0.0625. Fifteen readings at z 2: one stray word among them would not surprise; the PATTERN across rations is what is read.
//   Nothing is chosen on this study: it decides only whether a rationed arena is worth training in, and at which ration.
//
// THE CONFIRMATION WITHOUT THE CANNON (registered 2026-11-14, AFTER the study above was read and BEFORE any pair of this was flown). The study's answer: holding the trigger LEADS at every ration flown (the forecast above was wrong). Read post hoc on the same pairs, from a scratch script whose flights were not kept:
// with NO CANNON on either side it turned over -- always firing worth +1.260 with the whole magazines, -0.318 at an eighth, -0.613 at a sixteenth. A turn-over found after the fact on the pairs that suggested it is a hint; this is its test:
//   THE PAIRS    120 more, seeds 12001-12030 of each kind (`--set confirm`), flown by nothing before. NO CANNON ON EITHER SIDE. Rations 1, 0.125 and 0.0625. The same three arms.
//   THE READINGS at each ration, always firing (champion less start, paired), at z 2. C1 at the whole magazines it LEADS; C2 at an eighth it TRAILS; C3 at a sixteenth it TRAILS. CONFIRMED means all three read as said; PARTLY, C1 and one of the others; NOT CONFIRMED otherwise.
//   WHAT HANGS ON IT: whether a round 3 is trained in that arena (no cannon, rationed). Nothing else is chosen on it.
//
//     node tools/ship/takeAmmoStudy.mjs run --out <dir>      # resumable: a jsonl an arm and ration
//     node tools/ship/takeAmmoStudy.mjs report --in <dir>
"use strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as TA from "./takeTurretAudit.mjs";
import * as T from "./trainTurretSeat.mjs";
import { createPool } from "./pairPool.mjs";

export const SEEDS = Object.freeze(Array.from({ length: 30 }, (_, i) => 11001 + i));
export const PAIRS = Object.freeze(SEEDS.flatMap((seed) => D.KINDS.map((kind) => Object.freeze({ kind, seed }))));
export const RATIONS = Object.freeze([1, 0.5, 0.25, 0.125, 0.0625]);
export const ARMS = Object.freeze(["start", "champion", "eager"]);
export const CONFIRM_SEEDS = Object.freeze(Array.from({ length: 30 }, (_, i) => 12001 + i)), CONFIRM_PAIRS = Object.freeze(CONFIRM_SEEDS.flatMap((seed) => D.KINDS.map((kind) => Object.freeze({ kind, seed })))), CONFIRM_RATIONS = Object.freeze([1, 0.125, 0.0625]);
export const EAGER = Object.freeze({ ...BF.GUNNERS.regular, tolerance: 1e9 });
/** The side of an arm (plain data for tools/ship/pairPool.mjs). `champion` is the weights of brain/seatTurretGunnerWeightsBig.json. */
export function sideOfArm(arm, champion) {
    if (arm === "start") return { id: "start", network: { policy: "gunnerPolicy", weights: Array.from(T.startWeights()) } };
    if (arm === "champion") return { id: "champion", network: { policy: "gunnerPolicy", weights: Array.from(champion) } };
    if (arm === "eager") return { id: "eager", gunners: EAGER };
    throw new Error(`takeAmmoStudy.sideOfArm: no arm "${arm}" (${ARMS.join(", ")})`);
}
export const jobsOf = (arm, ration, champion, list = PAIRS, cannon = true) => list.map(({ kind, seed }) => ({ x: cannon ? sideOfArm(arm, champion) : { ...sideOfArm(arm, champion), cannon: false }, y: cannon ? { id: "hand" } : { id: "hand", cannon: false }, kind, seed, opts: { ammo: ration } }));
export const fileOf = (arm, ration) => `${arm}-${ration}.jsonl`;
/** The readings from { "arm|ration": Map("kind|seed" -> lead) }: for each ration { firing (champion less start, paired), eager, champion, start }, each { n, mean, se, z }. */
export function readings(leads, rations = RATIONS) {
    const out = {};
    for (const r of rations) {
        const g = (a) => leads[`${a}|${r}`]; if (!g("start") || !g("champion") || !g("eager")) continue;
        out[r] = { firing: TA.stat([...g("champion")].map(([k, v]) => v - g("start").get(k))), eager: TA.stat([...g("eager").values()]), champion: TA.stat([...g("champion").values()]), start: TA.stat([...g("start").values()]) };
    }
    return out;
}
/** The confirmation's verdict from its readings: { c1, c2, c3 (each as registered or not), word }. */
export function confirmed(R) { const c1 = !!R[1] && R[1].firing.z >= 2, c2 = !!R[0.125] && R[0.125].firing.z <= -2, c3 = !!R[0.0625] && R[0.0625].firing.z <= -2; return { c1, c2, c3, word: c1 && c2 && c3 ? "CONFIRMED" : c1 && (c2 || c3) ? "PARTLY CONFIRMED" : "NOT CONFIRMED" }; }
/** The registered answer: the largest ration at which always firing does not read LEADS (null if it leads at every one), and the rations at which it reads TRAILS. */
export function answer(R) { const rs = RATIONS.filter((r) => R[r]); return { stopsPaying: rs.find((r) => !(R[r].firing.z >= 2)) ?? null, disciplinePays: rs.filter((r) => R[r].firing.z <= -2) }; }

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const [step, ...rest] = process.argv.slice(2), arg = (k) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : null; };
    if (step === "run") {
        const out = arg("out"); if (!out) { console.error("takeAmmoStudy: run needs --out <dir>"); process.exit(2); }
        fs.mkdirSync(out, { recursive: true });
        const champion = JSON.parse(fs.readFileSync(new URL("../../brain/seatTurretGunnerWeightsBig.json", import.meta.url), "utf8")).weights, pool = createPool(), confirm = arg("set") === "confirm", PAIRS_ = confirm ? CONFIRM_PAIRS : PAIRS;
        for (const ration of confirm ? CONFIRM_RATIONS : RATIONS) for (const arm of ARMS) {
            const file = path.join(out, fileOf(arm, ration)), done = new Set(fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l); return r.kind + "|" + r.seed; }) : []), todo = PAIRS_.filter((p) => !done.has(p.kind + "|" + p.seed));
            await pool.leads(jobsOf(arm, ration, champion, todo, !confirm), (i, lead) => fs.appendFileSync(file, JSON.stringify({ arm, ration, kind: todo[i].kind, seed: todo[i].seed, lead }) + "\n"));
            console.log(`${arm} at ${ration}${confirm ? ", no cannon" : ""}: ${PAIRS_.length} pairs`);
        }
        await pool.close();
    } else if (step === "report") {
        const dir = arg("in"), leads = {};
        for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".jsonl"))) for (const l of fs.readFileSync(path.join(dir, f), "utf8").trim().split("\n").filter(Boolean)) { const r = JSON.parse(l); (leads[`${r.arm}|${r.ration}`] ||= new Map()).set(r.kind + "|" + r.seed, r.lead); }
        if (arg("set") === "confirm") {
            const R = readings(leads, CONFIRM_RATIONS), V = confirmed(R);
            console.log(`[takeAmmoStudy] THE CONFIRMATION WITHOUT THE CANNON: ${CONFIRM_PAIRS.length} pairs (seeds ${CONFIRM_SEEDS[0]}-${CONFIRM_SEEDS[29]} of each kind), no cannon on either side`);
            for (const r of CONFIRM_RATIONS) console.log(`  ration ${r}: always firing (champion less start) ${TA.line(R[r].firing)} | champion ${TA.line(R[r].champion)} | start ${TA.line(R[r].start)} | the hand gunner made to always fire ${TA.line(R[r].eager)}`);
            console.log(`  ${V.word}: C1 leads at the whole magazines ${V.c1}, C2 trails at an eighth ${V.c2}, C3 trails at a sixteenth ${V.c3}`); process.exit(0);
        }
        const R = readings(leads), A = answer(R);
        console.log(`[takeAmmoStudy] ${PAIRS.length} pairs (seeds ${SEEDS[0]}-${SEEDS[29]} of each kind) at each ration of the magazines; every arm against the hand gunner at the same ration`);
        for (const r of RATIONS) if (R[r]) { console.log(`  ration ${r} (${D.magazineOf({ magazine: 160 }, r)} rounds a main gun, ${D.magazineOf({ magazine: 900 }, r)} a mount):`); console.log(`    A1 always firing (champion less start): ${TA.line(R[r].firing)}`); console.log(`    A2 the hand gunner made to always fire: ${TA.line(R[r].eager)}`); console.log(`    A3 champion ${TA.line(R[r].champion)} | start ${TA.line(R[r].start)}`); }
        console.log(`  THE ANSWER: holding the trigger ${A.stopsPaying === null ? "LEADS at every ration flown" : `stops paying at a ration of ${A.stopsPaying}`}; discipline pays (always firing TRAILS) at ${A.disciplinePays.length ? A.disciplinePays.join(", ") : "none of them"}`);
    } else { console.error("takeAmmoStudy: the first argument is run or report"); process.exit(2); }
    process.exit(0);
}
