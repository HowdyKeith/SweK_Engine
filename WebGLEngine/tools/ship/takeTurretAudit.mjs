// WebGLEngine/tools/ship/takeTurretAudit.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE LARGER AUDIT OF THE TURRET SEAT'S TRAINED GUNNERS. tools/ship/trainTurretSeat.mjs's champion read its 16 audit pairs once: +0.166 over the hand gunner with a standard error of 0.276, and its one synapse worth +0.063 with a standard error of 0.213 -- neither told from nothing. Keith: "keep the file, run the
// larger audit." This is that audit, and what it will be read as WAS WRITTEN HERE BEFORE ANY OF IT WAS FLOWN (2026-11-14).
//
//   THE PAIRS    300 fresh battleshipDuel pairs: seeds 1001-1075 of each of the four kinds. No search, choice, gate or earlier audit has flown any of them (the trainers' sets are 31-84, the gates pin 1-3).
//   THE ARMS     nine networks, each in all thirteen seats against the hand gunner on the SAME pairs (trainTurretSeat.evaluate's fight: regular sights, the bow-on rule, the cannon): `start` (the car's hand weights), the four search records of brain/seatTurretSearchRecords.jsonl (`s7000` is the
//                champion, the file that ships; `s7001`, `s7002`, `s7003`), and each record with every synapse at zero (`s7000-ablated` ...).
//   THE READINGS a mean over the 300 pairs with its standard error (the pairs are the unit; every difference between arms is PAIRED, pair by pair), z = mean / se, and three words: LEADS (z >= 2), TRAILS (z <= -2), CANNOT BE TOLD (between).
//                R1  THE CHAMPION AGAINST THE HAND GUNNER       s7000's lead. The one registered claim of the shipped file.
//                R2  THE CHAMPION'S SYNAPSE                     s7000 less s7000-ablated.
//                R3  WHAT THE TRAINING BOUGHT                   s7000 less start.
//                R4  THE OTHER THREE SEARCHES, the same three readings each. NINE MORE READINGS: with twelve in all, one |z| of 2 by chance is about an even bet, so a lone LEADS or TRAILS among R4 is a hint and is said as one; R1-R3 are the three that were asked.
//   NOTHING IS CHOSEN ON THIS AUDIT: the file that ships stays the one picked on held-out, whatever is read here.
//
//     node tools/ship/takeTurretAudit.mjs run --arm s7000 --out <file.jsonl>     # one arm, a line a pair; a file that already holds pairs is resumed
//     node tools/ship/takeTurretAudit.mjs report --in <dir>                      # every arm's file in the directory, the readings above
"use strict";
import fs from "node:fs";
import path from "node:path";
import * as T from "./trainTurretSeat.mjs";
import * as D from "../../brain/battleshipDuel.mjs";

export const SEEDS = Object.freeze(Array.from({ length: 75 }, (_, i) => 1001 + i));
export const PAIRS = Object.freeze(D.KINDS.flatMap((kind) => SEEDS.map((seed) => Object.freeze({ kind, seed }))));
export const RECORD_SEEDS = Object.freeze([7000, 7001, 7002, 7003]), CHAMPION = "s7000";
export const ARMS = Object.freeze(["start", ...RECORD_SEEDS.flatMap((s) => [`s${s}`, `s${s}-ablated`])]);
/** The weights of an arm, from the records (an array of trainTurretSeat search records). */
export function weightsOf(arm, records) {
    if (arm === "start") return T.startWeights();
    const m = /^s(\d+)(-ablated)?$/.exec(arm), rec = m && records.find((r) => r.seed === Number(m[1]));
    if (!rec) throw new Error(`takeTurretAudit.weightsOf: no arm "${arm}" (${ARMS.join(", ")})`);
    const w = Float32Array.from(rec.weights); return m[2] ? T.ablate(w) : w;
}
/** Mean, standard error and z of a list. */
export function stat(xs) { const n = xs.length, mean = xs.reduce((a, b) => a + b, 0) / n, se = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) / n); return { n, mean, se, z: se > 0 ? mean / se : 0 }; }
export const word = (z) => (z >= 2 ? "LEADS" : z <= -2 ? "TRAILS" : "CANNOT BE TOLD");
/** The readings from { arm: Map("kind|seed" -> lead) }: every arm's lead, and for each record its synapse (record less ablation) and its training (record less start), paired on the pairs both arms hold. */
export function readings(leads) {
    const paired = (a, b) => { const xs = []; for (const [k, v] of leads[a]) if (leads[b].has(k)) xs.push(v - leads[b].get(k)); return stat(xs); }, out = { arms: {}, synapse: {}, training: {} };
    for (const a of Object.keys(leads)) out.arms[a] = stat([...leads[a].values()]);
    for (const s of RECORD_SEEDS) { const a = `s${s}`; if (leads[a] && leads[a + "-ablated"]) out.synapse[a] = paired(a, a + "-ablated"); if (leads[a] && leads.start) out.training[a] = paired(a, "start"); }
    return out;
}
export const line = (s) => `${s.mean >= 0 ? "+" : ""}${s.mean.toFixed(3)} (se ${s.se.toFixed(3)}, z ${s.z.toFixed(2)}, ${s.n} pairs): ${word(s.z)}`;

if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
        const [step, ...rest] = process.argv.slice(2), arg = (k) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : null; };
        const records = fs.readFileSync(new URL("../../brain/seatTurretSearchRecords.jsonl", import.meta.url), "utf8").trim().split("\n").map((l) => JSON.parse(l));
        if (step === "run") {
            const arm = arg("arm"), out = arg("out"); if (!ARMS.includes(arm) || !out) { console.error(`takeTurretAudit: run needs --arm (${ARMS.join(", ")}) and --out <file.jsonl>`); process.exit(2); }
            const done = new Set(fs.existsSync(out) ? fs.readFileSync(out, "utf8").trim().split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l); return r.kind + "|" + r.seed; }) : []), w = weightsOf(arm, records);
            for (const p of PAIRS) { if (done.has(p.kind + "|" + p.seed)) continue; const r = T.evaluate(w, [p]).runs[0]; fs.appendFileSync(out, JSON.stringify({ arm, kind: r.kind, seed: r.seed, lead: r.lead }) + "\n"); }
            console.log(`${arm}: ${PAIRS.length} pairs in ${out}`);
        } else if (step === "report") {
            const dir = arg("in"), leads = {};
            for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) for (const l of fs.readFileSync(path.join(dir, f), "utf8").trim().split("\n").filter(Boolean)) { const r = JSON.parse(l); (leads[r.arm] ||= new Map()).set(r.kind + "|" + r.seed, r.lead); }
            const R = readings(leads), c = CHAMPION;
            console.log(`[takeTurretAudit] ${PAIRS.length} pairs (seeds ${SEEDS[0]}-${SEEDS[SEEDS.length - 1]} of ${D.KINDS.join(", ")}), every arm against the hand gunner`);
            console.log(`  R1 THE CHAMPION AGAINST THE HAND GUNNER: ${line(R.arms[c])}`);
            console.log(`  R2 THE CHAMPION'S SYNAPSE (champion less its ablation): ${line(R.synapse[c])}`);
            console.log(`  R3 WHAT THE TRAINING BOUGHT (champion less the start): ${line(R.training[c])}`);
            console.log(`     the start (the car's hand weights) against the hand gunner: ${line(R.arms.start)}`);
            console.log("  R4 the other three searches (nine readings; a lone LEADS or TRAILS here is a hint):");
            for (const s of RECORD_SEEDS.slice(1)) { const a = `s${s}`; console.log(`     ${a} (${records.find((r) => r.seed === s).synapses} synapses): against the hand gunner ${line(R.arms[a])} | its synapses ${line(R.synapse[a])} | its training ${line(R.training[a])}`); }
        } else { console.error("takeTurretAudit: the first argument is run or report"); process.exit(2); }
        process.exit(0);
    }
}
