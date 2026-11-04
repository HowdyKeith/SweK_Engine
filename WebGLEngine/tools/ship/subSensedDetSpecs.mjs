// WebGLEngine/tools/ship/subSensedDetSpecs.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE REGISTRATIONS OF FOLLOW-UPS 8 TO 58, 60 AND 61 AS DATA (brain/SENSED_NAV_WIP.md, "FOLLOW-UP 8" to "FOLLOW-UP 58", and the second registrations of "FOLLOW-UP 60" and "FOLLOW-UP 61", three specs each), one spec for each: the arms flown, the designated detector, the bar's cells, the verdict rule and the predictions, each as an operation on the pooled counts of arms.
// A study is named by its backlog id without the "nav-sensed-" ("dropout-range", "detector-hold-confirm", ...). The engine is tools/ship/subSensedDetStudy.mjs; the detectors and faults are brain/subSensedDetect.mjs. Every spec carries the number of its follow-up, its set (HELD13 for follow-up 8 up to HELD29 for follow-up 24) and the file its flights go to.
// A TERM is an arm name "<detector>@<condition>" (the three kinds pooled) or "long+fix+forget" or "exact"; { k: kind, a: arm } is one kind; { sum: [terms] } and { max: [terms] } combine.
// OPERATIONS (n is a number of flights): ge   a - b >= n;  gt   a > b;  le   a - b <= n;  within   |a - b| <= n;  bar   the arm in `a` reaches at least 80% of exact's count in EACH kind;  notBar   it misses that in at least one kind;  noBar   it misses that in EVERY kind (follow-up 36's AK4);  eachGe   every arm of `arms` reaches at least n more than `b`;  spread / spreadGt   the largest minus the smallest count of `arms` is at most / more than n;  and   every prediction of `of` holds.
// A missing arm is a miss (a comparison with NaN fails).
"use strict";
import * as X from "../../brain/subSensedNav.mjs";
import * as D from "../../brain/subSensedDetect.mjs";

const LF = "long+fix+forget", on = (cond, names) => names.map((n) => `${n}@${cond}`), sum = (cond, names) => ({ sum: on(cond, names) });
const ge = (id, text, a, b, n) => ({ id, text, op: "ge", a, b, n }), gt = (id, text, a, b) => ({ id, text, op: "gt", a, b }), le = (id, text, a, b, n) => ({ id, text, op: "le", a, b, n }), within = (id, text, a, b, n) => ({ id, text, op: "within", a, b, n }), bar = (id, text, a) => ({ id, text, op: "bar", a }), and = (id, text, of) => ({ id, text, op: "and", of });
const K = (k, a) => ({ k, a });
const noBar = (id, text, a) => ({ id, text, op: "noBar", a }), eachGe = (id, text, arms, b, n) => ({ id, text, op: "eachGe", arms, b, n }), spread = (id, text, arms, n) => ({ id, text, op: "spread", arms, n });   // the operations the specs of follow-ups 25 to 58 write as calls (the others are the helpers above; notBar and spreadGt are used by none of them and are not defined)
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

// ---- FOLLOW-UPS 25 TO 58 (generated from the registrations in brain/SENSED_NAV_WIP.md by a table, then read back by the study gate against its own literal copy)
// FOLLOW-UP 25: THE WHOLE DETECTOR WITH THE CLEAR CONFIRMED
study("detector-range-confirm-hold-confirm", {
    followUp: 25, held: "held30", out: outOf("DetectorRangeConfirmHoldConfirm", "held30"), title: "THE WHOLE DETECTOR WITH THE CLEAR CONFIRMED", designated: "rm23re30k",
    arms: ["exact", LF, "inc@R3D30", "rm23@R3D30", "rm23re30@R3D30", "rm23f80@R3D30", "rm23re30k@R3D30", "m23re30k@R3D30", "inc@WD30L", "rm23re30@WD30L", "rm23f80@WD30L", "rm23re30k@WD30L", "inc@W", "rm23re30k@W", "rm23re30k@clean"],
    bar: { arm: "rm23re30k", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("V1", "the confirmed clear pays in the range-aware detector: under R3D30, rm23re30k reaches at least 5 more than rm23re30", "rm23re30k@R3D30", "rm23re30@R3D30", 5),
        ge("V2", "and the range-aware mark's advantage survives it: under R3D30, rm23re30k reaches at least 5 more than m23re30k", "rm23re30k@R3D30", "m23re30k@R3D30", 5),
        ge("V3", "the gate on the hold costs under the joint stress whatever the clear: under R3D30, rm23f80 reaches at least 5 more than rm23re30k", "rm23f80@R3D30", "rm23re30k@R3D30", 5),
        within("V4", "behind the gate the confirmed clear changes little where the dropouts leak: under WD30L, rm23re30k is within 8 of rm23re30", "rm23re30k@WD30L", "rm23re30@WD30L", 8),
        bar("V5", "rm23re30k holds the bar (80% of exact) in every kind under R3D30", "rm23re30k@R3D30"),
        bar("V6", "and under WD30L", "rm23re30k@WD30L"),
        ge("V7", "it is still a cure where the law does not hold: under W, rm23re30k reaches at least 10 more than inc", "rm23re30k@W", "inc@W", 10),
        within("V8", "on a sea with no faults rm23re30k is within 8 of the clean long+fix+forget", "rm23re30k@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 26: WHICH CONFIRMATION WHEN THE HOLD IS THERE, AND IT KNOWS HOW FAR
study("detector-confirm-hold-range", {
    followUp: 26, held: "held31", out: outOf("DetectorConfirmHoldRange", "held31"), title: "WHICH CONFIRMATION WHEN THE HOLD IS THERE, AND IT KNOWS HOW FAR", designated: "rm34e30",
    arms: ["exact", LF, "m11e30@R3D30", "rm22e30@R3D30", "rm33e30@R3D30", "rm23e30@R3D30", "rm24e30@R3D30", "rm34e30@R3D30", "m34e30@R3D30", "m23e30@R3D30", "m11e30@WD30", "rm23e30@WD30", "rm34e30@WD30", "m34e30@WD30", "rm34e30@clean"],
    bar: { arm: "rm34e30", conds: ["R3D30"] }, verdict: { full: 3, partly: 2 },
    preds: [
        spread("AA1", "the family still collapses under a hold: under R3D30, the five confirming rules have pooled counts within 20 of each other", ["rm22e30@R3D30", "rm33e30@R3D30", "rm23e30@R3D30", "rm24e30@R3D30", "rm34e30@R3D30"], 20),
        eachGe("AA2", "every far confirmation repairs the range-law false returns: under R3D30 each of the five reaches at least 15 more than m11e30", ["rm22e30@R3D30", "rm33e30@R3D30", "rm23e30@R3D30", "rm24e30@R3D30", "rm34e30@R3D30"], "m11e30@R3D30", 15),
        gt("AA3", "strictness pays far away where the law holds: under R3D30, rm34e30 reaches more than rm23e30", "rm34e30@R3D30", "rm23e30@R3D30"),
        ge("AA4", "and a run of three is dearer than a run of two there: under R3D30, rm33e30 reaches at least 5 fewer than rm22e30", "rm22e30@R3D30", "rm33e30@R3D30", 5),
        bar("AA5", "rm34e30 holds the bar (80% of exact) in every kind under R3D30", "rm34e30@R3D30"),
        ge("AA6", "the bet on the law has a price: under WD30, rm34e30 reaches at least 10 fewer than m34e30", "m34e30@WD30", "rm34e30@WD30", 10),
        ge("AA7", "range-awareness pays where the law holds: under R3D30, rm34e30 reaches at least 5 more than m34e30", "rm34e30@R3D30", "m34e30@R3D30", 5),
        within("AA8", "on a sea with no faults rm34e30 is within 8 of the clean long+fix+forget", "rm34e30@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 27: WHICH RANGE THE CONFIRMED HOLD GOES BY
study("detector-hold-range-confirm", {
    followUp: 27, held: "held32", out: outOf("DetectorHoldRangeConfirm", "held32"), title: "WHICH RANGE THE CONFIRMED HOLD GOES BY", designated: "m23rn30k",
    arms: ["exact", LF, "inc@R3D30", "m23e30k@R3D30", "m23re30k@R3D30", "m23mk30k@R3D30", "m23mn30k@R3D30", "m23rp30k@R3D30", "m23rn30k@R3D30", "inc@WD30L", "m23e30k@WD30L", "m23re30k@WD30L", "m23rn30k@WD30L", "m23re30k@clean", "m23rn30k@clean"],
    bar: { arm: "m23rn30k", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("AB1", "the range at marking is the wrong range: under R3D30, m23mk30k reaches at least 10 fewer than m23re30k", "m23re30k@R3D30", "m23mk30k@R3D30", 10),
        within("AB2", "the nearest range ever read does as well as the range now: under R3D30, m23mn30k is within 10 of m23re30k", "m23mn30k@R3D30", "m23re30k@R3D30", 10),
        within("AB3", "the ramp does as well as the step: under R3D30, m23rp30k is within 10 of m23re30k", "m23rp30k@R3D30", "m23re30k@R3D30", 10),
        ge("AB4", "the designated covers the long dropout: under R3D30, m23rn30k reaches at least 10 more than inc", "m23rn30k@R3D30", "inc@R3D30", 10),
        bar("AB5", "m23rn30k holds the bar (80% of exact) in every kind under R3D30", "m23rn30k@R3D30"),
        bar("AB6", "and under WD30L", "m23rn30k@WD30L"),
        ge("AB7", "the gate costs against a hold at every range under the joint stress: under R3D30, m23e30k reaches at least 5 more than m23rn30k", "m23e30k@R3D30", "m23rn30k@R3D30", 5),
        within("AB8", "on a sea with no faults m23rn30k is within 8 of the clean long+fix+forget", "m23rn30k@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 28: THE NEAR ZONE CONFIRMED TOO, GRADED BY RANGE
study("detector-hold-confirm-range-confirm", {
    followUp: 28, held: "held33", out: outOf("DetectorHoldConfirmRangeConfirm", "held33"), title: "THE NEAR ZONE CONFIRMED TOO, GRADED BY RANGE", designated: "n23f34e30",
    arms: ["exact", LF, "m11e30@R3D30", "m23e30@R3D30", "m34e30@R3D30", "rm34e30@R3D30", "n22f34e30@R3D30", "n23f34e30@R3D30", "m11e30@WD30", "m23e30@WD30", "m34e30@WD30", "rm34e30@WD30", "n22f34e30@WD30", "n23f34e30@WD30", "n23f34e30@clean"],
    bar: { arm: "n23f34e30", conds: ["R3D30", "WD30"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("AC1", "a near confirmation repairs the uniform sea the range-aware mark could not: under WD30, n23f34e30 reaches at least 10 more than rm34e30", "n23f34e30@WD30", "rm34e30@WD30", 10),
        within("AC2", "and costs little where the law holds: under R3D30, n23f34e30 is within 8 of rm34e30", "n23f34e30@R3D30", "rm34e30@R3D30", 8),
        ge("AC3", "graded beats uniform strictness where the law holds: under R3D30, n23f34e30 reaches at least 5 more than m34e30", "n23f34e30@R3D30", "m34e30@R3D30", 5),
        ge("AC4", "and beats a uniform light rule: under R3D30, n23f34e30 reaches at least 5 more than m23e30", "n23f34e30@R3D30", "m23e30@R3D30", 5),
        bar("AC5", "n23f34e30 holds the bar (80% of exact) in every kind under R3D30", "n23f34e30@R3D30"),
        bar("AC6", "and under WD30", "n23f34e30@WD30"),
        within("AC7", "the memory in the near rule is worth little: under R3D30, n22f34e30 is within 8 of n23f34e30", "n22f34e30@R3D30", "n23f34e30@R3D30", 8),
        within("AC8", "on a sea with no faults n23f34e30 is within 8 of the clean long+fix+forget", "n23f34e30@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 29: THE SECOND HOLD, ON THE CONFIRMED HOLD
study("detector-range-hold-confirm-hold", {
    followUp: 29, held: "held34", out: outOf("DetectorRangeHoldConfirmHold", "held34"), title: "THE SECOND HOLD, ON THE CONFIRMED HOLD", designated: "m23e30kg",
    arms: ["exact", LF, "inc@R3D30", "m23e30k@R3D30", "m23re30k@R3D30", "m23re30kg@R3D30", "m23e30kg@R3D30", "inc@WD30L", "m23e30k@WD30L", "m23re30k@WD30L", "m23re30kg@WD30L", "m23e30kg@WD30L", "m23re30k@P", "m23re30kg@P", "m23e30kg@clean"],
    bar: { arm: "m23e30kg", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("AD1", "the gate costs under the joint stress: under R3D30, m23e30k reaches at least 5 more than m23re30k", "m23e30k@R3D30", "m23re30k@R3D30", 5),
        ge("AD2", "the ghost helps the gated hold: under R3D30, m23re30kg reaches at least 5 more than m23re30k", "m23re30kg@R3D30", "m23re30k@R3D30", 5),
        within("AD3", "and little when the hold is everywhere: under R3D30, m23e30kg is within 8 of m23e30k", "m23e30kg@R3D30", "m23e30k@R3D30", 8),
        ge("AD4", "the ghost answers the leak: under WD30L, m23e30kg reaches at least 5 more than m23e30k", "m23e30kg@WD30L", "m23e30k@WD30L", 5),
        ge("AD5", "and the ghost has a price under the persistent mix: under P, m23re30kg reaches at least 5 fewer than m23re30k", "m23re30k@P", "m23re30kg@P", 5),
        bar("AD6", "m23e30kg holds the bar (80% of exact) in every kind under R3D30", "m23e30kg@R3D30"),
        bar("AD7", "and under WD30L", "m23e30kg@WD30L"),
        within("AD8", "on a sea with no faults m23e30kg is within 8 of the clean long+fix+forget", "m23e30kg@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 30: THE GHOST FOR THE STRICT FAR MARK
study("detector-confirm-hold-range-hold", {
    followUp: 30, held: "held35", out: outOf("DetectorConfirmHoldRangeHold", "held35"), title: "THE GHOST FOR THE STRICT FAR MARK", designated: "rm34e30g",
    arms: ["exact", LF, "m11e30@R3D30", "rm23e30@R3D30", "rm23e30g@R3D30", "rm34e30@R3D30", "rm34e30g@R3D30", "m34e30@R3D30", "m11e30@WD30", "rm34e30@WD30", "rm34e30g@WD30", "m34e30@WD30", "rm34e30@P", "rm34e30g@P", "rm34e30g@clean"],
    bar: { arm: "rm34e30g", conds: ["R3D30"] }, verdict: { full: 3, partly: 2 },
    preds: [
        ge("AE1", "the ghost helps a strict far rule: under R3D30, rm34e30g reaches at least 5 more than rm34e30", "rm34e30g@R3D30", "rm34e30@R3D30", 5),
        ge("AE2", "and helps it more than a light one: rm34e30g + rm23e30 reaches at least 3 more than rm34e30 + rm23e30g under R3D30", { sum: ["rm34e30g@R3D30", "rm23e30@R3D30"] }, { sum: ["rm34e30@R3D30", "rm23e30g@R3D30"] }, 3),
        gt("AE3", "strict beats light with the ghost where the law holds: under R3D30, rm34e30g reaches more than rm23e30g", "rm34e30g@R3D30", "rm23e30g@R3D30"),
        bar("AE4", "rm34e30g holds the bar (80% of exact) in every kind under R3D30", "rm34e30g@R3D30"),
        ge("AE5", "the ghost has a price under the persistent mix: under P, rm34e30g reaches at least 5 fewer than rm34e30", "rm34e30@P", "rm34e30g@P", 5),
        ge("AE6", "the bet on the law has a price: under WD30, rm34e30g reaches at least 10 fewer than m34e30", "m34e30@WD30", "rm34e30g@WD30", 10),
        ge("AE7", "the pair still cures the false returns: under R3D30, rm34e30g reaches at least 15 more than m11e30", "rm34e30g@R3D30", "m11e30@R3D30", 15),
        within("AE8", "on a sea with no faults rm34e30g is within 8 of the clean long+fix+forget", "rm34e30g@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 31: THE CONFIRMED CLEAR THAT KNOWS HOW FAR
study("detector-range-hold-confirm-range", {
    followUp: 31, held: "held36", out: outOf("DetectorRangeHoldConfirmRange", "held36"), title: "THE CONFIRMED CLEAR THAT KNOWS HOW FAR", designated: "fn100f80",
    arms: ["exact", LF, "inc@WD30L", "m23@WD30L", "f100@WD30L", "f80@WD30L", "fn100f80@WD30L", "fn80f100@WD30L", "inc@R3D30", "m23@R3D30", "f100@R3D30", "f80@R3D30", "fn100f80@R3D30", "fn80f100@R3D30", "fn100f80@clean"],
    bar: { arm: "fn100f80", conds: ["WD30L", "R3D30"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("AF1", "a strict fraction near answers the leak: under WD30L, fn100f80 reaches at least 3 more than f80", "fn100f80@WD30L", "f80@WD30L", 3),
        ge("AF2", "and gives up the smear cure near: under R3D30, fn80f100 reaches at least 3 more than fn100f80", "fn80f100@R3D30", "fn100f80@R3D30", 3),
        ge("AF3", "the confirmed clear still cures the smear everywhere: under R3D30, f80 reaches at least 5 more than f100", "f80@R3D30", "f100@R3D30", 5),
        ge("AF4", "and still pays for it under the leak: under WD30L, f100 reaches at least 5 more than f80", "f100@WD30L", "f80@WD30L", 5),
        bar("AF5", "fn100f80 holds the bar (80% of exact) in every kind under R3D30", "fn100f80@R3D30"),
        bar("AF6", "and under WD30L", "fn100f80@WD30L"),
        within("AF7", "the far fraction is worth little: under R3D30, fn80f100 is within 8 of f80", "fn80f100@R3D30", "f80@R3D30", 8),
        within("AF8", "on a sea with no faults fn100f80 is within 8 of the clean long+fix+forget", "fn100f80@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 32: THE HOLD THAT REMEMBERS WHAT IT HELD
study("detector-hold-range-hold", {
    followUp: 32, held: "held37", out: outOf("DetectorHoldRangeHold", "held37"), title: "THE HOLD THAT REMEMBERS WHAT IT HELD", designated: "rn30c",
    arms: ["exact", LF, "inc@D30", "rn30@D30", "rp30@D30", "rn30c@D30", "rp30c@D30", "inc@WD30L", "rn30@WD30L", "rn30c@WD30L", "inc@P", "rn30@P", "rn30c@P", "rn30c@clean"],
    bar: { arm: "rn30c", conds: ["D30"] }, verdict: { full: 3, partly: 2 },
    preds: [
        within("AG1", "the carry changes little under the dropout: under D30, rn30c is within 8 of rn30", "rn30c@D30", "rn30@D30", 8),
        within("AG2", "and little under the leak: under WD30L, rn30c is within 8 of rn30", "rn30c@WD30L", "rn30@WD30L", 8),
        ge("AG3", "the carry has a price under the persistent mix: under P, rn30c reaches at least 5 fewer than rn30", "rn30@P", "rn30c@P", 5),
        within("AG4", "which range the gate goes by still does not matter with the carry: under D30, rp30c is within 10 of rn30c", "rp30c@D30", "rn30c@D30", 10),
        bar("AG5", "rn30c holds the bar (80% of exact) in every kind under D30", "rn30c@D30"),
        gt("AG6", "the designated beats the map that forgets under the dropout: under D30, rn30c reaches more than inc", "rn30c@D30", "inc@D30"),
        within("AG7", "under the persistent mix P, rn30c is within 10 of inc", "rn30c@P", "inc@P", 10),
        within("AG8", "on a sea with no faults rn30c is within 8 of the clean long+fix+forget", "rn30c@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 33: THE RANGE-AWARE DETECTOR WITH THE HOLD THAT EARNS ITS LENGTH
study("detector-range-hold-range", {
    followUp: 33, held: "held38", out: outOf("DetectorRangeHoldRange", "held38"), title: "THE RANGE-AWARE DETECTOR WITH THE HOLD THAT EARNS ITS LENGTH", designated: "r3re30",
    arms: ["exact", LF, "inc@R3D30", "re30@R3D30", "rd@R3D30", "rm23re30@R3D30", "r3e30@R3D30", "r3re30@R3D30", "inc@W", "re30@W", "r3re30@W", "inc@P", "re30@P", "r3re30@P", "r3re30@clean"],
    bar: { arm: "r3re30", conds: ["R3D30"] }, verdict: { full: 3, partly: 2 },
    preds: [
        ge("AH1", "the evidence hold repairs follow-up 10's detector: under R3D30, r3re30 reaches at least 50 more than rd", "r3re30@R3D30", "rd@R3D30", 50),
        within("AH2", "the run is no different from the memory behind a hold: under R3D30, r3re30 is within 10 of rm23re30", "r3re30@R3D30", "rm23re30@R3D30", 10),
        ge("AH3", "the gate on the hold costs here too: under R3D30, r3e30 reaches at least 5 more than r3re30", "r3e30@R3D30", "r3re30@R3D30", 5),
        ge("AH4", "a far run filters what a mark of one does not: under R3D30, r3re30 reaches at least 5 more than re30", "r3re30@R3D30", "re30@R3D30", 5),
        bar("AH5", "r3re30 holds the bar (80% of exact) in every kind under R3D30", "r3re30@R3D30"),
        ge("AH6", "the first-reading mark costs when the law fails: under W, r3re30 reaches at least 10 fewer than inc", "inc@W", "r3re30@W", 10),
        ge("AH7", "and under the persistent mix: under P, r3re30 reaches at least 5 fewer than inc", "inc@P", "r3re30@P", 5),
        within("AH8", "on a sea with no faults r3re30 is within 8 of the clean long+fix+forget", "r3re30@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 34: THE GHOST ON THE RAMP HOLD, CONFIRMED
study("detector-hold-range-confirm-hold", {
    followUp: 34, held: "held39", out: outOf("DetectorHoldRangeConfirmHold", "held39"), title: "THE GHOST ON THE RAMP HOLD, CONFIRMED", designated: "m23rn30kg",
    arms: ["exact", LF, "inc@R3D30", "m23e30kg@R3D30", "m23rn30k@R3D30", "m23rn30kg@R3D30", "m23rp30kg@R3D30", "inc@WD30L", "m23e30kg@WD30L", "m23rn30k@WD30L", "m23rn30kg@WD30L", "inc@P", "m23rn30k@P", "m23rn30kg@P", "m23rn30kg@clean"],
    bar: { arm: "m23rn30kg", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("AI1", "the ghost helps the ramp hold: under R3D30, m23rn30kg reaches at least 5 more than m23rn30k", "m23rn30kg@R3D30", "m23rn30k@R3D30", 5),
        ge("AI2", "and answers the leak: under WD30L, m23rn30kg reaches at least 5 more than m23rn30k", "m23rn30kg@WD30L", "m23rn30k@WD30L", 5),
        within("AI3", "the ghost's price under the persistent mix is small: under P, m23rn30kg is within 8 of m23rn30k", "m23rn30kg@P", "m23rn30k@P", 8),
        within("AI4", "the ramp needs no hold at every range once there is a ghost: under R3D30, m23rn30kg is within 8 of m23e30kg", "m23rn30kg@R3D30", "m23e30kg@R3D30", 8),
        within("AI5", "which range the ramp goes by still does not matter: under R3D30, m23rp30kg is within 10 of m23rn30kg", "m23rp30kg@R3D30", "m23rn30kg@R3D30", 10),
        bar("AI6", "m23rn30kg holds the bar (80% of exact) in every kind under R3D30", "m23rn30kg@R3D30"),
        bar("AI7", "and under WD30L", "m23rn30kg@WD30L"),
        within("AI8", "on a sea with no faults m23rn30kg is within 8 of the clean long+fix+forget", "m23rn30kg@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 35: THE GHOST BEHIND THE MARK RULE, WITH THE CLEAR CONFIRMED
study("detector-confirm-hold-confirm-hold", {
    followUp: 35, held: "held40", out: outOf("DetectorConfirmHoldConfirmHold", "held40"), title: "THE GHOST BEHIND THE MARK RULE, WITH THE CLEAR CONFIRMED", designated: "m33f80g",
    arms: ["exact", LF, "m11f80@WD30", "m23f80@WD30", "m33f80@WD30", "m23f80g@WD30", "m33f80g@WD30", "m34f80g@WD30", "m23f80@WD30L", "m33f80@WD30L", "m23f80g@WD30L", "m33f80g@WD30L", "m33f80@P", "m33f80g@P", "m33f80g@clean"],
    bar: { arm: "m33f80g", conds: ["WD30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("AJ1", "the ghost helps the strict run where cells are cleared: under WD30L, m33f80g reaches at least 5 more than m33f80", "m33f80g@WD30L", "m33f80@WD30L", 5),
        ge("AJ2", "and helps it more than the light rule: under WD30L, (m33f80g minus m33f80) exceeds (m23f80g minus m23f80) by at least 3", { sum: ["m33f80g@WD30L", "m23f80@WD30L"] }, { sum: ["m33f80@WD30L", "m23f80g@WD30L"] }, 3),
        within("AJ3", "the ghost's price under the persistent mix is small: under P, m33f80g is within 8 of m33f80", "m33f80g@P", "m33f80@P", 8),
        spread("AJ4", "with a ghost the mark rule is one rule: under WD30, the three ghost arms have pooled counts within 10 of each other", ["m23f80g@WD30", "m33f80g@WD30", "m34f80g@WD30"], 10),
        eachGe("AJ5", "every confirmation still repairs the white false returns: under WD30, each of the three ghost arms reaches at least 20 more than m11f80", ["m23f80g@WD30", "m33f80g@WD30", "m34f80g@WD30"], "m11f80@WD30", 20),
        bar("AJ6", "m33f80g holds the bar (80% of exact) in every kind under WD30", "m33f80g@WD30"),
        bar("AJ7", "and under WD30L", "m33f80g@WD30L"),
        within("AJ8", "on a sea with no faults m33f80g is within 8 of the clean long+fix+forget", "m33f80g@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 36: WHICH RANGE THE PLAIN LOCK GOES BY
study("detector-range-confirm-hold-range", {
    followUp: 36, held: "held41", out: outOf("DetectorRangeConfirmHoldRange", "held41"), title: "WHICH RANGE THE PLAIN LOCK GOES BY", designated: "rm23lkrn",
    arms: ["exact", LF, "inc@R3D30", "rm23re30@R3D30", "rm23lk@R3D30", "rm23lkmn@R3D30", "rm23lkrp@R3D30", "rm23lkrn@R3D30", "inc@W", "rm23lk@W", "rm23lkrn@W", "inc@P", "rm23lk@P", "rm23lkrn@P", "rm23lkrn@clean"],
    bar: { arm: "rm23lkrn", conds: ["R3D30"] }, verdict: { full: 3, partly: 2 },
    preds: [
        ge("AK1", "the near phantom problem remains: under R3D30, rm23lkrn reaches at least 30 fewer than rm23re30", "rm23re30@R3D30", "rm23lkrn@R3D30", 30),
        spread("AK2", "which range and shape the lock goes by does not rescue it: under R3D30, the four lock arms have pooled counts within 20 of each other", ["rm23lk@R3D30", "rm23lkmn@R3D30", "rm23lkrp@R3D30", "rm23lkrn@R3D30"], 20),
        ge("AK3", "a lock is worse than the map that forgets: under R3D30, rm23lkrn reaches at least 20 fewer than inc", "inc@R3D30", "rm23lkrn@R3D30", 20),
        noBar("AK4", "rm23lkrn does not hold the bar: under R3D30, it is below 80% of exact in each of the three kinds", "rm23lkrn@R3D30"),
        ge("AK5", "where the law fails it is worse: under W, rm23lkrn reaches at least 20 fewer than inc", "inc@W", "rm23lkrn@W", 20),
        gt("AK6", "under the persistent mix P, rm23lkrn reaches fewer than inc", "inc@P", "rm23lkrn@P"),
        gt("AK7", "the ramp shortens the damage a little: under R3D30, rm23lkrn reaches more than rm23lk", "rm23lkrn@R3D30", "rm23lk@R3D30"),
        ge("AK8", "a lock costs even on a sea with no faults: rm23lkrn@clean reaches at least 8 fewer than the clean long+fix+forget", "long+fix+forget", "rm23lkrn@clean", 8),
    ],
});
// FOLLOW-UP 37: THE SECOND HOLD THAT KNOWS HOW FAR
study("detector-hold-range-hold-range", {
    followUp: 37, held: "held42", out: outOf("DetectorHoldRangeHoldRange", "held42"), title: "THE SECOND HOLD THAT KNOWS HOW FAR", designated: "rn30cf",
    arms: ["exact", LF, "inc@D30", "rn30@D30", "rn30c@D30", "rn30cf@D30", "rn30cn@D30", "rn30@WD30L", "rn30c@WD30L", "rn30cf@WD30L", "inc@P", "rn30@P", "rn30c@P", "rn30cf@P", "rn30cf@clean"],
    bar: { arm: "rn30cf", conds: ["D30"] }, verdict: { full: 3, partly: 2 },
    preds: [
        within("AL1", "the far carry does what the carry at every range does: under D30, rn30cf is within 8 of rn30c", "rn30cf@D30", "rn30c@D30", 8),
        within("AL2", "and the near carry does nothing: under D30, rn30cn is within 8 of rn30", "rn30cn@D30", "rn30@D30", 8),
        ge("AL3", "the far carry is cheaper under the persistent mix: under P, rn30cf reaches at least 3 more than rn30c", "rn30cf@P", "rn30c@P", 3),
        within("AL4", "under the leak the zone does not matter: under WD30L, rn30cf is within 8 of rn30c", "rn30cf@WD30L", "rn30c@WD30L", 8),
        bar("AL5", "rn30cf holds the bar (80% of exact) in every kind under D30", "rn30cf@D30"),
        gt("AL6", "the designated beats the map that forgets under the dropout: under D30, rn30cf reaches more than inc", "rn30cf@D30", "inc@D30"),
        within("AL7", "under the persistent mix P, rn30cf is within 10 of rn30", "rn30cf@P", "rn30@P", 10),
        within("AL8", "on a sea with no faults rn30cf is within 8 of the clean long+fix+forget", "rn30cf@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 38: THE GHOST THAT KNOWS HOW FAR, ON THE CONFIRMED GATED HOLD
study("detector-range-hold-confirm-hold-range", {
    followUp: 38, held: "held43", out: outOf("DetectorRangeHoldConfirmHoldRange", "held43"), title: "THE GHOST THAT KNOWS HOW FAR, ON THE CONFIRMED GATED HOLD", designated: "m23re30kgf",
    arms: ["exact", LF, "inc@R3D30", "m23re30k@R3D30", "m23re30kg@R3D30", "m23re30kgf@R3D30", "m23re30kgn@R3D30", "m23e30kg@R3D30", "m23re30k@WD30L", "m23re30kg@WD30L", "m23re30kgf@WD30L", "m23re30k@P", "m23re30kg@P", "m23re30kgf@P", "m23re30kgf@clean"],
    bar: { arm: "m23re30kgf", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        within("AM1", "the far ghost is the one that matters: under R3D30, m23re30kgf is within 8 of m23re30kg", "m23re30kgf@R3D30", "m23re30kg@R3D30", 8),
        within("AM2", "and the near ghost does nothing: under R3D30, m23re30kgn is within 8 of m23re30k", "m23re30kgn@R3D30", "m23re30k@R3D30", 8),
        ge("AM3", "the far ghost helps the gated hold: under R3D30, m23re30kgf reaches at least 5 more than m23re30k", "m23re30kgf@R3D30", "m23re30k@R3D30", 5),
        within("AM4", "under the leak the zone does not matter: under WD30L, m23re30kgf is within 8 of m23re30kg", "m23re30kgf@WD30L", "m23re30kg@WD30L", 8),
        bar("AM5", "m23re30kgf holds the bar (80% of exact) in every kind under R3D30", "m23re30kgf@R3D30"),
        bar("AM6", "and under WD30L", "m23re30kgf@WD30L"),
        within("AM7", "the far ghost's price under the persistent mix is small: under P, m23re30kgf is within 8 of m23re30k", "m23re30kgf@P", "m23re30k@P", 8),
        within("AM8", "on a sea with no faults m23re30kgf is within 8 of the clean long+fix+forget", "m23re30kgf@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 39: WHICH RANGE-AWARE CONFIRMATION WHEN THE CLEAR IS CONFIRMED TOO
study("detector-confirm-hold-range-confirm", {
    followUp: 39, held: "held44", out: outOf("DetectorConfirmHoldRangeConfirm", "held44"), title: "WHICH RANGE-AWARE CONFIRMATION WHEN THE CLEAR IS CONFIRMED TOO", designated: "rm34f80",
    arms: ["exact", LF, "m11f80@R3D30", "rm22f80@R3D30", "rm33f80@R3D30", "rm23f80@R3D30", "rm34f80@R3D30", "m23f80@R3D30", "m34f80@R3D30", "m11f80@WD30L", "rm23f80@WD30L", "rm34f80@WD30L", "m23f80@WD30L", "m34f80@WD30L", "rm34f80@clean"],
    bar: { arm: "rm34f80", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        spread("AN1", "the family collapses under a confirmed clear too: under R3D30, the four range-aware confirming rules have pooled counts within 20 of each other", ["rm22f80@R3D30", "rm33f80@R3D30", "rm23f80@R3D30", "rm34f80@R3D30"], 20),
        eachGe("AN2", "every far confirmation repairs the range-law false returns: under R3D30, each of the four reaches at least 15 more than m11f80", ["rm22f80@R3D30", "rm33f80@R3D30", "rm23f80@R3D30", "rm34f80@R3D30"], "m11f80@R3D30", 15),
        within("AN3", "with the hold at every range the range-aware mark is level with the uniform one: under R3D30, rm34f80 is within 8 of m34f80", "rm34f80@R3D30", "m34f80@R3D30", 8),
        within("AN4", "strict and light are one rule under the leak: under WD30L, rm34f80 is within 8 of rm23f80", "rm34f80@WD30L", "rm23f80@WD30L", 8),
        bar("AN5", "rm34f80 holds the bar (80% of exact) in every kind under R3D30", "rm34f80@R3D30"),
        bar("AN6", "and under WD30L", "rm34f80@WD30L"),
        ge("AN7", "the bet on the law has a price: under WD30L, rm34f80 reaches at least 10 fewer than m34f80", "m34f80@WD30L", "rm34f80@WD30L", 10),
        within("AN8", "on a sea with no faults rm34f80 is within 8 of the clean long+fix+forget", "rm34f80@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 40: THE GHOST BEHIND THE CONFIRMED CLEAR THAT KNOWS HOW FAR
study("detector-range-hold-confirm-range-hold", {
    followUp: 40, held: "held45", out: outOf("DetectorRangeHoldConfirmRangeHold", "held45"), title: "THE GHOST BEHIND THE CONFIRMED CLEAR THAT KNOWS HOW FAR", designated: "fn100f80g",
    arms: ["exact", LF, "f80@WD30L", "fn100f80@WD30L", "f80g@WD30L", "fn100f80g@WD30L", "fn80f100g@WD30L", "f80@R3D30", "fn100f80@R3D30", "f80g@R3D30", "fn100f80g@R3D30", "fn80f100g@R3D30", "fn100f80@P", "fn100f80g@P", "fn100f80g@clean"],
    bar: { arm: "fn100f80g", conds: ["WD30L", "R3D30"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("AO1", "the ghost answers the leak behind the strict near clear: under WD30L, fn100f80g reaches at least 5 more than fn100f80", "fn100f80g@WD30L", "fn100f80@WD30L", 5),
        ge("AO2", "and helps under dropouts without a leak: under R3D30, fn100f80g reaches at least 5 more than fn100f80", "fn100f80g@R3D30", "fn100f80@R3D30", 5),
        within("AO3", "with a ghost the fraction by range is one rule: under WD30L, fn100f80g is within 8 of f80g", "fn100f80g@WD30L", "f80g@WD30L", 8),
        within("AO4", "and the opposite bet is no better: under R3D30, fn80f100g is within 8 of fn100f80g", "fn80f100g@R3D30", "fn100f80g@R3D30", 8),
        bar("AO5", "fn100f80g holds the bar (80% of exact) in every kind under R3D30", "fn100f80g@R3D30"),
        bar("AO6", "and under WD30L", "fn100f80g@WD30L"),
        within("AO7", "the ghost's price under the persistent mix is small: under P, fn100f80g is within 8 of fn100f80", "fn100f80g@P", "fn100f80@P", 8),
        within("AO8", "on a sea with no faults fn100f80g is within 8 of the clean long+fix+forget", "fn100f80g@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 41: THE GHOST THAT KNOWS HOW FAR, BEHIND THE RANGE-AWARE MARK
study("detector-hold-confirm-range-hold-range", {
    followUp: 41, held: "held46", out: outOf("DetectorHoldConfirmRangeHoldRange", "held46"), title: "THE GHOST THAT KNOWS HOW FAR, BEHIND THE RANGE-AWARE MARK", designated: "rm23e30gf",
    arms: ["exact", LF, "inc@R3D30", "m23e30@R3D30", "rm23e30@R3D30", "rm23e30g@R3D30", "rm23e30gf@R3D30", "rm23e30gn@R3D30", "rm23e30@W", "rm23e30g@W", "rm23e30gf@W", "rm23e30@P", "rm23e30g@P", "rm23e30gf@P", "rm23e30gf@clean"],
    bar: { arm: "rm23e30gf", conds: ["R3D30"] }, verdict: { full: 3, partly: 2 },
    preds: [
        within("AP1", "the far ghost is the one that matters: under R3D30, rm23e30gf is within 8 of rm23e30g", "rm23e30gf@R3D30", "rm23e30g@R3D30", 8),
        within("AP2", "the near-created ghost does little: under R3D30, rm23e30gn is within 8 of rm23e30", "rm23e30gn@R3D30", "rm23e30@R3D30", 8),
        ge("AP3", "the far ghost helps: under R3D30, rm23e30gf reaches at least 3 more than rm23e30", "rm23e30gf@R3D30", "rm23e30@R3D30", 3),
        within("AP4", "the ghost does not cost where the law fails: under W, rm23e30gf is within 10 of rm23e30", "rm23e30gf@W", "rm23e30@W", 10),
        within("AP5", "and its price under the persistent mix is small: under P, rm23e30gf is within 8 of rm23e30", "rm23e30gf@P", "rm23e30@P", 8),
        bar("AP6", "rm23e30gf holds the bar (80% of exact) in every kind under R3D30", "rm23e30gf@R3D30"),
        gt("AP7", "the designated beats the uniform pair: under R3D30, rm23e30gf reaches more than m23e30", "rm23e30gf@R3D30", "m23e30@R3D30"),
        within("AP8", "on a sea with no faults rm23e30gf is within 8 of the clean long+fix+forget", "rm23e30gf@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 42: THE GHOST FOR THE STRICT FAR MARK, WITH THE CLEAR CONFIRMED
study("detector-confirm-hold-range-hold-confirm", {
    followUp: 42, held: "held47", out: outOf("DetectorConfirmHoldRangeHoldConfirm", "held47"), title: "THE GHOST FOR THE STRICT FAR MARK, WITH THE CLEAR CONFIRMED", designated: "rm34f80g",
    arms: ["exact", LF, "rm34e30@R3D30", "rm34e30g@R3D30", "rm34f80@R3D30", "rm34f80g@R3D30", "rm23f80g@R3D30", "rm34e30@WD30L", "rm34e30g@WD30L", "rm34f80@WD30L", "rm34f80g@WD30L", "rm23f80g@WD30L", "rm34f80@P", "rm34f80g@P", "rm34f80g@clean"],
    bar: { arm: "rm34f80g", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("AQ1", "the ghost answers the leak behind the confirmed clear: under WD30L, rm34f80g reaches at least 5 more than rm34f80", "rm34f80g@WD30L", "rm34f80@WD30L", 5),
        ge("AQ2", "and helps the strict rule where the dropouts do not leak: under R3D30, rm34f80g reaches at least 5 more than rm34f80", "rm34f80g@R3D30", "rm34f80@R3D30", 5),
        within("AQ3", "behind a ghost the confirmed clear changes little where the law holds: under R3D30, rm34f80g is within 8 of rm34e30g", "rm34f80g@R3D30", "rm34e30g@R3D30", 8),
        within("AQ4", "and under the leak: under WD30L, rm34f80g is within 8 of rm34e30g", "rm34f80g@WD30L", "rm34e30g@WD30L", 8),
        within("AQ5", "the ghost's price under the persistent mix is small: under P, rm34f80g is within 8 of rm34f80", "rm34f80g@P", "rm34f80@P", 8),
        bar("AQ6", "rm34f80g holds the bar (80% of exact) in every kind under R3D30", "rm34f80g@R3D30"),
        bar("AQ7", "and under WD30L", "rm34f80g@WD30L"),
        within("AQ8", "on a sea with no faults rm34f80g is within 8 of the clean long+fix+forget", "rm34f80g@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 43: THE CONFIRMED CLEAR THAT KNOWS HOW FAR, ON THE RAMP HOLD
study("detector-hold-range-confirm-range", {
    followUp: 43, held: "held48", out: outOf("DetectorHoldRangeConfirmRange", "held48"), title: "THE CONFIRMED CLEAR THAT KNOWS HOW FAR, ON THE RAMP HOLD", designated: "m23rn30kn",
    arms: ["exact", LF, "inc@WD30L", "m23rn30@WD30L", "m23rn30k@WD30L", "m23rn30kn@WD30L", "m23rn30kf@WD30L", "inc@R3D30", "m23rn30@R3D30", "m23rn30k@R3D30", "m23rn30kn@R3D30", "m23rn30kf@R3D30", "m23rn30k@P", "m23rn30kn@P", "m23rn30kn@clean"],
    bar: { arm: "m23rn30kn", conds: ["WD30L", "R3D30"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("AR1", "a strict fraction near answers the leak: under WD30L, m23rn30kn reaches at least 3 more than m23rn30k", "m23rn30kn@WD30L", "m23rn30k@WD30L", 3),
        ge("AR2", "and gives up the smear cure near: under R3D30, m23rn30kf reaches at least 3 more than m23rn30kn", "m23rn30kf@R3D30", "m23rn30kn@R3D30", 3),
        ge("AR3", "the confirmed clear still cures the smear under the ramp: under R3D30, m23rn30k reaches at least 5 more than m23rn30", "m23rn30k@R3D30", "m23rn30@R3D30", 5),
        ge("AR4", "and still pays for it under the leak: under WD30L, m23rn30 reaches at least 5 more than m23rn30k", "m23rn30@WD30L", "m23rn30k@WD30L", 5),
        bar("AR5", "m23rn30kn holds the bar (80% of exact) in every kind under R3D30", "m23rn30kn@R3D30"),
        bar("AR6", "and under WD30L", "m23rn30kn@WD30L"),
        within("AR7", "the fraction by range is cheap under the persistent mix: under P, m23rn30kn is within 8 of m23rn30k", "m23rn30kn@P", "m23rn30k@P", 8),
        within("AR8", "on a sea with no faults m23rn30kn is within 8 of the clean long+fix+forget", "m23rn30kn@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 44: THE PLAIN RUN WITH THE CLEAR CONFIRMED
study("detector-range-hold-range-confirm", {
    followUp: 44, held: "held49", out: outOf("DetectorRangeHoldRangeConfirm", "held49"), title: "THE PLAIN RUN WITH THE CLEAR CONFIRMED", designated: "crre30k",
    arms: ["exact", LF, "inc@R3D30", "crre30@R3D30", "crre30k@R3D30", "rm23re30@R3D30", "rm23re30k@R3D30", "inc@WD30L", "crre30@WD30L", "crre30k@WD30L", "rm23re30@WD30L", "rm23re30k@WD30L", "inc@W", "crre30k@W", "crre30k@clean"],
    bar: { arm: "crre30k", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("AS1", "the confirmed clear pays in the plain-run detector: under R3D30, crre30k reaches at least 5 more than crre30", "crre30k@R3D30", "crre30@R3D30", 5),
        within("AS2", "and behind the gate it changes little under the leak: under WD30L, crre30k is within 8 of crre30", "crre30k@WD30L", "crre30@WD30L", 8),
        within("AS3", "the run and the memory are one rule behind a confirmed clear: under R3D30, crre30k is within 10 of rm23re30k", "crre30k@R3D30", "rm23re30k@R3D30", 10),
        within("AS4", "and under the leak: under WD30L, crre30k is within 10 of rm23re30k", "crre30k@WD30L", "rm23re30k@WD30L", 10),
        bar("AS5", "crre30k holds the bar (80% of exact) in every kind under R3D30", "crre30k@R3D30"),
        bar("AS6", "and under WD30L", "crre30k@WD30L"),
        ge("AS7", "the first-reading mark costs when the law fails: under W, crre30k reaches at least 10 fewer than inc", "inc@W", "crre30k@W", 10),
        within("AS8", "on a sea with no faults crre30k is within 8 of the clean long+fix+forget", "crre30k@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 45: THE HOLD THAT REMEMBERS, WITH THE CLEAR CONFIRMED
study("detector-hold-range-hold-confirm", {
    followUp: 45, held: "held50", out: outOf("DetectorHoldRangeHoldConfirm", "held50"), title: "THE HOLD THAT REMEMBERS, WITH THE CLEAR CONFIRMED", designated: "rn30ck",
    arms: ["exact", LF, "inc@D30", "rn30@D30", "rn30k@D30", "rn30c@D30", "rn30ck@D30", "inc@WD30L", "rn30@WD30L", "rn30k@WD30L", "rn30c@WD30L", "rn30ck@WD30L", "rn30@P", "rn30ck@P", "rn30ck@clean"],
    bar: { arm: "rn30ck", conds: ["D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        within("AT1", "the confirmed clear changes little for a mark of one under the dropout: under D30, rn30k is within 8 of rn30", "rn30k@D30", "rn30@D30", 8),
        ge("AT2", "but it costs under the leak: under WD30L, rn30 reaches at least 3 more than rn30k", "rn30@WD30L", "rn30k@WD30L", 3),
        within("AT3", "the carry changes little behind it: under D30, rn30ck is within 8 of rn30k", "rn30ck@D30", "rn30k@D30", 8),
        within("AT4", "and under the leak: under WD30L, rn30ck is within 8 of rn30c", "rn30ck@WD30L", "rn30c@WD30L", 8),
        bar("AT5", "rn30ck holds the bar (80% of exact) in every kind under D30", "rn30ck@D30"),
        bar("AT6", "and under WD30L", "rn30ck@WD30L"),
        within("AT7", "the pair's price under the persistent mix is small: under P, rn30ck is within 10 of rn30", "rn30ck@P", "rn30@P", 10),
        within("AT8", "on a sea with no faults rn30ck is within 8 of the clean long+fix+forget", "rn30ck@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 46: THE GHOST THAT KNOWS HOW FAR, BEHIND THE STRICT FAR MARK
study("detector-confirm-hold-range-hold-range", {
    followUp: 46, held: "held51", out: outOf("DetectorConfirmHoldRangeHoldRange", "held51"), title: "THE GHOST THAT KNOWS HOW FAR, BEHIND THE STRICT FAR MARK", designated: "rm34e30gf",
    arms: ["exact", LF, "rm34e30@R3D30", "rm34e30g@R3D30", "rm34e30gf@R3D30", "rm34e30gn@R3D30", "rm23e30@R3D30", "rm23e30gf@R3D30", "rm34e30@WD30", "rm34e30g@WD30", "rm34e30gf@WD30", "rm34e30@P", "rm34e30g@P", "rm34e30gf@P", "rm34e30gf@clean"],
    bar: { arm: "rm34e30gf", conds: ["R3D30"] }, verdict: { full: 3, partly: 2 },
    preds: [
        within("AU1", "the far ghost is the one that matters: under R3D30, rm34e30gf is within 8 of rm34e30g", "rm34e30gf@R3D30", "rm34e30g@R3D30", 8),
        within("AU2", "the near-created ghost does little: under R3D30, rm34e30gn is within 8 of rm34e30", "rm34e30gn@R3D30", "rm34e30@R3D30", 8),
        ge("AU3", "the far ghost helps the strict rule: under R3D30, rm34e30gf reaches at least 5 more than rm34e30", "rm34e30gf@R3D30", "rm34e30@R3D30", 5),
        ge("AU4", "and helps it more than the light rule: under R3D30, (rm34e30gf minus rm34e30) exceeds (rm23e30gf minus rm23e30) by at least 3", { sum: ["rm34e30gf@R3D30", "rm23e30@R3D30"] }, { sum: ["rm34e30@R3D30", "rm23e30gf@R3D30"] }, 3),
        within("AU5", "the ghost does not cost where the law fails: under WD30, rm34e30gf is within 10 of rm34e30", "rm34e30gf@WD30", "rm34e30@WD30", 10),
        bar("AU6", "rm34e30gf holds the bar (80% of exact) in every kind under R3D30", "rm34e30gf@R3D30"),
        within("AU7", "the ghost's price under the persistent mix is small: under P, rm34e30gf is within 8 of rm34e30", "rm34e30gf@P", "rm34e30@P", 8),
        within("AU8", "on a sea with no faults rm34e30gf is within 8 of the clean long+fix+forget", "rm34e30gf@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 47: THE SECOND HOLD ON THE PLAIN RUN
study("detector-range-hold-range-hold", {
    followUp: 47, held: "held52", out: outOf("DetectorRangeHoldRangeHold", "held52"), title: "THE SECOND HOLD ON THE PLAIN RUN", designated: "crre30g",
    arms: ["exact", LF, "inc@R3D30", "crre30@R3D30", "cre30@R3D30", "crre30g@R3D30", "cre30g@R3D30", "rm23re30g@R3D30", "inc@W", "crre30@W", "crre30g@W", "inc@P", "crre30@P", "crre30g@P", "crre30g@clean"],
    bar: { arm: "crre30g", conds: ["R3D30"] }, verdict: { full: 3, partly: 2 },
    preds: [
        ge("AV1", "the range gate on the hold costs under the joint stress: under R3D30, cre30 reaches at least 5 more than crre30", "cre30@R3D30", "crre30@R3D30", 5),
        ge("AV2", "the ghost helps the gated hold: under R3D30, crre30g reaches at least 5 more than crre30", "crre30g@R3D30", "crre30@R3D30", 5),
        within("AV3", "and little when the hold is everywhere: under R3D30, cre30g is within 8 of cre30", "cre30g@R3D30", "cre30@R3D30", 8),
        within("AV4", "behind a ghost the run is no different from the memory: under R3D30, crre30g is within 10 of rm23re30g", "crre30g@R3D30", "rm23re30g@R3D30", 10),
        bar("AV5", "crre30g holds the bar (80% of exact) in every kind under R3D30", "crre30g@R3D30"),
        ge("AV6", "the first-reading mark costs when the law fails: under W, crre30g reaches at least 10 fewer than inc", "inc@W", "crre30g@W", 10),
        within("AV7", "the ghost's price under the persistent mix is small: under P, crre30g is within 8 of crre30", "crre30g@P", "crre30@P", 8),
        within("AV8", "on a sea with no faults crre30g is within 8 of the clean long+fix+forget", "crre30g@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 48: THE GHOST THAT KNOWS HOW FAR, ON THE CONFIRMED RAMP HOLD
study("detector-hold-range-confirm-hold-range", {
    followUp: 48, held: "held53", out: outOf("DetectorHoldRangeConfirmHoldRange", "held53"), title: "THE GHOST THAT KNOWS HOW FAR, ON THE CONFIRMED RAMP HOLD", designated: "m23rn30kgf",
    arms: ["exact", LF, "inc@R3D30", "m23rn30k@R3D30", "m23rn30kg@R3D30", "m23rn30kgf@R3D30", "m23rn30kgn@R3D30", "m23rn30k@WD30L", "m23rn30kg@WD30L", "m23rn30kgf@WD30L", "m23rn30kgn@WD30L", "m23rn30k@P", "m23rn30kg@P", "m23rn30kgf@P", "m23rn30kgf@clean"],
    bar: { arm: "m23rn30kgf", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        within("AW1", "the far ghost is the one that matters: under R3D30, m23rn30kgf is within 8 of m23rn30kg", "m23rn30kgf@R3D30", "m23rn30kg@R3D30", 8),
        within("AW2", "and the near ghost does little: under R3D30, m23rn30kgn is within 8 of m23rn30k", "m23rn30kgn@R3D30", "m23rn30k@R3D30", 8),
        ge("AW3", "the far ghost helps the ramp hold: under R3D30, m23rn30kgf reaches at least 5 more than m23rn30k", "m23rn30kgf@R3D30", "m23rn30k@R3D30", 5),
        ge("AW4", "and answers the leak: under WD30L, m23rn30kgf reaches at least 5 more than m23rn30k", "m23rn30kgf@WD30L", "m23rn30k@WD30L", 5),
        bar("AW5", "m23rn30kgf holds the bar (80% of exact) in every kind under R3D30", "m23rn30kgf@R3D30"),
        bar("AW6", "and under WD30L", "m23rn30kgf@WD30L"),
        within("AW7", "the far ghost's price under the persistent mix is small: under P, m23rn30kgf is within 8 of m23rn30k", "m23rn30kgf@P", "m23rn30k@P", 8),
        within("AW8", "on a sea with no faults m23rn30kgf is within 8 of the clean long+fix+forget", "m23rn30kgf@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 49: THE GHOST THAT KNOWS HOW FAR, WITH ITS RE-MARK CONFIRMED
study("detector-range-hold-confirm-hold-range-confirm", {
    followUp: 49, held: "held54", out: outOf("DetectorRangeHoldConfirmHoldRangeConfirm", "held54"), title: "THE GHOST THAT KNOWS HOW FAR, WITH ITS RE-MARK CONFIRMED", designated: "m23re30kgfc",
    arms: ["exact", LF, "m23re30k@R3D30", "m23re30kg@R3D30", "m23re30kgf@R3D30", "m23re30kgfc@R3D30", "m23re30kgc@R3D30", "m23re30kg@WD30L", "m23re30kgf@WD30L", "m23re30kgfc@WD30L", "m23re30kgc@WD30L", "m23re30kgf@P", "m23re30kgfc@P", "m23re30kgc@P", "m23re30kgfc@clean"],
    bar: { arm: "m23re30kgfc", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        within("AX1", "the confirmed ghost's price under the persistent mix is no different from the plain one's: under P, m23re30kgfc is within 8 of m23re30kgf", "m23re30kgfc@P", "m23re30kgf@P", 8),
        within("AX2", "the test costs little where the law holds: under R3D30, m23re30kgfc is within 8 of m23re30kgf", "m23re30kgfc@R3D30", "m23re30kgf@R3D30", 8),
        ge("AX3", "the confirmed far ghost still helps the gated hold: under R3D30, m23re30kgfc reaches at least 5 more than m23re30k", "m23re30kgfc@R3D30", "m23re30k@R3D30", 5),
        ge("AX4", "but the test refuses the leak's stray hits: under WD30L, m23re30kgfc reaches at least 3 fewer than m23re30kgf", "m23re30kgf@WD30L", "m23re30kgfc@WD30L", 3),
        bar("AX5", "m23re30kgfc holds the bar (80% of exact) in every kind under R3D30", "m23re30kgfc@R3D30"),
        bar("AX6", "and under WD30L", "m23re30kgfc@WD30L"),
        within("AX7", "the zone still does not matter once the re-mark is confirmed: under R3D30, m23re30kgc is within 8 of m23re30kgfc", "m23re30kgc@R3D30", "m23re30kgfc@R3D30", 8),
        within("AX8", "on a sea with no faults m23re30kgfc is within 8 of the clean long+fix+forget", "m23re30kgfc@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 50: THE CONFIRMED CLEAR THAT KNOWS HOW FAR, BEHIND THE CARRY
study("detector-hold-range-hold-confirm-range", {
    followUp: 50, held: "held55", out: outOf("DetectorHoldRangeHoldConfirmRange", "held55"), title: "THE CONFIRMED CLEAR THAT KNOWS HOW FAR, BEHIND THE CARRY", designated: "rn30cfn100f80",
    arms: ["exact", LF, "inc@D30", "rn30c@D30", "rn30ck@D30", "rn30cfn100f80@D30", "rn30cfn80f100@D30", "inc@WD30L", "rn30c@WD30L", "rn30ck@WD30L", "rn30cfn100f80@WD30L", "rn30cfn80f100@WD30L", "rn30ck@P", "rn30cfn100f80@P", "rn30cfn100f80@clean"],
    bar: { arm: "rn30cfn100f80", conds: ["D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("AY1", "a strict fraction near answers the leak: under WD30L, rn30cfn100f80 reaches at least 3 more than rn30ck", "rn30cfn100f80@WD30L", "rn30ck@WD30L", 3),
        within("AY2", "by the arithmetic the designated is the run clear: under D30, rn30cfn100f80 is within 8 of rn30c", "rn30cfn100f80@D30", "rn30c@D30", 8),
        ge("AY3", "the confirmed clear costs under the leak: under WD30L, rn30c reaches at least 3 more than rn30ck", "rn30c@WD30L", "rn30ck@WD30L", 3),
        within("AY4", "and changes little under the dropout: under D30, rn30ck is within 8 of rn30c", "rn30ck@D30", "rn30c@D30", 8),
        bar("AY5", "rn30cfn100f80 holds the bar (80% of exact) in every kind under D30", "rn30cfn100f80@D30"),
        bar("AY6", "and under WD30L", "rn30cfn100f80@WD30L"),
        within("AY7", "the fraction by range is cheap under the persistent mix: under P, rn30cfn100f80 is within 8 of rn30ck", "rn30cfn100f80@P", "rn30ck@P", 8),
        within("AY8", "on a sea with no faults rn30cfn100f80 is within 8 of the clean long+fix+forget", "rn30cfn100f80@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 51: THE PLAIN RUN WITH THE SECOND HOLD AND THE CLEAR CONFIRMED
study("detector-range-hold-range-hold-confirm", {
    followUp: 51, held: "held56", out: outOf("DetectorRangeHoldRangeHoldConfirm", "held56"), title: "THE PLAIN RUN WITH THE SECOND HOLD AND THE CLEAR CONFIRMED", designated: "crre30kg",
    arms: ["exact", LF, "crre30g@R3D30", "crre30k@R3D30", "crre30kg@R3D30", "cre30kg@R3D30", "rm23re30kg@R3D30", "crre30g@WD30L", "crre30k@WD30L", "crre30kg@WD30L", "cre30kg@WD30L", "rm23re30kg@WD30L", "inc@W", "crre30kg@W", "crre30kg@clean"],
    bar: { arm: "crre30kg", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("AZ1", "the ghost answers the leak behind the confirmed clear: under WD30L, crre30kg reaches at least 5 more than crre30k", "crre30kg@WD30L", "crre30k@WD30L", 5),
        ge("AZ2", "and helps where the dropouts do not leak: under R3D30, crre30kg reaches at least 5 more than crre30k", "crre30kg@R3D30", "crre30k@R3D30", 5),
        within("AZ3", "behind a ghost the confirmed clear changes little where the law holds: under R3D30, crre30kg is within 8 of crre30g", "crre30kg@R3D30", "crre30g@R3D30", 8),
        within("AZ4", "and under the leak: under WD30L, crre30kg is within 8 of crre30g", "crre30kg@WD30L", "crre30g@WD30L", 8),
        bar("AZ5", "crre30kg holds the bar (80% of exact) in every kind under R3D30", "crre30kg@R3D30"),
        bar("AZ6", "and under WD30L", "crre30kg@WD30L"),
        ge("AZ7", "the first-reading mark costs when the law fails: under W, crre30kg reaches at least 10 fewer than inc", "inc@W", "crre30kg@W", 10),
        within("AZ8", "on a sea with no faults crre30kg is within 8 of the clean long+fix+forget", "crre30kg@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 52: THE GHOST ON THE CONFIRMED RAMP HOLD, WITH ITS RE-MARK CONFIRMED
study("detector-hold-range-confirm-hold-confirm", {
    followUp: 52, held: "held57", out: outOf("DetectorHoldRangeConfirmHoldConfirm", "held57"), title: "THE GHOST ON THE CONFIRMED RAMP HOLD, WITH ITS RE-MARK CONFIRMED", designated: "m23rn30kgc",
    arms: ["exact", LF, "inc@R3D30", "m23rn30k@R3D30", "m23rn30kg@R3D30", "m23rn30kgc@R3D30", "full@R3D30", "m23rn30k@WD30L", "m23rn30kg@WD30L", "m23rn30kgc@WD30L", "full@WD30L", "m23rn30k@P", "m23rn30kg@P", "m23rn30kgc@P", "m23rn30kgc@clean"],
    bar: { arm: "m23rn30kgc", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        within("BA1", "the test costs little where the law holds: under R3D30, m23rn30kgc is within 8 of m23rn30kg", "m23rn30kgc@R3D30", "m23rn30kg@R3D30", 8),
        ge("BA2", "but it refuses the leak's stray hits: under WD30L, m23rn30kgc reaches at least 3 fewer than m23rn30kg", "m23rn30kg@WD30L", "m23rn30kgc@WD30L", 3),
        within("BA3", "its price under the persistent mix is no different from the plain ghost's: under P, m23rn30kgc is within 8 of m23rn30kg", "m23rn30kgc@P", "m23rn30kg@P", 8),
        ge("BA4", "the confirmed ghost still helps the ramp hold: under R3D30, m23rn30kgc reaches at least 5 more than m23rn30k", "m23rn30kgc@R3D30", "m23rn30k@R3D30", 5),
        within("BA5", "the ramp needs no hold at every range once the ghost is confirmed: under R3D30, m23rn30kgc is within 8 of full", "m23rn30kgc@R3D30", "full@R3D30", 8),
        bar("BA6", "m23rn30kgc holds the bar (80% of exact) in every kind under R3D30", "m23rn30kgc@R3D30"),
        bar("BA7", "and under WD30L", "m23rn30kgc@WD30L"),
        within("BA8", "on a sea with no faults m23rn30kgc is within 8 of the clean long+fix+forget", "m23rn30kgc@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 53: THE GATE AND THE CONFIRMED GHOST
study("detector-range-hold-confirm-hold-confirm", {
    followUp: 53, held: "held58", out: outOf("DetectorRangeHoldConfirmHoldConfirm", "held58"), title: "THE GATE AND THE CONFIRMED GHOST", designated: "m23re30kgc",
    arms: ["exact", LF, "inc@R3D30", "m23re30k@R3D30", "m23re30kg@R3D30", "m23re30kgc@R3D30", "m23e30kg@R3D30", "full@R3D30", "m23re30kg@WD30L", "m23re30kgc@WD30L", "m23e30kg@WD30L", "full@WD30L", "m23re30kg@P", "m23re30kgc@P", "m23re30kgc@clean"],
    bar: { arm: "m23re30kgc", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        within("BB1", "the test costs little where the law holds: under R3D30, m23re30kgc is within 8 of m23re30kg", "m23re30kgc@R3D30", "m23re30kg@R3D30", 8),
        ge("BB2", "but it refuses the leak's stray hits: under WD30L, m23re30kgc reaches at least 3 fewer than m23re30kg", "m23re30kg@WD30L", "m23re30kgc@WD30L", 3),
        within("BB3", "its price under the persistent mix is no different from the plain ghost's: under P, m23re30kgc is within 8 of m23re30kg", "m23re30kgc@P", "m23re30kg@P", 8),
        ge("BB4", "the gate costs under the joint stress whichever ghost it has: under R3D30, full reaches at least 5 more than m23re30kgc", "full@R3D30", "m23re30kgc@R3D30", 5),
        ge("BB5", "the confirmed ghost still helps the gated hold: under R3D30, m23re30kgc reaches at least 5 more than m23re30k", "m23re30kgc@R3D30", "m23re30k@R3D30", 5),
        bar("BB6", "m23re30kgc holds the bar (80% of exact) in every kind under R3D30", "m23re30kgc@R3D30"),
        bar("BB7", "and under WD30L", "m23re30kgc@WD30L"),
        within("BB8", "on a sea with no faults m23re30kgc is within 8 of the clean long+fix+forget", "m23re30kgc@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 54: THE HOLD ON THE FREE STATE
study("detector-confirm-hold-range-hold-confirm-hold", {
    followUp: 54, held: "held59", out: outOf("DetectorConfirmHoldRangeHoldConfirmHold", "held59"), title: "THE HOLD ON THE FREE STATE", designated: "rm34f80gl",
    arms: ["exact", LF, "rm34f80@R3D30", "rm34f80g@R3D30", "rm34f80l@R3D30", "rm34f80gl@R3D30", "rm23f80gl@R3D30", "rm34f80@WD30L", "rm34f80g@WD30L", "rm34f80l@WD30L", "rm34f80gl@WD30L", "rm23f80gl@WD30L", "rm34f80g@P", "rm34f80gl@P", "rm34f80gl@clean"],
    bar: { arm: "rm34f80gl", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        within("BC1", "where the law holds the lock adds little to the ghost: under R3D30, rm34f80gl is within 8 of rm34f80g", "rm34f80gl@R3D30", "rm34f80g@R3D30", 8),
        ge("BC2", "under the uniform false rate and the leak the lock costs: under WD30L, rm34f80gl reaches at least 3 fewer than rm34f80g", "rm34f80g@WD30L", "rm34f80gl@WD30L", 3),
        ge("BC3", "under the persistent mix the lock helps: under P, rm34f80gl reaches at least 3 more than rm34f80g", "rm34f80gl@P", "rm34f80g@P", 3),
        within("BC4", "the lock alone does nothing measurable: under R3D30, rm34f80l is within 8 of rm34f80", "rm34f80l@R3D30", "rm34f80@R3D30", 8),
        bar("BC5", "rm34f80gl holds the bar (80% of exact) in every kind under R3D30", "rm34f80gl@R3D30"),
        bar("BC6", "and under WD30L", "rm34f80gl@WD30L"),
        gt("BC7", "strict beats light with both: under R3D30, rm34f80gl reaches more than rm23f80gl", "rm34f80gl@R3D30", "rm23f80gl@R3D30"),
        within("BC8", "on a sea with no faults rm34f80gl is within 8 of the clean long+fix+forget", "rm34f80gl@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 55: THE GHOST THAT KNOWS HOW FAR, BEHIND THE PLAIN RUN
study("detector-range-hold-range-hold-range", {
    followUp: 55, held: "held60", out: outOf("DetectorRangeHoldRangeHoldRange", "held60"), title: "THE GHOST THAT KNOWS HOW FAR, BEHIND THE PLAIN RUN", designated: "crre30gf",
    arms: ["exact", LF, "inc@R3D30", "crre30@R3D30", "crre30g@R3D30", "crre30gf@R3D30", "crre30gn@R3D30", "rm23re30gf@R3D30", "crre30@W", "crre30g@W", "crre30gf@W", "crre30@P", "crre30g@P", "crre30gf@P", "crre30gf@clean"],
    bar: { arm: "crre30gf", conds: ["R3D30"] }, verdict: { full: 3, partly: 2 },
    preds: [
        within("BD1", "the far ghost is the one that matters: under R3D30, crre30gf is within 8 of crre30g", "crre30gf@R3D30", "crre30g@R3D30", 8),
        within("BD2", "the near-created ghost does little: under R3D30, crre30gn is within 8 of crre30", "crre30gn@R3D30", "crre30@R3D30", 8),
        ge("BD3", "the far ghost helps the gated run: under R3D30, crre30gf reaches at least 5 more than crre30", "crre30gf@R3D30", "crre30@R3D30", 5),
        within("BD4", "the ghost does not cost where the law fails: under W, crre30gf is within 10 of crre30", "crre30gf@W", "crre30@W", 10),
        within("BD5", "and its price under the persistent mix is small: under P, crre30gf is within 8 of crre30", "crre30gf@P", "crre30@P", 8),
        bar("BD6", "crre30gf holds the bar (80% of exact) in every kind under R3D30", "crre30gf@R3D30"),
        within("BD7", "behind the far ghost the run is no different from the memory: under R3D30, crre30gf is within 10 of rm23re30gf", "crre30gf@R3D30", "rm23re30gf@R3D30", 10),
        within("BD8", "on a sea with no faults crre30gf is within 8 of the clean long+fix+forget", "crre30gf@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 56: THE HOLD ON THE FREE STATE, BEHIND THE CARRY AND THE FRACTION BY RANGE
study("detector-hold-range-hold-confirm-range-hold", {
    followUp: 56, held: "held61", out: outOf("DetectorHoldRangeHoldConfirmRangeHold", "held61"), title: "THE HOLD ON THE FREE STATE, BEHIND THE CARRY AND THE FRACTION BY RANGE", designated: "rn30cfn100f80l",
    arms: ["exact", LF, "inc@D30", "rn30c@D30", "rn30cl@D30", "rn30cfn100f80@D30", "rn30cfn100f80l@D30", "inc@WD30L", "rn30c@WD30L", "rn30cl@WD30L", "rn30cfn100f80@WD30L", "rn30cfn100f80l@WD30L", "rn30cfn100f80@P", "rn30cfn100f80l@P", "rn30cfn100f80l@clean"],
    bar: { arm: "rn30cfn100f80l", conds: ["D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("BE1", "the lock costs under the dropouts: under D30, rn30cfn100f80l reaches at least 3 fewer than rn30cfn100f80", "rn30cfn100f80@D30", "rn30cfn100f80l@D30", 3),
        within("BE2", "and does nothing against random false returns: under WD30L, rn30cfn100f80l is within 8 of rn30cfn100f80", "rn30cfn100f80l@WD30L", "rn30cfn100f80@WD30L", 8),
        ge("BE3", "and helps against repeats: under P, rn30cfn100f80l reaches at least 3 more than rn30cfn100f80", "rn30cfn100f80l@P", "rn30cfn100f80@P", 3),
        within("BE4", "the fraction by range is still the run clear: under D30, rn30cfn100f80l is within 8 of rn30cl", "rn30cfn100f80l@D30", "rn30cl@D30", 8),
        bar("BE5", "rn30cfn100f80l holds the bar (80% of exact) in every kind under D30", "rn30cfn100f80l@D30"),
        bar("BE6", "and under WD30L", "rn30cfn100f80l@WD30L"),
        ge("BE7", "the lock's price under the dropout does not need the fraction: under D30, rn30c reaches at least 3 more than rn30cl", "rn30c@D30", "rn30cl@D30", 3),
        within("BE8", "on a sea with no faults rn30cfn100f80l is within 8 of the clean long+fix+forget", "rn30cfn100f80l@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 57: THE HOLD ON THE FREE STATE, BEHIND THE PLAIN RUN
study("detector-range-hold-range-hold-confirm-hold", {
    followUp: 57, held: "held62", out: outOf("DetectorRangeHoldRangeHoldConfirmHold", "held62"), title: "THE HOLD ON THE FREE STATE, BEHIND THE PLAIN RUN", designated: "crre30kgl",
    arms: ["exact", LF, "crre30k@R3D30", "crre30kg@R3D30", "crre30kl@R3D30", "crre30kgl@R3D30", "rm23re30kgl@R3D30", "crre30k@WD30L", "crre30kg@WD30L", "crre30kl@WD30L", "crre30kgl@WD30L", "rm23re30kgl@WD30L", "crre30kg@P", "crre30kgl@P", "crre30kgl@clean"],
    bar: { arm: "crre30kgl", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        within("BF1", "where the law holds the lock adds little to the ghost: under R3D30, crre30kgl is within 8 of crre30kg", "crre30kgl@R3D30", "crre30kg@R3D30", 8),
        ge("BF2", "under the uniform false rate and the leak the lock costs: under WD30L, crre30kgl reaches at least 3 fewer than crre30kg", "crre30kg@WD30L", "crre30kgl@WD30L", 3),
        ge("BF3", "under the persistent mix the lock helps: under P, crre30kgl reaches at least 3 more than crre30kg", "crre30kgl@P", "crre30kg@P", 3),
        within("BF4", "the lock alone does nothing measurable: under R3D30, crre30kl is within 8 of crre30k", "crre30kl@R3D30", "crre30k@R3D30", 8),
        bar("BF5", "crre30kgl holds the bar (80% of exact) in every kind under R3D30", "crre30kgl@R3D30"),
        bar("BF6", "and under WD30L", "crre30kgl@WD30L"),
        within("BF7", "behind the lock the run is no different from the memory: under R3D30, crre30kgl is within 10 of rm23re30kgl", "crre30kgl@R3D30", "rm23re30kgl@R3D30", 10),
        within("BF8", "on a sea with no faults crre30kgl is within 8 of the clean long+fix+forget", "crre30kgl@clean", "long+fix+forget", 8),
    ],
});
// FOLLOW-UP 58: THE HOLD ON THE FREE STATE, BEHIND THE CARRY THAT KNOWS HOW FAR
study("detector-hold-range-hold-range-hold", {
    followUp: 58, held: "held63", out: outOf("DetectorHoldRangeHoldRangeHold", "held63"), title: "THE HOLD ON THE FREE STATE, BEHIND THE CARRY THAT KNOWS HOW FAR", designated: "rn30cfl",
    arms: ["exact", LF, "inc@D30", "rn30@D30", "rn30c@D30", "rn30cf@D30", "rn30l@D30", "rn30cfl@D30", "rn30@WD30L", "rn30cf@WD30L", "rn30cfl@WD30L", "rn30@P", "rn30cf@P", "rn30cfl@P", "rn30cfl@clean"],
    bar: { arm: "rn30cfl", conds: ["D30"] }, verdict: { full: 3, partly: 2 },
    preds: [
        ge("BG1", "the lock costs under the dropouts: under D30, rn30cfl reaches at least 3 fewer than rn30cf", "rn30cf@D30", "rn30cfl@D30", 3),
        within("BG2", "and does nothing against random false returns: under WD30L, rn30cfl is within 8 of rn30cf", "rn30cfl@WD30L", "rn30cf@WD30L", 8),
        ge("BG3", "and helps against repeats: under P, rn30cfl reaches at least 3 more than rn30cf", "rn30cfl@P", "rn30cf@P", 3),
        ge("BG4", "the lock's price does not need the carry: under D30, rn30 reaches at least 3 more than rn30l", "rn30@D30", "rn30l@D30", 3),
        within("BG5", "the far carry is the carry that matters: under D30, rn30cf is within 8 of rn30c", "rn30cf@D30", "rn30c@D30", 8),
        bar("BG6", "rn30cfl holds the bar (80% of exact) in every kind under D30", "rn30cfl@D30"),
        gt("BG7", "the designated beats the map that forgets under the dropout: under D30, rn30cfl reaches more than inc", "rn30cfl@D30", "inc@D30"),
        within("BG8", "on a sea with no faults rn30cfl is within 8 of the clean long+fix+forget", "rn30cfl@clean", "long+fix+forget", 8),
    ],
});

// ---- FOLLOW-UP 60 (the second registration of the larger set: THREE sets, HELD64 to HELD66, one spec each from one table, READ TOGETHER by tools/ship/subSensedDetLarge.mjs; each prediction is on the counts of 540 scenarios, so the one-set tables the command prints for a set are not read)
// FOLLOW-UP 60: THE LARGER SET, THE SIX DETECTORS THAT DIFFER, SET A OF THREE (READ TOGETHER)
study("large-set-a", {
    followUp: 60, held: "held64", out: outOf("LargeSetA", "held64"), title: "THE LARGER SET, THE SIX DETECTORS THAT DIFFER, SET A OF THREE (READ TOGETHER)", designated: "m23e30",
    arms: ["exact", LF, "inc@R3D30", "m23e30@R3D30", "m23re30@R3D30", "rm23e30@R3D30", "m33e30@R3D30", "m23e30k@R3D30", "inc@WD30L", "m23e30@WD30L", "m23re30@WD30L", "rm23e30@WD30L", "m33e30@WD30L", "m23e30k@WD30L", "inc@P", "m23e30@P", "m23re30@P", "rm23e30@P", "m33e30@P", "m23e30k@P", "inc@D30", "m23e30@D30"],
    bar: { arm: "m23e30", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("BH1", "the hold gains under dropouts: under D30, m23e30 reaches at least 9 more than inc", "m23e30@D30", "inc@D30", 9),
        ge("BH2", "the gate costs under range-law false returns: under R3D30, m23e30 reaches at least 18 more than m23re30", "m23e30@R3D30", "m23re30@R3D30", 18),
        ge("BH3", "and under the leak: under WD30L, m23e30 reaches at least 21 more than m23re30", "m23e30@WD30L", "m23re30@WD30L", 21),
        and("BH4", "the first-reading near mark costs: m23e30 reaches at least 12 more than rm23e30 under R3D30 and at least 30 more under WD30L", [ge("", "", "m23e30@R3D30", "rm23e30@R3D30", 12), ge("", "", "m23e30@WD30L", "rm23e30@WD30L", 30)]),
        ge("BH5", "the run of three costs under range-law false returns: under R3D30, m23e30 reaches at least 12 more than m33e30", "m23e30@R3D30", "m33e30@R3D30", 12),
        ge("BH6", "and under the leak: under WD30L, m23e30 reaches at least 30 more than m33e30", "m23e30@WD30L", "m33e30@WD30L", 30),
        and("BH7", "the confirmed clear on the base does nothing: m23e30k is within 15 of m23e30 under R3D30 and under WD30L", [within("", "", "m23e30k@R3D30", "m23e30@R3D30", 15), within("", "", "m23e30k@WD30L", "m23e30@WD30L", 15)]),
        within("BH8", "and the hold does nothing under the persistent mix: under P, m23e30 is within 15 of inc", "m23e30@P", "inc@P", 15),
    ],
});
// FOLLOW-UP 60: THE LARGER SET, THE SIX DETECTORS THAT DIFFER, SET B OF THREE (READ TOGETHER)
study("large-set-b", {
    followUp: 60, held: "held65", out: outOf("LargeSetB", "held65"), title: "THE LARGER SET, THE SIX DETECTORS THAT DIFFER, SET B OF THREE (READ TOGETHER)", designated: "m23e30",
    arms: ["exact", LF, "inc@R3D30", "m23e30@R3D30", "m23re30@R3D30", "rm23e30@R3D30", "m33e30@R3D30", "m23e30k@R3D30", "inc@WD30L", "m23e30@WD30L", "m23re30@WD30L", "rm23e30@WD30L", "m33e30@WD30L", "m23e30k@WD30L", "inc@P", "m23e30@P", "m23re30@P", "rm23e30@P", "m33e30@P", "m23e30k@P", "inc@D30", "m23e30@D30"],
    bar: { arm: "m23e30", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("BH1", "the hold gains under dropouts: under D30, m23e30 reaches at least 9 more than inc", "m23e30@D30", "inc@D30", 9),
        ge("BH2", "the gate costs under range-law false returns: under R3D30, m23e30 reaches at least 18 more than m23re30", "m23e30@R3D30", "m23re30@R3D30", 18),
        ge("BH3", "and under the leak: under WD30L, m23e30 reaches at least 21 more than m23re30", "m23e30@WD30L", "m23re30@WD30L", 21),
        and("BH4", "the first-reading near mark costs: m23e30 reaches at least 12 more than rm23e30 under R3D30 and at least 30 more under WD30L", [ge("", "", "m23e30@R3D30", "rm23e30@R3D30", 12), ge("", "", "m23e30@WD30L", "rm23e30@WD30L", 30)]),
        ge("BH5", "the run of three costs under range-law false returns: under R3D30, m23e30 reaches at least 12 more than m33e30", "m23e30@R3D30", "m33e30@R3D30", 12),
        ge("BH6", "and under the leak: under WD30L, m23e30 reaches at least 30 more than m33e30", "m23e30@WD30L", "m33e30@WD30L", 30),
        and("BH7", "the confirmed clear on the base does nothing: m23e30k is within 15 of m23e30 under R3D30 and under WD30L", [within("", "", "m23e30k@R3D30", "m23e30@R3D30", 15), within("", "", "m23e30k@WD30L", "m23e30@WD30L", 15)]),
        within("BH8", "and the hold does nothing under the persistent mix: under P, m23e30 is within 15 of inc", "m23e30@P", "inc@P", 15),
    ],
});
// FOLLOW-UP 60: THE LARGER SET, THE SIX DETECTORS THAT DIFFER, SET C OF THREE (READ TOGETHER)
study("large-set-c", {
    followUp: 60, held: "held66", out: outOf("LargeSetC", "held66"), title: "THE LARGER SET, THE SIX DETECTORS THAT DIFFER, SET C OF THREE (READ TOGETHER)", designated: "m23e30",
    arms: ["exact", LF, "inc@R3D30", "m23e30@R3D30", "m23re30@R3D30", "rm23e30@R3D30", "m33e30@R3D30", "m23e30k@R3D30", "inc@WD30L", "m23e30@WD30L", "m23re30@WD30L", "rm23e30@WD30L", "m33e30@WD30L", "m23e30k@WD30L", "inc@P", "m23e30@P", "m23re30@P", "rm23e30@P", "m33e30@P", "m23e30k@P", "inc@D30", "m23e30@D30"],
    bar: { arm: "m23e30", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        ge("BH1", "the hold gains under dropouts: under D30, m23e30 reaches at least 9 more than inc", "m23e30@D30", "inc@D30", 9),
        ge("BH2", "the gate costs under range-law false returns: under R3D30, m23e30 reaches at least 18 more than m23re30", "m23e30@R3D30", "m23re30@R3D30", 18),
        ge("BH3", "and under the leak: under WD30L, m23e30 reaches at least 21 more than m23re30", "m23e30@WD30L", "m23re30@WD30L", 21),
        and("BH4", "the first-reading near mark costs: m23e30 reaches at least 12 more than rm23e30 under R3D30 and at least 30 more under WD30L", [ge("", "", "m23e30@R3D30", "rm23e30@R3D30", 12), ge("", "", "m23e30@WD30L", "rm23e30@WD30L", 30)]),
        ge("BH5", "the run of three costs under range-law false returns: under R3D30, m23e30 reaches at least 12 more than m33e30", "m23e30@R3D30", "m33e30@R3D30", 12),
        ge("BH6", "and under the leak: under WD30L, m23e30 reaches at least 30 more than m33e30", "m23e30@WD30L", "m33e30@WD30L", 30),
        and("BH7", "the confirmed clear on the base does nothing: m23e30k is within 15 of m23e30 under R3D30 and under WD30L", [within("", "", "m23e30k@R3D30", "m23e30@R3D30", 15), within("", "", "m23e30k@WD30L", "m23e30@WD30L", 15)]),
        within("BH8", "and the hold does nothing under the persistent mix: under P, m23e30 is within 15 of inc", "m23e30@P", "inc@P", 15),
    ],
});

// ---- FOLLOW-UP 61 (the second registration of the sensitivity sweep: THREE sets, HELD67 to HELD69, one spec each from one table, READ TOGETHER by tools/ship/subSensedDetSweep.mjs; each prediction is on the counts of 540 scenarios)
// FOLLOW-UP 61: THE SENSITIVITY SWEEP, SET A OF THREE (READ TOGETHER)
study("sweep-a", {
    followUp: 61, held: "held67", out: outOf("SweepA", "held67"), title: "THE SENSITIVITY SWEEP, SET A OF THREE (READ TOGETHER)", designated: "fn100f80g",
    arms: ["exact", LF, "fn100f80g@R3D30", "fn100f80g-n40@R3D30", "fn100f80g-n120@R3D30", "fn100f80g-c15@R3D30", "fn100f80g-c60@R3D30", "fn100f80g-f70@R3D30", "fn100f80g-f90@R3D30", "fn100f80g-l20@R3D30", "fn100f80g-l180@R3D30", "m23re30@R3D30", "m23re30-n40@R3D30", "m23re30-n120@R3D30", "fn100f80g@WD30L", "fn100f80g-n40@WD30L", "fn100f80g-n120@WD30L", "fn100f80g-c15@WD30L", "fn100f80g-c60@WD30L", "fn100f80g-f70@WD30L", "fn100f80g-f90@WD30L", "fn100f80g-l20@WD30L", "fn100f80g-l180@WD30L", "m23re30@WD30L", "m23re30-n40@WD30L", "m23re30-n120@WD30L"],
    bar: { arm: "fn100f80g", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        and("BI1", "the near radius is flat on the base that barely uses it: fn100f80g with a near of 40 m and of 120 m is within 15 of fn100f80g under R3D30 and under WD30L", [within("", "", "fn100f80g-n40@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-n120@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-n40@WD30L", "fn100f80g@WD30L", 15), within("", "", "fn100f80g-n120@WD30L", "fn100f80g@WD30L", 15)]),
        and("BI2", "where the near radius is the feature it is monotone under the leak: under WD30L, m23re30-n120 reaches at least 9 more than m23re30 and m23re30 at least 9 more than m23re30-n40", [ge("", "", "m23re30-n120@WD30L", "m23re30@WD30L", 9), ge("", "", "m23re30@WD30L", "m23re30-n40@WD30L", 9)]),
        and("BI3", "and under range-law false returns with smaller steps: under R3D30, m23re30-n120 reaches at least 6 more than m23re30 and m23re30 at least 3 more than m23re30-n40", [ge("", "", "m23re30-n120@R3D30", "m23re30@R3D30", 6), ge("", "", "m23re30@R3D30", "m23re30-n40@R3D30", 3)]),
        ge("BI4", "a cap of 15 is under the dropout and loses the hold's gain: under WD30L, fn100f80g reaches at least 24 more than fn100f80g-c15", "fn100f80g@WD30L", "fn100f80g-c15@WD30L", 24),
        ge("BI5", "and under R3D30: at least 12 more", "fn100f80g@R3D30", "fn100f80g-c15@R3D30", 12),
        and("BI6", "a cap of 60 is flat above the dropout: fn100f80g-c60 is within 15 of fn100f80g under R3D30 and under WD30L", [within("", "", "fn100f80g-c60@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-c60@WD30L", "fn100f80g@WD30L", 15)]),
        and("BI7", "the fraction is flat: fn100f80g with a fraction of 0.7 and of 0.9 is within 15 of fn100f80g under both seas", [within("", "", "fn100f80g-f70@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-f90@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-f70@WD30L", "fn100f80g@WD30L", 15), within("", "", "fn100f80g-f90@WD30L", "fn100f80g@WD30L", 15)]),
        and("BI8", "the ghost's life is flat: fn100f80g with a life of 20 and of 180 is within 15 of fn100f80g under both seas", [within("", "", "fn100f80g-l20@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-l180@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-l20@WD30L", "fn100f80g@WD30L", 15), within("", "", "fn100f80g-l180@WD30L", "fn100f80g@WD30L", 15)]),
    ],
});
// FOLLOW-UP 61: THE SENSITIVITY SWEEP, SET B OF THREE (READ TOGETHER)
study("sweep-b", {
    followUp: 61, held: "held68", out: outOf("SweepB", "held68"), title: "THE SENSITIVITY SWEEP, SET B OF THREE (READ TOGETHER)", designated: "fn100f80g",
    arms: ["exact", LF, "fn100f80g@R3D30", "fn100f80g-n40@R3D30", "fn100f80g-n120@R3D30", "fn100f80g-c15@R3D30", "fn100f80g-c60@R3D30", "fn100f80g-f70@R3D30", "fn100f80g-f90@R3D30", "fn100f80g-l20@R3D30", "fn100f80g-l180@R3D30", "m23re30@R3D30", "m23re30-n40@R3D30", "m23re30-n120@R3D30", "fn100f80g@WD30L", "fn100f80g-n40@WD30L", "fn100f80g-n120@WD30L", "fn100f80g-c15@WD30L", "fn100f80g-c60@WD30L", "fn100f80g-f70@WD30L", "fn100f80g-f90@WD30L", "fn100f80g-l20@WD30L", "fn100f80g-l180@WD30L", "m23re30@WD30L", "m23re30-n40@WD30L", "m23re30-n120@WD30L"],
    bar: { arm: "fn100f80g", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        and("BI1", "the near radius is flat on the base that barely uses it: fn100f80g with a near of 40 m and of 120 m is within 15 of fn100f80g under R3D30 and under WD30L", [within("", "", "fn100f80g-n40@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-n120@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-n40@WD30L", "fn100f80g@WD30L", 15), within("", "", "fn100f80g-n120@WD30L", "fn100f80g@WD30L", 15)]),
        and("BI2", "where the near radius is the feature it is monotone under the leak: under WD30L, m23re30-n120 reaches at least 9 more than m23re30 and m23re30 at least 9 more than m23re30-n40", [ge("", "", "m23re30-n120@WD30L", "m23re30@WD30L", 9), ge("", "", "m23re30@WD30L", "m23re30-n40@WD30L", 9)]),
        and("BI3", "and under range-law false returns with smaller steps: under R3D30, m23re30-n120 reaches at least 6 more than m23re30 and m23re30 at least 3 more than m23re30-n40", [ge("", "", "m23re30-n120@R3D30", "m23re30@R3D30", 6), ge("", "", "m23re30@R3D30", "m23re30-n40@R3D30", 3)]),
        ge("BI4", "a cap of 15 is under the dropout and loses the hold's gain: under WD30L, fn100f80g reaches at least 24 more than fn100f80g-c15", "fn100f80g@WD30L", "fn100f80g-c15@WD30L", 24),
        ge("BI5", "and under R3D30: at least 12 more", "fn100f80g@R3D30", "fn100f80g-c15@R3D30", 12),
        and("BI6", "a cap of 60 is flat above the dropout: fn100f80g-c60 is within 15 of fn100f80g under R3D30 and under WD30L", [within("", "", "fn100f80g-c60@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-c60@WD30L", "fn100f80g@WD30L", 15)]),
        and("BI7", "the fraction is flat: fn100f80g with a fraction of 0.7 and of 0.9 is within 15 of fn100f80g under both seas", [within("", "", "fn100f80g-f70@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-f90@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-f70@WD30L", "fn100f80g@WD30L", 15), within("", "", "fn100f80g-f90@WD30L", "fn100f80g@WD30L", 15)]),
        and("BI8", "the ghost's life is flat: fn100f80g with a life of 20 and of 180 is within 15 of fn100f80g under both seas", [within("", "", "fn100f80g-l20@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-l180@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-l20@WD30L", "fn100f80g@WD30L", 15), within("", "", "fn100f80g-l180@WD30L", "fn100f80g@WD30L", 15)]),
    ],
});
// FOLLOW-UP 61: THE SENSITIVITY SWEEP, SET C OF THREE (READ TOGETHER)
study("sweep-c", {
    followUp: 61, held: "held69", out: outOf("SweepC", "held69"), title: "THE SENSITIVITY SWEEP, SET C OF THREE (READ TOGETHER)", designated: "fn100f80g",
    arms: ["exact", LF, "fn100f80g@R3D30", "fn100f80g-n40@R3D30", "fn100f80g-n120@R3D30", "fn100f80g-c15@R3D30", "fn100f80g-c60@R3D30", "fn100f80g-f70@R3D30", "fn100f80g-f90@R3D30", "fn100f80g-l20@R3D30", "fn100f80g-l180@R3D30", "m23re30@R3D30", "m23re30-n40@R3D30", "m23re30-n120@R3D30", "fn100f80g@WD30L", "fn100f80g-n40@WD30L", "fn100f80g-n120@WD30L", "fn100f80g-c15@WD30L", "fn100f80g-c60@WD30L", "fn100f80g-f70@WD30L", "fn100f80g-f90@WD30L", "fn100f80g-l20@WD30L", "fn100f80g-l180@WD30L", "m23re30@WD30L", "m23re30-n40@WD30L", "m23re30-n120@WD30L"],
    bar: { arm: "fn100f80g", conds: ["R3D30", "WD30L"] }, verdict: { full: 6, partly: 4 },
    preds: [
        and("BI1", "the near radius is flat on the base that barely uses it: fn100f80g with a near of 40 m and of 120 m is within 15 of fn100f80g under R3D30 and under WD30L", [within("", "", "fn100f80g-n40@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-n120@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-n40@WD30L", "fn100f80g@WD30L", 15), within("", "", "fn100f80g-n120@WD30L", "fn100f80g@WD30L", 15)]),
        and("BI2", "where the near radius is the feature it is monotone under the leak: under WD30L, m23re30-n120 reaches at least 9 more than m23re30 and m23re30 at least 9 more than m23re30-n40", [ge("", "", "m23re30-n120@WD30L", "m23re30@WD30L", 9), ge("", "", "m23re30@WD30L", "m23re30-n40@WD30L", 9)]),
        and("BI3", "and under range-law false returns with smaller steps: under R3D30, m23re30-n120 reaches at least 6 more than m23re30 and m23re30 at least 3 more than m23re30-n40", [ge("", "", "m23re30-n120@R3D30", "m23re30@R3D30", 6), ge("", "", "m23re30@R3D30", "m23re30-n40@R3D30", 3)]),
        ge("BI4", "a cap of 15 is under the dropout and loses the hold's gain: under WD30L, fn100f80g reaches at least 24 more than fn100f80g-c15", "fn100f80g@WD30L", "fn100f80g-c15@WD30L", 24),
        ge("BI5", "and under R3D30: at least 12 more", "fn100f80g@R3D30", "fn100f80g-c15@R3D30", 12),
        and("BI6", "a cap of 60 is flat above the dropout: fn100f80g-c60 is within 15 of fn100f80g under R3D30 and under WD30L", [within("", "", "fn100f80g-c60@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-c60@WD30L", "fn100f80g@WD30L", 15)]),
        and("BI7", "the fraction is flat: fn100f80g with a fraction of 0.7 and of 0.9 is within 15 of fn100f80g under both seas", [within("", "", "fn100f80g-f70@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-f90@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-f70@WD30L", "fn100f80g@WD30L", 15), within("", "", "fn100f80g-f90@WD30L", "fn100f80g@WD30L", 15)]),
        and("BI8", "the ghost's life is flat: fn100f80g with a life of 20 and of 180 is within 15 of fn100f80g under both seas", [within("", "", "fn100f80g-l20@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-l180@R3D30", "fn100f80g@R3D30", 15), within("", "", "fn100f80g-l20@WD30L", "fn100f80g@WD30L", 15), within("", "", "fn100f80g-l180@WD30L", "fn100f80g@WD30L", 15)]),
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
        if (!["ge", "gt", "le", "within", "bar", "notBar", "noBar", "eachGe", "spread", "spreadGt", "and"].includes(p.op)) bad.push(`${p.id}: unknown operation ${p.op}`);
        for (const t of [...(p.of ? [] : terms(p.a)), ...(p.of ? [] : terms(p.b)), ...(p.arms || [])]) if (!ARMS.has(t)) bad.push(`${p.id}: ${t} is not a flown arm`);
        for (const q of p.of || []) walk(q);
    };
    spec.preds.forEach(walk);
    return bad;
}
