// tools/verify-all.mjs -- v65: the ship ritual's SINGLE entry point.
// Runs every check IN ORDER, runs ALL of them even after a red (a
// ship wants the full damage report, not the first casualty), exits
// nonzero if any failed. --quiet passes through to the steps that
// speak it. Wire into verify.mjs with ONE line:
//     execSync("node tools/verify-all.mjs --quiet", {stdio:"inherit"});
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const here = dirname(fileURLToPath(import.meta.url));
const quiet = process.argv.includes("--quiet") ? " --quiet" : "";
const steps = [
  ["lint-docs",      `node "${join(here, "lint-docs.mjs")}"`],
  ["verify:report",  `node "${join(here, "verify-step-report.mjs")}"${quiet}`],
  ["verify:console", `node "${join(here, "verify-step-console.mjs")}"${quiet}`],
  // v75 -- the freshness gate, run at last (liveness-gated inside the
  // step: no SHIP.md -> SKIP). NOTE, by design: adding this step
  // CHANGES the manifest, so the first --check after this update
  // rightly reports any existing SHIP.md stale -- the gate catches
  // its own arrival; rerun --write once.
  ["verify:shipmd",  `node "${join(here, "verify-step-shipmd.mjs")}"`],
];
// v66 -- --dry-run: list the steps, touch nothing (symmetry with the
// flip script; three lines, as priced)
if (process.argv.includes("--dry-run")) {
  for (const [name, cmd] of steps) console.log(`[dry] would run ${name}: ${cmd}`);
  process.exit(0);
}
// v67 -- --manifest: the steps array IS the ship ritual's true
// manifest; export it as JSON so SHIP.md generators QUOTE it instead
// of paraphrasing it (paraphrases rot; data does not)
if (process.argv.includes("--manifest")) {
  console.log(JSON.stringify(steps.map(([name, cmd]) => ({ name, cmd })), null, 2));
  process.exit(0);
}
let reds = [];
const times = [], secs = [];
for (const [name, cmd] of steps) {
  const t0 = Date.now();   // v66 -- per-step wall time: a step suddenly
  try { execSync(cmd, { stdio: "inherit" }); }   // 10x slower is a finding
  catch { reds.push(name); }                     // even when green
  secs.push((Date.now() - t0) / 1000);
  times.push(`${name} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
console.log(`[verify-all] timing: ${times.join(" | ")}`);
// v67 -- timing HISTORY: one line per run into a 200-ring, and the
// 10x-slower finding operationalized: with 5+ historical runs, a step
// past 3x its own MEDIAN gets a warning -- even when green. Threshold
// stated: 3x median, not mean (one slow outlier must not poison the
// baseline it is measured against).
try {
  const fsT = await import("fs");
  // v70 -- the threshold knob (tools/verify_config.json, default 3);
  // the chart reads the same file -- one knob, two consumers, zero
  // import coupling across runtimes
  let warnX = 3, minRuns = 5;   // v72 -- the 5-run floor was the second
  try {                          // hardcode-in-two-places; same knob treatment
    const cfg72 = JSON.parse(fsT.readFileSync(join(here, "verify_config.json"), "utf-8"));
    warnX = Number(cfg72.warnFactor) || 3;
    minRuns = Number(cfg72.warnMinRuns) || 5;
  } catch {}
  const TP = join(here, "verify_timing.json");
  let hist = []; try { hist = JSON.parse(fsT.readFileSync(TP, "utf-8")); } catch {}
  for (let i = 0; i < steps.length; i++) {
    const prior = hist.map(h => h.steps?.[steps[i][0]]).filter(x => typeof x === "number").sort((a, b) => a - b);
    if (prior.length >= minRuns) {
      const med = prior[(prior.length / 2) | 0];
      if (med > 0 && secs[i] > warnX * med)
        console.warn(`[verify-all] TIMING WARN: ${steps[i][0]} took ${secs[i].toFixed(1)}s vs median ${med.toFixed(1)}s (>${warnX}x) -- a finding even when green`);
    }
  }
  hist.push({ ts: Date.now(), green: reds.length === 0, steps: Object.fromEntries(steps.map(([n], i) => [n, Math.round(secs[i] * 10) / 10])) });
  if (hist.length > 200) hist = hist.slice(-200);
  fsT.writeFileSync(TP, JSON.stringify(hist));
} catch {}
if (reds.length) { console.error(`[verify-all] RED: ${reds.join(", ")} failed`); process.exit(1); }
console.log("[verify-all] GREEN: every check passed");
