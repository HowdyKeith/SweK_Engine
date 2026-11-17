// WebGLEngine/tools/ship/takeEvadeShort-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeEvadeShort-selfcheck.mjs      (about 50 s: ONE flight of the 59 matchups on the smoke geometries 1 to 4 -- NEVER the DEV set 134001 to 134096 or the HELD set 135001 to 135096: every flight goes through a guard that refuses any name but `smoke`)
//
// THE GATE OF THE SPEC tools/ship/takeEvadeShort.mjs (the registration is brain/SUB_EVADE_SHORT_WIP.md and its Amendment A; the generic command it is built with, tools/ship/takeEvadePingReach.mjs, has its own gate, takeEvadePingReach-selfcheck.mjs, which tests the matchups, the rules, the checks and the command's modes through two made-up specs):
//   1 THE SPEC     the files, the sets (smoke 1 for 4, DEV 134001 and HELD 135001, 96 geometries each), the hunter league7100, the values 4, 6 and 12, R0 on the lead, the common values 4 and 6, no across, the headline word and the prefix; everything frozen; the exports of the wrapper are the build's
//   2 THE RULES    the spec's forecast quantities, each its own, on made-up rows; the forecast line; the headline and the premise through the spec
//   3 THE COMMAND  the smoke report to the byte; the flight (59 rows, the matchups of the registration); every refusal by name with the spec's tool and file names and nothing flown; dev --write through the guard writes the spec's DEV file; the program run
//   4 THE SOURCE   the headers; ASCII; the registration names the sets, the values, the matchups and the amendment
// NOT CHECKED, said plainly: the readings on DEV and HELD (that is the read of brain/SUB_EVADE_SHORT_WIP.md, flown by the command, not here).
//
// SABOTAGES (the mutation harness copies the gate's import closure and the data files the gate reads to isolated trees, runs the unmutated gate first, changes one token at a time plus hand mutants, and counts a FAIL, a crash or a hang as killed; run ONE AT A TIME):
//   (the log is written after the pass)
"use strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./takeEvadeShort.mjs";
import { loadRuns } from "./takeSubLeague.mjs";
import { opponentsOf } from "./takeEvadeAway.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const J = JSON.stringify;
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const R = new URL("../../", import.meta.url), real = (f) => (fs.existsSync(new URL(f, R)) ? JSON.parse(fs.readFileSync(new URL(f, R), "utf8")) : null);
const rd = (dev) => (f) => (f === X.DEV_FILE ? dev : real(f));
let kept = null;   // the ONLY flying the gate does: the smoke geometries, once, kept and reused
const guarded = (matchups, runs, name, opts) => { if (name !== "smoke") throw new Error("the gate must not fly " + name); return (kept = kept || X.fly(matchups, runs, name, opts)); };
const noFly = () => { throw new Error("must not fly"); };
const clone = (o) => JSON.parse(J(o));
const v2 = (v) => v.toFixed(2);

console.log("1. THE SPEC");
{
    const S = X.SPEC;
    ok("!! the spec: the tool name, the two files, the sets (DEV 134001 for 96, HELD 135001 for 96), the hunter league7100 alone, the values 4, 6 and 12, R0 on the lead, the common values 4 and 6, no across, the headline word SHORT and the prefix RS; all frozen", S.tool === "takeEvadeShort" && S.devFile === "brain/subEvadeShortDev.json" && S.heldFile === "brain/subEvadeShortHeld.json" && J(S.sets) === '{"dev":{"first":134001,"count":96},"held":{"first":135001,"count":96}}' && J(S.hunters) === '["league7100"]' && J(S.values) === "[4,6,12]" && J(S.r0) === '{"kind":"lead"}' && J(S.common) === "[4,6]" && S.across === null && S.head === "SHORT" && S.prefix === "RS" && [S, S.sets, S.sets.dev, S.sets.held, S.hunters, S.values, S.r0, S.common].every(Object.isFrozen));
    ok("!! the wrapper's exports are the build's of that spec: the smoke set 1 for 4 then the DEV and HELD sets; the files; the hunter and the values; frozen", J(X.SETS) === '{"smoke":{"first":1,"count":4},"dev":{"first":134001,"count":96},"held":{"first":135001,"count":96}}' && X.DEV_FILE === "brain/subEvadeShortDev.json" && X.HELD_FILE === "brain/subEvadeShortHeld.json" && J(X.HUNTERS) === '["league7100"]' && J(X.VALUES) === "[4,6,12]" && [X.SETS, X.HUNTERS, X.VALUES].every(Object.isFrozen) && typeof X.command === "function" && typeof X.matchupsOf === "function" && typeof X.rulesOf === "function" && typeof X.reportLines === "function" && typeof X.checksOf === "function" && typeof X.fly === "function" && typeof X.equalPair === "function");
}

console.log("\n2. THE RULES");
const base = { winsX: 0, draws: 0, winsY: 0, seatA: 0, seatB: 0, flew: 8, seedsOk: true };
const spread = (e, a) => [e - a, e + a, e - a, e + a], OPP = opponentsOf("league7100");
const mkRows = (e = {}, own = {}, be = {}) => {
    const rows = [];
    for (const v of [4, 6, 12]) { const ed = own[v] ?? 0; rows.push({ id: `OWN:league7100@${v2(v)}`, kind: "OWN", hunter: "league7100", opponent: null, value: v, edge: ed, se: 0.1, z: ed / 0.1, v: spread(ed, 0.0625), loSpeed: 4, loTurn: 2.8, identical: false, ...base }); }
    OPP.forEach((o, i) => {
        const b = be[o] ?? 3;
        rows.push({ id: `BASE:league7100>${o}`, kind: "BASE", hunter: "league7100", opponent: o, value: null, edge: b, se: 0.1, z: 30, v: [0, 0, 0, 0], loSpeed: 2 + 0.25 * i, loTurn: 1 + 0.125 * i, identical: false, ...base });
        [4, 6, 12].forEach((v, vi) => { const ef = e[`${o}@${v}`] ?? e[`@${v}`] ?? 0; rows.push({ id: `ARM:league7100@${v2(v)}>${o}`, kind: "ARM", hunter: "league7100", opponent: o, value: v, edge: b + ef, se: 0.1, z: 30, v: spread(ef, 0.0625 * (vi + 1)), loSpeed: 2 + 0.25 * i, loTurn: 1 + 0.125 * i, identical: false, ...base }); });
    });
    return rows;
};
const run = (e, own, be) => X.rulesOf(mkRows(e, own, be)), fq = (e, own) => run(e, own).forecast;
const first = (n, edge, v) => Object.fromEntries(OPP.slice(0, n).map((o) => [`${o}@${v}`, edge]));
{
    ok("!! the forecast quantities, each its own: NARROW at 4, at 6 and at 12 (the label of that value: 7 helped is not NARROW; 6 is); hurts somewhere (any value, any opponent); the effect of 4 HELPS against some opponent (not the effect of 6); the effect of 4 HURTS against some opponent (not the effect of 6 or 12); no common opponent (HELPED at 4 AND at 6, not at 4 and 12); OWN(4) is NEUTRAL (not PAYS, not COSTS, and not the OWN at 6)", fq({}).narrow4 === true && fq(first(6, 0.5, 4)).narrow4 === true && fq(first(7, 0.5, 4)).narrow4 === false && fq(first(7, 0.5, 6)).narrow4 === true && fq({}).narrow6 === true && fq(first(7, 0.5, 6)).narrow6 === false && fq(first(7, 0.5, 4)).narrow6 === true && fq({}).narrow12 === true && fq(first(7, 0.5, 12)).narrow12 === false && fq(first(12, 0.5, 6)).narrow12 === true && fq({ "G@4": -0.5 }).hurtsSomewhere === true && fq({ "G@6": -0.5 }).hurtsSomewhere === true && fq({ "G@12": -0.5 }).hurtsSomewhere === true && fq({}).hurtsSomewhere === false && fq({ "G@4": 0.5 }).hurtsSomewhere === false && fq({ "G@4": 0.5 }).helps4Some === true && fq({ "G@6": 0.5 }).helps4Some === false && fq({ "G@12": 0.5 }).helps4Some === false && fq({}).helps4Some === false && fq({ "G@4": -0.5 }).helps4Some === false && fq({ "G@4": -0.5 }).hurts4Some === true && fq({ "G@6": -0.5, "G@12": -0.5 }).hurts4Some === false && fq({ "G@4": 0.5 }).hurts4Some === false && fq({}).hurts4Some === false && fq({}).commonEmpty === true && fq({ "G@4": 0.5, "G@6": 0.5 }).commonEmpty === false && fq({ "G@4": 0.5, "G@12": 0.5 }).commonEmpty === true && fq({ "G@4": 0.5, "league7001@6": 0.5 }).commonEmpty === true && fq({}, {}).own4Neutral === true && fq({}, { 4: 0.5 }).own4Neutral === false && fq({}, { 4: -0.5 }).own4Neutral === false && fq({}, { 4: 0.2499 }).own4Neutral === true && fq({}, { 6: 0.5 }).own4Neutral === true);
    const lz = X.reportLines(mkRows(), run({}), "dev");
    ok("!! the forecast line: `NARROW at 4.00 yes, at 6.00 yes, at 12.00 yes, hurts somewhere no, the effect of 4.00 HELPS against some opponent no, HURTS against some no, no common opponent yes, OWN(4.00) NEUTRAL yes` with nothing decided, and the other answers when something is (a help at 4, a hurt at 12, a PAYING OWN(4)); the header says the tool and the DEV set", lz[lz.length - 1] === "  FORECAST QUANTITIES: NARROW at 4.00 yes, at 6.00 yes, at 12.00 yes, hurts somewhere no, the effect of 4.00 HELPS against some opponent no, HURTS against some no, no common opponent yes, OWN(4.00) NEUTRAL yes" && X.reportLines(mkRows({ "G@4": 0.5, "G@6": 0.5, "league7001@12": -0.5 }, { 4: 0.5 }), run({ "G@4": 0.5, "G@6": 0.5, "league7001@12": -0.5 }, { 4: 0.5 }), "dev").pop() === "  FORECAST QUANTITIES: NARROW at 4.00 yes, at 6.00 yes, at 12.00 yes, hurts somewhere yes, the effect of 4.00 HELPS against some opponent yes, HURTS against some no, no common opponent no, OWN(4.00) NEUTRAL no" && /^\[takeEvadeShort\] dev read: geometries 134001 to 134096, both seats \(192 duels a matchup\); 59 matchups; the hunter league7100 with pingEvery 4.00, 6.00, 12.00,/.test(lz[0]) && /^\[takeEvadeShort\] held read: geometries 135001 to 135096/.test(X.reportLines(mkRows(), run({}), "held")[0]));
    ok("!! the headline and the premise through the spec: `SHORT: 4.00 NARROW, 6.00 NARROW, 12.00 NARROW` (with `, HURTS SOMEWHERE` when something HURTS); the lines are RS1 to RS4 (the prefix); R0 needs the BASE rows against league7001 and exploit7204 decided at 0.5 and z 2 in league7100's favour", run({}).headline === "SHORT: 4.00 NARROW, 6.00 NARROW, 12.00 NARROW" && run({ "G@12": -0.5 }).headline === "SHORT: 4.00 NARROW, 6.00 NARROW, 12.00 NARROW, HURTS SOMEWHERE" && lz.includes("  RS4 THE HEADLINE: SHORT: 4.00 NARROW, 6.00 NARROW, 12.00 NARROW") && lz.some((l) => /^  RS1 THE REACH OF 4\.00:/.test(l)) && lz.some((l) => /^  RS2 THE COST:/.test(l)) && lz.some((l) => /^  RS3 THE COMMON OPPONENTS \(HELPED at 4\.00 and 6\.00\):/.test(l)) && run({}, {}, { league7001: 1, exploit7204: 1 }).replicates === true && run({}, {}, { league7001: 0.4999, exploit7204: 1 }).replicates === false && run({}, {}, { league7001: 1, exploit7204: 0.4999 }).replicates === false && run({}, {}, { league7001: 1, exploit7204: 1, league7101: -3 }).replicates === true);
}

console.log("\n3. THE COMMAND");
{
    const lines = []; const code = X.command(["smoke"], { read: rd(null), fly: guarded, log: (s) => lines.push(s), write: () => { throw new Error("must not write"); } }), out = lines.join("\n") + "\n";
    ok("!! the smoke report to the byte (sha256): 29 lines from the header to the forecast quantities, exit 0, nothing recorded", code === 0 && lines.length === 29 && /^\[takeEvadeShort\] smoke read: geometries 1 to 4, both seats \(8 duels a matchup\); 59 matchups; the hunter league7100 with pingEvery 4\.00, 6\.00, 12\.00,/.test(lines[0]) && sha(out) === "818b8c7cf443f8b4ba6f0622096b83c674f745121afddcfe9dad238fc11b5725", sha(out));
    const loadedAll = loadRuns(), msR = X.matchupsOf(loadedAll.runs, loadedAll.runs[0].gen0);
    ok("!! the flight (smoke): 59 rows in the order of the matchups of the registration (the three OWN at 4, 6 and 12 first, then each of the fourteen opponents in the order of BOATS with its BASE and its ARMs at 4, 6 and 12), each with 8 fights and 4 geometry values; U(league7100) against a copy of itself has an edge of EXACTLY 0", kept !== null && kept.rows.length === 59 && J(kept.rows.map((r) => r.id)) === J(msR.map((m) => m.id)) && kept.rows[0].id === "OWN:league7100@4.00" && kept.rows[2].id === "OWN:league7100@12.00" && kept.rows[3].id === "BASE:league7100>league7000" && kept.rows[4].id === "ARM:league7100@4.00>league7000" && kept.rows[6].id === "ARM:league7100@12.00>league7000" && kept.rows[58].id === "ARM:league7100@12.00>G" && kept.rows.every((r) => r.flew === 8 && r.seedsOk && r.v.length === 4) && kept.equal.edge === 0);
    const bad = [], run1 = (a, o = {}) => X.command(a, { read: rd(null), log: (s) => bad.push(s), fly: noFly, exists: () => false, write: () => { throw new Error("must not write"); }, ...o });
    const devOk = { set: "dev", rules: { replicates: true }, checks: [] }, T = "takeEvadeShort", c = [run1([]), run1(["bogus"]), run1(["smoke", "--bogus"]), run1(["smoke", "--write"]), run1(["dev", "--write"], { exists: () => true }), run1(["held"]), run1(["held", "--write"], { exists: (x) => x === X.HELD_FILE, read: rd(devOk) }), run1(["held", "--write"]), run1(["held", "--write"], { read: rd({ set: "dev", rules: { replicates: false }, checks: [] }) }), run1(["held", "--write"], { read: rd({ set: "dev", rules: { replicates: true }, checks: ["a check failed"] }) })];
    ok("!! refusals, each exit 2, each by its name (takeEvadeShort and the files brain/subEvadeShortDev.json and brain/subEvadeShortHeld.json), and NOTHING flown: no argument; an unknown argument; smoke with --write; dev --write over an existing record; held without --write; held over an existing record; held with no DEV record; with a DEV that did not replicate; with a DEV that lists a failed check", c.every((v) => v === 2) && bad.length === 10 && bad[0] === `usage: ${T}.mjs smoke | dev [--write] | held --write` && bad[1] === `usage: ${T}.mjs smoke | dev [--write] | held --write` && bad[2] === `${T}: unknown argument --bogus` && bad[3] === `${T}: smoke is never recorded` && bad[4] === `${T}: brain/subEvadeShortDev.json exists; DEV is recorded once and a second record is refused` && bad[5] === `${T}: the HELD set is read once and the read is recorded; run held with --write` && bad[6] === `${T}: brain/subEvadeShortHeld.json exists; the HELD set is read once and a second read is refused` && bad[7] === `${T}: brain/subEvadeShortDev.json is missing; HELD is flown only after DEV is recorded` && bad[8] === `${T}: DEV did not replicate (R0) or is not a DEV record; HELD is not flown by this registration` && bad[9] === `${T}: DEV has a failed check (or records none), so its read is void; HELD is not flown by this registration`, c.join() + " " + bad.length);
    const w1 = [], l1 = []; const c1 = X.command(["dev", "--write"], { devSet: "smoke", read: rd(null), fly: () => clone(kept), log: (s) => l1.push(s), exists: () => false, write: (f, s) => w1.push([f, s]) });
    ok("!! dev --write (through the guard, the smoke set) writes the spec's DEV file once, with the set it flew named in it (smoke, so a HELD read will not take it) and 59 rows, and says `written brain/subEvadeShortDev.json`; the DEV line says `node tools/ship/takeEvadeShort.mjs held --write` when R0 holds", w1.length === 1 && w1[0][0] === "brain/subEvadeShortDev.json" && JSON.parse(w1[0][1]).set === "smoke" && JSON.parse(w1[0][1]).rows.length === 59 && l1[l1.length - 1] === "  written brain/subEvadeShortDev.json" && (c1 === 0 ? l1[l1.length - 2] === "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadeShort.mjs held --write)" : true));
    const prog = fileURLToPath(new URL("./takeEvadeShort.mjs", import.meta.url)), flags = ["--preserve-symlinks", "--preserve-symlinks-main", prog];
    const pa = spawnSync(process.execPath, flags, { encoding: "utf8", timeout: 60000 }), pb = spawnSync(process.execPath, [...flags, "smoke", "--write"], { encoding: "utf8", timeout: 60000 }), pc = spawnSync(process.execPath, [...flags, "held"], { encoding: "utf8", timeout: 60000 });
    ok("!! run as a program (symlinks preserved so a mutant is the one that runs): no argument exits 2 with the usage; smoke --write exits 2; held without --write exits 2 -- three refusals that look at no file and fly nothing (the program is never run with dev or a real held)", pa.status === 2 && /^usage: takeEvadeShort\.mjs/.test(pa.stdout) && pb.status === 2 && /smoke is never recorded/.test(pb.stdout) && pc.status === 2 && /run held with --write/.test(pc.stdout), [pa.status, pb.status, pc.status].join());
    const pd = spawnSync(process.execPath, ["--preserve-symlinks", "--input-type=module", "-e", `import(${J(prog)})`], { encoding: "utf8", timeout: 60000 });
    ok("!! imported from `node -e` (no script path in argv) the wrapper runs nothing, prints nothing and does not throw", pd.status === 0 && pd.stdout === "" && pd.stderr === "", String(pd.status) + " " + pd.stderr.slice(0, 120));
    ok("importing the wrapper sets no exit code", process.exitCode === undefined);
}

console.log("\n4. THE SOURCE");
{
    const cmd = fs.readFileSync(new URL("./takeEvadeShort.mjs", import.meta.url), "utf8"), code = (t) => t.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*")).join("\n"), reg = fs.readFileSync(new URL("../../brain/SUB_EVADE_SHORT_WIP.md", import.meta.url), "utf8");
    ok("!! the wrapper has no clock and no Math.random", !/Math\.random|Date\.now|new Date|performance\.now/.test(code(cmd)));
    ok("the header names the registration and both gates, and the file is ASCII", /SUB_EVADE_SHORT_WIP\.md/.test(cmd) && /takeEvadeShort-selfcheck\.mjs/.test(cmd) && /takeEvadePingReach-selfcheck\.mjs/.test(cmd) && !/[^\x00-\x7F]/.test(cmd));
    ok("!! the registration's sets (DEV 134001 to 134096, HELD 135001 to 135096, 96 geometries), the values, the 59 matchups, the bar, the labels and the amendment are the code's", /134001 to 134096/.test(reg) && /135001 to 135096/.test(reg) && /59 matchups a set/.test(reg) && /V = 4\.0, 6\.0 and 12\.0/.test(reg) && /0\.25 or more and its z is 2 or more/.test(reg) && /12 or more/.test(reg) && /AMENDMENT A/.test(reg));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
