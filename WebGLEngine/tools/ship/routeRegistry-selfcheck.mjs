// tools/ship/routeRegistry-selfcheck.mjs
//
// Run: node tools/ship/routeRegistry-selfcheck.mjs
// RUNTIME 239ms MEASURED (median of 3 -- 247/239/207 ms, date(1) around the run). Binds one real ephemeral
// HTTP server in section 4; the spread is that real socket, not noise to round away.
//
// v4030 -- A PRECONDITION THAT IS DECLARED BUT NOT ENFORCED IS WORSE THAN ONE COPIED BY HAND.
//
// The hand-written guard this replaces was ugly and repeated -- 187 copies in five spellings -- but it was
// RIGHT AT EVERY CALL SITE, because each site could be read on its own. A registry concentrates that into one
// dispatcher, which means ONE MISTAKE IN handle() SILENTLY UNGATES EVERY ROUTE THAT DECLARED A CHECK. The
// blast radius went up when the duplication went down, and that trade is only worth taking if the enforcement
// is proven rather than assumed.
//
// THE LOAD-BEARING PROPERTY IS NOT "routes are registered". It is:
//
//     A DECLARED PRECONDITION IS ENFORCED OVER A REAL SOCKET, BEFORE THE BODY IS READ, AND FAILS CLOSED
//     WHEN THE CAPABILITY IT DEPENDS ON WAS NEVER INJECTED.
//
// So sections 4 and 5 bind a REAL http server and speak REAL requests to it. rocketBridge spawns node, python
// and pip; a fixture proving its gate "returns 403" while the wire path did something else would be the most
// expensive possible false green in this tree.
//
// *** codeOnly() BLANKS STRING CONTENTS as well as comments; noComments() strips only comments. A STRING
// LITERAL check wants noComments. A CODE SHAPE check wants codeOnly. Bitten five times in this tree; every
// string check below is deliberately on `text`. ***
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require_ = createRequire(import.meta.url);
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };

const { createRegistry, checks } = require_(path.join(ENG, "ai-bridge", "routeRegistry.js"));
const rocket = require_(path.join(ENG, "ai-bridge", "rocketBridge.js"));
const REG_SRC = fs.readFileSync(path.join(ENG, "ai-bridge", "routeRegistry.js"), "utf8");
const ROCKET_SRC = fs.readFileSync(path.join(ENG, "ai-bridge", "rocketBridge.js"), "utf8");
const BRAIN_SRC = fs.readFileSync(path.join(ENG, "ai-bridge", "gpuBrainBridge.js"), "utf8");

console.log("routeRegistry-selfcheck -- is a declared precondition actually enforced?\n");

// ---------------------------------------------------------------------------
console.log("1. *** checks.trusted FAILS CLOSED WHEN THE CAPABILITY IS MISSING ***");
{
    const req = { method: "POST", url: "/x", socket: {} };
    ok("!! *** no isTrusted injected at all -> DENIED ***", checks.trusted(req, {}) !== null,
        "a bridge wired without the capability must refuse everything, never allow everything -- the inverse " +
        "failure is a process-spawning route open to the internet because one wiring line was forgotten");
    ok("!! ...a non-function isTrusted is also DENIED", checks.trusted(req, { isTrusted: true }) !== null,
        "a truthy non-callable must not read as permission");
    ok("!! ...isTrusted returning false is DENIED", checks.trusted(req, { isTrusted: () => false }) !== null);
    ok("!! ...and only a real true PROCEEDS", checks.trusted(req, { isTrusted: () => true }) === null);
    ok("!! the refusal carries ONE stable machine code", (checks.trusted(req, {}) || {}).error === "trusted-only",
        "89/61/34/2/1 five-way spelling split is what this collapses; a client needs one token to branch on");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE ORDER: THE CHECK RUNS BEFORE THE BODY IS EVEN READ ***");
{
    // THIRD TIME THIS EXACT GATE REACHED FOR codeOnly() TO CHECK A STRING LITERAL. "data" is the event name
    // string in req.on("data", ...); codeOnly() blanks string CONTENTS by design, so it became "" and the
    // indexOf could never find it. noComments() is the one that keeps string content -- this gate's own
    // header names the rule and still got it wrong three separate times drafting it.
    const text = noComments(REG_SRC);
    const h = (text.match(/function handle\(req, res, ctx\)[\s\S]*?\n    \}/) || [""])[0];
    const iCheck = h.indexOf("spec.check("), iData = h.indexOf('req.on("data"');
    ok("!! *** spec.check() appears BEFORE req.on(\"data\") in handle() ***",
        iCheck > 0 && iData > 0 && iCheck < iData,
        "a request that was always going to be refused must not first be buffered and parsed");
    ok("!! a duplicate registration THROWS rather than silently overwriting",
        /already registered/.test(noComments(REG_SRC)),
        "two handlers for one route means one is dead code, and Map.set would pick one without saying so");
    const r = createRegistry("/t");
    r.get("/t/a", { handler: () => {} });
    let threw = false; try { r.get("/t/a", { handler: () => {} }); } catch { threw = true; }
    ok("!! ...and it really throws when driven", threw);
    let threw2 = false; try { r.get("/t/b", {}); } catch { threw2 = true; }
    ok("!! a registration with no handler is refused at registration time", threw2,
        "a route that would 500 on its first request should not survive to receive one");
    ok("!! owns() is EXACT MATCH, never a prefix wildcard",
        r.owns("/t/a") === true && r.owns("/t/a/deeper") === false && r.owns("/t/other") === false,
        "prefix ownership is what would swallow a neighbour's unmigrated routes mid-migration");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** EVERY /rocket ROUTE DECLARES THE TRUST CHECK -- NOT ONE INHERITS IT BY POSITION ***");
{
    const listed = rocket._registry.list();
    ok("!! all six routes are registered", listed.length === 6, listed.join(", "));
    // Drive the real bridge's registry with a ctx that denies, and assert EVERY route refuses.
    const denials = [];
    for (const key of listed) {
        const [method, p] = key.split(" ");
        let got = null;
        const res = { writeHead() {}, end() {} };
        const req = { method, url: p, on: (ev, cb) => { if (ev === "end") cb(); } };
        rocket.handle(req, res, { isTrusted: () => false, sendJson: (o, c) => { got = { o, c }; } });
        denials.push({ key, got });
    }
    ok("!! *** ALL SIX REFUSE AN UNTRUSTED CALLER ***",
        denials.every((d) => d.got && d.got.c === 403 && d.got.o.error === "trusted-only"),
        denials.filter((d) => !(d.got && d.got.c === 403)).map((d) => d.key).join(", ") || "every route 403s");
    ok("!! ...and the informative sentence SURVIVED the collapse to one code",
        denials.every((d) => /controls processes/.test(String(d.got.o.detail || ""))),
        "uniformity must not cost the reader the reason -- one code to branch on, one sentence to read");
    // The source-level statement: no route is protected merely by where it was typed.
    const code = codeOnly(ROCKET_SRC);
    ok("!! *** the old position-dependent single gate at the top of handle() is GONE ***",
        !/const trusted = ctx\.isTrusted/.test(code),
        "a gate at the top of a function protects routes BELOW it; position is not a security model");
    ok("!! ...and the orphaned readBody() went with it rather than lingering",
        !/function readBody/.test(code), "a declaration with no caller is what the orphan gates exist to catch");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** OVER A REAL SOCKET: THE GATE HOLDS ON THE BRIDGE THAT SPAWNS pip ***");
{
    // A FIXTURE CANNOT PROVE THIS. rocketBridge spawns node/python/pip; the question is what a real request
    // gets, so this binds a real server and sends real requests through the real handler.
    let trusted = false;
    const srv = http.createServer((req, res) => {
        const sendJson = (o, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
        rocket.handle(req, res, { isTrusted: () => trusted, sendJson });
    });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const port = srv.address().port;
    const call = (method, p, body) => new Promise((resolve) => {
        const rq = http.request({ host: "127.0.0.1", port, path: p, method,
            headers: body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {} },
            (rs) => { let b = ""; rs.on("data", (c) => b += c); rs.on("end", () => resolve({ status: rs.statusCode, body: b })); });
        rq.on("error", () => resolve({ status: 0, body: "" }));
        if (body) rq.write(body);
        rq.end();
    });

    trusted = false;
    const denied = await call("POST", "/rocket/train/start", JSON.stringify({ backend: "stub", iters: 1, pairs: 2, episodes: 1 }));
    ok("!! *** UNTRUSTED POST /rocket/train/start IS 403 OVER THE WIRE ***",
        denied.status === 403 && JSON.parse(denied.body).error === "trusted-only",
        "status " + denied.status + " " + denied.body.slice(0, 80));
    ok("!! ...and NOTHING WAS SPAWNED by that refused request",
        rocket.status().train === null,
        "the refusal has to happen before the handler, not inside it");

    trusted = true;
    const statusR = await call("GET", "/rocket/status");
    ok("!! a trusted GET /rocket/status answers 200", statusR.status === 200 && JSON.parse(statusR.body).ok === true);
    // A trusted request with a body the schema rejects: 400, and still nothing spawned.
    const bad = await call("POST", "/rocket/train/start", JSON.stringify({ backend: "banana", iters: 1, pairs: 2, episodes: 1 }));
    ok("!! *** a trusted request with an INVALID backend is 400, not a spawn ***",
        bad.status === 400 && JSON.parse(bad.body).error === "schema",
        "status " + bad.status + " " + bad.body.slice(0, 90));
    ok("!! ...and the schema's REASON reaches the caller",
        /backend must be one of/.test(bad.body), bad.body.slice(0, 90));
    ok("!! ...and STILL nothing was spawned", rocket.status().train === null);
    const badJson = await call("POST", "/rocket/prepare", "{not json");
    ok("!! *** malformed JSON is now 400 bad-json, where readBody() SILENTLY made it {} ***",
        badJson.status === 400 && JSON.parse(badJson.body).error === "bad-json",
        "a caller that sent garbage finds out; the old catch{} told it ok:true and dropped the body");
    const missing = await call("GET", "/rocket/nope");
    ok("!! an unregistered path under a claimed prefix is 404", missing.status === 404);
    await new Promise((r) => srv.close(r));
}

// ---------------------------------------------------------------------------
console.log("\n5. *** gpuBrainBridge: THE MIGRATED ROUTES WORK AND THE UNMIGRATED ONES ARE UNTOUCHED ***");
{
    const brain = require_(path.join(ENG, "ai-bridge", "gpuBrainBridge.js"));
    // *** A FOURTH INSTANCE, AND THE MOST CONSEQUENTIAL ONE: THIS WAS THE DEDUP CHECK, AND IT NEVER RAN. ***
    // "/ai/brain/experience" is the STRING LITERAL that identifies the route -- codeOnly() blanks string
    // CONTENTS by design, so the pattern this check searched for became `req.url === ""`, which cannot tell
    // "the old handler for experience is still here" from "no route check is here at all". A sabotage that put
    // the duplicate route straight back into the chain produced ZERO failures against the first draft. This is
    // the exact property the check exists for, silently not checked -- caught only by driving the sabotage,
    // not by reading the assertion. codeOnly is right for the shape check just below it (registry.owns(...)
    // ...registry.handle, which names no string), so the two checks now correctly use different helpers for
    // different reasons, not the same one because it was already in scope.
    const text = noComments(BRAIN_SRC), code = codeOnly(BRAIN_SRC);
    ok("!! *** the two migrated routes are GONE from the hand-written chain ***",
        !/req\.method === "POST" && req\.url === "\/ai\/brain\/experience"/.test(text) &&
        !/req\.url\.split\("\?"\)\[0\] === "\/ai\/brain\/experience"/.test(text),
        "leaving them in both places is two copies of one route -- v3527, and the second is never the one updated");
    ok("!! ...and the registry is offered the request BEFORE the chain",
        /registry\.owns\(req\.url\)[\s\S]{0,120}registry\.handle/.test(code),
        "registered after the chain would make every migrated route dead code");
    // *** RE-ANCHORED TO A FRESH SUBSTRING, NOT THE WHOLE FILE, AND THAT IS ITS OWN FINDING. ***
    // codeOnly(BRAIN_SRC) over the FULL file returns garbage from line 269 onward: a PRE-EXISTING regex
    // literal, /^["']|["']$/g, contains a quote INSIDE a character class -- sourceScan.mjs's own header
    // already admits "it will mangle a regex literal containing a quote", and this is that regex, hit for
    // real. The lexer (which has no concept of regex-literal context) sees the bare "'" inside the pattern
    // and spuriously opens STRING mode, then hunts for the next matching quote ANYWHERE LATER IN THE FILE --
    // corrupting everything after line 269 for every codeOnly()/noComments() caller, tree-wide. MEASURED this
    // round: 180 files across this codebase mis-lex the same way. That is a real, pre-existing, tree-wide gap
    // this gate did not create and is not the place to fix -- it is reported separately, not patched here.
    // Re-slicing from a clean marker resets the lexer's mode to null at the slice boundary, which is enough
    // to check a LOCAL property without waiting on a fix to the shared tool every other gate also depends on.
    const ownsAt = BRAIN_SRC.indexOf("function owns(url) {");
    const ownsSlice = BRAIN_SRC.slice(ownsAt, ownsAt + 200);
    ok("!! ...while owns() still claims the WHOLE namespace, so server.js dispatch is unchanged",
        noComments(ownsSlice).includes('u === "/ev" || u.startsWith("/ai/brain")'),
        "an unmigrated /ai/brain/* route must still reach this bridge exactly as before -- checked with " +
        "noComments, not codeOnly, because this checks a STRING LITERAL'S CONTENT, which codeOnly blanks by " +
        "design. codeOnly is for a CODE SHAPE; this gate's own header says so and still reached for the wrong " +
        "one on the first draft -- sixth time this species has bitten in this tree");

    // Drive the migrated POST + GET for real.
    let got = null;
    const ctx = { sendJson: (o, c) => { got = { o, c }; } };
    const post = (bodyStr) => { got = null; const req = { method: "POST", url: "/ai/brain/experience",
        on: (ev, cb) => { if (ev === "data") cb(bodyStr); if (ev === "end") cb(); } };
        brain.handle(req, { writeHead() {}, end() {} }, ctx); return got; };
    const good = post(JSON.stringify({ from: "gate", samples: [{ pol: "p", x: 1, r: 2 }] }));
    ok("!! a well-formed experience POST is accepted", good && good.o.ok === true, JSON.stringify(good && good.o));
    const badShape = post(JSON.stringify({ nope: true }));
    ok("!! *** a malformed experience POST now REPORTS 400 instead of replying ok:true ***",
        badShape && badShape.c === 400 && badShape.o.error === "schema",
        "the old catch{} dropped the samples and still answered ok:true -- invisible on both ends");
    got = null;
    brain.handle({ method: "GET", url: "/ai/brain/experience?after=0", on: () => {} }, { writeHead() {}, end() {} }, ctx);
    ok("!! the migrated GET still returns the ring", got && got.o.ok === true && Array.isArray(got.o.samples),
        "samples: " + ((got && got.o.samples || []).length));
    // Same re-anchor as the owns() check above: noComments(BRAIN_SRC) over the FULL file inherits the same
    // line-269 corruption and returns 0 matches for text that is genuinely there twice. Sliced from the
    // registrations' own marker, which is well past line 269 and starts the lexer clean.
    const regAt = BRAIN_SRC.indexOf("// v4030 REGISTRY REGISTRATIONS");
    ok("!! *** both migrated routes declare checks.none EXPLICITLY, recording the pre-existing posture ***",
        (noComments(BRAIN_SRC.slice(regAt)).match(/check: checks\.none/g) || []).length >= 2,
        "neither route checked trust before; migrating is not the moment to widen or narrow that, but the " +
        "absence must be DECLARED so a reader knows nobody forgot");
}

console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
process.exit(fails ? 1 : 0);
