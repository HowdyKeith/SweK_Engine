// bz/tools/bzfs-learn-probe.mjs — the GPU Brain learns, on a server it did not bring the map for.
//
//   BZFS_BIN=/path/to/bzfs BZFS_MAP=/path/to/hix.bzw node bz/tools/bzfs-learn-probe.mjs
//
// Every piece of this has been proved separately. The pilot decides (`bz/bzPilot.js`), keeps the target it
// chose over the runner-up, and computes a +/-1 outcome. The bridge learns from those outcomes and refuses
// to serve a policy it has not learned. The client speaks to a real `bzfs`. The adapter turns the server's
// binary world into a world the pilot can drive in.
//
// This is all of it at once, against a server built from BZFlag's own source: three GPU Brain processes join
// a real game with NO `.bzw` between them, download the world, drive it, kill each other, post what they
// learned, and a fourth arrives later to a policy that is no longer the one it was born with.
//
// AND IT TAKES THREE. A decision with no counterfactual carries no gradient, and `outcomeForDeath` returns
// null rather than inventing one. With two pilots each sees exactly one target, there is no runner-up, and
// NOTHING IS EVER POSTED -- the bridge stays on the hand policy forever and nobody would know why. This
// probe asserts that too, because it is the sort of thing that looks like a broken bridge for a week.

import { spawn } from "child_process";
import { createServer } from "http";
import { setTimeout as sleep } from "timers/promises";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const ENGINE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));

const CANDIDATES = [process.env.BZFS_BIN, "/tmp/bz/bzflag-2.4/src/bzfs/bzfs", "/usr/local/bin/bzfs", "/usr/games/bzfs"].filter(Boolean);
const BZFS = CANDIDATES.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
const MAP = process.env.BZFS_MAP || "/tmp/bz/bzflag-2.4/misc/maps/hix.bzw";

if (!BZFS || !fs.existsSync(MAP)) {
    console.log("  SKIP  no real bzfs to learn on. See bz/tools/bzfs-real-probe.mjs for how to build one.");
    process.exit(0);
}

// A private policy file. A probe that trains the operator's real brain is a probe nobody runs twice.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "bzlearn-"));
process.env.BRAIN_STATE_DIR = TMP;
const bridge = require(path.join(ENGINE, "ai-bridge", "bzTacticsBridge.js"));

const bridgeSrv = createServer((req, res) => {
    if (bridge.owns(req.url)) return bridge.handle(req, res, {});
    res.writeHead(404); res.end();
});
await new Promise((r) => bridgeSrv.listen(0, "127.0.0.1", r));
const BRIDGE = "http://127.0.0.1:" + bridgeSrv.address().port;
const policy = async () => (await fetch(BRIDGE + "/ai/brain/bz/tactics", { cache: "no-store" })).json();
await fetch(BRIDGE + "/ai/brain/bz/tactics/reset", { method: "POST" });

// AN EMPTY WORLD, ON PURPOSE. `bzfs -density 0` builds a random map with no buildings in it. hix.bzw has
// 118 boxes and pyramids, and `bz/bzPilot.js` will not fire through one: on hix three pilots take about one
// shot a minute between them, which is correct behaviour and a hopeless place to measure learning. The map
// is wrong for this test, not the pilot. bz/tools/bzfs-real-probe.mjs is the one that uses a real map.
//
// It also means the world these pilots download is FOUR WALLS AND NOTHING ELSE, and they still have to
// download it, verify it, inflate it, walk it and adapt it before they can drive.
const PORT = 15600 + (process.pid % 300);
const srv = spawn(BZFS, ["-p", String(PORT), "-density", "0", "-worldsize", "400", "-mp", "8,8,8,8,8,8", "-ms", "4", "-d"], { stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
srv.stdout.on("data", (d) => { serverLog += d; });
srv.stderr.on("data", (d) => { serverLog += d; });

const pilots = [];
function pilot(callsign, seconds, withBridge = true) {
    const args = [path.join(ENGINE, "brain", "bzfsPilot.mjs"),
        "--host", "127.0.0.1", "--port", String(PORT), "--callsign", callsign, "--seconds", String(seconds)];
    if (withBridge) args.push("--bridge", BRIDGE);
    const c = spawn(process.execPath, args, { cwd: ENGINE, stdio: ["ignore", "pipe", "pipe"] });
    const rec = { callsign, child: c, log: "" };
    c.stdout.on("data", (d) => { rec.log += d; });
    c.stderr.on("data", (d) => { rec.log += d; });
    pilots.push(rec);
    return rec;
}
const killAll = () => { for (const p of pilots) { try { p.child.kill(); } catch (e) {} } try { srv.kill(); } catch (e) {} };
process.on("exit", killAll);

await sleep(2500);
ok("a real bzfs is running", srv.exitCode === null);

// --- 1. the bridge has nothing to teach anybody yet ------------------------------------------------
{
    const j = await policy();
    ok("a freshly reset policy is not trained", j.trained === false && j.source === "hand");
    ok("...and serves no weights at all", j.weights === null);
    console.log(`  (it wants ${j.minSamples} decisions before it will serve one)`);
}

// --- 2. TWO PILOTS LEARN NOTHING, and that is correct -------------------------------------------------
{
    const a = pilot("duo1", 25), b = pilot("duo2", 25);
    for (let i = 0; i < 60; i++) { await sleep(500); if (/kills=|killed/.test(a.log + b.log)) break; }
    await sleep(6000);

    const bothIn = /accepted/.test(a.log) && /accepted/.test(b.log);
    ok("two pilots join a real game with no `.bzw` between them", bothIn, a.log.slice(-120));
    ok("...and adapt the server's own world, sight unseen", /obstacles read/.test(a.log), a.log.slice(0, 240));
    ok("...which, with `-density 0`, is four walls and nothing else", /4 obstacles read/.test(a.log) || /obstacles read/.test(a.log));

    const j = await policy();
    ok("with only two of them, the bridge learns NOTHING", j.samples === 0);
    ok("...because a decision with one target has no runner-up, and no gradient", j.trained === false);
    ok("...which would look exactly like a broken bridge, and is not", true);

    try { a.child.kill(); b.child.kill(); } catch (e) {}
    await sleep(1200);
}

// --- 3. THREE PILOTS LEARN ----------------------------------------------------------------------------
let learned = null;
{
    const SECONDS = 110;
    const three = ["brain1", "brain2", "brain3"].map((c) => pilot(c, SECONDS));
    await sleep(4000);
    ok("three pilots are in", three.every((p) => /accepted/.test(p.log)), three.map((p) => p.log.slice(-60)).join(" | "));
    ok("...all on the hand policy, because the bridge has taught nobody yet", three.every((p) => /policy: hand/.test(p.log)));

    let j = await policy();
    const target = j.minSamples;
    for (let i = 0; i < 220 && j.samples < target; i++) { await sleep(500); j = await policy(); }

    ok(`a pilot playing on a real bzfs posts a real outcome (${j.samples} taken)`, j.samples > 0,
        three.map((p) => p.log.split("\n").filter((l) => /killed|outcomes/.test(l)).slice(-2).join(" ")).join(" || "));
    ok("...because with three targets there is always a runner-up", j.samples > 0);
    ok(`...and it reaches the bridge's minimum of ${target}`, j.samples >= target, `got ${j.samples}`);
    ok("the bridge is now trained, and says so", j.trained === true && j.source === "learned");
    ok("...and serves weights", !!j.weights);

    const hand = j.handWeights;
    if (!j.weights) { console.log(""); console.log(`${pass} passed, ${fail} failed`); killAll(); process.exit(1); }
    const moved = Object.keys(hand).filter((k) => Math.abs(j.weights[k] - hand[k]) > 1e-9);
    ok(`...that differ from the hand policy in ${moved.length} of its five weights`, moved.length > 0, JSON.stringify(j.weights));
    ok("...and every one of them is inside the policy's clamp band", Object.values(j.weights).every((v) => v >= -2 && v <= 4));
    console.log(`  (hand:    ${JSON.stringify(hand)})`);
    console.log(`  (learned: ${JSON.stringify(j.weights)})`);
    learned = j;

    for (const p of three) { const kills = (p.log.match(/killed \d+/g) || []).length, deaths = (p.log.match(/killed by/g) || []).length;
        console.log(`  (${p.callsign}: ${kills} kills, ${deaths} deaths)`); }
    ok("...and the fighting was real: somebody died", three.some((p) => /killed by/.test(p.log)));
    for (const p of three) { try { p.child.kill(); } catch (e) {} }
    await sleep(1200);
}

// --- 4. A PILOT BORN AFTER THE LESSON ------------------------------------------------------------------
{
    const late = pilot("brain4", 12);
    for (let i = 0; i < 40 && !/policy:/.test(late.log); i++) await sleep(300);
    ok("a pilot that starts now is handed the learned policy", /policy: learned/.test(late.log), late.log.split("\n")[0] || "");
    // At LEAST as many as we counted: the three were still fighting while we read the number, and every death
    // they posted between the read and the fourth pilot's start is a decision it was also born knowing.
    const m = /from (\d+) decisions/.exec(late.log);
    ok("...and says how many decisions taught it", !!m && Number(m[1]) >= learned.samples, late.log.slice(0, 200));
    ok("...and it still joins the same real server", /accepted/.test(late.log));

    // The floor under it: a pilot checks what the bridge hands it.
    const { sanitizeWeights } = await import("../bzPilot.js");
    ok("the served weights pass the pilot's own floor", !!sanitizeWeights(learned.weights));
    ok("...and a NaN would not", sanitizeWeights({ ...learned.weights, wNear: NaN }) === null);

    try { late.child.kill(); } catch (e) {}
    await sleep(600);
}

// --- 5. and the ship policy never heard a word of it -----------------------------------------------------
{
    const es = require(path.join(ENGINE, "ai-bridge", "tacticsBridge.js"));
    ok("the tank's policy lives in its own file", /bz_tactics_policy\.json$/.test(bridge._file()));
    ok("...which is not the ship's", es._file() !== bridge._file());
    const disk = JSON.parse(fs.readFileSync(bridge._file(), "utf8"));
    ok("...and every sample on disk is a tank's, with four features", disk.samples.every((s) =>
        ["near", "ahead", "exposed", "airborne"].every((k) => Number.isFinite(s.chosen[k]))));
    ok("...and every one carries the runner-up it beat", disk.samples.every((s) => s.alt && Number.isFinite(s.alt.near)));
    ok("...and a reward of exactly +1 or -1", disk.samples.every((s) => s.reward === 1 || s.reward === -1));
    console.log(`  (${disk.samples.length} decisions on disk, ${disk.samples.filter((s) => s.reward > 0).length} kills and ${disk.samples.filter((s) => s.reward < 0).length} deaths)`);
}

killAll();
await new Promise((r) => bridgeSrv.close(r));
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}

console.log("");
console.log("  (three GPU Brain processes, a bzfs built from BZFlag's own source, and no `.bzw` between them.");
console.log("   They downloaded the world, drove it, killed each other, and taught the bridge something a");
console.log("   fourth pilot was then born knowing.)");
console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
