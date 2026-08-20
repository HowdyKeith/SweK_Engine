// ai-bridge/tools/fleet-bridge-selfcheck.mjs -- v2221 -- proves fleetBridge headlessly.
//
//   node ai-bridge/tools/fleet-bridge-selfcheck.mjs

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import path from "node:path";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const bridge = require(path.join(HERE, "..", "fleetBridge.js"));

let pass = 0, fail = 0;
const ok = (n, c, x) => { (c ? pass++ : fail++); console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  -- " + x : ""}`); };

// ---- validate + text ----
ok("owns /fleet/announce", bridge.owns("/fleet/announce"));
ok("rejects a bad verb", bridge.validate({ verb: "sideways", peer: "PurtyGF" }).ok === false);
ok("rejects a peer with angle brackets", bridge.validate({ verb: "in", peer: "<script>x" }).ok === false);
ok("accepts a good event", bridge.validate({ verb: "in", peer: "PurtyGF", run: "r1" }).ok === true);
ok("fleetText(in) reads naturally", bridge.fleetText("in", "PurtyGF", "Galaxina") === "PurtyGF sailed into Galaxina's fleet");
ok("fleetText(out) reads naturally", bridge.fleetText("out", "PurtyGF", "Galaxina") === "PurtyGF sailed out of Galaxina's fleet");

// ---- handle(): mock req/res ----
function mkReq(method, url, body) {
    const r = new EventEmitter(); r.method = method; r.url = url;
    queueMicrotask(() => { if (body != null) r.emit("data", JSON.stringify(body)); r.emit("end"); });
    return r;
}
function mkRes() { return { code: 200, body: null, writeHead(c) { this.code = c; }, end(s) { this.body = s; } }; }
async function call(opts) {
    const res = mkRes(); let json = null;
    const ctx = { sendJson: (o, code = 200) => { json = o; res.code = code; }, ...opts.ctx };
    await bridge.handle(mkReq(opts.method || "POST", opts.url || "/fleet/announce", opts.body), res, ctx);
    return { json, code: res.code };
}

// untrusted -> 403, no broadcast
{
    let called = false;
    const r = await call({ body: { verb: "in", peer: "X" }, ctx: { isTrusted: () => false, announce: async () => { called = true; } } });
    ok("untrusted request is refused 403", r.code === 403 && r.json.ok === false);
    ok("untrusted request does NOT broadcast", called === false);
}

// trusted + injected announce -> shapes and fans out
{
    let captured = null;
    const r = await call({ body: { verb: "in", peer: "PurtyGF", run: "r7" }, ctx: { isTrusted: () => true, host: "Galaxina", announce: async (payload) => { captured = payload; return { ok: true, sent: 2 }; } } });
    ok("trusted request returns ok with the event", r.json.ok === true && r.json.event.verb === "in" && r.json.event.peer === "PurtyGF");
    ok("broadcast payload is a fleet announcement", captured && captured.kind === "fleet" && /sailed into Galaxina/.test(captured.text));
    ok("broadcast carries the structured fleet event", captured && captured.fleet && captured.fleet.verb === "in" && captured.fleet.run === "r7");
    ok("broadcast result is returned to the caller", r.json.broadcast && r.json.broadcast.sent === 2);
}

// trusted but malformed -> 400, no broadcast
{
    let called = false;
    const r = await call({ body: { verb: "nope", peer: "X" }, ctx: { isTrusted: () => true, announce: async () => { called = true; } } });
    ok("malformed event is 400", r.code === 400 && r.json.ok === false);
    ok("malformed event does NOT broadcast", called === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
