// WebGLEngine/tools/ship/rockNavStudy-selfcheck.mjs -- the gate of tools/ship/rockNavStudy.mjs and its command (brain/ROCK_NAV_WIP.md)
//
// Flies only the gate seeds (space seeds 41-50). SABOTAGED 2026-11-25, each on a backup copy, restored after (red rows by name):
//   S1 the pilot never reaches the build: 1 red (4).  S2 the hand-back compared outside, not inside: 1 red (4).  S3 combat strikes count every strike: 1 red (1).
//   S4 V2's sign flipped: 1 red (7).  S5 the bottom line ignores V2: 1 red (7).  S6 the verdict drops the totals: 1 red (6).  S7 no floor: 2 red (6, 7).
//   S8 the field key ignores the rocks: 1 red (2).  S9 same field always passes: 1 red (9).  S10 arrival read before the strike: 1 red (1).
//   S11 HELD overlaps Round B: 1 red (10).  S12 the command flies HELD without DEV: 1 red (11).
//   S13 the field at the origin with half the goal radius: FIRST PASS 0 red (nothing read the field's goal); row 4b added, then 1 red (4b).
//   S14 the field's origin offset by one unit: 1 red (4b).
"use strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as S from "./rockNavStudy.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as SA from "../../brain/spaceArena.mjs";
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

for (const r of rows) console.log(`  ${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " -- " + r.detail : ""}`);
const red = rows.filter((r) => !r.ok).length;
console.log(`[rockNavStudy-selfcheck] ${red ? red + " of " + rows.length + " checks FAIL" : "all " + rows.length + " checks pass"}`);
process.exit(red ? 1 : 0);
