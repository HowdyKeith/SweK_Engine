// WebGLEngine/tools/ship/signalCapStudy-selfcheck.mjs -- the gate of tools/ship/signalCapStudy.mjs and its command (the space doctrine's ROUND 5, brain/SPACE_DOCTRINE_WIP.md)
//
// Flies only gate seeds (space seeds 1-50). SABOTAGED 2026-11-26, each on a backup copy, restored after (red rows by name):
//   S1 the threshold strict: 1 red (2). S2 the signal reversed: 3 red (2, 3, 6). S3 the decision at 3 s: 3 red (1, 3, 6). S4 the damage never counted: 1 red (3). S5 the choice never applied: 1 red (3).
//   S6 the choice revisited every tick: 1 red (3). S7 the weak side read against FIXED20: 1 red (4). S8 the strong side without its win over 12: 1 red (4). S9 accuracy counting any 20 as right: 1 red (5).
//   S10 the kept-12 check dropped: 1 red (6). S11 the decision time unchecked: 1 red (6). S12 the HELD guard dropped: 1 red (7). S13 HELD back to 60 seeds: 1 red (1). None was 0 red on the first pass.
"use strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as A from "./signalCapStudy.mjs";
import * as R4 from "./adaptiveCapStudy.mjs";
import * as G from "./strongGunnersStudy.mjs";
import * as RN from "./rockNavStudy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const rows = [];
const row = (name, fn) => { let ok = false, detail = ""; try { const r = fn(); ok = r === true || (r && r.ok === true); detail = r && r.detail ? r.detail : ""; } catch (e) { ok = false; detail = "threw: " + e.message; } rows.push({ name, ok, detail }); };
const inRange = (x, [a, b]) => x >= a && x <= b;

row("1 THE SETS AND THE RULE'S CONSTANTS: Round 4's presets and caps; DECIDE_T 4 s, THRESHOLD 20; HELD 120 seeds; DEV and HELD new (not Rounds 3-4's, rock nav's, the doctrine round's or the gates')", () => {
    const all = [...A.DEV_SEEDS, ...A.HELD_SEEDS], used = [...R4.DEV_SEEDS, ...R4.HELD_SEEDS, ...G.DEV_SEEDS, ...G.HELD_SEEDS, ...RN.HELD_F_SEEDS, ...RN.DEV_F_SEEDS];
    return A.PRESETS === R4.PRESETS && A.LOW === 12 && A.HIGH === 20 && A.DECIDE_T === 4 && A.THRESHOLD === 20 && A.DEV_SEEDS.length === 30 && A.HELD_SEEDS.length === 120
        && new Set(all).size === all.length && all.every((x) => x > 50 && !used.includes(x) && ![[1601, 1800], [1901, 1930], [2101, 2130], [2401, 2460], [3101, 4290]].some((r) => inRange(x, r)));
});
row("2 THE SIGNAL: 20 or more damage chooses cap 20, less keeps 12", () => A.capFromSignal(20) === 20 && A.capFromSignal(140) === 20 && A.capFromSignal(19.99) === 12 && A.capFromSignal(0) === 12);
const F = {}; for (const p of ["ace", "regular"]) for (const arm of A.ARMS) F[`${p} ${arm}`] = (() => { try { return A.flyOne({ seed: 43, kind: "bow", preset: p, arm }); } catch (e) { return { error: e.message }; } })();
row("3 THE ARMS FLY: the cap holds in every arm; the signal decides once at 4 s by the damage it read; it chooses 20 against ace and 12 against regular on this seed; a SIGNAL fight that keeps 12 IS the FIXED12 fight", () => {
    const sa = F["ace SIGNAL"], sr = F["regular SIGNAL"], f = F["regular FIXED12"];
    return { ok: Object.values(F).every((r) => !r.error && r.notCut === 0 && r.overCap > 0) && sa.decidedAt === 120 && sa.chosen === 20 && sa.damageAtDecision >= 20 && sr.decidedAt === 120 && sr.chosen === 12 && sr.damageAtDecision < 20
        && sr.R === f.R && sr.t === f.t && F["ace FIXED12"].chosen === null && F["ace FIXED20"].decidedAt === null && sa.overCap === F["ace FIXED20"].overCap,
        detail: Object.entries(F).map(([k, r]) => `${k} R ${typeof r.R === "number" ? r.R.toFixed(0) : r.R} chose ${r.chosen} at ${r.decidedAt} (damage ${r.damageAtDecision})`).join("; ") };
});
const H = (n, f) => { const out = []; for (const preset of A.PRESETS) for (let i = 0; i < n; i++) for (const arm of A.ARMS) out.push({ seed: 9000 + i, kind: "bow", preset, arm, R: 100, damageOnShip: 100, shipDead: false, t: 30, over: true, decidedAt: arm === "SIGNAL" ? 120 : null, damageAtDecision: arm === "SIGNAL" ? (A.STRONG.includes(preset) ? 60 : 2) : null, chosen: arm === "SIGNAL" ? (A.STRONG.includes(preset) ? 20 : 12) : null, overCap: 1, notCut: 0, ...f(preset, arm, i) }); return out; };
const strongOK = (p, a, i) => (A.STRONG.includes(p) && a !== "FIXED12" && i < 30 ? { R: 200 } : {});
row("4 THE BOTTOM LINE IS ROUND 4's WITH SIGNAL READ AS ADAPT: HAS BOTH / PAYS ON THE WEAK SIDE / MISSES THE STRONG SIDE / HAS NEITHER", () => {
    const both = A.readHeld(H(40, strongOK)).bottom;
    const weak = A.readHeld(H(40, (p, a, i) => ({ ...strongOK(p, a, i), ...(p === "regular" && a !== "FIXED12" && i < 30 ? { R: 50 } : {}) }))).bottom;
    const strong = A.readHeld(H(40, (p, a, i) => (p === "perfect" && a === "FIXED20" && i < 30 ? { R: 300 } : strongOK(p, a, i)))).bottom;
    const neither = A.readHeld(H(40, (p, a, i) => (p === "green" && a === "SIGNAL" && i < 30 ? { R: 50 } : {}))).bottom;
    return { ok: both === "THE SIGNAL CAP HAS BOTH" && weak === "THE SIGNAL CAP PAYS ON THE WEAK SIDE (regular)" && strong === "THE SIGNAL CAP MISSES THE STRONG SIDE (perfect)" && neither === "THE SIGNAL CAP HAS NEITHER (green, ace, perfect)", detail: [both, weak, strong, neither].join(" / ") };
});
row("5 THE SIGNAL'S CHOICES ARE COUNTED PER PRESET, AND ITS ACCURACY IS RIGHT WHEN 20 IS CHOSEN AGAINST THE STRONG AND 12 AGAINST THE WEAK", () => {
    const h = A.readHeld(H(10, (p, a, i) => (a === "SIGNAL" && p === "regular" && i < 2 ? { chosen: 20, damageAtDecision: 25 } : {})));
    return { ok: h.choices.regular.chose20 === 2 && h.choices.regular.right === 8 && h.choices.ace.chose20 === 10 && h.choices.ace.right === 10 && Math.abs(h.accuracy - 38 / 40) < 1e-12, detail: `accuracy ${h.accuracy}` };
});
row("6 DEV'S CHECKS PASS ON GOOD ROWS AND EACH FAILS ON ITS OWN FAULT (a choice against the damage; a decision off 4 s; no 20 under a strong preset; thrust over the cap; a kept-12 fight unlike FIXED12's; a fight that does not end)", () => {
    const good = H(4, () => ({})), c0 = A.devChecks(good);
    const fault = (k, edit) => { const rs = JSON.parse(JSON.stringify(good)); edit(rs); return A.devChecks(rs)[k].ok; };
    const sig = (rs, p) => rs.find((r) => r.arm === "SIGNAL" && r.preset === p);
    const f = [fault("signalDecides", (rs) => { sig(rs, "ace").damageAtDecision = 5; }), fault("signalDecides", (rs) => { sig(rs, "ace").decidedAt = 150; }),
        fault("signalDecides", (rs) => rs.filter((r) => r.arm === "SIGNAL" && r.preset === "perfect").forEach((r) => { r.chosen = 12; r.damageAtDecision = 2; })),
        fault("capApplied", (rs) => { rs[0].notCut = 1; }), fault("capApplied", (rs) => { sig(rs, "regular").R = 5; }), fault("allEnd", (rs) => { rs[2].over = false; })];
    return { ok: Object.values(c0).every((x) => x.ok) && f.every((x) => x === false), detail: `good ${Object.values(c0).map((x) => x.ok).join(",")}; faults pass: ${f.join(",")}` };
});
row("7 THE COMMAND: export-free; HELD refused before DEV passes; an unknown option refused; a part never flown twice", () => {
    const cmd = path.join(HERE, "signalCapStudyCmd.mjs"), src = fs.readFileSync(cmd, "utf8"), dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-"));
    const run = (...a) => spawnSync(process.execPath, [cmd, ...a, "--dir", dir], { encoding: "utf8" }).status;
    const noDev = run("held", "--part", "1/90"); fs.writeFileSync(path.join(dir, "dev-1of1.json"), "{}"); const twice = run("dev", "--part", "1/1");
    const unknown = spawnSync(process.execPath, [cmd, "dev", "--bogus"], { encoding: "utf8" }).status; fs.rmSync(dir, { recursive: true, force: true });
    return { ok: !/^export\s/m.test(src) && noDev === 2 && twice === 2 && unknown === 2 && /signal-cap/.test(src) && !/adaptive-cap/.test(src), detail: `no DEV ${noDev}, twice ${twice}, unknown ${unknown}` };
});
row("8 reportLines NAMES THE SIGNAL'S NUMBERS AND THE SETS", () => { const l = A.reportLines().join(" "); return l.includes(`DECIDE_T ${A.DECIDE_T}`) && l.includes(`THRESHOLD ${A.THRESHOLD}`) && l.includes(String(A.HELD_SEEDS.at(-1))); });

// 2026-11-27 (the publish merge; definitionGates named these exports as unmentioned by any gate) -- each held to what it is for.
row("signalCapStudy: SPENT is the design survey's throwaway seeds 9990061-9990072 the registration names (brain/SPACE_DOCTRINE_WIP.md), in neither DEV nor HELD; scenariosOf crosses every seed with the four kinds, seed by seed", () => {
    const [a, b] = A.SPENT.survey, note = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "brain", "SPACE_DOCTRINE_WIP.md"), "utf8");
    const sc = A.scenariosOf([7, 9]), K = ["bow", "beam", "stern", "swarm"];
    return { ok: Object.isFrozen(A.SPENT) && a === 9990061 && b === 9990072 && note.includes("throwaway space seeds 9990061-9990072") &&
        ![...A.DEV_SEEDS, ...A.HELD_SEEDS].some((s) => s >= a && s <= b) &&
        sc.length === 8 && sc.every((x, i) => x.seed === [7, 9][Math.floor(i / 4)] && x.kind === K[i % 4]) && A.scenariosOf([]).length === 0,
        detail: `survey ${a}-${b}; scenariosOf([7, 9]) ${sc.map((x) => x.seed + x.kind[0]).join(" ")}` };
});

for (const r of rows) console.log(`  ${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " -- " + r.detail : ""}`);
const red = rows.filter((r) => !r.ok).length;
console.log(`[signalCapStudy-selfcheck] ${red ? red + " of " + rows.length + " checks FAIL" : "all " + rows.length + " checks pass"}`);
process.exit(red ? 1 : 0);
