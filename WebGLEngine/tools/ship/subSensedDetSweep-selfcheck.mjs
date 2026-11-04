// WebGLEngine/tools/ship/subSensedDetSweep-selfcheck.mjs -- UNNUMBERED. The gate of tools/ship/subSensedDetSweep.mjs, which reads the three sets of follow-up 61 together (brain/SENSED_NAV_WIP.md, "FOLLOW-UP 61" and its SECOND REGISTRATION).
//
// WHAT IT CHECKS: every number is HAND-DERIVED on made-up flights (the arithmetic is written beside the row). The three real files do not exist when this gate is written (they are flown after it and its sabotage are logged), so nothing here reads them; the fixture is 26 arms x 180 flights x 3 files built in memory with the counts each row needs. The exact sign test and the paired difference the report uses are tools/ship/subSensedDetLarge.mjs's and are gated there.
//   1  the constants and the table of levels      2  the files: readSweep's checks, one for each way a file can be wrong
//   3  the three sets pooled: the bar, the verdict and the eight predictions BI1 to BI8, each at its edge and one flight inside it, on counts that are the pooled ones and not any one set's
//   4  the report      5  the command
//
// SABOTAGE LOG (2026-11-04; each mutant is ONE change to ONE site of tools/ship/subSensedDetSweep.mjs, made by the script that made the larger-set module's, from 21 rules -- every === !== >= > <= < && || + - * / Math.max Math.min Math.abs true false, a negation, `.sort()`, every numeric literal up and down by one -- on every code line (the header comment, doc comments and the import lines left out), run through this gate in a scratch copy of the tree; RED is a gate row that failed by name, THREW is a section that threw, which the section guard turns into a named FAIL; a mutant that ends the gate without `all checks pass` is a red by the exit handler at the top):
//   FIRST PASS, 63 mutants: 49 RED, 11 THREW, 3 ZERO-RED: a positive effect of +1 printed without its plus (a row added: +1 and -1), and two equivalents.
//   SECOND PASS (the module and the gate as they stand), 63 mutants: 50 RED, 11 THREW, 2 ZERO-RED, BOTH EQUIVALENT, said plainly: P0018 `p < 0.0001` made `<=` in the print of a p value (a p of exactly 0.0001 cannot happen: every p is a whole number over a power of two); P0025 the first of the three specs made the second (STUDIES[0] to STUDIES[1]: the three specs have the same arms, bar and predictions, which section 1 checks, so the report is the same). The sign test and the paired difference are tools/ship/subSensedDetLarge.mjs's and were sabotaged there.
//   NOT RE-RUN, and said: nothing after the second pass; the gate as a whole passes in about 3 seconds. The three files it reads are built in memory; the real ones do not exist when it is written. Two of its first-written rows had an edge wrong (a case moved a level toward its base instead of away) and an arm-count row named the wrong arm: they were found by the gate's own first run, on the made-up flights, and corrected before any mutant was run.
"use strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Sp from "./subSensedDetSpecs.mjs";
import * as St from "./subSensedDetStudy.mjs";

let fails = 0, finished = false;   // an import that ends the process (a module that runs its command on import) must not look like a pass
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! the gate did not run to its end (the module under test ended the process)"); process.exitCode = 1; } });
const L = await import("./subSensedDetSweep.mjs");
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const guard = (n, f) => { try { f(); } catch (e) { fails++; console.log(`  FAIL  !! section ${n} ran to the end (THE GATE THREW: ${String((e && e.message) || e).slice(0, 200)})`); } };
const throws = (f, re) => { try { f(); return false; } catch (e) { return re.test(String(e && e.message)); } };
const ONLY = process.env.SWEK_GATE_SECTIONS ? process.env.SWEK_GATE_SECTIONS.split(",") : null, want = (n) => !ONLY || ONLY.includes(String(n));
console.log("subSensedDetSweep-selfcheck -- the sensitivity sweep of follow-up 61, read together\n");

const KINDS = ["hard-islands", "hard-gaps", "hard-current"], GAPS = [24, 32, 40];
const SPECS3 = L.STUDIES.map((n) => Sp.SPECS[n]), ARMS = SPECS3[0].arms, ROOT = "/x";
const fileOf = (i) => path.join(ROOT, SPECS3[i].out);
/** The rows of one file: totalOf(arm) is the arm's POOLED count over the 9 cells (3 kinds x 3 sets), spread over the cells as evenly as whole numbers allow (the first T mod 9 cells get one more); exactK(s) is exact's and the clean map's count of each cell of set s (0 to 60). */
function build(totalOf, exactK = () => 60) {
    return SPECS3.map((spec, s) => {
        const rows = [];
        for (const arm of ARMS) {
            const T = arm === "exact" || arm === "long+fix+forget" ? null : totalOf(arm);
            KINDS.forEach((kind, k) => {
                const idx = s * 3 + k, K = T === null ? exactK(s) : Math.floor(T / 9) + (idx < T % 9 ? 1 : 0);
                for (let i = 0; i < 60; i++) rows.push({ study: spec.name, set: spec.held, arm, kind, seed: (67 + s) * 100 + 1 + i, gap: kind === "hard-gaps" ? GAPS[i % 3] : null, status: i < K ? "reached" : "collided", reached: i < K, t: 100, path: 400, chord: 380, minClearance: 10, plans: 100, ensonified: 0.8, offsetEnd: 1 });
            });
        }
        return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
    });
}
const reader = (files) => (p) => { const i = [0, 1, 2].find((j) => fileOf(j) === p); if (i === undefined || files[i] === null) throw new Error("ENOENT " + p); return files[i]; };
const read3 = (files) => L.readSweep(ROOT, reader(files));
const FLAT = () => 360;
// every prediction holds AT ITS EDGE (hand-set; each total is the pooled count of 540): see section 3
const EDGE = {
    "fn100f80g@R3D30": 400, "fn100f80g@WD30L": 440, "fn100f80g-n40@R3D30": 415, "fn100f80g-n120@R3D30": 385, "fn100f80g-n40@WD30L": 425, "fn100f80g-n120@WD30L": 455,
    "m23re30@WD30L": 400, "m23re30-n120@WD30L": 409, "m23re30-n40@WD30L": 391, "m23re30@R3D30": 380, "m23re30-n120@R3D30": 386, "m23re30-n40@R3D30": 377,
    "fn100f80g-c15@WD30L": 416, "fn100f80g-c15@R3D30": 388, "fn100f80g-c60@R3D30": 385, "fn100f80g-c60@WD30L": 455,
    "fn100f80g-f70@R3D30": 385, "fn100f80g-f90@R3D30": 415, "fn100f80g-f70@WD30L": 455, "fn100f80g-f90@WD30L": 425,
    "fn100f80g-l20@R3D30": 415, "fn100f80g-l180@R3D30": 385, "fn100f80g-l20@WD30L": 425, "fn100f80g-l180@WD30L": 455,
};
const totalsOf = (over = {}) => (arm) => ({ ...EDGE, ...over })[arm] ?? 360;
const judged = (files) => { const lg = read3(files), spec = SPECS3[0]; return St.judge(St.summarize(lg.runs, spec), spec); };

guard(1, () => { if (!want(1)) return;
    console.log("1  THE CONSTANTS AND THE TABLE OF LEVELS");
    ok("the three studies are sweep-a, sweep-b and sweep-c, follow-up 61, in HELD67, HELD68, HELD69; a set is 180 flights of an arm", same([...L.STUDIES], ["sweep-a", "sweep-b", "sweep-c"]) && SPECS3.every((s, i) => s.followUp === 61 && s.held === `held${67 + i}`) && L.PER_ARM === 180);
    ok("the three specs have the same twenty-six arms and the same eight predictions and the same bar", SPECS3.every((s) => s.arms.length === 26 && same(s.arms, SPECS3[0].arms) && same(s.preds, SPECS3[0].preds) && same(s.bar, SPECS3[0].bar)));
    ok("!! the levels are these ten, each the arm at the level, its base and the two seas, frozen (the near radius 40 and 120 and the cap 15 and 60, the fraction 0.7 and 0.9 and the ghost's life 20 and 180 on fn100f80g; the near radius 40 and 120 on m23re30)",
        same(L.LEVELS.map((l) => [...l.slice(0, 3), [...l[3]]]), [["the near radius 40 m, on the base that barely uses it", "fn100f80g-n40", "fn100f80g", ["R3D30", "WD30L"]], ["the near radius 120 m, on the same base", "fn100f80g-n120", "fn100f80g", ["R3D30", "WD30L"]], ["the cap 15", "fn100f80g-c15", "fn100f80g", ["R3D30", "WD30L"]], ["the cap 60", "fn100f80g-c60", "fn100f80g", ["R3D30", "WD30L"]], ["the fraction 0.7", "fn100f80g-f70", "fn100f80g", ["R3D30", "WD30L"]], ["the fraction 0.9", "fn100f80g-f90", "fn100f80g", ["R3D30", "WD30L"]], ["the ghost's life 20", "fn100f80g-l20", "fn100f80g", ["R3D30", "WD30L"]], ["the ghost's life 180", "fn100f80g-l180", "fn100f80g", ["R3D30", "WD30L"]], ["the near radius 40 m, on the gate", "m23re30-n40", "m23re30", ["R3D30", "WD30L"]], ["the near radius 120 m, on the gate", "m23re30-n120", "m23re30", ["R3D30", "WD30L"]]])
        && Object.isFrozen(L.LEVELS) && L.LEVELS.every((l) => Object.isFrozen(l) && Object.isFrozen(l[3])) && Object.isFrozen(L.STUDIES));
    ok("every arm a level names, and its base, is flown in the sea it names (so that no paired row is empty)", L.LEVELS.every(([, arm, base, seas]) => seas.every((sea) => ARMS.includes(`${arm}@${sea}`) && ARMS.includes(`${base}@${sea}`))));
});

guard(2, () => { if (!want(2)) return;
    console.log("\n2  THE FILES");
    const good = build(FLAT);
    const lg = read3(good);
    ok("!! three good files are read: 3 sets of the right names, files and sets, 3 x 4,680 = 14,040 flights in the order of the sets", lg.sets.length === 3 && same(lg.sets.map((s) => [s.study, s.held, s.file]), SPECS3.map((s) => [s.name, s.held, s.out])) && lg.runs.length === 14040 && lg.sets.every((s) => s.rows.length === 4680) && lg.runs[0].set === "held67" && lg.runs[4680].set === "held68" && lg.runs[9360].set === "held69");
    ok("a missing file is an error that names it and says none is read until all are flown (each of the three in turn)", [0, 1, 2].every((i) => throws(() => read3(good.map((t, j) => (j === i ? null : t))), new RegExp(`${SPECS3[i].out.replace(/\./g, "\\.")} is missing: the three sets are read together, so none is read until all are flown`))));
    ok("a file with one flight too few or too many is an error that names it and the count (4,679; 4,681)", throws(() => read3([good[0].split("\n").slice(0, -2).join("\n") + "\n", good[1], good[2]]), /subSensedDetSweepAHeld67\.jsonl has 4679 flights, not 26 arms x 180/) && throws(() => read3([good[0], good[1], good[2] + good[2].split("\n")[0] + "\n"]), /subSensedDetSweepCHeld69\.jsonl has 4681 flights/));
    ok("a row of another study or another set is an error that names both", throws(() => read3([good[0].replace('"study":"sweep-a"', '"study":"sweep-b"'), good[1], good[2]]), /has a row of study sweep-b set held67, not sweep-a held67/) && throws(() => read3([good[0], good[1], good[2].replace('"set":"held69"', '"set":"held99"')]), /has a row of study sweep-c set held99, not sweep-c held69/));
    ok("an arm with 179 flights and another with 181 (the total right) is an error that names the first of them in the spec's order (m23re30@WD30L, with 179)", throws(() => { const rows = good[1].split("\n").filter(Boolean); const i = rows.findIndex((r) => JSON.parse(r).arm === "m23re30@WD30L"), j = rows.findIndex((r) => JSON.parse(r).arm === "m23re30-n40@WD30L"); rows[i] = rows[j]; return read3([good[0], rows.join("\n") + "\n", good[2]]); }, /subSensedDetSweepBHeld68\.jsonl has 179 flights of m23re30@WD30L, not 180/));
    ok("blank lines in a file are skipped", read3([good[0] + "\n\n", good[1].replace("\n", "\n\n"), good[2]]).runs.length === 14040);
    ok("the reader is asked for /x/brain/subSensedDetSweepAHeld67.jsonl, ...BHeld68.jsonl, ...CHeld69.jsonl, in that order, once each", (() => { const asked = []; L.readSweep(ROOT, (p) => { asked.push(p); return good[asked.length - 1]; }); return same(asked, ["/x/brain/subSensedDetSweepAHeld67.jsonl", "/x/brain/subSensedDetSweepBHeld68.jsonl", "/x/brain/subSensedDetSweepCHeld69.jsonl"]); })());
});

guard(3, () => { if (!want(3)) return;
    console.log("\n3  THE THREE SETS POOLED: THE BAR, THE VERDICT AND THE EIGHT PREDICTIONS");
    const lg = read3(build(totalsOf()));
    const spec = SPECS3[0], sum = St.summarize(lg.runs, spec);
    ok("!! an arm's pooled count is its reached flights over the 540 scenarios: the base under R3D30 is 400, under WD30L 440; each kind 180 flights of the arm", sum.pooled["fn100f80g@R3D30"].reached === 400 && sum.pooled["fn100f80g@WD30L"].reached === 440 && sum.pooled["fn100f80g@R3D30"].n === 540 && KINDS.every((k) => sum.cells[k]["fn100f80g@R3D30"].n === 180));
    const j = St.judge(sum, spec);
    ok("!! with every total at its edge, all eight predictions HOLD: BI1 |415 - 400|, |385 - 400|, |425 - 440|, |455 - 440| = 15; BI2 409 - 400 = 9 and 400 - 391 = 9; BI3 386 - 380 = 6 and 380 - 377 = 3; BI4 440 - 416 = 24; BI5 400 - 388 = 12; BI6 15 and 15; BI7 15 four times; BI8 15 four times", same(Object.values(j.preds), [true, true, true, true, true, true, true, true]) && same(Object.keys(j.preds), ["BI1", "BI2", "BI3", "BI4", "BI5", "BI6", "BI7", "BI8"]));
    const cases = [["BI1", { "fn100f80g-n40@R3D30": 416 }], ["BI1", { "fn100f80g-n120@R3D30": 384 }], ["BI1", { "fn100f80g-n40@WD30L": 424 }], ["BI1", { "fn100f80g-n120@WD30L": 456 }],
        ["BI2", { "m23re30-n120@WD30L": 408 }], ["BI2", { "m23re30-n40@WD30L": 392 }], ["BI3", { "m23re30-n120@R3D30": 385 }], ["BI3", { "m23re30-n40@R3D30": 378 }],
        ["BI4", { "fn100f80g-c15@WD30L": 417 }], ["BI5", { "fn100f80g-c15@R3D30": 389 }], ["BI6", { "fn100f80g-c60@R3D30": 384 }], ["BI6", { "fn100f80g-c60@WD30L": 456 }],
        ["BI7", { "fn100f80g-f70@R3D30": 384 }], ["BI7", { "fn100f80g-f90@R3D30": 416 }], ["BI7", { "fn100f80g-f70@WD30L": 456 }], ["BI7", { "fn100f80g-f90@WD30L": 424 }],
        ["BI8", { "fn100f80g-l20@R3D30": 416 }], ["BI8", { "fn100f80g-l180@R3D30": 384 }], ["BI8", { "fn100f80g-l20@WD30L": 424 }], ["BI8", { "fn100f80g-l180@WD30L": 456 }]];
    ok("!! one flight inside its edge, exactly one prediction is missed and it is the right one, for each of the twenty sub-predictions (BI1 four, BI2 two, BI3 two, BI4, BI5, BI6 two, BI7 four, BI8 four), the other seven still hold", cases.every(([id, over]) => { const r = judged(build(totalsOf(over))); return Object.entries(r.preds).every(([k, v]) => v === (k !== id)); }));
    ok("the other side of the edges holds too: the levels one flight inside the band on the far side (n40@R3D30 414; n120@R3D30 386; BI2's n120 410 and n40 390; BI4's c15 415; BI5's c15 387) all hold", (() => { const h = (over) => judged(build(totalsOf(over))).preds; return Object.values(h({ "fn100f80g-n40@R3D30": 414 })).every(Boolean) && Object.values(h({ "fn100f80g-n120@R3D30": 386 })).every(Boolean) && Object.values(h({ "m23re30-n120@WD30L": 410, "m23re30-n40@WD30L": 390 })).every(Boolean) && Object.values(h({ "fn100f80g-c15@WD30L": 415 })).every(Boolean) && Object.values(h({ "fn100f80g-c15@R3D30": 387 })).every(Boolean); })());
    ok("!! the counts are the POOLED ones: in the edge case BI4's difference is 24 pooled and only 8 in each set (a reading on one set could never hold it): the first set's own base minus its c15 under WD30L", (() => { const s0 = lg.sets[0].rows, c = (arm) => s0.filter((r) => r.arm === arm && r.reached).length; return c("fn100f80g@WD30L") - c("fn100f80g-c15@WD30L") === 7; })(), "24 = 7 + 9 + 8 over the sets (the cells are spread unevenly)");
    const spec0 = SPECS3[0];
    const barRun = (dTot, ex) => St.judge(St.summarize(read3(build((arm) => (arm.startsWith("fn100f80g@") ? dTot : 360), ex)).runs, spec0), spec0);
    const ex = (s) => [60, 50, 40][s];
    ok("!! the bar is on the pooled counts: exact 150 a kind (60 + 50 + 40 over the sets), 80% of it is 120; the designated at 360 over nine cells (40 a cell, 120 a kind) reaches it in every kind, under R3D30 and under WD30L: SUPPORTED, 6 of 6 (set a alone would need 48 of its 60 and miss)", (() => { const r = barRun(360, ex); return r.cellsHeld === 6 && r.verdict === "SUPPORTED" && KINDS.every((k) => r.cells.R3D30[k] && r.cells.WD30L[k]); })());
    ok("one flight below (359: two kinds at 120 and one at 119 per sea): 4 of 6, PARTLY SUPPORTED; at 357 every kind is at 119: 0 of 6, NOT SUPPORTED", (() => { const r1 = barRun(359, ex), r3 = barRun(357, ex); return r1.cellsHeld === 4 && r1.verdict === "PARTLY SUPPORTED" && r3.cellsHeld === 0 && r3.verdict === "NOT SUPPORTED"; })());
    ok("the bar is the designated fn100f80g's, under R3D30 and WD30L: raising only the R3D30 count (363 a kind 121, held) while the WD30L count is 351 (117 a kind, missed) holds 3 of 6 cells", (() => { const run = (a, b) => St.judge(St.summarize(read3(build((arm) => (arm === "fn100f80g@R3D30" ? a : arm === "fn100f80g@WD30L" ? b : 360), ex)).runs, spec0), spec0); const r = run(363, 351); return r.cellsHeld === 3 && KINDS.every((k) => r.cells.R3D30[k] && !r.cells.WD30L[k]) && r.verdict === "NOT SUPPORTED"; })());
});

guard(4, () => { if (!want(4)) return;
    console.log("\n4  THE REPORT");
    const lg = read3(build(totalsOf()));
    const text = L.report(lg), lines = text.split("\n");
    const spec = SPECS3[0], sum = St.summarize(lg.runs, spec), jj = St.judge(sum, spec);
    ok("!! the first line names the follow-up, the three sets, the 540 scenarios of each arm, the 26 arms and says READ TOGETHER", lines[0] === "SENSITIVITY SWEEP (follow-up 61): 3 sets (held67, held68, held69), 540 scenarios of each arm, 26 arms, READ TOGETHER");
    ok("the report holds the engine's own table of the pooled counts, verbatim, and the engine's own verdict text (the bar's cells, BI1 to BI8, VERDICT:)", text.includes(St.table(sum, spec, "the three sets pooled (the three kinds, 60 seeds of each in each set)")) && text.includes(St.verdictText(jj, spec)) && /VERDICT: (SUPPORTED|PARTLY SUPPORTED|NOT SUPPORTED)\n/.test(text));
    ok("the verdict text lists the eight predictions as HELD (the edge case)", ["BI1", "BI2", "BI3", "BI4", "BI5", "BI6", "BI7", "BI8"].every((id) => new RegExp(`\\n${id} [^\\n]*: HELD\\n`).test(text)));
    const at = lines.indexOf("level | sea | level minus base | pooled | HELD67 / HELD68 / HELD69 | g / l | p");
    ok("!! the paired block follows a line that says it is POST HOC and what g and l are, then a header, then twenty rows (ten levels under two seas)", at > 2 && lines[at - 1] === "POST HOC (nothing here is a registered prediction): the arm at the level minus its base, pooled over the 540 paired scenarios, and in each set; discordant scenarios g (level reached, base not) / l; the exact two-sided sign test, no correction for the number of tests" && lines.length - 1 - (at + 1) === 20 && lines[lines.length - 1] === "");
    const row = (label, sea) => lines.find((l) => l.startsWith(`${label} | ${sea} | `));
    // by hand: c15 under R3D30 388 (43 a cell, 44 in the first) minus the base 400 (44 a cell, 45 in the first four): cells -1, -2, -2, -2, -1, -1, -1, -1, -1: sets -5 / -4 / -3, pooled -12, g 0 l 12, p 2 / 4096 = 0.0005
    ok("!! the cap 15 under R3D30 is 388 (43 in each cell, 44 in the first) minus 400 (44 a cell, 45 in the first four) = -12: -5 / -4 / -3 in the sets, g 0 / l 12, p 2 / 2^12 = 0.0005", row("the cap 15", "R3D30") === "the cap 15 | R3D30 | fn100f80g-c15 minus fn100f80g | -12 | -5 / -4 / -3 | 0 / 12 | 0.0005");
    ok("!! under WD30L the cap 15 is 416 (46 a cell, 47 in the first two) minus 440 (48 a cell, 49 in the first eight) = -24: -7 / -9 / -8, g 0 / l 24, p <0.0001", row("the cap 15", "WD30L") === "the cap 15 | WD30L | fn100f80g-c15 minus fn100f80g | -24 | -7 / -9 / -8 | 0 / 24 | <0.0001");
    ok("!! the near radius 120 m on the gate under WD30L is 409 (45 a cell, 46 in the first four) minus 400 (44, 45 in the first four) = +9, +3 / +3 / +3, g 9 / l 0, p 2 / 2^9 = 0.0039: a positive effect is printed with its plus", row("the near radius 120 m, on the gate", "WD30L") === "the near radius 120 m, on the gate | WD30L | m23re30-n120 minus m23re30 | +9 | +3 / +3 / +3 | 9 / 0 | 0.0039");
    ok("!! the near radius 40 m on the gate under R3D30 is 377 (42 a cell, 41 in the last) minus 380 (42, 43 in the first two) = -3: -2 / 0 / -1, g 0 / l 3, p 2 / 8 = 0.2500; a zero set is printed as 0", row("the near radius 40 m, on the gate", "R3D30") === "the near radius 40 m, on the gate | R3D30 | m23re30-n40 minus m23re30 | -3 | -2 / 0 / -1 | 0 / 3 | 0.2500");
    ok("!! an effect of +1 is printed with its plus and of -1 with its minus: m23re30-n120@WD30L at 401 (45 in the first five cells) against m23re30 at 400 (45 in the first four) is `+1 | 0 / +1 / 0 | 1 / 0 | 1.0000`; at 399 (45 in the first three) it is `-1 | 0 / -1 / 0 | 0 / 1 | 1.0000`", (() => { const r = (v) => L.report(read3(build(totalsOf({ "m23re30-n120@WD30L": v })))).split("\n").find((l) => l.startsWith("the near radius 120 m, on the gate | WD30L | ")); return r(401) === "the near radius 120 m, on the gate | WD30L | m23re30-n120 minus m23re30 | +1 | 0 / +1 / 0 | 1 / 0 | 1.0000" && r(399) === "the near radius 120 m, on the gate | WD30L | m23re30-n120 minus m23re30 | -1 | 0 / -1 / 0 | 0 / 1 | 1.0000"; })());
    const flat = L.report(read3(build(FLAT))).split("\n");
    ok("in the flat case (every detector arm at 360) every paired row is `0 | 0 / 0 / 0 | 0 / 0 | 1.0000`: no sign on a zero", flat.filter((l) => /^the .* \| \S+ minus \S+ \| /.test(l)).length === 20 && flat.filter((l) => /^the .* \| \S+ minus \S+ \| /.test(l)).every((l) => /\| 0 \| 0 \/ 0 \/ 0 \| 0 \/ 0 \| 1\.0000$/.test(l)));
    ok("the report ends with one newline", text.endsWith("\n") && !text.endsWith("\n\n"));
});

guard(5, () => { if (!want(5)) return;
    console.log("\n5  THE COMMAND");
    const io = (o = {}) => { const log = []; return { log, o: { out: "/tmp/x/brain/subSensedDetSweep.txt", exists: () => false, writeFile: (f, t) => log.push(["write", f, t]), log: (m) => log.push(["log", m]), err: (m) => log.push(["err", m]), print: (t) => log.push(["print", t]), run: () => "TABLE\n", ...o } }; };
    const a = io(); const rc1 = L.main([], a.o);
    ok("main with no flag prints the report and writes nothing", rc1 === 0 && same(a.log, [["print", "TABLE\n"]]));
    const b = io(); const rc2 = L.main(["--write"], b.o);
    ok("main --write writes the report to the file and says its name, once", rc2 === 0 && same(b.log, [["write", "/tmp/x/brain/subSensedDetSweep.txt", "TABLE\n"], ["log", "wrote subSensedDetSweep.txt"]]));
    const c = io({ exists: () => true }); const rc3 = L.main(["--write"], c.o);
    ok("!! main --write REFUSES to overwrite a table that exists: exit 2, an error naming the file, nothing written and the files never read", rc3 === 2 && c.log.length === 1 && c.log[0][0] === "err" && /subSensedDetSweep\.txt exists; the table is read once and is not overwritten/.test(c.log[0][1]));
    const d = io({ exists: () => true }); const rc4 = L.main([], d.o);
    ok("main without --write does not care that the file exists (it only prints)", rc4 === 0 && d.log[0][0] === "print");
    const e = io(); const rc5 = L.main(["--wirte"], e.o);
    ok("!! a flag it does not know is a usage error: exit 1, a message naming the flag, nothing run, nothing written", rc5 === 1 && e.log.length === 1 && e.log[0][1] === "usage: node tools/ship/subSensedDetSweep.mjs [--write]   (not understood: --wirte)");
    const f = io({ run: () => { throw new Error("subSensedDetSweep: brain/x.jsonl is missing: the three sets are read together, so none is read until all are flown"); } }); const rc6 = L.main(["--write"], f.o);
    ok("!! a missing or malformed file is exit 2 with the message exactly, and nothing is written", rc6 === 2 && f.log.length === 1 && f.log[0][0] === "err" && f.log[0][1] === "subSensedDetSweep: brain/x.jsonl is missing: the three sets are read together, so none is read until all are flown");
    const f2 = io({ run: () => { throw "plain failure"; } }); const rc7 = L.main([], f2.o);
    ok("a thrown value that is not an Error is printed as it is: exit 2, `plain failure`", rc7 === 2 && same(f2.log, [["err", "plain failure"]]));
    const here = fileURLToPath(new URL("./subSensedDetSweep.mjs", import.meta.url));
    const cp = spawnSync(process.execPath, [here, "--bogus"], { encoding: "utf8" });
    ok("!! run as a script with a flag it does not know (so that nothing is read): status 1, the usage message on stderr, nothing on stdout", cp.status === 1 && cp.stderr.trim() === "usage: node tools/ship/subSensedDetSweep.mjs [--write]   (not understood: --bogus)" && cp.stdout === "", `status ${cp.status}`);
    const cp2 = spawnSync(process.execPath, [here], { encoding: "utf8", maxBuffer: 1 << 26 });
    ok("!! run as a script with no flag it does the command (whatever the state of the three files: the missing-file error and exit 2 before they are flown, the report and exit 0 after): it is NOT silent", (cp2.status === 2 && /is missing: the three sets are read together, so none is read until all are flown/.test(cp2.stderr) && cp2.stdout === "") || (cp2.status === 0 && cp2.stdout.startsWith("SENSITIVITY SWEEP (follow-up 61): 3 sets (held67, held68, held69)")), `status ${cp2.status}`);
    const cp3 = spawnSync(process.execPath, ["-e", `import(${JSON.stringify(new URL("./subSensedDetSweep.mjs", import.meta.url).href)}).then(() => console.log("imported"))`], { encoding: "utf8" });
    ok("importing the module (here from `node -e`, which has no script path) runs nothing: it imports and ends normally", cp3.status === 0 && cp3.stdout === "imported\n" && cp3.stderr === "", cp3.stderr.slice(0, 120));
});

finished = true;
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
