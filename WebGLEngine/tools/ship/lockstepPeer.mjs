#!/usr/bin/env node
// WebGLEngine/tools/ship/lockstepPeer.mjs -- v4681
//
// ONE PEER OF THE RACE LOCKSTEP, FROM THE COMMAND LINE: the cross-machine check. Run the relay on one machine, one peer on each of two machines (or both on
// one, in two terminals), and each prints whether the other's race came out bit for bit the same as its own.
//
//   machine 1:   node tools/ship/lockstepPeer.mjs --serve --peer A                 (runs the relay in this process, on 0.0.0.0:8799, and prints the address)
//   machine 2:   node tools/ship/lockstepPeer.mjs --relay ws://MACHINE1:8799 --peer B
//   (or the relay on its own: node tools/ship/lockstepRelay.mjs, then --relay ws://localhost:8799 on each)
//
//   options:  --serve [--port N] (host the relay here, 8799)   --room NAME (default "race")   --seconds N (12)   --delay TICKS (4, the input delay)   --json FILE (write the result)   --log FILE (write the commands the pair stepped: raceWithGunners's replay log)
//             --join-timeout SEC (60: wait for the other peer)   --run-timeout SEC (120)   --engine-id TEXT (override the engine identity announced)   --tamper-at TICK (step different commands at that tick: a gate's divergence)
//   exit code: 0 the peers agreed on every tick and the final fingerprint; 1 they did not (a desync, a halted pair, a mismatch); 2 the run itself broke.
//
// WHAT AGREEING MEANS: both machines ran the SAME box3d wasm through the same race (three cars with turrets, the real city, a building brought down, the block
// that fell chipped and shattered) from the commands the two exchanged, and the running fingerprint of box3d's state, the turrets, the shells, the city's hit
// points and the falling block matched at every tick. The engine identity printed (drivePolicy.machineFingerprint) is a hash of a canonical box3d scene run on
// THIS machine; two machines that print different ones will halt before the first step, which is the protocol working, not a bug in the race.
"use strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { initNode, mod } from "../../physics/box3d/box3dNode.mjs";
import { connect } from "./miniWs.mjs";
import { startRelay } from "./lockstepRelay.mjs";
import { runRacePeer } from "../../brain/raceLockstepPeer.mjs";

/** The transport the peer runner wants, over miniWs's client. */
export async function wsTransport(url) {
    const ws = await connect(url), handlers = { m: [], c: [] };
    ws.on("message", (t) => handlers.m.forEach((f) => f(t))); ws.on("close", () => handlers.c.forEach((f) => f())); ws.on("error", () => {});
    return { send: (t) => ws.send(t), onMessage: (f) => handlers.m.push(f), onClose: (f) => handlers.c.push(f), close: () => ws.close() };
}

/** Connect to the relay and run one peer. Returns runRacePeer's result. */
export async function runCli({ relay, room = "race", peer, seconds = 12, delay = 4, engineId = null, tamperAt = null, quiet = false, onStatus = null, keepLog = false, joinTimeoutMs, runTimeoutMs } = {}) {
    const log0 = console.log; console.log = (...a) => { if (!/^\[CityGen\]|^\[box3d\]|^\[GLBParser\]/.test(String(a[0]))) log0(...a); };
    try {
        const st = await initNode(); if (!st.ready) throw new Error("box3d wasm: " + st.reason);
        const url = relay.replace(/\/$/, "") + "/room/" + encodeURIComponent(room) + "?peer=" + encodeURIComponent(peer) + "&n=2";
        const transport = await wsTransport(url);
        const r = await runRacePeer({ transport, peerId: peer, box3dMod: mod(), seconds, inputDelay: delay, engineId, tamperAt, keepLog, joinTimeoutMs, runTimeoutMs, onStatus: quiet ? null : onStatus });
        // leave the room properly and give the last bytes (our final message) a moment to reach the relay before the process can exit
        transport.close(); await new Promise((res) => setTimeout(res, 150));
        return r;
    } finally { console.log = log0; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const arg = (k, d = null) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
    const serve = process.argv.includes("--serve");
    if ((!arg("relay") && !serve) || !arg("peer")) { console.error("usage: node tools/ship/lockstepPeer.mjs (--relay ws://HOST:8799 | --serve [--port N]) --peer A|B [--room NAME] [--seconds 12] [--delay 4] [--json FILE]"); process.exit(2); }
    let last = 0, hosted = null;
    try {
        if (serve) {
            hosted = await startRelay({ port: +arg("port", 8799), host: "0.0.0.0" });
            const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
            console.log(`relay hosted here on port ${hosted.port}; the other machine runs:\n` + (ips.length ? ips : ["THIS-MACHINES-ADDRESS"]).map((ip) => `    node tools/ship/lockstepPeer.mjs --relay ws://${ip}:${hosted.port} --peer B`).join("\n"));
        }
        const r = await runCli({ relay: serve ? "ws://127.0.0.1:" + hosted.port : arg("relay"), room: arg("room", "race"), peer: arg("peer"), seconds: +arg("seconds", 12), delay: +arg("delay", 4), engineId: arg("engine-id"), tamperAt: arg("tamper-at") != null ? +arg("tamper-at") : null, keepLog: !!arg("log"), joinTimeoutMs: arg("join-timeout") != null ? +arg("join-timeout") * 1000 : undefined, runTimeoutMs: arg("run-timeout") != null ? +arg("run-timeout") * 1000 : undefined,
            onStatus: (s) => { if (Date.now() - last > 1000) { last = Date.now(); console.log(`  peer ${arg("peer")}: tick ${s.tick}/${s.of}, input lead ${s.lead}`); } } });
        console.log(`\npeer ${r.peerId} on ${os.hostname()} (${os.platform()} ${os.arch()}, node ${process.version}), engine ${r.fleet}`);
        console.log(r.agree ? `AGREED  ${r.reason}  (${r.ms} ms)` : `DID NOT AGREE  ${r.reason}  (${r.ms} ms)`);
        if (arg("log") && r.log) fs.writeFileSync(arg("log"), JSON.stringify(r.log));
        if (arg("json")) fs.writeFileSync(arg("json"), JSON.stringify({ ...r, log: undefined, host: os.hostname(), platform: os.platform(), arch: os.arch(), node: process.version }, null, 2));
        // the host's relay is the OTHER peer's wire: it stays up until the room has emptied (they may still be reading our last message), or ten seconds
        if (hosted) { const tw = Date.now(); while (hosted.rooms.size && Date.now() - tw < 10000) await new Promise((res) => setTimeout(res, 50)); await hosted.close(); }
        process.exit(r.agree ? 0 : 1);
    } catch (e) { console.error("lockstep peer failed: " + (e && e.message ? e.message : e)); process.exit(2); }
}
