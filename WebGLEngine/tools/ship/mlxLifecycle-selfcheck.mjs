// WebGLEngine/tools/ship/mlxLifecycle-selfcheck.mjs -- v4037
// ---------------------------------------------------------------------------------------------------------------
// GATES ai-bridge/mlxInstallBridge.js's new pieces: pullModel(), ensureRunning(), touch()/managedStatus(),
// stopManaged(), and _shouldReap(). None of this can run for real here -- no Mac, no pip, no gigabyte download --
// so every check drives the pure decision logic and the injected-spawn/fetch seams directly, the same shape
// tools/ship/ollamaReadiness-selfcheck.mjs already uses for a real server it also cannot start.
//
// WHAT WOULD HAVE SHIPPED WRONG WITHOUT THIS: a remote base (the Mac reached over the LAN, this file's own
// documented OTHER use of the panel) silently spawning nothing is the correct behaviour -- but "correct" and
// "untested" look identical in a diff, and a later refactor that accidentally dropped the isLocalBase() guard
// would have this bridge trying (and failing loudly, or worse, succeeding) to launch a process on a machine it
// is not running on. Same for the idle reaper: _shouldReap is the one line that decides whether ten minutes of
// silence frees a loaded model's RAM or leaks it forever, and a real test has to fake the clock to check it in
// under a second rather than actually waiting ten minutes.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import * as mlx from "../../ai-bridge/mlxInstallBridge.js";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };

console.log("mlxLifecycle-selfcheck -- weights download, on-demand start, idle auto-exit\n");

console.log("1. _isLocalBase -- ONLY THE MACHINE THIS BRIDGE ITSELF RUNS ON EVER GETS A SPAWN");
{
    ok("127.0.0.1 is local", mlx._isLocalBase("http://127.0.0.1:8080"));
    ok("localhost is local", mlx._isLocalBase("http://localhost:8080"));
    ok("!! a LAN IP is NOT local -- the documented other use of this panel", !mlx._isLocalBase("http://192.168.1.42:8080"),
       "Keith's other use of this panel is pointing an engine on a DIFFERENT machine at a Mac reachable over the LAN");
    ok("!! a bare hostname is NOT local", !mlx._isLocalBase("http://galaxina:8080"));
    ok("a malformed URL is NOT local (fails closed, not open)", !mlx._isLocalBase("not a url"));
}

console.log("\n2. _shouldReap -- PURE, SO THE IDLE WINDOW IS CHECKED WITHOUT WAITING IT OUT");
{
    const IDLE = 600000;   // 10 minutes, this file's own default
    ok("no managed process -> never reaps", mlx._shouldReap(null, Date.now(), IDLE) === false);
    const fresh = { lastUsedAt: Date.now() };
    ok("just touched -> not yet", mlx._shouldReap(fresh, Date.now(), IDLE) === false);
    ok("just under the limit -> not yet", mlx._shouldReap(fresh, fresh.lastUsedAt + IDLE - 1000, IDLE) === false);
    ok("!! just over the limit -> REAPS", mlx._shouldReap(fresh, fresh.lastUsedAt + IDLE + 1000, IDLE) === true);
    ok("exactly at the limit -> not yet (strictly greater-than, not >=)", mlx._shouldReap(fresh, fresh.lastUsedAt + IDLE, IDLE) === false);
}

console.log("\n3. pullModel -- INSTALLS mlx-lm ONLY IF MISSING, THEN A ONE-LINE PYTHON FETCH");
{
    // fake spawn: records the command it was given and resolves as if python exited 0 having printed the marker
    function fakeSpawn(cmd, args) {
        const ee = { stdout: { on(ev, cb) { if (ev === "data") setTimeout(() => cb("MLX_PULL_OK\n"), 0); } },
                     stderr: { on() {} },
                     on(ev, cb) { if (ev === "close") setTimeout(() => cb(0), 5); },
                     kill() {} };
        fakeSpawn.lastCmd = cmd; fakeSpawn.lastArgs = args;
        return ee;
    }
    const alreadyInstalled = async () => true;   // pullModel's own "mlx_lm.server already on PATH" branch
    const r = await mlx.pullModel("mlx-community/Qwen2.5-1.5B-Instruct-4bit", { spawnImpl: fakeSpawn, whichImpl: alreadyInstalled, _isMac: true });
    ok("succeeds when python reports the marker and exits 0", r.ok === true, JSON.stringify(r).slice(0, 120));
    ok("spawns python3 -c, not a shell string (no injection surface)", fakeSpawn.lastCmd === "python3" && fakeSpawn.lastArgs[0] === "-c");
    ok("the model id is passed through JSON.stringify, not string-concatenated", fakeSpawn.lastArgs[1].includes(JSON.stringify("mlx-community/Qwen2.5-1.5B-Instruct-4bit")));
    ok("!! model pulls refuse outright on a non-mac platform (the real, unfaked gate)", (await mlx.pullModel("owner/name", { spawnImpl: fakeSpawn })).supported === false,
       "this selfcheck's other cases pass _isMac:true explicitly; this one leaves the real platform check in place");
    ok("!! a model id is REJECTED before any spawn if it is not owner/name", (await mlx.pullModel("../etc/passwd", { spawnImpl: fakeSpawn, whichImpl: alreadyInstalled, _isMac: true })).ok === false);
    ok("a blank model id falls back to the shipped default, not an empty string", (await (async () => {
        const r2 = await mlx.pullModel("", { spawnImpl: fakeSpawn, whichImpl: alreadyInstalled, _isMac: true });
        return r2.ok && fakeSpawn.lastArgs[1].includes(mlx.DEFAULT_QWEN_MODEL);
    })()));
    function fakeSpawnFails(cmd, args) {
        const ee = { stdout: { on() {} }, stderr: { on(ev, cb) { if (ev === "data") setTimeout(() => cb("some python traceback\n"), 0); } },
                     on(ev, cb) { if (ev === "close") setTimeout(() => cb(1), 5); }, kill() {} };
        return ee;
    }
    const bad = await mlx.pullModel("mlx-community/does-not-exist-4bit", { spawnImpl: fakeSpawnFails, whichImpl: alreadyInstalled, _isMac: true });
    ok("!! a nonzero exit is a failure even with no MLX_PULL_OK printed", bad.ok === false);
    ok("!! mlx_lm NOT on PATH -> the real install() path runs and its failure propagates (no fake install here)",
       (await mlx.pullModel("owner/name", { spawnImpl: fakeSpawn, whichImpl: async () => false, _isMac: true })).ok === false,
       "install() is gated on the REAL platform check (untouched by _isMac above), so on this box it fails honestly rather than silently proceeding to spawn a preload for a tool that was never actually confirmed installed");
}

console.log("\n4. ensureRunning -- ON-DEMAND, GATED, AND NEVER THROWS");
{
    const fetchUp = async () => ({ ok: true, json: async () => ({ data: [{ id: "m" }] }) });
    const fetchDown = async () => { throw new Error("ECONNREFUSED"); };

    ok("!! on-demand start refuses outright on a non-mac platform (the real, unfaked gate)",
       (await mlx.ensureRunning("http://127.0.0.1:8080", "x", { fetchImpl: fetchDown, spawnImpl: () => {} })).supported === false);

    ok("already running (probe succeeds) -> no spawn attempted", (await (async () => {
        let spawned = false;
        const r = await mlx.ensureRunning("http://127.0.0.1:8080", "x", { fetchImpl: fetchUp, spawnImpl: () => { spawned = true; }, _isMac: true });
        return r.ok === true && r.alreadyRunning === true && spawned === false;
    })()));

    ok("!! a remote base is SKIPPED, not spawned into -- even when nothing answers", (await (async () => {
        let spawned = false;
        const r = await mlx.ensureRunning("http://192.168.1.42:8080", "x", { fetchImpl: fetchDown, spawnImpl: () => { spawned = true; }, _isMac: true });
        return r.ok === false && r.skipped === true && spawned === false;
    })()));

    ok("a spawn failure (binary missing) is reported, not thrown", (await (async () => {
        const throwing = () => { throw new Error("ENOENT"); };
        const r = await mlx.ensureRunning("http://127.0.0.1:8080", "x", { fetchImpl: fetchDown, spawnImpl: throwing, _isMac: true });
        return r.ok === false && /spawn/.test(r.error || "");
    })()));
}

console.log("\n5. managedStatus / touch / stopManaged -- REPORTED HONESTLY, KILLED AS A GROUP");
{
    // ensureRunning leaves _managed set after a spawn that never becomes ready (the timeout branch) -- drive
    // that path with a fetch that never succeeds and a tiny synthetic wait, then check status/stop against it.
    // The 90s real poll window is not something a gate should sit through, so this section checks the STATE
    // ensureRunning's spawn sets up (via managedStatus/stopManaged) using a spawn stub, not a full ensureRunning
    // call -- managedStatus/touch/stopManaged are exercised through the module's real (shared) _managed slot by
    // reaching it the only way this module exposes: another ensureRunning call whose fetch resolves immediately.
    let killedPid = null, killedSignal = null;
    const realKill = process.kill;
    process.kill = (pid, sig) => { killedPid = pid; killedSignal = sig; };
    try {
        function fakeSpawnServer() {
            return { pid: 4242, stdout: { on() {} }, stderr: { on() {} }, on() {}, kill() {} };
        }
        // first call: nothing answers immediately, so ensureRunning spawns; give the readiness poll a fetch that
        // succeeds on the FIRST poll so this returns fast rather than waiting the full window.
        let calls = 0;
        const fetchSoonUp = async () => { calls++; if (calls === 1) throw new Error("down"); return { ok: true, json: async () => ({ data: [] }) }; };
        const r = await mlx.ensureRunning("http://127.0.0.1:8080", "mlx-community/Qwen2.5-1.5B-Instruct-4bit", { fetchImpl: fetchSoonUp, spawnImpl: fakeSpawnServer, _isMac: true });
        ok("spawns and reports started once the poll sees it come up", r.ok === true && r.started === true, JSON.stringify(r));
        const st = mlx.managedStatus();
        ok("managedStatus reports the pid + model it just spawned", st.managed === true && st.pid === 4242 && st.model === "mlx-community/Qwen2.5-1.5B-Instruct-4bit");
        ok("idleMs starts near zero (just touched by the successful poll)", st.idleMs < 5000, "idleMs=" + st.idleMs);
        const stopped = mlx.stopManaged("test");
        ok("!! stopManaged kills the NEGATIVE pid -- the whole detached process group, not just the parent", killedPid === -4242 && killedSignal === "SIGTERM");
        ok("stopManaged reports wasRunning true and clears the slot", stopped.wasRunning === true && mlx.managedStatus().managed === false);
        ok("stopManaged on an already-clear slot is a harmless no-op", mlx.stopManaged("test2").wasRunning === false);
    } finally { process.kill = realKill; }
}

console.log("\n6. install()/uninstall() -- SYMMETRIC, AND NEITHER SPAWNS A COMMAND THAT WAS NEVER INVOLVED");
{
    function fakeSpawnOk() {
        return { stdout: { on() {} }, stderr: { on() {} }, on(ev, cb) { if (ev === "close") setTimeout(() => cb(0), 0); }, kill() {} };
    }
    const inst = await mlx.install("mlx-lm", { spawnImpl: fakeSpawnOk, _isMac: true });
    ok("install() succeeds against a fake pip that exits 0", inst.ok === true, JSON.stringify(inst).slice(0, 100));
    ok("...running the catalog's own pip install line", inst.cmd === "pip3 install -U mlx-lm");
    const uninst = await mlx.uninstall("mlx-lm", { spawnImpl: fakeSpawnOk, _isMac: true });
    ok("!! uninstall() succeeds against a fake pip that exits 0", uninst.ok === true, JSON.stringify(uninst).slice(0, 100));
    ok("...running the MIRROR command, not a second copy of the install line", uninst.cmd === "pip3 uninstall -y mlx-lm");
    const noCmd = await mlx.uninstall("turbofieldfare", { spawnImpl: () => { throw new Error("must not be called"); }, _isMac: true });
    ok("!! turbofieldfare's uninstall names the real removal step and never spawns anything",
       noCmd.ok === false && noCmd.uninstallable === false && /clone/.test(noCmd.error));
    ok("!! and the same is true of install(), for the identical reason", (await mlx.install("turbofieldfare", { spawnImpl: () => { throw new Error("must not be called"); }, _isMac: true })).installable === false);
    ok("!! both refuse outright on a non-mac platform (the real, unfaked gate)",
       (await mlx.install("mlx-lm")).supported === false && (await mlx.uninstall("mlx-lm")).supported === false);
    const cat = mlx.catalog();
    ok("catalog() reports uninstallable per entry, not just installable", cat.items.every((it) => "uninstallable" in it));
    const tff = cat.items.find((it) => it.id === "turbofieldfare");
    ok("...and turbofieldfare specifically reads uninstallable:false with a note", tff && tff.uninstallable === false && /clone/.test(tff.uninstallNote || ""));
}

console.log(fails ? `\nmlxLifecycle-selfcheck: ${fails} FAILED` : "\nmlxLifecycle-selfcheck: all checks pass");
if (fails) process.exit(1);
