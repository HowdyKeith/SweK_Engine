#!/usr/bin/env node
// WebGLEngine/tools/ship/universeWire-selfcheck.mjs -- v4460 (was v4316)
//
// GRADES WHAT THE SANDBOX CAN OF TWO REMAINDERS. A real WebRTC wire between two machines: the page's params pick
// the wire (two tabs on a BroadcastChannel, or two machines through ev/p2p.js's transport and the ai-bridge
// rendezvous), the mapping is driven here with a MOCK transport, and the real one is RIG-PENDING by name -- this
// sandbox has one browser and no second machine. Two different browsers' hashes: the key (a fresh economy to tick
// 400 from seed 7) is computed here in Node and WRITTEN to tools/ship/universe-hash-expected.json; the page
// computes its own and prints AGREES or DIFFERS beside it. Here the page runs on Chromium, which is V8, which is
// Node -- so AGREES here is a claim about the plumbing, and the cross-engine answer is a person on Firefox or
// Safari reading the same line. Said so, on the HUD and here.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { webgpuSkipReason } from "./webgpuHarness.mjs";
import { buildOrrery } from "../../world/orrery.mjs";
import { makeGitEconomy } from "../../world/gitEconomy.mjs";
import { wireFromParams, hashKey, compareKey, KEY_DRIFT_V4460 } from "../../world/universeWire.mjs";
import { shouldInitiate, diffRoster } from "../../ev/p2p.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const raw = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
const system = buildOrrery(raw.bodies, { today: "2026-09-01" });
const KEY_FILE = path.join(ENG, "tools/ship/universe-hash-expected.json");
// v4460: the key is COMPARED by default and written only when asked. See KEY_DRIFT_V4460.
const WRITE = process.argv.includes("--write");

console.log("\n1. THE WIRE FROM THE PARAMS: two tabs, two machines, or none -- with the transports mocked");
{
    const made = [];
    const broadcast = (room) => { const w = { send: (m) => made.push(["bc", room, m]), onMessage: null }; return w; };
    const p2p = (base, room, id, opts) => { made.push(["p2p", base, room, id]); let cb = null; return { kind: "p2p", send: (m) => made.push(["p2p-send", m]), onMessage: (f) => { cb = f; }, connections: () => 1, close: () => made.push(["p2p-close"]), _deliver: (m) => cb && cb(m) }; };
    const none = wireFromParams(new URLSearchParams(""), { broadcast, p2p });
    ok("no peer named: no wire, and it says why", none.kind === "none" && none.wire === null && /no peer named/.test(none.why));
    ok("  a peer that is not a or b is refused by name", /peer must be a or b/.test(wireFromParams(new URLSearchParams("peer=c"), { broadcast, p2p }).why));
    const bc = wireFromParams(new URLSearchParams("peer=a"), { broadcast, p2p });
    bc.wire.send({ t: "x" });
    ok("peer=a alone is the BroadcastChannel wire on the default room, and its send goes to the channel", bc.kind === "broadcast" && bc.peer === "a" && bc.room === "swek-universe" && made.some((m) => m[0] === "bc" && m[1] === "swek-universe" && m[2].t === "x"));
    const rt = wireFromParams(new URLSearchParams("peer=b&webrtc=http://192.168.1.20:3131/&room=orrery"), { broadcast, p2p });
    ok("peer=b&webrtc=<rendezvous>&room=<room> is the WebRTC wire: ev/p2p.js's transport made with the rendezvous (trailing slash dropped), the room and the peer id", rt.kind === "webrtc" && rt.rendezvous === "http://192.168.1.20:3131/" && made.some((m) => m[0] === "p2p" && m[1] === "http://192.168.1.20:3131" && m[2] === "orrery" && m[3] === "b"));
    let got = null; rt.wire.onMessage = (m) => { got = m; }; rt.wire.send({ t: "lsi", tick: 3 });
    // the transport's callback registration is turned into the wire's onMessage property, so the peer's receive hooks on the same way for both kinds
    ok("  the wire's shape is the peer's shape for both kinds: send(msg) and an onMessage property; the transport's callback registration is adapted", typeof rt.wire.send === "function" && "onMessage" in rt.wire && made.some((m) => m[0] === "p2p-send" && m[1].t === "lsi") && rt.wire.connections() === 1);
    ok("REFUSED: a webrtc wire with no transport handed over (the real one is browser-only)", throwsWith(() => wireFromParams(new URLSearchParams("peer=a&webrtc=http://x"), { broadcast }), /no p2p transport/));
    ok("REFUSED: a broadcast wire with no channel factory", throwsWith(() => wireFromParams(new URLSearchParams("peer=a"), { p2p }), /no BroadcastChannel factory/));
    // the pure halves of ev/p2p.js that decide who dials whom: two peers never both initiate, and the roster diff names joins and leaves
    const dr = diffRoster(["a", "b", "c"], ["b", "d"], "a");
    ok("ev/p2p.js's pure halves: of a and b exactly one initiates, and a roster diff names who to add (c) and who to drop (d), never ourselves", shouldInitiate("a", "b") !== shouldInitiate("b", "a") && dr.add.join() === "c" && dr.remove.join() === "d");
    report("RIG-PENDING: the real WebRTC wire -- two machines, orrery-gpu.html?peer=a&webrtc=<ai-bridge>&room=universe on one and peer=b on the other -- needs two browsers and the rendezvous; this sandbox has one browser and no rendezvous. The mapping above is what it can grade.");
}

console.log("\n2. THE KEY: Node's hash at tick 400 from seed 7, COMPARED against the committed file (--write to re-bake)");
let key = null;
{
    const mk = (seed, today) => makeGitEconomy(buildOrrery(raw.bodies, { today }), { seed, history: true });
    key = hashKey(mk, { seed: 7, ticks: 400 });
    const again = hashKey(mk, { seed: 7, ticks: 400 });
    ok("the key is deterministic in this engine and a different seed gives a different key", key.hash === again.hash && key.tick === 400 && hashKey(mk, { seed: 8, ticks: 400 }).hash !== key.hash, `${key.hash}`);
    ok("  the key names the sky's day: the same seed under another day's sky is a different hash, and compareKey calls that a different question", hashKey(mk, { seed: 7, ticks: 400, today: "2026-09-20" }).hash !== key.hash && compareKey(hashKey(mk, { seed: 7, ticks: 400, today: "2026-09-20" }), key).verdict === "DIFFERENT QUESTION");
    // *** v4460 -- THIS BLOCK USED TO WRITE THE FILE AND THEN ASSERT AGAINST WHAT IT HAD JUST WRITTEN. ***
    // The row could not fail on a hash change; it re-baked the key and reported green. The committed key was
    // wrong for 42 shipped versions and this gate said ALL GREEN through every one of them, which is why it
    // sits in no red register. v3698's rule, the one claimCheck states about itself: A LOOP THAT BOTH WRITES
    // THE RECORD AND GRADES IT CAN MARK ITS OWN WORK PASSED. Writing is an explicit act now.
    const before = fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, "utf8") : null;
    const onDisk = before ? JSON.parse(before) : null;
    const verdict = compareKey(key, onDisk);
    if (WRITE) {
        fs.writeFileSync(KEY_FILE, JSON.stringify({ ...key, engine: "node " + process.version + " (V8)", written: new Date().toISOString(), note: "the state hash of a fresh git economy (history on) after 400 quarter-day ticks from seed 7; another browser that prints the same string has run the same integers" }, null, 1));
        report(`--write: key re-baked to ${key.hash} (was ${onDisk ? onDisk.hash : "absent"}). A re-bake is a deliberate act with a reason owed beside it -- see KEY_DRIFT_V4460.`);
    }
    // *** --write DOES NOT MEAN "PASS ANYWAY". *** A re-bake is allowed and a SILENT one is not: in write mode
    // this row passes only if KEY_DRIFT_V4460 already names the hash being baked, so the record that explains
    // a move cannot be skipped by the act that makes the move. In compare mode it is the plain comparison.
    ok(WRITE ? "!! *** --write: THE RE-BAKE IS ACCOUNTED FOR IN THE DRIFT RECORD ***"
             : "!! *** THE COMMITTED KEY IS THE ONE THIS RUN COMPUTES -- COMPARED, NOT OVERWRITTEN ***",
       WRITE ? KEY_DRIFT_V4460.current === key.hash : verdict.verdict === "AGREES",
       WRITE ? `baked ${key.hash}, record says ${KEY_DRIFT_V4460.current}` +
               (onDisk && onDisk.hash !== key.hash ? `, was ${onDisk.hash}` : "") +
               ". A re-bake with no entry for it in the record fails HERE, so the reason is owed at the moment " +
               "the number moves rather than whenever somebody notices."
             : `${verdict.verdict}: ${verdict.detail}. Until v4460 this row WROTE the file first and then ` +
               "checked it, so it could not fail; the key drifted twice at v4414 and v4416 and forty-two " +
               "versions shipped past it.");
    // *** ASSERTED BY MECHANISM, NOT BY PROMISE. *** The bytes are re-read after the comparison, so a write
    // path that comes back -- or one hiding in something this block calls -- fails here rather than being
    // trusted not to exist.
    ok("!! ...and without --write this gate did not touch the file it grades",
       WRITE || (fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, "utf8") : null) === before,
       WRITE ? "SKIPPED: --write was passed, so the file was rewritten on purpose" :
       `${before ? before.length : 0} bytes before and after. THE ROW ABOVE IS ONLY WORTH ANYTHING IF THIS ONE ` +
       "HOLDS -- a comparison against a file the comparer may have written is not a comparison.");
    // *** EVERY MOVE OWES A FIELD, A CAUSE AND A CONTROL. *** The first version of this record blamed byte
    // counts, read off a diff hunk, and was wrong twice: `bytes` sets a body's RADIUS and the economy never
    // reads it -- 964 bytes added to each of the fifteen bodies in turn moved the hash not at all. So a move
    // must name the FIELD it changed and carry a control that reproduces it on today's tree, which is the
    // thing a diff read cannot supply.
    ok("!! the drift record names the FIELD behind every move, with a control that reproduces it",
       KEY_DRIFT_V4460.current === key.hash &&
       KEY_DRIFT_V4460.moves.length > 0 &&
       KEY_DRIFT_V4460.moves[KEY_DRIFT_V4460.moves.length - 1].hash === key.hash &&
       KEY_DRIFT_V4460.moves.every((m) => m.file && m.field && m.cause && m.control && m.bodiesTouched > 0) &&
       KEY_DRIFT_V4460.bytesDoNotReachTheEconomy.movedTheHash === 0 &&
       KEY_DRIFT_V4460.bytesDoNotReachTheEconomy.bodiesTried > 0,
       `${KEY_DRIFT_V4460.lastCommittedCorrect.hash} at ${KEY_DRIFT_V4460.lastCommittedCorrect.version} -> ` +
       KEY_DRIFT_V4460.moves.map((m) => `${m.hash} at ${m.version} (${m.field}, ${m.bodiesTouched} bodies)`).join(" -> ") +
       ". v4414 rewrote every ARRIVAL DATE, so every ORBIT moved. v4416 added PROVENANCE.txt ATTRIBUTION " +
       "FILES to six dependencies, and stockOfFiles turns every file into cargo at max(1, bytes/4096) -- all " +
       "six are under 1 KB, so each rounds to zero and is lifted to a ton. *** SIX TONS OF docs APPEARED " +
       "BECAUSE SOMEBODY WROTE DOWN WHO OWNS THE CODE. *** And `bytes` reaches none of it: " +
       `${KEY_DRIFT_V4460.bytesDoNotReachTheEconomy.bodiesTried} bodies tried, ` +
       `${KEY_DRIFT_V4460.bytesDoNotReachTheEconomy.movedTheHash} moved the hash.`);
    ok("compareKey: the same key AGREES, a different hash DIFFERS and says which engine, a different question is refused as such", compareKey(key, { ...key, engine: "x" }).verdict === "AGREES" && compareKey({ ...key, hash: "00000000" }, { ...key, engine: "x" }).verdict === "DIFFERS" && compareKey({ ...key, ticks: 10 }, key).verdict === "DIFFERENT QUESTION" && compareKey(key, null).verdict === "NO KEY");
}

console.log("\n3. THE PAGE ON THIS BROWSER: prints its own key beside Node's and reads AGREES -- V8 against V8, said so");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const pw = resolvePlaywright(createRequire(import.meta.url));
    const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json" };
    const srv = http.createServer((q, s2) => { const u = decodeURIComponent(String(q.url).split("?")[0]); const f = path.join(ENG, u === "/" ? "orrery-gpu.html" : u);
        if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s2.writeHead(404); return s2.end("no"); }
        s2.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); s2.end(fs.readFileSync(f)); });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const pg = await br.newPage({ viewport: { width: 640, height: 480 } }); const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await pg.goto(`http://127.0.0.1:${srv.address().port}/orrery-gpu.html`, { waitUntil: "load" }); await pg.waitForTimeout(3500);
    const st = await pg.evaluate(() => ({ line: document.getElementById("key").textContent, k: window.__universeKey || null, ua: navigator.userAgent }));
    ok("the page computed its key and compared it with the file", st.k && st.k.mine && st.k.expected, st.line);
    ok("*** on this browser the page's key is Node's: AGREES ***", st.k && st.k.verdict === "AGREES" && st.k.mine.hash === key.hash, `${st.k && st.k.mine.hash} on ${/Chrome\/[\d.]+/.exec(st.ua)?.[0] || st.ua.slice(0, 40)} -- the same V8 as Node, which is why this is plumbing and not the cross-engine answer`);
    ok("  the page threw nothing", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
    await br.close(); srv.close();
    report("RIG-PENDING: open orrery-gpu.html on Firefox and Safari and read the cross-browser key line; DIFFERS names an integer that moved on that engine.");
}

// ---- *** v4460 SABOTAGES, RESULTS BY NAME *** ---------------------------------------------------------------
//
//   AF.  a PROVENANCE.txt file entry, as v4416 actually added   -> 4 RED
//   AF2. only the byte count grows, as my first story claimed   -> *** 0 RED, AND THAT IS THE ANSWER ***
//   AF3. one body's arrival date moves, as v4414 actually did   -> 4 RED
//   AG.  the gate writes the key again in default mode          -> 2 RED
//   AH.  the committed key is edited by one character           -> 3 RED
//   AI.  the drift record forgets its most recent move          -> 2 RED
//   AJ.  a move loses the control that reproduces it            -> 2 RED
//   AK.  compareKey answers AGREES whenever the seeds match     -> 2 RED
//   AL.  the negative control claims bytes DID move the hash    -> 2 RED
//
// *** AF WENT 0 RED IN ITS FIRST FORM AND THAT IS HOW THIS ROUND'S STORY GOT CORRECTED. *** I had written
// that the key moved because vendored dependencies changed SIZE -- radiusFor is literally the cube root of a
// body's byte count, so it reads true. The sabotage that reproduced the historical change did nothing, and
// measuring it properly showed why: 964 bytes added to each of the FIFTEEN bodies in turn moves the hash NOT
// AT ALL. `bytes` sets a body's drawn radius and the economy integrates none of it. THE PLANT THAT "FAILED"
// WAS THE ONE TELLING ME THE EXPLANATION WAS WRONG, and AF2 is kept as a permanent negative control: it must
// stay 0 RED, and the record asserts that same negative in a number.
//
// The real causes, bisected field by field: v4414 rewrote every body's ARRIVAL DATE, and a body's orbit is
// set by its age, so the whole sky moved. v4416 added PROVENANCE.txt ATTRIBUTION FILES to six dependencies,
// and stockOfFiles turns every file into cargo at max(1, round(bytes / 4096)) -- all six are under 1 KB, so
// each rounds to ZERO and is lifted to a full ton. Six tons of `docs` appeared because somebody wrote down
// who owns the code.
//
// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4316.
//   A  wireFromParams() never taking the webrtc branch -> exit=1, 3 red: the rendezvous mapping (no transport made),
//      the wire's shape, and the "no transport handed over" refusal (a broadcast wire came back instead).
//   B  hashKey() stepping ticks - 1 -> exit=1, 1 red: the key's tick reads 399. The page's key, built by the same
//      code, still AGREED with the file the same sabotaged code wrote -- which is why the key carries its tick and
//      its day as fields and compareKey refuses a different question, and why the file another engine checks against
//      is the one committed, not the one a page computes.
//   C  compareKey() answering AGREES whenever the seeds match -> exit=1, 1 red: the DIFFERS control.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THE TWO THINGS THIS GATE IS NAMED FOR. A WebRTC wire between two machines needs two machines; two " +
    "different browsers' hashes need a second engine. Both are one page load on the rig away, and both print their verdict on the HUD.");
process.exit(fails ? 1 : 0);
