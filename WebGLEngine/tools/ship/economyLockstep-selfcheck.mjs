#!/usr/bin/env node
// WebGLEngine/tools/ship/economyLockstep-selfcheck.mjs -- v4314 (Level 16)
//
// GRADES TWO BROWSERS, ONE UNIVERSE: two economies from one seed behind the physics' own lockstep net (physics/
// box3dLockstepNet.js), exchanging interventions as inputs sent ahead and a hash per tick, over a memory wire
// that is delayed, reordered, duplicated and lossy -- and they trade identically, tick for tick, or the sim
// stalls rather than forks. The control is a peer that cheats (an intervention applied outside the wire): the
// desync is caught at that tick, on both sides, by name. Then two TABS of orrery-gpu.html over a BroadcastChannel.
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
import { economySession, makePeer, memoryWire, runPair } from "../../world/economyLockstep.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const raw = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
const system = buildOrrery(raw.bodies, { today: "2026-09-01" });
const mk = () => makeGitEconomy(system, { seed: 7, history: true });
const IV = [{ atTick: 20, peer: "a", kind: "gift", args: { ship: 0, credits: 900 } }, { atTick: 45, peer: "b", kind: "commits", args: { market: "three", commits: 4 } },
            { atTick: 90, peer: "b", kind: "stock", args: { market: "krbn", good: "docs", tons: 25 } }, { atTick: 140, peer: "a", kind: "credits", args: { market: 3, credits: 4000 } }];

console.log("\n1. THE SESSION: the economy behind the physics' lockstep contract");
{
    const e = mk(), s = economySession(e, { peers: ["b", "a"] });
    ok("peers are sorted so both sides apply inputs in the same order", s.peers.join() === "a,b");
    ok("not ready until every peer has spoken for the tick", s.submitInputs("a", 0, []) && !s.ready(0) && s.submitInputs("b", 0, [{ kind: "gift", args: { ship: 1, credits: 10 } }]) && s.ready(0));
    const r = s.tryStep(0.25);
    ok("tryStep applies every peer's inputs at that tick, steps, and returns the tick and hash", r && r.tick === 1 && r.hash === e.hash() && e.log().interventions.length === 1 && e.log().interventions[0].tick === 0, JSON.stringify(r));
    ok("  a late input for a stepped tick is ignored (redundancy noise), a duplicate says the same thing", s.submitInputs("a", 0, [{ kind: "gift", args: { ship: 0, credits: 1 } }]) === false && s.submitInputs("a", 1, []) && s.submitInputs("a", 1, [{ kind: "gift", args: {} }]) && !s.ready(1));
    ok("  a peer's hash for our tick is checked against ours; a wrong one is the first desync", s.checkPeerHash("b", 1, r.hash) === true && s.desync() === null && s.checkPeerHash("b", 1, "deadbeef") === false && s.desync().tick === 1 && s.desync().peer === "b");
    ok("REFUSED: inputs from someone who is not a peer", throwsWith(() => s.submitInputs("c", 2, []), /not a peer/));
    ok("REFUSED: a session that does not know its peers", throwsWith(() => economySession(mk(), {}), /needs the peer ids/));
}

console.log("\n2. TWO PEERS OVER A WIRE: clean, then hostile; the same hash at every tick, or a stall, never a fork");
{
    const clean = runPair({ makeEconomy: mk, ticks: 200, interventions: IV });
    ok("clean wire: both peers reach the ticks, every shared tick's hash agrees, four interventions applied on both", clean.agree && clean.upTo >= 200 && !clean.stalled && clean.a.applied.length === 4 && clean.b.applied.length === 4 && clean.desyncA === null && clean.desyncB === null, `${clean.upTo} ticks, ${clean.pumps} pumps`);
    ok("  and the interventions were applied at the SAME ticks on both sides, in the same order", JSON.stringify(clean.a.applied) === JSON.stringify(clean.b.applied), clean.a.applied.map((x) => `${x.peer}:${x.kind}@${x.tick}`).join(" "));
    const hostile = runPair({ makeEconomy: mk, hostile: { delay: 2, reorder: true, duplicate: true, drop: 0.1 }, ticks: 300, interventions: IV, seed: 3 });
    ok("*** hostile wire (2-pump delay, reorder, duplicates, 10% loss): still the same hash at every shared tick, no desync, both at 300 ***", hostile.agree && hostile.upTo >= 300 && !hostile.stalled && hostile.desyncA === null && hostile.desyncB === null && hostile.a.hash() === hostile.b.hash(), `dropped ${hostile.stats.dropped}, duplicated ${hostile.stats.duplicated}, reordered ${hostile.stats.reordered} of ${hostile.stats.sent} sent`);
    ok("  the wire was hostile (each abuse happened), and the redundancy carried the lost inputs", hostile.stats.dropped > 10 && hostile.stats.duplicated > 100 && hostile.stats.reordered > 10 && hostile.a.applied.length === 4 && hostile.b.applied.length === 4);
    ok("  the hostile pair's interventions landed a few ticks after they were queued (the net's lead), never before", hostile.a.applied.every((x) => x.tick >= IV.find((iv) => iv.kind === x.kind).atTick && x.tick <= IV.find((iv) => iv.kind === x.kind).atTick + 12), hostile.a.applied.map((x) => `${x.kind}@${x.tick}`).join(" "));
    const lossy = runPair({ makeEconomy: mk, hostile: { drop: 0.6 }, ticks: 120, seed: 4 });
    ok("CONTROL: 60% loss beats the redundancy -- the pair STALLS (agrees on every tick it reached, reaches fewer than asked)", lossy.agree && lossy.stalled && lossy.upTo < 120 && Math.abs(lossy.a.tick - lossy.b.tick) <= 4, `stalled at ${lossy.upTo} of 120, ${lossy.stats.dropped} dropped`);
    // the cheat: peer b applies an intervention DIRECTLY to its economy, outside the wire
    const wire = memoryWire({}, 9);
    const A = makePeer({ economy: mk(), selfId: "a", peers: ["a", "b"], send: (m) => wire.a.send(m) }), B = makePeer({ economy: mk(), selfId: "b", peers: ["a", "b"], send: (m) => wire.b.send(m) });
    wire.a.onMessage = (m) => A.receive(m); wire.b.onMessage = (m) => B.receive(m);
    let cheatTick = null;
    for (let p = 0; p < 200; p++) { if (p === 60) { cheatTick = B.tick; B.session.economy.intervene("gift", { ship: 2, credits: 50 }); } A.pump(); B.pump(); wire.deliver(); }
    const dA = A.desync(), dB = B.desync();
    ok("CONTROL: a peer that intervenes outside the wire is caught -- both sides record a desync at the cheat's tick, naming the other", dA && dB && dA.tick === cheatTick + 1 && dB.tick === cheatTick + 1 && dA.peer === "b" && dB.peer === "a" && dA.ours !== dA.theirs, `desync at tick ${dA && dA.tick} (cheated at ${cheatTick}); a: ${dA && dA.ours} vs ${dA && dA.theirs}`);
}

console.log("\n3. TWO TABS, ONE UNIVERSE: orrery-gpu.html as peer a and peer b over a BroadcastChannel");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const pw = resolvePlaywright(createRequire(import.meta.url));
    const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json" };
    const srv = http.createServer((q, s2) => { const u = decodeURIComponent(String(q.url).split("?")[0]); const f = path.join(ENG, u === "/" ? "orrery-gpu.html" : u);
        if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s2.writeHead(404); return s2.end("no"); }
        s2.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); s2.end(fs.readFileSync(f)); });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${srv.address().port}`;
    const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const ctx = await br.newContext({ viewport: { width: 640, height: 480 } });
    const A = await ctx.newPage(), B = await ctx.newPage(); const errs = []; for (const p of [A, B]) p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await A.goto(origin + "/orrery-gpu.html?peer=a", { waitUntil: "load" });
    const alone = await A.evaluate(async () => { await new Promise((r) => setTimeout(r, 1500)); return { tick: window.__universe.tick, peer: document.getElementById("peer").textContent }; });
    ok("a peer alone does not move: no inputs from the other tab, no step", alone.tick === 0, `tick ${alone.tick} after 1.5 s alone; ${alone.peer}`);
    await B.goto(origin + "/orrery-gpu.html?peer=b", { waitUntil: "load" }); await B.waitForTimeout(4000);
    await A.click("#commits"); await A.waitForTimeout(2500);
    const sa = await A.evaluate(() => ({ tick: window.__universe.tick, hash: window.__universe.hash(), peer: document.getElementById("peer").textContent, inStep: window.__universe.inStep, iv: window.__universe.log().interventions.length }));
    const sb = await B.evaluate(() => ({ tick: window.__universe.tick, hash: window.__universe.hash(), peer: document.getElementById("peer").textContent, inStep: window.__universe.inStep, iv: window.__universe.log().interventions.length }));
    ok("*** with the second tab open both universes move, in step, and neither has seen a desync ***", sa.tick > 20 && sb.tick > 20 && sa.inStep === true && sb.inStep === true && /in step/.test(sa.peer) && /in step/.test(sb.peer), `a: tick ${sa.tick} ${sa.peer}; b: tick ${sb.tick} ${sb.peer}`);
    const near = Math.abs(sa.tick - sb.tick) <= 8;
    ok("  the two tabs are within a few ticks of each other (the wire's lead), and a's commits reached b's journal", near && sa.iv > 5 && sb.iv === sa.iv, `a ${sa.iv} / b ${sb.iv} interventions`);
    ok("  the page threw nothing on either tab", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
    await br.close(); srv.close();
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at Level 16.
//   A  tryStep() applying the first peer's inputs only (the other side's interventions dropped) -> exit=1, 3 red:
//      section 1's tryStep line (b's gift never journaled), the clean pair (three interventions applied, not four,
//      and its hashes part), and the hostile pair's applied lists.
//   B  the hash without the ships' cargo -> exit=0 HERE: the cheat is a gift, which moves credits, so it is still
//      caught. The blindness is caught by universeJournal-selfcheck's coverage probe ("a ship's cargo: BLIND",
//      1 red there). Recorded rather than hidden: this gate's cheat control is one cheat, not every cheat.
//   C  redundancy 0 on the net -> exit=1, 4 red: the hostile wire's 10% loss stalls the pair at once (20 messages
//      sent, 5 dropped, no tick past the first loss) where the redundant resends had carried it to 300; and the
//      two tabs never move together (a at tick 4, b at 0, no interventions through).
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a real WebRTC transport between two machines (ev/p2p.js is the plug; the rig has the browsers and this " +
    "sandbox has one); two DIFFERENT browsers, whose Math.sin may differ in the last bit -- the hash is over integers on purpose, " +
    "and that is a claim about the hash, not a measurement across engines; and more than two peers, which the session allows and " +
    "no page here opens.");
process.exit(fails ? 1 : 0);
