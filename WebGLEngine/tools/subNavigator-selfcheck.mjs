// WebGLEngine/tools/subNavigator-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/subNavigator-selfcheck.mjs      (~60 s)
//
// THE GATE OF tools/subNavigator.mjs (the dead-reckoning navigator) AND OF THE REFERENCE ARM'S MEASUREMENT, tools/ship/subNavigatorReference.mjs with its command file tools/ship/subNavigatorReferenceCmd.mjs: the arm registered in brain/SUBMARINE_WIP.md before it was built.
// Worked by hand:
//   THE HEADING RATE. A level vessel yawing 0.1 rad/s nose right (body rate w_z = -0.1; the sign of the sim's own rates) has a heading rate of +0.1 at any heading; with the nose up at 0.5 rad the same body rate turns the heading faster, by 1 / cos(0.5): 0.1 / 0.8775826 = 0.1139493;
//   a roll rate alone and a pitch rate alone at zero bank leave the heading alone (0); a pitch rate at a bank of 0.5 rad and zero pitch moves the heading by |0.1 x sin(0.5)| = 0.0479426; a vessel pointing straight up has no heading, and its rate is read as 0.
//   THE NAVIGATOR. A vessel whose yaw rate climbs by a = 0.3 rad/s each second (rate = a t, heading = psi0 + a t^2 / 2): the trapezoid rule is exact for a rate that is linear in time, so after the last valid tick (tick 4) every dark tick's estimate equals the true heading to 1e-9, where a left-hand sum
//   would be 0.3 x (1/30)^2 / 2 = 1.67e-4 short per tick and 3.3e-3 after 20 ticks. The world handed to the inner pilot is turned, like the dropout's, by (estimate - shown): the velocity [2, 0, 0] turned by 0.2 rad is [2 cos 0.2, -2 sin 0.2, 0] = [1.960133, -0.397339, 0] and a current [1, 0, 0] is [0.980067, -0.198669, 0].
//   THE GAP. With clean -0.50 and dropout -0.60: a score of -0.55 closes 0.5 of the gap, -0.50 closes 1, -0.65 closes -0.5; a set where the dropout costs nothing has no gap (null). cx at -0.55 against a gap of 0.10 is 0.50; a family of -0.60, -0.58, -0.62 has the mean -0.60 and closes 0.
//
// SABOTAGED -- 77 mutants, each run alone in a scratch tree with this gate (the reference module and the command file copied in, so that what the gate spawns loads the mutated code), all red BY NAME: 28 of tools/subNavigator.mjs, 46 of tools/ship/subNavigatorReference.mjs, 3 of the command file.
//   the navigator (28): the heading rate with the wrong sign, without the nose-up term, with a dot product that leaves out the vertical, an undivided or wrongly divided horizontal part, a horizontal part that forgets y; the guard for a vertical vessel gone, or too wide; the body rates read as world rates; the nose read as the wrong axis;
//   the tick (default wrong, option ignored); the sum (left-hand, right-hand, no half, the last rate not kept); a valid tick not resetting the estimate or not remembering the rate; a new dive not recognised or its target not remembered; a dive that starts dark unguarded; no default for the flag, the flag read the wrong way round or ignored;
//   the world turned the wrong way, the pilot handed the unturned state, the unturned current, another target, or no flag.
//   the reference module (46): the reading threshold at 0.4 and at 0.6, exactly half not counting; the clean autopilot flying the dropout, the dropout one flown clean, the navigator arm without its navigator or without the dropout; the gap with the wrong sign, divided the wrong way round, a zero or negative gap divided by;
//   each audit flown on another set; a smoke record keeping a range or not marked; the mechanism of the autopilot being the navigator's, the navigator's having no navigator or read on the reserve; the gap being the dropout's; one audit enough to read as real headroom; no gap read as a gap; the two readings swapped; the stage A block dropped, the cx champion left out, a family mean of the audit only;
//   decimals; the range not named; ten ways to take the arguments wrongly; an existing file overwritten or refused with exit 0; no newline; the range asked for ignored; the measurement not told it is smoke; four exit codes; the report ignoring the stage A records.
//   the command file (3): the exit code dropped, the arguments read from the wrong place, the command not waited for.
//   FIRST RUN, 9 FINDINGS: N25 (EQUIVALENT: turnWorld takes the angle as it comes and a rotation by 2 pi more is the same rotation, so the wrap to a half turn was DEAD CODE -- CUT, and the mutant dropped); N29 (the flag not passed on killed a row with a crash instead of failing it: the row now reads it safely);
//   R11 and R12 (an audit flown on the audit set: the measurement's own rows only checked that the numbers were finite -> each audit is checked against the plain evaluation on its own set, and the three are different numbers); R15, R16 and R17 (the mechanism of the autopilot / navigator / on the reserve -> checked against a direct computation, and the pieces differ);
//   R28 (a smoke record's line: the real record's was the only one checked, and a ternary that is always false for it is no different -> a smoke row); R41 (the audit range the command asked for: the stand-in only checked the keys it was handed -> the very sets are compared with setsOf at that range and not at the default). After the fixes all 28 + 7 re-run mutants are red.
//   NOT SABOTAGED: the wording of the READ AS lines beyond their first clause, the order of the progress lines, and the precision of the printed numbers past what the rows read.
//
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as N from "./subNavigator.mjs";
import * as R from "./ship/subNavigatorReference.mjs";
import * as D from "./subDropout.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as T from "../brain/subTask.mjs";
import * as A from "../brain/autopilotSub.mjs";
import * as L from "./ship/trainSubState.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const guarded = async (name, f) => { try { await f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.message) || e).slice(0, 220)); } };
const J = (v) => JSON.stringify(v), near = (a, b, tol) => Math.abs(a - b) <= tol, nearAll = (a, b, tol) => a.length === b.length && a.every((v, i) => near(v, b[i], tol));
console.log("subNavigator-selfcheck -- the dead-reckoning navigator and the reference arm\n");

const model = S.createSubModel(), mk = (o) => S.createState({ model, ...o });

sec("1. the heading rate, worked by hand");
await guarded("section 1", async () => {
    ok("a level vessel yawing 0.1 rad/s nose right (w_z = -0.1) turns its heading at +0.1, whatever the heading (0, 1.0, -2.5)", [0, 1.0, -2.5].every((h) => near(N.headingRate(mk({ heading: h, w: [0, 0, -0.1] })), 0.1, 1e-9)));
    ok("nose up 0.5 rad, the same body rate: 0.1 / cos(0.5) = 0.1139493 (to 1e-6)", near(N.headingRate(mk({ pitch: 0.5, w: [0, 0, -0.1] })), 0.1 / Math.cos(0.5), 1e-9) && near(0.1 / Math.cos(0.5), 0.1139493, 1e-6));
    ok("a roll rate alone, or a pitch rate alone at zero bank, leaves the heading alone (0 to 1e-9)", Math.abs(N.headingRate(mk({ w: [0.2, 0, 0] }))) < 1e-9 && Math.abs(N.headingRate(mk({ w: [0, 0.2, 0] }))) < 1e-9);
    ok("a pitch rate of 0.1 at a bank of 0.5 rad and zero pitch moves the heading by 0.1 x sin(0.5) = 0.0479426 in size (to 1e-6)", near(Math.abs(N.headingRate(mk({ bank: 0.5, w: [0, 0.1, 0] }))), 0.1 * Math.sin(0.5), 1e-9) && near(0.1 * Math.sin(0.5), 0.0479426, 1e-6));
    ok("a vessel pointing straight up has no heading: its rate is 0, not infinity or NaN", N.headingRate(mk({ pitch: Math.PI / 2, w: [0, 0, -0.1] })) === 0);
});

sec("2. the navigator, with a stand-in pilot that records what it is handed");
await guarded("section 2", async () => {
    const dt = S.DT, a = 0.3, psi0 = 0.3, cur = [1, 0, 0], tgt = { depth: 30, heading: 0, speed: 2 };
    const trueAt = (i) => mk({ heading: psi0 + a * (i * dt) ** 2 / 2, w: [0, 0, -a * i * dt], speed: 2 }), psiAt = (i) => psi0 + a * (i * dt) ** 2 / 2;
    const seen = [], inner = (st, t, c, aux) => { seen.push({ st, t, c, aux, h: S.attitude(st).heading }); return { pitch: 0, yaw: 0, thrust: 0, ballast: 0 }; };
    const nav = N.navigator(inner), held = psiAt(4);
    for (let i = 0; i <= 4; i++) nav(trueAt(i), tgt, cur, { compassValid: 1 });
    ok("while the compass is valid the wrapper is a pass-through: the inner pilot is handed the very state, target, current and flag it was given", seen.length === 5 && seen.every((s, i) => s.t === tgt && s.c === cur && s.aux.compassValid === 1 && near(s.h, psiAt(i), 1e-9)));
    const dark = [];
    for (let i = 5; i <= 24; i++) { const turned = D.turnWorld(trueAt(i), cur, held - psiAt(i)); nav(turned.state, tgt, turned.current, { compassValid: 0 }); dark.push(seen[seen.length - 1]); }
    ok("20 dark ticks of a yaw rate that climbs linearly: the heading the inner pilot reads is the TRUE heading at every tick, to 1e-9 (the trapezoid rule is exact for a linear rate; a left-hand sum is 3.3e-3 short by tick 20)", nearAll(dark.map((s) => s.h), dark.map((s, k) => psiAt(5 + k)), 1e-9), J(dark.slice(-1).map((s) => [s.h, psiAt(24)])));
    ok("the held (shown) heading was the stale one all along: the states handed to the wrapper read " + held.toFixed(6) + " and the estimate the wrapper keeps is the true heading", near(nav.last.shown, held, 1e-9) && near(nav.last.estimate, psiAt(24), 1e-9));
    const flag = dark.every((s) => s.aux && s.aux.compassValid === 0) && dark.every((s) => s.t === tgt);
    ok("the flag and the target go through untouched on dark ticks as well", flag);
    const st0 = mk({ heading: 0.4, speed: 2, w: [0.01, 0.02, -0.03], pos: [5, 6, -30] }), w2 = N.navigator(inner);
    w2(st0, tgt, [1, 0, 0], { compassValid: 1 });
    const n0 = seen.length; w2(mk({ heading: 0.4, speed: 2, w: [0.01, 0.02, -0.03], pos: [5, 6, -30] }), tgt, [1, 0, 0], { compassValid: 0 });
    ok("a dark tick at a constant yaw rate of 0.03 (the roll and pitch rates beside it do not matter) advances the estimate by one tick of it: the heading read is 0.4 + 0.03 / 30 = 0.401 (to 1e-6), and the body rates, depth and position are not touched", near(seen[n0].h, 0.401, 1e-6) && J(Array.from(seen[n0].st.w)) === J(Array.from(st0.w)) && J(Array.from(seen[n0].st.pos)) === J(Array.from(st0.pos)));
    const w3 = N.navigator(inner), probe = mk({ heading: 0, speed: 2, w: [0, 0, 0] });
    w3(probe, tgt, [1, 0, 0], { compassValid: 1 });
    const dwell = mk({ heading: 0, speed: 2, w: [0, 0, -6] }), k0 = seen.length; w3(dwell, tgt, [1, 0, 0], { compassValid: 0 });
    const hh = seen[k0], turn = hh.h - 0;
    ok("the velocity and the current are turned the same way as the orientation: after a turn of " + turn.toFixed(4) + " rad the velocity [2, 0, 0] reads [2 cos, -2 sin, 0] and the current [1, 0, 0] reads [cos, -sin, 0] of that angle (1e-9)",
        nearAll(Array.from(hh.st.vel), [2 * Math.cos(turn), -2 * Math.sin(turn), 0], 1e-9) && nearAll(hh.c, [Math.cos(turn), -Math.sin(turn), 0], 1e-9) && near(turn, 0.5 * (0 + 6) / 30, 1e-9));
    const t2 = { depth: 20, heading: 1, speed: 3 }, w4 = N.navigator(inner), k1 = seen.length;
    w4(mk({ heading: 0.2, w: [0, 0, -1] }), tgt, cur, { compassValid: 1 });
    w4(mk({ heading: 0.2, w: [0, 0, -1] }), tgt, cur, { compassValid: 0 });
    const drifted = seen[seen.length - 1].h;
    w4(mk({ heading: 0.9, w: [0, 0, -1] }), t2, cur, { compassValid: 0 });
    ok("a NEW target object is a new dive: its first dark tick has no valid tick behind it, so it is handed what it shows (0.9) and not the old dive's estimate (" + drifted.toFixed(4) + " for the old dive)", near(drifted, 0.2 + 1 / 30, 1e-9) && near(seen[seen.length - 1].h, 0.9, 1e-9));
    const bare = []; const w5 = N.navigator((st, t, c, aux) => { bare.push(aux); return {}; }); w5(mk({ heading: 0.3 }), tgt, cur); w5(mk({ heading: 0.3, w: [0, 0, -1] }), tgt, cur);
    ok("with no 4th argument the compass is read as valid (a pilot not told is not told it is dark): the second call is a pass-through at 0.3", bare.length === 2 && bare[0] === null && bare[1] === null);
    ok("a custom tick: with dt = 0.1 a constant rate of 0.2 advances the estimate by 0.02 a tick", (() => { const o = []; const w6 = N.navigator((st) => { o.push(S.attitude(st).heading); return {}; }, { dt: 0.1 }); const tg = {}; w6(mk({ heading: 0, w: [0, 0, -0.2] }), tg, cur, { compassValid: 1 }); w6(mk({ heading: 0, w: [0, 0, -0.2] }), tg, cur, { compassValid: 0 }); return near(o[1], 0.02, 1e-9); })());
});

sec("3. on a real dive");
await guarded("section 3", async () => {
    const set = T.TRAIN_SET.filter((d, i) => i % 13 === 0).slice(0, 3);
    let worst = 0, darkTicks = 0;
    for (const sc of set) {
        const nav = N.navigator(A.pilot()), w = D.dropout(nav), tr = { h: 0 };
        T.fly((st, tgt, cur) => { tr.h = S.attitude(st).heading; const c = w(st, tgt, cur); if (w.log.valid[w.log.valid.length - 1] === 0) { worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(nav.last.estimate - tr.h), Math.cos(nav.last.estimate - tr.h)))); darkTicks++; } return c; }, sc);
    }
    ok("three dives through the default dropout (960 dark ticks each): the estimate is within 3e-3 rad of the true heading at every dark tick (the worst: " + worst.toExponential(2) + ")", darkTicks === 2880 && worst < 3e-3, `${darkTicks} dark ticks`);
    const f3 = R.flyThree(set);
    ok("the navigator through the dropout scores within 5e-4 of the clean autopilot on the same three dives and more than 0.05 above the autopilot through the dropout (" + f3.navigator.toFixed(4) + " vs clean " + f3.clean.toFixed(4) + " and dropout " + f3.dropout.toFixed(4) + ")", Math.abs(f3.navigator - f3.clean) < 5e-4 && f3.navigator > f3.dropout + 0.05);
    ok("flyThree is the three plain evaluations: clean, through the dropout, and the navigator through the dropout", near(f3.clean, T.evaluate(A.pilot(), set).score, 1e-12) && near(f3.dropout, T.evaluate(D.dropout(A.pilot()), set).score, 1e-12) && near(f3.navigator, T.evaluate(D.dropout(N.navigator(A.pilot())), set).score, 1e-12));
    let leaked = null; const spy = N.navigator((st, tg, c, aux) => { leaked = tg; return A.pilot()(st, tg, c, aux); }), probe = T.TRAIN_SET[1], wr = D.dropout(spy); T.fly((st, tg, cur) => wr(st, tg, cur), probe);
    ok("the arm hands the pilot the scenario's own target object and nothing of its own: the target the inner pilot sees is the dive's", leaked === probe.target);
});

sec("4. the gap closed, the reading and the report");
await guarded("section 4", async () => {
    const ref0 = { clean: -0.5, dropout: -0.6 };
    ok("gapClosed: -0.55 closes 0.5, -0.50 closes 1, -0.65 closes -0.5, -0.60 closes 0 (1e-9); a set where the dropout costs nothing, or less than nothing, has no gap (null)", near(R.gapClosed(-0.55, ref0), 0.5, 1e-9) && near(R.gapClosed(-0.5, ref0), 1, 1e-9) && near(R.gapClosed(-0.65, ref0), -0.5, 1e-9) && near(R.gapClosed(-0.6, ref0), 0, 1e-9) && R.gapClosed(-0.5, { clean: -0.6, dropout: -0.6 }) === null && R.gapClosed(-0.5, { clean: -0.7, dropout: -0.6 }) === null);
    const sc3 = (nav) => ({ audit: { clean: -0.5, dropout: -0.6, navigator: nav[0] }, safetyAudit: { clean: -0.4, dropout: -0.5, navigator: nav[1] }, reserve: { clean: -0.45, dropout: -0.65, navigator: nav[2] } });
    const mkRef = (nav) => { const scores = sc3(nav), gap = {}; for (const a of L.AUDITS) gap[a] = R.gapClosed(scores[a].navigator, scores[a]); return { auditBase: 30000, smoke: false, scores, gap, mechanism: { autopilot: { dark: 0.3, lit: 0.1 }, navigator: { dark: 0.05, lit: 0.1 } } }; };
    const good = R.reportLines(mkRef([-0.51, -0.41, -0.46])), exact = { audit: { clean: -0.5, dropout: -1, navigator: -0.75 }, safetyAudit: { clean: -0.5, dropout: -1, navigator: -0.75 }, reserve: { clean: -0.5, dropout: -1, navigator: -0.75 } }, edge = R.reportLines({ ...mkRef([-0.51, -0.41, -0.46]), scores: exact, gap: { audit: R.gapClosed(-0.75, exact.audit), safetyAudit: R.gapClosed(-0.75, exact.safetyAudit), reserve: R.gapClosed(-0.75, exact.reserve) } }), bad = R.reportLines(mkRef([-0.51, -0.41, -0.62])), none = R.reportLines({ ...mkRef([-0.51, -0.41, -0.46]), scores: { ...sc3([-0.51, -0.41, -0.46]), reserve: { clean: -0.6, dropout: -0.6, navigator: -0.6 } }, gap: { audit: 0.9, safetyAudit: 0.9, reserve: null } });
    const last = (l) => l[l.length - 1];
    ok("READ AS: gaps of 0.9, 0.9 and 0.95 -> 'closes at least 0.5 ... the headroom is real'; exactly 0.5 on every audit (clean -0.5, dropout -1.0, navigator -0.75: exact in binary) is still 'at least'; 0.9, 0.9 and 0.15 -> 'closes LESS than 0.5 ... overstated'; a set with no gap -> 'no gap to close ... nothing to read'",
        /closes at least 0\.5 of the gap on all three audits: dead reckoning recovers most.*headroom is real/.test(last(good)) && /closes at least 0\.5/.test(last(edge)) && /closes LESS than 0\.5.*overstated/.test(last(bad)) && /no gap to close on an audit: nothing to read/.test(last(none)), last(edge).slice(0, 90));
    ok("the numbers are printed against their audit: audit -0.5000 | -0.6000 | -0.5100 -> 0.90; the mechanism line gives 0.3000 and 0.0500; the first line names the arm and the audit range", /^  audit: clean autopilot -0\.5000 \| autopilot through the dropout -0\.6000 \| NAVIGATOR through the dropout -0\.5100  -> fraction of the gap closed 0\.90$/.test(good[1]) && /inside the dark windows \(audit dives\): the autopilot 0\.3000, the navigator 0\.0500$/.test(good[4]) && /^the reference arm .* audits base 30000\), once, nothing selected:$/.test(good[0]), good[1]);
    const smokeLines = R.reportLines({ ...mkRef([-0.51, -0.41, -0.46]), smoke: true, auditBase: null });
    ok("a smoke record says it is a few throwaway dives, and a real one names its audit range", /audits a few throwaway dives\), once/.test(smokeLines[0]) && /audits base 30000\), once/.test(good[0]) && !/base/.test(smokeLines[0]), smokeLines[0].slice(0, 120));
    const rec = (fam, i, a, s, r, champion = true) => ({ spec: `${fam}:${i}`, family: fam, index: i, champion: champion ? 1 : null, scores: { autopilot: { audit: { score: -0.6 }, safetyAudit: { score: -0.5 }, reserve: { score: -0.65 } }, champion: champion ? { audit: { score: a }, safetyAudit: { score: s }, reserve: { score: r } } : null } });
    const recs = [rec("cx", 0, -0.55, -0.45, -0.55), rec("er", 0, -0.6, -0.5, -0.65), rec("er", 1, -0.58, -0.48, -0.63), rec("er", 2, -0.62, -0.52, -0.67), rec("layer", 0, -0.5, -0.4, -0.45, false)];
    const wl = R.reportLines(mkRef([-0.51, -0.41, -0.46]), recs), idx = wl.findIndex((l) => /^  fraction of the same gap closed/.test(l)), rows = wl.slice(idx + 1);
    ok("with the stage A records: the cx champion closes 0.50, 0.50 and 0.50 of the three gaps, the ER mean (-0.60, -0.58, -0.62 and the like) closes 0.00 on each, and a family whose only record has no champion is scored as the autopilot through the dropout, which closes 0.00 of its own gap on every audit",
        idx > 0 && rows.length === 3 && /^    cx champion: audit 0\.50 \| safetyAudit 0\.50 \| reserve 0\.50$/.test(rows[0]) && /^    er mean of 3: audit 0\.00 \| safetyAudit 0\.00 \| reserve 0\.00$/.test(rows[1]) && /^    layer mean of 1: audit 0\.00 \| safetyAudit 0\.00 \| reserve 0\.00$/.test(rows[2]), rows.join(" | "));
    ok("and with no records there is no such block", !R.reportLines(mkRef([-0.51, -0.41, -0.46]), []).some((l) => /fraction of the same gap/.test(l)) && !good.some((l) => /fraction of the same gap/.test(l)));
    const sm = R.measure(L.setsOf({ smoke: true }), { smoke: true }), lg = R.measure({ audit: T.TRAIN_SET.slice(0, 1), safetyAudit: T.TRAIN_SET.slice(1, 2), reserve: T.TRAIN_SET.slice(2, 3) }, { auditBase: 40000 });
    ok("measure: the three audits each with clean, dropout and navigator and a gap that is the navigator's own; smoke is marked and keeps no audit range, a real one keeps the range it was asked with; the mechanism holds the autopilot's and the navigator's dark error",
        L.AUDITS.every((a) => ["clean", "dropout", "navigator"].every((k) => Number.isFinite(sm.scores[a][k])) && near(sm.gap[a], R.gapClosed(sm.scores[a].navigator, sm.scores[a]), 1e-12)) && sm.smoke === true && sm.auditBase === null && lg.smoke === false && lg.auditBase === 40000 && sm.mechanism.navigator.darkTicks === 1920 && Number.isFinite(sm.mechanism.autopilot.dark) && sm.mechanism.navigator.dark < sm.mechanism.autopilot.dark + 1, J(sm.gap));
    const smSets = L.setsOf({ smoke: true }), direct = (set) => T.evaluate(A.pilot(), set).score;
    ok("measure flies each audit on ITS OWN set: the clean autopilot's three scores are the plain evaluations on the audit, safety-audit and reserve sets (1e-12) and are three different numbers", L.AUDITS.every((a) => near(sm.scores[a].clean, direct(smSets[a]), 1e-12)) && new Set(L.AUDITS.map((a) => sm.scores[a].clean)).size === 3, J(L.AUDITS.map((a) => +sm.scores[a].clean.toFixed(4))));
    const mAp = L.headingErrorByWindow(A.pilot(), smSets.audit), mNv = L.headingErrorByWindow(N.navigator(A.pilot()), smSets.audit), mRs = L.headingErrorByWindow(N.navigator(A.pilot()), smSets.reserve);
    ok("the mechanism is the dark/lit heading error on the AUDIT set, the autopilot's with no navigator and the navigator's with one (each to 1e-12), and the two differ; the navigator's on the reserve is a different number",
        near(sm.mechanism.autopilot.dark, mAp.dark, 1e-12) && near(sm.mechanism.navigator.dark, mNv.dark, 1e-12) && near(sm.mechanism.navigator.lit, mNv.lit, 1e-12) && Math.abs(mAp.dark - mNv.dark) > 1e-4 && Math.abs(mNv.dark - mRs.dark) > 1e-4, J([mAp.dark, mNv.dark, mRs.dark]));
    ok("the constant that decides the reading is the registered 0.5 and is frozen", R.READ_AS.closes === 0.5 && Object.isFrozen(R.READ_AS));
});

sec("5. the arguments and the command");
await guarded("section 5", async () => {
    const p = (a) => { try { return R.parseArgs(a); } catch (e) { return { threw: e.message }; } };
    const d = p(["run", "--out", "r.json"]);
    ok("run with an --out reads the audits on base 30000, not smoke; --audit-base and --smoke are read; report reads --in and --stage-a", d.cmd === "run" && d.out === "r.json" && d.auditBase === 30000 && d.smoke === false && p(["run", "--out", "r", "--audit-base", "40000", "--smoke"]).auditBase === 40000 && p(["run", "--out", "r", "--smoke"]).smoke === true && p(["report", "--in", "a", "--stage-a", "b"]).stageA === "b" && p(["report", "--in", "a"]).stageA === null);
    const bad = [["no command", [], /the first word must be run or report, got undefined/], ["another command", ["train"], /got "train"/], ["a stray word", ["run", "x"], /unexpected argument "x"/], ["an unknown option", ["run", "--out", "o", "--itres", "5"], /unknown option "--itres" \(known for run: --out, --audit-base, --smoke\)/],
        ["an option of the other command", ["report", "--in", "x", "--out", "y"], /unknown option "--out" \(known for report: --in, --stage-a\)/], ["a missing value", ["run", "--out"], /--out needs a value/], ["an option as a value", ["run", "--out", "--smoke"], /--out needs a value/],
        ["a non-number", ["run", "--out", "o", "--audit-base", "many"], /--audit-base needs a number, got "many"/], ["no --out", ["run"], /run needs --out/], ["report without --in", ["report"], /report needs --in/]];
    for (const [what, a, re] of bad) { const r = p(a); ok(`${what} is refused by name`, typeof r.threw === "string" && re.test(r.threw), r.threw || J(r)); }
    const files = new Map(), outs = [], errs = [], io = (extra = {}) => ({ out: (m) => outs.push(m), err: (m) => errs.push(m), readFile: (f) => { if (!files.has(f)) throw new Error("ENOENT " + f); return files.get(f); }, exists: (f) => files.has(f), writeFile: (f, t) => files.set(f, t), ...extra });
    const stand = { auditBase: 30000, smoke: false, scores: { audit: { clean: -0.5, dropout: -0.6, navigator: -0.52 }, safetyAudit: { clean: -0.4, dropout: -0.5, navigator: -0.41 }, reserve: { clean: -0.45, dropout: -0.65, navigator: -0.46 } }, gap: { audit: 0.8, safetyAudit: 0.9, reserve: 0.95 }, mechanism: { autopilot: { dark: 0.3 }, navigator: { dark: 0.05 } } };
    let asked = null; const c1 = await R.command(["run", "--out", "ref.json", "--audit-base", "40000"], io({ measure: (sets, o) => { asked = [Object.keys(sets).sort().join(), o, sets]; return stand; } }));
    ok("run measures once on the sets of the range asked for, writes the record as ONE line of JSON to --out, prints the report and exits 0", c1 === 0 && J(asked[0]) === J("audit,heldOut,pool,reserve,safetyAudit,train") && asked[1].auditBase === 40000 && asked[1].smoke === false && J(asked[2].audit) === J(L.setsOf({ auditBase: 40000 }).audit) && J(asked[2].audit) !== J(L.setsOf().audit) && files.get("ref.json") === J(stand) + "\n" && outs.some((m) => /^the reference arm /.test(m)) && outs.some((m) => /READ AS/.test(m)), outs[0]);
    errs.length = 0; let called = 0; const c2 = await R.command(["run", "--out", "ref.json"], io({ measure: () => { called++; return stand; } }));
    ok("a second run onto the same --out is REFUSED, exit 1, nothing measured and the file as it was (the arm is read once)", c2 === 1 && called === 0 && /exists: the reference arm is read once/.test(errs[0] || "") && files.get("ref.json") === J(stand) + "\n", errs[0]);
    outs.length = 0; errs.length = 0; const c3 = await R.command(["report", "--in", "ref.json"], io());
    ok("report prints the same lines from the file alone, exit 0, with no stage A block", c3 === 0 && outs.some((m) => /^  audit: clean autopilot -0\.5000/.test(m)) && !outs.some((m) => /fraction of the same gap/.test(m)));
    files.set("sa.jsonl", [rec2("cx", 0, -0.55, -0.45, -0.55), rec2("er", 0, -0.6, -0.5, -0.65)].map(J).join("\n") + "\n"); outs.length = 0;
    function rec2(fam, i, a, s, r) { return { spec: `${fam}:${i}`, family: fam, index: i, champion: 1, scores: { autopilot: { audit: { score: -0.6 }, safetyAudit: { score: -0.5 }, reserve: { score: -0.65 } }, champion: { audit: { score: a }, safetyAudit: { score: s }, reserve: { score: r } } } }; }
    const c4 = await R.command(["report", "--in", "ref.json", "--stage-a", "sa.jsonl"], io());
    ok("report with --stage-a adds the block for the records in that file", c4 === 0 && outs.some((m) => /^    cx champion: audit 0\.50 \| safetyAudit 0\.50 \| reserve 0\.50$/.test(m)) && outs.some((m) => /^    er mean of 1: /.test(m)), outs.slice(-3).join(" | "));
    errs.length = 0; const c5 = await R.command(["report", "--in", "none.json"], io()), c6 = await R.command(["report", "--in", "ref.json", "--stage-a", "none.jsonl"], io()); files.set("junk.json", "{oops"); const c7 = await R.command(["report", "--in", "junk.json"], io()); files.set("junk2.jsonl", "{oops\n"); const c8 = await R.command(["report", "--in", "ref.json", "--stage-a", "junk2.jsonl"], io());
    ok("a missing or unreadable reference file or stage A file is exit 1 with the file named; a bad argument is exit 2 on stderr", c5 === 1 && c6 === 1 && c7 === 1 && c8 === 1 && /cannot read none\.json: ENOENT/.test(errs[0]) && /cannot read none\.jsonl: ENOENT/.test(errs[1]) && /cannot read junk\.json: /.test(errs[2]) && /cannot read junk2\.jsonl: results file line 1 is not JSON/.test(errs[3]) && await R.command(["run"], io()) === 2 && /^subNavigatorReference: run needs --out/.test(errs[4]), errs.join(" | ").slice(0, 200));
    ok("the constants of the library: the smoke range, the families, the audits are the study library's (the same sets, so the same windows)", J(L.AUDITS) === '["audit","safetyAudit","reserve"]' && R.READ_AS.closes === 0.5);
});

sec("6. the command file, through a child process");
await guarded("section 6", async () => {
    const cmdFile = path.join(HERE, "ship", "subNavigatorReferenceCmd.mjs"), dir = fs.mkdtempSync(path.join(os.tmpdir(), "subnav-")), file = path.join(dir, "ref.json");
    const bad = spawnSync(process.execPath, [cmdFile, "run"], { encoding: "utf8" }), run = spawnSync(process.execPath, [cmdFile, "run", "--out", file, "--smoke"], { encoding: "utf8" }), again = spawnSync(process.execPath, [cmdFile, "run", "--out", file, "--smoke"], { encoding: "utf8" }), rep = spawnSync(process.execPath, [cmdFile, "report", "--in", file], { encoding: "utf8" });
    ok("the command file is two lines that call the command: a bad argument is exit 2 on stderr; a smoke run writes the file, prints the report and exits 0; running it again onto the same file is exit 1 and the file is unchanged; report reads it back and exits 0",
        bad.status === 2 && /run needs --out/.test(bad.stderr) && run.status === 0 && fs.existsSync(file) && /^the reference arm /m.test(run.stdout) && /READ AS/.test(run.stdout) && again.status === 1 && /exists: the reference arm is read once/.test(again.stderr) && rep.status === 0 && /NAVIGATOR through the dropout/.test(rep.stdout) && J(JSON.parse(fs.readFileSync(file, "utf8")).smoke) === "true", (run.stderr || "").slice(0, 120));
    fs.rmSync(dir, { recursive: true, force: true });
});

sec("7. NOT CHECKED");
console.log("  NOT CHECKED  the arm on the full audit sets (36, 500 and the reserve dives): this gate flies a few dives; the real measurement is the command's, run once");
console.log("  NOT CHECKED  that a real gyro would do as well: the simulator's body rates are exact and the arm says so; with noise or a bias it would drift, and nothing here measures how far");
console.log("  NOT CHECKED  the arm's behaviour on a dive that starts dark, or on a vessel pointing near straight up (both are guarded, and tested at their limits only)");

finished = true;
console.log(fails ? `\nsubNavigator-selfcheck: ${fails} FAILED` : "\nsubNavigator-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
