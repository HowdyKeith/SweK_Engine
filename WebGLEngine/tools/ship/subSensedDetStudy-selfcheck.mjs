// WebGLEngine/tools/ship/subSensedDetStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subSensedDetStudy-selfcheck.mjs      (~4 min)
//
// THE STUDIES OF THE GENERAL DETECTOR (tools/ship/subSensedDetStudy.mjs and its specs, tools/ship/subSensedDetSpecs.mjs), held to the registrations before any set of follow-ups 8 to 24 is flown:
//   1  THE SPECS     the seventeen specs against a LITERAL copy of the registrations (the arms flown, the designated detector, the bar's cells, the verdict rule, every prediction as an operation), written here from the registered text and not read back from the specs; every spec well formed (checkSpec); follow-up N flies HELD(N + 5)
//   2  THE ENGINE    summarize, value, barKinds, holds (every operation at its edge and on a missing arm), judge (the verdict at each count of held cells), table, verdictText -- on runs made up with known counts
//   3  THE COMMAND   every bad argument, the sets, the order of the flights, --write, the default flight, every study run end to end on made-up flights; one real run of --seeds 1
// SABOTAGE LOG, 2026-11-03:
//   THE SPECS: 516 MUTANTS V001-V516, made by a script from the specs file (for every prediction its threshold up and down by one, its two arms swapped, `ge` made `gt`, `within` made `le`, `gt` made `ge`, a `bar` made on `inc`; for every bar its full and partly thresholds down by one and its conditions dropped and swapped; the follow-up number, the set and the designated arm; the last arm and the clean map dropped from every arm list). Run with SWEK_GATE_SECTIONS=1 (section 1 only: the registered digest, 0.3 s a mutant). ALL 516 RED BY A ROW'S NAME; none crashed, none 0 red, none equivalent.
//   THE ENGINE: 105 MUTANTS E01-E105 of tools/ship/subSensedDetStudy.mjs (the bar's rate and the sets E01-E04; each column of a cell and each median E05-E17; the cells, the pooled kinds and the gap widths E18-E22; value E23-E27; the bar E28-E32; every operation at its edge E33-E50; judge E51-E57; the table E58-E68; the verdict text E69-E74; the command E75-E105: the default flight, the default writer and its root, every error and its exit code, the sets, the order of the flights, the seeds, --write and its file, the lines it prints). A first pass found THIRTEEN survivors (E09, E13, E14, E15, E17, E19, E32, E60, E62, E63, E64, E75, E76), for which the rows were written: every status in its own column and a run of another kind left out of the pooled count, medians that tell the arrivals from the failures (the failures were given a different path, clearance and status mix), the bar over mixed kinds (some against every), the table's exact header and one full row, and the writer's root folder (the default writer is now run into a scratch folder). THE FIRST PASS ALSO HAD A HAZARD, found by the stray files it left: a mutant that lets `--write` through wrote seventeen files of made-up flights into the real brain/ folder through the symlink of the scratch tree (deleted, none was a result; the sabotage runs now isolate brain/, SAB_ISOLATE). Second pass, run with SWEK_GATE_SECTIONS=1,2,3 and SWEK_GATE_NOREAL=1 (the real run of the command left out), E75 (the default flight) through the whole gate: 105 MUTANTS: 96 RED BY A ROW'S NAME, 4 RED BECAUSE THE GATE THREW inside a section (E31, E65, E75, E82: counted apart), 5 TIMED OUT (E79, E80, E83, E85, E102 each let a set the study is not flown on, or a --write on dev, THROUGH, so the gate's call flies a whole set instead of refusing in a few milliseconds and the 300 s limit stops it: caught by NOT FINISHING, counted apart, as in the older gates). NOTHING WENT 0 RED, none equivalent.
//   NOT RE-RUN, and said: nothing after the last edit of the engine, which is frozen from here until every set of follow-ups 8 to 24 is flown; the gate as a whole passes (about 4 minutes, the real run of --seeds 1 included).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as St from "./subSensedDetStudy.mjs";
import * as Sp from "./subSensedDetSpecs.mjs";
import * as X from "../../brain/subSensedNav.mjs";
import * as D from "../../brain/subSensedDetect.mjs";
import * as H from "../../brain/subHardNav.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const guard = (n, f) => { try { f(); } catch (e) { fails++; console.log(`  FAIL  !! section ${n} ran to the end (THE GATE THREW: ${String((e && e.message) || e).slice(0, 160)})`); } };
const ONLY = process.env.SWEK_GATE_SECTIONS ? process.env.SWEK_GATE_SECTIONS.split(",") : null, want = (n) => !ONLY || ONLY.includes(String(n));
console.log("subSensedDetStudy-selfcheck -- the studies of the general detector\n");
const KINDS = X.SENSE_KINDS;

const REGISTERED = [
    "### 8 dropout-range held13 brain/subSensedDetDropoutRangeHeld13.jsonl designated lock bar lock@[D30,W] full 6 partly 4",
    "ARMS exact long+fix+forget inc@D3 uni@D3 lock@D3 inc@D10 uni@D10 lock@D10 inc@D30 uni@D30 lock@D30 inc@W uni@W lock@W lock@clean",
    "  H1 ge inc@D3 inc@D30 10",
    "  H2 ge uni@D10 inc@D10 5",
    "  H3 ge uni@D3 uni@D30 5",
    "  H4 ge lock@D30 uni@D30 10",
    "  H5 and[within lock@D3 uni@D3 8; within lock@D10 uni@D10 8]",
    "  H6 bar lock@W",
    "  H7 within lock@clean long+fix+forget 8",
    "  H8 and[gt sum(lock@D3,lock@D10,lock@D30) sum(inc@D3,inc@D10,inc@D30); gt sum(lock@D3,lock@D10,lock@D30) sum(uni@D3,uni@D10,uni@D30)]",
    "### 9 confirm-range held14 brain/subSensedDetConfirmRangeHeld14.jsonl designated cr bar cr@[R3,W] full 6 partly 4",
    "ARMS exact long+fix+forget inc@R1 c2@R1 c3@R1 cr@R1 inc@R3 c2@R3 c3@R3 cr@R3 inc@W c2@W cr@W cr@clean",
    "  K1 ge cr@R3 inc@R3 15",
    "  K2 within cr@R3 c2@R3 10",
    "  K3 within c3@R3 c2@R3 10",
    "  K4 ge c2@W cr@W 10",
    "  K5 bar cr@R3",
    "  K6 notBar cr@W",
    "  K7 within cr@clean long+fix+forget 8",
    "  K8 and[gt sum(cr@R1,cr@R3) sum(inc@R1,inc@R3); gt sum(cr@R1,cr@R3) sum(c3@R1,c3@R3)]",
    "### 10 detector-range held15 brain/subSensedDetDetectorRangeHeld15.jsonl designated rd bar rd@[D30,R3] full 6 partly 4",
    "ARMS exact long+fix+forget inc@D30 uni@D30 rd@D30 inc@R3 uni@R3 rd@R3 inc@W uni@W rd@W inc@P uni@P rd@P rd@clean",
    "  M1 ge sum(rd@D30,rd@R3) sum(uni@D30,uni@R3) 10",
    "  M2 bar rd@D30",
    "  M3 bar rd@R3",
    "  M4 ge uni@W rd@W 10",
    "  M5 within rd@P uni@P 10",
    "  M6 within rd@clean long+fix+forget 8",
    "  M7 and[gt rd@D30 inc@D30; gt rd@R3 inc@R3; gt rd@W inc@W; gt rd@P inc@P]",
    "### 11 detector-confirm held16 brain/subSensedDetDetectorConfirmHeld16.jsonl designated m2-3 bar m2-3@[W,V] full 6 partly 4",
    "ARMS exact long+fix+forget m1-1@W m2-2@W m3-3@W m2-3@W m2-4@W m3-4@W m1-1@V m2-2@V m3-3@V m2-3@V m2-4@V m3-4@V m2-3@clean",
    "  N1 ge m2-3@V m2-2@V 5",
    "  N2 within m2-3@W m2-2@W 8",
    "  N3 within m3-3@W m2-2@W 8",
    "  N4 eachGe [m2-2@W,m3-3@W,m2-3@W,m2-4@W,m3-4@W] m1-1@W 20",
    "  N5 bar m2-3@W",
    "  N6 bar m2-3@V",
    "  N7 within m2-3@clean long+fix+forget 8",
    "  N8 ge m2-3@V m3-4@V 5",
    "### 12 detector-hold held17 brain/subSensedDetDetectorHoldHeld17.jsonl designated e30 bar e30@[D30] full 3 partly 2",
    "ARMS exact long+fix+forget inc@D30 h12@D30 h30@D30 e12@D30 e30@D30 inc@W h12@W h30@W e12@W e30@W inc@P e30@P e30@clean",
    "  O1 ge inc@W h30@W 20",
    "  O2 within e30@W inc@W 10",
    "  O3 ge e30@D30 inc@D30 10",
    "  O4 within e30@D30 h30@D30 10",
    "  O5 ge e30@D30 e12@D30 5",
    "  O6 gt e30@P inc@P",
    "  O7 within e30@clean long+fix+forget 8",
    "  O8 gt h12@D30 inc@D30",
    "### 13 detector-range-hold held18 brain/subSensedDetDetectorRangeHoldHeld18.jsonl designated re30 bar re30@[D30] full 3 partly 2",
    "ARMS exact long+fix+forget inc@D30 n30@D30 e30@D30 re30@D30 inc@W n30@W e30@W re30@W inc@P n30@P e30@P re30@P n30@clean e30@clean re30@clean",
    "  L1 ge re30@D30 inc@D30 10",
    "  L2 within re30@D30 e30@D30 10",
    "  L3 gt re30@clean e30@clean",
    "  L4 within re30@clean long+fix+forget 8",
    "  L5 within re30@W inc@W 10",
    "  L6 ge inc@W n30@W 20",
    "  L7 gt re30@P inc@P",
    "  L8 and[gt sum(re30@D30,re30@P) sum(e30@D30,e30@P); gt sum(re30@D30,re30@P) sum(n30@D30,n30@P)]",
    "### 14 detector-range-confirm held19 brain/subSensedDetDetectorRangeConfirmHeld19.jsonl designated rm23 bar rm23@[R3,R1] full 6 partly 4",
    "ARMS exact long+fix+forget inc@R3 c2@R3 m23@R3 cr@R3 rm23@R3 rm24@R3 rm34@R3 inc@W m23@W rm23@W m23@R1 rm23@R1 rm23@clean",
    "  S1 ge rm23@R3 cr@R3 5",
    "  S2 within rm23@R3 m23@R3 10",
    "  S3 within rm24@R3 rm23@R3 8",
    "  S4 ge rm23@R3 rm34@R3 5",
    "  S5 ge m23@W rm23@W 10",
    "  S6 bar rm23@R3",
    "  S7 bar rm23@R1",
    "  S8 within rm23@clean long+fix+forget 8",
    "### 15 detector-hold-range held20 brain/subSensedDetDetectorHoldRangeHeld20.jsonl designated rn30 bar rn30@[D30] full 3 partly 2",
    "ARMS exact long+fix+forget inc@D30 re30@D30 mk30@D30 mn30@D30 rp30@D30 rn30@D30 inc@W re30@W rn30@W inc@P rn30@P re30@clean rn30@clean",
    "  T1 ge re30@D30 mk30@D30 10",
    "  T2 within mn30@D30 re30@D30 10",
    "  T3 within rp30@D30 re30@D30 10",
    "  T4 ge rn30@D30 inc@D30 10",
    "  T5 bar rn30@D30",
    "  T6 within rn30@clean long+fix+forget 8",
    "  T7 within rn30@W inc@W 10",
    "  T8 gt rn30@P inc@P",
    "### 16 detector-hold-confirm held21 brain/subSensedDetDetectorHoldConfirmHeld21.jsonl designated m23e30 bar m23e30@[WD30] full 3 partly 2",
    "ARMS exact long+fix+forget inc@WD30 d2-12@WD30 m23@WD30 e30@WD30 m23h30@WD30 m23e30@WD30 inc@W m23@W m23e30@W inc@D30 e30@D30 m23e30@D30 m23e30@clean",
    "  U1 and[gt m23e30@WD30 m23@WD30; gt m23e30@WD30 e30@WD30]",
    "  U2 ge m23e30@WD30 d2-12@WD30 10",
    "  U3 within m23h30@WD30 m23e30@WD30 10",
    "  U4 ge m23e30@D30 inc@D30 10",
    "  U5 ge m23e30@W inc@W 20",
    "  U6 bar m23e30@WD30",
    "  U7 within m23e30@clean long+fix+forget 8",
    "  U8 within m23e30@D30 e30@D30 10",
    "### 17 detector-hold-confirm-range held22 brain/subSensedDetDetectorHoldConfirmRangeHeld22.jsonl designated rm23re30 bar rm23re30@[R3D30] full 3 partly 2",
    "ARMS exact long+fix+forget inc@R3D30 m23e30@R3D30 rd@R3D30 rm23@R3D30 re30@R3D30 rm23re30@R3D30 inc@W m23e30@W rm23re30@W inc@P m23e30@P rm23re30@P rm23re30@clean",
    "  Q1 ge rm23re30@R3D30 m23e30@R3D30 10",
    "  Q2 ge rm23re30@R3D30 rd@R3D30 5",
    "  Q3 and[gt rm23re30@R3D30 rm23@R3D30; gt rm23re30@R3D30 re30@R3D30]",
    "  Q4 bar rm23re30@R3D30",
    "  Q5 ge m23e30@W rm23re30@W 10",
    "  Q6 ge rm23re30@W inc@W 10",
    "  Q7 within rm23re30@P m23e30@P 10",
    "  Q8 within rm23re30@clean long+fix+forget 8",
    "### 18 detector-hold-confirm-range-hold held23 brain/subSensedDetDetectorHoldConfirmRangeHoldHeld23.jsonl designated rm23e30g bar rm23e30g@[R3D30] full 3 partly 2",
    "ARMS exact long+fix+forget inc@R3D30 m23e30@R3D30 rm23re30@R3D30 rm23e30@R3D30 rm23re30g@R3D30 rm23e30g@R3D30 inc@W rm23re30@W rm23e30g@W inc@P rm23re30@P rm23e30g@P rm23e30g@clean",
    "  J1 ge rm23e30@R3D30 rm23re30@R3D30 5",
    "  J2 within rm23e30g@W rm23re30@W 10",
    "  J3 ge rm23re30g@R3D30 rm23re30@R3D30 5",
    "  J4 within rm23e30g@R3D30 rm23e30@R3D30 8",
    "  J5 bar rm23e30g@R3D30",
    "  J6 ge rm23e30g@R3D30 m23e30@R3D30 10",
    "  J7 gt rm23e30g@P inc@P",
    "  J8 within rm23e30g@clean long+fix+forget 8",
    "### 19 detector-range-confirm-hold held24 brain/subSensedDetDetectorRangeConfirmHoldHeld24.jsonl designated rm23lk bar rm23lk@[R3D30] full 3 partly 2",
    "ARMS exact long+fix+forget inc@R3D30 rm23@R3D30 rd@R3D30 rm23lk@R3D30 rm23re30@R3D30 crre30@R3D30 inc@W rm23lk@W rm23re30@W inc@P rm23lk@P rm23re30@P rm23lk@clean",
    "  B1 ge rm23lk@R3D30 rd@R3D30 5",
    "  B2 within rm23re30@R3D30 rm23lk@R3D30 10",
    "  B3 ge rm23lk@R3D30 rm23@R3D30 10",
    "  B4 bar rm23lk@R3D30",
    "  B5 ge rm23re30@W rm23lk@W 10",
    "  B6 gt rm23lk@P inc@P",
    "  B7 within rm23lk@clean long+fix+forget 8",
    "  B8 within crre30@R3D30 rd@R3D30 10",
    "### 20 detector-confirm-hold held25 brain/subSensedDetDetectorConfirmHoldHeld25.jsonl designated m34e30 bar m34e30@[WD30,VD30] full 6 partly 4",
    "ARMS exact long+fix+forget m11e30@WD30 m22e30@WD30 m33e30@WD30 m23e30@WD30 m24e30@WD30 m34e30@WD30 m11e30@VD30 m22e30@VD30 m33e30@VD30 m23e30@VD30 m24e30@VD30 m34e30@VD30 m34e30@clean",
    "  Y1 spread [m22e30@WD30,m33e30@WD30,m23e30@WD30,m24e30@WD30,m34e30@WD30] 20",
    "  Y2 eachGe [m22e30@WD30,m33e30@WD30,m23e30@WD30,m24e30@WD30,m34e30@WD30] m11e30@WD30 20",
    "  Y3 within m23e30@VD30 m22e30@VD30 8",
    "  Y4 gt m34e30@WD30 m23e30@WD30",
    "  Y5 ge m23e30@VD30 m34e30@VD30 5",
    "  Y6 bar m34e30@WD30",
    "  Y7 bar m34e30@VD30",
    "  Y8 within m34e30@clean long+fix+forget 8",
    "### 21 detector-hold-confirm-hold held26 brain/subSensedDetDetectorHoldConfirmHoldHeld26.jsonl designated f80 bar f80@[WD30,WD30L] full 6 partly 4",
    "ARMS exact long+fix+forget inc@WD30 m23@WD30 f100@WD30 f90@WD30 f80@WD30 f60@WD30 inc@WD30L m23@WD30L f100@WD30L f90@WD30L f80@WD30L f60@WD30L f80@clean",
    "  A1 ge hard-gaps:f80@WD30 hard-gaps:f100@WD30 3",
    "  A2 ge f80@WD30 f100@WD30 5",
    "  A3 ge f80@WD30 f60@WD30 5",
    "  A4 ge f100@WD30L f80@WD30L 5",
    "  A5 within f100@WD30L f100@WD30 10",
    "  A6 bar f80@WD30",
    "  A7 bar f80@WD30L",
    "  A8 within f80@clean long+fix+forget 8",
    "### 22 detector-confirm-hold-confirm held27 brain/subSensedDetDetectorConfirmHoldConfirmHeld27.jsonl designated m33f80 bar m33f80@[WD30,WD30L] full 6 partly 4",
    "ARMS exact long+fix+forget m11f80@WD30 m22f80@WD30 m33f80@WD30 m23f80@WD30 m24f80@WD30 m34f80@WD30 m11f80@WD30L m22f80@WD30L m33f80@WD30L m23f80@WD30L m24f80@WD30L m34f80@WD30L m33f80@clean",
    "  X1 ge m33f80@WD30 m23f80@WD30 5",
    "  X2 ge m23f80@WD30L m33f80@WD30L 3",
    "  X3 spreadGt [m22f80@WD30,m33f80@WD30,m23f80@WD30,m24f80@WD30,m34f80@WD30] 10",
    "  X4 eachGe [m22f80@WD30,m33f80@WD30,m23f80@WD30,m24f80@WD30,m34f80@WD30] m11f80@WD30 20",
    "  X5 ge m23f80@WD30L m22f80@WD30L 5",
    "  X6 bar m33f80@WD30",
    "  X7 bar m33f80@WD30L",
    "  X8 within m33f80@clean long+fix+forget 8",
    "### 23 detector-hold-confirm-hold-confirm held28 brain/subSensedDetDetectorHoldConfirmHoldConfirmHeld28.jsonl designated full bar full@[WD30L,P] full 6 partly 4",
    "ARMS exact long+fix+forget inc@WD30L full@WD30L noG@WD30L gU@WD30L noK@WD30L noM@WD30L noE@WD30L inc@P full@P noG@P gU@P noK@P full@clean",
    "  Z1 ge full@WD30L noM@WD30L 20",
    "  Z2 ge noK@WD30L full@WD30L 5",
    "  Z3 within noE@WD30L full@WD30L 10",
    "  Z4 ge full@P gU@P 5",
    "  Z5 ge full@WD30L noG@WD30L 5",
    "  Z6 gt full@P inc@P",
    "  Z7 bar full@WD30L",
    "  Z8 within full@clean long+fix+forget 8",
    "### 24 detector-range-hold-confirm held29 brain/subSensedDetDetectorRangeHoldConfirmHeld29.jsonl designated m23re30k bar m23re30k@[WD30L,R3D30] full 6 partly 4",
    "ARMS exact long+fix+forget inc@WD30L m23@WD30L m23e30@WD30L m23e30k@WD30L m23re30@WD30L m23re30k@WD30L inc@R3D30 m23@R3D30 m23e30@R3D30 m23e30k@R3D30 m23re30@R3D30 m23re30k@R3D30 m23re30k@clean",
    "  I1 ge m23e30@R3D30 m23re30@R3D30 5",
    "  I2 within m23re30k@WD30L m23re30@WD30L 8",
    "  I3 ge hard-gaps:m23e30k@WD30L hard-gaps:m23e30@WD30L 3",
    "  I4 le m23re30k@WD30L max(m23re30@WD30L,m23e30k@WD30L) 5",
    "  I5 bar m23re30k@WD30L",
    "  I6 bar m23re30k@R3D30",
    "  I7 ge m23re30k@R3D30 m23@R3D30 10",
    "  I8 within m23re30k@clean long+fix+forget 8",
];


// the same printer as the one that made the literal, so that a spec and the registration are compared line for line
const T = (t) => typeof t === "string" ? t : t.k ? `${t.k}:${t.a}` : t.sum ? `sum(${t.sum.join(",")})` : t.max ? `max(${t.max.join(",")})` : String(t);
const P = (p) => p.op === "and" ? `${p.id} and[${p.of.map((q) => P(q).replace(/^ /, "")).join("; ")}]` : p.op === "bar" || p.op === "notBar" ? `${p.id} ${p.op} ${p.a}` : p.op === "eachGe" ? `${p.id} eachGe [${p.arms.join(",")}] ${p.b} ${p.n}` : p.op === "spread" || p.op === "spreadGt" ? `${p.id} ${p.op} [${p.arms.join(",")}] ${p.n}` : p.op === "gt" ? `${p.id} gt ${T(p.a)} ${T(p.b)}` : `${p.id} ${p.op} ${T(p.a)} ${T(p.b)} ${p.n}`;
const digestOf = () => Sp.STUDY_NAMES.flatMap((n) => { const s = Sp.SPECS[n]; return [`### ${s.followUp} ${n} ${s.held} ${s.out} designated ${s.designated} bar ${s.bar.arm}@[${s.bar.conds}] full ${s.verdict.full} partly ${s.verdict.partly}`, "ARMS " + s.arms.join(" "), ...s.preds.map((p) => "  " + P(p))]; });

guard("1", () => {
    if (!want(1)) return;
    console.log("1. THE SPECS");
    const got = digestOf(), bad = got.map((l, i) => (l === REGISTERED[i] ? null : `${i}: ${l.slice(0, 90)}`)).filter(Boolean);
    ok("!! the seventeen specs ARE the registrations, line for line (the arms flown, the designated detector, the bar's arm and conditions, the verdict rule, every prediction's operation, terms and threshold): 169 lines against the literal copy", got.length === REGISTERED.length && bad.length === 0, bad.slice(0, 3).join(" | "));
    const names = Sp.STUDY_NAMES;
    ok("!! the studies are follow-ups 8 to 24 in order, one each, named by the backlog id without nav-sensed- (dropout-range, confirm-range, detector-range, detector-confirm, detector-hold, detector-range-hold, detector-range-confirm, detector-hold-range, detector-hold-confirm, detector-hold-confirm-range, detector-hold-confirm-range-hold, detector-range-confirm-hold, detector-confirm-hold, detector-hold-confirm-hold, detector-confirm-hold-confirm, detector-hold-confirm-hold-confirm, detector-range-hold-confirm); follow-up N flies HELD(N + 5), seeds (N + 5) x 100 + 1 to + 60; no two share a set or a file; the files are under brain/ and end in the set's name", same(names.map((n) => Sp.SPECS[n].followUp), Array.from({ length: 17 }, (_, i) => 8 + i)) && names.join() === "dropout-range,confirm-range,detector-range,detector-confirm,detector-hold,detector-range-hold,detector-range-confirm,detector-hold-range,detector-hold-confirm,detector-hold-confirm-range,detector-hold-confirm-range-hold,detector-range-confirm-hold,detector-confirm-hold,detector-hold-confirm-hold,detector-confirm-hold-confirm,detector-hold-confirm-hold-confirm,detector-range-hold-confirm" && names.every((n) => { const s = Sp.SPECS[n], k = s.followUp + 5; return s.held === `held${k}` && same(X.SENSE_SETS[s.held], Array.from({ length: 60 }, (_, i) => k * 100 + 1 + i)) && /^brain\/subSensedDet[A-Za-z]+Held\d+\.jsonl$/.test(s.out) && s.out.endsWith(`Held${k}.jsonl`); }) && new Set(names.map((n) => Sp.SPECS[n].out)).size === 17 && new Set(names.map((n) => Sp.SPECS[n].held)).size === 17);
    ok("!! every spec is well formed: its arms are unique and flyable (exact, the clean long+fix+forget or <detector>@<condition>), the bar's arms are flown, the bar is the designated arm's, every term of every prediction is an arm the study flies, the operations are known (checkSpec); the specs and their parts are frozen", names.every((n) => Sp.checkSpec(Sp.SPECS[n]).length === 0) && Object.isFrozen(Sp.SPECS) && names.every((n) => Object.isFrozen(Sp.SPECS[n]) && Object.isFrozen(Sp.SPECS[n].arms) && Object.isFrozen(Sp.SPECS[n].preds) && Object.isFrozen(Sp.SPECS[n].bar) && Object.isFrozen(Sp.SPECS[n].verdict)) && same(Sp.STUDY_NAMES, Object.keys(Sp.SPECS)));
    const base = Sp.SPECS["detector-hold"], mut = (f) => Sp.checkSpec(f({ ...base, arms: [...base.arms], preds: base.preds.map((p) => ({ ...p })), bar: { ...base.bar, conds: [...base.bar.conds] } })).join(" | ");
    ok("!! checkSpec names each fault: a repeated arm, an arm that cannot be flown, a missing exact, a missing clean map, a set that does not exist, a bar arm that is not flown, a bar that is not the designated arm's, a prediction on an arm the study does not fly (in a term, in `arms`, in an `and`), an unknown operation", /arms repeat/.test(mut((s) => ({ ...s, arms: [...s.arms, s.arms[2]] }))) && /cannot be flown/.test(mut((s) => ({ ...s, arms: [...s.arms, "nonesuch@W"] }))) && /exact and long\+fix\+forget must be flown/.test(mut((s) => ({ ...s, arms: s.arms.slice(1) }))) && /exact and long\+fix\+forget must be flown/.test(mut((s) => ({ ...s, arms: s.arms.filter((a) => a !== "long+fix+forget") }))) && /set held99 does not exist/.test(mut((s) => ({ ...s, held: "held99" }))) && /bar arm e30@P is not flown/.test(mut((s) => ({ ...s, bar: { arm: "e30", conds: ["P", "D30"] }, arms: s.arms.filter((a) => a !== "e30@P") }))) && /the bar is not the designated/.test(mut((s) => ({ ...s, designated: "inc" }))) && /O1: zzz@W is not a flown arm/.test(mut((s) => ({ ...s, preds: s.preds.map((p) => (p.id === "O1" ? { ...p, a: "zzz@W" } : p)) }))) && /O1: yyy@W is not a flown arm/.test(mut((s) => ({ ...s, preds: s.preds.map((p) => (p.id === "O1" ? { ...p, b: { sum: ["inc@W", "yyy@W"] } } : p)) }))) && /X9: qqq@W is not a flown arm/.test(mut((s) => ({ ...s, preds: [...s.preds, { id: "X9", op: "eachGe", arms: ["qqq@W"], b: "inc@W", n: 1 }] }))) && /: ppp@W is not a flown arm/.test(mut((s) => ({ ...s, preds: [...s.preds, { id: "X9", op: "and", of: [{ id: "", op: "bar", a: "ppp@W" }] }] }))) && /O1: unknown operation foo/.test(mut((s) => ({ ...s, preds: s.preds.map((p) => (p.id === "O1" ? { ...p, op: "foo" } : p)) }))) && /kind-term/.test("kind-term") && mut((s) => ({ ...s, preds: [...s.preds, { id: "X9", op: "ge", a: { k: "hard-gaps", a: "inc@W" }, b: "inc@D30", n: 1 }] })) === "");
});

// ---- runs made up with known counts ----
const NSC = 60;
/** counts: { arm: { kind: reached } } -> run records (NSC scenarios a kind, hard-gaps in widths 24, 32, 40 in turn). Reached ones come first. */
function mkRuns(counts, extra = {}) {
    const runs = [];
    for (const [arm, byKind] of Object.entries(counts)) for (const kind of KINDS) {
        const reached = byKind[kind] ?? byKind.all;
        if (reached === undefined) continue;
        for (let i = 0; i < NSC; i++) runs.push({ arm, kind, seed: 1000 + i, gap: kind === "hard-gaps" ? [24, 32, 40][i % 3] : null, status: i < reached ? "reached" : i % 3 === 0 ? "timeout" : "collided", reached: i < reached, t: 100 + i, path: i < reached ? 110 + i : 400, chord: 100, minClearance: i < reached ? 5 + (i % 7) : -1, ensonified: 0.8, offsetEnd: 3, plans: 50 + i, ...extra });
    }
    return runs;
}
const specOf = (o) => ({ name: "t", followUp: 99, arms: ["exact", "long+fix+forget", "a@W", "b@W", "c@W", "x@W", "a@D30"], bar: { arm: "a", conds: ["W", "D30"] }, verdict: { full: 6, partly: 4 }, designated: "a", preds: [], ...o });
const sumOf = (counts, spec = specOf({})) => St.summarize(mkRuns(counts), spec);

guard("2", () => {
    if (!want(2)) return;
    console.log("\n2. THE ENGINE");
    const sp = specOf({}), runs = mkRuns({ exact: { all: 59 }, "a@W": { "hard-islands": 50, "hard-gaps": 40, "hard-current": 30 }, "zzz@W": { all: 10 } }), sum = St.summarize(runs, sp);
    const c = sum.cells["hard-islands"]["a@W"], g = sum.cells["hard-gaps"]["a@W"];
    ok("!! summarize: a cell per kind and arm (scenarios, reached, rate, the collided and timed-out counts, the median time of the arrivals, the median clearance), the three kinds pooled by sum, an arm that flew nothing has no cell, an arm the spec does not list is ignored", c.n === 60 && c.reached === 50 && c.rate === 50 / 60 && c.collided === 7 && c.timeout === 3 && c.left === 0 && c.other === 0 && c.medianTime === 124.5 && c.medianClearance === 7 && Math.abs(c.medianChord - 1.345) < 0.01 && c.medianSeen === 0.8 && c.medianOffsetEnd === 3 && c.medianPlans === 79.5 && sum.pooled["a@W"].reached === 120 && sum.pooled["a@W"].n === 180 && sum.pooled.exact.reached === 177 && !sum.cells["hard-islands"]["b@W"] && !sum.pooled["b@W"] && !sum.pooled["zzz@W"] && !sum.cells["hard-islands"]["zzz@W"] && g.reached === 40);
    ok("!! summarize: the gaps by width (hard-gaps only, 24, 32 and 40 m in turn: of 40 reached out of 60 scenarios the 20 24-m gaps are scenarios 0, 3, 6, ... and those with an index below 40 are reached), kinds other than hard-gaps have none, an arm that flew no gap has none, the medians of path over chord, plans and offset", sum.widths["a@W"][24].n === 20 && sum.widths["a@W"][24].reached === 14 && sum.widths["a@W"][32].reached === 13 && sum.widths["a@W"][40].reached === 13 && sum.widths["b@W"] === undefined && sum.widths.exact[24].reached === 20 - (59 > 0 ? 0 : 0) && Number.isFinite(c.medianPlans) && c.medianOffsetEnd === 3 && Math.abs(c.medianChord - 1.35) < 0.2);
    const mixed = [...mkRuns({ "a@W": { all: 2 } }).filter((r) => r.kind === "hard-islands").slice(0, 2), ...["collided", "collided", "collided", "left", "timeout", "timeout", "submerged"].map((status, i) => ({ arm: "a@W", kind: "hard-islands", seed: 9000 + i, gap: null, status, reached: false, t: null, path: 400, chord: 100, minClearance: -1, ensonified: 0.8, offsetEnd: 3, plans: 50 })), { arm: "a@W", kind: "hard-traffic", seed: 1, gap: null, status: "reached", reached: true, t: 1, path: 1, chord: 1, minClearance: 1, ensonified: 1, offsetEnd: 1, plans: 1 }], sm = St.summarize(mixed, sp), mc = sm.cells["hard-islands"]["a@W"];
    ok("!! every status is counted in its own column (2 reached, 3 collided, 1 left, 2 timed out, 1 of another kind: the vessel's own status), a rate is reached over scenarios, and a run of a kind other than the three static ones is in no cell and not in the pooled count (pooled: 9 scenarios, 2 reached)", mc.n === 9 && mc.reached === 2 && mc.collided === 3 && mc.left === 1 && mc.timeout === 2 && mc.other === 1 && Math.abs(mc.rate - 2 / 9) < 1e-12 && sm.pooled["a@W"].n === 9 && sm.pooled["a@W"].reached === 2 && sm.cells["hard-gaps"]["a@W"] === undefined);
    const V = (t) => St.value(sum, t);
    ok("!! value: a string is the arm's reached count over the three kinds (120), { k, a } one kind's (50), { sum } adds (exact + a@W = 297), { max } takes the largest (177), a missing arm anywhere is NaN, in a sum and in a max too", V("a@W") === 120 && V({ k: "hard-islands", a: "a@W" }) === 50 && V({ sum: ["exact", "a@W"] }) === 297 && V({ max: ["exact", "a@W"] }) === 177 && Number.isNaN(V("nope")) && Number.isNaN(V({ k: "hard-gaps", a: "nope" })) && Number.isNaN(V({ sum: ["exact", "nope"] })) && Number.isNaN(V({ max: ["exact", "nope"] })) && Number.isNaN(V(undefined)) && V({ k: "hard-current", a: "a@W" }) === 30);
    const bk = (e, a) => St.barKinds(St.summarize(mkRuns({ exact: { all: e }, "a@W": { all: a } }), sp), "a@W");
    ok("!! the bar is 80% of exact's count, inclusive, kind by kind: against exact 60 an arm with 48 holds (0.8) and 47 does not; against 59 an arm with 48 holds (47.2) and 47 does not; against 0 nothing holds; an arm not flown holds nowhere; the kinds are judged separately", St.BAR_RATE === 0.8 && same(bk(60, 48), { "hard-islands": true, "hard-gaps": true, "hard-current": true }) && same(bk(60, 47), { "hard-islands": false, "hard-gaps": false, "hard-current": false }) && bk(59, 48)["hard-gaps"] === true && bk(59, 47)["hard-gaps"] === false && bk(0, 0)["hard-gaps"] === false && St.barKinds(sumOf({ exact: { all: 60 } }), "a@W")["hard-gaps"] === false && same(St.barKinds(sumOf({ exact: { all: 60 }, "a@W": { "hard-islands": 48, "hard-gaps": 47, "hard-current": 60 } }), "a@W"), { "hard-islands": true, "hard-gaps": false, "hard-current": true }));
    // holds: every operation at its edge
    const S = sumOf({ exact: { all: 60 }, "long+fix+forget": { all: 58 }, "a@W": { all: 40 }, "b@W": { all: 30 }, "c@W": { all: 35 }, "a@D30": { all: 48 }, "x@W": { all: 40 } }), h = (p) => St.holds(S, p);
    const geP = (n, a = "a@W", b = "b@W") => ({ op: "ge", a, b, n });
    ok("!! ge: a - b >= n, inclusive: 3 x 40 - 3 x 30 = 30 reached more, so n = 30 holds and n = 31 does not, n = -30 holds in the other direction only (b - a = -30 >= -30); the terms may be sums and kinds", h(geP(30)) && !h(geP(31)) && h(geP(-30, "b@W", "a@W")) && !h(geP(-29, "b@W", "a@W")) && h({ op: "ge", a: { sum: ["a@W", "b@W"] }, b: { sum: ["b@W", "c@W"] }, n: 15 }) && !h({ op: "ge", a: { sum: ["a@W", "b@W"] }, b: { sum: ["b@W", "c@W"] }, n: 16 }) && h({ op: "ge", a: { k: "hard-gaps", a: "a@W" }, b: { k: "hard-gaps", a: "b@W" }, n: 10 }) && !h({ op: "ge", a: { k: "hard-gaps", a: "a@W" }, b: { k: "hard-gaps", a: "b@W" }, n: 11 }));
    ok("!! gt is strict (a@W against x@W, both 120: not more; a@W against b@W: more), le is a - b <= n inclusive (30 holds, 29 does not; against a max of two arms), within is |a - b| <= n inclusive and symmetric (30 holds from either side, 29 does not)", !h({ op: "gt", a: "a@W", b: "x@W" }) && h({ op: "gt", a: "a@W", b: "b@W" }) && !h({ op: "gt", a: "b@W", b: "a@W" }) && h({ op: "le", a: "a@W", b: "b@W", n: 30 }) && !h({ op: "le", a: "a@W", b: "b@W", n: 29 }) && h({ op: "le", a: "a@W", b: { max: ["b@W", "c@W"] }, n: 15 }) && !h({ op: "le", a: "a@W", b: { max: ["b@W", "c@W"] }, n: 14 }) && h({ op: "within", a: "a@W", b: "b@W", n: 30 }) && h({ op: "within", a: "b@W", b: "a@W", n: 30 }) && !h({ op: "within", a: "a@W", b: "b@W", n: 29 }) && !h({ op: "within", a: "b@W", b: "a@W", n: 29 }) && h({ op: "within", a: "a@W", b: "x@W", n: 0 }));
    ok("!! bar holds when the arm reaches 80% of exact in every kind (a@D30 at 48 of 60) and not when it misses one kind; notBar is the other way round, and false for an arm that was not flown; eachGe needs every arm: b@W + 30 = 90 is reached by a@W (120) and c@W (105) and not by x@W at n = 31 (none beyond 30 more than b: 120 - 90 = 30)", h({ op: "bar", a: "a@D30" }) && !h({ op: "bar", a: "a@W" }) && !h({ op: "notBar", a: "a@D30" }) && h({ op: "notBar", a: "a@W" }) && !h({ op: "bar", a: "nope@W" }) && !h({ op: "notBar", a: "nope@W" }) && h({ op: "eachGe", arms: ["a@W", "c@W"], b: "b@W", n: 15 }) && !h({ op: "eachGe", arms: ["a@W", "c@W"], b: "b@W", n: 16 }) && h({ op: "eachGe", arms: ["a@W", "x@W"], b: "b@W", n: 30 }) && !h({ op: "eachGe", arms: ["a@W", "x@W"], b: "b@W", n: 31 }) && !h({ op: "eachGe", arms: ["a@W", "nope@W"], b: "b@W", n: 0 }));
    ok("!! spread is the largest minus the smallest <= n (a, b, c: 120 - 90 = 30: 30 holds, 29 does not), spreadGt is the same > n (30 does not hold, 29 does); and needs every part; an unknown operation throws, naming it", h({ op: "spread", arms: ["a@W", "b@W", "c@W"], n: 30 }) && !h({ op: "spread", arms: ["a@W", "b@W", "c@W"], n: 29 }) && !h({ op: "spreadGt", arms: ["a@W", "b@W", "c@W"], n: 30 }) && h({ op: "spreadGt", arms: ["a@W", "b@W", "c@W"], n: 29 }) && h({ op: "and", of: [geP(30), geP(30)] }) && !h({ op: "and", of: [geP(30), geP(31)] }) && !h({ op: "and", of: [geP(31), geP(30)] }) && h({ op: "and", of: [] }) && /unknown operation "zip"/.test((() => { try { h({ op: "zip" }); return ""; } catch (e) { return e.message; } })()));
    ok("!! a missing arm is a miss in every comparison (NaN): ge, gt, le, within, spread, spreadGt, eachGe and `and` over it are all false", ["ge", "gt", "le", "within"].every((op) => !h({ op, a: "nope@W", b: "b@W", n: 1000 }) && !h({ op, a: "a@W", b: "nope@W", n: 1000 })) && !h({ op: "spread", arms: ["a@W", "nope@W"], n: 1000 }) && !h({ op: "spreadGt", arms: ["a@W", "nope@W"], n: -1000 }) && !h({ op: "and", of: [geP(0), { op: "gt", a: "nope@W", b: "a@W" }] }));
    const Sm = sumOf({ exact: { all: 60 }, "a@W": { "hard-islands": 48, "hard-gaps": 40, "hard-current": 48 }, "b@W": { "hard-islands": 48, "hard-gaps": 48, "hard-current": 48 } });
    ok("!! `bar` needs EVERY kind (48, 40, 48 against 60: no; 48, 48, 48: yes) and `notBar` is true for the first and false for the second", !St.holds(Sm, { op: "bar", a: "a@W" }) && St.holds(Sm, { op: "bar", a: "b@W" }) && St.holds(Sm, { op: "notBar", a: "a@W" }) && !St.holds(Sm, { op: "notBar", a: "b@W" }) && same(St.barKinds(Sm, "a@W"), { "hard-islands": true, "hard-gaps": false, "hard-current": true }));
    // judge
    const six = (held) => { const spec = specOf({}); const e = 60; const a = (k, on) => (on ? 48 : 47); const counts = { exact: { all: e }, "a@W": {}, "a@D30": {} }; const cells = [["W", "hard-islands"], ["W", "hard-gaps"], ["W", "hard-current"], ["D30", "hard-islands"], ["D30", "hard-gaps"], ["D30", "hard-current"]]; cells.forEach(([c, k], i) => { counts[`a@${c}`][k] = a(k, i < held); }); return St.judge(St.summarize(mkRuns(counts), spec), spec); };
    ok("!! judge, a bar of six cells (three kinds under each of two conditions): 6 held is SUPPORTED, 5 and 4 are PARTLY SUPPORTED, 3 and 0 are NOT SUPPORTED; cellsHeld counts across both conditions and total is 6; the cells are reported by condition and kind", six(6).verdict === "SUPPORTED" && six(5).verdict === "PARTLY SUPPORTED" && six(4).verdict === "PARTLY SUPPORTED" && six(3).verdict === "NOT SUPPORTED" && six(0).verdict === "NOT SUPPORTED" && six(5).cellsHeld === 5 && six(6).total === 6 && six(4).cells.W["hard-current"] === true && six(4).cells.D30["hard-islands"] === true && six(4).cells.D30["hard-gaps"] === false && six(2).cells.W["hard-gaps"] === true && six(2).cells.W["hard-current"] === false);
    const three = (held) => { const spec = specOf({ bar: { arm: "a", conds: ["W"] }, verdict: { full: 3, partly: 2 } }); const counts = { exact: { all: 60 }, "a@W": {} }; KINDS.forEach((k, i) => { counts["a@W"][k] = i < held ? 48 : 47; }); return St.judge(St.summarize(mkRuns(counts), spec), spec); };
    ok("!! judge, a bar of three cells (full 3, partly 2): 3 SUPPORTED, 2 PARTLY SUPPORTED, 1 and 0 NOT SUPPORTED, total 3; the verdict uses the spec's own thresholds", three(3).verdict === "SUPPORTED" && three(2).verdict === "PARTLY SUPPORTED" && three(1).verdict === "NOT SUPPORTED" && three(0).verdict === "NOT SUPPORTED" && three(3).total === 3 && three(2).cellsHeld === 2);
    const jp = (() => { const spec = specOf({ preds: [{ id: "P1", text: "one", op: "ge", a: "a@W", b: "b@W", n: 30 }, { id: "P2", text: "two", op: "gt", a: "b@W", b: "a@W" }] }); return St.judge(St.summarize(mkRuns({ exact: { all: 60 }, "a@W": { all: 40 }, "b@W": { all: 30 } }), spec), spec); })();
    ok("!! judge also scores every prediction by its id (P1 held, P2 missed)", same(jp.preds, { P1: true, P2: false }));
    // table and verdictText
    const spec2 = specOf({ preds: [{ id: "P1", text: "the first thing", op: "ge", a: "a@W", b: "b@W", n: 30 }, { id: "P2", text: "the second thing", op: "gt", a: "b@W", b: "a@W" }] }), sum2 = St.summarize(mkRuns({ exact: { all: 60 }, "long+fix+forget": { all: 58 }, "a@W": { all: 48 }, "b@W": { all: 30 } }), spec2), tb = St.table(sum2, spec2, "TITLE").split("\n");
    ok("!! table: the title, a block for each kind in order (name, header, one row per arm flown, in the spec's order, arms with no flights left out), the three kinds together, and the gaps by width; a row reads arm | reached/n rate | collided left timeout other | the medians; for exact in hard-islands: 60/60 100% and the median time 129.5 s", tb[0] === "TITLE" && tb[2] === "hard-islands" && tb[3] === "arm               | reached      | collided left timeout other | median time (s) | median path/chord | median min clearance (m) | grid ensonified | offset at end (m) | plans (median)" && tb[6] === "a@W               | 48/60 80%    |        8    0       4     0 | 123.50          | 1.33              | 7.00                     | 80%             | 3.00              | 79.50" && tb.indexOf("hard-gaps") > tb.indexOf("hard-islands") && tb.indexOf("hard-current") > tb.indexOf("hard-gaps") && tb.indexOf("the three kinds together") > tb.indexOf("hard-current") && tb.indexOf("hard-gaps reached, by the width of the gap") > tb.indexOf("the three kinds together") && tb[4].startsWith("exact             | 60/60 100%") && tb[4].includes("| 129.50") && tb[5].startsWith("long+fix+forget   | 58/60 97%") && tb[6].startsWith("a@W               | 48/60 80%") && tb[7].startsWith("b@W               | 30/60 50%") && !tb.some((l) => l.startsWith("c@W")) && tb[tb.indexOf("the three kinds together") + 2].startsWith("exact             | 180/180 100%") && tb[tb.length - 1].startsWith("b@W") && tb[tb.length - 1].includes("| 10     | 10     | 10"));
    const vj = St.judge(sum2, spec2), vt = St.verdictText(vj, spec2).split("\n");
    ok("!! verdictText: the bar's line (the designated detector, 80%, each kind under each condition HELD or MISSED, the count), a line per prediction (its id, its text, HELD or MISSED) in order, and VERDICT: <verdict>", vt.length === 4 && vt[0].startsWith("a (the designated detector of follow-up 99) reaches at least 80% of what exact reaches in each kind under each condition (the bar): W: hard-islands HELD, hard-gaps HELD, hard-current HELD; D30: hard-islands MISSED, hard-gaps MISSED, hard-current MISSED (3 of 6)") && vt[1] === "P1 the first thing: HELD" && vt[2] === "P2 the second thing: MISSED" && vt[3] === "VERDICT: NOT SUPPORTED");
});

guard("3", () => {
    if (!want(3)) return;
    console.log("\n3. THE COMMAND");
    const run = (argv, io = {}) => { const o = [], e = []; const code = St.command(argv, { out: (m) => o.push(m), err: (m) => e.push(m), ...io }); return { code, out: o, err: e }; };
    const bad = (argv) => run(argv);
    ok("!! every bad argument is refused with exit 2 and a message naming the way out: an unknown study, an unknown set, a seeds that is not a positive whole number (0, -1, 1.5, text), an unknown flag, no study at all, a set other than dev or the study's own, --write on dev", (() => { const r = [bad(["--study", "nope"]), bad(["--study", "detector-hold", "--set", "held99"]), bad(["--study", "detector-hold", "--seeds", "0"]), bad(["--study", "detector-hold", "--seeds", "-1"]), bad(["--study", "detector-hold", "--seeds", "1.5"]), bad(["--study", "detector-hold", "--seeds", "x"]), bad(["--study", "detector-hold", "--bogus"]), bad([]), bad(["--set", "dev"]), bad(["--study", "detector-hold", "--set", "held13"]), bad(["--study", "detector-hold", "--write"])]; return r.every((x) => x.code === 2 && x.err.length === 1 && x.out.length === 0) && /--study needs one of dropout-range, confirm-range/.test(r[0].err[0]) && /--set needs one of dev, held13, held14/.test(r[1].err[0]) && /--seeds needs a positive whole number/.test(r[2].err[0]) && /--seeds needs a positive/.test(r[5].err[0]) && /unknown argument "--bogus"/.test(r[6].err[0]) && /--study dropout-range\|confirm-range/.test(r[7].err[0]) && /is needed/.test(r[8].err[0]) && /detector-hold study is flown on dev or held17, not held13/.test(r[9].err[0]) && /--write goes with --set held17 only/.test(r[10].err[0]); })());
    ok("!! the sets: dev is seeds 1 to 30 and each study's own set is the library's (held13 to held29), and the command knows exactly these", same(St.SETS.dev, X.SENSE_SETS.dev) && same(Object.keys(St.SETS), ["dev", ...Array.from({ length: 17 }, (_, i) => `held${13 + i}`)]) && Object.keys(St.SETS).slice(1).every((k) => St.SETS[k] === X.SENSE_SETS[k]) && Object.isFrozen(St.SETS) && St.BAR_RATE === 0.8);
    const calls = [], fake = (p, sc, arm) => { calls.push([p, sc, arm]); const i = calls.length; return { arm, kind: sc.kind, seed: sc.seed, gap: sc.gapWidth, status: arm === "exact" ? "reached" : i % 3 ? "reached" : "collided", reached: arm === "exact" || i % 3 !== 0, t: 100, path: 110, chord: 100, minClearance: 10, ensonified: 0.8, offsetEnd: 3, plans: 50 }; };
    const spec = Sp.SPECS["confirm-range"], r1 = run(["--study", "confirm-range", "--set", "dev", "--seeds", "2"], { fly: fake });
    ok("!! the flights go kind by kind, seed by seed, arm by arm in the spec's order, each with the study's pilot and the library's scenario (2 seeds x 3 kinds x 14 arms = 84 flights); --seeds takes the first seeds of the set; the first line names the study, the follow-up, the set, the scenarios, the kinds and the arms; the tables and the verdict follow", calls.length === 84 && calls.every(([p, sc, arm], i) => p === St.pilot && same(sc, H.hardScenario(Math.floor((i % 28) / 14) + 1, KINDS[Math.floor(i / 28)])) && arm === spec.arms[i % 14]) && r1.code === 0 && r1.out[0] === `CONFIRM-RANGE study (follow-up 9, ${spec.title}), DEV set: 2 scenarios of each of hard-islands, hard-gaps, hard-current, 14 arms (${spec.arms.join(", ")})` && r1.out.length === 5 && r1.out[2].startsWith("margin ladder 12, 8, 6, 3 m, 260 s a flight, fix sigma 3 m, drift 0.3 m per root s, fix gain 0.2") && /VERDICT: /.test(r1.out[4]));
    const files = [], r2 = run(["--study", "detector-hold", "--set", "held17", "--seeds", "1", "--write"], { fly: fake, writeFile: (f, t) => files.push([f, t]) });
    const lines = files.length ? files[0][1].split("\n").filter(Boolean).map(JSON.parse) : [];
    ok("!! --write puts every flight in the study's file (under the engine folder, brain/subSensedDetDetectorHoldHeld17.jsonl), one JSON line each, tagged with the study and the set, in the order flown, ending in a newline; it says so; nothing is written without --write or on dev", files.length === 1 && files[0][0] === path.join(path.resolve(path.dirname(new URL(import.meta.url).pathname), ".."), "..", "brain", "subSensedDetDetectorHoldHeld17.jsonl").replace(/\/tools\/\.\.\//, "/") && lines.length === 45 && lines.every((l) => l.study === "detector-hold" && l.set === "held17") && lines[0].arm === "exact" && lines[1].arm === "long+fix+forget" && lines[15].kind === "hard-gaps" && files[0][1].endsWith("\n") && r2.out[r2.out.length - 1] === "wrote 45 flights to brain/subSensedDetDetectorHoldHeld17.jsonl" && (() => { const f2 = [], r = run(["--study", "detector-hold", "--set", "held17", "--seeds", "1"], { fly: fake, writeFile: (f, t) => f2.push(f) }), r3 = run(["--study", "detector-hold", "--seeds", "1"], { fly: fake, writeFile: (f) => f2.push(f) }); return f2.length === 0 && r.code === 0 && r3.code === 0; })());
    const names = Sp.STUDY_NAMES.map((n) => { const rr = run(["--study", n, "--set", "dev", "--seeds", "1"], { fly: fake }); return [n, rr]; });
    ok("!! every one of the seventeen studies runs end to end on made-up flights: exit 0, the first line names it and its follow-up, every arm of its spec has a row, and the last line is VERDICT: with a verdict", names.every(([n, rr]) => rr.code === 0 && rr.out[0].startsWith(`${n.toUpperCase()} study (follow-up ${Sp.SPECS[n].followUp},`) && Sp.SPECS[n].arms.every((a) => rr.out[2].includes(`\n${a.padEnd(17)} |`) || rr.out[2].includes(`${a.padEnd(17)} |`)) && /VERDICT: (SUPPORTED|PARTLY SUPPORTED|NOT SUPPORTED)$/.test(rr.out[4])));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "detstudy-")), wf = path.join(tmp, "brain", "subSensedDetDetectorHoldHeld17.jsonl");
    fs.mkdirSync(path.join(tmp, "brain"), { recursive: true });
    const rw2 = run(["--study", "detector-hold", "--set", "held17", "--seeds", "1", "--write"], { fly: fake, root: tmp });
    ok("!! the default writer puts the file under `root` (here a scratch folder: brain/subSensedDetDetectorHoldHeld17.jsonl), 45 lines, each a JSON flight tagged with the study and the set; the engine folder is not touched (no such file there)", rw2.code === 0 && fs.existsSync(wf) && fs.readFileSync(wf, "utf8").split("\n").filter(Boolean).length === 45 && JSON.parse(fs.readFileSync(wf, "utf8").split("\n")[0]).study === "detector-hold" && !fs.existsSync(path.join(path.resolve(path.dirname(new URL(import.meta.url).pathname), ".."), "..", "brain", "subSensedDetDetectorHoldHeld17.jsonl")));
    fs.rmSync(tmp, { recursive: true, force: true });
    // one real run (SWEK_GATE_NOREAL=1 leaves it out, for the sabotage runs only: the mutants that reach the default flight are then run through the whole gate)
    if (process.env.SWEK_GATE_NOREAL !== "1") {
        const real = run(["--study", "confirm-range", "--set", "confirm-range" === "x" ? "" : "held14", "--seeds", "1", "--write"], { writeFile: (f, t) => files.push([f, t]) });
        const rl = files[files.length - 1][1].split("\n").filter(Boolean).map(JSON.parse), sc = H.hardScenario(1401, "hard-islands");
        const keys = ["status", "t", "path", "plans", "pings", "occupied", "minClearance", "offsetEnd", "ensonified"], eq = (a, b) => keys.every((k) => a[k] === b[k]);
        ok("!! one REAL run (--seeds 1 of HELD14, 42 flights of follow-up 9's study): exit 0, each flight in the file is the library's own (the detector arm flown by brainDetect's flyArm, exact and long+fix+forget by the library's), the record carries the arm's name and detStats for a detector arm, and the verdict line is printed", real.code === 0 && rl.length === 42 && eq(rl[0], X.flyArm(St.pilot, sc, "exact")) && rl[0].arm === "exact" && eq(rl[1], X.flyArm(St.pilot, sc, "long+fix+forget")) && eq(rl[2], D.flyArm(St.pilot, sc, "inc@R1")) && rl[2].arm === "inc@R1" && rl[2].detStats !== undefined && rl[0].detStats === undefined && /VERDICT: /.test(real.out[real.out.length - 2]) && rl.every((l) => l.study === "confirm-range" && l.set === "held14"));

    }
});

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
