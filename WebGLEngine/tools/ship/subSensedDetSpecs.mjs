// WebGLEngine/tools/ship/subSensedDetSpecs.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE REGISTRATIONS OF FOLLOW-UPS 8 TO 24 AS DATA (brain/SENSED_NAV_WIP.md, "FOLLOW-UP 8" to "FOLLOW-UP 24"), one spec for each: the arms flown, the designated detector, the bar's cells, the verdict rule and the predictions, each as an operation on the pooled counts of arms.
// A study is named by its backlog id without the "nav-sensed-" ("dropout-range", "detector-hold-confirm", ...). The engine is tools/ship/subSensedDetStudy.mjs; the detectors and faults are brain/subSensedDetect.mjs. Every spec carries the number of its follow-up, its set (HELD13 for follow-up 8 up to HELD29 for follow-up 24) and the file its flights go to.
// A TERM is an arm name "<detector>@<condition>" (the three kinds pooled) or "long+fix+forget" or "exact"; { k: kind, a: arm } is one kind; { sum: [terms] } and { max: [terms] } combine.
// OPERATIONS (n is a number of flights): ge   a - b >= n;  gt   a > b;  le   a - b <= n;  within   |a - b| <= n;  bar   the arm in `a` reaches at least 80% of exact's count in EACH kind;  notBar   it misses that in at least one kind;  eachGe   every arm of `arms` reaches at least n more than `b`;  spread / spreadGt   the largest minus the smallest count of `arms` is at most / more than n;  and   every prediction of `of` holds.
// A missing arm is a miss (a comparison with NaN fails).
"use strict";
import * as X from "../../brain/subSensedNav.mjs";
import * as D from "../../brain/subSensedDetect.mjs";

const LF = "long+fix+forget", on = (cond, names) => names.map((n) => `${n}@${cond}`), sum = (cond, names) => ({ sum: on(cond, names) });
const ge = (id, text, a, b, n) => ({ id, text, op: "ge", a, b, n }), gt = (id, text, a, b) => ({ id, text, op: "gt", a, b }), le = (id, text, a, b, n) => ({ id, text, op: "le", a, b, n }), within = (id, text, a, b, n) => ({ id, text, op: "within", a, b, n }), bar = (id, text, a) => ({ id, text, op: "bar", a }), and = (id, text, of) => ({ id, text, op: "and", of });
const K = (k, a) => ({ k, a });
const over = (cond3, name) => ({ sum: cond3.flatMap((c) => on(c, [name])) });   // one detector summed over several conditions

const S = {};
const study = (name, o) => { S[name] = Object.freeze({ name, ...o, arms: Object.freeze(o.arms), preds: Object.freeze(o.preds), bar: Object.freeze(o.bar), verdict: Object.freeze(o.verdict) }); };
const outOf = (n, set) => `brain/subSensedDet${n}${set[0].toUpperCase() + set.slice(1)}.jsonl`;

// FOLLOW-UP 8: THE HOLD THAT KNOWS HOW FAR
study("dropout-range", {
    followUp: 8, held: "held13", out: outOf("DropoutRange", "held13"), title: "THE HOLD THAT KNOWS HOW FAR", designated: "lock",
    arms: ["exact", LF, ...["D3", "D10", "D30"].flatMap((c) => on(c, ["inc", "uni", "lock"])), ...on("W", ["inc", "uni", "lock"]), "lock@clean"],
    bar: { arm: "lock", conds: ["D30", "W"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("H1", "a longer dropout hurts the map that forgets: inc@D30 reaches at least 10 fewer than inc@D3", "inc@D3", "inc@D30", 10),
        ge("H2", "a hold of twelve covers a dropout of ten: uni@D10 reaches at least 5 more than inc@D10", "uni@D10", "inc@D10", 5),
        ge("H3", "and not one of thirty: uni@D30 reaches at least 5 fewer than uni@D3", "uni@D3", "uni@D30", 5),
        ge("H4", "the near lock covers it: lock@D30 reaches at least 10 more than uni@D30", "lock@D30", "uni@D30", 10),
        and("H5", "and does not give up the short ones: lock@D3 is within 8 of uni@D3 and lock@D10 is within 8 of uni@D10", [within("", "", "lock@D3", "uni@D3", 8), within("", "", "lock@D10", "uni@D10", 8)]),
        bar("H6", "and keeps the false-return cure: lock@W holds the bar in every kind", "lock@W"),
        within("H7", "and costs little on a sea with no faults: lock@clean is within 8 of the clean long+fix+forget", "lock@clean", LF, 8),
        and("H8", "summed over D3, D10 and D30, lock reaches more than inc and more than uni", [gt("", "", over(["D3", "D10", "D30"], "lock"), over(["D3", "D10", "D30"], "inc")), gt("", "", over(["D3", "D10", "D30"], "lock"), over(["D3", "D10", "D30"], "uni"))]),
    ],
});
// FOLLOW-UP 9: THE CONFIRMATION THAT KNOWS HOW FAR
study("confirm-range", {
    followUp: 9, held: "held14", out: outOf("ConfirmRange", "held14"), title: "THE CONFIRMATION THAT KNOWS HOW FAR", designated: "cr",
    arms: ["exact", LF, ...on("R1", ["inc", "c2", "c3", "cr"]), ...on("R3", ["inc", "c2", "c3", "cr"]), ...on("W", ["inc", "c2", "cr"]), "cr@clean"],
    bar: { arm: "cr", conds: ["R3", "W"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("K1", "a range-aware confirmation repairs the range-law false returns: cr@R3 reaches at least 15 more than inc@R3", "cr@R3", "inc@R3", 15),
        within("K2", "and is as good as a uniform confirmation of two there: cr@R3 is within 10 of c2@R3", "cr@R3", "c2@R3", 10),
        within("K3", "a third reading is not worth it everywhere: c3@R3 is within 10 of c2@R3", "c3@R3", "c2@R3", 10),
        ge("K4", "it is a bet on the law: under the uniform false rate cr@W reaches at least 10 fewer than c2@W", "c2@W", "cr@W", 10),
        bar("K5", "it holds the bar in every kind under the range law: cr@R3", "cr@R3"),
        { id: "K6", text: "and does NOT hold it in every kind under the uniform rate: cr@W misses the bar in at least one kind", op: "notBar", a: "cr@W" },
        within("K7", "it costs little on a sea with no faults: cr@clean is within 8 of the clean long+fix+forget", "cr@clean", LF, 8),
        and("K8", "summed over R1 and R3, cr reaches more than inc and more than c3", [gt("", "", over(["R1", "R3"], "cr"), over(["R1", "R3"], "inc")), gt("", "", over(["R1", "R3"], "cr"), over(["R1", "R3"], "c3"))]),
    ],
});
// FOLLOW-UP 10: THE DETECTOR THAT KNOWS HOW FAR, BOTH WAYS
study("detector-range", {
    followUp: 10, held: "held15", out: outOf("DetectorRange", "held15"), title: "THE DETECTOR THAT KNOWS HOW FAR, BOTH WAYS", designated: "rd",
    arms: ["exact", LF, ...["D30", "R3", "W", "P"].flatMap((c) => on(c, ["inc", "uni", "rd"])), "rd@clean"],
    bar: { arm: "rd", conds: ["D30", "R3"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("M1", "range-awareness pays where the law holds: summed over D30 and R3, rd reaches at least 10 more than uni", over(["D30", "R3"], "rd"), over(["D30", "R3"], "uni"), 10),
        bar("M2", "rd holds the bar in every kind under D30", "rd@D30"),
        bar("M3", "and under R3", "rd@R3"),
        ge("M4", "the bet on the law has a price: under W, rd reaches at least 10 fewer than uni", "uni@W", "rd@W", 10),
        within("M5", "under the persistent mix P, rd is within 10 of uni", "rd@P", "uni@P", 10),
        within("M6", "on a sea with no faults rd@clean is within 8 of the clean long+fix+forget", "rd@clean", LF, 8),
        and("M7", "rd reaches more than inc under each of the four conditions", ["D30", "R3", "W", "P"].map((c) => gt("", "", `rd@${c}`, `inc@${c}`))),
    ],
});
// FOLLOW-UP 11: THE CONFIRMATION RULE ITSELF
study("detector-confirm", {
    followUp: 11, held: "held16", out: outOf("DetectorConfirm", "held16"), title: "THE CONFIRMATION RULE ITSELF", designated: "m2-3",
    arms: ["exact", LF, ...["W", "V"].flatMap((c) => on(c, ["m1-1", "m2-2", "m3-3", "m2-3", "m2-4", "m3-4"])), "m2-3@clean"],
    bar: { arm: "m2-3", conds: ["W", "V"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("N1", "an M-of-N rule is kinder to misses than a run: under V, m2-3 reaches at least 5 more than m2-2", "m2-3@V", "m2-2@V", 5),
        within("N2", "and no worse where the misses are mild: under W, m2-3 is within 8 of m2-2", "m2-3@W", "m2-2@W", 8),
        within("N3", "a third reading buys little: under W, m3-3 is within 8 of m2-2", "m3-3@W", "m2-2@W", 8),
        { id: "N4", text: "every confirmation rule repairs the white false returns: under W each of m2-2, m3-3, m2-3, m2-4 and m3-4 reaches at least 20 more than m1-1", op: "eachGe", arms: on("W", ["m2-2", "m3-3", "m2-3", "m2-4", "m3-4"]), b: "m1-1@W", n: 20 },
        bar("N5", "m2-3 holds the bar in every kind under W", "m2-3@W"),
        bar("N6", "and under V", "m2-3@V"),
        within("N7", "on a sea with no faults m2-3@clean is within 8 of the clean long+fix+forget", "m2-3@clean", LF, 8),
        ge("N8", "a stricter rule is slower and pays where misses are many: under V, m3-4 reaches at least 5 fewer than m2-3", "m2-3@V", "m3-4@V", 5),
    ],
});
// FOLLOW-UP 12: THE HOLD RULE ITSELF
study("detector-hold", {
    followUp: 12, held: "held17", out: outOf("DetectorHold", "held17"), title: "THE HOLD RULE ITSELF", designated: "e30",
    arms: ["exact", LF, ...on("D30", ["inc", "h12", "h30", "e12", "e30"]), ...on("W", ["inc", "h12", "h30", "e12", "e30"]), ...on("P", ["inc", "e30"]), "e30@clean"],
    bar: { arm: "e30", conds: ["D30"] }, verdict: { full: 3, partly: 2 },
    preds: [
        ge("O1", "a plain long hold makes false returns far worse: h30@W reaches at least 20 fewer than inc@W", "inc@W", "h30@W", 20),
        within("O2", "the evidence hold does not: e30@W is within 10 of inc@W", "e30@W", "inc@W", 10),
        ge("O3", "the evidence hold covers the long dropout: e30@D30 reaches at least 10 more than inc@D30", "e30@D30", "inc@D30", 10),
        within("O4", "at little cost against the plain hold of the same cap: e30@D30 is within 10 of h30@D30", "e30@D30", "h30@D30", 10),
        ge("O5", "the cap matters: e12@D30 reaches at least 5 fewer than e30@D30", "e30@D30", "e12@D30", 5),
        gt("O6", "under the persistent mix, the evidence hold is better than the incumbent: e30@P reaches more than inc@P", "e30@P", "inc@P"),
        within("O7", "on a sea with no faults e30@clean is within 8 of the clean long+fix+forget", "e30@clean", LF, 8),
        gt("O8", "a plain hold of twelve already helps with the long dropout: h12@D30 reaches more than inc@D30", "h12@D30", "inc@D30"),
    ],
});
// FOLLOW-UP 13: THE HOLD THAT KNOWS BOTH (the registration's L6 and L8 name n30@W and n30@P, which its arm list left out: both are added, Amendment 1)
study("detector-range-hold", {
    followUp: 13, held: "held18", out: outOf("DetectorRangeHold", "held18"), title: "THE HOLD THAT KNOWS BOTH", designated: "re30",
    arms: ["exact", LF, ...on("D30", ["inc", "n30", "e30", "re30"]), ...on("W", ["inc", "n30", "e30", "re30"]), ...on("P", ["inc", "n30", "e30", "re30"]), ...on("clean", ["n30", "e30", "re30"])],
    bar: { arm: "re30", conds: ["D30"] }, verdict: { full: 3, partly: 2 },
    preds: [
        ge("L1", "the range-gated evidence hold covers the long dropout: re30@D30 reaches at least 10 more than inc@D30", "re30@D30", "inc@D30", 10),
        within("L2", "and as well as the evidence hold at any range: re30@D30 is within 10 of e30@D30", "re30@D30", "e30@D30", 10),
        gt("L3", "the range gate is worth something on a clean sea: re30@clean reaches more than e30@clean", "re30@clean", "e30@clean"),
        within("L4", "and costs little: re30@clean is within 8 of the clean long+fix+forget", "re30@clean", LF, 8),
        within("L5", "it does not make false returns worse: under W, re30 is within 10 of inc", "re30@W", "inc@W", 10),
        ge("L6", "a plain near hold does: under W, n30 reaches at least 20 fewer than inc", "inc@W", "n30@W", 20),
        gt("L7", "under the persistent mix P, re30 reaches more than inc", "re30@P", "inc@P"),
        and("L8", "summed over D30 and P, re30 reaches more than e30 and more than n30", [gt("", "", over(["D30", "P"], "re30"), over(["D30", "P"], "e30")), gt("", "", over(["D30", "P"], "re30"), over(["D30", "P"], "n30"))]),
    ],
});
// FOLLOW-UP 14: THE CONFIRMATION THAT KNOWS HOW FAR, WITH A MEMORY
study("detector-range-confirm", {
    followUp: 14, held: "held19", out: outOf("DetectorRangeConfirm", "held19"), title: "THE CONFIRMATION THAT KNOWS HOW FAR, WITH A MEMORY", designated: "rm23",
    arms: ["exact", LF, ...on("R3", ["inc", "c2", "m23", "cr", "rm23", "rm24", "rm34"]), ...on("W", ["inc", "m23", "rm23"]), ...on("R1", ["m23", "rm23"]), "rm23@clean"],
    bar: { arm: "rm23", conds: ["R3", "R1"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("S1", "a memory pays far away: under R3, rm23 reaches at least 5 more than cr", "rm23@R3", "cr@R3", 5),
        within("S2", "and is no worse than the same rule everywhere: under R3, rm23 is within 10 of m23", "rm23@R3", "m23@R3", 10),
        within("S3", "a longer window buys nothing: under R3, rm24 is within 8 of rm23", "rm24@R3", "rm23@R3", 8),
        ge("S4", "a stricter rule pays where the misses are many: under R3, rm34 reaches at least 5 fewer than rm23", "rm23@R3", "rm34@R3", 5),
        ge("S5", "the bet on the law has a price: under W, rm23 reaches at least 10 fewer than m23", "m23@W", "rm23@W", 10),
        bar("S6", "rm23 holds the bar in every kind under R3", "rm23@R3"),
        bar("S7", "and under R1", "rm23@R1"),
        within("S8", "on a sea with no faults rm23@clean is within 8 of the clean long+fix+forget", "rm23@clean", LF, 8),
    ],
});
// FOLLOW-UP 15: WHICH RANGE THE HOLD GOES BY
study("detector-hold-range", {
    followUp: 15, held: "held20", out: outOf("DetectorHoldRange", "held20"), title: "WHICH RANGE THE HOLD GOES BY", designated: "rn30",
    arms: ["exact", LF, ...on("D30", ["inc", "re30", "mk30", "mn30", "rp30", "rn30"]), ...on("W", ["inc", "re30", "rn30"]), ...on("P", ["inc", "rn30"]), ...on("clean", ["re30", "rn30"])],
    bar: { arm: "rn30", conds: ["D30"] }, verdict: { full: 3, partly: 2 },
    preds: [
        ge("T1", "the range at marking is the wrong range: mk30@D30 reaches at least 10 fewer than re30@D30", "re30@D30", "mk30@D30", 10),
        within("T2", "the nearest range ever read does as well as the range now: mn30@D30 is within 10 of re30@D30", "mn30@D30", "re30@D30", 10),
        within("T3", "the ramp does as well as the step: rp30@D30 is within 10 of re30@D30", "rp30@D30", "re30@D30", 10),
        ge("T4", "the designated covers the long dropout: rn30@D30 reaches at least 10 more than inc@D30", "rn30@D30", "inc@D30", 10),
        bar("T5", "rn30 holds the bar in every kind under D30", "rn30@D30"),
        within("T6", "and costs little on a sea with no faults: rn30@clean is within 8 of the clean long+fix+forget", "rn30@clean", LF, 8),
        within("T7", "and does not make false returns worse: under W, rn30 is within 10 of inc", "rn30@W", "inc@W", 10),
        gt("T8", "under the persistent mix P, rn30 reaches more than inc", "rn30@P", "inc@P"),
    ],
});
// FOLLOW-UP 16: THE CONFIRMATION AND THE HOLD, BOTH BETTER
study("detector-hold-confirm", {
    followUp: 16, held: "held21", out: outOf("DetectorHoldConfirm", "held21"), title: "THE CONFIRMATION AND THE HOLD, BOTH BETTER", designated: "m23e30",
    arms: ["exact", LF, ...on("WD30", ["inc", "d2-12", "m23", "e30", "m23h30", "m23e30"]), ...on("W", ["inc", "m23", "m23e30"]), ...on("D30", ["inc", "e30", "m23e30"]), "m23e30@clean"],
    bar: { arm: "m23e30", conds: ["WD30"] }, verdict: { full: 3, partly: 2 },
    preds: [
        and("U1", "the pair does what neither half does: under WD30, m23e30 reaches more than m23 and more than e30", [gt("", "", "m23e30@WD30", "m23@WD30"), gt("", "", "m23e30@WD30", "e30@WD30")]),
        ge("U2", "and does better than follow-up 7's plain pair: under WD30, m23e30 reaches at least 10 more than d2-12", "m23e30@WD30", "d2-12@WD30", 10),
        within("U3", "after a confirmation the evidence hold has little left to protect: under WD30, m23h30 is within 10 of m23e30", "m23h30@WD30", "m23e30@WD30", 10),
        ge("U4", "the pair still covers the long dropout: under D30, m23e30 reaches at least 10 more than inc", "m23e30@D30", "inc@D30", 10),
        ge("U5", "and the pair still repairs the white false returns: under W, m23e30 reaches at least 20 more than inc", "m23e30@W", "inc@W", 20),
        bar("U6", "m23e30 holds the bar in every kind under WD30", "m23e30@WD30"),
        within("U7", "on a sea with no faults m23e30 is within 8 of the clean long+fix+forget", "m23e30@clean", LF, 8),
        within("U8", "the mark's delay costs the pair nothing on dropouts: under D30, m23e30 is within 10 of e30", "m23e30@D30", "e30@D30", 10),
    ],
});
// FOLLOW-UP 17: THE WHOLE DETECTOR, EVERY END KNOWING HOW FAR
study("detector-hold-confirm-range", {
    followUp: 17, held: "held22", out: outOf("DetectorHoldConfirmRange", "held22"), title: "THE WHOLE DETECTOR, EVERY END KNOWING HOW FAR", designated: "rm23re30",
    arms: ["exact", LF, ...on("R3D30", ["inc", "m23e30", "rd", "rm23", "re30", "rm23re30"]), ...on("W", ["inc", "m23e30", "rm23re30"]), ...on("P", ["inc", "m23e30", "rm23re30"]), "rm23re30@clean"],
    bar: { arm: "rm23re30", conds: ["R3D30"] }, verdict: { full: 3, partly: 2 },
    preds: [
        ge("Q1", "range-awareness pays where the law holds: under R3D30, rm23re30 reaches at least 10 more than m23e30", "rm23re30@R3D30", "m23e30@R3D30", 10),
        ge("Q2", "the rules of 11 and 12 pay in their range-aware form: under R3D30, rm23re30 reaches at least 5 more than rd", "rm23re30@R3D30", "rd@R3D30", 5),
        and("Q3", "neither half does the other's work: under R3D30, rm23re30 reaches more than rm23 and more than re30", [gt("", "", "rm23re30@R3D30", "rm23@R3D30"), gt("", "", "rm23re30@R3D30", "re30@R3D30")]),
        bar("Q4", "rm23re30 holds the bar in every kind under R3D30", "rm23re30@R3D30"),
        ge("Q5", "the bet on the law has a price: under W, rm23re30 reaches at least 10 fewer than m23e30", "m23e30@W", "rm23re30@W", 10),
        ge("Q6", "but it is still a cure: under W, rm23re30 reaches at least 10 more than inc", "rm23re30@W", "inc@W", 10),
        within("Q7", "under the persistent mix P, rm23re30 is within 10 of m23e30", "rm23re30@P", "m23e30@P", 10),
        within("Q8", "on a sea with no faults rm23re30 is within 8 of the clean long+fix+forget", "rm23re30@clean", LF, 8),
    ],
});
// FOLLOW-UP 18: THE SECOND HOLD, ON WHAT WAS CONFIRMED
study("detector-hold-confirm-range-hold", {
    followUp: 18, held: "held23", out: outOf("DetectorHoldConfirmRangeHold", "held23"), title: "THE SECOND HOLD, ON WHAT WAS CONFIRMED", designated: "rm23e30g",
    arms: ["exact", LF, ...on("R3D30", ["inc", "m23e30", "rm23re30", "rm23e30", "rm23re30g", "rm23e30g"]), ...on("W", ["inc", "rm23re30", "rm23e30g"]), ...on("P", ["inc", "rm23re30", "rm23e30g"]), "rm23e30g@clean"],
    bar: { arm: "rm23e30g", conds: ["R3D30"] }, verdict: { full: 3, partly: 2 },
    preds: [
        ge("J1", "the range gate on the hold costs under the joint stress: under R3D30, rm23e30 reaches at least 5 more than rm23re30", "rm23e30@R3D30", "rm23re30@R3D30", 5),
        within("J2", "and the hold at every range costs nothing where the law fails: under W, rm23e30g is within 10 of rm23re30", "rm23e30g@W", "rm23re30@W", 10),
        ge("J3", "the ghost helps when the hold is range-gated: under R3D30, rm23re30g reaches at least 5 more than rm23re30", "rm23re30g@R3D30", "rm23re30@R3D30", 5),
        within("J4", "and little when the hold is everywhere: under R3D30, rm23e30g is within 8 of rm23e30", "rm23e30g@R3D30", "rm23e30@R3D30", 8),
        bar("J5", "rm23e30g holds the bar in every kind under R3D30", "rm23e30g@R3D30"),
        ge("J6", "the pair of holds beats the uniform pair: under R3D30, rm23e30g reaches at least 10 more than m23e30", "rm23e30g@R3D30", "m23e30@R3D30", 10),
        gt("J7", "under the persistent mix P, rm23e30g reaches more than inc", "rm23e30g@P", "inc@P"),
        within("J8", "on a sea with no faults rm23e30g is within 8 of the clean long+fix+forget", "rm23e30g@clean", LF, 8),
    ],
});
// FOLLOW-UP 19: THE MEMORY CONFIRMATION WITH THE PLAIN LOCK
study("detector-range-confirm-hold", {
    followUp: 19, held: "held24", out: outOf("DetectorRangeConfirmHold", "held24"), title: "THE MEMORY CONFIRMATION WITH THE PLAIN LOCK", designated: "rm23lk",
    arms: ["exact", LF, ...on("R3D30", ["inc", "rm23", "rd", "rm23lk", "rm23re30", "crre30"]), ...on("W", ["inc", "rm23lk", "rm23re30"]), ...on("P", ["inc", "rm23lk", "rm23re30"]), "rm23lk@clean"],
    bar: { arm: "rm23lk", conds: ["R3D30"] }, verdict: { full: 3, partly: 2 },
    preds: [
        ge("B1", "the memory pays in follow-up 10's detector: under R3D30, rm23lk reaches at least 5 more than rd", "rm23lk@R3D30", "rd@R3D30", 5),
        within("B2", "the evidence hold does not beat the plain lock where the law holds: under R3D30, rm23re30 is within 10 of rm23lk", "rm23re30@R3D30", "rm23lk@R3D30", 10),
        ge("B3", "a lock on top of the range-aware memory pays against dropouts: under R3D30, rm23lk reaches at least 10 more than rm23", "rm23lk@R3D30", "rm23@R3D30", 10),
        bar("B4", "rm23lk holds the bar in every kind under R3D30", "rm23lk@R3D30"),
        ge("B5", "where the law does not hold the plain lock is the worse hold: under W, rm23lk reaches at least 10 fewer than rm23re30", "rm23re30@W", "rm23lk@W", 10),
        gt("B6", "under the persistent mix P, rm23lk reaches more than inc", "rm23lk@P", "inc@P"),
        within("B7", "on a sea with no faults rm23lk is within 8 of the clean long+fix+forget", "rm23lk@clean", LF, 8),
        within("B8", "the kind of hold matters little with a run of 3 to mark: under R3D30, crre30 is within 10 of rd", "crre30@R3D30", "rd@R3D30", 10),
    ],
});
// FOLLOW-UP 20: WHICH CONFIRMATION WHEN THE HOLD IS THERE
study("detector-confirm-hold", {
    followUp: 20, held: "held25", out: outOf("DetectorConfirmHold", "held25"), title: "WHICH CONFIRMATION WHEN THE HOLD IS THERE", designated: "m34e30",
    arms: ["exact", LF, ...on("WD30", ["m11e30", "m22e30", "m33e30", "m23e30", "m24e30", "m34e30"]), ...on("VD30", ["m11e30", "m22e30", "m33e30", "m23e30", "m24e30", "m34e30"]), "m34e30@clean"],
    bar: { arm: "m34e30", conds: ["WD30", "VD30"] }, verdict: { full: 6, partly: 4 },
    preds: [
        { id: "Y1", text: "the family collapses under a hold: under WD30, the five confirming rules have pooled counts within 20 of each other", op: "spread", arms: on("WD30", ["m22e30", "m33e30", "m23e30", "m24e30", "m34e30"]), n: 20 },
        { id: "Y2", text: "every confirmation still repairs the white false returns: under WD30 each of the five reaches at least 20 more than m11e30", op: "eachGe", arms: on("WD30", ["m22e30", "m33e30", "m23e30", "m24e30", "m34e30"]), b: "m11e30@WD30", n: 20 },
        within("Y3", "the memory is worth nothing once there is a hold: under VD30, m23e30 is within 8 of m22e30", "m23e30@VD30", "m22e30@VD30", 8),
        gt("Y4", "strictness pays under mild misses: under WD30, m34e30 reaches more than m23e30", "m34e30@WD30", "m23e30@WD30"),
        ge("Y5", "and costs under many: under VD30, m34e30 reaches at least 5 fewer than m23e30", "m23e30@VD30", "m34e30@VD30", 5),
        bar("Y6", "m34e30 holds the bar in every kind under WD30", "m34e30@WD30"),
        bar("Y7", "and under VD30", "m34e30@VD30"),
        within("Y8", "on a sea with no faults m34e30 is within 8 of the clean long+fix+forget", "m34e30@clean", LF, 8),
    ],
});
// FOLLOW-UP 21: THE CLEAR THAT NEEDS CONFIRMING
study("detector-hold-confirm-hold", {
    followUp: 21, held: "held26", out: outOf("DetectorHoldConfirmHold", "held26"), title: "THE CLEAR THAT NEEDS CONFIRMING", designated: "f80",
    arms: ["exact", LF, ...on("WD30", ["inc", "m23", "f100", "f90", "f80", "f60"]), ...on("WD30L", ["inc", "m23", "f100", "f90", "f80", "f60"]), "f80@clean"],
    bar: { arm: "f80", conds: ["WD30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("A1", "the K-of-N clear cures the smear where it hurts: in hard-gaps under WD30, f80 reaches at least 3 more than f100", K("hard-gaps", "f80@WD30"), K("hard-gaps", "f100@WD30"), 3),
        ge("A2", "and pooled: under WD30, f80 reaches at least 5 more than f100", "f80@WD30", "f100@WD30", 5),
        ge("A3", "the cure has a limit: under WD30, f60 reaches at least 5 fewer than f80", "f80@WD30", "f60@WD30", 5),
        ge("A4", "the leak is the price: under WD30L, f80 reaches at least 5 fewer than f100", "f100@WD30L", "f80@WD30L", 5),
        within("A5", "the run is not troubled by the leak: f100 under WD30L is within 10 of f100 under WD30", "f100@WD30L", "f100@WD30", 10),
        bar("A6", "f80 holds the bar in every kind under WD30", "f80@WD30"),
        bar("A7", "and under WD30L", "f80@WD30L"),
        within("A8", "on a sea with no faults f80 is within 8 of the clean long+fix+forget", "f80@clean", LF, 8),
    ],
});
// FOLLOW-UP 22: WHICH CONFIRMATION WHEN THE CLEAR IS CONFIRMED TOO
study("detector-confirm-hold-confirm", {
    followUp: 22, held: "held27", out: outOf("DetectorConfirmHoldConfirm", "held27"), title: "WHICH CONFIRMATION WHEN THE CLEAR IS CONFIRMED TOO", designated: "m33f80",
    arms: ["exact", LF, ...on("WD30", ["m11f80", "m22f80", "m33f80", "m23f80", "m24f80", "m34f80"]), ...on("WD30L", ["m11f80", "m22f80", "m33f80", "m23f80", "m24f80", "m34f80"]), "m33f80@clean"],
    bar: { arm: "m33f80", conds: ["WD30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("X1", "separating wall from smear beats the memory where the clear cleans: under WD30, m33f80 reaches at least 5 more than m23f80", "m33f80@WD30", "m23f80@WD30", 5),
        ge("X2", "and the run's price shows where cells are cleared: under WD30L, m33f80 reaches at least 3 fewer than m23f80", "m23f80@WD30L", "m33f80@WD30L", 3),
        { id: "X3", text: "unlike follow-up 20's, the family does not collapse: under WD30, the five confirming rules have pooled counts more than 10 apart", op: "spreadGt", arms: on("WD30", ["m22f80", "m33f80", "m23f80", "m24f80", "m34f80"]), n: 10 },
        { id: "X4", text: "every confirmation still repairs the white false returns: under WD30 each of the five reaches at least 20 more than m11f80", op: "eachGe", arms: on("WD30", ["m22f80", "m33f80", "m23f80", "m24f80", "m34f80"]), b: "m11f80@WD30", n: 20 },
        ge("X5", "the memory is worth something again: under WD30L, m23f80 reaches at least 5 more than m22f80", "m23f80@WD30L", "m22f80@WD30L", 5),
        bar("X6", "m33f80 holds the bar in every kind under WD30", "m33f80@WD30"),
        bar("X7", "and under WD30L", "m33f80@WD30L"),
        within("X8", "on a sea with no faults m33f80 is within 8 of the clean long+fix+forget", "m33f80@clean", LF, 8),
    ],
});
// FOLLOW-UP 23: THE FOUR STAGES, EACH TAKEN OUT IN TURN
study("detector-hold-confirm-hold-confirm", {
    followUp: 23, held: "held28", out: outOf("DetectorHoldConfirmHoldConfirm", "held28"), title: "THE FOUR STAGES, EACH TAKEN OUT IN TURN", designated: "full",
    arms: ["exact", LF, ...on("WD30L", ["inc", "full", "noG", "gU", "noK", "noM", "noE"]), ...on("P", ["inc", "full", "noG", "gU", "noK"]), "full@clean"],
    bar: { arm: "full", conds: ["WD30L", "P"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("Z1", "the confirmed mark matters: under WD30L, full reaches at least 20 more than noM", "full@WD30L", "noM@WD30L", 20),
        ge("Z2", "the confirmed clear has the price follow-up 21 predicted: under WD30L, noK reaches at least 5 more than full", "noK@WD30L", "full@WD30L", 5),
        within("Z3", "the evidence is idle at this clear: under WD30L, noE is within 10 of full", "noE@WD30L", "full@WD30L", 10),
        ge("Z4", "the neighbour test is what makes the ghost safe: under P, gU reaches at least 5 fewer than full", "full@P", "gU@P", 5),
        ge("Z5", "the ghost earns its place against the leak: under WD30L, full reaches at least 5 more than noG", "full@WD30L", "noG@WD30L", 5),
        gt("Z6", "under the persistent mix P, full reaches more than inc", "full@P", "inc@P"),
        bar("Z7", "full holds the bar in every kind under WD30L", "full@WD30L"),
        within("Z8", "on a sea with no faults full is within 8 of the clean long+fix+forget", "full@clean", LF, 8),
    ],
});
// FOLLOW-UP 24: THE RANGE-GATED HOLD, WITH THE CLEAR CONFIRMED
study("detector-range-hold-confirm", {
    followUp: 24, held: "held29", out: outOf("DetectorRangeHoldConfirm", "held29"), title: "THE RANGE-GATED HOLD, WITH THE CLEAR CONFIRMED", designated: "m23re30k",
    arms: ["exact", LF, ...on("WD30L", ["inc", "m23", "m23e30", "m23e30k", "m23re30", "m23re30k"]), ...on("R3D30", ["inc", "m23", "m23e30", "m23e30k", "m23re30", "m23re30k"]), "m23re30k@clean"],
    bar: { arm: "m23re30k", conds: ["WD30L", "R3D30"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("I1", "the gate costs where the dropouts begin far away: under R3D30, m23e30 reaches at least 5 more than m23re30", "m23e30@R3D30", "m23re30@R3D30", 5),
        within("I2", "behind the gate the confirmed clear changes little: under WD30L, m23re30k is within 8 of m23re30", "m23re30k@WD30L", "m23re30@WD30L", 8),
        ge("I3", "without the gate the confirmed clear pays in the narrow gaps: in hard-gaps under WD30L, m23e30k reaches at least 3 more than m23e30", K("hard-gaps", "m23e30k@WD30L"), K("hard-gaps", "m23e30@WD30L"), 3),
        le("I4", "the two cures substitute and do not add: under WD30L, m23re30k reaches at most 5 more than the larger of m23re30 and m23e30k", "m23re30k@WD30L", { max: ["m23re30@WD30L", "m23e30k@WD30L"] }, 5),
        bar("I5", "m23re30k holds the bar in every kind under WD30L", "m23re30k@WD30L"),
        bar("I6", "and under R3D30", "m23re30k@R3D30"),
        ge("I7", "the hold is still worth having: under R3D30, m23re30k reaches at least 10 more than m23", "m23re30k@R3D30", "m23@R3D30", 10),
        within("I8", "on a sea with no faults m23re30k is within 8 of the clean long+fix+forget", "m23re30k@clean", LF, 8),
    ],
});

export const SPECS = Object.freeze(S);
export const STUDY_NAMES = Object.freeze(Object.keys(S));
/** The problems of a spec, as strings (none when it is well formed): the arms must be unique, flyable and hold exact and the clean map; the bar's arm and conditions must be flown; every prediction's terms must be arms the study flies, and its operation known; the set must exist. */
export function checkSpec(spec) {
    const bad = [], ARMS = new Set(spec.arms), flyable = (a) => a === "exact" || a === "long+fix+forget" || (() => { try { D.splitArm(a); return true; } catch { return false; } })();
    if (ARMS.size !== spec.arms.length) bad.push("arms repeat");
    for (const a of spec.arms) if (!flyable(a)) bad.push(`arm ${a} cannot be flown`);
    if (!ARMS.has("exact") || !ARMS.has("long+fix+forget")) bad.push("exact and long+fix+forget must be flown");
    if (!X.SENSE_SETS[spec.held]) bad.push(`set ${spec.held} does not exist`);
    for (const c of spec.bar.conds) if (!ARMS.has(`${spec.bar.arm}@${c}`)) bad.push(`bar arm ${spec.bar.arm}@${c} is not flown`);
    if (spec.designated !== spec.bar.arm) bad.push("the bar is not the designated arm's");
    const terms = (t) => (typeof t === "string" ? [t] : t && t.sum ? t.sum.flatMap(terms) : t && t.max ? t.max.flatMap(terms) : t && t.a ? [t.a] : []);
    const walk = (p) => {
        if (!["ge", "gt", "le", "within", "bar", "notBar", "eachGe", "spread", "spreadGt", "and"].includes(p.op)) bad.push(`${p.id}: unknown operation ${p.op}`);
        for (const t of [...(p.of ? [] : terms(p.a)), ...(p.of ? [] : terms(p.b)), ...(p.arms || [])]) if (!ARMS.has(t)) bad.push(`${p.id}: ${t} is not a flown arm`);
        for (const q of p.of || []) walk(q);
    };
    spec.preds.forEach(walk);
    return bad;
}
