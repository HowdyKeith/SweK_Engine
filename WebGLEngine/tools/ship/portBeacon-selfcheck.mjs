// tools/ship/portBeacon-selfcheck.mjs
//
// Run: node tools/ship/portBeacon-selfcheck.mjs
// RUNTIME 572ms MEASURED (median of 3 -- 541/909/572 ms, with date(1) around the run; the spread is the real
// ephemeral bind in section 4, which is at the mercy of whatever the OS hands out). It binds a real ephemeral HTTP server to prove the
// beacon names a port something is actually listening on.
//
// v4028 -- Keith's rig, two failures in one screenshot, and the second one was mine.
//
// *** v4014's LAUNCH FEATURE BROKE THE BRAIN AND NOTHING NOTICED FOR FOUR VERSIONS. *** launch() starts a clone
// on a FRESH FREE PORT on purpose -- "side by side, never over the top", which is the right call and the whole
// point of the feature. brain.js has defaulted to 127.0.0.1:8787 since long before it. So the engine came up on
// 54026, the brain dialled 8787, and the console read:
//
//     [brain] snapshot fetch failed ... target machine actively refused it. (os error 10061)
//     [brain] errors=168 lastSolve=0.0ms
//
// AGAINST A BRIDGE THAT WAS PERFECTLY HEALTHY. The feature that avoids a port collision created a discovery
// problem and shipped without the other half. /net/info already publishes the port and cannot help: reaching it
// means already knowing the port.
//
// So the bridge writes where it is at the one moment it is certain -- inside the bind callback, after success --
// and the brain reads that before falling back to the literal. THE GATE'S LOAD-BEARING PROPERTY IS NOT "a file
// exists". It is:
//
//     THE BEACON IS WRITTEN ONLY ON A SUCCESSFUL BIND, AND A STALE ONE IS REFUSED RATHER THAN DIALLED.
//
// A beacon written on startup INTENT rather than on bind SUCCESS would name a port the engine failed to take,
// which is worse than no beacon: it turns "nothing is listening" into "something is listening somewhere else".
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };

const SERVER = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
const BRAIN = fs.readFileSync(path.join(ENG, "brain", "brain.js"), "utf8");
const BEACON = "swek_bridge_port.json";

// The brain's own resolution order, mirrored here so every branch is driven without spawning Deno. Kept
// byte-faithful to brain.js's _beaconBridge by the source check in section 3.
const resolve = (envBridge, rec) => {
    if (envBridge) return envBridge.replace(/\/+$/, "");
    if (rec && Number.isFinite(rec.port) && !(rec.at && (Date.now() - rec.at) > 3600000)) return "http://127.0.0.1:" + rec.port;
    return "http://127.0.0.1:8787";
};

console.log("portBeacon-selfcheck -- can a brain find an engine that did not take the usual port?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE BEACON IS WRITTEN ON BIND SUCCESS, NOT ON INTENT ***");
{
    const code = codeOnly(SERVER), text = noComments(SERVER);
    // The write has to sit INSIDE appServer.listen's callback. A beacon written before the bind would name a
    // port the engine may never get -- and "something is listening elsewhere" is a worse lie than silence.
    const cb = (text.match(/appServer\.listen\(PORT,[\s\S]{0,2200}/) || [""])[0];
    ok("!! *** THE WRITE IS INSIDE THE listen CALLBACK ***", cb.includes(BEACON),
        cb.includes(BEACON) ? "written only once the port is genuinely held" :
        "*** NOT in the bind callback -- a beacon written on intent names a port that may never bind ***");
    ok("!! ...and it records WHICH engine wrote it, not just a number",
        /pid: process\.pid/.test(code) && /root:/.test(code),
        "two engines side by side leave one file; the pid and root are how a reader tells which one it found");
    ok("!! ...and it never throws into the boot path",
        /try \{[\s\S]{0,600}swek_bridge_port[\s\S]{0,600}\} catch \{\}/.test(text),
        "a beacon that could crash the bind would be a worse bug than the one it fixes");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE ORDER OF TRUST, AND ALL FOUR BRANCHES DRIVEN ***");
{
    const fresh = { port: 54026, at: Date.now() };
    ok("!! *** AN EXPLICIT BRAIN_BRIDGE ALWAYS WINS -- a typed address was meant ***",
        resolve("http://box:9999", fresh) === "http://box:9999",
        "even with a live beacon offering 54026");
    ok("!! *** A FRESH BEACON BEATS THE 8787 LITERAL ***", resolve(null, fresh) === "http://127.0.0.1:54026",
        "where an engine ACTUALLY is beats where one USUALLY is -- this is Keith's exact case");
    ok("!! *** A STALE BEACON IS REFUSED, NOT DIALLED ***",
        resolve(null, { port: 54026, at: Date.now() - 7200000 }) === "http://127.0.0.1:8787",
        "an hour-old record from a dead engine is a memory; dialling it would replace one wrong port with another");
    ok("!! ...and no beacon at all still starts, on the old default",
        resolve(null, null) === "http://127.0.0.1:8787",
        "a brain started before any engine has nothing better to try, and must not refuse to run");
    ok("!! ...and a malformed beacon is ignored rather than crashing the brain",
        resolve(null, { port: "banana" }) === "http://127.0.0.1:8787");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE BRAIN REALLY IMPLEMENTS THAT ORDER ***");
{
    const text = noComments(BRAIN), code = codeOnly(BRAIN);
    ok("!! the brain reads the beacon by name", text.includes(BEACON));
    ok("!! ...and only when BRAIN_BRIDGE is unset", /_envBridge \? null : _beaconBridge\(\)/.test(code),
        "reading it anyway would cost a file stat on every start for a value that loses");
    ok("!! ...and carries the same one-hour staleness bound the fixture asserts",
        /3600000/.test(code), "a bound in one place and not the other is two answers to one question");
    ok("!! ...and SAYS when it used the beacon rather than silently dialling elsewhere",
        /port beacon/i.test(BRAIN),
        "a brain that quietly connected somewhere other than where its log says would be the harder bug");
    // TEXT, NOT CODE: "http://127.0.0.1:8787" is a STRING LITERAL and codeOnly() blanks string contents, so
    // this check on `code` failed against a literal that was sitting right there. Fifth time this species bit
    // in two days -- searching for a string wants noComments, searching for a shape wants codeOnly, and the
    // rule being written in three other gate headers did not stop me reaching for the wrong one here.
    ok("!! ...and the 8787 literal survives as the last resort", /127\.0\.0\.1:8787/.test(text),
        "the old default is not deleted -- a brain with no env and no beacon still has somewhere to try");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** AGAINST A REAL LISTENER: THE BEACON NAMES A PORT SOMETHING ANSWERS ON ***");
{
    // The whole point is a port a client can actually reach. Fixtures cannot show that, so this binds a real
    // ephemeral server, writes a beacon the way the bridge does, resolves it the way the brain does, and
    // connects.
    const srv = http.createServer((rq, rs) => { rs.writeHead(200, { "Content-Type": "application/json" }); rs.end('{"ok":true}'); });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const realPort = srv.address().port;

    const f = path.join(os.tmpdir(), "swek_bridge_port.selftest.json");
    fs.writeFileSync(f, JSON.stringify({ port: realPort, pid: process.pid, root: ENG, at: Date.now() }));
    const rec = JSON.parse(fs.readFileSync(f, "utf8"));
    const url = resolve(null, rec);
    ok("!! the resolved url names the port that is really bound", url === "http://127.0.0.1:" + realPort, url);

    const body = await new Promise((res) => {
        http.get(url + "/", (r) => { let b = ""; r.on("data", (c) => b += c); r.on("end", () => res(b)); }).on("error", () => res(null));
    });
    ok("!! *** AND A CLIENT FOLLOWING THE BEACON ACTUALLY CONNECTS ***", body === '{"ok":true}',
        body === null ? "connection refused -- the beacon named a port nothing answers on" : "answered: " + body);
    try { fs.unlinkSync(f); } catch {}
    await new Promise((r) => srv.close(r));
}

// ---------------------------------------------------------------------------
console.log("\n5. *** THE OTHER CRASH ON THE SAME SCREEN: A LOGGER THAT COULD KILL ITS PROCESS ***");
{
    // Keith's rig: "KPopListener FATAL ... 0xE9 ... at Write-Log, KPopCommon.psm1: line 35". Write-Host asks the
    // HOST for its console mode; with no console attached that throws, and a terminating throw inside the
    // function every caller uses kills the listener while it is reporting that it is fine.
    const psm = fs.readFileSync(path.join(ENG, "..", "KPop Listener", "KPopCommon.psm1"), "utf8");
    const fn = (psm.match(/function Write-Log \{[\s\S]*?\n\}/) || [""])[0];
    ok("!! *** Write-Log's host write CANNOT terminate the listener ***",
        /try \{ Write-Host/.test(fn) && /catch \{/.test(fn),
        fn.includes("try { Write-Host") ? "the throw is caught where it happens" :
        "*** a bare Write-Host in a logger every caller uses is a process-killer on a hostless run ***");
    ok("!! ...and a hostless run still records the line rather than going silent",
        /KPop_hostless\.log/.test(fn) && /Add-Content/.test(fn),
        "'the console was unavailable' and 'there was nothing to say' are different facts");
    ok("!! ...and the last-resort catch is empty ON PURPOSE, with nowhere left to report to",
        /\} catch \{ \}\n\}/.test(fn) || /catch \{ \}/.test(fn),
        "throwing from the fallback would recreate the crash this replaces");
}

console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
process.exit(fails ? 1 : 0);
