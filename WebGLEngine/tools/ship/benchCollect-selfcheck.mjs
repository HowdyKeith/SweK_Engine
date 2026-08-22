// WebGLEngine/tools/ship/benchCollect-selfcheck.mjs -- v2985
//
// Run: node tools/ship/benchCollect-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/benchCollectBridge.js -- the fan-out that finally answers Keith's question with a table
// rather than an endpoint.
//
// v2984 built the SCORE: a peer can be asked for one, and answers with a time, the correctness residual from
// the SAME run, its arch and its engine version. It could not ask the others. This collects.
//
// TWO THINGS THIS GATE EXISTS TO HOLD:
//
//   ONE PEER CLIENT, NOT TWO. It reuses fingerprintBridge's fetchJson, whose timeout and error shapes were
//   settled by contact with real machines. A second fetcher would drift silently -- this tree has paid for
//   duplicate implementations of one job repeatedly, and the transport layer is the last place to repeat it.
//
//   ONE OWNER FOR /bench/*. v2984 put /fleetbench/score INLINE in server.js; one round later the collector needed
//   the same row shape, and there were briefly TWO implementations of "this box's score". The inline copy is
//   gone and localRow() is the single owner, so a self row and a peer row cannot describe different things.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const bc = require(path.join(ENG, "ai-bridge", "benchCollectBridge.js"));
const fp = require(path.join(ENG, "ai-bridge", "fingerprintBridge.js"));
const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
const src = fs.readFileSync(path.join(ENG, "ai-bridge", "benchCollectBridge.js"), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

async function call(url, method = "GET", body = null) {
    let out = null, code = 200;
    const req = { url, method, destroy() {},
        on(ev, cb) { if (ev === "data" && body) cb(JSON.stringify(body)); if (ev === "end") cb(); return req; } };
    await bc.handle(req, {}, { sendJson: (o, c = 200) => { out = o; code = c; } });
    return { body: out, code };
}

// ---- 1. ONE PEER CLIENT ------------------------------------------------------------------------------------
{
    ok("!! it REUSES fingerprintBridge's fetchJson", /require\("\.\/fingerprintBridge\.js"\)/.test(src) && /fetchJson/.test(src),
       "a second peer client with its own timeout semantics would drift from the one that talks to the real fleet");
    ok("...and fingerprintBridge exports it deliberately", typeof fp.fetchJson === "function");
    const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    ok("!! ...and does NOT define its own http fetch", !/https?\.get\(|new XMLHttpRequest|require\("http/.test(code),
       "the transport is borrowed whole, not reimplemented");
}

// ---- 2. ONE OWNER FOR /bench/* -------------------------------------------------------------------------------
{
    ok("the bridge owns both routes", bc.owns("/fleetbench/score") && bc.owns("/fleetbench/collect"));
    ok("...and not unrelated ones", !bc.owns("/weight") && !bc.owns("/fingerprint"));
    ok("!! server.js has NO inline /fleetbench/score left", !/req\.url\.split\("\?"\)\[0\] === "\/bench\/score"/.test(server),
       "v2984 put one there; one round later the collector needed the same row shape, and two implementations of 'this box's score' briefly existed");
    ok("...and the orphaned helper it used is gone", !/ENGINE_VERSION_FOR_BENCH/.test(server),
       "a helper left behind after its only caller is removed is the graveyard census's whole subject");
    ok("server.js dispatches the bridge", /benchCollectBridge\.owns\(/.test(server));
}

// ---- 3. SELF AND PEER ROWS ARE BUILT BY THE SAME FUNCTION -------------------------------------------------------
{
    const row = await bc.localRow();
    ok("localRow returns a complete row", row.ok === true && !!row.host && !!row.arch && !!row.engineVersion && !!row.score,
       row.host + " " + row.arch + " " + row.engineVersion);
    ok("!! ...and its engineVersion is READ from the marker", row.engineVersion === bc.engineVersion() && /^v\d+$/.test(row.engineVersion),
       row.engineVersion + " -- a second hard-coded copy is a second thing to rot");
    const s = (await call("/fleetbench/score")).body;
    ok("/fleetbench/score serves that same row", s.ok && s.host === row.host && s.engineVersion === row.engineVersion,
       "self and peer rows cannot describe different things if one function builds both");
}

// ---- 4. THE REFUSALS SURVIVE THE FAN-OUT, which is where they matter most ----------------------------------------
//
// A fleet table looks authoritative in a way a single number does not, so v2984's refusals have to hold here.
{
    const r = await bc.collectScores(["http://127.0.0.1:9/nope"], { timeoutMs: 1500 });
    ok("an unreachable peer is FAILED, not zero", r.rows.some((x) => x.verdict === "failed"),
       "a missing score counted as zero would top the table");
    ok("...with the real reason attached", r.rows.some((x) => /ECONNREFUSED|timeout|no response/i.test(x.why || x.error || "")));
    ok("this box is still ranked", r.rows.some((x) => x.verdict === "ranked"));
    ok("!! the caveat travels with the table", /diverged, not ranked/i.test(r.caveat || ""),
       "the table has to say that a fast wrong answer was excluded, or a reader assumes it was never there");
    ok("the workload is named", /lbm-poiseuille/.test(r.workload || ""));
    ok("reachable is counted separately from collected", r.collected > r.reachable);
}

// ---- 5. it refuses to guess the fleet -----------------------------------------------------------------------------
{
    ok("!! /fleetbench/collect without urls is REFUSED", (await call("/fleetbench/collect", "POST", {})).code === 400,
       "scanning the LAN uninvited is not this bridge's job, and guessing which boxes to benchmark is worse than asking");
    ok("...and via GET is 405", (await call("/fleetbench/collect", "GET")).code === 405);
    ok("unknown subroute -> 404", (await call("/bench/nope")).code === 404);
}

console.log(fails ? "\nbenchCollect-selfcheck: " + fails + " FAILED" : "\nbenchCollect-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
