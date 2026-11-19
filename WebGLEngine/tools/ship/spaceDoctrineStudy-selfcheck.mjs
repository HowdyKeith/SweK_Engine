#!/usr/bin/env node
// WebGLEngine/tools/ship/spaceDoctrineStudy-selfcheck.mjs -- the space approach doctrine round (brain/SPACE_DOCTRINE_WIP.md)
//
// Run: node tools/ship/spaceDoctrineStudy-selfcheck.mjs   (a few seconds: four short fights on a throwaway seed)
// Gated by tools/ship/selfchecks.mjs (discovery gate -- found by name, not by a list).
//
// Holds the registration as code: the sets, the grid, R, the tie rule, the bars, the verdict and the overall line, each
// driven on synthetic pairs where the answer is known; the arm C wrapper live on a THROWAWAY space seed (9990003, the
// note's own smoke, in no set) -- identity at cap Infinity, the same foe as the arena, the cap holding; and the command's
// refusals (no HELD89 flight while CAP_CHOSEN is null; no second flight of a file that exists). No DEV or HELD89 seed is
// flown here.
//
// ---- SABOTAGE LOG ----------------------------------------------------------------------------------------------
// 17 mutants, all red by name; TWO were 0 red first and the row that missed them was rebuilt.
//   red at once: tie eps widened to 1e-3 (the bars row); FLOOR at <= 20 (the floor row's 20-pair edge); the median dropped
//   from CAP BETTER (the tie-heavy case); a cap tie to the SMALLER cap; R growing with a later kill; the closing speed's
//   sign flipped (2: the closing row and the cap-holds row); the cap loosened to 2 x CAP (cap holds); the wrapper also
//   cutting full thrust (identity); the overall dropping green (overall); HARMFUL never set (overall); pairsOf not
//   checking the kind (refused pairs); the command's refuse() disabled (second flight); the command's CAP-null check
//   disabled (no HELD89 flight; the spawn now has a 60 s timeout so a regression cannot hang the gate); the grid's 25
//   changed to 30 (the bars row); the note's HELD89 range edited (the sets row).
//   *** 0 RED FIRST: approach ticks counted as strafe, and a pass counted every strafe tick. *** The row bounded the readings
//   and did not recount them. It now steps its own doctrine arena, reads the modes itself, and must match exactly: both red.
//   NOT A MUTANT, A TRUE NO-OP: the wrapper taking the ship (crafts[0]) instead of nearestFoe would pass every row, because
//   with one ship and no escorts the nearest foe of every fighter IS the ship. Check 2 guards the code as written, not
//   arenas with more foes.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as S from "./spaceDoctrineStudy.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as SA from "../../brain/spaceArena.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const sec = (t) => console.log("\n" + t);
const THROWAWAY = 9990003;

sec("1. THE REGISTRATION, AS CODE");
{
    const note = fs.readFileSync(path.join(ENG, "brain", "SPACE_DOCTRINE_WIP.md"), "utf8");
    const dev = S.scenariosOf(S.DEV_SEEDS), held = S.scenariosOf(S.HELD89_SEEDS);
    const inRange = (s, [a, b]) => s >= a && s <= b, spent = Object.values(S.SPENT);
    ok("!! the sets are the registered ones: DEV 1901-1930 x 4 kinds = 120, HELD89 2401-2460 x 4 kinds = 240, disjoint, and none in a spent range",
        dev.length === 120 && held.length === 240 && S.DEV_SEEDS[0] === 1901 && S.DEV_SEEDS.at(-1) === 1930 && S.HELD89_SEEDS[0] === 2401 && S.HELD89_SEEDS.at(-1) === 2460 &&
        !S.DEV_SEEDS.some((s) => S.HELD89_SEEDS.includes(s)) && ![...S.DEV_SEEDS, ...S.HELD89_SEEDS].some((s) => spent.some((r) => inRange(s, r))) &&
        JSON.stringify(S.KINDS) === JSON.stringify(["bow", "beam", "stern", "swarm"]) && /DEV = space seeds 1901-1930/.test(note) && /HELD89 = space seeds 2401-2460/.test(note),
        `DEV ${dev.length}, HELD89 ${held.length}; spent ranges ${spent.map((r) => r.join("-")).join(", ")}`);
    ok("!! the cap grid, the presets and the bars are the note's: CAP in {6, 9, 12, 15, 20, 25}; FLOOR under 20 discordant; p <= 0.05; tie 1e-9; the cap holds within +2, the doctrine above +5",
        JSON.stringify(S.CAP_GRID) === "[6,9,12,15,20,25]" && /CAP in \{6, 9, 12, 15, 20, 25\}/.test(note) &&
        JSON.stringify(S.PRESETS) === JSON.stringify(["perfect", "ace", "regular", "green"]) &&
        S.FLOOR_MIN === 20 && S.ALPHA === 0.05 && S.TIE_EPS === 1e-9 && S.CAP_SLACK === 2 && S.DOCTRINE_MARGIN === 5 && S.SHIP_HP === 1500 && S.SECONDS === 120,
        "frozen here so the verdict code cannot drift from the registration without this row saying so");
    ok("the identity seeds are DEV's first three and the note names them", JSON.stringify(S.IDENTITY_SEEDS) === "[1901,1902,1903]" && /DEV seeds 1901-1903/.test(note));
}

sec("2. R, THE CLOSING SPEED AND THE CAP CHOICE");
{
    ok("!! R is the damage when the ship survives, and 1500 + (120 - t) when it dies -- no ceiling, ordered",
        S.rOf({ ship: { status: "flying" }, damageOnShip: 300, t: 120 }) === 300 && S.rOf({ ship: { status: "destroyed" }, damageOnShip: 1500, t: 30 }) === 1590 &&
        S.rOf({ ship: { status: "destroyed" }, damageOnShip: 1500, t: 31 }) < S.rOf({ ship: { status: "destroyed" }, damageOnShip: 1500, t: 30 }) &&
        S.rOf({ ship: { status: "flying" }, damageOnShip: 1499, t: 120 }) < S.rOf({ ship: { status: "destroyed" }, damageOnShip: 1500, t: 120 }),
        "a later kill scores lower; any kill scores above any survival");
    const body = (pos, vel) => ({ pos, vel });
    ok("!! the closing speed is to the foe's CENTRE: head-on 10 -> 10, receding -> -10, purely lateral -> 0",
        Math.abs(S.closingSpeed(body([0, 0, 0], [10, 0, 0]), body([100, 0, 0], [0, 0, 0])) - 10) < 1e-12 &&
        Math.abs(S.closingSpeed(body([0, 0, 0], [-10, 0, 0]), body([100, 0, 0], [0, 0, 0])) + 10) < 1e-12 &&
        Math.abs(S.closingSpeed(body([0, 0, 0], [0, 10, 0]), body([100, 0, 0], [0, 0, 0]))) < 1e-12 &&
        Math.abs(S.closingSpeed(body([0, 0, 0], [0, 0, 0]), body([100, 0, 0], [-4, 0, 0])) - 4) < 1e-12);
    const rows = (cap, Rs) => Rs.map((R) => ({ cap, R }));
    const a = S.chooseCap([...rows("D", [9999]), ...rows(6, [10, 10]), ...rows(9, [30, 30]), ...rows(12, [20, 40]), ...rows(15, [5]), ...rows(20, [1]), ...rows(25, [0])]);
    const b = S.chooseCap([...rows(6, [1]), ...rows(9, [50]), ...rows(12, [5]), ...rows(15, [50]), ...rows(20, [2]), ...rows(25, [3])]);
    ok("!! CAP is the highest mean R; a tie goes to the LARGER cap; arm D rows are not candidates",
        a.cap === 12 && b.cap === 15 && a.means.length === 6 && !a.means.some((m) => m.cap === "D"),
        `means ${a.means.map((m) => m.cap + ":" + m.meanR).join(" ")} -> ${a.cap}; tie 9/15 -> ${b.cap}`);
}

sec("3. THE TEST, THE VERDICT AND THE OVERALL LINE, ON PAIRS WHOSE ANSWER IS KNOWN");
{
    const mk = (diffs) => diffs.map((diff, i) => ({ seed: i, kind: "bow", diff }));
    const many = (n, x) => Array(n).fill(x);
    const floor = S.presetVerdict(mk([...many(19, 5), ...many(221, 0)]));
    const cap = S.presetVerdict(mk([...many(150, 5), ...many(20, -5), ...many(70, 0)]));
    const doc = S.presetVerdict(mk([...many(20, 5), ...many(150, -5), ...many(70, 0)]));
    const none = S.presetVerdict(mk([...many(12, 5), ...many(10, -5), ...many(218, 0)]));
    const medZero = S.presetVerdict(mk([...many(30, 5), ...many(5, -5), ...many(205, 0)]).map((p, i) => i < 30 ? { ...p, diff: 1e-3 } : p));
    const edge = S.presetVerdict(mk([...many(20, 5), ...many(220, 0)])), edgeHi = S.presetVerdict(mk([...many(20, 5), ...many(100, 1), ...many(120, 0)]));
    ok("!! FLOOR under 20 discordant pairs, whatever their direction -- and 20 is not a floor", floor.verdict === "FLOOR" && floor.n === 19 && floor.ties === 221 && edge.verdict !== "FLOOR" && edge.n === 20 && edgeHi.verdict === "CAP BETTER",
        `19 of 240 discordant -> ${floor.verdict}; 20 -> ${edge.verdict}`);
    ok("!! CAP BETTER and DOCTRINE BETTER are mirror images at p <= 0.05 with the median's sign",
        cap.verdict === "CAP BETTER" && cap.p <= 0.05 && doc.verdict === "DOCTRINE BETTER" && doc.p === cap.p,
        `150-20 (70 ties) -> ${cap.verdict} (p ${cap.p.toExponential(2)}); 20-150 -> ${doc.verdict}`);
    ok("!! NO DIFFERENCE SHOWN when the sign test does not clear, AND when it clears but the median (ties kept) is not above 0",
        none.verdict === "NO DIFFERENCE SHOWN" && medZero.verdict === "NO DIFFERENCE SHOWN" && medZero.p <= 0.05 && medZero.median === 0,
        `12-10 -> ${none.verdict}; 30-5 with 205 ties clears the sign test (p ${medZero.p.toExponential(2)}) but the median is ${medZero.median} -> ${medZero.verdict}. With ties kept in the median, CAP BETTER needs more than half of ALL the pairs in C's favour`);
    ok("a tie is |diff| < 1e-9, dropped from the test and kept in the median", S.presetVerdict(mk([...many(20, 5e-10), ...many(25, 1)])).n === 25);
    const O = (o) => S.overallOf(o);
    const C = "CAP BETTER", D = "DOCTRINE BETTER", F = "FLOOR", N = "NO DIFFERENCE SHOWN";
    ok("!! SUPPORTED needs CAP BETTER under BOTH regular and green and DOCTRINE BETTER under none; PARTLY on one; HARMFUL on any DOCTRINE BETTER",
        O({ perfect: F, ace: N, regular: C, green: C }).overall === "SUPPORTED" &&
        O({ perfect: F, ace: N, regular: C, green: N }).overall === "PARTLY SUPPORTED" &&
        O({ perfect: C, ace: F, regular: N, green: N }).overall === "PARTLY SUPPORTED" &&
        O({ perfect: D, ace: N, regular: C, green: C }).overall === "NOT SUPPORTED" && O({ perfect: D, ace: N, regular: C, green: C }).harmful &&
        O({ perfect: F, ace: F, regular: N, green: N }).overall === "NOT SUPPORTED" && !O({ perfect: F, ace: F, regular: N, green: N }).harmful);
    let threw = false;
    try { S.pairsOf([{ seed: 1, kind: "bow", R: 1 }], [{ seed: 1, kind: "beam", R: 1 }]); } catch { threw = true; }
    ok("arms on different scenarios are refused, never paired", threw);
}

sec("4. ARM C LIVE, ON A THROWAWAY SEED (9990003, in no set)");
{
    const same = S.tallyOf({ seed: THROWAWAY, kind: "beam", preset: "regular" }) === S.tallyOf({ seed: THROWAWAY, kind: "beam", preset: "regular", cap: Infinity });
    const differs = S.tallyOf({ seed: THROWAWAY, kind: "beam", preset: "regular" }) !== S.tallyOf({ seed: THROWAWAY, kind: "beam", preset: "regular", cap: 15 });
    ok("!! check 1 IDENTITY: with CAP = Infinity, arm C's whole tally equals arm D's to the bit -- and a finite cap does change it",
        same && differs, "the wrapper's only effect is the thrust it cuts");
    const c = S.flyOne({ seed: THROWAWAY, kind: "bow", preset: "regular", cap: 15, probe: true }), d = S.flyOne({ seed: THROWAWAY, kind: "bow", preset: "regular" });
    ok("!! check 2 SAME FOE: at every decision the wrapper's foe is the one the arena gave the craft, and never null",
        c.probe.calls > 1000 && c.probe.mismatches === 0 && c.probe.nullFoe === 0, `${c.probe.calls} decisions, ${c.probe.mismatches} mismatches`);
    ok("!! check 3 THE CAP HOLDS: peak closing under cap 15 is <= 17, while the doctrine's exceeds 20",
        c.peakClosing <= 15 + S.CAP_SLACK && d.peakClosing > 15 + S.DOCTRINE_MARGIN, `C ${c.peakClosing.toFixed(2)}, D ${d.peakClosing.toFixed(2)}`);
    ok("every fight ends by 120 s, and the row carries the readings the note reports",
        c.over && d.over && c.t <= 120 && ["R", "strafeS", "dpss", "passes", "aliveS", "losses", "shipDamagePerRound", "winner"].every((k) => k in c), `C R ${c.R.toFixed(1)} (${c.shipStatus}), D R ${d.R.toFixed(1)} (${d.shipStatus})`);
    // An independent recount: the gate steps its own doctrine arena and reads each fighter's mode itself. Bounds alone
    // let two mutants through (approach ticks counted as strafe; a pass counted every tick) -- both 0 red first.
    const own = BF.build(THROWAWAY, "bow", { gunners: "regular" }).arena, modes = new Set();
    let sT = 0, entries = 0; const prev = new Map();
    while (!own.done) {
        const fl = own.crafts.filter((x) => x.kind === "fighter" && !x.dead);
        SA.stepSpaceArena(own);
        for (const x of fl) { const m = x.last ? x.last.mode : "none"; modes.add(m); if (m === "strafe") { sT++; if (prev.get(x.id) !== "strafe") entries++; } prev.set(x.id, m); }
    }
    ok("!! an independent recount of the doctrine fight's own modes gives the same strafe seconds and passes, and both modes occur",
        sT / 30 === d.strafeS && entries === d.passes && modes.has("strafe") && modes.has("approach"), `recount ${(sT / 30).toFixed(2)} s in ${entries} passes; modes ${[...modes].join(", ")}`);
    ok("!! the strafe readings are read off the arena's own mode: the doctrine strafes, passes are counted on entry, DPSS is damage over strafe seconds, alive seconds never exceed 8 x the fight",
        d.strafeS > 0 && d.passes >= 1 && d.passes <= d.strafeS * 30 && d.dpss === d.damageOnShip / d.strafeS && c.strafeS > 0 && d.aliveS <= 8 * d.t + 1e-9 && d.aliveS > d.strafeS && d.R === d.damageOnShip,
        `D: ${d.strafeS.toFixed(2)} strafe s in ${d.passes} passes, DPSS ${d.dpss.toFixed(2)}; C: ${c.strafeS.toFixed(2)} s in ${c.passes} passes, DPSS ${c.dpss === null ? "-" : c.dpss.toFixed(2)}`);
}

sec("5. THE COMMAND REFUSES WHAT THE REGISTRATION FORBIDS");
{
    const CMD = path.join(HERE, "spaceDoctrineStudyCmd.mjs"), cmdSrc = fs.readFileSync(CMD, "utf8");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "space-doctrine-"));
    try {
        const held = spawnSync(process.execPath, [CMD, "held", "--preset", "regular", "--dir", tmp], { encoding: "utf8", timeout: 60000 });
        ok("!! no HELD89 flight while CAP_CHOSEN is null (exit 2, nothing written)", S.CAP_CHOSEN !== null || (held.status === 2 && /CAP_CHOSEN is null/.test(held.stderr) && fs.readdirSync(tmp).length === 0),
            S.CAP_CHOSEN === null ? "refused, as registered" : `CAP_CHOSEN is ${S.CAP_CHOSEN}: the refusal is spent`);
        fs.writeFileSync(path.join(tmp, "dev-regular.json"), "SENTINEL");
        const again = spawnSync(process.execPath, [CMD, "dev", "--preset", "regular", "--dir", tmp], { encoding: "utf8", timeout: 60000 });
        ok("!! an existing flight file is never flown again (exit 2, the file untouched)", again.status === 2 && /REFUSED/.test(again.stderr) && fs.readFileSync(path.join(tmp, "dev-regular.json"), "utf8") === "SENTINEL");
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    ok("the command is export-free and the library's caller (the orphan census needs a non-gate caller)", !/^\s*export\b/m.test(cmdSrc) && /from "\.\/spaceDoctrineStudy\.mjs"/.test(cmdSrc));
}

console.log();
if (fails) { console.log("spaceDoctrineStudy-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("spaceDoctrineStudy-selfcheck: all checks pass");
