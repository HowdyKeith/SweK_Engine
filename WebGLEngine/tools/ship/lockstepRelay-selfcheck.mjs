#!/usr/bin/env node
// WebGLEngine/tools/ship/lockstepRelay-selfcheck.mjs -- v4822
//
// Run: node tools/ship/lockstepRelay-selfcheck.mjs
//
// THE RACE LOCKSTEP ACROSS REAL PROCESSES AND A REAL SOCKET. brain/raceLockstep-selfcheck.mjs holds the session in one process over a mock wire; this gate puts
// a TCP socket and an OS process boundary between the peers, which is what a run between two machines has and a mock does not: separate address spaces,
// separate wasm instances started cold, real latency and real message coalescing, a relay that is a third party. It is the nearest this sandbox gets to two
// machines; tools/ship/lockstepPeer.mjs is what the real pair runs.
//
// Section 1, THE RELAY AND ITS WEBSOCKET (tools/ship/miniWs.mjs, tools/ship/lockstepRelay.mjs): frames of every length class round-trip intact and in order to
// the OTHER peer and never back to the sender, the room announces ready when it fills and left when a peer goes, a second peer with the same id and a bad path
// are refused. Section 2, TWO NODE PROCESSES (the CLI, as a pair of machines would run it) race twelve seconds through the relay and both exit 0 with one
// final fingerprint. Section 3, A BROWSER AND A NODE PROCESS: a headless Chromium peer (a different JavaScript engine host, the same wasm) against a node
// peer through the same relay: the same fingerprint again. Section 4, A DIVERGENCE OVER THE WIRE: one process steps different commands at tick 100; both
// exit 1, and the desync each reports is AT tick 100. Section 5, THE ENGINE IS PART OF THE PROTOCOL: a peer announcing another engine halts the pair, both exit 1.
//
// SABOTAGE LOG -- v4822, each applied to the file named, the gate run, the file restored.
//   A  tools/ship/miniWs.mjs: the one-byte length class ending at 127 instead of 125 (a 126-byte frame sent with the 126 marker and no length)   -> 4 red: the frame-class
//      row (3 of 9 messages arrive), the other direction, the leave announcement and the duplicate id, all behind a stream that never recovers.
//   B  tools/ship/lockstepRelay.mjs: a message delivered to the sender too                                         -> 1 red: "never come back to the sender".
//   C  tools/ship/lockstepRelay.mjs: ready announced at the FIRST join (the barrier removed)                        -> 3 red: the ready row (peers ["A"]), and the pair that starts 1.5 s apart
//      (A's first inputs went to an empty room; the pair times out at tick 5 / tick 0) and its replay row. Measured by hand first with 8 s timeouts.
//   E  brain/raceLockstepPeer.mjs: no final message sent                                                           -> 2 red: the two-node-process pair and the browser-and-node pair.
//   H  tools/ship/lockstepPeer.mjs: --serve not starting the relay (the first peer hosts nothing)                  -> 1 red: section 2b (the other machine cannot connect; exit 2/1).
//   G  brain/raceLockstepPeer.mjs: the engine identity not announced (backendId null)                              -> 1 red: the engine row (both processes stepped on, 722 / 724 ticks).
//   I  tools/ship/miniWs.mjs: wsTransport never hands a received message to the runner                              -> 8 red: section 1b's transport row (sent true, heard false), and every
//      pair behind it (both node processes, --serve, the browser-and-node pair, the divergence, the engine halt), none of which can hear the other peer.
//   J  tools/ship/lockstepPeer.mjs: the CLI prints its refusal and does not exit                                  -> 1 red: the unknown-option row (exit null after 20 s: the peer carried on with --gates ignored).
//   K  tools/ship/lockstepRelay.mjs: the CLI does not refuse                                                      -> 1 red: the relay row (a mistyped --prot started a relay on 8799, exit null).
//   FINDING, `--serve`'s first draft closed the hosted relay the moment the host's own result was in, which can be BEFORE the guest has read the host's final message
//   (the host often finishes second: it holds the guest's final hash the instant it has sent its own). The guest then reported "the other peer's final hash never
//   arrived" while the fingerprints were identical -- two runs in three. The host leaves the room first now and keeps the relay up until the room has emptied.
//   FINDING, a first draft asserted that the browser-and-node pair and the two-node pair reached THE SAME fingerprint. They do not and cannot: the policies'
//   commands are asked for when a peer's pump reaches each tick, from whatever state the sim has then, and that depends on the scheduler, so two runs of the same
//   race differ. What a pair has is agreement with ITSELF (every tick, and the end) and a log that replays to its fingerprint -- which is what the rows hold.
//   FINDING, miniWs's first draft delivered bytes that rode in with the 101 response BEFORE the caller could attach a message handler: the relay's "ready" was lost
//   to the peer that triggered it. They are handed over on the next turn of the event loop now (setImmediate).
//   FINDING, the frame-length rows' first draft counted CHARACTERS and prefixed each message, so none landed on 125/126: sabotage A went 0 red. Each message is exactly
//   n bytes now, prefix included. (A sabotage of the 65,535 boundary is not red and cannot be: a 64-bit length is a valid encoding of any size.)
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startRelay } from "./lockstepRelay.mjs";
import { connect, wsTransport } from "./miniWs.mjs";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { initNode, mod } from "../../physics/box3d/box3dNode.mjs";
import { worldFromModule } from "../../render/slugTicker.mjs";
import * as G from "../../brain/gunnerPolicy.mjs";
import * as D from "../../brain/drivePolicy.mjs";
import { standardRace } from "../../brain/raceLockstepPeer.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swek-lockstep-"));
const st = await initNode(); if (!st.ready) { console.log("  FAIL  box3d wasm: " + st.reason); process.exit(1); }
{ const l = console.log; console.log = (...a) => { if (!/^\[CityGen\]|^\[box3d\]|^\[GLBParser\]/.test(String(a[0]))) l(...a); }; }
/** the commands a pair stepped, replayed offline with no policies on this process's own wasm: the fingerprint it reaches */
const replayOf = (log) => { const c = standardRace(), zeros = c.drivers.map(() => D.zeroWeights()), zg = c.gunners.map(() => G.zeroWeights()); return G.raceWithGunners(() => worldFromModule(mod(), [0, -9.81, 0]), zeros, zg, { seed: 1, seconds: log.length * 0.016666666666666666, fleet: "00000000", inputsLog: log, city: c.city }).fingerprint; };
const relay = await startRelay({ port: 0, host: "127.0.0.1" });
const base = "ws://127.0.0.1:" + relay.port;

/** One real node process running the CLI peer; resolves { code, out, json } */
function peerProc(room, peer, extra = []) {
    const jf = path.join(tmp, room + "-" + peer + ".json"), lf = path.join(tmp, room + "-" + peer + ".log.json");
    return new Promise((resolve) => {
        const p = spawn(process.execPath, [path.join(ENG, "tools/ship/lockstepPeer.mjs"), "--relay", base, "--room", room, "--peer", peer, "--json", jf, "--log", lf, "--join-timeout", "40", "--run-timeout", "40", ...extra], { cwd: ENG });
        let out = ""; p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { out += d; });
        const timer = setTimeout(() => p.kill("SIGKILL"), 150000);
        p.on("close", (code) => { clearTimeout(timer); let json = null, log = null; try { json = JSON.parse(fs.readFileSync(jf, "utf8")); } catch (e) {} try { log = JSON.parse(fs.readFileSync(lf, "utf8")); } catch (e) {} resolve({ code, out, json, log }); });
    });
}

sec("1. THE RELAY AND ITS WEBSOCKET: every frame length class intact and in order to the OTHER peer; ready, left; duplicate ids and bad paths refused");
{
    const open = async (room, peer, n = 2) => { const ws = await connect(base + "/room/" + room + "?peer=" + peer + "&n=" + n), got = []; ws.on("message", (t) => got.push(t)); return { ws, got }; };
    const A = await open("t1", "A"), B = await open("t1", "B");
    await new Promise((r) => setTimeout(r, 150));
    const ready = (g) => g.map((t) => JSON.parse(t)).find((m) => m.t === "room" && m.ready);
    ok("the room announces ready to EVERY peer once it holds the n-th, with the peer list", !!ready(A.got) && !!ready(B.got) && ready(A.got).peers.join() === "A,B", JSON.stringify(ready(A.got)));
    const sizes = [3, 4, 125, 126, 127, 65535, 65536, 200000], msgs = sizes.map((n, i) => ("m" + i + ":" + "abcdefghij".repeat(Math.ceil(n / 10))).slice(0, n)).concat(["m8:é☃😀 multi-byte ✓"]);   // EXACTLY n bytes each, prefix included: the frame length classes are in bytes and ASCII lands on them
    for (const m of msgs) A.ws.send(m);
    await new Promise((r) => setTimeout(r, 400));
    const rec = B.got.filter((t) => t[0] === "m");
    ok("!! text messages of every frame length class (3, 4, 125, 126, 127, 65,535, 65,536 and 200,000 bytes exactly, and a multi-byte one) arrive INTACT and IN ORDER at the other peer", rec.length === msgs.length && rec.every((t, i) => t === msgs[i]), `${rec.length} of ${msgs.length}, longest ${Math.max(...rec.map((t) => t.length))}, lengths ${rec.slice(0, 8).map((t) => t.length).join("/")}`);
    ok("...and never come back to the sender", A.got.filter((t) => t[0] === "m").length === 0);
    B.ws.send("from-b"); await new Promise((r) => setTimeout(r, 100));
    ok("the other direction too", A.got.includes("from-b"));
    B.ws.close(); await new Promise((r) => setTimeout(r, 200));
    ok("a peer that leaves is announced to the rest", A.got.some((t) => { try { return JSON.parse(t).left === "B"; } catch (e) { return false; } }));
    const dup = await open("t1", "A"); await new Promise((r) => setTimeout(r, 150));
    ok("a second peer with a taken id is refused, by name", dup.got.some((t) => /already in room/.test(t)));
    const bad = await connect(base + "/nonsense?peer=X"), badGot = []; bad.on("message", (t) => badGot.push(t)); await new Promise((r) => setTimeout(r, 150));
    ok("a connection to no room is told how to connect and closed", badGot.some((t) => /connect to \/room/.test(t)));
    A.ws.close(); dup.ws.close(); bad.close();
}

sec("1b. THE PEER'S TRANSPORT AND ITS COMMAND LINE: wsTransport over the relay; an unknown option refused rather than read past");
{
    const raw = await connect(base + "/room/t1b?peer=R&n=2"), rawGot = []; raw.on("message", (t) => rawGot.push(t));
    const tr = await wsTransport(base + "/room/t1b?peer=T&n=2"), trGot = []; let closed = false; tr.onMessage((t) => trGot.push(t)); tr.onClose(() => { closed = true; });
    await new Promise((r) => setTimeout(r, 150));
    tr.send("from-transport"); raw.send("to-transport"); await new Promise((r) => setTimeout(r, 150));
    ok("wsTransport (the transport the node peer races on) sends to the other peer, hears the other peer, and hears the room's ready", rawGot.includes("from-transport") && trGot.includes("to-transport") && trGot.some((t) => { try { return JSON.parse(t).ready === true; } catch (e) { return false; } }), `sent ${rawGot.includes("from-transport")}, heard ${trGot.includes("to-transport")}, ${trGot.length} messages`);
    tr.close(); await new Promise((r) => setTimeout(r, 200));
    ok("...close() leaves the room properly: the other peer is told, and onClose fires on this side", rawGot.some((t) => { try { return JSON.parse(t).left === "T"; } catch (e) { return false; } }) && closed, `left announced ${rawGot.some((t) => /"left":"T"/.test(t))}, onClose ${closed}`);
    raw.close();
    const run = (script, args) => new Promise((resolve) => {
        const t0 = Date.now(), p = spawn(process.execPath, [path.join(ENG, script), ...args], { cwd: ENG }); let out = ""; p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { out += d; });
        const timer = setTimeout(() => p.kill("SIGKILL"), 20000); p.on("close", (code) => { clearTimeout(timer); resolve({ code, out, ms: Date.now() - t0 }); });
    });
    const [bp, br, np] = await Promise.all([run("tools/ship/lockstepPeer.mjs", ["--relay", base, "--peer", "A", "--gates", "1"]), run("tools/ship/lockstepRelay.mjs", ["--prot", "5"]), run("tools/ship/lockstepPeer.mjs", ["--peer", "A"])]);
    ok("!! an option the peer CLI does not know is REFUSED (exit 2, named, nothing run) instead of read past with a default -- the species tools/ship/cliArgs.mjs exists for", bp.code === 2 && /unknown option --gates/.test(bp.out) && /nothing was run/.test(bp.out) && bp.ms < 15000, `exit ${bp.code}, ${bp.ms} ms: ${bp.out.split("\n")[0]}`);
    ok("...and so is the relay's (a mistyped --prot is not 8799 quietly): exit 2 with the nearest spelling offered", br.code === 2 && /unknown option --prot -- did you mean --port/.test(br.out), `exit ${br.code}: ${br.out.split("\n")[0]}`);
    ok("...and a peer given neither --relay nor --serve is told so, exit 2", np.code === 2 && /required/.test(np.out), `exit ${np.code}: ${np.out.split("\n")[0]}`);
}

sec("2. TWO NODE PROCESSES, A REAL SOCKET: the CLI as a pair of machines would run it");
let pairFp = null;
{
    // B starts 1.5 s AFTER A: the relay holds A at the door until the room is full, because a message sent to a room nobody else has joined is one the
    // protocol never resends (redundancy covers the last four ticks, not the first)
    const [a, b] = await Promise.all([peerProc("p2", "A"), new Promise((r) => setTimeout(r, 1500)).then(() => peerProc("p2", "B"))]);
    report(`A: ${a.json && a.json.reason}   B: ${b.json && b.json.reason}`);
    pairFp = a.json && a.json.hashHex;
    const rep2 = a.log ? replayOf(a.log) : null;
    ok("!! and the commands the two processes exchanged are a REPLAY LOG: fed to raceWithGunners offline, with no policies, on this process's own wasm, they reach the pair's final fingerprint (the policies' commands depend on when each tick's were asked for, so two RUNS differ; a pair and its log never do)", rep2 === pairFp && a.log.length === 720 && JSON.stringify(a.log) === JSON.stringify(b.log), `replay ${rep2}, pair ${pairFp}, ${a.log && a.log.length} ticks, logs equal ${JSON.stringify(a.log) === JSON.stringify(b.log)}`);
    ok("!! two separate OS processes (the second started 1.5 s after the first), each starting its own wasm cold, racing twelve seconds through the relay on commands they exchanged over TCP: both exit 0 and agree on the same final fingerprint", a.code === 0 && b.code === 0 && a.json.agree && b.json.agree && a.json.hashHex === b.json.hashHex && a.json.tick >= 720, `exit ${a.code}/${b.code}, fingerprint ${a.json && a.json.hashHex} / ${b.json && b.json.hashHex}, ${a.json && a.json.ms} ms`);
    ok("...with the same engine identity on both (the protocol's precondition) and no desync recorded on either", a.json.fleet === b.json.fleet && !a.json.desync && !b.json.desync && !a.json.halted, `engine ${a.json.fleet}`);
}

sec("2b. ONE COMMAND ON MACHINE 1: --serve hosts the relay inside the first peer's own process");
{
    const probe = await startRelay({ port: 0, host: "127.0.0.1" }), port = probe.port; await probe.close();   // a free port, handed to the pair
    const [a, b] = await Promise.all([new Promise((resolve) => {
        const jf = path.join(tmp, "p2b-A.json"), p = spawn(process.execPath, [path.join(ENG, "tools/ship/lockstepPeer.mjs"), "--serve", "--port", String(port), "--room", "p2b", "--peer", "A", "--json", jf, "--join-timeout", "40", "--run-timeout", "40"], { cwd: ENG });
        let out = ""; p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { out += d; });
        const timer = setTimeout(() => p.kill("SIGKILL"), 150000);
        p.on("close", (code) => { clearTimeout(timer); let json = null; try { json = JSON.parse(fs.readFileSync(jf, "utf8")); } catch (e) {} resolve({ code, out, json }); });
    }), new Promise((r) => setTimeout(r, 1500)).then(() => new Promise((resolve) => {
        const jf = path.join(tmp, "p2b-B.json"), p = spawn(process.execPath, [path.join(ENG, "tools/ship/lockstepPeer.mjs"), "--relay", "ws://127.0.0.1:" + port, "--room", "p2b", "--peer", "B", "--json", jf, "--join-timeout", "40", "--run-timeout", "40"], { cwd: ENG });
        let out = ""; p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { out += d; });
        const timer = setTimeout(() => p.kill("SIGKILL"), 150000);
        p.on("close", (code) => { clearTimeout(timer); let json = null; try { json = JSON.parse(fs.readFileSync(jf, "utf8")); } catch (e) {} resolve({ code, out, json }); });
    }))]);
    ok("!! `--serve` on one machine is all it takes: peer A hosts the relay itself and prints the address the other machine uses; peer B connects to it and the pair agrees (both exit 0, one fingerprint)", a.code === 0 && b.code === 0 && a.json && b.json && a.json.hashHex === b.json.hashHex && /relay hosted here on port/.test(a.out) && new RegExp("--relay ws://\\S+:" + port).test(a.out), `exit ${a.code}/${b.code}, ${a.json && a.json.hashHex} / ${b.json && b.json.hashHex}; A: ${a.json && a.json.reason}; B: ${b.json && b.json.reason}`);
}

sec("3. A BROWSER AND A NODE PROCESS: a headless Chromium peer against a node peer through the same relay");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const nodeP = peerProc("p3", "B");
        const br = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 200000, args: { url: base + "/room/p3?peer=A&n=2" }, script: `async (a) => {
            globalThis.__swekStep = "box3d init";
            const { box3d } = await import("/physics/box3d/box3dLoader.js"); const ps = await box3d.init(); if (!ps.ready) return { error: "box3d: " + ps.reason };
            const { runRacePeer } = await import("/brain/raceLockstepPeer.mjs");
            globalThis.__swekStep = "connecting to the relay";
            const ws = new WebSocket(a.url); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("websocket error")); });
            const h = { m: [], c: [] }; ws.onmessage = (e) => h.m.forEach((f) => f(e.data)); ws.onclose = () => h.c.forEach((f) => f());
            const transport = { send: (t) => ws.send(t), onMessage: (f) => h.m.push(f), onClose: (f) => h.c.push(f), close: () => ws.close() };
            globalThis.__swekStep = "racing";
            const r = await runRacePeer({ transport, peerId: "A", box3dMod: box3d._mod, seconds: 12, keepLog: true });
            ws.close(); return r;
        }` });
        const nd = await nodeP, bj = br.ok ? br.result : null;
        report(`browser: ${bj && (bj.reason || bj.error)}   node: ${nd.json && nd.json.reason}`);
        ok("!! a headless Chromium peer and a node process, one socket between them, race twelve seconds and agree on the final fingerprint", br.ok && bj && bj.agree && nd.code === 0 && nd.json.agree && bj.hashHex === nd.json.hashHex, `browser ${bj && bj.hashHex}, node ${nd.json && nd.json.hashHex}`);
        const rep3 = bj && bj.log ? replayOf(bj.log) : null;
        ok("...and the commands that pair exchanged replay offline, on this process's wasm, to the same fingerprint, the browser's log and the node's the same", rep3 === (bj && bj.hashHex) && !!nd.log && JSON.stringify(bj.log) === JSON.stringify(nd.log), `replay ${rep3}`);
        ok("...on one engine identity: the browser's wasm and the node's are the same machine as far as box3d can tell", bj && bj.fleet === nd.json.fleet, `${bj && bj.fleet} / ${nd.json && nd.json.fleet}`);
    }
}

sec("4. A DIVERGENCE OVER THE WIRE: one process steps different commands at tick 100");
{
    const [a, b] = await Promise.all([peerProc("p4", "A"), peerProc("p4", "B", ["--tamper-at", "100"])]);
    report(`A: ${a.json && a.json.reason}   B: ${b.json && b.json.reason}`);
    ok("!! both processes exit 1 and each names the desync AT tick 100 -- the tick the tampering began, found by the hash exchange across the socket", a.code === 1 && b.code === 1 && a.json.desync && b.json.desync && a.json.desync.tick === 100 && b.json.desync.tick === 100, `A ${a.json && a.json.desync && a.json.desync.tick}, B ${b.json && b.json.desync && b.json.desync.tick}`);
}

sec("5. THE ENGINE IS PART OF THE PROTOCOL: a peer announcing another engine halts the pair before a step");
{
    const [a, b] = await Promise.all([peerProc("p5", "A"), peerProc("p5", "B", ["--engine-id", "someone-elses-box3d"])]);
    report(`A: ${a.json && a.json.reason}`);
    ok("!! both exit 1 having stepped nothing, and the reason names the other engine", a.code === 1 && b.code === 1 && a.json.halted && b.json.halted && a.json.tick === 0 && b.json.tick === 0 && /someone-elses-box3d/.test(a.json.reason + b.json.reason), `ticks ${a.json && a.json.tick}/${b.json && b.json.tick}`);
}

await relay.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? `\nlockstepRelay-selfcheck: ${fails} FAILED` : "\nlockstepRelay-selfcheck: all checks pass");
process.exitCode = fails ? 1 : 0;
