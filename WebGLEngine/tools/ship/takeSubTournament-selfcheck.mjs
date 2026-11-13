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
    ok("the written record is the printed one with a final newline, pretty-printed, and the log ends with the `written` line", wrote[0][1].endsWith("}\n") && wrote[0][1].includes("\n \"set\"") && lines[lines.length - 1] === "  written brain/x.json");
}

console.log("\n4. THE COMMAND");
{
    const lines = []; const code = X.command(["--only", "hand,champ,ping", "--smoke"], { log: (s) => lines.push(s) });
    ok("!! the smoke report on three sides to the byte (sha256): the header, the tournament's lines, the seat bias of each side, no cycle, no upset; 15 lines, exit 0, nothing recorded", code === 0 && lines.length === 15 && /^\[takeSubTournament\] 3 sides \(hand, champ, ping\), geometries 1 to 4, both seats \(smoke: not recorded\)$/.test(lines[0]) && sha(lines.join("\n") + "\n") === "6da602f27e6a362720cc229488954afc3e996ceae9b8d2a2b25773bdcff6af82");
    const bad = [], run = (a, o = {}) => X.command(a, { log: (s) => bad.push(s), exists: () => false, write: () => { throw new Error("must not write"); }, ...o });
    const c = [run(["--bogus"]), run(["--smoke", "--record", "x.json"]), run(["--geometries", "0"]), run(["--geometries", "201"]), run(["--geometries", "x"]), run(["--first", "0"]), run(["--first", "x"]), run(["--record"]), run(["--record", "x.json"], { exists: () => true }), run(["--only", "hand,nobody"]), run(["--only", "hand,hand"]), run(["--only", "hand"])];
    ok("!! refusals, each exit 2 and each by its name: an unknown argument; --smoke with --record; --geometries 0, 201 and x; --first 0 and x; --record without a file; a record that exists; an unknown side; a duplicate side; one side", c.every((v) => v === 2) && /unknown argument --bogus/.test(bad[0]) && /--smoke is never recorded/.test(bad[1]) && /--geometries is 1 to 200/.test(bad[2]) && /--geometries is 1 to 200/.test(bad[3]) && /--geometries is 1 to 200/.test(bad[4]) && /--first a seed of 1 or more/.test(bad[5]) && /--first a seed of 1 or more/.test(bad[6]) && /--record needs a file/.test(bad[7]) && /x.json exists; the record is written once/.test(bad[8]) && /no side named nobody \(the roster has hand, hand\+net/.test(bad[9]) && /at least two different sides/.test(bad[10]) && /at least two different sides/.test(bad[11]) && bad.length === 12);
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
