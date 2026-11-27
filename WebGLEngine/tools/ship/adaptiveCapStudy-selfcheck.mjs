// WebGLEngine/tools/ship/adaptiveCapStudy-selfcheck.mjs -- the gate of tools/ship/adaptiveCapStudy.mjs and its command (the space doctrine's ROUND 4, brain/SPACE_DOCTRINE_WIP.md)
//
// Flies only gate seeds (space seeds 1-50). SABOTAGED 2026-11-26, each on a backup copy, restored after (red rows by name):
//   H1 the latch without the hull condition: 2 red (2, 4). H2 the latch before any loss: 3 red (2, 3, 4). H3 the latch never fires: 1 red (3). H4 the latch raises nothing: 2 red (3, 4).
//   H5 the cap check reading the wrong cap: 1 red (3). H6 the weak side read against FIXED20: FIRST PASS 0 red (row 6's fixture had FIXED20 tied with FIXED12 under regular, so both readings
//   agreed); the fixture now gives FIXED20 the same price, then 1 red (6). H7 the strong side without its win over 12: 1 red (6). H8 no floor: 1 red (5). H9 the sign test dropped: FIRST PASS
//   0 red (no fixture had more wins than losses short of significance); row 5 now holds a 12-to-9 split to NO DIFFERENCE, then 1 red (5). H10 the unlatched-equals-FIXED12 check dropped:
//   1 red (7). H11 the HELD guard dropped: 1 red (8). H12 HELD overlapping Round 3's HELD: 1 red (1). H13 K raised to 2: 3 red (1, 2, 7).
"use strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as A from "./adaptiveCapStudy.mjs";
import * as G from "./strongGunnersStudy.mjs";
import * as RN from "./rockNavStudy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const rows = [];
const row = (name, fn) => { let ok = false, detail = ""; try { const r = fn(); ok = r === true || (r && r.ok === true); detail = r && r.detail ? r.detail : ""; } catch (e) { ok = false; detail = "threw: " + e.message; } rows.push({ name, ok, detail }); };
const inRange = (x, [a, b]) => x >= a && x <= b;

row("1 THE SETS AND THE RULE'S CONSTANTS: four presets split weak and strong; caps 12 and 20; K 1; DEV and HELD new (not Round 3's, not rock nav's, not the doctrine round's, not the gates')", () => {
    const all = [...A.DEV_SEEDS, ...A.HELD_SEEDS], used = [...G.DEV_SEEDS, ...G.HELD_SEEDS, ...RN.DEV_SEEDS, ...RN.HELD_SEEDS, ...RN.DEV_F_SEEDS, ...RN.HELD_F_SEEDS, ...RN.DEV_E_SEEDS, ...RN.HELD_E_SEEDS];
    return JSON.stringify(A.WEAK) === '["regular","green"]' && JSON.stringify(A.STRONG) === '["ace","perfect"]' && A.LOW === 12 && A.HIGH === 20 && A.K === 1 && A.DEV_SEEDS.length === 30 && A.HELD_SEEDS.length === 60
        && new Set(all).size === all.length && all.every((x) => x > 50 && !used.includes(x) && ![[1601, 1800], [1901, 1930], [2101, 2130], [2401, 2460]].some((r) => inRange(x, r)));
});
row("2 THE LATCH RULE: at least K fighters lost AND the ship undamaged; not before the first loss; not once the ship is hit", () => A.shouldLatch(1, 1500, 1500) && A.shouldLatch(3, 1500, 1500) && !A.shouldLatch(0, 1500, 1500) && !A.shouldLatch(1, 1499, 1500) && !A.shouldLatch(2, 1400, 1500));
// real fights on a gate seed
const F = {}; for (const p of ["ace", "regular"]) for (const arm of A.ARMS) F[`${p} ${arm}`] = (() => { try { return A.flyOne({ seed: 43, kind: "bow", preset: p, arm }); } catch (e) { return { error: e.message }; } })();
row("3 THE ARMS FLY: the cap holds in every arm (no decision at or over the cap in force with thrust); FIXED arms never latch; ADAPT latches under ace by the rule; the arms differ", () => {
    const all = Object.values(F), ad = F["ace ADAPT"];
    return { ok: all.every((r) => !r.error && r.notCut === 0 && r.overCap > 0) && ["FIXED12", "FIXED20"].every((a) => F[`ace ${a}`].latchedAt === null && F[`regular ${a}`].latchedAt === null)
        && ad.latchedAt !== null && ad.latch.lost >= A.K && ad.latch.shipHp === ad.latch.shipHpMax && F["regular FIXED12"].R !== F["regular FIXED20"].R,
        detail: Object.entries(F).map(([k, r]) => `${k} R ${r.R} latch ${r.latchedAt}`).join("; ") };
});
row("4 BEFORE ITS LATCH ADAPT IS FIXED12, AND AFTER IT FIXED20'S RULE: an unlatched ADAPT fight on a gate seed equals FIXED12's, fight for fight, and the cap in force switches from LOW to HIGH at the latch", () => {
    const src = fs.readFileSync(new URL("./adaptiveCapStudy.mjs", import.meta.url), "utf8");
    // a fight in which ADAPT never latches (the ship hit before the first loss) must be FIXED12's: the gate looks for one on its own seeds
    const seedsTried = [], found = [];
    for (const seed of [41, 42, 44, 45, 46]) { const a = A.flyOne({ seed, kind: "beam", preset: "regular", arm: "ADAPT" }); seedsTried.push(seed); if (a.latchedAt === null) { const f = A.flyOne({ seed, kind: "beam", preset: "regular", arm: "FIXED12" }); found.push(f.R === a.R && f.t === a.t && f.damageOnShip === a.damageOnShip); if (found.length >= 2) break; } }
    return { ok: found.length >= 1 && found.every(Boolean) && /latchedAt === null \? LOW : HIGH/.test(src), detail: `unlatched fights compared ${found.length} (seeds tried ${seedsTried.join(",")})` };
});
// synthetic HELD rows
const H = (n, f) => { const out = []; for (const preset of A.PRESETS) for (let i = 0; i < n; i++) for (const arm of A.ARMS) out.push({ seed: 9000 + i, kind: "bow", preset, arm, R: 100, damageOnShip: 100, shipDead: false, t: 30, over: true, latchedAt: null, latch: null, overCap: 1, notCut: 0, decisions: 10, ...f(preset, arm, i) }); return out; };
const strongOK = (p, a, i) => (A.STRONG.includes(p) && a !== "FIXED12" && i < 30 ? { R: 200 } : {});   // ADAPT and FIXED20 both beat FIXED12 on the strong side
row("5 THE VERDICT BY PAIR: <A> BETTER / <B> BETTER / FLOOR / NO DIFFERENCE; misaligned arms refused", () => {
    const rs = H(40, strongOK), a = A.verdictOf(rs, "ace", "ADAPT", "FIXED12").verdict, b = A.verdictOf(rs, "ace", "FIXED12", "ADAPT").verdict, f = A.verdictOf(rs, "regular", "ADAPT", "FIXED12").verdict;
    const nd = A.verdictOf(H(40, (p, arm, i) => (arm === "ADAPT" ? { R: i % 2 ? 150 : 50 } : {})), "ace", "ADAPT", "FIXED12").verdict;
    const near = A.verdictOf(H(40, (p, arm, i) => (arm === "ADAPT" && i < 12 ? { R: 150 } : arm === "ADAPT" && i < 21 ? { R: 50 } : {})), "ace", "ADAPT", "FIXED12").verdict;   // 12 to 9: more wins, not significant
    let threw = false; try { A.verdictOf(H(4, () => ({})).filter((r) => !(r.arm === "ADAPT" && r.seed === 9000)), "ace", "ADAPT", "FIXED12"); } catch { threw = true; }
    return { ok: a === "ADAPT BETTER" && b === "ADAPT BETTER" && f === "FLOOR" && nd === "NO DIFFERENCE SHOWN" && near === "NO DIFFERENCE SHOWN" && threw, detail: [a, b, f, nd, near].join(" / ") };
});
row("6 THE BOTTOM LINE: HAS BOTH / PAYS ON THE WEAK SIDE / MISSES THE STRONG SIDE / HAS NEITHER, each naming its presets", () => {
    const both = A.readHeld(H(40, strongOK)).bottom;
    // the weak side is ADAPT against FIXED12 ONLY: here FIXED20 pays the same under regular, so ADAPT vs FIXED20 shows nothing and only the right reading finds the price
    const weak = A.readHeld(H(40, (p, a, i) => ({ ...strongOK(p, a, i), ...(p === "regular" && a !== "FIXED12" && i < 30 ? { R: 50 } : {}) }))).bottom;
    const strong = A.readHeld(H(40, (p, a, i) => (p === "perfect" && a === "FIXED20" && i < 30 ? { R: 300 } : strongOK(p, a, i)))).bottom;   // FIXED20 beats ADAPT under perfect
    const neither = A.readHeld(H(40, (p, a, i) => (p === "green" && a === "ADAPT" && i < 30 ? { R: 50 } : {}))).bottom;   // no strong-side win at all, and green pays
    return { ok: both === "THE ADAPTIVE CAP HAS BOTH" && weak === "THE ADAPTIVE CAP PAYS ON THE WEAK SIDE (regular)" && strong === "THE ADAPTIVE CAP MISSES THE STRONG SIDE (perfect)" && neither === "THE ADAPTIVE CAP HAS NEITHER (green, ace, perfect)",
        detail: [both, weak, strong, neither].join(" / ") };
});
row("7 DEV'S CHECKS PASS ON GOOD ROWS AND EACH FAILS ON ITS OWN FAULT (no latch under a strong preset; a latch against the rule; thrust over the cap; an unlatched ADAPT fight unlike FIXED12's; a fight that does not end)", () => {
    const good = H(4, (p, a) => (a === "ADAPT" && A.STRONG.includes(p) ? { latchedAt: 30, latch: { lost: 1, shipHp: 1500, shipHpMax: 1500 } } : {})), c0 = A.devChecks(good);
    const fault = (k, edit) => { const rs = JSON.parse(JSON.stringify(good)); edit(rs); return A.devChecks(rs)[k].ok; };
    const f = [fault("latchFires", (rs) => rs.filter((r) => r.preset === "perfect" && r.arm === "ADAPT").forEach((r) => { r.latchedAt = null; r.latch = null; })),
        fault("latchFires", (rs) => { const r = rs.find((x) => x.arm === "ADAPT" && x.latch); r.latch.shipHp = 1400; }), fault("capApplied", (rs) => { rs[0].notCut = 1; }),
        fault("capApplied", (rs) => { rs.find((x) => x.arm === "ADAPT" && x.latchedAt === null).R = 5; }), fault("allEnd", (rs) => { rs[1].over = false; })];
    return { ok: Object.values(c0).every((x) => x.ok) && f.every((x) => x === false), detail: `good ${Object.values(c0).map((x) => x.ok).join(",")}; faults pass: ${f.join(",")}` };
});
row("8 THE COMMAND: export-free; HELD refused before DEV passes; an unknown option refused; a part never flown twice", () => {
    const cmd = path.join(HERE, "adaptiveCapStudyCmd.mjs"), src = fs.readFileSync(cmd, "utf8"), dir = fs.mkdtempSync(path.join(os.tmpdir(), "ac-"));
    const run = (...a) => spawnSync(process.execPath, [cmd, ...a, "--dir", dir], { encoding: "utf8" }).status;
    const noDev = run("held", "--part", "1/90"); fs.writeFileSync(path.join(dir, "dev-1of1.json"), "{}"); const twice = run("dev", "--part", "1/1");
    const unknown = spawnSync(process.execPath, [cmd, "dev", "--bogus"], { encoding: "utf8" }).status; fs.rmSync(dir, { recursive: true, force: true });
    return { ok: !/^export\s/m.test(src) && noDev === 2 && twice === 2 && unknown === 2, detail: `no DEV ${noDev}, twice ${twice}, unknown ${unknown}` };
});
row("9 reportLines NAMES K AND THE SETS", () => { const l = A.reportLines().join(" "); return l.includes(`K ${A.K}`) && l.includes(String(A.HELD_SEEDS[0])); });

for (const r of rows) console.log(`  ${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " -- " + r.detail : ""}`);
const red = rows.filter((r) => !r.ok).length;
console.log(`[adaptiveCapStudy-selfcheck] ${red ? red + " of " + rows.length + " checks FAIL" : "all " + rows.length + " checks pass"}`);
process.exit(red ? 1 : 0);
