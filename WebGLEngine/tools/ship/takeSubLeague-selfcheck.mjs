// WebGLEngine/tools/ship/takeSubLeague-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeSubLeague-selfcheck.mjs      (about 70 s: the read on smoke geometries 1 to 4 with run files MADE FROM THE TWO LEAGUES OF THE NOTES -- NEVER the geometries 96001 to 96024, and never a real run file)
//
// THE GATE OF tools/ship/takeSubLeague.mjs (the registration is brain/SUB_LEAGUE_WIP.md, part B):
//   1 CONSTANTS     the files, the seeds (7100 to 7105 leagues, 7200 to 7205 exploiters, the two old leagues), the set (96001 for 24), the bars (0.5, z 2, robust at 6, fragile at 2), the directions
//   2 THE RULES     finds at its edges, the verdict at 0 to 8, the median
//   3 THE LOADER    the runs from files: the shape of a league (5 thetas) and of an exploiter (3), generation 0 the search-ping champion, every theta finite and inside its bounds, each failure named, the missing files listed
//   4 THE READ      on the smoke geometries with fixture files: the rows to the number, the leagues' count and verdict, the exploiters, the cross-play of the eight final generations, the checks
//   5 THE COMMAND   the output to the byte, every refusal by name, the record written once through the stub, the program run
//   6 THE SOURCE    no clock, no random number; the headers; ASCII
// NOT CHECKED, said plainly: the verdict on the real runs (that is the read of brain/SUB_LEAGUE_WIP.md, flown by the command once the twelve runs exist).
//
// SABOTAGES: written after the gate; the log is added below when the pass is done.
"use strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./takeSubLeague.mjs";
import * as TA from "../../brain/subTactics.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const J = JSON.stringify;
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const R = new URL("../../", import.meta.url), real = (f) => JSON.parse(fs.readFileSync(new URL(f, R), "utf8")), OLD = real(X.OLD_FILE), PING = real(X.PING_FILE);
const fixture = (over = {}) => (f) => {   // every new run file is a copy of one of the two old leagues (an exploiter: the first three thetas of 7001); `over` replaces a path
    if (f in over) return over[f];
    const m = f.match(/league(\d+)\.json$/), e = f.match(/exploit(\d+)\.json$/);
    if (m && f.startsWith(X.DIR)) return OLD[Number(m[1]) % 2 ? "league7001" : "league7000"];
    if (e && f.startsWith(X.DIR)) { const o = OLD.league7001; return { thetas: [o.thetas[0], o.thetas[1], o.thetas[2]] }; }
    return f === X.OLD_FILE ? OLD : f === X.PING_FILE ? PING : null;
};

console.log("1. CONSTANTS");
{
    ok("!! the files, the seeds (six leagues from 7100, six exploiters from 7200, the two old leagues), the read set (96001 for 24, smoke 1 for 4), the bars (edge 0.5, z 2, robust at 6, fragile at 2) and the seven directions; all frozen", X.DIR === "brain/subLeagueRuns" && X.OLD_FILE === "brain/subTacticsLeagueWip.json" && X.PING_FILE === "brain/subTacticsThetaSearchPingWip.json" && X.READ_FILE === "brain/subLeagueRead.json" && J(X.LEAGUE_SEEDS) === "[7100,7101,7102,7103,7104,7105]" && J(X.EXPLOIT_SEEDS) === "[7200,7201,7202,7203,7204,7205]" && J(X.OLD_KEYS) === '["league7000","league7001"]' && J(X.SETS) === '{"smoke":{"first":1,"count":4},"read":{"first":96001,"count":24}}' && X.FIND_EDGE === 0.5 && X.FIND_Z === 2 && X.ROBUST === 6 && X.FRAGILE === 2 && J(X.DIRECTION) === '["searchPing","aimTol","evadeTurn","echoWindow","searchSpeed","trackSpeed","fireRange"]' && [X.SETS, X.LEAGUE_SEEDS, X.EXPLOIT_SEEDS, X.OLD_KEYS, X.DIRECTION, ...Object.values(X.SETS)].every(Object.isFrozen));
}

console.log("\n2. THE RULES");
{
    ok("!! finds: an edge of 0.5 with z 2 finds; 0.4999 or z 1.9999 does not; a negative edge never; the two bars are AND", X.finds({ edge: 0.5, z: 2 }) && !X.finds({ edge: 0.4999, z: 5 }) && !X.finds({ edge: 3, z: 1.9999 }) && !X.finds({ edge: -3, z: 9 }) && X.finds({ edge: 3, z: 2 }));
    ok("!! verdictOf: 8 and 6 are ROBUST, 5 to 3 MIXED, 2 and 0 FRAGILE (the edges 6 and 2 belong to the extremes)", ["8:ROBUST", "7:ROBUST", "6:ROBUST", "5:MIXED", "4:MIXED", "3:MIXED", "2:FRAGILE", "1:FRAGILE", "0:FRAGILE"].every((s) => X.verdictOf(Number(s.split(":")[0])) === s.split(":")[1]));
    ok("median: odd, even, one, and empty is NaN; it does not reorder its argument", X.median([3, 1, 2]) === 2 && X.median([4, 1, 3, 2]) === 2.5 && X.median([7]) === 7 && Number.isNaN(X.median([])) && (() => { const a = [3, 1, 2]; X.median(a); return J(a) === "[3,1,2]"; })());
}

console.log("\n3. THE LOADER");
{
    const L = X.loadRuns(fixture());
    ok("!! with fixtures the loader returns 14 runs in the order: the two old leagues, six leagues, six exploiters; each with a kind, a seed, generation 0 (the search-ping champion) and a final theta; leagues have 3 generations, exploiters 1", L.runs && L.runs.length === 14 && J(L.runs.map((r) => r.id)) === J(["league7000", "league7001", ...X.LEAGUE_SEEDS.map((s) => "league" + s), ...X.EXPLOIT_SEEDS.map((s) => "exploit" + s)]) && J(L.runs.map((r) => r.kind)) === J(["old", "old", "league", "league", "league", "league", "league", "league", "exploit", "exploit", "exploit", "exploit", "exploit", "exploit"]) && L.runs.every((r) => J(r.gen0) === J(TA.clampTheta(PING.theta))) && L.runs.slice(0, 8).every((r) => r.generations === 3) && L.runs.slice(8).every((r) => r.generations === 1) && L.runs[8].seed === 7200 && L.runs[1].seed === 7001);
    const err = (over) => X.loadRuns(fixture(over)).error || "";
    ok("!! each failure by its name: the search-ping file missing; a run file missing (all the missing ones listed); a league with 4 thetas; an exploiter with 5; a theta with a NaN; a theta outside its bounds; generation 0 that is not the champion", /search\w*Wip.json is missing|ThetaSearchPingWip.json is missing/.test(X.loadRuns(() => null).error) && /^missing: league7100, exploit7203$/.test(err({ [X.DIR + "/league7100.json"]: null, [X.DIR + "/exploit7203.json"]: null })) && /league7101 has 4 thetas, not 5/.test(err({ [X.DIR + "/league7101.json"]: { thetas: OLD.league7001.thetas.slice(0, 4) } })) && /exploit7200 has 5 thetas, not 3/.test(err({ [X.DIR + "/exploit7200.json"]: OLD.league7001 })) && /league7102 has a theta that is not finite or not inside its bounds/.test(err({ [X.DIR + "/league7102.json"]: { thetas: OLD.league7001.thetas.map((t, i) => (i === 3 ? { ...t, aimTol: NaN } : t)) } })) && /league7103 has a theta that is not finite or not inside its bounds/.test(err({ [X.DIR + "/league7103.json"]: { thetas: OLD.league7001.thetas.map((t, i) => (i === 4 ? { ...t, fireRange: 9999 } : t)) } })) && /league7104: generation 0 is not the search-ping champion/.test(err({ [X.DIR + "/league7104.json"]: { thetas: OLD.league7001.thetas.map((t, i) => (i === 1 ? { ...t, aimTol: 0.2 } : t)) } })));
    ok("the failures are collected, not stopped at the first (a missing file and a bad one are both said)", /^missing: league7100; league7101 has 4 thetas, not 5$/.test(err({ [X.DIR + "/league7100.json"]: null, [X.DIR + "/league7101.json"]: { thetas: OLD.league7001.thetas.slice(0, 4) } })));
    ok("a file that is a JSON null, or an object without `thetas`, counts as missing", /^missing: league7105$/.test(err({ [X.DIR + "/league7105.json"]: {} })) && /^missing: exploit7204$/.test(err({ [X.DIR + "/exploit7204.json"]: { seed: 1 } })));
}

console.log("\n4. THE READ (smoke geometries, fixture files)");
{
    const runs = X.loadRuns(fixture()).runs, r = X.readLeagues(runs, "smoke");
    ok("!! the rows to the number: the old league 7000 does not find one (edge -0.021, z -13.5, 4-0-4), league 7001 does (edge +3.239, 8-0-0), an exploiter (the first thetas of 7001) does not (+0.024, z 10.1); the directions are final minus generation 0 (7001: searchPing -7.69, evadeTurn +1.09, echoWindow +5.88)", r.rows.length === 14 && r.rows[0].finds === false && Math.abs(r.rows[0].edge - -0.021) < 0.0005 && r.rows[0].winsX === 4 && r.rows[0].winsY === 4 && r.rows[1].finds === true && Math.abs(r.rows[1].edge - 3.239) < 0.0005 && r.rows[1].winsX === 8 && r.rows[1].winsY === 0 && Math.abs(r.rows[1].direction.searchPing - -7.69) < 0.01 && Math.abs(r.rows[1].direction.evadeTurn - 1.09) < 0.01 && Math.abs(r.rows[1].direction.echoWindow - 5.88) < 0.01 && r.rows[8].finds === false && Math.abs(r.rows[8].edge - 0.024) < 0.0005);
    ok("!! the tallies: the leagues are the 8 non-exploiters with 4 finding one (median edge 1.609: MIXED), the exploiters 6 with 0 (median +0.024); the cross-play of the eight finals has 28 pairs, 16 decided by 0.5 at z 2, no cycle; no check failed", r.leagues.n === 8 && r.leagues.finds === 4 && r.leagues.verdict === "MIXED" && Math.abs(r.leagues.medianEdge - 1.609223) < 1e-6 && r.exploiters.n === 6 && r.exploiters.finds === 0 && Math.abs(r.exploiters.medianEdge - 0.024028) < 1e-6 && r.cross.edges.length === 28 && r.cross.decisive === 16 && J(r.cross.cycles) === "[]" && J(r.checks) === "[]" && r.set === "smoke");
    ok("!! the checks: fewer than eight leagues and fewer than six exploiters are said by their counts", /7 leagues, not 8/.test(X.readLeagues(runs.filter((x) => x.id !== "league7100"), "smoke").checks.join()) && /5 exploiters, not 6/.test(X.readLeagues(runs.filter((x) => x.id !== "exploit7200"), "smoke").checks.join()));
}

console.log("\n5. THE COMMAND");
{
    const lines = []; const code = X.command(["read", "--smoke"], { read: fixture(), log: (s) => lines.push(s), write: () => { throw new Error("must not write") } }), out = lines.join("\n") + "\n";
    ok("!! the smoke read on the fixtures prints the header, one line a run (14), the leagues, the exploiters and the cross-play (18 lines), exit 0, and the whole output to the byte (sha256)", code === 0 && lines.length === 18 && /^\[takeSubLeague\] the replicated leagues, final generation against generation 0 on geometries 1 to 4 \(both seats\)/.test(lines[0]) && lines[15] === "  LEAGUES: 4 of 8 find one (median edge +1.609)  ->  the recipe is MIXED (at least 6 of 8 is ROBUST, at most 2 FRAGILE)" && lines[17] === "  CROSS-PLAY of the eight final generations: 16 of 28 pairs decided by at least 0.5 at z 2; no cycle" && sha(out) === "eaa1d6e9bcf1de027ea3889a09be98d89e84b70a30eeb09ac8096316062a35d2", sha(out));
    const bad = [], run = (a, o = {}) => X.command(a, { read: fixture(), log: (s) => bad.push(s), exists: () => false, write: () => { throw new Error("must not write"); }, ...o });
    const c = [run([]), run(["flirt"]), run(["read", "--bogus"]), run(["read", "--smoke", "--write"]), run(["read"]), run(["read", "--write"], { exists: () => true }), run(["read", "--smoke"], { read: () => null }), run(["read", "--smoke"], { read: fixture({ [X.DIR + "/league7100.json"]: null }) })];
    ok("!! refusals, each exit 2 and by its name and nothing flown: no argument and an unknown mode print the usage; an unknown argument is named; --smoke with --write; read with neither flag (the real set is flown only with --write); a record that exists; the files missing (the search-ping file; one league run)", c.every((v) => v === 2) && /^usage:/.test(bad[0]) && /^usage:/.test(bad[1]) && /unknown argument --bogus/.test(bad[2]) && /--smoke is never recorded/.test(bad[3]) && /run read with --write \(or --smoke/.test(bad[4]) && /subLeagueRead.json exists; the read is flown once/.test(bad[5]) && /ThetaSearchPingWip.json is missing/.test(bad[6]) && /missing: league7100/.test(bad[7]) && bad.length === 8);
    const w = []; const cw = X.command(["read", "--write"], { set: "smoke", read: fixture(), log: () => {}, exists: () => false, write: (f, s) => w.push([f, s]) });
    const parsed = w.length === 1 ? JSON.parse(w[0][1]) : null;
    ok("!! with --write (through the override that flies the smoke geometries) the record is written once to brain/subLeagueRead.json with the set, the 14 rows, the leagues' count and the cross-play; exit 0", cw === 0 && w.length === 1 && w[0][0] === "brain/subLeagueRead.json" && parsed.set === "smoke" && parsed.rows.length === 14 && parsed.leagues.finds === 4 && parsed.cross.edges.length === 28 && w[0][1].endsWith("}\n"));
    const prog = fileURLToPath(new URL("./takeSubLeague.mjs", import.meta.url)), flags = ["--preserve-symlinks", "--preserve-symlinks-main", prog];
    const pa = spawnSync(process.execPath, flags, { encoding: "utf8", timeout: 60000 }), pb = spawnSync(process.execPath, [...flags, "read"], { encoding: "utf8", timeout: 60000 }), pc = spawnSync(process.execPath, [...flags, "read", "--smoke"], { encoding: "utf8", timeout: 60000 });
    ok("!! run as a program (symlinks preserved so a mutant is the one that runs): no argument exits 2 with the usage; read without a flag exits 2; read --smoke without the twelve run files exits 2 naming what is missing -- and none flew a set", pa.status === 2 && /^usage:/.test(pa.stdout) && pb.status === 2 && /run read with --write/.test(pb.stdout) && pc.status === 2 && /^takeSubLeague: missing: league7100, league7101/.test(pc.stdout), [pa.status, pb.status, pc.status].join());
    const pd = spawnSync(process.execPath, ["--preserve-symlinks", "--input-type=module", "-e", `import(${J(prog)})`], { encoding: "utf8", timeout: 60000 });
    ok("!! imported from `node -e` (no script path in argv) the command runs nothing, prints nothing and does not throw", pd.status === 0 && pd.stdout === "" && pd.stderr === "", String(pd.status) + " " + pd.stderr.slice(0, 120));
    ok("importing the command sets no exit code", process.exitCode === undefined);
}

console.log("\n6. THE SOURCE");
{
    const cmd = fs.readFileSync(new URL("./takeSubLeague.mjs", import.meta.url), "utf8"), code = (t) => t.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*")).join("\n"), reg = fs.readFileSync(new URL("../../brain/SUB_LEAGUE_WIP.md", import.meta.url), "utf8");
    ok("!! the command has no clock and no Math.random", !/Math\.random|Date\.now|new Date|performance\.now/.test(code(cmd)));
    ok("the header names the registration and the gate, and the file is ASCII", /SUB_LEAGUE_WIP\.md/.test(cmd) && /takeSubLeague-selfcheck\.mjs/.test(cmd) && !/[^\x00-\x7F]/.test(cmd));
    ok("!! the registration's seeds (7100 to 7105, 7200 to 7205), its set (96001 to 96024), its bars (0.5, z at least 2, 6 of the 8, 2) and the two commands are the code's", /seeds 7100 to 7105/.test(reg) && /\*\*seeds 7100 to 7105\*\*/.test(reg) && /\*\*seeds 7200 to 7205\*\*/.test(reg) && /96001 to 96024/.test(reg) && /edge of at least 0\.5 with z at least 2/.test(reg) && /ROBUST iff at least 6 of the 8/.test(reg) && /FRAGILE iff at most 2/.test(reg) && /--gens 3 --iters 60/.test(reg) && /--gens 1 --iters 180/.test(reg));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
