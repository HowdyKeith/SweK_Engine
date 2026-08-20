// ai-bridge/tools/rocket-bridge-selfcheck.mjs -- v2217 -- proves rocketBridge headlessly.
//
// Asserts the route surface, the RCE-safe validation (params + meshes path), and -- the
// real one -- that the EXECUTE path actually spawns brain/rl/rocketLoop.mjs on the stub
// backend and produces training output. No GPU, no RocketSim, no meshes.
//
//   node ai-bridge/tools/rocket-bridge-selfcheck.mjs

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const bridge = require(path.join(HERE, "..", "rocketBridge.js"));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { (cond ? pass++ : fail++); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -- " + extra : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// -------------------------------------------------------------- 1. route ownership
ok("owns /rocket/status", bridge.owns("/rocket/status"));
ok("owns /rocket/train/start with query", bridge.owns("/rocket/train/start?x=1"));
ok("does NOT own an unrelated route", !bridge.owns("/es/status"));

// -------------------------------------------------------------- 2. train param validation
ok("rejects unknown backend", bridge.validateTrain({ backend: "wat", iters: 5, pairs: 4, episodes: 1 }).ok === false);
ok("rejects iters out of range", bridge.validateTrain({ backend: "stub", iters: 99999, pairs: 4, episodes: 1 }).ok === false);
ok("rejects pairs < 2", bridge.validateTrain({ backend: "stub", iters: 5, pairs: 1, episodes: 1 }).ok === false);
ok("rejects episodes out of range", bridge.validateTrain({ backend: "stub", iters: 5, pairs: 4, episodes: 99 }).ok === false);
ok("rejects a save path escaping the engine dir", bridge.validateTrain({ backend: "stub", iters: 5, pairs: 4, episodes: 1, save: "../../etc/passwd" }).ok === false);
ok("rejects a save path with shell chars", bridge.validateTrain({ backend: "stub", iters: 5, pairs: 4, episodes: 1, save: "a;rm -rf b" }).ok === false);
ok("accepts a valid stub config", bridge.validateTrain({ backend: "stub", iters: 5, pairs: 4, episodes: 1 }).ok === true);
ok("rocketsim refused until prepared", bridge.validateTrain({ backend: "rocketsim", iters: 5, pairs: 4, episodes: 1 }).ok === false);

// -------------------------------------------------------------- 3. meshes-path safety
ok("setMeshes rejects '..'", bridge.setMeshes("/tmp/../etc").ok === false);
ok("setMeshes rejects shell chars", bridge.setMeshes("/tmp/$(reboot)").ok === false);
ok("setMeshes rejects a nonexistent folder", bridge.setMeshes("/definitely/not/here/xyz").ok === false);
{
  // a real file is NOT a folder
  const f = path.join(os.tmpdir(), "rlmesh-selfcheck-" + Date.now() + ".txt");
  fs.writeFileSync(f, "x");
  ok("setMeshes rejects a file (must be a folder)", bridge.setMeshes(f).ok === false);
  fs.unlinkSync(f);
  // a real dir is accepted
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "rlmesh-"));
  const r = bridge.setMeshes(d);
  ok("setMeshes accepts a real folder", r.ok === true && r.meshes === d);
  fs.rmSync(d, { recursive: true, force: true });
}

// -------------------------------------------------------------- 4. EXECUTE path: real stub run
{
  const start = bridge.startTrain({ backend: "stub", iters: 3, pairs: 4, episodes: 1 });
  ok("startTrain launches the stub loop", start.ok === true && !!start.pid, start.command);

  // wait for the child to finish (or time out)
  let st = bridge.status(), waited = 0;
  while (st.train && st.train.running && waited < 30000) { await sleep(300); waited += 300; st = bridge.status(); }

  ok("training run finished", st.train && st.train.running === false, `exited=${st.train && st.train.exited}`);
  ok("exit code was 0", st.train && st.train.exited === 0);

  const out = bridge.output();
  const hasBase = out.log.some(l => /\[rl-es\]/.test(l) && /base=/.test(l));
  ok("captured [rl-es] training output with base= lines", hasBase, `${out.log.length} log lines`);
  ok("status parsed a baseline and a latest iteration", st.train.baseline != null && st.train.latest != null,
     `baseline=${st.train.baseline} latest=${st.train.latest && st.train.latest.iter}`);
  ok("status delta is finite", st.train.delta == null || Number.isFinite(st.train.delta), `delta=${st.train.delta}`);
}

// a second start while one is done is fine; a stop on nothing is a no-op
ok("stopTrain on finished run is a no-op ok", bridge.stopTrain().ok === true);

console.log(`\n${pass} passed, ${fail} failed`);
bridge.shutdown();
process.exit(fail ? 1 : 0);
