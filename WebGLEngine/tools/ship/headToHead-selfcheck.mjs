// WebGLEngine/tools/ship/headToHead-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/headToHead-selfcheck.mjs      (about 10 s: hand fixtures and one short real audit)
//
// THE GATE OF tools/ship/headToHead.mjs (Round H1 of brain/HEAD_TO_HEAD.md, registered first).
//   1 SETS      the ten arms, the eight network names, the ids 2000-2199 (disjoint from the smoke and gate ids 0-3 and from the other gates' ids), 160 s; boardOf's refusals and its controls (every network held to the autopilot and to the hand weights).
//   2 READINGS  a network's four readings (dark vs autopilot, dark vs hand, lit vs autopilot, dark-specific = dark gain minus lit gain per id) on synthetic audits, at 1.5 and 2.5 se.
//   3 LINES     the five bottom lines in all their cases; lost subs counted over both conditions.
//   4 CHECKS    sizes, ids aligned, scores inside (0, 1), the event reaches the flight, arms distinct; a failed check says NOT WEIGHED.
//   5 REPORT    the means table, the per-network blocks, the spread line and the lines last.
//   6 FLIGHT    one real short audit (ids 0-1, 60 s): the arms are the pilots they name (the autopilot, the hand weights, a trained file), deterministic.
//   7 SOURCE    the ids appear once; no clock, random or file.
// NOT CHECKED, said plainly: which network is best (that is the experiment).
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
import * as X from "./headToHead.mjs";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const src = fs.readFileSync(new URL("./headToHead.mjs", import.meta.url), "utf8"), code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
console.log("headToHead-selfcheck -- Round H1\n");
const W = () => Object.fromEntries(["hand", ...X.NETWORK_NAMES].map((n, k) => [n, Array.from({ length: 963 }, (_, i) => 0.05 * k * Math.sin(i))]));

sec("1. SETS");
{
    ok("!! ten arms in order: autopilot, network-hand, then the eight networks Wip, Actuators, Robust, RobustLong, RobustTail, RobustTail2, RobustWide, RobustNoisy; the lists are frozen", J(X.ARM_IDS) === J(["autopilot", "network-hand", "network-Wip", "network-Actuators", "network-Robust", "network-RobustLong", "network-RobustTail", "network-RobustTail2", "network-RobustWide", "network-RobustNoisy"]) && X.NETWORK_NAMES.length === 8 && Object.isFrozen(X.ARM_IDS) && Object.isFrozen(X.NETWORK_NAMES) && Object.isFrozen(X.IDS));
    ok("!! ids 2000-2199 (200), 160 s; none of the ids 0-3 the smoke run and the gates use", X.IDS.from === 2000 && X.IDS.to === 2199 && X.SECONDS === 160);
    const b = X.boardOf(W());
    ok("!! every trained network is held to the autopilot AND to network-hand; the hand weights to the autopilot only; the autopilot to nothing", X.NETWORK_NAMES.every((n) => J(b.arms.get("network-" + n).controls) === '["autopilot","network-hand"]') && J(b.arms.get("network-hand").controls) === '["autopilot"]' && b.arms.get("autopilot").controls.length === 0 && b.tasks.has("dropout") && !b.tasks.has("survey"));
    const w = W(); delete w.Robust; const w2 = W(); w2.hand = w2.hand.slice(1); const w3 = W(); w3.Wip = null;
    ok("!! boardOf refuses missing weights, weights of the wrong length and null, naming the arm", /weights\.Robust must be an array of 963/.test(thr(() => X.boardOf(w))) && /weights\.hand must be/.test(thr(() => X.boardOf(w2))) && /weights\.Wip must be/.test(thr(() => X.boardOf(w3))) && /weights\.hand must be/.test(thr(() => X.boardOf(null))));
}
// a synthetic audit: n ids, per arm and condition a score list
const N = 40, base = (c) => Array.from({ length: N }, (_, i) => 0.6 + 0.02 * Math.sin(i + (c === "lit" ? 1 : 0)));
const mkAu = (spec = {}, n = N) => {
    const au = { dark: {}, lit: {}, range: { from: 1, to: n }, seconds: 60 };
    for (const c of ["dark", "lit"]) for (const a of X.ARM_IDS) {
        const f = (spec[a] && spec[a][c]) || (() => 0), lost = (spec[a] && spec[a].lost) || [];
        au[c][a] = Array.from({ length: n }, (_, i) => ({ key: "sb-" + (i + 1), score: base(c)[i % N] + f(i) + (a === "autopilot" ? 0 : (i % 2 ? 1 : -1) * 0.0001 * X.ARM_IDS.indexOf(a)), bad: lost.includes(c) && i < 2 }));
    }
    return au;
};
const wob = (i, a) => (i % 2 ? a : -a);
sec("2. READINGS");
{
    const au = mkAu({ "network-Wip": { dark: (i) => 0.1 + wob(i, 0.02), lit: (i) => 0.1 + wob(i, 0.02) }, "network-Actuators": { dark: (i) => 0.1 + wob(i, 0.02), lit: () => 0 }, "network-Robust": { dark: (i) => -0.1 + wob(i, 0.02), lit: () => 0 } });
    const w = X.readingsOf(au, "Wip"), a = X.readingsOf(au, "Actuators"), r = X.readingsOf(au, "Robust");
    ok("!! a steady gain in both conditions: dark and lit gains BETTER (about +0.1), the dark-specific difference (dark gain minus lit gain) is about 0 and TIES", w.vsAuto.reading === "BETTER" && near(w.vsAuto.mean, 0.1, 1e-3) && w.litAuto.reading === "BETTER" && w.specific.reading === "TIES" && Math.abs(w.specific.mean) < 1e-9);
    ok("!! a gain in the dark only is dark-specific: Actuators dark +0.1, lit 0 -> specific BETTER (+0.1), lit gain TIES", a.vsAuto.reading === "BETTER" && a.litAuto.reading === "TIES" && a.specific.reading === "BETTER" && near(a.specific.mean, 0.1, 1e-6));
    ok("!! a loss reads WORSE against the autopilot and against the hand weights (the hand arm is level with the autopilot here), and its dark-specific difference is negative", r.vsAuto.reading === "WORSE" && r.vsHand.reading === "WORSE" && r.specific.reading === "WORSE" && r.specific.mean < 0);
    ok("!! vsHand is against network-hand, not the autopilot: raise the hand arm by +0.2 in the dark and Wip's gain over it falls from about +0.1 to about -0.1", (() => { const au2 = mkAu({ "network-Wip": { dark: (i) => 0.1 + wob(i, 0.02) }, "network-hand": { dark: (i) => 0.2 + wob(i, 0.02) } }); const x = X.readingsOf(au2, "Wip"); return x.vsAuto.reading === "BETTER" && x.vsHand.reading === "WORSE" && near(x.vsHand.mean, -0.1, 2e-3); })());
    const amp = 0.03, se = amp * Math.sqrt(N / (N - 1)) / Math.sqrt(N), g = (k) => X.readingsOf(mkAu({ "network-Wip": { dark: (i) => wob(i, amp) + k * se, lit: () => 0 } }), "Wip").vsAuto.reading;
    ok("!! 2 se on both sides in the dark: +2.5 se BETTER, +1.5 se TIES, -1.5 se TIES, -2.5 se WORSE", g(2.5) === "BETTER" && g(1.5) === "TIES" && g(-1.5) === "TIES" && g(-2.5) === "WORSE");
}
sec("3. LINES");
{
    const up = (names, d = 0.1) => Object.fromEntries(names.map((n) => ["network-" + n, { dark: (i) => d + wob(i, 0.02), lit: () => 0 }]));
    const L = (spec) => X.bottomLines(mkAu(spec));
    const a = L(up(["Wip", "Robust"]));
    ok("!! two networks beat the autopilot and the hand weights in the dark: line 1 names them in order; line 2 the same against the start; line 3 the hand weights TIE the autopilot; line 4 the dark-specific ones", a[0] === "2 OF 8 NETWORKS BEAT THE AUTOPILOT IN THE DARK (Wip, Robust)" && a[1] === "2 OF 8 NETWORKS BEAT THEIR UNTRAINED START IN THE DARK (Wip, Robust)" && a[2] === "THE UNTRAINED HAND WEIGHTS TIE THE AUTOPILOT IN THE DARK" && a[3] === "THE GAIN IS DARK-SPECIFIC IN 2 OF 8 (Wip, Robust)");
    const n0 = L({});
    ok("!! none beats anything: 0 OF 8 with (none) in lines 1, 2 and 4", n0[0] === "0 OF 8 NETWORKS BEAT THE AUTOPILOT IN THE DARK (none)" && n0[1] === "0 OF 8 NETWORKS BEAT THEIR UNTRAINED START IN THE DARK (none)" && n0[3] === "THE GAIN IS DARK-SPECIFIC IN 0 OF 8 (none)");
    const b = L({ "network-Wip": { dark: (i) => -0.1 + wob(i, 0.02) }, "network-Robust": { dark: (i) => 0.1 + wob(i, 0.02) } });
    ok("!! a network below the autopilot is named after the semicolon, in lines 1 and 2: '; Wip ARE BELOW IT'", b[0] === "1 OF 8 NETWORKS BEAT THE AUTOPILOT IN THE DARK (Robust); Wip ARE BELOW IT" && b[1] === "1 OF 8 NETWORKS BEAT THEIR UNTRAINED START IN THE DARK (Robust); Wip ARE BELOW IT");
    const h1 = L({ "network-hand": { dark: (i) => 0.1 + wob(i, 0.02) } })[2], h2 = L({ "network-hand": { dark: (i) => -0.1 + wob(i, 0.02) } })[2];
    ok("!! the hand weights BEAT / ARE BELOW the autopilot when they do", h1 === "THE UNTRAINED HAND WEIGHTS BEAT THE AUTOPILOT IN THE DARK" && h2 === "THE UNTRAINED HAND WEIGHTS ARE BELOW THE AUTOPILOT IN THE DARK");
    const l = L({ autopilot: { lost: ["dark", "lit"] }, "network-hand": { lost: ["lit"] }, "network-Wip": { lost: ["dark"] }, "network-Robust": { lost: ["dark", "lit"] } })[4];
    ok("!! lost subs: autopilot 4 (two ids, dark and lit), hand 2, networks 6 in total (Wip 2, Robust 4), 4 in the worst", l === "LOST SUBS: autopilot 4, hand 2, networks 6 (4 in the worst)");
}
sec("4. CHECKS");
{
    const names = (au) => X.checksOf(au).filter((c) => !c.ok).map((c) => c.name), good = () => mkAu({ "network-Wip": { dark: () => 0.05, lit: () => 0.01 } });
    ok("!! five check rows on a clean audit, all passing", J(X.checksOf(good()).map((c) => c.name)) === J(["SIZES", "IDS ALIGNED", "SCORES INSIDE (0, 1)", "EVENT REACHES THE FLIGHT", "ARMS DISTINCT"]) && names(good()).length === 0);
    const a1 = good(); a1.lit["network-Robust"].pop(); const a2 = good(); a2.dark["network-Wip"][3].key = "x"; const a3 = good(); a3.dark.autopilot[0].score = 1.0; const a4 = good(); a4.lit.autopilot = a4.dark.autopilot.map((r) => ({ ...r })); const a5 = good(); a5.dark["network-Robust"] = a5.dark["network-Wip"].map((r) => ({ ...r }));
    ok("!! a short arm breaks SIZES, a different id IDS ALIGNED, a score of 1 SCORES INSIDE, an autopilot with the same dark and lit scores EVENT REACHES THE FLIGHT, two identical arms ARMS DISTINCT", names(a1).includes("SIZES") && names(a2).includes("IDS ALIGNED") && names(a3).includes("SCORES INSIDE (0, 1)") && names(a4).includes("EVENT REACHES THE FLIGHT") && names(a5).includes("ARMS DISTINCT"));
    const a6 = good(); a6.range = { from: 1, to: 41 };
    ok("!! the expected size is the range's: a 41-id range with 40 runs breaks SIZES", names(a6).includes("SIZES"));
}
sec("5. REPORT");
{
    const au = mkAu({ "network-Wip": { dark: (i) => 0.1 + wob(i, 0.02), lit: () => 0 } }), L = X.report(au), t = L.join("\n");
    ok("!! the head names the ids, the seconds and 'read once'; the five checks pass first", /^ROUND H1: .* Ids 1-40 \(40\), 60 s, dark and lit; read once$/.test(L[0]) && L.slice(1, 6).every((l) => /^  PASS /.test(l)));
    ok("!! a means table with all ten arms (dark / lit), the hand-minus-autopilot line, one block per network with four readings each, the spread line", /means \(dark \/ lit\):/.test(t) && X.ARM_IDS.every((a) => t.includes("  " + a.padEnd(20))) && /hand minus autopilot, dark: /.test(t) && X.NETWORK_NAMES.every((n) => new RegExp(`^${n}:\\n   dark vs autopilot .*\\n   dark vs hand .*\\n   lit  vs autopilot .*\\n   dark-specific `, "m").test(t)) && /spread of the eight dark gains over the autopilot: [-+]0\.0\d+ to \+0\.1/.test(t));
    ok("!! the five bottom lines come last, each prefixed BOTTOM LINE:", L.slice(-5).every((l) => l.startsWith("BOTTOM LINE: ")) && /OF 8 NETWORKS BEAT THE AUTOPILOT/.test(L[L.length - 5]) && /LOST SUBS/.test(L[L.length - 1]));
    const bad = mkAu({}); bad.dark.autopilot.pop(); const Lb = X.report(bad);
    ok("!! a failed check says the verdicts are NOT WEIGHED, with one bottom line and no table", Lb.some((l) => /^  FAIL SIZES/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1 && !Lb.some((l) => /means \(dark/.test(l)));
}
sec("6. FLIGHT");
{
    const w = { hand: Array.from(PS.handWeights()) };
    for (const n of X.NETWORK_NAMES) w[n] = JSON.parse(fs.readFileSync(new URL(n === "Wip" ? "../../brain/pilotSubWeightsWip.json" : `../../brain/pilotSubWeights${n}Wip.json`, import.meta.url), "utf8")).weights;
    const a = X.audit(w, { range: { from: 0, to: 1 }, seconds: 60 }), a2 = X.audit(w, { range: { from: 0, to: 1 }, seconds: 60 }), b = B.standardBoard({ noisy: w.RobustNoisy }), d = b.run("dropout", ["autopilot", "network-noisy"], { from: 0, to: 1 }, { seconds: 60 }), l = b.run("dropout", ["autopilot"], { from: 0, to: 1 }, { seconds: 60, event: null });
    ok("!! an audit flies ten arms dark and lit on the ids and is deterministic (twice the same scores)", Object.keys(a.dark).length === 10 && Object.keys(a.lit).length === 10 && J(a.dark) === J(a2.dark) && J(a.lit) === J(a2.lit) && a.dark.autopilot.length === 2);
    ok("!! the autopilot arm is the switchboard's autopilot dark and lit, and network-RobustNoisy is the switchboard's noisy network on the same weights file, dive for dive", J(a.dark.autopilot) === J(d.runs.autopilot) && J(a.lit.autopilot) === J(l.runs.autopilot) && J(a.dark["network-RobustNoisy"]) === J(d.runs["network-noisy"]));
    ok("!! the hand weights fly as a network: close to the autopilot on these ids (the autopilot IS the hand weights' form) and the trained networks are not", a.dark["network-hand"].every((r, i) => Math.abs(r.score - a.dark.autopilot[i].score) < 1e-3) && a.dark["network-Robust"].some((r, i) => Math.abs(r.score - a.dark.autopilot[i].score) > 1e-3));
    ok("!! the five checks pass on the real audit", X.checksOf(a).every((c) => c.ok));
}
sec("7. SOURCE");
{
    ok("!! the ids 2000 and 2199 appear once each; no clock, no random number, nothing read from the disk", code.split("2000").length === 2 && code.split("2199").length === 2 && !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
