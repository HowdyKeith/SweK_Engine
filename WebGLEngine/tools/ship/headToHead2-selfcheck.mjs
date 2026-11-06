// WebGLEngine/tools/ship/headToHead2-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/headToHead2-selfcheck.mjs      (~0.2-12 s: hand fixtures and one short real audit)
//
// THE GATE OF tools/ship/headToHead2.mjs (Round H2 of brain/HEAD_TO_HEAD.md, registered first).
//   1 SETS      the seventeen arms, the eight network names, the five plain-net specs, the ids 3000-3199 (disjoint from H1's 2000-2199, the unregistered looks' 1-12 and 9001-9060 and every gate's ids), 160 s; boardOf's refusals and controls.
//   2 READINGS  an arm's gains over the autopilot (dark, lit, dark-specific = dark gain minus lit gain per id) and a dark pair, on synthetic audits, at 1.5 and 2.5 se.
//   3 LINES     the six bottom lines in all their cases; lost subs counted over both conditions.
//   4 CHECKS    sizes, ids aligned, scores inside (0, 1), the event reaches the flight, the lesion is the autopilot, the arms distinct; a failed check says NOT WEIGHED.
//   5 REPORT    the means table, the gain blocks, the plain-net-against-leaky and network-against-plain tables, the spread line and the lines last.
//   6 FLIGHT    one real short audit (ids 0-1, 60 s): the arms are the pilots they name, the lesion IS the autopilot, deterministic.
//   7 SOURCE    the ids appear once; no clock, random or file.
// NOT CHECKED, said plainly: which arm is best (that is the experiment), and that the plain nets are a fair control for the 963-weight networks (they are not weight-matched: HEAD_TO_HEAD.md H2 says so first).
// SABOTAGE LOG (37 mutants of tools/ship/headToHead2.mjs, each alone, restored byte-identical): 31 went red by name on the first pass. 6 went 0 red: five got a row and then went red (a gain read against the hand weights instead of the autopilot; the beat-all-five list read with `some` for `every`; line 4 read against the autopilot instead of the leaky unit; the event check read with `every` for `some`; the spread line's two halves swapped), and ONE IS DECLARED EQUIVALENT: the distinctness row built from ARM_IDS instead of DISTINCT_IDS. It compares the set size to DISTINCT_IDS.length (16), and seventeen arms with the lesion equal to the autopilot make a set of 16, so the two forms agree whenever the lesion is the autopilot; they differ only when the lesion has drifted off the autopilot, which LESION IS THE AUTOPILOT already reddens.
//   The fixture lesson, as in H1: the synthetic arms get exact zero-mean pairs for offsets (the first draft's one-sided offsets read BETTER by chance), and the lesion gets none, because it is the autopilot.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
import * as X from "./headToHead2.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import { championsOf } from "./takeTankDropout.mjs";
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const src = fs.readFileSync(new URL("./headToHead2.mjs", import.meta.url), "utf8"), code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
console.log("headToHead2-selfcheck -- Round H2\n");
const REC = championsOf(fs.readFileSync(new URL("../../brain/rig-results/plainNetStudy.jsonl", import.meta.url), "utf8"));
const W = () => Object.fromEntries(["hand", ...X.NETWORK_NAMES].map((n, k) => [n, Array.from({ length: 963 }, (_, i) => 0.05 * k * Math.sin(i))]));
const pid = (s) => "plainnet-" + s, nid = (n) => "network-" + n;

sec("1. SETS");
{
    ok("!! seventeen arms in order: autopilot, network-hand, the eight networks, leaky-unit, leaky-unit-off, the five plain nets; frozen", J(X.ARM_IDS) === J(["autopilot", "network-hand", ...X.NETWORK_NAMES.map(nid), "leaky-unit", "leaky-unit-off", "plainnet-P/B/mn:3", "plainnet-P/whole/mn:0", "plainnet-E/whole/mn:1", "plainnet-P/B/mg:0", "plainnet-E/E/mn:0"]) && X.ARM_IDS.length === 17 && Object.isFrozen(X.ARM_IDS) && Object.isFrozen(X.PLAIN_SPECS));
    ok("!! the eight network names are H1's, in H1's order; the five plain-net specs are the five the unregistered look flew", J(X.NETWORK_NAMES) === J(["Wip", "Actuators", "Robust", "RobustLong", "RobustTail", "RobustTail2", "RobustWide", "RobustNoisy"]) && J(X.PLAIN_SPECS) === J(["P/B/mn:3", "P/whole/mn:0", "E/whole/mn:1", "P/B/mg:0", "E/E/mn:0"]));
    ok("!! ids 3000-3199 (200), 160 s: not H1's 2000-2199, not the looks' 1-12 and 9001-9060, not the gates' 0-8", X.IDS.from === 3000 && X.IDS.to === 3199 && X.SECONDS === 160);
    ok("!! the lesion is left out of the distinct set (sixteen arms) and nothing else is", X.DISTINCT_IDS.length === 16 && !X.DISTINCT_IDS.includes("leaky-unit-off") && X.ARM_IDS.filter((a) => !X.DISTINCT_IDS.includes(a)).length === 1);
    ok("!! all five champions are in the study file", X.PLAIN_SPECS.every((s) => REC.get(s) && Array.isArray(REC.get(s).weights)));
    const b = X.boardOf(W(), REC);
    ok("!! controls: every network and the hand weights are held to the autopilot only; the leaky unit to the autopilot; the lesion to nothing; every plain net to the autopilot AND the leaky unit; the autopilot to nothing", X.NETWORK_NAMES.every((n) => J(b.arms.get(nid(n)).controls) === '["autopilot"]') && J(b.arms.get("network-hand").controls) === '["autopilot"]' && J(b.arms.get("leaky-unit").controls) === '["autopilot"]' && b.arms.get("leaky-unit-off").controls.length === 0 && X.PLAIN_SPECS.every((s) => J(b.arms.get(pid(s)).controls) === '["autopilot","leaky-unit"]') && b.arms.get("autopilot").controls.length === 0);
    ok("!! the board holds exactly the seventeen arms and the one task, the dropout", b.arms.size === 17 && X.ARM_IDS.every((a) => b.arms.has(a)) && b.tasks.size === 1 && b.tasks.has("dropout"));
    const w = W(); delete w.Robust; const w2 = W(); w2.hand = w2.hand.slice(1); const w3 = W(); w3.Wip = null; const r2 = new Map(REC); r2.delete("E/E/mn:0");
    ok("!! boardOf refuses missing weights, weights of the wrong length, null, and a missing champion, naming the arm", /weights\.Robust must be an array of 963/.test(thr(() => X.boardOf(w, REC))) && /weights\.hand must be/.test(thr(() => X.boardOf(w2, REC))) && /weights\.Wip must be/.test(thr(() => X.boardOf(w3, REC))) && /no plain-net champion "E\/E\/mn:0"/.test(thr(() => X.boardOf(W(), r2))) && /no plain-net champion/.test(thr(() => X.boardOf(W(), null))));
}
// a synthetic audit: n ids, per arm and condition a score list
const N = 40, base = (c) => Array.from({ length: N }, (_, i) => 0.6 + 0.02 * Math.sin(i + (c === "lit" ? 1 : 0)));
const mkAu = (spec = {}, n = N) => {
    const au = { dark: {}, lit: {}, range: { from: 1, to: n }, seconds: 60 };
    for (const c of ["dark", "lit"]) for (const a of X.ARM_IDS) {
        const f = (spec[a] && spec[a][c]) || (() => 0), lost = (spec[a] && spec[a].lost) || [];
        au[c][a] = Array.from({ length: n }, (_, i) => ({ key: "sb-" + (i + 1), score: base(c)[i % N] + f(i) + (a === "autopilot" || a === "leaky-unit-off" ? 0 : (i % 2 ? 1 : -1) * 0.0001 * X.ARM_IDS.indexOf(a)), bad: lost.includes(c) && i < 2 }));
    }
    return au;
};
const wob = (i, a) => (i % 2 ? a : -a);
sec("2. READINGS");
{
    const au = mkAu({ [pid("P/B/mn:3")]: { dark: (i) => 0.1 + wob(i, 0.02), lit: (i) => 0.1 + wob(i, 0.02) }, [pid("P/B/mg:0")]: { dark: (i) => 0.1 + wob(i, 0.02), lit: () => 0 }, [pid("E/E/mn:0")]: { dark: (i) => -0.1 + wob(i, 0.02), lit: () => 0 } });
    const s = X.gainOf(au, pid("P/B/mn:3")), d = X.gainOf(au, pid("P/B/mg:0")), l = X.gainOf(au, pid("E/E/mn:0"));
    ok("!! a steady gain in both conditions: dark and lit gains BETTER (about +0.1), the dark-specific difference is about 0 and TIES", s.dark.reading === "BETTER" && near(s.dark.mean, 0.1, 1e-3) && s.lit.reading === "BETTER" && s.specific.reading === "TIES" && Math.abs(s.specific.mean) < 1e-9);
    ok("!! a gain in the dark only is dark-specific: dark +0.1, lit 0 -> specific BETTER (+0.1), lit gain TIES", d.dark.reading === "BETTER" && d.lit.reading === "TIES" && d.specific.reading === "BETTER" && near(d.specific.mean, 0.1, 1e-6));
    ok("!! a loss reads WORSE in the dark and its dark-specific difference is negative", l.dark.reading === "WORSE" && l.specific.reading === "WORSE" && l.specific.mean < 0);
    ok("!! gainOf is against the AUTOPILOT: raising the leaky unit by +0.3 in the dark leaves a plain net's gain over the autopilot at +0.1", (() => { const a2 = mkAu({ [pid("P/B/mn:3")]: { dark: (i) => 0.1 + wob(i, 0.02) }, "leaky-unit": { dark: (i) => 0.3 + wob(i, 0.02) } }); return near(X.gainOf(a2, pid("P/B/mn:3")).dark.mean, 0.1, 1e-3); })());
    ok("!! gainOf is against the autopilot and NOT the hand weights: raising network-hand by +0.3 in the dark leaves a network's dark gain over the autopilot at +0.1", (() => { const a2 = mkAu({ "network-Wip": { dark: (i) => 0.1 + wob(i, 0.02) }, "network-hand": { dark: (i) => 0.3 + wob(i, 0.02) } }); const g2 = X.gainOf(a2, "network-Wip"); return near(g2.dark.mean, 0.1, 1e-3) && g2.dark.reading === "BETTER"; })());
    const p = X.darkPair(mkAu({ [pid("P/B/mn:3")]: { dark: (i) => 0.2 + wob(i, 0.02) }, "leaky-unit": { dark: (i) => 0.05 + wob(i, 0.02) } }), pid("P/B/mn:3"), "leaky-unit");
    ok("!! darkPair is a minus b in the dark: the plain net 0.2 against the leaky unit 0.05 reads about +0.15 BETTER, and the other way about -0.15 WORSE", p.reading === "BETTER" && near(p.mean, 0.15, 2e-3) && (() => { const q = X.darkPair(mkAu({ [pid("P/B/mn:3")]: { dark: (i) => 0.2 + wob(i, 0.02) }, "leaky-unit": { dark: (i) => 0.05 + wob(i, 0.02) } }), "leaky-unit", pid("P/B/mn:3")); return q.reading === "WORSE" && near(q.mean, -0.15, 2e-3); })());
    const amp = 0.03, se = amp * Math.sqrt(N / (N - 1)) / Math.sqrt(N), g = (k) => X.gainOf(mkAu({ "leaky-unit": { dark: (i) => wob(i, amp) + k * se, lit: () => 0 } }), "leaky-unit").dark.reading;
    ok("!! 2 se on both sides in the dark: +2.5 se BETTER, +1.5 se TIES, -1.5 se TIES, -2.5 se WORSE", g(2.5) === "BETTER" && g(1.5) === "TIES" && g(-1.5) === "TIES" && g(-2.5) === "WORSE");
}
sec("3. LINES");
{
    const L = (spec) => X.bottomLines(mkAu(spec)), up = (ids, d = 0.1, lit = 0) => Object.fromEntries(ids.map((n) => [n, { dark: (i) => d + wob(i, 0.02), lit: (i) => lit + wob(i, 0.02) }]));
    const n0 = L({});
    ok("!! nothing beats anything: 0 OF 40 pairs read better (40 TIE), none beat all five, 0 OF 5 plain nets in all three counts, the leaky unit TIES and is NOT dark-specific, 0 OF 5 beat the leaky unit, 0 OF 8 networks", n0[0] === "NETWORKS AGAINST PLAIN NETS IN THE DARK: 0 OF 40 PAIRS READ BETTER, 40 TIE, 0 WORSE; none BEAT ALL FIVE PLAIN NETS" && n0[1] === "PLAIN NETS BEAT THE AUTOPILOT IN THE DARK: 0 OF 5 (none); IN THE LIT TANK: 0 OF 5 (none); THE GAIN IS DARK-SPECIFIC IN 0 OF 5 (none)" && n0[2] === "THE LEAKY UNIT TIES THE AUTOPILOT IN THE DARK AND ITS GAIN IS NOT DARK-SPECIFIC" && n0[3] === "0 OF 5 PLAIN NETS BEAT THE LEAKY UNIT IN THE DARK (none)" && n0[4] === "0 OF 8 NETWORKS BEAT THE AUTOPILOT IN THE DARK; THE GAIN IS DARK-SPECIFIC IN 0 (none)");
    const a = L({ ...up(["network-Wip", "network-Robust"], 0.2), ...up([pid("P/B/mn:3"), pid("E/E/mn:0")], 0.05) });
    ok("!! two networks at +0.2 over two plain nets at +0.05 (three plain nets and six networks level): the two networks win all ten of their pairs, the six level networks lose twelve (to the two +0.05 plain nets), eighteen tie; both networks beat all five", a[0] === "NETWORKS AGAINST PLAIN NETS IN THE DARK: 10 OF 40 PAIRS READ BETTER, 18 TIE, 12 WORSE; Wip, Robust BEAT ALL FIVE PLAIN NETS", a[0]);
    const lines = L({ ...up(["network-Wip"], 0.2), ...up(PLAIN_NAMES_FOR_TEST(), 0.05) });
    ok("!! one network beats all five plain nets when it is +0.2 over five plain nets at +0.05: 'Wip BEAT ALL FIVE PLAIN NETS', 5 OF 40 pairs read better", /5 OF 40 PAIRS READ BETTER/.test(lines[0]) && /; Wip BEAT ALL FIVE PLAIN NETS$/.test(lines[0]), lines[0]);
    const worse = L({ ...up(["network-Wip"], -0.2), ...up([pid("E/E/mn:0")], 0.1) });
    ok("!! a network below a plain net counts WORSE in line 1: Wip at -0.2 against E/E/mn:0 at +0.1 is one of the WORSE pairs and Wip is not in the beat-all list", /[1-9]\d* WORSE; none BEAT ALL FIVE PLAIN NETS$/.test(worse[0]) && worse[0].includes("WORSE"), worse[0]);
    const p = L(up([pid("P/B/mn:3"), pid("E/E/mn:0")], 0.1, 0.1)), q = L({ [pid("P/B/mg:0")]: { dark: (i) => 0.1 + wob(i, 0.02), lit: () => 0 }, [pid("E/whole/mn:1")]: { dark: (i) => 0.1 + wob(i, 0.02), lit: (i) => 0.1 + wob(i, 0.02) } });
    ok("!! plain nets: two with the same gain dark and lit beat the autopilot in both and are NOT dark-specific; one with a dark-only gain is dark-specific and NOT counted in the lit tank", p[1] === "PLAIN NETS BEAT THE AUTOPILOT IN THE DARK: 2 OF 5 (P/B/mn:3, E/E/mn:0); IN THE LIT TANK: 2 OF 5 (P/B/mn:3, E/E/mn:0); THE GAIN IS DARK-SPECIFIC IN 0 OF 5 (none)" && q[1] === "PLAIN NETS BEAT THE AUTOPILOT IN THE DARK: 2 OF 5 (E/whole/mn:1, P/B/mg:0); IN THE LIT TANK: 1 OF 5 (E/whole/mn:1); THE GAIN IS DARK-SPECIFIC IN 1 OF 5 (P/B/mg:0)", p[1] + " | " + q[1]);
    const k1 = L({ "leaky-unit": { dark: (i) => 0.1 + wob(i, 0.02), lit: () => 0 } })[2], k2 = L({ "leaky-unit": { dark: (i) => -0.1 + wob(i, 0.02), lit: () => 0 } })[2], k3 = L({ "leaky-unit": { dark: (i) => 0.1 + wob(i, 0.02), lit: (i) => 0.1 + wob(i, 0.02) } })[2];
    ok("!! the leaky unit BEATS the autopilot and is dark-specific when its gain is dark-only; IS BELOW it when it loses; BEATS it and is NOT dark-specific when the gain is the same lit", k1 === "THE LEAKY UNIT BEATS THE AUTOPILOT IN THE DARK AND ITS GAIN IS DARK-SPECIFIC" && k2 === "THE LEAKY UNIT IS BELOW THE AUTOPILOT IN THE DARK AND ITS GAIN IS NOT DARK-SPECIFIC" && k3 === "THE LEAKY UNIT BEATS THE AUTOPILOT IN THE DARK AND ITS GAIN IS NOT DARK-SPECIFIC", k1 + " | " + k2 + " | " + k3);
    const v = L({ [pid("E/E/mn:0")]: { dark: (i) => 0.2 + wob(i, 0.02) }, [pid("P/B/mn:3")]: { dark: (i) => 0.2 + wob(i, 0.02) }, "leaky-unit": { dark: (i) => 0.05 + wob(i, 0.02) } })[3], v2 = L({ [pid("E/E/mn:0")]: { dark: (i) => 0.0 + wob(i, 0.02) }, "leaky-unit": { dark: (i) => 0.2 + wob(i, 0.02) } })[3];
    ok("!! line 4 names the plain nets that beat the LEAKY UNIT (not the autopilot): two at +0.2 over a leaky unit at +0.05 are named in spec order; a plain net level with the autopilot below a leaky unit at +0.2 is not", v === "2 OF 5 PLAIN NETS BEAT THE LEAKY UNIT IN THE DARK (P/B/mn:3, E/E/mn:0)" && v2 === "0 OF 5 PLAIN NETS BEAT THE LEAKY UNIT IN THE DARK (none)", v + " | " + v2);
    const part = L({ ...up(["network-Wip"], 0.2), ...up([pid("E/E/mn:0")], 0.3) })[0];
    ok("!! a network that beats four of the five plain nets (one plain net is +0.3 over it) is NOT in the beat-all-five list: Wip at +0.2 against E/E/mn:0 at +0.3 and four level plain nets", /; none BEAT ALL FIVE PLAIN NETS$/.test(part) && /4 OF 40 PAIRS READ BETTER/.test(part), part);
    const vl = L({ [pid("P/B/mn:3")]: { dark: () => 0 }, "leaky-unit": { dark: (i) => -0.2 + wob(i, 0.02) } })[3], vl2 = L({ [pid("P/B/mn:3")]: { dark: (i) => 0.2 + wob(i, 0.02) } })[3];
    ok("!! line 4 reads against the LEAKY UNIT: a plain net level with the autopilot above a leaky unit at -0.2 beats it (P/B/mn:3 is named, five at most), while a plain net at +0.2 over the autopilot and a level leaky unit is named too; a plain net level with a level leaky unit is not", vl === "5 OF 5 PLAIN NETS BEAT THE LEAKY UNIT IN THE DARK (P/B/mn:3, P/whole/mn:0, E/whole/mn:1, P/B/mg:0, E/E/mn:0)" && vl2 === "1 OF 5 PLAIN NETS BEAT THE LEAKY UNIT IN THE DARK (P/B/mn:3)", vl + " | " + vl2);
    const n5 = L({ ...up(["network-Wip", "network-RobustNoisy"], 0.1, 0), "network-Robust": { dark: (i) => 0.1 + wob(i, 0.02), lit: (i) => 0.1 + wob(i, 0.02) } })[4];
    ok("!! line 5: three networks beat the autopilot in the dark (Wip, Robust, RobustNoisy); the dark-specific ones are the two with a dark-only gain (the third has the same gain lit), named in network order", n5 === "3 OF 8 NETWORKS BEAT THE AUTOPILOT IN THE DARK; THE GAIN IS DARK-SPECIFIC IN 2 (Wip, RobustNoisy)", n5);
    const l = L({ autopilot: { lost: ["dark", "lit"] }, "leaky-unit": { lost: ["lit"] }, [pid("P/B/mn:3")]: { lost: ["dark"] }, [pid("E/E/mn:0")]: { lost: ["dark", "lit"] }, "network-Wip": { lost: ["dark"] }, "network-Robust": { lost: ["dark", "lit"] } })[5];
    ok("!! lost subs: autopilot 4 (two ids, dark and lit), leaky unit 2, plain nets 6 (3 + ... P/B/mn:3 2, E/E/mn:0 4) with 4 in the worst, networks 6 (Wip 2, Robust 4) with 4 in the worst", l === "LOST SUBS: autopilot 4, leaky unit 2, plain nets 6 (4 in the worst), networks 6 (4 in the worst)", l);
}
function PLAIN_NAMES_FOR_TEST() { return X.PLAIN_SPECS.map(pid); }
sec("4. CHECKS");
{
    const names = (au) => X.checksOf(au).filter((c) => !c.ok).map((c) => c.name), good = () => mkAu({ "network-Wip": { dark: () => 0.05, lit: () => 0.01 } });
    ok("!! six check rows on a clean audit, all passing", J(X.checksOf(good()).map((c) => c.name)) === J(["SIZES", "IDS ALIGNED", "SCORES INSIDE (0, 1)", "EVENT REACHES THE FLIGHT", "LESION IS THE AUTOPILOT", "ARMS DISTINCT"]) && names(good()).length === 0);
    const a1 = good(); a1.lit[pid("E/E/mn:0")].pop(); const a2 = good(); a2.dark["network-Wip"][3].key = "x"; const a3 = good(); a3.dark.autopilot[0].score = 1.0; const a4 = good(); a4.lit.autopilot = a4.dark.autopilot.map((r) => ({ ...r }));
    const a5 = good(); a5.dark[pid("P/B/mn:3")] = a5.dark["network-Wip"].map((r) => ({ ...r })); const a6 = good(); a6.dark["leaky-unit-off"][7].score += 0.01; const a7 = good(); a7.lit["leaky-unit-off"][2].score += 0.01;
    ok("!! a short arm breaks SIZES, a different id IDS ALIGNED, a score of 1 SCORES INSIDE, an autopilot with the same dark and lit scores EVENT REACHES THE FLIGHT, two identical arms ARMS DISTINCT, a lesion off the autopilot by 0.01 in the dark LESION IS THE AUTOPILOT, and in the lit tank too", names(a1).includes("SIZES") && names(a2).includes("IDS ALIGNED") && names(a3).includes("SCORES INSIDE (0, 1)") && names(a4).includes("EVENT REACHES THE FLIGHT") && names(a5).includes("ARMS DISTINCT") && names(a6).includes("LESION IS THE AUTOPILOT") && names(a7).includes("LESION IS THE AUTOPILOT"));
    const a11 = good(); a11.lit.autopilot = a11.dark.autopilot.map((r, i) => (i === 7 ? { ...r, score: r.score - 0.05 } : { ...r }));
    ok("!! the event reaches the flight when the autopilot's dark and lit scores differ on ONE id and agree on the rest (EVENT REACHES THE FLIGHT passes), and fails only when they agree on every id", !names(a11).includes("EVENT REACHES THE FLIGHT") && names(a4).includes("EVENT REACHES THE FLIGHT"));
    const a8 = good(); a8.dark["network-Actuators"][5].score = 0;
    ok("!! a score of exactly 0 breaks SCORES INSIDE (0, 1) as a score of 1 does", names(a8).includes("SCORES INSIDE (0, 1)"));
    const a9 = good(); a9.range = { from: 1, to: 41 };
    ok("!! the expected size is the range's: a 41-id range with 40 runs breaks SIZES", names(a9).includes("SIZES"));
    const a10 = good(); a10.dark["leaky-unit-off"] = a10.dark.autopilot.map((r) => ({ ...r }));
    ok("!! the lesion equal to the autopilot is NOT a distinctness failure (it is left out of that row), and the lesion differing is not either", !names(a10).includes("ARMS DISTINCT") && !names(good()).includes("ARMS DISTINCT"));
}
sec("5. REPORT");
{
    const au = mkAu({ "network-Wip": { dark: (i) => 0.1 + wob(i, 0.02), lit: () => 0 } }), L = X.report(au), t = L.join("\n");
    ok("!! the head names the ids, the seconds and 'read once'; the six checks pass first", /^ROUND H2: .* Ids 1-40 \(40\), 60 s, dark and lit; read once$/.test(L[0]) && L.slice(1, 7).every((l) => /^  PASS /.test(l)));
    ok("!! a means table with all seventeen arms (dark / lit), a gain block (dark, lit, dark-specific) for each arm but the autopilot, the plain-net-against-leaky rows, the network-against-plain table, the spread line", /means \(dark \/ lit\):/.test(t) && X.ARM_IDS.every((a) => t.includes("  " + a.padEnd(24))) && X.ARM_IDS.filter((a) => a !== "autopilot").every((a) => new RegExp("^" + a.replace(/[/:.]/g, "\\$&") + ":\\n   dark          .*\\n   lit           .*\\n   dark-specific ", "m").test(t)) && /plain nets against the leaky unit, dark:/.test(t) && X.PLAIN_SPECS.every((s) => t.includes("   " + s.padEnd(14))) && /networks against plain nets, dark/.test(t) && X.NETWORK_NAMES.every((n) => t.includes("   " + n.padEnd(12) + " ")) && /spread of the five plain nets' dark gains: .* to .*; of the eight networks': .* to /.test(t));
    { const gd = (id) => X.gainOf(au, id).dark.mean, sg = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), pg = X.PLAIN_SPECS.map((q) => gd("plainnet-" + q)), ng = X.NETWORK_NAMES.map((q) => gd("network-" + q));
      ok("!! the spread line gives the PLAIN NETS' lowest and highest dark gain first and the NETWORKS' second, to four places", L.includes(`spread of the five plain nets' dark gains: ${sg(Math.min(...pg))} to ${sg(Math.max(...pg))}; of the eight networks': ${sg(Math.min(...ng))} to ${sg(Math.max(...ng))}`)); }
    ok("!! the six bottom lines come last, each prefixed BOTTOM LINE:", L.slice(-6).every((l) => l.startsWith("BOTTOM LINE: ")) && /NETWORKS AGAINST PLAIN NETS/.test(L[L.length - 6]) && /LOST SUBS/.test(L[L.length - 1]));
    { const m = (runs) => runs.reduce((q, r) => q + r.score, 0) / runs.length, row = (a) => t.split("\n").find((l) => l.startsWith("  " + a.padEnd(24)));
      ok("!! the means table prints each arm's own dark and lit mean to four places (the autopilot's, Wip's, E/E/mn:0's)", ["autopilot", "network-Wip", pid("E/E/mn:0")].every((a) => row(a) === `  ${a.padEnd(24)} ${m(au.dark[a]).toFixed(4)} / ${m(au.lit[a]).toFixed(4)}`) && m(au.dark["network-Wip"]) > m(au.dark.autopilot)); }
    const bad = mkAu({}); bad.dark.autopilot.pop(); const Lb = X.report(bad);
    ok("!! a failed check says the verdicts are NOT WEIGHED, with one bottom line and no table", Lb.some((l) => /^  FAIL SIZES/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1 && !/means \(dark/.test(Lb.join("\n")));
}
sec("6. FLIGHT");
{
    const w = { hand: Array.from(PS.handWeights()) };
    for (const n of X.NETWORK_NAMES) w[n] = JSON.parse(fs.readFileSync(new URL(n === "Wip" ? "../../brain/pilotSubWeightsWip.json" : `../../brain/pilotSubWeights${n}Wip.json`, import.meta.url), "utf8")).weights;
    const a = X.audit(w, REC, { range: { from: 0, to: 1 }, seconds: 60 }), a2 = X.audit(w, REC, { range: { from: 0, to: 1 }, seconds: 60 });
    ok("!! an audit flies seventeen arms dark and lit on the ids and is deterministic (twice the same scores)", Object.keys(a.dark).length === 17 && Object.keys(a.lit).length === 17 && J(a.dark) === J(a2.dark) && J(a.lit) === J(a2.lit) && a.dark.autopilot.length === 2);
    ok("!! the lesion IS the autopilot on the real flights, dark and lit, and the real leaky unit, a plain net and a network are NOT", J(a.dark["leaky-unit-off"]) === J(a.dark.autopilot) && J(a.lit["leaky-unit-off"]) === J(a.lit.autopilot) && a.dark["leaky-unit"].some((r, i) => r.score !== a.dark.autopilot[i].score) && a.dark[pid("E/E/mn:0")].some((r, i) => r.score !== a.dark.autopilot[i].score) && a.dark["network-Robust"].some((r, i) => r.score !== a.dark.autopilot[i].score));
    ok("!! the hand weights fly as the autopilot (close, not trained) and the leaky unit's lit flights are the autopilot's (its dark-only lesion has nothing to act on lit)", a.dark["network-hand"].every((r, i) => Math.abs(r.score - a.dark.autopilot[i].score) < 1e-3) && J(a.lit["leaky-unit"]) === J(a.lit.autopilot));
    ok("!! the six checks pass on the real audit", X.checksOf(a).every((c) => c.ok), J(X.checksOf(a).filter((c) => !c.ok).map((c) => c.name)));
}
sec("7. SOURCE");
{
    ok("!! the ids 3000 and 3199 appear once each; no clock, no random number, nothing read from the disk", code.split("3000").length === 2 && code.split("3199").length === 2 && !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
