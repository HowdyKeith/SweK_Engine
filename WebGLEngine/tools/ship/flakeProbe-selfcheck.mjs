#!/usr/bin/env node
// WebGLEngine/tools/ship/flakeProbe-selfcheck.mjs -- v4826
//
// Run: node tools/ship/flakeProbe-selfcheck.mjs
//
// GRADES tools/ship/flakeProbe.mjs, the tool that runs a gate K times and reports the rows that flip between runs (FLIPPED) and the rows that passed every
// run but read a small number that varied (THIN). Section 1 the parser and the number reader, section 2 the comparison on fixtures, section 3 the CLI end
// to end on a real gate written to a temp folder that flips a row and thins another, section 4 the refusals.
//
// SABOTAGE LOG -- v4826, each against tools/ship/flakeProbe.mjs, the gate run, the file restored (10; every one red by name):
//   A  a row flips when it passed OR failed (every row flips)                -> 13 red: the stable, flipped, red-not-flake, thin, large, small, hex, duplicate and CLI rows.
//   B  the thin threshold below zero (thin never fires)                      -> 3 red: the thin fixture and the two CLI rows that name the thin row.
//   C  thin fires on a varying number of any size                            -> 1 red: the large-number row (milliseconds and bytes vary every run and are not the species).
//   D  a crash is not reported                                               -> 1 red: the crashed row.
//   E  the parser reads PASS rows only                                       -> 1 red: the parser row (a FAIL row is the one row that matters).
//   F  the exit code ignores a flip                                          -> 1 red: the CLI row (a flake must be a red to whatever runs the probe).
//   G  duplicate row names merged                                            -> 1 red: the duplicate-name row.
//   H  hex fragments read as numbers                                         -> 1 red: the number-reader row ([0,1,-2,3.5,8,62060,7,100]: a fingerprint 8e62060a is 8 and 62060).
//   I  `--times` read as a string (0 accepted)                               -> 3 red: the refusal row, the --write row and the --merge row: `--times 0` printed `stable` for zero runs, NaN ms each.
//   J  thin fires on fractions too (the whole-number test removed)           -> 1 red: the measured-fraction row.
//   FINDING (J): the first draft had no whole-number test and the first full probe (72 live-page gates) flagged every gate that reports a coverage fraction,
//   0.2197 against 0.2193 -- eleven rows of noise around the one species that matters. A thin number is a COUNT.
//   FINDING (I): an empty probe that says `stable` is exactly the output cliArgs refuses numbers <= 0 to prevent, and this tool was the first draft to meet it.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseRows, numbersIn, compareRuns, THIN_MAX } from "./flakeCompare.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const run = (script, args) => new Promise((resolve) => { const p = spawn(process.execPath, [script, ...args], { cwd: ENG }); let out = ""; p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { out += d; }); const k = setTimeout(() => p.kill("SIGKILL"), 60000); p.on("close", (code) => { clearTimeout(k); resolve({ code, out }); }); });
const mk = (code, rows, last = "") => ({ code, rows, last });
const row = (name, pass, detail = "") => ({ name, pass, detail });

sec("1. THE PARSER AND THE NUMBER READER");
{
    const text = ["noise before", "  PASS  the room announces ready   {\"peers\":[\"A\",\"B\"]}", "  FAIL  a row with no detail", "  ----  report line, not a row", "  PASS  name with   three spaces inside   2 of 9", "\tPASS not a row", "  SKIP  skipped"].join("\n");
    const r = parseRows(text);
    ok("!! `  PASS  name   detail` and `  FAIL  name` are rows; reports, skips and noise are not", r.length === 3 && r[0].pass && r[0].name === "the room announces ready" && r[0].detail.startsWith("{") && !r[1].pass && r[1].detail === "" && r[1].name === "a row with no detail", JSON.stringify(r.map((x) => [x.name, x.pass])));
    ok("...a name is everything before the first run of three spaces, and a name may hold two", r[2].name === "name with" && r[2].detail === "three spaces inside   2 of 9");
    ok("decimal numbers are read with their signs, and hex fragments and words are not numbers", JSON.stringify(numbersIn("0 pixels name Chaos (picks: 1, -2, 3.5) fp 8e62060a at 7ms, tick 100")) === "[0,1,-2,3.5,100]", JSON.stringify(numbersIn("0 pixels name Chaos (picks: 1, -2, 3.5) fp 8e62060a at 7ms, tick 100")));
}

sec("2. THE COMPARISON, ON FIXTURES");
{
    const good = [row("a", true, "12 pixels"), row("b", true, "ok")];
    ok("identical runs are stable: nothing flipped, thin or crashed", compareRuns([mk(0, good), mk(0, good), mk(0, good)]).stable);
    const f = compareRuns([mk(0, [row("flaky row", true), row("steady", true)]), mk(1, [row("flaky row", false), row("steady", true)]), mk(0, [row("flaky row", true), row("steady", true)])]);
    ok("!! a row that passed twice and failed once is FLIPPED, by name, with the counts -- and the steady row beside it is not", f.flipped.length === 1 && f.flipped[0].name === "flaky row" && f.flipped[0].pass === 2 && f.flipped[0].fail === 1 && !f.stable, JSON.stringify(f.flipped));
    const alwaysRed = compareRuns([mk(1, [row("red", false)]), mk(1, [row("red", false)])]);
    ok("a row that failed every time is RED, not a flake: not flipped, not crashed (the sweep already names a red)", alwaysRed.flipped.length === 0 && alwaysRed.crashed.length === 0);
    const t = compareRuns([mk(0, [row("pick", true, "1 pixels name Chaos")]), mk(0, [row("pick", true, "0 pixels name Chaos")]), mk(0, [row("pick", true, "3 pixels name Chaos")]), mk(0, [row("pick", true, "1 pixels name Chaos")])]);
    ok("!! a row that PASSED every run but read 1, 0, 3, 1 is THIN: the tslRace species, one run from red, reported with the values it took", t.thin.length === 1 && t.thin[0].min === 0 && t.thin[0].max === 3 && t.thin[0].seen.join() === "1,0,3,1" && t.flipped.length === 0, JSON.stringify(t.thin));
    const big = compareRuns([mk(0, [row("time", true, "took 1204 ms, 36173 bytes")]), mk(0, [row("time", true, "took 998 ms, 36170 bytes")])]);
    ok("a number that varies and is LARGE (milliseconds, bytes) is not thin: only counts that have room to be zero are the species", big.thin.length === 0 && big.stable);
    const frac = compareRuns([mk(0, [row("cover", true, "coverage 0.2197 of the frame")]), mk(0, [row("cover", true, "coverage 0.2193 of the frame")]), mk(0, [row("cover", true, "coverage 0.2194 of the frame")])]);
    ok("a small number that varies and is NOT a whole number (a measured fraction, 0.2197 / 0.2193 / 0.2194) is not thin: it has no zero to fall to, and the first full probe reported eleven of these", frac.thin.length === 0 && frac.stable, JSON.stringify(frac.thin));
    const steadySmall = compareRuns([mk(0, [row("n", true, "2 of 9")]), mk(0, [row("n", true, "2 of 9")])]);
    ok("a small number that does NOT vary is not thin (a count that is always 2 is a count)", steadySmall.stable);
    const hexOnly = compareRuns([mk(0, [row("fp", true, "fingerprint 8e62060a")]), mk(0, [row("fp", true, "fingerprint 060d9731")])]);
    ok("a fingerprint that differs between runs is not a number that varies (hex fragments are not read)", hexOnly.stable);
    const dup = compareRuns([mk(0, [row("same name", true), row("same name", true)]), mk(0, [row("same name", true), row("same name", false)])]);
    ok("two rows that share a name are told apart (the second is `#2`), so a flip of the second is found and the first stays clean", dup.flipped.length === 1 && dup.flipped[0].name === "same name #2", JSON.stringify(dup.flipped));
    const crash = compareRuns([mk(0, good), mk(1, [], "TypeError: x is not a function"), mk(0, good)]);
    ok("a run that exits non-zero with NO failing row (a crash, a timeout, a thrown error) is CRASHED, with its last line; a run that exits non-zero with a FAIL row is a red and is not", crash.crashed.length === 1 && crash.crashed[0].run === 1 && /TypeError/.test(crash.crashed[0].last) && !crash.stable);
    ok("the thin threshold is stated: " + THIN_MAX + " and under", THIN_MAX === 3);
}

sec("3. THE CLI, END TO END, ON A GATE THAT FLIPS ONE ROW AND THINS ANOTHER");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swek-flake-"));
{
    const counter = path.join(tmp, "n.txt"), gate = path.join(tmp, "fixture-selfcheck.mjs");
    fs.writeFileSync(gate, `import fs from "node:fs"; const f = ${JSON.stringify(counter)}; const n = (fs.existsSync(f) ? +fs.readFileSync(f, "utf8") : 0) + 1; fs.writeFileSync(f, String(n));
console.log("  PASS  steady row   always 5"); console.log((n % 2 ? "  PASS" : "  FAIL") + "  alternating row   run " + n); console.log("  PASS  thin row   " + [1, 0, 2, 1][n % 4] + " pixels name it"); process.exitCode = n % 2 ? 0 : 1;`);
    const r = await run(path.join(ENG, "tools/ship/flakeProbe.mjs"), ["--gates", gate, "--times", "4", "--write", "--out", path.join(tmp, "rec.json")]);
    const rec = (() => { try { return JSON.parse(fs.readFileSync(path.join(tmp, "rec.json"), "utf8")); } catch (e) { return null; } })();
    ok("!! the CLI runs the gate 4 times, names the FLIPPED row and the THIN row, leaves the steady one alone, and exits 1 (a flake is a red)", r.code === 1 && /FLIPPED\s+alternating row\s+passed 2, failed 2/.test(r.out) && /THIN\s+thin row/.test(r.out) && !/steady row/.test(r.out) && /1 flipped/.test(r.out), r.out.split("\n").filter((l) => /FLIPPED|THIN|\[flakeProbe\]/.test(l)).join(" | ").slice(0, 300));
    ok("...and `--write` records the measurement with the K it used, so a later run can be read against it", rec && rec.gates[gate] && rec.gates[gate].times === 4 && rec.gates[gate].flipped.length === 1 && rec.gates[gate].thin.length === 1 && rec.thinMax === 3, rec && JSON.stringify(rec.gates[gate]).slice(0, 200));
    fs.writeFileSync(counter, "0");
    // --merge: a second probe of ANOTHER gate into the same record keeps the first gate's entry and its K, and adds its own
    const gM = path.join(tmp, "merge-selfcheck.mjs"); fs.writeFileSync(gM, `console.log("  PASS  only row   9 of 9");`);
    const m2 = await run(path.join(ENG, "tools/ship/flakeProbe.mjs"), ["--gates", gM, "--times", "2", "--write", "--merge", "--out", path.join(tmp, "rec.json")]);
    const rec2 = (() => { try { return JSON.parse(fs.readFileSync(path.join(tmp, "rec.json"), "utf8")); } catch (e) { return null; } })();
    ok("!! `--merge` keeps the entries already in the record (with the K they were taken at) and adds the gate just run with its own; without it the record would be only the last probe", m2.code === 0 && rec2 && rec2.gates[gate] && rec2.gates[gate].times === 4 && rec2.gates[gate].flipped.length === 1 && rec2.gates[gM] && rec2.gates[gM].times === 2 && Object.keys(rec2.gates).length === 2, rec2 && Object.keys(rec2.gates).map((k) => path.basename(k) + " x" + rec2.gates[k].times).join(", "));
    const g2 = path.join(tmp, "calm-selfcheck.mjs"); fs.writeFileSync(g2, `console.log("  PASS  calm row   3 pixels"); console.log("  PASS  another   ok");`);
    const calm = await run(path.join(ENG, "tools/ship/flakeProbe.mjs"), ["--gates", g2, "--times", "3"]);
    ok("a gate that does not vary is `stable` and the probe exits 0", calm.code === 0 && /stable\s+/.test(calm.out) && /1 stable|, 1 stable/.test(calm.out), calm.out.trim().split("\n").pop());
}

sec("4. THE REFUSALS (cliArgs): an option the probe does not know is refused, and so is a run with nothing to run");
{
    const a = await run(path.join(ENG, "tools/ship/flakeProbe.mjs"), ["--gate", "x"]), b = await run(path.join(ENG, "tools/ship/flakeProbe.mjs"), ["--times", "3"]), c = await run(path.join(ENG, "tools/ship/flakeProbe.mjs"), ["--gates", "x", "--times", "0"]);
    ok("an unknown option is refused with the nearest spelling (--gate -> --gates), exit 2, nothing run", a.code === 2 && /unknown option --gate -- did you mean --gates/.test(a.out) && /nothing was run/.test(a.out), a.out.split("\n")[0]);
    ok("a run with no gates named is refused, exit 2", b.code === 2 && /--gates .* required/.test(b.out), b.out.split("\n")[0]);
    ok("--times 0 is refused (an empty probe that reports `stable` is the worst output a probe can give)", c.code === 2 && /positive number/.test(c.out), c.out.split("\n")[0]);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? `\nflakeProbe-selfcheck: ${fails} FAILED` : "\nflakeProbe-selfcheck: all checks pass");
process.exitCode = fails ? 1 : 0;
