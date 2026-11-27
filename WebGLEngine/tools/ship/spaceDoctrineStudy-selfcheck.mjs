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
//   AFTER DEV (2026-11-19, check 3 failed): CAP_CHOSEN set to 12 while the DEV report shows the failed check -> 1 red (the NOT WEIGHED row).
//   SECTION 4b (added when definitionGates named six exports no row drove), 5 more, all red: the cap test made strict (cappedPilot row);
//   devChecks' slack widened by 1 (devChecks row); networkOf passing a plain array (networkOf row); readingsOf's gained and lost swapped (readings
//   row); readHeld pairing C with C (2: readHeld and readings).
//   ROUND 2 (2026-11-20, section 4c and the restated CAP_CHOSEN row), 9 mutants, all red, TWO only after a fix: the arena count inverted (live row); notCut
//   ignored, no-decisions-over-the-cap accepted, the doctrine bite dropped (devChecks2 row, each); DEV2 on Round 1's seeds (sets row); the cap re-chosen as 15
//   (3); CAP_CHOSEN set before DEV2 (the CAP_CHOSEN row); *** the measurement switched off CRASHED the gate on a detail string -- no verdict -- and now reds
//   the live row; unmeasured C rows accepted went 0 RED: the fixture's only C row was unmeasured, so the decisions-exist test failed it first. A fixture
//   with one measured and one unmeasured C row now reaches it. *** NOT GRADED HERE: the command's dev2 mode flying with probes (dev2-read's check 2
//   needs every C fight probed and would read NOT WEIGHED without them).
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

sec("4b. THE PIECES THE COMMAND COMPOSES, EACH DRIVEN WHERE ITS ANSWER IS KNOWN");
{
    // cappedPilot on a two-craft arena of plain data: the fighter closes at 10 head-on, so it cuts at cap 10 and not at cap 10.5
    const fb = { pos: [0, 0, 0], vel: [10, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0], I: [1, 1, 1] }, sb = { pos: [100, 0, 0], vel: [0, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0], I: [1, 1, 1] };
    const arena = { crafts: [{ id: 2, team: 2, body: fb, dead: false }, { id: 1, team: 1, body: sb, dead: false }] };
    const target = { pos: sb.pos, vel: sb.vel }, opts = {};
    const pr = { foeOf: new Map(), nullFoe: 0 }, at = S.cappedPilot(() => arena, 10, pr)(fb, target, opts), below = S.cappedPilot(() => arena, 10.5)(fb, target, opts);
    ok("!! cappedPilot cuts the thrust at closing >= CAP and only there, leaves torque and firing alone, and probes the arena's own foe",
        at.thrust === 0 && below.thrust > 0 && JSON.stringify(at.torqueBody) === JSON.stringify(below.torqueBody) && at.firing === below.firing && pr.foeOf.get(2) === 1 && pr.nullFoe === 0,
        `closing 10: cap 10 -> thrust ${at.thrust}, cap 10.5 -> thrust ${below.thrust}`);
    const row = (o) => ({ cap: 12, peakClosing: 13, over: true, t: 50, probe: { calls: 5, mismatches: 0, nullFoe: 0 }, ...o });
    const good = S.devChecks([row(), row({ cap: "D", peakClosing: 30, probe: undefined })], 12), bad = S.devChecks([row({ peakClosing: 14.05 }), row({ cap: "D", peakClosing: 30, probe: undefined })], 12);
    ok("!! devChecks: the cap holds at <= CAP + 2 and fails at 14.05 against 14 (DEV's own case); a mismatched foe and an unfinished fight each fail",
        good.capHolds.ok && good.sameFoe.ok && good.allEnd.ok && !bad.capHolds.ok &&
        !S.devChecks([row({ probe: { calls: 5, mismatches: 1, nullFoe: 0 } }), row({ cap: "D", peakClosing: 30 })], 12).sameFoe.ok &&
        !S.devChecks([row({ over: false }), row({ cap: "D", peakClosing: 30 })], 12).allEnd.ok);
    const sc = S.scenariosOf(S.HELD89_SEEDS);
    const fake = (preset, cap, R, extra = {}) => sc.map(({ seed, kind }, i) => ({ seed, kind, preset, cap, network: false, R: typeof R === "function" ? R(i) : R, losses: cap === "D" ? 3 : 1, strafeS: 10, dpss: cap === "D" ? 4 : 30,
        passes: 8, aliveS: 400, peakClosing: cap === "D" ? 31 : 13, shipStatus: cap === "D" ? "flying" : "destroyed", winner: "none", shipDamagePerRound: 20, ...extra }));
    const rows = S.PRESETS.flatMap((p) => [...fake(p, "D", 100), ...fake(p, 12, p === "perfect" ? 100 : 1600)]);
    const H = S.readHeld(rows, 12);
    ok("!! readHeld pairs each preset by (seed, kind): CAP BETTER where C wins, FLOOR where every pair ties; the overall line and no network reading when none was flown",
        H.byPreset.perfect.verdict === "FLOOR" && H.byPreset.regular.verdict === "CAP BETTER" && H.byPreset.green.wins === 240 && H.overall === "SUPPORTED" && H.network === null,
        S.PRESETS.map((p) => p + " " + H.byPreset[p].verdict).join("; ") + " -> " + H.overall);
    const rd = H.byPreset.regular.readings;
    ok("readingsOf: C loses fewer fighters in every pair, kills the ship in every scenario, and the DPSS medians are the arms' own",
        rd.fewerLosses.gained === 240 && rd.fewerLosses.lost === 0 && rd.C.shipDestroyed === 240 && rd.D.shipDestroyed === 0 && rd.dpss.medianC === 30 && rd.dpss.medianD === 4 && rd.dpss.n === 240);
    const net = S.networkOf({ id: "m" }, { weights: [0.5, -1.25] });
    const file = JSON.parse(fs.readFileSync(path.join(ENG, S.MLP_WEIGHTS), "utf8"));
    ok("networkOf hands battleshipFight the shipped MLP as a Float32Array (the module reads subarrays); MLP_WEIGHTS names the seatGunnerMlp file",
        net.weights instanceof Float32Array && net.weights[1] === -1.25 && net.module.id === "m" && file.policy === "seatGunnerMlp" && file.weights.length === file.weightCount);
    const lines = S.reportLines();
    ok("reportLines names the grid, both sets and the cap's state", lines.length === 2 && /6, 9, 12, 15, 20, 25/.test(lines[1]) && /1901-1930/.test(lines[1]) && /2401-2460/.test(lines[1]) && (S.CAP_CHOSEN === null ? /not yet chosen/ : /CAP \d/).test(lines[1]));
}

sec("4c. ROUND 2: CAP 12 FROM ROUND 1's DEV, DEV2 FOR THE CHECKS, AND CHECK 3 READ OFF THE ARENA");
{
    const note = fs.readFileSync(path.join(ENG, "brain", "SPACE_DOCTRINE_WIP.md"), "utf8"), r2 = note.slice(note.indexOf("# ROUND 2"));
    const rep1 = path.join(ENG, "brain", "rig-results", "space-doctrine", "dev-report.json"), R1 = fs.existsSync(rep1) ? JSON.parse(fs.readFileSync(rep1, "utf8")) : null;
    const spent = Object.values(S.SPENT), inR = (x, [a, b]) => x >= a && x <= b;
    ok("!! ROUND 2's sets: DEV2 = space seeds 2101-2130 x 4 kinds, disjoint from Round 1's DEV, from HELD89 and from every spent range; identity on 2101-2103; the note names them",
        S.DEV2_SEEDS.length === 30 && S.DEV2_SEEDS[0] === 2101 && S.DEV2_SEEDS.at(-1) === 2130 && JSON.stringify(S.IDENTITY2_SEEDS) === "[2101,2102,2103]" &&
        !S.DEV2_SEEDS.some((x) => S.DEV_SEEDS.includes(x) || S.HELD89_SEEDS.includes(x) || spent.some((r) => inR(x, r))) && /DEV2 = space seeds 2101-2130/.test(r2) && /HELD89 = space seeds 2401-2460 x 4 kinds, flown ONCE/.test(r2));
    ok("!! ROUND 2's cap is 12 and IS Round 1's DEV choice, not re-chosen (Round 1's report names 12)", S.ROUND2_CAP === 12 && R1 !== null && R1.cap === 12 && /CAP = 12, TAKEN FROM ROUND 1's DEV/.test(r2));
    const row = (o) => ({ cap: 12, peakClosing: 13.5, over: true, t: 60, probe: { calls: 9, mismatches: 0, nullFoe: 0 }, capApplied: { overCap: 40, notCut: 0 }, ...o });
    const D = { cap: "D", peakClosing: 31, over: true, t: 120 };
    const good = S.devChecks2([row(), D]);
    ok("!! devChecks2: the cap is applied with decisions over it and none carrying thrust; ONE decision with thrust, NO decision over the cap, a C row that never measured, or a doctrine that never exceeds CAP + 5 each FAIL it",
        good.capApplied.ok && good.sameFoe.ok && good.allEnd.ok && !S.devChecks2([row({ capApplied: { overCap: 40, notCut: 1 } }), D]).capApplied.ok &&
        !S.devChecks2([row({ capApplied: { overCap: 0, notCut: 0 } }), D]).capApplied.ok && !S.devChecks2([row({ capApplied: undefined }), D]).capApplied.ok && !S.devChecks2([row(), row({ capApplied: undefined }), D]).capApplied.ok &&
        !S.devChecks2([row(), { ...D, peakClosing: 16 }]).capApplied.ok && !S.devChecks2([row({ probe: undefined }), D]).sameFoe.ok);
    ok("...and the overshoot is REPORTED, not a bar: a C fight 14.05 high (Round 1's failing fight) passes ROUND 2's check 3 and is counted over +2",
        S.devChecks2([row({ peakClosing: 14.05 }), D]).capApplied.ok && S.devChecks2([row({ peakClosing: 14.05 }), D]).overshoot.overTwo === 1);
    const c = S.flyOne({ seed: THROWAWAY, kind: "bow", preset: "regular", cap: S.ROUND2_CAP, probe: true });
    // the negative control, measured the same way on a DOCTRINE fight: decisions over 12 that the arena recorded WITH thrust exist there, so the count can see one
    const own = BF.build(THROWAWAY, "bow", { gunners: "regular" }).arena; let over = 0, withThrust = 0;
    while (!own.done) {
        const fl = own.crafts.filter((x) => x.kind === "fighter" && !x.dead), st = new Map();
        for (const x of fl) { const f = SA.nearestFoe(own, x); if (f) st.set(x.id, S.closingSpeed(x.body, f.body)); }
        SA.stepSpaceArena(own);
        for (const x of fl) if (st.has(x.id) && st.get(x.id) >= S.ROUND2_CAP) { over++; if (!(x.last && x.last.thrust === 0)) withThrust++; }
    }
    ok("!! ROUND 2's check 3 LIVE on a throwaway seed: arm C reaches the cap and the arena recorded thrust 0 at every decision over it -- and the same count on the doctrine finds thrust over the cap (it can see a violation)",
        c.capApplied && c.capApplied.overCap > 100 && c.capApplied.notCut === 0 && over > 0 && withThrust > 0, `C: ${c.capApplied ? c.capApplied.overCap : "NOT MEASURED"} decisions over 12, ${c.capApplied ? c.capApplied.notCut : "-"} with thrust; doctrine: ${over} over 12, ${withThrust} with thrust`);
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
    const rep = path.join(ENG, "brain", "rig-results", "space-doctrine", "dev-report.json");
    const R = fs.existsSync(rep) ? JSON.parse(fs.readFileSync(rep, "utf8")) : null;
    const failed = R && (!R.identity.ok || !R.checks.sameFoe.ok || !R.checks.capHolds.ok || !R.checks.allEnd.ok);
    // RESTATED 2026-11-20 for ROUND 2: Round 1's DEV failed check 3, so Round 1 alone never sets the cap. CAP_CHOSEN may be non-null only when ROUND 2's DEV2
    // report exists, passed every check, and names ROUND2_CAP -- and then it must equal it. Round 1's failure stays in the detail.
    const rep2 = path.join(ENG, "brain", "rig-results", "space-doctrine", "dev2-report.json"), R2 = fs.existsSync(rep2) ? JSON.parse(fs.readFileSync(rep2, "utf8")) : null;
    const r2ok = !!(R2 && R2.allOk && R2.cap === S.ROUND2_CAP && R2.identity.ok && R2.checks.sameFoe.ok && R2.checks.capApplied.ok && R2.checks.allEnd.ok);
    ok("!! CAP_CHOSEN stays null unless ROUND 2's DEV2 passed every check (Round 1's DEV failed check 3 and cannot set it); when it passed, CAP_CHOSEN is its cap",
        (R === null || failed) && (r2ok ? S.CAP_CHOSEN === S.ROUND2_CAP : S.CAP_CHOSEN === null) || (!failed && R !== null && S.CAP_CHOSEN === R.cap),
        R === null ? "DEV not yet read" : failed ? `DEV chose ${R.cap}; check 3 ${R.checks.capHolds.ok ? "passed" : "FAILED (peak " + R.checks.capHolds.cPeak.toFixed(2) + ")"}; CAP_CHOSEN ${S.CAP_CHOSEN}` : `DEV chose ${R.cap}, all checks passed; CAP_CHOSEN ${S.CAP_CHOSEN}`);
    ok("the command is export-free and the library's caller (the orphan census needs a non-gate caller)", !/^\s*export\b/m.test(cmdSrc) && /from "\.\/spaceDoctrineStudy\.mjs"/.test(cmdSrc));
}

console.log();
if (fails) { console.log("spaceDoctrineStudy-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("spaceDoctrineStudy-selfcheck: all checks pass");
