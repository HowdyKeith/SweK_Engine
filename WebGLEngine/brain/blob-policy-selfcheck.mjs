// brain/blob-policy-selfcheck.mjs -- does a trained policy actually survive a restart?
//
// It did not. Not because saving was broken -- because the command that saves DID NOT EXIST. blobTrainer.mjs's own
// header said "Run: node brain/blobTrainer.mjs --save", and that command loaded the module, defined its functions,
// and exited with status zero. Silently. Successfully. The --save flag was a property of an options object that no
// code path ever constructed, because nothing ever called trainAndOffer(). A documented feature reachable only by
// someone who opened the file and wrote their own caller -- and the clean exit code meant it never looked broken.
//
// That is the v2477 prose problem in work boots: prose promising something the code does not do. There it was a
// comment claiming a property. Here it was a comment claiming a COMMAND.
//
// So this check does the only thing that settles it: train, save, and then read it back FROM A DIFFERENT PROCESS.
// Anything less tests the cache, not the disk. And it runs against BRAIN_STATE_DIR so it can never touch the real
// weights on Keith's rig.
"use strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const rows = [];
const ok = (name, pass, detail) => rows.push({ name, pass, detail });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-brain-"));
const env = { ...process.env, BRAIN_STATE_DIR: dir };
const file = path.join(dir, "blob_policy.json");
const run = (args) => execFileSync(process.execPath, [path.join(HERE, "blobTrainer.mjs"), ...args], { env, encoding: "utf8" });

try {
    // 1. the CLI must EXIST -- this is the whole bug
    const dry = run(["--iters", "60"]);
    ok("the documented command actually does something", /HELD-OUT score/.test(dry), dry.split("\n")[1] || "");

    // 2. a dry run must not write. A trainer that saves when you did not ask is worse than one that never saves.
    ok("a dry run leaves the disk alone", !fs.existsSync(file), fs.existsSync(file) ? "IT WROTE ANYWAY" : "nothing on disk");

    // 3. --save must land
    const saved = run(["--iters", "60", "--save"]);
    ok("--save reaches the disk", fs.existsSync(file) && /ACCEPTED/.test(saved), fs.existsSync(file) ? "written" : "still nothing");

    // 4. THE POINT: a DIFFERENT PROCESS must get the weights back. Reading them in this one would test the cache.
    const back = execFileSync(process.execPath, ["-e",
        'const s=require(' + JSON.stringify(path.join(HERE, "blobPolicyStore.js")) + ').serve();' +
        'process.stdout.write(s.source+"|"+(s.weights?s.score.toFixed(5):"none"))'], { env, encoding: "utf8" });
    const [source, score] = back.split("|");
    ok("weights survive a restart", source === "learned" && score !== "none", source + ", held-out " + score);

    // 5. the store must not be a doormat: a worse policy has to be refused, or training is a random walk
    const worse = run(["--iters", "8", "--seed", "777", "--save"]);
    ok("a worse policy is refused", /REFUSED/.test(worse) || /kept the better/.test(worse),
       (worse.match(/REFUSED:.*/) || ["accepted a worse one"])[0].slice(0, 70));
    // 6. THE AUDIT SET MUST HAVE NO VOTE. This is the safety-critical property of the whole self-training idea:
    //    the moment the audit influences what gets KEPT, it stops being able to answer the question it exists for,
    //    and the loop can no longer tell whether it is improving or fooling itself. So: check that the policy the
    //    trainer holds is the held-out winner -- NOT the audit winner -- even when those disagree.
    const mod = await import("./blobAutoTrain.mjs");
    const t = mod.createAutoTrainer({ iters: 40, seed0: 7000 });
    for (let i = 1; i <= 14; i++) await t.attempt(i);
    let bestHeldRow = null, bestAuditRow = null;
    for (const h of t.history) {
        if (!bestHeldRow || h.held > bestHeldRow.held) bestHeldRow = h;
        if (!bestAuditRow || h.audit > bestAuditRow.audit) bestAuditRow = h;
    }
    const chosenByHeldOut = Math.abs(t.bestHeld - bestHeldRow.held) < 1e-12;
    ok("the audit set has no vote in what is kept", chosenByHeldOut,
       "kept the held-out winner (" + t.bestHeld.toFixed(5) + ")" +
       (bestAuditRow.i !== bestHeldRow.i ? "; the audit winner was attempt " + bestAuditRow.i + " and was NOT taken -- correct" : "; they agreed this run"));

    // 7. and regret must be a real measurement, not decoration: it is exactly the gap between the best audit ever
    //    seen and the audit of what is actually held. If they disagree it must be positive; if not, zero.
    const expect = Math.max(0, t.bestAuditEver - t.bestAudit);
    ok("regret measures what it claims", Math.abs(t.regret() - expect) < 1e-12,
       "regret " + t.regret().toFixed(5) + (t.regret() > 0 ? " -- it is holding something worse than it saw" : " -- what it holds is the best it saw"));
} finally {
    fs.rmSync(dir, { recursive: true, force: true });
}
const pass = rows.filter((r) => r.pass).length;
console.log("[blob-policy] " + pass + "/" + rows.length + " pass");
for (const r of rows) console.log("   " + (r.pass ? "PASS" : "FAIL") + "  " + r.name.padEnd(44) + " " + r.detail);
if (pass !== rows.length) process.exit(1);
export { rows };
