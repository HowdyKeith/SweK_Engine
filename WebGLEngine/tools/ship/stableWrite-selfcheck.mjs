#!/usr/bin/env node
// WebGLEngine/tools/ship/stableWrite-selfcheck.mjs -- v4826
//
// Run: node tools/ship/stableWrite-selfcheck.mjs
//
// GRADES tools/ship/stableWrite.mjs, the one definition of "write a stamped record without dirtying the tree", and the three writers that use it. Section 1 the helper
// on a temp file (first write, same content under a later stamp, changed content, the legacy spelling, the stamp's position, bytes and mtime); section 2 the two gates that
// used to write on every run (traderPolicy-selfcheck.mjs, rigCanvas-selfcheck.mjs) and the probe's record, read as source: each goes through the helper and none writes
// a tracked file with a clock or a version in it by itself.
//
// SABOTAGE LOG -- v4826, each against tools/ship/stableWrite.mjs unless named, the gate run, the file restored (8; every one red by name):
//   A  content never counts as unchanged (always the new stamp)             -> 3 red: the later-stamp-writes-nothing row, the legacy row, the stamp-last row.
//   B  changed content keeps the old stamp                                  -> 1 red: the changed-content row (a record that never re-dates is as wrong as one that always does).
//   C  always writes, even identical bytes                                  -> 2 red: the later-stamp row and the stamp-last row, both on the MTIME (the bytes were equal; the mtime moved).
//   D  the legacy spelling ignored                                          -> 1 red: the legacy row.
//   E  the stamp compared as content                                        -> 3 red: the same three as A.
//   F  no throw without a stampName                                         -> 1 red: the stampName row.
//   G  traderPolicy-selfcheck writes both artifacts by itself again          -> 1 red: the source row (the helper is the one definition only if the writers use it).
//   H  rigCanvas-selfcheck stamps `written: new Date()` again                -> 2 red: the source row and the no-clock-by-another-route row.
//   FINDING (C): the first draft compared BYTES and so passed a writer that rewrote identical bytes on every run, which dirties nothing in git but moves the mtime that
//   every build tool and watcher keys on. The rows read the mtime back after setting it to 2020.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stableWrite } from "./stableWrite.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swek-stable-"));
const old = (f) => fs.utimesSync(f, new Date("2020-01-01"), new Date("2020-01-01"));
const year = (f) => fs.statSync(f).mtime.getUTCFullYear();

sec("1. THE HELPER, ON A TEMP FILE");
{
    const f = path.join(tmp, "a.json"), body = { days: 60, greedy: 39204.5, runs: [{ name: "x", ratio: 1.5 }] };
    const build = (stamp) => ({ shapeAt: "v4314", changedAt: stamp, ...body });
    const w1 = stableWrite(f, build, { stampName: "changedAt", stampValue: "v4900", newline: true }); old(f);
    const bytes1 = fs.readFileSync(f, "utf8");
    ok("a first write stamps the file with the stamp given, and says it wrote", w1.wrote && !w1.kept && w1.doc.changedAt === "v4900" && JSON.parse(bytes1).changedAt === "v4900");
    ok("!! the SAME content under a LATER stamp writes NOTHING: the bytes are identical, the mtime did not move, and the document returned carries the stamp already on disk", (() => { const w = stableWrite(f, build, { stampName: "changedAt", stampValue: "v4950", newline: true }); return !w.wrote && w.kept && w.doc.changedAt === "v4900" && fs.readFileSync(f, "utf8") === bytes1 && year(f) === 2020; })());
    const w3 = stableWrite(f, (s) => ({ shapeAt: "v4314", changedAt: s, ...body, greedy: 40000 }), { stampName: "changedAt", stampValue: "v4960", newline: true });
    ok("CHANGED content is written with the new stamp", w3.wrote && !w3.kept && w3.doc.changedAt === "v4960" && JSON.parse(fs.readFileSync(f, "utf8")).greedy === 40000 && year(f) !== 2020);
    fs.writeFileSync(f, JSON.stringify({ shapeAt: "v4314", measuredAt: "v4819", ...body }, null, 1) + "\n");
    const w4 = stableWrite(f, build, { stampName: "changedAt", stampValue: "v4970", legacy: ["measuredAt"], newline: true }), w5 = stableWrite(f, build, { stampName: "changedAt", stampValue: "v4980", legacy: ["measuredAt"], newline: true });
    ok("a file written under the LEGACY spelling hands its stamp over once (the field is renamed, so that one write is real) and is stable after", w4.doc.changedAt === "v4819" && w4.kept && w4.wrote && !w5.wrote && JSON.parse(fs.readFileSync(f, "utf8")).measuredAt === undefined, `${w4.doc.changedAt}, then wrote=${w5.wrote}`);
    const g = path.join(tmp, "b.json"), buildLast = (s) => ({ ...body, written: s });
    stableWrite(g, buildLast, { stampName: "written", stampValue: "2026-10-09T00:00:00Z" }); const text = fs.readFileSync(g, "utf8"); old(g);
    const w6 = stableWrite(g, buildLast, { stampName: "written", stampValue: "2026-10-10T06:06:31Z" });
    ok("the stamp can sit LAST and the file can have no trailing newline (rig-expected.json's shape): a later day, same content, no write", !w6.wrote && fs.readFileSync(g, "utf8") === text && !text.endsWith("\n") && Object.keys(JSON.parse(text)).pop() === "written" && year(g) === 2020);
    const h = path.join(tmp, "c.json"); fs.writeFileSync(h, "not json at all");
    const w7 = stableWrite(h, buildLast, { stampName: "written", stampValue: "2026-10-10" });
    ok("a file that is not JSON is replaced, not trusted", w7.wrote && !w7.kept && JSON.parse(fs.readFileSync(h, "utf8")).written === "2026-10-10");
    let threw = false; try { stableWrite(h, buildLast, {}); } catch (e) { threw = /stampName is required/.test(e.message); }
    ok("a call with no stampName throws by name (a helper that guessed which field to ignore would ignore the wrong one)", threw);
}

sec("2. THE WRITERS: each goes through the helper");
{
    const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
    const trader = read("tools/ship/traderPolicy-selfcheck.mjs"), rig = read("tools/ship/rigCanvas-selfcheck.mjs"), probe = read("tools/ship/flakeProbe.mjs");
    ok("!! traderPolicy-selfcheck writes both artifacts through stableWrite, with `measuredAt` as the legacy spelling, and does not call writeFileSync on them itself", /stableWrite\(/.test(trader) && /legacy:\s*\["measuredAt"\]/.test(trader) && !/fs\.writeFileSync\(path\.join\(ENG, rel\)/.test(trader));
    ok("!! rigCanvas-selfcheck writes rig-expected.json through stableWrite and not with a `written: new Date()` of its own", /stableWrite\(EXPECTED/.test(rig) && !/written:\s*new Date\(\)/.test(rig));
    ok("the flake probe's record goes through stableWrite too (its date is a stamp, so a probe that finds nothing new leaves the record alone)", /stableWrite\(outFile/.test(probe));
    const live = ["traderPolicy-selfcheck.mjs", "rigCanvas-selfcheck.mjs"].map((f) => path.join(ENG, "tools/ship", f));
    ok("...and neither gate carries a clock or a version into a file by any other route (`written: new Date`, `measuredAt: ENGINE_VERSION`)", live.every((f) => !/written:\s*new Date|measuredAt:\s*ENGINE_VERSION/.test(fs.readFileSync(f, "utf8").replace(/\/\/[^\n]*/g, ""))));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? `\nstableWrite-selfcheck: ${fails} FAILED` : "\nstableWrite-selfcheck: all checks pass");
process.exitCode = fails ? 1 : 0;
