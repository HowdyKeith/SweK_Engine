#!/usr/bin/env node
// WebGLEngine/tools/ship/peerBrainFleet-selfcheck.mjs
//
// Run: node tools/ship/peerBrainFleet-selfcheck.mjs
//
// GATES ai-bridge/server.js's THREE new peer-brain routes (/brain/publish, /brain/mine, /brain/fleet) against
// REAL running bridge processes -- not mocked HTTP, not a stand-in static server. Section 1 starts one real
// bridge instance and drives /brain/publish + /brain/mine over real loopback HTTP, including malformed-input
// refusal. Section 2 is the hard one: a REAL THREE-PROCESS test of /brain/fleet's aggregation through
// _announcePeers() -- the actual peer-discovery path production code uses, not a bypass of it. Section 3
// drives race-brain.html's Publish/Find-peer-brains buttons in a REAL headless browser navigated DIRECTLY at a
// REAL running bridge (not tools/ship/webgpuHarness.mjs's own minimal static-file stand-in, which does not
// implement these routes at all -- ai-bridge/server.js IS this engine's real static file server too, via
// serveStaticFile(), so pointing a browser straight at it is the actually-realistic way to test this).
//
// *** ~/.voxelbridge/sync-peers.json IS REAL, LIVE USER CONFIGURATION, NOT TEST FIXTURE. *** Section 2 must add
// a loopback test peer to it to exercise _announcePeers() for real, and MUST restore the file to its exact
// original bytes afterward -- wrapped in try/finally so a crash or timeout mid-test cannot leave the user's
// real peer list corrupted. Measured directly on this box: the file already held four real LAN/tailnet peer
// URLs before this gate ever ran.
//
// *** v4778 (2026-10-04) -- THOSE "FOUR REAL PEERS" WERE WHERE TWO THIRDS OF THIS GATE'S TIME WENT, AND THEY
// WERE NOT REAL: THEY ARE ai-bridge/discoveryTrust-selfcheck.mjs's TEST ADDRESSES. *** That gate drives the
// real assetSync.addPeer() against the real ~/.voxelbridge/sync-peers.json with 192.168.11.9, 10.0.0.5,
// 172.16.4.4, 100.64.3.4 and 172.16.0.1 and never removes them; this box's file holds exactly those five now
// (it held four when the line above was written, and gained 10.0.0.5 at 11:50:57 today while other agents ran
// gates). So the BRIDGES NOW RUN UNDER A SCRATCH HOME AND THE REAL FILE IS NEVER WRITTEN AT ALL. Keith's rig killed this
// gate at the quick sweep's cap (20,286 ms alone, last line "...genuinely holds both", i.e. inside Find peer
// brains); this box measured 15.0-18.6 s alone over five runs. Timestamped here: bridge A up at 0.8 s, B at
// 1.4 s, then GET /brain/fleet took 5,009 ms (1,461 -> 6,470) and the page's Find peer brains click 5,538 ms
// (9,943 -> 15,481) -- each one exactly _peerJSON's 5,000 ms per-peer timeout, because /brain/fleet fans out
// to EVERY saved peer and waits for all of them, and none of those addresses answers from a sandbox or a test
// rig. That is the route behaving as written (a dead peer costs one timeout); it is not what this gate
// measures, and it made the gate's run time a function of whatever else had written that file. Spawning both bridges with HOME/USERPROFILE pointed at a fresh mkdtemp directory (os.homedir() reads
// HOME on POSIX and USERPROFILE on Windows; every ai-bridge config path is built from os.homedir()) gives
// them a peer file this gate wholly owns: section 2 seeds it with the one 127.0.0.2 test peer, so /brain/fleet
// still goes through the real _announcePeers() -> assetSync.loadPeers() -> second HTTP hop, just without five
// dead addresses to time out on. It also closes the hole the SIGINT handler below admits it cannot: a SIGKILL --
// which is exactly what the quick sweep's cap sends -- can no longer leave the user's real peer list holding
// the test entry, because nothing here writes that file any more. The byte-for-byte row on the REAL file
// stays, now asserting it was never touched (and if HOME isolation ever silently failed, bridge A would read
// the real file, not the seeded one, and the fleet row would go red for want of bridge B).
//
// WHY 127.0.0.2, NOT 127.0.0.1, FOR THE TEST PEER: assetSync.js's _isOwnHost() rejects the exact strings
// "127.0.0.1"/"localhost"/"::1"/every real NIC address as "self, not a peer" -- but its self-check is a literal
// string match, not a 127.0.0.0/8 range check, while _isLanPeerUrl()'s OWN later branch explicitly allows the
// whole 127.0.0.0/8 range as a plausible loopback peer address (`if (a === 127) return true`). So
// "http://127.0.0.2:PORT" passes the self-filter (not the exact self string) and then passes the peer-address
// filter (in the allowed loopback range) -- a genuine, if slightly odd, way to seed a real second local process
// as a real peer without touching assetSync.js itself. Confirmed by hand before writing this gate; re-confirmed
// here on every run.
//
// Test ports 17781/17782 are far from the real bridge's default 8787 specifically to avoid colliding with a
// bridge the user may already have running.
"use strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { LAUNCH_ARGS, SECURE_HOST, webgpuSkipReason } from "./webgpuHarness.mjs";
import * as D from "../../brain/drivePolicy.mjs";
import * as GP from "../../brain/gunnerPolicy.mjs";
import * as PB from "../../brain/peerBrain.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BRIDGE = path.join(ROOT, "ai-bridge", "server.js");
// v4778: the REAL user peer file, read only -- see the header. Each bridge gets its own scratch home (two
// bridges are two boxes, and two fresh processes creating one config dir at once is a race nobody needs);
// PEERS_FILE is bridge A's, the one /brain/fleet on A reads.
const REAL_PEERS_FILE = path.join(os.homedir(), ".voxelbridge", "sync-peers.json");
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "peerBrainFleet-home-"));
const HOME_A = path.join(SCRATCH, "a"), HOME_B = path.join(SCRATCH, "b");
const PEERS_FILE = path.join(HOME_A, ".voxelbridge", "sync-peers.json");
const PORT_A = 17781, PORT_B = 17782;
const children = new Set();   // every spawned bridge, from the moment it is spawned, for the cleanup paths below
const removeScratch = () => { try { fs.rmSync(SCRATCH, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} };

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);

console.log("peerBrainFleet-selfcheck -- ai-bridge/server.js's peer-brain routes, against real running bridge processes\n");

/** Start ai-bridge/server.js as a real child process on `port`, resolving once /health answers. */
async function startBridge(port, home) {
    fs.mkdirSync(home, { recursive: true });
    const cp = spawn(process.execPath, [BRIDGE], { cwd: path.dirname(BRIDGE), env: { ...process.env, PORT: String(port), HOME: home, USERPROFILE: home }, stdio: ["ignore", "pipe", "pipe"] });
    children.add(cp);
    let out = "";
    cp.stdout.on("data", (d) => { out += d; });
    cp.stderr.on("data", (d) => { out += d; });
    // !! each attempt carries its OWN AbortSignal.timeout, not just the outer deadline -- found by adversarial
    // review: a port that accepts a TCP connection but never answers HTTP (measured directly: a bare listener
    // that accepts and never responds) hung the bare `fetch()` call indefinitely, so the outer while-loop's
    // Date.now() check was never reached again and the intended 15 s deadline did nothing. A refused connection
    // (the port simply not listening) already failed fast on its own; only the accepts-but-never-responds case
    // needed this.
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        try { const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) }); if (r.ok) { const j = await r.json(); if (j.ok) return { cp, out: () => out }; } } catch {}
        // v4778: 50 ms, was 250 -- a refused connect fails in well under a millisecond, and the bridge answers
        // /health ~550-660 ms after spawn here, so a 250 ms poll threw away up to a quarter second per bridge.
        await new Promise((res) => setTimeout(res, 50));
    }
    try { cp.kill("SIGKILL"); } catch {}
    throw new Error(`bridge on port ${port} did not answer /health within 15 s -- output: ${out.slice(-500)}`);
}

// !! SIGINT/SIGTERM cleanup -- found missing by adversarial review, which reproduced real, permanent damage from
// its absence: a plain Ctrl-C (SIGINT) during section 2's peers-file-modified window skipped this file's
// try/finally entirely (Node's default SIGINT disposition is immediate termination, not a JS-level unwind) and
// left ~/.voxelbridge/sync-peers.json permanently holding the injected test peer entry; the same run also
// orphaned both bridge child processes. Handlers here restore the file and kill the children before exiting.
// *** THIS DOES NOT AND CANNOT COVER SIGKILL. *** No process in any language can catch or run any code in
// response to SIGKILL -- it is the OS unconditionally freeing the process's memory, not a signal delivered to
// it. The review's SIGKILL repro is real and is an accepted, structural limit of this approach, not a bug left
// unfixed; SIGINT/SIGTERM (an impatient Ctrl-C, a CI runner's graceful-shutdown signal) are the realistic cases
// this can and does now cover.
// v4778: since the bridges run under a scratch home (header), there is no real file left to restore on any
// signal, SIGKILL included -- the handlers now kill every spawned child (tracked from spawn, not from /health,
// so one still booting is not orphaned) and remove the scratch home.
let bridgeA = null, bridgeB = null;
function emergencyCleanup(signal) {
    for (const cp of children) { try { cp.kill("SIGKILL"); } catch {} }
    removeScratch();
    console.error(`\n[${signal}] killed ${children.size} bridge(s) and removed ${SCRATCH} before exiting`);
    process.exit(130);
}
process.on("SIGINT", () => emergencyCleanup("SIGINT"));
process.on("SIGTERM", () => emergencyCleanup("SIGTERM"));

// v4778: the real user peer file's bytes before any bridge is spawned -- section 2's byte-for-byte row compares
// against this (null when the file does not exist).
const realPeersAtStart = fs.existsSync(REAL_PEERS_FILE) ? fs.readFileSync(REAL_PEERS_FILE, "utf8") : null;

try {
    sec("1. /brain/publish + /brain/mine, ON A REAL RUNNING BRIDGE, OVER REAL LOOPBACK HTTP");
    // v4778: bridge B boots alongside A instead of after section 1 (each takes ~550-660 ms to answer /health
    // here, and they never waited on each other for anything); section 2 awaits it where it used to start it.
    const bridgeBStarting = startBridge(PORT_B, HOME_B);
    bridgeBStarting.catch(() => {});   // its failure is reported where section 2 awaits it, not as an unhandled rejection
    {
        bridgeA = await startBridge(PORT_A, HOME_A);
        report(`bridge A up on :${PORT_A}`);
        const base = `http://127.0.0.1:${PORT_A}`;
        const handWeights = D.handWeights();
        const blob = PB.exportBrain(PB.describePolicy("drivePolicy", D), handWeights, { score: 900, by: "test-peer", citation: "unit test" });
        const pub = await fetch(`${base}/brain/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blob }) }).then((r) => r.json());
        ok("!! POST /brain/publish accepts a real, valid exported brain over real HTTP", pub.ok && pub.policy === "drivePolicy", JSON.stringify(pub));
        const mine = await fetch(`${base}/brain/mine`).then((r) => r.json());
        ok("!! GET /brain/mine returns EXACTLY what was published -- the same weights, byte for byte, round-tripped through a real HTTP POST and GET", mine.ok && mine.brains.length === 1 && mine.brains[0].weightCount === D.WEIGHT_COUNT && mine.brains[0].weights.length === handWeights.length && mine.brains[0].weights.every((v, i) => v === handWeights[i]), `${mine.brains.length} brain(s)`);
        const importedBack = PB.importBrain(PB.describePolicy("drivePolicy", D), mine.brains[0]);
        ok("...and what /brain/mine returns is itself a valid, importable brain export (not just shaped like one)", importedBack.ok);

        const badPub = await fetch(`${base}/brain/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blob: { format: "swek-brain-v1", policy: "drivePolicy", weightCount: 3, weights: [1, 2, 3] } }) }).then((r) => r.json());
        ok("!! a malformed publish (wrong weight count) is refused, with a reason, NOT a 500 or a silently-accepted bad brain", badPub.ok === false && typeof badPub.error === "string" && badPub.error.length > 0, badPub.error);
        const mineAfterBad = await fetch(`${base}/brain/mine`).then((r) => r.json());
        ok("...and the refused publish did NOT overwrite the good one already stored", mineAfterBad.brains.length === 1 && mineAfterBad.brains[0].weights.length === handWeights.length && mineAfterBad.brains[0].weights.every((v, i) => v === handWeights[i]));

        const unknownPolicy = await fetch(`${base}/brain/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blob: { format: "swek-brain-v1", policy: "nonsense", weights: [] } }) }).then((r) => r.json());
        ok("!! an unknown policy id is refused by name, not a crash", unknownPolicy.ok === false && /nonsense/.test(unknownPolicy.error), unknownPolicy.error);
    }

    sec("2. /brain/fleet -- A REAL THREE-PROCESS TEST THROUGH _announcePeers(), THE ACTUAL DISCOVERY PATH");
    {
        let peersBackup = null;
        try {
            peersBackup = fs.existsSync(PEERS_FILE) ? fs.readFileSync(PEERS_FILE, "utf8") : null;
            report(peersBackup ? `backed up bridge A's scratch ${PEERS_FILE} (${JSON.parse(peersBackup).peers?.length || 0} peer(s) in it)` : `bridge A's scratch ${PEERS_FILE} does not exist yet -- will remove what this test creates`);
            report(realPeersAtStart ? `the real ${REAL_PEERS_FILE} (${(() => { try { return JSON.parse(realPeersAtStart).peers?.length || 0; } catch { return "?"; } })()} real peer(s)) is read, never written -- see the header (v4778)` : `${REAL_PEERS_FILE} does not exist -- and this gate will not create it`);

            bridgeB = await bridgeBStarting;
            report(`bridge B up on :${PORT_B}`);
            const gunnerHand = GP.handWeights();
            const gblob = PB.exportBrain(PB.describePolicy("gunnerPolicy", GP), gunnerHand, { score: 13, by: "bridge-B", citation: "male-cns GFC" });
            const pubB = await fetch(`http://127.0.0.1:${PORT_B}/brain/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blob: gblob }) }).then((r) => r.json());
            ok("bridge B published a real gunner brain", pubB.ok);

            // Seed bridge B as a real peer of bridge A, via 127.0.0.2 -- see this file's header for why that
            // specific address passes assetSync.js's self-filter where 127.0.0.1 would not.
            const existing = peersBackup ? JSON.parse(peersBackup) : { peers: [] };
            const testPeerUrl = `http://127.0.0.2:${PORT_B}`;
            fs.mkdirSync(path.dirname(PEERS_FILE), { recursive: true });
            fs.writeFileSync(PEERS_FILE, JSON.stringify({ ...existing, peers: [...(existing.peers || []), testPeerUrl] }, null, 2));

            const fleet = await fetch(`http://127.0.0.1:${PORT_A}/brain/fleet`).then((r) => r.json());
            const fromB = fleet.ok && fleet.peers.find((p) => p.peer.replace(/\/+$/, "") === testPeerUrl.replace(/\/+$/, ""));
            ok("!! *** GET /brain/fleet on bridge A discovered bridge B through the REAL _announcePeers() path (not a shortcut) and fetched its REAL published gunner brain over a REAL second HTTP hop ***",
                !!fromB && fromB.brains.length >= 1 && fromB.brains.some((b) => b.policy === "gunnerPolicy" && b.weights.length === gunnerHand.length && b.weights.every((v, i) => v === gunnerHand[i])),
                fleet.ok ? `${fleet.peers.length} peer(s) with brains: ${fleet.peers.map((p) => p.peer).join(", ")}` : JSON.stringify(fleet));
            report("this is the aggregation a real user's Find peer brains button drives -- proven here through the actual peer registry, not a mocked one");
        } finally {
            if (peersBackup !== null) { fs.writeFileSync(PEERS_FILE, peersBackup); report(`restored ${PEERS_FILE} to its original bytes`); }
            else { try { fs.unlinkSync(PEERS_FILE); } catch {} report(`removed the test-created ${PEERS_FILE} (none existed before this gate)`); }
            const afterScratch = fs.existsSync(PEERS_FILE) ? fs.readFileSync(PEERS_FILE, "utf8") : null;
            ok("bridge A's scratch peer file is back as section 2 found it", afterScratch === peersBackup);
            // v4778: was a byte-for-byte check of the file this section wrote and restored, back when that was the
            // user's real one; it now reads the REAL file this gate no longer writes, against its bytes at start.
            const after = fs.existsSync(REAL_PEERS_FILE) ? fs.readFileSync(REAL_PEERS_FILE, "utf8") : null;
            ok("!! the real peer config is EXACTLY as this gate found it, verified byte-for-byte after section 2", after === realPeersAtStart);
        }
    }

    sec("3. IN A REAL BROWSER, NAVIGATED DIRECTLY AT A REAL BRIDGE: race-brain.html's Publish / Find peer brains BUTTONS");
    {
        const skip = webgpuSkipReason(createRequire(import.meta.url));
        if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
        else {
            const pw = resolvePlaywright(createRequire(import.meta.url));
            let browser = null;
            try {
                browser = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: [...LAUNCH_ARGS] });
                const page = await browser.newPage();
                const pageErrors = []; page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));
                page.setDefaultTimeout(60000);
                await page.goto(`http://127.0.0.1:${PORT_A}/race-brain.html?webgl=1`);
                await page.waitForFunction(() => /a turret on each/.test(document.getElementById("tick")?.textContent || ""), { timeout: 60000 }).catch(() => {});
                const booted = await page.evaluate(() => /a turret on each/.test(document.getElementById("tick")?.textContent || ""));
                ok("the real bridge served race-brain.html and it booted (WebGPU/box3d, same as every other page-boot gate)", booted, pageErrors.join(" | ").slice(0, 300));
                if (booted) {
                    await page.click("#publishBrain");
                    await page.waitForFunction(() => /published/.test(document.getElementById("fleetStatus")?.textContent || ""), { timeout: 10000 }).catch(() => {});
                    const fleetStatus1 = await page.evaluate(() => document.getElementById("fleetStatus").textContent);
                    ok("!! clicking Publish (driver) against the REAL bridge succeeds -- a real fetch, a real /brain/publish, a real confirmation", /published the brain/.test(fleetStatus1), fleetStatus1);

                    await page.click("#publishGun");
                    await page.waitForFunction(() => /published the gunner/.test(document.getElementById("fleetStatus")?.textContent || ""), { timeout: 10000 }).catch(() => {});
                    const fleetStatus2 = await page.evaluate(() => document.getElementById("fleetStatus").textContent);
                    ok("!! ...and Publish (gunner) too", /published the gunner/.test(fleetStatus2), fleetStatus2);

                    const mineNow = await fetch(`http://127.0.0.1:${PORT_A}/brain/mine`).then((r) => r.json());
                    ok("!! ...and the bridge this page just talked to genuinely holds both, confirmed independently over a separate direct HTTP call", mineNow.ok && mineNow.brains.some((b) => b.policy === "drivePolicy") && mineNow.brains.some((b) => b.policy === "gunnerPolicy"), `${mineNow.brains.length} brain(s)`);

                    await page.click("#findPeers");
                    // wait for the SETTLED result, not the transient "asking the fleet..." message the click sets
                    // immediately -- a naive "text is non-empty" wait matches that transient state instantly and
                    // never actually waits for the real fetch to complete (measured: it did, on the first version
                    // of this check, silently passing without ever observing the real answer).
                    await page.waitForFunction(() => !/asking the fleet/.test(document.getElementById("fleetStatus")?.textContent || ""), { timeout: 10000 }).catch(() => {});
                    const findResult = await page.evaluate(() => document.getElementById("fleetStatus").textContent);
                    // NOT asserting a fixed peer count here, on purpose, after measuring why a first version of this
                    // check that hardcoded "must be zero peers" was WRONG: bridge B (started in section 2, still
                    // running here since it is stopped only in this file's own top-level `finally`) got picked up
                    // by _announcePeers()'s own LAN auto-discovery leg in this real environment, so bridge A's real,
                    // honest, settled answer can legitimately be "no peers" OR "N peer(s)" depending on live network
                    // conditions this test does not control -- either is correct, so both are accepted. What matters
                    // (and is asserted) is that the button reaches the SETTLED real answer, not the transient
                    // "asking the fleet..." message, and not a crash.
                    ok("!! Find peer brains hits the real /brain/fleet endpoint and reaches a real, SETTLED answer (no peers, or a real discovered peer -- either is honest; never stuck asking, never a crash)", /no peers are publishing|peer\(s\):/.test(findResult), findResult);
                    ok("no page errors were thrown by any of this", pageErrors.length === 0, pageErrors.join(" | "));
                }
            } finally { try { await browser?.close(); } catch {} }
        }
    }
} finally {
    // A, B, and B even if section 1 threw before it was awaited; wait (bounded) for them to actually exit so
    // Windows has released their handles in the scratch home before it is removed.
    await Promise.race([Promise.all([...children].map((cp) => new Promise((res) => { if (cp.exitCode !== null || cp.signalCode !== null) return res(); cp.once("exit", res); try { cp.kill("SIGKILL"); } catch { res(); } }))), new Promise((res) => setTimeout(res, 3000))]);
    removeScratch();
}

console.log("\n" + (fails ? `${fails} FAILED` : "all checks pass"));
process.exit(fails ? 1 : 0);
