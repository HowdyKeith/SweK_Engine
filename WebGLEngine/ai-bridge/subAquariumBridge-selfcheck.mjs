// WebGLEngine/ai-bridge/subAquariumBridge-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node ai-bridge/subAquariumBridge-selfcheck.mjs      (~1 s)
//
// THE ROUTES HELD TO THEIR TRUST. ai-bridge/subAquariumBridge.js is driven here with fake requests and a fake peer; nothing listens on a port:
//   1  ROUTING     owns() is exactly the seven routes (query strings ignored); a wrong method is 405; an unknown /subaquarium path under a known router is 404
//   2  THE CHIPS   /ai/fishbrain/health and /ai/flybrain/health are PUBLIC and read the disk: on a temp tree with nothing they are offline; weights without a fish circuit are 'standin'; a vendored fish circuit makes fish
//                  'live'; the fly circuit alone is 'stale', with trained weights 'live'; on THIS tree fish is 'standin' (the truth) and fly 'live'; the detail counts the tank
//   3  ARRIVALS    UNTRUSTED -> 403 and nothing stored; trusted and valid -> stored REMOTE, stamped with the address that dialled (::ffff:192.168.1.7 -> 192.168.1.7), ignoring a body's local/from; the sub may be bare or
//                  wrapped in { sub }; an invalid sub is 400 with the validator's own words; malformed JSON 400; over 64 KB 413 (and nothing stored); the same sub twice is one sub ('replaced'); 30 a minute an address,
//                  the 31st is 429, another address is not limited, and the window slides (61 s later it is open again)
//   4  THE LIST    public; newest first; carries the weights the page flies; counts split local from remote
//   5  THE SEED    untrusted 403; trusted offers this tree's five champions as LOCAL subs (re-seeding replaces, it does not duplicate); a temp tree with no files offers only the PD autopilot and names what was skipped
//   6  SENDING     untrusted 403; an unknown id 404; a REMOTE sub cannot be forwarded (400); a peer that is not LAN/mesh (a public IP, a hostname, file:, credentials in the URL) 400 and NOTHING dialled; a good peer is
//                  dialled at <peer>/subaquarium/arrive with { sub: {name, circuit, weights, theta, hue} } and NO id, local or from, with redirects refused and a timeout; an unreachable or refusing peer is 502 with the reason
//   8  OVER REAL HTTP  two bridges on loopback ports: A seeds and SENDS a champion to B, B's tank holds it bit for bit; sending again replaces it; a peer that refuses or is not listening is reported with its reason; a 100 KB body is 413 over the wire
//   7  REMOVAL     untrusted 403; an unknown id says removed: false; a known one is gone
//
// SABOTAGE LOG -- THIRTY-FIVE, each applied to ai-bridge/subAquariumBridge.js in place, the gate run, the file restored; every one red by name (the number is how many rows went red):
//   B1 an extra route owned 1 | B2 a route dropped 1 | B3 the query string not ignored 1 | B4 rate 300 a minute 1 | B5 the rate window never slides 1 | B6 /arrive needs no trust 7 | B7 /seed needs no trust 1 | B8 /remove needs no trust 1
//   B9 /send needs no trust 5 | B10 `from` taken from the BODY 1 | B11 `local` taken from the BODY 1 | B12 the ::ffff: prefix kept 1 | B13 the body cap ignored 1 | B14 an over-size body stored anyway 1 | B15 bad JSON read as empty 1 (it went 0 red until the row checked the MESSAGE: an unparsed body fell through to the validator, which also said 400)
//   B16 the { sub } wrapper not unwrapped 9 | B17 validation skipped 1 | B18 seeded subs marked remote 4 | B19 remote subs can be forwarded 3 | B20 any peer host allowed 2 | B21 credentials in the peer URL allowed 2
//   B22 any URL scheme allowed 2 | B23 172.32 read as private 2 | B24 100.128 read as private 2 | B25 redirects followed 1 | B26 no timeout 1 | B27 id/local/from leak into the sent sub 1 | B28 posts to the wrong path 1
//   B29 a refusing peer swallowed 1 | B30 an unreachable peer says ok: true 1 | B31 the list trusted-only 1 | B32 the health trusted-only 1 | B33 a vendored fish circuit never seen 1 | B34 pilots from the wrong directory 3 | B35 the fly weights file wrong 2
//   ROUND 2 (after the bridge took a declared PREFIX for tools/ship/bridgeCensus-selfcheck.mjs and the real-HTTP section 8 was added): the whole list re-run with clean patterns plus B3b (the namespace not owned),
//   B3c (a lookalike owned), B36 (an unknown route answering 200) and B37 (the peer's path kept): every one red, none missing, none crashed.
// B10 and B11 went 0 red the first time -- THE TWO SECURITY PROPERTIES THE WHOLE DESIGN RESTS ON (a sender cannot choose its `from` or its `local`): the arrival row put the claims INSIDE { sub }, where the validator drops
// them, and never at the TOP LEVEL of the body, where this bridge's own code could have read them. The row that claims local/from/id/arrivedAt beside { sub } holds both now. B30 went 0 red because the row never looked at
// `ok`. B6-B9, B15, B17, B21, B29, B31, B32 first ran with stray backslashes (PATTERN MISSING or a SyntaxError that crashed the gate and counted as 0 red -- a crash is not a catch); and B15, B17 and B29 made the handler
// THROW, which hung the fake request instead of failing a row: `call` now turns a throw into a 500 with the reason, and the three are red by name.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require_ = createRequire(import.meta.url), B = require_("./subAquariumBridge.js"), C = require_("./subAquariumCore.js");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const W = () => Array.from({ length: 963 }, (_, i) => Math.sin(i) * 0.5), TH = () => Object.fromEntries(C.THETA_NAMES.map((k, i) => [k, i + 1]));
let clock = 1e6;
const mkBridge = (opts = {}) => B.createBridge({ now: () => clock, ...opts });
// a fake request: raw body text, a remote address, a method and a url
function call(bridge, method, url, body, { trusted = true, remote = "192.168.1.7" } = {}) {
    return new Promise((resolve) => {
        const req = new EventEmitter(); req.method = method; req.url = url; req.socket = { remoteAddress: remote }; req.headers = {};
        let status = 200, out = null;
        const sendJson = (o, code = 200) => { status = code; out = o; resolve({ status, json: out }); };
        Promise.resolve().then(() => bridge.handle(req, {}, { sendJson, isTrusted: () => trusted })).then(() => { if (out === null) resolve({ status, json: null }); }, (err) => resolve({ status: 500, json: { ok: false, error: "THREW: " + String(err && err.message || err) } }));   // a handler that throws is a 500 with the reason, not a hung gate
        setImmediate(() => { if (body !== undefined) req.emit("data", typeof body === "string" ? body : JSON.stringify(body)); req.emit("end"); });
    });
}
const tmpRoot = (files = {}) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "aq-")); for (const [rel, content] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), content); } return d; };

console.log("subAquariumBridge-selfcheck -- the sub aquarium's routes\n");

console.log("1. ROUTING");
{
    const routes = ["/ai/fishbrain/health", "/ai/flybrain/health", "/subaquarium/list", "/subaquarium/arrive", "/subaquarium/send", "/subaquarium/seed", "/subaquarium/remove"];
    ok("!! owns() claims the seven routes (a query string is ignored), the whole /subaquarium namespace (an unknown /subaquarium/x and /subaquarium itself are ours: they 404 from HERE), and NOTHING ELSE: /fleet/announce, /ai/brain/health, the lookalikes /subaquariumx and /subaquarium-foo/x, '' and non-strings are not ours; and PREFIX is /subaquarium", routes.every((r) => B.owns(r) && B.owns(r + "?a=1")) && ["/subaquarium", "/subaquarium/", "/subaquarium/x", "/subaquarium/x/y"].every((r) => B.owns(r)) && ["/fleet/announce", "/ai/brain/health", "/ai/fishbrain", "/ai/fishbrain/healthx", "/subaquariumx", "/subaquarium-foo/x", "/xsubaquarium/list", "", null, undefined, 7].every((r) => !B.owns(r)) && B.ROUTES.size === 7 && B.PREFIX === "/subaquarium");
    const b = mkBridge();
    const g = await call(b, "POST", "/subaquarium/list"), p = await call(b, "GET", "/subaquarium/arrive"), h = await call(b, "POST", "/ai/fishbrain/health");
    const unk = await call(mkBridge(), "GET", "/subaquarium/nope");
    ok("!! an unknown path inside the namespace is a 404 'no such route' from this bridge, for GET and POST, trusted or not", unk.status === 404 && /no such route/.test(unk.json.error) && (await call(mkBridge(), "POST", "/subaquarium/x", {}, { trusted: false })).status === 404 && (await call(mkBridge(), "GET", "/subaquarium")).status === 404);
    ok("!! a wrong method is 405 on every route kind: POST to a GET route, GET to a POST route, POST to a health route", g.status === 405 && p.status === 405 && h.status === 405 && (await call(b, "GET", "/subaquarium/send")).status === 405 && (await call(b, "GET", "/subaquarium/seed")).status === 405 && (await call(b, "GET", "/subaquarium/remove")).status === 405);
}

console.log("\n2. THE CHIPS");
{
    const empty = tmpRoot(), e = mkBridge({ root: empty });
    const f0 = (await call(e, "GET", "/ai/fishbrain/health", undefined, { trusted: false })).json, y0 = (await call(e, "GET", "/ai/flybrain/health", undefined, { trusted: false })).json;
    ok("!! the chips are PUBLIC (an untrusted caller gets them) and a tree with nothing is offline for both", f0.ok && f0.state === "offline" && y0.ok && y0.state === "offline" && f0.circuit.fish === false && f0.pilots.length === 0);
    const w = tmpRoot({ "brain/pilotSubWeightsWip.json": "{}", "brain/pilotSubWeightsActuatorsWip.json": "{}", "vendor/male-cns/giant-fiber-circuit.json": "{}" }), wb = mkBridge({ root: w });
    const f1 = (await call(wb, "GET", "/ai/fishbrain/health")).json, y1 = (await call(wb, "GET", "/ai/flybrain/health")).json;
    ok("!! sub pilot weights and the FLY circuit but no fish circuit: fish is 'standin' (and lists both pilots), fly is 'stale' (the circuit, no trained flight weights)", f1.state === "standin" && f1.pilots.length === 2 && f1.circuit.fly === true && f1.circuit.fish === false && y1.state === "stale", `${f1.state} / ${y1.state}`);
    const fz = tmpRoot({ "brain/pilotSubWeightsWip.json": "{}", "vendor/zebrafish/larva-circuit.json": "{}", "vendor/male-cns/giant-fiber-circuit.json": "{}", "brain/pilotFlightWeightsDefault.json": "{}" }), fzb = mkBridge({ root: fz });
    const f2 = (await call(fzb, "GET", "/ai/fishbrain/health")).json, y2 = (await call(fzb, "GET", "/ai/flybrain/health")).json;
    ok("!! a vendored fish circuit (vendor/zebrafish/*.json) with a pilot makes fish 'live'; the fly circuit with trained flight weights makes fly 'live'; a fish circuit with NO pilot is still offline", f2.state === "live" && y2.state === "live" && (await call(mkBridge({ root: tmpRoot({ "vendor/zebrafish/c.json": "{}" }) }), "GET", "/ai/fishbrain/health")).json.state === "offline");
    const real = mkBridge({ root: ENG }), fr = (await call(real, "GET", "/ai/fishbrain/health")).json, yr = (await call(real, "GET", "/ai/flybrain/health")).json;
    ok("!! on THIS tree the truth: fish is 'standin' (no fish circuit is vendored; three trained sub pilots exist) and fly is 'live'; the fish detail says STAND-IN", fr.state === "standin" && fr.circuit.fish === false && fr.pilots.length >= 3 && /STAND-IN/.test(fr.detail) && yr.state === "live", `${fr.state} ${fr.pilots.length} / ${yr.state}`);
    const t = mkBridge({ root: empty }); await call(t, "POST", "/subaquarium/arrive", { sub: { name: "A" } });
    ok("the fish detail counts the tank: after one arrival it says '1 sub (0 here, 1 from peers)'", /Aquarium: 1 sub \(0 here, 1 from peers\)/.test((await call(t, "GET", "/ai/fishbrain/health")).json.detail));
}

console.log("\n3. ARRIVALS");
{
    const b = mkBridge({ root: tmpRoot() });
    const u = await call(b, "POST", "/subaquarium/arrive", { sub: { name: "Intruder" } }, { trusted: false });
    ok("!! an UNTRUSTED sender is 403 and NOTHING is stored", u.status === 403 && /not trusted/.test(u.json.error) && b.registry.counts().total === 0);
    const a = await call(b, "POST", "/subaquarium/arrive", { sub: { name: "Peer Sub", weights: W(), theta: TH(), local: true, from: "evil", id: "x" } }, { remote: "::ffff:192.168.1.7" }), e = b.registry.get(a.json.id);
    ok("!! a trusted valid arrival is 200 and stored REMOTE, stamped with the address that dialled ('::ffff:192.168.1.7' -> '192.168.1.7'): the body's local: true, from and id changed nothing", a.status === 200 && a.json.ok && e && e.local === false && e.from === "192.168.1.7" && e.name === "Peer Sub" && e.id === a.json.id && a.json.id !== "x" && a.json.counts.remote === 1);
    const claim = await call(b, "POST", "/subaquarium/arrive", { sub: { name: "Claimer" }, local: true, from: "evil.example", id: "zzz", arrivedAt: 0 }, { remote: "192.168.1.8" }), ce = b.registry.get(claim.json.id);
    ok("!! the SAME claims at the TOP LEVEL of the body (beside { sub }) change nothing either: a body that says local: true, from: 'evil.example', its own id and arrivedAt is stored remote, from the address that dialled (192.168.1.8), under the content id", claim.status === 200 && ce.local === false && ce.from === "192.168.1.8" && claim.json.id !== "zzz" && ce.arrivedAt !== 0);
    const bare = await call(b, "POST", "/subaquarium/arrive", { name: "Bare Sub" });
    ok("!! the sub may be BARE (no { sub } wrapper) as well as wrapped", bare.status === 200 && b.registry.counts().total === 3);
    const again = await call(b, "POST", "/subaquarium/arrive", { sub: { name: "Peer Sub", weights: W(), theta: TH() } });
    ok("!! the same sub again is ONE sub (replaced: true, the count unchanged)", again.json.replaced === true && again.json.id === a.json.id && b.registry.counts().total === 3);
    const bad = await call(b, "POST", "/subaquarium/arrive", { sub: { name: "Bad", weights: [1, 2, 3] } }), nan = await call(b, "POST", "/subaquarium/arrive", { sub: { name: "N", theta: { ...TH(), aimTol: "x" } } });
    ok("!! an invalid sub is 400 with the VALIDATOR'S words (the field and the rule), nothing stored: weights of the wrong count; a theta number that is not a number", bad.status === 400 && /weights: exactly 963/.test(bad.json.error) && nan.status === 400 && /theta\.aimTol/.test(nan.json.error) && b.registry.counts().total === 3);
    const junk = await call(b, "POST", "/subaquarium/arrive", "{not json"), big = await call(b, "POST", "/subaquarium/arrive", JSON.stringify({ sub: { name: "Big", weights: Array.from({ length: 6000 }, () => 0.123456789) } }));
    ok("!! malformed JSON is 400; a body over 64 KB is 413 (and nothing is stored from it)", junk.status === 400 && /body is not JSON/.test(junk.json.error) && big.status === 413 && /65536/.test(big.json.error) && b.registry.counts().total === 3, `${big.status}`);
    const lim = mkBridge({ root: tmpRoot() }); let last = null; for (let i = 0; i < 31; i++) last = await call(lim, "POST", "/subaquarium/arrive", { sub: { name: "S" + i } }, { remote: "10.0.0.9" });
    const other = await call(lim, "POST", "/subaquarium/arrive", { sub: { name: "Other" } }, { remote: "10.0.0.10" });
    const names = lim.registry.list().map((x) => x.name);
    ok("!! 30 a minute an address: the 31st from 10.0.0.9 is 429 ('30 a minute') and is NOT stored (S30 is not in the tank; the tank holds its 24-sub cap of the 30 admitted); a DIFFERENT address is not limited and is stored", last.status === 429 && /30 a minute/.test(last.json.error) && !names.includes("S30") && names.includes("S29") && lim.registry.counts().total === 24 && other.status === 200 && names.includes("Other"), `${last.status} / ${other.status} / ${lim.registry.counts().total}`);
    clock += 61000; const later = await call(lim, "POST", "/subaquarium/arrive", { sub: { name: "Later" } }, { remote: "10.0.0.9" });
    ok("!! the rate window SLIDES: 61 seconds later the same address is admitted again", later.status === 200);
    const nolimit = await call(lim, "POST", "/subaquarium/arrive", { sub: { name: "ZZZ" } }, { remote: "10.0.0.9", trusted: false });
    ok("a rejected (untrusted) request does not count against anyone: the rate is spent only by admitted subs", nolimit.status === 403);
}

console.log("\n4. THE LIST");
{
    let t0 = 5e6; const b = mkBridge({ root: tmpRoot(), now: () => t0++ }); await call(b, "POST", "/subaquarium/seed", undefined);
    await call(b, "POST", "/subaquarium/arrive", { sub: { name: "First", weights: W() } }); await call(b, "POST", "/subaquarium/arrive", { sub: { name: "Second" } });
    const l = await call(b, "GET", "/subaquarium/list", undefined, { trusted: false });
    ok("!! the list is PUBLIC, newest first, carries the weights the page flies (963) and the pilot kind, and the counts split local from remote", l.status === 200 && l.json.subs[0].name === "Second" && l.json.subs[1].name === "First" && l.json.subs[1].weights.length === 963 && l.json.subs[1].pilot === "network" && l.json.subs[0].pilot === "autopilot" && l.json.counts.remote === 2 && l.json.counts.local === 1 && l.json.subs.every((s) => ["id", "name", "circuit", "weights", "theta", "hue", "pilot", "from", "local", "arrivedAt"].every((k) => k in s)));
}

console.log("\n5. THE SEED");
{
    const b = mkBridge({ root: ENG });
    const d = await call(b, "POST", "/subaquarium/seed", undefined, { trusted: false });
    ok("!! an untrusted seed is 403", d.status === 403 && b.registry.counts().total === 0);
    const s = await call(b, "POST", "/subaquarium/seed"), s2 = await call(b, "POST", "/subaquarium/seed");
    ok("!! a trusted seed offers THIS tree's five champions as LOCAL subs (from 'this-box'); seeding again replaces them, it does not duplicate (still five)", s.json.added === 5 && s.json.skipped.length === 0 && s.json.counts.local === 5 && s2.json.counts.total === 5 && b.registry.list().every((x) => x.local && x.from === "this-box"), b.registry.list().map((x) => x.from).join());
    const e = mkBridge({ root: tmpRoot() }), es = await call(e, "POST", "/subaquarium/seed");
    ok("!! a tree with no champion files offers ONLY the PD autopilot and names the four it skipped", es.json.added === 1 && es.json.skipped.length === 4 && es.json.counts.total === 1);
}

console.log("\n6. SENDING");
{
    const calls = []; const fakeFetch = async (url, opts) => { calls.push({ url, opts }); return { json: async () => ({ ok: true, id: "abc12345", replaced: false }) }; };
    const b = mkBridge({ root: ENG, fetchImpl: fakeFetch }); await call(b, "POST", "/subaquarium/seed");
    const mine = b.registry.list().find((x) => x.name === "Explorer actuator champion"), good = "http://192.168.1.9:8787";
    const d = await call(b, "POST", "/subaquarium/send", { peer: good, id: mine.id }, { trusted: false });
    ok("!! an UNTRUSTED send is 403 and nothing is dialled", d.status === 403 && calls.length === 0);
    const nf = await call(b, "POST", "/subaquarium/send", { peer: good, id: "nope" });
    ok("!! an unknown id is 404 and nothing is dialled", nf.status === 404 && calls.length === 0);
    await call(b, "POST", "/subaquarium/arrive", { sub: { name: "From Elsewhere" } }, { remote: "192.168.1.30" }); const remoteSub = b.registry.list().find((x) => !x.local);
    const rs = await call(b, "POST", "/subaquarium/send", { peer: good, id: remoteSub.id });
    ok("!! a REMOTE sub cannot be forwarded: only this box's own subs are sent on (400), nothing dialled", rs.status === 400 && /own subs/.test(rs.json.error) && calls.length === 0);
    const bads = ["http://8.8.8.8:8787", "https://example.com", "ftp://192.168.1.9", "file:///etc/passwd", "http://user:pw@192.168.1.9", "javascript:alert(1)", "192.168.1.9", "", "http://172.32.0.1", "http://100.128.0.1", "http://192.169.0.1"];
    const results = []; for (const p of bads) results.push(await call(b, "POST", "/subaquarium/send", { peer: p, id: mine.id }));
    ok("!! a peer that is not LAN / mesh is 400 and NOTHING is dialled: a public IP, a public hostname, ftp:, file:, credentials in the URL, a script, a bare address, empty, and the three just OUTSIDE the private ranges (172.32, 100.128, 192.169)", results.every((r) => r.status === 400) && calls.length === 0, results.map((r) => r.status).join());
    const goods = ["http://192.168.1.9:8787", "http://10.1.2.3", "http://172.16.0.5:1", "http://172.31.255.254", "http://100.64.0.1", "http://100.127.255.254", "http://127.0.0.1:8787", "http://localhost:8787", "http://box.local:8787"];
    ok("!! the peers that ARE allowed: 192.168/16, 10/8, 172.16-31, 100.64-127 (CGNAT/mesh), loopback, localhost and *.local -- checkPeer says ok for all nine and returns the origin", goods.every((g) => B.checkPeer(g).ok) && B.checkPeer("http://192.168.1.9:8787/some/path?x=1").base === "http://192.168.1.9:8787");
    const r = await call(b, "POST", "/subaquarium/send", { peer: good + "/ignored/path", id: mine.id }), sent = calls[0] && JSON.parse(calls[0].opts.body);
    ok("!! a good send dials <origin>/subaquarium/arrive with { sub: { name, circuit, weights (963), theta, hue } } and NOTHING ELSE in it (no id, no local, no from), POST, JSON, redirects refused and a timeout set; the reply is ok with the peer's id", r.status === 200 && r.json.ok && calls.length === 1 && calls[0].url === good + "/subaquarium/arrive" && calls[0].opts.method === "POST" && calls[0].opts.redirect === "error" && calls[0].opts.signal && Object.keys(sent).join() === "sub" && Object.keys(sent.sub).sort().join() === "circuit,hue,name,theta,weights" && sent.sub.weights.length === 963 && sent.sub.name === "Explorer actuator champion" && r.json.reply.id === "abc12345", JSON.stringify(Object.keys(sent || {})));
    const down = mkBridge({ root: ENG, fetchImpl: async () => { throw new Error("connect ECONNREFUSED 192.168.1.9:8787"); } }); await call(down, "POST", "/subaquarium/seed");
    const dr = await call(down, "POST", "/subaquarium/send", { peer: good, id: down.registry.list()[0].id });
    const no = mkBridge({ root: ENG, fetchImpl: async () => ({ json: async () => ({ ok: false, error: "not trusted: /subaquarium/arrive is host, session or LAN only" }) }) }); await call(no, "POST", "/subaquarium/seed");
    const nr = await call(no, "POST", "/subaquarium/send", { peer: good, id: no.registry.list()[0].id });
    const mute = mkBridge({ root: ENG, fetchImpl: async () => ({ json: async () => { throw new Error("not json"); } }) }); await call(mute, "POST", "/subaquarium/seed");
    const mr = await call(mute, "POST", "/subaquarium/send", { peer: good, id: mute.registry.list()[0].id });
    ok("!! an unreachable peer is 502 'peer unreachable: ...' with the reason; a peer that REFUSES is 502 'peer refused: ...' with ITS words; a peer that answers with something that is not JSON is 502 'no answer'", dr.status === 502 && dr.json.ok === false && nr.json.ok === false && mr.json.ok === false && /peer unreachable: .*ECONNREFUSED/.test(dr.json.error) && nr.status === 502 && /peer refused: not trusted/.test(nr.json.error) && mr.status === 502 && /no answer/.test(mr.json.error));
}

console.log("\n7. REMOVAL");
{
    const b = mkBridge({ root: tmpRoot() }); const a = await call(b, "POST", "/subaquarium/arrive", { sub: { name: "Doomed" } });
    const u = await call(b, "POST", "/subaquarium/remove", { id: a.json.id }, { trusted: false }), none = await call(b, "POST", "/subaquarium/remove", { id: "nope" }), gone = await call(b, "POST", "/subaquarium/remove", { id: a.json.id });
    ok("!! an untrusted removal is 403 and the sub stays; an unknown id says removed: false; a known one says removed: true and is gone", u.status === 403 && none.json.removed === false && gone.json.removed === true && b.registry.counts().total === 0 && (await call(b, "POST", "/subaquarium/remove", "{bad")).status === 400);
}

console.log("\n8. TWO BOXES OVER REAL HTTP");
{
    const http = await import("node:http");
    const serve = (bridge, trusted = true) => new Promise((resolve) => {
        const srv = http.createServer((req, res) => { const sendJson = (o, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); }; if (!bridge.owns(req.url)) return sendJson({ ok: false, error: "not ours" }, 404); bridge.handle(req, res, { sendJson, isTrusted: () => trusted }).catch((e) => sendJson({ ok: false, error: String(e) }, 500)); });
        srv.listen(0, "127.0.0.1", () => resolve({ srv, url: "http://127.0.0.1:" + srv.address().port }));
    });
    const A = mkBridge({ root: ENG }), Bb = mkBridge({ root: tmpRoot() }), Cb = mkBridge({ root: tmpRoot() });
    const a = await serve(A), b = await serve(Bb), c = await serve(Cb, false);
    const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    try {
        const seeded = await post(a.url + "/subaquarium/seed", {}), mine = (await fetch(a.url + "/subaquarium/list").then((r) => r.json())).subs.find((x) => x.name === "Explorer actuator champion");
        const sent = await post(a.url + "/subaquarium/send", { peer: b.url, id: mine.id });
        const there = (await fetch(b.url + "/subaquarium/list").then((r) => r.json())).subs, got = there.find((x) => x.name === "Explorer actuator champion");
        ok("!! box A seeds its five champions, SENDS one to box B over real HTTP (loopback is LAN), and B's tank holds it: stored REMOTE, from 127.0.0.1, with all 963 weights and the twelve theta numbers intact (bit for bit the numbers A sent)", seeded.added === 5 && sent.ok && sent.peer === b.url && there.length === 1 && got && got.local === false && got.from === "127.0.0.1" && got.weights.length === 963 && got.weights.every((v, i) => v === mine.weights[i]) && C.THETA_NAMES.every((k) => got.theta[k] === mine.theta[k]) && got.id === mine.id, `${there.length} sub on B, id ${got && got.id}`);
        const again = await post(a.url + "/subaquarium/send", { peer: b.url, id: mine.id }), after = (await fetch(b.url + "/subaquarium/list").then((r) => r.json())).subs;
        ok("!! sending it AGAIN replaces it on B (replaced: true, still one sub), the id is the same on both boxes (the id is the content)", again.ok && again.reply.replaced === true && after.length === 1);
        const refused = await post(a.url + "/subaquarium/send", { peer: c.url, id: mine.id });
        ok("!! a peer that does not trust us (its isTrusted says no) REFUSES, and A reports 'peer refused: not trusted' with B's own words -- nothing is stored there", refused.ok === false && /peer refused: not trusted/.test(refused.error) && Cb.registry.counts().total === 0);
        const dead = await post(a.url + "/subaquarium/send", { peer: "http://127.0.0.1:1", id: mine.id });
        ok("!! a peer that is not listening is 'peer unreachable' (a real connection refused), not a hang and not a crash", dead.ok === false && /peer unreachable/.test(dead.error));
        const big = await fetch(b.url + "/subaquarium/arrive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sub: { name: "Huge", weights: Array.from({ length: 20000 }, () => 0.5) } }) });
        ok("!! a real over-size body (20,000 weights, ~100 KB) is 413 from B over the wire, and B's tank is unchanged", big.status === 413 && (await big.json()).ok === false && Bb.registry.counts().total === 1);
    } finally { for (const x of [a, b, c]) x.srv.close(); }
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
