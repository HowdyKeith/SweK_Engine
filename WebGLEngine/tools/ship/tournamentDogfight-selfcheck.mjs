// WebGLEngine/tools/ship/tournamentDogfight-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/tournamentDogfight-selfcheck.mjs      (~5 s)
//
// THE TOURNAMENT'S DOOR AND ITS COMMAND. tools/ship/tournamentDogfight.mjs loads the shipped pilots from their files and runs brain/dogfightTournament.mjs over them; the maths has its own gate (brain/dogfightTournament-selfcheck.mjs), the committed numbers
// have theirs (tools/ship/tournamentDogfightShipped-selfcheck.mjs, which flies the whole round robin again). This one holds what is between them.
//
//   1  THE ROSTER      is the dogfight page's roster (the same labels, the same files, the same policies), frozen; the league pilots are optional and nothing else is
//   2  LOADING         through the page's own importer: the right pilots in roster order from a directory of real files, the weights hash the page prints, a pilot that flies exactly what PF/MF.pilotFor of the imported weights fly;
//                      a file for the wrong policy, with the wrong weight count or with a non-finite weight is REFUSED BY NAME and a missing required file is named; an optional file that is absent is skipped and SAID; --only takes ids in roster order and refuses an unknown one
//   3  THE ARGUMENTS   one pass, an unknown option refused, a positional refused, --only needs two different ids, --record needs a path and not another option
//   4  THE COMMAND     with the fights stubbed: the roster line, a progress line per pair, the report, the record written exactly once to the path given; --smoke flies the four throwaway duels and --quiet silences the progress lines but not the report;
//                      a bad argument, an unloadable roster and a roster of one are exit 2 with the reason on stderr and no fight flown
//   5  THE RECORD      a small real round robin written as a record: every pair, the ratings best first, the field edges, the stability rows, rounded to 1e-6, the same bytes twice
//   6  THE ENTRY POINT the command file exports nothing and calls the library; run for real on two pilots it exits 0 and prints the report, and on a bad id it exits 2
//
// SABOTAGE LOG -- FORTY MUTANTS of tools/ship/tournamentDogfight.mjs, each applied in a scratch tree (the entry point COPIED into it, because a symlink would resolve to the real library and import the unmutated one), the gate run, the tree discarded; every one red by name (the number is how many rows went red):
//   R01 a label differs from the page's 2 | R02 flyDogfight points at the flight file 4 | R03 gpuFlight on the fruit fly's module 1 | R04 the roster not frozen 1 | R05 the fruit fly league pilot not optional 1 | R06 the GPU league file named differently 1 | R07 an unknown --only id accepted 2 |
//   R08 the importer bypassed 4 | R09 no hash 3 | R10 a missing required file skipped 1 | R11 a skipped pilot not named 3 | R12 --only ignored 1 | R13 the loaded function from the wrong module 1 | R14 unknown options accepted 2 | R15 --only of one accepted 1 | R16 a pilot named twice accepted 1 |
//   R17 --record takes the next option 1 | R18 --smoke flies the tournament set 2 | R19 the record written twice 1 | R20 a bad argument exits 1 2 | R21 a roster of one flown 1 | R22 --quiet silences the report 2 | R23 seat bias for the first pilot only 1 | R24 the skipped pilots not on the roster line 1 |
//   R25 the set's seeds swapped in the record 3 | R26 no rounding in the record 1 | R27 ratings not sorted in the record 2 | R28 field edges sorted ascending 2 | R29 an infinite number written as null 1 | R30 the smoke set's seeds wrong 1 | R31 the record path ignored 1 | R32 progress under --quiet 1 |
//   R33 an unloadable roster exits 0 2 | R34 the cycles missing from the record 1 | R35 the stability rows missing from the record 1 | R36 the command returns nothing 3 | R37 the hand pilot given a hash 1 | R38 --only passed on as a string 3 | R39 the pair progress line rounded wrong 1 | R40 the pairs missing from the record 1.
//   FIVE WENT 0 RED THE FIRST TIME AND WHAT THE GATE WAS MISSING IS NOW IN IT. R27, R28, R40: the stand-in roster was already in rating order, so a record that listed the ratings in roster order read the same (the roster is now worst first); R34, R35: the record row's last clause was `A && B && C || D` and the `||` made it true
//   whenever the stability list was empty -- and with six scenarios it always was, the stability sizes starting at ten (the record test now flies twelve and asks for the row); R30: the smoke record's seeds were never read.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as TD from "./tournamentDogfight.mjs";
import * as T from "../../brain/dogfightTournament.mjs";
import * as D from "../../brain/dogfightTask.mjs";
import * as AF from "../../brain/autopilotFlight.mjs";
import * as PF from "../../brain/pilotFlightPolicy.mjs";
import * as MF from "../../brain/pilotFlightMlp.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const sec = (t) => console.log("\n" + t);
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

console.log("tournamentDogfight-selfcheck -- the shipped pilots, loaded and put through the round robin\n");

const BRAIN = path.join(ENG, "brain");
const blob = (f) => JSON.parse(fs.readFileSync(path.join(BRAIN, f), "utf8"));
/** An in-memory directory: { file -> object or string }. */
const memdir = (files) => ({ dir: "/mem", read: (f) => { const k = path.basename(f); const v = files[k]; return typeof v === "string" ? v : JSON.stringify(v); }, exists: (f) => path.basename(f) in files });
const real = () => Object.fromEntries(TD.ROSTER.filter((r) => r.file && !r.optional).map((r) => [r.file, blob(r.file)]));

sec("1. THE ROSTER");
{
    const page = fs.readFileSync(path.join(ENG, "dogfight.html"), "utf8");
    const policies = { pilotFlightPolicy: PF, pilotFlightMlp: MF };
    ok("!! THE ROSTER IS THE DOGFIGHT PAGE'S: every shipped pilot of the page (the PD autopilot, fruit fly FLY and FIGHT, GPU Brain FLY and FIGHT) is here with the page's label, the page's file and the page's policy, in the page's order; the page's two hand-weights entries (they ARE the autopilot, to a rounding) are not",
        (() => { const rows = [...page.matchAll(/\{ id: "(\w+)", label: "([^"]+)", policy: (\w+), policyId: "(\w+)", file: "\/brain\/([\w.]+)" \}/g)].map((m) => ({ id: m[1], label: m[2], policyId: m[4], file: m[5] })); const mine = TD.ROSTER.filter((r) => r.file && !r.optional);
            return rows.length === 4 && rows.every((r, i) => mine[i].label === r.label && mine[i].file === r.file && mine[i].policyId === r.policyId) && /\{ id: "pd", label: "PD autopilot/.test(page) && TD.ROSTER[0].hand === true && TD.ROSTER[0].id === "autopilot"; })(),
        TD.ROSTER.map((r) => r.id).join(", "));
    ok("!! THE POLICY OF EACH ENTRY IS THE MODULE ITS FILE IS FOR: pilotFlightPolicy is the fruit fly's module and pilotFlightMlp the GPU Brain's CPU twin, for the flight, the dogfight and the league files alike", TD.ROSTER.filter((r) => r.policy).every((r) => r.policy === policies[r.policyId] && r.policy.WEIGHT_COUNT === (r.policyId === "pilotFlightPolicy" ? 1099 : 1796)));
    ok("the roster has the ids it says, in order; only the two league pilots are optional; the entries are frozen and ids are unique", TD.ROSTER.map((r) => r.id).join() === "autopilot,flyFlight,flyDogfight,gpuFlight,gpuDogfight,flyLeague,gpuLeague" && TD.ROSTER.filter((r) => r.optional).map((r) => r.id).join() === "flyLeague,gpuLeague" && Object.isFrozen(TD.ROSTER) && TD.ROSTER.every((r) => Object.isFrozen(r)) && new Set(TD.ROSTER.map((r) => r.id)).size === TD.ROSTER.length);
    ok("the league entries point at the files the league trainer writes (tools/ship/trainDogfightLeague.mjs, when a champion qualifies)", TD.ROSTER.find((r) => r.id === "flyLeague").file === "pilotDogfightWeightsLeague.json" && TD.ROSTER.find((r) => r.id === "gpuLeague").file === "pilotDogfightMlpWeightsLeague.json");
}

sec("2. LOADING");
{
    const files = real(), L = TD.loadRoster(memdir(files)), ids = L.pilots.map((p) => p.id);
    ok("!! FROM A DIRECTORY OF THE REAL FILES THE FIVE SHIPPED PILOTS LOAD IN ROSTER ORDER and the two league pilots, whose files are not in it, are SKIPPED and named", ids.join() === "autopilot,flyFlight,flyDogfight,gpuFlight,gpuDogfight" && L.skipped.join() === "flyLeague,gpuLeague" && L.pilots[0].fn === AF.pilot && L.pilots[0].hash === null && L.pilots[0].file === null && L.pilots.slice(1).every((p) => /^[0-9a-f]{8}$/.test(p.hash) && p.file));
    const dog = L.pilots.find((p) => p.id === "flyDogfight"), gdog = L.pilots.find((p) => p.id === "gpuDogfight"), w = Float32Array.from(blob("pilotDogfightWeightsDefault.json").weights), gw = Float32Array.from(blob("pilotDogfightMlpWeightsDefault.json").weights);
    ok("!! THE HASH IS THE PAGE'S: weightsHash of the imported (float32) weights, for each pilot with a file, and the printed hash of the fruit fly's dogfight file is dc5ee8ed as the page shows it", dog.hash === weightsHash(w) && gdog.hash === weightsHash(gw) && dog.hash === "dc5ee8ed" && gdog.hash === "6c2cb228" && dog.file === "pilotDogfightWeightsDefault.json");
    const sc = D.scenario(7, "duel"), direct = D.duel(PF.pilotFor(w), sc, { pilotB: MF.pilotFor(gw) }), loaded = D.duel(dog.fn, sc, { pilotB: gdog.fn });
    ok("!! A LOADED PILOT FLIES WHAT THE IMPORTED WEIGHTS FLY: the fruit fly's dogfight pilot against the GPU Brain's on duel 7 is, field for field and to the fingerprint, the fight of PF.pilotFor and MF.pilotFor of the same weights", JSON.stringify(direct) === JSON.stringify(loaded) && loaded.fingerprint === direct.fingerprint, loaded.fingerprint);
    const flyD = files["pilotDogfightWeightsDefault.json"], gpuD = files["pilotDogfightMlpWeightsDefault.json"];
    const wrongPolicy = throws(() => TD.loadRoster(memdir({ ...files, "pilotDogfightWeightsDefault.json": gpuD })));
    ok("!! A FILE FOR THE WRONG POLICY IS REFUSED BY NAME (the GPU Brain's file put where the fruit fly's belongs): the error names the pilot and the file and says which policy the brain is for", /flyDogfight: pilotDogfightWeightsDefault\.json refused: this brain is for "pilotFlightMlp", not "pilotFlightPolicy"/.test(wrongPolicy || ""), wrongPolicy);
    const shortW = throws(() => TD.loadRoster(memdir({ ...files, "pilotFlightWeightsDefault.json": { ...files["pilotFlightWeightsDefault.json"], weights: files["pilotFlightWeightsDefault.json"].weights.slice(1) } })));
    ok("!! A STALE EXPORT (one weight short) IS REFUSED BY NAME, with the count it has and the count the policy now wants", /flyFlight: pilotFlightWeightsDefault\.json refused: weight count 1098 does not match pilotFlightPolicy's current 1099/.test(shortW || ""), (shortW || "").slice(0, 140));
    const nan = throws(() => TD.loadRoster(memdir({ ...files, "pilotFlightMlpWeightsDefault.json": { ...files["pilotFlightMlpWeightsDefault.json"], weights: files["pilotFlightMlpWeightsDefault.json"].weights.map((v, i) => (i === 5 ? "x" : v)) } })));
    ok("!! A WEIGHT THAT IS NOT A NUMBER IS REFUSED BY NAME, and so is one that overflows float32 (1e40)", /gpuFlight: pilotFlightMlpWeightsDefault\.json refused: a weight is not a finite number/.test(nan || "") && /gpuDogfight: pilotDogfightMlpWeightsDefault\.json refused: weight 3 \(1e\+40\) is finite as JSON but overflows/.test(throws(() => TD.loadRoster(memdir({ ...files, "pilotDogfightMlpWeightsDefault.json": { ...gpuD, weights: gpuD.weights.map((v, i) => (i === 3 ? 1e40 : v)) } }))) || ""));
    const gone = { ...files }; delete gone["pilotFlightMlpWeightsDefault.json"];
    ok("!! A REQUIRED FILE THAT IS MISSING IS NAMED (the pilot and the file), and it stops the load: a tournament with a pilot silently left out would rate the rest without it", /gpuFlight: pilotFlightMlpWeightsDefault\.json is missing/.test(throws(() => TD.loadRoster(memdir(gone))) || ""));
    const withLeague = TD.loadRoster(memdir({ ...files, "pilotDogfightWeightsLeague.json": flyD }));
    ok("!! AN OPTIONAL FILE THAT IS THERE IS LOADED, in roster order after the shipped five, and the one that is absent is still skipped: with only the fruit fly's league file present, the roster is the five plus flyLeague and gpuLeague is the one skipped", withLeague.pilots.map((p) => p.id).join() === "autopilot,flyFlight,flyDogfight,gpuFlight,gpuDogfight,flyLeague" && withLeague.skipped.join() === "gpuLeague" && withLeague.pilots.at(-1).hash === dog.hash);
    ok("an optional file that is there but refused is an ERROR and not a skip (a league file that does not load is not 'no league pilot')", /flyLeague: pilotDogfightWeightsLeague\.json refused: this brain is for/.test(throws(() => TD.loadRoster(memdir({ ...files, "pilotDogfightWeightsLeague.json": gpuD }))) || ""));
    const some = TD.loadRoster({ ...memdir(files), only: ["gpuDogfight", "autopilot", "flyFlight"] });
    ok("!! --only TAKES IDS IN ROSTER ORDER, NOT THE ORDER GIVEN, loads only those, and does not complain about the league files it was not asked for; an unknown id is refused by name with the ids that exist", some.pilots.map((p) => p.id).join() === "autopilot,flyFlight,gpuDogfight" && some.skipped.length === 0 && /unknown pilot "nobody" \(known: autopilot, flyFlight, flyDogfight, gpuFlight, gpuDogfight, flyLeague, gpuLeague\)/.test(throws(() => TD.loadRoster({ ...memdir(files), only: ["autopilot", "nobody"] })) || ""));
    const disk = TD.loadRoster();
    ok("the real directory loads: the five shipped pilots first (their hashes as above) and any league file that is there after them", disk.pilots.slice(0, 5).map((p) => p.id).join() === "autopilot,flyFlight,flyDogfight,gpuFlight,gpuDogfight" && disk.pilots.slice(0, 5).slice(1).map((p) => p.hash).join() === "88b2761f,dc5ee8ed,1ba1b116,6c2cb228" && disk.pilots.length + disk.skipped.length === 7, `${disk.pilots.length} loaded, skipped: ${disk.skipped.join(", ") || "none"}`);
}

sec("3. THE ARGUMENTS");
{
    const pa = TD.parseArgs;
    ok("!! DEFAULTS, AND EVERY OPTION: no arguments is the whole roster over the tournament set; --only a,b (spaces trimmed), --record f, --smoke and --quiet are read", (() => { const d = pa([]), o = pa(["--only", "autopilot, flyDogfight", "--record", "r.json", "--smoke", "--quiet"]); return d.only === null && d.record === null && d.smoke === false && d.quiet === false && o.only.join() === "autopilot,flyDogfight" && o.record === "r.json" && o.smoke === true && o.quiet === true; })());
    ok("!! A TYPO IS REFUSED, NOT RUN: an unknown option and a positional argument are errors that name what was given and (for an option) what is known", /unknown option "--onyl" \(known: --only, --record, --smoke, --quiet\)/.test(throws(() => pa(["--onyl", "a,b"])) || "") && /unexpected argument "autopilot"/.test(throws(() => pa(["autopilot"])) || ""));
    ok("!! --only NEEDS TWO DIFFERENT PILOTS (a tournament of one, or of the same pilot twice, is not one), and --record NEEDS A PATH and not the next option", /needs at least two/.test(throws(() => pa(["--only", "autopilot"])) || "") && /names a pilot twice/.test(throws(() => pa(["--only", "autopilot,autopilot"])) || "") && /--record needs a value/.test(throws(() => pa(["--record", "--smoke"])) || "") && /--record needs a value/.test(throws(() => pa(["--record"])) || "") && /--only needs a value/.test(throws(() => pa(["--only"])) || ""));
}

sec("4. THE COMMAND (the fights stubbed)");
{
    const stubPilots = [{ id: "a", label: "Pilot A", fn: AF.pilot, file: null, hash: null }, { id: "b", label: "Pilot B", fn: AF.pilot, file: "b.json", hash: "0badf00d" }];
    // sixty scenarios, two fights each: 70 fights led by 0.2, 30 level, 20 trailed by 0.2 -- real records, because the report refits the ratings on prefixes of them
    const fights = Array.from({ length: 120 }, (_, i) => ({ seed: 4000 + (i >> 1), seat: i % 2 ? "B" : "A", sx: i < 70 ? 0.2 : i < 100 ? 0 : -0.2, sy: 0, statusX: "airborne", statusY: "airborne", xKilledY: false, yKilledX: false, ticks: 1800 }));
    const stubSummary = T.summarize(fights), stubResult = { ids: ["a", "b"], scenarios: 60, pairs: { "a|b": { x: "a", y: "b", fights, summary: stubSummary } } };
    const run = (argv, over = {}) => { const out = [], err = [], wrote = [], calls = { rr: [], seat: [], load: [] };
        const io = { out: (m) => out.push(m), err: (m) => err.push(m), writeFile: (f, c) => wrote.push([f, c]), load: (o) => { calls.load.push(o); return { pilots: stubPilots, skipped: ["flyLeague"] }; }, rr: (pilots, set, opts, onPair) => { calls.rr.push({ ids: pilots.map((p) => p.id), n: set.length, first: set[0].seed }); onPair(stubResult.pairs["a|b"], 1, 1); return stubResult; }, seatOf: (p, set) => { calls.seat.push([p.id, set.length]); return { n: set.length, mean: 0.05, se: 0.1, z: 0.5 }; }, ...over };
        const code = TD.command(argv, io); return { code, out, err, wrote, calls }; };
    const r = run([]);
    ok("!! THE COMMAND FLIES THE ROSTER OVER THE TOURNAMENT SET AND REPORTS: exit 0, one round robin over [a, b] on the 120 tournament duels (the first is seed 4000), a roster line naming each pilot with its hash and the skipped league pilot, a progress line for the pair, the report with the labels, and no record written", r.code === 0 && r.calls.rr.length === 1 && r.calls.rr[0].ids.join() === "a,b" && r.calls.rr[0].n === 120 && r.calls.rr[0].first === 4000 && /^roster: a, b 0badf00d \(no file yet for: flyLeague\); TOURNAMENT_SET: 120 duels/.test(r.out[0]) && r.out.some((l) => l === `  pair 1/1: a against b: 70-30-20, edge ${stubSummary.edge.toFixed(3)} +- ${stubSummary.se.toFixed(3)}`) && r.out.some((l) => /Pilot A/.test(l)) && r.out.some((l) => /WINS-DRAWS-LOSSES/.test(l)) && r.wrote.length === 0 && r.err.length === 0, r.out[0].slice(0, 120));
    ok("!! THE SEAT BIAS IS MEASURED FOR EVERY PILOT ON THE SAME SET: one seatOf call per pilot, over the 120 duels, and the report has a seat line for each", r.calls.seat.length === 2 && r.calls.seat.every(([, n]) => n === 120) && r.out.filter((l) => /^ {2}SEAT \(/.test(l)).length === 2);
    const q = run(["--quiet"]);
    ok("--quiet silences the roster and progress lines and keeps the report", q.code === 0 && !q.out.some((l) => /^roster:|pair 1\/1/.test(l)) && q.out.some((l) => /WINS-DRAWS-LOSSES/.test(l)));
    const sm = run(["--smoke"]);
    ok("!! --smoke FLIES THE FOUR THROWAWAY DUELS (seeds 9100..9103, in no audit and no training set), says so, and the stability sizes are cut to what was flown", sm.code === 0 && sm.calls.rr[0].n === 4 && sm.calls.rr[0].first === 9100 && /LEAGUE_SMOKE_SET: 4 duels/.test(sm.out[0]) && sm.calls.seat.every(([, n]) => n === 4));
    const rec = run(["--record", "/tmp/x/record.json"]);
    ok("!! --record WRITES THE RECORD ONCE, to the path given, as JSON that parses and carries the pilots, the pairs, the ratings and the set (TOURNAMENT_SET, seeds 4000..4119), and says where", rec.wrote.length === 1 && rec.wrote[0][0] === "/tmp/x/record.json" && (() => { const j = JSON.parse(rec.wrote[0][1]); return j.set.name === "TOURNAMENT_SET" && j.set.seeds.join() === "4000,4119" && j.pilots.length === 2 && j.pairs.length === 1 && j.ratings.length === 2 && j.pilots[1].hash === "0badf00d"; })() && rec.out.at(-1) === "wrote the record to /tmp/x/record.json");
    ok("the record of a --smoke run says it is the smoke set (a smoke record is never the committed one)", (() => { const j = JSON.parse(run(["--smoke", "--record", "/tmp/y.json"]).wrote[0][1]); return j.set.name === "LEAGUE_SMOKE_SET" && j.set.seeds.join() === "9100,9103"; })());
    const bad = run(["--onyl", "a,b"]), none = run([], { load: () => { throw new Error("gpuFlight: pilotFlightMlpWeightsDefault.json is missing"); } }), one = run([], { load: () => ({ pilots: [stubPilots[0]], skipped: [] }) });
    ok("!! A BAD ARGUMENT, AN UNLOADABLE ROSTER AND A ROSTER OF ONE ARE EXIT 2 WITH THE REASON ON STDERR, and no fight is flown in any of them: the typo is named, the missing file is named, the roster of one says 1 pilot loaded and a tournament needs two", bad.code === 2 && /^runDogfightTournament: unknown option "--onyl"/.test(bad.err[0]) && bad.calls.rr.length === 0 && none.code === 2 && /^runDogfightTournament: gpuFlight: pilotFlightMlpWeightsDefault\.json is missing/.test(none.err[0]) && none.calls.rr.length === 0 && one.code === 2 && /1 pilot loaded; a tournament needs two/.test(one.err[0]) && one.calls.rr.length === 0 && bad.out.length + none.out.length + one.out.length === 0);
    ok("--only reaches the loader as the list of ids (not a string)", JSON.stringify(run(["--only", "a,b"]).calls.load[0]) === JSON.stringify({ only: ["a", "b"] }));
}

sec("5. THE RECORD");
{
    // deliberately listed WORST FIRST, so that "best first" in the record is not the roster's order
    const pil = (id, fn) => ({ id, label: id, fn, file: null, hash: null }), pilots = [pil("zero", () => ({ pitch: 0, roll: 0, yaw: 0, throttle: 0 })), pil("passive", (s, t, w) => AF.pilot(s, { heading: 0, altitude: 300, airspeed: 45 }, w)), pil("ap", AF.pilot)];
    const set = { name: "TOURNAMENT_SET", lo: 4000, hi: 4119 }, sc = Array.from({ length: 12 }, (_, i) => D.scenario(i + 1, "duel")), rr = T.roundRobin(pilots, sc);
    const seat = Object.fromEntries(pilots.map((p) => [p.id, T.seatBias(p, sc.slice(0, 3))])), rec = TD.recordOf(rr, pilots, seat, set), again = TD.recordOf(rr, pilots, seat, set);
    ok("!! THE RECORD HAS WHAT A NOTE MAY QUOTE: the set (name, scenario count, kind, seeds), every pilot in roster order with its file and hash, a line for each of the three pairs in the order they were flown with counts, edge, standard error, z, means, kills, collisions and ground contacts, the ratings BEST FIRST (the roster is worst first, so this is not the roster's order), the field edges best first, convergence, the seat biases, the cycles, the upsets and the stability row",
        rec.set.name === "TOURNAMENT_SET" && rec.set.scenarios === 12 && rec.set.kind === "duel" && rec.set.seeds.join() === "4000,4119" && rec.pilots.map((p) => p.id).join() === "zero,passive,ap" && rec.pairs.length === 3 && rec.pairs.map((p) => p.x + "|" + p.y).join() === "zero|passive,zero|ap,passive|ap" && ["x", "y", "fights", "winsX", "winsY", "draws", "edge", "se", "z", "meanX", "meanY", "killsX", "killsY", "collisions", "groundX", "groundY"].every((k) => k in rec.pairs[0]) &&
        rec.ratings.map((r) => r.id).join() === "ap,passive,zero" && rec.ratings.every((r, i) => i === 0 || rec.ratings[i - 1].rating >= r.rating) && rec.fieldEdge.map((r) => r.id).join() === "ap,passive,zero" && rec.fieldEdge.every((r, i) => i === 0 || rec.fieldEdge[i - 1].edge >= r.edge) && rec.converged === true && Object.keys(rec.seat).join() === "zero,passive,ap" && Array.isArray(rec.cycles) && rec.cycles.length === 0 && Array.isArray(rec.upsets) && rec.stability.length === 1 && rec.stability[0].n === 10 && rec.stability[0].sameOrder === true);
    ok("!! THE NUMBERS ARE THE ROUND ROBIN'S, ROUNDED TO 1e-6: the autopilot-against-passive pair's edge, standard error and z are the summary's to within a micro-unit and are numbers with at most six decimals, the counts are exact, the stability row is the library's, and an infinite z is written as the string 'Infinity' (JSON has no infinity)", (() => { const p = rec.pairs[2], s = rr.pairs["passive|ap"].summary, st = T.stability(rr, [10])[0]; return Math.abs(p.edge - s.edge) <= 5e-7 && Math.abs(p.se - s.se) <= 5e-7 && p.winsX === s.winsX && p.draws === s.draws && p.killsX === s.killsX && String(p.edge).replace(/^-?\d+\.?/, "").length <= 6 && Math.abs(rec.stability[0].maxShift - st.maxShift) <= 5e-7 && rec.cycles.join() === T.transitivity(rr).join(); })() && rec.pairs.every((p) => typeof p.z === "number" || p.z === "Infinity" || p.z === "-Infinity") && rec.pairs.some((p) => p.z === "Infinity" || p.z === "-Infinity") && !/null|NaN/.test(JSON.stringify([rec.pairs, rec.ratings, rec.fieldEdge, rec.seat, rec.stability])), rec.pairs.map((p) => p.z).join(" "));
    ok("!! THE RECORD IS DETERMINISTIC: the same round robin written twice is the same bytes (no clock, no random, no machine in it)", JSON.stringify(rec) === JSON.stringify(again));
    ok("the field edges and ratings in the record are the library's (best first, the pilot with no controls last) and the field edges sum to zero", rec.ratings.at(-1).id === "zero" && rec.fieldEdge.at(-1).id === "zero" && Math.abs(rec.fieldEdge.reduce((s, r) => s + r.edge, 0)) < 5e-6);
}

sec("6. THE ENTRY POINT");
{
    const file = path.join(ENG, "tools", "ship", "runDogfightTournament.mjs"), src = fs.readFileSync(file, "utf8"), code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! THE COMMAND FILE EXPORTS NOTHING AND CALLS THE LIBRARY: no `export` in its code, it imports command from ./tournamentDogfight.mjs and exits with its code (so the library has a caller that is not a gate)", !/\bexport\b/.test(code) && /import \{ command \} from "\.\/tournamentDogfight\.mjs"/.test(code) && /process\.exit\(command\(process\.argv\.slice\(2\)\)\)/.test(code));
    const run = (args) => spawnSync(process.execPath, [file, ...args], { cwd: ENG, encoding: "utf8", timeout: 120000 });
    const good = run(["--smoke", "--only", "autopilot,flyDogfight", "--quiet"]);
    ok("!! RUN FOR REAL ON TWO PILOTS AND THE FOUR THROWAWAY DUELS: exit 0, the report on stdout (the counts, the edges, the ratings, the stability and seat lines) and nothing on stderr", good.status === 0 && /WINS-DRAWS-LOSSES/.test(good.stdout) && /RATINGS/.test(good.stdout) && /SEAT \(PD autopilot/.test(good.stdout) && /fruit fly trained to FIGHT/.test(good.stdout) && good.stderr === "" && !/NaN|undefined/.test(good.stdout), `${good.stdout.split("\n").length} lines`);
    const badRun = run(["--only", "autopilot,nobody"]);
    ok("!! A BAD ID IS EXIT 2 WITH THE REASON AND THE KNOWN IDS ON STDERR, and nothing on stdout", badRun.status === 2 && /^runDogfightTournament: unknown pilot "nobody" \(known: autopilot, flyFlight/.test(badRun.stderr) && badRun.stdout === "");
}

console.log(fails ? `\ntournamentDogfight-selfcheck: ${fails} FAILED` : "\ntournamentDogfight-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
