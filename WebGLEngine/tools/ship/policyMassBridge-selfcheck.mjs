// WebGLEngine/tools/ship/policyMassBridge-selfcheck.mjs -- v2856
//
// Run: node tools/ship/policyMassBridge-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/policyMassBridge.js + policy-mass.html -- the front door for brain/tools/policy-mass.mjs.
//
// THE PROPERTY THIS EXISTS FOR: the bridge must AGREE with the tool, never recompute the answer its own way. A
// dashboard that disagreed with the gate that proves the tool would be worse than none, because it is believed.
// So this drives the real handler and checks the numbers it returns are the SAME numbers the tool's own analyse
// produces -- and that the bridge source contains no second copy of the mass/merit math.
//
// AND: the page is honest about having no data. Real trace capture is off by default; the demo path must work
// with none, and one of the three demos must be the BACKWARDS case -- a front door that could only ever show
// "looks fine" is the decoration the tool exists to refute.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const bridge = require(path.join(ENG, "ai-bridge", "policyMassBridge.js"));
const tool = await import(pathToFileURL(path.join(ENG, "brain", "tools", "policy-mass.mjs")).href);

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// tiny harness: call handle() and capture what sendJson would have written. body may be a raw string (sent as one
// data chunk, exactly what a paste is) or an object (JSON-encoded, what the page's fetch sends).
async function call(url, method = "GET", body = null) {
    let captured = null, code = 200;
    const chunk = body == null ? null : (typeof body === "string" ? body : JSON.stringify(body));
    const req = {
        url, method,
        destroy() {},   // readRawBody calls this when the body overflows the cap
        on(ev, cb) { if (ev === "data" && chunk != null) cb(chunk); if (ev === "end") cb(); return req; },
    };
    const sendJson = (obj, c = 200) => { captured = obj; code = c; };
    await bridge.handle(req, {}, { sendJson });
    return { body: captured, code };
}

// 1. ROUTING: owns() claims its prefix and nothing else
{
    ok("owns: /policymass and subpaths", bridge.owns("/policymass") && bridge.owns("/policymass/demo") && bridge.owns("/policymass/analyze") && bridge.owns("/policymass?x=1"));
    ok("owns: NOT a lookalike path", !bridge.owns("/policymassX") && !bridge.owns("/policy") && !bridge.owns("/roundhouse") && !bridge.owns("/"));
    ok("owns: tolerates a non-string url", !bridge.owns(undefined) && !bridge.owns(null));
}

// 2. /status is honest about capture and needs no data
{
    const s = await call("/policymass/status");
    ok("/status ok, names the tool and the question", s.body && s.body.ok && s.body.tool.includes("policy-mass.mjs") && /mass/i.test(s.body.question));
    ok("/status reports capture (off by default) and how to turn it on", s.body.capture && "envHint" in s.body.capture && /BRAIN_TRACE/.test(s.body.capture.howToCapture));
    ok("/status lists demos including backwards", Array.isArray(s.body.demos) && s.body.demos.some((d) => d.key === "backwards"));
}

// 3. THE ONE THAT MATTERS: /demo works with no data, the BACKWARDS case is caught, and the bridge AGREES with the tool
{
    const r = await call("/policymass/demo?which=all");
    ok("/demo returns all three known-answer demos", r.body && r.body.ok && r.body.demos.length === 3);
    const byKey = Object.fromEntries((r.body.demos || []).map((d) => [d.key, d]));

    const back = byKey.backwards.domains.attack;
    ok("DEMO backwards is caught and coloured hot", back.rho < -0.5 && back.verdict.cls === "hot",
       "rho=" + back.rho.toFixed(3) + " cls=" + back.verdict.cls);
    const learn = byKey.learning.domains.attack;
    ok("DEMO learning reads as learning (ok)", learn.rho > 0.5 && learn.verdict.cls === "ok",
       "rho=" + learn.rho.toFixed(3) + " cls=" + learn.verdict.cls);
    const noise = byKey.noise.domains.attack;
    ok("DEMO noise is not a confident verdict", noise.rho === null || Math.abs(noise.rho) < 0.85,
       "rho=" + (noise.rho === null ? "null" : noise.rho.toFixed(3)));

    // AGREEMENT: the bridge's number must equal the tool's own analyse of the SAME generated trace, to the digit.
    const direct = tool.analyseTrace(tool.syntheticTrace(tool.DEMO_TRACES.backwards)).domains.attack;
    ok("BRIDGE AGREES WITH THE TOOL (no second implementation of the math)",
       direct.rho === back.rho && direct.verdict.text === back.verdict.text,
       "bridge " + back.rho.toFixed(3) + " vs tool " + direct.rho.toFixed(3));
}

// 4. an unknown demo name is refused, not silently defaulted
{
    const r = await call("/policymass/demo?which=doesnotexist");
    ok("unknown demo -> 404, not a fake result", r.code === 404 && r.body.error === "unknown-demo");
}

// 5. /analyze reads a pasted real-shape trace and reports it
{
    // a backwards trace pasted as raw jsonl (the paste path)
    const backTrace = tool.syntheticTrace(tool.DEMO_TRACES.backwards);
    const r = await call("/policymass/analyze", "POST", backTrace);
    ok("/analyze parses a pasted backwards trace and reads it backwards",
       r.body && r.body.ok && r.body.domains.attack.rho < -0.5,
       "rho=" + (r.body && r.body.domains.attack ? r.body.domains.attack.rho.toFixed(3) : "?"));

    // and via the {text:...} JSON envelope the page actually sends
    const r2 = await call("/policymass/analyze", "POST", { text: backTrace });
    ok("/analyze accepts the {text:...} envelope the page sends", r2.body && r2.body.ok && r2.body.domains.attack.rho < -0.5);
}

// 6. empty body is a clean refusal, not a crash or a fake measurement
{
    const r = await call("/policymass/analyze", "POST", "   ");
    ok("empty trace -> 400 with guidance, not a throw", r.code === 400 && r.body.error === "empty" && !r.body.ok);
}

// 7. a real-but-no-sampled-p trace is an ANSWER, not a failure (the tool's own stance)
{
    const noP = '{"t":"session","at":1}\n{"t":"d","seq":1,"id":"u","dom":"attack","choice":"o","mode":"emphasis","hit":1}';
    const r = await call("/policymass/analyze", "POST", noP);
    ok("no sampled-with-p -> ok:true, empty:true, says it is an answer", r.body && r.body.ok && r.body.empty === true && /answer, not a failure/.test(r.body.message),
       "sampledN=" + (r.body ? r.body.sampledN : "?"));
}

// 8. wrong method and the oversize cap
{
    const g = await call("/policymass/analyze", "GET");
    ok("/analyze via GET -> 405", g.code === 405);
    const big = "x".repeat(bridge.MAX_BODY + 32);
    const r = await call("/policymass/analyze", "POST", big);
    ok("oversized paste -> 413, does not buffer unbounded", r.code === 413 && r.body.error === "too-large");
}

// 9. unknown subroute -> 404
{
    const r = await call("/policymass/wat");
    ok("unknown subroute -> 404", r.code === 404 && r.body.error === "unknown-route");
}

// 10. THE BRIDGE DOES NOT REIMPLEMENT THE MATH -- it must import the tool, not carry its own spearman/massVsMerit
{
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "policyMassBridge.js"), "utf8");
    ok("bridge imports the tool (await import of policy-mass.mjs)", /policy-mass\.mjs/.test(src) && /import\(/.test(src));
    ok("bridge carries NO second copy of the math", !/function\s+spearman/.test(src) && !/function\s+massVsMerit/.test(src) && !/pSum/.test(src),
       "a duplicated implementation could drift from the gate that proves the real one");
}

// 11. THE BRIDGE IS ACTUALLY WIRED IN -- a bridge nobody dispatches is a file, not a front door
{
    const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("server.js requires policyMassBridge", /require\(["']\.\/policyMassBridge\.js["']\)/.test(server));
    ok("server.js dispatches policyMassBridge.owns/handle", /policyMassBridge\.owns\(/.test(server) && /policyMassBridge\.handle\(/.test(server));
}

// 12. THE PAGE calls the real endpoints and offers the no-data demo first
{
    const html = fs.readFileSync(path.join(ENG, "policy-mass.html"), "utf8");
    ok("page fetches /policymass/status, /demo and /analyze", /\/policymass\/status/.test(html) && /\/policymass\/demo/.test(html) && /\/policymass\/analyze/.test(html));
    ok("page offers a demo path (needs no captured trace)", /data-demo/.test(html) || /Run all three/.test(html));
    ok("page has a paste box for a real trace", /<textarea/.test(html) && /session\.jsonl/i.test(html));
}

console.log(fails ? "\npolicyMassBridge-selfcheck: " + fails + " FAILED" : "\npolicyMassBridge-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
