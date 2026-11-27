// WebGLEngine/tools/ship/strongGunnersStudy-selfcheck.mjs -- the gate of tools/ship/strongGunnersStudy.mjs and its command (the space doctrine's ROUND 3, brain/SPACE_DOCTRINE_WIP.md)
//
// Flies only gate seed 41 (space seeds 1-50 are the gates'). SABOTAGED 2026-11-26, each on a backup copy, restored after (red rows by name):
//   G1 green added to the presets: 2 red (1, 4). G2 HELD overlapping rock nav: 1 red (1). G3 the choice by strafe-seconds: 1 red (2). G4 a tie to the smaller cap: 1 red (2). G5 no floor: 2 red (3, 4).
//   G6 the sign test dropped: 1 red (3). G7 the difference's sign flipped: 3 red (3, 4, 5). G8 the bottom line on one preset: 1 red (4). G9 the first question's strafe arm on one preset: 1 red (5).
//   G10 V1 read on strafe-seconds: 1 red (4). G11 HELD flown without the cap committed: 1 red (8). G12 the misalignment check dropped: 1 red (3).
//   G13 the median clause dropped: 0 red -- EQUIVALENT and declared: the median is taken over the NON-TIED differences, so it is positive whenever the wins outnumber the losses (and negative in the
//   mirror); the clause, carried over from Round 1's rule, can never change a verdict the count has decided.
"use strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./strongGunnersStudy.mjs";
import * as S from "./spaceDoctrineStudy.mjs";
import * as RN from "./rockNavStudy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const rows = [];
const row = (name, fn) => { let ok = false, detail = ""; try { const r = fn(); ok = r === true || (r && r.ok === true); detail = r && r.detail ? r.detail : ""; } catch (e) { ok = false; detail = "threw: " + e.message; } rows.push({ name, ok, detail }); };
const inRange = (x, [a, b]) => x >= a && x <= b;

row("1 THE SETS: ace and perfect only; the grid holds 12 and caps above it; DEV and HELD are new (not the doctrine round's, not rock nav's 3101-4290, not the gates' 1-50); CAP_STRONG unset or on the grid", () => {
    const all = [...G.DEV_SEEDS, ...G.HELD_SEEDS], doctrine = [[1601, 1800], [1901, 1930], [2101, 2130], [2401, 2460]], rock = [...RN.DEV_SEEDS, ...RN.HELD_SEEDS, ...RN.DEV_B_SEEDS, ...RN.HELD_B_SEEDS, ...RN.DEV_C_SEEDS, ...RN.HELD_C_SEEDS, ...RN.DEV_D_SEEDS, ...RN.HELD_D_SEEDS, ...RN.DEV_E_SEEDS, ...RN.HELD_E_SEEDS, ...RN.DEV_F_SEEDS, ...RN.HELD_F_SEEDS];
    return JSON.stringify(G.PRESETS) === '["ace","perfect"]' && G.GRID.includes(12) && G.GRID.some((c) => c > 20) && G.FIRST_CAP === S.CAP_CHOSEN && G.DEV_SEEDS.length === 30 && G.HELD_SEEDS.length === 60
        && new Set(all).size === all.length && all.every((x) => x > 50 && !doctrine.some((r) => inRange(x, r)) && !rock.includes(x)) && (G.CAP_STRONG === null || G.GRID.includes(G.CAP_STRONG));
});
row("2 THE CHOICE: the grid cap with the highest mean R pooled over both presets; a tie goes to the larger cap", () => {
    const r = (cap, R) => ({ cap, R, strafeS: 1 });
    const a = G.chooseCap([r(12, 1), r(12, 3), r(20, 5), r(20, 5), r(30, 4), r(30, 4)], [12, 20, 30]), b = G.chooseCap([r(12, 2), r(20, 6), r(30, 6)], [12, 20, 30]);
    return { ok: a.cap === 20 && b.cap === 30 && a.means.find((m) => m.cap === 12).meanR === 2 && a.means.length === 3, detail: `${a.cap}, tie ${b.cap}` };
});
// synthetic HELD rows: n scenarios under each preset, arms D, cap and 12
const H = (n, f) => { const out = []; for (const preset of G.PRESETS) for (let i = 0; i < n; i++) for (const cap of ["D", 20, 12]) out.push({ seed: 5000 + i, kind: "bow", preset, cap, R: 0, strafeS: 1, damageOnShip: 0, passes: 1, t: 20, peakClosing: 30, ...f(preset, cap, i) }); return out; };
row("3 THE SIGN VERDICT: FLOOR under 20 non-tied pairs; CAP BETTER and DOCTRINE BETTER need the sign test (the median of the NON-TIED differences always follows the majority, so its clause adds nothing and is not claimed here); a split count is NO DIFFERENCE; misaligned arms are refused", () => {
    const vb = G.verdictOn(H(40, (p, c, i) => (c === 20 && i < 30 ? { R: 10 } : {})), "ace", 20, "R").verdict;
    const vd = G.verdictOn(H(40, (p, c, i) => (c === "D" && i < 30 ? { R: 10 } : {})), "ace", 20, "R").verdict;
    const vf = G.verdictOn(H(40, (p, c, i) => (c === 20 && i < 10 ? { R: 10 } : {})), "ace", 20, "R").verdict;
    const vm = G.verdictOn(H(40, (p, c, i) => (c === 20 && i < 24 ? { R: 1 } : c === "D" && i >= 24 && i < 31 ? { R: 50 } : {})), "ace", 20, "R");   // the cap wins 24 to 7 by +1 each against the doctrine's +50s: the count decides, not the sizes
    const vn = G.verdictOn(H(40, (p, c, i) => (c === 20 && i < 21 ? { R: 1 } : c === "D" && i >= 21 && i < 40 ? { R: 1 } : {})), "ace", 20, "R").verdict;
    let threw = false; try { G.verdictOn(H(4, () => ({})).filter((r) => !(r.cap === 20 && r.seed === 5000)), "ace", 20, "R"); } catch { threw = true; }
    return { ok: vb === "CAP BETTER" && vd === "DOCTRINE BETTER" && vf === "FLOOR" && vm.verdict === "CAP BETTER" && vn === "NO DIFFERENCE SHOWN" && threw, detail: [vb, vd, vf, vm.verdict, vn, threw].join(" / ") };
});
row("4 THE BOTTOM LINE: CAP BEATS (both presets) / THE DOCTRINE BEATS (either, named) / NO CAP SHOWN (the per-preset verdicts named)", () => {
    const both = G.readHeld(H(40, (p, c, i) => (c === 20 && i < 30 ? { R: 10 } : {})), 20).bottom;
    const one = G.readHeld(H(40, (p, c, i) => (p === "perfect" && c === "D" && i < 30 ? { R: 10 } : p === "ace" && c === 20 && i < 30 ? { R: 10 } : {})), 20).bottom;
    const none = G.readHeld(H(40, () => ({})), 20).bottom;
    return { ok: both === "CAP 20 BEATS THE DOCTRINE AGAINST STRONG GUNNERS" && one === "THE DOCTRINE BEATS CAP 20 AGAINST STRONG GUNNERS (perfect)" && none === "NO CAP SHOWN BETTER OR WORSE THAN THE DOCTRINE AGAINST STRONG GUNNERS (ace FLOOR, perfect FLOOR)", detail: [both, one, none].join(" / ") };
});
row("5 THE FIRST QUESTION (cap 12): YES when the doctrine is better on R under either preset, or the cap-12 fighters strafe less under BOTH; otherwise NOT SHOWN", () => {
    const byR = G.readHeld(H(40, (p, c, i) => (p === "ace" && c === "D" && i < 30 ? { R: 10 } : {})), 20).firstAnswer;
    const byS = G.readHeld(H(40, (p, c, i) => (c === 12 && i < 30 ? { strafeS: 0 } : {})), 20).firstAnswer;
    const oneS = G.readHeld(H(40, (p, c, i) => (p === "ace" && c === 12 && i < 30 ? { strafeS: 0 } : {})), 20).firstAnswer;
    return { ok: byR.startsWith("YES") && byS.startsWith("YES") && oneS === "NOT SHOWN", detail: [byR, byS, oneS].join(" / ") };
});
row("6 THE ARMS ARE spaceDoctrineStudy's, flown on a gate seed: D and a capped arm on the same fight, the cap applied with no thrust over it, the foe the arena's, the arms differing", () => {
    const d = S.flyOne({ seed: 41, kind: "bow", preset: "ace" }), c = S.flyOne({ seed: 41, kind: "bow", preset: "ace", cap: 20, probe: true });
    return { ok: d.cap === "D" && c.cap === 20 && c.capApplied && c.capApplied.overCap > 0 && c.capApplied.notCut === 0 && c.probe.mismatches === 0 && c.probe.calls > 0 && Number.isFinite(c.strafeS) && JSON.stringify(c) !== JSON.stringify(d) && G.devChecks === G.devChecks,
        detail: `D strafe ${d.strafeS.toFixed(1)} R ${d.R}; cap 20 strafe ${c.strafeS.toFixed(1)} R ${c.R}, ${c.capApplied.overCap} over` };
});
row("7 DEV'S CHECKS ARE ROUND 2's AT THE CHOSEN CAP", () => {
    const rs = [{ cap: "D", peakClosing: 31, over: true, t: 20 }, { cap: 20, peakClosing: 21, over: true, t: 20, probe: { mismatches: 0, nullFoe: 0, calls: 5 }, capApplied: { overCap: 3, notCut: 0 } }];
    return JSON.stringify(G.devChecks(rs, 20)) === JSON.stringify(S.devChecks2(rs, 20)) && G.devChecks(rs, 20).capApplied.ok === true && G.devChecks(rs, 30).capApplied.ok === false;
});
row("8 THE COMMAND: export-free; HELD refused before DEV passes, and refused while the library's cap is not DEV's choice; an unknown option refused; a part never flown twice", () => {
    const cmd = path.join(HERE, "strongGunnersStudyCmd.mjs"), src = fs.readFileSync(cmd, "utf8"), dir = fs.mkdtempSync(path.join(os.tmpdir(), "sg-"));
    const run = (...a) => spawnSync(process.execPath, [cmd, ...a, "--dir", dir], { encoding: "utf8" }).status;
    const noDev = run("held", "--part", "1/90");
    fs.writeFileSync(path.join(dir, "dev-report.json"), JSON.stringify({ allOk: true, cap: G.CAP_STRONG === 20 ? 25 : 20 }));
    const wrongCap = run("held", "--part", "1/90");
    fs.writeFileSync(path.join(dir, "dev-1of1.json"), "{}"); const twice = run("dev", "--part", "1/1");
    const unknown = spawnSync(process.execPath, [cmd, "dev", "--bogus"], { encoding: "utf8" }).status;
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: !/^export\s/m.test(src) && noDev === 2 && wrongCap === 2 && twice === 2 && unknown === 2, detail: `no DEV ${noDev}, wrong cap ${wrongCap}, twice ${twice}, unknown ${unknown}` };
});
row("9 reportLines NAMES THE GRID, THE SETS AND THE CAP'S STATE", () => { const l = G.reportLines().join(" "); return l.includes(G.GRID.join(", ")) && l.includes(String(G.HELD_SEEDS[0])) && l.includes(G.CAP_STRONG === null ? "not yet chosen" : String(G.CAP_STRONG)); });

for (const r of rows) console.log(`  ${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " -- " + r.detail : ""}`);
const red = rows.filter((r) => !r.ok).length;
console.log(`[strongGunnersStudy-selfcheck] ${red ? red + " of " + rows.length + " checks FAIL" : "all " + rows.length + " checks pass"}`);
process.exit(red ? 1 : 0);
