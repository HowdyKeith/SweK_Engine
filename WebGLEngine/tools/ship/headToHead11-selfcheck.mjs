// WebGLEngine/tools/ship/headToHead11-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/headToHead11-selfcheck.mjs      (about 20 s: hand fixtures and one short real audit of all 262 arms)
//
// THE GATE OF tools/ship/headToHead11.mjs (Round H11 of brain/HEAD_TO_HEAD.md, registered first: the channel transplant).
//   1 SETS      the ids 11000-11199 (disjoint from every earlier round's), 160 s, the four channels, the two modes, the 262 arms and their order, the registered constants.
//   2 KIND      the tank kind of a mode and a channel: the `-` pilot is the network with that channel the autopilot's, the `+` pilot the autopilot with that channel the network's, on a real state; the four `-` channels together are the autopilot, the four `+` together the network; refusals.
//   3 BOARD     the board holds the 262 arms with the right kinds and weights (copies); boardOf's refusals; audit's subset, its refusal of an unknown arm.
//   4 STATS     necessity, sufficiency, the largest channel and the registered verdict in every branch (NOT ASSESSED, IN THE <C> CHANNEL, NEEDS ... NOT ENOUGH ALONE, SPREAD) at the boundaries 0.5 and 0.02; the readings.
//   5 LINES     the seven bottom lines in their cases; lost subs.
//   6 CHECKS    sizes, ids aligned, scores inside (0, 1), the networks, the hand transplants, the transplants change the flight, the networks distinct; a failed check says NOT WEIGHED.
//   7 REPORT    the channel table, the per-network table, the pooled transplant differences, the lines last.
//   8 FLIGHT    one real short audit of ALL 262 arms (ids 0-1, 30 s): hand/-c and hand/+c fly exactly as the autopilot, a transplant of a real network changes its flight, deterministic, the checks pass.
//   9 SOURCE    the ids appear once; no clock, random or file.
// SABOTAGE LOG (103 mutants of tools/ship/headToHead11.mjs, each alone in its own worktree copy): 90 went red by name on the first pass. 13 did not: 12 went 0 red and one pattern (the plain arm's weight copy) matched nothing and was re-aimed. Six got a row and went red: necessity and sufficiency swapped in the bottom lines (the first fixture had the two equal), the mean gain read from the first network (all gains equal), the autopilot's lost subs read from `hand` (both lost in the fixture), the seconds dropped from the audit's flight (20 s and 30 s audits), and the weights not copied into the plain arm.
//   Seven are EQUIVALENT and declared: `>` against `>=` in the largest channel at a tie of floats, `<` against `<=` at a mean gain of exactly 0.02, `>` against `>=` at a necessity or sufficiency of exactly 0.5 (three mutants; the rows test 0.499 and 0.501), the hand arm's weights read from a lookup that finds nothing (the same hand weights), and the existence guard of the changed-flight check read from the `+` arms (the values compared are the `-` arms').
// NOT CHECKED, said plainly: that a mixed pilot (one channel from the network, three from the autopilot) is a pilot the network was ever trained to be (it is not: the transplant measures what the channel does in a body the rest of which is the other pilot's, and the two pilots' commands are not independent), and the lit tank (not flown).
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
import * as X from "./headToHead11.mjs";
import * as H9 from "./headToHead9.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as AS from "../../brain/autopilotSub.mjs";
import * as S from "../../physics/mechanics/subModel6dof.mjs";
import * as T from "../../brain/subTask.mjs";
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const src = fs.readFileSync(new URL("./headToHead11.mjs", import.meta.url), "utf8"), code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
console.log("headToHead11-selfcheck -- Round H11\n");
const W = (f = () => 0) => Array.from({ length: 963 }, (_, i) => f(i));
const wip = JSON.parse(fs.readFileSync(new URL("../../brain/pilotSubWeightsWip.json", import.meta.url), "utf8")).weights;
const netsOf = (f = (id, i) => 0.001 * ((i * 7) % 5)) => new Map(X.NET_IDS.map((id, k) => [id, W((i) => f(id, i) + 0.0001 * k)]));
const scaled = () => new Map(X.NET_IDS.map((id, k) => [id, wip.map((v, i) => v * (1 + 0.01 * (k + 1)) + (i >= 510 && i < 823 ? 0.003 * ((i * 13 + k) % 7 - 3) : 0))]));

sec("1. SETS");
{
    ok("!! ids 11000-11199 (200), 160 s: not H1's 2000, H2's 3000, H4's 4000, H5's 5000, H6's 6000, H7's 7000, H8's 8000, H9's 9000, H10's 10000, not the gates' 0-14", X.IDS.from === 11000 && X.IDS.to === 11199 && X.SECONDS === 160 && Object.isFrozen(X.IDS));
    ok("!! the four channels in the pilot's own order (pitch, yaw, thrust, ballast), the two modes (- and +); the registered constants: learn margin 0.02, necessity and sufficiency 0.5; frozen", J(X.CHANNELS) === J(["pitch", "yaw", "thrust", "ballast"]) && J(X.MODES) === J(["-", "+"]) && X.LEARN_MARGIN === 0.02 && X.NEED_MIN === 0.5 && X.SUFF_MIN === 0.5 && Object.isFrozen(X.CHANNELS) && Object.isFrozen(X.MODES) && J(X.CHANNELS) === J(PS.OUTPUT_NAMES));
    ok("!! 262 arms: the autopilot then for `hand` and each of the 28 networks (the H9 ids, in that order) the intact arm, four `-c` and four `+c` (pitch, yaw, thrust, ballast), frozen; armId is <id>/<mode><channel>", X.ARM_IDS.length === 262 && X.ARM_IDS[0] === "autopilot" && X.ARM_IDS[1] === "hand" && X.ARM_IDS[2] === "hand/-pitch" && X.ARM_IDS[5] === "hand/-ballast" && X.ARM_IDS[6] === "hand/+pitch" && X.ARM_IDS[9] === "hand/+ballast" && X.ARM_IDS[10] === "network-Wip" && X.ARM_IDS[11] === "network-Wip/-pitch" && X.ARM_IDS[261] === "robust-9/+ballast" && J(X.NET_IDS) === J(H9.NET_IDS) && X.NET_IDS.length === 28 && X.armId("base-3", "-", "yaw") === "base-3/-yaw" && X.armId("hand", "+", "thrust") === "hand/+thrust" && Object.isFrozen(X.ARM_IDS) && new Set(X.ARM_IDS).size === 262);
}
sec("2. KIND");
{
    const sc = T.scenario(3, "nominal"), st = S.createState({ ...sc.start, model: AS.defaultModel() }), at = S.attitude(st), tgt = { depth: -st.pos[2] + 0.2, heading: at.heading + 0.05, speed: at.speed + 0.1 }, cur = [0.1, -0.05, 0];   // a near-trim state: the autopilot is unsaturated on every channel
    const w = wip.map((v, i) => v * 1.04 + (i % 11 === 0 ? 0.004 : 0)), net = PS.pilotFor(Float32Array.from(w))(st, tgt, cur), ap = AS.pilot()(st, tgt, cur);
    ok("!! the fixture's network and the autopilot disagree on every channel on this state (so a transplant of any channel is visible)", X.CHANNELS.every((c) => Math.abs(net[c] - ap[c]) > 1e-4), J(net) + " " + J(ap));
    const minus = (c) => X.kindOf("-", c).build(w)(st, tgt, cur), plus = (c) => X.kindOf("+", c).build(w)(st, tgt, cur);
    ok("!! the `-c` pilot is the NETWORK with channel c the AUTOPILOT's: on the real state channel c equals the autopilot's and the three others the network's, for each of the four channels", X.CHANNELS.every((c) => { const o = minus(c); return X.CHANNELS.every((k) => (k === c ? o[k] === ap[k] : o[k] === net[k])); }));
    ok("!! the `+c` pilot is the AUTOPILOT with channel c the NETWORK's: channel c equals the network's and the three others the autopilot's, for each of the four channels", X.CHANNELS.every((c) => { const o = plus(c); return X.CHANNELS.every((k) => (k === c ? o[k] === net[k] : o[k] === ap[k])); }));
    ok("!! the four `-c` pilots taken channel by channel together are the AUTOPILOT's command (a network with all four commands replaced is the autopilot) and the four `+c` the NETWORK's", X.CHANNELS.every((c) => minus(c)[c] === ap[c] && plus(c)[c] === net[c]) && J(X.CHANNELS.map((c) => minus(c)[c])) === J(X.CHANNELS.map((c) => ap[c])) && J(X.CHANNELS.map((c) => plus(c)[c])) === J(X.CHANNELS.map((c) => net[c])));
    const hw = Array.from(PS.handWeights()), ho = X.kindOf("-", "yaw").build(hw)(st, tgt, cur);
    ok("!! with the hand weights (the autopilot written through the network, to float32) every transplant is the autopilot to within 1e-5 on the real state", X.CHANNELS.every((c) => ["-", "+"].every((m) => { const o = X.kindOf(m, c).build(hw)(st, tgt, cur); return X.CHANNELS.every((k) => near(o[k], ap[k], 1e-5)); })) && near(ho.pitch, ap.pitch, 1e-5));
    const k = X.kindOf("+", "thrust");
    ok("!! a kind is named h11<mode>-<channel> (h11--yaw, h11+-thrust... as the circuit string), takes 963 weights, does not persist, builds a function; the pilot passes its arguments (state, target, current) to both pilots and ignores a fourth", X.kindOf("-", "yaw").circuit === "h11--yaw" && k.circuit === "h11+-thrust" && k.weightCount === 963 && k.persist === false && typeof k.build(w) === "function" && Object.isFrozen(k) && J(k.build(w)(st, tgt, cur, { compassValid: 0 })) === J(plus("thrust")) && /^H11/.test(k.label));
    ok("!! kindOf refuses a mode that is not - or + and a channel it does not know, naming it", /mode must be "-" or "\+", got "x"/.test(thr(() => X.kindOf("x", "yaw"))) && /channel must be one of pitch, yaw, thrust, ballast, got "roll"/.test(thr(() => X.kindOf("-", "roll"))) && /mode must be/.test(thr(() => X.kindOf(null, "yaw"))));
}
sec("3. BOARD");
{
    const nets = netsOf(), b = X.boardOf(nets);
    ok("!! the board holds the dropout task and the 262 arms; every arm but the autopilot controls the autopilot alone", b.tasks.size === 1 && b.tasks.has("dropout") && b.arms.size === 262 && X.ARM_IDS.every((a) => b.arms.has(a)) && X.ARM_IDS.filter((a) => a !== "autopilot").every((a) => J(b.arms.get(a).controls) === '["autopilot"]'));
    const e = b.arms.get("base-3").entry(), em = b.arms.get("base-3/-ballast").entry(), ep = b.arms.get("base-3/+yaw").entry(), eh = b.arms.get("hand/-pitch").entry();
    ok("!! an intact arm is the gfc network with the network's weights (a copy); a `-c` or `+c` arm carries the same weights (a copy) under its own circuit (h11--ballast, h11+-yaw); `hand` arms carry the hand weights", e.circuit === "gfc" && J(e.weights) === J(nets.get("base-3")) && e.weights !== nets.get("base-3") && em.circuit === "h11--ballast" && ep.circuit === "h11+-yaw" && J(em.weights) === J(nets.get("base-3")) && J(ep.weights) === J(nets.get("base-3")) && em.weights !== nets.get("base-3") && J(eh.weights) === J(Array.from(PS.handWeights())) && eh.circuit === "h11--pitch" && e.pilot === "network");
    ok("!! a transplant arm registers its kind on a tank, and an intact arm registers nothing (it flies the built-in circuit)", (() => { const seen = []; b.arms.get("robust-2/-thrust").register({ registerPilotKind: (c, kd) => seen.push([c, kd.weightCount, kd.circuit]) }); return J(seen) === J([["h11--thrust", 963, "h11--thrust"]]) && b.arms.get("robust-2").register === undefined && b.arms.get("autopilot").register === undefined; })());
    const miss = netsOf(); miss.delete("robust-6"); const short = netsOf(); short.set("base-1", W().slice(1)); const long = netsOf(); long.set("network-Wip", [...W(), 0]); const obj = Object.fromEntries(netsOf());
    ok("!! boardOf refuses a missing network, a 962-weight and a 964-weight network and null, naming each; it takes a plain object as well as a Map", /no network robust-6/.test(thr(() => X.boardOf(miss))) && /network base-1 must be an array of 963/.test(thr(() => X.boardOf(short))) && /network network-Wip must be an array of 963/.test(thr(() => X.boardOf(long))) && /no network network-Wip/.test(thr(() => X.boardOf(null))) && X.boardOf(obj).arms.size === 262);
    ok("!! audit refuses an arm that does not exist, naming it", /no arm network-Wip\/-roll/.test(thr(() => X.audit(nets, { range: { from: 0, to: 0 }, seconds: 5, arms: ["network-Wip/-roll"] }))));
}
// a synthetic audit: n ids, per arm a score list; spec[arm] = a gain (a number added to the base, with an alternating +-0.02 noise that has mean 0) or { gain, lost }
const N = 40, base = Array.from({ length: N }, (_, i) => 0.6 + 0.02 * Math.sin(i)), wob = (i, a) => (i % 2 ? a : -a);
const mkAu = (spec = {}, n = N, nets = netsOf()) => {
    const au = { dark: {}, range: { from: 1, to: n }, seconds: 60, nets };
    for (const a of X.ARM_IDS) {
        const s = spec[a], g = typeof s === "number" ? s : s && s.gain !== undefined ? s.gain : 0, lost = !!(s && s.lost);
        au.dark[a] = Array.from({ length: n }, (_, i) => ({ key: "sb-" + (i + 1), score: base[i % N] + g + wob(i, 0.02) + (a === "autopilot" || a.startsWith("hand") ? 0 : (i % 2 ? 1 : -1) * 0.0001 * X.ARM_IDS.indexOf(a)), bad: lost && i < 2 }));
    }
    return au;
};
// every network gains G; for channel c the `-c` transplants gain T and the `+c` gain S
const chan = (c, T0, S0, nets = X.NET_IDS) => Object.fromEntries(nets.flatMap((id) => [[X.armId(id, "-", c), T0], [X.armId(id, "+", c), S0]]));
const allNets = (G, over = {}) => ({ ...Object.fromEntries(X.NET_IDS.map((id) => [id, G])), ...Object.fromEntries(X.NET_IDS.flatMap((id) => X.CHANNELS.flatMap((c) => [[X.armId(id, "-", c), G], [X.armId(id, "+", c), 0]]))), ...over });
sec("4. STATS");
{
    const v = (spec) => X.verdictOf(mkAu(spec));
    const yaw = (T0, S0) => allNets(0.1, chan("yaw", T0, S0));
    ok("!! gainsOf lists the 28 intact gains in network order; learnedCount counts those over 0.02 (0.0199 does not, 0.0201 does)", (() => { const au = mkAu(allNets(0.1)); return X.gainsOf(au).length === 28 && X.gainsOf(au).every((g) => near(g, 0.1, 2e-3)) && X.learnedCount(au) === 28 && X.learnedCount(mkAu(allNets(0.0199))) === 0 && X.learnedCount(mkAu(allNets(0.0201))) === 28; })());
    ok("!! necessity of a channel is the share of the mean intact gain lost: intact 0.1, yaw transplants 0.04 give 0.6; sufficiency is the mean `+c` gain over the mean intact gain: 0.06 gives 0.6; the other channels (transplants 0.1, `+` 0) give 0 and 0", (() => { const au = mkAu(yaw(0.04, 0.06)); return near(X.necessity(au, "yaw"), 0.6, 1e-3) && near(X.sufficiency(au, "yaw"), 0.6, 1e-3) && near(X.necessity(au, "pitch"), 0, 1e-3) && near(X.sufficiency(au, "thrust"), 0, 1e-3) && near(X.necessity(au, "ballast"), 0, 1e-3); })());
    ok("!! the largest channel is the one with the largest NECESSITY (not sufficiency), the first of a tie: pitch at 0.2, thrust at 0.7 and ballast at 0.4 give thrust; all equal gives pitch", X.largest(mkAu(allNets(0.1, { ...chan("pitch", 0.08, 0.1), ...chan("thrust", 0.03, 0), ...chan("ballast", 0.06, 0.1) }))) === "thrust" && X.largest(mkAu(allNets(0.1))) === "pitch" && X.largest(mkAu(allNets(0.1, chan("ballast", 0.01, 0)))) === "ballast");
    ok("!! the verdict IN THE <C> CHANNEL when the largest channel is both necessary (0.6) and sufficient (0.6): yaw, and the name follows the channel (THRUST, PITCH, BALLAST)", v(yaw(0.04, 0.06)) === "THE GAIN IS IN THE YAW CHANNEL" && v(allNets(0.1, chan("thrust", 0.04, 0.06))) === "THE GAIN IS IN THE THRUST CHANNEL" && v(allNets(0.1, chan("pitch", 0.04, 0.06))) === "THE GAIN IS IN THE PITCH CHANNEL" && v(allNets(0.1, chan("ballast", 0.04, 0.06))) === "THE GAIN IS IN THE BALLAST CHANNEL");
    ok("!! necessary but not sufficient: THE GAIN NEEDS THE YAW CHANNEL BUT IT IS NOT ENOUGH ALONE (sufficiency 0.1)", v(yaw(0.04, 0.01)) === "THE GAIN NEEDS THE YAW CHANNEL BUT IT IS NOT ENOUGH ALONE");
    ok("!! no channel necessary (every transplant keeps the gain): THE GAIN IS SPREAD ACROSS THE CHANNELS, even when a `+c` gives all of it", v(allNets(0.1)) === "THE GAIN IS SPREAD ACROSS THE CHANNELS" && v(yaw(0.08, 0.1)) === "THE GAIN IS SPREAD ACROSS THE CHANNELS");
    ok("!! the necessity boundary is 0.5: a transplant gain of 0.0501 (necessity 0.499) is SPREAD, 0.0499 (0.501) needs the channel", v(yaw(0.0501, 0.1)) === "THE GAIN IS SPREAD ACROSS THE CHANNELS" && v(yaw(0.0499, 0.01)) === "THE GAIN NEEDS THE YAW CHANNEL BUT IT IS NOT ENOUGH ALONE");
    ok("!! the sufficiency boundary is 0.5: a `+c` gain of 0.0499 (0.499) is NOT ENOUGH ALONE, 0.0501 (0.501) is IN THE CHANNEL", v(yaw(0.04, 0.0499)) === "THE GAIN NEEDS THE YAW CHANNEL BUT IT IS NOT ENOUGH ALONE" && v(yaw(0.04, 0.0501)) === "THE GAIN IS IN THE YAW CHANNEL");
    ok("!! the sufficiency read is of the LARGEST channel only: a channel that is sufficient but not necessary does not make the verdict; pitch sufficient (1.0) and yaw necessary and not sufficient give NEEDS THE YAW CHANNEL", v(allNets(0.1, { ...chan("yaw", 0.04, 0.0), ...chan("pitch", 0.1, 0.1) })) === "THE GAIN NEEDS THE YAW CHANNEL BUT IT IS NOT ENOUGH ALONE");
    ok("!! networks with a mean gain of 0.0199 or less: NOT ASSESSED: THE NETWORKS DID NOT GAIN whatever the transplants do; 0.0201 is read", v(allNets(0.0199, chan("yaw", 0, 0.0199))) === "NOT ASSESSED: THE NETWORKS DID NOT GAIN" && v(allNets(0.0201, chan("yaw", 0, 0.0201))) === "THE GAIN IS IN THE YAW CHANNEL" && v(allNets(0.0, chan("yaw", 0, 0))) === "NOT ASSESSED: THE NETWORKS DID NOT GAIN");
    { const au = mkAu({ "network-Wip": 0.3, "network-Wip/-yaw": 0.1, "network-Actuators": 0.3, "network-Actuators/-yaw": 0.3 });
      const d = X.pairOf(au, "network-Wip", "autopilot"), back = X.pairOf(au, "autopilot", "network-Wip");
      ok("!! pairOf is a minus b in the dark: +0.3 over the autopilot reads about +0.3 BETTER, the autopilot against it -0.3 WORSE; gainOf is that mean; transplantGains lists the 28 gains of a mode and channel", d.reading === "BETTER" && near(d.mean, 0.3, 2e-3) && back.reading === "WORSE" && near(back.mean, -0.3, 2e-3) && X.gainOf(au, "network-Wip") === d.mean && X.transplantGains(au, "-", "yaw").length === 28 && near(X.transplantGains(au, "-", "yaw")[0], 0.1, 2e-3) && near(X.transplantGains(au, "-", "yaw")[1], 0.3, 2e-3) && near(X.transplantGains(au, "+", "yaw")[0], 0, 2e-3), `${d.mean.toFixed(4)}`);
      const m = au.dark["network-Wip"].reduce((x, r) => x + r.score, 0) / 40;
      const r = X.readings(au, "-", "yaw");
      ok("!! meanOf is an arm's mean score; readings counts the 28 transplants of a mode and channel against their own intact network: Wip's -yaw (0.2 below) reads WORSE, Actuators' (equal) TIES, and the other 26 (0 against 0) TIES", near(X.meanOf(au, "network-Wip"), m, 1e-12) && r.worse === 1 && r.ties === 27 && r.better === 0); }
    ok("!! readings counts BETTER too: a transplant 0.2 above its network reads BETTER; the `+` mode is read when asked for", (() => { const au = mkAu({ "base-2": 0.1, "base-2/+pitch": 0.3 }); return X.readings(au, "-", "pitch").better === 0 && X.readings(au, "+", "pitch").better === 1 && X.readings(au, "+", "pitch").worse === 0 + (27 - 27) + 0 || X.readings(au, "+", "pitch").better === 1; })());
}
sec("5. LINES");
{
    const L = (spec) => X.bottomLines(mkAu(spec)), a = L(allNets(0.1, chan("yaw", 0.03, 0.06)));
    ok("!! a yaw verdict: line 1 LEARNED 28 and the mean gain, line 2 the four necessities (yaw 0.70, the rest 0.00), line 3 the sufficiencies (yaw 0.60: not the same number), line 4 the readings of the `-` transplants (yaw: 0 better, 0 ties, 28 worse), line 5 the largest, line 6 IN THE YAW CHANNEL, line 7 zero lost", a.length === 7 && /^LEARNED: 28 OF 28 INTACT NETWORKS BEAT THE AUTOPILOT BY MORE THAN 0\.02; MEAN GAIN \+0\.1000$/.test(a[0]) && a[1].replace(/-0\.00/g, "0.00") === "NECESSITY (share of the gain lost when the channel is the autopilot's): pitch 0.00, yaw 0.70, thrust 0.00, ballast 0.00" && a[2].replace(/-0\.00/g, "0.00") === "SUFFICIENCY (share of the gain the autopilot gains from the network's channel alone): pitch 0.00, yaw 0.60, thrust 0.00, ballast 0.00" && a[3] === "TRANSPLANTS READ, OF 28 (better / ties / worse than the intact network): pitch 0/28/0, yaw 0/0/28, thrust 0/28/0, ballast 0/28/0" && a[4] === "THE LARGEST: yaw N 0.70 S 0.60" && a[5] === "VERDICT: THE GAIN IS IN THE YAW CHANNEL" && a[6] === "LOST SUBS: autopilot 0, intact 0, transplants 0 (0 in the worst)", J(a));
    const b = L(allNets(0.1))[5], c = L(allNets(0.0, chan("yaw", 0, 0)))[5];
    ok("!! the spread case and the not-assessed case end line 6 as registered", b === "VERDICT: THE GAIN IS SPREAD ACROSS THE CHANNELS" && c === "VERDICT: NOT ASSESSED: THE NETWORKS DID NOT GAIN");
    const d = L({ ...allNets(0.1), "network-Wip/-pitch": 0.3, "base-1/-pitch": 0.3, "base-2/-pitch": 0.0 })[3];
    ok("!! line 4 counts better / ties / worse per channel from the `-` transplants only: two pitch transplants above their networks, one below (0 against 0.1), 25 level", d === "TRANSPLANTS READ, OF 28 (better / ties / worse than the intact network): pitch 2/25/1, yaw 0/28/0, thrust 0/28/0, ballast 0/28/0", d);
    const l = L({ autopilot: { lost: true }, "network-Wip": { gain: 0.1, lost: true }, "base-3/-yaw": { gain: 0.1, lost: true }, "base-3/+yaw": { gain: 0, lost: true }, hand: { lost: true }, "hand/-pitch": { lost: true } })[6];
    ok("!! lost subs: autopilot 2, intact networks 2, transplants of the networks 4 (two arms of two ids) with 2 in the worst; the hand arms are in none of the totals", l === "LOST SUBS: autopilot 2, intact 2, transplants 4 (2 in the worst)", l);
    ok("!! line 1's mean gain is the MEAN of the 28 intact gains: 27 networks at 0.1 and one at 0.3 give +0.1071 (not the first network's +0.1000 and not the last's)", /MEAN GAIN \+0\.1071$/.test(L(allNets(0.1, Object.fromEntries(["", ...X.CHANNELS.map((c) => "/-" + c)].map((suf) => ["network-Wip" + suf, 0.3]))))[0]) && /MEAN GAIN \+0\.1071$/.test(L(allNets(0.1, Object.fromEntries(["", ...X.CHANNELS.map((c) => "/-" + c)].map((suf) => ["robust-9" + suf, 0.3]))))[0]));
    ok("!! the autopilot's lost subs are the AUTOPILOT's: a lost `hand` and nothing else gives autopilot 0, a lost autopilot alone gives autopilot 2", L({ hand: { lost: true } })[6] === "LOST SUBS: autopilot 0, intact 0, transplants 0 (0 in the worst)" && L({ autopilot: { lost: true } })[6] === "LOST SUBS: autopilot 2, intact 0, transplants 0 (0 in the worst)");
    ok("!! line 5 names the channel of the largest NECESSITY with its two shares: ballast at necessity 0.9 and sufficiency 0.2", L(allNets(0.1, chan("ballast", 0.01, 0.02)))[4] === "THE LARGEST: ballast N 0.90 S 0.20");
}
sec("6. CHECKS");
{
    const names = (au) => X.checksOf(au).filter((c) => !c.ok).map((c) => c.name), good = () => mkAu(allNets(0.1, chan("yaw", 0.04, 0.06)));
    ok("!! seven check rows on a clean audit, all passing", J(X.checksOf(good()).map((c) => c.name)) === J(["SIZES", "IDS ALIGNED", "SCORES INSIDE (0, 1)", "NETWORKS", "HAND TRANSPLANTS ARE THE AUTOPILOT", "TRANSPLANTS CHANGE THE FLIGHT", "NETWORKS DISTINCT"]) && names(good()).length === 0);
    const a1 = good(); a1.dark["base-4/+ballast"].pop(); const a2 = good(); a2.dark["robust-3/-pitch"][3].key = "x"; const a3 = good(); a3.dark.autopilot[0].score = 1.0; const a4 = good(); a4.dark["base-0/-thrust"][5].score = 0;
    ok("!! a short arm breaks SIZES, a different id IDS ALIGNED, a score of 1 or of 0 SCORES INSIDE", names(a1).includes("SIZES") && names(a2).includes("IDS ALIGNED") && names(a3).includes("SCORES INSIDE (0, 1)") && names(a4).includes("SCORES INSIDE (0, 1)"));
    const b1 = good(); b1.nets.get("base-1").pop(); const b2 = good(); b2.nets.get("base-2")[10] = NaN; const b3 = good(); b3.nets.delete("robust-4"); const b4 = good(); b4.nets = null; const b5 = good(); b5.nets.get("base-5").push(0); const b6 = good(); b6.nets.get("base-6")[20] = Infinity;
    ok("!! a 962-weight or 964-weight network, a NaN weight, an infinite weight, a missing network and no weights break NETWORKS", [b1, b2, b3, b4, b5, b6].every((a) => names(a).includes("NETWORKS")));
    const c1 = good(); c1.dark["hand/-yaw"][5].score += 1e-6; const c2 = good(); c2.dark["hand/+ballast"][7].score += 1e-6; const c3 = good(); c3.dark["hand/-yaw"][5].score += 1e-10; const c4 = good(); delete c4.dark["hand/-thrust"];
    ok("!! a hand transplant off the autopilot by 1e-6 (a `-` arm or a `+` arm) or missing breaks HAND TRANSPLANTS ARE THE AUTOPILOT; 1e-10 is inside the tolerance", names(c1).includes("HAND TRANSPLANTS ARE THE AUTOPILOT") && names(c2).includes("HAND TRANSPLANTS ARE THE AUTOPILOT") && names(c4).includes("HAND TRANSPLANTS ARE THE AUTOPILOT") && !names(c3).includes("HAND TRANSPLANTS ARE THE AUTOPILOT"));
    const ident = (k) => { const au = mkAu(allNets(0.1)); for (const id of X.NET_IDS.slice(0, k)) for (const c of X.CHANNELS) au.dark[X.armId(id, "-", c)] = au.dark[id].map((r) => ({ ...r })); return au; };
    ok("!! a transplant that changes the flight of no network breaks TRANSPLANTS CHANGE THE FLIGHT; with 8 networks whose four transplants all fly as the network (20 left) it holds, with 9 (19 left) it breaks; only `-` transplants are counted", names(mkAu(allNets(0.1), N)).length >= 0 && (() => { const au0 = mkAu(allNets(0.1)); for (const id of X.NET_IDS) for (const c of X.CHANNELS) au0.dark[X.armId(id, "-", c)] = au0.dark[id].map((r) => ({ ...r })); return names(au0).includes("TRANSPLANTS CHANGE THE FLIGHT"); })() && !names(ident(8)).includes("TRANSPLANTS CHANGE THE FLIGHT") && names(ident(9)).includes("TRANSPLANTS CHANGE THE FLIGHT"));
    ok("!! one changed channel is enough for a network to count: a network whose pitch, yaw and thrust transplants equal it and whose ballast transplant differs counts as changed", (() => { const au = mkAu(allNets(0.1)); for (const id of X.NET_IDS) for (const c of ["pitch", "yaw", "thrust"]) au.dark[X.armId(id, "-", c)] = au.dark[id].map((r) => ({ ...r })); return !names(au).includes("TRANSPLANTS CHANGE THE FLIGHT"); })());
    const d1 = good(); d1.dark["base-5"] = d1.dark["base-4"].map((r) => ({ ...r })); const d2 = good(); d2.dark["base-5/-yaw"] = d2.dark["base-5"].map((r) => ({ ...r }));
    ok("!! two identical intact networks break NETWORKS DISTINCT; a transplant identical to its network does not (the row is the 28 intact ones)", names(d1).includes("NETWORKS DISTINCT") && !names(d2).includes("NETWORKS DISTINCT"));
    const e1 = good(); e1.range = { from: 1, to: 41 }; const e2 = good(); e2.dark.hand.push({ key: "sb-41", score: 0.5, bad: false });
    ok("!! a 41-id range with 40 runs and an arm one run too long both break SIZES", names(e1).includes("SIZES") && names(e2).includes("SIZES"));
}
sec("7. REPORT");
{
    const au = mkAu(allNets(0.1, chan("yaw", 0.04, 0.06))), L = X.report(au), t = L.join("\n");
    ok("!! the head names the ids, the seconds, the dark tank and 'read once'; the seven checks pass first", /^ROUND H11: .* Ids 1-40 \(40\), 60 s, the dark tank; read once$/.test(L[0]) && L.slice(1, 8).every((l) => /^  PASS /.test(l)));
    ok("!! the channel table gives the intact mean gain and, per channel, the mean `-` and `+` gain over the 28 networks (yaw - +0.0400, + +0.0600; pitch - +0.1000, + +0.0000)", /^  intact \+0\.1000$/m.test(t) && /^  yaw      - \+0\.0400   \+ \+0\.0600$/m.test(t) && /^  pitch    - \+0\.1000   \+ \+0\.0000$/m.test(t));
    ok("!! a row per network (28) with its intact gain and the eight transplant gains in channel order", X.NET_IDS.every((id) => new RegExp("^  " + id.padEnd(20) + " \\+0\\.1000  -: .*  \\+: ", "m").test(t)) && /^  network-Wip +\+0\.1000  -: \+0\.1000 \+0\.0400 \+0\.1000 \+0\.1000  \+: \+0\.0000 \+0\.0600 \+0\.0000 \+0\.0000$/m.test(t));
    ok("!! the pooled transplant differences are listed for the eight mode-channel pairs (yaw `-` about -0.0600, yaw `+` about -0.0400)", /^  -yaw +-0\.0600$/m.test(t) && /^  \+yaw +-0\.0400$/m.test(t) && (t.match(/^  [-+](pitch|yaw|thrust|ballast) /gm) || []).length === 8);
    ok("!! the seven bottom lines come last, each prefixed BOTTOM LINE:", L.slice(-7).every((l) => l.startsWith("BOTTOM LINE: ")) && /^BOTTOM LINE: LEARNED/.test(L[L.length - 7]) && /VERDICT: /.test(L[L.length - 2]) && /LOST SUBS/.test(L[L.length - 1]));
    const bad = mkAu({}); bad.dark.autopilot.pop(); const Lb = X.report(bad);
    ok("!! a failed check says the verdicts are NOT WEIGHED, with one bottom line and no table", Lb.some((l) => /^  FAIL SIZES/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1 && !/mean gain over/.test(Lb.join("\n")));
}
sec("8. FLIGHT");
{
    const nets = scaled(), opt = { range: { from: 0, to: 1 }, seconds: 30 }, a = X.audit(nets, opt), a2 = X.audit(nets, opt);
    ok("!! an audit flies all 262 arms on the ids and is deterministic (twice the same scores), and carries the weights handed in", Object.keys(a.dark).length === 262 && J(a.dark) === J(a2.dark) && a.dark.autopilot.length === 2 && a.nets === nets && a.range === opt.range);
    ok("!! on a REAL tank hand/-c and hand/+c fly exactly as the autopilot does for every channel (the transplant seam and the kind are the identity at the hand weights)", X.MODES.every((m) => X.CHANNELS.every((c) => a.dark[X.armId("hand", m, c)].every((r, i) => near(r.score, a.dark.autopilot[i].score, 1e-6)))) && a.dark.hand.every((r, i) => near(r.score, a.dark.autopilot[i].score, 1e-6)));
    ok("!! a transplant is SEATED through its tank kind on the real flights: for at least 20 of the 28 networks some `-c` flies differently from the intact network, and every intact network flies differently from the autopilot", X.NET_IDS.filter((id) => X.CHANNELS.some((c) => a.dark[X.armId(id, "-", c)].some((r, i) => r.score !== a.dark[id][i].score))).length >= 20 && X.NET_IDS.every((id) => a.dark[id].some((r, i) => r.score !== a.dark.autopilot[i].score)) && X.NET_IDS.some((id) => X.CHANNELS.some((c) => a.dark[X.armId(id, "+", c)].some((r, i) => r.score !== a.dark.autopilot[i].score))));
    ok("!! the seven checks pass on the real audit", X.checksOf(a).every((c) => c.ok), J(X.checksOf(a).filter((c) => !c.ok).map((c) => c.name)));
    { const s20 = X.audit(nets, { range: { from: 0, to: 0 }, seconds: 20, arms: ["hand"] }), s30 = X.audit(nets, { range: { from: 0, to: 0 }, seconds: 30, arms: ["hand"] });
      ok("!! the seconds reach the flight: 20 s and 30 s give different dark scores for the autopilot, and the audit keeps the seconds", s20.dark.autopilot[0].score !== s30.dark.autopilot[0].score && s20.seconds === 20 && s30.seconds === 30); }
    const sub = X.audit(nets, { range: { from: 0, to: 0 }, seconds: 30, arms: ["base-2/-yaw", "base-2/+pitch"] });
    ok("!! audit with a subset flies only those arms and always the autopilot (the command flies parts and merges them)", J(Object.keys(sub.dark).sort()) === J(["autopilot", "base-2/+pitch", "base-2/-yaw"]) && sub.dark["base-2/-yaw"].length === 1);
}
sec("9. SOURCE");
{
    ok("!! the ids 11000 and 11199 appear once each; no clock, no random number, nothing read from the disk", code.split("11000").length === 2 && code.split("11199").length === 2 && !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
