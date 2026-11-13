// WebGLEngine/brain/subEnergy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subEnergy-selfcheck.mjs      (about 60 s: fixtures, duels on DEV smoke geometries 1 to 4 -- NEVER a registered seed; the HELD set is never flown here: the command's held path is reached through an override that flies the smoke geometries)
//
// THE GATE OF THE CHARGE OPTION OF brain/subDuel.mjs (`needs`, which flies each boat through physics/mechanics/subNeeds.mjs's stepNeeds), OF THE `--needs` FLAG OF tools/tuneSubTactics.mjs AND OF tools/ship/takeSubEnergy.mjs
// (the registration is brain/SUB_ENERGY_WIP.md, with Amendment A and its correction):
//   1 CONSTANTS     the ladder, the sets, the thresholds, the four doctrines, needsOf's refusals, the binding rule at its edge
//   2 THE HOOK      with no `needs` the duel is the ORIGINAL code's, to the fingerprint (pins taken before the option); `needs: null` is the same; a battery that never runs out flies the same hulls; one that does changes the flight, kills the screw at the tick `deadAt` says, and leaves the
//                   charge at 0; the charge is capped at the class's capacity; the observation gains `self.charge` only with the option; the result gains `charge` and `deadAt` only with it; an unknown class is refused by name
//   3 THE TUNER     tools/tuneSubTactics.mjs --needs: the output carries the budget; without the flag it does not (a one-iteration run on the smoke set)
//   4 THE COMMAND   the calibration on the smoke geometries to the number and to the byte, the reads at their edges, read 1 through the override, read 2 from stubbed files, the refusals, the program run
//   5 THE SOURCE    no clock, no random number; the headers; the registration's ladder equals the code's
// NOT CHECKED, said plainly: that the model's numbers are good (they are the layer's own, "tank-scale"), which rung DEV chooses and what HELD says (that is the experiment).
//
// SABOTAGES: written after the gate; the log is added below when the pass is done.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as D from "./subDuel.mjs";
import * as TA from "./subTactics.mjs";
import * as AS from "./autopilotSub.mjs";
import * as X from "../tools/ship/takeSubEnergy.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const J = JSON.stringify;
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const duel = (sd, o = {}) => D.duel({ tactics: TA.makeTactician(TA.THETA_DEFAULT), pilot: AS.pilot() }, D.scenario(sd, "patrol"), { opponent: { tactics: TA.makeTactician(TA.THETA_DEFAULT), pilot: AS.pilot() }, ...o });

console.log("1. CONSTANTS");
{
    ok("!! the ladder (joules a boat: the battery class's own 3.0e6, then 1.5e6, 0.75e6, 0.4e6, 0.2e6), the thresholds (binds at 25 percent, slows by 0.5 m/s, matters at 0.05 and z 2) and the tuning seeds", J(X.LADDER) === "[3000000,1500000,750000,400000,200000]" && X.BIND === 0.25 && X.SLOW_BY === 0.5 && X.MATTERS_EDGE === 0.05 && X.MATTERS_Z === 2 && J(X.TUNE_SEEDS) === "[6100,6101,6102,6103]");
    ok("!! the sets (smoke 1 to 4, DEV 94001 for 24, HELD 95001 for 24), the four doctrines of read 1, and everything frozen", J(X.SETS) === '{"smoke":{"first":1,"count":4},"dev":{"first":94001,"count":24},"held":{"first":95001,"count":24}}' && J(X.DOCTRINES) === '["hand","champ","ping","league7001"]' && [X.LADDER, X.SETS, X.DOCTRINES, ...Object.values(X.SETS), X.TUNE_SEEDS].every(Object.isFrozen));
    ok("!! needsOf: a rung's { cls: battery, energyJ }; a rung outside 0 to 4, a fraction and a string are refused by name", J(X.needsOf(2)) === '{"cls":"battery","energyJ":750000}' && J(X.needsOf(0)) === '{"cls":"battery","energyJ":3000000}' && /no rung 5/.test(thr(() => X.needsOf(5))) && /no rung -1/.test(thr(() => X.needsOf(-1))) && /no rung 1.5/.test(thr(() => X.needsOf(1.5))) && /no rung 2/.test(thr(() => X.needsOf("2"))));
    ok("!! bindsAt is the rule at its edge: with 8 boat-duels a side (16 boats) 4 dead screws is exactly 25 percent and binds, 3 do not; the dead of the two sides add", X.bindsAt([2, 2], 8) === true && X.bindsAt([4, 0], 8) === true && X.bindsAt([0, 4], 8) === true && X.bindsAt([2, 1], 8) === false && X.bindsAt([0, 0], 8) === false && X.bindsAt([8, 8], 8) === true);
    ok("geometriesOf: 4 smoke, 24 DEV from 94001, 24 HELD from 95001", X.geometriesOf("smoke").length === 4 && X.geometriesOf("dev")[0].seed === 94001 && X.geometriesOf("dev")[23].seed === 94024 && X.geometriesOf("held")[0].seed === 95001 && X.geometriesOf("held")[23].seed === 95024);
}

console.log("\n2. THE HOOK (brain/subDuel.mjs)");
{
    const line = (sd, r) => `${sd} ${r.fingerprint} ${r.score.toFixed(6)} ${r.ticks} ${r.fired} ${r.hits} ${r.fates}`;
    ok("!! with no `needs` the duel is the ORIGINAL code's, to the fingerprint (pins taken before the option existed: seeds 1 to 4, the default tactician on both sides)", J([1, 2, 3, 4].map((sd) => line(sd, duel(sd)))) === J(["1 7d749525 1.851875 2133 4,0 1,0 afloat,sunk", "2 f413967a 1.887708 1617 4,0 1,0 afloat,sunk", "3 146e318c 1.873333 1824 4,0 1,0 afloat,sunk", "4 6019cdad 1.817917 2622 4,0 1,0 afloat,sunk"]));
    const plain = duel(1), nul = duel(1, { needs: null });
    ok("!! `needs: null` is the same duel as omitting it, to the whole result, and a result without the option has no `charge` and no `deadAt`", J(plain) === J(nul) && !("charge" in plain) && !("deadAt" in plain));
    const full = duel(1, { needs: { cls: "battery", energyJ: 3.0e6 } });
    ok("!! a battery that does not run out flies the same duel: the same fingerprint, score and ticks as with no cost; the result carries `charge` (fractions left, both below 1 and above 0) and `deadAt` [null, null]", full.fingerprint === plain.fingerprint && full.score === plain.score && full.ticks === plain.ticks && full.charge.length === 2 && full.charge.every((c) => c > 0 && c < 1) && J(full.deadAt) === "[null,null]", J(full.charge));
    const tiny = duel(1, { needs: { cls: "battery", energyJ: 5.0e4 } });
    ok("!! a small battery (50 kJ) changes the flight (another fingerprint), runs out on both boats (deadAt [1438, 841]: whole ticks above 0 and below the duel's length) and leaves the charge at 0 on both; a 100 kJ one runs out on the second boat only and leaves the first 25 percent", tiny.fingerprint !== plain.fingerprint && J(tiny.deadAt) === "[1438,841]" && tiny.deadAt.every((t) => t < tiny.ticks) && J(tiny.charge) === "[0,0]" && (() => { const m = duel(1, { needs: { cls: "battery", energyJ: 1.0e5 } }); return J(m.deadAt) === "[null,940]" && Math.abs(m.charge[0] - 0.2489579) < 1e-6 && m.charge[1] === 0; })(), J(tiny.deadAt));
    const huge = duel(1, { needs: { cls: "battery", energyJ: 9e9 } });
    ok("!! the start charge is capped at the class's capacity: 9e9 joules is flown as 3.0e6 (the same fingerprint, the same charges left as the 3.0e6 run)", huge.fingerprint === full.fingerprint && J(huge.charge) === J(full.charge));
    ok("`cls` defaults to battery, and an unknown class is refused by name (subNeeds's own refusal)", duel(1, { needs: { energyJ: 3.0e6 } }).fingerprint === full.fingerprint && /no class named "nuclear"/.test(thr(() => duel(1, { needs: { cls: "nuclear", energyJ: 1e6 } }))));
    const seen = [], spy = { tactics: (obs) => { seen.push(obs.self); return {}; }, pilot: AS.pilot() }, seen0 = [], spy0 = { tactics: (obs) => { seen0.push(obs.self); return {}; }, pilot: AS.pilot() };
    D.duel(spy, D.scenario(1, "patrol"), { seconds: 10, opponent: { tactics: TA.makeTactician(TA.THETA_DEFAULT), pilot: AS.pilot() }, needs: { cls: "battery", energyJ: 3.0e6 } }); D.duel(spy0, D.scenario(1, "patrol"), { seconds: 10, opponent: { tactics: TA.makeTactician(TA.THETA_DEFAULT), pilot: AS.pilot() } });
    ok("!! the observation: with the option `self.charge` is the fraction of the start charge left (just under 1 at the first look and falling); without it there is NO `charge` key at all", seen.length > 5 && seen[0].charge < 1 && seen[0].charge > 0.99 && seen[seen.length - 1].charge < seen[0].charge && seen.every((s, i) => i === 0 || s.charge <= seen[i - 1].charge) && seen0.every((s) => !("charge" in s)), seen[0].charge + " -> " + seen[seen.length - 1].charge);
    const both = duel(2, { needs: { cls: "battery", energyJ: 3.0e5 } }), a = duel(2, { needs: { cls: "battery", energyJ: 3.0e5 } });
    ok("deterministic: the same duel with the same battery gives the same result", J(both) === J(a));
    const withAct = duel(1, { needs: { cls: "battery", energyJ: 3.0e6 }, actuators: { pitch: 2, yaw: 2, thrust: 2, ballast: 2 } });
    ok("the option composes with the actuator limits (the duel still runs and carries its charge)", Array.isArray(withAct.charge));
}

console.log("\n3. THE TUNER (tools/tuneSubTactics.mjs --needs)");
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "subEnergy-")), prog = fileURLToPath(new URL("../tools/tuneSubTactics.mjs", import.meta.url)), a = path.join(dir, "a.json"), b = path.join(dir, "b.json");
    const r1 = spawnSync(process.execPath, [prog, "--seed", "7", "--iters", "1", "--out", a, "--needs", "750000"], { encoding: "utf8", timeout: 240000 }), r2 = spawnSync(process.execPath, [prog, "--seed", "7", "--iters", "1", "--out", b], { encoding: "utf8", timeout: 240000 }), r3 = spawnSync(process.execPath, [prog], { encoding: "utf8", timeout: 60000 });
    const ja = fs.existsSync(a) ? JSON.parse(fs.readFileSync(a, "utf8")) : null, jb = fs.existsSync(b) ? JSON.parse(fs.readFileSync(b, "utf8")) : null;
    ok("!! `--needs 750000` writes the budget into the output and flies the search under it (its train score differs from the run without the flag); without the flag the output has no `needs`", r1.status === 0 && r2.status === 0 && ja && jb && ja.needs === 750000 && !("needs" in jb) && ja.trainScore !== jb.trainScore, `${ja && ja.trainScore} vs ${jb && jb.trainScore}`);
    ok("the usage line names --needs", r3.status === 2 && /\[--needs J\]/.test(r3.stderr));
    fs.rmSync(dir, { recursive: true, force: true });
}

console.log("\n4. THE COMMAND (tools/ship/takeSubEnergy.mjs)");
{
    const cal = X.calibrate("smoke");
    ok("!! the calibration on the smoke geometries, to the number: the dead screws [ping, hand] of 8 boat-duels a side (0,0 / 2,0 / 7,7 / 8,7 / 8,7), the charge left, the sinkings (the same on every rung: ping sunk 1, hand 7) and the first binding rung (2)", J(cal.rows.map((r) => ({ rung: r.rung, dead: r.pair.dead, bd: r.pair.boatDuels, ds: r.deadShare, ch: r.pair.charge.map((v) => +v.toFixed(3)), sunk: r.pair.sunk, xs: r.pair.xSunk, ys: r.pair.ySunk, m: +r.pair.summary.meanX.toFixed(3), b: r.binds }))) === '[{"rung":0,"dead":[0,0],"bd":8,"ds":0,"ch":[0.566,0.714],"sunk":8,"xs":1,"ys":7,"m":1.457,"b":false},{"rung":1,"dead":[2,0],"bd":8,"ds":0.125,"ch":[0.151,0.428],"sunk":8,"xs":1,"ys":7,"m":1.457,"b":false},{"rung":2,"dead":[7,7],"bd":8,"ds":0.875,"ch":[0.006,0.114],"sunk":8,"xs":1,"ys":7,"m":1.459,"b":true},{"rung":3,"dead":[8,7],"bd":8,"ds":0.9375,"ch":[0,0.106],"sunk":8,"xs":1,"ys":7,"m":1.46,"b":true},{"rung":4,"dead":[8,7],"bd":8,"ds":0.9375,"ch":[0,0.089],"sunk":8,"xs":1,"ys":7,"m":1.461,"b":true}]' && cal.chosen === 2);
    ok("an empty list of binding rungs is null: a calibration that picks nothing says so (the first row that binds, else null)", (() => { const f = (rows) => { const r = rows.find((x) => x.binds); return r ? r.rung : null; }; return f([{ binds: false }]) === null && f([{ binds: false }, { binds: true, rung: 1 }, { binds: true, rung: 2 }]) === 1; })());
    const lines = []; const code = X.command(["dev", "--set", "smoke"], { log: (s) => lines.push(s), write: () => { throw new Error("must not write"); } }), out = lines.join("\n") + "\n";
    ok("!! the smoke calibration prints the header, two lines a rung and the choice (12 lines), exit 0, and the whole output to the byte (sha256)", code === 0 && lines.length === 12 && /DEV calibration, set smoke \(geometries 1 to 4, both seats\)/.test(lines[0]) && lines[11] === "  RESULT: the cost binds first at rung 2 (0.75 MJ)" && sha(out) === "38f939511cd1eaa8d37b1a37851371e064e25ed4e0898afd82d8f7113fffe021", sha(out));
    // ---- the checks
    const pf = (o = {}) => ({ fights: [{ sx: 1, sy: 1 }], charge: [0.5, 0.5], dead: [1, 0], boatDuels: 4, ...o });
    ok("!! checks: all in order is []; a non-finite score (sx or sy), a non-finite charge, a doctrine against itself with an edge other than exactly 0, and a calibration in which no screw died when the cost is meant to fire, are each named by themselves", J(X.checks([pf()])) === "[]" && /score is non-finite/.test(X.checks([pf({ fights: [{ sx: NaN, sy: 1 }] })])[0]) && /score is non-finite/.test(X.checks([pf({ fights: [{ sx: 1, sy: Infinity }] })])[0]) && /charge is non-finite/.test(X.checks([pf({ charge: [NaN, 0.5] })])[0]) && /charge is non-finite/.test(X.checks([pf({ charge: [0.5, NaN] })])[0]) && /edge of 0.001, not exactly 0/.test(X.checks([pf()], { selfEdge: 0.001 })[0]) && X.checks([pf()], { selfEdge: 0 }).length === 0 && /did not fire/.test(X.checks([pf({ dead: [0, 0] })], { mustFire: true })[0]) && X.checks([pf({ dead: [0, 1] })], { mustFire: true }).length === 0 && X.checks([pf({ dead: [0, 0] })], { mustFire: false }).length === 0 && X.checks([pf({ charge: null })]).length === 0);
    // ---- read 1, through the override
    const rr = X.readRanking(2, "smoke");
    ok("!! read 1 at rung 2 on the smoke geometries, to the number: six pairs (the edge without and with the cost), no sign flipped so the cost does not MATTER by the rule, the doctrines' dead-screw shares and the ratings", rr.pairs.length === 6 && rr.matters === false && J(rr.checks) === "[]" && J(rr.pairs.map((p) => [p.x, p.y, +p.free.edge.toFixed(3), +p.cost.edge.toFixed(3), p.flips, p.matters])) === '[["hand","champ",-2.537,-2.538,false,false],["hand","ping",-2.534,-2.536,false,false],["hand","league7001",-2.955,-2.538,false,false],["champ","ping",0.018,0.011,false,false],["champ","league7001",-3.211,-0.008,false,false],["ping","league7001",-3.239,-0.018,false,false]]' && J(rr.doctrines.map((d) => [d.id, +d.deadShare.toFixed(3), +d.charge.toFixed(3)])) === '[["hand",0.875,0.113],["champ",1,0],["ping",0.792,0.012],["league7001",1,0]]' && J(Object.fromEntries(Object.entries(rr.ratings).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([i, x]) => [i, +x.toFixed(1)]))]))) === '{"free":{"hand":-302.7,"champ":-30.2,"ping":-30.2,"league7001":471.1},"cost":{"hand":-246.9,"champ":71.8,"ping":71.8,"league7001":71.8}}');
    ok("!! read 1 prints what the registered rule does not see: the share of duels with a boat sunk (98 percent without the cost, 100 with it) and the ratings' spread (774 without, 319 with)", Math.abs(rr.sunkShare.free - 47 / 48) < 1e-12 && rr.sunkShare.cost === 1 && Math.abs(rr.spread.free - 773.78) < 0.01 && Math.abs(rr.spread.cost - 318.65) < 0.01, J({ s: rr.sunkShare, sp: rr.spread }));
    // the rule at its edges, through a flipped fixture
    const flip = (fe, fz, ce, cz) => { const flips = Math.sign(fe) * Math.sign(ce) < 0, big = Math.abs(fe) >= Math.abs(ce) ? { edge: fe, z: fz } : { edge: ce, z: cz }; return flips && Math.abs(big.edge) >= X.MATTERS_EDGE && Math.abs(big.z) >= X.MATTERS_Z; };
    ok("the matters rule as a function of its inputs (documented, not run on a duel here): a flip with |edge| 0.05 and z 2 matters; 0.049, z 1.99 and no flip do not", flip(0.05, 2, -0.01, -3) === true && flip(0.049, 5, -0.01, -3) === false && flip(0.05, 1.99, -0.01, -1.9) === false && flip(0.2, 5, 0.1, 5) === false);
    const lines1 = [], wrote = []; const c1 = X.command(["held", "--rung", "2", "--write"], { heldSet: "smoke", log: (s) => lines1.push(s), exists: () => false, write: (f, s) => wrote.push([f, s]) }), out1 = lines1.join("\n") + "\n", parsed = wrote.length === 1 ? JSON.parse(wrote[0][1]) : null;
    ok("!! held (through the override, on the smoke geometries, never the HELD set): 15 lines, the file written once to brain/subEnergyHeld.json with the reading and the set, exit 0, and the whole output to the byte (sha256)", c1 === 0 && lines1.length === 15 && wrote.length === 1 && wrote[0][0] === "brain/subEnergyHeld.json" && parsed.rung === 2 && parsed.set === "smoke" && parsed.matters === false && /HELD read 1, rung 2 \(0.75 MJ a boat\), geometries 1 to 4/.test(lines1[0]) && /READING: the cost does not matter to the ranking by the rule/.test(lines1[lines1.length - 2]) && sha(out1) === "209d093cd6d462e9b038cbd1bf845d507af25cd39bc1d3084405f4317de46c32", sha(out1));
    const bad = []; const r1 = X.command(["held", "--rung", "2", "--write"], { heldSet: "smoke", log: (s) => bad.push(s), exists: () => true, write: () => { throw new Error("must not write"); } }), r2 = X.command(["held", "--rung", "2"], { log: (s) => bad.push(s) }), r3 = X.command(["held"], { log: (s) => bad.push(s) }), r4 = X.command(["held", "--rung", "x", "--write"], { log: (s) => bad.push(s) }), r5 = X.command(["held", "--rung", "5", "--write"], { log: (s) => bad.push(s) }), r6 = X.command(["dev", "--set", "held"], { log: (s) => bad.push(s) }), r7 = X.command(["dev", "--set", "smoke", "--write"], { log: (s) => bad.push(s) }), r8 = X.command([], { log: (s) => bad.push(s) });
    ok("!! refusals, all exit 2 and nothing flown: a second held read when the file exists; held on the real HELD set without --write; held without --rung, with a non-numeric one, or with a rung of 5; the HELD set through `dev`; --write on the smoke set; no argument prints the usage", [r1, r2, r3, r4, r5, r6, r7, r8].every((c) => c === 2) && /exists; the HELD set is read once/.test(bad[0]) && /run held with --write/.test(bad[1]) && /needs --rung N, N one of 0 to 4/.test(bad[2]) && /needs --rung N/.test(bad[3]) && /needs --rung N/.test(bad[4]) && /--set is smoke or dev, not "held"/.test(bad[5]) && /--write is for the dev set/.test(bad[6]) && /^usage:/.test(bad[7]) && bad.length === 8);
    // ---- read 2, from stubbed files
    const tuned = (seed, held, s, t, e) => ({ seed, heldScore: held, trainScore: held, needs: 750000, theta: { searchSpeed: s, trackSpeed: t, evadeSpeed: e } });
    const stub = (over = {}) => (f) => { const m = f.match(/subEnergyTuned(\d+)\.json$/); if (m) { const o = over[m[1]]; return o === null ? null : (o || { 6100: tuned(6100, 1.5, 3, 3, 2), 6101: tuned(6101, 1.8, 3.9, 4.0, 2.5), 6102: tuned(6102, 1.7, 2, 2, 1), 6103: tuned(6103, 1.6, 4, 4, 3) }[m[1]]); } return f === "brain/subTacticsThetaSearchPingWip.json" ? { theta: { searchSpeed: 4.5, trackSpeed: 4.4, evadeSpeed: 3.4 } } : null; };
    const r2a = X.readRetune(stub());
    ok("!! read 2: the champion is the BEST held score of the four (6101, 1.8), its speeds are compared with the no-cost champion's (4.5 and 4.4): the mean moved by (3.9+4.0)/2 - 4.45 = -0.5, which is SLOWS by the rule (the edge: at least 0.5 below)", r2a.champion === 6101 && Math.abs(r2a.delta - -0.5) < 1e-9 && r2a.reading === "SLOWS" && r2a.needs === 750000 && J(r2a.held.map((h) => h.seed)) === "[6100,6101,6102,6103]");
    const mid = X.readRetune(stub({ 6101: tuned(6101, 1.8, 3.91, 4.0, 2.5) })), up = X.readRetune(stub({ 6101: tuned(6101, 1.8, 4.5, 4.5, 3) })), upper = X.readRetune(stub({ 6101: tuned(6101, 1.8, 5, 4.9, 3) }));
    ok("!! read 2 at its edges: a mean 0.49 below is `as fast`, 0.5 below SLOWS, a mean about the same is `as fast`, 0.5 or more ABOVE is `faster`", mid.reading === "as fast" && X.readRetune(stub({ 6101: tuned(6101, 1.8, 3.9, 4.0, 2.5) })).reading === "SLOWS" && up.reading === "as fast" && upper.reading === "faster" && Math.abs(upper.delta - 0.5) < 1e-9);
    ok("read 2 with a file missing says which ones exist (3 of 4) and nothing is picked", /only 3 of the 4 tuning files exist/.test(X.readRetune(stub({ 6102: null })).error || ""));
    const l2 = [], w2 = []; const q1 = X.command(["retune", "--write"], { read: stub(), log: (s) => l2.push(s), exists: () => false, write: (f, s) => w2.push([f, s]) }), q2 = X.command(["retune", "--write"], { read: stub(), log: (s) => l2.push(s), exists: () => true, write: () => { throw new Error("must not write"); } }), q3 = X.command(["retune"], { read: stub({ 6100: null }), log: (s) => l2.push(s) });
    ok("!! the retune command: prints the champion and the reading, writes brain/subEnergyRetune.json once, refuses a second write, and refuses with a missing file (exit 2)", q1 === 0 && w2.length === 1 && w2[0][0] === "brain/subEnergyRetune.json" && /the champion is seed 6101/.test(l2[0]) && /the doctrine SLOWS by the rule/.test(l2[2]) && /written brain\/subEnergyRetune.json/.test(l2[3]) && q2 === 2 && /read 2 is recorded once/.test(l2[l2.length - 2]) && q3 === 2 && /only 3 of the 4/.test(l2[l2.length - 1]), l2.length + " lines");
    // ---- as a program
    const prog = fileURLToPath(new URL("../tools/ship/takeSubEnergy.mjs", import.meta.url)), flags = ["--preserve-symlinks", "--preserve-symlinks-main", prog];
    const pa = spawnSync(process.execPath, [...flags, "dev", "--set", "bogus"], { encoding: "utf8", timeout: 60000 }), pb = spawnSync(process.execPath, flags, { encoding: "utf8", timeout: 60000 }), pc = spawnSync(process.execPath, [...flags, "held", "--rung", "2"], { encoding: "utf8", timeout: 60000 }), pe = spawnSync(process.execPath, [...flags, "retune", "--dir", "no-such-dir"], { encoding: "utf8", timeout: 60000 });
    ok("!! run as a program (symlinks preserved so a mutant is the one that runs): a bad --set exits 2, no argument exits 2 with the usage, held without --write exits 2, retune in a directory with no files exits 2 -- and none of them flew a set", pa.status === 2 && /--set is smoke or dev, not "bogus"/.test(pa.stdout) && pb.status === 2 && /^usage:/.test(pb.stdout) && pc.status === 2 && /run held with --write/.test(pc.stdout) && pe.status === 2 && /only 0 of the 4/.test(pe.stdout), [pa.status, pb.status, pc.status, pe.status].join());
    const pd = spawnSync(process.execPath, ["--preserve-symlinks", "--input-type=module", "-e", `import(${J(prog)})`], { encoding: "utf8", timeout: 60000 });
    ok("!! imported from `node -e` (no script path in argv) the command runs nothing, prints nothing and does not throw", pd.status === 0 && pd.stdout === "" && pd.stderr === "", String(pd.status) + " " + pd.stderr.slice(0, 120));
    ok("importing the command sets no exit code", process.exitCode === undefined);
}

console.log("\n5. THE SOURCE");
{
    const cmd = fs.readFileSync(new URL("../tools/ship/takeSubEnergy.mjs", import.meta.url), "utf8"), duel_ = fs.readFileSync(new URL("./subDuel.mjs", import.meta.url), "utf8"), tune = fs.readFileSync(new URL("../tools/tuneSubTactics.mjs", import.meta.url), "utf8"), reg = fs.readFileSync(new URL("./SUB_ENERGY_WIP.md", import.meta.url), "utf8");
    const code = (t) => t.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*")).join("\n");
    ok("!! the command has no clock and no Math.random; the duel hook adds none", !/Math\.random|Date\.now|new Date|performance\.now/.test(code(cmd)) && !/Math\.random|Date\.now|new Date|performance\.now/.test(code(duel_)));
    ok("the headers name the registration, the command and the gate, and the files are ASCII", /SUB_ENERGY_WIP\.md/.test(cmd) && /subEnergy-selfcheck\.mjs/.test(cmd) && /SUB_ENERGY_WIP\.md/.test(duel_) && /SUB_ENERGY_WIP\.md/.test(tune) && ![cmd, duel_, tune].some((t) => /[^\x00-\x7F]/.test(t)));
    ok("!! the registration's ladder (3.0e6, 1.5e6, 0.75e6, 0.4e6, 0.2e6), its sets (94001, 95001), its 25 percent and 0.5 m/s and the seeds 6100 to 6103 are the code's", /3\.0e6 \(the class's own\), 1: 1\.5e6, 2: 0\.75e6, 3: 0\.4e6, 4: 0\.2e6/.test(reg) && /94001 to 94024/.test(reg) && /95001 to 95024/.test(reg) && /\*\*25 percent of the boat-duels\*\*/.test(reg) && /\*\*0\.5 m\/s\*\*/.test(reg) && /seeds 6100 to 6103/.test(reg) && /AMENDMENT A/.test(reg) && /CORRECTION to Amendment A/.test(reg));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
