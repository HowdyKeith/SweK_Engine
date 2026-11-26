// WebGLEngine/tools/ship/rockNavStudy-selfcheck.mjs -- the gate of tools/ship/rockNavStudy.mjs and its command (brain/ROCK_NAV_WIP.md)
//
// Flies only the gate seeds (space seeds 41-50). SABOTAGED 2026-11-25, each on a backup copy, restored after (red rows by name):
//   S1 the pilot never reaches the build: 1 red (4).  S2 the hand-back compared outside, not inside: 1 red (4).  S3 combat strikes count every strike: 1 red (1).
//   S4 V2's sign flipped: 1 red (7).  S5 the bottom line ignores V2: 1 red (7).  S6 the verdict drops the totals: 1 red (6).  S7 no floor: 2 red (6, 7).
//   S8 the field key ignores the rocks: 1 red (2).  S9 same field always passes: 1 red (9).  S10 arrival read before the strike: 1 red (1).
//   S11 HELD overlaps Round B: 1 red (10).  S12 the command flies HELD without DEV: 1 red (11).
//   S13 the field at the origin with half the goal radius: FIRST PASS 0 red (nothing read the field's goal); row 4b added, then 1 red (4b).
//   S14 the field's origin offset by one unit: 1 red (4b).
// ROUND B (rows 12-15): B1 arm L built without the lane: 1 red (12). B2 V1's sign flipped: 1 red (13; the first pattern also matched Round A's
//   reported line and was refused by the harness, then re-run on Round B's own). B3 the bottom line ignores V2: 1 red (13). B4 the lane check ignores N:
//   1 red (14). B5 Round B's HELD opened by Round A's DEV report: 1 red (15). B6 the verdicts not renamed: 1 red (13).
// ROUND C (rows 16-19): C1 arm F built without following: 1 red (16). C2 the ship recorded after the step: 1 red (16). C3 V1 reads the strikes after
//   arriving: 1 red (17). C4 the bottom line ignores L BETTER: 1 red (17). C5 the follow check ignores L's single build: 1 red (18). C6 Round C's HELD opened by
//   Round B's DEV report: 1 red (19). C7 the verdicts not renamed: 1 red (17). C8 aims checked against the start field only: FIRST PASS 0 red (nothing
//   counted the builds checked); row 16 now requires fieldsChecked = builds, then 1 red (16). C9 off-grid rocks held to the grid: FIRST PASS 0 red (the
//   gate's fight puts no rock off a grid); row 16b added on a field with a rock beyond its cube, then 1 red (16b). C10 the off-grid count dropped: 1 red (16b).
// ROUND D (rows 20-23): D1 the cap never applied: 1 red (20). D2 the cap applied in L too: 1 red (20). D3 LC flown without the lane: 1 red (20). D4 the cap at 15: 1 red (20).
//   D5 V1 reads all strikes: 1 red (21). D6 V2's sign flipped: 1 red (21). D7 the bottom line ignores V2: 1 red (21). D8 the cap check ignores L: 1 red (22).
//   D9 Round D's HELD opened by Round C's DEV report: 1 red (23). D10 the verdicts not renamed: 1 red (21). D11 HELD D overlapping HELD C: 1 red (23).
// ROUND E (rows 24-27): E5 FX not following: 1 red (24). E6 FX's START field without the lane: 0 red -- EQUIVALENT and declared: FX never flies its start field (it flies the following
//   field), so the mutant changes nothing FX does; E6b, the following field without the lane, is the real one: 1 red (24, after an allLane row was added). E7 builds without a goal never
//   counted: FIRST PASS 0 red (no gate fight has a goalless build); goallessBuilds lifted out and row 24b added on a dead field, then 1 red (24b). E8 the bottom line not of the fixed field:
//   1 red (25). E9 check 6 ignores the empty-lane count: 1 red (26). E10 Round E's HELD opened by Round D's DEV report: 1 red (27). E11 the empty-lane builds not reported: 1 red (25).
"use strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as S from "./rockNavStudy.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as SA from "../../brain/spaceArena.mjs";
import * as NV from "../../brain/spaceNav.mjs";
import { rOf } from "./spaceDoctrineStudy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const rows = [];
const row = (name, fn) => { let ok = false, detail = ""; try { const r = fn(); ok = r === true || (r && r.ok === true); detail = r && r.detail ? r.detail : ""; } catch (e) { ok = false; detail = "threw: " + e.message; } rows.push({ name, ok, detail }); };
const inRange = (x, [a, b]) => x >= a && x <= b;

const fly = (seed, kind, arm) => { try { return S.flyOne({ seed, kind, arm }); } catch (e) { return { error: e.message }; } };
const D41 = fly(41, "bow", "D"), N41 = fly(41, "bow", "N"), D42 = fly(42, "swarm", "D"), N42 = fly(42, "swarm", "N");
const real = [D41, N41, D42, N42];

row("1 EVERY FIGHTER IS ACCOUNTED FOR ONCE: approach struck + shot + arrived (+ still out) = 8; struck = approach + combat; one arrival time per arrival", () => {
    const bad = real.filter((r) => r.error || r.approachStruck + r.approachShot + r.arrived > 8 || r.struck !== r.approachStruck + r.combatStruck || r.arrivalT.length !== r.arrived || r.combatStruck > r.arrived);
    return { ok: bad.length === 0, detail: real.map((r) => `${r.arm} ${r.approachStruck}/${r.approachShot}/${r.arrived}/${r.combatStruck}`).join("; ") };
});
row("2 BOTH ARMS FLY THE SAME FIELD AND THE SAME STARTS (fieldKey), AND THE KEY SEES THE ROCKS", () => {
    const a = BF.build(41, "bow", { gunners: S.GUNNERS, rocks: S.ROCKS }).arena, b = BF.build(41, "bow", { gunners: S.GUNNERS, rocks: 0 }).arena;
    return { ok: D41.fieldKey === N41.fieldKey && D42.fieldKey === N42.fieldKey && D41.fieldKey !== D42.fieldKey && S.fieldKey(a) !== S.fieldKey(b), detail: `${D41.fieldKey} ${N41.fieldKey}` };
});
row("3 ARM D IS THE PLAIN FIGHT: stepping it here changes nothing against battleshipFight + runSpaceArena", () => {
    const ok = [[41, "bow", D41], [42, "swarm", D42]].every(([seed, kind, r]) => {
        const a = BF.build(seed, kind, { gunners: S.GUNNERS, rocks: S.ROCKS }).arena; SA.runSpaceArena(a); const t = BF.tally(a);
        return rOf(t) === r.R && t.damageOnShip === r.damageOnShip && a.crafts.filter((c) => c.status === "struck").length === r.struck && Math.abs(a.i * a.dt - r.t) < 1e-9;
    });
    return ok;
});
row("4 ARM N FLIES THE LAYER: aimed calls > 0, the hand-back exact, no aim in a blocked cell, every rock centre blocked", () => {
    const P = [N41.probe, N42.probe];
    return { ok: P.every((p) => p && p.aimed > 0 && p.handBack > 0 && p.handBackMismatch === 0 && p.aimBlocked === 0 && p.rockCentresBlocked === true), detail: P.map((p) => p && `aimed ${p.aimed}, hand-back ${p.handBack}, mismatch ${p.handBackMismatch}, near ${p.near}, fallback ${p.fallback}`).join("; ") };
});
row("4b THE FIELD IS BUILT ROUND THE SHIP'S START, TOWARD THE STRAFE SPHERE (goal radius SA.STRAFE_RANGE)", () => {
    const ok = [[41, "bow", N41], [42, "swarm", N42]].every(([seed, kind, r]) => {
        const s = BF.build(seed, kind, { gunners: S.GUNNERS, rocks: S.ROCKS }).arena.crafts.find((c) => c.kind === "capital").body.pos;
        return r.probe && r.probe.field && r.probe.field.goalR === SA.STRAFE_RANGE && JSON.stringify(r.probe.field.origin) === JSON.stringify([...s]);
    });
    return { ok, detail: N41.probe && N41.probe.field ? `origin ${N41.probe.field.origin.join(",")}, goal ${N41.probe.field.goalR}` : "no field recorded" };
});
row("5 THE ARMS DIFFER (the pilot reaches the fight)", () => JSON.stringify({ ...N41, probe: 0 }) !== JSON.stringify({ ...D41, probe: 0 }));

// synthetic rows for the verdict code
const syn = (arm, i, o) => ({ seed: 1000 + i, kind: "bow", arm, approachStruck: 0, approachShot: 0, arrived: 8, combatStruck: 0, struck: 0, arrivalT: [10], R: 0, damageOnShip: 0, shipDead: false, over: true, t: 30, drift: 0, fieldKey: "k" + i, ...(arm === "N" ? { probe: { calls: 10, aimed: 5, fallback: 0, near: 0, handBack: 5, handBackMismatch: 0, aimBlocked: 0, rockCentresBlocked: true } } : {}), ...o });
const setOf = (n, fD, fN) => Array.from({ length: n }, (_, i) => [syn("D", i, fD(i)), syn("N", i, fN(i))]).flat();
row("6 THE SIGN VERDICT: FLOOR under 20, LAYER BETTER and DOCTRINE BETTER need the sign test AND the totals, else NO DIFFERENCE", () => {
    const w = (wins, losses) => [...Array(wins).fill(1), ...Array(losses).fill(-1)];
    const a = S.signVerdict(w(15, 0), true, false).verdict, b = S.signVerdict(w(30, 5), true, false).verdict, c = S.signVerdict(w(5, 30), false, true).verdict;
    const d = S.signVerdict(w(30, 5), false, false).verdict, e = S.signVerdict(w(20, 18), true, false).verdict;
    return { ok: a === "FLOOR" && b === "LAYER BETTER" && c === "DOCTRINE BETTER" && d === "NO DIFFERENCE SHOWN" && e === "NO DIFFERENCE SHOWN", detail: [a, b, c, d, e].join(" / ") };
});
row("7 THE BOTTOM LINE: WINS THE APPROACH / AVOIDS ROCKS BY NOT ARRIVING / DOES NOT WIN", () => {
    const wins = S.readHeld(setOf(40, (i) => ({ approachStruck: i < 30 ? 1 : 0 }), () => ({}))).bottom;
    const hides = S.readHeld(setOf(40, (i) => ({ approachStruck: i < 30 ? 1 : 0 }), (i) => ({ arrived: i < 30 ? 5 : 8 }))).bottom;
    const not = S.readHeld(setOf(40, () => ({}), () => ({}))).bottom;
    return { ok: wins === "THE LAYER WINS THE APPROACH" && hides === "THE LAYER AVOIDS ROCKS BY NOT ARRIVING" && not === "THE LAYER DOES NOT WIN THE APPROACH (FLOOR)", detail: [wins, hides, not].join(" / ") };
});
row("8 PAIRS ARE (seed, kind) IN ORDER: misaligned arms are refused", () => {
    try { S.pairsOf([syn("N", 1, {})], [syn("D", 2, {})]); return false; } catch { return true; }
});
row("9 DEV'S CHECKS PASS ON GOOD ROWS AND EACH FAILS ON ITS OWN FAULT", () => {
    const good = setOf(4, () => ({}), () => ({})), c0 = S.devChecks(good);
    const fault = (k, edit) => { const rs = JSON.parse(JSON.stringify(good)); edit(rs); return S.devChecks(rs)[k].ok; };
    const okAll = Object.values(c0).every((x) => x.ok);
    const f1 = fault("sameField", (rs) => { rs[1].fieldKey = "other"; }), f2 = fault("steers", (rs) => rs.filter((r) => r.arm === "N").forEach((r) => { r.probe.aimed = 0; }));
    const f3 = fault("handBack", (rs) => { rs[1].probe.handBackMismatch = 1; }), f4 = fault("fieldSound", (rs) => { rs[1].probe.aimBlocked = 1; }), f4b = fault("fieldSound", (rs) => { rs[3].probe.rockCentresBlocked = false; });
    const f5 = fault("allEnd", (rs) => { rs[0].t = 121; });
    return { ok: okAll && !f1 && !f2 && !f3 && !f4 && !f4b && !f5, detail: `good ${okAll}; faults pass: ${[f1, f2, f3, f4, f4b, f5].join(",")}` };
});
row("10 THE SETS ARE DISJOINT: DEV, HELD, Round B's reservation, the gate seeds, and the space-doctrine round's sets", () => {
    const B = [...Array(S.RESERVED_B.dev[1] - S.RESERVED_B.dev[0] + 1)].map((_, i) => S.RESERVED_B.dev[0] + i).concat([...Array(S.RESERVED_B.held[1] - S.RESERVED_B.held[0] + 1)].map((_, i) => S.RESERVED_B.held[0] + i));
    const doctrine = [[1901, 1930], [2101, 2130], [2401, 2460]], all = [...S.DEV_SEEDS, ...S.HELD_SEEDS];
    return new Set(all).size === all.length && all.every((x) => !B.includes(x) && !inRange(x, S.SPENT.gates) && !doctrine.some((r) => inRange(x, r))) && S.DEV_SEEDS.length === 30 && S.HELD_SEEDS.length === 90;
});
row("11 THE COMMAND: export-free, refuses HELD before DEV passes, refuses a part flown twice, refuses an unknown option", () => {
    const cmd = path.join(HERE, "rockNavStudyCmd.mjs"), src = fs.readFileSync(cmd, "utf8");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rocknav-")), run = (...a) => spawnSync(process.execPath, [cmd, ...a, "--dir", dir], { encoding: "utf8" }).status;
    const held = run("held", "--part", "1/90");
    fs.writeFileSync(path.join(dir, "dev-1of1.json"), "{}"); const twice = run("dev", "--part", "1/1");
    const unknown = spawnSync(process.execPath, [cmd, "dev", "--bogus"], { encoding: "utf8" }).status;
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: !/^export\s/m.test(src) && held === 2 && twice === 2 && unknown === 2, detail: `held ${held}, twice ${twice}, unknown ${unknown}` };
});

// ROUND B: arm L (the clear lane) against N
const L41 = fly(41, "bow", "L");
row("12 ARM L FLIES THE LANE FIELD, N THE PLAIN ONE: L's goal cells all have a clear line, N's do not, same rocks and starts", () => {
    const l = L41.probe && L41.probe.field, n = N41.probe && N41.probe.field;
    return { ok: !!l && !!n && l.lane === true && l.goalCells > 0 && l.goalBlockedLine === 0 && n.lane === false && n.goalBlockedLine > 0 && L41.fieldKey === N41.fieldKey && L41.probe.handBackMismatch === 0,
        detail: l && n ? `L ${l.goalCells} goal cells (${l.goalBlockedLine} blocked); N ${n.goalCells} (${n.goalBlockedLine} blocked)` : "no field" };
});
const synB = (arm, i, o) => ({ ...syn(arm === "L" ? "N" : arm, i, {}), arm, probe: { calls: 10, aimed: 5, fallback: 0, near: 0, handBack: 5, handBackMismatch: 0, aimBlocked: 0, rockCentresBlocked: true, field: { lane: arm === "L", goalCells: 100, goalBlockedLine: arm === "L" ? 0 : 7 } }, ...o });
const setB = (n, fN, fL) => Array.from({ length: n }, (_, i) => [synB("N", i, fN(i)), synB("L", i, fL(i))]).flat();
row("13 ROUND B'S BOTTOM LINE: WINS THE STRAFE / SAVES FIGHTERS AND HURTS THE SHIP LESS / DOES NOT WIN", () => {
    const wins = S.readHeldB(setB(40, (i) => ({ combatStruck: i < 30 ? 1 : 0, struck: i < 30 ? 1 : 0 }), () => ({}))).bottom;
    const less = S.readHeldB(setB(40, (i) => ({ combatStruck: i < 30 ? 1 : 0, damageOnShip: 100 }), () => ({ damageOnShip: 50 }))).bottom;
    const not = S.readHeldB(setB(40, () => ({}), () => ({}))).bottom;
    const nb = S.readHeldB(setB(40, () => ({}), (i) => ({ combatStruck: i < 30 ? 1 : 0 }))).v1.verdict;
    return { ok: wins === "THE LANE WINS THE STRAFE" && less === "THE LANE SAVES FIGHTERS AND HURTS THE SHIP LESS" && not === "THE LANE DOES NOT WIN THE STRAFE (FLOOR)" && nb === "N BETTER", detail: [wins, less, not, nb].join(" / ") };
});
row("14 ROUND B'S DEV CHECKS PASS ON GOOD ROWS AND EACH FAILS ON ITS OWN FAULT", () => {
    const good = setB(4, () => ({}), () => ({})), c0 = S.devChecksB(good);
    const fault = (k, edit) => { const rs = JSON.parse(JSON.stringify(good)); edit(rs); return S.devChecksB(rs)[k].ok; };
    const f = [fault("sameField", (rs) => { rs[1].fieldKey = "x"; }), fault("handBack", (rs) => { rs[0].probe.handBackMismatch = 1; }),
        fault("laneSound", (rs) => { rs[1].probe.field.goalBlockedLine = 1; }), fault("laneSound", (rs) => rs.filter((r) => r.arm === "N").forEach((r) => { r.probe.field.goalBlockedLine = 0; })),
        fault("laneSound", (rs) => { rs[1].probe.field.lane = false; }), fault("fieldSound", (rs) => { rs[0].probe.aimBlocked = 1; }), fault("allEnd", (rs) => { rs[2].over = false; })];
    return { ok: Object.values(c0).every((x) => x.ok) && f.every((x) => x === false), detail: `faults pass: ${f.join(",")}` };
});
row("15 THE COMMAND REFUSES ROUND B'S HELD BEFORE ITS DEV PASSES, AND THE ROUND B SETS ARE THE RESERVED ONES", () => {
    const cmd = path.join(HERE, "rockNavStudyCmd.mjs"), dir = fs.mkdtempSync(path.join(os.tmpdir(), "rocknavb-"));
    fs.writeFileSync(path.join(dir, "dev-report.json"), JSON.stringify({ allOk: true }));   // Round A's pass must not open Round B
    const st = spawnSync(process.execPath, [cmd, "heldB", "--part", "1/90", "--dir", dir], { encoding: "utf8" }).status;
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: st === 2 && S.DEV_B_SEEDS[0] === 3301 && S.DEV_B_SEEDS.length === 30 && S.HELD_B_SEEDS[0] === 3401 && S.HELD_B_SEEDS.length === 90, detail: `heldB exit ${st}` };
});

// ROUND C: arm F (the field that follows the ship) against L
const F41 = fly(41, "bow", "F"), L41c = L41;
row("16 ARM F FOLLOWS THE SHIP: at least 2 builds, every one centred on the ship at its tick, the hand-back exact, every build sound, the same field as L", () => {
    const p = F41.probe;
    return { ok: !!p && p.builds >= 2 && p.fieldsChecked === p.builds && p.buildOriginDev === 0 && p.handBackMismatch === 0 && p.aimBlocked === 0 && p.rockCentresBlockedAll === true && F41.fieldKey === L41c.fieldKey && L41c.probe.builds === 1,
        detail: p ? `${p.builds} builds over ${F41.t.toFixed(1)} s (${p.fieldsChecked} checked, ${p.rocksOffGrid} rock-builds off the grid), worst distance ${p.buildOriginDev}` : "no probe" };
});
row("16b CHECK 4 HOLDS THE ROCKS INSIDE EACH BUILD'S GRID AND COUNTS, NOT FAILS, THE ROCKS OUTSIDE IT", () => {
    const rocks = [{ pos: [60, 0, 0], radius: 8 }, { pos: [400, 0, 0], radius: 8 }];   // the grid is +-160: the second rock is off it
    const G = NV.buildField(rocks, [0, 0, 0], 40, { cell: 16, half: 160, margin: 4 }), unblocked = { ...G, blocked: new Uint8Array(G.blocked.length) };
    const a = S.rockCentresSound([G], rocks), b = S.rockCentresSound([G, unblocked], rocks), c = S.rockCentresSound([], rocks);
    return { ok: a.ok === true && a.offGrid === 1 && b.ok === false && c.ok === false, detail: `in-grid ok ${a.ok}, off-grid ${a.offGrid}, an unblocked build ok ${b.ok}` };
});
const synC = (arm, i, o) => ({ ...syn("N", i, {}), arm, probe: { calls: 10, aimed: 5, fallback: 0, near: 0, handBack: 5, handBackMismatch: 0, aimBlocked: 0, rockCentresBlocked: true, rockCentresBlockedAll: true, builds: arm === "F" ? 3 : 1, buildOriginDev: arm === "F" ? 0 : undefined }, ...o });
const setC = (n, fL, fF) => Array.from({ length: n }, (_, i) => [synC("L", i, fL(i)), synC("F", i, fF(i))]).flat();
row("17 ROUND C'S BOTTOM LINE (V1 reads ALL strikes): WINS / SAVES FIGHTERS AND HURTS THE SHIP LESS / LOSES MORE FIGHTERS / DOES NOT WIN", () => {
    const wins = S.readHeldC(setC(40, (i) => ({ struck: i < 30 ? 1 : 0 }), () => ({}))).bottom;
    const less = S.readHeldC(setC(40, (i) => ({ struck: i < 30 ? 1 : 0, damageOnShip: 100 }), () => ({ damageOnShip: 50 }))).bottom;
    const loses = S.readHeldC(setC(40, () => ({}), (i) => ({ struck: i < 30 ? 1 : 0 }))).bottom;
    const combatOnly = S.readHeldC(setC(40, (i) => ({ combatStruck: i < 30 ? 1 : 0 }), () => ({}))).bottom;   // struck unchanged: V1 must not move
    return { ok: wins === "THE FOLLOWING FIELD WINS" && less === "THE FOLLOWING FIELD SAVES FIGHTERS AND HURTS THE SHIP LESS" && loses === "THE FOLLOWING FIELD LOSES MORE FIGHTERS TO THE ROCKS" && combatOnly === "THE FOLLOWING FIELD DOES NOT WIN (FLOOR)",
        detail: [wins, less, loses, combatOnly].join(" / ") };
});
row("18 ROUND C'S DEV CHECKS PASS ON GOOD ROWS AND EACH FAILS ON ITS OWN FAULT", () => {
    const good = setC(4, () => ({}), () => ({})), c0 = S.devChecksC(good);
    const fault = (k, edit) => { const rs = JSON.parse(JSON.stringify(good)); edit(rs); return S.devChecksC(rs)[k].ok; };
    const f = [fault("sameField", (rs) => { rs[1].fieldKey = "x"; }), fault("handBack", (rs) => { rs[1].probe.handBackMismatch = 1; }),
        fault("follows", (rs) => { rs[1].probe.builds = 1; }), fault("follows", (rs) => { rs[1].probe.buildOriginDev = 0.5; }), fault("follows", (rs) => { rs[0].probe.builds = 2; }),
        fault("fieldSound", (rs) => { rs[1].probe.rockCentresBlockedAll = false; }), fault("fieldSound", (rs) => { rs[0].probe.aimBlocked = 1; }), fault("allEnd", (rs) => { rs[3].t = 200; })];
    return { ok: Object.values(c0).every((x) => x.ok) && f.every((x) => x === false), detail: `faults pass: ${f.join(",")}` };
});
row("19 THE COMMAND REFUSES ROUND C'S HELD BEFORE ITS DEV PASSES; ROUND C'S SETS ARE NEW", () => {
    const cmd = path.join(HERE, "rockNavStudyCmd.mjs"), dir = fs.mkdtempSync(path.join(os.tmpdir(), "rocknavc-"));
    fs.writeFileSync(path.join(dir, "devB-report.json"), JSON.stringify({ allOk: true }));   // Round B's pass must not open Round C
    const st = spawnSync(process.execPath, [cmd, "heldC", "--part", "1/90", "--dir", dir], { encoding: "utf8" }).status;
    fs.rmSync(dir, { recursive: true, force: true });
    const earlier = [...S.DEV_SEEDS, ...S.HELD_SEEDS, ...S.DEV_B_SEEDS, ...S.HELD_B_SEEDS], mine = [...S.DEV_C_SEEDS, ...S.HELD_C_SEEDS];
    return { ok: st === 2 && mine.length === 120 && new Set(mine).size === 120 && mine.every((x) => !earlier.includes(x) && !inRange(x, S.SPENT.gates) && !inRange(x, [1901, 1930]) && !inRange(x, [2101, 2130]) && !inRange(x, [2401, 2460])), detail: `heldC exit ${st}` };
});

// ROUND D: arm LC (the lane with the doctrine's cap) against L
const LC41 = fly(41, "bow", "LC");
row("20 ARM LC IS L WITH THE CAP: the same field and starts; the hand-back exact before the cap; calls over 12 cut and none left with thrust; L cuts nothing and has over-cap calls with thrust", () => {
    const p = LC41.probe, q = L41.probe;
    return { ok: S.CAP_D === 12 && !!p && p.overCap > 0 && p.capCut > 0 && p.capNotCut === 0 && q.capCut === 0 && q.capNotCut > 0 && p.handBackMismatch === 0 && LC41.fieldKey === L41.fieldKey && p.field.lane === true && JSON.stringify(LC41) !== JSON.stringify(L41),
        detail: p ? `LC ${p.overCap} over, ${p.capCut} cut, ${p.capNotCut} with thrust; L ${q.capCut} cut, ${q.capNotCut} over with thrust` : "no probe" };
});
const synD = (arm, i, o) => ({ ...syn("N", i, {}), arm, probe: { calls: 10, aimed: 5, fallback: 0, near: 0, handBack: 5, handBackMismatch: 0, aimBlocked: 0, rockCentresBlocked: true, rockCentresBlockedAll: true, overCap: 4, capCut: arm === "LC" ? 3 : 0, capNotCut: arm === "LC" ? 0 : 3 }, ...o });
const setD = (n, fL, fC) => Array.from({ length: n }, (_, i) => [synD("L", i, fL(i)), synD("LC", i, fC(i))]).flat();
row("21 ROUND D'S BOTTOM LINE (V1 strikes after arriving, V2 R with higher better): SAVES FIGHTERS / SAVES FIGHTERS BUT HITS LESS / LOSES MORE / DOES NOT WIN", () => {
    const saves = S.readHeldD(setD(40, (i) => ({ combatStruck: i < 30 ? 1 : 0 }), () => ({}))).bottom;
    const less = S.readHeldD(setD(40, (i) => ({ combatStruck: i < 30 ? 1 : 0, R: 500 }), () => ({ R: 100 }))).bottom;
    const loses = S.readHeldD(setD(40, () => ({}), (i) => ({ combatStruck: i < 30 ? 1 : 0 }))).bottom;
    const approachOnly = S.readHeldD(setD(40, (i) => ({ approachStruck: i < 30 ? 1 : 0, struck: i < 30 ? 1 : 0 }), () => ({}))).bottom;   // V1 reads strikes AFTER arriving only
    return { ok: saves === "THE CAP SAVES FIGHTERS IN THE STRAFE" && less === "THE CAP SAVES FIGHTERS BUT HITS THE SHIP LESS" && loses === "THE CAP LOSES MORE FIGHTERS TO THE ROCKS" && approachOnly === "THE CAP DOES NOT WIN THE STRAFE (FLOOR)",
        detail: [saves, less, loses, approachOnly].join(" / ") };
});
row("22 ROUND D'S DEV CHECKS PASS ON GOOD ROWS AND EACH FAILS ON ITS OWN FAULT", () => {
    const good = setD(4, () => ({}), () => ({})), c0 = S.devChecksD(good);
    const fault = (k, edit) => { const rs = JSON.parse(JSON.stringify(good)); edit(rs); return S.devChecksD(rs)[k].ok; };
    const f = [fault("sameField", (rs) => { rs[1].fieldKey = "x"; }), fault("handBack", (rs) => { rs[1].probe.handBackMismatch = 1; }),
        fault("capApplied", (rs) => { rs[1].probe.capNotCut = 1; }), fault("capApplied", (rs) => rs.filter((r) => r.arm === "LC").forEach((r) => { r.probe.overCap = 0; r.probe.capCut = 0; })),
        fault("capApplied", (rs) => { rs[0].probe.capCut = 1; }), fault("capApplied", (rs) => rs.filter((r) => r.arm === "L").forEach((r) => { r.probe.capNotCut = 0; })),
        fault("fieldSound", (rs) => { rs[1].probe.aimBlocked = 1; }), fault("allEnd", (rs) => { rs[2].t = 200; })];
    return { ok: Object.values(c0).every((x) => x.ok) && f.every((x) => x === false), detail: `faults pass: ${f.join(",")}` };
});
row("23 THE COMMAND REFUSES ROUND D'S HELD BEFORE ITS DEV PASSES; ROUND D'S SETS ARE NEW", () => {
    const cmd = path.join(HERE, "rockNavStudyCmd.mjs"), dir = fs.mkdtempSync(path.join(os.tmpdir(), "rocknavd-"));
    fs.writeFileSync(path.join(dir, "devC-report.json"), JSON.stringify({ allOk: true }));   // Round C's pass must not open Round D
    const st = spawnSync(process.execPath, [cmd, "heldD", "--part", "1/90", "--dir", dir], { encoding: "utf8" }).status;
    fs.rmSync(dir, { recursive: true, force: true });
    const earlier = [...S.DEV_SEEDS, ...S.HELD_SEEDS, ...S.DEV_B_SEEDS, ...S.HELD_B_SEEDS, ...S.DEV_C_SEEDS, ...S.HELD_C_SEEDS], mine = [...S.DEV_D_SEEDS, ...S.HELD_D_SEEDS];
    return { ok: st === 2 && mine.length === 120 && new Set(mine).size === 120 && mine.every((x) => !earlier.includes(x) && !inRange(x, S.SPENT.gates) && !inRange(x, [1901, 1930]) && !inRange(x, [2101, 2130]) && !inRange(x, [2401, 2460])), detail: `heldD exit ${st}` };
});

// ROUND E: arm FX (the following field on the fixed library) against L
const FX41 = fly(41, "bow", "FX");
row("24 ARM FX IS ROUND C'S ARM F ON THE FIXED LIBRARY: it follows (builds >= 2, centred on the ship), no build is without a goal, every build is counted for an empty lane, the same field and starts as L", () => {
    const p = FX41.probe;
    return { ok: !!p && p.builds >= 2 && p.buildOriginDev === 0 && p.buildsWithoutGoal === 0 && p.allLane === true && Number.isInteger(p.laneEmptyBuilds) && p.fieldsChecked === p.builds && FX41.fieldKey === L41.fieldKey && L41.probe.laneEmptyBuilds === 0 && L41.probe.buildsWithoutGoal === 0
        && JSON.stringify({ ...FX41, arm: "F", probe: 0 }) === JSON.stringify({ ...F41, probe: 0 }),
        detail: p ? `${p.builds} builds, ${p.laneEmptyBuilds} empty-lane, ${p.buildsWithoutGoal} without a goal; the same fight as arm F on this fixture` : "no probe" };
});
row("24b A BUILD WITH NO GOAL IS COUNTED: goallessBuilds counts a field whose distances are all infinite, and not one with a goal", () => {
    const G = NV.buildField([], [0, 0, 0], 40, { cell: 16, half: 64, margin: 4 }), dead = { ...G, dist: new Float64Array(G.dist.length).fill(Infinity) };
    return { ok: S.goallessBuilds([G]) === 0 && S.goallessBuilds([G, dead, dead]) === 2 && S.goallessBuilds([]) === 0, detail: `${S.goallessBuilds([G, dead, dead])} of 3` };
});
const synE = (arm, i, o) => ({ ...synC(arm === "FX" ? "F" : arm, i, {}), arm, probe: { ...synC(arm === "FX" ? "F" : arm, i, {}).probe, laneEmptyBuilds: arm === "FX" ? 1 : 0, buildsWithoutGoal: 0 }, ...o });
const setE = (n, fL, fX) => Array.from({ length: n }, (_, i) => [synE("L", i, fL(i)), synE("FX", i, fX(i))]).flat();
row("25 ROUND E READS AS ROUND C, WORD FOR WORD, OF THE FIXED FIELD: the four bottom lines, FX's totals, the empty-lane builds counted", () => {
    const wins = S.readHeldE(setE(40, (i) => ({ struck: i < 30 ? 1 : 0 }), () => ({}))), loses = S.readHeldE(setE(40, () => ({}), (i) => ({ struck: i < 30 ? 1 : 0 }))).bottom;
    const less = S.readHeldE(setE(40, (i) => ({ struck: i < 30 ? 1 : 0, damageOnShip: 100 }), () => ({ damageOnShip: 50 }))).bottom, not = S.readHeldE(setE(40, () => ({}), () => ({}))).bottom;
    return { ok: wins.bottom === "THE FIXED FOLLOWING FIELD WINS" && loses === "THE FIXED FOLLOWING FIELD LOSES MORE FIGHTERS TO THE ROCKS" && less === "THE FIXED FOLLOWING FIELD SAVES FIGHTERS AND HURTS THE SHIP LESS" && not === "THE FIXED FOLLOWING FIELD DOES NOT WIN (FLOOR)"
        && wins.reported.FX && wins.reported.FX.struck === 0 && wins.reported.L.struck === 30 && wins.reported.FX.laneEmptyBuilds === 40 && wins.reported.FX.fightsWithEmpty === 40 && !("F" in wins.reported),
        detail: [wins.bottom, loses, less, not].join(" / ") };
});
row("26 ROUND E'S DEV CHECKS: Round C's five, and THE FIX REACHES THE FIELD fails when no build fell back from an empty lane or a build has no goal", () => {
    const good = setE(4, () => ({}), () => ({})), c0 = S.devChecksE(good);
    const fault = (k, edit) => { const rs = JSON.parse(JSON.stringify(good)); edit(rs); return S.devChecksE(rs)[k].ok; };
    const f = [fault("fixReaches", (rs) => rs.filter((r) => r.arm === "FX").forEach((r) => { r.probe.laneEmptyBuilds = 0; })), fault("fixReaches", (rs) => { rs[1].probe.buildsWithoutGoal = 1; }),
        fault("follows", (rs) => { rs[1].probe.builds = 1; }), fault("sameField", (rs) => { rs[1].fieldKey = "x"; })];
    return { ok: Object.keys(c0).length === 6 && Object.values(c0).every((x) => x.ok) && f.every((x) => x === false), detail: `checks ${Object.keys(c0).join(",")}; faults pass: ${f.join(",")}` };
});
row("27 THE COMMAND REFUSES ROUND E'S HELD BEFORE ITS DEV PASSES; ROUND E'S SETS ARE NEW", () => {
    const cmd = path.join(HERE, "rockNavStudyCmd.mjs"), dir = fs.mkdtempSync(path.join(os.tmpdir(), "rocknave-"));
    fs.writeFileSync(path.join(dir, "devD-report.json"), JSON.stringify({ allOk: true }));   // Round D's pass must not open Round E
    const st = spawnSync(process.execPath, [cmd, "heldE", "--part", "1/90", "--dir", dir], { encoding: "utf8" }).status;
    fs.rmSync(dir, { recursive: true, force: true });
    const earlier = [...S.DEV_SEEDS, ...S.HELD_SEEDS, ...S.DEV_B_SEEDS, ...S.HELD_B_SEEDS, ...S.DEV_C_SEEDS, ...S.HELD_C_SEEDS, ...S.DEV_D_SEEDS, ...S.HELD_D_SEEDS], mine = [...S.DEV_E_SEEDS, ...S.HELD_E_SEEDS];
    return { ok: st === 2 && mine.length === 120 && new Set(mine).size === 120 && mine.every((x) => !earlier.includes(x) && !inRange(x, S.SPENT.gates) && !inRange(x, [1901, 1930]) && !inRange(x, [2101, 2130]) && !inRange(x, [2401, 2460])), detail: `heldE exit ${st}` };
});

for (const r of rows) console.log(`  ${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " -- " + r.detail : ""}`);
const red = rows.filter((r) => !r.ok).length;
console.log(`[rockNavStudy-selfcheck] ${red ? red + " of " + rows.length + " checks FAIL" : "all " + rows.length + " checks pass"}`);
process.exit(red ? 1 : 0);
