// tools/ship/serverShutdown.mjs -- SHUT A TEST SERVER DOWN SO THE PROCESS CAN EXIT CLEANLY.
//
// v4000 -- Keith's rig, running bz/tools/bz-tactics-selfcheck.mjs:
//
//     65 passed, 0 failed
//     Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 94
//
// exit code 3221226505 = 0xC0000409, Windows' fast-fail. *** EVERY CHECK PASSED AND THE GATE STILL REPORTED A
// CRASH, WHICH IS THE WORST COMBINATION THERE IS: *** a reader sees a stack-buffer-overrun code and cannot tell
// whether the physics is broken or the teardown is, so the honest reading of that run is "unknown" rather than
// "green". A gate that cannot exit is a gate whose result cannot be trusted.
//
// *** MEASURED, NOT REASONED ABOUT. *** Instrumenting the gate with process._getActiveHandles() immediately
// before process.exit() printed:
//
//     handles: Socket,Socket,Server,Socket,Socket,Socket   requests: 0
//
// FIVE LIVE SOCKETS AND THE SERVER, after `await new Promise((r) => srv.close(r))` had already resolved.
// close() stops the listener and resolves; it does NOT destroy sockets that a KEEP-ALIVE CLIENT is holding
// open. Node's global fetch is undici, and undici pools connections by design -- so the gate's own HTTP client
// was the thing keeping its own server alive. process.exit() then tore libuv down underneath handles that were
// mid-close, and on Windows that trips the assert above. On Linux the same teardown is silent, which is exactly
// why this survived: THE BUG IS PLATFORM-VISIBLE, NOT PLATFORM-SPECIFIC.
//
// THREE GATES HAVE THIS SHAPE, not one: bz-tactics (5 fetches), bz-bridge (6) and ai-bridge/tools/range (1).
// bz-play and bz-proxy drive their servers with something other than fetch and were never exposed. So this is
// a shared helper rather than a fix in one file -- fixing only the gate that happened to crash would leave the
// same crash armed in two others, waiting for whichever one Keith ran next.
"use strict";

/**
 * Close a server AND everything holding it open, then hand back once the loop can actually drain.
 *
 * ORDER MATTERS AND IS THE WHOLE POINT:
 *   1. stop the client pool first, so it cannot open a fresh keep-alive socket while we are closing;
 *   2. destroy the sockets the server is still holding;
 *   3. close the listener and wait for its callback.
 * Doing (3) first is what the crashing gates did, and it resolves with the sockets still live.
 *
 * @param srv  a node http.Server (or anything with close()/closeAllConnections())
 */
export async function shutdownServer(srv) {
    // *** WHICH OF THESE FOUR STEPS ACTUALLY DOES THE WORK, MEASURED RATHER THAN ASSUMED. ***
    //
    // Each step was deleted on its own and the caller re-run. ONLY STEP 4 IS LOAD-BEARING on node 22.22.2:
    //
    //     no loop drain            -> CAUGHT    (STILL LIVE: Server, Socket, Socket)
    //     no closeAllConnections   -> not caught
    //     no dispatcher close      -> not caught
    //
    // And that was checked again against the hardest case rather than taken from one run: an explicit
    // http.Agent({keepAlive:true}) holding two live sockets still drained to nothing on step 4 alone, because
    // node 19+ closes idle keep-alive connections inside server.close() by itself.
    //
    // SO STEPS 1 AND 2 ARE NOT THE FIX AND THIS FILE DOES NOT CLAIM THEY ARE. They are kept because the crash
    // they guard against is on WINDOWS, which is not a platform this measurement could reach -- and deleting a
    // teardown step because a different operating system does not need it is reasoning from the wrong box.
    // What is NOT acceptable is calling them a fix: v3436's rule is that an advertised thing which moves no
    // observable is a documented defect, and the honest form of that here is to document it. The measurement
    // above is what a future round on a Windows box needs in order to settle it either way.
    //
    // 1. undici's global pool. Node does not export it, so it is reached through the well-known symbol it
    //    registers itself under. GUARDED ON EVERY STEP: this is an internal detail and a node version that
    //    moves or drops it must leave this helper working rather than throwing during teardown.
    //    UNPROVEN ON LINUX -- see the measurement above.
    try {
        const d = globalThis[Symbol.for("undici.globalDispatcher.1")];
        if (d && typeof d.close === "function") await d.close();
    } catch { /* no pool, or a node that keeps it somewhere else: steps 2 and 3 still do their work */ }

    // 2. the sockets the server itself is holding. closeAllConnections lands in node 18.2; closeIdleConnections
    //    is the narrower sibling. Neither existing is not an error -- an older node simply has nothing here to
    //    destroy through this door. UNPROVEN ON LINUX -- see the measurement above.
    try { if (typeof srv.closeAllConnections === "function") srv.closeAllConnections(); } catch {}
    try { if (typeof srv.closeIdleConnections === "function") srv.closeIdleConnections(); } catch {}

    // 3. the listener.
    await new Promise((resolve) => { try { srv.close(resolve); } catch { resolve(); } });

    // 4. *** AND THEN LET LIBUV ACTUALLY FINISH. THIS IS THE STEP THAT FIXES THE CRASH -- the only one of the
    //    four that a sabotage run could catch. ***
    //
    // Steps 1-3 all resolve while the handles are still listed. Measured, immediately after close() resolved:
    //
    //     immediately      : Server,Socket,Socket
    //     after immediate 1: Server,Socket,Socket
    //     after immediate 2: (none)
    //
    // TWO LOOP TURNS. close() and destroy() only REQUEST a close; libuv finishes it on a later turn, and
    // `!(handle->flags & UV_HANDLE_CLOSING)` is the assert for touching a handle inside exactly that window.
    // So process.exit() one turn too early is the bug, and "await the close" was never enough on its own --
    // which is why every gate with this shape looked correct.
    //
    // BOUNDED, because a teardown helper that can hang is a worse gate than one that crashes: at least a crash
    // says something. If something is genuinely stuck the loop gives up and the caller's own liveHandles()
    // assertion reports WHAT is stuck, by name.
    for (let i = 0; i < 20 && liveHandles().length > 0; i++) {
        await new Promise((r) => setImmediate(r));
    }
}

/**
 * What is still holding this process open. Returned rather than printed so a GATE CAN ASSERT ON IT, which is
 * the difference between fixing this once and noticing when it comes back.
 *
 * *** STDIO IS EXCLUDED BY IDENTITY, NOT BY CLASS NAME, AND THE FIRST VERSION GOT THAT WRONG. ***
 * It filtered out WriteStream/ReadStream/Pipe/TTY, which is what stdio looks like on a terminal -- and this
 * gate's stdout is a PIPE, where node hands you a net.Socket instead. So two Sockets sat in the list from
 * before the gate had created anything, and the fixed teardown still read as a leak of two sockets. Measured
 * by probing the handle list at module load, BEFORE the server existed:
 *
 *     [hb] before createServer: Socket,Socket
 *
 * A NAME IS NOT AN IDENTITY. The three std streams are compared by object, and by their underlying _handle,
 * because on some platforms the stream is a wrapper and the handle is what lands in the list.
 */
/**
 * *** WAIT FOR SPAWNED CHILDREN TO ACTUALLY DIE, WHICH A LOOP DRAIN CANNOT DO. ***
 *
 * shutdownServer()'s step 4 drains libuv by yielding TURNS of the event loop, and for sockets that is enough --
 * the measurement in this file shows a Server and two Sockets present at turn 1 and gone by turn 2. A CHILD
 * PROCESS IS NOT LIKE THAT. kill() sends a signal to another program; that program is then scheduled by the
 * OPERATING SYSTEM, runs its own exit path, and is reaped some real number of milliseconds later. No quantity
 * of setImmediate ticks makes that happen sooner, so a teardown built only from loop turns reports a live
 * ChildProcess no matter how long it spins.
 *
 * This waits on a real timer instead, bounded, and RETURNS WHAT IS STILL THERE rather than throwing -- a
 * teardown that hangs is worse than one that reports honestly, which is the same argument step 4 makes about
 * its own 20-turn cap.
 *
 * *** MEASURED, AND THE TURN DRAIN REALLY IS NOT ENOUGH -- ON LINUX, NEVER MIND WINDOWS. *** Section 5 of the
 * gate beside this file spawns a real child, kills it, yields TWENTY loop turns, and the ChildProcess is STILL
 * LIVE; drainChildren then clears it in 26ms. So this is not a Windows workaround taken on faith -- the gap it
 * fills is demonstrable on the box that could not reproduce the original failure.
 *
 * WHAT IS STILL UNPROVEN IS THAT IT CLOSES *THAT* FAILURE. bz/tools/bz-bridge-selfcheck.mjs went red on Keith's
 * Windows rig with "STILL LIVE: Socket, Socket, ChildProcess" after a perfect 115/0 scoreline, and the same gate
 * on this box is GREEN -- children reaped, exit 0 -- because enough wall-clock passes there between the kill and
 * the check for the OS to reap them anyway. Windows has no SIGTERM (child.kill() is TerminateProcess) and the
 * child's stdio pipes are separate handles closing on their own schedule, so the rig may still linger past any
 * budget. THE GATE'S OWN OUTPUT ON THE RIG IS WHAT SETTLES IT. The precedent is directly above: steps 1 and 2 of
 * shutdownServer are kept for a Windows crash this measurement cannot reach and are explicitly not called the fix.
 *
 * @returns { drained, ms, still } -- `still` names the handle classes that outlasted the budget
 */
export async function drainChildren(budgetMs = 4000, pollMs = 25) {
    const start = Date.now();
    const lingering = () => liveHandles().filter((n) => n === "ChildProcess" || n === "Socket");
    for (;;) {
        const still = lingering();
        if (!still.length) return { drained: true, ms: Date.now() - start, still: [] };
        if (Date.now() - start >= budgetMs) return { drained: false, ms: Date.now() - start, still };
        await new Promise((r) => setTimeout(r, pollMs));
    }
}

export function liveHandles() {
    let h = [];
    try { h = process._getActiveHandles ? process._getActiveHandles() : []; } catch { return []; }
    const std = new Set();
    for (const s of [process.stdout, process.stderr, process.stdin]) {
        if (!s) continue;
        std.add(s);
        try { if (s._handle) std.add(s._handle); } catch {}
        try { if (s.fd !== undefined && s._stream) std.add(s._stream); } catch {}
    }
    return h
        .filter((x) => !std.has(x))
        .map((x) => (x && x.constructor && x.constructor.name) || "unknown")
        // still drop the terminal shapes: on a TTY these are the same streams under different classes
        .filter((n) => n !== "WriteStream" && n !== "ReadStream" && n !== "Pipe" && n !== "TTY");
}
