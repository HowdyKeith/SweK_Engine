// WebGLEngine/tools/ship/subTrafficUnderStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subTrafficUnderStudy-selfcheck.mjs      (seconds; NOTHING here flies HELD88: the flights are fixtures and the command's flying is replaced)
//
// THE GATE OF tools/ship/subTrafficUnderStudy.mjs (FOLLOW-UP 10 of brain/SUB_FIELD_NAV_WIP.md, registered first):
//   1 THE TEST      (a) ships at most half, (b) net >= 5 at p <= 0.10, (c) exits no more than R's and at most 1; SUPPORTED / PARTLY / NOT; HARMFUL at net <= -5; L read the same way, reported.
//   2 THE CHECKS    each fails on its own break; a failure is NOT WEIGHED.
//   3 THE COMMAND   refusals; checks 1 and 3 before any HELD88 flight (exit 3, nothing flown); flown once; written as soon as flown; DEV prints readings and no verdict.
//   4 THE SOURCE    no clock, no Math.random; the registered numbers.
// SABOTAGE LOG (each broken, run, restored; red = FAIL rows of a gate that loaded):
//   G1 (a) as "no more ships" instead of half 1 | G2 (c) without "at most 1" 1 | G4 HARMFUL at net < -5 1 | G5 HELD88 flown when the limit does not bite 1 | G6 the bite at >= 60.8 1
//   G7 the hull-damage check always passes 1 | G8 a second HELD88 flight allowed 1
//   G3 PARTLY granted without (c): 0 red at first (the exit fixture held both (a) and (b), so the PARTLY branch was never reached); the "PARTLY needs (c)" row added (its first
//   fixture had 6 of 12 ships, exactly half, so (a) held -- mended to 7 of 13); then 1
"use strict";
import fs from "node:fs";
import * as Y from "./subTrafficUnderStudy.mjs";
import * as P from "../../brain/subDeepTransit.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
console.log("subTrafficUnderStudy-selfcheck -- the registered test of FOLLOW-UP 10\n");

const R = P.REFERENCE10, U = P.DESIGNATED10, L = P.ATTRIBUTION10;
/** One arm's flights from a list of statuses ("r" reached, "s" ship collision, "b" berg collision, "x" left, "t" timeout), seeds from 10201. */
const arm = (code, o = {}) => [...code].map((c, i) => ({ seed: 10201 + i, kind: P.KIND, status: { r: "reached", s: "collided", b: "collided", x: "left", t: "timeout" }[c], reached: c === "r", hit: c === "s" ? "ship" : c === "b" ? "berg" : null, deepest: o.deepest ?? 60, minShipClear: o.clear ?? 10, energy: 1e6, deepKeel: false }));
const res3 = (r, u, l = r) => ({ [R]: arm(r), [U]: arm(u), [L]: arm(l) });
const base = "r".repeat(40);

sec("1. THE TEST");
{
    const sup = Y.testOf(res3("ssssssss" + base, "rrrrrrrs" + base), U);
    ok("!! 7 rescued of 8 ship collisions, none lost, no exit: ships 1 <= half of 8, net 7 at p 0.016: SUPPORTED", sup.verdict === "SUPPORTED" && sup.pair.net === 7 && sup.bars.ships && sup.bars.gain && sup.bars.exits);
    const ex = Y.testOf(res3("ssssssss" + base, "rrrrrrrx" + base), U), ex2 = Y.testOf(res3("ssssssssxx" + base, "rrrrrrrrxx" + base), U);
    ok("!! (c): one exit where R has none fails it (PARTLY is then barred: NOT SUPPORTED); two exits against R's two fail it too (at most 1)", ex.bars.exits === false && ex.verdict === "NOT SUPPORTED" && ex2.bars.exits === false);
    const ships = Y.testOf(res3("ssssssss" + base, "rrrrrrssss" + base.slice(2)), U);
    ok("!! (a) missed (ships 4 against 8 is half: holds; 5 against 8 does not); 5 rescued of 12 leaving 7 (more than half) with net 5 at p 0.0625: one bar of (a) and (b) holding with (c) is PARTLY SUPPORTED", Y.testOf(res3("ssssssss" + base, "rrrrssss" + base), U).bars.ships === true && (() => { const t = Y.testOf(res3("ssssssss" + "r".repeat(40), "rrrsssss" + "r".repeat(40)), U); return t.bars.ships === false; })() && (() => { const t = Y.testOf(res3("s".repeat(12) + base, "rrrrr" + "s".repeat(7) + base), U); return t.bars.ships === false && t.bars.gain === true && t.verdict === "PARTLY SUPPORTED"; })());
    const noC = Y.testOf(res3("s".repeat(13) + base, "rrrrrx" + "s".repeat(7) + base), U);
    ok("!! PARTLY needs (c): (b) holding and (a) failing WITH an exit R does not have is NOT SUPPORTED, not PARTLY", noC.bars.exits === false && noC.bars.gain === true && noC.bars.ships === false && noC.verdict === "NOT SUPPORTED", `${noC.pair.net} ${noC.d.ships}/${noC.r.ships}`);
    const harm = Y.testOf(res3("rrrrr" + base, "sssss" + base), U);
    ok("!! 5 lost: net -5 is HARMFUL, NOT SUPPORTED", harm.pair.net === -5 && harm.harmful && harm.verdict === "NOT SUPPORTED");
    const r = res3("ssssssss" + base, "rrrrrrrs" + base, "rrrrssss" + base), L2 = Y.report(r, Y.checksOf(r, { copy: true, bites: true, seeds: P.HELD88.slice(0, 48) }), { set: "held88", n: 48 }).join("\n");
    ok("!! the report prints the three bars, L against R (reported), the clearance comparison and the failure classes; the verdict line", /bars: \(a\)/.test(L2) && /L against R: gained 4, lost 0, net 4/.test(L2) && /minimum ship clearance, U against R: larger in \d+, smaller in \d+, exact sign p \d/.test(L2) && /keel over 53 m/.test(L2) && /VERDICT: SUPPORTED/.test(L2));
}

sec("2. THE CHECKS");
{
    const r = res3(base, base), seeds = P.HELD88.slice(0, 40), bad = (o, rr = r) => Y.checksOf(rr, { copy: true, bites: true, seeds, ...o }).filter((c) => !c.ok).map((c) => c.name);
    const deepRes = { ...r, [U]: arm(base, { deepest: 80.5 }) }, shifted = { ...r, [L]: r[L].map((x) => ({ ...x, seed: x.seed + 1 })) };
    ok("!! each check fails on its own break and names itself", bad({}).length === 0 && J(bad({ copy: false })) === J(["THE COPY"]) && J(bad({ bites: false })) === J(["THE LIMIT BITES"]) && J(bad({}, shifted)) === J(["SAME SCENARIOS"]) && J(bad({}, deepRes)) === J(["NO HULL DAMAGE"]));
    ok("!! the limit bites iff some designated DEV flight is deeper than 60.8 m", Y.limitBites(arm("rr", { deepest: 60.9 })) && !Y.limitBites(arm("rr", { deepest: 60.8 })));
    const L2 = Y.report(r, Y.checksOf(r, { copy: false, bites: true, seeds }), { set: "held88", n: 40 }).join("\n");
    ok("!! a failed check on HELD88: NOT WEIGHED, no readings", /VERDICT: NOT WEIGHED/.test(L2) && !/bars:/.test(L2));
}

sec("3. THE COMMAND");
{
    const run = (argv, fl = {}) => {
        const out = [], err = [], files = [], flown = []; let code;
        const fakeSet = (seeds, o = {}) => { const arms = o.arms || P.ARM10_NAMES; flown.push(seeds.length * arms.length); return Object.fromEntries(arms.map((a) => [a, seeds.map((s, i) => ({ ...arm("r")[0], seed: s, deepest: a === U ? 65 : 58 }))])); };
        try { code = Y.command(argv, { out: (m) => out.push(m), err: (m) => err.push(m), writeFile: (f, t) => files.push([f, t]), exists: fl.exists || (() => false), exitIo: { err: (m) => err.push(m), exit: (c) => { throw new Error("exit " + c); } }, flights: { flySet: fakeSet, copy: () => true, ...fl } }); } catch (e) { if (/^exit /.test(e.message)) throw e; err.push(e.message); code = -1; }
        return { code, out: out.join("\n"), err: err.join("\n"), files, flown };
    };
    const thrown = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
    ok("!! refused: no set, an unknown set; --write on DEV; HELD88 without --write; HELD88 already flown; an unknown option exits 2", run([]).code === 2 && run(["--set", "held82"]).code === 2 && run(["--set", "dev", "--write"]).code === 2 && run(["--set", "held88"]).code === 2 && run(["--set", "held88", "--write"], { exists: () => true }).code === 2 && /exit 2/.test(thrown(() => run(["--seeds", "3"]))));
    const nc = run(["--set", "held88", "--write"], { copy: () => false }), nb = run(["--set", "held88", "--write"], { flySet: (seeds, o) => Object.fromEntries((o.arms || P.ARM10_NAMES).map((a) => [a, seeds.map((s) => ({ ...arm("r")[0], seed: s, deepest: 59 }))])) });
    ok("!! check 1 or check 3 failing: exit 3, HELD88 NOT flown (only DEV's designated flights for check 3), nothing written", nc.code === 3 && nc.files.length === 0 && J(nc.flown) === J([30]) && /FAIL THE COPY/.test(nc.out) && nb.code === 3 && /FAIL THE LIMIT BITES/.test(nb.out) && nb.files.length === 0);
    const w = run(["--set", "held88", "--write"]);
    ok("!! HELD88: DEV's designated arm for check 3, then the three arms on the 200 seeds once; 600 flights written; the verdict printed (here every flight reached: (a) holds trivially at 0 against 0 and (b) fails, so by the registered rule PARTLY SUPPORTED)", J(w.flown) === J([30, 600]) && w.files.length === 1 && w.files[0][0].endsWith("brain/subTrafficUnderHeld88.jsonl") && w.files[0][1].trim().split("\n").length === 600 && /VERDICT: PARTLY SUPPORTED/.test(w.out), w.err.slice(0, 120));
    const d = run(["--set", "dev"]);
    ok("!! DEV: the three arms once, readings printed, no VERDICT line, nothing written", J(d.flown) === J([90]) && /DEV: a sanity run, not a result/.test(d.out) && !/VERDICT/.test(d.out) && d.files.length === 0);
}

sec("4. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./subTrafficUnderStudy.mjs", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! no clock and no Math.random; the registered numbers (net 5 at 0.10, HARMFUL -5, 5 copy seeds, the 60.8 m bite, 80 m damage, keels over 53 m, HELD88 10201 to 10400)", !/Math\.random|Date\.now|new Date|performance\.now/.test(code) && Y.GAIN === 5 && Y.P_LEVEL === 0.10 && Y.HARMFUL === -5 && Y.COPY_SEEDS === 5 && Y.BITE_DEPTH === 60.8 && Y.DAMAGE_DEPTH === 80 && Y.DEEP_KEEL === 53 && Y.SETS.held88[0] === 10201 && Y.SETS.held88.at(-1) === 10400);
}

sec("5. THE STUDY'S OWN PIECES");
{
    ok("!! OUT_FILE and STORED_82: HELD88's flights go to brain/subTrafficUnderHeld88.jsonl; check 1 reads FOLLOW-UP 9's brain/subDeepTransitHeld82.jsonl, which exists", Y.OUT_FILE === "brain/subTrafficUnderHeld88.jsonl" && Y.STORED_82 === "brain/subDeepTransitHeld82.jsonl" && fs.existsSync(new URL("../../" + Y.STORED_82, import.meta.url)));
    const stored = fs.readFileSync(new URL("../../" + Y.STORED_82, import.meta.url), "utf8").trim().split("\n").map((l) => JSON.parse(l)), want = new Map(stored.filter((r) => r.arm === R).map((r) => [r.seed, r]));
    const echo = (sc) => want.get(sc.seed), nudged = (sc) => ({ ...want.get(sc.seed), path: want.get(sc.seed).path + (sc.seed === P.HELD82[2] ? 0.001 : 0) });
    ok("!! copySame (the fly replaced, nothing flown): the stored R flights echoed back are the copy; one path 1 mm longer on the third seed is not; R's flights missing from the store is not", Y.copySame(stored, echo) === true && Y.copySame(stored, nudged) === false && Y.copySame(stored.filter((r) => r.arm !== R), echo) === false);
    const sc = P.scenarioOf(P.DEV[0]), f = Y.flyOne(sc, U), q = P.flyDeep(sc, U, { measure: true });
    ok("  flyOne on spent DEV seed 1 (designated arm): flyDeep's measured record field for field, plus a positive energy in J and deepKeel = a ship keel over 53 m", J({ ...f, energy: undefined, deepKeel: undefined }) === J(q) && f.seed === P.DEV[0] && Number.isFinite(f.energy) && f.energy > 0 && f.deepKeel === sc.obstacles.some((o) => o.type === "ship" && o.keel > 53), `${f.status} ${f.ticks} ${(f.energy / 1000).toFixed(0)} kJ`);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
