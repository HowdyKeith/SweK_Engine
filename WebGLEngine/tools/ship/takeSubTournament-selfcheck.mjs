// WebGLEngine/tools/ship/takeSubTournament-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeSubTournament-selfcheck.mjs      (about 20 s: the runner on smoke geometries 1 to 4 and 1 to 2 -- NEVER the recorded set 97001 to 97024)
//
// THE GATE OF tools/ship/takeSubTournament.mjs (the registration is brain/SUB_LEAGUE_WIP.md, part A):
//   1 CONSTANTS     the files, the default set (97001 for 24), the smoke set, the seat geometries, the roster's seven ids in the page's order
//   2 THE ROSTER    from the real files; with a file missing the roster shrinks as the page's does (a side that needs the file is not built); with all four missing it is the hand tactician alone
//   3 THE RECORD    the keys of the dogfight's record, the set, the sides (the network side carries the sha256 of its weights, a PD side null), the pairs, the ratings and their order, the field edges, the seat pass-through, the cycles and the upsets
//   4 THE COMMAND   the report on the smoke geometries to the byte, every refusal by name (an unknown argument, --smoke with --record, a bad --geometries or --first, --record without a file, a record that exists, an unknown side, a duplicate, one side), the record written once through the stub, the program run
//   5 THE SOURCE    no clock, no random number; the headers; ASCII
// NOT CHECKED, said plainly: the ratings of the seven sides on the recorded set (that is the read of brain/SUB_LEAGUE_WIP.md, flown by the command, not here).
//
// SABOTAGES: written after the gate; the log is added below when the pass is done.
"use strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./takeSubTournament.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const J = JSON.stringify;
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

console.log("1. CONSTANTS");
{
    ok("!! the four files the page loads, the default set (97001, 24), the smoke set (1, 4), 8 geometries for the seat, and everything frozen", J(X.FILES) === '{"weights":"brain/pilotSubWeightsWip.json","theta":"brain/subTacticsThetaWip.json","ping":"brain/subTacticsThetaSearchPingWip.json","league":"brain/subTacticsLeagueWip.json"}' && J(X.DEFAULT) === '{"first":97001,"count":24}' && J(X.SMOKE) === '{"first":1,"count":4}' && X.SEAT_GEOMETRIES === 8 && [X.FILES, X.DEFAULT, X.SMOKE, X.ROSTER_IDS].every(Object.isFrozen));
    ok("the roster's seven ids in the page's order", J(X.ROSTER_IDS) === '["hand","hand+net","champ","champ+net","ping","league7001","league7000"]');
}

console.log("\n2. THE ROSTER");
{
    const real = (f) => JSON.parse(fs.readFileSync(new URL("../../" + f, import.meta.url), "utf8")), none = () => null;
    ok("!! from the real files the roster is the seven ids of the constant, each with a label and a side whose `.side()` makes a duel side", J(X.sidesOf().map((s) => s.id)) === J(X.ROSTER_IDS) && X.sidesOf().every((s) => s.label && typeof s.side.side === "function" && typeof s.side.side().tactics === "function"));
    ok("!! with the weights file missing the two network sides go (five ids); with the theta file missing champ and champ+net go; with the league file missing the two leagues go; with all four missing it is the hand tactician alone", J(X.sidesOf((f) => (f === X.FILES.weights ? null : real(f))).map((s) => s.id)) === '["hand","champ","ping","league7001","league7000"]' && J(X.sidesOf((f) => (f === X.FILES.theta ? null : real(f))).map((s) => s.id)) === '["hand","hand+net","ping","league7001","league7000"]' && J(X.sidesOf((f) => (f === X.FILES.league ? null : real(f))).map((s) => s.id)) === '["hand","hand+net","champ","champ+net","ping"]' && J(X.sidesOf(none).map((s) => s.id)) === '["hand"]');
}

console.log("\n3. THE RECORD");
{
    const wrote = [], lines = []; const code = X.command(["--only", "hand+net,hand", "--geometries", "2", "--first", "1", "--record", "brain/x.json"], { log: (s) => lines.push(s), exists: () => false, write: (f, s) => wrote.push([f, s]) });
    const r = wrote.length === 1 ? JSON.parse(wrote[0][1]) : null;
    ok("!! the record has the dogfight's keys in order (set, sides, pairs, ratings, fieldEdge, seat, cycles, upsets), the set (subTournament, patrol, first 1, 2 scenarios)", code === 0 && r && Object.keys(r).join() === "set,sides,pairs,ratings,fieldEdge,seat,cycles,upsets" && J(r.set) === '{"name":"subTournament","kind":"patrol","first":1,"scenarios":2}');
    ok("!! the sides: the network side carries the 64-hex sha256 of its weights and its theta, the PD side null; the pair `hand+net|hand` carries the tournament's summary keys (n, fights, winsX, winsY, draws, edge, se, z, ...)", r.sides.length === 2 && r.sides[0].id === "hand+net" && /^[0-9a-f]{64}$/.test(r.sides[0].weightsSha256) && r.sides[1].id === "hand" && r.sides[1].weightsSha256 === null && r.pairs.length === 1 && r.pairs[0].pair === "hand+net|hand" && J(Object.keys(r.pairs[0].summary).slice(0, 8)) === '["n","fights","winsX","winsY","draws","edge","se","z"]');
    ok("!! the ratings (order hand+net, hand; converged), the field edges (antisymmetric and tiny: 0.0017 and -0.0017), the seat bias carried through for each side (hand 3.342 a duel, hand+net 1.698), no cycle and no upset", J(r.ratings.order) === '["hand+net","hand"]' && r.ratings.converged === true && Math.abs(r.fieldEdge["hand+net"] - 0.0016667) < 1e-6 && Math.abs(r.fieldEdge.hand + 0.0016667) < 1e-6 && Math.abs(r.seat.hand.mean - 3.342) < 0.001 && Math.abs(r.seat["hand+net"].mean - 1.698) < 0.001 && r.seat.hand.n === 8 && J(r.cycles) === "[]" && J(r.upsets) === "[]");
    {
        // a record whose ids are NOT in rank order and whose pairs need the flipped orientation: ping, hand, champ -> order ping, champ, hand; the ratings are the Bradley-Terry fit of all three pairs (a pair read only one way would shift them)
        const w3 = [], l3 = [], c3 = X.command(["--only", "ping,hand,champ", "--geometries", "4", "--first", "1", "--record", "brain/x.json"], { log: (s) => l3.push(s), exists: () => false, write: (f, s) => w3.push([f, s]) });
        const r3 = w3.length === 1 ? JSON.parse(w3[0][1]) : null, rt = r3 && r3.ratings.rating;
        ok("!! the record's ratings order is the RANKING, not the sides' order (ids ping, hand, champ -> order ping, champ, hand), and the ratings are the fit of all three pairs read both ways (ping 97.8877, champ 97.8877, hand -214.3677)", c3 === 0 && r3 && J(r3.ratings.order) === '["ping","champ","hand"]' && Math.abs(rt.ping - 97.88765627) < 1e-5 && Math.abs(rt.champ - 97.88765627) < 1e-5 && Math.abs(rt.hand + 214.36765244) < 1e-5 && r3.ratings.converged === true && J(r3.sides.map((s) => s.id)) === '["ping","hand","champ"]' && J(r3.pairs.map((p) => p.pair)) === '["ping|hand","ping|champ","hand|champ"]');
        // the seat bias is measured on the first 8 geometries from --first, not from 1
        const w4 = [], l4 = [], c4 = X.command(["--only", "hand,hand+net", "--geometries", "2", "--first", "3", "--record", "brain/x.json"], { log: (s) => l4.push(s), exists: () => false, write: (f, s) => w4.push([f, s]) });
        const r4 = w4.length === 1 ? JSON.parse(w4[0][1]) : null;
        ok("!! the seat bias is flown on the 8 geometries from --first (3 to 10), not from 1: hand +2.505 a duel (first 1 gives +3.342), hand+net +0.858, each n 8; the printed lines carry the sign and three decimals", c4 === 0 && r4 && Math.abs(r4.seat.hand.mean - 2.5053906) < 1e-6 && Math.abs(r4.seat["hand+net"].mean - 0.8575174) < 1e-6 && r4.seat.hand.n === 8 && l4.includes("  seat bias hand: seat A is worth +2.505 a duel (se 0.828, 8 geometries)") && l4.includes("  seat bias hand+net: seat A is worth +0.858 a duel (se 1.225, 8 geometries)"), l4.filter((l) => /seat bias/.test(l)).join(" | "));
    }
    {
        const v0 = X.verdictLines({ cycles: [], upsets: [] }), v1 = X.verdictLines({ cycles: ["a > b > c > a", "d > e > d"], upsets: [{ lower: "x", higher: "y", edge: 0.12345, z: 3.14159 }, { lower: "p", higher: "q", edge: -2, z: 11 }] });
        ok("!! the verdict lines: none when there is no cycle and no upset; the cycles joined by `; `; each upset `lower over higher (edge E, z Z)` with the edge to 3 decimals and z to 1, joined by `; `", J(v0) === '["  no cycle: the significant leads are transitive","  no upset: no significant lead runs against the rating"]' && J(v1) === '["  cycles: a > b > c > a; d > e > d","  upsets: x over y (edge 0.123, z 3.1); p over q (edge -2.000, z 11.0)"]');
        ok("only a cycle, only an upset: each line is independent of the other", J(X.verdictLines({ cycles: ["a > b > a"], upsets: [] })) === '["  cycles: a > b > a","  no upset: no significant lead runs against the rating"]' && J(X.verdictLines({ cycles: [], upsets: [{ lower: "m", higher: "n", edge: 1, z: 2 }] })) === '["  no cycle: the significant leads are transitive","  upsets: m over n (edge 1.000, z 2.0)"]');
    }
    ok("the written record is the printed one with a final newline, pretty-printed, and the log ends with the `written` line", wrote[0][1].endsWith("}\n") && wrote[0][1].includes("\n \"set\"") && lines[lines.length - 1] === "  written brain/x.json");
}

console.log("\n4. THE COMMAND");
{
    const lines = []; const code = X.command(["--only", "hand,champ,ping", "--smoke"], { log: (s) => lines.push(s) });
    ok("!! the smoke report on three sides to the byte (sha256): the header, the tournament's lines, the seat bias of each side, no cycle, no upset; 15 lines, exit 0, nothing recorded", code === 0 && lines.length === 15 && /^\[takeSubTournament\] 3 sides \(hand, champ, ping\), geometries 1 to 4, both seats \(smoke: not recorded\)$/.test(lines[0]) && sha(lines.join("\n") + "\n") === "6da602f27e6a362720cc229488954afc3e996ceae9b8d2a2b25773bdcff6af82");
    const bad = [], run = (a, o = {}) => X.command(a, { log: (s) => bad.push(s), exists: () => false, write: () => { throw new Error("must not write"); }, ...o });
    const c = [run(["--bogus"]), run(["--smoke", "--record", "x.json"]), run(["--geometries", "0"]), run(["--geometries", "201"]), run(["--geometries", "x"]), run(["--first", "0"]), run(["--first", "x"]), run(["--record"]), run(["--record", "x.json"], { exists: () => true }), run(["--only", "hand,nobody"]), run(["--only", "hand,hand"]), run(["--only", "hand"])];
    ok("!! refusals, each exit 2 and each by its name: an unknown argument; --smoke with --record; --geometries 0, 201 and x; --first 0 and x; --record without a file; a record that exists; an unknown side; a duplicate side; one side", c.every((v) => v === 2) && /unknown argument --bogus/.test(bad[0]) && /--smoke is never recorded/.test(bad[1]) && /--geometries is 1 to 200/.test(bad[2]) && /--geometries is 1 to 200/.test(bad[3]) && /--geometries is 1 to 200/.test(bad[4]) && /--first a seed of 1 or more/.test(bad[5]) && /--first a seed of 1 or more/.test(bad[6]) && /--record needs a file/.test(bad[7]) && /x.json exists; the record is written once/.test(bad[8]) && /no side named nobody \(the roster has hand, hand\+net/.test(bad[9]) && /at least two different sides/.test(bad[10]) && /at least two different sides/.test(bad[11]) && bad.length === 12);
    const b2 = [], run2 = (a) => X.command(a, { log: (s) => b2.push(s), exists: () => false, write: () => { throw new Error("must not write"); } });
    const c2 = [run2(["--record", ""]), run2(["--record", "--only", "hand,champ"]), run2(["--geometries", "200", "--only", "hand"]), run2(["--geometries", "201", "--only", "hand"]), run2(["--geometries", "1", "--first", "1", "--only", "hand"])];
    ok("!! an empty file name and a flag where the file should be are refused as `--record needs a file`; --geometries 200 passes the range check (it stops later at `at least two different sides`, flying nothing) while 201 is refused by the range; --first 1 passes", c2.every((v) => v === 2) && /--record needs a file/.test(b2[0]) && /--record needs a file/.test(b2[1]) && /at least two different sides/.test(b2[2]) && /--geometries is 1 to 200/.test(b2[3]) && /at least two different sides/.test(b2[4]), b2.join(" | ").slice(0, 300));
    ok("--geometries 200 and --first 1 are accepted (the edges of the ranges): the parse passes and the run starts (checked by a one-geometry run with --first 1)", (() => { const l = []; return X.command(["--only", "hand,champ", "--geometries", "1", "--first", "1"], { log: (s) => l.push(s), write: () => { throw new Error("must not write"); } }) === 0 && /geometries 1 to 1, both seats$/.test(l[0]); })());
    const prog = fileURLToPath(new URL("./takeSubTournament.mjs", import.meta.url)), flags = ["--preserve-symlinks", "--preserve-symlinks-main", prog];
    const pa = spawnSync(process.execPath, [...flags, "--bogus"], { encoding: "utf8", timeout: 60000 }), pb = spawnSync(process.execPath, [...flags, "--smoke", "--only", "hand,champ"], { encoding: "utf8", timeout: 120000 });
    ok("!! run as a program (symlinks preserved so a mutant is the one that runs): an unknown argument exits 2 naming it; a smoke run on two sides exits 0 and prints the tournament's report", pa.status === 2 && /unknown argument --bogus/.test(pa.stdout) && pb.status === 0 && /^\[takeSubTournament\] 2 sides \(hand, champ\), geometries 1 to 4/.test(pb.stdout) && /no cycle/.test(pb.stdout), [pa.status, pb.status].join());
    const pd = spawnSync(process.execPath, ["--preserve-symlinks", "--input-type=module", "-e", `import(${J(prog)})`], { encoding: "utf8", timeout: 60000 });
    ok("!! imported from `node -e` (no script path in argv) the command runs nothing, prints nothing and does not throw", pd.status === 0 && pd.stdout === "" && pd.stderr === "", String(pd.status) + " " + pd.stderr.slice(0, 120));
    ok("importing the command sets no exit code", process.exitCode === undefined);
}

console.log("\n5. THE SOURCE");
{
    const cmd = fs.readFileSync(new URL("./takeSubTournament.mjs", import.meta.url), "utf8"), code = (t) => t.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*")).join("\n");
    ok("!! the command has no clock and no Math.random", !/Math\.random|Date\.now|new Date|performance\.now/.test(code(cmd)));
    ok("the header names the registration and the gate, and the file is ASCII", /SUB_LEAGUE_WIP\.md/.test(cmd) && /takeSubTournament-selfcheck\.mjs/.test(cmd) && !/[^\x00-\x7F]/.test(cmd));
    ok("the registration says geometries 97001 to 97024 and names the runner", (() => { const reg = fs.readFileSync(new URL("../../brain/SUB_LEAGUE_WIP.md", import.meta.url), "utf8"); return /97001 to 97024/.test(reg) && /takeSubTournament\.mjs/.test(reg); })());
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
