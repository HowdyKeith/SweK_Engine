// WebGLEngine/brain/subSensedDetect-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subSensedDetect-selfcheck.mjs      (~90 s)
//
// THE GENERAL DETECTOR (brain/subSensedDetect.mjs), held to its word before any set of follow-ups 8 to 24 is flown (registrations: brain/SENSED_NAV_WIP.md):
//   1  THE TABLES    the faults (COND) against a literal copy of the registrations' words, and every detector of follow-ups 7 to 24 (ARM_DEFS) against the registration's own description of it, written here by hand and not read back from the code; the names, splitArm, describe
//   2  THE MARK      m of the last n readings (a run is [k, k]), missing readings counting as free, the window n and no more, the near rule inside `near` (inclusive) and the far rule beyond it, the evidence a mark starts with
//   3  THE CLEAR     L of L free readings (a run), a cell with fewer than L readings is not cleared, the step gate (far, near, the edge at 80 m inclusive), the evidence hold (min(cap, evidence)), K = ceil(f L) of L (ceil, not floor or round, and no float noise), the ramp (30, 18 at 80 m, 12 at 120, 1 at the edge), the range the hold goes by (ping, mark, min), a cleared cell is emptied
//   4  THE GHOST     a cell cleared with enough evidence is re-marked by one reading for `life` readings and not after, with the evidence put back to `min`, not without the evidence, with a neighbour (read occupied at the same ping, either side of the cell and on a diagonal, or marked; not two cells away, not a reading of an earlier ping), refused and counted, forgotten when the life ends
//   5  THE SPECS     a malformed rule throws, naming the field
//   6  THE FLIGHTS   the new rules reproduce the old ones flight for flight: a run of one with a clear of one is the map that forgets, d1-12, d2-12 and d3-12 are follow-up 7's detectors; `drop` is `objects`; a leak of 1 is no dropout; the record carries detStats; the dispatch; determinism
//
// SABOTAGE LOG (each mutant is a break of one line of brain/subSensedDetect.mjs, run through this gate in a scratch copy; red BY NAME is a catch, a crash is counted apart, a mutant that lets a whole row through is named):
//   (written below when the sabotage is done)
"use strict";
import * as X from "./subSensedNav.mjs";
import * as D from "./subSensedDetect.mjs";
import * as H from "./subHardNav.mjs";
import * as AP from "./autopilotSub.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const thrown = (f) => { try { f(); return "no throw"; } catch (e) { return String(e.message); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const guard = (n, f) => { try { f(); } catch (e) { fails++; console.log(`  FAIL  !! section ${n} ran to the end (THE GATE THREW: ${String((e && e.message) || e).slice(0, 160)})`); } };
const pilot = (s, t, c) => AP.decide(s, t, c);
console.log("subSensedDetect-selfcheck -- the general detector\n");

// ---- driving one cell ----
const W0 = X.createMap().w, CELL = 5 * W0 + 20;   // cell (20, 5): index 500 on the 96-wide map
const mkSpec = (mark, clear, o = {}) => ({ mark, markNear: o.markNear || null, near: 80, clear: { cap: 30, capNear: 30, evidence: false, f: 1, shape: "step", range: "ping", ...clear }, ghost: o.ghost || null });
const NEVER = { cap: 30, capNear: 30 };   // a clear that no short test reaches: 30 free readings in a row
/** Drive cell 500 with readings [hit, d] (or a bare 0 / 1 at distance `d0`); returns the occupancy after each reading as a string, the map and the detector. */
function drive(spec, readings, d0 = 100, map = X.createMap()) {
    const det = D.makeDetector(spec), out = [];
    for (const r of readings) { const [h, d] = Array.isArray(r) ? r : [r, d0]; det.begin(map); det.apply(map, { i: CELL, gx: 20, gy: 5, hit: !!h, d }); det.end(map); out.push(map.occ[CELL]); }
    return { out: out.join(""), map, det };
}
const bits = (s) => s.split("").map(Number);

guard("1", () => {
    console.log("1. THE TABLES");
    const J = (o) => JSON.stringify(o);
    const WHITE = '"miss":0.2,"falseRate":0.001,"occlude":true,"headingSigma":0.03490658503988659';
    const dp = (n, leak) => `{"rate":0.2,"persist":${n},"rangeDep":true${leak ? `,"leak":${leak}` : ""}}`;
    const expectCond = {
        clean: "null",
        W: `{"miss":0.2,"falseRate":0.01,"occlude":true,"headingSigma":0.03490658503988659}`,
        V: `{"miss":0.4,"falseRate":0.01,"occlude":true,"headingSigma":0.03490658503988659}`,
        R1: `{"miss":0.2,"falseRate":0.01,"occlude":true,"headingSigma":0.03490658503988659,"rangeDep":true}`,
        R3: `{"miss":0.2,"falseRate":0.03,"occlude":true,"headingSigma":0.03490658503988659,"rangeDep":true}`,
        D3: `{"drop":${dp(3)}}`, D10: `{"drop":${dp(10)}}`, D30: `{"drop":${dp(30)}}`,
        WD30: `{"miss":0.2,"falseRate":0.01,"occlude":true,"headingSigma":0.03490658503988659,"drop":${dp(30)}}`,
        VD30: `{"miss":0.4,"falseRate":0.01,"occlude":true,"headingSigma":0.03490658503988659,"drop":${dp(30)}}`,
        WD30L: `{"miss":0.2,"falseRate":0.01,"occlude":true,"headingSigma":0.03490658503988659,"drop":${dp(30, 0.15)}}`,
        R3D30: `{"miss":0.2,"falseRate":0.03,"occlude":true,"headingSigma":0.03490658503988659,"rangeDep":true,"drop":${dp(30)}}`,
    };
    const bad = Object.keys(expectCond).filter((k) => J(D.COND[k]) !== expectCond[k]);
    ok("!! the conditions are the registrations' words, one by one: clean none; W follow-up 4's four white faults (misses 0.2, first surfaces only, a white 2 degree heading error) at a false rate of 0.01; V the same with misses of 0.4; R1 and R3 the same white faults with the range law on and the false rate 0.01 and 0.03 at its mean; D3, D10 and D30 whole-obstacle dropouts of 3, 10 and 30 pings with the range law (rate 0.2) and no cell fault; WD30 W with D30's dropouts; VD30 V with them; WD30L WD30 with the dropouts leaking at 0.15 a reading; R3D30 R3 with D30's dropouts (the dropouts' range law is their own)", bad.length === 0 && Object.keys(D.COND).join() === "clean,W,V,R1,R3,D3,D10,D30,WD30,VD30,WD30L,R3D30,P" && D.COND.P === X.PERSIST.pall && Object.isFrozen(D.COND) && Object.isFrozen(D.COND.W) && Object.isFrozen(D.COND.WD30L.drop), bad.join(","));
    // the registrations' own descriptions of the detectors, by hand: mark rule; clear rule; ghost
    const F = "1 beyond 80 m, 30 within", FB = "3/3 beyond 80 m, 1/1 within", RB = "2/3 beyond 80 m, 1/1 within";
    const E = {
        "d1-1": "mark 1/1; clear 1 by range ping", "d2-1": "mark 2/2; clear 1 by range ping", "d1-12": "mark 1/1; clear 12 by range ping", "d2-3": "mark 2/2; clear 3 by range ping", "d2-12": "mark 2/2; clear 12 by range ping", "d3-12": "mark 3/3; clear 12 by range ping",
        inc: "mark 1/1; clear 1 by range ping", uni: "mark 2/2; clear 12 by range ping", lock: `mark 2/2; clear ${F} by range ping`,
        c2: "mark 2/2; clear 1 by range ping", c3: "mark 3/3; clear 1 by range ping", cr: `mark ${FB}; clear 1 by range ping`, rd: `mark ${FB}; clear ${F} by range ping`,
        "m1-1": "mark 1/1; clear 1 by range ping", "m2-2": "mark 2/2; clear 1 by range ping", "m3-3": "mark 3/3; clear 1 by range ping", "m2-3": "mark 2/3; clear 1 by range ping", "m2-4": "mark 2/4; clear 1 by range ping", "m3-4": "mark 3/4; clear 1 by range ping", m23: "mark 2/3; clear 1 by range ping",
        h12: "mark 1/1; clear 12 by range ping", h30: "mark 1/1; clear 30 by range ping", e12: "mark 1/1; clear 12 by evidence by range ping", e30: "mark 1/1; clear 30 by evidence by range ping",
        n30: `mark 1/1; clear ${F} by range ping`, re30: `mark 1/1; clear ${F} by evidence by range ping`,
        rm23: `mark ${RB}; clear 1 by range ping`, rm24: "mark 2/4 beyond 80 m, 1/1 within; clear 1 by range ping", rm34: "mark 3/4 beyond 80 m, 1/1 within; clear 1 by range ping",
        mk30: `mark 1/1; clear ${F} by evidence by range mark`, mn30: `mark 1/1; clear ${F} by evidence by range min`, rp30: "mark 1/1; clear ramp 30 by evidence by range ping", rn30: "mark 1/1; clear ramp 30 by evidence by range min",
        m23h30: "mark 2/3; clear 30 by range ping", m23e30: "mark 2/3; clear 30 by evidence by range ping",
        m11e30: "mark 1/1; clear 30 by evidence by range ping", m22e30: "mark 2/2; clear 30 by evidence by range ping", m33e30: "mark 3/3; clear 30 by evidence by range ping", m24e30: "mark 2/4; clear 30 by evidence by range ping", m34e30: "mark 3/4; clear 30 by evidence by range ping",
        rm23re30: `mark ${RB}; clear ${F} by evidence by range ping`, rm23e30: `mark ${RB}; clear 30 by evidence by range ping`, rm23re30g: `mark ${RB}; clear ${F} by evidence by range ping; ghost 4/60`, rm23e30g: `mark ${RB}; clear 30 by evidence by range ping; ghost 4/60`,
        rm23lk: `mark ${RB}; clear ${F} by range ping`, crre30: `mark ${FB}; clear ${F} by evidence by range ping`,
        f100: "mark 2/3; clear 30 by evidence by range ping", f90: "mark 2/3; clear 30 by evidence f 0.9 by range ping", f80: "mark 2/3; clear 30 by evidence f 0.8 by range ping", f60: "mark 2/3; clear 30 by evidence f 0.6 by range ping",
        m11f80: "mark 1/1; clear 30 by evidence f 0.8 by range ping", m22f80: "mark 2/2; clear 30 by evidence f 0.8 by range ping", m33f80: "mark 3/3; clear 30 by evidence f 0.8 by range ping", m23f80: "mark 2/3; clear 30 by evidence f 0.8 by range ping", m24f80: "mark 2/4; clear 30 by evidence f 0.8 by range ping", m34f80: "mark 3/4; clear 30 by evidence f 0.8 by range ping",
        full: "mark 2/3; clear 30 by evidence f 0.8 by range ping; ghost 4/60 with a neighbour", noG: "mark 2/3; clear 30 by evidence f 0.8 by range ping", gU: "mark 2/3; clear 30 by evidence f 0.8 by range ping; ghost 4/60", noK: "mark 2/3; clear 30 by evidence by range ping; ghost 4/60 with a neighbour", noM: "mark 1/1; clear 30 by evidence f 0.8 by range ping; ghost 4/60 with a neighbour", noE: "mark 2/3; clear 30 f 0.8 by range ping; ghost 4/60 with a neighbour",
        m23e30k: "mark 2/3; clear 30 by evidence f 0.8 by range ping", m23re30: `mark 2/3; clear ${F} by evidence by range ping`, m23re30k: `mark 2/3; clear ${F} by evidence f 0.8 by range ping`,
    };
    // the one place a name is read two ways: m23re30 (follow-up 24) is a 2-of-3 mark at EVERY range, and rm23re30 (17 to 19) a range-aware one
    const diff = Object.keys(E).filter((k) => !D.ARM_DEFS[k] || D.describe(k) !== E[k]);
    ok("!! every detector of follow-ups 7 to 24 is the registration's own words (written here by hand, 62 of them): the mark rule and the near rule, the hold's cap far and near, evidence, the fraction of the window, the range it goes by, the ghost; the names the notes use for the same rule (m23, m2-3) agree", diff.length === 0 && Object.keys(D.ARM_DEFS).length === Object.keys(E).length && Object.keys(D.ARM_DEFS).every((k) => k in E), diff.join(","));
    ok("!! the detectors are frozen, one made for each rule, with the same keys; a detector's rule is frozen too", same(Object.keys(D.DETECTORS), Object.keys(D.ARM_DEFS)) && Object.isFrozen(D.ARM_DEFS) && Object.isFrozen(D.DETECTORS) && Object.isFrozen(D.DETECTORS.full) && Object.isFrozen(D.ARM_DEFS.full) && Object.isFrozen(D.ARM_DEFS.full.clear) && Object.isFrozen(D.ARM_DEFS.rd.markNear) && Object.isFrozen(D.ARM_DEFS.full.ghost) && D.NEAR === 80 && D.CAP === 30 && D.WINDOW === 32);
    ok("!! splitArm: \"<detector>@<condition>\" splits at the LAST @ into the two names (rm23re30@R3D30, d2-12@clean); a name with no @, an unknown detector, an unknown condition and an empty detector each throw, naming the choices; describe throws on an unknown detector", same(D.splitArm("rm23re30@R3D30"), { name: "rm23re30", cond: "R3D30" }) && same(D.splitArm("d2-12@clean"), { name: "d2-12", cond: "clean" }) && /not <detector>@<condition>/.test(thrown(() => D.splitArm("full"))) && /not <detector>@<condition>/.test(thrown(() => D.splitArm("nope@W"))) && /not <detector>@<condition>/.test(thrown(() => D.splitArm("full@nope"))) && /not <detector>@<condition>/.test(thrown(() => D.splitArm("@W"))) && /not <detector>@<condition>/.test(thrown(() => D.splitArm("constructor@W"))) && /not <detector>@<condition>/.test(thrown(() => D.splitArm("full@toString"))) && /not <detector>@<condition>/.test(thrown(() => D.splitArm("full@__proto__"))) && /unknown detector "x"/.test(thrown(() => D.describe("x"))) && /inc, /.test(thrown(() => D.splitArm("zz@W"))));
});

guard("2", () => {
    console.log("\n2. THE MARK");
    const mk = (m, o) => mkSpec(m, NEVER, o), r = (spec, s, d) => drive(spec, bits(s), d).out;
    ok("!! a run of two marks at the second of two readings in a row and not at two apart: 1,0,1,1 marks at the fourth (0001), 1,1 at the second (01); a run of one marks at the first (1), a free reading marks nothing (0)", r(mk([2, 2]), "1011") === "0001" && r(mk([2, 2]), "11") === "01" && r(mk([1, 1]), "1") === "1" && r(mk([1, 1]), "0") === "0");
    ok("!! 2 of the last 3: 1,0,1 marks at the third (001), 1,0,0,1 does not (0000: the window at the fourth is 0,0,1), 0,1,1 marks at the third (001); missing readings count as free (one hit is not two of three: 0)", r(mk([2, 3]), "101") === "001" && r(mk([2, 3]), "1001") === "0000" && r(mk([2, 3]), "011") === "001" && r(mk([2, 3]), "1") === "0");
    ok("!! 3 of the last 4: 1,1,0,1 marks at the fourth (0001), 1,0,1,1 too (0001), 1,1,0,0,1 does not (00000: the window at the fifth is 1,0,0,1), 1,1 does not (00); 2 of the last 4: 1,0,0,1 marks (0001) and 1,0,0,0,1 does not (00000)", r(mk([3, 4]), "1101") === "0001" && r(mk([3, 4]), "1011") === "0001" && r(mk([3, 4]), "11001") === "00000" && r(mk([3, 4]), "11") === "00" && r(mk([2, 4]), "1001") === "0001" && r(mk([2, 4]), "10001") === "00000");
    ok("!! the window is n readings and no more: 2 in a row (n = 2) is not met by 1,0,1 (000: the window at the third is 0,1) and a window of 32 sees a hit 31 readings back (1 then 30 free readings then 1 marks a [2, 32] rule: the 32nd reading)", r(mk([2, 2]), "101") === "000" && r(mk([2, 32]), "1" + "0".repeat(30) + "1").endsWith("1") && r(mk([2, 32]), "1" + "0".repeat(31) + "1").endsWith("0"));
    const nr = mk([3, 3], { markNear: [1, 1] });
    ok("!! the near rule is inside 80 m, inclusive, and the far rule beyond: one reading at 80 m marks (1), one at 80.01 m does not (0), one at 40 m marks; three at 100 m mark at the third (001); the range is the range AT THE READING (a reading at 100 m, then one at 50 m marks at the second: 01)", drive(nr, [1], 80).out === "1" && drive(nr, [1], 80.01).out === "0" && drive(nr, [1], 40).out === "1" && drive(nr, [1, 1, 1], 100).out === "001" && same(drive(nr, [[1, 100], [1, 50]]).out, "01"));
    ok("!! a rule with no near rule has one rule at every range: [2, 2] at 10 m marks only at the second reading (01), and so does the far rule of a detector with one (3 in a row needs three at 100 m)", drive(mk([2, 2]), [1, 1], 10).out === "01" && drive(mk([2, 2]), [1], 10).out === "0");
    const ev = (m, s, o = {}) => drive(mkSpec(m, { cap: 30, capNear: 30, evidence: true, ...o }), bits(s)).out;
    ok("!! a mark starts the evidence at the number of occupied readings in ITS window: 2 of 3 on 1,0,1 starts it at 2, so with the evidence hold the cell is cleared by two free readings (1,0,1,0,0: 00110: held at the fourth, cleared at the fifth) and a run of one starts it at 1 (1,0: cleared at once: 10); three in a row starts it at 3 (1,1,1,0,0,0: 001110)", ev([2, 3], "10100") === "00110" && ev([1, 1], "10") === "10" && ev([3, 3], "111000") === "001110");
});

guard("3", () => {
    console.log("\n3. THE CLEAR");
    const cl = (mark, clear, s, d, o) => drive(mkSpec(mark, clear, o), bits(s), d).out;
    ok("!! a plain hold of 3 (3 free readings in a row): 1,0,0,0 holds until the fourth reading (1110) -- the cell must have three readings of history and the last three all free --, an occupied reading in the stretch starts the count again (1,0,0,1,0,0,0: 1111110); a hold of 1 clears at the first free reading (10)", cl([1, 1], { cap: 3, capNear: 3 }, "1000") === "1110" && cl([1, 1], { cap: 3, capNear: 3 }, "1001000") === "1111110" && cl([1, 1], { cap: 1, capNear: 1 }, "10") === "10");
    ok("!! a hold of 5 needs 5 readings of history AND five free: one hit then free clears at the sixth reading and not the fifth (111110), and a hit then 4 free is not enough (11111)", cl([1, 1], { cap: 5, capNear: 5 }, "100000") === "111110" && cl([1, 1], { cap: 5, capNear: 5 }, "10000") === "11111");
    const gate = { cap: 1, capNear: 30 };
    ok("!! the step gate: beyond 80 m the hold is `cap` (one free reading clears: 10 at 100 m), within it `capNear` (29 free readings do not clear a cell marked at 50 m and the 30th does); the edge is inside: a cell marked at exactly 80 m is held 30 (still marked after 5 free readings) and at 80.01 m cleared at the first", cl([1, 1], gate, "10", 100) === "10" && cl([1, 1], gate, "1" + "0".repeat(29), 50).endsWith("1") && cl([1, 1], gate, "1" + "0".repeat(30), 50).endsWith("0") && cl([1, 1], gate, "100000", 80).endsWith("1") && cl([1, 1], gate, "10", 80.01) === "10");
    const evi = (hits, free, o = {}) => drive(mkSpec([1, 1], { cap: 30, capNear: 30, evidence: true, ...o }), bits("1".repeat(hits) + "0".repeat(free))).out;
    ok("!! the evidence hold: a cell read occupied five times (one marking and four more) is cleared by five free readings and not by four (after the fifth: 0; after the fourth: 1), a cell read once by one; forty hits are held at the cap, 30 (29 free readings: marked; 30: cleared)", evi(5, 4).endsWith("1") && evi(5, 5).endsWith("0") && evi(1, 1).endsWith("0") && evi(40, 29).endsWith("1") && evi(40, 30).endsWith("0") && evi(3, 3, { cap: 12, capNear: 12 }).endsWith("0") && evi(30, 11, { cap: 12, capNear: 12 }).endsWith("1") && evi(30, 12, { cap: 12, capNear: 12 }).endsWith("0"));
    const fr = (f, hits, free, o = {}) => drive(mkSpec([1, 1], { cap: 30, capNear: 30, evidence: true, f, ...o }), bits("1".repeat(hits) + "0".repeat(free))).out;
    ok("!! a fraction of the window: with 30 hits (the window all occupied) f = 0.8 clears at the 24th free reading and not the 23rd (24 of the last 30 free), f = 1 at the 30th, f = 0.6 at the 18th, f = 0.9 at the 27th", fr(0.8, 30, 23).endsWith("1") && fr(0.8, 30, 24).endsWith("0") && fr(1, 30, 29).endsWith("1") && fr(1, 30, 30).endsWith("0") && fr(0.6, 30, 17).endsWith("1") && fr(0.6, 30, 18).endsWith("0") && fr(0.9, 30, 26).endsWith("1") && fr(0.9, 30, 27).endsWith("0"));
    ok("!! the number of free readings K is ceil(f L) with float noise taken out: f = 0.8 on a window of 3 (3 hits) needs all 3 (ceil 2.4 = 3: held after 2 free readings, cleared by the third; floor or round would clear at the second); f = 0.8 on 5 needs 4 (a hit and four free: cleared at the fourth); f = 0.7 on 10 needs 7 (0.7 x 10 = 7.000000000000001 in floating point: cleared at the SEVENTH free reading, not the eighth)", fr(0.8, 3, 2).endsWith("1") && fr(0.8, 3, 3).endsWith("0") && fr(0.8, 5, 3).endsWith("1") && fr(0.8, 5, 4).endsWith("0") && fr(0.7, 10, 6, { cap: 10, capNear: 10 }).endsWith("1") && fr(0.7, 10, 7, { cap: 10, capNear: 10 }).endsWith("0"));
    const mixed = drive(mkSpec([1, 1], { cap: 30, capNear: 30, evidence: true, f: 0.8 }), bits("1".repeat(30) + "0000000000" + "1" + "0".repeat(15))).out;
    ok("!! the K-of-L clear tolerates an occupied reading in the stretch, which a run does not: 30 hits, 10 free, a hit, then free readings clear when the last 30 hold 24 free (the 14th free reading after the hit: 15 before the last hit's window ends... i.e. held at the 13th and cleared at the 14th), while a run (f = 1) is still held there", (() => { const a = drive(mkSpec([1, 1], { cap: 30, capNear: 30, evidence: true, f: 0.8 }), bits("1".repeat(30) + "0".repeat(10) + "1" + "0".repeat(20))).out, b = drive(mkSpec([1, 1], { cap: 30, capNear: 30, evidence: true, f: 1 }), bits("1".repeat(30) + "0".repeat(10) + "1" + "0".repeat(20))).out; return a.endsWith("0") && b.endsWith("1") && mixed.length === 56; })());
    const need = (spec, d, hits = 40) => { const det = D.makeDetector(spec), map = X.createMap(); for (let k = 0; k < hits; k++) { det.begin(map); det.apply(map, { i: CELL, gx: 20, gy: 5, hit: true, d }); } let n = 0; while (map.occ[CELL] && n < 100) { det.begin(map); det.apply(map, { i: CELL, gx: 20, gy: 5, hit: false, d }); n++; } return n; };
    const ramp = mkSpec([1, 1], { cap: 30, capNear: 30, evidence: true, shape: "ramp" });
    ok("!! the ramp: max(1, round(30 (1 - r / 200))) free readings for a cell with the evidence for them: 30 at the vessel (r 0), 18 at 80 m, 15 at 100 m, 12 at 120 m, 2 at 190 m (1.5 rounds up), 1 at 200 m and 1 beyond it (the range is capped at the sonar's: 250 m)", need(ramp, 0) === 30 && need(ramp, 80) === 18 && need(ramp, 100) === 15 && need(ramp, 120) === 12 && need(ramp, 190) === 2 && need(ramp, 200) === 1 && need(ramp, 250) === 1);
    const evRamp = mkSpec([1, 1], { cap: 30, capNear: 30, evidence: true, shape: "ramp" });
    ok("!! the ramp is still capped by the evidence: a cell read twice at the vessel is held two readings and not 30", (() => { const det = D.makeDetector(evRamp), map = X.createMap(); for (let k = 0; k < 2; k++) { det.begin(map); det.apply(map, { i: CELL, gx: 20, gy: 5, hit: true, d: 0 }); } let n = 0; while (map.occ[CELL] && n < 100) { det.begin(map); det.apply(map, { i: CELL, gx: 20, gy: 5, hit: false, d: 0 }); n++; } return n === 2; })());
    // the range the hold goes by
    const rg = (range) => mkSpec([1, 1], { cap: 1, capNear: 30, range });
    const run3 = (range, rs) => drive(rg(range), rs).out;
    const mk150 = [[1, 150], [0, 50], [0, 50], [0, 50], [0, 50], [0, 50]], mn = [[1, 150], [1, 50], [0, 150], [0, 150], [0, 150], [0, 150]];
    ok("!! WHICH RANGE the gate goes by: `ping` (now) holds a cell marked at 150 m when the free readings come from 50 m (still marked after 5) and clears it at the first free reading from 150 m; `mark` (the range at the marking) clears the same cell at the first free reading from 50 m, because it was marked at 150 m; `min` (the nearest it has read occupied from) holds a cell that was read from 50 m once even when the free readings come from 150 m", run3("ping", mk150).endsWith("1") && run3("mark", mk150) === "100000" && run3("min", mn).endsWith("1") && drive(rg("ping"), mn).out === "110000" && run3("mark", mn).endsWith("0"));
    ok("!! `mark` is set when the cell is marked and not by later readings: a cell marked at 50 m and read occupied again at 150 m keeps its mark range of 50 (held near by `mark`), and `min` takes the least range of ANY occupied reading, including ones before the marking (a [2, 3] mark whose first hit came from 50 m and whose second from 150 m is held near by `min` and cleared at once by `mark`)", drive(rg("mark"), [[1, 50], [1, 150], [0, 150]]).out.endsWith("1") && drive(mkSpec([2, 3], { cap: 1, capNear: 30, range: "min" }), [[1, 50], [0, 150], [1, 150], [0, 150]]).out.endsWith("1") && drive(mkSpec([2, 3], { cap: 1, capNear: 30, range: "mark" }), [[1, 50], [0, 150], [1, 150], [0, 150]]).out === "0010");
    ok("!! a cell that is cleared is emptied: with a [2, 3] mark and a clear of one, 1,1,0,1 leaves the cell marked at the second, cleared at the third and NOT marked again by the fourth (0100): the window the third reading cleared is gone; and the evidence of an earlier marking does not carry over (a cell read twice, cleared, read twice again needs two free readings, not the first marking's count)", drive(mkSpec([2, 3], { cap: 1, capNear: 1 }), bits("1101")).out === "0100" && drive(mkSpec([1, 1], { cap: 30, capNear: 30, evidence: true }), bits("11" + "00" + "1" + "0")).out === "111010");
});

guard("4", () => {
    console.log("\n4. THE GHOST");
    const G = (o = {}) => ({ min: 4, life: 60, nbr: false, ...o });
    const g1 = (s, o = {}, ghost = G()) => drive(mkSpec([3, 3], { cap: 1, capNear: 1, ...o }, { ghost }), bits(s));
    ok("!! a cell cleared with 4 or more occupied readings is re-marked by ONE reading afterwards: 1,1,1,1 (marked at the third, evidence 4) then a free reading (cleared) then one hit marks it (001101); without a ghost the window is empty and one hit marks nothing (001100); with the evidence at 3 (three hits, a free reading, a hit) there is no ghost and the cell stays clear (00100)", g1("111101").out === "001101" && drive(mkSpec([3, 3], { cap: 1, capNear: 1 }), bits("111101")).out === "001100" && g1("11101").out === "00100");
    ok("!! the ghost lives `life` readings of the cell: after the clear, a hit at the 60th reading re-marks it and at the 61st does not (59 free readings and a hit: marked; 60 free and a hit: clear); at the end of its life the cell is emptied (a [3, 3] rule needs three fresh hits then)", g1("1111" + "0" + "0".repeat(59) + "1").out.endsWith("1") && g1("1111" + "0" + "0".repeat(60) + "1").out.endsWith("0") && (() => { const a = g1("1111" + "0" + "0".repeat(60) + "1"); return a.map.dt.ghost[CELL] === 0 && a.map.dt.nread[CELL] === 1; })());
    const evG = (s) => drive(mkSpec([3, 3], { cap: 30, capNear: 30, evidence: true }, { ghost: G() }), bits(s)).out;
    ok("!! a ghost re-mark puts the evidence back to `min` (4): after six hits (evidence 6) a clear needs six free readings; the cell is then re-marked by one hit with the evidence 4, held by three free readings and cleared by the fourth", evG("111111" + "00000").endsWith("1") && evG("111111" + "000000").endsWith("0") && evG("111111" + "000000" + "1" + "000").endsWith("1") && evG("111111" + "000000" + "1" + "0000").endsWith("0"));
    const two = (spec, steps) => {   // steps: each is a ping: [[gx, hit]...] for cells in row 5; returns the map and detector
        const det = D.makeDetector(spec), map = X.createMap();
        for (const ping of steps) { det.begin(map); for (const [gx, hit, gy = 5] of ping) det.apply(map, { i: gy * map.w + gx, gx, gy, hit, d: 100 }); det.end(map); }
        return { map, det };
    };
    const pre = [[[20, 1]], [[20, 1]], [[20, 1]], [[20, 1]], [[20, 0]]];   // cell (20, 5) marked, evidence 4, cleared: a ghost
    const gn = mkSpec([3, 3], { cap: 1, capNear: 1 }, { ghost: G({ nbr: true }) });
    const alone = two(gn, [...pre, [[20, 1]]]), withNb = two(gn, [...pre, [[20, 1], [21, 1]]]), nbBefore = two(gn, [...pre, [[19, 1], [20, 1]]]), diag = two(gn, [...pre, [[20, 1], [21, 1, 6]]]), far2 = two(gn, [...pre, [[20, 1], [22, 1]]]);
    ok("!! with a neighbour test the re-mark needs one of the eight neighbours also read occupied at the SAME ping: alone it is refused (and counted), with the cell to the right applied after it, or to the left applied before it, or on a diagonal it is marked; two cells away does not count", alone.map.occ[CELL] === 0 && alone.det.stats(alone.map).ghostRefused === 1 && withNb.map.occ[CELL] === 1 && nbBefore.map.occ[CELL] === 1 && diag.map.occ[CELL] === 1 && far2.map.occ[CELL] === 0 && withNb.det.stats(withNb.map).ghostMarks === 1 && withNb.det.stats(withNb.map).ghostRefused === 0);
    const mkd = two(gn, [...pre, [[21, 1]], [[20, 1]]]), markedNb = (() => { const det = D.makeDetector(gn), map = X.createMap(); for (const p of pre) { det.begin(map); for (const [gx, hit] of p) det.apply(map, { i: 5 * map.w + gx, gx, gy: 5, hit, d: 100 }); det.end(map); } map.occ[5 * map.w + 21] = 1; det.begin(map); det.apply(map, { i: CELL, gx: 20, gy: 5, hit: true, d: 100 }); det.apply(map, { i: 5 * map.w + 21, gx: 21, gy: 5, hit: false, d: 100 }); det.end(map); return map.occ[CELL]; })();
    ok("!! a neighbour read occupied at an EARLIER ping does not count (refused), a neighbour that was MARKED when the ping began counts even when it reads free at this ping (and is cleared by it), and a refused cell stays a ghost for its life (it is marked by a later ping that has a neighbour)", mkd.map.occ[CELL] === 0 && mkd.det.stats(mkd.map).ghostRefused === 1 && markedNb === 1 && two(gn, [...pre, [[20, 1]], [[20, 1], [21, 1]]]).map.occ[CELL] === 1);
    const edge = two(gn, [[[0, 1, 0]], [[0, 1, 0]], [[0, 1, 0]], [[0, 1, 0]], [[0, 0, 0]], [[0, 1, 0]]]);
    ok("!! a ghost at the corner of the grid (cell 0, 0) is refused without a neighbour and does not look off the grid (no throw, no mark)", edge.map.occ[0] === 0 && edge.det.stats(edge.map).ghostRefused === 1 && two(gn, [[[0, 1, 0]], [[0, 1, 0]], [[0, 1, 0]], [[0, 1, 0]], [[0, 0, 0]], [[0, 1, 0], [1, 1, 0]]]).map.occ[0] === 1);
    const expire = (() => { const steps = [...pre]; for (let k = 0; k < 59; k++) steps.push([[20, 0]]); steps.push([[20, 1]]); return two(gn, steps); })(), expire2 = (() => { const steps = [...pre]; for (let k = 0; k < 59; k++) steps.push([[20, 0]]); steps.push([[20, 1]]); return two(gn, steps).map.dt.ghost[CELL]; })();
    ok("!! a refused ghost whose life ends on that reading is forgotten (the 60th reading alone: refused, the cell emptied), and a refused ghost with life left is kept", expire.map.occ[CELL] === 0 && expire.det.stats(expire.map).ghostRefused === 1 && expire2 === 0 && expire.map.dt.nread[CELL] === 0 && alone.map.dt.ghost[CELL] > 0);
    const st = alone.det.stats(alone.map);
    ok("!! stats: marks (every marking, ghost ones included), clears, ghostMarks and ghostRefused are counted (the ghost cell: marked once, cleared once, refused once; with the neighbour: marked twice (the second by the ghost), cleared once, ghost-marked once)", same(st, { marks: 1, clears: 1, ghostMarks: 0, ghostRefused: 1 }) && same(withNb.det.stats(withNb.map), { marks: 2, clears: 1, ghostMarks: 1, ghostRefused: 0 }));
});

guard("5", () => {
    console.log("\n5. THE SPECS");
    const base = mkSpec([2, 3], {}), t = (patch) => thrown(() => D.makeDetector({ ...base, ...patch }));
    ok("!! a malformed rule throws, naming the field: mark (not a pair, m below 1, m above n, n above 32, not whole), markNear (not null, bad), near (negative, not a number), the clear (missing, cap or capNear 0 or 31 or fractional, f 0 or above 1, shape, range, evidence not a boolean), the ghost (min, life 0 or 256, nbr not a boolean)",
        /mark is/.test(t({ mark: [2] })) && /mark is/.test(t({ mark: [0, 3] })) && /mark is/.test(t({ mark: [4, 3] })) && /mark is/.test(t({ mark: [1, 33] })) && /mark is/.test(t({ mark: [1.5, 3] })) && /markNear is/.test(t({ markNear: [3, 2] })) && /markNear is/.test(t({ markNear: undefined })) && /near is/.test(t({ near: -1 })) && /near is/.test(t({ near: NaN })) &&
        /clear\.cap/.test(t({ clear: undefined })) && /clear\.cap/.test(t({ clear: { ...base.clear, cap: 0 } })) && /clear\.cap/.test(t({ clear: { ...base.clear, cap: 31 } })) && /clear\.cap/.test(t({ clear: { ...base.clear, capNear: 0 } })) && /clear\.cap/.test(t({ clear: { ...base.clear, capNear: 1.5 } })) && /clear\.cap/.test(t({ clear: { ...base.clear, capNear: 31 } })) && /clear\.cap/.test(t({ clear: { ...base.clear, cap: 1.5 } })) && /clear\.f/.test(t({ clear: { ...base.clear, f: 0 } })) && /clear\.f/.test(t({ clear: { ...base.clear, f: 1.01 } })) &&
        /clear\.shape/.test(t({ clear: { ...base.clear, shape: "slope" } })) && /clear\.range/.test(t({ clear: { ...base.clear, range: "now" } })) && /clear\.evidence/.test(t({ clear: { ...base.clear, evidence: 1 } })) && /ghost is/.test(t({ ghost: { min: 0, life: 60, nbr: false } })) && /ghost is/.test(t({ ghost: { min: 4, life: 0, nbr: false } })) && /ghost is/.test(t({ ghost: { min: 4, life: 256, nbr: false } })) && /ghost is/.test(t({ ghost: { min: 4, life: 60, nbr: 1 } })) && /ghost is/.test(t({ ghost: undefined })));
    ok("!! well-formed edges are accepted: a mark of [32, 32], a cap of 30 and of 1, f = 1 and a tiny f, a near of 0, a ghost of life 255 and min 1", thrown(() => D.makeDetector({ ...base, mark: [32, 32] })) === "no throw" && thrown(() => D.makeDetector({ ...base, clear: { ...base.clear, cap: 30, capNear: 1, f: 1e-6 } })) === "no throw" && thrown(() => D.makeDetector({ ...base, near: 0 })) === "no throw" && thrown(() => D.makeDetector({ ...base, ghost: { min: 1, life: 255, nbr: true } })) === "no throw");
});

guard("6", () => {
    console.log("\n6. THE FLIGHTS");
    const keys = ["status", "t", "path", "plans", "pings", "occupied", "minClearance", "offsetEnd", "ensonified"], sameF = (a, b) => keys.every((k) => a[k] === b[k]);
    const scA = H.hardScenario(1203, "hard-current"), scB = H.hardScenario(1210, "hard-gaps"), L = X.LONG_SONAR, FW = X.LONG_ARMS["long+fix+forget"];
    const inc = D.flyDetArm(pilot, scA, "inc@clean"), fg = X.flyArm(pilot, scA, "long+fix+forget");
    ok("!! a run of one with a clear of one on a sea with no faults IS the map that forgets, flight for flight (status, time, path, plans, pings, occupied cells, clearance, fix offset, cells ensonified), and the record carries the detector arm's name", sameF(inc, fg) && inc.arm === "inc@clean" && fg.arm === "long+fix+forget");
    const old = (sc, a) => X.flyArm(pilot, sc, a), nw = (sc, a) => D.flyDetArm(pilot, sc, a);
    ok("!! follow-up 7's detectors are the general detector with runs: d2-12@W, d1-12@W and d3-12@P fly flight for flight as they flew in HELD12 (two scenarios each)", ["d2-12@W", "d1-12@W", "d3-12@P"].every((a) => [scA, scB].every((sc) => sameF(old(sc, a), nw(sc, a)))));
    const legacy = X.flySensed(pilot, scB, FW, { sonar: L, realism: { miss: 0.2, objects: true, persist: 10, rangeDep: true }, det: Object.freeze({ mark: 1, clear: 1 }) }), viaDrop = nw(scB, "inc@D10");
    ok("!! `drop` is `objects` in a flight: inc@D10 (whole-obstacle dropouts of 10 pings with the range law, no cell fault) flies as the legacy fault with the same detector did", sameF(legacy, viaDrop) && viaDrop.arm === "inc@D10");
    const clean = nw(scB, "inc@clean"), leak1 = X.flySensed(pilot, scB, FW, { sonar: L, realism: { drop: { rate: 0.2, persist: 30, rangeDep: true, leak: 1 } }, det: D.DETECTORS.inc }), drop30 = nw(scB, "inc@D30");
    ok("!! a leak of 1 is no dropout (every reading of a dropped obstacle still comes back): the flight equals the sea with no faults; and the dropout without the leak is a different flight (the map is not the clean map)", sameF(leak1, clean) && !sameF(drop30, clean));
    const full = nw(scA, "full@WD30L");
    ok("!! the record carries detStats for a detector with stats (full@WD30L: numbers, marks above the clears, ghost marks counted) and none for the exact flight, the map that forgets or follow-up 7's runs; the arm of a detector flight is its name", full.detStats && Object.values(full.detStats).every(Number.isFinite) && full.detStats.marks >= full.detStats.clears && full.detStats.ghostMarks > 0 && full.arm === "full@WD30L" && X.flyArm(pilot, scA, "exact").detStats === undefined && fg.detStats === undefined && old(scA, "d2-12@W").detStats === undefined);
    ok("!! the dispatch: flyArm sends exact and long+fix+forget to the library (the same flights as X.flyArm), any other name to flyDetArm, and an unknown arm throws naming the choices; flights are deterministic (the same arm twice gives the same record)", sameF(D.flyArm(pilot, scA, "exact"), X.flyArm(pilot, scA, "exact")) && sameF(D.flyArm(pilot, scA, "long+fix+forget"), fg) && sameF(D.flyArm(pilot, scB, "inc@D10"), viaDrop) && /not <detector>@<condition>/.test(thrown(() => D.flyArm(pilot, scA, "nonesuch"))) && same(nw(scA, "full@WD30L"), full));
});

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
