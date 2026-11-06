// WebGLEngine/tools/ship/flyCxPilotFile-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyCxPilotFile-selfcheck.mjs      (about 2 s)
//
// THE GATE OF tools/ship/flyCxPilotFile.mjs: the file brain/pilotSubFlyCxWip.json, which the Sub Aquarium flies its stateful fly pilot from (brain/TANK_PILOTS_WIP.md, design point 1, PASS/FAIL row 1). It is written from the `cx` record of brain/flyCxStageA.jsonl and from nothing else, and only if that record is a pilot the tank can fly.
// WHAT IT HOLDS
//   1 THE FILE     built from the real record: the format, the circuit name, 15 features, 148 cells, 4 outputs, 1,729 weights, the memory gain, the weights an exact copy of the record's, the sha256 of the weights, the provenance (source, spec, champion seed 31003), the scores of the champion and of the autopilot, the limits in words.
//   2 THE REFUSALS every way the record can fail to be flyable, each named, several at once listed together: no cx record, a smoke run, not qualifying, no champion, no weights, too few or too many, a weight count the record disagrees with, a weight that is not a finite number or is over 1000, a memory gain outside [0, 1], a missing score, a circuit the pilot cannot be built on.
//   3 THE FILE ON DISK  the committed file is exactly what the source record gives (the drift check: a changed source record makes the file stale and this gate red).
//   4 THE COMMAND  the dry run, --write, --check (current, stale, missing), the bad arguments, unreadable inputs, a refused record.
//   5 THE SOURCE   pure apart from the files it reads and writes.
// NOT CHECKED, said plainly: that the pilot flies well (the tank's own gates fly it); that a champion of a later stage A would qualify (the tool checks the record it is given, not the future).
//
// SABOTAGED -- 79 mutants of tools/ship/flyCxPilotFile.mjs, each run against a copy of this gate, 2 at a time: ALL 79 red BY NAME (158 red rows).
//   the constants (the source, circuit and output paths, the circuit's name, the spec, the weight limit, the audits); every refusal of buildFile (no record, smoke, not qualifying, the reasons quoted, no champion either way, a circuit the pilot cannot be built on, no weights, the count against the pilot and against the record, a value that is not a finite number or is over the limit at both edges, the index named,
//   the memory gain at both edges and only when there is room to hold it, each score of the champion and the autopilot, problems ignored); every field of the file (format, policy, circuit, features, hidden, outputs, count, sigma, the copy, the hash and what it is of, the source's file, champion, recipe and family, the scores of each side, the dark heading error and its condition and order, the words: reservoir, not trained, the seed, the scores, the input cells, the synapses, does not integrate, generic gain),
//   the serialization, the hash algorithm; the command (a stray word, an unknown option, both flags, the exit of each refusal, the messages, unreadable inputs, the circuit's io, the source it reads, --check for a missing and a stale file and its exit and text, --write's path, text and message, the dry run's text and that it and --check write nothing), the clock.
//   FIRST RUN, 80 mutants: 4 went 0 red. B13 (the `typeof v !== "number"` test dropped) is EQUIVALENT: Number.isFinite is false for a string, null, a boolean and an array, so the test was redundant and was CUT. B14 (the finite test dropped) needed NaN and Infinity, which a record read from JSON cannot hold: a row now builds them in memory. B21 (the memory gain checked even when there is no room for it) needed a record with too few weights to give exactly ONE problem: a row now asks. F16 (`&&` for `||` in the dark-heading-error condition) needed a mechanism block with one of its two numbers missing: a row now has it.
//   The gate was edited after that run, so all mutants were run again (two patterns that the cut had moved were rewritten, and the finite test dropped from the weights check was added as B26): 79 of 79 red by name.
// NOT SABOTAGED: the exact wording of the dry-run line beyond the numbers it quotes.
"use strict";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import * as CS from "../../brain/pilotSubCircuitState.mjs";
import * as FP from "./flyCxPilotFile.mjs";
import { readRecords } from "./trainSubCircuits.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, e = 1e-12) => Math.abs(a - b) <= e;
console.log("flyCxPilotFile-selfcheck -- the stateful fly pilot's weights file\n");

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const srcText = fs.readFileSync(path.join(ENG, FP.SOURCE), "utf8"), records = readRecords(srcText), cj = JSON.parse(fs.readFileSync(path.join(ENG, FP.CIRCUIT), "utf8")), circuit = { neurons: cj.neurons, edges: cj.edges, io: cj.io };
const cx = records.find((r) => r.spec === "cx");
const clone = (o) => JSON.parse(J(o));
const withCx = (patch) => { const r = clone(cx); patch(r); return [r]; };
const why = (recs, circ = circuit) => FP.buildFile(recs, circ).problems;

sec("1. THE FILE (built from the real cx record)");
{
    const b = FP.buildFile(records, circuit), f = b.file;
    ok("!! the real cx record builds: ok, no problems", b.ok === true && b.problems.length === 0 && f && typeof f === "object");
    ok("!! the format and the names: swek-brain-v1, policy pilotSubCircuitState, circuit flycx, 15 features, 148 cells, 4 outputs", f.format === "swek-brain-v1" && f.policy === "pilotSubCircuitState" && f.circuit === "flycx" && FP.CIRCUIT_NAME === "flycx" && f.features === 15 && f.hidden === 148 && f.outputs === 4);
    ok("!! exactly 1,729 weights, the weight count says so, and they are the record's weights number for number, as a COPY (editing the file's does not edit the record's)", f.weightCount === 1729 && f.weights.length === 1729 && f.weights.every((v, i) => v === cx.weights[i]) && f.weights !== cx.weights && (() => { const keep = f.weights[0]; f.weights[0] = 99; const same = cx.weights[0] !== 99; f.weights[0] = keep; return same; })());
    ok("!! the memory gain is the weight at the policy's sigma index (0.95: the study found it never moved) and the sha256 is of the weights' JSON", near(f.sigma, cx.weights[CS.createStatePolicy(circuit, "x").SIGMA_INDEX]) && near(f.sigma, 0.95, 1e-6) && f.weightsSha256 === FP.sha256(J(cx.weights)) && /^[0-9a-f]{64}$/.test(f.weightsSha256));
    ok("!! the provenance: source file, spec cx, family cx, the champion's seed 31003, its recipe, qualifies true", f.source.file === "brain/flyCxStageA.jsonl" && f.source.spec === "cx" && f.source.family === "cx" && f.source.champion === 31003 && J(f.source.recipe) === J(cx.recipe) && f.source.qualifies === true);
    ok("!! the scores: the champion's and the autopilot's audit, safety audit and reserve are the record's, and the dark heading error of each is kept", FP.AUDITS.every((a) => f.audit.champion[a] === cx.scores.champion[a].score && f.audit.autopilot[a] === cx.scores.autopilot[a].score) && f.audit.darkHeadingError.champion === cx.mechanism.champion.dark && f.audit.darkHeadingError.autopilot === cx.mechanism.autopilot.dark && f.audit.champion.audit > f.audit.autopilot.audit);
    ok("!! the words: how it was made (a reservoir, the recurrent weights NOT trained, the seed, the three scores against the autopilot's) and the limits in plain words (the gain is generic, it does not integrate)", /RESERVOIR/.test(f.by) && /NOT trained/.test(f.by) && /champion seed 31003/.test(f.by) && /audit -0\.4994, safety audit -0\.5071, reserve -0\.5034 against the plain autopilot's -0\.6426, -0\.6528, -0\.6168/.test(f.by) && /148 cells, 7080 synapses/.test(f.by) && /15 x 88 input weights/.test(f.by) && /KNOWN LIMITS, SAID PLAINLY/.test(f.limits) && /does not integrate/.test(f.limits) && /generic gain/.test(f.limits));
    const noMech = FP.buildFile(withCx((r) => { delete r.mechanism; }), circuit);
    ok("!! a record with no mechanism block still builds (the dark heading error is then null, not made up)", noMech.ok === true && noMech.file.audit.darkHeadingError === null);
    ok("!! serialize is one line of JSON and a newline, and reads back to the same object", FP.serialize(f).endsWith("}\n") && FP.serialize(f).split("\n").length === 2 && J(JSON.parse(FP.serialize(f))) === J(f));
    ok("!! sha256 is the real thing (the standard test vector for 'abc')", FP.sha256("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    ok("!! the constants: the source, the circuit file, the output, the largest weight the wire allows (1000), the three audits", FP.SOURCE === "brain/flyCxStageA.jsonl" && FP.CIRCUIT === "vendor/hemibrain/hemibrain-cx-heading-loop.json" && FP.OUT === "brain/pilotSubFlyCxWip.json" && FP.MAX_W === 1000 && J(FP.AUDITS) === J(["audit", "safetyAudit", "reserve"]) && FP.SPEC === "cx");
}

sec("2. THE REFUSALS (every reason named)");
{
    const refused = (recs, re, circ = circuit) => { const b = FP.buildFile(recs, circ); return b.ok === false && !b.file && b.problems.some((p) => re.test(p)); };
    ok("!! no cx record at all (an empty file, nothing, another spec): refused naming the spec and the source", refused([], /no "cx" record in brain\/flyCxStageA\.jsonl/) && refused(null, /no "cx" record/) && refused([{ spec: "er:0" }], /no "cx" record/) && refused([null, undefined], /no "cx" record/));
    ok("!! a smoke record is refused", refused(withCx((r) => { r.smoke = true; }), /smoke run/));
    ok("!! a record that does not qualify against the autopilot is refused, with its own reasons quoted", refused(withCx((r) => { r.qualifies = false; r.reasons = ["ended early on 3 dives", "no gain"]; }), /does not qualify against the autopilot \(ended early on 3 dives; no gain\)/) && refused(withCx((r) => { r.qualifies = "yes"; }), /does not qualify/) && refused(withCx((r) => { delete r.qualifies; }), /does not qualify/));
    ok("!! a record with no champion (null or missing) is refused", refused(withCx((r) => { r.champion = null; }), /no champion/) && refused(withCx((r) => { delete r.champion; }), /no champion/));
    ok("!! no weights (missing, or not a list) is refused", refused(withCx((r) => { delete r.weights; }), /no weights/) && refused(withCx((r) => { r.weights = "x"; }), /no weights/));
    ok("!! the wrong NUMBER of weights is refused naming both counts: 1,728, 1,730 and 3", refused(withCx((r) => { r.weights.pop(); r.weightCount = 1728; }), /has 1728 weights and the stateful pilot on this circuit takes 1729/) && refused(withCx((r) => { r.weights.push(0.1); r.weightCount = 1730; }), /has 1730 weights and the stateful pilot on this circuit takes 1729/) && refused(withCx((r) => { r.weights = [1, 2, 3]; r.weightCount = 3; }), /has 3 weights/));
    ok("!! a record that disagrees with itself about its weight count is refused", refused(withCx((r) => { r.weightCount = 1728; }), /says 1728 weights and holds 1729/));
    ok("!! a weight that is not a finite number is refused naming its index: null (what JSON makes of NaN), a string, 1,000.5 and -1,001 are over or not numbers; exactly 1,000 and -1,000 are allowed", refused(withCx((r) => { r.weights[7] = null; }), /weight 7 is not a finite number of at most 1000/) && refused(withCx((r) => { r.weights[1728] = "0.5"; }), /weight 1728 is not a finite number/) && refused(withCx((r) => { r.weights[3] = 1000.5; }), /weight 3 is not a finite number/) && refused(withCx((r) => { r.weights[4] = -1001; }), /weight 4 is not a finite number/) && FP.buildFile(withCx((r) => { r.weights[5] = 1000; r.weights[6] = -1000; }), circuit).ok === true);
    ok("!! NaN and Infinity (which a record read from JSON cannot hold, but one built in memory can) are refused, naming the weight; a weight is checked as a finite NUMBER, so a boolean and an array are refused too", refused(withCx((r) => { r.weights[9] = NaN; }), /weight 9 is not a finite number/) && refused(withCx((r) => { r.weights[2] = Infinity; }), /weight 2 is not a finite number/) && refused(withCx((r) => { r.weights[2] = -Infinity; }), /weight 2 is not a finite number/) && refused(withCx((r) => { r.weights[11] = true; }), /weight 11/) && refused(withCx((r) => { r.weights[12] = [0.1]; }), /weight 12/));
    const short = FP.buildFile(withCx((r) => { r.weights = [1, 2, 3]; r.weightCount = 3; }), circuit);
    ok("!! a record with too few weights gives exactly ONE problem (the count), not a second one about a memory gain it has no room to hold", short.problems.length === 1 && /has 3 weights/.test(short.problems[0]));
    const half = (patch) => FP.buildFile(withCx(patch), circuit);
    ok("!! the dark heading error is kept only when BOTH the champion's and the autopilot's are numbers: with one of them missing it is null, with both it is the pair", half((r) => { delete r.mechanism.autopilot.dark; }).file.audit.darkHeadingError === null && half((r) => { delete r.mechanism.champion.dark; }).file.audit.darkHeadingError === null && half((r) => { r.mechanism.champion.dark = "x"; }).file.audit.darkHeadingError === null && J(half(() => {}).file.audit.darkHeadingError) === J({ champion: cx.mechanism.champion.dark, autopilot: cx.mechanism.autopilot.dark }));
    const SI = CS.createStatePolicy(circuit, "x").SIGMA_INDEX;
    ok("!! a memory gain outside [0, 1] is refused naming the weight (-0.1, 1.1, not a number); exactly 0 and exactly 1 are allowed", refused(withCx((r) => { r.weights[SI] = -0.1; }), new RegExp(`memory gain \\(weight ${SI}\\) is -0\\.1, outside \\[0, 1\\]`)) && refused(withCx((r) => { r.weights[SI] = 1.1; }), /outside \[0, 1\]/) && FP.buildFile(withCx((r) => { r.weights[SI] = 0; }), circuit).ok === true && FP.buildFile(withCx((r) => { r.weights[SI] = 1; }), circuit).ok === true);
    ok("!! a missing score is refused naming the audit: the champion's audit, the autopilot's safety audit, the champion's reserve", refused(withCx((r) => { delete r.scores.champion.audit; }), /the audit score of the champion or of the autopilot is missing/) && refused(withCx((r) => { delete r.scores.autopilot.safetyAudit; }), /the safetyAudit score/) && refused(withCx((r) => { r.scores.champion.reserve.score = null; }), /the reserve score/) && refused(withCx((r) => { delete r.scores; }), /the audit score/));
    ok("!! a circuit the stateful pilot cannot be built on is refused, saying so (an empty object, nothing)", refused(records, /not one the stateful pilot can be built on/, {}) && refused(records, /not one the stateful pilot can be built on/, null));
    const many = FP.buildFile(withCx((r) => { r.smoke = true; r.qualifies = false; r.champion = null; r.weights.pop(); }), circuit);
    ok("!! several reasons are LISTED TOGETHER, not just the first: a smoke, non-qualifying, championless record with a missing weight gives all of them", many.ok === false && many.problems.length >= 5 && many.problems.some((p) => /smoke/.test(p)) && many.problems.some((p) => /qualify/.test(p)) && many.problems.some((p) => /no champion/.test(p)) && many.problems.some((p) => /1728 weights/.test(p)) && many.problems.some((p) => /says 1729 weights and holds 1728/.test(p)));
}

sec("3. THE FILE ON DISK (the drift check)");
{
    const built = FP.buildFile(records, circuit), disk = fs.readFileSync(path.join(ENG, FP.OUT), "utf8");
    ok("!! !! THE COMMITTED brain/pilotSubFlyCxWip.json IS EXACTLY WHAT THE SOURCE RECORD GIVES (run `node tools/ship/flyCxPilotFile.mjs --write` after the source changes)", disk === FP.serialize(built.file));
    const j = JSON.parse(disk);
    ok("!! and it is what the wire accepts: circuit flycx, exactly 1,729 finite weights each within 1000 of zero, a sha256 that matches them", j.circuit === "flycx" && j.weights.length === 1729 && j.weights.every((v) => Number.isFinite(v) && Math.abs(v) <= 1000) && j.weightsSha256 === FP.sha256(J(j.weights)));
    ok("!! the file is NOT named pilotSubWeights*Wip.json (the bridge's chips count those as pilots wired to the Giant Fiber Circuit, which this is not)", !/^pilotSubWeights.*Wip\.json$/.test(path.basename(FP.OUT)));
}

sec("4. THE COMMAND");
{
    const files = new Map([[path.join("/r", FP.SOURCE), srcText], [path.join("/r", FP.CIRCUIT), fs.readFileSync(path.join(ENG, FP.CIRCUIT), "utf8")]]);
    const mk = (extra = {}) => { const out = [], errs = [], wrote = []; return { out, errs, wrote, io: { out: (m) => out.push(m), err: (m) => errs.push(m), root: "/r", readFile: (f) => { if (!files.has(f) && !(extra.disk && f === path.join("/r", FP.OUT))) throw new Error("ENOENT " + f); return f === path.join("/r", FP.OUT) ? extra.disk : files.get(f); }, writeFile: (f, t) => wrote.push([f, t]), ...extra.io } }; };
    const good = FP.serialize(FP.buildFile(records, circuit).file);
    const d = mk(), cd = FP.command([], d.io);
    ok("!! the dry run says what it would write (1,729 weights, champion seed 31003, memory gain 0.950, the audit against the autopilot's) and writes NOTHING (exit 0)", cd === 0 && d.wrote.length === 0 && /dry run -- would write brain\\pilotSubFlyCxWip\.json|dry run -- would write brain\/pilotSubFlyCxWip\.json/.test(d.out[0]) && /1729 weights, champion seed 31003, memory gain 0\.950, audit -0\.4994 against the autopilot's -0\.6426; nothing written/.test(d.out[0]));
    const w = mk(), cw = FP.command(["--write"], w.io);
    ok("!! --write writes the output path under the root with exactly the serialized file, once, and says so with the short hash (exit 0)", cw === 0 && w.wrote.length === 1 && w.wrote[0][0] === path.join("/r", FP.OUT) && w.wrote[0][1] === good && /^flyCxPilotFile: wrote .*pilotSubFlyCxWip\.json \(1729 weights, champion seed 31003, sha256 [0-9a-f]{12}\)$/.test(w.out[0]));
    const cur = mk({ disk: good }), cc = FP.command(["--check"], cur.io), stale = mk({ disk: good.replace("31003", "31004") }), cs = FP.command(["--check"], stale.io), none = mk(), cn = FP.command(["--check"], none.io);
    ok("!! --check: current is exit 0 and says so; a stale file is exit 1 saying it is not what the source gives; a missing file is exit 1 saying so; none of them writes", cc === 0 && /is current \(1729 weights, champion seed 31003/.test(cur.out[0]) && cs === 1 && /is not what brain\/flyCxStageA\.jsonl gives/.test(stale.errs[0]) && cn === 1 && /does not exist/.test(none.errs[0]) && cur.wrote.length + stale.wrote.length + none.wrote.length === 0);
    const bad = [["--write", "--check"], ["--bogus"], ["stray"], ["--write", "stray"]].map((a) => { const m = mk(); return [FP.command(a, m.io), m.errs.join(), m.wrote.length]; });
    ok("!! bad arguments are exit 2 with the reason and write nothing: both flags together, an unknown option (named), a stray word (named)", bad.every((b) => b[0] === 2 && b[2] === 0) && /do not go together/.test(bad[0][1]) && /unknown option "--bogus"/.test(bad[1][1]) && /unexpected argument "stray"/.test(bad[2][1]) && /unexpected argument "stray"/.test(bad[3][1]));
    const un = mk({ io: { readFile: () => { throw new Error("disk on fire"); } } }), cu = FP.command(["--write"], un.io);
    ok("!! inputs that cannot be read are exit 1 saying so and write nothing", cu === 1 && /cannot read the inputs: disk on fire/.test(un.errs[0]) && un.wrote.length === 0);
    const badRec = mk({ io: { readFile: (f) => (f.endsWith("flyCxStageA.jsonl") ? srcText.split("\n").filter((l) => !l.includes('"spec":"cx"')).join("\n") : files.get(f)) } }), cb = FP.command(["--write"], badRec.io);
    ok("!! a source with no cx record is exit 1, each problem printed with the tool's name, nothing written", cb === 1 && /^flyCxPilotFile: no "cx" record in brain\/flyCxStageA\.jsonl$/.test(badRec.errs[0]) && badRec.wrote.length === 0);
    const mkBad = mk({ io: { readFile: (f) => (f.endsWith("flyCxStageA.jsonl") ? J({ ...cx, qualifies: false, reasons: ["x"] }) + "\n" : files.get(f)) } }), cq = FP.command(["--check"], mkBad.io);
    ok("!! a record that does not qualify is exit 1 under --check too (the file is never 'current' against a record the tool would refuse)", cq === 1 && /does not qualify/.test(mkBad.errs[0]));
}

sec("5. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./flyCxPilotFile.mjs", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/**")).join("\n");
    ok("!! no Math.random, no clock, no network, no process spawning", !/Math\.random|Date\.now|new Date|performance\.now|fetch\(|node:net|node:http|child_process/.test(code));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exitCode = fails ? 1 : 0;
