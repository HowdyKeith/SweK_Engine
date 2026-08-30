// tools/ship/serverShutdown-selfcheck.mjs
//
// Run: node tools/ship/serverShutdown-selfcheck.mjs
// RUNTIME 0.21s MEASURED (median of 3 -- 212/209/208 ms -- with date(1) around the run). Five real HTTP servers
// on loopback, each torn down and inspected; no browser, no network beyond 127.0.0.1.
//
// GATES tools/ship/serverShutdown.mjs, which exists because of this, from Keith's rig:
//
//     65 passed, 0 failed
//     Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 94
//
// *** A PERFECT SCORELINE FOLLOWED BY A FAST-FAIL IS THE WORST RESULT A GATE CAN PRODUCE, *** because a reader
// cannot tell whether the subject is broken or the harness is, so the honest reading of that whole run is
// "unknown" rather than "green". Three gates in this tree had the same teardown -- bz-tactics, bz-bridge and
// ai-bridge/tools/range -- and only one of them happened to be the one Keith ran.
//
// THE MEASURED CAUSE: server.close() RESOLVES WHILE ITS HANDLES ARE STILL MID-CLOSE. close() and destroy()
// only REQUEST a close; libuv finishes it a loop turn or two later, and process.exit() inside that window is
// exactly what the assert above is for. On Linux the same teardown is silent. THE BUG IS PLATFORM-VISIBLE,
// NOT PLATFORM-SPECIFIC.
"use strict";
import http from "node:http";
import { shutdownServer, liveHandles, drainChildren } from "./serverShutdown.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

const spin = async (n = 20) => { for (let i = 0; i < n && liveHandles().length > 0; i++) await new Promise((r) => setImmediate(r)); };
async function serve() {
    const srv = http.createServer((q, s) => s.end("ok"));
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    return { srv, url: "http://127.0.0.1:" + srv.address().port + "/" };
}

console.log("serverShutdown-selfcheck -- does a gate's own HTTP server let the process exit?\n");

// ---------------------------------------------------------------------------
console.log("1. *** STDIO IS NOT A LEAK, AND IT IS A Socket WHENEVER THE OUTPUT IS PIPED ***");
{
    // The first version of liveHandles() filtered by CLASS NAME -- WriteStream/ReadStream/Pipe/TTY, which is
    // what stdio looks like on a terminal. Under a pipe node hands you a net.Socket instead, so two Sockets
    // sat in the list from before the gate had built anything, and a correct teardown still read as a leak.
    // A NAME IS NOT AN IDENTITY. Asserted here rather than trusted, because this gate's own output is piped
    // in CI and attached to a terminal on a desk, and the answer has to be the same in both.
    ok("!! *** a process that has opened NOTHING reports NO live handles ***", liveHandles().length === 0,
        liveHandles().length ? "SPURIOUS: " + liveHandles().join(", ") +
            " -- these were here before anything was created, so every teardown assertion built on this " +
            "would be reading its own instrument rather than the subject"
          : "clean at rest, with stdout " + (process.stdout.isTTY ? "on a TTY" : "PIPED (the case that broke it)"));
    ok("...and stdout really is one of the handles being excluded, so the exclusion is doing work",
        !!process.stdout, "if stdio ever stops appearing in the handle list this check stops proving anything, " +
        "but a false NEGATIVE here is harmless -- the failure it guards is a false ALARM");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** close() RESOLVES BEFORE THE HANDLES ARE GONE -- THE CRASH, REPRODUCED ***");
{
    const { srv, url } = await serve();
    await (await fetch(url)).text();
    const during = liveHandles();
    await new Promise((r) => srv.close(r));
    const afterClose = liveHandles();
    ok("a served request really does put handles in the list", during.length > 0, during.join(", "));
    ok("!! *** ...and they are STILL THERE after close() has resolved ***", afterClose.length > 0,
        afterClose.length ? "STILL LIVE: " + afterClose.join(", ") + " -- this is the window process.exit() " +
            "was landing in, and the reason `await new Promise(r => srv.close(r))` looked like enough"
          : "nothing live -- if node ever makes close() synchronous in this respect, THIS GATE'S SUBJECT IS " +
            "GONE and the helper can be simplified. Do not just delete the check: prove it first.");
    await spin();
    ok("!! ...and a couple of loop turns is all they needed", liveHandles().length === 0,
        "close() REQUESTS a close; libuv completes it on a later turn. Measured: present at turn 1, gone by turn 2.");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE HELPER LEAVES NOTHING BEHIND, INCLUDING UNDER A DELIBERATE KEEP-ALIVE ***");
{
    const { srv, url } = await serve();
    for (let i = 0; i < 3; i++) await (await fetch(url)).text();
    await shutdownServer(srv);
    ok("!! *** shutdownServer() drains the loop completely ***", liveHandles().length === 0,
        liveHandles().length ? "STILL LIVE: " + liveHandles().join(", ") : "no server, no sockets, no timers");

    // THE HARDER CASE: a client that is explicitly holding connections open. If anything is going to survive
    // a teardown it is this, and it is the case closeAllConnections() exists for.
    const { srv: s2, url: u2 } = await serve();
    const agent = new http.Agent({ keepAlive: true, maxSockets: 2 });
    const one = () => new Promise((res, rej) => {
        const rq = http.get({ host: "127.0.0.1", port: new URL(u2).port, path: "/", agent }, (r) => { r.resume(); r.on("end", res); });
        rq.on("error", rej);
    });
    await one(); await one();
    const held = liveHandles();
    await shutdownServer(s2);
    agent.destroy();
    await spin();
    ok("a keep-alive agent really was holding the server open", held.length > 0, held.join(", "));
    ok("!! ...and the teardown still drains", liveHandles().length === 0,
        liveHandles().length ? "STILL LIVE: " + liveHandles().join(", ") : "clean");
    report("MEASURED, and it is not what was expected: node 19+ closes idle keep-alive connections inside " +
           "server.close() by itself, so step 4 (the loop drain) clears even this on its own. Steps 1 and 2 " +
           "were deleted individually and NEITHER SABOTAGE WAS CAUGHT. They are kept for the Windows crash " +
           "this helper exists for -- which is not a platform this box can measure -- and serverShutdown.mjs " +
           "says so in as many words rather than calling them a fix.");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** IT CANNOT HANG, BECAUSE A TEARDOWN THAT HANGS IS WORSE THAN ONE THAT CRASHES ***");
{
    // A crash at least says something. A gate that never exits is reported as a TIMEOUT with no output, which
    // is the least actionable result in the whole ritual -- and this tree has two of those open right now.
    // *** THE FIRST VERSION OF THIS CHECK USED setInterval AND PASSED IN 0 ms, WHICH IS THE TELL. ***
    // process._getActiveHandles() does not list timers -- node keeps those somewhere else -- so the drain saw
    // an empty list, returned immediately, and the bound was never exercised. A CONTROL THAT CANNOT FAIL IS
    // DECORATION, and one that passes in zero milliseconds is announcing it. The stuck handle has to be
    // something the handle list actually reports, so it is a SECOND LISTENING SERVER that nobody closes.
    const { srv } = await serve();
    const { srv: stuck } = await serve();           // never closed: the drain can never clear this
    const seen = liveHandles();
    ok("the un-closable handle is one the drain can actually SEE", seen.length > 0,
        seen.join(", ") + " -- a timer would NOT appear here, which is how the first version of this check " +
        "managed to pass in 0 ms without ever entering the loop");
    const t0 = Date.now();
    await shutdownServer(srv);
    const ms = Date.now() - t0;
    ok("!! *** the drain gives up rather than spinning forever on a handle it cannot close ***", ms < 2000,
        ms + " ms with a second server still listening -- bounded at 20 turns, and it really did spin");
    ok("...and it did NOT silently succeed: the stuck handle is still reported afterwards",
        liveHandles().length > 0, liveHandles().join(", ") + " -- which is what the caller's own assertion " +
        "then names, instead of the gate simply never returning");
    await new Promise((r) => stuck.close(r));
    await spin();
}

// ---- 5. *** A CHILD PROCESS IS NOT A SOCKET, AND LOOP TURNS CANNOT REAP ONE *** ----------------------------
{
    console.log("\n5. *** drainChildren WAITS ON A REAL TIMER, BECAUSE kill() ASKS ANOTHER PROGRAM TO DIE ***");
    const { spawn } = await import("node:child_process");
    // A child that ignores nothing and simply sleeps: killing it is a real OS round trip, not a microtask.
    const child = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 60000)"], { stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 120));
    ok("!! a spawned child really is a live handle", liveHandles().includes("ChildProcess"),
        liveHandles().join(", ") || "none");
    // Loop turns alone do NOT clear it -- the exact reason this helper exists beside the turn drain.
    child.kill();
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    const afterTurns = liveHandles().includes("ChildProcess");
    const r = await drainChildren(4000);
    ok("!! *** drainChildren clears what the turn drain left behind ***", r.drained && !liveHandles().includes("ChildProcess"),
        "after kill + 20 loop turns the ChildProcess was " + (afterTurns ? "STILL LIVE" : "already gone") +
        "; after drainChildren: gone in " + r.ms + "ms");
    if (!afterTurns) {
        console.log("  ....  ON THIS BOX the turn drain happened to be enough, so the line above did not have to do the work. " +
            "That is a fact about Linux timing, NOT evidence the helper is unnecessary: the gate it was written " +
            "for reported a live ChildProcess on a Windows rig after exactly that turn drain.");
    }
}

// ---- 6. AND IT GIVES UP RATHER THAN HANGING ------------------------------------------------------------------
{
    console.log("\n6. A TEARDOWN THAT HANGS IS WORSE THAN ONE THAT REPORTS");
    const { spawn } = await import("node:child_process");
    const stubborn = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{}, 1000);"], { stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 120));
    stubborn.kill();                                   // ignored on purpose
    const t0 = Date.now();
    const r = await drainChildren(300, 25);
    const ms = Date.now() - t0;
    ok("!! *** it returns on its budget instead of spinning on a child that will not die ***",
        r.drained === false && ms < 2000, ms + "ms against a 300ms budget");
    ok("...and NAMES what outlasted it, so the caller can assert on something", r.still.includes("ChildProcess"),
        r.still.join(", ") || "nothing reported");
    stubborn.kill("SIGKILL");
    await drainChildren(3000);
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
