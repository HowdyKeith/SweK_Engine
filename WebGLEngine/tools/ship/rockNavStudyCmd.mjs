#!/usr/bin/env node
// WebGLEngine/tools/ship/rockNavStudyCmd.mjs -- flies the rock nav rounds (brain/ROCK_NAV_WIP.md).
// Export-free on purpose: the library is tools/ship/rockNavStudy.mjs, held by its gate.
//
//   node tools/ship/rockNavStudyCmd.mjs dev --part 1/4        DEV, one quarter of the scenarios, both arms (writes dev-1of4.json once)
//   node tools/ship/rockNavStudyCmd.mjs dev-read              DEV's five checks; the totals are reported and move nothing (writes dev-report.json)
//   node tools/ship/rockNavStudyCmd.mjs held --part 1/4       HELD, one quarter, both arms (writes held-1of4.json ONCE); refused until dev-report.json passes
//   node tools/ship/rockNavStudyCmd.mjs held-read             the verdict (writes held-report.json)
//   ROUND B (the clear lane; arms N and L): devB --part k/K, devB-read, heldB --part k/K (refused until devB-report.json passes), heldB-read
//   ROUND C (the field that follows the ship; arms L and F): devC --part k/K, devC-read, heldC --part k/K (refused until devC-report.json passes), heldC-read
//   ROUND D (the lane with the doctrine's cap; arms L and LC): devD --part k/K, devD-read, heldD --part k/K (refused until devD-report.json passes), heldD-read
//   ROUND E (Round C again, the empty lane fixed; arms L and FX): devE --part k/K, devE-read, heldE --part k/K (refused until devE-report.json passes), heldE-read
//   ROUND F (Round E's replication, word for word): devF --part k/K, devF-read, heldF --part k/K (refused until devF-report.json passes), heldF-read
// --dir DIR overrides brain/rig-results/rock-nav. A part file is written the moment it exists and is never flown again.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "./rockNavStudy.mjs";
import { parseOrExit } from "./cliArgs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
const cli = parseOrExit("rock-nav", { values: { "--part": "string", "--dir": "path" }, flags: [], positional: true });
const mode = cli.rest[0], arg = (k) => cli.values[k] ?? null;
const DIR = path.resolve(arg("--dir") || path.join(ENG, "brain", "rig-results", "rock-nav"));
const out = (name) => path.join(DIR, name);
const readJson = (name) => JSON.parse(fs.readFileSync(out(name), "utf8"));
const write = (name, obj) => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(out(name), JSON.stringify(obj, null, 1) + "\n"); console.log(`[rock-nav] wrote ${path.relative(ENG, out(name))}`); };
const refuse = (name) => { if (fs.existsSync(out(name))) { console.error(`[rock-nav] REFUSED: ${path.relative(ENG, out(name))} exists -- a registered set is flown once`); process.exit(2); } };
const fmt = (x, d = 3) => (x === null || x === undefined ? "-" : typeof x === "number" ? (Number.isFinite(x) ? x.toFixed(d) : String(x)) : String(x));

function partArg() {
    const m = /^(\d+)\/(\d+)$/.exec(arg("--part") || "1/1");
    const k = m ? +m[1] : 0, K = m ? +m[2] : 0;
    if (!m || K < 1 || k < 1 || k > K) { console.error("[rock-nav] --part must be k/K with 1 <= k <= K"); process.exit(2); }
    return { k, K };
}
const partFiles = (set, K) => Array.from({ length: K }, (_, i) => `${set}-${i + 1}of${K}.json`);
function fly(set, seeds, arms = S.ARMS, round = "rock-nav A") {
    const { k, K } = partArg(), name = `${set}-${k}of${K}.json`; refuse(name);
    const t0 = Date.now(), rows = [];
    S.scenariosOf(seeds).forEach(({ seed, kind }, i) => { if (i % K !== k - 1) return; for (const arm of arms) rows.push(S.flyOne({ seed, kind, arm })); });
    write(name, { round, set, part: [k, K], arms, seeds: [seeds[0], seeds.at(-1)], seconds: (Date.now() - t0) / 1000, rows });
}
const SEEDS_OF = { dev: S.DEV_SEEDS, held: S.HELD_SEEDS, devB: S.DEV_B_SEEDS, heldB: S.HELD_B_SEEDS, devC: S.DEV_C_SEEDS, heldC: S.HELD_C_SEEDS, devD: S.DEV_D_SEEDS, heldD: S.HELD_D_SEEDS, devE: S.DEV_E_SEEDS, heldE: S.HELD_E_SEEDS, devF: S.DEV_F_SEEDS, heldF: S.HELD_F_SEEDS };
const ARMS_OF = { dev: S.ARMS, held: S.ARMS, devB: S.ARMS_B, heldB: S.ARMS_B, devC: S.ARMS_C, heldC: S.ARMS_C, devD: S.ARMS_D, heldD: S.ARMS_D, devE: S.ARMS_E, heldE: S.ARMS_E, devF: S.ARMS_F, heldF: S.ARMS_F };
function gather(set) {
    const names = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => new RegExp(`^${set}-\\d+of\\d+\\.json$`).test(f)) : [];
    const Ks = new Set(names.map((f) => +/of(\d+)/.exec(f)[1]));
    if (Ks.size !== 1) { console.error(`[rock-nav] ${set} is missing or mixes part counts (${names.join(", ") || "none"})`); process.exit(2); }
    const K = [...Ks][0], missing = partFiles(set, K).filter((f) => !names.includes(f));
    if (missing.length) { console.error(`[rock-nav] ${set} is incomplete: ${missing.join(", ")}`); process.exit(2); }
    const rows = partFiles(set, K).flatMap((f) => readJson(f).rows), order = new Map(S.scenariosOf(SEEDS_OF[set]).map((s, i) => [`${s.seed}/${s.kind}`, i]));
    rows.sort((a, b) => order.get(`${a.seed}/${a.kind}`) - order.get(`${b.seed}/${b.kind}`) || ARMS_OF[set].indexOf(a.arm) - ARMS_OF[set].indexOf(b.arm));
    return rows;
}
const sameScenarios = (rows, seeds, arms = S.ARMS) => { const want = JSON.stringify(S.scenariosOf(seeds)); return arms.every((a) => JSON.stringify(rows.filter((r) => r.arm === a).map((r) => ({ seed: r.seed, kind: r.kind }))) === want); };

if (mode === "dev") fly("dev", S.DEV_SEEDS);
else if (mode === "dev-read") {
    const rows = gather("dev"), c = S.devChecks(rows), scen = sameScenarios(rows, S.DEV_SEEDS);
    const line = (n, name, ok, detail) => console.log(`  check ${n} ${name}${detail ? " (" + detail + ")" : ""}: ${ok ? "PASS" : "FAIL"}`);
    console.log(`[rock-nav] DEV ${S.DEV_SEEDS[0]}-${S.DEV_SEEDS.at(-1)}: ${rows.length} fights; checks only`);
    line(0, "EVERY SCENARIO IN BOTH ARMS", scen, "");
    line(1, "SAME FIELD", c.sameField.ok, `${c.sameField.n} pairs`);
    line(2, "THE LAYER STEERS", c.steers.ok, `${c.steers.aimed} aimed calls of ${c.steers.calls}`);
    line(3, "THE HAND-BACK", c.handBack.ok, `${c.handBack.handBack} calls inside the strafe range, ${c.handBack.mismatches} mismatches`);
    line(4, "THE FIELD IS SOUND", c.fieldSound.ok, `${c.fieldSound.aimBlocked} aims in a blocked cell`);
    line(5, "EVERY FIGHT ENDS", c.allEnd.ok, `${c.allEnd.n} fights`);
    const H = S.readHeld(rows), a = (x) => `approach struck ${x.approachStruck}, shot ${x.approachShot}, arrived ${x.arrived}, combat struck ${x.combatStruck}`;
    console.log(`  reported, moving nothing: D ${a(H.reported.D)}; N ${a(H.reported.N)}`);
    const allOk = scen && Object.values(c).every((x) => x.ok);
    console.log(`[rock-nav] DEV: ${allOk ? "ALL CHECKS PASS -- commit the DEV files and this report, then fly HELD once" : "A CHECK FAILED -- HELD stays unflown"}`);
    write("dev-report.json", { checks: c, sameScenarios: scen, allOk, totals: H.reported });
} else if (mode === "held") {
    if (!fs.existsSync(out("dev-report.json")) || !readJson("dev-report.json").allOk) { console.error("[rock-nav] REFUSED: DEV has not passed its checks (dev-report.json)"); process.exit(2); }
    fly("held", S.HELD_SEEDS);
} else if (mode === "held-read") {
    const rows = gather("held"), scen = sameScenarios(rows, S.HELD_SEEDS), allEnd = rows.every((r) => r.over && r.t <= S.SECONDS + 1e-9);
    const H = S.readHeld(rows), R = H.reported, v = (x) => `${x.verdict}: layer better in ${x.wins}, worse in ${x.losses}, tied ${x.ties}; p ${fmt(x.p, 4)}`;
    console.log(`[rock-nav] HELD ${S.HELD_SEEDS[0]}-${S.HELD_SEEDS.at(-1)}: ${rows.length / 2} pairs; SAME SCENARIOS ${scen ? "PASS" : "FAIL"}; EVERY FIGHT ENDS ${allEnd ? "PASS" : "FAIL"}`);
    console.log(`  V1 THE APPROACH (rock strikes before arriving: D ${R.D.approachStruck}, N ${R.N.approachStruck}) ${v(H.v1)}`);
    console.log(`  V2 ARRIVALS (D ${R.D.arrived}, N ${R.N.arrived}) ${v(H.v2)}`);
    console.log(`  reported: combat strikes D ${R.D.combatStruck}, N ${R.N.combatStruck} -- ${v(R.combatStruck)}`);
    console.log(`  reported: total struck D ${R.D.struck}, N ${R.N.struck}; approach shot D ${R.D.approachShot}, N ${R.N.approachShot}; median arrival D ${fmt(R.D.medianArrivalT, 2)} s, N ${fmt(R.N.medianArrivalT, 2)} s`);
    console.log(`  reported: mean R D ${fmt(R.D.meanR, 1)}, N ${fmt(R.N.meanR, 1)}; mean damage on the ship D ${fmt(R.D.meanDamage, 1)}, N ${fmt(R.N.meanDamage, 1)}; ship dead D ${R.D.shipDead}, N ${R.N.shipDead}; aim fallbacks ${R.fallbacks}, NEAR aims ${R.near}; worst ship drift D ${fmt(R.D.maxDrift, 1)}, N ${fmt(R.N.maxDrift, 1)}`);
    const notWeighed = !scen || !allEnd;
    console.log(`[rock-nav] BOTTOM LINE: ${notWeighed ? "NOT WEIGHED (a check failed)" : H.bottom}`);
    write("held-report.json", { ...H, checks: { sameScenarios: scen, allEnd }, notWeighed });
} else if (mode === "devB") fly("devB", S.DEV_B_SEEDS, S.ARMS_B, "rock-nav B");
else if (mode === "devB-read") {
    const rows = gather("devB"), c = S.devChecksB(rows), scen = sameScenarios(rows, S.DEV_B_SEEDS, S.ARMS_B);
    const line = (n, name, ok, detail) => console.log(`  check ${n} ${name}${detail ? " (" + detail + ")" : ""}: ${ok ? "PASS" : "FAIL"}`);
    console.log(`[rock-nav] ROUND B DEV ${S.DEV_B_SEEDS[0]}-${S.DEV_B_SEEDS.at(-1)}: ${rows.length} fights; checks only`);
    line(0, "EVERY SCENARIO IN BOTH ARMS", scen, "");
    line(1, "SAME FIELD", c.sameField.ok, `${c.sameField.n} pairs`);
    line(2, "THE HAND-BACK", c.handBack.ok, `${c.handBack.handBack} calls inside the strafe range, ${c.handBack.mismatches} mismatches`);
    line(3, "THE LANE IS SOUND", c.laneSound.ok, `L: ${c.laneSound.laneGoalCells} goal cells, ${c.laneSound.laneBlocked} with the line blocked; N: ${c.laneSound.plainGoalCells}, ${c.laneSound.plainBlocked}`);
    line(4, "THE FIELD IS SOUND", c.fieldSound.ok, `${c.fieldSound.aimBlocked} aims in a blocked cell`);
    line(5, "EVERY FIGHT ENDS", c.allEnd.ok, `${c.allEnd.n} fights`);
    const H = S.readHeldB(rows), a = (x) => `approach struck ${x.approachStruck}, arrived ${x.arrived}, combat struck ${x.combatStruck}, mean damage ${fmt(x.meanDamage, 1)}`;
    console.log(`  reported, moving nothing: N ${a(H.reported.N)}; L ${a(H.reported.L)}`);
    const allOk = scen && Object.values(c).every((x) => x.ok);
    console.log(`[rock-nav] ROUND B DEV: ${allOk ? "ALL CHECKS PASS -- commit the DEV files and this report, then fly HELD once" : "A CHECK FAILED -- HELD stays unflown"}`);
    write("devB-report.json", { checks: c, sameScenarios: scen, allOk, totals: H.reported });
} else if (mode === "heldB") {
    if (!fs.existsSync(out("devB-report.json")) || !readJson("devB-report.json").allOk) { console.error("[rock-nav] REFUSED: ROUND B's DEV has not passed its checks (devB-report.json)"); process.exit(2); }
    fly("heldB", S.HELD_B_SEEDS, S.ARMS_B, "rock-nav B");
} else if (mode === "heldB-read") {
    const rows = gather("heldB"), scen = sameScenarios(rows, S.HELD_B_SEEDS, S.ARMS_B), allEnd = rows.every((r) => r.over && r.t <= S.SECONDS + 1e-9);
    const H = S.readHeldB(rows), R = H.reported, v = (x) => `${x.verdict}: the lane better in ${x.wins}, worse in ${x.losses}, tied ${x.ties}; p ${fmt(x.p, 4)}`;
    console.log(`[rock-nav] ROUND B HELD ${S.HELD_B_SEEDS[0]}-${S.HELD_B_SEEDS.at(-1)}: ${rows.length / 2} pairs; SAME SCENARIOS ${scen ? "PASS" : "FAIL"}; EVERY FIGHT ENDS ${allEnd ? "PASS" : "FAIL"}`);
    console.log(`  V1 THE STRAFE (rock strikes after arriving: N ${R.N.combatStruck}, L ${R.L.combatStruck}) ${v(H.v1)}`);
    console.log(`  V2 THE DAMAGE (mean on the ship: N ${fmt(R.N.meanDamage, 1)}, L ${fmt(R.L.meanDamage, 1)}) ${v(H.v2)}`);
    console.log(`  reported: approach strikes N ${R.N.approachStruck}, L ${R.L.approachStruck} -- ${v(R.approachStruck)}`);
    console.log(`  reported: arrived N ${R.N.arrived}, L ${R.L.arrived}; approach shot N ${R.N.approachShot}, L ${R.L.approachShot}; total struck N ${R.N.struck}, L ${R.L.struck}; median arrival N ${fmt(R.N.medianArrivalT, 2)} s, L ${fmt(R.L.medianArrivalT, 2)} s`);
    console.log(`  reported: mean R N ${fmt(R.N.meanR, 1)}, L ${fmt(R.L.meanR, 1)}; ship dead N ${R.N.shipDead}, L ${R.L.shipDead}; fallbacks N ${R.N.fallbacks}, L ${R.L.fallbacks}; NEAR N ${R.N.near}, L ${R.L.near}; worst drift N ${fmt(R.N.maxDrift, 1)}, L ${fmt(R.L.maxDrift, 1)}`);
    const notWeighed = !scen || !allEnd;
    console.log(`[rock-nav] ROUND B BOTTOM LINE: ${notWeighed ? "NOT WEIGHED (a check failed)" : H.bottom}`);
    write("heldB-report.json", { ...H, checks: { sameScenarios: scen, allEnd }, notWeighed });
} else if (mode === "devC") fly("devC", S.DEV_C_SEEDS, S.ARMS_C, "rock-nav C");
else if (mode === "devC-read") {
    const rows = gather("devC"), c = S.devChecksC(rows), scen = sameScenarios(rows, S.DEV_C_SEEDS, S.ARMS_C);
    const line = (n, name, ok, detail) => console.log(`  check ${n} ${name}${detail ? " (" + detail + ")" : ""}: ${ok ? "PASS" : "FAIL"}`);
    console.log(`[rock-nav] ROUND C DEV ${S.DEV_C_SEEDS[0]}-${S.DEV_C_SEEDS.at(-1)}: ${rows.length} fights; checks only`);
    line(0, "EVERY SCENARIO IN BOTH ARMS", scen, "");
    line(1, "SAME FIELD", c.sameField.ok, `${c.sameField.n} pairs`);
    line(2, "THE HAND-BACK", c.handBack.ok, `${c.handBack.handBack} calls inside the strafe range, ${c.handBack.mismatches} mismatches`);
    line(3, "IT FOLLOWS", c.follows.ok, `${c.follows.builds} builds in F, worst distance from the ship ${fmt(c.follows.worstDev, 6)}`);
    line(4, "THE FIELD IS SOUND", c.fieldSound.ok, `${c.fieldSound.aimBlocked} aims in a blocked cell; rock centres blocked in every build`);
    line(5, "EVERY FIGHT ENDS", c.allEnd.ok, `${c.allEnd.n} fights`);
    const H = S.readHeldC(rows), a = (x) => `struck ${x.struck} (before ${x.approachStruck}, after ${x.combatStruck}), mean damage ${fmt(x.meanDamage, 1)}, fallbacks ${x.fallbacks}`;
    console.log(`  reported, moving nothing: L ${a(H.reported.L)}; F ${a(H.reported.F)}`);
    const allOk = scen && Object.values(c).every((x) => x.ok);
    console.log(`[rock-nav] ROUND C DEV: ${allOk ? "ALL CHECKS PASS -- commit the DEV files and this report, then fly HELD once" : "A CHECK FAILED -- HELD stays unflown"}`);
    write("devC-report.json", { checks: c, sameScenarios: scen, allOk, totals: H.reported });
} else if (mode === "heldC") {
    if (!fs.existsSync(out("devC-report.json")) || !readJson("devC-report.json").allOk) { console.error("[rock-nav] REFUSED: ROUND C's DEV has not passed its checks (devC-report.json)"); process.exit(2); }
    fly("heldC", S.HELD_C_SEEDS, S.ARMS_C, "rock-nav C");
} else if (mode === "heldC-read") {
    const rows = gather("heldC"), scen = sameScenarios(rows, S.HELD_C_SEEDS, S.ARMS_C), allEnd = rows.every((r) => r.over && r.t <= S.SECONDS + 1e-9);
    const H = S.readHeldC(rows), R = H.reported, v = (x) => `${x.verdict}: following better in ${x.wins}, worse in ${x.losses}, tied ${x.ties}; p ${fmt(x.p, 4)}`;
    console.log(`[rock-nav] ROUND C HELD ${S.HELD_C_SEEDS[0]}-${S.HELD_C_SEEDS.at(-1)}: ${rows.length / 2} pairs; SAME SCENARIOS ${scen ? "PASS" : "FAIL"}; EVERY FIGHT ENDS ${allEnd ? "PASS" : "FAIL"}`);
    console.log(`  V1 THE ROCKS (all rock strikes: L ${R.L.struck}, F ${R.F.struck}) ${v(H.v1)}`);
    console.log(`  V2 THE DAMAGE (mean on the ship: L ${fmt(R.L.meanDamage, 1)}, F ${fmt(R.F.meanDamage, 1)}) ${v(H.v2)}`);
    console.log(`  reported: strikes before arriving L ${R.L.approachStruck}, F ${R.F.approachStruck} -- ${v(R.approachStruck)}`);
    console.log(`  reported: strikes after arriving L ${R.L.combatStruck}, F ${R.F.combatStruck} -- ${v(R.combatStruck)}`);
    console.log(`  reported: arrived L ${R.L.arrived}, F ${R.F.arrived}; approach shot L ${R.L.approachShot}, F ${R.F.approachShot}; median arrival L ${fmt(R.L.medianArrivalT, 2)} s, F ${fmt(R.F.medianArrivalT, 2)} s; mean R L ${fmt(R.L.meanR, 1)}, F ${fmt(R.F.meanR, 1)}; ship dead L ${R.L.shipDead}, F ${R.F.shipDead}`);
    console.log(`  reported: fallbacks L ${R.L.fallbacks}, F ${R.F.fallbacks}; NEAR L ${R.L.near}, F ${R.F.near}; builds a fight L ${fmt(R.L.meanBuilds, 1)}, F ${fmt(R.F.meanBuilds, 1)}; F's build time ${fmt(R.F.buildS, 0)} s in all`);
    const notWeighed = !scen || !allEnd;
    console.log(`[rock-nav] ROUND C BOTTOM LINE: ${notWeighed ? "NOT WEIGHED (a check failed)" : H.bottom}`);
    write("heldC-report.json", { ...H, checks: { sameScenarios: scen, allEnd }, notWeighed });
} else if (mode === "devD") fly("devD", S.DEV_D_SEEDS, S.ARMS_D, "rock-nav D");
else if (mode === "devD-read") {
    const rows = gather("devD"), c = S.devChecksD(rows), scen = sameScenarios(rows, S.DEV_D_SEEDS, S.ARMS_D);
    const line = (n, name, ok, detail) => console.log(`  check ${n} ${name}${detail ? " (" + detail + ")" : ""}: ${ok ? "PASS" : "FAIL"}`);
    console.log(`[rock-nav] ROUND D DEV ${S.DEV_D_SEEDS[0]}-${S.DEV_D_SEEDS.at(-1)}: ${rows.length} fights; checks only`);
    line(0, "EVERY SCENARIO IN BOTH ARMS", scen, "");
    line(1, "SAME FIELD", c.sameField.ok, `${c.sameField.n} pairs`);
    line(2, "THE HAND-BACK", c.handBack.ok, `${c.handBack.handBack} calls inside the strafe range, ${c.handBack.mismatches} mismatches, read before the cap`);
    line(3, "THE CAP IS APPLIED", c.capApplied.ok, `LC: ${c.capApplied.overCap} calls at or over ${S.CAP_D}, ${c.capApplied.cut} cut, ${c.capApplied.notCut} with thrust; L: ${c.capApplied.lCut} cut, ${c.capApplied.lOverWithThrust} over the cap with thrust`);
    line(4, "THE FIELD IS SOUND", c.fieldSound.ok, `${c.fieldSound.aimBlocked} aims in a blocked cell`);
    line(5, "EVERY FIGHT ENDS", c.allEnd.ok, `${c.allEnd.n} fights`);
    const H = S.readHeldD(rows), a = (x) => `after arriving ${x.combatStruck}, before ${x.approachStruck}, shot before ${x.approachShot}, mean R ${fmt(x.meanR, 1)}, ships destroyed ${x.shipDead}`;
    console.log(`  reported, moving nothing: L ${a(H.reported.L)}; LC ${a(H.reported.LC)}`);
    const allOk = scen && Object.values(c).every((x) => x.ok);
    console.log(`[rock-nav] ROUND D DEV: ${allOk ? "ALL CHECKS PASS -- commit the DEV files and this report, then fly HELD once" : "A CHECK FAILED -- HELD stays unflown"}`);
    write("devD-report.json", { checks: c, sameScenarios: scen, allOk, totals: H.reported });
} else if (mode === "heldD") {
    if (!fs.existsSync(out("devD-report.json")) || !readJson("devD-report.json").allOk) { console.error("[rock-nav] REFUSED: ROUND D's DEV has not passed its checks (devD-report.json)"); process.exit(2); }
    fly("heldD", S.HELD_D_SEEDS, S.ARMS_D, "rock-nav D");
} else if (mode === "heldD-read") {
    const rows = gather("heldD"), scen = sameScenarios(rows, S.HELD_D_SEEDS, S.ARMS_D), allEnd = rows.every((r) => r.over && r.t <= S.SECONDS + 1e-9);
    const H = S.readHeldD(rows), R = H.reported, v = (x) => `${x.verdict}: the cap better in ${x.wins}, worse in ${x.losses}, tied ${x.ties}; p ${fmt(x.p, 4)}`;
    console.log(`[rock-nav] ROUND D HELD ${S.HELD_D_SEEDS[0]}-${S.HELD_D_SEEDS.at(-1)}: ${rows.length / 2} pairs; SAME SCENARIOS ${scen ? "PASS" : "FAIL"}; EVERY FIGHT ENDS ${allEnd ? "PASS" : "FAIL"}`);
    console.log(`  V1 THE STRAFE (rock strikes after arriving: L ${R.L.combatStruck}, LC ${R.LC.combatStruck}) ${v(H.v1)}`);
    console.log(`  V2 THE ATTACK (mean R: L ${fmt(R.L.meanR, 1)}, LC ${fmt(R.LC.meanR, 1)}) ${v(H.v2)}`);
    console.log(`  reported: strikes before arriving L ${R.L.approachStruck}, LC ${R.LC.approachStruck} -- ${v(R.approachStruck)}`);
    console.log(`  reported: shot before arriving L ${R.L.approachShot}, LC ${R.LC.approachShot} -- ${v(R.approachShot)}`);
    console.log(`  reported: all rock strikes L ${R.L.struck}, LC ${R.LC.struck} -- ${v(R.struck)}`);
    console.log(`  reported: ships destroyed L ${R.L.shipDead}, LC ${R.LC.shipDead}; mean damage L ${fmt(R.L.meanDamage, 1)}, LC ${fmt(R.LC.meanDamage, 1)}; arrived L ${R.L.arrived}, LC ${R.LC.arrived}; median arrival L ${fmt(R.L.medianArrivalT, 2)} s, LC ${fmt(R.LC.medianArrivalT, 2)} s`);
    console.log(`  reported: the cap in LC ${R.LC.capCut} calls cut of ${R.LC.overCap} over it (${R.LC.capNotCut} with thrust); fallbacks L ${R.L.fallbacks}, LC ${R.LC.fallbacks}; NEAR L ${R.L.near}, LC ${R.LC.near}`);
    const notWeighed = !scen || !allEnd;
    console.log(`[rock-nav] ROUND D BOTTOM LINE: ${notWeighed ? "NOT WEIGHED (a check failed)" : H.bottom}`);
    write("heldD-report.json", { ...H, checks: { sameScenarios: scen, allEnd }, notWeighed });
} else if (mode === "devE") fly("devE", S.DEV_E_SEEDS, S.ARMS_E, "rock-nav E");
else if (mode === "devE-read") {
    const rows = gather("devE"), c = S.devChecksE(rows), scen = sameScenarios(rows, S.DEV_E_SEEDS, S.ARMS_E);
    const line = (n, name, ok, detail) => console.log(`  check ${n} ${name}${detail ? " (" + detail + ")" : ""}: ${ok ? "PASS" : "FAIL"}`);
    console.log(`[rock-nav] ROUND E DEV ${S.DEV_E_SEEDS[0]}-${S.DEV_E_SEEDS.at(-1)}: ${rows.length} fights; checks only`);
    line(0, "EVERY SCENARIO IN BOTH ARMS", scen, "");
    line(1, "SAME FIELD", c.sameField.ok, `${c.sameField.n} pairs`);
    line(2, "THE HAND-BACK", c.handBack.ok, `${c.handBack.handBack} calls inside the strafe range, ${c.handBack.mismatches} mismatches`);
    line(3, "IT FOLLOWS", c.follows.ok, `${c.follows.builds} builds in FX, worst distance from the ship ${fmt(c.follows.worstDev, 6)}`);
    line(4, "THE FIELD IS SOUND", c.fieldSound.ok, `${c.fieldSound.aimBlocked} aims in a blocked cell`);
    line(5, "EVERY FIGHT ENDS", c.allEnd.ok, `${c.allEnd.n} fights`);
    line(6, "THE FIX REACHES THE FIELD", c.fixReaches.ok, `${c.fixReaches.laneEmptyBuilds} empty-lane builds fell back, ${c.fixReaches.buildsWithoutGoal} builds without a goal`);
    const H = S.readHeldE(rows), a = (x) => `struck ${x.struck} (before ${x.approachStruck}, after ${x.combatStruck}), mean damage ${fmt(x.meanDamage, 1)}, fallbacks ${x.fallbacks}`;
    console.log(`  reported, moving nothing: L ${a(H.reported.L)}; FX ${a(H.reported.FX)}`);
    const allOk = scen && Object.values(c).every((x) => x.ok);
    console.log(`[rock-nav] ROUND E DEV: ${allOk ? "ALL CHECKS PASS -- commit the DEV files and this report, then fly HELD once" : "A CHECK FAILED -- HELD stays unflown"}`);
    write("devE-report.json", { checks: c, sameScenarios: scen, allOk, totals: H.reported });
} else if (mode === "heldE") {
    if (!fs.existsSync(out("devE-report.json")) || !readJson("devE-report.json").allOk) { console.error("[rock-nav] REFUSED: ROUND E's DEV has not passed its checks (devE-report.json)"); process.exit(2); }
    fly("heldE", S.HELD_E_SEEDS, S.ARMS_E, "rock-nav E");
} else if (mode === "heldE-read") {
    const rows = gather("heldE"), scen = sameScenarios(rows, S.HELD_E_SEEDS, S.ARMS_E), allEnd = rows.every((r) => r.over && r.t <= S.SECONDS + 1e-9);
    const H = S.readHeldE(rows), R = H.reported, v = (x) => `${x.verdict}: following better in ${x.wins}, worse in ${x.losses}, tied ${x.ties}; p ${fmt(x.p, 4)}`;
    console.log(`[rock-nav] ROUND E HELD ${S.HELD_E_SEEDS[0]}-${S.HELD_E_SEEDS.at(-1)}: ${rows.length / 2} pairs; SAME SCENARIOS ${scen ? "PASS" : "FAIL"}; EVERY FIGHT ENDS ${allEnd ? "PASS" : "FAIL"}`);
    console.log(`  V1 THE ROCKS (all rock strikes: L ${R.L.struck}, FX ${R.FX.struck}) ${v(H.v1)}`);
    console.log(`  V2 THE DAMAGE (mean on the ship: L ${fmt(R.L.meanDamage, 1)}, FX ${fmt(R.FX.meanDamage, 1)}) ${v(H.v2)}`);
    console.log(`  reported: strikes before arriving L ${R.L.approachStruck}, FX ${R.FX.approachStruck} -- ${v(R.approachStruck)}`);
    console.log(`  reported: strikes after arriving L ${R.L.combatStruck}, FX ${R.FX.combatStruck} -- ${v(R.combatStruck)}`);
    console.log(`  reported: arrived L ${R.L.arrived}, FX ${R.FX.arrived}; approach shot L ${R.L.approachShot}, FX ${R.FX.approachShot}; median arrival L ${fmt(R.L.medianArrivalT, 2)} s, FX ${fmt(R.FX.medianArrivalT, 2)} s; ship dead L ${R.L.shipDead}, FX ${R.FX.shipDead}`);
    console.log(`  reported: fallbacks L ${R.L.fallbacks}, FX ${R.FX.fallbacks}; empty-lane builds ${R.FX.laneEmptyBuilds} in ${R.FX.fightsWithEmpty} fights (${R.FX.buildsWithoutGoal} builds without a goal); builds a fight FX ${fmt(R.FX.meanBuilds, 1)}`);
    const notWeighed = !scen || !allEnd;
    console.log(`[rock-nav] ROUND E BOTTOM LINE: ${notWeighed ? "NOT WEIGHED (a check failed)" : H.bottom}`);
    write("heldE-report.json", { ...H, checks: { sameScenarios: scen, allEnd }, notWeighed });
} else if (mode === "devF") fly("devF", S.DEV_F_SEEDS, S.ARMS_F, "rock-nav F");
else if (mode === "devF-read") {
    const rows = gather("devF"), c = S.devChecksE(rows), scen = sameScenarios(rows, S.DEV_F_SEEDS, S.ARMS_F);
    const line = (n, name, ok, detail) => console.log(`  check ${n} ${name}${detail ? " (" + detail + ")" : ""}: ${ok ? "PASS" : "FAIL"}`);
    console.log(`[rock-nav] ROUND F DEV ${S.DEV_F_SEEDS[0]}-${S.DEV_F_SEEDS.at(-1)}: ${rows.length} fights; checks only`);
    line(0, "EVERY SCENARIO IN BOTH ARMS", scen, "");
    line(1, "SAME FIELD", c.sameField.ok, `${c.sameField.n} pairs`);
    line(2, "THE HAND-BACK", c.handBack.ok, `${c.handBack.handBack} calls inside the strafe range, ${c.handBack.mismatches} mismatches`);
    line(3, "IT FOLLOWS", c.follows.ok, `${c.follows.builds} builds in FX, worst distance from the ship ${fmt(c.follows.worstDev, 6)}`);
    line(4, "THE FIELD IS SOUND", c.fieldSound.ok, `${c.fieldSound.aimBlocked} aims in a blocked cell`);
    line(5, "EVERY FIGHT ENDS", c.allEnd.ok, `${c.allEnd.n} fights`);
    line(6, "THE FIX REACHES THE FIELD", c.fixReaches.ok, `${c.fixReaches.laneEmptyBuilds} empty-lane builds fell back, ${c.fixReaches.buildsWithoutGoal} builds without a goal`);
    const H = S.readHeldF(rows), a = (x) => `struck ${x.struck} (before ${x.approachStruck}, after ${x.combatStruck}), mean damage ${fmt(x.meanDamage, 1)}, fallbacks ${x.fallbacks}`;
    console.log(`  reported, moving nothing: L ${a(H.reported.L)}; FX ${a(H.reported.FX)}`);
    const allOk = scen && Object.values(c).every((x) => x.ok);
    console.log(`[rock-nav] ROUND F DEV: ${allOk ? "ALL CHECKS PASS -- commit the DEV files and this report, then fly HELD once" : "A CHECK FAILED -- HELD stays unflown"}`);
    write("devF-report.json", { checks: c, sameScenarios: scen, allOk, totals: H.reported });
} else if (mode === "heldF") {
    if (!fs.existsSync(out("devF-report.json")) || !readJson("devF-report.json").allOk) { console.error("[rock-nav] REFUSED: ROUND F's DEV has not passed its checks (devF-report.json)"); process.exit(2); }
    fly("heldF", S.HELD_F_SEEDS, S.ARMS_F, "rock-nav F");
} else if (mode === "heldF-read") {
    const rows = gather("heldF"), scen = sameScenarios(rows, S.HELD_F_SEEDS, S.ARMS_F), allEnd = rows.every((r) => r.over && r.t <= S.SECONDS + 1e-9);
    const H = S.readHeldF(rows), R = H.reported, v = (x) => `${x.verdict}: following better in ${x.wins}, worse in ${x.losses}, tied ${x.ties}; p ${fmt(x.p, 4)}`;
    console.log(`[rock-nav] ROUND F HELD ${S.HELD_F_SEEDS[0]}-${S.HELD_F_SEEDS.at(-1)}: ${rows.length / 2} pairs; SAME SCENARIOS ${scen ? "PASS" : "FAIL"}; EVERY FIGHT ENDS ${allEnd ? "PASS" : "FAIL"}`);
    console.log(`  V1 THE ROCKS (all rock strikes: L ${R.L.struck}, FX ${R.FX.struck}) ${v(H.v1)}`);
    console.log(`  V2 THE DAMAGE (mean on the ship: L ${fmt(R.L.meanDamage, 1)}, FX ${fmt(R.FX.meanDamage, 1)}) ${v(H.v2)}`);
    console.log(`  reported: strikes before arriving L ${R.L.approachStruck}, FX ${R.FX.approachStruck} -- ${v(R.approachStruck)}`);
    console.log(`  reported: strikes after arriving L ${R.L.combatStruck}, FX ${R.FX.combatStruck} -- ${v(R.combatStruck)}`);
    console.log(`  reported: arrived L ${R.L.arrived}, FX ${R.FX.arrived}; approach shot L ${R.L.approachShot}, FX ${R.FX.approachShot}; median arrival L ${fmt(R.L.medianArrivalT, 2)} s, FX ${fmt(R.FX.medianArrivalT, 2)} s; ship dead L ${R.L.shipDead}, FX ${R.FX.shipDead}`);
    console.log(`  reported: fallbacks L ${R.L.fallbacks}, FX ${R.FX.fallbacks}; empty-lane builds ${R.FX.laneEmptyBuilds} in ${R.FX.fightsWithEmpty} fights (${R.FX.buildsWithoutGoal} builds without a goal); builds a fight FX ${fmt(R.FX.meanBuilds, 1)}`);
    const notWeighed = !scen || !allEnd;
    console.log(`[rock-nav] ROUND F BOTTOM LINE: ${notWeighed ? "NOT WEIGHED (a check failed)" : H.bottom}`);
    console.log(`[rock-nav] ROUND F, THE REPLICATION: ${notWeighed ? "NOT WEIGHED" : H.replication}`);
    write("heldF-report.json", { ...H, checks: { sameScenarios: scen, allEnd }, notWeighed });
} else {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 14).join("\n"));
    process.exit(mode ? 2 : 0);
}
