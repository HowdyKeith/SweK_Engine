#!/usr/bin/env node
// tools/ship/verify.mjs — the HARD-FAIL gate that must pass before a build is zipped + present_files'd.
//
// Every one of the documented shipping failures would have been caught here:
//   - v1603 "old code wearing a new label": the version-marker check fails if main.js's ENGINE_VERSION
//     doesn't match the --version we claim to be shipping.
//   - v1806 nested EngineProject fork riding the cp chain into the zip: the nested-fork check fails if any
//     EngineProject_v* directory exists inside the tree.
//   - emoji-blanked BACKLOG.md: the changelog-nonempty check fails if BACKLOG.md/TODO.md are empty.
// Plus the routine correctness checks (syntax, HTML div balance) so a broken build can't reach present_files.
//
// USAGE (run from the WebGLEngine root of the tree you're about to ship):
//   node tools/ship/verify.mjs --version v1980 [--markers "SweK Dictate,/dictate/type"] [--zip /path/to.zip]
// Exit 0 = all green (safe to ship). Exit 1 = STOP, do not ship. Prints a checklist with pass/fail per line.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }
const version = arg("--version");
const markers = (arg("--markers") || "").split(",").map(s => s.trim()).filter(Boolean);
const zipPath = arg("--zip");

let fails = 0;
function check(label, ok, detail) {
  const tag = ok ? "PASS" : "FAIL";
  console.log(`[verify] ${tag}  ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) fails++;
}

// 1. version marker matches what we claim
if (version) {
  let mv = null;
  try { mv = (fs.readFileSync("main.js", "utf8").match(/const ENGINE_VERSION = "(v\d+)"/) || [])[1]; } catch {}
  check(`version marker: main.js says ${mv || "?"} , shipping ${version}`, mv === version, mv === version ? "" : "MISLABELED BUILD — bump main.js or fix --version");
} else {
  check("version marker", false, "no --version given");
}

// 1b. the brain's build marker must agree with the engine's. v2452 -- BRAIN_BUILD sat at "v2408" while the engine
// shipped forty-plus versions past it, so every brain log line announced a build that had not existed for months.
// Nothing gated on it, which is exactly why it drifted: a number nobody checks is a number that quietly lies.
if (version) {
  let bb = null;
  try { bb = (fs.readFileSync("brain/brain.js", "utf8").match(/BRAIN_BUILD = "(v\d+)"/) || [])[1]; } catch {}
  check(`brain build marker: brain.js says ${bb || "?"} , shipping ${version}`, bb === version,
        bb === version ? "" : "BRAIN_BUILD is stale — it will announce the wrong build in every log line");
}

// 1d. DERIVED FACTS, v2976. A MARKER is a string someone types; a DERIVED FACT is a number that describes the
// tree. Both rot, but the second is more insidious -- nothing about editing a physics file suggests you should go
// and renumber a page. v2975 shipped with THREE stale facts and only ONE was caught, because the other two are
// gated inside the 457-gate suite that is too slow to run every ship. The checks were right, present, and never
// consulted. These cost 48ms, so they run here instead, forever.
try {
    const { stalenessRows } = await import("./staleness.mjs");
    for (const r of stalenessRows()) {
        check(`derived fact: ${r.id} claims ${r.claimed}, actual ${r.actual}`, r.ok, r.ok ? "" : r.why);
    }
    // v2999 -- three MORE derived facts, found by a rig run rather than by this module. "Derived fact" is a
    // CLASS and v2976 enumerated instances, so the check found what it was told to look for and nothing else.
    const { asyncStalenessRows } = await import("./staleness.mjs");
    for (const r of await asyncStalenessRows()) {
        check(`derived fact: ${r.id} claims ${r.claimed}, actual ${r.actual}`, r.ok, r.ok ? "" : r.why);
    }
} catch (e) {
    check("derived facts could be read at all", false, String((e && e.message) || e));
}

// 1f. UNBOUND BUILTINS, v3034. A module used inside a platform-specific branch and never imported is a crash
// that only fires on that platform -- Keith's Windows rig threw ReferenceError: os is not defined from a branch
// no Linux run evaluates. The scan is static, so it has the same answer everywhere, and it belongs in the gate
// that runs every time rather than the suite that takes minutes.
try {
    const { scan } = await import("./unboundBuiltin.mjs");
    const KNOWN = [["kpopFavorites.js", "url"]];   // a LOCAL variable named url; named, not wildcarded
    // v3678 -- "." IS THE PAGE ROOT AND IT IS NEW HERE. unboundBuiltin now admits .html (script bodies only) and
    // this is the directory the 379 pages live in, so the rule finally reaches the INLINE SCRIPT version of the
    // defect it was written for: a page reaching for fs or path crashes the moment it opens, on every platform,
    // with nothing to catch it. MEASURED BEFORE WIDENING: zero of the ten names is used as a namespace on any
    // page, so this adds a guard and no noise.
    const hits = [".", "ai-bridge", "tools/ship", "tools/roundhouse", "tools/bench", "ui", "render", "physics"]
        .flatMap((d) => scan(path.join(process.cwd(), d)))
        .filter((r) => !KNOWN.some(([f, m]) => f === r.file && m === r.module));
    check(`no builtin used without being imported (${hits.length} unexplained)`, hits.length === 0,
          hits.map((r) => r.file + ":" + r.module).join(", "));
} catch (e) {
    check("unbound-builtin scan could run", false, String((e && e.message) || e));
}

// 1e. LAUNCHERS, v2989. A batch file has no compiler and no test, so a launcher bug is invisible until someone
// double-clicks it and nothing happens. launcherLint has existed since v2909 and RAN NOWHERE -- it was one of
// the four orphaned utilities the graveyard census flagged as actionable at v2988. It costs 28ms. There was
// never a reason for it to be outside the ship gate; it just never got put in one.
try {
    const { lintAll, lintLines } = await import("./launcherLint.mjs");
    const reports = lintAll([process.cwd()]);   // verify.mjs runs from the engine dir, like every other check here
    const bad = reports.filter((r) => r.findings && r.findings.length);
    check(`launchers: ${reports.length} scanned, ${bad.length} with stranded launches`, bad.length === 0,
          bad.length ? bad.map((r) => r.file).join(", ") + " -- code after a blocking pause never runs, and nothing else in this tree would notice"
                     : "");
} catch (e) {
    check("launcher lint could run at all", false, String((e && e.message) || e));
}

// 1c. the physics facade must actually be interchangeable. v2450 -- Jolt was missing bodyCount(), which box3d had and
// the pages called every frame; on Jolt it threw out of the frame loop before the requestAnimationFrame at the bottom
// and silently froze the page for good. The facade promised parity and nothing checked the promise.
try {
  const { check: parity } = await import("./backendParity.mjs");
  const r = parity(process.cwd());
  check(`physics backend parity: ${r.gaps.length ? r.gaps.map(g => g.page + " calls world." + g.method + "()").join("; ") : "every world method the pages call exists on BOTH backends"}`,
        r.gaps.length === 0, r.gaps.length ? "a page will silently freeze on the backend that lacks it" : "");
} catch (e) { check("physics backend parity", false, "parity check failed to run: " + e.message); }

// 1d. THE PHYSICS MUST STILL AGREE WITH MATHEMATICS. v2455 -- twelve rounds of verification against exact analytic
// answers (a channel to 0.07%, cs exact to five decimals, a shock compressing by exactly six, Rayleigh's 1708) lived
// only in changelogs, and nothing re-checked any of it. One edited constant in lbm2d.js and the channel quietly stops
// being a parabola, with the first sign of trouble being a future round built on sand. These re-run every ship.
try {
  const { runSuite } = await import("./physicsSuite.mjs");
  const r = runSuite();
  for (const c of r.rows) check("physics — " + c.name, c.pass, c.err ? "THREW: " + c.err : (c.detail || (c.got.toExponential(2) + " " + c.unit)) + (c.pass ? "" : "  — the fluid no longer agrees with the exact answer"));
} catch (e) { check("physics suite", false, "suite failed to run: " + e.message); }

// 1e. THE RIGID-BODY PHYSICS MUST AGREE WITH MATHEMATICS TOO. v2463 -- the fluids have been checked against exact
// answers on every ship since v2455; the rigid-body physics, which the ES flight substrate and cross-peer lockstep
// actually run on, had only ever been checked with "it did not explode". Jolt resolves from the VENDORED copy at
// vendor/jolt/jolt-physics.wasm-compat.js, which ships inside the zip, so this gate works on a fresh clone with no
// npm install at all -- verified by hiding node_modules and watching it still pass. It skips gracefully anyway,
// because a gate that blocks a clone from shipping is a broken gate rather than a strict one.
try {
  const { runRigidSuite } = await import("./rigidSuite.mjs");
  let mk = null;
  try { const j = await import("../../physics/jolt/joltLoader.js"); mk = () => j.createJoltBackend(); } catch { mk = null; }
  if (!mk) { console.log("[verify] SKIP  rigid physics — jolt could not be loaded (expected at vendor/jolt/jolt-physics.wasm-compat.js, or the jolt-physics package)"); }
  else {
    const r = await runRigidSuite(mk);
    for (const c of r.rows) check("rigid — " + c.name, c.pass, c.err ? "THREW: " + c.err : (c.detail || c.got) + (c.pass ? "" : "  — the physics no longer agrees with the exact answer"));
  }
} catch (e) { console.log("[verify] SKIP  rigid physics — " + e.message.slice(0, 90)); }

// The brain's learned weights must survive a restart -- and that claim can ONLY be settled by a second process,
// because reading them back in this one tests the cache and not the disk. It runs against a temp BRAIN_STATE_DIR,
// so it can never touch the real weights on the rig. Gated from v2488, when the "node brain/blobTrainer.mjs --save"
// the file had been advertising since it was written turned out not to exist: no entry point, silent exit 0.
// v2493 -- the lockstep selfchecks EXISTED and were never gated, so they ran when someone remembered. That is how
// a protocol that dies at 2% packet loss shipped for 200 versions: the tests that would have caught it were sound,
// present, and optional. Every check that is not in the gate is a check that is not being run.
for (const [file, label] of [
  ["physics/box3d-lockstep-selfcheck.mjs", "lockstep session"],
  ["physics/box3d-lockstep-net-selfcheck.mjs", "lockstep transport"],
  ["physics/box3d-lockstep-loss-selfcheck.mjs", "lockstep on a hostile wire"],
]) {
  try {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync(process.execPath, [file], { encoding: "utf8", timeout: 180000 });
    const m = out.match(/(\d+)\/(\d+) (?:passed|pass)/);
    check("net — " + label, !!m && m[1] === m[2], m ? m[1] + "/" + m[2] : "no result");
  } catch (e) {
    const out = String(e.stdout || "");
    const m = out.match(/(\d+)\/(\d+) (?:passed|pass)/);
    if (m) check("net — " + label, false, m[1] + "/" + m[2] + " — " + (out.match(/FAIL.*/) || [""])[0].slice(0, 90));
    // *** v3201: THIS ELSE WAS THE BLOB-POLICY BUG THREE MORE TIMES. *** A parseable failure failed; a gate that
    // COULD NOT RUN AT ALL printed SKIP and verify went green -- and "could not run" is what a deleted
    // dependency, a syntax error or a timeout all look like. NEVER RUN IS DISTINCT FROM PASS. Four sites shared
    // this shape and v2496 fixed one of them halfway.
    else check("net — " + label, false, "COULD NOT RUN: " + String(e.message).slice(0, 90));
  }
}

// v2505 -- DO THE PAGES PARSE? Every other check in this gate tests a MODULE. Nothing had ever opened a PAGE, so
// 228 pages carrying 344 inline scripts and 2.5 MB of JavaScript shipped on the strength of nobody clicking them.
// It cost us three times in a fortnight, all caught by hand: v2492's button one-liner crashed and SHIPPED PAST THIS
// GATE; v2504's `loadRepos && loadRepos()` where loadRepos never existed; and blobulator.html, which this check
// found DEAD ON ARRIVAL SINCE v2438 -- a duplicate `fireRamp` left behind when an import was added to replace it.
// A duplicate declaration is a parse error, so the module never ran, for ~67 versions, unnoticed.
//
// The flag is not optional: SourceTextModule needs it, and the check REFUSES to approximate rather than emit false
// failures (it exits 2 without it). So pass it here -- a check that cannot run is not a check.
// v2541 -- THE CLAIMS GATE. Everything else in this file judges THE BUILD: does it parse, do the selfchecks
// pass, is the version stamped, is the zip clean. Not one of them asks whether the round was WORTH SHIPPING.
// v2536 shipped GREEN with a spatial grid that was a 2.5x PESSIMISATION at the size the flesh actually runs --
// every gate agreed, because every gate was asked a question the grid answered correctly.
//
// loop-js/loop.js names the missing piece: a Round is Execute -> Handoff -> VERIFY, where Verify is a SEPARATE,
// SKEPTICAL JUDGE ruling on whether the GOAL was met. Theirs is an agent. Ours cannot be. But predictions.html
// already writes the claims down WITH the condition that would kill each one -- it was a judge that was never
// wired into the gate, and A CHECK NOT IN THE GATE IS NOT BEING RUN.
//
// This does not judge whether a claim is TRUE (nothing deterministic can). It judges whether the claim is the
// kind of thing that could ever be found WRONG. A CONTROL THAT CANNOT FAIL IS DECORATION.
try {
  const { execFileSync } = await import("node:child_process");
  const out = execFileSync(process.execPath, ["tools/ship/claimsGate.mjs", "--file", "predictions.html"],
                           { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "ignore"] });
  const m = out.match(/claimsGate: (\d+) claims \(([^)]+)\), every one falsifiable/);
  check("every claim the engine makes could be proven wrong", !!m, m ? m[1] + " claims: " + m[2] : out.trim().slice(0, 70));
} catch (e) {
  // exits 1 on an unfalsifiable claim, on a verdict with no evidence, AND on parsing zero claims -- because a
  // claims gate that silently finds nothing to check is theatre with a green light on it.
  const out = String((e && e.stdout) || "");
  const n = out.match(/(\d+) PROBLEMS/);
  const first = out.split("\n").filter((l) => l.startsWith("      "))[0];
  check("every claim the engine makes could be proven wrong", false,
        n ? n[1] + " problem(s), first: " + (first || "?").trim().slice(0, 58)
          : "claimsGate could not run: " + String(e.message).slice(0, 55));
}

try {
  const { execFileSync } = await import("node:child_process");
  const out = execFileSync(process.execPath, ["--experimental-vm-modules", "tools/ship/pageParse.mjs"],
                           { encoding: "utf8", timeout: 180000, stdio: ["ignore", "pipe", "ignore"] });
  const m = out.match(/pageParse: (\d+) inline scripts in (\d+) pages parse/);
  check("every page's inline JavaScript parses", !!m, m ? m[1] + " scripts in " + m[2] + " pages" : "no result");
} catch (e) {
  // execFileSync THROWS on a non-zero exit, and pageParse exits 1 when a page is broken and 2 when it cannot run.
  // Both must FAIL the gate. A catch that says "skip" is how the blob-policy check spent eight versions unable to
  // fail -- see the note below it.
  const out = String((e && e.stdout) || "");
  const fails = out.match(/(\d+) of \d+ inline scripts DO NOT PARSE/);
  const first = out.match(/FAIL {2}(\S+)/);
  check("every page's inline JavaScript parses", false,
        fails ? fails[1] + " page(s) do not parse, first: " + (first ? first[1] : "?")
              : "pageParse could not run: " + String(e.message).slice(0, 60));
}

try {
  const { execFileSync } = await import("node:child_process");
  const out = execFileSync(process.execPath, ["brain/blob-policy-selfcheck.mjs"], { encoding: "utf8", timeout: 120000 });
  const m = out.match(/\[blob-policy\] (\d+)\/(\d+) pass/);
  check("brain — a trained policy survives a restart", !!m && m[1] === m[2], m ? m[1] + "/" + m[2] : "no result");
} catch (e) {
  // v2496: THIS CATCH USED TO SAY "SKIP" AND NOTHING ELSE, WHICH MADE THE CHECK UNABLE TO FAIL.
  //
  // execFileSync THROWS when the child exits non-zero, and blob-policy-selfcheck exits 1 when it fails. So the two
  // outcomes were PASS and SILENTLY SKIP: a real failure landed here, printed a line nobody reads, and the gate
  // went GREEN. Every ship since v2488 has been running a control that could not fail -- the exact thing this
  // engine's suite exists to shout about, sitting inside the gate itself.
  //
  // Found by a mutation: breaking the policy store's refusal made blob-policy-selfcheck report 6/7 FAIL, and the
  // gate stayed green and called the mutation a survivor. The check was fine. The plumbing swallowed it.
  //
  // (And it is my own pattern, three feet away: v2493's lockstep checks read e.stdout and report a real FAIL. I
  // wrote that, then left this one alone.)
  const out = String(e.stdout || "") + String(e.stderr || "");
  const m = out.match(/\[blob-policy\] (\d+)\/(\d+) pass/);
  if (m) {
    const bad = (out.match(/FAIL\s+(.*)/) || ["", ""])[1].slice(0, 80);
    check("brain — a trained policy survives a restart", false, m[1] + "/" + m[2] + " — " + bad);
  } else {
    // *** v3201: THIS ELSE WAS THE SAME BUG v2496 THOUGHT IT HAD FIXED. ***
    //
    // v2496 made a PARSEABLE failure fail. It left the UNPARSEABLE case printing SKIP -- and "could not run" is
    // exactly what a DELETED DEPENDENCY causes: the gate crashes with ERR_MODULE_NOT_FOUND before it can print
    // any "[blob-policy] N/M pass" line, so m is null and this branch ran. brain/blobAutoTrain.mjs was deleted
    // by the v3159 orphan sweep and THIS CHECK SKIPPED FOR FORTY-ONE VERSIONS while every build said ALL GREEN.
    //
    // NEVER RUN IS DISTINCT FROM PASS -- this project's oldest law, and the note above already said "Both must
    // FAIL the gate" about pageParse THREE FEET UP, whose catch calls check(false) unconditionally and is
    // correct. TWO CATCHES, ONE AUTHOR, DIFFERENT BEHAVIOUR, AND ONLY ONE OF THEM WORKED.
    check("brain — a trained policy survives a restart", false,
          "COULD NOT RUN: " + String(e.message).slice(0, 90));
  }
}

// 1f. THE VERIFICATION PAGE MUST NOT FALL BEHIND THE GATE. v2465 -- physics-verified.html claims to re-earn, live,
// every number this gate checks. It quietly stopped being true the moment rigidSuite.mjs was added in v2463: the gate
// ran 14 checks and the page ran 10, for two whole versions, while still saying "the physics, re-earned in your
// browser". The page iterates whatever CHECKS a suite exports, so new CHECKS are picked up for free -- but a whole new
// SUITE has to be imported by hand, and that is exactly what got missed. So: every *Suite.mjs here must appear in the
// page. A page that shows some of what is verified, while implying it shows all of it, is an advertisement.
try {
  const suiteDir = path.join(process.cwd(), "tools", "ship");   // verify runs from WebGLEngine, as SHIP.md requires
  const suites = fs.readdirSync(suiteDir).filter(f => /Suite\.mjs$/.test(f));
  const pagePath = path.join(process.cwd(), "physics-verified.html");
  const page = fs.readFileSync(pagePath, "utf8");
  for (const s of suites) check("verification page runs " + s, page.includes(s), page.includes(s) ? "imported" : "THE GATE RUNS IT AND THE PAGE DOES NOT — the page is claiming more than it shows");
} catch (e) { check("verification page covers every suite", false, e.message.slice(0, 90)); }

// 2. no nested EngineProject_v* directories anywhere in the tree
let nested = [];
(function walk(dir, depth) {
  if (depth > 6) return;
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (!e.isDirectory()) continue;
    if (e.name === "node_modules" || e.name === "asset_library" || e.name === ".git") continue;
    // v2871 -- BOTH names. This guard only knew the legacy one, so a nested SweK_Engine_vNNNN copy -- the name
    // every build has actually used for over a hundred versions -- would have sailed straight through it.
    if (/^(?:SweK_Engine|EngineProject)_v\d+$/.test(e.name)) nested.push(path.join(dir, e.name));
    walk(path.join(dir, e.name), depth + 1);
  }
})(".", 0);
check("no nested EngineProject_v* forks in the tree", nested.length === 0, nested.length ? nested.join(", ") : "");

// 3. syntax: tools/check.mjs must report OK
try {
  const out = execSync("node tools/check.mjs", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  check("tools/check.mjs syntax", /syntax OK/.test(out), (out.match(/syntax OK.*/) || [""])[0]);
} catch (e) {
  check("tools/check.mjs syntax", false, "check.mjs failed / reported errors");
}

// 3b. bun surface: the cell manager (brain/esPilot.mjs + its tree) must stay clean for `bun build --compile`
try {
  const out = execSync("node tools/ship/bun-audit.mjs", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  check("bun surface (cell manager stays exe-compilable)", /bun surface OK/.test(out), (out.match(/bun surface OK.*/) || [""])[0]);
} catch (e) {
  check("bun surface (cell manager stays exe-compilable)", false, "bun-audit found a Bun-hostile call in the cell-manager tree");
}

// 4. HTML div balance == 0 for every *.html at root
let imbalanced = [];
for (const f of fs.readdirSync(".").filter(n => n.endsWith(".html"))) {
  const c = fs.readFileSync(f, "utf8");
  const open = (c.match(/<div[\s>]/g) || []).length;
  const close = (c.match(/<\/div>/g) || []).length;
  if (open !== close) imbalanced.push(`${f} (${open}/${close})`);
}
check("HTML <div> balance (root pages)", imbalanced.length === 0, imbalanced.join(", "));

// 5. changelog files non-empty (the blanking guard). They live at the PROJECT ROOT (parent of WebGLEngine).
function findAtRoot(name) {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) { const p = path.join(dir, name); if (fs.existsSync(p)) return p; const up = path.dirname(dir); if (up === dir) break; dir = up; }
  return name;
}
for (const f of ["BACKLOG.md", "TODO.md"]) {
  const p = findAtRoot(f);
  let sz = -1; try { sz = fs.statSync(p).size; } catch {}
  check(`${f} present + non-empty`, sz > 0, sz <= 0 ? "MISSING OR BLANK" : `${sz} bytes`);
}

// v2210 -- `.py` and `.txt` are searched too. cell-tracking/ is Python, and a gate that cannot see half the
// tree is a gate that teaches you to put your markers where it can look rather than where they belong.
// 6. optional feature markers present somewhere in the tree (search code + docs, from the project root
// so markers in root-level files like SESSION_START.md are found too).
const rootDir = (function () { let d = process.cwd(); for (let i = 0; i < 5; i++) { if (fs.existsSync(path.join(d, "BACKLOG.md"))) return d; const up = path.dirname(d); if (up === d) break; d = up; } return "."; })();
for (const m of markers) {
  let hit = false;
  // v2204 -- `-F`. Without it a marker is a regex, so `iterCap: W * H` means "W, zero or more spaces" and a
  // marker that is present in the tree fails the gate. A gate that fires on a marker's punctuation is a gate
  // that teaches you to weaken your markers.
  try { execSync(`grep -rFIl ${JSON.stringify(m)} ${JSON.stringify(rootDir)} --include=*.js --include=*.html --include=*.mjs --include=*.md --include=*.json --include=*.py --include=*.txt --include=*.sh --include=*.bat --include=*.command`, { stdio: "ignore" }); hit = true; } catch { hit = false; }
  check(`feature marker present: ${JSON.stringify(m)}`, hit);
}

// 7. optional: verify a built zip's contents (version marker inside + no nested fork + size sanity)
if (zipPath) {
  try {
    const list = execSync(`unzip -l ${JSON.stringify(zipPath)}`, { encoding: "utf8" });
    const P = "(?:SweK_Engine|EngineProject)";
    const nestedInZip = new RegExp(P + "_v\\d+\\/WebGLEngine\\/.*" + P + "_v\\d+\\/").test(list) ||
        (list.match(new RegExp(P + "_v\\d+\\/", "g")) ? new Set(list.match(new RegExp(P + "_v\\d+", "g"))).size > 1 : false);
    check("zip: single project root (no nested fork inside)", !nestedInZip);
    const sz = fs.statSync(zipPath).size;
    check("zip: size in sane band (1-40 MB)", sz > 1e6 && sz < 40e6, `${(sz / 1e6).toFixed(1)} MB`);
  } catch (e) {
    check("zip inspection", false, e.message);
  }
}

// 8. QA GATE: the headless invariant suite (physics no-clip/finite/settle, shader shadows bit-identical to CPU,
// vortex dipole) must all pass -- a regression that breaks physics or drifts a shader from its verified reference
// cannot reach a release. Opt out only with --skip-qa (don't).
if (process.argv.indexOf("--skip-qa") < 0) {
  try {
    const { runQA } = await import("./qa-suite.mjs");
    const { results } = await runQA();
    for (const r of results) check(`qa \u2014 ${r.name}`, r.ok, r.detail);
  } catch (e) { check("qa suite ran", false, e.message); }
} else { check("qa suite (SKIPPED via --skip-qa)", true, "skipped"); }

console.log(`\n[verify] ${fails === 0 ? "ALL GREEN — safe to present_files" : fails + " FAILURE(S) — DO NOT SHIP"}`);
process.exit(fails === 0 ? 0 : 1);
