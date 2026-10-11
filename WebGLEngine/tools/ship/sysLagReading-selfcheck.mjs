// WebGLEngine/tools/ship/sysLagReading-selfcheck.mjs -- v4833 (it also holds tools/render-qa/deviceOwed.mjs' address sheet and the two backlog entries: the two rig readings are one gate, named for the first. NOT tools/ship/lagReading-selfcheck.mjs, which is v3317's arithmetic on the old /sys/lag samples)
//
// THE TWO BACKLOG ITEMS THAT NEED KEITH'S RIG, MADE ONE COMMAND EACH, AND THE ENTRIES THAT NAMED THEM CORRECTED. tools/ship/nextRounds.mjs carries two HARDWARE entries a sandbox cannot close: `sys-lag-reading`
// (one reading of the engine's lag endpoints after a few minutes of uptime) and `device-verdicts` (bench pages that owe a report from a GPU). The sandbox cannot take either reading -- that is what HARDWARE
// means -- but it can make taking them cheap, and in building that it found both entries wrong:
//   * sys-lag-reading said `GET /sys/lag` "names each blocking callback by its REGISTRATION site". It does not: /sys/lag returns durations (atMs, lagMs); the registration-site table is /sys/blame.
//   * device-verdicts said four pages owe a report and "Received kinds: NONE". A swek-magmap-bench report has been on file since 2026-08-26 (tools/roundhouse/magmap-bench.json, from a Mac running Chrome); three owe.
// This gate holds tools/ship/sysLagReading.mjs (the analysis on made-up readings, the waiting and the four GETs against a stand-in server, the refusal of a bad argument) and tools/render-qa/deviceOwed.mjs'
// address sheet, and holds both backlog entries to what the code and the files on disk say today -- so an entry cannot go on advertising a closed item (v3314's finding about the notes nothing re-reads).
//
// SABOTAGES (each broken in place, the gate run, restored and diffed, 2026-10-11):
//   A  analyse: the period test dropped (always "periodic")                  -> RED (the not-periodic row)
//   B  analyse: the duty cycle computed over milliseconds of uptime, not s   -> RED (the duty row)
//   C  analyse: an empty /sys/blame not reported                             -> RED (the empty-blame row)
//   D  takeReading: no wait for the uptime (reads at once)                   -> RED (the waited row and the uptime-in-reading row)
//   E  takeReading: /sys/blame not fetched                                   -> RED (the four-payloads row)
//   F  takeLagReading CLI: an unknown argument read past                         -> RED (the refusal row)
//   G  owedLines: the page address built without the port                    -> RED (the address row)
//   H  nextRounds: sys-lag-reading's `how` put back to naming /sys/lag       -> 1 RED (the entry row)
//   I  nextRounds: device-verdicts put back to "Four pages"                  -> 1 RED (the entry row)
//   J  sysLagReading: the /sys/slow route left out of ENDPOINTS                 -> 2 RED (the four-payloads row, the ENDPOINTS row)
//   K  sysLagReading: DEFAULT_PORT 8787 -> 8788                                 -> 1 RED (the defaults row: the backlog entry tells Keith 8787)
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as LR from "./sysLagReading.mjs";
import * as DO from "../render-qa/deviceOwed.mjs";
import { NEXT_ROUNDS } from "./nextRounds.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. the analysis, on readings whose answer is known ------------------------------------------------------------------------
console.log("1. sysLagReading.analyse on made-up readings");
const periodicEvents = Array.from({ length: 10 }, (_, k) => ({ atMs: 30000 * (k + 1) + (k % 3) * 200, lagMs: 400 }));
const a = LR.analyse({ health: { uptimeSec: 330 }, lag: { ok: true, blockedMsTotal: 4000, worstMs: 400, truncated: false, events: periodicEvents },
    blame: { ok: true, timers: [{ where: "server.js:123:9", worstMs: 450, slowTicks: 10, everyMs: 30000 }] }, slow: { ok: true, routes: [{ route: "/x", worstMs: 800, slowHits: 2 }] } });
ok("ten blocks 30 s apart read as PERIODIC with a 30 s median gap", a.period && a.period.periodic && Math.abs(a.period.medianGapMs - 30000) <= 400, JSON.stringify(a.period));
ok("the duty cycle is blocked time over uptime: 4 s in 330 s = 1.2%", a.dutyCycle != null && Math.abs(a.dutyCycle - 4000 / 330000) < 1e-9, String(a.dutyCycle));
const scattered = LR.analyse({ health: { uptimeSec: 330 }, lag: { ok: true, blockedMsTotal: 3000, worstMs: 900, events: [1000, 4000, 4500, 21000, 21500, 90000, 91000, 200000].map((atMs) => ({ atMs, lagMs: 400 })) }, blame: { timers: [] }, slow: { routes: [] } });
ok("blocks at irregular gaps are NOT called periodic", scattered.period && scattered.period.periodic === false, JSON.stringify(scattered.period));
ok("an EMPTY /sys/blame is said, because it is a finding (the cost is not an interval callback)", scattered.said.some((s) => /\/sys\/blame is EMPTY/.test(s)), scattered.said.join(" | "));
const bare = LR.analyse({});
ok("with nothing answering, nothing is invented: no uptime, no duty cycle, no period, and each missing endpoint is named", bare.uptimeSec === null && bare.dutyCycle === null && bare.period === null && bare.said.length >= 3 && bare.owners === null, bare.said.join(" | "));
ok("a truncated lag log (200 events) is said, because the total and the period are then from the first 200 only", LR.analyse({ health: { uptimeSec: 100 }, lag: { blockedMsTotal: 1, events: [], truncated: true }, blame: { timers: [{ where: "w", worstMs: 1, slowTicks: 1, everyMs: 1 }] } }).said.some((s) => /200-event cap/.test(s)));
const text = LR.summaryLines(a, { host: "rig", port: 8787 }).join("\n");
ok("the paste-back block names the registration site, the duty cycle, the period and the slow route", /server\.js:123:9/.test(text) && /1\.2% of uptime/.test(text) && /PERIODIC/.test(text) && /\/x/.test(text), text.split("\n").slice(0, 3).join(" / "));

// ---- 2. the waiting and the four GETs, against a stand-in engine ----------------------------------------------------------------
console.log("2. takeReading against a stand-in engine");
let healthCalls = 0, routesSeen = new Set();
const server = http.createServer((req, res) => {
    routesSeen.add(req.url);
    const send = (o) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.url === "/health") return send({ ok: true, uptimeSec: 100 * healthCalls++ });
    if (req.url === "/sys/lag") return send({ ok: true, blockedMsTotal: 4000, worstMs: 400, truncated: false, events: periodicEvents });
    if (req.url === "/sys/blame") return send({ ok: true, timers: [{ where: "server.js:123:9", worstMs: 450, slowTicks: 10, everyMs: 30000 }] });
    if (req.url === "/sys/slow") return send({ ok: true, routes: [] });
    if (req.url === "/sys/lagblame") return send({ ok: true, armed: false });
    res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const waits = []; const r1 = await LR.takeReading({ port, minUptimeS: 250, sleepImpl: async (ms) => { waits.push(ms); }, pollMs: 1 });
ok("it WAITED for the uptime: the engine reported 0, 100, 200 s and the reading was taken at 300 s", !r1.error && healthCalls >= 4 && waits.length >= 3 && r1.reading.health.uptimeSec >= 250, `${healthCalls} /health calls, ${waits.length} waits, reading at ${r1.reading && r1.reading.health.uptimeSec} s`);
ok("it took all four payloads, and the lagblame one too", !r1.error && ["lag", "blame", "slow", "lagblame"].every((k) => r1.reading[k] && r1.reading[k].ok) && ["/sys/lag", "/sys/blame", "/sys/slow", "/sys/lagblame", "/health"].every((u) => routesSeen.has(u)), [...routesSeen].join(" "));
ok("ENDPOINTS is exactly those five routes (the tool asks for no more and no fewer than the reading names)", JSON.stringify(Object.values(LR.ENDPOINTS).sort()) === JSON.stringify(["/health", "/sys/blame", "/sys/lag", "/sys/lagblame", "/sys/slow"]) && Object.values(LR.ENDPOINTS).every((u) => routesSeen.has(u)) && Object.isFrozen(LR.ENDPOINTS), Object.values(LR.ENDPOINTS).join(" "));
ok("...and the analysis of the reading is the analysis of the payloads", !r1.error && r1.analysis.period.periodic && r1.analysis.owners[0].where === "server.js:123:9");
await new Promise((r) => server.close(r));
let clock = 0; const r2 = await LR.takeReading({ port, minUptimeS: 10, deadlineMs: 1000, now: () => (clock += 600), sleepImpl: async () => {}, pollMs: 1 });
ok("with no engine listening it gives up INSIDE the deadline and says so, rather than hanging or inventing a reading", !!r2.error && /no engine answered/.test(r2.error) && !r2.reading, r2.error);

// ---- 3. the command line ---------------------------------------------------------------------------------------------------
console.log("3. the command line refuses what it does not know");
const run = (args) => spawnSync(process.execPath, [path.join(ENG, "tools", "ship", "takeLagReading.mjs"), ...args], { encoding: "utf8", timeout: 20000 });
const bad1 = run(["--bogus"]), bad2 = run(["--min-uptime-s"]), bad3 = run(["--min-uptime-s", "soon"]);
ok("the defaults are port 8787 and 300 s of uptime, and the backlog entry that tells Keith to run it says the same numbers", LR.DEFAULT_PORT === 8787 && LR.DEFAULT_MIN_UPTIME_S === 300 && NEXT_ROUNDS.find((e) => e.id === "sys-lag-reading").how.includes(String(LR.DEFAULT_PORT)) && NEXT_ROUNDS.find((e) => e.id === "sys-lag-reading").how.includes(LR.DEFAULT_MIN_UPTIME_S + " s"), `${LR.DEFAULT_PORT}, ${LR.DEFAULT_MIN_UPTIME_S} s`);
ok("an unknown argument, a missing value and a non-number each exit 2 with the reason (a typo must not silently take a reading with the default recipe)", [bad1, bad2, bad3].every((p) => p.status === 2) && /unknown argument/.test(bad1.stderr) && /needs a value/.test(bad2.stderr) && /needs a number/.test(bad3.stderr), [bad1, bad2, bad3].map((p) => p.stderr.trim().slice(0, 60)).join(" | "));

// ---- 4. the device-verdict sheet -------------------------------------------------------------------------------------------------
console.log("4. deviceOwed's address sheet");
const audit = DO.audit({});
const sheet = DO.owedLines(audit, { port: 8787 }).join("\n"), plain = DO.owedLines(audit).join("\n");
ok("with a port, each owed page that exists gets its own address, and the two clicks are named", audit.owed.filter((p) => p.exists).every((p) => sheet.includes(`http://127.0.0.1:8787/${p.page}`)) && /Run bench/.test(sheet) && /Submit measurement to fleet ledger/.test(sheet), audit.owed.map((p) => p.page).join(", "));
ok("without a port, no address is printed (the sheet is opt-in; the old output is unchanged)", !/http:\/\/127\.0\.0\.1/.test(plain));
const ghost = DO.owedLines({ owed: [{ page: "nowhere-bench.html", exists: false, kind: "k", what: "w" }], receivedKinds: [] }, { port: 1 }).join("\n");
ok("an owed page that is not in the tree is said so, not given an address that would 404", /nowhere-bench\.html\s+is not in this tree/.test(ghost) && !/127\.0\.0\.1:1\/nowhere/.test(ghost));
const bp = spawnSync(process.execPath, [path.join(ENG, "tools", "render-qa", "deviceOwed.mjs"), "--port", "abc"], { encoding: "utf8", timeout: 20000 });
ok("a bad --port exits 2 and says what it wanted", bp.status === 2 && /--port needs a port number/.test(bp.stderr), bp.stderr.trim());

// ---- 5. the backlog entries say what is true today -------------------------------------------------------------------------------
console.log("5. the two backlog entries");
const lagEntry = NEXT_ROUNDS.find((e) => e.id === "sys-lag-reading"), devEntry = NEXT_ROUNDS.find((e) => e.id === "device-verdicts");
const lagText = lagEntry ? [lagEntry.what, lagEntry.how, lagEntry.why].join(" ") : "";
ok("sys-lag-reading names the command that takes the reading and the route that NAMES callbacks (/sys/blame), and does not credit /sys/lag with naming them", !!lagEntry && /takeLagReading\.mjs/.test(lagText) && /\/sys\/blame/.test(lagText) && !/`?GET \/sys\/lag`?[^.]*names each blocking callback/.test(lagText), lagText.slice(0, 160));
const owedNames = audit.owed.map((p) => p.page.replace(/\.html$/, "")), closedNames = audit.rows.filter((p) => p.state === "VERDICT-IN").map((p) => p.page.replace(/\.html$/, ""));
const devText = devEntry ? [devEntry.what, devEntry.how, devEntry.why].join(" ") : "";
const word = ["Zero", "One", "Two", "Three", "Four", "Five"][audit.owed.length];
ok("device-verdicts counts and names exactly the pages that owe a report today", !!devEntry && owedNames.every((n) => devText.includes(n)) && new RegExp("\\b" + word + " pages? owe").test(devText), `${audit.owed.length} owe: ${owedNames.join(", ")}`);
ok("...and a page whose report is on file is never listed as owing: it is named only with \"on file\"", !!devEntry && closedNames.every((n) => !devText.includes(n) || new RegExp(n + "[^.]*on file").test(devText)), closedNames.join(", "));

console.log(fails ? `\nsysLagReading-selfcheck: ${fails} FAILED` : "\nsysLagReading-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
