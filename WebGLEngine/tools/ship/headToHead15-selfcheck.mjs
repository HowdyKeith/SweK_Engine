// WebGLEngine/tools/ship/headToHead15-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/headToHead15-selfcheck.mjs      (about 5 s: hand fixtures, a scripted tank and short real flights)
//
// THE GATE OF tools/ship/headToHead15.mjs (Round H15 of brain/HEAD_TO_HEAD.md, registered first: does the networks' advantage survive a price on speed).
//   1 SETS     the ids 15000-15199, 160 s, the registered constants, the 44 arms and their order.
//   2 WATTS    the power formula, against subNeeds.mjs's own watts on a state; reverse; hotel load.
//   3 ARMS     armsOf: the 44 arms, their registrations; refusals.
//   4 FLY      the flight on a scripted tank (score, power, speed, thrust, loss) and against switchboard.dropout; the identity arm; the largest offset draws more.
//   5 AUDIT    every arm in order in both conditions, the subset, the unknown arm.
//   6 STATS    extra power, efficiency (boundary 0.1 kW), the networks' efficiency, the best efficiency, priced gain, the best network, the registered verdict in every branch.
//   7 LINES    the seven bottom lines.
//   8 CHECKS   the nine rows; a failed check says NOT WEIGHED.
//   9 REPORT   the tables and the lines last.
//  10 SOURCE   the ids appear once; no clock, random or file.
// SABOTAGE LOG: filled in below once the mutation pass has run.
// NOT CHECKED, said plainly: that the snapshot's speed through the water stands for the forward speed in the power formula (the two differ by the cosine of a small angle); what a price on speed does to a task whose score is not heading error.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
import * as X from "./headToHead15.mjs";
import * as H13 from "./headToHead13.mjs";
import * as H14 from "./headToHead14.mjs";
import * as H9 from "./headToHead9.mjs";
import * as B from "../../brain/switchboard.mjs";
import * as AS from "../../brain/autopilotSub.mjs";
import * as N from "../../physics/mechanics/subNeeds.mjs";
import * as S from "../../physics/mechanics/subModel6dof.mjs";
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const src = fs.readFileSync(new URL("./headToHead15.mjs", import.meta.url), "utf8"), code = src.split("\n").filter((l) => !/^\s*(\/\/|\/\*\*)/.test(l)).join("\n");
console.log("headToHead15-selfcheck -- Round H15\n");
const W = (f = () => 0) => Array.from({ length: 963 }, (_, i) => f(i));
const netsOf = () => new Map(X.NET_IDS.map((id, k) => [id, W((i) => 0.001 * ((i * 7) % 5) + 0.0001 * k)]));
const wip = JSON.parse(fs.readFileSync(new URL("../../brain/pilotSubWeightsWip.json", import.meta.url), "utf8")).weights;
const scaled = () => new Map(X.NET_IDS.map((id, k) => [id, wip.map((v, i) => v * (1 + 0.01 * (k + 1)) + (i >= 510 && i < 823 ? 0.003 * ((i * 13 + k) % 7 - 3) : 0))]));

sec("1. SETS");
{
    ok("!! ids 15000-15199 (200), 160 s, a 30 Hz tick, settle 12 s (the board's own constants); frozen", X.IDS.from === 15000 && X.IDS.to === 15199 && X.SECONDS === 160 && X.TICK === B.TICK && X.SETTLE === B.SETTLE && Object.isFrozen(X.IDS));
    ok("!! the registered constants: learn margin 0.02, minimum extra power 0.1 kW, more at 1.25 and less at 0.8, hotel load 200 W, prices 0.05, 0.10, 0.20 (frozen); the screw's 3000 N and reverse fraction 0.6 are the model's", X.LEARN_MARGIN === 0.02 && X.MIN_EXTRA_KW === 0.1 && X.MORE === 1.25 && X.LESS === 0.8 && X.MIN_WATTS === 200 && J(X.PRICES) === "[0.05,0.1,0.2]" && Object.isFrozen(X.PRICES) && X.THRUST_MAX === 3000 && X.REVERSE === 0.6 && X.MIN_WATTS === N.POWER.hotelW);
    ok("!! 44 arms in order: autopilot, thr+0, H13's eight constants, H14's six scheduled arms, the 28 networks (H9's ids); frozen", X.ARM_IDS.length === 44 && X.ARM_IDS[0] === "autopilot" && X.ARM_IDS[1] === "thr+0" && J(X.ARM_IDS.slice(2, 10)) === J(H13.SIMPLE_IDS) && J(X.ARM_IDS.slice(10, 16)) === J(H14.SCHEDULED_IDS) && J(X.ARM_IDS.slice(16)) === J(H9.NET_IDS) && new Set(X.ARM_IDS).size === 44 && Object.isFrozen(X.ARM_IDS) && X.IDENT_ID === "thr+0");
}
sec("2. WATTS");
{
    ok("!! wattsOf is the hotel load plus |thrust N x speed|/0.5: a command of 1 at 2 m/s is 200 + 3000 x 2 / 0.5 = 12200 W; 0.5 at 2 m/s 6200 W; no thrust 200 W whatever the speed", near(X.wattsOf(1, 2), 12200, 1e-6) && near(X.wattsOf(0.5, 2), 6200, 1e-6) && X.wattsOf(0, 3) === 200 && near(X.wattsOf(0.5, 4), 200 + 1500 * 4 / 0.5, 1e-6));
    ok("!! reversing counts at the reverse fraction: a command of -1 at 2 m/s is 200 + 1800 x 2 / 0.5 = 7400 W", near(X.wattsOf(-1, 2), 7400, 1e-6) && near(X.wattsOf(-0.5, 2), 200 + 900 * 2 / 0.5, 1e-6));
    const model = AS.defaultModel(), st = S.createState({ depth: 30, speed: 2, heading: 0.4, model }), needs = N.initialNeeds("battery"), res = N.stepNeeds(model, st, needs, { pitch: 0, yaw: 0, thrust: 0.45, ballast: 0 }, 1 / 30);
    const rev = N.stepNeeds(model, st, needs, { pitch: 0, yaw: 0, thrust: -0.45, ballast: 0 }, 1 / 30);
    ok("!! THE POWER FORMULA IS THE NEEDS MODEL'S: on a state at 2 m/s with a command of 0.45 (and -0.45) the model's own watts equal wattsOf to 1e-6", near(res.watts, X.wattsOf(0.45, S.attitude(st).speed), 1e-6) && near(rev.watts, X.wattsOf(-0.45, S.attitude(st).speed), 1e-6) && res.watts > 200 && rev.watts < res.watts);
}
sec("3. ARMS");
{
    const nets = netsOf(), a = X.armsOf(nets), seen = [];
    for (const id of ["sched*2", "thr+0.3", "network-Wip"]) a[id].register ? a[id].register({ registerPilotKind: (c, k) => seen.push([c, k.weightCount]) }) : seen.push(["none"]);
    ok("!! armsOf gives the 44 arms by id in order; the scheduled arms are H14's (h14-sched), the constants H13's (h13-thr), the networks the built-in gfc ones (no recorder, no registration)", Object.keys(a).length === 44 && J(Object.keys(a)) === J(X.ARM_IDS) && X.ARM_IDS.every((id) => a[id].id === id) && J(seen) === J([["h14-sched", 1], ["h13-thr", 1], ["none"]]) && a["network-Wip"].entry().circuit === "gfc" && !a["network-Wip"].record && a["turn+0.6"].entry().circuit === "h14-turn" && a["sched*0.5"].entry().circuit === "h14-sched" && a["spd*2"].entry().circuit === "h13-spd");
    const miss = netsOf(); miss.delete("robust-6"); const short = netsOf(); short.set("base-1", W().slice(1));
    ok("!! armsOf refuses a missing network and a 962-weight network naming them, and null", /no network robust-6/.test(thr(() => X.armsOf(miss))) && /network base-1 must be an array of 963/.test(thr(() => X.armsOf(short))) && /no network/.test(thr(() => X.armsOf(null))));
}
sec("4. FLY");
{
    const scripted = (fn) => () => { let i = 0, tgt = { heading: 0, speed: 2 }; const snap = () => { const t = fn(i); if (t.targetNew) tgt = { heading: 0, speed: 2 }; return [{ target: tgt, heading: tgt.heading - t.error, speed: t.speed === undefined ? 2 : t.speed, cmd: { thrust: t.thrust === undefined ? 0 : t.thrust }, compass: t.dark ? { valid: false } : { valid: true }, lost: t.lost ? 1 : 0 }]; }; return { registerPilotKind() {}, sync() {}, setEvent() {}, step() { i++; }, snapshot: snap }; };
    const arm = { id: "x", entry: () => ({}) }, f1 = (fn, sec, ev = "dropout") => X.fly(arm, { from: 7, to: 7 }, sec, ev, scripted(fn))[0];
    const r1 = f1((i) => ({ dark: i >= 100 && i < 300, error: 0.5, targetNew: i === 1 }), 12);
    ok("!! with no settled dark tick the score falls back to ALL the dark ticks: error 0.5 gives 1 - 0.5/pi; the key is sb-<n>", near(r1.score, 1 - 0.5 / Math.PI, 1e-12) && r1.key === "sb-7");
    const r2 = f1((i) => ({ dark: i >= 400 && i < 600, error: i < 450 ? 0.2 + 2 * Math.PI : 1.0, targetNew: i === 1 || i === 450 }), 40);
    ok("!! the score is the mean SETTLED dark heading error read through the wrap: 1 - 0.2/pi", near(r2.score, 1 - 0.2 / Math.PI, 1e-12));
    const r3 = f1((i) => ({ dark: false, error: i < 400 ? 0.3 : 0.1, targetNew: i === 1 || i === 200 }), 25, null);
    ok("!! in the lit condition every tick is in the bucket: the settled ticks (error 0.1) give 1 - 0.1/pi", near(r3.score, 1 - 0.1 / Math.PI, 1e-12));
    const r4 = f1((i) => ({ dark: i >= 100 && i < 130, error: 0.2, targetNew: i === 1, speed: i <= 100 ? 2 : 4, thrust: i <= 100 ? 0.5 : 0 }), 10);
    ok("!! the power is the mean over EVERY tick of the power formula: 100 ticks at command 0.5 and 2 m/s (6200 W) and 200 at no thrust and 4 m/s (200 W) give (100 x 6200 + 200 x 200)/300 = 2200 W; the mean speed 3.3333 and the mean thrust 0.1667", near(r4.watts, 2200, 1e-6) && near(r4.speed, (100 * 2 + 200 * 4) / 300, 1e-9) && near(r4.thrust, 50 / 300, 1e-9));
    ok("!! the power uses the SPEED of each tick (the same thrust at 2 and at 4 m/s differs): command 0.5 throughout at 4 m/s gives 200 + 1500 x 4 / 0.5 = 12200 W", near(f1((i) => ({ dark: i >= 100 && i < 130, error: 0.2, targetNew: i === 1, speed: 4, thrust: 0.5 }), 10).watts, 12200, 1e-6));
    ok("!! a heading error past pi is read through the wrap (4 rad is 2.2832 the other way, and -4 reads the same); bad is the last snapshot's lost flag; a run with no tick in the bucket is refused naming the arm and the id; several ids come back in order", near(f1((i) => ({ dark: i >= 100 && i < 300, error: 4, targetNew: i === 1 }), 12).score, 1 - (2 * Math.PI - 4) / Math.PI, 1e-12) && near(f1((i) => ({ dark: i >= 100 && i < 300, error: -4, targetNew: i === 1 }), 12).score, 1 - (2 * Math.PI - 4) / Math.PI, 1e-12) && f1((i) => ({ dark: i >= 100 && i < 200, error: 0.1, targetNew: i === 1, lost: i === 360 }), 12).bad === true && f1((i) => ({ dark: i >= 100 && i < 200, error: 0.1, targetNew: i === 1 }), 12).bad === false && /arm x id sb-7 has no ticks/.test(thr(() => f1((i) => ({ dark: false, error: 0.1, targetNew: i === 1 }), 12))) && J(X.fly(arm, { from: 7, to: 9 }, 10, "dropout", scripted((i) => ({ dark: i >= 100 && i < 200, error: 0.1, targetNew: i === 1 }))).map((r) => r.key)) === J(["sb-7", "sb-8", "sb-9"]));
    const arms = X.armsOf(scaled()), board = B.createBoard().addTask(B.dropoutTask); board.addArm(arms.autopilot); board.addArm(arms["sched*2"]); board.addArm(arms["base-2"]);
    const mine = X.fly(arms["sched*2"], { from: 5, to: 5 }, 35, "dropout")[0], theirs = board.run("dropout", ["sched*2"], { from: 5, to: 5 }, { seconds: 35 }).runs["sched*2"][0], mineL = X.fly(arms["base-2"], { from: 5, to: 5 }, 35, null)[0], theirsL = board.run("dropout", ["base-2"], { from: 5, to: 5 }, { seconds: 35, event: null }).runs["base-2"][0];
    ok("!! THIS FLIGHT SCORES AS switchboard.dropout DOES: a scheduled arm (dark) and a network (lit) on a real tank and id get the board's score to the last digit and the same lost flag", mine.score === theirs.score && mine.bad === theirs.bad && mineL.score === theirsL.score && mineL.bad === theirsL.bad);
    const f = (id) => X.fly(arms[id], { from: 5, to: 6 }, 35, "dropout"), ap = f("autopilot"), idn = f("thr+0"), big = f("thr+0.6");
    ok("!! on real flights the identity arm flies exactly as the autopilot (score and power within 1e-9), the largest thrust offset draws more power on every id, and the autopilot's power is between 200 W and 20 kW", idn.every((r, i) => near(r.score, ap[i].score, 1e-9) && near(r.watts, ap[i].watts, 1e-6)) && big.every((r, i) => r.watts > ap[i].watts) && ap.every((r) => r.watts > 1000 && r.watts < 20000));
}
sec("5. AUDIT");
{
    const calls = [], fake = (arm, range, secs, ev) => { calls.push([arm.id, range.from, range.to, secs, ev]); return Array.from({ length: range.to - range.from + 1 }, (_, i) => ({ key: "sb-" + (range.from + i), score: 0.8, bad: false, watts: 5000, speed: 2, thrust: 0.4 })); };
    const nets = netsOf(), au = X.audit(nets, { range: { from: 1, to: 3 }, seconds: 33, flyFn: fake });
    ok("!! audit flies every arm in order, dark then lit, handing the arm, the range, the seconds and the event (dropout, then null); keeps the runs, the range, the seconds and the weights", calls.length === 88 && J(calls[0]) === J(["autopilot", 1, 3, 33, "dropout"]) && J(calls[1]) === J(["autopilot", 1, 3, 33, null]) && J(calls[2]) === J(["thr+0", 1, 3, 33, "dropout"]) && calls[calls.length - 1][0] === "robust-9" && au.range.to === 3 && au.seconds === 33 && au.nets === nets && Object.keys(au.dark).length === 44 && Object.keys(au.lit).length === 44);
    calls.length = 0; const sub = X.audit(nets, { range: { from: 1, to: 2 }, seconds: 9, arms: ["sched*2", "base-1"], flyFn: fake });
    ok("!! audit with a subset flies only those arms and always the autopilot; an unknown arm is refused naming it", J(Object.keys(sub.dark).sort()) === J(["autopilot", "base-1", "sched*2"]) && calls.length === 6 && /no arm nope/.test(thr(() => X.audit(nets, { arms: ["nope"], flyFn: fake }))));
}
const N0 = 40, base = (c) => Array.from({ length: N0 }, (_, i) => 0.6 + 0.02 * Math.sin(i + (c === "lit" ? 1 : 0)));
const wob = (i, a) => (i % 2 ? a : -a);
// spec[arm] = { gain (dark), lit, kw (dark mean power kW; default 5), litKw, lost: [conditions] }
const mkAu = (spec = {}, n = N0, nets = netsOf()) => {
    const au = { dark: {}, lit: {}, range: { from: 1, to: n }, seconds: 60, nets };
    for (const c of ["dark", "lit"]) for (const a of X.ARM_IDS) {
        const s = spec[a] || {}, g = (c === "lit" ? s.lit : s.gain) || 0, lost = (s.lost || []).includes(c), kw = (c === "lit" && s.litKw !== undefined ? s.litKw : s.kw !== undefined ? s.kw : (a === "autopilot" || a === "thr+0" ? 5 : 5));
        au[c][a] = Array.from({ length: n }, (_, i) => ({ key: "sb-" + (i + 1), score: base(c)[i % N0] + g + wob(i, 0.02) + (a === "autopilot" || a === "thr+0" ? 0 : (i % 2 ? 1 : -1) * 0.0001 * X.ARM_IDS.indexOf(a)), bad: lost && i < 2, watts: kw * 1000 + (i % 2 ? 1 : -1) * 10, speed: 2, thrust: 0.4 }));
    }
    return au;
};
const nets28 = (g, kw = 5, l = 0, extra = {}) => Object.fromEntries(X.NET_IDS.map((id) => [id, { gain: g, kw, lit: l, ...extra }]));
const consts = (gains = [], kws = []) => Object.fromEntries(X.CONSTANT_IDS.map((id, i) => [id, { gain: gains[i] || 0, kw: kws[i] === undefined ? 5 : kws[i] }]));
const sched = (gains = [], kws = []) => Object.fromEntries(X.SCHEDULED_IDS.map((id, i) => [id, { gain: gains[i] || 0, kw: kws[i] === undefined ? 5 : kws[i] }]));
sec("6. STATS");
{
    ok("!! kwOf is an arm's mean power in kW and extraKw its mean per-id difference from the autopilot's: an autopilot at 5 kW and an arm at 6.5 give 6.50 and +1.50; DARK by default, the lit condition when asked", (() => { const au = mkAu({ "thr+0.3": { kw: 6.5, litKw: 9 }, autopilot: { kw: 5, litKw: 4 } }); return near(X.kwOf(au, "thr+0.3"), 6.5, 1e-9) && near(X.extraKw(au, "thr+0.3"), 1.5, 1e-9) && near(X.kwOf(au, "thr+0.3", "lit"), 9, 1e-9) && near(X.extraKw(au, "thr+0.3", "lit"), 5, 1e-9) && near(X.kwOf(au, "autopilot"), 5, 1e-9); })());
    ok("!! efficiencyOf is the dark gain over the extra kW, defined from 0.1 kW: an extra power of 0.0999 kW is null, 0.1001 defined (gain 0.05 gives 0.4995); a lower power than the autopilot's is null; the lit condition reads the lit gain and power", (() => { const e = (kw, g) => X.efficiencyOf(mkAu({ "thr+0.3": { kw, gain: g } }), "thr+0.3"); const l = mkAu({ "thr+0.3": { kw: 5, litKw: 7, gain: 0.5, lit: 0.1 } }); return e(5.0999, 0.05) === null && near(e(5.1001, 0.05), 0.05 / 0.1001, 3e-3) && e(4, 0.05) === null && near(e(6, 0.05), 0.05, 2e-3) && near(X.efficiencyOf(l, "thr+0.3", "lit"), 0.05, 2e-3) && X.efficiencyOf(l, "thr+0.3") === null; })());
    ok("!! netEfficiency is the mean dark gain over the mean extra kW of the 28 (27 at gain 0.1 and +1 kW and one at 0.3 and +3 give 0.1071, +1.0714 and 0.1); extra below 0.1 kW gives eff null", (() => { const n = X.netEfficiency(mkAu({ ...nets28(0.1, 6), "network-Wip": { gain: 0.3, kw: 8 } })), m = X.netEfficiency(mkAu(nets28(0.1, 5.05))); return near(n.gain, 0.10714285, 1e-6) && near(n.extra, 30 / 28, 1e-9) && near(n.eff, 0.1, 2e-3) && m.eff === null && near(m.extra, 0.05, 1e-9); })());
    ok("!! bestEfficiency is the largest defined efficiency among the arms asked for, named; arms with undefined efficiency are skipped; with `minGain` only arms gaining more count (0.0401 excludes a gain of 0.04, 0.0399 admits it); none gives null", (() => { const au = mkAu({ "thr+0.1": { gain: 0.04, kw: 5.4 }, "thr+0.2": { gain: 0.08, kw: 5.4 }, "thr+0.3": { gain: 0.07, kw: 5.4 }, "thr+0.4": { gain: 0.5, kw: 5.05 }, "thr+0.6": { gain: 0.0201, kw: 5.1 } }); return X.bestEfficiency(au, X.CONSTANT_IDS).name === "thr+0.6" && X.bestEfficiency(au, X.CONSTANT_IDS, 0.05).name === "thr+0.2" && X.bestEfficiency(au, ["thr+0.4"]) === null && X.bestEfficiency(au, ["thr+0.1"], 0.0401) === null && X.bestEfficiency(au, ["thr+0.1"], 0.0399).name === "thr+0.1" && X.bestEfficiency(au, ["thr+0.6"], 0.02).name === "thr+0.6" && X.bestEfficiency(mkAu({}), X.CONSTANT_IDS) === null; })());
    ok("!! pricedGain is the dark gain less the price x the extra kW: gain 0.09 at +1.5 kW is 0.09 - 0.05 x 1.5 = 0.015 at 0.05 per kW and -0.21 at 0.20; zero extra power leaves the gain", (() => { const au = mkAu({ "thr+0.3": { gain: 0.09, kw: 6.5, lit: 0.5, litKw: 20 } }); return near(X.pricedGain(au, "thr+0.3", 0.05), 0.015, 2e-3) && near(X.pricedGain(au, "thr+0.3", 0.2), -0.21, 2e-3) && near(X.pricedGain(au, "thr+0.3", 0), 0.09, 2e-3); })());
    ok("!! bestNetwork is the network with the largest DARK gain, named (the first of a tie is not testable on floats); the lit gain changes nothing", (() => { const au = mkAu({ ...nets28(0.05), "base-4": { gain: 0.09, kw: 5, lit: 0.01 }, "robust-2": { gain: 0.06, kw: 5, lit: 0.9 } }), b = X.bestNetwork(au); return b.name === "base-4" && near(b.g, 0.09, 2e-3); })());
    const part = (spec, k) => X.verdictOf(mkAu(spec)).split("; ")[k], cN = nets28(0.1, 6), cEff = (name, g, kw) => ({ [name]: { gain: g, kw } });
    // networks: gain 0.1 at +1 kW: E_net 0.1
    ok("!! part A: E_net against the best constant: a constant at 0.1 / 1 kW... networks at 0.1 over +1 kW (0.1 per kW) with a best constant at 0.08 (ratio 1.25 or more) are MORE POWER-EFFICIENT THAN EVERY CONSTANT; at 0.0801 (ratio 1.2484)... the three words at 1.25 and 0.8 (0.0799 constant: 1.2516 MORE; 0.0801: ABOUT; 0.1249 constant: 0.8006 ABOUT; 0.1251: LESS)", part({ ...cN, ...cEff("thr+0.3", 0.0799, 6) }, 0) === "THE NETWORKS ARE MORE POWER-EFFICIENT THAN EVERY CONSTANT" && part({ ...cN, ...cEff("thr+0.3", 0.0801, 6) }, 0) === "THE NETWORKS ARE ABOUT AS POWER-EFFICIENT AS THE BEST CONSTANT" && part({ ...cN, ...cEff("thr+0.3", 0.1249, 6) }, 0) === "THE NETWORKS ARE ABOUT AS POWER-EFFICIENT AS THE BEST CONSTANT" && part({ ...cN, ...cEff("thr+0.3", 0.1251, 6) }, 0) === "THE NETWORKS ARE LESS POWER-EFFICIENT THAN THE BEST CONSTANT");
    ok("!! part A with no constant at a defined efficiency counts the best constant as 0 (MORE); networks with a mean gain of 0.0199 or less are NOT ASSESSED (0.0201 is read); networks drawing under 0.1 kW more are NOT ASSESSED with their own text", part(cN, 0) === "THE NETWORKS ARE MORE POWER-EFFICIENT THAN EVERY CONSTANT" && part(nets28(0.0199, 6), 0) === "NOT ASSESSED: THE NETWORKS DID NOT GAIN" && part(nets28(0.0201, 6), 0).startsWith("THE NETWORKS ARE") && part(nets28(0.1, 5.05), 0) === "NOT ASSESSED: THE NETWORKS' EXTRA POWER IS BELOW 0.1 kW");
    ok("!! part A takes the best of ALL EIGHT constants (a speed setpoint too): spd*2 at 0.1 per kW against networks at 0.1 per kW is ABOUT AS; the identity arm and the scheduled arms are not constants", part({ ...cN, ...cEff("spd*2", 0.1, 6) }, 0) === "THE NETWORKS ARE ABOUT AS POWER-EFFICIENT AS THE BEST CONSTANT" && part({ ...cN, ...cEff("thr+0", 0.5, 6), ...cEff("sched*1", 0.5, 6) }, 0) === "THE NETWORKS ARE MORE POWER-EFFICIENT THAN EVERY CONSTANT");
    ok("!! part B: the best scheduled arm (a gain above 0.02) against E_net 0.1: at 0.125 (1.25) MORE, at 0.1249 ABOUT, at 0.08 (0.8) ... 0.0801 ABOUT, 0.0799 LESS; a gain of exactly... 0.0199 or none counts as 0 (LESS); the six scheduled arms are searched (turn+0.6 too) and the constants and identity are not", part({ ...cN, ...cEff("sched*1", 0.1251, 6) }, 1) === "A SCHEDULED LAW IS MORE POWER-EFFICIENT THAN THE NETWORKS" && part({ ...cN, ...cEff("sched*1", 0.1249, 6) }, 1) === "A SCHEDULED LAW IS ABOUT AS POWER-EFFICIENT AS THE NETWORKS" && part({ ...cN, ...cEff("turn+0.6", 0.0801, 6) }, 1) === "A SCHEDULED LAW IS ABOUT AS POWER-EFFICIENT AS THE NETWORKS" && part({ ...cN, ...cEff("sched*4", 0.0799, 6) }, 1) === "A SCHEDULED LAW IS LESS POWER-EFFICIENT THAN THE NETWORKS" && part({ ...cN, ...cEff("sched*2", 0.0199, 5.1) }, 1) === "A SCHEDULED LAW IS LESS POWER-EFFICIENT THAN THE NETWORKS" && part(cN, 1) === "A SCHEDULED LAW IS LESS POWER-EFFICIENT THAN THE NETWORKS" && part({ ...cN, ...cEff("thr+0.6", 0.5, 6), ...cEff("thr+0", 0.5, 6) }, 1) === "A SCHEDULED LAW IS LESS POWER-EFFICIENT THAN THE NETWORKS");
    ok("!! part B: a scheduled arm with an extra power below 0.1 kW is skipped (undefined); the ratio is the best scheduled over the NETWORKS' efficiency (networks at 0.2 per kW: a scheduled arm at 0.1 is LESS, at 0.26 MORE)", part({ ...cN, ...cEff("sched*1", 0.3, 5.05) }, 1) === "A SCHEDULED LAW IS LESS POWER-EFFICIENT THAN THE NETWORKS" && part({ ...nets28(0.2, 6), ...cEff("sched*1", 0.1, 6) }, 1) === "A SCHEDULED LAW IS LESS POWER-EFFICIENT THAN THE NETWORKS" && part({ ...nets28(0.2, 6), ...cEff("sched*1", 0.26, 6) }, 1) === "A SCHEDULED LAW IS MORE POWER-EFFICIENT THAN THE NETWORKS");
    ok("!! part B is NOT ASSESSED when the networks did not gain or drew under 0.1 kW more", part(nets28(0.0199, 6), 1) === "NOT ASSESSED" && part(nets28(0.1, 5.05), 1) === "NOT ASSESSED");
    ok("!! part C: the networks' extra power with its sign and the percentage of the autopilot's: +1.5 kW on 5 kW is `THE NETWORKS DRAW 1.50 kW MORE THAN THE AUTOPILOT (30 PERCENT)`; -0.5 kW is `0.50 kW LESS ... (10 PERCENT)`; the percentage is rounded (+0.8 on 5: 16)", part(nets28(0.1, 6.5), 2) === "THE NETWORKS DRAW 1.50 kW MORE THAN THE AUTOPILOT (30 PERCENT)" && part(nets28(0.1, 4.5), 2) === "THE NETWORKS DRAW 0.50 kW LESS THAN THE AUTOPILOT (10 PERCENT)" && part(nets28(0.1, 5.8), 2) === "THE NETWORKS DRAW 0.80 kW MORE THAN THE AUTOPILOT (16 PERCENT)" && X.verdictOf(mkAu(cN)).split("; ").length === 3);
    ok("!! part C takes the percentage of the autopilot's DARK power (an autopilot at 5 kW dark and 10 kW lit with networks +1.5 kW is 30 percent)", X.verdictOf(mkAu({ ...nets28(0.1, 6.5), autopilot: { kw: 5, litKw: 10 } })).split("; ")[2] === "THE NETWORKS DRAW 1.50 kW MORE THAN THE AUTOPILOT (30 PERCENT)");
    ok("!! part C reads the networks' MEAN extra power over the 28 (27 at +0 and one at +2.8 give 0.10) and the DARK condition (the lit power changes nothing)", (() => { const spec = { ...nets28(0.1, 5), "network-Wip": { gain: 0.1, kw: 7.8, litKw: 0 } }; const au = mkAu(spec); return X.verdictOf(au).split("; ")[2] === "THE NETWORKS DRAW 0.10 kW MORE THAN THE AUTOPILOT (2 PERCENT)"; })());
}
sec("7. LINES");
{
    const spec = { ...consts([0.015, 0.04, 0.06, 0.088, 0.09, 0.01, 0.03, 0.05], [5.1, 5.2, 5.3, 5.4, 5.6, 5.45, 5.9, 6.5]), ...nets28(0.1, 6, 0.06, { litKw: 9 }), "sched*1": { gain: 0.06, kw: 5.4 }, "sched*2": { gain: 0.1, kw: 5.8 }, "turn+0.3": { gain: 0.05, kw: 5.25 }, "base-4": { gain: 0.15, kw: 6.2 } }, au = mkAu(spec), L = X.bottomLines(au);
    ok("!! seven lines: LEARNED (28 and the mean gain), the mean power, the extra power, the power efficiency, the priced gain, the verdict, the lost subs", L.length === 7 && /^LEARNED: 28 OF 28 NETWORKS BEAT THE AUTOPILOT IN THE DARK BY MORE THAN 0\.02; MEAN GAIN \+0\.10\d\d$/.test(L[0]) && /^VERDICT: /.test(L[5]) && /^LOST SUBS: /.test(L[6]), L[0]);
    ok("!! line 2 gives the autopilot's power, the eight constants' (5.10 ... 6.50), the six scheduled arms' and the networks' mean with the range (6.00 to 6.20)", /^MEAN POWER \(kW, dark\): AUTOPILOT 5\.00; CONSTANTS 5\.10, 5\.20, 5\.30, 5\.40, 5\.60, 5\.45, 5\.90, 6\.50; SCHEDULED 5\.00, 5\.40, 5\.80, 5\.00, 5\.25, 5\.00; THE NETWORKS 6\.01 \(6\.00 to 6\.20\)$/.test(L[1]), L[1]);
    ok("!! line 3 gives the extra power over the autopilot (with sign) of the constants, the scheduled arms and the networks' mean +1.01", /^EXTRA POWER \(kW over the autopilot\): CONSTANTS \+0\.10, \+0\.20, \+0\.30, \+0\.40, \+0\.60, \+0\.45, \+0\.90, \+1\.50; SCHEDULED \+0\.00, \+0\.40, \+0\.80, \+0\.00, \+0\.25, \+0\.00; THE NETWORKS \+1\.01$/.test(L[2]), L[2]);
    ok("!! line 4 gives the networks' efficiency, the best constant named and the six scheduled arms' (n/a under 0.1 kW)", /^POWER EFFICIENCY \(dark gain per extra kW\): THE NETWORKS 0\.\d{3}; BEST CONSTANT thr\+0\.4 0\.\d{3}; SCHEDULED sched\*0\.5 n\/a, sched\*1 0\.150, sched\*2 0\.125, sched\*4 n\/a, turn\+0\.3 0\.200, turn\+0\.6 n\/a$/.test(L[3]), L[3]);
    { const fm = (a) => PR.map((p) => (X.pricedGain(au, a, p) >= 0 ? "+" : "") + X.pricedGain(au, a, p).toFixed(4)).join(" / "), PR = [0.05, 0.1, 0.2], netM = PR.map((p) => { const v = X.NET_IDS.reduce((q, a) => q + X.pricedGain(au, a, p), 0) / 28; return (v >= 0 ? "+" : "") + v.toFixed(4); }).join(" / ");
      ok("!! line 5 gives the priced gain at 0.05 / 0.10 / 0.20 for the networks' MEAN, the best network (base-4: +0.0900 / +0.0300 / -0.0900), thr+0.1, sched*1 and sched*2, each from its own arm", L[4] === `PRICED GAIN (dark gain less the price x extra kW) AT 0.05 / 0.10 / 0.20 PER kW: THE NETWORKS ${netM}; BEST NETWORK base-4 ${fm("base-4")}; thr+0.1 ${fm("thr+0.1")}; sched*1 ${fm("sched*1")}; sched*2 ${fm("sched*2")}` && /BEST NETWORK base-4 \+0\.0\d\d\d \/ \+0\.0\d\d\d \/ -0\.0\d\d\d;/.test(L[4]) && fm("sched*2") !== fm("sched*1") && fm("thr+0.1") !== fm("sched*1") && netM !== fm("base-4"), L[4]); }
    const l = X.bottomLines(mkAu({ ...nets28(0.1, 6), autopilot: { lost: ["dark", "lit"] }, "thr+0.6": { lost: ["dark"] }, "spd*2": { lost: ["lit"] }, "sched*2": { lost: ["dark", "lit"] }, "turn+0.3": { lost: ["lit"] }, "thr+0": { lost: ["dark", "lit"] }, "base-3": { lost: ["lit"] }, "network-Wip": { lost: ["dark", "lit"] } }))[6];
    ok("!! lost subs over both conditions: autopilot 4, constants 4 (thr+0.6 dark 2, spd*2 lit 2; the identity arm is in no total), scheduled 6 (4 and 2) with 4 in the worst, networks 6 with 4 in the worst", l === "LOST SUBS: autopilot 4, constants 4, scheduled 6 (4 in the worst), networks 6 (4 in the worst)", l);
    const g = X.bottomLines(mkAu(nets28(0.0199, 6)))[0];
    ok("!! LEARNED counts the networks over 0.02 only (0.0199 counts none); with no constant at a defined efficiency the best constant is n/a", /^LEARNED: 0 OF 28/.test(g) && /BEST CONSTANT n\/a/.test(X.bottomLines(mkAu(nets28(0.1, 6)))[3]), g);
}
sec("8. CHECKS");
{
    const good = () => mkAu({ ...consts([0.02, 0.04, 0.06, 0.08, 0.09, 0.01, 0.03, 0.05], [5.1, 5.2, 5.3, 5.4, 5.6, 5.45, 5.9, 6.5]), ...nets28(0.1, 6, 0.05) }), names = (au) => X.checksOf(au).filter((c) => !c.ok).map((c) => c.name);
    ok("!! nine check rows on a clean audit, all passing", J(X.checksOf(good()).map((c) => c.name)) === J(["SIZES", "IDS ALIGNED", "SCORES INSIDE (0, 1)", "POWERS FINITE AND AT LEAST 200 W", "EVENT REACHES THE FLIGHT", "NETWORKS", "IDENTITY ARM IS THE AUTOPILOT", "LARGEST OFFSET DRAWS MORE POWER", "NETWORKS DISTINCT"]) && names(good()).length === 0);
    const a1 = good(); a1.lit["base-4"].pop(); const a2 = good(); a2.dark["robust-3"][3].key = "x"; const a3 = good(); a3.dark.autopilot[0].score = 1.0; const a4 = good(); a4.dark["spd*2"][5].score = 0; const a5 = good(); a5.lit.autopilot = a5.dark.autopilot.map((r) => ({ ...r }));
    ok("!! a short arm breaks SIZES, a different id IDS ALIGNED, a score of 1 or of 0 SCORES INSIDE, an autopilot with equal dark and lit scores EVENT REACHES THE FLIGHT", names(a1).includes("SIZES") && names(a2).includes("IDS ALIGNED") && names(a3).includes("SCORES INSIDE (0, 1)") && names(a4).includes("SCORES INSIDE (0, 1)") && names(a5).includes("EVENT REACHES THE FLIGHT"));
    const f1 = good(); f1.dark["base-1"][2].watts = NaN; const f2 = good(); f2.lit["thr+0.3"][4].watts = Infinity; const f3 = good(); f3.dark["spd*1.5"][0].watts = undefined; const f4 = good(); f4.dark["sched*1"][1].watts = 199; const f5 = good(); f5.lit["base-2"][1].watts = 100;
    ok("!! a NaN, an infinite or a missing power, or one under the 200 W hotel load, in either condition, breaks POWERS FINITE AND AT LEAST 200 W; 200 W exactly does not", [f1, f2, f3, f4, f5].every((a) => names(a).includes("POWERS FINITE AND AT LEAST 200 W")) && (() => { const e = good(); e.dark["base-1"][2].watts = 200; return !names(e).includes("POWERS FINITE AND AT LEAST 200 W"); })());
    const b1 = good(); b1.nets.get("base-1").pop(); const b2 = good(); b2.nets.get("base-2")[10] = NaN; const b3 = good(); b3.nets.delete("robust-4"); const b4 = good(); b4.nets = null; const b5 = good(); b5.nets.get("base-5").push(0); const b6 = good(); b6.nets.get("base-6")[3] = Infinity;
    ok("!! a 962-weight or 964-weight network, a NaN weight, an infinite weight, a missing network and no weights break NETWORKS", [b1, b2, b3, b4, b5, b6].every((a) => names(a).includes("NETWORKS")));
    const c1 = good(); c1.dark["thr+0"][5].score += 1e-4; const c2 = good(); c2.lit["thr+0"][7].watts += 1; const c3 = good(); c3.dark["thr+0"][5].score += 5e-7; const c4 = good(); delete c4.dark["thr+0"]; const c5 = good(); c5.dark["thr+0"][2].watts += 5e-7;
    ok("!! the identity arm off the autopilot by 1e-4 in score or by 1 W in power (either condition) or missing breaks IDENTITY ARM IS THE AUTOPILOT; 5e-7 in score or in power is inside the tolerance of 1e-6", [c1, c2, c4].every((a) => names(a).includes("IDENTITY ARM IS THE AUTOPILOT")) && !names(c3).includes("IDENTITY ARM IS THE AUTOPILOT") && !names(c5).includes("IDENTITY ARM IS THE AUTOPILOT"));
    const d1 = mkAu({ ...nets28(0.1, 6), "thr+0.6": { kw: 4 } }), d2 = mkAu({ ...nets28(0.1, 6), "thr+0.6": { kw: 5 } }), d3 = mkAu({ ...nets28(0.1, 6), "thr+0.6": { kw: 5.001 } });
    ok("!! a largest offset drawing less power than the autopilot, or equal, breaks LARGEST OFFSET DRAWS MORE POWER; a larger one holds; the DARK power is read (a lit-only rise does not help)", names(d1).includes("LARGEST OFFSET DRAWS MORE POWER") && names(d2).includes("LARGEST OFFSET DRAWS MORE POWER") && !names(d3).includes("LARGEST OFFSET DRAWS MORE POWER") && names(mkAu({ ...nets28(0.1, 6), "thr+0.6": { kw: 5, litKw: 9 } })).includes("LARGEST OFFSET DRAWS MORE POWER"));
    const e1 = good(); e1.dark["base-5"] = e1.dark["base-4"].map((r) => ({ ...r })); const e2 = good(); e2.dark["thr+0.1"] = e2.dark["thr+0.2"].map((r) => ({ ...r }));
    ok("!! two identical networks break NETWORKS DISTINCT; two identical constants do not", names(e1).includes("NETWORKS DISTINCT") && !names(e2).includes("NETWORKS DISTINCT"));
    const g1 = good(); g1.range = { from: 1, to: 41 }; const g2 = good(); g2.dark["thr+0.4"].push({ ...g2.dark["thr+0.4"][0], key: "sb-41" });
    ok("!! a 41-id range with 40 runs and an arm one run too long both break SIZES", names(g1).includes("SIZES") && names(g2).includes("SIZES"));
}
sec("9. REPORT");
{
    const au = mkAu({ ...consts([0.02, 0.04, 0.06, 0.08, 0.09, 0.01, 0.03, 0.05], [5.1, 5.2, 5.3, 5.4, 5.6, 5.45, 5.9, 6.5]), ...nets28(0.1, 6, 0.05), "sched*1": { gain: 0.06, lit: 0.01, kw: 5.4, litKw: 5.9 }, "thr+0.3": { gain: 0.3, lit: 0.1, kw: 5.3, litKw: 5.7 } }), L = X.report(au), t = L.join("\n");
    ok("!! the head names the ids, the seconds and 'read once'; the nine checks pass first", /^ROUND H15: .* Ids 1-40 \(40\), 60 s, dark and lit; read once$/.test(L[0]) && L.slice(1, 10).every((l) => /^  PASS /.test(l)) && /^means /.test(L[10]));
    const row = (a) => t.split("\n").find((l) => l.startsWith("  " + a.padEnd(20) + " "));
    ok("!! the means table prints each of the 44 arms' dark and lit score and dark and lit mean power (thr+0.3 5.30 and 5.70; the networks 6.00)", X.ARM_IDS.every((a) => !!row(a)) && /^  thr\+0\.3 +\d\.\d{4} \/ \d\.\d{4} +5\.30 +5\.70$/.test(row("thr+0.3")) && /^  base-1 +\d\.\d{4} \/ \d\.\d{4} +6\.00 +6\.00$/.test(row("base-1")) && row("thr+0.3").includes(`${X.meanOf(au, "thr+0.3", "dark").toFixed(4)} / ${X.meanOf(au, "thr+0.3", "lit").toFixed(4)}`) && X.meanOf(au, "thr+0.3", "dark").toFixed(4) !== X.meanOf(au, "thr+0.3", "lit").toFixed(4));
    const perArm = t.split("\n").filter((l) => /\|/.test(l));
    ok("!! the per-arm table has a row for each of the 43 arms after the autopilot with its dark gain, extra kW and efficiency, a bar, and the lit three (sched*1 dark +0.06 at +0.40, lit +0.01 at +0.90)", perArm.length === 43 && X.ARM_IDS.slice(1).every((a) => perArm.some((l) => l.startsWith("  " + a.padEnd(20) + " "))) && /^  sched\*1 +\+0\.06\d\d \+0\.400 +0\.\d{3}  \|  \+0\.01\d\d \+0\.900 +0\.\d{3}$/.test(perArm.find((l) => l.startsWith("  sched*1 "))) && perArm.find((l) => l.startsWith("  sched*1 ")).endsWith(`${X.efficiencyOf(au, "sched*1", "lit").toFixed(3)}`) && X.efficiencyOf(au, "sched*1", "lit").toFixed(3) !== X.efficiencyOf(au, "sched*1").toFixed(3), perArm.find((l) => l.startsWith("  sched*1 ")));
    ok("!! a gain block (dark, lit) for thr+0 and each of the six scheduled arms (seven), none for the autopilot or the networks; the lit line reads the LIT gain (sched*1: dark +0.06, lit +0.01)", ["thr+0", ...X.SCHEDULED_IDS].every((a) => new RegExp("\\n" + a.replace(/[*+]/g, "\\$&") + ":\\n   dark [+-]\\d\\.\\d{4} \\(se [\\d.]+; better \\d+, worse \\d+, same \\d+\\) \\w+\\n   lit  ").test(t)) && !/\nautopilot:\n/.test(t) && !/\nbase-0:\n/.test(t) && /\nsched\*1:\n   dark \+0\.06\d\d .*\n   lit  \+0\.01\d\d /.test(t));
    ok("!! the seven bottom lines come last, each prefixed BOTTOM LINE:", L.slice(-7).every((l) => l.startsWith("BOTTOM LINE: ")) && /^BOTTOM LINE: LEARNED/.test(L[L.length - 7]) && /VERDICT: /.test(L[L.length - 2]) && /LOST SUBS/.test(L[L.length - 1]));
    const bad = mkAu({}); bad.dark.autopilot.pop(); const Lb = X.report(bad);
    ok("!! a failed check says the verdicts are NOT WEIGHED, with one bottom line and no table", Lb.some((l) => /^  FAIL SIZES/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && !Lb.some((l) => /^means/.test(l)));
}
sec("10. SOURCE");
{
    ok("!! the ids 15000 and 15199 appear once each; no clock, no random number, nothing read from the disk", code.split("15000").length === 2 && code.split("15199").length === 2 && !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
