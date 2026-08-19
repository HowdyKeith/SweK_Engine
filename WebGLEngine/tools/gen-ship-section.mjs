// tools/gen-ship-section.mjs -- v68: closes the quote-don't-paraphrase
// loop. Runs verify-all --manifest and wraps the JSON into a markdown
// section for SHIP.md. The rig's generator appends it with ONE line:
//     execSync("node tools/gen-ship-section.mjs >> SHIP.md");
// The commands in the output are QUOTED from the manifest -- if the
// steps change, the next ship's SHIP.md changes with them, and no
// human paraphrase sits in between to rot.
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(execSync(`node "${join(here, "verify-all.mjs")}" --manifest`, { encoding: "utf-8" }));
const MARK = "## Verify steps (quoted from the manifest";
let out = MARK + ", " + new Date().toISOString().slice(0, 16).replace("T", " ") + ")\n\n";
out += "One entry point: `node tools/verify-all.mjs --quiet`. Its steps, quoted:\n\n";
for (const { name, cmd } of manifest) out += "- **" + name + "**: `" + cmd + "`\n";
out += "\nTiming history rings in `tools/verify_timing.json`; a step past its median-multiple warns even when green.\n";
// v73 -- the dashboard line: quote the LAST ship's timing. VOLATILE by
// nature -- it changes every ship -- so --check EXCLUDES it (below);
// freshness is about the commands, the pulse is about the moment.
try {
  const fsP = await import("fs");
  const ring = JSON.parse(fsP.readFileSync(join(here, "verify_timing.json"), "utf-8"));
  const last = ring[ring.length - 1];
  // v74 -- the streak clause rides the same volatile line, so the
  // --check scrub covers it for free (one prefix, one rule)
  let gs = 0;
  for (let i = ring.length - 1; i >= 0 && ring[i].green !== false; i--) gs++;
  if (last) out += "\nLast ship: " + (last.green === false ? "RED" : "green") + ", " +
    Object.entries(last.steps || {}).map(([k, v]) => k + " " + v + "s").join(" | ") +
    " -- streak " + gs + " green\n";
} catch {}

// v69 -- --write FILE: IDEMPOTENT BY CONSTRUCTION. `>>` appends a
// duplicate on the second run; --write finds its own section (by the
// MARK header) and REPLACES it up to the next "## " or EOF, appending
// only when absent. stdout mode stays for piping.
// v70 -- --check FILE: the quote can rot too. Compares the section
// BODY in FILE (everything after the dated MARK line, up to the next
// "## ") against a freshly generated body -- the timestamp line is
// excluded on purpose, dates always differ and staleness is about the
// COMMANDS. Exit 1 stale-or-missing, 0 fresh; CI-shaped.
const ci = process.argv.indexOf("--check");
if (ci > -1 && process.argv[ci + 1]) {
  const fs = await import("fs");
  const target = process.argv[ci + 1];
  let doc = ""; try { doc = fs.readFileSync(target, "utf-8"); } catch {}
  const at = doc.indexOf(MARK);
  const freshBody = out.slice(out.indexOf("\n") + 1);
  if (at === -1) { console.error(`[gen-ship-section] STALE: no manifest section in ${target}`); process.exit(1); }
  const next = doc.indexOf("\n## ", at + MARK.length);
  const haveBody = doc.slice(doc.indexOf("\n", at) + 1, next === -1 ? undefined : next + 1);
  // v73 -- the "Last ship:" line is volatile BY DESIGN; comparing it
  // would make every ship stale the moment it lands. Freshness is
  // about the COMMANDS -- both sides drop the pulse line first.
  const scrub = (s) => s.split("\n").filter(l => !l.startsWith("Last ship:")).join("\n").trim();
  if (scrub(haveBody) !== scrub(freshBody)) { console.error(`[gen-ship-section] STALE: ${target}'s quoted section differs from the live manifest -- rerun --write`); process.exit(1); }
  console.log(`[gen-ship-section] FRESH: ${target} quotes the live manifest`);
  process.exit(0);
}
const wi = process.argv.indexOf("--write");
if (wi > -1 && process.argv[wi + 1]) {
  const fs = await import("fs");
  const target = process.argv[wi + 1];
  let doc = ""; try { doc = fs.readFileSync(target, "utf-8"); } catch {}
  const at = doc.indexOf(MARK);
  if (at === -1) {
    doc = (doc ? doc.replace(/\n*$/, "\n\n") : "") + out;
  } else {
    const next = doc.indexOf("\n## ", at + MARK.length);
    doc = doc.slice(0, at) + out + (next === -1 ? "" : doc.slice(next + 1));
  }
  fs.writeFileSync(target, doc);
  console.log(`[gen-ship-section] ${at === -1 ? "appended to" : "replaced in"} ${target}`);
} else {
  process.stdout.write(out);
}
