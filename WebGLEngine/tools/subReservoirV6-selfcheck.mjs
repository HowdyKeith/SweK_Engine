// WebGLEngine/tools/subReservoirV6-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/subReservoirV6-selfcheck.mjs      (a few seconds: the circuit file, hand-made states, synthetic records, four throwaway dives)
//
// THE GATE OF tools/subReservoirV6.mjs AND tools/ship/subEstimatorStudyV6.mjs (rung 4a version 6, registered in brain/RUNG_4A_V6_SHIFT_MAP_WIP.md). The rows the registration owes, in its order:
//   1 NUMBERING  angle(R_k) = 45 (k - 1) mod 8, angle(L_k) = angle(R_(9-k)); every EPG cell of the circuit has an angle; the angle of a non-EPG cell is null; every Delta7 name's L and R glomeruli (summing to 9) share an angle.
//   2 STARTS     the bump peaks on the 0-degree EPG cells and is 0 off EPG; SF has SB's total, equal on every EPG cell; amplitude scales; refusals.
//   3 MODEL      the model with a start differs from v4's only in init (the same steps from the same state); each init is a fresh copy; the edge under a start uses the start (a start that blows up at the floor reads blowsAtFloor).
//   4 SETTINGS   14 in the registered order (factor-major, amplitude-minor) at FACTORS x g* and {1, 4} x r; NO STATE two, gain 1; the input map is v5's RMF bit for bit.
//   5 MECHANISM  the population-vector angle of a hand-made bump is its centre; the moves rule on hand-made angles; the check runs +1 and -1 for 60 ticks.
//   6 STUDY      every branch of the bottom line; the SB-against-SF line; the mechanism line; the audit base 131000; the arms; a smoke run of one circuit records the chosen gain and amplitude among the settings.
// SABOTAGE LOG: brain/RUNG_4A_V6_SHIFT_MAP_WIP.md, the build section.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const env = (k, f) => (process.env[k] ? new URL("file://" + process.env[k]) : new URL(f, import.meta.url));
const V = await import(env("V6_UNDER_TEST", "./subReservoirV6.mjs").href), S = await import(env("STUDY6_UNDER_TEST", "./ship/subEstimatorStudyV6.mjs").href);
import * as V4 from "./subReservoirV4.mjs";
import * as V5 from "./subReservoirV5.mjs";
import * as E from "./subHeadingEstimator.mjs";
import * as CS from "../brain/pilotSubCircuitState.mjs";
import * as T from "../brain/subTask.mjs";
const cj = JSON.parse(fs.readFileSync(new URL("../vendor/hemibrain/hemibrain-cx-heading-loop.json", import.meta.url), "utf8")), C = { neurons: cj.neurons, edges: cj.edges, io: cj.io };
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
console.log("subReservoirV6-selfcheck -- rung 4a version 6, the glomerulus-shift map\n");

sec("1. NUMBERING");
{
    ok("!! R1 0, R2 45, R3 90, R8 315, R9 0 (R9 is R1); L8 = R1 = 0, L1 = R8 = 315, L9 = L1, L6 = R3 = 90, L4 = R5 = 180", V.glomerulusAngle("R1") === 0 && V.glomerulusAngle("R2") === 45 && V.glomerulusAngle("R3") === 90 && V.glomerulusAngle("R8") === 315 && V.glomerulusAngle("R9") === 0 && V.glomerulusAngle("L8") === 0 && V.glomerulusAngle("L1") === 315 && V.glomerulusAngle("L9") === 315 && V.glomerulusAngle("L6") === 90 && V.glomerulusAngle("L4") === 180);
    ok("!! anything that is not L or R and a number has no angle", V.glomerulusAngle("X3") === null && V.glomerulusAngle("L") === null && V.glomerulusAngle(undefined) === null);
    const ang = V.epgAngles(C), epg = C.neurons.map((n, i) => (n.cls === "EPG" ? i : -1)).filter((i) => i >= 0);
    ok("!! all 46 EPG cells have an angle and no other cell does; the eight headings are all present", epg.length === 46 && epg.every((i) => ang[i] !== null) && ang.filter((a) => a !== null).length === 46 && new Set(epg.map((i) => Math.round((ang[i] * 180) / Math.PI))).size === 8);
    const d7 = [...new Set(C.neurons.filter((n) => n.cls === "Delta7").map((n) => n.instance))], pairs = d7.flatMap((s) => { const ls = [...s.matchAll(/L(\d)/g)].map((m) => +m[1]), rs = [...s.matchAll(/R(\d)/g)].map((m) => +m[1]); return ls.flatMap((l) => rs.filter((r) => l + r === 9).map((r) => [l, r])); });
    ok("!! every Delta7 name's left and right glomeruli that sum to 9 share an angle under the numbering (the evidence for it)", pairs.length >= 8 && pairs.every(([l, r]) => V.glomerulusAngle("L" + l) === V.glomerulusAngle("R" + r)), J(pairs));
}

sec("2. STARTS");
{
    const ang = V.epgAngles(C), b = V.startOf("bump", C, 2), f = V.startOf("flat", C, 2), epg = ang.map((a, i) => (a === null ? -1 : i)).filter((i) => i >= 0), max = Math.max(...b);
    ok("!! the bump is 2 cos(angle) on EPG cells (0 below zero), its maximum 2 on the 0-degree cells, and 0 on every other cell", b.every((v, i) => (ang[i] === null ? v === 0 : near(v, 2 * Math.max(0, Math.cos(ang[i]))))) && near(max, 2) && epg.filter((i) => near(b[i], 2)).every((i) => near(ang[i], 0)));
    const tb = b.reduce((x, y) => x + y, 0), tf = f.reduce((x, y) => x + y, 0), v0 = f[epg[0]];
    ok("!! the flat start has the bump's total and the same value on every EPG cell, 0 elsewhere", near(tb, tf, 1e-9) && epg.every((i) => near(f[i], v0)) && f.every((v, i) => ang[i] !== null || v === 0) && v0 > 0, `${tb.toFixed(4)} ${tf.toFixed(4)}`);
    ok("!! the amplitude scales the start", V.startOf("bump", C, 4).every((v, i) => near(v, 2 * b[i])));
    ok("!! refused: a kind that is not bump or flat, a circuit without EPG glomeruli", /bump or flat/.test(thr(() => V.startOf("ring", C, 1))) && /no EPG cell/.test(thr(() => V.startOf("bump", { ...C, neurons: C.neurons.map((n) => ({ ...n, cls: n.cls === "EPG" ? "X" : n.cls })) }, 1))));
}

const fit = E.recordSet(T.TRAIN_SET.slice(0, 2)), rho = E.spectralRadius(CS.reservoirOf(C)), win = V.windowFor(C, fit);
sec("3. MODEL");
{
    const st = V.startOf("bump", C, 1), m = V.modelWithStart(C, { unit: "relu", gain: 1, rho, win }, st), m4 = V4.reservoirModel(C, { unit: "relu", gain: 1, rho, win });
    const x = new Float64Array(15); x[5] = 0.7; let a = m.init(), b = Float64Array.from(st);
    for (let t = 0; t < 30; t++) { a = m.step(a, x); b = m4.step(b, x); }
    ok("!! the model with a start steps exactly as v4's model from the same state (30 ticks), and reads the same cells", a.every((v, i) => v === b[i]) && m.n === m4.n && m.init().every((v, i) => v === st[i]));
    const k0 = st.findIndex((v) => v > 0), keep = st[k0], i1 = m.init(); i1[k0] = 99;
    ok("!! each init is a fresh copy (changing one changes neither the next nor the start it came from)", m.init()[k0] === keep && st[k0] === keep && keep > 0);
    const huge = V.startOf("bump", C, 1e9), e1 = V.edgeGainStart(C, fit, { win, rho, start: huge }), e0 = V.edgeGainStart(C, fit, { win, rho, start: new Float64Array(148) });
    ok("!! the edge under a start uses it: a start above the blow-up bound reads blowsAtFloor; a zero start finds v4's edge for the same input", e1.status === "blowsAtFloor" && e0.status === V4.edgeGain(C, fit, { win, rho }).status && near(e0.gain, V4.edgeGain(C, fit, { win, rho }).gain, 1e-12), `${e1.status} ${e0.gain}`);
}

sec("4. SETTINGS");
{
    const s = V.settingsOf(2, 0.5);
    ok("!! 14 settings, factor-major and amplitude-minor, gains FACTORS x g*, amplitudes {1, 4} x r", s.length === 14 && s.every((x, k) => near(x.gain, V.FACTORS[Math.floor(k / 2)] * 2) && near(x.amp, [0.5, 2][k % 2]) && x.factor === V.FACTORS[Math.floor(k / 2)]) && J(V.AMPS) === "[1,4]" && J(V.FACTORS) === J(V4.FACTORS));
    ok("!! NO STATE (no g*): two settings, gain 1, both amplitudes, no factor", J(V.settingsOf(null, 0.5)) === J([{ gain: 1, amp: 0.5, factor: null }, { gain: 1, amp: 2, factor: null }]));
    ok("!! the input map is v5's RMF at v5's matched weight, bit for bit", J(Array.from(win)) === J(Array.from(V5.windowFor(V5.ARMS.RMF, C, fit))));
    ok("!! the amplitude scale is the v3 random map's rms drive over the fitting dives", near(V.ampScale(C, fit), V4.rmsDrive(C, V4.randomWeights(C), fit), 1e-12));
}

sec("5. MECHANISM");
{
    const ang = V.epgAngles(C), at = (deg) => { const h = new Float64Array(148); ang.forEach((a, i) => { if (a !== null) h[i] = Math.max(0, Math.cos(a - (deg * Math.PI) / 180)); }); return h; };
    // on an evenly populated ring (two cells at each of the eight angles) the population vector of a cosine bump is its centre exactly
    const ring = Array.from({ length: 16 }, (_, i) => ((i % 8) * 45 * Math.PI) / 180), bumpOn = (angs, deg) => Float64Array.from(angs, (a) => (a === null ? 0 : Math.max(0, Math.cos(a - (deg * Math.PI) / 180))));
    ok("!! on an evenly populated ring the population-vector angle of a cosine bump centred at 0, 90, -90, 45 and 135 degrees is that centre (to 1e-9); an all-zero state has none", [0, 90, -90, 45, 135].every((d) => near(V.popAngle(ring, bumpOn(ring, d)), d, 1e-9)) && V.popAngle(ring, new Float64Array(16)) === null);
    // the circuit's glomeruli hold 2 to 4 EPG cells each, so the registered (raw) population vector is biased on it: at most 2.5 degrees, well inside the 10-degree rule
    ok("!! on the real circuit the registered population vector of a centred bump is within 3 degrees of its centre (the uneven cell counts; measured 2.49 at 0 and 90)", [0, 45, 90, -90, 180].every((d) => Math.abs(((V.popAngle(ang, at(d)) - d + 540) % 360) - 180) < 3) && Math.abs(V.popAngle(ang, at(0)) + 2.49) < 0.01);
    ok("!! moves: opposite signs and each at least 10 degrees; not: same sign, one under 10, or a null", V.movesWithTurn(20, -15) && V.movesWithTurn(-10, 10) && !V.movesWithTurn(20, 15) && !V.movesWithTurn(20, -9.9) && !V.movesWithTurn(null, -20) && V.MOVE_MIN_DEG === 10 && V.MECH_TICKS === 60);
    const neg = at(0); neg[ang.findIndex((a) => a !== null && Math.abs(a - Math.PI) < 1e-9)] = -50;
    ok("!! a negative entry is not counted (only active cells vote)", near(V.popAngle(ang, neg), V.popAngle(ang, at(0)), 1e-12));
    const seen = [], fake = { init: () => new Float64Array(148), step: (h, x) => { seen.push(x[5]); const o = Float64Array.from(h); o[C.neurons.findIndex((n) => n.cls === "EPG")] += 1; return o; } };
    const r = V.mechanism(C, fake);
    ok("!! the check drives +1 for 60 ticks and then -1 for 60 ticks in the rate slot, from the model's start each time", seen.length === 120 && seen.slice(0, 60).every((v) => v === 1) && seen.slice(60).every((v) => v === -1) && r.plus !== null && r.moves === false);
}

sec("6. STUDY");
{
    const b = S.bottomLine;
    ok("!! NO SIGNAL in SB", /NO SIGNAL in the shift-map arm/.test(b({ SB: "FAIL", SF: "FAIL" }, {}, { SB: false, SF: true })));
    ok("!! SB PASS with signal and SF not: the first PASS of rung 4a, needing the start", /the first PASS of rung 4a, and it needs the heading-shaped start/.test(b({ SB: "PASS", SF: "FAIL" }, {}, { SB: true, SF: true })) && /the first PASS/.test(b({ SB: "PASS", SF: "PASS" }, {}, { SB: true, SF: false })));
    ok("!! SB PASS and SF PASS: whatever the start", /PASS in both arms .* whatever the start/.test(b({ SB: "PASS", SF: "PASS" }, {}, { SB: true, SF: true })));
    ok("!! SB FAIL with signal: rung 4a's conclusion survives", /FAIL in the shift-map arm with the signal check passed .* survives the glomerulus-shift map/.test(b({ SB: "FAIL", SF: "PASS" }, {}, { SB: true, SF: true })));
    ok("!! IN BETWEEN is reported as it is; a leak or a missing arm is NOT YET", /reported as it is/.test(b({ SB: "IN BETWEEN", SF: "FAIL" }, {}, { SB: true, SF: true })) && /NOT YET -- arm SF has no records/.test(b({ SB: "PASS" }, {}, { SB: true })) && /NOT YET -- arm SB is not read \(leak\)/.test(b({ SB: "PASS", SF: "PASS" }, { SB: true }, { SB: true, SF: true })) && /reported as it is/.test(b({ SB: "PASS", SF: "PASS" }, {}, { SB: null, SF: true })));
    const rec = (arm, fam, sk, moves = false) => ({ arm, family: fam, spec: fam, scores: { audit: { skill: sk } }, mechanism: { plus: 12, minus: moves ? -12 : 5, moves } });
    const rs = [rec("SB", "cx", 0.4, true), rec("SF", "cx", 0.1), rec("SB", "er", 0.2, true), rec("SB", "er", 0.2), rec("SF", "er", 0.19), rec("SF", "er", 0.19)];
    ok("!! SB against SF: CX 0.40 / 0.10 and ER 0.20 / 0.19, so SB exceeds SF by more than 0.05 in 1 of 2", /CX 0\.40 \/ 0\.10; ER 0\.20 \/ 0\.19; SB exceeds SF by more than 0\.05 in 1 of 2$/.test(S.bumpLine(rs)), S.bumpLine(rs));
    ok("!! the mechanism line: cx's angles and MOVES, and the ER count", /cx \+1 -> 12\.0 deg, -1 -> -12\.0 deg: the bump MOVES WITH THE TURN; ER: the bump moves in 1 of 2/.test(S.mechanismLine(rs, "SB")));
    ok("!! the audit base is 131000 and the arms SB, SF (bump and flat, both signed)", S.AUDIT_BASE === 131000 && J(S.ARM_IDS) === '["SB","SF"]' && V.ARMS.SB.start === "bump" && V.ARMS.SF.start === "flat" && V.ARMS.SB.input === "signed" && V.ARMS.SF.input === "signed");
    ok("!! the command refuses an unknown arm and a missing --out", /unknown arm "RMF"/.test(thr(() => S.parseArgs(["run", "--specs", "cx", "--out", "x", "--arms", "RMF"]))) && /needs --out/.test(thr(() => S.parseArgs(["run", "--specs", "cx"]))));
    const data = { fit, sel: E.recordSet(T.HELD_OUT_SET.slice(0, 1)), audits: { audit: fit, safetyAudit: fit, reserve: fit }, sets: {} };
    const r = S.runCircuit(V.ARMS.SB, { family: "cx", index: 0 }, C, data, { closedLoop: false, smoke: true });
    const st = V.settingsOf(r.calibration.gStar, r.calibration.ampScale);
    ok("!! the study's edge is found under the bump at the LARGER amplitude (4r), and all 14 settings were tried", near(r.calibration.gStar, V.edgeGainStart(C, fit, { win, rho, start: V.startOf("bump", C, 4 * r.calibration.ampScale) }).gain, 1e-12) && r.settingsTried === 14, `${r.calibration.gStar} tried ${r.settingsTried}`);
    ok("!! a smoke record: the chosen (gain, amplitude) is one of the 14 settings, its factor and amplitude multiple recorded, the in-sample skill and the mechanism carried", st.some((s) => near(s.gain, r.calibration.gain, 1e-12) && near(s.amp, r.calibration.amp, 1e-12)) && st.length === 14 && [1, 4].some((k) => near(r.calibration.ampMultiple, k, 1e-9)) && Number.isFinite(r.fitScore.skill) && typeof r.mechanism.moves === "boolean" && r.arm === "SB");
}

finished = true;
console.log(`\n${fails ? "FAIL" : "PASS"}  subReservoirV6-selfcheck: ${fails} failing row${fails === 1 ? "" : "s"}`);
if (fails) process.exitCode = 1;
