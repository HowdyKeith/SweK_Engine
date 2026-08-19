// tools/smoke-report.mjs -- v57, scenarios v58: runs the REAL
// brain/report.js under a Deno shim. Two scenarios now -- the negative
// case is half a test suite:
//   A) mixed dom diary  -> BOTH dialect charts render, legacy lifts to rc
//   B) EMPTY diary      -> charts VANISH (no headers), html still builds
//   C) CORRUPT diary    -> parse throws inside the try, charts vanish,
//                          html still builds (hostile input, v59)
//   D) UNKNOWN dom      -> a "tank" dom gets its OWN chart after the
//                          known two -- stated bucketing, no silent
//                          vanishing (forward-compat, v60)
//   E) ALL-NULL tHp     -> hp line suppresses, tDur still draws --
//                          the half-empty case (v61)
//   F) PER-DOM corrupt  -> one dom missing tDur entirely: the healthy
//                          dom untouched, the sick one draws what it
//                          has (v62)
//
// Shim lessons, earned one crash at a time (v56):
//   1. import with a repo-relative path resolved from THIS file
//   2. the snapshots-dir guard uses ASYNC Deno.readDir (for await)
//   3. the final write is ASYNC Deno.writeTextFile, not the Sync twin
//   4. unshimmed files must THROW (charts catch{} -> "") -- returning
//      "" would silently feed charts garbage
//   5. (v58) ESM caches imports -- bust with a ?scenario= query or the
//      second run silently replays the first
// Usage: node tools/smoke-report.mjs   (exit 0 = both green)
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
const here = dirname(fileURLToPath(import.meta.url));
const reportUrl = pathToFileURL(join(here, "../brain/report.js")).href;

async function runScenario(name, diaryJson) {
  const captured = {};
  globalThis.Deno = {
    env: { get: () => undefined },
    readTextFileSync: (path) => {
      if (String(path).endsWith("diff_ab_history.json")) return diaryJson;
      throw new Error("no file: " + path);   // lesson 4
    },
    readTextFile: async (p) => globalThis.Deno.readTextFileSync(p),
    writeTextFileSync: (p, d) => { captured[String(p)] = d; },
    writeTextFile: async (p, d) => { captured[String(p)] = d; },   // lesson 3
    statSync: () => { throw new Error("no stat"); },
    readDirSync: () => [],
    readDir: async function* () {},                                 // lesson 2
    exit: (c) => { throw new Error("Deno.exit(" + c + ")"); },
  };
  try { await import(reportUrl + "?scenario=" + encodeURIComponent(name)); }   // lessons 1+5
  catch (e) { console.log(`[${name}] top-level threw:`, e.message); }
  return Object.entries(captured).find(([k]) => k.endsWith(".html"))?.[1] ?? "";
}

// A) mixed diary
const htmlA = await runScenario("mixed", JSON.stringify([
  { ts: 1, tDur: 1.1, tHp: null, nDur: 20, nHp: 0 },                       // legacy untagged -> rc
  { ts: 2, tDur: 1.8, tHp: 0.4, nDur: 24, nHp: 12, dom: "raycaster" },
  { ts: 3, tDur: -0.6, tHp: 2.5, nDur: 18, nHp: 14, dom: "dungeon" },
  { ts: 4, tDur: -1.1, tHp: 2.6, nDur: 22, nHp: 18, dom: "dungeon" },
]));
const okA = htmlA.includes("-- raycaster") && htmlA.includes("-- dungeon") &&
            htmlA.indexOf("-- raycaster") < htmlA.indexOf("-- dungeon");
console.log("[mixed]", htmlA.length, "bytes | rc:", htmlA.includes("-- raycaster"),
            "| dgn:", htmlA.includes("-- dungeon"), "| order:", okA);
// v60 -- console twin assertions: the report embeds the experiment
// console's TWIN table (same rows, same groups, offline runtime). The
// live route itself is NOT smokeable here -- see smoke-console.sh's
// header for the forensic why -- but the shared logic is, so it is.
const okTwin = htmlA.includes("The experiment console") &&
               htmlA.includes("engine (kaiju / dungeon / raycaster)") &&
               htmlA.includes("escape velocity") &&
               htmlA.includes("Evidence as of");
console.log("[mixed] console twin: table", htmlA.includes("The experiment console"),
            "| both group bands:", htmlA.includes("escape velocity") && htmlA.includes("engine (kaiju / dungeon / raycaster)"),
            "| as-of column (the v46 repair):", htmlA.includes("Evidence as of"));

// B) empty diary -- charts must vanish, not crash
const htmlB = await runScenario("empty", "[]");
const okB = htmlB.length > 0 && !htmlB.includes("-- raycaster") && !htmlB.includes("-- dungeon");
console.log("[empty]", htmlB.length, "bytes | rc absent:", !htmlB.includes("-- raycaster"),
            "| dgn absent:", !htmlB.includes("-- dungeon"), "| html still built:", htmlB.length > 0);

// C) corrupt diary (scenario C, v59) -- truncated JSON: the read
// succeeds, JSON.parse THROWS inside the chart's try, the catch eats
// it, the charts vanish, the html builds. Hostile input is the other
// half of the negative case.
const htmlC = await runScenario("corrupt", '[{"ts":1,"tDur":1.1,"nDu');
const okC = htmlC.length > 0 && !htmlC.includes("-- raycaster") && !htmlC.includes("-- dungeon");
console.log("[corrupt]", htmlC.length, "bytes | charts absent:", !htmlC.includes("-- raycaster") && !htmlC.includes("-- dungeon"),
            "| html still built:", htmlC.length > 0);

// D) unknown dom (scenario D, v60) -- forward-compat: a "tank" dom
// must get its OWN chart after the known two, not vanish into rc.
const htmlD = await runScenario("unknown-dom", JSON.stringify([
  { ts: 1, tDur: 1.0, tHp: null, nDur: 20, nHp: 0, dom: "raycaster" },
  { ts: 2, tDur: 1.2, tHp: null, nDur: 22, nHp: 0, dom: "raycaster" },
  { ts: 3, tDur: 2.0, tHp: 0.5, nDur: 15, nHp: 10, dom: "tank" },
  { ts: 4, tDur: 2.2, tHp: 0.7, nDur: 17, nHp: 12, dom: "tank" },
]));
const okD = htmlD.includes("-- tank") && htmlD.indexOf("-- raycaster") < htmlD.indexOf("-- tank");
console.log("[unknown-dom]", htmlD.length, "bytes | tank chart:", htmlD.includes("-- tank"),
            "| after the known:", okD);

// E) all-null tHp (scenario E, v61) -- the half-empty case between B
// and D: the hp line must SUPPRESS while tDur still draws. Titles
// carry the key names, so their presence/absence is the assertion.
const htmlE = await runScenario("null-hp", JSON.stringify([
  { ts: 1, tDur: 1.0, tHp: null, nDur: 20, nHp: 0, dom: "raycaster" },
  { ts: 2, tDur: 1.4, tHp: null, nDur: 22, nHp: 0, dom: "raycaster" },
  { ts: 3, tDur: 1.9, tHp: null, nDur: 25, nHp: 0, dom: "raycaster" },
]));
const okE = htmlE.includes("-- raycaster") && htmlE.includes("tDur (latest") && !htmlE.includes("tHp (latest");
console.log("[null-hp]", htmlE.length, "bytes | chart renders:", htmlE.includes("-- raycaster"),
            "| tDur draws:", htmlE.includes("tDur (latest"), "| tHp suppressed:", !htmlE.includes("tHp (latest"));

// F) per-dom corruption (scenario F, v62) -- one healthy dom beside
// one whose entries lack tDur entirely: the healthy chart must be
// untouched, and the corrupt dom's chart draws what exists (tHp) and
// suppresses what does not. Resilience per DOM, not just per file.
const htmlF = await runScenario("dom-corrupt", JSON.stringify([
  { ts: 1, tDur: 1.0, tHp: null, nDur: 20, nHp: 0, dom: "raycaster" },
  { ts: 2, tDur: 1.5, tHp: null, nDur: 22, nHp: 0, dom: "raycaster" },
  { ts: 3, tHp: 0.5, nHp: 10, dom: "tank" },
  { ts: 4, tHp: 0.8, nHp: 12, dom: "tank" },
]));
const tankIdx = htmlF.indexOf("-- tank");
const tankSlice = tankIdx > -1 ? htmlF.slice(tankIdx) : "";
const rcSlice = htmlF.slice(htmlF.indexOf("-- raycaster"), tankIdx > -1 ? tankIdx : undefined);
const okF = htmlF.includes("-- raycaster") && htmlF.includes("-- tank") &&
            rcSlice.includes("tDur (latest") &&
            !tankSlice.includes("tDur (latest") && tankSlice.includes("tHp (latest");
console.log("[dom-corrupt]", htmlF.length, "bytes | rc healthy (tDur draws):", rcSlice.includes("tDur (latest"),
            "| tank draws tHp only:", tankSlice.includes("tHp (latest") && !tankSlice.includes("tDur (latest"));

// v71 -- DECIDED: this ledger does NOT get the lint's snapshot-diff
// loop. The self-check below is binary and runs on EVERY smoke -- it
// cannot drift silently between snapshots, which is the only disease
// the snapshot loop cures. The lint earned the loop because prose
// contracts accumulate would-REDs across proposed edits; this ledger
// has exactly one failure mode, already gated at every run. Machinery
// with no new information is weight, not safety.
// v63 -- the LEDGER ASSERTS ITSELF: header scenario lines vs actual
// runScenario calls, counted from this file's own source. A mismatch
// means someone added a scenario without its ledger line (or the
// reverse) -- the header is documentation that can rot, so it checks.
{
  const fsL = await import("fs");
  const src = fsL.readFileSync(fileURLToPath(import.meta.url), "utf-8");
  const headerN = (src.match(/^\/\/   [A-Z]\) /gm) || []).length;
  const callN = (src.match(/await runScenario\(/g) || []).length;
  console.log(`[ledger] header lines: ${headerN} | runScenario calls: ${callN} | matched: ${headerN === callN}`);
  if (headerN !== callN) { console.error("SMOKE RED: scenario ledger out of sync with the code"); process.exit(1); }
}
if (!okA || !okTwin || !okB || !okC || !okD || !okE || !okF) { console.error("SMOKE RED"); process.exit(1); }
console.log("SMOKE GREEN x6: data renders, halves render halfway, corruption stays in its lane, garbage never crashes");
